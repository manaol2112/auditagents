/** Stable control identity.
 *
 * A control's identity must survive a model relabelling it, a document gaining lines above it, and a
 * re-extraction. It must not survive the control's text changing without a human noticing.
 *
 * Rules
 *   client identifier   the control's reference appears in the client's own documents on the cited source
 *                       line(s), so it is the client's identifier: control_id = that ref.
 *   provisional         otherwise: control_id = 'P-' + hash(doc_type, normalized text of the cited source lines).
 *                       Line numbers are not part of the hash, so an inserted line above does not change it;
 *                       a change to the control's own words does.
 *   duplicate           two controls in one snapshot resolve to the same control_id.
 *   identifier conflict a reference that exists in the documents is used for a control whose cited lines do
 *                       not contain it (the model borrowed a label).
 * Links to the prior snapshot are exact, proposed (one similar prior control), ambiguous (several), or new.
 * Everything but exact is pending until a human resolves it.
 */
import { recordEvent, requireRole } from "./audit.js";
import { Db, EngineError, j, now, one, all, sha256 } from "./db.js";

export interface IdentityIssue { issue_type: string; detail: string }
export interface ExtractedControl {
  ref: string; description: string; doc_id: number; line_no: number; line_end?: number; systems?: string[];
  control_id: string; identity_basis: "client" | "provisional"; identity_issues: IdentityIssue[]; source_text: string; source_key: string;
  [k: string]: any;
}
export interface DocText { id: number; doc_type: string; lines: Record<number, string> }

export function norm(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function words(text: string): Set<string> {
  return new Set(norm(text).split(" ").filter((w) => w.length > 3));
}

export function provisionalId(docType: string, sourceText: string): string {
  return "P-" + sha256(`${docType}|${norm(sourceText)}`).slice(0, 10);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function refInText(ref: string, text: string): boolean {
  const r = norm(ref);
  return Boolean(r) && new RegExp(`(?<![a-z0-9])${escapeRe(r)}(?![a-z0-9])`).test(norm(text));
}

/** Set control_id, identity_basis, and identity issues on each extracted control. */
export function assign(controls: any[], docs: DocText[]): ExtractedControl[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const allText = docs.flatMap((d) => Object.values(d.lines)).join("\n");
  const seen = new Map<string, number>();
  for (const c of controls) {
    const d = byId.get(c.doc_id);
    const ls = c.line_no, le = c.line_end || c.line_no;
    let src = "";
    if (d) {
      const parts: string[] = [];
      for (let n = ls; n <= le; n++) parts.push(d.lines[n] ?? "");
      src = parts.join(" ");
    }
    c.source_text = src;
    c.identity_issues = [];
    const ref = (c.ref ?? "").trim();
    if (ref && d && refInText(ref, src)) {
      c.control_id = ref; c.identity_basis = "client";
    } else {
      if (ref && refInText(ref, allText)) {
        c.identity_issues.push({ issue_type: "identifier_conflict", detail: `reference '${ref}' exists in the documents but not on the cited lines ${ls}-${le}; a provisional identity is used until a human decides` });
      }
      c.control_id = provisionalId(d ? d.doc_type : "unknown", src || c.description); c.identity_basis = "provisional";
    }
    c.source_key = provisionalId(d ? d.doc_type : "unknown", src || c.description);
    const n = (seen.get(c.source_key) ?? 0) + 1;
    seen.set(c.source_key, n);
    if (n > 1) {
      const first = controls.find((x) => x.source_key === c.source_key);
      const base = first.control_id.split("#")[0];
      c.identity_issues.push({ issue_type: "duplicate", detail: `cites the same source lines as ${first.control_id} (${first.ref}); kept as ${base}#${n} until a human merges or separates them` });
      c.control_id = `${base}#${n}`;
    }
  }
  return controls as ExtractedControl[];
}

export function similarity(a: { description: string; systems?: string[] }, b: { description: string; systems?: string[] }): number {
  const wa = words(a.description), wb = words(b.description);
  if (!wa.size || !wb.size) return 0;
  const inter = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  const sa = new Set(a.systems ?? []), sb = new Set(b.systems ?? []);
  const bonus = sa.size && sb.size && [...sa].some((s) => sb.has(s)) ? 0.1 : 0;
  return Math.min(1, inter / union + bonus);
}

/** Write identity_links for a new snapshot against the latest prior frozen snapshot of the client. */
export async function linkToPrior(db: Db, actor: string, clientId: number, snapshotId: number, controls: ExtractedControl[]): Promise<any[]> {
  const prior = await one(db, "SELECT id FROM snapshots WHERE client_id = $1 AND id < $2 AND record_hash <> 'pending' ORDER BY id DESC LIMIT 1", [clientId, snapshotId]);
  const issues: any[] = [];
  const priorControls = prior ? await all(db, "SELECT control_id, ref, description, systems FROM controls WHERE snapshot_id = $1", [prior.id]) : [];
  const priorIds = new Set(priorControls.map((p) => p.control_id));
  for (const c of controls) {
    const baseId = c.control_id.split("#")[0];
    for (const iss of c.identity_issues) {
      await db.query("INSERT INTO identity_links (snapshot_id, control_id, issue_type, prior_snapshot_id, prior_control_id, candidates, score, status, resolution) VALUES ($1,$2,$3,$4,NULL,'[]',NULL,'pending',$5)",
        [snapshotId, c.control_id, iss.issue_type, prior ? prior.id : null, iss.detail]);
      issues.push({ control_id: c.control_id, ...iss });
    }
    if (!prior) continue;
    if (priorIds.has(baseId) && !c.control_id.includes("#")) {
      await db.query("INSERT INTO identity_links (snapshot_id, control_id, issue_type, prior_snapshot_id, prior_control_id, status) VALUES ($1,$2,'exact',$3,$4,'auto')", [snapshotId, c.control_id, prior.id, baseId]);
      continue;
    }
    const scored = priorControls.map((p) => [similarity(c, p as any), p] as const).sort((x, y) => y[0] - x[0]);
    const top = scored.filter(([s]) => s >= 0.5);
    if (!top.length) {
      await db.query("INSERT INTO identity_links (snapshot_id, control_id, issue_type, prior_snapshot_id, status) VALUES ($1,$2,'new',$3,'auto')", [snapshotId, c.control_id, prior.id]);
    } else if (top.length === 1 || top[0][0] - top[1][0] >= 0.15) {
      const [s, p] = top[0];
      await db.query("INSERT INTO identity_links (snapshot_id, control_id, issue_type, prior_snapshot_id, prior_control_id, candidates, score, status) VALUES ($1,$2,'proposed_match',$3,$4,$5,$6,'pending')",
        [snapshotId, c.control_id, prior.id, p.control_id, j([p.control_id]), s]);
      issues.push({ control_id: c.control_id, issue_type: "proposed_match", detail: `resembles prior control ${p.control_id} (${p.ref}, similarity ${s.toFixed(2)}); confirm or reject` });
    } else {
      const cands = top.slice(0, 3).map(([, p]) => p.control_id);
      await db.query("INSERT INTO identity_links (snapshot_id, control_id, issue_type, prior_snapshot_id, candidates, score, status) VALUES ($1,$2,'ambiguous_match',$3,$4,$5,'pending')",
        [snapshotId, c.control_id, prior.id, j(cands), top[0][0]]);
      issues.push({ control_id: c.control_id, issue_type: "ambiguous_match", detail: `resembles several prior controls ${JSON.stringify(cands)}; a human must choose` });
    }
  }
  await recordEvent(db, actor, "identity.link", "snapshot", snapshotId, { prior_snapshot: prior ? prior.id : null, pending_issues: issues.length });
  return issues;
}

export async function pendingIssues(db: Db, snapshotId: number): Promise<any[]> {
  return all(db, "SELECT * FROM identity_links WHERE snapshot_id = $1 AND status = 'pending' ORDER BY id", [snapshotId]);
}

/** control_id -> {effective: id to use, merged_into: id or null} after human resolutions. */
export async function effectiveIds(db: Db, snapshotId: number): Promise<Record<string, { effective: string; merged_into: string | null }>> {
  const out: Record<string, { effective: string; merged_into: string | null }> = {};
  for (const r of await all(db, "SELECT * FROM identity_links WHERE snapshot_id = $1 AND status = 'resolved'", [snapshotId])) {
    const e = (out[r.control_id] ??= { effective: r.control_id, merged_into: null });
    if ((r.issue_type === "proposed_match" || r.issue_type === "ambiguous_match") && r.decision === "confirm" && r.prior_control_id) e.effective = r.prior_control_id;
    if (r.issue_type === "identifier_conflict" && r.decision === "accept_ref" && (r.resolution ?? "").includes("accept_ref:")) {
      e.effective = r.resolution.split("accept_ref:", 2)[1].split("|")[0];
    }
    if (r.issue_type === "duplicate" && r.decision === "merge") e.merged_into = r.control_id.split("#")[0];
  }
  return out;
}

const ALLOWED: Record<string, string[]> = {
  proposed_match: ["confirm", "reject"], ambiguous_match: ["confirm", "reject"],
  duplicate: ["merge", "separate"], identifier_conflict: ["accept_ref", "keep_provisional"],
};

export async function resolve(db: Db, actor: string, linkId: number, decision: string, reason: string, choose?: string): Promise<void> {
  await requireRole(db, actor, "approver");
  const row = await one(db, "SELECT * FROM identity_links WHERE id = $1", [linkId]);
  if (!row) throw new EngineError("unknown identity issue");
  if (row.status !== "pending") throw new EngineError("identity issue is not pending");
  if (!reason || !reason.trim()) throw new EngineError("a resolution needs the resolver's reasoning");
  const allowed = ALLOWED[row.issue_type] ?? [];
  if (!allowed.includes(decision)) throw new EngineError(`decision must be one of ${JSON.stringify([...allowed].sort())} for ${row.issue_type}`);
  let priorId = row.prior_control_id;
  let resolution = reason;
  if (row.issue_type === "ambiguous_match" && decision === "confirm") {
    const cands: string[] = row.candidates;
    if (!choose || !cands.includes(choose)) throw new EngineError(`--choose must be one of ${JSON.stringify(cands)}`);
    priorId = choose;
  }
  if (row.issue_type === "identifier_conflict" && decision === "accept_ref") {
    const c = await one(db, "SELECT ref FROM controls WHERE snapshot_id = $1 AND control_id = $2", [row.snapshot_id, row.control_id]);
    resolution = `accept_ref:${c?.ref}|${reason}`;
  }
  await db.query("UPDATE identity_links SET status = 'resolved', decision = $1, prior_control_id = $2, resolution = $3, resolved_by = $4, resolved_at = $5 WHERE id = $6",
    [decision, priorId, resolution, actor, now(), linkId]);
  await recordEvent(db, actor, "identity.resolve", "identity_link", linkId, { decision, control_id: row.control_id, prior: priorId, reason });
}

/** Hash of what a contradiction is about: the documents' content hashes and the canonical values, not line numbers. */
export function sourcesHash(sources: { value: string; source?: { doc_sha?: string } }[]): string {
  const items = sources.map((s) => [s.source?.doc_sha ?? "", norm(s.value)] as [string, string]).sort((a, b) => (a[0] + "\0" + a[1] < b[0] + "\0" + b[1] ? -1 : 1));
  return sha256(JSON.stringify(items)).slice(0, 16);
}
