import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { chipHover } from '../domain/hover.ts'
import { Button, Hint } from '../components/ui/button.tsx'
import { useAction, useCardPresentation, useEdit, useItemBusy, useShowLatest, useSnapshot } from '../data/hooks.ts'
import type { Entities, Intent, Item, Snapshot } from '../domain/contracts.ts'
import type { CardUi } from '../data/store.ts'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { NAME } from '../brand.ts'
import { useCopyDetails, useEditInChat } from '../data/browser.ts'
import { when, time } from '../domain/time.ts'
import { Icon } from '../components/ui/icon.tsx'
import { Field, Sources } from './CardFields.tsx'
import { SentTime } from './SentTime.tsx'
import './card.css'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { useSetting } from '../data/screens.ts'

// The card (spec S1, design-spec/mockups/card-redesign.html): the same blocks in New's opened row and Classic's Needs-you card.
// 1 their message · 2 what you'll send · 3 what happens when you send · 4 actions · 5 Details.
export const firstName = (name: string) => name.split(/\s+/)[0] || name
export const whereOf = (chat: Entities['chats'][string]) => chat.group ? `in ${chat.name}` : '1:1 chat'
// The time the person wrote: their newest message after the draft when they wrote again, else the ask; never Delegate's own times.
export function sentAt(item: Item): { at: string; added: boolean } {
	const theirs = item.newCount > 0 ? [...item.thread].reverse().find(message => !message.owner)?.at : undefined
	return theirs ? { at: theirs, added: false } : item.askAt ? { at: item.askAt, added: false } : { at: item.at, added: true }
}

// Their message (spec S9): up to 6 lines, then "Show the whole message (N characters)", opened in a box that scrolls. Above
// 20,000 characters only the first 2,000 ever reach the page, with Open in Teams for the rest.
// The row shows up to 200 of its characters, so the page never holds more than 2,000 of a huge message.
const HUGE = 20_000, SHOWN = 2_000, HUGE_SHOWN = 1_800
export const messageText = (text: string) => text.replace(/(\[image[^\]\n]*?)\s+inline:[0-9a-f]{16,40}(?=\])/gi, '$1')
export function MessageBubble({ text: raw, teams, open, onToggle }: { text: string; teams?: string; open: boolean; onToggle: (open: boolean) => void }) {
	const text = messageText(raw)
	if (text.length > HUGE) return <div className="card-bubble-wrap"><blockquote className="card-bubble scroll">{text.slice(0, HUGE_SHOWN)}…</blockquote>
		<p className="muted">The rest is too long to show here ({text.length.toLocaleString()} characters).{teams && <> <a href={teams} target="_blank" rel="noopener noreferrer">Open in Teams <Icon name="ext" /></a></>}</p></div>
	const long = text.length > 600 || text.split('\n').length > 6
	if (!long) return <blockquote className="card-bubble">{text}</blockquote>
	return <div className="card-bubble-wrap"><blockquote className={`card-bubble ${open ? 'scroll' : 'clamp'}`}>{text}</blockquote>
		<button type="button" className="link-button" onClick={() => onToggle(!open)} aria-expanded={open}>{open ? 'Show less' : `Show the whole message (${text.length.toLocaleString()} characters)`}</button></div>
}
const clip = (text: string) => text.length > SHOWN ? `${text.slice(0, SHOWN)}…` : text
const compact = (iso: string) => <SentTime at={iso} />

// Some read tools are switched off and a job ran out of routes (#17 b): the same one-click Allow all as Settings, or Settings itself.
const ALLOW_ALL = { key: 'toolsAll', label: 'Allow all read tools', help: '', kind: 'switch' as const, section: 'you' as const, value: 'false', group: '*' }
function ToolsOff() {
	const state = useSetting(ALLOW_ALL), { href } = useScreenNavigation()
	return <p className="card-tools-off">Some read tools are off, so it may not have had the one it needed. <Button variant="outline" disabled={state.busy || (!state.error && !!state.text)} onClick={state.toggle}>{state.busy ? 'Saving...' : 'Allow all read tools'}</Button> <a href={href('settings/tools')}>Choose in Settings</a>
		{state.text && <span role={state.error ? 'alert' : 'status'}> {state.text}{!state.error && ' Try again to run it with them.'}</span>}</p>
}

export function ItemCard({ code, placementId, inline = false, asks, fallback, readOnly = false }: { code: string; placementId?: string; inline?: boolean; asks?: { codes: string[]; onOpen: (code: string) => void }; fallback?: Snapshot; readOnly?: boolean }) {
	const presentation = useCardPresentation(code, placementId, fallback), snapshot = useSnapshot()
	const [localUi, setLocalUi] = useState<CardUi>({})
	const item = readOnly ? snapshot?.entities.items[code] : presentation.item
	const entities = readOnly ? snapshot?.entities : presentation.entities
	const ui = readOnly ? localUi : presentation.ui, actions = readOnly ? [] : presentation.actions
	const draft = item?.draftId && entities ? entities.drafts[item.draftId] : undefined
	const declared = readOnly ? undefined : presentation.primary, newer = !readOnly && presentation.newer, todoIds = readOnly ? item?.todoIds ?? [] : presentation.todoIds
	const act = useAction()
	const liveEdit = useEdit(code, item?.rev ?? ''), showLatest = useShowLatest(code), busy = useItemBusy(code), article = useRef<HTMLElement>(null)
	const edit = readOnly ? (patch: Partial<CardUi>) => setLocalUi(previous => ({ ...previous, ...patch })) : liveEdit
	const chatEdit = useEditInChat(), detailsCopy = useCopyDetails()
	const pendingAsk = !!item && !!entities && item.noteIds.some(id => entities.notes[id]?.answer === undefined)
	useEffect(() => {
		const target = inline ? article.current?.closest('.now-row') : article.current
		if (!readOnly) { target?.scrollIntoView({ block: 'start' }); article.current?.focus({ preventScroll: true }) }
	}, [code, inline, readOnly])
	// Details opens by itself while an Ask answer is pending, and stays open until the owner closes it.
	useEffect(() => { if (pendingAsk && ui.folds?.details === undefined) edit({ folds: { ...ui.folds, details: true } }) }, [pendingAsk, ui.folds, edit])
	if (!item || !entities) return <p role="status">This item is no longer open. Refresh the list to see where it moved.</p>
	const person = entities.people[item.personId], chat = entities.chats[item.chatId], first = firstName(person.name)
	const placement = placementId ? entities.placements[placementId] : undefined
	const workId = placement?.workId ?? item.workId, work = workId ? entities.work[workId] : undefined
	const timeline = item.workId ? entities.work[item.workId] : work
	const report = !readOnly && work?.reportActionId ? entities.actions[work.reportActionId] : undefined
	// Your step (S2): its form is the card's primary; the row's free-text "Tell Delegate" is gone (redirecting is in Details › Ask).
	const answerAction = actions.find(action => action.kind === 'answer')
	const primary = report ?? (item.question && answerAction && !work?.yours && !ui.editing ? answerAction : declared)
	const fold = (key: string, open: boolean) => { if (ui.folds?.[key] !== open) edit({ folds: { ...ui.folds, [key]: open } }) }
	const editable = !!draft && actions.some(action => action.kind === 'send-edit')
	const replyText = ui.editText ?? draft?.sendText ?? draft?.text ?? ''
	const input: Intent['input'] = primary?.kind === 'send-edit' ? { text: replyText, excluded: ui.excluded } :
		primary?.kind === 'pick' ? { picks: ui.picks ?? item.picked ?? [] } :
			primary?.input === 'text' ? { text: ui.answer ?? '' } : { excluded: ui.excluded }
	const invalid = primary?.input === 'text' && primary.kind !== 'send-edit' && !ui.answer?.trim() || primary?.kind === 'pick' && !input.picks?.length ||
		primary?.kind === 'send-edit' && !input.text?.trim()
	const sent = sentAt(item), replyWhere = chat.group ? `in ${chat.name}` : 'in your 1:1'
	const avatar: CSSProperties & { '--hue': number } = { '--hue': person.hue }
	const continueAction = actions.find(action => action.kind === 'continue')

	// Block 1: their message, with its chat and time, the thread in place, and every warning (never folded).
	const changeWarns = item.changeIds.flatMap(id => entities.changes[id].meaning?.filter(part => part.warn).map(part => part.text) ?? [])
	const warnings = [
		draft?.commitment && 'This reply makes a commitment. Check it before sending.',
		item.newCount > 0 && `${first} wrote again after this draft${item.newCount > 1 ? ` (${item.newCount} new messages)` : ''}.`,
		...(item.context ?? []).filter(context => context.tone === 'warn').map(context => `${item.prLabel ? `${item.prLabel} · ` : ''}${context.label}: ${context.text}`),
		...changeWarns,
		item.attention,
	].filter((line): line is string => !!line)
	const earlier = item.thread.length
	const block1 = <section className="card-block card-message" aria-label={`${person.name}'s message`}>
		<div className="card-head"><span className="card-avatar" style={avatar} aria-hidden="true">{person.initials}</span>
			<h2 id={`card-title-${code}`} className="card-who">{person.name}</h2><span className="card-where">· {whereOf(chat)} ·</span>
			<SentTime at={sent.at} added={sent.added} full code={code} />
			{chat.guests && <Hint text={chipHover('guests')}><span className="chip">Guests in chat</span></Hint>}
			<span className="card-head-end">{item.teams && <Hint text="Open this message in Teams, in a new tab."><a className="card-teams" href={item.teams} target="_blank" rel="noopener noreferrer">Open in Teams <Icon name="ext" /></a></Hint>}</span>
		</div>
		{item.ask && <MessageBubble text={item.ask} teams={item.teams} open={ui.folds?.ask ?? false} onToggle={open => fold('ask', open)} />}
		{earlier > 0 && <details className="card-thread" open={ui.folds?.thread ?? false} onToggle={event => fold('thread', event.currentTarget.open)}>
			<Hint text="Show the earlier messages of this conversation here. Nothing changes in Teams."><summary>Show {earlier} earlier message{earlier === 1 ? '' : 's'}</summary></Hint>
			<ol className="thread-list">{item.thread.map((message, n) => <li key={n}><strong>{message.who}</strong> <time dateTime={message.at}>{when(message.at)}</time>			<p>{clip(messageText(message.text))}</p></li>)}</ol>
		</details>}
		{item.earlier && <p className="card-earlier"><Icon name="clock" /> {item.earlier}</p>}
		{newer && <p role="status" className="warnline"><Icon name="warn" /> Changed since you looked. Your current text is kept. <Button variant="outline" onClick={showLatest} disabled={busy}>Show new version</Button></p>}
		{warnings.map((line, n) => <p key={n} className="warnline"><Icon name="warn" /> {line}</p>)}
		{item.openOn && <p className="card-status">Open in a terminal on {item.openOn} · {NAME} waits until you close it</p>}
		{item.before && <Hint text={chipHover('before')}><p className="chip">From before setup</p></Hint>}
		{placement?.chips.some(chip => chip.kind === 'retrying') && <p className="warnline">Retrying{placement.nextText ? `: ${placement.nextText.replace('{at}', placement.next?.at ? when(placement.next.at) : 'soon')}` : ''}</p>}
	</section>

	// A run that gave no result (queue-new #11): the reason and its time, never a question; Try again is the primary, or write it yourself.
	const writeOwn = actions.find(action => action.kind === 'write-own')
	const reopen = actions.find(action => action.kind === 'reopen')
	const failed = item.runFailed && <section className="card-block card-failed">
		<p role="status" className="warnline"><Icon name="warn" /> {item.runFailed.review && item.prLabel ? `Couldn't finish the review of ${item.prLabel.replace(/ · .*$/, '')}` : `${NAME} couldn't draft this`} at {when(item.runFailed.at)}: {item.runFailed.why}.</p>
		{item.runFailed.review && <p><a href={item.runFailed.review} target="_blank" rel="noreferrer">Review it yourself</a> <span className="muted">opens the PR</span></p>}
		{item.runFailed.toolsOff && !readOnly && <ToolsOff />}
		{item.runFailed.tried?.length ? <details className="card-tried"><summary>What it tried ({item.runFailed.tried.length})</summary><ul>{item.runFailed.tried.map((route, n) => <li key={n}>{route}</li>)}</ul></details> : null}
		{writeOwn && !readOnly && (ui.editing ? <><Field code={code} rev={item.rev} field="answer" label={`Your reply to ${first}, ${replyWhere}`} value={ui.answer ?? ''} edit={edit} rows={4} />
			<div className="action-bar"><ActionButton action={writeOwn} label="Send your reply" input={{ text: ui.answer ?? '' }} disabled={!ui.answer?.trim()} disabledReason="Write your reply first." />
				<Button variant="outline" onClick={() => edit({ editing: false })}>Cancel</Button></div></>
			: <Button variant="outline" onClick={() => edit({ editing: true })}>{writeOwn.label}</Button>)}
	</section>

	// What the work found (info facts), named by its PR when it comes from a PR job (queue-new #8, #10 c); warnings stay in block 1.
	const infoFacts = (item.context ?? []).filter(context => context.tone !== 'warn')
	const found = infoFacts.length > 0 && <section className="card-block card-facts"><h3>{item.prLabel ? `Found on ${item.prLabel}` : 'Found'}</h3>
		<ul>{infoFacts.map((fact, n) => <li key={n}><strong>{fact.label}:</strong> {fact.text}</li>)}</ul></section>

	// Block 2: what you'll send. Your step (S2), a decision or question, choices and a meeting, or the reply, editable in place.
	const yourStep = work?.yours && report && <section className="card-block card-step">
		<h3>Your step: {work.yours.what.replace(/[.\s]+$/, '')}</h3>
		<p className="muted">Then {NAME} shares the result with {first}, after your OK.{work.yours.check && <> {work.yours.check.what} done <time dateTime={work.yours.check.at}>{when(work.yours.check.at)}</time> (build {work.yours.check.build}).</>}</p>
		<fieldset className="report-form"><legend>How did it go?</legend>{([['Both work', 'Worked'], ['Issues found', 'Issues found'], ['Blocked', 'Blocked']] as const).map(([result, label]) => <label className="option" key={result}><input type="radio" name={`report-${code}`} checked={ui.resultKind === result} onChange={() => edit({ resultKind: result })} />{label}</label>)}</fieldset>
		<Field code={code} rev={item.rev} field="report" label="What you saw: errors, IDs, links (optional)" value={ui.report ?? ''} edit={edit} rows={2} />
		<p className="muted">Nothing is sent. You see the draft first.</p>
	</section>
	// A decision the owner must make on his work (S9): its own block and box; the answer path carries it. A test step has the S2 form.
	const decision = work?.yours && !report && answerAction ? work.yours.what : undefined
	const question = !item.choices && !report && !decision && item.question
	const answerBox = !report && !decision && (!!answerAction && (!!item.question || !draft && !item.choices || ui.other) || primary?.input === 'text' && primary.kind !== 'send-edit')
	// A PR review (S9): Delegate's review in its own block; the comments and vote go to the PR, the reply goes to the chat.
	const changes = item.changeIds.map(id => entities.changes[id])
	const prOf = (change: Entities['changes'][string]) => Number(/\bPR (\d+)\b/.exec(`${change.target} ${change.summary}`)?.[1] ?? /pullRequestId: (\d+)/.exec(change.detail ?? '')?.[1] ?? 0) || undefined
	const isVote = (change: Entities['changes'][string]) => /\b(vote|approve|reject|waiting for author)\b/i.test(change.action) && !/comment/i.test(change.action)
	const prChanges = changes.filter(change => /azure|ado/i.test(change.system) && (prOf(change) || /comment|vote|approve/i.test(change.action)))
	const prNumber = prChanges.map(prOf).find(Boolean)
	const findings = prChanges.filter(change => !isVote(change))
	const vote = prChanges.find(isVote)
	const included = (change: Entities['changes'][string]) => !(ui.excluded ?? []).includes(change.n)
	const review = prChanges.length > 0 && (item.job || findings.length > 0) && <section className="card-block card-review"><h3>{NAME}'s review{prNumber ? ` of PR ${prNumber}` : ''}</h3>
		<p className="verdict"><span className={`verdict-chip ${vote && /approve/i.test(vote.action) ? 'ready' : 'not-ready'}`}>{vote && /approve/i.test(vote.action) ? 'Ready to approve' : 'Not ready'}</span> <span>{item.job ?? item.why.reason}</span></p>
		{vote?.meaning?.filter(part => !part.warn).map((part, n) => <p key={n} className="muted pr-line">{part.text}</p>)}
		{findings.map(change => <div className="finding" key={change.id}><span className="finding-loc">{change.target}</span><p>{change.summary}</p></div>)}
	</section>
	const voteWord = (change: Entities['changes'][string]) => /reject/i.test(change.action) ? 'reject' : /wait/i.test(change.action) ? 'mark it waiting for author' : 'approve'
	const reviewLabel = draft && prChanges.length > 0 && primary?.kind === 'approve' && changes.every(change => prChanges.includes(change)) ? (() => {
		const comments = findings.filter(included).length, voting = vote && included(vote)
		const parts = ['reply', ...(comments ? [comments === 1 ? 'comment' : `${comments} comments`] : []), ...(voting ? [voteWord(vote!)] : [])]
		return `Send ${parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`}`
	})() : undefined
	const block2 = <>
		{review}
		{item.ownReply && <section className="card-block card-own-reply"><h3>You replied in Teams · <time dateTime={item.ownReply.at}>{when(item.ownReply.at)}</time></h3>
			<MessageBubble text={item.ownReply.text} teams={item.ownReply.teams} open={ui.folds?.own ?? false} onToggle={open => fold('own', open)} />
			{item.ownReply.teams && <p><a className="card-teams" href={item.ownReply.teams} target="_blank" rel="noopener noreferrer">Open in Teams <Icon name="ext" /></a></p>}</section>}
		{decision && <section className="card-block card-decision"><h3>{NAME} needs your decision</h3><p className="decide">{decision}</p>
			{draft?.holding && <p className="muted">The full answer to {first} waits for this. You can send the holding reply below meanwhile.</p>}
			<Field code={code} rev={item.rev} field="answer" label={`Your decision (${NAME} continues from it)`} value={ui.answer ?? ''} edit={edit} rows={2} />
			{draft && <div className="action-bar"><ActionButton action={answerAction!} label="Send decision" input={{ text: ui.answer ?? '' }} disabled={!ui.answer?.trim() || newer} disabledReason={newer ? 'stale' : 'Type your decision first.'} /></div>}
		</section>}
		{item.promise && <section className="card-block"><h3>You said</h3><p>{item.promise.said}</p>{item.promise.failed && <p className="warnline">Could not finish checking: {item.promise.failed}</p>}</section>}
		{yourStep}
		{item.meeting && <section className="card-block meeting-strip" aria-label="Meeting"><h3>{item.meeting.subject}</h3>
			<p><time dateTime={item.meeting.start}>{when(item.meeting.start)}</time> - <time>{time(new Date(Date.parse(item.meeting.start) + item.meeting.minutes * 60_000))}</time> ({item.meeting.minutes} minutes)</p>
			<p>{item.meeting.attendees.join(', ')}</p>
		</section>}
		{(question || answerBox || item.choices) && <section className="card-block card-answer">
			{question && <><h3>{NAME} needs to know{item.prLabel ? ` · ${item.prLabel}` : ''}</h3><p className="question">{question}</p></>}
			{!question && item.question && !draft && <p className="question">{item.question}</p>}
			{item.choices && <fieldset><legend>{item.choices.prompt}</legend>{item.choices.options.map((option, index) => {
				const n = index + 1, selected = (ui.picks ?? item.picked ?? []).includes(n) && !ui.other
				return <label className="option" key={n}><input type={item.choices!.multi ? 'checkbox' : 'radio'} name={`choice-${code}`} checked={selected} disabled={busy || newer}
					onChange={() => {
						const picks = item.choices!.multi ? selected ? (ui.picks ?? item.picked ?? []).filter(pick => pick !== n) : [...(ui.picks ?? item.picked ?? []), n] : [n]
						edit({ picks, other: false })
						const preview = actions.find(action => action.kind === 'pick')
						if (!item.choices!.multi && preview) void act(preview, { picks })
					}} /> <span>{option.label}{option.note && <small>{option.note}</small>}</span></label>
			})}{item.choices.other && <label className="option"><input type="radio" name={`choice-${code}`} checked={!!ui.other} disabled={busy || newer} onChange={() => edit({ other: true })} />Other answer…</label>}</fieldset>}
			{answerBox && <><Field code={code} rev={item.rev} field="answer" label="Your answer" value={ui.answer ?? ''} edit={edit} />
				<p className="muted">{NAME} drafts the reply. Nothing is sent yet.</p></>}
		</section>}
		{draft && <section className="card-block reply-section">
			{editable ? <Field code={code} rev={item.rev} field="editText" rows={Math.min(14, Math.max(3, Math.ceil(replyText.length / 70) + replyText.split('\n').length))}
				label={draft.holding ? `Holding reply to ${first}, ${replyWhere} · says you are on it; not the answer yet` : `Your reply to ${first}, ${replyWhere}`}
				value={replyText} edit={edit} patch={value => ({ editText: value, editing: value !== (draft.sendText ?? draft.text) })} />
				: <><h3>{draft.holding ? `Holding reply to ${first}` : `Your reply to ${first}, ${replyWhere}`}</h3><div className="draft">{draft.sendText ?? draft.text}</div></>}
			{replyText.length > 400 && <p className="muted reply-count">{replyText.length.toLocaleString()} characters · the whole reply is shown above before you send</p>}
			{draft.preview && !ui.editing && <p className="muted"><Icon name="spark" />{' '}{item.picked?.length ? 'The reply for your pick' : 'New draft from your answer'}. Not sent yet.</p>}
		</section>}
	</>

	// Block 3: what else happens when you send. Changes (each can be left out), to-dos you keep, and a watch.
	const handled = item.effectIds?.filter(id => !item.changeIds.includes(id)) ?? []
	const keep = draft && (editable || readOnly) ? item.todos ?? [] : []
	const block3 = (item.changeIds.length > 0 || keep.length > 0 || !!item.follow) && <section className="card-block card-after">
		<h3>{draft ? `When you send, ${NAME} will also` : item.changeIds.some(id => entities.changes[id].state === 'approved') ? 'Approved changes' : `When you approve, ${NAME} will`}</h3>
		{item.changeIds.map((id, index) => {
			const change = entities.changes[id], excluded = ui.excluded?.includes(change.n) ?? false
			const group = prChanges.includes(change) && prNumber && (index === 0 || !prChanges.includes(entities.changes[item.changeIds[index - 1]])) ? <p className="after-group">On {item.prLabel?.startsWith(`PR ${prNumber} `) || item.prLabel === `PR ${prNumber}` ? item.prLabel : `PR ${prNumber}`} (Azure DevOps)</p> : null
			return <div className="change" key={id}>{group}<label><input type="checkbox" checked={!excluded} disabled={readOnly || busy || change.state === 'approved'}
				onChange={() => edit({ excluded: excluded ? ui.excluded!.filter(n => n !== change.n) : [...(ui.excluded ?? []), change.n] })} /> {change.action}</label>
				<p className="muted">{change.target}: {change.summary}</p>
				{change.meaning?.filter(part => !part.warn).map((part, n) => <p key={n} className="muted">{part.text}</p>)}
				{change.state === 'uncertain' && <p className="warnline">This may already have been made. Check before approving any retry.</p>}
				{change.error && <p role="alert" className="error">{change.state === 'uncertain' ? 'Could not confirm' : 'Not made'}: {change.error}</p>}
				{change.detail && <details><summary>Exact change details</summary><pre>{change.detail}</pre></details>}
			</div>
		})}
		{keep.map(todo => <p key={todo}><Icon name="check" /> Keep on your to-do list: {todo}</p>)}
		{item.follow && <p><Icon name="clock" /> Watch {item.follow.target} until {item.follow.until}</p>}
	</section>
	const earlierTodos = todoIds.length > 0 && <section className="card-block"><h3>Still to do from an earlier reply</h3><ul>{todoIds.map(id => <li key={id}>{entities.todos[id].text}</li>)}</ul>
		{!readOnly && [...new Set(todoIds.map(id => `${entities.todos[id].code}/todo-done`))].filter(id => id !== primary?.id && entities.actions[id]).map(id => {
			const action = entities.actions[id]
			return <div key={id}><ActionButton action={action} /><ActionState item={action.item} rev={action.rev} /></div>
		})}</section>

	// An approved batch that partly ran: one plain line above the actions says what was done and what was not, and why (queue-new #7D).
	const allChanges = [...new Set([...item.changeIds, ...(item.effectIds ?? [])])].map(id => entities.changes[id]).filter(Boolean)
	const made = allChanges.filter(change => change.state === 'made'), notDone = allChanges.filter(change => change.state !== 'made' && change.state !== 'left-out' && change.error)
	const doneSoFar = made.length > 0 && notDone.length > 0 && <p className="card-block done-so-far" role="status">
		<strong>Done:</strong> {made.map(change => change.action).join('; ')}. <strong>Not done:</strong> {notDone.map(change => `${change.action}, ${change.error!.replace(/\.$/, '').replace(/^Error: /, '')}`).join('; ')}.</p>

	// Block 4: one primary that says its result, Later, and ⋯ (Edit in Teams, Dismiss, Continue in a terminal).
	const primaryLabel = report && primary?.id === report.id ? `Draft my update to ${first}` : reviewLabel ?? (draft?.holding && primary?.kind === 'approve' && !item.changeIds.length ? 'Send holding reply' : decision && primary?.kind === 'answer' ? 'Send decision' : undefined)
	const block4 = <div className="card-block action-bar card-actions">
		{primary && <ActionButton primary action={primary} label={primaryLabel} input={report && primary.id === report.id ? { result: ui.resultKind, text: ui.report } : input}
			disabled={report && primary.id === report.id ? !ui.resultKind : !!invalid || newer} disabledReason={newer ? 'stale' : report && primary.id === report.id ? 'Pick how it went first.' : primary.kind === 'pick' || item.choices && !ui.other ? 'pick' : 'Type your answer first.'} />}
		{report && primary?.id !== report.id && <ActionButton primary action={report} label={`Draft my update to ${first}`} input={{ result: ui.resultKind, text: ui.report }} disabled={!ui.resultKind} disabledReason="Pick how it went first." />}
		{/* An offered send is never hidden: when another action leads, it sits next to it (#33). */}
		{actions.filter(action => ['approve', 'approve-again'].includes(action.kind) && action.id !== primary?.id).map(action => <ActionButton key={action.id} action={action} label={draft?.holding && action.kind === 'approve' && !item.changeIds.length ? 'Send holding reply' : undefined} input={{ excluded: ui.excluded }} disabled={newer} disabledReason="stale" />)}
		{actions.filter(action => action.kind === 'later').map(action => <ActionButton key={action.id} action={action} />)}
		<details className="card-more-menu"><summary aria-label="More" title="More: Edit in Teams, Dismiss, Continue in a terminal"><Icon name="more" /></summary><div className="card-more-content">
			{item.teams && draft && <Button variant="outline" title="Open Teams with this draft so you can change and send it there. Delegate sees that you replied." onClick={() => void chatEdit.open(ui.editing ? ui.editText ?? draft.text : draft.text, item.teams!)}>Edit in Teams</Button>}
			{actions.filter(action => ['dismiss', 'reply-only'].includes(action.kind)).map(action => <ActionButton key={action.id} action={action} disabled={newer && action.staleness === 'exact'} disabledReason="stale" />)}
			{item.ownReply && reopen && <div className="card-reopen"><Field code={code} rev={item.rev} field="answer" label="Reopen: what should the new reply say?" value={ui.answer ?? ''} edit={edit} rows={2} />
				<ActionButton action={reopen} input={{ text: ui.answer ?? '' }} disabled={!ui.answer?.trim()} disabledReason="Write what the reply should say first." /></div>}
			{continueAction && <ActionButton action={continueAction} />}
			{item.debug && <><pre>{item.debug.join('\n')}</pre><Button variant="outline" onClick={() => void detailsCopy.copy(item.debug!.join('\n'))}>Copy details</Button>{detailsCopy.message && <p role="status">{detailsCopy.message}</p>}</>}
		</div></details>
	</div>
	const others = actions.filter(action => action.id !== primary?.id && action.id !== report?.id && !(report && action.id === declared?.id) && !['approve', 'approve-again', 'send-edit', 'answer', 'pick', 'ask', 'later', 'dismiss', 'continue', 'todo-done', 'reply-only', 'review-again', 'try-again', 'write-own'].includes(action.kind) && !(item.ownReply && action.kind === 'reopen'))

	// Block 5: Details, one collapsed line: why, sources, progress and history, changes already handled, and Ask Delegate.
	const parts = [(item.why.reason || item.why.waited) && 'why', item.sourceIds.length > 0 && `${item.sourceIds.length} source${item.sourceIds.length === 1 ? '' : 's'}`, (work?.planIds.length || timeline?.stepIds.length) && 'history', `ask ${NAME}`].filter(Boolean)
	const block5 = <details className="card-block card-details" open={ui.folds?.details ?? false} onToggle={event => fold('details', event.currentTarget.open)}><summary>Details: {parts.join(' · ')}</summary>
		{(item.why.reason || item.why.confidence || item.why.waited) && <h4>Why</h4>}
		{(item.why.reason || item.why.confidence) && <p>{item.why.reason}{item.why.confidence && ` Confidence: ${item.why.confidence}.`}</p>}
		{item.why.waited && <p className="card-why-waited">{item.why.waited}</p>}
		{item.sourceIds.length > 0 && <><h4>Looked up</h4><Sources ids={ui.folds?.sources ? item.sourceIds : item.sourceIds.slice(0, 5)} entities={entities} />
			{item.sourceIds.length > 5 && <button type="button" className="link-button" onClick={() => fold('sources', !ui.folds?.sources)}>{ui.folds?.sources ? 'Show fewer' : `+ ${item.sourceIds.length - 5} more`}</button>}</>}
		{item.why.gaps.map(gap => <p key={gap}>Could not read: {gap}</p>)}
		{item.why.searched?.map((searched, n) => <p key={n}>Looked up: {searched}</p>)}
		{timeline && (() => {
			const work = timeline
			// Progress (S9): the goal, the open steps (▸ the current one), who does each and where, in words; done steps folded, ✓, never struck out.
			const steps = work.planIds.map(id => entities.planSteps[id]), done = steps.filter(step => step.done), open = steps.filter(step => !step.done)
			const current = open.find(step => step.now) ?? open[0]
			const whoOf = (step: typeof steps[number]) => step.owner.kind === 'you' ? 'You' : step.owner.kind === 'delegate' ? NAME : step.owner.kind === 'others' ? step.owner.text : 'Nobody'
			const line = (step: typeof steps[number], mark: string) => <li key={step.id} aria-current={step === current ? 'step' : undefined}><span className="step-mark" aria-hidden="true">{mark}</span><span className="step-text">{step.what}</span><small>{whoOf(step)}{step.where ? ` · ${step.where}` : ''}{step.build ? ` · build ${step.build}` : ''}</small></li>
			return <>{steps.length > 0 ? <h4>Progress: {done.length} of {steps.length} steps done</h4> : <h4>This work</h4>}<p>Goal: {work.goal}</p>{work.waiting && <p>Waiting on {work.waiting}</p>}
				{work.then && <p>Then {work.then.owner.kind === 'you' ? 'you' : work.then.owner.kind === 'delegate' ? NAME : work.then.owner.kind === 'others' ? work.then.owner.text : 'nobody'}: {work.then.what}{work.then.you ? `. Then you: ${work.then.you}` : ''}</p>}
				{open.length > 0 && <ul className="steps">{open.map(step => line(step, step === current ? '▸' : '○'))}</ul>}
				{done.length > 0 && <><button type="button" className="link-button" aria-expanded={!!ui.folds?.doneSteps} onClick={() => fold('doneSteps', !ui.folds?.doneSteps)}>{ui.folds?.doneSteps ? 'Hide' : 'Show'} the {done.length} done step{done.length === 1 ? '' : 's'}</button>
					{ui.folds?.doneSteps && <ul className="steps steps-done">{done.map(step => line(step, '✓'))}</ul>}</>}</>
		})()}
		{!!timeline?.stepIds.length && (() => {
			// What happened (S9): newest first, the 4 newest until "Show all"; codes and raw references are already gone (projection).
			const all = [...timeline.stepIds].reverse(), shown = ui.folds?.history ? all : all.slice(0, 4)
			return <><h4>What happened, newest first</h4><ol className="history">{shown.map(id => {
				const step = entities.workSteps[id]
				return <li key={id}>{compact(step.at)}<span>{step.news ? <strong>{step.what}</strong> : step.what}</span></li>
			})}</ol>{all.length > 4 && <button type="button" className="link-button" onClick={() => fold('history', !ui.folds?.history)}>{ui.folds?.history ? 'Show fewer' : `Show all ${all.length}`}</button>}</>
		})()}
		{handled.length > 0 && <><h4>Changes already handled</h4><ul>{handled.map(id => {
			const effect = entities.changes[id]
			return <li key={id}>{effect.state === 'made' ? 'Made' : effect.state === 'left-out' ? 'Left out' : effect.state}: {effect.action} - {effect.summary}</li>
		})}</ul></>}
		{item.unsent && <><h4>{NAME}'s draft (not sent)</h4><p className="muted">{item.unsent}</p></>}
		{item.job && <p className="muted">{item.job}</p>}
		<p className="muted">Item {code}</p>
		<section className="ask-thread"><h4>Ask {NAME}</h4>{item.noteIds.map(id => {
			const note = entities.notes[id]
			return <div key={id}><p><strong>You:</strong> {note.question}</p><p>{note.answer === '' ? 'The answer contained only chat instructions. Review the item using its available buttons, or ask a follow-up.' : note.answer ?? 'Waiting for an answer...'}</p><Sources ids={note.sourceIds} entities={entities} />
				{!readOnly && note.useActionId && <ActionButton action={entities.actions[note.useActionId]} disabled={newer} disabledReason="stale" />}
			</div>
		})}
			{!readOnly && <Field code={code} rev={item.rev} field="ask" label={`Ask ${NAME} about this`} value={ui.ask ?? ''} edit={edit} rows={2} />}
			{actions.filter(action => action.kind === 'ask').map(action => <ActionButton key={action.id} action={action} input={{ text: ui.ask }} disabled={!ui.ask?.trim()} disabledReason="Type your question first." />)}
		</section>
	</details>

	return <article className={`item-card${inline ? ' inline-card' : ''}`} aria-labelledby={`card-title-${code}`} tabIndex={-1} ref={article}
		onPointerDownCapture={event => { if (event.target instanceof Element && event.target.closest('[data-primary="true"]')) edit({ interacting: true }) }}
		onKeyDown={event => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing &&
				!(event.target instanceof Element && event.target.closest('[data-field=ask]'))) {
				event.preventDefault()
				article.current?.querySelector<HTMLButtonElement>('[data-primary="true"]')?.click()
			}
		}}>
		{asks ? <AsksList codes={asks.codes} current={code} entities={entities} onOpen={asks.onOpen} /> : placement && placement.subjects.length >= 2 && <AsksList codes={placement.subjects} current={code} entities={entities} />}
		{block1}{failed}{found}<fieldset className="card-readonly" disabled={readOnly}>{block2}{block3}</fieldset>{earlierTodos}{doneSoFar}{!readOnly && block4}
		{chatEdit.message && <p role="status">{chatEdit.message}</p>}
		{others.map(action => <div key={action.id}>{action.meaning && <p>{action.meaning}</p>}<ActionButton action={action} disabled={newer && action.staleness === 'exact' || action.effect !== 'local' && !action.meaning} disabledReason={newer ? 'stale' : undefined} /></div>)}
		{!readOnly && <ActionState item={code} rev={item.rev} />}
		{primary && primary.rev !== item.rev && <ActionState item={primary.item} rev={primary.rev} />}
		{block5}
	</article>
}

// Several asks in one conversation (spec S4): one line per ask; the code is only a tooltip. A line opens that ask's card in place.
export function AsksList({ codes, current, entities, onOpen }: { codes: string[]; current: string; entities: Entities; onOpen?: (code: string) => void }) {
	const { classic, navigate } = useScreenNavigation()
	const items = codes.map(code => entities.items[code]).filter((item): item is Item => !!item)
	if (items.length < 2) return null
	// Asks from more than one chat are "related asks", each with where it was asked (queue-new #9).
	const spread = new Set(items.map(item => item.chatId)).size > 1
	const heading = spread ? `${items.length} related asks` : `${items.length} asks in this conversation`
	return <section className="card-block card-asks" aria-label={heading}><h3>{heading}</h3>
		<ul>{items.map(item => {
			const person = entities.people[item.personId], 			words = messageText(item.ask ?? item.status).replace(/\s+/g, ' ').slice(0, 60), at = sentAt(item)
			const chat = entities.chats[item.chatId], where = chat?.group ? `in ${chat.name}` : '1:1'
			return <li key={item.code}><button type="button" className="ask-line" aria-current={item.code === current || undefined} title={`${person.name}${spread ? ` (${where})` : ''}: ${words} (${item.code})`} onClick={() => onOpen ? onOpen(item.code) : navigate(classic ? `focus/${item.code}` : `now/${item.code}`)}>
				<span className="card-avatar small" style={{ '--hue': person.hue } as CSSProperties} aria-hidden="true">{person.initials}</span><strong>{firstName(person.name)}</strong>{spread && <span className="ask-where">{where}</span>}<span className="ask-words">{words}</span><SentTime at={at.at} added={at.added} /></button></li>
		})}</ul></section>
}
