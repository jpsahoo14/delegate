import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useAction, useEntities } from '../data/hooks.ts'
import { IDLE, useData, type CardUi } from '../data/store.ts'
import { pendingSubmissions } from '../services/pending.ts'
import { revisionKey, type Action, type Entities } from '../domain/contracts.ts'
import { openRoute } from '../data/result-line.ts'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { comments, wddLink, wddOutcome, wddPlanned, wddUndoFailed, wddWhat, wddWhere, wddWhy, wddWords, type WddRow as Row } from '../domain/wdd-words.ts'
import { SentTime } from './SentTime.tsx'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { Button } from '../components/ui/button.tsx'
import './wdd.css'

// WDD N2 display (Designer D2/D5/D8; PM rounds 1-3): one row per action on one item, the same in Now's Done for you and in Done › By
// Delegate, New and Classic.
// 1. ✦ (never the asker's avatar), what was done, where, when, ↗ to the posted message, Taken back, New.
// 2. The exact words that went out, 2 lines, then Show all in place.
//    PM FINAL B2: a reply, ack or reminder that failed or couldn't be confirmed says so on line 1 ("Couldn't reply to…", "Couldn't
//    confirm…", with Check ↗ to the chat instead of ↗), and line 2 labels its words as planned ("Not sent: <reason>. It was going to say: ").
// 3. Why it was allowed (or what Stop doing this did), › to that line in Your way of working or to the reminder.
// Actions (D2.4, at most 2, right-aligned, no primary): Not right? (its "It shouldn't have done this by itself" › Stop doing this now; Wrong /
// Incomplete come with HOST H3), the Undo of a stop for 6 s, and (N2, D8 O1) the send's own Undo while its window is open, through
// SEND's W4 page binding and HOST's H0 runner.
export function WddRow({ row, fresh, open = false, classic = false }: { row: Row; fresh: boolean; open?: boolean; classic?: boolean }) {
	const entities = useEntities(), { href } = useScreenNavigation()
	const what = wddWhat(row), words = wddWords(row), link = wddLink(row), why = wddWhy(row), parts = row.kind === 'review' ? row.parts : []
	const item = row.itemOpen && row.item ? openRoute(entities, row.item, classic ? 'classic' : 'new') : undefined
	const titleId = `wdd-what-${row.id}`
	const lineLink = why.to && 'line' in why.to ? why.to.line : undefined
	return <article className="wdd-row" id={`wdd-${row.id}`} data-wdd={row.id} aria-labelledby={titleId} tabIndex={-1}>
		<p className="wdd-line1">
			<span className="wdd-what"><span className="wdd-mark" aria-hidden="true">✦ </span><span id={titleId}>{what}</span></span>
			<span className="wdd-meta"> · {wddWhere(row)} · <SentTime at={row.at} />{link && <> <a href={link} target="_blank" rel="noopener noreferrer" aria-label={`Open what was sent in ${row.chat.group ? row.chat.name : 'Teams'}`}>↗</a></>}
				{row.check && <> <a href={row.check} target="_blank" rel="noopener noreferrer" aria-label={`Check ${row.chat.group ? row.chat.name : 'the chat'} in Teams`}>Check ↗</a></>}</span>
			{row.undone && <span className="wdd-tag">Taken back · <SentTime at={row.undone.at} /></span>}
			{fresh && <span className="chip wdd-new">New</span>}
		</p>
		{words && <Words text={words} lead={wddPlanned(row)} />}
		<p className="wdd-why">{lineLink ? <a href={href('settings/ways')} onClick={() => setTimeout(() => document.getElementById(`way-${lineLink}`)?.scrollIntoView({ block: 'center' }), 0)}>{why.text} ›</a>
			: why.to && 'reminder' in why.to ? <a href={href(classic ? 'ongoing/automations' : 'now/waiting')}>{why.text} ›</a> : why.text}</p>
		{row.undoFailed && <p className="wdd-warn" role="note">{wddUndoFailed(row.undoFailed.why, !!actionOf(row, entities, 'wdd-wrong'))}</p>}
		<div className="wdd-actions"><StopUndo row={row} /><ReminderUndo row={row} /><SendUndo row={row} /><NotRight row={row} /></div>
		<SendUndoState row={row} />
		{item && <p className="wdd-open"><a href={`#${item}`}>{!row.undone ? 'Waiting for your approval ›' : draftWaits(entities, row.item!) ? 'The draft is in Waiting on you ›' : 'Open ›'}</a></p>}
		{parts.length > 1 && <details className="wdd-parts" open={open}><summary>Show the {parts.length} parts</summary><ul>{parts.map((part, n) => <li key={n}>
			{[part.severity, part.file ? `${part.file}${part.line ? `:${part.line}` : ''}` : undefined].filter(Boolean).map(text => <span key={text} className="wdd-part-meta">{text} · </span>)}
			<span className="wdd-part-text">{part.kind === 'message' ? 'Reply' : part.text.split('\n')[0]}</span>
			{part.link && <> · <a href={part.link} target="_blank" rel="noopener noreferrer">{part.kind === 'message' ? 'Open' : 'Thread'} ↗</a></>}
			<span className={`wdd-outcome${part.outcome === 'posted' ? '' : ' wdd-outcome-warn'}`}> · {wddOutcome(part)}{part.outcome === 'unconfirmed' && part.link && <> · <a href={part.link} target="_blank" rel="noopener noreferrer">Check ↗</a></>}</span>
		</li>)}</ul>{comments(row).length > 0 && <p className="muted">What was already posted stays on the PR.</p>}</details>}
	</article>
}

// CR 17:09:59 B8: a taken-back row says "The draft is in Waiting on you" only when the page proves it: the item has its current draft and
// sits in Waiting on you. An item open for anything else (waiting on a job or the sender, a question without a draft, a newer turn the
// runner left alone) gets the neutral Open link instead.
const draftWaits = (entities: Entities, code: string) => {
	const draftId = entities.items[code]?.draftId
	return !!draftId && !!entities.drafts[draftId] && Object.values(entities.placements).some(placement => placement.subjects.includes(code) && placement.section === 'move')
}

// Line 2: at most 2 lines, then Show all in place (D2.2).
function Words({ text, lead }: { text: string; lead?: string }) {
	const box = useRef<HTMLParagraphElement>(null), [all, setAll] = useState(false), [long, setLong] = useState(false)
	useLayoutEffect(() => { const el = box.current; if (el && !all) setLong(el.scrollHeight > el.clientHeight + 1) }, [text, all])
	return <div className="wdd-words-box"><p ref={box} className={`wdd-words${all ? '' : ' wdd-clamp'}`}>{lead}&quot;{text}&quot;</p>
		{(long || all) && <button type="button" className="link-button" aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'Show less' : 'Show all'}</button>}</div>
}

// PM FINAL 1:1 scope (14:37:26): in a 1:1 the chat scope names it "your 1:1 with <first>", never the person as if a chat. With no
// recorded person, the chat's first word, the reviewed preview provider's own fallback (CR 14:59:03 nit).
const place = (row: Row) => (row.chat.group ? row.chat.name : `your 1:1 with ${row.to ?? row.chat.name.trim().split(/\s+/)[0]}`)
const scopes = (row: Row): { value: 'chat' | 'person' | 'never'; label: string }[] => row.kind === 'review'
	? [...(row.to ? [{ value: 'person' as const, label: `Not for ${row.to}'s PRs` }] : []), { value: 'chat', label: `Not in ${place(row)}` }, { value: 'never', label: 'Turn off your PR-review line' }]
	: [{ value: 'chat', label: `Only in ${place(row)}` }, ...(row.to ? [{ value: 'person' as const, label: `For ${row.to}, anywhere` }] : []), { value: 'never', label: 'Never reply by itself' }]

// D3/D8: Not right? opens inline under the row; focus moves to its first choice and Esc returns it to the button. The scope defaults to
// the narrowest offered (the chat). Cancel changes nothing. PE v1.140: each radio's second line is what pressing would write, from the
// projection's preview (SEND's stopPreview): the added line in quotes, or "Turns off: "<his line>""; a scope with no preview is not offered.
const actionOf = (row: Row, entities: Entities, kind: string) => row.actionIds?.map(id => entities.actions[id]).find(action => action?.kind === kind)
type Offers = { wrong?: Action; incomplete?: Action; stop?: Action; pause?: Action; end?: Action; offered: ReturnType<typeof scopes>; preview: Row['preview'] }
const hasChoice = (o: Offers) => !!(o.wrong || o.incomplete || o.stop && o.offered.length || o.pause || o.end)
// D3 + Designer 17:19:58: Not right? lists only the choices this row offers, in D3's order: Wrong and Incomplete (H3(a), the item's current
// sent reply), then "It shouldn't have done this by itself" (the line's scopes, or a reminder's Pause / End, H3(b)). With none it isn't
// drawn. It is never removed while it or its open panel holds focus: the last offers stay, and a press on a changed record gets the
// existing exact-revision refusal.
function NotRight({ row }: { row: Row }) {
	const entities = useEntities()
	const live: Offers = { wrong: actionOf(row, entities, 'wdd-wrong'), incomplete: actionOf(row, entities, 'wdd-incomplete'), stop: actionOf(row, entities, 'wdd-stop'),
		pause: actionOf(row, entities, 'wdd-pause'), end: actionOf(row, entities, 'wdd-end'), offered: scopes(row).filter(choice => row.preview?.[choice.value]), preview: row.preview }
	const [open, setOpen] = useState(false), [focused, setFocused] = useState(false), [picked, setScope] = useState<'chat' | 'person' | 'never'>()
	const [choice, setChoice] = useState<'wrong' | 'incomplete' | 'stop'>(), [note, setNote] = useState('')
	// CR 19:52:50 B2: while the button holds focus or the panel is open, what it shows (choices, actions, their revisions, previews) is
	// held as it was when it took focus or opened, so a partial or full withdrawal never switches the choice or drops a focused field; a
	// press on a changed record gets the existing exact-revision refusal.
	const held = useRef<Offers | undefined>(undefined)
	if (!(open || focused)) held.current = undefined
	else held.current ??= live
	const { wrong, incomplete, stop, pause, end, offered, preview } = held.current ?? live
	// E5: "Also take this reply back" is drawn only while the row shows its own Undo (O1's eligibility: the offer, its window, and not a
	// take-back the runner couldn't record). Unticked until he ticks it.
	const undo = undoOf(row, entities), undoUi = useUndoUi(row, undo), act = useAction(), [also, setAlso] = useState(false), [, tick] = useState(0)
	const until = row.undoUntil ? Date.parse(row.undoUntil) : 0, undoOpen = !!undo && until > Date.now() && !unrecorded(undoUi)
	useEffect(() => { if (!open) { setAlso(false); setNote(''); setChoice(undefined) } }, [open])
	useEffect(() => { if (open && until > Date.now()) { const timer = setTimeout(() => tick(n => n + 1), until - Date.now()); return () => clearTimeout(timer) } }, [open, until])
	// CR 15:24:37 B6: a valid pick stays; otherwise the narrowest, the chat (a review lists the person first), then whatever is offered.
	const scope = offered.some(choice => choice.value === picked) ? picked! : offered.find(choice => choice.value === 'chat')?.value ?? offered[0]?.value
	const third = !!(stop && scope) || !!(pause || end)
	const choices = [...(wrong ? ['wrong' as const] : []), ...(incomplete ? ['incomplete' as const] : []), ...(third ? ['stop' as const] : [])]
	const current = choice && choices.includes(choice) ? choice : choices[0]
	const button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLFieldSetElement>(null)
	useEffect(() => { if (open) panel.current?.querySelector<HTMLInputElement>('input')?.focus() }, [open])
	// The panel closes only on Cancel / Esc or this panel's own accepted press, never because other state arrived (another tab's stop). Focus
	// returns to Not right?, or to the row when no opener remains.
	// After his own accepted press the choice is done: focus rests on the row (not on Not right?, which may be leaving with its offers;
	// holding it there would move the next control, such as the stop's Undo, under his pointer).
	// CR 22:21:19 / 22:42:56 B2: "this panel's own accepted press" is its actual submission: the id useAction reports when THIS press creates
	// a new submission (onSubmitted, after its guards and storage; a refused, restored or replayed click reports none, so nothing is
	// watched), with the panel's open generation. Only that submission's own
	// accepted receipt, while the same opening of the panel is still open, closes it. Cancel / Esc, or the submission ending without its
	// receipt (an error, a release), disarm only this watcher; the submission itself, pending or in flight, is never touched.
	const generation = useRef(0)
	const [press, setPress] = useState<{ key: string; submission: string; generation: number }>()
	const close = (done = false) => { setPress(undefined); setOpen(false); requestAnimationFrame(() => done ? document.querySelector<HTMLElement>(`[data-wdd="${row.id}"]`)?.focus() : button.current ? button.current.focus() : focusOn(row.id)) }
	const watched = useData(state => press ? state.byRevision[press.key] ?? IDLE : IDLE)
	useEffect(() => {
		if (!press || watched.pending?.submissionId === press.submission) return
		setPress(undefined)
		const r = watched.result
		if (r?.submissionId === press.submission && r.accepted && !r.refused && !r.uncertain && open && press.generation === generation.current) close(true)
	}, [press, watched])
	const submitted = (action: Action) => (submission: string) => setPress({ key: revisionKey(action.item, action.rev), submission, generation: generation.current })
	if (!current) return null
	const feedback = current === 'wrong' ? wrong : current === 'incomplete' ? incomplete : undefined
	const shownAction = feedback ?? (stop && scope ? stop : pause ?? end)
	const cancel = <Button variant="ghost" onClick={() => close()}>Cancel</Button>
	return <>
		{!open && <Button ref={button} data-not-right variant="ghost" aria-expanded={false} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} aria-label={`Not right? ${row.to ? `${row.kind === 'review' ? 'Review for' : 'Reply to'} ${row.to} ` : ''}${row.chat.group ? `in ${row.chat.name}` : ''}`.trim()} onClick={() => { setFocused(false); generation.current += 1; setOpen(true) }}>Not right?</Button>}
		{open && <fieldset ref={panel} className="wdd-not-right" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close() } }}>
			<legend>Not right?</legend>
			<div role="radiogroup" aria-label="What was not right">
				{wrong && <label className="option"><input type="radio" name={`wdd-why-${row.id}`} checked={current === 'wrong'} onChange={() => setChoice('wrong')} /><span>Wrong<span className="wdd-scope-line">Draft a correction</span></span></label>}
				{incomplete && <label className="option"><input type="radio" name={`wdd-why-${row.id}`} checked={current === 'incomplete'} onChange={() => setChoice('incomplete')} /><span>Incomplete<span className="wdd-scope-line">Draft what was missing</span></span></label>}
				{third && <label className="option"><input type="radio" name={`wdd-why-${row.id}`} checked={current === 'stop'} onChange={() => setChoice('stop')} />It shouldn&apos;t have done this by itself</label>}
			</div>
			{feedback && <>
				<label className="wdd-note">Note (optional)<textarea rows={2} value={note} onChange={event => setNote(event.target.value)} /></label>
				<p className="muted">Drafts a follow-up for your approval. Nothing is sent yet.</p>
				<div className="action-bar"><ActionButton action={feedback} input={note.trim() ? { text: note.trim() } : undefined} onSubmitted={submitted(feedback)} label={current === 'wrong' ? 'Draft a correction' : 'Draft what was missing'} />{cancel}</div>
			</>}
			{current === 'stop' && stop && scope && <>
				<div className="wdd-scopes" role="radiogroup" aria-label="Where to stop">{offered.map(choice => (plan => <label className="option" key={choice.value}>
					<input type="radio" name={`wdd-scope-${row.id}`} checked={scope === choice.value} onChange={() => setScope(choice.value)} />
					<span>{choice.label}<span className="wdd-scope-line">{plan.mode === 'turned-off' ? `Turns off: "${plan.text}"` : `"${plan.text}"`}</span></span></label>)(preview![choice.value]!))}</div>
				<p className="muted">{row.kind === 'review' ? 'What was already posted stays on the PR.' : 'What was already sent stays.'}</p>
				{undoOpen && <label className="option wdd-also"><input type="checkbox" checked={also} onChange={event => setAlso(event.target.checked)} />Also take this reply back</label>}
				<div className="action-bar"><ActionButton action={stop} input={{ text: scope }} onSubmitted={submitted(stop)} prepareInput={() => { if (also && undo && until > Date.now() && !knownUnrecorded(row.id)) armAlsoUndo(row, stop, undo, act); return { text: scope } }} />{cancel}</div>
			</>}
			{current === 'stop' && !(stop && scope) && (pause || end) && <>
				<p className="muted">What was already sent stays.</p>
				<div className="action-bar">{pause && <ActionButton action={pause} onSubmitted={submitted(pause)} />}{end && <ActionButton action={end} onSubmitted={submitted(end)} />}{cancel}</div>
			</>}
			{shownAction && <ActionState item={shownAction.item} rev={shownAction.rev} />}
		</fieldset>}
	</>
}

// H3(b): after his Pause or End, the reminder's Undo (the page resume) for the offer's 6 s; when it goes while it has focus, focus moves on
// to Not right? (else the row), as the send's Undo does.
function ReminderUndo({ row }: { row: Row }) {
	const entities = useEntities(), undo = actionOf(row, entities, 'wdd-reminder-undo'), until = undo?.expiresAt ? Date.parse(undo.expiresAt) : 0
	const box = useRef<HTMLSpanElement>(null), [, tick] = useState(0)
	useEffect(() => {
		if (!until || until <= Date.now()) return
		const timer = setTimeout(() => { const had = !!box.current?.contains(document.activeElement); tick(n => n + 1); if (had) focusOn(row.id) }, until - Date.now())
		return () => clearTimeout(timer)
	}, [until, row.id])
	return undo && until > Date.now() ? <span ref={box}><ActionButton action={undo} ariaLabel={`Undo: turn the reminder back on`} /></span> : null
}
const focusOn = (row: string) => requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-wdd="${row}"] [data-not-right]`) ?? document.querySelector<HTMLElement>(`[data-wdd="${row}"]`))?.focus())

// D8: after Stop doing this, line 3 reads what it did, with Undo for 6 s (the existing delete / turn-on of the returned line).
function StopUndo({ row }: { row: Row }) {
	const entities = useEntities(), undo = row.actionIds?.map(id => entities.actions[id]).find(action => action?.kind === 'wdd-stop-undo')
	const had = useRef(!!row.stopped), [until, setUntil] = useState(0), box = useRef<HTMLSpanElement>(null)
	useEffect(() => {
		// Designer 17:19:58 NR5: when its 6 s end while it has focus, focus moves on to Not right? (else the row), never the page.
		if (row.stopped && !had.current) { setUntil(Date.now() + 6000); const timer = setTimeout(() => { const kept = !!box.current?.contains(document.activeElement); setUntil(0); if (kept) focusOn(row.id) }, 6000); had.current = true; return () => clearTimeout(timer) }
		had.current = !!row.stopped
	}, [!!row.stopped])
	return undo && until > Date.now() ? <span ref={box}><ActionButton action={undo} ariaLabel={`Undo: ${row.stopped?.mode === 'turned-off' ? 'turn your line back on' : 'remove the new line'}`} /></span> : null
}

// N2 (D8 O1; PE v1.137 item 3): the send's Undo with its countdown while the record's window is open; "Taking it back…" while the runner
// works. It disappears exactly at undo.until, and focus moves on to Not right? (else the row) if it had it. "Taken back" and "Couldn't
// take it back: <reason>" are the ledger's (the row's undone / undoFailed); the receipt's typed `outcome.undo` decides the rest, never
// its text. A result the runner couldn't record (recorded: false) takes Undo away and claims nothing on the row: SEND's Health hold says it.
const undoOf = (row: Row, entities: Entities) => row.actionIds?.map(id => entities.actions[id]).find(action => action?.kind === 'wdd-undo')
// CR 17:09:59 B7: the Undo a row submitted keeps reading its own slot (the item@rev useAction recorded it under) after the offer is revised
// or withdrawn at expiry, so a late, refused or failed answer still lands on its row. Kept per row outside the component, so the row on
// Now and in Done › By Delegate read the same click. Never the empty slot; the current offer alone decides whether Undo shows or is sent.
// CR 18:12:11 B7: what was submitted (item, action, rev, and the window's end it was pressed in) is also kept in tab storage, like the
// pending clicks themselves, so after a reload or a remount with no live offer the restored click and its result still reach the row,
// and a reasonless late refusal still has its deadline. Reading it never depends on the current offer; it never sends anything.
type Sent = { item: string; id: string; rev?: string; until?: string }
const SENT_KEY = 'delegate-react-wdd-undo-v1', undoSent = new Map<string, Sent>()
let hydrated = false
const isSent = (value: unknown): value is Required<Pick<Sent, 'item' | 'id' | 'rev'>> & Sent => !!value && typeof value === 'object' &&
	typeof (value as Sent).item === 'string' && typeof (value as Sent).id === 'string' && typeof (value as Sent).rev === 'string' && ['string', 'undefined'].includes(typeof (value as Sent).until)
function storedSent(): Record<string, Sent> {
	let raw: string | null
	try { raw = sessionStorage.getItem(SENT_KEY) } catch (error) { console.error('Could not read the Undos that were sent:', error); return {} }
	if (raw === null) return {}
	// CR 18:42:18 nit: missing is empty; anything unreadable is said, never silently taken for empty.
	try {
		const value: unknown = JSON.parse(raw)
		if (!value || typeof value !== 'object' || Array.isArray(value)) { console.error('The saved Undos that were sent are unreadable; they are ignored.'); return {} }
		const entries = Object.entries(value), readable = entries.filter(([, sent]) => isSent(sent))
		if (readable.length < entries.length) console.error(`${entries.length - readable.length} saved Undo record(s) are unreadable; they are ignored.`)
		return Object.fromEntries(readable)
	} catch (error) { console.error('The saved Undos that were sent are unreadable; they are ignored.', error); return {} }
}
function sentOf(row: string): Sent | undefined {
	if (!hydrated) { hydrated = true; for (const [id, sent] of Object.entries(storedSent())) if (!undoSent.get(id)?.rev) undoSent.set(id, sent) }
	return undoSent.get(row)
}
// CR 18:42:18 B7: the window's end only ends eligibility, never the lookup of a click still unresolved. A record is dropped (a day past its
// window) only when no saved pending click is on its item@rev; if the pending clicks can't be read, nothing is dropped.
function keepSent(row: string, sent: Sent) {
	undoSent.set(row, sent)
	try {
		const all = storedSent(), old = new Date(Date.now() - 86_400_000).toISOString()
		let unresolved: Set<string> | undefined
		try { unresolved = new Set(pendingSubmissions().map(entry => revisionKey(entry.item, entry.rev))) } catch (error) { console.error('Could not read the pending clicks; no saved Undo is dropped:', error) }
		if (unresolved) for (const [id, kept] of Object.entries(all)) if ((!kept.until || kept.until < old) && !(kept.rev !== undefined && unresolved.has(revisionKey(kept.item, kept.rev)))) delete all[id]
		sessionStorage.setItem(SENT_KEY, JSON.stringify({ ...all, [row]: sent }))
	} catch (error) { console.error('Could not keep the Undo that was sent:', error) }
}
function useUndoUi(row: Row, undo: Action | undefined): CardUi {
	if (undo && (sentOf(row.id)?.id !== undo.id || sentOf(row.id)?.item !== undo.item)) undoSent.set(row.id, { item: undo.item, id: undo.id })
	const key = useData(state => {
		const sent = sentOf(row.id)
		if (!sent) return ''
		if (sent.rev !== undefined) return revisionKey(sent.item, sent.rev)
		// A click restored after a reload: its saved pending entry names the action.
		const restored = Object.entries(state.byRevision).find(([key, ui]) => key.startsWith(`${sent.item}@`) && ui.pending?.action === sent.id)?.[0]
		return restored ?? (undo ? revisionKey(undo.item, undo.rev) : '')
	})
	useEffect(() => {
		const sent = sentOf(row.id)
		if (sent && sent.rev === undefined && key.startsWith(`${sent.item}@`) && useData.getState().byRevision[key]?.pending?.action === sent.id)
			keepSent(row.id, { ...sent, rev: key.slice(sent.item.length + 1), ...(undo?.expiresAt ?? row.undoUntil ? { until: undo?.expiresAt ?? row.undoUntil } : {}) })
	}, [key, row.id])
	return useData(state => key ? state.byRevision[key] ?? IDLE : IDLE)
}
const sentOn = (row: Row, undo: Action) => () => { keepSent(row.id, { item: undo.item, id: undo.id, rev: undo.rev, ...(undo.expiresAt ?? row.undoUntil ? { until: undo.expiresAt ?? row.undoUntil } : {}) }); return undefined }
// O1's own suppression: a take-back whose result the runner couldn't record (recorded: false) takes Undo away. CR 18:22:50 E5 B1: the same
// test gates the row's Undo, E5's box, its press-time arming and its chained send, so E5 never offers what O1 removed.
const unrecorded = (ui: CardUi) => ui.result?.outcome?.undo?.recorded === false
function knownUnrecorded(row: string, state = useData.getState()) {
	const sent = sentOf(row)
	return !!sent?.rev && unrecorded(state.byRevision[revisionKey(sent.item, sent.rev)] ?? IDLE)
}

// E5 (PE v1.150, binding (a)): "Also take this reply back" is one press, two exact requests in order, from the page alone.
// 1. Stop doing this is sent as always. 2. Only an accepted, applied stop (not refused, uncertain or still queued) goes on; any other
// result sends no Undo, and the row's own Undo stays. 3. The stop's `stopped` amendment changes the record's approval revision, so
// the Undo waits for refreshed page data and sends that refreshed offer for the same record, never the pre-stop revision (the
// delete target, chat and message, is the record's and cannot change). 4. If the window closed meanwhile, nothing is sent and the
// row reads "Too late to take it back" beside "Stopped: …"; the stop is never rolled back. Not kept across a reload.
type Act = ReturnType<typeof useAction>
type Chain = { stop: string; stopId: string; before?: string; submission?: string; undo: string; preRev: string; until: number; act: Act; seen?: string
	phase: 'stopping' | 'refresh' | 'sent' | 'late' | 'dropped' }
const useChains = create<Record<string, Chain>>(() => ({}))
const setChain = (id: string, change: Partial<Chain>) => useChains.setState(chains => chains[id] ? { [id]: { ...chains[id]!, ...change } } : {})
let driving = false
function armAlsoUndo(row: Row, stop: Action, undo: Action, act: Act) {
	const key = revisionKey(stop.item, stop.rev), before = useData.getState().byRevision[key]?.pending?.submissionId
	useChains.setState({ [row.id]: { stop: key, stopId: stop.id, before, undo: undo.id, preRev: undo.rev, until: Date.parse(undo.expiresAt ?? row.undoUntil ?? ''), act, phase: 'stopping' } })
	// The press's own click is set pending synchronously by useAction right after this; a refused click (busy, guard) never is.
	queueMicrotask(() => {
		const pending = useData.getState().byRevision[key]?.pending
		setChain(row.id, pending?.action === stop.id && pending.submissionId !== before ? { submission: pending.submissionId } : { phase: 'dropped' })
		driveChains()
	})
	if (!driving) { driving = true; useData.subscribe(driveChains) }
}
function driveChains() {
	const state = useData.getState()
	for (const [id, chain] of Object.entries(useChains.getState())) {
		if (chain.phase === 'stopping' && chain.submission) {
			const ui = state.byRevision[chain.stop]
			if (ui?.pending?.submissionId === chain.submission) { if (ui.pending.phase !== 'submitting') setChain(id, { phase: 'dropped' }); continue }
			const r = ui?.result
			setChain(id, r?.submissionId === chain.submission && r.accepted && r.applied && !r.refused && !r.uncertain ? { phase: 'refresh', seen: state.snapshot?.fetchedAt } : { phase: 'dropped' })
		} else if (chain.phase === 'refresh') {
			const snapshot = state.snapshot
			if (!snapshot || snapshot.fetchedAt === chain.seen) continue
			const row = snapshot.wdd?.rows.find(row => row.id === id), offer = row?.actionIds?.includes(chain.undo) ? state.entities.actions[chain.undo] : undefined
			if (row?.undone || row?.undoFailed || knownUnrecorded(id, state)) setChain(id, { phase: 'dropped' })
			else if (offer && offer.rev !== chain.preRev && Date.now() < Date.parse(offer.expiresAt ?? '')) {
				setChain(id, { phase: 'sent' })
				keepSent(id, { item: offer.item, id: offer.id, rev: offer.rev, ...(offer.expiresAt ? { until: offer.expiresAt } : {}) })
				void chain.act(offer)
			} else if (!offer && row?.stopped || Date.now() >= chain.until) setChain(id, { phase: 'late' })
		}
	}
}

function SendUndo({ row }: { row: Row }) {
	const entities = useEntities(), undo = undoOf(row, entities), ui = useUndoUi(row, undo)
	const box = useRef<HTMLSpanElement>(null), until = row.undoUntil ? Date.parse(row.undoUntil) : 0, [, tick] = useState(0)
	useEffect(() => {
		if (!until || until <= Date.now()) return
		const timer = setTimeout(() => {
			const had = !!box.current?.contains(document.activeElement)
			tick(n => n + 1)
			if (had) requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-wdd="${row.id}"] [data-not-right]`) ?? document.querySelector<HTMLElement>(`[data-wdd="${row.id}"]`))?.focus())
		}, until - Date.now())
		return () => clearTimeout(timer)
	}, [until, row.id])
	if (!undo || !until || until <= Date.now() || unrecorded(ui)) return null
	return <span ref={box}><ActionButton action={undo} pendingLabel="Taking it back…" prepareInput={sentOn(row, undo)} /></span>
}
function SendUndoState({ row }: { row: Row }) {
	const entities = useEntities(), undo = undoOf(row, entities), ui = useUndoUi(row, undo), chained = useChains(chains => chains[row.id]?.phase === 'late')
	// The deadline is the one the Undo was pressed in (kept with what was sent), so a remount after expiry still knows it.
	const deadline = sentOf(row.id)?.until
	const r = ui.result, late = r?.outcome?.undo?.reason === 'too-late' || r?.outcome?.kind === 'refused' && !r.outcome.undo && !!r.at && !!deadline && r.at >= deadline
		|| chained
	if (row.undone || row.undoFailed) return null
	return <>{late && <p className="wdd-warn" role="status">Too late to take it back</p>}{ui.error && <p className="wdd-warn" role="alert">{ui.error}</p>}</>
}
