/** Security baseline for every response of the workspace server.
 *
 * The workspace serves confidential client audit records and has no login yet, so the controls here assume a
 * hostile web: any page the user has open in another tab may try to read this server.
 *
 *  - Host allowlist: refuses requests whose Host header is not this server (blocks DNS rebinding, where a hostile
 *    domain is re-pointed at 127.0.0.1 so its scripts become "same-origin" with the API).
 *  - Fetch Metadata: the API answers only same-origin requests (or non-browser clients); cross-site reads, embeds and
 *    CSRF-style requests are refused before any query runs.
 *  - Strict CSP with Trusted Types: scripts and styles only from this origin, no inline code, no eval, no framing,
 *    no outbound connections; DOM XSS sinks (innerHTML and friends) are disabled in the browser.
 *  - Isolation and leak headers: nosniff, no referrer, COOP/CORP/COEP same-origin, deny framing, no powerful features.
 *  - No caching of audit data: every API response is `no-store`.
 *  - Errors never return internals: 5xx bodies are a fixed string; details go only to the server log.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "permissions-policy": "accelerometer=(), camera=(), clipboard-read=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=(), browsing-topics=()",
  "x-dns-prefetch-control": "off",
  "x-permitted-cross-domain-policies": "none",
  "origin-agent-cluster": "?1",
};

const LOOPBACK = ["localhost", "127.0.0.1", "::1"];

/** Hosts this server answers to: loopback, plus any listed in ALLOWED_HOSTS (comma separated, no ports). */
export function allowedHosts(extra: string | undefined = process.env.ALLOWED_HOSTS): Set<string> {
  return new Set([...LOOPBACK, ...(extra ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)]);
}

/** Host header without the port; handles bracketed IPv6. Returns null for anything malformed. */
export function hostOf(header: string | undefined): string | null {
  if (!header || header.length > 255) return null;
  const h = header.trim().toLowerCase();
  const m = h.startsWith("[") ? /^\[([0-9a-f:.]+)\](?::\d{1,5})?$/.exec(h) : /^([a-z0-9.-]+)(?::\d{1,5})?$/.exec(h);
  return m ? m[1] : null;
}

/** Fetch Metadata resource isolation. API: same-origin or no metadata (curl, tests) only. Pages: also top-level navigations. */
export function fetchMetadataAllows(req: FastifyRequest): boolean {
  const site = req.headers["sec-fetch-site"];
  if (site === undefined || site === "same-origin" || site === "none") return true;
  if (req.url.startsWith("/api/")) return false;
  const mode = req.headers["sec-fetch-mode"], dest = req.headers["sec-fetch-dest"];
  return mode === "navigate" && req.method === "GET" && dest !== "object" && dest !== "embed" && dest !== "iframe" && dest !== "frame";
}

function cacheControl(url: string): string {
  if (url.startsWith("/api/") || url.startsWith("/healthz")) return "no-store";
  if (url.startsWith("/assets/")) return "public, max-age=31536000, immutable";   // content-hashed by the UI build, no data
  return "no-cache";
}

export function registerSecurity(app: FastifyInstance, hosts: Set<string> = allowedHosts()): void {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const host = hostOf(req.headers.host);
    if (!host || !hosts.has(host)) return reply.code(421).send({ error: "misdirected request" });
    if (!fetchMetadataAllows(req)) return reply.code(403).send({ error: "cross-site request refused" });
  });
  app.addHook("onSend", async (req, reply, payload) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) reply.header(k, v);
    reply.header("cache-control", cacheControl(req.url));
    if (req.url.startsWith("/api/")) reply.header("pragma", "no-cache");
    reply.removeHeader("x-powered-by");
    return payload;
  });
  app.setErrorHandler((err: { statusCode?: number; message?: string }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) console.error(`[workspace] ${req.method} ${req.url.split("?")[0]} failed:`, err);
    return reply.code(status).send({ error: status === 500 ? "internal error" : "bad request" });
  });
}
