import type { WorkspaceModel } from "../api/schema.ts";
import { Badge, EmptyInline, EventList, Hash, Section, Source, Status, Tag, sentence } from "../components/ui.tsx";
import { jsonText, plural, when } from "../lib/format.ts";

export function Plan({ model }: { model: WorkspaceModel }) {
  const d = model.nodes.find((n) => n.id === "planner")?.details;
  if (!d || !d.plan_versions.length) {
    return <div className="panel"><EmptyInline>No plan has been drafted yet. Once the controls are extracted, the Planning Agent drafts one.</EmptyInline></div>;
  }
  const gaps = d.coverage_cells.filter((c) => c.status === "unresolved coverage gap").length;

  return (
    <>
      <Section title="Plan versions" count={d.plan_versions.length} description="Every version is immutable; a targeted revision creates a new one.">
        <div className="list">{[...d.plan_versions].reverse().map((v) => (
          <div key={v.id} className="list-item">
            <span className={`dot ${v.status === "approved" ? "dot-success" : v.status === "draft" ? "dot-warning" : ""}`} aria-hidden="true" />
            <span className="list-item-main">
              <span className="list-item-title">Version {v.version} <Status s={v.status} /></span>
              <span className="list-item-text">
                {v.revision_of ? `Targeted revision after review cycle ${v.review_cycle}` : "Initial plan"} · {plural(v.controls, "control")}, {v.mapped_controls} mapped · {plural(v.blocking, "blocking finding")}
              </span>
              {v.decided_by && <span className="list-item-text">{sentence(v.status)} by {v.decided_by}, {when(v.decided_at)}{v.decision_note ? `: ${v.decision_note}` : ""}</span>}
            </span>
            <span className="xs muted nowrap hide-sm">{v.created_by} · {when(v.created_at)} <Hash h={v.content_hash} /></span>
          </div>))}</div>
      </Section>

      <Section title="Controls in the latest plan" count={d.controls.length} description="Select a control to see its source and planned procedures.">
        {d.controls.length ? <div className="list">{d.controls.map((c) => (
          <details key={c.control_id} className="list-item-details">
            <summary className="list-item">
              <span className={`dot ${c.module ? "dot-success" : "dot-warning"}`} aria-hidden="true" />
              <span className="list-item-main">
                <span className="list-item-title">{c.label ?? c.control_id} {c.module ? <Badge t="accent" plain>{c.module}</Badge> : <Badge t="warn" plain>Not mapped</Badge>}</span>
                <span className="list-item-text">{c.systems.join(", ")}</span>
              </span>
              <span className="xs muted nowrap">{plural(c.procedures.length, "procedure")}</span>
            </summary>
            <div className="list-item-body">
              <Source s={c.source} />
              {c.procedures.length > 0 && <div className="table-wrap"><table>
                <thead><tr><th>Attribute</th><th>Procedure</th><th>Criterion</th></tr></thead>
                <tbody>{c.procedures.map((p) => <tr key={p.attribute}><td><Tag>{p.attribute}</Tag></td><td>{sentence(p.status)}</td><td className="muted">{p.criterion_status ? sentence(p.criterion_status) : ""}</td></tr>)}</tbody>
              </table></div>}
              <p className="xs subtle">Engine identity <span className="mono">{c.control_id}</span></p>
            </div>
          </details>))}</div> : <div className="panel"><EmptyInline>The latest plan has no controls.</EmptyInline></div>}
      </Section>

      <Section title="Coverage" count={d.coverage_cells.length} description="Each system and module in scope, and the controls that test it."
        actions={gaps ? <Badge t="bad">{plural(gaps, "unresolved gap")}</Badge> : <Badge t="ok">No gaps</Badge>}>
        <div className="table-wrap"><table>
          <thead><tr><th>System</th><th>Module</th><th>Status</th><th className="hide-sm">Controls</th></tr></thead>
          <tbody>{d.coverage_cells.map((c) => (
            <tr key={`${c.system}|${c.module}`} title={c.rationale ?? undefined}>
              <td>{c.system}</td><td><Tag>{c.module}</Tag></td><td><Status s={c.status} /></td><td className="hide-sm mono xs">{c.controls.join(", ")}</td>
            </tr>))}</tbody>
        </table></div>
      </Section>

      {d.proposals.length > 0 && (
        <Section title="Model proposals" count={d.proposals.length}>
          <div className="table-wrap"><table>
            <thead><tr><th>Proposer</th><th>Model</th><th>Snapshot</th><th className="hide-sm">Usage</th></tr></thead>
            <tbody>{d.proposals.map((p) => (
              <tr key={p.id}><td>{p.proposer}</td><td className="muted">{p.model}</td><td>{p.snapshot_id}</td><td className="hide-sm mono xs">{jsonText(p.usage, 160)}</td></tr>))}</tbody>
          </table></div>
        </Section>
      )}

      <details className="disclosure"><summary>Plan events ({d.events.length})</summary><EventList items={d.events} /></details>
    </>
  );
}
