import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Numbers } from '../domain/screens.ts'
import { fetchUsage } from '../services/api.ts'
import './ai-use.css'

// COST-USAGE + D-COST: Numbers › AI USE, the same in New and Classic (pm-usage-cost.md and pm-cost-control.md PM FINAL; Designer AU1-AU5,
// UR1-UR3, URΔ). The server sends the words and cells; this draws them. Its numbers are not links (PM rule-2 exception), unknown and
// "not reported" are words, and credits appear only as the server's source-backed figure or its "not reported" state.
type Usage = NonNullable<Numbers['usage']>
type Table = Usage['kinds']
type Cell = Table['total']['cells'][number]
type Bars = NonNullable<Usage['bars']>['week']

const value = (cell: Cell) => cell.unknown ? <span className="ai-unknown">{cell.text}</span> : cell.muted ? <span className="ai-muted-cell">{cell.text}</span> : cell.title ? <abbr title={cell.title}>{cell.text}</abbr> : cell.text

function UsageTable({ caption, head, table }: { caption: string; head: string; table: Table }) {
	return <table className="ai-table">
		<caption>{caption}</caption>
		<thead><tr><th scope="col">{head}</th>{table.columns.map(column => <th scope="col" key={column.text} title={column.title}>{column.text}</th>)}</tr></thead>
		<tbody>{table.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.cells.map((cell, i) => <td key={i} data-col={table.columns[i]?.text}>{value(cell)}</td>)}</tr>)}</tbody>
		<tfoot><tr><th scope="row">Total</th>{table.total.cells.map((cell, i) => <td key={i} data-col={table.columns[i]?.text}>{value(cell)}</td>)}</tr>
			{table.total.note && <tr><td colSpan={table.columns.length + 1} className="ai-total-note">{table.total.note}</td></tr>}</tfoot>
	</table>
}

// URΔ1/URΔ6: the credits help is a button that opens a small non-modal dialog (it works on touch, not hover-only); Esc or the button
// closes it and focus returns to the button.
function CreditsHelp({ help }: { help: string }) {
	const id = useId(), [open, setOpen] = useState(false), button = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null)
	useEffect(() => { if (open) box.current?.focus() }, [open])
	const close = () => { setOpen(false); button.current?.focus() }
	return <span className="ai-help">
		<button ref={button} type="button" className="ai-help-button" aria-label="About credits" aria-expanded={open} aria-controls={`${id}-help`} onClick={() => (open ? close() : setOpen(true))}>ⓘ</button>
		{open && <div ref={box} id={`${id}-help`} className="ai-help-pop" role="dialog" aria-modal="false" aria-label="About credits" tabIndex={-1} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
			<p>{help}</p><button type="button" className="ai-help-close" onClick={close}>Close</button></div>}
	</span>
}

// UR1.3/URΔ3/UR3: a two-option switch, a radio group that keyboard arrows move through and that announces its selection.
function Switch<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; text: string }[]; value: T; onChange: (v: T) => void }) {
	const refs = useRef<(HTMLButtonElement | null)[]>([])
	const move = (i: number) => { const n = (i + options.length) % options.length; onChange(options[n].value); refs.current[n]?.focus() }
	return <span className="ai-switch" role="radiogroup" aria-label={label}>{options.map((o, i) => <button key={o.value} ref={b => { refs.current[i] = b }} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1}
		onClick={() => onChange(o.value)} onKeyDown={event => { const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]; if (d) { event.preventDefault(); move(i + d) } }}>{o.text}</button>)}</span>
}

const SEGS = { tokens: ['ai-seg-in', 'ai-seg-cached', 'ai-seg-out'], whole: ['ai-seg-whole', 'ai-seg-out'], credits: ['ai-seg-credits'] }
// UR1.3: stacked bars (in, cached, out), each segment with its own fill and pattern; a bar with no figure is an empty dashed bar with its word.
function UsageBars({ bars, by, show }: { bars: Bars; by: 'week' | 'day'; show: 'tokens' | 'credits' }) {
	const list = bars[show], whole = show === 'tokens' && list.some(bar => bar.whole), off = [...new Set(list.flatMap(bar => (bar.off ? [bar.off] : [])))]
	const what = show === 'tokens' ? 'Tokens' : 'Credits'
	return <>
		<ol className={`ai-bars ai-bars-${by}`} aria-label={`${what} per ${by}, ${bars.caption}`}>{list.map(bar => <li key={bar.key} className={bar.off ? 'off' : undefined}><span className="ai-bin" role="img" aria-label={bar.alt} title={bar.alt}>
			<span className="ai-bn" aria-hidden="true">{bar.value ?? ''}</span>
			<span className="ai-col" aria-hidden="true">{bar.segs.map((h, i) => <span key={i} className={`ai-seg ${(show === 'credits' ? SEGS.credits : bar.whole ? SEGS.whole : SEGS.tokens)[i]}`} style={{ height: `${h}%` }} />)}</span>
			<span className="ai-bw" aria-hidden="true">{bar.label}</span>{bar.off && <span className="ai-bw ai-bar-off" aria-hidden="true">{bar.off}</span>}
		</span></li>)}</ol>
		<p className="ai-muted ai-legend">{show === 'tokens'
			? <><span className="ai-key"><span className="ai-sw ai-seg-in" aria-hidden="true" />in (not cached)</span><span className="ai-key"><span className="ai-sw ai-seg-cached" aria-hidden="true" />cached</span><span className="ai-key"><span className="ai-sw ai-seg-out" aria-hidden="true" />out</span>
				{whole && <span className="ai-key"><span className="ai-sw ai-seg-whole" aria-hidden="true" />in, cache not reported</span>}</>
			: <span className="ai-key"><span className="ai-sw ai-seg-credits" aria-hidden="true" />credits</span>}
			{off.map(word => <span key={word} className="ai-key"><span className="ai-sw ai-sw-off" aria-hidden="true" />{word}</span>)}
			<span className="ai-key">{what}, {bars.caption}</span></p>
	</>
}

type Filter = { model?: string; kind?: string; machine?: string }
const FILTERS = [['model', 'Model'], ['kind', 'Kind'], ['machine', 'Machine']] as const
// URΔ4/URΔ6: one row of single-selects (All by default; Machine only where the server offers it), each with a visible label; an active
// filter is a chip button "Remove filter: <value>", plus one Clear filters link. The server sums every figure over the filtered runs.
function Filters({ usage, filter, set }: { usage: Usage; filter: Filter; set: (f: Filter) => void }) {
	const active = FILTERS.flatMap(([k]) => (filter[k] ? [[k, usage.filters[k]?.options.find(o => o.value === filter[k])?.text ?? filter[k]!] as const] : []))
	return <>
		<div className="ai-filters" role="group" aria-label="Filter AI use">{FILTERS.map(([k, label]) => {
			const choice = usage.filters[k]
			return choice && <label key={k} className="ai-filter"><span>{label}</span><select value={filter[k] ?? ''} onChange={event => set({ ...filter, [k]: event.target.value || undefined })}>
				<option value="">All</option>{choice.options.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}</select></label>
		})}</div>
		{active.length > 0 && <p className="ai-chips">{active.map(([k, text]) => <button key={k} type="button" className="ai-chip" aria-label={`Remove filter: ${text}`} onClick={() => set({ ...filter, [k]: undefined })}>{text} <span aria-hidden="true">✕</span></button>)}
			<button type="button" className="link-button ai-clear" onClick={() => set({})}>Clear filters</button></p>}
	</>
}

export function AiUse({ usage: base, how }: { usage: Usage; how?: ReactNode }) {
	const id = useId(), [open, setOpen] = useState(false), [by, setBy] = useState<'week' | 'day'>('week'), [show, setShow] = useState<'tokens' | 'credits'>('tokens')
	const [filter, setFilter] = useState<Filter>({}), filtering = FILTERS.some(([k]) => filter[k])
	const filtered = useQuery({ queryKey: ['numbers-usage', base.query, filter], queryFn: ({ signal }) => fetchUsage(base.query, filter, signal), enabled: filtering, placeholderData: keepPreviousData, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
	const usage = filtering && filtered.data ? filtered.data : base
	const bars = usage.bars && (by === 'day' && usage.bars.day ? usage.bars.day : usage.bars.week)
	// Before counting was complete the breakdown is all there is, so it stays open; after, Details opens it.
	const shown = usage.state === 'before' || open
	return <section className="ai-use" aria-labelledby={`${id}-h`} aria-busy={filtering && filtered.isFetching}>
		<h3 className="ai-h" id={`${id}-h`}>AI use</h3>
		<Filters usage={usage} filter={filter} set={setFilter} />
		{filtering && filtered.error && <p role="alert" className="ai-muted">{filtered.error.message}</p>}
		{usage.today && <p className={`ai-today${usage.today.atCap ? ' ai-at-cap' : ''}`}>{usage.today.text}</p>}
		{usage.note && <p className="ai-muted ai-note">{usage.note}</p>}
		{usage.state === 'after' && <>
			<div className="ai-head"><span className="ai-big">{usage.headline}{usage.credits && <> · <span className="ai-credits">{usage.credits.text}</span><CreditsHelp help={usage.credits.help} /></>}</span>
				<span className="ai-cover">{usage.coverage}{usage.credits?.coverage && <span className="ai-credit-cover"> · {usage.credits.coverage}</span>}{usage.unreported && <span className="ai-unreported" title={usage.unreported.title}>{usage.unreported.text} <span aria-hidden="true">ⓘ</span><span className="ai-sr">: {usage.unreported.title}</span></span>}</span></div>
			{usage.earlier && <p className="ai-muted ai-earlier">{usage.earlier}</p>}
			{usage.bars && bars && <>
				<div className="ai-switches">
					{usage.bars.day && <Switch label="Bars" value={by} onChange={setBy} options={[{ value: 'day', text: `By day (${usage.bars.day.tokens.length})` }, { value: 'week', text: 'By week' }]} />}
					<span className="ai-switch-label" aria-hidden="true">Show:</span><Switch label="Show" value={show} onChange={setShow} options={[{ value: 'tokens', text: 'Tokens' }, { value: 'credits', text: 'Credits' }]} />
				</div>
				<UsageBars bars={bars} by={usage.bars.day && by === 'day' ? 'day' : 'week'} show={show} />
			</>}
			<button type="button" className="ai-toggle" aria-expanded={open} aria-controls={`${id}-d`} onClick={() => setOpen(!open)}>Details: by kind of work and by model</button>
		</>}
		<div id={`${id}-d`} hidden={!shown}>{shown && <>
			<UsageTable caption="By kind of work" head="Kind of work" table={usage.kinds} />
			{usage.models.rows.length > 0 && <UsageTable caption="By model" head="Model" table={usage.models} />}
		</>}</div>
		{how}
	</section>
}