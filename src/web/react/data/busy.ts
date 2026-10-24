import type { Snapshot } from '../domain/contracts.ts'
import { NAME } from '../brand.ts'
import { time } from '../domain/time.ts'

type Busy = NonNullable<Snapshot['busy']>

// Why the queued ones wait (R11(1), PM §1): the AI hold with its resume time, paused, Delegate off or at its limit, else run slots.
export function busyReason(busy: Busy): string | undefined {
	const r = busy.reason
	if (!r) return undefined
	return r.kind === 'ai' ? `AI limit reached${r.at && Number.isFinite(Date.parse(r.at)) ? `, resumes at ${time(new Date(r.at))}` : ''}`
		: r.kind === 'paused' ? 'paused' : r.kind === 'off' ? r.text ?? `${NAME} is off` : `they start as ${NAME} finishes others`
}

// "3 working now" over "15 queued · they start as Delegate finishes others"; none working: "15 queued" over the same subline; neither:
// "Nothing running". Never "N running" for queued work. line: the one-line form for headers and the Now summary.
export function busyWords(busy: Busy): { head: string; sub?: string; line: string; title: string; idle: boolean } {
	const reason = busyReason(busy)
	const queued = busy.queued ? `${busy.queued} queued` : undefined
	const head = busy.now ? `${busy.now} working now` : queued ?? 'Nothing running'
	return {
		head, ...(queued ? { sub: reason ? `${queued} · ${reason}` : queued } : {}),
		line: busy.now && queued ? `${head} · ${queued}` : head,
		title: `${NAME} works on ${busy.max} at a time.`,
		idle: !busy.now && !busy.queued,
	}
}
