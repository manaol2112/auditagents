# SOX IT General Controls Testing Methodology

| | |
|---|---|
| **Version** | 0.2 |
| **Status** | DRAFT FOR TECHNICAL REVIEW. Not approved for use on any engagement. |
| **Drafted** | 2026-11-06 |
| **Supersedes** | Version 0.1 (kept in `archive/`) |
| **Approved by** | Not yet approved |
| **Engagement mode** | Internal audit / advisory |
| **Coverage** | User access review, privileged access, change management, job monitoring. This is not complete ITGC coverage (see section 4.2). |

## How to read the rules

Every rule in this document belongs to one of three classes.

| Tag | Class | Meaning |
|---|---|---|
| **[S]** | Standard | Taken from a cited standard. Cannot be varied on an engagement. |
| **[P]** | Policy | An internal default. It applies unless the approver records a variation with a rationale. Each policy needs adoption by the methodology owner before this document is approved. |
| **[G]** | Guidance | Helps an agent form a recommendation. Never binding and never an automatic outcome. |

Items marked **[VALIDATE]** need confirmation by a qualified auditor and are collected in section 13.

---

## 1. Purpose and decision authority

This methodology defines how IT general controls (ITGCs) are tested in support of management's assessment of internal control over financial reporting (ICFR) under Section 404 of the Sarbanes-Oxley Act. It is the single reference the audit agents work from.

Three rules apply throughout:

1. **The company's own control description sets the criteria.** Timeframes, frequencies, and approver roles are tested against what the control says. Where the control does not define them, that is a design observation, and the tester escalates. **[P]**
2. **Agents propose, humans decide.** No rule in this document produces an audit conclusion automatically. Thresholds and default responses are starting points for a recommendation. **[P]**
3. **No evidence, no conclusion.** Every result references specific evidence. **[P]**

**Who decides what [P].**

| Matter | Agent | Human approver |
|---|---|---|
| Results of checks performed by code (counts, reconciliations, date comparisons) | Records | Sees through review |
| Attribute results on sampled items | Proposes; Reviewer re-performs | Approves with the control conclusion |
| Scope, the ITGC coverage map, and treatment of gaps | Proposes | Decides |
| Sampling rationale and sample size | Proposes | Decides |
| Alternative procedures and "not applicable" outcomes | Proposes | Decides |
| Disposition of every exception and evidence limitation | Proposes | Decides |
| Design and operating conclusions | Proposes | Decides |
| Deficiency classification | Proposes | Decides |
| Release of workpapers and reports | None | Decides |

## 2. Sources and verification status

PCAOB standards bind external auditors, not internal audit. This methodology adopts them as the quality benchmark.

| Source | Used for | Paragraphs relied on |
|---|---|---|
| Sarbanes-Oxley Act of 2002, Section 404 | Basis of the assessment | |
| SEC Release No. 33-8810 (2007) | Management's risk-based evaluation of ICFR | |
| COSO Internal Control – Integrated Framework (2013) | General control activities over technology | Principle 11 |
| PCAOB AS 2201, audit of ICFR | Using the work of others; walkthroughs; design and operating tests; risk and evidence; deviations; roll-forward; deficiencies; benchmarking | .16–.19, .37–.38, .42–.50, .55–.56, .62–.70, .A3, .A7, .A11, .B28–.B33 |
| PCAOB AS 2315, audit sampling | Sampling in tests of controls | .31–.43 |
| PCAOB AS 1105, audit evidence | Relevance and reliability; information produced by the company | .06–.10 |
| PCAOB AS 1215, audit documentation | Documentation standard | .06 |
| PCAOB AS 2605, internal audit function | External auditor's consideration of internal audit work | .09–.11, .18–.26 |
| IIA Global Internal Audit Standards (2024, effective 9 January 2025) | Internal audit performance and supervision | |

**Verification status [VALIDATE].** The PCAOB paragraph references above were checked against PCAOB's own compilation, "Auditing Standards as of December 14, 2017". Later amendments have not been checked, because PCAOB's website blocks automated access. Known changes to confirm:

- **AS 1105** was amended, reportedly for fiscal years beginning on or after 15 December 2025.
- **AS 2315** has a version listed on PCAOB's site as effective 15 December 2026.
- **AS 1215 and AS 2201** may carry conforming amendments from later rulemaking.

The SEC, COSO, and IIA references have not been checked against source text.

## 3. Definitions

| Term | Meaning |
|---|---|
| **ITGC** | A control over the IT environment that supports the continued proper operation of automated controls, reports, and data. |
| **Test of design** | Evaluation of whether a control, operated as prescribed by a person with the necessary authority and competence, would meet the control objective (AS 2201.42). |
| **Test of operating effectiveness** | Evaluation of whether the control operated as designed and the performer had the necessary authority and competence (AS 2201.44). |
| **Population** | The complete set of control occurrences in the test period. |
| **IPE** | Information produced by the entity: any listing, report, or extract from company systems used as evidence. |
| **Attribute** | One specific characteristic tested for each selected item. |
| **Deviation** | A selected item where the control did not operate as prescribed. Called an **exception** once confirmed. |
| **Evidence limitation** | A selected item that cannot be tested because evidence is unavailable or unreliable. |
| **Tolerable rate** | The maximum rate of deviation the tester would accept and still conclude the control is effective (AS 2315.34). |
| **Deficiency** | A control whose design or operation does not allow timely prevention or detection of misstatements (AS 2201.A3). |

## 4. Scoping and traceability

### 4.1 Risk-to-control chain

Each ITGC in scope must trace through the chain below. A control that cannot be traced is not tested until the approver resolves it. **[P]**

1. **Financial reporting element:** the significant account or disclosure and the relevant assertion.
2. **IT dependency:** the automated control, key report, interface, or financial data that supports it.
3. **System and layer:** the application, database, operating system, or supporting tool where the dependency lives.
4. **ITGC:** the control that protects the dependency, with its risk, frequency, and owner.

This chain is what later allows a deficiency to be evaluated (section 7).

### 4.2 ITGC coverage map

The four modules in this version do not make up complete ITGC coverage. For every in-scope system, the Planner prepares a coverage map across all domains, and the approver decides the treatment of each cell. **[P]**

| Domain | Area | Module in this version |
|---|---|---|
| Access | Provisioning and access changes | None |
| Access | Termination and transfer | None |
| Access | Authentication and password settings | None |
| Access | Periodic access review | AC-UAR |
| Access | Privileged access | AC-PRIV |
| Change | Program and configuration change | CM-CHG |
| Change | Direct data change | Partly, under CM-CHG |
| Operations | Job scheduling and monitoring | CO-JOB |
| Operations | Backup and recovery | None |
| Operations | Incident management | None |
| Development | System development and data migration | None |

Each cell takes one status:

- **Tested under a module** in section 6.
- **Tested under an engagement-specific procedure** approved by the approver.
- **Not relevant**, with the reason.
- **Gap**, with the approved treatment (for example, covered by another function's testing, or reported as not covered).

No engagement-level statement about a system is issued while any cell lacks an approved status. Gaps are disclosed in the report (section 8). **[P]**

### 4.3 Other scoping records

- **Test period** and the as-of date of management's assessment.
- **Process variants:** locations, teams, or tools that perform the same control differently.
- **Significant changes in the period:** system replacements, migrations, or changes of control owner.
- **Outsourced components.** Where a service organization operates the control, the relevant test is of the SOC 1 report and the complementary user entity controls, which this version does not cover.

## 5. Testing standards

### 5.1 Design assessment and walkthroughs

**Minimum procedure [P].** At least one walkthrough per control per period. An additional walkthrough is performed for each of the following, unless the approver records why it is unnecessary:

- Each materially different variant of the control (different tool, team, or location).
- Each significant change to the control or its system during the period.
- Each system, where one control description covers several systems that operate it differently.

**What a walkthrough includes [S].** Following one occurrence from start to finish using the same records and systems company personnel use, with inquiry, observation, inspection, and re-performance, and with questions that go beyond the single occurrence (AS 2201.37–.38).

**Design criteria [P].** The Tester assesses each criterion and records what was found.

| # | Design criterion |
|---|---|
| D1 | The control description states who performs it, what they do, how often, and what evidence is retained. |
| D2 | The control addresses the stated risk, at a level of precision that would prevent or detect the problem. |
| D3 | The performer has the competence and authority to perform it. |
| D4 | The performer is independent of the activity being controlled. |
| D5 | The information the control relies on is complete and accurate, or a control exists that ensures it. |
| D6 | Follow-up of items the control identifies is defined, including a timeframe. |
| D7 | The walkthrough occurrence was performed as the description states. |

**An unmet criterion is not an automatic design failure.** It is a design observation. The Tester then considers whether an alternative control achieves the same objective, and tests that control if so. A company with limited staff, for example, may address a missing segregation of duties through a sufficiently precise independent review (AS 2201.42, Note). **[S]** The approver decides the design conclusion.

**Inquiry and observation.** Agents cannot interview people or observe a process. The agent prepares the questions; the human conducts the walkthrough; the answers are logged as evidence with the respondent's name, role, and date. **[P]** Inquiry alone does not support a conclusion about a control (AS 2201.50, Note). **[S]**

A control concluded as not designed effectively is not tested for operating effectiveness and proceeds to section 7. **[P]**

### 5.2 Nature of tests

From least to most persuasive: inquiry, observation, inspection of documentation, re-performance (AS 2201.50). **[S]** Each attribute in section 6 states its test type. Agents perform inspection and re-performance.

### 5.3 Evidence reliability

Evidence is not accepted or rejected on its format. The Tester assesses each item of evidence against the factors below and records the assessment. **[S]** for the factors (AS 1105.07–.09); **[P]** for the ratings.

| Factor | Question |
|---|---|
| Relevance | Does it bear directly on the attribute, and does it relate to the right date or period? |
| Source | Was it generated by a system, or prepared by a person? Is the source independent of the control performer? |
| Directness | Was it obtained directly from the system, or passed through someone who could alter it? |
| Form | Is it the original record, or a copy, screenshot, or re-typed extract? |
| Controls over it | Are the controls over the underlying system and data effective? |
| Authenticity | Are there signs of alteration, inconsistency, or missing context (system, date, account)? |

**Ratings.**

| Rating | Meaning | Use |
|---|---|---|
| Reliable | Sufficient for the attribute on its own. | Supports a result. |
| Needs corroboration | Relevant but not sufficient alone. | Supports a result only together with other evidence. |
| Not reliable | Cannot support the attribute. | Recorded; the item becomes an evidence limitation. |

**Evidence produced after the event [G].** Two cases are treated differently:

- **System records extracted later** that carry their original timestamps (logs, audit trails, ticket histories) are normal evidence, subject to section 5.4.
- **Documents written after the event** to show that a control was performed (a sign-off added later, a memo of recollection) can corroborate but ordinarily do not, alone, show the control operated on time. The Tester escalates these.

Where there are signs a document is not authentic or has been altered, the Tester stops and escalates (AS 1105.09). **[S]**

### 5.4 Populations and information produced by the entity

When a listing or report from the company is used as evidence, its accuracy and completeness must be tested, or the controls over them tested, and it must be precise and detailed enough for the purpose (AS 1105.10). **[S]**

The procedures below are the default way to meet that requirement. **[P]**

| # | Procedure |
|---|---|
| P1 | Identify the source system and confirm it is the production environment. |
| P2 | Obtain the query, parameters, or filter settings and confirm they do not exclude relevant records. |
| P3 | Obtain evidence of generation: who ran it, when, and the record count at source. |
| P4 | Agree the record count of the file received to the count at source. |
| P5 | Check file integrity: no duplicate keys, no blank key fields, dates within the period. |
| P6 | Reconcile to an independent source, where one exists. |

Each procedure takes one outcome:

| Outcome | Meaning |
|---|---|
| Met | Performed as written, no issue. |
| Met by alternative procedure | The procedure could not be performed as written, and an approved alternative gave equivalent assurance (for example, observing the extract being re-run, or reconciling to a second independent source when a source count is unavailable). |
| Not applicable | The procedure does not fit this population, with the reason (for example, no independent source exists for P6). |
| Not met | A substantive concern about completeness or accuracy remains. |

No sample is selected while any procedure is **Not met**. "Met by alternative procedure" and "Not applicable" need approver approval. **[P]** P4 and P5 are performed by code.

### 5.5 Testing strategy and sampling

**Sampling rationale [P].** Before testing, the Planner records a sampling rationale for each control in the test plan. The approver approves it with the plan. It states:

1. **Objective:** what the test is meant to show.
2. **Population:** definition, size, period, and relevant characteristics (variants, volume changes).
3. **Risk associated with the control**, using the factors in AS 2201.47, including the nature of the control, its frequency, its reliance on other controls, changes in volume or personnel, history of errors, and the judgment it involves.
4. **Tolerable rate and expected deviations**, and the other evidence that supplements the sample (AS 2315.31, .34, .38).
5. **Whether sampling applies at all.** It generally does not apply to tests of segregation of duties (AS 2315.32), and is unnecessary where code can test the whole population.
6. **Planned extent:** the size, how the period is covered, and the selection method.

More evidence is needed as the risk associated with the control increases (AS 2201.46). **[S]**

**Default starting sizes [P] [VALIDATE].** No standard prescribes sample sizes. The table gives minimum starting points for the rationale. It does not replace the rationale, and the approver may require more.

| Control frequency | Occurrences in period | Lower risk | Higher risk |
|---|---|---|---|
| Annual | 1 | 1 | 1 |
| Quarterly | 2–4 | 2 | 3, including the last before year-end |
| Monthly | 5–12 | 2 | 5 |
| Weekly | 13–52 | 5 | 15 |
| Daily | 53–365 | 20 | 40 |
| Multiple times per day | More than 365 | 25 | 60 |

**What these sizes can support [G].** For large populations, a sample with zero deviations supports roughly the following, which the rationale should compare to the tolerable rate:

| Sample size, zero deviations | True deviation rate is unlikely to exceed (about 90% confidence) |
|---|---|
| 20 | 11% |
| 25 | 9% |
| 40 | 6% |
| 60 | 4% |

Samples below 20 are not statistical. They rest on covering a meaningful share of a small population, together with the design test and other evidence. The rationale must say so explicitly.

**Full-population testing [P].** Where the population is structured data and an attribute can be tested by code, the whole population is tested. Where an attribute needs judgment and the population is too large to test in full, the approver may approve sampled coverage with a rationale.

**Automated controls [P].** An automated control may be tested with one occurrence per unique configuration only when the rationale records all of the following:

- The control is entirely automated, and each variant or configuration is identified and tested.
- The files, tables, and parameters it depends on are identified and their integrity considered (AS 2201.B30).
- The ITGCs over program change, access, and operations for that system are tested and effective for the period.
- Changes to the control or its configuration during the period are identified and tested.

Carrying a prior period's test forward without re-testing (benchmarking, AS 2201.B28–.B33) is a separate strategy with its own conditions and is not used in this version. **[P]**

**Selection.** Every item must have a chance of selection, across the whole period (AS 2315.39). **[S]** Samples are selected at random by code, with the seed, population file hash, and selected items recorded. A selected item is replaced only with a documented reason approved by the approver. **[P]**

### 5.6 Test results, exceptions, and evidence limitations

**Result statuses [P].** Each selected item and attribute takes one status.

| Status | Meaning |
|---|---|
| No exception | Reliable evidence shows the attribute was met. |
| Exception | Evidence shows the control did not operate as prescribed for this item. |
| Unable to test | Evidence is unavailable or not reliable, and it is not yet known whether the control operated. |
| Open | Awaiting evidence or a response. A control cannot be concluded while any item is open. |

**Evidence limitations.** For an item that is unable to test, the Tester first proposes alternative procedures. If neither the planned nor an alternative procedure can be applied, the Tester records the reason, and the item is ordinarily treated as a deviation when the sample is evaluated (AS 2315.40). **[S]** The approver decides the treatment.

**Exception evaluation [P].** For every exception, the Tester prepares the record below. Agents never dispose of an exception.

| # | Element |
|---|---|
| 1 | **Facts:** what was expected, what was found, with evidence references, confirmed with the control owner. |
| 2 | **Nature:** not performed, performed late, performed incompletely, performed by the wrong person, or not evidenced. |
| 3 | **Cause:** for example misunderstanding, carelessness, staffing change, system limitation, or intent (AS 2315.42). |
| 4 | **Isolated or systematic,** with the evidence for that view. An assertion that it is isolated is not enough. |
| 5 | **Exposure:** what could have gone wrong, on which system, for how long, and whether it did. |
| 6 | **Rate:** the deviation rate in the sample against the tolerable rate, and the risk that the true rate is higher (AS 2315.41). |
| 7 | **Wider effect:** on other controls, other systems, and the planned testing (AS 2201.48). |
| 8 | **Options and recommendation:** conclude not effective, extend testing, or conclude effective with a stated rationale. |

A control does not have to operate without any deviation to be considered effective (AS 2201.48, Note). **[S]** Equally, deviations are judged on their nature and cause as well as their number (AS 2315.42). **[S]**

**Default recommendations [G] [VALIDATE].** These shape the Tester's recommendation. They are not outcomes.

| Situation | Default recommendation |
|---|---|
| The deviation is systematic or intentional | Not effective. Consider the wider implications. |
| The sample deviation rate exceeds the tolerable rate | Not effective. |
| One deviation in a small sample (annual to weekly controls) | Not effective, because one deviation is a high rate in a sample this small, unless other evidence supports a different view. |
| One isolated deviation in a sample of 20 or more that was planned with none expected | Extend to the next size and evaluate the combined sample, or conclude with a stated rationale. |
| Two or more deviations in a sample of 20 or more | Not effective. AS 2315.41 gives the example that two or more deviations in 60 may indicate unacceptably high sampling risk at a 5% tolerable rate. |

### 5.7 Control conclusion

The Tester proposes, the Reviewer re-performs, and the approver decides. **[P]**

| Conclusion | When |
|---|---|
| Effective | Design is effective, all items are resolved, and the results support the planned level of assurance. |
| Not effective | Design is not effective, or the evaluated results do not support effective operation. |
| Unable to conclude | Evidence limitations prevent a conclusion. This is reported as a scope limitation, never as effective. |

Controls with no exceptions and no limitations may be approved together at the reporting gate. Any control with an exception, limitation, alternative procedure, or unmet design criterion is approved individually.

### 5.8 Timing, roll-forward, and remediation

**Roll-forward.** When testing is done before year-end, the additional evidence needed depends on the control and its risk, the results and sufficiency of the interim evidence, the length of the remaining period, and whether controls changed significantly since the interim date (AS 2201.55–.56). **[S]** The Planner records a roll-forward plan addressing those factors. Default starting point: inquiry about changes, plus additional samples in proportion to the remaining period. **[G]** **[VALIDATE]**

**Remediation [P].** A remediated control is tested under a remediation-specific plan approved by the approver. The plan considers the risk associated with the control, its frequency, the nature of the original failure, and how many times the control can operate before year-end. The original deficiency stays documented. Default starting point for extent: the lower-risk sizes in section 5.5. **[G]** **[VALIDATE]**

## 6. Control modules

Each module gives the risk, variants, design points, population, attributes, evidence to request, and escalation points. Attribute types are **I** (inspection) and **R** (re-performance).

The attributes are the default set for the typical control. **[P]** The Planner maps them to the company's actual control description, drops attributes the control does not contain, adds attributes for features it does contain, and the approver approves the result.

---

### 6.1 User access review (module AC-UAR)

**Risk.** Users retain access that is unauthorized or no longer appropriate for their role, allowing unauthorized transactions or changes to financial data.

**Typical control.** On a periodic basis, managers or system owners review all active accounts and their access rights for the system. Inappropriate access is identified and removed on time.

**Design points.**
- The review covers all account types: end user, privileged, service, and shared.
- The review covers every in-scope layer, or other controls cover the rest.
- The listing shows access in a form the reviewer can understand.
- Reviewers know the users' responsibilities. Where a reviewer's own access is in the listing, someone else reviews it, or an alternative control addresses it.
- If the control does not require assessing whether inappropriate access was used, record a design observation.

**Population.** The review instances in the period. Within each selected review, UAR-A to UAR-D are tested for the whole review. UAR-E is tested on the access changes requested: all of them if 25 or fewer, otherwise a random 25. **[P]** **[VALIDATE]**

**Attributes.**

| ID | Attribute | Type |
|---|---|---|
| UAR-A | The user listing was system-generated from production, covers all account types and access rights, and meets section 5.4. | R |
| UAR-B | Every account on the listing has a documented reviewer decision. | R |
| UAR-C | Each reviewer was appropriate under the control, and no reviewer certified their own access. | I |
| UAR-D | The review was completed and signed off within the timeframe the control defines. | I |
| UAR-E | Access marked for change or removal was changed in the system within the defined timeframe, verified against system evidence and not ticket closure alone. | R |
| UAR-F | Where the control requires it: for inappropriate access found, management assessed whether it was used. | I |

**Evidence to request.**
- Access review policy or procedure.
- For each selected review: the listing as used, with query or parameters, generation timestamp, and source record count.
- HR listing of active employees and contractors, with manager and job title.
- Reviewer assignments and sign-offs, with dates.
- Changes requested, related tickets, and system evidence of each change with its date.

**Escalation points.**
- The listing was generated materially before the review started.
- Reviewer appropriateness cannot be confirmed.
- The review was partly completed or completed marginally late.
- No changes were requested across several cycles.

---

### 6.2 Privileged access (module AC-PRIV)

**Risk.** Privileged access allows a user to bypass application controls, change data directly, or alter security settings without detection.

**Control variants.** Test the variants the control description contains.

| Variant | Typical control | Population |
|---|---|---|
| Restriction | Privileged access is restricted to authorized personnel based on job responsibility. | All privileged accounts at the test date |
| Activity monitoring | Privileged activity is logged and reviewed by an independent person at a set frequency. | Review instances in the period |
| Emergency access | Temporary privileged access is requested, approved, time-limited, and reviewed. | Emergency access uses in the period |

**Design points.**
- "Privileged" is defined for each layer and captures every role or permission that gives administrative capability.
- Shared and default accounts are controlled.
- Logs cannot be altered by the people whose activity is logged.

**Coverage.** For the restriction variant, PRIV-A, PRIV-B, and PRIV-D are tested by code over the full population. PRIV-C, PRIV-E, and PRIV-F need judgment and are tested over the full population by default; the approver may approve sampled coverage for a large population (section 5.5).

**Period coverage.** A listing at one date evidences only that date. The rationale states how the rest of the period is covered: testing accounts granted during the period (PRIV-F), a second listing at another date, or reliance on provisioning and access review controls that are tested and effective.

**Attributes: restriction.**

| ID | Attribute | Type |
|---|---|---|
| PRIV-A | The privileged account listing was system-generated, meets section 5.4, and includes every role or permission meeting the definition of privileged. The Tester documents how those roles were identified. | R |
| PRIV-B | Each account maps to a named individual, or a documented owner for service and shared accounts. | R |
| PRIV-C | Each individual is active per the HR listing and their job function supports the access. | I |
| PRIV-D | Privileged users do not hold conflicting duties, or an alternative control addresses the conflict. | R |
| PRIV-E | Shared and default accounts are controlled. | I |
| PRIV-F | Privileged access granted in the period was approved by an authorized approver before it was granted. | I |

**Attributes: activity monitoring.**

| ID | Attribute | Type |
|---|---|---|
| PRIV-G | Logging was enabled for privileged accounts for the period covered by the sampled review. | I |
| PRIV-H | The review was performed on time by a person independent of the activity reviewed. | I |
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
- HR listing with job titles; request and approval records for access granted in the period.
- Password vault configuration and shared account inventory.
- Logging configuration, log review sign-offs, and follow-up records.
- Emergency access log, approvals, and activity reviews.

**Escalation points.**
- Whether a role is privileged is unclear.
- Job function does not obviously support the access.
- A conflicting-duties combination exists with a claimed alternative control.

---

### 6.3 Change management (module CM-CHG)

**Risk.** Unauthorized, untested, or inappropriate changes cause incorrect processing of financial data or undermine automated controls and reports.

**Typical control.** Changes are documented, tested, and approved before migration to production. Developers cannot migrate their own changes.

**Design points.**
- All change types are covered: code, configuration, database, infrastructure, emergency, vendor, and direct data changes.
- Development, test, and production environments are separate.
- Separation between developing and migrating is enforced by the system, monitored, or addressed by an alternative control.
- Emergency changes have a defined timeframe for approval after the fact.
- Where a deployment pipeline enforces approval and testing automatically, that enforcement is an automated control and is tested under section 5.5.

**Population.** The population should be a system-generated list of changes actually made in production (for example a transport log, deployment history, or merge history).

A ticketing system list contains only changes that followed the process, so it cannot show completeness alone. If it is the only list available, the Tester proposes an alternative procedure under section 5.4, normally reconciling a system change log or object modification dates to the tickets. A production change with no ticket is a deviation to evaluate.

**Attributes: per sampled change.**

| ID | Attribute | Type |
|---|---|---|
| CHG-A | The production change traces to a documented change request. | R |
| CHG-B | Testing was performed and documented before migration, in line with the nature of the change and by the party the control requires. | I |
| CHG-C | Migration was approved by an authorized approver, and the approval precedes the production implementation. | R |
| CHG-D | The person who migrated the change is not the developer, and the approver is not the developer, or an alternative control addresses it. | R |
| CHG-E | For an emergency change: the emergency procedure was followed and approval after the fact was obtained within the defined timeframe. | I |

**Attribute: full population, at the test date.** Sampling does not apply (AS 2315.32).

| ID | Attribute | Type |
|---|---|---|
| CHG-F | No user has both development access and production migration access, or the overlap is covered by a monitoring control that is tested and effective. | R |

**Evidence to request.**
- Change management policy and the list of authorized approvers.
- System-generated production change log for the period, with generation evidence.
- For each sampled change: ticket, test evidence, approval with timestamp, and deployment record with timestamp and deploying user.
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
| Failure resolution | Failed jobs are logged, investigated, and resolved on time. | Failures of in-scope jobs in the period, from the scheduler log |
| Daily monitoring | An operator reviews job status daily and follows up failures. | Days in the period |
| Automated alerting | The scheduler alerts the support team on failure. | Automated control, section 5.5 |
| Schedule changes | Changes to job schedules follow change management. | Schedule changes in the period, from the scheduler audit log |

Access to the scheduler is tested under AC-PRIV.

**Design points.**
- An inventory identifies which jobs are financially relevant and is kept current.
- Resolution includes assessing the effect on downstream processing.

**Attributes: failure resolution.**

| ID | Attribute | Type |
|---|---|---|
| JOB-A | The in-scope job inventory agrees to the scheduler configuration, and the failure log is system-generated for the full period and meets section 5.4. | R |
| JOB-B | The failure was detected and logged within the timeframe the control defines. | I |
| JOB-C | The cause and the action taken were documented. | I |
| JOB-D | The job was rerun successfully or otherwise resolved, verified against the scheduler's completion record and not ticket closure alone. | R |
| JOB-E | Where resolution required a data correction or schedule change, it followed the applicable change procedure. | I |

**Attributes: daily monitoring.**

| ID | Attribute | Type |
|---|---|---|
| JOB-F | The review for the sampled day was performed and signed off by the assigned operator on time. | I |
| JOB-G | The failures recorded in the review agree to the scheduler log for that day. | R |
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

The approver decides classification. In internal audit mode the classification is ultimately management's, and the external auditor forms their own view. The Findings Evaluator prepares the analysis and proposes a classification. **[P]**

**Classifications [S].**

| Classification | Meaning |
|---|---|
| Control deficiency | The design or operation of the control does not allow timely prevention or detection of misstatements (AS 2201.A3). |
| Significant deficiency | A deficiency, or combination, less severe than a material weakness but important enough to merit the attention of those overseeing financial reporting (AS 2201.A11). |
| Material weakness | A deficiency, or combination, with a reasonable possibility that a material misstatement will not be prevented or detected on time (AS 2201.A7). |

Severity depends on whether there is a reasonable possibility of a misstatement and on its potential magnitude, not on whether a misstatement occurred (AS 2201.62–.63). **[S]**

An ITGC deficiency does not cause a misstatement directly. Its severity is assessed through the risk-to-control chain in section 4.1. **[G]**

**Evaluation steps [P].**

1. **Describe the deficiency:** design or operating, the control, system and layer, and the exposure period.
2. **State the root cause.**
3. **Identify what depends on it,** from the chain in section 4.1: automated controls, key reports, data, accounts, and assertions.
4. **Determine whether it was exploited.** For access: was the inappropriate access used? For change: did unapproved changes alter financial processing? For jobs: was financial data incomplete at a period-end?
5. **Identify compensating controls.** These must be tested, effective, and precise enough to prevent or detect the same misstatement (AS 2201.68).
6. **Assess likelihood and magnitude** using the factors in AS 2201.65–.66.
7. **Aggregate** with other deficiencies affecting the same accounts, assertions, or systems.
8. **Propose a classification** with the rationale, and note any indicator from AS 2201.69.

## 8. Reporting

In this engagement mode the report presents the results of testing. It does not express an opinion on ICFR. **[P]**

The report contains:

- **Scope:** systems, layers, controls, period, and the methodology version.
- **Coverage map:** the status of every domain for each system, with gaps stated plainly.
- **Control-level results:** design and operating conclusion for each control, with sample size and number of exceptions.
- **Exceptions and deficiencies:** facts, cause, exposure, proposed classification, and management's response where obtained.
- **Scope limitations:** every control concluded "unable to conclude" and every approved alternative procedure.
- **Open matters** at the report date.

Every statement in the report traces to an approved workpaper, and the report is generated from workpaper data, not rewritten. **[P]** A report is a draft until the approver releases it.

## 9. Documentation standard

Each control has one workpaper. It must let an experienced auditor with no previous connection to the engagement understand the nature, timing, extent, and results of the procedures, the evidence obtained, and the conclusions reached, and see who performed and reviewed the work and when (AS 1215.06, adopted as the benchmark). **[P]**

Every workpaper contains:

- Engagement, control identifier and description, risk, system and layer, owner, frequency.
- The risk-to-control chain for the control.
- Methodology version, module, and the approved attribute set.
- Test period and testing dates.
- Design assessment: walkthrough records, D1–D7 findings, alternative controls considered, conclusion.
- Population: description, source, P1–P6 outcomes, file hash.
- Sampling rationale, size, selection seed, items selected.
- Results: one row per item and attribute, with status, what was expected, what was observed, the evidence reference, and the evidence reliability rating.
- Exception evaluations and evidence limitations, with the approver's decisions.
- Conclusions for design and operation.
- Preparer, reviewer, approver, and dates.

## 10. Review standard

The Independent Reviewer works in two passes. **[P]**

1. **Blind pass.** The Reviewer receives the control, the approved test plan, the population, the sample, and the evidence, and reaches its own status for every item and attribute. It does not see the preparer's results or reasoning.
2. **Comparison pass.** The Reviewer compares results. Every difference becomes a review note. The Reviewer also checks the workpaper against section 9 and checks that each **[S]** and **[P]** rule in this methodology was followed or has an approved variation.

Review notes are answered by the preparer and cleared by the Reviewer. A note the two cannot resolve goes to the approver with both positions stated. The Reviewer never edits the workpaper.

## 11. Use of this work by an external auditor

Using the external auditor's sample sizes does not establish reliance. The external auditor decides the extent to which they use this work, based on their own assessment of: **[S]**

- **Competence and objectivity** of the people who performed it (AS 2201.18; AS 2605.09–.11).
- **Risk associated with the control.** The higher the risk, the more the auditor does their own work (AS 2201.19).
- **Quality and effectiveness of the work,** which the auditor evaluates and tests (AS 2605.24–.26).

Where reliance is intended, the engagement record includes a work-of-others assessment prepared before testing starts. **[P]** It covers:

1. Which controls the external auditor may rely on, and their risk.
2. The external auditor's expectations for extent, timing, and documentation.
3. Who performs and who supervises the work, their qualifications, and their reporting line.
4. How AI agents are used and how their work is reviewed, disclosed to the external auditor.

## 12. Layers, decisions, and automated checks

| Layer | Section | Decided by | Automated checks before the work can advance |
|---|---|---|---|
| Risk-to-control mapping | 4 | Approver | Every control has a complete chain; every coverage map cell has an approved status. |
| Design assessment | 5.1 | Approver | A walkthrough record exists for each variant; D1–D7 each have a finding; unmet criteria have an evaluation. |
| Evidence assessment | 5.3, 5.4 | Tester; approver for alternatives | Every evidence item has a hash and a reliability rating; P1–P6 each have an outcome; no "Not met". |
| Testing strategy | 5.5 | Approver | A sampling rationale exists with all six elements; size is at or above the default, or a variation is approved. |
| Execution | 5.6, 6 | Tester, then Reviewer | Every item and attribute has a status, an expected and observed value, and an evidence reference; no "Open". |
| Evaluation | 5.6, 5.7, 7 | Approver | Every exception has a complete evaluation and a recorded decision. |
| Review | 10 | Reviewer, then approver | The blind pass was completed before the comparison; all review notes are cleared or decided. |
| Reporting | 8 | Approver | Every report statement traces to an approved workpaper; gaps and limitations are included. |

## 13. Items requiring validation or adoption

| # | Item | Section |
|---|---|---|
| 1 | PCAOB references against current text, including amendments after December 2017 | 2 |
| 2 | SEC, COSO, and IIA references | 2 |
| 3 | Adoption of each **[P]** rule as internal policy | All |
| 4 | Default starting sample sizes, including 3 for higher-risk quarterly controls | 5.5 |
| 5 | Conditions for testing an automated control once | 5.5 |
| 6 | Default recommendations for exceptions | 5.6 |
| 7 | Roll-forward and remediation starting points | 5.8 |
| 8 | Sub-sample of 25 access changes within an access review | 6.1 |
| 9 | Attribute sets in each module | 6 |
| 10 | Deficiency evaluation steps | 7 |
| 11 | Report content for this engagement mode | 8 |
| 12 | Work-of-others assessment content | 11 |

---

## Appendix A. Worked examples

These are illustrations with invented facts. **[G]**

### A.1 A test with no exception (CHG-C)

- **Expected:** approval by an authorized approver before production implementation.
- **Observed:** change request CR-1042 approved by the application owner, who is on the approver list, on 4 March 2026 at 14:10 UTC. The deployment log shows implementation on 4 March 2026 at 19:32 UTC.
- **Evidence:** ticket export, row 212 (reliable: system-generated, obtained directly); deployment log, row 88 (reliable); approver list, page 2 (needs corroboration: a maintained document, agreed to the HR listing).
- **Status:** No exception.

### A.2 A confirmed exception (UAR-E)

- **Expected:** access marked for removal is removed in the system within the control's five business days.
- **Observed:** in the first-quarter review, the reviewer marked one user for removal on 12 April 2026. The ticket was closed on 14 April. The system listing of 30 June shows the account active, with a last login of 2 June.
- **Status:** Exception.
- **Evaluation:** nature, not performed; ticket closure was taken as completion. Cause to be confirmed with the administrator. Whether it is isolated is tested by checking every other removal from that review in the system. Exposure: the account kept posting access for about eleven weeks and was used, so activity in that window must be examined.
- **Recommendation:** not effective, because one deviation in a quarterly sample is a high rate and the access was used. The approver decides.

### A.3 An item that cannot be tested (JOB-D)

- **Expected:** the scheduler's completion record shows the failed job was rerun successfully.
- **Observed:** the incident ticket says the rerun succeeded on 9 February 2026. The scheduler keeps run history for 90 days, and the record no longer exists.
- **Status:** Unable to test.
- **Alternative procedure proposed:** inspect the load record in the receiving system for 9 February, with its timestamp and record count, agreed to the sending system's batch total.
- **Outcome if the alternative is approved and met:** No exception, recorded as met by alternative procedure, with a design observation that log retention is shorter than the audit period.
- **Outcome if no alternative is available:** the reason is recorded and the item is ordinarily treated as a deviation in evaluating the sample (AS 2315.40). The approver decides.

### A.4 A review challenge (PRIV-C)

- **Preparer's result:** No exception. An IT Operations Analyst holds the database administrator role; the preparer judged the job title consistent with the access.
- **Reviewer's blind result:** Exception. The privileged access policy limits that role to the Database Administration team, and the HR listing places the user in a different team.
- **Review note:** the results differ, and the preparer did not test against the policy's own criterion.
- **Resolution:** the preparer maintains that the user provides out-of-hours database support. The note is not resolved between them and goes to the approver with both positions. The approver asks the control owner for the on-call arrangement and its approval, and decides the status on that evidence.
