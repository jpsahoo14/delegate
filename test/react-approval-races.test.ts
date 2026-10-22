import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Source } from '../src/adapters/source.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-react-races-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { reactProjection } = await import('../src/web/react-projection.ts')
const { submitIntent, submissionReceipt } = await import('../src/web/react-submissions.ts')
const { seedNext, seedOwned, stub } = await import('./fixture.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const source: Source = stub
const processes = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
const fresh = () => seedOwned(seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-races-')), machine: 'test' })))
function intent(store: InstanceType<typeof Store>, id: string, input?: { text?: string; excluded?: number[]; picks?: number[] }) {
	const action = reactProjection(store).snapshot.entities.actions[id]
	assert.ok(action, id)
	return { submissionId: randomUUID(), action: id, item: action.item, rev: action.rev, expect: action.expect, input }
}

test('React approval race: two tabs sending one open reply produce one message, never a correction', async () => {
	const store = fresh()
	const first = intent(store, 'A20/send-edit', { text: 'A fixture reply.' }), second = { ...first, submissionId: randomUUID() }
	submitIntent(store, first); submitIntent(store, second)
	let sends = 0
	await applyAnswers(store, { ...source, send: async () => ({ msgId: `reply-${++sends}` }) }, store.config(), processes as never)
	assert.equal(sends, 1)
	assert.match(submissionReceipt(store, second.submissionId)!.text, /Already sent|Changed since/)
})

test('React approval race: a pending change made or reordered after enqueue refuses the whole approval', async () => {
	for (const change of ['made', 'reordered'] as const) {
		const store = fresh(), request = intent(store, 'A6/approve', { excluded: [2] })
		submitIntent(store, request)
		const workflow = store.byCode('A6')!
		if (change === 'made') workflow.effects![0].done = { at: new Date().toISOString() }
		else workflow.effects!.reverse()
		store.save(workflow, false)
		let sends = 0
		await applyAnswers(store, { ...source, send: async () => ({ msgId: `reply-${++sends}` }) }, store.config(), processes as never)
		assert.equal(sends, 0)
		assert.match(submissionReceipt(store, request.submissionId)!.text, /Changed since/)
		assert.ok(store.byCode('A6')!.effects!.every(effect => !effect.off))
	}
})

test('React approval race: Undo cannot delete a newer sent reply', async () => {
	const store = fresh(), workflow = store.byCode('A20')!
	workflow.state = 'done'
	workflow.sent = { msgId: 'older-reply', at: new Date().toISOString(), undoUntil: new Date(Date.now() + 60_000).toISOString() }
	store.save(workflow, false)
	const request = intent(store, 'A20/undo')
	submitIntent(store, request)
	workflow.sent.msgId = 'newer-reply'
	store.save(workflow, false)
	let deleted = 0
	await applyAnswers(store, { ...source, deleteMessage: async () => { deleted++ } }, store.config(), processes as never)
	assert.equal(deleted, 0)
	assert.match(submissionReceipt(store, request.submissionId)!.text, /Nothing was deleted/)
})

test('React approval race: Mark done affects only the displayed to-do identities', async () => {
	const store = fresh(), request = intent(store, 'A42/todo-done')
	submitIntent(store, request)
	const workflow = store.byCode('A42')!
	workflow.kept!.push({ id: 't2', text: 'A later promise', at: new Date().toISOString() })
	store.save(workflow, false)
	await applyAnswers(store, source, store.config(), processes as never)
	const after = store.byCode('A42')!
	assert.ok(after.kept![0].done)
	assert.equal(after.kept![1].done, undefined)
	assert.equal(after.state, 'done')
})

test('React approval race: harmless work log updates do not change approval or editor identity', () => {
	const store = fresh(), before = reactProjection(store).snapshot.entities.items.A40.rev
	const workflow = store.byCode('A40')!
	workflow.work!.steps.push({ at: new Date().toISOString(), what: 'Checked again; no action changed' })
	store.save(workflow)
	assert.equal(reactProjection(store).snapshot.entities.items.A40.rev, before)
})

test('React approval race: a duplicate answer file from another machine is not sent again', async () => {
	const store = fresh(), request = intent(store, 'A20/send-edit', { text: 'A fixture reply.' })
	submitIntent(store, request)
	const answer = store.answers()[0].answer
	writeFileSync(join(store.root, 'state', 'answers', `${answer.id}-another-machine.json`), JSON.stringify(answer))
	let sends = 0
	await applyAnswers(store, { ...source, send: async () => ({ msgId: `reply-${++sends}` }) }, store.config(), processes as never)
	assert.equal(sends, 1)
	assert.equal(store.answers().length, 0)
	assert.doesNotMatch(submissionReceipt(store, request.submissionId)!.text, /Already sent|Changed since/)
})

test('React approval race: reordered options are refused instead of picking unseen text', async () => {
	const store = fresh(), request = intent(store, 'A3/pick', { picks: [1] })
	submitIntent(store, request)
	const workflow = store.byCode('A3')!
	workflow.choices!.options.reverse()
	store.save(workflow, false)
	await applyAnswers(store, source, store.config(), processes as never)
	assert.equal(store.byCode('A3')!.picked, undefined)
	assert.match(submissionReceipt(store, request.submissionId)!.text, /Changed since/)
})
