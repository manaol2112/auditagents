/** Tests for the UI's security controls. Run with `npm test` (node --test, native TypeScript). */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { api, ApiError, engagementPath } from "../src/api/client.ts";
import { neutralize, workspaceModel } from "../src/api/schema.ts";
import { jsonText } from "../src/lib/format.ts";
import { parseHash, toHash } from "../src/lib/router.ts";

const minimalModel = () => ({
  engagement: { name: "E", client_name: "C", methodology_version: "0.4.1" },
  nodes: [{ id: "intake", type: "intake", label: "Document intake", actor: "engine", status: "complete", summary: "s", details: {} }],
  edges: [], action_queue: [], activities: [],
});

describe("router", () => {
  it("accepts only allowlisted pages, views and safe node ids", () => {
    assert.deepEqual(parseHash("#/e/NW-FY2026-ITGC/findings"), { page: "engagement", engagement: "NW-FY2026-ITGC", view: "findings", node: null });
    assert.equal(parseHash("#/").page, "engagements");
    assert.equal(parseHash("#/new").page, "new");
    assert.equal(parseHash("#/account").page, "account");
    assert.equal(parseHash("#/anything-else").page, "engagements");   // unknown pages fall back to home
    assert.equal(parseHash("#/e/E/<script>").view, "overview");
    assert.equal(parseHash("#/e/E/activity/human").node, "human");
    assert.equal(parseHash("#/e/E/activity/<img onerror=x>").node, null);
    assert.equal(parseHash("#/e/%E0%A4%A/overview").page, "engagements");   // malformed escape is refused, not thrown
    assert.equal(parseHash("#/e/" + "x".repeat(500)).page, "engagements");  // oversized names are refused
  });

  it("round-trips names that contain URL syntax without changing path structure", () => {
    const r = { page: "engagement" as const, engagement: "A/B?c=d#e", view: "plan" as const, node: null };
    assert.equal(toHash(r), "#/e/A%2FB%3Fc%3Dd%23e/plan");
    assert.deepEqual(parseHash(toHash(r)), r);
    assert.deepEqual(parseHash(toHash({ page: "engagement", engagement: "new", view: "overview" })).engagement, "new");   // an engagement named "new" is not the new page
  });
});

describe("response schema", () => {
  it("strips control and bidi-override characters from every string", () => {
    assert.equal(neutralize("invoice‮txt.exe"), "invoicetxt.exe");
    assert.equal(neutralize("a\u0000b\u001b[31mc"), "ab[31mc");
    assert.equal(neutralize("line1\nline2\ttab"), "line1\nline2\ttab");
    const m = minimalModel();
    m.engagement.client_name = "Acme⁦ Corp⁩";
    assert.equal(workspaceModel.parse(m).engagement.client_name, "Acme Corp");
  });

  it("drops fields the UI does not use", () => {
    const m: any = minimalModel();
    m.engagement.secret_internal_field = "should not reach the browser state";
    m.nodes[0].details.raw_prompt = "model prompt";
    const out: any = workspaceModel.parse(m);
    assert.equal(out.engagement.secret_internal_field, undefined);
    assert.equal(out.nodes[0].details.raw_prompt, undefined);
  });

  it("fails closed on unexpected shapes and unsafe node ids", () => {
    const bad: any = minimalModel();
    bad.nodes[0].id = "intake\" onclick=\"x";
    assert.equal(workspaceModel.safeParse(bad).success, false);
    const wrongType: any = minimalModel();
    wrongType.engagement.name = { toString: "x" };
    assert.equal(workspaceModel.safeParse(wrongType).success, false);
  });

  it("free-form JSON is rendered as bounded, neutralised text", () => {
    assert.equal(jsonText({ a: "‮x" }), '{\n "a": "x"\n}');
    assert.ok(jsonText("y".repeat(10_000), 100).length <= 102);
  });
});

describe("api client", () => {
  type Call = { url: string; init: RequestInit };
  function mockFetch(body: string, init: { status?: number; type?: string } = {}): Call[] {
    const calls: Call[] = [];
    globalThis.fetch = (async (url: string, req: RequestInit) => {
      calls.push({ url, init: req });
      return new Response(body, { status: init.status ?? 200, headers: { "content-type": init.type ?? "application/json; charset=utf-8" } });
    }) as typeof fetch;
    return calls;
  }

  it("requests same-origin GETs only, without redirects, cache or referrer", async () => {
    const calls = mockFetch(JSON.stringify(minimalModel()));
    await api.workspace("E");
    const init = calls[0]!.init;
    assert.equal(init.method, "GET");
    assert.equal(init.mode, "same-origin");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.equal(init.referrerPolicy, "no-referrer");
  });

  it("encodes engagement names so they cannot change the request path", () => {
    assert.equal(engagementPath("../../healthz?x=1"), "/api/workspace/..%2F..%2Fhealthz%3Fx%3D1");
    assert.throws(() => engagementPath(""), ApiError);
    assert.throws(() => engagementPath("x".repeat(201)), ApiError);
  });

  it("refuses non-JSON responses and never echoes the body", async () => {
    mockFetch("<script>alert(1)</script>", { type: "text/html" });
    await assert.rejects(api.engagements(), (e: unknown) => e instanceof ApiError && e.kind === "format" && !e.message.includes("script"));
  });

  it("refuses responses that do not match the schema", async () => {
    mockFetch(JSON.stringify([{ name: 1, client: "x" }]));
    await assert.rejects(api.engagements(), (e: unknown) => e instanceof ApiError && e.kind === "format");
  });

  it("maps server errors to fixed messages", async () => {
    mockFetch(JSON.stringify({ error: "relation \"users\" does not exist at character 15" }), { status: 500 });
    await assert.rejects(api.engagements(), (e: unknown) => e instanceof ApiError && e.kind === "server" && !e.message.includes("relation"));
    mockFetch(JSON.stringify({ error: "unknown engagement" }), { status: 404 });
    await assert.rejects(api.workspace("X"), (e: unknown) => e instanceof ApiError && e.kind === "not_found");
  });
});

describe("security-check scanner", () => {
  const run = (src: string) => spawnSync(process.execPath, [join(import.meta.dirname, "..", "scripts", "security-check.mjs")], { env: { ...process.env, SECURITY_CHECK_SRC: src }, encoding: "utf8" });

  it("passes on the real source tree", () => {
    const r = spawnSync(process.execPath, [join(import.meta.dirname, "..", "scripts", "security-check.mjs")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });

  it("flags the banned patterns", () => {
    const dir = mkdtempSync(join(tmpdir(), "seccheck-"));
    writeFileSync(join(dir, "bad.tsx"), [
      "export const A = () => <div dangerouslySetInnerHTML={{ __html: x }} />;",
      "el.innerHTML = s;",
      "localStorage.setItem('k', v);",
      "fetch('/api/x');",
      "const u = \"https://cdn.example.com/x.js\";",
      "eval(code);",
      "console.log(record);",
      "// a comment mentioning innerHTML is fine",
      "console.warn(x); // security-reviewed: test exemption",
    ].join("\n"));
    const r = run(dir);
    assert.equal(r.status, 1);
    for (const id of ["no-dangerous-html", "no-html-sinks", "no-browser-storage", "fetch-only-in-client", "no-external-origins", "no-eval", "no-console"]) assert.ok(r.stderr.includes(`[${id}]`), id);
    assert.ok(!r.stderr.includes("bad.tsx:8"), "comments are not flagged");
    assert.ok(!r.stderr.includes("bad.tsx:9"), "reviewed exemptions are honoured");
  });
});
