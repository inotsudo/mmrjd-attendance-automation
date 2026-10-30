const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000'

export interface UploadResponse {
  success: true
  job_id: string
  filename: string
  format: string
  column_map: Record<string, number>
  total_records: number
  events_found: number
  message: string
}

export interface RosterResponse {
  success: true
  job_id: string
  filename: string
  employees: number
  message: string
}

export interface EventEvidence {
  event_type: string
  timestamp: string | null
  timestamp_valid: boolean
}

export interface AttendanceDay {
  employee_id: string
  employee_name: string
  date: string
  check_in: string
  check_out: string
  break_duration_minutes: number
  late_minutes: number
  very_late: boolean
  overtime_minutes: number
  status: string
  flagged_for_review: boolean
  punches_provisional: boolean
  notes: string
  event_evidence: EventEvidence[]
}

export interface ProcessResult {
  success: true
  job_id: string
  source_filename: string
  rules_version: string
  rules: AttendanceRules
  summary: {
    total_days: number
    present_days: number
    incomplete_or_no_events: number
    late_count: number
    very_late_count: number
    total_overtime_minutes: number
  }
  processed_days: AttendanceDay[]
}

export interface AttendanceRules {
  normal_start_time: string
  very_late_arrival_threshold: string
  overtime_threshold: string
}

export interface JobStatus {
  success: true
  job_id: string
  processed: boolean
  processed_rules_version: string | null
  current_rules_version: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`The server returned an invalid ${label} response.`)
  return value
}

function requireSuccess(value: unknown, label: string): Record<string, unknown> {
  const body = requireObject(value, label)
  if (body.success !== true) throw new Error(`The server did not confirm ${label} success.`)
  return body
}

function validateUpload(value: unknown): UploadResponse {
  const body = requireSuccess(value, 'upload')
  if (typeof body.job_id !== 'string' || typeof body.filename !== 'string' || typeof body.format !== 'string'
    || !isObject(body.column_map) || typeof body.total_records !== 'number' || typeof body.events_found !== 'number'
    || typeof body.message !== 'string') throw new Error('The server returned an incomplete upload response.')
  return body as unknown as UploadResponse
}

function validateRoster(value: unknown, expectedJobId?: string): RosterResponse {
  const body = requireSuccess(value, 'roster upload')
  if (typeof body.job_id !== 'string' || typeof body.filename !== 'string' || typeof body.employees !== 'number'
    || typeof body.message !== 'string') throw new Error('The server returned an incomplete roster response.')
  if (expectedJobId && body.job_id !== expectedJobId) throw new Error('The roster response belongs to a different upload job.')
  return body as unknown as RosterResponse
}

function validateProcess(value: unknown): ProcessResult {
  const body = requireSuccess(value, 'processing')
  const summary = requireObject(body.summary, 'processing summary')
  const rules = requireObject(body.rules, 'rules snapshot')
  if (typeof body.job_id !== 'string' || typeof body.source_filename !== 'string' || typeof body.rules_version !== 'string'
    || !Array.isArray(body.processed_days)
    || !['total_days', 'present_days', 'incomplete_or_no_events', 'late_count', 'very_late_count', 'total_overtime_minutes'].every((key) => typeof summary[key] === 'number')
    || !['normal_start_time', 'very_late_arrival_threshold', 'overtime_threshold'].every((key) => typeof rules[key] === 'string')) {
    throw new Error('The server returned an incomplete processing response.')
  }
  for (const day of body.processed_days) {
    if (!isObject(day) || typeof day.employee_id !== 'string' || typeof day.employee_name !== 'string'
      || typeof day.date !== 'string' || typeof day.check_in !== 'string' || typeof day.check_out !== 'string'
      || typeof day.status !== 'string' || typeof day.flagged_for_review !== 'boolean' || typeof day.notes !== 'string'
      || typeof day.punches_provisional !== 'boolean' || !Array.isArray(day.event_evidence)) throw new Error('The server returned a malformed attendance record.')
    for (const event of day.event_evidence) {
      if (!isObject(event) || typeof event.event_type !== 'string'
        || (event.timestamp !== null && typeof event.timestamp !== 'string') || typeof event.timestamp_valid !== 'boolean') throw new Error('The server returned malformed source event evidence.')
    }
  }
  return body as unknown as ProcessResult
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.text().catch(() => '')
  if (body) {
    try {
      const parsed = JSON.parse(body)
      const message = parsed.detail || parsed.message || body
      if (typeof message === 'string') return new Error(message)
      if (Array.isArray(message)) return new Error(message.map((item) => item.msg || JSON.stringify(item)).join(', '))
    } catch {
      return new Error(body)
    }
  }
  return new Error(`${fallback} (${response.status})`)
}

async function fetchWithTimeout<T>(path: string, options: RequestInit, timeoutMs: number, validate: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const callerSignal = options.signal
  const abortFromCaller = () => controller.abort()
  if (callerSignal?.aborted) controller.abort()
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response: Response
    try {
      response = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(callerSignal?.aborted ? 'Request cancelled.' : 'The request timed out. Check the backend connection and try again.')
      }
      throw new Error('Could not reach the backend. Check that the local API is running and try again.')
    }
    try {
      return await validate(response)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(callerSignal?.aborted ? 'Request cancelled.' : 'The request timed out. Check the backend connection and try again.')
      }
      throw error
    }
  } finally {
    window.clearTimeout(timeout)
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}, validate: (value: unknown) => T): Promise<T> {
  return fetchWithTimeout(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  }, 30_000, async (response) => {
    if (!response.ok) throw await responseError(response, 'API request failed')
    let body: unknown
    try { body = await response.json() } catch { throw new Error('The server returned invalid JSON.') }
    return validate(body)
  })
}

async function uploadRequest<T>(path: string, file: File, validate: (value: unknown) => T, jobId?: string, signal?: AbortSignal): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  if (jobId) form.append('job_id', jobId)
  return fetchWithTimeout(path, { method: 'POST', body: form, signal }, 120_000, async (response) => {
    if (!response.ok) throw await responseError(response, 'Upload failed')
    let body: unknown
    try { body = await response.json() } catch { throw new Error('The server returned invalid JSON after upload.') }
    return validate(body)
  })
}

function validateExport(value: unknown, expected: { job_id: string; rules_version: string }): { filename: string; data: string } {
  const body = requireSuccess(value, 'export')
  if (typeof body.filename !== 'string' || typeof body.data !== 'string' || body.data.length === 0
    || body.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)) {
    throw new Error('The server returned an invalid export file.')
  }
  if (body.job_id !== expected.job_id || body.rules_version !== expected.rules_version) {
    throw new Error('The export response does not match the selected upload and rules version.')
  }
  return body as { filename: string; data: string }
}

function validateRules(value: unknown): { rules: AttendanceRules; rules_version: string } {
  const body = requireSuccess(value, 'rules update')
  const rules = requireObject(body.rules, 'rules')
  if (typeof body.rules_version !== 'string'
    || !['normal_start_time', 'very_late_arrival_threshold', 'overtime_threshold'].every((key) => typeof rules[key] === 'string')) {
    throw new Error('The server returned incomplete effective rules.')
  }
  return { rules: rules as unknown as AttendanceRules, rules_version: body.rules_version }
}

function validateJobStatus(value: unknown, expectedJobId: string): JobStatus {
  const body = requireSuccess(value, 'job status')
  if (typeof body.job_id !== 'string' || body.job_id !== expectedJobId
    || typeof body.processed !== 'boolean'
    || (body.processed_rules_version !== null && typeof body.processed_rules_version !== 'string')
    || typeof body.current_rules_version !== 'string') {
    throw new Error('The server returned an invalid or mismatched job status.')
  }
  if (body.processed && !body.processed_rules_version) throw new Error('The server returned incomplete job status metadata.')
  return body as unknown as JobStatus
}

export const api = {
  health: (signal?: AbortSignal) => apiRequest('/api/health', { signal }, (value) => {
    const body = requireObject(value, 'health')
    if (typeof body.status !== 'string') throw new Error('The server returned an invalid health response.')
    return { status: body.status }
  }),
  getJobStatus: (jobId: string, signal?: AbortSignal) => apiRequest(`/api/jobs/${encodeURIComponent(jobId)}/status`, { signal }, (value) => validateJobStatus(value, jobId)),
  uploadFile: (file: File, signal?: AbortSignal) => uploadRequest('/api/upload', file, validateUpload, undefined, signal),
  uploadRoster: (jobId: string, file: File, signal?: AbortSignal) => uploadRequest('/api/roster', file, (value) => validateRoster(value, jobId), jobId, signal),
  processAttendance: (jobId: string, signal?: AbortSignal) => apiRequest('/api/process', { method: 'POST', body: JSON.stringify({ job_id: jobId }), signal }, (value) => {
    const result = validateProcess(value)
    if (result.job_id !== jobId) throw new Error('The processing response belongs to a different upload job.')
    return result
  }),
  exportExcel: (body: { job_id: string; rules_version: string }, signal?: AbortSignal) => apiRequest('/api/export/excel', { method: 'POST', body: JSON.stringify(body), signal }, (value) => validateExport(value, body)),
  exportPdf: (body: { job_id: string; rules_version: string }, signal?: AbortSignal) => apiRequest('/api/export/pdf', { method: 'POST', body: JSON.stringify(body), signal }, (value) => validateExport(value, body)),
  getRules: (signal?: AbortSignal) => apiRequest('/api/rules', { signal }, (value) => {
    const body = requireObject(value, 'rules')
    const rules = requireObject(body.effective_rules, 'effective rules')
    if (typeof body.rules_version !== 'string'
      || !['normal_start_time', 'very_late_arrival_threshold', 'overtime_threshold'].every((key) => typeof rules[key] === 'string')) {
      throw new Error('The server returned incomplete effective rules.')
    }
    return { rules: rules as unknown as AttendanceRules, rules_version: body.rules_version, unresolved: body.unresolved }
  }),
  updateRules: (rules: AttendanceRules, signal?: AbortSignal) => apiRequest('/api/rules', { method: 'POST', body: JSON.stringify(rules), signal }, validateRules),
}
