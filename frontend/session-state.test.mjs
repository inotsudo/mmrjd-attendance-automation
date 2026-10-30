import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
}
const session = await load('./src/lib/session-state.ts')
const freshness = await load('./src/lib/results-freshness.ts')

test('rejects malformed but valid JSON upload metadata', () => {
  assert.equal(session.parseStoredUpload('{"job_id":"job"}'), null)
})

test('caps export history and preserves a valid legacy item when history is malformed', () => {
  const legacy = JSON.stringify({ type: 'pdf', filename: 'legacy.pdf', at: '2026-01-01' })
  const migrated = session.parseExportHistory('{bad', legacy)
  assert.equal(migrated.length, 1)
  assert.equal(migrated[0].filename, 'legacy.pdf')
  const full = Array.from({ length: 25 }, (_, n) => ({ type: 'pdf', filename: `${n}.pdf`, at: `${n}` }))
  assert.equal(session.appendExportHistory(JSON.stringify(full), null, { type: 'excel', filename: 'new.xlsx', at: 'z' }).length, 20)
})

test('allows export only when cached and server job and rule provenance agree', () => {
  const upload = { job_id: 'job-1' }
  const result = { job_id: 'job-1', rules_version: 'rules-1' }
  const status = { job_id: 'job-1', processed: true, processed_rules_version: 'rules-1', current_rules_version: 'rules-1' }
  assert.equal(freshness.checkResultsFreshness(upload, result, status), 'current')
  assert.equal(freshness.checkResultsFreshness(upload, result, { ...status, current_rules_version: 'rules-2' }), 'stale')
  assert.equal(freshness.checkResultsFreshness(upload, result, null, true), 'unavailable')
  assert.equal(freshness.checkResultsFreshness({ job_id: 'job-2' }, result, status), 'stale')
})
