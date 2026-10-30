# MM&RJD Attendance System — Implementation Readiness Assessment

**Prepared:** 2026-10-30
**Purpose:** Practical implementation assessment for the first MM&RJD release, based on direct inspection of the current repository (including uncommitted modifications). This is planning only — it does not authorize deployment, use of real attendance data, or a change to unresolved HR policy.
**Prerequisite documents:** `MMRJD_CLOUD_ARCHITECTURE_PROPOSAL.md`, `FOCUSED_COMPLETION_REPORT.md`, `CLOUD_READINESS_AND_IMPLEMENTATION_PLAN.md`.

---

## 1. Executive summary

The MM&RJD prototype is functional as a single-user local tool, but it is **not cloud-ready**. Authentication, job ownership, durable shared storage, authoritative shared rules, request limits, retention policy, and unresolved HR semantics are all missing. The focused verification (38 backend tests, malformed-CSV rejection, a synthetic valid upload, refresh recovery, explicit processing, and a real Excel/PDF download) proves the core attendance engine works on synthetic data — but it runs entirely against host-local temporary files and process-global mutable rules.

The repository is in a **dirty, multi-deliverable state**: existing modified and untracked files (previous remediation and browser-verification work, reports, tests, assets) must be preserved. This assessment maps every architecture component to what already exists, what is missing, what must change, which files are affected, and how to test each change with synthetic data before any hosting account is selected.

**Bottom line:** begin with a decision/milestone-0 gate (owners, OIDC provider, data region, retention), then build PostgreSQL-backed state, server-side authentication, organization-scoped authorization, versioned rules, a durable job queue, a private object store, and report provenance, in dependency order. Local work can proceed with synthetic fixtures until the hosting decision is made.

---

## 2. Verified current-state findings

### 2.1 Frontend architecture

- **Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind. Pages live in `frontend/src/app/*/page.tsx`: `/`, `/upload`, `/results`, `/rules`.
- **API client:** `frontend/src/lib/api.ts` builds browser `fetch` calls against `NEXT_PUBLIC_API_BASE`, falling back to `http://127.0.0.1:8000` (hard-coded loopback). There is **no session/authorization handling**: no stored token, no CSRF token, no credential management, no logout.
- **Session cache:** `frontend/src/lib/session-state.ts` stores `mm_upload_result`, `mm_processed`, `mm_upload_meta` in `sessionStorage`; `frontend/src/lib/dashboard-status.ts` and `frontend/src/lib/results-freshness.ts` derive UI freshness from cached job + rules-version provenance. `sessionStorage` is a convenience cache, **not** an access-control or durable record store (as the architecture proposal already notes).
- **Dependency-awareness:** `frontend/src/components/ui/Layout.tsx` renders a shared navigation shell; `frontend/src/lib/results-freshness.ts` implements the stale-result guard used on results and dashboard pages.
- **Files affected by a cloud move:** `frontend/src/lib/api.ts` (add credentials/cookie handling), `frontend/src/app/*/page.tsx` (route guards, session-dependent state), `frontend/src/lib/session-state.ts` and `dashboard-status.ts` (resume from server, not just browser cache), `frontend/src/lib/dashboard-status.ts` `getDashboardStatus` (server-sourced provenance).

### 2.2 Backend FastAPI routes and processing workflow

Current endpoints in `backend/main.py` (all unauthenticated):

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | health check |
| `/api/jobs/{job_id}/status` | GET | whether a job has a saved result + provenance versions |
| `/api/upload` | POST | parse iVMS CSV/XLSX/XLS/PDF, save `source{ext}`, `upload.json` |
| `/api/roster` | POST | save per-job `roster.json` (CSV/XLSX) |
| `/api/process` | POST | synchronous attendance processing with global rules |
| `/api/export/excel` | POST | generate Excel (base64 inline) |
| `/api/export/pdf` | POST | generate PDF (base64 inline) |
| `/api/rules` | GET/POST | process-global mutable rules + version derivation |

Processing pipeline: `detect_ivms_format` → `extract_attendance_events` → synchronous `process_attendance_events`/`process_employee_attendance` → per-run `processed.json`. The worker enforces a single database transaction for upload+metadata and cleans up a job directory on parse failure.

### 2.3 Filesystem / temporary storage

- `TEMP_DIR = Path(tempfile.gettempdir()) / "mm_attendance"` (domain: host-local temp dir).
- `job_directory(job_id, *, create)` resolves a job UUID under `TEMP_DIR`, validates it is a real directory and not a symlink, and passes `O_NOFOLLOW`/regular-file checks in `read_job_json`.
- Per-job files: `upload.json`, `processed.json`, `roster.json`, plus a `source{ext}` file.
- `backend/job_retention.py` provides an **opt-in** `cleanup_expired_job_directories(root, aware_cutoff, active_job_ids, dry_run=True)` helper that is deliberately **not wired into startup or request handling** — it must be called externally by a lifecycle owner.

### 2.4 Rules configuration and persistence

- `BUSINESS_RULES` is a module-level `dict`; `EFFECTIVE_RULE_KEYS = (normal_start_time, very_late_arrival_threshold, overtime_threshold)`.
- `effective_rules_version(rules)` returns the first 12 hex chars of the SHA-256 of the sorted effective keys.
- `RULES_VERSION` is a process-global that `update_rules_endpoint` mutates at import time.
- The rules page (`frontend/src/app/rules/page.tsx`) posts `AttendanceRules` to `/api/rules`; the backend only allows the three effective keys and validates `HH:MM` format.
- **No persistent or versioned rules store exists.** Rules have no source of truth, no immutable history, and no pinning by processing runs.
### 2.5 Job and result state management

- Job identity is a random UUID stored in the client URL and `sessionStorage`; there is **no job owner, no organization field, no server-side identity linkage**.
- Progress is tracked by files: `upload.json` (events + column map + filename), `processed.json` (processing result + `rules_version`), `roster.json` (roster map), `source{ext}` (uploaded bytes).
- Results are retained for the lifetime of the host temp directory; no retention/expiry policy is wired in and there is no deletion audit.
- Job ownership, scoping, and cross-user denial are unenforced because there is no identity to scope against.

### 2.6 Existing tests and coverage

- `backend/tests/` contains four units (`test_integrity_jobs.py`, `test_job_status.py`, `test_upload_bounds.py`, `test_job_retention.py`) — **38 tests pass** after the focused CSV fix.
- Tests are **synthetic and isolated**: they monkeypatch `main.TEMP_DIR`, build `SyntheticUploadFile` fixtures, and call route functions directly (the report notes ASGI transport tests hang in this environment).
- Frontend tests are Node-based ESM tests for `dashboard-status.ts`, `session-state.ts`, and `api-contract.ts` (TypeScript transpiled via `typescript` at test time).
- There is **no integration test** against the real FastAPI app, no auth test, no cross-user/cross-organization denial test, and no end-to-end synthetic browser test of the cloud-authored flow.

### 2.7 Existing dependencies and configuration

- `backend/requirements.txt`: `fastapi>=0.100.0`, `uvicorn>=0.23.0`, `openpyxl>=3.1.0`, `reportlab>=4.0.0`, `pdfminer.six>=20221105`.
- `frontend/package.json` carries Next.js 14 / React 18 / TypeScript / Tailwind; `frontend/package-lock.json` is committed, so dependency versions are pinned to the lockfile.
- CORS is configured only for `http://localhost:3000` and `http://127.0.0.1:3000`; `allow_credentials` is `false`.
- `NEXT_PUBLIC_API_BASE` is configurable via environment variable with a loopback fallback.

### 2.8 Security weaknesses relevant to cloud deployment

1. **No authentication or session management** anywhere on the backend or the frontend.
2. **No authorization** — every endpoint is effectively public; job IDs are client-supplied UUIDs with no ownership check.
3. **No CSRF protection** for state-changing browser requests, and no CSRF-bound token anywhere.
4. **No secure cookies** (the API has no session, but any session/cookie implementation to be added will need explicit `Secure`, `HttpOnly`, `SameSite`).
5. **Sensitive job data on host-local temp storage**, with loose permissions, no encryption-at-rest boundary, and no lifecycle tied to the database.
6. **Business rules mutable in-process** — no audit trail, no immutable version history, and a race if multiple workers/updates share the process.
7. **No rate limiting, request concurrency limits, or resource metering** beyond per-request read caps (`read_upload_bounded`).
8. **No network boundary**: CORS is a convenience, not a security boundary; the loopback fallback for `NEXT_PUBLIC_API_BASE` must be removed in production.
9. **No audit or logging** of login, session, rule changes, job lifecycle, processing attempts, exports, or deletion.
10. **No object-storage encryption, signing, or lifecycle** — any storage integration must add TLS-in-transit, signed downloads, versioning, and retention controls.
11. **Multi-tenant readiness absent** — no organizations, users, memberships, roles, or job-access grants.
12. **No pre-flight/origin allowlisting** or WAF/proxy for a public-facing deployment.

### 2.9 Existing changes that must be preserved

The repository is dirty and multi-deliverable. Preserved artifacts include:

- `backend/main.py`: the focused CSV validation correction (named headers + constrained legacy four-column fallback), the bounded upload reader, the per-job file storage, the roster upload, and the existing report generators.
- `backend/job_retention.py`: the opt-in, dry-run-first retention helper.
- `backend/requirements.txt` and `backend/tests/` (4 files / 38 tests).
- `frontend/src/app/page.tsx`, `/upload/page.tsx`, `/results/page.tsx`, `/rules/page.tsx` and the `src/components/ui/*`, `src/lib/*` client workflows and their `sessionStorage` state.
- `frontend` test files (`.mjs`), package manifests, lockfile, and UI component library.
- README, `start.sh`, `main.py.fixed`, and the existing reports, frontend/backend logs, and `json` fixture assets.

No tracked file should be reset, stashed, or overwritten, and no new file should be deleted without an explicit preservation review.

## 3. Architecture-to-code gap analysis

For each architecture component: what exists, what is missing, what must change, which files are affected, dependencies, and how to test without real employee data.

### 3.1 Authentication and sessions

- **Exists:** none. No identity store, no OIDC integration, no session cookie, no CSRF, no account lifecycle.
- **Missing:** managed OIDC provider, server-side session store, secure signed/encrypted cookie, CSRF token/validation, invitation/deactivation/recovery, token/session revocation.
- **Changes:** new backend /auth endpoints (and OIDC discovery/verification code), Next.js server-side session resolution and route guards, api.ts to carry browser cookies and CSRF tokens, NEXT_PUBLIC_API_BASE removal in production.
- **Files affected:** backend/main.py (new auth module + middleware), backend/tests/ (auth/revocation tests), frontend/src/lib/api.ts, frontend/src/app/*/(page|layout).tsx, frontend/src/lib/session-state.ts.
- **Dependencies:** OIDC provider selection and data-region decision (Milestone 0).
- **Synthetic test:** a local mock OIDC provider (or a well-known test IdP) with a pre-provisioned admin; integration tests assert valid sign-in, cookie flags, CSRF denial, and session revocation.

### 3.2 Users, organization and memberships

- **Exists:** none. No users, organizations, memberships, or employees.
- **Missing:** users, organizations, memberships, employees tables and repository functions; invitation and account lifecycle APIs.
- **Changes:** add a Postgres-backed data layer and the membership model; reconcile with the existing per-job roster model.
- **Files affected:** new backend/db/, backend/repository.py, backend/auth.py, backend/migrations/, frontend/src/lib/*.
- **Dependencies:** Milestone 0 owner decisions; OIDC provider contract.
- **Synthetic test:** create users/organizations/memberships with synthetic fixtures and assert scoped lookup.

### 3.3 Role-based authorization

- **Exists:** none. No roles or job ownership.
- **Missing:** roles (admin, operator, viewer), job_access_grants, role-checking middleware, permission-aware UI.
- **Changes:** define roles, add request middleware that resolves the authenticated user and organization, apply authorization to every route, and hide/limit UI actions by role.
- **Files affected:** backend/main.py (middleware), backend/repository.py, frontend/src/lib/*, frontend/src/app/*.
- **Dependencies:** Milestone 0 approval of job-visibility model, Milestone 2.
- **Synthetic test:** cross-user/cross-organization denial tests for upload, processing, results, exports, and deletion.

### 3.4 PostgreSQL schema and migrations

- **Exists:** none.
- **Missing:** complete schema + a migration mechanism (e.g., Alembic or an equivalent managed-DB migration runner).
- **Changes:** add a DB package with connection/session handling, schema migrations, and a migration gateway.
- **Schema to include:** organizations, users, memberships, employees; attendance_jobs, uploaded_files, attendance_imports (imported_attendance_events); roster_snapshots, roster_snapshot_rows, no_roster_snapshots; rules_versions; job_queue, processing_runs, attendance_results, result_event_evidence; generated_reports, report_template_versions; audit_events.
- **Files affected:** new backend/db/ and backend/migrations/ packages.
- **Dependencies:** Milestone 0 (managed Postgres), security review of column types/constraints.
- **Synthetic test:** create the schema in a test database, run migrations fresh, and assert constraints.

### 3.5 Organization-scoped employee records

- **Exists:** none. The roster is a job-specific roster.json.
- **Missing:** an organization-owned employee directory (employees) and membership-scoped view of it, so processing/reports are scoped to the organization.
- **Changes:** replace job-local roster files with (a) persisted organization roster snapshots and (b) an employees table filtered by membership; processor selects a roster snapshot by version for each run.
- **Files affected:** backend/db/, backend/repository.py, backend/main.py (+ worker).
- **Dependencies:** Milestone 3 roles; roster model in Milestone 4.
- **Synthetic test:** load synthetic employees into two organizations and assert results only see the caller's organization.

### 3.6 Attendance jobs and imported events

- **Exists:** UUID job dirs with upload.json (events + column map + filename).
- **Missing:** attendance_jobs, uploaded_files, attendance_imports, imported_attendance_events (immutable, source-evidence-preserving), and ownership + organization scoping.
- **Changes:** the upload endpoint commits job/import/file rows in the same transaction as the uploaded bytes' object metadata; imported events are immutable; retries/replacements create new rows.
- **Files affected:** backend/main.py, new DB/repository code, worker.
- **Dependencies:** Milestone 1 schema; Milestone 4 object storage for raw source bytes.
- **Synthetic test:** upload a synthetic CSV, assert job/import rows, assert failed uploads leave no files.

### 3.7 Roster snapshots

- **Exists:** job-local roster.json (map emp_id -> name, dates).
- **Missing:** roster_snapshots + roster_snapshot_rows, plus an explicit no_roster snapshot when a job is processed without a roster.
- **Changes:** convert roster upload into a snapshot; the processing run pins roster_snapshot_id (or no_roster).
- **Files affected:** backend/repository.py, backend/main.py, worker, backend/tests/.
- **Dependencies:** Milestone 1 schema; Milestone 4 roster import.
- **Synthetic test:** create a roster snapshot, process with and without a roster, assert the pinned version in the result.

### 3.8 Versioned attendance rules

- **Exists:** process-global mutable BUSINESS_RULES + derived RULES_VERSION.
- **Missing:** rules_versions table with source/diff, immutable version history, and run pinning; rules imported from DB.
- **Changes:** read the current rules version at startup, pin the resolved version into each processing run, record rule changes in audit + a version table.
- **Files affected:** backend/db/, backend/main.py, backend/worker.py, backend/tests/.
- **Dependencies:** Milestone 1 schema.
- **Synthetic test:** change rules and assert an old run retains its version and a new run gets the new version.

### 3.9 Durable processing queue

- **Exists:** none. /api/process runs synchronously.
- **Missing:** job_queue table (claim/lease/retry/terminal-state) and durable mechanism for reliable processing, retries, and recovery.
- **Changes:** split scheduling off the API: after upload, the API queues a job with SELECT FOR UPDATE SKIP LOCKED claim; the worker claims a lease, performs work, writes results, marks terminal state.
- **Files affected:** backend/db/, backend/main.py, backend/worker.py, backend/tests/, MMRJD_CLOUD_ARCHITECTURE_PROPOSAL.md (already documents the PostgreSQL queue choice).
- **Dependencies:** Milestone 1 schema; Milestone 7 worker; Milestones 5 and 6 pinned inputs.
- **Synthetic test:** drive the queue locally with a synthetic consumer; exercise claim, lease expiry, retry, and terminal-failed state.

### 3.10 Processing worker

- **Exists:** synchronous /api/process that blocks the request.
- **Missing:** long-running supervised worker that consumes the queue, retains the same engine rules, isolated CPU/memory/time bounds.
- **Changes:** add backend/worker.py, worker supervisor, queue-claiming, lease expiry, idempotency keys, terminal-failed state; keep /api/process available for backward compatibility.
- **Files affected:** backend/worker.py, backend/tests/, backend/requirements.txt (no new packages), supervisor docs.
- **Dependencies:** Milestones 5 and 6; Milestone 7 durable queue.
- **Synthetic test:** run worker against synthetic fixtures in a local loop; verify a job claims exactly once and results persist.

### 3.11 Private object storage

- **Exists:** host-local TEMP_DIR (no managed storage).
- **Missing:** managed private object storage, object versioning, checksums, lifecycle/deletion policy, signed upload/download, worker read access.
- **Changes:** storage layer for uploads + object keys; short-lived signed URLs for downloads; worker reads immutable object references.
- **Files affected:** backend/main.py, new backend/storage.py, backend/tests/, frontend/src/lib/api.ts (signed URL handling), platform infra docs.
- **Dependencies:** Milestone 1 schema/table for object metadata; Milestone 0 AWS/managed-platform choice; data residency.
- **Synthetic test:** run against a local S3-compatible shim (MinIO or fake) and validate checksum + signed URL flow.

### 3.12 Report generation and downloads

- **Exists:** /api/export/excel and /api/export/pdf return base64-encoded report bytes; metadata includes job/source filename + rules version.
- **Missing:** generated_reports (runtime, pinned inputs, rules version, template version), report_template_versions, object storage for report artifacts, authorized signed downloads.
- **Changes:** generate reports to object storage; report endpoint returns a signed URL or streams authorized bytes; keep base64 export during transition.
- **Files affected:** backend/main.py, backend/repository.py, storage layer, frontend/src/app/results/page.tsx (signed download UX), docs.
- **Dependencies:** Milestones 5, 6, 8, 10.
- **Synthetic test:** generate a synthetic report, store it, assert the download URL is bound to the correct job/rules version and expires after a short TTL.

### 3.13 Audit events

- **Exists:** none. audit_events is documented as an append-only table only.
- **Missing:** audit_events (action, target type/ID, principal, outcome, correlation ID) and capture points for login, session, rule changes, job lifecycle, processing, exports, deletion.
- **Changes:** repository-level audit capture, audit middleware for auth events, explicit audit-storage/retention policy (log retention, access review, no employee rows in logs).
- **Files affected:** backend/db/, backend/main.py, backend/repository.py, new backend/audit.py, backend/migrations/, backend/tests/.
- **Dependencies:** Milestone 2 (authenticated principals).
- **Synthetic test:** assert audit rows are written on login, rule change, job state transitions, and sensitive data is excluded.

### 3.14 Retention and backup controls

- **Exists:** cleanup_expired_job_directories (opt-in, dry-run-first, not wired in) and no backup policy.
- **Missing:** retention/expiry policy with TTL, object lifecycle, database backups/PITR, restore drills, hard budget alarms.
- **Changes:** expose retention via DB columns/apis, wire the retention helper to the job lifecycle, define backup restore and verify with synthetic data.
- **Files affected:** backend/job_retention.py, backend/db/, infra docs, Milestone 10.
- **Dependencies:** Milestone 0 retention durations and backup owners.
- **Synthetic test:** walk a synthetic store through expiry and restore drills; assert expired artifacts are pruned and unexpired ones survive.

## 4. Existing modifications and preservation risks

### 4.1 Preserved work

All existing uncommitted work must survive this implementation:

- Backend: backend/main.py (CSV validation, bounded reads, per-job file storage, roster upload, report generation), backend/job_retention.py, backend/requirements.txt, backend/tests/*.
- Frontend: the four page components, shared UI components, api.ts, session-state.ts, dashboard-status.ts, results-freshness.ts, and the .mjs test files.
- Support files: README.md, start.sh, frontend/package.json + lockfile, root package-lock.json, main.py.fixed, json fixtures, logs, and prior reports.

### 4.2 Risks to the existing implementation

1. **Rules upgrade friction:** a new persistent/versioned rules store replaces the current process-global BUSINESS_RULES; every processed result references a rules_version, so upgraded rules require an explicit reprocessing decision. Do not silently change the current GET/POST /api/rules contract until product approves.
2. **Sync-to-async transition:** moving processing from /api/process into a worker changes the request model. Preserve the existing synchronous endpoint (or a deprecated alias) while the worker becomes the production path, and keep the existing result shape during migration.
3. **File-format and store migration:** replacing upload.json/roster.json with database rows touches upload, roster, and processing paths. Keep the current job-file layout readable for a migration window; add a one-time converter for local jobs if any already exist on the host.
4. **Test surface:** the existing 38 tests monkeypatch main.TEMP_DIR and call route functions. New tests must not assume host-local temp storage is the production store; separate the storage boundary and re-run the full suite plus new auth/authorization tests.
5. **Browser state cache:** the frontend caches upload/processed state in sessionStorage. Under the new model, result provenance should be re-derivable from the server rather than trusted from browser cache.
6. **Project deliverables:** MMRJD_CLOUD_ARCHITECTURE_PROPOSAL.md, FOCUSED_COMPLETION_REPORT.md, and CLOUD_READINESS_AND_IMPLEMENTATION_PLAN.md are untracked. Do not rewrite them; keep them as the architecture and delivery record.

## 5. Recommended implementation milestones

Dependency-aware sequence. Local development can proceed against synthetic fixtures at every step.

| # | Milestone | Key deliverables | Dependencies | Testable locally? |
|---|---|---|---|---|
| 0 | **Decisions** | Approved threat model, matrix, data classification, retention durations, data region, OIDC provider, owners | Product/HR/security/procurement | No (decision work) |
| 1 | **Schema + repository + migrations** | Postgres schema, repo layer, migration tooling | Milestone 0 | Yes (test Postgres) |
| 2 | **Identity and session foundation** | OIDC, secure session, CSRF, invitation/deactivation/recovery, revocation | Milestone 0, 1 | Yes (loopback + mock OIDC) |
| 3 | **Authorization** | Roles, job access grants, middleware, cross-user/cross-org denial tests | Milestone 2 | Yes (synthetic orgs/users) |
| 4 | **Jobs, uploads, files, organization record** | attendance_jobs, uploaded_files, attendance_imports, imported_attendance_events, object storage, signed uploads | Milestone 1, 3 | Yes (s3-compatible shim) |
| 5 | **Roster snapshots** | roster_snapshots + rows + no_roster, processor pins snapshot | Milestone 1, 4 | Yes (synthetic) |
| 6 | **Versioned rules** | rules_versions, run pinning, no more process-global | Milestone 1 | Yes (synth) |
| 7 | **Durable queue + worker** | job_queue, worker, claim/lease/retry/terminal state, preserved sync endpoint | Milestones 1, 3, 4, 5, 6 | Yes (synthetic) |
| 8 | **Reports + downloads** | generated_reports, templates, signed downloads | Milestones 4, 5, 6, 7 | Yes (synth) |
| 9 | **Audit events** | audit_events, capture points, retention | Milestone 2 | Yes (synth) |
| 10 | **Retention + backups** | TTL/lifecycle, backups/PITR, restore drills, budget alarms | Milestone 9 | Yes (synthetic) |
| 11 | **Hardening + acceptance** | Resource limits, concurrency, rate limiting, full suite, CI gates | Milestones 1-10 | Yes (loopback + synthetic data) |
| 12 | **Staging + pilot gate** | Private staging, restore exercises, access reviews, budget review | Milestone 11 | Yes (synthetic, no live data) |

### Ordering rationale

- The data layer (1) is a hard prerequisite for authorization (3), jobs (4), roster (5), rules (6), and the queue (7).
- Authentication (2) precedes authorization (3) and audit (9).
- The worker (7) depends on the pinned inputs from 5 and 6, and on durable storage from 4.
- Reports (8) depend on worker outputs and storage.
- Retention (10) depends on audit events (9) for access/usage review.
- Hosting selection (Milestone 0) gates Milestone 1's provider, Milestone 3's connection bootstrap, and the deployment target; everything else can proceed locally with synthetic data.

## 6. Testing and acceptance criteria

### 6.1 Testing without real employee data

- Synthetic iVMS-style CSV/XLSX/PDF fixtures covering named headers, the constrained legacy four-column layout, and malformed inputs (two-column unrelated files, missing values, invalid timestamps).
- Synthetic schema fixtures: two organizations, several users, memberships, shared and private employees, job access grants.
- Synthetic jobs: uploads, roster snapshots, rule versions, queue claims, worker processing, report generation, audit rows.
- Synthetic OIDC: a local mock provider (or well-known test IdP) with a pre-seeded admin account.
- Synthetic storage: an S3-compatible shim (MinIO or an in-process fake) for checksum, signing, and signed-download tests.

### 6.2 Acceptance criteria

1. **Authentication:** sign-in, invitation, deactivation, and session revocation all work; session cookies carry Secure, HttpOnly, SameSite; CSRF fails closed.
2. **Authorization:** requests from a user lacking the required role/grants are denied for job status, roster mutation, processing, result access, exports, rules, and deletion; organization A cannot read organization B's data.
3. **Database:** schema migrations run cleanly; fixtures provision and tear down; constraints (not-null, unique, FK, check) hold.
4. **Jobs and events:** uploads create job/import/file rows immutably; failed uploads leave no job directories; retries create new rows; results are immutable per run.
5. **Roster:** a roster snapshot is fixed at processing time; jobs without a roster record an explicit no_roster snapshot; referenced employees are organization-scoped.
6. **Rules:** rule changes create a new version; an old run keeps its pinned version; a new run uses the current version; no process-global mutation.
7. **Queue/worker:** one job claims exactly once; expired leases are recovered; retries are bounded; unrecoverable work lands in a terminal failed state; a second worker joins without duplicating work.
8. **Storage:** uploads are private, versioned, checksummed, and transmissible only via signed URLs; worker reads immutable references; lifecycle/deletion respects retention.
9. **Reports:** a report binds job + results snapshot + template version; a signed download is scoped to the correct job and expires; regeneration reproduces the same output.
10. **Audit:** login, session changes, role/grant changes, job transitions, processing attempts, exports, and deletions produce audit rows; logs contain no employee rows or raw file contents.
11. **Retention/backup:** expired artifacts are pruned by an owner-approved cutoff; a restore drill recovers a synthetic database and object store.
12. **Frontend:** routes require authentication; stale-session guards inform the user; exports use scoped provenance; synthetic browser flows (upload -> process -> export) behave as in the existing reports.
13. **Security:** no endpoint leaks data across users/organizations; no secrets are committed; NEXT_PUBLIC_API_BASE does not default to loopback in production.

### 6.3 Test execution

- Keep the existing 38 backend tests running in CI and extend them with the new auth/authorization/queue/retention suites.
- Run the full suite against a real test Postgres (or a documented Docker-less alternative) and a synthetic S3-compatible store.
- Run browser flows against loopback services with synthetic fixtures; record pointer-driven regression in frontend tests.
- Do not run the full processing path on real attendance data; synthetic outputs must be reviewed manually against HR-prepared reports before operational use.

## 7. Unresolved decisions requiring the organization

### Confirmed decisions (30 October 2026)

The following were confirmed by the project owner on 30 October 2026 and must guide hosting, identity, security, and implementation planning:

- **14.1 Hosting preference:** managed hosting environment; prioritize low operational/maintenance overhead, reliable Next.js and FastAPI hosting, managed PostgreSQL with durable storage and automated backups, private object storage, reliable background processing via a durable queue and worker, and HTTPS/monitoring/logging/recoverability. AWS remains possible only if its operational complexity and cost are justified; managed alternatives must be evaluated before a provider recommendation.
- **14.2 Identity provider:** no existing organizational IdP. A managed identity provider must be selected; public self-registration remains disabled; user accounts and organization memberships are provisioned through an authorized administrative process; authentication and application authorization remain separate responsibilities.
- **14.3 First-release organization model:** one organization (MM&RJD) in the first release, but the data model and application must remain organization-aware for future organizations. No public SaaS registration, self-service tenant creation, subscription/billing, customer-managed domains, or a public multi-tenant administration portal.
- **14.4 Access-control expectations:** roles are Organization administrator, Attendance operator, and Read-only/report viewer; platform-level administration remains separate from routine attendance access. All access to employee records, uploads, processing jobs, rules, and reports must be authenticated and authorized server-side. Knowing a job ID or file URL is never sufficient. Organization-wide job visibility and any creator-specific or explicitly shared access rules still require MM&RJD approval.
- **14.5 Data protection and operational requirements:** private file storage and authenticated downloads; defined retention and deletion; durable database and file storage; automated backups and tested recovery; audit records for important administrative and data-access actions; secure handling of employee attendance information; no real employee data until required approvals and controls are in place.

### Still requiring approval (14.6 items)

The following remain unconfirmed and must not be treated as settled:

1. Hosting provider and deployment region.
2. The managed identity provider.
3. Whether MM&RJD approves organisation-wide visibility of attendance jobs.
4. The person responsible for approving attendance rules and changes.
5. The person responsible for data protection, retention, and deletion decisions.
6. Data residency requirements.
7. Backup retention, recovery point objective, and recovery time objective.
8. Account ownership and responsibility for ongoing platform administration.
9. The staging environment and its separation from production.

These are the items the project owner must resolve before any hosting/identity sign-up, database creation, or network exposure. The items above 14.6 (tenancy model and first-release organization model) are addressed by section 14.3 and by the approved single-organization direction.

## 8. Explicit tasks that must not start before approval

The following are not permitted to begin until the architecture/security decision gate (Milestone 0) is signed off:

1. **Creating or logging into any hosting, database, or object-store account.**
2. **External or production network exposure** of the API, worker, or storage.
3. **Adding authentication, session, or role/authorization code** to the application.
4. **Writing or running any database migration** for the new schema.
5. **Changing the current process-global rules store or replacing /api/rules** without product approval.
6. **Modifying application source code** in ways unrelated to the approved milestone (inspection and planning only).
7. **Copying any real attendance data** into development, staging, or test environments.
8. **Deploying, pushing, or committing** any real-data, hosting, or network-exposed configuration.
9. **Shipping any persisted secrets** to the repository or to a public location.

## 9. Immediate next steps (on approval)

1. Resolve the items in section 7 still requiring approval (the section 14.6 list), including hosting/region, identity provider, data residency, backup RPO/RTO, and staging separation.
2. Finalize the managed hosting and identity-provider comparison (section 10), justified against the application's actual requirements, operational responsibility, security, and full recurring cost; select the managed platform and managed identity provider; document the vendor/region choice and operator ownership.
3. Provision a local or staging development Postgres and an S3-compatible storage shim for synthetic work.
4. Create the Milestone 1 schema/repository/migration package behind the existing vertical slice (backend/db/, backend/migrations/), keeping all current behavior intact as the baseline.
5. Implement Milestone 2 identity and Milestones 3+ authentication in a closed local environment with synthetic OIDC, and run the full 38-test suite plus new denial tests.
6. Revisit this assessment after Milestone 0 before any code change that touches identity, schema, storage, or network boundaries.
7. Do not create or log into any production hosting, database, or object-store account until the section 14.6 decisions are signed off and the pre-approval checklist (section 10.7) is complete.

**State of review:** inspection and planning only - no code changes, no migrations, no dependency changes, no accounts, no deployment, no commits or pushes.

### 10. Managed hosting and identity approach recommendation

### 10.1 Confirmed decisions (30 Oct 2026)

The following were confirmed by the project owner on 30 October 2026 and must guide hosting, identity, security, and implementation planning.

- **14.1 Hosting preference:** managed hosting environment; prioritize low operational/maintenance overhead, reliable Next.js and FastAPI hosting, managed PostgreSQL with durable storage and automated backups, private object storage, reliable background processing via a durable queue and worker, and HTTPS/monitoring/logging/recoverability. AWS remains possible only if its operational complexity and cost are justified; managed alternatives must be evaluated before a provider recommendation.
- **14.2 Identity provider:** no existing organizational IdP. A managed identity provider must be selected; public self-registration remains disabled; user accounts and organization memberships are provisioned through an authorized administrative process; authentication and application authorization remain separate responsibilities.
- **14.3 First-release organization model:** one organization (MM&RJD) in the first release, but the data model and application must remain organization-aware for future organizations. No public SaaS registration, self-service tenant creation, subscription/billing, customer-managed domains, or a public multi-tenant administration portal.
- **14.4 Access-control expectations:** roles are Organization administrator, Attendance operator, and Read-only/report viewer; platform-level administration remains separate from routine attendance access. All access to employee records, uploads, processing jobs, rules, and reports must be authenticated and authorized server-side. Knowing a job ID or file URL is never sufficient. Organization-wide job visibility and any creator-specific or explicitly shared access rules still require MM&RJD approval.
- **14.5 Data protection and operational requirements:** private file storage and authenticated downloads; defined retention and deletion; durable database and file storage; automated backups and tested recovery; audit records for important administrative and data-access actions; secure handling of employee attendance information; no real employee data until required approvals and controls are in place.

The following were confirmed by the project owner on 30 October 2026 and must guide hosting, identity, security, and implementation planning.

### 10.2 Hosting recommendation: managed platform, lowest operational overhead

The preferred direction is a managed hosting environment rather than self-managed cloud infrastructure. The implementation should prioritize low operational and maintenance overhead, reliable hosting for the Next.js frontend and FastAPI backend, managed PostgreSQL with durable storage and automated backups, private object storage for uploaded attendance files and generated reports, and reliable background processing through a durable queue and worker, with HTTPS, monitoring, logging, and recoverability.

**Recommended candidate: Render** as the primary managed-platform target. Render provides a Next.js web service, a private background worker, managed PostgreSQL, object storage (S3-compatible), private networking, monitoring, and logging with low operational overhead. Its Postgres add-on can serve as the managed database, and its background worker can run the durable queue and processing service. This matches the confirmed preference for low operational overhead while still providing durable, recoverable state.

**Alternatives to evaluate before finalizing:**

- **Vercel for Next.js only:** excellent for the frontend and has built-in observability, but Vercel should not be the home for the Python processing service or sensitive job files without a reviewed split-service design; the FastAPI worker and any private storage would still need a dedicated host.
- **Supabase (Postgres-centric):** attractive if the team accepts a Postgres-first stack; it provides Postgres, auth, storage, and real-time, but the FastAPI worker is still a separate service and would need an external host.
- **AWS (ECS/Fargate + RDS + S3):** the most flexible and highest-ops option. Use only if internal cloud operations exist and the data-residency or recovery requirements justify the operational burden and cost.
- **Azure App Service / Entra ID:** viable if the organization aligns on Microsoft services; otherwise not assumed given no existing SSO.

**Not recommended for the first release:** self-managed cloud infrastructure (bare VPC + container orchestration + custom ops), because the confirmed priority is low operational and maintenance overhead.

### 10.3 Managed identity provider recommendation (no existing organizational IdP)

A managed identity provider must be selected; the application must not assume MM&RJD uses Microsoft Entra ID, Google Workspace, or another organizational SSO service.

**Selection criteria:** secure email-based account creation; MFA (admin required, staff preferred); account deactivation and emergency account recovery; session management and token rotation; OIDC integration; public self-registration disabled; user accounts and organization memberships provisioned via an authorized administrative process; and a clear separation of authentication from application authorization.

**Candidate managed providers (comparison):**

- **AWS Cognito** — the recommended default. Fully managed, email/phone sign-in, MFA, password and session policies, account recovery, and OIDC. Can be used standalone (not tied to an organizational SSO). Free tier and standard per-user/MoU pricing. Best if the app remains on AWS or as a standalone IdP.
- **Supabase Auth** — email/OTP and phone, MFA, OIDC via external providers; included in the Supabase plan with no self-registration. Cheapest when paired with Supabase Postgres/Storage, but ties the stack to a Postgres-centric platform.
- **Auth0 / Okta** — enterprise-grade, MFA, custom domains, OIDC; higher per-user price, which may be more than a small single-org pilot needs.
- **Firebase Auth** — email/password and passwordless, MFA, OIDC via federated providers; no self-registration when appropriately configured. Tied to the Firebase platform.
- **Azure AD B2C** — strong OIDC/MFA if the organization adopts Microsoft services; otherwise not assumed.

**Recommendation:** select **AWS Cognito** as the managed identity provider for the first release, unless the hosting decision moves to a Supabase-only Postgres stack. It is provider-agnostic, supports email-based accounts, MFA, deactivation, session management, and OIDC, and keeps authentication separate from application authorization. Re-evaluate once the hosting provider and region are confirmed.

### 10.4 Full recurring cost model with justification

The hosting comparison must evaluate the full architecture and operating cost, not just frontend hosting prices. For the first release, separate recurring fixed items from optional ones:

**Recurring fixed items (always-on baseline):** compute for the Next.js frontend and the FastAPI worker; managed PostgreSQL instance and storage; object storage for configured retention; log/metrics/alarm ingestion; database backups/PITR; domain, SSL, and support. These run continuously and form the baseline regardless of request volume.

**Optional items (enabled by policy choice):** managed queue service, WAF, customer-managed KMS keys, Multi-AZ database, staging environment, NAT/Gateway (only if needed by network design), higher backup retention, and enterprise support. Toggle each deliberately. Staging duplicates compute, database, storage, and backups; retained object versions and object versioning accumulate.

**Full recurring cost model by component:**

- **Compute:** Next.js frontend and FastAPI worker are billed by CPU/memory/duration (or VM/container). On-demand keeps commitment low while usage is uncertain; reserved/committed use can reduce cost after steady-state measurement.
- **Managed database:** instance class, storage, backup/recovery configuration, and Multi-AZ drive the largest fixed cost. Multi-AZ increases cost but reduces some recovery risk.
- **Object storage:** stored GB-month, requests, and retrieval; versioning and retention increase cost and are subject to deletion obligations.
- **Queue:** a PostgreSQL-backed queue uses existing database capacity (recommended initially); a managed queue such as SQS is request-based. Migrate only when measured throughput, contention, burstiness, or isolation requires it.
- **Logs/metrics/alarms:** ingestion, retention, and custom metrics, with retention and alert routing.
- **Network:** data transfer/egress are usage-priced; NAT only if required by network design.
- **Support/domain/staging:** support plan, domain, email delivery, staging (a duplicate of compute, database, storage, and backups), and retained object versions.

**Organisational responsibility and budget:** the managed provider maintains the database, container/platform, storage durability, and identity provider. The organisation, with a named owner, maintains infrastructure-as-code, IAM, base-image/dependency patching, database roles and migrations, backup policy and restore drills, network/WAF policy, monitoring/alerting, access reviews, retention/deletion policy, and incident response. Budget for production and staging, database backups/PITR, log retention, domain and email delivery, support, and engineering/operator time.

No figure in this section is a confirmed quote. Use a current regional calculator once the hosting provider, region, data volume, and instance sizes are selected before any purchase. The indicative planning bands in this proposal (e.g., AWS ~$160-$450/month reference; Render ~$80-$250/month) are unconfirmed estimates and exclude engineering/operator time.

### 10.5 Hosting comparison and provider justification

| Option | Next.js hosting | Backend & worker | Database | Object storage | Queue/worker | Ops overhead | Indicative planning band (unconfirmed) |
|---|---|---|---|---|---|---|---|
| **Render (primary recommendation)** | Render Next.js | Render background worker (private) | Managed Postgres (Render or equivalent) | S3-compatible object storage | Background worker + Postgres queue | Low | ~$50-150/mo base, before transfer, storage, support, and staging |
| **Vercel + separate worker host** | Vercel Next.js | FastAPI on Render/Fly.io or similar | External managed Postgres (e.g., Neon, RDS) | S3-compatible or platform native | Separate worker host | Medium | Vercel fee + worker host + DB + storage; adds an integration seam |
| **Supabase (Postgres-centric)** | Vercel/other Next.js | FastAPI on separate worker host | Supabase Postgres | Supabase Storage | Supabase Edge/Serverless; Python worker separate | Low | ~$25/mo Pro base + separate FastAPI worker cost |
| **AWS (only if justified)** | ECS/Fargate | ECS/Fargate workers | RDS PostgreSQL | S3 | SQS or Postgres queue | Highest; needs IAM, networking, observability owner | ~$160-450/mo (unconfirmed planning band per the architecture proposal) |

**Justification for the first release.** Render most closely matches the confirmed preference for a managed platform with low operational overhead while providing a private background worker, managed Postgres, object storage, and monitoring. Route Next.js through Vercel only if the team accepts an additional integration seam; the Python processing service should remain on a durable private worker host, not on Vercel. Use AWS only if the organisation has internal cloud operations and the data-residency or recovery objectives require it.

**Vercel recommendation.** Vercel can host the Next.js layer but should not be the default home for the Python processing service and sensitive job files without a reviewed split-service design. Keep the Python worker and any private job files on a dedicated private host (Render, Fly.io, or similar).

**Self-managed cloud is not recommended** for the first release: the confirmed priority is low operational and maintenance overhead, and a self-managed deployment concentrates operational responsibility on the organisation without the managed platform's operational assurances.

### 10.6 Data residency, retention, backup RPO/RTO

- **Data residency (14.6 item 6):** confirm the organisation's data-residency requirement before selecting a region; use the approved region consistently for compute, managed PostgreSQL, object storage, and backups.
- **Retention and deletion (14.5/14.6 item 5):** specify durations for imported attendance events, processing results, reports, and audit logs. Versioned object storage and retention rules apply to all stored files; deletion is a deliberate, audited lifecycle action, and live records must never be copied into lower environments.
- **Backups and recovery (14.6 item 7):** automated backups/PITR are provided by the managed database. Recovery point and time objectives are explicit owner decisions. The backup restore/recovery procedure must be tested on synthetic data before the pilot.
- **Monitoring and alerting:** configure alerts for repeated auth failures, authorization denials, queue backlog, storage growth, database saturation, parser failures, and failed backups. Alerts are not soft spending caps; monitor costs and set budget alarms.
- **Audit access:** define who can read audit records (administrators and security owners), how long they are retained, and how access is reviewed.

### 10.7 Pre-approval checklist before any account creation

Before signing up for any managed platform or identity provider, confirm with the organisation:

1. Hosting provider and deployment region (14.6 item 1).
2. Managed identity provider (14.6 item 2) and the organisational SSO assumption check.
3. Whether MM&RJD approves organisation-wide visibility of attendance jobs (14.6 item 3).
4. Person responsible for approving attendance rules and changes (14.6 item 4) and the person responsible for data protection, retention, and deletion (14.6 item 5).
5. Data residency requirements (14.6 item 6).
6. Backup retention, recovery point objective, and recovery time objective (14.6 item 7).
7. Account ownership and responsibility for ongoing platform administration (14.6 item 8).
8. Staging environment and its separation from production (14.6 item 9).
9. Confirmed long-term retention/deletion durations and data-residency jurisdiction.
10. The backlog/workload assumptions that drive queue and database sizing.

No production accounts should be created until this checklist is completed and the ownership and data-residency questions above are answered.

### 10.8 Next steps after confirmed decisions

The recommended sequence after these confirmed decisions, in dependency order:

1. Finalise the hosting and identity-provider comparison, justified against the application's actual requirements, operational responsibility, security, and full recurring cost; resolve the items in section 7 that are still unconfirmed.
2. Provision the chosen managed platform (Next.js, FastAPI worker, managed PostgreSQL, private object storage) and create the Milestone 1 schema and repository layer on top of it.
3. Implement the selected managed identity provider and authorized administrative provisioning, keeping self-registration disabled and keeping authentication separate from application authorization.
4. Implement authorization, job visibility (pending MM&RJD approval), roster snapshots, versioned rules, the durable queue and worker, reports/provenance, audit events, and retention controls in dependency order.
5. Before the pilot, test backup restoration and recovery drills on synthetic data, and review the staging environment separation and data-retention policy.

These steps align with the dependency-aware milestones in section 5 of this assessment and the architecture proposal.


