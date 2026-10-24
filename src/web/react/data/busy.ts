import type { Snapshot } from '../domain/contracts.ts'
import { NAME } from '../brand.ts'
import { time, when } from '../domain/time.ts'

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
// R11(1b) (PM A R17): sends going out by themselves are neither working nor queued but must be findable: alone, "2 going out soon"
// over "Delegate sends them by itself · next to Kim at 21:15"; with work, one more muted line, "2 going out soon · next to Kim at 21:15".
// "Nothing running" only when nothing works, waits or is about to go out.
export function busyWords(busy: Busy): { head: string; sub?: string; also?: string; line: string; title: string; idle: boolean } {
	const reason = busyReason(busy)
	const queued = busy.queued ? `${busy.queued} queued` : undefined
	const s = busy.scheduled, soon = s ? `${s.n} going out soon` : undefined
	const nextTo = s ? `next${s.to ? ` to ${s.to}` : ''} at ${when(s.at)}` : undefined
	const work = !!busy.now || !!queued
	const head = busy.now ? `${busy.now} working now` : queued ?? soon ?? 'Nothing running'
	const sub = queued ? reason ? `${queued} · ${reason}` : queued : !work && s ? `${NAME} sends ${s.n === 1 ? 'it' : 'them'} by itself · ${nextTo}` : undefined
	return {
		head, ...(sub ? { sub } : {}), ...(work && s ? { also: `${soon} · ${nextTo}` } : {}),
		line: [busy.now && queued ? `${head} · ${queued}` : head, ...(work && soon ? [soon] : [])].join(' · '),
		title: `${NAME} works on ${busy.max} at a time.`,
		idle: !work && !s,
	}
}
