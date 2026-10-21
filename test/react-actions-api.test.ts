import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Intent } from '../src/web/react/domain/contracts.ts'
import { ulid } from '../src/core/ids.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-react-actions-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { seedNext } = await import('./fixture.ts')
const { reactProjection } = await import('../src/web/react-projection.ts')
const { submitIntent, submissionReceipt } = await import('../src/web/react-submissions.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { stub } = await import('./fixture.ts')

test('React actions API: one submission survives duplicate POSTs, lost response and a new Store instance', async () => {
	const root = mkdtempSync(join(tmpdir(), 'delegate-react-actions-'))
	const store = seedNext(new Store({ root, machine: 'test' }))
	const action = reactProjection(store).snapshot.entities.actions['A1/send-edit']
	const intent: Intent = { submissionId: randomUUID(), action: action.id, item: action.item, rev: action.rev, expect: action.expect, input: { text: 'Yes, ok A9' } }
	const { server, url } = await serveInbox(() => store)
	const path = (name: string) => new URL(name + new URL(url).search, url)
	try {
		const response = await fetch(path('/api/v1/actions'), { method: 'POST', body: JSON.stringify(intent) })
		assert.equal(response.status, 202)
		await response.body!.cancel()
		const duplicate = await fetch(path('/api/v1/actions'), { method: 'POST', body: JSON.stringify(intent) })
		assert.equal(duplicate.status, 202)
		assert.equal(store.answers().length, 1)
		assert.equal(store.answers()[0].answer.text, 'Yes, ok A9')
		const reloaded = new Store({ root, machine: 'another-machine' })
		const restored = submissionReceipt(reloaded, intent.submissionId)!
		assert.match(restored.ids[0], /^[0-9A-HJKMNP-TV-Z]{26}$/)
		assert.equal(restored.applied, false)
		assert.equal(submitIntent(reloaded, intent).receipt.ids[0], restored.ids[0])
		assert.equal(store.answers().length, 1)
		store.addOutcome(restored.ids[0], 'Sent to Robin.')
		assert.equal(submissionReceipt(reloaded, intent.submissionId)!.text, 'Sent to Robin.')
		assert.throws(() => submitIntent(reloaded, { ...intent, input: { text: 'Different' } }), /different action/)
	} finally {
		server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
	}
})

test('React actions API: an interrupted prepared receipt refuses without queuing from GET or POST', () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-crash-')), machine: 'test' }))
	const id = randomUUID()
	store.savePageSubmission({
		id, answerId: ulid(), fingerprint: 'fixture', item: 'A1', rev: store.byCode('A1')!.revAt!, at: new Date().toISOString(),
		phase: 'prepared', accepted: false, ids: [], text: 'Preparing', status: 202,
	})
	const workflow = store.byCode('A1')!
	workflow.revAt = new Date().toISOString()
	store.save(workflow, false)
	assert.equal(submissionReceipt(store, id)!.accepted, false)
	assert.equal(submissionReceipt(store, id)!.applied, true)
	assert.match(submissionReceipt(store, id)!.text, /interrupted/)
	assert.equal(store.answers().length, 0)
})

test('React actions API: stale, unknown and invalid actions return explicit refusals without queuing', async () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-refusals-')), machine: 'test' }))
	const action = reactProjection(store).snapshot.entities.actions['A1/approve']
	const { server, url } = await serveInbox(() => store)
	const endpoint = new URL('/api/v1/actions' + new URL(url).search, url)
	try {
		const base = { submissionId: randomUUID(), action: action.id, item: action.item, rev: action.rev, expect: action.expect }
		for (const [body, expected] of [[{ ...base, rev: 'stale' }, 409], [{ ...base, action: 'missing' }, 410], [{ ...base, command: 'ok A9' }, 422]] as const) {
			const response = await fetch(endpoint, { method: 'POST', body: JSON.stringify({ ...body, submissionId: randomUUID() }) })
			assert.equal(response.status, expected)
			assert.ok((await response.json()).text)
		}
		assert.equal((await fetch(endpoint, { method: 'POST', body: 'x'.repeat(20_001) })).status, 413)
		assert.deepEqual(store.answers(), [])
	} finally {
		server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
	}
})

test('React actions API: a lost stale refusal remains recoverable without an answer', () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-stale-receipt-')), machine: 'test' }))
	const action = reactProjection(store).snapshot.entities.actions['A1/approve']
	const intent: Intent = { submissionId: randomUUID(), action: action.id, item: action.item, rev: 'stale', expect: action.expect }
	assert.equal(submitIntent(store, intent).status, 409)
	assert.match(submissionReceipt(store, intent.submissionId)!.text, /Changed since/)
	assert.equal(submissionReceipt(store, intent.submissionId)!.accepted, false)
	assert.equal(submitIntent(store, intent).status, 409)
	assert.deepEqual(store.answers(), [])
})

test('React actions API: manual Undo crosses the real HTTP gate and is applied by the runner', async () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-http-undo-')), machine: 'test' }))
	const wf = store.byCode('A1')!
	wf.state = 'done'
	wf.sent = { msgId: 'manual-reply', at: new Date().toISOString(), undoUntil: new Date(Date.now() + 60_000).toISOString(), text: 'Fixture reply' }
	store.save(wf, false)
	const action = reactProjection(store).snapshot.entities.actions['A1/undo']
	assert.ok(action)
	const { server, url } = await serveInbox(() => store)
	try {
		const response = await fetch(new URL('/api/v1/actions' + new URL(url).search, url), {
			method: 'POST', body: JSON.stringify({ submissionId: randomUUID(), action: action.id, item: action.item, rev: action.rev, expect: action.expect }),
		})
		assert.equal(response.status, 202)
		await applyAnswers(store, stub, store.config(), { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} } as never)
		assert.equal(store.byCode('A1')!.state, 'needs_human')
		assert.equal(store.byCode('A1')!.sent, undefined)
	} finally {
		server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
	}
})
