/** RCM upload and mapping confirmation. The original file is stored unchanged with its hash; every non-empty row becomes a
 * line of a document (so the planner, reviewer, and workspace cite RCM rows exactly as they cite narrative lines) and a
 * row record with its cells by column letter. */
import { recordEvent, requireRole } from "../audit.js";
import { Db, EngineError, j, now, one, all, sha256 } from "../db.js";
import { MappingConfirmation, MappingProposal, proposeMapping, validateConfirmation } from "./mapping.js";
import { ParsedSheet, parseRcm } from "./parse.js";

export function renderRow(sheet: string, rowNo: number, cells: Record<string, string>): string {
  return `${sheet}!${rowNo} | ` + Object.entries(cells).map(([c, v]) => `${c}: ${v.replace(/\s+/g, " ")}`).join(" | ");
}

async function bulkInsert(db: Db, sql: (placeholders: string) => string, rows: unknown[][], width: number) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const ph = chunk.map((_, r) => "(" + Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(",") + ")").join(",");
    await db.query(sql(ph), chunk.flat());
  }
}

export interface UploadResult { upload_id: number; sha256: string; filename: string; existing: boolean; sheets: { name: string; rows: number; columns: number }[] }

export async function storeUpload(db: Db, actor: string, engagementName: string, filename: string, buf: Buffer): Promise<UploadResult> {
  await requireRole(db, actor, "agent", "preparer", "approver");
  const eng = await one(db, "SELECT id, client_id FROM engagements WHERE name = $1", [engagementName]);
  if (!eng) throw new EngineError(`unknown engagement '${engagementName}'`);
  const name = (filename || "rcm.xlsx").replace(/[\\/]/g, "_").slice(0, 200);
  const hash = sha256(buf);
  const prior = await one(db, "SELECT id, sheets FROM rcm_uploads WHERE engagement_id = $1 AND sha256 = $2", [eng.id, hash]);
  if (prior) return { upload_id: prior.id, sha256: hash, filename: name, existing: true, sheets: prior.sheets };
  const sheets = await parseRcm(buf, name);
  const proposal = proposeMapping(sheets);
  const doc = await one(db, "INSERT INTO documents (client_id, path, title, doc_type, sha256, ingested_by, ingested_at) VALUES ($1,$2,$3,'rcm',$4,$5,$6) RETURNING id",
    [eng.client_id, `upload:${name}`, name, hash, actor, now()]);
  const lines: unknown[][] = [], rows: unknown[][] = [];
  let line = 0;
  for (const s of sheets) for (const r of s.rows) {
    line++;
    lines.push([doc!.id, line, renderRow(s.name, r.row_no, r.cells)]);
    rows.push([s.name, r.row_no, line, j(r.cells)]);
  }
  await bulkInsert(db, (ph) => `INSERT INTO document_lines (doc_id, line_no, text) VALUES ${ph}`, lines, 3);
  const summary = sheets.map((s) => ({ name: s.name, rows: s.rows.length, columns: s.max_column }));
  const up = await one(db, "INSERT INTO rcm_uploads (engagement_id, client_id, doc_id, filename, sha256, size_bytes, content, sheets, proposal, uploaded_by, uploaded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
    [eng.id, eng.client_id, doc!.id, name, hash, buf.length, buf, j(summary), j(proposal), actor, now()]);
  await bulkInsert(db, (ph) => `INSERT INTO rcm_rows (upload_id, sheet, row_no, line_no, cells) VALUES ${ph}`, rows.map((r) => [up!.id, ...r]), 5);
  await recordEvent(db, actor, "rcm.upload", "rcm_upload", up!.id, { engagement_id: eng.id, filename: name, sha256: hash, size_bytes: buf.length, sheets: summary, profile: proposal.profile, doc_id: doc!.id });
  return { upload_id: up!.id, sha256: hash, filename: name, existing: false, sheets: summary };
}

export async function loadSheets(db: Db, uploadId: number): Promise<ParsedSheet[]> {
  const up = await one(db, "SELECT sheets FROM rcm_uploads WHERE id = $1", [uploadId]);
  if (!up) throw new EngineError("unknown upload");
  const rows = await all(db, "SELECT sheet, row_no, cells FROM rcm_rows WHERE upload_id = $1 ORDER BY line_no", [uploadId]);
  return up.sheets.map((s: any) => ({ name: s.name, max_column: s.columns, rows: rows.filter((r) => r.sheet === s.name).map((r) => ({ row_no: r.row_no, cells: r.cells })) }));
}

export async function getUpload(db: Db, uploadId: number): Promise<any> {
  const up = await one(db, "SELECT u.id, u.filename, u.sha256, u.status, u.sheets, u.uploaded_by, u.uploaded_at, u.snapshot_id, u.doc_id, e.name AS engagement FROM rcm_uploads u JOIN engagements e ON e.id = u.engagement_id WHERE u.id = $1", [uploadId]);
  if (!up) throw new EngineError("unknown upload");
  return up;
}

export async function getMapping(db: Db, uploadId: number): Promise<{ proposal: MappingProposal; confirmed: MappingConfirmation | null; confirmed_by: string | null; confirmed_at: string | null; version: number | null }> {
  const up = await one(db, "SELECT proposal FROM rcm_uploads WHERE id = $1", [uploadId]);
  if (!up) throw new EngineError("unknown upload");
  const m = await one(db, "SELECT version, mapping, confirmed_by, confirmed_at FROM rcm_mappings WHERE upload_id = $1 ORDER BY version DESC LIMIT 1", [uploadId]);
  return { proposal: up.proposal, confirmed: m?.mapping ?? null, confirmed_by: m?.confirmed_by ?? null, confirmed_at: m?.confirmed_at ?? null, version: m?.version ?? null };
}

/** A new proposal (from the mapping agent). Confirmed mappings are untouched. */
export async function replaceProposal(db: Db, actor: string, uploadId: number, proposal: MappingProposal): Promise<void> {
  await db.query("UPDATE rcm_uploads SET proposal = $1 WHERE id = $2", [j(proposal), uploadId]);
  await recordEvent(db, actor, "rcm.mapping.propose", "rcm_upload", uploadId, { profile: proposal.profile, columns: proposal.sheets.reduce((n, s) => n + s.columns.length, 0) });
}

export async function confirmMapping(db: Db, actor: string, uploadId: number, conf: MappingConfirmation): Promise<{ version: number; warnings: string[] }> {
  await requireRole(db, actor, "preparer", "approver");
  const up = await getUpload(db, uploadId);
  if (up.status === "extracted") throw new EngineError("this upload has already been extracted; upload the file again to map it differently");
  const sheets = await loadSheets(db, uploadId);
  const clean: MappingConfirmation = { sheets: conf.sheets.map((s) => ({ sheet: s.sheet, role: s.role, header_row: s.header_row, first_data_row: s.first_data_row,
    columns: Object.fromEntries(Object.entries(s.columns ?? {}).map(([c, k]) => [c.toUpperCase(), k ?? null])), ...(s.defaults ? { defaults: s.defaults } : {}) })) };
  const { warnings } = validateConfirmation(clean, sheets);
  const prev = await one(db, "SELECT COALESCE(MAX(version), 0) AS v FROM rcm_mappings WHERE upload_id = $1", [uploadId]);
  const version = prev!.v + 1;
  await db.query("INSERT INTO rcm_mappings (upload_id, version, mapping, confirmed_by, confirmed_at) VALUES ($1,$2,$3,$4,$5)", [uploadId, version, j(clean), actor, now()]);
  await db.query("UPDATE rcm_uploads SET status = 'mapped' WHERE id = $1", [uploadId]);
  await recordEvent(db, actor, "rcm.mapping.confirm", "rcm_upload", uploadId, { version, warnings: warnings.length });
  return { version, warnings };
}
