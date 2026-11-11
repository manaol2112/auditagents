/** Review-cycle fixtures shared by test files: stub reviewer passes, a stub revision, and a model-planned Northwind engagement. */
import { join } from "node:path";
import pg from "pg";
import * as audit from "../src/audit.js";
import { REPO_ROOT, j, now } from "../src/db.js";
import * as intake from "../src/intake.js";
import * as methodology from "../src/methodology.js";
import * as planning from "../src/planning.js";
import * as proposerModel from "../src/proposerModel.js";
import * as workflow from "../src/workflow.js";
import { checkout, freshDb } from "./helpers.js";
import { STUB, clone } from "./stub.js";

const FX = join(REPO_ROOT, "fixtures", "northwind");

export const PASS1: any = { notes: "stub", controls: [
  { label: "SAP access review", quote: "Business owners review SAP user access quarterly using the SUIM listing", source: { doc: "rcm", line: 19 },
    systems: ["SAP ECC"], modules: ["AC-UAR"], coverage: [],
    material_risks: [{ risk: "removed access may have been used before removal", source: { doc: "narrative", line: 10 } }],
    necessary_expectations: [{ expectation: "UAR-DE6", why: "posting roles reviewed" }],
    essential_procedures: ["UAR-A", "UAR-B", "UAR-E"], essential_evidence: ["SUIM listing", "CDHDR"],
    criteria_found: [{ attribute: "UAR-E", criterion: "within 5 business days of the review sign-off", source: { doc: "rcm", line: 19 } }] },
  { label: "Concur role review", quote: "The Controller reviews Concur expense approver and administrator roles semi-annually", source: { doc: "rcm", line: 23 },
    systems: ["Concur"], modules: ["AC-UAR"], coverage: [], material_risks: [], necessary_expectations: [], essential_procedures: ["UAR-B"], essential_evidence: ["Concur admin export"], criteria_found: [] },
] };

export const FINDINGS_CYCLE1: any = { notes: "stub", candidates_dismissed: [], findings: [
  { control_id: "", code: "", category: "omitted_control", significance: "high",
    source: { doc: "rcm", line: 23, quote: "The Controller reviews Concur expense approver and administrator roles semi-annually" },
    rationale: "The Concur role review is an in-scope AC-UAR control and is absent from the plan.", suggested_action: "Add the Concur review control (rcm L23) mapped to AC-UAR for Concur." },
  { control_id: "A-01", code: "UAR-F", category: "unsupported_criterion", significance: "high",
    source: { doc: "narrative", line: 10, quote: "Lookback: not performed" },
    rationale: "The plan's UAR-F criterion claims monthly usage review; the narrative says lookback is not performed.", suggested_action: "Mark UAR-F not defined by control and raise the design gap." },
  { control_id: "A-01", code: "UAR-DE3", category: "human_judgment_question", significance: "medium",
    source: { doc: "narrative", line: 6, quote: "Business owners (department managers), coordinated by the SAP Security Manager" },
    rationale: "Whether department managers can judge SAP role appropriateness without role descriptions is a judgment.", suggested_action: "Ask the approver whether reviewer competence (D3) is adequate." },
  { control_id: "A-01", code: "UAR-D", category: "weak_evidence", significance: "low",
    source: { doc: "narrative", line: 8, quote: "within 15 business days after quarter end" },
    rationale: "Low significance presentation point.", suggested_action: "Add the sign-off timestamp field to the evidence request." },
  { control_id: "A-05", code: "PROV-B", category: "weak_evidence", significance: "medium",
    source: { doc: "narrative", line: 99, quote: "text that is not there" }, rationale: "Unverifiable citation on purpose.", suggested_action: "n/a" },
  { control_id: "ZZ-9", code: "UAR-A", category: "omitted_procedure", significance: "high",
    source: { doc: "rcm", line: 19, quote: "SUIM listing" }, rationale: "Unknown control on purpose.", suggested_action: "n/a" },
] };
export const FINDINGS_NONE: any = { notes: "no further findings", candidates_dismissed: [], findings: [] };

export function revisedProposal(): any {
  const p = clone(STUB);
  const a01 = p.controls.find((c: any) => c.ref === "A-01");
  for (const k of a01.criteria) if (k.attribute === "UAR-F") { k.status = "not defined by control"; k.criterion = ""; k.source = { doc: "", line: 0 }; }
  p.controls.push({
    ref: "A-13", description: "The Controller reviews Concur expense approver and administrator roles semi-annually.",
    source: { doc: "rcm", line_start: 23, line_end: 23 }, control_type: "periodic access review", frequency: "Semi-annual", owner: "Controller", systems: ["Concur"],
    risks_addressed: [{ statement: "retained access", category: "inappropriate access", source: { doc: "rcm", line: 11 } }],
    modules: [{ module: "AC-UAR", rationale: "periodic review" }],
    contributions: [1, 2, 3, 4, 5, 6].map((i) => ({ module: "AC-UAR", expectation: `UAR-DE${i}`, value: i < 6 ? "partial" : "none", rationale: "stub", source_lines: [23] })),
    criteria: [{ attribute: "UAR-C", status: "defined", criterion: "Controller", source: { doc: "narrative", line: 31 } }],
    contradictions: [], design_questions: [], procedures: [], information_gaps: [] });
  return p;
}

export class Stubs {
  calls = { pass1: 0, pass2: 0, revision: 0 };
  seen: [string, string][] = [];
  constructor(private pass2Sequence: any[], private revision?: any) {}
  transports(): workflow.Transports {
    return {
      pass1: async (_s, user) => { this.calls.pass1++; this.seen.push(["pass1", user]); return [clone(PASS1), { model: "stub" }]; },
      pass2: async (_s, user) => { this.calls.pass2++; this.seen.push(["pass2", user]); return [clone(this.pass2Sequence.shift()), { model: "stub" }]; },
      revision: async (_s, user) => {
        this.calls.revision++; this.seen.push(["revision", user]);
        const p = clone(this.revision ?? revisedProposal());
        const ids = [...user.matchAll(/finding (\d+):/g)].map((m) => Number(m[1]));
        p.responses = ids.map((i) => ({ finding_id: i, decision: "accepted", reason: "stub accepted" }));
        return [p, { model: "stub" }];
      },
    };
  }
}

export async function build(): Promise<pg.PoolClient> {
  const pool = await freshDb();
  const db = await checkout(pool);
  await audit.addUser(db, "system", "rj", "approver");
  const cid = (await db.query("INSERT INTO clients (name, fiscal_year_end, time_zone) VALUES ($1,$2,$3) RETURNING id", ["Northwind Foods", "2026-12-31", "America/New_York"])).rows[0].id;
  for (const f of ["rcm.md", "narrative.md", "policy.md"]) await intake.ingestDocument(db, "planner-agent", cid, join(FX, f));
  const snap = await proposerModel.extractWithModel(db, "planner-agent", cid, ["SAP ECC", "Concur"], async () => [clone(STUB), { model: "stub" }]);
  const data = methodology.load();
  await db.query("INSERT INTO engagements (client_id, name, period_start, period_end, as_of, systems, methodology_version, methodology_hash, snapshot_id, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [cid, "NW-REV", "2026-01-01", "2026-12-31", "2026-12-31", j(["SAP ECC", "Concur"]), data.version, data.document_hash, snap, "rj", now()]);
  await planning.generatePlan(db, "planner-agent", "NW-REV", "model", proposerModel.modelProposals);
  return db;
}


export async function endPools() { /* pools are tracked and closed by helpers.shutdown() */ }
