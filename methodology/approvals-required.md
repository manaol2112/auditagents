# Items Requiring Approval

| | |
|---|---|
| **Applies to** | SOX ITGC Testing Methodology, version 0.4.1 |
| **Prepared** | 2026-11-06 |
| **Status** | All items open |

The methodology cannot be approved for use, implemented in code, or committed while any item in parts A to C is open. Part D is confirmed on each engagement.

Items marked **(0.3.1)**, **(0.4)**, or **(0.4.1)** are new or changed in that version.

## A. Decisions for the methodology owner

| # | Decision | Section | What is proposed | Why it needs a decision |
|---|---|---|---|---|
| A1 | Name the methodology owner and the engagement approver role. | 1.3 | Roles are defined but no person or position holds them. | Every approval in the methodology depends on these roles. |
| A2 | Confirm the standards hierarchy for this engagement mode. **(0.3.1)** | 2.1 | Binding: Section 404(a), SEC rules, and IIA Standards where they apply. Adopted by choice: PCAOB standards and SEC Release 33-8810. | Decides which rules can never be varied. In 0.3 the SEC release was tagged as a requirement; it is now adopted guidance. |
| A3 | Confirm whether the IIA Standards bind the function. | 1.3, 2.1, 9, 10.6 | Rules tagged "where the IIA Standards apply" become requirements if yes. | Affects who must review and approve documentation. |
| A4 | Adopt each **[A]** rule as a mandatory internal benchmark. **(0.3.1)** | All | PCAOB-derived rules and rules following SEC Release 33-8810 are treated as mandatory within the methodology. | Neither source binds internal audit; adoption is a choice. |
| A5 | Adopt each **[P]** rule as internal policy. **(0.3.1)** | All | 29 mandatory rules are listed in section 12. | Policies have no authority until adopted. |
| A6 | Decide the status of the reference sample sizes. | 5.5 | The table is guidance only, with no authoritative source, written for nonstatistical use. | The owner may adopt it as policy with a stated basis, amend it, replace it with the external auditor's table, or leave it as guidance. |
| A7 | Decide whether statistical sampling will be used, and with what evaluation method. **(0.3.1)** | 5.5 | Both approaches are permitted. A sample is statistical when its design, probability selection, and statistical evaluation are all recorded, whatever its size. | No evaluation method is specified, including for small populations. One must be chosen, sourced, and approved before any confidence statement is made. |
| A8 | Confirm the default of full-population testing where code can test an attribute. | 5.5 | Default **[P]**. | Changes the extent of testing and what evidence is requested from the company. |
| A9 | Confirm the conditions for testing an automated control once. | 5.5 | Four conditions. | Common practice, but the conditions are this methodology's own. |
| A10 | Confirm the three-layer result model, the five evaluation treatments, and the record lifecycle. **(0.3.1)** | 5.6 | Six lifecycle stages; completeness enforced at submission to and approval of G4, not earlier; status history kept. | Fixes the data model that implementation will follow. |
| A11 | Confirm the considerations for exception recommendations. | 5.6 | Guidance only, no thresholds. | The owner may wish to add approved thresholds with a stated basis. |
| A12 | Confirm the design expectations and operating attributes in each module. **(0.4.1)** | 6 | 83 default design expectations and 87 operating attributes across thirteen modules. Each expectation is subject to an applicability decision. | These are drafted from general practice, not from a cited standard. An experienced ITGC auditor should check each one. |
| A13 | Confirm the fourteen-element deficiency evaluation record. | 7.3 | Record elements listed. | Sets what must exist before a classification can be decided. |
| A14 | Confirm report content and the five reporting categories. **(0.3.1)** | 8 | Deviations and deficiencies; scope exclusions; unresolved coverage gaps; scope limitations; approved variations. | Decides what readers are told and where. |
| A15 | Confirm the cross-checks, the four cross-check results, the authenticity indication checks, and the injection safeguards. **(0.3.1)** | 10.2 to 10.5 | Seven cross-checks, each returning verified, partially verified, manual verification required, or failed. No check establishes authenticity. | Become implementation requirements. |
| A16 | Set how the extent of human examination of clean controls is decided. | 10.6 | Set per engagement in the plan; the methodology gives no number. | The owner may prefer a standing policy. |
| A17 | Confirm the five gates and the rule register. **(0.3.1)** | 1.5, 12 | G1 scope, G2 plan, G3 design, G4 results, G5 release, plus in-flight approvals; 29 rules. | Becomes the specification for validators and approvals. |
| A18 | Confirm the applicability decision model. **(0.3.1)** | 5.1 | Three decisions (necessary, not necessary, not applicable), default necessary, decided by the engagement approver at G3. | The owner may want certain expectations designated as always necessary, or may want "not necessary" decisions reserved to the owner. Neither is in the draft. |
| A19 | Confirm that G2, G3, and G4 are passed per control. **(0.3.1)** | 1.5 | Per control, with only affected controls returned on a trigger. | This replaces the four approval points in the original workflow and adds approval effort. The owner may allow controls to be batched at a gate. |
| A20 | Confirm the replanning and reapproval triggers. **(0.3.1)** | 1.5 | Triggers listed by gate. "Materially" different population is left to judgment, with no threshold. | The owner may wish to define materiality for this purpose. |
| A21 | Decide who may resolve a "partially verified" or "manual verification required" result. **(0.3.1)** | 10.2 | A named human; not restricted to the engagement approver. | Affects workload and segregation between the person verifying and the person approving. |
| A22 | Confirm what "excluded: covered elsewhere" requires. **(0.3.1)** | 4.2 | Naming the other party and recording whether its results were obtained and considered. | The owner may require that the results always be obtained before the status can be used. |
| A23 | Technical review of modules 6.5 to 6.13 by a qualified ITGC auditor. **(0.4.1)** | 6.5 to 6.13 | Corrected in 0.4.1 against ten review findings; each now carries a classification block. | They have not been reviewed by a qualified auditor. |
| A24 | Confirm the applicability analyses for AC-PHYS and CO-BKP and the risk-based extent for DEV-SDLC. **(0.4.1)** | 6.8, 6.10, 6.11 | AC-PHYS: three-part analysis of location, effect, and shared responsibility. CO-BKP: four-point analysis of the effect of data loss on financial reporting, with no presumption. DEV-SDLC: project risk assessment sets the extent. | Each replaces a presumption with an analysis; the owner may want standing positions for common cases. |
| A25 | Confirm the TP-SOC1 risk-based approach, including gap-period coverage. **(0.4.1)** | 6.13 | A seven-point risk assessment per service organization determines the evidence; a SOC 1 Type 2 with a bridge letter is one acceptable combination, not the only one; no number of months is set for the gap. | The owner may want a standing policy on minimum evidence by service significance and on the maximum gap. |
| A27 | Confirm the six testing patterns and the record elements that differ by pattern. **(0.4.1)** | 13 | One record model with pattern-specific field groups; cross-control links as first-class records; timestamps stored with source and time zone. | This becomes the data model specification for the engine. |
| A28 | Adopt the AC-TERM deadline computation rule, including the time zone basis and the convention for date-only sources. **(0.4.1)** | 6.6 | Trigger event defined by the control plus timeframe; all timestamps normalized; convention recorded. No cited source (register U12). | The rule decides what counts as a late disablement. |
| A29 | Decide whether a report under a framework other than SOC 1 may serve as evidence about ICFR-relevant controls, and on what conditions. **(0.4.1)** | 6.13 | Treated as a recorded judgment on the report's content against the risk assessment. No source inspected (register U11). | Affects most software-as-a-service providers, many of which issue only SOC 2 reports. |
| A30 | Confirm the three-case treatment of a missing direct-change log and the list of approved alternative population sources. **(0.4.1)** | 6.9 | Design failure, population incompleteness, evidence limitation, decided per path by the engagement approver. | Determines whether a missing log is reported as a deficiency, a limitation, or neither. |
| A31 | Confirm the list of independent sources for incident completeness and whether any are mandatory. **(0.4.1)** | 6.12 | The sources used are recorded with reasons for any available source not used; none is mandatory. | The owner may require specific sources whenever they exist. |
| A26 | Confirm the reporting rule that each scope limitation and unresolved gap is brought to management for its own ICFR decision. **(0.4)** | 8 | Rests on SEC Release 33-8810 II.B.5; the rule text was not inspected. | Determines how limitations in this engagement's report interact with management's report. |

## B. Verification gaps to close

These are the unresolved questions in `standards-verification-register.md`.

| # | Gap | Register reference |
|---|---|---|
| B1 | Read the live PCAOB standards pages and confirm every cited paragraph matches the current text. | U1 |
| B2 | Check for a PCAOB booklet for fiscal years beginning on or after 15 December 2025. | U2 |
| B3 | Confirm how the amendments effective 15 December 2026 apply to engagements straddling that date. | U3 |
| B4 | Read the SEC rules on management's evaluation and the SEC definitions of material weakness and significant deficiency. **(0.3.1)** These rules are now the only SEC text tagged as binding, and they have not been inspected. | U4 |
| B5 | Check for SEC guidance later than Release 33-8810. | U5 |
| B6 | Confirm the IIA Standards' effective date and check IIA Topical Requirements relevant to IT controls. | U7 |
| B7 | Confirm the current text of 15 U.S.C. 7262. | U8 |
| B8 | Have a qualified person re-perform the register. It was prepared by an AI agent and has not been checked by a human. | Register header |
| B9 | If statistical sampling will be used, select and inspect an authoritative source for the evaluation method. **(0.3.1)** | U10 |

## C. Matters outside this version that need a decision before real use

| # | Matter | Section |
|---|---|---|
| C1 | Closed in 0.4: modules now exist for every area. Review is item A23. | 4.2 |
| C2 | Closed in 0.4: module TP-SOC1. Review is item A23. | 6.13 |
| C3 | Platform-specific guidance, such as which roles are privileged in each system in use. | 6.2 |
| C4 | A methodology for the external assurance mode, if it will ever be used. | 2.1 |
| C5 | Clearance to process company evidence with AI, and disclosure of AI use to the external auditor where reliance is intended. | 11 |

## D. Confirmed on each engagement

| # | Matter | Gate |
|---|---|---|
| D1 | Engagement mode, fiscal period, as-of date, and standards versions. | G1 |
| D2 | The internal control framework management has designated. | G1 |
| D3 | Coverage map status for every area of every in-scope system, with a rationale for each exclusion. **(0.3.1)** | G1 |
| D4 | Whether the external auditor intends to rely on the work. | G1 |
| D5 | Planned procedures and selection rationale for every control. **(0.3.1)** | G2 |
| D6 | Applicability decisions, design conclusion, and the confirmed operating test plan for every control. **(0.3.1)** | G3 |
