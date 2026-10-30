# MM&RJD Attendance System — Phase 2C Browser Verification Report

**Date:** 2026-10-30  
**Scope:** End-to-end browser checks with synthetic records on loopback only. No Hikvision/iVMS endpoint or real employee record was accessed. No deployment, commit, or dependency installation occurred.

## 1. Executive summary

The production frontend was exercised in headless Chrome against an isolated copy of the backend and a fresh temporary job store. Core browser flows passed: dashboard hydration, client-side and direct route navigation, attendance and roster upload, explicit processing of the selected job, server freshness checks, stale-result/export blocking after a rules change, rules restoration and reprocessing, and actual Excel/PDF downloads with synthetic content checks. Missing-job and unavailable-status recovery were also exercised. There were no browser JavaScript console errors during the complete run.

The browser test exposed a duplicate employee-day defect when a roster date overlapped an attendance event date. The duplicate was reproduced, fixed narrowly, and covered by a regression test; the rerun produced exactly one employee-day. The 390×844 run found no horizontal page overflow and confirmed the Results table wrapper, but the upload-control assertion searched for the pre-upload label after the page had changed it to “Upload another file”; that assertion is inconclusive rather than evidence that the control is missing. Mobile upload control verification therefore remains incomplete. Oversized upload, interrupted upload, keyboard-only operation, and all page layouts at both requested viewports were not comprehensively tested.

**Verdict: PARTIAL PASS.** Core synthetic attendance workflows work in the tested local production build. The incomplete mobile assertion and untested edge workflows prevent a full PASS. This does not establish production readiness.

## 2. Initial worktree and preservation

The initial `git status --short` was dirty, with existing modifications and untracked reports, frontend files, backend tests, and other artifacts. No reset, clean, revert, commit, or push was performed. Existing project files and build artifacts were preserved.

During the test, the only project-source edits were the duplicate-row correction in `backend/main.py` and its regression test in `backend/tests/test_integrity_jobs.py`. Both files were already part of the user's existing changed/untracked work. A final `git diff --check` completed with exit 0. The final status remains dirty; all existing changes remain present.

## 3. Environment, services, and browser tooling

- Node.js `v22.13.0`; npm `10.9.2`; Google Chrome `155.0.8059.84`.
- Next.js `14.2.35`, React `18.3.1` (from the existing frontend lockfile).
- No Playwright, Selenium, ChromeDriver, or other existing browser test framework was available. No dependency was installed. Browser interaction used a temporary Node 22 script and Chrome DevTools Protocol (CDP), stored under `/tmp`.
- Existing ports 3000 and 8000 were occupied by processes whose ownership was not established. They were not stopped or used. The supported `start.sh` would use those ports, so the test ran isolated copies instead.
- Frontend source was copied to `/tmp/mm-phase2c-frontend`; a production build was made there with `NEXT_PUBLIC_API_BASE=http://127.0.0.1:45679` and served at `127.0.0.1:3400`.
- Backend source was copied to `/tmp/mm-phase2c-backend`; only the temporary copy's CORS allowlist was adjusted for port 3400. It ran at `127.0.0.1:45679` with `TMPDIR=/tmp/mm-phase2c-isolated2`. The project backend CORS and startup configuration were not changed.
- Browser downloads, profile, screenshots, and synthetic input files were held under `/tmp/mm-phase2c-run6/`. The temporary production frontend/backend processes were stopped after the run. No unrelated process was terminated.

The previous Phase 2B report's production build/runtime result was consistent with this run: the copied production server started successfully and served hydrated routes without RSC/runtime errors.

## 4. Synthetic test data

Attendance CSV:

```csv
Employee ID,Employee Name,Event Type,Date,Timestamp
SYN-100,Synthetic Worker,IN,2026-10-28,2026-10-28 08:00:00
SYN-100,Synthetic Worker,OUT,2026-10-28,2026-10-28 17:00:00
```

Roster CSV, using the format accepted by the existing parser:

```csv
Employee ID,Employee Name,Dates
SYN-100,Synthetic Worker,2026-10-28
```

Also used an empty synthetic CSV and an unsupported `.txt` file. No real names, records, or uploads were used.

## 5. Detailed browser results

Browser: headless Google Chrome 155.0.8059.84, production build, default desktop viewport for the main workflow. The responsive run used 390×844. CDP tracked runtime exceptions, console errors, network failures, and HTTP responses.

| Test | Steps / expected result | Actual result | Status |
|---|---|---|---|
| A. Startup/dashboard | Open `/`; expect hydrated dashboard and backend health indicator | Dashboard rendered and showed “System connected”; no runtime/console errors | **PASS** |
| B. Client navigation | Pointer-click sidebar Upload from dashboard | Navigated to `/upload` without blank screen or client runtime error | **PASS** |
| B. Direct route access | Navigate directly to `/rules`, `/results`, and `/upload` during run | All rendered; direct `/results` showed empty recovery before upload | **PASS** |
| C. Unsupported type | Select synthetic `.txt` | UI rejected it as unsupported before request | **PASS** |
| C/I. Empty CSV | Select and upload zero-byte CSV | Backend returned HTTP 400 with “Empty CSV file”; visible error appeared and upload loading cleared | **PASS** |
| C. Attendance upload | Select synthetic CSV and upload | Import completed; job ID `ca68f374-a81e-4f59-9cba-34f4efd73e2b`; upload spinner cleared | **PASS** |
| D. Roster upload | Upload synthetic roster for selected job | UI reported one employee loaded; processing used that job’s roster | **PASS** |
| E. Explicit processing | Click Process attendance | Processing was user-triggered; selected job ID matched; after fix the UI reported one employee-day | **PASS** |
| F. Results/provenance | Open Results; expect synthetic record and matching job/rules versions | `SYN-100` / `Synthetic Worker` appeared once; job and rules metadata matched; export became enabled only after server confirmation | **PASS** |
| G. Effective rules freshness | Increase effective overtime threshold from 19:30 to 20:30 and save | Rules version changed; Results displayed “This result is stale”; Excel export was disabled | **PASS** |
| G. Restore and reprocess | Restore 19:30, save, explicitly reprocess | Original rule restored; server status confirmed selected job; export re-enabled | **PASS** |
| H. Excel download | Click Download Excel and inspect downloaded workbook | Browser produced `attendance_report.xlsx` (6032 bytes); `openpyxl` opened it and found `SYN-100` and `Synthetic Worker` | **PASS** |
| H. PDF download | Click Download PDF and inspect downloaded file | Browser produced `attendance_report.pdf` (3906 bytes); `pdftotext` extracted `Synthetic Worker` | **PASS** |
| I. Missing job | Replace selected job ID with a synthetic nonexistent UUID and click explicit processing | HTTP 404/not-found UI error appeared; process action was re-enabled; no false success | **PASS** |
| I. Unavailable status | Intercept status API request to simulate network failure | Cached rows were labeled reference-only, “Current status could not be verified” appeared, exports remained disabled | **PASS** |
| J. Mobile Results 390×844 | Render Results and inspect page width/table | Screenshot showed usable stacked layout; page width did not exceed viewport; table has horizontal-scroll wrapper | **PASS** for checked criteria |
| J. Mobile Upload 390×844 | Inspect upload controls and page overflow | No horizontal overflow; harness searched for “Upload attendance file,” but after a completed upload the control label is “Upload another file.” Its exact-label assertion was false, so the intended control check was inconclusive. | **BLOCKED / harness mismatch** |

Screenshots are in `/tmp/mm-phase2c-run6/evidence/`: `dashboard-desktop.png`, `results-empty.png`, `upload-success.png`, `results-synthetic-desktop.png`, `results-exports.png`, and `mobile-results.png`. Browser downloads are in `/tmp/mm-phase2c-run6/downloads/`.

The rules change was temporary in-memory state in the disposable backend and was restored before export testing. The test backend used a fresh temporary store; no project test data or existing server storage was overwritten.

## 6. Defect discovered and source changes

The first full browser workflow showed two rows for the same employee/date after processing the synthetic attendance plus a roster containing that same date. The source appended a roster no-event row even though an attendance event already existed for that `(employee_id, date)`.

- `backend/main.py:442-462`: the no-event row append is now inside the `if (emp_id, date_str) not in event_keys` branch. A matching roster date no longer creates a duplicate; a roster date without events still creates a flagged `no_events` row.
- `backend/tests/test_integrity_jobs.py:109-118`: added `test_roster_date_matching_attendance_does_not_duplicate_employee_day`, using synthetic events and asserting exactly one complete day.

After the fix, the browser reported one employee-day and the exported workbook/PDF contained the expected synthetic employee. No frontend code or business rules were changed.

## 7. Browser console, network, and backend findings

- **Browser runtime/console:** zero captured JavaScript exceptions and zero console errors in the successful run. All four requested routes were reached; production server emitted no observed RSC/runtime failure during the run.
- **Expected HTTP errors:** `POST /api/upload` returned 400 for the intentionally empty CSV. `POST /api/process` returned 404 for the intentionally missing synthetic job. A 404 for `/favicon.ico` was observed; it did not prevent rendering or interaction.
- **Simulated network failure:** status request interception produced one `net::ERR_FAILED`, intentionally used to verify that cached records remain reference-only and exports stay disabled.
- **Backend behavior:** successful attendance/roster upload, processing, rules GET/POST, job status, and exports were exercised through browser requests against the copied local backend. No raw backend stack trace was captured. Backend unit tests passed after the duplicate-row fix.
- No broad server-log archival was retained; HTTP outcomes above come from browser network instrumentation and the response/UI behavior.

## 8. Automated checks

Run from `/home/martin/Documents/MM/backend` after the fix:

| Command | Result |
|---|---|
| `python3 -m unittest discover -s tests -v` | **PASS:** 29 tests, including the new overlapping roster/attendance regression test |
| `python3 -m compileall -q main.py job_retention.py tests` | **PASS:** exit 0 |

Run from project root:

| Command | Result |
|---|---|
| `git diff --check` | **PASS:** exit 0, no whitespace errors |
| `npm test`, frontend lint, standalone TypeScript, project-root production build | **Not rerun in Phase 2C.** Frontend source was not changed; the isolated frontend production build (below) completed successfully. Phase 2A report records prior frontend checks, but those are not presented as Phase 2C reruns. |
| `NEXT_PUBLIC_API_BASE=http://127.0.0.1:45679 npm run build` (isolated frontend copy) | **PASS:** Next.js production build compiled, linted/type-checked, prerendered `/`, `/upload`, `/results`, `/rules`; only the existing Node `[DEP0169] url.parse()` deprecation warning appeared |
| `npm run start -- --hostname 127.0.0.1 --port 3400` (isolated frontend copy) | **PASS:** Next.js production server reported ready on loopback |

No browser automation dependency was added.

## 9. Limitations and remaining defects

- The mobile upload input/button check must be rerun with an assertion that accepts the post-upload “Upload another file” state. Mobile Results showed no page overflow, but this does not replace full mobile interaction testing.
- The suite did not test 50 MiB + 1 attendance input in a browser, roster size limit, interrupted upload, malformed successful API response, keyboard-only navigation, a real delayed network response, or refresh during upload/process. Backend synthetic unit tests cover bounded/interrupted reads, but not those browser workflows.
- Desktop screenshots were captured for dashboard, upload, empty/results, and exports; a systematic 1366×768 browser pass across every route was not conducted.
- Browser checks used an isolated copy, and the temporary backend copy's CORS allowlist was adjusted only to permit the test frontend's port. This establishes local workflow behavior, not behavior under the project's standard ports or a deployed environment.
- The export check verifies that downloads were produced and the workbook/PDF content includes the synthetic employee; it does not validate every report field or visual page layout.

## 10. Security, privacy, and multi-user boundary

No real data left the local test environment. This phase does not address previously identified blockers: no authentication/authorization or job ownership; process-global, in-memory rules; temporary host-local job storage without approved retention; upload/parser aggregate resource limits; and no multi-worker consistency or durable storage. The system must remain localhost/synthetic-only pending those architecture decisions. Passing this browser phase is not production approval.

## 11. Recommended next phase

1. Correct the mobile upload assertion and run a full desktop/mobile route and keyboard interaction pass.
2. Add a durable browser-level regression harness only if the project approves a lightweight dependency/tooling approach; until then, retain reproducible synthetic CDP evidence outside project dependencies.
3. Before multi-user architecture work, define authentication and per-job ownership, authoritative shared rules/version state, durable storage and approved retention, and upload request/resource limits. Keep unresolved HR attendance policies explicit.
4. Use synthetic contract and isolation tests while designing those changes; do not expose the service or use real attendance data.

## Verdict

**PARTIAL PASS.** The main browser workflows, stale-result safety, actual file downloads, and a discovered duplicate-row correction were verified with synthetic data. The mobile upload check and several edge/browser accessibility workflows remain incomplete. This result establishes neither multi-user readiness nor production readiness.
