/** A filled-in RCM template for the Northwind fictional client, used by `soxplan seed` and the tests. Fictional data. */
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../db.js";
import { withoutComments } from "./parse.js";

export const TEMPLATE_PATH = join(REPO_ROOT, "templates", "rcm-template.xlsx");

/** Write values into a template sheet by header label (row 2 on Controls, row 1 elsewhere), starting below the example row. */
function fill(ws: ExcelJS.Worksheet, headerRow: number, firstRow: number, rows: Record<string, string>[]) {
  const cols: Record<string, number> = {};
  ws.getRow(headerRow).eachCell((c, n) => { cols[String(c.value).replace(/ \*$/, "")] = n; });
  rows.forEach((r, i) => {
    for (const [k, v] of Object.entries(r)) {
      if (!(k in cols)) throw new Error(`template has no column '${k}' on ${ws.name}`);
      ws.getRow(firstRow + i).getCell(cols[k]).value = v;
    }
  });
}

export async function templateRcm(over: { controls?: Record<string, string>[] } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await withoutComments(readFileSync(TEMPLATE_PATH))) as any);
  const header = wb.getWorksheet("Header")!;
  [["Northwind Foods"], ["2026-12-31"], ["2026-01-01"], ["2026-12-31"], ["Northwind IT Compliance"]].forEach(([v], i) => { header.getRow(2 + i).getCell(2).value = v; });
  fill(wb.getWorksheet("Entities")!, 1, 4, [{ "Entity ID": "ENT-US", "Entity name": "Northwind Foods Inc." }]);
  fill(wb.getWorksheet("Processes")!, 1, 4, [
    { "Process ID": "ITGC-APD", "Process name": "Access to programs and data", "Sub-process ID": "ITGC-APD-UAR", "Sub-process name": "AC-UAR" },
    { "Process ID": "ITGC-PC", "Process name": "Program change", "Sub-process ID": "ITGC-PC-CHG", "Sub-process name": "CM-CHG" }]);
  fill(wb.getWorksheet("Systems")!, 1, 4, [
    { "System ID": "SAP", "System name": "SAP ECC", "Financial relevance": "General ledger, billing, accounts receivable", "Application layer": "SAP ECC", "Database": "Oracle 19c", "Hosting": "On-premises" }]);
  fill(wb.getWorksheet("Risks")!, 1, 4, [
    { "Risk ID": "R-01", "Risk statement (what could go wrong)": "Users retain SAP access that is no longer appropriate, allowing unauthorized postings.", "Risk category": "IT", "Process ID": "ITGC-APD", "Sub-process ID": "ITGC-APD-UAR", "ITGC domain": "Access to programs and data", "Methodology module": "AC-UAR", "System IDs": "SAP" },
    { "Risk ID": "R-03", "Risk statement (what could go wrong)": "Unauthorized or untested changes to SAP alter pricing or posting logic.", "Risk category": "IT", "Process ID": "ITGC-PC", "Sub-process ID": "ITGC-PC-CHG", "ITGC domain": "Program change", "Methodology module": "CM-CHG", "System IDs": "SAP" }]);
  const common = { "Entity IDs": "ENT-US", "Key control": "Yes", "Control category": "IT general control", "System IDs": "SAP", "Layers covered": "Application; database" };
  fill(wb.getWorksheet("Controls")!, 2, 5, over.controls ?? [
    { ...common, "Control ID": "A-01", "Control title": "Quarterly SAP access review", "Control description": "Business owners review SAP user access quarterly using the SUIM listing of all users and roles; removals are requested in ServiceNow and completed by Security.",
      "Process ID": "ITGC-APD", "Sub-process ID": "ITGC-APD-UAR", "Risk IDs": "R-01", "Control type": "Detective", "Nature": "IT-dependent manual", "Frequency": "Quarterly", "Control owner": "SAP Security Manager",
      "Evidence of performance": "Signed review workbook in SharePoint; ServiceNow removal tickets", "ITGC domain": "Access to programs and data", "Methodology module": "AC-UAR",
      "Reviewer / approver and independence": "Business owners (department managers)", "Operating criteria": "Review completion timeframe: within 15 business days after quarter end; Removal timeframe: 5 business days" },
    { ...common, "Control ID": "A-03", "Control title": "SAP transport approval", "Control description": "SAP transports are approved by the CAB before import; the Basis team imports; developers do not hold import authorization.",
      "Process ID": "ITGC-PC", "Sub-process ID": "ITGC-PC-CHG", "Risk IDs": "R-03", "Control type": "Preventive", "Nature": "Manual", "Frequency": "Event-driven", "Control owner": "Basis Lead",
      "Evidence of performance": "CAB approval in the ServiceNow change record; STMS import log", "ITGC domain": "Program change", "Methodology module": "CM-CHG", "Population source": "SAP STMS transport import log (E070)",
      "Operating criteria": "Approver: CAB; Approval timing: before import; Testing: UAT sign-off recorded in the change record" }]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

