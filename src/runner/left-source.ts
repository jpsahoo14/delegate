import { messageLink } from '../adapters/channels.ts'
import { adoPrNumber } from '../core/pr-refs.ts'
import { normalizeReport } from '../core/normalize-report.ts'
import type { LeftDraft, LeftSource } from '../core/left-lines.ts'
import type { Report, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { mergeLeft } from './left.ts'
import { prRefFor, prTarget } from './probe.ts'

export function leftContext(store: Store, wf: Workflow, origin: 'item' | 'your-reply' = 'item'): { source: LeftSource; reviewHead?: string } {
	const thread = store.thread(wf.id), own = origin === 'your-reply'
	const sent = wf.sent && (!wf.promise || Date.parse(wf.sent.at) >= Date.parse(wf.promise.at)) ? wf.sent : undefined
	const ownAt = sent?.at ?? wf.promise?.at ?? wf.updatedAt
	const message = own ? thread.find(item => item.byOwner && item.at === ownAt) :
		thread.find(item => item.id === wf.lastMsgId && wf.msgIds.includes(item.id)) ?? thread.filter(item => wf.msgIds.includes(item.id)).at(-1)
	const job = wf.job ? store.job(wf.job) : undefined
	const pr = prTarget(store, wf), ref = pr ? prRefFor(store, wf, pr) : undefined
	const review = wf.intent === 'pr_review' || job?.intent === 'pr_review' || /^pr:/i.test(job?.key.trim() ?? '')
	const kind: LeftSource['kind'] = own ? 'your-reply' : review ? 'review' : wf.key.type === 'pr' ? 'pr-comment' : 'chat-ask'
	const who = (own ? store.config().owner.name : message?.from.name ?? wf.asker?.name)?.trim().split(/\s+/)[0]
	const at = own ? ownAt : review ? wf.reviewBasis?.at ?? job?.result?.at ?? job?.reviewStart?.at ?? wf.prReadAt ?? message?.at ?? wf.createdAt : message?.at ?? wf.createdAt
	const msgId = own ? sent?.msgId ?? wf.promise?.msgId ?? message?.id : message?.id
	const prThread = wf.key.type === 'pr' && pr && wf.key.id.startsWith('https://') && adoPrNumber(wf.key.id) === pr ? wf.key.id : undefined
	const href = kind === 'review' || kind === 'pr-comment' ? prThread ?? (ref?.url?.startsWith('https://') ? ref.url : undefined) :
		msgId && wf.chat.id ? messageLink(wf.chat.id, msgId) : undefined
	return { source: { kind, at, ...(who ? { who } : {}), ...(pr ? { pr } : {}), ...(href ? { href } : {}) },
		...(kind === 'review' && job?.result?.reviewHead ? { reviewHead: job.result.reviewHead } : {}) }
}

export const reportLeft = (report: Report): LeftDraft[] => normalizeReport(report).refused.map(({ what: _what, target: _target, reason, ...draft }) => ({ ...draft, why: reason }))

export function leaveForYou(store: Store, wf: Workflow, drafts: LeftDraft[], context?: ReturnType<typeof leftContext>) {
	if (!drafts.length) return []
	const placedContext = context ?? leftContext(store, wf)
	const placed = drafts.map(draft => {
		const pr = draft.action.pr
		if (draft.pr || !pr) return draft
		const href = prRefFor(store, wf, pr)?.url
		return href?.startsWith('https://') ? { ...draft, pr: { id: pr, href } } : draft
	})
	return mergeLeft(wf, placed, placedContext.source, placedContext.reviewHead)
}
