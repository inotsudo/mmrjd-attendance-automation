import { JobStatus, ProcessResult, UploadResponse } from './api'

export type ResultsFreshness = 'current' | 'stale' | 'unavailable' | 'missing'

export function checkResultsFreshness(upload: UploadResponse | null, result: ProcessResult | null, status: JobStatus | null, unavailable = false): ResultsFreshness {
  if (!upload?.job_id || !result) return 'missing'
  if (result.job_id !== upload.job_id) return 'stale'
  if (unavailable || !status) return 'unavailable'
  if (status.job_id !== upload.job_id || !status.processed
    || status.processed_rules_version !== result.rules_version
    || status.current_rules_version !== result.rules_version) return 'stale'
  return 'current'
}
