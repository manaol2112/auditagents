/** Back-end API (architecture/api-contract.md). Every request except sign-in needs a bearer token; every write runs in one
 * transaction as the signed-in user, so the engine's role rules and audit trail apply exactly as from the CLI. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import pg from "pg";
import * as approvals from "./approvals.js";
import { SessionUser, addMember, csrfFor, authenticate, canSeeClient, changeOwnPassword, changeRole, createPerson, disableUser, hasRole, isAdmin, isMember, listUsers, login, logout, memberEngagement, removeMember, setPassword } from "./auth.js";
import { EngineError, j, now, one, all, sha256, tx } from "./db.js";
import * as identity from "./identity.js";
import { createJob, failInterruptedJobs, getJob, runJob } from "./jobs.js";
import * as meth from "./methodology.js";
import * as planning from "./planning.js";
import * as proposerModel from "./proposerModel.js";
import { Transport } from "./proposerModel.js";
import { acceptIntakeFinding, extractUpload, intakeFindings, records } from "./rcm/extract.js";
import { FIELDS, PICKLISTS } from "./rcm/fields.js";
import { assistMapping } from "./rcm/mappingAgent.js";
import { MAX_BYTES } from "./rcm/parse.js";
import { confirmMapping, getMapping, getUpload, loadSheets, replaceProposal, storeUpload } from "./rcm/upload.js";
import * as workflow from "./workflow.js";
import { recordEvent, requireRole } from "./audit.js";

export interface ApiOptions {
  /** Model transports; tests substitute stubs. Defaults to the Claude API. */
  transports?: { proposer?: Transport; mapping?: Transport; review?: workflow.Transports };
}

declare module "fastify" { interface FastifyRequest { user?: SessionUser; sessionHash?: string } }

/** Methods each API path accepts; anything else is 405 before authentication. */
export const ROUTES: [RegExp, string[]][] = [
  [/^\/api\/session$/, ["POST", "DELETE"]],
  [/^\/api\/me$/, ["GET"]],
  [/^\/api\/methodology$/, ["GET"]],
  [/^\/api\/me\/password$/, ["POST"]],
  [/^\/api\/clients$/, ["GET", "POST"]],
  [/^\/api\/engagements$/, ["GET", "POST"]],
  [/^\/api\/engagements\/[^/]+$/, ["GET"]],
  [/^\/api\/engagements\/[^/]+\/(rcm|plan|review|approve|reject|members)$/, ["GET", "POST"]],
  [/^\/api\/workspace\/[^/]+$/, ["GET"]],
  [/^\/api\/rcm\/fields$/, ["GET"]],
  [/^\/api\/rcm\/\d+$/, ["GET"]],
  [/^\/api\/rcm\/\d+\/mapping$/, ["GET", "PUT"]],
  [/^\/api\/rcm\/\d+\/mapping\/assist$/, ["POST"]],
  [/^\/api\/rcm\/\d+\/(extract)$/, ["POST"]],
  [/^\/api\/rcm\/\d+\/(findings|records)$/, ["GET"]],
  [/^\/api\/intake-findings\/\d+\/accept$/, ["POST"]],
  [/^\/api\/(contradictions|identity-issues)\/\d+\/resolve$/, ["POST"]],
  [/^\/api\/review-findings\/\d+\/disposition$/, ["POST"]],
  [/^\/api\/jobs\/\d+$/, ["GET"]],
  [/^\/api\/engagements\/[^/]+\/members\/[^/]+$/, ["DELETE"]],
  [/^\/api\/users$/, ["GET", "POST"]],
  [/^\/api\/users\/[^/]+$/, ["PUT"]],
  [/^\/api\/users\/[^/]+\/(password|disable)$/, ["POST"]],
  [/^\/api\/admin\/engagements$/, ["GET"]],
];

class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const bad = (m: string) => new HttpError(400, "invalid_request", m);

const NOT_FOUND = { error: "not_found", message: "not found" };   // never echoes input or reveals whether something exists

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof HttpError) return reply.code(e.status).send(e.status === 404 ? NOT_FOUND : { error: e.code, message: e.message });
  if (e instanceof EngineError) {
    if (/^unknown (engagement|upload|contradiction|identity issue|review finding|intake finding|job|client|user)/.test(e.message)) return reply.code(404).send(NOT_FOUND);
    return reply.code(409).send({ error: "refused", message: e.message });
  }
  throw e;
}

export const SESSION_COOKIE = "soxplan_session";

function cookieToken(req: FastifyRequest): string | undefined {
  const raw = req.headers.cookie;
  if (typeof raw !== "string") return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return v.join("=");
  }
  return undefined;
}

function secureCookie(req: FastifyRequest): boolean {
  if (process.env.COOKIE_SECURE === "0") return false;
  if (process.env.COOKIE_SECURE === "1") return true;
  return req.protocol === "https" || String(req.headers["x-forwarded-proto"] ?? "") === "https";
}

function sessionCookie(req: FastifyRequest, token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` + (secureCookie(req) ? "; Secure" : "");
}

/** The engagement a request concerns, resolved from the path; null when the path is not engagement-scoped. */
async function scopeOf(pool: pg.Pool, path: string): Promise<{ engagementIds: number[] } | "none" | null> {
  let m: RegExpExecArray | null;
  const q = async (sql: string, v: unknown) => (await all(pool, sql, [v])).map((r) => r.id as number);
  if ((m = /^\/api\/(?:engagements|workspace)\/([^/]+)/.exec(path))) return { engagementIds: await q("SELECT id FROM engagements WHERE name = $1", decodeURIComponent(m[1])) };
  if ((m = /^\/api\/rcm\/(\d+)/.exec(path))) return { engagementIds: await q("SELECT engagement_id AS id FROM rcm_uploads WHERE id = $1", Number(m[1])) };
  if ((m = /^\/api\/intake-findings\/(\d+)/.exec(path))) return { engagementIds: await q("SELECT u.engagement_id AS id FROM intake_findings f JOIN rcm_uploads u ON u.id = f.upload_id WHERE f.id = $1", Number(m[1])) };
  if ((m = /^\/api\/contradictions\/(\d+)/.exec(path))) return { engagementIds: await q("SELECT engagement_id AS id FROM contradictions WHERE id = $1", Number(m[1])) };
  if ((m = /^\/api\/review-findings\/(\d+)/.exec(path))) return { engagementIds: await q("SELECT r.engagement_id AS id FROM review_notes n JOIN reviews r ON r.id = n.review_id WHERE n.id = $1", Number(m[1])) };
  if ((m = /^\/api\/jobs\/(\d+)/.exec(path))) return { engagementIds: await q("SELECT engagement_id AS id FROM jobs WHERE id = $1 AND engagement_id IS NOT NULL", Number(m[1])) };
  if ((m = /^\/api\/identity-issues\/(\d+)/.exec(path)))   // identity issues belong to a client snapshot: any engagement of that client
    return { engagementIds: await q("SELECT e.id FROM identity_links l JOIN snapshots s ON s.id = l.snapshot_id JOIN engagements e ON e.client_id = s.client_id WHERE l.id = $1", Number(m[1])) };
  return "none";
}

const str = (v: unknown, name: string, max = 2000) => {
  if (typeof v !== "string" || !v.trim()) throw bad(`${name} is required`);
  if (v.length > max) throw bad(`${name} is too long`);
  return v.trim();
};
const date = (v: unknown, name: string) => { const s = str(v, name, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw bad(`${name} must be YYYY-MM-DD`); return s; };
const id = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw bad("invalid id"); return n; };
const need = (req: FastifyRequest, role: "reader" | "preparer" | "approver") => {
  if (!req.user || !hasRole(req.user, role)) throw new HttpError(403, "forbidden", `this action needs the ${role} role`);
  return req.user.name;
};

export async function engagementDetail(db: pg.PoolClient | pg.Pool, name: string): Promise<any> {
  const e = await one(db, "SELECT e.*, c.name AS client FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.name = $1", [name]);
  if (!e) throw new EngineError(`unknown engagement '${name}'`);
  const data = meth.scoped(meth.load(), e.modules);
  const uploads = await all(db, "SELECT id, filename, sha256, uploaded_by, uploaded_at, status FROM rcm_uploads WHERE engagement_id = $1 ORDER BY id", [e.id]);
  const pv = await one(db, "SELECT version, status, content FROM plan_versions WHERE engagement_id = $1 ORDER BY version DESC LIMIT 1", [e.id]);
  const reviewed = await one(db, "SELECT 1 FROM reviews WHERE engagement_id = $1 LIMIT 1", [e.id]);
  const stage = pv?.status === "approved" ? "approved" : reviewed ? "in_review" : pv ? "planned" : e.snapshot_id ? "extracted"
    : uploads.some((u) => u.status === "mapped") ? "mapping_confirmed" : uploads.length ? "rcm_uploaded" : "setup";
  return { name: e.name, client: e.client, period_start: e.period_start, period_end: e.period_end, as_of: e.as_of, systems: e.systems,
    modules_in_scope: data.modules.map((m) => m.code), modules_out_of_scope: data.all_modules.filter((m) => !(m.code in data.modulesByCode)).map((m) => m.code),
    methodology_version: e.methodology_version, snapshot_id: e.snapshot_id, stage, uploads,
    latest_plan: pv ? { version: pv.version, status: pv.status, blocking: pv.content.validation.filter((f: any) => f.severity === "blocking").length, warnings: pv.content.validation.filter((f: any) => f.severity === "warning").length } : null };
}

export function registerApi(app: FastifyInstance, pool: pg.Pool, opts: ApiOptions = {}): void {
  const T = opts.transports ?? {};
  void failInterruptedJobs(pool).catch(() => {});

  // Method check first (no data involved), then authentication for everything under /api except signing in.
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0];
    if (!path.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") return reply.code(405).send({ error: "method_not_allowed", message: "read-only" });
      return;
    }
    const route = ROUTES.find(([re]) => re.test(path));
    if (route && !route[1].includes(req.method) && !(req.method === "HEAD" && route[1].includes("GET"))) return reply.code(405).send({ error: "method_not_allowed", message: `${req.method} is not allowed here` });
    // Deny by default: an /api path that matches no known route never reaches a handler (a handler's own path pattern
    // may be looser than the route table, and nothing may run before authentication).
    if (!route) return reply.code(404).send(NOT_FOUND);
    // Signing in needs no session. Signing out needs no CSRF token: the handler only ever destroys the caller's own session,
    // the cookie is SameSite=Strict, and security.ts refuses cross-site API requests, so a forged sign-out gains nothing.
    // Requiring the token would leave a browser unable to sign out after a reload (the token lives only in page memory).
    if (path === "/api/session" && (req.method === "POST" || req.method === "DELETE")) return;
    // Bearer tokens (scripts, the CLI) are never sent by a browser on its own, so they need no CSRF token. The browser's
    // HttpOnly session cookie is sent automatically, so every write made with it must also carry the session's CSRF token.
    const h = req.headers.authorization;
    const bearer = typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7).trim() : undefined;
    const cookie = bearer ? undefined : cookieToken(req);
    const writing = !["GET", "HEAD"].includes(req.method);
    const user = await authenticate(pool, bearer ?? cookie, cookie ? { required: writing, value: req.headers["x-csrf-token"] as string | undefined } : undefined);
    if (!user) return reply.code(401).send({ error: "unauthenticated", message: cookie && writing ? "sign in again (the session or its CSRF token is not valid)" : "sign in first" });
    req.user = user;
    req.sessionHash = sha256((bearer ?? cookie)!);
    // A temporary password (set by an administrator or a seed) must be changed before anything else.
    if (user.must_change_password && !(path === "/api/me" && req.method === "GET") && !(path === "/api/me/password" && req.method === "POST"))
      return reply.code(403).send({ error: "password_change_required", message: "change your password before continuing" });
    // Deny by default: anything tied to an engagement is visible only to its members; others get the same 404 as a missing record.
    const scope = await scopeOf(pool, path);
    // An administrator manages membership of any engagement without seeing its content.
    const adminMembership = isAdmin(user) && /^\/api\/engagements\/[^/]+\/members(\/[^/]+)?$/.test(path);
    if (scope !== "none" && scope && !adminMembership && !(path === "/api/engagements" && req.method === "POST")) {
      let ok = false;
      for (const e of scope.engagementIds) if (await isMember(pool, user.name, e)) { ok = true; break; }
      if (!ok) return reply.code(404).send(NOT_FOUND);
    }
  });

  const write = async <T>(fn: (db: pg.PoolClient) => Promise<T>) => tx(pool, fn);
  const json = { bodyLimit: 512 * 1024 };

  app.addContentTypeParser(["application/octet-stream", "text/csv"], { parseAs: "buffer", bodyLimit: MAX_BYTES }, (_req, body, done) => done(null, body));

  // ---------------------------------------------------------------- session
  app.post("/api/session", json, async (req, reply) => {
    try {
      const b = (req.body ?? {}) as any;
      const r = await write((db) => login(db, b.username, b.password));
      reply.header("set-cookie", sessionCookie(req, r.token, r.expires_in_seconds));
      // The token itself goes in the body only for script clients that ask for it; a browser keeps only the HttpOnly cookie.
      return reply.code(200).send({ user: r.user, csrf_token: r.csrf_token, expires_in_seconds: r.expires_in_seconds, ...(b.bearer === true ? { token: r.token } : {}) });
    } catch (e) {
      if (e instanceof EngineError) return reply.code(e.message.startsWith("too many") ? 429 : 401).send({ error: "unauthenticated", message: e.message });
      return send(reply, e);
    }
  });
  app.delete("/api/session", async (req, reply) => {
    const h = String(req.headers.authorization ?? "");
    const t = h.startsWith("Bearer ") ? h.slice(7).trim() : cookieToken(req);
    if (t) await logout(pool, t);
    reply.header("set-cookie", sessionCookie(req, "", 0));
    return reply.code(204).send();
  });
  // A browser session also gets its CSRF token back, so a reloaded page can write again. A cross-site page cannot read this
  // response (same-origin policy, no CORS, and security.ts refuses cross-site API requests), and bearer clients need none.
  app.get("/api/me", async (req) => {
    const cookie = req.headers.authorization ? undefined : cookieToken(req);
    return cookie ? { ...req.user, csrf_token: csrfFor(cookie) } : req.user;
  });
  app.get("/api/methodology", async () => {
    const data = meth.load();
    return { version: data.version, modules: data.all_modules.map((m) => ({ code: m.code, title: m.title })) };
  });

  // ---------------------------------------------------------------- clients and engagements
  app.get("/api/clients", async (req) => all(pool, `SELECT c.name, c.fiscal_year_end, c.time_zone FROM clients c WHERE c.created_by = $1 OR EXISTS (
      SELECT 1 FROM engagements e JOIN engagement_members m ON m.engagement_id = e.id WHERE e.client_id = c.id AND m.user_name = $1) ORDER BY c.name`, [req.user!.name]));
  app.post("/api/clients", json, async (req, reply) => {
    try {
      const actor = need(req, "preparer");
      const b = (req.body ?? {}) as any;
      const name = str(b.name, "name", 200), fye = date(b.fiscal_year_end, "fiscal_year_end"), tz = str(b.time_zone, "time_zone", 64);
      await write(async (db) => {
        if (await one(db, "SELECT 1 FROM clients WHERE name = $1", [name])) throw new EngineError(`client '${name}' already exists`);
        const r = await one(db, "INSERT INTO clients (name, fiscal_year_end, time_zone, created_by) VALUES ($1,$2,$3,$4) RETURNING id", [name, fye, tz, actor]);
        await recordEvent(db, actor, "client.add", "client", r!.id, { name });
      });
      return reply.code(201).send({ name });
    } catch (e) { return send(reply, e); }
  });
  app.post("/api/engagements", json, async (req, reply) => {
    try {
      const actor = need(req, "preparer");
      const b = (req.body ?? {}) as any;
      const client = str(b.client, "client", 200), name = str(b.name, "name", 100);
      if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name)) throw bad("name may contain letters, digits, spaces, dots, dashes, and underscores");
      const ps = date(b.period_start, "period_start"), pe = date(b.period_end, "period_end"), asOf = date(b.as_of, "as_of");
      if (pe < ps) throw bad("period_end is before period_start");
      if (!Array.isArray(b.systems) || !b.systems.length || b.systems.some((s: unknown) => typeof s !== "string" || !s.trim())) throw bad("systems must be a non-empty list of names");
      const systems = [...new Set((b.systems as string[]).map((s) => s.trim()))];
      const modules = b.modules === null || b.modules === undefined ? null : Array.isArray(b.modules) ? b.modules.map(String) : (() => { throw bad("modules must be a list or null"); })();
      const data = meth.load();
      const scoped = meth.scoped(data, modules);
      await write(async (db) => {
        await requireRole(db, actor, "preparer", "approver");
        const c = await one(db, "SELECT id FROM clients WHERE name = $1", [client]);
        if (!c || !(await canSeeClient(db, actor, c.id))) throw new EngineError("unknown client");
        if (await one(db, "SELECT 1 FROM engagements WHERE name = $1", [name])) throw new EngineError(`engagement '${name}' already exists`);
        const r = await one(db, "INSERT INTO engagements (client_id, name, period_start, period_end, as_of, systems, methodology_version, methodology_hash, snapshot_id, created_by, created_at, modules) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$11) RETURNING id",
          [c.id, name, ps, pe, asOf, j(systems), data.version, data.document_hash, actor, now(), modules ? j(modules) : null]);
        await addMember(db, actor, r!.id, actor);
        await recordEvent(db, actor, "engagement.create", "engagement", r!.id, { methodology_version: data.version, methodology_hash: data.document_hash, snapshot_id: null, systems,
          modules: scoped.modules.map((m) => m.code), modules_out_of_scope: data.modules.filter((m) => !(m.code in scoped.modulesByCode)).map((m) => m.code) });
      });
      return reply.code(201).send(await engagementDetail(pool, name));
    } catch (e) { return send(reply, e); }
  });
  app.get("/api/engagements/:name", async (req, reply) => {
    try { return await engagementDetail(pool, (req.params as any).name); } catch (e) { return send(reply, e); }
  });

  app.get("/api/engagements/:name/members", async (req, reply) => {
    try {
      const eid = await memberEngagement(pool, req.user!.name, (req.params as any).name);
      if (!eid) throw new HttpError(404, "not_found", "not found");
      return await all(pool, "SELECT m.user_name AS name, COALESCE(u.display_name, u.name) AS display_name, u.role, m.added_by, m.added_at FROM engagement_members m JOIN users u ON u.name = m.user_name WHERE m.engagement_id = $1 ORDER BY m.added_at", [eid]);
    } catch (e) { return send(reply, e); }
  });
  /** The engagement for a membership change: any engagement for an administrator, otherwise one the preparer belongs to. */
  const membershipEngagement = async (req: FastifyRequest): Promise<[string, number]> => {
    const name = (req.params as any).name;
    if (isAdmin(req.user)) {
      const e = await one(pool, "SELECT id FROM engagements WHERE name = $1", [name]);
      if (!e) throw new HttpError(404, "not_found", "not found");
      return [req.user!.name, e.id];
    }
    const actor = need(req, "preparer");
    const eid = await memberEngagement(pool, actor, name);
    if (!eid) throw new HttpError(404, "not_found", "not found");
    return [actor, eid];
  };
  app.post("/api/engagements/:name/members", json, async (req, reply) => {
    try {
      const [actor, eid] = await membershipEngagement(req);
      const user = str((req.body as any)?.user, "user", 100);
      await write((db) => addMember(db, actor, eid, user));
      return reply.code(201).send({ name: user });
    } catch (e) { return send(reply, e); }
  });
  app.delete("/api/engagements/:name/members/:user", async (req, reply) => {
    try {
      const [actor, eid] = await membershipEngagement(req);
      await write((db) => removeMember(db, actor, eid, (req.params as any).user));
      return reply.code(204).send();
    } catch (e) { return send(reply, e); }
  });

  // ---------------------------------------------------------------- administration (people and access; no audit work)
  const admin = (req: FastifyRequest) => { if (!isAdmin(req.user)) throw new HttpError(403, "forbidden", "this action needs the admin role"); return req.user!.name; };
  app.get("/api/users", async (req, reply) => { try { admin(req); return await listUsers(pool); } catch (e) { return send(reply, e); } });
  app.post("/api/users", json, async (req, reply) => {
    try {
      const actor = admin(req);
      const b = (req.body ?? {}) as any;
      const name = str(b.name, "name", 40);
      await write((db) => createPerson(db, actor, name, str(b.role, "role", 20), typeof b.display_name === "string" ? b.display_name.trim() || null : null, str(b.password, "password", 200)));
      return reply.code(201).send((await listUsers(pool)).find((u) => u.name === name));
    } catch (e) { return send(reply, e); }
  });
  app.put("/api/users/:name", json, async (req, reply) => {
    try {
      const actor = admin(req);
      const name = (req.params as any).name, b = (req.body ?? {}) as any;
      await write(async (db) => {
        if (b.role !== undefined) await changeRole(db, actor, name, str(b.role, "role", 20));
        if (b.display_name !== undefined) await db.query("UPDATE users SET display_name = $1 WHERE name = $2 AND role <> 'agent'", [str(b.display_name, "display_name", 100), name]);
      });
      const u = (await listUsers(pool)).find((x) => x.name === name);
      if (!u) throw new HttpError(404, "not_found", "not found");
      return u;
    } catch (e) { return send(reply, e); }
  });
  /** Changing one's own password: the current password is required, failures are rate-limited, the session making the
   * change stays signed in and every other session of the user ends. */
  const ownPassword = async (req: FastifyRequest, reply: FastifyReply, current: unknown, next: unknown) => {
    try {
      const cur = typeof current === "string" ? current.slice(0, 200) : "";
      const nxt = str(next, "new password", 200);
      await write((db) => changeOwnPassword(db, req.user!.name, cur, nxt, req.sessionHash!));
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof EngineError && /^too many/.test(e.message)) return reply.code(429).send({ error: "rate_limited", message: e.message });
      if (e instanceof EngineError && /current password is not correct/.test(e.message)) return reply.code(403).send({ error: "wrong_current_password", message: e.message });
      return send(reply, e);
    }
  };
  app.post("/api/me/password", json, async (req, reply) => {
    const b = (req.body ?? {}) as any;
    return ownPassword(req, reply, b.current_password, b.new_password);
  });
  app.post("/api/users/:name/password", json, async (req, reply) => {
    const name = (req.params as any).name, b = (req.body ?? {}) as any;
    // One's own password always goes through the self-service checks, administrators included.
    if (req.user!.name === name) return ownPassword(req, reply, b.current_password, b.password);
    try {
      const actor = admin(req);
      // An administrator's reset is temporary: the owner must change it at the next sign-in.
      await write((db) => setPassword(db, actor, name, str(b.password, "password", 200)));
      return reply.code(204).send();
    } catch (e) { return send(reply, e); }
  });
  app.post("/api/users/:name/disable", json, async (req, reply) => {
    try {
      const actor = admin(req);
      await write((db) => disableUser(db, actor, (req.params as any).name, str((req.body as any)?.reason, "reason")));
      return reply.code(204).send();
    } catch (e) { return send(reply, e); }
  });
  app.get("/api/admin/engagements", async (req, reply) => {
    try {
      admin(req);
      return await all(pool, `SELECT e.name, c.name AS client, e.period_start, e.period_end,
          COALESCE((SELECT json_agg(m.user_name ORDER BY m.user_name) FROM engagement_members m WHERE m.engagement_id = e.id), '[]'::json) AS members
        FROM engagements e JOIN clients c ON c.id = e.client_id ORDER BY e.id`);
    } catch (e) { return send(reply, e); }
  });

  // ---------------------------------------------------------------- RCM
  app.get("/api/rcm/fields", async () => FIELDS.map((f) => ({ key: f.key, label: f.label, object: f.object, requirement: f.req, applies_to: f.applies_to ?? [], description: f.description, values: f.list ? Object.keys(PICKLISTS[f.list] ?? {}) : null })));
  app.post("/api/engagements/:name/rcm", { bodyLimit: MAX_BYTES }, async (req, reply) => {
    try {
      const actor = need(req, "preparer");
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body)) throw bad("send the file as the raw request body with content-type application/octet-stream");
      const filename = String((req.query as any).filename ?? "rcm.xlsx");
      const r = await write((db) => storeUpload(db, actor, (req.params as any).name, filename, body));
      return reply.code(r.existing ? 200 : 201).send(r);
    } catch (e) {
      if ((e as any)?.code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: "too_large", message: "the file is larger than 20 MB" });
      return send(reply, e);
    }
  });
  app.get("/api/rcm/:id", async (req, reply) => {
    try {
      const up = await getUpload(pool, id((req.params as any).id));
      const sheets = await loadSheets(pool, up.id);
      return { upload_id: up.id, engagement: up.engagement, filename: up.filename, sha256: up.sha256, status: up.status, snapshot_id: up.snapshot_id,
        sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length, columns: s.max_column, preview: s.rows.slice(0, 15).map((r) => ({ row: r.row_no, cells: r.cells })) })) };
    } catch (e) { return send(reply, e); }
  });
  app.get("/api/rcm/:id/mapping", async (req, reply) => { try { return await getMapping(pool, id((req.params as any).id)); } catch (e) { return send(reply, e); } });
  app.put("/api/rcm/:id/mapping", json, async (req, reply) => {
    try {
      const actor = need(req, "preparer");
      const conf = req.body as any;
      if (!conf || !Array.isArray(conf.sheets)) throw bad("body must be { sheets: [...] }");
      const r = await write((db) => confirmMapping(db, actor, id((req.params as any).id), conf));
      return { version: r.version, warnings: r.warnings, confirmed: (await getMapping(pool, id((req.params as any).id))).confirmed };
    } catch (e) { return send(reply, e); }
  });
  app.post("/api/rcm/:id/mapping/assist", async (req, reply) => {
    try {
      const actor = need(req, "preparer");
      const uploadId = id((req.params as any).id);
      const up = await getUpload(pool, uploadId);
      const eng = await one(pool, "SELECT id FROM engagements WHERE name = $1", [up.engagement]);
      const job = await write((db) => createJob(db, "mapping", eng!.id, { upload_id: uploadId }, actor));
      void runJob(pool, job.id, async (db) => {
        const { proposal } = await getMapping(db, uploadId);
        const r = await assistMapping(proposal, T.mapping);
        if (r.changed) await replaceProposal(db, actor, uploadId, r.proposal);
        return { proposal: r.proposal, changed: r.changed, usage: r.usage };
      });
      return reply.code(202).send({ job: await getJob(pool, job.id) });
    } catch (e) { return send(reply, e); }
  });
  app.post("/api/rcm/:id/extract", async (req, reply) => {
    try {
      const actor = need(req, "preparer");
      return await write((db) => extractUpload(db, actor, id((req.params as any).id)));
    } catch (e) { return send(reply, e); }
  });
  app.get("/api/rcm/:id/findings", async (req, reply) => { try { return await intakeFindings(pool, id((req.params as any).id)); } catch (e) { return send(reply, e); } });
  app.get("/api/rcm/:id/records", async (req, reply) => {
    try {
      const kind = (req.query as any).kind;
      if (kind !== undefined && !/^[a-z_]{2,20}$/.test(String(kind))) throw bad("invalid kind");
      return await records(pool, id((req.params as any).id), kind);
    } catch (e) { return send(reply, e); }
  });
  app.post("/api/intake-findings/:id/accept", json, async (req, reply) => {
    try {
      const actor = need(req, "approver");
      const reason = str((req.body as any)?.reason, "reason");
      return await write((db) => acceptIntakeFinding(db, actor, id((req.params as any).id), reason));
    } catch (e) { return send(reply, e); }
  });

  // ---------------------------------------------------------------- planning and review
  app.post("/api/engagements/:name/plan", json, async (req, reply) => {
    try {
      const actor = need(req, "preparer");
      const name = (req.params as any).name;
      const proposer = (req.body as any)?.proposer ?? "rules";
      if (proposer === "rules") {
        const pv = await write((db) => planning.generatePlan(db, actor, name, "rules"));
        const row = (await one(pool, "SELECT version, content FROM plan_versions WHERE id = $1", [pv]))!;
        return reply.code(201).send({ plan_version: row.version, blocking: row.content.validation.filter((f: any) => f.severity === "blocking").length, warnings: row.content.validation.filter((f: any) => f.severity === "warning").length });
      }
      if (proposer !== "model") throw bad("proposer must be 'rules' or 'model'");
      const eng = await one(pool, "SELECT id, client_id, systems, modules, snapshot_id FROM engagements WHERE name = $1", [name]);
      if (!eng) throw new EngineError(`unknown engagement '${name}'`);
      const job = await write((db) => createJob(db, "plan", eng.id, { proposer }, actor));
      void runJob(pool, job.id, async (db) => {
        // One model call reads the engagement's documents (the uploaded RCM included) into a new snapshot; the engine verifies it.
        const snap = await proposerModel.extractWithModel(db, actor, eng.client_id, eng.systems, T.proposer, undefined, eng.modules);
        await db.query("UPDATE engagements SET snapshot_id = $1 WHERE id = $2", [snap, eng.id]);
        await recordEvent(db, actor, "engagement.repin", "engagement", eng.id, { snapshot_id: snap, reason: "model proposal" });
        const pv = await planning.generatePlan(db, actor, name, "model", proposerModel.modelProposals);
        const row = (await one(db, "SELECT version, content FROM plan_versions WHERE id = $1", [pv]))!;
        return { plan_version: row.version, blocking: row.content.validation.filter((f: any) => f.severity === "blocking").length, warnings: row.content.validation.filter((f: any) => f.severity === "warning").length };
      });
      return reply.code(202).send({ job: await getJob(pool, job.id) });
    } catch (e) { return send(reply, e); }
  });
  app.get("/api/engagements/:name/plan", async (req, reply) => {
    try {
      const v = (req.query as any).version;
      const pv = await planning.getPlan(pool, (req.params as any).name, v === undefined ? null : id(v));
      return { version: pv.version, status: pv.status, content_hash: pv.content_hash, created_by: pv.created_by, created_at: pv.created_at, decided_by: pv.decided_by, decided_at: pv.decided_at, decision_note: pv.decision_note, plan: pv.plan };
    } catch (e) { return send(reply, e); }
  });
  app.post("/api/engagements/:name/review", json, async (req, reply) => {
    try {
      const actor = need(req, "preparer");
      const name = (req.params as any).name;
      const mc = (req.body as any)?.max_cycles ?? workflow.MAX_CYCLES;
      if (![1, 2].includes(mc)) throw bad("max_cycles must be 1 or 2");
      const eng = await one(pool, "SELECT id FROM engagements WHERE name = $1", [name]);
      if (!eng) throw new EngineError(`unknown engagement '${name}'`);
      const job = await write((db) => createJob(db, "review", eng.id, { max_cycles: mc }, actor));
      void runJob(pool, job.id, (db) => workflow.reviewCycle(db, actor, name, T.review ?? {}, mc));
      return reply.code(202).send({ job: await getJob(pool, job.id) });
    } catch (e) { return send(reply, e); }
  });
  app.get("/api/jobs/:id", async (req, reply) => { try { return await getJob(pool, id((req.params as any).id)); } catch (e) { return send(reply, e); } });

  // ---------------------------------------------------------------- human decisions
  app.post("/api/contradictions/:id/resolve", json, async (req, reply) => {
    try {
      const actor = need(req, "approver");
      const b = (req.body ?? {}) as any;
      const cid = id((req.params as any).id);
      const choose = str(b.choose, "choose", 100), reason = str(b.reason, "reason");
      return await write(async (db) => {
        const c = await one(db, "SELECT c.id, e.name FROM contradictions c JOIN engagements e ON e.id = c.engagement_id WHERE c.id = $1", [cid]);
        if (!c) throw new EngineError("unknown contradiction");
        await approvals.resolveContradiction(db, actor, c.name, cid, choose, reason);
        return one(db, "SELECT id, control_ref, subject, materiality, status, chosen_source, resolution, resolved_by, resolved_at FROM contradictions WHERE id = $1", [cid]);
      });
    } catch (e) { return send(reply, e); }
  });
  app.post("/api/identity-issues/:id/resolve", json, async (req, reply) => {
    try {
      const actor = need(req, "approver");
      const b = (req.body ?? {}) as any;
      const iid = id((req.params as any).id);
      return await write(async (db) => {
        await identity.resolve(db, actor, iid, str(b.decision, "decision", 40), str(b.reason, "reason"), b.choose === undefined ? undefined : String(b.choose));
        return one(db, "SELECT id, control_id, issue_type, status, decision, prior_control_id, resolution, resolved_by, resolved_at FROM identity_links WHERE id = $1", [iid]);
      });
    } catch (e) { return send(reply, e); }
  });
  app.post("/api/review-findings/:id/disposition", json, async (req, reply) => {
    try {
      const actor = need(req, "approver");
      const b = (req.body ?? {}) as any;
      const fid = id((req.params as any).id);
      return await write(async (db) => {
        await workflow.dispositionFinding(db, actor, fid, str(b.decision, "decision", 10), str(b.reason, "reason"));
        return one(db, "SELECT id, control_id, code, category, status, human_decision, human_by, human_at FROM review_notes WHERE id = $1", [fid]);
      });
    } catch (e) { return send(reply, e); }
  });
  app.post("/api/engagements/:name/approve", json, async (req, reply) => {
    try {
      const actor = need(req, "approver");
      const note = str((req.body as any)?.note, "note");
      return await write(async (db) => {
        const pv = await approvals.approvePlan(db, actor, (req.params as any).name, note);
        return one(db, "SELECT version, content_hash FROM plan_versions WHERE id = $1", [pv]);
      });
    } catch (e) { return send(reply, e); }
  });
  app.post("/api/engagements/:name/reject", json, async (req, reply) => {
    try {
      const actor = need(req, "approver");
      const note = str((req.body as any)?.note, "note");
      return await write(async (db) => {
        const pv = await approvals.rejectPlan(db, actor, (req.params as any).name, note);
        return one(db, "SELECT version FROM plan_versions WHERE id = $1", [pv]);
      });
    } catch (e) { return send(reply, e); }
  });
}

