import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { EngagementDetail, EngagementSummary, SessionUser } from "../api/schema.ts";
import { IconPlus } from "../components/icons.tsx";
import { Badge, Empty, PageHeader, Status } from "../components/ui.tsx";
import { STAGES, canPrepare, dayRange, stageIndex, stageLabel } from "../lib/format.ts";
import { engagementHref, navigate } from "../lib/router.ts";

const MAX_DETAILS = 50;

/** Stage and plan status per engagement. One request each (bounded); a list endpoint carrying these fields would remove
 * the fan-out, which is noted as follow-up work for the API. */
function useDetails(list: EngagementSummary[]): Record<string, EngagementDetail | "error"> {
  const [details, setDetails] = useState<Record<string, EngagementDetail | "error">>({});
  const key = list.map((e) => e.name).join("|");
  useEffect(() => {
    const ctrl = new AbortController();
    for (const e of list.slice(0, MAX_DETAILS)) {
      api.engagement(e.name, ctrl.signal)
        .then((d) => setDetails((m) => ({ ...m, [e.name]: d })))
        .catch(() => { if (!ctrl.signal.aborted) setDetails((m) => ({ ...m, [e.name]: "error" })); });
    }
    return () => ctrl.abort();
  }, [key]);
  return details;
}

export function EngagementList({ engagements, user }: { engagements: EngagementSummary[]; user: SessionUser }) {
  const details = useDetails(engagements);
  const mayCreate = canPrepare(user.role);
  const newButton = mayCreate ? <a className="btn btn-primary" href="#/new"><IconPlus /> New engagement</a> : undefined;

  return (
    <div className="page">
      <PageHeader title="Engagements" description="The audit engagements you are a member of." actions={engagements.length ? newButton : undefined} />
      {!engagements.length ? (
        <div className="panel">
          {mayCreate ? (
            <Empty title="Create your first engagement" action={newButton}>
              An engagement sets the client, the audit period, the systems and the methodology modules in scope. You add the client's
              risk and control matrix next, and the planning agents work from it.
            </Empty>
          ) : (
            <Empty title="No engagements yet">
              {user.role === "admin"
                ? "Administrators manage people and access. Preparers and approvers create engagements and add their team."
                : "You will see an engagement here once its lead adds you to the team."}
            </Empty>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Engagement</th><th className="hide-sm">Audit period</th><th>Stage</th><th className="hide-sm">Latest plan</th></tr>
            </thead>
            <tbody>
              {[...engagements].reverse().map((e) => {
                const d = details[e.name];
                const detail = d && d !== "error" ? d : null;
                const at = detail ? stageIndex(detail.stage) : -1;
                return (
                  <tr key={e.name} className="row-link" onClick={() => navigate({ page: "engagement", engagement: e.name, view: "overview" })}>
                    <td>
                      <a className="cell-title" href={engagementHref(e.name)} onClick={(ev) => ev.stopPropagation()}>{e.name}</a>
                      <div className="cell-sub">{e.client}</div>
                    </td>
                    <td className="hide-sm nowrap">{dayRange(e.period_start, e.period_end)}</td>
                    <td>
                      {detail ? (
                        <div className="row-head">
                          <Badge t={detail.stage === "approved" ? "ok" : "accent"} plain>{stageLabel(detail.stage)}</Badge>
                          <span className="xs muted hide-sm">{at + 1} of {STAGES.length}</span>
                        </div>
                      ) : d === "error" ? <span className="muted xs">Unavailable</span> : <span className="muted xs">Loading…</span>}
                    </td>
                    <td className="hide-sm">
                      {detail?.latest_plan ? (
                        <div className="row-head">
                          <span>v{detail.latest_plan.version}</span>
                          <Status s={detail.latest_plan.status} />
                          {detail.latest_plan.blocking > 0 && <span className="xs muted">{detail.latest_plan.blocking} blocking</span>}
                        </div>
                      ) : detail ? <span className="muted">Not drafted</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
