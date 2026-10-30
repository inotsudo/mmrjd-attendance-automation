'use client'

import { DragEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ProcessResult, RosterResponse, UploadResponse } from '@/lib/api'
import Layout from '@/components/ui/Layout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { parseStoredProcess, parseStoredUpload } from '@/lib/session-state'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Stepper({ uploaded, rosterReady, processed }: { uploaded: boolean; rosterReady: boolean; processed: boolean }) {
  const steps = [
    { label: 'Upload attendance file', done: uploaded, current: !uploaded },
    { label: 'Add employee roster (optional)', done: rosterReady, current: false },
    { label: 'Process attendance', done: processed, current: uploaded && !processed },
  ]
  return <div className="stepper" aria-label="Upload and processing steps">
    {steps.map((step, index) => <span key={step.label} className={`stepper-item${step.done ? ' done' : step.current ? ' current' : ''}`}>
      <span className="stepper-number" aria-hidden="true">{step.done ? '✓' : index + 1}</span><span>{step.label}</span>
      {index < steps.length - 1 && <span className="stepper-divider" aria-hidden="true"/>}
    </span>)}
  </div>
}

export default function UploadPage() {
  const router = useRouter()
  const attendanceInput = useRef<HTMLInputElement>(null)
  const [attendanceFile, setAttendanceFile] = useState<File | null>(null)
  const [rosterFile, setRosterFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null)
  const [rosterResult, setRosterResult] = useState<RosterResponse | null>(null)
  const [processed, setProcessed] = useState<ProcessResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [storageNotice, setStorageNotice] = useState<string | null>(null)

  useEffect(() => {
    try {
      const storedUpload = sessionStorage.getItem('mm_upload_result')
      const storedProcessed = sessionStorage.getItem('mm_processed')
      setUploadResult(parseStoredUpload(storedUpload))
      setProcessed(parseStoredProcess(storedProcessed))
    } catch {
      setStorageNotice('Saved browser state could not be read. Upload or process the intended job explicitly.')
    }
  }, [])

  const selectAttendance = (file?: File) => {
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['csv', 'xlsx', 'xls', 'pdf'].includes(extension)) {
      setError('This file type is not supported. Choose a CSV, Excel (.xlsx, .xls), or PDF export.')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('This file is larger than the 50 MB upload limit.')
      return
    }
    setAttendanceFile(file)
    setUploadResult(null)
    setProcessed(null)
    setError(null)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    selectAttendance(event.dataTransfer.files[0])
  }

  const openAttendancePicker = () => {
    if (!attendanceInput.current) return
    attendanceInput.current.value = ''
    attendanceInput.current.click()
  }

  const handleUpload = async () => {
    if (!attendanceFile) {
      setError('Choose an attendance file before uploading.')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const result = await api.uploadFile(attendanceFile)
      setUploadResult(result)
      setAttendanceFile(null)
      setRosterResult(null)
      setRosterFile(null)
      setProcessed(null)
      try {
        sessionStorage.setItem('mm_upload_result', JSON.stringify(result))
        sessionStorage.setItem('mm_upload_meta', JSON.stringify({ filename: attendanceFile.name, size: attendanceFile.size, uploadedAt: new Date().toISOString(), format: result.format, total_records: result.total_records, events_found: result.events_found }))
        sessionStorage.removeItem('mm_processed')
        setStorageNotice(null)
      } catch { setStorageNotice(`Upload succeeded and job ${result.job_id} is available in this page, but browser storage failed. Keep this tab open; do not upload the same file again.`) }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The attendance file could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  const handleRosterUpload = async () => {
    if (!rosterFile) return
    setError(null)
    setUploading(true)
    try {
      if (!uploadResult?.job_id) throw new Error('Upload the attendance file first so the roster can be attached to its job.')
      const result = await api.uploadRoster(uploadResult.job_id, rosterFile)
      setRosterResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The employee roster could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  const handleProcess = async () => {
    if (!uploadResult) return
    setError(null)
    setProcessing(true)
    try {
      const result = await api.processAttendance(uploadResult.job_id)
      setProcessed(result)
      try { sessionStorage.setItem('mm_processed', JSON.stringify(result)); setStorageNotice(null) }
      catch { setStorageNotice('Processing succeeded, but browser storage failed. Keep this tab open to review the result.') }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attendance processing failed.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Layout title="Upload attendance records" subtitle="Import the iVMS-4200 export, add an optional employee roster, then review the processed results.">
      <div className="page-stack">
        <Stepper uploaded={!!uploadResult} rosterReady={!!rosterResult} processed={!!processed}/>
        {error && <div className="ui-alert ui-alert-error" role="alert">{error}</div>}
        {storageNotice && <div className="ui-alert ui-alert-info" role="status">{storageNotice}</div>}

        <Card title="Attendance export" subtitle="CSV, Excel (.xlsx, .xls), or PDF · up to 50 MB">
          <div className={`upload-drop${dragging ? ' dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
            <span className="drop-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg></span>
            <strong className="drop-title">{attendanceFile?.name || 'Drop your attendance file here'}</strong>
            <span className="file-meta">{attendanceFile ? `${formatBytes(attendanceFile.size)} · Ready to upload` : 'or choose a file from your device'}</span>
            <input ref={attendanceInput} className="visually-hidden" type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={(event) => selectAttendance(event.target.files?.[0])} aria-label="Choose attendance export" />
            <div className="toolbar-actions" style={{ marginTop: 13 }}>
              <Button variant="outline" size="sm" onClick={openAttendancePicker}>Choose file</Button>
              <Button size="sm" onClick={handleUpload} disabled={!attendanceFile || uploading} loading={uploading}>{uploading ? 'Uploading…' : uploadResult ? 'Upload another file' : 'Upload attendance file'}</Button>
            </div>
          </div>
          {uploadResult && <div className="ui-alert ui-alert-success" role="status" style={{ marginTop: 12 }}><strong>Import complete.</strong> {uploadResult.message}<br/><span className="file-meta">Detected as {uploadResult.format.toUpperCase()} · {uploadResult.total_records} rows · {uploadResult.events_found} attendance events</span></div>}
        </Card>

        <Card title="Employee roster" subtitle="Optional · include employees who have no fingerprint records">
          <div className="roster-controls">
            <Input type="file" label="Roster file" accept=".csv,.xlsx" onChange={(event) => { const file = event.target.files?.[0] || null; if (file && file.size > 10 * 1024 * 1024) { setError('The roster is larger than the 10 MB limit.'); setRosterFile(null); return } setError(null); setRosterFile(file) }} helperText={rosterFile ? `${rosterFile.name} · ${formatBytes(rosterFile.size)}` : 'CSV or .xlsx workbook with employee IDs and names · up to 10 MB.'}/>
            <Button variant="outline" onClick={handleRosterUpload} disabled={!rosterFile || uploading} loading={uploading}>{uploading ? 'Uploading…' : 'Upload roster'}</Button>
          </div>
          {rosterResult && <p className="upload-feedback success" role="status">{rosterResult.message}</p>}
        </Card>

        {uploadResult && <Card title="Process attendance" subtitle="Processing applies the currently configured attendance rules to the uploaded events.">
          <div className="toolbar-actions">
            <Button onClick={handleProcess} loading={processing} disabled={processing}>{processing ? 'Processing…' : processed ? 'Process again' : 'Process attendance'}</Button>
            {processed && <Button variant="outline" onClick={() => router.push('/results')}>Review results</Button>}
          </div>
          {processed && <p className="upload-feedback success" role="status">Processing complete: {processed.summary.total_days} employee-days created; {processed.processed_days.filter((day) => day.flagged_for_review).length} require review.</p>}
        </Card>}
      </div>
    </Layout>
  )
}
