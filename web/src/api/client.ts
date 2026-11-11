/** The only module allowed to talk to the network (enforced by scripts/security-check.mjs).
 *
 * Controls:
 *  - Same-origin only (`mode: "same-origin"` makes the browser refuse any cross-origin URL), no redirects followed
 *    (a redirect could move the request to another origin), no referrer, no HTTP cache.
 *  - Only an allowlisted set of method + path patterns can be sent. Reads are GET; every write is listed in WRITES.
 *  - Paths are built from fixed prefixes and encodeURIComponent'd segments; nothing user-controlled becomes a URL.
 *  - The session lives in an HttpOnly cookie that scripts cannot read. The CSRF token is held in this module's memory
 *    only (never in storage, never in the DOM), restored from GET /api/me after a reload, and sent on every write.
 *  - Responses must be JSON (or an empty 204), within a size cap, and match the schema; otherwise the call fails closed.
 *  - Errors are fixed strings. The only server text ever shown is the `message` of a 400/409, which the API writes for
 *    people ("name may contain letters…"); it is bounded and neutralised. 5xx bodies are never read.
 *  - A 401 means the session has ended and a 403 `password_change_required` means it must be changed first; one
 *    listener (the app shell) is told, so every screen reacts the same way.
 *  - Every call has a timeout and can be cancelled when the view changes.
 */
import type { z } from "zod";
import {
  clientList, created, engagementDetail, engagementList, meResponse, memberList, methodology, neutralize, signInResponse, workspaceModel,
  type ClientSummary, type EngagementDetail, type EngagementSummary, type Member, type Methodology, type SessionUser, type WorkspaceModel,
} from "./schema.ts";

export type ApiErrorKind =
  | "network" | "timeout" | "unauthenticated" | "rate_limited" | "password_change_required" | "forbidden"
  | "not_found" | "invalid" | "conflict" | "refused" | "server" | "format";

const MESSAGES: Record<ApiErrorKind, string> = {
  network: "The workspace server could not be reached. Check that it is running, then try again.",
  timeout: "The workspace server took too long to respond. Try again.",
  unauthenticated: "Your session has ended. Sign in again to continue.",
  rate_limited: "Too many failed attempts. Wait five minutes, then try again.",
  password_change_required: "Change your password to continue.",
  forbidden: "Your role does not allow this action.",
  not_found: "That engagement does not exist, or you are not a member of it.",
  invalid: "Some of the details are not valid.",
  conflict: "That could not be saved.",
  refused: "The workspace server refused the request.",
  server: "The workspace server reported an error. Try again in a moment.",
  format: "The workspace server returned data in an unexpected format, so it was not displayed.",
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** A people-facing explanation from the API (400/409/403 only), bounded and neutralised; null otherwise. */
  readonly detail: string | null;
  constructor(kind: ApiErrorKind, status: number | null = null, detail: string | null = null) {
    super(MESSAGES[kind]);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_NAME = 200;
const SEGMENT = "[^/]{1,600}";   // one encodeURIComponent'd path segment

type Method = "GET" | "POST" | "PUT" | "DELETE";
const WRITES: ReadonlyArray<readonly [Method, RegExp]> = [
  ["POST", /^\/api\/session$/],
  ["DELETE", /^\/api\/session$/],
  ["POST", /^\/api\/me\/password$/],
  ["POST", /^\/api\/clients$/],
  ["POST", /^\/api\/engagements$/],
  ["POST", new RegExp(`^/api/engagements/${SEGMENT}/members$`)],
];

let csrfToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;
let onPasswordChangeRequired: (() => void) | null = null;

/** The app shell registers the handlers for "the session has ended" and "the password must be changed first". */
export function setSessionHandlers(h: { unauthenticated: (() => void) | null; passwordChangeRequired: (() => void) | null }): void {
  onUnauthenticated = h.unauthenticated;
  onPasswordChangeRequired = h.passwordChangeRequired;
}
/** Kept for callers that only care about session end. */
export function setUnauthenticatedHandler(fn: (() => void) | null): void { onUnauthenticated = fn; }

/** True when a write can carry a CSRF token. */
export const hasCsrfToken = (): boolean => csrfToken !== null;

function kindForStatus(status: number, code: string | null): ApiErrorKind {
  if (status === 400) return "invalid";
  if (status === 401) return "unauthenticated";
  if (status === 403) return code === "password_change_required" ? "password_change_required" : "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "refused";
  return "server";
}

/** The `{ error, message }` of a 4xx body. Only 400/403/409 messages are kept for display; never a 5xx body. */
async function errorBody(res: Response): Promise<{ code: string | null; detail: string | null }> {
  if (res.status >= 500 || !(res.headers.get("content-type") ?? "").startsWith("application/json")) return { code: null, detail: null };
  try {
    const text = await res.text();
    if (text.length > 4096) return { code: null, detail: null };
    const b = JSON.parse(text) as { error?: unknown; message?: unknown };
    const code = typeof b.error === "string" ? b.error.slice(0, 60) : null;
    const show = [400, 403, 409].includes(res.status) && typeof b.message === "string";
    return { code, detail: show ? neutralize(String(b.message)).slice(0, 300) : null };
  } catch {
    return { code: null, detail: null };
  }
}

interface RequestOptions { method?: Method; body?: unknown; signal?: AbortSignal; quiet401?: boolean }

async function request<T>(path: string, schema: z.ZodType<T> | null, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  if (!path.startsWith("/api/") || path.includes("//") || path.includes("..")) throw new ApiError("refused");
  if (method !== "GET" && !WRITES.some(([m, re]) => m === method && re.test(path))) throw new ApiError("refused");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new ApiError("timeout")), TIMEOUT_MS);
  const signal = opts.signal;
  const onAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    let res: Response;
    try {
      res = await fetch(path, {
        method, mode: "same-origin", credentials: "same-origin", cache: "no-store", redirect: "error",
        referrerPolicy: "no-referrer", headers, signal: ctrl.signal,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch (e) {
      if (ctrl.signal.reason instanceof ApiError) throw ctrl.signal.reason;
      if (signal?.aborted) throw e;   // cancelled by the caller: not an error to show
      throw new ApiError("network");
    }
    if (!res.ok) {
      const { code, detail } = await errorBody(res);
      const kind = kindForStatus(res.status, code);
      if (kind === "unauthenticated" && !opts.quiet401) { csrfToken = null; onUnauthenticated?.(); }
      if (kind === "password_change_required") onPasswordChangeRequired?.();
      throw new ApiError(kind, res.status, kind === "password_change_required" ? null : detail);
    }
    if (schema === null) return undefined as T;
    if (!(res.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new ApiError("format", res.status);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new ApiError("format", res.status);
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new ApiError("format", res.status);
    let data: unknown;
    try { data = JSON.parse(body); } catch { throw new ApiError("format", res.status); }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      // Field paths only, never values: the values are confidential audit records.
      if (import.meta.env?.DEV) console.warn("[api] response failed validation at", parsed.error.issues.slice(0, 5).map((i) => i.path.join("."))); // security-reviewed: dev-only, logs paths not values
      throw new ApiError("format", res.status);
    }
    return parsed.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function seg(name: string): string {
  if (!name || name.length > MAX_NAME) throw new ApiError("refused");
  return encodeURIComponent(name);
}
export const engagementPath = (name: string): string => "/api/workspace/" + seg(name);

export const session = {
  /** The signed-in user, or null when there is no valid session. Restores the CSRF token for a reloaded page. */
  async current(signal?: AbortSignal): Promise<SessionUser | null> {
    try {
      const me = await request("/api/me", meResponse, { signal, quiet401: true });
      if (me.csrf_token) csrfToken = me.csrf_token;
      const { csrf_token: _drop, ...user } = me;
      return user;
    } catch (e) {
      if (e instanceof ApiError && e.kind === "unauthenticated") return null;
      throw e;
    }
  },
  async signIn(username: string, password: string): Promise<SessionUser> {
    const name = username.trim();
    if (!name || name.length > 100 || !password || password.length > 1024) throw new ApiError("unauthenticated", 401);
    const r = await request("/api/session", signInResponse, { method: "POST", body: { username: name, password }, quiet401: true });
    csrfToken = r.csrf_token;
    return r.user;
  },
  /** Ends the session on the server, which also expires the cookie. Throws if the server could not be reached, so the
   * caller never shows "signed out" while the session is still alive. A 401 means it had already ended: success. */
  async signOut(): Promise<void> {
    try {
      await request("/api/session", null, { method: "DELETE", quiet401: true });
    } catch (e) {
      if (!(e instanceof ApiError && e.kind === "unauthenticated")) throw e;
    }
    csrfToken = null;
  },
  /** Changes the signed-in user's own password; this session stays signed in, the user's other sessions end. */
  async changePassword(current: string, next: string): Promise<void> {
    if (!current || !next || next.length > 200) throw new ApiError("invalid", 400, "Enter your current password and a new one.");
    await request("/api/me/password", null, { method: "POST", body: { current_password: current, new_password: next } });
  },
};

export interface NewClient { name: string; fiscal_year_end: string; time_zone: string }
export interface NewEngagement { client: string; name: string; period_start: string; period_end: string; as_of: string; systems: string[]; modules: string[] | null }

export const api = {
  engagements: (signal?: AbortSignal): Promise<EngagementSummary[]> => request("/api/engagements", engagementList, { signal }),
  engagement: (name: string, signal?: AbortSignal): Promise<EngagementDetail> => request("/api/engagements/" + seg(name), engagementDetail, { signal }),
  workspace: (name: string, signal?: AbortSignal): Promise<WorkspaceModel> => request(engagementPath(name), workspaceModel, { signal }),
  members: (name: string, signal?: AbortSignal): Promise<Member[]> => request(`/api/engagements/${seg(name)}/members`, memberList, { signal }),
  clients: (signal?: AbortSignal): Promise<ClientSummary[]> => request("/api/clients", clientList, { signal }),
  methodology: (signal?: AbortSignal): Promise<Methodology> => request("/api/methodology", methodology, { signal }),
  createClient: (c: NewClient): Promise<{ name: string }> => request("/api/clients", created, { method: "POST", body: c }),
  createEngagement: (e: NewEngagement): Promise<EngagementDetail> => request("/api/engagements", engagementDetail, { method: "POST", body: e }),
  addMember: (engagement: string, user: string): Promise<{ name: string }> =>
    request(`/api/engagements/${seg(engagement)}/members`, created, { method: "POST", body: { user: user.trim().slice(0, 100) } }),
};

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong while loading the workspace.";
}

/** For forms: the API's own explanation when it gave one (validation, conflicts), else the fixed message. */
export function formError(e: unknown): string {
  if (e instanceof ApiError && e.detail && ["invalid", "conflict", "forbidden"].includes(e.kind)) {
    const d = e.detail.charAt(0).toUpperCase() + e.detail.slice(1);
    return /[.!?]$/.test(d) ? d : d + ".";
  }
  return errorMessage(e);
}
