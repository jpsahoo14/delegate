import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { chipHover } from '../domain/hover.ts'
import { Button, Hint } from '../components/ui/button.tsx'
import { useAction, useCardPresentation, useEdit, useItemBusy, useShowLatest, useSnapshot } from '../data/hooks.ts'
import type { Entities, Intent, Item, Snapshot } from '../domain/contracts.ts'
import { IMAGE_TOKEN } from '../domain/contracts.ts'
import type { CardUi } from '../data/store.ts'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { NAME } from '../brand.ts'
import { useCopyDetails, useEditInChat } from '../data/browser.ts'
import { when, time } from '../domain/time.ts'
import { Icon } from '../components/ui/icon.tsx'
import { Field, Sources } from './CardFields.tsx'
import { SentTime } from './SentTime.tsx'
import { ItemCode } from './ItemCode.tsx'
import { useLiveVoteCheck } from './vote-check.ts'
import './card.css'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { useSetting } from '../data/screens.ts'
import { markTodos, undoMark } from '../data/todo-marks.ts'

// The card (spec S1, design-spec/mockups/card-redesign.html): the same blocks in New's opened row and Classic's Needs-you card.
// 1 their message · 2 what you'll send · 3 what happens when you send · 4 actions · 5 Details.
export const firstName = (name: string) => name.split(/\s+/)[0] || name
// A120 / PM A R36: an untitled group is named by its other members, in the server's words (head: 2 names, row: 1 name).
export const whereOf = (chat: Entities['chats'][string], form: 'head' | 'row' = 'head') => chat.group ? chat.place?.[form] ?? `in ${chat.name}` : '1:1 chat'
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
// A37 (b) / PM A R37: the words a vote-claim line quotes, highlighted where they stand in the draft.
const marked = (text: string, quote?: string) => { const at = quote ? text.indexOf(quote) : -1; return at < 0 ? text : <>{text.slice(0, at)}<mark className="vote-mark">{quote}</mark>{text.slice(at + quote!.length)}</> }
// An image in their message is a chip (L3c): "🖼 Image · Open in Teams ↗", opening that message in Teams when there is a link.
function withImages(text: string, teams?: string) {
	const parts = text.split(IMAGE_TOKEN)
	if (parts.length === 1) return text
	return parts.flatMap((part, n) => n === 0 ? [part] : [teams
		? <a key={n} className="chip card-image" href={teams} target="_blank" rel="noopener noreferrer" title="Open this message in Teams, in a new tab.">{IMAGE_TOKEN} · Open in Teams <Icon name="ext" /></a>
		: <span key={n} className="chip card-image">{IMAGE_TOKEN}</span>, part])
}
export function MessageBubble({ text: raw, teams, open, onToggle }: { text: string; teams?: string; open: boolean; onToggle: (open: boolean) => void }) {
	// L7c: a run of blank lines reads as one before the clamp, so a short message isn't cut to two visible lines.
	const text = messageText(raw).replace(/\n[ \t]*(?:\n[ \t]*)+\n/g, '\n\n')
	if (text.length > HUGE) return <div className="card-bubble-wrap"><blockquote className="card-bubble scroll">{withImages(text.slice(0, HUGE_SHOWN), teams)}…</blockquote>
		<p className="muted">The rest is too long to show here ({text.length.toLocaleString()} characters).{teams && <> <a href={teams} target="_blank" rel="noopener noreferrer">Open in Teams <Icon name="ext" /></a></>}</p></div>
	const long = text.length > 600 || text.split('\n').length > 6
	if (!long) return <blockquote className="card-bubble">{withImages(text, teams)}</blockquote>
	return <div className="card-bubble-wrap"><blockquote className={`card-bubble ${open ? 'scroll' : 'clamp'}`}>{withImages(text, teams)}</blockquote>
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
	// A working card says when it is taking longer than usual (PM 19:50: after 3 minutes), so it reads the clock while it works.
	const [now, setNow] = useState(Date.now), working = !!item?.working
	useEffect(() => { if (!working) return; const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer) }, [working])
	const long = (since?: string) => !!since && now - Date.parse(since) >= 3 * 60_000
	useEffect(() => {
		const target = inline ? article.current?.closest('.now-row') : article.current
		if (!readOnly) { target?.scrollIntoView({ block: 'start' }); article.current?.focus({ preventScroll: true }) }
	}, [code, inline, readOnly])
	// Details opens by itself while an Ask answer is pending, and stays open until the owner closes it.
	useEffect(() => { if (pendingAsk && ui.folds?.details === undefined) edit({ folds: { ...ui.folds, details: true } }) }, [pendingAsk, ui.folds, edit])
	// A37 (b): the vote-claim check again on his edited reply, as he types (PM A R37).
	const live = useLiveVoteCheck(code, !readOnly && ui.editing && ui.editText !== undefined ? ui.editText : undefined, !!item?.voteGap)
	if (!item || !entities) return <p role="status">This item is no longer open. Refresh the list to see where it moved.</p>
	const person = entities.people[item.personId], chat = entities.chats[item.chatId], first = firstName(person.name)
	const placement = placementId ? entities.placements[placementId] : undefined
	const workId = placement?.workId ?? item.workId, work = workId ? entities.work[workId] : undefined
	const timeline = item.workId ? entities.work[item.workId] : work
	const report = !readOnly && work?.reportActionId ? entities.actions[work.reportActionId] : undefined
	// Your step (S2): its form is the card's primary; the row's free-text "Tell Delegate" is gone (redirecting is in Details › Ask).
	const answerAction = actions.find(action => action.kind === 'answer')
	const approveAction = actions.find(action => action.kind === 'approve'), sendEdit = actions.find(action => action.kind === 'send-edit')
	// A question and a draft on one card (designer states 2a/2b): one box is open, and a link switches it, keeping both texts. The
	// projection names which opens first; the primary acts on the open box.
	const both = !readOnly && !!item.question && !!draft && !!answerAction && !!approveAction && (item.mode === 'answer-with-holding' || item.mode === 'reply-with-question')
	const boxMode = both ? ui.mode ?? (item.editor === 'answer' ? 'answer' : 'reply') : undefined
	const replyPrimary = declared && declared.kind !== 'answer' ? declared : ui.editing && sendEdit ? sendEdit : approveAction
	// The projection names the primary from the card state; the card never picks one (#34). A mode switch only chooses which box it acts on.
	const primary = report ?? (boxMode === 'answer' ? answerAction : boxMode === 'reply' ? replyPrimary : declared)
	const fold = (key: string, open: boolean) => { if (ui.folds?.[key] !== open) edit({ folds: { ...ui.folds, [key]: open } }) }
	const redraftingNow = item.mode === 'working' && item.working?.kind === 'redraft'
	const editable = !!draft && actions.some(action => action.kind === 'send-edit')
	// L7b: the configured marker is a fixed, muted suffix under the box ("Teams will show: …"), not text he can delete or move. The box
	// holds the reply without it, and Send your version adds it back once, as the box with the marker used to send.
	const marker = draft?.marker && draft.sendText?.endsWith(draft.marker) ? draft.marker : undefined
	const body = marker ? draft!.sendText!.slice(0, -marker.length).trimEnd() : draft?.sendText ?? draft?.text ?? ''
	const signed = (text: string) => marker && text.trim() && !text.trimEnd().endsWith(marker) ? `${text.trimEnd()}\n\n${marker}` : text
	const replyText = ui.editText ?? body
	const input: Intent['input'] = primary?.kind === 'send-edit' ? { text: signed(replyText), excluded: ui.excluded } :
		primary?.kind === 'pick' ? { picks: ui.picks ?? item.picked ?? [] } :
			primary?.input === 'text' ? { text: ui.answer ?? '' } : { excluded: ui.excluded }
	const invalid = primary?.input === 'text' && primary.kind !== 'send-edit' && !ui.answer?.trim() || primary?.kind === 'pick' && !input.picks?.length ||
		primary?.kind === 'send-edit' && !replyText.trim()
	// L1b: Send stays off until he changes the reply (editing makes Send your version the primary); the line's sentence is its hover.
	// A37 (b): Send your version stays off while his edited text still makes a claim, or while that check is due (PM A R37).
	const editedHeld = ui.editing && (!!live.claim || live.pending)
	const voteLine = ui.editing ? live.claim?.line ?? (live.pending ? item.voteGap?.text : undefined) : item.voteGap?.text
	const voteReason = live.claim?.line ?? (editedHeld ? 'Checking your reply for a vote claim...' : item.voteGap?.text)
	const voteBlocked = !!item.voteGap && primary?.kind === 'approve' || primary?.kind === 'send-edit' && editedHeld
	// Answering on 2a after editing the reply: the send next to Answer sends the edit, never the original draft.
	const editedAside = boxMode === 'answer' && ui.editing && sendEdit ? sendEdit : undefined
	const sent = sentAt(item), replyWhere = chat.group ? `in ${chat.place?.sentence ?? chat.name}` : 'in your 1:1'
	const avatar: CSSProperties & { '--hue': number } = { '--hue': person.hue }
	const continueAction = actions.find(action => action.kind === 'continue')

	// Block 1: their message, with its chat and time, the thread in place, and the one warn line card-state chose (L4): every other
	// reason is in Details › Why it waited. Nothing else here draws a warn line.
	const warnings = [item.attention].filter((line): line is string => !!line && line !== item.voteGap?.text)
	const earlier = item.thread.length
	const block1 = <section className="card-block card-message" aria-label={`${person.name}'s message`}>
		<div className="card-head"><span className="card-avatar" style={avatar} aria-hidden="true">{person.initials}</span>
			<h2 id={`card-title-${code}`} className="card-who">{person.name}</h2><span className="card-where" title={chat.place?.title}>· {whereOf(chat)} ·</span>
			<SentTime at={sent.at} added={sent.added} full /><span className="card-sep" aria-hidden="true">·</span><ItemCode code={code} />
			{chat.guests && <Hint text={chipHover('guests')}><span className="chip">Guests in chat</span></Hint>}
			<span className="card-head-end">{item.teams && <Hint text="Open this message in Teams, in a new tab."><a className="card-teams" href={item.teams} target="_blank" rel="noopener noreferrer">Open in Teams <Icon name="ext" /></a></Hint>}</span>
		</div>
		{item.ask && <MessageBubble text={item.ask} teams={item.teams} open={ui.folds?.ask ?? false} onToggle={open => fold('ask', open)} />}
		{earlier > 0 && <details className="card-thread" open={ui.folds?.thread ?? false} onToggle={event => fold('thread', event.currentTarget.open)}>
			<Hint text="Show the earlier messages of this conversation here. Nothing changes in Teams."><summary>Show {earlier} earlier message{earlier === 1 ? '' : 's'}</summary></Hint>
			<ol className="thread-list">{item.thread.map((message, n) => <li key={n}><strong>{message.who}</strong> <time dateTime={message.at}>{when(message.at)}</time>			<p>{clip(messageText(message.text))}</p></li>)}</ol>
		</details>}
		{/* L7d: every warn line shares one box, one line each (L4 leaves at most one from the card's state). */}
		{(newer || warnings.length > 0 || placement?.chips.some(chip => chip.kind === 'retrying')) && <div className="warnbox">
			{newer && <p role="status" className="warnline"><Icon name="warn" /> Changed since you looked. Your current text is kept. <Button variant="outline" onClick={showLatest} disabled={busy}>Show new version</Button></p>}
			{warnings.map((line, n) => <p key={n} className="warnline"><Icon name="warn" /> {line}</p>)}
			{placement?.chips.some(chip => chip.kind === 'retrying') && <p className="warnline">Retrying{placement.nextText ? `: ${placement.nextText.replace('{at}', placement.next?.at ? when(placement.next.at) : 'soon')}` : ''}</p>}
		</div>}
		{item.openOn && item.mode !== 'in-terminal' && <p className="card-status">Open in a terminal on {item.openOn} · {NAME} waits until you close it</p>}
		{/* Step 6 (HOST's returnedFrom): back from his window, until his next action or a new draft. */}
		{item.returned && <p className="card-status">Back from your window on {item.returned.machine} · {when(item.returned.at)}{item.returned.report ? '' : ' · nothing decided there'}</p>}
		{item.before && <Hint text={chipHover('before')}><p className="chip">From before setup</p></Hint>}
	</section>

	// A run that gave no result (queue-new #11): the reason and its time, never a question; Try again is the primary, or write it yourself.
	const writeOwn = actions.find(action => action.kind === 'write-own')
	const writeBox = writeOwn && !readOnly && ui.editing && <><Field code={code} rev={item.rev} field="answer" label={`Your reply to ${first}, ${replyWhere}`} value={ui.answer ?? ''} edit={edit} rows={4} placeholder={`Write your reply to ${first}`} />
		<div className="action-bar"><ActionButton action={writeOwn} label="Send your reply" input={{ text: ui.answer ?? '' }} disabled={!ui.answer?.trim()} disabledReason="Write your reply first." />
			<Button variant="outline" onClick={() => edit({ editing: false })}>Cancel</Button></div></>
	const reopen = actions.find(action => action.kind === 'reopen')
	const failed = item.runFailed && <section className="card-block card-failed">
		{/* PE A R31: the failure words from structured fields (the PM fallback otherwise); the free-text why and what it tried are in Details. */}
		<p role="status" className="warnline"><Icon name="warn" /> {item.runFailed.line ?? "Couldn't finish this. What it tried is in Details."} <span className="muted">· {when(item.runFailed.at)}</span></p>
		{item.runFailed.review && <p><a href={item.runFailed.review} target="_blank" rel="noreferrer">Review it yourself</a> <span className="muted">opens the PR</span></p>}
		{item.runFailed.toolsOff && !readOnly && <ToolsOff />}
		<details className="card-tried"><summary>Details</summary><p>{item.runFailed.why.replace(/[.\s]+$/, '')}.</p>
			{item.runFailed.tried?.length ? <><p className="muted">What it tried ({item.runFailed.tried.length}):</p><ul>{item.runFailed.tried.map((route, n) => <li key={n}>{route}</li>)}</ul></> : null}</details>
		{writeBox}
	</section>

	// #48b state 4 (PM A R21): while Delegate redrafts from his answer, the answer is his own right-aligned bubble, and the draft it
	// replaces is folded under it, read-only. No editable box until 3 minutes (then Write the reply yourself).
	const answered = redraftingNow && item.working?.answer && <section className="card-block card-answered" aria-label="Your answer">
		<div className="my-bubble"><p className="muted">You answered {NAME}{item.working.answer.at && <> · {when(item.working.answer.at)}</>}</p><p>{item.working.answer.text}</p></div>
		{item.working.previous && <details className="previous-draft" open={ui.folds?.previous ?? false} onToggle={event => fold('previous', event.currentTarget.open)}>
			<summary>Previous draft (will be replaced)</summary><p className="review-reply">{item.working.previous}</p></details>}
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
	const question = !item.choices && !report && !decision && boxMode !== 'reply' && item.question
	const answerBox = !report && !decision && (boxMode ? boxMode === 'answer' : !!answerAction && item.editor !== 'reply' && item.mode !== 'failed' && (!!item.question || !draft && !item.choices || ui.other)
		|| primary?.input === 'text' && primary.kind !== 'send-edit' && primary.kind !== 'write-own')
	// Opens a box and moves the focus into it, as the switch link and Write the reply yourself do.
	const focusField = (field: string) => setTimeout(() => document.getElementById(`${code}-${item.rev}-${field}`)?.focus(), 0)
	// A PR review (S9): Delegate's review in its own block; the comments and vote go to the PR, the reply goes to the chat.
	const changes = item.changeIds.map(id => entities.changes[id])
	const prOf = (change: Entities['changes'][string]) => Number(/\bPR (\d+)\b/.exec(`${change.target} ${change.summary}`)?.[1] ?? /pullRequestId: (\d+)/.exec(change.detail ?? '')?.[1] ?? 0) || undefined
	const isVote = (change: Entities['changes'][string]) => /\b(vote|approve|reject|waiting for author)\b/i.test(change.action) && !/comment/i.test(change.action)
	const prChanges = changes.filter(change => /azure|ado/i.test(change.system) && (prOf(change) || /comment|vote|approve/i.test(change.action)))
	const prNumber = prChanges.map(prOf).find(Boolean)
	const findings = prChanges.filter(change => !isVote(change))
	const vote = prChanges.find(isVote)
	const included = (change: Entities['changes'][string]) => !(ui.excluded ?? []).includes(change.n)
	// #28 B1 (PE 01:10): what Send does on the PR is read from the changes it will make: included (ticked), pending and not refused.
	const posting = prChanges.filter(change => included(change) && !change.error && change.state !== 'made' && change.state !== 'left-out')
	// findingFor move (PE 01:22): the projection matched each finding to its pending comment change as SEND does (posts, changeId); the
	// card adds only whether that change is still ticked and postable.
	const postsComment = (finding: NonNullable<Item['prReview']>['findings'][number]) => !!finding.posts && posting.some(change => change.id === finding.changeId)
	const review = item.mode !== 'review-done' && !item.reviewDone?.closed && (prChanges.length > 0 && (item.job || findings.length > 0) || !!item.prReview?.findings.length) && <section className="card-block card-review"><h3>{NAME}'s review{prNumber ?? item.prReview?.pr ? ` of PR ${prNumber ?? item.prReview?.pr}` : ''}</h3>
		<p className="verdict"><span className={`verdict-chip ${vote && /approve/i.test(vote.action) ? 'ready' : 'not-ready'}`}>{vote && /approve/i.test(vote.action) ? 'Ready to approve' : 'Not ready'}</span> <span>{item.job ?? item.why.reason}</span></p>
		{vote?.meaning?.filter(part => !part.warn).map((part, n) => <p key={n} className="muted pr-line">{part.text}</p>)}
		{/* #28 (owner A61): each finding says whether it is already an open thread on the PR, or Send posts it as a new comment; any other
		    finding gets no Send tag (its "Left for you" line covers it). */}
		{item.prReview?.findings.length ? item.prReview.findings.map((finding, n) => <div className="finding" key={n}>{finding.file && <span className="finding-loc">{finding.file}{finding.line ? `:${finding.line}` : ''}</span>}<p>{finding.text}</p>
			{finding.thread ? <p className="muted finding-where">already on the PR · {finding.thread.author}{finding.thread.url && <> · <a href={finding.thread.url} target="_blank" rel="noopener noreferrer">Thread <Icon name="ext" /></a></>}</p>
				: postsComment(finding) && <p className="muted finding-where">new comment</p>}</div>)
			: findings.map(change => <div className="finding" key={change.id}><span className="finding-loc">{change.target}</span><p>{change.summary}</p></div>)}
	</section>
	const voteWord = (change: Entities['changes'][string]) => /reject/i.test(change.action) ? 'reject' : /wait/i.test(change.action) ? 'mark it waiting for author' : 'approve'
	const reviewLabel = draft && prChanges.length > 0 && primary?.kind === 'approve' && changes.every(change => prChanges.includes(change)) ? (() => {
		const comments = findings.filter(included).length, voting = vote && included(vote)
		const parts = ['reply', ...(comments ? [comments === 1 ? 'comment' : `${comments} comments`] : []), ...(voting ? [voteWord(vote!)] : [])]
		return `Send ${parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`}`
	})() : undefined
	// The choices (and the L2b group picker): one fieldset, drawn as the card's answer, or, beside a draft, in "Delegate also asks".
	const groupAside = !!item.choices?.group && !!draft
	const pickAction = actions.find(action => action.kind === 'pick')
	const choiceSet = item.choices && <fieldset><legend>{item.choices.prompt}</legend>{item.choices.options.map((option, index) => {
		const n = index + 1, selected = (ui.picks ?? item.picked ?? []).includes(n) && !ui.other
		return <label className="option" key={n}><input type={item.choices!.multi ? 'checkbox' : 'radio'} name={`choice-${code}`} checked={selected} disabled={busy || newer}
			onChange={() => {
				const current = ui.picks ?? item.picked ?? [], last = item.choices!.options.length
				// L2b: in the group picker "None of these" (the last) clears the others, and any group clears it.
				const picks = item.choices!.group ? n === last ? selected ? [] : [last] : selected ? current.filter(pick => pick !== n) : [...current.filter(pick => pick !== last), n]
					: item.choices!.multi ? selected ? current.filter(pick => pick !== n) : [...current, n] : [n]
				edit({ picks, other: false })
				if (!item.choices!.multi && pickAction) void act(pickAction, { picks })
			}} /> <span>{option.label}{option.note && <small>{option.note}</small>}</span></label>
	})}{item.choices.other && <label className="option"><input type="radio" name={`choice-${code}`} checked={!!ui.other} disabled={busy || newer} onChange={() => edit({ other: true })} />Other answer…</label>}</fieldset>
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
		{(question || answerBox || item.choices && !groupAside) && <section className="card-block card-answer">
			{question && <><h3>{NAME} needs to know{item.prLabel ? ` · ${item.prLabel}` : ''}</h3><p className="question">{question}</p></>}
			{!question && item.question && !draft && <p className="question">{item.question}</p>}
			{!groupAside && choiceSet}
			{item.choices?.group && !groupAside && <p className="muted">{NAME} remembers your answer.</p>}
			{/* PM A R38 (1): the engine's suggested answer (its chat hint) as a choice chip; it fills the answer, and nothing goes until he answers. */}
			{answerBox && !!item.answerChips?.length && <div className="answer-chips" role="group" aria-label="Suggested answers">{item.answerChips.map(chip => <button type="button" key={chip.text} className="chip answer-chip" aria-pressed={ui.answer === chip.text}
				onClick={() => { edit({ answer: chip.text }); focusField('answer') }}>{chip.label}</button>)}</div>}
			{answerBox && <><Field code={code} rev={item.rev} field="answer" label="Your answer" placeholder={`only ${NAME} sees it`} value={ui.answer ?? ''} edit={edit} />
				<p className="muted">{NAME} {draft ? 'writes a new draft from your answer' : 'drafts the reply from your answer'}. Nothing is sent.</p></>}
		</section>}
		{draft && boxMode === 'answer' && <section className="card-block reply-section">
			{/* The owner's edit stays what this fold shows and what the bar sends, while he answers (PE step-4 review, 2). */}
			<details className="card-draft-fold"><summary>{ui.editing ? 'Your edited reply · not sent' : `${NAME}'s draft so far · not sent`}</summary><div className="draft">{ui.editing ? replyText : draft.sendText ?? draft.text}</div></details>
			<button type="button" className="link-button" aria-controls={`${code}-${item.rev}-editText`} onClick={() => { edit({ mode: 'reply' }); focusField('editText') }}>Edit and send the draft instead</button>
		</section>}
		{draft && boxMode !== 'answer' && <section className="card-block reply-section">
			{editable ? <Field code={code} rev={item.rev} field="editText" rows={Math.min(14, Math.max(3, Math.ceil(replyText.length / 70) + replyText.split('\n').length))}
				label={draft.holding ? `Holding reply to ${first}, ${replyWhere} · says you are on it; not the answer yet` : `Your reply to ${first}, ${replyWhere}`}
				value={replyText} edit={edit} patch={value => ({ editText: value, editing: value !== body })} mark={ui.editing ? live.claim?.quote : item.voteGap?.quote} />
				: <><h3>{draft.holding ? `Holding reply to ${first}` : `Your reply to ${first}, ${replyWhere}`}</h3><div className="draft">{marked(draft.sendText ?? draft.text, item.voteGap?.quote)}</div></>}
			{editable && marker && <p className="muted card-marker">Teams will show: {marker}</p>}
			{/* L1b (joint C2): the vote-claim line is about his text, so it sits right under the editor, not in block 1. */}
			{/* A37 (b): live while he edits; once no claim is left the line says so, muted, and Send enables (PM A R37). */}
			<div aria-live="polite">{voteLine ? <p className="warnline card-vote-claim" role="note"><Icon name="warn" /> {voteLine}</p>
				: ui.editing && live.cleared && <p className="muted card-vote-claim card-vote-cleared">✓ The reply no longer mentions a vote.</p>}</div>
			{replyText.length > 400 && <p className="muted reply-count">{replyText.length.toLocaleString()} characters · the whole reply is shown above before you send</p>}
			{draft.preview && !ui.editing && <p className="muted"><Icon name="spark" />{' '}{item.picked?.length ? 'The reply for your pick' : 'New draft from your answer'}. Not sent yet.</p>}
			{boxMode === 'reply' && <p className="also-asks">💬 <strong>{NAME} also asks:</strong> {item.question}{' '}
				<button type="button" className="link-button" aria-controls={`${code}-${item.rev}-answer`} onClick={() => { edit({ mode: 'answer' }); focusField('answer') }}>Answer instead</button></p>}
			{/* L2b B1 (PE 00:30): beside a draft, the group picker is "Delegate also asks" with its own Save; Send still leads. */}
			{groupAside && <div className="also-asks also-asks-choices"><p>💬 <strong>{NAME} also asks:</strong></p>{choiceSet}
				{pickAction && <ActionButton action={pickAction} input={{ picks: ui.picks ?? [] }} disabled={!ui.picks?.length || newer} disabledReason={newer ? 'stale' : 'pick'} />}
				<p className="muted">{NAME} remembers your answer.</p></div>}
		</section>}
		{both && ui.mode && <p className="sr-only" role="status">{boxMode === 'answer' ? `Answering ${NAME}. The draft is kept.` : 'Editing the draft. Your answer is kept.'}</p>}
	</>

	// Block 3: what else happens when you send. Changes (each can be left out), to-dos you keep, and a watch.
	// R10b (PM §2, joint C2): a review posted under his rule that waits for his approval has its own block in its place: one status line
	// (not a warn), what was posted, the comments still waiting with Post them, and the reply that was sent.
	// Closed (HOST's close, 02:02): in Done, its status ("You approved PR <n>", "PR <n> closed") is the line, with the list kept, read-only.
	const reviewed = item.mode === 'review-done' || item.reviewDone?.closed ? item.reviewDone : undefined
	const approvePr = actions.find(action => action.kind === 'approve-pr'), postWaiting = actions.find(action => action.kind === 'post-waiting')
	// R10b B1 (PE 02:06): votes of any value are never waiting comments (card-facts' `waiting` counts non-votes only).
	const waitingComments = reviewed && !reviewed.closed ? changes.filter(change => !reviewed.voteChangeIds?.includes(change.id) && change.state !== 'made' && change.state !== 'left-out') : []
	const postedN = reviewed ? reviewed.counts.high + reviewed.counts.medium + reviewed.counts.low : 0
	const reviewBlock = reviewed && <section className="card-block card-review-done" aria-label={`Review of PR ${reviewed.pr}`}>
		<p className="card-status">{reviewed.closed ? item.status : <>{NAME} reviewed the newest changes ({when(reviewed.reviewedAt)}), {postedN ? `posted ${postedN} comment${postedN === 1 ? '' : 's'}` : 'found nothing to comment on'}{reviewed.reply ? ` and replied to ${reviewed.to}` : ''}.</>}</p>
		<ReviewPosted review={reviewed} />
		{waitingComments.length > 0 && <div className="review-waiting"><p>Waiting for your OK: {waitingComments.length} more comment{waitingComments.length === 1 ? '' : 's'}.</p>
			<ul>{waitingComments.map(change => <li key={change.id}>{change.action}</li>)}</ul>
			{postWaiting && !readOnly && <ActionButton action={postWaiting} input={{ excluded: [] }} disabled={newer} disabledReason="stale" />}</div>}
		{reviewed.reply && <><h3>Sent to {reviewed.to}</h3><p className="review-reply">{reviewed.reply.text}</p>
			{reviewed.reply.teams && <a className="card-teams" href={reviewed.reply.teams} target="_blank" rel="noopener noreferrer">Open in Teams <Icon name="ext" /></a>}</>}
		{reviewed.fallback && <p className="muted">{reviewed.fallback}</p>}
	</section>
	const openPr = (variant: 'default' | 'outline') => reviewed?.prUrl && <Button asChild variant={variant} data-primary={variant === 'default' || undefined}>
		<a href={reviewed.prUrl} target="_blank" rel="noopener noreferrer" title="Opens the PR in Azure DevOps, where you approve it yourself.">Open PR to approve <Icon name="ext" /></a></Button>
	const handled = item.effectIds?.filter(id => !item.changeIds.includes(id)) ?? []
	const keep = draft && (editable || readOnly) ? item.todos ?? [] : []
	// #28 / L1b: a PR reply with no vote proposed says so, so a reply that reads like an approval can't look like one.
	const replyPr = prNumber ?? (Number(/^PR (\d+)/.exec(item.prLabel ?? '')?.[1]) || undefined)
	const noVote = !!draft && editable && !!replyPr && !vote
	// #28: a review whose Send posts nothing on the PR (no included, pending change left after refusals and unticks) says so in one
	// plain line; when every finding is already an open thread it also says by whom and since when.
	const openThreads = item.prReview?.findings.filter(finding => finding.thread) ?? []
	const allOpen = openThreads.length > 0 && openThreads.length === (item.prReview?.findings.length ?? 0)
	const nothingPosted = !!draft && editable && !!item.prReview && posting.length === 0 ? (() => {
		const authors = [...new Set(openThreads.map(finding => finding.thread!.author))].join(', ')
		const since = openThreads.map(finding => finding.thread!.at).sort()[0]
		const day = since && Number.isFinite(Date.parse(since)) ? new Date(since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
		const what = allOpen ? `: ${openThreads.length === 1 ? 'this finding is already an open thread' : `these ${openThreads.length} findings are already open threads`} (${[authors, day].filter(Boolean).join(', ')})` : ''
		return `Nothing is posted on PR ${item.prReview!.pr}${what}. Send posts only your reply in ${chat.group ? chat.place?.sentence ?? chat.name : 'your 1:1'}.`
	})() : undefined
	const block3 = !reviewed && (item.changeIds.length > 0 || keep.length > 0 || !!item.follow || noVote || !!nothingPosted) && <section className="card-block card-after">
		<h3>{draft ? `When you send, ${NAME} will also` : item.changeIds.some(id => entities.changes[id].state === 'approved') ? 'Approved changes' : `When you approve, ${NAME} will`}</h3>
		{/* #50: the comments' format was repaired; the primary posts them on this revision. */}
		{item.repaired && <p className="card-status">The comment format was wrong and is fixed. Post them now?</p>}
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
		{nothingPosted && <p className="nothing-posted">{nothingPosted}</p>}
		{noVote && <p className="no-vote">On PR {replyPr} when you send: No vote{item.prReview && !item.prReview.voteRecommended ? ' (not ready)' : ''}</p>}
	</section>
	// "Left for you" (#44(2), PM 18:40; designer step 7 §4): the to-dos only he can do. One tick per line, "Tick all" at 2+, and one
	// "I've done these (N)" that marks exactly the ticked lines after a 6 s Undo; it never closes the work and sends nothing.
	const todoAction = !readOnly && todoIds.length ? entities.actions[`${code}/todo-done`] : undefined
	const ticked = ui.ticked ?? [], marking = ui.marking
	const doneButton = (lead: boolean) => todoAction && <Hint text={ticked.length ? "Records them here as done. Delegate doesn't do them and nothing is sent." : "Tick what you've done first"}>
		<Button variant={lead ? 'default' : 'outline'} data-primary={lead || undefined} data-action-kind="todo-done" disabled={!ticked.length || newer || busy}
			onClick={() => { const picks = [...ticked].sort((a, b) => a - b); markTodos(todoAction, item.rev, picks, picks.map(n => entities.todos[todoIds[n - 1]]?.text ?? ''), act) }}>
			I've done these{ticked.length ? ` (${ticked.length})` : ''}</Button></Hint>
	const shownTodos = todoIds.map((id, n) => ({ id, n: n + 1 })).filter(todo => !marking?.picks.includes(todo.n))
	// #50 + refused[] (PE 01:00): before Send or approve, what Delegate won't make or couldn't prepare is his too, a line with its reason
	// (no tick: nothing is recorded until it goes; after it, these are the kept to-dos above). A repaired item may have no draft.
	const pendingChange = item.changeIds.some(id => ['proposed', 'approved'].includes(entities.changes[id]?.state))
	const leftLines = draft || item.repaired || pendingChange ? item.leftLines ?? [] : []
	const earlierTodos = (todoIds.length > 0 || marking || leftLines.length > 0) && <section className="card-block card-left-for-you" aria-label="Left for you"><h3>Left for you</h3>
		{(todoIds.length > 0 || marking) && <p className="muted">Only you can do these. Ticking one off records it here; Delegate doesn't do it and nothing is sent.</p>}
		{!readOnly && shownTodos.length >= 2 && <button type="button" className="link-button" onClick={() => edit({ ticked: ticked.length === shownTodos.length ? [] : shownTodos.map(todo => todo.n) })}>Tick all</button>}
		<ul className="todo-ticks">{shownTodos.map(({ id, n }) => <li key={id}>{readOnly ? entities.todos[id].text : <label><input type="checkbox" checked={ticked.includes(n)} disabled={newer || busy}
			onChange={event => edit({ ticked: event.currentTarget.checked ? [...ticked, n] : ticked.filter(x => x !== n) })} /> {entities.todos[id].text}</label>}<TodoSource todo={entities.todos[id]} /></li>)}
			{marking?.texts.map((text, n) => <li key={`done-${n}`} className="todo-done-line" role="status"><Icon name="check" /> Done: {text} · <button type="button" className="link-button" onClick={() => undoMark(code, item.rev)}>Undo</button></li>)}
			{leftLines.map((line, n) => <li key={`left-${n}`} className="todo-refused">{line.text}<details className="todo-source todo-why"><summary>{NAME} couldn&apos;t do this · Why?</summary><p>{line.why}.</p></details></li>)}</ul>
		{primary?.kind !== 'todo-done' && shownTodos.length > 0 && <div className="action-bar">{doneButton(false)}</div>}
		{todoAction && <ActionState item={todoAction.item} rev={todoAction.rev} />}</section>

	// An approved batch that partly ran: one plain line above the actions says what was done and what was not, and why (queue-new #7D).
	const allChanges = [...new Set([...item.changeIds, ...(item.effectIds ?? [])])].map(id => entities.changes[id]).filter(Boolean)
	const made = allChanges.filter(change => change.state === 'made'), notDone = allChanges.filter(change => change.state !== 'made' && change.state !== 'left-out' && change.error)
	const doneSoFar = made.length > 0 && notDone.length > 0 && <p className="card-block done-so-far" role="status">
		<strong>Done:</strong> {made.map(change => change.action).join('; ')}. <strong>Not done:</strong> {notDone.map(change => `${change.action}, ${change.error!.replace(/\.$/, '').replace(/^Error: /, '')}`).join('; ')}.</p>

	// Block 4: one primary that says its result, Later, and ⋯ (Edit in Teams, Dismiss, Continue in a terminal).
	const primaryLabel = report && primary?.id === report.id ? `Draft my update to ${first}` : reviewLabel ?? (draft?.holding && primary?.kind === 'approve' && !item.changeIds.length ? 'Send holding reply' : decision && primary?.kind === 'answer' ? 'Send decision'
		: primary?.kind === 'answer' && answerBox ? draft ? 'Answer and redraft' : 'Answer and draft reply' : undefined)
	// Write the reply yourself opens an empty box first; the box's own button sends it (designer failure pattern, check 4).
	// #48b (PM A R21): during a redraft it appears at 3 minutes (a retry after a failure shows it throughout); it opens the editor with the
	// previous draft, cancels nothing until he sends, and his send wins over the redraft.
	const redrafting = item.working?.kind === 'redraft'
	const writeButton = writeOwn && !ui.editing && !readOnly && !(redrafting && !long(item.working?.since)) && <Button variant={primary?.id === writeOwn.id ? 'default' : 'outline'} data-primary={primary?.id === writeOwn.id || undefined} disabled={newer}
		onClick={() => { edit({ editing: true, answer: item.working?.previous ?? '' }); focusField('answer') }}>{writeOwn.label}</Button>
	const block4 = <div className="card-block action-bar card-actions">
		{/* Delegate is working on it (#48): one status strip in the bar's place; it is never a blank card. */}
		{item.working && <div className="card-working" role="status"><Icon name="clock" />{redrafting ? <span>{long(item.working.since)
			? <><strong>Still redrafting</strong> · taking longer than usual</> : <strong>{NAME} is redrafting from your answer</strong>}{item.working.since && <> · started {when(item.working.since)}</>}</span> : long(item.working.since)
			? <span><strong>Still working</strong> · taking longer than usual{item.working.since && <> · started {when(item.working.since)}</>}<small className="card-working-what">{item.working.doing}</small></span>
			: <span><strong>{NAME} is working on it</strong> · back to you when there's something to send
				<small className="card-working-what">{[item.working.doing, item.working.since && `started ${when(item.working.since)}`].filter(Boolean).join(' · ')}</small></span>}</div>}
		{primary && primary.kind !== 'write-own' && primary.kind !== 'todo-done' && <ActionButton primary action={primary} label={primaryLabel} input={report && primary.id === report.id ? { result: ui.resultKind, text: ui.report } : input}
			disabled={report && primary.id === report.id ? !ui.resultKind : !!invalid || newer || voteBlocked} disabledReason={newer ? 'stale' : voteBlocked ? voteReason : report && primary.id === report.id ? 'Pick how it went first.' : primary.kind === 'pick' || item.choices && !ui.other ? 'pick' : 'Type your answer first.'} />}
		{primary?.kind === 'write-own' && writeButton}
		{reviewed?.openPr === 'primary' && openPr('default')}
		{approvePr && approvePr.id !== primary?.id && <ActionButton action={approvePr} disabled={newer} disabledReason="stale" />}
		{reviewed?.openPr === 'secondary' && openPr('outline')}
		{primary?.kind === 'todo-done' && doneButton(true)}
		{report && primary?.id !== report.id && <ActionButton primary action={report} label={`Draft my update to ${first}`} input={{ result: ui.resultKind, text: ui.report }} disabled={!ui.resultKind} disabledReason="Pick how it went first." />}
		{/* An offered send is never hidden: when another action leads, it sits next to it (#33). */}
		{actions.filter(action => ['approve', 'approve-again'].includes(action.kind) && action.id !== primary?.id).map(action => action.kind === 'approve' && editedAside ? <ActionButton key={editedAside.id} action={editedAside} label="Send your edited reply" input={{ text: signed(replyText), excluded: ui.excluded }} disabled={newer || !replyText.trim() || editedHeld} disabledReason={newer ? 'stale' : editedHeld ? voteReason : 'Type your reply first.'} /> : <ActionButton key={action.id} action={action} label={draft?.holding && action.kind === 'approve' && !item.changeIds.length ? 'Send holding reply' : undefined} input={{ excluded: ui.excluded }} disabled={newer || action.kind === 'approve' && !!item.voteGap} disabledReason={newer ? 'stale' : item.voteGap?.text ?? 'stale'} />)}
		{actions.filter(action => ['try-again', 'review-again', 'send-anyway', 'redraft', 'add-vote', 'keep-waiting'].includes(action.kind) && action.id !== primary?.id && !((item.voteGap || ui.editing) && action.kind === 'send-anyway') && !(reviewed && action.kind === 'review-again')).map(action => <ActionButton key={action.id} action={action} disabled={newer && action.staleness === 'exact'} disabledReason="stale" />)}
		{primary?.kind !== 'write-own' && writeButton}
		{item.mode === 'held' && actions.filter(action => action.kind === 'dismiss' && action.label === 'Skip').map(action => <ActionButton key={action.id} action={action} disabled={newer && action.staleness === 'exact'} disabledReason="stale" />)}
		{actions.filter(action => action.kind === 'later').map(action => <ActionButton key={action.id} action={action} />)}
		<details className="card-more-menu"><summary aria-label="More" title="More: Edit in Teams, Dismiss, Continue in a terminal"><Icon name="more" /></summary><div className="card-more-content">
			{item.teams && draft && <Button variant="outline" title="Open Teams with this draft so you can change and send it there. Delegate sees that you replied." onClick={() => void chatEdit.open(ui.editing ? ui.editText ?? draft.text : draft.text, item.teams!)}>Edit in Teams</Button>}
			{actions.filter(action => ['dismiss', 'reply-only'].includes(action.kind) && !(item.mode === 'held' && action.kind === 'dismiss' && action.label === 'Skip')).map(action => <ActionButton key={action.id} action={action} disabled={newer && action.staleness === 'exact'} disabledReason="stale" />)}
			{/* R10b: ⋯ Review again, unless new changes made it the primary. */}
			{reviewed && actions.filter(action => action.kind === 'review-again' && action.id !== primary?.id).map(action => <ActionButton key={action.id} action={action} />)}
			{/* L1b: past a vote claim, Send anyway is in ⋯ and asks again with the same sentence. */}
			{/* V1 (PE 01:56): never while the editor differs from the draft; it would send the words he just removed. */}
			{item.voteGap && !ui.editing && actions.filter(action => action.kind === 'send-anyway' && action.id !== primary?.id).map(action => <ActionButton key={action.id} action={action} disabled={newer} disabledReason="stale" />)}
			{item.ownReply && reopen && <div className="card-reopen"><Field code={code} rev={item.rev} field="answer" label="Reopen: what should the new reply say?" value={ui.answer ?? ''} edit={edit} rows={2} />
				<ActionButton action={reopen} input={{ text: ui.answer ?? '' }} disabled={!ui.answer?.trim()} disabledReason="Write what the reply should say first." /></div>}
			{continueAction && <ActionButton action={continueAction} />}
			{item.debug && <><pre>{item.debug.join('\n')}</pre><Button variant="outline" onClick={() => void detailsCopy.copy(item.debug!.join('\n'))}>Copy details</Button>{detailsCopy.message && <p role="status">{detailsCopy.message}</p>}</>}
		</div></details>
	</div>
	const others = actions.filter(action => action.id !== primary?.id && action.id !== report?.id && !(report && action.id === declared?.id) && !['approve', 'approve-again', 'send-edit', 'answer', 'pick', 'ask', 'later', 'dismiss', 'continue', 'todo-done', 'reply-only', 'review-again', 'try-again', 'write-own', 'send-anyway', 'redraft', 'add-vote', 'approve-pr', 'post-waiting', 'keep-waiting'].includes(action.kind) && !(item.ownReply && action.kind === 'reopen'))
	// Every action the projection offers is drawn somewhere (engineer-card-state-devspec.md §4, invariant 4); one that isn't is marked.
	const drawn = (kind: string) => ({ answer: !!answerBox || !!decision || both || primary?.kind === 'answer', pick: !!item.choices, 'send-edit': !!draft && editable, 'todo-done': todoIds.length > 0 } as Record<string, boolean>)[kind] ?? true
	const undrawn = readOnly ? [] : actions.filter(action => !drawn(action.kind)).map(action => action.kind)

	// Block 5: Details, one collapsed line: why, sources, progress and history, changes already handled, and Ask Delegate.
	const parts = [(item.why.reason || item.why.waited) && 'why', item.sourceIds.length > 0 && `${item.sourceIds.length} source${item.sourceIds.length === 1 ? '' : 's'}`, (work?.planIds.length || timeline?.stepIds.length || item.earlier) && 'history', `ask ${NAME}`].filter(Boolean)
	const sub = (key: string, title: string, inner: ReactNode) => <details className="card-subfold" open={ui.folds?.[key] ?? false} onToggle={event => fold(key, event.currentTarget.open)}><summary>{title}</summary>{inner}</details>
	const block5 = <details className="card-block card-details" open={ui.folds?.details ?? false} onToggle={event => fold('details', event.currentTarget.open)}><summary>Details: {parts.join(' · ')}</summary>
		{(item.why.reason || item.why.confidence === 'low' || item.why.waited) && <h4>Why</h4>}
		{item.why.reason && <p>{item.why.reason}</p>}
		{/* L6: never the word "Confidence"; only a low one is worth a line. */}
		{item.why.confidence === 'low' && <p>{NAME} isn&apos;t sure this reply is right.</p>}
		{item.why.waited && <p className="card-why-waited">{item.why.waited}</p>}
		{/* L7a: Why stays open; Looked up, Progress and What happened are sub-folds with counts. The S9 caps stay inside them. */}
		{(lookedUp => lookedUp > 0 && sub('lookedUp', `Looked up (${lookedUp})`, <>
			{item.sourceIds.length > 0 && <><Sources ids={ui.folds?.sources ? item.sourceIds : item.sourceIds.slice(0, 5)} entities={entities} />
				{item.sourceIds.length > 5 && <button type="button" className="link-button" onClick={() => fold('sources', !ui.folds?.sources)}>{ui.folds?.sources ? 'Show fewer' : `+ ${item.sourceIds.length - 5} more`}</button>}</>}
			{item.why.gaps.map(gap => <p key={gap}>Could not read: {gap}</p>)}
			{item.why.searched?.map((searched, n) => <p key={n}>Looked up: {searched}</p>)}
		</>))(item.sourceIds.length + item.why.gaps.length + (item.why.searched?.length ?? 0))}
		{timeline && (() => {
			const work = timeline
			// Progress (S9): the goal, the open steps (▸ the current one), who does each and where, in words; done steps folded, ✓, never struck out.
			const steps = work.planIds.map(id => entities.planSteps[id]), done = steps.filter(step => step.done), open = steps.filter(step => !step.done)
			const current = open.find(step => step.now) ?? open[0]
			const whoOf = (step: typeof steps[number]) => step.owner.kind === 'you' ? 'You' : step.owner.kind === 'delegate' ? NAME : step.owner.kind === 'others' ? step.owner.text : 'Nobody'
			const line = (step: typeof steps[number], mark: string) => <li key={step.id} aria-current={step === current ? 'step' : undefined}><span className="step-mark" aria-hidden="true">{mark}</span><span className="step-text">{step.what}</span><small>{whoOf(step)}{step.where ? ` · ${step.where}` : ''}{step.build ? ` · build ${step.build}` : ''}</small></li>
			return sub('progress', steps.length > 0 ? `Progress: ${done.length} of ${steps.length} steps done` : 'This work', <><p>Goal: {work.goal}</p>{work.waiting && <p>Waiting on {work.waiting}</p>}
				{work.then && <p>Then {work.then.owner.kind === 'you' ? 'you' : work.then.owner.kind === 'delegate' ? NAME : work.then.owner.kind === 'others' ? work.then.owner.text : 'nobody'}: {work.then.what}{work.then.you ? `. Then you: ${work.then.you}` : ''}</p>}
				{open.length > 0 && <ul className="steps">{open.map(step => line(step, step === current ? '▸' : '○'))}</ul>}
				{done.length > 0 && <><button type="button" className="link-button" aria-expanded={!!ui.folds?.doneSteps} onClick={() => fold('doneSteps', !ui.folds?.doneSteps)}>{ui.folds?.doneSteps ? 'Hide' : 'Show'} the {done.length} done step{done.length === 1 ? '' : 's'}</button>
					{ui.folds?.doneSteps && <ul className="steps steps-done">{done.map(step => line(step, '✓'))}</ul>}</>}</>)
		})()}
		{(!!timeline?.stepIds.length || !!item.earlier) && (() => {
			// What happened (S9): newest first, the 4 newest until "Show all"; codes and raw references are already gone (projection).
			// The sender's earlier ask (L3d) is the oldest line: history, so here and not in block 1.
			const all = [...(timeline?.stepIds ?? [])].reverse(), shown = ui.folds?.history ? all : all.slice(0, 4)
			return sub('happened', `What happened (${all.length + (item.earlier ? 1 : 0)})`, <>{all.length > 0 && <ol className="history">{shown.map(id => {
				const step = entities.workSteps[id]
				return <li key={id}>{compact(step.at)}<span>{step.news ? <strong>{step.what}</strong> : step.what}</span></li>
			})}</ol>}{all.length > 4 && <button type="button" className="link-button" onClick={() => fold('history', !ui.folds?.history)}>{ui.folds?.history ? 'Show fewer' : `Show all ${all.length}`}</button>}
				{item.earlier && <p className="card-earlier">{item.earlier}</p>}</>)
		})()}
		{handled.length > 0 && <><h4>Changes already handled</h4><ul>{handled.map(id => {
			const effect = entities.changes[id]
			return <li key={id}>{effect.state === 'made' ? 'Made' : effect.state === 'left-out' ? 'Left out' : effect.state}: {effect.action} - {effect.summary}</li>
		})}</ul></>}
		{item.unsent && <><h4>{NAME}'s draft (not sent)</h4><p className="muted">{item.unsent}</p></>}
		{item.job && <p className="muted">{item.job}</p>}
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

	return <article className={`item-card${inline ? ' inline-card' : ''}`} aria-labelledby={`card-title-${code}`} tabIndex={-1} ref={article} data-mode={item.mode} data-undrawn={undrawn.join(' ') || undefined}
		onPointerDownCapture={event => { if (event.target instanceof Element && event.target.closest('[data-primary="true"]')) edit({ interacting: true }) }}
		onKeyDown={event => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing &&
				!(event.target instanceof Element && event.target.closest('[data-field=ask]'))) {
				event.preventDefault()
				article.current?.querySelector<HTMLButtonElement>('[data-primary="true"]')?.click()
			}
		}}>
		{asks ? <AsksList codes={asks.codes} current={code} entities={entities} onOpen={asks.onOpen} /> : placement && placement.subjects.length >= 2 && <AsksList codes={placement.subjects} current={code} entities={entities} />}
		{block1}{answered}{failed}{found}{item.mode === 'working' && writeBox && <section className="card-block card-write-own">{writeBox}</section>}<fieldset className="card-readonly" disabled={readOnly}>{block2}{reviewBlock}{block3}</fieldset>{earlierTodos}{doneSoFar}{!readOnly && block4}
		{/* R10b (joint C2): Approve's meaning line, always visible directly under the bar, whichever role Approve has. */}
		{!readOnly && approvePr?.meaning && <p className="muted approve-meaning">{approvePr.meaning}</p>}
		{chatEdit.message && <p role="status">{chatEdit.message}</p>}
		{others.map(action => <div key={action.id}>{action.meaning && <p>{action.meaning}</p>}<ActionButton action={action} disabled={newer && action.staleness === 'exact' || action.effect !== 'local' && !action.meaning} disabledReason={newer ? 'stale' : undefined} /></div>)}
		{!readOnly && <ActionState item={code} rev={item.rev} />}
		{primary && primary.rev !== item.rev && <ActionState item={primary.item} rev={primary.rev} />}
		{block5}
	</article>
}

// Under each "Left for you" line, where it came from (PM 20:00): "From your reply to Robin in Acme reviews · Tue 22 Oct", opening that
// message in Teams when there is one; a change Delegate couldn't make says so, with its reason under Why?. No codes or links in the words.
function TodoSource({ todo }: { todo: Entities['todos'][string] }) {
	if (todo.why) {
		const same = todo.text.replace(/[.\s]+$/, '').toLowerCase() === todo.why.toLowerCase()
		return same ? <span className="todo-source todo-why">Delegate couldn&apos;t do this</span> : <details className="todo-source todo-why"><summary>Delegate couldn&apos;t do this · Why?</summary><p>{todo.why}.</p></details>
	}
	const from = todo.from
	if (!from) return null
	const day = Number.isFinite(Date.parse(from.at)) ? new Date(from.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '') : ''
	const words = [`From your reply${from.who ? ` to ${from.who}` : ''}${from.chat ? ` in ${from.chat}` : ''}`, day].filter(Boolean).join(' · ')
	return from.teams ? <a className="todo-source" href={from.teams} target="_blank" rel="noopener noreferrer" title="Open this reply in Teams, in a new tab.">{words}</a> : <span className="todo-source">{words}</span>
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
			const chat = entities.chats[item.chatId], where = chat?.group ? chat.place?.row ?? `in ${chat.name}` : '1:1'
			return <li key={item.code}><button type="button" className="ask-line" aria-current={item.code === current || undefined} title={`${person.name}${spread ? ` (${where})` : ''}: ${words} (${item.code})`} onClick={() => onOpen ? onOpen(item.code) : navigate(classic ? `focus/${item.code}` : `now/${item.code}`)}>
				<span className="card-avatar small" style={{ '--hue': person.hue } as CSSProperties} aria-hidden="true">{person.initials}</span><strong>{firstName(person.name)}</strong>{spread && <span className="ask-where">{where}</span>}<span className="ask-words">{words}</span><SentTime at={at.at} added={at.added} /></button></li>
		})}</ul></section>
}

// R10b: what a review posted on the PR, H→M→L, a severity chip (text, its own outline), file:line, the first line and its Thread; five
// then "and N more". The review-done card, its Done card and Classic's Done row draw the same list.
export function ReviewPosted({ review }: { review: NonNullable<Item['reviewDone']> }) {
	return review.posted.length > 0 && <><h3>Posted on PR {review.pr}</h3>
		<ul className="review-posted">{review.posted.map((comment, n) => <li key={n}><span className={`chip severity-chip severity-${comment.severity.toLowerCase()}`}>{comment.severity}</span>
			{comment.file && <> · <code>{comment.file}{comment.line ? `:${comment.line}` : ''}</code></>} · {comment.text}
			{comment.thread && <> · <a href={comment.thread} target="_blank" rel="noopener noreferrer">Thread <Icon name="ext" /></a></>}</li>)}</ul>
		{review.more > 0 && <p className="muted">and {review.more} more</p>}</>
}