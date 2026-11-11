/** Column mapping: propose how each sheet and column of an uploaded RCM matches the canonical fields. Deterministic, so the
 * same file always gets the same proposal; the optional mapping agent (mappingAgent.ts) refines what this leaves open.
 * Nothing is extracted until a person confirms a mapping. */
import { EngineError } from "../db.js";
import { FIELDS, FIELD_BY_KEY, FieldDef, Kind, PICKLISTS, ROLE_OBJECT, SHEET_NAME_SYNONYMS, SheetRole, normHeader, normalizePick, splitMulti } from "./fields.js";
import { ParsedSheet, columnLetter } from "./parse.js";

export type Confidence = "high" | "medium" | "low";
export interface ColumnProposal { column: string; header: string | null; samples: string[]; field: string | null; confidence: Confidence;
  method: "template" | "header" | "values" | "model" | "none"; reason: string; alternatives: string[] }
export interface SheetProposal { sheet: string; role: SheetRole; role_confidence: Confidence; header_row: number; first_data_row: number; columns: ColumnProposal[] }
export interface MappingProposal { profile: "soxplan-template" | "optro" | "generic"; sheets: SheetProposal[]; warnings: string[] }
export interface SheetConfirmation { sheet: string; role: SheetRole; header_row: number; first_data_row: number; columns: Record<string, string | null>; defaults?: Record<string, string> }
export interface MappingConfirmation { sheets: SheetConfirmation[] }

const REQUIREMENT_WORDS = new Set(["mandatory", "conditional", "recommended", "calculated", "required", "optional"]);
/** Fields of other objects that commonly sit on a one-sheet RCM next to the control columns. */
const CROSS_ON_CONTROLS = ["risk.statement", "risk.rating", "risk.likelihood", "risk.magnitude", "risk.fraud", "risk.significant", "risk.category", "risk.itgc_domain",
  "process.name", "process.subprocess_name", "account.name", "system.name", "system.hosting", "entity.name"];

function fieldsForRole(role: SheetRole): FieldDef[] {
  const obj = ROLE_OBJECT[role];
  if (!obj) return [];
  const own = FIELDS.filter((f) => f.object === obj);
  return role === "controls" ? [...own, ...CROSS_ON_CONTROLS.map((k) => FIELD_BY_KEY[k])] : own;
}

function tokens(s: string): Set<string> {
  return new Set(normHeader(s).split(" ").filter((t) => t.length > 1 && !["the", "of", "and", "or", "to", "a", "an", "is", "id", "no"].includes(t)));
}

function overlap(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / Math.max(ta.size, tb.size);
}

/** Fraction of sample values a picklist recognizes (each value of a multi-value cell counts). */
function valueFit(list: string, samples: string[], multi = false): number {
  const vals = samples.flatMap((s) => (multi ? splitMulti(s) : [s]));
  if (!vals.length) return 0;
  return vals.filter((v) => normalizePick(list, v) !== null).length / vals.length;
}

/** Sheet role from its name, then from how well its likely header row matches each object's fields. */
function roleFor(sheet: ParsedSheet): [SheetRole, Confidence] {
  const n = normHeader(sheet.name);
  for (const [role, names] of Object.entries(SHEET_NAME_SYNONYMS) as [SheetRole, string[]][]) if (names.includes(n)) return [role, "high"];
  for (const [role, names] of Object.entries(SHEET_NAME_SYNONYMS) as [SheetRole, string[]][]) if (names.some((x) => x.length > 3 && n.includes(x))) return [role, "medium"];
  let best: [SheetRole, number] = ["ignore", 0];
  for (const role of ["controls", "risks", "systems", "ipe", "processes", "accounts", "entities", "service_organizations", "cuecs"] as SheetRole[]) {
    const fields = FIELDS.filter((f) => f.object === ROLE_OBJECT[role]);
    for (const r of sheet.rows.slice(0, 20)) {
      const score = Object.values(r.cells).filter((v) => fields.some((f) => f.synonyms.includes(normHeader(v)) || normHeader(f.label) === normHeader(v))).length;
      if (score > best[1]) best = [role, score];
    }
  }
  return best[1] >= 3 ? [best[0], "medium"] : best[1] >= 1 ? [best[0], "low"] : ["ignore", "low"];
}

function headerRow(sheet: ParsedSheet, role: SheetRole): number {
  const fields = role === "ignore" ? FIELDS : fieldsForRole(role);
  let best = { row: sheet.rows[0]?.row_no ?? 1, score: -1 };
  for (const r of sheet.rows.slice(0, 20)) {
    const vals = Object.values(r.cells);
    const score = vals.filter((v) => fields.some((f) => normHeader(f.label) === normHeader(v) || f.synonyms.includes(normHeader(v)))).length;
    if (score > best.score) best = { row: r.row_no, score };
  }
  return best.row;
}

function firstDataRow(sheet: ParsedSheet, header: number): number {
  for (const r of sheet.rows) {
    if (r.row_no <= header) continue;
    const vals = Object.values(r.cells).map((v) => normHeader(v));
    if (vals.length && vals.every((v) => REQUIREMENT_WORDS.has(v))) continue;   // the template's requirement row
    return r.row_no;
  }
  return header + 1;
}

const isTemplateHeader = (h: string, f: FieldDef) => normHeader(h) === normHeader(f.label);

function proposeColumn(col: string, header: string | null, samples: string[], fields: FieldDef[], role: SheetRole): ColumnProposal {
  const base = { column: col, header, samples, alternatives: [] as string[] };
  if (!header) {
    for (const f of fields.filter((x) => x.list && x.list !== "yesno")) {
      if (valueFit(f.list!, samples, f.multi) >= 0.8) return { ...base, field: f.key, confidence: "low", method: "values", reason: `no header; ${Math.round(valueFit(f.list!, samples, f.multi) * 100)}% of the values are ${f.label} values` };
    }
    return { ...base, field: null, confidence: "low", method: "none", reason: "no header and no recognizable values; kept as a client attribute" };
  }
  const h = normHeader(header);
  if (h === "missing mandatory fields") return { ...base, field: null, confidence: "high", method: "template", reason: "the template's calculated completeness column; not imported" };
  const template = fields.find((f) => isTemplateHeader(header, f));
  // Exact synonym matches, own object first.
  const exact = fields.filter((f) => isTemplateHeader(header, f) || f.synonyms.includes(h));
  const own = exact.filter((f) => f.object === ROLE_OBJECT[role]);
  let pick = template ?? own[0] ?? exact[0];
  let method: ColumnProposal["method"] = template ? "template" : pick ? "header" : "none";
  let confidence: Confidence = pick ? (exact.length > 1 && !template ? "medium" : "high") : "low";
  let reason = pick ? (template ? "matches the RCM template's column" : `header '${header}' is a known name for ${pick.label}`) : "";
  const alternatives = exact.filter((f) => f !== pick).map((f) => f.key);
  // Values over headers for picklist columns: "Control Type" may hold preventive/detective or manual/automated values.
  const listFields = fields.filter((f) => f.list);
  if (samples.length) {
    const fits = listFields.map((f) => [f, valueFit(f.list!, samples, f.multi)] as const).filter(([, v]) => v >= 0.8);
    const pickFit = pick?.list ? valueFit(pick.list, samples, pick.multi) : null;
    if (pick?.list && pickFit !== null && pickFit < 0.5) {
      const better = fits.filter(([f]) => f.list !== "yesno").sort((a, b) => b[1] - a[1])[0];
      if (better) {
        reason = `header '${header}' suggests ${pick.label}, but ${Math.round(better[1] * 100)}% of its values are ${better[0].label} values (${samples.slice(0, 3).join(", ")}); mapped by values`;
        alternatives.unshift(pick.key);
        pick = better[0]; method = "values"; confidence = "medium";
      }
    } else if (!pick) {
      const byVal = fits.filter(([f]) => f.list !== "yesno").sort((a, b) => b[1] - a[1])[0];
      if (byVal) { pick = byVal[0]; method = "values"; confidence = "medium"; reason = `${Math.round(byVal[1] * 100)}% of the values are ${byVal[0].label} values`; }
    }
  }
  if (!pick) {
    // Loose header match: shared words with a label or synonym.
    const scored = fields.map((f) => [f, Math.max(overlap(header, f.label), ...f.synonyms.map((s) => overlap(header, s)))] as const)
      .filter(([, s]) => s >= 0.5).sort((a, b) => b[1] - a[1] || (a[0].object === ROLE_OBJECT[role] ? -1 : 1));
    if (scored.length) {
      pick = scored[0][0]; method = "header"; confidence = scored[0][1] >= 0.75 ? "medium" : "low";
      reason = `header '${header}' shares words with ${pick.label}`;
      alternatives.push(...scored.slice(1, 4).map(([f]) => f.key));
    }
  }
  if (!pick) return { ...base, field: null, confidence: "low", method: "none", reason: `no canonical field matches '${header}'; kept as a client attribute` };
  return { ...base, field: pick.key, confidence, method, reason, alternatives: [...new Set(alternatives)].filter((k) => k !== pick!.key).slice(0, 4) };
}

function proposeSheet(sheet: ParsedSheet): SheetProposal {
  const [role, roleConf] = roleFor(sheet);
  if (role === "lists" || role === "instructions" || role === "ignore" || role === "header") {
    const hr = sheet.rows[0]?.row_no ?? 1;
    return { sheet: sheet.name, role, role_confidence: roleConf, header_row: hr, first_data_row: hr + (role === "header" ? 1 : 0), columns: [] };
  }
  const hr = headerRow(sheet, role);
  const fdr = firstDataRow(sheet, hr);
  const headers = sheet.rows.find((r) => r.row_no === hr)?.cells ?? {};
  const data = sheet.rows.filter((r) => r.row_no >= fdr);
  const fields = fieldsForRole(role);
  const columns: ColumnProposal[] = [];
  for (let c = 1; c <= sheet.max_column; c++) {
    const col = columnLetter(c);
    const samples = [...new Set(data.map((r) => r.cells[col]).filter(Boolean))].slice(0, 5);
    if (!headers[col] && !samples.length) continue;
    columns.push(proposeColumn(col, headers[col] ?? null, samples, fields, role));
  }
  // One column per single-value field: keep the best, release the others.
  const rank = { high: 3, medium: 2, low: 1 } as const;
  const byField = new Map<string, ColumnProposal[]>();
  for (const p of columns) if (p.field && !FIELD_BY_KEY[p.field]?.multi) byField.set(p.field, [...(byField.get(p.field) ?? []), p]);
  for (const [field, ps] of byField) {
    if (ps.length < 2) continue;
    ps.sort((a, b) => rank[b.confidence] - rank[a.confidence] || (a.method === "template" ? -1 : 0));
    for (const p of ps.slice(1)) {
      p.alternatives = [field, ...p.alternatives].slice(0, 4);
      p.reason = `also looks like ${FIELD_BY_KEY[field].label}, which column ${ps[0].column} already supplies; kept as a client attribute`;
      p.field = null; p.method = "none"; p.confidence = "low";
    }
  }
  return { sheet: sheet.name, role, role_confidence: roleConf, header_row: hr, first_data_row: fdr, columns };
}

export function proposeMapping(sheets: ParsedSheet[]): MappingProposal {
  const props = sheets.map(proposeSheet);
  const warnings: string[] = [];
  const all = props.flatMap((p) => p.columns);
  const templateCols = all.filter((c) => c.method === "template").length;
  const headers = new Set(all.map((c) => normHeader(c.header)));
  const profile = templateCols >= Math.max(5, all.length * 0.6) ? "soxplan-template" : headers.has("uid") || headers.has("control weight") || (headers.has("subprocess") && headers.has("name")) ? "optro" : "generic";
  if (profile === "optro") warnings.push("This looks like an Optro (formerly AuditBoard) export. Optro's field names are not publicly documented; the mapping is based on the known API names (uid, name, process, subprocess) and common labels. Check every column.");
  for (const c of all) if (c.method === "values" && c.header) warnings.push(`Column ${c.column} ('${c.header}'): ${c.reason}.`);
  if (!props.some((p) => p.role === "controls")) warnings.push("No sheet was recognized as the controls list. Set the role of the sheet that lists the controls.");
  return { profile, sheets: props, warnings };
}

/** The confirmation a person would make if they accepted the proposal as it stands. */
export function proposalAsConfirmation(p: MappingProposal): MappingConfirmation {
  return { sheets: p.sheets.map((s) => ({ sheet: s.sheet, role: s.role, header_row: s.header_row, first_data_row: s.first_data_row,
    columns: Object.fromEntries(s.columns.map((c) => [c.column, c.field])) })) };
}

/** Structural minimum for a confirmation; missing mandatory columns are reported as warnings (they become intake findings). */
export function validateConfirmation(conf: MappingConfirmation, sheets: ParsedSheet[]): { warnings: string[] } {
  if (!conf || !Array.isArray(conf.sheets)) throw new EngineError("the confirmation must list the sheets");
  const names = new Set(sheets.map((s) => s.name));
  const seen = new Set<string>();
  for (const s of conf.sheets) {
    if (!names.has(s.sheet)) throw new EngineError(`unknown sheet '${s.sheet}'`);
    if (seen.has(s.sheet)) throw new EngineError(`sheet '${s.sheet}' is listed twice`);
    seen.add(s.sheet);
    if (!(s.role in SHEET_NAME_SYNONYMS)) throw new EngineError(`unknown sheet role '${s.role}'`);
    const obj = ROLE_OBJECT[s.role];
    if (!Number.isInteger(s.header_row) || !Number.isInteger(s.first_data_row) || s.header_row < 1) throw new EngineError(`sheet '${s.sheet}': header and first data rows must be row numbers`);
    if (obj && obj !== "header" && s.first_data_row <= s.header_row) throw new EngineError(`sheet '${s.sheet}': the first data row must come after the header row`);
    for (const [col, key] of Object.entries(s.columns ?? {})) {
      if (!/^[A-Z]{1,3}$/.test(col)) throw new EngineError(`sheet '${s.sheet}': '${col}' is not a column letter`);
      if (key !== null && !(key in FIELD_BY_KEY)) throw new EngineError(`sheet '${s.sheet}' column ${col}: unknown field '${key}'`);
    }
    for (const [key, v] of Object.entries(s.defaults ?? {})) {
      const f = FIELD_BY_KEY[key];
      if (!f) throw new EngineError(`sheet '${s.sheet}': unknown default field '${key}'`);
      if (f.list && normalizePick(f.list, v) === null && f.key !== "control.itgc_module") throw new EngineError(`sheet '${s.sheet}': '${v}' is not a ${f.label} value`);
      if (obj && f.object !== obj) throw new EngineError(`sheet '${s.sheet}': default '${key}' is not a ${obj} field`);
    }
  }
  const controls = conf.sheets.filter((s) => s.role === "controls");
  if (!controls.length) throw new EngineError("no sheet has the role 'controls'");
  const warnings: string[] = [];
  for (const s of controls) {
    const mapped = new Set(Object.values(s.columns).filter(Boolean) as string[]);
    for (const k of ["control.id", "control.description"]) if (!mapped.has(k)) throw new EngineError(`sheet '${s.sheet}': no column is mapped to ${FIELD_BY_KEY[k].label}; it is needed to read any control`);
    for (const f of FIELDS.filter((x) => x.object === "control" && x.req === "M")) {
      if (!mapped.has(f.key) && !(s.defaults && f.key in s.defaults) && !(f.key === "control.risks" && mapped.has("risk.statement")))
        warnings.push(`sheet '${s.sheet}': no column for ${f.label}; every control will get a 'missing mandatory field' finding unless a default is set`);
    }
  }
  return { warnings };
}

export { PICKLISTS };
export type { Kind };
