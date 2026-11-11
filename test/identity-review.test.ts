/** Stable control identity and actionable review output. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import pg from "pg";
import * as approvals from "../src/approvals.js";
import * as audit from "../src/audit.js";
import { EngineError, REPO_ROOT, j, now } from "../src/db.js";
import * as identity from "../src/identity.js";
import * as intake from "../src/intake.js";
import * as methodology from "../src/methodology.js";
import * as planning from "../src/planning.js";
import * as proposerModel from "../src/proposerModel.js";
import * as review from "../src/review.js";
import { checkout, freshDb, shutdown } from "./helpers.js";
import { STUB, clone } from "./stub.js";   // hand-written stub, not model output

const FX = join(REPO_ROOT, "fixtures", "northwind");

async function fresh(docsDir = FX): Promise<[pg.PoolClient, number]> {
  const pool = await freshDb();
  const db = await checkout(pool);
  await audit.addUser(db, "system", "rj", "approver");
  const cid = (await db.query("INSERT INTO clients (name, fiscal_year_end, time_zone) VALUES ($1,$2,$3) RETURNING id", ["Northwind Foods", "2026-12-31", "America/New_York"])).rows[0].id;
  for (const f of ["rcm.md", "narrative.md", "policy.md"]) await intake.ingestDocument(db, "planner-agent", cid, join(docsDir, f));
  return [db, cid];
}

const modelSnapshot = (db: pg.PoolClient, cid: number, proposal: any) =>
  proposerModel.extractWithModel(db, "planner-agent", cid, ["SAP ECC", "Concur"], async () => [clone(proposal), { model: "stub" }]);

async function engagement(db: pg.PoolClient, cid: number, snap: number, name: string) {
  const data = methodology.load();
  await db.query("INSERT INTO engagements (client_id, name, period_start, period_end, as_of, systems, methodology_version, methodology_hash, snapshot_id, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [cid, name, "2026-01-01", "2026-12-31", "2026-12-31", j(["SAP ECC", "Concur"]), data.version, data.document_hash, snap, "rj", now()]);
}

async function planModel(db: pg.PoolClient, name: string) {
  await planning.generatePlan(db, "planner-agent", name, "model", proposerModel.modelProposals);
  return (await planning.getPlan(db, name)).plan;
}

async function ids(db: pg.PoolClient, snap: number): Promise<Record<string, [string, string]>> {
  const out: Record<string, [string, string]> = {};
  for (const r of (await db.query("SELECT ref, control_id, identity_basis FROM controls WHERE snapshot_id = $1", [snap])).rows) out[r.ref] = [r.control_id, r.identity_basis];
  return out;
}

/** The model extractor uses the latest ingested document of each type; drop the older one. */
async function dropOldest(db: pg.PoolClient, cid: number, docType: string) {
  await db.query("DELETE FROM document_lines WHERE doc_id = (SELECT MIN(id) FROM documents WHERE doc_type=$1 AND client_id=$2)", [docType, cid]);
  await db.query("DELETE FROM documents WHERE id = (SELECT MIN(id) FROM documents WHERE doc_type=$1 AND client_id=$2)", [docType, cid]);
}

const refused = (p: Promise<unknown>) => assert.rejects(p, (e: any) => e instanceof EngineError);

after(async () => { await shutdown(); });

describe("identity", () => {
  it("client identifiers are used when present", async () => {
    const [db, cid] = await fresh();
    const snap = await intake.extract(db, "planner-agent", cid);
    const got = await ids(db, snap);
    assert.deepEqual(got["A-01"], ["A-01", "client"]);
    assert.deepEqual(got["A-05b"], ["A-05b", "client"]);
    assert.equal((await identity.pendingIssues(db, snap)).length, 0);
    db.release();
  });

  it("model relabelling does not change identity", async () => {
    const [db, cid] = await fresh();
    const snap1 = await modelSnapshot(db, cid, STUB);
    const relabelled = clone(STUB);
    for (const c of relabelled.controls) c.ref = "LHP-" + c.ref;   // model invents new labels
    const snap2 = await modelSnapshot(db, cid, relabelled);
    const a = await ids(db, snap1), b = await ids(db, snap2);
    assert.deepEqual(a["A-01"], ["A-01", "client"]);          // label on its cited line: client id
    assert.equal(b["LHP-A-01"][1], "provisional");           // new label not on the line: provisional...
    const pend = await identity.pendingIssues(db, snap2);
    assert.ok(pend.some((p) => p.issue_type === "proposed_match"));   // ...linked to A-01 only through a human decision
    assert.deepEqual(a["A-99"], b["LHP-A-99"]);               // provisional ids are stable while the text is unchanged
    assert.equal(a["A-99"][1], "provisional");
    db.release();
  });

  it("a provisional identity survives a line shift but not a text change", async () => {
    const dir = mkdtempSync(join(tmpdir(), "soxplan-docs-"));
    const docs = join(dir, "docs");
    mkdirSync(docs);
    for (const f of ["rcm.md", "narrative.md", "policy.md"]) writeFileSync(join(docs, f), readFileSync(join(FX, f)));
    const [db, cid] = await fresh(docs);
    const prop = clone(STUB);
    prop.controls = prop.controls.filter((c: any) => ["A-01", "A-05"].includes(c.ref));
    for (const c of prop.controls) c.ref = "X-" + c.ref;   // not a client identifier
    const snap1 = await modelSnapshot(db, cid, prop);
    const before = await ids(db, snap1);
    assert.ok(Object.values(before).every((v) => v[1] === "provisional"));
    // Revise the RCM: insert two lines above the controls table; line numbers shift by 3, words unchanged.
    const text = readFileSync(join(FX, "rcm.md"), "utf8").replace("## Controls", "Note added in revision 8.\nAnother note.\n\n## Controls");
    writeFileSync(join(docs, "rcm.md"), text);
    await intake.ingestDocument(db, "planner-agent", cid, join(docs, "rcm.md"));
    const shifted = clone(prop);
    for (const c of shifted.controls) {
      c.source.line_start += 3; c.source.line_end += 3;
      for (const k of c.criteria) if (k.source.doc === "rcm") k.source.line += 3;
      for (const con of c.contradictions) for (const sx of con.sources) if (sx.doc === "rcm") sx.line += 3;
    }
    await dropOldest(db, cid, "rcm");
    const snap2 = await modelSnapshot(db, cid, shifted);
    const afterIds = await ids(db, snap2);
    assert.deepEqual(before["X-A-01"], afterIds["X-A-01"]);   // same words, same id
    assert.deepEqual(await identity.pendingIssues(db, snap2), []);
    // Now change the control's own words.
    const changed = clone(shifted);
    changed.controls[0].description = "Business owners review SAP user access monthly using the SUIM listing.";
    writeFileSync(join(docs, "rcm.md"), text.replace("review SAP user access quarterly", "review SAP user access monthly"));
    await intake.ingestDocument(db, "planner-agent", cid, join(docs, "rcm.md"));
    await dropOldest(db, cid, "rcm");
    const snap3 = await modelSnapshot(db, cid, changed);
    const third = await ids(db, snap3);
    assert.notDeepEqual(afterIds["X-A-01"], third["X-A-01"]);
    const pend = await identity.pendingIssues(db, snap3);
    assert.deepEqual(pend.map((p) => p.issue_type), ["proposed_match"]);
    assert.equal(pend[0].prior_control_id, afterIds["X-A-01"][0]);
    db.release();
  });

  it("duplicate controls require human resolution", async () => {
    const [db, cid] = await fresh();
    const prop = clone(STUB);
    const dup = clone(prop.controls[0]);
    dup.ref = "A-01-again";
    prop.controls.push(dup);
    const snap = await modelSnapshot(db, cid, prop);
    const got = await ids(db, snap);
    assert.equal(got["A-01"][0], "A-01");
    assert.equal(got["A-01-again"][0], "A-01#2");
    await engagement(db, cid, snap, "NW-DUP");
    const p = await planModel(db, "NW-DUP");
    assert.ok(p.validation.some((f: any) => f.code === "V10"));
    await refused(approvals.approvePlan(db, "rj", "NW-DUP", "x"));
    const link = (await identity.pendingIssues(db, snap)).find((r) => r.issue_type === "duplicate");
    await refused(identity.resolve(db, "planner-agent", link.id, "merge", "agent may not"));
    await identity.resolve(db, "rj", link.id, "merge", "same control quoted twice");
    const p2 = await planModel(db, "NW-DUP");
    assert.deepEqual(p2.controls.filter((c: any) => c.control_id.startsWith("A-01")).map((c: any) => c.ref), ["A-01"]);
    assert.equal(p2.validation.filter((f: any) => f.code === "V10").length, 0);
    db.release();
  });

  it("a conflicting identifier is flagged", async () => {
    const [db, cid] = await fresh();
    const prop = clone(STUB);
    prop.controls = [prop.controls[1]];   // the provisioning control, cited at rcm L20
    prop.controls[0].ref = "A-01";        // borrowed label of a different client control
    const snap = await modelSnapshot(db, cid, prop);
    assert.equal((await ids(db, snap))["A-01"][1], "provisional");
    const pend = await identity.pendingIssues(db, snap);
    assert.equal(pend[0].issue_type, "identifier_conflict");
    await identity.resolve(db, "rj", pend[0].id, "keep_provisional", "the label belongs to the access review, not this control");
    assert.deepEqual(await identity.pendingIssues(db, snap), []);
    db.release();
  });

  it("a resolution follows identity and goes stale when sources change", async () => {
    const [db, cid] = await fresh();
    const snap1 = await modelSnapshot(db, cid, STUB);
    await engagement(db, cid, snap1, "NW-ID");
    const p = await planModel(db, "NW-ID");
    const con = p.contradictions.find((c: any) => c.subject === "removal_timeframe");
    assert.equal(con.control_ref, "A-01");
    await approvals.resolveContradiction(db, "rj", "NW-ID", con.id, "rcm:19", "RCM governs");
    const p2 = await planModel(db, "NW-ID");
    assert.equal(p2.controls.find((c: any) => c.ref === "A-01").criteria_register.criteria["UAR-E"].status, "defined by human resolution");
    // A later model run relabels A-01; the id is provisional and a proposed match to A-01 is pending; confirm it.
    const relabelled = clone(STUB);
    relabelled.controls[0].ref = "CTRL-7";
    relabelled.controls[0].source = { doc: "rcm", line_start: 19, line_end: 19 };
    const snap2 = await modelSnapshot(db, cid, relabelled);
    const link = (await identity.pendingIssues(db, snap2)).find((r) => r.issue_type === "proposed_match");
    assert.equal(link.prior_control_id, "A-01");
    await identity.resolve(db, "rj", link.id, "confirm", "same control, relabelled");
    await db.query("UPDATE engagements SET snapshot_id = $1 WHERE name = 'NW-ID'", [snap2]);
    const p3 = await planModel(db, "NW-ID");
    const a01 = p3.controls.find((c: any) => c.control_id === "A-01");
    assert.equal(a01.ref, "CTRL-7");
    assert.equal(a01.criteria_register.criteria["UAR-E"].status, "defined by human resolution");
    // If the contradicting values change, the resolution goes stale and blocks again.
    const dir = mkdtempSync(join(tmpdir(), "soxplan-nar-"));
    writeFileSync(join(dir, "narrative.md"), readFileSync(join(FX, "narrative.md"), "utf8").replace("within 3 business days of review sign-off", "within 4 business days of review sign-off"));
    await intake.ingestDocument(db, "planner-agent", cid, join(dir, "narrative.md"));
    await dropOldest(db, cid, "narrative");
    const changed = clone(STUB);
    changed.controls[0].contradictions[0].sources[1].value = "within 4 business days of review sign-off";
    const snap3 = await modelSnapshot(db, cid, changed);
    await db.query("UPDATE engagements SET snapshot_id = $1 WHERE name = 'NW-ID'", [snap3]);
    const p4 = await planModel(db, "NW-ID");
    assert.equal(p4.contradictions.find((c: any) => c.subject === "removal_timeframe").status, "stale");
    assert.ok(p4.validation.some((f: any) => f.code === "V6" && f.severity === "blocking"));
    assert.equal(p4.controls.find((c: any) => c.control_id === "A-01").criteria_register.criteria["UAR-E"].status, "contradiction open");
    db.release();
  });
});

describe("review summary", () => {
  it("grouping preserves every blocking finding and keeps sources", async () => {
    const [db, cid] = await fresh();
    const snap = await intake.extract(db, "planner-agent", cid);
    await engagement(db, cid, snap, "NW-R");
    await planning.generatePlan(db, "planner-agent", "NW-R");
    const plan = (await planning.getPlan(db, "NW-R")).plan;
    const s = review.summary(plan);
    const texts = s.buckets.blocking.flatMap((g) => g.sources.map((src) => src.text));
    for (const f of plan.validation.filter((x: any) => x.severity === "blocking")) assert.ok(texts.some((t) => t.includes(f.text)), JSON.stringify(f));
    assert.equal(s.approvable, false);
    assert.equal(plan.review.approvable, false);
    assert.equal(s.buckets.blocking.length, 1);          // the open contradiction is one item with two sources
    assert.equal(s.buckets.blocking[0].count, 2);
    assert.ok(s.buckets.judgment.length && s.buckets.info.length);
    const out = review.formatSummary(plan);
    assert.ok(out.includes("BLOCKING"));
    assert.ok(out.includes("use --findings for all"));
    assert.ok(review.formatSummary(plan, true).includes("also (validation:V6)"));
    db.release();
  });

  it("warnings are classified, not dropped", async () => {
    const [db, cid] = await fresh();
    const snap = await modelSnapshot(db, cid, STUB);
    await engagement(db, cid, snap, "NW-R2");
    const plan = await planModel(db, "NW-R2");
    const s = review.summary(plan);
    const kinds = new Set(Object.values(s.buckets).flat().map((g) => g.issue));
    assert.ok(kinds.has("unverified criterion"));   // judgment
    assert.ok(kinds.has("proposer omission"));      // info
    assert.ok(kinds.has("unknown module"));         // judgment
    const nGrouped = Object.values(s.buckets).flat().reduce((n, g) => n + g.count, 0);
    const nRaw = plan.validation.filter((f: any) => f.severity === "blocking").length + plan.information_gaps.filter((g: any) => g.severity !== "blocking").length + plan.coverage_units.filter((u: any) => u.potential_design_gap).length;
    assert.equal(nGrouped, nRaw);                   // nothing lost in grouping
    db.release();
  });
});
