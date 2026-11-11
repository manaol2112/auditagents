import type { ReactNode } from "react";
import type { EngagementSummary, SessionUser, WorkspaceModel } from "../api/schema.ts";
import { canPrepare, initials, roleLabel } from "../lib/format.ts";
import { engagementHref, type Route, type View } from "../lib/router.ts";
import {
  IconActivity, IconClose, IconDocuments, IconFindings, IconKey, IconList, IconOverview, IconPlan, IconPlus, IconQueue, IconSignOut, Mark,
} from "./icons.tsx";

interface NavItem { view: View; label: string; icon: ReactNode; count?: number; urgent?: boolean }

function engagementNav(model: WorkspaceModel | null): NavItem[] {
  const node = (id: string) => model?.nodes.find((n) => n.id === id)?.details;
  const queue = model?.action_queue.length ?? 0;
  return [
    { view: "overview", label: "Overview", icon: <IconOverview /> },
    { view: "queue", label: "Decisions", icon: <IconQueue />, count: queue || undefined, urgent: queue > 0 },
    { view: "findings", label: "Review findings", icon: <IconFindings />, count: node("reviewer")?.findings.length || undefined },
    { view: "plan", label: "Audit plan", icon: <IconPlan /> },
    { view: "documents", label: "Documents", icon: <IconDocuments />, count: node("intake")?.documents.length || undefined },
    { view: "activity", label: "Activity", icon: <IconActivity /> },
  ];
}

export function Sidebar(props: {
  route: Route;
  engagements: EngagementSummary[];
  model: WorkspaceModel | null;
  open: boolean;
  onClose: () => void;
  user: SessionUser;
  onSignOut: () => void;
  signingOut: boolean;
  signOutError: string | null;
}) {
  const { route, engagements, model, open, onClose, user, onSignOut, signingOut, signOutError } = props;
  const current = route.page === "engagement" ? engagements.find((e) => e.name === route.engagement) ?? null : null;

  return (
    <aside className={`sidebar${open ? " is-open" : ""}`} aria-label="Navigation">
      <div className="brand">
        <Mark />
        <div>
          <div className="brand-name">Planning Workforce</div>
          <div className="brand-sub">SOX ITGC audit planning</div>
        </div>
        <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="Close navigation"><IconClose /></button>
      </div>

      {canPrepare(user.role) && (
        <a className="btn btn-primary" href="#/new" onClick={onClose}><IconPlus /> New engagement</a>
      )}

      <nav className="nav-group" aria-label="Main">
        <a className="nav" href="#/" aria-current={route.page === "engagements" ? "page" : undefined} onClick={onClose}>
          <IconList /><span>Engagements</span><span className="nav-count">{engagements.length || ""}</span>
        </a>
      </nav>

      {current && (
        <nav className="nav-group" aria-label={`${current.name} sections`}>
          <div className="nav-eng">
            <span className="nav-eng-client">{current.client}</span>
            <span className="nav-eng-name" title={current.name}>{current.name}</span>
          </div>
          {engagementNav(model).map((item) => (
            <a key={item.view} className="nav" href={engagementHref(current.name, item.view)} onClick={onClose}
              aria-current={item.view === route.view ? "page" : undefined}>
              {item.icon}
              <span>{item.label}</span>
              {item.count !== undefined && <span className={`nav-count${item.urgent ? " nav-count-urgent" : ""}`}>{item.count}</span>}
            </a>
          ))}
        </nav>
      )}

      <div className="side-foot">
        {signOutError && <p className="alert alert-danger" role="alert">{signOutError}</p>}
        <div className="user">
          <span className="avatar" aria-hidden="true">{initials(user.display_name || user.name)}</span>
          <div className="user-text">
            <div className="user-name" title={user.name}>{user.display_name || user.name}</div>
            <div className="user-role">{roleLabel(user.role)}</div>
          </div>
          <div className="user-actions">
            <a className="icon-btn" href="#/account" onClick={onClose} aria-label="Change password" title="Change password"><IconKey /></a>
            <button type="button" className="icon-btn" onClick={onSignOut} disabled={signingOut} aria-busy={signingOut}
              aria-label={signingOut ? "Signing out" : "Sign out"} title="Sign out"><IconSignOut /></button>
          </div>
        </div>
      </div>
    </aside>
  );
}
