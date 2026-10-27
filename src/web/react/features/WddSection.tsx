import { useRef } from 'react'
import { useEntities, useSnapshot } from '../data/hooks.ts'
import { useHold } from '../data/hide-holds.ts'
import { useWddAfterSave, useWddLookFor, useWddSeen, wddOfferMatches } from '../data/wdd-look.ts'
import { WDD_TITLE } from '../domain/wdd-words.ts'
import { ActionButton } from './ActionButton.tsx'
import { HeldLine } from './HeldLine.tsx'
import { WddRow } from './WddRow.tsx'

// WDD N1 (Designer D1; PM round 2): "Done for you" on Now, right after Waiting on you, because an open Undo window is time-critical. The
// newest 3 rows, then "+ N more ›" to Done › By Delegate. Its header "Done for you · 3 new", with Mark all reviewed on the right (6 s
// Undo in its place). Not drawn when there is nothing in it, so no "0" appears. Rows shown during this look stay while he reads.
export function WddSection() {
	const snapshot = useSnapshot(), entities = useEntities(), wdd = useWddAfterSave(snapshot?.wdd), box = useRef<HTMLElement>(null)
	const look = useWddLookFor(wdd), hold = useHold('wdd')
	const byId = new Map((wdd?.rows ?? []).map(row => [row.id, row]))
	const ids = wdd ? [...new Set([...wdd.section, ...look.shown])].filter(id => (row => !!row && !row.reviewed && !row.itemOpen)(byId.get(id))) : []
	const shownIds = new Set(ids.map(id => byId.get(id)!).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3).map(row => row.id))
	// PE v1.141 B3: a complete look only: every fresh row Done for you owes him is among the 3 rendered, and not while the hold line shows.
	useWddSeen(box, wdd, snapshot?.now, !hold && (wdd?.rows ?? []).filter(row => row.fresh && !row.reviewed && !row.itemOpen).every(row => shownIds.has(row.id)))
	if (!wdd) return null
	if (!ids.length && !hold) return null
	const rows = ids.map(id => byId.get(id)!).sort((a, b) => b.at.localeCompare(a.at)), fresh = (id: string) => byId.get(id)!.fresh || look.fresh.includes(id)
	const news = ids.filter(fresh).length, more = rows.length - 3
	// CR 15:37:28 B5: offered only while the rows retained and shown (all of `ids`) are the section the action guards and counts.
	const mark = wddOfferMatches(snapshot?.wdd, ids) ? snapshot?.pageActionIds?.map(id => entities.actions[id]).find(action => action?.kind === 'wdd-reviewed') : undefined
	return <section ref={box} className="now-section wdd-section" aria-labelledby="section-wdd" data-wdd-section>
		<div className="wdd-section-head"><h2 id="section-wdd">{WDD_TITLE}<span className="section-count"> · {news ? `${news} new` : rows.length}</span></h2>
			{mark && !hold && <ActionButton action={mark} />}</div>
		{hold ? <HeldLine item="wdd" /> : <>
			{rows.slice(0, 3).map(row => <WddRow key={row.id} row={row} fresh={fresh(row.id)} />)}
			{more > 0 && <a className="wdd-more" href="#done/by-delegate">+ {more} more ›</a>}
		</>}
	</section>
}
