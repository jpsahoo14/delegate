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

test('React actions API: a refused result stays refused after the outcome log rotates', async () => {
	const root = mkdtempSync(join(tmpdir(), 'delegate-react-durable-refusal-'))
	const store = seedNext(new Store({ root, machine: 'test' }))
	const action = reactProjection(store).snapshot.entities.actions['A1/send-edit']
	const intent: Intent = { submissionId: randomUUID(), action: action.id, item: action.item, rev: action.rev, expect: action.expect, input: { text: 'My exact unsent words' } }
	submitIntent(store, intent)
	const workflow = store.byCode('A1')!
	workflow.draft!.text = 'A changed draft before application'
	store.save(workflow, false)
	await applyAnswers(store, stub, store.config(), { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} } as never)
	for (let index = 0; index < 200; index++) store.addOutcome(`other-action-${index}`, 'Other activity')
	const result = submissionReceipt(new Store({ root, machine: 'another-machine' }), intent.submissionId)!
	assert.equal(result.applied, true)
	assert.equal(result.refused, true)
	assert.equal(result.uncertain, false)
	assert.match(result.text, /changed|Changed/)
	assert.equal(store.byCode('A1')!.sent, undefined)
	assert.deepEqual(store.answers(), [])
})

test('React actions API: legacy processed answers with missing detail terminate as uncertainty, never queue or claim success', async () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-legacy-receipt-')), machine: 'test' }))
	const answerId = store.writeAnswer({ code: 'A1', verb: 'skip', surface: 'panel' }).id
	const id = randomUUID()
	store.savePageSubmission({ id, answerId, ids: [answerId], item: 'A1', rev: '', fingerprint: 'legacy', at: new Date().toISOString(), phase: 'queued', accepted: true, status: 202, text: 'Queued' })
	await applyAnswers(store, stub, store.config(), { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} } as never)
	for (let index = 0; index < 200; index++) store.addOutcome(`other-action-${index}`, 'Other activity')
	const result = submissionReceipt(store, id)!
	assert.equal(result.applied, true)
	assert.equal(result.uncertain, true)
	assert.match(result.text, /detailed result is no longer available/)
	assert.deepEqual(submissionReceipt(store, id), result)
	assert.deepEqual(store.answers(), [])
})

test('React actions API: completion before the enqueue response cannot be overwritten by queued metadata', () => {
	class FastRunnerStore extends Store {
		override writeAnswer(answer: Parameters<InstanceType<typeof Store>['writeAnswer']>[0], answerId?: string) {
			const queued = super.writeAnswer(answer, answerId)
			const text = 'Refused during concurrent application.'
			this.addOutcome(queued.id, text, true)
			this.completePageSubmission(queued, text, true)
			this.doneAnswer(this.answers().find(entry => entry.answer.id === queued.id)!.file)
			for (let index = 0; index < 200; index++) this.addOutcome(`other-action-${index}`, 'Other activity')
			return queued
		}
	}
	const store = seedNext(new FastRunnerStore({ root: mkdtempSync(join(tmpdir(), 'delegate-react-completion-race-')), machine: 'test' }))
	const action = reactProjection(store).snapshot.entities.actions['A1/send-edit']
	const intent: Intent = { submissionId: randomUUID(), action: action.id, item: action.item, rev: action.rev, expect: action.expect, input: { text: 'My words' } }
	const result = submitIntent(store, intent).receipt
	assert.equal(result.applied, true)
	assert.equal(result.refused, true)
	assert.equal(result.uncertain, false)
	assert.equal(result.text, 'Refused during concurrent application.')
	assert.deepEqual(submitIntent(store, intent).receipt, result)
	assert.deepEqual(store.answers(), [])
	assert.equal(store.byCode('A1')!.sent, undefined)
})

test('React actions API: lost 409, 410 and 422 refusals stay recoverable and never queue', () => {
	for (const status of [409, 410, 422]) {
		const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-refusal-record-')), machine: 'test' }))
		const action = reactProjection(store).snapshot.entities.actions['A1/send-edit']
		const intent: Intent = { submissionId: randomUUID(), action: status === 410 ? 'unknown-action' : action.id, item: action.item, rev: status === 409 ? 'stale' : action.rev, expect: action.expect, input: status === 422 ? {} : { text: 'My words' } }
		assert.equal(submitIntent(store, intent).status, status)
		assert.equal(submissionReceipt(store, intent.submissionId)!.refused, true)
		assert.equal(submitIntent(store, intent).status, status)
		assert.deepEqual(store.answers(), [])
	}
})

test('React actions API: prepared recovery re-resolves the stored intent and refuses a changed action without queuing from GET', () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-recovery-resolve-')), machine: 'test' }))
	const action = reactProjection(store).snapshot.entities.actions['A1/send-edit']
	const intent: Intent = { submissionId: randomUUID(), action: action.id, item: action.item, rev: action.rev, expect: action.expect, input: { text: 'Original words' } }
	store.savePageSubmission({ id: intent.submissionId, answerId: ulid(), intent, fingerprint: 'fixture', item: intent.item, rev: intent.rev, at: new Date().toISOString(), phase: 'prepared', accepted: false, ids: [], text: 'Preparing', status: 202 })
	const workflow = store.byCode('A1')!
	workflow.draft!.text = 'Changed before recovery'
	store.save(workflow, false)
	const result = submissionReceipt(store, intent.submissionId)!
	assert.equal(result.refused, true)
	assert.match(result.text, /Changed since/)
	assert.equal(store.pageSubmission(intent.submissionId)!.status, 409)
	assert.deepEqual(store.answers(), [])
})
