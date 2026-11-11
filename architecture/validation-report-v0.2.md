# Design Validation Report: Engagement Tailoring Architecture v0.2

| | |
|---|---|
| **Subject** | `architecture/engagement-tailoring-architecture.md`, version 0.2 |
| **Method** | Desk validation. Each scenario was traced by hand through the v0.2 schemas (section 3), relationships (4), change rules (5), workflow (6), and worked examples (9). No code was written or run. |
| **Prepared** | 2026-11-06, by Claude (AI agent). Not reviewed by a human. |
| **Status** | Findings and recommendations only. The architecture, the methodology, and the repository are unchanged. Recommended defaults in section 4 are proposals, not approved policy. |

## Summary

The four-layer design, the gates, the dependency graph, and the subpopulation and impact-assessment rules hold up in eight of the ten scenarios. Two scenarios expose structural gaps, and several others expose missing fields or undefined transitions.

The three findings that block implementation:

1. **Coverage units have no owner for gate purposes.** A coverage unit draws on several control programs that pass G3 at different times, and v0.2 does not say whose approval finalizes the unit's design outcome (scenarios 1, 2, 10).
2. **There is no operating-level coverage state.** When a contributing control proves ineffective in testing, nothing in v0.2 re-derives whether the expectation is still met for the scope, and the deficiency evaluation has no record to attach to at the expectation level (scenario 2).
3. **Scoped conclusions are not a methodology conclusion.** Section 5.5 of the architecture lets a control conclusion read "effective for employees; not effective for contractors". Methodology 5.7 allows only effective, not effective, and unable to conclude. Adopting the architecture as drafted would change audit judgment rules, which needs the methodology owner, not an architecture review (scenario 6).

Section 5 lists 18 corrections in priority order.

---

## 1. Scenario validation

Record identifiers below are invented for traceability. `CP` is a control program, `CU` a coverage unit, `CRE` a criteria register entry, `TP` a tailored procedure, `SP` a subpopulation, `R` an item-attribute result, `CC` a control conclusion, `IA` an impact assessment. Versions are `v1`, `v2`.

### Scenario 1: A partially covered expectation supported by multiple client controls

Client B, PROV-DE2 (appropriate approver) and PROV-DE1 (every grant path) for the NetSuite application layer.

| Item | Trace |
|---|---|
| Initial records | `CP-B01 v2` (G2) with mapping `M-B01-PROV`; `CP-B02 v2` (G2) with `M-B02-PROV`. Contributions: `EC-B01-DE2 = none`, `EC-B02-DE2 = full`; `EC-B01-DE1 = partial, scope: baseline roles`, `EC-B02-DE1 = partial, scope: non-baseline roles`. Coverage units `CU-PROV-DE2-NS v1` (assessment: covered by combination), `CU-PROV-DE1-NS v1` (assessment: partially covered, since direct Administrator assignment is in neither scope). Both applicability: necessary, proposed. |
| Events | Walkthroughs confirm the two scopes and find two direct Administrator assignments in NetSuite system notes. |
| Edges traversed | `EC-*` → `CU-*` (derived from); `CU-*` → `TP-B01-PROV-B`, `TP-B02-PROV-B` (criterion of). |
| Stale or retained | Nothing stale; no execution records yet. |
| Gates reopened | None; the units advance to G3 with their control programs. |
| Human decisions | At G3: `CU-PROV-DE2-NS` design outcome "met" with reasoning that the combination is precise enough (architecture decision 13); `CU-PROV-DE1-NS` design outcome "design gap" for the uncovered path, individually approved; both applicability decisions confirmed necessary. |
| Expected final state | `CU-PROV-DE2-NS v2`: necessary, covered by combination, met. `CU-PROV-DE1-NS v2`: necessary, partially covered, design gap; `TP-B01-PROV-A` and `TP-B02-PROV-A` planned for their scopes; an entry in the deficiency evaluation queue for the uncovered path. Neither B-01 nor B-02 is marked deficient for PROV-DE2. |
| Validation failures the engine must detect | (a) A contribution marked `full` whose `scope[]` is narrower than the unit's scope. (b) A unit assessed "covered" from two `partial` contributions whose scopes do not together equal the unit scope. (c) A `TP` with status `planned` for an attribute whose expectation is a design gap for the whole unit scope. (d) **Gap found:** the unit belongs to two control programs; v0.2 does not say which program's G3 approval finalizes the unit's `design_outcome`, nor what happens if `CP-B01` passes G3 while `CP-B02` is still at G2. The validator cannot be written without that rule. |

**Verdict:** passes for coverage logic; fails on gate ownership of the coverage unit (correction C1).

### Scenario 2: A contributing control becomes ineffective

Client B, continuing scenario 1. At G4, B-02's results for PROV-B (appropriate approver) show six of forty non-baseline grants approved by the requester's own manager instead of the Finance Systems Manager, a systematic deviation.

| Item | Trace |
|---|---|
| Initial records | `CU-PROV-DE2-NS v2` (met, by combination of `EC-B01-DE2 = none` and `EC-B02-DE2 = full`); `CP-B02 v3` (G3); results `R-B02-PROV-B-001..040`; `SP-B02-nonbaseline`. |
| Events | Six exceptions; evaluation: systematic; `SubpopulationConclusion` for `SP-B02-nonbaseline` not effective; `CC-B02 v1` not effective. |
| Edges traversed | `R-*` → `SP conclusion` → `CC-B02` (conclusion of). **No edge exists from `CC-B02` to `CU-PROV-DE2-NS`.** The graph stops at the control. |
| Stale or retained | Nothing stale. Results retained as recorded. |
| Gates reopened | G4 for `CP-B02` (individual approval, exception present). Under v0.2 nothing reopens for the coverage unit. |
| Human decisions | Treatment and conclusion for B-02; deficiency evaluation for B-02. What is missing: a decision on whether PROV-DE2 is now unmet for the non-baseline scope, and whether B-01's baseline scope is unaffected. |
| Expected final state | The expectation PROV-DE2 should read: met for baseline roles (B-01 contributes nothing to DE2, but there is no approver requirement for automated baseline grants by design, which the G3 reasoning should have recorded); not met for non-baseline roles. The deficiency is an expectation-level deficiency for the non-baseline scope, with B-02 as the failed control. v0.2 has no record to carry "not met in operation" on the coverage unit, and the deficiency evaluation (`DeficiencyEvaluation.control_program`) can attach only to B-02. |
| Validation failures the engine must detect | (a) A coverage unit whose every contributing control for a scope has a not-effective conclusion but whose state still reads "met". (b) A deficiency evaluation for a control whose failed attribute serves a coverage unit also served by other controls, without a record of the effect on the other contributors' scope. Neither check can exist without an operating-level state on the unit. |

**Verdict:** fails. The design has design-level coverage but no operating-level coverage (correction C2). The methodology's deficiency evaluation is per control (section 7.3 element 10 handles aggregation), so an expectation-level evaluation also needs a methodology position (correction C2, with a note to the methodology owner).

### Scenario 3: A material change to a client criterion with different effective date ranges

Client A, A-06 terminations. The RCM v6 timeframe was two business days; RCM v7, effective 1 April 2026, says one business day. The period is calendar 2026.

| Item | Trace |
|---|---|
| Initial records | `CRE-A06 v1` with `effective_criteria`: TERM-B = "within 2 business days", 1 Jan to 31 Mar; TERM-B = "within 1 business day", 1 Apr to 31 Dec. `TP-A06-TERM-B v1` with `operating_criterion_text` copied from the entry, `deadline_rule`, and `SP-A06-Q1` (time segment, `criterion_override` → range 1) and `SP-A06-Q2toQ4` (range 2). |
| Events | None during testing; the two ranges were known at G3. Then a late discovery: HR confirms the change actually took effect 15 March, not 1 April. |
| Edges traversed | Fact (RCM v7 effective date) → `CRE-A06` (derived from) → `TP-A06-TERM-B` (criterion of) → `SP-A06-Q1`, `SP-A06-Q2toQ4` (population of) → `R-A06-*` (result of) → `CC-A06`. |
| Stale or retained | `CRE-A06 v1` superseded by `v2` (range boundary moved). Impact assessment class: criterion. Results for terminations dated 15 to 31 March (say nine items) applied the two-day criterion and must be re-performed under the one-day criterion; all other results retain valid with the basis "trigger date outside the changed range, criterion text equal under both entry versions". |
| Gates reopened | G3 for `CP-A06` (design-class field: criterion); G4 for the nine re-performed results. The subpopulation boundaries change (design class). |
| Human decisions | Qualified resolver: the HR statement contradicts the RCM's stated effective date, a material contradiction (changes test statuses); resolution records which date governs and on what evidence. Engagement approver: impact assessment approval; re-approval of the two subpopulation definitions and of the nine results. |
| Expected final state | `CRE-A06 v2` finalized; `TP-A06-TERM-B v2`; subpopulations redrawn; 9 results re-performed, the rest re-linked with `reused_from`; `CC-A06 v2`. |
| Validation failures the engine must detect | (a) **Gap found:** `TailoredProcedure.operating_criterion_text` is a single string and `criterion_ref` a single reference, but the entry holds two ranges. v0.2 relies on time-segment subpopulations with `criterion_override`, yet never requires them when an entry has more than one range. (b) **Gap found:** `ItemAttributeResult` has no field recording which criterion version and range was applied to the item, so the validator rule "criterion applied equals `operating_criterion_text`" cannot be evaluated per item, and the impact assessment's validity basis ("trigger date outside the changed range") cannot be computed from the result record. (c) A finalized entry whose ranges overlap or leave a gap in the period. |

**Verdict:** passes in principle; fails on two missing fields (corrections C4, C5).

### Scenario 4: Reuse of previously tested results after a procedure or criterion changes

Client A, A-01 UAR-E, the holiday-calendar correction in architecture example 9.11.

| Item | Trace |
|---|---|
| Initial records | `TP-A01-UAR-E v1` (deadline rule references calendar `DOC-CAL v1`); `R-A01-UAR-E-001..148`; `CC-A01 v1` effective with one confirmed deviation; `Approval` of each at G4. |
| Events | `DOC-CAL v2` arrives; one holiday added. Impact assessment `IA-07` opened; class: criterion (business-day deadline). |
| Edges traversed | `DOC-CAL` → Fact → `CRE-A01` → `TP-A01-UAR-E` → `Population-A01-UAR-E` → `R-*` → `CC-A01`; approvals of each (approval of). |
| Stale or retained | For each of 148 results, the engine recomputes the deadline under both calendars. 141: equal, disposition "retain valid", basis = equal computed deadline; 7: different, "re-perform". Originals keep `v1`; retained ones get a new version under `TP v2` with `reused_from`. |
| Gates reopened | G3 for `CP-A01` (criterion); G4 for the 7 re-performed results and for `CC-A01`. |
| Human decisions | Reviewer blind check of `IA-07`'s 141 "retain valid" dispositions; engagement approver approves `IA-07` with reasoning; approves `CC-A01 v2`. |
| Expected final state | `CC-A01 v2` effective with one confirmed deviation (unchanged), 141 reused, 7 re-performed. |
| Validation failures the engine must detect | (a) A result under `TP v2` with `reused_from` set and no approved `IA` listing it as retain valid. (b) A "retain valid" disposition whose basis cannot be recomputed by code. (c) **Gap found:** the basis "equal computed deadline" needs the computed deadline stored per item; `Item` has no `deadline_computed` field. (d) **Gap found:** the `Item` and `ItemAttributeResult` rows in section 3.4 carry `tailored_procedure` but not `control_program` or `reused_from`; only the row for evaluations and reports has them. The reuse rule in 5.4 cannot be enforced on the records it is about. (e) After reuse, cross-checks X1 to X7 must be re-run under the new version; v0.2 does not say so. |

**Verdict:** passes for the rule; fails on fields (corrections C5, C6) and on re-running cross-checks (C12).

### Scenario 5: Late-arriving client evidence after a snapshot has been frozen

Client B, JOB-D for B-08. At G4 approval, four failures had test status "unable to test" with treatment "evidence limitation treated as a deviation". Three weeks later the client produces the Celigo run history for those dates. Separately, the file also reveals that Celigo's alert recipient list changed in March, a fact not in the snapshot.

| Item | Trace |
|---|---|
| Initial records | Frozen `Snapshot v3` (pinned); `CP-B08 v3` (G4); `R-B08-JOB-D-011..014` with status history [unable to test], treatment approved; `CC-B08 v1` not effective. |
| Events | (1) New evidence for four items. (2) A new L2 fact (alert recipient change) affecting `CRE-B08` and JOB-I's procedure. |
| Edges traversed | (1) `Evidence` → `R-B08-JOB-D-011..014` → `CC-B08` → `Approval`s. (2) New fact → `CRE-B08` → `TP-B08-JOB-I` → `Population-B08-JOB-I` (configuration pattern) → results → `CC-B08`. |
| Stale or retained | (1) Four results receive an appended status entry (methodology 5.6 status history) and return to "tested"; their treatments are re-proposed; other results untouched. (2) Fact is new, not stale; `CRE-B08 v2`; JOB-I results superseded pending impact assessment. |
| Gates reopened | (1) G4 for the four records and for `CC-B08`; no snapshot change for test evidence, which is L4. (2) Graph-driven snapshot freeze (`Snapshot v4`), re-pin; G3 for `CP-B08` (criterion-class change to JOB-I); G4 afterwards. |
| Human decisions | Evidence reliability and authenticity for late-produced evidence (methodology 5.3: records extracted later with original timestamps are normal; the Tester checks that these are); treatment and conclusion re-decided; impact assessment approval for (2). |
| Expected final state | Four results likely "no exception" with treatment "operated as prescribed" and the status history showing both entries; `CC-B08 v2` re-decided; JOB-I re-tested against the corrected recipient list for the two date ranges. |
| Validation failures the engine must detect | (a) **Gap found:** appending a status entry must increment the result's `version` so the G4 approval lapses through the graph; v0.2 says statuses are appended but not that the record version changes. (b) **Gap found:** `ImpactAssessment.change_class` has no class for "new evidence for an existing item"; the nearest, "evidence requirement", means a change to the procedure, not to the evidence received. (c) A snapshot change triggered by evidence content must be a `Fact` with a source ref to that evidence file, not an edit to the pinned snapshot. (d) An approval of `CC-B08` still valid while a result beneath it has a newer version. |

**Verdict:** passes for the snapshot rule; fails on version increment and change class (corrections C7, C8).

### Scenario 6: Employee and contractor subpopulations with different results

Client B, B-01 TERM-B, as in architecture example 9.9.

| Item | Trace |
|---|---|
| Initial records | `TP-B01-TERM-B v2`; `SP-B01-employees` (Workday source), `SP-B01-contractors` (Procurement register, `criterion_override` for the date-only convention); separate populations, selections, results. |
| Events | Employees: 112 of 112 within deadline. Contractors: 2 of 17 outside, systematic cause (Cirrus Ops manages its own ClaimsLens accounts). |
| Edges traversed | `R-*` → `SubpopulationConclusion` (two) → `CC-B01`. The contractor exceptions also raise a trigger: new design gap under TERM-DE3 → `CU-TERM-DE3-CL` (ClaimsLens scope) → G3. |
| Stale or retained | None stale. |
| Gates reopened | G3 for `CP-B01` (new design gap found in operating testing; design class); G4 for `CC-B01`. |
| Human decisions | Treatment for the two exceptions; subpopulation conclusions; the control conclusion under section 5.5 rule 3: either "not effective" for the control, or a scoped statement; deficiency evaluation for the contractor path. |
| Expected final state | `SubpopulationConclusion` employees: effective; contractors: not effective. `CC-B01 v2`: per the architecture, scoped. Report: deficiency for the contractor path. |
| Validation failures the engine must detect | (a) `CC` effective with no scope statement while a subpopulation is not effective. (b) A scope statement excluding a subpopulation with no report entry for it. (c) **Conflict found:** methodology 5.7 defines three conclusion values; "effective for employees; not effective for contractors" is a fourth. Methodology M-15 and M-19 validators and the report's control-level results (methodology 8) assume one of three values per control. The architecture cannot introduce a scoped conclusion without a methodology change. (d) **Gap found:** `DeficiencyEvaluation` carries `control_program` but no `subpopulation`, so the evaluation of the contractor path cannot be attached to the subpopulation it concerns. |

**Verdict:** passes for the mechanics; fails on the conclusion form (correction C3, a methodology decision) and on a missing field (C9).

### Scenario 7: A provisional candidate control failing confirmation

Client B, the Jira Service Management candidate for CO-INC, as in example 9.11.

| Item | Trace |
|---|---|
| Initial records | `ClientControl B-CAND-INC v1` (status candidate, `description_origin` to be derived); `M-BCAND-INC`; contributions proposed; `CU-INC-DE1..DE6-NS`, `-CL` (coverage units for NetSuite and ClaimsLens); `CoverageCell NS×CO-INC` = "tested under a module (candidate pending confirmation)"; `TP-*` with status not planned. |
| Events | Walkthrough: logging exists; no priorities, timeframes, or root cause. Candidate marked not confirmed. |
| Edges traversed | Walkthrough facts → `ClientControl` status → contributions → coverage units → coverage cells. |
| Stale or retained | Candidate retained with status not confirmed and reason. Contributions become `none` (new versions). Coverage units: INC-DE1 (logging) could be "met" by an informal activity only if a confirmed control exists, which it does not; v0.2 example says the units become design gaps at INC-DE2 and INC-DE5 and "the coverage cell stays tested under a module". |
| Gates reopened | G3 for the coverage units (design class). **Question:** the `CoverageCell` is a scope record; v0.2 rule 5.2 says any change to a scope record returns to G1. Removing the "(candidate pending)" qualifier is a change to the cell's status string. |
| Human decisions | Confirmation refused (approver, with reasoning); design outcomes for the six units; whether the area is now "tested under a module with design gaps" or an "unresolved coverage gap". |
| Expected final state | Cell "tested under a module"; units INC-DE1 met by nothing (no control), INC-DE2 and INC-DE5 design gaps; deficiency evaluation for the area. |
| Validation failures the engine must detect | (a) A `TP` with status `planned` on a candidate. (b) A design outcome "met by alternative control" naming a candidate. (c) **Gap found:** the candidate-pending state is drafted as a variant of the cell status string; it needs to be a field (`pending_candidates[]`) so that confirmation or refusal changes the field without re-opening G1 for the cell. (d) **Gap found:** v0.2 does not define when an assessed area with no control is "tested under a module, with design gaps" versus "unresolved coverage gap". Methodology 4.2 defines the gap as relevant, not tested here, not covered elsewhere; an area that was assessed and found to have no control has been tested. The transition needs stating, or every refused candidate becomes a G1 event. |

**Verdict:** passes for candidate mechanics; fails on cell state design (corrections C10, C11).

### Scenario 8: Two controls with identical approved procedures qualifying for batched approval

Client A, A-07 (data centre badge review, Columbus) and a second control A-07b for the Indianapolis recovery site, both quarterly reviews by the Infrastructure Manager with identical descriptions.

| Item | Trace |
|---|---|
| Initial records | `CP-A07 v2`, `CP-A07b v2` at G2; procedures `TP-A07-PHYS-C v1` and `TP-A07b-PHYS-C v1` with equal `content_hash` on their content fields; both batch-eligible (no decision other than necessary, no gap, no contradiction, no candidate, no subpopulation with a different criterion). |
| Events | Batch submission at G3 after walkthroughs at each site. |
| Edges traversed | Each `TP` → its own `CRE`, `CU-PHYS-DE2-COL`, `CU-PHYS-DE2-IND`. The two programs share no records; equal hashes do not create edges. |
| Stale or retained | None. |
| Gates reopened | None. |
| Human decisions | One batch approval action, written as two `Approval` records (`mode = batch`, same `batch_ref`), one per record version. No reasoning text required (methodology 10.6 lists none of the triggering matters). |
| Expected final state | Both at G3; later lapses are per record. |
| Validation failures the engine must detect | (a) A batch containing a control that fails any eligibility test. (b) A single `Approval` covering two record versions. (c) **Observation:** identical procedures for two client controls over two locations of the same control type suggest the client has one control with a location variant, which the architecture would test as one control with two subpopulations (`dimension = location`). The Planner should be asked to decide which it is; v0.2 has no validator that flags duplicate procedures across controls for that decision. Low severity. |

**Verdict:** passes (observation C16).

### Scenario 9: Identical prior-year description hash, materially different operating environment

Client A, A-04 (Control-M failure resolution). RCM v7 text for A-04 is byte-identical to v6. During 2026 the Operations team was outsourced to a managed service provider, Control-M was upgraded, and alerts now go to the provider's queue.

| Item | Trace |
|---|---|
| Initial records | FY2025 facts imported stale: description (A-04), performer (Operations Manager), system (Control-M v9), alert configuration. `CRE-A04 v1 (FY2025)`. |
| Events | Document comparison: identical hash → under v0.2 table 5.8, acceptable for control descriptions, so the description fact becomes current. Performer, system, and configuration facts remain stale until walkthrough or system comparison. The client's change log (`EnvironmentChange`) shows the outsourcing and upgrade. |
| Edges traversed | Facts → `CRE-A04` → `TP-A04-*`; `System Control-M` → `SystemLayer` → `ClientControl.systems[]`; `EnvironmentChange` → affected records. |
| Stale or retained | Description: current by hash. Performer, system version, alert configuration: stale until reconfirmed by walkthrough and system comparison. |
| Gates reopened | Not applicable; first pass of the new engagement. |
| Human decisions | Walkthrough; whether the outsourced performer makes A-04 a different control (D3 competence and authority; TP-SOC1 for the provider); applicability of CO-JOB expectations for the provider-operated queue. |
| Expected final state | `CRE-A04 v2 (FY2026)` finalized only after walkthrough and system comparison; mapping to TP-SOC1 added for the provider; possibly a new control for the provider's part. |
| Validation failures the engine must detect | (a) **Gap found:** v0.2 cannot stop finalization here. The validator in 5.8 checks that no *fact* relied on is stale, but the entry's criterion facts (description) are current by hash while the facts that make the criterion meaningful (performer, system, configuration) are stale and are not necessarily referenced by the entry. The engine needs a fact classification (description, practice, environment, configuration) and an adequacy rule: a register entry is finalizable only when every fact class the control depends on has been reconfirmed by a method acceptable for that class, which for practice means a walkthrough in the period. (b) An `EnvironmentChange` naming a system in a control's `systems[]` with no corresponding reconfirmation of that control's facts. |

**Verdict:** fails on method adequacy (correction C13; relates to open decision 6).

### Scenario 10: A service organization control supporting multiple systems and dependencies

Client B, B-09 (SOC report review) covering NetSuite, Workday, AWS, Okta, and (by absence) Cirrus Ops.

| Item | Trace |
|---|---|
| Initial records | `ServiceOrganization` × 5; `ServiceOrgAssessment` × 5 (engagement-level); `CP-B09`; mapping `M-B09-SOC1` with contributions per SOC-DE; coverage units `CU-SOC-DE*` per service organization scope; TP-SOC1 coverage units for each system's chain (NetSuite revenue, Workday payroll, AWS hosting of ClaimsLens, Okta authentication). CUECs: NetSuite's report lists user entity controls for role administration and for review of system notes; these are addressed by B-02, B-03, and the CSV candidate. |
| Events | NetSuite's SOC 1 reports an exception in its change management; Okta's SOC 2 is accepted after a recorded judgment; Cirrus Ops has nothing. |
| Edges traversed | `ServiceOrgAssessment-NS` → `CU-SOC-DE5-NS` → `CC-B09`; the exception also bears on `CU-CHG-DE*-NS` for NetSuite's vendor-side change controls (coverage cell "CM-CHG for the company's own configuration changes; TP-SOC1 for the vendor's"). CUEC → B-02, B-03 conclusions → `SOC-E` result for NetSuite. |
| Stale or retained | None. |
| Gates reopened | None; first pass. |
| Human decisions | Relevance of the NetSuite exception to the company's use; acceptance of Okta's SOC 2 (approvals A29); treatment of Cirrus Ops (unresolved coverage gap for ClaimsLens change management, or management's decision under methodology 6.13 point 7); SOC-E outcomes depend on B-02 and B-03 conclusions. |
| Expected final state | `CC-B09`: SOC-E not effective for NetSuite because B-03 is not effective (design gaps) and the CSV candidate was not confirmed; SOC-D documented for the exception; coverage for the vendor-side CM-CHG units at NetSuite assessed through the report. |
| Validation failures the engine must detect | (a) A SOC-E result "no exception" while a mapped CUEC control's conclusion is not effective or absent. (b) **Gap found:** there is no entity linking a CUEC to the client control that addresses it and to the coverage units it supports. `ServiceOrganization.cuecs[]` is a list of text; `DependencyEdge.kind` has no "addresses CUEC" kind. Without it, (a) cannot be checked and methodology 13's "cross-control links are first-class records" is not met. (c) **Gap found:** `ServiceOrgAssessment` is engagement-level with no `control_program`; it is approved at a gate but belongs to no control program's gate status, the same ownership problem as scenario 1. (d) A `ServiceOrgAssessment` whose exception affects coverage units in several systems' chains must reach all of them; the edges exist only if the assessment lists the units, which the schema does not require. |

**Verdict:** fails on CUEC linkage and assessment ownership (corrections C14, C15).

---

## 2. Control Coverage and Testability Matrix

### 2.1 Derivation

The matrix is derived, never typed. Each column comes from a record:

| Column | Source | Derivation |
|---|---|---|
| Financial reporting risk | `Risk`, `FinancialReportingElement` | From the chain (methodology 4.1). |
| IT dependency and system | `ITDependency`, `System`, `SystemLayer` | Chain links 2 and 3. |
| Methodology expectation and scope | `CoverageUnit` | One row per unit. |
| Applicability | `CoverageUnit.applicability` | Necessary, not necessary, not applicable. |
| Contributing client controls | `ExpectationContribution` through `ControlMapping` | Control, contribution, scope. |
| Design coverage | `CoverageUnit.coverage_assessment` and `design_outcome` | Computed, then judged. |
| Approved procedures | `TailoredProcedure` where `status = planned` and the control program is at G3 or beyond | Attribute codes and subpopulations. |
| Testability | Derived | **Testable:** at least one planned procedure under a G3 program with a defined population. **Blocked:** a candidate pending, a stale fact, an open material contradiction, or a program below G3. **Not testable by design:** every procedure has status design gap, not necessary, or not applicable. |
| Test results | `SubpopulationConclusion` counts | Per subpopulation: items, no exception, exception, unable to test; treatments. |
| Conclusion dependencies | `ControlConclusion`, scope statements, CUEC links, impact assessments | What the unit's operating state rests on. |
| Operating state of the unit | **Not derivable in v0.2** | Needs correction C2. Shown here as the state the engine should compute. |
| Report entry | Methodology 8 category | Deviation or deficiency, exclusion, unresolved gap, limitation, variation. |

### 2.2 Client B, NetSuite, revenue posting (extract)

Risk: journal entries posted or altered by unauthorized users (completeness, accuracy, occurrence). IT dependency: NetSuite journal approval workflow and the general ledger. System: NetSuite, application layer.

| Expectation and scope | Applicability | Contributing controls | Design coverage | Approved procedures | Testability | Results | Operating state (should be) | Report entry |
|---|---|---|---|---|---|---|---|---|
| PROV-DE1, all grant paths, NetSuite app | Necessary | B-01 partial (baseline), B-02 partial (non-baseline) | Partially covered; design gap (direct Administrator assignment) | PROV-A (B-01), PROV-A (B-02) | Testable for the two covered scopes; not testable by design for the uncovered path | B-01: 0 exceptions of 230 grants; B-02: 2 grants with no Jira request | Not met for direct-assignment path; met for covered scopes with 2 exceptions evaluated | Deficiency (design gap) and two deviations |
| PROV-DE2, appropriate approver, NetSuite app | Necessary | B-02 full (non-baseline); B-01 none | Covered by combination; met | PROV-B (B-02) | Testable | B-02: 6 of 40 approved by wrong approver, systematic | Not met for non-baseline scope | Deficiency (operating) |
| PROV-DE3, approval precedes grant | Necessary | B-02 full | Covered; met | PROV-C (B-02) | Testable | 0 of 40 | Met | None |
| PROV-DE7, temporary grants | Not applicable | None | Not covered | None (status not applicable) | Not testable by design | None | Not applicable | Variation (applicability) |
| UAR-DE5, removals tracked within timeframe, NetSuite app | Necessary | B-03 full | Covered; design gap (D6, no timeframe until SOP effective date) | UAR-E, range from 1 Jan 2026 only | Testable for the second range; not testable by design for the first | Range 2: 3 of 11 removals beyond 10 business days | Not met | Deficiency |
| UAR-DE6, use of inappropriate access assessed | Necessary | B-03 none | Not covered; design gap | UAR-F (status not tested, design gap) | Not testable by design | None | Not met | Deficiency (design gap) |
| PRIV-DE6, administrator activity monitored | Necessary | None | Not covered; design gap | PRIV-G to I (not tested, design gap) | Not testable by design | None | Not met; direct-effect path (Finance Systems Manager posts journals) | Deficiency |
| DATA-DE2, owner approval of direct changes | Necessary | CSV candidate (not confirmed) | Not covered; design gap | DATA-B (not tested, design gap) | Not testable by design | DATA-A run: 41 imports, 41 with no request | Not met | Deficiency |
| SOC-DE4, CUECs addressed (NetSuite report) | Necessary | B-09 full, depending on B-02, B-03, CSV candidate | Covered; met at design | SOC-E | Testable, dependent | SOC-E: not met, because B-03 and the CSV CUEC are not effective or absent | Not met | Deficiency, cross-referenced |
| Vendor-side CHG-DE2 to DE4, NetSuite | Necessary | B-09 (through the SOC 1 report) | Covered by report; met with one exception to assess | SOC-C, SOC-D | Testable through the report | Exception in NetSuite's change management evaluated as not relevant to the company's use | Met, with documented assessment | None |

### 2.3 Client A, SAP, change to production (extract)

Risk: unauthorized or untested program changes alter financial processing. IT dependency: SAP pricing and posting logic. System: SAP ECC, application layer.

| Expectation and scope | Applicability | Contributing controls | Design coverage | Approved procedures | Testability | Results | Operating state (should be) | Report entry |
|---|---|---|---|---|---|---|---|---|
| CHG-DE2, traceable to request | Necessary | A-03 full | Covered; met | CHG-A | Testable | 0 of 25 (sample) plus targeted 6 emergency | Met | None |
| CHG-DE4, approved before import | Necessary | A-03 full | Covered; met | CHG-C | Testable | 1 of 25 approved 40 minutes after import, time zones confirmed equal | Met, with one confirmed deviation after evaluation | Deviation |
| CHG-DE5, develop and migrate separated | Necessary | A-03 partial (authorization), A-03b full (weekly review, for the two Basis staff) | Covered by combination; met by alternative control | CHG-D (A-03), CHG-F (A-03), CHG-A to CHG-D over A-03b's weekly reviews | Testable | A-03b: 52 of 52 reviews performed; 0 unexplained imports | Met | Variation (alternative control) |
| CHG-DE6, emergency changes | Necessary | A-03 full | Covered; met | CHG-E | Testable | 0 of 6 | Met | None |
| DATA-DE1, every direct-change path logged and restricted | Necessary | A-02 partial (Firefighter path), A-10 partial (approval) | Covered by combination; met | DATA-A | Testable | Population from Firefighter logs reconciled to ServiceNow: 0 unmatched | Met | None |

### 2.4 Observations from the matrix

- The "operating state" column is the one readers want and the one v0.2 cannot produce. Everything to its left is derivable today.
- Testability has three values, not two. "Not testable by design" is a legitimate end state (design gap, not necessary, not applicable) and must be distinguished from "blocked", which is a workflow state the engine should surface for action.
- Conclusion dependencies cross control programs (SOC-E on B-02 and B-03; CHG-DE5 on A-03 and A-03b). Each needs an edge, or the matrix cannot be rebuilt after a change.

---

## 3. Schema consistency findings

| # | Finding | Where | Effect |
|---|---|---|---|
| S1 | `CoverageUnit` is engagement-level and listed in several `ControlProgram.coverage_units[]`, but its applicability and design outcome are approved "at G3" without saying which control program's G3. | 3.3, 5.2, scenario 1 | Gate ownership undefined; validator for M-28 cannot be written. |
| S2 | No operating-level state on `CoverageUnit`; no edge from `ControlConclusion` to `CoverageUnit`. | 3.3, 4, scenario 2 | A contributing control's failure does not change the expectation's state; expectation-level deficiencies have no record. |
| S3 | `ControlConclusion.scope_statement` creates a conclusion form outside methodology 5.7. | 3.4, 5.5, scenario 6 | Methodology change required before adoption. |
| S4 | `TailoredProcedure.operating_criterion_text` and `criterion_ref` are singular; `CriteriaRegisterEntry.effective_criteria[]` is per date range. Time-segment subpopulations are available but not required. | 3.3, 5.3, scenario 3 | Multi-range criteria cannot be represented on the procedure. |
| S5 | `ItemAttributeResult` has no `criterion_applied_ref` (entry, attribute, range, version) and `Item` has no `deadline_computed`. | 3.4, scenarios 3 and 4 | Per-item criterion validation and reuse bases cannot be computed. |
| S6 | `Population`, `Evidence`, `Item`, `ItemAttributeResult` rows lack `control_program` and `reused_from`; only the evaluations-and-reports row has them. | 3.4 | The reuse rule in 5.4 is unenforceable on the records it governs. |
| S7 | Status-history appends on a result are not stated to increment `version`. | 5.2, methodology 5.6, scenario 5 | G4 approvals do not lapse when a status changes. |
| S8 | `ImpactAssessment.change_class` lacks "new evidence for an existing item". | 3.3, 5.4 | Late evidence has no classified path. |
| S9 | `DeficiencyEvaluation` lacks `subpopulation` and lacks `coverage_unit`. | 3.4, scenarios 2 and 6 | Deficiencies cannot attach to the scope or expectation they concern. |
| S10 | "Candidate pending confirmation" is a variant of the `CoverageCell.status` string, and `CoverageCell` is a scope record whose any change returns to G1. | 5.6, 5.2, scenario 7 | Every candidate decision re-opens G1. |
| S11 | No defined transition between "tested under a module, with design gaps" and "unresolved coverage gap" for an assessed area with no control. | 5.6, methodology 4.2 | Inconsistent reporting of the same situation. |
| S12 | Cross-checks X1 to X7 are not stated to re-run after reuse under a new control program version. | 5.4 | Reused results may carry stale cross-check results. |
| S13 | `Fact` has no class, and the reconfirmation method table in 5.8 maps methods to subjects by prose only. | 3.2, 5.8, scenario 9 | A description current by hash can finalize an entry whose practice and environment facts are stale. |
| S14 | No entity links a CUEC to the client control that addresses it and to the coverage units it supports; `DependencyEdge.kind` has no such kind. | 3.2, 3.3, scenario 10 | SOC-E cannot be validated; methodology 13's cross-control links are not first-class. |
| S15 | `ServiceOrgAssessment` and `ProjectRiskAssessment` are engagement-level with no owning control program, and need not list the coverage units they affect. | 3.3, scenario 10 | Same ownership gap as S1; exceptions in a report do not reach all dependent units. |
| S16 | `Subpopulation.status` has no defined values. | 3.3 | Minor. |
| S17 | `CoverageUnit.scope` admits "one system, and where relevant one layer, user population, location, or variant", while `Subpopulation.dimension` lists the same dimensions plus time segment. The relationship between a unit's scope and a procedure's subpopulations is not stated. | 3.3, 5.5 | A unit for "NetSuite application layer" may be served by a procedure split into employee and contractor subpopulations; whether the unit should instead be split is undefined. |
| S18 | Section 6 step 2 says a candidate "has no procedure with status planned", but the procedure `status` values (planned, not tested design gap, not necessary, not applicable) include no value for "awaiting confirmation". | 3.3, 5.6 | A candidate's procedures have no valid status. |

Consistency with the methodology: S3 is a conflict. S2 and S9 touch methodology 7 (deficiency evaluation is per control; aggregation is element 10) and would need the methodology owner to confirm that an expectation-level evaluation is acceptable or that the per-control evaluation must reference the coverage unit. All other findings are internal to the architecture.

---

## 4. Decision register with recommended defaults

Every recommendation below is a proposal for the methodology owner or the architecture reviewer. None is adopted by this report.

| # | Decision (architecture 10) | Recommended default | Why | Who decides |
|---|---|---|---|---|
| 3 | Deferring a graph-driven freeze | Allow deferral to the next checkpoint only while every reached record is unapproved; the moment any reached record is approved, freeze. | Keeps reapproval cost down without letting approved work rest on changed facts. | Architecture reviewer |
| 4 | "Retain valid" under a criterion change | Permit only for date ranges the criterion did not touch, computed per item from `criterion_applied_ref` (after C5). Never for items whose criterion text changed. | A changed criterion is a different test. | Methodology owner |
| 5 | Qualified resolvers | At least one named person with ITGC audit competence who is not the preparer of the entry. The engagement approver may resolve, but a contradiction the approver resolves is listed in the variations schedule. | Separates the person fixing the criterion from the person who drafted it; keeps one-person engagements possible with disclosure. | Methodology owner |
| 6 | Reconfirmation by hash alone | An identical hash reconfirms the description fact only. Practice facts need a walkthrough in the period; environment and configuration facts need a system comparison or an `EnvironmentChange` review. Finalization needs all classes current (C13). | Scenario 9. | Methodology owner |
| 7 | Personal data minimization | Keep name, title, team, and role only; no identifiers beyond what evidence references need; purge `Person` records from L2 at the retention point in 15. | Methodology 10.5 and approvals C5 context. | Methodology owner, with the client's data terms |
| 8 | L1 decomposition | Generate by code from the approved methodology document at approval time, with the document hash recorded; hand edits prohibited. | Keeps L1 immutable and traceable. | Architecture reviewer |
| 9 | Contradiction materiality test | Fix as policy: material if it could change a test status, a population, a performer, a scope, or an effective date. Resolver may raise, never lower. | Removes a judgment the Planner would otherwise make alone. | Methodology owner |
| 10 | Scoped conclusions | Do not adopt as drafted. Keep the methodology's three conclusion values for the control; record subpopulation conclusions beneath it; where subpopulations differ, the control conclusion is the worst subpopulation's, and the report shows the subpopulation breakdown. If the owner wants scoped statements, amend methodology 5.7 first. | S3. | Methodology owner |
| 11 | Batch eligibility and G4 | Keep the list; allow batching at G4 only for controls meeting methodology 5.7's clean definition; add "no reused results" to the eligibility list. | A reused result rests on an impact assessment the approver should see individually. | Methodology owner |
| 12 | Re-affirmation | Available to the engagement approver only after the Reviewer's check on the impact assessment is recorded; never for criterion, population, or scope classes. | Keeps re-affirmation from becoming a bypass. | Architecture reviewer |
| 13 | Covered by combination becoming met | Require recorded reasoning on precision in every case. | Methodology 10.6 lists design conclusions with alternative controls; a combination is the same kind of judgment. | Methodology owner |
| 14 | Candidate confirmation authority | In-flight approval permitted, by the engagement approver, with the Reviewer's blind view recorded first; the confirmation is re-shown at G3. | Lets planning continue without waiting for the full gate. | Architecture reviewer |
| 15 | Retention | Retain all revisions and superseded versions for the engagement file's retention period, with client personal data purged from superseded L2 snapshots after release unless referenced by a finding. | Audit trail without indefinite personal data. | Methodology owner, with legal input |

New decisions raised by this validation:

| # | Decision | Recommended default | Who decides |
|---|---|---|---|
| 16 | Gate ownership of coverage units (S1) | A coverage unit passes G3 when its last contributing control program passes G3; its applicability and design outcome are approved with that program and re-shown with each earlier one. | Architecture reviewer |
| 17 | Expectation-level operating state and deficiencies (S2, S9) | Add `CoverageUnit.operating_state` derived from contributing conclusions by scope; deficiency evaluation stays per control under methodology 7 but must reference the coverage unit and scope it affects. | Methodology owner for the evaluation; architecture reviewer for the field |
| 18 | Assessed area with no control (S11) | "Tested under a module" with design gaps once G3 has assessed the area; "unresolved coverage gap" only where no assessment was performed. | Methodology owner |

---

## 5. Prioritized corrections

**P1: blocks implementation.**

| # | Correction | Finding |
|---|---|---|
| C1 | Define gate ownership for `CoverageUnit` (decision 16) and for `ServiceOrgAssessment` and `ProjectRiskAssessment`, or give each its own approval attached to a named control program. | S1, S15 |
| C2 | Add `CoverageUnit.operating_state` (met, not met for scope, unable to conclude for scope, not tested by design), derived from contributing `SubpopulationConclusion`s and `ControlConclusion`s by scope; add edge kind "contributes to" from conclusions to units; have `DeficiencyEvaluation` reference the coverage unit and scope. Requires the methodology owner's position on expectation-level evaluation. | S2, S9 |
| C3 | Remove `scope_statement` as a conclusion form, or obtain a methodology amendment to 5.7 before adopting it. Under decision 10's default, the control conclusion is the worst subpopulation's. | S3 |
| C4 | Make `TailoredProcedure` hold `operating_criteria[]` indexed by date range, and require a time-segment subpopulation whenever more than one range is in the test period. | S4 |
| C5 | Add `ItemAttributeResult.criterion_applied_ref` and `Item.deadline_computed`. | S5 |
| C6 | Add `control_program` and `reused_from` to `Population`, `Evidence`, `Item`, and `ItemAttributeResult`. | S6 |

**P2: needed before the first engagement.**

| # | Correction | Finding |
|---|---|---|
| C7 | State that a status-history append increments the result's version, so dependent approvals lapse. | S7 |
| C8 | Add change class "new evidence for an existing item" with default disposition: re-open the item through status history, re-propose the treatment, G4 for that record and its conclusion; apply methodology 5.3's test for evidence produced after the event. | S8 |
| C9 | Add `subpopulation` to `DeficiencyEvaluation`. | S9 |
| C10 | Replace the "candidate pending" status variant with `CoverageCell.pending_candidates[]`; a candidate decision changes that field without re-opening G1; the cell status changes only if the area's outcome changes, and then G1 applies to that cell only. | S10 |
| C11 | Define the transition in decision 18. | S11 |
| C12 | State that cross-checks X1 to X7 are re-run on every reused result under its new version, and that X1 uses the population hash recorded in the impact assessment. | S12 |
| C13 | Add `Fact.fact_class` (description, practice, environment, configuration, service organization) and make the 5.8 method table a validator input: an entry is finalizable only when every class the control depends on is current by an acceptable method. | S13 |
| C14 | Add `CuecMapping` (service organization, CUEC identifier and text, client control, coverage units supported, status) and edge kind "addresses CUEC"; SOC-E derives from it. | S14 |
| C15 | Require `ServiceOrgAssessment.affected_coverage_units[]` and `ProjectRiskAssessment.affected_coverage_units[]`, computed from the service organization's `systems[]` and the chain. | S15 |

**P3: improvements.**

| # | Correction | Finding |
|---|---|---|
| C16 | Add a Planner check that flags two client controls with identical procedure content hashes over the same module and asks whether they are one control with a location or variant subpopulation. | Scenario 8 |
| C17 | Define `Subpopulation.status` (proposed, confirmed, withdrawn) and add a procedure status "awaiting confirmation" for candidates. | S16, S18 |
| C18 | State the relationship between a coverage unit's scope and a procedure's subpopulations: a unit's scope is the finest scope at which applicability can differ; subpopulations below that scope share the unit's decision and feed its operating state separately. | S17 |

---

## 6. What was not validated

- No code was run; the dependency walks are hand traces of the rules as written.
- The methodology's own rules were taken as given; only their interaction with the architecture was checked.
- Scenarios used the two fictional clients; a real client's documentation would exercise the extraction and contradiction paths more than any scenario here.
- The matrix extracts cover nine and five coverage units; a full matrix for one engagement would have several hundred rows and should be generated, not written.
