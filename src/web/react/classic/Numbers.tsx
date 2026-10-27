import { Fragment } from 'react'
import { useCopySummary, useNumbers, useNumberWindow } from '../data/screens.ts'
import type { Numbers as NumbersData } from '../domain/screens.ts'
import { when } from '../domain/time.ts'
import { NAME } from '../brand.ts'
import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { Avatar } from './Avatar.tsx'
import { useScreenNavigation } from './navigation.tsx'
import { useSnapshot } from '../data/hooks.ts'
import { ActivityRow } from './Done.tsx'
import { AiUse } from '../features/AiUse.tsx'
import { customOf, WindowPick } from '../features/WindowPick.tsx'
import './tools.css'

type NumberLink = NumbersData['model']['handled']['main']
const windows = [['this', 'This week'], ['last', 'Last week'], ['4w', 'Last 4 weeks'], ['all', 'Since you started']]

export default function Numbers() {
	const snapshot = useSnapshot()
	const { window, setWindow } = useNumberWindow(), query = useNumbers(window), { message, copy } = useCopySummary()
	const { route, href, navigate } = useScreenNavigation(), data = query.data
	const key = route.startsWith('numbers/') ? route.slice('numbers/'.length) : ''
	const selected = data && Object.hasOwn(data.lists, key) ? data.lists[key] : undefined
	const link = (part: NumberLink) => part.key ? <a className="ct-num-link" href={href(`numbers/${part.key}`)}>{part.text}</a> : <span>{part.text}</span>
	const line = (parts: NumberLink[]) => parts.map((part, i) => <Fragment key={i}>{i > 0 && ' · '}{link(part)}</Fragment>)
	const how = (rule: string) => <details className="ct-num-how"><summary>How is this counted?</summary><p>{data?.rules[rule]}</p></details>
	const rows = (codes: string[]) => {
		const counts = new Map<string, number>()
		for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1)
		return <ul className="ct-counted-rows">{[...counts].map(([code, n]) => {
			const row = data && Object.hasOwn(data.rows, code) ? data.rows[code] : undefined
			const missed = data && Object.hasOwn(data.missed, code) ? data.missed[code] : undefined
			const activity = row?.kind === 'catchup' ? Object.values(snapshot?.entities.doneEntries ?? {}).find(entry => entry.code === code && entry.kind === 'catchup') : undefined
			if (activity) return <li className="ct-counted-activity" data-number-code={code} key={code}><ActivityRow supplied={activity} />{n > 1 && <p className="ct-muted">Counted {n} times: once for each send.</p>}</li>
			const source = row?.teams ?? row?.href ?? missed?.teams
			const reply = row && ['reply', 'review'].includes(row.kind), where = reply && row.sentence.match(/ in (.+)$/)?.[1]
			const byline = row ? [reply ? `${row.who.name}${where ? ` · ${where}` : ''}` : row.kind !== 'learned' ? row.by : '', reply ? row.by : ''].filter(Boolean).join(' · ') : ''
			return <li className="ct-counted-row" data-number-code={code} key={code}>
				{row && ['reply', 'review'].includes(row.kind) ? <Avatar person={{ ...row.who, id: code }} large /> : <span className="ct-tool-icon"><Icon name={code.startsWith('missed:') || row?.kind === 'catchup' ? 'eye' : row?.kind === 'learned' ? 'book' : 'check'} /></span>}
				<div className="ct-counted-body">
					{row ? reply && (row.ask || row.said) ? <>{row.ask ? <p className="ct-counted-ask"><strong>{row.who.name.split(' ')[0]} asked:</strong> {row.ask}</p> : <strong>{row.sentence}</strong>}{row.said && <p className="ct-counted-said"><strong>You{row.inTeams ? ' (in Teams)' : ''}:</strong> {row.said}</p>}</> : <strong>{row.sentence}</strong> : <strong>{code.startsWith('missed:') ? 'You pointed at this message. No item was made for it.' : `${code} is no longer on file`}</strong>}
					{!row && !code.startsWith('missed:') && <p className="ct-muted">Its line in the log still counts.</p>}
					{row?.gist && <p>{row.gist}</p>}
					<div className="ct-counted-meta">{byline && <span>{byline} · </span>}<time dateTime={row?.at ?? missed?.at}>{when(row?.at ?? missed?.at)}</time>{source && <> · <a href={source} target="_blank" rel="noopener noreferrer">Open{row?.teams || missed?.teams ? ' in Teams' : ''} <Icon name="ext" /></a></>}</div>
					{row?.work && <span className="ct-counted-work" data-closed={/^Closed/.test(row.work) || undefined}>{row.work}</span>}
					{n > 1 && <p className="ct-muted">Counted {n} times: once for each send.</p>}
				</div>
			</li>
		})}</ul>
	}
	const range = data?.model.window.label.match(/\(([^)]*)\)$/)?.[1]
	return <div className="ct-tools ct-numbers" aria-busy={query.isFetching}>
		<header className="ct-tools-head"><div><h1>Numbers</h1><p>Counted from {NAME}'s own log on all your machines. Nothing is estimated.</p></div><div className="ct-num-pick"><WindowPick window={window} setWindow={setWindow} hiddenLabel="ct-visually-hidden" onPicked={() => navigate('numbers')} today={data?.today} />{range && !customOf(window) && <span className="ct-muted">{range}</span>}</div></header>
		{query.error && <div role="alert"><p>Could not load the numbers: {query.error.message}. Nothing is lost.</p><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>}
		{!data ? <p role="status">Counting...</p> : key ? <>
			<a className="ct-num-back" href={href('numbers')}><Icon name="left" /> All numbers</a>
			{selected ? <><h2 className="ct-num-list-title">{selected.title} <span>{selected.groups.reduce((n, group) => n + group.codes.length, 0)}</span></h2>
				{selected.groups.every(group => !group.codes.length) ? <p className="ct-muted">Nothing counted here {customOf(window) ? 'in this range' : windows.find(([id]) => id === window)?.[1].toLowerCase()}.</p> : selected.groups.filter(group => group.codes.length).map((group, i) => <section key={i}>{selected.groups.length > 1 && <h3 className="ct-section-title">{group.title} · {group.codes.length}</h3>}{rows(group.keys ?? group.codes)}</section>)}
			</> : <p>That list is not on this tab.</p>}
		</> : <>
			<section className="ct-num-card" aria-labelledby="ct-handled"><h2 className="ct-num-title" id="ct-handled">Handled for you</h2><div className="ct-num-hero"><span>{link(data.model.handled.main)}</span>{data.model.handled.trend && <small>{data.model.handled.trend.text}</small>}</div>{how('handled')}
				<ol className="ct-num-bars" aria-label="Handled for you per week, the last 8 weeks">{data.model.bars.map(bar => {
					const content = <><span className="ct-num-count" aria-hidden="true">{bar.before ? '' : bar.n}</span><span className="ct-num-column" aria-hidden="true"><span style={{ height: `${bar.height}%` }} /></span><span className="ct-num-days" aria-hidden="true">{bar.days.map((gap, i) => <i key={i} data-gap={gap || undefined} />)}</span><span className="ct-num-week" aria-hidden="true">{bar.label}</span></>
					return <li key={bar.week} data-before={bar.before || undefined} data-gap={!!bar.gaps.length || undefined} data-now={bar.now || undefined}>{bar.key ? <a href={href(`numbers/${bar.key}`)} aria-label={bar.alt}>{content}</a> : <span className="ct-num-bin" role="img" aria-label={bar.alt}>{content}</span>}</li>
				})}</ol>
				<p className="ct-muted ct-num-note"><span>The last 8 weeks</span>{data.model.gapNote && <><span className="ct-num-hatch" aria-hidden="true" /><span>{data.model.gapNote}</span></>}</p>{how('bars')}
				<p>{line(data.model.handled.kinds)}</p><div className="ct-num-row">{data.model.handled.check && link(data.model.handled.check)}{data.model.handled.all && <span className="ct-num-all">{link(data.model.handled.all)} <Icon name="right" /></span>}</div>{data.model.handled.check && how('check')}
			</section>
			<div className="ct-num-cards">{data.model.cards.map(card => <section className="ct-num-card" key={card.rule}><h2 className="ct-num-title">{card.title}</h2><p className="ct-num-main">{link(card.main)}</p>{card.meter && <div className="ct-num-meter" role="img" aria-label={`${card.meter.n} of ${card.meter.of} as drafted`}><i style={{ width: `${card.meter.of ? card.meter.n / card.meter.of * 100 : 0}%` }} /></div>}<ul className="ct-num-lines">{card.lines.map((parts, i) => <li key={i}>{line(parts)}</li>)}<li className="ct-muted">{link(card.four)}</li></ul>{how(card.rule)}</section>)}</div>
			<section className="ct-num-card" aria-label="Guardrails"><p><strong>Corrections:</strong> {data.model.corrections.map((part, i) => <Fragment key={i}>{link(part)}</Fragment>)}</p>{how('corrections')}{data.model.unknown && <><p>{link(data.model.unknown)}</p>{how('unknown')}</>}<p>{data.model.promises}</p>{how('promises')}{data.usage && <AiUse usage={data.usage} how={how('usage')} />}<div className="ct-tool-actions"><Button variant="outline" onClick={() => void copy(data.model.summary)}>Copy a summary</Button><span className="ct-muted">numbers only, no names and no message text</span></div>{message && <p role="status">{message}</p>}<details className="ct-num-how"><summary>See what is copied</summary><pre className="ct-num-summary">{data.model.summary}</pre></details></section>
		</>}
	</div>
}
