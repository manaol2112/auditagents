/** Command-line interface. Every mutating command names the acting user with --as.
 *
 * Connection: DATABASE_URL (default postgres://soxplan:soxplan@127.0.0.1:5432/soxplan); `--db NAME` selects another
 * database on the same server. `.env` in the working directory is loaded if present (CLAUDE_API_KEY for the model agents).
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";
import * as approvals from "./approvals.js";
import * as audit from "./audit.js";
import { addMember, changeRole, disableUser, setPassword } from "./auth.js";
import { acceptIntakeFinding, extractUpload, intakeFindings } from "./rcm/extract.js";
import { MappingProposal, proposalAsConfirmation } from "./rcm/mapping.js";
import { templateRcm } from "./rcm/demo.js";
import { confirmMapping, getMapping, storeUpload } from "./rcm/upload.js";
import { randomBytes } from "node:crypto";
import { EngineError, REPO_ROOT, createDatabase, databaseName, dropDatabase, j, migrate, now, one, all, withDatabase } from "./db.js";
import * as evalharness from "./evalharness.js";
import * as identity from "./identity.js";
import * as intake from "./intake.js";
import * as methodology from "./methodology.js";
import * as planning from "./planning.js";
import * as proposerModel from "./proposerModel.js";
import * as review from "./review.js";
import { serve } from "./server.js";
import * as workflow from "./workflow.js";

export const DEFAULT_URL = "postgres://soxplan:soxplan@127.0.0.1:5432/soxplan";

type Opts = Record<string, string | boolean | undefined>;
interface Ctx { url: string; pool?: pg.Pool; db?: pg.PoolClient }

async function conn(ctx: Ctx): Promise<pg.PoolClient> {
  if (ctx.db) return ctx.db;
  ctx.pool = new pg.Pool({ connectionString: ctx.url, max: 4 });
  await migrate(ctx.pool);
  ctx.db = await ctx.pool.connect();
  return ctx.db;
}

async function clientId(db: pg.PoolClient, name: string): Promise<number> {
  const row = await one(db, "SELECT id FROM clients WHERE name = $1", [name]);
  if (!row) throw new EngineError(`unknown client '${name}'`);
  return row.id;
}

const need = (o: Opts, k: string): string => {
  const v = o[k];
  if (typeof v !== "string" || !v) throw new EngineError(`--${k} is required`);
  return v;
};
const actor = (o: Opts) => need(o, "as");
const list = (s: string | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

type Cmd = (ctx: Ctx, pos: string[], o: Opts) => Promise<void>;

const commands: Record<string, Cmd> = {
  async migrate(ctx) {
    const applied = await (async () => { const p = new pg.Pool({ connectionString: ctx.url, max: 1 }); try { return await migrate(p); } finally { await p.end(); } })();
    console.log(`database ${databaseName(ctx.url)}: ${applied.length ? "applied " + applied.join(", ") : "up to date"}`);
  },
  async init(ctx) {
    await createDatabase(ctx.url, databaseName(ctx.url));
    const db = await conn(ctx);
    await audit.recordEvent(db, "system", "db.init", "database", databaseName(ctx.url), {});
    console.log(`initialised ${databaseName(ctx.url)}`);
  },
  async "drop-db"(ctx, pos) {
    const name = pos[0];
    if (!name) throw new EngineError("usage: drop-db NAME");
    await dropDatabase(ctx.url, name);
    console.log(`dropped ${name}`);
  },
  async "add-user"(ctx, pos, o) {
    const [name, role] = pos;
    if (!name || !role) throw new EngineError("usage: add-user NAME ROLE --as USER   (password from SOXPLAN_PASSWORD for people who sign in)");
    const db = await conn(ctx);
    // Bootstrap: anyone may add the first person; once an administrator exists only an administrator adds users
    // (before that, an approver, as in earlier versions).
    const admins = Number((await one(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL"))!.n);
    if (admins) await audit.requireRole(db, actor(o), "admin");
    else if (Number((await one(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'approver'"))!.n)) await audit.requireRole(db, actor(o), "approver", "admin");
    await audit.addUser(db, actor(o), name, role);
    if (process.env.SOXPLAN_PASSWORD && role !== "agent") await setPassword(db, actor(o), name, process.env.SOXPLAN_PASSWORD);
    console.log(`user ${name} (${role}) added${process.env.SOXPLAN_PASSWORD && role !== "agent" ? " with a password" : ""}`);
  },
  async "set-password"(ctx, pos, o) {
    const [name] = pos;
    const pw = process.env.SOXPLAN_PASSWORD;
    if (!name || !pw) throw new EngineError("usage: SOXPLAN_PASSWORD=... set-password NAME --as USER (passwords are never taken on the command line)");
    const db = await conn(ctx);
    if (actor(o) !== name) await audit.requireRole(db, actor(o), "admin", ...(Number((await one(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"))!.n) ? [] : ["approver"]));
    await setPassword(db, actor(o), name, pw);
    console.log(actor(o) === name ? `password changed for ${name}; their sessions were ended`
      : `temporary password set for ${name}: they must change it at their next sign-in; their sessions were ended`);
  },
  async "set-role"(ctx, pos, o) {
    const [name, role] = pos;
    if (!name || !role) throw new EngineError("usage: set-role NAME reader|preparer|approver|admin --as ADMIN");
    const db = await conn(ctx);
    await audit.requireRole(db, actor(o), "admin");
    await changeRole(db, actor(o), name, role);
    console.log(`${name} is now ${role}; their sessions were ended`);
  },
  async "disable-user"(ctx, pos, o) {
    const [name] = pos;
    if (!name) throw new EngineError("usage: disable-user NAME --reason ... --as ADMIN");
    const db = await conn(ctx);
    await audit.requireRole(db, actor(o), "admin");
    await disableUser(db, actor(o), name, need(o, "reason"));
    console.log(`${name} is retired: the name and its history are kept; it can no longer sign in`);
  },
  async "add-member"(ctx, pos, o) {
    const [engagement, user] = pos;
    if (!engagement || !user) throw new EngineError("usage: add-member ENGAGEMENT USER --as USER");
    const db = await conn(ctx);
    await audit.requireRole(db, actor(o), "preparer", "approver");
    const e = await one(db, "SELECT id FROM engagements WHERE name = $1", [engagement]);
    if (!e) throw new EngineError("unknown engagement");
    await addMember(db, actor(o), e.id, user);
    console.log(`${user} is now a member of ${engagement}`);
  },
  async "add-client"(ctx, pos, o) {
    const [name] = pos;
    if (!name) throw new EngineError("usage: add-client NAME --fiscal-year-end D --time-zone TZ --as USER");
    const db = await conn(ctx);
    await audit.requireRole(db, actor(o), "agent", "preparer", "approver");
    const row = await one(db, "INSERT INTO clients (name, fiscal_year_end, time_zone) VALUES ($1,$2,$3) RETURNING id", [name, need(o, "fiscal-year-end"), need(o, "time-zone")]);
    await audit.recordEvent(db, actor(o), "client.add", "client", row!.id, { name });
    console.log(`client ${name} added (id ${row!.id})`);
  },
  async ingest(ctx, pos, o) {
    const [client, ...files] = pos;
    if (!client || !files.length) throw new EngineError("usage: ingest CLIENT FILE... --as USER");
    const db = await conn(ctx);
    const cid = await clientId(db, client);
    for (const f of files) console.log(`ingested ${f} as document ${await intake.ingestDocument(db, actor(o), cid, resolve(f))}`);
  },
  async extract(ctx, pos, o) {
    const [client] = pos;
    if (!client) throw new EngineError("usage: extract CLIENT [--proposer rules|model] [--systems a,b] [--replay FILE] --as USER");
    const db = await conn(ctx);
    const cid = await clientId(db, client);
    const proposer = (o.proposer as string) ?? "rules";
    let snap: number;
    if (proposer === "model") {
      snap = await proposerModel.extractWithModel(db, actor(o), cid, list(o.systems as string), o.replay ? proposerModel.replayTransport(String(o.replay)) : undefined, undefined, scope(o));
    } else {
      snap = await intake.extract(db, actor(o), cid);
    }
    const n = (await one(db, "SELECT COUNT(*) AS n FROM controls WHERE snapshot_id = $1", [snap]))!.n;
    console.log(`snapshot ${snap} frozen with ${n} controls (${proposer})`);
  },
  async "new-engagement"(ctx, pos, o) {
    const [client, name] = pos;
    if (!client || !name) throw new EngineError("usage: new-engagement CLIENT NAME --period-start D --period-end D --as-of D --systems a,b [--modules AC-UAR,CM-CHG|all] --as USER");
    const db = await conn(ctx);
    await audit.requireRole(db, actor(o), "agent", "preparer", "approver");
    const cid = await clientId(db, client);
    // The latest frozen snapshot is pinned when one exists; otherwise the engagement starts empty and an RCM upload pins one.
    const snap = (await one(db, "SELECT id FROM snapshots WHERE client_id = $1 AND record_hash <> 'pending' ORDER BY id DESC LIMIT 1", [cid])) ?? { id: null };
    const data = methodology.load();
    const systems = list(need(o, "systems"));
    const modules = scope(o);
    const scoped = methodology.scoped(data, modules);   // refuses unknown module codes
    const row = await one(db, "INSERT INTO engagements (client_id, name, period_start, period_end, as_of, systems, methodology_version, methodology_hash, snapshot_id, created_by, created_at, modules) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
      [cid, name, need(o, "period-start"), need(o, "period-end"), need(o, "as-of"), j(systems), data.version, data.document_hash, snap.id, actor(o), now(), modules ? j(modules) : null]);
    await addMember(db, actor(o), row!.id, actor(o));
    await audit.recordEvent(db, actor(o), "engagement.create", "engagement", row!.id, { methodology_version: data.version, methodology_hash: data.document_hash, snapshot_id: snap.id, systems,
      modules: scoped.modules.map((m) => m.code), modules_out_of_scope: data.modules.filter((m) => !(m.code in scoped.modulesByCode)).map((m) => m.code) });
    console.log(`engagement ${name} created, pinned to methodology ${data.version} (${data.document_hash.slice(0, 12)}) and ${snap.id ? `snapshot ${snap.id}` : "no snapshot yet (upload the RCM)"}; ${scoped.modules.length} of ${data.modules.length} modules in scope`);
  },
  async "rcm-upload"(ctx, pos, o) {
    const [engagement, file] = pos;
    if (!engagement || !file) throw new EngineError("usage: rcm-upload ENGAGEMENT FILE.xlsx|FILE.csv --as USER");
    const db = await conn(ctx);
    const r = await storeUpload(db, actor(o), engagement, basename(file), readFileSync(resolve(file)));
    const m = await getMapping(db, r.upload_id);
    console.log(`${r.existing ? "already uploaded as" : "uploaded as"} ${r.upload_id} (${r.sha256.slice(0, 12)}); profile ${m.proposal.profile}`);
    printMapping(m.proposal);
  },
  async "rcm-mapping"(ctx, pos) {
    const [id] = pos;
    if (!id) throw new EngineError("usage: rcm-mapping UPLOAD_ID [--json]");
    const db = await conn(ctx);
    const m = await getMapping(db, Number(id));
    printMapping(m.proposal);
    if (m.confirmed) console.log(`confirmed version ${m.version} by ${m.confirmed_by} at ${m.confirmed_at}`);
  },
  async "rcm-confirm"(ctx, pos, o) {
    const [id, file] = pos;
    if (!id) throw new EngineError("usage: rcm-confirm UPLOAD_ID [MAPPING.json] --as USER   (without a file: the proposal as it stands)");
    const db = await conn(ctx);
    const conf = file ? JSON.parse(readFileSync(resolve(file), "utf8")) : proposalAsConfirmation((await getMapping(db, Number(id))).proposal);
    const r = await confirmMapping(db, actor(o), Number(id), conf);
    console.log(`mapping version ${r.version} confirmed`);
    for (const w of r.warnings) console.log(`  ! ${w}`);
  },
  async "rcm-extract"(ctx, pos, o) {
    const [id] = pos;
    if (!id) throw new EngineError("usage: rcm-extract UPLOAD_ID --as USER");
    const db = await conn(ctx);
    const r = await extractUpload(db, actor(o), Number(id));
    console.log(`snapshot ${r.snapshot_id} pinned; ${JSON.stringify(r.counts)}; findings ${r.findings.blocking} blocking, ${r.findings.warning} warnings, ${r.findings.info} info`);
    await commands["rcm-findings"](ctx, [id], {});
  },
  async "rcm-findings"(ctx, pos) {
    const [id] = pos;
    if (!id) throw new EngineError("usage: rcm-findings UPLOAD_ID");
    const db = await conn(ctx);
    for (const f of await intakeFindings(db, Number(id))) console.log(`  #${String(f.id).padEnd(4)} ${f.severity.padEnd(8)} ${f.status.padEnd(17)} ${f.check.padEnd(26)} ${f.message}`);
  },
  async "rcm-accept"(ctx, pos, o) {
    const [id] = pos;
    if (!id) throw new EngineError("usage: rcm-accept FINDING_ID --reason ... --as USER");
    const db = await conn(ctx);
    await acceptIntakeFinding(db, actor(o), Number(id), need(o, "reason"));
    console.log(`intake finding ${id} accepted`);
  },
  async plan(ctx, pos, o) {
    const [engagement] = pos;
    if (!engagement) throw new EngineError("usage: plan ENGAGEMENT [--proposer rules|model] --as USER");
    const db = await conn(ctx);
    const proposer = ((o.proposer as string) ?? "rules") as "rules" | "model";
    const pv = await planning.generatePlan(db, actor(o), engagement, proposer, proposer === "model" ? proposerModel.modelProposals : undefined);
    const row = (await one(db, "SELECT version, content_hash FROM plan_versions WHERE id = $1", [pv]))!;
    const plan = (await planning.getPlan(db, engagement)).plan;
    const b = plan.validation.filter((x: any) => x.severity === "blocking").length, w = plan.validation.filter((x: any) => x.severity === "warning").length;
    console.log(`draft plan version ${row.version} (${row.content_hash.slice(0, 12)}) by ${plan.proposer ?? "rules"}: ${b} blocking, ${w} warnings`);
  },
  async show(ctx, pos, o) {
    const [engagement] = pos;
    if (!engagement) throw new EngineError("usage: show ENGAGEMENT [--version N] [--json] [--verbose]");
    const db = await conn(ctx);
    const pv = await planning.getPlan(db, engagement, o.version ? Number(o.version) : null);
    const plan = pv.plan;
    if (o.json) { console.log(JSON.stringify(plan, null, 2)); return; }
    console.log(`Engagement ${plan.engagement.name}  version ${pv.version}  status ${pv.status}  hash ${pv.content_hash.slice(0, 12)}  proposer ${plan.proposer ?? "rules"}`);
    console.log(`Pinned: methodology ${plan.pins.methodology_version} (${plan.pins.methodology_document_hash.slice(0, 12)}), snapshot ${plan.pins.snapshot_id} (${plan.pins.snapshot_hash.slice(0, 12)})`);
    console.log(`Gate: ${plan.gate}`);
    if (pv.decided_by) console.log(`Decided by ${pv.decided_by} at ${pv.decided_at}: ${pv.decision_note}`);
    console.log("\nCoverage cells");
    for (const c of plan.coverage_cells) console.log(`  ${c.system.padEnd(10)} ${c.module.padEnd(8)} ${c.status.padEnd(28)} ${c.rationale}`);
    console.log("\nControls");
    for (const pc of plan.controls) {
      console.log(`  ${pc.ref} [${pc.control_id ?? "?"}] -> ${pc.module ?? "unmapped"} (${pc.control_type}; ${pc.systems.join(", ")})` + (pc.risk_mismatch ? "  RISK MISMATCH" : ""));
      if (!pc.module) continue;
      for (const p of pc.procedures) {
        const src = p.criterion_source ?? {};
        const where = "line_no" in src ? `${src.doc_type} line ${src.line_no}` : "methodology" in src ? `methodology ${src.methodology}` : "";
        console.log(`     ${p.attribute.padEnd(7)} ${p.status.padEnd(34)} criterion: ${String(p.operating_criterion).slice(0, 60).padEnd(60)} [${p.criterion_status}${where ? " @ " + where : ""}]`);
      }
      if (o.verbose) {
        console.log("     contributions: " + Object.entries<any>(pc.contributions).map(([k, v]) => `${k}=${v.value}`).join(", "));
        console.log("     walkthrough questions:");
        for (const q of pc.walkthrough_questions) console.log(`       - ${q}`);
      }
    }
    console.log("\nCoverage units not fully covered");
    for (const u of plan.coverage_units) {
      if (u.assessment !== "covered" && plan.coverage_cells.some((c: any) => c.status === "tested under a module" && c.system === u.system && c.module === u.module)) {
        console.log(`  ${u.system.padEnd(10)} ${u.expectation.padEnd(9)} ${u.assessment.padEnd(28)} ` + u.contributions.map((c: any) => `${c.control}=${c.value}`).join("; "));
      }
    }
    console.log("\nContradictions");
    for (const con of plan.contradictions) {
      const vals = con.sources.map((s: any) => `${s.key}='${s.value}'`).join("; ");
      console.log(`  #${con.id} ${con.control_ref} ${con.subject} [${con.materiality}, ${con.status}] ${vals}` + (con.status === "resolved" ? ` -> ${con.chosen_source} (${con.resolved_by})` : ""));
    }
    console.log();
    console.log(review.formatSummary(plan, Boolean(o.verbose)));
  },
  async resolve(ctx, pos, o) {
    const [engagement, id] = pos;
    if (!engagement || !id) throw new EngineError("usage: resolve ENGAGEMENT ID --choose SOURCE --reason ... --as USER");
    const db = await conn(ctx);
    await approvals.resolveContradiction(db, actor(o), engagement, Number(id), need(o, "choose"), need(o, "reason"));
    console.log(`contradiction ${id} resolved; run 'plan' to generate a new draft that uses the resolution`);
  },
  async identities(ctx, pos) {
    const [client] = pos;
    if (!client) throw new EngineError("usage: identities CLIENT");
    const db = await conn(ctx);
    const cid = await clientId(db, client);
    const snap = await one(db, "SELECT id FROM snapshots WHERE client_id = $1 ORDER BY id DESC LIMIT 1", [cid]);
    if (!snap) throw new EngineError("no snapshot");
    for (const r of await all(db, "SELECT control_id, identity_basis, ref, line_no FROM controls WHERE snapshot_id = $1 ORDER BY ref", [snap.id])) console.log(`  ${r.control_id.padEnd(16)} ${r.identity_basis.padEnd(12)} label ${r.ref.padEnd(12)} line ${r.line_no}`);
    for (const r of await all(db, "SELECT * FROM identity_links WHERE snapshot_id = $1 ORDER BY id", [snap.id])) {
      let extra = r.prior_control_id ? ` prior ${r.prior_control_id}` : "";
      if (Array.isArray(r.candidates) && r.candidates.length) extra += ` candidates ${JSON.stringify(r.candidates)}`;
      console.log(`  #${String(r.id).padEnd(4)} ${r.issue_type.padEnd(20)} ${r.control_id.padEnd(16)} ${r.status.padEnd(9)}${extra} ${r.decision ?? ""} ${r.resolution ?? ""}`);
    }
  },
  async "resolve-identity"(ctx, pos, o) {
    const [id] = pos;
    if (!id) throw new EngineError("usage: resolve-identity ID --decision D --reason ... [--choose X] --as USER");
    const db = await conn(ctx);
    await identity.resolve(db, actor(o), Number(id), need(o, "decision"), need(o, "reason"), o.choose as string | undefined);
    console.log(`identity issue ${id} resolved (${o.decision}); run 'plan' to apply`);
  },
  async review(ctx, pos, o) {
    const [engagement] = pos;
    if (!engagement) throw new EngineError("usage: review ENGAGEMENT [--version N] [--findings]");
    const db = await conn(ctx);
    const pv = await planning.getPlan(db, engagement, o.version ? Number(o.version) : null);
    console.log(review.formatSummary(pv.plan, Boolean(o.findings)));
  },
  async "review-plan"(ctx, pos, o) {
    const [engagement] = pos;
    if (!engagement) throw new EngineError("usage: review-plan ENGAGEMENT [--max-cycles N] [--replay pass1=f;f,pass2=f;f,revision=f] --as USER");
    const db = await conn(ctx);
    const out = await workflow.reviewCycle(db, actor(o), engagement, replays(o.replay as string | undefined), o["max-cycles"] ? Number(o["max-cycles"]) : workflow.MAX_CYCLES);
    console.log(JSON.stringify(out, null, 2));
    const pv = await planning.getPlan(db, engagement);
    for (const f of await workflow.findingsForVersion(db, pv.id)) console.log(`  #${String(f.id).padEnd(4)} ${f.status.padEnd(20)} ${f.significance.padEnd(6)} ${f.category.padEnd(24)} ${f.control_id} ${f.code} | ${f.rationale.slice(0, 100)}`);
  },
  async findings(ctx, pos, o) {
    const [engagement] = pos;
    if (!engagement) throw new EngineError("usage: findings ENGAGEMENT [--version N]");
    const db = await conn(ctx);
    const pv = await planning.getPlan(db, engagement, o.version ? Number(o.version) : null);
    printFindings(await workflow.findingsForVersion(db, pv.id));
  },
  async disposition(ctx, pos, o) {
    const [id] = pos;
    if (!id) throw new EngineError("usage: disposition ID --decision accept|dismiss --reason ... --as USER");
    const db = await conn(ctx);
    await workflow.dispositionFinding(db, actor(o), Number(id), need(o, "decision"), need(o, "reason"));
    console.log(`finding ${id}: ${o.decision}`);
  },
  async activity(ctx, pos, o) {
    const [engagement] = pos;
    if (!engagement) throw new EngineError("usage: activity ENGAGEMENT [--json]");
    const db = await conn(ctx);
    const eng = await one(db, "SELECT id FROM engagements WHERE name = $1", [engagement]);
    if (!eng) throw new EngineError("unknown engagement");
    printActivity(await workflow.activityLog(db, eng.id), Boolean(o.json));
  },
  async approve(ctx, pos, o) {
    const [engagement] = pos;
    if (!engagement) throw new EngineError("usage: approve ENGAGEMENT --note ... --as USER");
    const db = await conn(ctx);
    const pv = await approvals.approvePlan(db, actor(o), engagement, need(o, "note"));
    const row = (await one(db, "SELECT version, content_hash FROM plan_versions WHERE id = $1", [pv]))!;
    console.log(`approved version ${row.version} (${row.content_hash.slice(0, 12)}); it is now immutable`);
  },
  async reject(ctx, pos, o) {
    const [engagement] = pos;
    if (!engagement) throw new EngineError("usage: reject ENGAGEMENT --note ... --as USER");
    const db = await conn(ctx);
    console.log(`rejected plan version id ${await approvals.rejectPlan(db, actor(o), engagement, need(o, "note"))}`);
  },
  async history(ctx) {
    const db = await conn(ctx);
    const ok = await audit.verifyChain(db);
    for (const r of await all(db, "SELECT * FROM events ORDER BY id")) console.log(`${String(r.id).padStart(4)} ${r.ts} ${r.actor.padEnd(14)} ${r.action.padEnd(22)} ${r.entity}:${r.entity_id} ${JSON.stringify(r.detail).slice(0, 90)}`);
    console.log(`chain ${ok ? "intact" : "BROKEN"}`);
  },
  async demo(ctx) {
    /** End-to-end run on the fictional client in fixtures/northwind. */
    const fx = resolve(REPO_ROOT, "fixtures", "northwind");
    await createDatabase(ctx.url, databaseName(ctx.url));
    const db = await conn(ctx);
    await db.query("INSERT INTO users (name, role, display_name) VALUES ('preparer', 'preparer', 'Preparer'), ('reviewer', 'approver', 'Reviewer') ON CONFLICT DO NOTHING");
    const run = (name: string, pos: string[], o: Opts = {}) => commands[name](ctx, pos, o);
    await run("add-client", ["Northwind Foods"], { as: "preparer", "fiscal-year-end": "2026-12-31", "time-zone": "America/New_York" });
    await run("ingest", ["Northwind Foods", resolve(fx, "rcm.md"), resolve(fx, "narrative.md"), resolve(fx, "policy.md")], { as: "planner-agent" });
    await run("extract", ["Northwind Foods"], { as: "planner-agent", proposer: "rules" });
    await run("new-engagement", ["Northwind Foods", "NW-FY2026-ITGC"], { as: "preparer", "period-start": "2026-01-01", "period-end": "2026-12-31", "as-of": "2026-12-31", systems: "SAP ECC,Concur" });
    await run("plan", ["NW-FY2026-ITGC"], { as: "planner-agent", proposer: "rules" });
    console.log("\n--- attempting approval with an open material contradiction (expected to be refused)");
    try { await approvals.approvePlan(db, "reviewer", "NW-FY2026-ITGC", "approve"); } catch (e: any) { if (!(e instanceof EngineError)) throw e; console.log(`refused: ${e.message}`); }
    const con = (await one(db, "SELECT id, sources FROM contradictions WHERE status = 'open' AND materiality = 'material' ORDER BY id LIMIT 1"))!;
    const chosen = con.sources.map((s: any) => s.key).find((k: string) => k.startsWith("rcm"));
    console.log(`\n--- human resolves contradiction #${con.id} choosing ${chosen}`);
    await run("resolve", ["NW-FY2026-ITGC", String(con.id)], { as: "reviewer", choose: chosen, reason: "The RCM and the Access Management Policy agree on 5 business days; the narrative's 3 days is the team's internal target, confirmed with the SAP Security Manager." });
    await run("plan", ["NW-FY2026-ITGC"], { as: "planner-agent", proposer: "rules" });
    console.log("\n--- agent attempts to approve its own plan (expected to be refused)");
    try { await approvals.approvePlan(db, "planner-agent", "NW-FY2026-ITGC", "looks good"); } catch (e: any) { if (!(e instanceof EngineError)) throw e; console.log(`refused: ${e.message}`); }
    console.log("\n--- approver approves version 2");
    await run("approve", ["NW-FY2026-ITGC"], { as: "reviewer", note: "Warnings reviewed: the client documentation covers access review, provisioning, and change management only; every other module and the Concur provisioning and change cells are accepted as unresolved coverage gaps to be raised with the client, pending the Concur SOC 1 review; A-14 mapping to be re-examined in the walkthrough." });
    console.log();
    await run("show", ["NW-FY2026-ITGC"], {});
    console.log();
    await run("history", [], {});
  },
  async seed(ctx) {
    /** Idempotent demo data for the workspace: the Northwind deterministic plan and approval, and the Lumen agent review loop
     * replayed from recorded Claude responses (no API calls). Each is added only if its engagement is missing. */
    await createDatabase(ctx.url, databaseName(ctx.url));
    const db = await conn(ctx);
    const has = async (name: string) => Boolean(await one(db, "SELECT 1 FROM engagements WHERE name = $1", [name]));
    if (await has("NW-FY2026-ITGC")) console.log("Northwind: already present");
    else {
      const log = console.log; console.log = () => {};
      try { await commands.demo(ctx, [], {}); } finally { console.log = log; }
      console.log("Northwind: deterministic plan, contradiction resolved by a human, plan approved");
    }
    if (await has("LUMEN-FY2026-ITGC")) console.log("Lumen: already present");
    else await seedLumen();
    await commands["seed-rcm"](ctx, [], {});
    await commands["seed-access"](ctx, [], {});
    async function seedLumen() {
    const rp = resolve(REPO_ROOT, "evals", "lumen", "replays");
    const f = (n: string) => resolve(rp, n);
    if (!existsSync(f("proposal.json"))) { console.log(`Lumen: skipped, recorded responses not found in ${rp}`); return; }
    const t = replays(`pass1=${f("review-c1-pass1.json")};${f("review-c2-pass1.json")},pass2=${f("review-c1-pass2.json")};${f("review-c2-pass2.json")},revision=${f("revision.json")}`)!;
    const sc = await evalharness.runReviewEval(resolve(REPO_ROOT, "evals", "lumen"), f("proposal.json"), ctx.url, t, workflow.MAX_CYCLES, undefined, true);
    console.log(`Lumen: Planning Agent + Independent Reviewer replayed: ${sc.findings_total} findings, ${sc.resolved_checked} resolved by the fix check, ${sc.escalated.length} escalated to the human`);
    }
  },
  async "seed-access"(ctx) {
    /** Demo sign-in: 'preparer' (prepares), 'reviewer' (approves), and 'rj' (administrator: manages people and access, and
     * can view the demo engagements as a member, but neither prepares nor approves). Each is a member of every engagement.
     * Passwords are random, set only when the account has none, and printed once. The earlier demo accounts 'pat' and 'ann'
     * are retired: their names stay in the audit trail, but they can no longer sign in. */
    const db = await conn(ctx);
    const people: [string, string, string][] = [["preparer", "preparer", "Preparer"], ["reviewer", "approver", "Reviewer"], ["rj", "admin", "RJ (administrator)"]];
    const printed: string[] = [];
    for (const [name, role, display] of people) {
      const u = await one(db, "SELECT role FROM users WHERE name = $1", [name]);
      if (!u) await audit.addUser(db, "system", name, role);
      else if (u.role !== role) {
        await db.query("UPDATE users SET role = $1 WHERE name = $2", [role, name]);
        await db.query("DELETE FROM sessions WHERE user_name = $1", [name]);
        await audit.recordEvent(db, "system", "user.role", "user", name, { from: u.role, to: role, reason: "demo accounts" });
      }
      await db.query("UPDATE users SET display_name = $1, disabled_at = NULL, disabled_by = NULL WHERE name = $2", [display, name]);
      const pwRow = (await one(db, "SELECT password_hash FROM users WHERE name = $1", [name]))!;
      if (!pwRow.password_hash) {
        const pw = randomBytes(15).toString("base64url");
        await setPassword(db, "system", name, pw);
        printed.push(`  ${name.padEnd(9)} ${role.padEnd(9)} password: ${pw}`);
      }
      for (const e of await all(db, "SELECT id FROM engagements")) await addMember(db, "system", e.id, name);
    }
    for (const old of ["pat", "ann"]) {
      const u = await one(db, "SELECT disabled_at FROM users WHERE name = $1", [old]);
      if (u && !u.disabled_at) { await disableUser(db, "system", old, "earlier demo account, replaced by 'preparer' and 'reviewer'"); console.log(`Retired the earlier demo account '${old}' (its history is kept).`); }
    }
    if (printed.length) console.log("Demo sign-in (shown once; reset with: SOXPLAN_PASSWORD=... soxplan set-password NAME --as rj):\n" + printed.join("\n"));
    else console.log("Demo sign-in: preparer, reviewer, and rj (administrator) already have passwords; reset one with SOXPLAN_PASSWORD=... soxplan set-password NAME --as rj");
  },
  async "seed-rcm"(ctx) {
    /** A third demo engagement that goes through the RCM path: the template, filled in, uploaded, mapped, extracted, planned. */
    const db = await conn(ctx);
    if (await one(db, "SELECT 1 FROM engagements WHERE name = 'NW-RCM-FY2026'")) { console.log("Northwind RCM upload: already present"); return; }
    for (const [name, role] of [["preparer", "preparer"], ["reviewer", "approver"]] as const) if (!(await one(db, "SELECT 1 FROM users WHERE name = $1", [name]))) await audit.addUser(db, "system", name, role);
    const client = await one(db, "SELECT id FROM clients WHERE name = 'Northwind Foods'");
    if (!client) throw new EngineError("run seed first (the Northwind client)");
    const data = methodology.load();
    const e = (await one(db, "INSERT INTO engagements (client_id, name, period_start, period_end, as_of, systems, methodology_version, methodology_hash, snapshot_id, created_by, created_at, modules) VALUES ($1,'NW-RCM-FY2026','2026-01-01','2026-12-31','2026-12-31',$2,$3,$4,NULL,'preparer',$5,NULL) RETURNING id",
      [client.id, j(["SAP ECC"]), data.version, data.document_hash, now()]))!;
    await addMember(db, "preparer", e.id, "preparer");
    await audit.recordEvent(db, "preparer", "engagement.create", "engagement", e.id, { methodology_version: data.version, snapshot_id: null, systems: ["SAP ECC"], modules: data.modules.map((m) => m.code) });
    const up = await storeUpload(db, "preparer", "NW-RCM-FY2026", "northwind-itgc-rcm.xlsx", await templateRcm());
    await confirmMapping(db, "preparer", up.upload_id, proposalAsConfirmation((await getMapping(db, up.upload_id)).proposal));
    const ex = await extractUpload(db, "preparer", up.upload_id);
    await planning.generatePlan(db, "preparer", "NW-RCM-FY2026", "rules");
    console.log(`Northwind RCM upload: template RCM uploaded, mapped, extracted (${ex.counts.itgc_controls} ITGCs; ${ex.findings.blocking} blocking, ${ex.findings.warning} warning findings) and planned`);
  },
  async eval(ctx, _pos, o) {
    const kase = resolve(need(o, "case"));
    const out: string[] = [];
    const rp = o.replay ? String(o.replay).split(",") : undefined;
    const repeat = o.repeat ? Number(o.repeat) : 1;
    for (const proposer of list((o.proposers as string) ?? "rules,model") as ("rules" | "model")[]) {
      try {
        if ((rp && rp.length > 1) || repeat > 1) { out.push(evalharness.formatMany(await evalharness.runMany(kase, proposer, ctx.url, proposer === "model" ? rp : undefined, repeat))); continue; }
        const sc = await evalharness.run(kase, proposer, ctx.url, rp?.[0]);
        out.push(evalharness.formatScorecard(sc));
        if (o.show) { const sub: Ctx = { url: sc.db_url }; await commands.show(sub, [sc.engagement], { verbose: o.verbose }); await close(sub); }
      } catch (e: any) {
        if (!(e instanceof EngineError)) throw e;
        out.push(`Proposer: ${proposer}\n  not run: ${e.message}`);
      }
    }
    console.log(out.join("\n\n"));
  },
  async "eval-review"(ctx, _pos, o) {
    const sc = await evalharness.runReviewEval(resolve(need(o, "case")), resolve(need(o, "base")), ctx.url, replays(o.replay as string | undefined, true), o["max-cycles"] ? Number(o["max-cycles"]) : workflow.MAX_CYCLES, o["out-db"] as string | undefined);
    console.log(evalharness.formatReviewEval(sc));
    if (o.show) {
      const sub: Ctx = { url: sc.db_url };
      await commands.findings(sub, [sc.engagement], {});
      console.log();
      await commands.activity(sub, [sc.engagement], {});
      await close(sub);
    }
  },
  async compare(ctx, _pos, o) {
    /** Deterministic and model-backed planning on the same client documents, side by side. */
    const kase = resolve(need(o, "case"));
    for (const proposer of ["rules", "model"] as const) {
      console.log("=".repeat(78));
      try {
        const sc = await evalharness.run(kase, proposer, ctx.url, o.replay as string | undefined);
        console.log(evalharness.formatScorecard(sc));
        if (o.show) { console.log(); const sub: Ctx = { url: sc.db_url }; await commands.show(sub, [sc.engagement], { verbose: o.verbose }); await close(sub); }
      } catch (e: any) {
        if (!(e instanceof EngineError)) throw e;
        console.log(`Proposer: ${proposer}\n  not run: ${e.message}`);
      }
    }
    console.log("=".repeat(78));
    console.log("Scores are structural checks against a hidden answer key, not an audit-quality review; a qualified auditor reads the plans.");
  },
  async workspace(ctx, _pos, o) {
    /** Read-only Planning Workforce workspace over the stored records. */
    const port = o.port ? Number(o.port) : 8765;
    const host = (o.host as string) ?? "127.0.0.1";
    ctx.pool = new pg.Pool({ connectionString: ctx.url, max: 4 });
    await migrate(ctx.pool);
    const app = await serve(ctx.pool, port, host);
    console.log(`workspace and API on http://${host}:${port}/  db=${databaseName(ctx.url)}  (sign-in required)  Ctrl-C to stop`);
    await new Promise<void>((r) => { process.once("SIGINT", () => r()); process.once("SIGTERM", () => r()); });
    await app.close();
  },
};

/** --modules AC-UAR,AC-PROV (or "all"); undefined means every module. */
function scope(o: Opts): string[] | undefined {
  const v = o.modules as string | undefined;
  if (!v || v.trim().toLowerCase() === "all") return undefined;
  return list(v);
}

function replays(spec: string | undefined, allowNone = false): workflow.Transports | undefined {
  if (!spec) return allowNone ? undefined : {};
  const t: workflow.Transports = {};
  for (const item of spec.split(",")) {
    const i = item.indexOf("=");
    const k = item.slice(0, i) as keyof workflow.Transports, v = item.slice(i + 1);
    t[k] = proposerModel.replayTransport(v.split(";").map((x) => resolve(x)));
  }
  return t;
}

function printMapping(p: MappingProposal) {
  for (const s of p.sheets) {
    console.log(`  sheet '${s.sheet}': ${s.role} (${s.role_confidence}); header row ${s.header_row}, data from row ${s.first_data_row}`);
    for (const c of s.columns) console.log(`    ${c.column.padEnd(3)} ${String(c.header ?? "").slice(0, 34).padEnd(34)} -> ${String(c.field ?? "(client attribute)").padEnd(30)} ${c.method}/${c.confidence}  ${c.reason.slice(0, 90)}`);
  }
  for (const w of p.warnings) console.log(`  ! ${w}`);
}

function printFindings(rows: any[]) {
  for (const f of rows) {
    console.log(`#${f.id} [${f.status}] ${f.significance} ${f.category} control ${f.control_id} ${f.code}`);
    console.log(`    source: ${f.source?.doc} L${f.source?.line}: ${String(f.source?.quote).slice(0, 120)}`);
    console.log(`    rationale: ${f.rationale.slice(0, 300)}`);
    console.log(`    action: ${f.suggested_action.slice(0, 200)}`);
    if (f.planner_response) console.log(`    planner: ${JSON.stringify(f.planner_response).slice(0, 200)}`);
    if (f.fix_check) console.log(`    fix check: ${f.fix_check.fixed ? "fixed" : "NOT fixed"}: ${f.fix_check.basis.slice(0, 160)}`);
    if (f.human_decision) console.log(`    human (${f.human_by}): ${f.human_decision}`);
  }
}

function printActivity(rows: any[], asJson: boolean) {
  if (asJson) { console.log(JSON.stringify(rows, null, 2)); return; }
  for (const r of rows) console.log(`${String(r.id).padStart(4)} ${r.started_at} ${r.task.padEnd(20)} ${r.step.padEnd(28)} ${r.actor.padEnd(15)} ${r.status.padEnd(9)} in=${JSON.stringify(r.input_refs).slice(0, 60)} out=${JSON.stringify(r.output_refs).slice(0, 80)}`);
}

async function close(ctx: Ctx) {
  ctx.db?.release();
  await ctx.pool?.end();
}

const OPTIONS = {
  db: { type: "string" }, as: { type: "string" }, "fiscal-year-end": { type: "string" }, "time-zone": { type: "string" }, proposer: { type: "string" },
  systems: { type: "string" }, replay: { type: "string" }, "period-start": { type: "string" }, "period-end": { type: "string" }, "as-of": { type: "string" },
  version: { type: "string" }, json: { type: "boolean" }, verbose: { type: "boolean" }, choose: { type: "string" }, reason: { type: "string" },
  decision: { type: "string" }, findings: { type: "boolean" }, "max-cycles": { type: "string" }, note: { type: "string" }, case: { type: "string" },
  proposers: { type: "string" }, repeat: { type: "string" }, show: { type: "boolean" }, base: { type: "string" }, "out-db": { type: "string" },
  port: { type: "string" }, host: { type: "string" }, modules: { type: "string" },
} as const;

export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (existsSync(resolve(".env"))) { try { (process as any).loadEnvFile(resolve(".env")); } catch { /* optional */ } }
  const parsed = parseArgs({ args: argv, options: OPTIONS as any, allowPositionals: true, strict: true });
  const values = parsed.values as Opts;
  const [cmd, ...pos] = parsed.positionals;
  if (!cmd || !(cmd in commands)) {
    console.error(`usage: soxplan [--db NAME] <command> ...\ncommands: ${Object.keys(commands).join(", ")}`);
    return 2;
  }
  let url = process.env.DATABASE_URL ?? DEFAULT_URL;
  if (values.db) url = withDatabase(url, String(values.db));
  const ctx: Ctx = { url };
  try {
    await commands[cmd](ctx, pos, values);
    return 0;
  } catch (e: any) {
    if (e instanceof EngineError) { console.error(`refused: ${e.message}`); return 2; }
    throw e;
  } finally {
    await close(ctx);
  }
}

const isMain = process.argv[1] && (process.argv[1].endsWith("/cli.ts") || process.argv[1].endsWith("/cli.js"));
if (isMain) main().then((code) => process.exit(code)).catch((e) => { console.error(e); process.exit(1); });
