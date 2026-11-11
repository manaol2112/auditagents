import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, errorMessage, session, setSessionHandlers } from "./api/client.ts";
import type { EngagementDetail, EngagementSummary, SessionUser, WorkspaceModel } from "./api/schema.ts";
import { ChangePasswordForm } from "./components/ChangePassword.tsx";
import { IconMenu, Mark } from "./components/icons.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { AuthCard, SignIn, type SignedOutReason } from "./components/SignIn.tsx";
import { PageHeader } from "./components/ui.tsx";
import { canPrepare } from "./lib/format.ts";
import { navigate, useRoute, type Route } from "./lib/router.ts";
import { EngagementList } from "./views/EngagementList.tsx";
import { EngagementPage, VIEW_TITLES } from "./views/EngagementPage.tsx";
import { NewEngagement } from "./views/NewEngagement.tsx";

type Load<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error"; message: string };

type Auth =
  | { state: "checking" }
  | { state: "error"; message: string }
  | { state: "signed_out"; reason: SignedOutReason }
  | { state: "must_change"; user: SessionUser }
  | { state: "signed_in"; user: SessionUser };

/** Engagement data is keyed by the engagement it belongs to, so a slow response for one engagement can never be shown
 * under another engagement's header (no cross-client mixing, even transiently). */
type EngagementLoad = { name: string } & Load<{ detail: EngagementDetail; model: WorkspaceModel }>;

const userState = (user: SessionUser): Auth => (user.must_change_password ? { state: "must_change", user } : { state: "signed_in", user });

export function App() {
  const [auth, setAuth] = useState<Auth>({ state: "checking" });
  const [recheck, setRecheck] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    session.current(ctrl.signal)
      .then((user) => setAuth(user ? userState(user) : { state: "signed_out", reason: null }))
      .catch((e) => { if (!ctrl.signal.aborted) setAuth({ state: "error", message: errorMessage(e) }); });
    return () => ctrl.abort();
  }, [recheck]);

  // Any 401 from any call ends the signed-in view at once (its records are discarded with it); a 403
  // password_change_required sends the user to change their password before anything else.
  useEffect(() => {
    setSessionHandlers({
      unauthenticated: () => setAuth((a) => (a.state === "signed_in" || a.state === "must_change" ? { state: "signed_out", reason: "expired" } : a)),
      passwordChangeRequired: () => setAuth((a) => (a.state === "signed_in" ? { state: "must_change", user: { ...a.user, must_change_password: true } } : a)),
    });
    return () => setSessionHandlers({ unauthenticated: null, passwordChangeRequired: null });
  }, []);

  const signOut = useCallback(async () => {
    await session.signOut();
    setAuth({ state: "signed_out", reason: "signed_out" });
  }, []);

  if (auth.state === "checking") return <Notice title="Loading…" />;
  if (auth.state === "error") return <Notice title="Workspace unavailable" message={auth.message} retry={() => { setAuth({ state: "checking" }); setRecheck((n) => n + 1); }} />;
  if (auth.state === "signed_out") return <SignIn reason={auth.reason} onSignedIn={(user) => setAuth(userState(user))} />;
  if (auth.state === "must_change") {
    return (
      <AuthCard>
        <h1>Choose a new password</h1>
        <p>Your password was set by an administrator. Choose your own before you continue; you stay signed in.</p>
        <ChangePasswordForm userName={auth.user.name} submitLabel="Save and continue"
          onDone={() => setAuth({ state: "signed_in", user: { ...auth.user, must_change_password: false } })}
          onCancel={() => { void signOut().catch(() => setAuth({ state: "signed_out", reason: null })); }} />
      </AuthCard>
    );
  }
  // Keyed by user: a different person signing in on the same tab never inherits the previous person's loaded state.
  return <Shell key={auth.user.name} user={auth.user} onSignedOut={() => setAuth({ state: "signed_out", reason: "signed_out" })} />;
}

function Shell({ user, onSignedOut }: { user: SessionUser; onSignedOut: () => void }) {
  const route = useRoute();
  const [engs, setEngs] = useState<Load<EngagementSummary[]>>({ state: "loading" });
  const [eng, setEng] = useState<EngagementLoad | null>(null);
  const [listReload, setListReload] = useState(0);
  const [engReload, setEngReload] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api.engagements(ctrl.signal)
      .then((data) => setEngs({ state: "ready", data }))
      .catch((e) => { if (!ctrl.signal.aborted) setEngs({ state: "error", message: errorMessage(e) }); });
    return () => ctrl.abort();
  }, [listReload]);

  const list = engs.state === "ready" ? engs.data : [];
  // Only names the server listed for this user are ever requested; a hand-edited URL cannot make the app probe for others.
  const known = route.page === "engagement" && list.some((e) => e.name === route.engagement);

  useEffect(() => {
    if (!known || !route.engagement) { setEng(null); return; }
    const name = route.engagement;
    const ctrl = new AbortController();
    setEng((m) => (m && m.name === name && m.state === "ready" ? m : { name, state: "loading" }));
    Promise.all([api.engagement(name, ctrl.signal), api.workspace(name, ctrl.signal)])
      .then(([detail, model]) => setEng({ name, state: "ready", data: { detail, model } }))
      .catch((e) => { if (!ctrl.signal.aborted) setEng({ name, state: "error", message: errorMessage(e) }); });
    return () => ctrl.abort();
  }, [known, route.engagement, engReload]);

  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { if (eng?.state !== "loading") setRefreshing(false); }, [eng]);
  const refresh = useCallback(() => { setRefreshing(true); setEngReload((n) => n + 1); }, []);

  useEffect(() => {
    const t = route.page === "engagement" ? VIEW_TITLES[route.view] : route.page === "new" ? "New engagement" : route.page === "account" ? "Account" : "Engagements";
    document.title = `${t} · Planning Workforce`;
  }, [route.page, route.view]);

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await session.signOut();
      onSignedOut();
    } catch (e) {
      // Do not pretend: if the server did not end the session, the user is still signed in and must be told.
      setSignOutError(`Sign-out did not complete. ${errorMessage(e)}`);
      setSigningOut(false);
    }
  }, [signingOut, onSignedOut]);

  const current = eng && eng.name === route.engagement ? eng : null;

  let body: ReactNode;
  if (engs.state === "error") body = <Notice title="Engagements unavailable" message={engs.message} retry={() => setListReload((n) => n + 1)} />;
  else if (engs.state === "loading") body = <Notice title="Loading…" />;
  else if (route.page === "new" && !canPrepare(user.role)) body = <Notice title="You cannot create engagements"
    message={user.role === "admin" ? "Administrators manage people and access. A preparer or approver creates engagements." : "Your role is read-only. Ask a preparer or approver to create the engagement and add you to its team."}
    action={<a className="btn" href="#/">See your engagements</a>} />;
  else if (route.page === "new") body = <NewEngagement onCreated={(name) => { setListReload((n) => n + 1); navigate({ page: "engagement", engagement: name, view: "overview" }); }} />;
  else if (route.page === "account") body = <Account user={user} />;
  else if (route.page === "engagements") body = <EngagementList engagements={list} user={user} />;
  else if (!known) body = <Notice title="Engagement not found" message="It does not exist, or you are not a member of it." action={<a className="btn" href="#/">See your engagements</a>} />;
  else if (!current || current.state === "loading") body = <Notice title="Loading engagement…" />;
  else if (current.state === "error") body = <Notice title="Could not load this engagement" message={current.message} retry={refresh} />;
  else body = <EngagementPage detail={current.data.detail} model={current.data.model} route={route} user={user} onRefresh={refresh} refreshing={refreshing} />;

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <Sidebar route={route} engagements={list} model={current?.state === "ready" ? current.data.model : null} open={navOpen} onClose={() => setNavOpen(false)}
        user={user} onSignOut={signOut} signingOut={signingOut} signOutError={signOutError} />
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <main id="main" className="main" tabIndex={-1}>
        <div className="topbar-mobile">
          <button type="button" className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Open navigation"><IconMenu /></button>
          <Mark /><span className="brand-name">Planning Workforce</span>
        </div>
        <ErrorBoundary key={routeKey(route)}>{body}</ErrorBoundary>
      </main>
    </div>
  );
}

const routeKey = (r: Route) => `${r.page}|${r.engagement}|${r.view}`;

function Account({ user }: { user: SessionUser }) {
  const [done, setDone] = useState(false);
  return (
    <div className="page page-narrow">
      <PageHeader title="Account" description={`Signed in as ${user.name}.`} />
      <section className="form-section">
        <div className="form-section-head">
          <h2>Password</h2>
          <p>Changing it keeps you signed in here and signs you out everywhere else.</p>
        </div>
        {done ? <p className="alert alert-success" role="status">Your password was changed.</p>
          : <ChangePasswordForm userName={user.name} onDone={() => setDone(true)} />}
      </section>
    </div>
  );
}

function Notice({ title, message, retry, action }: { title: string; message?: string; retry?: () => void; action?: ReactNode }) {
  return (
    <div className="notice" role={retry ? "alert" : "status"}>
      <h1>{title}</h1>
      {message && <p>{message}</p>}
      {retry && <button type="button" className="btn" onClick={retry}>Try again</button>}
      {action}
    </div>
  );
}

/** Rendering failures show a fixed message; the error itself (which may contain record data) is not displayed. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(error: unknown): void {
    if (import.meta.env.DEV) console.error("[ui] render failed:", error instanceof ApiError ? error.kind : error); // security-reviewed: dev-only diagnostics
  }
  render(): ReactNode {
    return this.state.failed ? <Notice title="This view could not be displayed" message="Reload the page or choose another view." /> : this.props.children;
  }
}
