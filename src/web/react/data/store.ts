import { create } from 'zustand'
import { emptyEntities, revisionKey, type Entities, type Snapshot, type Receipt } from '../domain/contracts.ts'

export type CardUi = {
	editText?: string; answer?: string; ask?: string; report?: string
	editing?: boolean; picks?: number[]; excluded?: number[]; folds?: Record<string, boolean>
	composing?: boolean; interacting?: boolean
	other?: boolean; resultKind?: 'Both work' | 'Issues found' | 'Blocked'
	pending?: { submissionId: string; action: string }; result?: Receipt; error?: string
}
type Pinned = { rev: string; snapshot: Snapshot }
type DataState = {
	snapshot?: Snapshot; entities: Entities; byRevision: Record<string, CardUi>; pinned: Record<string, Pinned>
	ingest: (snapshot: Snapshot) => void
	edit: (code: string, rev: string, patch: Partial<CardUi>) => void
	showLatest: (code: string) => void
}
const dirty = (ui: CardUi) => !!(ui.editing || ui.composing || ui.interacting || ui.answer || ui.ask || ui.report || ui.pending || ui.picks || ui.excluded)
function share<T>(before: Record<string, T>, after: Record<string, T>): Record<string, T> {
	let equal = Object.keys(before).length === Object.keys(after).length
	const result: Record<string, T> = {}
	for (const id of Object.keys(after)) {
		result[id] = before[id] && JSON.stringify(before[id]) === JSON.stringify(after[id]) ? before[id] : after[id]
		if (before[id] !== result[id]) equal = false
	}
	return equal ? before : result
}
function shareEntities(before: Entities, after: Entities): Entities {
	return {
		items: share(before.items, after.items), people: share(before.people, after.people), chats: share(before.chats, after.chats),
		drafts: share(before.drafts, after.drafts), changes: share(before.changes, after.changes), sources: share(before.sources, after.sources),
		notes: share(before.notes, after.notes), work: share(before.work, after.work), planSteps: share(before.planSteps, after.planSteps),
		workSteps: share(before.workSteps, after.workSteps), todos: share(before.todos, after.todos), placements: share(before.placements, after.placements),
		actions: share(before.actions, after.actions), doneEntries: share(before.doneEntries, after.doneEntries), watches: share(before.watches, after.watches),
		automations: share(before.automations, after.automations), knowledgeProposals: share(before.knowledgeProposals, after.knowledgeProposals),
		facts: share(before.facts, after.facts), health: share(before.health, after.health), channels: share(before.channels, after.channels), waiting: share(before.waiting, after.waiting),
	}
}
export const useData = create<DataState>((set, get) => ({
	entities: emptyEntities(), byRevision: {}, pinned: {},
	ingest(snapshot) {
		const state = get(), entities = shareEntities(state.entities, snapshot.entities), next = { ...snapshot, entities }
		const pinned = Object.fromEntries(Object.entries(state.pinned).map(([code, pin]) => [code, next.entities.items[code]?.rev === pin.rev ? { ...pin, snapshot: next } : pin]))
		set({ snapshot: next, entities, pinned })
	},
	edit(code, rev, patch) {
		const state = get(), key = revisionKey(code, rev), ui = { ...state.byRevision[key], ...patch }
		const pin = state.pinned[code]
		const pinned = dirty(ui) && !pin && state.snapshot ? { ...state.pinned, [code]: { rev: state.snapshot.entities.items[code]?.rev ?? rev, snapshot: state.snapshot } } : state.pinned
		set({ byRevision: { ...state.byRevision, [key]: ui }, pinned })
	},
	showLatest(code) {
		const pinned = { ...get().pinned }
		delete pinned[code]
		set({ pinned })
	},
}))

export const IDLE: CardUi = Object.freeze({})
export function displayedSnapshot(code: string): Snapshot | undefined {
	return useData.getState().pinned[code]?.snapshot ?? useData.getState().snapshot
}
