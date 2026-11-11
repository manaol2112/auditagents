/** Extraction: a confirmed mapping turns an uploaded RCM into canonical records, engine records (a frozen snapshot of
 * controls, risks, and facts with exact cell references), and intake findings (the import checks of the field standard,
 * section 12). The engine never fills a missing value; it records a finding. Findings on records that will be planned
 * (IT general controls, IT risks, and the systems they cover) are blocking; findings on business process controls, ITACs,
 * and IPE are warnings, because those are imported and linked but not planned until the methodology covers them. */
import { createHash } from "node:crypto";
import { recordEvent, requireRole } from "../audit.js";
import { Db, EngineError, hashOf, j, now, one, all } from "../db.js";
import * as identity from "../identity.js";
import { normalizeTimeframe } from "../intake.js";
import * as meth from "../methodology.js";
import { ATTRIBUTE_CRITERION, FIELD_ALIASES } from "../planning.js";
import { CATEGORIES, Category, FIELD_BY_KEY, Kind, PICKLISTS, ROLE_OBJECT, normHeader, normalizePick, splitMulti } from "./fields.js";
import { MappingConfirmation } from "./mapping.js";
import { loadSheets, getUpload } from "./upload.js";

export interface Cell { sheet: string; row: number; column: string; header: string | null }
interface Rec { kind: Kind; key: string; fields: Record<string, string | string[]>; raw: Record<string, string>; cells: Record<string, Cell>; source: Cell; line_no: number; client_attributes: Record<string, string>; inferred: Record<string, string> }
export interface Finding { severity: "blocking" | "warning" | "info"; check: string; kind: Kind | "rcm"; key: string | null; field: string | null; message: string; source: Cell | null }

const ITGC: Category = "IT general control";

// ---------------------------------------------------------------- modules

const MODULE_KEYWORDS: [string, string[]][] = [
  ["AC-PRIV", ["privileged", "superuser", "super user", "administrator access", "admin access", "admin accounts", "firefighter", "emergency access", "sap_all", "root access", "dba access", "elevated access", "break glass"]],
  ["AC-TERM", ["terminat", "leaver", "offboard", "deprovision", "transfer", "separation", "exit", "disable", "revok"]],
  ["AC-PROV", ["provision", "new user", "access request", "grant access", "granted", "onboard", "joiner", "new hire", "role request", "user creation", "access is requested"]],
  ["AC-UAR", ["access review", "user access review", "recertif", "certification", "review of user access", "review user access", "access recertification", "entitlement review", "user review"]],
  ["AC-AUTH", ["password", "authentication", "mfa", "multi factor", "multi-factor", "single sign", "sso", "lockout", "passphrase"]],
  ["AC-PHYS", ["physical", "data center", "datacenter", "server room", "badge", "keycard", "visitor"]],
  ["CM-DATA", ["data change", "direct data", "data fix", "data correction", "database update", "direct update", "backend change", "table update"]],
  ["DEV-SDLC", ["implementation", "data migration", "conversion", "new system", "go live", "go-live", "project", "upgrade", "development lifecycle", "sdlc", "system development"]],
  ["CM-CHG", ["change management", "program change", "change request", "transport", "deploy", "release", "cab", "code change", "configuration change", "emergency change", "pull request", "migration to production", "promoted to production"]],
  ["CO-JOB", ["batch", "job", "scheduler", "schedule", "interface monitoring", "job monitoring", "autosys", "control-m", "cron"]],
  ["CO-BKP", ["backup", "back up", "restore", "restoration", "replication", "recovery"]],
  ["CO-INC", ["incident", "problem management", "outage", "ticket escalation", "service desk"]],
  ["TP-SOC1", ["soc 1", "soc1", "soc report", "service organization", "service auditor", "ssae", "isae", "vendor report", "cuec"]],
];
const DOMAIN_OF: Record<string, string> = {
  "AC-UAR": "Access to programs and data", "AC-PRIV": "Access to programs and data", "AC-PROV": "Access to programs and data", "AC-TERM": "Access to programs and data",
  "AC-AUTH": "Access to programs and data", "AC-PHYS": "Access to programs and data", "CM-CHG": "Program change", "CM-DATA": "Program change",
  "DEV-SDLC": "Program development", "CO-JOB": "Computer operations", "CO-BKP": "Computer operations", "CO-INC": "Computer operations", "TP-SOC1": "Computer operations",
};

/** A module from a module cell: the code, the module's title, or the title's words. */
export function moduleFromText(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  const data = meth.load();
  const code = data.all_modules.find((m) => t === m.code || t.startsWith(m.code + " ") || t.includes(`(${m.code})`));
  if (code) return code.code;
  const n = normHeader(raw);
  const byTitle = data.all_modules.find((m) => normHeader(m.title) === n || n.includes(normHeader(m.title)));
  if (byTitle) return byTitle.code;
  const k = classifyModule(raw);
  return k && k.confidence !== "low" ? k.module : null;
}

/** A module proposed from control text, with the words that decided it. */
export function classifyModule(text: string): { module: string; confidence: "high" | "medium" | "low"; reason: string } | null {
  const t = text.toLowerCase();
  const scores = MODULE_KEYWORDS.map(([m, ws]) => [m, ws.filter((w) => t.includes(w))] as const).filter(([, hits]) => hits.length).sort((a, b) => b[1].length - a[1].length);
  if (!scores.length) return null;
  const [m, hits] = scores[0];
  const second = scores[1]?.[1].length ?? 0;
  const confidence = hits.length >= 2 && hits.length > second ? "high" : hits.length > second ? "medium" : "low";
  return { module: m, confidence, reason: `the control text mentions ${hits.map((h) => `'${h}'`).join(", ")}` + (second ? `; ${scores[1][0]} also matched` : "") };
}

// ---------------------------------------------------------------- operating criteria

const CRITERION_LABELS: Record<string, string> = {
  "review completion timeframe": "completion_timeframe", "completion timeframe": "completion_timeframe", "review timeframe": "completion_timeframe", "completion": "completion_timeframe",
  "removal timeframe": "removal_timeframe", "removal": "removal_timeframe", "access removal timeframe": "removal_timeframe", "termination timeframe": "removal_timeframe", "deprovisioning timeframe": "removal_timeframe",
  "transfer timeframe": "transfer_timeframe", "notification timeframe": "notification_timeframe",
  approver: "approver", "approved by": "approver", approval: "approver", "approval timing": "approval_timing", timing: "approval_timing",
  reviewer: "reviewer", "reviewed by": "reviewer", testing: "testing", "testing requirement": "testing", segregation: "segregation", "segregation of duties": "segregation",
  "emergency timeframe": "emergency_timeframe", "emergency changes": "emergency_timeframe", "emergency approver": "emergency_approver", "emergency window": "emergency_window",
  "password parameters": "password_parameters", password: "password_parameters", mfa: "mfa_scope", "mfa scope": "mfa_scope",
  "backup schedule": "backup_schedule", backup: "backup_schedule", "restore test frequency": "restore_test_frequency", "restore testing": "restore_test_frequency",
  "detection timeframe": "detection_timeframe", "resolution timeframe": "resolution_timeframe", "alert distribution": "alert_distribution", "monitoring timeframe": "monitoring_timeframe",
  "reconciliation frequency": "reconciliation_frequency", lookback: "lookback", "shared account rules": "shared_account_rules", "escalation rule": "escalation_rule",
};
const KNOWN_FIELDS = new Set(Object.values(ATTRIBUTE_CRITERION).map(([f]) => f));

/** "Removal timeframe: 5 business days; Approver: CAB" -> [[removal_timeframe, "5 business days"], [approver, "CAB"]]. Unlabelled text is not assigned. */
export function parseCriteria(raw: string): { pairs: [string, string][]; unparsed: string[] } {
  const pairs: [string, string][] = [], unparsed: string[] = [];
  for (const part of raw.split(/[;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const i = part.indexOf(":");
    if (i < 1) { unparsed.push(part); continue; }
    const label = normHeader(part.slice(0, i)), value = part.slice(i + 1).trim();
    const slug = label.replace(/ /g, "_");
    const field = CRITERION_LABELS[label] ?? (KNOWN_FIELDS.has(slug) ? slug : FIELD_ALIASES[slug]);
    if (field && value) pairs.push([field, value]); else unparsed.push(part);
  }
  return { pairs, unparsed };
}

// ---------------------------------------------------------------- records from the mapped sheets

const get = (r: Rec, k: string): string => { const v = r.fields[k]; return Array.isArray(v) ? v.join("; ") : v ?? ""; };
const list = (r: Rec, k: string): string[] => { const v = r.fields[k]; return Array.isArray(v) ? v : v ? splitMulti(v) : []; };

function readSheets(sheets: Awaited<ReturnType<typeof loadSheets>>, conf: MappingConfirmation, lineOf: Map<string, number>) {
  const recs: Rec[] = [];
  const header: Record<string, { value: string; cell: Cell }> = {};
  const findings: Finding[] = [];
  const headerFields = Object.values(FIELD_BY_KEY).filter((f) => f.object === "header");
  for (const sc of conf.sheets) {
    const sheet = sheets.find((s) => s.name === sc.sheet)!;
    if (sc.role === "header") {
      for (const r of sheet.rows) {
        const cols = Object.keys(r.cells).sort();
        if (cols.length < 2) continue;
        const label = normHeader(r.cells[cols[0]]);
        const f = headerFields.find((x) => normHeader(x.label) === label || x.synonyms.includes(label));
        if (f) header[f.key] = { value: r.cells[cols[1]], cell: { sheet: sheet.name, row: r.row_no, column: cols[1], header: r.cells[cols[0]] } };
      }
      continue;
    }
    const kind = ROLE_OBJECT[sc.role];
    if (!kind) continue;
    const headers = sheet.rows.find((r) => r.row_no === sc.header_row)?.cells ?? {};
    const idKey = `${kind}.id`;
    for (const row of sheet.rows) {
      if (row.row_no < sc.first_data_row) continue;
      const rec: Rec = { kind, key: "", fields: {}, raw: {}, cells: {}, source: { sheet: sheet.name, row: row.row_no, column: "A", header: null },
        line_no: lineOf.get(`${sheet.name}!${row.row_no}`)!, client_attributes: {}, inferred: {} };
      for (const [col, value] of Object.entries(row.cells)) {
        const key = sc.columns[col];
        const cell: Cell = { sheet: sheet.name, row: row.row_no, column: col, header: headers[col] ?? null };
        if (!key) { rec.client_attributes[headers[col] ?? col] = value; continue; }
        const f = FIELD_BY_KEY[key];
        rec.raw[key] = value;
        rec.cells[key] = cell;
        if (f.multi) rec.fields[key] = splitMulti(value);
        else rec.fields[key] = value;
      }
      for (const [k, v] of Object.entries(sc.defaults ?? {})) if (!(k in rec.fields)) { rec.fields[k] = FIELD_BY_KEY[k].multi ? splitMulti(v) : v; rec.inferred[k] = "sheet default set at mapping confirmation"; }
      const id = kind === "process" ? get(rec, "process.subprocess_id") || get(rec, "process.id") || get(rec, "process.subprocess_name") || get(rec, "process.name")
        : kind === "cuec" ? `${get(rec, "cuec.service_org")}/${get(rec, "cuec.id")}` : list(rec, idKey)[0] ?? get(rec, idKey);
      const nonEmpty = Object.keys(rec.fields).length + Object.keys(rec.client_attributes).length;
      if (!nonEmpty) continue;
      if (/^EX-/i.test(id)) continue;   // the template's example rows
      rec.key = id || `${sheet.name}!${row.row_no}`;
      if (!id) findings.push({ severity: kind === "control" ? "blocking" : "warning", check: "mandatory_missing", kind, key: rec.key, field: kind === "process" ? "process.id" : idKey,
        message: `${sheet.name} row ${row.row_no}: no ${FIELD_BY_KEY[kind === "process" ? "process.id" : idKey]?.label ?? "ID"}; the row is kept under its position.`, source: rec.source });
      rec.source = rec.cells[idKey] ?? rec.cells["process.id"] ?? rec.source;
      recs.push(rec);
    }
  }
  return { recs, header, findings };
}

// ---------------------------------------------------------------- extraction

export interface ExtractResult { snapshot_id: number; counts: Record<string, number>; findings: { blocking: number; warning: number; info: number } }

export async function extractUpload(db: Db, actor: string, uploadId: number): Promise<ExtractResult> {
  await requireRole(db, actor, "preparer", "approver");
  const up = await getUpload(db, uploadId);
  if (up.status === "extracted") throw new EngineError(`upload ${uploadId} has already been extracted (snapshot ${up.snapshot_id})`);
  const m = await one(db, "SELECT mapping, version FROM rcm_mappings WHERE upload_id = $1 ORDER BY version DESC LIMIT 1", [uploadId]);
  if (!m) throw new EngineError("confirm the column mapping before extracting");
  const conf: MappingConfirmation = m.mapping;
  const eng = (await one(db, "SELECT * FROM engagements WHERE name = $1", [up.engagement]))!;
  const data = meth.scoped(meth.load(), eng.modules);
  const sheets = await loadSheets(db, uploadId);
  const rowLines = await all(db, "SELECT sheet, row_no, line_no FROM rcm_rows WHERE upload_id = $1", [uploadId]);
  const lineOf = new Map(rowLines.map((r) => [`${r.sheet}!${r.row_no}`, r.line_no as number]));
  const docLines = Object.fromEntries((await all(db, "SELECT line_no, text FROM document_lines WHERE doc_id = $1", [up.doc_id])).map((r) => [r.line_no, r.text]));

  const { recs, header, findings } = readSheets(sheets, conf, lineOf);
  const F = (f: Finding) => findings.push(f);
  const byKind = (k: Kind) => recs.filter((r) => r.kind === k);
  const sheetHas = (k: Kind) => conf.sheets.some((s) => ROLE_OBJECT[s.role] === k);

  // Header.
  for (const k of ["header.client", "header.as_of", "header.period_start", "header.period_end", "header.prepared_by"]) {
    if (conf.sheets.some((s) => s.role === "header") && !header[k]) F({ severity: "warning", check: "mandatory_missing", kind: "rcm", key: null, field: k, message: `RCM header: ${FIELD_BY_KEY[k].label} is not stated.`, source: null });
  }

  // Denormalized one-sheet RCMs: risks, processes, systems, accounts described on control rows become records of their own.
  const controls = byKind("control");
  const ensure = (kind: Kind, key: string, fields: Record<string, string | string[]>, src: Rec) => {
    let r = recs.find((x) => x.kind === kind && x.key === key);
    if (!r) { r = { kind, key, fields: {}, raw: {}, cells: {}, source: src.source, line_no: src.line_no, client_attributes: {}, inferred: { _origin: `described on control ${src.key}` } }; recs.push(r); }
    for (const [k, v] of Object.entries(fields)) if (v && !(k in r.fields)) { r.fields[k] = v; if (src.cells[k]) r.cells[k] = src.cells[k]; }
    return r;
  };
  for (const c of controls) {
    if (get(c, "risk.statement")) {
      const ids = list(c, "control.risks");
      const id = ids[0] ?? "R-" + createHash("sha256").update(get(c, "risk.statement")).digest("hex").slice(0, 8);
      if (!ids.length) { c.fields["control.risks"] = [id]; c.inferred["control.risks"] = "risk ID derived from the risk statement on the control row"; }
      const rf: Record<string, string> = {};
      for (const k of ["risk.statement", "risk.rating", "risk.likelihood", "risk.magnitude", "risk.fraud", "risk.significant", "risk.category", "risk.itgc_domain"]) if (get(c, k)) rf[k] = get(c, k);
      ensure("risk", id, { "risk.id": id, ...rf }, c);
    }
    if (!sheetHas("system")) for (const s of list(c, "control.systems")) ensure("system", s, { "system.id": s, "system.name": s }, c);
    if (get(c, "system.name") && !list(c, "control.systems").length) c.fields["control.systems"] = splitMulti(get(c, "system.name"));
    if (!get(c, "control.process") && get(c, "process.name")) c.fields["control.process"] = get(c, "process.name");
    if (!get(c, "control.subprocess") && get(c, "process.subprocess_name")) c.fields["control.subprocess"] = get(c, "process.subprocess_name");
    if (!sheetHas("process") && get(c, "control.process")) ensure("process", get(c, "control.subprocess") || get(c, "control.process"),
      { "process.id": get(c, "control.process"), "process.name": get(c, "control.process"), ...(get(c, "control.subprocess") ? { "process.subprocess_id": get(c, "control.subprocess"), "process.subprocess_name": get(c, "control.subprocess") } : {}) }, c);
  }

  // Normalize picklists; keep the original text; report what is not recognized.
  for (const r of recs) for (const [k, v] of Object.entries(r.fields)) {
    const f = FIELD_BY_KEY[k];
    if (!f?.list || f.key === "control.itgc_module") continue;
    const vals = Array.isArray(v) ? v : [v];
    const norm = vals.map((x) => normalizePick(f.list!, x));
    if (norm.every((x) => x !== null)) r.fields[k] = Array.isArray(v) ? (norm as string[]) : norm[0]!;
    else F({ severity: "warning", check: "value_not_in_list", kind: r.kind, key: r.key, field: k,
      message: `${r.kind} ${r.key}: '${vals.find((_, i) => norm[i] === null)}' is not a recognized ${f.label} value; kept as written. Allowed: ${Object.keys(PICKLISTS[f.list!] ?? {}).join(", ")}.`, source: r.cells[k] ?? r.source });
  }

  // Category and module.
  for (const c of controls) {
    let cat = get(c, "control.category") as Category | "";
    if (!cat || !(CATEGORIES as readonly string[]).includes(cat)) {
      if (get(c, "control.itgc_module") || get(c, "control.itgc_domain") || (!sheetHas("account") && !get(c, "control.accounts_assertions") && conf.sheets.find((s) => s.role === "controls" && normHeader(s.sheet).includes("itgc")))) {
        cat = ITGC; c.fields["control.category"] = ITGC; c.inferred["control.category"] = get(c, "control.itgc_module") || get(c, "control.itgc_domain") ? "an ITGC domain or module is stated" : "the sheet is an ITGC matrix";
        F({ severity: "info", check: "category_inferred", kind: "control", key: c.key, field: "control.category", message: `Control ${c.key}: category recorded as IT general control because ${c.inferred["control.category"]}. Change it by setting a category column or a sheet default.`, source: c.source });
      }
    }
    if (cat !== ITGC) continue;
    const stated = get(c, "control.itgc_module");
    let module = stated ? moduleFromText(stated) : null;
    if (stated && !module) F({ severity: "blocking", check: "module_unrecognized", kind: "control", key: c.key, field: "control.itgc_module", message: `Control ${c.key}: '${stated}' is not one of the thirteen methodology modules.`, source: c.cells["control.itgc_module"] ?? c.source });
    if (!stated) {
      const k = classifyModule([get(c, "control.title"), get(c, "control.description"), get(c, "control.objective"), get(c, "control.itgc_domain"), get(c, "control.subprocess")].join(" "));
      if (k && k.confidence !== "low") {
        module = k.module; c.inferred["control.itgc_module"] = k.reason;
        F({ severity: "warning", check: "module_inferred", kind: "control", key: c.key, field: "control.itgc_module", message: `Control ${c.key}: mapped to ${k.module} because ${k.reason} (${k.confidence} confidence). Confirm, or state the module in the RCM.`, source: c.source });
      } else F({ severity: "blocking", check: "module_unresolved", kind: "control", key: c.key, field: "control.itgc_module", message: `Control ${c.key}: the methodology module cannot be determined${k ? ` (${k.reason})` : ""}; state it in the RCM.`, source: c.source });
    }
    if (module) {
      c.fields["control.itgc_module"] = module;
      if (!get(c, "control.itgc_domain")) { c.fields["control.itgc_domain"] = DOMAIN_OF[module]; c.inferred["control.itgc_domain"] = `domain of module ${module}`; }
      if (!(module in data.modulesByCode)) F({ severity: "info", check: "out_of_scope_module", kind: "control", key: c.key, field: "control.itgc_module", message: `Control ${c.key}: module ${module} is outside this engagement's scope; it will not be planned.`, source: c.source });
    }
  }

  // Mandatory and conditional fields by category.
  const sev = (c: Rec) => (get(c, "control.category") === ITGC ? "blocking" : "warning") as Finding["severity"];
  const mandatory = Object.values(FIELD_BY_KEY).filter((f) => f.req === "M");
  for (const r of recs) {
    for (const f of mandatory.filter((x) => x.object === r.kind)) {
      if (f.key === "process.subprocess_id" || f.key === "process.subprocess_name" || (r.kind === "risk" && ["risk.process", "risk.subprocess"].includes(f.key))) continue;   // derived records may lack them
      if (r.kind === "risk" && f.key === "risk.category" && r.inferred._origin) continue;
      if (r.kind === "system" && r.inferred._origin && f.key !== "system.name") continue;     // systems named on control rows: reported once below
      const v = r.fields[f.key];
      if (v === undefined || (Array.isArray(v) ? !v.length : !String(v).trim())) {
        const blocking = r.kind === "control" ? sev(r) === "blocking" : r.kind === "risk" ? controls.some((c) => list(c, "control.risks").includes(r.key) && get(c, "control.category") === ITGC) : false;
        F({ severity: blocking ? "blocking" : "warning", check: "mandatory_missing", kind: r.kind, key: r.key, field: f.key, message: `${r.kind} ${r.key}: ${f.label} is missing.`, source: r.source });
      }
    }
  }
  for (const c of controls) {
    const cat = get(c, "control.category") as Category;
    const need = (k: string, why: string, s: Finding["severity"] = sev(c)) => { if (!get(c, k)) F({ severity: s, check: "conditional_missing", kind: "control", key: c.key, field: k, message: `Control ${c.key}: ${FIELD_BY_KEY[k].label} is required ${why}.`, source: c.source }); };
    for (const f of Object.values(FIELD_BY_KEY).filter((x) => x.object === "control" && x.applies_to?.includes(cat))) need(f.key, `for ${cat}s`, cat === ITGC && f.key === "control.layers" ? "warning" : sev(c));
    if (get(c, "control.frequency") === "Event-driven" && cat === ITGC) need("control.population_source", "for event-driven ITGCs: the system record of every occurrence (a ticket list alone does not show completeness)");
    if (get(c, "control.status") && get(c, "control.status") !== "Active") need("control.effective_date", `when the status is ${get(c, "control.status")}`);
    if (get(c, "control.is_mrc") === "Yes") for (const k of ["control.review_objective", "control.precision", "control.expectation", "control.investigation_threshold", "control.investigation_resolution"]) need(k, "for management review controls (Staff Audit Practice Alert No. 11)", "warning");
    if (cat === "IT application control" && get(c, "control.nature") && get(c, "control.nature") !== "Automated")
      F({ severity: "warning", check: "category_nature_mismatch", kind: "control", key: c.key, field: "control.nature", message: `Control ${c.key}: an IT application control is recorded as ${get(c, "control.nature")}; one of the two is wrong. Neither is changed.`, source: c.cells["control.nature"] ?? c.source });
    if (get(c, "control.description") && get(c, "control.description").split(/\s+/).length < 8)
      F({ severity: "warning", check: "description_too_brief", kind: "control", key: c.key, field: "control.description", message: `Control ${c.key}: the description is too brief to show who performs it, what they do, when, how, and what evidence is kept (design criterion D1).`, source: c.cells["control.description"] ?? c.source });
    if (!list(c, "control.ipe").length && /\b(report|listing|list of|extract|query|log)\b/i.test(get(c, "control.description")))
      F({ severity: "warning", check: "ipe_not_recorded", kind: "control", key: c.key, field: "control.ipe", message: `Control ${c.key}: the description relies on a report, listing, extract, or log, but no IPE is recorded; its completeness and accuracy must be addressed (AS 1105.10).`, source: c.source });
  }

  // References, links, and duplicates.
  const keys = (k: Kind) => new Set(byKind(k).flatMap((r) => [r.key, get(r, `${k}.name`)].filter(Boolean)));
  const ref = (c: Rec, field: string, kind: Kind, s: Finding["severity"]) => {
    if (!sheetHas(kind) && kind !== "risk") return;
    const known = keys(kind);
    for (const v of list(c, field)) if (!known.has(v)) F({ severity: s, check: "unknown_reference", kind: c.kind, key: c.key, field, message: `${c.kind} ${c.key}: ${FIELD_BY_KEY[field].label} '${v}' is not defined on the ${kind} list.`, source: c.cells[field] ?? c.source });
  };
  for (const c of controls) {
    if (sheetHas("risk")) ref(c, "control.risks", "risk", sev(c));
    ref(c, "control.systems", "system", sev(c));
    ref(c, "control.ipe", "ipe", "warning");
  }
  const seen = new Map<string, Rec>();
  for (const c of controls) {
    if (seen.has(c.key)) F({ severity: "blocking", check: "duplicate_id", kind: "control", key: c.key, field: "control.id", message: `Control ID ${c.key} appears more than once (rows ${seen.get(c.key)!.source.row} and ${c.source.row}).`, source: c.source });
    else seen.set(c.key, c);
  }
  const controlled = new Set(controls.flatMap((c) => list(c, "control.risks")));
  for (const r of byKind("risk")) if (!controlled.has(r.key)) F({ severity: "warning", check: "risk_without_control", kind: "risk", key: r.key, field: null, message: `Risk ${r.key} is not addressed by any control.`, source: r.source });
  const itgcs = controls.filter((c) => get(c, "control.category") === ITGC);
  for (const c of controls.filter((x) => get(x, "control.category") === "IT application control")) {
    for (const id of list(c, "control.supporting_itgcs")) if (!itgcs.some((g) => g.key === id)) F({ severity: "warning", check: "itac_without_itgc", kind: "control", key: c.key, field: "control.supporting_itgcs", message: `Control ${c.key}: supporting ITGC '${id}' is not an IT general control in this RCM.`, source: c.cells["control.supporting_itgcs"] ?? c.source });
    for (const s of list(c, "control.systems")) if (!itgcs.some((g) => list(g, "control.systems").includes(s))) F({ severity: "warning", check: "itac_without_itgc", kind: "control", key: c.key, field: "control.systems", message: `Control ${c.key}: system ${s} has no IT general controls in this RCM, so reliance on the automated control is not supported.`, source: c.source });
  }
  for (const i of byKind("ipe")) {
    if (["Custom", "Query / ad hoc", "End-user computing (spreadsheet)"].includes(get(i, "ipe.type")) && !get(i, "ipe.ca_control"))
      F({ severity: "warning", check: "ipe_without_ca", kind: "ipe", key: i.key, field: "ipe.ca_control", message: `IPE ${i.key} (${get(i, "ipe.type")}): no approach to its completeness and accuracy is recorded (AS 1105.10).`, source: i.source });
  }
  for (const s of byKind("system")) {
    const used = itgcs.some((g) => list(g, "control.systems").some((x) => x === s.key || x === get(s, "system.name")));
    if (get(s, "system.hosting") === "SaaS" && !get(s, "system.service_org")) F({ severity: used ? "blocking" : "warning", check: "outsourced_without_service_org", kind: "system", key: s.key, field: "system.service_org", message: `System ${s.key} is SaaS but no service organization is recorded (SOC report and CUECs).`, source: s.source });
  }
  const engSystems: string[] = eng.systems;
  const canonSystem = (s: string) => {
    const sys = byKind("system").find((x) => x.key === s || get(x, "system.name") === s);
    const name = sys ? get(sys, "system.name") || s : s;
    return engSystems.find((e) => normHeader(e) === normHeader(name) || normHeader(e) === normHeader(s)) ?? name;
  };
  for (const c of itgcs) for (const s of list(c, "control.systems")) if (!engSystems.includes(canonSystem(s)))
    F({ severity: "info", check: "system_out_of_scope", kind: "control", key: c.key, field: "control.systems", message: `Control ${c.key}: system '${s}' is not one of the engagement's in-scope systems (${engSystems.join(", ")}).`, source: c.source });
  for (const e of engSystems) if (!itgcs.some((c) => list(c, "control.systems").map(canonSystem).includes(e)))
    F({ severity: "warning", check: "system_without_itgc", kind: "rcm", key: e, field: null, message: `In-scope system ${e} has no IT general controls in the RCM.`, source: null });

  // ---------------------------------------------------------------- persist
  const snap = (await one(db, "INSERT INTO snapshots (client_id, created_by, created_at, record_hash) VALUES ($1,$2,$3,'pending') RETURNING id", [eng.client_id, actor, now()]))!;
  const digest = createHash("sha256");
  const facts: unknown[][] = [];
  const fact = (ref: string, subject: string, field: string, value: string, cls: string, line: number, cell: Cell | null) => {
    if (!value) return;
    facts.push([snap.id, subject, ref, field, value, "extracted", cls, up.doc_id, line, cell ? j(cell) : null]);
    digest.update(`fact|${subject}|${ref}|${field}|${value}|${line}\n`);
  };
  for (const r of byKind("risk")) {
    const ctrlModules = controls.filter((c) => list(c, "control.risks").includes(r.key)).map((c) => get(c, "control.itgc_module")).filter(Boolean);
    const category = get(r, "risk.category") === "Business process" ? "business process" : ctrlModules.length ? data.all_modules.find((m) => m.code === ctrlModules[0])!.risk_category : (get(r, "risk.category") || "").toLowerCase();
    await db.query("INSERT INTO risks (snapshot_id, ref, statement, element, assertions, category, doc_id, line_no) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [snap.id, r.key, get(r, "risk.statement"), list(r, "risk.accounts").join("; "), list(r, "risk.assertions").join("; "), category, up.doc_id, r.line_no]);
    fact(r.key, "risk", "statement", get(r, "risk.statement"), "environment", r.line_no, r.cells["risk.statement"] ?? null);
    fact(r.key, "risk", "category", category, "environment", r.line_no, r.cells["risk.category"] ?? null);
    digest.update(`risk|${r.key}|${get(r, "risk.statement")}|${category}\n`);
  }
  const engineControls: any[] = [];
  for (const c of controls) {
    const module = get(c, "control.itgc_module") || null;
    const mod = module ? data.all_modules.find((m) => m.code === module) : undefined;
    const systems = [...new Set(list(c, "control.systems").map(canonSystem))];
    engineControls.push({ ref: c.key, description: get(c, "control.description"), doc_id: up.doc_id, line_no: c.line_no,
      control_type: mod ? mod.control_types[0] : (get(c, "control.category") || "unclassified").toLowerCase(), frequency: get(c, "control.frequency"),
      owner: get(c, "control.owner"), systems, risk_refs: list(c, "control.risks"), category: get(c, "control.category") || null, module });
    const cell = (k: string) => c.cells[k] ?? null;
    fact(c.key, "control", "description", get(c, "control.description"), "description", c.line_no, cell("control.description"));
    fact(c.key, "control", "frequency", get(c, "control.frequency"), "description", c.line_no, cell("control.frequency"));
    fact(c.key, "control", "owner", get(c, "control.owner"), "practice", c.line_no, cell("control.owner"));
    fact(c.key, "control", "systems", systems.join("; "), "environment", c.line_no, cell("control.systems"));
    for (const k of ["control.evidence", "control.population_source", "control.layers", "control.performer"]) fact(c.key, "control", k.split(".")[1], get(c, k), "practice", c.line_no, cell(k));
    // Client-stated operating criteria, each from its exact cell.
    const reviewer = get(c, "control.reviewer");
    if (reviewer) fact(c.key, "control", module === "AC-UAR" || module === "AC-PHYS" ? "reviewer" : "approver", reviewer, "description", c.line_no, cell("control.reviewer"));
    if (get(c, "control.operating_criteria")) {
      const { pairs, unparsed } = parseCriteria(get(c, "control.operating_criteria"));
      for (const [field, value] of pairs) fact(c.key, "control", field, value, "description", c.line_no, cell("control.operating_criteria"));
      if (unparsed.length) F({ severity: "info", check: "criteria_unlabelled", kind: "control", key: c.key, field: "control.operating_criteria", message: `Control ${c.key}: operating criteria text without a label was not assigned to a criterion: '${unparsed.join("; ").slice(0, 160)}'. Use 'Label: value' pairs.`, source: cell("control.operating_criteria") });
    }
    if (get(c, "control.thresholds")) fact(c.key, "control", "thresholds", get(c, "control.thresholds"), "description", c.line_no, cell("control.thresholds"));
    // The same description-derived criteria the structured RCM parser has always read.
    const tf = normalizeTimeframe(get(c, "control.description"));
    if (tf && module === "AC-UAR" && !(get(c, "control.operating_criteria") && /removal/i.test(get(c, "control.operating_criteria")))) fact(c.key, "control", "removal_timeframe", tf, "description", c.line_no, cell("control.description"));
    const ap = /approved by (?:the )?(.+?) before/i.exec(get(c, "control.description"));
    if (ap && !reviewer) { fact(c.key, "control", "approver", ap[1].trim(), "description", c.line_no, cell("control.description")); fact(c.key, "control", "approval_timing", "before", "description", c.line_no, cell("control.description")); }
  }
  identity.assign(engineControls, [{ id: up.doc_id, doc_type: "rcm", lines: docLines }]);
  for (const c of engineControls) {
    await db.query("INSERT INTO controls (snapshot_id, control_id, identity_basis, ref, description, control_type, frequency, owner, systems, risk_refs, status, doc_id, line_no, category, module) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'candidate',$11,$12,$13,$14)",
      [snap.id, c.control_id, c.identity_basis, c.ref, c.description, c.control_type, c.frequency, c.owner, j(c.systems), j(c.risk_refs), c.doc_id, c.line_no, c.category, c.module]);
    digest.update(`control|${c.control_id}|${c.description}|${c.category}|${c.module}|${c.frequency}\n`);
  }
  for (let i = 0; i < facts.length; i += 400) {
    const chunk = facts.slice(i, i + 400);
    await db.query(`INSERT INTO facts (snapshot_id, subject_type, subject_ref, field, value, basis, fact_class, doc_id, line_no, cell) VALUES ${chunk.map((_, r) => "(" + Array.from({ length: 10 }, (_, k) => `$${r * 10 + k + 1}`).join(",") + ")").join(",")}`, chunk.flat());
  }
  const seenRec = new Set<string>();
  for (const r of recs) {
    const id = `${r.kind}|${r.key}`;
    if (seenRec.has(id)) continue;   // a duplicate ID was reported; the first row is the record
    seenRec.add(id);
    await db.query("INSERT INTO rcm_records (snapshot_id, upload_id, kind, key, fields, client_attributes, source) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [snap.id, uploadId, r.kind, r.key, j({ ...r.fields, ...(Object.keys(r.inferred).length ? { _inferred: r.inferred } : {}) }), j(r.client_attributes), j(r.source)]);
  }
  for (const f of findings) {
    await db.query("INSERT INTO intake_findings (upload_id, snapshot_id, severity, check_code, record_kind, record_key, field, message, source, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [uploadId, snap.id, f.severity, f.check, f.kind, f.key, f.field, f.message, f.source ? j(f.source) : null, now()]);
  }
  digest.update(hashOf({ upload: up.sha256, mapping_version: m.version }));
  const recordHash = digest.digest("hex");
  await db.query("UPDATE snapshots SET record_hash = $1 WHERE id = $2", [recordHash, snap.id]);
  await identity.linkToPrior(db, actor, eng.client_id, snap.id, engineControls);
  await db.query("UPDATE rcm_uploads SET status = 'extracted', snapshot_id = $1 WHERE id = $2", [snap.id, uploadId]);
  await db.query("UPDATE engagements SET snapshot_id = $1 WHERE id = $2", [snap.id, eng.id]);
  const counts: Record<string, number> = {};
  for (const k of ["entity", "process", "account", "system", "ipe", "risk", "control", "service_org", "cuec"]) counts[k] = new Set(byKind(k as Kind).map((r) => r.key)).size;
  counts.itgc_controls = new Set(itgcs.map((c) => c.key)).size;
  const tally = { blocking: findings.filter((f) => f.severity === "blocking").length, warning: findings.filter((f) => f.severity === "warning").length, info: findings.filter((f) => f.severity === "info").length };
  await recordEvent(db, actor, "snapshot.freeze", "snapshot", snap.id, { client_id: eng.client_id, extractor: "rcm", upload_id: uploadId, mapping_version: m.version, counts, findings: tally, record_hash: recordHash });
  await recordEvent(db, actor, "engagement.repin", "engagement", eng.id, { snapshot_id: snap.id, reason: `RCM upload ${uploadId} extracted` });
  return { snapshot_id: snap.id, counts, findings: tally };
}

export async function intakeFindings(db: Db, uploadId: number): Promise<any[]> {
  return all(db, "SELECT id, upload_id, severity, check_code AS check, record_kind, record_key, field, message, source, status, human_note, human_by, human_at FROM intake_findings WHERE upload_id = $1 ORDER BY CASE severity WHEN 'blocking' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, id", [uploadId]);
}

export async function acceptIntakeFinding(db: Db, actor: string, id: number, reason: string): Promise<any> {
  await requireRole(db, actor, "approver");
  if (!reason || !reason.trim()) throw new EngineError("accepting a finding needs the approver's reasoning");
  const f = await one(db, "SELECT * FROM intake_findings WHERE id = $1", [id]);
  if (!f) throw new EngineError("unknown intake finding");
  if (f.status !== "open") throw new EngineError("this finding already has a human decision");
  await db.query("UPDATE intake_findings SET status = 'accepted_by_human', human_note = $1, human_by = $2, human_at = $3 WHERE id = $4", [reason, actor, now(), id]);
  await recordEvent(db, actor, "intake.accept", "intake_finding", id, { reason, check: f.check_code, record: `${f.record_kind}:${f.record_key}` });
  return one(db, "SELECT id, severity, check_code AS check, record_kind, record_key, field, message, source, status, human_note, human_by, human_at FROM intake_findings WHERE id = $1", [id]);
}

/** Open blocking intake findings on the snapshot an engagement is pinned to. Planning is refused while any remain. */
export async function openBlocking(db: Db, snapshotId: number | null): Promise<any[]> {
  if (!snapshotId) return [];
  return all(db, "SELECT id, record_kind, record_key, message FROM intake_findings WHERE snapshot_id = $1 AND severity = 'blocking' AND status = 'open' ORDER BY id", [snapshotId]);
}

export async function records(db: Db, uploadId: number, kind?: string): Promise<any[]> {
  return all(db, "SELECT kind, key, fields, client_attributes, source FROM rcm_records WHERE upload_id = $1 AND ($2::text IS NULL OR kind = $2) ORDER BY id", [uploadId, kind ?? null]);
}
