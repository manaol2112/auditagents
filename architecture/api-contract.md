# Back-end API contract (v0.4)

Owner: back end. Consumer: the web UI (`web/`). This file is the agreement between the two; a change to a request or response shape is made here first.

Scope of v0.1: sign-in, clients and engagements, RCM upload, column mapping, extraction and import checks, planning (rules and model), review, the human decisions the engine already enforces, and background jobs. ITGC planning only; business process controls, ITACs, and IPE are imported, checked, and linked but not planned (methodology extension pending).

## Conventions

- Base path `/api`. JSON in and out (`content-type: application/json`), except the RCM upload, which is the raw file body.
- **Authentication.** Every endpoint except `POST /api/session` and `GET /healthz` requires a session.
  - **Browser (the UI):** `POST /api/session` sets an `HttpOnly; SameSite=Strict; Path=/api` cookie (`Secure` over HTTPS) and returns a `csrf_token` in the body; the session token itself is never given to page scripts. Send every non-GET request with the header `X-CSRF-Token: <csrf_token>`; keep the CSRF token in memory only (no browser storage). On reload, sign in again or call `GET /api/me` (the cookie survives a reload; the CSRF token does not, so a reloaded page must sign in again before it can write).
  - **Scripts and tools:** send `"bearer": true` in the sign-in body to receive `token`, and use `Authorization: Bearer <token>`. Bearer requests need no CSRF token (a browser never sends this header on its own).
  - Sessions expire after 12 hours of inactivity; `DELETE /api/session` ends one and clears the cookie.
- **Access (deny by default).** A user sees an engagement, and everything under it (uploads, findings, plans, jobs, the workspace), only as a **member** of it. The creator of an engagement is its first member; members add others (`POST /api/engagements/:name/members`). A client is visible to whoever created it and to members of any of its engagements. Anything a user may not see answers exactly like something that does not exist: `404 { "error": "not_found", "message": "not found" }`. 404 bodies never echo input.
- **Method checks** come first: a method a route does not accept is `405` before authentication. An `/api` path that matches no route is `404` before authentication.
- **Roles** (from the engine; the server never lets a request act as someone else):
  - `reader`: every `GET`.
  - `preparer`: plus create clients and engagements, upload RCMs, confirm column mappings, run extraction, planning, and review.
  - `approver`: plus resolve contradictions and identity issues, disposition findings, approve or reject plans. An approver cannot approve a plan they generated.
  - `admin`: manages people and access (accounts, passwords, roles, retiring accounts, membership of any engagement). Reads engagement content only as a member, like a reader, and never prepares or approves (segregation of duties). An administrator cannot change their own role or retire their own account.
  - `agent`: the engine's own agents (`planner-agent`, `reviewer-agent`). They cannot sign in.
- **Errors:** `{ "error": "<code>", "message": "<user-facing text>" }`.
  - `400 invalid_request`: malformed body or parameters.
  - `401 unauthenticated`: missing or expired session, or a cookie write without a valid CSRF token.
  - `429`: too many failed sign-ins for the user name (5 in 5 minutes), or too many wrong current passwords when changing one.
  - `403 password_change_required`: the signed-in user has a temporary password. Every request except `GET /api/me`, `POST /api/me/password`, and `DELETE /api/session` answers this until the password is changed.
  - `403 forbidden`: role does not allow it.
  - `404 not_found`: does not exist, or the user is not a member. The body is always `{ "error": "not_found", "message": "not found" }`.
  - `409 refused`: the engine refused the action; `message` says why, for example "plan has blocking findings: ...". Show this text to the user; it is written for them.
  - `413 too_large`: upload over 20 MB.
  - `500`: fixed body; details only in the server log.
- **Long operations** (model planning, review, and model-assisted mapping) return `202 { "job": Job }`; poll `GET /api/jobs/:id`. Rules-based operations are synchronous.
- **Identifiers:** engagements are addressed by name (URL-encoded); uploads, findings, contradictions, identity issues, and jobs by integer id.
- The existing read endpoints `GET /api/engagements` and `GET /api/workspace/:engagement` are unchanged.

## Types

```ts
type Role = "reader" | "preparer" | "approver" | "admin";
interface User { name: string; display_name: string; role: Role;
  must_change_password: boolean }   // true: the password was set by someone else; show the change-password screen before anything else
interface Job { id: number; kind: "plan" | "review" | "mapping"; status: "queued" | "running" | "succeeded" | "failed";
  engagement: string | null; created_by: string; created_at: string; finished_at: string | null;
  result: any | null;          // kind-specific, see each endpoint
  error: string | null }       // user-facing when failed

interface SourceCell { sheet: string; row: number; column: string; header: string | null }   // "Controls", 14, "F", "Frequency"

interface ColumnProposal {
  column: string;              // "F"
  header: string | null;       // the client's header text
  samples: string[];           // up to 5 distinct non-empty values
  field: string | null;        // canonical field key, e.g. "control.frequency"; null = keep as client attribute
  confidence: "high" | "medium" | "low";
  method: "template" | "header" | "values" | "model" | "none";
  reason: string;              // why, in one sentence
  alternatives: string[];      // other plausible field keys
}
interface SheetProposal {
  sheet: string;
  role: "header" | "entities" | "processes" | "accounts" | "systems" | "ipe" | "risks" | "controls" | "service_organizations" | "cuecs" | "lists" | "instructions" | "ignore";
  role_confidence: "high" | "medium" | "low";
  header_row: number;          // 1-based
  first_data_row: number;
  columns: ColumnProposal[];
}
interface MappingProposal { upload_id: number; profile: "soxplan-template" | "optro" | "generic"; sheets: SheetProposal[];
  warnings: string[] }         // for example "Control Type column holds manual/automated values; mapped to nature"
interface MappingConfirmation { sheets: { sheet: string; role: SheetProposal["role"]; header_row: number; first_data_row: number;
  columns: Record<string, string | null>;        // column letter -> field key or null (kept as a client attribute)
  defaults?: Record<string, string> }[] }        // values for fields the sheet has no column for, e.g. { "control.category": "IT general control" } for an ITGC-only RCM

interface IntakeFinding { id: number; upload_id: number; severity: "blocking" | "warning" | "info";
  check: string;               // e.g. "mandatory_missing", "description_element_missing", "itac_without_itgc"
  record: { kind: "control" | "risk" | "system" | "ipe" | "account" | "process" | "entity" | "rcm"; key: string | null };
  field: string | null; message: string; source: SourceCell | null;
  status: "open" | "resolved_by_reupload" | "accepted_by_human"; human_note: string | null }
```

Canonical field keys are listed by `GET /api/rcm/fields` and defined in `architecture/rcm-field-standard.md` (for example `control.id`, `control.description`, `control.category`, `control.type`, `control.nature`, `control.frequency`, `control.key`, `control.owner`, `control.evidence`, `control.systems`, `control.risks`, `control.itgc_module`, `control.operating_criteria`, `risk.id`, `risk.statement`, `system.id`, `system.name`, `ipe.id`).

## Endpoints

### Session

| Method and path | Role | Body | Response |
|---|---|---|---|
| `POST /api/session` | none | `{ username, password, bearer?: boolean }` | `200 { user: User, csrf_token, expires_in_seconds, token? }` and the session cookie; `token` only when `bearer` is true. `401` on bad credentials (one message for unknown user and wrong password); `429` when locked |
| `DELETE /api/session` | any | | `204` |
| `GET /api/me` | any | | `200 User` |
| `POST /api/me/password` | any signed-in person | `{ current_password, new_password }` | `204`. The session making the change stays signed in; every other session of the user ends; `must_change_password` becomes false. `403 wrong_current_password`; `429` after 5 wrong current passwords in 5 minutes; `409` when the new password is refused (with the reason: 12 to 128 characters, differs from the current one, does not contain the user name, is not a common password, a keyboard or alphabet run, or one repeated character). Cookie sessions send `X-CSRF-Token` as for any write. |

### Administration

| Method and path | Role | Body | Response |
|---|---|---|---|
| `GET /api/users` | admin | | `200 { name, display_name, role, disabled, disabled_at, has_password, must_change_password, password_changed_at, engagements }[]` (people only; agents are not listed; never a password hash) |
| `POST /api/users` | admin | `{ name, role, display_name?, password }` | `201` the user. Names: 2 to 40 characters, lowercase letters, digits, `.`, `-`, `_`, starting with a letter. The password is temporary: the new user must change it at the first sign-in |
| `PUT /api/users/:name` | admin | `{ role?, display_name? }` | `200` the user. A role change ends the user's sessions |
| `POST /api/users/:name/password` | admin | `{ password }` | `204`. An administrator's reset: temporary (the owner must change it at the next sign-in) and ends all of the user's sessions. For one's own name (administrators included) it behaves as `POST /api/me/password` and needs `current_password`; prefer that endpoint |
| `POST /api/users/:name/disable` | admin | `{ reason }` | `204`. A retired account keeps its name and history (the audit trail refers to it) and can no longer sign in |
| `GET /api/admin/engagements` | admin | | `200 { name, client, period_start, period_end, members: string[] }[]`: every engagement, names and members only, for assigning access |

### Clients and engagements

| Method and path | Role | Body | Response |
|---|---|---|---|
| `GET /api/clients` | reader | | `200 { name, fiscal_year_end, time_zone }[]` |
| `POST /api/clients` | preparer | `{ name, fiscal_year_end, time_zone }` | `201 { name }` |
| `POST /api/engagements` | preparer | `{ client, name, period_start, period_end, as_of, systems: string[], modules: string[] \| null }` (null = all thirteen modules) | `201 EngagementDetail` |
| `GET /api/engagements` | reader | | `200 { name, client, period_start, period_end }[]`: the engagements the user is a member of |
| `GET /api/engagements/:name` | reader | | `200 EngagementDetail` |
| `GET /api/engagements/:name/members` | reader | | `200 { name, display_name, role, added_by, added_at }[]` |
| `POST /api/engagements/:name/members` | preparer (member), or admin (any engagement) | `{ user }` | `201 { name }`. The new member sees the engagement from then on. |
| `DELETE /api/engagements/:name/members/:user` | preparer (member), or admin (any engagement) | | `204` |

```ts
interface EngagementDetail { name: string; client: string; period_start: string; period_end: string; as_of: string;
  systems: string[]; modules_in_scope: string[]; modules_out_of_scope: string[]; methodology_version: string;
  snapshot_id: number | null;                     // null until an RCM is extracted
  stage: "setup" | "rcm_uploaded" | "mapping_confirmed" | "extracted" | "planned" | "in_review" | "approved";
  uploads: { id: number; filename: string; sha256: string; uploaded_by: string; uploaded_at: string; status: "uploaded" | "mapped" | "extracted" }[];
  latest_plan: { version: number; status: string; blocking: number; warnings: number } | null }
```

An engagement can be created before any document exists; the RCM is uploaded into it. Planning is refused until an RCM has been extracted.

### RCM

| Method and path | Role | Body | Response |
|---|---|---|---|
| `GET /api/rcm/fields` | reader | | `200 { key, label, object, requirement: "M" \| "C" \| "R" \| "E", applies_to: string[], description, values: string[] \| null }[]` |
| `POST /api/engagements/:name/rcm?filename=<name>` | preparer | raw `.xlsx` or `.csv` bytes (`content-type: application/octet-stream`), at most 20 MB | `201 { upload_id, sha256, filename, sheets: { name, rows, columns }[] }`. The same file uploaded twice returns the first upload (`200`). |
| `GET /api/rcm/:upload_id` | reader | | `200 { upload_id, engagement, filename, sha256, status, sheets: { name, rows, columns, preview: string[][] }[] }`. Preview: the first 15 rows. |
| `GET /api/rcm/:upload_id/mapping` | reader | | `200 { proposal: MappingProposal, confirmed: MappingConfirmation \| null, confirmed_by, confirmed_at }`. The deterministic proposal is computed on upload. |
| `POST /api/rcm/:upload_id/mapping/assist` | preparer | | `202 { job }`. Asks the mapping agent (model) to propose fields for columns the deterministic mapper left unmapped or low-confidence; the job result is a new `MappingProposal`. Optional; needs the model API key on the server. |
| `PUT /api/rcm/:upload_id/mapping` | preparer | `MappingConfirmation` | `200 { version, warnings: string[], confirmed: MappingConfirmation }`. Refused (`409`) only when no sheet has the role `controls` or the controls sheet has no column for Control ID or Control description (nothing could be read). A mandatory field with no column is a **warning**: every control then gets a "missing mandatory field" intake finding, unless a sheet default supplies it. Each confirmation is a new version; earlier ones are kept. Refused after extraction (upload the file again to map it differently). |
| `POST /api/rcm/:upload_id/extract` | preparer | | `200 { snapshot_id, counts: { entities, processes, accounts, systems, ipe, risks, controls, itgc_controls }, findings: { blocking, warning, info } }`. Requires a confirmed mapping. Freezes a snapshot (immutable) and pins it to the engagement. |
| `GET /api/rcm/:upload_id/findings` | reader | | `200 IntakeFinding[]` |
| `GET /api/rcm/:upload_id/records?kind=control\|risk\|system\|ipe\|...` | reader | | `200 { kind, key, fields: Record<string, string \| string[]>, source: SourceCell, client_attributes: Record<string, string> }[]`. `fields._inferred` names any field the engine inferred (category, module, domain, a risk ID derived from a risk statement) and why; show it, so the user can confirm or correct it in the RCM. |
| `POST /api/intake-findings/:id/accept` | approver | `{ reason }` | `200 IntakeFinding`. Records a human decision that a blocking intake finding does not prevent planning (for example "field not applicable to this control"). Final. |

### Planning, review, and the workspace

| Method and path | Role | Body | Response |
|---|---|---|---|
| `POST /api/engagements/:name/plan` | preparer | `{ proposer: "rules" \| "model" }` | rules: `201 { plan_version, blocking, warnings }`; model: `202 { job }` (result is the same object). Refused while blocking intake findings are open. |
| `GET /api/engagements/:name/plan?version=N` | reader | | `200 { version, status, content_hash, created_by, created_at, decided_by, decided_at, decision_note, plan }`. `plan` is the full plan document (see the workspace for its shape). |
| `POST /api/engagements/:name/review` | preparer | `{ max_cycles?: 1 \| 2 }` | `202 { job }`; result `{ cycles, escalated, final_plan_version }`. Needs the model API key. |
| `GET /api/workspace/:engagement` | reader | | unchanged |
| `GET /api/jobs/:id` | reader | | `200 Job` |

### Human decisions

| Method and path | Role | Body | Response |
|---|---|---|---|
| `POST /api/contradictions/:id/resolve` | approver | `{ choose: "<source key, e.g. rcm:14>", reason }` | `200` the contradiction. Regenerate the plan to apply it. |
| `POST /api/identity-issues/:id/resolve` | approver | `{ decision, reason, choose? }` | `200` the identity issue |
| `POST /api/review-findings/:id/disposition` | approver | `{ decision: "accept" \| "dismiss", reason }` | `200` the finding |
| `POST /api/engagements/:name/approve` | approver | `{ note }` | `200 { version, content_hash }`. Refused with the engine's reason while blocking findings or escalations remain, or when the approver generated the draft. |
| `POST /api/engagements/:name/reject` | approver | `{ note }` | `200 { version }` |

Every decision records the signed-in user as the actor in the audit trail; reasons and notes are required.

## Typical sequence (UI)

1. Sign in. 2. Create (or pick) the client, then create the engagement with period, systems, and modules. 3. Upload the RCM. 4. Show the mapping proposal sheet by sheet; let the user change any column's field; optionally run the mapping agent; confirm. 5. Extract; show counts and intake findings; the client fixes blocking ones by re-uploading, or an approver accepts them with a reason. 6. Plan (rules or model). 7. Run review. 8. Work the action queue in the workspace (resolve, disposition). 9. Approve.

## Intake findings

`check` values: `mandatory_missing`, `conditional_missing`, `value_not_in_list`, `category_inferred`, `module_inferred`, `module_unresolved`, `module_unrecognized`, `out_of_scope_module`, `category_nature_mismatch`, `description_too_brief`, `ipe_not_recorded`, `unknown_reference`, `duplicate_id`, `risk_without_control`, `itac_without_itgc`, `ipe_without_ca`, `outsourced_without_service_org`, `system_out_of_scope`, `system_without_itgc`, `criteria_unlabelled`. Findings on IT general controls (and the IT risks and systems they rely on) are `blocking`; the same checks on business process controls, ITACs, and IPE are `warning`, because those are imported and linked but not planned until the methodology covers them. Planning is refused while a blocking finding is open; the client fixes the RCM and it is uploaded again, or an approver accepts the finding with a reason.

## Demo sign-in

`make go` (or `soxplan seed`) creates `preparer` (preparer), `reviewer` (approver), and `rj` (administrator), members of every demo engagement, and prints random passwords once for accounts that have none. The earlier demo accounts `pat` and `ann` are retired. Reset a password with `SOXPLAN_PASSWORD=... soxplan set-password NAME --as rj`.
