import type { AuditEvent, WorkspaceModel } from "../api/schema.ts";
import { FlowCanvas } from "../components/FlowCanvas.tsx";
import { ActivityList, EventList, Panel, Section, Status } from "../components/ui.tsx";
import { navigate } from "../lib/router.ts";

export function ActivityView({ model, node }: { model: WorkspaceModel; node: string | null }) {
  const seen = new Set<string>();
  const events: AuditEvent[] = [];
  for (const n of model.nodes) for (const e of n.details.events) if (!seen.has(e.id)) { seen.add(e.id); events.push(e); }
  events.sort((a, b) => Number(a.id) - Number(b.id));
  const sel = node ? model.nodes.find((n) => n.id === node) ?? null : null;
  const select = (id: string | null) => navigate({ page: "engagement", engagement: model.engagement.name, view: "activity", node: id }, true);

  return (
    <>
      <Section title="How this plan was produced" description="The steps that actually ran, and how they handed work to each other. Select a step for its summary.">
        <FlowCanvas model={model} selected={sel?.id ?? null} onSelect={(id) => select(id === sel?.id ? null : id)} />
        {sel && (
          <Panel title={<span className="row-head">{sel.label} <Status s={sel.status} /></span>}
            actions={<button type="button" className="btn btn-ghost btn-sm" onClick={() => select(null)}>Close</button>}>
            <p className="muted">{sel.actor} · {sel.summary}</p>
          </Panel>
        )}
      </Section>
      <Section title="Recorded activity" count={model.activities.length}><ActivityList items={model.activities} /></Section>
      <Section title="Audit trail" count={events.length} description="Append-only, hash-chained events the engine recorded for this engagement.">
        <EventList items={events} />
      </Section>
    </>
  );
}
