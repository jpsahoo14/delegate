import { useId, useState, type ReactNode } from 'react'
import type { Numbers } from '../domain/screens.ts'
import './ai-use.css'

// COST-USAGE: Numbers › AI USE, the same in New and Classic (pm-usage-cost.md: PM FINAL, Designer AU1-AU5). The server sends the
// words and cells; this draws them. Its numbers are not links (PM rule-2 exception), unknown is a word, and no credit figure exists.
type Usage = NonNullable<Numbers['usage']>
type Cell = Usage['total']['cells'][number]

const value = (cell: Cell) => cell.unknown ? <span className="ai-unknown">{cell.text}</span> : cell.title ? <abbr title={cell.title}>{cell.text}</abbr> : cell.text

function UsageTable({ caption, head, rows, usage }: { caption: string; head: string; rows: Usage['kinds']; usage: Usage }) {
	return <table className="ai-table">
		<caption>{caption}</caption>
		<thead><tr><th scope="col">{head}</th>{usage.columns.map(column => <th scope="col" key={column.text} title={column.title}>{column.text}</th>)}</tr></thead>
		<tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.cells.map((cell, i) => <td key={i} data-col={usage.columns[i]?.text}>{value(cell)}</td>)}</tr>)}</tbody>
		<tfoot><tr><th scope="row">Total</th>{usage.total.cells.map((cell, i) => <td key={i} data-col={usage.columns[i]?.text}>{value(cell)}{i === usage.total.cells.length - 1 && usage.total.note && <span className="ai-total-note">{usage.total.note}</span>}</td>)}</tr></tfoot>
	</table>
}

export function AiUse({ usage, how }: { usage: Usage; how?: ReactNode }) {
	const id = useId(), [open, setOpen] = useState(false)
	// Before counting was complete the breakdown is all there is, so it stays open; after, Details opens it.
	const shown = usage.state === 'before' || open
	return <section className="ai-use" aria-labelledby={`${id}-h`}>
		<h3 className="ai-h" id={`${id}-h`}>AI use</h3>
		<p className="ai-muted" title="To see what one item used, open it: it's in its Details.">{usage.credits}</p>
		{usage.note && <p className="ai-muted ai-note">{usage.note}</p>}
		{usage.state === 'after' && <>
			<div className="ai-head"><span className="ai-big">{usage.headline}</span><span className="ai-cover">{usage.coverage}{usage.unreported && <span className="ai-unreported" title={usage.unreported.title}>{usage.unreported.text} <span aria-hidden="true">ⓘ</span><span className="ai-sr">: {usage.unreported.title}</span></span>}</span></div>
			{usage.bars && <><ol className="ai-bars" aria-label="AI runs per week, the last 8 weeks">{usage.bars.map(bar => <li key={bar.week} className={bar.n === undefined ? 'off' : undefined}><span className="ai-bin" role="img" aria-label={bar.alt} title={bar.since ? bar.alt : undefined}>
				<span className="ai-bn" aria-hidden="true">{bar.n ?? ''}</span><span className="ai-col" aria-hidden="true"><span className="ai-fill" style={{ height: `${bar.height}%` }} /></span><span className="ai-bw" aria-hidden="true">{bar.label}</span>{bar.n === undefined && <span className="ai-bw" aria-hidden="true">not counted</span>}
			</span></li>)}</ol><p className="ai-muted">AI runs, the last 8 weeks</p></>}
			<button type="button" className="ai-toggle" aria-expanded={open} aria-controls={`${id}-d`} onClick={() => setOpen(!open)}>Details: by kind of work and by model</button>
		</>}
		<div id={`${id}-d`} hidden={!shown}>{shown && <>
			<UsageTable caption="By kind of work" head="Kind of work" rows={usage.kinds} usage={usage} />
			{usage.models.length > 0 && <UsageTable caption="By model" head="Model" rows={usage.models} usage={usage} />}
		</>}</div>
		{how}
	</section>
}
