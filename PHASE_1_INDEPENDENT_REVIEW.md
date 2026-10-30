# MM&RJD Attendance System — Phase 1 Independent Review

**Review date:** 2026-10-30
**Scope:** Read-only review of current Phase 1 implementation, tests, and available report history. No source, configuration, test, or prior report files were modified. No attendance service or data was accessed.

## Executive assessment

The Phase 1 changes improve local single-process behavior: the dashboard now checks saved server job/rules metadata, a missing job no longer validates a cached processed result, history is distinguished from readiness, and the API has more contract tests. The job path checks also reject a simple job-directory symlink.

I do **not** consider the implementation ready to enter a cloud deployment phase without further application and architecture work. The most important blockers are shared mutable in-memory rules with no user/owner boundary; job data in process-local temporary storage; absence of authentication/authorization; a Results page that does not use the new server job-status check; unbounded client export history with a success/error ordering bug; and incomplete integration coverage for the new endpoint and UI state. The old reports also cannot be independently compared from disk because they are missing in this worktree.

**Acceptance:** Phase 1 is **partially acceptable as a local application-hardening iteration**, but I would not sign off its “complete” readiness assessment as a gate to cloud implementation. Close the high-priority correctness and multi-user state issues below first. This assessment does not approve production use or real employee data.

## Scope, preservation, and review limitations

`git status --short`, staged diff summary, and tracked diff summary were inspected. The worktree contains existing modifications and many untracked files. The staged diff summary was empty. No existing file was edited, reverted, staged, or deleted; this new report is the only file created by the review.

`APPLICATION_PREPARATION_REPORT.md` exists and was read. The referenced `VERIFICATION_REPORT.md`, `REMEDIATION_REPORT.md`, and `frontend/FRONTEND_AUDIT_REPORT.md` do **not** exist in the current worktree (`find` showed only `APPLICATION_PREPARATION_REPORT.md` and `README.md` among project Markdown files). Therefore claims in those historical files could not be independently checked here. I compared source against the history summarized in the available preparation report and against the actual implementation/tests.

No tests, builds, browser sessions, backend requests, or employee data were used in this read-only review. Test-coverage comments below come from reading the test implementations, not from rerunning them.

## Verified implementation facts

- `backend/main.py:69-95` validates UUID job IDs, rejects a symlink storage root and a symlink job-directory child, and ensures the resolved job directory is an immediate child of the resolved storage root.
- `backend/main.py:105-130` implements `GET /api/jobs/{job_id}/status`. It checks for `upload.json`, reads `processed.json` if present, checks its `job_id`, and returns stored/current rules versions without processing.
- `frontend/src/app/page.tsx:68-120` reads cached session state and calls `api.getJobStatus()` only when it has a processed result, upload job ID, and string rules version. If the request fails, it shows unknown status through the helper. Metrics based on processed data are withheld unless helper status says current.
- `frontend/src/lib/dashboard-status.ts:35-68` requires matching upload/result job IDs and matching cached/server rules versions before it returns “Ready to export” or “Exported for current rules.” Historical records are presented separately.
- `frontend/src/app/results/page.tsx:40-62` still restores cached rows and checks only current rules via `GET /api/rules`; it does not call the new job-status endpoint. Exports are protected server-side by `backend/main.py:810-821`, which verifies stored job and rules provenance.
- `backend/main.py:23-39,758-760,863-880` keeps effective rules in a module-level `BUSINESS_RULES` dictionary, snapshots that dictionary at processing time, and updates it in memory on rule saves. There is no user/tenant scope or persistent rules store in the inspected code.
- `backend/main.py:65-66` stores jobs under the host temporary directory (`tempfile.gettempdir() / "mm_attendance"`). The app has no automatic job expiry/retention mechanism. The separate `backend/job_retention.py:18-77` helper is not imported by startup or API code, defaults to dry-run, and relies on caller-supplied active IDs and lifecycle locking.
- `backend/main.py:57-63` allows only two localhost CORS origins; `start.sh:38-40` binds Uvicorn to `127.0.0.1`. I found no authentication, authorization, user ID, or job owner enforcement in the inspected backend.
- `frontend/src/app/results/page.tsx:90-107` calls `downloadFile()` before recording export history in `sessionStorage`; history is appended without a cap at lines 94-102.
- `frontend/src/app/page.tsx:22-46,71-82,193-196` parses saved metadata JSON but casts it to `ImportSummary` without validating its fields; rendering assumes `format` is a string and calls `.toUpperCase()`.

## Findings

Severity means impact if the application were used by multiple users or moved toward cloud hosting. “Verified” means directly supported by current source; “Risk” identifies a plausible consequence that was not reproduced in a running system.

| Priority / category | Evidence | Finding and impact | Recommended disposition |
|---|---|---|---|
| **Critical — verified security and multi-user gap** | `backend/main.py:57-63,105-130,564-605,605-657,727-801,852-880` | No authentication/authorization or job ownership is present. CORS is an origin policy, not access control. Endpoints accept job IDs and roster/process/export calls are not scoped to an authenticated owner. Any network caller that can reach the API may manipulate rules or operate on a known job ID. This blocks cloud hosting and shared-network use. | Before cloud work, define and implement authenticated principals, role access for rule changes, and server-enforced owner/tenant scoping for every job, roster, status, processing, and export operation. Do not treat UUID unpredictability or CORS as authorization. |
| **Critical — verified shared global rules; multi-worker risk** | `backend/main.py:23-39,758-760,863-880` | Rule changes affect the single process-wide dictionary, so one administrator’s rule change changes processing/status/export behavior for all users of that process. There is no lock around the per-key update and process snapshot. With multiple workers/instances, each process can hold a different in-memory rules version; the same job can therefore appear current on one worker and stale on another, and rules reset on restart. | Before multi-user/cloud deployment, decide whether rules are global or scoped, store them durably with a version, make updates atomic, and ensure processing/status/export read the same authoritative version. Add concurrent update/process tests. |
| **High — verified stale Results display path** | `frontend/src/app/results/page.tsx:40-58`; compare dashboard `frontend/src/app/page.tsx:91-115` | The Results page validates cached row job ID against the cached upload ID and compares rules, but never asks whether the server still has that job/result. If a job is removed, a worker has a different local temp store, or cached state outlives server state, rows can still render and export buttons remain enabled until an export attempt gets a server error. | Use the server job-status result before presenting cached Results as current and before enabling export. Render an explicit unavailable/stale state when the job/result is absent. Test the 404 and server/session version mismatch paths at the component level. |
| **High — verified non-durable, process/host-local job storage** | `backend/main.py:65-66,564-605,605-657,727-801`; `backend/job_retention.py:3-6` | Jobs, raw source, parsed data, rosters, and results reside under OS temporary storage. There is no durability, replication, configured expiry, or cleanup integration. A restart, OS temp cleanup, container replacement, or load balancing to another local filesystem can make jobs disappear or appear inconsistently. Two jobs are UUID-separated within one shared filesystem, but not durably or consistently shared across instances. | Before cloud hosting, choose durable per-job storage with access control and an explicit retention/deletion policy. Do not assume `/tmp` survives restarts or is shared between workers. |
| **High — verified upload memory amplification risk** | `backend/main.py:565-569` and `backend/main.py:605-608` | Both upload handlers read the entire upload into `content` before enforcing the application size limit. The advertised 50 MiB attendance and 10 MiB roster caps are checked only after full buffering. Concurrent large requests can use memory proportional to aggregate request size and potentially exhaust a worker. | Before exposing an upload endpoint beyond localhost, enforce request-body limits at the server/proxy and stream or bounded-read the upload before parsing. Add concurrent over-limit tests and verify temporary-file cleanup. |
| **High — potential filesystem symlink/TOCTOU gap** | `backend/main.py:82-95,105-120,564-586,727-755`; `backend/job_retention.py:47-77` | The new guard protects the job-directory component, not individual `upload.json`, `processed.json`, or `roster.json` files. Those paths are subsequently checked/read with normal `is_file()`, `exists()`, `open()`, or `read_text()` calls that follow file symlinks. Path validation is also separate from subsequent opens. This requires write access to the store or a race, so it is a local/shared-storage threat rather than a demonstrated remote exploit; however it weakens the claimed containment if the storage directory is shared or permissions are misconfigured. | Before using shared/persistent storage, set restrictive ownership/modes and use no-follow, descriptor-relative operations or an equivalent storage API. Add tests for symlinked files and replacement races, not only a symlinked job directory. |
| **Medium — verified export-history error after download** | `frontend/src/app/results/page.tsx:90-107` | The browser download is triggered before `sessionStorage` writes. If the history write hits quota/security errors, the catch displays “report could not be generated” even though the download was already triggered. The history list also grows without bound (`:94-102`), making quota failure more likely over a long session. | Bound or otherwise persist history safely; treat download generation and local history persistence as separate outcomes. Do not show generation failure after the file has already been handed to the browser. Test quota exceptions and confirm history is not silently lost. |
| **Medium — verified unvalidated import metadata** | `frontend/src/app/page.tsx:71-82,193-196` | `parseDashboardSession()` validates JSON syntax only. `mm_upload_meta` is cast directly; malformed but valid JSON such as `{}` reaches render code that calls `lastImport.format.toUpperCase()`, which can throw. | Validate stored metadata structurally before setting it; use an unknown/invalid-session state when shape checks fail. Add component-level tests for malformed-but-valid JSON objects. |
| **Medium — verified dashboard freshness is a one-time snapshot** | `frontend/src/app/page.tsx:68-121` | The dashboard performs one job-status request on mount and has no refresh/polling or cross-tab invalidation. Another operator can change the shared rules immediately after this request, leaving “Ready to export” or “Exported for current rules” visible until reload/navigation. Server export checks still reject stale exports (`backend/main.py:818-821`), so the primary risk is misleading status rather than wrong export bytes. | Add an explicit refresh or revalidate on focus/visibility and when returning from Rules. Consider wording that status is “checked at” a timestamp. Ensure the export endpoint remains the final authority. |
| **Medium — historical export record can be lost in a migration/error path** | `frontend/src/app/results/page.tsx:94-102`; dashboard reader `frontend/src/app/page.tsx:37-45` | If `mm_export_history` exists but is malformed, export code discards it in memory and overwrites the history array with only the new record. If a valid legacy `mm_exported` record existed, it is overwritten after a successful new export and is not migrated into history. This is an edge case but conflicts with the stated preservation of historical exports. | Before replacing malformed history, migrate a valid legacy record if available; otherwise retain the raw value or explain recovery. Add a test for malformed history plus a valid legacy record. |
| **Medium — verified storage-dependent false failure in upload UI** | `frontend/src/app/page.tsx:150-161`; `frontend/src/app/upload/page.tsx:92-103` | API upload success is followed by several `sessionStorage` writes inside the same `try`. If storage throws, the catch shows upload failure although the backend created the job. On the dashboard, the success message is set before the write (`page.tsx:151-160`), so both success and error feedback may appear together. | Separate backend success from local persistence failure, preserve the returned job in component state, and offer a recovery path that does not cause duplicate uploads. Test storage exceptions. |
| **Low / security observation — export marker is client-originated** | `frontend/src/app/results/page.tsx:93-103`; `frontend/src/app/page.tsx:22-45` | “Exported for current rules” is based on a mutable client-side history entry plus a current job/rules match. The server does not maintain an export audit record, and the browser cannot confirm that the user saved the downloaded file. A same-origin script/user can alter sessionStorage. | Treat it as “download requested/generated in this tab” or label it as client history. A server audit trail is a future authenticated product feature, not a Phase 1 requirement. |

## Test adequacy

### Verified coverage

- Backend integrity tests exercise synthetic job isolation and two concurrent uploads in one process (`backend/tests/test_integrity_jobs.py:258-271`), attendance event edge cases, exports, and rule boundaries.
- Retention tests exercise the helper’s dry-run, explicit deletion, expired/unexpired directories, supplied active ID, malformed UUID directory, symlink child, and invalid root/cutoff (`backend/tests/test_job_retention.py:29-75`).
- Job-status tests exercise its Python function directly for missing/unprocessed/processed jobs, mismatched IDs, invalid IDs, and a symlinked job directory (`backend/tests/test_job_status.py:27-69`).
- Frontend API tests use mocked `fetch` responses and cover common error bodies, network/timeout/cancel behavior, upload timeout, and job/rules mismatch (`frontend/api-contract.test.mjs`). Dashboard tests cover pure helper decisions (`frontend/dashboard-status.test.mjs`).

### Gaps

- `backend/tests/test_job_status.py` calls `main.get_job_status()` directly; it does not issue an HTTP GET through FastAPI. Therefore route registration, parameter binding, response serialization, middleware/CORS, and a live 404 path are not covered by these tests.
- `frontend/dashboard-status.test.mjs` tests the helper, not the React page. It does not prove the dashboard calls the endpoint, that rejected status requests render correctly, that stale metrics are hidden in the rendered DOM, or that history survives storage exceptions.
- The HTTP status tests exercise the generic `health()` request error parser, not upload/process/status/export route-specific UI states. 401/403 are not emitted by the current backend because auth is absent.
- Timeout tests replace `window.setTimeout` with an immediate synthetic callback. They test abort handling, but do not assert the configured 30s/120s values or a real delayed response/body read. Upload UI timeout behavior and spinner recovery are not browser-tested.
- No test covers `sessionStorage` quota failure, export history growth/migration, malformed valid-shape metadata, cross-tab rule updates, concurrent rule mutation and processing, process restart, or two backend workers with divergent rules/storage.
- Retention tests pass an already-known active ID set; they do not prove live job activity detection or a shared lock. Race/symlink replacement behavior is not simulated. This is acceptable for an unwired helper but insufficient for enabling deletion.

## Multiple-user and cloud risks

The UUID directory layout provides useful isolation between independently created jobs inside one filesystem. It does not provide tenant/user isolation. Rules are global mutable process state, job IDs are not associated with an authenticated owner, and storage is a host-local temp directory. In a multi-worker deployment, both rules and job files can diverge by worker. Any integration relying on one load-balanced request to process and another to export/status can fail or observe different effective rules.

The current loopback binding and localhost CORS configuration are good restrictions for local use. They do not make the API safe behind a cloud ingress. A cloud proxy would make the endpoints reachable unless access control, owner scoping, request limits, safe persistence, and deployment policy are designed separately.

## Unresolved decisions

- Authentication, operator roles, and per-job owner/tenant model.
- Whether business rules are global per organization or scoped more narrowly; who may change them; how versions persist across workers/restarts.
- Retention period, legal deletion requirements, accountable owner, and active-job coordination for cleanup.
- Durable storage and filesystem/object-store permissions, encryption, backups, and recovery.
- HR decisions already identified in the available preparation report: late threshold semantics, default checkout behavior, and weekend overtime. The code currently describes these as unresolved; do not change without HR approval.
- Whether dashboard export history is an informational per-tab record or a formal audit requirement.

## Prioritized recommendations

### Must resolve before any cloud hosting or real employee data

1. Define authentication/authorization and owner-scoped access for jobs, rosters, results, rules, and exports. Treat the status endpoint as protected data access too.
2. Replace process-local rules and OS-temp job storage with authoritative, durable state shared by workers; version rules atomically and test worker/restart behavior.
3. Enforce bounded request bodies before reading full upload content; add concurrency/resource limits and safe failure cleanup.
4. Decide retention policy and implement it only with an owner-approved cutoff, durable storage permissions, and active-job coordination. The present utility is not ready to schedule.
5. Resolve required HR policy semantics and obtain business sign-off for resulting report classifications.
6. Extend path protections to individual job files and use race-resistant file access for any shared/persistent store.

### Should fix before accepting the application-preparation phase as complete

7. Make Results validate server job/result status before treating cached rows as available/current; add route-level and React component tests for unavailable, stale, and malformed states.
8. Make session storage failures non-fatal to completed upload/process/export operations; cap or redesign history storage and migrate a legacy export record safely.
9. Validate `mm_upload_meta` and the full shape of cached processed data before rendering; make invalid/expired session recovery explicit.
10. Revalidate dashboard freshness on focus/return and describe the last check time; preserve server-side export validation as the final guard.

### Can wait until later deployment preparation

11. Full visual regression across every route, tablet sizes, and assistive technology can be scheduled after API/storage architecture settles, provided it is completed before operator rollout.
12. A server-side export audit log can wait unless compliance requirements make it necessary; until then, label the browser-side marker as local history rather than authoritative proof that a file was saved.

## Final acceptance

**Phase 1 is not accepted as a clean “ready for next cloud phase” gate.** The report documents real improvements, but shared global rules, missing authorization/ownership, ephemeral local storage, Results-page freshness, upload memory behavior, and session-history failure cases remain material. The implementation can continue to be used only in its current constrained localhost/synthetic environment while the must-resolve items are addressed. This review does not authorize public exposure, cloud hosting, or real employee attendance processing.
