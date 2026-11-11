# Lumen Health Partners: IT controls over financial systems (fiscal 2026)

This memo was written by the Finance Systems team for the internal audit function. It is fictional and exists only to evaluate the planning engine. Nothing in it is in table form on purpose.

## Background

Lumen runs its general ledger, billing, and vendor payments in NetSuite, which went live on 1 October 2025. Claims analytics that feed the revenue accrual are produced by ClaimsLens, a custom reporting application that a managed service provider, Cirrus Ops, builds and operates on AWS. Employees authenticate to both systems through Okta, and Workday is the system of record for people.

## How people get access

When Workday records a hire, transfer, or termination, Okta picks it up within the hour. Okta then creates, changes, or removes the person's NetSuite and ClaimsLens accounts, and deprovisioning is complete within one hour of the termination effective time in Workday. Baseline NetSuite roles (employee centre, expense entry) come from the Okta group that matches the Workday job profile.

Anything beyond the baseline, for example the AP clerk, AR specialist, or administrator roles in NetSuite, has to be requested in Jira. The Finance Systems Manager approves the request before the role is assigned, and the person who assigns the role in NetSuite attaches the Jira key to the assignment note. We do not have a formal list of which role combinations conflict; the Finance Systems Manager uses judgement.

## Periodic review of NetSuite access

Twice a year the Controller receives an export of NetSuite users and their roles from the Finance Systems team and reviews it. Where the Controller marks a role for removal, the Finance Systems team removes it within five business days. We have not, so far, looked at whether access marked for removal was used before it was taken away. The export comes from the NetSuite role assignment saved search; it includes integration users.

## Changes to NetSuite

Customisations and SuiteScripts for NetSuite are developed in the sandbox by the Finance Systems Manager and one analyst. Each change is raised as a Jira story, tested in the sandbox with the business user who asked for it, and approved by the Finance Systems Manager before it is deployed to production with the SuiteCloud deployment tool. The Finance Systems Manager both develops and deploys. Emergency fixes have been rare and we have no written procedure for them.

## Changes to ClaimsLens

ClaimsLens code lives in GitHub. The repository's branch protection requires a pull request approved by a second Cirrus Ops engineer before anything merges to main, and the GitHub Actions workflow deploys automatically on merge. Cirrus Ops does not provide a SOC report.

## Other matters

The accounting team reconciles the bank statement to the general ledger every month, with the Controller signing off. Cirrus Ops takes nightly snapshots of the ClaimsLens database on AWS; Lumen does not test restores. There is a Jira Service Management queue for incidents, without priorities or timeframes.
