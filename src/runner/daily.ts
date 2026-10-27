import type { Config } from '../core/types.ts'
import { NAME } from '../brand.ts'
import { age, MARK } from '../core/render.ts'
import type { Source } from '../adapters/source.ts'
import { BUSY, localDay, type Store } from '../store/state.ts'
import { sweep } from '../store/retention.ts'
import { say } from './intake.ts'
import { isBootstrap, startBootstrap } from './bootstrap.ts'
import { numbersOf, saveWeeks } from '../store/numbers.ts'
import { isFriday, weekLine } from '../core/numbers.ts'
import { dayIn } from '../core/schedule.ts'
import { pruneActions, readActions } from '../store/actions.ts'

// Counts by outcome for one local day, and every item that has waited on the owner for more than 4 hours (R-HIL-07).
export function summaryText(store: Store, now = new Date()): string | undefined {
	const day = localDay(now)
	const today = store.logs(2).filter(e => localDay(new Date(String(e.at))) === day)
	const sent = today.filter(e => e.event === 'sent')
	const byRule = sent.filter(e => String(e.approvedBy ?? '').startsWith('rule:')).length
	const actions = readActions(store, {
		since: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), until: now.toISOString(),
	}).filter(record => record.completedAt && record.parts.some(part => part.outcome === 'posted') &&
		!record.amendments.some(change => change.kind === 'undone')).length
	// Catch up replaces the old "N closed with no reply needed": what was worth knowing, the weightiest named (design-spec/catch-up.md).
	const fyi = store.workflows().filter(w => w.state === 'done' && w.fyi && localDay(new Date(w.updatedAt)) === day).sort((a, b) => Number(b.fyi!.weight === 'high') - Number(a.fyi!.weight === 'high') || b.updatedAt.localeCompare(a.updatedAt))
	const look = fyi.filter(w => w.fyi!.weight === 'high').slice(0, 2)
	const needs = store.workflows().filter(w => w.state === 'needs_human')
	const waiting = needs.filter(w => now.getTime() - Date.parse(w.revAt ?? w.updatedAt) > 4 * 3_600_000)
	// On Friday, one line from the Numbers tab: counts only, never a time (R-NEX-11).
	const week = isFriday(dayIn(now, store.config()?.tz)) ? weekLine(numbersOf(store, 'this', now)) : undefined
	if (!sent.length && !fyi.length && !needs.length && !week && !actions) return undefined
	return [
		`${MARK} Today: ${sent.length - byRule} sent by you, ${byRule} by your rules. ${needs.length} need${needs.length === 1 ? 's' : ''} you.`,
		...(actions ? [`${NAME} did ${actions} ${actions === 1 ? 'thing' : 'things'} for you today \u00b7 Review in ${NAME}.`] : []),
		...(week ? [week] : []),
		...(fyi.length ? [`Catch up: ${fyi.length} worth knowing${look.length ? `. Worth a look: ${look.map(w => `${w.asker?.name.split(/\s+/)[0] ?? 'Someone'}, ${w.fyi!.line.replace(/\.$/, '')} (${w.code})`).join('; ')}` : ''}. Say "what did I miss?" for all of it.`] : []),
		...waiting.slice(0, 6).map(w => `${w.code} ${w.asker?.name ?? 'Someone'} · waiting ${age(w.revAt ?? w.updatedAt, now)}`),
		...(waiting.length > 6 ? [`and ${waiting.length - 6} more`] : []),
		...(needs.length ? ['Say "what needs me?" to go through them.'] : []),
	].join('\n')
}

// Once a week, the history read at install is topped up with what is new since; each source starts at its checkpoint.
// Only after a first read, and never while one is still going.
export function weeklyLearning(store: Store, now = new Date()): boolean {
	const last = store.sources()['bootstrap:chats']
	if (!last || now.getTime() - Date.parse(last) < 7 * 86_400_000) return false
	if (store.jobs().some(j => isBootstrap(j) && (j.state === 'queued' || j.state === 'running'))) return false
	store.log({ event: 'weekly-learning', since: last, says: startBootstrap(store, ['chats', 'prs', 'workitems']) })
	return true
}

// Once per local day: clear old message text, and send the summary at the owner's time ("off" turns it off).
export async function daily(store: Store, src: Source, cfg: Config, now = new Date()): Promise<boolean> {
	const day = localDay(now)
	if (store.notify().sweepDay !== day) {
		// The weeks that ended get their Numbers file first, while their lines still hold the words that prove how a reply went out (R-NEX-11).
		try { saveWeeks(store, now) } catch (e) { store.log({ event: 'numbers-failed', error: String(e).slice(0, 200) }) }
		const n = sweep(store, cfg.retentionDays ?? 30, now.getTime())
		try {
			const { pruned, status } = pruneActions(store, Math.min(cfg.retentionDays ?? 30, 30), now.getTime())
			if (pruned || status === BUSY) store.log({ event: 'actions-pruned', pruned, status: status === BUSY ? 'busy' : status })
		} catch (error) {
			try { store.log({ event: 'actions-prune-failed', error: String(error).slice(0, 200) }) }
			catch { console.error(`${NAME}: action history pruning failed and its diagnostic could not be saved.`) }
		}
		store.saveNotify({ ...store.notify(), sweepDay: day })
		if (n) store.log({ event: 'retention', cleared: n })
		weeklyLearning(store, now)
	}
	const at = cfg.summaryAt ?? '18:00'
	if (at === 'off' || store.notify().summaryDay === day) return false
	const [h, m] = at.split(':').map(Number)
	if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return false
	// Marked first, so a lost reply never sends the summary twice.
	store.saveNotify({ ...store.notify(), summaryDay: day })
	const text = summaryText(store, now)
	if (!text) return false
	await say(store, src, text)
	return true
}
