import { useEffect, useRef } from 'react'
import { chipHover } from '../domain/hover.ts'
import { Button } from '../components/ui/button.tsx'
import { useAction, useCardPresentation, useEdit, useItemBusy, useShowLatest } from '../data/hooks.ts'
import type { Intent } from '../domain/contracts.ts'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { NAME } from '../brand.ts'
import { useCopyDetails, useEditInChat } from '../data/browser.ts'
import { when, time } from '../domain/time.ts'
import { Icon } from '../components/ui/icon.tsx'
import { Field, Sources } from './CardFields.tsx'
export function ItemCard({ code, placementId, inline = false }: { code: string; placementId?: string; inline?: boolean }) {
	const { item, entities, ui, draft, actions, primary, newer, todoIds } = useCardPresentation(code, placementId)
	const act = useAction()
	const edit = useEdit(code, item?.rev ?? ''), showLatest = useShowLatest(code), busy = useItemBusy(code), article = useRef<HTMLElement>(null)
	const chatEdit = useEditInChat(), detailsCopy = useCopyDetails()
	useEffect(() => {
		const target = inline ? article.current?.closest('.now-row') : article.current
		target?.scrollIntoView({ block: 'start' })
		article.current?.focus({ preventScroll: true })
	}, [code, inline])
	if (!item || !entities) return <p role="status">This item is no longer open. Refresh the list to see where it moved.</p>
	const person = entities.people[item.personId], chat = entities.chats[item.chatId]
	const placement = placementId ? entities.placements[placementId] : undefined
	const workId = placement?.workId ?? item.workId, work = workId ? entities.work[workId] : undefined
	const workOnly = inline && !!placement?.workId && !item.primaryActionId
	const timeline = workOnly ? work : item.workId ? entities.work[item.workId] : work
	const report = work?.reportActionId ? entities.actions[work.reportActionId] : undefined
	const whyOpen = ui.folds?.why ?? false, threadOpen = ui.folds?.thread ?? false
	const fold = (key: string, open: boolean) => { if (ui.folds?.[key] !== open) edit({ folds: { ...ui.folds, [key]: open } }) }
	const threadView = <details className="card-thread" open={threadOpen} onToggle={event => fold('thread', event.currentTarget.open)}><summary>Show thread</summary>{!inline && item.earlier && <p>{item.earlier}</p>}{!item.thread.length && item.ask && <blockquote>{item.ask}</blockquote>}{item.thread.map((message, n) => <p key={n}><strong>{message.who}:</strong> {message.text}</p>)}</details>
	const input: Intent['input'] = primary?.kind === 'send-edit' ? { text: ui.editText ?? draft?.text ?? '', excluded: ui.excluded } :
		primary?.kind === 'pick' ? { picks: ui.picks ?? item.picked ?? [] } :
			primary?.input === 'text' ? { text: ui.answer ?? '' } : { excluded: ui.excluded }
	const invalid = primary?.input === 'text' && primary.kind !== 'send-edit' && !ui.answer?.trim() || primary?.kind === 'pick' && !input.picks?.length ||
		primary?.kind === 'send-edit' && !input.text?.trim()
	const moreView = <details className="card-more-menu"><summary aria-label="More" title="More">{inline && !work ? <Icon name="more" /> : 'More'}</summary><div className="card-more-content">
		{item.teams && <a href={item.teams} target="_blank" rel="noopener noreferrer">Open in Teams</a>}
		{item.teams && draft && <Button variant="outline" onClick={() => void chatEdit.open(ui.editing ? ui.editText ?? draft.text : draft.text, item.teams!)}>Edit in Teams</Button>}
		{actions.filter(action => ['dismiss', 'continue', 'reply-only'].includes(action.kind)).map(action => <ActionButton key={action.id} action={action} disabled={newer && action.staleness === 'exact'} disabledReason="stale" />)}
		{item.debug && <><pre>{item.debug.join('\n')}</pre><Button variant="outline" onClick={() => void detailsCopy.copy(item.debug!.join('\n'))}>Copy details</Button>{detailsCopy.message && <p role="status">{detailsCopy.message}</p>}</>}
	</div></details>
	return <article className={`item-card${inline ? ' inline-card' : ''}${inline && !work ? ' inline-simple-card' : ''}`} aria-labelledby={`card-title-${code}`} tabIndex={-1} ref={article}
		onPointerDownCapture={event => { if (event.target instanceof Element && event.target.closest('[data-primary="true"]')) edit({ interacting: true }) }}
		onKeyDown={event => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing &&
				!(event.target instanceof Element && event.target.closest('[data-field=ask]'))) {
				event.preventDefault()
				article.current?.querySelector<HTMLButtonElement>('[data-primary="true"]')?.click()
			}
		}}>
		<header className={`card-header${inline ? ' sr-only' : ''}`}><div><h2 id={`card-title-${code}`}>{person.name}</h2><p>{chat.name} {chat.guests && <strong>- Guests in chat</strong>}</p><small>{item.askAt ? 'Asked' : 'Item created'} <time dateTime={item.askAt ?? item.at}>{when(item.askAt ?? item.at)}</time></small></div><span>{code}</span></header>
		{newer && <div role="status" className="warning">Newer version available. Your current text is kept. <Button variant="outline" onClick={showLatest} disabled={busy}>Show new version</Button></div>}
		{item.newCount > 0 && <p className="warning">{item.newCount} new message{item.newCount === 1 ? '' : 's'}</p>}
		{item.before && <p>From before setup</p>}
		{placement?.chips.some(chip => chip.kind === 'holding') && <p className="chip" title={chipHover('holding')}>Holding reply</p>}
		{placement?.chips.some(chip => chip.kind === 'retrying') && <p className="warning">Retrying{placement.nextText ? `: ${placement.nextText.replace('{at}', placement.next?.at ? when(placement.next.at) : 'soon')}` : ''}</p>}
		{inline && !work && <div className="inline-card-top">{moreView}</div>}
		{inline && item.earlier && <p className="card-earlier"><Icon name="clock" /> {item.earlier}</p>}
		{inline && !work && threadView}
		{placement?.nextText && !inline && <p className="next-line">Next: {placement.nextText.replace('{at}', placement.next?.at ? when(placement.next.at) : 'soon')}</p>}
		{work && <section className="work-first">{(!workOnly || work.yours || work.then) && <h3>{inline && work.yours ? 'Your move' : inline && work.then ? 'Next' : 'This work'}</h3>}{(!workOnly && (!inline || !work.yours && !work.then)) && <p>{work.goal}</p>}{work.next && !inline && <p>Next: {work.next}</p>}{work.waiting && !inline && <p>Waiting on {work.waiting}</p>}
			{work.yours && <p className="your-step">{inline ? `${work.yours.what.replace(/[.\s]+$/, '')}.` : `Your step: ${work.yours.what}`}{work.yours.check && <>{inline ? ' ' : '. '}{work.yours.check.what} done <time dateTime={work.yours.check.at}>{when(work.yours.check.at)}</time> (build {work.yours.check.build})</>}</p>}
			{work.then && <p>{inline ? work.then.owner.kind === 'delegate' ? `${NAME}: ` : `Waiting on ${work.then.owner.kind === 'you' ? 'You' : work.then.owner.kind === 'others' ? work.then.owner.text : 'Nobody'}: ` : `Then: ${work.then.owner.kind === 'you' ? 'You' : work.then.owner.kind === 'delegate' ? NAME : work.then.owner.kind === 'others' ? work.then.owner.text : 'Nobody'} - `}{work.then.what}{work.then.you ? `${inline ? ' · ' : '. '}Then you: ${work.then.you}` : ''}</p>}
			{work.planIds.length > 0 && <><h3 className="checklist-title">Checklist</h3>
			<ol className="checklist">{work.planIds.map(id => {
				const step = entities.planSteps[id]
				return <li key={id} data-done={step.done || undefined} aria-current={step.now ? 'step' : undefined}><span className="step-mark" aria-hidden="true">{step.done ? <Icon name="check" /> : step.now ? <Icon name="right" /> : <i />}</span><span className="step-text">{step.what}</span><small>{step.owner.kind === 'you' ? 'You' : step.owner.kind === 'delegate' ? NAME : step.owner.kind === 'others' ? step.owner.text : 'Nobody'}{step.where ? ` · ${step.where}` : ''}{step.build ? ` · build ${step.build}` : ''}</small></li>
			})}</ol></>}
			{report && <fieldset className="report-form"><legend>Report your result</legend>{(['Both work', 'Issues found', 'Blocked'] as const).map(result => <label className="option" key={result}><input type="radio" name={`report-${code}`} checked={ui.resultKind === result} onChange={() => edit({ resultKind: result })} />{result}</label>)}
				<Field code={code} rev={item.rev} field="report" label="What did you see?" value={ui.report ?? ''} edit={edit} rows={2} placeholder="What you saw: errors, IDs, links" />
				<p className="muted">{NAME} drafts your report. Nothing is sent until you approve the reply.</p>
				<ActionButton action={report} primary input={{ result: ui.resultKind, text: ui.report }} disabled={!ui.resultKind} disabledReason="Pick how it went first." />
			</fieldset>}
			{!!timeline?.stepIds.length && <details><summary>What happened{workOnly && ', newest first'}{workOnly && timeline.total > timeline.stepIds.length && ` · last ${timeline.stepIds.length} steps of ${timeline.total}`}</summary><ol>{timeline.stepIds.map(id => {
				const step = entities.workSteps[id]
				return <li key={id}><time dateTime={step.at}>{when(step.at)}</time> {step.news ? <strong>{step.what}</strong> : step.what}</li>
			})}</ol></details>}
		</section>}
		{!inline && item.ask && (item.ask.length > 240 ? <details className="full-ask" open={ui.folds?.ask ?? false} onToggle={event => fold('ask', event.currentTarget.open)}><summary>Show full ask</summary><blockquote>{item.ask}</blockquote></details> : <blockquote>{item.ask}</blockquote>)}
		{item.meeting && <section className="meeting-strip" aria-label="Meeting"><h3>{item.meeting.subject}</h3>
			<p><time dateTime={item.meeting.start}>{when(item.meeting.start)}</time> - <time>{time(new Date(Date.parse(item.meeting.start) + item.meeting.minutes * 60_000))}</time> ({item.meeting.minutes} minutes)</p>
			<p>{item.meeting.attendees.join(', ')}</p>
		</section>}
		{item.promise && <section><h3>You said</h3><p>{item.promise.said}</p>{item.promise.failed && <p className="warning">Could not finish checking: {item.promise.failed}</p>}</section>}
		{item.question && <p className="question">{item.question}</p>}
		{item.job && <p className="muted">{item.job}</p>}
		{item.attention && <p role="status" className="warning">{item.attention}</p>}
		{item.context?.map((context, n) => <p key={n} className={context.tone === 'warn' ? 'warning' : 'muted'}>{context.label}: {context.text}</p>)}
		{item.choices && <fieldset><legend>{item.choices.prompt}</legend>{item.choices.options.map((option, index) => {
			const n = index + 1, selected = (ui.picks ?? item.picked ?? []).includes(n) && !ui.other
			return <label className="option" key={n}><input type={item.choices!.multi ? 'checkbox' : 'radio'} name={`choice-${code}`} checked={selected} disabled={busy || newer}
				onChange={() => {
					const picks = item.choices!.multi ? selected ? (ui.picks ?? item.picked ?? []).filter(pick => pick !== n) : [...(ui.picks ?? item.picked ?? []), n] : [n]
					edit({ picks, other: false })
					const preview = actions.find(action => action.kind === 'pick')
					if (!item.choices!.multi && preview) void act(preview, { picks })
				}} /> <span>{option.label}{option.note && <small>{option.note}</small>}{selected && option.reply && <p>{option.reply}</p>}</span></label>
		})}{item.choices.other && <label className="option"><input type="radio" name={`choice-${code}`} checked={!!ui.other} disabled={busy || newer} onChange={() => edit({ other: true })} />Other answer</label>}</fieldset>}
		{!report && (actions.some(action => action.kind === 'answer') && (!draft && !item.choices || ui.other) || primary?.input === 'text' && primary.kind !== 'send-edit') &&
			<Field code={code} rev={item.rev} field="answer" label={primary?.kind.startsWith('row-') ? `Tell ${NAME} what you did, or what to do next` : 'Your answer'} value={ui.answer ?? ''} edit={edit} />}
		{draft && <section className="reply-section"><div className="draft-heading"><h3>{draft.holding ? 'Holding reply' : 'Your reply'}</h3>
			{actions.some(action => action.kind === 'send-edit') && <Button variant="ghost" data-card-edit onClick={() => edit(ui.editing ? { editing: false, editText: undefined } : { editing: true, editText: draft.text })} disabled={busy}><Icon name="edit" />{ui.editing ? 'Cancel edit' : 'Edit'}</Button>}
			</div>{draft.commitment && <p className="warning">This reply makes a commitment. Check it before sending.</p>}
			{ui.editing ? <Field code={code} rev={item.rev} field="editText" label="Edit your reply" value={ui.editText ?? draft.text} edit={edit} rows={5} /> : <div className="draft">{draft.sendText ?? draft.text}</div>}
			{draft.preview && !ui.editing && <p className="muted"><Icon name="spark" />{' '}{item.picked?.length ? 'The reply for your pick' : 'New draft from your answer'}. Not sent yet.</p>}
		</section>}
		{item.changeIds.length > 0 && <section><h3>{item.changeIds.some(id => entities.changes[id].state === 'approved') ? 'Approved changes' : 'Changes for your approval'}</h3>{item.changeIds.map(id => {
			const change = entities.changes[id], excluded = ui.excluded?.includes(change.n) ?? false
			return <div className="change" key={id}><label><input type="checkbox" checked={!excluded} disabled={busy || change.state === 'approved'}
				onChange={() => edit({ excluded: excluded ? ui.excluded!.filter(n => n !== change.n) : [...(ui.excluded ?? []), change.n] })} /> {change.action}</label>
				<p>{change.summary} - {change.target}</p>
				{change.meaning?.map((part, n) => <p key={n} className={part.warn ? 'warning' : 'muted'}>{part.text}</p>)}
				{change.state === 'uncertain' && <p className="warning">This may already have been made. Check before approving any retry.</p>}
				{change.error && <p role="alert" className="error">{change.state === 'uncertain' ? 'Could not confirm' : 'Not made'}: {change.error}</p>}
				{change.detail && <details><summary>Exact change details</summary><pre>{change.detail}</pre></details>}
			</div>
		})}</section>}
		{item.effectIds?.some(id => !item.changeIds.includes(id)) && <details><summary>Changes already handled</summary><ul>{item.effectIds.filter(id => !item.changeIds.includes(id)).map(id => {
			const effect = entities.changes[id]
			return <li key={id}>{effect.state === 'made' ? 'Made' : effect.state === 'left-out' ? 'Left out' : effect.state}: {effect.action} - {effect.summary}</li>
		})}</ul></details>}
		{!!item.todos?.length && draft && actions.some(action => action.kind === 'send-edit') && <p className="warning"><Icon name="warn" /> <strong>Yours to do:</strong> {item.todos.join('; ')}</p>}
		{item.follow && <p>Then watch {item.follow.target} until {item.follow.until}.</p>}
		{todoIds.length > 0 && <section><h3>Yours to do</h3><ul>{todoIds.map(id => <li key={id}>{entities.todos[id].text}</li>)}</ul>
			{[...new Set(todoIds.map(id => `${entities.todos[id].code}/todo-done`))].filter(id => id !== primary?.id && entities.actions[id]).map(id => {
				const action = entities.actions[id]
				return <div key={id}><ActionButton action={action} /><ActionState item={action.item} rev={action.rev} /></div>
			})}</section>}
		{(item.why.reason || item.sourceIds.length > 0 || item.why.gaps.length > 0 || !!item.why.searched?.length) && <details open={whyOpen} onToggle={event => fold('why', event.currentTarget.open)}><summary>Why - {item.why.confidence ?? 'confidence not recorded'} - {item.sourceIds.length} sources</summary>
			<p>{item.why.reason}</p><Sources ids={item.sourceIds} entities={entities} />
			{item.why.gaps.map(gap => <p key={gap}>Could not read: {gap}</p>)}
			{item.why.searched?.map((searched, n) => <p key={n}>Looked up: {searched}</p>)}
		</details>}
		{(!inline || work) && threadView}
		<div className="action-bar">{primary && !report && <ActionButton primary action={primary} input={input} disabled={!!invalid || newer} disabledReason={newer ? 'stale' : primary.kind === 'pick' || item.choices && !ui.other ? 'pick' : 'Type your answer first.'} />}
			{actions.filter(action => action.kind === 'later').map(action => <ActionButton key={action.id} action={action} />)}
			{(!inline || work) && moreView}
		</div>
		{chatEdit.message && <p role="status">{chatEdit.message}</p>}
		{actions.filter(action => action.id !== primary?.id && !['approve', 'approve-again', 'send-edit', 'answer', 'pick', 'ask', 'later', 'dismiss', 'continue', 'todo-done', 'reply-only', 'review-again'].includes(action.kind)).map(action => <div key={action.id}>{action.meaning && <p>{action.meaning}</p>}<ActionButton action={action} disabled={newer && action.staleness === 'exact' || action.effect !== 'local' && !action.meaning} disabledReason={newer ? 'stale' : undefined} /></div>)}
		<ActionState item={code} rev={item.rev} />
		{primary && primary.rev !== item.rev && <ActionState item={primary.item} rev={primary.rev} />}
		<section className="ask-thread"><h3>Ask {NAME}</h3><p className="muted">Only you see this conversation.</p>{item.noteIds.map(id => {
			const note = entities.notes[id]
			return <div key={id}><p><strong>You:</strong> {note.question}</p><p>{note.answer === '' ? 'The answer contained only chat instructions. Review the item using its available buttons, or ask a follow-up.' : note.answer ?? 'Waiting for an answer...'}</p><Sources ids={note.sourceIds} entities={entities} />
				{note.useActionId && <ActionButton action={entities.actions[note.useActionId]} disabled={newer} disabledReason="stale" />}
			</div>
		})}
			<Field code={code} rev={item.rev} field="ask" label={`Ask ${NAME} about this`} value={ui.ask ?? ''} edit={edit} rows={2} />
			{actions.filter(action => action.kind === 'ask').map(action => <ActionButton key={action.id} action={action} input={{ text: ui.ask }} disabled={!ui.ask?.trim()} disabledReason="Type your question first." />)}
		</section>
	</article>
}
