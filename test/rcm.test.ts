/** RCM upload, column mapping, extraction, import checks, and planning from an uploaded RCM. */
import assert from "node:assert/strict";
import JSZip from "jszip";
import { after, describe, it } from "node:test";
import pg from "pg";
import * as approvals from "../src/approvals.js";
import * as audit from "../src/audit.js";
import { EngineError, j, now } from "../src/db.js";
import * as methodology from "../src/methodology.js";
import * as planning from "../src/planning.js";
import { acceptIntakeFinding, classifyModule, extractUpload, intakeFindings, parseCriteria, records } from "../src/rcm/extract.js";
import { normalizePick } from "../src/rcm/fields.js";
import { proposalAsConfirmation, proposeMapping } from "../src/rcm/mapping.js";
import { assistMapping } from "../src/rcm/mappingAgent.js";
import { MAX_UNCOMPRESSED, checkZip, parseCsv, parseRcm } from "../src/rcm/parse.js";
import { confirmMapping, getMapping, storeUpload } from "../src/rcm/upload.js";
import { checkout, freshDb, shutdown } from "./helpers.js";
import { messyRcm, optroCsv, templateRcm } from "./rcm-fixtures.js";

after(async () => { await shutdown(); });

async function engagement(systems = ["SAP ECC"], modules: string[] | null = null): Promise<pg.PoolClient> {
  const db = await checkout(await freshDb());
  await audit.addUser(db, "system", "pat", "preparer");
  await audit.addUser(db, "system", "rj", "approver");
  const cid = (await db.query("INSERT INTO clients (name, fiscal_year_end, time_zone, created_by) VALUES ('Northwind Foods','2026-12-31','America/New_York','pat') RETURNING id")).rows[0].id;
  const data = methodology.load();
  await db.query("INSERT INTO engagements (client_id, name, period_start, period_end, as_of, systems, methodology_version, methodology_hash, snapshot_id, created_by, created_at, modules) VALUES ($1,'NW-RCM','2026-01-01','2026-12-31','2026-12-31',$2,$3,$4,NULL,'pat',$5,$6)",
    [cid, j(systems), data.version, data.document_hash, now(), modules ? j(modules) : null]);
  return db;
}

async function uploadAndExtract(db: pg.PoolClient, buf: Buffer, filename: string, edit?: (c: ReturnType<typeof proposalAsConfirmation>) => void) {
  const up = await storeUpload(db, "pat", "NW-RCM", filename, buf);
  const { proposal } = await getMapping(db, up.upload_id);
  const conf = proposalAsConfirmation(proposal);
  edit?.(conf);
  await confirmMapping(db, "pat", up.upload_id, conf);
  const ex = await extractUpload(db, "pat", up.upload_id);
  return { up, ex, findings: await intakeFindings(db, up.upload_id) };
}

describe("parsing", () => {
  it("reads the template, a client workbook, and CSV, keeping every non-empty cell by column", async () => {
    const t = await parseRcm(await templateRcm(), "rcm.xlsx");
    assert.deepEqual(t.map((s) => s.name), ["Instructions", "Header", "Entities", "Processes", "Accounts", "Systems", "Risks", "IPE", "Service organizations", "CUECs", "Controls", "Lists"]);
    const controls = t.find((s) => s.name === "Controls")!;
    assert.equal(controls.rows.find((r) => r.row_no === 5)!.cells.A, "A-01");
    const csv = parseCsv(Buffer.from('ID,Description\nC-1,"Line one, with comma\nand a second line"\n'));
    assert.equal(csv[0].rows[1].cells.B, "Line one, with comma\nand a second line");
  });

  it("refuses files that are not workbooks, empty files, and decompression bombs before inflating them", async () => {
    await assert.rejects(parseRcm(Buffer.from("not a workbook"), "rcm.xlsx"), (e: any) => e instanceof EngineError);
    await assert.rejects(parseRcm(Buffer.alloc(0), "rcm.xlsx"), (e: any) => e instanceof EngineError && /empty/.test(e.message));
    // A ZIP whose central directory declares more uncompressed data than the limit.
    const name = Buffer.from("xl/worksheets/sheet1.xml");
    const cd = Buffer.alloc(46 + name.length);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt32LE(1000, 20); cd.writeUInt32LE(MAX_UNCOMPRESSED + 1, 24); cd.writeUInt16LE(name.length, 28); name.copy(cd, 46);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(4, 16);
    const bomb = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), cd, eocd]);
    assert.throws(() => checkZip(bomb), (e: any) => e instanceof EngineError && /200 MB/.test(e.message));
    await assert.rejects(parseRcm(bomb, "bomb.xlsx"), (e: any) => /200 MB/.test(e.message));
    // A macro-enabled workbook (an .xlsm is a ZIP like an .xlsx) is refused by its VBA part, whatever its file name.
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>"); zip.file("xl/workbook.xml", "<workbook/>"); zip.file("xl/vbaProject.bin", "VBA");
    await assert.rejects(parseRcm(Buffer.from(await zip.generateAsync({ type: "nodebuffer" })), "innocent.xlsx"), (e: any) => /macro-enabled/.test(e.message));
    // Legacy .xls (OLE) is not a ZIP and is refused with a clear instruction.
    await assert.rejects(parseRcm(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), "old.xls"), (e: any) => /\.xls files must be saved as \.xlsx/.test(e.message));
  });
});

describe("column mapping", () => {
  it("maps the template exactly", async () => {
    const p = proposeMapping(await parseRcm(await templateRcm(), "rcm.xlsx"));
    assert.equal(p.profile, "soxplan-template");
    const c = p.sheets.find((s) => s.sheet === "Controls")!;
    assert.equal(c.role, "controls");
    assert.deepEqual([c.header_row, c.first_data_row], [2, 4]);   // band, header, requirement row skipped
    assert.ok(c.columns.filter((x) => x.header !== "Missing mandatory fields").every((x) => x.method === "template" && x.confidence === "high" && x.field));
    assert.equal(c.columns.find((x) => x.header === "Missing mandatory fields")!.field, null);
    assert.equal(p.sheets.find((s) => s.sheet === "Lists")!.role, "lists");
  });

  it("maps a client's own layout by header synonyms and by values, and says why", async () => {
    const p = proposeMapping(await parseRcm(await messyRcm(), "client.xlsx"));
    const s = p.sheets[0];
    assert.deepEqual([s.role, s.header_row, s.first_data_row], ["controls", 4, 5]);   // title rows above the header are skipped
    const f = Object.fromEntries(s.columns.map((c) => [c.header, c.field]));
    assert.deepEqual(f, { "Control #": "control.id", Application: "control.systems", WCGW: "risk.statement", "Control Activity": "control.description",
      "Control Type": "control.nature", "P/D": "control.type", "Freq.": "control.frequency", "Key?": "control.key", "Control Owner": "control.owner", Evidence: "control.evidence", Comments: null });
    const ct = s.columns.find((c) => c.header === "Control Type")!;
    assert.equal(ct.method, "values");                                // "Control Type" holds Manual / Automated: mapped by its values
    assert.ok(ct.alternatives.includes("control.type") && /Nature values/.test(ct.reason));
    assert.ok(p.warnings.some((w) => w.includes("Control Type")));
  });

  it("recognizes an Optro-style export and says its field names are inferred", async () => {
    const p = proposeMapping(await parseRcm(optroCsv(), "optro-export.csv"));
    assert.equal(p.profile, "optro");
    assert.ok(p.warnings[0].includes("Optro"));
    const f = Object.fromEntries(p.sheets[0].columns.map((c) => [c.header, c.field]));
    assert.equal(f.UID, "control.id");
    assert.equal(f["Control Weight"], "control.key");
  });

  it("normalizes client values to the picklists, and leaves unknown values unmapped", () => {
    assert.equal(normalizePick("frequency", "As needed"), "Event-driven");
    assert.equal(normalizePick("frequency", "Semi-annually"), "Semi-annual");
    assert.equal(normalizePick("nature", "ITDM"), "IT-dependent manual");
    assert.equal(normalizePick("yesno", "Non-Key"), "No");
    assert.equal(normalizePick("assertion", "E/O"), "Existence or occurrence");
    assert.equal(normalizePick("frequency", "periodically"), null);
  });

  it("the mapping agent fills only open columns, with known field keys, and treats file text as data", async () => {
    const p = proposeMapping(await parseRcm(await messyRcm(), "client.xlsx"));
    let seen = "";
    const stub = async (_s: string, user: string) => {
      seen = user;
      return [{ columns: [
        { sheet: "ITGC RCM FY26", column: "K", field: "control.prior_deficiency", confidence: "medium", reason: "comments mention prior-year review" },
        { sheet: "ITGC RCM FY26", column: "A", field: "control.title", confidence: "high", reason: "should not override a confident column" },
        { sheet: "ITGC RCM FY26", column: "K", field: "control.made_up", confidence: "high", reason: "unknown key" },
      ] }, { model: "stub" }] as [any, any];
    };
    const r = await assistMapping(p, stub);
    assert.ok(seen.includes('column K, header "Comments"') && !seen.includes('column A, header'));   // only open columns are sent
    const cols = Object.fromEntries(r.proposal.sheets[0].columns.map((c) => [c.column, c]));
    assert.equal(cols.K.field, "control.prior_deficiency");
    assert.equal(cols.K.method, "model");
    assert.equal(cols.A.field, "control.id");    // confident columns are never overridden
    assert.equal(r.changed, 1);
  });

  it("refuses a confirmation that cannot read any control", async () => {
    const db = await engagement();
    const up = await storeUpload(db, "pat", "NW-RCM", "client.xlsx", await messyRcm());
    const conf = proposalAsConfirmation((await getMapping(db, up.upload_id)).proposal);
    conf.sheets[0].columns.D = null;   // no description column
    await assert.rejects(confirmMapping(db, "pat", up.upload_id, conf), (e: any) => e instanceof EngineError && /Control description/.test(e.message));
    await assert.rejects(confirmMapping(db, "pat", up.upload_id, { sheets: [{ ...conf.sheets[0], columns: { A: "control.nope" } }] }), (e: any) => /unknown field/.test(e.message));
    await assert.rejects(extractUpload(db, "pat", up.upload_id), (e: any) => /confirm the column mapping/.test(e.message));
    db.release();
  });
});

describe("extraction and planning", () => {
  it("a template RCM becomes a pinned snapshot, cell-referenced criteria, and a plan", async () => {
    const db = await engagement();
    const { up, ex, findings } = await uploadAndExtract(db, await templateRcm(), "rcm.xlsx");
    assert.deepEqual([ex.counts.control, ex.counts.itgc_controls, ex.counts.risk, ex.counts.system], [2, 2, 2, 1]);
    assert.equal(findings.filter((f) => f.severity === "blocking").length, 0, JSON.stringify(findings.filter((f) => f.severity === "blocking")));
    const eng = (await db.query("SELECT snapshot_id FROM engagements WHERE name = 'NW-RCM'")).rows[0];
    assert.equal(eng.snapshot_id, ex.snapshot_id);
    const ctrls = (await db.query("SELECT control_id, identity_basis, category, module, systems FROM controls WHERE snapshot_id = $1 ORDER BY ref", [ex.snapshot_id])).rows;
    assert.deepEqual(ctrls.map((c) => [c.control_id, c.identity_basis, c.module]), [["A-01", "client", "AC-UAR"], ["A-03", "client", "CM-CHG"]]);
    assert.deepEqual(ctrls[0].systems, ["SAP ECC"]);
    // Criteria come from the exact RCM cells.
    const fact = (await db.query("SELECT value, cell FROM facts WHERE snapshot_id = $1 AND subject_ref = 'A-01' AND field = 'removal_timeframe'", [ex.snapshot_id])).rows[0];
    assert.equal(fact.value, "5 business days");
    assert.deepEqual([fact.cell.sheet, fact.cell.row, fact.cell.header], ["Controls", 5, "Operating criteria"]);
    await planning.generatePlan(db, "pat", "NW-RCM");
    const p = (await planning.getPlan(db, "NW-RCM")).plan;
    const a01 = p.controls.find((c: any) => c.ref === "A-01");
    assert.equal(a01.module, "AC-UAR");
    assert.equal(a01.criteria_register.criteria["UAR-E"].criterion, "5 business days");
    const uarE = a01.criteria_register.criteria["UAR-E"].source.cell;   // the plan cites the exact RCM cell
    assert.deepEqual([uarE.sheet, uarE.row, uarE.header], ["Controls", 5, "Operating criteria"]);
    assert.match(uarE.column, /^[A-Z]{1,2}$/);
    assert.equal(a01.criteria_register.criteria["UAR-D"].criterion, "within 15 business days after quarter end");
    assert.equal(a01.criteria_register.criteria["UAR-C"].criterion, "Business owners (department managers)");
    const a03 = p.controls.find((c: any) => c.ref === "A-03");
    assert.equal(a03.criteria_register.criteria["CHG-C"].criterion, "CAB");
    assert.ok(a01.procedures.length === 6 && a03.procedures.length === 6);
    assert.equal((await records(db, up.upload_id, "control")).length, 2);
    db.release();
  });

  it("a client's one-sheet ITGC matrix: category and module inferred and reported, never silently", async () => {
    const db = await engagement();
    const { ex, findings } = await uploadAndExtract(db, await messyRcm(), "client.xlsx");
    assert.equal(ex.counts.control, 4);
    assert.equal(ex.counts.risk, 4);   // risks described on the control rows become risk records
    const mods = (await db.query("SELECT ref, category, module FROM controls WHERE snapshot_id = $1 ORDER BY ref", [ex.snapshot_id])).rows;
    assert.deepEqual(mods.map((m) => [m.ref, m.category, m.module]), [["ITGC-01", "IT general control", "AC-UAR"], ["ITGC-02", "IT general control", "CM-CHG"], ["ITGC-03", "IT general control", "AC-PROV"], ["ITGC-04", "IT general control", "AC-AUTH"]]);
    const byCheck = (c: string) => findings.filter((f) => f.check === c).map((f) => f.record_key);
    assert.deepEqual(byCheck("module_inferred").sort(), ["ITGC-01", "ITGC-02", "ITGC-03", "ITGC-04"]);
    assert.equal(byCheck("category_inferred").length, 4);
    // ITGC-02 and -03 are event-driven: the system record of every occurrence is required, so they block until it is supplied.
    assert.deepEqual(findings.filter((f) => f.check === "conditional_missing" && f.field === "control.population_source").map((f) => f.record_key).sort(), ["ITGC-02", "ITGC-03"]);
    assert.ok(findings.some((f) => f.check === "ipe_not_recorded" && f.record_key === "ITGC-01"));   // the review relies on the SUIM listing
    const rec = (await db.query("SELECT client_attributes, fields FROM rcm_records WHERE snapshot_id = $1 AND key = 'ITGC-01'", [ex.snapshot_id])).rows[0];
    assert.equal(rec.client_attributes.Comments, "Reviewed by IA in 2025");                         // unmapped columns are kept
    assert.equal(rec.fields.control_frequency ?? rec.fields["control.frequency"], "Quarterly");
    db.release();
  });

  it("blocking intake findings stop planning until fixed or accepted by an approver with a reason", async () => {
    const db = await engagement();
    const { findings } = await uploadAndExtract(db, await messyRcm(), "client.xlsx");
    await assert.rejects(planning.generatePlan(db, "pat", "NW-RCM"), (e: any) => e instanceof EngineError && /blocking intake finding/.test(e.message));
    const blocking = findings.filter((f) => f.severity === "blocking");
    assert.ok(blocking.length);
    await assert.rejects(acceptIntakeFinding(db, "pat", blocking[0].id, "preparer cannot"), (e: any) => e instanceof EngineError);   // preparers cannot decide
    await assert.rejects(acceptIntakeFinding(db, "rj", blocking[0].id, " "), (e: any) => /reasoning/.test(e.message));
    for (const f of blocking) await acceptIntakeFinding(db, "rj", f.id, "Population source to be obtained at the walkthrough; tracked as a PBC request.");
    await assert.rejects(acceptIntakeFinding(db, "rj", blocking[0].id, "again"), (e: any) => /already has a human decision/.test(e.message));
    await assert.rejects(db.query("UPDATE intake_findings SET message = 'x' WHERE id = $1", [blocking[0].id]), (e: any) => e.code === "23001");
    await planning.generatePlan(db, "pat", "NW-RCM");
    const p = (await planning.getPlan(db, "NW-RCM")).plan;
    assert.deepEqual(p.controls.map((c: any) => c.module).sort(), ["AC-AUTH", "AC-PROV", "AC-UAR", "CM-CHG"]);
    db.release();
  });

  it("only IT general controls are planned; other categories are imported and kept visible", async () => {
    const db = await engagement();
    const base = { "Entity IDs": "ENT-US", "Key control": "Yes", "Process ID": "ITGC-APD", "Sub-process ID": "ITGC-APD-UAR", "Risk IDs": "R-01", "Control owner": "Controller", "Evidence of performance": "Signed reconciliation" };
    const buf = await templateRcm({ controls: [
      { ...base, "Control ID": "A-01", "Control category": "IT general control", "Control description": "Business owners review SAP user access quarterly using the SUIM listing and request removals in ServiceNow.", "Control type": "Detective", "Nature": "IT-dependent manual", "Frequency": "Quarterly", "System IDs": "SAP", "ITGC domain": "Access to programs and data", "Methodology module": "AC-UAR", "Layers covered": "Application" },
      { ...base, "Control ID": "BP-07", "Control category": "Business process control", "Control description": "The Controller reconciles the AR subledger to the general ledger monthly and investigates differences above USD 10,000.", "Control type": "Detective", "Nature": "Manual", "Frequency": "Monthly" },
    ] });
    const { findings } = await uploadAndExtract(db, buf, "rcm.xlsx");
    assert.ok(findings.filter((f) => f.record_key === "BP-07").every((f) => f.severity !== "blocking"));   // not planned yet: warnings only
    assert.ok(findings.some((f) => f.record_key === "BP-07" && f.field === "control.accounts_assertions"));
    await planning.generatePlan(db, "pat", "NW-RCM");
    const p = (await planning.getPlan(db, "NW-RCM")).plan;
    const bp = p.controls.find((c: any) => c.ref === "BP-07");
    assert.equal(bp.module, null);
    assert.ok(p.information_gaps.some((g: any) => g.kind === "not planned" && g.control === "BP-07"));
    assert.equal(p.controls.find((c: any) => c.ref === "A-01").module, "AC-UAR");
    db.release();
  });

  it("uploads are immutable, deduplicated by hash, and an extracted upload cannot be re-mapped", async () => {
    const db = await engagement();
    const buf = await templateRcm();
    const { up } = await uploadAndExtract(db, buf, "rcm.xlsx");
    const again = await storeUpload(db, "pat", "NW-RCM", "renamed.xlsx", buf);
    const odd = await storeUpload(db, "pat", "NW-RCM", "../../etc/passwd.xlsx", await templateRcm({ controls: [{ "Control ID": "Z-1", "Control description": "x" }] }));
    assert.equal((await db.query("SELECT filename FROM rcm_uploads WHERE id = $1", [odd.upload_id])).rows[0].filename, ".._.._etc_passwd.xlsx");   // a name, never a path
    assert.deepEqual([again.upload_id, again.existing], [up.upload_id, true]);
    await assert.rejects(db.query("UPDATE rcm_uploads SET content = 'x' WHERE id = $1", [up.upload_id]), (e: any) => e.code === "23001");
    await assert.rejects(db.query("UPDATE rcm_rows SET cells = '{}' WHERE upload_id = $1", [up.upload_id]), (e: any) => e.code === "23001");
    await assert.rejects(db.query("DELETE FROM rcm_mappings WHERE upload_id = $1", [up.upload_id]), (e: any) => e.code === "23001");
    await assert.rejects(confirmMapping(db, "pat", up.upload_id, proposalAsConfirmation((await getMapping(db, up.upload_id)).proposal)), (e: any) => /already been extracted/.test(e.message));
    await assert.rejects(storeUpload(db, "reader-nobody", "NW-RCM", "x.xlsx", buf), (e: any) => e instanceof EngineError);
    assert.ok(await audit.verifyChain(db));
    db.release();
  });

  it("module and criteria parsing", () => {
    assert.equal(classifyModule("Terminated employees' SAP access is disabled within one business day of the HR leaver notification")!.module, "AC-TERM");
    assert.equal(classifyModule("Nightly backups of the SAP database are monitored and restores are tested twice a year")!.module, "CO-BKP");
    assert.equal(classifyModule("Something unrelated to IT"), null);
    const c = parseCriteria("Removal timeframe: 5 business days; Approver: CAB; free text with no label");
    assert.deepEqual(c.pairs, [["removal_timeframe", "5 business days"], ["approver", "CAB"]]);
    assert.deepEqual(c.unparsed, ["free text with no label"]);
  });
});
