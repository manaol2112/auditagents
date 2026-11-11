# Patch Proposal: Engagement Tailoring Architecture v0.2 → v0.2.1

| | |
|---|---|
| **Responds to** | `architecture/validation-report-v0.2.md` |
| **Prepared** | 2026-11-06, by Claude (AI agent). Not reviewed by a human. |
| **Status** | PROPOSAL. Nothing in the architecture, the methodology, or code is changed by this document. |
| **Scope** | Resolve findings that could produce incorrect audit conclusions, invalid approvals, unreliable testing, or incomplete coverage. No new layer, gate, agent, or workflow state. New entities only where no existing one can hold the requirement; this proposal adds none. |

## 1. Principles applied

- The four layers, the five gates, methodology independence, human judgment, and evidence traceability are untouched.
- Where a finding can be met by a field on an existing entity, a derived value, or a validator rule, that is what is proposed.
- Deterministic checks (completeness, dependency, arithmetic) are separated from judgments (adequacy, mitigation, conclusion) in every patch.
- Anything that would change an audit judgment rule is routed to the methodology owner in section 6 rather than decided here.

## 2. Structural patches

### P1. Approval responsibility for coverage unit design outcomes (findings S1, S15)

**Rule.** A coverage unit is approved at G3, by the engagement approver, as part of the G3 approval of its contributing control programs. No separate gate.

**Mechanics.**

1. `CoverageUnit` gains `lead_control_program`: the contributing control program the Planner designates at G2, normally the one with the primary mapping. Exactly one per unit (validator).
2. `CoverageUnit.gate_status` is derived, not stored: the lowest `gate_status` among its contributing control programs.
3. **Control programs that share a coverage unit pass G3 together.** The G3 approval action for the lead program includes the unit's applicability decision and design outcome, and the validator refuses that approval until every other contributing program has reached G3 submission (walkthroughs done, design outcomes proposed). The `Approval` record is written against `(CoverageUnit.id, version)` with `gate = G3`, so it lapses on the unit's own changes.
4. Operating testing of a control program may not start until every coverage unit it contributes to is G3-approved (extends methodology M-29 without changing it).
5. `ServiceOrgAssessment` and `ProjectRiskAssessment` gain `owning_control_program` (the TP-SOC1 or DEV-SDLC control program for that service organization or project) and `affected_coverage_units[]`, computed from the service organization's `systems[]` or the project's affected systems through the chain. They are approved with the owning program at G2 and confirmed at G3, and their edges reach every listed unit.

**Human decision.** The engagement approver's G3 reasoning covers the unit's design outcome, including, for "covered by combination", why the combination is precise enough (decision 13, section 6).

**Effect on workflow.** None visible beyond the "together" rule: programs sharing a unit are submitted to G3 as a set. Batch eligibility is unchanged.

### P2. Operating coverage assessment (findings S2, S9)

**Rule.** After results are approved, each coverage unit carries an operating assessment with two separated parts: a deterministic completeness and dependency check, and a human judgment on whether the risk is mitigated.

**Mechanics.**

1. `CoverageUnit` gains `operating_completeness`, **derived by code** from the approved `SubpopulationConclusion`s of every contributing control, matched to the unit's scope through the contribution scopes:

| Value | Meaning |
|---|---|
| All scope concluded effective | Every part of the unit's scope is covered by at least one contributing control whose subpopulation conclusion for that scope is effective. |
| Scope with not-effective contributor | Some part of the scope is covered only by contributors concluded not effective for it. |
| Scope unable to conclude | Some part of the scope is covered only by contributors concluded unable to conclude. |
| Results pending | A contributing control's conclusion for part of the scope is not yet approved. |
| Not tested by design | The unit's design outcome is design gap, or the decision is not necessary or not applicable. |

2. `CoverageUnit` gains `operating_outcome` and `operating_rationale`, **decided by the engagement approver**: met, not met, or unable to conclude for the unit's scope. Where completeness is "all scope concluded effective", the engine proposes "met" and the approver may approve it in the same G4 action as the contributing conclusions. Where it is anything else, the approver records reasoning: in particular, whether any remaining effective contributor mitigates the risk for the affected scope, and to what extent. The engine never derives "met" from a failed contributor.
3. New `DependencyEdge.kind` value "concludes for", written from each `ControlConclusion` to every coverage unit its control contributes to. A change to any contributing conclusion lapses the unit's `operating_outcome` approval through the graph and recomputes `operating_completeness`.
4. `DeficiencyEvaluation` gains `coverage_units[]` and `subpopulation`. The evaluation remains per control under methodology 7; element 3 (dependencies and assertions) is populated from the listed units, and element 10 (aggregation) considers the other contributors to the same units. No expectation-level evaluation record is created (methodology-owner decision, section 6).
5. The validator refuses: a unit `operating_outcome` of "met" while `operating_completeness` is not "all scope concluded effective" and no approver reasoning exists; a `DeficiencyEvaluation` for a failed attribute that serves a coverage unit without that unit in `coverage_units[]`; a G5 release while any necessary unit has `operating_completeness` "results pending".

### P3. Control conclusions keep the three methodology values (finding S3)

**Rule.** `ControlConclusion.value` is one of effective, not effective, unable to conclude (methodology 5.7). Subpopulation results are recorded separately and shown in the report. There is no scoped conclusion.

**Mechanics.**

1. Remove `ControlConclusion.scope_statement`. Keep `subpopulation_conclusions[]` and `aggregation_rationale`.
2. Add `ControlConclusion.approved_scope`: a copy of the control program's scope (systems, layers, user populations, locations, variants) as approved at G3. The conclusion is for that scope and nothing narrower.
3. Derived proposal: the engine proposes effective only if every subpopulation in the approved scope is effective; proposes not effective if any is not effective; otherwise proposes unable to conclude. The engagement approver decides and records reasoning whenever the proposal is anything but effective, or whenever subpopulation results differ.
4. A conclusion narrower than the approved scope is not available. If the approver judges that a part of the scope is a distinct control, the remedy is replanning: split the control program at G2, with its own criteria, procedures, and conclusion.
5. Each not-effective or unable-to-conclude subpopulation receives its own `DeficiencyEvaluation` (with `subpopulation`) or scope-limitation entry; the report (methodology 8) shows the control's value and the subpopulation breakdown beneath it.
6. Validator: `value = effective` while any subpopulation in `approved_scope` is not effective or unable to conclude is refused; a `SubpopulationConclusion` with no deficiency evaluation or limitation entry when not effective or unable to conclude is refused at G5.

## 3. Data-model patches

### P4. Multiple effective-date ranges for criteria (S4)

- Replace `TailoredProcedure.operating_criterion_text` and `criterion_ref` with `operating_criteria[]`, each: `range_start`, `range_end`, `criterion_text` (copied), `criterion_ref` (register entry id and version, attribute, range id), `subpopulation` (the time-segment subpopulation it applies to).
- Rule: when a register entry has more than one range inside the test period, the procedure has one time-segment `Subpopulation` per range (`dimension = time segment`). Validator: ranges are contiguous, do not overlap, and cover the test period; every range has a subpopulation; every subpopulation has a population definition.
- `CriteriaRegisterEntry.effective_criteria[]` gains `range_id` so references are exact.

### P5. Exact criterion-version references in results (S5, S6)

- `ItemAttributeResult` gains `criterion_applied_ref` (register entry id and version, attribute, range id) and `control_program` (id and version); `Item` gains `trigger_datetime_normalized`, `deadline_computed`, and `control_program`; `Population` and `Evidence` gain `control_program`; `Population`, `Item`, `ItemAttributeResult`, and `Evidence` gain `reused_from`.
- Validator: every result's `criterion_applied_ref` equals the `criterion_ref` of the procedure range whose dates contain the item's trigger date; `deadline_computed` equals the deadline rule applied to `trigger_datetime_normalized`; `reused_from` set only where an approved `ImpactAssessment` lists the record as "retain valid"; cross-checks X1 to X7 are re-run for every reused record under its new version, with X1 using the population hash recorded in the assessment.

### P6. Approval invalidation after status-history changes (S7, S8)

- Rule: appending an entry to a result's status history creates a new `ItemAttributeResult` version. The graph then lapses the approvals of the treatment, the subpopulation conclusion, the control conclusion, and the coverage unit's operating outcome that depend on it; nothing else lapses.
- `ImpactAssessment.change_class` gains "new evidence for an existing item", with default disposition: append a status entry (methodology 5.6), re-propose the treatment, assess the evidence under methodology 5.3 (evidence produced after the event), and return the record and its conclusions to G4. No snapshot change unless the evidence also establishes an L2 fact.

### P7. Current-period validation of control operation (S13, decision 6)

- `Fact` gains `fact_class`: description, practice, environment, configuration, service organization.
- The reconfirmation method table in architecture 5.8 becomes a validator input:

| Fact class | Methods that make it current |
|---|---|
| Description | Document comparison (identical hash or diff), or walkthrough |
| Practice (performer, frequency, evidence retained, how it is done) | Walkthrough in the period only |
| Environment (systems, layers, locations, managed-by) | System comparison, or `EnvironmentChange` review with evidence, or walkthrough |
| Configuration | System comparison only |
| Service organization | Current report or assessment in the period |

- Rule: a `CriteriaRegisterEntry` is finalizable only when, for the control it describes, every fact class the control depends on has at least one current fact. For every control, the practice class requires a walkthrough in the period, so an identical document hash alone never finalizes an entry. The client's `EnvironmentChange` records are checked for every system in the control's `systems[]`, and an unreconfirmed change blocks finalization.
- A client assertion of "no change" stays `basis = asserted` and makes nothing current on its own (unchanged from v0.2).

### P8. CUECs mapped to client controls (S14)

No new entity. `ServiceOrganization.cuecs[]` becomes a list of structured items on the existing entity: `cuec_id`, `text`, `source_ref` (report and page), `addressed_by[]` (client control refs), `supports_coverage_units[]` (computed from the client controls' contributions), `status` (addressed, partially addressed, not addressed).

- `DependencyEdge.kind` gains "addresses CUEC", written from each `ClientControl` in `addressed_by[]` to the CUEC item's parent `ServiceOrganization` version.
- SOC-E results derive from `addressed_by[]` and the approved conclusions of those controls: "no exception" only where every mapped control's conclusion is effective; otherwise the result is an exception or "unable to test", and the service organization assessment reaches every unit in `supports_coverage_units[]` through P1.
- Validator: a CUEC with empty `addressed_by[]` and status "addressed"; a SOC-E "no exception" while a mapped control is not effective, unable to conclude, or a candidate.

### P9. Coverage cell and candidate state (S10, S11, decision 18)

- `CoverageCell` gains `pending_candidates[]`. The status string loses its "(candidate pending confirmation)" variant. Confirming or refusing a candidate edits `pending_candidates[]` without re-opening G1.
- Transition rule: once the coverage units of an area have passed G3 for a system, the cell is "tested under a module" whatever the design outcomes; "unresolved coverage gap" applies only where no G3 assessment of the area was performed. A cell may move from "tested under a module" to "unresolved coverage gap" only through a G1 change to that cell (for example, the only control is withdrawn before assessment).

## 4. Classification of the remaining validation findings

| Finding | Class | Treatment in this patch |
|---|---|---|
| S1 gate ownership of coverage units | A | P1 |
| S2 operating-level coverage | A | P2 |
| S3 scoped conclusions | A | P3 |
| S4 multi-range criteria | A | P4 |
| S5 criterion reference and computed deadline on results | A | P5 |
| S6 `control_program` and `reused_from` on execution records | B | P5 |
| S7 status append does not lapse approvals | A | P6 |
| S8 late-evidence change class | B | P6 |
| S9 deficiency evaluation lacks subpopulation and coverage unit | A | P2, P3 |
| S10 candidate-pending as a cell status variant | B | P9 |
| S11 assessed area with no control | A | P9, with decision 4 in section 6 |
| S12 cross-checks after reuse | B | P5 |
| S13 fact class and method adequacy | A | P7 |
| S14 CUEC mapping | A | P8 |
| S15 assessments without owner or affected units | A | P1 |
| S16 `Subpopulation.status` values | B | Define as proposed, confirmed, withdrawn; one line in 3.3. |
| S17 unit scope versus procedure subpopulations | C | Deferred (section 8). |
| S18 procedure status for candidates | B | Add value "awaiting confirmation"; validator already refuses "planned". |
| Scenario 8 duplicate procedure detection (C16) | C | Deferred. |
| Decision 11 batch at G4 with reused results | A | Add "no reused results" to the batch-eligibility list (one line in 5.7). |
| Decision 12 re-affirmation after Reviewer check | B | State that re-affirmation requires the Reviewer's recorded check on the impact assessment; one line in 5.7. |
| Decisions 7, 8, 15 (personal data, L1 generation, retention) | C | Deferred. |

## 5. Exact changes, consolidated

### 5.1 Fields

| Entity | Add | Remove or replace | Section of architecture |
|---|---|---|---|
| `CoverageUnit` | `lead_control_program`; `operating_completeness` (derived); `operating_outcome`; `operating_rationale`; `operating_approval_ref` | None | 3.3 |
| `ControlConclusion` | `approved_scope` | Remove `scope_statement` | 3.4 |
| `DeficiencyEvaluation` | `coverage_units[]`; `subpopulation` | None | 3.4 |
| `TailoredProcedure` | `operating_criteria[]` (range_start, range_end, criterion_text, criterion_ref, subpopulation) | Replace `operating_criterion_text`, `criterion_ref` | 3.3 |
| `CriteriaRegisterEntry.effective_criteria[]` | `range_id` | None | 3.2 |
| `ItemAttributeResult` | `criterion_applied_ref`; `control_program`; `reused_from` | None | 3.4 |
| `Item` | `trigger_datetime_normalized`; `deadline_computed`; `control_program`; `reused_from` | None | 3.4 |
| `Population`, `Evidence` | `control_program`; `reused_from` | None | 3.4 |
| `Fact` | `fact_class` | None | 3.2 |
| `ServiceOrganization.cuecs[]` | Structured items: `cuec_id`, `text`, `source_ref`, `addressed_by[]`, `supports_coverage_units[]`, `status` | Replace free-text list | 3.2 |
| `ServiceOrgAssessment`, `ProjectRiskAssessment` | `owning_control_program`; `affected_coverage_units[]` | None | 3.3 |
| `CoverageCell` | `pending_candidates[]` | Remove status variant "(candidate pending confirmation)" | 3.3, 5.6 |
| `ImpactAssessment.change_class` | Value "new evidence for an existing item" | None | 3.3 |
| `DependencyEdge.kind` | Values "concludes for", "addresses CUEC" | None | 3.3 |
| `Subpopulation` | `status` values: proposed, confirmed, withdrawn | None | 3.3 |
| `TailoredProcedure.status` | Value "awaiting confirmation" | None | 3.3 |

### 5.2 Transitions and derived values

| Transition or rule | Statement |
|---|---|
| Coverage unit G3 | Approved within the lead program's G3 approval; refused until all contributing programs are G3-submitted; programs sharing a unit pass G3 together; no operating testing for a program until all its units are approved. |
| Coverage unit G4 | `operating_completeness` recomputed whenever a contributing conclusion is approved or changes; `operating_outcome` approved by the engagement approver at G4; lapses through "concludes for" edges. |
| Control conclusion | Engine proposes from subpopulation conclusions; value limited to three; narrower scope only by replanning at G2. |
| Status history | Append creates a new result version; dependent approvals lapse; nothing else. |
| Register finalization | Blocked until every fact class the control depends on is current by an acceptable method, including a walkthrough in the period for practice. |
| Coverage cell | Candidate decisions edit `pending_candidates[]` only; assessed areas stay "tested under a module"; cell status changes are G1 for that cell only. |
| Batch eligibility | Add: no reused results in the records submitted. |
| Re-affirmation | Requires the Reviewer's recorded check on the impact assessment; never for criterion, population, or scope classes (unchanged). |

### 5.3 Validators added

1. Exactly one `lead_control_program` per coverage unit; lead's G3 refused until co-contributors are G3-submitted.
2. No operating result for a control program with an unapproved coverage unit.
3. `operating_outcome = met` with completeness other than "all scope concluded effective" and no rationale: refused.
4. G5 refused while any necessary unit is "results pending".
5. `ControlConclusion.value = effective` with any not-effective or unable-to-conclude subpopulation in `approved_scope`: refused.
6. Not-effective or unable-to-conclude subpopulation without a deficiency evaluation or limitation entry at G5: refused.
7. Criteria ranges contiguous, non-overlapping, covering the period; one time-segment subpopulation per range.
8. `criterion_applied_ref` matches the range containing the item's trigger date; `deadline_computed` matches the rule.
9. `reused_from` without an approved impact assessment listing the record: refused; cross-checks re-run on every reused record.
10. Register entry finalization with any required fact class stale, or an unreconfirmed `EnvironmentChange` on a listed system: refused.
11. CUEC "addressed" with empty `addressed_by[]`; SOC-E "no exception" with a mapped control not effective, unable to conclude, or candidate: refused.
12. `DeficiencyEvaluation` for a failed attribute serving a unit without that unit listed: refused.
13. Candidate with a procedure status other than "awaiting confirmation", "not necessary", or "not applicable": refused.

## 6. Proposed methodology-owner decisions

These change or confirm audit judgment rules and are outside this patch's authority.

| # | Decision | Proposal | Why it is the owner's |
|---|---|---|---|
| 1 | Control conclusion with mixed subpopulation results | Confirm that under methodology 5.7 the control's value is the worst subpopulation's within the approved scope, with the breakdown shown in the report, and that a narrower conclusion requires replanning. Add one sentence to 5.7 at the next methodology revision. | It interprets 5.7; the architecture cannot settle it. |
| 2 | Expectation-level operating outcome | Confirm that the engagement approver's judgment on `operating_outcome`, including whether remaining contributors mitigate the risk, is a design-and-operating judgment under methodology 5.7 and 7.3 elements 3 and 10, and that deficiency evaluation stays per control with coverage-unit references. | Methodology 7 is per control; this applies it to combinations. |
| 3 | Reconfirmation adequacy (decision 6) | Adopt P7's table: a document hash reconfirms description facts only; practice facts need a walkthrough in the period; configuration needs a system comparison. | Determines what counts as evidence that a control still operates as described. |
| 4 | Assessed area with no control (decision 18) | Adopt P9's transition: once assessed at G3, "tested under a module" with design gaps; "unresolved coverage gap" only where no assessment occurred. | Decides how such areas are reported under methodology 8. |
| 5 | Covered-by-combination reasoning (decision 13) | Require recorded reasoning on precision for every "covered by combination" that becomes "met". | Methodology 10.6 scope. |
| 6 | Contradiction materiality (decision 9) | Fix as policy: material if it could change a test status, a population, a performer, a scope, or an effective date; the resolver may raise, not lower. | Removes a judgment otherwise made by the Planner. |
| 7 | Qualified resolvers (decision 5) | At least one named person with ITGC audit competence other than the entry's preparer; approver may resolve with disclosure in the variations schedule. | Who may fix audit criteria. |

## 7. Minimal regression scenarios

Each scenario is to be re-traced against the patched architecture before implementation. Expected engine behaviour is stated so a trace can fail.

| # | Scenario | Expected after patch |
|---|---|---|
| R1 | Two control programs contribute to one coverage unit; one reaches G3 submission first. | Lead program's G3 approval refused until the other is G3-submitted; unit approved in the lead's G3; neither program starts operating testing before the unit is approved. |
| R2 | A contributing control's conclusion becomes not effective for part of a unit's scope. | `operating_completeness` recomputed to "scope with not-effective contributor"; the unit's `operating_outcome` approval lapses; approver must record mitigation reasoning before any outcome; deficiency evaluation lists the unit. |
| R3 | Employee subpopulation effective, contractor subpopulation not effective, one control program. | Engine proposes not effective; no narrower value available; contractor subpopulation gets its own deficiency evaluation; report shows the breakdown. |
| R4 | Criterion with two date ranges; the boundary later moves by two weeks. | Procedure has two `operating_criteria[]` entries and two time-segment subpopulations; each result carries `criterion_applied_ref`; impact assessment retains results whose trigger date is outside the moved window, computed from the stored reference, and re-performs the rest. |
| R5 | Late evidence arrives for an item treated as a deviation after G4 approval. | Status entry appended; result version increments; treatment, subpopulation conclusion, control conclusion, and unit operating outcome approvals lapse; nothing else lapses; evidence assessed under methodology 5.3; change class "new evidence for an existing item". |
| R6 | Prior-year description with identical hash; performer outsourced and system upgraded in the period. | Description fact current; practice and environment facts stale; register entry finalization refused until a walkthrough in the period and a system comparison exist; `EnvironmentChange` for the system blocks until reconfirmed. |
| R7 | A CUEC in a service organization's report is addressed by a client control concluded not effective. | SOC-E cannot be "no exception"; the service organization assessment reaches every unit in `supports_coverage_units[]`; those units' completeness recomputed. |
| R8 | A candidate control is refused after walkthrough. | `pending_candidates[]` emptied; cell stays "tested under a module"; G1 not reopened; units return to G3 with design outcomes recorded. |
| R9 | Batch submission at G4 including one control with a reused result. | Batch refused; that control approved individually. |
| R10 | Editorial change to procedure text after G3. | Impact assessment class editorial; Reviewer check recorded; approver re-affirms; no approval lapses beyond the procedure's own. |

## 8. Enhancements explicitly deferred

| Item | Why deferred |
|---|---|
| S17: formal relationship between coverage-unit scope and procedure subpopulations | Works in practice under P2 (completeness is matched through contribution scopes); a formal rule is a refinement, not a correctness fix. |
| C16: detection of duplicate procedures across client controls | Planner quality aid; no effect on conclusions. |
| Decision 7: personal data minimization | Needs the client's data terms and legal input; does not affect audit logic. |
| Decision 8: code-generated L1 decomposition | Implementation choice; either option preserves immutability if the document hash is recorded. |
| Decision 15: retention periods | Legal and client-contract question. |
| Decision 3 refinement: deferring graph-driven freezes | The v0.2 default (freeze when an approved record is reached) is safe; the optimization can wait. |
| Decision 14: candidate confirmation by in-flight approval | v0.2 permits it with the Reviewer's view; no correctness issue found. |
| Expectation-level deficiency evaluation record | Not added; methodology-owner decision 2 keeps evaluation per control with unit references. Revisit only if the owner decides otherwise. |

## 9. What this patch does not change

- The four layers, the five gates, and the agent and human roles.
- The methodology text, modules, conclusion values, deficiency evaluation structure, and rule register.
- Snapshot immutability, pinning, and the dependency-graph invalidation principle.
- The criteria register, impact assessment, candidate, batching, and reuse mechanisms, beyond the fields and rules listed in section 5.
