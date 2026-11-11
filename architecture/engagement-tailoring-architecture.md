# Client Control Environment and Engagement Tailoring Architecture

| | |
|---|---|
| **Version** | 0.2 |
| **Status** | DESIGN FOR REVIEW. Not implemented. The methodology (`methodology/sox-itgc-methodology.md`, version 0.4.1) is not modified by this document. Version 0.2 is a targeted refinement of 0.1 (kept in `archive/`); the change log is in section 11. |
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
3. **Nothing is omitted silently.** Every expectation of every module relevant to a system receives an applicability decision and a coverage assessment across all the client controls that contribute to it; every module not mapped to any control receives a coverage-map status. A validator refuses a control program with any expectation or area left undecided.
4. **Coverage is assessed per expectation, across controls.** A client control contributes to the expectations it addresses, for the scope it covers. No control is required to satisfy every expectation of a module on its own, and no expectation is treated as covered until the contributions of all its controls cover the whole relevant scope.
5. **Changes invalidate only what depends on them.** Every record sits in a dependency graph. A change lapses the approvals and results that derive from the changed record, and nothing else. Scope changes always return to G1.

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
- A client control is a **candidate** until a walkthrough has evidenced it and a human has confirmed it (section 5.6). Candidates may be mapped and planned; they may not be tested or relied on as alternative controls.
- Every fact carries the date it was last confirmed. A fact confirmed before the current period is **stale** and is reconfirmed before anything in the current engagement relies on it (section 5.8).
- The environment is independent of any engagement and of any methodology version. It can be reused across periods and audit types, under the reuse rules in section 5.8.

### 2.3 L3 Engagement audit program

The bridge between L1 and L2 for one engagement, in versions, each approved at the gates in methodology section 1.5.

- **Mapping** records connect client controls to modules, many to many, each with a role (primary, partial, alternative). Beneath each mapping, **expectation contributions** say which expectations the control addresses and for what scope.
- **Coverage units** are the unit of assessment: one module expectation for one scope (a system, a layer, a user population, a location, or an operating variant). Each coverage unit carries the **applicability decision** (methodology 5.1, step 1), the aggregated **coverage assessment** across all contributing controls, and the **design outcome** at G3 (met, met by alternative control, design gap).
- A **criteria register entry** per client control fixes the operating criteria: the governing description, incorporated policies and procedures, effective dates, walkthrough clarifications, contradictions and their resolution, and the final criterion text per attribute.
- **Tailored procedures** are made per operating attribute per mapping, with the criterion drawn from the register, the evidence named by client system and report, the population and its subpopulations defined by client source, and the selection rationale.
- The program is revised **per control**. Each client control has its own control program with its own gate status; the engagement keeps an append-only revision history of which control program versions were in force.
- The control program approved at G3 is the only thing L4 may test against for that control.

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
| `Fact` | `snapshot`, `subject` (record it describes), `statement`, `basis` (extracted, confirmed, asserted), `source_refs[]`, `confirmed_by`, `confirmed_at`, `valid_as_of`, `last_confirmed_at`, `currency` (current, stale) | Every L2 record's content fields are backed by facts. `currency` is computed from `last_confirmed_at` against the engagement period (section 5.8). |
| `BusinessUnit` | `client`, `name`, `location`, `time_zone` | |
| `FinancialReportingElement` | `client`, `account_or_disclosure`, `assertions[]`, `significance`, `source_refs[]` | Chain link 1 (methodology 4.1). |
| `Process` | `client`, `name`, `elements[]`, `business_units[]` | |
| `ITDependency` | `client`, `type` (automated control, IT functionality, key report, interface, data), `name`, `process`, `elements[]`, `system` | Chain link 2. |
| `System` | `client`, `name`, `vendor`, `hosting` (on-premises, colocation, hosted, SaaS), `in_scope_reason`, `business_units[]`, `time_zone` | Chain link 3. |
| `SystemLayer` | `system`, `layer` (application, database, operating system, identity provider, scheduler, pipeline, ticketing, network), `product`, `managed_by` (client, service organization), `location` | |
| `ClientControl` | `client`, `reference` (client's own ID), `description_text` (verbatim), `description_origin` (client document, derived from walkthrough), `objective`, `type` (manual, automated, IT-dependent manual), `frequency`, `trigger_event`, `timeframe_text`, `performer_role`, `approver_role`, `evidence_retained`, `systems[]`, `layers[]`, `business_units[]`, `operating_variants[]`, `effective_from`, `effective_to`, `status` (candidate, confirmed, not confirmed, retired), `confirmation` (walkthrough refs, approval ref), `source_refs[]` | `description_text` is never paraphrased; the operating criteria derive from it through the criteria register. Candidates are section 5.6. |
| `ControlRiskLink` | `control`, `risk` | Many to many. |
| `Risk` | `client`, `statement`, `elements[]`, `dependencies[]`, `source_refs[]` | |
| `Policy` | `client`, `title`, `parameters[]` (name, value, scope), `effective_from`, `source_refs[]` | Operating criteria for configuration patterns. |
| `ServiceOrganization` | `client`, `name`, `services[]`, `systems[]`, `interaction_degree`, `evidence_available[]` (report type, period, auditor), `subservice_orgs[]`, `cuecs[]`, `source_refs[]` | |
| `Person` | `client`, `name`, `title`, `team`, `business_unit`, `roles[]` (control owner, approver, administrator) | Only what the engagement needs; see data handling in section 8. |
| `EnvironmentChange` | `client`, `date`, `description`, `affected_records[]`, `source_refs[]` | Implementations, migrations, reorganizations, ownership changes. |
| `FactReconfirmation` | `prior_fact`, `method` (document comparison, system comparison, walkthrough, client assertion), `result` (unchanged, changed, withdrawn), `new_fact`, `evidence_refs[]`, `confirmed_by`, `confirmed_at` | How a stale fact was brought current (section 5.8). A client assertion of "no change" has `basis = asserted` and does not by itself make a criterion fact current. |
| `CriteriaRegisterEntry` | `client_control`, `snapshot`, `governing_description` (fact ref, document version, `effective_from`, `effective_to`), `incorporated_policies[]` (policy, parameter, effective dates), `procedures[]` (SOP refs), `walkthrough_clarifications[]` (fact refs), `contradictions[]`, `effective_criteria[]` (per operating attribute: criterion text, drawn-from source, effective dates, subpopulation if the criterion differs by subpopulation), `status` (draft, contradictions open, finalized), `finalized_by`, `finalized_at` | Section 5.3. `TailoredProcedure.operating_criterion_text` is copied from `effective_criteria`, never typed independently. |
| `Contradiction` | `register_entry`, `sources[]` (two or more fact refs), `subject` (timeframe, approver, trigger, frequency, scope, evidence), `materiality` (material, immaterial), `resolution_text`, `chosen_source`, `resolved_by` (qualified human), `resolved_at`, `status` (open, resolved) | A material contradiction blocks finalization of the entry. |

### 3.3 L3 Engagement audit program

| Entity | Key fields | Notes |
|---|---|---|
| `Engagement` | `client`, `name`, `mode`, `period_start`, `period_end`, `as_of_date`, `methodology_version` (pinned), `snapshot` (pinned), `standards_versions[]`, `engagement_approver`, `qualified_resolvers[]` (humans who may resolve material contradictions), `external_reliance_intended` (bool), `status` | Pins are set at G1 and changed only by a G1 trigger. |
| `ProgramRevision` | `engagement`, `revision_no`, `created_at`, `cause` (trigger ref, gate passage, impact assessment), `control_program_versions[]` (the `(id, version)` of every control program in force), `scope_records[]` (chain, coverage map versions), `record_set_hash`, `supersedes` | Append-only engagement-level history. A new revision is written whenever any control program or scope record changes version. |
| `ControlProgram` | `engagement`, `client_control`, `version`, `gate_status` (none, G2, G3, G4), `mappings[]`, `coverage_units[]`, `procedures[]`, `plans[]`, `supersedes` | The unit of revision and of gate passage. L4 references `(ControlProgram.id, version)`. |
| `CoverageCell` | `engagement`, `system`, `module`, `status` (tested under module, engagement-specific procedure, excluded not relevant, excluded covered elsewhere, unresolved gap), `rationale`, `covering_party`, `approval_ref` | Methodology 4.2. One per system per module. Scope-level; changes return to G1. |
| `ControlMapping` | `control_program`, `client_control`, `module`, `role` (primary, partial, alternative), `rationale`, `source_refs[]` | Many to many. A role says how the control relates to the module as a whole; the contributions beneath it say what it actually covers. |
| `ExpectationContribution` | `mapping`, `design_expectation`, `contribution` (full, partial, none), `scope[]` (systems, layers, user populations, locations, operating variants the control covers for this expectation), `rationale`, `source_refs[]` | One per expectation of the mapped module, including `none` with a reason. "Partial" means the control covers the expectation for the listed scope only. |
| `CoverageUnit` | `engagement`, `module`, `design_expectation`, `scope` (one system, and where relevant one layer, user population, location, or variant), `contributions[]` (refs), `applicability` (decision, rationale, risk_part_addressed, evidence_of_absence[], proposed_at, decided_at, approval_ref, reviewer_view), `coverage_assessment` (covered, covered by combination, partially covered, not covered; computed from contributions against the scope), `design_outcome` (met, met by alternative control, design gap; rationale; walkthrough refs; approval_ref), `control_programs[]` (every control program contributing) | The unit at which methodology 5.1 is applied. Applicability is decided here, not per mapping, because necessity is a property of the risk for the scope, not of any one control. |
| `TailoredProcedure` | `control_program`, `mapping`, `operating_attribute`, `coverage_units[]`, `procedure_text`, `operating_criterion_text` (copied from the register entry's `effective_criteria`), `criterion_ref` (register entry, attribute, version), `pass_fail_criteria[]`, `evidence_requirements[]`, `population_definition`, `subpopulations[]` (refs), `pattern`, `means_of_selection`, `selection_rationale`, `deadline_rule`, `field_classes` (which fields are planning-class and which design-class, section 5.7), `status` (planned, not tested design gap, not necessary, not applicable) | One per attribute per mapping. Absent only if the attribute's expectation was decided not necessary or not applicable, in which case `status` says so and the record still exists. |
| `Subpopulation` | `procedure`, `dimension` (system, layer, user population, location, operating variant, time segment), `definition`, `criterion_override` (register ref, if the criterion differs), `population_definition`, `completeness_approach`, `means_of_selection`, `selection_rationale`, `status` | Section 5.5. Each has its own population, selection, results, and sub-conclusion in L4. |
| `InformationGap` | `engagement`, `subject`, `question`, `why_needed`, `blocking` (bool), `raised_at`, `resolved_by_fact` | Planner output. |
| `WalkthroughPlan` | `control_program`, `variant`, `questions[]`, `occurrence_to_follow`, `conducted_by`, `conducted_at`, `responses[]` (each a Fact) | Methodology 5.1. |
| `RollForwardPlan`, `RemediationPlan` | `control_program`, text, approvals | Methodology 5.8. |
| `ServiceOrgAssessment` | `engagement`, `service_organization`, the seven points of methodology 6.13, `approval_ref` | |
| `ProjectRiskAssessment` | `engagement`, `environment_change`, the elements of methodology 6.10, `approval_ref` | |
| `Variation` | `engagement`, `control_program`, `rule`, `type`, `rationale`, `approver_role`, `approval_ref` | Methodology 8 variations schedule. |
| `Approval` | `record_id`, `record_version`, `gate`, `approver`, `approved_at`, `mode` (individual, batch, re-affirmation), `batch_ref`, `reasoning_text` | One approval per record version, even when approved in a batch. Re-affirmation is section 5.7. |
| `Trigger` | `engagement`, `type`, `affected_records[]` (computed from the graph), `return_to_gate`, `raised_by`, `raised_at`, `impact_assessment` | Methodology 1.5. |
| `DependencyEdge` | `from_record` (id, version), `to_record` (id, version), `kind` (derived from, criterion of, population of, evidence for, approval of, result of, conclusion of) | Section 5.2. Written by the engine whenever a record references another. |
| `ImpactAssessment` | `trigger`, `changed_record` (id, from_version, to_version), `change_class` (criterion, population source, evidence requirement, means of selection, procedure text editorial, methodology version, snapshot fact, scope), `affected[]` (each: record ref, proposed_disposition: retain valid, re-perform, supersede; validity_basis; reviewer_check; approval_ref), `prepared_by`, `reviewed_by` (Independent Reviewer), `approved_by`, `status` | Section 5.4. No execution record is reused without an entry here. |

### 3.4 L4 Audit execution

Existing methodology records, each with `control_program` (id and version) added, and two additions for subpopulations.

| Entity | Added field | Validator |
|---|---|---|
| `Population` | `tailored_procedure`, `subpopulation` | Source and filters equal the approved `population_definition` of the procedure or subpopulation. |
| `Evidence` | `evidence_requirement` | Matches a requirement in the approved procedure, or is logged as unplanned with a reason. |
| `Item`, `ItemAttributeResult` | `tailored_procedure` | Criterion applied equals `operating_criterion_text` of the approved version. |
| `SubpopulationConclusion` | `subpopulation`, `control_program` | New. Effective, not effective, or unable to conclude for that subpopulation alone, with its own counts. |
| `ControlConclusion` | `control_program`, `subpopulation_conclusions[]`, `scope_statement`, `aggregation_rationale` | Section 5.5: never "effective" while any relevant subpopulation is not effective or unable to conclude, unless the scope statement excludes it and the excluded scope is reported. |
| `ExceptionEvaluation`, `ReviewNote`, `CrossCheckResult`, `DeficiencyEvaluation`, `Report` | `control_program`, `reused_from` (optional) | All reference the control program version of their items. `reused_from` points to the original record when an impact assessment allowed reuse. |

## 4. Data relationships

Cardinalities that matter for the design:

| Relationship | Cardinality | Why |
|---|---|---|
| `ClientControl` to `Module` through `ControlMapping` | Many to many | One identity-lifecycle control may serve AC-PROV, AC-TERM, and AC-AUTH; one module may be served by a provisioning control, an HR feed, and a reconciliation. |
| `ControlMapping` to `ExpectationContribution` | One to many, exactly one per expectation of the module | Says what the control covers, including "none". |
| `ExpectationContribution` to `CoverageUnit` | Many to many | One contribution may cover several scopes; one coverage unit aggregates contributions from several controls. |
| `CoverageUnit` to `ClientControl` | Many to many, through contributions | This is where partial coverage by several controls is assessed together. |
| `ClientControl` to `CriteriaRegisterEntry` | One to one per snapshot | The register entry is the structured form of the control's criteria. |
| `CriteriaRegisterEntry` to `Contradiction` | One to many | Open material contradictions block finalization. |
| `ClientControl` to `System` and `SystemLayer` | Many to many | One access review may cover three systems; one system has several layers each with its own controls. |
| `ClientControl` to `Risk` to `FinancialReportingElement` | Many to many | The chain in methodology 4.1 is traversed through these links. |
| `TailoredProcedure` to `Subpopulation` | One to many | A control spanning systems, user populations, locations, layers, or variants is tested per subpopulation. |
| `Subpopulation` to `SubpopulationConclusion` to `ControlConclusion` | One to one, then many to one | Aggregation runs through these records. |
| `ServiceOrganization` to `ClientControl` | Many to many | One review control may cover several providers; one provider's CUECs map to several client controls. |
| `CoverageUnit.design_outcome.alternative_control` to `ClientControl` | Many to one | The alternative control must be confirmed, mapped, and tested. |
| `Engagement` to `MethodologyVersion` and `Snapshot` | Many to one each | Pins. |
| `Engagement` to `ProgramRevision` | One to many, append-only | Engagement-level history. |
| `ProgramRevision` to `ControlProgram` versions | Many to many | A revision lists the control program versions in force. |
| `ControlProgram` to L4 records | One to many | Execution reads only control programs at G3 or beyond. |
| `Approval` to any record version | Many to one | Approvals are never attached to an `id` alone. |
| Any record version to any record version through `DependencyEdge` | Many to many, directed, acyclic | Invalidation and impact assessment follow the edges. |

**Traversals.**

- *Planning:* `FinancialReportingElement` → `ITDependency` → `System`/`SystemLayer` → `ClientControl` (through `ControlRiskLink` and `systems[]`) → `ControlMapping` → `ExpectationContribution` → `CoverageUnit` → applicability, coverage assessment, design outcome → `TailoredProcedure` → `Subpopulation`. A gap at any step is an `InformationGap` or a `CoverageCell` finding.
- *Coverage:* for each `CoverageUnit`, take every contribution whose scope includes the unit's scope; `covered` if one full contribution covers it; `covered by combination` if partial contributions together cover it with no part of the scope uncovered; `partially covered` if some part is uncovered; `not covered` if none. The computation is deterministic; whether a combination is adequate in precision is the design outcome, a judgment.
- *Invalidation:* from a changed record version, follow outgoing edges to every dependent record version; those are the only candidates for lapse, re-performance, or supersession.

## 5. Pinning, versioning, and change rules

### 5.1 Pins

1. **Methodology:** an engagement pins one approved `MethodologyVersion`. The decomposed L1 records for that version are read-only. A new methodology version does not touch running engagements; adopting it is a G1 trigger with an impact assessment that lists, per module, the expectations and attributes that changed, and lapses only the coverage units and procedures that reference them.
2. **Snapshot:** an engagement pins one frozen `Snapshot`. Freezing and re-pinning follow section 5.7.
3. **Control programs:** each client control's program is versioned on its own. Every version change writes a new `ProgramRevision` for the engagement, so the engagement-level history is complete, while approval and execution attach to the control program.
4. **Execution:** L4 records carry the control program version they were executed under. Reuse across versions only through an impact assessment (section 5.4).
5. **History:** nothing in L2 or L3 is ever overwritten. The lineage `supersedes` is complete from the first record to the current one, with the actor and time of each change.

### 5.2 Dependency graph and invalidation

The engine writes a `DependencyEdge` whenever a record references another: a procedure's criterion to its register entry; a register entry to its facts; a coverage unit to its contributions; a population to its procedure or subpopulation; a result to its population, evidence, and criterion; a conclusion to its results; an approval to the record version it approves.

When a record gets a new version, the engine walks the graph from the old version and classifies each dependent:

| Dependent | Effect |
|---|---|
| An approval of a dependent record | Lapses, unless re-affirmed under section 5.7 after an impact assessment finds no effect. |
| A planning record (mapping, contribution, coverage unit, procedure, plan) | Marked "needs review"; the control program returns to the gate its field class indicates (section 5.7). |
| An execution record (population, result, conclusion) | Marked "superseded pending impact assessment"; kept with its original version; disposition decided under section 5.4. |
| Anything not reachable from the changed version | Untouched. |

Scope records (pins, systems, layers, chain, coverage map) sit at the root of the graph. A change to any of them always returns the engagement to G1 for that record, and the walk then determines which control programs are affected.

### 5.3 Client control criteria register

Each confirmed client control has one `CriteriaRegisterEntry` per snapshot. It is the only place operating criteria are fixed, and `TailoredProcedure.operating_criterion_text` is copied from it.

1. **Sources, in the order they are consulted:** the governing control description (the client's written control, or the walkthrough-derived description for a control the client had not written); policies and procedures the description incorporates by reference or that set a parameter the description leaves open; walkthrough clarifications that confirm or explain the description; effective dates of each.
2. **A criterion that no source sets** is recorded as "not defined by control" with a D1 or D6 finding (methodology 5.1). The Planner never supplies a value.
3. **Contradictions.** When two sources disagree on a criterion (the description says five days and the procedure says three; the policy sets a parameter the description contradicts; a walkthrough statement differs from the document), a `Contradiction` is recorded with both sources. The Planner proposes a materiality (material if the difference could change a test status, the population, the performer, or the scope) and a resolution. A **material contradiction is resolved only by a qualified human** named in `Engagement.qualified_resolvers`, who records which source governs, why, and from what date, before the entry can be finalized. Immaterial contradictions are resolved by the Planner's proposal with the engagement approver's approval at G3.
4. **Effective dates.** Where a criterion changed during the period, `effective_criteria` holds one entry per date range, and the procedure's deadline rule applies the criterion in force at each item's trigger date.
5. **Finalization** happens at G3, when walkthrough facts are confirmed. An entry cannot be finalized on a stale fact (section 5.8) or with a material contradiction open. After finalization, any change to a source fact creates a new entry version, and the graph lapses the procedures and results that copied the old criterion.

### 5.4 Impact assessment and reuse of execution results

Every change to an approved procedure, population definition, evidence requirement, criterion, snapshot fact, or methodology version produces an `ImpactAssessment` before anything else happens.

1. **Classify the change.** The change class determines the default disposition of dependents.

| Change class | Default disposition of execution records |
|---|---|
| Criterion (register entry) | Re-perform results that applied the old criterion; retain results for date ranges where the criterion did not change. |
| Population source or definition | Re-perform; the selection reproduces only from the old population. |
| Means of selection or extent | Re-perform the selection; results for items present in both selections may be retained if the criterion and evidence are unchanged. |
| Evidence requirement | Retain results whose evidence already meets the new requirement; re-perform the rest. |
| Procedure text, editorial | Retain, by re-affirmation. |
| Snapshot fact that is not a criterion or population source | Retain unless the graph shows a dependency. |
| Methodology version | Per module diff: unchanged expectations and attributes retain; changed ones re-perform. |
| Scope | Return to G1; dependents assessed after G1. |

2. **Assess each affected execution record.** For each, the assessment records the proposed disposition and, where it is "retain valid", the **validity basis**: the facts that show the change does not alter the criterion applied, the population tested, or the evidence relied on (for example, equal content hashes of the population files and of `operating_criterion_text` across versions, or an item set that is a subset of both selections).
3. **Independent review.** The Independent Reviewer checks every "retain valid" disposition against its basis in a blind pass of the assessment, without the preparer's reasoning, and records agreement or a review note.
4. **Approval.** The engagement approver approves the assessment with reasoning (methodology 10.6). Only then are retained records re-linked: a new result version is created under the new control program version with `reused_from` pointing at the original, which is kept unchanged with its original version. Re-performed records are new records; superseded records stay with their status.
5. **No reuse without the above.** A validator rejects any L4 record under a new control program version whose `reused_from` is set without an approved impact assessment listing it as "retain valid".

### 5.5 Subpopulations and aggregation

A control is tested by subpopulation whenever its scope is not homogeneous: it spans several systems or layers; it covers distinct user populations (employees, contractors, service accounts); it operates at several locations or business units; it has operating variants (different tools or teams); or its criterion changed during the period (time segments). The Planner proposes subpopulations at G2 from the control's `systems[]`, `layers[]`, `business_units[]`, `operating_variants[]`, and the register entry; the engagement approver confirms them at G3.

Each subpopulation has its own population record and P1–P6 outcomes, its own selection and rationale, its own results and evaluation treatments, and its own `SubpopulationConclusion`.

**Aggregation [P, proposed].**

1. A `ControlConclusion` lists every subpopulation and its conclusion.
2. The control is **effective** only if every relevant subpopulation is effective.
3. If any subpopulation is **not effective** or **unable to conclude**, the control conclusion is not effective or unable to conclude for the control as a whole, *or* the conclusion carries a **scope statement** that names the subpopulations it covers and excludes the rest. An excluded subpopulation is then reported in its own right: as a deficiency where it was not effective, as a scope limitation where it could not be concluded.
4. A validator refuses a conclusion of "effective" with no scope statement while any subpopulation is not effective or unable to conclude, and refuses a scope statement that excludes a subpopulation without a corresponding report entry.
5. Deficiency evaluation (methodology 7) is performed for the deficient subpopulation, with its own exposure and dependencies, and aggregation across subpopulations of the same control is considered under element 10 of the evaluation record.

Where the subpopulations of one control have different criteria (for example, a different disable timeframe for contractors), each uses its own `criterion_override` from the register entry.

### 5.6 Candidate and confirmed controls

A `ClientControl` is created as a **candidate** when the Planner proposes it from documents or intake and the client has no written control, or when a document describes a control that no walkthrough has yet evidenced. Candidates:

- may be mapped, may receive contributions and proposed applicability decisions, and may have walkthrough plans;
- may not have a tailored procedure with status "planned", may not be an alternative control in a design outcome, and may not be tested;
- are shown as candidates in the coverage map, so a coverage cell relying only on a candidate reads "tested under a module (candidate pending confirmation)" and cannot pass G3.

A candidate becomes **confirmed** when all of the following exist: walkthrough facts with `basis = confirmed` establishing the performer, the frequency or trigger, the evidence retained, and at least one occurrence followed end to end; a governing description, which for a control the client had not written is the walkthrough-derived description with `description_origin = derived from walkthrough` and a D1 finding considered in the design assessment; a criteria register entry; the Independent Reviewer's blind view; and the engagement approver's approval with reasoning. Confirmation happens at G3 or at an in-flight approval before it.

A candidate the walkthrough does not support becomes **not confirmed**, with the reason, and remains in the snapshot history. The coverage unit that relied on it is reassessed: another control, a design gap, or an unresolved coverage gap.

### 5.7 Snapshot freezing, approval batching, and reapproval

**Snapshot checkpoints.** Facts accumulate in an open snapshot. The Engagement Manager freezes a snapshot at four checkpoints: before G1; before the first G2 submission; after walkthroughs and before the first G3 submission; and before G5. Between checkpoints, a freeze is required only when a fact changes that an approved record depends on (the graph says so) or when a candidate control is confirmed. The engine shows the diff between the pinned and the new snapshot and the dependents it reaches; nothing else is touched.

**Field classes.** Each `TailoredProcedure` field belongs to a class that determines where a change returns the control:

| Class | Fields | Return to |
|---|---|---|
| Planning | means of selection, extent, population source, pattern, roll-forward plan, project and service organization assessments | G2 for that control |
| Design | operating criterion, pass/fail criteria, subpopulation definitions, deadline rule, evidence requirements, applicability decisions, contributions | G3 for that control |
| Editorial | procedure text wording that changes no planning-class or design-class field | No gate; re-affirmation |

A walkthrough that changes a design-class field does not send the control back to G2; G3 already includes confirmation of the operating test plan. A walkthrough that changes a planning-class field does.

**Batching.** At G2, G3, and G4, controls may be submitted and approved in batches. A control is **batch-eligible** when its records carry none of the following: an applicability decision other than necessary, a design gap or alternative control, an open or material contradiction, a candidate control, a subpopulation with a different criterion, an exception, an evidence limitation, an alternative procedure, a variation, or a review note not cleared. Every other control is approved individually with reasoning (methodology 10.6). A batch approval still writes one `Approval` per record version, so later lapses are per record.

**Re-affirmation.** Where an impact assessment finds that a change has no effect on a dependent approved record (editorial class, or a snapshot fact with no reaching edge), the engagement approver may re-affirm the existing approval by viewing the diff and recording "no effect, re-affirmed". Re-affirmation is an `Approval` with `mode = re-affirmation`, so it is auditable, and it is never available for criterion, population, or scope changes.

**What always needs full reapproval.** G1 for any scope record; G3 for any design-class change and for any confirmation of a candidate; G4 for any execution record re-performed; the impact assessment itself, always.

### 5.8 Reuse of client facts and prior-year records

**Currency.** Every `Fact` has `last_confirmed_at`. A fact is **current** if confirmed within the engagement period or after its start; otherwise **stale**. Stale facts may be read and used to propose, but a criteria register entry, a coverage unit decision, or a population definition cannot be finalized on a stale fact. A validator enforces this at G3.

**Reconfirmation.** A stale fact becomes current through a `FactReconfirmation` whose method is one of:

| Method | Acceptable for | Evidence required |
|---|---|---|
| Document comparison | Control descriptions, policies, procedures | The current document version, its hash, and the diff against the prior version, or an identical hash. |
| System comparison | Configuration, role definitions, system inventories | A current extract compared with the prior one. |
| Walkthrough | Performer, frequency, evidence retained, operating practice | Confirmed facts from a walkthrough in the current period. |
| Client assertion | Nothing on its own | An assertion of "no change" is recorded with `basis = asserted`; it makes a fact current only together with one of the methods above. For a criterion fact it is never sufficient alone. |

The client's own change records (`EnvironmentChange`, change logs, organization announcements) are consulted for every reconfirmation, and a change found there that the client did not mention is an information gap and an authenticity consideration.

**Prior-year L3 records** (mappings, contributions, decisions, procedures, subpopulations) may be imported into a new engagement as **proposals only**, flagged `seeded_from`. Each goes through G2 and G3 as if new. The seed speeds drafting; it carries no approval. Prior-year applicability decisions of "not necessary" or "not applicable" are re-decided with fresh evidence of absence.

**Prior-year L4 records** are never evidence of operation in the current period. They may be referenced in the selection rationale (history of errors, methodology 5.5), in the project and service organization risk assessments, and in the deficiency evaluation (prior deficiencies and remediation), each by explicit reference with the prior engagement's control program version.

## 6. Workflow specification

The gates and triggers are those of methodology section 1.5. The steps below say what each actor produces and what the validator checks before a gate can be passed. "Validator" means a deterministic check of presence and consistency, never a judgment.

### Step 0: Client environment intake (before G1)

| | |
|---|---|
| Actor | Engagement Manager (collects), Planner (extracts) |
| Input | Client documents: RCM, narratives, policies, system inventories, org charts, prior reports, service organization reports, contracts. |
| Planner actions | Read each document as data (methodology 10.5). Extract candidate L2 records as `Fact`s with `basis = extracted`, each with document, location, and extraction method. Build `System`, `SystemLayer`, `ClientControl` (with verbatim `description_text`; `status = candidate` where no walkthrough has evidenced it), `Policy`, `ServiceOrganization`, `EnvironmentChange`, `Risk`, `ITDependency`, `FinancialReportingElement`. Where a prior-year snapshot exists, import its facts as stale and propose a `FactReconfirmation` method for each (section 5.8). Draft a `CriteriaRegisterEntry` per control, recording every `Contradiction` found between documents with a proposed materiality. Raise an `InformationGap` for every field the documents do not establish. |
| Output | An open `Snapshot`; an information gap list; proposed walkthrough questions attached to each control. |
| Validator | Every L2 content field has at least one `Fact`; every `Fact` has a source ref or `basis = asserted` with a person; every contradiction is recorded with its sources and left open; every imported fact is marked stale; no control is marked confirmed without walkthrough facts and an approval. |

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
| Planner actions | **Map:** for each client control (confirmed or candidate), propose `ControlMapping`s to every module whose risk it addresses, with role and rationale. **Contribute:** beneath each mapping, propose an `ExpectationContribution` for every expectation of the module: full, partial with scope, or none with reason. **Coverage units:** build one `CoverageUnit` per relevant expectation per scope for every system with a cell "tested under a module"; compute the coverage assessment from the contributions; propose the applicability decision (default necessary) with rationale and, for not necessary or not applicable, the risk part addressed and evidence of absence. A unit that is partially covered or not covered is a potential design gap. **Potential design gaps:** compare each necessary expectation to the register entry's sources; where they are silent, record a provisional "potential design gap" to be tested in the walkthrough, and search the snapshot for candidate alternative controls. **Criteria:** draft each `CriteriaRegisterEntry` to the point of walkthrough, with contradictions listed and materiality proposed. **Tailor:** for every attribute of every mapping, draft a `TailoredProcedure` with the criterion copied from the draft register entry, the client systems and extracts named, the population by source with the P1–P6 approach, the proposed `Subpopulation`s from the control's scope dimensions, the pattern, the means of selection and six-element rationale, and the deadline rule with time zone basis. **Walkthroughs:** plan one per control per variant with questions aimed at the open applicability decisions, potential gaps, contradictions, candidate confirmations, and stale facts. **Plans:** roll-forward, project risk assessments, service organization assessments. |
| Output | A `ControlProgram` version per control at proposed-G2 state, and a `ProgramRevision`. |
| Validator | Every mapping has a contribution for every expectation of its module; every relevant coverage unit exists, has a computed coverage assessment, and has a proposed applicability decision; no coverage unit is treated as covered on a partial contribution outside its scope; every attribute has a procedure record (planned or with a non-planned status); every `operating_criterion_text` is copied from a register entry, or reads "criterion not defined by control" with a D1 or D6 finding; every contradiction has a proposed materiality; every control with more than one scope dimension has proposed subpopulations or a recorded reason why not; every selection rationale has six elements; every statistical declaration has design, selection, and evaluation recorded (M-09); every walkthrough variant has a plan (M-04); every project and service organization has an assessment; a candidate control has no procedure with status "planned". |
| Human | Approves the plan per control, individually or in a batch of batch-eligible controls (section 5.7). The approval is of planned procedures only (methodology 1.5). |

### Step 3: Walkthroughs and design assessment (G3)

| | |
|---|---|
| Actor | Human conducts walkthroughs; Tester assesses; Independent Reviewer forms its own view; engagement approver decides |
| Input | Approved program version at G2. |
| Actions | Human conducts each walkthrough from the plan; responses become `Fact`s with `basis = confirmed`; stale facts are reconfirmed or replaced (section 5.8); the snapshot is frozen at the checkpoint and the graph shows what the confirmed facts affect. Candidates are confirmed or not confirmed (section 5.6). Material contradictions are resolved by a qualified human and each `CriteriaRegisterEntry` is finalized (section 5.3). Tester records, for each general criterion and each necessary coverage unit, the design outcome with walkthrough references: met, met by alternative control (the alternative control must be confirmed and gets its own mapping, contributions, and procedures), or design gap. Applicability decisions are finalized on the coverage units. Subpopulations are confirmed. Tailored procedures are confirmed or revised against the finalized criteria; design-class changes stay at G3, planning-class changes return the control to G2 (section 5.7). Reviewer records its blind view of each decision, outcome, confirmation, and contradiction resolution. |
| Output | `ControlProgram` versions at proposed-G3 state; design conclusions proposed; a `ProgramRevision`. |
| Validator | Every necessary coverage unit has an outcome; every design gap has an evaluation or alternative control record (M-05); every finalized decision has rationale and approval where not necessary or not applicable (M-28); every register entry relied on is finalized, with no material contradiction open and no stale fact; every procedure's criterion equals the finalized entry; every alternative control is confirmed; every candidate relied on is confirmed; every subpopulation has a population definition; no walkthrough plan without responses. |
| Human | Approves the design assessment and the confirmed operating test plan per control, individually or in a batch of batch-eligible controls, with reasoning where methodology 10.6 requires it. Only then may operating testing start for that control (M-29). |

### Step 4: Execution, results, and review (G4)

As the methodology defines in 5.4 to 5.7 and 10, with these additions. Every population, evidence item, and result references the G3-approved control program version and, where defined, its subpopulation, and the criterion applied equals the approved `operating_criterion_text` for that subpopulation and date range. Each subpopulation receives its own conclusion before the control conclusion is aggregated under section 5.5. A Tester who finds the approved criterion wrong in execution does not change it; the finding is a trigger, an impact assessment follows (section 5.4), and the control returns to the gate its field class indicates. Any execution record reused from a superseded control program version carries `reused_from` and an approved impact assessment.

### Step 5: Reporting (G5)

As methodology section 8. The report draws the five categories from L3 and L4: deviations and deficiencies from L4, per subpopulation where a conclusion is scoped; scope exclusions and unresolved gaps from `CoverageCell` and from coverage units left not covered; scope limitations from conclusions, including subpopulations excluded by a scope statement that could not be concluded; variations from `Variation` and from applicability decisions other than necessary. Every control conclusion in the report shows its scope statement where one exists.

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
10. **Contribute per expectation, assess per unit.** A mapping says a control is relevant to a module; the contributions say which expectations it covers and for what scope. The Planner never marks a control deficient for an expectation another control covers, and never marks an expectation covered on a contribution whose scope is narrower than the unit.
11. **Criteria come from the register.** The Planner drafts the register entry, lists contradictions, and proposes materiality; it never resolves a material contradiction and never copies a criterion into a procedure from anywhere but the entry.
12. **Split before testing.** Where a control spans systems, layers, user populations, locations, variants, or criterion date ranges, the Planner proposes subpopulations at G2 with a reason for each, and a reason for any dimension it does not split.
13. **Candidates stay candidates.** A control the Planner inferred from documents or process evidence is proposed as a candidate, with the walkthrough questions that would confirm it, and is never given a planned procedure until confirmed.
14. **Prior-year material is a draft, not a fact.** Seeded records are proposals; imported facts are stale until reconfirmed by a method in section 5.8.

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

Decisions sit on coverage units (section 3.3); the mapping column names the main contributing control for the unit.

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

**Client B, B-01 / TERM-B, two subpopulations.** Subpopulation "employees (Workday)": 112 terminations, all deactivated in Okta within 60 minutes (median 4 minutes); subpopulation conclusion effective. Subpopulation "contractors (Procurement register)": 17 end dates; 15 deactivated within the convention; 2 Cirrus Ops engineers remained active in ClaimsLens for 11 and 26 days after their end dates, because Cirrus Ops manages its own staff's ClaimsLens accounts outside Okta. Two exceptions; the evaluation finds a systematic cause (a path outside the control), raises a G3 trigger (new design gap under TERM-DE3 found during operating testing), and the subpopulation conclusion is not effective. Under section 5.5 the control conclusion for B-01 cannot be "effective": the engagement approver records a scoped conclusion, "effective for employees; not effective for contractors", and the contractor subpopulation goes to deficiency evaluation and is reported as a deficiency in its own right.

### 9.10 Reporting extracts at G5

| Category | Client A | Client B |
|---|---|---|
| Deviations and deficiencies | A-01: one confirmed deviation (UAR-E); design gap UAR-DE6 evaluated as a deficiency. | B-03: design gaps UAR-DE5 and UAR-DE6; NetSuite Administrator monitoring gap evaluated with a direct-effect path; B-01 contractor subpopulation not effective, reported with the scoped conclusion; CSV import approval gap. |
| Scope exclusions | DEV-SDLC, not relevant (no project). | AC-PHYS offices, not relevant; AC-PHYS and CO-BKP for hosted systems, covered elsewhere through TP-SOC1. |
| Unresolved coverage gaps | None. | Cirrus Ops: no service auditor evidence and no company controls over its change and access activity beyond B-05; recorded as an unresolved gap for ClaimsLens change management until management decides under methodology 6.13 point 7. |
| Scope limitations | None. | None. |
| Approved variations | CO-INC tested under an engagement-specific procedure (A-12). | ClaimsLens CO-BKP "not necessary"; B-01 PROV-DE7 "not applicable"; Okta's SOC 2 Type 2 accepted as evidence for its relevant controls after a recorded content judgment (approvals item A29). |

### 9.11 Refinements illustrated

**Expectation contributions and coverage units (Client B, AC-PROV).** Two client controls map to AC-PROV. Their contributions, and the resulting coverage units for the NetSuite application layer:

| Expectation | B-01 Okta lifecycle | B-02 Jira role requests | Coverage assessment | Applicability and outcome |
|---|---|---|---|---|
| PROV-DE1 every grant path | Partial: baseline roles pushed from Okta | Partial: roles beyond baseline requested in Jira | Partially covered: direct Administrator assignment inside NetSuite is a path neither control covers | Necessary; potential design gap at G2; confirmed design gap at G3 (two direct assignments found in the NetSuite system notes) |
| PROV-DE2 appropriate approver | None: automated, no approver | Full | Covered by combination: B-01 has no approver by design; B-02 covers every non-baseline grant | Necessary; met |
| PROV-DE3 approval precedes grant | None | Full | Covered by combination | Necessary; met |
| PROV-DE6 automated rule set approved | Full | None | Covered | Necessary; met |
| PROV-DE7 temporary grants | None | None | Not covered | Not applicable, with the configuration exports as evidence of absence |

Neither control is judged against the expectations it does not address. The gap at PROV-DE1 is a property of the coverage unit, not a failing of B-01 or B-02.

**Criteria register with a material contradiction (Client B, B-03).** Sources for the removal timeframe: the control narrative is silent; the Finance Systems SOP (version 3, effective 1 January 2026) says "within 10 business days"; the Controller said in the walkthrough "when someone gets to it". The entry records a contradiction between the SOP and the walkthrough, proposed material because it changes whether UAR-E has a criterion at all. The qualified resolver (the engagement approver, an IT audit director named in `qualified_resolvers`) resolves it: the SOP is an incorporated procedure the control owner had not adopted in practice; the governing criterion for operating compliance is the SOP's 10 business days from its effective date, and the walkthrough statement is a D7 finding (the control is not performed as described) rather than a reason to treat the criterion as undefined. The entry is finalized with that resolution, UAR-E keeps a criterion from 1 January 2026, and the earlier semi-annual review (December 2025) has "criterion not defined by control" for its date range.

**Control-level revision and dependency graph (Client A, A-03b).** The walkthrough finds the weekly import review. A-03b is created as a candidate, confirmed at an in-flight approval with the walkthrough facts and a register entry, mapped to CM-CHG with a contribution "full" for CHG-DE5 over the SAP application layer, and given its own control program at G2 then G3. The graph walk from the new coverage unit for CHG-DE5 reaches A-03's design outcome (changes from potential gap to "met by alternative control"), A-03's procedure for CHG-D (pass/fail now references A-03b for the two Basis staff), and nothing else. A-03 returns to G3 for those two records; A-01, A-02, and the other ten control programs are untouched, and a new `ProgramRevision` records the change.

**Impact assessment with reuse (Client A, A-01).** After G4 results exist for UAR-E, the Security team supplies a corrected holiday calendar: one state holiday was missing. Change class: criterion (the business-day deadline). The assessment walks the graph to 148 result records and recomputes the deadline for each: 141 deadlines are unchanged (no holiday in their window; validity basis is the equal deadline value under both calendars, computed by code), 7 move by one day, of which none changes a test status except the known exception, which stays an exception. Proposed disposition: retain valid for 141 with the computed basis; re-perform 7. The Reviewer's blind pass of the assessment agrees. The engagement approver approves; 141 results are re-linked with `reused_from`, 7 are re-performed, and the original 148 records keep their version.

**Candidate control not confirmed (Client B, incident management).** The Jira Service Management candidate for CO-INC is walked through. The walkthrough finds that incidents are logged but there are no priorities, no timeframes, and no root cause analysis; the candidate is marked not confirmed, with the reason. The CO-INC coverage units for NetSuite and ClaimsLens become design gaps (INC-DE2, INC-DE5) with the logging practice recorded as an informal activity, and the coverage cell stays "tested under a module" against those gaps rather than becoming an unresolved coverage gap, because the area was assessed.

**Batching and re-affirmation (Client A, G3).** Of twelve control programs, seven are batch-eligible at G3 (no decision other than necessary, no gap, no contradiction, no candidate, no subpopulation with a different criterion) and are approved in one batch with one `Approval` per record. A-01, A-03, A-03b, A-09, and A-12 are approved individually with reasoning. Later, the Planner corrects a typographical error in A-04's procedure text; the impact assessment classes it editorial, the graph reaches no criterion or population, and the approver re-affirms A-04's G3 approval from the diff.

**Prior-year reuse (Client A, FY2025 to FY2026).** The FY2025 snapshot is imported with every fact stale. Reconfirmation: control descriptions by document comparison against RCM v7 (hash differs from v6; the diff shows A-06's timeframe changed from two business days to one, which creates a new fact and a new register entry with the effective date); SAP password parameters by system comparison (identical extract); performers and practice by the FY2026 walkthroughs. The Security Manager's statement that "nothing else changed" is recorded as asserted and corroborated only where one of the methods confirms it. FY2025 mappings and procedures are seeded as proposals, flagged `seeded_from`, and go through G2 and G3; the FY2025 decision that CO-INC was an unresolved gap is not carried forward, because A-12 now exists. FY2025 results are cited in A-01's selection rationale (one deviation in the prior year) and nowhere else.

### 9.12 What the example shows

- The same thirteen modules produced two different programs because the mappings, decisions, and criteria came from each client's own records.
- Silent descriptions (B-03 on timeframe and lookback; A-01 on lookback) did not remove expectations; they became design findings.
- Alternative controls (A-03b) and candidate controls (A-12, the CSV import process) entered the program as real controls with their own procedures and approvals, with the program version and snapshot pins advancing each time.
- One client control served three modules (B-01), and one module drew on several client controls (CM-CHG at Client A: A-03, A-03b, A-10).
- Operating testing began only after G3, and a finding in execution (the contractor path at Client B) went back through the gates rather than being handled ad hoc, and produced a scoped conclusion rather than an "effective" for the whole control.
- Coverage was assessed per expectation across controls (B-01 and B-02), criteria were fixed in a register with a human-resolved contradiction (B-03), changes touched only what depended on them (A-03b, the holiday calendar), and prior-year material entered only as stale facts and proposals.

## 10. Open design decisions for review

Decisions carried from 0.1 that the refinements settled are marked. New decisions are numbered from 9.

1. **Granularity of mappings.** Settled in 0.2: mappings stay per control per module, with expectation contributions beneath them carrying scope. The "partial" role remains as a summary only.
2. **Candidate controls.** Settled in 0.2: candidates are a status on `ClientControl` with the rules in section 5.6.
3. **Snapshot freezing.** Settled in 0.2: four checkpoints plus graph-driven freezes (section 5.7). Open: whether the Engagement Manager may defer a graph-driven freeze to the next checkpoint when the affected records are not yet approved.
4. **Superseded results.** Settled in 0.2: reuse only through an impact assessment with validity basis, blind review, and approval (section 5.4). Open: whether "retain valid" may ever apply when the change class is a criterion change, beyond date ranges the criterion did not touch.
5. **Criterion from policy versus description.** Settled in 0.2: handled as a contradiction in the register, resolved by a qualified human when material (section 5.3). Open: who qualifies as a resolver, and whether the engagement approver may be the sole resolver for their own engagement.
6. **Reuse across periods.** Settled in 0.2: proposals only, facts stale until reconfirmed (section 5.8). Open: whether an identical document hash alone is enough to reconfirm a control description, or whether a walkthrough is also required for operating practice every period.
7. **Personal data minimization.** Open: which `Person` fields are kept in L2 and for how long.
8. **Engine ownership of the L1 decomposition.** Open: generated from the methodology document by code at approval time (drafted) or maintained by hand.
9. **Materiality of contradictions.** The proposed test (could change a test status, population, performer, or scope) is the Planner's screen; whether a methodology owner should fix it as policy, or leave it to the resolver each time.
10. **Scoped conclusions.** Whether a scoped conclusion ("effective for employees; not effective for contractors") is an acceptable control-level statement in this engagement mode, or whether the control conclusion must always be the worst subpopulation's, with the scope shown only in the report. The aggregation rule in section 5.5 is marked as proposed policy for that reason.
11. **Batch eligibility.** Whether the list in section 5.7 is complete, and whether the methodology owner wants batch approval disallowed at G4 altogether.
12. **Re-affirmation.** Whether re-affirmation should be available to the engagement approver alone, or require the Reviewer's confirmation of the "no effect" classification first (drafted: the impact assessment already carries the Reviewer's check).
13. **Coverage computation versus design judgment.** The coverage assessment is deterministic; the design outcome is a judgment. Whether a "covered by combination" assessment should ever be allowed to become "met" without the engagement approver recording why the combination is precise enough.
14. **Candidate confirmation authority.** Whether confirmation of a candidate may be an in-flight approval (drafted) or must wait for G3.
15. **Engagement-level revision retention.** How long `ProgramRevision` history and superseded control program versions are retained after release, given that they include client data.



1. **Granularity of mappings:** whether a mapping is per client control per module (as drafted) or per client control per expectation. Per module is simpler; per expectation allows a control to serve only some expectations of a module without a "partial" role.
2. **Candidate controls:** whether the Planner may add a candidate control to the snapshot before the walkthrough confirms it (drafted: yes, as an extracted fact), or only afterwards.
3. **Snapshot freezing:** whether every walkthrough response freezes a new snapshot (drafted: the Engagement Manager freezes when ready, and the engine diffs), given the reapproval cost.
4. **Superseded results:** whether results executed under a superseded program version may ever be reused when the procedure change did not affect them (drafted: only by the engagement approver's recorded decision).
5. **Criterion from policy versus description:** when a policy and a control description conflict, which is the operating criterion (drafted: the description, with the conflict as a D1 finding).
6. **Reuse across periods:** whether L3 records from a prior engagement may seed the next (drafted: as proposals only, re-approved at every gate).
7. **Personal data minimization:** which `Person` fields are kept in L2 and for how long.
8. **Engine ownership of the L1 decomposition:** whether the decomposed records are generated from the methodology document by code at approval time (drafted) or maintained by hand.

## 11. Change log

### Version 0.2 (2026-11-06), from version 0.1

Targeted refinement. The four layers, methodology independence, the five gates, evidence traceability, immutable snapshots, and the agent and human responsibilities are unchanged. The methodology text and modules are not modified. Nothing is implemented.

| # | Requirement | What changed | Sections |
|---|---|---|---|
| 1 | Expectation-level contributions | `ExpectationContribution` added beneath each mapping (full, partial with scope, none). `CoverageUnit` added as the unit of assessment per expectation per scope; applicability decisions and design outcomes moved from the mapping to the coverage unit; a deterministic coverage computation (covered, covered by combination, partially covered, not covered) separated from the design judgment. Binding rule 4 added. | 1, 2.3, 3.3, 4, 6 step 2, 7 rule 10, 9.11 |
| 2 | Control-level revisions and dependency graph | `ProgramVersion` replaced by `ControlProgram` (versioned and gated per control) plus `ProgramRevision` (append-only engagement history). `DependencyEdge` added; invalidation walks the graph and touches only dependents; scope records always return to G1. Binding rule 5 added. | 1, 3.3, 4, 5.1, 5.2, 9.11 |
| 3 | Client control criteria register | `CriteriaRegisterEntry` and `Contradiction` added. Operating criteria are copied from the entry only; "not defined by control" preserved; material contradictions resolved only by a named qualified human before finalization; effective-dated criteria. 0.1 open decision 5 settled here. | 2.3, 3.2, 3.3, 5.3, 6 steps 0 to 3, 7 rule 11, 9.11 |
| 4 | Impact assessment and reuse | `ImpactAssessment` added with change classes and default dispositions, validity basis, Reviewer blind check, approver approval, `reused_from` linkage, and originals preserved. Validator rejects reuse without an approved assessment. 0.1 open decision 4 settled here. | 3.3, 3.4, 5.4, 6 step 4, 9.11 |
| 5 | Subpopulations and aggregation | `Subpopulation` and `SubpopulationConclusion` added; `ControlConclusion` carries subpopulation conclusions, a scope statement, and an aggregation rationale; a control is never "effective" while a relevant subpopulation is not effective or unable to conclude unless the scope statement excludes it and the excluded scope is reported. Example 9.9 for Client B rewritten as two subpopulations with a scoped conclusion. | 3.3, 3.4, 4, 5.5, 6 steps 4 and 5, 7 rule 12, 9.9, 9.10 |
| 6 | Candidate controls | `ClientControl.status` (candidate, confirmed, not confirmed, retired), `description_origin`, and `confirmation` added; what candidates may and may not do; confirmation requirements; not-confirmed handling. 0.1 open decision 2 settled here. | 2.2, 3.2, 5.6, 6 steps 0 and 3, 7 rule 13, 9.11 |
| 7 | Freezing, batching, reapproval | Four snapshot checkpoints plus graph-driven freezes; procedure field classes (planning, design, editorial) deciding the return gate; batch eligibility list; re-affirmation as an auditable approval mode; what always needs full reapproval. `Approval.mode` and `batch_ref` added. 0.1 open decision 3 settled here. | 3.3, 5.7, 6 steps 2 and 3, 9.11 |
| 8 | Reuse of facts and prior-year records | `Fact.valid_as_of`, `last_confirmed_at`, `currency`; `FactReconfirmation` with four methods and what each is acceptable for; client assertions never sufficient alone for criteria; prior-year L3 as seeded proposals; prior-year L4 never evidence of current operation. 0.1 open decision 6 settled here. | 2.2, 3.2, 5.8, 6 step 0, 7 rule 14, 9.11 |

Other: section 9.11 added with seven illustrations; the former 9.11 is now 9.12; section 10 restates the 0.1 decisions as settled or open and adds decisions 9 to 15.
