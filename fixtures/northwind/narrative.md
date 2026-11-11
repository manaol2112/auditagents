# Northwind Foods: IT Controls Narrative (fiscal 2026)

Prepared by IT Compliance from interviews held in January 2026. Fictional.

## Control A-01
Performer: Business owners (department managers), coordinated by the SAP Security Manager
Listing source: SUIM report from SAP PRD, system-generated, all users and roles
Completion timeframe: within 15 business days after quarter end
Removal timeframe: within 3 business days of review sign-off
Lookback: not performed

## Control A-05
Approver: requester's manager and the role owner
Approval timing: before access is granted
Grant matches request: Security grants the roles listed on the approved request
Paths: ServiceNow requests only; administrators may also assign roles directly in SU01 (not covered)

## Control A-05b
Automation: HR feed assigns baseline display roles by job code nightly
Rule approval: role-to-job-code mapping approved by the HR Systems Lead; changes go through change management

## Control A-03
Approver: CAB
Approval timing: before import
Testing: unit and UAT testing documented in the transport request
Emergency changes: emergency transports are approved by the Basis Lead and ratified by the CAB within 2 business days
Environments: DEV, QAS, PRD
Segregation: Basis team imports; two Basis staff also hold developer keys

## Control A-13
Performer: Controller
Listing source: Concur admin export of approver and administrator roles

## Control A-14
Performer: Accounts Payable Manager
Listing source: SAP vendor master change log (CDHDR)
