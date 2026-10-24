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
const { seedNext, seedOwned, stub, item } = await import('./fixture.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { enqueueParsed } = await import('../src/mcp/server.ts')
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

function todoWork() {
	const store = fresh(), at = new Date(Date.now() - 60_000).toISOString()
	item(store, 'A501', 'Kim Lane', 'Acme test', {
		state: 'open', answerSurface: 'chat', kept: [
			{ id: 't1', text: 'Update the checklist', at },
			{ id: 't2', text: 'Newer independent task', at },
		],
		work: { goal: 'Acme fixed', links: [], steps: [], next: { who: 'them', what: 'Kim confirms fixed' } },
	})
	return store
}

test('bug 10-22 E45 + PM 20:00: the row marks nothing; the card marks only the ticked task, preserves work and timestamps, and shows the next task', async () => {
	const store = todoWork(), snapshot = reactProjection(store).snapshot
	const row = snapshot.entities.placements.A501
	assert.equal(row.headline, 'To do: Update the checklist')
	assert.ok(row.actionIds.every(id => !snapshot.entities.actions[id]?.todoIds), 'the row offers no mark action')
	const request = intent(store, 'A501/todo-done', { picks: [1] })
	const before = store.byCode('A501')!
	assert.equal(submitIntent(store, request).status, 202)
	assert.deepEqual(store.answers()[0].answer.todos, ['t1'])
	let sends = 0
	await applyAnswers(store, { ...source, send: async () => ({ msgId: `unexpected-${++sends}` }) }, store.config(), processes as never)
	const after = store.byCode('A501')!
	assert.ok(after.kept![0].done)
	assert.ok(after.kept!.slice(1).every(todo => !todo.done))
	assert.deepEqual({ ...after, kept: undefined }, { ...before, kept: undefined })
	assert.equal(sends, 0)
	assert.match(submissionReceipt(store, request.submissionId)!.text, /Update the checklist\. A501 stays open\. Nothing was sent\./)
	assert.equal(reactProjection(store).snapshot.entities.placements.A501.headline, 'To do: Newer independent task')
	assert.notEqual(submitIntent(store, { ...request, submissionId: randomUUID() }).status, 202)
})

test('bug 10-22 E45: card binds its counted list and refuses equal/older-time additions before submission', async () => {
	for (const delta of [0, -1]) {
		const store = todoWork(), request = intent(store, 'A501/todo-done')
		assert.equal(reactProjection(store).snapshot.entities.actions[request.action].label, 'Mark 2 to-dos done')
		const workflow = store.byCode('A501')!
		workflow.kept!.push({ id: 't3', text: 'Not on the drawn list', at: new Date(Date.parse(workflow.kept![0].at) + delta).toISOString() })
		store.save(workflow, false)
		assert.equal(submitIntent(store, request).status, 409)
		assert.equal(store.answers().length, 0)
		assert.ok(store.byCode('A501')!.kept!.every(todo => !todo.done))
	}
	const store = todoWork(), request = intent(store, 'A501/todo-done')
	submitIntent(store, request)
	const workflow = store.byCode('A501')!
	workflow.kept!.push({ id: 't3', text: 'Kept after enqueue', at: workflow.kept![0].at })
	store.save(workflow, false)
	assert.deepEqual(store.answers()[0].answer.todos, ['t1', 't2'])
	await applyAnswers(store, source, store.config(), processes as never)
	assert.ok(store.byCode('A501')!.kept!.slice(0, 2).every(todo => todo.done))
	assert.equal(store.byCode('A501')!.kept![2].done, undefined)
	assert.equal(store.byCode('A501')!.state, 'open')
})

test('bug 10-22 E45: a task finished elsewhere refuses the drawn list without marking its other task', async () => {
	const store = todoWork(), request = intent(store, 'A501/todo-done')
	submitIntent(store, request)
	const workflow = store.byCode('A501')!
	workflow.kept![0].done = new Date().toISOString()
	store.save(workflow, false)
	await applyAnswers(store, source, store.config(), processes as never)
	assert.equal(store.byCode('A501')!.kept![1].done, undefined)
	assert.match(submissionReceipt(store, request.submissionId)!.text, /These to-dos changed\. Nothing was marked\./)
})

test('bug 10-22 E45 + PM 20:15: Classic offers no row to-do mark; its card ticks them, and a later task invalidates an offered Close', () => {
	const store = todoWork(), snapshot = reactProjection(store).snapshot
	assert.equal(snapshot.entities.actions['A501/classic-close'], undefined, 'no "Mark N to-dos done" on the Classic row')
	assert.ok(!snapshot.classic!.progress.find(row => row.code === 'A501')?.actionIds.some(id => snapshot.entities.actions[id]?.todoIds), 'the row offers nothing that marks to-dos')
	assert.deepEqual(snapshot.entities.actions['A501/todo-done'].todoIds, ['t1', 't2'], 'the card section is the one way to mark them')
	const workflow = store.byCode('A501')!
	workflow.kept = []
	store.save(workflow, false)
	const close = reactProjection(store).snapshot.entities.actions['A501/classic-close']
	assert.equal([close.label, close.staleness, close.needsConfirm].join('|'), 'Close|exact|')
	const request = intent(store, close.id)
	workflow.kept.push({ id: 't3', text: 'Kept later', at: workflow.createdAt })
	store.save(workflow, false)
	// The row stopped offering Close once a to-do appeared, so the stale Close is refused as no longer offered; nothing is queued.
	assert.equal(submitIntent(store, request).status, 410)
	assert.equal(store.answers().length, 0)
})

test('bug 10-22 E45: chat close still marks all open tasks and the next close ends work', async () => {
	const store = todoWork()
	enqueueParsed(store, [{ code: 'A501', verb: 'close' }], undefined, 'chat')
	await applyAnswers(store, source, store.config(), processes as never)
	assert.ok(store.byCode('A501')!.kept!.every(todo => todo.done))
	assert.equal(store.byCode('A501')!.state, 'open')
	enqueueParsed(store, [{ code: 'A501', verb: 'close' }], undefined, 'chat')
	await applyAnswers(store, source, store.config(), processes as never)
	assert.equal(store.byCode('A501')!.state, 'done')
	assert.ok(store.byCode('A501')!.work!.closed)
})
