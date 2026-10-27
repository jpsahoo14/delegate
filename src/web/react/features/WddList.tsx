import { useEffect, useRef } from 'react'
import { useSnapshot } from '../data/hooks.ts'
import { useWddAfterSave, useWddLookFor, useWddSeen } from '../data/wdd-look.ts'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { WDD_KINDS, WDD_OLD, wddDay, wddDayLabel, wddEmpty } from '../domain/wdd-words.ts'
import { NAME } from '../brand.ts'
import { Button } from '../components/ui/button.tsx'
import { WddRow } from './WddRow.tsx'

// WDD N1 (Designer D1/D5/D6): Done › By Delegate, the history of what Delegate did by itself, by day, 30 days, in both experiences.
// done/by-delegate[/<kind> | /<record id> | /<YYYY-MM-DD>]: a kind chip filters; a record id (the self-chat link) opens that row; a day
// (the daily summary link) opens that day's heading.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, DAY = /^\d{4}-\d{2}-\d{2}$/
export const wddTarget = (route: string) => (part => ({ kind: part && Object.hasOwn(WDD_KINDS, part) ? part : 'all', id: part && UUID.test(part) ? part : undefined, day: part && DAY.test(part) ? part : undefined }))(route.split('/')[2])

// The By Delegate chip at the front of Done's filter row (D1), a toggle; on, the kind chips filter what Delegate did.
export function ByDelegateChip({ classic = false }: { classic?: boolean }) {
	const snapshot = useSnapshot(), { route, href, navigate } = useScreenNavigation(), on = route.split('/')[1] === 'by-delegate'
	if (!snapshot?.wdd) return null
	const label = `By ${NAME}`, fresh = snapshot.wdd.fresh
	return classic ? <a href={href(on ? 'done' : 'done/by-delegate')} aria-pressed={on} aria-current={on ? 'page' : undefined}>{label}{fresh > 0 && <small>{fresh} new</small>}</a>
		: <Button aria-pressed={on} variant={on ? 'default' : 'outline'} onClick={() => navigate(on ? 'done' : 'done/by-delegate')}>{label}{fresh > 0 && <small>{fresh} new</small>}</Button>
}
export function WddKindChips({ classic = false }: { classic?: boolean }) {
	const snapshot = useSnapshot(), { route, href, navigate } = useScreenNavigation(), rows = snapshot?.wdd?.rows ?? [], { kind } = wddTarget(route)
	return <>{Object.entries(WDD_KINDS).map(([key, value]) => {
		const count = rows.filter(row => value.kinds.includes(row.kind)).length, to = key === 'all' ? 'done/by-delegate' : `done/by-delegate/${key}`
		if (key !== 'all' && !count) return null
		return classic ? <a key={key} href={href(to)} aria-current={kind === key ? 'page' : undefined} aria-pressed={kind === key}>{value.label} <span>{count}</span></a>
			: <Button key={key} aria-label={value.label} aria-pressed={kind === key} variant={kind === key ? 'default' : 'outline'} onClick={() => navigate(to)}>{value.label} <span className="count">{count}</span></Button>
	})}</>
}

export function WddList({ classic = false }: { classic?: boolean }) {
	const snapshot = useSnapshot(), wdd = useWddAfterSave(snapshot?.wdd), { route } = useScreenNavigation(), box = useRef<HTMLDivElement>(null)
	const look = useWddLookFor(wdd)
	const { kind, id, day } = wddTarget(route)
	const rows = (wdd?.rows ?? []).filter(row => WDD_KINDS[kind].kinds.includes(row.kind)), shown = new Set(rows.map(row => row.id))
	// PE v1.141 B3: a complete look only: no landing target, and every fresh row is among the rows rendered (a kind chip can hide one).
	useWddSeen(box, wdd, snapshot?.now, !id && !day && (wdd?.rows ?? []).filter(row => row.fresh).every(row => shown.has(row.id)))
	const days = [...new Set(rows.map(row => wddDay(row.at)))]
	const missing = !!id && !!wdd && !wdd.rows.some(row => row.id === id)
	// Landing (D5): the record's row, expanded and focused; the day's heading.
	useEffect(() => {
		const target = id ? document.getElementById(`wdd-${id}`) : day ? document.getElementById(`wdd-day-${day}`) : undefined
		if (target) { target.scrollIntoView({ block: 'start' }); if (id) target.focus({ preventScroll: true }) }
	}, [id, day, !!wdd])
	if (!wdd) return null
	return <div ref={box} className="wdd-list" aria-label={`What ${NAME} did for you`} role="region">
		{missing && <p className="muted" role="status">{WDD_OLD}</p>}
		{rows.length ? days.map(at => <section key={at} aria-labelledby={`wdd-day-${at}`}>
			<h2 className={classic ? 'classic-section-heading wdd-day' : 'section-h wdd-day'} id={`wdd-day-${at}`} tabIndex={-1}>{wddDayLabel(at)}</h2>
			{rows.filter(row => wddDay(row.at) === at).map(row => <WddRow key={row.id} row={row} classic={classic} open={row.id === id} fresh={row.fresh || look.fresh.includes(row.id)} />)}
		</section>) : <p className="empty">{wddEmpty(wdd, snapshot?.now)}</p>}
	</div>
}
