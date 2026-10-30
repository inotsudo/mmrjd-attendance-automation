'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, AttendanceDay, ProcessResult } from '@/lib/api'
import Layout from '@/components/ui/Layout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FlagBadge, StatusBadge } from '@/components/ui/Badge'
import { parseStoredProcess, parseStoredUpload, appendExportHistory } from '@/lib/session-state'
import { checkResultsFreshness } from '@/lib/results-freshness'

type ViewFilter = 'all' | 'review' | 'incomplete' | 'complete'

function downloadFile(data: string, filename: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ResultsPage() {
  const [data, setData] = useState<ProcessResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ViewFilter>('all')
  const [sortNewestFirst, setSortNewestFirst] = useState(true)
  const [page, setPage] = useState(1)
  const [jobId, setJobId] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [freshness, setFreshness] = useState<'checking' | 'current' | 'stale' | 'unavailable' | 'missing'>('checking')
  const [storageNotice, setStorageNotice] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    try {
      const upload = parseStoredUpload(sessionStorage.getItem('mm_upload_result'))
      const result = parseStoredProcess(sessionStorage.getItem('mm_processed'))
      if (upload?.job_id) setJobId(upload.job_id)
      if (result && upload && result.job_id === upload.job_id) {
        setData(result)
        void api.getJobStatus(upload.job_id).then((status) => {
          const state = checkResultsFreshness(upload, result, status)
          setFreshness(state); setStale(state !== 'current')
        }).catch(() => { setFreshness('unavailable'); setStale(true) })
      } else {
        setFreshness(upload ? 'missing' : 'missing')
        if (result) setError('Saved results do not match the selected upload. Select or upload the correct job and process it explicitly.')
      }
    } catch {
      setFreshness('missing')
      setError('Saved browser state was invalid. Select or upload a job again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const processSelectedJob = async () => {
    if (!jobId) return
    setProcessing(true)
    setError(null)
    setFeedback(null)
    setStorageNotice(null)
    try {
      const result = await api.processAttendance(jobId)
      setData(result)
      setFreshness('checking'); setStale(true)
      try { sessionStorage.setItem('mm_processed', JSON.stringify(result)) }
      catch { setStorageNotice('Processing succeeded, but this tab could not save the result locally. Keep this page open and use Review results while available.') }
      try {
        const status = await api.getJobStatus(jobId)
        const upload = parseStoredUpload(sessionStorage.getItem('mm_upload_result'))
        const state = checkResultsFreshness(upload, result, status)
        setFreshness(state); setStale(state !== 'current')
      } catch {
        setFreshness('unavailable'); setStale(true)
        setStorageNotice('Processing succeeded, but current job status could not be verified. Exports remain disabled until the backend confirms the result.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attendance processing failed.')
    } finally {
      setProcessing(false)
    }
  }

  const handleExport = async (type: 'excel' | 'pdf') => {
    if (!data || freshness !== 'current' || stale || !jobId) return
    setExporting(type)
    setFeedback(null)
    setError(null)
    setStorageNotice(null)
    try {
      const result = type === 'excel'
        ? await api.exportExcel({ job_id: jobId, rules_version: data.rules_version })
        : await api.exportPdf({ job_id: jobId, rules_version: data.rules_version })
      downloadFile(result.data, result.filename, type === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf')
      const exported = { type, filename: result.filename, at: new Date().toISOString(), job_id: jobId, rules_version: data.rules_version }
      try {
        const history = appendExportHistory(sessionStorage.getItem('mm_export_history'), sessionStorage.getItem('mm_exported'), exported)
        sessionStorage.setItem('mm_export_history', JSON.stringify(history))
        sessionStorage.setItem('mm_exported', JSON.stringify(exported))
        setStorageNotice(null)
      } catch {
        setStorageNotice('The report download was initiated, but this tab could not save export history.')
      }
      setFeedback(`${type.toUpperCase()} download was requested: ${result.filename}. The browser will determine whether it is saved.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : `The ${type.toUpperCase()} report could not be generated.`)
    } finally {
      setExporting(null)
    }
  }

  const visibleDays = useMemo(() => {
    if (!data) return []
    const query = search.trim().toLowerCase()
    return data.processed_days
      .filter((day) => {
        const matchesFilter = filter === 'all'
          || (filter === 'review' && day.flagged_for_review)
          || (filter === 'incomplete' && day.status !== 'complete')
          || (filter === 'complete' && day.status === 'complete')
        const matchesQuery = !query || [day.employee_id, day.employee_name, day.date, day.check_in, day.check_out, day.notes].some((value) => value?.toLowerCase().includes(query))
        return matchesFilter && matchesQuery
      })
      .sort((left, right) => sortNewestFirst ? right.date.localeCompare(left.date) : left.date.localeCompare(right.date))
  }, [data, filter, search, sortNewestFirst])
  useEffect(() => { setPage(1) }, [filter, search])
  const pageSize = 25
  const pageCount = Math.max(1, Math.ceil(visibleDays.length / pageSize))
  const pageDays = visibleDays.slice((page - 1) * pageSize, page * pageSize)

  if (loading) return <Layout title="Attendance results" subtitle="Loading processed attendance data."><div className="ui-empty"><div className="ui-spinner"/><p>Loading attendance results…</p></div></Layout>

  if (!data) return <Layout title="Attendance results" subtitle="Review attendance records and generate reports.">
    <div className="ui-card"><div className="ui-empty"><strong>No processed attendance is available</strong><p>{error || (jobId ? 'This upload has not been processed yet.' : 'Select an upload job and process it to see records here.')}</p><div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 10 }}>
      {jobId && <Button onClick={() => void processSelectedJob()} loading={processing} disabled={processing}>Process selected upload</Button>}
      <Button asChild variant="outline"><Link href="/upload">Upload attendance file</Link></Button></div></div></div>
  </Layout>

  const { summary, processed_days: processedDays } = data
  const canExport = freshness === 'current' && !stale
  const flaggedCount = processedDays.filter((day) => day.flagged_for_review).length
  const employeeCount = new Set(processedDays.map((day) => day.employee_id).filter(Boolean)).size

  return (
    <Layout title="Attendance results" subtitle="Review processed attendance, investigate flagged records, and export reports.">
      <div className="page-stack">
        {!canExport && <div className="ui-alert ui-alert-info" role="status"><strong>{freshness === 'unavailable' ? 'Current status could not be verified.' : freshness === 'checking' ? 'Checking saved result status…' : freshness === 'stale' ? 'This result is stale.' : 'This result is not confirmed.'}</strong> {freshness === 'unavailable' ? 'Cached rows are shown for reference only. Start the local backend and reload this page; exports remain disabled.' : 'Exports are disabled until the server confirms this job and rules version. Return to Upload and explicitly process the selected upload to refresh it.'} {jobId && freshness === 'stale' && <Button size="sm" onClick={() => void processSelectedJob()} loading={processing} disabled={processing}>Reprocess selected upload</Button>}</div>}
        <div className="ui-alert ui-alert-info"><strong>Cached result:</strong> {data.source_filename || 'Selected upload'} · job {data.job_id} · rules version {data.rules_version}. {canExport ? 'Server status confirmed for this page load.' : 'Do not treat this snapshot as current until verified.'}</div>
        <section className="summary-grid" aria-label="Processed attendance summary">
          <div className="summary-card"><span className="summary-card-label">Employee-days</span><strong className="summary-card-value">{summary.total_days}</strong></div>
          <div className="summary-card"><span className="summary-card-label">Employees</span><strong className="summary-card-value">{employeeCount}</strong></div>
          <div className="summary-card"><span className="summary-card-label">Complete</span><strong className="summary-card-value">{summary.present_days}</strong></div>
          <div className="summary-card summary-card-warning"><span className="summary-card-label">Late arrivals</span><strong className="summary-card-value">{summary.late_count}</strong></div>
          <div className="summary-card summary-card-danger"><span className="summary-card-label">Very late</span><strong className="summary-card-value">{summary.very_late_count}</strong></div>
          <div className="summary-card"><span className="summary-card-label">Total overtime</span><strong className="summary-card-value">{summary.total_overtime_minutes} min</strong></div>
        </section>

        <Card id="reports" title="Reports and exports" subtitle="Generate a report from the currently processed attendance data.">
          <div className="toolbar-actions">
            <Button onClick={() => handleExport('excel')} loading={exporting === 'excel'} disabled={exporting !== null || !canExport}>Download Excel</Button>
            <Button variant="outline" onClick={() => handleExport('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null || !canExport}>Download PDF</Button>
          </div>
          {storageNotice && <p className="upload-feedback error" role="status">{storageNotice}</p>}
          {feedback && <p className="upload-feedback success" role="status">{feedback}</p>}
          {error && <p className="upload-feedback error" role="alert">{error}</p>}
        </Card>

        <Card id="review" title="Attendance records" subtitle={`${visibleDays.length} of ${processedDays.length} records shown${flaggedCount ? ` · ${flaggedCount} flagged for review` : ''}`}>
          <div className="results-tools" style={{ marginBottom: 14 }}>
            <Input label="Search records" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Employee, ID, date, or note" />
            <label className="ui-input-wrap"><span className="ui-label">Show</span><select className="ui-input" value={filter} onChange={(event) => setFilter(event.target.value as ViewFilter)}><option value="all">All records</option><option value="review">Needs review</option><option value="incomplete">Incomplete or no events</option><option value="complete">Complete only</option></select></label>
            <label className="ui-input-wrap"><span className="ui-label">Date order</span><select className="ui-input" value={sortNewestFirst ? 'newest' : 'oldest'} onChange={(event) => setSortNewestFirst(event.target.value === 'newest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
          </div>

          {processedDays.length === 0 ? <div className="ui-empty"><strong>No attendance records</strong><p>Upload an attendance export to create report rows.</p></div>
            : visibleDays.length === 0 ? <div className="ui-empty"><strong>No matching records</strong><p>Try another search or filter.</p></div>
              : <><div className="ui-table-wrap"><table className="ui-table">
                <thead><tr><th>Employee ID</th><th>Employee</th><th>Date</th><th>Check-in</th><th>Check-out</th><th>Late (min)</th><th>Overtime (min)</th><th>Status</th><th>Review</th><th>Notes</th></tr></thead>
                <tbody>{pageDays.map((day: AttendanceDay) => <tr key={`${day.employee_id}-${day.date}`} className={day.flagged_for_review ? 'row-review' : undefined}>
                  <td>{day.employee_id || '—'}</td><td>{day.employee_name || '—'}</td><td>{day.date || '—'}</td><td>{day.check_in ? `${day.punches_provisional ? 'Provisional: ' : ''}${day.check_in}` : 'Unknown'}</td><td>{day.check_out ? `${day.punches_provisional ? 'Provisional: ' : ''}${day.check_out}` : 'Unknown'}</td>
                  <td>{day.late_minutes}</td><td>{day.overtime_minutes}</td><td><StatusBadge status={day.status}/></td><td><FlagBadge flagged={day.flagged_for_review}/></td><td className="note-cell" title={day.notes || undefined}>{day.notes || '—'}{day.event_evidence.length > 0 && <details><summary>Source events</summary><ul>{day.event_evidence.map((event, index) => <li key={`${event.event_type}-${event.timestamp}-${index}`}>{event.event_type || 'Unknown type'} · {event.timestamp || 'Missing timestamp'}{event.timestamp_valid ? '' : ' (invalid)'}</li>)}</ul></details>}</td>
                </tr>)}</tbody>
              </table></div><div className="results-pagination"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, visibleDays.length)} of {visibleDays.length}</span><div><Button size="sm" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</Button><span className="page-count">Page {page} of {pageCount}</span><Button size="sm" variant="outline" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Next</Button></div></div></>}
        </Card>

        {flaggedCount > 0 && <div className="ui-alert ui-alert-info"><strong id="review-note">Human review required for {flaggedCount} record{flaggedCount === 1 ? '' : 's'}.</strong> The API marks uncertain or incomplete records for review but does not provide an action to resolve them. Confirm these against the source export and HR records.</div>}
      </div>
    </Layout>
  )
}
