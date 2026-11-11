import type { EngagementDetail, SessionUser, WorkspaceModel } from "../api/schema.ts";
import { IconRefresh } from "../components/icons.tsx";
import { PageHeader } from "../components/ui.tsx";
import { dayRange, day } from "../lib/format.ts";
import { engagementHref, type Route, type View } from "../lib/router.ts";
import { ActionQueue } from "./ActionQueue.tsx";
import { ActivityView } from "./Activity.tsx";
import { Documents } from "./Documents.tsx";
import { Findings } from "./Findings.tsx";
import { Overview } from "./Overview.tsx";
import { Plan } from "./Plan.tsx";

export const VIEW_TITLES: Record<View, string> = {
  overview: "Overview", queue: "Decisions", findings: "Review findings", plan: "Audit plan", documents: "Documents", activity: "Activity",
};

export function EngagementPage({ detail, model, route, user, onRefresh, refreshing }: {
  detail: EngagementDetail; model: WorkspaceModel; route: Route; user: SessionUser; onRefresh: () => void; refreshing: boolean;
}) {
  const overview = route.view === "overview";
  const modules = detail.modules_out_of_scope.length
    ? `${detail.modules_in_scope.length} of ${detail.modules_in_scope.length + detail.modules_out_of_scope.length} modules`
    : "All modules";

  return (
    <div className="page">
      <PageHeader
        eyebrow={overview
          ? <span>{detail.client}</span>
          : <><a href={engagementHref(detail.name)}>{detail.name}</a><span aria-hidden="true">/</span><span>{VIEW_TITLES[route.view]}</span></>}
        title={overview ? detail.name : VIEW_TITLES[route.view]}
        actions={<button type="button" className="btn" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}><IconRefresh /> {refreshing ? "Refreshing…" : "Refresh"}</button>}>
        {overview && (
          <div className="meta">
            <span>Period <b>{dayRange(detail.period_start, detail.period_end)}</b></span>
            {detail.as_of && <span>As of <b>{day(detail.as_of)}</b></span>}
            <span>Systems <b>{detail.systems.length}</b></span>
            <span>Scope <b>{modules}</b></span>
            <span>Methodology <b>{detail.methodology_version}</b></span>
          </div>
        )}
      </PageHeader>
      {route.view === "overview" && <Overview model={model} detail={detail} user={user} />}
      {route.view === "queue" && <ActionQueue model={model} />}
      {route.view === "findings" && <Findings model={model} />}
      {route.view === "plan" && <Plan model={model} />}
      {route.view === "documents" && <Documents model={model} />}
      {route.view === "activity" && <ActivityView model={model} node={route.node} />}
    </div>
  );
}
