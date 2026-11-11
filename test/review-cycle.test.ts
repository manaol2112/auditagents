/** Independent review cycle with STUB transports (hand-written; not model output). */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import pg from "pg";
import * as approvals from "../src/approvals.js";
import { EngineError } from "../src/db.js";
import * as planning from "../src/planning.js";
import * as proposerModel from "../src/proposerModel.js";
import * as reviewerModel from "../src/reviewerModel.js";
import * as workflow from "../src/workflow.js";
import { shutdown } from "./helpers.js";
import { FINDINGS_CYCLE1, FINDINGS_NONE, PASS1, Stubs, build, endPools, revisedProposal } from "./review-fixtures.js";
import { STUB, clone } from "./stub.js";

export const refused = (p: Promise<unknown>) => assert.rejects(p, (e: any) => e instanceof EngineError);
const dbRefused = (p: Promise<unknown>) => assert.rejects(p, (e: any) => e.code === "23001");

after(async () => { await endPools(); await shutdown(); });

describe("review cycle", () => {
  it("the reviewer is blind in pass 1 and sees the plan only in pass 2", async () => {
    const db = await build();
    const st = new Stubs([FINDINGS_CYCLE1, FINDINGS_NONE]);
    await workflow.reviewCycle(db, "reviewer-agent", "NW-REV", st.transports());
    const p1 = st.seen.find(([k]) => k === "pass1")![1], p2 = st.seen.find(([k]) => k === "pass2")![1];
    assert.ok(!p1.includes("PLAN DIGEST"));
    assert.ok(p1.includes("[rcm L19]"));
    assert.ok(p2.includes("PLAN DIGEST"));
    assert.ok(p2.includes("ENGINE CANDIDATES"));
    assert.ok(p2.includes("omitted_control"));   // the engine diff found the Concur control missing before the model said so
    db.release();
  });

  it("findings are verified, stored immutably, and routed", async () => {
    const db = await build();
    const st = new Stubs([FINDINGS_CYCLE1, FINDINGS_NONE]);
    const out = await workflow.reviewCycle(db, "reviewer-agent", "NW-REV", st.transports());
    const notes = (await db.query("SELECT * FROM review_notes WHERE cycle = 1 ORDER BY id")).rows;
    const byCat = Object.fromEntries(notes.map((n) => [`${n.category}|${n.control_id}`, n]));
    assert.equal(byCat["weak_evidence|A-05"].status, "unverified");            // bad line kept, marked, not dropped
    assert.equal(byCat["omitted_procedure|ZZ-9"].verified, false);             // unknown control kept, marked
    assert.equal(byCat["omitted_control|(omitted control)"].status, "resolved");   // accepted by planner and demonstrably fixed
    assert.equal(byCat["unsupported_criterion|A-01"].status, "resolved");
    assert.equal(byCat["human_judgment_question|A-01"].status, "escalated");
    assert.equal(byCat["weak_evidence|A-01"].status, "open");                 // low significance: recorded, not actionable
    await dbRefused(db.query("UPDATE review_notes SET rationale = 'edited' WHERE id = $1", [notes[0].id]));
    await dbRefused(db.query("UPDATE reviews SET pass2 = '{}' WHERE id = 1"));
    assert.deepEqual(st.calls, { pass1: 1, pass2: 2, revision: 1 });
    assert.equal(out.final_plan_version, 2);
    const v2 = await planning.getPlan(db, "NW-REV");
    assert.equal(v2.revision_of, 1);
    assert.ok(v2.plan.controls.some((c: any) => c.ref === "A-13"));
    assert.equal(v2.plan.controls.find((c: any) => c.ref === "A-01").criteria_register.criteria["UAR-F"].status, "not defined by control");
    assert.equal((await db.query("SELECT status FROM plan_versions WHERE version = 1")).rows[0].status, "superseded");
    db.release();
  });

  it("escalation blocks approval until a human disposition", async () => {
    const db = await build();
    await workflow.reviewCycle(db, "reviewer-agent", "NW-REV", new Stubs([FINDINGS_CYCLE1, FINDINGS_NONE]).transports());
    const con = (await db.query("SELECT id FROM contradictions WHERE subject = 'removal_timeframe'")).rows[0];
    await approvals.resolveContradiction(db, "rj", "NW-REV", con.id, "rcm:19", "RCM governs");
    await planning.generatePlan(db, "planner-agent", "NW-REV", "model", proposerModel.modelProposals);
    // The new version has no review; re-run review (stub says nothing new) to carry the question forward.
    await workflow.reviewCycle(db, "reviewer-agent", "NW-REV", new Stubs([FINDINGS_CYCLE1, FINDINGS_NONE]).transports(), 1);
    const pv = await planning.getPlan(db, "NW-REV");
    const esc = await workflow.openEscalations(db, pv.id);
    assert.ok(esc.length);
    await refused(approvals.approvePlan(db, "rj", "NW-REV", "approve"));
    await refused(workflow.dispositionFinding(db, "reviewer-agent", esc[0].id, "dismiss", "agent may not"));
    for (const e of esc) await workflow.dispositionFinding(db, "rj", e.id, "accept", "reviewed; will address at walkthrough");
    await dbRefused(db.query("UPDATE review_notes SET status = 'open' WHERE id = $1", [esc[0].id]));
    assert.equal((await workflow.openEscalations(db, pv.id)).length, 0);
    db.release();
  });

  it("the cycle limit holds and the activity log records every step", async () => {
    const db = await build();
    const st = new Stubs([FINDINGS_CYCLE1, FINDINGS_CYCLE1, FINDINGS_CYCLE1]);
    const out = await workflow.reviewCycle(db, "reviewer-agent", "NW-REV", st.transports(), 2);
    assert.equal(out.cycles.length, 2);
    assert.equal(st.calls.revision, 1);     // one revision between two reviews, never more than max_cycles - 1
    assert.ok(out.escalated.length);        // findings repeated on the final draft go to the human
    const eng = (await db.query("SELECT id FROM engagements")).rows[0].id;
    const log = await workflow.activityLog(db, eng);
    const steps = log.map((r) => [r.task, r.step, r.actor, r.status].join("|"));
    assert.ok(steps[0].startsWith("independent_review|pass1_blind_assessment"));
    assert.ok(steps.includes("planning_revision|cycle1_targeted_revision|planner-agent|completed"));
    assert.equal(log[log.length - 1].step, "escalation");
    assert.ok(log.every((r) => r.status === "completed"));
    assert.ok(log.every((r) => r.input_refs !== null && r.output_refs !== null));
    db.release();
  });

  it("the reviewer cannot approve or change the plan", async () => {
    const db = await build();
    const before = (await planning.getPlan(db, "NW-REV")).content_hash;
    await workflow.reviewCycle(db, "reviewer-agent", "NW-REV", new Stubs([FINDINGS_NONE]).transports());
    assert.equal((await planning.getPlan(db, "NW-REV")).content_hash, before);   // no findings: plan untouched
    await refused(approvals.approvePlan(db, "reviewer-agent", "NW-REV", "approve"));
    db.release();
  });
});

describe("post-revision fix checks (acceptance by the planner is not a fix)", () => {
  async function run(revision: any, pass2First?: any): Promise<[pg.PoolClient, Record<string, any>]> {
    const db = await build();
    await workflow.reviewCycle(db, "reviewer-agent", "NW-REV", new Stubs([pass2First ?? FINDINGS_CYCLE1, FINDINGS_NONE], revision).transports());
    const notes: Record<string, any> = {};
    for (const n of (await db.query("SELECT * FROM review_notes WHERE cycle = 1")).rows) notes[`${n.category}|${n.control_id}|${n.code}`] = n;
    return [db, notes];
  }

  it("an accepted but unchanged revision leaves findings unresolved and escalated", async () => {
    const [db, notes] = await run(clone(STUB));   // planner "accepts" everything but returns the same proposal
    const omitted = notes["omitted_control|(omitted control)|"], unsupported = notes["unsupported_criterion|A-01|UAR-F"];
    for (const n of [omitted, unsupported]) {
      assert.equal(n.status, "escalated");
      assert.equal(n.planner_response.decision, "accepted");
      assert.equal(n.fix_check.fixed, false);
    }
    assert.ok(omitted.fix_check.basis.includes("no mapped control"));
    await refused(approvals.approvePlan(db, "rj", "NW-REV", "approve"));
    db.release();
  });

  it("demonstrable fixes are resolved with their basis", async () => {
    const [db, notes] = await run(revisedProposal());
    const omitted = notes["omitted_control|(omitted control)|"], unsupported = notes["unsupported_criterion|A-01|UAR-F"];
    assert.equal(omitted.status, "resolved");
    assert.ok(omitted.fix_check.basis.includes("A-13"));
    assert.equal(unsupported.status, "resolved");
    assert.ok(unsupported.fix_check.basis.includes("not defined by control"));
    db.release();
  });

  it("weak-evidence and overstated-contribution checks require a real change", async () => {
    const findings = clone(FINDINGS_NONE);
    findings.findings = [
      { control_id: "A-05", code: "PROV-B", category: "weak_evidence", significance: "high",
        source: { doc: "narrative", line: 13, quote: "Approver: requester's manager and the role owner" },
        rationale: "An export is not approval evidence.", suggested_action: "Request the ServiceNow approval records with approver identity and timestamp." },
      { control_id: "A-03", code: "CHG-DE5", category: "overstated_contribution", significance: "medium",
        source: { doc: "narrative", line: 28, quote: "two Basis staff also hold developer keys" },
        rationale: "Segregation is stated as full but two Basis staff also develop.", suggested_action: "Rate CHG-DE5 partial and add the overlap to the design assessment." },
    ];
    const [db1, notes1] = await run(clone(STUB), findings);   // revision that changes nothing: both stay unresolved
    assert.equal(notes1["weak_evidence|A-05|PROV-B"].fix_check.fixed, false);
    assert.equal(notes1["overstated_contribution|A-03|CHG-DE5"].fix_check.fixed, false);
    db1.release();
    const fixed = clone(STUB);   // revision that addresses both: evidence changed, contribution downgraded
    fixed.controls.find((c: any) => c.ref === "A-05").procedures[0].evidence_requests = ["ServiceNow REQ export with approver identity and approval timestamp", "Role owner list"];
    for (const x of fixed.controls.find((c: any) => c.ref === "A-03").contributions) if (x.expectation === "CHG-DE5") x.value = "partial";
    const [db2, notes2] = await run(fixed, findings);
    assert.equal(notes2["weak_evidence|A-05|PROV-B"].status, "resolved");
    assert.equal(notes2["overstated_contribution|A-03|CHG-DE5"].status, "resolved");
    assert.ok(notes2["overstated_contribution|A-03|CHG-DE5"].fix_check.basis.includes('now {"CM-CHG":"partial"'));
    db2.release();
  });

  it("the engine flags an overstated contribution from the reviewer's coverage ratings", async () => {
    const db = await build();
    const plan = (await planning.getPlan(db, "NW-REV")).plan;
    const [, docs] = await proposerModel.documentsText(db, 1);
    const assessment = clone(PASS1);
    assessment.controls[0].coverage = [{ expectation: "UAR-DE1", value: "partial", why: "service accounts are not mentioned", source: { doc: "rcm", line: 19 } }];
    const over = reviewerModel.engineDiff(assessment, plan, docs).filter((c) => c.category === "overstated_contribution");
    assert.equal(over.length, 1);
    assert.deepEqual([over[0].control_id, over[0].code], ["A-01", "UAR-DE1"]);
    db.release();
  });
});
