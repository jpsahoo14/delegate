import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import './window-pick.css'

// D-COST PE §9 / Designer URΔ4: the Numbers window select (New and Classic), with "Custom range…": two labelled date fields in a small
// non-modal popover. The range is inclusive local days, from <= to <= today; an invalid one says why inline and blocks Apply. A chosen
// range is a window "custom:<from>:<to>", which the select then shows as "<day> to <day | today>". CR COST4d B1: today is the owner's
// day from the server (his zone, the day its validation uses), never the browser's; until it is known, Custom range… waits.
const FIXED = [['this', 'This week'], ['last', 'Last week'], ['4w', 'Last 4 weeks'], ['all', 'Since you started']]
const PICK = 'custom-pick'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dmd = (day: string) => `${DAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8))}`
export const customOf = (window: string) => { const [key, from, to] = window.split(':'); return key === 'custom' && from && to ? { from, to } : undefined }
export const rangeText = (from: string, to: string, today?: string) => `${dmd(from)} to ${to === today ? 'today' : dmd(to)}`
const problem = (from: string, to: string, today: string) => !from || !to ? undefined : from > to ? 'The first day must be on or before the last day.' : to > today ? 'Choose days up to today.' : undefined

export function WindowPick({ window, setWindow, hiddenLabel, onPicked, today }: { window: string; setWindow: (window: string) => void; hiddenLabel: string; onPicked?: () => void; today?: string }) {
	const id = useId(), select = useRef<HTMLSelectElement>(null), first = useRef<HTMLInputElement>(null), custom = customOf(window)
	const [open, setOpen] = useState(false), [from, setFrom] = useState(''), [to, setTo] = useState('')
	useEffect(() => { if (open) first.current?.focus() }, [open])
	const start = () => { if (!today) return; setFrom(custom?.from ?? addDays(today, -6)); setTo(custom?.to ?? today); setOpen(true) }
	const close = () => { setOpen(false); select.current?.focus() }
	const error = today ? problem(from, to, today) : undefined, ready = !!today && !!from && !!to && !error
	const apply = () => { if (!ready) return; setWindow(`custom:${from}:${to}`); onPicked?.(); close() }
	return <span className="window-pick">
		<label><span className={hiddenLabel}>Window</span><select ref={select} value={window} onChange={event => { const value = event.target.value; if (value === PICK) return start(); setWindow(value); onPicked?.() }}>
			{FIXED.map(([value, text]) => <option value={value} key={value}>{text}</option>)}
			{custom && <option value={window}>{rangeText(custom.from, custom.to, today)}</option>}
			<option value={PICK} disabled={!today}>Custom range…</option>
		</select></label>
		{open && <div className="window-range" role="dialog" aria-modal="false" aria-label="Custom range" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
			<label htmlFor={`${id}-from`}>From</label><input ref={first} id={`${id}-from`} type="date" value={from} max={today} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={event => setFrom(event.target.value)} />
			<label htmlFor={`${id}-to`}>To</label><input id={`${id}-to`} type="date" value={to} max={today} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={event => setTo(event.target.value)} />
			{error && <p id={`${id}-error`} role="alert" className="window-range-error">{error}</p>}
			<div className="window-range-actions"><Button type="button" disabled={!ready} onClick={apply}>Apply</Button><Button type="button" variant="outline" onClick={close}>Cancel</Button></div>
		</div>}
	</span>
}
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)