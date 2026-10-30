# mmrjd-attendance-automation
# Browser-based attendance report automation for Hikvision iVMS-4200 AC exports
MM&RJD ATTENDANCE REPORT CONVERTER — PROTOTYPE

What it does
- Runs locally on the computer in a browser.
- Backend API (FastAPI): parses iVMS exports in CSV, XLSX, XLS, or PDF (CSV is preferred).
- Frontend (Next.js): interactive UI to upload files, configure rules, view results, and download reports.
- Shows an upload parsing summary; it does not yet show a row-by-row parsed-event preview.
- Allows configuration of the effective normal-start, very-late, and weekday-overtime thresholds via the Rules page.
- Can read a per-upload employee roster from CSV or .xlsx (ID in column A, name in B, dates in remaining columns; maximum 10 MiB).
- Generates Excel and PDF reports with a separate exceptions list.
- Does not connect to or change the Hikvision server.

Architecture
- **Backend**: `backend/main.py` — FastAPI server on port 8000
  - `POST /api/upload` — Upload & parse attendance export file
  - `POST /api/roster` — Upload employee roster (CSV/Excel)
  - `POST /api/process` — Process attendance events with business rules
  - `POST /api/export/excel` — Generate Excel report (base64)
  - `POST /api/export/pdf` — Generate PDF report (base64)
  - `GET/POST /api/rules` — Get/update business rules
  - `GET /api/health` — Health check
- **Frontend**: `frontend/src/app/` — Next.js app on port 3000
  - `/` — Home page with workflow guide and backend status
  - `/upload` — File upload & processing
  - `/rules` — Business rules configuration
  - `/results` — Processed results table with Excel/PDF download

Current default rules
- Late minutes currently count from normal start (08:00 by default); HR must decide whether lateness should instead start at the documented 08:30 threshold. The 08:30 threshold is not applied.
- Very late: 09:30 or later.
- Weekday overtime: minutes after the 19:30 threshold. Weekend overtime is withheld and flagged until HR defines the policy.
- Zero events are marked `no_events` and require review; this does not establish absence.
- Check-in/check-out columns use only recognized source event directions. Unknown, duplicate, missing, or incomplete events are preserved as evidence and flagged; missing punches are not inferred.
- Missing checkout is not filled from the 17:30 regular end time.

How to start
1. Install Python 3.11+ and Node.js 18+.
2. Extract this into a folder.
3. Run `./start.sh` (double-click on Linux). This starts the backend on `127.0.0.1:8000` and the frontend on port 3000. The backend is local-only and has no authentication; do not expose it to a network.
4. Open `http://localhost:3000` in your browser.
5. Upload an iVMS Original Records export. CSV is preferred; the upload page lists accepted formats.
6. Upload the current attendance workbook as the roster if you need to include employees with no fingerprint events.
7. Review exceptions on the Results page, then download Excel and PDF.

Or run manually:
```bash
# Backend
cd backend && pip install -r requirements.txt && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000

# Frontend (in a separate terminal)
cd frontend && npm install && npm run dev
```

Important limitations
- This is a prototype, not approved payroll/official attendance software.
- Test on copies of exports and compare outputs against HR's manually prepared report before operational use.
- PDF parsing is best-effort. If records do not appear, export CSV/TXT or XLSX from iVMS.
- The current Excel output is a clean report format; exact replication of the existing workbook's layout and date columns is a later refinement.
- The app cannot know whether a missing fingerprint was absence, forgotten punch, leave, approved business trip, or a device issue. Those require HR review or an approved exception process.
- Do not upload files to public hosting. Keep this folder and reports on approved company equipment.
