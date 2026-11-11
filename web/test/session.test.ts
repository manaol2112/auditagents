/** Sign-in, sign-out and session-expiry behaviour of the API client. */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { api, ApiError, hasCsrfToken, session, setUnauthenticatedHandler } from "../src/api/client.ts";
import { sessionUser } from "../src/api/schema.ts";

type Call = { url: string; init: RequestInit };
const USER = { name: "rj", display_name: "R. J.", role: "approver", must_change_password: false };
const CSRF = "c".repeat(43);

function mock(responses: Array<{ status?: number; body?: unknown; fail?: boolean }>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 500 };
    if (r.fail) throw new TypeError("network down");
    const status = r.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(r.body ?? {}), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return calls;
}

describe("session", () => {
  let expired = 0;
  beforeEach(() => { expired = 0; setUnauthenticatedHandler(() => { expired++; }); });

  it("signs in with a same-origin JSON POST, keeps the CSRF token in memory only, and drops any bearer token", async () => {
    const calls = mock([{ body: { user: USER, csrf_token: CSRF, expires_in_seconds: 43200, token: "SECRET-BEARER" } }]);
    const user = await session.signIn("  rj ", "correct horse battery staple");
    assert.equal(Object.hasOwn(user, "token"), false);   // the bearer token never enters page state
    assert.deepEqual(user, USER);
    const c = calls[0]!;
    assert.equal(c.url, "/api/session");
    assert.equal(c.init.method, "POST");
    assert.equal(c.init.mode, "same-origin");
    assert.equal(c.init.credentials, "same-origin");
    assert.equal(c.init.redirect, "error");
    assert.deepEqual(JSON.parse(String(c.init.body)), { username: "rj", password: "correct horse battery staple" });
    assert.equal((c.init.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.ok(hasCsrfToken());
  });

  it("sends the CSRF token on sign-out, then forgets it", async () => {
    mock([{ body: { user: USER, csrf_token: CSRF, expires_in_seconds: 1 } }]);
    await session.signIn("rj", "pw-long-enough-1");
    const calls = mock([{ status: 204 }]);
    await session.signOut();
    assert.equal(calls[0]!.init.method, "DELETE");
    assert.equal((calls[0]!.init.headers as Record<string, string>)["X-CSRF-Token"], CSRF);
    assert.equal(hasCsrfToken(), false);
  });

  it("does not claim sign-out succeeded when the server could not be reached", async () => {
    mock([{ fail: true }]);
    await assert.rejects(session.signOut(), (e: unknown) => e instanceof ApiError && e.kind === "network");
  });

  it("treats an already-ended session as signed out", async () => {
    mock([{ status: 401 }]);
    await session.signOut();
    assert.equal(expired, 0);
  });

  it("wrong credentials and lockouts map to fixed messages without ending a session", async () => {
    mock([{ status: 401, body: { error: "unauthenticated", message: "server text" } }]);
    await assert.rejects(session.signIn("rj", "wrong-password-x"), (e: unknown) => e instanceof ApiError && e.kind === "unauthenticated" && !e.message.includes("server text"));
    mock([{ status: 429 }]);
    await assert.rejects(session.signIn("rj", "wrong-password-x"), (e: unknown) => e instanceof ApiError && e.kind === "rate_limited");
    assert.equal(expired, 0);
  });

  it("refuses empty or oversized credentials without a request", async () => {
    const calls = mock([]);
    await assert.rejects(session.signIn("   ", "x"), ApiError);
    await assert.rejects(session.signIn("rj", ""), ApiError);
    await assert.rejects(session.signIn("x".repeat(101), "password-123"), ApiError);
    assert.equal(calls.length, 0);
  });

  it("reports no current user on 401, and the user on 200", async () => {
    mock([{ status: 401 }]);
    assert.equal(await session.current(), null);
    mock([{ body: { ...USER, csrf_token: CSRF } }]);
    const me = await session.current();
    assert.deepEqual(me, USER);   // the CSRF token is not part of the user object
    assert.ok(hasCsrfToken());    // but it is restored for writes after a reload
    assert.equal(expired, 0);
  });

  it("any 401 on a data request ends the session for the whole app", async () => {
    mock([{ status: 401 }]);
    await assert.rejects(api.engagements(), (e: unknown) => e instanceof ApiError && e.kind === "unauthenticated");
    assert.equal(expired, 1);
    assert.equal(hasCsrfToken(), false);
  });

  it("a non-member engagement is indistinguishable from a missing one", async () => {
    mock([{ status: 404, body: { error: "not_found" } }]);
    await assert.rejects(api.workspace("OTHER-CLIENT"), (e: unknown) => e instanceof ApiError && e.kind === "not_found" && /not a member/.test(e.message));
  });

  it("rejects unknown roles from the server", () => {
    assert.equal(sessionUser.safeParse({ name: "x", display_name: "x", role: "superuser" }).success, false);
  });
});
