import { Fragment, useState } from "react";
import type { Finding, WorkspaceModel } from "../api/schema.ts";
import { EmptyInline, Hash, Ref, Section, Source, Status, sentence } from "../components/ui.tsx";
import { bySignificance, humanize, isEmptyBlob, jsonText, when } from "../lib/format.ts";

function FindingDetail({ f }: { f: Finding }) {
  return (
    <div className="form-fields">
      <p>{f.rationale}</p>
      <Source s={f.source} />
      <dl className="detail-grid">
        {f.suggested_action && <><dt>Suggested action</dt><dd>{f.suggested_action}</dd></>}
        {!isEmptyBlob(f.planner_response) && <><dt>Planning Agent's response</dt><dd>{jsonText(f.planner_response, 1500)}</dd></>}
        {f.fix_check && <><dt>Post-revision check</dt><dd><Status s={f.fix_check.fixed ? "fixed" : "unverified"} label={f.fix_check.fixed ? "Demonstrably fixed" : "Not demonstrably fixed"} /> {f.fix_check.basis}</dd></>}
        {f.human_decision && <><dt>Decision by {f.human_by}</dt><dd>{f.human_decision} <span className="muted xs">{when(f.human_at)}</span></dd></>}
        <dt>Review cycle</dt><dd>{f.cycle}{f.verified ? "" : " · its cited source could not be verified"}</dd>
      </dl>
    </div>
  );
}

/** Findings as a scannable table; each row expands to the full reasoning (progressive disclosure). */
export function FindingRows({ findings }: { findings: Finding[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Finding</th><th className="hide-sm">Control</th><th>Significance</th><th>Status</th></tr></thead>
        <tbody>
          {findings.map((f) => {
            const isOpen = open === f.id;
            return (
              <Fragment key={f.id}>
                <tr className={`row-link${isOpen ? " row-open" : ""}`} onClick={() => setOpen(isOpen ? null : f.id)}>
                  <td>
                    <button type="button" className="row-toggle" aria-expanded={isOpen} aria-controls={`finding-${f.id}`}
                      onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : f.id); }}>
                      <span className="cell-title">{sentence(humanize(f.category))}</span>
                      <span className="cell-sub clamp">#{f.id} · {f.rationale}</span>
                    </button>
                  </td>
                  <td className="hide-sm"><div className="tags"><Ref v={f.control_id} /><Ref v={f.code} /></div></td>
                  <td><Status s={f.significance} label={sentence(f.significance)} /></td>
                  <td><Status s={f.status} /></td>
                </tr>
                {isOpen && <tr className="row-detail" id={`finding-${f.id}`}><td colSpan={4}><FindingDetail f={f} /></td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Findings({ model }: { model: WorkspaceModel }) {
  const rev = model.nodes.find((n) => n.id === "reviewer")?.details;
  const revisions = model.nodes.filter((n) => n.type === "revision");
  const [status, setStatus] = useState<string | null>(null);
  if (!rev || !rev.findings.length) {
    return <div className="panel"><EmptyInline>No review has run yet. The Independent Reviewer's findings appear here once the plan has been reviewed.</EmptyInline></div>;
  }
  const statuses = Object.keys(rev.by_status).sort();
  const items = rev.findings.filter((f) => !status || f.status === status).sort(bySignificance);

  return (
    <>
      <Section title="Findings" count={rev.findings.length} description="Raised by the Independent Reviewer. Select a finding to read its reasoning and source."
        actions={statuses.length > 1 ? (
          <div className="seg" role="group" aria-label="Filter by status">
            <button type="button" aria-pressed={!status} onClick={() => setStatus(null)}>All</button>
            {statuses.map((s) => <button type="button" key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{sentence(humanize(s))} · {rev.by_status[s]}</button>)}
          </div>
        ) : undefined}>
        <FindingRows findings={items} />
      </Section>

      {revisions.length > 0 && (
        <Section title="Targeted revisions" count={revisions.length} description="Findings sent back to the Planning Agent, and what the objective check found afterwards.">
          <div className="list">{revisions.map((n) => (
            <div key={n.id} className="list-item">
              <span className="dot dot-success" aria-hidden="true" />
              <span className="list-item-main"><span className="list-item-title">{n.label}</span><span className="list-item-text">{n.summary}</span></span>
              <Status s={n.status} />
            </div>))}</div>
        </Section>
      )}

      <Section title="Review passes" count={rev.reviews.length}>
        <div className="table-wrap"><table>
          <thead><tr><th>Cycle</th><th>Plan version</th><th>Reviewer</th><th className="hide-sm">Blind pass</th><th className="hide-sm">Comparison pass</th><th>Recorded</th></tr></thead>
          <tbody>{rev.reviews.map((r) => (
            <tr key={r.id}><td>{r.cycle}</td><td>{r.plan_version_id}</td><td>{r.reviewer}</td>
              <td className="hide-sm"><Hash h={r.pass1_hash} /></td><td className="hide-sm"><Hash h={r.pass2_hash} /></td><td className="muted xs nowrap">{when(r.created_at)}</td></tr>))}</tbody>
        </table></div>
      </Section>
    </>
  );
}
