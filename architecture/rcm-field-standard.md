# RCM field standard (draft v0.2)

Status: draft for review by a qualified auditor. Covers business process controls (BPCs), management review controls, IT application controls (ITACs), information produced by the entity (IPE), and IT general controls (ITGCs) in one RCM. Derived from the SOX ITGC methodology v0.4.1 and from what the planning engine needs to plan without inventing anything; to be cross-checked against the audit-standards research in progress (PCAOB AS 2201, AS 1105, AS 2110; SEC Release 33-8810; COSO 2013; IIA and ISACA guidance) and against platform field models (Optro, formerly AuditBoard; Workiva; ServiceNow; Archer; Diligent HighBond).

Changes from v0.1: adds the process hierarchy (entity, process, sub-process), significant accounts and assertions, a control category that distinguishes BPC, ITAC, ITDM, ITGC, and entity-level controls, category-specific mandatory fields, an IPE inventory, and explicit dependency links (BPC to IPE, BPC and ITAC to system, system to ITGC).

## How to read this

- **M (mandatory):** the control cannot be planned without it. A missing value is a blocking intake finding raised to the client as a request; no agent fills it.
- **C (conditionally mandatory):** mandatory when the stated condition holds.
- **R (recommended):** a missing value becomes a walkthrough question, not a blocker.
- **E (engagement-side):** produced by the auditor or the engine; recognized in an upload, never required from the client.

The RCM describes the client's control environment and is stored as a dated version under the client; it is uploaded through an engagement, which supplies the period, entities, systems, and scope.

## 1. Structure

One RCM, nine tabs. Each tab is a list with stable keys; the Controls tab references the others by key. An export from another tool (one wide sheet, or several) is normalized into this structure by the mapping agent.

| Tab | One row per | Required |
|---|---|---|
| Header | RCM | M |
| Entities | legal entity, business unit, or location in scope | M |
| Processes | process and sub-process | M |
| Accounts | significant account or disclosure, with its relevant assertions | M when the RCM has business process controls or ITACs |
| Systems | application or platform | M |
| IPE | report, query, or spreadsheet that a control relies on | M when any control relies on one |
| Risks | risk (business "what could go wrong" or IT risk) | M |
| Controls | control | M |
| Service organizations | outsourced service and its SOC report, with CUECs | M when any service is outsourced |

Many-to-many links (risk to control, control to IPE, control to system, ITAC to ITGC) may be given as separated IDs in one cell, repeated rows, or a separate mapping tab; all three normalize to the same links.

```
Entity ── Process ── Sub-process ── Risk (WCGW, assertion, account) ── Control
                                                                        │  BPC (manual / ITDM / review)
                                                                        │  ITAC (automated)
                                                                        │  ITGC
                                                                        ├── relies on IPE ── produced by System
                                                                        └── operates in System ── supported by ITGCs
```

## 2. Header

| # | Field | Req | Notes |
|---|---|---|---|
| H1 | Client | M | Matches the engagement's client. |
| H2 | RCM as-of date / version | M | Drives roll-forward and the changed-since-prior-year comparison. |
| H3 | Fiscal period covered | M | Must cover the engagement period. |
| H4 | Prepared by | M | |
| H5 | Approved by and date | R | Management approval of the RCM. |
| H6 | Source | R | "Optro Controls Management export", "Workiva", "client Excel", "auditor template". Selects the column-mapping profile. |

## 3. Entities

| # | Field | Req | Notes |
|---|---|---|---|
| N1 | Entity ID | M | |
| N2 | Entity name | M | Legal entity, business unit, region, or location. Optro deploys one library control to many entities; the same control ID may appear per entity. |
| N3 | Type | R | Legal entity, business unit, location, shared service center. |
| N4 | In scope for this period | R | The engagement's scoping decision governs. |

## 4. Processes

| # | Field | Req | Notes |
|---|---|---|---|
| P1 | Process ID | M | |
| P2 | Process name | M | For example Order to Cash, Procure to Pay, Record to Report, Payroll, Fixed Assets, Inventory, Treasury, Tax, Financial Close and Reporting, IT General Controls. |
| P3 | Sub-process ID and name | M | For example Order to Cash: Credit Management, Billing, Cash Receipts, Revenue Recognition. ITGCs use the ITGC domain as the process and the module as the sub-process. |
| P4 | Process owner | R | |
| P5 | Narrative / flowchart reference | R | The document that describes the process; ingested alongside the RCM. |

## 5. Accounts and assertions

| # | Field | Req | Notes |
|---|---|---|---|
| A1 | Account ID | M | |
| A2 | Significant account or disclosure | M | Financial statement caption or account group (for example Revenue, Accounts Receivable, Inventory). |
| A3 | Relevant assertions | M | Existence or occurrence; Completeness; Valuation or allocation; Rights and obligations; Presentation and disclosure. (Some frameworks split accuracy, cut-off, and classification; the mapping agent maps them onto these.) |
| A4 | Processes that affect it | M | P1 keys. |
| A5 | Materiality / significance basis | R | Why the account is significant; the auditor's scoping governs. |

## 6. Systems

| # | Field | Req | Notes |
|---|---|---|---|
| S1 | System ID | M | |
| S2 | System name | M | |
| S3 | Financial relevance | M | Processes, accounts, ITACs, and IPE that depend on it: the reason it is in scope for ITGCs. |
| S4 | Technology layers | M | Application, database, operating system, network, identity provider, each named. |
| S5 | Hosting / delivery model | M | On-premises, IaaS, PaaS, SaaS. |
| S6 | Service organization | C | Mandatory when outsourced: provider (key to the Service organizations tab). |
| S7 | System owner and IT owner | R | |
| S8 | Interfaces and batch jobs | R | Relevant to financial data (CO-JOB). |

## 7. IPE (information produced by the entity)

A report, query, extract, or spreadsheet that a control uses to perform its work, or that the auditor uses as evidence. The auditor must obtain evidence that it is complete and accurate (AS 1105.10). IPE is a first-class record because one report is often used by several controls, and its reliability depends on the ITGCs over the system that produces it.

| # | Field | Req | Notes |
|---|---|---|---|
| I1 | IPE ID | M | |
| I2 | Report name | M | As the system or the user knows it. |
| I3 | Source system | M | S1 key. |
| I4 | Report type | M | Standard (system-delivered, unmodified); Custom (developed or modified report); Query / ad hoc (user-run with parameters); End-user computing (spreadsheet or tool maintained outside the system). The type determines how completeness and accuracy are tested and which ITGCs it depends on. |
| I5 | Parameters / criteria | C | Mandatory for queries and parameterized reports: the parameters used when it is run. |
| I6 | Data source | R | Tables, modules, or upstream systems the report draws from. |
| I7 | Used by controls | M | Control keys. A report used by no control is not IPE for the RCM. |
| I8 | Client's control over its completeness and accuracy | C | Mandatory for custom reports, queries, and spreadsheets: how management ensures it is complete and accurate (for example a reconciliation to the ledger, a change control over the report logic). |
| I9 | Report owner | R | |
| I10 | Last changed | R | Changes to report logic in the period, which bring it under CM-CHG. |

## 8. Risks

| # | Field | Req | Notes |
|---|---|---|---|
| K1 | Risk ID | M | |
| K2 | Risk statement | M | Business: what could go wrong in the process, for example "Revenue is recognized before goods are shipped." IT: for example "Users retain access that is no longer appropriate." |
| K3 | Risk category | M | Business process (risk of material misstatement) or IT (ITGC). |
| K4 | Process / sub-process | M | P1 / P3 keys. ITGC risks use the ITGC domain and module. |
| K5 | Accounts and assertions affected | C | Mandatory for business process risks: A1 keys and the assertions at risk. |
| K6 | ITGC domain and methodology module | C | Mandatory for IT risks. Domain: Access to programs and data; Program change; Program development; Computer operations. Module: one of the thirteen methodology modules. |
| K7 | Systems affected | C | Mandatory for IT risks; recommended for business risks. |
| K8 | Likelihood and magnitude (inherent rating) | R | Assessed before considering controls (AS 2110.59). The auditor's own assessment governs; the client's rating is an input. |
| K9 | Fraud risk | R | Yes / No (AS 2110.65 to .71). |
| K10 | Significant risk | R | Yes / No (AS 2110.71); drives more persuasive evidence. |

## 9. Controls

### 9a. Fields for every control

| # | Field | Req | Allowed values / notes |
|---|---|---|---|
| C1 | Control ID | M | Unique within the RCM (Optro: unique within its component) and stable across years. |
| C2 | Control title | R | |
| C3 | Control category | M | Business process control (manual); IT-dependent manual control (ITDM); IT application control (ITAC, automated); IT general control (ITGC); Entity-level control. Determines which section below applies. |
| C4 | Control description | M | Who performs it, what they do, when / how often, how (system, report, or tool used), and what evidence is retained (design criterion D1). The engine checks each element; a missing one is a design finding, never completed by an agent. |
| C5 | Control objective | R | |
| C6 | Entity / entities | M | N1 keys. |
| C7 | Process and sub-process | M | P1 / P3 keys. |
| C8 | Risk(s) addressed | M | K1 keys. |
| C9 | Control type | M | Preventive; Detective. |
| C10 | Nature | M | Manual; IT-dependent manual; Automated. Must be consistent with C3. |
| C11 | Frequency | M | Annual; Semi-annual; Quarterly; Monthly; Weekly; Daily; Multiple times per day; Event-driven (per occurrence); Continuous (automated). |
| C12 | Key control | M | Yes / No. (Optro holds this as control weight; the mapping agent maps it.) |
| C13 | Control owner | M | |
| C14 | Performer | C | Mandatory when different from the owner. |
| C15 | Evidence of performance | M | Artifact and where it is kept. |
| C16 | System(s) | C | Mandatory for ITDM, ITAC, and ITGC controls: S1 keys (and layer for ITGCs). |
| C17 | IPE relied on | C | Mandatory when the control uses a report, query, or spreadsheet: I1 keys. |
| C18 | Service organization involvement | C | Mandatory when part of the control is performed by a third party. |
| C19 | Status and effective date | C | Active / New / Changed / Retired; the date is mandatory when not Active. |
| C20 | Policy / procedure reference | R | |
| C21 | Prior-year deficiency | R | |

### 9b. Business process controls (manual and ITDM)

| # | Field | Req | Notes |
|---|---|---|---|
| B1 | Accounts and assertions addressed | M | A1 keys with assertions; normally inherited from the risk, confirmed per control. |
| B2 | What is reviewed or matched | M | For example "three-way match of PO, receipt, and invoice", "credit limit approval above USD 50,000". |
| B3 | Criteria / thresholds | C | Mandatory when the control applies a threshold or tolerance (approval limits, match tolerances). |
| B4 | Reviewer / approver and segregation | C | Mandatory for review and approval controls: role, and independence from the preparer. |
| B5 | Population | C | Mandatory for transaction-level controls: what one occurrence is and where all occurrences are recorded. |
| B6 | IT dependency | C | Mandatory for ITDM: the system function or report the manual step depends on (and so the ITGCs that must be effective). |

### 9c. Management review controls (a BPC subtype: reviews of estimates, analytics, reconciliations, results)

| # | Field | Req | Notes |
|---|---|---|---|
| R1 | Review objective | M | What the review is designed to detect, tied to the risk and assertion (Staff Audit Practice Alert No. 11). |
| R2 | Level of precision | M | Level of aggregation or disaggregation, consistency of performance, and correlation to the assertions, so the review would detect a misstatement that matters (Alert No. 11 precision factors). |
| R3 | Expectation / criteria | M | What the reviewer expects (budget, prior period, independent calculation), how it is formed, and how predictable it is. |
| R4 | Investigation threshold | M | The amount or percentage above which differences are investigated. |
| R5 | Investigation and resolution | M | The steps taken on items above the threshold and how their resolution is evidenced. |
| R6 | Data and reports used | M | IPE keys (I1); the reviewer's reliance on them brings them under AS 1105.10. |

### 9d. IT application controls (automated)

| # | Field | Req | Notes |
|---|---|---|---|
| T1 | ITAC type | M | Configuration / edit check (for example a mandatory field, a tolerance); Calculation (for example depreciation, interest, revenue allocation); Interface / data transfer (completeness of transfer); Automated workflow / approval (for example system-enforced approval routing); Access-based segregation (a system restriction on who can do what); Automated report (see IPE). |
| T2 | System, module, and configuration location | M | S1 key, and where the logic lives (transaction, configuration table, program, workflow). |
| T3 | Logic / configuration description | M | What the system does, precisely enough to test with one instance: the rule, the parameter values, the calculation. |
| T4 | Accounts and assertions addressed | M | A1 keys. |
| T5 | Supporting ITGCs | M | Control keys of the ITGCs over the system (at least program change and access to the configuration). An ITAC is relied on only if these are effective. |
| T6 | Baseline / benchmark | R | Date the configuration was last tested and whether it changed since; supports the auditor's benchmarking strategy. |
| T7 | Configurable by | R | Roles that can change the configuration (links to AC-PRIV). |

### 9e. IT general controls

| # | Field | Req | Notes |
|---|---|---|---|
| G1 | ITGC domain | M | Access to programs and data; Program change; Program development; Computer operations. |
| G2 | Methodology module | M | One of the thirteen modules; proposed by the mapping agent when the client uses its own taxonomy, confirmed by a person. |
| G3 | Systems and layers covered | M | S1 keys and layers. |
| G4 | Population source | C | Mandatory for event-driven ITGCs: the system log or record listing every occurrence. A ticket list alone does not establish completeness. |
| G5 | Operating criteria | C | The client-stated values the tests use, by module: review completion timeframe; removal or change timeframe; approver and approval timing; testing requirement; segregation rule; emergency procedure and timeframe; configuration parameters (authentication, backup, alerting); detection or resolution timeframe. Missing ones are recorded as "not defined by control" with a design finding. |
| G6 | Supported ITACs, ITDMs, and IPE | R | The reverse of T5 and B6: what relies on this ITGC (the reason it matters to ICFR). |

### 9f. Entity-level controls

| # | Field | Req | Notes |
|---|---|---|---|
| L1 | COSO component and principle | R | Control environment, risk assessment, control activities, information and communication, monitoring; principle 1 to 17. |
| L2 | Precision | R | Whether it operates precisely enough to address a risk directly, or is indirect. |

### 9g. Engagement-side fields (recognized, not required)

| # | Field | Req |
|---|---|---|
| E1 | Walkthrough / test of design result | E |
| E2 | Test procedures and attributes | E |
| E3 | Sample size and means of selection | E |
| E4 | Test results, deficiencies, conclusion (human only) | E |
| E5 | Reliance on others' work | E |

## 10. Service organizations

| # | Field | Req | Notes |
|---|---|---|---|
| V1 | Service organization | M | |
| V2 | Services and systems | M | S1 keys. |
| V3 | SOC report | M | Type 1 / Type 2 / none; period; opinion; carve-out or inclusive subservice organizations. |
| V4 | CUECs and mapped client controls | M | Each complementary user entity control with the client control key that addresses it. |
| V5 | Bridge letter / gap coverage | C | Mandatory when the report period does not reach the as-of date. |

## 11. The mandatory core, by control category

| Category | Mandatory |
|---|---|
| Every control | ID, category, description (who, what, when, how, evidence), entity, process and sub-process, risk(s), type, nature, frequency, key, owner, evidence |
| Business process (manual / ITDM) | plus accounts and assertions, what is reviewed or matched; thresholds, reviewer and segregation, population, IT dependency when applicable; IPE when used |
| Management review | plus level of precision, investigation threshold, expectation, follow-up evidence, data and reports used |
| ITAC | plus ITAC type, system and configuration location, logic description, accounts and assertions, supporting ITGCs |
| ITGC | plus domain, module, systems and layers; population source and operating criteria when applicable |
| IPE (per report) | ID, name, source system, type, used by controls; parameters for queries; the client's completeness-and-accuracy control for custom reports, queries, and spreadsheets |
| Risk | ID, statement, category, process; accounts and assertions for business risks; domain, module, and systems for IT risks |
| System | ID, name, financial relevance, layers, hosting; service organization when outsourced |

## 12. Integrity checks the engine applies on import

| Check | Result when it fails |
|---|---|
| Mandatory or applicable conditional field missing | Blocking intake finding for that record; client request generated. |
| Description lacks who, what, when, how, or evidence | D1 design finding per missing element; walkthrough question. |
| Category and nature disagree (for example ITAC marked Manual) | Finding for a person to resolve; neither value is changed. |
| Business risk with no control, or control with no risk | Coverage finding (a risk unaddressed; a control without purpose). |
| Assertion at risk with no key control addressing it | Coverage finding for the account and assertion. |
| ITAC or ITDM with no supporting ITGC, or a system supporting ITACs / IPE with no ITGCs | Dependency finding: reliance on the automated control or report is not supported. |
| IPE used by a key control with no completeness-and-accuracy approach | IPE finding. |
| Outsourced system with no SOC report or CUEC mapping | Service organization finding. |
| Value outside a picklist (for example frequency "periodically") | Proposed normalization shown with the original text; a person confirms; never coerced silently. |
| Ambiguous header | Mapped by values as well as header: "Control Type" means manual / automated in Diligent HighBond, Technical / Process in Archer, and preventive / detective in many client RCMs. |
| Fields held as name / value pairs | Pivoted before mapping (for example HighBond `customAttributes_n_term` / `_value`, where "Assertions" or "IPE" is a value, not a header). |
| Unrecognized column | Kept as a client attribute; the mapping agent proposes a field with reason and confidence; a person confirms once per client template. |

## 13. Standards basis

No auditing standard prescribes an RCM or its columns. Each mandatory field is justified by something the auditor must identify or evaluate; the RCM is where the client supplies it. Status: [STD] stated in a standard; [STAFF] PCAOB staff guidance; [PRACTICE] common practice; [INFERENCE] derived.

| Field(s) | Basis | Status |
|---|---|---|
| Significant accounts and disclosures (A2) | AS 2201.28 to .29 | STD |
| Relevant assertions (A3); picklist of five | AS 2201.28; AS 1105.11 | STD |
| Risk statement, what could go wrong (K2) | AS 2201.30 | STD |
| Likelihood, magnitude, fraud and significant-risk flags (K8 to K10) | AS 2110.59, .65 to .71 | STD |
| Risk-to-control links, many to many (C8) | AS 2201.39 to .40 | STD |
| Nature, frequency, manual or automated, reliance on ITGCs, performer competence (C10, C11, C13, C14, T5, B6) | AS 2201.47; SEC 33-8810 section II.B.1 | STD |
| Preventive or detective (C9); manual, automated, IT-dependent (C10) | SEC 33-8810 footnotes 30, 34 to 36 | STD |
| ITGC domains (G1) | SEC 33-8810 (program development, program changes, computer operations, access to programs and data) | STD |
| Who, what, when, information used, objective, investigation (C4, R1 to R6) | Staff Audit Practice Alert No. 11 | STAFF |
| IPE: report, source, completeness and accuracy, query logic, IT controls over it (I1 to I10, C17) | AS 1105.10 (amended by PCAOB Release 2024-007, effective for fiscal years beginning on or after 15 December 2025); Alert No. 11; PCAOB Spotlight on data and reports (April 2024) | STD / STAFF |
| Test types (E2): inquiry, observation, inspection, re-performance | AS 2201.50 | STD |
| Frequency picklist (C11) | No standard enumerates frequencies | PRACTICE |
| Technology layers (S4, G3) | IIA GAIT methodology | PRACTICE |
| Control ID, owner, evidence location, key flag, status | Needed to plan, test, and roll forward | PRACTICE |

## 14. What the engine does with each category today

The importer, the integrity checks, and the dependency links apply to every category. Planning (procedures, criteria, populations, coverage) exists only for ITGCs, because the methodology v0.4.1 covers ITGCs. Planning business process controls, management review controls, ITACs, and IPE needs a methodology extension: design expectations and operating attributes for each (for example three-way match, management review precision, ITAC benchmarking, IPE completeness and accuracy), approved the same way the ITGC modules were. Until then those controls are imported, validated, linked, and shown, with their ITGC dependencies driving ITGC scoping.

## 15. Open questions for review

- Whether control objective (C5) and risk rating (K8) should be mandatory.
- Whether the engagement's assertion list should be the five AS 2201 assertions or a firm list with accuracy, cut-off, and classification separated.
- Whether entity-level controls are in the RCM or a separate matrix.
- The exact Optro Controls Management field names and export columns (not publicly documented); the known API structure is Region, Process, Subprocess, Control (`id`, `name`, `uid`), with library controls deployed to entities. To be confirmed from a client export or Optro support, then added as a mapping profile.
