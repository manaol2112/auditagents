/** Presentational primitives on the design tokens in styles.css. All content is rendered as React text children
 * (auto-escaped); nothing here accepts or produces markup. */
import type { ReactNode } from "react";
import type { Activity, AuditEvent, SourceRef } from "../api/schema.ts";
import { STAGES, humanize, isEmptyBlob, jsonText, refs, shortHash, stageIndex, tone, when, type Tone } from "../lib/format.ts";

const BADGE: Record<Tone, string> = { ok: "badge-success", warn: "badge-warning", bad: "badge-danger", accent: "badge-accent", neutral: "" };

export function Badge({ children, t, plain }: { children: ReactNode; t?: Tone; plain?: boolean }) {
  return <span className={`badge ${BADGE[t ?? "neutral"]}${plain ? " badge-plain" : ""}`}>{children}</span>;
}

/** A status word from the engine, in plain language and coloured by meaning. */
export function Status({ s, label }: { s: string | null | undefined; label?: string }) {
  if (!s) return null;
  return <Badge t={tone(s)}>{label ?? sentence(humanize(s))}</Badge>;
}

export const sentence = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

/** A control or code reference. The engine's placeholders, such as "(omitted control)", read as text, not as a code. */
export function Ref({ v }: { v: string | null | undefined }) {
  if (!v) return null;
  if (/^\(.*\)$/.test(v)) return <span className="placeholder-id">{sentence(v.slice(1, -1))}</span>;
  return <Tag>{v}</Tag>;
}

export function Hash({ h }: { h: string | null | undefined }) {
  if (!h) return null;
  return <span className="mono subtle" title={h}>{shortHash(h)}</span>;
}

export function PageHeader({ eyebrow, title, description, actions, children }: {
  eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Section({ title, count, description, actions, children }: {
  title: string; count?: number; description?: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}{count !== undefined && <span className="count">{count}</span>}</h2>
        {actions && <div className="push">{actions}</div>}
      </div>
      {description && <p className="section-desc">{description}</p>}
      {children}
    </section>
  );
}

export function Panel({ title, actions, children, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <div className="panel">
      {title && <div className="panel-head"><h3>{title}</h3>{actions}</div>}
      {pad ? <div className="panel-body">{children}</div> : children}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function EmptyInline({ children }: { children: ReactNode }) {
  return <p className="empty-inline">{children}</p>;
}

export function Field({ label, hint, error, children, id }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; id: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="field-error" id={`${id}-error`} role="alert">{error}</span> : hint ? <span className="field-hint" id={`${id}-hint`}>{hint}</span> : null}
    </div>
  );
}

/** aria props tying an input to its hint or error. */
export const describe = (id: string, error?: string | null, hint?: boolean) => ({
  "aria-invalid": error ? (true as const) : undefined,
  "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
});

export function Stat({ label, value, sub, danger }: { label: string; value: ReactNode; sub?: ReactNode; danger?: boolean }) {
  return (
    <div className={`stat${danger ? " stat-danger" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Stepper({ stage }: { stage: string }) {
  const at = stageIndex(stage);
  return (
    <div className="section">
      <p className="small muted">Step {at + 1} of {STAGES.length}: <b className="nowrap">{STAGES[at]!.label}</b></p>
      <ol className="stepper" aria-label="Engagement progress">
        {STAGES.map((s, i) => (
          <li key={s.key} className={`step${i < at ? " step-done" : i === at ? " step-current" : ""}`} aria-current={i === at ? "step" : undefined}>
            <span className="step-bar" />
            <span className="step-label hide-sm">{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Source({ s }: { s: SourceRef }) {
  if (!s) return null;
  const doc = s.doc_type ?? s.doc ?? (s.doc_id !== null ? `document ${s.doc_id}` : "");
  const line = s.line_no ?? s.line;
  const range = line !== null ? ` line ${line}${s.line_end && s.line_end !== line ? `–${s.line_end}` : ""}` : "";
  return (
    <blockquote className="quote">
      <cite>{sentence(doc)}{range}</cite>
      {s.quote && <span>“{s.quote.slice(0, 400)}”</span>}
    </blockquote>
  );
}

export function Json({ v, label = "Details" }: { v: unknown; label?: string }) {
  if (isEmptyBlob(v)) return null;
  return (
    <details className="disclosure">
      <summary>{label}</summary>
      <pre className="json">{jsonText(v)}</pre>
    </details>
  );
}

export function ActivityList({ items }: { items: Activity[] }) {
  if (!items.length) return <EmptyInline>No activity recorded yet.</EmptyInline>;
  return (
    <ol className="timeline">
      {items.map((a) => (
        <li key={a.id}>
          <time>{when(a.started_at)}</time>
          <div>
            <div className="row-head"><b>{sentence(humanize(a.step))}</b><Status s={a.status} /><span className="muted xs">{a.actor} · {humanize(a.task)}</span></div>
            <div className="mono subtle xs wrap">in: {refs(a.input_refs)}{!isEmptyBlob(a.output_refs) && <> · out: {refs(a.output_refs)}</>}</div>
            <Json v={a.detail} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EventList({ items }: { items: AuditEvent[] }) {
  if (!items.length) return <EmptyInline>No events recorded yet.</EmptyInline>;
  return (
    <ol className="timeline">
      {items.map((e) => (
        <li key={e.id}>
          <time>{when(e.ts)}</time>
          <div>
            <div className="row-head"><b>{e.action}</b><span className="muted xs">{e.entity} {e.entity_id} · {e.actor}</span></div>
            <Json v={e.detail} />
          </div>
        </li>
      ))}
    </ol>
  );
}
