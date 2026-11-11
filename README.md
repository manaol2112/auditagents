# SOX ITGC Audit Planning Engine

A working system that takes fictional client control documentation and produces a methodology-aligned, client-specific SOX ITGC audit plan for human review and approval. Backend: **Node.js (TypeScript) on PostgreSQL**, run with Docker Compose; a Planning Agent and an Independent Reviewer backed by Claude sit behind a deterministic engine that enforces every rule.

The engine covers all thirteen modules of the methodology (AC-UAR, AC-PRIV, CM-CHG, CO-JOB, AC-PROV, AC-TERM, AC-AUTH, AC-PHYS, CM-DATA, DEV-SDLC, CO-BKP, CO-INC, TP-SOC1); each engagement scopes the modules it plans against. It produces a G2 plan (planned procedures). Walkthroughs, design conclusions (G3), testing, review, deficiency evaluation, and reporting are not built yet.

## What it does

1. **Intake**: ingests markdown RCMs, control narratives, and policies; stores every line with the file hash. Documents are data, never instructions.
2. **Extraction**: parses risks, controls, and policy parameters into facts, each with an exact document and line reference, frozen into an immutable snapshot.
3. **Mapping**: maps each client control to a methodology module by control type, checks that the risks the control is linked to match the module's risk, and flags mismatches.
4. **Planning Agent**: for every mapped control, builds the criteria register (quoting the client's own criteria, detecting contradictions between sources, and recording "not defined by control" where no source defines one), proposes an expectation contribution for every design expectation, computes coverage per expectation per system, and drafts a procedure for every operating attribute with pass/fail criteria, population, evidence requests, and walkthrough questions.
5. **Validation**: deterministic checks that nothing was omitted, every defined criterion cites a source, and no open material contradiction remains.
6. **Approval**: a human approver resolves material contradictions and approves the plan. The engine refuses approval by the agent, self-approval, approval with blocking findings, and approval without reasoning.
7. **Immutability and audit trail**: approved versions cannot be changed (database triggers); every action is in a hash-chained, append-only event log.

The Planning Agent in this increment is deterministic: rules over the extracted facts. It can be replaced by a model-backed proposer later; the engine that validates, versions, and gates its output does not depend on how proposals are produced.

## Increment 2: model-backed Planning Agent

A second proposer, [proposerModel.ts](src/proposerModel.ts), reads free-form RCMs, narratives, and policies and proposes the whole program in one structured-output call to `claude-opus-5-5`. The deterministic planner stays as the reproducible baseline and fallback. Both feed the same engine: the model's proposal is verified line by line, every omitted expectation is filled with "none" and flagged, every criterion whose cited line does not contain it is downgraded to "unverified source" and cannot become a pass/fail criterion, unknown modules are rejected, and the result goes through the same validators and the same human approval. The model has no database handle and no tools; its one output is JSON.

```bash
echo 'CLAUDE_API_KEY=...' > .env    # read by the CLI and by docker compose; ANTHROPIC_API_KEY also works

# Deterministic and model-backed planning on the same documents, scored against a hidden answer key
soxplan compare --case evals/lumen --show
soxplan compare --case fixtures/northwind

# Step by step with the model proposer (one model call, at extraction)
soxplan --db lumen extract "Lumen Health Partners" --proposer model --systems "NetSuite,ClaimsLens" --as planner-agent
soxplan --db lumen plan LUMEN-FY2026-ITGC --proposer model --as planner-agent

# Offline: replay a saved raw proposal (compare and eval save each live response under evals/<case>/runs/)
soxplan compare --case evals/lumen --replay evals/lumen/runs/<file>.json
```

`evals/lumen` is a fictional client written as prose (no tables), with `answer_key.json` that the scorer reads after the plan exists and that is never placed in a prompt. The scorecard reports controls found, module mappings, criteria quoted versus invented, contradictions detected, gaps left visible, distractors wrongly mapped, and how many proposals the engine had to correct. These are structural checks; whether the procedures are audit-quality is for a qualified auditor reading `--show --verbose` output.

The server-side refusal fallback (`fallbacks="default"`) is on by default in `sdk_transport`; remove the `betas`/`fallbacks` arguments to disable it.

## Increment 3: stable identity, actionable review, audit-quality evaluation

**Stable control identity** ([identity.ts](src/identity.ts)). A control keeps the client's own identifier when that identifier appears on the cited source lines (`A-01`); otherwise it gets a provisional identity hashed from the document type and the normalised text of the cited lines (`P-8ea3240cbb`), so a model relabelling it or lines being inserted above it change nothing, while a change to the control's own words produces a new identity and a proposed link to the prior one. Duplicates (two controls citing the same lines) and borrowed identifiers (a client label used for the wrong lines) are detected. Every non-exact link is a pending identity issue that blocks approval until an approver resolves it (`identities`, `resolve-identity`). Contradiction resolutions are keyed by identity and carry a hash of the contradicting sources; if the sources change, the resolution goes stale and blocks again rather than silently applying.

**Actionable review** ([review.ts](src/review.ts)). `review ENGAGEMENT` (and `show`) print a summary grouped by control, issue type, and criterion, in three buckets: blocking (every blocking validation finding, never downgraded), decisions for the approver, and walkthrough questions and notes. Semantically equivalent findings are merged with every original text kept under `sources`; `--findings` prints everything. Example from a live model run: [evals/lumen/example-review-output.txt](evals/lumen/example-review-output.txt).

**Audit-quality evaluation** ([evalharness.ts](src/evalharness.ts)). The answer keys now carry quality expectations per control (material risks that must be addressed, procedures that must be proposed, evidence, population, and pass/fail content). Scores are reported in three separate sections: INTEGRITY (unsupported criteria, missed material risks, omitted necessary procedures), QUALITY (evidence, population, pass/fail, client-specific questions), and FORMATTING (what the engine had to correct). `eval --repeat N` or `--replay a,b,c` runs repeatedly and reports identity drift and score spread. The quality expectations were drafted by Claude and are marked in the keys as not yet reviewed by a qualified auditor; treat those scores as provisional until a human owns the key.

### Results: three live runs on `evals/lumen`

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| Controls found / mapped | 5/5, 5/5 | 5/5, 5/5 | 5/5, 5/5 |
| Criteria quoted with verified line / invented | 6/6, 0 | 6/6, 0 | 6/6, 0 |
| Planted contradiction | found | found | found (named "Removal timeframe after review") |
| Engine corrections | 29 formatting (field names for attribute codes) | 6 (5 formatting, 1 paraphrase) | 0 |
| INTEGRITY: unsupported / missed risks / omitted procedures | 0 / 0 of 14 / 1 of 14 | 0 / 0 of 14 / 1 of 14 | 0 / 0 of 14 / 0 of 14 |
| QUALITY: evidence, population, pass/fail | 10/10, 5/5, 4/4 | 10/10, 5/5, 3/4 | 10/10, 5/5, 4/4 |
| Client-specific questions | 19/84 | 20/85 | 20/87 |
| Identity | same five `P-` ids in all three runs; stability 100% |

What the repeated runs showed: the five identities were stable across three extractions with three different labelling schemes; the model's wording of contradiction subjects varied ("Removal timeframe" versus "Removal timeframe after review"), which exposed and fixed an engine gap in mapping subjects to the criterion vocabulary; the model hedges with "partial" on most expectations, which is correct caution but turns into 25 to 33 approver decisions per plan; and about three quarters of its walkthrough questions are generic rather than client-specific by the harness's crude test. Formatting corrections fell from 29 to 0 once the digest named the attribute codes explicitly.

## Increment 4: independent planning review

One new specialist, the Independent Planning Reviewer ([reviewerModel.ts](src/reviewerModel.ts)), run by [workflow.ts](src/workflow.ts):

- **Pass 1, blind.** From the documents and the methodology digest only, the reviewer records the controls it expects, material risks, necessary expectations, essential procedures and evidence, and every criterion it can quote. It never sees the plan in this pass; the assessment is cached per document set.
- **Pass 2, compare.** The engine first diffs the blind assessment against the plan deterministically (controls with no plan counterpart, essential procedures not proposed, criteria that differ, risks not visible). The reviewer then receives the assessment, a condensed plan digest, and those candidates, and returns findings in ten categories, each with control, expectation or attribute, cited source, significance, and a corrective action. The engine verifies every citation and control reference; unverifiable findings are kept and marked, never dropped.
- **Targeted revision.** Verified high or medium findings go to the Planning Agent, which returns a complete revised proposal plus an accept or reject response per finding. The revision becomes a new snapshot and a new plan version (`revision_of` the previous one); the engine re-verifies everything as if it were new. At most `MAX_CYCLES` (2) reviews, so at most one revision between them.
- **Escalation.** Findings still open or rejected after the last cycle, and every human-judgment question, are escalated. Approval is refused while any escalation stands; the approver resolves each with `disposition` (accept or dismiss, with reasoning), which is final.
- **Boundaries.** The reviewer cannot edit the plan, approve, or resolve a judgment; reviews and findings are immutable (triggers); the Planning Agent's responses are recorded on the findings; every step is a row in the `activities` table (`activity ENGAGEMENT --json`) with input and output references, actor, status, and timings.

```bash
soxplan review-plan LUMEN-FY2026-ITGC --as reviewer-agent      # live; or --replay pass1=..,pass2=..,revision=..
soxplan findings LUMEN-FY2026-ITGC
soxplan disposition 14 --decision accept --reason "..." --as rj
soxplan activity LUMEN-FY2026-ITGC --json
soxplan eval-review --case evals/lumen --base evals/lumen/runs/<good-proposal>.json --show
```

### Review evaluation with planted deficiencies

`eval-review` takes a good saved proposal, plants five defects defined in `evals/lumen/review_eval.json` (a control removed; a criterion cited to a line that the engine's lenient check accepts but that does not state it; a contribution wrongly marked full; a weak evidence request; a contradiction dropped and one side stated as the criterion), builds the plan, runs the review cycle, and scores detection, repair, and whether new unsupported criteria appeared.

Live result on `evals/lumen` (Opus 5.5, two cycles, four model calls):

| Planted defect | Detected | Fixed by revision |
|---|---|---|
| Omitted ClaimsLens change control | yes, high | no: the finding carried the module code `CM-CHG` in its `code` field, the verifier only accepted attribute and expectation codes, so the finding was marked unverified and never sent to the planner; cycle 2 raised it again and it was escalated to the human. The verifier now accepts module codes (increment 5) |
| Unsupported UAR-D criterion (policy line about removal cited for completion) | yes, high | yes |
| Contribution CHG-DE5 wrongly full | not as such: raised as low-significance weak evidence | yes, incidentally |
| Weak PROV-B evidence (an email instead of Jira records) | yes, high | yes |
| Dropped removal-timeframe contradiction | yes, medium | yes, after an engine fix (below) |

Unsupported criteria caught by the engine: 0 before, 0 after. Cycle 1 produced 13 findings (7 actionable), cycle 2 produced 8; nine items were escalated, including four human-judgment questions (for example, whether a second Cirrus Ops engineer's pull-request approval counts as Lumen's change approval when Cirrus Ops has no SOC report).

Two things the run exposed. The reviewer found a real inconsistency in version 2: the revision re-added the contradiction under the subject "Timeframe for removing access … (UAR-E)", my subject mapping did not recognise "removing" or the attribute code, so the criterion stayed "defined" while the contradiction was listed; the mapping now uses attribute codes and word stems, and re-scoring the same responses shows 4 of 5 fixed. And the Planning Agent accepting a finding is not evidence of fixing it; in this increment the engine marked an accepted finding resolved and relied on the next review to catch anything still wrong. Increment 5 replaces that with a deterministic post-revision check.

## Increment 5: objective fix checks, overstated contributions, and the Planning Workforce workspace

**Deterministic post-revision checks.** After a targeted revision the engine runs `verifyFix` ([workflow.ts](src/workflow.ts)) on every finding the planner answered, comparing the plan before and after on the finding's own terms: an omitted control is fixed only if the revised plan has a mapped control at the cited document lines; an omitted procedure only if that attribute is now proposed for that control; an unsupported or contradictory criterion only if the criterion state actually changed and the same claim is no longer "defined"; an incorrect applicability or overstated contribution only if the contribution changed and is no longer full; weak evidence and incomplete population only if the evidence or population text changed; an omitted risk only if the cited risk words now appear in the control's plan text. Categories that cannot be checked objectively (judgment questions) are never auto-resolved. A finding becomes `resolved` only when its check passes; a finding the planner *accepted* but did not demonstrably fix stays `accepted_by_planner`, is re-sent in the next cycle, and is escalated if a cycle is not left. The check result and basis are stored on the finding (`fix_check`) and as a `cycleN_fix_checks` activity; `eval-review` reports `resolved only by objective fix check` and `accepted by planner but not demonstrably fixed`.

**Overstated contributions.** The reviewer's blind pass now rates each expectation's coverage (`full`, `partial`, `none`) per control; the engine diff raises an `overstated_contribution` candidate when the plan says full and the reviewer says less, and the harness plants a full-for-partial overstatement (UAR-DE2 on narrative L17) alongside the other defects. Live detection with the new pass-1 schema has not been measured yet; the saved reviewer replays predate it.

**Planning Workforce workspace** ([workspace.ts](src/workspace.ts), [web/](web/); the original single-page version was replaced in increment 8). A read-only page over the stored records: a canvas of the steps that actually ran (document intake, Planning Agent, Independent Reviewer, one targeted-revision node per revision cycle, human approval) with the relationships that actually happened as edges (snapshot to plan, plan versions reviewed, reviewer challenge to revision, revision to the new plan version, escalations to the human); clicking a node opens a details panel with that step's status, recorded activities, inputs, outputs, source references, findings with their post-revision check, and plan version history; the human action queue lists escalated and unverified findings, open material contradictions, pending identity issues, and the draft awaiting approval, each with the engine command that decides it. The server (Fastify, GET only) answers `GET /`, `/api/engagements`, `/api/workspace/<engagement>` and refuses every other method; it has no write path. Decisions are still made through the engine's commands.

```bash
R=evals/lumen/runs/review-2026-11-06T232602+0000
soxplan eval-review --case evals/lumen --base evals/lumen/runs/2026-11-06T215424+0000-claude-opus-5-5.json \
  --replay "pass1=$R-c1-pass1.json;$R-c2-pass1.json,pass2=$R-c1-pass2.json;$R-c2-pass2.json,revision=$R-revision.json" \
  --out-db soxplan_workspace_demo                          # recorded reviewer responses, no model calls
soxplan --db soxplan_workspace_demo workspace --port 8765   # then open http://127.0.0.1:8765/
```

On the recorded Lumen review the workspace shows: 2 documents and 2 snapshots; plan v1 (superseded) and v2 (draft, revision of v1 after cycle 1); 2 review passes with 21 findings (6 resolved by the objective check, 12 escalated, 3 low-significance open); targeted revision 1 with 8 findings sent, 6 demonstrably fixed and 2 not; and a 17-item action queue (12 escalated findings including the still-missing ClaimsLens change control, 4 material contradictions, and the v2 draft, which cannot be approved until they are cleared).

## Increment 6: PostgreSQL + Node.js backend

The engine was ported from Python/SQLite to **TypeScript on Node 22 with PostgreSQL 16+**, keeping every guarantee and every test (44, all passing on the new stack): the schema lives in [migrations/001_schema.sql](migrations/001_schema.sql) and the invariants are PL/pgSQL triggers (append-only audit trail, immutable plan content and approved versions, immutable snapshot records, reviews, findings and proposals, final human dispositions); JSON documents are `jsonb`; every hash is over canonical (key-sorted) JSON; the HTTP workspace is a GET-only [Fastify](src/server.ts) app; the model agents use `@anthropic-ai/sdk`. The CLI is unchanged in shape (`soxplan <command> --as USER`), with `--db NAME` choosing a database on the same server and `.env` loaded for `CLAUDE_API_KEY`. The Python code and SQLite databases are gone.

Verified end to end on the new stack: the `demo` run, the replayed review evaluation on `evals/lumen` (identical results: 21 findings, 6 resolved by the objective fix check, 12 escalated, same detection and repair outcome per planted defect), and the workspace rendered in a browser over the resulting database.

## Increment 7: all thirteen modules, engagement scope

**Methodology data generated from the approved text.** [scripts/build-methodology.mjs](scripts/build-methodology.mjs) parses the general design criteria and section 6 of the methodology into [src/data/sox_itgc_0_4_1.json](src/data/sox_itgc_0_4_1.json): 13 modules, 83 design expectations, 87 operating attributes, evidence lists, and populations (per part of the control for AC-PRIV and CO-JOB, so each attribute's procedure carries its own population and means of selection). Ranges in the "tested in operation by" column are expanded (PRIV-G to PRIV-I), and references to another module, a rule, a walkthrough, or the population definition are kept as `tested_elsewhere`, so no expectation is left without a tester. `npm test` fails if the data is out of date with the methodology (`--check`), and a test asserts every expectation, attribute, risk, and evidence line is verbatim. This replaced the three hand-built modules, which turned out to paraphrase the approved text in places (PROV-DE1's list of grant paths, PROV-DE5, PROV-DE7, and the populations) while plans pinned the hash of the exact document.

**Engine mappings kept separate.** What the methodology does not state (the RCM risk category and control types that map to each module, the testing pattern, and which client-stated field fixes each attribute's operating criterion with the design criterion breached when it is missing) is in [src/data/engine-mapping.json](src/data/engine-mapping.json), marked as hand-maintained and not approved methodology content. It needs review by a qualified auditor like the answer keys.

**Engagement scope.** Engagements carry the modules in scope (`new-engagement ... --modules AC-UAR,AC-PROV,CM-CHG`, default all thirteen; migration 002). The planner, the validators, and both agents' prompts see only in-scope modules; the plan lists the modules out of scope, and the scope decision is recorded on the `engagement.create` event. A proposer mapping to a module outside the scope is flagged as "out of scope module" for the approver, separately from an unknown code. The evaluation cases declare the three-module scope their answer keys were written for, so their results are unchanged (the replayed Lumen review evaluation and the Northwind baseline produce the same scores as before).

**Not yet done for the new modules.** The deterministic proposer has contribution rules only for the original three modules; for the other ten it records every contribution as "none" with that reason, so the expectations stay visible as potential design gaps for the model proposer or a human to assess. Walkthrough questions for the new expectations are built from the methodology text rather than hand-written templates. The fictional client fixtures still contain only access review, provisioning, and change controls, plus a small inline RCM in the tests; a fixture and answer key exercising the new modules end to end is the next piece of evaluation work.

## Increment 8: web UI (sidebar + workspace), secure by design

[web/](web/) is the Planning Workforce UI: a sidebar (engagement switcher, section navigation with live counts, read-only posture) and a workspace (engagement header, then Overview with the workflow canvas and step inspector, Action queue, Review findings, Audit plan, Documents, Activity). It is React 19 + Vite with three runtime dependencies (react, react-dom, zod), its own lockfile, exact pins, install scripts disabled, and is served by the same GET-only Fastify server. `npm run build:web` builds it; `npm run test:web` runs its typecheck, security scan and tests; the Docker image builds it in its own stage.

Security controls, each with a test ([web/SECURITY.md](web/SECURITY.md) has the full list and the known gaps):

- **Tenant isolation fix.** The workspace model returned the *global* audit trail filtered only by action, so one client's workspace showed another client's document ingests, contradiction reasoning and approval notes. Events are now scoped to entities owned by the engagement or its client (deny by default), and server file paths are reduced to file names ([workspace.ts](src/workspace.ts) `scopeEvents`).
- **Server** ([security.ts](src/security.ts)): strict CSP with Trusted Types (no inline code, no eval, no framing, no outbound connections), Host allowlist against DNS rebinding (`ALLOWED_HOSTS` to add names), Fetch Metadata refusal of cross-site reads, `no-store` on all API responses, isolation headers, 5xx bodies that never carry internals, 404s that never echo input. Compose now publishes the API and database on 127.0.0.1 only, and the runtime container runs as an unprivileged user.
- **Client**: one network module (same-origin GET, no redirects, timeouts, size cap); every response schema-validated and stripped of unused fields, control and bidi-override characters; nothing stored in the browser; errors shown as fixed strings; a source and build scanner ([web/scripts/security-check.mjs](web/scripts/security-check.mjs)) that fails the build on HTML sinks, eval, browser storage, raw network calls, external origins, console output, source maps or inline scripts.

```bash
npm run build:web                    # then start the server as usual; it serves web/dist at /
cd web && npm run dev                # dev server on 127.0.0.1:5173, proxies /api to the workspace server on :8765
```

## Increment 9: RCM upload, column mapping, sign-in, and the back-end API

**The RCM is the starting document.** An engagement is created first (period, systems, modules in scope), then the client's RCM is uploaded into it: our template ([templates/rcm-template.xlsx](templates/rcm-template.xlsx)), an Optro (formerly AuditBoard) export, or the client's own spreadsheet (.xlsx or .csv). The fields it is read into, and which are mandatory, are in [architecture/rcm-field-standard.md](architecture/rcm-field-standard.md).

- **Upload** ([src/rcm/upload.ts](src/rcm/upload.ts), [src/rcm/parse.ts](src/rcm/parse.ts)): the original file is stored unchanged with its hash; every non-empty row becomes a line of a document (so plans and findings cite RCM rows like any other source) and a row record of cells by column. Workbooks are read as data only; macro-enabled workbooks, legacy .xls, and decompression bombs are refused before parsing.
- **Column mapping** ([src/rcm/mapping.ts](src/rcm/mapping.ts), [src/rcm/fields.ts](src/rcm/fields.ts)): each sheet's role and header row are found (title rows above the header are skipped), and each column is matched to a canonical field by the template's labels, by header synonyms from the platforms researched (Optro, Diligent One, ServiceNow, Workiva, Archer) and common client headers, and by its values: a "Control Type" column holding Manual / Automated is mapped to nature, and the proposal says why. Unrecognized columns are kept as client attributes. The optional **mapping agent** ([src/rcm/mappingAgent.ts](src/rcm/mappingAgent.ts)) asks the model about the columns left open; its answers are checked against the catalogue and never override a confident column. A person confirms the mapping before anything is extracted.
- **Extraction and import checks** ([src/rcm/extract.ts](src/rcm/extract.ts)): systems, risks, processes, controls, IPE, and links become a frozen snapshot pinned to the engagement, with every value tied to its sheet, row, and column; one-sheet RCMs (risk statements and systems on the control rows) are split into their records. Operating criteria written as `Label: value` pairs become the client-stated criteria the planner quotes. The checks of the field standard run on import (missing mandatory and conditional fields, unrecognized values, inferred categories and modules, unknown references, duplicates, risks without controls, reports without a completeness-and-accuracy approach, ITACs without supporting ITGCs, outsourced systems without a SOC report, in-scope systems without ITGCs). Findings on IT general controls are blocking: planning is refused until the client fixes the RCM or an approver accepts the finding with a reason. Business process controls, ITACs, and IPE are imported, checked, and linked, but not planned until the methodology covers them.
- **Planning** uses the RCM's stated or inferred module for each ITGC (an inferred one is reported for confirmation, never silent).

**API, sign-in, and access** ([src/api.ts](src/api.ts), [src/auth.ts](src/auth.ts), [src/jobs.ts](src/jobs.ts); contract in [architecture/api-contract.md](architecture/api-contract.md)): the UI's back end. People sign in (scrypt passwords, HttpOnly SameSite=Strict session cookie with a CSRF token for browser writes, bearer tokens for scripts); agents cannot sign in. Every request acts as the signed-in user, so the engine's rules apply unchanged. A user sees an engagement only as a member of it; anything else answers like a missing record. Model planning, review, and mapping assistance run as background jobs. Every write is one transaction, and the audit chain stays linear under concurrent writes. The controls and their tests are listed in [architecture/backend-security.md](architecture/backend-security.md), with the gaps still open (HTTPS, SSO and MFA, user administration).

```bash
S="npm run cli --"                                          # or: S="docker compose run --rm cli"
$S new-engagement "Northwind Foods" NW-FY2026 --period-start 2026-01-01 --period-end 2026-12-31 --as-of 2026-12-31 --systems "SAP ECC" --as rj
$S rcm-upload NW-FY2026 northwind-rcm.xlsx --as pat        # prints the mapping proposal
$S rcm-confirm 1 --as pat                                   # accept the proposal (or: rcm-confirm 1 mapping.json)
$S rcm-extract 1 --as pat                                   # snapshot, counts, intake findings
$S rcm-accept 7 --reason "..." --as rj                      # an approver accepts a blocking finding
$S plan NW-FY2026 --as pat
SOXPLAN_PASSWORD='...' $S add-user kim preparer --as rj     # people who sign in get a password; never on the command line
$S add-member NW-FY2026 kim --as pat
```

`make go` now also seeds a third engagement that goes through the RCM path (NW-RCM-FY2026: template uploaded, mapped, extracted, planned) and prints sign-in passwords for the demo users `pat` (preparer), `rj` and `ann` (approvers), once.

## Setup

Requires Docker (Compose v2) or, without Docker, Node 22+ and a PostgreSQL 16+ server.

```bash
cp .env.example .env            # optional: CLAUDE_API_KEY=... for the model agents
make go                         # frees ports 5432/8765, builds and starts db + migrate + api, seeds the demo, opens http://localhost:8765/
                                # seed (idempotent): Northwind = deterministic plan + human approval; Lumen = Planning Agent,
                                # Independent Reviewer, targeted revision, fix checks, and the human action queue, replayed from
                                # the recorded Claude responses in evals/lumen/replays/ (no API calls)
make stop | make reset | make test | make logs | make ports | make cli ARGS="show NW-FY2026-ITGC"

# or by hand:
docker compose up -d            # db (PostgreSQL), migrate (applies migrations), api (workspace at http://localhost:8765/)
docker compose run --rm cli demo                       # end-to-end run on fixtures/northwind
docker compose run --rm cli show NW-FY2026-ITGC        # any engine command
docker compose run --rm --build test                   # the test suite against the compose server
```

Without Docker:

```bash
npm install
export DATABASE_URL=postgres://soxplan:soxplan@127.0.0.1:5432/soxplan   # any PostgreSQL you run
npm run cli -- init                                     # creates and migrates the database
npm run cli -- demo
npm run serve                                           # workspace at http://127.0.0.1:8765/
npm test                                                # no DATABASE_URL needed: tests start an embedded PostgreSQL
```

The demo runs the whole flow on the fictional client in `fixtures/northwind`: ingest, extract, create the engagement (pinned to the methodology version and the snapshot), draft a plan, show that approval is refused while a material contradiction is open, resolve it as the approver, re-plan, show that the agent cannot approve, approve as the human, print the plan and the audit trail.

## Tests

```bash
npm test                          # local: embedded PostgreSQL, one database per test cloned from a migrated template
docker compose run --rm --build test
```

Fifty-one tests (the seven newest, in `test/modules.test.ts`, cover the generated methodology data, engagement scope, and planning controls of the new modules). Eleven cover the deterministic planner: intake and line-level source references, injection text stored as data, a planted contradiction (RCM and policy say 5 business days, the narrative says 3), a missing criterion (A-13 has no completion timeframe), overlapping controls (A-05 and A-05b both serve AC-PROV without being judged against each other), a risk mismatch (A-14), completeness of expectations and attributes, engine-enforced permissions, immutability of approved versions, methodology pinning, and the audit chain. Nine cover the model path using a hand-written stub transport (not model output): the transport sees only text and a schema, an invented criterion citing the wrong line is caught, an omitted expectation is filled and flagged, an unknown module and an unverifiable source are rejected, many-to-many mapping works, the contradiction and approval flow is unchanged, the stored proposal is immutable, procedure overrides apply, and the harness scores a replayed proposal; plus the deterministic baseline on free-form text finds nothing and invents nothing. Eight cover identity and review: client identifiers used when present, relabelling does not change identity, a line shift does not but a text change does (with a proposed link pending), duplicates and borrowed identifiers require a human, resolutions follow identity and go stale when sources change, grouping preserves every blocking finding with sources, and no warning is lost in classification. Five cover the review cycle with stub transports: pass 1 is blind and pass 2 sees the plan digest and engine candidates; findings are verified, stored immutably, and routed (resolved, unverified, escalated); escalation blocks approval until a human disposition, which agents cannot give and which is final; the cycle limit holds and the activity log records every step; and a reviewer with no findings leaves the plan untouched and cannot approve. Four cover the post-revision checks: an accepted but unchanged plan leaves the findings unresolved and escalated; demonstrable fixes are resolved with their recorded basis; weak-evidence and overstated-contribution checks require the evidence or the contribution to actually change; and the engine raises an overstated-contribution candidate from the reviewer's coverage ratings. Seven cover the workspace: nodes and edges reflect the recorded flow; node details match the stored records; the action queue holds exactly the escalated and unverified findings plus the draft, and a human disposition removes an item; unknown engagements are refused; the page and API are served by the real Fastify app; the page only calls endpoints that exist; and POST, DELETE, path traversal and unknown engagements are refused while the audit chain stays intact.

## Step by step

```bash
S="docker compose run --rm cli"        # or: S="npm run cli --"
$S init
$S add-user rj approver --as system
$S add-client "Northwind Foods" --fiscal-year-end 2026-12-31 --time-zone America/New_York --as rj
$S ingest "Northwind Foods" fixtures/northwind/rcm.md fixtures/northwind/narrative.md fixtures/northwind/policy.md --as planner-agent
$S extract "Northwind Foods" --as planner-agent                                   # deterministic; or --proposer model --systems "SAP ECC,Concur"
$S new-engagement "Northwind Foods" NW-FY2026-ITGC --period-start 2026-01-01 --period-end 2026-12-31 --as-of 2026-12-31 --systems "SAP ECC,Concur" [--modules AC-UAR,AC-PROV,CM-CHG] --as rj
$S plan NW-FY2026-ITGC --as planner-agent                                        # or --proposer model
$S show NW-FY2026-ITGC --verbose
$S resolve NW-FY2026-ITGC 1 --choose rcm:19 --reason "..." --as rj
$S review-plan NW-FY2026-ITGC --as reviewer-agent                                 # live; or --replay pass1=..,pass2=..,revision=..
$S findings NW-FY2026-ITGC
$S disposition 14 --decision accept --reason "..." --as rj
$S activity NW-FY2026-ITGC --json
$S approve NW-FY2026-ITGC --note "..." --as rj
$S history
$S eval --case evals/lumen --proposers rules,model [--repeat 3] [--replay a.json,b.json]
$S eval-review --case evals/lumen --base evals/lumen/runs/<good-proposal>.json [--replay pass1=c1.json;c2.json,pass2=...,revision=...] [--out-db NAME]
$S workspace --port 8765                                                         # read-only workspace over --db
$S drop-db soxplan_eval_20261107...                                              # evaluation databases are kept until dropped
```

Every evaluation run creates its own database (`soxplan_eval_<timestamp>`, or `--out-db NAME`) on the configured server so its records can be inspected in the workspace (`soxplan --db NAME workspace`).

## Document formats

Fictional markdown formats used by the fixtures: an RCM with `## Risks` and `## Controls` pipe tables; a narrative with `## Control <REF>` headings followed by `Key: value` lines; a policy of `Key: value` lines. The model-backed extractor reads any prose; the deterministic extractor needs these shapes.

## Layout

```
migrations/001_schema.sql   tables, triggers (immutability and append-only rules), seed agent users
migrations/002_engagement_modules.sql   engagement module scope
scripts/build-methodology.mjs   generates src/data/sox_itgc_0_4_1.json from the methodology text + engine-mapping.json
src/
  db.ts            pool, migrations, canonical JSON and hashing, database create/drop
  audit.ts         hash-chained event log, roles
  methodology.ts   L1 data loader; pins the methodology document hash
  data/sox_itgc_0_4_1.json   the thirteen modules, generated verbatim from methodology/sox-itgc-methodology.md v0.4.1
  data/engine-mapping.json   hand-maintained engine mappings per module (risk category, control types, pattern, criterion fields)
  intake.ts        L2 ingest, parsing, facts with source references, snapshots
  identity.ts      stable control identities, duplicate and conflict detection, links to the prior snapshot
  planning.ts      L3 Planning Agent: criteria register, mapping, contributions, coverage units, procedures, questions
  validate.ts      structural validation (blocking vs warning)
  approvals.ts     human decisions the engine enforces
  review.ts        grouped, classified, deduplicated review summary
  proposerModel.ts model-backed proposer and its targeted revision; verification of every reference
  reviewerModel.ts independent reviewer: blind pass, engine diff, comparison pass, finding verification
  workflow.ts      review and revision cycle, objective post-revision fix checks, escalation, dispositions, activity log
  evalharness.ts   runs a proposer on a case directory and scores against the hidden answer key; planted-deficiency review eval
  workspace.ts     read-only Planning Workforce workspace model
  server.ts        Fastify (GET only): /api/engagements, /api/workspace/:engagement, the built web UI
  security.ts      response security baseline: host allowlist, fetch metadata, CSP + Trusted Types, no-store, generic errors
  cli.ts           command-line interface, demo, compare, eval
web/               the web UI (React + Vite, own lockfile): sidebar + workspace; see web/SECURITY.md
test/              node:test suites; helpers.ts starts an embedded PostgreSQL unless DATABASE_URL is set
fixtures/northwind/   fictional client documents (structured) with case.json and answer_key.json
evals/lumen/          fictional client documents (free-form prose) with case.json, answer_key.json, review_eval.json
docker-compose.yml    db, migrate, api; cli and test under the "tools" profile
methodology/          the methodology (unchanged by this code)
architecture/         the tailoring architecture, validation report, and patch proposal (design documents)
```

## Design decisions taken for this increment

These follow the methodology v0.4.1 and architecture v0.2 with patch proposal v0.2.1. Decisions the documents left open were taken as follows, and should be revisited by the methodology owner:

- All extracted controls are **candidates** (no walkthrough has happened); the plan is a G2 plan of proposed procedures. Applicability decisions default to **necessary**; the agent proposes no exception.
- A control's criterion for an expectation that **another mapped control fully covers** is not demanded of it (status "covered by another control"), per the architecture's contribution rule.
- Contradictions on timeframes, approvers, approval timing, frequency, and reviewer are **material** and block approval until an approver resolves them with a reason. Resolutions are never overwritten.
- Coverage cells with no documented control are proposed as **unresolved coverage gap**; the approver's note records the decision.
- The approver may generate a draft, but may not approve a draft they generated.

## Not built yet

Testing Agent, G3 walkthrough recording, subpopulations, impact assessments, deficiency evaluation, reporting, and any user interface beyond the CLI.

## Live comparison results and assessment

Two live runs on `evals/lumen` (free-form prose, hidden answer key), `claude-opus-5-5`, effort high, about 1,600 input and 22,000 output tokens per run (the raw proposals are saved under `evals/lumen/runs/`, which is git-ignored).

| Measure | Deterministic | Model, run 1 (re-scored after the engine fix below) | Model, run 2 |
|---|---|---|---|
| Controls found | 0/5 | 5/5 | 5/5 |
| Module mappings | 0/5 | 5/5, 0 extra | 5/5, 0 extra |
| Defined criteria quoted with a verified line | 0/6 | 6/6 | 6/6 |
| Undefined criteria left undefined / invented | 10/10, 0 | 10/10, 0 | 10/10, 0 |
| Planted contradiction detected | no | yes | yes |
| Expected gaps visible | vacuous (nothing found) | 5/5 | 5/5 |
| Distractors mapped | 0/3 | 0/3 | 0/3 |
| Engine corrections | none | 0 | 1 unverified source |
| Validation | 0 blocking, 6 warnings | 4 blocking, 45 warnings | 4 blocking, 47 warnings |

**Strengths observed.** From prose with no tables, the model identified all five controls, mapped each to the right module by risk and activity, ignored the three distractor paragraphs, quoted every criterion it marked as defined from the line that contains it, left every undefined criterion undefined, and detected the planted removal-timeframe contradiction. It also raised three narrative-versus-policy conflicts the answer key did not list (reviewer, approver, developer deployment), which a human resolver would want to see, and its walkthrough questions were specific to the client (saved-search criteria, integration users, the go-live date's effect on review dates, who reviews the Controller's own access).

**Failures observed.** (1) In run 1 the model put criterion field names ("approver") where the schema asked for attribute codes ("PROV-B"); the engine ignored every criterion until a field-name alias was added and the digest wording fixed. (2) Its free-text risk categories did not match the controlled vocabulary, producing false "risk mismatch" flags until the check was made lenient and the categories stated in the digest. (3) In run 2 it paraphrased one control description instead of quoting it, which the engine flagged as unverified. (4) It hedged: most contributions were "partial", which generates a question for nearly every expectation and tells the approver little without a stated scope. (5) The two runs named the same controls differently (LHP-PROV-01 versus LHP-01), so a contradiction resolution keyed to a ref would not carry across a re-extraction; stable control identity needs to come from the source lines, not the model's labels. (6) Each run produced 45 to 52 warnings, most of them correct "criterion not defined" findings, which is too much to read as a flat list. (7) Output is long (22,000 tokens), and a single call gets no cache benefit.

**What this does and does not show.** The structural checks pass; the engine's guardrails were needed and worked (one omission class, one invention class, one paraphrase, one vocabulary mismatch, each caught or corrected). Whether the proposed procedures and questions are audit-quality is a judgment for a qualified auditor reading `compare --case evals/lumen --show --verbose`; nothing here measures that.
