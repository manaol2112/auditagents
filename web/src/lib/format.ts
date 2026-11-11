/** Display helpers. Everything returns plain strings for React to render as text (never markup). */
import { neutralize } from "../api/schema.ts";

export const shortHash = (h: string | null | undefined): string => (h ? h.slice(0, 12) : "");

/** "2026-11-06T23:26:02.123Z" -> "2026-11-06 23:26". Unknown formats are passed through, trimmed. */
export function when(ts: string | null | undefined): string {
  if (!ts) return "";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(ts);
  return m ? `${m[1]} ${m[2]}` : ts.slice(0, 19);
}

export function period(start: string | null, end: string | null): string {
  return start && end ? `${start} → ${end}` : start || end || "";
}

/** Free-form JSON from the API as bounded, neutralised text, for display inside <code>. */
export function jsonText(v: unknown, max = 4_000): string {
  if (v === null || v === undefined) return "";
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v, null, 1);
  } catch {
    return "[unrenderable]";
  }
  s = neutralize(s ?? "");
  return s.length > max ? s.slice(0, max) + " …" : s;
}

export const isEmptyBlob = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "object" && Object.keys(v as object).length === 0);

/** "a=1, b=[2,3]" for activity input/output references. */
export function refs(v: unknown): string {
  if (Array.isArray(v)) return v.map(refs).join(", ");
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}=${typeof x === "object" ? jsonText(x, 200) : String(x)}`)
      .join(", ");
  }
  return v === null || v === undefined ? "" : neutralize(String(v));
}

export type Tone = "ok" | "warn" | "bad" | "accent" | "neutral";

const TONES: Record<string, Tone> = {
  complete: "ok", completed: "ok", approved: "ok", resolved: "ok", fixed: "ok", accepted_by_human: "ok", auto: "ok",
  "action required": "warn", draft: "warn", open: "warn", stale: "warn", pending: "warn", rejected_by_planner: "warn", medium: "warn",
  escalated: "bad", unverified: "bad", rejected: "bad", failed: "bad", high: "bad", "unresolved coverage gap": "bad",
  accepted_by_planner: "accent", running: "accent",
};

export const tone = (status: string | null | undefined): Tone => (status ? TONES[status] ?? "neutral" : "neutral");

const SIGNIFICANCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
export const bySignificance = <T extends { significance: string }>(a: T, b: T): number =>
  (SIGNIFICANCE_ORDER[a.significance] ?? 3) - (SIGNIFICANCE_ORDER[b.significance] ?? 3);

export const humanize = (s: string): string => s.replace(/_/g, " ");

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------- engagement lifecycle and roles

export const STAGES = [
  { key: "setup", label: "Set up" },
  { key: "rcm_uploaded", label: "RCM uploaded" },
  { key: "mapping_confirmed", label: "Mapping confirmed" },
  { key: "extracted", label: "Controls extracted" },
  { key: "planned", label: "Plan drafted" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
] as const;

export function stageIndex(stage: string | null | undefined): number {
  const i = STAGES.findIndex((s) => s.key === stage);
  return i < 0 ? 0 : i;
}
export const stageLabel = (stage: string | null | undefined): string => STAGES[stageIndex(stage)]!.label;

export const ROLE_LABEL: Record<string, string> = { reader: "Reader", preparer: "Preparer", approver: "Approver", admin: "Administrator" };
export const roleLabel = (r: string): string => ROLE_LABEL[r] ?? humanize(r);
/** Who may create engagements: preparers and approvers. Administrators manage people, not audit work. */
export const canPrepare = (role: string): boolean => role === "preparer" || role === "approver";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "")).toUpperCase();
}

/** Display a YYYY-MM-DD date as "30 Jun 2026" without time-zone shifts. */
export function day(d: string | null | undefined): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}
export const dayRange = (a: string | null, b: string | null): string => (a && b ? `${day(a)} – ${day(b)}` : day(a) || day(b));
