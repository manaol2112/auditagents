/** PostgreSQL foundation: pool, transactions, migrations, canonical JSON, small helpers.
 *
 * The engine, not the agent, enforces: approved plan versions never change; plan content never changes
 * after it is written; the audit trail is append-only. Those rules live in migrations/*.sql as triggers.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATIONS_DIR = join(REPO_ROOT, "migrations");

/** Raised when the engine refuses an action. Message is user-facing. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

/** Anything that can run a query: a pool or a client inside a transaction. */
export type Db = Pick<pg.Pool, "query"> | pg.PoolClient;
export type Row = Record<string, any>;

export function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/** Canonical JSON: keys sorted recursively, no whitespace. Used for every hash. */
export function canon(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, any> = {};
    for (const k of Object.keys(v).sort()) {
      if (v[k] !== undefined) out[k] = sortKeys(v[k]);
    }
    return out;
  }
  return v;
}

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hashOf(value: unknown): string {
  return sha256(canon(value));
}

/** pg sends JS objects as JSON; for JSONB params we pass JSON text explicitly so arrays are not read as Postgres arrays. */
export function j(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function connect(url = process.env.DATABASE_URL): pg.Pool {
  if (!url) throw new EngineError("DATABASE_URL is not set");
  return new pg.Pool({ connectionString: url, max: 8 });
}

export async function one(db: Db, sql: string, params: unknown[] = []): Promise<Row | undefined> {
  const r = await db.query(sql, params);
  return r.rows[0];
}

export async function all(db: Db, sql: string, params: unknown[] = []): Promise<Row[]> {
  const r = await db.query(sql, params);
  return r.rows;
}

/** Run `fn` inside a transaction with the engine's write lock held, so hash-chained events stay serial. */
export async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(7340)");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw translate(e);
  } finally {
    c.release();
  }
}

/** Database refusals (trigger RAISEs, check constraints) become EngineErrors with the trigger's own message. */
export function translate(e: unknown): unknown {
  const err = e as { code?: string; message?: string };
  if (err && (err.code === "23001" || err.code === "23514" || err.code === "23505")) {
    return new EngineError(err.message ?? "database refused the change");
  }
  return e;
}

export function isRefusal(e: unknown): boolean {
  const err = e as { code?: string };
  return err?.code === "23001";
}

export async function migrate(pool: pg.Pool): Promise<string[]> {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const done = new Set((await all(pool, "SELECT name FROM schema_migrations")).map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(sql);
      await c.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)", [file, now()]);
      await c.query("COMMIT");
      applied.push(file);
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  return applied;
}

/** The same server, another database. */
export function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

const SAFE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/** Create (or recreate) a database on the server behind `url` and migrate it. Returns its URL. */
export async function createDatabase(url: string, name: string, recreate = false): Promise<string> {
  if (!SAFE_NAME.test(name)) throw new EngineError(`invalid database name '${name}'`);
  const admin = new pg.Pool({ connectionString: withDatabase(url, "postgres"), max: 1 });
  try {
    if (recreate) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!exists.rows.length) await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const target = withDatabase(url, name);
  const pool = new pg.Pool({ connectionString: target, max: 2 });
  try { await migrate(pool); } finally { await pool.end(); }
  return target;
}

export async function dropDatabase(url: string, name: string): Promise<void> {
  if (!SAFE_NAME.test(name)) throw new EngineError(`invalid database name '${name}'`);
  const admin = new pg.Pool({ connectionString: withDatabase(url, "postgres"), max: 1 });
  try { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); } finally { await admin.end(); }
}
