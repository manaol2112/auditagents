/** The browser sign-in path the web UI uses: HttpOnly cookie session, CSRF on writes, and sign-out that always works. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { addMember, setPassword } from "../src/auth.js";
import { buildServer } from "../src/server.js";
import { shutdown } from "./helpers.js";
import { build, endPools } from "./review-fixtures.js";

after(async () => { await endPools(); await shutdown(); });

describe("browser session", () => {
  let app: ReturnType<typeof buildServer>;
  let db: pg.PoolClient;
  const PW = "correct horse battery staple";

  before(async () => {
    db = await build();
    await setPassword(db, "rj", "rj", PW);
    await addMember(db, "system", (await db.query("SELECT id FROM engagements WHERE name = 'NW-REV'")).rows[0].id, "rj");
    app = buildServer((db as any).__pool);
    await app.ready();
  });
  after(async () => { await app.close(); db.release(); });

  async function signIn(): Promise<{ cookie: string; csrf: string; setCookie: string; body: any }> {
    const r = await app.inject({ method: "POST", url: "/api/session", payload: { username: "rj", password: PW } });
    assert.equal(r.statusCode, 200);
    const setCookie = String(r.headers["set-cookie"]);
    return { cookie: setCookie.split(";")[0]!, csrf: r.json().csrf_token, setCookie, body: r.json() };
  }

  it("issues an HttpOnly, SameSite=Strict cookie scoped to the API, and no token in the body", async () => {
    const s = await signIn();
    assert.match(s.setCookie, /HttpOnly/);
    assert.match(s.setCookie, /SameSite=Strict/);
    assert.match(s.setCookie, /Path=\/api/);
    assert.equal(s.body.token, undefined);
    assert.ok(s.csrf);
    assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: s.cookie } })).json().name, "rj");
  });

  it("refuses cookie writes without the CSRF token", async () => {
    const s = await signIn();
    const payload = { name: "Acme", fiscal_year_end: "2026-12-31", time_zone: "UTC" };
    assert.equal((await app.inject({ method: "POST", url: "/api/clients", headers: { cookie: s.cookie }, payload })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/api/clients", headers: { cookie: s.cookie, "x-csrf-token": "wrong" }, payload })).statusCode, 401);
  });

  it("signs out without the CSRF token (it lives only in page memory and is lost on reload) and destroys the session", async () => {
    const s = await signIn();
    const out = await app.inject({ method: "DELETE", url: "/api/session", headers: { cookie: s.cookie } });
    assert.equal(out.statusCode, 204);
    assert.match(String(out.headers["set-cookie"]), /Max-Age=0/);
    assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: s.cookie } })).statusCode, 401);   // gone on the server, not just the cookie
  });

  it("cannot be signed out, or signed in, by another site", async () => {
    const s = await signIn();
    const cross = { "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" };
    assert.equal((await app.inject({ method: "DELETE", url: "/api/session", headers: { cookie: s.cookie, ...cross } })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/api/session", headers: cross, payload: { username: "rj", password: PW } })).statusCode, 403);   // login CSRF
    assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: s.cookie } })).statusCode, 200);
  });

  it("shows a non-member the same 404 as a missing engagement", async () => {
    await setPassword(db, "rj", "rj", PW);   // resets rj's sessions
    await db.query("INSERT INTO users (name, role) VALUES ('outsider', 'reader') ON CONFLICT DO NOTHING");
    await setPassword(db, "outsider", "outsider", PW);
    const r = await app.inject({ method: "POST", url: "/api/session", payload: { username: "outsider", password: PW } });
    const cookie = String(r.headers["set-cookie"]).split(";")[0]!;
    const hidden = await app.inject({ method: "GET", url: "/api/workspace/NW-REV", headers: { cookie } });
    const missing = await app.inject({ method: "GET", url: "/api/workspace/NO-SUCH", headers: { cookie } });
    assert.equal(hidden.statusCode, 404);
    assert.equal(hidden.body, missing.body);
    assert.deepEqual((await app.inject({ method: "GET", url: "/api/engagements", headers: { cookie } })).json(), []);
  });

  it("gives a reloaded page its CSRF token back, so it can write again; bearer clients get none", async () => {
    const s = await signIn();
    const me = (await app.inject({ method: "GET", url: "/api/me", headers: { cookie: s.cookie } })).json();
    assert.equal(me.csrf_token, s.csrf);
    const bearer = (await app.inject({ method: "POST", url: "/api/session", payload: { username: "rj", password: PW, bearer: true } })).json().token;
    assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${bearer}` } })).json().csrf_token, undefined);
    const other = await signIn();
    assert.notEqual(other.csrf, s.csrf);   // per session
    const create = await app.inject({ method: "POST", url: "/api/clients", headers: { cookie: s.cookie, "x-csrf-token": me.csrf_token }, payload: { name: "Reload Co", fiscal_year_end: "2026-12-31", time_zone: "UTC" } });
    assert.equal(create.statusCode, 201);
    assert.equal((await app.inject({ method: "POST", url: "/api/clients", headers: { cookie: s.cookie, "x-csrf-token": other.csrf }, payload: { name: "Wrong Token Co", fiscal_year_end: "2026-12-31", time_zone: "UTC" } })).statusCode, 401);   // another session's token is refused
  });

  it("lets a browser user create a client and an engagement that only its members can see", async () => {
    const s = await signIn();
    const h = { cookie: s.cookie, "x-csrf-token": s.csrf };
    assert.equal((await app.inject({ method: "POST", url: "/api/clients", headers: h, payload: { name: "Acme Ltd", fiscal_year_end: "2026-06-30", time_zone: "Europe/London" } })).statusCode, 201);
    const eng = await app.inject({ method: "POST", url: "/api/engagements", headers: h, payload: { client: "Acme Ltd", name: "ACME-FY2026-ITGC", period_start: "2025-07-01", period_end: "2026-06-30", as_of: "2026-06-30", systems: ["SAP S/4HANA", "Okta"], modules: ["AC-UAR", "CM-CHG"] } });
    assert.equal(eng.statusCode, 201);
    assert.equal(eng.json().stage, "setup");
    assert.deepEqual(eng.json().modules_in_scope, ["AC-UAR", "CM-CHG"]);
    assert.ok((await app.inject({ method: "GET", url: "/api/engagements", headers: { cookie: s.cookie } })).json().some((e: any) => e.name === "ACME-FY2026-ITGC"));
    assert.equal((await app.inject({ method: "GET", url: "/api/workspace/ACME-FY2026-ITGC", headers: { cookie: s.cookie } })).statusCode, 200);   // a new engagement has a workspace
    assert.equal((await app.inject({ method: "POST", url: "/api/engagements", headers: h, payload: { client: "Acme Ltd", name: "ACME-FY2026-ITGC", period_start: "2025-07-01", period_end: "2026-06-30", as_of: "2026-06-30", systems: ["X"] } })).statusCode, 409);
    const out = await app.inject({ method: "POST", url: "/api/session", payload: { username: "outsider", password: PW } });
    const oc = String(out.headers["set-cookie"]).split(";")[0]!;
    assert.equal((await app.inject({ method: "GET", url: "/api/engagements/ACME-FY2026-ITGC", headers: { cookie: oc } })).statusCode, 404);
    assert.equal((await app.inject({ method: "POST", url: "/api/engagements", headers: { cookie: oc, "x-csrf-token": out.json().csrf_token }, payload: { client: "Acme Ltd", name: "READER-TRY", period_start: "2025-07-01", period_end: "2026-06-30", as_of: "2026-06-30", systems: ["X"] } })).statusCode, 403);   // readers cannot create
  });

  it("lists the methodology's modules for scoping", async () => {
    const s = await signIn();
    const m = (await app.inject({ method: "GET", url: "/api/methodology", headers: { cookie: s.cookie } })).json();
    assert.equal(m.modules.length, 13);
    assert.ok(m.modules.every((x: any) => /^[A-Z]+-[A-Z0-9]+$/.test(x.code) && x.title));
    assert.equal((await app.inject({ method: "GET", url: "/api/methodology" })).statusCode, 401);
  });

  it("lets a user with a temporary password fetch the CSRF token and change it, and nothing else", async () => {
    await db.query("INSERT INTO users (name, role) VALUES ('newhire', 'preparer') ON CONFLICT DO NOTHING");
    await setPassword(db, "rj", "newhire", "temporary passphrase marble 7");   // set by someone else: temporary
    const r = await app.inject({ method: "POST", url: "/api/session", payload: { username: "newhire", password: "temporary passphrase marble 7" } });
    const cookie = String(r.headers["set-cookie"]).split(";")[0]!;
    const me = (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json();
    assert.equal(me.must_change_password, true);
    assert.ok(me.csrf_token);
    const h = { cookie, "x-csrf-token": me.csrf_token };
    assert.equal((await app.inject({ method: "GET", url: "/api/engagements", headers: h })).statusCode, 403);
    const ch = await app.inject({ method: "POST", url: "/api/me/password", headers: h, payload: { current_password: "temporary passphrase marble 7", new_password: "violet ocean lantern bicycle" } });
    assert.equal(ch.statusCode, 204);
    assert.equal((await app.inject({ method: "GET", url: "/api/engagements", headers: h })).statusCode, 200);   // same session continues
  });
});
