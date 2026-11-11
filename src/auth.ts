/** Sign-in for people. Agents (role 'agent') have no password and cannot sign in; every API action is taken as the
 * signed-in user, so the engine's rules (an approver cannot approve their own draft, agents cannot decide) apply. */
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { recordEvent } from "./audit.js";
import { Db, EngineError, all, one, sha256 } from "./db.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, LEN = 64;
export const SESSION_IDLE_HOURS = 12;

export const PASSWORD_MIN = 12, PASSWORD_MAX = 128;

export async function hashPassword(pw: string): Promise<string> {
  if (typeof pw !== "string" || pw.length < PASSWORD_MIN) throw new EngineError(`a password needs at least ${PASSWORD_MIN} characters`);
  if (pw.length > PASSWORD_MAX) throw new EngineError(`a password can have at most ${PASSWORD_MAX} characters`);
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${h.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  // Always do the work, so an unknown user takes as long as a wrong password.
  const [, n, r, p, salt, hash] = (stored ?? `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(LEN).toString("base64")}`).split("$");
  const h = await scrypt(String(pw ?? ""), Buffer.from(salt, "base64"), LEN, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return Boolean(stored) && timingSafeEqual(h, Buffer.from(hash, "base64"));
}

const COMMON = ["password", "passw0rd", "qwerty", "letmein", "welcome", "changeme", "iloveyou", "admin", "123456", "abc123", "soxplan", "monkey", "dragon", "football", "baseball", "sunshine", "princess", "trustno1"];
const RUNS = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** Strength rules beyond length (ASVS V6.2): no password built from the user name, a common password, one repeated
 * character, or a keyboard or alphabet run. Composition rules (forced symbols, digits) are deliberately not imposed. */
export function checkPasswordStrength(pw: string, name: string): void {
  const lower = pw.toLowerCase();
  if (name.length >= 3 && lower.includes(name.toLowerCase())) throw new EngineError("the password must not contain the user name");
  if (/^(.)\1+$/.test(pw)) throw new EngineError("the password must not be one repeated character");
  for (const c of COMMON) if (lower.includes(c) && lower.replace(c, "").replace(/[^a-z]/g, "").length < 4) throw new EngineError("the password is too close to a commonly used password; use a passphrase of several unrelated words");
  for (const run of RUNS) for (let i = 0; i + 8 <= run.length; i++) if (lower.includes(run.slice(i, i + 8)) || lower.includes([...run.slice(i, i + 8)].reverse().join(""))) throw new EngineError("the password must not contain a keyboard or alphabet sequence");
  if (new Set(lower).size < 5) throw new EngineError("the password uses too few different characters");
}

/** Set a password. One set by anyone but its owner is temporary: the owner must change it at the next sign-in. The owner's
 * other sessions end; `keepSession` (the hash of the session making the change) stays signed in. */
export async function setPassword(db: Db, actor: string, name: string, pw: string, keepSession?: string): Promise<void> {
  const u = await one(db, "SELECT role FROM users WHERE name = $1", [name]);
  if (!u) throw new EngineError(`unknown user '${name}'`);
  if (u.role === "agent") throw new EngineError("agents cannot sign in and have no password");
  checkPasswordStrength(pw, name);
  const temporary = actor !== name;
  await db.query("UPDATE users SET password_hash = $1, must_change_password = $2, password_changed_at = $3 WHERE name = $4", [await hashPassword(pw), temporary, new Date().toISOString(), name]);
  if (keepSession) await db.query("DELETE FROM sessions WHERE user_name = $1 AND token_hash <> $2", [name, keepSession]);
  else await db.query("DELETE FROM sessions WHERE user_name = $1", [name]);
  await recordEvent(db, actor, "user.password", "user", name, { temporary, other_sessions_ended: true });
}

/** A signed-in person changes their own password: the current one is required (and rate-limited like sign-in), the new one
 * must differ from it, and the session making the change stays signed in. */
export async function changeOwnPassword(db: Db, name: string, current: string, next: string, sessionHash: string): Promise<void> {
  const key = `password:${name}`;
  if (limited(key)) throw new EngineError("too many wrong current passwords; wait five minutes");
  const u = await one(db, "SELECT password_hash FROM users WHERE name = $1 AND role <> 'agent' AND disabled_at IS NULL", [name]);
  if (!u || !(await verifyPassword(String(current ?? ""), u.password_hash))) {
    failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
    throw new EngineError("the current password is not correct");
  }
  failures.delete(key);
  if (String(next) === String(current)) throw new EngineError("the new password must be different from the current one");
  await setPassword(db, name, name, String(next ?? ""), sessionHash);
}

// Failed sign-ins per user name: 5 within 5 minutes locks the name for the rest of the window.
const failures = new Map<string, number[]>();
const WINDOW_MS = 5 * 60_000, MAX_FAILURES = 5;
function limited(name: string): boolean {
  const recent = (failures.get(name) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  failures.set(name, recent);
  return recent.length >= MAX_FAILURES;
}

export type PersonRole = "reader" | "preparer" | "approver" | "admin";
export interface SessionUser { name: string; display_name: string; role: PersonRole;
  /** The password was set by someone else and must be changed before anything else. */
  must_change_password: boolean }

export async function login(db: Db, username: string, password: string): Promise<{ token: string; csrf_token: string; user: SessionUser; expires_in_seconds: number }> {
  const name = String(username ?? "").trim().slice(0, 100);
  if (limited(name)) throw new EngineError("too many failed sign-ins; wait five minutes");
  const u = await one(db, "SELECT name, display_name, role, password_hash, disabled_at, must_change_password FROM users WHERE name = $1", [name]);
  const ok = await verifyPassword(password, u && u.role !== "agent" && !u.disabled_at ? u.password_hash : null);
  if (!ok || !u) {
    failures.set(name, [...(failures.get(name) ?? []), Date.now()]);
    throw new EngineError("the user name or password is not correct");
  }
  failures.delete(name);
  const token = randomBytes(32).toString("base64url");
  const csrf = csrfFor(token);
  await db.query("INSERT INTO sessions (token_hash, csrf_hash, user_name, expires_at) VALUES ($1, $2, $3, now() + make_interval(hours => $4))", [sha256(token), sha256(csrf), u.name, SESSION_IDLE_HOURS]);
  await recordEvent(db, u.name, "session.start", "user", u.name, {});
  return { token, csrf_token: csrf, user: { name: u.name, display_name: u.display_name ?? u.name, role: u.role, must_change_password: u.must_change_password }, expires_in_seconds: SESSION_IDLE_HOURS * 3600 };
}

/** The CSRF token of a session: an HMAC keyed by the session token, so it can be handed back to the page after a reload
 * (GET /api/me) without being stored. Knowing it reveals nothing about the session token; without the session token
 * (an HttpOnly cookie) it cannot be computed. Only its hash is kept in `sessions.csrf_hash`, as before. */
export function csrfFor(sessionToken: string): string {
  return createHmac("sha256", sessionToken).update("soxplan-csrf-v1").digest("base64url");
}

/** The session for a token, or null. `csrf` is checked when given (cookie sessions must present it on every write). */
export async function authenticate(db: Db, token: string | undefined, csrf?: { required: boolean; value: string | undefined }): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const s = await one(db, `UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(hours => $2)
      WHERE token_hash = $1 AND expires_at > now() RETURNING user_name, csrf_hash`, [sha256(token), SESSION_IDLE_HOURS]);
  if (!s) return null;
  if (csrf?.required) {
    const given = Buffer.from(sha256(String(csrf.value ?? "")));
    if (!csrf.value || !timingSafeEqual(given, Buffer.from(s.csrf_hash))) return null;
  }
  const u = await one(db, "SELECT name, display_name, role, must_change_password FROM users WHERE name = $1 AND role <> 'agent' AND disabled_at IS NULL", [s.user_name]);
  return u ? { name: u.name, display_name: u.display_name ?? u.name, role: u.role, must_change_password: u.must_change_password } : null;
}

export async function logout(db: Db, token: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
}

/** Audit work: reader < preparer < approver. An administrator manages people and access and reads only as a member;
 * it neither prepares nor approves (segregation of duties). */
const RANK: Record<PersonRole, number> = { reader: 0, admin: 0, preparer: 1, approver: 2 };
export function hasRole(user: SessionUser, needed: "reader" | "preparer" | "approver"): boolean {
  return RANK[user.role] >= RANK[needed];
}
export const isAdmin = (user: SessionUser | undefined) => user?.role === "admin";

// ---------------------------------------------------------------- user administration (administrators only)

const PERSON_ROLES: PersonRole[] = ["reader", "preparer", "approver", "admin"];
const NAME_RE = /^[a-z][a-z0-9._-]{1,39}$/;

export async function listUsers(db: Db): Promise<any[]> {
  return all(db, `SELECT u.name, COALESCE(u.display_name, u.name) AS display_name, u.role, u.disabled_at IS NOT NULL AS disabled, u.disabled_at,
      (u.password_hash IS NOT NULL) AS has_password, u.must_change_password, u.password_changed_at, (SELECT COUNT(*)::int FROM engagement_members m WHERE m.user_name = u.name) AS engagements
    FROM users u WHERE u.role <> 'agent' ORDER BY u.name`);
}

export async function createPerson(db: Db, actor: string, name: string, role: string, displayName: string | null, password: string): Promise<void> {
  if (!NAME_RE.test(name)) throw new EngineError("a user name is 2 to 40 characters: lowercase letters, digits, dots, dashes, underscores, starting with a letter");
  if (!PERSON_ROLES.includes(role as PersonRole)) throw new EngineError(`role must be one of ${PERSON_ROLES.join(", ")}`);
  if (await one(db, "SELECT 1 FROM users WHERE name = $1", [name])) throw new EngineError(`user '${name}' already exists`);
  checkPasswordStrength(password, name);
  const hash = await hashPassword(password);
  await db.query("INSERT INTO users (name, role, display_name, password_hash, must_change_password, password_changed_at) VALUES ($1,$2,$3,$4,true,$5)", [name, role, displayName?.slice(0, 100) ?? null, hash, new Date().toISOString()]);
  await recordEvent(db, actor, "user.add", "user", name, { role, display_name: displayName });
}

export async function changeRole(db: Db, actor: string, name: string, role: string): Promise<void> {
  if (!PERSON_ROLES.includes(role as PersonRole)) throw new EngineError(`role must be one of ${PERSON_ROLES.join(", ")}`);
  if (name === actor) throw new EngineError("administrators cannot change their own role");
  const u = await one(db, "SELECT role FROM users WHERE name = $1", [name]);
  if (!u || u.role === "agent") throw new EngineError("unknown user");
  await db.query("UPDATE users SET role = $1 WHERE name = $2", [role, name]);
  await db.query("DELETE FROM sessions WHERE user_name = $1", [name]);   // the new role applies from the next sign-in
  await recordEvent(db, actor, "user.role", "user", name, { from: u.role, to: role });
}

/** Retire an account: it keeps its name (the audit trail refers to it) and its history, but cannot sign in again. */
export async function disableUser(db: Db, actor: string, name: string, reason: string): Promise<void> {
  if (!reason || !reason.trim()) throw new EngineError("retiring an account needs a reason");
  if (name === actor) throw new EngineError("administrators cannot retire their own account");
  const u = await one(db, "SELECT role, disabled_at FROM users WHERE name = $1", [name]);
  if (!u || u.role === "agent") throw new EngineError("unknown user");
  if (u.disabled_at) throw new EngineError(`user '${name}' is already retired`);
  await db.query("UPDATE users SET disabled_at = $1, disabled_by = $2 WHERE name = $3", [new Date().toISOString(), actor, name]);
  await db.query("DELETE FROM sessions WHERE user_name = $1", [name]);
  await recordEvent(db, actor, "user.disable", "user", name, { reason });
}

export async function removeMember(db: Db, actor: string, engagementId: number, user: string): Promise<void> {
  const r = await db.query("DELETE FROM engagement_members WHERE engagement_id = $1 AND user_name = $2", [engagementId, user]);
  if (!r.rowCount) throw new EngineError("unknown user");
  await recordEvent(db, actor, "engagement.member.remove", "engagement", engagementId, { user });
}

// ---------------------------------------------------------------- engagement access (deny by default)

/** The engagement's id when the user is a member of it; null otherwise (callers answer 404, so existence does not leak). */
export async function memberEngagement(db: Db, user: string, engagementName: string): Promise<number | null> {
  const r = await one(db, "SELECT e.id FROM engagements e JOIN engagement_members m ON m.engagement_id = e.id WHERE e.name = $1 AND m.user_name = $2", [engagementName, user]);
  return r ? r.id : null;
}

export async function isMember(db: Db, user: string, engagementId: number): Promise<boolean> {
  return Boolean(await one(db, "SELECT 1 FROM engagement_members WHERE engagement_id = $1 AND user_name = $2", [engagementId, user]));
}

/** A client is visible to its creator and to members of any of its engagements. */
export async function canSeeClient(db: Db, user: string, clientId: number): Promise<boolean> {
  return Boolean(await one(db, `SELECT 1 FROM clients c WHERE c.id = $1 AND (c.created_by = $2 OR EXISTS (
      SELECT 1 FROM engagements e JOIN engagement_members m ON m.engagement_id = e.id WHERE e.client_id = c.id AND m.user_name = $2))`, [clientId, user]));
}

export async function addMember(db: Db, actor: string, engagementId: number, user: string): Promise<void> {
  const u = await one(db, "SELECT role FROM users WHERE name = $1", [user]);
  if (!u || u.role === "agent") throw new EngineError("unknown user");
  await db.query("INSERT INTO engagement_members (engagement_id, user_name, added_by, added_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [engagementId, user, actor, new Date().toISOString()]);
  await recordEvent(db, actor, "engagement.member.add", "engagement", engagementId, { user });
}
