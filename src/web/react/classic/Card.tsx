import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { useAction, useCardPresentation, useEdit, useItemBusy, useShowLatest, useSnapshot } from '../data/hooks.ts'
import { useCopyDetails, useEditInChat } from '../data/browser.ts'
import { ActionButton, ActionState } from '../features/ActionButton.tsx'
import { Field, Sources } from '../features/CardFields.tsx'
import { Entry } from '../features/Done.tsx'
import type { Intent, Snapshot } from '../domain/contracts.ts'
import { when, time } from '../domain/time.ts'
import { NAME } from '../brand.ts'
import { Avatar } from './Avatar.tsx'
import { useData, type CardUi } from '../data/store.ts'
import { ClassicWhy, Conversation, conversationOf } from './Blocks.tsx'

function meetingTime(at: string) {
	const start = new Date(at), today = new Date()
	const days = Math.round((new Date(start).setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86_400_000)
	const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
	return `${day} ${time(start)}`
}

export function ClassicCard({ code, fallback, readOnly = false }: { code: string; fallback?: Snapshot; readOnly?: boolean }) {
	const presentation = useCardPresentation(code, undefined, fallback), snapshot = useSnapshot()
	const item = readOnly ? snapshot?.entities.items[code] : presentation.item, entities = readOnly ? snapshot?.entities : presentation.entities
	const [snapshotFolds, setSnapshotFolds] = useState<Record<string, boolean>>({})
	const ui: CardUi = readOnly ? { folds: snapshotFolds } : presentation.ui
	const draft = item?.draftId && entities ? entities.drafts[item.draftId] : undefined
	const actions = readOnly ? [] : presentation.actions, primary = readOnly ? undefined : presentation.primary
	const primaryUnavailable = useData(state => primary && (state.entities.actions[primary.id]?.unavailable ?? primary.unavailable))
	const newer = !readOnly && presentation.newer, todoIds = readOnly ? item?.todoIds ?? [] : presentation.todoIds
	const edit = useEdit(code, item?.rev ?? ''), showLatest = useShowLatest(code), busy = useItemBusy(code), act = useAction()
	const article = useRef<HTMLElement>(null), menu = useRef<HTMLDetailsElement>(null)
	const chatEdit = useEditInChat(), detailsCopy = useCopyDetails()
	const outcome = useData(state => Object.values(state.byRevision).reverse().find(ui => ui.result?.item === code)?.result)
	const todoRevision = useData(state => Object.entries(state.byRevision).reverse().find(([key,ui]) => key.startsWith(`${code}@`) && ui.lastAction === `${code}/todo-done`)?.[0].slice(code.length + 1))
	useEffect(() => { if (!readOnly) article.current?.focus({ preventScroll: true }) }, [code, readOnly])
	useEffect(() => { if (!readOnly && ui.other) article.current?.querySelector<HTMLInputElement>('[data-field=answer]')?.focus() }, [ui.other, readOnly])
	useEffect(() => {
		if (readOnly) return
		const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false }
		addEventListener('pointerdown', outside)
		return () => removeEventListener('pointerdown', outside)
	}, [readOnly])
	if (!item || !entities) return <p role="alert">This item is no longer available. <a href="#classic/home">Back to Home</a></p>
	const person = entities.people[item.personId], chat = entities.chats[item.chatId], work = item.workId ? entities.work[item.workId] : undefined
	const family = Object.values(snapshot?.entities.placements ?? {}).find(placement => placement.subjects.includes(code) && placement.subjects.length > 1)
	const live = snapshot?.classic?.needsIds.includes(code)
	const active = ui.editing || ['editText', 'answer', 'report'].includes(ui.focusedField ?? '') || ui.answer || ui.report || ui.picks || ui.excluded || ui.other
	const settled = !readOnly && !live && !active && !busy
	const exactBlocked = readOnly || newer || !live
	const done = Object.values(snapshot?.entities.doneEntries ?? {}).filter(row => row.code === code).sort((a, b) => b.at.localeCompare(a.at)).find(row => row.kind === 'reply' || row.kind === 'review')
	const { notes, entities: noteEntities } = conversationOf(snapshot, code, item.noteIds, entities)
	const workActions = readOnly ? [] : (snapshot?.classic?.workActionIds?.[code] ?? []).map(id => snapshot!.entities.actions[id])
	const todoAction = actions.find(action => action.kind === 'todo-done')
	const canEditReply = item.type !== 'question' && actions.some(action => action.kind === 'send-edit')
	const recovery = primary?.kind === 'answer' && primary.recovery
	const showSkip = recovery || work?.proposed || !!item.promise
	const workResult = ui.lastAction?.includes('/classic-work-')
	const fold = (key: string, value: boolean) => readOnly ? setSnapshotFolds(folds => ({ ...folds, [key]: value })) : edit({ folds: { ...ui.folds, [key]: value } })
	const Heading = readOnly ? 'h3' : 'h2'
	const startEdit = () => { edit({ editing: true, editText: draft?.text ?? '' }); if (menu.current) menu.current.open = false }
	const input: Intent['input'] = primary?.kind === 'send-edit' ? { text: ui.editText ?? draft?.text ?? '', excluded: ui.excluded } :
		primary?.kind === 'pick' ? { picks: ui.picks ?? item.picked ?? [] } :
			primary?.input === 'text' ? { text: ui.answer ?? '' } : { excluded: ui.excluded }
	const invalid = primary?.input === 'text' && primary.kind !== 'send-edit' && !ui.answer?.trim() ||
		primary?.kind === 'pick' && !input.picks?.length || primary?.kind === 'send-edit' && !input.text?.trim()
	const context = item.context?.length ? <ul className="classic-context">{item.context.map((line, n) => <li key={n} data-warn={line.tone === 'warn' || undefined}><Icon name={line.tone === 'warn' ? 'warn' : 'info'} /><span>{line.label && <b>{line.label}: </b>}{line.text}</span></li>)}</ul> : null
	const draftView = draft && <div className="classic-reply">
		<div className="classic-label"><span>{draft.holding ? 'Holding reply' : 'Your reply'}</span>{!ui.editing && canEditReply && <Button variant="ghost" data-card-edit onClick={startEdit} disabled={busy}><Icon name="edit" />Edit</Button>}</div>
		{ui.editing ? <Field code={code} rev={item.rev} field="editText" label="Edit your reply" value={ui.editText ?? draft.text} edit={edit} rows={5} /> : <div className="classic-draft">{draft.sendText ?? draft.text}</div>}
		{draft.preview && <p className="classic-card-note"><Icon name="spark" />{item.picked?.length ? 'The reply for your pick' : 'New draft from your answer'}. Not sent yet.</p>}
		{draft.commitment && <p className="classic-card-note"><Icon name="info" />This reply commits you to something. Check the date or promise.</p>}
		{draft.holding && <p className="classic-card-note"><Icon name="info" />Not the answer: the work did not finish. It only tells them you are on it.</p>}
	</div>
	const choices = item.choices && <><fieldset className="classic-options" disabled={busy || exactBlocked}><legend className="sr-only">{item.choices.prompt || item.question || 'Options'}</legend>{item.choices.options.map((option, index) => {
		const n = index + 1, selected = (ui.picks ?? item.picked ?? []).includes(n) && !ui.other
		return <label className={`classic-option${item.choices!.multi ? ' classic-multi' : ''}`} key={n}><input data-classic-option type={item.choices!.multi ? 'checkbox' : 'radio'} name={`classic-choice-${code}`} checked={selected} onChange={() => {
			const picks = item.choices!.multi ? selected ? (ui.picks ?? item.picked ?? []).filter(pick => pick !== n) : [...(ui.picks ?? item.picked ?? []), n] : [n]
			edit({ picks, other: false, answer: undefined })
			const action = actions.find(action => action.kind === 'pick')
			if (!item.choices!.multi && action) void act(action, { picks })
		}} /><span className="classic-option-mark"><Icon name="check" /></span><span className="classic-option-text"><b>{option.label}</b>{option.note && <span>{option.note}</span>}</span><small>{n}</small></label>
	})}{item.choices.other !== false && <label className="classic-option"><input data-classic-option type="radio" name={`classic-choice-${code}`} checked={!!ui.other} onChange={() => edit({ other: true, picks: undefined })} /><span className="classic-option-mark" /><span className="classic-option-text"><b>Other answer…</b><span>Say it in your words. {NAME} drafts the reply.</span></span></label>}</fieldset>
		{ui.other && <Field code={code} rev={item.rev} field="answer" label="Your answer" placeholder="Say it in your words" value={ui.answer ?? ''} edit={edit} singleLine />}
	</>
	const changes = item.changeIds.length > 0 && <><div className="classic-label"><span>Changes to make</span><span>{item.changeIds.filter(id => !ui.excluded?.includes(entities.changes[id].n)).length} of {item.changeIds.length} selected</span></div><ul className="classic-changes">{item.changeIds.map(id => {
		const change = entities.changes[id], excluded = ui.excluded?.includes(change.n) ?? false
		return <li key={id}><label className="classic-change"><input data-classic-change type="checkbox" checked={!excluded} disabled={busy || exactBlocked || change.state === 'approved'} onChange={() => edit({ excluded: excluded ? ui.excluded!.filter(n => n !== change.n) : [...(ui.excluded ?? []), change.n] })} /><span className="classic-option-mark"><Icon name="check" /></span><span className="classic-change-text"><span className="classic-change-target">{change.target}<small>{change.system}</small></span><p>{change.summary}</p>
			{change.meaning?.map((part, n) => <p className={part.warn ? 'warning' : 'muted'} key={n}>{part.text}</p>)}{change.detail && <pre>{change.detail}</pre>}
			{change.state === 'uncertain' && <p className="warning">This may already have been made. Check before approving any retry.</p>}{change.error && <p role="alert">{change.error}</p>}
		</span></label></li>
	})}</ul></>
	return <article className="classic-card item-card" tabIndex={-1} aria-labelledby={`classic-card-${code}`} ref={article}
		onPointerDownCapture={event => { if (!readOnly && event.target instanceof Element && event.target.closest('[data-primary=true]')) edit({ interacting: true }) }}
		onKeyDown={event => { if (!readOnly && (event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing && !(event.target instanceof Element && event.target.closest('.classic-card-menu, [data-field=ask]'))) { event.preventDefault(); article.current?.querySelector<HTMLButtonElement>('[data-primary=true]')?.click() } }}>
		{!readOnly && exactBlocked && !settled && <div className="classic-stale" role="status"><Icon name="warn" /><p><b>Changed since you looked.</b> Your text is kept.{!live && ' This item left Needs you.'}</p><Button variant="outline" disabled={busy} onClick={showLatest}>Show the new version</Button></div>}
		{!readOnly && family && <nav className="classic-card-section classic-actions" aria-label={`Items in ${family.code}`}>{family.subjects.filter(subject => snapshot?.entities.items[subject]).map(subject => <a key={subject} href={`#classic/focus/${subject}`} aria-current={subject === code ? 'page' : undefined}>Open item {subject}</a>)}</nav>}
		<section className="classic-card-section">
			<div className="classic-card-head"><Avatar person={person} large /><div className="classic-card-who"><Heading id={`classic-card-${code}`}>{person.name}</Heading><div className="classic-card-meta"><Icon name={chat.group ? 'chat' : 'reply'} /><span>{chat.name}</span>{chat.guests && <span className="chip">Guests</span>}<span>·</span><time dateTime={item.at}>{when(item.at)}</time></div>{readOnly && item.teams && <a href={item.teams} target="_blank" rel="noopener noreferrer">Open in Teams</a>}</div>
				<div className="classic-card-right">{item.before && <span className="chip">From before setup · {when(item.before)}</span>}{item.newCount > 0 && <span className="chip">{item.newCount} new</span>}<span className="code">{code}</span>{!readOnly && !settled && <details className="classic-card-menu" ref={menu} onKeyDown={event => {
					event.stopPropagation()
					if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const options = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a')], index = options.indexOf(document.activeElement as HTMLElement); options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus() }
				}}><summary aria-label={`More actions for ${code}`}><Icon name="more" /></summary><div className="classic-card-menu-content">
					{draft && canEditReply && <Button variant="ghost" data-card-edit onClick={startEdit} disabled={busy}>Edit reply</Button>}
					{actions.filter(action => action.kind === 'later').map(action => <ActionButton key={action.id} action={action} />)}
					<Button variant="ghost" onClick={() => { fold('thread', !ui.folds?.thread); if (menu.current) menu.current.open = false }}>{ui.folds?.thread ? 'Hide' : 'Show'} thread</Button>
					{item.teams && draft && <Button variant="ghost" onClick={() => void chatEdit.open(ui.editing ? ui.editText ?? draft.text : draft.text, item.teams!)}>Edit in Teams</Button>}
					{item.teams && <a href={item.teams} target="_blank" rel="noopener noreferrer">Open in Teams</a>}
					{actions.filter(action => action.kind === 'continue' || action.kind === 'dismiss' && !showSkip).map(action => <ActionButton key={action.id} action={action} disabled={exactBlocked && action.staleness === 'exact'} />)}
				</div></details>}</div>
			</div>
			{settled ? <p role="status" className="classic-handled">This item no longer needs you. It stays in this visit&apos;s queue.</p> : <>{item.earlier && <p className="classic-earlier"><Icon name="clock" />{item.earlier}</p>}{item.ask && <div className="classic-message">{item.ask}<button className="classic-thread-toggle" aria-expanded={!!ui.folds?.thread} onClick={() => fold('thread', !ui.folds?.thread)}>{ui.folds?.thread ? 'Hide' : 'Show'} thread</button></div>}
				{ui.folds?.thread && <ol className="classic-thread">{(item.thread.length ? item.thread : [{ who: person.name, text: item.ask ?? '', at: item.at }]).map((message, n) => <li key={n}><b>{message.who}</b> <time>{when(message.at)}</time><div>{message.text}</div></li>)}</ol>}</>}
			{chatEdit.message && <p role="status">{chatEdit.message}</p>}
		</section>
		{!settled && <>
			{work && <section className="classic-card-section classic-work" aria-label="This work"><p><Icon name="eye" /><span><b>{work.proposed ? 'Track as work?' : work.home ? `Part of ${work.home}:` : 'This work:'}</b> {work.goal}{work.waiting ? ` · waiting on ${work.waiting}` : work.next ? ` · next: ${work.next}` : ''}</span></p>
				{work.planIds.length > 0 && <ul className="classic-plan" aria-label="Plan">{work.planIds.map(id => { const step = entities.planSteps[id]; return <li key={id} data-done={step.done || undefined}><span>{step.done ? '✓' : '○'}</span> {step.what} <span className="muted">{[step.owner.kind === 'you' ? 'you' : step.owner.kind === 'delegate' ? NAME : step.owner.kind === 'others' ? step.owner.text === 'Others' ? 'them' : step.owner.text : 'Nobody', step.where, step.build && `build ${step.build}`].filter(Boolean).join(' · ')}</span></li> })}</ul>}
				<ol className="classic-work-steps">{work.stepIds.map(id => { const step = entities.workSteps[id]; return <li key={id} data-news={step.news || undefined}><time>{when(step.at)}</time> {step.what}</li> })}</ol>
				{workActions.length > 0 && <div className="classic-actions">{workActions.map(action => <ActionButton key={action.id} action={action} disabled={exactBlocked} />)}</div>}{workResult && <ActionState item={code} rev={item.rev} />}
			</section>}
			<fieldset className="classic-card-section classic-card-body" disabled={busy || readOnly}>
				{item.meeting && <div className="classic-meeting"><span className="classic-calendar"><small>{new Date(item.meeting.start).toLocaleDateString([], { month: 'short' })}</small><b>{new Date(item.meeting.start).getDate()}</b></span><div><b>{item.meeting.subject}</b><span>{meetingTime(item.meeting.start)} to {time(new Date(Date.parse(item.meeting.start) + item.meeting.minutes * 60_000))}</span></div><span className="classic-attendees">{item.meeting.attendees.slice(0, 3).map((name, n) => <Avatar key={n} person={Object.values(entities.people).find(person => person.name === name) ?? { ...person, name, initials: name.split(/\s+/).map(word => word[0]).slice(0, 2).join('') }} />)}</span></div>}
				{item.promise && <p className="classic-also-line"><Icon name="reply" /><span><b>You said:</b> “{item.promise.said}”{item.promise.failed !== undefined && <span> Sent. Could not check what your reply promised: {item.promise.failed}</span>}</span></p>}
				{(item.choices?.prompt || item.question) && (!!item.choices || item.type === 'question' || item.type === 'review' || !draft?.preview) && <p className="classic-question">{item.choices?.prompt || item.question}</p>}
				{item.attention && (!draft?.holding || item.attentionKind === 'reply-changed') && <p className="warning" role="status">{item.attention}</p>}
				{draft?.holding && item.attentionKind === 'run-failed' && item.attention && <details className="classic-run-detail"><summary>Why the work stopped: {item.attention.length > 160 ? `${item.attention.slice(0, 157)}...` : item.attention}</summary><p>{item.attention}</p></details>}
				{item.type !== 'review' && context}
				{item.type === 'review' && <>{item.job && !item.promise && <p className="classic-review-summary"><Icon name="pr" /><b>{item.job}</b> · {item.changeIds.length} finding{item.changeIds.length === 1 ? '' : 's'}</p>}{changes}</>}
				{choices}
				{(item.type === 'question' || recovery || !item.choices && !draft && actions.some(action => action.kind === 'answer')) && <Field code={code} rev={item.rev} field="answer" label="Your answer" placeholder="Your answer" value={ui.answer ?? ''} edit={edit} singleLine />}
				{item.type !== 'question' && (!item.choices || draft?.preview && !ui.other) && draftView}
				{item.type !== 'review' && changes}
				{item.effectIds?.some(id => !item.changeIds.includes(id)) && <details><summary>Changes already handled</summary><ul>{item.effectIds.filter(id => !item.changeIds.includes(id)).map(id => <li key={id}>{entities.changes[id].state}: {entities.changes[id].summary}</li>)}</ul></details>}
				{!!item.todos?.length && draft && (readOnly || actions.some(action => action.kind === 'send-edit')) && <p className="classic-also-line"><Icon name="warn" /><span><b>Yours to do:</b> {item.todos.join('; ')}</span></p>}
				{todoIds.length > 0 && <div className="classic-earlier-todos"><p className="classic-also-line"><Icon name="warn" /><span><b>Still to do from your earlier reply:</b> {todoIds.map(id => entities.todos[id].text).join('; ')}</span></p>{todoAction && <ActionButton action={todoAction} disabled={exactBlocked} />}</div>}
				{item.follow && <p className="classic-also-line"><Icon name="eye" /><span><b>Then:</b> watch {item.follow.target} every {item.follow.everyHours} h until {item.follow.until}, for up to 7 days. Change it under Watching.</span></p>}
			</fieldset>
			{(item.why.reason || item.sourceIds.length > 0 || item.why.gaps.length > 0 || (item.why.searched?.length ?? 0) > 0) && <section className="classic-card-section classic-why-section"><ClassicWhy why={item.why} sourceIds={item.sourceIds} entities={entities} name={person.name} open={ui.folds?.why ?? false} onToggle={open => fold('why', open)} /></section>}
			{item.debug && <section className="classic-card-section"><details><summary>Details</summary><pre>{item.debug.join('\n')}</pre>{!readOnly && <Button variant="ghost" onClick={() => void detailsCopy.copy(item.debug!.join('\n'))}>Copy details</Button>}{!readOnly && detailsCopy.message && <p role="status">{detailsCopy.message}</p>}</details></section>}
			{!readOnly && <section className="classic-card-section classic-card-footer">{primaryUnavailable && <p role="alert" className="warning">{primaryUnavailable.reason}</p>}{!workResult && <ActionState item={code} rev={item.rev} />}{todoRevision && todoRevision !== item.rev && <ActionState item={code} rev={todoRevision} />}<div className="classic-actions">
				{primary?.kind === 'todo-done' ? null : primary ? <ActionButton primary action={primary} input={input} disabled={!!invalid || exactBlocked} /> : item.choices && <Button disabled>Send</Button>}
				{ui.editing && <Button variant="ghost" onClick={() => edit({ editing: false, editText: undefined })}>Cancel edit</Button>}
				{showSkip && actions.filter(action => action.kind === 'dismiss').map(action => <ActionButton key={action.id} action={action} disabled={exactBlocked} />)}
				{!ui.editing && actions.filter(action => action.kind === 'reply-only').map(action => <ActionButton key={action.id} action={action} disabled={exactBlocked} />)}
				{actions.filter(action => action.kind === 'later').map(action => <ActionButton key={action.id} action={action} />)}
			</div>{primary?.effect === 'local' && (primary.kind === 'pick' || primary.kind === 'answer') && <p className="classic-card-hint">{recovery ? `${NAME} retries with your directions. Nothing is sent.` : 'Nothing is sent yet. You will see the reply first.'}</p>}
				{actions.filter(action => action.id !== primary?.id && !['approve', 'approve-again', 'send-edit', 'answer', 'pick', 'ask', 'later', 'dismiss', 'continue', 'reply-only', 'todo-done'].includes(action.kind)).map(action => <ActionButton key={action.id} action={action} disabled={exactBlocked && action.staleness === 'exact'} />)}
			</section>}
		</>}
		{settled && <section className="classic-card-section">{outcome && outcome !== ui.result && <p role={outcome.refused || outcome.uncertain ? 'alert' : 'status'}>{outcome.text}</p>}<ActionState item={code} rev={item.rev} />{done && <Entry row={done} feedbackOnly open={false} onToggle={() => {}} />}</section>}
		{readOnly ? notes.length > 0 && <section className="classic-card-section"><h4>Your questions and answers</h4>{notes.map(note => <div key={note.id}><p><strong>{note.question}</strong></p><p>{note.answer ?? `${NAME} is looking into it.`}</p><Sources ids={note.sourceIds} entities={noteEntities} /></div>)}</section> : <Conversation code={code} rev={item.rev} ui={ui} edit={edit} notes={notes} entities={noteEntities} actions={actions} blocked={exactBlocked} sent={settled} />}
	</article>
}
