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
import { copyText, ItemCode } from './ItemCode.tsx'
import { useActionCheck, useLiveVoteCheck } from './vote-check.ts'
import { holdDismiss, undoDismissHold, useSuggestionHolds, type SuggestionHold } from '../data/suggestion-holds.ts'
import './card.css'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { SentBecause, toWay } from './SentBecause.tsx'
import { useSetting } from '../data/screens.ts'
import { markTodos, undoMark } from '../data/todo-marks.ts'
import { useHold } from '../data/hide-holds.ts'
import { HeldLine } from './HeldLine.tsx'
import { closeMenuOf, useMenuChoice } from './card-more.ts'
import { displayedAt as sentAt } from '../domain/needs-order.ts'
export { sentAt }

// The card (spec S1, design-spec/mockups/card-redesign.html): the same blocks in New's opened row and Classic's Needs-you card.
// 1 their message · 2 what you'll send · 3 what happens when you send · 4 actions · 5 Details.
export const firstName = (name: string) => name.split(/\s+/)[0] || name
// A120 / PM A R36: an untitled group is named by its other members, in the server's words (head: 2 names, row: 1 name).
export const whereOf = (chat: Entities['chats'][string], form: 'head' | 'row' = 'head') => chat.group ? chat.place?.[form] ?? `in ${chat.name}` : '1:1 chat'
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
// I34 (Designer, designer-automated-marker.md §3): what the reply box's footer means, for screen readers ("Teams will add: …") while it
// shows, and the muted line once he has edited; a change of state is announced once, politely, never per keystroke or on first render.
function MarkerState({ id, marker, edited }: { id: string; marker: string; edited: boolean }) {
	const [said, setSaid] = useState(''), seen = useRef(edited)
	useEffect(() => {
		if (seen.current === edited) return
		seen.current = edited
		setSaid(edited ? `Marker removed: your words are sent without “${marker}”.` : `Marker back: unchanged draft is sent with “${marker}”.`)
	}, [edited, marker])
	return <>
		{edited ? <p id={id} className="muted card-marker">Your words: sent without &ldquo;{marker}&rdquo;.</p> : <span id={id} className="sr-only">Teams will add: {marker}</span>}
		<span className="sr-only" aria-live="polite">{said}</span>
	</>
}
// label/controlsId/noun (A76, designer-sent-reply SR3/SR5): a sent reply reuses this same S9 clamp with its own accessible name, a toggle
// that names its count and points at the bubble, and "reply" for "message". Their message passes none, so its markup is unchanged.
// B1: a PR review's wait line, linked by its kind: none → Add a line (nothing prefilled), waiting / off → that line; covered has no link.
function ReviewWait({ wait }: { wait: NonNullable<Item['why']['reviewWait']> }) {
	const { href } = useScreenNavigation()
	const target = wait.kind === 'none' ? 'way-add' : (wait.kind === 'waiting' || wait.kind === 'off') && wait.lineId ? `way-${wait.lineId}` : undefined
	return target ? <a href={href('settings/ways')} onClick={() => toWay(target)}>{wait.text}</a> : <>{wait.text}</>
}

export function MessageBubble({ text: raw, teams, open, onToggle, label, controlsId, noun = 'message' }: { text: string; teams?: string; open: boolean; onToggle: (open: boolean) => void; label?: string; controlsId?: string; noun?: 'message' | 'reply' }) {
	// L7c: a run of blank lines reads as one before the clamp, so a short message isn't cut to two visible lines.
	const text = messageText(raw).replace(/\n[ \t]*(?:\n[ \t]*)+\n/g, '\n\n')
	const named = label ? { 'aria-label': label, id: controlsId } : {}
	if (text.length > HUGE) return <div className="card-bubble-wrap"><blockquote className="card-bubble scroll" {...named}>{withImages(text.slice(0, HUGE_SHOWN), teams)}…</blockquote>
		<p className="muted">The rest is too long to show here ({text.length.toLocaleString()} characters).{teams && <> <a href={teams} target="_blank" rel="noopener noreferrer">Open in Teams <Icon name="ext" /></a></>}</p></div>
	const long = text.length > 600 || text.split('\n').length > 6
	if (!long) return <blockquote className="card-bubble" {...named}>{withImages(text, teams)}</blockquote>
	const count = text.length.toLocaleString()
	return <div className="card-bubble-wrap"><blockquote className={`card-bubble ${open ? 'scroll' : 'clamp'}`} {...named} {...(label && open ? { tabIndex: 0 } : {})}>{withImages(text, teams)}</blockquote>
		<button type="button" className="link-button" onClick={() => onToggle(!open)} aria-expanded={open} {...(controlsId ? { 'aria-controls': controlsId } : {})} {...(label && !open ? { 'aria-label': `Show the whole ${noun}, ${count} characters` } : {})}>{open ? 'Show less' : `Show the whole ${noun} (${count} characters)`}</button></div>
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
	// D-MORE-MENU §3.4/§5.4: an accepted choice in ⋯ closes it (G2: never while pending, refused, errored or uncertain).
	const moreRef = useRef<HTMLDetailsElement>(null), menuChosen = useMenuChoice(moreRef)
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
	// WYS N1: the exact set Send names, and SEND's consistency check on the reply against it (W4), live as he ticks or edits.
	const dismissing = useSuggestionHolds(state => state.holds)
	const wys = wysSelection(item, entities, ui, dismissing)
	const claimCheck = useActionCheck(code, ui.editing ? ui.editText : undefined, wys && !readOnly && item?.draftId && !item.sent ? wys.effective : undefined)
	const claim = claimCheck.action
	// A58 S-A2: a held Close it shows its Undo line in the card's place (decision 54); after every hook, so the hook order never changes.
	const held = useHold(code)
	if (held && !readOnly) return <section className="item-card"><HeldLine item={code} /></section>
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
	// I34 (PE 05:30, decision 45): the marker means "Delegate wrote this and nobody changed it". The server decides it (SEND's markerFor);
	// the page only previews it, from the projection's own marker string. The box holds the reply without it, and his words are sent as he
	// wrote them, never signed here. The footer shows only while the box still equals the draft (trailing whitespace aside).
	const marker = draft?.marker && draft.sendText?.endsWith(draft.marker) ? draft.marker : undefined
	const body = marker ? draft!.sendText!.slice(0, -marker.length).trimEnd() : draft?.sendText ?? draft?.text ?? ''
	const replyText = ui.editText ?? body
	// WYS N1-3 (I32): on an origin-bearing item every Send names exactly what is ticked; past the consistency check, Send anyway adds its token.
	const selection: Intent['input'] = wys ? { include: wys.effective, ...(ui.claimConfirm && claim ? { claimReview: claim.review } : {}) } : { excluded: ui.excluded }
	const input: Intent['input'] = primary?.kind === 'send-edit' ? { text: replyText, ...selection } :
		primary?.kind === 'pick' ? { picks: ui.picks ?? item.picked ?? [] } :
			primary?.input === 'text' ? { text: ui.answer ?? '' } : selection
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
	// WYS W4/O5: the action Send anyway confirms (the primary Send), whether a claim holds it, and the unticked changes Tick it includes.
	const claimTarget = primary && ['approve', 'send-edit'].includes(primary.kind) ? primary : undefined
	const claimBlocked = !!claim && !!claimTarget, nothingChosen = !!wys && !draft && primary?.kind === 'approve' && !wys.effective.length
	const tickable = claim && wys ? claim.effectIds.filter(id => wys.choosable.some(change => change.changeId === id)) : []
	const tickIt = () => wys && edit({ included: [...new Set([...wys.picked, ...tickable])], claimConfirm: undefined, folds: { ...ui.folds, wys: true },
		groupOff: ui.groupOff?.filter(group => !tickable.some(id => wys.choosable.find(change => change.changeId === id)?.group?.id === group)) })
	const sent = sentAt(item), replyWhere = chat.group ? `in ${chat.place?.sentence ?? chat.name}` : 'in your 1:1'
	const avatar: CSSProperties & { '--hue': number } = { '--hue': person.hue }
	const continueAction = actions.find(action => action.kind === 'continue')

	// Block 1: their message, with its chat and time, the thread in place, and the one warn line card-state chose (L4): every other
	// reason is in Details › Why it waited. Nothing else here draws a warn line.
	const warnings = [item.attention].filter((line): line is string => !!line && line !== item.voteGap?.text)
	const earlier = item.thread.length
	// D-MORE-MENU MM1 (PE §5.1): ⋯ is the head line's last child, after Open in Teams; it is built below with block 4's names.
	const block1 = (moreMenu: ReactNode) => <section className="card-block card-message" aria-label={`${person.name}'s message`}>
		<div className="card-head"><span className="card-avatar" style={avatar} aria-hidden="true">{person.initials}</span>
			<h2 id={`card-title-${code}`} className="card-who">{person.name}</h2><span className="card-where" title={chat.place?.title}>· {whereOf(chat)} ·</span>
			<SentTime at={sent.at} added={sent.added} full /><span className="card-sep" aria-hidden="true">·</span><ItemCode code={code} />
			{chat.guests && <Hint text={chipHover('guests')}><span className="chip">Guests in chat</span></Hint>}
			<span className="card-head-end">{item.teams && <Hint text="Open this message in Teams, in a new tab."><a className="card-teams" href={item.teams} target="_blank" rel="noopener noreferrer">Open in Teams <Icon name="ext" /></a></Hint>}</span>
			{moreMenu}
		</div>
		{item.ask && <MessageBubble text={item.ask} teams={item.teams} open={ui.folds?.ask ?? false} onToggle={open => fold('ask', open)} />}
		{earlier > 0 && <details className="card-thread" open={ui.folds?.thread ?? false} onToggle={event => fold('thread', event.currentTarget.open)}>
			<Hint text="Show the earlier messages of this conversation here. Nothing changes in Teams."><summary>Show {earlier} earlier message{earlier === 1 ? '' : 's'}</summary></Hint>
			<ol className="thread-list">{item.thread.map((message, n) => <li key={n}><strong>{message.who}</strong> <time dateTime={message.at}>{when(message.at)}</time>			<p>{clip(messageText(message.text))}</p></li>)}</ol>
		</details>}
		{/* L7d: every warn line shares one box, one line each (L4 leaves at most one from the card's state). */}
		{(newer || warnings.length > 0 || !!item.stop || placement?.chips.some(chip => chip.kind === 'retrying')) && <div className="warnbox">
			{newer && <p role="status" className="warnline"><Icon name="warn" /> Changed since you looked. Your current text is kept. <Button variant="outline" onClick={showLatest} disabled={busy}>Show new version</Button></p>}
			{warnings.map((line, n) => <p key={n} className="warnline"><Icon name="warn" /> {line}</p>)}
			{/* D-COST JB1/JBΔ: under a stop's warn line, the asker's news since the stop (↗ that message), then what the job tried first. */}
			{item.stop?.news && <p className="muted stop-news">{item.stop.news.who} {item.stop.news.again ? 'asked again' : 'added something'} · {when(item.stop.news.at)}{item.stop.news.teams && <> <a href={item.stop.news.teams} target="_blank" rel="noopener noreferrer" aria-label="Open that message in Teams, in a new tab">↗</a></>}</p>}
			{item.stop?.tried?.length ? <p className="muted stop-tried">{item.stop.tried[0]} · <a href={`#stop-tried-${code}`} onClick={event => { event.preventDefault(); fold('details', true); setTimeout(() => { const details = document.getElementById(`stop-tried-${code}`) as HTMLDetailsElement | null; if (details) { details.open = true; details.scrollIntoView({ block: 'nearest' }) } }, 0) }}>What it tried ({item.stop.tried.length})</a></p> : null}
			{placement?.chips.some(chip => chip.kind === 'retrying') && <p className="warnline">Retrying{placement.nextText ? `: ${placement.nextText.replace('{at}', placement.next?.at ? when(placement.next.at) : 'soon')}` : ''}</p>}
		</div>}
		{item.openOn && item.mode !== 'in-terminal' && <p className="card-status">Open in a terminal on {item.openOn} · {NAME} waits until you close it</p>}
		{/* Step 6 (HOST's returnedFrom): back from his window, until his next action or a new draft. */}
		{item.returned && <p className="card-status">Back from your window on {item.returned.machine} · {when(item.returned.at)}{item.returned.report ? '' : ' · nothing decided there'}</p>}
		{item.before && <Hint text={chipHover('before')}><p className="chip">From before setup</p></Hint>}
	</section>

	// A run that gave no result (queue-new #11): the reason and its time, never a question; Try again is the primary, or write it yourself.
	const writeOwn = actions.find(action => action.kind === 'write-own')
	const writeBox = writeOwn && !readOnly && ui.editing && <><Field code={code} rev={item.rev} field="answer" label={`Your reply to ${first}, ${replyWhere}`} value={ui.answer ?? ''} edit={edit} rows={4} placeholder={`Write your reply to ${first}`}
		describedBy={marker && ui.answer?.trim() ? `${code}-${item.rev}-own-marker` : undefined} />
		{/* I34: words he wrote himself never carry the marker; once he has typed, the line says why there is none. */}
		{marker && !!ui.answer?.trim() && <p id={`${code}-${item.rev}-own-marker`} className="muted card-marker">Your words: sent without &ldquo;{marker}&rdquo;.</p>}
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
	// DD4-C1 (PE R4, PM decision 4): the context line "Your step (from <day>): <step>." leads, normal weight with a bold lead-in; S2's
	// "Then Delegate shares the result…" line is gone, and the bar says what the button does.
	const stepSince = work?.yours?.since && Number.isFinite(Date.parse(work.yours.since)) ? new Date(work.yours.since).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '') : undefined
	const yourStep = work?.yours && report && <section className="card-block card-step">
		<h3 className="step-context"><strong>Your step{stepSince ? ` (from ${stepSince})` : ''}:</strong> {work.yours.what.replace(/[.\s]+$/, '')}.</h3>
		{work.yours.check && <p className="muted">{work.yours.check.what} done <time dateTime={work.yours.check.at}>{when(work.yours.check.at)}</time> (build {work.yours.check.build}).</p>}
		<fieldset className="report-form"><legend>How did it go?</legend>{([['Both work', 'Worked'], ['Issues found', 'Issues found'], ['Blocked', 'Blocked']] as const).map(([result, label]) => <label className="option" key={result}><input type="radio" name={`report-${code}`} checked={ui.resultKind === result} onChange={() => edit({ resultKind: result })} />{label}</label>)}</fieldset>
		<Field code={code} rev={item.rev} field="report" label="What you saw: errors, IDs, links (optional)" value={ui.report ?? ''} edit={edit} rows={2} />
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
	// N1-3 (CR note 05:30): a change's PR and whether it is a vote come from its call (the projection's pr and vote), never its words.
	const prOf = (change: Entities['changes'][string]) => change.pr
	const isVote = (change: Entities['changes'][string]) => !!change.vote
	const prChanges = changes.filter(change => change.pr !== undefined || !!change.vote)
	const prNumber = prChanges.map(prOf).find(Boolean)
	const findings = prChanges.filter(change => !isVote(change))
	const vote = prChanges.find(isVote)
	const included = (change: Entities['changes'][string]) => wys ? wys.effective.includes(change.changeId ?? '') : !(ui.excluded ?? []).includes(change.n)
	// #28 B1 (PE 01:10): what Send does on the PR is read from the changes it will make: included (ticked), pending and not refused.
	const posting = prChanges.filter(change => included(change) && !change.error && change.state !== 'made' && change.state !== 'left-out')
	// findingFor move (PE 01:22): the projection matched each finding to its pending comment change as SEND does (posts, changeId); the
	// card adds only whether that change is still ticked and postable.
	const postsComment = (finding: NonNullable<Item['prReview']>['findings'][number]) => !!finding.posts && posting.some(change => change.id === finding.changeId)
	// D-A239 MP2 / CR B3: an ask with a review per PR shows those blocks (below) instead of one item-level review of an arbitrary PR.
	const perPr = (item.reviews?.length ?? 0) >= 2
	const review = !perPr && item.mode !== 'review-done' && !item.reviewDone?.closed && (prChanges.length > 0 && (item.job || findings.length > 0) || !!item.prReview?.findings.length) && <section className="card-block card-review"><h3>{NAME}'s review{prNumber ?? item.prReview?.pr ? ` of PR ${prNumber ?? item.prReview?.pr}` : ''}</h3>
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
		{/* A76 (decision 55; designer-sent-reply SR2-SR4): the reply that went, in the reply slot, as the same S9 bubble with the PM's head
		    line. No "Your reply to" heading and no pre-send count; the delivered text shows as sent, marker included. Unsent drafts are
		    unchanged (never clamped). D-A281 B3: a reply a line sent says which, from the line frozen at send (SR2's muted line). */}
		{item.sent && <section className="card-block reply-section card-sent">
			<h3 className="sent-head"><strong>{item.sent.by === 'rule' ? `${NAME} replied to ${first} by itself` : item.sent.holding ? `You sent a holding reply to ${first}` : `You replied to ${first}`}</strong>
				{' · '}<time dateTime={item.sent.at}>{when(item.sent.at)}</time>{item.sent.teams && <> <a href={item.sent.teams} target="_blank" rel="noopener noreferrer" title="Open this reply in Teams, in a new tab." aria-label="Open this reply in Teams">↗</a></>}</h3>
			{item.sent.rule && <p className="muted sent-because"><SentBecause rule={item.sent.rule} /></p>}
			<MessageBubble text={item.sent.text} open={ui.folds?.sent ?? false} onToggle={open => fold('sent', open)} noun="reply" controlsId={`${code}-sent`}
				label={`${item.sent.by === 'rule' ? `${NAME} replied to ${first} by itself` : item.sent.holding ? `You sent a holding reply to ${first}` : `You replied to ${first}`}, sent ${when(item.sent.at)}`} />
		</section>}
		{!item.sent && draft && boxMode === 'answer' && <section className="card-block reply-section">
			{/* The owner's edit stays what this fold shows and what the bar sends, while he answers (PE step-4 review, 2). */}
			<details className="card-draft-fold"><summary>{ui.editing ? 'Your edited reply · not sent' : `${NAME}'s draft so far · not sent`}</summary><div className="draft">{ui.editing ? replyText : draft.sendText ?? draft.text}</div></details>
			<button type="button" className="link-button" aria-controls={`${code}-${item.rev}-editText`} onClick={() => { edit({ mode: 'reply' }); focusField('editText') }}>Edit and send the draft instead</button>
		</section>}
		{!item.sent && draft && boxMode !== 'answer' && <section className="card-block reply-section">
			{editable ? <Field code={code} rev={item.rev} field="editText" rows={Math.min(14, Math.max(3, Math.ceil(replyText.length / 70) + replyText.split('\n').length))}
				label={draft.holding ? `Holding reply to ${first}, ${replyWhere} · says you are on it; not the answer yet` : `Your reply to ${first}, ${replyWhere}`}
				value={replyText} edit={edit} patch={value => ({ editText: value, editing: value.trimEnd() !== body.trimEnd() })} mark={ui.editing ? live.claim?.quote : item.voteGap?.quote}
				framed={!!marker} footer={marker && !ui.editing ? marker : undefined} describedBy={marker ? `${code}-${item.rev}-marker` : undefined} />
				: <><h3>{draft.holding ? `Holding reply to ${first}` : `Your reply to ${first}, ${replyWhere}`}</h3><div className="draft">{marked(draft.sendText ?? draft.text, item.voteGap?.quote)}</div></>}
			{editable && marker && <MarkerState id={`${code}-${item.rev}-marker`} marker={marker} edited={!!ui.editing} />}
			{/* L1b (joint C2): the vote-claim line is about his text, so it sits right under the editor, not in block 1. */}
			{/* A37 (b): live while he edits; once no claim is left the line says so, muted, and Send enables (PM A R37). */}
			<div aria-live="polite">{voteLine ? <p className="warnline card-vote-claim" role="note"><Icon name="warn" /> {voteLine}</p>
				: ui.editing && live.cleared && <p className="muted card-vote-claim card-vote-cleared">✓ The reply no longer mentions a vote.</p>}
				{/* WYS W4 (S1-4): the consistency check sits in the same slot, stacked under the vote line; Send waits until one is done.
				    Send anyway (⋯, O5) confirms here, on the exact words and ticks, with focus on Cancel. */}
				{claim && !ui.claimConfirm && <div className="warnline card-action-claim" role="alert"><p><Icon name="warn" /> {claim.line}</p>
					<p className="wys-claim-actions">{tickable.length > 0 && <button type="button" className="link-button" onClick={tickIt}>Tick it</button>}
						<button type="button" className="link-button" onClick={() => editable ? focusField('editText') : undefined}>Edit the reply</button></p></div>}
				{claim && ui.claimConfirm && claimTarget && <div className="warnline card-action-claim" role="group" aria-label="Send anyway"><p>{claim.confirm}</p>
					<p className="wys-claim-actions"><Button variant="outline" autoFocus onClick={() => edit({ claimConfirm: undefined })}>Cancel</Button>
						<ActionButton action={claimTarget} label="Send anyway" input={claimTarget.kind === 'send-edit' ? { text: replyText, ...selection } : selection} disabled={newer || claimCheck.pending} disabledReason={newer ? 'stale' : 'Checking your reply...'} /></p></div>}</div>
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
	const waitingAll = reviewed && !reviewed.closed ? changes.filter(change => !reviewed.voteChangeIds?.includes(change.id) && change.state !== 'made' && change.state !== 'left-out') : []
	const postedN = reviewed ? reviewed.counts.high + reviewed.counts.medium + reviewed.counts.low : 0
	// ✕ (W2, [Designer] "Don't suggest this"; CR B4 20:27:10Z): every suggested complete change with its bound dismissal offer, whether a
	// line, a group option or a waiting review comment, hides with the same 6 s client-held Undo; never a group scope, never a vote.
	const dismissButton = (change: Change) => { const action = wys && change.origin === 'suggested' && !change.vote && change.dismissActionId ? entities.actions[change.dismissActionId] : undefined
		return action && !readOnly && <button type="button" className="wys-dismiss" aria-label={`Don't suggest this: ${change.action}`} title={action.meaning} disabled={busy || newer}
			onClick={() => { edit({ included: wys!.picked.filter(id => id !== change.changeId), claimConfirm: undefined }); holdDismiss(action, change.changeId!, act) }}>✕</button> }
	const heldLine = ({ change, hold }: { change: Change; hold: SuggestionHold }) => <p key={change.id} role="status" className="wys-dismissed">Won't suggest this: {change.action}{!hold.sent && <> · <button type="button" className="link-button" autoFocus onClick={() => undoDismissHold(item.code, change.changeId!)}>Undo</button></>}</p>
	const heldIds = new Set(wys?.held.map(({ change }) => change.id))
	const waitingComments = waitingAll.filter(change => !heldIds.has(change.id))
	const reviewBlock = reviewed && <section className="card-block card-review-done" aria-label={`Review of PR ${reviewed.pr}`}>
		<p className="card-status">{reviewed.closed ? item.status : <>{NAME} reviewed the newest changes ({when(reviewed.reviewedAt)}), {postedN ? `posted ${postedN} comment${postedN === 1 ? '' : 's'}` : 'found nothing to comment on'}{reviewed.reply ? ` and replied to ${reviewed.to}` : ''}.</>}</p>
		<ReviewPosted review={reviewed} />
		{(waitingComments.length > 0 || waitingAll.length > 0) && <div className="review-waiting"><p>Waiting for your OK: {waitingComments.length} more comment{waitingComments.length === 1 ? '' : 's'}.</p>
			{/* CR B2 (19:22:04Z): on an origin-bearing review each waiting comment has its tick (the item's own selection), and Post them
			    sends exactly the ticked ones, never every comment. */}
			<ul>{waitingComments.map(change => <li key={change.id}>{wys && change.changeId && !change.vote ? <label><input type="checkbox" checked={wys.picked.includes(change.changeId)} disabled={readOnly || busy || newer}
				onChange={() => edit({ included: wys.picked.includes(change.changeId!) ? wys.picked.filter(id => id !== change.changeId) : [...wys.picked, change.changeId!] })} /> {change.action}</label> : change.action}{dismissButton(change)}</li>)}</ul>
			{wys?.held.filter(({ change }) => waitingAll.includes(change)).map(heldLine)}
			{postWaiting && !readOnly && <ActionButton action={postWaiting} input={wys ? selection : { excluded: [] }} disabled={newer || !!wys && !wys.effective.length} disabledReason={newer ? 'stale' : 'Tick a change first.'} />}</div>}
		{reviewed.reply && <><h3>Sent to {reviewed.to}</h3><p className="review-reply">{reviewed.reply.text}</p>
			{reviewed.reply.teams && <a className="card-teams" href={reviewed.reply.teams} target="_blank" rel="noopener noreferrer">Open in Teams <Icon name="ext" /></a>}</>}
		{reviewed.fallback && <p className="muted">{reviewed.fallback}</p>}
	</section>
	// D-A239 MP2 (Designer): two or more reviewed PRs: one "Delegate's review of PR <n>" block each, in ask order, with that PR's waiting
	// comments and its own approval pair by C2's findings rule (no High: outline Approve PR <n> + link Open PR to approve; any High: the
	// reverse) and A5's meaning line under it, every time. The bar carries no Approve and no Open PR. One reply for the whole ask.
	// CR B3: from the per-unit reviews whatever the reply's mode; with a reply awaiting his OK the bar's Send leads and the comments are in
	// "When you send", so a block shows what was posted and Open PR to approve (the projection offers Approve only when it is vote-only).
	const pairFor = (review: NonNullable<Item['reviews']>[number]) => {
		const approve = review.approveActionId ? entities.actions[review.approveActionId] : undefined
		const open = review.prUrl && <a className={review.counts.high ? 'review-pair-button' : 'review-pair-link'} href={review.prUrl} target="_blank" rel="noopener noreferrer" title="Opens the PR in Azure DevOps, where you approve it yourself." aria-label={`Open PR ${review.pr} to approve`}>Open PR to approve <Icon name="ext" /></a>
		const vote = approve && <span className={review.counts.high ? 'review-pair-link' : undefined}><ActionButton action={approve} disabled={newer} disabledReason="stale" /></span>
		return <div className="review-pair">{review.counts.high ? <>{open}{vote}</> : <>{vote}{open}</>}{approve?.meaning && <p className="muted approve-meaning">{approve.meaning}</p>}</div>
	}
	const perPrBlocks = perPr && <>{item.reviews!.map(review => {
		const n = review.counts.high + review.counts.medium + review.counts.low, mine = waitingComments.filter(change => change.pr === review.pr)
		return <section key={review.pr} className="card-block card-review-done" aria-labelledby={`review-${code}-${review.pr}`}>
			<h3 id={`review-${code}-${review.pr}`}>{NAME}&apos;s review of PR {review.pr}</h3>
			<p className="card-status">{NAME} reviewed the newest changes ({when(review.reviewedAt)}), {n ? `posted ${n} comment${n === 1 ? '' : 's'}` : 'found nothing to comment on'}.</p>
			<ReviewPosted review={review} />
			{mine.length > 0 && <div className="review-waiting"><p>Waiting for your OK: {mine.length} more comment{mine.length === 1 ? '' : 's'}.</p>
				<ul>{mine.map(change => <li key={change.id}>{wys && change.changeId ? <label><input type="checkbox" checked={wys.picked.includes(change.changeId)} disabled={readOnly || busy || newer}
					onChange={() => edit({ included: wys.picked.includes(change.changeId!) ? wys.picked.filter(id => id !== change.changeId) : [...wys.picked, change.changeId!] })} /> {change.action}</label> : change.action}{dismissButton(change)}</li>)}</ul></div>}
			{review.approveActionId && !review.closed && !readOnly ? pairFor(review) : review.approved ? <p className="review-approved" role="status"><Icon name="check" /> Approved PR {review.pr} · {when(review.approved)}</p> : !review.closed && !readOnly && pairFor(review)}
		</section>
	})}
		{/* Comments of no listed PR, the held ✕ lines and the one Post them (it posts exactly what is ticked, across the blocks). */}
		{(waitingAll.length > 0) && <div className="card-block review-waiting">{(rest => rest.length > 0 && <><p>Waiting for your OK: {rest.length} more comment{rest.length === 1 ? '' : 's'}.</p><ul>{rest.map(change => <li key={change.id}>{change.action}{dismissButton(change)}</li>)}</ul></>)(waitingComments.filter(change => !item.reviews!.some(review => review.pr === change.pr)))}
			{wys?.held.filter(({ change }) => waitingAll.includes(change)).map(heldLine)}
			{postWaiting && !readOnly && <ActionButton action={postWaiting} input={wys ? selection : { excluded: [] }} disabled={newer || !!wys && !wys.effective.length} disabledReason={newer ? 'stale' : 'Tick a change first.'} />}</div>}
		{(sent => sent?.reply && <section className="card-block"><h3>Sent to {sent.to}</h3><p className="review-reply">{sent.reply.text}</p>
			{sent.reply.teams && <a className="card-teams" href={sent.reply.teams} target="_blank" rel="noopener noreferrer">Open in Teams <Icon name="ext" /></a>}</section>)(item.reviews!.find(review => review.reply))}
	</>
	const openPr = (variant: 'default' | 'outline') => !perPr && reviewed?.prUrl && <Button asChild variant={variant} data-primary={variant === 'default' || undefined}>
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
	// "Left for you" (#44(2), PM 18:40; designer step 7 §4; decision 53): the to-dos only he can do, his kept to-dos then his open wf.left
	// lines, in the order the server bound them (tick n is the n-th id). One tick per line, "Tick all" at 2+, and one "I've done these (N)"
	// that marks exactly the ticked lines after a 6 s Undo; it never closes the work and sends nothing. An automatic done keeps the lines
	// (PE 07:35:05Z rule 5), so they show whenever the item has them.
	const leftLines = item.leftLines ?? [], openLines = leftLines.filter(line => !line.seen), seenLines = leftLines.filter(line => line.seen)
	const kept = todoIds.length, tickText = (n: number) => n <= kept ? entities.todos[todoIds[n - 1]]?.text ?? '' : openLines[n - kept - 1]?.text ?? ''
	const todoAction = !readOnly && kept + openLines.length > 0 ? entities.actions[`${code}/todo-done`] : undefined
	const ticked = ui.ticked ?? [], marking = ui.marking
	const doneButton = (lead: boolean) => todoAction && <Hint text={ticked.length ? "Records them here as done. Delegate doesn't do them and nothing is sent." : "Tick what you've done first"}>
		<Button variant={lead ? 'default' : 'outline'} data-primary={lead || undefined} data-action-kind="todo-done" disabled={!ticked.length || newer || busy}
			onClick={() => { const picks = [...ticked].sort((a, b) => a - b); markTodos(todoAction, item.rev, picks, picks.map(tickText), act) }}>
			I've done these{ticked.length ? ` (${ticked.length})` : ''}</Button></Hint>
	const shownTodos = todoIds.map((id, n) => ({ id, n: n + 1 })).filter(todo => !marking?.picks.includes(todo.n))
	const shownLines = openLines.map((line, j) => ({ line, n: kept + j + 1 })).filter(shown => !marking?.picks.includes(shown.n))
	const shownCount = shownTodos.length + shownLines.length
	const tick = (n: number) => readOnly ? undefined : { checked: ticked.includes(n), disabled: newer || busy, onChange: (on: boolean) => edit({ ticked: on ? [...ticked, n] : ticked.filter(x => x !== n) }) }
	const earlierTodos = (kept > 0 || marking || leftLines.length > 0) && <section className="card-block card-left-for-you" aria-label="Left for you"><h3>Left for you</h3>
		{(kept > 0 || openLines.length > 0 || marking) && <p className="muted">Only you can do these. Ticking one off records it here; Delegate doesn't do it and nothing is sent.</p>}
		{!readOnly && shownCount >= 2 && <button type="button" className="link-button" onClick={() => edit({ ticked: ticked.length === shownCount ? [] : [...shownTodos.map(todo => todo.n), ...shownLines.map(shown => shown.n)] })}>Tick all</button>}
		<ul className="todo-ticks">{shownTodos.map(({ id, n }) => <li key={id}>{readOnly ? entities.todos[id].text : <label><input type="checkbox" checked={ticked.includes(n)} disabled={newer || busy}
			onChange={event => edit({ ticked: event.currentTarget.checked ? [...ticked, n] : ticked.filter(x => x !== n) })} /> {entities.todos[id].text}</label>}<TodoSource todo={entities.todos[id]} /></li>)}
			{shownLines.map(({ line, n }) => <LeftLineRow key={line.id} line={line} tick={tick(n)} action={line.button?.kind === 'action' && !readOnly ? entities.actions[line.button.actionId] : undefined} />)}
			{marking?.texts.map((text, n) => <li key={`done-${n}`} className="todo-done-line" role="status"><Icon name="check" /> Done: {text} · <button type="button" className="link-button" onClick={() => undoMark(code, item.rev)}>Undo</button></li>)}
			{seenLines.map(line => <LeftLineRow key={line.id} line={line} />)}</ul>
		{primary?.kind !== 'todo-done' && shownCount > 0 && <div className="action-bar">{doneButton(false)}</div>}
		{todoAction && <ActionState item={todoAction.item} rev={todoAction.rev} />}</section>

	// WYS N1-2 (W1, W2, W11; slice 1, no note box): one "When you send" block, collapsed to its summary unless something needs his eye,
	// with up to three groups: Delegate will (asked, promised, note, rule; ticked), Suggested (unticked, its reason inline) and Left for
	// you. An option group is one line whose checkbox waits for enough options. Votes are never ticked here (Approve, L1); a holding
	// reply has no block, only what happens next. Old originless items keep the block above (R4).
	const wysBlock = (() => {
		// A review that waits for his approval ticks its comments in its own list (CR B2), so it has no second block here.
		if (!wys || reviewed) return undefined
		// CR B3: a holding reply keeps his Left-for-you lines under its Then line. On a stopped job nothing runs on its own, so the line names
		// the one press that runs it again (PM FINAL 06:05:34 (1)), whether he sends the drafted or his edited text.
		if (draft?.holding && !wys.choosable.length && !wys.held.length) return <><p className="card-block muted wys-then">{item.stop ? `Then: nothing more runs until you press ${item.stop.kind === 'budget' ? 'Run it once more' : 'Try again'}.` : `Then: ${NAME} keeps working on it and comes back with the answer.`}</p>{earlierTodos}</>
		type Unit = { kind: 'line'; change: Change } | { kind: 'group'; id: string; question: string; min: number; options: Change[] }
		const units: Unit[] = []
		for (const change of wys.choosable) {
			const group = change.group
			if (!group) { units.push({ kind: 'line', change }); continue }
			const unit = units.find(unit => unit.kind === 'group' && unit.id === group.id)
			if (unit?.kind === 'group') { unit.options.push(change); unit.min = Math.max(unit.min, group.min) } else units.push({ kind: 'group', id: group.id, question: group.question, min: group.min, options: [change] })
		}
		const originOf = (unit: Unit) => unit.kind === 'line' ? unit.change.origin : unit.options[0].origin
		const will = units.filter(unit => originOf(unit) !== 'suggested'), suggested = units.filter(unit => originOf(unit) === 'suggested')
		// The turned-down line keeps its place with Undo while held (focus stays on the line, W7); after the window, no Undo.
		const dismissed = wys.held.map(heldLine)
		const votes = item.prReview ? [] : wys.changes.filter(change => change.vote)
		const toggle = (id: string) => edit({ included: wys.picked.includes(id) ? wys.picked.filter(other => other !== id) : [...wys.picked, id], claimConfirm: undefined })
		const off = readOnly || busy || newer
		const facts = (change: Change) => <>
			<p className="muted">{change.target}: {change.summary}</p>
			{change.meaning?.filter(part => !part.warn).map((part, n) => <p key={n} className="muted">{part.text}</p>)}
			{change.state === 'uncertain' && <p className="warnline">This may already have been made. Check before approving any retry.</p>}
			{change.error && <p role="alert" className="error">{change.state === 'uncertain' ? 'Could not confirm' : 'Not made'}: {change.error}</p>}
			{change.detail && <details><summary>Exact change details</summary><pre>{change.detail}</pre></details>}</>
		const why = (change: Change) => change.why && (change.origin === 'suggested' ? <span id={`${change.id}-why`} className="muted wys-reason">{change.why}</span>
			: <details className="wys-why"><summary>Why?</summary><span id={`${change.id}-why`}>{change.why}</span></details>)
		const line = (change: Change) => <div className="change wys-line" key={change.id}><div className="wys-line-head"><label><input type="checkbox" checked={wys.picked.includes(change.changeId!)}
			disabled={off || change.state === 'approved'} aria-describedby={change.why ? `${change.id}-why` : undefined} onChange={() => toggle(change.changeId!)} /> {change.action}</label>{why(change)}{dismissButton(change)}</div>{facts(change)}</div>
		const group = (unit: Extract<Unit, { kind: 'group' }>) => {
			const picked = unit.options.filter(option => wys.picked.includes(option.changeId!)).length, ready = picked >= unit.min, on = ready && !ui.groupOff?.includes(unit.id)
			const summary = unit.options.every(option => option.summary === unit.options[0].summary) ? unit.options[0].summary : unit.question
			return <div className="change wys-line wys-group" key={unit.id} role="group" aria-label={unit.question}>
				<div className="wys-line-head"><label title={ready ? undefined : `Choose first: ${unit.question}`}><input type="checkbox" checked={on} disabled={off || !ready} aria-describedby={summary !== unit.question || !ready ? `${code}-${unit.id}-q` : undefined}
					onChange={() => edit({ groupOff: on ? [...(ui.groupOff ?? []), unit.id] : (ui.groupOff ?? []).filter(id => id !== unit.id), claimConfirm: undefined })} /> {summary}</label>{why(unit.options[0])}</div>
				{/* The line names the shared summary when the options have one; otherwise the question is the line, said once. */}
				{(summary !== unit.question || !ready) && <p id={`${code}-${unit.id}-q`} className={ready ? 'muted wys-question' : 'warnline wys-question'}>{summary !== unit.question ? unit.question : ''}{!ready && `${summary !== unit.question ? ' (' : ''}Choose at least ${unit.min === 1 ? 'one' : unit.min}${summary !== unit.question ? ')' : ''}`}</p>}
				<div className="wys-options">{unit.options.map(option => <span key={option.id} className="wys-option"><label className="option"><input type="checkbox" checked={wys.picked.includes(option.changeId!)} disabled={off}
					onChange={() => toggle(option.changeId!)} /> {option.target || option.action}</label>{dismissButton(option)}</span>)}</div></div>
		}
		const unitOf = (unit: Unit) => unit.kind === 'line' ? line(unit.change) : group(unit)
		const openLeftCount = kept + openLines.length
		const extras = !!item.follow || !!nothingPosted || noVote || !!item.repaired || votes.length > 0
		// W11: a reply-only card gains one muted line and no control; a card with neither a reply nor a change keeps its own layout.
		if (!units.length && !dismissed.length && !openLeftCount && !extras && !leftLines.length) return draft && !item.sent ? <><p className="card-block muted wys-summary-line">When you send: just the reply</p>{earlierTodos}</> : undefined
		const named = will.flatMap(unit => unit.kind === 'line' ? wys.effective.includes(unit.change.changeId!) ? [unit.change.action] : [] : unit.options.filter(option => wys.effective.includes(option.changeId!)).map(option => option.action))
			.map(text => text.replace(/^./, first => first.toLowerCase()))
		const summaryText = `${draft ? 'When you send' : 'When you approve'}: ${[named.length ? `${named.slice(0, 2).join(', ')}${named.length > 2 ? ` +${named.length - 2}` : ''}` : draft ? 'just the reply' : '',
			suggested.length ? `${suggested.length} suggestion${suggested.length === 1 ? '' : 's'}` : '', openLeftCount ? `${openLeftCount} left for you` : ''].filter(Boolean).join(' · ')}`
		const needsEye = will.some(unit => unit.kind === 'group' && unit.options.filter(option => wys.picked.includes(option.changeId!)).length < unit.min) || !!claim || openLeftCount > 0 || !!item.reviewDone
		const open = ui.folds?.wys ?? needsEye
		return <section className="card-block card-after wys-block" role="region" aria-label={draft ? 'When you send' : 'When you approve'}>
			<button type="button" className="wys-summary" aria-expanded={open} onClick={() => fold('wys', !open)}><span>{summaryText}</span><span aria-hidden="true">{open ? '▾' : '▸'}</span></button>
			{open && <>
				{item.repaired && <p className="card-status">The comment format was wrong and is fixed. Post them now?</p>}
				{(will.length > 0 || votes.length > 0) && <div role="group" aria-labelledby={`${code}-wys-will`} className="wys-group-block"><h4 id={`${code}-wys-will`} className="wys-sub">{NAME} will · {will.length + votes.length}</h4>
					{will.map(unitOf)}
					{votes.map(change => <div className="change wys-line" key={change.id}><p>{change.action}</p><p className="muted">Only with its Approve button, never from this list.</p></div>)}</div>}
				{(suggested.length > 0 || dismissed.length > 0) && <div role="group" aria-labelledby={`${code}-wys-suggested`} className="wys-group-block"><h4 id={`${code}-wys-suggested`} className="wys-sub">Suggested · {suggested.length} <span className="wys-sub-hint">tick to include</span></h4>
					{suggested.map(unitOf)}{dismissed}</div>}
				{item.follow && <p><Icon name="clock" /> Watch {item.follow.target} until {item.follow.until}</p>}
				{nothingPosted && <p className="nothing-posted">{nothingPosted}</p>}
				{noVote && <p className="no-vote">On PR {replyPr} when you send: No vote{item.prReview && !item.prReview.voteRecommended ? ' (not ready)' : ''}</p>}
				{earlierTodos}
			</>}
		</section>
	})()

	// An approved batch that partly ran: one plain line above the actions says what was done and what was not, and why (queue-new #7D).
	const allChanges = [...new Set([...item.changeIds, ...(item.effectIds ?? [])])].map(id => entities.changes[id]).filter(Boolean)
	const made = allChanges.filter(change => change.state === 'made'), notDone = allChanges.filter(change => change.state !== 'made' && change.state !== 'left-out' && change.error)
	const doneSoFar = made.length > 0 && notDone.length > 0 && <p className="card-block done-so-far" role="status">
		<strong>Done:</strong> {made.map(change => change.action).join('; ')}. <strong>Not done:</strong> {notDone.map(change => `${change.action}, ${change.error!.replace(/\.$/, '').replace(/^Error: /, '')}`).join('; ')}.</p>

	// Block 4: one primary that says its result, Later, and ⋯ (Edit in Teams, Dismiss, Continue in a terminal).
	// WYS O6: the primary counts exactly the included changes ("Send reply" / "Send and make N change(s)" / "Make N change(s)").
	const changeWord = (n: number) => `${n} change${n === 1 ? '' : 's'}`
	const counted = wys && primary && ['approve', 'send-edit'].includes(primary.kind) ? draft ? wys.effective.length ? `Send and make ${changeWord(wys.effective.length)}`
		: primary.kind === 'send-edit' ? undefined : draft.holding ? 'Send holding reply' : 'Send reply' : wys.effective.length ? `Make ${changeWord(wys.effective.length)}` : 'Nothing selected' : undefined
	const primaryLabel = report && primary?.id === report.id ? `Draft the update to ${first}` : reviewLabel ?? counted ?? (draft?.holding && primary?.kind === 'approve' && !item.changeIds.length ? 'Send holding reply' : decision && primary?.kind === 'answer' ? 'Send decision'
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
			disabled={report && primary.id === report.id ? !ui.resultKind : !!invalid || newer || voteBlocked || claimBlocked || nothingChosen} disabledReason={newer ? 'stale' : voteBlocked ? voteReason : claimBlocked ? claim!.line : nothingChosen ? 'Tick a change first.' : report && primary.id === report.id ? 'Pick how it went first.' : primary.kind === 'pick' || item.choices && !ui.other ? 'pick' : 'Type your answer first.'} />}
		{primary?.kind === 'write-own' && writeButton}
		{reviewed?.openPr === 'primary' && openPr('default')}
		{approvePr && approvePr.id !== primary?.id && <ActionButton action={approvePr} disabled={newer} disabledReason="stale" />}
		{reviewed?.openPr === 'secondary' && openPr('outline')}
		{primary?.kind === 'todo-done' && doneButton(true)}
		{report && primary?.id !== report.id && <ActionButton primary action={report} label={`Draft the update to ${first}`} input={{ result: ui.resultKind, text: ui.report }} disabled={!ui.resultKind} disabledReason="Pick how it went first." />}
		{/* An offered send is never hidden: when another action leads, it sits next to it (#33). */}
		{actions.filter(action => ['approve', 'approve-again'].includes(action.kind) && action.id !== primary?.id).map(action => action.kind === 'approve' && editedAside ? <ActionButton key={editedAside.id} action={editedAside} label="Send your edited reply" input={{ text: replyText, ...selection }} disabled={newer || !replyText.trim() || editedHeld} disabledReason={newer ? 'stale' : editedHeld ? voteReason : 'Type your reply first.'} /> : <ActionButton key={action.id} action={action} label={draft?.holding && action.kind === 'approve' && !item.changeIds.length ? 'Send holding reply' : undefined} input={selection} disabled={newer || action.kind === 'approve' && (!!item.voteGap || claimBlocked)} disabledReason={newer ? 'stale' : item.voteGap?.text ?? claim?.line ?? 'stale'} />)}
		{actions.filter(action => ['try-again', 'one-more', 'review-again', 'send-anyway', 'redraft', 'add-vote', 'keep-waiting'].includes(action.kind) && action.id !== primary?.id && !((item.voteGap || ui.editing) && action.kind === 'send-anyway') && !(reviewed && action.kind === 'review-again')).map(action => <ActionButton key={action.id} action={action} input={action.kind === 'send-anyway' ? selection : undefined} disabled={newer && action.staleness === 'exact'} disabledReason="stale" />)}
		{primary?.kind !== 'write-own' && writeButton}
		{item.mode === 'held' && actions.filter(action => action.kind === 'dismiss' && action.label === 'Skip').map(action => <ActionButton key={action.id} action={action} disabled={newer && action.staleness === 'exact'} disabledReason="stale" />)}
		{actions.filter(action => action.kind === 'later').map(action => <ActionButton key={action.id} action={action} />)}
		{/* DD4-C1: under the report form's button, on its own row in the bar; it wraps at 400 px. */}
		{report && <p className="muted bar-note">{NAME} drafts it from your result. Nothing is sent until you press Send.</p>}
	</div>
	const moreMenu = <details ref={moreRef} className="card-more-menu"><summary aria-label="More" title="More: Edit in Teams, Dismiss, Continue in a terminal"><Icon name="more" /></summary><div className="card-more-content">
		{item.teams && draft && <Button variant="outline" title="Open Teams with this draft so you can change and send it there. Delegate sees that you replied." onClick={event => { closeMenuOf(event.currentTarget, true); void chatEdit.open(ui.editing ? ui.editText ?? draft.text : draft.text, item.teams!) }}>Edit in Teams</Button>}
		{actions.filter(action => ['dismiss', 'reply-only'].includes(action.kind) && !(item.mode === 'held' && action.kind === 'dismiss' && action.label === 'Skip')).map(action => <ActionButton onSubmitted={menuChosen} key={action.id} action={action} disabled={newer && action.staleness === 'exact'} disabledReason="stale" />)}
		{/* R10b: ⋯ Review again, unless new changes made it the primary. */}
		{reviewed && actions.filter(action => action.kind === 'review-again' && action.id !== primary?.id).map(action => <ActionButton onSubmitted={menuChosen} key={action.id} action={action} />)}
		{/* L1b: past a vote claim, Send anyway is in ⋯ and asks again with the same sentence. */}
		{/* V1 (PE 01:56): never while the editor differs from the draft; it would send the words he just removed. */}
		{item.voteGap && !ui.editing && actions.filter(action => action.kind === 'send-anyway' && action.id !== primary?.id).map(action => <ActionButton onSubmitted={menuChosen} key={action.id} action={action} input={selection} disabled={newer} disabledReason="stale" />)}
		{/* WYS O5: past the consistency check, Send anyway opens its confirm in the warn's slot. */}
		{claim && !ui.claimConfirm && claimTarget && <Button variant="outline" onClick={event => { closeMenuOf(event.currentTarget, false); edit({ claimConfirm: true }) }}>Send anyway</Button>}
		{item.ownReply && reopen && <div className="card-reopen"><Field code={code} rev={item.rev} field="answer" label="Reopen: what should the new reply say?" value={ui.answer ?? ''} edit={edit} rows={2} />
			<ActionButton onSubmitted={menuChosen} action={reopen} input={{ text: ui.answer ?? '' }} disabled={!ui.answer?.trim()} disabledReason="Write what the reply should say first." /></div>}
		{continueAction && <ActionButton onSubmitted={menuChosen} action={continueAction} />}
		{item.debug && <><pre>{item.debug.join('\n')}</pre><Button variant="outline" onClick={() => void detailsCopy.copy(item.debug!.join('\n'))}>Copy details</Button>{detailsCopy.message && <p role="status">{detailsCopy.message}</p>}</>}
	</div></details>
	const others = actions.filter(action => action.id !== primary?.id && action.id !== report?.id && !(report && action.id === declared?.id) && !['approve', 'approve-again', 'send-edit', 'answer', 'pick', 'ask', 'later', 'dismiss', 'continue', 'todo-done', 'reply-only', 'review-again', 'try-again', 'one-more', 'write-own', 'send-anyway', 'redraft', 'add-vote', 'approve-pr', 'post-waiting', 'keep-waiting'].includes(action.kind) && !(item.ownReply && action.kind === 'reopen'))
	// Every action the projection offers is drawn somewhere (engineer-card-state-devspec.md §4, invariant 4); one that isn't is marked.
	const drawn = (kind: string) => ({ answer: !!answerBox || !!decision || both || primary?.kind === 'answer', pick: !!item.choices, 'send-edit': !!draft && editable, 'todo-done': todoIds.length > 0 || openLines.length > 0 } as Record<string, boolean>)[kind] ?? true
	const undrawn = readOnly ? [] : actions.filter(action => !drawn(action.kind)).map(action => action.kind)

	// Block 5: Details, one collapsed line: why, sources, progress and history, changes already handled, and Ask Delegate.
	const hasWhy = !!(item.why.reason || item.why.waited || item.why.reviewWait || item.sent?.rule)
	const parts = [hasWhy && 'why', item.sourceIds.length > 0 && `${item.sourceIds.length} source${item.sourceIds.length === 1 ? '' : 's'}`, (work?.planIds.length || timeline?.stepIds.length || item.earlier) && 'history', `ask ${NAME}`].filter(Boolean)
	const sub = (key: string, title: string, inner: ReactNode) => <details className="card-subfold" open={ui.folds?.[key] ?? false} onToggle={event => fold(key, event.currentTarget.open)}><summary>{title}</summary>{inner}</details>
	const block5 = <details className="card-block card-details" open={ui.folds?.details ?? false} onToggle={event => fold('details', event.currentTarget.open)}><summary>Details: {parts.join(' · ')}</summary>
		{(hasWhy || item.why.confidence === 'low') && <h4>Why</h4>}
		{/* D-A281 B3: Why's first line, for a reply one of his lines sent. */}
		{item.sent?.rule && <p><SentBecause rule={item.sent.rule} /></p>}
		{item.why.reason && <p>{item.why.reason}</p>}
		{/* L6: never the word "Confidence"; only a low one is worth a line. */}
		{item.why.confidence === 'low' && <p>{NAME} isn&apos;t sure this reply is right.</p>}
		{item.why.waited && <p className="card-why-waited">{item.why.waited}</p>}
		{item.why.reviewWait && <p className="card-why-waited"><ReviewWait wait={item.why.reviewWait} /></p>}
		{/* D-COST JB1: Details › What it tried (N), for a stopped job. */}
		{item.stop?.tried?.length ? <details id={`stop-tried-${code}`} className="card-tried"><summary>What it tried ({item.stop.tried.length})</summary><ul>{item.stop.tried.map((route, n) => <li key={n}>{route}</li>)}</ul></details> : null}
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
		{item.used && <p className="muted card-used">{item.used}</p>}
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
		{block1(!readOnly && moreMenu)}{item.prs && item.prs.length >= 2 && <PrsInAsk code={code} prs={item.prs} entities={entities} readOnly={readOnly} newer={newer} />}{answered}{failed}{found}{item.mode === 'working' && writeBox && <section className="card-block card-write-own">{writeBox}</section>}<fieldset className="card-readonly" disabled={readOnly}>{perPr && perPrBlocks}{block2}{!perPr && reviewBlock}{wysBlock === undefined ? block3 : wysBlock}</fieldset>{wysBlock === undefined && earlierTodos}{doneSoFar}{!readOnly && block4}
		{/* R10b (joint C2): Approve's meaning line, always visible directly under the bar, whichever role Approve has. */}
		{!readOnly && approvePr?.meaning && <p className="muted approve-meaning">{approvePr.meaning}</p>}
		{/* D-COST JB1/JB2: the retry's caption under the bar (one press is one run, nothing is sent); at the daily limit, why it is off. */}
		{!readOnly && !!item.stop && (retry => retry && <p className="muted approve-meaning" role={retry.unavailable ? 'status' : undefined}>{retry.unavailable?.reason ?? retry.meaning}</p>)(actions.find(action => action.kind === 'try-again' || action.kind === 'one-more'))}
		{chatEdit.message && <p role="status">{chatEdit.message}</p>}
		{others.map(action => <div key={action.id}>{action.meaning && <p>{action.meaning}</p>}<ActionButton action={action} disabled={newer && action.staleness === 'exact' || action.effect !== 'local' && !action.meaning} disabledReason={newer ? 'stale' : undefined} /></div>)}
		{!readOnly && <ActionState item={code} rev={item.rev} />}
		{primary && primary.rev !== item.rev && <ActionState item={primary.item} rev={primary.rev} />}
		{block5}
	</article>
}

// D-A239 MP1 (Designer; PM §1 words, built on the server from HOST's typed units): "PRs in this ask (n)" directly after their message,
// when the ask names two or more PRs. One row per PR in ask order: PR <n> · title (clipped), the outcome as an icon plus words (never
// colour alone; a static spinner under reduced motion), ↗ Open PR, and the PR's own outline action at the end, named with its PR.
// MP5: a list named with its count; an outcome that changes while the card is open is announced once, politely; checking never is.
function PrsInAsk({ code, prs, entities, readOnly, newer }: { code: string; prs: NonNullable<Item['prs']>; entities: Entities; readOnly: boolean; newer: boolean }) {
	// PE §14.2: a couldn't-read PR is keyed by its line too, so a change of reason is one polite announcement; the same reason again is none.
	const key = (pr: NonNullable<Item['prs']>[number]) => pr.outcome === 'couldnt-read' ? `couldnt-read:${pr.line}` : pr.outcome
	const seen = useRef(new Map(prs.map(pr => [pr.pr, key(pr)]))), [said, setSaid] = useState('')
	useEffect(() => {
		const changed = prs.filter(pr => seen.current.get(pr.pr) !== undefined && seen.current.get(pr.pr) !== key(pr) && pr.outcome !== 'checking')
		seen.current = new Map(prs.map(pr => [pr.pr, key(pr)]))
		if (changed.length) setSaid(changed.map(pr => `PR ${pr.pr}: ${pr.line}`).join('. '))
	}, [prs])
	const mark = (outcome: NonNullable<Item['prs']>[number]['outcome']) => outcome === 'checking' ? <span className="pr-spin" aria-hidden="true" />
		: outcome === 'reviewing' || outcome === 'reviewed' ? <Icon name="check" /> : outcome === 'not-reviewing' ? <span aria-hidden="true">–</span> : <Icon name="warn" />
	return <section className="card-block card-prs" aria-labelledby={`prs-${code}`}><h3 id={`prs-${code}`}>PRs in this ask ({prs.length})</h3>
		<ul aria-label={`PRs in this ask, ${prs.length}`}>{prs.map(pr => <li key={pr.pr} className="pr-row" data-outcome={pr.outcome}>
			<span className="pr-name">PR {pr.pr}{pr.title && <><span aria-hidden="true"> · </span><span className="pr-title" title={pr.title}>{pr.title}</span></>}<span className="sr-only">,</span></span>
			<span className="pr-outcome" title={pr.detail}>{mark(pr.outcome)} {pr.line}</span>
			{pr.url && <a className="pr-open" href={pr.url} target="_blank" rel="noopener noreferrer" aria-label={`Open PR ${pr.pr} in a new tab`}><Icon name="ext" /> Open PR</a>}
			{!readOnly && !!pr.actionIds?.length && <span className="pr-actions">{pr.actionIds.map(id => entities.actions[id] && <ActionButton key={id} action={entities.actions[id]} ariaLabel={`${entities.actions[id].label}, PR ${pr.pr}`} disabled={newer} disabledReason="stale" />)}</span>}
		</li>)}</ul>
		<p className="sr-only" role="status" aria-live="polite">{said}</p>
	</section>
}

// A "Left for you" line from wf.left (PM A R35 (d)): what he does, a quote as a quotation, a muted source line (its link opens the
// thread, message or PR, ↗) with "· Why?" on a refusal, and one button at the right for its kind. Copy reply · open thread copies
// Delegate's suggested reply and opens the thread; it says so only when the copy really happened. An open line has its tick (decision
// 53: ticked lines go with "I've done these"); Ask Delegate again / Draft the invite again are HOST's line verbs (draft only).
function LeftLineRow({ line, tick, action: verb }: { line: NonNullable<Item['leftLines']>[number]; tick?: { checked: boolean; disabled: boolean; onChange: (on: boolean) => void }; action?: Entities['actions'][string] }) {
	const { href } = useScreenNavigation(), [copied, setCopied] = useState<'yes' | 'no'>()
	const button = line.button
	const action = !button ? null
		: button.kind === 'copy-reply' ? <Button variant="outline" size="sm" onClick={async () => { const ok = await copyText(button.text); setCopied(ok ? 'yes' : 'no'); window.open(button.href, '_blank', 'noopener,noreferrer') }}>Copy reply · open thread ↗</Button>
			: button.kind === 'settings' ? <a className="left-button" href={href(`settings/${button.key}`)}>Turn it on in Settings</a>
				: button.kind === 'open-pr' ? <a className="left-button" href={button.href} target="_blank" rel="noopener noreferrer">Open PR ↗</a>
					: verb ? <ActionButton action={verb} /> : null
	const source = line.source.href ? <a href={line.source.href} target="_blank" rel="noopener noreferrer" title="Opens where this came from, in a new tab.">{line.source.text} ↗</a> : line.source.text
	// Rule 5 seen-done: shown once, on the first visit after Delegate saw it done on the PR; no button, no tick.
	if (line.seen) return <li className="left-line left-seen todo-done-line" data-left-id={line.id} role="status"><Icon name="check" /> Done (seen on PR {line.seen.pr}): {line.text.replace(/[.\s]+$/, '')}<span className="todo-source">{source}</span></li>
	const words = <span className="left-text">{line.text}</span>
	return <li className={`left-line left-${line.type}`} data-left-id={line.id}>
		<div className="left-main">{tick ? <label className="left-tick"><input type="checkbox" checked={tick.checked} disabled={tick.disabled} onChange={event => tick.onChange(event.currentTarget.checked)} /> {words}</label> : words}{action}</div>
		{line.quote && <q className="left-quote">{line.quote.text}</q>}
		{line.why ? <details className="todo-source todo-why"><summary>{source} · Why?</summary><p>{line.why}.</p></details> : <span className="todo-source">{source}</span>}
		{copied && <p className="todo-source" role="status">{copied === 'yes' ? 'Reply copied: paste it in the thread.' : "Couldn't copy"}</p>}
	</li>
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

type Change = Entities['changes'][string]
// WYS N1-1 (I32, O6): what Send names on an origin-bearing item. picked is his ticks (or the defaults: asked/promised/note/rule, not in a
// group, plus changes already approved); an option group counts only once enough of its options are picked and its line is on. Votes
// are never in it (their own Approve, L1). Undefined for old originless items (R4).
export function wysSelection(item: Item | undefined, entities: Entities | undefined, ui: CardUi, dismissing: Record<string, SuggestionHold> = {}) {
	if (item?.wys !== 'groups' || !entities) return undefined
	const changes = item.changeIds.map(id => entities.changes[id]).filter((change): change is Change => !!change?.changeId)
	// A suggestion he is turning down (✕, held 6 s) is neither shown nor sent.
	const held = changes.filter(change => !!dismissing[`${item.code}|${change.changeId}`])
	const choosable = changes.filter(change => !change.vote && !held.includes(change))
	const picked = ui.included ?? choosable.filter(change => change.ticked || change.state === 'approved').map(change => change.changeId!)
	const minOf = (group: string) => Math.max(...choosable.filter(change => change.group?.id === group).map(change => change.group!.min))
	const ready = (group: string) => picked.filter(id => choosable.find(change => change.changeId === id)?.group?.id === group).length >= minOf(group)
	const effective = picked.filter(id => { const change = choosable.find(other => other.changeId === id); return !!change && (!change.group || ready(change.group.id) && !ui.groupOff?.includes(change.group.id)) })
	return { changes, choosable, picked, effective, held: held.map(change => ({ change, hold: dismissing[`${item.code}|${change.changeId}`] })) }
}
