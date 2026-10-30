import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const apiSource = await readFile(new URL('./src/lib/api.ts', import.meta.url), 'utf8')
const compiledApi = ts.transpileModule(apiSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const { api } = await import(`data:text/javascript;base64,${Buffer.from(compiledApi).toString('base64')}`)

globalThis.window = { setTimeout, clearTimeout }

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
const syntheticFile = () => new File(['id,name\nSYN-1,Synthetic'], 'synthetic.csv', { type: 'text/csv' })

test.afterEach(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow })

test('rejects HTTP-success upload bodies unless success is explicitly true', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'rejected' }), { status: 200 })
  await assert.rejects(api.uploadFile(syntheticFile()), /did not confirm upload success/)
})

test('rejects incomplete processing response bodies', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 })
  await assert.rejects(api.processAttendance('123e4567-e89b-12d3-a456-426614174000'), /invalid processing summary response/)
})

test('rejects malformed export data instead of reporting a download', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, filename: 'report.xlsx', data: 'not base64!' }), { status: 200 })
  await assert.rejects(api.exportExcel({ job_id: 'job', rules_version: 'rules' }), /invalid export file/)
})

test('turns network failures into an actionable backend connection error', async () => {
  globalThis.fetch = async () => { throw new TypeError('synthetic network failure') }
  await assert.rejects(api.health(), /Could not reach the backend/)
})

test('rejects invalid JSON bodies', async () => {
  globalThis.fetch = async () => new Response('{broken json', { status: 200 })
  await assert.rejects(api.health(), /invalid JSON/)
})

test('surfaces actionable HTTP 4xx and 5xx error details', async (t) => {
  for (const status of [400, 401, 403, 409, 422, 500]) {
    await t.test(`HTTP ${status}`, async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({ detail: `Synthetic HTTP ${status}` }), { status })
      await assert.rejects(api.health(), new RegExp(`Synthetic HTTP ${status}`))
    })
  }
})

test('reports timeout separately from a backend connection failure', async () => {
  globalThis.window = {
    setTimeout(callback) { queueMicrotask(callback); return 1 },
    clearTimeout() {},
  }
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'))
    else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
  await assert.rejects(api.health(), /request timed out/i)
})

test('applies a timeout to upload requests and does not report upload success', async () => {
  globalThis.window = {
    setTimeout(callback) { queueMicrotask(callback); return 1 },
    clearTimeout() {},
  }
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'))
    else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
  await assert.rejects(api.uploadFile(syntheticFile()), /request timed out/i)
})

test('reports caller cancellation separately from timeout', async () => {
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'))
    else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
  const controller = new AbortController()
  const pending = api.health(controller.signal)
  controller.abort()
  await assert.rejects(pending, /Request cancelled/)
})

test('rejects a successful process response for a different job', async () => {
  const expectedJobId = '123e4567-e89b-12d3-a456-426614174000'
  const body = {
    success: true,
    job_id: '123e4567-e89b-12d3-a456-426614174001',
    source_filename: 'synthetic.csv',
    rules_version: 'rules-1',
    rules: { normal_start_time: '08:00', very_late_arrival_threshold: '09:30', overtime_threshold: '19:30' },
    summary: { total_days: 0, present_days: 0, incomplete_or_no_events: 0, late_count: 0, very_late_count: 0, total_overtime_minutes: 0 },
    processed_days: [],
  }
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 })
  await assert.rejects(api.processAttendance(expectedJobId), /different upload job/)
})

test('rejects an export response with a different job or rules version', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true, filename: 'report.xlsx', data: 'YWJj', job_id: 'job-1', rules_version: 'old-rules',
  }), { status: 200 })
  await assert.rejects(api.exportExcel({ job_id: 'job-1', rules_version: 'current-rules' }), /does not match/)
})

test('validates current server job status and rejects missing/mismatched metadata', async () => {
  const jobId = '123e4567-e89b-12d3-a456-426614174000'
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true, job_id: jobId, processed: true,
    processed_rules_version: 'rules-1', current_rules_version: 'rules-1',
  }), { status: 200 })
  const result = await api.getJobStatus(jobId)
  assert.equal(result.processed, true)
  assert.equal(result.processed_rules_version, 'rules-1')

  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true, job_id: 'other-job', processed: true,
    processed_rules_version: 'rules-1', current_rules_version: 'rules-1',
  }), { status: 200 })
  await assert.rejects(api.getJobStatus(jobId), /invalid or mismatched job status/)
})
