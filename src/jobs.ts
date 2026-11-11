/** Background jobs for operations that call the model (planning, review, mapping assistance). In-process: a job runs on
 * its own connection and records its status, result, or user-facing error; a server restart marks unfinished jobs failed. */
import pg from "pg";
import { Db, EngineError, j, now, one } from "./db.js";

export type JobKind = "plan" | "review" | "mapping";

export async function createJob(db: Db, kind: JobKind, engagementId: number | null, params: object, actor: string): Promise<any> {
  return one(db, "INSERT INTO jobs (kind, engagement_id, params, created_by, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id", [kind, engagementId, j(params), actor, now()]);
}

/** Run fn in the background. Returns at once; the job row tracks progress. */
export function runJob(pool: pg.Pool, id: number, fn: (db: pg.PoolClient) => Promise<unknown>): Promise<void> {
  return (async () => {
    const db = await pool.connect();
    try {
      await db.query("UPDATE jobs SET status = 'running', started_at = $1 WHERE id = $2", [now(), id]);
      const result = await fn(db);
      await db.query("UPDATE jobs SET status = 'succeeded', result = $1, finished_at = $2 WHERE id = $3", [j(result ?? null), now(), id]);
    } catch (e: any) {
      const message = e instanceof EngineError ? e.message : "the job failed; see the server log";
      if (!(e instanceof EngineError)) console.error(`job ${id} failed`, e);
      await db.query("UPDATE jobs SET status = 'failed', error = $1, finished_at = $2 WHERE id = $3", [message, now(), id]).catch(() => {});
    } finally {
      db.release();
    }
  })();
}

export async function getJob(db: Db, id: number): Promise<any> {
  const r = await one(db, "SELECT jb.id, jb.kind, jb.status, e.name AS engagement, jb.created_by, jb.created_at, jb.started_at, jb.finished_at, jb.result, jb.error FROM jobs jb LEFT JOIN engagements e ON e.id = jb.engagement_id WHERE jb.id = $1", [id]);
  if (!r) throw new EngineError("unknown job");
  return r;
}

export async function failInterruptedJobs(db: Db): Promise<void> {
  await db.query("UPDATE jobs SET status = 'failed', error = 'the server restarted before the job finished; run it again', finished_at = $1 WHERE status IN ('queued', 'running')", [now()]);
}
