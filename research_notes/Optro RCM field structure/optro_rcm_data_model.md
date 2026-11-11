# Optro (formerly AuditBoard) RCM Data Model and Field Structure

Research date: 2026-11-07. Scope: Optro Controls Management (formerly SOXHUB) risk and control matrix (RCM) objects, fields, import/export and API.

**Main point:** Optro is AuditBoard under a new name. The rebrand was announced on 2026-03-09. Its SOX module, SOXHUB, is reportedly now called "Controls Management". The field-level documentation is almost entirely behind a login: the help center, the community and the developer portal. **No public source gives a complete RCM field list, import template columns or picklist values.** The most concrete field and endpoint names found come from an unofficial open-source admin toolkit on GitHub that calls the real AuditBoard REST API. Those names are documented in that code, not by the vendor. Each item below is labelled DOCUMENTED (with a source) or INFERRED.

Sources that are not usable: the Supergood "AuditBoard API" page (supergood.ai/docs/auditboard-api) describes a **hypothetical** API. It states that "Nothing on this page describes an existing AuditBoard product". Do not use its object or field descriptions as evidence. — [Supergood](https://supergood.ai/docs/auditboard-api)

---

## Q1. Product identity and object hierarchy: how are RCM objects structured and linked?

### Takeaway
Optro is the rebranded AuditBoard, so AuditBoard and SOXHUB documentation still applies. The API shows a library-and-instance hierarchy: **Region → Entity**, and **Region → Process → Subprocess → Control** as library objects. Join records (`processes_data`, `subprocesses_data`, `controls_data`) place each process, subprocess and control under a specific entity. Risk objects exist in the product, but their API or object structure and their link to controls are not publicly documented.

### Cited Findings
**Product identity (DOCUMENTED)**
- AuditBoard announced its new name, Optro, on 9 March 2026 at the IIA's Great Audit Minds conference. — [GRC Report](https://www.grcreport.com/post/auditboard-rebrands-as-optro-as-ai-reshapes-the-future-of-grc); [PR Newswire release](https://tools.prnewswire.com/en-us/live/20823/release/20260309EN03678); [Accounting Today](https://www.accountingtoday.com/news/auditboard-now-styles-itself-optro)
- AuditBoard.com URLs now return 301 redirects to optro.ai. This was observed directly: auditboard.com/exchange/... and auditboard.com/download/soxhub/... both redirected to optro.ai, and community.auditboard.com redirected to community.optro.ai. The company says the roadmap, integrations and customer community continue unchanged. — [CPA Practice Advisor](https://www.cpapracticeadvisor.com/2026/03/09/auditboard-is-now-optro/179518/); [Optro blog](https://optro.ai/blog/meet-optro-auditboard-unveils-new-identity-as-ai-transforms-grc)
- Module names, from a third-party review dated September 2026: "Controls Management" is "the former SOXHUB". "Internal Audit" is still called OpsAudit inside the product. Risk Management was RiskOversight and Compliance Management was CrossComply. "Autonomous Testing" is the former Midship, acquired 6 May 2026. The reviewer did not use the product. — [Internal Audit Guide, Optro review (2026-09)](https://internalauditguide.com/2026/09/optro-review/)
- The Optro SOX product page still captions images "SOXHUB". — [Optro SOX management page](https://optro.ai/product/sox-management)

**Hierarchy, from the API as used by an unofficial admin toolkit (DOCUMENTED in third-party code, not vendor docs)**
- The GitHub repo `markspivey/AuditBoard-Controls-Bulk-Delete` is a Python toolkit "for AuditBoard Control Module administrators". It deletes objects in dependency order: **Controls → Subprocesses → Processes → Entities → Region**. — [GitHub README](https://github.com/markspivey/AuditBoard-Controls-Bulk-Delete)
- The toolkit's API client calls these REST resources: `controls`, `controls/{id}`, `processes`, `processes/{id}`, `subprocesses`, `subprocesses/{id}`, `entities`, `entities/{id}`, `regions`, `regions/{id}`, `auditable_entities`, `auditable_entities/{id}`. Responses wrap lists in keys of the same name (`controls`, `processes`, `subprocesses`, `entities`, `regions`, `auditable_entities`). — [api_client.py](https://raw.githubusercontent.com/markspivey/AuditBoard-Controls-Bulk-Delete/main/scripts/core/api_client.py)
- The README says `/entities` (used for SOX bulk operations) is a different endpoint from `/auditable_entities`. That suggests the SOX entity and the audit-universe auditable entity are separate objects. — [GitHub README](https://github.com/markspivey/AuditBoard-Controls-Bulk-Delete)
- Join or "data" endpoints and the fields the toolkit reads from them: — [analyze_region.py](https://raw.githubusercontent.com/markspivey/AuditBoard-Controls-Bulk-Delete/main/scripts/discovery/analyze_region.py); [find_dependencies.py](https://raw.githubusercontent.com/markspivey/AuditBoard-Controls-Bulk-Delete/main/scripts/discovery/find_dependencies.py)

| Object / endpoint | Fields read in code |
|---|---|
| `regions` | `id`, `name`, `description` |
| `entities` | `id`, `name`, `entity_type_id`, `region_id` |
| `processes` | `id`, `name`, `uid`, `region_id` |
| `subprocesses` | `id`, `name`, `uid`, `process_id` |
| `controls` | `id`, `name`, `uid`, `subprocess_id` |
| `processes_data` (entity × process link) | `id`, `entity_id`, `process_id` |
| `subprocesses_data` (process-instance × subprocess link) | `id`, `processes_datum_id`, `subprocess_id` |
| `controls_data` (subprocess-instance × control link) | `id`, `control_id`, `subprocesses_datum_id` |

- Deleting a control through the API automatically removes its `controls_data` links. — [GitHub README](https://github.com/markspivey/AuditBoard-Controls-Bulk-Delete)
- A user review describes the hierarchy as **Entity → Process → Subprocess** and says it only goes as granular as the L2–L3 process level. This came from a search-result excerpt; the Capterra page itself returned 403. — [Capterra reviews](https://www.capterra.com/p/148230/SOXHUB/reviews/)

**Other objects mentioned in vendor material (DOCUMENTED that they exist; no fields given)**
- Risks and controls: "AI-generated narratives and flowcharts map in risks and controls." — [Optro SOX management page](https://optro.ai/product/sox-management)
- Applications: the Q1 2023 release added "Financial Application Inventory Pages" to SOXHUB, which "consolidates and standardizes application information across the platform". — [AuditBoard Q1 2023 release notes](https://www.optro.ai/blog/auditboard-product-releases-q1-2023)
- Controls can reference operational audit work steps. A customer quote: "Within our controls, we can reference our operational audit work steps." — [Optro SOX management page](https://optro.ai/product/sox-management)
- The review says one control library serves SOX testing and operational audit at once, and all modules sit on "one data model". — [Internal Audit Guide](https://internalauditguide.com/2026/09/optro-review/)
- Cross-framework control mapping (SOX, SOC 2, ISO) is done through CrossComply. This is a third-party claim. — reported in search-result summaries of [HighRadius](https://www.highradius.com/resources/Blog/best-sox-compliance-tools/) (not verified by direct fetch)

### Inferences
- INFERRED: The `_data` join tables point to a **library and instance pattern**. Processes, subprocesses and controls are defined once in a library: processes per region, subprocesses under a process, and controls under a subprocess through `control.subprocess_id`. They are then instantiated for each entity: `processes_data(entity_id, process_id)` → `subprocesses_data(processes_datum_id, subprocess_id)` → `controls_data(subprocesses_datum_id, control_id)`. So one library control can be deployed to many entities, and the per-entity `controls_data` record most likely holds entity-specific attributes such as owner or in-scope status. The field names on `controls_data` beyond the foreign keys are not visible.
- INFERRED: A control belongs to exactly one subprocess in the library, since `subprocess_id` is a single foreign key. The library hierarchy below the region is therefore strict, not many-to-many.
- INFERRED: The API names follow Rails conventions (`processes_datum_id` is the Rails singular of `data`), which suggests a Rails-style REST backend. Other objects, such as risks, accounts and assertions, plausibly follow the same pattern (e.g. a `risks` resource), but no source confirms this.
- INFERRED: Whether risk-to-control links are many-to-many could not be confirmed from public sources. Industry practice and the "map in risks and controls" wording suggest many-to-many, but this is not documented.

### Gaps
- No public source documents the risk object, financial statement accounts, assertions, IPE/key reports, ITGC domains or test procedure objects, or how they link to controls.
- The vendor help center (support.soxhub.com, the AuditBoard/Optro help center) did not appear in any search results. The Optro Community Hub (community.optro.ai) requires SSO login (observed directly). Any official hierarchy documentation is behind those logins.

---

## Q2. Standard fields on risks and controls, and their field types

### Takeaway
The only control field names confirmed publicly are the API keys `id`, `name`, `uid` and `subprocess_id`. Training-card material refers to a unique "UID" per component, a "control weight" attribute for key vs non-key, and a "test type" attribute. Standard SOX attributes (nature, frequency, assertions, owner and so on) almost certainly exist, but their exact names and types are not publicly documented.

### Cited Findings
- Control API fields `id`, `name`, `uid` and `subprocess_id` are DOCUMENTED in the third-party toolkit code. — [analyze_region.py](https://raw.githubusercontent.com/markspivey/AuditBoard-Controls-Bulk-Delete/main/scripts/discovery/analyze_region.py)
- Process and subprocess records also have a `uid`. — [find_dependencies.py](https://raw.githubusercontent.com/markspivey/AuditBoard-Controls-Bulk-Delete/main/scripts/discovery/find_dependencies.py)
- A Quizlet set titled "Auditboard Audit Configuration & Setup" says UIDs must be unique within each component, with a control ID example such as "ACP-10". It also mentions a **control weight** attribute that separates key from non-key controls, and a **test type** attribute with values such as inspection and inquiry. This is user-generated study material; the content came from a search-result excerpt because the page returned 403. Low reliability. — [Quizlet](https://quizlet.com/927316518/auditboard-flash-cards/)
- Testing workflow in AuditBoard Annotate, from a community webinar agenda: "Add testing attributes", set up a sample results table, "Perform control attribute testing", review and close. This came from a search-result excerpt. — [AuditBoard community webinar post](https://community.auditboard.com:443/t5/community-news/register-for-the-upcoming-best-practices-webinar-about/ba-p/6054)
- "AI agents independently run attribute tests across uploaded evidence, like user access reviews and reconciliations." — [Optro SOX management page](https://optro.ai/product/sox-management)
- Reviewers mention configurable fields: "Able to Customize Fields", and "Sometime it seems hard to find the specific field you want to edit, due to the number of fields avaliable for configuration." These came from search-result excerpts. — [Capterra reviews](https://www.capterra.com/p/148230/SOXHUB/reviews/)

### Inferences
- INFERRED (not confirmed for Optro): an RCM import or record would typically include control description, control objective, preventive/detective, manual/automated/IT-dependent manual, frequency, key/non-key (likely the "control weight" field named above), control owner, assertions, accounts, related applications and fraud flag. **None of these exact field labels or picklist values are documented publicly for AuditBoard or Optro.**
- INFERRED: `name` is the API key for the control title and `uid` holds the user-defined control ID (e.g. "ACP-10"). The internal `id` is a system integer.
- INFERRED: Entities are typed through `entity_type_id`, which points to a configurable entity-type list.

### Gaps
- No public list of risk fields: risk ID, description, rating, likelihood or impact, fraud risk.
- No public field-type information (text, picklist, multi-select, user, date) for any SOXHUB field.
- No public picklist values for frequency, nature or type.

---

## Q3. Required vs optional fields, and custom field configuration

### Takeaway
Field configuration and custom fields exist and are admin-configurable, according to reviews and community session titles. Public sources do not show which fields are required or how custom fields are created (menu path, field types, picklist editing). The only documented uniqueness rule is that UIDs must be unique within a component, and that comes from unofficial study cards.

### Cited Findings
- UIDs must be unique within each component (unofficial). — [Quizlet](https://quizlet.com/927316518/auditboard-flash-cards/)
- Issues use "configurable issue types, each with its own fields". This shows type-specific custom field sets exist at least for issues. — [Internal Audit Guide](https://internalauditguide.com/2026/09/optro-review/)
- An AuditBoard community session covered "page customization" across SOXHUB, OpsAudit and Risk. This came from a search-result summary; the page is now gated. — [AuditBoard/Optro community events](https://community.auditboard.com/t5/events/bg-p/Events2/page/5)
- A reviewer says "some times it is hard to configure the fields or template". This came from a search-result excerpt. — [Capterra reviews](https://www.capterra.com/p/148230/SOXHUB/reviews/)
- A competitor comparison claims configuration changes often require vendor assistance. This is a competitor's claim, so treat it with caution. — surfaced via search summary of [SmartSuite](https://www.smartsuite.com/blog/auditboard-pricing)
- API tokens are created under **Settings → API Tokens**. This shows a Settings admin area exists. — [GitHub README](https://github.com/markspivey/AuditBoard-Controls-Bulk-Delete)

### Inferences
- INFERRED: `uid` and `name` are probably required for processes, subprocesses and controls, because the toolkit treats them as identifying fields and UIDs must be unique. A control also needs a parent `subprocess_id` in the library model. This is not documented.
- INFERRED: Custom fields are probably managed per object type (control, risk, issue) through page or layout customization, as with issue types. The exact mechanism is not public.

### Gaps
- No public documentation of required fields, field validation rules, custom field types or the admin path for custom field and picklist setup.

---

## Q4. Bulk import and export mechanics

### Takeaway
AuditBoard/Optro has two bulk-data tools. The **"AuditBoard Import Tools" Excel add-in** (Microsoft AppSource) generates data in Excel to import, creating records in bulk; reportedly it must be enabled by Customer Support. **"Visual Import"** is a bulk-change feature for updating existing records. Export of all data is available in standard formats (CSV, PDF, ZIP). No public source gives import template column names or explains how risk-to-control links are expressed in a file.

### Cited Findings
- The AppSource listing says the AuditBoard Import Tools add-in "allows authorized AuditBoard users to leverage Microsoft Excel for generating data to be imported into the AuditBoard application". Requirements: Windows or macOS and an active AuditBoard subscription. This came from a search-result excerpt; the page returned 403 to direct fetch. — [Microsoft AppSource: AuditBoard Import Tools](https://appsource.microsoft.com/en-cy/product/office/WA200006771?tab=Overview)
- The same add-in is used to create records in bulk, and access currently requires Customer Support enablement. This came from a search-result summary of the AppSource listing and was not verified by direct fetch. — [AppSource (web-apps listing)](https://appsource.microsoft.com/en-us/product/web-apps/WA200006771)
- **Visual Import** is "a bulk change feature available to all customers" for updating existing records across the AuditBoard application. It was presented in a recorded Customer Success session. This came from a search-result summary; the community page is now behind login. — [AuditBoard/Optro community events](https://community.auditboard.com/t5/events/bg-p/Events2/page/5)
- Export: customers "can export all data in standard formats such as ZIP, PDF and CSV" (quoting a West Virginia bid response). The same review says it found no documentation of bulk import tooling for historical workpapers from TeamMate, Excel or SharePoint. Typical migrations bring over the audit universe, open issues, the control library and the current-year plan. — [Internal Audit Guide](https://internalauditguide.com/2026/09/optro-review/)
- Reviewers mention "challenges with customizing forms and Excel exports". This came from a search-result summary. — [TrustRadius reviews](https://www.trustradius.com/products/auditboard/reviews)
- Pre-built RCM content: Controls Management ships with "a sample out-of-the-box (OOTB) SOX RCM", "pre-loaded", and customers can "tailor your SOX risks and controls". It is available to current customers only. — [Optro Exchange: OOTB SOX RCM](https://optro.ai/exchange/template-ootb-sox-rcm)
- The Exchange also offers EY sector-based RCMs, described as pre-configured libraries of risks and controls for specific industries. This came from a search-result summary. — [Optro Exchange: EY sector RCMs](https://auditboard.com/exchange/ey-sector-based-risk-and-control-matrices-rcms)
- RCM and workpaper migration is the main driver of an 8–16 week core audit/SOX implementation. This is a third-party claim from a search-result summary. — [bdemerson.com](https://www.bdemerson.com/article/auditboard-vs-workiva)
- AuditBoard Analytics, a separate product, documents CSV/XLSX flat-file import into an analytics workflow canvas. It is not the RCM import. — [AuditBoard Analytics docs](https://docs.auditboardanalytics.com/tools/import)

### Inferences
- INFERRED: Because the data model separates library objects from entity instances (`controls_data` and the other join records), an RCM import probably needs parent identifiers, likely the process and subprocess UIDs, plus entity assignment for each control row. The repo shows `uid` on processes, subprocesses and controls, which fits UIDs acting as the import matching keys. This is not documented.
- INFERRED: The Excel add-in approach (data generated in Excel and pushed to the app) suggests the import template is built dynamically from the tenant's configuration rather than fixed column names. Other GRC vendors, such as Diligent, work this way, but that is an analogy, not evidence.

### Gaps
- No public import template, column names, required columns or link-syntax for risk↔control or control↔application mappings.
- No public list of export column names for an RCM export.
- No information on the Import Tools add-in version or release date.

---

## Q5. API: REST/GraphQL and documented control/risk schemas

### Takeaway
There is an official REST API at `https://{tenant}.auditboardapp.com/api/v1/...` with bearer-token auth, plus SCIM, an official developer portal (developer.auditboard.com, gated behind login) and, since April 2026, an MCP server. Public sources do not show schemas. Known field and resource names come only from third-party code (see the Q1 table).

### Cited Findings
- Base URL pattern: `https://your-org.auditboardapp.com/api/v1`. Sandbox tenants use a domain such as `https://org.auditboardsandbox.com`. Auth header: `Authorization: Bearer {token}`. Content type: `application/json`. The toolkit uses no pagination parameters. — [api_client.py](https://raw.githubusercontent.com/markspivey/AuditBoard-Controls-Bulk-Delete/main/scripts/core/api_client.py); [GitHub README](https://github.com/markspivey/AuditBoard-Controls-Bulk-Delete)
- Microsoft's Entra ID SSO tutorial uses `https://<subdomain>.auditboardapp.com/api/v1/sso/saml/metadata.xml` and `.../api/v1/sso/saml/assert`, which corroborates the `/api/v1` path on `auditboardapp.com`. — [Microsoft Learn: AuditBoard SSO](https://learn.microsoft.com/en-us/entra/identity/saas-apps/auditboard-tutorial)
- Official developer portal: developer.auditboard.com. Requests are redirected to a readme.io/Auth0 login (connection "auditboard-group-endusers"), so the content is gated (observed directly 2026-11-07). The BlinkOps integration links to its doc page "how-to-generate-auditboard-bearer-tokens" and asks for "The AuditBoard Domain" and "The API Key". — [BlinkOps AuditBoard integration](https://docs.blinkops.com/docs/integrations/auditboard)
- Axonius's AuditBoard adapter reportedly uses OAuth 2.0 client credentials generated in admin API/Integrations settings. This came from a search-result summary and conflicts slightly with the static bearer-token pattern above; there may be several auth methods. — [Axonius docs](https://docs.axonius.com/docs/audit-board)
- The review reports "REST and SCIM APIs with a developer portal". It also says an MCP server launched on 28 April 2026 that lets customer LLMs query Optro data within user permissions, and that Optro Analytics has 150+ integrations. — [Internal Audit Guide](https://internalauditguide.com/2026/09/optro-review/)
- The MCP server respects the user's role, team and permissions and queries live data from the customer environment. — [SecurityBrief](https://securitybrief.news/story/optro-launches-mcp-server-for-governed-grc-data-access)
- apitracker.io lists AuditBoard with an API reference, webhooks, sandbox and a "GraphQL playground". This aggregator is unreliable, and no other source confirms GraphQL. — [apitracker.io](https://apitracker.io/a/auditboard)
- An unofficial PyPI package, `control-rod`, is described as an experimental AuditBoard API client that creates technical controls from AWS control data. This came from a search-result summary; the page did not render on fetch. — [PyPI control-rod](https://pypi.org/project/control-rod/)

### Inferences
- INFERRED: Control and risk JSON schemas are probably documented in the gated readme.io portal. The confirmed resource names are `controls`, `processes`, `subprocesses`, `entities`, `regions`, `auditable_entities` and the `*_data` joins. A `risks` endpoint probably exists but is not confirmed.
- INFERRED: Since controls can be deleted through the API and `control-rod` creates controls, the REST API supports full CRUD on controls. Create payload fields are not public.

### Gaps
- No public OpenAPI spec, field schema, pagination or rate-limit documentation.
- GraphQL support is unconfirmed; only an aggregator claims it.
- Endpoint names for risks, accounts, assertions, applications, test attributes and IPE are not publicly visible.
- The field set returned for a control beyond `id`/`name`/`uid`/`subprocess_id` was not visible, because the toolkit only reads those keys.
