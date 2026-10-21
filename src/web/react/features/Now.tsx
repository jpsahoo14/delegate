import { memo, useRef, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { useEntities, useNowSections, usePlacement, useSnapshot } from '../data/hooks.ts'
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

export const NowRow = memo(function NowRow({ id }: { id: string }) {
	const row = usePlacement(id)
	const hasItem = useData(state => !!state.entities.items[row?.act ?? ''])
	const route = useNavigation(state => state.route), navigate = useNavigation(state => state.navigate)
	if (!row) return null
	const open = route === `now/${id}`
	const next = row.next
	return <article className="now-row" data-code={row.code} data-row-kind={row.kind}>
		<div className="row-content">
			<div className="row-text"><h3><button className="row-title" aria-label={`Open ${row.headline}`} onClick={() => navigate(open ? 'now' : `now/${id}`)} aria-expanded={open}>{row.headline}</button></h3>
				<p className="muted">{row.facts.who}{row.facts.where ? ` - ${row.facts.where}` : ''}{row.facts.verb ? ` - ${row.facts.verb} ` : ' '}<time dateTime={row.facts.at}>{new Date(row.facts.at).toLocaleString()}</time></p>
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
		{open && (hasItem ? <ItemCard code={row.act} placementId={row.id} /> : <Standalone id={id} />)}
	</article>
})

export default function Now() {
	const sections = useNowSections(), snapshot = useSnapshot(), entities = useEntities()
	const find = useNavigation(state => state.find), setFind = useNavigation(state => state.setFind), navigate = useNavigation(state => state.navigate)
	const [input, setInput] = useState(find)
	const composing = useRef(false)
	if (!snapshot || !sections) return <p role="status">Loading your items...</p>
	const search = snapshot.search?.query === find ? snapshot.search : undefined
	const undoable = Object.values(entities.doneEntries).filter(row => row.actionIds.some(id => entities.actions[id].kind === 'undo'))
	return <>
		<h1>Now</h1>
		<label className="find-field" htmlFor="find">Find a person, chat, number, or paste a Teams link<input id="find" value={input} autoComplete="off"
			onChange={event => { setInput(event.target.value); if (!composing.current) setFind(event.target.value) }}
			onCompositionStart={() => { composing.current = true }}
			onCompositionEnd={event => { composing.current = false; setFind(event.currentTarget.value) }} /></label>
		{find && !search && <p role="status">Finding...</p>}
		<p className="since-line">Handled this week: <button onClick={() => navigate('numbers')}>{snapshot.summary.handled}</button></p>
		{snapshot.summary.off && <p className="warning" role="status">{snapshot.summary.off.text}</p>}
		{snapshot.summary.paused && <p className="warning" role="status">{NAME} is paused. No replies are sent automatically.</p>}
		{Object.values(entities.health).map(health => <section className="warning" key={health.id} role="alert"><p>{health.text}</p>{health.actionIds.map(id => <ActionButton key={id} action={entities.actions[id]} />)}</section>)}
		{undoable.length > 0 && <section aria-label="Replies you can undo" className="undo-strip">{undoable.map(row => <div key={row.id}><p>{row.sentence}: "{row.said ?? row.text}"</p>{row.actionIds.filter(id => entities.actions[id].kind === 'undo').map(id => <ActionButton key={id} action={entities.actions[id]} />)}<small>Undo available until {new Date(row.undoUntil!).toLocaleTimeString()}. Changes already made are not reversed.</small></div>)}</section>}
		{sections.map(section => {
			const ids = search ? section.ids.filter(id => search.nowIds.includes(id)) : section.ids
			return <section key={section.id} className="now-section" aria-labelledby={`section-${section.id}`}>
				<h2 id={`section-${section.id}`}>{section.label} <span className="count">{search ? ids.length : section.total ?? ids.length}</span></h2>
				{ids.length ? <div className="rows">{ids.map(id => <NowRow key={id} id={id} />)}</div> : <p className="empty">Nothing here.</p>}
				{section.id === 'catchup' && (section.total ?? 0) > ids.length && !find && <Button variant="outline" onClick={() => navigate('done/catchup')}>Show all Catch up</Button>}
			</section>
		})}
		{snapshot.summary.minute.facts + snapshot.summary.minute.suggestions > 0 && <p><button onClick={() => navigate('knowledge')}>When you have a minute: {snapshot.summary.minute.facts} facts to check, {snapshot.summary.minute.suggestions} suggestions</button></p>}
	</>
}
