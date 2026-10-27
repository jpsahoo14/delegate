import { useRef, useState, type CSSProperties } from 'react'
import { chipHover } from '../domain/hover.ts'
import { Button } from '../components/ui/button.tsx'
import { useActivityCard, useCardUi, useEdit, useEntities, useItemBusy, useShowLatest, useSnapshot } from '../data/hooks.ts'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { ActionButton, ActionState } from './ActionButton.tsx'
import type { Entities } from '../domain/contracts.ts'
import { ItemCard, messageText } from './ItemCard.tsx'
import { SentTime } from './SentTime.tsx'
import { SentBecause } from './SentBecause.tsx'
import { CODE, ItemCode } from './ItemCode.tsx'
import { useDoneEntries, useDoneLook } from '../data/done.ts'
import { when } from '../domain/time.ts'
import { Icon } from '../components/ui/icon.tsx'
import { Field, Sources } from './CardFields.tsx'
import { NAME } from '../brand.ts'
import { deadlineChoices, deadlineDate } from '../classic/dates.ts'
import { isolateRowControls } from './row-navigation.ts'
import { DONE_FILTERS, isDoneFilter, matchesDone } from '../domain/done.ts'
import { ByDelegateChip, WddKindChips, WddList } from './WddList.tsx'
import { wddSubline } from '../domain/wdd-words.ts'

export function Entry({ row: supplied, fresh = false, grouped = false, compact = false, feedbackOnly = false, newView = false, open, onToggle }: { row: Entities['doneEntries'][string]; fresh?: boolean; grouped?: boolean; compact?: boolean; feedbackOnly?: boolean; newView?: boolean; open: boolean; onToggle: () => void }) {
	const { row, entities, rev, newer, blocked } = useActivityCard(supplied.code, supplied.id)
	const ui = useCardUi(supplied.code, rev), edit = useEdit(supplied.code, rev), showLatest = useShowLatest(supplied.code), busy = useItemBusy(supplied.code)
	const askThread = useRef<HTMLElement>(null)
	if (!row || !entities) return null
	const feedback = ui.feedback ?? '', kind = ui.feedbackKind, watching = ui.folds?.watch
	const target = ui.watchText ?? row.watch?.target ?? row.sentence, until = ui.watchUntil ?? row.watch?.until ?? '', by = ui.watchBy ?? ''
	const byChoice = ui.watchByChoice ?? (by ? undefined : '')
	const watchInput = () => {
		const date = byChoice === undefined ? by : deadlineDate(byChoice)
		if (date !== ui.watchBy) edit({ watchBy: date })
		return { text: target, until, by: date || undefined }
	}
	const person = entities.people[row.personId], actions = row.actionIds.map(id => entities.actions[id])
	const feedbackLabel = person?.name ? `Tell ${NAME} the reply to ${person.name.split(' ')[0]} was not right` : 'Not right?'
	const Heading = grouped ? 'h3' : 'h2'
	const feedbackForm = kind && <fieldset disabled={blocked}><legend>What was wrong?</legend>{actions.filter(action => ['wrong', 'incomplete', 'unneeded'].includes(action.kind)).map(action => <label className="option" key={action.id}><input type="radio" name={`feedback-${row.id}`} checked={kind === action.kind} onChange={() => edit({ feedbackKind: action.kind })} />{action.label}</label>)}
		<p>{actions.find(action => action.kind === kind)?.meaning}</p>
		<label className="field-label">What should change?<textarea value={feedback} onChange={event => edit({ feedback: event.target.value })} onFocus={() => edit({ focusedField: 'feedback' })} onBlur={() => edit({ focusedField: undefined })} onCompositionStart={() => edit({ composing: true })} onCompositionEnd={() => edit({ composing: false })} /></label>
		{actions.filter(action => action.kind === kind).map(action => <ActionButton key={action.id} action={{ ...action, label: 'Save feedback' }} input={{ text: feedback }} disabled={newer || blocked} />)}
	</fieldset>
	const watchForm = watching && !row.watchedAs && <fieldset disabled={blocked}><legend>Watch this until it is done</legend><label className="field-label">What should get done?<input value={target} onChange={event => edit({ watchText: event.target.value })} onFocus={() => edit({ focusedField: 'watchText' })} onBlur={() => edit({ focusedField: undefined })} /></label><label className="field-label">Done when<input value={until} onChange={event => edit({ watchUntil: event.target.value })} onFocus={() => edit({ focusedField: 'watchUntil' })} onBlur={() => edit({ focusedField: undefined })} /></label><div className="action-bar" role="group" aria-label="Done by">{deadlineChoices.map(([key, label]) => <Button key={key} variant="outline" aria-pressed={byChoice === key} onClick={() => edit({ watchBy: deadlineDate(key), watchByChoice: key })}>{label}</Button>)}</div>
		{actions.filter(action => action.kind === 'watch-fyi').map(action => <ActionButton key={action.id} action={action} prepareInput={watchInput} disabled={!target.trim() || newer || blocked} />)}
		{newView && <Button variant="ghost" onClick={() => edit({ folds: { ...ui.folds, watch: false } })}>Cancel</Button>}
	</fieldset>
	if (feedbackOnly) return <>{actions.some(action => ['wrong', 'incomplete', 'unneeded'].includes(action.kind)) && <Button variant="ghost" aria-label={feedbackLabel} disabled={blocked} onClick={() => edit({ feedbackKind: kind ? undefined : 'wrong' })}>Not right?</Button>}{feedbackForm}{actions.length > 0 && <ActionState item={actions[0].item} rev={actions[0].rev} />}</>
	if (newView) {
		const reply = row.kind === 'reply' || row.kind === 'review', link = row.teams ?? row.href
		const expanded = open || row.noteIds.some(id => entities.notes[id].answer === undefined)
		const item = entities.items[row.code], ask = item?.actionIds.map(id => entities.actions[id]).find(action => action.kind === 'ask')
		const reopen = row.kind === 'closed' ? item?.actionIds.map(id => entities.actions[id]).find(action => action.kind === 'reopen') : undefined
		const expandable = !!row.text || !!reopen || !!row.used
		const searched = row.why?.searched ?? item?.why.searched ?? []
		const where = row.sentence.match(/ in (.+)$/)?.[1]
		const exchange = reply && (row.ask || row.said) ? <>{row.ask ? <span className="qa"><strong>{person.name.split(' ')[0]} asked:</strong> 		{messageText(row.ask)}</span> : <strong>{row.sentence}</strong>}{row.said && <span className="qa you"><strong>You{row.inTeams ? ' (in Teams)' : ''}:</strong> {row.said}</span>}</> : <><strong>{row.sentence}</strong>{(row.gist || row.said) && <span className="gist">{row.gist ?? `“${row.said}”`}</span>}</>
		return <article className={`done-entry${expanded ? ' done-open' : ''}`} data-activity-code={row.code} onClick={row.kind === 'catchup' ? isolateRowControls : undefined}>
			<div className="done-row">
				{reply ? <span className="row-avatar" style={{ '--hue': person.hue } as CSSProperties}>{person.initials}</span> : <span className="row-icon"><Icon name={row.kind === 'catchup' ? row.high ? 'warn' : 'eye' : row.kind === 'reminder' ? 'clock' : row.kind === 'learned' ? 'book' : 'check'} /></span>}
				<div className="done-body">{row.kind === 'catchup' && row.teams ? <a className="done-title" href={row.teams} target="_blank" rel="noopener noreferrer">{exchange}</a> : expandable ? <button className="done-title" onClick={onToggle} aria-expanded={expanded}>{exchange}</button> : <div className="done-title">{exchange}</div>}
					<span className="done-meta">{[reply ? `${person.name}${where ? ` · ${where}` : ''}` : row.kind !== 'learned' ? row.by : '', reply ? row.by : ''].filter(Boolean).join(' · ')} · <SentTime at={row.at} />{actions.some(action => action.kind === 'undo') ? ' · you can take it back' : ''}{link && row.kind !== 'catchup' && <> · <a href={link} target="_blank" rel="noopener noreferrer">{row.teams ? 'Open in Teams' : 'Open source'}↗</a></>}</span>
					{row.work && <span className="chip">{row.work}</span>}{row.watchedAs && <span className="chip">Watching as {row.watchedAs}</span>}
					{(newer || blocked) && <p role="status" className="warning">This activity changed. Your unsent words are kept. <Button variant="outline" disabled={busy} onClick={showLatest}>Review current version</Button></p>}
				</div>
				{row.kind === 'catchup' && link && <a className="done-source" href={link} target="_blank" rel="noopener noreferrer" aria-label="Open in Teams"><Icon name="ext" /></a>}
				<div className="done-row-actions" data-row-controls>{actions.filter(action => action.kind === 'undo' || row.kind === 'learned' && action.kind === 'undo-facts').map(action => <ActionButton key={action.id} action={action} />)}
					{actions.some(action => action.kind === 'watch-fyi') && !row.watchedAs && <Button variant="ghost" disabled={blocked} onClick={() => edit({ folds: { ...ui.folds, watch: !watching } })}>Watch</Button>}
					{actions.filter(action => action.kind === 'needs-me').map(action => <ActionButton key={action.id} action={action} />)}
				</div>
				{CODE.test(row.code) && <ItemCode code={row.code} />}
				{expandable && !actions.some(action => action.kind === 'undo') && <button className="done-expand" aria-label={expanded ? 'Close item details' : 'Open item details'} aria-expanded={expanded} onClick={onToggle}><Icon name="right" /></button>}
			</div>
			{expanded && <div className="done-details">
				{row.text && <div className="draft">{row.text}</div>}
				{row.checks?.map((check, index) => <p key={index} className="muted done-check">{check}</p>)}
				{reopen && <fieldset disabled={blocked}><legend>Reopen this item</legend><Field code={row.code} rev={rev} field="answer" label="What should the new draft say?" value={ui.answer ?? ''} edit={edit} /><ActionButton action={reopen} input={{ text: ui.answer }} disabled={!ui.answer?.trim() || newer || blocked} /></fieldset>}
				{(row.why || row.sentBecause || searched.length > 0) && <details><summary>Why</summary>{row.sentBecause && <p><SentBecause rule={row.sentBecause} /></p>}{row.why && <>{row.why.reason && <p>{row.why.reason}</p>}{row.why.confidence === 'low' && <p>{NAME} isn&apos;t sure this reply is right.</p>}<Sources ids={row.sourceIds} entities={entities} />{row.why.gaps.map((gap, index) => <p key={index}>{gap}</p>)}</>}{searched.length > 0 && <><p>Places checked for this item</p><ul>{searched.map((line, index) => <li key={index}>{line}</li>)}</ul></>}</details>}
				{actions.some(action => ['wrong', 'incomplete', 'unneeded'].includes(action.kind)) && <Button variant="ghost" aria-label={feedbackLabel} disabled={blocked} onClick={() => edit({ feedbackKind: kind ? undefined : 'wrong' })}>Not right?</Button>}
				{feedbackForm}
				{ask && <section className="ask-thread" ref={askThread}><h3>Ask {NAME}</h3><p className="muted">Only you see this conversation.</p>{row.noteIds.map(id => {
					const note = entities.notes[id]
					return <div key={id}><p><strong>You:</strong> {note.question}</p><p>{note.answer === '' ? 'The answer contained only chat instructions. Review the item or ask a follow-up.' : note.answer ?? 'Waiting for an answer...'}</p><Sources ids={note.sourceIds} entities={entities} /><Button variant="ghost" disabled={newer || blocked || busy} onClick={() => askThread.current?.querySelector<HTMLElement>('[data-field=ask]')?.focus()}>Ask more</Button></div>
				})}<Field code={row.code} rev={rev} field="ask" label={`Ask ${NAME} about ${row.code}`} value={ui.ask ?? ''} edit={edit} rows={2} /><ActionButton action={ask} input={{ text: ui.ask }} disabled={!ui.ask?.trim() || newer || blocked} /></section>}
				{row.used && <p className="muted done-used">{row.used}</p>}
			</div>}
			{watchForm}<ActionState item={row.code} rev={rev} />
		</article>
	}
	return <article className={`item-card${compact ? ' classic-catchup-row' : ''}`} data-activity-code={row.code} onClick={row.kind === 'catchup' ? isolateRowControls : undefined}>{compact && <span className="classic-catchup-icon"><Icon name={row.high ? 'warn' : 'eye'} /></span>}<header className="card-header"><Heading>{row.kind === 'catchup' && row.teams ? <a href={row.teams} target="_blank" rel="noopener noreferrer">{row.sentence}</a> : <button className="row-title" onClick={onToggle} aria-expanded={open}>{row.sentence}</button>}</Heading>{CODE.test(row.code) && <ItemCode code={row.code} />}</header>
		{fresh && <span className="chip" title={chipHover('new')}>New</span>}
		{(newer || blocked) && <p role="status" className="warning">{blocked ? 'An unsent edit for this item is kept on another version.' : 'This activity changed while you were editing. Your text is kept.'} <Button variant="outline" disabled={busy} onClick={showLatest}>Review current version</Button></p>}
		{!compact && row.ask && <p>{person.name} asked: {row.ask}</p>}
		{!compact && row.said && <p><strong>{row.inTeams ? 'You (in Teams)' : 'You'}:</strong> {row.said}</p>}
		{row.gist && <p className={compact ? 'classic-catchup-gist' : undefined}>		{messageText(row.gist)}</p>}
		<p className="muted">{!compact && `${person.name} - `}{row.by}{compact ? ' · ' : ' - '}<SentTime at={row.at} /></p>
		{!compact && row.work && <p>{row.work}</p>}
		{(row.teams || row.href) && <a className={compact ? 'classic-catchup-source' : undefined} aria-label={compact ? row.teams ? 'Open in Teams' : 'Open source' : undefined} href={row.teams ?? row.href} target="_blank" rel="noopener noreferrer">{compact ? <Icon name="ext" /> : row.teams ? 'Open in Teams' : 'Open source'}</a>}
		<div className="action-bar" data-row-controls>{actions.filter(action => !['wrong', 'incomplete', 'unneeded', 'watch-fyi'].includes(action.kind)).map(action => <ActionButton key={action.id} action={action} />)}
			{actions.some(action => action.kind === 'watch-fyi') && <Button variant="outline" disabled={blocked} onClick={() => edit({ folds: { ...ui.folds, watch: !watching } })}>Watch</Button>}
			{actions.some(action => ['wrong', 'incomplete', 'unneeded'].includes(action.kind)) && <Button variant="outline" aria-label={feedbackLabel} disabled={blocked} onClick={() => edit({ feedbackKind: kind ? undefined : 'wrong' })}>Not right?</Button>}
		</div>
		{row.watchedAs && <p>Watching as {row.watchedAs}</p>}
		{watchForm}
		{feedbackForm}
		{actions.length > 0 && <ActionState item={actions[0].item} rev={actions[0].rev} />}
		{open && <><div className="draft">{row.text ?? row.said ?? row.sentence}</div>
			{(row.why || row.sentBecause) && <details><summary>Why</summary>{row.sentBecause && <p><SentBecause rule={row.sentBecause} /></p>}{row.why?.reason && <p>{row.why.reason}</p>}{row.sourceIds.map(id => <p key={id}>{entities.sources[id].kind}: {entities.sources[id].label}</p>)}</details>}
			{entities.items[row.code] ? <ItemCard code={row.code} /> : row.used && <p className="muted">{row.used}</p>}
		</>}
	</article>
}
export default function Done() {
	const entities = useEntities(), { route, navigate } = useScreenNavigation()
	const entries = useDoneEntries()
	const snapshot = useSnapshot()
	const [openId, setOpenId] = useState<string>()
	const fresh = useDoneLook()
	const requested = route.split('/')[1] ?? 'all'
	// WDD N1 (Designer D1): By Delegate, what Delegate did by itself (30 days, from the action ledger), with its own kind chips.
	if (requested === 'by-delegate') return <div className="new-done"><header className="done-heading"><h1>Done</h1><p className="muted">{wddSubline(snapshot?.wdd, snapshot?.now)}</p></header>
		<nav aria-label="Done filters" className="filter-bar"><ByDelegateChip /><WddKindChips /></nav><WddList /></div>
	const filter = requested === 'closed' ? 'catchup' : isDoneFilter(requested) ? requested : 'all'
	// R12b step 3: done/rule/<ids> lists only what a line's grants sent (Settings › Your way of working links here with the line's ruleIds).
	const ruleIds = requested === 'rule' ? (route.split('/')[2] ?? '').split(',').map(decodeURIComponent).filter(Boolean) : undefined
	const rows = Object.values(entries).filter(row => ruleIds ? !!row.rule && ruleIds.includes(row.rule) : matchesDone(row, filter)).sort((a, b) => Number(fresh.has(b.id)) - Number(fresh.has(a.id)) || b.at.localeCompare(a.at))
	const newRows = rows.filter(row => fresh.has(row.id)), earlierRows = rows.filter(row => !fresh.has(row.id))
	const groups = [{ title: earlierRows.length ? 'New' : '', rows: newRows }, { title: newRows.length ? 'Earlier this week' : '', rows: earlierRows }]
	const closed = Object.values(entries).filter(row => row.kind === 'closed')
	return <div className="new-done"><header className="done-heading"><h1>Done</h1><p className="muted">{filter === 'catchup' ? `What ${NAME} read for you and closed with no reply. Click a row to open it in Teams.` : 'The last 7 days. Open a reply to see what was sent and why.'}</p>{ruleIds && <p className="muted">Only what one of your lines did, the last 7 days · <a href="#done">Show all</a></p>}</header>
		<nav aria-label="Done filters" className="filter-bar"><ByDelegateChip />{Object.entries(DONE_FILTERS).map(([key, { label, kinds }]) => {
			const count = Object.values(entities.doneEntries).filter(row => kinds.includes(row.kind)).length
			const unseen = Object.values(entities.doneEntries).filter(row => kinds.includes(row.kind) && fresh.has(row.id)).length
			return count > 0 && <Button key={key} aria-label={label} aria-pressed={filter === key} variant={filter === key ? 'default' : 'outline'} onClick={() => navigate(`done/${key}`)}>{label} <span className="count">{count}</span>{unseen > 0 && <small>{unseen} new</small>}</Button>
		})}</nav>
		{rows.length ? groups.flatMap(group => group.rows.length ? [
			...(group.title ? [<h2 className="section-h" key={`group-${group.title}`}>{group.title}</h2>] : []),
			...group.rows.map(row => <Entry key={row.id} row={row} fresh={fresh.has(row.id)} newView grouped={newRows.length > 0} open={openId === row.id} onToggle={() => setOpenId(openId === row.id ? undefined : row.id)} />),
		] : []) : <p className="empty">{filter === 'catchup' ? 'Nothing to catch up on in the last 7 days.' : 'Nothing in the last 7 days.'}</p>}
		{filter === 'catchup' && snapshot?.pageActionIds?.filter(id => entities.actions[id].kind === 'mark-all-read').map(id => <ActionButton key={id} action={entities.actions[id]} input={{ seenAt: snapshot.now }} />)}
		{filter === 'catchup' && closed.length > 0 && <details className="done-quiet"><summary>Also closed {closed.length} with nothing to know · Show</summary>{closed.map(row => <Entry key={row.id} row={row} newView open={openId === row.id} onToggle={() => setOpenId(openId === row.id ? undefined : row.id)} />)}</details>}
	</div>
}
