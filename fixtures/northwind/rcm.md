# Northwind Foods: IT General Controls Risk and Control Matrix

Version: 7 | Effective: 2026-01-01 | Owner: IT Compliance

All content in this file is fictional and exists only to exercise the planning engine.

## Risks

| Risk ID | Statement | Financial reporting element | Assertions | IT risk category |
|---|---|---|---|---|
| R-01 | Users retain SAP or Concur access that is no longer appropriate for their role, allowing unauthorized postings or expense approvals. | Revenue; General ledger; Operating expenses | occurrence; accuracy | inappropriate access |
| R-02 | SAP access is granted without authorization or beyond what the job requires. | Revenue; General ledger | occurrence; accuracy | inappropriate access |
| R-03 | Unauthorized or untested changes to SAP alter pricing, posting, or reporting logic. | Revenue; General ledger | accuracy; completeness | unauthorized change |

## Controls

| Control ID | Description | Type | Frequency | Owner | Systems | Risks |
|---|---|---|---|---|---|---|
| A-01 | Business owners review SAP user access quarterly using the SUIM listing of all users and roles; removals are requested in ServiceNow and completed by Security within 5 business days of the review sign-off. | periodic access review | Quarterly | SAP Security Manager | SAP ECC | R-01 |
| A-05 | New SAP access is requested in ServiceNow and approved by the requester's manager and the role owner before Security grants the roles listed on the approved request. | access provisioning | Event | SAP Security Manager | SAP ECC | R-02 |
| A-05b | Baseline SAP display roles are assigned automatically from the HR feed based on job code. | access provisioning | Automated | HR Systems Lead | SAP ECC | R-02 |
| A-03 | SAP transports are approved by the CAB before import; the Basis team imports; developers do not hold import authorization. Configuration and emergency transports follow the same path. | change management | Event | Basis Lead | SAP ECC | R-03 |
| A-13 | The Controller reviews Concur expense approver and administrator roles semi-annually. | periodic access review | Semi-annual | Controller | Concur | R-01 |
| A-14 | Vendor master data changes in SAP are reviewed weekly by the Accounts Payable Manager against change requests. | change management | Weekly | Accounts Payable Manager | SAP ECC | R-01 |
