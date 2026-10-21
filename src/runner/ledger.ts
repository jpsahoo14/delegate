import { isVote, voteValue } from '../core/effects.ts'
import type { CallRec, Effect } from '../core/types.ts'
import type { Store } from '../store/state.ts'

// The exact call, with its arguments in a fixed order and text without edge spaces. A vote is keyed by its PR, not its value:
// it is a state, so the latest vote cast is what counts (review 10-21e P2-1, P2-4).
const sorted = (v: unknown): unknown => typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])])) : v
export const callKey = (c: NonNullable<Effect['call']>) => JSON.stringify([c.tool, sorted(isVote(c) ? { ...c.args, vote: undefined } : c.args)])
const voteOf = (c?: Effect['call']) => (isVote(c) ? String(voteValue(c) ?? c!.args.vote ?? '') : undefined)

// A change already made, by any run: the same call, and for a vote the same value at the same head (a re-approval after new commits is a new vote).
export function madeBefore(store: Store, e: Effect): CallRec | undefined {
	const r = e.call ? store.callRec(callKey(e.call)) : undefined
	return r?.state === 'done' && (!isVote(e.call) || ((r.head ?? null) === (e.head ?? null) && r.vote === voteOf(e.call))) ? r : undefined
}

// May have been made: a list says so, or the ledger has a call with no answer. A vote only sets a state, so it never waits (review 10-21e P1-1).
export const maybeOf = (store: Store, e: Effect) => !!e.maybe || (!!e.call && !isVote(e.call) && store.callRec(callKey(e.call))?.state === 'calling')

// The ledger record make_change writes for a call.
export const ledgerRec = (e: Effect, r: Omit<CallRec, 'call' | 'head' | 'vote' | 'at'>): CallRec => ({ call: callKey(e.call!), head: e.head, vote: voteOf(e.call), at: new Date().toISOString(), ...r })

// "again": the owner checked a change that may have been made, and says to make it once more.
export function clearCalling(store: Store, e: Effect) {
	const r = e.call ? store.callRec(callKey(e.call)) : undefined
	if (r?.state === 'calling') store.saveCallRec({ ...r, state: 'failed', error: 'The owner checked and said to make it again', at: new Date().toISOString() })
}
