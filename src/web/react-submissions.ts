import type { PageSubmission, Store } from '../store/state.ts'
import { enqueueParsed } from '../mcp/server.ts'
import { forPage } from './app/model/format.ts'
import { resolvePageIntent, IntentError } from './react-projection.ts'
import type { Intent, Receipt } from './react/domain/contracts.ts'
import { ulid } from '../core/ids.ts'
import { NAME } from '../brand.ts'
import { pageDigest } from '../core/page-approval.ts'

function recover(store: Store, record: PageSubmission): PageSubmission {
	if (record.phase !== 'prepared') return record
	const existing = store.answerById(record.answerId), outcome = store.outcome(record.answerId)
	const result = existing || outcome !== undefined
		? { accepted: true, ids: [record.answerId], text: `Queued. Waiting for ${NAME}.` }
		: { accepted: false, ids: [], text: 'This submission was interrupted before it was queued. Nothing was sent. Open the item again.' }
	const saved: PageSubmission = {
		...record, phase: result.accepted ? 'queued' : 'refused',
		accepted: result.accepted, ids: result.ids, text: forPage(result.text),
		status: result.accepted ? result.ids.length ? 202 : 200 : 422,
	}
	store.savePageSubmission(saved)
	return saved
}

export function submissionReceipt(store: Store, id: string): Receipt | undefined {
	const record = store.pageSubmission(id)
	if (!record) return undefined
	const saved = recover(store, record), outcomes = saved.ids.map(answerId => store.outcome(answerId))
	const applied = saved.processed || !saved.ids.length || outcomes.every(outcome => outcome !== undefined)
	const text = outcomes.length && outcomes.every(outcome => outcome !== undefined) ? forPage(outcomes.join(' ')) :
		applied ? saved.text : `Queued. Waiting for ${NAME}.`
	if (applied && !saved.processed) store.savePageSubmission({ ...saved, processed: true, text })
	return { submissionId: saved.id, item: saved.item, rev: saved.rev, ids: saved.ids, accepted: saved.accepted, applied: !!applied, text }
}

export function submitIntent(store: Store, intent: Intent): { status: number; receipt: Receipt } {
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
		phase: 'prepared', accepted: false, ids: [], text: 'Preparing your action.', status: 202,
	}
	store.savePageSubmission(record)
	const result = enqueueParsed(store, [resolved.parsed], resolved.shownAt, 'page', record.answerId, resolved.page)
	const queued: PageSubmission = { ...record, phase: result.accepted ? 'queued' : 'refused', accepted: result.accepted, ids: result.ids, text: forPage(result.text), status: result.accepted ? result.ids.length ? 202 : 200 : 422 }
	store.savePageSubmission(queued)
	return { status: queued.status, receipt: submissionReceipt(store, queued.id)! }
}
