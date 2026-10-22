import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { useEntities, useItemNavigation, useNowSections, usePlacement, useSnapshot } from '../data/hooks.ts'
import { useNavigation } from '../data/navigation.ts'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { ItemCard } from './ItemCard.tsx'
import { useData } from '../data/store.ts'
import { NAME } from '../brand.ts'

function Standalone({ id }: { id: string }) {
	const entities = useEntities(), row = entities.placements[id], automation = entities.automations[row.act]
	return <section className="item-card"><h2>{row.headline}</h2>
		{automation && <><p>{automation.text}</p><p>{automation.when}</p><p>{automation.to}</p></>}
		<div className="action-bar">{[...new Set([...row.actionIds, ...(automation?.actionIds ?? [])])].map((actionId, index) => <ActionButton key={actionId} action={entities.actions[actionId]} primary={index === 0} />)}</div>
		{[...new Map([...row.actionIds, ...(automation?.actionIds ?? [])].map(id => [entities.actions[id].rev, entities.actions[id]])).values()].map(action => <ActionState key={action.rev} item={action.item} rev={action.rev} />)}
	</section>
}
function ItemNavigation({ id }: { id: string }) {
	const navigation = useItemNavigation(id)
	return <nav className="item-navigation" aria-label="Item navigation"><Button variant="outline" disabled={!navigation.previous} onClick={() => navigation.step(-1)}>Previous item</Button><span>{navigation.position} of {navigation.total}</span><Button variant="outline" disabled={!navigation.next} onClick={() => navigation.step(1)}>Next item</Button></nav>
}

export const NowRow = memo(function NowRow({ id }: { id: string }) {
	const row = usePlacement(id)
	const hasItem = useData(state => !!state.entities.items[row?.act ?? ''])
	const route = useNavigation(state => state.route), navigate = useNavigation(state => state.navigate)
	const when = useMemo(() => row ? new Date(row.facts.at).toLocaleString() : '', [row?.facts.at])
	if (!row) return null
	const open = route === `now/${id}` || route.startsWith(`now/${id}/`)
	const requested = route.split('/')[2], shown = requested && row.subjects.includes(requested) ? requested : row.act
	const next = row.next
	return <article className="now-row" data-code={row.code} data-row-kind={row.kind}>
		<div className="row-content">
			<div className="row-text"><h3><button className="row-title" aria-label={`Open ${row.headline}`} onClick={() => navigate(open ? 'now' : `now/${id}`)} aria-expanded={open}>{row.headline}</button></h3>
				<p className="muted">{row.facts.who}{row.facts.where ? ` - ${row.facts.where}` : ''}{row.facts.verb ? ` - ${row.facts.verb} ` : ' '}<time dateTime={row.facts.at}>{when}</time></p>
				{row.facts.quote && <p>{row.facts.quote.by} {row.facts.quote.verb}: "{row.facts.quote.text}"</p>}
				{row.facts.notes?.map((note, n) => <p key={n} className="muted">{note.label}: {note.text}</p>)}
				{row.gist && <p>{row.gist}</p>}
				<div className="chips">{row.chips.map((chip, n) => <span key={`${chip.kind}-${n}`} className="chip">{chip.text}</span>)}</div>
				{row.warn && <p className="warning">{row.warn}</p>}
				{next && <p className="next-line">Next: {next.owner.kind === 'you' ? 'You' : next.owner.kind === 'delegate' ? NAME : next.owner.kind === 'others' ? next.owner.text : 'Nobody is on this yet'}
					{next.what ? ` - ${next.what.replace('{at}', next.at ? new Date(next.at).toLocaleString() : '')}` : ''}</p>}
			</div>
			<div className="row-controls"><span className="code">{row.act}</span>{row.teams && <a href={row.teams} target="_blank" rel="noopener noreferrer">Open in Teams</a>}
				<Button variant="outline" onClick={() => navigate(open ? 'now' : `now/${id}`)} aria-expanded={open}>{open ? 'Close' : 'Open'}</Button>
			</div>
		</div>
		{open && <><ItemNavigation id={id} />{row.subjects.length > 1 && <nav className="filter-bar" aria-label={`Items in ${row.code}`}>{row.subjects.map(subject => <Button key={subject} variant={shown === subject ? 'default' : 'outline'} onClick={() => navigate(`now/${id}/${subject}`)}>Open item {subject}</Button>)}</nav>}
			{hasItem ? <ItemCard key={shown} code={shown} placementId={shown === row.act ? row.id : undefined} /> : <Standalone id={id} />}</>}
	</article>
})

export default function Now() {
	const sections = useNowSections(), snapshot = useSnapshot(), entities = useEntities()
	const find = useNavigation(state => state.find), setFind = useNavigation(state => state.setFind), navigate = useNavigation(state => state.navigate)
	const route = useNavigation(state => state.route), sub = route.split('/')[1]
	const selected = sections?.find(section => section.id === sub || section.ids.includes(sub))?.id ?? 'move'
	useEffect(() => {
		if (sub === selected) document.getElementById(`section-${selected}`)?.scrollIntoView({ block: 'start' })
	}, [sub, selected])
	const [input, setInput] = useState(find)
	const composing = useRef(false)
	useEffect(() => { if (!find && !composing.current) setInput('') }, [find])
	if (!snapshot || !sections) return <p role="status">Loading your items...</p>
	const search = find ? snapshot.search : undefined
	const undoable = Object.values(entities.doneEntries).filter(row => row.actionIds.some(id => entities.actions[id].kind === 'undo'))
	return <>
		<h1>Now</h1>
		<label className="find-field" htmlFor="find">Find a person, chat, number, or paste a Teams link<input id="find" value={input} autoComplete="off"
			onChange={event => { setInput(event.target.value); if (!composing.current) setFind(event.target.value) }}
			onCompositionStart={() => { composing.current = true }}
			onCompositionEnd={event => { composing.current = false; setFind(event.currentTarget.value) }} /></label>
		{find && search?.query !== find && <p role="status">Finding...</p>}
		{search?.link && !search.link.item && <section className="warning"><p>This message is not an item yet.</p>{snapshot.pageActionIds?.filter(id => entities.actions[id].kind === 'paste-missed').map(id => <ActionButton key={id} action={entities.actions[id]} input={{ text: search.link!.href }} />)}</section>}
		{search?.doneIds.length ? <section><h2>Already in Done</h2>{search.doneIds.map(id => {
			const row = entities.doneEntries[id]
			return <p key={id}><button className="row-title" onClick={() => navigate(`done/${row.kind === 'catchup' ? 'catchup' : 'replies'}`)}>{row.code}: {row.sentence}</button>{row.teams && <> - <a href={row.teams} target="_blank" rel="noopener noreferrer">Open in Teams</a></>}</p>
		})}</section> : null}
		<p className="since-line">Since {new Date(snapshot.sinceLine?.at ?? snapshot.now).toLocaleString()}: {snapshot.sinceLine?.parts.length ? snapshot.sinceLine.parts.map((part, n) => <span key={n}>{n ? ' - ' : ''}<a href={part.href}>{part.text}</a></span>) : 'No new activity.'}</p>
		<nav className="section-links" aria-label="Now sections">{sections.map(section => <a key={section.id} href={`#now/${section.id}`} aria-current={selected === section.id ? 'location' : undefined}>{section.label} {section.total ?? section.ids.length}</a>)}</nav>
		{snapshot.summary.off && <p className="warning" role="status">{snapshot.summary.off.text}</p>}
		{snapshot.summary.paused && <p className="warning" role="status">{NAME} is paused. No replies are sent automatically.</p>}
		{Object.values(entities.health).map(health => <section className="warning" key={health.id} role="alert"><p>{health.text}</p>{health.actionIds.map(id => <ActionButton key={id} action={entities.actions[id]} />)}</section>)}
		{undoable.length > 0 && <section aria-label="Replies you can undo" className="undo-strip">{undoable.map(row => <div key={row.id} data-code={row.code}><p>{row.sentence}: "{row.said ?? row.text}"</p>{row.actionIds.filter(id => entities.actions[id].kind === 'undo').map(id => <ActionButton key={id} action={entities.actions[id]} />)}<small>Undo available until {new Date(row.undoUntil!).toLocaleTimeString()}. Changes already made are not reversed.</small></div>)}</section>}
		{sections.map(section => {
			const ids = search ? section.ids.filter(id => search.nowIds.includes(id)) : section.ids
			return <section key={section.id} className="now-section" data-selected={find || selected === section.id ? 'true' : 'false'} aria-labelledby={`section-${section.id}`}>
				<h2 id={`section-${section.id}`}>{section.label} <span className="count">{search ? ids.length : section.total ?? ids.length}</span></h2>
				{ids.length ? <div className="rows">{ids.map(id => <NowRow key={id} id={id} />)}</div> : <p className="empty">Nothing here.</p>}
				{section.id === 'catchup' && (section.total ?? 0) > ids.length && !find && <Button variant="outline" onClick={() => navigate('done/catchup')}>Show all Catch up</Button>}
				{section.id === 'catchup' && (section.total ?? 0) > 0 && snapshot.pageActionIds?.filter(id => entities.actions[id].kind === 'mark-all-read').map(id => <ActionButton key={id} action={entities.actions[id]} input={{ seenAt: snapshot.now }} />)}
			</section>
		})}
		{snapshot.summary.minute.facts + snapshot.summary.minute.suggestions > 0 && <p><button onClick={() => navigate('knowledge')}>When you have a minute: {snapshot.summary.minute.facts} facts to check, {snapshot.summary.minute.suggestions} suggestions</button></p>}
	</>
}
