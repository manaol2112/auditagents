/** Evaluation harness: run a proposer on a fictional client and score the plan against a hidden answer key.
 *
 * The answer key is read only by the scorer, after the plan exists. It is never placed in any prompt or
 * document. Scores measure structural audit-quality properties: were the controls found, mapped to the right
 * modules, criteria quoted rather than invented, contradictions detected, and gaps left visible. This is not a
 * substitute for a qualified auditor's review of the plan.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import pg from "pg";
import * as audit from "./audit.js";
import { Db, createDatabase, j, now, one, all } from "./db.js";
import * as intake from "./intake.js";
import * as methodology from "./methodology.js";
import * as planning from "./planning.js";
import * as proposerModel from "./proposerModel.js";
import * as workflow from "./workflow.js";

const norm = (t: string | undefined) => (t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function docLineText(db: Db, pc: any): Promise<string> {
  const src = pc.source ?? {};
  const rows = await all(db, "SELECT text FROM document_lines WHERE doc_id = $1 AND line_no BETWEEN $2 AND $3", [src.doc_id ?? -1, src.line_no ?? -1, src.line_end ?? src.line_no ?? -1]);
  return rows.map((r) => r.text).join(" ");
}

async function anchored(db: Db, controls: any[], anchor: string): Promise<any[]> {
  const a = norm(anchor);
  const hits: any[] = [];
  for (const c of controls) if (norm(c.description).includes(a) || norm(await docLineText(db, c)).includes(a)) hits.push(c);
  return hits;
}

export interface Built { pool: pg.Pool; db: pg.PoolClient; plan: any; version: any; case: any; db_url: string }

/** A fresh database on the configured server, named after the run. */
export async function evalDatabase(baseUrl: string, name?: string): Promise<string> {
  const dbName = name ?? `soxplan_eval_${now().replace(/[^0-9]/g, "").slice(0, 14)}_${Math.floor(Math.random() * 1e4)}`;
  return createDatabase(baseUrl, dbName, Boolean(name));
}

export async function buildCase(caseDir: string, proposer: "rules" | "model", dbUrl: string, replay?: string): Promise<Built> {
  const kase = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8"));
  const pool = new pg.Pool({ connectionString: dbUrl, max: 4 });
  const db = await pool.connect();
  if (!(await one(db, "SELECT 1 FROM users WHERE name = 'eval-approver'"))) await audit.addUser(db, "system", "eval-approver", "approver");
  const cid = (await one(db, "INSERT INTO clients (name, fiscal_year_end, time_zone) VALUES ($1,$2,$3) RETURNING id", [kase.client, kase.fiscal_year_end, kase.time_zone]))!.id;
  for (const f of readdirSync(caseDir).filter((x) => x.endsWith(".md")).sort()) await intake.ingestDocument(db, "planner-agent", cid, join(caseDir, f));
  let snap: number;
  if (proposer === "rules") {
    snap = await intake.extract(db, "planner-agent", cid);
  } else {
    const transport = replay ? proposerModel.replayTransport(replay) : undefined;
    snap = await proposerModel.extractWithModel(db, "planner-agent", cid, kase.systems, transport, undefined, kase.modules);
    if (!replay) {
      const row = (await one(db, "SELECT content, model FROM model_proposals WHERE snapshot_id = $1", [snap]))!;
      const runs = join(caseDir, "runs");
      if (!existsSync(runs)) mkdirSync(runs);
      writeFileSync(join(runs, `${now().replace(/:/g, "")}-${row.model}.json`), JSON.stringify(row.content));
    }
  }
  const data = methodology.load();
  await db.query("INSERT INTO engagements (client_id, name, period_start, period_end, as_of, systems, methodology_version, methodology_hash, snapshot_id, created_by, created_at, modules) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
    [cid, kase.engagement, kase.period_start, kase.period_end, kase.as_of, j(kase.systems), data.version, data.document_hash, snap, "eval-approver", now(), kase.modules ? j(kase.modules) : null]);
  await planning.generatePlan(db, "planner-agent", kase.engagement, proposer, proposer === "model" ? proposerModel.modelProposals : undefined);
  const pv = await planning.getPlan(db, kase.engagement);
  return { pool, db, plan: pv.plan, version: pv, case: kase, db_url: dbUrl };
}

export async function score(db: Db, plan: any, key: any): Promise<any> {
  const controls = plan.controls;
  const matched: Record<string, any[]> = {};
  for (const k of key.controls) matched[k.id] = await anchored(db, controls, k.anchor);
  const rows: any[] = [];
  const t: Record<string, number> = { controls_found: 0, controls_expected: key.controls.length, module_hits: 0, module_expected: 0, module_extra: 0,
    criteria_defined_ok: 0, criteria_defined_expected: 0, criteria_invented: 0, criteria_undefined_ok: 0, criteria_undefined_expected: 0,
    contradictions_found: 0, contradictions_expected: 0, not_covered_found: 0, not_covered_expected: key.expected_not_covered.length,
    distractors_mapped: 0, distractors: key.distractors.length, engine_unverified: 0, engine_omissions: 0 };
  for (const k of key.controls) {
    const hits = matched[k.id];
    const found = hits.length > 0;
    t.controls_found += found ? 1 : 0;
    const proposedModules = new Set<string>(hits.filter((c) => c.module).map((c) => c.module));
    t.module_expected += k.modules.length;
    t.module_hits += k.modules.filter((m: string) => proposedModules.has(m)).length;
    t.module_extra += [...proposedModules].filter((m) => !k.modules.includes(m)).length;
    const critStatus: Record<string, any> = {};
    for (const c of hits) Object.assign(critStatus, c.criteria_register?.criteria ?? {});
    for (const [attr, expected] of Object.entries<string>(k.defined_criteria ?? {})) {
      t.criteria_defined_expected += 1;
      const cr = critStatus[attr];
      if (cr && ["defined", "defined by human resolution", "contradiction open"].includes(cr.status) && (cr.status === "contradiction open" || norm(cr.criterion).includes(norm(expected)))) t.criteria_defined_ok += 1;
    }
    for (const attr of k.undefined_criteria ?? []) {
      t.criteria_undefined_expected += 1;
      const cr = critStatus[attr];
      if (!cr || ["not defined by control", "unverified source", "contradiction open", "stated absent by client"].includes(cr.status)) t.criteria_undefined_ok += 1;
      else if (cr.status === "defined") t.criteria_invented += 1;
    }
    for (const subj of k.contradictions ?? []) {
      t.contradictions_expected += 1;
      if (plan.contradictions.some((con: any) => con.subject === subj && hits.some((c) => con.control_ref === c.ref || con.control_ref === c.control_id))) t.contradictions_found += 1;
    }
    rows.push({ control: k.id, found, proposed_refs: [...new Set(hits.map((c) => c.ref))].sort(), modules_expected: k.modules, modules_proposed: [...proposedModules].sort() });
  }
  const units = new Map<string, string>(plan.coverage_units.map((u: any) => [`${u.system}/${u.module}/${u.expectation}`, u.assessment]));
  for (const e of key.expected_not_covered) if (["not covered", "partially covered"].includes(units.get(`${e.system}/${e.module}/${e.expectation}`) ?? "")) t.not_covered_found += 1;
  for (const d of key.distractors) {
    const hits = await anchored(db, controls, d.anchor);
    if (hits.some((c) => c.module)) t.distractors_mapped += 1;
  }
  for (const g of plan.information_gaps) {
    if (["unverified criterion", "source unverified"].includes(g.kind)) t.engine_unverified += 1;
    if (g.kind === "proposer omission") t.engine_omissions += 1;
  }
  t.blocking_findings = plan.validation.filter((f: any) => f.severity === "blocking").length;
  t.warnings = plan.validation.filter((f: any) => f.severity === "warning").length;
  return { rows, totals: t };
}

const FORMATTING_KINDS = new Set(["proposer format", "unknown module", "source unverified", "contradiction unverified"]);

/** Audit-quality checks per control: integrity (what an auditor would call an error), quality (procedures, evidence,
 * populations, pass/fail), and formatting (what the engine corrected). */
export async function scoreQuality(db: Db, plan: any, key: any): Promise<any> {
  const controls = plan.controls;
  const integrity: any = { unsupported_criteria: 0, missed_material_risks: 0, material_risks_expected: 0, omitted_procedures: 0, procedures_expected: 0, omitted_detail: [] as string[] };
  const quality: any = { evidence_hits: 0, evidence_expected: 0, population_hits: 0, population_expected: 0, pass_fail_hits: 0, pass_fail_expected: 0, questions_specific: 0, questions_total: 0 };
  const formatting: any = { corrections: 0, kinds: {} as Record<string, number> };
  for (const g of plan.information_gaps) {
    if (FORMATTING_KINDS.has(g.kind)) { formatting.corrections += 1; formatting.kinds[g.kind] = (formatting.kinds[g.kind] ?? 0) + 1; }
    if (g.kind === "unverified criterion") integrity.unsupported_criteria += 1;
  }
  for (const k of key.controls) {
    const q = k.quality;
    if (!q) continue;
    const hits = await anchored(db, controls, k.anchor);
    if (!hits.length) {
      integrity.material_risks_expected += (q.material_risks ?? []).length; integrity.missed_material_risks += (q.material_risks ?? []).length;
      integrity.procedures_expected += (q.required_procedures ?? []).length; integrity.omitted_procedures += (q.required_procedures ?? []).length;
      integrity.omitted_detail.push(`${k.id}: control not found`);
      continue;
    }
    const ids = new Set(hits.flatMap((c) => [c.ref, c.control_id]));
    const blob = norm([
      ...hits.map((c) => c.description),
      ...hits.flatMap((c) => Object.values<any>(c.contributions ?? {}).map((x) => x.rationale)),
      ...hits.flatMap((c) => c.walkthrough_questions ?? []),
      ...hits.flatMap((c) => (c.procedures ?? []).map((p: any) => `${p.procedure ?? ""} ${p.pass_fail ?? ""}`)),
      ...plan.information_gaps.filter((g: any) => ids.has(g.control)).map((g: any) => g.text),
      ...plan.contradictions.filter((con: any) => ids.has(con.control_ref)).flatMap((con: any) => con.sources.map((s: any) => s.value)),
    ].join(" "));
    for (const r of q.material_risks ?? []) {
      integrity.material_risks_expected += 1;
      if (!blob.includes(norm(r))) { integrity.missed_material_risks += 1; integrity.omitted_detail.push(`${k.id}: risk '${r}' not addressed anywhere in the plan`); }
    }
    const procs: Record<string, any> = {};
    for (const c of hits) for (const p of c.procedures ?? []) procs[p.attribute] = p;
    for (const attr of q.required_procedures ?? []) {
      integrity.procedures_expected += 1;
      const p = procs[attr];
      if (!p || !p.status.startsWith("proposed")) { integrity.omitted_procedures += 1; integrity.omitted_detail.push(`${k.id}: procedure ${attr} ${p ? "status " + p.status : "missing"}`); }
    }
    const ev = norm(Object.values(procs).flatMap((p) => p.evidence_requests ?? []).join(" "));
    for (const w of q.evidence_keywords ?? []) { quality.evidence_expected += 1; if (ev.includes(norm(w))) quality.evidence_hits += 1; }
    const pop = norm(Object.values(procs).map((p) => p.population ?? "").join(" "));
    for (const w of q.population_keywords ?? []) { quality.population_expected += 1; if (pop.includes(norm(w))) quality.population_hits += 1; }
    for (const [attr, val] of Object.entries<string>(q.pass_fail_values ?? {})) { quality.pass_fail_expected += 1; const p = procs[attr]; if (p && norm(p.pass_fail).includes(norm(val))) quality.pass_fail_hits += 1; }
    const qs: string[] = hits.flatMap((c) => c.walkthrough_questions ?? []);
    quality.questions_total += qs.length;
    const names = new Set([...(k.systems ?? []), hits[0].owner ?? ""].filter(Boolean).map((x: string) => norm(x)));
    quality.questions_specific += qs.filter((qq) => [...names].some((n) => n && norm(qq).includes(n))).length;
  }
  return { integrity, quality, formatting, key_status: key.quality_authoring?.status ?? "unknown" };
}

export async function run(caseDir: string, proposer: "rules" | "model", baseUrl: string, replay?: string, dbName?: string): Promise<any> {
  const key = JSON.parse(readFileSync(join(caseDir, "answer_key.json"), "utf8"));
  const dbUrl = await evalDatabase(baseUrl, dbName);
  const built = await buildCase(caseDir, proposer, dbUrl, replay);
  try {
    const sc = await score(built.db, built.plan, key);
    Object.assign(sc, await scoreQuality(built.db, built.plan, key));
    sc.control_ids = [...new Set(built.plan.controls.map((c: any) => c.control_id ?? c.ref))].sort();
    sc.proposer = built.plan.proposer ?? proposer;
    sc.db_url = dbUrl;
    sc.engagement = built.case.engagement;
    const row = await one(built.db, "SELECT usage FROM model_proposals ORDER BY id DESC LIMIT 1");
    sc.usage = row ? row.usage : null;
    return sc;
  } finally {
    built.db.release();
    await built.pool.end();
  }
}

/** Repeated runs: per-run scorecards plus identity drift and score variability. */
export async function runMany(caseDir: string, proposer: "rules" | "model", baseUrl: string, replays?: string[], repeat = 1): Promise<any> {
  const runs: any[] = [];
  if (replays?.length) for (const r of replays) runs.push(await run(caseDir, proposer, baseUrl, r));
  else for (let i = 0; i < Math.max(1, repeat); i++) runs.push(await run(caseDir, proposer, baseUrl));
  const sets = runs.map((r) => new Set<string>(r.control_ids));
  const union = new Set(sets.flatMap((s) => [...s]));
  const stable = [...union].filter((id) => sets.every((s) => s.has(id)));
  const keys = ["controls_found", "module_hits", "criteria_defined_ok", "criteria_invented", "contradictions_found"];
  const spread: Record<string, [number, number]> = {};
  for (const k of keys) spread[k] = [Math.min(...runs.map((r) => r.totals[k])), Math.max(...runs.map((r) => r.totals[k]))];
  for (const k of ["unsupported_criteria", "missed_material_risks"]) spread[k] = [Math.min(...runs.map((r) => r.integrity[k])), Math.max(...runs.map((r) => r.integrity[k]))];
  return { runs, n: runs.length, identity: { stable: stable.sort(), drifting: [...union].filter((x) => !stable.includes(x)).sort(), stability: union.size ? stable.length / union.size : 1 }, spread };
}

export function formatMany(m: any): string {
  const lines = [`Repeated evaluation: ${m.n} run(s)`];
  m.runs.forEach((r: any, i: number) => { lines.push(`--- run ${i + 1}: ${r.proposer}`); lines.push(formatScorecard(r)); });
  lines.push(`\nIdentity drift across runs: stability ${Math.round(m.identity.stability * 100)}%; stable ids ${JSON.stringify(m.identity.stable)}; drifting ${m.identity.drifting.length ? JSON.stringify(m.identity.drifting) : "none"}`);
  lines.push("Score spread (min, max): " + Object.entries(m.spread).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", "));
  return lines.join("\n");
}

export function formatScorecard(sc: any): string {
  const t = sc.totals;
  const lines = [`Proposer: ${sc.proposer}`,
    `  controls found        ${t.controls_found}/${t.controls_expected}`,
    `  module mappings       ${t.module_hits}/${t.module_expected} expected hit, ${t.module_extra} extra`,
    `  defined criteria      ${t.criteria_defined_ok}/${t.criteria_defined_expected} quoted correctly`,
    `  undefined criteria    ${t.criteria_undefined_ok}/${t.criteria_undefined_expected} left undefined, ${t.criteria_invented} invented`,
    `  contradictions        ${t.contradictions_found}/${t.contradictions_expected} detected`,
    `  gaps surfaced         ${t.not_covered_found}/${t.not_covered_expected} expected not-covered expectations visible`,
    `  distractors mapped    ${t.distractors_mapped}/${t.distractors} (lower is better)`,
    `  engine guardrails     ${t.engine_unverified} unverified sources, ${t.engine_omissions} omitted expectations filled`,
    `  validation            ${t.blocking_findings} blocking, ${t.warnings} warnings`];
  if (sc.integrity) {
    const { integrity: i, quality: q, formatting: f } = sc;
    lines.push(`  INTEGRITY  unsupported criteria ${i.unsupported_criteria}; missed material risks ${i.missed_material_risks}/${i.material_risks_expected}; omitted necessary procedures ${i.omitted_procedures}/${i.procedures_expected}`);
    for (const d of i.omitted_detail.slice(0, 6)) lines.push(`             - ${d}`);
    lines.push(`  QUALITY    evidence ${q.evidence_hits}/${q.evidence_expected}; population ${q.population_hits}/${q.population_expected}; pass/fail ${q.pass_fail_hits}/${q.pass_fail_expected}; client-specific questions ${q.questions_specific}/${q.questions_total}`);
    lines.push(`  FORMATTING engine corrections ${f.corrections} ${Object.keys(f.kinds).length ? JSON.stringify(f.kinds) : ""}`);
    lines.push(`  key status: ${sc.key_status}`);
    lines.push(`  control ids: ${JSON.stringify(sc.control_ids)}`);
  }
  if (sc.usage) lines.push(`  model usage           ${sc.usage.model}: ${sc.usage.input_tokens} in / ${sc.usage.output_tokens} out, cache read ${sc.usage.cache_read}`);
  for (const r of sc.rows) lines.push(`    ${r.control.padEnd(20)} found=${String(r.found).padEnd(5)} modules expected ${JSON.stringify(r.modules_expected)} proposed ${JSON.stringify(r.modules_proposed)} refs ${JSON.stringify(r.proposed_refs)}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- review evaluation with planted deficiencies

const ctrlAt = (proposal: any, doc: string, line: number) => proposal.controls.find((c: any) => c.source.doc === doc && c.source.line_start <= line && line <= c.source.line_end);

/** Degrade a good proposal in known ways. `spec` (the case's review_eval.json) names the controls by source line. */
export function plantDeficiencies(proposal: any, sp: any): [any, any[]] {
  const p = JSON.parse(JSON.stringify(proposal));
  const planted: any[] = [];
  let c = ctrlAt(p, sp.omit.doc, sp.omit.line);   // 1 omitted control
  if (c) { p.controls.splice(p.controls.indexOf(c), 1); planted.push({ id: "omitted_control", doc: sp.omit.doc, line: sp.omit.line, categories: ["omitted_control", "omitted_risk", "omitted_procedure"], code: "" }); }
  const u = sp.unsupported;   // 2 unsupported criterion citing a line the engine's lenient check accepts
  c = ctrlAt(p, u.control_doc, u.control_line);
  if (c) {
    c.criteria = [...c.criteria.filter((k: any) => k.attribute !== u.attribute), { attribute: u.attribute, status: "defined", criterion: u.criterion, source: { doc: u.cite_doc, line: u.cite_line } }];
    planted.push({ id: "unsupported_criterion", doc: u.control_doc, line: u.control_line, categories: ["unsupported_criterion", "contradictory_criterion"], code: u.attribute });
  }
  [sp.applicability, ...(sp.overstatements ?? [])].forEach((a: any, i: number) => {   // 3 overstated contributions
    const cc = ctrlAt(p, a.control_doc, a.control_line);
    if (!cc) return;
    for (const x of cc.contributions) if (x.expectation === a.expectation) { x.value = "full"; x.rationale = a.rationale; }
    planted.push({ id: i === 0 ? "incorrect_applicability" : `overstated_contribution_${i}`, doc: a.control_doc, line: a.control_line,
      categories: ["incorrect_applicability", "overstated_contribution", "omitted_risk", "contradictory_criterion", "unsupported_criterion"], code: a.expectation, codes_alt: a.codes_alt ?? [], spec: a });
  });
  const w = sp.weak_evidence;   // 4 weak evidence
  c = ctrlAt(p, w.control_doc, w.control_line);
  if (c) {
    c.procedures = [...c.procedures.filter((x: any) => x.attribute !== w.attribute), { attribute: w.attribute, procedure: w.procedure, pass_fail: w.pass_fail, evidence_requests: [w.evidence] }];
    planted.push({ id: "weak_evidence", doc: w.control_doc, line: w.control_line, categories: ["weak_evidence"], code: w.attribute });
  }
  const d = sp.dropped_contradiction;   // 5 dropped contradiction: criterion stated from one source only
  c = ctrlAt(p, d.control_doc, d.control_line);
  if (c) {
    c.contradictions = c.contradictions.filter((x: any) => proposerModel.subjectField(x.subject) !== d.subject);
    c.criteria = [...c.criteria.filter((k: any) => k.attribute !== d.attribute), { attribute: d.attribute, status: "defined", criterion: d.criterion, source: { doc: d.cite_doc, line: d.cite_line } }];
    planted.push({ id: "dropped_contradiction", doc: d.control_doc, line: d.control_line, categories: ["contradictory_criterion", "unsupported_criterion"], code: d.attribute, subject: d.subject });
  }
  return [p, planted];
}

async function controlLine(db: Db, plan: any, controlId: string): Promise<[string | null, number | null]> {
  const pc = plan.controls.find((c: any) => c.control_id === controlId || c.ref === controlId);
  if (!pc) return [null, null];
  const row = await one(db, "SELECT doc_type FROM documents WHERE id = $1", [pc.source.doc_id]);
  return [row ? row.doc_type : null, pc.source.line_no];
}

export async function scoreReview(db: Db, planted: any[], notes: any[], planBefore: any, planAfter: any, sp: any): Promise<any> {
  const detected: Record<string, boolean> = {}, fixed: Record<string, boolean> = {};
  for (const pl of planted) {
    let hit = false;
    for (const n of notes) {
      if (!pl.categories.includes(n.category)) continue;
      if (pl.id === "omitted_control") {
        if (n.source?.doc === pl.doc && Math.abs(Number(n.source?.line ?? -9) - pl.line) <= 1) hit = true;
      } else {
        const [doc, line] = await controlLine(db, planBefore, n.control_id);
        const codeOk = [pl.code, ...(pl.codes_alt ?? [])].includes(n.code) || (pl.id === "dropped_contradiction" && [pl.code, pl.subject].includes(n.code));
        if (doc === pl.doc && line === pl.line && codeOk) hit = true;
      }
    }
    detected[pl.id] = hit;
  }
  const docTypes = new Map<number, string>((await all(db, "SELECT id, doc_type FROM documents")).map((r) => [r.id, r.doc_type]));
  const ctrlAfter = (doc: string, line: number) => planAfter.controls.find((c: any) => docTypes.get(c.source.doc_id) === doc && c.source.line_no <= line && line <= (c.source.line_end ?? c.source.line_no));
  let c = ctrlAfter(sp.omit.doc, sp.omit.line);
  fixed.omitted_control = Boolean(c && c.module);
  c = ctrlAfter(sp.unsupported.control_doc, sp.unsupported.control_line);
  fixed.unsupported_criterion = Boolean(c) && c.criteria_register.criteria[sp.unsupported.attribute]?.status !== "defined";
  for (const pl of planted) {
    if (pl.id.startsWith("incorrect_applicability") || pl.id.startsWith("overstated_contribution")) {
      const a = pl.spec;
      c = ctrlAfter(a.control_doc, a.control_line);
      fixed[pl.id] = Boolean(c) && c.contributions[a.expectation]?.value !== "full";
    }
  }
  c = ctrlAfter(sp.weak_evidence.control_doc, sp.weak_evidence.control_line);
  const ev = norm((c ? c.procedures : []).filter((p: any) => p.attribute === sp.weak_evidence.attribute).flatMap((p: any) => p.evidence_requests).join(" "));
  fixed.weak_evidence = Boolean(c) && sp.weak_evidence.expected_keywords.some((k: string) => ev.includes(norm(k)));
  c = ctrlAfter(sp.dropped_contradiction.control_doc, sp.dropped_contradiction.control_line);
  fixed.dropped_contradiction = Boolean(c) && planAfter.contradictions.some((x: any) => x.subject === sp.dropped_contradiction.subject && x.control_ref === c.control_id);
  const unsupportedBefore = planBefore.information_gaps.filter((g: any) => g.kind === "unverified criterion").length;
  const unsupportedAfter = planAfter.information_gaps.filter((g: any) => g.kind === "unverified criterion").length;
  return { detected, fixed, unsupported_before: unsupportedBefore, unsupported_after: unsupportedAfter,
    findings_total: notes.length, findings_verified: notes.filter((n) => n.verified).length,
    escalated: notes.filter((n) => n.status === "escalated").map((n) => n.id),
    resolved_checked: notes.filter((n) => n.status === "resolved").length,
    accepted_unfixed: notes.filter((n) => n.fix_check && !n.fix_check.fixed && n.planner_response?.decision === "accepted").length };
}

/** `intoExisting`: write into the database at baseUrl itself (used by `seed` for the workspace) instead of a new evaluation database. */
export async function runReviewEval(caseDir: string, baseProposal: string, baseUrl: string, transports?: workflow.Transports, maxCycles = workflow.MAX_CYCLES, dbName?: string, intoExisting = false): Promise<any> {
  const spec = JSON.parse(readFileSync(join(caseDir, "review_eval.json"), "utf8"));
  const good = JSON.parse(readFileSync(baseProposal, "utf8"));
  const [degraded, planted] = plantDeficiencies(good, spec);
  const tmp = join(process.env.TMPDIR ?? "/tmp", `soxplan-degraded-${process.pid}-${Date.now()}.json`);
  writeFileSync(tmp, JSON.stringify(degraded));
  const dbUrl = intoExisting ? baseUrl : await evalDatabase(baseUrl, dbName);
  const built = await buildCase(caseDir, "model", dbUrl, tmp);
  const { db, case: kase } = built;
  try {
    const planBefore = built.plan;
    const out = await workflow.reviewCycle(db, "reviewer-agent", kase.engagement, transports ?? {}, maxCycles);
    const pv = await planning.getPlan(db, kase.engagement);
    const notes = await all(db, "SELECT n.* FROM review_notes n JOIN reviews rv ON rv.id = n.review_id WHERE rv.engagement_id = (SELECT id FROM engagements WHERE name = $1) ORDER BY n.id", [kase.engagement]);
    const sc = await scoreReview(db, planted, notes, planBefore, pv.plan, spec);
    Object.assign(sc, { cycles: out.cycles, final_plan_version: out.final_plan_version, planted: planted.map((p) => p.id), db_url: dbUrl, engagement: kase.engagement });
    if (!transports) {   // save raw responses for replay when they came from a live model
      const runs = join(caseDir, "runs");
      if (!existsSync(runs)) mkdirSync(runs);
      const ts = now().replace(/:/g, "");
      for (const r of await all(db, "SELECT cycle, pass1, pass2 FROM reviews ORDER BY id")) {
        writeFileSync(join(runs, `review-${ts}-c${r.cycle}-pass1.json`), JSON.stringify(r.pass1));
        writeFileSync(join(runs, `review-${ts}-c${r.cycle}-pass2.json`), JSON.stringify(r.pass2));
      }
      for (const r of await all(db, "SELECT content FROM model_proposals WHERE proposer = 'model-revision' ORDER BY id")) writeFileSync(join(runs, `review-${ts}-revision.json`), JSON.stringify(r.content));
    }
    sc.usage = (await all(db, "SELECT usage FROM reviews ORDER BY id")).map((r) => r.usage);
    return sc;
  } finally {
    db.release();
    await built.pool.end();
  }
}

export function formatReviewEval(sc: any): string {
  const lines = [`Review evaluation on planted deficiencies: ${JSON.stringify(sc.planted)}`,
    `  cycles run: ${JSON.stringify(sc.cycles.map((c: any) => [c.cycle, c.findings, c.actionable]))} (cycle, findings, actionable); final plan version ${sc.final_plan_version}`,
    `  findings: ${sc.findings_total} total, ${sc.findings_verified} verified; escalated to human: ${sc.escalated.length ? JSON.stringify(sc.escalated) : "none"}`];
  for (const pid of sc.planted) lines.push(`  ${pid.padEnd(24)} detected=${String(sc.detected[pid]).padEnd(5)} fixed after revision=${sc.fixed[pid]}`);
  lines.push(`  unsupported criteria (engine-caught) before ${sc.unsupported_before}, after ${sc.unsupported_after}  (after must not exceed before)`);
  lines.push(`  resolved only by objective fix check: ${sc.resolved_checked ?? 0}; accepted by planner but not demonstrably fixed: ${sc.accepted_unfixed ?? 0}`);
  lines.push(`  database: ${sc.db_url}`);
  lines.push("  This measures detection and repair of planted defects; it is not an audit-quality opinion on the reviewer.");
  return lines.join("\n");
}

export const caseName = (p: string) => basename(p);
