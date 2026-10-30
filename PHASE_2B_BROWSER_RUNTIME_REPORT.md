# MM&RJD Attendance System — Phase 2B Browser Runtime Report

**Date:** 2026-10-30  
**Scope:** Diagnose and verify the Next.js production runtime locally. No application source, dependency, or configuration changes were made. No backend, real attendance data, or Hikvision/iVMS service was used.

## Summary and root cause

The reported errors were reproducible with the existing project build output. With the existing `frontend/.next`, `next start` served the prerendered Results shell, then logged `TypeError: e[o] is not a function` during a browser request; the first attempt also logged `Cannot find module './chunks/vendor-chunks/next.js'`. The exact process or event that created the inconsistent output could not be identified.

The evidence points to **inconsistent/stale generated `.next` artifacts**, rather than the application route source or the installed dependency versions:

1. No competing Next development, build, or start process was running at initial inspection.
2. `package-lock.json` and `npm ls` agree on Next `14.2.35`, React `18.3.1`, and React DOM `18.3.1`; `next.config.mjs` contains no custom build output setting.
3. I copied the same frontend source and lockfile to `/tmp/mm-phase2b`, reused the installed `node_modules`, and built into a fresh isolated directory. That production server did not log the RSC/runtime errors.
4. I preserved the original generated build at `/tmp/mm-phase2b-original-next`, rebuilt `frontend/.next` from scratch, and retested the project build. The clean project build served all four routes without the reported runtime errors.

The correction was to regenerate build output from a clean directory. No source/configuration/dependency correction was justified by the evidence. The original build remains preserved at `/tmp/mm-phase2b-original-next` for diagnosis; it was moved only after confirming no frontend process was using the project build directory.

## Environment and preservation

- `git status --short` was inspected first. It showed the same extensive pre-existing modified and untracked work described in the Phase 2A report.
- `ps` inspection found no frontend Next process using `frontend/.next` before diagnosis. The temporary diagnostic and final local servers were stopped after their checks.
- Node: `v22.13.0`
- npm: `10.9.2`
- Next.js: `14.2.35`
- React / React DOM: `18.3.1` / `18.3.1`
- Lockfile: npm lockfile version 3; installed versions agree with its resolved entries.
- `frontend/next.config.mjs`: default config, no custom `distDir` or output mode.
- Project start script `start.sh` starts `next dev`, not the production server. Production testing used the package script `npm run start -- --hostname 127.0.0.1 --port 3400` directly. All server checks were loopback-only.

No tracked application source, configuration, or dependency files were changed during Phase 2B. The only new project file is this report. The generated `frontend/.next` was rebuilt; its previous contents are retained outside the project in `/tmp/mm-phase2b-original-next`. The isolated diagnostic copy and output are under `/tmp/mm-phase2b`.

## Reproduction and correction steps

### Original failure

1. Before the correction, start the production app with the existing build:

   ```sh
   cd /home/martin/Documents/MM/frontend
   npm run start -- --hostname 127.0.0.1 --port 3400
   ```

2. Open `http://127.0.0.1:3400/results` in headless Chrome:

   ```sh
   google-chrome --headless --no-sandbox --disable-gpu \
     --disable-dev-shm-usage --virtual-time-budget=5000 --dump-dom \
     http://127.0.0.1:3400/results
   ```

3. The server initially returned the static shell, but on the browser request its log showed `TypeError: e[o] is not a function` from Next’s app-page/RSC runtime. The earlier attempt also reported the missing `./chunks/vendor-chunks/next.js` module. Thus the shell alone was not proof of a working page.

### Clean-build correction

The old `.next` directory was moved to `/tmp/mm-phase2b-original-next` after the process check. Then:

```sh
cd /home/martin/Documents/MM/frontend
npm run build
npm run start -- --hostname 127.0.0.1 --port 3400
```

The optimized build completed and the browser route checks below passed against that clean output. The start server log remained free of the reported runtime/RSC errors.

## Browser checks

Headless Chrome was run against the production server, bound to `127.0.0.1:3400`. Browser output was reduced to route-specific DOM evidence; each Chrome process exited 0 and emitted empty stderr.

| Route | Browser result |
|---|---|
| `/` | Expected Dashboard text present; no loading shell remained. |
| `/upload` | Expected Upload attendance records text present; route returned successfully. |
| `/results` | Empty-state text “No processed attendance is available” present; loading shell cleared; upload recovery link present. No attendance data was seeded. |
| `/rules` | Expected Business rules text present; route returned successfully. |

The final clean build was also opened in the browser before this report. The server log had no output beyond startup, and the browser’s captured stderr was empty.

**Not verified:** DevTools console events were not captured; empty Chrome stderr is not equivalent to a clean JavaScript console. Client-side navigation between routes, keyboard traversal, mobile layout, file-picker/drop events, and upload submission were not exercised. An attempted temporary CDP driver did not establish a usable DevTools connection and was stopped. No synthetic upload was sent, and there was no backend involved. Therefore the browser verification establishes direct route rendering and the Results empty-state recovery only; it does not establish the full upload or navigation workflow.

## Automated verification

Commands were run in `frontend/` after the clean rebuild:

| Command | Result |
|---|---|
| `npm test` | **Pass:** 31 tests (18 API contract, 10 dashboard status, 3 session/results freshness). |
| `npm run lint` | **Pass:** no ESLint warnings or errors. Node emitted `[DEP0169] url.parse()` deprecation warnings. |
| `./node_modules/.bin/tsc --noEmit --incremental false` | **Pass:** exit 0, no diagnostics. |
| `npm run build` | **Pass:** optimized production build; `/`, `/upload`, `/results`, `/rules`, and `/_not-found` prerendered. |
| `git diff --check` | **Pass:** no whitespace errors. |

## Files changed

- `PHASE_2B_BROWSER_RUNTIME_REPORT.md` (new)
- Generated build output: `frontend/.next` refreshed; prior output preserved at `/tmp/mm-phase2b-original-next`.

No business logic, backend code, dependency, or Next.js configuration was changed.

## Remaining issues and readiness

- The original `.next` inconsistency’s initiating cause is unknown. If the runtime error returns, capture the old build manifest and file inventory before rebuilding, then check for concurrent build/start processes or external build tooling.
- Direct route rendering and the Results empty state now work against the clean production build. Client-side navigation and upload controls still need a proper browser automation run. The available Chrome DevTools connection attempt failed, and no browser automation dependency was added.
- The Phase 2A limitations remain: no authentication/authorization, no tenant/job owner model, process-local mutable rules, OS temporary job storage, unresolved retention and HR policy decisions, incomplete request-body resource limits, and file-parent replacement race limitations.

**Runtime assessment:** The reported production RSC failure is cleared for the freshly generated build and all four direct routes render in headless Chrome. This is not an acceptance for multi-user architecture, cloud hosting, or real employee data. Proceed with synthetic localhost testing only; complete interaction-level browser testing and the Phase 2A architecture blockers before moving to shared or production use.
