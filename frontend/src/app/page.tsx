'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/ui/Layout'
import { api, JobStatus } from '@/lib/api'
import { DashboardExportRecord, getDashboardStatus, parseDashboardSession } from '@/lib/dashboard-status'
import { parseExportHistory } from '@/lib/session-state'

interface ImportSummary {
  filename: string
  size: number
  uploadedAt: string
  format: string
  total_records: number
  events_found: number
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readHistoricalExports(): DashboardExportRecord[] {
  try { return parseExportHistory(sessionStorage.getItem('mm_export_history'), sessionStorage.getItem('mm_exported')) }
  catch { return [] }
}

function isImportSummary(value: unknown): value is ImportSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return typeof v.filename === 'string' && typeof v.size === 'number' && Number.isFinite(v.size)
    && typeof v.uploadedAt === 'string' && !Number.isNaN(Date.parse(v.uploadedAt))
    && typeof v.format === 'string' && typeof v.total_records === 'number' && typeof v.events_found === 'number'
}

function LineIcon({ name }: { name: 'upload' | 'file' | 'people' | 'alert' }) {
  const content = {
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></>,
    file: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z"/><path d="M13 3v7h7m-8 7v-5m0 0-2 2m2-2 2 2"/></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></>,
  }[name]
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">{content}</svg>
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [storageNotice, setStorageNotice] = useState('')
  const [stats, setStats] = useState<{ employees: number | null; records: number | null; review: number | null; report: string; historicalExport: string | null } | null>(null)
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null)

  useEffect(() => {
    let active = true
    let inFlight = false
    let lastCheck = 0
    const refresh = (force = false) => {
      if (inFlight || (!force && Date.now() - lastCheck < 2500)) return
      inFlight = true
      lastCheck = Date.now()
    const exports = readHistoricalExports()
    try {
      const [saved, savedUpload, savedMeta] = ['mm_processed', 'mm_upload_result', 'mm_upload_meta'].map((key) => sessionStorage.getItem(key))
      const processedSession = parseDashboardSession(saved)
      const uploadSession = parseDashboardSession(savedUpload)
      const metadataSession = parseDashboardSession(savedMeta)
      if (!processedSession.valid || !uploadSession.valid || !metadataSession.valid) throw new Error('Invalid saved dashboard state')
      const processed = processedSession.value as {
        job_id?: unknown
        rules_version?: unknown
        processed_days?: Array<{ employee_id?: string; flagged_for_review?: boolean }>
      } | null
      const upload = uploadSession.value as { job_id?: unknown; total_records?: unknown } | null
      if (isImportSummary(metadataSession.value)) { if (active) setLastImport(metadataSession.value) }
      const currentJobId = typeof upload?.job_id === 'string' ? upload.job_id : null
      const base = {
        employees: null as number | null,
        records: typeof upload?.total_records === 'number' ? upload.total_records : null,
        review: null as number | null,
        report: 'Current status unknown',
        historicalExport: null as string | null,
      }
      const showSnapshot = (serverStatus: JobStatus | null) => {
        if (!active) return
        const status = getDashboardStatus({
          currentJobId,
          processedJobId: typeof processed?.job_id === 'string' ? processed.job_id : null,
          processedRulesVersion: typeof processed?.rules_version === 'string' ? processed.rules_version : null,
          currentRulesVersion: serverStatus?.current_rules_version ?? null,
          hasProcessedResult: !!processed,
          serverJobAvailable: serverStatus ? true : undefined,
          serverHasProcessedResult: serverStatus?.processed,
          serverProcessedRulesVersion: serverStatus?.processed_rules_version,
          exports,
        })
        const resultIsCurrent = status.resultIsCurrent && Array.isArray(processed?.processed_days)
        setStats({
          ...base,
          employees: resultIsCurrent ? new Set(processed.processed_days.map((day) => day.employee_id).filter(Boolean)).size : null,
          review: resultIsCurrent ? processed.processed_days.filter((day) => day.flagged_for_review).length : null,
          report: status.report,
          historicalExport: status.historicalExport,
        })
      }
      if (processed && currentJobId && typeof processed.rules_version === 'string') {
        void api.getJobStatus(currentJobId).then(showSnapshot).catch(() => showSnapshot(null)).finally(() => { inFlight = false })
      } else {
        showSnapshot(null)
        inFlight = false
      }
    } catch {
      if (!active) { inFlight = false; return }
      const status = getDashboardStatus({ hasProcessedResult: true, exports })
      setStats({ employees: null, records: null, review: null, report: status.report, historicalExport: status.historicalExport })
      inFlight = false
    }
    }
    refresh(true)
    const onFocus = () => refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  const selectFile = (next?: File) => {
    if (!next) return
    const extension = next.name.split('.').pop()?.toLowerCase()
    if (!extension || !['csv', 'xlsx', 'xls', 'pdf'].includes(extension)) {
      setError('Choose a CSV, Excel (.xlsx, .xls), or PDF attendance export.')
      return
    }
    if (next.size > 50 * 1024 * 1024) {
      setError('This file is larger than the 50 MB upload limit.')
      return
    }
    setFile(next)
    setMessage('')
    setError('')
  }

  const openFilePicker = () => {
    if (!inputRef.current) return
    inputRef.current.value = ''
    inputRef.current.click()
  }

  const upload = async () => {
    if (!file) { openFilePicker(); return }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.uploadFile(file)
      const metadata: ImportSummary = { filename: file.name, size: file.size, uploadedAt: new Date().toISOString(), format: result.format, total_records: result.total_records, events_found: result.events_found }
      setMessage(`${result.message || `${file.name} uploaded successfully.`} Job ${result.job_id} was created.`)
      setFile(null)
      setLastImport(metadata)
      setStats((current) => ({ employees: null, records: result.total_records, review: null, report: 'Not generated', historicalExport: current?.historicalExport || null }))
      try {
        sessionStorage.setItem('mm_upload_result', JSON.stringify(result))
        sessionStorage.setItem('mm_upload_meta', JSON.stringify(metadata))
        sessionStorage.removeItem('mm_processed')
        setStorageNotice('')
      } catch { setStorageNotice(`Upload succeeded as job ${result.job_id}, but browser storage failed. Keep this tab open and do not repeat the upload.`) }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <Layout>
      <div className="dashboard-content">
        <div className="dashboard-heading"><h1>Dashboard</h1><p>Your attendance operations at a glance.</p></div>
        <section className="upload-panel" aria-labelledby="upload-title">
          <div className="upload-panel-heading"><span className="accent-icon"><LineIcon name="upload"/></span><div><h2 id="upload-title">Upload attendance file</h2><p>Import an iVMS-4200 export to get started.</p></div></div>
          <div className={`dropzone${dragging ? ' dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files[0]) }}>
            <input ref={inputRef} className="visually-hidden" type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={(e) => selectFile(e.target.files?.[0])} aria-label="Choose attendance file" />
            <span className="drop-icon"><LineIcon name="file"/></span>
            <p className="drop-title">{file ? file.name : 'Drop your file here'}</p>
            <p className="drop-hint">{file ? 'Ready to upload' : 'Excel, CSV, or supported PDF'}</p>
            <div className="toolbar-actions">
              <button className="choose-button" type="button" onClick={() => file ? upload() : openFilePicker()} disabled={busy}>{busy ? 'Uploading…' : file ? 'Upload file' : 'Choose file'}</button>
              {file && !busy && <button className="text-button" type="button" onClick={openFilePicker}>Choose another</button>}
            </div>
          </div>
          {error && <p className="upload-feedback error" role="alert">{error}</p>}
          {storageNotice && <div className="ui-alert ui-alert-info" role="status">{storageNotice}</div>}
          {message && <p className="upload-feedback success" role="status">{message} <Link href="/upload">Continue to processing →</Link></p>}
        </section>

        <section className="stats-grid" aria-label="Attendance summary">
          <Link className="stat-card" href="/results"><span className="stat-icon violet"><LineIcon name="people"/></span><span className="stat-label">Employees processed</span><strong>{stats?.employees ?? '—'}</strong></Link>
          <Link className="stat-card" href="/upload"><span className="stat-icon violet"><LineIcon name="file"/></span><span className="stat-label">Source rows imported</span><strong>{stats?.records ?? '—'}</strong></Link>
          <Link className="stat-card" href="/results#review"><span className="stat-icon amber"><LineIcon name="alert"/></span><span className="stat-label">Need review</span><strong>{stats?.review ?? '—'}</strong></Link>
          <Link className="stat-card" href="/results#reports"><span className="stat-icon violet"><LineIcon name="file"/></span><span className="stat-label">Report status</span><strong className="report-status">{stats?.report ?? 'Checking current status…'}</strong>{stats?.historicalExport && <small className="report-history">{stats.historicalExport}</small>}</Link>
        </section>

        <section className="import-card" aria-labelledby="current-import-title">
          <div className="import-card-heading"><div><h2 id="current-import-title">Current import</h2><p>Latest attendance file in this session</p></div><Link href="/upload" className="text-link">Open upload workspace <span aria-hidden="true">→</span></Link></div>
          {lastImport ? <div className="import-file-row">
            <span className="import-file-icon"><LineIcon name="file"/></span>
            <div className="import-file-main"><strong title={lastImport.filename}>{lastImport.filename}</strong><span>{lastImport.format.toUpperCase()} file · {formatFileSize(lastImport.size)} · Imported {new Date(lastImport.uploadedAt).toLocaleString()}</span></div>
            <div className="import-file-stats"><span><strong>{lastImport.total_records}</strong> source rows</span><span><strong>{lastImport.events_found}</strong> attendance events</span></div>
          </div> : <div className="import-empty"><span className="import-file-icon"><LineIcon name="file"/></span><div><strong>No attendance file imported yet</strong><p>Upload an iVMS-4200 export to start a new report.</p></div><Link href="/upload" className="text-link">Upload a file <span aria-hidden="true">→</span></Link></div>}
        </section>
      </div>
    </Layout>
  )
}
