import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pageText } from '../src/web/page-text.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-react-contract-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { seedNext, seedOwned, seedChanges } = await import('./fixture.ts')
const { reactProjection } = await import('../src/web/react-projection.ts')
const { submissionReceipt } = await import('../src/web/react-submissions.ts')
const { ulid } = await import('../src/core/ids.ts')

test('React UI contract: nested test registration cannot hide browser parity cases from targeted runs', () => {
	for (const file of ['test/react-app-browser.test.ts', 'test/react-actions-api.test.ts']) {
		const source = readFileSync(file, 'utf8')
		assert.doesNotMatch(source, /^[\t ]+test\(/m, file)
		assert.ok([...source.matchAll(/^test\(/gm)].length >= (file.includes('browser') ? 20 : 7), file)
	}
})

test('React UI contract: server instructions are buttons-only without rewriting quoted user messages', () => {
	assert.equal(pageText('Answer A37 to retry with directions, or skip it.'), '')
	assert.equal(pageText('The change is blocked. Change the reply with "edit A36: text", or skip A36.'), 'The change is blocked.')
	assert.equal(pageText('Reading the results and drafting your report.'), 'Reading the results and drafting your report.')
})

test('React UI contract: every normalized reference and offered row action resolves, including parts and activity', () => {
	const store = seedOwned(seedChanges(seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-contract-')), machine: 'test' }))))
	const { snapshot } = reactProjection(store), e = snapshot.entities
	for (const row of Object.values(e.placements)) for (const id of row.actionIds) assert.ok(e.actions[id], `${row.id}: ${id}`)
	for (const row of Object.values(e.doneEntries)) {
		assert.ok(e.people[row.personId])
		for (const id of row.actionIds) assert.ok(e.actions[id], `${row.id}: ${id}`)
	}
	for (const item of Object.values(e.items)) for (const id of item.noteIds) {
		const note = e.notes[id]
		assert.ok(note)
		if (note.useActionId) assert.ok(e.actions[note.useActionId])
		for (const source of note.sourceIds) assert.ok(e.sources[source])
	}
	for (const work of Object.values(e.work)) {
		for (const id of work.planIds) assert.ok(e.planSteps[id])
		for (const id of work.stepIds) assert.ok(e.workSteps[id])
		if (work.reportActionId) assert.ok(e.actions[work.reportActionId])
	}
	for (const action of Object.values(e.actions)) if (action.effect !== 'local') {
		assert.equal(action.staleness, 'exact', action.id)
		assert.ok(action.expect, action.id)
	}
})

test('React UI contract: an interrupted immediate operation is explicitly uncertain and never replayed', () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-uncertain-')), machine: 'test' }))
	const id = randomUUID(), before = store.automations().length
	store.savePageSubmission({ id, answerId: ulid(), item: '', rev: '', fingerprint: 'fixture', at: new Date().toISOString(), phase: 'prepared', accepted: false, ids: [], text: 'Preparing', status: 202, immediate: true })
	const result = submissionReceipt(store, id)!
	assert.equal(result.uncertain, true)
	assert.equal(result.accepted, false)
	assert.match(result.text, /cannot be confirmed/)
	assert.doesNotMatch(result.text, /Nothing was sent/)
	assert.equal(store.automations().length, before)
	assert.deepEqual(store.answers(), [])
})
