/** L3: the Planning Agent and the engagement audit program (G2 plan).
 *
 * The agent proposes. It never approves, never supplies a client criterion the documents do not contain,
 * and never drops a methodology expectation. Every proposal carries the source reference or the
 * methodology code it came from. The deterministic proposer here is the baseline; the model-backed
 * proposer (proposerModel.ts) is a separate component behind the same engine.
 */
import { recordEvent, requireRole } from "./audit.js";
import { Db, EngineError, hashOf, j, now, one, all } from "./db.js";
import * as identity from "./identity.js";
import * as meth from "./methodology.js";
import { ATTRIBUTE_CRITERION, Methodology, Module } from "./methodology.js";
import { normalizeTimeframe, snapshotControls, snapshotFacts, snapshotRisks, sourceRef } from "./intake.js";
import { openBlocking } from "./rcm/extract.js";
import { summary } from "./review.js";
import { validatePlan } from "./validate.js";

// ---------------------------------------------------------------- criteria

export { ATTRIBUTE_CRITERION } from "./methodology.js";
/** Narrative or policy keys that feed a criterion field under another name. */
export const FIELD_ALIASES: Record<string, string> = { performer: "reviewer", access_removal_timeframe: "removal_timeframe", emergency_changes: "emergency_timeframe" };
/** Kept for importers: the timeframe and material field predicates as sets over the known fields. */
export const TIMEFRAME_FIELDS = new Set([...meth.CRITERION_FIELD_NAMES].filter(meth.isTimeframeField));
export const MATERIAL_FIELDS = new Set([...meth.CRITERION_FIELD_NAMES].filter(meth.isMaterialField));

/** Canonical form used to decide whether two sources agree. */
export function canonValue(field: string, value: string): string {
  if (meth.isTimeframeField(field)) return normalizeTimeframe(value) ?? value.trim().toLowerCase();
  if (field === "approval_timing") {
    const v = value.toLowerCase();
    return /\b(before|prior)\b/.test(v) ? "before" : /\bafter\b/.test(v) ? "after" : v.trim();
  }
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** field -> list of {value, canonical, source}. Policy facts apply to every control of the matching type. */
export function collectCriterionSources(controlRef: string, controlType: string, facts: any[]): Record<string, any[]> {
  const sources: Record<string, any[]> = {};
  for (const f of facts) {
    const field = FIELD_ALIASES[f.field] ?? f.field;
    if (f.subject_type === "control" && f.subject_ref === controlRef) { /* own fact */ }
    else if (f.subject_type === "policy" && field === "removal_timeframe" && controlType === "periodic access review") { /* policy applies */ }
    else continue;
    if (field === "reviewer" && controlType !== "periodic access review") continue;
    if (field === "emergency_timeframe" && normalizeTimeframe(f.value) === null) continue;
    (sources[field] ??= []).push({ value: f.value, canonical: canonValue(field, f.value), source: sourceRef(f), fact_class: f.fact_class });
  }
  return sources;
}

/** Criteria register entry for one control, plus contradictions found. Contradictions are open here; human
 * resolutions are applied in assemblePlan once the control's effective identity is known. */
export function buildRegister(control: any, module: Module, facts: any[]): { entry: any; contradictions: any[] } {
  const cid = control.control_id ?? control.ref;
  const sources = collectCriterionSources(control.ref, control.control_type, facts);
  const descFact = facts.find((f) => f.subject_type === "control" && f.subject_ref === control.ref && f.field === "description");
  const entry: any = { control_ref: control.ref, governing_description: { text: control.description, source: descFact ? sourceRef(descFact) : null }, criteria: {}, findings: [] };
  const contradictions: any[] = [];
  for (const attr of module.attributes) {
    const code = attr.code;
    if (!(code in ATTRIBUTE_CRITERION)) {
      entry.criteria[code] = { criterion: attr.text, status: "methodology criterion", source: { methodology: code } };
      continue;
    }
    const [field, dcrit] = ATTRIBUTE_CRITERION[code];
    const found = sources[field] ?? [];
    const distinct = new Set(found.map((s) => s.canonical));
    if (!found.length) {
      entry.criteria[code] = { criterion: "not defined by control", status: "not defined by control", field, source: null };
      entry.findings.push({ criterion: dcrit, attribute: code, field, text: `${dcrit}: no client source defines '${field}' for ${control.ref}; the Planner does not supply a value.` });
    } else if (distinct.size === 1) {
      const s = found[0];
      const absent = field === "lookback" && /\bnot\b|\bno\b|\bnone\b/.test(s.value.toLowerCase());
      entry.criteria[code] = { criterion: s.value, status: absent ? "stated absent by client" : "defined", field, source: s.source, all_sources: found.map((x) => x.source) };
    } else {
      contradictions.push({ control_ref: cid, subject: field, materiality: meth.isMaterialField(field) ? "material" : "immaterial",
        sources: found.map((x) => ({ key: `${x.source.doc_type}:${x.source.line_no}`, value: x.value, source: x.source })), status: "open", resolution: null });
      entry.criteria[code] = { criterion: "contradiction open", status: "contradiction open", field, source: null, candidates: found.map((x) => ({ value: x.value, source: x.source })) };
    }
  }
  return { entry, contradictions };
}

// ---------------------------------------------------------------- contributions

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function has(blob: string, ...wordsList: string[]): string | null {
  for (const w of wordsList) if (new RegExp(`\\b${escapeRe(w)}\\b`).test(blob)) return w;
  return null;
}

type Contribution = { value: "full" | "partial" | "none"; rationale: string };

/** Deterministic signal: does the documented control address this expectation? full / partial / none, with rationale. */
export function proposeContribution(e: string, control: any, cfacts: Record<string, string[]>, register: any): Contribution {
  const blob = (control.description + " " + Object.values(cfacts).flat().join(" ")).toLowerCase();
  const crit = register.criteria;
  const defined = (a: string) => ["defined", "defined by human resolution"].includes(crit[a]?.status);
  const full = (why: string): Contribution => ({ value: "full", rationale: why });
  const partial = (why: string): Contribution => ({ value: "partial", rationale: why });
  const none = (why: string): Contribution => ({ value: "none", rationale: why });
  const joined = (k: string) => (cfacts[k] ?? []).join(" ").toLowerCase();
  let w: string | null;
  switch (e) {
    case "UAR-DE1": w = has(blob, "all users", "all accounts", "all account types", "privileged", "service accounts");
      return w ? full(`documentation mentions '${w}'`) : none("documentation does not state that all account types and layers are covered");
    case "UAR-DE2": w = has(blob, "system-generated", "suim", "listing", "export");
      return w ? full(`listing source mentioned: '${w}'`) : none("no listing source described");
    case "UAR-DE3": return defined("UAR-C") ? full("reviewer role defined") : none("reviewer role not defined");
    case "UAR-DE4":
      if (control.frequency && defined("UAR-D")) return full("frequency and completion timeframe defined");
      return control.frequency ? partial("frequency defined; completion timeframe not defined") : none("frequency not defined");
    case "UAR-DE5": return defined("UAR-E") ? full("removal timeframe defined") : none("no removal timeframe defined");
    case "UAR-DE6": {
      const look = joined("lookback");
      if (look && !/\bnot\b|\bno\b/.test(look)) return full(`lookback described: '${look}'`);
      return none(look ? "documentation states no lookback" : "documentation is silent on whether inappropriate access is assessed for use");
    }
    case "PROV-DE1": {
      const paths = joined("paths");
      if (paths.includes("not covered")) return partial(`paths statement limits coverage: '${paths}'`);
      if (has(blob, "automatically", "feed", "automated")) return partial("control covers the automated provisioning path only");
      return paths || has(blob, "request") ? partial("control covers the request path; other grant paths not addressed in documentation") : none("grant paths not described");
    }
    case "PROV-DE2": return defined("PROV-B") ? full("approver defined") : none("approver not defined");
    case "PROV-DE3": return defined("PROV-C") && has(crit["PROV-C"].criterion.toLowerCase(), "before", "prior") ? full("approval before grant stated") : none("approval timing not stated");
    case "PROV-DE4": w = has(blob, "as approved", "listed on the approved", "matches");
      return w ? full(`grant equals approval stated: '${w}'`) : none("not stated that the access granted equals the access approved");
    case "PROV-DE5": w = has(blob, "role catalogue", "role definitions", "conflict", "segregation");
      return w ? full(`'${w}' mentioned`) : none("role definitions and conflict checks not described");
    case "PROV-DE6": w = has(blob, "automatically", "feed", "automated");
      return w ? full(`automated provisioning described ('${w}')`) : none("no automated provisioning described; applicability to be confirmed");
    case "PROV-DE7": w = has(blob, "temporary", "time-boxed");
      return w ? full(`'${w}' grants described`) : none("temporary grants not described; applicability to be confirmed");
    case "CHG-DE1": {
      const types = ["configuration", "emergency", "data", "infrastructure", "vendor"].filter((t) => has(blob, t));
      if (types.includes("configuration") && types.includes("emergency")) return full(`change types mentioned: ${types.join(", ")}`);
      return types.length ? partial(`change types mentioned: ${types.join(", ")}`) : none("change types not described");
    }
    case "CHG-DE2": w = has(blob, "ticket", "request", "transport request");
      return w ? full(`'${w}' mentioned`) : none("no request record described");
    case "CHG-DE3": return defined("CHG-B") || has(blob, "test", "testing", "uat") ? full("testing described") : none("testing not described");
    case "CHG-DE4": return defined("CHG-C") && has(blob, "before") ? full("approver and approval before migration defined") : none("approver or timing not defined");
    case "CHG-DE5": {
      const seg = joined("segregation");
      if (seg.includes("also hold") || seg.includes("also have")) return partial(`segregation stated with a noted overlap: '${seg}'`);
      w = has(blob, "developers do not", "segregat", "separate", "separated");
      return w || seg ? full(`separation stated ('${w}')`) : none("separation of developing and migrating not described");
    }
    case "CHG-DE6": return cfacts.emergency_changes?.length || has(blob, "emergency") ? full("emergency procedure described") : none("emergency changes not described");
    case "CHG-DE7": return cfacts.environments?.length || has(blob, "environments") ? full("environments listed") : none("environments not described");
    default: return none("the deterministic proposer has no rule for this expectation; recorded as none so it stays visible, for the model proposer or a human to assess");
  }
}

export const QUESTION_TEMPLATES: Record<string, string> = {
  "UAR-DE1": "Which account types (end user, privileged, service, shared) and which layers does the review cover, and who covers the rest?",
  "UAR-DE2": "How is the listing produced, from which system and environment, and does it show roles in a form reviewers understand?",
  "UAR-DE3": "How do reviewers know each user's responsibilities, and what happens when a reviewer's own access is on the list?",
  "UAR-DE4": "By when must the review be completed after period end, and where is that stated?",
  "UAR-DE5": "What is the timeframe for making requested removals in the system, and how is completion verified?",
  "UAR-DE6": "When inappropriate access is found, does anyone assess whether it was used? Where is that recorded?",
  "PROV-DE1": "List every way access can be granted or changed (requests, direct admin assignment, groups, inherited roles, automated feed, temporary grants, bulk loads). Which go through approval?",
  "PROV-DE2": "Who approves access requests, and can an approver approve their own access?",
  "PROV-DE3": "Is approval always recorded before the grant? Where are both timestamps kept?",
  "PROV-DE4": "How is it checked that the roles granted equal the roles approved?",
  "PROV-DE5": "Are role definitions available to approvers, and are conflicting role combinations checked before granting?",
  "PROV-DE6": "If any provisioning is automated, who approved the rule set and how are rule changes controlled?",
  "PROV-DE7": "Can access be granted temporarily or time-boxed? If so, who approves and how is expiry enforced?",
  "CHG-DE1": "Which change types does the process cover: code, configuration, database, infrastructure, emergency, vendor, direct data changes?",
  "CHG-DE2": "How is every production change traceable to a request, and from which system is the list of production changes produced?",
  "CHG-DE3": "What testing is required before migration, who performs it, and where are results kept?",
  "CHG-DE4": "Who approves migration to production, and is the approval timestamp recorded before the import?",
  "CHG-DE5": "Who can migrate to production, and does anyone with developer access also hold migration authorization? If so, what control covers that?",
  "CHG-DE6": "What is the emergency change procedure and the timeframe for approval after the fact?",
  "CHG-DE7": "Which environments exist, and are development, test, and production separated?",
};

// ---------------------------------------------------------------- plan assembly

type UnitState = Record<string, [string, string[]]>;

/** The population of the part of the control an attribute belongs to (AC-PRIV, CO-JOB), else the module's population. */
export function populationFor(module: Module, attr: meth.Attribute): string {
  const row = attr.group && module.populations?.find((p) => p.part.toLowerCase() === attr.group!.toLowerCase());
  return row ? `${row.population}. Means of selection: ${row.selection}` : module.population;
}

/** The walkthrough question for an expectation: a hand-written template where one exists, otherwise built from the methodology text. */
export function questionFor(e: meth.Expectation): string {
  return QUESTION_TEMPLATES[e.code] ?? `How does the control meet ${e.code} ("${e.text.replace(/\.$/, "")}")? Show where this is documented and the records that evidence it.`;
}

function procedure(control: any, module: Module, attr: meth.Attribute, register: any, unitStates: UnitState): any {
  const crit = register.criteria[attr.code];
  const systems = control.systems.join(", ");
  const expCodes = module.expectations.filter((e) => e.tested_by.includes(attr.code)).map((e) => e.code);
  const own = expCodes.map((c) => control.contributions[c].value);
  const others = [...new Set(expCodes.flatMap((c) => (unitStates[c]?.[1] ?? []).filter((o) => o !== control.ref)))].sort();
  const st = expCodes.map((c) => unitStates[c]?.[0] ?? "not covered");
  const gap = st.some((v) => v === "not covered");
  const partial = st.some((v) => v === "partial");
  let status: string;
  if (expCodes.length && own.every((v) => v === "none") && !gap && others.length) status = `covered by another control: ${others.join(", ")}`;
  else if (gap) status = "not tested, potential design gap";
  else if (partial) status = "proposed, pending design confirmation";
  else status = "proposed";
  let passFail: string;
  if (status.startsWith("covered by another control")) passFail = `Not tested on ${control.ref}: the expectation(s) ${JSON.stringify(expCodes)} are addressed by ${others.join(", ")}.`;
  else if (crit.status === "not defined by control") passFail = `Cannot be set: ${crit.field} is not defined by the control. Design finding raised; criterion to be confirmed in the walkthrough.`;
  else if (crit.status === "unverified source") passFail = `Cannot be set: the proposer's criterion for ${crit.field} cites a source that does not contain it. Treated as not defined; approver to check.`;
  else if (crit.status === "contradiction open") passFail = `Blocked: contradictory sources for ${crit.field}; a qualified human must resolve before criteria are final.`;
  else if (crit.status === "methodology criterion") passFail = `Pass when: ${attr.text} Fail otherwise.`;
  else passFail = `Pass when the item meets: '${crit.criterion}' (control ${control.ref}). Fail when it does not, or when evidence cannot be obtained (then 'unable to test').`;
  return {
    attribute: attr.code, attribute_text: attr.text, test_type: attr.type, expectations: expCodes, status,
    procedure: `For control ${control.ref} on ${systems}: ${attr.text}`,
    operating_criterion: crit.criterion, criterion_status: crit.status, criterion_source: crit.source ?? null,
    pass_fail: passFail,
    population: populationFor(module, attr) + ` Systems: ${systems}.`,
    pattern: module.pattern,
    means_of_selection: "Full population by code where the population is structured data; otherwise sampling with random selection, nonstatistical unless declared; rationale to be completed and approved at G2.",
    evidence_requests: module.evidence.map((e) => `${e} (system: ${systems})`),
  };
}

/** The rule-based Planning Agent: one proposal per client control. */
export function deterministicProposals(controls: any[], risks: Record<string, any>, facts: any[], data: Methodology, gaps: any[]): any[] {
  const out: any[] = [];
  for (const c of controls) {
    const cfacts: Record<string, string[]> = {};
    for (const f of facts) if (f.subject_type === "control" && f.subject_ref === c.ref) (cfacts[f.field] ??= []).push(f.value);
    const pc: any = { ref: c.ref, control_id: c.control_id, identity_basis: c.identity_basis, identity_issues: [], description: c.description,
      control_type: c.control_type, frequency: c.frequency, owner: c.owner, systems: c.systems, risk_refs: c.risk_refs, status: c.status,
      source: { doc_id: c.doc_id, line_no: c.line_no }, ...(c.category ? { category: c.category } : {}) };
    // An RCM states (or a person confirmed) the control's category and module; the planner uses them as given.
    if (c.category && c.category !== "IT general control") {
      pc.module = null; pc.mapping_rationale = `${c.category}: imported and linked; not planned, because the methodology covers IT general controls only`;
      gaps.push({ kind: "not planned", control: c.ref, severity: "info", text: `${c.ref} is a ${c.category.toLowerCase()}; it is imported with its links but not planned until the methodology covers its category.` });
      out.push(pc);
      continue;
    }
    if (c.module && !(c.module in data.modulesByCode)) {
      pc.module = null; pc.mapping_rationale = `module ${c.module} is outside the engagement's scope`;
      gaps.push({ kind: "out of scope module", control: c.ref, severity: "warning", text: `${c.ref}: the RCM maps it to ${c.module}, which is outside this engagement's scope; not planned. Confirm the scope decision or re-scope the engagement.` });
      out.push(pc);
      continue;
    }
    const module = c.module ? data.modulesByCode[c.module] : meth.moduleForControlType(data, c.control_type);
    if (!module) {
      pc.module = null; pc.mapping_rationale = `control type '${c.control_type}' matches no module in this increment`;
      gaps.push({ kind: "unmapped control", control: c.ref, severity: "warning", text: `${c.ref} has type '${c.control_type}', which maps to no module in scope (${data.modules.map((m) => m.code).join(", ")}).` });
      out.push(pc);
      continue;
    }
    const riskCats = [...new Set((c.risk_refs as string[]).filter((r) => r in risks).map((r) => risks[r].category))].sort();
    const unknown = (c.risk_refs as string[]).filter((r) => !(r in risks));
    const mismatch = riskCats.length > 0 && !riskCats.includes(module.risk_category);
    pc.module = module.code;
    pc.mapping_rationale = `control type '${c.control_type}' addresses the ${module.code} risk ('${module.risk_category}'); client risks ${JSON.stringify(c.risk_refs)} are categorised ${JSON.stringify(riskCats)}`;
    pc.risk_mismatch = mismatch;
    if (mismatch) gaps.push({ kind: "risk mismatch", control: c.ref, severity: "warning", text: `${c.ref} is a '${c.control_type}' control but its linked risks are categorised ${JSON.stringify(riskCats)}, not '${module.risk_category}'. Confirm the mapping or the risk link with the client.` });
    if (unknown.length) gaps.push({ kind: "unknown risk reference", control: c.ref, severity: "warning", text: `${c.ref} references risks not in the RCM: ${JSON.stringify(unknown)}.` });
    const { entry, contradictions } = buildRegister(c, module, facts);
    pc.criteria_register = entry;
    pc.proposed_contradictions = contradictions;
    pc.contributions = Object.fromEntries(module.expectations.map((e) => [e.code, proposeContribution(e.code, c, cfacts, entry)]));
    out.push(pc);
  }
  return out;
}

export type ProposerFn = (db: Db, eng: any, data: Methodology, snap: any, systems: string[], resolutions: Record<string, any>, gaps: any[]) => Promise<[any[], string]>;

/** Produce a new draft plan version. `proposer` is 'rules' (deterministic) or 'model' (proposerFn supplies the
 * proposals). The engine assembles, validates, and persists either way. */
export async function generatePlan(db: Db, actor: string, engagementName: string, proposer: "rules" | "model" = "rules", proposerFn?: ProposerFn): Promise<number> {
  await requireRole(db, actor, "agent", "preparer", "approver");
  const eng = await one(db, "SELECT * FROM engagements WHERE name = $1", [engagementName]);
  if (!eng) throw new EngineError(`unknown engagement '${engagementName}'`);
  const full = meth.load();
  if (full.version !== eng.methodology_version || full.document_hash !== eng.methodology_hash) throw new EngineError("methodology version or document hash differs from the engagement pin; re-create the engagement to re-pin");
  const data = meth.scoped(full, eng.modules);
  if (!eng.snapshot_id) throw new EngineError("no client documents have been extracted for this engagement yet; upload and extract the RCM first");
  const blockers = await openBlocking(db, eng.snapshot_id);
  if (blockers.length) throw new EngineError(`${blockers.length} blocking intake finding(s) are open on the RCM; fix them in the RCM and upload it again, or have an approver accept them with a reason: ` + blockers.slice(0, 5).map((b) => `#${b.id} ${b.message}`).join("; ") + (blockers.length > 5 ? "; ..." : ""));
  const snap = await one(db, "SELECT * FROM snapshots WHERE id = $1", [eng.snapshot_id]);
  const systems: string[] = eng.systems;
  const resolutions: Record<string, any> = {};
  for (const r of await all(db, "SELECT * FROM contradictions WHERE engagement_id = $1 AND status = 'resolved'", [eng.id])) {
    resolutions[`${r.control_ref}|${r.subject}`] = { chosen_source: r.chosen_source, resolution: r.resolution, resolved_by: r.resolved_by, resolved_at: r.resolved_at, sources_hash: r.sources_hash };
  }
  const gaps: any[] = [];
  let proposals: any[], label: string;
  if (proposer === "rules") {
    proposals = deterministicProposals(await snapshotControls(db, snap!.id), await snapshotRisks(db, snap!.id), await snapshotFacts(db, snap!.id), data, gaps);
    label = "rules";
  } else if (proposer === "model") {
    if (!proposerFn) throw new EngineError("model proposer requires proposer_fn");
    [proposals, label] = await proposerFn(db, eng, data, snap, systems, resolutions, gaps);
  } else {
    throw new EngineError(`unknown proposer '${proposer}'`);
  }
  const plan = await assemblePlan(db, eng, data, snap, systems, proposals, gaps, actor, label, resolutions);
  return createPlanVersion(db, actor, eng.id, plan);
}

/** Common assembly for any proposer: coverage cells and units, procedures, questions, contradictions, validation. */
export async function assemblePlan(db: Db, eng: any, data: Methodology, snap: any, systems: string[], planControls: any[], gaps: any[], actor: string, proposerLabel: string, resolutions: Record<string, any> = {}): Promise<any> {
  // Stable identity: apply human resolutions, drop merged duplicates, block on pending issues.
  const eff = await identity.effectiveIds(db, snap.id);
  const kept: any[] = [];
  for (const pc of planControls) {
    const e = eff[pc.control_id] ?? { effective: pc.control_id, merged_into: null };
    if (e.merged_into) {
      gaps.push({ kind: "identity", control: pc.control_id, severity: "info", text: `${pc.ref} merged into ${e.merged_into} by human resolution; not planned separately.` });
      continue;
    }
    pc.control_id = e.effective;
    kept.push(pc);
  }
  planControls = kept;
  for (const iss of await identity.pendingIssues(db, snap.id)) {
    gaps.push({ kind: "identity", control: iss.control_id, severity: "blocking", text: `identity issue #${iss.id} (${iss.issue_type}) on ${iss.control_id}: ${iss.resolution || JSON.stringify(iss.candidates)}; resolve with 'resolve-identity' before approval.` });
  }
  // Contradictions: key by effective identity, then apply human resolutions whose sources still match.
  const allContradictions: any[] = [];
  for (const pc of planControls) {
    const proposed = pc.proposed_contradictions ?? [];
    delete pc.proposed_contradictions;
    for (const con of proposed) {
      con.control_ref = pc.control_id;
      con.sources_hash = identity.sourcesHash(con.sources);
      const res = resolutions[`${pc.control_id}|${con.subject}`];
      if (res && res.sources_hash === con.sources_hash) {
        con.status = "resolved"; con.resolution = res;
        const chosen = con.sources.find((x: any) => x.key === res.chosen_source);
        for (const pc2 of planControls) {   // every module mapping of this control shares the register fields
          if (pc2.control_id !== pc.control_id || !pc2.criteria_register) continue;
          for (const [code, k] of Object.entries<any>(pc2.criteria_register.criteria)) {
            if (k.field === con.subject && k.status === "contradiction open") {
              pc2.criteria_register.criteria[code] = { criterion: chosen ? chosen.value : "contradiction resolved; chosen source not found", status: "defined by human resolution",
                field: con.subject, source: chosen ? chosen.source : null, resolution: res };
            }
          }
        }
      }
      allContradictions.push(con);
    }
  }
  const byModuleSystem = new Map<string, any[]>();
  for (const pc of planControls) {
    if (!pc.module) continue;
    for (const s of pc.systems) if (systems.includes(s)) { const k = `${pc.module}\0${s}`; byModuleSystem.set(k, [...(byModuleSystem.get(k) ?? []), pc]); }
  }

  const cells: any[] = [], units: any[] = [];
  for (const s of systems) {
    for (const module of data.modules) {
      const ctrls = byModuleSystem.get(`${module.code}\0${s}`) ?? [];
      if (ctrls.length) {
        cells.push({ system: s, module: module.code, status: "tested under a module", rationale: `controls mapped: ${JSON.stringify(ctrls.map((x) => x.ref))}`, controls: ctrls.map((x) => x.ref) });
      } else {
        cells.push({ system: s, module: module.code, status: "unresolved coverage gap", rationale: "no documented control of this type for this system; the approver decides the treatment", controls: [] });
        gaps.push({ kind: "coverage", control: null, severity: "warning", text: `No ${module.code} control documented for ${s}; proposed status 'unresolved coverage gap' needs the approver's decision (exclude with rationale, covered elsewhere, or gap).` });
      }
      for (const e of module.expectations) {
        const contribs = ctrls.map((x) => ({ control: x.ref, ...x.contributions[e.code] }));
        const fulls = contribs.filter((k) => k.value === "full"), partials = contribs.filter((k) => k.value === "partial");
        const assessment = fulls.length === 1 ? "covered" : fulls.length ? "covered by multiple controls" : partials.length ? "partially covered" : "not covered";
        units.push({ system: s, module: module.code, expectation: e.code, expectation_text: e.text,
          applicability: { decision: "necessary", rationale: "default; the Planner proposes no exception without evidence of absence" },
          assessment, contributions: contribs, potential_design_gap: ["not covered", "partially covered"].includes(assessment) && ctrls.length > 0 });
      }
    }
  }
  const unitState = new Map(units.map((u) => [`${u.system}\0${u.module}\0${u.expectation}`, u]));

  for (const pc of planControls) {
    if (!pc.module) continue;
    const module = meth.module(data, pc.module);
    const states: UnitState = {};
    for (const e of module.expectations) {
      const us = (pc.systems as string[]).filter((s) => systems.includes(s)).map((s) => unitState.get(`${s}\0${pc.module}\0${e.code}`)!);
      const covered = us.length > 0 && us.every((u) => ["covered", "covered by multiple controls"].includes(u.assessment));
      const partial = us.length > 0 && us.every((u) => u.assessment !== "not covered") && !covered;
      const covering = [...new Set(us.flatMap((u) => u.contributions.filter((c: any) => c.value === "full").map((c: any) => c.control as string)))].sort();
      states[e.code] = [covered ? "covered" : partial ? "partial" : "not covered", covering];
    }
    const overrides = pc.procedure_overrides ?? {};
    delete pc.procedure_overrides;
    const procs: any[] = [];
    for (const a of module.attributes) {
      const p = procedure(pc, module, a, pc.criteria_register, states);
      const o = overrides[a.code];
      if (o && !p.status.startsWith("covered by another control")) {
        for (const k of ["procedure", "pass_fail", "evidence_requests"]) if (o[k]) p[k] = o[k];
        p.proposer_note = o.note ?? "";
      }
      procs.push(p);
    }
    pc.procedures = procs;
    const suppressed = new Set(procs.filter((p) => p.status.startsWith("covered by another control")).map((p) => p.attribute));
    const seen = new Set<string>(), keptF: any[] = [];
    for (const d of pc.criteria_register.findings) {
      const key = `${d.criterion}\0${d.field}`;
      if (suppressed.has(d.attribute) || seen.has(key)) continue;
      seen.add(key); keptF.push(d);
    }
    pc.criteria_register.findings = keptF;
    const qs: string[] = keptF.map((d: any) => {
      const exp = module.expectations.find((e) => e.tested_by.includes(d.attribute));
      return `[${d.criterion}] ${exp ? questionFor(exp) : d.text}`;
    });
    for (const e of module.expectations) {
      const v = pc.contributions[e.code].value;
      if (v !== "full") qs.push(`[${e.code}, contribution ${v}] ${questionFor(e)}`);
    }
    for (const con of allContradictions) {
      if (con.control_ref === pc.ref && con.status === "open") {
        const vals = con.sources.map((x: any) => `${x.key}: '${x.value}'`).join("; ");
        qs.push(`[contradiction: ${con.subject}] Sources disagree (${vals}). Which governs, from what date, and why?`);
      }
    }
    qs.push(...(pc.extra_questions ?? []));
    delete pc.extra_questions;
    qs.push("[D7] Walk through one occurrence end to end with the performer, using the records the performer uses.");
    pc.walkthrough_questions = [...new Set(qs)].sort();
    for (const d of keptF) gaps.push({ kind: "criterion not defined", control: pc.control_id ?? pc.ref, severity: "warning", text: d.text });
  }

  for (const con of allContradictions) {
    await db.query("INSERT INTO contradictions (engagement_id, control_ref, subject, sources, sources_hash, materiality) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      [eng.id, con.control_ref, con.subject, j(con.sources), con.sources_hash, con.materiality]);
    const row = (await one(db, "SELECT id, status, sources_hash FROM contradictions WHERE engagement_id = $1 AND control_ref = $2 AND subject = $3", [eng.id, con.control_ref, con.subject]))!;
    if (row.status === "resolved" && row.sources_hash !== con.sources_hash) {
      await db.query("UPDATE contradictions SET status = 'stale', stale_reason = $1, sources = $2, sources_hash = $3 WHERE id = $4",
        ["the contradicting sources changed after the resolution; re-resolve against the current sources", j(con.sources), con.sources_hash, row.id]);
      await recordEvent(db, actor, "contradiction.stale", "contradiction", row.id, { control: con.control_ref, subject: con.subject });
    }
  }
  const current = new Set(allContradictions.map((c) => `${c.control_ref}\0${c.subject}`));
  const dbContras = await all(db, "SELECT * FROM contradictions WHERE engagement_id = $1 ORDER BY id", [eng.id]);
  for (const con of dbContras) {
    con.current = current.has(`${con.control_ref}\0${con.subject}`);
    if (con.current && ["open", "stale"].includes(con.status) && con.materiality === "material") {
      gaps.push({ kind: "contradiction", control: con.control_ref, severity: "blocking",
        text: `Material contradiction #${con.id} on '${con.subject}' for ${con.control_ref} is ${con.status}` + (con.status === "stale" ? ` (${con.stale_reason})` : "") + "; a qualified human must resolve it before approval." });
    }
  }

  const plan: any = {
    engagement: { name: eng.name, period: [eng.period_start, eng.period_end], as_of: eng.as_of, systems, modules_in_scope: data.modules.map((m) => m.code),
      modules_out_of_scope: data.all_modules.filter((m) => !(m.code in data.modulesByCode)).map((m) => m.code) },
    pins: { methodology_version: eng.methodology_version, methodology_document_hash: eng.methodology_hash, methodology_data_hash: data.data_hash, snapshot_id: snap.id, snapshot_hash: snap.record_hash },
    proposer: proposerLabel,
    gate: "G2 (planned procedures). Design outcomes and applicability are decided at G3 after walkthroughs.",
    coverage_cells: cells, coverage_units: units, controls: planControls,
    contradictions: dbContras, information_gaps: gaps,
    generated_by: actor, generated_at: now(),
  };
  plan.validation = validatePlan(plan, data);
  const sm = summary(plan);
  plan.review = { counts: sm.counts, approvable: sm.approvable };
  return plan;
}

export async function createPlanVersion(db: Db, actor: string, engagementId: number, plan: any, extra: { revision_of?: number | null; review_cycle?: number } = {}): Promise<number> {
  const prev = await one(db, "SELECT id, version, status FROM plan_versions WHERE engagement_id = $1 ORDER BY version DESC LIMIT 1", [engagementId]);
  const version = prev ? prev.version + 1 : 1;
  const h = hashOf(plan);
  const row = await one(db, "INSERT INTO plan_versions (engagement_id, version, status, content, content_hash, created_by, created_at, supersedes, revision_of, review_cycle) VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9) RETURNING id",
    [engagementId, version, j(plan), h, actor, now(), prev ? prev.id : null, extra.revision_of ?? null, extra.review_cycle ?? 0]);
  if (prev && prev.status === "draft") await db.query("UPDATE plan_versions SET status = 'superseded' WHERE id = $1", [prev.id]);
  await recordEvent(db, actor, "plan.draft", "plan_version", row!.id, { engagement_id: engagementId, version, content_hash: h, blocking_findings: plan.validation.filter((f: any) => f.severity === "blocking").length });
  return row!.id;
}

export async function getPlan(db: Db, engagementName: string, version?: number | null): Promise<any> {
  const eng = await one(db, "SELECT id FROM engagements WHERE name = $1", [engagementName]);
  if (!eng) throw new EngineError(`unknown engagement '${engagementName}'`);
  const row = version == null
    ? await one(db, "SELECT * FROM plan_versions WHERE engagement_id = $1 ORDER BY version DESC LIMIT 1", [eng.id])
    : await one(db, "SELECT * FROM plan_versions WHERE engagement_id = $1 AND version = $2", [eng.id, version]);
  if (!row) throw new EngineError("no plan version found");
  const { content, ...rest } = row;
  return { ...rest, plan: content };
}
