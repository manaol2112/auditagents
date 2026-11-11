# SOX IT General Controls Testing Methodology

| | |
|---|---|
| **Version** | 0.1 |
| **Status** | DRAFT. Not approved for use on any engagement. |
| **Drafted** | 2026-11-06 |
| **Approved by** | Not yet approved |
| **Engagement mode** | Internal audit / advisory |
| **Coverage** | User access review, privileged access, change management, job monitoring |

Items marked **[VALIDATE]** are policy choices or references that a qualified auditor must confirm before this methodology is approved. They are collected in section 10.

---

## 1. Purpose and use

This methodology defines how IT general controls (ITGCs) are tested in support of management's assessment of internal control over financial reporting (ICFR) under Section 404 of the Sarbanes-Oxley Act.

It is the single reference the audit agents work from. For each control in scope, it determines the test procedures, the attributes tested, the sample size, the evidence requested, and how exceptions and deficiencies are handled.

Three rules apply throughout:

1. **The company's own control description sets the criteria.** Timeframes, frequencies, and approver roles are tested against what the control says. Where the control does not define them, that is a design observation, and the tester escalates instead of inventing a threshold.
2. **Agents propose, humans decide.** Agents perform procedures and recommend conclusions. Only the authorized human approver decides on exception disposition, deficiency severity, and release of deliverables.
3. **No evidence, no conclusion.** Every result must reference specific evidence. Missing evidence is an exception, never "not applicable".

## 2. Sources

PCAOB standards bind external auditors, not internal audit. This methodology adopts them as the quality benchmark so that the work can withstand external auditor scrutiny and support reliance.

| Source | Used for |
|---|---|
| Sarbanes-Oxley Act of 2002, Section 404 | Basis of the assessment |
| SEC Release No. 33-8810 (2007), interpretive guidance for management | Management's risk-based evaluation of ICFR |
| COSO Internal Control – Integrated Framework (2013), Principle 11 | General control activities over technology |
| PCAOB AS 2201, audit of ICFR | Design and operating effectiveness testing (.42–.45), risk and evidence (.46–.49), nature of tests (.50), roll-forward (.55–.56), evaluating deficiencies (.62–.70), definitions (Appendix A), benchmarking automated controls (Appendix B) |
| PCAOB AS 1105, audit evidence | Reliability of evidence; information produced by the company |
| PCAOB AS 2315, audit sampling | Sampling concepts |
| PCAOB AS 1215, audit documentation | Documentation standard (the "experienced auditor" test) |
| PCAOB AS 2605, consideration of the internal audit function | Conditions for external auditor reliance on this work |
| IIA Global Internal Audit Standards (2024, effective 9 January 2025) | Internal audit performance, supervision, and documentation |

**[VALIDATE]** All paragraph references were drafted from memory of the standards and must be checked against the current published text. AS 1105 was amended for fiscal years beginning on or after 15 December 2025, so its paragraph numbers in particular need confirming.

## 3. Definitions

| Term | Meaning |
|---|---|
| **ITGC** | A control over the IT environment that supports the continued proper operation of automated controls, reports, and data. |
| **Test of design (ToD)** | Evaluation of whether a control, if operated as described by a competent person, would address the risk. |
| **Test of operating effectiveness (ToE)** | Evaluation of whether the control operated as designed, consistently, throughout the period. |
| **Population** | The complete set of control occurrences in the test period from which samples are drawn. |
| **IPE** | Information produced by the entity: any listing, report, or extract from company systems used as evidence. |
| **Attribute** | One specific characteristic tested for each sampled item, with a pass or exception result. |
| **Exception** | A sampled item where an attribute is not met or the evidence cannot be obtained. |
| **Deficiency** | A control whose design or operation does not allow timely prevention or detection of misstatements (AS 2201 Appendix A). |

## 4. Scoping

Before any control is tested, the engagement record must establish:

1. **Systems in scope** and the reason each is financially relevant (the automated controls, key reports, or financial data it supports).
2. **Layers in scope for each system:** application, database, operating system, and supporting tools (identity management, job scheduler, ticketing, deployment pipeline).
3. **Controls in scope**, each mapped to a system, a layer, a risk, a frequency, and a control owner.
4. **Test period** and the as-of date of management's assessment (fiscal year-end).
5. **Outsourced components.** Where a service organization operates the control, the test is of the SOC 1 report and the company's complementary user entity controls, which this version does not cover.

A control that cannot be mapped to a module in section 6 is flagged to the approver. The Planner may draft procedures for it, but they require explicit approval before use.

## 5. Testing standards

### 5.1 Test of design

Performed once per control per period, through a walkthrough of one occurrence from start to finish.

The control is designed effectively only if all of the following hold:

| # | Design criterion |
|---|---|
| D1 | The control description states who performs it, what they do, how often, and what evidence is retained. |
| D2 | The control addresses the stated risk, and no significant part of the risk is left uncovered. |
| D3 | The performer has the competence and authority to perform it. |
| D4 | The performer is independent of the activity being controlled (no self-review or self-approval). |
| D5 | The information the control relies on is complete and accurate, or a control exists that ensures it. |
| D6 | Follow-up of items the control identifies is defined, including a timeframe. |
| D7 | The walkthrough occurrence was performed as the description states (implementation). |

**Inquiry and observation.** Agents cannot interview control owners or observe a process. The agent prepares the walkthrough questions; the human conducts the walkthrough or relays the questions; the answers are logged as evidence with the respondent's name, role, and date. Inquiry alone never supports a conclusion (AS 2201.50).

A control that fails design is not tested for operating effectiveness. It goes directly to deficiency evaluation.

### 5.2 Test of operating effectiveness

Test types, from least to most persuasive: inquiry, observation, inspection of evidence, re-performance. Each attribute in section 6 states its required test type. Agents perform inspection and re-performance only.

### 5.3 Populations and information produced by the entity

No sample is selected until the population is confirmed complete and accurate. For every listing or report used:

| # | Procedure |
|---|---|
| P1 | Identify the source system and confirm it is the production environment. |
| P2 | Obtain the query, parameters, or filter settings used, and confirm they do not exclude relevant records (date range, status, account type). |
| P3 | Obtain evidence of generation: who ran it, when, and the record count at source. |
| P4 | Agree the record count of the file received to the count at source. |
| P5 | Check the file for integrity: no duplicate keys, no blank key fields, dates within the period. |
| P6 | Where an independent source exists, reconcile to it (for example, user listing to HR listing; change tickets to the system change log). |

P4 and P5 are performed by code. A population that fails any step is returned to the Evidence Coordinator, and testing does not start.

**Evidence acceptability.** Screenshots must show the system name, the date and time, and the user. Emails must show the header with the sent date. Evidence created after the audit request cannot support that a control operated on time; it is recorded but does not clear an exception.

### 5.4 Sampling

**Sample sizes [VALIDATE].** No standard prescribes sample sizes. The table below reflects ranges in common use and is the proposed default.

| Control frequency | Occurrences in period | Lower risk | Higher risk |
|---|---|---|---|
| Annual | 1 | 1 | 1 |
| Quarterly | 2–4 | 2 | 2 |
| Monthly | 5–12 | 2 | 5 |
| Weekly | 13–52 | 5 | 15 |
| Daily | 53–365 | 20 | 40 |
| Multiple times per day | More than 365 | 25 | 60 |

- **Event-driven controls** (for example, changes or job failures) use the row matching the number of occurrences in the period.
- **Higher risk applies** when the system hosts key automated controls for significant accounts, the control had a deficiency in the prior period, or the system or control owner changed significantly in the period. Otherwise lower risk applies. The choice and its reason are recorded in the test plan and approved by the human approver.
- **Point-in-time tests** (for example, who holds privileged access today) cover the full population and are not sampled.
- **Automated controls** are tested once per unique configuration, provided the ITGCs over the system are effective (AS 2201 Appendix B).

**Selection.** Samples are selected at random by code, with the seed, population file hash, and selected items recorded. Haphazard or judgmental selection is not permitted. A selected item may be replaced only with a documented reason approved by the human approver.

**External auditor reliance [VALIDATE].** If the external auditor is expected to rely on this work, obtain their sample size table and use it in place of the default.

### 5.5 Exceptions

Agents never dispose of an exception. For each one, the agent:

1. **Confirms the facts** with the control owner through the human approver, to rule out a misunderstanding or missing evidence.
2. **Determines the cause** and whether it is systematic (would recur across the population) or isolated.
3. **Proposes a response** under the policy below.
4. **Documents the exception** in the workpaper, whatever the final conclusion on the control.

**Response policy [VALIDATE]:**

| Situation | Proposed response |
|---|---|
| Any systematic exception | Control is ineffective. |
| Two or more exceptions in a sample | Control is ineffective. |
| One isolated exception, annual to weekly frequency | Control is ineffective. Samples this small cannot absorb an exception. |
| One isolated exception, daily or higher frequency, tested at the lower-risk size | Extend the sample to the higher-risk size. Any further exception means the control is ineffective. |
| One isolated exception, daily or higher frequency, tested at the higher-risk size | Escalate to the human approver for decision. |

An ineffective control proceeds to deficiency evaluation (section 7).

### 5.6 Timing, roll-forward, and remediation

- **Interim testing.** When testing is performed before year-end, the remaining period is covered by inquiry about changes to the control, plus additional samples in proportion to the remaining period, with a minimum of one **[VALIDATE]**.
- **Quarterly controls.** Where timing allows, one of the two instances tested is the last instance before year-end **[VALIDATE]**.
- **Remediation.** A remediated control is retested as a new control from the remediation date. It must operate at least the lower-risk sample size number of times before year-end to be concluded effective **[VALIDATE]**. The original deficiency remains documented.

## 6. Control modules

Each module gives the risk, the control variants, design points, the population, the attributes, and the evidence to request. Attribute test types are **I** (inspection) and **R** (re-performance).

Every module ends with **escalation points**: situations where the tester must stop and ask the human approver.

---

### 6.1 User access review (module AC-UAR)

**Risk.** Users retain access that is unauthorized or no longer appropriate for their role, allowing unauthorized transactions or changes to financial data.

**Typical control.** On a periodic basis, managers or system owners review all active accounts and their access rights for the system. Inappropriate access is identified and removed on time.

**Design points (in addition to D1–D7).**
- The review covers all account types: end user, privileged, service, and shared accounts.
- The review covers every in-scope layer, or other controls cover the remaining layers.
- The listing shows access rights in a form the reviewer can understand (roles with descriptions, not codes alone).
- Reviewers know the users' job responsibilities and do not review their own access.
- If the control does not require assessing whether inappropriate access was used, record a design observation.

**Population.** The review instances in the period (for example, four quarterly reviews). Sample per section 5.4.

Within each selected review, attributes UAR-A to UAR-D are tested for the whole review. UAR-E is tested on the access changes requested in that review: all of them if 25 or fewer, otherwise a random 25 **[VALIDATE]**.

**Attributes.**

| ID | Attribute | Type |
|---|---|---|
| UAR-A | The user listing was system-generated from production, covers all account types and access rights, and passes procedures P1–P6. | R |
| UAR-B | Every account on the listing has a documented reviewer decision (keep, change, or remove). | R |
| UAR-C | Each reviewer was appropriate (manager or system owner per the control) and did not review their own access. | I |
| UAR-D | The review was completed and signed off within the timeframe the control defines. | I |
| UAR-E | Access marked for change or removal was actually changed in the system within the defined timeframe, verified against system evidence and not ticket closure alone. | R |
| UAR-F | Where the control requires it: for inappropriate access found, management assessed whether it was used during the exposure period. | I |

**Evidence to request.**
- Access review policy or procedure.
- For each selected review: the user listing as used, with the query or parameters, generation timestamp, and source record count.
- HR listing of active employees and contractors, with manager and job title.
- Reviewer assignments and sign-offs, with dates.
- The list of changes requested, the related tickets, and system evidence of the change with its date.

**Escalation points.**
- The listing was generated materially before the review started.
- Reviewer appropriateness cannot be confirmed from the HR listing.
- The review was partially completed, or completed marginally late.
- A review has had no changes requested across several cycles (possible review without scrutiny).

---

### 6.2 Privileged access (module AC-PRIV)

**Risk.** Privileged access allows a user to bypass application controls, change data directly, or alter security settings and configurations without detection.

**Control variants.** A company may have any combination. Test the variants the control description contains.

| Variant | Typical control | Population |
|---|---|---|
| Restriction | Privileged access is restricted to authorized personnel based on job responsibility. | All privileged accounts at the test date (not sampled) |
| Activity monitoring | Privileged user activity is logged and reviewed by an independent person at a set frequency. | Review instances in the period |
| Emergency access | Temporary privileged access is requested, approved, time-limited, and its activity reviewed. | All emergency access uses in the period |

**Design points.**
- "Privileged" is defined for each layer, and the definition captures every role, profile, or permission that gives administrative capability (for example, security administration, direct data update, job schedule changes, migration to production).
- Shared and default accounts are controlled (password vault, check-out, rotation).
- Logs cannot be altered by the people whose activity is logged.

**Period coverage.** A listing at one date evidences only that date. To cover the period, the tester also tests privileged accounts granted during the period (PRIV-F), or relies on provisioning and access review controls that are tested and effective.

**Attributes: restriction.**

| ID | Attribute | Type |
|---|---|---|
| PRIV-A | The privileged account listing was system-generated, passes P1–P6, and includes every role or permission meeting the definition of privileged. The tester documents how privileged roles were identified. | R |
| PRIV-B | Each account maps to a named individual, or to a documented owner for service and shared accounts. | R |
| PRIV-C | Each individual is active per the HR listing and their job function supports the need for the access. | I |
| PRIV-D | Privileged users do not hold conflicting duties (for example, a developer with production administration, or an administrator who also processes business transactions). | R |
| PRIV-E | Shared and default accounts are controlled: default accounts disabled or passwords changed, shared passwords vaulted. | I |
| PRIV-F | Privileged access granted in the period was approved by an authorized approver before it was granted. | I |

**Attributes: activity monitoring.**

| ID | Attribute | Type |
|---|---|---|
| PRIV-G | Logging was enabled for privileged accounts for the period covered by the sampled review. | I |
| PRIV-H | The review was performed on time by a person who is independent of the activity reviewed. | I |
| PRIV-I | Items identified were investigated and resolved, with the resolution documented. | I |

**Attributes: emergency access.**

| ID | Attribute | Type |
|---|---|---|
| PRIV-J | The use had a documented business reason and was approved as the control requires. | I |
| PRIV-K | Access was removed at the end of the approved window. | R |
| PRIV-L | Activity during the window was reviewed on time by an independent person. | I |

**Evidence to request.**
- Privileged access policy and the definition of privileged roles per layer.
- System-generated listing of accounts with privileged roles, with generation evidence.
- HR listing with job titles; access request and approval records for accounts granted in the period.
- Password vault configuration and shared account inventory.
- Logging configuration, log review sign-offs, and follow-up records.
- Emergency access log, approvals, and activity reviews.

**Escalation points.**
- Whether a role is privileged is unclear.
- Job function does not obviously support the access.
- A conflicting-duties combination exists with a claimed monitoring control.

---

### 6.3 Change management (module CM-CHG)

**Risk.** Unauthorized, untested, or inappropriate changes to applications, configurations, or data structures cause incorrect processing of financial data or undermine automated controls and reports.

**Typical control.** Changes to the system are documented, tested, and approved before migration to production. Developers cannot migrate their own changes to production.

**Design points.**
- All change types are covered: program code, configuration, database, infrastructure, emergency changes, vendor changes, and direct data changes.
- Development, test, and production environments are separate.
- Separation between developing and migrating is enforced by the system, or monitored.
- Emergency changes have a defined timeframe for approval after the fact.
- Where a deployment pipeline enforces approval and testing automatically, that enforcement is an automated control: test its configuration once, then test changes to that configuration.

**Population.** The population must be a system-generated list of changes actually made in production during the period (for example, a transport log, deployment history, or version control merge history).

A list from the ticketing system is not an acceptable population on its own, because it contains only changes that followed the process. If it is the only list available, the tester first reconciles the system change log to the tickets and treats any change without a ticket as an exception.

**Attributes: per sampled change.**

| ID | Attribute | Type |
|---|---|---|
| CHG-A | The production change traces to a documented change request (the system change identifier matches the ticket). | R |
| CHG-B | Testing was performed and documented before migration, in line with the nature of the change and by the party the control requires. | I |
| CHG-C | Migration was approved by an authorized approver, and the approval timestamp precedes the production implementation timestamp. | R |
| CHG-D | The person who migrated the change is not the person who developed it, and the approver is not the developer. | R |
| CHG-E | For an emergency change: the emergency procedure was followed and approval after the fact was obtained within the defined timeframe. | I |

**Attribute: full population, at the test date.**

| ID | Attribute | Type |
|---|---|---|
| CHG-F | No user has both development access and production migration access. Any overlap is covered by a monitoring control that is tested and effective. | R |

**Evidence to request.**
- Change management policy and the list of authorized approvers.
- System-generated production change log for the period, with generation evidence.
- For each sampled change: ticket, test evidence, approval with timestamp, and deployment record with timestamp and the user who deployed.
- User listings for development access and for production migration access.

**Escalation points.**
- Whether the test evidence is adequate for the nature of the change.
- Approval and migration timestamps are close together and may be in different time zones.
- The approver is not on the approver list but may have had delegated authority.
- One ticket covers several production changes without clear traceability.

---

### 6.4 Job monitoring (module CO-JOB)

**Risk.** Failures of, or unauthorized changes to, scheduled jobs and interfaces that process financial data go undetected or unresolved, leaving financial data incomplete or inaccurate.

**Control variants.**

| Variant | Typical control | Population |
|---|---|---|
| Failure resolution | Failed jobs are logged, investigated, and resolved on time. | All failures of in-scope jobs in the period, from the scheduler log |
| Daily monitoring | An operator reviews job status daily and follows up failures. | Days in the period |
| Automated alerting | The scheduler alerts the support team on failure. | Tested once per configuration |
| Schedule changes | Changes to job schedules follow change management. | Schedule changes in the period, from the scheduler audit log |

Access to the scheduler is tested under module AC-PRIV.

**Design points.**
- An inventory identifies which jobs are financially relevant and is kept current as jobs and interfaces are added.
- Resolution includes assessing the effect on downstream processing, not only rerunning the job.

**Attributes: failure resolution.**

| ID | Attribute | Type |
|---|---|---|
| JOB-A | The in-scope job inventory agrees to the scheduler configuration, and the failure log is system-generated for the full period and passes P1–P6. | R |
| JOB-B | The failure was detected and logged within the timeframe the control defines. | I |
| JOB-C | The cause and the action taken were documented. | I |
| JOB-D | The job was rerun successfully or otherwise resolved, verified against the scheduler's own completion record and not ticket closure alone. | R |
| JOB-E | Where resolution required a data correction or schedule change, it followed the applicable change procedure. | I |

**Attributes: daily monitoring.**

| ID | Attribute | Type |
|---|---|---|
| JOB-F | The review for the sampled day was performed and signed off by the assigned operator on time. | I |
| JOB-G | The failures recorded in the review agree to the failures in the scheduler log for that day. | R |
| JOB-H | Each failure on that day has a ticket or documented follow-up. | R |

**Attributes: automated alerting.**

| ID | Attribute | Type |
|---|---|---|
| JOB-I | Alerting is enabled for all in-scope jobs and sends to an appropriate, current distribution list. | I |
| JOB-J | The alert configuration was unchanged in the period, or changes followed change management. | R |

**Attribute: schedule changes.**

| ID | Attribute | Type |
|---|---|---|
| JOB-K | Each sampled schedule change traces to an approved change request, tested under CHG-A to CHG-D. | R |

**Evidence to request.**
- Job inventory with financial relevance, and the scheduler configuration export.
- System-generated job run history for the period, with generation evidence.
- Incident tickets and rerun records for sampled failures.
- Daily review checklists or sign-offs.
- Alert configuration and distribution list membership.
- Scheduler audit log of schedule changes.

**Escalation points.**
- A job appears financially relevant but is not in the inventory.
- A failure was resolved after a period-end close deadline.
- A failure was resolved by a manual data correction.

## 7. Deficiency evaluation

Severity classification is decided by the human approver. In internal audit mode the classification is ultimately management's, and the external auditor forms their own view. The Findings Evaluator prepares the analysis below and proposes a classification.

**Classifications (AS 2201 Appendix A).**

| Classification | Meaning |
|---|---|
| Control deficiency | The design or operation of the control does not allow timely prevention or detection of misstatements. |
| Significant deficiency | A deficiency, or combination, less severe than a material weakness but important enough to merit the attention of those overseeing financial reporting. |
| Material weakness | A deficiency, or combination, with a reasonable possibility that a material misstatement of the financial statements will not be prevented or detected on time. |

An ITGC deficiency does not cause a misstatement directly. Its severity is assessed through its effect on the automated controls, reports, and data that depend on the affected system.

**Evaluation steps.**

1. **Describe the deficiency:** design or operating, the control, the system and layer, and the exposure period.
2. **Identify what depends on it:** automated controls, key reports, and financial data on the affected system, and the accounts and assertions they support.
3. **Determine whether it was exploited.** For access: was the inappropriate access used? For change: did unapproved changes alter financial processing? For jobs: was financial data incomplete at a period-end?
4. **Identify compensating controls.** These must be tested, effective, and precise enough to prevent or detect the same misstatement.
5. **Assess likelihood and magnitude** of misstatement in the related accounts, using the factors in AS 2201.65–.66.
6. **Aggregate** with other deficiencies affecting the same accounts, assertions, or systems.
7. **Propose a classification** with the rationale, and note any material weakness indicator from AS 2201.69.

## 8. Documentation standard

Each control has one workpaper. It must allow an experienced auditor with no previous connection to the engagement to understand the work performed, the evidence obtained, and the conclusion reached (AS 1215), without asking the preparer.

Every workpaper contains:

- Engagement, control identifier, control description, risk, system and layer, control owner, frequency.
- Methodology version and module used.
- Test period and testing date.
- Test of design: walkthrough record, criteria D1–D7 results, conclusion.
- Population: description, source, P1–P6 results, file hash.
- Sample: size, risk level and reason, selection seed, items selected.
- Results: one row per sampled item and attribute, marked "No exception" or "Exception", each with an evidence reference (evidence identifier plus page, cell, or row).
- Exceptions: facts, cause, response, approver decision.
- Conclusion: design "Effective" or "Ineffective"; operating "Effective" or "Ineffective".
- Preparer, reviewer, approver, and dates.

## 9. Review standard

The Independent Reviewer works in two passes.

1. **Blind pass.** The reviewer receives the control, the approved test plan, the population, the sample, and the evidence, and reaches its own result for every attribute. It does not see the preparer's results.
2. **Comparison pass.** The reviewer compares its results to the preparer's. Every difference becomes a review note. The reviewer also checks the workpaper against section 8.

Review notes are resolved by the preparer and cleared by the reviewer. A note the two cannot resolve goes to the human approver. The reviewer never edits the workpaper.

## 10. Items requiring validation

| # | Item | Section |
|---|---|---|
| 1 | Paragraph references to PCAOB standards, checked against current text | 2 |
| 2 | Sample size table and the criteria for higher risk | 5.4 |
| 3 | Whether the external auditor's sample sizes replace the default | 5.4 |
| 4 | Exception response policy, including when a sample may be extended | 5.5 |
| 5 | Roll-forward sample approach | 5.6 |
| 6 | Requirement to include the last quarterly instance | 5.6 |
| 7 | Minimum operation after remediation | 5.6 |
| 8 | Sub-sample of 25 access changes within a selected access review | 6.1 |
| 9 | Attributes in each module: any missing, unnecessary, or wrongly worded | 6 |
| 10 | Deficiency evaluation steps and who holds classification authority | 7 |

**Not covered in this version:** user provisioning, user termination, authentication and password settings, system development, backup and recovery, incident management, service organization reports, and platform-specific guidance (for example, which roles are privileged in a given system).
