# mmrjd-attendance-automation
# Browser-based attendance report automation for Hikvision iVMS-4200 AC exports
MM&RJD ATTENDANCE REPORT CONVERTER — PROTOTYPE

What it does
- Runs locally on the Windows computer in a browser.
- Accepts iVMS exports in CSV, TXT, XLSX/XLS, or PDF (PDF parsing is best-effort; CSV/TXT is preferred).
- Shows parsed fingerprint events before processing.
- Allows a date range and configurable lateness/overtime thresholds.
- Can read the employee roster from the first two columns of the current MM&RJD attendance workbook (ID in A, name in B).
- Generates Excel and PDF reports with a separate exceptions list.
- Does not connect to or change the Hikvision server.

Current default rules
- Late: 08:30 or later.
- Very late: 09:30 or later (takes precedence over Late).
- Overtime: a recorded fingerprint event at or after 19:30.
- Zero events in the selected date range: marked Absent / no fingerprint record when a roster is supplied.
- One event: only that event is shown; IN/OUT is not guessed, and the day is flagged.
- More than two events and events within one minute are flagged for review.
- First and last events are shown when there are at least two events. This is a provisional summary, not proof that they are true check-in/check-out events.

How to start
1. Install Python 3.11+ on Windows if it is not already installed. During installation enable Add Python to PATH.
2. Extract this ZIP into a folder on the HR Windows computer.
3. Double-click START_ATTENDANCE_TOOL.bat. The first run installs the required Python packages and may take several minutes; internet access is required for this setup step.
4. A local browser page should open. If it does not, read the Streamlit URL shown in the terminal (normally http://localhost:8501).
5. Upload an iVMS Original Records export. CSV/TXT is preferred where available.
6. Upload the current attendance workbook as the roster if you need to include employees with no fingerprint events.
7. Review exceptions, then download Excel and PDF.

Important limitations
- This is an initial prototype, not approved payroll/official attendance software.
- Test on copies of exports and compare outputs against HR's manually prepared report before operational use.
- PDF parsing is best-effort. If records do not appear, export CSV/TXT or XLSX from iVMS.
- The current Excel output is a clean report format; exact replication of the existing workbook's layout and date columns is a later refinement.
- The app cannot know whether a missing fingerprint was absence, forgotten punch, leave, approved business trip, or a device issue. Those require HR review or an approved exception process.
- Do not upload files to public hosting. Keep this folder and reports on approved company equipment.