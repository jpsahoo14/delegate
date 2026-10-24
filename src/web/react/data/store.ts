import { create } from 'zustand'
import { emptyEntities, revisionKey, type Entities, type Snapshot, type Receipt, type Intent } from '../domain/contracts.ts'
import type { SubmittedForm } from './forms.ts'

export type CardUi = {
	editText?: string; answer?: string; ask?: string; report?: string
	editing?: boolean; picks?: number[]; excluded?: number[]; folds?: Record<string, boolean>
	// A card with a question and a draft has one open box (designer question-and-draft): the owner's switch, else the card's own.
	mode?: 'answer' | 'reply'
	composing?: boolean; interacting?: boolean
	focusedField?: string; feedback?: string; feedbackKind?: string; watchText?: string; watchUntil?: string; watchBy?: string
	watchByChoice?: '' | 'today' | 'fri' | 'week'
	other?: boolean; resultKind?: 'Both work' | 'Issues found' | 'Blocked'
	// unreached: the server had no record, and sending it again failed on the network; Check saved result sends it once more (#42).
	pending?: { submissionId: string; action: string; phase: 'submitting' | 'queued' | 'unknown' | 'unreached'; at?: number }; result?: Receipt; error?: string
	lastAction?: string; submittedInput?: Intent['input']
	submittedForm?: SubmittedForm; formConsumed?: string
}
type Pinned = { rev: string; snapshot: Snapshot; actionRev?: string }
export type DataState = {
	snapshot?: Snapshot; entities: Entities; byRevision: Record<string, CardUi>; pinned: Record<string, Pinned>
	receivedAt?: number
	latestResult?: Receipt
	latestError?: string
	ingest: (snapshot: Snapshot) => void
	edit: (code: string, rev: string, patch: Partial<CardUi>) => void
	showLatest: (code: string) => void
}
export function pinnedPlacements(state: Pick<DataState, 'pinned'>): Record<string, Entities['placements'][string]> {
	const rows: Record<string, Entities['placements'][string]> = {}
	for (const [code, pin] of Object.entries(state.pinned)) {
		const row = Object.values(pin.snapshot.entities.placements).find(row => row.subjects.includes(code) && row.section !== 'done')
		if (row) rows[row.id] = row
	}
	return rows
}
export const dirty = (ui: CardUi) => !!(ui.editing || ui.composing || ui.interacting || ui.focusedField || ui.feedbackKind || ui.feedback || ui.watchText !== undefined || ui.watchUntil !== undefined || ui.watchBy !== undefined || ui.answer || ui.ask || ui.report || ui.pending || ui.picks || ui.excluded || ui.other)
function share<T>(before: Record<string, T>, after: Record<string, T>): Record<string, T> {
	let equal = Object.keys(before).length === Object.keys(after).length
	const result: Record<string, T> = {}
	for (const id of Object.keys(after)) {
		const previous = before[id], value = after[id]
		const revisionChanged = typeof previous === 'object' && previous !== null && typeof value === 'object' && value !== null && 'rev' in previous && 'rev' in value && previous.rev !== value.rev
		result[id] = previous === value || previous && !revisionChanged && JSON.stringify(previous) === JSON.stringify(value) ? previous : value
		if (before[id] !== result[id]) equal = false
	}
	return equal ? before : result
}
function shareEntities(before: Entities, after: Entities): Entities {
	return {
		items: after.items, people: after.people, chats: after.chats,
		drafts: after.drafts, changes: share(before.changes, after.changes), sources: share(before.sources, after.sources),
		notes: share(before.notes, after.notes), work: share(before.work, after.work), planSteps: share(before.planSteps, after.planSteps),
		workSteps: share(before.workSteps, after.workSteps), todos: share(before.todos, after.todos), placements: after.placements,
		actions: after.actions, doneEntries: share(before.doneEntries, after.doneEntries), watches: share(before.watches, after.watches),
		automations: share(before.automations, after.automations), knowledgeProposals: share(before.knowledgeProposals, after.knowledgeProposals),
		facts: share(before.facts, after.facts), health: share(before.health, after.health), channels: share(before.channels, after.channels), waiting: share(before.waiting, after.waiting),
	}
}
export const useData = create<DataState>((set, get) => ({
	entities: emptyEntities(), byRevision: {}, pinned: {},
	ingest(snapshot) {
		performance.mark('delegate-react-redraw-start')
		const state = get(), entities = shareEntities(state.entities, snapshot.entities), next = { ...snapshot, entities }
		let byRevision = state.byRevision
		const pinned = Object.keys(state.pinned).length ? Object.fromEntries(Object.entries(state.pinned).flatMap(([code, pin]) => {
			const currentRev = next.entities.items[code]?.rev ?? next.entities.knowledgeProposals[code]?.rev
			const ui = state.byRevision[revisionKey(code, pin.actionRev ?? pin.rev)]
			const editor = state.byRevision[revisionKey(code, pin.rev)]
			const input = ui?.submittedInput, submitted = input?.text, fields = editor ?? ui
			const item = next.entities.items[code], draft = item?.draftId ? next.entities.drafts[item.draftId] : undefined
			const wordsCarried = submitted !== undefined && (draft?.text === submitted || Object.values(next.entities.doneEntries).some(row => row.code === code && row.text === submitted && ui?.result?.at && row.at >= ui.result.at))
			const changedAfterSubmit = fields?.composing || fields?.focusedField || fields?.editing && (fields.editText !== submitted || !!pin.snapshot.entities.items[code] && !wordsCarried) ||
				!!fields?.answer && fields.answer !== submitted || !!fields?.ask && fields.ask !== submitted || !!fields?.report && fields.report !== submitted ||
				!!fields?.feedback && fields.feedback !== submitted || fields?.feedbackKind && !ui?.lastAction?.endsWith(`/${fields.feedbackKind}`) ||
				fields?.watchText !== undefined && fields.watchText !== submitted || fields?.watchUntil !== undefined && fields.watchUntil !== (input?.until ?? '') ||
				fields?.watchBy !== undefined && fields.watchBy !== (input?.by ?? '') ||
				fields?.picks && JSON.stringify([...fields.picks].sort()) !== JSON.stringify([...(input?.picks ?? [])].sort()) ||
				fields?.excluded && JSON.stringify([...fields.excluded].sort()) !== JSON.stringify([...(input?.excluded ?? [])].sort()) ||
				fields?.other && !ui?.lastAction?.endsWith('/answer')
			// The owner's own submission brought this revision: adopted, never shown as someone else's change. A refusal is adopted
			// too when it carried no typed words to keep (an approval refused with the reason and a new offer: legacy E16).
			const own = ui?.result?.applied && ui.result.accepted && !ui.result.uncertain && (!ui.result.refused || !input?.text?.trim())
			if (currentRev !== pin.rev && own && !changedAfterSubmit) {
				const consumed = { editing: false, editText: undefined, answer: undefined, ask: undefined, report: undefined, other: false, feedback: undefined, feedbackKind: undefined, watchText: undefined, watchUntil: undefined, watchBy: undefined, watchByChoice: undefined }
				byRevision = { ...byRevision, [revisionKey(code, pin.rev)]: { ...fields, ...consumed }, [revisionKey(code, pin.actionRev ?? pin.rev)]: { ...ui, ...consumed } }
				return []
			}
			return [[code, currentRev === pin.rev ? { ...pin, snapshot: next } : pin]]
		})) : state.pinned
		set({ snapshot: next, entities, pinned, byRevision, receivedAt: Date.now() })
	},
	edit(code, rev, patch) {
		const state = get(), key = revisionKey(code, rev), ui = { ...state.byRevision[key], ...patch }
		const pin = state.pinned[code]
		// Only the revision on screen is pinned. A late edit to an older revision (a field's cleanup after the owner's own Draft reply
		// was adopted) never pins the newer one, which then made the owner's own new draft look like someone else's change (bug 10-23 R3).
		const shown = state.snapshot?.entities.items[code]?.rev ?? state.snapshot?.entities.knowledgeProposals[code]?.rev ?? rev
		const pinned = patch.pending && pin ? { ...state.pinned, [code]: { ...pin, actionRev: rev } } :
			dirty(ui) && !pin && state.snapshot && shown === rev ? { ...state.pinned, [code]: { rev: shown, snapshot: state.snapshot, ...(ui.pending ? { actionRev: rev } : {}) } } : state.pinned
		set({ byRevision: { ...state.byRevision, [key]: ui }, pinned, ...(patch.result ? { latestResult: patch.result } : {}), ...('error' in patch ? { latestError: patch.error } : {}) })
	},
	showLatest(code) {
		const pinned = { ...get().pinned }, pin = pinned[code], byRevision = { ...get().byRevision }
		if (pin) {
			delete byRevision[revisionKey(code, pin.rev)]
			if (pin.actionRev) delete byRevision[revisionKey(code, pin.actionRev)]
		}
		delete pinned[code]
		set({ pinned, byRevision })
	},
}))

export const IDLE: CardUi = Object.freeze({})
export function displayedSnapshot(code: string): Snapshot | undefined {
	return useData.getState().pinned[code]?.snapshot ?? useData.getState().snapshot
}
