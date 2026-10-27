import os
import tempfile
import uuid
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field
import openpyxl
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
import csv
import io
import json
from pathlib import Path

BUSINESS_RULES = {
    "normal_start_time": "08:00",
    "late_arrival_threshold": "08:30",
    "very_late_arrival_threshold": "09:30",
    "overtime_threshold": "19:30",
    "default_work_end_time": "17:30",
    "weekend_overtime_evaluated_separately": True,
}

app = FastAPI(title="MM&RJD Attendance Report Automation", version="0.1.0")
security = HTTPBearer()

TEMP_DIR = Path(tempfile.gettempdir()) / "mm_attendance"
TEMP_DIR.mkdir(exist_ok=True)

def cleanup_temp_file(filepath: str):
    try:
        p = Path(filepath)
        if p.exists():
            p.unlink()
    except Exception:
        pass

def detect_ivms_format(file_content: bytes, filename: str) -> Dict[str, Any]:
    ext = Path(filename).suffix.lower()
    if ext == '.csv':
        return parse_ivms_csv(file_content)
    elif ext in ('.xlsx', '.xls'):
        return parse_ivms_excel(file_content)
    elif ext == '.pdf':
        return parse_ivms_pdf(file_content)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")

def parse_ivms_csv(file_content: bytes) -> Dict[str, Any]:
    text = file_content.decode('utf-8', errors='replace')
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="Empty CSV file")
    headers = [h.strip().lower() for h in rows[0]]
    data_rows = rows[1:]
    column_map = {}
    for i, header in enumerate(headers):
        if any(kw in header for kw in ['employee', 'id', 'card', 'staff']):
            column_map['employee_id'] = i
        elif any(kw in header for kw in ['name', 'employee']):
            column_map['employee_name'] = i
        elif any(kw in header for kw in ['date']):
            column_map['date'] = i
        elif any(kw in header for kw in ['event', 'type', 'action']):
            column_map['event_type'] = i
        elif any(kw in header for kw in ['time', 'timestamp']):
            column_map['timestamp'] = i
        elif any(kw in header for kw in ['device']):
            column_map['device_id'] = i
    if 'timestamp' not in column_map and len(headers) > 3:
        column_map['timestamp'] = 3
    if 'event_type' not in column_map and len(headers) > 2:
        column_map['event_type'] = 2
    if 'employee_id' not in column_map:
        column_map['employee_id'] = 0
    if 'employee_name' not in column_map and len(headers) > 1:
        column_map['employee_name'] = 1
    if 'date' not in column_map and len(headers) > 4:
        column_map['date'] = 4
    return {'format': 'csv', 'column_map': column_map, 'headers': headers,
            'total_rows': len(data_rows), 'raw_data': data_rows}

def parse_ivms_excel(file_content: bytes) -> Dict[str, Any]:
    import openpyxl as _pxl
    wb = _pxl.load_workbook(io.BytesIO(file_content), data_only=True)
    sheet = wb.active
    headers = [cell.value for cell in sheet[1]] if sheet[1] else []
    data_rows = []
    for row in sheet.iter_rows(min_row=2, values_only=True):
        data_rows.append([cell for cell in row])
    if not headers or all(h is None for h in headers):
        raise HTTPException(status_code=400, detail="Excel file has no header row")
    headers = [str(h).strip().lower() if h else '' for h in headers]
    column_map = {}
    for i, header in enumerate(headers):
        if any(kw in header for kw in ['employee', 'id', 'card', 'staff']):
            column_map['employee_id'] = i
        elif any(kw in header for kw in ['name', 'employee']):
            column_map['employee_name'] = i
        elif any(kw in header for kw in ['date']):
            column_map['date'] = i
        elif any(kw in header for kw in ['event', 'type', 'action']):
            column_map['event_type'] = i
        elif any(kw in header for kw in ['time', 'timestamp']):
            column_map['timestamp'] = i
        elif any(kw in header for kw in ['device']):
            column_map['device_id'] = i
    if 'timestamp' not in column_map and len(headers) > 3:
        column_map['timestamp'] = 3
    if 'event_type' not in column_map and len(headers) > 2:
        column_map['event_type'] = 2
    if 'employee_id' not in column_map:
        column_map['employee_id'] = 0
    if 'employee_name' not in column_map and len(headers) > 1:
        column_map['employee_name'] = 1
    if 'date' not in column_map and len(headers) > 4:
        column_map['date'] = 4
    return {'format': 'excel', 'column_map': column_map, 'headers': headers,
        'total_rows': len(data_rows), 'raw_data': data_rows}

def parse_ivms_pdf(file_content: bytes) -> Dict[str, Any]:
    try:
        import pdfminer.high_level as pdfml
        text = pdfml.extract_text(io.BytesIO(file_content))
    except ImportError:
        raise HTTPException(status_code=400, detail="pdfminer not available. Use Excel/CSV export from iVMS-4200.")
    if not text:
        raise HTTPException(status_code=400, detail="Could not extract text from PDF.")
    lines = text.split('\n')
    data_rows = []
    headers = []
    column_map = {}
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) >= 3:
            if i == 0:
                headers = [p.strip().lower() for p in parts]
                for j, h in enumerate(headers):
                    if any(kw in h for kw in ['employee', 'id', 'card']):
                        column_map['employee_id'] = j
                    elif any(kw in h for kw in ['name']):
                        column_map['employee_name'] = j
                    elif any(kw in h for kw in ['date']):
                        column_map['date'] = j
                    elif any(kw in h for kw in ['time', 'timestamp']):
                        column_map['timestamp'] = j
                    elif any(kw in h for kw in ['event', 'type']):
                        column_map['event_type'] = j
            else:
                data_rows.append(parts)
    if not column_map:
        raise HTTPException(status_code=400, detail="Could not detect column structure in PDF.")
    return {'format': 'pdf', 'column_map': column_map, 'headers': headers,
        'total_rows': len(data_rows), 'raw_data': data_rows}

def parse_timestamp(ts_str: str) -> datetime:
    for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%d/%m/%Y %H:%M:%S', '%m/%d/%Y %H:%M:%S', '%Y-%m-%d']:
        try:
            return datetime.strptime(ts_str.strip(), fmt)
        except ValueError:
            continue
    raise ValueError(f"Could not parse timestamp: {ts_str}")

def is_weekend(date_str: str) -> bool:
    date = datetime.strptime(date_str, '%Y-%m-%d')
    return date.weekday() >= 5

def process_attendance_events(events: List, rules: dict) -> dict:
    sorted_events = sorted(events, key=lambda e: e.timestamp if e.timestamp is not None else datetime.min)
    check_ins = [e for e in sorted_events if e.event_type in ('check_in', 'check-in', 'in')]
    check_outs = [e for e in sorted_events if e.event_type in ('check_out', 'check-out', 'out')]
    break_starts = [e for e in sorted_events if e.event_type in ('break_start', 'break beginn', 'break_start')]
    break_ends = [e for e in sorted_events if e.event_type in ('break_end', 'break end', 'break end')]
    check_in: Optional[datetime] = None
    if check_ins:
        check_ins_valid = [e for e in check_ins if e.timestamp is not None]
check_in = min(check_ins_valid, key=lambda e: e.timestamp).timestamp if check_ins_valid else None
    elif sorted_events:
        check_in = sorted_events[0].timestamp
    check_out: Optional[datetime] = None
    if check_outs:
        check_outs_valid = [e for e in check_outs if e.timestamp is not None]
check_out = max(check_outs_valid, key=lambda e: e.timestamp).timestamp if check_outs_valid else None
    elif sorted_events:
        check_out = sorted_events[-1].timestamp
    break_duration_minutes = 0
    if break_starts and break_ends:
        bd = (break_ends[0].timestamp if break_ends[0].timestamp is not None else datetime.min) - (break_starts[0].timestamp if break_starts[0].timestamp is not None else datetime.min)
        break_duration_minutes = int(bd.total_seconds() / 60)
    late_minutes = 0
    very_late = False
    if check_in:
        ns = datetime.combine(datetime.today(), time.fromisoformat(rules['normal_start_time']))
        late_delta = check_in - ns
        if late_delta.total_seconds() > 0:
            late_minutes = int(late_delta.total_seconds() / 60)
        vl = datetime.combine(datetime.today(), time.fromisoformat(rules['very_late_arrival_threshold']))
        if check_in >= vl:
            very_late = True
    overtime_minutes = 0
    if check_out:
        ot = datetime.combine(datetime.today(), time.fromisoformat(rules['overtime_threshold']))
        co_date = check_out.date() if hasattr(check_out, 'date') else None
        ot_delta = (check_out - ot) if check_out and co_date else timedelta(0)
        if ot_delta.total_seconds() > 0:
            overtime_minutes = int(ot_delta.total_seconds() / 60)
    has_events = len(sorted_events) > 0
    status = "incomplete" if not has_events else "complete"
    flagged_for_review = False
    notes = ""
    if not has_events:
        status = "no_events"
        flagged_for_review = True
        notes = "No attendance events recorded - flagged for review. Do not claim employee definitely did not attend."
    elif check_in is None or check_out is None:
        status = "incomplete"
        flagged_for_review = True
        notes = "Attendance events present but check-in/check-out could not be determined reliably - flagged for review."
    elif late_minutes > 60:
        flagged_for_review = True
        notes = f"Arrived {late_minutes} minutes late after normal start time ({rules['normal_start_time']})"
    elif very_late:
        flagged_for_review = True
        notes = f"Very late arrival at {check_in.strftime('%H:%M')} (after {rules['very_late_arrival_threshold']})"
    if has_events and len(sorted_events) == 1:
        status = "ambiguous"
        flagged_for_review = True
        notes = "Only one event recorded for the day - flagged as ambiguous. Cannot determine if this is check-in or check-out without additional context."
    return {
        'employee_id': sorted_events[0].employee_id if sorted_events else '',
        'employee_name': sorted_events[0].employee_name if sorted_events else '',
        'date': sorted_events[0].date if sorted_events else '',
        'events': sorted_events,
        'check_in': check_in,
        'check_out': check_out,
        'break_duration_minutes': break_duration_minutes,
        'late_minutes': late_minutes,
        'very_late': very_late,
        'overtime_minutes': overtime_minutes,
        'status': status,
        'flagged_for_review': flagged_for_review,
        'notes': notes
    }

def process_employee_attendance(events: List, rules: dict, roster: dict = None) -> List[dict]:
    events_by_date: dict = {}
    for event in events:
        date_key = event.date
        if date_key not in events_by_date:
            events_by_date[date_key] = []
        events_by_date[date_key].append(event)
    all_dates = sorted(events_by_date.keys())
    processed_days = []
    for date_str in all_dates:
        day_events = events_by_date[date_str]
        day_processed = process_attendance_events(day_events, rules)
        processed_days.append(day_processed)
    if roster:
        roster_dates = set()
        for emp_id, emp_data in roster.items():
            if isinstance(emp_data, dict) and 'dates' in emp_data:
                roster_dates.update(emp_data['dates'])
            elif isinstance(emp_data, dict) and 'shifts' in emp_data:
                for shift in emp_data.get('shifts', []):
                    if isinstance(shift, dict) and 'date' in shift:
                        roster_dates.add(shift['date'])
        for date_str in roster_dates:
            if date_str not in all_dates:
                day_processed = {
                    'employee_id': '',
                    'employee_name': '',
                    'date': date_str,
                    'events': [],
                    'check_in': None,
                    'check_out': None,
                    'break_duration_minutes': 0,
                    'late_minutes': 0,
                    'very_late': False,
                    'overtime_minutes': 0,
                    'status': 'no_events',
                    'flagged_for_review': True,
                    'notes': "No attendance events in uploaded file. Employee may be absent per roster. Do not claim employee definitely did not attend."
                }
                processed_days.append(day_processed)
    processed_days.sort(key=lambda d: d['date'])
    return processed_days

# --- Excel Report Generation ---
def generate_excel_report(processed_days: List[dict], rules: dict) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance Report"
    header_font = openpyxl.styles.Font(bold=True, color=colors.white)
    header_fill = openpyxl.styles.PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    thin_border = openpyxl.styles.Border(
        left=openpyxl.styles.Side(style='thin'),
        right=openpyxl.styles.Side(style='thin'),
        top=openpyxl.styles.Side(style='thin'),
        bottom=openpyxl.styles.Side(style='thin')
    )
    headers = [
        "Employee ID", "Employee Name", "Date", "Check-In", "Check-Out",
        "Break (min)", "Late (min)", "Very Late", "Overtime (min)",
        "Status", "Flagged for Review", "Notes"
    ]
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border
    for row_idx, day in enumerate(processed_days, 2):
        check_in_str = day['check_in'].strftime('%H:%M') if day['check_in'] else ""
        check_out_str = day['check_out'].strftime('%H:%M') if day['check_out'] else ""
        row_data = [
            day['employee_id'],
            day['employee_name'],
            day['date'],
            check_in_str,
            check_out_str,
            day['break_duration_minutes'],
            day['late_minutes'],
            "Yes" if day['very_late'] else "No",
            day['overtime_minutes'],
            day['status'],
            "Yes" if day['flagged_for_review'] else "No",
            (day['notes'][:50] + "...") if len(day['notes']) > 50 else day['notes']
        ]
        for col_idx, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.border = thin_border
        if day['flagged_for_review']:
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.fill = openpyxl.styles.PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")
    column_widths = [15, 20, 12, 10, 10, 12, 12, 12, 15, 15, 15, 50]
    for i, width in enumerate(column_widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = width
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.read()

# --- PDF Report Generation ---
def generate_pdf_report(processed_days: List[dict], rules: dict) -> bytes:
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []
    title_style = styles['Title']
    elements.append(Paragraph("MM&RJD Attendance Report", title_style))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    elements.append(Paragraph("", styles['Normal']))
    elements.append(Paragraph("Attendance Summary", styles['Heading2']))
    elements.append(Paragraph("", styles['Normal']))
    table_data = [[
        "Employee ID", "Employee Name", "Date", "Check-In", "Check-Out",
        "Break (min)", "Late (min)", "Very Late", "Overtime (min)",
        "Status", "Flagged", "Notes"
    ]]
    for day in processed_days:
        check_in_str = day['check_in'].strftime('%H:%M') if day['check_in'] else ""
        check_out_str = day['check_out'].strftime('%H:%M') if day['check_out'] else ""
        very_late_str = "Yes" if day['very_late'] else "No"
        flagged_str = "Yes" if day['flagged_for_review'] else "No"
        table_data.append([
            day['employee_id'],
            day['employee_name'],
            day['date'],
            check_in_str,
            check_out_str,
            str(day['break_duration_minutes']),
            str(day['late_minutes']),
            very_late_str,
            str(day['overtime_minutes']),
            day['status'],
            flagged_str,
            (day['notes'][:30] + "...") if len(day['notes']) > 30 else day['notes']
        ])
    table = Table(table_data, colWidths=[1*72, 1.5*72, 0.8*72, 0.8*72, 0.8*72,
        0.6*72, 0.6*72, 0.5*72, 0.6*72, 0.7*72, 0.6*72, 2.5*72])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4472C4')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('ROWHEIGHT', (0, 0), (-1, -1), 20),
    ]))
    elements.append(table)
    doc.build(elements)
    output.seek(0)
    return output.read()

# --- API Endpoints ---

@app.post("/api/upload", summary="Upload iVMS attendance export file")
async def upload_file(file: UploadFile = File(...)):
    max_size = 50 * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        pass
    filename = file.filename or "uploaded_file"
    ext = Path(filename).suffix.lower()
    if ext not in ('.csv', '.xlsx', '.xls', '.pdf'):
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}. Supported formats: CSV, Excel (.xlsx, .xls), PDF")
    temp_id = str(uuid.uuid4())
    temp_path = TEMP_DIR / f"{temp_id}_{filename}"
    try:
        with open(temp_path, 'wb') as f:
            f.write(content)
        parsed = detect_ivms_format(content, filename)
        events = extract_attendance_events(parsed)
        results_path = TEMP_DIR / f"{temp_id}_results.json"
        events_data = [(e[0], e[1], e[2], e[3], e[4].isoformat()) for e in events]
        results = {'employee_events': events_data, 'column_map': parsed['column_map'], 'format': parsed['format']}
        with open(results_path, 'w') as f:
            json.dump(results, f)
        cleanup_temp_file(str(temp_path))
        return {
            'success': True,
            'format': parsed['format'],
            'column_map': parsed['column_map'],
            'total_records': parsed['total_rows'],
            'events_found': len(events),
            'message': f"File '{filename}' parsed successfully. {len(events)} attendance events found."
        }
    except HTTPException:
        cleanup_temp_file(str(temp_path))
        raise
    except Exception as e:
        cleanup_temp_file(str(temp_path))
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

def extract_attendance_events(parsed: dict) -> List[tuple]:
    events = []
    data = parsed.get('raw_data', [])
    column_map = parsed.get('column_map', {})
    if not data:
        return events
    num_cols = max(column_map.values()) + 1 if column_map else len(data[0]) if data else 0
    for row in data:
        try:
            employee_id = ""
            employee_name = ""
            date_str = ""
            event_type = ""
            timestamp_str = ""
            if 'employee_id' in column_map and column_map['employee_id'] < num_cols:
                employee_id = str(row[column_map['employee_id']]).strip() if column_map['employee_id'] < len(row) else ""
            if 'employee_name' in column_map and column_map['employee_name'] < num_cols:
                employee_name = str(row[column_map['employee_name']]).strip() if column_map['employee_name'] < len(row) else ""
            if 'date' in column_map and column_map['date'] < num_cols:
                date_str = str(row[column_map['date']]).strip() if column_map['date'] < len(row) else ""
            if 'event_type' in column_map and column_map['event_type'] < num_cols:
                event_type = str(row[column_map['event_type']]).strip().lower() if column_map['event_type'] < len(row) else ""
            if 'timestamp' in column_map and column_map['timestamp'] < num_cols:
                timestamp_str = str(row[column_map['timestamp']]).strip() if column_map['timestamp'] < len(row) else ""
            try:
                date_obj = parse_timestamp(date_str) if date_str else None
                date_str = date_obj.strftime('%Y-%m-%d') if date_obj else ""
            except (ValueError, IndexError):
                date_str = ""
            try:
                ts = parse_timestamp(timestamp_str) if timestamp_str else None
            except ValueError:
                ts = None
            et = event_type.lower()
            if et in ('in', 'check-in', 'check_in', 'arrival', 'checkin'):
                et = 'check_in'
            elif et in ('out', 'check-out', 'check_out', 'departure', 'checkout'):
                et = 'check_out'
            elif et in ('break start', 'break_start', 'break beginn'):
                et = 'break_start'
            elif et in ('break end', 'break_end', 'break end'):
                et = 'break_end'
            else:
                et = event_type  # preserve raw event type
            events.append((employee_id, employee_name, date_str, et, ts))
        except Exception:
            continue
    return events

@app.post("/api/process", summary="Process attendance events")
def process_attendance_endpoint(rules: dict = Depends(lambda: BUSINESS_RULES.dict()), employee_id: Optional[str] = None):
    import json
    from pathlib import Path
    results_dir = TEMP_DIR
    results_files = list(results_dir.glob("*.json"))
    if not results_files:
        raise HTTPException(status_code=404, detail="No processed attendance data found. Upload a file first.")
    latest_results = max(results_files, key=lambda f: f.stat().st_mtime)
    try:
        with open(latest_results, 'r') as f:
            results = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading processed data: {str(e)}")
    employee_events = results.get('employee_events', [])
    events = []
    for emp_id, emp_name, date_str, event_type, ts_str in employee_events:
        try:
            ts = datetime.fromisoformat(ts_str)
        except ValueError:
            ts = None
        events.append((emp_id, emp_name, date_str, event_type, ts))
    roster = None
    roster_path = results_dir / "roster.json"
    if roster_path.exists():
        try:
            with open(roster_path, 'r') as f:
                roster = json.load(f)
        except Exception:
            roster = None
    processed_days = process_employee_attendance(events, rules, roster)
    total_days = len(processed_days)
    present_days = sum(1 for d in processed_days if d['status'] == 'complete')
    late_count = sum(1 for d in processed_days if d['late_minutes'] > 0 and d['status'] in ('complete', 'incomplete'))
    very_late_count = sum(1 for d in processed_days if d['very_late'])
    total_overtime = sum(d['overtime_minutes'] for d in processed_days)
    return {
        'success': True,
        'summary': {
            'total_days': total_days,
            'present_days': present_days,
            'absent_or_no_events': total_days - present_days,
            'late_count': late_count,
            'very_late_count': very_late_count,
            'total_overtime_minutes': total_overtime,
        },
        'processed_days': [{
            'employee_id': d['employee_id'],
            'employee_name': d['employee_name'],
            'date': d['date'],
            'check_in': d['check_in'].strftime('%H:%M') if d['check_in'] else "",
            'check_out': d['check_out'].strftime('%H:%M') if d['check_out'] else "",
            'break_duration_minutes': d['break_duration_minutes'],
            'late_minutes': d['late_minutes'],
            'very_late': d['very_late'],
            'overtime_minutes': d['overtime_minutes'],
            'status': d['status'],
            'flagged_for_review': d['flagged_for_review'],
            'notes': d['notes']
        } for d in processed_days]
    }

@app.post("/api/export/excel", summary="Generate Excel attendance report")
def export_excel_endpoint(processed_days_data: dict, rules: dict = Depends(lambda: BUSINESS_RULES.dict())):
    import json
    processed_days = [
        {
            'employee_id': d['employee_id'],
            'employee_name': d['employee_name'],
            'date': d['date'],
            'check_in': datetime.strptime(d['check_in'], '%H:%M') if d['check_in'] else None,
            'check_out': datetime.strptime(d['check_out'], '%H:%M') if d['check_out'] else None,
            'break_duration_minutes': d['break_duration_minutes'],
            'late_minutes': d['late_minutes'],
            'very_late': d['very_late'],
            'overtime_minutes': d['overtime_minutes'],
            'status': d['status'],
            'flagged_for_review': d['flagged_for_review'],
            'notes': d['notes']
        }
        for d in processed_days_data.get('processed_days', [])
    ]
    excel_bytes = generate_excel_report(processed_days, rules)
    return {"filename": "attendance_report.xlsx", "data": excel_bytes}

@app.post("/api/export/pdf", summary="Generate PDF attendance report")
def export_pdf_endpoint(processed_days_data: dict, rules: dict = Depends(lambda: BUSINESS_RULES.dict())):
    import json
    processed_days = [
        {
            'employee_id': d['employee_id'],
            'employee_name': d['employee_name'],
            'date': d['date'],
            'check_in': datetime.strptime(d['check_in'], '%H:%M') if d['check_in'] else None,
            'check_out': datetime.strptime(d['check_out'], '%H:%M') if d['check_out'] else None,
            'break_duration_minutes': d['break_duration_minutes'],
            'late_minutes': d['late_minutes'],
            'very_late': d['very_late'],
            'overtime_minutes': d['overtime_minutes'],
            'status': d['status'],
            'flagged_for_review': d['flagged_for_review'],
            'notes': d['notes']
        }
        for d in processed_days_data.get('processed_days', [])
    ]
    pdf_bytes = generate_pdf_report(processed_days, rules)
    return {"filename": "attendance_report.pdf", "data": pdf_bytes}

@app.post("/api/rules", summary="Update business rules")
def update_rules_endpoint(new_rules: dict):
    BUSINESS_RULES.update(new_rules)
    return {'success': True, 'rules': BUSINESS_RULES}

@app.get("/api/rules", summary="Get current business rules")
def get_rules_endpoint():
    return {'rules': BUSINESS_RULES}
