# Web UI security

The workspace displays confidential client audit records, much of it written by language models or copied from
client documents. The UI treats every record as untrusted, keeps it inside this origin, and assumes any other page
the user has open may try to read it. This file is the record of those controls. Keep it current when a control
changes.

## Threats and controls

| Threat | Control | Where | Tested by |
|---|---|---|---|
| One client's data shown in another client's workspace | Audit events scoped to entities the engagement or its client owns (deny by default); the UI keys loaded data by engagement and never renders a model under another engagement's header | `src/workspace.ts` `scopeEvents`, `web/src/App.tsx` | `test/workspace.test.ts` "never another client's" |
| XSS from model output or client documents | React text rendering only; `dangerouslySetInnerHTML` and DOM HTML sinks banned; CSP `script-src 'self'` with no inline code or eval; Trusted Types `'none'` disables HTML sinks at runtime | `web/src/**`, `src/security.ts` | scanner tests, headless Chrome run (0 violations) |
| Visual spoofing (bidi overrides), terminal escapes in copied commands | Control and bidi-override characters stripped from every string at the API boundary; engine commands are shown as templates, not one-click copy | `web/src/api/schema.ts`, `ActionQueue.tsx` | `test/security.test.ts` |
| Malformed or hostile API responses | Every response schema-validated (fails closed), unknown fields dropped, strings, arrays and body size bounded | `web/src/api/schema.ts`, `client.ts` | `test/security.test.ts` |
| Another website reading the API (DNS rebinding, cross-site fetch, CSRF-style requests) | Host allowlist (421), Fetch Metadata refusal of cross-site requests (403), no CORS headers, GET-only server | `src/security.ts`, `src/server.ts` | `test/workspace.test.ts` |
| Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, Fetch Metadata refusal of cross-site iframe navigation, client-side frame check | `src/security.ts`, `web/src/main.tsx` | `test/workspace.test.ts` |
| Audit data left in caches or browser storage | `Cache-Control: no-store` on the API; no localStorage, sessionStorage, IndexedDB or cookies; generic page title | `src/security.ts`, scanner rule `no-browser-storage` | headless run (0 storage keys) |
| Data sent to third parties | CSP `connect-src`, `img-src`, `font-src` limited to `'self'`; no CDNs or web fonts; `Referrer-Policy: no-referrer`; scanner bans external origins | `src/security.ts`, scanner | scanner |
| Error messages leaking internals | Fixed error strings in the UI; 5xx bodies are `internal error`; 404s never echo input; the render error boundary hides the error | `client.ts`, `App.tsx`, `src/security.ts` | both test suites |
| Path traversal or serving unintended files | Static files routed only if present at startup (`wildcard: false`), dotfiles denied, no source maps shipped | `src/server.ts`, `vite.config.ts`, scanner `--dist` | `test/workspace.test.ts`, scanner |
| Network exposure | Compose publishes the API and the database on 127.0.0.1 only; the dev server binds 127.0.0.1; the container runs as `node` and cannot write its own code | `docker-compose.yml`, `vite.config.ts`, `Dockerfile` | manual |
| Session theft or misuse in the browser | HttpOnly, `SameSite=Strict`, `Path=/api` session cookie the page cannot read; the bearer token is never returned to the browser; the CSRF token is held in page memory only and sent on writes; cookie writes without it are refused | `src/api.ts`, `web/src/api/client.ts` | `test/browser-session.test.ts`, `web/test/session.test.ts` |
| A user who cannot actually sign out | Sign-out needs no CSRF token (forged sign-out gains nothing: SameSite cookie plus cross-site refusal), destroys the server session, and the UI never shows "signed out" unless the server confirmed it | `src/api.ts`, `web/src/App.tsx` | both session suites; browser run after a reload |
| Records left on screen after a session ends | Any 401 ends the signed-in view for the whole app; the signed-in tree is keyed by user, so its loaded records are discarded and a different user on the same tab starts empty | `web/src/App.tsx`, `client.ts` | `web/test/session.test.ts`; browser run |
| Seeing another client's engagement | The engagement list is per member; a non-member gets the same 404 as a missing engagement, and the UI never requests a name the server did not list | `src/api.ts`, `web/src/App.tsx` | `test/browser-session.test.ts`; browser run as a reader |
| Passwords known to someone other than their owner (administrator resets, new accounts, demo seeds) | Any password set by someone else is temporary; until the owner changes it, the API answers every request except `GET /api/me`, `POST /api/me/password`, and sign-out with `403 password_change_required` | `src/auth.ts` `setPassword`, `src/api.ts` | `test/api.test.ts` "changing passwords" |
| A stolen session used to take over the account by changing its password | Changing one's own password needs the current one (5 wrong attempts in 5 minutes lock it, 429), keeps only the session making the change and ends every other session, and is audit-logged; strength rules refuse the user name, common passwords, keyboard runs, and repeats (no forced composition rules) | `src/auth.ts` `changeOwnPassword`, `checkPasswordStrength` | `test/api.test.ts` "changing passwords" |
| Credential guessing, login CSRF | Generic "user name or password is not correct"; 5 failures per user name lock it for 5 minutes (429, shown as a fixed message); cross-site sign-in refused | `src/auth.ts`, `src/security.ts` | `test/browser-session.test.ts`, `web/test/session.test.ts` |
| Writes from a reloaded page, without weakening CSRF | The CSRF token is an HMAC keyed by the session token, so `GET /api/me` can hand it back after a reload without storing it; only its hash is kept; another session's token is refused; bearer clients get none | `src/auth.ts` `csrfFor`, `src/api.ts` `/api/me` | `test/browser-session.test.ts`; browser run (member added after a reload) |
| Creating engagements beyond one's role | The server requires the preparer role (approvers included; readers and administrators refused, 403) and makes the creator the only member; the UI hides the action and explains instead of offering a form that will fail | `src/api.ts`, `web/src/App.tsx` | `test/browser-session.test.ts`; browser run as a reader |
| Writes the UI never meant to send | The API client sends only an allowlist of method + path patterns (sign in/out, own password, client, engagement, team member); paths are built from encoded segments | `web/src/api/client.ts` `WRITES` | `web/test/writes.test.ts` |
| Server text in the UI | Only the `message` of a 400/403/409 is shown (bounded to 300 characters, control and bidi characters stripped); 5xx bodies are never read | `client.ts` `errorBody` | `web/test/writes.test.ts` |
| Unreadable text (accessibility) | Every text colour pair the UI renders is checked against WCAG AA (4.5:1) in both themes on every `npm run check` | `web/scripts/contrast-check.mjs` | the gate |
| Supply chain | 3 runtime dependencies; exact pins and lockfile; `ignore-scripts=true`; releases older than 14 days at pin time; `npm audit` clean | `web/.npmrc`, `web/package.json` | `npm run audit` |

## The gate

`npm run check` (typecheck, source scan, contrast, tests) and `npm run build` (which also scans `dist/`) fail on a violation.
A line that genuinely needs a banned pattern must say why on the same line: `// security-reviewed: <reason>`.
Every such exemption is then visible in review (`grep -rn security-reviewed web/src`).

## Known gaps, to close before this leaves a single user's machine

1. **Breached-password check.** Passwords are checked against built-in rules, not yet against a list of the most common breached passwords (ASVS V6.2).
2. **HTTPS and HSTS.** The cookie gets `Secure` only over HTTPS (or `COOKIE_SECURE=1`). Required before the workspace
   is reachable by anyone else.
3. **Sign-in throttling is per process and per user name.** It lives in memory, resets on restart, and does not limit
   one source trying many user names. Move it to the database and add a per-client limit before a shared deployment.
4. **Read access is not audit-logged.** Sign-ins are recorded; which engagement a user viewed is not. ASVS Level 2
   expects it for sensitive data.
5. **Engagement codes in browser history.** The hash route carries the engagement code (for example
   `LUMEN-FY2026-ITGC`) for deep links. It is never sent to the server, but it does appear in local and synced browser history.
6. **Default database password** (`soxplan`) in `docker-compose.yml`. It is acceptable only because the port is now loopback-only.
7. **Static assets are fixed at startup.** After `npm run build:web`, restart the server to serve the new bundle.
8. **Client names can be probed.** Creating a client whose name exists answers `409 client 'X' already exists` even when the
   caller cannot see that client, which confirms another firm's client name. Answer it like any other refusal, or scope
   client names per organisation.
9. **The engagement list makes one request per engagement** to show its stage (capped at 50). A list endpoint that carries
   `stage` and `latest_plan` would remove the fan-out.
10. **Not in the web app yet:** RCM upload and mapping, extraction, planning and review runs, approver decisions, and
   removing a team member. Each step's command-line equivalent is shown where the step comes up.
