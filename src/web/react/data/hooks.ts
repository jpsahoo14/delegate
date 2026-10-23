import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSnapshot, submit, receipt, dismissExperienceNote, ApiError } from '../services/api.ts'
import { pendingSubmissions, rememberSubmission, forgetSubmission } from '../services/pending.ts'
import { revisionKey, type Action, type Intent, type Receipt, type Snapshot } from '../domain/contracts.ts'
import { IDLE, pinnedPlacements, useData, type CardUi } from './store.ts'
import { useNavigation } from './navigation.ts'
import { useNowLook } from './look.ts'
import { capturePageForm, consumePageForm } from './forms.ts'

declare global { interface Window { DELEGATE_POLL_MS?: number } }

export function useExperienceNote() {
	const client = useQueryClient()
	const mutation = useMutation({
		mutationFn: dismissExperienceNote,
		onSuccess: () => { void client.invalidateQueries({ queryKey: ['page'] }) },
		onError: error => console.error('Could not dismiss the experience note:', error),
	})
	return { dismiss: () => mutation.mutate(), busy: mutation.isPending, error: mutation.error?.message }
}

export function useAppData() {
	const find = useNavigation(state => state.find)
	const loaded = useRef<Snapshot | undefined>(undefined)
	const query = useQuery({
		queryKey: ['page', find], queryFn: async ({ signal }) => {
			const snapshot = await fetchSnapshot(find, signal)
			if (loaded.current !== snapshot) { useData.getState().ingest(snapshot); loaded.current = snapshot }
			return snapshot
		}, retry: false, notifyOnChangeProps: ['error'],
		structuralSharing: false,
		refetchInterval: query => window.DELEGATE_POLL_MS ?? (Object.values(query.state.data?.entities.notes ?? {}).some(note => note.answer === undefined) ||
			Object.values(useData.getState().byRevision).some(ui => ui.pending) ? 4000 : 20_000),
	})
	return query
}
export function useNowSections() {
	const sections = useData(state => state.snapshot?.sections), pins = useData(state => state.pinned), find = useNavigation(state => state.find)
	return useMemo(() => {
		const kept = pinnedPlacements(useData.getState())
		return sections?.filter(section => section.id !== 'done').map(section => {
			const ids = [...new Set([...section.ids.filter(id => !kept[id] || kept[id].section === section.id), ...Object.values(kept).filter(row => row.section === section.id).map(row => row.id)])]
			return { ...section, ids: section.id === 'catchup' && !find ? ids.slice(0, 3) : ids, total: ids.length }
		})
	}, [sections, pins, find])
}
export function useItemNavigation(id: string) {
	const sections = useNowSections(), navigate = useNavigation(state => state.navigate), find = useNavigation(state => state.find), snapshot = useSnapshot()
	const ids = ((sections ?? []).find(section => section.ids.includes(id))?.ids ?? []).filter(code => !find || snapshot?.search?.nowIds.includes(code))
	const index = ids.indexOf(id)
	return {
		position: index + 1, total: ids.length, previous: index > 0, next: index >= 0 && index < ids.length - 1,
		step: (offset: number) => { const next = ids[index + offset]; if (next) navigate(`now/${next}`) },
	}
}
export function usePlacement(id: string) {
	const row = useData(state => pinnedPlacements(state)[id] ?? state.entities.placements[id]), markers = useNowLook(state => state.markers[id])
	return useMemo(() => row && markers ? { ...row, chips: [...row.chips.filter(chip => chip.kind !== 'new' && chip.kind !== 'back'), ...markers] } : row, [row, markers])
}
export const useSnapshot = () => useData(state => state.snapshot)
export const useEntities = () => useData(state => state.entities)
export const useLatestResult = () => useData(state => state.latestResult)
export const useLatestError = () => useData(state => state.latestError)
export const usePendingCount = () => useData(state => Object.values(state.byRevision).filter(ui => ui.pending).length)
export function usePendingStatus(item: string, rev: string) {
	const ui = useCardUi(item, rev), client = useQueryClient()
	const [now, setNow] = useState(Date.now)
	useEffect(() => { if (!ui.pending) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [ui.pending?.submissionId])
	return {
		slow: !!ui.pending && now - (ui.pending.at ?? now) > 90_000,
		check: () => { if (ui.pending) void client.invalidateQueries({ queryKey: ['receipt', ui.pending.submissionId] }) },
	}
}
export function useActionWindow(expiresAt?: string) {
	const snapshot = useSnapshot(), receivedAt = useData(state => state.receivedAt)
	const [localNow, setLocalNow] = useState(Date.now)
	useEffect(() => { if (!expiresAt) return; const timer = setInterval(() => setLocalNow(Date.now()), 1000); return () => clearInterval(timer) }, [expiresAt])
	const seconds = expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - (Date.parse(snapshot?.now ?? '') + localNow - (receivedAt ?? localNow))) / 1000)) : undefined
	return { expired: seconds === 0, countdown: seconds === undefined ? undefined : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }
}
export const useItemBusy = (code: string) => useData(state => Object.entries(state.byRevision).some(([key, ui]) => key.startsWith(`${code}@`) && !!ui.pending))
export const useCardUi = (code: string, rev: string) => useData(state => state.byRevision[revisionKey(code, rev)] ?? IDLE)
export function useItemCard(code: string, fallback?: Snapshot) {
	const displayed = useData(state => state.pinned[code]?.snapshot ?? state.snapshot)
	const current = useData(state => state.entities.items[code])
	const source = displayed?.entities.items[code] ? displayed : fallback
	const item = source?.entities.items[code]
	return { item, entities: source?.entities, newer: !!item && (!current || item.rev !== current.rev) }
}
export function useKnowledgeCard(code: string) {
	const displayed = useData(state => state.pinned[code]?.snapshot ?? state.snapshot)
	const current = useData(state => state.entities.knowledgeProposals[code])
	const proposal = displayed?.entities.knowledgeProposals[code]
	return { proposal, entities: displayed?.entities, newer: !!proposal && (!current || proposal.rev !== current.rev) }
}
export function useActivityCard(code: string, id: string) {
	const pin = useData(state => state.pinned[code])
	const displayed = useData(state => state.pinned[code]?.snapshot.entities.doneEntries[id] ? state.pinned[code].snapshot : state.snapshot)
	const current = useData(state => state.entities.doneEntries[id]), currentRev = useData(state => state.entities.items[code]?.rev)
	const row = displayed?.entities.doneEntries[id], rev = displayed?.entities.items[code]?.rev ?? row?.actionIds.map(action => displayed?.entities.actions[action]?.rev).find(Boolean) ?? row?.at ?? ''
	return { row, entities: displayed?.entities, rev, blocked: !!pin && !pin.snapshot.entities.doneEntries[id], newer: !!row && (!current || !!currentRev && currentRev !== rev) }
}
export function useCardPresentation(code: string, placementId?: string, fallback?: Snapshot) {
	const card = useItemCard(code, fallback), ui = useCardUi(code, card.item?.rev ?? '')
	const entities = card.entities, item = card.item
	const placement = placementId && entities ? entities.placements[placementId] : undefined
	const actions = item && entities ? [...new Set([...item.actionIds, ...(placement?.actionIds ?? [])])].map(id => entities.actions[id]).filter(action => action.kind !== 'todo-row-done') : []
	const draft = item?.draftId && entities ? entities.drafts[item.draftId] : undefined
	const pickChanged = !!ui.picks && [...ui.picks].sort((a, b) => a - b).join(',') !== [...(item?.picked ?? [])].sort((a, b) => a - b).join(',')
	const override = ui.editing ? 'send-edit' : ui.other ? 'answer' : pickChanged ? 'pick' : ui.answer?.trim() && item?.question ? 'answer' : undefined
	const rowPrimary = placement?.kind === 'todo' ? entities?.actions[`${code}/todo-done`] :
		placement && ['track', 'check-date', 'promise', 'nobody', 'waiting-person', 'waiting-others', 'scheduled', 'watch', 'your-step', 'stopped'].includes(placement.kind) && placement.actionIds[0] ? entities?.actions[placement.actionIds[0]] : undefined
	const declaredPrimary = item?.primaryActionId && entities ? entities.actions[item.primaryActionId] : undefined
	const primary = override ? actions.find(action => action.kind === override) : rowPrimary ?? declaredPrimary ??
		actions.find(action => ['review-again', 'approve', 'pick', 'answer'].includes(action.kind)) ??
		(placement?.actionIds[0] && entities ? entities.actions[placement.actionIds[0]] : undefined)
	return { ...card, ui, draft, actions, primary, todoIds: placement?.todoIds ?? item?.todoIds ?? [] }
}
export function useEdit(code: string, rev: string) {
	return useCallback((patch: Partial<CardUi>) => useData.getState().edit(code, rev, patch), [code, rev])
}
export function useShowLatest(code: string) {
	return useCallback(() => {
		const state = useData.getState(), pinned = state.pinned[code]
		if (pinned) {
			const ui = state.byRevision[revisionKey(code, pinned.rev)]
			if (Object.entries(state.byRevision).some(([key, value]) => key.startsWith(`${code}@`) && value.pending)) return
			if (ui && (ui.editing || ui.other || ui.answer || ui.ask || ui.report || ui.feedback || ui.feedbackKind || ui.watchText !== undefined || ui.watchUntil !== undefined || ui.watchBy !== undefined) && !window.confirm('Discard your edit?')) return
		}
		state.showLatest(code)
	}, [code])
}
function complete(result: Receipt): void {
	const state = useData.getState()
	forgetSubmission(result.submissionId)
	if (state.byRevision[revisionKey(result.item, result.rev)]?.pending?.submissionId !== result.submissionId) return
	const form = state.byRevision[revisionKey(result.item, result.rev)]?.submittedForm
	const consumed = result.accepted && !result.refused && !result.uncertain && !!form && consumePageForm(form)
	state.edit(result.item, result.rev, { pending: undefined, result, error: undefined, formConsumed: consumed ? result.submissionId : undefined })
	const fresh = state.snapshot?.entities.items[result.item]
	if (fresh && fresh.rev !== result.rev && result.accepted && state.snapshot) state.ingest(state.snapshot)
}
function restorePending(): void {
	for (const entry of pendingSubmissions()) {
		const state = useData.getState(), key = revisionKey(entry.item, entry.rev)
		if (state.byRevision[key]?.pending?.submissionId === entry.submissionId) continue
		state.edit(entry.item, entry.rev, { pending: { submissionId: entry.submissionId, action: entry.action, phase: 'unknown', at: entry.at } })
	}
}
export function usePendingReceipts() {
	const client = useQueryClient()
	const byRevision = useData(state => state.byRevision)
	const [storageError, setStorageError] = useState<string>()
	useEffect(() => {
		try {
			restorePending()
		} catch (error) {
			console.error('Pending actions could not be restored:', error)
			setStorageError('Pending actions could not be restored. Do not send again until browser tab storage is available.')
		}
	}, [])
	const pending = useMemo(() => Object.entries(byRevision).flatMap(([key, ui]) => ui.pending ? [{ key, ...ui.pending }] : []), [byRevision])
	useEffect(() => { if (pending.length && storageError) setStorageError(undefined) }, [pending.length, storageError])
	const results = useQueries({ queries: pending.map(entry => ({
		queryKey: ['receipt', entry.submissionId],
		queryFn: async () => {
			const result = await receipt(entry.submissionId)
			if (result.submissionId !== entry.submissionId || revisionKey(result.item, result.rev) !== entry.key) throw new Error('The saved result does not match this action. Nothing will be retried.')
			return result
		}, retry: false, refetchInterval: window.DELEGATE_POLL_MS ?? 2000,
	})) })
	useEffect(() => {
		for (const result of results) if (result.data) {
			if (!result.data.applied) {
				const current = useData.getState().byRevision[revisionKey(result.data.item, result.data.rev)]
				if (current?.pending && current.pending.phase !== 'queued') useData.getState().edit(result.data.item, result.data.rev, { pending: { ...current.pending, phase: 'queued' }, error: undefined })
				continue
			}
			try { complete(result.data) } catch (error) {
				console.error('Could not update pending action storage:', error)
				setStorageError('The result arrived, but this browser could not update tab storage. Reload to check the saved result.')
			}
			void client.invalidateQueries({ queryKey: ['page'] })
			void client.invalidateQueries({ queryKey: ['settings'] })
		}
	}, [results, client])
	return storageError ?? (results.some(result => result.error) ? 'Could not check one or more saved results. They remain pending and will be checked again; do not send them again.' : undefined)
}
export function useAction() {
	const client = useQueryClient()
	return useCallback(async (action: Action, input?: Intent['input']) => {
		try { restorePending() } catch (error) {
			console.error('Saved actions could not be checked:', error)
			useData.getState().edit(action.item, action.rev, { error: 'Saved actions could not be read. Enable or repair tab storage before acting; no new action was sent.' })
			return
		}
		const state = useData.getState()
		if (Object.entries(state.byRevision).some(([key, ui]) => key.startsWith(`${action.item}@`) && ui.pending)) return
		const prior = state.byRevision[revisionKey(action.item, action.rev)]
		if (action.input && prior?.result && (prior.result.uncertain || prior.result.accepted && !prior.result.refused) && prior.lastAction === action.id && JSON.stringify(prior.submittedInput ?? {}) === JSON.stringify(input ?? {})) return
		if (action.needsConfirm && !window.confirm(action.meaning ?? 'Make this change?')) return
		const submissionId = crypto.randomUUID()
		const at = Date.now()
		try { rememberSubmission({ submissionId, item: action.item, rev: action.rev, action: action.id, at }) } catch (error) {
			console.error('Could not remember the submission:', error)
			state.edit(action.item, action.rev, { error: 'This browser cannot remember pending actions. Enable tab storage before sending.' })
			return
		}
		state.edit(action.item, action.rev, { pending: { submissionId, action: action.id, phase: 'submitting', at }, lastAction: action.id, submittedInput: input, submittedForm: capturePageForm(action), formConsumed: undefined, error: undefined, result: undefined })
		try {
			const result = await submit({ submissionId, action: action.id, item: action.item, rev: action.rev, expect: action.expect, input })
			if (result.submissionId !== submissionId || result.item !== action.item || result.rev !== action.rev) throw new Error('The server returned a result for another action.')
			if (result.applied) complete(result)
			else {
				const current = useData.getState().byRevision[revisionKey(action.item, action.rev)]
				if (current?.pending?.submissionId === submissionId) useData.getState().edit(action.item, action.rev, { pending: { ...current.pending, phase: 'queued' } })
			}
			void client.invalidateQueries({ queryKey: ['page'] })
			void client.invalidateQueries({ queryKey: ['settings'] })
		} catch (error) {
			if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
				forgetSubmission(submissionId)
				useData.getState().edit(action.item, action.rev, { pending: undefined, error: error.message })
				void client.invalidateQueries({ queryKey: ['page'] })
			} else {
				console.error('Submission outcome is not confirmed:', error)
				const current = useData.getState().byRevision[revisionKey(action.item, action.rev)]
				if (current?.pending?.submissionId === submissionId) useData.getState().edit(action.item, action.rev, { pending: { ...current.pending, phase: 'unknown' }, error: 'Not sure it went through. Checking the saved submission. Do not send it again.' })
			}
		}
	}, [client])
}
