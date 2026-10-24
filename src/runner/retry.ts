import type { Blocker, Retry } from '../core/types.ts'

// When a run falls short of its goal, the next try and its limits (design-spec/goal-retry.md).
// Delays in minutes, one per allowed try: a tool not found is tried again soon in another way, a busy service later.
export const DELAYS: Record<string, number[]> = { tool: [2, 15], transient: [5, 15, 45], budget: [2] }
const NOT_READY_HOURS = 24
// However the kinds alternate, one ask gets this many tries and this long in all.
export const MAX_TRIES = 6
const MAX_HOURS = 24
const MIN = 60_000

export type Plan = { retry: Retry; fresh: boolean } | { stop: string }

// "access" is only believed after two different routes; otherwise it is a tool not found (A34: the diff tool existed).
export function blockerOf(b: Blocker | undefined): Blocker {
	if (!b) return { kind: 'tool', why: 'The goal was not met', tried: [] }
	return b.kind === 'access' && new Set(b.tried).size < 2 ? { ...b, kind: 'tool' } : b
}

export function planRetry(prev: Retry | undefined, raw: Blocker | undefined, now = Date.now()): Plan {
	if (raw?.documentFailure === true) return { stop: `Blocked: ${raw.why}` }
	const b = blockerOf(raw)
	const tried = [...new Set([...(prev?.tried ?? []), ...b.tried])]
	const said = `${b.why}${tried.length ? `. Tried: ${tried.join('; ')}` : ''}`
	if (b.kind === 'access' || b.kind === 'asker') return { stop: b.kind === 'access' ? `Blocked: ${said}` : `Needs the asker: ${said}` }
	// The same failure again with nothing new tried will not change by trying a third time.
	// A busy service fails the same way each time, so that kind waits out its tries.
	if (prev && b.kind !== 'transient' && prev.last.kind === b.kind && prev.last.why === b.why && b.tried.every(t => prev.tried.includes(t))) return { stop: `Tried ${prev.n + 1} times; ${said}` }
	// Each kind counts its own tries: polls for a build do not use up the tries for a tool not found.
	const same = prev?.last.kind === b.kind
	const n = same ? prev!.n + 1 : 1, total = (prev?.total ?? prev?.n ?? 0) + 1
	const firstAt = prev?.firstAt ?? new Date(now).toISOString(), kindAt = same ? prev!.kindAt ?? prev!.firstAt : new Date(now).toISOString()
	if (total > MAX_TRIES || now - Date.parse(firstAt) > MAX_HOURS * 3_600_000) return { stop: `Tried ${total} times; ${said}` }
	if (b.kind === 'not_ready') {
		const at = now + Math.min(240, Math.max(10, b.retryAfterMin ?? 30)) * MIN
		if (at > Date.parse(kindAt) + NOT_READY_HOURS * 3_600_000) return { stop: `Still not ready after ${NOT_READY_HOURS} hours; ${said}` }
		return { retry: { at: new Date(at).toISOString(), n, total, firstAt, kindAt, last: b, tried }, fresh: false }
	}
	const delays = DELAYS[b.kind]
	if (n > delays.length) return { stop: `Tried ${total} times; ${said}` }
	// The last try for a tool not found starts a fresh session, so it is not led by its own earlier conclusion.
	return { retry: { at: new Date(now + delays[n - 1] * MIN).toISOString(), n, total, firstAt, kindAt, last: b, tried }, fresh: b.kind === 'tool' && n === delays.length }
}

export const capOf = (r: Retry) => (r.last.kind === 'not_ready' ? undefined : DELAYS[r.last.kind]?.length)

// What the next try is told: what fell short and what not to repeat.
export const retryNote = (r: Retry) =>
	`The last attempt fell short of the goal: ${r.last.why}.${r.tried.length ? ` Already tried, do not repeat: ${r.tried.join('; ')}.` : ''} Take a different route; search for tools by what they do before you decide one is missing.${r.last.waitFor ? ` It was waiting for ${r.last.waitFor}; check it first.` : ''}`

// The status line while a try is pending, such as "Retrying (1 of 2) at 14:32: couldn't read the diff".
export const retryStatus = (r: Retry, time: (iso: string) => string) => {
	const cap = capOf(r)
	return r.last.kind === 'not_ready' ? `Waiting${r.last.waitFor ? ` for ${r.last.waitFor}` : ''}; checking again at ${time(r.at)}: ${r.last.why}` : `Retrying (${r.n} of ${cap}) at ${time(r.at)}: ${r.last.why}`
}
