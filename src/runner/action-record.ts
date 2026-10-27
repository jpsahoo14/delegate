import { randomUUID } from 'node:crypto'
import { NAME } from '../brand.ts'
import { messageLink } from '../adapters/channels.ts'
import { SendUncertain } from '../adapters/source.ts'
import { scrub } from '../core/secrets.ts'
import { currentTrace } from '../core/telemetry.ts'
import type { Workflow } from '../core/types.ts'
import { statusFields } from '../core/upgrades.ts'
import { amendAction, appendAction, becauseOf, readActions, type ActionRecord, type FoldedAction } from '../store/actions.ts'
import { freshRead } from '../store/fs.ts'
import { BUSY, type Store } from '../store/state.ts'
import { recordCommit } from './commit.ts'

export type ActionPart = ActionRecord['parts'][number]
const heldText = `${NAME} couldn't save its record of this, so it didn't send by itself.`
const healthText = `${NAME} can't save its record of what it does for you. Automatic replies wait until it can.`
const healthKey = (wf: Workflow) => `wdd-record:${wf.id}`

export function holdActionRecord(store: Store, wf: Workflow, kind: ActionRecord['kind'] = 'review'): undefined {
	const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
	wf.actionRecordTries = (wf.actionRecordTries ?? 0) + 1
	if (kind === 'ack') wf.ackRecordRetry = { trace: currentTrace()?.trace, status: wf.ackRecordRetry?.status ?? wf.status }
	Object.assign(wf, statusFields('not-sent', heldText))
	commit(false)
	store.log({ event: 'wdd-record-held', tries: wf.actionRecordTries })
	if (wf.actionRecordTries >= 3) store.setHealth(healthKey(wf), healthText)
	return undefined
}

function recorded(store: Store, wf: Workflow) {
	if (wf.actionRecordTries) {
		const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
		wf.actionRecordTries = undefined
		if (wf.status === heldText && wf.ackRecordRetry?.status !== undefined) wf.status = wf.ackRecordRetry.status
		wf.ackRecordRetry = undefined
		if (wf.statusReason?.text === heldText) wf.statusReason = undefined
		commit(false)
	}
	store.setHealth(healthKey(wf))
}

export function startAction(store: Store, wf: Workflow, kind: ActionRecord['kind'], ruleId: string | undefined, parts: ActionPart[]): ActionRecord | undefined {
	let saved: ActionRecord | typeof BUSY
	try {
		saved = appendAction(store, {
			v: 1, id: randomUUID(), at: new Date().toISOString(), kind,
			item: { code: wf.code, wf: wf.id },
			chat: { id: wf.chat.id, group: !!wf.chat.group, name: wf.chat.name },
			...(wf.asker ? { to: { id: wf.asker.id, first: wf.asker.name.split(/\s+/)[0] } } : {}),
			because: freshRead(() => becauseOf(store, ruleId ?? '')),
			parts: parts.map(part => ({ ...part, outcome: 'unconfirmed' })),
		})
	} catch {
		return holdActionRecord(store, wf, kind)
	}
	if (saved === BUSY) return holdActionRecord(store, wf, kind)
	recorded(store, wf)
	return saved
}

export function reviewAction(store: Store, wf: Workflow, run: { action?: { id: string; at: string }; rule: string }): FoldedAction | undefined {
	const ref = run.action
	try {
		const action = ref && readActions(store, { since: ref.at, until: ref.at }).find(action => action.id === ref.id)
		if (action?.kind === 'review' && action.item?.wf === wf.id &&
			(action.because.kind !== 'line' || action.because.grantId === run.rule)) return action
	} catch {
		return holdActionRecord(store, wf)
	}
	return holdActionRecord(store, wf)
}

export function completeAction(store: Store, wf: Workflow, action: Pick<ActionRecord, 'id' | 'kind'>, parts: ActionPart[], undo?: ActionRecord['undo']): boolean {
	try {
		const saved = amendAction(store, { v: 1, ref: action.id, at: new Date().toISOString(), kind: 'completed', by: 'engine', parts, ...(undo ? { undo } : {}) })
		if (saved !== BUSY && saved !== undefined) {
			store.setHealth(`wdd-incomplete:${wf.id}`)
			return true
		}
	} catch {
		// The external receipt is already durable; a missing completion must never trigger another send.
	}
	store.log({ event: 'wdd-record-incomplete', kind: action.kind })
	store.setHealth(`wdd-incomplete:${wf.id}`, `${NAME} couldn't confirm its record of an automatic action. Check Teams or the PR before trying again.`)
	return false
}

export function messagePart(text: string, chat: string, sent?: Workflow['sent'], error?: unknown): ActionPart {
	return {
		kind: 'message', text,
		...(sent ? { msgId: sent.msgId, link: messageLink(chat, sent.msgId) } : {}),
		outcome: sent ? 'posted' : error === undefined || error instanceof SendUncertain ? 'unconfirmed' : 'failed',
		...(error === undefined ? {} : { why: scrub(String(error)).slice(0, 300) }),
	}
}
