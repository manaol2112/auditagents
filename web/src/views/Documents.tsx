import type { WorkspaceModel } from "../api/schema.ts";
import { Badge, EmptyInline, EventList, Hash, Section, Status, Tag, sentence } from "../components/ui.tsx";
import { humanize, jsonText, when } from "../lib/format.ts";

export function Documents({ model }: { model: WorkspaceModel }) {
  const d = model.nodes.find((n) => n.id === "intake")?.details;
  if (!d || (!d.documents.length && !d.snapshots.length)) {
    return <div className="panel"><EmptyInline>No client documents yet. They appear here once the risk and control matrix is uploaded.</EmptyInline></div>;
  }
  return (
    <>
      <Section title="Source documents" count={d.documents.length} description="Stored line by line with their SHA-256 fingerprint, and treated as data, never as instructions.">
        <div className="table-wrap"><table>
          <thead><tr><th>Document</th><th>Type</th><th className="num">Lines</th><th className="hide-sm">Fingerprint</th><th className="hide-sm">Added</th></tr></thead>
          <tbody>{d.documents.map((x) => (
            <tr key={x.id}><td className="cell-title">{x.title}</td><td><Badge plain>{sentence(x.doc_type)}</Badge></td><td className="num">{x.line_count}</td>
              <td className="hide-sm"><Hash h={x.sha256} /></td><td className="hide-sm muted xs nowrap">{x.ingested_by} · {when(x.ingested_at)}</td></tr>))}</tbody>
        </table></div>
      </Section>

      <Section title="Snapshots" count={d.snapshots.length} description="Each extraction is frozen as an immutable snapshot; the engagement plans from the one marked in use.">
        <div className="table-wrap"><table>
          <thead><tr><th>Snapshot</th><th>Extracted by</th><th className="num">Controls</th><th className="hide-sm">Fingerprint</th><th>Status</th></tr></thead>
          <tbody>{d.snapshots.map((s) => (
            <tr key={s.id}><td>{s.id}</td><td>{sentence(s.extractor)}{s.model && <span className="muted xs"> · {s.model}</span>}</td><td className="num">{s.controls}</td>
              <td className="hide-sm"><Hash h={s.record_hash} /></td><td>{s.pinned ? <Badge t="ok">In use</Badge> : <span className="muted xs">{when(s.created_at)}</span>}</td></tr>))}</tbody>
        </table></div>
      </Section>

      <Section title="Control identity" count={d.identity_issues.length} description="Where a control's identity across snapshots needs a person to confirm it.">
        {d.identity_issues.length ? <div className="list">{d.identity_issues.map((i) => (
          <div key={i.id} className="list-item">
            <span className={`dot ${i.status === "pending" ? "dot-warning" : "dot-success"}`} aria-hidden="true" />
            <span className="list-item-main">
              <span className="list-item-title">{sentence(humanize(i.issue_type))} {i.control_id && <Tag>{i.control_id}</Tag>}</span>
              <span className="list-item-text">{i.resolution ?? jsonText(i.candidates, 400)}</span>
              {i.decision && <span className="list-item-text">{i.resolved_by}: {i.decision}</span>}
            </span>
            <Status s={i.status} />
          </div>))}</div> : <div className="panel"><EmptyInline>Every control carries a stable identity.</EmptyInline></div>}
      </Section>

      <details className="disclosure"><summary>Intake events ({d.events.length})</summary><EventList items={d.events} /></details>
    </>
  );
}
