import { useState } from "react";
import type { QueueItem, WorkspaceModel } from "../api/schema.ts";
import { Badge, EmptyInline, Ref, Section, Status, sentence } from "../components/ui.tsx";
import { bySignificance, day, humanize, tone } from "../lib/format.ts";
import { FindingRows } from "./Findings.tsx";

const KIND_LABEL: Record<string, string> = {
  "review finding": "Review findings", contradiction: "Contradictions", identity: "Control identity", approval: "Plan approval",
};

function DecisionRow({ q }: { q: QueueItem }) {
  return (
    <details className="list-item-details">
      <summary className="list-item">
        <span className={`dot ${q.significance === "high" ? "dot-danger" : "dot-warning"}`} aria-hidden="true" />
        <span className="list-item-main">
          <span className="list-item-title">{sentence(q.kind)} {q.ref}<Ref v={q.control} /><Ref v={q.code} /></span>
          <span className="list-item-text">{sentence(humanize(q.category))}</span>
        </span>
        <span className="row-head"><Status s={q.status} /><Status s={q.significance} label={sentence(q.significance)} /></span>
      </summary>
      <div className="list-item-body">
        {q.why && <p>{q.why}</p>}
        <dl className="detail-grid">
          <dt>Who decides</dt><dd>An approver on this engagement. The decision and its reason go into the audit trail.</dd>
          <dt>From the command line</dt><dd><div className="cmd">soxplan {q.action}</div></dd>
        </dl>
        <p className="xs muted">Deciding from the web app is the next feature being built; until then the command above records the decision.</p>
      </div>
    </details>
  );
}

export function ActionQueue({ model }: { model: WorkspaceModel }) {
  const human = model.nodes.find((n) => n.id === "human")?.details;
  const kinds = [...new Set(model.action_queue.map((q) => q.kind))];
  const [kind, setKind] = useState<string | null>(null);
  const items = model.action_queue.filter((q) => !kind || q.kind === kind).sort(bySignificance);

  return (
    <>
      <Section title="Waiting on a person" count={model.action_queue.length}
        description="Each item blocks approval of the plan until an approver decides it. High-significance items first."
        actions={kinds.length > 1 ? (
          <div className="seg" role="group" aria-label="Filter by kind">
            <button type="button" aria-pressed={!kind} onClick={() => setKind(null)}>All</button>
            {kinds.map((k) => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k] ?? sentence(k)}</button>)}
          </div>
        ) : undefined}>
        {items.length ? <div className="list">{items.map((q) => <DecisionRow key={`${q.kind}-${q.id}`} q={q} />)}</div>
          : <div className="panel"><EmptyInline>Nothing is waiting on a person.</EmptyInline></div>}
      </Section>

      {human && <>
        <Section title="Contradictions" count={human.contradictions.length} description="Where the client's documents disagree on an operating criterion.">
          {human.contradictions.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Control</th><th>Subject</th><th>Materiality</th><th>Status</th><th className="hide-sm">Resolution</th></tr></thead>
              <tbody>{human.contradictions.map((c) => (
                <tr key={c.id}>
                  <td><Ref v={c.control_ref} /></td>
                  <td>{c.subject}</td>
                  <td><Badge t={c.materiality === "material" ? "warn" : "neutral"} plain>{sentence(c.materiality)}</Badge></td>
                  <td><Status s={c.status} /></td>
                  <td className="hide-sm small">{c.resolution ? <><b>{c.resolved_by}</b> chose {c.chosen_source}: {c.resolution}</> : c.stale_reason ?? <span className="muted">Not resolved</span>}</td>
                </tr>))}</tbody>
            </table></div>
          ) : <div className="panel"><EmptyInline>No contradictions recorded.</EmptyInline></div>}
        </Section>

        <Section title="Approval decisions" count={human.approvals.length}>
          {human.approvals.length ? <div className="list">{human.approvals.map((v) => (
            <div key={v.id} className="list-item">
              <span className={`dot ${tone(v.status) === "bad" ? "dot-danger" : "dot-success"}`} aria-hidden="true" />
              <span className="list-item-main">
                <span className="list-item-title">Plan v{v.version} <Status s={v.status} /></span>
                {v.decision_note && <span className="list-item-text">{v.decision_note}</span>}
              </span>
              <span className="xs muted nowrap">{v.decided_by} · {day(v.decided_at)}</span>
            </div>))}</div> : <div className="panel"><EmptyInline>No approval decisions yet.</EmptyInline></div>}
        </Section>

        <Section title="Finding dispositions" count={human.dispositions.length}>
          {human.dispositions.length ? <FindingRows findings={human.dispositions} />
            : <div className="panel"><EmptyInline>No findings have been decided by a person yet.</EmptyInline></div>}
        </Section>
      </>}
    </>
  );
}
