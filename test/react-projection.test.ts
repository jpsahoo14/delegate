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
