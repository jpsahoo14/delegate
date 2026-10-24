import type { Person } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { age } from '../core/render.ts'
import * as scheduler from '../os/scheduler.ts'
import { NAME } from '../brand.ts'
import { modelsLine } from '../core/runinfo.ts'

// "status": on or off, the last run, and today's counts (R-SET-02).
export function statusText(store: Store, now = new Date()): string {
	const cfg = store.config(), c = store.control()
	const today = store.logs(1).filter(e => String(e.at ?? '').slice(0, 10) === now.toISOString().slice(0, 10))
	const lastTick = today.filter(e => e.event === 'tick').map(e => String(e.at)).sort().at(-1)
	const n = (ev: string, f: (e: Record<string, unknown>) => boolean = () => true) => today.filter(e => e.event === ev && f(e)).length
	// The same pause the send gate obeys: from chat or from config.json (final review P2-2).
	const state = c.stopped ? 'stopped' : c.paused || cfg.paused ? 'paused (drafting, not sending)' : 'on'
	return [
		`${NAME} is ${state} · auto-send ${c.autoSend ? 'on' : 'off'} · runner: ${cfg.runner ?? store.machine}${scheduler.status() ? ', in the background' : ', only when asked'}`,
		`Last check: ${lastTick ? `${age(lastTick, now)} ago` : 'not today'} · Today: ${n('sent')} sent (${n('sent', e => String(e.approvedBy ?? '').startsWith('rule:'))} by your rules), ${n('worker')} drafted, ${store.runsToday()} of ${cfg.dailyRuns ?? 200} AI runs (resets at local midnight)`,
		modelsLine(today),
		...suggestions(store),
	].join('\n')
}

// After a week, suggest letting a kind of reply go on its own when the owner always sent it unchanged (R-SET-05).
export function suggestions(store: Store): string[] {
	const started = store.chats().startedAt
	if (!started || Date.now() - Date.parse(started) < 7 * 86_400_000) return []
	// A drafting style covers no sender: it never hides the "let these go by themselves" suggestion (edit habits guard).
	const ruled = new Set(store.rules().filter(r => !r.off && !r.style).flatMap(r => r.who.accounts?.map(a => `${a.id}|${r.when.intent ?? ''}`) ?? []))
	const by = new Map<string, { who: Person; intent: string; sent: number; unchanged: number }>()
	for (const e of store.logs(30).filter(e => e.event === 'sent' && e.asker && !String(e.approvedBy ?? '').startsWith('rule:'))) {
		const who = e.asker as Person, intent = String(e.intent ?? 'other'), key = `${who.id}|${intent}`
		const s = by.get(key) ?? { who, intent, sent: 0, unchanged: 0 }
		s.sent++
		if (e.unchanged) s.unchanged++
		by.set(key, s)
	}
	return [...by.entries()].filter(([k, s]) => s.sent >= 5 && s.unchanged === s.sent && !ruled.has(k) && !ruled.has(`${s.who.id}|`))
		.slice(0, 2).map(([, s]) => `Suggestion: you sent all ${s.sent} of ${s.who.name}'s ${s.intent.replace(/_/g, ' ')} replies unchanged. To let these go out on their own, say "let ${s.who.name}'s ${s.intent.replace(/_/g, ' ')} replies send automatically".`)
}
