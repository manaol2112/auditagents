/** Read-only Planning Workforce workspace: a model of the real planning flow built from the stored records.
 * Nothing here writes to the database.
 *
 * Nodes: intake, planner, reviewer, one revision node per revision cycle, human. Edges are the relationships
 * that actually happened: documents to plan, plan to review, findings to revision, revision to new plan
 * version, escalations and drafts to the human.
 */
import { basename } from "node:path";
import { Db, EngineError, one, all } from "./db.js";
import * as review from "./review.js";
import * as workflow from "./workflow.js";

export async function buildModel(db: Db, engagementName: string): Promise<any> {
  const eng = await one(db, "SELECT e.*, c.name AS client_name FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.name = $1", [engagementName]);
  if (!eng) throw new EngineError(`unknown engagement '${engagementName}'`);
  const activities = await workflow.activityLog(db, eng.id);
  // The audit trail is one global chain across every client. Read it once here, but only ever return events scoped
  // to this engagement (see `events` below): one client's workspace must never show another client's records.
  const allEvents = await all(db, "SELECT id, ts, actor, action, entity, entity_id, detail FROM events ORDER BY id");

  // ---- intake
  const docs = await all(db, "SELECT id, title, doc_type, sha256, ingested_by, ingested_at, (SELECT COUNT(*)::int FROM document_lines l WHERE l.doc_id = d.id) AS line_count FROM documents d WHERE client_id = $1 ORDER BY id", [eng.client_id]);
  const snaps = await all(db, "SELECT s.id, s.created_by, s.created_at, s.record_hash, (SELECT COUNT(*)::int FROM controls c WHERE c.snapshot_id = s.id) AS controls FROM snapshots s WHERE client_id = $1 ORDER BY id", [eng.client_id]);
  const freeze = new Map<number, any>(allEvents.filter((e) => e.action === "snapshot.freeze").map((e) => [Number(e.entity_id), e.detail]));
  for (const s of snaps) { s.extractor = freeze.get(s.id)?.extractor ?? "rules"; s.model = freeze.get(s.id)?.model ?? null; s.pinned = s.id === eng.snapshot_id; }
  const identityIssues = await all(db, "SELECT * FROM identity_links WHERE snapshot_id IN (SELECT id FROM snapshots WHERE client_id = $1) AND issue_type NOT IN ('exact','new') ORDER BY id", [eng.client_id]);

  // ---- plans
  const versions = await all(db, "SELECT id, version, status, content_hash, created_by, created_at, decided_by, decided_at, decision_note, supersedes, revision_of, review_cycle, content FROM plan_versions WHERE engagement_id = $1 ORDER BY version", [eng.id]);
  const plans = new Map<number, any>();
  for (const v of versions) {
    const plan = v.content; delete v.content;
    plans.set(v.id, plan);
    v.proposer = plan.proposer ?? "rules";
    v.controls = plan.controls.length;
    v.mapped_controls = new Set(plan.controls.filter((c: any) => c.module).map((c: any) => c.control_id)).size;
    v.review = plan.review ?? {};
    v.blocking = plan.validation.filter((f: any) => f.severity === "blocking").length;
  }
  const latest = versions.length ? versions[versions.length - 1] : null;
  const latestPlan = latest ? plans.get(latest.id) : null;
  const proposals = await all(db, "SELECT id, snapshot_id, proposer, model, content_hash, usage, created_by, created_at FROM model_proposals WHERE snapshot_id IN (SELECT id FROM snapshots WHERE client_id = $1) ORDER BY id", [eng.client_id]);
  for (const p of proposals) { const u = { ...p.usage }; delete u.responses; p.usage = u; }

  // ---- reviews
  const reviews = await all(db, "SELECT id, plan_version_id, cycle, reviewer, pass1_hash, pass2_hash, usage, created_at FROM reviews WHERE engagement_id = $1 ORDER BY id", [eng.id]);
  const notes = await all(db, "SELECT n.* FROM review_notes n JOIN reviews rv ON rv.id = n.review_id WHERE rv.engagement_id = $1 ORDER BY n.id", [eng.id]);
  const byStatus: Record<string, number> = {};
  for (const n of notes) byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;

  // ---- human
  const contradictions = await all(db, "SELECT id, control_ref, subject, materiality, status, chosen_source, resolution, resolved_by, resolved_at, stale_reason FROM contradictions WHERE engagement_id = $1 ORDER BY id", [eng.id]);

  // ---- events scoped to this engagement and its client (tenant isolation)
  const linkIds = await all(db, "SELECT id FROM identity_links WHERE snapshot_id IN (SELECT id FROM snapshots WHERE client_id = $1)", [eng.client_id]);
  const events = scopeEvents(allEvents, {
    client: [eng.client_id], engagement: [eng.id], document: docs.map((d) => d.id), snapshot: snaps.map((s) => s.id), identity_link: linkIds.map((l) => l.id),
    plan_version: versions.map((v) => v.id), review: reviews.map((r) => r.id), review_note: notes.map((n) => n.id), contradiction: contradictions.map((c) => c.id),
  });
  const approvalsList = versions.filter((v) => v.status === "approved" || v.status === "rejected");
  const queue: any[] = [];
  for (const n of notes) {
    if (n.status === "escalated" || n.status === "unverified") {
      queue.push({ kind: "review finding", id: n.id, ref: `#${n.id}`, control: n.control_id, code: n.code, category: n.category, significance: n.significance,
        why: n.rationale.slice(0, 220), action: `disposition ${n.id} --decision accept|dismiss --reason ... --as <approver>`, status: n.status });
    }
  }
  for (const c of contradictions) {
    if ((c.status === "open" || c.status === "stale") && c.materiality === "material") {
      queue.push({ kind: "contradiction", id: c.id, ref: `#${c.id}`, control: c.control_ref, code: c.subject, category: "material contradiction", significance: "high",
        why: c.stale_reason ?? "sources disagree on an operating criterion", action: `resolve ${engagementName} ${c.id} --choose <source> --reason ... --as <approver>`, status: c.status });
    }
  }
  for (const i of identityIssues) {
    if (i.status === "pending") {
      queue.push({ kind: "identity", id: i.id, ref: `#${i.id}`, control: i.control_id, code: "", category: i.issue_type, significance: "medium",
        why: i.resolution ?? JSON.stringify(i.candidates), action: `resolve-identity ${i.id} --decision ... --reason ... --as <approver>`, status: "pending" });
    }
  }
  if (latest && latest.status === "draft") {
    const others = queue.length;
    queue.push({ kind: "approval", id: latest.id, ref: `v${latest.version}`, control: "", code: "", category: "draft plan awaiting approval",
      significance: !latest.blocking && !others ? "high" : "medium",
      why: (latest.blocking ? `${latest.blocking} blocking finding(s) must be cleared first` : "ready: no blocking findings") + (others ? `; ${others} other item(s) open` : ""),
      action: `approve ${engagementName} --note ... --as <approver>`, status: "draft" });
  }

  // ---- nodes
  const acts = (task?: string, stepPrefix?: string, actor?: string) => activities.filter((a) => (!task || a.task === task) && (!stepPrefix || a.step.startsWith(stepPrefix)) && (!actor || a.actor === actor));
  const nodes: any[] = [
    { id: "intake", type: "intake", label: "Document intake", actor: "engine", status: snaps.length ? "complete" : "pending",
      summary: `${docs.length} document(s), ${snaps.length} snapshot(s); pinned snapshot ${eng.snapshot_id}`,
      details: { documents: docs, snapshots: snaps, identity_issues: identityIssues, events: events.filter((e) => ["document.ingest", "snapshot.freeze", "identity.link", "identity.resolve", "engagement.repin"].includes(e.action)) } },
    { id: "planner", type: "agent", label: "Planning Agent", actor: "planner-agent",
      status: latest ? (latest.status === "approved" ? "approved" : "draft") : "pending",
      summary: latest ? `${versions.length} plan version(s); latest v${latest.version} ${latest.status} (${String(latest.proposer).split(":")[0]} proposer)` : "no plan yet",
      details: { plan_versions: versions, proposals, activities: [...acts("planning_revision", "cycle", "planner-agent"), ...acts("planning_revision", undefined, "engine")],
        events: events.filter((e) => e.action.startsWith("plan.draft") || e.action === "engagement.repin"),
        latest_review_summary: latestPlan ? review.summary(latestPlan).counts : null,
        coverage_cells: latestPlan ? latestPlan.coverage_cells : [],
        controls: (latestPlan ? latestPlan.controls : []).map((c: any) => ({ control_id: c.control_id, label: c.ref, module: c.module, systems: c.systems, source: c.source,
          procedures: (c.procedures ?? []).map((p: any) => ({ attribute: p.attribute, status: p.status, criterion_status: p.criterion_status })) })) } },
    { id: "reviewer", type: "agent", label: "Independent Reviewer", actor: "reviewer-agent", status: reviews.length ? "complete" : "pending",
      summary: reviews.length ? `${reviews.length} review pass(es); ${notes.length} finding(s): ` + Object.entries(byStatus).sort().map(([k, v]) => `${k} ${v}`).join(", ") : "not yet run",
      details: { reviews, findings: notes, activities: acts("independent_review"), by_status: byStatus } },
  ];
  const edges: any[] = [{ from: "intake", to: "planner", label: `snapshot ${eng.snapshot_id}`, kind: "flow" }];
  for (const v of versions.filter((x) => x.revision_of)) {
    const cycle = v.review_cycle;
    const sent = notes.filter((n) => n.cycle === cycle && n.status !== "unverified" && ["high", "medium"].includes(n.significance) && n.category !== "human_judgment_question");
    const rid = `revision-${cycle}`;
    const fixedN = sent.filter((n) => n.fix_check?.fixed).length, unfixedN = sent.filter((n) => n.fix_check && !n.fix_check.fixed).length;
    nodes.push({ id: rid, type: "revision", label: `Targeted revision ${cycle}`, actor: "planner-agent", status: "complete",
      summary: `${sent.length} sent · ${fixedN} fixed · ${unfixedN} not demonstrably fixed → plan v${v.version}`,
      details: { findings: sent, plan_version: v, activities: acts("planning_revision", `cycle${cycle}`) } });
    edges.push({ from: "reviewer", to: rid, label: `challenge: ${sent.length} finding(s)`, kind: "challenge" });
    edges.push({ from: rid, to: "planner", label: `plan v${v.version}`, kind: "flow" });
  }
  for (const pvid of [...new Set(reviews.map((r) => r.plan_version_id))].sort((a, b) => a - b)) {
    const v = versions.find((x) => x.id === pvid);
    if (v) edges.push({ from: "planner", to: "reviewer", label: `v${v.version} reviewed`, kind: "flow" });
  }
  nodes.push({ id: "human", type: "human", label: "Human approval", actor: "approver",
    status: latest && latest.status === "approved" ? "approved" : queue.length ? "action required" : "waiting",
    summary: queue.length ? `${queue.length} item(s) in the action queue` : latest && latest.status === "approved" ? `approved v${latest.version} by ${latest.decided_by}` : "nothing pending",
    details: { queue, approvals: approvalsList, contradictions, dispositions: notes.filter((n) => n.status === "accepted_by_human" || n.status === "dismissed_by_human"),
      events: events.filter((e) => ["plan.approve", "plan.reject", "contradiction.resolve", "identity.resolve", "review.disposition"].includes(e.action)) } });
  const esc = notes.filter((n) => n.status === "escalated" || n.status === "unverified");
  if (esc.length) edges.push({ from: "reviewer", to: "human", label: `escalated ${esc.length}`, kind: "escalation" });
  if (latest) edges.push({ from: "planner", to: "human", label: `v${latest.version} ${latest.status}`, kind: "flow" });
  return {
    engagement: { name: eng.name, client_name: eng.client_name, period_start: eng.period_start, period_end: eng.period_end, as_of: eng.as_of,
      methodology_version: eng.methodology_version, methodology_hash: eng.methodology_hash, snapshot_id: eng.snapshot_id, systems: eng.systems,
      modules_in_scope: latestPlan?.engagement.modules_in_scope ?? (eng.modules ?? null),
      modules_out_of_scope: latestPlan?.engagement.modules_out_of_scope ?? [] },
    nodes, edges, action_queue: queue, activities,
  };
}

/** Keep only the events whose entity is owned by this engagement or its client; unknown entity kinds are dropped (deny by
 * default). Server-side file paths are reduced to the file name, since they disclose the host's directory layout. */
export function scopeEvents(events: any[], owned: Record<string, Array<number | string>>): any[] {
  const sets = new Map(Object.entries(owned).map(([k, ids]) => [k, new Set(ids.map(String))]));
  return events
    .filter((e) => sets.get(e.entity)?.has(String(e.entity_id)) ?? false)
    .map((e) => (e.detail && typeof e.detail.path === "string" ? { ...e, detail: { ...e.detail, path: basename(e.detail.path) } } : e));
}

/** Engagements the user is a member of (deny by default). Without a user (the CLI, local tools), every engagement. */
export async function listEngagements(db: Db, user?: string): Promise<any[]> {
  if (user === undefined) return all(db, "SELECT e.name, c.name AS client, e.period_start, e.period_end FROM engagements e JOIN clients c ON c.id = e.client_id ORDER BY e.id");
  return all(db, "SELECT e.name, c.name AS client, e.period_start, e.period_end FROM engagements e JOIN clients c ON c.id = e.client_id JOIN engagement_members m ON m.engagement_id = e.id AND m.user_name = $1 ORDER BY e.id", [user]);
}
