import { BUSY, type PageSubmission, type ReceiptOutcome, type Store } from '../store/state.ts'
import { enqueueParsed } from '../mcp/server.ts'
import { forPage } from './model/format.ts'
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
			const refused: PageSubmission = store.receiptFacts({ ...record, phase: 'refused', accepted: false, ids: [], processed: true, refused: true, status: error.status, text: `${error.message} Nothing was sent. Open the item again.` }, refusedOutcome(error.status))
			store.savePageSubmission(refused)
			return refused
		}
	}
	const result = existing || outcome !== undefined
		? { accepted: true, ids: [record.answerId], text: `Queued. Waiting for ${NAME}.` }
		: { accepted: false, ids: [], text: record.immediate
			? 'This action was interrupted. Its result cannot be confirmed. Check the existing item, watch or reminder before doing anything else. It will not be retried.'
			: 'This submission was interrupted before it was queued. Nothing was sent. Open the item again.' }
	const saved: PageSubmission = store.receiptFacts({
		...record, phase: result.accepted ? 'queued' : 'refused',
		accepted: result.accepted, ids: result.ids, text: forPage(result.text),
		status: result.accepted ? result.ids.length ? 202 : 200 : 422,
		uncertain: !!record.immediate && !result.accepted,
	}, { kind: result.accepted ? 'queued' : record.immediate ? 'failed' : 'refused' })
	store.savePageSubmission(saved)
	return saved
}

// The page server never waits on its thread for a receipt lock another process holds (#27 b): that process (the runner, saving the
// result) is mid-write, so what is saved now is read without the lock and without writing; the next poll sees the rest.
// A click refused by the page server: 409 means the item changed since the owner looked (the one plain reason it always has).
const refusedOutcome = (status: number): ReceiptOutcome => ({ kind: 'refused', ...(status === 409 ? { stale: true as const } : {}) })

export function submissionReceipt(store: Store, id: string): Receipt | undefined {
	const r = store.withPageSubmissionNow(id, () => readSubmissionReceipt(store, id))
	return r === BUSY ? readSubmissionReceipt(store, id, false) : r
}

function readSubmissionReceipt(store: Store, id: string, write = true): Receipt | undefined {
	const record = store.pageSubmission(id)
	if (!record) return undefined
	const saved = write ? recover(store, record) : record, outcomes = saved.ids.map(answerId => store.outcome(answerId))
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
	if (write && applied && !saved.processed) store.savePageSubmission({ ...saved, processed: true, text, refused, uncertain })
	return { submissionId: saved.id, item: saved.item, rev: saved.rev, ids: saved.ids, accepted: saved.accepted, applied: !!applied, text, refused, uncertain, at: saved.at,
		...(saved.outcome ? { outcome: saved.outcome } : {}), ...(saved.who ? { who: saved.who } : {}), ...(saved.chat ? { chat: saved.chat } : {}) }
}

export function submitIntent(store: Store, intent: Intent): { status: number; receipt: Receipt } {
	return store.withPageSubmission(intent.submissionId, () => submitLocked(store, intent))
}
// The page server's submit: it waits for the receipt lock between turns of its thread, so other requests go on meanwhile (#27 b).
// Each attempt is synchronous, so the server runs it in one read scope (around): every file is read once per attempt (#27 step 1).
export async function submitIntentWhenFree(store: Store, intent: Intent, waitMs = 10_000, around: <T>(fn: () => T) => T = fn => fn()): Promise<{ status: number; receipt: Receipt }> {
	for (const until = Date.now() + waitMs; ;) {
		const r = around(() => store.withPageSubmissionNow(intent.submissionId, () => submitLocked(store, intent)))
		if (r !== BUSY) return r
		if (Date.now() >= until) throw new IntentError(503, `Timed out waiting for this action's saved result. Check it again before acting; nothing was sent twice.`)
		await new Promise(r => setTimeout(r, 50))
	}
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
		const refused: PageSubmission = store.receiptFacts({
			id: intent.submissionId, answerId: ulid(), fingerprint, item: intent.item, rev: intent.rev, at: new Date().toISOString(),
			phase: 'refused', accepted: false, ids: [],
			text: error.message, processed: true, status: error.status, intent,
		}, refusedOutcome(error.status))
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
			const saved: PageSubmission = store.receiptFacts({ ...record, phase: immediate.accepted ? 'queued' : 'refused', accepted: immediate.accepted, text: immediate.text, processed: true, status: immediate.accepted ? 200 : 422 }, { kind: immediate.accepted ? 'done' : 'refused' })
			store.savePageSubmission(saved)
			return { status: saved.status, receipt: submissionReceipt(store, saved.id)! }
		} catch (error) {
			if (!(error instanceof IntentError)) throw error
			store.savePageSubmission(store.receiptFacts({ ...record, phase: 'refused', text: error.message, processed: true, status: error.status }, refusedOutcome(error.status)))
			return { status: error.status, receipt: submissionReceipt(store, record.id)! }
		}
	}
	if (!resolved.parsed) throw new Error('The item action has no structured answer.')
	const result = enqueueParsed(store, [resolved.parsed], resolved.shownAt, 'page', record.answerId, resolved.page, record.id)
	const completed = store.pageSubmission(record.id)
	const base: PageSubmission = { ...record, phase: result.accepted ? 'queued' : 'refused', accepted: result.accepted, ids: result.ids, text: forPage(result.text), status: result.accepted ? result.ids.length ? 202 : 200 : 422 }
	// Already completed by the runner while this request ran: its outcome stands; otherwise it waits in the queue (or was refused).
	const queued: PageSubmission = completed?.processed ? { ...base, processed: true, text: completed.text, refused: completed.refused, uncertain: completed.uncertain, outcome: completed.outcome, who: completed.who, chat: completed.chat }
		: store.receiptFacts(base, { kind: result.accepted ? 'queued' : 'refused' })
	store.savePageSubmission(queued)
	return { status: queued.status, receipt: submissionReceipt(store, queued.id)! }
}
