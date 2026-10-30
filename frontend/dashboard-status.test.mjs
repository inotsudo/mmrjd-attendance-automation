import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('./src/lib/dashboard-status.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const { getDashboardStatus, parseDashboardSession } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

const base = {
  currentJobId: 'job-1',
  processedJobId: 'job-1',
  processedRulesVersion: 'rules-1',
  currentRulesVersion: 'rules-1',
  hasProcessedResult: true,
  serverJobAvailable: true,
  serverHasProcessedResult: true,
  serverProcessedRulesVersion: 'rules-1',
  exports: [],
}

test('marks a processed result stale when rules changed after processing', () => {
  const result = getDashboardStatus({ ...base, currentRulesVersion: 'rules-2' })
  assert.equal(result.report, 'Stale · reprocess required')
  assert.equal(result.resultIsCurrent, false)
})

test('preserves a prior export as history when rules changed after export', () => {
  const result = getDashboardStatus({
    ...base,
    currentRulesVersion: 'rules-2',
    exports: [{ job_id: 'job-1', rules_version: 'rules-1', filename: 'attendance.xlsx', at: '2026-10-29T10:00:00Z' }],
  })
  assert.equal(result.report, 'Stale · reprocess required')
  assert.match(result.historicalExport || '', /attendance.xlsx.*history/)
})

test('reports unknown current status when job metadata is missing', () => {
  const result = getDashboardStatus({ ...base, currentJobId: null, exports: [] })
  assert.equal(result.report, 'Current status unknown')
})

test('reports unknown current status when rules-version metadata is missing and preserves legacy export history', () => {
  const result = getDashboardStatus({
    ...base,
    processedRulesVersion: null,
    exports: [{ filename: 'legacy.pdf' }],
  })
  assert.equal(result.report, 'Current status unknown')
  assert.match(result.historicalExport || '', /legacy.pdf.*history/)
})

test('rejects stale session data belonging to a different job', () => {
  const result = getDashboardStatus({ ...base, processedJobId: 'job-old' })
  assert.equal(result.report, 'Stale session data')
  assert.equal(result.resultIsCurrent, false)
})

test('does not call cached data current when the server no longer has the job', () => {
  const result = getDashboardStatus({
    ...base,
    serverJobAvailable: false,
    exports: [{ job_id: 'job-1', rules_version: 'rules-1', filename: 'old.xlsx' }],
  })
  assert.equal(result.report, 'Job unavailable · status unknown')
  assert.match(result.historicalExport || '', /old.xlsx.*history/)
})

test('rejects a session result that does not match the server-saved result version', () => {
  const result = getDashboardStatus({ ...base, serverProcessedRulesVersion: 'rules-old' })
  assert.equal(result.report, 'Stale session data')
})

test('marks a result current only when job and rules versions match', () => {
  const result = getDashboardStatus({
    ...base,
    exports: [{ job_id: 'job-1', rules_version: 'rules-1', filename: 'attendance.xlsx', at: '2026-10-29T10:00:00Z' }],
  })
  assert.equal(result.report, 'Export request recorded in this tab')
  assert.equal(result.resultIsCurrent, true)
})

test('current processed data without a matching export is ready, with no current-result claim when absent', () => {
  assert.equal(getDashboardStatus(base).report, 'Ready to request export')
  assert.equal(getDashboardStatus({ hasProcessedResult: false, exports: [] }).report, 'Not generated')
})

test('treats missing and malformed saved session JSON distinctly', () => {
  assert.deepEqual(parseDashboardSession(null), { valid: true, value: null })
  assert.deepEqual(parseDashboardSession('{broken'), { valid: false, value: null })
})
