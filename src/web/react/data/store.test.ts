import { beforeEach, describe, expect, it } from 'vitest'
import { emptyEntities, intentSchema, revisionKey, snapshotSchema, type Snapshot } from '../domain/contracts.ts'
import { useData } from './store.ts'

function snapshot(rev = 'one'): Snapshot {
	const entities = emptyEntities()
	entities.items.A1 = { id: 'A1', code: 'A1', rev, type: 'reply', personId: 'person', chatId: 'chat', at: 'now', thread: [], newCount: 0,
		changeIds: [], sourceIds: [], noteIds: [], todoIds: [], actionIds: [], why: { gaps: [] }, status: 'Needs you' }
	return {
		schemaVersion: 1, fetchedAt: 'now', now: 'now', owner: 'Robin', entities, sections: [], seen: {},
		status: { state: 'on', autoSend: false, runs: 0, cap: 200, reading: { state: 'ok' } },
		summary: { handled: 0, minute: { facts: 0, suggestions: 0 }, catchup: { count: 0, worth: 0 } },
	}
}
beforeEach(() => useData.setState({ snapshot: undefined, entities: emptyEntities(), byRevision: {}, pinned: {} }))
describe('normalized revision store', () => {
	it('unchanged entities preserve reference identity across refresh', () => {
		useData.getState().ingest(snapshot())
		const first = useData.getState().entities.items.A1
		useData.getState().ingest(snapshot())
		expect(useData.getState().entities.items.A1).toBe(first)
	})
	it('dirty and pending cards stay pinned while fresh data advances', () => {
		useData.getState().ingest(snapshot())
		useData.getState().edit('A1', 'one', { editText: 'Composing words', editing: true })
		useData.getState().ingest(snapshot('two'))
		expect(useData.getState().pinned.A1.rev).toBe('one')
		expect(useData.getState().entities.items.A1.rev).toBe('two')
		expect(useData.getState().byRevision[revisionKey('A1', 'two')]).toBeUndefined()
		useData.getState().showLatest('A1')
		expect(useData.getState().pinned.A1).toBeUndefined()
		expect(useData.getState().byRevision[revisionKey('A1', 'two')]).toBeUndefined()
	})
	it('rejects incompatible versions and malformed nested entities at the edge', () => {
		expect(snapshotSchema.safeParse(snapshot()).success).toBe(true)
		expect(snapshotSchema.safeParse({ ...snapshot(), schemaVersion: 2 }).success).toBe(false)
		const malformed = snapshot()
		Reflect.set(malformed.entities.items.A1, 'changeIds', 'not a list')
		expect(snapshotSchema.safeParse(malformed).success).toBe(false)
	})
	it('accepts text as an opaque field and refuses extra command fields', () => {
		const intent = { submissionId: crypto.randomUUID(), action: 'A1/answer', item: 'A1', rev: 'one', input: { text: 'Tuesday, ok A9' } }
		expect(intentSchema.parse(intent).input!.text).toBe('Tuesday, ok A9')
		expect(intentSchema.safeParse({ ...intent, command: 'ok A9' }).success).toBe(false)
	})
	it('tolerates additive response fields, kinds and sections without losing the snapshot', () => {
		const next = snapshot()
		next.entities.items.A1.type = 'future-body'
		next.sections.push({ id: 'future-section', label: 'Another section', ids: ['A1'] })
		next.entities.actions.future = { id: 'future', item: 'A1', rev: 'one', kind: 'future-action', label: 'Another action', effect: 'local', staleness: 'none', input: 'future-input' }
		const parsed = snapshotSchema.parse({ ...next, additiveMetadata: 'safe to ignore' })
		expect(parsed.entities.items.A1.type).toBe('future-body')
		expect(parsed.entities.actions.future.kind).toBe('future-action')
		expect(parsed.sections[0].id).toBe('future-section')
	})
	it('keeps submitted edited words when a processed action did not carry them into the new data', () => {
		useData.getState().ingest(snapshot())
		useData.getState().edit('A1', 'one', { editing: true, editText: 'My exact words', submittedInput: { text: 'My exact words' },
			result: { submissionId: 'saved', item: 'A1', rev: 'one', ids: [], applied: true, accepted: true, text: 'Source changed' } })
		useData.getState().ingest(snapshot('two'))
		expect(useData.getState().pinned.A1.rev).toBe('one')
		expect(useData.getState().byRevision['A1@one'].editText).toBe('My exact words')
	})
	it('never consumes an uncertain submission and explicit discard removes the old revision edit', () => {
		useData.getState().ingest(snapshot())
		useData.getState().edit('A1', 'one', { answer: 'My answer', submittedInput: { text: 'My answer' },
			result: { submissionId: 'saved', item: 'A1', rev: 'one', ids: [], applied: true, accepted: true, uncertain: true, text: 'Cannot confirm' } })
		useData.getState().ingest(snapshot('two'))
		expect(useData.getState().pinned.A1.rev).toBe('one')
		useData.getState().showLatest('A1')
		expect(useData.getState().byRevision['A1@one']).toBeUndefined()
	})
})
