/** Runtime contract for the workspace API.
 *
 * Everything the server returns is treated as untrusted: much of it was written by language models or copied from
 * client documents. At this boundary every response is
 *   - validated against an explicit shape (anything unexpected fails closed with a generic error),
 *   - stripped of fields the UI does not use (zod drops unknown keys, so they never reach the DOM or memory dumps),
 *   - bounded (string lengths, array sizes) so a hostile record cannot freeze the browser,
 *   - neutralised: control and bidirectional-override characters are removed so text cannot visually spoof what an
 *     auditor reads (Trojan Source) or smuggle terminal escapes into a command copied from the page.
 */
import { z } from "zod";

// Zod's JIT compiles validators with `new Function`, which the CSP forbids (no 'unsafe-eval'). Run interpreted.
z.config({ jitless: true });

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F؜‎‏‪-‮⁦-⁩﻿]/g;

export function neutralize(s: string): string {
  return s.replace(CONTROL_CHARS, "");
}

const MAX_TEXT = 50_000;
const MAX_ITEMS = 5_000;

const text = z.string().max(MAX_TEXT).transform(neutralize);
const optText = text.nullish().transform((v) => v ?? null);
const num = z.number().finite();
const optNum = num.nullish().transform((v) => v ?? null);
const idLike = z.union([num, text]).transform(String);
const list = <T extends z.ZodTypeAny>(item: T) => z.array(item).max(MAX_ITEMS).default([]);
/** Free-form JSON (activity detail, refs, usage). Rendered only as text via jsonText(), never as markup. */
const blob = z.unknown();

const csrfToken = z.string().regex(/^[A-Za-z0-9_-]{20,200}$/);
export const ROLES = ["reader", "preparer", "approver", "admin"] as const;
export const sessionUser = z.object({
  name: text.pipe(z.string().min(1).max(100)),
  display_name: text.pipe(z.string().max(200)),
  role: z.enum(ROLES),
  must_change_password: z.boolean().default(false),
});
/** GET /api/me: a browser session also gets its CSRF token back (kept in memory by api/client.ts, never stored). */
export const meResponse = sessionUser.extend({ csrf_token: csrfToken.optional() });
/** csrf_token is kept in memory by api/client.ts; the session token itself is an HttpOnly cookie the page never sees. */
export const signInResponse = z.object({ user: sessionUser, csrf_token: csrfToken, expires_in_seconds: num });
export type SessionUser = z.infer<typeof sessionUser>;
export type Role = SessionUser["role"];

export const clientList = z.array(z.object({ name: text, fiscal_year_end: optText, time_zone: optText })).max(MAX_ITEMS);
export type ClientSummary = z.infer<typeof clientList>[number];

export const methodology = z.object({
  version: text,
  modules: z.array(z.object({ code: z.string().regex(/^[A-Z]{2,5}-[A-Z0-9]{2,6}$/), title: text })).max(100),
});
export type Methodology = z.infer<typeof methodology>;

export const engagementDetail = z.object({
  name: text, client: text, period_start: optText, period_end: optText, as_of: optText, systems: list(text),
  modules_in_scope: list(text), modules_out_of_scope: list(text), methodology_version: text, snapshot_id: optNum,
  stage: text,
  uploads: list(z.object({ id: num, filename: text, status: text, uploaded_by: optText, uploaded_at: optText })),
  latest_plan: z.object({ version: num, status: text, blocking: num, warnings: num }).nullish().transform((v) => v ?? null),
});
export type EngagementDetail = z.infer<typeof engagementDetail>;

export const memberList = z.array(z.object({ name: text, display_name: text, role: text, added_by: optText, added_at: optText })).max(MAX_ITEMS);
export type Member = z.infer<typeof memberList>[number];
export const created = z.object({ name: text });

export const engagementSummary =z.object({ name: text, client: text, period_start: optText, period_end: optText });
export const engagementList = z.array(engagementSummary).max(MAX_ITEMS);

const source = z.object({
  doc: optText, doc_type: optText, doc_id: optNum, doc_sha: optText,
  line: optNum, line_no: optNum, line_end: optNum, quote: optText,
}).nullish().transform((v) => v ?? null);

const event = z.object({ id: idLike, ts: text, actor: text, action: text, entity: text, entity_id: idLike, detail: blob });
const activity = z.object({
  id: idLike, task: text, step: text, actor: text, status: text,
  input_refs: blob, output_refs: blob, detail: blob, started_at: optText, finished_at: optText,
});
const document = z.object({ id: num, title: text, doc_type: text, sha256: text, ingested_by: text, ingested_at: text, line_count: num });
const snapshot = z.object({ id: num, created_by: text, created_at: text, record_hash: text, controls: num, extractor: text, model: optText, pinned: z.boolean() });
const identityIssue = z.object({ id: num, control_id: optText, issue_type: text, status: text, resolution: optText, candidates: blob, decision: optText, resolved_by: optText });
const planVersion = z.object({
  id: num, version: num, status: text, content_hash: text, created_by: text, created_at: text,
  decided_by: optText, decided_at: optText, decision_note: optText, supersedes: optNum, revision_of: optNum, review_cycle: optNum,
  proposer: text, controls: num, mapped_controls: num, blocking: num,
});
const proposal = z.object({ id: num, snapshot_id: num, proposer: text, model: optText, content_hash: text, usage: blob, created_by: text, created_at: text });
const coverageCell = z.object({ system: text, module: text, status: text, controls: list(text), rationale: optText });
const procedure = z.object({ attribute: text, status: text, criterion_status: optText });
const control = z.object({ control_id: text, label: optText, module: optText, systems: list(text), source, procedures: list(procedure) });
const review = z.object({ id: num, plan_version_id: num, cycle: num, reviewer: text, pass1_hash: optText, pass2_hash: optText, usage: blob, created_at: text });
const fixCheck = z.object({ fixed: z.boolean(), basis: optText }).nullish().transform((v) => v ?? null);
const finding = z.object({
  id: num, cycle: num, control_id: optText, code: optText, category: text, significance: text, status: text, verified: z.boolean(),
  rationale: text, suggested_action: optText, source, planner_response: blob, fix_check: fixCheck,
  human_decision: optText, human_by: optText, human_at: optText, created_at: optText,
});
const contradiction = z.object({
  id: num, control_ref: optText, subject: text, materiality: text, status: text,
  chosen_source: optText, resolution: optText, resolved_by: optText, resolved_at: optText, stale_reason: optText,
});
const queueItem = z.object({
  kind: text, id: num, ref: text, control: optText, code: optText, category: text, significance: text, why: optText, action: text, status: text,
});
const counts = z.record(z.string().max(100), num);

const details = z.object({
  documents: list(document), snapshots: list(snapshot), identity_issues: list(identityIssue), events: list(event),
  plan_versions: list(planVersion), proposals: list(proposal), activities: list(activity),
  latest_review_summary: counts.nullish().transform((v) => v ?? null), coverage_cells: list(coverageCell), controls: list(control),
  reviews: list(review), findings: list(finding), by_status: counts.default({}), plan_version: planVersion.nullish().transform((v) => v ?? null),
  queue: list(queueItem), approvals: list(planVersion), contradictions: list(contradiction), dispositions: list(finding),
});

const node = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/), type: text, label: text, actor: text, status: text, summary: text, details,
});
const edge = z.object({ from: text, to: text, label: text, kind: text });

export const workspaceModel = z.object({
  engagement: z.object({
    name: text, client_name: text, period_start: optText, period_end: optText, as_of: optText,
    methodology_version: text, methodology_hash: optText, snapshot_id: optNum, systems: list(text),
    modules_in_scope: list(text), modules_out_of_scope: list(text),
  }),
  nodes: z.array(node).max(100),
  edges: z.array(edge).max(500),
  action_queue: list(queueItem),
  activities: list(activity),
});

export type EngagementSummary = z.infer<typeof engagementSummary>;
export type WorkspaceModel = z.infer<typeof workspaceModel>;
export type WorkspaceNode = WorkspaceModel["nodes"][number];
export type NodeDetails = WorkspaceNode["details"];
export type Finding = NodeDetails["findings"][number];
export type QueueItem = WorkspaceModel["action_queue"][number];
export type Activity = WorkspaceModel["activities"][number];
export type AuditEvent = NodeDetails["events"][number];
export type PlanVersion = NodeDetails["plan_versions"][number];
export type Contradiction = NodeDetails["contradictions"][number];
export type SourceRef = Finding["source"];
