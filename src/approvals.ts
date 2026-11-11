/** Human decisions the engine enforces: contradiction resolution, plan approval and rejection.
 *
 * Rules enforced here, not in prompts:
 *   - only a user with role 'approver' may approve, reject, or resolve;
 *   - nobody may approve a plan they generated;
 *   - a plan with blocking validation findings cannot be approved;
 *   - escalated review findings must have a human disposition first;
 *   - only the latest draft version can be decided;
 *   - approved versions are immutable (database trigger) and every decision is logged.
 */
import { recordEvent, requireRole } from "./audit.js";
import { Db, EngineError, hashOf, now, one, all } from "./db.js";
import { blocking } from "./validate.js";

async function latest(db: Db, engagementName: string): Promise<[number, any]> {
  const eng = await one(db, "SELECT id FROM engagements WHERE name = $1", [engagementName]);
  if (!eng) throw new EngineError(`unknown engagement '${engagementName}'`);
  const row = await one(db, "SELECT * FROM plan_versions WHERE engagement_id = $1 ORDER BY version DESC LIMIT 1", [eng.id]);
  if (!row) throw new EngineError("no plan version exists; run 'plan' first");
  return [eng.id, row];
}

export async function approvePlan(db: Db, actor: string, engagementName: string, note: string): Promise<number> {
  await requireRole(db, actor, "approver");
  if (!note || !note.trim()) throw new EngineError("an approval needs a note recording the approver's reasoning (methodology 10.6)");
  const [engId, row] = await latest(db, engagementName);
  if (row.status !== "draft") throw new EngineError(`latest version ${row.version} is '${row.status}', not a draft`);
  if (row.created_by === actor) throw new EngineError("a plan cannot be approved by the user who generated it");
  if (hashOf(row.content) !== row.content_hash) throw new EngineError("content hash mismatch; the stored plan has been altered");
  const plan = row.content;
  const blockers = blocking(plan.validation);
  if (blockers.length) throw new EngineError("plan has blocking findings: " + blockers.map((b) => `${b.code} ${b.where}: ${b.text}`).join("; "));
  const esc = await all(db, "SELECT n.id, n.control_id, n.category FROM review_notes n JOIN reviews r ON r.id = n.review_id WHERE r.engagement_id = $1 AND n.status = 'escalated'", [engId]);
  if (esc.length) throw new EngineError("escalated review findings await a human disposition: " + esc.map((e) => `#${e.id} ${e.control_id} ${e.category}`).join("; "));
  await db.query("UPDATE plan_versions SET status = 'approved', decided_by = $1, decided_at = $2, decision_note = $3 WHERE id = $4", [actor, now(), note, row.id]);
  await recordEvent(db, actor, "plan.approve", "plan_version", row.id, { engagement_id: engId, version: row.version, content_hash: row.content_hash,
    warnings_accepted: plan.validation.filter((w: any) => w.severity === "warning").map((w: any) => `${w.code} ${w.where}`), note });
  return row.id;
}

export async function rejectPlan(db: Db, actor: string, engagementName: string, note: string): Promise<number> {
  await requireRole(db, actor, "approver");
  if (!note || !note.trim()) throw new EngineError("a rejection needs a note");
  const [engId, row] = await latest(db, engagementName);
  if (row.status !== "draft") throw new EngineError(`latest version ${row.version} is '${row.status}', not a draft`);
  await db.query("UPDATE plan_versions SET status = 'rejected', decided_by = $1, decided_at = $2, decision_note = $3 WHERE id = $4", [actor, now(), note, row.id]);
  await recordEvent(db, actor, "plan.reject", "plan_version", row.id, { engagement_id: engId, version: row.version, note });
  return row.id;
}

export async function resolveContradiction(db: Db, actor: string, engagementName: string, contradictionId: number, chosenSource: string, reason: string): Promise<void> {
  await requireRole(db, actor, "approver");
  const eng = await one(db, "SELECT id FROM engagements WHERE name = $1", [engagementName]);
  if (!eng) throw new EngineError(`unknown engagement '${engagementName}'`);
  const row = await one(db, "SELECT * FROM contradictions WHERE id = $1 AND engagement_id = $2", [contradictionId, eng.id]);
  if (!row) throw new EngineError("unknown contradiction for this engagement");
  if (row.status === "resolved") throw new EngineError("contradiction already resolved; resolutions are not overwritten");
  if (row.status === "stale") await recordEvent(db, actor, "contradiction.reresolve", "contradiction", row.id, { prior_resolution: row.resolution, prior_by: row.resolved_by });
  const keys = row.sources.map((s: any) => s.key);
  if (!keys.includes(chosenSource)) throw new EngineError(`chosen source must be one of ${JSON.stringify(keys)}`);
  if (!reason || !reason.trim()) throw new EngineError("a resolution needs the resolver's reasoning");
  await db.query("UPDATE contradictions SET status = 'resolved', chosen_source = $1, resolution = $2, resolved_by = $3, resolved_at = $4 WHERE id = $5", [chosenSource, reason, actor, now(), row.id]);
  await recordEvent(db, actor, "contradiction.resolve", "contradiction", row.id, { control: row.control_ref, subject: row.subject, chosen_source: chosenSource, reason });
}

export async function currentApproved(db: Db, engagementName: string): Promise<any | undefined> {
  const eng = await one(db, "SELECT id FROM engagements WHERE name = $1", [engagementName]);
  if (!eng) throw new EngineError(`unknown engagement '${engagementName}'`);
  return one(db, "SELECT * FROM plan_versions WHERE engagement_id = $1 AND status = 'approved' ORDER BY version DESC LIMIT 1", [eng.id]);
}
