/** L2: document intake and structured extraction with exact source references.
 *
 * Documents are untrusted content. Nothing in them is ever executed or treated as an instruction; they are
 * parsed into facts, each pointing at a document id and line.
 *
 * Supported fictional document formats (markdown):
 *   rcm       : "## Risks" and "## Controls" sections, each a pipe table with a header row.
 *   narrative : "## Control <REF>" headings followed by "Key: value" lines.
 *   policy    : "Key: value" lines; the first "# " heading is the policy title.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { recordEvent, requireRole } from "./audit.js";
import { Db, EngineError, j, now, one, all, sha256 } from "./db.js";
import * as identity from "./identity.js";
import { CRITERION_FIELD_NAMES } from "./methodology.js";

/** Narrative and policy keys that fix operating criteria (fact_class "description"). Everything else from a narrative describes practice. */
export const CRITERION_FIELDS = new Set([
  "removal_timeframe", "completion_timeframe", "approver", "approval_timing",
  "frequency", "emergency_timeframe", "testing", "access_removal_timeframe", "reviewer",
  ...CRITERION_FIELD_NAMES,
]);

const TIMEFRAME_RE = /within\s+(\d+)\s+(business days|business day|calendar days|days|day|hours|hour)/i;
const UNIT: Record<string, string> = { "business day": "business days", day: "days", hour: "hours" };

/** 'within 5 business days of sign-off' -> '5 business days'. null if no timeframe. */
export function normalizeTimeframe(text: string): string | null {
  let m = TIMEFRAME_RE.exec(text);
  if (!m) {
    m = /^\s*(\d+)\s+(business days|business day|calendar days|days|day|hours|hour)\b/i.exec(text);
    if (!m) return null;
  }
  const unit = m[2].toLowerCase();
  return `${m[1]} ${UNIT[unit] ?? unit}`;
}

export function fieldKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export type Line = [number, string];

// ---------------------------------------------------------------- ingest

export function detectDocType(path: string): string {
  const name = basename(path).toLowerCase();
  for (const t of ["rcm", "narrative", "policy"]) if (name.startsWith(t)) return t;
  throw new EngineError(`cannot detect document type from file name '${basename(path)}' (expected rcm*/narrative*/policy*)`);
}

export async function ingestDocument(db: Db, actor: string, clientId: number, path: string, docType?: string): Promise<number> {
  await requireRole(db, actor, "agent", "preparer", "approver");
  docType = docType ?? detectDocType(path);
  const raw = readFileSync(path);
  const sha = sha256(raw);
  const lines = raw.toString("utf8").split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const title = lines.find((l) => l.startsWith("# "))?.slice(2).trim() ?? basename(path);
  const row = await one(db, "INSERT INTO documents (client_id, path, title, doc_type, sha256, ingested_by, ingested_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [clientId, path, title, docType, sha, actor, now()]);
  const docId = row!.id as number;
  for (let i = 0; i < lines.length; i++) {
    await db.query("INSERT INTO document_lines (doc_id, line_no, text) VALUES ($1,$2,$3)", [docId, i + 1, lines[i]]);
  }
  await recordEvent(db, actor, "document.ingest", "document", docId, { path, sha256: sha, type: docType });
  return docId;
}

// ---------------------------------------------------------------- parsing

/** Parse a markdown pipe table. Returns [line_no, {header: cell}] per data row. */
function parseTableRows(lines: Line[]): [number, Record<string, string>][] {
  const rows: [number, Record<string, string>][] = [];
  let header: string[] | null = null;
  for (const [lineNo, text] of lines) {
    if (!text.trim().startsWith("|")) {
      if (header !== null) break;
      continue;
    }
    const cells = text.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (header === null) { header = cells; continue; }
    if (cells.every((c) => /^[-: ]*$/.test(c))) continue;
    const row: Record<string, string> = {};
    header.forEach((h, i) => { if (i < cells.length) row[h] = cells[i]; });
    rows.push([lineNo, row]);
  }
  return rows;
}

const splitList = (s: string | undefined) => (s ?? "").split(";").map((x) => x.trim()).filter(Boolean);

export function parseRcm(lines: Line[]): { risks: any[]; controls: any[] } {
  let section: string | null = null;
  const risks: any[] = [], controls: any[] = [];
  let buf: Line[] = [];
  const flush = () => {
    if (section === "risks") {
      for (const [ln, r] of parseTableRows(buf)) {
        risks.push({ line_no: ln, ref: r["Risk ID"] ?? "", statement: r["Statement"] ?? "", element: r["Financial reporting element"] ?? "",
          assertions: r["Assertions"] ?? "", category: (r["IT risk category"] ?? "").toLowerCase() });
      }
    } else if (section === "controls") {
      for (const [ln, r] of parseTableRows(buf)) {
        controls.push({ line_no: ln, ref: r["Control ID"] ?? "", description: r["Description"] ?? "", control_type: (r["Type"] ?? "").toLowerCase(),
          frequency: r["Frequency"] ?? "", owner: r["Owner"] ?? "", systems: splitList(r["Systems"]), risk_refs: splitList(r["Risks"]) });
      }
    }
    buf = [];
  };
  for (const [ln, text] of lines) {
    if (text.startsWith("## ")) {
      flush();
      const head = text.slice(3).trim().toLowerCase();
      section = head.startsWith("risk") ? "risks" : head.startsWith("control") ? "controls" : null;
      continue;
    }
    if (section) buf.push([ln, text]);
  }
  flush();
  return { risks, controls };
}

export function parseNarrative(lines: Line[]): any[] {
  const facts: any[] = [];
  let ref: string | null = null;
  for (const [ln, text] of lines) {
    const m = /^##\s+Control\s+(\S+)/.exec(text);
    if (m) { ref = m[1]; continue; }
    if (ref && text.includes(":") && !text.startsWith("#")) {
      const i = text.indexOf(":");
      const label = text.slice(0, i), value = text.slice(i + 1);
      if (label.trim() && value.trim()) facts.push({ line_no: ln, subject_type: "control", subject_ref: ref, field: fieldKey(label), value: value.trim() });
    }
  }
  return facts;
}

export function parsePolicy(lines: Line[]): any[] {
  const facts: any[] = [];
  const title = lines.find(([, t]) => t.startsWith("# "))?.[1].slice(2).trim() ?? "policy";
  for (const [ln, text] of lines) {
    if (text.startsWith("#") || !text.includes(":")) continue;
    const i = text.indexOf(":");
    const label = text.slice(0, i), value = text.slice(i + 1);
    if (label.trim() && value.trim() && !text.trim().startsWith("|")) facts.push({ line_no: ln, subject_type: "policy", subject_ref: title, field: fieldKey(label), value: value.trim() });
  }
  return facts;
}

// ---------------------------------------------------------------- extraction

export async function documentLines(db: Db, docId: number): Promise<Line[]> {
  return (await all(db, "SELECT line_no, text FROM document_lines WHERE doc_id = $1 ORDER BY line_no", [docId])).map((r) => [r.line_no, r.text]);
}

/** Parse every ingested document for the client into a new frozen snapshot. */
export async function extract(db: Db, actor: string, clientId: number): Promise<number> {
  await requireRole(db, actor, "agent", "preparer", "approver");
  const docs = await all(db, "SELECT * FROM documents WHERE client_id = $1 ORDER BY id", [clientId]);
  if (!docs.length) throw new EngineError("no documents ingested for this client");
  const snap = await one(db, "INSERT INTO snapshots (client_id, created_by, created_at, record_hash) VALUES ($1,$2,$3,'pending') RETURNING id", [clientId, actor, now()]);
  const snapId = snap!.id as number;
  const digest = createHash("sha256");
  let nControls = 0, nRisks = 0, nFacts = 0;

  const addFact = async (docId: number, lineNo: number, subjectType: string, subjectRef: string, field: string, value: string, factClass: string) => {
    await db.query("INSERT INTO facts (snapshot_id, subject_type, subject_ref, field, value, basis, fact_class, doc_id, line_no) VALUES ($1,$2,$3,$4,$5,'extracted',$6,$7,$8)",
      [snapId, subjectType, subjectRef, field, value, factClass, docId, lineNo]);
    digest.update(`fact|${subjectType}|${subjectRef}|${field}|${value}|${docId}|${lineNo}\n`);
    nFacts++;
  };

  const docObjs: identity.DocText[] = [];
  const pending: any[] = [];
  for (const doc of docs) {
    const lines = await documentLines(db, doc.id);
    docObjs.push({ id: doc.id, doc_type: doc.doc_type, lines: Object.fromEntries(lines) });
    if (doc.doc_type === "rcm") {
      const { risks, controls } = parseRcm(lines);
      for (const r of risks) {
        await db.query("INSERT INTO risks (snapshot_id, ref, statement, element, assertions, category, doc_id, line_no) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [snapId, r.ref, r.statement, r.element, r.assertions, r.category, doc.id, r.line_no]);
        digest.update(`risk|${r.ref}|${r.statement}|${r.category}\n`);
        nRisks++;
        for (const f of ["statement", "element", "assertions", "category"]) await addFact(doc.id, r.line_no, "risk", r.ref, f, r[f], "environment");
      }
      for (const c of controls) {
        c.doc_id = doc.id;
        pending.push(c);
        await addFact(doc.id, c.line_no, "control", c.ref, "description", c.description, "description");
        await addFact(doc.id, c.line_no, "control", c.ref, "frequency", c.frequency, "description");
        await addFact(doc.id, c.line_no, "control", c.ref, "owner", c.owner, "practice");
        await addFact(doc.id, c.line_no, "control", c.ref, "systems", c.systems.join("; "), "environment");
        const tf = normalizeTimeframe(c.description);
        if (tf && c.control_type === "periodic access review") await addFact(doc.id, c.line_no, "control", c.ref, "removal_timeframe", tf, "description");
        const m = /approved by (?:the )?(.+?) before/i.exec(c.description);
        if (m) {
          await addFact(doc.id, c.line_no, "control", c.ref, "approver", m[1].trim(), "description");
          await addFact(doc.id, c.line_no, "control", c.ref, "approval_timing", "before", "description");
        }
      }
    } else if (doc.doc_type === "narrative") {
      for (const f of parseNarrative(lines)) await addFact(doc.id, f.line_no, f.subject_type, f.subject_ref, f.field, f.value, CRITERION_FIELDS.has(f.field) ? "description" : "practice");
    } else if (doc.doc_type === "policy") {
      for (const f of parsePolicy(lines)) await addFact(doc.id, f.line_no, f.subject_type, f.subject_ref, f.field, f.value, "description");
    }
  }

  identity.assign(pending, docObjs);
  for (const c of pending) {
    await db.query("INSERT INTO controls (snapshot_id, control_id, identity_basis, ref, description, control_type, frequency, owner, systems, risk_refs, status, doc_id, line_no) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'candidate',$11,$12)",
      [snapId, c.control_id, c.identity_basis, c.ref, c.description, c.control_type, c.frequency, c.owner, j(c.systems), j(c.risk_refs), c.doc_id, c.line_no]);
    digest.update(`control|${c.control_id}|${c.description}|${c.control_type}|${c.frequency}\n`);
    nControls++;
  }
  const recordHash = digest.digest("hex");
  await db.query("UPDATE snapshots SET record_hash = $1 WHERE id = $2", [recordHash, snapId]);
  await identity.linkToPrior(db, actor, clientId, snapId, pending);
  await recordEvent(db, actor, "snapshot.freeze", "snapshot", snapId, { client_id: clientId, controls: nControls, risks: nRisks, facts: nFacts, record_hash: recordHash });
  return snapId;
}

// ---------------------------------------------------------------- read helpers

export async function snapshotControls(db: Db, snapshotId: number): Promise<any[]> {
  return all(db, "SELECT * FROM controls WHERE snapshot_id = $1 ORDER BY ref", [snapshotId]);
}

export async function snapshotRisks(db: Db, snapshotId: number): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (const r of await all(db, "SELECT * FROM risks WHERE snapshot_id = $1", [snapshotId])) out[r.ref] = r;
  return out;
}

export async function snapshotFacts(db: Db, snapshotId: number): Promise<any[]> {
  return all(db, "SELECT f.*, d.title AS doc_title, d.doc_type, d.sha256 AS doc_sha FROM facts f JOIN documents d ON d.id = f.doc_id WHERE f.snapshot_id = $1 ORDER BY f.id", [snapshotId]);
}

export interface SourceRef { doc_id: number; doc_title: string; doc_type: string; doc_sha: string; line_no: number; quote: string; line_end?: number;
  /** The spreadsheet cell, for facts from an uploaded RCM. */
  cell?: { sheet: string; row: number; column: string; header: string | null } }

export function sourceRef(fact: any): SourceRef {
  return { doc_id: fact.doc_id, doc_title: fact.doc_title ?? "", doc_type: fact.doc_type ?? "", doc_sha: fact.doc_sha ?? "", line_no: fact.line_no, quote: fact.value, ...(fact.cell ? { cell: fact.cell } : {}) };
}
