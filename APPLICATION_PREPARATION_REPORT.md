# MM&RJD Attendance System — Phase 1 Application Preparation Report

**Date:** 2026-10-30
**Scope:** Application-level correctness and reliability preparation only. No cloud architecture or authentication system was introduced. No real attendance data or Hikvision/iVMS service was accessed.

## Assessment

**Phase 1 application preparation is complete for the requested scope, with limitations.** The dashboard now checks server-side job/result provenance and current rules before presenting current readiness; historical exports remain visible separately. API and backend status checks received synthetic regression coverage. The job-directory helper now rejects symlink escapes. A retention utility is available only as an explicit dry-run-by-default helper and is not connected to the application because no owner-approved retention policy or lifecycle lock exists.

This does **not** mean the application is secure or ready for cloud deployment. Authentication/authorization, retention ownership/duration, HR policy decisions, and a future secure hosting architecture remain unresolved and must be handled before any cloud deployment or real employee data.

## Preservation and source review

Before editing, `git status --short`, staged diff summary, and tracked diff summary were inspected. The worktree already included modifications to `README.md`, `backend/main.py`, frontend configuration/UI files, and numerous untracked reports, tests, assets, components, and files. Those changes were preserved; no reset, clean, revert, commit, or push was performed. `VERIFICATION_REPORT.md`, `REMEDIATION_REPORT.md`, and `frontend/FRONTEND_AUDIT_REPORT.md` were read as history, then current code and tests were inspected independently.

Current routes reviewed: `/`, `/upload`, `/results`, `/rules`. Current API/job contracts reviewed in `frontend/src/lib/api.ts` and `backend/main.py`, with tests in `frontend/api-contract.test.mjs` and `backend/tests/`.

## Findings and changes

### Dashboard freshness

Previously, the dashboard treated a cached processed response as ready and a cached `mm_exported` value as current without checking the selected job or current backend rules. Upload/reprocessing also removed the export marker. A cached job could also outlive its server-side job directory.

Changes:

- Added a read-only `GET /api/jobs/{job_id}/status` endpoint. It confirms that the job and upload exist, whether a saved result exists, the saved result’s job ID/rules version, and the current effective rules version. It does not process attendance.
- `frontend/src/lib/api.ts` validates status response shape and the requested job ID.
- `frontend/src/app/page.tsx` uses the server status endpoint before presenting “Ready to export” or “Exported for current rules.” Missing/invalid session metadata, unavailable server state, unavailable jobs, stale session results, and changed rules display unknown/stale states; derived employee/review metrics are withheld unless provenance agrees.
- Added `frontend/src/lib/dashboard-status.ts` for deterministic status decisions. Existing `mm_exported` data is retained as history; new export entries in `mm_export_history` include job ID and rules version. The dashboard distinguishes this historical entry from current readiness.
- A missing server job returns 404; dashboard status falls back to unknown while preserving available export history. A job on the server without a saved processed result cannot validate stale cached processed data.

Regression tests cover rules changed after processing, rules changed after export, missing job metadata, missing rules-version metadata, malformed/missing saved session JSON, mismatched session job, server job unavailable, server/session result-version mismatch, a current processed/exported result, current data awaiting export, and no result.

### API reliability and user feedback

The API wrapper already used request aborts/timeouts and page handlers already used `finally` for loading states. Coverage was incomplete. Tests now cover HTTP 400, 401, 403, 409, 422, and 500 detail responses; invalid JSON; incomplete success bodies; malformed export content; wrong process job ID; wrong export job/rules version; network failure; request timeout; caller cancellation; and upload timeout. They use deterministic synthetic `fetch` responses; no extra dependency was installed.

Headless Chrome was available. With a synthetic job ID and backend intentionally unavailable on loopback, `/results` rendered: “Could not reach the backend. Check that the local API is running and try again.” The process button was enabled again after the request and no success message appeared. A separate synthetic HTTP 400 UI path is recorded in the preceding verification history; API tests cover all requested status codes. Browser failure UI was checked for the process action; upload failure loading behavior was not independently browser-driven in this phase.

### Attendance integrity and storage path checks

The current unknown-event, missing/ambiguous punch, no-event, explicit job processing, per-job roster, stale-rules, and export provenance safeguards were preserved. No attendance-rule semantics were changed. The API status endpoint checks the same job-specific saved result and effective rules version used by exports.

Inspection found `job_directory()` previously constructed a UUID child under `TEMP_DIR` but followed a pre-existing symlink child. It now rejects a symlink storage root and symlink/out-of-root job directories before the application accesses them. A synthetic backend test covers this path escape case.

### Temporary storage and retention

Current uploads live under `tempfile.gettempdir() / "mm_attendance"`, with one UUID child per job. Successful job source files, parsed uploads, roster JSON, and processed JSON have no automatic expiry or deletion path. Parse failures may remove the just-written source file. This means employee data can persist in the host temporary directory indefinitely; OS-level temporary-directory behavior is not an application retention policy.

Added `backend/job_retention.py` as an opt-in helper. It requires an explicit timezone-aware cutoff and an active-job ID collection; `dry_run=True` is the default. It considers canonical UUID direct-child directories only, rejects a symlink root, skips symlink/out-of-root/malformed/fresh/active paths, rechecks containment, and refuses destructive recursive deletion when the platform does not provide symlink-safe `rmtree`. Synthetic tests cover expired, unexpired, active, malformed, out-of-root symlink, dry-run, explicit deletion, and invalid-root/cutoff behavior.

The helper is not imported by application startup or request handlers. No retention duration, legal deletion requirement, or responsible owner was supplied, so no automatic or scheduled deletion is enabled. Before any destructive integration, the owner must decide the policy and provide active-job coordination under a lock shared with job creation and processing. The helper cannot itself establish which jobs are actively being written.

## Exact files changed

- `frontend/src/app/page.tsx`
- `frontend/src/app/results/page.tsx`
- `frontend/src/app/upload/page.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/dashboard-status.ts` (new)
- `frontend/api-contract.test.mjs`
- `frontend/dashboard-status.test.mjs` (new)
- `frontend/package.json`
- `backend/main.py`
- `backend/job_retention.py` (new)
- `backend/tests/test_job_retention.py` (new)
- `backend/tests/test_job_status.py` (new)
- `APPLICATION_PREPARATION_REPORT.md` (new)

The prior verification reports and unrelated worktree files were not edited by this phase.

## Verification results

Commands were run after the application changes. Working directories are shown in parentheses.

| Command | Outcome |
|---|---|
| `git status --short` (project root, before edits) | **Completed.** Existing modified/untracked work was present and preserved. |
| `python3 -m unittest discover -s tests -v` (`backend/`) | **Pass:** 23 tests, including six job-status/path-safety tests and four retention tests. |
| `python3 -m compileall -q main.py job_retention.py tests` (`backend/`) | **Pass:** exit 0. |
| `npm test` (`frontend/`) | **Pass:** 18 API contract/failure tests and 10 dashboard-status/session tests. |
| `npm run lint` (`frontend/`) | **Pass:** no ESLint warnings/errors. The Node toolchain emitted `[DEP0169] url.parse()` deprecation warnings. |
| `./node_modules/.bin/tsc --noEmit --incremental false` (`frontend/`) | **Pass:** exit 0, no diagnostics. |
| `npm run build` (`frontend/`) | **Pass:** production build; `/`, `/upload`, `/results`, `/rules` prerendered. Node emitted the same deprecation warning. |
| `git diff --check` (project root) | **Pass:** exit 0. An additional whitespace scan of the report and changed/new source/test files found no trailing whitespace. |
| Browser failure check (headless Chrome, loopback frontend; backend unavailable by design) | **Pass for visible process error/loading behavior:** actionable network error shown, process button re-enabled, no success UI. No broad visual, keyboard, or upload-failure browser suite was run. |

The first parallel TypeScript/build attempt failed because both commands touched Next.js generated `.next` route types; the follow-up standalone type check also found `unknown` property accesses in the new session parser. The session data was given guarded structural types. Serial final runs of `tsc` and `npm run build` both passed. The report records final results above; these initial failures were corrected rather than suppressed.

## Remaining defects, decisions, and security limitations

- No authentication or authorization is implemented. The status endpoint, like the other API endpoints, is not an access-control boundary.
- Backend binding remains local-only in `start.sh` (`127.0.0.1`) and configured CORS origins remain localhost-only. Keep this unchanged until a reviewed deployment architecture exists.
- Temporary job storage has no configured retention period or integrated cleanup. The opt-in utility is not a production retention system and requires lifecycle locking/owner policy.
- Attendance rows are still cached in `sessionStorage`; same-origin scripts can access them. The dashboard now checks server job/result provenance, but session storage is not a secure storage boundary.
- Late-arrival threshold, scheduled checkout, and weekend overtime policy remain unresolved HR/product decisions. No business rule was invented or changed.
- API 401/403 handling is tested generically, but no authentication behavior exists to exercise those responses against the real backend.
- Browser verification focused on an actual process network failure and the resulting UI state. Full route-by-route visual/accessibility, browser upload timeout, and browser malformed-200 testing remain untested.

## Phase 1 completion

**Complete for application-level preparation in this phase, with known blockers before cloud deployment.** Current dashboard freshness is based on an explicit server job-status check and matching job/rules provenance; historical exports are retained; API/backend regression coverage was expanded; path containment was tightened; checks and one browser failure workflow passed. This report does not approve cloud deployment or real employee data processing. Authentication, deployment architecture, HR policy decisions, and approved retention/cleanup requirements remain future prerequisites.
