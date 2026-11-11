/** Structural validation of a generated plan. Deterministic; never a judgment.
 *
 * Severity 'blocking' prevents approval. 'warning' is shown to the approver, who decides. Each finding names the record it concerns.
 */
import { Methodology } from "./methodology.js";

export interface Finding { code: string; severity: "blocking" | "warning"; where: string; text: string }

const CELL_STATUSES = ["tested under a module", "tested under an engagement-specific procedure", "excluded: not relevant", "excluded: covered elsewhere", "unresolved coverage gap"];
const WARNING_KINDS = ["risk mismatch", "coverage", "unmapped control", "criterion not defined", "unknown risk reference",
  "source unverified", "unverified criterion", "proposer omission", "contradiction unverified", "unknown module", "out of scope module", "proposer gap"];

export function validatePlan(plan: any, data: Methodology): Finding[] {
  const f: Finding[] = [];
  const modules = data.modulesByCode;
  const systems: string[] = plan.engagement.systems;
  const add = (code: string, severity: "blocking" | "warning", where: string, text: string) => f.push({ code, severity, where, text });

  // V1 every system x module has exactly one coverage cell with a status.
  const seen = new Set(plan.coverage_cells.map((c: any) => `${c.system}\0${c.module}`));
  for (const s of systems) for (const m of Object.keys(modules)) if (!seen.has(`${s}\0${m}`)) add("V1", "blocking", `${s}/${m}`, "coverage cell missing");
  for (const c of plan.coverage_cells) if (!CELL_STATUSES.includes(c.status)) add("V1", "blocking", `${c.system}/${c.module}`, `invalid cell status '${c.status}'`);

  // V2 every mapped control has a contribution for every expectation of its module.
  for (const pc of plan.controls) {
    if (!pc.module) continue;
    const cid = pc.control_id ?? pc.ref;
    const expected = new Set<string>(modules[pc.module].expectations.map((e) => e.code));
    const got = new Set<string>(Object.keys(pc.contributions ?? {}));
    if (expected.size !== got.size || [...expected].some((x) => !got.has(x))) add("V2", "blocking", cid, `contributions missing for ${JSON.stringify([...expected].filter((x) => !got.has(x)).sort())}`);
    for (const [code, con] of Object.entries<any>(pc.contributions ?? {})) {
      if (!["full", "partial", "none"].includes(con.value) || !con.rationale) add("V2", "blocking", `${cid}/${code}`, "contribution needs a value in (full, partial, none) and a rationale");
    }
  }

  // V3 every coverage unit exists for every necessary system x module x expectation, with a decision and an assessment.
  const units = new Map<string, any>(plan.coverage_units.map((u: any) => [`${u.system}\0${u.module}\0${u.expectation}`, u]));
  for (const s of systems) {
    for (const m of Object.values(modules)) {
      for (const e of m.expectations) {
        const u = units.get(`${s}\0${m.code}\0${e.code}`);
        const where = `${s}/${m.code}/${e.code}`;
        if (!u) { add("V3", "blocking", where, "coverage unit missing: an expectation was omitted"); continue; }
        if (!["necessary", "not necessary", "not applicable"].includes(u.applicability?.decision)) add("V3", "blocking", where, "applicability decision missing or invalid");
        if (u.applicability?.decision !== "necessary" && !u.applicability?.evidence) add("V3", "blocking", where, "a decision other than 'necessary' needs evidence of absence or a risk-based rationale with approval");
        if (!["covered", "covered by multiple controls", "covered by combination", "partially covered", "not covered"].includes(u.assessment)) add("V3", "blocking", where, `invalid coverage assessment '${u.assessment}'`);
      }
    }
  }

  // V4 every attribute of every mapping has a procedure with a criterion source or an explicit absence.
  for (const pc of plan.controls) {
    if (!pc.module) continue;
    const cid = pc.control_id ?? pc.ref;
    const attrs = modules[pc.module].attributes.map((a) => a.code);
    const procs: Record<string, any> = Object.fromEntries((pc.procedures ?? []).map((p: any) => [p.attribute, p]));
    const missing = attrs.filter((a) => !(a in procs));
    if (missing.length || Object.keys(procs).length !== attrs.length) add("V4", "blocking", cid, `procedures missing for ${JSON.stringify(missing.sort())}`);
    for (const [code, p] of Object.entries(procs)) {
      if (p.criterion_status === "defined" && !p.criterion_source) add("V5", "blocking", `${cid}/${code}`, "a defined criterion must cite its client source");
      if (["not defined by control", "unverified source"].includes(p.criterion_status) && !p.status.startsWith("covered by another control")) {
        const finds = new Set(pc.criteria_register.findings.map((d: any) => d.attribute));
        const dupFields = new Set(pc.criteria_register.findings.map((d: any) => d.field));
        if (!finds.has(code) && p.criterion_source == null && !dupFields.has(pc.criteria_register.criteria[code]?.field)) add("V5", "blocking", `${cid}/${code}`, "undefined criterion without a design finding");
      }
      if (p.criterion_status === "contradiction open") add("V6", "blocking", `${cid}/${code}`, "criterion depends on an open contradiction");
      if (!p.evidence_requests?.length) add("V4", "blocking", `${cid}/${code}`, "no evidence requests");
      if (!p.pass_fail) add("V4", "blocking", `${cid}/${code}`, "no pass/fail criterion");
    }
  }

  // V6 open material contradictions block; immaterial ones warn.
  for (const con of plan.contradictions) {
    if ((con.current ?? true) && ["open", "stale"].includes(con.status)) {
      add("V6", con.materiality === "material" ? "blocking" : "warning", `${con.control_ref}/${con.subject}`, `contradiction #${con.id} is open (${con.materiality})`);
    }
  }

  // V7 risk mismatches and other gaps surface as warnings for the approver.
  for (const g of plan.information_gaps) if (WARNING_KINDS.includes(g.kind)) add("V7", "warning", g.control || "engagement", g.text);

  // V10 identity issues pending human resolution block approval; stale resolutions surface through V6.
  for (const g of plan.information_gaps) if (g.kind === "identity" && g.severity === "blocking") add("V10", "blocking", g.control || "snapshot", g.text);

  // V8 pins present.
  for (const k of ["methodology_version", "methodology_document_hash", "snapshot_hash"]) if (!plan.pins?.[k]) add("V8", "blocking", "pins", `missing pin ${k}`);
  return f;
}

export function blocking(findings: Finding[]): Finding[] {
  return findings.filter((x) => x.severity === "blocking");
}
