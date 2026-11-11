# Change Log: SOX ITGC Testing Methodology

## Version 0.4.1 (2026-11-06), from version 0.4

Targeted correction of the nine modules added in 0.4, plus a new section 13 on testing patterns. The four original modules, the five gates, sections 1 to 5 and 7 to 12, and Appendix A are unchanged. Every existing ID is retained. No sample size, universal threshold, or automatic conclusion was added. Not approved for use, not implemented in code, not committed.

### Corrections by finding

| # | Module | What changed | Sections |
|---|---|---|---|
| 1 | AC-PROV | PROV-DE1 enumerates every grant path: direct, administrative, group-based, inherited, federated, automated, temporary, bulk. Effective access is resolved through groups and inheritance (PROV-DE4, PROV-A, PROV-D). PROV-DE7 and PROV-G added for temporary grants. A two-date effective-access comparison is named as the approved alternative where a path has no log. | 6.5 |
| 2 | AC-TERM | A deadline computation rule is added: trigger event defined by the control (TERM-DE2) plus timeframe, with time zone basis recorded per source and a stated convention for date-only sources. TERM-B compares the system's own disable timestamp to that deadline. TERM-C is now a separate post-termination activity investigation that records exposure and is a deviation only against the control's own requirement, with system-specific logon metadata understood. Contractors and third parties get their own system of record (TERM-DE1). TERM-DE7 added. | 6.6 |
| 3 | AC-AUTH | The policy is the operating criterion (AUTH-A); whether the policy suits the risk is a design question (AUTH-DE1, D2). AUTH-D now requires enforcement evidence (enforcement policy with controlled exclusions, and logs showing no single-factor logon), not enrolment. AUTH-DE4 covers federation, trust relationships, and bypass paths; AUTH-F added for bypass paths. | 6.7 |
| 4 | AC-PHYS | Applicability is a three-part analysis: where equipment and media are, what physical access could do to financial data, and who is responsible under the shared arrangement. Ownership or hosting alone no longer decides it. PHYS-DE5 added for the company's part of a shared location. PHYS-D uses the AC-TERM deadline rule. | 6.8 |
| 5 | CM-DATA | A missing log is no longer an automatic design gap. Three cases are distinguished: design failure, population incompleteness, evidence limitation, each with its treatment, decided by the engagement approver. Approved alternative population sources are listed. DATA-DE1, DATA-DE5, and DATA-A reworded accordingly. | 6.9 |
| 6 | DEV-SDLC | A project risk assessment (DEV-DE8) sets which expectations apply and the extent of each; omissions are explicit applicability decisions. Iterative, software-as-a-service, and phased or wave deliveries are accommodated by mapping artefacts to expectations. Rollback is risk-based (DEV-DE5, DEV-D); trial conversion is risk-based (DEV-DE4); reconciliations within a project are a population with a selection rationale (DEV-C). | 6.10 |
| 7 | CO-BKP | The presumption that the module is usually unnecessary is removed. Applicability is a four-point analysis of the effect of data loss or failed recovery on financial reporting. BKP-DE6 added for recovery objectives tied to the close; BKP-A and BKP-C reference them. | 6.11 |
| 8 | CO-INC | Completeness is tested against a recorded set of independent sources, not job failures alone: monitoring, security tooling, emergency and data changes, service desk channels, vendor notifications, availability logs, finance-reported issues, service-level reports. INC-DE6 added for intake channels and incident-versus-request classification. INC-A reworded. | 6.12 |
| 9 | TP-SOC1 | A SOC 1 Type 2 report with a bridge letter is no longer the only acceptable approach. A seven-point risk-based assessment per service organization (SOC-DE8, SOC-H) determines the evidence: service auditor reports with tests, agreed-upon procedures reports, the company's own controls over the service, or tests at the service organization. Gap-period coverage may be a bridge letter, inquiry, the company's controls, or a later report. Service auditor reputation, competence, and independence added (SOC-C). Use of a report under another framework is a recorded judgment. Module retitled. | 6.13 |
| 10 | Engine | New section 13 classifies populations into six patterns (recurring, event-driven, configuration, project-based, incident-based, third-party), maps modules to them, lists the record elements that differ by pattern, and states the engine implications while keeping one workpaper model. "Items requiring approval" becomes section 14. | 13, 14 |

Each revised module now ends with a classification block separating mandatory requirements, engagement-specific applicability, approved alternatives, and professional judgment.

### Attribute-level change log

Totals move from 76 to 83 design expectations and from 84 to 87 operating attributes. Unlisted IDs are unchanged.

| Module | Updated | Added | Removed |
|---|---|---|---|
| AC-PROV | PROV-DE1, PROV-DE4, PROV-DE5, PROV-A, PROV-C, PROV-D, PROV-F | PROV-DE7, PROV-G | None |
| AC-TERM | TERM-DE1, TERM-DE2, TERM-DE3, TERM-DE4, TERM-DE6, TERM-A, TERM-B, TERM-C, TERM-F | TERM-DE7 | None |
| AC-AUTH | AUTH-DE1, AUTH-DE4, AUTH-A, AUTH-D, AUTH-E | AUTH-F | None |
| AC-PHYS | PHYS-DE1, PHYS-DE2, PHYS-A, PHYS-B, PHYS-D | PHYS-DE5 | None |
| CM-DATA | DATA-DE1, DATA-DE5, DATA-A | None | None |
| DEV-SDLC | DEV-DE1, DEV-DE2, DEV-DE3, DEV-DE4, DEV-DE5, DEV-A, DEV-B, DEV-C, DEV-D | DEV-DE8 | None |
| CO-BKP | BKP-DE1, BKP-DE3, BKP-DE5, BKP-A, BKP-C | BKP-DE6 | None |
| CO-INC | INC-A | INC-DE6 | None |
| TP-SOC1 | SOC-DE2, SOC-DE3, SOC-DE4, SOC-DE6, SOC-A, SOC-B, SOC-C, SOC-E, SOC-F | SOC-DE8, SOC-H | None |

### Other edits

- Section 6 index: applicability notes for AC-PHYS, DEV-SDLC, and CO-BKP rewritten to match the modules; TP-SOC1 retitled "service auditor reports".
- Section 4.2 and 4.3: wording for TP-SOC1 aligned.
- Verification register: AS 2201.B19–.B20, .B22, .B23 and AS 2601.06, .13 added, all read in the booklet already on file; U11 (reports under other frameworks) and U12 (time zone and deadline rules have no cited source) added.
- Approvals required: A12, A23, A24, A25 updated; A27 to A31 added.

---

## Version 0.4 (2026-11-06), from version 0.3.1

Scope expansion: nine control modules added so that every GITC area has a module. The cross-cutting rules in sections 1 to 5 and 7 to 12 are unchanged apart from the edits listed below. Modules 6.5 to 6.13 have not been technically reviewed. Not approved for use, not implemented in code, not committed.

### Modules added

| Module | Area | Design expectations | Operating attributes |
|---|---|---|---|
| AC-PROV (6.5) | User provisioning and access changes | 6 | 6 |
| AC-TERM (6.6) | Termination and transfer | 6 | 6 |
| AC-AUTH (6.7) | Authentication and password configuration | 4 | 5 |
| AC-PHYS (6.8) | Physical access to computing facilities | 4 | 5 |
| CM-DATA (6.9) | Direct data changes | 6 | 5 |
| DEV-SDLC (6.10) | System development, implementation, and data migration | 7 | 6 |
| CO-BKP (6.11) | Backup and restoration | 5 | 4 |
| CO-INC (6.12) | Incident and problem management | 5 | 5 |
| TP-SOC1 (6.13) | Service organizations and SOC 1 reports | 7 | 7 |

Totals are now 13 modules, 76 design expectations, and 84 operating attributes. Each new module follows the 0.3.1 template: risk, design expectations subject to the applicability decision in 5.1, population and means of selection, operating attributes, evidence, and escalation points. AC-PHYS, DEV-SDLC, and CO-BKP carry applicability notes because they are commonly not applicable or not necessary.

### Other edits

- **Header:** coverage statement replaced; status notes which parts are reviewed and which are new.
- **4.2 coverage map:** every area now names a module; rows added for physical access, vendor changes to hosted systems, and service organizations. The sentence that the absence of a module is not a rationale for exclusion is simplified, since no area lacks a module.
- **4.3:** outsourced components now point to TP-SOC1 instead of being excluded.
- **6 intro:** module index with applicability notes.
- **6.3 CM-CHG:** infrastructure and patch changes stated as tested under the module; vendor-controlled changes routed to TP-SOC1.
- **8 Reporting:** added that management's own ICFR report may not carry a scope limitation (SEC Release 33-8810, II.B.5) and that each scope limitation or unresolved gap in this engagement's report is brought to management for that decision.
- **Verification register:** AS 2201.B17–.B18, .B21, .B24–.B26, AS 2601.03 and .12, and SEC Release 33-8810 section II.B.5 added, all read in the sources already on file.
- **Approvals required:** A12 counts updated; A23 to A25 added; C1 and C2 closed.

### Unchanged

Sections 1, 2, 3, 5, 7, 9, 10, 11, 12, modules 6.1 to 6.4, and Appendix A. No sample size or exception threshold was added. The rule register needs no new rule: the new modules are governed by M-04, M-05, M-09, and M-28 like the existing ones.

---

## Version 0.3.1 (2026-11-06), from version 0.3

A focused technical correction addressing seven review findings. The scope, the four control modules and their expectations and attributes, the order of authority, the risk-to-control chain, the evidence reliability rules, the two-pass review, and the approval roles are unchanged. No sample size or exception threshold was added. Not approved for use, not implemented in code, not committed.

### Corrections by finding

| # | Finding | What changed | Sections |
|---|---|---|---|
| 1 | Unsupported claim that samples below 20 cannot be statistical | The claim is removed. A sample is statistical when its design, probability selection, and statistical evaluation are all recorded; size is not a criterion. A small sample can be statistical and supports a less precise statement. The reference sizes are described as written for nonstatistical use, and a small-population statistical evaluation must use a method that accounts for population size. | 5.5 |
| 2 | Generic design expectations treated as automatically mandatory | An explicit applicability decision is added for every design expectation: necessary (the default), not necessary, or not applicable, with rationale and approval. Five safeguards stop necessary mitigation being left out, including a list of reasons that are never a rationale. Expectations and attributes are still never deleted. | 3, 5.1, 6 (intro and 6.2), 9, 10.6 |
| 3 | SEC interpretive guidance labelled as mandatory | **[R]** now covers binding text only. SEC Release 33-8810 is reclassified as adopted guidance **[A]**, and every citation of it is retagged. A short passage states what is binding from the SEC and what is not. | Tag table, 2.1, 4.1, 5.5, 7.1, 7.2 |
| 4 | Plan approval not separated from approval of design assessments and results | The four gates become five: G1 scope, G2 plan, G3 design, G4 results, G5 release. G2 approves planned procedures only; G3 approves the completed design assessment and confirms the operating test plan; G4 approves treatments and conclusions. Operating testing cannot start before G3. Replanning and reapproval triggers are listed by gate, and an approval lapses when the approved record changes. | 1.5 (new), 5.1, 5.5, 5.7, 12 |
| 5 | Deterministic validation overstated; authenticity implied from hashes or AI extraction | Each cross-check returns verified, partially verified, manual verification required, or failed, with what follows from each. Each check states its limit. A matching hash is stated to show only that a file is unchanged since intake. A value read by an AI agent is never verified by that reading. Section 10.3 is retitled and records only "indication found" or "no indication found"; nothing is recorded as authentic. Evidence references record how the value was read. | 9, 10.2, 10.3, 10.4 |
| 6 | Pending results conflicted with "exactly one evaluation treatment" | A six-stage record lifecycle is added. Completeness is enforced at submission to G4 (one current status, one proposed treatment, none pending) and at approval of G4 (one approved treatment), not earlier. Status history rules are stated. Cross-check X5 now checks completeness for the gate reached. | 5.6, 10.2 |
| 7 | Exclusions, gaps, and limitations not distinguished in reporting | The coverage map has five statuses, splitting the old "not relevant" and "gap" into excluded: not relevant, excluded: covered elsewhere, and unresolved coverage gap. Reporting has five categories, with scope exclusions, unresolved coverage gaps, and scope limitations reported separately. A gap or limitation may never be reported as an exclusion. v0.3 reported coverage gaps as scope limitations; that is corrected. | 3, 4.2, 8 |

### Rule register (section 12)

- Gate column re-mapped from four gates to five for every rule.
- **Changed:** M-03, M-04, M-05, M-09, M-12, M-13, M-14, M-15, M-16, M-17, M-18, M-19, M-22, M-23.
- **Added:** M-28 (applicability decisions) and M-29 (approval sequence and replanning). The register now has 29 rules.
- M-18's class changed from "R, A, P" to "A, P", following finding 3.
- Validator wording now refers to completeness "for the gate reached" and states that no validator records evidence as authentic.

### Worked examples

- **A.1:** cross-check results added, showing "verified" for structured exports and "manual verification required" for a PDF read by an agent.
- **A.3:** wording aligned with the record lifecycle and status history.
- **A.5:** rewritten to show the applicability decision, including a case where "not necessary" could be proposed.
- **A.7:** added, showing the two kinds of scope exclusion, an unresolved coverage gap, and a scope limitation.

### Companion files

- **Verification register:** binding-status table added (section 1a); S2 and S3 annotated; note added that no cited paragraph sets a minimum size for statistical sampling; U4 updated; U10 added.
- **Approvals required:** A2, A4, A5, A7, A10, A12, A14, A15, A17 updated; A18 to A22, B9, and D6 added; D3 and D5 updated.

---

## Version 0.3 (2026-11-06), from version 0.2

Status moved from "draft for technical review" to "draft for final technical review". Not approved for use. Not to be implemented in code until the technical review is complete.

### Retained without change of substance

- Document structure and section numbering (sections 1 to 13 and Appendix A).
- The four control modules: AC-UAR, AC-PRIV, CM-CHG, CO-JOB.
- The two-pass independent review (blind pass, then comparison pass).
- The risk-to-control chain and the ITGC coverage map.
- Evidence reliability factors and ratings; population procedures P1–P6 and their four outcomes.
- The eight-element exception evaluation record.
- The work-of-others assessment.

### Changes by review requirement

| # | Requirement | What changed | Sections |
|---|---|---|---|
| 1 | Standards hierarchy | The single **[S]** tag is split into **[R]** (applies to this engagement mode) and **[A]** (adopted voluntarily as a benchmark). All PCAOB citations moved from **[S]** to **[A]**. SEC guidance for management, and the IIA Standards where they apply, are now **[R]**. A table shows which sources bind this mode. Standards versions are selected per engagement by fiscal period. | Tag table, 2.1, 2.2 |
| 2 | Sampling | Four means of selection are now distinguished: full-population testing, targeted selection, statistical sampling, nonstatistical sampling, with what each can and cannot support. A confidence statement is allowed only where statistical sampling was declared in advance. The seven assumptions behind the confidence figures are listed, with the formula, and a 95% column added. The size table is reclassified from **[P]** to **[G]**, labelled as having no authoritative source, and offered for adoption. | 5.5 |
| 3 | Design versus operating criteria | Core rule 1 rewritten: design is judged against the risk, operation against the control as designed. Each module's "design points" became numbered design expectations, each linked to its operating attributes. An omitted activity is now a design gap to evaluate or an alternative control to test; it can no longer be dropped. "Not applicable" is limited to cases where the risk itself is absent. v0.2's wording that the Planner "drops attributes the control does not contain" and "test the variants the control description contains" is removed. UAR-F no longer begins "where the control requires it". | 1.2, 5.1, 5.2, 6 |
| 4 | Evidence limitations | Results are recorded in three separate layers: test status (never overwritten), evaluation treatment (decided by the approver), and control conclusion. The "open" status is replaced by "pending" as the absence of a status. Five evaluation treatments distinguish confirmed deviations, limitations supported by an alternative procedure, limitations treated as deviations, and unresolved limitations. The three counts are always shown separately. | 5.6, 5.7, 9 |
| 5 | Deficiency evaluation | The eight steps became a fourteen-element record adding path of effect, fraud exposure, potential magnitude, compensating-control precision, period-end impact, remediation, and the prudent-officials test. The statement that an ITGC deficiency "does not cause a misstatement directly" is removed and replaced by an indirect path and a direct path, both considered every time. Management's evaluation under SEC guidance is now cited alongside the PCAOB factors. | 7 |
| 6 | Independent review | Added seven deterministic cross-checks run by code, evidence authenticity checks, an exact source traceability rule, five safeguards against instructions hidden in evidence, and a list of matters where a human must record their own reasoning. | 10.2 to 10.6 |
| 7 | Reporting | Three categories are reported differently: deviations and deficiencies, scope limitations, and approved variations. An approved alternative procedure that gave sufficient evidence goes in a variations schedule and is not a scope limitation. v0.2 listed every approved alternative procedure under scope limitations; that is removed. | 8 |
| 8 | Standards verification | A separate register records each source, version, effective date, how it was read, status, and unresolved questions. Section 2 of the methodology now points to it. | 2.3, `standards-verification-register.md` |
| 9 | Decision hierarchy | A six-rank order of authority is added, with what each rank can and cannot do, and the roles of methodology owner and engagement approver are defined. | 1.3 |
| 10 | Practical execution | The layer table is replaced by a register of 27 mandatory rules, each with owner, required record, validator checks, approval gate, and escalation or reapproval triggers. | 12 |

### Thresholds removed or downgraded

The review asked that no new unsupported mandatory thresholds be created. These v0.2 items were changed accordingly.

| v0.2 item | v0.3 treatment |
|---|---|
| Sample size table as **[P]** minimums, enforced by a validator | Now **[G]** reference sizes. The validator checks that an approved rationale exists, not the size. |
| "3, including the last before year-end" for higher-risk quarterly controls | Replaced by "2–4, as the rationale supports". |
| Sub-sample of 25 access changes within an access review | Removed. Full population where code can test it; otherwise set in the rationale. |
| Table of default recommendations for exceptions, with counts | Replaced by considerations for judgment. The only numbers left are those in the AS 2315.41 illustration, attributed to it. |
| Default roll-forward extent ("in proportion to the remaining period") and remediation extent ("lower-risk sizes") | Removed. Both are set in an approved plan using the factors in the text. |

### Corrections found during verification

| Item | v0.2 | v0.3 |
|---|---|---|
| Experienced-auditor documentation standard | AS 1215.06 | AS 1215.06A, the paragraph number for fiscal years beginning on or after 15 December 2024 |
| Severity does not depend on whether a misstatement occurred | AS 2201.62–.63 | AS 2201.64 |
| Walkthrough procedures | Stated as always including all four procedure types | "Usually combines", matching AS 2201.37 |
| AS 1105 .07, .08, .10 | Pre-amendment text | Text as amended by PCAOB Release No. 2024-007 for fiscal years beginning on or after 15 December 2025 |
| COSO Principle 11 | Cited as a source | Paragraph-level citation removed, because the source could not be inspected |
| Verification statement | "Checked against the December 2017 compilation" | Checked against the booklet for fiscal years beginning on or after 15 December 2024, plus the 2024-007 and 2024-005 releases; details in the register |

### Other changes

- Header now names the companion files and states that external assurance is a separate mode.
- Definitions added: design adequacy, operating compliance, design expectation, operating attribute, test status, evaluation treatment, confirmed deviation, scope limitation, variation.
- Emergency changes, direct data changes, and job failures near period-end are named as normal targeted selections.
- Appendix A examples updated to the three-layer result model. Two examples added: a control description that omits a necessary activity (A.5) and text in evidence addressed to the reader (A.6).
- Section 13's list of items moved to `approvals-required.md`.

---

## Version 0.2 (2026-11-06), from version 0.1

- Rules tagged as standard, policy, or guidance; no rule produces a conclusion automatically.
- Sampling rationale per control; size table made a starting point.
- Fixed exception outcome table replaced by an eight-element evaluation.
- Four result statuses added, separating evidence limitations from exceptions.
- Population procedures given four outcomes; only "not met" blocks sampling.
- Walkthroughs required per variant; unmet design criteria treated as observations with alternative controls considered.
- Evidence reliability assessment replaced absolute screenshot and timing rules.
- Risk-to-control chain and ITGC coverage map added.
- Sections added on reporting, external auditor reliance, layers and automated checks, and worked examples.
- Corrected the misuse of the AS 2201 benchmarking paragraphs as support for testing an automated control once.

## Version 0.1 (2026-11-06)

- Initial draft covering the four control modules, sampling table, exception policy, deficiency evaluation, documentation, and two-pass review.
