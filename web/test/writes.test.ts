/** Engagement creation and other writes from the API client: allowlist, CSRF, payloads, and error handling. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { api, ApiError, formError, session, setSessionHandlers } from "../src/api/client.ts";
import { sessionUser } from "../src/api/schema.ts";

type Call = { url: string; init: RequestInit };
const CSRF = "k".repeat(43);
const DETAIL = { name: "ACME-FY2026-ITGC", client: "Acme", period_start: "2025-07-01", period_end: "2026-06-30", as_of: "2026-06-30", systems: ["SAP"],
  modules_in_scope: ["AC-UAR"], modules_out_of_scope: [], methodology_version: "0.4.1", snapshot_id: null, stage: "setup", uploads: [], latest_plan: null };

function mock(responses: Array<{ status?: number; body?: unknown }>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 500 };
    const status = r.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(r.body ?? {}), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return calls;
}
const header = (c: Call, h: string) => (c.init.headers as Record<string, string>)[h];

async function signedIn() {
  mock([{ body: { name: "pat", display_name: "Pat", role: "preparer", must_change_password: false, csrf_token: CSRF } }]);
  await session.current();   // as after a page reload: the token comes back from /api/me
}

describe("writes", () => {
  it("creates a client and an engagement with the CSRF token restored after a reload", async () => {
    await signedIn();
    const calls = mock([{ status: 201, body: { name: "Acme" } }, { status: 201, body: DETAIL }]);
    await api.createClient({ name: "Acme", fiscal_year_end: "2026-06-30", time_zone: "Europe/London" });
    const d = await api.createEngagement({ client: "Acme", name: "ACME-FY2026-ITGC", period_start: "2025-07-01", period_end: "2026-06-30", as_of: "2026-06-30", systems: ["SAP"], modules: null });
    assert.equal(d.stage, "setup");
    assert.deepEqual(calls.map((c) => [c.init.method, c.url]), [["POST", "/api/clients"], ["POST", "/api/engagements"]]);
    for (const c of calls) { assert.equal(header(c, "X-CSRF-Token"), CSRF); assert.equal(c.init.mode, "same-origin"); assert.equal(c.init.redirect, "error"); }
    assert.equal(JSON.parse(String(calls[1]!.init.body)).modules, null);
  });

  it("encodes the engagement name in member paths", async () => {
    await signedIn();
    const calls = mock([{ status: 201, body: { name: "kim" } }]);
    await api.addMember("A/B?x", "  kim ");
    assert.equal(calls[0]!.url, "/api/engagements/A%2FB%3Fx/members");
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { user: "kim" });
  });

  it("shows the API's own validation and conflict messages, bounded, and never a 5xx body", async () => {
    mock([{ status: 409, body: { error: "refused", message: "engagement 'X' already exists" } }]);
    await assert.rejects(api.createEngagement({ client: "a", name: "X", period_start: "", period_end: "", as_of: "", systems: [], modules: null }),
      (e: unknown) => e instanceof ApiError && e.kind === "conflict" && formError(e) === "Engagement 'X' already exists.");
    mock([{ status: 400, body: { error: "invalid_request", message: "x".repeat(5000) } }]);
    await assert.rejects(api.createClient({ name: "a", fiscal_year_end: "b", time_zone: "c" }), (e: unknown) => e instanceof ApiError && e.kind === "invalid");   // oversized body ignored
    mock([{ status: 500, body: { error: "internal", message: "relation users does not exist" } }]);
    await assert.rejects(api.createClient({ name: "a", fiscal_year_end: "b", time_zone: "c" }), (e: unknown) => e instanceof ApiError && e.detail === null && !formError(e).includes("relation"));
    mock([{ status: 400, body: { error: "invalid_request", message: "name\u202E is required" } }]);
    await assert.rejects(api.createClient({ name: "a", fiscal_year_end: "b", time_zone: "c" }), (e: unknown) => e instanceof ApiError && e.detail === "name is required");   // neutralised
  });

  it("a readers' 403 is a fixed message; a required password change tells the shell", async () => {
    let changeRequired = 0;
    setSessionHandlers({ unauthenticated: null, passwordChangeRequired: () => { changeRequired++; } });
    mock([{ status: 403, body: { error: "forbidden", message: "this action needs the preparer role" } }]);
    await assert.rejects(api.createClient({ name: "a", fiscal_year_end: "b", time_zone: "c" }), (e: unknown) => e instanceof ApiError && e.kind === "forbidden");
    mock([{ status: 403, body: { error: "password_change_required", message: "change your password before continuing" } }]);
    await assert.rejects(api.engagements(), (e: unknown) => e instanceof ApiError && e.kind === "password_change_required");
    assert.equal(changeRequired, 1);
  });

  it("changes the user's own password with the CSRF token", async () => {
    await signedIn();
    const calls = mock([{ status: 204 }]);
    await session.changePassword("old passphrase here", "violet ocean lantern bicycle");
    assert.equal(calls[0]!.url, "/api/me/password");
    assert.equal(header(calls[0]!, "X-CSRF-Token"), CSRF);
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { current_password: "old passphrase here", new_password: "violet ocean lantern bicycle" });
  });

  it("accepts every role the server has, including administrators", () => {
    for (const role of ["reader", "preparer", "approver", "admin"]) assert.ok(sessionUser.safeParse({ name: "x", display_name: "x", role }).success, role);
  });
});
