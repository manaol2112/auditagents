/** Canonical RCM fields (architecture/rcm-field-standard.md v0.2): keys, the template's labels, header synonyms used by the
 * column mapper, requirement levels, and picklists with the value variants clients and platforms use.
 *
 * Synonyms come from the template, the research report's cross-platform table (Optro / AuditBoard, Diligent One, ServiceNow,
 * Workiva, Archer, SAP Process Control) and common client headers. They are matching aids only: every mapping is confirmed
 * by a person before extraction.
 */

export type Kind = "header" | "entity" | "process" | "account" | "system" | "ipe" | "risk" | "control" | "service_org" | "cuec";
export type Req = "M" | "C" | "R" | "E";
export const CATEGORIES = ["Business process control", "IT-dependent manual control", "IT application control", "IT general control", "Entity-level control"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface FieldDef {
  key: string; label: string; object: Kind; req: Req;
  /** Control categories the requirement applies to; omitted = every record of the object. */
  applies_to?: Category[];
  description: string;
  synonyms: string[];
  list?: string;          // picklist name in PICKLISTS
  multi?: boolean;        // holds several values (IDs, assertions)
}

/** Picklists: canonical value -> variants (compared after normalization). */
export const PICKLISTS: Record<string, Record<string, string[]>> = {
  yesno: { Yes: ["yes", "y", "true", "x", "1", "key", "key control", "k"], No: ["no", "n", "false", "0", "non key", "nonkey", "non key control", "nk", "not key"] },
  category: {
    "Business process control": ["business process control", "business process", "bp", "bpc", "process control", "process level control", "manual control", "business control", "transaction control", "process level"],
    "IT-dependent manual control": ["it dependent manual control", "it dependent manual", "itdm", "it dependent", "itdmc", "manual it dependent"],
    "IT application control": ["it application control", "application control", "itac", "automated application control", "automated control", "app control", "it automated control", "application"],
    "IT general control": ["it general control", "itgc", "gitc", "general it control", "general computer control", "gcc", "it general", "general control", "it control"],
    "Entity-level control": ["entity level control", "elc", "entity level", "company level control", "company level", "entity wide control"],
  },
  type: { Preventive: ["preventive", "preventative", "prevent", "p", "prev"], Detective: ["detective", "detect", "d", "det"] },
  nature: {
    Manual: ["manual", "m", "man"],
    "IT-dependent manual": ["it dependent manual", "itdm", "it dependent", "semi automated", "semiautomated", "hybrid", "manual it dependent", "it enabled manual", "partially automated"],
    Automated: ["automated", "automatic", "auto", "a", "system", "application", "fully automated", "system enforced", "automated control"],
  },
  frequency: {
    Annual: ["annual", "annually", "yearly", "once a year", "1x year", "1 per year", "a"],
    "Semi-annual": ["semi annual", "semi annually", "semiannual", "semiannually", "twice a year", "half yearly", "biannual", "bi annual", "biannually", "6 monthly", "every 6 months", "sa"],
    Quarterly: ["quarterly", "quarter", "every quarter", "q", "qtrly"],
    Monthly: ["monthly", "month", "every month", "m"],
    Weekly: ["weekly", "week", "every week", "w"],
    Daily: ["daily", "day", "every day", "d"],
    "Multiple times per day": ["multiple times per day", "multiple times a day", "multiple daily", "several times a day", "many times per day", "recurring", "hourly", "intraday", "multiple times daily"],
    "Event-driven": ["event driven", "event", "as needed", "as required", "ad hoc", "adhoc", "per occurrence", "per event", "transactional", "on demand", "when required", "as and when", "per change", "per request", "upon occurrence", "per transaction"],
    "Continuous (automated)": ["continuous", "continuous automated", "automated", "system", "real time", "realtime", "ongoing", "always on"],
  },
  status: { Active: ["active", "current", "existing", "in place"], "New in period": ["new", "new in period", "added"], "Changed in period": ["changed", "changed in period", "modified", "updated"], Retired: ["retired", "inactive", "removed", "decommissioned", "deleted"] },
  assertion: {
    "Existence or occurrence": ["existence or occurrence", "existence", "occurrence", "e o", "eo", "e", "o", "cut off", "cutoff"],
    Completeness: ["completeness", "c", "complete"],
    "Valuation or allocation": ["valuation or allocation", "valuation", "allocation", "v a", "va", "v", "accuracy", "measurement"],
    "Rights and obligations": ["rights and obligations", "rights obligations", "r o", "ro", "rights", "obligations"],
    "Presentation and disclosure": ["presentation and disclosure", "presentation", "disclosure", "p d", "pd", "classification", "understandability"],
  },
  itgc_domain: {
    "Access to programs and data": ["access to programs and data", "access to programs data", "logical access", "access", "security", "access management", "user access", "apd", "information security", "access to programs"],
    "Program change": ["program change", "program changes", "change management", "change", "changes", "pc", "cm", "change control"],
    "Program development": ["program development", "development", "sdlc", "system development", "implementation", "pd", "acquisition and development", "systems development"],
    "Computer operations": ["computer operations", "operations", "it operations", "co", "ops", "it ops", "computer ops"],
  },
  hosting: { "On-premises": ["on premises", "on prem", "onprem", "on premise", "in house", "self hosted"], IaaS: ["iaas", "infrastructure as a service", "cloud iaas"], PaaS: ["paas", "platform as a service"], SaaS: ["saas", "software as a service", "cloud", "hosted", "vendor hosted"] },
  report_type: {
    Standard: ["standard", "canned", "system report", "out of the box", "ootb", "standard report", "system generated", "delivered"],
    Custom: ["custom", "custom report", "customized", "modified", "bespoke"],
    "Query / ad hoc": ["query", "ad hoc", "adhoc", "sql", "query ad hoc", "user query", "parameterized"],
    "End-user computing (spreadsheet)": ["end user computing", "euc", "spreadsheet", "excel", "end user computing spreadsheet", "manual spreadsheet"],
  },
  rating: { High: ["high", "h", "3", "significant"], Medium: ["medium", "m", "moderate", "2", "med"], Low: ["low", "l", "1"] },
  risk_category: { "Business process": ["business process", "business", "process", "financial", "romm", "financial reporting"], IT: ["it", "itgc", "technology", "information technology", "it risk"] },
  entity_type: { "Legal entity": ["legal entity", "entity", "company"], "Business unit": ["business unit", "bu", "division", "segment"], Location: ["location", "site", "region", "country"], "Shared service center": ["shared service center", "ssc", "shared services"] },
  itac_type: {
    "Configuration / edit check": ["configuration", "edit check", "configuration edit check", "validation", "input control", "config"],
    Calculation: ["calculation", "calc", "computation"],
    "Interface / data transfer": ["interface", "data transfer", "interface data transfer", "integration"],
    "Automated workflow / approval": ["workflow", "automated workflow", "approval workflow", "automated approval"],
    "Access-based segregation": ["access based segregation", "segregation", "sod", "access restriction", "authorization"],
    "Automated report": ["automated report", "report"],
  },
  soc_type: { "Type 2": ["type 2", "type ii", "soc 1 type 2", "soc1 type 2", "t2"], "Type 1": ["type 1", "type i", "soc 1 type 1", "t1"], None: ["none", "no report", "n a", "na"] },
  opinion: { Unqualified: ["unqualified", "unmodified", "clean"], Qualified: ["qualified", "modified"], Adverse: ["adverse"], Disclaimer: ["disclaimer", "disclaimed"] },
  coso: { "Control environment": ["control environment"], "Risk assessment": ["risk assessment"], "Control activities": ["control activities"], "Information and communication": ["information and communication"], "Monitoring activities": ["monitoring activities", "monitoring"] },
};

const ITGC: Category[] = ["IT general control"];
const BPC_ALL: Category[] = ["Business process control", "IT-dependent manual control", "IT application control"];

export const FIELDS: FieldDef[] = [
  // header (key / value sheet)
  { key: "header.client", label: "Client", object: "header", req: "M", description: "Client name.", synonyms: ["client", "company", "client name", "organization"] },
  { key: "header.as_of", label: "RCM as-of date", object: "header", req: "M", description: "Date the RCM reflects.", synonyms: ["rcm as of date", "as of date", "as of", "version date", "rcm date"] },
  { key: "header.period_start", label: "Fiscal period start", object: "header", req: "M", description: "", synonyms: ["fiscal period start", "period start", "fiscal year start"] },
  { key: "header.period_end", label: "Fiscal period end", object: "header", req: "M", description: "", synonyms: ["fiscal period end", "period end", "fiscal year end", "year end"] },
  { key: "header.prepared_by", label: "Prepared by", object: "header", req: "M", description: "", synonyms: ["prepared by", "preparer", "owner", "maintained by"] },
  { key: "header.approved_by", label: "Approved by", object: "header", req: "R", description: "", synonyms: ["approved by", "approver"] },
  { key: "header.approval_date", label: "Approval date", object: "header", req: "R", description: "", synonyms: ["approval date", "date approved"] },
  { key: "header.source", label: "Source", object: "header", req: "R", description: "", synonyms: ["source", "source system"] },

  // entities
  { key: "entity.id", label: "Entity ID", object: "entity", req: "M", description: "", synonyms: ["entity id", "location id", "bu id", "legal entity id", "entity code"] },
  { key: "entity.name", label: "Entity name", object: "entity", req: "M", description: "", synonyms: ["entity name", "entity", "location", "legal entity", "business unit", "bu", "region", "organization", "entities"] },
  { key: "entity.type", label: "Entity type", object: "entity", req: "R", description: "", synonyms: ["entity type", "location type"], list: "entity_type" },
  { key: "entity.in_scope", label: "In scope this period", object: "entity", req: "R", description: "", synonyms: ["in scope this period", "in scope", "scoped"], list: "yesno" },

  // processes
  { key: "process.id", label: "Process ID", object: "process", req: "M", description: "", synonyms: ["process id", "process code", "process uid", "cycle id"] },
  { key: "process.name", label: "Process name", object: "process", req: "M", description: "", synonyms: ["process name", "process", "business process", "cycle", "process area", "mega process", "l1 process"] },
  { key: "process.subprocess_id", label: "Sub-process ID", object: "process", req: "M", description: "", synonyms: ["sub process id", "subprocess id", "subprocess uid", "sub process code"] },
  { key: "process.subprocess_name", label: "Sub-process name", object: "process", req: "M", description: "", synonyms: ["sub process name", "sub process", "subprocess", "sub cycle", "l2 process", "activity"] },
  { key: "process.owner", label: "Process owner", object: "process", req: "R", description: "", synonyms: ["process owner"] },
  { key: "process.narrative_ref", label: "Narrative / flowchart reference", object: "process", req: "R", description: "", synonyms: ["narrative flowchart reference", "narrative reference", "narrative", "flowchart", "walkthrough reference"] },

  // accounts
  { key: "account.id", label: "Account ID", object: "account", req: "M", description: "", synonyms: ["account id", "fsli id", "account code"] },
  { key: "account.name", label: "Significant account or disclosure", object: "account", req: "M", description: "AS 2201.28.", synonyms: ["significant account or disclosure", "significant account", "account", "fsli", "financial statement line item", "financial statement caption", "account group", "accounts"] },
  { key: "account.assertions", label: "Relevant assertions", object: "account", req: "M", description: "AS 1105.11.", synonyms: ["relevant assertions", "assertions", "assertion", "financial statement assertions"], list: "assertion", multi: true },
  { key: "account.processes", label: "Process IDs", object: "account", req: "M", description: "", synonyms: ["process ids", "processes"], multi: true },
  { key: "account.significance", label: "Significance basis", object: "account", req: "R", description: "", synonyms: ["significance basis", "significance", "materiality"] },

  // systems
  { key: "system.id", label: "System ID", object: "system", req: "M", description: "", synonyms: ["system id", "application id", "app id", "system code"] },
  { key: "system.name", label: "System name", object: "system", req: "M", description: "", synonyms: ["system name", "system", "application", "application name", "app", "in scope application", "financial application", "systems", "applications"] },
  { key: "system.financial_relevance", label: "Financial relevance", object: "system", req: "M", description: "Why the system is in scope.", synonyms: ["financial relevance", "relevance", "purpose", "financial significance", "used for", "business processes supported"] },
  { key: "system.layer_application", label: "Application layer", object: "system", req: "M", description: "", synonyms: ["application layer", "application"] },
  { key: "system.layer_database", label: "Database", object: "system", req: "C", description: "When in scope.", synonyms: ["database", "db", "database layer"] },
  { key: "system.layer_os", label: "Operating system", object: "system", req: "C", description: "When in scope.", synonyms: ["operating system", "os", "os layer", "server"] },
  { key: "system.layer_network", label: "Network / perimeter", object: "system", req: "R", description: "", synonyms: ["network perimeter", "network"] },
  { key: "system.layer_idp", label: "Identity provider", object: "system", req: "C", description: "When users authenticate through one.", synonyms: ["identity provider", "idp", "sso", "authentication"] },
  { key: "system.hosting", label: "Hosting", object: "system", req: "M", description: "", synonyms: ["hosting", "hosting model", "delivery model", "deployment", "on prem cloud", "hosted"], list: "hosting" },
  { key: "system.service_org", label: "Service organization ID", object: "system", req: "C", description: "When outsourced or SaaS.", synonyms: ["service organization id", "service organization", "vendor", "service provider", "third party"] },
  { key: "system.owner", label: "System owner", object: "system", req: "R", description: "", synonyms: ["system owner", "business owner", "application owner"] },
  { key: "system.it_owner", label: "IT owner", object: "system", req: "R", description: "", synonyms: ["it owner", "technical owner", "administrator"] },
  { key: "system.interfaces", label: "Interfaces and batch jobs", object: "system", req: "R", description: "", synonyms: ["interfaces and batch jobs", "interfaces", "batch jobs"] },

  // IPE
  { key: "ipe.id", label: "IPE ID", object: "ipe", req: "M", description: "", synonyms: ["ipe id", "report id", "key report id"] },
  { key: "ipe.name", label: "Report name", object: "ipe", req: "M", description: "", synonyms: ["report name", "report", "ipe", "key report", "ipe name", "report title"] },
  { key: "ipe.system", label: "Source system ID", object: "ipe", req: "M", description: "", synonyms: ["source system id", "source system", "system"] },
  { key: "ipe.type", label: "Report type", object: "ipe", req: "M", description: "", synonyms: ["report type", "ipe type", "type"], list: "report_type" },
  { key: "ipe.parameters", label: "Parameters / criteria", object: "ipe", req: "C", description: "For queries and parameterized reports.", synonyms: ["parameters criteria", "parameters", "criteria", "filters"] },
  { key: "ipe.data_source", label: "Data source", object: "ipe", req: "R", description: "", synonyms: ["data source", "source tables", "tables"] },
  { key: "ipe.controls", label: "Used by control IDs", object: "ipe", req: "M", description: "", synonyms: ["used by control ids", "used by controls", "controls", "control ids", "related controls"], multi: true },
  { key: "ipe.ca_control", label: "Client completeness and accuracy control", object: "ipe", req: "C", description: "For custom reports, queries, and spreadsheets.", synonyms: ["client completeness and accuracy control", "completeness and accuracy", "c a", "ca control", "validation"] },
  { key: "ipe.owner", label: "Report owner", object: "ipe", req: "R", description: "", synonyms: ["report owner", "owner"] },
  { key: "ipe.changed", label: "Logic changed in period", object: "ipe", req: "R", description: "", synonyms: ["logic changed in period", "changed in period", "changed"], list: "yesno" },

  // risks
  { key: "risk.id", label: "Risk ID", object: "risk", req: "M", description: "", synonyms: ["risk id", "risk", "risk no", "risk number", "risk ref", "risk reference", "risk code", "riskid", "risk ids", "risks", "related risks", "risk ids addressed"], multi: true },
  { key: "risk.statement", label: "Risk statement (what could go wrong)", object: "risk", req: "M", description: "AS 2201.30.", synonyms: ["risk statement what could go wrong", "risk statement", "risk description", "what could go wrong", "wcgw", "risk title", "risk name"] },
  { key: "risk.category", label: "Risk category", object: "risk", req: "M", description: "", synonyms: ["risk category", "risk type"], list: "risk_category" },
  { key: "risk.process", label: "Process ID", object: "risk", req: "M", description: "", synonyms: ["process id"] },
  { key: "risk.subprocess", label: "Sub-process ID", object: "risk", req: "M", description: "", synonyms: ["sub process id"] },
  { key: "risk.accounts", label: "Account IDs", object: "risk", req: "C", applies_to: ["Business process control"], description: "Business process risks.", synonyms: ["account ids", "accounts", "fsli"], multi: true },
  { key: "risk.assertions", label: "Assertions at risk", object: "risk", req: "C", description: "Business process risks.", synonyms: ["assertions at risk", "assertions"], list: "assertion", multi: true },
  { key: "risk.itgc_domain", label: "ITGC domain", object: "risk", req: "C", description: "IT risks.", synonyms: ["itgc domain", "domain"], list: "itgc_domain" },
  { key: "risk.module", label: "Methodology module", object: "risk", req: "C", description: "IT risks.", synonyms: ["methodology module", "module"] },
  { key: "risk.systems", label: "System IDs", object: "risk", req: "C", description: "IT risks.", synonyms: ["system ids", "systems"], multi: true },
  { key: "risk.likelihood", label: "Likelihood", object: "risk", req: "R", description: "AS 2110.59.", synonyms: ["likelihood", "probability"], list: "rating" },
  { key: "risk.magnitude", label: "Magnitude", object: "risk", req: "R", description: "", synonyms: ["magnitude", "impact", "severity"], list: "rating" },
  { key: "risk.rating", label: "Risk rating", object: "risk", req: "R", description: "Combined inherent rating when likelihood and magnitude are not separate.", synonyms: ["risk rating", "inherent risk", "inherent risk rating", "romm", "risk level", "rating", "risk of material misstatement"], list: "rating" },
  { key: "risk.fraud", label: "Fraud risk", object: "risk", req: "R", description: "AS 2110.65 to .71.", synonyms: ["fraud risk", "fraud", "fraud risk y n"], list: "yesno" },
  { key: "risk.significant", label: "Significant risk", object: "risk", req: "R", description: "AS 2110.71.", synonyms: ["significant risk"], list: "yesno" },

  // service organizations and CUECs
  { key: "service_org.id", label: "Service organization ID", object: "service_org", req: "M", description: "", synonyms: ["service organization id", "vendor id", "service org id"] },
  { key: "service_org.name", label: "Service organization", object: "service_org", req: "M", description: "", synonyms: ["service organization", "vendor", "service provider", "service org"] },
  { key: "service_org.services", label: "Services provided", object: "service_org", req: "M", description: "", synonyms: ["services provided", "services", "service description"] },
  { key: "service_org.systems", label: "System IDs", object: "service_org", req: "M", description: "", synonyms: ["system ids", "systems"], multi: true },
  { key: "service_org.soc_type", label: "SOC report", object: "service_org", req: "M", description: "", synonyms: ["soc report", "soc type", "report type", "soc 1"], list: "soc_type" },
  { key: "service_org.period_start", label: "Report period start", object: "service_org", req: "M", description: "", synonyms: ["report period start", "period start"] },
  { key: "service_org.period_end", label: "Report period end", object: "service_org", req: "M", description: "", synonyms: ["report period end", "period end"] },
  { key: "service_org.opinion", label: "Opinion", object: "service_org", req: "M", description: "", synonyms: ["opinion", "report opinion"], list: "opinion" },
  { key: "service_org.subservice", label: "Subservice organization method", object: "service_org", req: "R", description: "", synonyms: ["subservice organization method", "subservice", "carve out inclusive"] },
  { key: "service_org.bridge_letter", label: "Bridge letter", object: "service_org", req: "C", description: "When the report period does not reach the as-of date.", synonyms: ["bridge letter", "gap letter"], list: "yesno" },
  { key: "cuec.service_org", label: "Service organization ID", object: "cuec", req: "M", description: "", synonyms: ["service organization id", "service organization"] },
  { key: "cuec.id", label: "CUEC ID", object: "cuec", req: "M", description: "", synonyms: ["cuec id", "cuec", "cuec no"] },
  { key: "cuec.text", label: "Complementary user entity control", object: "cuec", req: "M", description: "", synonyms: ["complementary user entity control", "cuec description", "user entity control"] },
  { key: "cuec.controls", label: "Mapped client control IDs", object: "cuec", req: "M", description: "", synonyms: ["mapped client control ids", "mapped controls", "client controls"], multi: true },

  // controls: every control
  { key: "control.id", label: "Control ID", object: "control", req: "M", description: "Unique and stable across years.", synonyms: ["control id", "control", "control no", "control number", "control ref", "control reference", "control code", "uid", "controlid", "control #", "ctrl id", "control key", "number", "ref"] },
  { key: "control.title", label: "Control title", object: "control", req: "R", description: "", synonyms: ["control title", "control name", "title", "name", "short description"] },
  { key: "control.category", label: "Control category", object: "control", req: "M", description: "Business process, IT-dependent manual, IT application, IT general, or entity-level.", synonyms: ["control category", "category", "control class", "control level", "control classification"], list: "category" },
  { key: "control.description", label: "Control description", object: "control", req: "M", description: "Who, what, when, how, evidence (D1).", synonyms: ["control description", "description", "control activity", "control activities", "activity description", "control narrative", "control procedure", "what is the control", "control statement", "control detail"] },
  { key: "control.objective", label: "Control objective", object: "control", req: "R", description: "", synonyms: ["control objective", "objective", "control objectives"] },
  { key: "control.entities", label: "Entity IDs", object: "control", req: "M", description: "", synonyms: ["entity ids", "entities", "entity", "location", "locations", "business unit", "legal entity", "region"], multi: true },
  { key: "control.process", label: "Process ID", object: "control", req: "M", description: "", synonyms: ["process id", "process", "business process", "cycle", "process name"] },
  { key: "control.subprocess", label: "Sub-process ID", object: "control", req: "M", description: "", synonyms: ["sub process id", "sub process", "subprocess", "sub process name", "subprocess name", "sub cycle"] },
  { key: "control.risks", label: "Risk IDs", object: "control", req: "M", description: "AS 2201.39 to .40.", synonyms: ["risk ids", "risk id", "risks", "risk", "related risks", "risk ref", "risk no", "risks addressed", "risk number", "riskid", "linked risks"], multi: true },
  { key: "control.type", label: "Control type", object: "control", req: "M", description: "Preventive or detective.", synonyms: ["control type", "type", "preventive detective", "p d", "prevent detect", "preventdetect", "classification", "control nature p d"], list: "type" },
  { key: "control.nature", label: "Nature", object: "control", req: "M", description: "Manual, IT-dependent manual, or automated.", synonyms: ["nature", "control nature", "automation", "manual automated", "auto manual", "method", "automated manual", "manual automatic", "control method", "execution"], list: "nature" },
  { key: "control.frequency", label: "Frequency", object: "control", req: "M", description: "", synonyms: ["frequency", "control frequency", "periodicity", "how often", "timing", "freq"], list: "frequency" },
  { key: "control.key", label: "Key control", object: "control", req: "M", description: "Only key controls are relied on for the SOX opinion.", synonyms: ["key control", "key", "key non key", "key y n", "key control y n", "significance", "control weight", "key nonkey", "is key", "key controls"], list: "yesno" },
  { key: "control.owner", label: "Control owner", object: "control", req: "M", description: "", synonyms: ["control owner", "owner", "owneruser", "owning group", "responsible", "accountable", "control owner name", "owner name"] },
  { key: "control.performer", label: "Performer", object: "control", req: "C", description: "When different from the owner.", synonyms: ["performer", "control performer", "preparer", "performed by", "executor"] },
  { key: "control.evidence", label: "Evidence of performance", object: "control", req: "M", description: "Artifact and where it is kept.", synonyms: ["evidence of performance", "evidence", "control evidence", "documentation", "evidence retained", "evidence location", "supporting documentation", "artifact", "artifacts"] },
  { key: "control.systems", label: "System IDs", object: "control", req: "C", applies_to: ["IT-dependent manual control", "IT application control", "IT general control"], description: "", synonyms: ["system ids", "systems", "system", "application", "applications", "in scope systems", "it systems", "related systems", "it dependency", "application name", "system name"], multi: true },
  { key: "control.ipe", label: "IPE IDs relied on", object: "control", req: "C", description: "When the control uses a report, query, or spreadsheet.", synonyms: ["ipe ids relied on", "ipe", "ipe used", "key reports", "reports used", "reports", "ipe ids", "key report"], multi: true },
  { key: "control.service_org", label: "Service organization ID", object: "control", req: "C", description: "When a third party performs part of the control.", synonyms: ["service organization id", "service organization", "third party", "vendor"] },
  { key: "control.status", label: "Status", object: "control", req: "C", description: "", synonyms: ["status", "control status", "state"], list: "status" },
  { key: "control.effective_date", label: "Effective date", object: "control", req: "C", description: "When the status is not Active.", synonyms: ["effective date", "date changed", "change date", "implementation date"] },
  { key: "control.policy_ref", label: "Policy / procedure reference", object: "control", req: "R", description: "", synonyms: ["policy procedure reference", "policy", "procedure", "policy reference", "sop"] },
  { key: "control.prior_deficiency", label: "Prior-year deficiency", object: "control", req: "R", description: "", synonyms: ["prior year deficiency", "prior deficiency", "deficiency", "issues"] },
  // business process and management review controls
  { key: "control.accounts_assertions", label: "Accounts and assertions addressed", object: "control", req: "C", applies_to: BPC_ALL, description: "", synonyms: ["accounts and assertions addressed", "assertions", "accounts", "fsli", "significant accounts", "assertions addressed", "financial statement assertions"], multi: true },
  { key: "control.reviewed_matched", label: "What is reviewed or matched", object: "control", req: "C", applies_to: ["Business process control"], description: "", synonyms: ["what is reviewed or matched", "what is reviewed", "review object"] },
  { key: "control.thresholds", label: "Criteria / thresholds", object: "control", req: "C", description: "", synonyms: ["criteria thresholds", "thresholds", "threshold", "tolerance", "criteria"] },
  { key: "control.reviewer", label: "Reviewer / approver and independence", object: "control", req: "C", description: "", synonyms: ["reviewer approver and independence", "reviewer", "approver", "reviewed by", "approved by"] },
  { key: "control.population", label: "Population (what one occurrence is)", object: "control", req: "C", description: "", synonyms: ["population what one occurrence is", "population"] },
  { key: "control.it_dependency", label: "IT dependency", object: "control", req: "C", applies_to: ["IT-dependent manual control"], description: "", synonyms: ["it dependency", "it dependencies", "system dependency"] },
  { key: "control.is_mrc", label: "Management review control", object: "control", req: "C", description: "", synonyms: ["management review control", "mrc", "management review"], list: "yesno" },
  { key: "control.review_objective", label: "Review objective", object: "control", req: "C", description: "Management review controls.", synonyms: ["review objective"] },
  { key: "control.precision", label: "Level of precision", object: "control", req: "C", description: "", synonyms: ["level of precision", "precision"] },
  { key: "control.expectation", label: "Expectation / criteria", object: "control", req: "C", description: "", synonyms: ["expectation criteria", "expectation"] },
  { key: "control.investigation_threshold", label: "Investigation threshold", object: "control", req: "C", description: "", synonyms: ["investigation threshold"] },
  { key: "control.investigation_resolution", label: "Investigation and resolution", object: "control", req: "C", description: "", synonyms: ["investigation and resolution", "follow up", "resolution"] },
  // ITACs
  { key: "control.itac_type", label: "ITAC type", object: "control", req: "C", applies_to: ["IT application control"], description: "", synonyms: ["itac type", "application control type", "automated control type"], list: "itac_type" },
  { key: "control.config_location", label: "Configuration location", object: "control", req: "C", applies_to: ["IT application control"], description: "", synonyms: ["configuration location", "configuration", "config location", "transaction code", "t code"] },
  { key: "control.logic", label: "Logic / configuration description", object: "control", req: "C", applies_to: ["IT application control"], description: "", synonyms: ["logic configuration description", "logic", "configuration description", "configuration settings", "system logic"] },
  { key: "control.supporting_itgcs", label: "Supporting ITGC control IDs", object: "control", req: "C", applies_to: ["IT application control"], description: "", synonyms: ["supporting itgc control ids", "supporting itgcs", "itgc dependencies", "itgc dependency", "related itgcs", "dependent itgcs"], multi: true },
  { key: "control.baseline", label: "Baseline / last tested", object: "control", req: "R", description: "AS 2201.B29 to .B31 benchmarking.", synonyms: ["baseline last tested", "baseline", "benchmark", "last tested", "benchmark date"] },
  { key: "control.configurable_by", label: "Configurable by (roles)", object: "control", req: "R", description: "", synonyms: ["configurable by roles", "configurable by"] },
  // ITGCs
  { key: "control.itgc_domain", label: "ITGC domain", object: "control", req: "C", applies_to: ITGC, description: "", synonyms: ["itgc domain", "domain", "itgc area", "itgc category", "it domain", "control domain", "itgc process"], list: "itgc_domain" },
  { key: "control.itgc_module", label: "Methodology module", object: "control", req: "C", applies_to: ITGC, description: "One of the thirteen modules.", synonyms: ["methodology module", "module", "itgc sub process", "itgc subprocess", "control area", "itgc module"] },
  { key: "control.layers", label: "Layers covered", object: "control", req: "C", applies_to: ITGC, description: "", synonyms: ["layers covered", "layers", "technology layer", "layer", "platform", "platforms"] },
  { key: "control.population_source", label: "Population source", object: "control", req: "C", description: "Event-driven ITGCs.", synonyms: ["population source", "population", "source of population"] },
  { key: "control.operating_criteria", label: "Operating criteria", object: "control", req: "C", description: "Label: value pairs separated by ';', for example 'Removal timeframe: 5 business days; Approver: CAB'.", synonyms: ["operating criteria", "criteria", "timeframes", "control criteria", "parameters"] },
  { key: "control.supports", label: "Supports (ITAC / IPE / ITDM IDs)", object: "control", req: "R", description: "", synonyms: ["supports itac ipe itdm ids", "supports", "dependent controls"], multi: true },
  // entity-level
  { key: "control.coso_component", label: "COSO component", object: "control", req: "R", description: "", synonyms: ["coso component", "coso"], list: "coso" },
  { key: "control.coso_principle", label: "COSO principle (1 to 17)", object: "control", req: "R", description: "", synonyms: ["coso principle 1 to 17", "coso principle", "principle"] },
  // engagement-side (recognized, not required)
  { key: "control.test_procedures", label: "Test procedures", object: "control", req: "E", description: "Produced by the engagement team.", synonyms: ["test procedures", "test procedure", "test steps", "testing procedures", "test plan", "test attributes", "testing attributes"] },
  { key: "control.test_type", label: "Test type", object: "control", req: "E", description: "", synonyms: ["test type", "testing method", "test method", "nature of test"] },
  { key: "control.test_result", label: "Test result", object: "control", req: "E", description: "", synonyms: ["test result", "test results", "conclusion", "testing conclusion", "operating effectiveness", "design effectiveness", "toe result", "tod result"] },
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

/** Lowercase, strip punctuation and a trailing "*" requirement marker; "Control #" -> "control #" kept as "control". */
export function normHeader(h: string | null | undefined): string {
  return (h ?? "").toLowerCase().replace(/\*/g, " ").replace(/[^a-z0-9#]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normValue(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Canonical value for a picklist, or null when the value is not recognized. */
export function normalizePick(list: string, raw: string): string | null {
  const v = normValue(raw);
  if (!v) return null;
  for (const [canonical, variants] of Object.entries(PICKLISTS[list] ?? {})) {
    if (normValue(canonical) === v || variants.includes(v)) return canonical;
  }
  return null;
}

/** Split a multi-value cell: semicolons, commas, newlines, pipes. */
export function splitMulti(raw: string): string[] {
  return raw.split(/[;,\n|]+/).map((x) => x.trim()).filter(Boolean);
}

export const SHEET_ROLES = ["header", "entities", "processes", "accounts", "systems", "ipe", "risks", "controls", "service_organizations", "cuecs", "lists", "instructions", "ignore"] as const;
export type SheetRole = (typeof SHEET_ROLES)[number];

export const ROLE_OBJECT: Partial<Record<SheetRole, Kind>> = {
  header: "header", entities: "entity", processes: "process", accounts: "account", systems: "system", ipe: "ipe", risks: "risk",
  controls: "control", service_organizations: "service_org", cuecs: "cuec",
};

export const SHEET_NAME_SYNONYMS: Record<SheetRole, string[]> = {
  header: ["header", "cover", "rcm header", "about"],
  entities: ["entities", "entity", "locations", "business units"],
  processes: ["processes", "process", "process list", "cycles"],
  accounts: ["accounts", "significant accounts", "fsli", "accounts and assertions", "account assertion"],
  systems: ["systems", "applications", "application inventory", "in scope systems", "financial applications", "it systems", "system inventory"],
  ipe: ["ipe", "key reports", "reports", "ipe inventory", "report inventory"],
  risks: ["risks", "risk", "risk register", "risk library", "wcgw"],
  controls: ["controls", "rcm", "risk control matrix", "risk and control matrix", "control matrix", "itgc", "itgcs", "itgc rcm", "control library", "matrix", "sox rcm", "itgc matrix", "controls library"],
  service_organizations: ["service organizations", "service orgs", "vendors", "soc reports", "third parties"],
  cuecs: ["cuecs", "cuec", "user entity controls", "complementary user entity controls"],
  lists: ["lists", "picklists", "lookups", "dropdowns", "values"],
  instructions: ["instructions", "read me", "readme", "guidance", "legend"],
  ignore: [],
};
