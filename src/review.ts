/** Actionable review output: group, classify, and deduplicate findings without changing their severity.
 *
 * Three buckets:
 *   blocking    approval is refused until resolved (every validation finding with severity 'blocking'; never downgraded)
 *   judgment    a human must decide something (coverage treatment, risk mapping, unverified criteria, design gaps,
 *               immaterial contradictions, applicability)
 *   info        walkthrough questions and proposer notes that need facts, not decisions
 * Deduplication merges findings that say the same thing about the same control, issue, and criterion; every merged
 * finding keeps the original texts under `sources`.
 */
import { ATTRIBUTE_CRITERION } from "./planning.js";

const JUDGMENT_KINDS = new Set(["out of scope module", "coverage", "risk mismatch", "unverified criterion", "source unverified", "unknown module", "contradiction unverified", "unknown risk reference", "unmapped control", "design gap"]);

export const ISSUE_LABELS: Record<string, string> = {
  contradiction: "Contradictory client sources", identity: "Control identity", coverage: "Coverage decision needed",
  "risk mismatch": "Risk mapping to confirm", "unverified criterion": "Proposer criterion not supported by cited line",
  "source unverified": "Control description not verified against documents", "unknown module": "Unknown module code", "out of scope module": "Mapped to a module outside the engagement scope",
  "contradiction unverified": "Proposed contradiction not verifiable", "unknown risk reference": "Unknown risk reference",
  "unmapped control": "Control maps to no module in scope", "design gap": "Potential design gap",
  "criterion not defined": "Criterion not defined by the client (walkthrough question)", "proposer gap": "Proposer information gap",
  "proposer omission": "Proposer omitted an expectation (filled as none)", validation: "Structural validation",
};

const ATTR_RE = /\b([A-Z]{2,4}-(?:DE)?[A-Z0-9]{1,2})\b/;
const FIELD_RE = /'([a-z_]+)'/;

function criterionKey(text: string): string {
  const m = ATTR_RE.exec(text);
  if (m) return m[1];
  const f = FIELD_RE.exec(text);
  return f ? f[1] : "";
}

export interface Group { bucket: string; control: string; issue: string; label: string; criterion: string; text: string; sources: { origin: string; text: string }[]; count: number }
export type Buckets = { blocking: Group[]; judgment: Group[]; info: Group[] };

/** {'blocking': [...], 'judgment': [...], 'info': [...]} of grouped, deduplicated findings. */
export function classify(plan: any): Buckets {
  const groups = new Map<string, Group>();
  const add = (bucket: string, control: string | null | undefined, kind: string, criterion: string, text: string, origin: string) => {
    const ctrl = control || "engagement";
    const key = [bucket, ctrl, kind, criterion].join("\0");
    let g = groups.get(key);
    if (!g) { g = { bucket, control: ctrl, issue: kind, label: ISSUE_LABELS[kind] ?? kind, criterion, text, sources: [], count: 0 }; groups.set(key, g); }
    g.sources.push({ origin, text });
  };
  // Validation findings carry the authoritative severity. Blocking stays blocking.
  for (const f of plan.validation) {
    if (f.severity !== "blocking") continue;
    const control = ["pins", "engagement"].includes(f.where) ? null : f.where.split("/")[0];
    const kind = f.code === "V6" ? "contradiction" : f.code === "V10" ? "identity" : "validation";
    let crit = criterionKey(f.where) || criterionKey(f.text);
    if (kind === "contradiction") {
      // Group by the contradicted field, so the attribute-level and field-level findings merge.
      crit = crit in ATTRIBUTE_CRITERION ? ATTRIBUTE_CRITERION[crit][0] : f.where.includes("/") ? f.where.split("/").pop()! : crit;
    }
    add("blocking", control, kind, crit, `${f.code} ${f.where}: ${f.text}`, `validation:${f.code}`);
  }
  // Gaps (the planner's own findings) feed the other two buckets; blocking gaps were already captured above.
  for (const g of plan.information_gaps) {
    if (g.severity === "blocking") continue;
    const kind = g.kind;
    let bucket = JUDGMENT_KINDS.has(kind) ? "judgment" : "info";
    if (kind === "identity" && g.severity === "info") bucket = "info";
    add(bucket, g.control, kind, criterionKey(g.text), g.text, `gap:${kind}`);
  }
  // Potential design gaps come from coverage units, not from gaps.
  const labelToId = new Map<string, string>(plan.controls.map((pc: any) => [pc.ref, pc.control_id ?? pc.ref]));
  for (const u of plan.coverage_units) {
    if (!u.potential_design_gap) continue;
    const ctrls = [...new Set<string>(u.contributions.map((c: any) => labelToId.get(c.control) ?? c.control))].sort().join(", ") || "none";
    add("judgment", ctrls, "design gap", u.expectation,
      `${u.system}/${u.module}/${u.expectation} is ${u.assessment} (contributions: ${u.contributions.map((c: any) => `${c.control}=${c.value}`).join(", ")}); confirm necessity and outcome at the walkthrough.`, "coverage_unit");
  }
  const out: Buckets = { blocking: [], judgment: [], info: [] };
  for (const g of groups.values()) { g.count = g.sources.length; (out as any)[g.bucket].push(g); }
  return out;
}

export interface Summary { counts: Record<string, number>; raw_counts: { blocking: number; warnings: number }; per_control: Record<string, any>; buckets: Buckets; approvable: boolean }

export function summary(plan: any): Summary {
  const buckets = classify(plan);
  const perControl: Record<string, any> = {};
  for (const pc of plan.controls) {
    const cid = pc.control_id ?? pc.ref;
    perControl[cid] ??= { label: pc.ref, module: [], blocking: 0, judgment: 0, info: 0 };
    if (pc.module && !perControl[cid].module.includes(pc.module)) perControl[cid].module.push(pc.module);
  }
  for (const [bucket, items] of Object.entries(buckets)) {
    for (const g of items) for (const ctrl of g.control.split(", ")) (perControl[ctrl] ??= { label: ctrl, module: [], blocking: 0, judgment: 0, info: 0 })[bucket] += 1;
  }
  return {
    counts: { blocking: buckets.blocking.length, judgment: buckets.judgment.length, info: buckets.info.length },
    raw_counts: { blocking: plan.validation.filter((f: any) => f.severity === "blocking").length, warnings: plan.validation.filter((f: any) => f.severity === "warning").length },
    per_control: perControl, buckets, approvable: buckets.blocking.length === 0,
  };
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
const rpad = (s: string | number, n: number) => String(s).padStart(n);

export function formatSummary(plan: any, full = false): string {
  const s = summary(plan);
  const c = s.counts;
  const lines = [`Review summary for ${plan.engagement.name} (proposer ${plan.proposer ?? "rules"})`,
    `  Approvable now: ${s.approvable ? "yes" : "no"}. ${c.blocking} blocking item(s), ${c.judgment} decision(s) for the approver, ${c.info} walkthrough question(s)/note(s).`,
    `  (${s.raw_counts.blocking} blocking and ${s.raw_counts.warnings} warning validation findings before grouping.)`, ""];
  lines.push("  Control (label)                 Modules            Blocking  Decide  Info");
  for (const [cid, pc] of Object.entries<any>(s.per_control)) {
    const name = pc.label !== cid ? `${cid} (${pc.label})` : cid;
    lines.push(`  ${pad(name, 31)} ${pad(pc.module.join(",") || "-", 18)} ${rpad(pc.blocking, 8)}  ${rpad(pc.judgment, 6)}  ${rpad(pc.info, 4)}`);
  }
  for (const [bucket, title] of [["blocking", "BLOCKING (resolve before approval)"], ["judgment", "DECISIONS FOR THE APPROVER"], ["info", "WALKTHROUGH QUESTIONS AND NOTES"]] as const) {
    const items = s.buckets[bucket];
    if (!items.length) continue;
    lines.push(`\n${title}: ${items.length}`);
    const shown = full || bucket === "blocking" ? items : items.slice(0, 8);
    for (const g of shown) {
      const crit = g.criterion ? ` [${g.criterion}]` : "";
      const dup = g.count > 1 ? ` (x${g.count})` : "";
      lines.push(`  - ${g.control}${crit}: ${g.label}${dup}`);
      lines.push(`      ${g.text.slice(0, 200)}`);
      if (full && g.count > 1) for (const src of g.sources.slice(1)) lines.push(`      also (${src.origin}): ${src.text.slice(0, 160)}`);
    }
    if (!full && items.length > shown.length) lines.push(`  ... ${items.length - shown.length} more; use --findings for all`);
  }
  return lines.join("\n");
}
