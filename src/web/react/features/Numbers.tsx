import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useCopySummary, useNumbers, useNumberWindow } from '../data/screens.ts'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import type { Numbers as NumbersData } from '../domain/screens.ts'
import { when } from '../domain/time.ts'
import { NAME } from '../brand.ts'
import { useSnapshot } from '../data/hooks.ts'
import { Entry } from './Done.tsx'
import { AiUse } from './AiUse.tsx'
import { customOf, WindowPick } from './WindowPick.tsx'

type NumberLink = NumbersData['model']['handled']['main']
const number = (value: NumberLink, all = false) => value.key ? <a className={`num-link${all ? ' num-all' : ''}`} href={`#numbers/${value.key}`}>{value.text}{all && <Icon name="right" />}</a> : <span>{value.text}</span>
const line = (values: NumberLink[]) => values.map((value, index) => <span key={index}>{index > 0 && ' · '}{number(value)}</span>)

function CountedRows({ data, codes }: { data: NumbersData; codes: string[] }) {
	const snapshot = useSnapshot(), [open, setOpen] = useState<string>()
	const times = new Map<string, number>()
	for (const code of codes) times.set(code, (times.get(code) ?? 0) + 1)
	return <ul className="rows">{[...times].map(([code, count]) => {
		const row = Object.hasOwn(data.rows, code) ? data.rows[code] : undefined
		const missed = Object.hasOwn(data.missed, code) ? data.missed[code] : undefined
		const activity = row?.kind === 'catchup' ? Object.values(snapshot?.entities.doneEntries ?? {}).find(entry => entry.code === code && entry.kind === 'catchup') : undefined
		if (activity) return <li className="number-result new-done" data-number-code={code} key={code}><Entry row={activity} newView open={open === code} onToggle={() => setOpen(open === code ? undefined : code)} />{count > 1 && <span className="number-meta">Counted {count} times: once for each send.</span>}</li>
		const reply = row?.kind === 'reply' || row?.kind === 'review', source = row?.teams ?? row?.href ?? missed?.teams
		const where = row?.sentence.match(/ in (.+)$/)?.[1]
		const meta = row ? [reply ? `${row.who.name}${where ? ` · ${where}` : ''}` : row.kind !== 'learned' ? row.by : '', reply ? row.by : '', when(row.at)].filter(Boolean).join(' · ') : when(missed?.at)
		return <li className="number-result" data-number-code={code} key={code}>
			{reply && row ? <span className="row-avatar" style={{ '--hue': row.who.hue } as CSSProperties}>{row.who.initials}</span> : <span className="row-icon"><Icon name={code.startsWith('missed:') || row?.kind === 'catchup' ? 'eye' : row?.kind === 'reminder' ? 'clock' : row?.kind === 'learned' ? 'book' : 'check'} /></span>}
			<div className="number-result-body">
				{row ? <>
					{reply && (row.ask || row.said) ? <>{row.ask ? <span className="qa"><strong>{row.who.name.split(' ')[0]} asked:</strong> {row.ask}</span> : <strong>{row.sentence}</strong>}{row.said && <span className="qa you"><strong>You{row.inTeams ? ' (in Teams)' : ''}:</strong> {row.said}</span>}</> : <><strong>{row.sentence}</strong>{(row.gist || row.said) && <span className="gist">{row.gist ?? `“${row.said}”`}</span>}</>}
				</> : <strong>{code.startsWith('missed:') ? 'You pointed at this message. No item was made for it.' : `${code} is no longer on file`}</strong>}
				{!row && !code.startsWith('missed:') && <span className="number-meta">Its line in the log still counts.</span>}
				<span className="number-meta">{meta}{source && <> · <a href={source} target="_blank" rel="noopener noreferrer">{row?.teams || missed?.teams ? 'Open in Teams' : 'Open source'}↗</a></>}</span>
				{row?.work && <span className="chip">{row.work}</span>}
				{count > 1 && <span className="number-meta">Counted {count} times: once for each send.</span>}
			</div>
		</li>
	})}</ul>
}

export default function Numbers() {
	const { window, setWindow } = useNumberWindow(), query = useNumbers(window), { message, copy } = useCopySummary()
	const { route, navigate } = useScreenNavigation(), heading = useRef<HTMLHeadingElement>(null)
	const data = query.data, listKey = route.slice('numbers/'.length), sub = route.startsWith('numbers/')
	const selected = sub && data && Object.hasOwn(data.lists, listKey) ? data.lists[listKey] : undefined
	const range = data?.model.window.key === window ? /\(([^)]*)\)$/.exec(data.model.window.label)?.[1] : undefined
	const how = (key: string) => <details className="num-how" data-how={key}><summary>How is this counted?</summary><p>{data?.rules[key]}</p></details>
	useEffect(() => { if (sub) heading.current?.focus() }, [sub, listKey, query.isFetching])
	return <div className="new-numbers" aria-busy={query.isFetching}>
		<header className="numbers-heading"><div><h1>Numbers</h1><p>Counted from {NAME}'s own log on all your machines. Nothing is estimated.</p></div>
			<div className="num-pick"><WindowPick window={window} setWindow={setWindow} hiddenLabel="sr-only" onPicked={() => navigate('numbers')} today={data?.today} />{range && !customOf(window) && <span className="num-range">{range}</span>}</div>
		</header>
		{query.error ? <div role="alert" className="num-fail"><p><strong>Could not load the numbers.</strong> {NAME} could not be reached from this page, so nothing was counted. Nothing is lost: they load when you open this tab or change the window.</p><p>{query.error.message}</p><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>
			: !data || query.isFetching ? <p role="status">Counting…</p>
				: sub ? <><a className="num-back" href="#numbers"><Icon name="left" />All numbers</a>{!selected ? <p>That list is not on this tab.</p> : <>
					<h2 className="num-list-h" tabIndex={-1} ref={heading}>{selected.title} <span>{selected.groups.reduce((sum, group) => sum + group.codes.length, 0)}</span></h2>
					{!selected.groups.some(group => group.codes.length) ? <p>Nothing counted here {({ this: 'this week', last: 'last week', '4w': 'last 4 weeks', all: 'since you started', custom: 'in this range' } as const)[data.model.window.key]}.</p> : selected.groups.filter(group => group.codes.length).map((group, index) => <div key={index}>{selected.groups.length > 1 && <h3 className="section-h">{group.title} · {group.codes.length}</h3>}<CountedRows data={data} codes={group.keys ?? group.codes} /></div>)}
				</>}</> : <>
					<section className="num-card num-hero"><h2 className="num-t">Handled for you</h2>
						<div className="num-head"><span className="num-big">{number(data.model.handled.main)}</span>{data.model.handled.trend && <span className={`num-trend ${data.model.handled.trend.dir ?? ''}`}>{data.model.handled.trend.text}</span>}</div>
						{how('handled')}<ol className="num-bars" aria-label="Handled for you per week, the last 8 weeks">{data.model.bars.map(bar => {
							const content = <><span className="num-bn" aria-hidden="true">{!bar.before && bar.n}</span><span className="num-col" aria-hidden="true"><span className="num-fill" style={{ height: `${bar.height}%` }} /></span><span className="num-days" aria-hidden="true">{bar.days.map((gap, index) => <i className={gap ? 'off' : undefined} key={index} />)}</span><span className="num-bw" aria-hidden="true">{bar.label}</span></>
							return <li className={`num-bar${bar.before ? ' before' : ''}${bar.gaps.length ? ' gap' : ''}${bar.now ? ' now' : ''}`} key={bar.week}>{bar.key ? <a className="num-bin" href={`#numbers/${bar.key}`} aria-label={bar.alt}>{content}</a> : <span className="num-bin" role="img" aria-label={bar.alt}>{content}</span>}</li>
						})}</ol><p className="num-note">The last 8 weeks{data.model.gapNote && <> · <span className="num-hatch" aria-hidden="true" /> {data.model.gapNote}</>}</p>{how('bars')}
						<p className="num-kinds">{line(data.model.handled.kinds)}</p>{(data.model.handled.check || data.model.handled.all) && <p className="num-row">{data.model.handled.check && number(data.model.handled.check)}<span className="sp" />{data.model.handled.all && number(data.model.handled.all, true)}</p>}{data.model.handled.check && how('check')}
					</section>
					<div className="num-cards">{data.model.cards.map(card => <section className="num-card" key={card.rule}><h3 className="num-t">{card.title}</h3><p className="num-main">{number(card.main)}</p>{card.meter && <div className="num-meter" role="img" aria-label={`${card.meter.n} of ${card.meter.of} as drafted`}><i style={{ width: `${Math.round(card.meter.n / card.meter.of * 100)}%` }} /></div>}<ul className="num-lines">{card.lines.map((parts, index) => <li key={index}>{line(parts)}</li>)}<li className="num-four">{number(card.four)}</li></ul>{how(card.rule)}</section>)}</div>
					<section className="num-card num-foot" aria-label="Guardrails"><p><strong>Corrections:</strong> {data.model.corrections.map((value, index) => <span key={index}>{number(value)}</span>)}</p>{how('corrections')}{data.model.unknown && <><p>{number(data.model.unknown)}</p>{how('unknown')}</>}<p>{data.model.promises}</p>{how('promises')}
						{data.usage && <AiUse usage={data.usage} how={how('usage')} />}
						<div className="num-copy"><Button variant="outline" onClick={() => void copy(data.model.summary)}>Copy a summary</Button><span>numbers only, no names and no message text</span></div>{message && <p role="status">{message}</p>}<details className="num-how" data-how="copy"><summary>See what is copied</summary><pre className="num-sum">{data.model.summary}</pre></details>
					</section>
				</>}
	</div>
}
