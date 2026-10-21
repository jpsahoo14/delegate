import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSnapshot, submit, receipt, ApiError } from '../services/api.ts'
import { pendingSubmissions, rememberSubmission, forgetSubmission } from '../services/pending.ts'
import { revisionKey, type Action, type Intent, type Receipt } from '../domain/contracts.ts'
import { IDLE, useData, type CardUi } from './store.ts'
import { useNavigation } from './navigation.ts'

declare global { interface Window { DELEGATE_POLL_MS?: number } }

export function useAppData() {
	const find = useNavigation(state => state.find)
	const query = useQuery({ queryKey: ['page', find], queryFn: ({ signal }) => fetchSnapshot(find, signal), refetchInterval: window.DELEGATE_POLL_MS ?? 20_000, retry: false })
	useEffect(() => { if (query.data) useData.getState().ingest(query.data) }, [query.data])
	return query
}
export function useNowSections() {
	const sections = useData(state => state.snapshot?.sections), find = useNavigation(state => state.find)
	return useMemo(() => sections?.filter(section => section.id !== 'done').map(section => section.id === 'catchup' && !find ? { ...section, ids: section.ids.slice(0, 3) } : section), [sections, find])
}
export const usePlacement = (id: string) => useData(state => state.entities.placements[id])
export const useSnapshot = () => useData(state => state.snapshot)
export const useEntities = () => useData(state => state.entities)
export const useItemBusy = (code: string) => useData(state => Object.entries(state.byRevision).some(([key, ui]) => key.startsWith(`${code}@`) && !!ui.pending))
export const useCardUi = (code: string, rev: string) => useData(state => state.byRevision[revisionKey(code, rev)] ?? IDLE)
export function useItemCard(code: string) {
	const displayed = useData(state => state.pinned[code]?.snapshot ?? state.snapshot)
	const current = useData(state => state.entities.items[code])
	const item = displayed?.entities.items[code]
	return { item, entities: displayed?.entities, newer: !!item && !!current && item.rev !== current.rev }
}
export function useCardPresentation(code: string, placementId?: string) {
	const card = useItemCard(code), ui = useCardUi(code, card.item?.rev ?? '')
	const entities = card.entities, item = card.item
	const placement = placementId && entities ? entities.placements[placementId] : undefined
	const actions = item && entities ? [...new Set([...item.actionIds, ...(placement?.actionIds ?? [])])].map(id => entities.actions[id]) : []
	const draft = item?.draftId && entities ? entities.drafts[item.draftId] : undefined
	const pickChanged = !!ui.picks && ui.picks.join(',') !== (item?.picked ?? []).join(',')
	const kind = ui.editing ? 'send-edit' : ui.other ? 'answer' : item?.choices && (!draft?.preview || pickChanged) ? 'pick' :
		ui.answer?.trim() && item?.question ? 'answer' : actions.find(action => ['review-again', 'approve', 'pick', 'answer'].includes(action.kind))?.kind
	const primary = actions.find(action => action.kind === kind) ?? (placement?.actionIds[0] && entities ? entities.actions[placement.actionIds[0]] : undefined)
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
			if (ui && (ui.editing || ui.answer || ui.ask || ui.report) && !window.confirm('Discard your edit?')) return
		}
		state.showLatest(code)
	}, [code])
}
function complete(result: Receipt): void {
	const state = useData.getState()
	state.edit(result.item, result.rev, { pending: undefined, result, error: undefined })
	forgetSubmission(result.submissionId)
}
export function usePendingReceipts() {
	const client = useQueryClient()
	const byRevision = useData(state => state.byRevision)
	const [storageError, setStorageError] = useState<string>()
	useEffect(() => {
		try {
			for (const entry of pendingSubmissions()) useData.getState().edit(entry.item, entry.rev, { pending: entry })
		} catch (error) {
			console.error('Pending actions could not be restored:', error)
			setStorageError('Pending actions could not be restored. Do not send again until browser tab storage is available.')
		}
	}, [])
	const pending = useMemo(() => Object.entries(byRevision).flatMap(([key, ui]) => ui.pending ? [{ key, ...ui.pending }] : []), [byRevision])
	const results = useQueries({ queries: pending.map(entry => ({
		queryKey: ['receipt', entry.submissionId],
		queryFn: () => receipt(entry.submissionId), retry: false, refetchInterval: window.DELEGATE_POLL_MS ?? 2000,
	})) })
	useEffect(() => {
		for (const result of results) if (result.data?.applied) {
			try { complete(result.data) } catch (error) {
				console.error('Could not update pending action storage:', error)
				setStorageError('The result arrived, but this browser could not update tab storage. Reload to check the saved result.')
			}
			void client.invalidateQueries({ queryKey: ['page'] })
		}
	}, [results, client])
	return storageError
}
export function useAction() {
	const client = useQueryClient()
	return useCallback(async (action: Action, input?: Intent['input']) => {
		const state = useData.getState()
		if (Object.entries(state.byRevision).some(([key, ui]) => key.startsWith(`${action.item}@`) && ui.pending)) return
		if (action.needsConfirm && !window.confirm(action.meaning ?? 'Make this change?')) return
		const submissionId = crypto.randomUUID()
		try { rememberSubmission({ submissionId, item: action.item, rev: action.rev, action: action.id }) } catch (error) {
			console.error('Could not remember the submission:', error)
			state.edit(action.item, action.rev, { error: 'This browser cannot remember pending actions. Enable tab storage before sending.' })
			return
		}
		state.edit(action.item, action.rev, { pending: { submissionId, action: action.id }, error: undefined, result: undefined })
		try {
			const result = await submit({ submissionId, action: action.id, item: action.item, rev: action.rev, expect: action.expect, input })
			if (result.applied) complete(result)
			void client.invalidateQueries({ queryKey: ['page'] })
		} catch (error) {
			if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
				forgetSubmission(submissionId)
				useData.getState().edit(action.item, action.rev, { pending: undefined, error: error.message })
				void client.invalidateQueries({ queryKey: ['page'] })
			} else {
				console.error('Submission outcome is not confirmed:', error)
				useData.getState().edit(action.item, action.rev, { error: 'Not sure it went through. Checking the saved submission. Do not send it again.' })
			}
		}
	}, [client])
}
