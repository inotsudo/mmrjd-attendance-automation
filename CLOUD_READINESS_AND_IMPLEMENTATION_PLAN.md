# MM&RJD Attendance System — Cloud Readiness and Implementation Plan

**Prepared:** 2026-10-30  
**Purpose:** Architecture and delivery plan only. This document does not authorize deployment, purchase, use of real attendance data, or a change to unresolved HR policy.

## 1. Executive recommendation

The application has a useful local workflow and synthetic regression coverage, but it is not safe for shared or public use. The Phase 2D false-success CSV defect has been fixed. The focused synthetic workflow verified rejection of malformed CSV, a valid upload, explicit processing, refresh recovery, current result provenance, and actual report downloads. Inspection also found and fixed an overlapping PDF table layout; the downloaded PDF now renders the synthetic row and headings legibly.

**Recommendation:** proceed to cloud implementation planning, then begin with a decision and threat-model milestone. Do not expose the current API or process real employee records. Authentication, job ownership, durable state, upload controls, privacy/retention policy, and unresolved HR decisions are prerequisites to an operational pilot.

## 2. Current application status

### Verified facts

- Frontend: Next.js 14 App Router, React 18, TypeScript, Tailwind; routes `/`, `/upload`, `/results`, and `/rules` (`frontend/src/app/*/page.tsx`). API requests are browser `fetch` calls built from `NEXT_PUBLIC_API_BASE` with a local `127.0.0.1:8000` fallback (`frontend/src/lib/api.ts`).
- Backend: FastAPI in `backend/main.py`; endpoints cover health, attendance upload, roster upload, explicit job processing, job status, rules, and Excel/PDF export.
- Attendance exports are limited in the handler to 50 MiB; rosters to 10 MiB (`backend/main.py`, upload endpoints). The read is bounded after FastAPI has parsed the multipart request. Multipart parser spooling and aggregate concurrent request limits are not fully controlled.
- Jobs and source/result JSON currently live in per-job directories under `tempfile.gettempdir()/mm_attendance`; there is no integrated expiry/deletion policy. Business rules live in one mutable Python process global.
- No authentication, account model, job owner/organization field, durable rules store, database, or cloud storage integration is present in the inspected code.
- Existing report safeguards require explicit processing, retain unknown event evidence, avoid inferring missing punches, block stale exports, and distinguish no events from absence. Their current persistence/ownership model is local-only.
- Backend tests pass after the CSV and PDF corrections: 38 tests. The browser evidence and exact scenarios are summarized in `FOCUSED_COMPLETION_REPORT.md`.

### Limitations

The existing implementation is a local prototype. CORS restrictions and loopback startup are helpful local boundaries, not authentication. A random UUID does not establish ownership. Process-global rules and host-local temporary storage cannot reliably serve multiple users or workers. The system is not approved for payroll or official attendance decisions; README.md itself labels it a prototype.

## 3. CSV defect and resolution

The old CSV parser guessed columns by position for files of any width and extracted a tuple from each data row even when required fields were absent or invalid. A two-column unrelated file therefore became a successful one-event upload.

`backend/main.py` now accepts the named-header structure already used in the project’s attendance tests (employee ID, event type, timestamp; optional employee name and date), plus a constrained legacy four-column positional structure derived from the prior indices (ID at column 1, event type at 3, timestamp at 4) only when those header positions plausibly describe those values. Blank lines are ignored. Every nonblank row must have employee ID, event type, and a parseable timestamp. If a Date column exists, it must be present, valid, and match the timestamp date. Unknown but nonempty event types remain source evidence for review.

**Import contract:** malformed headers or any malformed nonblank row reject the entire upload with HTTP 400 and a row-specific explanation. The parser does not silently skip bad records and report partial success. The upload handler removes the newly created job directory on parse rejection. Synthetic tests cover unrelated headers, empty input, missing headers/values, invalid/mismatching dates, invalid timestamps, named and legacy positional valid formats, whole-file rejection, and cleanup.

**Format assumption to validate with the file owner:** the five-column named header used by the current tests and the legacy ID/name/event/timestamp positional layout are the only CSV structures evidenced in checked-in code/tests. No real export was inspected. Before onboarding real device exports, obtain approved synthetic/anonymized examples for every intended iVMS export variant and add fixture tests. Do not relax strict validation based on a guessed format.

## 4. Essential workflow verification

See `FOCUSED_COMPLETION_REPORT.md` for the test-by-test evidence and which scenarios rely on Phase 2C. In brief, new browser verification covered the fixed invalid CSV behavior, valid synthetic upload and refresh, explicit processing and refresh, one correct employee-day row, stale-result display after a temporary effective-rule change, and actual Excel/PDF download inspection. Phase 2C independently verified stale export buttons are disabled and exports become available again after restoring rules and reprocessing. The synthetic Excel contains exactly one SYN-C1 day with expected headings, 2026-10-28 date, 08:00/17:00 times, source evidence, job ID, and rules version. The generated PDF was rendered to an image and checked for a readable header/table and the same values; the first layout overlapped, so it was corrected and downloaded again.

No real files or attendance device were used. There is no broad current-worktree browser certification; only the requested essential path was rerun.

## 5. Target architecture

### Recommended initial deployment shape (AWS reference design)

Use a single cloud account/environment and region selected after data-residency and contract review. A practical first architecture is:

1. **Public edge:** managed DNS, HTTPS certificate, and an Application Load Balancer. Route one application origin to the Next.js frontend and `/api/*` to the API. Add WAF/rate limiting where appropriate. Keep services, database, and object storage private.
2. **Frontend:** containerized Next.js on ECS Fargate, or another supported managed Next.js host if SSR/runtime support is validated. Configure the API client to use the same HTTPS origin/path instead of a browser-visible localhost URL. Same-origin routing simplifies cookie auth and CORS.
3. **API:** FastAPI container on ECS Fargate behind the load balancer. Application authorization is enforced in every route/service. The API must not treat CORS, UUID opacity, or a user-supplied organization ID as access control.
4. **Processing worker:** separate private worker task consuming a managed queue (for example SQS). Upload/processing requests create an authorized job record, enqueue a job ID and immutable rules-version ID, and return a status. Workers enforce idempotency and job ownership context, use bounded resources, and persist results/provenance.
5. **Relational store:** managed PostgreSQL for organizations, identities/memberships, job state, metadata, rules versions, processing state, and append-only audit events. Use private networking, TLS, encryption at rest, automated backups, tested restore, and restricted DB credentials.
6. **Object storage:** private S3 buckets/prefixes for quarantined uploads, validated source files, optional generated reports, and derived artifacts. Encrypt with a managed key, deny public access, scope service roles to prefixes, and record object checksums/version, owner, job, content type, size, and retention state in the database.
7. **Secrets and observability:** managed secret store for DB credentials, signing keys, and provider secrets; never ship secrets in `NEXT_PUBLIC_*` variables. Central logs/metrics/alerts must redact employee IDs/names and file content. Use request IDs and job IDs for operations while restricting access to sensitive metadata.

This design separates the web request path from CPU/memory-heavy parsing and report generation. It avoids local ephemeral disk as the system of record. A small initial deployment may start with one API/worker task and scale only when measured load requires it; the database, queue, ownership checks, and storage should still be designed for multi-instance correctness from the start.

### Alternatives

| Option | Advantages | Trade-offs and fit |
|---|---|---|
| AWS managed components above | One provider boundary; private networking, object storage, queue, managed Postgres, and container workers fit the Python parser and async jobs. | More services and operational setup. Costs vary by selected region, always-on tasks, load balancer, database availability, logs, backups, egress, and S3 requests. Avoid cost estimates until region and availability requirements are decided. |
| Vercel frontend + Supabase Postgres/Auth/Storage + separate Python API/worker host | Faster setup and integrated account/database/storage tooling; Supabase currently documents a $25/month Pro base plan and included quotas, while Vercel Pro documents a $20/month platform fee/usage credit. [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq), [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan) | Python API and worker remain another provider or service; cross-provider networking, identity trust, data-processing agreements, region matching, backups, and cost boundaries need explicit review. Quotas/overages and plan details change; do not treat the base prices as a total deployment quote. |
| Single VM/VPS with containers and managed DB/object store | Lowest initial service count and can be cost-predictable at small scale. | You own OS patching, process supervision, queue reliability, backups, capacity, incident response, and high availability. A single instance remains a failure point; not the preferred option for employee information without operational ownership. |

The AWS model is usage-based: Fargate charges reflect requested CPU/memory/storage and duration; RDS charges include compute and storage, with different Single-AZ/Multi-AZ choices; S3 charges include storage, requests, retrieval and data transfer. Use the provider calculator after region, availability, expected jobs/month, average file size, retention, and staff count are known. [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [RDS pricing](https://aws.amazon.com/rds/pricing/), [S3 pricing](https://aws.amazon.com/s3/pricing/).

## 6. Authentication and account design

Use a managed OIDC identity provider rather than storing passwords in this application. Cognito is one AWS-aligned option; an organization may choose another provider after procurement/security review.

### Roles

- **Organization administrator:** invites and disables staff in their organization; assigns the authorized staff role; may update approved organization attendance rules; views organization jobs and audit activity. Require MFA for administrators.
- **Authorized staff:** may upload attendance exports, manage/associate a roster, explicitly process jobs they own or that are shared with their organization under an approved policy, inspect results, and download permitted reports. Staff cannot manage accounts or change effective rules unless explicitly granted an additional role.
- **Platform operator:** infrastructure support identity, not an ordinary tenant account. Access to employee content is denied by default and any approved break-glass access must be time-limited, justified, logged, and reviewed.

### Authentication flow and lifecycle

- Invitation-only account creation by an administrator. No public self-signup unless a later product decision requires it.
- OIDC login using authorization code flow; browser session cookie is `Secure`, `HttpOnly`, `SameSite` appropriate to the chosen flow, with short-lived server-validated sessions and CSRF protection for state-changing requests.
- Logout invalidates the application session and provider session where supported. Deactivation revokes sessions/tokens and blocks API authorization immediately or within a defined short interval.
- Password reset and recovery are handled by the identity provider’s verified recovery process. Administrators can initiate reset/reenrollment but never view or set a user’s password.
- Enforce MFA for administrators; decide whether staff MFA is mandatory or risk-based before rollout. Rate-limit login/recovery and alert on repeated failures.
- Map provider subject IDs to an internal user record and organization membership. Do not authorize based only on email text, client-side role flags, or unsigned claims.

## 7. Job ownership and authorization model

Every job must have immutable `organization_id` and `created_by_user_id` set by the authenticated server session. Every API operation resolves the job under the caller’s authorized organization; never look up a global latest job. Check authorization on upload, roster association, status, processing, results, export, and deletion. Administrators’ broader view is organization-scoped and must be explicitly represented in policy.

The database should support a future job-share/access grant if cross-user collaboration is needed; do not infer that all staff in an organization can see every record until the owner decides. UUIDs are identifiers only. Use deny-by-default authorization and tests that attempt cross-user and cross-organization reads/writes/downloads.

## 8. Database and data model

Use PostgreSQL with migrations and foreign keys. A starting schema (details should be adjusted during design, not implemented in this planning phase):

- `organizations(id, name, status, created_at)`
- `users(id, idp_subject, email_normalized, status, created_at, disabled_at)`
- `memberships(organization_id, user_id, role, status, created_by, timestamps)` with unique membership constraints
- `jobs(id, organization_id, created_by_user_id, source_filename, source_object_key, checksum, byte_size, state, created_at, updated_at, failure_code)`
- `rules_versions(id, organization_id, version, effective_values_json, created_by_user_id, created_at)`; immutable version rows with one organization current-version pointer or a temporal activation table
- `processing_runs(id, job_id, rules_version_id, state, attempt, started_at, finished_at, result_object_key, summary_json, failure_code)`
- `reports(id, job_id, rules_version_id, format, object_key, checksum, generated_at, generated_by_user_id)` if reports are retained rather than regenerated
- `audit_events(id, organization_id, actor_user_id, job_id, action, timestamp, request_id, safe_metadata_json)` with append-only application permissions

Keep employee IDs/names and raw punches out of routine logs and audit metadata. Results can be a JSON object stored with strict schema/versioning or normalized tables depending on query/report needs. Choose after expected reporting/search needs are known.

## 9. Storage, backup, retention, and deletion

The current `/tmp/mm_attendance` storage is temporary, host-local, not owner-scoped, not durable, and has no integrated deletion schedule. It is not a cloud storage design.

Use encrypted private object storage for raw uploads and generated artifacts; use PostgreSQL for job ownership, lifecycle, rules versions, checksums, and audit references. Keep raw and derived objects under separate organization/job-scoped keys, but do not place secrets or employee names in object keys. Use least-privilege service roles and short-lived download links after authorization.

Before implementing retention, the organization must choose a policy owner, retention interval by data class, legal hold behavior, backup expiry behavior, export retention, and deletion evidence requirements. Do not infer a duration. Application deletion should remove database references and all object versions/replicas according to the approved policy; deletion from a live bucket does not necessarily erase backup copies immediately. Define backup retention and test restoration/deletion interaction. Audit events may require a separate longer period but must minimize employee data.

## 10. Upload and parser security

- Keep 50 MiB attendance and 10 MiB roster limits initially unless owners approve a change. Enforce limits at the edge/reverse proxy and in the ASGI receive path before multipart parsing can consume unbounded memory/disk. Add bounded streaming to quarantine storage and per-user/organization concurrency and storage quotas.
- Validate extension, detected file signature/content, parser result, required columns, row counts, and per-row invariants. Treat parser failure as whole-file rejection unless a specifically approved partial-import contract includes counts and a reviewable rejected-row artifact.
- CSV parser: enforce strict required schema; cap rows, columns, individual field lengths, and parse time. Normalize encoding safely. Unknown event labels should remain review evidence, never be mapped to confirmed direction by guesswork.
- XLSX/XLS/PDF: protect against malformed archives, excessive zip expansion, oversized sheets/pages, parser CPU/memory exhaustion, and malicious payloads. Run parsers in isolated worker tasks with memory, CPU, execution-time, and retry limits; do not execute macros or embedded content. Assess malware scanning/quarantine requirements with security owners.
- Use queue backpressure, idempotency keys, per-organization concurrency limits, cleanup for rejected/interrupted uploads, and monitoring for resource saturation. Ensure a failed upload cannot leave an orphaned job or make another user's job appear current.
- The current endpoint reads bounded file bytes after multipart parsing. That is not equivalent to an ingress body limit or a streaming upload pipeline.

## 11. Security and operations requirements

- HTTPS only; secure cookies; CSRF defense for cookie-authenticated mutations; strict CORS only if cross-origin access is intentionally required.
- Authentication and ownership checks in every endpoint/service, plus cross-tenant tests; use database constraints or row-level security only as a defense-in-depth layer, not the sole application authorization check.
- Encryption in transit and at rest; managed key policy and rotation; secrets manager; least-privilege task roles; no public buckets; private DB subnets.
- Separate dev/test/staging/production accounts or strongly isolated environments; synthetic fixtures only in lower environments. Do not copy production files into developer test environments.
- Audit admin actions, login/session/security events, rule changes, job lifecycle, processing attempts, exports, and deletion. Do not log employee rows or raw file contents.
- Alert on repeated auth failures, authorization denials, queue backlog, parser errors, file-size rejects, storage growth, DB saturation, and failed backups.
- Define incident response, employee data breach notification obligations, access review, vulnerability patching, dependency scanning, and secure software release controls before pilot.
- Verify recovery with database/object backups and a documented restore exercise. Monitor costs and configure budget alarms; alerts are not hard spending caps.

## 12. Cost considerations

No total cost is quoted because region, availability target, concurrent staff, monthly file count/size, retention, and support requirements are unresolved. AWS bills compute by Fargate CPU/memory/duration, database instance and storage/backup/availability configuration, object storage size and requests, data transfer, logs/metrics, load balancer, secrets, and queue use. Multi-AZ and longer backups increase cost but reduce some recovery risks. On-demand keeps commitment low while usage is uncertain; reserve/commit only after measured steady-state usage. Use AWS Pricing Calculator for a region-specific estimate before any purchase.

For a lower-operations alternative, Supabase documents a $25/month Pro base plan and included quotas; Vercel Pro documents a $20/month platform fee with included usage credit. These are plan components, not a complete secure deployment estimate: API/worker hosting, overages, backups, domains, tax, provider data agreements, and cross-provider transfer may add costs. Verify current pricing and Rwanda/data-residency eligibility at procurement time. No service has been purchased or selected.

## 13. Ordered implementation milestones

### Milestone 0 — Product, policy, privacy, and threat-model decisions

- **Objective:** approve ownership, access, data, and service boundaries before code changes.
- **Required changes:** none; decision records for tenant model, staff job visibility/share, admin responsibilities, MFA, data region, retention/legal hold, backup expiry, audit access, maximum workload, and HR semantics.
- **Dependencies:** product owner, HR owner, security/privacy owner, procurement.
- **Acceptance criteria:** approved threat model/data-flow diagram, access matrix, data classification, retention policy owner and durations, jurisdiction/data-residency decision, workload assumptions, unresolved HR policies remain explicitly flagged.
- **Security considerations:** no real data or public test service until decisions and access controls are approved.

### Milestone 1 — Identity and tenant authorization foundation

- **Objective:** establish secure administrator-managed accounts and organization boundaries.
- **Required changes:** selected OIDC provider; invitation/deactivation/recovery/MFA flows; internal user and membership records; server-side session; role/organization middleware; job ownership fields; authorization on every route.
- **Dependencies:** Milestone 0; provider and region approval.
- **Acceptance criteria:** admin/staff permission matrix is tested; cross-user/cross-organization access tests deny job status, roster mutation, processing, result, export, rules, and deletion; deactivated sessions are rejected; admin MFA works; audit events record access-control changes.
- **Security considerations:** no role checks in client-only code; protect cookies/CSRF; do not trust supplied user or organization IDs.

### Milestone 2 — Durable database, rules versions, and job lifecycle

- **Objective:** remove process-global and temporary-filesystem correctness dependencies.
- **Required changes:** PostgreSQL migrations/schema; durable organization-scoped immutable rules versions; jobs/processing-run state; conditional state transitions; job-scoped data references; migration strategy for synthetic-only environments.
- **Dependencies:** Milestone 0 and ownership schema from Milestone 1.
- **Acceptance criteria:** concurrent API/worker instances see consistent job/rules state; restart does not lose jobs; rule changes create versions; results and exports prove the exact version; stale jobs are blocked until explicit reprocessing; concurrency and retry/idempotency tests pass.
- **Security considerations:** tenant scoping, database least privilege, encrypted backups, secrets rotation, no employee values in operational logs.

### Milestone 3 — Secure upload pipeline and isolated workers

- **Objective:** validate files without unbounded web-process resource use.
- **Required changes:** edge and ASGI body caps, streamed quarantine upload, file content checks, row/field limits, isolated parser worker, queue, quotas/backpressure, malware policy, cleanup and failure state.
- **Dependencies:** durable jobs/object metadata from Milestone 2; approved file-format fixtures.
- **Acceptance criteria:** synthetic valid variants parse; malformed headers, rows, invalid timestamps, oversized/expansion-bomb test files reject safely; interruptions leave no active orphan; concurrent load remains within resource budget; output records preserve ambiguity and evidence.
- **Security considerations:** parsers run with no unnecessary network/filesystem access, resource ceilings, private encrypted storage, no macro execution.

### Milestone 4 — Private storage, reports, retention, and audit

- **Objective:** secure employee files and make lifecycle/report actions traceable.
- **Required changes:** private object storage, encrypted access paths, authorized short-lived download, report artifact/version metadata, append-only audit events, retention/deletion worker and backup coordination.
- **Dependencies:** retention and audit policy from Milestone 0; ownership and jobs from prior milestones.
- **Acceptance criteria:** owner-scoped download tests; tampering/checksum detection; retention dry-run then approved policy execution; delete and restore tests cover live, replicated, and backup copies; report provenance checked; audit review/export implemented for authorized admins.
- **Security considerations:** strict bucket policy, KMS key access, URL expiry, no public access, deletion/legal-hold correctness.

### Milestone 5 — Cloud deployment foundation and operational controls

- **Objective:** deploy a private, monitored staging system after application gates pass.
- **Required changes:** IaC, network/VPC/subnets, TLS/domain, frontend/API/worker services, queue, database, secrets, CI/CD, migrations, monitoring, alerting, budget alerts, backup/restore runbook.
- **Dependencies:** Milestones 0–4; vendor, region, cost and procurement approvals.
- **Acceptance criteria:** staging accessible through HTTPS; API and DB are not public; CI deploys a reviewed build; rollback and restore exercises pass; security scans and synthetic end-to-end tests pass; cost alert and incident playbook are tested.
- **Security considerations:** no production employee data in staging; least-privilege IAM, no secrets in images/client bundles, network ingress restricted, dependency/image patching.

### Milestone 6 — Controlled synthetic pilot and production approval gate

- **Objective:** prove operational behavior before considering approved real-data use.
- **Required changes:** synthetic end-to-end and cross-tenant test suite, admin runbooks, HR acceptance of classifications/reports, privacy/security review, training and support plan.
- **Dependencies:** all previous milestones and business/legal sign-off.
- **Acceptance criteria:** signed authorization for pilot scope, documented support/escalation, tested backup restore, access review, audit review, retention job and deletion evidence, no critical security/integrity defects, exact deployment/data region approved.
- **Security considerations:** production access starts with least privilege, monitoring, and a rollback/disable-upload control; rollout is limited to approved accounts.

## 14. Risks and unresolved decisions

- **HR policy:** late-arrival threshold semantics, missing check-out/default end, and weekend overtime remain unresolved. Preserve uncertainty; do not encode a guessed policy.
- **Data law/residency:** the applicable employment/privacy law, approved storage geography, transfer basis, data-subject process, breach duties, and contractual terms need owner/legal review.
- **Who can see a job:** decide private-to-creator vs shared-with-organization and exception approvals before the data model freezes.
- **Retention:** set owner, durations by source/result/report/audit class, legal hold, deletion verification, backup expiry and exports. Do not invent a number.
- **Files:** real device export schemas have not been inspected. Current verified named and positional patterns may not cover every iVMS export variant.
- **Load/cost:** monthly upload count, max organization size, concurrency, PDF page count, retention volume, availability, recovery point/time objectives, and support coverage are unknown.
- **PDF format:** wrapped table cells fixed the tested 13-column overlap for synthetic records. Confirm with product users whether landscape letter, 6pt cells, and the current field set are acceptable for official use; no payroll approval is implied.
- **Security:** no authentication/authorization, persistent tenant-scoped rules, or cloud controls exist yet. The local API must not be exposed.

## 15. Readiness conclusion

The application is ready to move into **cloud implementation planning**, not cloud deployment or real-data operation. Milestone 0 should be the next engineering action. The cloud architecture and account design in this document are recommendations and require organization, HR, security/privacy, and procurement approval before implementation.
