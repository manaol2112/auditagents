/** Append-only, hash-chained audit trail and user permissions. */
import { canon, Db, EngineError, j, now, one, all, sha256 } from "./db.js";

export const GENESIS = "0".repeat(64);

/** Append to the chain. The chain-head row is locked until the caller's transaction ends (or at once, outside a
 * transaction), so concurrent writers append one after another and never fork the chain. */
export async function recordEvent(db: Db, actor: string, action: string, entity: string, entityId: unknown, detail: Record<string, unknown> = {}): Promise<string> {
  const head = await one(db, "SELECT hash FROM event_chain_head WHERE id = 1 FOR UPDATE");
  const prev = head ? head.hash : GENESIS;
  const ts = now();
  const payload = canon({ ts, actor, action, entity, entity_id: String(entityId), detail, prev });
  const h = sha256(payload);
  const ev = await one(db,
    "INSERT INTO events (ts, actor, action, entity, entity_id, detail, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    [ts, actor, action, entity, String(entityId), j(detail), prev, h],
  );
  await db.query("UPDATE event_chain_head SET last_id = $1, hash = $2 WHERE id = 1", [ev!.id, h]);
  return h;
}

export async function verifyChain(db: Db): Promise<boolean> {
  let prev = GENESIS;
  for (const r of await all(db, "SELECT * FROM events ORDER BY id")) {
    const payload = canon({ ts: r.ts, actor: r.actor, action: r.action, entity: r.entity, entity_id: r.entity_id, detail: r.detail, prev });
    if (sha256(payload) !== r.hash || r.prev_hash !== prev) return false;
    prev = r.hash;
  }
  return true;
}

export async function requireRole(db: Db, actor: string, ...roles: string[]): Promise<string> {
  const row = await one(db, "SELECT role FROM users WHERE name = $1", [actor]);
  if (!row) throw new EngineError(`unknown user '${actor}'`);
  if (!roles.includes(row.role)) throw new EngineError(`user '${actor}' has role '${row.role}'; this action needs one of: ${roles.join(", ")}`);
  return row.role;
}

export async function addUser(db: Db, actor: string, name: string, role: string): Promise<void> {
  if (!["agent", "preparer", "approver", "reader", "admin"].includes(role)) throw new EngineError("role must be agent, reader, preparer, approver, or admin");
  await db.query("INSERT INTO users (name, role) VALUES ($1, $2)", [name, role]);
  await recordEvent(db, actor, "user.add", "user", name, { role });
}
