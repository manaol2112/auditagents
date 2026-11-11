import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, formError } from "../api/client.ts";
import type { EngagementDetail, Member, Methodology, QueueItem, SessionUser, WorkspaceModel } from "../api/schema.ts";
import { IconArrow, IconCheck, IconInfo, IconUsers } from "../components/icons.tsx";
import { Badge, EmptyInline, Field, Panel, Ref, Section, Stat, Status, Stepper, Tag, describe, sentence } from "../components/ui.tsx";
import { bySignificance, canPrepare, day, humanize, initials, plural, roleLabel } from "../lib/format.ts";
import { engagementHref } from "../lib/router.ts";

function Callout({ tone, title, children, action }: { tone?: "warning" | "success"; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`callout${tone ? ` callout-${tone}` : ""}`}>
      {tone === "success" ? <IconCheck /> : <IconInfo />}
      <div className="callout-body">
        <h2>{title}</h2>
        {children}
      </div>
      {action}
    </div>
  );
}

function Cli({ children }: { children: string }) {
  return (
    <details className="disclosure">
      <summary>Not in the web app yet: how to do this from the command line</summary>
      <div className="cmd">{children}</div>
    </details>
  );
}

/** What the user should do next, from the engagement's lifecycle stage. Steps the web app cannot do yet say so plainly. */
function NextStep({ detail, model, user }: { detail: EngagementDetail; model: WorkspaceModel; user: SessionUser }) {
  const eng = detail.name;
  const as = `--as ${user.name}`;
  const queue = model.action_queue.length;
  const upload = detail.uploads[detail.uploads.length - 1];
  switch (detail.stage) {
    case "setup":
      return (
        <Callout title="Add the client's risk and control matrix">
          <p>Upload the RCM as an Excel or CSV file. The engine keeps every row with its source; you then confirm how its columns map to the RCM field standard.</p>
          <Cli>{`soxplan rcm-upload ${eng} <file.xlsx> ${as}`}</Cli>
        </Callout>
      );
    case "rcm_uploaded":
      return (
        <Callout title="Confirm how the RCM's columns map to the field standard">
          <p>{upload ? `${upload.filename} is uploaded. ` : ""}Review the proposed column mapping and confirm it, so controls and risks can be extracted.</p>
          <Cli>{`soxplan rcm-mapping ${upload?.id ?? "<upload id>"}\nsoxplan rcm-confirm ${upload?.id ?? "<upload id>"} ${as}`}</Cli>
        </Callout>
      );
    case "mapping_confirmed":
      return (
        <Callout title="Extract the controls and risks">
          <p>The mapping is confirmed. Extraction turns each RCM row into controls and risks with a reference to the row it came from.</p>
          <Cli>{`soxplan rcm-extract ${upload?.id ?? "<upload id>"} ${as}`}</Cli>
        </Callout>
      );
    case "extracted":
      return (
        <Callout title="Draft the audit plan">
          <p>The controls are extracted. The Planning Agent maps each one to a methodology module and drafts its procedures.</p>
          <Cli>{`soxplan plan ${eng} --proposer model ${as}`}</Cli>
        </Callout>
      );
    case "approved":
      return (
        <Callout tone="success" title={`Plan v${detail.latest_plan?.version ?? ""} is approved`}>
          <p>The approved plan is final. Any change starts a new plan version and goes through review and approval again.</p>
        </Callout>
      );
    default:
      return queue ? (
        <Callout tone="warning" title={`${plural(queue, "decision")} waiting on an approver`}
          action={<a className="btn btn-primary" href={engagementHref(eng, "queue")}>Review decisions <IconArrow /></a>}>
          <p>The plan cannot be approved until every escalated finding, material contradiction and identity question is decided.</p>
        </Callout>
      ) : (
        <Callout title={detail.stage === "planned" ? "Run the independent review" : "Approve the plan"}>
          <p>{detail.stage === "planned"
            ? "The Independent Reviewer assesses the plan blind, then challenges it; findings it cannot settle come to an approver."
            : "Nothing is waiting on a person. An approver can approve the draft."}</p>
          <Cli>{detail.stage === "planned" ? `soxplan review-plan ${eng} ${as}` : `soxplan approve ${eng} --note "..." ${as}`}</Cli>
        </Callout>
      );
  }
}

function QueueRow({ q, engagement }: { q: QueueItem; engagement: string }) {
  return (
    <a className="list-item" href={engagementHref(engagement, "queue")}>
      <span className={`dot ${q.significance === "high" ? "dot-danger" : "dot-warning"}`} aria-hidden="true" />
      <span className="list-item-main">
        <span className="list-item-title">{sentence(q.kind)} {q.ref}<Ref v={q.control} /></span>
        <span className="list-item-text clamp">{sentence(humanize(q.category))}{q.why ? ` — ${q.why}` : ""}</span>
      </span>
      <Status s={q.significance} label={`${sentence(q.significance)}`} />
    </a>
  );
}

function Team({ engagement, user }: { engagement: string; user: SessionUser }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    api.members(engagement, ctrl.signal).then(setMembers).catch((e) => { if (!ctrl.signal.aborted) setError(formError(e)); });
    return () => ctrl.abort();
  }, [engagement, reload]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const who = name.trim();
    if (!who) { setAddError("Enter the person's user name."); return; }
    if (members?.some((m) => m.name === who)) { setAddError(`${who} is already on the team.`); return; }
    setBusy(true); setAddError(null); setAdded(null);
    try {
      await api.addMember(engagement, who);
      setName(""); setAdded(who); setReload((n) => n + 1);
    } catch (err) {
      setAddError(err instanceof ApiError && err.kind === "not_found" ? "There is no person with that user name." : formError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={<span className="row-head"><IconUsers /> Team</span>}>
      {error ? <p className="alert alert-danger">{error}</p> : !members ? <p className="muted small" role="status">Loading…</p> : (
        <ul className="plain-list" aria-label="Team members">
          {members.map((m) => (
            <li key={m.name} className="user">
              <span className="avatar" aria-hidden="true">{initials(m.display_name || m.name)}</span>
              <span className="user-text">
                <span className="user-name">{m.display_name || m.name}{m.name === user.name ? " (you)" : ""}</span>
                <span className="user-role">{roleLabel(m.role)} · added {day(m.added_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {canPrepare(user.role) && (
        <form className="inline-form" method="post" onSubmit={add} noValidate>
          <Field id="add-member" label="Add a team member" error={addError} hint={added ? `${added} was added.` : "Their user name, as their administrator set it up."}>
            <input id="add-member" className="input" value={name} maxLength={100} autoComplete="off" spellCheck={false}
              onChange={(e) => setName(e.target.value)} disabled={busy} {...describe("add-member", addError, true)} />
          </Field>
          <button type="submit" className="btn" disabled={busy} aria-busy={busy}>{busy ? "Adding…" : "Add"}</button>
        </form>
      )}
    </Panel>
  );
}

function Scope({ detail, meth }: { detail: EngagementDetail; meth: Methodology | null }) {
  const title = (code: string) => meth?.modules.find((m) => m.code === code)?.title ?? code;
  const total = detail.modules_in_scope.length + detail.modules_out_of_scope.length;
  return (
    <Panel title="Scope">
      <dl className="facts">
        <dt>Systems</dt><dd><div className="tags">{detail.systems.map((s) => <Tag key={s}>{s}</Tag>)}</div></dd>
        <dt>Modules</dt>
        <dd>
          <div>{detail.modules_out_of_scope.length ? `${detail.modules_in_scope.length} of ${total}` : `All ${total}`} · methodology {detail.methodology_version}</div>
          <ul className="plain-list small muted" aria-label="Modules in scope">
            {detail.modules_in_scope.map((c) => <li key={c}>{title(c)} <span className="mono subtle xs nowrap">{c}</span></li>)}
          </ul>
        </dd>
      </dl>
    </Panel>
  );
}

export function Overview({ model, detail, user }: { model: WorkspaceModel; detail: EngagementDetail; user: SessionUser }) {
  const [meth, setMeth] = useState<Methodology | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    api.methodology(ctrl.signal).then(setMeth).catch(() => { /* titles fall back to codes */ });
    return () => ctrl.abort();
  }, []);

  const nodes = Object.fromEntries(model.nodes.map((n) => [n.id, n]));
  const findings = nodes.reviewer?.details.findings ?? [];
  const docs = nodes.intake?.details.documents.length ?? 0;
  const queue = [...model.action_queue].sort(bySignificance);
  const high = queue.filter((q) => q.significance === "high").length;
  const plan = detail.latest_plan;

  return (
    <>
      <Stepper stage={detail.stage} />
      <NextStep detail={detail} model={model} user={user} />

      {plan && (
        <div className="stats">
          <Stat label="Decisions waiting" value={queue.length} danger={high > 0} sub={queue.length ? `${high} high significance` : "Nothing to decide"} />
          <Stat label="Latest plan" value={`v${plan.version}`} sub={<>{sentence(plan.status)} · {plural(plan.blocking, "blocking finding")}</>} />
          <Stat label="Review findings" value={findings.length}
            sub={findings.length ? `${findings.filter((f) => f.status === "resolved").length} resolved · ${findings.filter((f) => f.status === "escalated").length} escalated` : "No review yet"} />
          <Stat label="Source documents" value={docs} sub={model.engagement.snapshot_id ? `Snapshot ${model.engagement.snapshot_id} in use` : "No snapshot yet"} />
        </div>
      )}

      <div className="grid-2">
        <Section title="Needs attention" count={queue.length}
          actions={queue.length > 5 ? <a className="link-btn" href={engagementHref(detail.name, "queue")}>View all <IconArrow /></a> : undefined}>
          {queue.length ? <div className="list">{queue.slice(0, 5).map((q) => <QueueRow key={`${q.kind}-${q.id}`} q={q} engagement={detail.name} />)}</div>
            : <div className="panel"><EmptyInline>{plan ? "Nothing is waiting on a person." : "Decisions appear here once the plan has been drafted and reviewed."}</EmptyInline></div>}
          {plan?.status === "approved" && <Badge t="ok">Approved</Badge>}
        </Section>
        <div className="form-fields">
          <Team engagement={detail.name} user={user} />
          <Scope detail={detail} meth={meth} />
        </div>
      </div>
    </>
  );
}
