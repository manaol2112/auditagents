/** RCM workbooks for tests, built in memory: the template filled in, a messy one-sheet client ITGC matrix, and an
 * Optro-style CSV export. Fictional data. */
import ExcelJS from "exceljs";

export { templateRcm } from "../src/rcm/demo.js";

/** A one-sheet client ITGC matrix in its own layout: title rows, abbreviated headers, a "Control Type" column holding
 * manual / automated values, no category or module columns, an unrelated comments column. */
export async function messyRcm(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ITGC RCM FY26");
  ws.getCell("A1").value = "Northwind Foods - IT General Controls RCM - FY2026";
  ws.getCell("A2").value = "Owner: IT Compliance. Version 3, updated 2026-11-15.";
  ws.addRow([]);
  ws.getRow(4).values = ["Control #", "Application", "WCGW", "Control Activity", "Control Type", "P/D", "Freq.", "Key?", "Control Owner", "Evidence", "Comments"];
  const rows = [
    ["ITGC-01", "SAP ECC", "Users retain access that is no longer appropriate", "Business owners perform a quarterly user access review of all SAP users and roles using the SUIM listing; removals are requested in ServiceNow.", "Manual", "Detective", "Quarterly", "Y", "SAP Security Manager", "Signed review workbook", "Reviewed by IA in 2025"],
    ["ITGC-02", "SAP ECC", "Unauthorized changes reach production", "All SAP transports are approved by the Change Advisory Board (CAB) before they are imported into production; the Basis team performs the import.", "Manual", "Preventive", "As needed", "Y", "Basis Lead", "ServiceNow change record with CAB approval", ""],
    ["ITGC-03", "SAP ECC", "Access is granted without approval", "New SAP access is requested in ServiceNow and approved by the requester's manager before Security provisions the roles listed on the approved request.", "Manual", "Preventive", "As needed", "Y", "SAP Security Manager", "ServiceNow request with approval", ""],
    ["ITGC-04", "SAP ECC", "Password settings allow weak passwords", "SAP password parameters (login/min_password_lng and related) are configured to the corporate standard.", "Automated", "Preventive", "Continuous", "N", "Basis Lead", "RZ10 profile parameters", "Non-key per FY25 scoping"],
  ];
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Optro-style CSV export (field names inferred from the public API: uid, name, process, subprocess; 'Control Weight'). */
export function optroCsv(): Buffer {
  return Buffer.from([
    "UID,Name,Description,Process,Subprocess,Control Weight,Frequency,Owner,Nature,Type",
    'ITGC-UAR-01,User access review,"The IT Director reviews privileged and end-user access to NetSuite quarterly, and removals are made within 5 business days.",ITGC,Logical Access,Key,Quarterly,IT Director,Manual,Detective',
    'ITGC-CHG-01,Change approval,"Changes to NetSuite are approved by the Finance Systems Manager before deployment to production.",ITGC,Change Management,Key,Event Driven,Finance Systems Manager,Manual,Preventive',
  ].join("\n"));
}
