import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { api, ApiError, errorMessage, formError } from "../api/client.ts";
import type { ClientSummary, Methodology } from "../api/schema.ts";
import { IconClose } from "../components/icons.tsx";
import { Field, PageHeader, describe } from "../components/ui.tsx";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SYSTEMS = 30;

const GROUPS: Array<[string, RegExp]> = [
  ["Access", /^AC-/], ["Change", /^(CM|DEV)-/], ["Operations", /^CO-/], ["Service organizations", /^TP-/],
];

/** The fiscal year ending on `fye`: [start, end]. Date-only arithmetic in UTC, so no time-zone shifts. */
function fiscalYear(fye: string): [string, string] | null {
  if (!DATE_RE.test(fye)) return null;
  const end = new Date(fye + "T00:00:00Z");
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  start.setUTCDate(start.getUTCDate() + 1);
  return [start.toISOString().slice(0, 10), fye];
}

function suggestName(client: string, periodEnd: string): string {
  const slug = client.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).join("").slice(0, 12);
  const year = periodEnd.slice(0, 4);
  return slug ? `${slug}-FY${/^\d{4}$/.test(year) ? year : ""}-ITGC`.replace("-FY-", "-") : "";
}

const browserZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
const zones = (): string[] => { try { return Intl.supportedValuesOf("timeZone"); } catch { return ["UTC"]; } };

type Errors = Partial<Record<"clientName" | "client" | "fye" | "tz" | "name" | "periodStart" | "periodEnd" | "asOf" | "systems" | "modules", string>>;

export function NewEngagement({ onCreated }: { onCreated: (name: string) => void }) {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [meth, setMeth] = useState<Methodology | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [clientName, setClientName] = useState("");
  const [existing, setExisting] = useState("");
  const [fye, setFye] = useState("");
  const [tz, setTz] = useState(browserZone());
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [asOf, setAsOf] = useState("");
  const [datesTouched, setDatesTouched] = useState(false);
  const [systems, setSystems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [modules, setModules] = useState<Set<string>>(new Set());

  const [errors, setErrors] = useState<Errors>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdClient, setCreatedClient] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const zoneList = useMemo(zones, []);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([api.clients(ctrl.signal), api.methodology(ctrl.signal)])
      .then(([c, m]) => {
        setClients(c);
        setMeth(m);
        setModules(new Set(m.modules.map((x) => x.code)));
        if (!c.length) setMode("new"); else setExisting(c[0]!.name);
      })
      .catch((e) => { if (!ctrl.signal.aborted) setLoadError(errorMessage(e)); });
    return () => ctrl.abort();
  }, []);

  // The fiscal year end of the chosen client drives the suggested period, as-of date and name until the user edits them.
  const clientLabel = mode === "new" ? clientName.trim() : existing;
  const effectiveFye = mode === "new" ? fye : clients?.find((c) => c.name === existing)?.fiscal_year_end ?? "";
  useEffect(() => {
    if (datesTouched) return;
    const fy = fiscalYear(effectiveFye);
    if (fy) { setPeriodStart(fy[0]); setPeriodEnd(fy[1]); setAsOf(fy[1]); }
  }, [effectiveFye, datesTouched]);
  useEffect(() => {
    if (!nameTouched) setName(suggestName(clientLabel, periodEnd));
  }, [clientLabel, periodEnd, nameTouched]);

  function addSystem(raw: string) {
    const v = raw.trim().replace(/,$/, "").trim();
    if (!v) return;
    if (v.length > 100) { setErrors((e) => ({ ...e, systems: "A system name can have at most 100 characters." })); return; }
    setSystems((s) => (s.some((x) => x.toLowerCase() === v.toLowerCase()) || s.length >= MAX_SYSTEMS ? s : [...s, v]));
    setDraft("");
    setErrors((e) => ({ ...e, systems: undefined }));
  }
  function onSystemKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSystem(draft); }
    else if (e.key === "Backspace" && !draft && systems.length) setSystems((s) => s.slice(0, -1));
  }

  function validate(allSystems: string[]): Errors {
    const e: Errors = {};
    if (mode === "new") {
      if (!clientName.trim()) e.clientName = "Enter the client's name.";
      else if (clientName.trim().length > 200) e.clientName = "Use at most 200 characters.";
      if (!DATE_RE.test(fye)) e.fye = "Enter the client's fiscal year end.";
      if (!tz) e.tz = "Choose the client's time zone.";
    } else if (!existing) e.client = "Choose a client.";
    if (!name.trim()) e.name = "Enter a name for the engagement.";
    else if (name.trim().length > 100) e.name = "Use at most 100 characters.";
    else if (!NAME_RE.test(name.trim())) e.name = "Start with a letter or digit; then use letters, digits, spaces, dots, dashes or underscores.";
    if (!DATE_RE.test(periodStart)) e.periodStart = "Enter the first day of the audit period.";
    if (!DATE_RE.test(periodEnd)) e.periodEnd = "Enter the last day of the audit period.";
    else if (DATE_RE.test(periodStart) && periodEnd < periodStart) e.periodEnd = "The period must end after it starts.";
    if (!DATE_RE.test(asOf)) e.asOf = "Enter the as-of date.";
    if (!allSystems.length) e.systems = "Add at least one system, such as the ERP the controls run on.";
    if (!modules.size) e.modules = "Select at least one module.";
    return e;
  }

  function fieldFor(message: string): keyof Errors | null {
    if (/^name /i.test(message) || /engagement .* already exists/i.test(message)) return "name";
    if (/client .* already exists/i.test(message)) return "clientName";
    if (/period_end/.test(message)) return "periodEnd";
    if (/systems/.test(message)) return "systems";
    if (/module/i.test(message)) return "modules";
    return null;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const allSystems = draft.trim() ? [...systems, draft.trim()] : systems;
    if (draft.trim()) addSystem(draft);
    const e = validate(allSystems);
    setErrors(e);
    setFormErr(null);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    // If the client was created but the engagement was not, a retry reuses that client (createdClient) instead of re-creating it.
    const client = mode === "new" ? clientName.trim() : existing;
    try {
      if (mode === "new" && createdClient !== client) {
        await api.createClient({ name: client, fiscal_year_end: fye, time_zone: tz });
        setCreatedClient(client);
      }
      const allModules = meth ? modules.size === meth.modules.length : false;
      const eng = await api.createEngagement({
        client, name: name.trim(), period_start: periodStart, period_end: periodEnd, as_of: asOf,
        systems: allSystems, modules: allModules ? null : [...modules],
      });
      onCreated(eng.name);
    } catch (err) {
      setBusy(false);
      const msg = formError(err);
      const field = err instanceof ApiError && (err.kind === "invalid" || err.kind === "conflict") && err.detail ? fieldFor(err.detail) : null;
      if (field === "clientName") setErrors({ clientName: "A client with this name already exists. If it is yours, choose it under Existing client." });
      else if (field === "name" && /already exists/i.test(msg)) setErrors({ name: "An engagement with this name already exists. Choose another name." });
      else if (field) setErrors({ [field]: msg });
      else setFormErr(msg);
    }
  }

  const header = (
    <PageHeader eyebrow={<><a href="#/">Engagements</a><span aria-hidden="true">/</span><span>New</span></>} title="New engagement"
      description="Set up the client, the audit period and what is in scope. You can add the client's risk and control matrix once the engagement exists." />
  );

  if (loadError) return <div className="page page-narrow">{header}<p className="alert alert-danger" role="alert">{loadError}</p></div>;
  if (!clients || !meth) return <div className="page page-narrow">{header}<p className="muted" role="status">Loading…</p></div>;

  const grouped = GROUPS.map(([label, re]) => [label, meth.modules.filter((m) => re.test(m.code))] as const)
    .concat([["Other", meth.modules.filter((m) => !GROUPS.some(([, re]) => re.test(m.code)))] as const])
    .filter(([, ms]) => ms.length);

  return (
    <div className="page page-narrow">
      {header}
      <form ref={formRef} className="form" method="post" onSubmit={submit} noValidate>
        <section className="form-section" aria-labelledby="sec-client">
          <div className="form-section-head">
            <h2 id="sec-client">Client</h2>
            <p>The organisation being audited. Its fiscal year end sets the default audit period.</p>
          </div>
          <div className="form-fields">
            {clients.length > 0 && (
              <div className="choice-row" role="radiogroup" aria-label="Client">
                <label className="choice"><input type="radio" name="client-mode" checked={mode === "existing"} onChange={() => setMode("existing")} disabled={busy} /> Existing client</label>
                <label className="choice"><input type="radio" name="client-mode" checked={mode === "new"} onChange={() => setMode("new")} disabled={busy} /> New client</label>
              </div>
            )}
            {mode === "existing" ? (
              <Field id="f-client" label="Client" error={errors.client}>
                <select id="f-client" className="select" value={existing} onChange={(e) => setExisting(e.target.value)} disabled={busy} {...describe("f-client", errors.client)}>
                  {clients.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </Field>
            ) : (
              <>
                <Field id="f-client-name" label="Client name" error={errors.clientName}>
                  <input id="f-client-name" className="input" value={clientName} maxLength={200} autoComplete="organization"
                    onChange={(e) => setClientName(e.target.value)} disabled={busy} {...describe("f-client-name", errors.clientName)} />
                </Field>
                <div className="field-row">
                  <Field id="f-fye" label="Fiscal year end" error={errors.fye}>
                    <input id="f-fye" className="input" type="date" value={fye} onChange={(e) => setFye(e.target.value)} disabled={busy} {...describe("f-fye", errors.fye)} />
                  </Field>
                  <Field id="f-tz" label="Time zone" error={errors.tz}>
                    <select id="f-tz" className="select" value={tz} onChange={(e) => setTz(e.target.value)} disabled={busy} {...describe("f-tz", errors.tz)}>
                      {zoneList.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                    </select>
                  </Field>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="form-section" aria-labelledby="sec-eng">
          <div className="form-section-head">
            <h2 id="sec-eng">Engagement</h2>
            <p>A unique name your team will recognise, and the period the controls are tested over.</p>
          </div>
          <div className="form-fields">
            <Field id="f-name" label="Engagement name" hint="For example ACME-FY2026-ITGC. Letters, digits, spaces, dots, dashes and underscores." error={errors.name}>
              <input id="f-name" className="input" value={name} maxLength={100} spellCheck={false} autoComplete="off"
                onChange={(e) => { setName(e.target.value); setNameTouched(true); }} disabled={busy} {...describe("f-name", errors.name, true)} />
            </Field>
            <div className="field-row">
              <Field id="f-start" label="Period start" error={errors.periodStart}>
                <input id="f-start" className="input" type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setDatesTouched(true); }} disabled={busy} {...describe("f-start", errors.periodStart)} />
              </Field>
              <Field id="f-end" label="Period end" error={errors.periodEnd}>
                <input id="f-end" className="input" type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setDatesTouched(true); }} disabled={busy} {...describe("f-end", errors.periodEnd)} />
              </Field>
            </div>
            <div className="field-row">
              <Field id="f-asof" label="As of" hint="Usually the period end." error={errors.asOf}>
                <input id="f-asof" className="input" type="date" value={asOf} onChange={(e) => { setAsOf(e.target.value); setDatesTouched(true); }} disabled={busy} {...describe("f-asof", errors.asOf, true)} />
              </Field>
            </div>
          </div>
        </section>

        <section className="form-section" aria-labelledby="sec-scope">
          <div className="form-section-head">
            <h2 id="sec-scope">Scope</h2>
            <p>The systems in scope and the methodology modules to plan. Modules left out are recorded as a scoping decision.</p>
          </div>
          <div className="form-fields">
            <Field id="f-systems" label="Systems in scope" hint="Press Enter after each system." error={errors.systems}>
              <div className={`tag-input${errors.systems ? " is-invalid" : ""}`} onClick={() => document.getElementById("f-systems")?.focus()}>
                {systems.map((s) => (
                  <span key={s} className="chip-x">{s}
                    <button type="button" onClick={(e) => { e.stopPropagation(); setSystems((x) => x.filter((y) => y !== s)); }} aria-label={`Remove ${s}`} disabled={busy}><IconClose /></button>
                  </span>
                ))}
                <input id="f-systems" value={draft} maxLength={100} placeholder={systems.length ? "" : "e.g. SAP S/4HANA"} autoComplete="off"
                  onChange={(e) => setDraft(e.target.value)} onKeyDown={onSystemKey} onBlur={() => addSystem(draft)} disabled={busy || systems.length >= MAX_SYSTEMS}
                  {...describe("f-systems", errors.systems, true)} />
              </div>
            </Field>
            <fieldset className="field fieldset" aria-describedby={errors.modules ? "f-modules-error" : undefined}>
              <legend className="field-label">Methodology modules <span className="muted xs">· {modules.size} of {meth.modules.length} selected · methodology {meth.version}</span></legend>
              <div className="page-actions">
                <button type="button" className="link-btn" onClick={() => setModules(new Set(meth.modules.map((m) => m.code)))} disabled={busy}>Select all</button>
                <button type="button" className="link-btn" onClick={() => setModules(new Set())} disabled={busy}>Clear</button>
              </div>
              {grouped.map(([label, ms]) => (
                <div key={label} className="form-fields">
                  <div className="xs muted">{label}</div>
                  <div className="module-grid">
                    {ms.map((m) => (
                      <label key={m.code} className="module">
                        <input type="checkbox" checked={modules.has(m.code)} disabled={busy}
                          aria-invalid={errors.modules ? true : undefined}
                          onChange={(e) => setModules((cur) => { const n = new Set(cur); if (e.target.checked) n.add(m.code); else n.delete(m.code); return n; })} />
                        <span><span className="module-title">{m.title}</span><br /><span className="module-code">{m.code}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {errors.modules && <span className="field-error" id="f-modules-error" role="alert">{errors.modules}</span>}
            </fieldset>
          </div>
        </section>

        {formErr && <p className="alert alert-danger" role="alert">{formErr}</p>}
        {createdClient && mode === "new" && formErr && (
          <p className="alert alert-warning" role="status">The client {createdClient} was created. Fix the details above and try again; it will be used for this engagement.</p>
        )}
        <div className="form-foot">
          <a className="btn btn-ghost" href="#/">Cancel</a>
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy ? "Creating…" : "Create engagement"}</button>
        </div>
      </form>
    </div>
  );
}
