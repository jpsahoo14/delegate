// Fictional recorded-session metadata journey; isolated Store, no model, external calls or owner files.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'delegate-run-tools-'))
const names = ['DELEGATE_ROOT', 'DELEGATE_LOCAL', 'COPILOT_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'] as const
const previous = names.map(n => process.env[n])
try {
	for (const name of names) { process.env[name] = join(root, name); mkdirSync(process.env[name]!, { recursive: true }) }
	const { Store } = await import('../src/store/state.ts')
	const { logRunTools, runToolShapes } = await import('../src/worker/run-tools.ts')
	const store = new Store({ root: process.env.DELEGATE_ROOT!, machine: 'fictional' })
	const slice = (result: unknown) => [
		{ type: 'tool.execution_start', timestamp: '2026-10-24T12:00:00.000Z', data: {
			toolCallId: 'private-call-id', toolName: 'acme-read', arguments: { text: 'private-arguments' } } },
		{ type: 'tool.execution_complete', timestamp: '2026-10-24T12:00:00.013Z', data: {
			toolCallId: 'private-call-id', success: true, result } },
	].map(e => JSON.stringify(e)).join('\n')
	const keyed = { Robin: { text: 'private-output' }, Kim: 'private-output', 'robin@acme.example': 'private-output' }
	assert.deepEqual(runToolShapes(slice(keyed)).calls[0].keys, ['other'])
	assert.equal(logRunTools(store, slice(keyed), { trace: 'A601:fictional-shape', runId: 'fictional-run' }), 1)
	const logged = store.logs().find(e => e.event === 'run-tools')!
	assert.deepEqual(logged.keys, ['other'])
	assert.equal(logged.trace, 'A601:fictional-shape')
	assert.equal(logged.runId, 'fictional-run')
	assert.equal(logged.ms, 13)
	assert.equal(logged.bytes, Buffer.byteLength(JSON.stringify(keyed), 'utf8'))
	for (const secret of ['Robin', 'Kim', 'robin@acme.example', 'private-output', 'private-arguments', 'private-call-id'])
		assert.ok(!JSON.stringify(store.logs()).includes(secret), `${secret} must not reach metadata`)
	console.log("PASS name-keyed result produces exactly ['other'] through production inspection and isolated Store metadata logging")

	const allowed = ['content', 'structuredContent', 'isError', 'text', 'textResultForLlm', 'resultType',
		'binaryResultsForLlm', 'error', 'image', 'data', 'value', 'items', 'nextLink', 'count']
	assert.deepEqual(runToolShapes(slice(Object.fromEntries(allowed.map(k => [k, null])))).calls[0].keys, allowed)
	const mixed = runToolShapes(slice({ content: [{ type: 'text', text: 'private-output' }], Robin: 1, data: {}, Kim: 2 })).calls[0]
	assert.deepEqual(mixed.keys, ['content', 'other', 'data'])
	assert.deepEqual(mixed.contentTypes, ['text'])
	const bounded = runToolShapes(slice(Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`private-key-${i}`, 1])))).calls[0]
	assert.deepEqual(bounded.keys, ['other'])
	assert.equal(bounded.keysTruncated, true)
	assert.equal(mixed.keysTruncated, false)
	assert.equal(logRunTools(store, '{bad json', { trace: 'A601:fictional-shape', runId: 'no-report-run' }), 0)
	assert.ok(store.logs().some(e => e.event === 'run-tools-invalid' && e.class === 'invalid-json'))
	console.log('PASS fixed envelope keys survive; unknown names deduplicate; existing bounds, shape, trace, bytes and malformed-input fail-soft behavior stay intact')
} finally {
	for (const [i, name] of names.entries()) if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]
	rmSync(root, { recursive: true, force: true })
}
