import type { Store } from '../store/state.ts'
import type { Workflow } from '../core/types.ts'
import { whoseMove } from '../core/whose.ts'
import { hashOf } from '../knowledge/format.ts'
import { factsOf, snapshot } from '../web/next.ts'

// Where each item stands for the new page, and when it really changed (N1b, dev-spec/new-experience.md §0). The runner stamps
// both once per cycle:
// - place: { section, rule, since } whenever whoseMove's result for the item changes. since moves only when the section does,
//   so "Back to you" (place.since) means it entered Your move, never that another rule keeps it there (review P1-1).
// - changedAt: only on a real change: a new turn (a new ask), a new draft by Delegate, a news step, or a move into Your move.
//   Moves between Working and Waiting are Delegate's own scheduling (a stop, the daily limit, run slots), not news (review P1-3).
//   Never on a save alone: a build check saves every home every 10 minutes (runner/probe.ts), so updatedAt is noise.
// A watch's changedAt keeps its own meaning, a new check result (runner/jobs.ts finishCheck), which classic and Now's
// "Changed" read; a watch moving does not touch it.
// Done items are stamped once, when they close, and never again (review P2-2). Each save re-reads the item and sets only these
// two fields, so a write by another process after the snapshot stays (review P2-3). Stamping never touches updatedAt.

// What the owner has seen of an item, in its parts: the last ask, Delegate's last draft, the latest news step.
type Sig = { turn: string; draft: string; news: string }
const parse = (sig?: string): Sig | undefined => { if (!sig) return undefined; const [turn = '', draft = '', news = ''] = sig.split('|'); return { turn, draft, news } }
function sigOf(wf: Workflow, was?: Sig): Sig {
	// The owner's own edit is not news to the owner: Delegate's last draft stands until Delegate writes another.
	const d = wf.draft?.text && !wf.draft.byOwner ? hashOf(wf.draft.text) : was?.draft ?? ''
	const news = (wf.work?.steps ?? []).filter(s => s.news).map(s => s.at).sort().at(-1) ?? ''
	return { turn: wf.lastMsgId ?? '', draft: d, news }
}
const OPEN = new Set(['move', 'working', 'waiting'])

// Returns how many items it saved.
export function stampPlaces(store: Store, now = Date.now()): number {
	const s = snapshot(store, now), at = new Date(now).toISOString()
	// The first stamp after an upgrade marks nothing new. After it, an item never stamped is new: made since (from when it was
	// made), or closed before the upgrade and asked again (from now).
	const first = store.probeMark().placedAt
	let n = 0
	for (const wf of s.workflows.filter(w => w.code)) {
		// A done item is stamped only when it closes: its old place was open.
		if (wf.state === 'done' && (!wf.place || !OPEN.has(wf.place.section))) continue
		const { section, rule } = whoseMove(factsOf(s, { kind: 'item', wf }))
		const was = wf.place, prev = parse(was?.sig), sig = sigOf(wf, prev), key = `${sig.turn}|${sig.draft}|${sig.news}`
		if (was?.section === section && was.rule === rule && was.sig === key) continue
		let changedAt = wf.changedAt
		if (!was) { if (first && wf.kind !== 'tracker') changedAt = wf.createdAt > first ? wf.createdAt : at }
		else if (wf.kind !== 'tracker') {
			const real = sig.turn !== prev?.turn || sig.draft !== (prev?.draft ?? '') || sig.news > (prev?.news ?? '')
			const moved = was.section !== section && section === 'move'
			if (real || moved) changedAt = at
		}
		const since = !was ? wf.createdAt : was.section === section ? was.since : at
		const cur = store.workflow(wf.id)
		if (!cur) continue
		store.save({ ...cur, place: { section, rule, since, sig: key }, ...(changedAt ? { changedAt } : {}) }, false)
		n++
	}
	if (!first) store.saveProbeMark({ ...store.probeMark(), placedAt: at })
	return n
}
