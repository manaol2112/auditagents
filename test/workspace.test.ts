/** Read-only Planning Workforce workspace: model built from stored records, served over HTTP. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import * as audit from "../src/audit.js";
import * as intake from "../src/intake.js";
import { EngineError } from "../src/db.js";
import { addMember, setPassword } from "../src/auth.js";
import { ROUTES } from "../src/api.js";
import { buildServer } from "../src/server.js";
import { CSP } from "../src/security.js";
import * as workflow from "../src/workflow.js";
import * as workspace from "../src/workspace.js";
import { shutdown } from "./helpers.js";
import { FINDINGS_CYCLE1, FINDINGS_NONE, Stubs, build, endPools } from "./review-fixtures.js";

/** One full review cycle with stub transports: 1 revision, resolved + escalated + unverified findings. */
async function reviewedDb(): Promise<pg.PoolClient> {
  const db = await build();
  await workflow.reviewCycle(db, "reviewer-agent", "NW-REV", new Stubs([FINDINGS_CYCLE1, FINDINGS_NONE]).transports());
  return db;
}

after(async () => { await endPools(); await shutdown(); });

describe("workspace model", () => {
  it("nodes and edges reflect the recorded flow", async () => {
    const db = await reviewedDb();
    const m = await workspace.buildModel(db, "NW-REV");
    assert.deepEqual(m.nodes.map((n: any) => n.id), ["intake", "planner", "reviewer", "revision-1", "human"]);
    const edges = new Set(m.edges.map((e: any) => `${e.from}>${e.to}:${e.kind}`));
    for (const e of ["intake>planner:flow", "planner>reviewer:flow", "reviewer>revision-1:challenge", "revision-1>planner:flow", "reviewer>human:escalation", "planner>human:flow"]) assert.ok(edges.has(e), e);
    assert.equal(m.edges.filter((e: any) => e.from === "planner" && e.to === "reviewer").length, 2);   // v1 and v2 both reviewed
    assert.ok(!m.nodes.some((n: any) => n.id === "revision-2"));   // cycle 2 had no actionable findings
    db.release();
  });

  it("node details come from stored records", async () => {
    const db = await reviewedDb();
    const m = await workspace.buildModel(db, "NW-REV");
    const nodes = Object.fromEntries(m.nodes.map((n: any) => [n.id, n]));
    const intake = nodes.intake.details;
    assert.deepEqual(intake.documents.map((d: any) => d.doc_type), ["rcm", "narrative", "policy"]);
    assert.equal(intake.snapshots.length, 2);   // extraction + revision snapshot
    assert.deepEqual(intake.snapshots.filter((s: any) => s.pinned).map((s: any) => s.id), [(await db.query("SELECT snapshot_id FROM engagements")).rows[0].snapshot_id]);
    const planner = nodes.planner.details;
    assert.deepEqual(planner.plan_versions.map((v: any) => v.version), [1, 2]);
    assert.deepEqual(planner.plan_versions.map((v: any) => v.status), ["superseded", "draft"]);
    assert.equal(planner.plan_versions[1].revision_of, 1);
    assert.ok(planner.controls.some((c: any) => c.label === "A-13"));   // the control added by the revision is in the latest plan
    assert.ok(planner.controls.filter((c: any) => c.module).every((c: any) => c.source && c.procedures.length));
    const reviewer = nodes.reviewer.details;
    assert.equal(reviewer.reviews.length, 2);
    const stored = new Set((await db.query("SELECT id FROM review_notes")).rows.map((r) => r.id));
    assert.deepEqual(new Set(reviewer.findings.map((f: any) => f.id)), stored);
    assert.equal(reviewer.by_status.resolved, 2);
    assert.ok(reviewer.findings.filter((f: any) => f.status === "resolved").every((f: any) => f.fix_check?.fixed));   // resolved only via the objective check
    const rev = nodes["revision-1"].details;
    const cats = new Set(rev.findings.map((f: any) => f.category));
    assert.ok(cats.has("omitted_control") && cats.has("unsupported_criterion"));
    assert.ok(!rev.findings.some((f: any) => f.status === "unverified"));   // unverified findings are never sent to the planner
    assert.equal(rev.plan_version.version, 2);
    assert.ok(rev.activities.some((a: any) => a.step === "cycle1_fix_checks"));
    assert.equal(m.activities.length, (await workflow.activityLog(db, 1)).length);
    db.release();
  });

  it("the action queue lists what a person must decide", async () => {
    const db = await reviewedDb();
    const m = await workspace.buildModel(db, "NW-REV");
    const q = m.action_queue;
    const kinds = new Set(q.map((i: any) => `${i.kind}|${i.ref}`));
    const escalated = new Set((await db.query("SELECT id FROM review_notes WHERE status IN ('escalated','unverified')")).rows.map((r) => `#${r.id}`));
    assert.deepEqual(new Set(q.filter((i: any) => i.kind === "review finding").map((i: any) => i.ref)), escalated);
    assert.ok(kinds.has("approval|v2"));
    assert.ok(q.every((i: any) => i.action));
    assert.ok(!q.some((i: any) => i.kind === "review finding" && ["open", "resolved"].includes(i.status)));   // low-significance open and resolved findings are not queued
    assert.equal(m.nodes[m.nodes.length - 1].status, "action required");
    const fid = Number(q.find((i: any) => i.kind === "review finding").ref.slice(1));   // a human disposition removes the item and shows under the human node
    await workflow.dispositionFinding(db, "rj", fid, "dismiss", "Reviewed; judgment call accepted as is.");
    const m2 = await workspace.buildModel(db, "NW-REV");
    assert.ok(!m2.action_queue.some((i: any) => i.kind === "review finding" && i.ref === `#${fid}`));
    assert.ok(m2.nodes[m2.nodes.length - 1].details.dispositions.some((f: any) => f.id === fid));
    db.release();
  });

  it("shows only this engagement's audit events, never another client's", async () => {
    const db = await reviewedDb();
    const other = (await db.query("INSERT INTO clients (name, fiscal_year_end, time_zone) VALUES ('Other Client','2026-12-31','UTC') RETURNING id")).rows[0].id;
    const otherDoc = await intake.ingestDocument(db, "planner-agent", other, join(import.meta.dirname, "..", "fixtures", "northwind", "policy.md"));
    await audit.recordEvent(db, "rj", "plan.approve", "plan_version", 99999, { note: "OTHER-CLIENT-SECRET" });
    await audit.recordEvent(db, "rj", "contradiction.resolve", "contradiction", 99999, { reason: "OTHER-CLIENT-SECRET" });
    const m = await workspace.buildModel(db, "NW-REV");
    const events = m.nodes.flatMap((n: any) => n.details.events ?? []);
    assert.ok(events.length > 0);
    assert.ok(!JSON.stringify(m).includes("OTHER-CLIENT-SECRET"));
    assert.ok(!events.some((e: any) => e.entity === "document" && Number(e.entity_id) === otherDoc));
    assert.ok(!events.some((e: any) => e.action === "user.add" || e.action === "db.init"));   // global events are not engagement data
    assert.ok(events.filter((e: any) => e.action === "document.ingest").every((e: any) => !String(e.detail.path).includes("/")));   // no server paths
    db.release();
  });

  it("an unknown engagement is refused", async () => {
    const db = await build();
    await assert.rejects(workspace.buildModel(db, "nope"), (e: any) => e instanceof EngineError);
    db.release();
  });
});

describe("workspace server", () => {
  let app: ReturnType<typeof buildServer>;
  let db: pg.PoolClient;
  let token = "";
  // Every API request is authenticated and scoped to the engagements the user is a member of (src/api.ts).
  const inject = (o: any) => app.inject({ ...o, headers: { authorization: `Bearer ${token}`, ...(o.headers ?? {}) } });
  before(async () => {
    db = await reviewedDb();
    await setPassword(db, "rj", "rj", "correct horse battery staple");
    await addMember(db, "system", (await db.query("SELECT id FROM engagements WHERE name = 'NW-REV'")).rows[0].id, "rj");
    app = buildServer((db as any).__pool);
    await app.ready();
    token = (await app.inject({ method: "POST", url: "/api/session", payload: { username: "rj", password: "correct horse battery staple", bearer: true } })).json().token;
  });
  after(async () => { await app.close(); db.release(); });

  it("refuses API reads without a session", async () => {
    assert.equal((await app.inject({ method: "GET", url: "/api/engagements" })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: "/api/workspace/NW-REV" })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: "/api/engagements", headers: { authorization: "Bearer not-a-token" } })).statusCode, 401);
  });

  it("serves the page and the API", async () => {
    const page = await inject({ method: "GET", url: "/" });
    assert.equal(page.statusCode, 200);
    assert.ok(page.headers["content-type"]?.toString().includes("text/html"));
    assert.ok(page.body.includes("Planning Workforce"));
    const engs = await inject({ method: "GET", url: "/api/engagements" });
    assert.deepEqual(engs.json(), [{ name: "NW-REV", client: "Northwind Foods", period_start: "2026-01-01", period_end: "2026-12-31" }]);
    const ws = await inject({ method: "GET", url: "/api/workspace/NW-REV" });
    const m = ws.json();
    assert.equal(m.engagement.name, "NW-REV");
    assert.equal(m.nodes.length, 5);
    assert.ok(m.action_queue.length);
  });

  it("the web UI only calls endpoints that exist", () => {
    // All network access in the UI goes through web/src/api/client.ts (enforced by web/scripts/security-check.mjs).
    const client = readFileSync(join(import.meta.dirname, "..", "web", "src", "api", "client.ts"), "utf8");
    const eps = new Set([...client.matchAll(/"(\/api\/[a-z-]+)/g)].map((m) => m[1]));
    assert.ok(eps.size >= 2);
    // Every first path segment the UI uses is a route of the back-end API (architecture/api-contract.md).
    const segment = (ep: string) => ep.slice("/api/".length);
    for (const ep of eps) assert.ok(ROUTES.some(([re]) => new RegExp(`(^|[\\/(|])${segment(ep)}([\\\\/)|$]|$)`).test(re.source.replace(/\\\//g, "/"))), ep);
  });

  it("sends the security headers on pages and API responses", async () => {
    for (const url of ["/", "/api/engagements", "/api/workspace/NW-REV", "/api/workspace/missing"]) {
      const r = await inject({ method: "GET", url });
      assert.equal(r.headers["content-security-policy"], CSP, url);
      assert.equal(r.headers["x-content-type-options"], "nosniff", url);
      assert.equal(r.headers["referrer-policy"], "no-referrer", url);
      assert.equal(r.headers["x-frame-options"], "DENY", url);
      assert.equal(r.headers["cross-origin-opener-policy"], "same-origin", url);
    }
    assert.equal((await inject({ method: "GET", url: "/api/workspace/NW-REV" })).headers["cache-control"], "no-store");
    assert.ok(CSP.includes("script-src 'self'") && !CSP.includes("unsafe") && CSP.includes("frame-ancestors 'none'") && CSP.includes("require-trusted-types-for 'script'"));
  });

  it("refuses foreign Host headers (DNS rebinding) and cross-site reads", async () => {
    assert.equal((await inject({ method: "GET", url: "/api/engagements", headers: { host: "attacker.example:8765" } })).statusCode, 421);
    assert.equal((await inject({ method: "GET", url: "/api/engagements", headers: { host: "127.0.0.1:8765" } })).statusCode, 200);
    assert.equal((await inject({ method: "GET", url: "/api/engagements", headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" } })).statusCode, 403);
    assert.equal((await inject({ method: "GET", url: "/api/engagements", headers: { "sec-fetch-site": "same-site" } })).statusCode, 403);
    assert.equal((await inject({ method: "GET", url: "/", headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" } })).statusCode, 403);
    assert.equal((await inject({ method: "GET", url: "/", headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } })).statusCode, 200);
    assert.equal((await inject({ method: "GET", url: "/api/engagements", headers: { "sec-fetch-site": "same-origin" } })).statusCode, 200);
  });

  it("never echoes request input in errors", async () => {
    const r = await inject({ method: "GET", url: "/api/workspace/%3Cscript%3Ealert(1)%3C%2Fscript%3E" });
    assert.equal(r.statusCode, 404);
    assert.ok(!r.body.includes("script"));
  });

  it("is read-only and refuses unknowns, leaving the audit chain intact", async () => {
    assert.equal((await inject({ method: "GET", url: "/api/workspace/missing" })).statusCode, 404);
    assert.equal((await inject({ method: "POST", url: "/api/workspace/NW-REV", payload: {} })).statusCode, 405);
    assert.equal((await inject({ method: "DELETE", url: "/api/engagements" })).statusCode, 405);
    assert.equal((await inject({ method: "GET", url: "/../etc/passwd" })).statusCode, 404);
    assert.ok(await audit.verifyChain(db));
  });
});
