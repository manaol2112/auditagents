/** Test database: DATABASE_URL if set (Docker Compose), otherwise an embedded PostgreSQL started once per process.
 * Each test gets its own database cloned from a migrated template, so tests are isolated and fast. */
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { migrate } from "../src/db.js";

let adminUrl: string | undefined;
let embedded: { stop(): Promise<void> } | undefined;
let templateReady: Promise<void> | undefined;
let counter = 0;
// Test files run in parallel processes; on a shared server (DATABASE_URL) every name must be unique to this process.
const RUN_ID = randomBytes(4).toString("hex");
const TEMPLATE = `soxplan_tpl_${RUN_ID}`;
const created: string[] = [];
const openPools: pg.Pool[] = [];
const openClients: pg.PoolClient[] = [];

async function adminPool(): Promise<pg.Pool> {
  if (!adminUrl) {
    if (process.env.DATABASE_URL) {
      adminUrl = process.env.DATABASE_URL;
    } else {
      const { default: EmbeddedPostgres } = await import("embedded-postgres");
      const dir = mkdtempSync(join(tmpdir(), "soxplan-pg-"));
      const port = 54300 + Math.floor(Math.random() * 1000);
      const ep = new EmbeddedPostgres({ databaseDir: dir, user: "soxplan", password: "soxplan", port, persistent: false, initdbFlags: ["--auth=trust", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
      await ep.initialise();
      await ep.start();
      embedded = ep;
      adminUrl = `postgres://soxplan:soxplan@127.0.0.1:${port}/postgres`;
    }
  }
  return new pg.Pool({ connectionString: adminUrl, max: 2 });
}

async function ensureTemplate(): Promise<void> {
  if (!templateReady) {
    templateReady = (async () => {
      const admin = await adminPool();
      await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE}`);
      await admin.query(`CREATE DATABASE ${TEMPLATE}`);
      created.push(TEMPLATE);
      const t = new pg.Pool({ connectionString: adminUrl!.replace(/\/[^/]*$/, `/${TEMPLATE}`), max: 2 });
      await migrate(t);
      await t.end();
      await admin.end();
    })();
  }
  return templateReady;
}

/** A fresh migrated database; call `pool.end()` when done. */
export async function freshDb(): Promise<pg.Pool> {
  await ensureTemplate();
  const admin = await adminPool();
  const name = `soxplan_t_${RUN_ID}_${++counter}`;
  await admin.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE}`);
  created.push(name);
  await admin.end();
  const pool = new pg.Pool({ connectionString: adminUrl!.replace(/\/[^/]*$/, `/${name}`), max: 4 });
  pool.on("error", () => { /* the embedded server is stopped after the pools are ended; late termination notices are expected */ });
  openPools.push(pool);
  return pool;
}

export function urlOf(pool: pg.Pool): string {
  return (pool as any).options.connectionString as string;
}

/** A connection from a test pool, released by shutdown() even when the test failed before releasing it. */
export async function checkout(pool: pg.Pool): Promise<pg.PoolClient> {
  const c = await pool.connect();
  (c as any).__pool = pool;   // tests that need the pool behind a connection (for example the HTTP server) read it here
  openClients.push(c);
  const release = c.release.bind(c);
  let released = false;
  c.release = ((err?: any) => { if (released) return; released = true; return release(err); }) as any;
  return c;
}

export async function shutdown(): Promise<void> {
  for (const c of openClients.splice(0)) c.release(true);
  for (const p of openPools.splice(0)) await p.end().catch(() => {});
  if (!embedded && adminUrl && created.length) {
    // Shared server: remove this process's databases (newest first, so clones go before the template).
    const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
    for (const name of created.splice(0).reverse()) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
    await admin.end();
  }
  if (embedded) {
    await new Promise((r) => setTimeout(r, 200));   // let ended pools finish closing their sockets
    await embedded.stop();
    embedded = undefined;
  }
}

process.on("exit", () => { /* embedded postgres is stopped in the after() hooks */ });

/** URL of the test server's admin database (for code that creates databases itself, like the eval harness). */
export async function baseUrl(): Promise<string> {
  await ensureTemplate();
  return adminUrl!;
}
