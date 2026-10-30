# MM&RJD Attendance System — Phase 2A Remediation Report

**Date:** 2026-10-30  
**Scope:** Local application correctness and reliability only. No authentication, cloud/deployment, database, external storage, device access, or real attendance data was introduced or used.

## Assessment

The requested Phase 2A application fixes are implemented and their backend/frontend automated checks pass. Results now checks server job and rules provenance before enabling exports; upload/process/export success is separated from browser storage errors; client export history is bounded and described as a browser request record; attendance and roster reads are bounded; and JSON files are opened without following a final-component symlink.

**The application is not ready for a multi-user architecture or cloud phase.** This phase does not resolve authentication/authorization, shared global in-memory rules, process-local temporary storage, upload parser request-body/disk limits, retention policy, or HR policy decisions. Browser interaction verification also did not complete reliably: Chrome fetched server-rendered HTML, but the production server logged Next.js runtime/RSC errors. This needs investigation before relying on browser behavior.

## Preservation and source review

Before editing, `git status --short`, staged diff summary, and tracked diff summary were inspected. There was already extensive modified and untracked work, including the prior preparation report and tests. The staged diff was empty. Existing work was retained; no reset, clean, revert, commit, or push occurred. The relevant prior reports were read, then the current source and tests were inspected independently.

No Hikvision/iVMS service or real employee data was accessed. Backend tests use synthetic values and temporary directories.

## Findings addressed

### Results freshness

- `frontend/src/app/results/page.tsx` now parses the saved upload and processing result structurally and calls `GET /api/jobs/{job_id}/status` before treating cached rows as current.
- `frontend/src/lib/results-freshness.ts` requires the upload job, cached result job, server job, saved result version, and current rules version to agree.
- Missing or mismatched result/job state, an unprocessed job, stale rules, malformed status data, and backend unavailability do not enable exports. Cached rows may remain visible with an explicit reference-only warning when verification is unavailable.
- Processing remains an explicit user action. Results does not process on load. Reprocessing is offered only as an explicit action for a stale result; unavailable status instructions direct the user to restore the backend and verify again.
- After a successful process request, a failure to persist to session storage or verify status does not become a false “processing failed” message. It remains non-exportable until status is confirmed.

### Session storage and exports

- `frontend/src/lib/session-state.ts` validates upload, processing, and import/export history structures before use. Malformed valid JSON no longer flows through unchecked property casts into display code.
- Dashboard and Upload now keep a successful upload response in React state before attempting session persistence. A storage exception is reported as a local persistence limitation, not as a failed API upload. The selected file is cleared after a successful upload to reduce accidental duplicate submission.
- Upload and processing storage errors are surfaced separately from API errors. Export generation/download initiation and history persistence are separate outcomes.
- Export history is limited to the latest 20 valid entries. A valid legacy `mm_exported` record is migrated into the history view if needed, including when the newer history value is malformed. Unparseable values cannot be recovered, but valid legacy data is retained.
- UI wording says “download was requested” and “Export request recorded in this tab”; it does not assert that the browser saved the file. This remains client-side informational history, not an audit trail.
- Dashboard status is rechecked at mount and when the page regains focus or visibility, with an in-flight guard and 2.5-second request cooldown. Employee/review metrics continue to be withheld unless the cached result and server provenance agree. The import metadata renderer now requires a valid shape.

### Upload size and temporary files

- `backend/main.py:read_upload_bounded` reads at most the existing limit plus one byte: 50 MiB + 1 for attendance, 10 MiB + 1 for roster. Oversized input returns 413; interrupted reads return an actionable 400. No application job is created for a too-large or interrupted attendance read.
- If attendance parsing/writing fails after a UUID job directory has been created, the newly created directory is removed. A synthetic parse-failure test verifies no directory/source remains.
- Synthetic upload tests cover the bounded read, over-limit behavior, an interrupted read, concurrent independent reads, and parse-failure cleanup. The existing job isolation/concurrent upload tests also pass.

These bounds limit bytes copied into the handler’s `content` buffer. FastAPI/Starlette multipart parsing may already spool a request body to memory or temporary disk before the endpoint runs, and multiple near-limit requests can still multiply memory, parser, and temporary-disk use. No ingress/request-body cap or streaming parser was added, so this is not a complete denial-of-service/resource-control solution.

### Job JSON file access

- `backend/main.py:read_job_json` opens `upload.json`, `processed.json`, and `roster.json` using `O_NOFOLLOW` where supported and verifies the opened descriptor is a regular file. Status, processing, roster loading, and exports use this helper.
- Tests verify that symlinked upload, processed, and roster JSON files are rejected.

This rejects leaf-file symlinks on the current local Linux environment. The helper still uses path-based resolution after `job_directory` validation; a process with write access could race parent-directory replacement between validation and open. The change does not claim race-free filesystem isolation. Restrictive storage permissions and a descriptor-relative storage design remain necessary before shared/persistent storage.

## Exact files changed in this phase

- `backend/main.py`
- `backend/tests/test_integrity_jobs.py` (synthetic upload double now supports bounded reads and async close)
- `backend/tests/test_job_status.py`
- `backend/tests/test_upload_bounds.py` (new)
- `frontend/package.json`
- `frontend/src/app/page.tsx`
- `frontend/src/app/results/page.tsx`
- `frontend/src/app/upload/page.tsx`
- `frontend/src/lib/dashboard-status.ts`
- `frontend/src/lib/results-freshness.ts` (new)
- `frontend/src/lib/session-state.ts` (new)
- `frontend/dashboard-status.test.mjs`
- `frontend/session-state.test.mjs` (new)
- `PHASE_2A_REMEDIATION_REPORT.md` (new)

No backend rule semantics, API contracts, authentication, retention policy, or deployment settings were changed.

## Verification results

Commands were run after the implementation. Working directories are shown.

| Command/check | Result |
|---|---|
| `python3 -m unittest discover -s tests -v` (`backend/`) | **Pass:** 28 tests. Includes attendance integrity, job isolation, status, retention, symlinked JSON, bounded/oversized/interrupted/concurrent reads, and parse cleanup. |
| `python3 -m compileall -q main.py job_retention.py tests` (`backend/`) | **Pass:** exit 0. |
| `npm test` (`frontend/`) | **Pass:** 31 tests (18 API contract, 10 dashboard status, 3 session/results freshness). |
| `npm run lint` (`frontend/`) | **Pass:** no ESLint warnings or errors. Node emitted the existing `[DEP0169] url.parse()` deprecation warning. |
| `./node_modules/.bin/tsc --noEmit --incremental false` (`frontend/`) | **Pass:** exit 0, no diagnostics. |
| `npm run build` (`frontend/`) | **Pass:** production compilation and prerender of `/`, `/upload`, `/results`, `/rules`, and `/_not-found`. The Node deprecation warning appeared. |
| `git diff --check` (project root) | **Pass:** no whitespace errors. |
| Browser smoke check (production frontend at `127.0.0.1:3400`, headless Chrome) | **Not passed / incomplete.** Chrome fetched the Results server-rendered shell. The `next start` process logged Next.js runtime/RSC errors (`TypeError: e[o] is not a function`; one attempt also logged `Cannot find module './chunks/vendor-chunks/next.js'`). Client-side hydration, empty-state recovery, interaction, responsive layout, upload, and export behavior therefore were not verified in the browser. The server was stopped after the check. |

No mounted React component test harness is configured; the new Results freshness tests exercise the pure decision helper, not the rendered React DOM. No browser automation dependency was added.

## Remaining defects and security limitations

1. **Browser runtime/RSC error:** Production build succeeds, but a headless browser request triggered Next.js runtime/RSC errors in `next start`. The cause was not established here. Reproduce and resolve this before relying on browser workflows; do not infer successful hydration from the successful static build.
2. **Upload resource limits are incomplete:** The endpoint’s buffer read is bounded, but the multipart parser may spool larger bodies before endpoint logic and concurrent requests can still consume substantial resources. Add a request-body limit at the ASGI/proxy layer and assess concurrency/parser limits before any network exposure.
3. **Filesystem race limitation:** Leaf symlinks are rejected, but parent directory replacement races are not eliminated. The current host temp directory is not an isolated storage service.
4. **Session state is tab-local and non-durable:** If browser storage fails, a returned job can remain in current page component state, but navigation/reload may lose the selected-job reference. The server job remains on local temp storage with no user/owner boundary.
5. **Export history is not authoritative:** A tab-local record means the export endpoint response was received and a browser download was requested; it cannot prove a file was saved or retained.
6. **No authentication/authorization or job ownership:** UUIDs and localhost CORS are not access control. Do not expose the API to LAN/internet.
7. **Rules and storage are process/host local:** `BUSINESS_RULES` is mutable module state and jobs reside under OS temp storage. Multiple workers/instances can disagree or fail to see each other’s data; restarts and temp cleanup can remove jobs.
8. **Retention and HR decisions remain unresolved:** No deletion duration/owner or policy for late thresholds, scheduled checkout, and weekend overtime was invented or enabled.
9. **Some failures remain untested at the UI layer:** Session-storage quota/security errors, real delayed upload responses, malformed successful browser responses, keyboard/mobile behavior, and cross-tab rules changes have helper/API or no coverage, not browser interaction coverage.

## Readiness for the next phase

**Not ready for the multi-user architecture phase as an accepted application gate.** The focused correctness changes and automated tests are complete, but browser runtime behavior needs diagnosis and upload request limits remain incomplete. The next phase must begin by resolving the production server RSC error and deciding the authentication/ownership, shared rules/version, durable storage, retention, and resource-control architecture. Continue only with synthetic localhost testing until those issues are resolved. This report does not approve cloud hosting or real employee data processing.
