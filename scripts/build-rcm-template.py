"""Build templates/rcm-template.xlsx from the RCM field standard v0.2 (architecture/rcm-field-standard.md).
Requires openpyxl: python3 -m pip install openpyxl; then python3 scripts/build-rcm-template.py"""
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation

import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "templates", "rcm-template.xlsx")
F = "Arial"
thin = Side(style="thin", color="D0D0D7")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
HEAD = PatternFill("solid", fgColor="202123")
REQ = {"M": ("Mandatory", "B42318", "FEF3F2"), "C": ("Conditional", "B54708", "FFFAEB"), "R": ("Recommended", "475467", "F2F4F7"), "X": ("Calculated", "175CD3", "EFF8FF")}
EXAMPLE = PatternFill("solid", fgColor="F6F6F8")
INPUT = PatternFill("solid", fgColor="FFFFFF")

LISTS = {
    "YesNo": ["Yes", "No"],
    "Source": ["Auditor template", "Optro (AuditBoard) export", "Workiva export", "ServiceNow export", "Archer export", "Diligent HighBond export", "Client spreadsheet", "Other"],
    "EntityType": ["Legal entity", "Business unit", "Location", "Shared service center"],
    "Hosting": ["On-premises", "IaaS", "PaaS", "SaaS"],
    "ReportType": ["Standard", "Custom", "Query / ad hoc", "End-user computing (spreadsheet)"],
    "RiskCategory": ["Business process", "IT"],
    "ITGCDomain": ["Access to programs and data", "Program change", "Program development", "Computer operations"],
    "Module": ["AC-UAR", "AC-PRIV", "AC-PROV", "AC-TERM", "AC-AUTH", "AC-PHYS", "CM-CHG", "CM-DATA", "DEV-SDLC", "CO-JOB", "CO-BKP", "CO-INC", "TP-SOC1"],
    "Rating": ["High", "Medium", "Low"],
    "Category": ["Business process control", "IT-dependent manual control", "IT application control", "IT general control", "Entity-level control"],
    "ControlType": ["Preventive", "Detective"],
    "Nature": ["Manual", "IT-dependent manual", "Automated"],
    "Frequency": ["Annual", "Semi-annual", "Quarterly", "Monthly", "Weekly", "Daily", "Multiple times per day", "Event-driven", "Continuous (automated)"],
    "Status": ["Active", "New in period", "Changed in period", "Retired"],
    "ITACType": ["Configuration / edit check", "Calculation", "Interface / data transfer", "Automated workflow / approval", "Access-based segregation", "Automated report"],
    "COSO": ["Control environment", "Risk assessment", "Control activities", "Information and communication", "Monitoring activities"],
    "SOCType": ["Type 2", "Type 1", "None"],
    "Opinion": ["Unqualified", "Qualified", "Adverse", "Disclaimer"],
    "Subservice": ["Carve-out", "Inclusive", "None"],
    "Assertion": ["Existence or occurrence", "Completeness", "Valuation or allocation", "Rights and obligations", "Presentation and disclosure"],
}

# (header, requirement, note, list name or None, width, example value)
TABS = {
 "Entities": [
  ("Entity ID", "M", "Short stable key, for example ENT-US.", None, 14, "EX-ENT-US"),
  ("Entity name", "M", "Legal entity, business unit, region, or location.", None, 30, "Northwind Foods Inc. (US)"),
  ("Entity type", "R", None, "EntityType", 20, "Legal entity"),
  ("In scope this period", "R", "The engagement's scoping decision governs.", "YesNo", 14, "Yes")],
 "Processes": [
  ("Process ID", "M", None, None, 12, "EX-OTC"),
  ("Process name", "M", "For example Order to Cash, Procure to Pay, Record to Report. ITGCs: use the ITGC domain.", None, 26, "Order to Cash"),
  ("Sub-process ID", "M", None, None, 14, "EX-OTC-02"),
  ("Sub-process name", "M", "ITGCs: use the methodology module, for example AC-UAR.", None, 26, "Billing"),
  ("Process owner", "R", None, None, 22, "Revenue Controller"),
  ("Narrative / flowchart reference", "R", "Document that describes the process; upload it with the RCM.", None, 30, "OTC narrative v3, section 2")],
 "Accounts": [
  ("Account ID", "M", None, None, 12, "EX-AR"),
  ("Significant account or disclosure", "M", "Financial statement caption or account group (AS 2201.28).", None, 30, "Accounts receivable"),
  ("Relevant assertions", "M", "One or more, separated by ';' (AS 1105.11). See Lists.", "Assertion", 36, "Existence or occurrence; Valuation or allocation"),
  ("Process IDs", "M", "Processes that affect the account, separated by ';'.", None, 16, "EX-OTC"),
  ("Significance basis", "R", None, None, 30, "Above planning materiality; revenue-driven")],
 "Systems": [
  ("System ID", "M", None, None, 12, "EX-SAP"),
  ("System name", "M", None, None, 20, "SAP ECC 6.0"),
  ("Financial relevance", "M", "Processes, accounts, ITACs, and reports that depend on it: why it is in scope.", None, 36, "GL, billing, AR; pricing and three-way-match ITACs; aged AR report"),
  ("Application layer", "M", None, None, 18, "SAP ECC"),
  ("Database", "C", "When the database is in scope for access and change controls.", None, 16, "Oracle 19c"),
  ("Operating system", "C", "When in scope.", None, 16, "RHEL 8"),
  ("Network / perimeter", "R", None, None, 16, "Corporate network"),
  ("Identity provider", "C", "When users authenticate through one.", None, 16, "Okta"),
  ("Hosting", "M", None, "Hosting", 14, "On-premises"),
  ("Service organization ID", "C", "When outsourced or SaaS: key on the Service organizations tab.", None, 18, ""),
  ("System owner", "R", None, None, 18, "Finance Systems Director"),
  ("IT owner", "R", None, None, 18, "SAP Basis Lead"),
  ("Interfaces and batch jobs", "R", None, None, 30, "Salesforce orders to SAP (nightly)")],
 "IPE": [
  ("IPE ID", "M", None, None, 12, "EX-IPE-01"),
  ("Report name", "M", "As the system or users know it.", None, 26, "Aged accounts receivable (S_ALR_87012178)"),
  ("Source system ID", "M", None, None, 14, "EX-SAP"),
  ("Report type", "M", "Determines how completeness and accuracy are tested.", "ReportType", 22, "Standard"),
  ("Parameters / criteria", "C", "For queries and parameterized reports: the parameters used when run.", None, 28, "Company code 1000; key date = period end"),
  ("Data source", "R", "Tables, modules, or upstream systems.", None, 20, "FI-AR open items"),
  ("Used by control IDs", "M", "Separated by ';'. A report used by no control is not IPE.", None, 18, "EX-OTC-C05"),
  ("Client completeness and accuracy control", "C", "For custom reports, queries, and spreadsheets: how management ensures it is complete and accurate (AS 1105.10).", None, 34, ""),
  ("Report owner", "R", None, None, 18, "AR Manager"),
  ("Logic changed in period", "R", None, "YesNo", 14, "No")],
 "Risks": [
  ("Risk ID", "M", None, None, 12, "EX-R-OTC-01"),
  ("Risk statement (what could go wrong)", "M", "AS 2201.30.", None, 40, "Invoices are recorded at incorrect prices."),
  ("Risk category", "M", None, "RiskCategory", 16, "Business process"),
  ("Process ID", "M", None, None, 12, "EX-OTC"),
  ("Sub-process ID", "M", None, None, 14, "EX-OTC-02"),
  ("Account IDs", "C", "Business process risks: accounts at risk, separated by ';'.", None, 14, "EX-AR"),
  ("Assertions at risk", "C", "Business process risks: separated by ';'.", "Assertion", 28, "Valuation or allocation"),
  ("ITGC domain", "C", "IT risks.", "ITGCDomain", 24, ""),
  ("Methodology module", "C", "IT risks: one of the thirteen modules.", "Module", 14, ""),
  ("System IDs", "C", "IT risks (recommended for business risks), separated by ';'.", None, 14, "EX-SAP"),
  ("Likelihood", "R", "Before controls (AS 2110.59). The auditor's assessment governs.", "Rating", 12, "Medium"),
  ("Magnitude", "R", None, "Rating", 12, "High"),
  ("Fraud risk", "R", "AS 2110.65 to .71.", "YesNo", 10, "No"),
  ("Significant risk", "R", "AS 2110.71.", "YesNo", 12, "No")],
 "Service organizations": [
  ("Service organization ID", "M", None, None, 16, "EX-SO-01"),
  ("Service organization", "M", None, None, 24, "Cirrus Payroll Services"),
  ("Services provided", "M", None, None, 28, "Payroll processing and hosting"),
  ("System IDs", "M", "Separated by ';'.", None, 14, "EX-PAYROLL"),
  ("SOC report", "M", None, "SOCType", 12, "Type 2"),
  ("Report period start", "M", None, None, 14, "2025-10-01"),
  ("Report period end", "M", None, None, 14, "2026-09-30"),
  ("Opinion", "M", None, "Opinion", 14, "Unqualified"),
  ("Subservice organization method", "R", None, "Subservice", 16, "Carve-out"),
  ("Bridge letter", "C", "When the report period does not reach the as-of date.", "YesNo", 12, "Yes")],
 "CUECs": [
  ("Service organization ID", "M", None, None, 16, "EX-SO-01"),
  ("CUEC ID", "M", "As numbered in the SOC report.", None, 10, "CUEC-3"),
  ("Complementary user entity control", "M", "Text as stated in the SOC report.", None, 46, "User entities are responsible for reviewing payroll change reports before each pay run."),
  ("Mapped client control IDs", "M", "The client controls that address the CUEC, separated by ';'.", None, 20, "EX-PAY-C02")],
}

CONTROL_GROUPS = [
 ("All controls", "202123", [
  ("Control ID", "M", "Unique and stable across years.", None, 14, "EX-OTC-C05"),
  ("Control title", "R", None, None, 24, "Billing price check"),
  ("Control category", "M", "Determines which sections to the right apply.", "Category", 24, "IT application control"),
  ("Control description", "M", "Who performs it, what they do, when / how often, how (system, report, tool), and what evidence is retained (design criterion D1).", None, 50, "SAP blocks billing documents whose price differs from the condition record by more than 1%; blocked documents go to the billing work queue for release by the Pricing Manager."),
  ("Control objective", "R", None, None, 30, "Invoices are priced from approved price lists."),
  ("Entity IDs", "M", "Separated by ';'.", None, 12, "EX-ENT-US"),
  ("Process ID", "M", None, None, 12, "EX-OTC"),
  ("Sub-process ID", "M", None, None, 14, "EX-OTC-02"),
  ("Risk IDs", "M", "Separated by ';' (AS 2201.39 to .40).", None, 14, "EX-R-OTC-01"),
  ("Control type", "M", None, "ControlType", 12, "Preventive"),
  ("Nature", "M", "Must agree with the category (an ITAC is Automated).", "Nature", 16, "Automated"),
  ("Frequency", "M", None, "Frequency", 18, "Continuous (automated)"),
  ("Key control", "M", None, "YesNo", 10, "Yes"),
  ("Control owner", "M", None, None, 20, "Pricing Manager"),
  ("Performer", "C", "When different from the owner.", None, 18, ""),
  ("Evidence of performance", "M", "Artifact and where it is kept.", None, 30, "SAP configuration (pricing procedure); billing block log"),
  ("System IDs", "C", "IT-dependent, ITAC, and ITGC controls: separated by ';'.", None, 12, "EX-SAP"),
  ("IPE IDs relied on", "C", "When the control uses a report, query, or spreadsheet.", None, 14, ""),
  ("Service organization ID", "C", "When part of the control is performed by a third party.", None, 16, ""),
  ("Status", "C", "Effective date is mandatory when not Active.", "Status", 16, "Active"),
  ("Effective date", "C", None, None, 14, ""),
  ("Policy / procedure reference", "R", None, None, 22, "Pricing policy 4.2"),
  ("Prior-year deficiency", "R", None, None, 18, "")]),
 ("Business process and management review controls", "175CD3", [
  ("Accounts and assertions addressed", "C", "Mandatory for business process, IT-dependent manual, and IT application controls: account IDs and assertions.", None, 28, "EX-AR: Valuation or allocation"),
  ("What is reviewed or matched", "C", "Mandatory for business process controls.", None, 30, ""),
  ("Criteria / thresholds", "C", "When the control applies a threshold or tolerance.", None, 22, ""),
  ("Reviewer / approver and independence", "C", "Review and approval controls (design criterion D4).", None, 26, ""),
  ("Population (what one occurrence is)", "C", "Transaction-level controls.", None, 26, ""),
  ("IT dependency", "C", "IT-dependent manual controls: the system function or report the manual step depends on.", None, 26, ""),
  ("Management review control", "C", "Yes for reviews of estimates, analytics, reconciliations, or results.", "YesNo", 14, "No"),
  ("Review objective", "C", "Management review controls (Staff Audit Practice Alert No. 11).", None, 26, ""),
  ("Level of precision", "C", "Aggregation, consistency, correlation to assertions.", None, 26, ""),
  ("Expectation / criteria", "C", "What the reviewer expects and how it is formed.", None, 26, ""),
  ("Investigation threshold", "C", "Amount or percentage above which differences are investigated.", None, 18, ""),
  ("Investigation and resolution", "C", "Steps on items above the threshold and how resolution is evidenced.", None, 28, "")]),
 ("IT application controls", "6941C6", [
  ("ITAC type", "C", "Mandatory for IT application controls.", "ITACType", 22, "Configuration / edit check"),
  ("Configuration location", "C", "Mandatory for ITACs: transaction, table, program, or workflow where the logic lives.", None, 24, "Pricing procedure ZPR001; billing block config (VOFA)"),
  ("Logic / configuration description", "C", "Mandatory for ITACs: precise enough to test with one instance.", None, 34, "Tolerance 1% between invoice price and condition record PR00; above it, billing block 02."),
  ("Supporting ITGC control IDs", "C", "Mandatory for ITACs: at least program change and access to the configuration.", None, 18, "EX-ITGC-CHG-01; EX-ITGC-PRIV-01"),
  ("Baseline / last tested", "R", "Date the configuration was last tested; supports benchmarking.", None, 16, "2025-11-15"),
  ("Configurable by (roles)", "R", None, None, 20, "SAP pricing administrators")]),
 ("IT general controls", "027A48", [
  ("ITGC domain", "C", "Mandatory for IT general controls.", "ITGCDomain", 22, ""),
  ("Methodology module", "C", "Mandatory for IT general controls.", "Module", 14, ""),
  ("Layers covered", "C", "Mandatory for ITGCs: application, database, operating system, network, identity provider.", None, 22, ""),
  ("Population source", "C", "Event-driven ITGCs: the system log listing every occurrence (a ticket list alone does not show completeness).", None, 26, ""),
  ("Operating criteria", "C", "The stated timeframes, approvers, parameters the tests use. Leave blank if the client does not define one; the engine records a design finding.", None, 30, ""),
  ("Supports (ITAC / IPE / ITDM IDs)", "R", None, None, 20, "")]),
 ("Entity-level controls", "B54708", [
  ("COSO component", "R", None, "COSO", 20, ""),
  ("COSO principle (1 to 17)", "R", None, None, 12, "")]),
]

wb = Workbook()
ws0 = wb.active
ws0.title = "Instructions"

# Lists sheet with named ranges
wl = wb.create_sheet("Lists")
for j, (name, vals) in enumerate(LISTS.items(), start=1):
    col = get_column_letter(j)
    wl.cell(row=1, column=j, value=name).font = Font(name=F, bold=True)
    for i, v in enumerate(vals, start=2):
        wl.cell(row=i, column=j, value=v).font = Font(name=F)
    wl.column_dimensions[col].width = max(14, max(len(v) for v in vals) + 2)
    wb.defined_names[name] = DefinedName(name, attr_text=f"Lists!${col}$2:${col}${len(vals) + 1}")

def style_header(c, fill, text_color="FFFFFF"):
    c.font = Font(name=F, bold=True, color=text_color)
    c.fill = fill
    c.alignment = Alignment(wrap_text=True, vertical="center")
    c.border = BORDER

def build_table(ws, fields, first_data_row, start_col=1, group_fill=None):
    """Row first_data_row-2: header; first_data_row-1: requirement; first_data_row: example; rows after: input."""
    hr, rr, ex = first_data_row - 2, first_data_row - 1, first_data_row
    for k, (h, req, note, lst, width, example) in enumerate(fields):
        col = start_col + k
        L = get_column_letter(col)
        c = ws.cell(row=hr, column=col, value=h + (" *" if req == "M" else ""))
        style_header(c, group_fill or HEAD)
        if note:
            c.comment = Comment(note, "RCM template")
        label, fg, bg = REQ[req]
        r = ws.cell(row=rr, column=col, value=label)
        r.font = Font(name=F, size=9, bold=True, color=fg)
        r.fill = PatternFill("solid", fgColor=bg)
        r.alignment = Alignment(horizontal="center")
        r.border = BORDER
        e = ws.cell(row=ex, column=col, value=example or None)
        e.font = Font(name=F, italic=True, color="667085")
        e.fill = EXAMPLE
        e.alignment = Alignment(wrap_text=True, vertical="top")
        e.border = BORDER
        for row in range(ex + 1, ex + 201):
            cell = ws.cell(row=row, column=col)
            cell.font = Font(name=F)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            cell.border = BORDER
        ws.column_dimensions[L].width = width
        if lst and lst != "Assertion":
            dv = DataValidation(type="list", formula1=f"={lst}", allow_blank=True, showErrorMessage=True,
                                errorTitle="Not in the list", error=f"Choose a value from the {lst} list (Lists tab).")
            ws.add_data_validation(dv)
            dv.add(f"{L}{ex}:{L}{ex + 200}")
    ws.row_dimensions[hr].height = 42

for name, fields in TABS.items():
    ws = wb.create_sheet(name)
    build_table(ws, fields, first_data_row=3)
    ws.freeze_panes = "B3"
    ws.cell(row=1, column=1).value = ws.cell(row=1, column=1).value

# Controls: group band in row 1, header row 2, requirement row 3, example row 4
wc = wb.create_sheet("Controls", index=None)
col = 1
col_of = {}
for gname, color, fields in CONTROL_GROUPS:
    fill = PatternFill("solid", fgColor=color)
    gc = wc.cell(row=1, column=col, value=gname)
    gc.font = Font(name=F, bold=True, color="FFFFFF")
    gc.fill = fill
    if len(fields) > 1:
        wc.merge_cells(start_row=1, start_column=col, end_row=1, end_column=col + len(fields) - 1)
    build_table(wc, fields, first_data_row=4, start_col=col, group_fill=fill)
    for k, f in enumerate(fields):
        col_of[f[0]] = get_column_letter(col + k)
    col += len(fields)

# Calculated completeness check: blanks among the mandatory fields that apply to the row's category.
chk = get_column_letter(col)
gc = wc.cell(row=1, column=col, value="Check")
gc.font = Font(name=F, bold=True, color="FFFFFF"); gc.fill = PatternFill("solid", fgColor="175CD3")
h = wc.cell(row=2, column=col, value="Missing mandatory fields")
style_header(h, PatternFill("solid", fgColor="175CD3"))
h.comment = Comment("Counts blank mandatory fields for the row's control category (common fields plus the category's section). Conditional fields that depend on facts the template cannot see (for example whether a report is used) are not counted; the engine checks those on import.", "RCM template")
label, fg, bg = REQ["X"]
r = wc.cell(row=3, column=col, value=label); r.font = Font(name=F, size=9, bold=True, color=fg); r.fill = PatternFill("solid", fgColor=bg); r.alignment = Alignment(horizontal="center"); r.border = BORDER
wc.column_dimensions[chk].width = 16

common = ["Control ID", "Control category", "Control description", "Entity IDs", "Process ID", "Sub-process ID", "Risk IDs", "Control type", "Nature", "Frequency", "Key control", "Control owner", "Evidence of performance"]
by_cat = {
    "Business process control": ["Accounts and assertions addressed", "What is reviewed or matched"],
    "IT-dependent manual control": ["Accounts and assertions addressed", "System IDs", "IT dependency"],
    "IT application control": ["Accounts and assertions addressed", "System IDs", "ITAC type", "Configuration location", "Logic / configuration description", "Supporting ITGC control IDs"],
    "IT general control": ["System IDs", "ITGC domain", "Methodology module", "Layers covered"],
}
mrc = ["Review objective", "Level of precision", "Expectation / criteria", "Investigation threshold", "Investigation and resolution"]
blank = lambda names, r: "+".join(f'(LEN(TRIM({col_of[n]}{r}))=0)' for n in names)
cat = col_of["Control category"]
for row in range(4, 4 + 201):
    parts = [blank(common, row)]
    for cname, names in by_cat.items():
        parts.append(f'IF({cat}{row}="{cname}",{blank(names, row)},0)')
    parts.append(f'IF({col_of["Management review control"]}{row}="Yes",{blank(mrc, row)},0)')
    parts.append(f'IF(AND({col_of["Status"]}{row}<>"",{col_of["Status"]}{row}<>"Active"),(LEN(TRIM({col_of["Effective date"]}{row}))=0),0)')
    c = wc.cell(row=row, column=col, value=f'=IF(LEN(TRIM({col_of["Control ID"]}{row}))=0,"",' + "+".join(parts) + ")")
    c.font = Font(name=F, bold=True, color="175CD3" if row > 4 else "667085", italic=row == 4)
    c.alignment = Alignment(horizontal="center", vertical="top")
    c.border = BORDER
    if row == 4:
        c.fill = EXAMPLE
wc.freeze_panes = "B4"

# Header sheet (key / value)
whd = wb.create_sheet("Header", index=1)
whd.column_dimensions["A"].width = 30; whd.column_dimensions["B"].width = 40; whd.column_dimensions["C"].width = 16; whd.column_dimensions["D"].width = 50
for j, t in enumerate(["Field", "Value", "Requirement", "Notes"], start=1):
    style_header(whd.cell(row=1, column=j, value=t), HEAD)
header_rows = [
    ("Client", "M", "Matches the engagement's client."),
    ("RCM as-of date", "M", "The date the RCM reflects (YYYY-MM-DD). Drives roll-forward."),
    ("Fiscal period start", "M", "YYYY-MM-DD"),
    ("Fiscal period end", "M", "YYYY-MM-DD; must cover the engagement period."),
    ("Prepared by", "M", "Who maintains the RCM at the client."),
    ("Approved by", "R", "Management approval of the RCM."),
    ("Approval date", "R", "YYYY-MM-DD"),
    ("Source", "R", "Where the RCM came from; selects the column-mapping profile."),
]
for i, (f, req, note) in enumerate(header_rows, start=2):
    whd.cell(row=i, column=1, value=f + (" *" if req == "M" else "")).font = Font(name=F, bold=True)
    v = whd.cell(row=i, column=2); v.font = Font(name=F); v.border = BORDER
    label, fg, bg = REQ[req]
    rc = whd.cell(row=i, column=3, value=label); rc.font = Font(name=F, size=9, bold=True, color=fg); rc.fill = PatternFill("solid", fgColor=bg)
    whd.cell(row=i, column=4, value=note).font = Font(name=F, color="667085")
dv = DataValidation(type="list", formula1="=Source", allow_blank=True); whd.add_data_validation(dv); dv.add("B9")

# Instructions
ws0.column_dimensions["A"].width = 26; ws0.column_dimensions["B"].width = 100
lines = [
    ("RCM template", None),
    ("Purpose", "A risk and control matrix covering business process controls, management review controls, IT application controls (ITACs), information produced by the entity (IPE), and IT general controls (ITGCs), in the structure the planning engine imports. Field definitions: architecture/rcm-field-standard.md (v0.2)."),
    ("Who fills it in", "The client, or the engagement team with the client, when no RCM exists. A client RCM in another format (Optro, Workiva, ServiceNow, Archer, HighBond, own spreadsheet) does not need converting by hand: upload it and the mapping step proposes how its columns match these fields."),
    ("Order to fill", "1 Header  2 Entities  3 Processes  4 Accounts  5 Systems  6 Risks  7 IPE  8 Service organizations and CUECs  9 Controls. Later tabs refer to earlier ones by ID."),
    ("Which cells to edit", "White cells below the grey example row on each tab. Do not edit the requirement row or the Lists tab. The Missing mandatory fields column on Controls is calculated."),
    ("Example rows", "The grey italic row on each tab is an example. Its IDs start with EX-; the importer ignores rows whose ID starts with EX-. Overwrite it or leave it."),
    ("Mandatory (*)", "Planning cannot proceed for the record without it. A blank mandatory field becomes a request to the client; the engine never fills it in."),
    ("Conditional", "Mandatory when the condition in the header comment applies (hover over the header), for example the IT application control section for ITACs, or IPE IDs when the control uses a report."),
    ("Recommended", "Improves the plan; a blank becomes a walkthrough question."),
    ("Multiple values", "Separate IDs or assertions with a semicolon, for example EX-R-01; EX-R-02."),
    ("Dropdowns", "Category, type, nature, frequency, key control, status, domain, module, hosting, report type and similar fields offer a list. Values from your own taxonomy can be typed into a client spreadsheet instead; the mapping step proposes a match for a person to confirm."),
    ("Control description", "State who performs the control, what they do, when or how often, how (the system, report, or tool), and what evidence is kept. The engine checks each element and raises a finding for any that is missing."),
    ("Not needed from the client", "Test procedures, sample sizes, test results, and conclusions. The engagement team produces those."),
    ("Mandatory summary", "Every control: ID, category, description, entity, process, sub-process, risk, type, nature, frequency, key, owner, evidence. Plus, by category: business process: accounts and assertions, what is reviewed or matched; IT-dependent manual: accounts and assertions, systems, IT dependency; ITAC: accounts and assertions, systems, ITAC type, configuration location, logic, supporting ITGCs; ITGC: systems, domain, module, layers; management review: review objective, precision, expectation, investigation threshold, investigation and resolution."),
]
for i, (k, v) in enumerate(lines, start=1):
    a = ws0.cell(row=i, column=1, value=k)
    a.font = Font(name=F, bold=True, size=14 if i == 1 else 10)
    if v:
        b = ws0.cell(row=i, column=2, value=v)
        b.font = Font(name=F); b.alignment = Alignment(wrap_text=True, vertical="top")
        a.alignment = Alignment(vertical="top")

order = ["Instructions", "Header", "Entities", "Processes", "Accounts", "Systems", "Risks", "IPE", "Service organizations", "CUECs", "Controls", "Lists"]
wb._sheets = [wb[n] for n in order]
from openpyxl.workbook.properties import CalcProperties
wb.calculation = CalcProperties(fullCalcOnLoad=True)
wb.save(OUT)
print("saved", OUT, "controls columns:", col)
