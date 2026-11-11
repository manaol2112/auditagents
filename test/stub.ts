/** Hand-written stub proposal used by several test files. It is not model output and says nothing about how a model performs. */
import * as proposerModel from "../src/proposerModel.js";

// Line references below are real lines of the Northwind fixtures, except where a test needs a wrong one.
export const STUB: any = {
  notes: "stub",
  controls: [
    {
      ref: "A-01",
      description: "Business owners review SAP user access quarterly using the SUIM listing of all users and roles; removals are requested in ServiceNow and completed by Security within 5 business days of the review sign-off.",
      source: { doc: "rcm", line_start: 19, line_end: 19 },
      control_type: "periodic access review", frequency: "Quarterly", owner: "SAP Security Manager", systems: ["SAP ECC"],
      risks_addressed: [{ statement: "Users retain SAP or Concur access that is no longer appropriate", category: "inappropriate access", source: { doc: "rcm", line: 11 } }],
      modules: [{ module: "AC-UAR", rationale: "periodic review of access against the retained-access risk" }],
      contributions: [
        { module: "AC-UAR", expectation: "UAR-DE1", value: "full", rationale: "all users and roles", source_lines: [19] },
        { module: "AC-UAR", expectation: "UAR-DE2", value: "full", rationale: "SUIM listing", source_lines: [19] },
        { module: "AC-UAR", expectation: "UAR-DE3", value: "full", rationale: "business owners", source_lines: [19] },
        { module: "AC-UAR", expectation: "UAR-DE4", value: "full", rationale: "quarterly; 15 business days", source_lines: [8] },
        { module: "AC-UAR", expectation: "UAR-DE5", value: "full", rationale: "5 business days", source_lines: [19] },
        // UAR-DE6 deliberately omitted: the engine must fill it, not drop it.
      ],
      criteria: [
        { attribute: "UAR-C", status: "defined", criterion: "Business owners (department managers), coordinated by the SAP Security Manager", source: { doc: "narrative", line: 6 } },
        { attribute: "UAR-D", status: "defined", criterion: "within 15 business days after quarter end", source: { doc: "narrative", line: 8 } },
        { attribute: "UAR-E", status: "defined", criterion: "within 5 business days of the review sign-off", source: { doc: "rcm", line: 19 } },
        // Invention: the cited line says "Lookback: not performed".
        { attribute: "UAR-F", status: "defined", criterion: "usage of removed access is reviewed monthly by Security", source: { doc: "narrative", line: 10 } },
      ],
      contradictions: [{ subject: "removal timeframe", sources: [
        { doc: "rcm", line: 19, value: "within 5 business days of the review sign-off" },
        { doc: "narrative", line: 9, value: "within 3 business days of review sign-off" }] }],
      design_questions: ["Who reviews the SAP Security Manager's own access?"],
      procedures: [{ attribute: "UAR-E", procedure: "Trace each removal to SU01 change documents (CDHDR/CDPOS).", pass_fail: "Pass if removed within 5 business days of sign-off.", evidence_requests: ["CDHDR/CDPOS extract for 2026 with extraction screenshot"] }],
      information_gaps: ["Holiday calendar needed for business-day computation."],
    },
    {
      ref: "A-05",
      description: "New SAP access is requested in ServiceNow and approved by the requester's manager and the role owner before Security grants the roles listed on the approved request.",
      source: { doc: "rcm", line_start: 20, line_end: 20 },
      control_type: "access provisioning", frequency: "Event", owner: "SAP Security Manager", systems: ["SAP ECC"],
      risks_addressed: [{ statement: "SAP access is granted without authorization", category: "inappropriate access", source: { doc: "rcm", line: 12 } }],
      modules: [{ module: "AC-PROV", rationale: "approval before grant" }, { module: "AC-FOO", rationale: "bogus module to be rejected" }],
      contributions: ([["PROV-DE1", "partial"], ["PROV-DE2", "full"], ["PROV-DE3", "full"], ["PROV-DE4", "full"], ["PROV-DE5", "none"], ["PROV-DE6", "none"], ["PROV-DE7", "none"]] as const)
        .map(([e, v]) => ({ module: "AC-PROV", expectation: e, value: v, rationale: "stub", source_lines: [20] })),
      criteria: [{ attribute: "PROV-B", status: "defined", criterion: "requester's manager and the role owner", source: { doc: "narrative", line: 13 } },
        { attribute: "PROV-C", status: "defined", criterion: "before access is granted", source: { doc: "narrative", line: 14 } },
        { attribute: "PROV-E", status: "not defined by control", criterion: "", source: { doc: "", line: 0 } }],
      contradictions: [], design_questions: [],
      procedures: [{ attribute: "PROV-B", procedure: "For each sampled grant, inspect the ServiceNow approval.", pass_fail: "Pass if approved by the manager and the role owner.", evidence_requests: ["ServiceNow REQ export with approvals"] }],
      information_gaps: [],
    },
    {
      ref: "A-99", description: "The CFO signs the annual budget.", source: { doc: "rcm", line_start: 99, line_end: 99 },
      control_type: "other", frequency: "Annual", owner: "CFO", systems: ["SAP ECC"],
      risks_addressed: [], modules: [], contributions: [], criteria: [], contradictions: [], design_questions: [], procedures: [], information_gaps: [],
    },
    {
      ref: "A-03",
      description: "SAP transports are approved by the CAB before import; the Basis team imports; developers do not hold import authorization.",
      source: { doc: "rcm", line_start: 22, line_end: 22 },
      control_type: "change management", frequency: "Event", owner: "Basis Lead", systems: ["SAP ECC"],
      risks_addressed: [{ statement: "Unauthorized or untested changes", category: "unauthorized change", source: { doc: "rcm", line: 13 } }],
      modules: [{ module: "CM-CHG", rationale: "change approval" }, { module: "AC-PROV", rationale: "import authorization is an access grant path (many-to-many)" }],
      contributions: [
        ...[1, 2, 3, 4, 5, 6, 7].map((i) => ({ module: "CM-CHG", expectation: `CHG-DE${i}`, value: "full", rationale: "stub", source_lines: [22] })),
        ...[1, 2, 3, 4, 5, 6, 7].map((i) => ({ module: "AC-PROV", expectation: `PROV-DE${i}`, value: "none", rationale: "stub", source_lines: [] })),
      ],
      criteria: [{ attribute: "CHG-C", status: "defined", criterion: "CAB", source: { doc: "rcm", line: 22 } }],
      contradictions: [], design_questions: [], procedures: [], information_gaps: [],
    },
  ],
};

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function stubTransport(calls: any[]): proposerModel.Transport {
  return async (system, user, schema, model) => { calls.push({ system, user, schema, model }); return [clone(STUB), { model: "stub" }]; };
}

