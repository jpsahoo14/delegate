import { Fragment, memo, useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import { chipHover, codeHover } from '../domain/hover.ts'
import { Button } from '../components/ui/button.tsx'
import { useCardPresentation, useCardUi, useEdit, useEntities, useExperienceNote, useItemCard, useNowSections, usePlacement, useSnapshot } from '../data/hooks.ts'
import { useNavigation } from '../data/navigation.ts'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { ItemCard } from './ItemCard.tsx'
import { dirty, pinnedPlacements, useData } from '../data/store.ts'
import { NAME } from '../brand.ts'
import { when, time } from '../domain/time.ts'
import { revisionKey, type Entities, type Placement } from '../domain/contracts.ts'
import { Icon } from '../components/ui/icon.tsx'
import { ViewportList } from '../components/ViewportList.tsx'
import { sentAt, whereOf } from './ItemCard.tsx'
import { SentTime } from './SentTime.tsx'
import { isolateRowControls } from './row-navigation.ts'
import './rows.css'

// "Delegate is on it" (spec S3): running now (live runs and working rows) and in line (rows waiting on Delegate).
function workingCounts(ids: string[], entities: Entities, running: number) {
	const kinds = ids.map(id => entities.placements[id]?.kind)
	const now = running + kinds.filter(kind => kind === 'working').length
	return { now, line: ids.length - kinds.filter(kind => kind === 'working').length }
}

const calendarKey = () => `${new Date().toDateString()}|${new Intl.DateTimeFormat().resolvedOptions().timeZone}`
const day = (iso: string) => {
	const date = new Date(iso), start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
	const difference = Math.round((start(new Date()) - start(date)) / 86_400_000)
	return difference <= 0 ? 'today' : difference === 1 ? 'yesterday' : difference < 7 ? date.toLocaleDateString([], { weekday: 'short' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const RowFacts = memo(function RowFacts({ row }: { row: Placement; day: string }) {
	// Who, where, when and their message are lines 1 and 2 (spec S3, S8); these are the rest, muted, and never "asked <time>".
	const facts = row.facts, parts: ReactNode[] = []
	if (facts.promise?.to) parts.push(`You promised ${facts.promise.to} ${day(facts.promise.at) === 'today' || day(facts.promise.at) === 'yesterday' ? '' : 'on '}${day(facts.promise.at)}`)
	if (facts.promise?.why) parts.push(facts.promise.why)
	if (row.when) parts.push(`starts ${when(row.when)}`)
	if (facts.quote?.by === 'You') parts.push(<>You {facts.quote.verb}: <span className="row-quote">"{facts.quote.text}"</span></>)
	for (const note of facts.notes ?? []) parts.push(<><span className="row-note-label">{note.label}{note.at ? ` ${when(note.at)}` : ''}:</span> {note.text}{note.since ? ` since ${day(note.since)}` : ''}</>)
	if (facts.until) {
		const until = new Date(facts.until)
		parts.push(`until ${until.toLocaleDateString([], (until.getTime() - Date.now()) / 86_400_000 < 6.5 ? { weekday: 'short' } : { month: 'short', day: 'numeric' })}`)
	}
	if (facts.also) parts.push(`+${facts.also} ${facts.also === 1 ? 'chat' : 'chats'}`)
	if (!parts.length) return null
	return <p className="row-facts">{parts.map((part, index) => <Fragment key={index}>{index > 0 ? ' · ' : ''}{part}</Fragment>)}</p>
}, (before, after) => before.day === after.day && before.row.facts === after.row.facts && before.row.when === after.row.when)
function RowControls({ row, open, toggle }: { row: Placement; open: boolean; toggle: () => void }) {
	const primary = useData(state => (state.pinned[row.act]?.snapshot.entities.actions ?? state.entities.actions)[row.actionIds[0]])
	if (row.section === 'waiting' && (!primary || primary.effect !== 'local')) return null
	if (!primary || primary.effect !== 'local') return <Button variant={row.section === 'move' && !open ? 'default' : 'outline'} onClick={toggle} aria-expanded={open}>{open ? 'Hide' : 'Open'}</Button>
	return <LocalRowControls row={row} open={open} toggle={toggle} />
}
function LocalRowControls({ row, open, toggle }: { row: Placement; open: boolean; toggle: () => void }) {
	const card = useCardPresentation(row.act, row.id)
	const edit = useEdit(row.act, card.item?.rev ?? '')
	const actions = row.actionIds.flatMap(id => {
		const action = card.entities?.actions[id]
		return action?.effect === 'local' ? [action] : []
	})
	const primary = card.entities?.actions[row.actionIds[0]]
	if (row.section === 'waiting' && (!primary || primary.effect !== 'local')) return null
	if (!primary || primary.effect !== 'local') return <Button variant={row.section === 'move' && !open ? 'default' : 'outline'} onClick={toggle} aria-expanded={open}>{open ? 'Hide' : 'Open'}</Button>
	return <>
		{/* No free text on a row (spec S2): Update opens the card, whose form says what happened. */}
		{primary.input === 'text' ? <Button variant={open ? 'outline' : 'default'} onClick={toggle} aria-expanded={open} title={row.kind === 'your-step' ? 'Open the form to say how your step went. Nothing is sent.' : undefined}>{open ? 'Hide' : row.kind === 'your-step' ? 'Update' : 'Open'}</Button>
			: <ActionButton action={primary} primary={row.section === 'move'} disabled={card.newer && primary.staleness === 'exact'} />}
		{actions.filter(action => action.id !== primary.id && !action.input).map(action => <ActionButton key={action.id} action={action} disabled={card.newer && action.staleness === 'exact'} />)}
		{card.newer && <Button variant="outline" onClick={toggle}>Review newer version</Button>}
		{[...new Map(actions.map(action => [`${action.item}@${action.rev}`, action])).values()].map(action => <ActionState key={`${action.item}@${action.rev}`} item={action.item} rev={action.rev} />)}
	</>
}

function Standalone({ id }: { id: string }) {
	const placement = usePlacement(id)
	const entities = useData(state => state.pinned[placement?.act ?? id]?.snapshot.entities ?? state.entities)
	const row = entities.placements[id]
	if (!row) return <p role="status">This item changed. Open its current version to continue.</p>
	const automation = entities.automations[row.act]
	const actionIds = [...new Set([...row.actionIds, ...(automation?.actionIds ?? [])])]
	const actions = actionIds.flatMap(id => entities.actions[id] ? [entities.actions[id]] : [])
	if (actions.length !== actionIds.length) return <p role="status">This item changed. Open its current version to continue.</p>
	return <section className="item-card"><h2>{row.headline}</h2>
		{automation && <p>{automation.sentence}</p>}
		<div className="action-bar">{actions.map((action, index) => <ActionButton key={action.id} action={action} primary={index === 0} />)}</div>
		{[...new Map(actions.map(action => [`${action.item}@${action.rev}`, action])).values()].map(action => <ActionState key={`${action.item}@${action.rev}`} item={action.item} rev={action.rev} />)}
	</section>
}
export const NowRow = memo(function NowRow({ id, day }: { id: string; day?: string }) {
	const row = usePlacement(id)
	const card = useItemCard(row?.act ?? '')
	const item = card.item, entities = card.entities
	const hasItem = !!item, person = entities?.people[row?.personId ?? item?.personId ?? '']
	const hasReport = !!entities?.work[row?.workId ?? '']?.reportActionId
	const route = useNavigation(state => state.route), navigate = useNavigation(state => state.navigate)
	if (!row) return null
	const open = route === `now/${id}` || route.startsWith(`now/${id}/`)
	const requested = route.split('/')[2], shown = requested && row.subjects.includes(requested) ? requested : row.act
	const icons: Partial<Record<string, ComponentProps<typeof Icon>['name']>> = { working: 'bolt', scheduled: 'clock', watch: 'eye', 'waiting-delegate': 'clock', reminder: 'clock', 'reminder-new': 'clock', catchup: 'eye', stopped: 'warn' }
	const icon = icons[row.kind]
	const avatarStyle: CSSProperties & { '--hue': number } = { '--hue': person?.hue ?? 210 }
	const toggle = () => navigate(open ? 'now' : `now/${id}`)
	// Spec S3: three lines. 1 who · where · when they wrote · Open in Teams; 2 their message; 3 what you'll do with it (or Delegate's headline and reason).
	const chat = item && entities ? entities.chats[item.chatId] : undefined
	const sent = item ? sentAt(item) : { at: row.facts.at, added: !row.facts.verb || row.facts.verb === 'item created' }
	const quote = row.facts.quote && row.facts.quote.by !== 'You' ? row.facts.quote.text : undefined
	const message = (quote ?? item?.ask)?.slice(0, 400).replace(/\s+/g, ' ').slice(0, 200)
	const draft = item?.draftId && entities ? entities.drafts[item.draftId] : undefined
	const work = row.workId && entities ? entities.work[row.workId] : undefined
	const mine: [string, string] | undefined = row.section !== 'move' ? undefined
		: row.kind === 'your-step' ? ['Your step', work?.yours?.what ?? row.headline]
			: draft && ['reply', 'holding', 'review'].includes(row.kind) ? [draft.holding ? 'Holding reply' : 'Your reply', `${draft.sendText ?? draft.text}${item?.changeIds.length ? ` · plus ${item.changeIds.length} ${item.changeIds.length === 1 ? 'change' : 'changes'}` : ''}`]
				: item?.question && row.kind === 'question' ? [`${NAME} needs to know`, item.question] : undefined
	const who = person?.name ?? row.facts.who
	return <article className={`now-row${open ? ' row-open' : ''}`} data-code={row.code} data-row-kind={row.kind} title={codeHover(row.act)} onClick={row.kind === 'catchup' ? isolateRowControls : undefined}>
		<div className="row-content">
			{person && !icon ? <span className="row-avatar" style={avatarStyle} aria-hidden="true">{person.initials}</span> : <span className="row-icon"><Icon name={icon ?? 'clock'} /></span>}
			<div className="row-text">
				<div className="row-line1">{who && <span className="row-name">{who}</span>}{(chat || row.facts.where) && <span className="row-where">· {chat ? whereOf(chat) : row.facts.where}</span>}
					<SentTime at={sent.at} added={sent.added} waiting={row.section === 'move'} />
					{row.teams && <a className="row-teams" href={row.teams} target="_blank" rel="noopener noreferrer" aria-label="Open in Teams" title="Open this message in Teams, in a new tab."><Icon name="ext" /></a>}
					{row.chips.map((chip, n) => <span key={`${chip.kind}-${n}`} className={`chip chip-${chip.kind}`} title={chipHover(chip.kind)}>{chip.text}</span>)}</div>
				{message && <p className="row-message">{message}</p>}
				<h3 className="row-line3"><button className="row-title" aria-label={`${open ? 'Hide' : 'Open'} ${mine ? `${mine[0]}: ${mine[1]}` : row.headline}`} onClick={toggle} aria-expanded={open}>
					{mine ? <><b>{mine[0]}:</b> {mine[1]}</> : row.headline}</button></h3>
				<RowFacts row={row} day={day ?? calendarKey()} />
				{row.gist && <p>{row.gist}</p>}
				{row.warn && <p className="row-warning"><Icon name="warn" /><span>{row.warn}</span></p>}
				{row.nextText && <p className="next-line">{row.next?.owner.kind === 'delegate' ? '' : 'Next: '}{row.nextText.replace('{at}', row.next?.at ? when(row.next.at) : 'soon')}</p>}
			</div>
			{!(open && hasReport) && <div className="row-controls" data-row-controls>
				<RowControls row={row} open={open} toggle={toggle} />
			</div>}
		</div>
		{open && <div className="inline-expansion">
			{hasItem ? <ItemCard key={shown} code={shown} placementId={shown === row.act ? row.id : undefined} inline asks={row.subjects.length > 1 ? { codes: row.subjects, onOpen: subject => navigate(`now/${id}/${subject}`) } : undefined} /> : <Standalone id={id} />}</div>}
	</article>
})

export default function Now() {
	const sections = useNowSections(), snapshot = useSnapshot(), entities = useEntities()
	const pinned = useData(state => state.pinned), byRevision = useData(state => state.byRevision)
	const note = useExperienceNote()
	const find = useNavigation(state => state.find), setFind = useNavigation(state => state.setFind), navigate = useNavigation(state => state.navigate)
	const route = useNavigation(state => state.route), sub = route.split('/')[1]
	const running = !find ? snapshot?.running ?? [] : []
	const day = calendarKey()
	const requested = sections?.find(section => section.id === sub || section.ids.includes(sub))
	const selected = requested && (requested.id === 'move' || requested.ids.length || requested.id === 'working' && running.length) ? requested.id : 'move'
	useEffect(() => {
		if (sub === selected) document.getElementById(`section-${selected}`)?.scrollIntoView({ block: 'start' })
	}, [sub, selected])
	const [input, setInput] = useState(find)
	const composing = useRef(false)
	useEffect(() => { if (!find && !composing.current) setInput('') }, [find])
	if (!snapshot || !sections) return <p role="status">Loading your items...</p>
	const search = find ? snapshot.search : undefined
	const activePins = Object.fromEntries(Object.entries(pinned).filter(([code, pin]) => dirty(byRevision[revisionKey(code, pin.rev)] ?? {}) || dirty(byRevision[revisionKey(code, pin.actionRev ?? pin.rev)] ?? {})))
	const kept = new Set(find ? Object.keys(pinnedPlacements({ pinned: activePins })) : [])
	const keptOutsideSearch = search?.query === find && [...kept].some(id => !search.nowIds.includes(id))
	const undoable = Object.values(entities.doneEntries).filter(row => row.actionIds.some(id => entities.actions[id].kind === 'undo'))
	const ownership = { delegate: running.length, others: 0, nobody: 0, unknown: 0 }
	const displayedPlacements = pinnedPlacements({ pinned })
	for (const section of sections.filter(section => section.id === 'working' || section.id === 'waiting')) {
		for (const id of section.ids) {
			const owner = (displayedPlacements[id] ?? entities.placements[id])?.next?.owner.kind
			if (owner === 'delegate' || owner === 'others' || owner === 'nobody') ownership[owner]++
			else ownership.unknown++
		}
	}
	const waitingSummary = [
		ownership.delegate && `${NAME} has ${ownership.delegate} ${ownership.delegate === 1 ? 'thing' : 'things'} to handle.`,
		ownership.others && `${ownership.others} ${ownership.others === 1 ? 'thing is' : 'things are'} waiting on someone else.`,
		ownership.nobody && `${ownership.nobody} ${ownership.nobody === 1 ? 'thing has' : 'things have'} nobody on the next step.`,
		ownership.unknown && `${ownership.unknown} ${ownership.unknown === 1 ? 'thing is' : 'things are'} waiting.`,
	].filter(Boolean).join(' ')
	const quiet = sections.every(section => !(section.total ?? section.ids.length)) && !running.length && !snapshot.summary.minute.facts && !snapshot.summary.minute.suggestions
	return <>
		<h1 className="now-title">Now</h1>
		<label className="find-field" htmlFor="find"><span>Find a person, chat, PR or number, or paste a Teams link</span><input id="find" value={input} autoComplete="off" placeholder="Find a person, chat, PR or number, or paste a Teams link"
			onChange={event => { setInput(event.target.value); if (!composing.current) setFind(event.target.value) }}
			onCompositionStart={() => { composing.current = true }}
			onCompositionEnd={event => { composing.current = false; setFind(event.currentTarget.value) }} /><kbd aria-hidden="true">/</kbd></label>
		{find && search?.query !== find && <p role="status">Finding...</p>}
		{keptOutsideSearch && <p className="muted" role="status">Unsent work stays visible for review even when it no longer matches Find.</p>}
		{search?.link && !search.link.item && <section className="warning"><p>This message is not an item yet.</p>{snapshot.pageActionIds?.filter(id => entities.actions[id].kind === 'paste-missed').map(id => <ActionButton key={id} action={entities.actions[id]} input={{ text: search.link!.href }} />)}</section>}
		{search?.doneIds.length ? <section><h2>Already in Done</h2>{search.doneIds.map(id => {
			const row = entities.doneEntries[id]
			return <p key={id}><button className="row-title" onClick={() => navigate(`done/${row.kind === 'catchup' ? 'catchup' : 'replies'}`)}>{row.code}: {row.sentence}</button>{row.teams && <> - <a href={row.teams} target="_blank" rel="noopener noreferrer">Open in Teams</a></>}</p>
		})}</section> : null}
		{!find && !quiet && <p className="since-line summary-line" aria-label="Now summary">
			{snapshot.summary.off && !snapshot.summary.paused && <span className="chip">{snapshot.summary.off.text}{snapshot.summary.off.since ? ` since ${when(snapshot.summary.off.since)}` : ''}</span>}
			{!!snapshot.sinceLine?.parts.length && <><span className="summary-part">Since {when(snapshot.sinceLine.at)}: </span>{snapshot.sinceLine.parts.map((part, index) => <Fragment key={part.href}>{index > 0 && <span className="summary-separator"> · </span>}<a className="summary-part" href={part.href}>{part.text}{part.href === '#numbers' && <span aria-hidden="true"> ›</span>}</a></Fragment>)}<span className="summary-separator"> · </span></>}
			{(() => {
				// Spec S3: "N need you · Delegate: A now, B in line · C waiting on others", then Catch up; each part opens its section.
				const count = (id: string) => sections.find(section => section.id === id)
				const move = count('move'), working = count('working'), waiting = count('waiting'), catchup = count('catchup')
				const busy = workingCounts(working?.ids ?? [], entities, running.length)
				const parts: [string, string][] = [['move', `${move?.total ?? move?.ids.length ?? 0} need you`], ['working', `${NAME}: ${busy.now} now, ${busy.line} in line`], ['waiting', `${waiting?.total ?? waiting?.ids.length ?? 0} waiting on others`]]
				if (catchup && (catchup.total ?? catchup.ids.length)) parts.push(['catchup', `${catchup.total ?? catchup.ids.length} to catch up${snapshot.summary.catchup.worth ? `, ${snapshot.summary.catchup.worth} worth a look` : ''}`])
				return parts.map(([id, label], index) => <Fragment key={id}>{index > 0 && <span className="summary-separator"> · </span>}<a className="summary-part" href={`#now/${id}`} aria-current={selected === id ? 'location' : undefined}>{label}</a></Fragment>)
			})()}
		</p>}
		{undoable.length > 0 && <section aria-label="Replies you can undo" className="undo-strip">{undoable.map(row => {
			const first = entities.people[row.personId].name.split(' ')[0], rule = /by rule (\S+)/.exec(row.by)?.[1]
			return <div className="undo-main" key={row.id} data-code={row.code}><p>{rule ? `Sent for you to ${first} (rule ${rule})` : `Sent to ${first}`}<span className="undo-quote">: "{row.said ?? row.text}"</span></p>{row.actionIds.filter(id => entities.actions[id].kind === 'undo').map(id => <ActionButton key={id} action={entities.actions[id]} />)}<small className="sr-only">Undo available until {time(new Date(row.undoUntil!))}. Changes already made are not reversed.</small></div>
		})}</section>}
		{!find && snapshot.showExperienceNote && <aside className="experience-note" role="note"><p>Same items, sorted by whose move it is<span className="note-wide">: yours, someone else's, or {NAME}'s</span>. Switch back any time, <span className="note-wide">top right</span><span className="note-narrow">in ⋯</span>.</p><Button variant="ghost" disabled={note.busy} onClick={note.dismiss}>{note.busy ? 'Saving...' : 'Got it'}</Button>{note.error && <p role="alert">{note.error}</p>}</aside>}
		{sections.map(section => {
			const ids = search ? section.ids.filter(id => search.nowIds.includes(id) || kept.has(id)) : section.ids
			const matches = search ? ids.filter(id => search.nowIds.includes(id)).length : ids.length
			const retained = search ? ids.length - matches : 0
			const runs = section.id === 'working' ? running : []
			if (section.id !== 'move' && section.id !== 'working' && !ids.length && !runs.length) return null
			const busy = section.id === 'working' ? workingCounts(section.ids, entities, running.length) : undefined
			return <section key={section.id} className="now-section" data-selected={find || selected === section.id ? 'true' : 'false'} aria-labelledby={`section-${section.id}`}>
				<h2 id={`section-${section.id}`}>{section.label}<span className="section-count"> · {busy ? `${busy.now} now · ${busy.line} in line` : search ? matches : section.total ?? ids.length}{retained > 0 && ` + ${retained} kept`}</span></h2>
				{section.id === 'working' && snapshot.summary.paused && <p className="warning">Paused: drafts go on, nothing is sent.</p>}
				{section.id === 'working' && !snapshot.summary.paused && snapshot.summary.off && !ids.length && !runs.length && <p className="muted">{snapshot.summary.off.text}{snapshot.summary.off.since ? ` since ${when(snapshot.summary.off.since)}` : ''}</p>}
				{ids.length ? <ViewportList className="rows" ids={ids} estimate={112} retained={Object.keys(pinnedPlacements({ pinned: activePins }))} target={ids.includes(sub) ? sub : undefined}
					render={id => <NowRow id={id} day={day} />} /> : section.id === 'move' ? <p className="empty">{find ? 'No matching open items.' : quiet ? 'Quiet. Nothing needs you, and nothing is waiting.' : `Nothing needs you. ${waitingSummary || 'Nothing is waiting either.'}`}</p> : null}
				{runs.map((run, n) => <article className="bootstrap-progress" key={`${run.what}-${n}`}><h3>{run.what}</h3><p className="muted">Since <time dateTime={run.since}>{when(run.since)}</time></p><progress max={1} value={run.progress} aria-label={run.what} /></article>)}
				{section.id === 'catchup' && (section.total ?? 0) > ids.length && !find && <Button variant="outline" onClick={() => navigate('done/catchup')}>Show all Catch up</Button>}
				{section.id === 'catchup' && (section.total ?? 0) > 0 && snapshot.pageActionIds?.filter(id => entities.actions[id].kind === 'mark-all-read').map(id => <ActionButton key={id} action={entities.actions[id]} input={{ seenAt: snapshot.now }} />)}
			</section>
		})}
		{snapshot.summary.minute.facts + snapshot.summary.minute.suggestions > 0 && <p>When you have a minute: {snapshot.summary.minute.suggestions > 0 && <a href="#settings/learned">{snapshot.summary.minute.suggestions} {snapshot.summary.minute.suggestions === 1 ? 'suggestion' : 'suggestions'}</a>}{snapshot.summary.minute.facts > 0 && snapshot.summary.minute.suggestions > 0 ? ' - ' : ''}{snapshot.summary.minute.facts > 0 && <a href="#knowledge">{snapshot.summary.minute.facts} {snapshot.summary.minute.facts === 1 ? 'fact' : 'facts'} to check</a>}</p>}
	</>
}
