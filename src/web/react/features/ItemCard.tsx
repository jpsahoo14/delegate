import { useEffect, useRef } from 'react'
import { Button } from '../components/ui/button.tsx'
import { useCardPresentation, useEdit, useItemBusy, useShowLatest } from '../data/hooks.ts'
import type { CardUi } from '../data/store.ts'
import type { Entities, Intent } from '../domain/contracts.ts'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { NAME } from '../brand.ts'

type FieldKey = 'editText' | 'answer' | 'ask' | 'report'
function Field({ code, rev, field, label, value, edit, rows = 3 }: {
	code: string; rev: string; field: FieldKey; label: string; value: string; edit: (patch: Partial<CardUi>) => void; rows?: number
}) {
	const id = `${code}-${rev}-${field}`
	return <label className="field-label" htmlFor={id}>{label}<textarea id={id} value={value} rows={rows}
		onChange={event => edit({ [field]: event.target.value })}
		onCompositionStart={() => edit({ composing: true })}
		onCompositionEnd={event => edit({ composing: false, [field]: event.currentTarget.value })}
	/></label>
}
function Sources({ ids, entities }: { ids: string[]; entities: Entities }) {
	return <ul className="source-list">{ids.map(id => {
		const source = entities.sources[id]
		return <li key={id}><span>{source.kind}{source.locked ? ' - not visible to the recipient' : ''}: </span>
			{source.href ? <a href={source.href} target="_blank" rel="noopener noreferrer">{source.label}</a> : source.label}
			{source.stale && <span> - may be out of date</span>}
		</li>
	})}</ul>
}
export function ItemCard({ code, placementId }: { code: string; placementId?: string }) {
	const { item, entities, ui, draft, actions, primary, newer, todoIds } = useCardPresentation(code, placementId)
	const edit = useEdit(code, item?.rev ?? ''), showLatest = useShowLatest(code), busy = useItemBusy(code), article = useRef<HTMLElement>(null)
	useEffect(() => { article.current?.focus({ preventScroll: true }) }, [code])
	if (!item || !entities) return <p role="status">This item is no longer open. Refresh the list to see where it moved.</p>
	const person = entities.people[item.personId], chat = entities.chats[item.chatId]
	const placement = placementId ? entities.placements[placementId] : undefined
	const workId = placement?.workId ?? item.workId, work = workId ? entities.work[workId] : undefined
	const report = work?.reportActionId ? entities.actions[work.reportActionId] : undefined
	const whyOpen = ui.folds?.why ?? false, threadOpen = ui.folds?.thread ?? false
	const fold = (key: string, open: boolean) => { if (ui.folds?.[key] !== open) edit({ folds: { ...ui.folds, [key]: open } }) }
	const input: Intent['input'] = primary?.kind === 'send-edit' ? { text: ui.editText ?? draft?.text ?? '', excluded: ui.excluded } :
		primary?.kind === 'pick' ? { picks: ui.picks ?? item.picked ?? [] } :
			primary?.input === 'text' ? { text: ui.answer ?? '' } : { excluded: ui.excluded }
	const invalid = primary?.input === 'text' && primary.kind !== 'send-edit' && !ui.answer?.trim() || primary?.kind === 'pick' && !input.picks?.length ||
		primary?.kind === 'send-edit' && !input.text?.trim()
	return <article className="item-card" aria-labelledby={`card-title-${code}`} tabIndex={-1} ref={article}
		onPointerDownCapture={event => { if (event.target instanceof Element && event.target.closest('[data-primary="true"]')) edit({ interacting: true }) }}
		onKeyDown={event => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) {
				event.preventDefault()
				article.current?.querySelector<HTMLButtonElement>('[data-primary="true"]')?.click()
			}
		}}>
		<header className="card-header"><div><h2 id={`card-title-${code}`}>{person.name}</h2><p>{chat.name} {chat.guests && <strong>- Guests in chat</strong>}</p></div><span>{code}</span></header>
		{newer && <div role="status" className="warning">Newer version available. Your current text is kept. <Button variant="outline" onClick={showLatest} disabled={busy}>Show new version</Button></div>}
		{item.newCount > 0 && <p className="warning">{item.newCount} new message{item.newCount === 1 ? '' : 's'}</p>}
		{item.before && <p>From before setup</p>}
		{item.ask && <blockquote>{item.ask}</blockquote>}
		{item.promise && <section><h3>You said</h3><p>{item.promise.said}</p>{item.promise.failed && <p className="warning">Could not finish checking: {item.promise.failed}</p>}</section>}
		{item.question && <p className="question">{item.question}</p>}
		{item.job && <p className="muted">{item.job}</p>}
		{item.context?.map((context, n) => <p key={n} className={context.tone === 'warn' ? 'warning' : 'muted'}>{context.label}: {context.text}</p>)}
		{item.choices && <fieldset><legend>{item.choices.prompt}</legend>{item.choices.options.map((option, index) => {
			const n = index + 1, selected = (ui.picks ?? item.picked ?? []).includes(n) && !ui.other
			return <label className="option" key={n}><input type={item.choices!.multi ? 'checkbox' : 'radio'} name={`choice-${code}`} checked={selected}
				onChange={() => {
					const picks = item.choices!.multi ? selected ? (ui.picks ?? item.picked ?? []).filter(pick => pick !== n) : [...(ui.picks ?? item.picked ?? []), n] : [n]
					edit({ picks, other: false })
				}} /> <span>{option.label}{option.note && <small>{option.note}</small>}{selected && option.reply && <p>{option.reply}</p>}</span></label>
		})}{item.choices.other && <label className="option"><input type="radio" name={`choice-${code}`} checked={!!ui.other} onChange={() => edit({ other: true })} />Other answer</label>}</fieldset>}
		{(actions.some(action => action.kind === 'answer') && (!draft && !item.choices || ui.other) || primary?.input === 'text' && primary.kind !== 'send-edit') &&
			<Field code={code} rev={item.rev} field="answer" label={primary?.kind.startsWith('row-') ? `Tell ${NAME} what you did, or what to do next` : 'Your answer'} value={ui.answer ?? ''} edit={edit} />}
		{draft && <section><h3>Your reply</h3>{draft.commitment && <p className="warning">This reply makes a commitment. Check it before sending.</p>}
			{ui.editing ? <Field code={code} rev={item.rev} field="editText" label="Edit your reply" value={ui.editText ?? draft.text} edit={edit} rows={5} /> : <div className="draft">{draft.text}</div>}
			{actions.some(action => action.kind === 'send-edit') && <Button variant="outline" onClick={() => edit(ui.editing ? { editing: false, editText: undefined } : { editing: true, editText: draft.text })} disabled={busy}>{ui.editing ? 'Cancel edit' : 'Edit'}</Button>}
		</section>}
		{item.changeIds.length > 0 && <section><h3>Changes for your approval</h3>{item.changeIds.map(id => {
			const change = entities.changes[id], excluded = ui.excluded?.includes(change.n) ?? false
			return <div className="change" key={id}><label><input type="checkbox" checked={!excluded} disabled={busy}
				onChange={() => edit({ excluded: excluded ? ui.excluded!.filter(n => n !== change.n) : [...(ui.excluded ?? []), change.n] })} /> {change.action}</label>
				<p>{change.summary} - {change.target}</p>
				{change.meaning?.map((part, n) => <p key={n} className={part.warn ? 'warning' : 'muted'}>{part.text}</p>)}
				{change.state === 'uncertain' && <p className="warning">This may already have been made. Check before approving any retry.</p>}
				{change.detail && <details><summary>Exact change details</summary><pre>{change.detail}</pre></details>}
			</div>
		})}</section>}
		{item.follow && <p>Then watch {item.follow.target} until {item.follow.until}.</p>}
		{todoIds.length > 0 && <section><h3>Yours to do</h3><ul>{todoIds.map(id => <li key={id}>{entities.todos[id].text}</li>)}</ul>
			{[...new Set(todoIds.map(id => `${entities.todos[id].code}/todo-done`))].filter(id => id !== primary?.id && entities.actions[id]).map(id => {
				const action = entities.actions[id]
				return <div key={id}><ActionButton action={action} /><ActionState item={action.item} rev={action.rev} /></div>
			})}</section>}
		{work && <section><h3>This work</h3><p>{work.goal}</p>{work.next && <p>Next: {work.next}</p>}{work.waiting && <p>Waiting on {work.waiting}</p>}
			<ol className="checklist">{work.planIds.map(id => {
				const step = entities.planSteps[id]
				return <li key={id}><span>{step.done ? 'Done: ' : ''}{step.what}{step.build ? ` - build ${step.build}` : ''}</span><small>{step.owner.kind === 'you' ? 'You' : step.owner.kind === 'delegate' ? NAME : step.owner.kind === 'others' ? step.owner.text : 'Nobody'}{step.now ? ' - now' : ''}</small></li>
			})}</ol>
			<details><summary>What happened</summary><ol>{work.stepIds.map(id => <li key={id}><time>{entities.workSteps[id].at}</time> {entities.workSteps[id].what}</li>)}</ol></details>
			{report && <fieldset><legend>Report your result</legend>{(['Both work', 'Issues found', 'Blocked'] as const).map(result => <label className="option" key={result}><input type="radio" name={`report-${code}`} checked={ui.resultKind === result} onChange={() => edit({ resultKind: result })} />{result}</label>)}
				<Field code={code} rev={item.rev} field="report" label="What did you see?" value={ui.report ?? ''} edit={edit} />
				<p className="muted">{NAME} drafts your report. Nothing is sent until you approve the reply.</p>
				<ActionButton action={report} input={{ result: ui.resultKind, text: ui.report }} disabled={!ui.resultKind} />
			</fieldset>}
		</section>}
		<details open={whyOpen} onToggle={event => fold('why', event.currentTarget.open)}><summary>Why - {item.why.confidence ?? 'confidence not recorded'} - {item.sourceIds.length} sources</summary>
			<p>{item.why.reason}</p><Sources ids={item.sourceIds} entities={entities} />
			{item.why.gaps.map(gap => <p key={gap}>Could not read: {gap}</p>)}
			{item.why.searched?.map((searched, n) => <p key={n}>Looked up: {searched}</p>)}
		</details>
		<details open={threadOpen} onToggle={event => fold('thread', event.currentTarget.open)}><summary>Show thread</summary>{item.earlier && <p>{item.earlier}</p>}{item.thread.map((message, n) => <p key={n}><strong>{message.who}:</strong> {message.text}</p>)}</details>
		<div className="action-bar">{primary && <ActionButton primary action={primary} input={input} disabled={!!invalid || newer} />}
			{actions.filter(action => action.kind === 'later').map(action => <ActionButton key={action.id} action={action} />)}
			<details><summary>More</summary>{item.teams && <a href={item.teams} target="_blank" rel="noopener noreferrer">Open in Teams</a>}
				{actions.filter(action => ['dismiss', 'continue', 'reply-only'].includes(action.kind)).map(action => <ActionButton key={action.id} action={action} disabled={newer && action.staleness === 'exact'} />)}
				{item.debug && <pre>{item.debug.join('\n')}</pre>}
			</details>
		</div>
		{actions.filter(action => !['approve', 'send-edit', 'answer', 'pick', 'ask', 'later', 'dismiss', 'continue', 'todo-done', 'reply-only', 'review-again'].includes(action.kind)).map(action => <div key={action.id}>{action.meaning && <p>{action.meaning}</p>}<ActionButton action={action} disabled={newer && action.staleness === 'exact'} /></div>)}
		<ActionState item={code} rev={item.rev} />
		{primary && primary.rev !== item.rev && <ActionState item={primary.item} rev={primary.rev} />}
		<section className="ask-thread"><h3>Ask {NAME}</h3><p className="muted">Only you see this conversation.</p>{item.noteIds.map(id => {
			const note = entities.notes[id]
			return <div key={id}><p><strong>You:</strong> {note.question}</p><p>{note.answer ?? 'Waiting for an answer...'}</p><Sources ids={note.sourceIds} entities={entities} /></div>
		})}
			<Field code={code} rev={item.rev} field="ask" label={`Ask ${NAME} about this`} value={ui.ask ?? ''} edit={edit} rows={2} />
			{actions.filter(action => action.kind === 'ask').map(action => <ActionButton key={action.id} action={action} input={{ text: ui.ask }} disabled={!ui.ask?.trim()} />)}
		</section>
	</article>
}
