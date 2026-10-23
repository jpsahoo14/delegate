import type { PageSubmission, Store } from '../store/state.ts'
import { enqueueParsed } from '../mcp/server.ts'
import { forPage } from './app/model/format.ts'
import { resolvePageIntent, IntentError } from './react-projection.ts'
import type { Intent, Receipt } from './react/domain/contracts.ts'
import { ulid } from '../core/ids.ts'
import { NAME } from '../brand.ts'
import { pageDigest } from '../core/page-approval.ts'
import { pageText } from './page-text.ts'

function recover(store: Store, record: PageSubmission): PageSubmission {
	if (record.phase !== 'prepared') return record
	const existing = store.answerById(record.answerId), outcome = store.outcome(record.answerId)
	if (!existing && outcome === undefined && !record.immediate && record.intent) {
		try { resolvePageIntent(store, record.intent) } catch (error) {
			if (!(error instanceof IntentError)) throw error
			const refused: PageSubmission = { ...record, phase: 'refused', accepted: false, ids: [], processed: true, refused: true, status: error.status, text: `${error.message} Nothing was sent. Open the item again.` }
			store.savePageSubmission(refused)
			return refused
		}
	}
	const result = existing || outcome !== undefined
		? { accepted: true, ids: [record.answerId], text: `Queued. Waiting for ${NAME}.` }
		: { accepted: false, ids: [], text: record.immediate
			? 'This action was interrupted. Its result cannot be confirmed. Check the existing item, watch or reminder before doing anything else. It will not be retried.'
			: 'This submission was interrupted before it was queued. Nothing was sent. Open the item again.' }
	const saved: PageSubmission = {
		...record, phase: result.accepted ? 'queued' : 'refused',
		accepted: result.accepted, ids: result.ids, text: forPage(result.text),
		status: result.accepted ? result.ids.length ? 202 : 200 : 422,
		uncertain: !!record.immediate && !result.accepted,
	}
	store.savePageSubmission(saved)
	return saved
}

export function submissionReceipt(store: Store, id: string): Receipt | undefined {
	return store.withPageSubmission(id, () => readSubmissionReceipt(store, id))
}

function readSubmissionReceipt(store: Store, id: string): Receipt | undefined {
	const record = store.pageSubmission(id)
	if (!record) return undefined
	const saved = recover(store, record), outcomes = saved.ids.map(answerId => store.outcome(answerId))
	const applied = saved.processed || !saved.ids.length || outcomes.every(outcome => outcome !== undefined) || saved.ids.every(id => store.answered(id))
	const lostDetails = applied && saved.ids.length > 0 && !saved.processed && outcomes.some(outcome => outcome === undefined)
	const recorded = pageText(outcomes.join(' '))
	const current = store.byCode(saved.item)
	const missingDetail = current && pageText(current.status) ? `Current item: ${pageText(current.status)}` : 'No result detail was recorded. Open the item to verify what happened.'
	const text = lostDetails ? 'The saved action was processed, but its detailed result is no longer available. Check the current item before acting; it will not be resent.' :
		outcomes.length && outcomes.every(outcome => outcome !== undefined) ? recorded || missingDetail :
		applied ? pageText(saved.text) || missingDetail : `Queued. Waiting for ${NAME}.`
	const refused = !!saved.refused || !saved.accepted || saved.ids.some(id => store.outcomeRefused(id))
	const uncertain = !!saved.uncertain || !!lostDetails
	if (applied && !saved.processed) store.savePageSubmission({ ...saved, processed: true, text, refused, uncertain })
	return { submissionId: saved.id, item: saved.item, rev: saved.rev, ids: saved.ids, accepted: saved.accepted, applied: !!applied, text, refused, uncertain, at: saved.at }
}

export function submitIntent(store: Store, intent: Intent): { status: number; receipt: Receipt } {
	return store.withPageSubmission(intent.submissionId, () => submitLocked(store, intent))
}

function submitLocked(store: Store, intent: Intent): { status: number; receipt: Receipt } {
	const fingerprint = pageDigest(intent), previous = store.pageSubmission(intent.submissionId)
	if (previous) {
		if (previous.fingerprint !== fingerprint) throw new IntentError(422, 'That submission identity was already used for a different action.')
		const receipt = submissionReceipt(store, previous.id)!
		return { status: store.pageSubmission(previous.id)!.status, receipt }
	}
	let resolved: ReturnType<typeof resolvePageIntent>
	try { resolved = resolvePageIntent(store, intent) } catch (error) {
		if (!(error instanceof IntentError)) throw error
		const refused: PageSubmission = {
			id: intent.submissionId, answerId: ulid(), fingerprint, item: intent.item, rev: intent.rev, at: new Date().toISOString(),
			phase: 'refused', accepted: false, ids: [],
			text: error.message, processed: true, status: error.status,
		}
		store.savePageSubmission(refused)
		return { status: error.status, receipt: submissionReceipt(store, refused.id)! }
	}
	const record: PageSubmission = {
		id: intent.submissionId, answerId: ulid(), fingerprint, item: intent.item, rev: intent.rev, at: new Date().toISOString(),
		phase: 'prepared', accepted: false, ids: [], text: 'Preparing your action.', status: 202, immediate: !!resolved.execute, intent,
	}
	store.savePageSubmission(record)
	if (resolved.execute) {
		try {
			const immediate = resolved.execute()
			const saved: PageSubmission = { ...record, phase: immediate.accepted ? 'queued' : 'refused', accepted: immediate.accepted, text: immediate.text, processed: true, status: immediate.accepted ? 200 : 422 }
			store.savePageSubmission(saved)
			return { status: saved.status, receipt: submissionReceipt(store, saved.id)! }
		} catch (error) {
			if (!(error instanceof IntentError)) throw error
			store.savePageSubmission({ ...record, phase: 'refused', text: error.message, processed: true, status: error.status })
			return { status: error.status, receipt: submissionReceipt(store, record.id)! }
		}
	}
	if (!resolved.parsed) throw new Error('The item action has no structured answer.')
	const result = enqueueParsed(store, [resolved.parsed], resolved.shownAt, 'page', record.answerId, resolved.page, record.id)
	const completed = store.pageSubmission(record.id)
	const queued: PageSubmission = { ...record, phase: result.accepted ? 'queued' : 'refused', accepted: result.accepted, ids: result.ids, text: forPage(result.text), status: result.accepted ? result.ids.length ? 202 : 200 : 422,
		...(completed?.processed ? { processed: true, text: completed.text, refused: completed.refused, uncertain: completed.uncertain } : {}),
	}
	store.savePageSubmission(queued)
	return { status: queued.status, receipt: submissionReceipt(store, queued.id)! }
}
