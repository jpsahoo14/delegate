import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-react-projection-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { reactProjection, resolveIntent } = await import('../src/web/react-projection.ts')
const { seedNext, seedOwned, seedChanges, seedPromise } = await import('./fixture.ts')
const fresh = () => seedOwned(seedChanges(seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-projection-')), machine: 'test' }))))

test('React G2: only the generated failed-job directions survive command filtering', () => {
	const store = fresh(), workflow = store.byCode('A2')!
	workflow.status = 'The job did not finish: Fictional session stopped'
	workflow.question = 'Answer A2 to retry with directions, or skip it'
	store.save(workflow, false)
	let entities = reactProjection(store).snapshot.entities
	assert.equal(entities.placements.A2.headline, 'Answer Ravi: Answer A2 to retry with directions, or skip it')
	assert.equal(entities.items.A2.question, workflow.question)
	assert.ok(entities.items.A2.actionIds.includes('A2/answer'))
	assert.ok(entities.items.A2.actionIds.includes('A2/dismiss'))
	for (const question of ['Answer A2 to retry with different directions, or skip it', 'Answer A3 to retry with directions, or skip it']) {
		workflow.question = question
		store.save(workflow, false)
		entities = reactProjection(store).snapshot.entities
		assert.equal(entities.placements.A2.headline, 'Review this item')
		assert.equal(entities.items.A2.question, undefined)
	}
	workflow.status = 'Needs you'
	workflow.question = 'Answer A2 to retry with directions, or skip it'
	store.save(workflow, false)
	assert.equal(reactProjection(store).snapshot.entities.items.A2.question, undefined)
})

test('React projection: every fixture subject has one server placement and normalized links resolve', () => {
	const { snapshot } = reactProjection(fresh())
	const ids = snapshot.sections.flatMap(section => section.ids)
	assert.equal(new Set(ids).size, ids.length)
	assert.ok(ids.length > 20)
	const e = snapshot.entities
	const subjects = Object.values(e.placements).flatMap(placement => placement.subjects)
	assert.equal(new Set(subjects).size, subjects.length, 'one authoritative placement per subject, including closed subjects')
	for (const item of Object.values(e.items)) assert.ok(subjects.includes(item.code), `${item.code} has a placement even when its sent reply is also an activity`)
	for (const item of Object.values(e.items)) {
		assert.ok(e.people[item.personId])
		assert.ok(e.chats[item.chatId])
		if (item.draftId) assert.ok(e.drafts[item.draftId])
		for (const id of item.changeIds) assert.ok(e.changes[id])
		for (const id of item.sourceIds) assert.ok(e.sources[id])
		for (const id of item.noteIds) assert.ok(e.notes[id])
		for (const id of item.actionIds) assert.equal(e.actions[id].item, item.code)
	}
	for (const id of snapshot.sections.find(s => s.id === 'move')!.ids) {
		const row = e.placements[id]
		assert.ok(row.actionIds.length || e.items[row.act]?.actionIds.length || e.automations[row.act]?.actionIds.length, `${id}: Your move must have an action`)
	}
	const serialized = JSON.stringify(snapshot)
	assert.equal(serialized.includes('"command"'), false)
	assert.equal(serialized.includes('{text}'), false)
})

test('React projection: stale approval and same-revision changed draft are refused before queuing', () => {
	const store = fresh(), old = reactProjection(store).snapshot.entities.actions['A1/approve']
	assert.ok(old)
	assert.match(old.expect!, /^[a-f0-9]{64}$/)
	const wf = store.byCode('A1')!
	wf.draft!.text = 'Different words'
	store.save(wf, false)
	assert.throws(() => resolveIntent(store, { item: old.item, rev: old.rev, expect: old.expect, submissionId: randomUUID(), action: old.id }), /Changed since/)
	assert.deepEqual(store.answers(), [])
})

test('React projection: text is never parsed and edited-reply exclusions are refused', () => {
	const store = fresh(), action = reactProjection(store).snapshot.entities.actions['A1/send-edit']
	assert.ok(action)
	const intent = { action: action.id, item: action.item, rev: action.rev, expect: action.expect, submissionId: randomUUID(), input: { text: 'Yes, ok A9' } }
	assert.deepEqual(resolveIntent(store, intent), { code: 'A1', verb: 'send', text: 'Yes, ok A9' })
	assert.throws(() => resolveIntent(store, { ...intent, input: { ...intent.input, excluded: [1] } }), /one at a time/)
})

test('React projection: row approvals use the same exact stale and expected-content gates as cards', () => {
	const store = seedPromise(fresh())
	const { bindings, snapshot } = reactProjection(store)
	let canonicalApprovals = 0
	for (const row of Object.values(snapshot.entities.placements)) for (const id of row.actionIds) {
		const binding = bindings.get(id)!
		const parsed = (() => { try { return binding.resolve(undefined) } catch { return undefined } })()
		if (!parsed || !['ok', 'send', 'edit', 'pick', 'undo'].includes(parsed.verb) || parsed.code?.startsWith('W')) continue
		assert.equal(binding.action.staleness, 'exact', id)
		assert.notEqual(binding.action.effect, 'local', id)
		const canonical = snapshot.entities.actions[`${binding.action.item}/approve`]
		if (canonical && parsed.verb === 'ok') {
			canonicalApprovals++
			assert.equal(id, canonical.id)
			assert.equal(binding.action.expect, canonical.expect)
		}
	}
	assert.ok(canonicalApprovals > 0, 'the fixture exercises a canonical row approval')
})

test('React projection: card timelines and placement timelines cannot overwrite each other', () => {
	const e = reactProjection(fresh()).snapshot.entities
	const cardWork = e.work[e.items.A40.workId!]
	const rowWork = e.work[e.placements.A40.workId!]
	const times = cardWork.stepIds.map(id => e.workSteps[id].at)
	assert.ok(times.length > 1)
	assert.deepEqual(times, [...times].sort())
	assert.notEqual(cardWork.id, rowWork.id)
	assert.equal(cardWork.stepIds.some(id => rowWork.stepIds.includes(id)), false)
})

test('React projection: effect identities are stable when their presentation order changes', () => {
	const store = fresh(), before = reactProjection(store).snapshot.entities
	const identities = before.items.A6.changeIds.map(id => [before.changes[id].summary, id]).sort()
	const workflow = store.byCode('A6')!
	workflow.effects!.reverse()
	store.save(workflow, false)
	const after = reactProjection(store).snapshot.entities
	assert.deepEqual(after.items.A6.changeIds.map(id => [after.changes[id].summary, id]).sort(), identities)
})

test('React projection: source links expose only secure web URLs', () => {
	const store = fresh(), workflow = store.byCode('A1')!
	workflow.notes = [{
		q: 'Where is it?', a: 'Check the sources.', at: new Date().toISOString(),
		sources: ['javascript:alert(1)', 'http://example.test/plain', 'custom:unavailable', 'https://example.test/doc'].map(ref => ({ ref, tier: 'live', origin: 'extracted' })),
	}]
	store.save(workflow, false)
	const e = reactProjection(store).snapshot.entities, note = e.notes[e.items.A1.noteIds[0]]
	assert.deepEqual(note.sourceIds.map(id => e.sources[id].href), [undefined, undefined, undefined, 'https://example.test/doc'])
})

test('bug 10-22 draft promises: the projected draft promise is distinct from earlier kept to-dos', () => {
	const store = fresh(), workflow = store.byCode('A1')!
	workflow.todos = ['Update the checklist']
	workflow.kept = [{ id: 't1', text: 'An earlier promise', at: workflow.createdAt }]
	store.save(workflow, false)
	const e = reactProjection(store).snapshot.entities, item = e.items.A1
	assert.deepEqual(item.todos, ['Update the checklist'])
	assert.deepEqual(item.todoIds.map(id => e.todos[id].text), ['An earlier promise'])
	assert.ok(item.draftId)
	assert.ok(item.actionIds.includes('A1/send-edit'))
})

test('bug 10-22 draft promises: changed promises invalidate approval before submission and before apply', async () => {
	const { submitIntent, submissionReceipt } = await import('../src/web/react-submissions.ts')
	const { applyAnswers } = await import('../src/runner/apply.ts')
	const { stub } = await import('./fixture.ts')
	const processes = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
	for (const stage of ['submission', 'apply']) {
		const store = fresh(), workflow = store.byCode('A1')!
		workflow.todos = ['Update the checklist']
		store.save(workflow, false)
		const action = reactProjection(store).snapshot.entities.actions['A1/approve']
		const request = { action: action.id, item: action.item, rev: action.rev, expect: action.expect, submissionId: randomUUID() }
		if (stage === 'apply') submitIntent(store, request)
		workflow.todos = ['Update the checklist', 'Also change the release notes']
		store.save(workflow, false)
		assert.notEqual(reactProjection(store).snapshot.entities.items.A1.rev, action.rev)
		if (stage === 'submission') {
			const result = submitIntent(store, request)
			assert.equal(result.status, 409)
			assert.equal(result.receipt.refused, true)
			assert.match(result.receipt.text, /Changed since/)
			assert.deepEqual(store.answers(), [])
		} else {
			let sends = 0
			await applyAnswers(store, { ...stub, send: async () => ({ msgId: `reply-${++sends}` }) }, store.config(), processes as never)
			assert.equal(sends, 0)
			assert.match(submissionReceipt(store, request.submissionId)!.text, /Changed since/)
		}
	}
})

test('React toggle gates: a drawn Pause cannot become Resume and a queued reminder cannot change a newer schedule', async () => {
	const { submitIntent, submissionReceipt } = await import('../src/web/react-submissions.ts')
	const { applyAnswers } = await import('../src/runner/apply.ts')
	const { stub } = await import('./fixture.ts')
	const processes = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
	const request = (action: ReturnType<typeof reactProjection>['snapshot']['entities']['actions'][string]) => ({
		action: action.id, item: action.item, rev: action.rev, expect: action.expect, submissionId: randomUUID(),
	})
	for (const queued of [false, true]) {
		const store = fresh(), automation = store.automations().find(row => row.state === 'active')!
		const action = reactProjection(store).snapshot.entities.actions[`${automation.code}/toggle`], intent = request(action)
		assert.equal(action.label, 'Pause')
		if (queued) submitIntent(store, intent)
		automation.state = 'paused'
		store.saveAutomation(automation)
		assert.equal(reactProjection(store).snapshot.entities.actions[action.id].label, 'Resume')
		if (queued) {
			await applyAnswers(store, stub, store.config(), processes as never)
			assert.equal(submissionReceipt(store, intent.submissionId)!.refused, true)
		} else {
			const result = submitIntent(store, intent)
			assert.equal(result.status, 409)
			assert.equal(result.receipt.refused, true)
		}
		assert.equal(store.automation(automation.code)!.state, 'paused')
		assert.deepEqual(store.answers(), [])
	}
	const store = fresh(), action = reactProjection(store).snapshot.entities.actions['page/pause-resume']
	store.saveControl({ ...store.control(), paused: true })
	const result = submitIntent(store, request(action))
	assert.equal(result.status, 409)
	assert.equal(result.receipt.refused, true)
	assert.equal(store.control().paused, true)
	assert.deepEqual(store.answers(), [])
})
