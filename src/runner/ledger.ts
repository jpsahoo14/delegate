import { isVote } from '../core/effects.ts'
import type { CallRec, Effect } from '../core/types.ts'
import type { Store } from '../store/state.ts'

// The exact call, with its arguments in a fixed order.
const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])])) : v
export const callKey = (c: NonNullable<Effect['call']>) => JSON.stringify([c.tool, sorted(c.args)])

// A change already made, by any run: the same call, and for a vote the same head (a re-approval after new commits is a new vote).
export function madeBefore(store: Store, e: Effect): CallRec | undefined {
	const r = e.call ? store.callRec(callKey(e.call)) : undefined
	return r?.state === 'done' && (!isVote(e.call) || (r.head ?? null) === (e.head ?? null)) ? r : undefined
}

// "again": the owner checked a change that may have been made, and says to make it once more.
export function clearCalling(store: Store, e: Effect) {
	const r = e.call ? store.callRec(callKey(e.call)) : undefined
	if (r?.state === 'calling') store.saveCallRec({ ...r, state: 'failed', error: 'The owner checked and said to make it again', at: new Date().toISOString() })
}
