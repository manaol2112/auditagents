/** Parse an uploaded RCM (.xlsx or .csv) into sheets of rows of text cells keyed by column letter. Values only: formulas
 * contribute their cached result (or nothing), dates become YYYY-MM-DD, rich text and hyperlinks their text. Files are
 * data; nothing in them is executed. */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { EngineError } from "../db.js";

export interface ParsedRow { row_no: number; cells: Record<string, string> }
export interface ParsedSheet { name: string; rows: ParsedRow[]; max_column: number }

export const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 50_000;
const MAX_CELL = 32_767;   // Excel's own cell limit

export function columnLetter(n: number): string {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function columnNumber(letter: string): number {
  return letter.toUpperCase().split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

function text(v: any): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text ?? "").join("");
    if ("result" in v || "formula" in v || "sharedFormula" in v) return v.result === undefined || v.result === null ? "" : text(v.result);
    if ("text" in v) return text(v.text);
    if ("hyperlink" in v) return String(v.hyperlink ?? "");
    if ("error" in v) return "";
    return "";
  }
  return String(v);
}

const clean = (s: string) => s.replace(/\r\n?/g, "\n").replace(/ /g, " ").trim().slice(0, MAX_CELL);

export const MAX_UNCOMPRESSED = 200 * 1024 * 1024;
const MAX_ENTRIES = 2000;

/** Refuse decompression bombs before anything is inflated: read the ZIP central directory and check the declared sizes. */
export function checkZip(buf: Buffer): void {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new EngineError("the file could not be read as an Excel workbook (.xlsx)");
  const entries = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOffset = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new EngineError("the workbook uses ZIP64, which an RCM never needs; save it again from Excel");
  if (entries > MAX_ENTRIES) throw new EngineError("the workbook has too many internal parts");
  if (cdOffset + cdSize > buf.length) throw new EngineError("the file could not be read as an Excel workbook (.xlsx)");
  let total = 0, off = cdOffset;
  for (let n = 0; n < entries; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) throw new EngineError("the file could not be read as an Excel workbook (.xlsx)");
    const compressed = buf.readUInt32LE(off + 20), size = buf.readUInt32LE(off + 24);
    if (size === 0xffffffff || compressed === 0xffffffff) throw new EngineError("the workbook uses ZIP64, which an RCM never needs; save it again from Excel");
    const nameLen = buf.readUInt16LE(off + 28);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen).toLowerCase();
    if (name.endsWith("vbaproject.bin") || name.endsWith(".bin") && name.includes("activex")) throw new EngineError("macro-enabled workbooks are not accepted; save the RCM as a plain .xlsx workbook");
    total += size;
    if (total > MAX_UNCOMPRESSED) throw new EngineError("the workbook expands to more than 200 MB; it is refused");
    off += 46 + buf.readUInt16LE(off + 28) + buf.readUInt16LE(off + 30) + buf.readUInt16LE(off + 32);
  }
}

/** Cell comments (and their drawings) are never needed for an import, and some writers reference them in ways the
 * workbook reader cannot follow; remove them before loading. */
export async function withoutComments(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  let changed = false;
  for (const name of Object.keys(zip.files)) {
    if (/^xl\/comments[^/]*\.xml$/i.test(name) || /^xl\/drawings\/[^/]*\.vml$/i.test(name) || /^xl\/threadedComments\//i.test(name) || /^xl\/persons\//i.test(name)) { zip.remove(name); changed = true; }
  }
  for (const name of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/_rels\/[^/]+\.rels$/i.test(n))) {
    const xml = await zip.file(name)!.async("string");
    const cleaned = xml.replace(/<Relationship\b[^>]*Type="[^"]*\/(comments|vmlDrawing|threadedComment)"[^>]*\/>/g, "");
    if (cleaned !== xml) { zip.file(name, cleaned); changed = true; }
  }
  for (const name of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/[^/]+\.xml$/i.test(n))) {
    const xml = await zip.file(name)!.async("string");
    const cleaned = xml.replace(/<legacyDrawing\b[^>]*\/>/g, "");
    if (cleaned !== xml) { zip.file(name, cleaned); changed = true; }
  }
  if (zip.files["[Content_Types].xml"]) {
    const ct = await zip.file("[Content_Types].xml")!.async("string");
    const cleaned = ct.replace(/<Override\b[^>]*PartName="\/xl\/(comments[^"]*|threadedComments\/[^"]*|persons\/[^"]*)"[^>]*\/>/g, "");
    if (cleaned !== ct) { zip.file("[Content_Types].xml", cleaned); changed = true; }
  }
  return changed ? Buffer.from(await zip.generateAsync({ type: "nodebuffer" })) : buf;
}

export async function parseXlsx(buf: Buffer): Promise<ParsedSheet[]> {
  checkZip(buf);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load((await withoutComments(buf)) as any);
  } catch {
    throw new EngineError("the file could not be read as an Excel workbook (.xlsx)");
  }
  const sheets: ParsedSheet[] = [];
  let total = 0;
  wb.eachSheet((ws) => {
    const rows: ParsedRow[] = [];
    let maxCol = 0;
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      const cells: Record<string, string> = {};
      row.eachCell({ includeEmpty: false }, (cell, colNo) => {
        // A merged range carries its value on the master cell only; the others repeat nothing.
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) return;
        const t = clean(text(cell.value));
        if (t) { cells[columnLetter(colNo)] = t; maxCol = Math.max(maxCol, colNo); }
      });
      if (Object.keys(cells).length) rows.push({ row_no: rowNo, cells });
    });
    total += rows.length;
    if (total > MAX_ROWS) throw new EngineError(`the workbook has more than ${MAX_ROWS} non-empty rows`);
    sheets.push({ name: ws.name.slice(0, 100), rows, max_column: maxCol });
  });
  if (!sheets.length) throw new EngineError("the workbook has no sheets");
  return sheets;
}

/** RFC 4180 CSV (quoted fields, doubled quotes, embedded newlines); a UTF-8 byte-order mark is dropped. */
export function parseCsv(buf: Buffer, name = "RCM"): ParsedSheet[] {
  const s = buf.toString("utf8").replace(/^﻿/, "");
  const rows: ParsedRow[] = [];
  let field = "", rec: string[] = [], q = false, rowNo = 1, maxCol = 0;
  const pushRow = () => {
    const cells: Record<string, string> = {};
    rec.forEach((v, i) => { const t = clean(v); if (t) { cells[columnLetter(i + 1)] = t; maxCol = Math.max(maxCol, i + 1); } });
    if (Object.keys(cells).length) rows.push({ row_no: rowNo, cells });
    if (rows.length > MAX_ROWS) throw new EngineError(`the file has more than ${MAX_ROWS} non-empty rows`);
    rec = []; rowNo++;
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { rec.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      rec.push(field); field = ""; pushRow();
    } else field += ch;
  }
  if (field || rec.length) { rec.push(field); pushRow(); }
  return [{ name, rows, max_column: maxCol }];
}

export function detectFormat(buf: Buffer, filename: string): "xlsx" | "csv" {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "xlsx";   // ZIP container
  if (/\.(csv|txt)$/i.test(filename)) return "csv";
  throw new EngineError("upload an Excel workbook (.xlsx) or a CSV file; older .xls files must be saved as .xlsx first");
}

export async function parseRcm(buf: Buffer, filename: string): Promise<ParsedSheet[]> {
  if (buf.length > MAX_BYTES) throw new EngineError("the file is larger than 20 MB");
  if (!buf.length) throw new EngineError("the file is empty");
  return detectFormat(buf, filename) === "xlsx" ? parseXlsx(buf) : parseCsv(buf, filename.replace(/\.[^.]+$/, "").slice(0, 100) || "RCM");
}
