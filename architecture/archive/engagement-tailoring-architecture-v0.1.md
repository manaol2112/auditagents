# Client Control Environment and Engagement Tailoring Architecture

| | |
|---|---|
| **Version** | 0.1 |
| **Status** | DESIGN FOR REVIEW. Not implemented. The methodology (`methodology/sox-itgc-methodology.md`, version 0.4.1) is not modified by this document. |
| **Drafted** | 2026-11-06 |
| **Depends on** | Methodology sections 1.5 (gates), 4 (scoping), 5.1 (design adequacy and applicability), 5.2 (operating compliance), 5.6 (results), 9 (workpaper), 12 (rules), 13 (testing patterns) |

## 1. Purpose

The methodology is written for no client in particular. It says what a control of each type normally needs (design expectations), what to test when the control exists (operating attributes), and how to assemble evidence, select items, evaluate results, review, and approve. A client's controls never match the modules one for one: one client control may do the work of three modules, one module may be split across four client controls, and every client's descriptions set different timeframes, approvers, and evidence.

This architecture separates four things that the current design keeps in one place, so that the methodology stays reusable and the client-specific work is explicit, versioned, and approved.

| Layer | Holds | Changes when | Owned by |
|---|---|---|---|
| **L1 Global methodology** | Modules, expectations, attributes, rules, patterns. Client-agnostic. | A new methodology version is approved. Immutable once approved. | Methodology owner |
| **L2 Client control environment** | What the client has: systems, processes, risks, controls, owners, frequencies, policies, dependencies, service organizations, and the documents those facts come from. | The client's environment changes or new documentation arrives. Every change creates a new snapshot. | Engagement Manager, with the client as source |
| **L3 Engagement audit program** | The approved mapping of L1 to L2 for one engagement: which expectations apply to which client controls, with what tailored procedures, evidence, populations, pass/fail criteria, and selection strategy. | Replanning under methodology section 1.5. Every change is a new program version needing reapproval. | Planner proposes; engagement approver decides |
| **L4 Audit execution** | Populations, evidence, item results, exceptions, review, conclusions, deficiencies, report. | Testing proceeds. Executed only against an approved L3 version. | Testers, Reviewer, Findings Evaluator, engagement approver |

Three rules bind the layers.

1. **An engagement pins exact versions.** It records the methodology version and the client-environment snapshot it was planned against. Testing in L4 references the L3 program version, which references both pins. Nothing in L4 can reference a record that is not pinned.
2. **Two sets of criteria.** The client's control description sets the operating criteria (methodology 5.2). The design assessment evaluates, independently of that description, whether the control addresses the assessed financial reporting risk (methodology 5.1). The tailoring layer records both, separately.
3. **Nothing is omitted silently.** Every expectation of every module mapped to a client control receives an applicability decision; every module not mapped to any control receives a coverage-map status. A validator refuses a program version with any expectation or area left undecided.

## 2. Layer definitions

### 2.1 L1 Global methodology

The methodology document, decomposed into records so that L3 can reference them by identifier. The decomposition does not change the text; it indexes it.

- A **methodology version** is approved once and then frozen. Its records carry the version identifier and a content hash of the approved document.
- A later version never edits an earlier one. Engagements planned against an earlier version keep it; moving an engagement to a new version is a G1 trigger.
- Records: version, module, design expectation, operating attribute, general design criterion (D1–D7), population procedure (P1–P6), rule (M-01 to M-29), cross-check (X1–X7), testing pattern, and the text passages they come from.

### 2.2 L2 Client control environment

A structured description of what the client actually has, built from the client's documentation and walkthroughs, with every fact traced to its source.

- Facts are **extracted**, **confirmed**, or **asserted by the client**. An agent reading a document produces an extracted fact with the document, location, and extraction method (methodology 10.4). A walkthrough confirms or corrects it. A fact the client states without a document is recorded as asserted, with the person and date.
- Every change produces a new **snapshot**: an immutable, hashed set of the environment records as of a date. Engagements pin a snapshot. A later snapshot never alters an earlier one.
- The environment is independent of any engagement and of any methodology version. It can be reused across periods and audit types.

### 2.3 L3 Engagement audit program

The bridge between L1 and L2 for one engagement, in versions, each approved at the gates in methodology section 1.5.

- **Mapping** records connect client controls to modules, many to many, each with a role (primary, partial, alternative).
- **Applicability decisions** are made per expectation per mapping (methodology 5.1, step 1).
- **Tailored procedures** are made per operating attribute per mapping: the generic attribute restated against the client's control, with the pass/fail criterion taken from the control description, the evidence named by client system and report, the population defined by client source, and the selection rationale.
- **Design assessment outcomes** (met, met by alternative control, design gap) are recorded per expectation at G3.
- The program version approved at G3 is the only thing L4 may test against.

### 2.4 L4 Audit execution

The records the methodology already defines in sections 5.4 to 5.7, 7, 8, 9, and 10. This architecture adds one requirement: every L4 record carries the L3 program version it was executed under, and a validator rejects any result whose procedure, population definition, or criterion differs from that version.

## 3. Schemas

Conventions for every record in every layer:

| Field | Meaning |
|---|---|
| `id` | Stable identifier, never reused. |
| `version` | Integer, incremented on change. The pair `(id, version)` is what approvals and references point to. |
| `content_hash` | Hash of the record's content fields. Equal hashes mean identical content. |
| `supersedes` | The `(id, version)` this version replaces, or null. |
| `created_by`, `created_at` | Actor (human or agent) and time. |
| `source_refs[]` | For L2 and L3 records: references to the documents, evidence, or records the content came from, each with location and how it was read. |
| `status` | Lifecycle state defined per entity below. |

### 3.1 L1 Global methodology

| Entity | Key fields | Notes |
|---|---|---|
| `MethodologyVersion` | `version_label` (for example 0.4.1), `document_hash`, `approved_by`, `approved_at`, `status` (draft, approved, superseded) | Immutable when `approved`. |
| `Module` | `methodology_version`, `code` (AC-UAR …), `title`, `domain`, `area`, `risk_text`, `typical_control_text`, `applicability_note` | |
| `DesignExpectation` | `module`, `code` (UAR-DE1 …), `text`, `tested_by[]` (attribute codes), `default_necessary` (always true in 0.4.1) | |
| `OperatingAttribute` | `module`, `code` (UAR-A …), `text`, `test_type` (I, R), `patterns[]` | Patterns from methodology 13. |
| `GeneralCriterion` | `code` (D1–D7), `text` | |
| `PopulationProcedure` | `code` (P1–P6), `text`, `performed_by_code` (bool) | |
| `Rule` | `code` (M-01 …), `text`, `class[]`, `owner_role`, `required_record`, `validator_text`, `gate`, `triggers` | Drives validators. |
| `CrossCheck` | `code` (X1–X7), `text`, `limit_text` | |
| `TestingPattern` | `code`, `population_unit`, `completeness_source`, `criterion_source`, `deadline_fields`, `subpopulations`, `cross_control_links`, `period_coverage` | From methodology 13. |

### 3.2 L2 Client control environment

| Entity | Key fields | Notes |
|---|---|---|
| `Client` | `name`, `fiscal_year_end`, `reporting_framework`, `internal_audit_charter_ref`, `iia_conformance` (bool, with source) | |
| `Snapshot` | `client`, `as_of`, `record_set_hash`, `created_from` (documents, walkthroughs), `status` (open, frozen) | Frozen snapshots are what engagements pin. |
| `Document` | `client`, `title`, `type` (policy, RCM, narrative, listing, contract, report), `file_hash`, `received_from`, `received_at`, `period_relevance` | Untrusted content; never instructions (methodology 10.5). |
| `Fact` | `snapshot`, `subject` (record it describes), `statement`, `basis` (extracted, confirmed, asserted), `source_refs[]`, `confirmed_by`, `confirmed_at` | Every L2 record's content fields are backed by facts. |
| `BusinessUnit` | `client`, `name`, `location`, `time_zone` | |
| `FinancialReportingElement` | `client`, `account_or_disclosure`, `assertions[]`, `significance`, `source_refs[]` | Chain link 1 (methodology 4.1). |
| `Process` | `client`, `name`, `elements[]`, `business_units[]` | |
| `ITDependency` | `client`, `type` (automated control, IT functionality, key report, interface, data), `name`, `process`, `elements[]`, `system` | Chain link 2. |
| `System` | `client`, `name`, `vendor`, `hosting` (on-premises, colocation, hosted, SaaS), `in_scope_reason`, `business_units[]`, `time_zone` | Chain link 3. |
| `SystemLayer` | `system`, `layer` (application, database, operating system, identity provider, scheduler, pipeline, ticketing, network), `product`, `managed_by` (client, service organization), `location` | |
| `ClientControl` | `client`, `reference` (client's own ID), `description_text` (verbatim), `objective`, `type` (manual, automated, IT-dependent manual), `frequency`, `trigger_event`, `timeframe_text`, `performer_role`, `approver_role`, `evidence_retained`, `systems[]`, `layers[]`, `business_units[]`, `effective_from`, `effective_to`, `source_refs[]` | `description_text` is never paraphrased; the operating criteria derive from it. |
| `ControlRiskLink` | `control`, `risk` | Many to many. |
| `Risk` | `client`, `statement`, `elements[]`, `dependencies[]`, `source_refs[]` | |
| `Policy` | `client`, `title`, `parameters[]` (name, value, scope), `effective_from`, `source_refs[]` | Operating criteria for configuration patterns. |
| `ServiceOrganization` | `client`, `name`, `services[]`, `systems[]`, `interaction_degree`, `evidence_available[]` (report type, period, auditor), `subservice_orgs[]`, `cuecs[]`, `source_refs[]` | |
| `Person` | `client`, `name`, `title`, `team`, `business_unit`, `roles[]` (control owner, approver, administrator) | Only what the engagement needs; see data handling in section 8. |
| `EnvironmentChange` | `client`, `date`, `description`, `affected_records[]`, `source_refs[]` | Implementations, migrations, reorganizations, ownership changes. |

### 3.3 L3 Engagement audit program

| Entity | Key fields | Notes |
|---|---|---|
| `Engagement` | `client`, `name`, `mode`, `period_start`, `period_end`, `as_of_date`, `methodology_version` (pinned), `snapshot` (pinned), `standards_versions[]`, `engagement_approver`, `external_reliance_intended` (bool), `status` | Pins are set at G1 and changed only by a G1 trigger. |
| `ProgramVersion` | `engagement`, `version`, `record_set_hash`, `gate_status` (per control: none, G2, G3), `supersedes` | L4 references this. |
| `CoverageCell` | `program_version`, `system`, `module`, `status` (tested under module, engagement-specific procedure, excluded not relevant, excluded covered elsewhere, unresolved gap), `rationale`, `covering_party`, `approval_ref` | Methodology 4.2. One per system per module. |
| `ControlMapping` | `program_version`, `client_control`, `module`, `role` (primary, partial, alternative), `rationale`, `source_refs[]` | Many to many. A control with no mapping and a module with no mapping are both validator findings. |
| `ApplicabilityDecision` | `mapping`, `design_expectation`, `decision` (necessary, not necessary, not applicable), `rationale`, `risk_part_addressed`, `evidence_of_absence[]`, `proposed_at` (G2), `decided_at` (G3), `approval_ref`, `reviewer_view` | Methodology 5.1 step 1. Default when absent: necessary. |
| `DesignOutcome` | `mapping`, `design_expectation_or_criterion`, `outcome` (met, met by alternative control, design gap), `alternative_control` (ClientControl, if any), `walkthrough_refs[]`, `rationale`, `approval_ref` | Methodology 5.1 step 2. Recorded at G3. |
| `TailoredProcedure` | `mapping`, `operating_attribute`, `procedure_text`, `operating_criterion_text` (derived from `description_text`, quoted), `criterion_source_ref`, `pass_fail_criteria[]`, `evidence_requirements[]` (client system, report or extract, fields, generation evidence), `population_definition` (source, filters, period, completeness approach P1–P6), `pattern`, `means_of_selection`, `selection_rationale` (six elements), `deadline_rule` (trigger, timeframe, time zone basis, date-only convention), `status` (not tested design gap, not necessary, not applicable, planned) | One per attribute per mapping. Absent only if the attribute's expectation was decided not necessary or not applicable, in which case `status` says so and the record still exists. |
| `InformationGap` | `program_version`, `subject`, `question`, `why_needed`, `blocking` (bool), `raised_at`, `resolved_by_fact` | Planner output. |
| `WalkthroughPlan` | `mapping`, `variant`, `questions[]`, `occurrence_to_follow`, `conducted_by`, `conducted_at`, `responses[]` (each a Fact) | Methodology 5.1. |
| `RollForwardPlan`, `RemediationPlan` | `mapping`, text, approvals | Methodology 5.8. |
| `ServiceOrgAssessment` | `program_version`, `service_organization`, the seven points of methodology 6.13, `approval_ref` | |
| `ProjectRiskAssessment` | `program_version`, `environment_change`, the elements of methodology 6.10, `approval_ref` | |
| `Variation` | `program_version`, `rule`, `type` (variation of P, departure from A, alternative procedure, applicability other than necessary), `rationale`, `approver_role`, `approval_ref` | Methodology 8 variations schedule. |
| `Approval` | `record_id`, `record_version`, `gate`, `approver`, `approved_at`, `reasoning_text` (where methodology 10.6 requires it) | An approval of a record version lapses when a newer version exists. |
| `Trigger` | `engagement`, `type`, `affected_records[]`, `return_to_gate`, `raised_by`, `raised_at` | Methodology 1.5. |

### 3.4 L4 Audit execution

Existing methodology records, each with `program_version` added.

| Entity | Added field | Validator |
|---|---|---|
| `Population` | `tailored_procedure` | Source and filters equal the approved `population_definition`. |
| `Evidence` | `evidence_requirement` | Matches a requirement in the approved procedure, or is logged as unplanned with a reason. |
| `Item`, `ItemAttributeResult` | `tailored_procedure` | Criterion applied equals `operating_criterion_text` of the approved version. |
| `ExceptionEvaluation`, `ReviewNote`, `CrossCheckResult`, `ControlConclusion`, `DeficiencyEvaluation`, `Report` | `program_version` | All reference the same program version as their items. |

## 4. Data relationships

Cardinalities that matter for the design:

| Relationship | Cardinality | Why |
|---|---|---|
| `ClientControl` to `Module` through `ControlMapping` | Many to many | One identity-lifecycle control may serve AC-PROV, AC-TERM, and AC-AUTH; one module may be served by a provisioning control, an HR feed, and a reconciliation. |
| `ClientControl` to `System` and `SystemLayer` | Many to many | One access review may cover three systems; one system has several layers each with its own controls. |
| `ClientControl` to `Risk` to `FinancialReportingElement` | Many to many | The chain in methodology 4.1 is traversed through these links. |
| `ControlMapping` to `ApplicabilityDecision` | One to many, exactly one per expectation of the module | The validator enforces completeness. |
| `ControlMapping` to `TailoredProcedure` | One to many, exactly one per attribute of the module | Including those with a non-planned status. |
| `ServiceOrganization` to `ClientControl` | Many to many | One review control may cover several providers; one provider's CUECs map to several client controls. |
| `DesignOutcome.alternative_control` to `ClientControl` | Many to one | The alternative control gets its own mapping and procedures, so it is tested. |
| `Engagement` to `MethodologyVersion` and `Snapshot` | Many to one each | Pins. |
| `ProgramVersion` to L4 records | One to many | Execution reads only approved program versions. |
| `Approval` to any record version | Many to one | Approvals are never attached to an `id` alone. |

Traversal the Planner performs: `FinancialReportingElement` → `ITDependency` → `System`/`SystemLayer` → `ClientControl` (through `ControlRiskLink` and `systems[]`) → `ControlMapping` → `Module` → `DesignExpectation`/`OperatingAttribute` → `ApplicabilityDecision`/`TailoredProcedure`. A gap at any step is an `InformationGap` or a `CoverageCell` finding.

## 5. Pinning and version rules

1. **Methodology:** an engagement pins one approved `MethodologyVersion`. The decomposed L1 records for that version are read-only. A new methodology version does not touch running engagements; adopting it is a G1 trigger that creates a new program version and requires re-mapping where modules changed.
2. **Snapshot:** an engagement pins one frozen `Snapshot`. New client documentation or walkthrough facts after G1 go into a new open snapshot. When the Engagement Manager freezes it, the engine diffs the two snapshots, lists the affected mappings and procedures, and raises the triggers in methodology 1.5 for only those. The engagement then pins the new snapshot, and the affected controls return to G2 or G3.
3. **Program:** every change to any L3 record creates a new `ProgramVersion`. Approvals attach to `(id, version)`; the validator computes which approvals lapsed and which controls dropped below G3.
4. **Execution:** L4 records carry the `program_version` they were executed under. If a control returns to G2 or G3 and its procedure changes, existing results for that control are kept with their old program version and marked superseded; they are not deleted and not reused without the engagement approver's recorded decision.
5. **History:** nothing in L2 or L3 is ever overwritten. The lineage `supersedes` is complete from the first record to the current one, with the actor and time of each change.

## 6. Workflow specification

The gates and triggers are those of methodology section 1.5. The steps below say what each actor produces and what the validator checks before a gate can be passed. "Validator" means a deterministic check of presence and consistency, never a judgment.

### Step 0: Client environment intake (before G1)

| | |
|---|---|
| Actor | Engagement Manager (collects), Planner (extracts) |
| Input | Client documents: RCM, narratives, policies, system inventories, org charts, prior reports, service organization reports, contracts. |
| Planner actions | Read each document as data (methodology 10.5). Extract candidate L2 records as `Fact`s with `basis = extracted`, each with document, location, and extraction method. Build `System`, `SystemLayer`, `ClientControl` (with verbatim `description_text`), `Policy`, `ServiceOrganization`, `EnvironmentChange`, `Risk`, `ITDependency`, `FinancialReportingElement`. Raise an `InformationGap` for every field the documents do not establish and for every contradiction between documents. |
| Output | An open `Snapshot`; an information gap list; proposed walkthrough questions attached to each control. |
| Validator | Every L2 content field has at least one `Fact`; every `Fact` has a source ref or `basis = asserted` with a person; contradictions are listed, not resolved by the agent. |

### Step 1: Scope (G1)

| | |
|---|---|
| Actor | Planner proposes; engagement approver decides |
| Input | Frozen snapshot; methodology version; period; mode. |
| Planner actions | Record `Engagement` pins and standards versions (M-01). Build the risk-to-control chain for every in-scope system (M-02). Build the `CoverageCell` grid: every system × every module, with a proposed status and rationale (M-03). Where the client has a process the RCM does not describe (for example incident management exists but no control is written), raise an `InformationGap` and propose a candidate control rather than marking the area a gap by default. Prepare the work-of-others assessment if reliance is intended (M-26). |
| Output | Engagement record; chain; coverage map; blocking information gaps resolved or accepted. |
| Validator | Pins set; every chain complete; every cell has a status, a rationale where excluded, a covering party where covered elsewhere; no blocking gap open. |
| Human | Approves scope. Records reasoning for every exclusion and every unresolved gap (methodology 10.6). |

### Step 2: Mapping and planned procedures (G2)

| | |
|---|---|
| Actor | Planner proposes; engagement approver decides |
| Input | Approved scope; L1 records; snapshot. |
| Planner actions | **Map:** for each client control, propose `ControlMapping`s to every module whose risk it addresses, with role and rationale; for each module with a cell "tested under a module", confirm at least one mapping or raise a gap. **Applicability:** for every expectation of every mapped module, propose an `ApplicabilityDecision` (default necessary) with rationale and, for not necessary or not applicable, the risk part addressed and evidence of absence. **Potential design gaps:** compare each necessary expectation to the control's `description_text` and the policies; where the description is silent, record a provisional "potential design gap" to be tested in the walkthrough, and search the snapshot for candidate alternative controls. **Tailor:** for every attribute of every mapping, draft a `TailoredProcedure`: quote the operating criterion from `description_text` (timeframe, approver role, trigger, evidence), name the client systems and extracts, define the population by source with the P1–P6 approach, set the pattern, propose the means of selection and the six-element rationale, and the deadline rule with time zone basis where the pattern needs one. **Walkthroughs:** plan one per control per variant with questions aimed at the open applicability decisions and potential gaps. **Plans:** roll-forward, project risk assessments, service organization assessments. |
| Output | A `ProgramVersion` at proposed-G2 state. |
| Validator | Every mapped module has a decision for every expectation; every attribute has a procedure record (planned or with a non-planned status); no procedure's `operating_criterion_text` is empty; where the description is silent on a criterion, the procedure records "criterion not defined by control" and links a D1 or D6 finding rather than inventing one; every selection rationale has six elements; every statistical declaration has design, selection, and evaluation recorded (M-09); every walkthrough variant has a plan (M-04); every project and service organization has an assessment; no mapped control lacks a mapping role. |
| Human | Approves the plan per control. The approval is of planned procedures only (methodology 1.5). |

### Step 3: Walkthroughs and design assessment (G3)

| | |
|---|---|
| Actor | Human conducts walkthroughs; Tester assesses; Independent Reviewer forms its own view; engagement approver decides |
| Input | Approved program version at G2. |
| Actions | Human conducts each walkthrough from the plan; responses become `Fact`s with `basis = confirmed`, which may create a new snapshot (triggering diffs). Tester records, for each general criterion and each necessary expectation, a `DesignOutcome` with walkthrough references. Potential design gaps become met, met by alternative control (the alternative control gets its own mapping and procedures), or design gap. Applicability decisions are finalized. Tailored procedures are confirmed or revised against the confirmed facts, especially criteria, populations, and deadline rules. Reviewer records its blind view of each decision and outcome. |
| Output | `ProgramVersion` at proposed-G3 state; design conclusions proposed. |
| Validator | Every necessary expectation has an outcome; every design gap has an evaluation or alternative control record (M-05); every finalized decision has rationale and approval where not necessary or not applicable (M-28); every procedure's criterion source is a confirmed fact or the control description; no walkthrough plan without responses. |
| Human | Approves the design assessment and the confirmed operating test plan per control, with reasoning where methodology 10.6 requires it. Only then may operating testing start (M-29). |

### Step 4: Execution, results, and review (G4)

As the methodology defines in 5.4 to 5.7 and 10, with the added validator in section 3.4: every population, evidence item, and result references the G3-approved program version, and the criterion applied equals the approved `operating_criterion_text`. A Tester who finds the approved criterion wrong in execution does not change it; the finding is a G2 or G3 trigger.

### Step 5: Reporting (G5)

As methodology section 8. The report draws the five categories from L3 and L4: deviations and deficiencies from L4; scope exclusions and unresolved gaps from `CoverageCell`; scope limitations from conclusions; variations from `Variation` and from applicability decisions other than necessary.

## 7. Tailoring rules the Planner must follow

1. **Quote, do not paraphrase, the operating criterion.** The `operating_criterion_text` is taken from `description_text` or a `Policy` parameter, with the source reference. If the description gives no timeframe, approver, or trigger, the procedure says so and the design assessment carries a D1 or D6 finding; the Planner never fills the blank with a common-practice value.
2. **Map by risk, not by name.** A client control is mapped to a module because it addresses the module's risk for a system in scope, not because its title resembles the module's. The rationale states which expectations it serves.
3. **One decision per expectation, always.** The default is necessary. A decision of not necessary names the part of the risk the expectation addresses and why it is absent or immaterial for this client, from the chain and the confirmed facts. The description being silent, the activity being uncommon at the client, and a clean history are never reasons (methodology 5.1).
4. **Potential design gaps are hypotheses until the walkthrough.** The Planner may say "the description is silent on whether removed access is assessed for use (UAR-DE6)" at G2; it may not conclude a gap until G3.
5. **Alternative controls are real controls.** Where another client control addresses the risk, it is mapped, gets its own applicability decisions and procedures, and is tested. "Covered by another control" with no mapping is a validator failure.
6. **Populations come from the client's systems, named.** The procedure names the system, the report or extract, the fields, and the generation evidence, and states which P1–P6 steps are performed by code on that extract.
7. **Deadline rules are explicit.** For event-driven patterns, the trigger event, the timeframe, the time zone of each source, and the date-only convention are written into the procedure (methodology 6.6 rule), not applied ad hoc in testing.
8. **Patterns follow the population.** The procedure declares the testing pattern from methodology 13, which determines the record fields the engine will require.
9. **Keep the lineage.** Every proposed mapping, decision, and procedure carries the source references and the reasoning that produced it, and is never overwritten.

## 8. Data handling

- L2 contains personal data (names, titles, terminations). The engine stores only what the chain and the procedures need, records the clearance under which client data is processed (approvals item C5), and keeps L2 separate from L1 so that the methodology can be shared without client data.
- Documents are untrusted content. Extraction runs with read-only access to the record store, and any text in a document that addresses the reader or an agent is flagged under methodology 10.5.

## 9. End-to-end example with two clients

The facts below are invented. They are chosen so that the same methodology produces different programs.

### 9.1 The two clients

| | Client A: Northwind Foods, Inc. | Client B: Lumen Health Partners, LLC |
|---|---|---|
| Fiscal year | Calendar 2026; as-of date 31 December 2026 | Ends 30 June 2026; as-of date 30 June 2026 |
| Mode | Internal audit, IIA Standards adopted by charter | Internal audit, IIA conformance not stated (information gap) |
| In-scope systems | SAP ECC 6.0 (application), Oracle 19c (database), Red Hat Linux (OS), Control-M (scheduler), ServiceNow (tickets), Active Directory | NetSuite (SaaS ERP, live since 1 October 2025), Workday (SaaS HR), Okta (identity provider), ClaimsLens (custom reporting app on AWS, built and run by managed service provider Cirrus Ops, deployed through GitHub Actions), Celigo (integration platform) |
| Hosting | Own data centre in Columbus, Ohio, with a recovery site in Indianapolis | No company-held equipment; offices use laptops only |
| Development | In-house ABAP team; SAP transport management | No in-house development; NetSuite configuration and SuiteScripts by Finance Systems; ClaimsLens code by Cirrus Ops |
| Service organizations | ADP (payroll; SOC 1 Type 2) | NetSuite (SOC 1 Type 2), Workday (SOC 1 Type 2), AWS (SOC 1 Type 2), Okta (SOC 2 Type 2 only), Cirrus Ops (no report) |
| Time zones | America/New_York throughout | Workday and Okta record in UTC; NetSuite in America/Los_Angeles; staff in America/Chicago |

### 9.2 Client control environment extracts (L2)

**Client A controls** (verbatim descriptions shortened for the example):

| Ref | Description (operating criteria in bold) | Frequency | Owner |
|---|---|---|---|
| A-01 | "Business owners review SAP user access **quarterly** using the SUIM listing; removals are requested in ServiceNow and completed by Security **within 5 business days** of the review sign-off." | Quarterly | SAP Security Manager |
| A-02 | "Emergency SAP access is granted through GRC Firefighter after **Controller approval**; the Firefighter log is reviewed by the Controller **within 3 business days** of the session." | Event | Controller |
| A-03 | "SAP transports are approved by the **CAB** before import; the Basis team imports; developers do not hold import authorization." Walkthrough later finds two Basis staff also hold developer keys, and that the IT Manager reviews all imports **weekly** against CAB approvals. | Event | Basis Lead |
| A-04 | "Control-M job failures alert Operations; a ServiceNow incident is raised and the job is rerun **the same business day**." | Event | Operations Manager |
| A-05 | "New SAP access is requested in ServiceNow and approved by the **requester's manager and the role owner** before Security grants it." | Event | SAP Security Manager |
| A-06 | "On termination, the SAP HCM action creates a ServiceNow task; AD and SAP accounts are disabled **within 1 business day of the termination date**." | Event | IT Service Desk Lead |
| A-07 | "Data centre badge access is reviewed **quarterly** by the Infrastructure Manager." | Quarterly | Infrastructure Manager |
| A-08 | "Oracle RMAN backups run nightly; failures are handled as Control-M failures; a restore test is performed **semi-annually**." | Daily, semi-annual | DBA Lead |
| A-09 | "AD and SAP password parameters are set per the Information Security Policy (**12 characters, 90-day expiry, lockout after 5 attempts**); MFA is required for VPN." | Configuration | Security Architect |
| A-10 | "Direct table changes (SE16N, debug-and-replace) are restricted to Firefighter sessions; data fixes require a ServiceNow request approved by the **Controller** before execution." | Event | Controller |
| A-11 | "The ADP SOC 1 Type 2 report is reviewed **annually** by the Payroll Manager and the IT Compliance Analyst." | Annual | Payroll Manager |
| (none) | ServiceNow incident process exists; no control is written for it. | | |

**Client B controls:**

| Ref | Description (operating criteria in bold) | Frequency | Owner |
|---|---|---|---|
| B-01 | "Workday hire, transfer, and termination events feed Okta; Okta provisions and deprovisions NetSuite, ClaimsLens, and Google Workspace. Deprovisioning completes **within 1 hour of the Workday termination effective time**." | Automated, event | People Systems Lead |
| B-02 | "NetSuite roles beyond the Okta-assigned baseline are requested in Jira and approved by the **Finance Systems Manager** before assignment." | Event | Finance Systems Manager |
| B-03 | "The Controller reviews NetSuite user roles **semi-annually**." (Silent on removal timeframe, on service and integration accounts, and on assessing whether inappropriate access was used.) | Semi-annual | Controller |
| B-04 | "NetSuite customizations and SuiteScripts are approved in Jira by the **Finance Systems Manager** and tested in sandbox before deployment via SuiteCloud." | Event | Finance Systems Manager |
| B-05 | "ClaimsLens changes require a **pull request approved by a second Cirrus Ops engineer**; GitHub Actions deploys on merge to main." | Event, automated enforcement | Cirrus Ops (vendor) |
| B-06 | "Okta enforces MFA for all users; password policy per Okta default." | Configuration | People Systems Lead |
| B-07 | "The NetSuite implementation followed the partner's methodology: UAT sign-off by the Controller; data migrated from QuickBooks with a trial balance reconciliation." | Project | CFO |
| B-08 | "Celigo integration failures alert the Finance Systems inbox and are resolved **before the next scheduled run**." | Event | Finance Systems Manager |
| B-09 | "SOC reports for NetSuite, Workday, AWS, and Okta are obtained **annually** and reviewed by the Controller." | Annual | Controller |
| (none) | No written control for NetSuite administrator activity monitoring, for direct data changes (NetSuite CSV imports and mass updates are used), for backups, or for incidents (Jira Service Management exists). | | |

### 9.3 Information gaps raised at intake

| Client | Gap | Blocking |
|---|---|---|
| A | A-03: do any developers hold import authorization? The RCM says no; the SAP authorization extract was not provided. | Yes, for CM-CHG design |
| A | No written incident control; ServiceNow incident data exists. Candidate control proposed. | No |
| A | Time zone of Control-M and ServiceNow timestamps not documented (assumed America/New_York; needs confirmation). | Yes, for deadline rules |
| B | Does Lumen's internal audit charter adopt the IIA Standards? | Yes, for applicable requirements |
| B | Contractors: are Cirrus Ops engineers and other contractors in Workday? | Yes, for AC-TERM population |
| B | NetSuite administrators: who holds the Administrator role, and is any admin also a transaction user? | Yes, for AC-PRIV applicability |
| B | ClaimsLens data: is it re-creatable from NetSuite and Snowflake, or does it hold data of its own? | Yes, for CO-BKP applicability |
| B | Okta provides a SOC 2 only; Cirrus Ops has no report. | Yes, for TP-SOC1 assessment |

### 9.4 Coverage map at G1 (selected cells)

| Module | Client A | Client B |
|---|---|---|
| AC-PHYS | Tested under module (own data centre, A-07). | NetSuite, Workday, Okta, AWS: excluded, covered elsewhere, through TP-SOC1 with CUEC mapping. Offices: excluded, not relevant, with the asset register showing no servers or media. |
| DEV-SDLC | Excluded, not relevant: the transport log and project portfolio show no implementation, major upgrade, or migration in 2026. | Tested under module: NetSuite go-live on 1 October 2025 falls in the fiscal year (B-07). |
| CO-BKP | Tested under module (A-08). Analysis: SAP financial records exist only in Oracle; recovery objectives tied to month-end close. | NetSuite and Workday: covered elsewhere through TP-SOC1. ClaimsLens: decision deferred to the information gap on re-creatability. |
| CO-INC | Unresolved at intake; the Planner proposes a candidate control from the ServiceNow incident process, to be confirmed in the walkthrough. If confirmed, tested under an engagement-specific procedure. | Candidate control from Jira Service Management, same treatment. |
| TP-SOC1 | Tested under module (A-11, ADP). | Tested under module (B-09, five service organizations including two without a SOC 1). |
| CM-DATA | Tested under module (A-10). | Tested under module as a candidate control: NetSuite CSV imports and mass updates exist; no written control. The absence is assessed in design. |

### 9.5 Control mappings (many to many)

| Client control | Modules | Role and rationale |
|---|---|---|
| A-02 Firefighter | AC-PRIV (emergency access, PRIV-DE7, PRIV-J to L) | Primary |
| A-02 Firefighter | CM-DATA (path for direct changes, DATA-DE1) | Partial: Firefighter sessions are the path for SE16N changes; the approval and review in A-10 cover the rest. |
| A-03 Transports | CM-CHG | Primary |
| A-03 weekly import review (found in walkthrough) | CM-CHG (CHG-DE5) | Alternative: addresses the two Basis staff with developer keys. Mapped as its own control, A-03b, and tested. |
| A-04 Control-M failures | CO-JOB; CO-BKP (BKP-DE2, backup failures handled as job failures) | Primary; partial |
| A-06 Terminations | AC-TERM | Primary |
| A-11 ADP review | TP-SOC1 | Primary |
| B-01 Okta lifecycle | AC-PROV (PROV-DE6 automated provisioning); AC-TERM (TERM-DE1 to DE4); AC-AUTH (AUTH-DE4 federation) | Primary for AC-TERM; partial for AC-PROV (baseline access only; B-02 covers elevated roles); partial for AC-AUTH |
| B-02 NetSuite roles | AC-PROV | Primary for non-baseline roles |
| B-03 Semi-annual review | AC-UAR | Primary |
| B-05 ClaimsLens pipeline | CM-CHG (automated enforcement tested under methodology 5.5); TP-SOC1 (Cirrus Ops operates it; no report) | Primary; partial |
| B-06 Okta MFA | AC-AUTH | Primary |
| B-07 NetSuite implementation | DEV-SDLC | Primary |
| B-09 SOC report review | TP-SOC1 | Primary, one control mapped to five `ServiceOrganization` records |
| B candidate: CSV import control | CM-DATA | Proposed at intake; existence confirmed or denied in the walkthrough |

### 9.6 Applicability decisions proposed at G2 (selected)

| Client | Mapping | Expectation | Proposed decision | Rationale |
|---|---|---|---|---|
| A | A-01 / AC-UAR | UAR-DE6 (assess whether inappropriate access was used) | Necessary | SAP roles reviewed include posting and payment release. The description is silent, which is not a reason; recorded as a potential design gap for the walkthrough. |
| A | A-09 / AC-AUTH | AUTH-DE4 (federation and bypass paths) | Necessary | No SSO, but direct Oracle and Linux logons are bypass paths to SAP data; AUTH-F applies to them. |
| A | AC-PRIV (A-02 and the SAP_ALL listing) | PRIV-DE6 (activity monitoring) | Necessary for Firefighter (covered by A-02 log review); for standing Basis access, proposed necessary pending the walkthrough on whether any standing privileged user is also a transaction user. | |
| B | B-01 / AC-PROV | PROV-DE7 (temporary grants) | Not applicable, proposed | Okta and NetSuite have no time-boxed grant feature enabled; evidence: Okta configuration export, NetSuite role settings. To be confirmed. |
| B | B-03 / AC-UAR | UAR-DE6 | Necessary | Controller-reviewed roles include journal posting and vendor master changes. Description silent; potential design gap. |
| B | B-03 / AC-UAR | UAR-DE5 (changes tracked to completion within a timeframe) | Necessary | The description sets no timeframe: recorded as a D6 finding for the design assessment, and the procedure for UAR-E states "criterion not defined by control". |
| B | AC-PRIV (NetSuite Administrator role) | PRIV-DE6 | Necessary | Three Administrators, one of whom (Finance Systems Manager) also posts journals. No monitoring control exists; potential design gap. |
| B | AC-PHYS | All | Not applicable for offices (asset register); met by alternative control for hosted systems, through TP-SOC1 CUEC mapping | |
| B | CO-BKP / ClaimsLens | All | Not necessary, proposed | Walkthrough to confirm that ClaimsLens holds only data derived nightly from NetSuite and Snowflake and can be rebuilt from them; if so, loss of ClaimsLens cannot affect financial records. If ClaimsLens holds adjustments of its own, the decision becomes necessary. |
| B | B-07 / DEV-SDLC | DEV-DE5 rollback | Necessary | The project risk assessment rates the migration high: full general ledger and open items from QuickBooks; the cut-over had no rollback plan on file, a potential design gap. |

### 9.7 Tailored procedures (two examples)

**Client A, mapping A-01 / AC-UAR, attribute UAR-E.**

| Field | Content |
|---|---|
| Operating criterion (quoted) | "removals … completed by Security **within 5 business days** of the review sign-off" (A-01, RCM v7, row 12). |
| Procedure | For every removal decision in each selected quarterly review, obtain the SAP user change documents (SU01 change history, tables CDHDR and CDPOS, object IDENTITY) and determine the date the role was removed or the user locked. Compare with the reviewer's sign-off date plus five business days, using the Northwind holiday calendar. |
| Pass/fail | Pass: removal date on or before the deadline. Fail: after the deadline, or no removal found. |
| Evidence requirements | Review sign-off records with dates (ServiceNow REQ export); SUIM listing used, with query parameters and row count; CDHDR and CDPOS extract for the period with extraction screenshot showing system SAP PRD, date, and user; holiday calendar. |
| Population | All removal decisions in the four 2026 reviews, from the ServiceNow REQ export filtered on catalog item "Access removal, UAR". Completeness: P6 reconciliation of removal decisions to the reviewers' marked listings (count per review). |
| Pattern | Recurring (review instances) with an event-driven sub-population (removals). |
| Means of selection | Full population by code: 4 reviews; all removal decisions (expected 120 to 160). |
| Deadline rule | Trigger: sign-off timestamp in ServiceNow (America/New_York). Timeframe: 5 business days. Sources: ServiceNow (America/New_York), SAP change documents (system time, confirmed America/New_York). No date-only sources. |

**Client B, mapping B-01 / AC-TERM, attribute TERM-B.**

| Field | Content |
|---|---|
| Operating criterion (quoted) | "Deprovisioning completes **within 1 hour of the Workday termination effective time**" (B-01, IT controls narrative, section 3.2). |
| Procedure | For every termination in the period, take the Workday termination effective timestamp and the Okta System Log event `user.lifecycle.deactivate` for the same user; compute the difference. Separately, for each downstream application, confirm the NetSuite and ClaimsLens accounts show deactivation via the Okta push (NetSuite login audit trail; ClaimsLens user table export from Cirrus Ops). |
| Pass/fail | Pass: Okta deactivation at or before Workday effective time plus 60 minutes, and downstream deactivation evidenced. Fail: later, or absent. Integration and service accounts in NetSuite that are not Okta-managed are outside this procedure and are handled under AUTH-E and AC-PRIV. |
| Evidence requirements | Workday termination report (UTC, with effective time field, run parameters, row count); Okta System Log export for the period (UTC); NetSuite login audit trail; ClaimsLens user table export with Cirrus Ops extraction evidence. |
| Population | All Workday terminations with effective time in the fiscal year. Contractors: Cirrus Ops engineers and other contractors are not in Workday (gap confirmed); their source is the contractor register kept by Procurement, assessed under P1–P6 as a separate population with weaker generation evidence. |
| Pattern | Event-driven. |
| Means of selection | Full population by code for Workday terminations (expected about 110). Contractor population: full population, small (expected under 20). |
| Deadline rule | Trigger: Workday `termination_effective_datetime` (UTC). Timeframe: 60 minutes. Sources: Workday (UTC), Okta (UTC), NetSuite (America/Los_Angeles, converted), ClaimsLens (UTC per Cirrus Ops). Date-only sources: the contractor register records end dates only; convention: end of day America/Chicago, recorded in the procedure. |

### 9.8 Walkthrough outcomes and design assessment at G3 (selected)

| Client | Expectation | Outcome | What was found |
|---|---|---|---|
| A | A-01 / UAR-DE6 | Design gap | No one assesses whether access marked for removal was used. No alternative control found. UAR-F stays in the workpaper as "not tested, design gap" and goes to deficiency evaluation. |
| A | A-03 / CHG-DE5 | Met by alternative control | Two Basis staff hold developer keys; the weekly import review by the IT Manager (A-03b) is mapped, and its own procedures are added at this gate. The program version increments and A-03 and A-03b return to G2 for the new procedures, then to G3. |
| A | Candidate incident control | Met; candidate becomes A-12 | The ServiceNow incident process has priorities, timeframes, and root cause for P1 incidents. A-12 is added to the snapshot (new snapshot frozen, pinned) and mapped to CO-INC under an engagement-specific procedure. |
| B | B-03 / UAR-DE5 | Design gap (D6) | No timeframe for removals; the walkthrough shows removals are made "when someone gets to it". UAR-E is marked "not tested, design gap". |
| B | B-03 / UAR-DE6 | Design gap | No assessment of use; no alternative control. |
| B | NetSuite Administrator / PRIV-DE6 | Design gap | No logging review; the Finance Systems Manager holds Administrator and posts journals. Goes to deficiency evaluation with a direct-effect path (methodology 7.2). |
| B | B-01 / PROV-DE7 | Not applicable, confirmed | Configuration exports show no time-boxed assignment feature in use. |
| B | ClaimsLens / CO-BKP | Not necessary, confirmed | The walkthrough and the data flow diagram confirm ClaimsLens holds no data of its own; nightly rebuild from NetSuite and Snowflake is demonstrated. Decision recorded with the diagram and the rebuild job evidence, approved, listed in the variations schedule. |
| B | B-07 / DEV-DE5 rollback | Design gap, assessed as low severity in evaluation | No rollback plan existed at cut-over; the go-live succeeded. The deficiency evaluation records that the exposure has passed, and the engagement approver records their reasoning. |
| B | CM-DATA candidate | Design gap at DATA-DE1 | NetSuite CSV imports and mass updates are used by three people with no request or approval step, and the only record is NetSuite's system notes. Case: design failure for the approval expectations (DATA-DE2 to DE4); the population can still be established from system notes (DATA-DE5 met), so DATA-A is tested and every import is listed as a change with no request. |

### 9.9 Execution extracts at G4

**Client A, A-01 / UAR-E.** 148 removal decisions; 147 executed within the deadline; one executed on the ninth business day. Test status: exception. Evaluation record: not performed on time; cause per the Security team, a ServiceNow task assigned to a person on leave; isolated, shown by the other 147; exposure: the user retained a display-only role for four extra days, confirmed from the role content, and no logon in the window (TERM-C style check). Recommendation: effective with a documented deviation, under the engagement approver's judgment. The approver records reasoning and approves the treatment "confirmed deviation" and the conclusion "effective".

**Client B, B-01 / TERM-B.** 112 Workday terminations: all deactivated in Okta within 60 minutes (median 4 minutes). Contractor register: 17 end dates; 15 deactivated within the convention; 2 Cirrus Ops engineers remained active in ClaimsLens for 11 and 26 days after their end dates, because Cirrus Ops manages its own staff's ClaimsLens accounts outside Okta. Test status: two exceptions in the contractor population. The evaluation finds a systematic cause (a path outside the control), raises a G3 trigger (new design gap under TERM-DE3 found during operating testing), and the engagement approver decides the contractor path is a design gap for deficiency evaluation, with the Workday population concluded separately.

### 9.10 Reporting extracts at G5

| Category | Client A | Client B |
|---|---|---|
| Deviations and deficiencies | A-01: one confirmed deviation (UAR-E); design gap UAR-DE6 evaluated as a deficiency. | B-03: design gaps UAR-DE5 and UAR-DE6; NetSuite Administrator monitoring gap evaluated with a direct-effect path; contractor deprovisioning gap; CSV import approval gap. |
| Scope exclusions | DEV-SDLC, not relevant (no project). | AC-PHYS offices, not relevant; AC-PHYS and CO-BKP for hosted systems, covered elsewhere through TP-SOC1. |
| Unresolved coverage gaps | None. | Cirrus Ops: no service auditor evidence and no company controls over its change and access activity beyond B-05; recorded as an unresolved gap for ClaimsLens change management until management decides under methodology 6.13 point 7. |
| Scope limitations | None. | None. |
| Approved variations | CO-INC tested under an engagement-specific procedure (A-12). | ClaimsLens CO-BKP "not necessary"; B-01 PROV-DE7 "not applicable"; Okta's SOC 2 Type 2 accepted as evidence for its relevant controls after a recorded content judgment (approvals item A29). |

### 9.11 What the example shows

- The same thirteen modules produced two different programs because the mappings, decisions, and criteria came from each client's own records.
- Silent descriptions (B-03 on timeframe and lookback; A-01 on lookback) did not remove expectations; they became design findings.
- Alternative controls (A-03b) and candidate controls (A-12, the CSV import process) entered the program as real controls with their own procedures and approvals, with the program version and snapshot pins advancing each time.
- One client control served three modules (B-01), and one module drew on several client controls (CM-CHG at Client A: A-03, A-03b, A-10).
- Operating testing began only after G3, and a finding in execution (the contractor path at Client B) went back through the gates rather than being handled ad hoc.

## 10. Open design decisions for review

1. **Granularity of mappings:** whether a mapping is per client control per module (as drafted) or per client control per expectation. Per module is simpler; per expectation allows a control to serve only some expectations of a module without a "partial" role.
2. **Candidate controls:** whether the Planner may add a candidate control to the snapshot before the walkthrough confirms it (drafted: yes, as an extracted fact), or only afterwards.
3. **Snapshot freezing:** whether every walkthrough response freezes a new snapshot (drafted: the Engagement Manager freezes when ready, and the engine diffs), given the reapproval cost.
4. **Superseded results:** whether results executed under a superseded program version may ever be reused when the procedure change did not affect them (drafted: only by the engagement approver's recorded decision).
5. **Criterion from policy versus description:** when a policy and a control description conflict, which is the operating criterion (drafted: the description, with the conflict as a D1 finding).
6. **Reuse across periods:** whether L3 records from a prior engagement may seed the next (drafted: as proposals only, re-approved at every gate).
7. **Personal data minimization:** which `Person` fields are kept in L2 and for how long.
8. **Engine ownership of the L1 decomposition:** whether the decomposed records are generated from the methodology document by code at approval time (drafted) or maintained by hand.
