import { ProcessResult, UploadResponse } from './api'

export function parseStoredUpload(value: string | null): UploadResponse | null {
  if (!value) return null
  try {
    const item: unknown = JSON.parse(value)
    if (!item || typeof item !== 'object') return null
    const v = item as Record<string, unknown>
    if (v.success !== true || typeof v.job_id !== 'string' || !v.job_id
      || typeof v.filename !== 'string' || typeof v.format !== 'string'
      || typeof v.total_records !== 'number' || typeof v.events_found !== 'number'
      || typeof v.message !== 'string' || !v.column_map || typeof v.column_map !== 'object') return null
    return item as UploadResponse
  } catch { return null }
}

export function parseStoredProcess(value: string | null): ProcessResult | null {
  if (!value) return null
  try {
    const item: unknown = JSON.parse(value)
    if (!item || typeof item !== 'object') return null
    const v = item as Record<string, unknown>
    if (v.success !== true || typeof v.job_id !== 'string' || typeof v.rules_version !== 'string'
      || !v.summary || typeof v.summary !== 'object' || !Array.isArray(v.processed_days)) return null
    const summary = v.summary as Record<string, unknown>
    if (!['total_days', 'present_days', 'incomplete_or_no_events', 'late_count', 'very_late_count', 'total_overtime_minutes'].every((key) => typeof summary[key] === 'number')) return null
    if (v.processed_days.some((day) => {
      if (!day || typeof day !== 'object' || Array.isArray(day)) return true
      const record = day as Record<string, unknown>
      return typeof record.employee_id !== 'string' || typeof record.employee_name !== 'string'
        || typeof record.date !== 'string' || typeof record.check_in !== 'string' || typeof record.check_out !== 'string'
        || typeof record.status !== 'string' || typeof record.flagged_for_review !== 'boolean'
        || typeof record.punches_provisional !== 'boolean' || typeof record.notes !== 'string'
        || !Array.isArray(record.event_evidence)
    })) return null
    return item as ProcessResult
  } catch { return null }
}

export interface ExportHistoryRecord {
  type: 'excel' | 'pdf'
  filename: string
  at: string
  job_id?: string
  rules_version?: string
}

export const EXPORT_HISTORY_LIMIT = 20

function validExport(value: unknown): ExportHistoryRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if ((v.type !== 'excel' && v.type !== 'pdf') || typeof v.filename !== 'string' || typeof v.at !== 'string') return null
  return { type: v.type, filename: v.filename, at: v.at,
    ...(typeof v.job_id === 'string' ? { job_id: v.job_id } : {}),
    ...(typeof v.rules_version === 'string' ? { rules_version: v.rules_version } : {}) }
}

export function parseExportHistory(historyRaw: string | null, legacyRaw: string | null): ExportHistoryRecord[] {
  const history: ExportHistoryRecord[] = []
  if (historyRaw) {
    try {
      const parsed: unknown = JSON.parse(historyRaw)
      if (Array.isArray(parsed)) for (const value of parsed) {
        const record = validExport(value)
        if (record) history.push(record)
      }
    } catch { /* recover valid legacy data below */ }
  }
  if (legacyRaw) {
    try {
      const record = validExport(JSON.parse(legacyRaw))
      if (record && !history.some((item) => item.at === record.at && item.filename === record.filename)) history.push(record)
    } catch { /* malformed legacy value cannot safely be migrated */ }
  }
  return history.slice(-EXPORT_HISTORY_LIMIT)
}

export function appendExportHistory(historyRaw: string | null, legacyRaw: string | null, record: ExportHistoryRecord): ExportHistoryRecord[] {
  return [...parseExportHistory(historyRaw, legacyRaw), record].slice(-EXPORT_HISTORY_LIMIT)
}
