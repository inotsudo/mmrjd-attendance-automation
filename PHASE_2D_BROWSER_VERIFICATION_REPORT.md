# MM&RJD Attendance System — Phase 2D Browser Verification Report

**Date:** 2026-10-30  
**Scope:** Follow-up synthetic-data browser checks on isolated loopback copies. No real employee data, Hikvision/iVMS, public endpoint, deployment, dependency installation, commit, or push was used.

## Verdict: PARTIAL PASS

The outstanding mobile upload label issue is resolved by exercising both actual state-dependent labels. All four existing routes rendered at 1366×768 and 390×844 without horizontal page overflow. Keyboard focus visibility, Tab traversal, Enter link activation, and Space upload activation were checked. Unsupported, empty, over-limit, and invalid synthetic files were tested. The valid upload path worked on mobile.

The invalid CSV test exposed a correctness defect: arbitrary two-column CSV content can be accepted as a successful attendance import, with the parser reporting a phantom event. This was not fixed because changing the parser’s acceptance rules would affect data interpretation and is beyond safe verification-only remediation without agreed import requirements. Browser runs also did not complete the latter refresh, processing failure, rules freshness, and detailed export checks in this phase. Existing Phase 2C evidence for rules freshness and basic file downloads remains in its separate report, but does not satisfy Phase 2D’s deeper export review.

## 1. Initial and final worktree state

Initial `git status --short` showed a dirty worktree containing the same prior modified and untracked files recorded in Phase 2C. Existing changes were preserved. The Phase 2C duplicate-row fix remains in `backend/main.py:442-462`, and its regression remains in `backend/tests/test_integrity_jobs.py:109-118`.

No project source or configuration was changed during Phase 2D. The only new project file is this report. Temporary copies, synthetic inputs, Chrome profiles, screenshots, and downloads were kept under `/tmp/mm-phase2d-1435-*`. Final worktree remains dirty with pre-existing changes plus this report; no destructive Git operation was run.

## 2. Test environment

- Google Chrome 155.0.8059.84, headless, using Chrome DevTools Protocol from a temporary Node script; no browser automation dependency installed.
- Node.js v22.13.0; npm 10.9.2; project frontend Next.js 14.2.35 / React 18.3.1.
- The frontend and backend were copied to `/tmp`; frontend production build served on `127.0.0.1:3412`, copied backend on `127.0.0.1:45692`, with a fresh `TMPDIR` job store. The temporary backend copy alone had its CORS origin adjusted for the test frontend port. Project configuration was untouched.
- Chrome evidence directory: `/tmp/mm-phase2d-1435-run7-evidence/screenshots/`. The over-limit synthetic file was exactly 50 MiB + 1 byte and was created only in `/tmp`; no project test file was overwritten.

## 3. Responsive route verification

Each route was directly navigated at desktop 1366×768 and mobile 390×844. Main headings and primary controls rendered, no visible primary controls extended past the horizontal viewport, and no page had horizontal overflow. These were layout/render checks, not a complete visual or accessibility audit.

| Route | Desktop | Mobile | Notes |
|---|---|---|---|
| `/` | **PASS** | **PASS** | Dashboard heading and controls rendered; scroll width did not exceed viewport. |
| `/upload` | **PASS** | **PASS** | Upload heading and controls rendered; no page overflow. Detailed mobile control interaction below. |
| `/results` | **PASS** (empty state) | **PASS** (empty state) | Empty state rendered; this Phase 2D responsive pass had no populated table yet. Phase 2C has a mobile populated Results screenshot/table wrapper check. |
| `/rules` | **PASS** | **PASS** | Rules heading and four form controls rendered; no page overflow. |

Screenshots for the responsive route checks are `desktop-dashboard.png`, `desktop-upload.png`, `desktop-results.png`, `desktop-rules.png`, `mobile-dashboard.png`, `mobile-upload.png`, `mobile-results.png`, and `mobile-rules.png` in the evidence directory.

## 4. Mobile upload verification at 390×844

| Test | Steps and expected result | Actual result | Status |
|---|---|---|---|
| Before upload controls | Open `/upload`, inspect file input and button | Labeled file input exists (`aria-label="Choose attendance export"`); initial button says “Upload attendance file” and is correctly disabled until a file is selected. No horizontal overflow. | **PASS** |
| File input/selection | Set a synthetic file through Chrome’s native file-input protocol | File name and size appeared in the upload panel and enabled the upload action. | **PASS** |
| Unsupported type | Select synthetic `.txt` | Inline validation says supported formats are CSV, Excel, or PDF. No request required. | **PASS** |
| Empty CSV | Select and upload zero-byte file | Backend returned HTTP 400 “Empty CSV file”; error became visible and loading cleared. | **PASS** |
| Oversized file | Select a synthetic 50 MiB + 1 byte CSV | Client rejected it with “This file is larger than the 50 MB upload limit.” It was not uploaded. | **PASS** |
| Valid upload, initial label | Select and upload synthetic attendance CSV; activate using Space | Upload completed, job ID was stored, success message appeared, and upload button changed to “Upload another file.” | **PASS** |
| Valid upload, subsequent state | Select a distinct synthetic copy; inspect enabled button and upload again | Actual button label was “Upload attendance file” after a new file was selected, it was enabled, and second upload succeeded. This resolves the earlier stale-label assertion issue. | **PASS** |
| Invalid CSV | Upload a two-column synthetic file containing `nonsense,not an attendance export` / `alpha,beta` | UI reported “Import complete” and parser claimed 1 attendance event. No actual attendance schema was present. | **FAIL — application defect** |
| Interrupted upload | Intercept synthetic upload request and fail it | Network instrumentation recorded `net::ERR_FAILED`; UI showed “Could not reach the backend. Check that the local API is running and try again.” Loading button was no longer present. The harness’s role-alert selector did not match within its wait window, so accessible announcement behavior was not established. | **PARTIAL** |

Mobile upload screenshots include `mobile-upload.png`, `mobile-upload-invalid.png`, `mobile-upload-empty.png`, `mobile-upload-overlimit.png`, `mobile-upload-success-before-processing.png`, `mobile-upload-success-after.png`, and `mobile-upload-interrupted.png` under the evidence directory.

## 5. Keyboard checks

- Tab traversal on `/upload` observed brand link, navigation links, attendance file input, Choose file button, and roster file input. Focused controls showed a 3px purple outline in computed styles. Repeated Tab eventually returned to the first link; no keyboard trap was observed in the sampled sequence.
- The visually clipped attendance file input remains in the Tab order and has `aria-label="Choose attendance export"`. Chrome reports it as visible by its rectangle because its visually-hidden CSS uses a 1px clipped box; this is not proof it is visually apparent to a sighted keyboard user. A native file-picker dialog was not opened in headless mode.
- Enter activation on the Dashboard link navigated to `/` successfully. Space activation on the enabled upload button initiated and completed upload. Disabled pre-selection upload correctly did not activate.
- These basic browser checks are not a WCAG conformance assessment. The roster upload control and every interactive control on Results/Rules were not exhaustively keyboard tested.

## 6. Processing, refresh, recovery, freshness, and exports

| Requested check | Result | Evidence/limitation |
|---|---|---|
| Refresh after upload | **Not completed in Phase 2D** | Harness run stopped during later interrupted-upload assertion. Phase 2C exercised upload/session handoff but not the full Phase 2D refresh sequence. |
| Refresh after processing | **Not completed in Phase 2D** | Not reached in final run. |
| Missing/unavailable job recovery | **Not completed in Phase 2D** | Phase 2C browser evidence includes synthetic missing job (404 UI recovery) and status-network failure (reference-only cached rows; exports disabled). No fresh Phase 2D rerun. |
| Processing error feedback | **Not completed in Phase 2D** | Planned request interception was after the point where the test harness stopped. |
| Rules change invalidates Results | **Not completed in Phase 2D** | Phase 2C ran an effective overtime threshold change, observed stale warning and disabled export, restored the original value, and reprocessed. No Phase 2D rerun. |
| Excel/PDF full inspection | **Not completed in Phase 2D** | Phase 2C verified actual downloads, workbook opening with `openpyxl` and synthetic ID/name, and PDF text extraction for synthetic name. This phase did not inspect dates, timestamps, headings, metadata, duplicate count, blank rows, or PDF layout in detail. |

## 7. Defect and remaining risk

**Verified defect — permissive CSV schema detection.** `backend/main.py:197-230` falls back to column positions when header names do not identify attendance fields. `backend/main.py:719-770` then emits an event for each row even when date, event type, and timestamp fields are absent/invalid. The browser test’s unrelated two-column CSV returned HTTP success with `events_found: 1` and an “Import complete” UI. This can mislead an operator into believing an unsupported/malformed source was imported. No source change was made; acceptable header/row requirements must be agreed before tightening parser behavior, and the change should receive synthetic regression tests.

No unexpected browser JavaScript console errors were captured. Network errors were the expected empty-file HTTP 400, an expected favicon 404, and the intentionally injected upload network failure. The copied backend served successful synthetic operations; the interrupted upload was intentionally failed at the browser network layer. No non-loopback requests were made.

## 8. Source changes

None in Phase 2D. The pre-existing duplicate employee-day fix remains present and was not altered. No dependency was added.

## 9. Remaining limitations and recommendations

1. Resolve the CSV acceptance contract and reject malformed/unrelated headers safely; add tests proving no fabricated “events found” success.
2. Rerun refresh-after-upload/process, explicit processing error recovery, missing/unavailable job, rules-stale export blocking, and restoration flows in the browser after resolving the current import defect or isolating it from subsequent tests.
3. Perform detailed Excel/PDF inspection for exact headers, metadata, date/time values, duplicate count, no extra blank/fabricated rows, and PDF page readability/layout.
4. Verify mobile native file picker with a non-headless browser when available, and complete keyboard testing for roster, Results, and Rules controls. Do not infer WCAG compliance from the sampled checks.
5. Keep the application synthetic/local-only. Existing blockers remain: no authentication or job ownership, process-local global rules, temporary storage and unresolved retention, and incomplete aggregate upload resource limits.

**Final verdict: PARTIAL PASS.** Required responsive route renders and core mobile upload states were tested. A malformed CSV is falsely accepted as a successful import, and later refresh/processing/export-detail checks were not completed in this phase. This is not production readiness.
