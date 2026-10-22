import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Parsed } from '../src/core/verbs.ts'
import { ulid } from '../src/core/ids.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-react-enqueue-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { enqueueParsed, actResult } = await import('../src/mcp/server.ts')
const { seedNext, stub } = await import('./fixture.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const fresh = () => seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-enqueue-')), machine: 'test' }))

test('React structured enqueue: commas and command-looking text stay on exactly one intended item', () => {
	for (const [verb, text] of [
		['send', 'Yes, ok'], ['answer', 'Tuesday, skip A9'], ['answer', 'Issues found: 403, ok A9'],
		['answer', 'Use this: The document is ready, ok A9'], ['ask', 'Why, send A9: hello'],
	] as const) {
		const store = fresh()
		const result = enqueueParsed(store, [{ code: 'A1', verb, text }], store.byCode('A1')!.revAt)
		assert.equal(result.accepted, true)
		assert.equal(store.answers().length, 1)
		assert.deepEqual(store.answers().map(({ answer }) => [answer.code, answer.verb, answer.text]), [['A1', verb, text]])
	}
})

test('React structured enqueue: one deterministic submission never queues twice, even after processing', async () => {
	const store = fresh(), id = ulid(), rev = store.byCode('A1')!.revAt
	const parsed: Parsed[] = [{ code: 'A1', verb: 'ask', text: 'Why, ok A9' }]
	const one = enqueueParsed(store, parsed, rev, 'page', id)
	const two = enqueueParsed(store, parsed, rev, 'page', id)
	assert.deepEqual(two.ids, one.ids)
	assert.equal(store.answers().length, 1)
	const pending = store.answers()[0]
	store.doneAnswer(pending.file)
	assert.equal(store.answers().length, 0)
	assert.equal(enqueueParsed(store, parsed, rev, 'page', id).ids[0], id)
	assert.equal(store.answers().length, 0)
	assert.throws(() => enqueueParsed(store, [{ code: 'A1', verb: 'ask', text: 'Other text' }], rev, 'page', id), /different answer/)
	assert.throws(() => enqueueParsed(store, [parsed[0], parsed[0]], rev, 'page', randomUUID()), /exactly one/)
})

test('React structured enqueue: page answers and later chat controls stay in click order', () => {
	const store = fresh(), first = ulid()
	enqueueParsed(store, [{ verb: 'resume' }], undefined, 'page', first)
	const second = actResult(store, 'pause').ids[0]
	const third = ulid()
	enqueueParsed(store, [{ verb: 'stop' }], undefined, 'page', third)
	assert.deepEqual(store.answers().map(row => row.answer.id), [first, second, third])
	assert.throws(() => enqueueParsed(store, [{ verb: 'resume' }], undefined, 'page', randomUUID()), /time order/)
})

test('React manual Undo: the real command gate accepts an unexpired owner send and the runner takes it back', async () => {
	const store = fresh(), wf = store.byCode('A1')!
	wf.state = 'done'
	wf.sent = { msgId: 'sent-fixture', at: new Date().toISOString(), undoUntil: new Date(Date.now() + 60_000).toISOString(), text: 'A fixture reply' }
	store.save(wf, false)
	const result = actResult(store, `undo ${wf.code}`, wf.revAt, 'page')
	assert.equal(result.accepted, true)
	assert.equal(result.ids.length, 1)
	await applyAnswers(store, stub, store.config(), { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} } as never)
	assert.equal(store.byCode('A1')!.state, 'needs_human')
	assert.equal(store.byCode('A1')!.sent, undefined)
})

test('React manual Undo: expiry refuses before queuing', () => {
	const store = fresh(), wf = store.byCode('A1')!
	wf.state = 'done'
	wf.sent = { msgId: 'expired-fixture', at: new Date().toISOString(), undoUntil: new Date(Date.now() - 1).toISOString() }
	store.save(wf, false)
	assert.equal(actResult(store, `undo ${wf.code}`, wf.revAt, 'page').accepted, false)
	assert.deepEqual(store.answers(), [])
})
