/** Review cycle: independent review, targeted revision, bounded loop, objective fix checks, escalation. Every step is logged.
 *
 *   reviewCycle(engagement)
 *     pass 1 (once per document set)         reviewer, blind
 *     loop up to MAX_CYCLES:
 *       engine diff + pass 2                  reviewer, compare
 *       store findings as review notes        engine
 *       if no valid findings of significance: stop
 *       targeted revision                     planning agent
 *       re-pin snapshot, new plan version     engine
 *       deterministic fix checks              engine (acceptance by the planner is not a fix)
 *     remaining valid high/medium findings    escalated to the human
 *     human dispositions                      dispositionFinding(); approval refused while escalations stand
 *
 * Agents never approve, never edit each other's stored output, and never resolve a judgment.
 */
import { recordEvent, requireRole } from "./audit.js";
import { Db, EngineError, hashOf, j, now, one, all, sha256 } from "./db.js";
import * as meth from "./methodology.js";
import * as planning from "./planning.js";
import { ATTRIBUTE_CRITERION } from "./planning.js";
import * as proposerModel from "./proposerModel.js";
import { Transport } from "./proposerModel.js";
import * as reviewerModel from "./reviewerModel.js";

export const MAX_CYCLES = 2;
export const ACTIONABLE = new Set(["high", "medium"]);

// ---------------------------------------------------------------- activity log

/** One logged task step; failures are recorded too. */
export async function activity<T>(db: Db, engagementId: number, task: string, step: string, actor: string, inputRefs: Record<string, unknown>,
  fn: (act: { output_refs: Record<string, unknown>; detail: Record<string, unknown> }) => Promise<T>): Promise<T> {
  const act = { output_refs: {} as Record<string, unknown>, detail: {} as Record<string, unknown> };
  const row = await one(db, "INSERT INTO activities (engagement_id, task, step, actor, status, input_refs, output_refs, detail, started_at) VALUES ($1,$2,$3,$4,'started',$5,'{}','{}',$6) RETURNING id",
    [engagementId, task, step, actor, j(inputRefs), now()]);
  try {
    const out = await fn(act);
    await db.query("UPDATE activities SET status = 'completed', output_refs = $1, detail = $2, finished_at = $3 WHERE id = $4", [j(act.output_refs), j(act.detail), now(), row!.id]);
    return out;
  } catch (e: any) {
    act.detail.error = String(e?.message ?? e).slice(0, 500);
    await db.query("UPDATE activities SET status = 'failed', output_refs = $1, detail = $2, finished_at = $3 WHERE id = $4", [j(act.output_refs), j(act.detail), now(), row!.id]).catch(() => {});
    throw e;
  }
}

export async function activityLog(db: Db, engagementId: number): Promise<any[]> {
  return all(db, "SELECT * FROM activities WHERE engagement_id = $1 ORDER BY id", [engagementId]);
}

// ---------------------------------------------------------------- deterministic post-revision checks

/** Plan controls for a finding: by stable identity, else by the finding's cited source line. */
function controlIn(plan: any, controlId: string, source: any): any[] {
  const hits = plan.controls.filter((c: any) => c.control_id === controlId || c.ref === controlId);
  if (hits.length) return hits;
  const docId = source?.doc_id, line = source?.line ?? -9;
  return plan.controls.filter((c: any) => c.source?.doc_id === docId && (c.source.line_no ?? -1) <= line && line <= (c.source.line_end ?? c.source.line_no ?? -1));
}

function attrsForCode(code: string): string[] {
  if (code in ATTRIBUTE_CRITERION) return [code];
  const byField = Object.entries(ATTRIBUTE_CRITERION).filter(([, [field]]) => field === code).map(([a]) => a);
  return byField.length ? byField : [code];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Objective check that the revised plan addresses the finding. Categories the engine cannot verify objectively return fixed=false. */
export function verifyFix(finding: any, planBefore: any, planAfter: any): { fixed: boolean; basis: string } {
  const { category: cat, code, source: src } = finding;
  const before = controlIn(planBefore, finding.control_id, src);
  const after = controlIn(planAfter, finding.control_id, src);
  if (cat === "omitted_control") {
    const mapped = after.filter((c) => c.module);
    return { fixed: mapped.length > 0, basis: mapped.length ? `plan now has ${JSON.stringify(mapped.map((c) => c.ref))} mapped at the cited lines` : "no mapped control cites the finding's source line" };
  }
  if (!after.length) return { fixed: false, basis: "control no longer present in the revised plan" };
  const procsB: Record<string, any> = {}, procsA: Record<string, any> = {}, critA: Record<string, any> = {}, critB: Record<string, any> = {};
  for (const c of before) { for (const p of c.procedures ?? []) procsB[p.attribute] = p; Object.assign(critB, c.criteria_register?.criteria ?? {}); }
  for (const c of after) { for (const p of c.procedures ?? []) procsA[p.attribute] = p; Object.assign(critA, c.criteria_register?.criteria ?? {}); }
  if (cat === "omitted_procedure") {
    const p = procsA[code];
    return { fixed: Boolean(p) && p.status.startsWith("proposed"), basis: `procedure ${code} status is '${p ? p.status : "missing"}'` };
  }
  if (cat === "unsupported_criterion" || cat === "contradictory_criterion") {
    const attrs = attrsForCode(code);
    const state = (m: Record<string, any>, a: string) => [m[a]?.status ?? null, String(m[a]?.criterion)];
    const states = Object.fromEntries(attrs.map((a) => [a, state(critA, a)]));
    const befores = Object.fromEntries(attrs.map((a) => [a, state(critB, a)]));
    // Fixed only if the criterion state actually changed and no attribute still carries the same "defined" claim.
    const changed = !same(states, befores);
    const stillClaimed = attrs.some((a) => a in critA && states[a][0] === "defined" && states[a][1] === befores[a]?.[1]);
    return { fixed: attrs.length > 0 && changed && !stillClaimed && attrs.every((a) => a in critA),
      basis: changed ? `criteria were ${JSON.stringify(befores)}, now ${JSON.stringify(states)}` : `criteria unchanged: ${JSON.stringify(states)}` };
  }
  if (cat === "incorrect_applicability" || cat === "overstated_contribution") {
    const vals = (cs: any[]) => Object.fromEntries(cs.filter((c) => c.module && code in (c.contributions ?? {})).map((c) => [c.module, c.contributions[code].value]));
    const valsA = vals(after), valsB = vals(before);
    if (!Object.keys(valsA).length) {
      const sts = Object.fromEntries(attrsForCode(code).map((a) => [a, procsA[a]?.status ?? null]));
      return { fixed: Object.values(sts).some((st: any) => st && (st.startsWith("covered by another") || st.includes("not applicable"))), basis: `procedure statuses ${JSON.stringify(sts)}` };
    }
    return { fixed: !same(valsA, valsB) && Object.values(valsA).every((v) => v !== "full"), basis: `contribution ${code} was ${JSON.stringify(valsB)}, now ${JSON.stringify(valsA)}` };
  }
  if (cat === "weak_evidence") {
    const eb = code in procsB ? [...(procsB[code].evidence_requests ?? [])].sort() : null;
    const ea = code in procsA ? [...(procsA[code].evidence_requests ?? [])].sort() : null;
    const changed = !same(ea, eb);
    return { fixed: ea !== null && ea.length > 0 && changed, basis: changed ? "evidence requests changed" : "evidence requests unchanged" };
  }
  if (cat === "incomplete_population") {
    const pb = procsB[code]?.population, pa = procsA[code]?.population;
    return { fixed: Boolean(pa) && pa !== pb, basis: pa !== pb ? "population definition changed" : "population definition unchanged" };
  }
  if (cat === "unnecessary_or_duplicate") {
    const p = procsA[code];
    return { fixed: !p || !p.status.startsWith("proposed"), basis: `procedure ${code} status is '${p ? p.status : "removed"}'` };
  }
  if (cat === "omitted_risk") {
    const ws = (src?.quote ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w: string) => w.length > 4).slice(0, 6);
    const blob = [...after.map((c) => c.description), ...after.flatMap((c) => Object.values<any>(c.contributions ?? {}).map((v) => v.rationale)), ...after.flatMap((c) => c.walkthrough_questions ?? [])].join(" ").toLowerCase();
    const hit = ws.filter((w: string) => blob.includes(w)).length;
    return { fixed: ws.length > 0 && hit >= Math.max(1, Math.floor(ws.length / 2)), basis: `${hit}/${ws.length} risk words now visible in the control's plan text` };
  }
  return { fixed: false, basis: "not objectively verifiable; left for the reviewer or the human" };
}

// ---------------------------------------------------------------- cycle

async function latestDraft(db: Db, engId: number): Promise<any> {
  const row = await one(db, "SELECT * FROM plan_versions WHERE engagement_id = $1 ORDER BY version DESC LIMIT 1", [engId]);
  if (!row || row.status !== "draft") throw new EngineError("review needs a draft plan version; run 'plan' first");
  return row;
}

async function storeReview(db: Db, engId: number, pvId: number, cycle: number, actor: string, pass1: any, pass2: any, usage: any, findings: any[]): Promise<[number, any[]]> {
  const rv = await one(db, "INSERT INTO reviews (engagement_id, plan_version_id, cycle, reviewer, pass1_hash, pass1, pass2_hash, pass2, usage, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
    [engId, pvId, cycle, actor, hashOf(pass1), j(pass1), hashOf(pass2), j(pass2), j(usage), now()]);
  const rid = rv!.id as number;
  const stored: any[] = [];
  for (const f of findings) {
    const status = f.verified ? "open" : "unverified";
    const n = await one(db, "INSERT INTO review_notes (review_id, plan_version_id, cycle, control_id, code, category, significance, source, verified, rationale, suggested_action, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
      [rid, pvId, cycle, f.control_id, f.code, f.category, f.significance, j(f.source), f.verified,
        f.rationale + (f.verification_problems.length ? " [verification: " + f.verification_problems.join("; ") + "]" : ""), f.suggested_action, status, now()]);
    stored.push({ ...f, id: n!.id, status });
  }
  await recordEvent(db, actor, "review.record", "review", rid, { plan_version_id: pvId, cycle, findings: findings.length, unverified: findings.filter((f) => !f.verified).length });
  return [rid, stored];
}

export interface Transports { pass1?: Transport; pass2?: Transport; revision?: Transport }
export interface CycleSummary { cycles: any[]; escalated: number[]; final_plan_version: number | null }

/** Run review and revision cycles on the latest draft. `transports` may hold 'pass1', 'pass2', 'revision' (replay/stub). */
export async function reviewCycle(db: Db, actor: string, engagementName: string, transports: Transports = {}, maxCycles = MAX_CYCLES, reviewerActor = "reviewer-agent", plannerActor = "planner-agent"): Promise<CycleSummary> {
  await requireRole(db, actor, "agent", "preparer", "approver");
  const found = await one(db, "SELECT * FROM engagements WHERE name = $1", [engagementName]);
  if (!found) throw new EngineError(`unknown engagement '${engagementName}'`);
  let eng: Record<string, any> = found;
  const data = meth.scoped(meth.load(), eng.modules);
  const systems: string[] = eng.systems;
  const [, docs] = await proposerModel.documentsText(db, eng.client_id);
  const summary: CycleSummary = { cycles: [], escalated: [], final_plan_version: null };

  // Pass 1 is blind and depends only on the documents; reuse it for the same document set.
  const docsHash = sha256(docs.map((d) => d.sha256).join("|")).slice(0, 16);
  const prior = await one(db, "SELECT pass1 FROM reviews WHERE engagement_id = $1 AND pass1_hash <> '' ORDER BY id DESC LIMIT 1", [eng.id]);
  let pass1: any, usage1: any;
  await activity(db, eng.id, "independent_review", "pass1_blind_assessment", reviewerActor, { documents: docsHash }, async (act) => {
    if (prior && prior.pass1?._docs_hash === docsHash) {
      pass1 = prior.pass1; usage1 = { reused: true };
      act.detail.reused = true;
    } else {
      [pass1, usage1] = await reviewerModel.runPass1(db, eng.client_id, data, systems, transports.pass1);
      pass1._docs_hash = docsHash;
    }
    act.output_refs = { controls_in_assessment: (pass1.controls ?? []).length, usage: usage1 };
  });

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const pv = await latestDraft(db, eng.id);
    const plan = pv.content;
    const candidates = await activity(db, eng.id, "independent_review", `cycle${cycle}_engine_diff`, "engine", { plan_version: pv.id, plan_hash: pv.content_hash }, async (act) => {
      const c = reviewerModel.engineDiff(pass1, plan, docs);
      act.output_refs = { candidates: c.length };
      return c;
    });
    const [rid, stored] = await activity(db, eng.id, "independent_review", `cycle${cycle}_pass2_compare`, reviewerActor, { plan_version: pv.id, candidates: candidates.length }, async (act) => {
      const [pass2, usage2] = await reviewerModel.runPass2(db, eng.client_id, data, pass1, plan, candidates, transports.pass2);
      const findings = reviewerModel.verifyFindings(pass2, plan, docs, data);
      const r = await storeReview(db, eng.id, pv.id, cycle, reviewerActor, pass1, pass2, { pass1: usage1, pass2: usage2 }, findings);
      act.output_refs = { review_id: r[0], findings: r[1].length, verified: r[1].filter((f) => f.verified).length, usage: usage2 };
      return r;
    });
    const actionable = stored.filter((f) => f.verified && ACTIONABLE.has(f.significance) && f.category !== "human_judgment_question");
    const questions = stored.filter((f) => f.category === "human_judgment_question");
    summary.cycles.push({ cycle, plan_version: pv.version, review_id: rid, findings: stored.length, actionable: actionable.length, questions: questions.length });
    if (!actionable.length || cycle === maxCycles) break;

    // Targeted revision by the Planning Agent.
    const propRow = await one(db, "SELECT content FROM model_proposals WHERE snapshot_id = $1 ORDER BY id DESC LIMIT 1", [eng.snapshot_id]);
    if (!propRow) throw new EngineError("the pinned snapshot has no model proposal; revision applies to model-proposed plans only");
    await activity(db, eng.id, "planning_revision", `cycle${cycle}_targeted_revision`, plannerActor, { findings: actionable.map((f) => f.id), prior_proposal_snapshot: eng.snapshot_id }, async (act) => {
      const newSnap = await proposerModel.reviseWithModel(db, plannerActor, eng.client_id, systems, propRow.content, actionable, transports.revision, undefined, eng.modules);
      const usage = { ...(await one(db, "SELECT usage FROM model_proposals WHERE snapshot_id = $1", [newSnap]))!.usage };
      const responses: Record<number, any> = Object.fromEntries((usage.responses ?? []).map((r: any) => [r.finding_id, r]));
      delete usage.responses;
      for (const f of actionable) {
        const r = responses[f.id];
        const st = r && r.decision === "accepted" ? "accepted_by_planner" : r ? "rejected_by_planner" : "open";
        await db.query("UPDATE review_notes SET status = $1, planner_response = $2 WHERE id = $3", [st, r ? j(r) : null, f.id]);
      }
      await db.query("UPDATE engagements SET snapshot_id = $1 WHERE id = $2", [newSnap, eng.id]);
      await recordEvent(db, plannerActor, "engagement.repin", "engagement", eng.id, { snapshot_id: newSnap, reason: `revision for review cycle ${cycle}` });
      eng = (await one(db, "SELECT * FROM engagements WHERE id = $1", [eng.id]))!;
      act.output_refs = { snapshot: newSnap, usage, accepted: actionable.filter((f) => responses[f.id]?.decision === "accepted").length };
    });
    const pvNew = await activity(db, eng.id, "planning_revision", `cycle${cycle}_regenerate_plan`, "engine", { snapshot: eng.snapshot_id }, async (act) => {
      const id = await planning.generatePlan(db, plannerActor, engagementName, "model", proposerModel.modelProposals);
      await db.query("UPDATE plan_versions SET revision_of = $1, review_cycle = $2 WHERE id = $3", [pv.id, cycle, id]);
      act.output_refs = { plan_version_id: id };
      return id;
    });
    const planAfter = (await one(db, "SELECT content FROM plan_versions WHERE id = $1", [pvNew]))!.content;
    await activity(db, eng.id, "planning_revision", `cycle${cycle}_fix_checks`, "engine", { plan_version: pvNew, findings: actionable.map((f) => f.id) }, async (act) => {
      // Acceptance by the planner is not a fix. A finding is resolved only when the revised plan demonstrably addresses it.
      const checked = { fixed: [] as number[], unfixed: [] as number[] };
      for (const f of actionable) {
        const chk = verifyFix(f, plan, planAfter);
        await db.query("UPDATE review_notes SET fix_check = $1 WHERE id = $2", [j(chk), f.id]);
        if (chk.fixed) {
          await db.query("UPDATE review_notes SET status = 'resolved' WHERE id = $1 AND status IN ('accepted_by_planner', 'rejected_by_planner', 'open')", [f.id]);
          checked.fixed.push(f.id);
        } else {
          checked.unfixed.push(f.id);
        }
      }
      await recordEvent(db, "engine", "review.fix_check", "plan_version", pvNew, checked);
      act.output_refs = checked;
    });
  }

  // Escalate what remains: unresolved actionable findings and every open human-judgment question raised in this engagement's
  // reviews go to the human, whichever plan version they were raised on; a revision does not make them disappear.
  const pv = await latestDraft(db, eng.id);
  await activity(db, eng.id, "independent_review", "escalation", "engine", { plan_version: pv.id }, async (act) => {
    const rows = await all(db, `SELECT n.id FROM review_notes n JOIN reviews r ON r.id = n.review_id
      WHERE r.engagement_id = $1 AND n.verified AND (
        (n.significance IN ('high','medium') AND n.category <> 'human_judgment_question' AND n.status IN ('open','rejected_by_planner','accepted_by_planner'))
        OR (n.category = 'human_judgment_question' AND n.status = 'open'))`, [eng.id]);
    for (const r of rows) {
      await db.query("UPDATE review_notes SET status = 'escalated' WHERE id = $1", [r.id]);
      summary.escalated.push(r.id);
    }
    await recordEvent(db, "engine", "review.escalate", "plan_version", pv.id, { escalated: summary.escalated });
    act.output_refs = { escalated: summary.escalated };
  });
  summary.final_plan_version = pv.version;
  return summary;
}

// ---------------------------------------------------------------- human dispositions and gating

export async function dispositionFinding(db: Db, actor: string, noteId: number, decision: string, reason: string): Promise<void> {
  await requireRole(db, actor, "approver");
  const row = await one(db, "SELECT * FROM review_notes WHERE id = $1", [noteId]);
  if (!row) throw new EngineError("unknown review finding");
  if (row.status !== "escalated" && row.status !== "unverified") throw new EngineError(`finding is '${row.status}', not awaiting a human`);
  if (decision !== "accept" && decision !== "dismiss") throw new EngineError("decision must be accept or dismiss");
  if (!reason || !reason.trim()) throw new EngineError("a disposition needs the human's reasoning");
  await db.query("UPDATE review_notes SET status = $1, human_decision = $2, human_by = $3, human_at = $4 WHERE id = $5",
    [decision === "accept" ? "accepted_by_human" : "dismissed_by_human", reason, actor, now(), noteId]);
  await recordEvent(db, actor, "review.disposition", "review_note", noteId, { decision, reason });
}

/** Escalated findings for the engagement that owns this plan version (escalations outlive the version they were raised on). */
export async function openEscalations(db: Db, planVersionId: number): Promise<any[]> {
  return all(db, "SELECT n.* FROM review_notes n JOIN reviews r ON r.id = n.review_id WHERE r.engagement_id = (SELECT engagement_id FROM plan_versions WHERE id = $1) AND n.status = 'escalated' ORDER BY n.id", [planVersionId]);
}

export async function findingsForVersion(db: Db, planVersionId: number): Promise<any[]> {
  return all(db, "SELECT * FROM review_notes WHERE plan_version_id = $1 ORDER BY id", [planVersionId]);
}
