import { useCopySummary, useNumbers, useNumberWindow } from '../data/screens.ts'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Numbers as NumbersData } from '../domain/screens.ts'

export default function Numbers() {
	const { window, setWindow } = useNumberWindow(), query = useNumbers(window), { message, copy } = useCopySummary()
	const { route, navigate } = useScreenNavigation()
	const data = query.data, listKey = route.slice('numbers/'.length), selected = route.startsWith('numbers/') && data ? data.lists[listKey] : undefined
	const link = (value: NumbersData['model']['handled']['main'], key?: string) => value.key ? <button className="number-link" key={key} onClick={() => navigate(`numbers/${value.key}`)}>{value.text}</button> : <span key={key}>{value.text}</span>
	return <><h1>Numbers</h1><label>Time window <select value={window} onChange={event => { setWindow(event.target.value); navigate('numbers') }}>{[['this', 'This week'], ['last', 'Last week'], ['4w', 'Last 4 weeks'], ['all', 'Since you started']].map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
		<p className="muted">Counted from the local log. Nothing is estimated.</p>
		{query.error && <div role="alert"><p>Could not load the numbers: {query.error.message}</p><Button onClick={() => void query.refetch()}>Try again</Button></div>}
		{!data ? <p role="status">Counting...</p> : selected ? <section><h2>{selected.title}</h2><Button variant="outline" onClick={() => navigate('numbers')}>Back to Numbers</Button>
			{selected.groups.map((group, n) => <div key={n}>{group.title && <h3>{group.title}</h3>}{group.codes.map((code, index) => {
				const row = data.rows[code], missed = data.missed[code]
				return <article className="item-card" data-number-code={code} key={`${code}-${index}`}><h3>{row?.sentence ?? 'You pointed at this message. No item was made for it.'}</h3>{row?.ask && <p>{row.ask}</p>}{row?.said && <p>You: {row.said}</p>}
					{row?.gist && <p>{row.gist}</p>}{row?.work && <p>{row.work}</p>}
					<p className="muted">{row ? `${row.who.name} - ${row.by} - ${row.at}` : missed?.at}</p>{(row?.teams ?? row?.href ?? missed?.teams) && <a href={row?.teams ?? row?.href ?? missed?.teams} target="_blank" rel="noopener noreferrer">Open source</a>}</article>
			})}</div>)}
		</section> : route.startsWith('numbers/') ? <p>That list is not on this tab.</p> : <>
			<section className="number-card"><h2>Handled for you</h2><div className="number-main">{link(data.model.handled.main)}</div>
				<p>{data.model.handled.trend?.text}</p><p>{data.model.handled.kinds.map((part, n) => <span key={n}>{n > 0 ? ' - ' : ''}{link(part)}</span>)}</p>
				{data.model.handled.check && <p>{link(data.model.handled.check)}</p>}<details><summary>How is this counted?</summary><p>{data.rules.handled}</p></details>
				<div className="number-bars">{data.model.bars.map(bar => <button key={bar.week} title={bar.alt} aria-label={bar.alt} disabled={!bar.key} data-before={bar.before || undefined} onClick={() => navigate(`numbers/${bar.key}`)}><span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ height: `${bar.height}%` }} /></span><strong>{bar.n}</strong><small>{bar.label}</small><span className="reading-days" aria-hidden="true">{bar.days.map((gap, n) => <i className={gap ? 'gap' : undefined} key={n} />)}</span>{bar.gaps.length > 0 && <small>Reading gap</small>}</button>)}</div>{data.model.gapNote && <p>{data.model.gapNote}</p>}
			</section>
			<div className="number-grid">{data.model.cards.map(card => <section className="number-card" key={card.rule}><h2>{card.title}</h2><div className="number-main">{link(card.main)}</div>{card.meter && <meter className="number-meter" min={0} max={card.meter.of} value={card.meter.n} aria-label={`${card.title}: ${card.meter.n} of ${card.meter.of}`} />}{card.lines.map((line, n) => <p key={n}>{line.map((part, i) => <span key={i}>{i > 0 ? ' - ' : ''}{link(part)}</span>)}</p>)}<p>{link(card.four)}</p><details><summary>How is this counted?</summary><p>{data.rules[card.rule]}</p></details></section>)}</div>
			<p>{data.model.corrections.map((part, n) => <span key={n}>{n > 0 ? ' - ' : ''}{link(part)}</span>)}</p>{data.model.unknown && <p>{link(data.model.unknown)}</p>}<p>{data.model.promises}</p>
			<Button variant="outline" onClick={() => void copy(data.model.summary)}>Copy a summary</Button>{message && <p role="status">{message}</p>}<details><summary>Summary to copy</summary><pre>{data.model.summary}</pre></details>
		</>}
	</>
}
