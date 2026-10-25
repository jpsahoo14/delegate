import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { useActivityCard, useActionWindow, useCardUi, useEdit, useEntities, useItemBusy, useShowLatest, useSnapshot } from '../data/hooks.ts'
import { useDoneEntries, useDoneLook } from '../data/done.ts'
import type { Entities } from '../domain/contracts.ts'
import { when } from '../domain/time.ts'
import { ActionButton, ActionState } from '../features/ActionButton.tsx'
import { Field } from '../features/CardFields.tsx'
import { Avatar } from './Avatar.tsx'
import { ClassicWhy, Conversation, conversationOf } from './Blocks.tsx'
import { deadlineChoices, deadlineDate } from './dates.ts'
import { useScreenNavigation } from './navigation.tsx'
import './done.css'
import { NAME } from '../brand.ts'
import { isolateRowControls } from '../features/row-navigation.ts'
import { MessageBubble, messageText, ReviewPosted } from '../features/ItemCard.tsx'
import { SentTime } from '../features/SentTime.tsx'
import { CODE, ItemCode } from '../features/ItemCode.tsx'

const filters: Record<string, { label: string; kinds: string[] }> = {
	all: { label: 'All', kinds: ['reply', 'review', 'change', 'reminder', 'learned', 'catchup'] },
	replies: { label: 'Replies', kinds: ['reply', 'review'] }, reviews: { label: 'Reviews', kinds: ['review'] },
	changes: { label: 'Changes', kinds: ['change'] }, reminders: { label: 'Reminders', kinds: ['reminder'] },
	learned: { label: 'Learned', kinds: ['learned'] }, catchup: { label: 'Catch up', kinds: ['catchup'] },
}
const marks = [
	{ kind: 'wrong', label: 'Wrong', question: 'What should it have said?', button: 'Draft a correction' },
	{ kind: 'incomplete', label: 'Incomplete', question: 'What was missing?', button: 'Draft what was missing' },
	{ kind: 'unneeded', label: 'Should not have replied', question: 'Anything else? (optional)', button: 'Note it' },
]

export function ActivityRow({ supplied, first = false, last = false }: { supplied: Entities['doneEntries'][string]; first?: boolean; last?: boolean }) {
	const { row, entities, rev, newer, blocked } = useActivityCard(supplied.code, supplied.id)
	const snapshot = useSnapshot(), ui = useCardUi(supplied.code, rev), edit = useEdit(supplied.code, rev)
	const showLatest = useShowLatest(supplied.code), busy = useItemBusy(supplied.code)
	const undoWindow = useActionWindow(row?.undoUntil), [open, setOpen] = useState(false)
	const conversation = row && entities ? conversationOf(snapshot, row.code, row.noteIds, entities) : undefined
	const pendingAnswer = conversation?.notes.some(note => note.answer === undefined)
	useEffect(() => { if (pendingAnswer) setOpen(true) }, [pendingAnswer])
	if (!row || !entities || !conversation) return null
	const person = entities.people[row.personId], reply = row.kind === 'reply' || row.kind === 'review', catchup = row.kind === 'catchup'
	const actions = row.actionIds.map(id => entities.actions[id]), undo = actions.find(action => action.kind === 'undo')
	const undoFacts = row.kind === 'learned' ? actions.find(action => action.kind === 'undo-facts') : undefined
	const inlineUndo = !!undo && !undoWindow.expired
	const mark = marks.find(mark => mark.kind === ui.feedbackKind)
	const watching = !!ui.folds?.watch, target = ui.watchText ?? row.watch?.target ?? row.sentence, until = ui.watchUntil ?? row.watch?.until ?? 'it is done'
	const by = ui.watchBy ?? '', source = row.teams ?? row.href
	const byChoice = ui.watchByChoice ?? (by ? undefined : '')
	const watchInput = () => {
		const date = byChoice === undefined ? by : deadlineDate(byChoice)
		if (date !== ui.watchBy) edit({ watchBy: date })
		return { text: target, until, by: date || undefined }
	}
	const { notes, entities: noteEntities } = conversation
	const currentItem = snapshot?.entities.items[row.code], askEntities = currentItem ? snapshot!.entities : entities
	const askActions = (currentItem?.actionIds ?? entities.items[row.code]?.actionIds ?? []).map(id => askEntities.actions[id])
	const expanded = open || !!mark || watching || !!pendingAnswer
	const fold = (key: string, value: boolean) => edit({ folds: { ...ui.folds, [key]: value } })
	const result = <ActionState item={row.code} rev={rev} />
	// R10b (02:02): a review closed on his vote or the PR closing keeps what it posted, read-only.
	const closedReview = (r => r?.closed ? r : undefined)(entities.items[row.code]?.reviewDone)
	const posted = closedReview && <section className="classic-card-section classic-review-posted"><ReviewPosted review={closedReview} /></section>
	const meta = <span className="classic-activity-meta">{[
		reply ? `${person.name}${row.sentence.match(/ in (.+)$/)?.[1] ? ` · ${row.sentence.match(/ in (.+)$/)![1]}` : ''}` : row.kind !== 'learned' ? row.by : '',
		reply ? row.by : '', inlineUndo ? 'you can take it back' : '',
	].filter(Boolean).join(' · ')} · <SentTime at={row.at} />{source && <> · <a href={source} target="_blank" rel="noopener noreferrer">Open {row.teams ? 'in Teams' : ''}↗</a></>}{row.watchedAs && <span className="classic-activity-tag">Watching as {row.watchedAs}</span>}</span>
	const text = <>{reply && (row.ask || row.said) ? <>{row.ask ? <span className="classic-qa"><b>{person.name.split(' ')[0]} asked:</b> 	{messageText(row.ask)}</span> : <b>{row.sentence}</b>}{row.said && <span className="classic-qa classic-qa-you"><b>You{row.inTeams ? ' (in Teams)' : ''}:</b> {row.said}</span>}</> : <><b>{row.sentence}</b>{(row.gist || row.said) && <span className="classic-activity-gist">{row.gist || `“${row.said}”`}</span>}</>}{meta}{row.work && <span className="classic-activity-tag">{row.work}</span>}</>
	const lead = reply ? <Avatar person={person} large /> : <span className="classic-activity-icon"><Icon name={catchup ? row.high ? 'warn' : 'eye' : row.kind === 'review' ? 'pr' : row.kind === 'change' ? 'task' : row.kind === 'reminder' ? 'clock' : row.kind === 'learned' ? 'book' : 'check'} /></span>
	const controls = catchup && !ui.result && <div className="classic-row-actions" data-row-controls>{!row.watchedAs && actions.some(action => action.kind === 'watch-fyi') && <Button variant="ghost" disabled={blocked || busy} onClick={() => fold('watch', !watching)}>Watch</Button>}{actions.filter(action => action.kind === 'needs-me').map(action => <ActionButton key={action.id} action={action} />)}</div>
	const header = <>{lead}{catchup && row.teams ? <a className="classic-activity-text classic-activity-link" href={row.teams} target="_blank" rel="noopener noreferrer"><b>{row.sentence}</b>{row.gist && <span className="classic-activity-gist">	{messageText(row.gist)}</span>}<span className="classic-activity-meta">	{row.by} · <SentTime at={row.at} />{row.watchedAs && <span className="classic-activity-tag">Watching as {row.watchedAs}</span>}</span></a> : <div className="classic-activity-text">{text}</div>}{catchup && source && <a className="classic-activity-external" href={source} target="_blank" rel="noopener noreferrer" aria-label="Open in Teams"><Icon name="ext" /></a>}{controls}{inlineUndo && <ActionButton action={undo!} />}{undoFacts && <ActionButton action={undoFacts} ariaLabel={`Undo learned facts: ${row.sentence.replace(/^Learned\s+/i, '')}`} pendingLabel="Taking it back..." disabled={newer || blocked} />}{CODE.test(row.code) && <ItemCode code={row.code} />}</>
	return <article className={`classic-activity${inlineUndo ? ' classic-undo-row' : ''}`} data-activity-code={row.code} data-first={first || undefined} data-last={last || undefined} onClick={catchup ? isolateRowControls : undefined}>
		{row.text && !inlineUndo && !undoFacts && !catchup ? <details className="classic-activity-expand" open={expanded} onToggle={event => { if (open !== event.currentTarget.open) setOpen(event.currentTarget.open) }}><summary className="classic-activity-row">{header}<Icon name="right" /></summary>
			<MessageBubble text={row.text} teams={row.teams} open={!!ui.folds?.sentBody} onToggle={value => fold('sentBody', value)} />
			<div className="classic-card classic-history">
				{row.checks?.map((check, index) => <p key={index} className="classic-activity-meta classic-check">{check}</p>)}
				{posted}
				{row.why && <section className="classic-card-section classic-why-section"><ClassicWhy why={row.why} sourceIds={row.sourceIds} entities={entities} name={person.name} open={!!ui.folds?.why} onToggle={value => fold('why', value)} /></section>}
				{actions.some(action => marks.some(mark => mark.kind === action.kind)) && <section className="classic-card-section classic-feedback">
					{!mark ? <Button variant="ghost" aria-label={person?.name ? `Tell ${NAME} the reply to ${person.name.split(' ')[0]} was not right` : 'Not right?'} disabled={blocked || busy} onClick={() => edit({ feedbackKind: 'wrong' })}>Not right?</Button> : <fieldset disabled={blocked || busy}><legend className="sr-only">What was not right</legend>
						<div className="classic-segments" role="group" aria-label="What was not right">{marks.filter(mark => actions.some(action => action.kind === mark.kind)).map(choice => <Button key={choice.kind} variant="ghost" aria-pressed={ui.feedbackKind === choice.kind} onClick={() => edit({ feedbackKind: choice.kind })}>{choice.label}</Button>)}</div>
						<Field code={row.code} rev={rev} field="feedback" label={mark.question} placeholder={mark.question} value={ui.feedback ?? ''} edit={edit} rows={2} />
						<div className="classic-form-actions">{actions.filter(action => action.kind === mark.kind).map(action => <ActionButton key={action.id} primary action={{ ...action, label: mark.kind === 'unneeded' && row.rule && row.undoUntil && !undoWindow.expired ? 'Take it back' : mark.button }} input={{ text: ui.feedback ?? '' }} disabled={newer || blocked} />)}<Button variant="ghost" onClick={() => edit({ feedbackKind: undefined })}>Cancel</Button></div>
						<p className="classic-activity-meta">{actions.find(action => action.kind === mark.kind)?.meaning}</p>
					</fieldset>}
				</section>}
				{askActions.some(action => action.kind === 'ask') || notes.length ? <Conversation code={row.code} rev={rev} ui={ui} edit={edit} notes={notes} entities={noteEntities} actions={askActions} blocked={blocked || newer} sent allowUse={false} /> : null}
			</div>
		</details> : <><div className="classic-activity-row">{header}</div>{row.checks?.map((check, index) => <p key={index} className="classic-activity-meta classic-check">{check}</p>)}{posted}</>}
		{(newer || blocked) && <div className="classic-activity-notice" role="status">This activity changed. Your text is kept. <Button variant="outline" disabled={busy} onClick={showLatest}>Review current version</Button></div>}
		{watching && !row.watchedAs && <fieldset className="classic-watch-form" disabled={blocked || busy}><legend>Watch this</legend>
			<Field code={row.code} rev={rev} field="watchText" label="Watch" value={target} edit={edit} singleLine />
			<Field code={row.code} rev={rev} field="watchUntil" label="until" value={until} edit={edit} singleLine />
			<div className="classic-segments" role="group" aria-label="Done by">{deadlineChoices.map(([key, label]) => <Button key={key} variant="ghost" aria-pressed={byChoice === key} onClick={() => edit({ watchBy: deadlineDate(key), watchByChoice: key })}>{label}</Button>)}</div>
			{by && byChoice === undefined && <p className="classic-activity-meta">By {by}</p>}
			<div className="classic-form-actions">{actions.filter(action => action.kind === 'watch-fyi').map(action => <ActionButton key={action.id} primary action={action} input={{ text: target, until, by: by || undefined }} prepareInput={watchInput} disabled={newer || blocked || !target.trim()} />)}<Button variant="ghost" onClick={() => fold('watch', false)}>Cancel</Button></div>
		</fieldset>}
		{result}
	</article>
}

export default function Done() {
	const entities = useEntities(), entries = useDoneEntries(), fresh = useDoneLook(), { route } = useScreenNavigation()
	const requested = route.split('/')[1] ?? 'all', filter = requested === 'closed' ? 'catchup' : Object.hasOwn(filters, requested) ? requested : 'all'
	// R12b step 3: done/rule/<ids> lists only what a line's grants sent (Settings › Your way of working links here with the line's ruleIds).
	const ruleIds = requested === 'rule' ? (route.split('/')[2] ?? '').split(',').map(decodeURIComponent).filter(Boolean) : undefined
	const rows = Object.values(entries).filter(row => ruleIds ? !!row.rule && ruleIds.includes(row.rule) : filters[filter].kinds.includes(row.kind))
	const newer = rows.filter(row => fresh.has(row.id)), earlier = rows.filter(row => !fresh.has(row.id))
	const groups = [{ title: newer.length && earlier.length ? 'New' : '', rows: newer }, { title: newer.length && earlier.length ? 'Earlier this week' : '', rows: earlier }]
	const closed = Object.values(entries).filter(row => row.kind === 'closed')
	return <section className="classic-done"><header className="classic-list-head"><div><h1>Done</h1><p>{filter === 'catchup' ? 'What Delegate read for you and closed with no reply. Click a row to open it in Teams.' : 'The last 7 days. Open a reply to see what was sent and why.'}</p>{ruleIds && <p>Only what one of your lines did, the last 7 days · <a href="#classic/done">Show all</a></p>}</div></header>
		<nav className="classic-done-filters" aria-label="Done filters">{Object.entries(filters).map(([key, value]) => {
			const live = Object.values(entities.doneEntries).filter(row => value.kinds.includes(row.kind)), count = live.length, countNew = live.filter(row => fresh.has(row.id)).length
			return count || key === filter && rows.length ? <a key={key} href={`#classic/done/${key}`} aria-current={filter === key ? 'page' : undefined} aria-pressed={filter === key}>{value.label} <span>{count}</span>{countNew > 0 && <small>{countNew} new</small>}</a> : null
		})}</nav>
		<div className="classic-done-stream">{rows.length ? groups.flatMap(group => [
			...(group.title ? [<h2 className="classic-section-heading" key={group.title}>{group.title}</h2>] : []),
			...group.rows.map((row, index) => <ActivityRow key={row.id} supplied={row} first={index === 0} last={index === group.rows.length - 1} />),
		]) : <p className="empty">{filter === 'catchup' ? 'Nothing to catch up on in the last 7 days.' : 'Nothing in the last 7 days.'}</p>}</div>
		{filter === 'catchup' && closed.length > 0 && <details className="classic-quiet"><summary>Also closed {closed.length} with nothing to know · Show</summary>{closed.map(row => <article className="classic-activity-row" key={row.id}><span className="classic-activity-icon"><Icon name="check" /></span><div className="classic-activity-text"><b>{row.sentence}</b><span className="classic-activity-meta">{when(row.at)}{row.teams && <> · <a href={row.teams} target="_blank" rel="noopener noreferrer">Open in Teams↗</a></>}</span></div>{CODE.test(row.code) && <ItemCode code={row.code} />}</article>)}</details>}
	</section>
}
