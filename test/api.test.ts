/** Back-end API (architecture/api-contract.md): sign-in, cookie sessions with CSRF, roles, per-engagement isolation,
 * the RCM-to-plan workflow, jobs, and the audit trail under concurrent writes. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import * as audit from "../src/audit.js";
import { setPassword } from "../src/auth.js";
import { buildServer } from "../src/server.js";
import { checkout, freshDb, shutdown } from "./helpers.js";
import { messyRcm, templateRcm } from "./rcm-fixtures.js";
import { STUB, clone } from "./stub.js";

const PW = "correct horse battery staple";
let pool: pg.Pool, db: pg.PoolClient, app: ReturnType<typeof buildServer>;
const tokens: Record<string, string> = {};

const call = (who: string | null, method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: method as any, url, ...(payload === undefined ? {} : Buffer.isBuffer(payload) ? { payload, headers: { "content-type": "application/octet-stream", ...(who ? { authorization: `Bearer ${tokens[who]}` } : {}), ...headers } } : { payload: payload as any }),
    headers: { ...(who ? { authorization: `Bearer ${tokens[who]}` } : {}), ...(Buffer.isBuffer(payload) ? { "content-type": "application/octet-stream" } : {}), ...headers } });

async function waitJob(who: string, id: number) {
  for (let i = 0; i < 200; i++) {
    const j = (await call(who, "GET", `/api/jobs/${id}`)).json();
    if (j.status === "succeeded" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("job did not finish");
}

before(async () => {
  pool = await freshDb();
  db = await checkout(pool);
  for (const [n, r] of [["pat", "preparer"], ["rj", "approver"], ["ann", "approver"], ["eve", "approver"], ["rita", "reader"], ["adam", "admin"]] as const) {
    await audit.addUser(db, "system", n, r);
    await setPassword(db, n, n, PW);
  }
  app = buildServer(pool, undefined, { transports: { proposer: async () => [clone(STUB), { model: "stub" }], mapping: async () => [{ columns: [] }, { model: "stub" }] } });
  await app.ready();
  for (const n of ["pat", "rj", "ann", "eve", "rita", "adam"]) tokens[n] = (await app.inject({ method: "POST", url: "/api/session", payload: { username: n, password: PW, bearer: true } })).json().token;
});
after(async () => { await app.close(); db.release(); await shutdown(); });

describe("sign-in and sessions", () => {
  it("refuses bad credentials with one message for unknown users and wrong passwords, and agents cannot sign in", async () => {
    const a = await app.inject({ method: "POST", url: "/api/session", payload: { username: "pat", password: "wrong password here" } });
    const b = await app.inject({ method: "POST", url: "/api/session", payload: { username: "nobody", password: "wrong password here" } });
    assert.deepEqual([a.statusCode, b.statusCode], [401, 401]);
    assert.equal(a.json().message, b.json().message);
    assert.equal((await app.inject({ method: "POST", url: "/api/session", payload: { username: "planner-agent", password: PW } })).statusCode, 401);
    assert.equal((await call(null, "GET", "/api/me")).statusCode, 401);
    assert.equal((await call("pat", "GET", "/api/me")).json().role, "preparer");
  });

  it("locks a user name after five failed attempts", async () => {
    await audit.addUser(db, "system", "lou", "reader");
    await setPassword(db, "lou", "lou", PW);
    for (let i = 0; i < 5; i++) await app.inject({ method: "POST", url: "/api/session", payload: { username: "lou", password: "not the password" } });
    assert.equal((await app.inject({ method: "POST", url: "/api/session", payload: { username: "lou", password: PW } })).statusCode, 429);
  });

  it("the browser gets an HttpOnly SameSite=Strict cookie, not the token; cookie writes need the CSRF token", async () => {
    const r = await app.inject({ method: "POST", url: "/api/session", payload: { username: "pat", password: PW } });
    const cookie = String(r.headers["set-cookie"]);
    assert.match(cookie, /^soxplan_session=[^;]+; Path=\/api; HttpOnly; SameSite=Strict; Max-Age=\d+/);
    const body = r.json();
    assert.ok(body.csrf_token && !("token" in body));   // page scripts never see the session token
    const c = cookie.split(";")[0];
    assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: c } })).statusCode, 200);
    const create = (headers: Record<string, string>) => app.inject({ method: "POST", url: "/api/clients", payload: { name: `Cookie Co ${Math.random()}`, fiscal_year_end: "2026-12-31", time_zone: "UTC" }, headers: { cookie: c, ...headers } });
    assert.equal((await create({})).statusCode, 401);
    assert.equal((await create({ "x-csrf-token": "forged" })).statusCode, 401);
    assert.equal((await create({ "x-csrf-token": body.csrf_token })).statusCode, 201);
    const out = await app.inject({ method: "DELETE", url: "/api/session", headers: { cookie: c } });
    assert.equal(out.statusCode, 204);
    assert.match(String(out.headers["set-cookie"]), /Max-Age=0/);
    assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: c } })).statusCode, 401);
  });

  it("answers 405 for methods a route does not take, before authentication", async () => {
    assert.equal((await call(null, "DELETE", "/api/engagements")).statusCode, 405);
    assert.equal((await call(null, "PUT", "/api/workspace/X")).statusCode, 405);
    assert.equal((await call(null, "POST", "/assets/app.js")).statusCode, 405);
  });
});

describe("the RCM-to-plan workflow, as the UI drives it", () => {
  let upload = 0;
  it("creates a client and an engagement before any document", async () => {
    assert.equal((await call("pat", "POST", "/api/clients", { name: "Northwind Foods", fiscal_year_end: "2026-12-31", time_zone: "America/New_York" })).statusCode, 201);
    const e = await call("pat", "POST", "/api/engagements", { client: "Northwind Foods", name: "NW-FY2026", period_start: "2026-01-01", period_end: "2026-12-31", as_of: "2026-12-31", systems: ["SAP ECC"], modules: null });
    assert.equal(e.statusCode, 201);
    assert.deepEqual([e.json().stage, e.json().snapshot_id, e.json().modules_in_scope.length], ["setup", null, 13]);
    assert.equal((await call("pat", "POST", "/api/engagements/NW-FY2026/plan", { proposer: "rules" })).statusCode, 409);   // nothing extracted yet
    assert.equal((await call("pat", "POST", "/api/engagements", { client: "Northwind Foods", name: "bad/name", period_start: "2026-01-01", period_end: "2026-12-31", as_of: "2026-12-31", systems: ["SAP ECC"] })).statusCode, 400);
  });

  it("uploads the RCM, shows the mapping proposal, confirms it, and extracts", async () => {
    const up = await call("pat", "POST", "/api/engagements/NW-FY2026/rcm?filename=rcm.xlsx", await templateRcm());
    assert.equal(up.statusCode, 201, up.body);
    upload = up.json().upload_id;
    const m = (await call("pat", "GET", `/api/rcm/${upload}/mapping`)).json();
    assert.equal(m.proposal.profile, "soxplan-template");
    assert.equal(m.confirmed, null);
    const conf = { sheets: m.proposal.sheets.map((s: any) => ({ sheet: s.sheet, role: s.role, header_row: s.header_row, first_data_row: s.first_data_row, columns: Object.fromEntries(s.columns.map((c: any) => [c.column, c.field])) })) };
    assert.equal((await call("rita", "PUT", `/api/rcm/${upload}/mapping`, conf)).statusCode, 404);   // not a member: as if it did not exist
    await call("pat", "POST", "/api/engagements/NW-FY2026/members", { user: "rita" });
    assert.equal((await call("rita", "GET", `/api/rcm/${upload}/mapping`)).statusCode, 200);          // a member reader can read
    assert.equal((await call("rita", "PUT", `/api/rcm/${upload}/mapping`, conf)).statusCode, 403);   // but not confirm
    const put = await call("pat", "PUT", `/api/rcm/${upload}/mapping`, conf);
    assert.equal(put.statusCode, 200, put.body);
    const ex = await call("pat", "POST", `/api/rcm/${upload}/extract`);
    assert.equal(ex.statusCode, 200, ex.body);
    assert.equal(ex.json().counts.itgc_controls, 2);
    assert.equal((await call("pat", "GET", `/api/rcm/${upload}/findings`)).statusCode, 200);
    assert.equal((await call("pat", "GET", `/api/rcm/${upload}/records?kind=control`)).json().length, 2);
    assert.equal((await call("pat", "GET", "/api/engagements/NW-FY2026")).json().stage, "extracted");
    assert.equal((await call("pat", "GET", "/api/rcm/fields")).json().find((f: any) => f.key === "control.frequency").values.includes("Event-driven"), true);
  });

  it("plans, and the approval rules hold: the preparer cannot approve, an approver who generated a draft cannot approve it", async () => {
    const p = await call("pat", "POST", "/api/engagements/NW-FY2026/plan", { proposer: "rules" });
    assert.equal(p.statusCode, 201, p.body);
    assert.equal((await call("eve", "GET", "/api/engagements/NW-FY2026/plan")).statusCode, 404);   // eve is an approver but not a member
    await call("pat", "POST", "/api/engagements/NW-FY2026/members", { user: "rj" });
    await call("pat", "POST", "/api/engagements/NW-FY2026/members", { user: "ann" });
    assert.equal((await call("pat", "POST", "/api/engagements/NW-FY2026/approve", { note: "ok" })).statusCode, 403);
    const regenerated = await call("rj", "POST", "/api/engagements/NW-FY2026/plan", { proposer: "rules" });
    assert.equal(regenerated.statusCode, 201);
    const own = await call("rj", "POST", "/api/engagements/NW-FY2026/approve", { note: "approving my own draft" });
    assert.equal(own.statusCode, 409);
    assert.match(own.json().message, /cannot be approved by the user who generated it/);
    const ok = await call("ann", "POST", "/api/engagements/NW-FY2026/approve", { note: "Reviewed: coverage gaps for modules not in the RCM accepted pending walkthroughs." });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal((await call("ann", "GET", "/api/engagements/NW-FY2026")).json().stage, "approved");
    const ev = (await db.query("SELECT actor FROM events WHERE action = 'plan.approve'")).rows;
    assert.deepEqual(ev.map((e) => e.actor), ["ann"]);   // the signed-in user is the actor, never a client-supplied name
  });

  it("runs model planning as a background job", async () => {
    const r = await call("pat", "POST", "/api/engagements/NW-FY2026/plan", { proposer: "model" });
    assert.equal(r.statusCode, 202);
    const job = await waitJob("pat", r.json().job.id);
    assert.equal(job.status, "succeeded", job.error);
    assert.ok(job.result.plan_version >= 3);
  });

  it("an engagement with blocking intake findings refuses planning with the reason", async () => {
    await call("pat", "POST", "/api/engagements", { client: "Northwind Foods", name: "NW-MESSY", period_start: "2026-01-01", period_end: "2026-12-31", as_of: "2026-12-31", systems: ["SAP ECC"], modules: null });
    const up = (await call("pat", "POST", "/api/engagements/NW-MESSY/rcm?filename=client.xlsx", await messyRcm())).json().upload_id;
    const m = (await call("pat", "GET", `/api/rcm/${up}/mapping`)).json();
    await call("pat", "PUT", `/api/rcm/${up}/mapping`, { sheets: m.proposal.sheets.map((s: any) => ({ ...s, columns: Object.fromEntries(s.columns.map((c: any) => [c.column, c.field])) })) });
    await call("pat", "POST", `/api/rcm/${up}/extract`);
    const r = await call("pat", "POST", "/api/engagements/NW-MESSY/plan", { proposer: "rules" });
    assert.equal(r.statusCode, 409);
    assert.match(r.json().message, /blocking intake finding/);
    const f = (await call("pat", "GET", `/api/rcm/${up}/findings`)).json().find((x: any) => x.severity === "blocking");
    assert.equal((await call("pat", "POST", `/api/intake-findings/${f.id}/accept`, { reason: "x" })).statusCode, 403);
  });
});

describe("isolation between clients and engagements", () => {
  it("someone who is not a member sees nothing of the engagement, and the same 404 as for something that does not exist", async () => {
    const upload = (await db.query("SELECT id FROM rcm_uploads ORDER BY id LIMIT 1")).rows[0].id;
    const finding = (await db.query("SELECT id FROM intake_findings ORDER BY id LIMIT 1")).rows[0].id;
    const job = (await db.query("SELECT id FROM jobs ORDER BY id LIMIT 1")).rows[0].id;
    for (const url of ["/api/engagements/NW-FY2026", "/api/workspace/NW-FY2026", "/api/engagements/NW-FY2026/plan", "/api/engagements/NW-FY2026/members", `/api/rcm/${upload}`, `/api/rcm/${upload}/mapping`, `/api/rcm/${upload}/findings`, `/api/rcm/${upload}/records`, `/api/jobs/${job}`]) {
      const r = await call("eve", "GET", url);
      assert.equal(r.statusCode, 404, url);
      assert.deepEqual(r.json(), { error: "not_found", message: "not found" }, url);
    }
    assert.deepEqual((await call("eve", "GET", "/api/engagements/NOPE")).json(), { error: "not_found", message: "not found" });
    for (const [m, url, body] of [["POST", `/api/intake-findings/${finding}/accept`, { reason: "r" }], ["POST", "/api/engagements/NW-FY2026/approve", { note: "n" }], ["POST", `/api/rcm/${upload}/extract`, undefined],
      ["POST", "/api/engagements/NW-FY2026/members", { user: "eve" }], ["POST", "/api/engagements/NW-FY2026/rcm?filename=x.xlsx", Buffer.from("x")]] as const) {
      assert.equal((await call("eve", m, url, body)).statusCode, 404, url);
    }
    assert.deepEqual((await call("eve", "GET", "/api/engagements")).json(), []);
    assert.deepEqual((await call("eve", "GET", "/api/clients")).json(), []);
    // A client one cannot see cannot be used for a new engagement either.
    assert.equal((await call("eve", "POST", "/api/engagements", { client: "Northwind Foods", name: "EVE-1", period_start: "2026-01-01", period_end: "2026-12-31", as_of: "2026-12-31", systems: ["SAP ECC"] })).statusCode, 404);
  });

  it("each user's own clients and engagements stay theirs", async () => {
    await call("eve", "POST", "/api/clients", { name: "Lumen Health", fiscal_year_end: "2026-06-30", time_zone: "America/Chicago" });
    await call("eve", "POST", "/api/engagements", { client: "Lumen Health", name: "LUMEN-1", period_start: "2025-07-01", period_end: "2026-06-30", as_of: "2026-06-30", systems: ["NetSuite"], modules: ["AC-UAR"] });
    assert.deepEqual((await call("eve", "GET", "/api/engagements")).json().map((e: any) => e.name), ["LUMEN-1"]);
    assert.ok(!(await call("pat", "GET", "/api/engagements")).json().some((e: any) => e.name === "LUMEN-1"));
    assert.ok(!(await call("pat", "GET", "/api/clients")).json().some((c: any) => c.name === "Lumen Health"));
    assert.equal((await call("pat", "GET", "/api/workspace/LUMEN-1")).statusCode, 404);
  });
});

describe("input handling and integrity", () => {
  it("never echoes input in errors", async () => {
    for (const url of ["/api/engagements/%3Cscript%3Ealert(1)%3C%2Fscript%3E", "/api/workspace/%3Cimg%20src%3Dx%3E"]) {
      const r = await call("pat", "GET", url);
      assert.equal(r.statusCode, 404);
      assert.ok(!/script|img/.test(r.body));
    }
    assert.equal((await call("pat", "GET", "/api/rcm/not-a-number")).statusCode, 404);
    assert.equal((await call(null, "GET", "/api/rcm/not-a-number")).statusCode, 404);         // unknown API paths never reach a handler
    assert.ok([401, 404].includes((await call(null, "GET", "/api/rcm/1/../../engagements")).statusCode));   // refused either way; never data
  });

  it("refuses uploads over 20 MB and bodies that are not files", async () => {
    const big = Buffer.alloc(20 * 1024 * 1024 + 10, 1);
    assert.equal((await call("pat", "POST", "/api/engagements/NW-FY2026/rcm?filename=big.xlsx", big)).statusCode, 413);
    assert.equal((await call("pat", "POST", "/api/engagements/NW-FY2026/rcm?filename=x.xlsx", Buffer.from("not a workbook"))).statusCode, 409);
  });

  it("keeps the audit chain intact under concurrent writes", async () => {
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => call("pat", "POST", "/api/clients", { name: `Parallel ${i}`, fiscal_year_end: "2026-12-31", time_zone: "UTC" })));
    assert.ok(rs.every((r) => r.statusCode === 201));
    assert.ok(await audit.verifyChain(db));
  });
});

describe("administration", () => {
  const signIn = (username: string, password: string) => app.inject({ method: "POST", url: "/api/session", payload: { username, password, bearer: true } });

  it("only administrators manage people", async () => {
    for (const who of ["pat", "rj", "rita"]) {
      assert.equal((await call(who, "GET", "/api/users")).statusCode, 403, who);
      assert.equal((await call(who, "POST", "/api/users", { name: "x1", role: "reader", password: PW })).statusCode, 403, who);
      assert.equal((await call(who, "GET", "/api/admin/engagements")).statusCode, 403, who);
    }
    const users = (await call("adam", "GET", "/api/users")).json();
    assert.ok(users.some((x: any) => x.name === "pat" && x.role === "preparer") && !users.some((x: any) => x.name === "planner-agent"));   // agents are not people
    assert.ok(!JSON.stringify(users).includes("scrypt"));   // password hashes never leave the server
  });

  it("an administrator creates accounts, changes roles, resets passwords, and retires accounts", async () => {
    const created = await call("adam", "POST", "/api/users", { name: "kim", role: "preparer", display_name: "Kim", password: PW });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal((await call("adam", "POST", "/api/users", { name: "Bad Name", role: "reader", password: PW })).statusCode, 409);
    assert.equal((await call("adam", "POST", "/api/users", { name: "short", role: "reader", password: "short" })).statusCode, 409);
    assert.equal((await call("adam", "POST", "/api/users", { name: "x2", role: "agent", password: PW })).statusCode, 409);   // agents are not created as people
    const kimToken = (await signIn("kim", PW)).json().token;
    assert.ok(kimToken);
    assert.equal((await call("adam", "PUT", "/api/users/kim", { role: "approver" })).json().role, "approver");
    assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${kimToken}` } })).statusCode, 401);   // a role change ends sessions
    assert.equal((await call("adam", "POST", "/api/users/kim/password", { password: "another long password" })).statusCode, 204);
    assert.equal((await signIn("kim", PW)).statusCode, 401);
    assert.equal((await signIn("kim", "another long password")).statusCode, 200);
    assert.equal((await call("adam", "POST", "/api/users/kim/disable", { reason: "" })).statusCode, 400);
    assert.equal((await call("adam", "POST", "/api/users/kim/disable", { reason: "left the firm" })).statusCode, 204);
    assert.equal((await signIn("kim", "another long password")).statusCode, 401);   // retired: cannot sign in
    assert.equal((await call("adam", "GET", "/api/users")).json().find((x: any) => x.name === "kim").disabled, true);
    assert.ok((await db.query("SELECT 1 FROM events WHERE action = 'user.disable' AND entity_id = 'kim' AND actor = 'adam'")).rows.length);
    // No administrator can lock themselves out or raise their own rights.
    assert.equal((await call("adam", "PUT", "/api/users/adam", { role: "approver" })).statusCode, 409);
    assert.equal((await call("adam", "POST", "/api/users/adam/disable", { reason: "x" })).statusCode, 409);
    assert.equal((await call("adam", "PUT", "/api/users/nobody", { role: "reader" })).statusCode, 404);
  });

  it("people change their own password with the current one, and no one else's", async () => {
    assert.equal((await call("rita", "POST", "/api/users/rita/password", { password: "a brand new password", current_password: "wrong" })).statusCode, 403);
    assert.equal((await call("rita", "POST", "/api/users/pat/password", { password: "a brand new password", current_password: PW })).statusCode, 403);
    assert.equal((await call("rita", "POST", "/api/users/rita/password", { password: "a brand new password", current_password: PW })).statusCode, 204);
    assert.equal((await signIn("rita", "a brand new password")).statusCode, 200);
    tokens.rita = (await signIn("rita", "a brand new password")).json().token;
  });

  it("an administrator manages access to any engagement but sees its content only as a member, and never prepares or approves", async () => {
    assert.equal((await call("adam", "GET", "/api/engagements/NW-FY2026")).statusCode, 404);      // not a member: no content
    assert.equal((await call("adam", "GET", "/api/workspace/NW-FY2026")).statusCode, 404);
    const all = (await call("adam", "GET", "/api/admin/engagements")).json();
    assert.ok(all.some((e: any) => e.name === "NW-FY2026" && e.members.includes("pat")) && all.some((e: any) => e.name === "LUMEN-1"));
    assert.equal((await call("adam", "POST", "/api/engagements/LUMEN-1/members", { user: "rita" })).statusCode, 201);   // any engagement
    assert.equal((await call("rita", "GET", "/api/engagements/LUMEN-1")).statusCode, 200);
    assert.equal((await call("adam", "DELETE", "/api/engagements/LUMEN-1/members/rita")).statusCode, 204);
    assert.equal((await call("rita", "GET", "/api/engagements/LUMEN-1")).statusCode, 404);
    assert.equal((await call("adam", "POST", "/api/engagements/NW-FY2026/members", { user: "adam" })).statusCode, 201);
    assert.equal((await call("adam", "GET", "/api/engagements/NW-FY2026/plan")).statusCode, 200);   // a member reads
    assert.equal((await call("adam", "POST", "/api/engagements/NW-FY2026/plan", { proposer: "rules" })).statusCode, 403);
    assert.equal((await call("adam", "POST", "/api/engagements/NW-FY2026/approve", { note: "n" })).statusCode, 403);
    assert.equal((await call("adam", "POST", "/api/engagements/NW-FY2026/rcm?filename=x.xlsx", Buffer.from("x"))).statusCode, 403);
    assert.equal((await call("adam", "POST", "/api/clients", { name: "Admin Co", fiscal_year_end: "2026-12-31", time_zone: "UTC" })).statusCode, 403);
    assert.equal((await call("pat", "DELETE", "/api/engagements/LUMEN-1/members/eve")).statusCode, 404);   // a preparer only on their own engagements
  });
});

describe("changing passwords", () => {
  const signIn = (username: string, password: string) => app.inject({ method: "POST", url: "/api/session", payload: { username, password, bearer: true } });
  const as = (token: string, method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: method as any, url, ...(payload === undefined ? {} : { payload: payload as any }), headers: { authorization: `Bearer ${token}`, ...headers } });

  it("a password set by an administrator is temporary: nothing but changing it is allowed until the owner does", async () => {
    await call("adam", "POST", "/api/users", { name: "tess", role: "preparer", password: "temporary horse staple" });
    const s = await signIn("tess", "temporary horse staple");
    assert.equal(s.json().user.must_change_password, true);
    const t = s.json().token;
    const blocked = await as(t, "GET", "/api/engagements");
    assert.equal(blocked.statusCode, 403);
    assert.deepEqual(blocked.json(), { error: "password_change_required", message: "change your password before continuing" });
    assert.equal((await as(t, "GET", "/api/me")).json().must_change_password, true);   // allowed: the UI needs to know
    assert.equal((await as(t, "POST", "/api/me/password", { current_password: "wrong", new_password: "a fresh river lantern" })).statusCode, 403);
    assert.equal((await as(t, "POST", "/api/me/password", { current_password: "temporary horse staple", new_password: "temporary horse staple" })).statusCode, 409);   // must differ
    assert.equal((await as(t, "POST", "/api/me/password", { current_password: "temporary horse staple", new_password: "tess-is-the-best-one" })).statusCode, 409);   // contains the name
    assert.equal((await as(t, "POST", "/api/me/password", { current_password: "temporary horse staple", new_password: "a fresh river lantern" })).statusCode, 204);
    assert.equal((await as(t, "GET", "/api/engagements")).statusCode, 200);             // same session, now unblocked
    assert.equal((await as(t, "GET", "/api/me")).json().must_change_password, false);
    // An administrator's reset makes it temporary again.
    assert.equal((await call("adam", "POST", "/api/users/tess/password", { password: "another temporary one" })).statusCode, 204);
    assert.equal((await as(t, "GET", "/api/me")).statusCode, 401);                       // the reset ended the session
    assert.equal((await signIn("tess", "another temporary one")).json().user.must_change_password, true);
    assert.ok((await db.query("SELECT 1 FROM events WHERE action = 'user.password' AND entity_id = 'tess' AND actor = 'tess' AND detail->>'temporary' = 'false'")).rows.length);
  });

  it("changing one's own password keeps this session and ends the others", async () => {
    await audit.addUser(db, "system", "owen", "reader");
    await setPassword(db, "owen", "owen", PW);
    const a = (await signIn("owen", PW)).json().token, b = (await signIn("owen", PW)).json().token;
    assert.equal((await as(a, "POST", "/api/me/password", { current_password: PW, new_password: "quiet copper meadow walk" })).statusCode, 204);
    assert.equal((await as(a, "GET", "/api/me")).statusCode, 200);
    assert.equal((await as(b, "GET", "/api/me")).statusCode, 401);
    assert.equal((await signIn("owen", PW)).statusCode, 401);
    assert.equal((await signIn("owen", "quiet copper meadow walk")).statusCode, 200);
  });

  it("wrong current passwords are rate-limited, and cookie sessions need the CSRF token to change it", async () => {
    await audit.addUser(db, "system", "gus", "reader");
    await setPassword(db, "gus", "gus", PW);
    const t = (await signIn("gus", PW)).json().token;
    for (let i = 0; i < 5; i++) await as(t, "POST", "/api/me/password", { current_password: "not it at all", new_password: "quiet copper meadow walk" });
    assert.equal((await as(t, "POST", "/api/me/password", { current_password: PW, new_password: "quiet copper meadow walk" })).statusCode, 429);
    await audit.addUser(db, "system", "cora", "reader");
    await setPassword(db, "cora", "cora", PW);
    const r = await app.inject({ method: "POST", url: "/api/session", payload: { username: "cora", password: PW } });
    const cookie = String(r.headers["set-cookie"]).split(";")[0];
    const body = { current_password: PW, new_password: "quiet copper meadow walk" };
    assert.equal((await app.inject({ method: "POST", url: "/api/me/password", payload: body, headers: { cookie } })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/api/me/password", payload: body, headers: { cookie, "x-csrf-token": r.json().csrf_token } })).statusCode, 204);
  });

  it("strength rules", async () => {
    const { checkPasswordStrength } = await import("../src/auth.js");
    for (const weak of ["Password1234!", "qwertyuiop12", "abcdefgh-2026", "aaaaaaaaaaaaaa", "1212121212121", "Welcome-2026!"]) assert.throws(() => checkPasswordStrength(weak, "zed"), weak);
    assert.throws(() => checkPasswordStrength("zed-likes-tea-a-lot", "zed"), /user name/);
    for (const ok of ["correct horse battery staple", "quiet copper meadow walk", "Tr4ve!-Lantern-Fjord"]) assert.doesNotThrow(() => checkPasswordStrength(ok, "zed"), ok);
  });
});
