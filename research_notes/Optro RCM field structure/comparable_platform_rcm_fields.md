# RCM Field Names and Data Models in GRC/SOX Platforms Comparable to Optro (AuditBoard, Workiva, ServiceNow IRM, Archer, Diligent HighBond, SAP Process Control)

Research date: 2026-11-07. Each item is labeled **DOCUMENTED** (cited vendor or other source) or **INFERRED** (reasoned from cited material or general knowledge; not confirmed). Field names in `code` or "quotes" are as the source spells them.

How much each vendor publishes (this decides how far the notes can be trusted):
- **Diligent HighBond / Diligent One:** the most detail. Public bulk-import column specs with exact camelCase names.
- **ServiceNow:** public form-field tables with picklist values. These are form labels, not column (dictionary) names.
- **Workiva, AuditBoard, Archer:** most field-level docs sit behind a customer login (HTTP 403 on fetch) or are only in a "Data Dictionary" handed out by the vendor.
- **MetricStream:** not researched (no time budget left). Treat it as a full gap.

Important side finding: auditboard.com SOXHUB URLs now redirect to optro.ai. So "Optro" is probably the AuditBoard rebrand, and AuditBoard is the subject platform, not a peer. See Q1 under AuditBoard.

---

## Q1. What are the documented control and risk fields on each platform, and how are the objects arranged (process, sub-process, risk, control, test)?

### Takeaway
Only Diligent HighBond publishes exact import column names (`controlId`, `title`, `description`, `frequency`, `controlType`, `preventDetect`, `owner`, `objectiveId`, `riskId`, `impact`, `likelihood`…). ServiceNow publishes form labels: Number, Name, Description, Control Objective, Entity, Owner, Key control, Classification, Type, Category, Frequency, Enforcement. Workiva's ICFR solution documents column labels (Location, Owner, Process, Sub-process, Significance, Frequency, Auto/Manual, Preventive/Detective). Archer documents only application and section names. For AuditBoard/SOXHUB I found no public field-level documentation. None of the platforms publicly documents field names for assertions, accounts, IPE/key reports, fraud flag or ITGC domain. Those are almost always custom attributes or configuration-dependent.

### Cited Findings

**Diligent HighBond / Diligent One Platform (Projects > Objectives > Risks/Controls > tests)**
- DOCUMENTED. HighBond has been renamed "Diligent One Platform". help.highbond.com redirects to help.diligentoneplatform.com, and the `highbond.com` API endpoints stay supported until December 16, 2026 — [Diligent API docs](https://docs-apis.highbond.com/); [Diligent One bulk import controls](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_controls.htm)
- DOCUMENTED. **Columns in the controls bulk-import template** (exact names): `referenceId`, `objectiveId`, `title`, `description` (rich text/HTML), `controlId` ("Reference number or code for the control"), `owner` (name or email, for non-platform users), `ownerUser` (UID or email of a platform user; overrides `owner`), `frequency`, `method`, `controlType`, `preventDetect` (prevent / detect / not applicable), `status`, `position`, `entities` (comma-separated entity IDs), `customAttributes_n_term` / `customAttributes_n_value` — [Diligent One: Bulk importing controls](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_controls.htm)
- DOCUMENTED. **Test-related columns in the same controls template:** `control_test_plan_testingMethod`, `control_test_plan_testSteps` (rich text: "Steps or attributes for the test plan"), `control_test_plan_totalSampleSize`, `walkthrough_walkthroughResults`, `walkthrough_controlDesign` (Boolean: True = Passes, False = Fails), `controlTests_n_notApplicable`, `controlTests_n_sampleSize`, `controlTests_n_testingResults`, `controlTests_n_testingConclusion` (Boolean), `controlTests_n_assignedUserId`. Control tests repeat up to four times (`controlTests_1`…`controlTests_4`) — [Diligent One: Bulk importing controls](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_controls.htm)
- DOCUMENTED. **Columns in the risks bulk-import template:** `referenceId`, `objectiveId`, `title`, `description`, `riskId` ("reference number or code for the risk"), `impact`, `likelihood`, `position`, `entities`, `customAttributes_n_term/value`, `customFactors_n_term/value` (custom risk-scoring factors) — [Diligent One: Bulk importing risks](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_risks.htm)
- DOCUMENTED. Hierarchy: controls and risks each belong to an **Objective** (`objectiveId`). Controls belong to the project or framework picked when the template is downloaded. The template is generated on the fly, so its columns depend on the project/framework and org configuration — [Diligent One: Bulk importing controls](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_controls.htm)
- DOCUMENTED, third-party source. An unofficial Python SDK (highbond-sdk on PyPI) shows API control fields in snake_case: `frequency`, `control_type`, `prevent_detect`, `owner`. It says that for "Internal Control" workflow projects, frequency, control_type and prevent_detect are required — [highbond-sdk 0.0.4 (PyPI)](https://pypi.org/project/highbond-sdk/0.0.4/) (community project, not vendor docs)
- INFERRED. In HighBond the "Objective" is the process / sub-process level of a SOX RCM. Projects can relabel it (e.g. "Process", "Section", "Cycle"). This comes from general product knowledge; the fetched pages did not document the relabeling.

**ServiceNow IRM / GRC (Policy and Compliance + Risk Management)**
- DOCUMENTED. Controls live in table `sn_compliance_control`, which extends Item `[sn_grc_item]` — [ServiceNow: Tables installed with GRC](https://www.servicenow.com/docs/r/aUYojakX2btrvRdtS_~doA/8LrEi06_WKmOPXEFlHZmWg); [Components installed with Policy and Compliance Management](https://www.servicenow.com/docs/r/yokohama/governance-risk-compliance/policy-and-compliance-management/r_InstallWPolAndCompl.html)
- DOCUMENTED. Control objectives are stored in `sn_compliance_policy_statement`, which also holds the compliance score (community answer) — [ServiceNow Community](https://www.servicenow.com/community/grc-forum/compliance-or-non-compliance-of-control-impact-the-compliance/m-p/2615350)
- DOCUMENTED. **Control form fields (Brazil release, page updated Sept 10, 2026):** Name; Number ("unique ID number"); Entity; Inherit from control objective; Control Objective; Owning group; Owner; Key control; Weighting; Status (Compliant, Non-compliant, Not applicable); State (Draft, Attest, Review, Monitor, Retired); Exempt; Enforcement (Mandated, Voluntary); Category; Type; Classification (Preventive, Corrective, Detective, IT Impact Zone); Frequency; Description; Additional Information; Attestation; Attestation respondents; Attestation frequency; Additional comments; Entity based access restriction — [ServiceNow: Create a control](https://www.servicenow.com/docs/r/governance-risk-compliance/policy-and-compliance-management/t_CreateAControl.html)
- DOCUMENTED. "Controls are specific implementations of a control objective". A control can be generated automatically for each entity of the objective's entity type, or created by hand — [ServiceNow: Manage controls (Zurich)](https://www.servicenow.com/docs/r/zurich/governance-risk-compliance/grc-compliance-management-workspace/manage-controls-ws.html); [ServiceNow GRC search results, Create a control](https://www.servicenow.com/docs/r/aUYojakX2btrvRdtS_~doA/y1DWnDBJ03KqyZYJU18_xw)
- DOCUMENTED. **Control objective form fields (Australia release, TPRM context):** Name, Source, Source ID, Reference, Parent, Compliance Score Percentage, Active, Creates controls automatically, Category, Classification (Preventive, Corrective, Detective), Type, Attestation, Issue group rule, Description, Functional domain — [ServiceNow: Control objectives form](https://www.servicenow.com/docs/r/Z61H6JNUJXKe8NNPQzK7MQ/aP~2QUBpT6pgCWxV18pViQ)
- DOCUMENTED. **Risk statement fields:** Name, Description, Reference, Category, Type, Classification, Attestation. Changing any of these resets linked controls and risks to Draft. Risk appetite fields: Next review date, Overall appetite status, Override qualitative risk appetite. Default scores include Inherent SLE and Inherent ARO — [ServiceNow: Create a risk statement](https://www.servicenow.com/docs/r/aUYojakX2btrvRdtS_~doA/79IDfsi2fktCE4AzeHRGXw); [Risk appetite fields on the Risk Statement form](https://www.servicenow.com/docs/r/aUYojakX2btrvRdtS_~doA/5EKCALa0uBhlAqm3MyhZ9A); [Define risk statement hierarchy](https://www.servicenow.com/docs/r/teCgmdg6S2HWF~YnBhBwlg/GdEs7v3yIbuVjM5uE4IYoA)
- DOCUMENTED. Risk (`sn_risk_risk`) has an "Inherent risk" field that fills in automatically once the assessor assesses inherent risk. Risk statements are table `sn_risk_definition` (community thread) — [ServiceNow Community: sn_risk_risk form](https://www.servicenow.com/community/developer-forum/on-risk-sn-risk-risk-form-i-have-2-dot-walked-fields-inherent/m-p/3114382); [ServiceNow Community: Risk statement form](https://www.servicenow.com/community/grc-forum/few-field-s-are-missing-in-risk-statement-form/td-p/2967249/page/2)
- INFERRED. ServiceNow's hierarchy is template-to-instance, not process-based: Policy > Control Objective (`sn_compliance_policy_statement`) > Control (`sn_compliance_control`, one per Entity), and Risk Statement (`sn_risk_definition`) > Risk (`sn_risk_risk`, one per Entity). "Process / sub-process" is modeled as an **Entity** or Entity Type (business process entities), not as fields on the control. The table names `sn_grc_profile` / `sn_grc_profile_type` for Entity / Entity Type come from general knowledge, not from fetched pages.

**Workiva (SOX / Internal Controls for Financial Reporting, Controls Management)**
- DOCUMENTED (via search snippet; the article itself returned 403). The "Edit risks and controls" article for the Internal Controls for Financial Reporting solution lists single-select dropdown columns: **Location, Owner, Process, Sub-process, Significance, Frequency, Auto/Manual, Preventive/Detective** — [Workiva Support: Edit risks and controls](https://support.workiva.com/hc/en-us/articles/35995752376724-Edit-risks-and-controls)
- DOCUMENTED. A Workiva community thread is titled "SOX Database – Listing by Control Significance". So "Significance" is the column that plays the key/non-key role — [Workiva Community](https://support.workiva.com/hc/en-us/community/posts/360049510852-SOX-Database-Listing-by-Control-Significance)
- INFERRED. Workiva's hierarchy is Process > Sub-process > Risk > Control (from the Process and Sub-process columns), with Location as the entity dimension. Workiva says "Significance" rather than "Key Control" and "Auto/Manual" rather than "Nature/Automation".

**Archer (Archer IRM, formerly RSA Archer): Controls Assurance Program Management, IT Controls Assurance, Financial Controls Monitoring**
- DOCUMENTED. Control Procedures come in two types, **Technical** and **Process**, and the type decides which information is captured and which testing options appear. Record sections/tabs: General Information; Stakeholders (roles: Compliance Manager, Business Unit Controls Owner, Risk Manager); Control Details; Risk Management; Audit Management; Evidence Information (collection frequency, evidence owner, start/end dates); Privacy Management; Mappings; Testing; Findings; Compliance History — [Archer: Creating Control Procedures (CAPM 2024.03)](https://help.archerirm.cloud/regcorp_ctrlprg_2024.03/en-us/Content/Solutions/RegCorpComp/rccm_ctrlprg_ctrlprocedure_creating.htm)
- DOCUMENTED. Applications in the IT Controls Assurance use case: Control Procedures, Primary Controls, Control Generator, Control Self Assessments, Configuration Checks, Compliance Engagement, Compliance Scope, Control Scoping Unit, Evidence Repository, Design Test Results, Operating Test Results, Business Processes, Applications, Devices, Facilities, Information Assets, Technologies. Authoritative Sources (Source > Topic > Section > Sub Section) feed Primary Controls, and Control Generator creates Control Procedures from Primary Controls. Roles include Control Testing Submitter, Control Testing Reviewer, Evidence Owner, Control Owner/Approver. "The Data Dictionary, available from your Archer Account Representative, contains the full configuration" — [Archer: IT Controls Assurance Use Case Design](https://help.archerirm.cloud/itsecrisk_itcontrols_2024.03/en-us/Content/Solutions/ITSecRisk/itsrm_itctrl_design.htm)
- DOCUMENTED. The Compliance Management guide lists name, description, type, frequency and owner as the details entered when creating a control — [Archer Compliance Management Implementation Guide](https://help.archerirm.cloud/archersolutions/Content/ArcherSolutions/compliance_management_implementation_guide.htm)
- DOCUMENTED. Archer offers a Financial Controls Monitoring product for documenting process narratives, assigning ownership and assessing financial control performance — [Archer datasheet PDF](https://archerirm.com/de/_files/ugd/0fc6af_112ffd2240f14a23a352eb9071e04f1c.pdf)
- INFERRED. Archer's hierarchy is Business Unit/Business Process > Risk (Risk Register) > Control Procedure, with Control Standards / Primary Controls / Authoritative Sources as the framework side. Applications (systems) are a separate application linked through cross-reference fields. Exact field labels such as "Key Control" or "Control Frequency" could not be confirmed.

**AuditBoard SOXHUB (likely Optro itself)**
- DOCUMENTED. auditboard.com/download/soxhub/... returns a 301 redirect to optro.ai/download/soxhub/..., and the SOXHUB service licensing terms are hosted on optro.ai — observed redirect; [SOXHUB licensing terms (optro.ai)](https://optro.ai/download/agreements/service-specific-licensing-terms/archive/soxhub-service-licensing-terms-01162023.pdf)
- DOCUMENTED. The SOXHUB licensing terms define a "Tested Control" as being able "to document control information, control test information, and control testing results on a single control page" — [SOXHUB licensing terms](https://optro.ai/download/agreements/service-specific-licensing-terms/archive/soxhub-service-licensing-terms-01162023.pdf)
- DOCUMENTED. AuditBoard provides an Excel add-in, "AuditBoard Import Tools", that "allows authorized AuditBoard users to leverage Microsoft Excel for generating data to be imported into the AuditBoard application" — [Microsoft AppSource listing](https://appsource.microsoft.com/en-us/product/web-apps/WA200006771)
- DOCUMENTED. AuditBoard API documentation "is not publicly available"; access goes through AuditBoard support — [Axonius AuditBoard adapter docs](https://docs.axonius.com/pl/docs/audit-board)
- DOCUMENTED. SOXHUB training topics include Control Views, Performing SOXHUB Risk Assessments, Creating & Editing Narratives, Control Testing & Documentation, and control attribute testing in AuditBoard Annotate — [AuditBoard SOXHUB learning path](https://auditboard.com/exchange/soxhub-team-member-learning-path); [AuditBoard Community office hours](https://community.auditboard.com/t5/events/recording-office-hours-control-testing-sox-amp-audit-synergies-8/ba-p/8552)
- Not usable as evidence: Supergood's "AuditBoard API" page lists "Controls (design attributes, owners, frequency, key/ITGC flags)". The page itself says it is "an independent design exercise" and that "Nothing on this page describes an existing AuditBoard product" — [Supergood](https://supergood.ai/docs/auditboard-api)

**SAP Process Control (optional)**
- DOCUMENTED. Master data has these parts: organization hierarchy; business process hierarchy ("comprises the process, subprocess, and control"); regulation hierarchy; account groups (each account is assigned to an account group, and account groups align "financial assertions with each account"); control objectives (goals subprocesses work toward in mitigating risks); and a risk catalog shared with SAP Risk Management, where "only the risk templates are used to define the organization's overall risk and control matrix (RCM)". Controls "can be preventive, detective, or corrective" — [SAP Learning: Explaining Master Data](https://learning.sap.com/courses/discovering-the-key-functionalities-of-sap-process-control/explaining-master-data)
- DOCUMENTED. Account groups are a main factor in deciding whether a subprocess's significance is key — [SAP Press blog: master data in SAP Process Control](https://blog.sap-press.com/introduction-to-master-data-in-sap-process-control)

### Inferences
- INFERRED. Cross-platform synonym table for a mapping agent. Vendor labels come from the citations above; a dash means no public documentation was found. The "Common client RCM header variants" column is general practitioner convention, not vendor-documented.

| Concept | HighBond/Diligent One (import column) | ServiceNow (form label) | Workiva ICFR (column) | Archer | SAP PC | Common client RCM header variants (INFERRED) |
|---|---|---|---|---|---|---|
| Control ID | `controlId` (+ `referenceId` as row key) | Number | — | — | — | Control #, Control No., Control Ref, Control Code |
| Control name | `title` | Name | — | (Control Procedure name) | — | Control Title, Control Name |
| Control description | `description` | Description | — | — | — | Control Activity, Control Description, Control Narrative |
| Control objective / process | `objectiveId` (Objective) | Control Objective; Entity | Process, Sub-process | Business Process | Process / Subprocess; Control Objective | Process, Sub-Process, Cycle, Control Objective |
| Risk ID | `riskId` | Number on risk | — | — | Risk template | Risk #, Risk Ref |
| Risk description | `description` (risk) | Description (risk statement) | — | — | — | Risk Statement, What Could Go Wrong (WCGW) |
| Risk rating | `impact`, `likelihood`, `customFactors_n` | Inherent risk; Inherent SLE/ARO | — | — | — | Risk Rating, Inherent Risk, RoMM |
| Preventive/Detective | `preventDetect` | Classification | Preventive/Detective | — | preventive/detective/corrective | Control Type, P/D |
| Manual/Automated | `controlType` and/or `method` (project-configured) | Type (not SOX-oriented values) | Auto/Manual | Control type Technical/Process (different meaning) | — | Nature, Automation, Manual/Automated, ITDM |
| Frequency | `frequency` | Frequency | Frequency | frequency | — | Frequency, Control Frequency, Periodicity |
| Key control | — (custom attribute) | Key control | Significance | — | (subprocess significance) | Key/Non-Key, Key Control (Y/N), Significance |
| Owner | `owner` / `ownerUser` | Owner, Owning group | Owner | Business Unit Controls Owner; Control Owner/Approver | control owner | Control Owner, Performer, Preparer |
| Location/entity | `entities` | Entity | Location | Business Unit | Organization | Location, Entity, Legal Entity, BU |
| Test steps | `control_test_plan_testSteps` | — | — | Testing tab; Design/Operating Test Results | — | Test Procedures, Test Attributes |
| Systems | — (custom) | — | — | Applications (application) | — | System, Application, IT Dependency |
| Assertions / accounts | — (custom) | — | — | — | Account groups to assertions | Assertions (E/O, C, V/A, R&O, P&D), FSLI, Significant Account |

- INFERRED. ServiceNow "Type" and "Category" are UCF/IT-compliance taxonomies (e.g. Technical Security, Log Management, Training). They are not the SOX manual/automated attribute, so a mapper should not map a client "Control Type = Manual" column to ServiceNow Type without a transform.
- INFERRED. "Control Type" is ambiguous across platforms: in HighBond `controlType` sits next to a separate `preventDetect`, so it probably holds manual/automated-style values; in client RCMs "Control Type" often means preventive/detective; in Archer it means Technical vs Process. The mapping agent should decide by the values in the column, not by the header text.

### Gaps
- AuditBoard/SOXHUB (likely Optro): exact control/risk field names, import template columns and picklists are not public. Help center, API docs and Import Tools templates need customer access.
- Workiva: the full ICFR control attribute list (assertions, accounts, key reports/IPE, ITGC flags, control ID column name) could not be fetched (403).
- Archer: field labels are only in the Data Dictionary from Archer account reps. Could not confirm "Key Control", "Control Frequency", "Assertions" or "Nature of Control" as exact labels.
- MetricStream: not researched.
- SAP Process Control: control attribute names (e.g. control automation, nature of control, purpose, significance, test automation) were not found in accessible docs.
- No platform publicly documents a dedicated field for IPE/key reports, fraud risk flag, or ITGC domain. In HighBond these would be `customAttributes_n`.

---

## Q2. Which fields are required on each platform, and which are picklists (with documented values)?

### Takeaway
Only HighBond publishes required-field rules for import. ServiceNow documents picklist values but few mandatory rules: Entity is mandatory on controls, and Attestation respondents become mandatory once Attestation is set. ServiceNow Frequency values are documented: Event Driven, Daily, Weekly, Monthly, Quarterly, Semi-Annually, Annually. HighBond picklist values depend on the project type and are not published.

### Cited Findings
- DOCUMENTED. HighBond controls import, **mandatory:** `referenceId` (unique per row, max 255 chars), `objectiveId`, `description`, `controlId`. **Conditionally mandatory:** `frequency`, `controlType`, `preventDetect`, `controlTests_n_notApplicable`. "If a mandatory field is blank, the row is not processed." `frequency`, `method`, `controlType`, `preventDetect`, `status` and `control_test_plan_testingMethod` are dropdowns whose "options depend on project type". `preventDetect` options are prevent, detect, or not applicable. Dropdown and multiple-choice custom attribute values must match the options exactly — [Diligent One: Bulk importing controls](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_controls.htm)
- DOCUMENTED. HighBond risks import, mandatory: `referenceId`, `objectiveId`, `description`. Options for `impact` / `likelihood` "depend on the project type" — [Diligent One: Bulk importing risks](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_risks.htm)
- DOCUMENTED, third-party source. For "Internal Control" workflow projects, frequency, control_type and prevent_detect are required — [highbond-sdk (PyPI)](https://pypi.org/project/highbond-sdk/0.0.4/)
- DOCUMENTED. ServiceNow: Entity "is a mandatory field on the Control form", and missing entities "can cause unreliable results in calculations" — [ServiceNow: Manage controls (Zurich)](https://www.servicenow.com/docs/r/zurich/governance-risk-compliance/grc-compliance-management-workspace/manage-controls-ws.html)
- DOCUMENTED. ServiceNow control picklists (Brazil release):
  - Frequency: Event Driven, Daily, Weekly, Monthly, Quarterly, Semi-Annually, Annually. It is "for reporting purposes only" and does not drive attestation.
  - Attestation frequency: Daily, Weekly, Monthly, Quarterly, Semi-Annually, Annually. Defaults to the entity's value when blank.
  - Classification: Preventive, Corrective, Detective, IT Impact Zone.
  - Enforcement: Mandated, Voluntary.
  - Status: Compliant, Non-compliant, Not applicable.
  - State: Draft, Attest, Review, Monitor, Retired.
  - Setting Attestation makes Attestation respondents mandatory.

  Source: [ServiceNow: Create a control](https://www.servicenow.com/docs/r/governance-risk-compliance/policy-and-compliance-management/t_CreateAControl.html)
- DOCUMENTED. ServiceNow control objective picklists:
  - Classification: Preventive, Corrective, Detective.
  - Category (16 values): Acquisition or sale of facilities, technology, and services; Audits and risk management; Compliance and Governance Manual of Style; Human Resources management; Leadership and high-level objectives; Monitoring and measurement; Operational management; Physical and environmental protection; Privacy protection for information and data; Records management; System hardening through configuration management; Systems continuity; Systems design, build, and implementation; Technical security; Third Party and supply chain oversight; Root.
  - Type (25 values), including Business Processes, IT Impact Zone, Process or Activity, Testing and Training.

  Source: [ServiceNow: Control objectives form](https://www.servicenow.com/docs/r/Z61H6JNUJXKe8NNPQzK7MQ/aP~2QUBpT6pgCWxV18pViQ)
- DOCUMENTED. Workiva ICFR: Location, Owner, Process, Sub-process, Significance, Frequency, Auto/Manual and Preventive/Detective are single-select dropdowns. Frequency is edited by double-clicking the value and choosing from a dropdown — [Workiva Support: Edit risks and controls](https://support.workiva.com/hc/en-us/articles/35995752376724-Edit-risks-and-controls) (from search snippet)
- DOCUMENTED. Archer Control Procedure type picklist: Technical, Process — [Archer: Creating Control Procedures](https://help.archerirm.cloud/regcorp_ctrlprg_2024.03/en-us/Content/Solutions/RegCorpComp/rccm_ctrlprg_ctrlprocedure_creating.htm)

### Inferences
- INFERRED. Frequency values to normalize across platforms: Event Driven / As Needed / Ad hoc / Transactional ↔ "Event Driven" (ServiceNow); Daily/Weekly/Monthly/Quarterly; Semi-Annually / Semi-Annual / Bi-annual; Annually / Annual / Yearly; Multiple times per day / Recurring (common in client RCMs, not documented for any platform here).
- INFERRED. ServiceNow has no SOX "nature" (manual/automated) field out of the box, and HighBond's values are configured per project. So a client RCM's manual/automated/ITDM values will usually land in a project-configured or custom picklist.

### Gaps
- HighBond's default "Internal Control" project-type values for `frequency`, `controlType`, `method` and `status` were not found.
- Workiva picklist values for Frequency, Significance and Auto/Manual were not found.
- Which ServiceNow fields are dictionary-mandatory, beyond Entity and the Attestation rule, is not documented on the form pages.
- AuditBoard/Optro and Archer: no public mandatory-field or picklist documentation found.

---

## Q3. How do import templates express many-to-many links (risk-to-control, control-to-system)?

### Takeaway
HighBond links records by reference ID and uses comma-separated ID lists for multi-valued links (`entities`). Both controls and risks point to a parent objective via `objectiveId`, but the documented import has no direct risk-to-control column. ServiceNow uses separate many-to-many tables (control-to-entity, control-to-control-requirement). Archer uses cross-reference fields and a "Mappings" tab. No public template documentation was found for AuditBoard or Workiva.

### Cited Findings
- DOCUMENTED. HighBond: `entities` takes "entity IDs, comma-separated, or referenceId of a new entity". `objectiveId` takes an existing objective ID (from its URL) or the `referenceId` of an objective in the same template. "Objectives can be linked to risks and controls during import using reference IDs." "Reference IDs are required when you add or update resources using the Bulk Importer." — [Diligent One: Bulk importing controls](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_controls.htm); [Diligent One: Bulk importing risks](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_risks.htm)
- DOCUMENTED. HighBond's risks worksheet does not describe a risk-to-control field. Its example links controls to objectives by pasting the new objective's referenceId into each control's `objectiveId` — [Diligent One: Bulk importing risks](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_risks.htm)
- DOCUMENTED. ServiceNow GRC has a control-to-entity many-to-many table and a control-to-control-requirement table (community answer on GRC tables) — [ServiceNow Community: GRC tables](https://www.servicenow.com/community/grc-forum/what-the-the-following-tables-used-for/m-p/3030481)
- DOCUMENTED. Archer Control Procedures have a "Mappings" tab and a "Risk Management" tab. Business Processes, Applications, Devices and similar records "associate it with other aspects of the enterprise infrastructure" — [Archer: Creating Control Procedures](https://help.archerirm.cloud/regcorp_ctrlprg_2024.03/en-us/Content/Solutions/RegCorpComp/rccm_ctrlprg_ctrlprocedure_creating.htm); [Archer: IT Controls Assurance Use Case Design](https://help.archerirm.cloud/itsecrisk_itcontrols_2024.03/en-us/Content/Solutions/ITSecRisk/itsrm_itctrl_design.htm)

### Inferences
- INFERRED. Many-to-many links reach the platforms in three ways:
  - A delimited list of IDs in one cell (HighBond `entities`; probably also Archer cross-reference imports).
  - Repeated rows, one per risk-control pair. This is typical of flat client RCM exports: a control with several risks is repeated, or a risk with several controls is repeated.
  - A separate mapping sheet or table (ServiceNow m2m tables).

  A mapping agent should detect duplicated control IDs across rows as a sign of the repeated-row pattern, and look for delimiters (`,`, `;`, line breaks) in ID cells.
- INFERRED. ServiceNow's risk-to-control link most likely lives in an m2m table (commonly cited as `sn_risk_m2m_risk_control`), but this is unverified and the name should not be relied on.

### Gaps
- How HighBond links a risk to a control (risk-control mapping in the RCM) through the bulk importer is not documented on the fetched pages.
- AuditBoard Import Tools and Workiva "Import – Matrix from File": linking conventions not found.
- Archer Data Feed / Data Import cross-reference syntax for Control Procedures was not researched in detail.

---

## Q4. What does a typical export look like (column headers)?

### Takeaway
The best stand-in for a platform's export headers is HighBond's import template, which round-trips: download template, fill it, upload. Export header layouts for AuditBoard, Workiva, ServiceNow and Archer are not publicly documented. Their exports are most likely the visible list columns, labeled as on the form (ServiceNow: Number, Name, Control Objective, Entity, Owner, Key control, Classification, Frequency, State, Status).

### Cited Findings
- DOCUMENTED. The HighBond template is generated from the selected project/framework plus org configuration, and an "All resources" template has two control tests by default — [Diligent One: Bulk importing controls](https://help.diligentoneplatform.com/helpdocs/d1p/en-us/Content/administration/bulk_importer/bulk_uploading_controls.htm)
- DOCUMENTED. HighBond Results tables can be imported into Analytics (IMPORT GRCRESULTS). Data meant to round-trip should follow Analytics field-name rules (no special characters or spaces) — [HighBond: Import HighBond Results data](https://help.highbond.com/helpdocs/analytics/15/en-us/Content/analytics/defining_importing_data/import_aclgrc_results_data.htm); [IMPORT GRCRESULTS command](https://help.highbond.com/helpdocs/analytics/16/en-us/Content/analytics/scripting/commands/r_import_grcresults.htm)
- DOCUMENTED. Workiva SOX data can be added by copy/paste, by Wdesk Sync from Excel, or through a Wdata connector or systems integration. Connected sheets "may require some support from the Workiva team". XLSX imports are limited to 16MB — [Workiva Marketplace: SOX Risk Assessment](https://marketplace.workiva.com/en-us/templates/sox-risk-assessment); [Workiva: Create or import a spreadsheet](https://support.workiva.com/hc/en-us/articles/360035643172-Create-or-import-a-spreadsheet)
- DOCUMENTED. The Wdata API has a spreadsheet import endpoint `POST /api/v1/table/{tableId}/spreadsheet/import` — [Workiva developers: Import from spreadsheets](https://developers.workiva.com/wdata-v1/wdata-importfromspreadsheets.html)
- DOCUMENTED, third-party/review source. Reviews say SOXHUB can export CSV files with control UIDs, test timing and titles, plus separate files for significance, test types and status. Only a search summary was seen; not verified against AuditBoard docs — [Capterra SOXHUB reviews](https://www.capterra.com/p/148230/SOXHUB/reviews) (low confidence)
- DOCUMENTED. SAP Process Control uploads master data through the Master Data Upload Generator (MDUG), which produces an Excel upload file, or through Content Lifecycle Management (CLM) — [SAP Learning: Creation and Management of Master Data](https://learning.sap.com/courses/discovering-the-key-functionalities-of-sap-process-control/creation-and-management-of-master-data); [SAP Answers: Master data in PC](https://answers.sap.com/t5/financial-management-blogs-by-members/master-data-in-process-control-grcv10-0-10-1/ba-p/13190304); [SAP KBA 2670052](https://userapps.support.sap.com/sap/support/knowledge/en/2670052)

### Inferences
- INFERRED. Header style tells you the source. camelCase headers with `_n_` repeat groups (`controlTests_1_sampleSize`, `customAttributes_2_term`) point strongly to a HighBond/Diligent One export or template. Title-case labels such as "Number", "Control Objective", "Entity", "Key control", "Classification" point to a ServiceNow list export. "Auto/Manual", "Preventive/Detective", "Significance", "Sub-process" point to Workiva ICFR.
- INFERRED. Expect HighBond custom attributes to arrive as term/value column pairs. The semantic field name (e.g. "Assertions", "Key Control", "IPE") is the *value* of a `customAttributes_n_term` cell, not a header. The mapper has to pivot these pairs.

### Gaps
- No public sample export file or header list was found for AuditBoard/Optro SOXHUB, Workiva ICFR, ServiceNow IRM or Archer.
- MetricStream export/import formats were not researched.
