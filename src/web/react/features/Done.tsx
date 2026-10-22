import { useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { useActivityCard, useCardUi, useEdit, useEntities, useItemBusy, useShowLatest, useSnapshot } from '../data/hooks.ts'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { ActionButton, ActionState } from './ActionButton.tsx'
import type { Entities } from '../domain/contracts.ts'
import { ItemCard } from './ItemCard.tsx'
import { useDoneEntries, useDoneLook } from '../data/done.ts'

function Entry({ row: supplied, fresh = false, grouped = false, open, onToggle }: { row: Entities['doneEntries'][string]; fresh?: boolean; grouped?: boolean; open: boolean; onToggle: () => void }) {
	const { row, entities, rev, newer, blocked } = useActivityCard(supplied.code, supplied.id)
	const ui = useCardUi(supplied.code, rev), edit = useEdit(supplied.code, rev), showLatest = useShowLatest(supplied.code), busy = useItemBusy(supplied.code)
	if (!row || !entities) return null
	const feedback = ui.feedback ?? '', kind = ui.feedbackKind, watching = ui.folds?.watch
	const target = ui.watchText ?? row.watch?.target ?? row.sentence, until = ui.watchUntil ?? row.watch?.until ?? '', by = ui.watchBy ?? ''
	const person = entities.people[row.personId], actions = row.actionIds.map(id => entities.actions[id])
	const Heading = grouped ? 'h3' : 'h2'
	return <article className="item-card" data-activity-code={row.code}><header className="card-header"><Heading>{row.kind === 'catchup' && row.teams ? <a href={row.teams} target="_blank" rel="noopener noreferrer">{row.sentence}</a> : <button className="row-title" onClick={onToggle} aria-expanded={open}>{row.sentence}</button>}</Heading><span className="code">{row.code}</span></header>
		{fresh && <span className="chip">New</span>}
		{(newer || blocked) && <p role="status" className="warning">{blocked ? 'An unsent edit for this item is kept on another version.' : 'This activity changed while you were editing. Your text is kept.'} <Button variant="outline" disabled={busy} onClick={showLatest}>Review current version</Button></p>}
		{row.ask && <p>{person.name} asked: {row.ask}</p>}
		{row.said && <p><strong>{row.inTeams ? 'You (in Teams)' : 'You'}:</strong> {row.said}</p>}
		{row.gist && <p>{row.gist}</p>}
		<p className="muted">{person.name} - {row.by} - <time dateTime={row.at}>{new Date(row.at).toLocaleString()}</time></p>
		{row.work && <p>{row.work}</p>}
		{(row.teams || row.href) && <a href={row.teams ?? row.href} target="_blank" rel="noopener noreferrer">{row.teams ? 'Open in Teams' : 'Open source'}</a>}
		<div className="action-bar">{actions.filter(action => !['wrong', 'incomplete', 'unneeded', 'watch-fyi'].includes(action.kind)).map(action => <ActionButton key={action.id} action={action} />)}
			{actions.some(action => action.kind === 'watch-fyi') && <Button variant="outline" disabled={blocked} onClick={() => edit({ folds: { ...ui.folds, watch: !watching } })}>Watch</Button>}
			{actions.some(action => ['wrong', 'incomplete', 'unneeded'].includes(action.kind)) && <Button variant="outline" disabled={blocked} onClick={() => edit({ feedbackKind: kind ? undefined : 'wrong' })}>Not right?</Button>}
		</div>
		{row.watchedAs && <p>Watching as {row.watchedAs}</p>}
		{watching && !row.watchedAs && <fieldset disabled={blocked}><legend>Watch this until it is done</legend><label className="field-label">What should get done?<input value={target} onChange={event => edit({ watchText: event.target.value })} onFocus={() => edit({ focusedField: 'watchText' })} onBlur={() => edit({ focusedField: undefined })} /></label><label className="field-label">Done when<input value={until} onChange={event => edit({ watchUntil: event.target.value })} onFocus={() => edit({ focusedField: 'watchUntil' })} onBlur={() => edit({ focusedField: undefined })} /></label><label className="field-label">By date (optional)<input type="date" value={by} onChange={event => edit({ watchBy: event.target.value })} /></label>
			{actions.filter(action => action.kind === 'watch-fyi').map(action => <ActionButton key={action.id} action={action} input={{ text: target, until, by: by || undefined }} disabled={!target.trim() || newer || blocked} />)}
		</fieldset>}
		{kind && <fieldset disabled={blocked}><legend>What was wrong?</legend>{actions.filter(action => ['wrong', 'incomplete', 'unneeded'].includes(action.kind)).map(action => <label className="option" key={action.id}><input type="radio" name={`feedback-${row.id}`} checked={kind === action.kind} onChange={() => edit({ feedbackKind: action.kind })} />{action.label}</label>)}
			<p>{actions.find(action => action.kind === kind)?.meaning}</p>
			<label className="field-label">What should change?<textarea value={feedback} onChange={event => edit({ feedback: event.target.value })} onFocus={() => edit({ focusedField: 'feedback' })} onBlur={() => edit({ focusedField: undefined })} onCompositionStart={() => edit({ composing: true })} onCompositionEnd={() => edit({ composing: false })} /></label>
			{actions.filter(action => action.kind === kind).map(action => <ActionButton key={action.id} action={{ ...action, label: 'Save feedback' }} input={{ text: feedback }} disabled={newer || blocked} />)}
		</fieldset>}
		{actions.length > 0 && <ActionState item={actions[0].item} rev={actions[0].rev} />}
		{open && <><div className="draft">{row.text ?? row.said ?? row.sentence}</div>
			{row.why && <details><summary>Why</summary><p>{row.why.reason}</p>{row.sourceIds.map(id => <p key={id}>{entities.sources[id].kind}: {entities.sources[id].label}</p>)}</details>}
			{entities.items[row.code] && <ItemCard code={row.code} />}
		</>}
	</article>
}
export default function Done() {
	const entities = useEntities(), { route, navigate } = useScreenNavigation()
	const entries = useDoneEntries()
	const snapshot = useSnapshot()
	const [openId, setOpenId] = useState<string>()
	const fresh = useDoneLook()
	const filter = route.split('/')[1] ?? 'all'
	const keys: Record<string, string[]> = { all: ['reply', 'review', 'change', 'reminder', 'learned', 'catchup'], replies: ['reply', 'review'], reviews: ['review'], changes: ['change'], reminders: ['reminder'], learned: ['learned'], catchup: ['catchup'] }
	const rows = Object.values(entries).filter(row => (keys[filter] ?? keys.all).includes(row.kind))
	const newRows = rows.filter(row => fresh.has(row.id)), earlierRows = rows.filter(row => !fresh.has(row.id))
	const groups = newRows.length ? [{ title: 'New', rows: newRows }, { title: 'Earlier', rows: earlierRows }] : [{ title: '', rows }]
	const closed = Object.values(entries).filter(row => row.kind === 'closed')
	return <><h1>Done</h1><p className="muted">What was sent, changed and learned in the last seven days. Activity can belong to work that is still open.</p>
		<nav aria-label="Done filters" className="filter-bar">{Object.entries({ all: 'All', replies: 'Replies', reviews: 'Reviews', changes: 'Changes', reminders: 'Reminders', learned: 'Learned', catchup: 'Catch up' }).map(([key, label]) => {
			const count = Object.values(entities.doneEntries).filter(row => keys[key].includes(row.kind)).length
			const unseen = Object.values(entities.doneEntries).filter(row => keys[key].includes(row.kind) && fresh.has(row.id)).length
			return <Button key={key} aria-label={label} variant={filter === key ? 'default' : 'outline'} onClick={() => navigate(`done/${key}`)}>{label} <span className="count">{count}</span>{unseen > 0 && <small>{unseen} new</small>}</Button>
		})}</nav>
		{rows.length ? groups.flatMap(group => group.rows.length ? [
			...(group.title ? [<h2 key={`group-${group.title}`}>{group.title}</h2>] : []),
			...group.rows.map(row => <Entry key={row.id} row={row} fresh={fresh.has(row.id)} grouped={newRows.length > 0} open={openId === row.id} onToggle={() => setOpenId(openId === row.id ? undefined : row.id)} />),
		] : []) : <p className="empty">Nothing in this view.</p>}
		{filter === 'catchup' && snapshot?.pageActionIds?.filter(id => entities.actions[id].kind === 'mark-all-read').map(id => <ActionButton key={id} action={entities.actions[id]} input={{ seenAt: snapshot.now }} />)}
		{(filter === 'all' || filter === 'catchup') && closed.length > 0 && <details><summary>Also closed {closed.length} with nothing to know</summary>{closed.map(row => <Entry key={row.id} row={row} open={openId === row.id} onToggle={() => setOpenId(openId === row.id ? undefined : row.id)} />)}</details>}
	</>
}
