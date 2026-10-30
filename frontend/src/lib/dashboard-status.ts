export interface DashboardExportRecord {
  filename?: string
  at?: string
  job_id?: string
  rules_version?: string
}

export interface DashboardStatusInput {
  currentJobId?: string | null
  processedJobId?: string | null
  processedRulesVersion?: string | null
  currentRulesVersion?: string | null
  hasProcessedResult: boolean
  serverJobAvailable?: boolean
  serverHasProcessedResult?: boolean
  serverProcessedRulesVersion?: string | null
  exports: DashboardExportRecord[]
}

export interface DashboardStatus {
  report: string
  historicalExport: string | null
  resultIsCurrent: boolean
}

export function parseDashboardSession(value: string | null): { valid: boolean; value: unknown } {
  if (value === null) return { valid: true, value: null }
  try {
    return { valid: true, value: JSON.parse(value) as unknown }
  } catch {
    return { valid: false, value: null }
  }
}

export function getDashboardStatus(input: DashboardStatusInput): DashboardStatus {
  const latest = [...input.exports].sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0]
  const historicalExport = latest
    ? `Last export: ${latest.filename || 'report'}${latest.at ? ` · ${latest.at}` : ''} (history)`
    : null

  if (!input.hasProcessedResult) {
    return { report: latest ? 'No current result' : 'Not generated', historicalExport, resultIsCurrent: false }
  }
  if (!input.currentJobId || !input.processedJobId || !input.processedRulesVersion || !input.currentRulesVersion) {
    return { report: 'Current status unknown', historicalExport, resultIsCurrent: false }
  }
  if (input.serverJobAvailable === false) {
    return { report: 'Job unavailable · status unknown', historicalExport, resultIsCurrent: false }
  }
  if (input.serverJobAvailable === true
    && (!input.serverHasProcessedResult || input.serverProcessedRulesVersion !== input.processedRulesVersion)) {
    return { report: 'Stale session data', historicalExport, resultIsCurrent: false }
  }
  if (input.currentJobId !== input.processedJobId) {
    return { report: 'Stale session data', historicalExport, resultIsCurrent: false }
  }
  if (input.processedRulesVersion !== input.currentRulesVersion) {
    return { report: 'Stale · reprocess required', historicalExport, resultIsCurrent: false }
  }

  const currentExport = input.exports.some((record) =>
    record.job_id === input.currentJobId && record.rules_version === input.currentRulesVersion,
  )
  return {
    report: currentExport ? 'Export request recorded in this tab' : 'Ready to request export',
    historicalExport,
    resultIsCurrent: true,
  }
}
