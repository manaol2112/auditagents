/** The full methodology (13 modules) and engagement module scope. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import pg from "pg";
import * as audit from "../src/audit.js";
import { EngineError, REPO_ROOT, j, now } from "../src/db.js";
import * as intake from "../src/intake.js";
import * as methodology from "../src/methodology.js";
import * as planning from "../src/planning.js";
import * as proposerModel from "../src/proposerModel.js";
import { checkout, freshDb, shutdown } from "./helpers.js";
import { STUB, clone } from "./stub.js";

const FX = join(REPO_ROOT, "fixtures", "northwind");
const THREE = ["AC-UAR", "AC-PROV", "CM-CHG"];
const norm = (t: string) => t.replace(/\s+/g, " ").trim();

after(async () => { await shutdown(); });

async function client(): Promise<[pg.PoolClient, number]> {
  const db = await checkout(await freshDb());
  await audit.addUser(db, "system", "rj", "approver");
  const cid = (await db.query("INSERT INTO clients (name, fiscal_year_end, time_zone) VALUES ('Northwind Foods','2026-12-31','America/New_York') RETURNING id")).rows[0].id;
  return [db, cid];
}

async function engagement(db: pg.PoolClient, cid: number, snap: number, modules: string[] | null, name = "NW-S") {
  const data = methodology.load();
  await db.query("INSERT INTO engagements (client_id, name, period_start, period_end, as_of, systems, methodology_version, methodology_hash, snapshot_id, created_by, created_at, modules) VALUES ($1,$2,'2026-01-01','2026-12-31','2026-12-31',$3,$4,$5,$6,'rj',$7,$8)",
    [cid, name, j(["SAP ECC", "Concur"]), data.version, data.document_hash, snap, now(), modules ? j(modules) : null]);
}

describe("methodology data", () => {
  const data = methodology.load();
  const md = norm(readFileSync(join(REPO_ROOT, data.source_document), "utf8"));

  it("is generated from the pinned methodology and up to date", () => {
    const out = execFileSync("node", [join(REPO_ROOT, "scripts", "build-methodology.mjs"), "--check"], { encoding: "utf8" });
    assert.ok(out.includes("up to date"));
    assert.equal(data.version, "0.4.1");
    assert.equal(data.modules.length, 13);
    assert.deepEqual(data.modules.map((m) => m.code), ["AC-UAR", "AC-PRIV", "CM-CHG", "CO-JOB", "AC-PROV", "AC-TERM", "AC-AUTH", "AC-PHYS", "CM-DATA", "DEV-SDLC", "CO-BKP", "CO-INC", "TP-SOC1"]);
  });

  it("carries the methodology text verbatim", () => {
    for (const m of data.modules) {
      assert.ok(md.includes(norm(m.risk)), `${m.code} risk`);
      for (const e of m.expectations) assert.ok(md.includes(`| ${e.code} | ${norm(e.text)}`), `${e.code} text is not verbatim`);
      for (const a of m.attributes) assert.ok(md.includes(`| ${a.code} | ${norm(a.text)}`), `${a.code} text is not verbatim`);
      for (const ev of m.evidence) assert.ok(md.includes(`- ${norm(ev)}`), `${m.code} evidence '${ev.slice(0, 40)}'`);
    }
  });

  it("leaves no expectation without a tester and no mapping pointing nowhere", () => {
    for (const m of data.modules) {
      const attrs = new Set(m.attributes.map((a) => a.code));
      for (const e of m.expectations) {
        assert.ok(e.tested_by.length || e.tested_elsewhere?.length, `${e.code} has no tester`);
        for (const t of e.tested_by) assert.ok(attrs.has(t), `${e.code} tested by unknown ${t}`);
      }
      for (const a of Object.keys(m.criteria)) assert.ok(attrs.has(a), `${m.code} criterion mapping for unknown ${a}`);
      assert.ok(m.risk_category && m.control_types.length && m.pattern, `${m.code} engine mapping incomplete`);
    }
    const priv = methodology.module(data, "AC-PRIV");   // ranges in the tested-by column are expanded
    assert.deepEqual(priv.expectations.find((e) => e.code === "PRIV-DE6")!.tested_by, ["PRIV-G", "PRIV-H", "PRIV-I"]);
    assert.deepEqual(methodology.module(data, "AC-PHYS").expectations.find((e) => e.code === "PHYS-DE5")!.tested_elsewhere, ["TP-SOC1"]);
  });

  it("refuses an unknown module in a scope", () => {
    assert.throws(() => methodology.scoped(data, ["AC-UAR", "AC-NOPE"]), (e: any) => e instanceof EngineError && e.message.includes("AC-NOPE"));
    assert.equal(methodology.scoped(data, null).modules.length, 13);
    const s = methodology.scoped(data, THREE);
    assert.deepEqual(s.modules.map((m) => m.code), ["AC-UAR", "CM-CHG", "AC-PROV"]);   // methodology order, whatever order the scope lists

    assert.equal(s.all_modules.length, 13);
  });
});

describe("engagement scope", () => {
  it("a three-module engagement plans only those modules and records the rest as out of scope", async () => {
    const [db, cid] = await client();
    for (const f of ["rcm.md", "narrative.md", "policy.md"]) await intake.ingestDocument(db, "planner-agent", cid, join(FX, f));
    const snap = await intake.extract(db, "planner-agent", cid);
    await engagement(db, cid, snap, THREE);
    await planning.generatePlan(db, "planner-agent", "NW-S");
    const p = (await planning.getPlan(db, "NW-S")).plan;
    assert.equal(p.coverage_cells.length, 6);
    assert.deepEqual(new Set(p.engagement.modules_in_scope), new Set(THREE));
    assert.equal(p.engagement.modules_out_of_scope.length, 10);
    assert.ok(!p.coverage_units.some((u: any) => !THREE.includes(u.module)));
    assert.equal(p.validation.filter((f: any) => ["V1", "V2", "V3", "V4"].includes(f.code)).length, 0);
    db.release();
  });

  it("the model sees only in-scope modules, and a mapping outside the scope is flagged, not planned", async () => {
    const [db, cid] = await client();
    for (const f of ["rcm.md", "narrative.md", "policy.md"]) await intake.ingestDocument(db, "planner-agent", cid, join(FX, f));
    const seen: string[] = [];
    const prop = clone(STUB);
    prop.controls[1].modules.push({ module: "AC-PRIV", rationale: "outside the scope on purpose" });
    const snap = await proposerModel.extractWithModel(db, "planner-agent", cid, ["SAP ECC", "Concur"], async (system, user) => { seen.push(system + user); return [clone(prop), { model: "stub" }]; }, undefined, THREE);
    assert.ok(seen[0].includes("MODULE AC-UAR") && !seen[0].includes("MODULE CO-BKP") && !seen[0].includes("MODULE AC-PRIV"));
    await engagement(db, cid, snap, THREE);
    await planning.generatePlan(db, "planner-agent", "NW-S", "model", proposerModel.modelProposals);
    const p = (await planning.getPlan(db, "NW-S")).plan;
    assert.ok(p.information_gaps.some((g: any) => g.kind === "out of scope module" && g.control === "A-05" && g.text.includes("AC-PRIV")));
    assert.ok(!p.controls.some((c: any) => c.module === "AC-PRIV"));
    assert.ok(p.information_gaps.some((g: any) => g.kind === "unknown module" && g.text.includes("AC-FOO")));   // still distinguished from a typo
    db.release();
  });
});

describe("new modules in the planner", () => {
  it("controls of the new modules map, and every attribute gets a procedure with its own population", async () => {
    const dir = mkdtempSync(join(tmpdir(), "soxplan-rcm13-"));
    writeFileSync(join(dir, "rcm.md"), [
      "# RCM", "", "## Risks", "", "| Risk ID | Statement | Financial reporting element | Assertions | IT risk category |", "|---|---|---|---|---|",
      "| R-10 | Privileged users bypass controls. | General ledger | accuracy | inappropriate access |",
      "| R-11 | Financial data cannot be recovered. | General ledger | completeness | computer operations |",
      "| R-12 | Service organization controls fail. | Revenue | accuracy | service organization |", "",
      "## Controls", "", "| Control ID | Description | Type | Frequency | Owner | Systems | Risks |", "|---|---|---|---|---|---|---|",
      "| P-01 | The IT Director reviews SAP privileged accounts and SAP_ALL holders quarterly. | privileged access | Quarterly | IT Director | SAP ECC | R-10 |",
      "| B-01 | SAP is backed up nightly with 30-day retention; restores are tested twice a year. | backup | Daily | Basis Lead | SAP ECC | R-11 |",
      "| S-01 | The Controller reviews the Concur SOC 1 Type 2 report annually, including complementary user entity controls. | service organization review | Annual | Controller | Concur | R-12 |", "",
    ].join("\n"));
    const [db, cid] = await client();
    await intake.ingestDocument(db, "planner-agent", cid, join(dir, "rcm.md"));
    const snap = await intake.extract(db, "planner-agent", cid);
    await engagement(db, cid, snap, null);
    await planning.generatePlan(db, "planner-agent", "NW-S");
    const p = (await planning.getPlan(db, "NW-S")).plan;
    const data = methodology.load();
    const byRef = (r: string) => p.controls.find((c: any) => c.ref === r);
    assert.deepEqual([byRef("P-01").module, byRef("B-01").module, byRef("S-01").module], ["AC-PRIV", "CO-BKP", "TP-SOC1"]);
    for (const r of ["P-01", "B-01", "S-01"]) {
      const c = byRef(r);
      assert.deepEqual(c.procedures.map((x: any) => x.attribute), methodology.module(data, c.module).attributes.map((a) => a.code));
      assert.ok(!c.risk_mismatch, `${r} risk category`);
      assert.ok(c.walkthrough_questions.every((q: string) => !q.includes("undefined")), `${r} has a question without a template`);
    }
    const priv = byRef("P-01").procedures;   // each part of AC-PRIV gets its own population row
    assert.ok(priv.find((x: any) => x.attribute === "PRIV-A").population.startsWith("All privileged accounts at the test date"));
    assert.ok(priv.find((x: any) => x.attribute === "PRIV-J").population.startsWith("Emergency access uses in the period"));
    assert.equal(priv.find((x: any) => x.attribute === "PRIV-F").criterion_status, "not defined by control");   // no approver stated: flagged, not invented
    assert.ok(byRef("P-01").criteria_register.findings.some((d: any) => d.attribute === "PRIV-F" && d.criterion === "D1"));
    assert.equal(p.coverage_cells.filter((c: any) => c.status === "tested under a module").length, 3);
    assert.equal(p.validation.filter((f: any) => ["V1", "V2", "V3", "V4", "V5"].includes(f.code)).length, 0);
    db.release();
  });
});
