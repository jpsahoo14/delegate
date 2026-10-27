import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { revisionKey, type Action, type Snapshot } from '../domain/contracts.ts'
import { useData } from '../data/store.ts'
import { useAction, useEntities, useSnapshot } from '../data/hooks.ts'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { when } from '../domain/time.ts'
import { NAME } from '../brand.ts'
import './ways.css'

// R12b (joint C1 + C3 + A11; PE A R28): Settings › Your way of working. Everything a row says (its three lines, its status, its group)
// comes from SEND's ways.ts through the snapshot; this file only lays it out and maps each control to its one engine verb. New and
// Classic draw the same section.
type Ways = NonNullable<Snapshot['ways']>
type Line = Ways['lines'][number]
type Suggestion = NonNullable<Ways['open']>
const SOURCE: Record<Line['source'], string> = { owner: 'You wrote', learned: 'Learned from what you do', setting: 'From Settings' }
const UNDO_MS = 6_000
export const wayKey = (id: string) => `way:${id}`
export const suggestionKey = (id: string) => `way-suggestion:${id}`
export const noteKey = (id: string) => `way-note:${id}`

// Runs a verb and says whether the engine accepted it, so a box keeps his text on a refusal (WAY_CHANGED: "your text is kept").
function useAccepted() {
	const act = useAction()
	return async (action: Action, input?: { text?: string }) => {
		await act(action, input)
		const result = useData.getState().byRevision[revisionKey(action.item, action.rev)]?.result
		// The engine's receipt when it accepted (truthy), else false.
		return !!result?.accepted && !result.refused && (result.text || true)
	}
}
// Scrolls to a line and flashes it briefly (a Conflict's other line; the line an accepted suggestion added).
function flashLine(id: string) {
	const target = document.getElementById(`way-${id}`)
	target?.scrollIntoView({ block: 'center' }); target?.classList.add('ways-flash'); setTimeout(() => target?.classList.remove('ways-flash'), 1600)
}
function useWayActions() {
	const snapshot = useSnapshot(), entities = useEntities()
	return (key: string, kind: string): Action | undefined => snapshot?.settingsActions?.[key]?.map(id => entities.actions[id]).find(action => action?.kind === kind)
}
// A control whose engine verb isn't offered (yet) is drawn, disabled, with why.
function Verb({ action, label, primary = false, input, variant, onDone, onBefore }: { action?: Action; label: string; primary?: boolean; input?: { text?: string }; variant?: 'ghost'; onDone?: (receipt?: string) => void; onBefore?: () => void }) {
	const accepted = useAccepted()
	if (!action) return <Button variant={primary ? 'default' : variant ?? 'outline'} size="sm" disabled title={`${NAME} can't save this here yet.`}>{label}</Button>
	if (!onDone) return <ActionButton action={action} label={label} primary={primary} input={input} />
	// Delete and the dismissals hide their row or card (with Undo) only once the engine accepted; a refusal stays on the page.
	return <><Button variant={primary ? 'default' : variant ?? 'outline'} size="sm" onClick={async () => { onBefore?.(); const ok = await accepted(action, input); if (ok) onDone(typeof ok === 'string' ? ok : undefined) }}>{label}</Button></>
}

// The box that grows with its text: Enter saves, Shift+Enter is a new line, Esc cancels (C1).
function LineBox({ value, onChange, onEnter, onEscape, onBlur, label, placeholder, autoFocus = false, disabled = false, id }: { value: string; onChange: (text: string) => void; onEnter: () => void; onEscape?: () => void; onBlur?: () => void; label: string; placeholder?: string; autoFocus?: boolean; disabled?: boolean; id?: string }) {
	const ref = useRef<HTMLTextAreaElement>(null)
	useEffect(() => { const box = ref.current; if (box) { box.style.height = 'auto'; box.style.height = `${box.scrollHeight}px` } }, [value])
	const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onEnter() }
		else if (event.key === 'Escape' && onEscape) { event.preventDefault(); onEscape() }
	}
	return <textarea ref={ref} id={id} className="ways-box" rows={1} aria-label={label} placeholder={placeholder} value={value} autoFocus={autoFocus} disabled={disabled}
		onChange={event => onChange(event.currentTarget.value)} onKeyDown={keys} onBlur={onBlur} />
}

function Row({ line, lines, onDeleted, turnedOn, onTurnedOn }: { line: Line; lines: Line[]; onDeleted: (line: Line) => void; turnedOn: boolean; onTurnedOn: () => void }) {
	const action = useWayActions(), act = useAction(), accepted = useAccepted(), { href } = useScreenNavigation(), key = wayKey(line.id)
	const [editing, setEditing] = useState<string>(), [answer, setAnswer] = useState('')
	// Step 3 (SEND a58444d8): only redirect:true is the Settings-only line (no switch, no grant); setting is the bound key for both.
	const reading = line.status === 'reading', setting = !!line.redirect
	// CR B5 (D-A239 MP4): the switch shows SEND's effective state: On only for a line in effect (on, part, guidance). A line waiting for
	// his OK, not in effect, or still being read never looks On; it has no switch action (Turn on / Not now / Read it again do that).
	// Without a state (an older provider) the group/status reading stays.
	const on = line.state ? ['on', 'part', 'guidance'].includes(line.state) : line.group !== 'off' && line.status !== 'off'
	const pending = line.state === 'waiting' || line.state === 'not-in-effect' || line.state === 'reading'
	// D-A239 MP4: Not in effect is a warn status (icon plus words) with its switch disabled and an outline Read it again; Turn on of a
	// review line says what it now does for about 4 s (held by the section: the line moves to Doing), then settles to SEND's Doing this.
	const notInEffect = line.state === 'not-in-effect', readAgain = action(key, 'way-read-again'), statusId = `way-status-${line.id}`
	const toggle = pending ? undefined : action(key, on ? 'way-off' : 'way-on'), edit = action(key, 'way-edit'), remove = action(key, 'way-delete')
	const save = async () => { const text = editing?.trim(); if (!text || text === line.text || !edit) { setEditing(undefined); return } if (await accepted(edit, { text })) setEditing(undefined) }
	// Lines 2 and 3 are SEND's readBackLabel / readBackValue / statusText as given (no parsing). Doing's status links to Done, filtered to the
	// line's grants (ruleIds), when usedThisWeek says it acted. Conflict: a link to the other line (by conflictWith), which flashes it (C1).
	const used = line.status === 'doing' && line.usedThisWeek > 0 && !!line.ruleIds?.length
	const other = line.status === 'conflict' ? lines.find(candidate => candidate.id === line.conflictWith?.[0]) : undefined
	return <li className="ways-row" id={`way-${line.id}`} tabIndex={-1} data-status={line.status} data-state={line.state} data-off={!on || undefined}>
		<div className="ways-switch">{!setting && <Button variant="ghost" role="switch" aria-checked={on} aria-label={on ? 'On' : 'Off'} disabled={reading || pending || !toggle}
			aria-describedby={pending && !reading && line.statusText ? statusId : undefined}
			title={reading ? `${NAME} is still reading this line.` : pending ? line.statusText : !toggle ? `${NAME} can't save this here yet.` : undefined} onClick={() => toggle && void act(toggle, {})}><span className="setting-switch-track" aria-hidden="true"><i /></span></Button>}</div>
		<div className="ways-text">
			<div className="ways-line1">{editing !== undefined
				? <LineBox value={editing} onChange={setEditing} onEnter={save} onBlur={save} onEscape={() => setEditing(undefined)} label="Edit this line" autoFocus />
				: <button type="button" className="ways-words" disabled={!edit} title={edit ? 'Edit this line' : undefined} onClick={() => setEditing(line.text)}>{line.readBack[0] || line.text}</button>}
				<span className="chip ways-source">{SOURCE[line.source]}</span></div>
			<p className="ways-line2">{reading ? <><span className="ways-spinner" aria-hidden="true" />{line.readBackValue || 'Reading…'}</>
				: setting && line.setting ? <a href={href(`settings/${line.setting}`)}>{line.readBackValue}</a> : <>{line.readBackLabel && <strong>{line.readBackLabel}</strong>} {line.readBackValue}</>}</p>
			{turnedOn ? <p className="ways-line3" role="status">On. {NAME} now reviews PRs as your line says. It never votes or approves.</p>
				: !reading && line.statusText && <p className="ways-line3" id={statusId}>{notInEffect ? <span><span aria-hidden="true">✕ </span>{line.statusText}</span> : used ? <a href={href(`done/rule/${line.ruleIds!.map(encodeURIComponent).join(',')}`)} title="See what it did in Done">{line.statusText}</a> : line.statusText}
				{other && <a href={`#way-${other.id}`} onClick={event => { event.preventDefault(); flashLine(other.id) }}>Show that line</a>}
				{notInEffect && readAgain && <span className="ways-inline"><Verb action={readAgain} label="Read it again" /></span>}
				{line.status === 'waiting' && <span className="ways-inline"><Verb action={action(key, 'way-confirm')} label="Turn on" primary {...(line.setting === 'reviewRule' ? { onDone: onTurnedOn } : {})} /><Verb action={action(key, 'way-not-now')} label="Not now" variant="ghost" /></span>}</p>}
			{line.status === 'unclear' && !reading && <div className="ways-answer"><LineBox value={answer} onChange={setAnswer} onEnter={async () => { const verb = action(key, 'way-answer'); if (verb && answer.trim() && await accepted(verb, { text: answer.trim() })) setAnswer('') }} label="Your answer" placeholder="Your answer" />
				<Verb action={action(key, 'way-answer')} label="Save" input={{ text: answer.trim() }} /></div>}
			{action(key, 'way-edit') && <ActionState item={action(key, 'way-edit')!.item} rev={action(key, 'way-edit')!.rev} />}
		</div>
		<details className="card-more-menu ways-more"><summary aria-label="More" title="Edit or delete this line"><Icon name="more" /></summary><div className="card-more-content">
			<Button variant="outline" size="sm" disabled={!edit} onClick={() => setEditing(line.text)}>Edit</Button>
			<Verb action={remove} label="Delete" onDone={() => onDeleted(line)} />
		</div></details>
	</li>
}

// C3: at most one, between Add a line and the list: the evidence, one editable box with the suggested line, Add it / Not now / Never.
function SuggestionCard({ suggestion, onDismissed, onAccepting, onAccepted }: { suggestion: Suggestion; onDismissed: (how: 'not-now' | 'never') => void; onAccepting: () => void; onAccepted: (receipt: string | undefined, edited: boolean) => void }) {
	const action = useWayActions(), key = suggestionKey(suggestion.id), [text, setText] = useState(suggestion.text)
	useEffect(() => setText(suggestion.text), [suggestion.id, suggestion.text])
	return <section className="ways-suggestion" aria-label="Suggested from what you do">
		{/* The suggestion's id is its H code: a tooltip only, never in the visible words (C4.2, SEND 3fad10e3). */}
		<h3 title={suggestion.id}><Icon name="spark" /> Suggested from what you do</h3>
		<p>{suggestion.evidence}</p><p>Add this to your way of working?</p>
		<LineBox value={text} onChange={setText} onEnter={() => undefined} label="Suggested line" />
		{suggestion.links?.length ? <details className="ways-times"><summary>See the {suggestion.links.length} times</summary><ul>{suggestion.links.map((link, n) => <li key={link}><a href={link}>{`Time ${n + 1}`}</a></li>)}</ul></details> : null}
		<div className="action-bar ways-suggestion-bar"><Verb action={action(key, 'suggestion-accept')} label="Add it" primary input={{ text: text.trim() }} onBefore={onAccepting} onDone={receipt => onAccepted(receipt, text.trim() !== suggestion.text.trim())} />
			<Verb action={action(key, 'suggestion-not-now')} label="Not now" onDone={() => onDismissed('not-now')} />
			<span className="ways-never"><Verb action={action(key, 'suggestion-never')} label="Never" variant="ghost" onDone={() => onDismissed('never')} /></span></div>
		{action(key, 'suggestion-accept') && <ActionState item={action(key, 'suggestion-accept')!.item} rev={action(key, 'suggestion-accept')!.rev} />}
	</section>
}

export function WaysSection({ classic = false }: { classic?: boolean }) {
	const ways = useSnapshot()?.ways, action = useWayActions(), accepted = useAccepted()
	const [draft, setDraft] = useState(''), [deleted, setDeleted] = useState<{ line: Line; until: number }[]>([]), [dismissed, setDismissed] = useState<{ id: string; how: 'not-now' | 'never'; until: number }>()
	// D-A239 MP4: the line just turned on (a review line), whose confirmation replaces its line 3 for about 4 s.
	const [turnedOn, setTurnedOn] = useState<string>()
	useEffect(() => { if (!turnedOn) return; const timer = setTimeout(() => setTurnedOn(undefined), 4000); return () => clearTimeout(timer) }, [turnedOn])
	const [, tick] = useState(0)
	useEffect(() => { if (!deleted.length && !dismissed) return; const timer = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(timer) }, [deleted.length, !!dismissed])
	// PM A R32 / PE A R33: after an unchanged Add it, "Added to your way of working." stands in the card's place for 6 s (paused while
	// hovered or focused), then the new line flashes. Undo (an unchanged Add it only) calls SEND's undoAcceptSuggestion on the added line.
	// The new line is the one that wasn't there at the click (the engine words a learned line its own way, so not by text).
	const [added, setAdded] = useState<{ before: string[]; left: number; paused: boolean; receipt?: string; edited?: boolean }>()
	const linesNow = useRef<Line[]>([]), beforeAdd = useRef<string[]>([]); linesNow.current = ways?.lines ?? []
	useEffect(() => {
		if (!added || added.paused) return
		const timer = setInterval(() => setAdded(state => state && !state.paused ? { ...state, left: state.left - 250 } : state), 250)
		return () => clearInterval(timer)
	}, [!!added, added?.paused])
	useEffect(() => {
		if (!added || added.left > 0) return
		const fresh = linesNow.current.find(line => !added.before.includes(line.id))
		setAdded(undefined)
		if (fresh) setTimeout(() => flashLine(fresh.id), 0)
	}, [added])
	if (!ways) return null
	const now = Date.now(), add = action('ways', 'way-add'), restore = action('ways', 'way-restore')
	const live = deleted.filter(entry => entry.until > now), hidden = new Set(live.map(entry => entry.line.id))
	const groups = (['needs-him', 'doing', 'off'] as const).map(group => ways.lines.filter(line => line.group === group && !hidden.has(line.id))).filter(rows => rows.length)
	const shownSuggestion = dismissed && dismissed.until > now ? undefined : ways.open
	// PE A R33: Undo only after an UNCHANGED Add it that added a learned line (an edited or stop-style accept has none): the new line's own verb.
	const freshLine = added && !added.edited ? ways.lines.find(line => line.source === 'learned' && !added.before.includes(line.id)) : undefined
	const undoAdd = freshLine ? action(wayKey(freshLine.id), 'way-undo-accept') : undefined
	const addLine = async () => { const text = draft.trim(); if (text && add && await accepted(add, { text })) setDraft('') }
	return <div className={`ways${classic ? ' ways-classic' : ''}`}>
		<p className="muted">Tell {NAME} how you work, in your own words. It shows what it understood and asks before doing anything new without you.</p>
		{/* PE 05:24 B1: a real engine error says so here; the old lists never stand in for it. */}
		{ways.failed && <p className="ways-failed" role="alert"><Icon name="warn" /> Your way of working couldn&apos;t be read just now. Nothing was changed.</p>}
		
		{/* D-A281 B1: a PR review waiting on "none of your lines covers this" links here (id way-add), focused, nothing prefilled. */}
		<div className="ways-add"><LineBox id="way-add" value={draft} onChange={setDraft} onEnter={addLine} label="Add a line" placeholder="Add a line, e.g. “Always ask me before replying to anyone at Acme.”" />
			<Verb action={add} label="Add" input={{ text: draft.trim() }} />{add && <ActionState item={add.item} rev={add.rev} />}</div>
		{added ? <p className="ways-undo ways-added" role="status" tabIndex={0} onMouseEnter={() => setAdded(state => state && { ...state, paused: true })} onMouseLeave={() => setAdded(state => state && { ...state, paused: false })}
			onFocus={() => setAdded(state => state && { ...state, paused: true })} onBlur={() => setAdded(state => state && { ...state, paused: false })}><Icon name="check" /> {added.receipt ?? 'Added to your way of working.'}{undoAdd && <> · <Verb action={undoAdd} label="Undo" variant="ghost" onDone={() => setAdded(undefined)} /><ActionState item={undoAdd.item} rev={undoAdd.rev} /></>}</p>
			: dismissed && dismissed.until > now ? <p className="ways-undo" role="status">{dismissed.how === 'never' ? 'Won’t suggest this again' : 'Not now'} · <Verb action={action(suggestionKey(dismissed.id), 'suggestion-undo')} label="Undo" variant="ghost" onDone={() => setDismissed(undefined)} /></p>
			: shownSuggestion && <SuggestionCard suggestion={shownSuggestion} onDismissed={how => setDismissed({ id: shownSuggestion.id, how, until: Date.now() + UNDO_MS })}
				onAccepting={() => { beforeAdd.current = ways.lines.map(line => line.id) }} onAccepted={(receipt, edited) => setAdded({ before: beforeAdd.current, left: UNDO_MS, paused: false, edited, ...(receipt ? { receipt } : {}) })} />}
		{live.map(({ line }) => <p key={line.id} className="ways-undo" role="status">Deleted · <Verb action={restore} label="Undo" variant="ghost" input={{ text: `${line.id}\n${line.textHash}` }}
			onDone={() => setDeleted(list => list.filter(entry => entry.line.id !== line.id))} /></p>)}
		{groups.map((rows, n) => <ul className="ways-list" key={n}>{rows.map(line => <Row key={line.id} line={line} lines={ways.lines} onDeleted={gone => setDeleted(list => [...list, { line: gone, until: Date.now() + UNDO_MS }])}
			turnedOn={turnedOn === line.id} onTurnedOn={() => setTurnedOn(line.id)} />)}</ul>)}
		{/* PE S3 (b): his old prose paragraphs are notes, not lines: shown once, collapsed, verbatim, each with Make it a line (the normal Add a
		    line path) and Remove. The page says the list above is what Delegate does and the notes change nothing. */}
		{(ways.notes?.length ?? 0) > 0 && <details className="ways-notes"><summary>Your notes from before ({ways.notes!.length})</summary>
			<p className="muted">The list above is what {NAME} does. These notes change nothing; make one a line to have {NAME} act on it.</p>
			<ul>{ways.notes!.map(note => <li key={note.id} className="ways-note">
				<p className="ways-note-text">{note.text}</p>{note.review && <p className="muted">Not on. Make it a line to have {NAME} review PRs this way.</p>}
				<span className="ways-inline"><Verb action={action(noteKey(note.id), 'note-to-line')} label="Make it a line" /><Verb action={action(noteKey(note.id), 'note-remove')} label="Remove" variant="ghost" /></span>
				{action(noteKey(note.id), 'note-to-line') && <ActionState item={noteKey(note.id)} rev={note.textHash} />}</li>)}</ul></details>}
		{ways.turnedDown.length > 0 && <details className="ways-turned-down"><summary>Suggestions you turned down ({ways.turnedDown.length})</summary><ul>{ways.turnedDown.map(row => row.kind === 'suggestion'
			// I-b: a suggestion he turned down on a card (✕), by its label; Reconsider lets Delegate suggest it again.
			? <li key={row.id}><span>{row.label}</span><small className="muted">turned down {when(row.at)}</small><Verb action={action(`way-dismissal:${row.id}`, 'suggestion-reconsider')} label="Reconsider" /></li>
			: <li key={row.suggestion.id}><span>{row.suggestion.text}</span><small className="muted">turned down {when(row.at)}</small><Verb action={action(suggestionKey(row.suggestion.id), 'suggestion-reconsider')} label="Reconsider" /></li>)}</ul></details>}
		<section className="ways-limits" aria-label={`${NAME} never does these by itself`}><h3><Icon name="lock" /> {NAME} never does these by itself</h3>
			<ol>{ways.limits.map(limit => <li key={limit.id}>{limit.page}</li>)}</ol></section>
	</div>
}

// C1: a Settings switch is a shortcut onto its line: under its label, the line's first words and its state, and a link to the line.
export function BoundLine({ settingKey }: { settingKey: string }) {
	const ways = useSnapshot()?.ways, { href } = useScreenNavigation()
	const line = ways?.lines.find(candidate => candidate.setting === settingKey && !candidate.redirect)
	if (!line) return null
	const state = line.status === 'reading' ? 'Reading…' : line.status === 'waiting' ? 'Waiting for your OK' : line.group === 'off' || line.status === 'off' ? 'Off' : 'Doing'
	const words = line.text.split(/\s+/).slice(0, 8).join(' ')
	return <p className="muted ways-bound">{words}{line.text.split(/\s+/).length > 8 ? '…' : ''} · {state} · <a href={href('settings/ways')} onClick={() => setTimeout(() => document.getElementById(`way-${line.id}`)?.scrollIntoView({ block: 'center' }), 0)}>See it in Your way of working ›</a></p>
}

// R12c (C1): Home and Now link here: "<n> suggestion(s) · <m> lines to check ›", from the engine's open suggestion and toCheck. Nothing
// while the engine isn't there or couldn't be read (never a misleading count).
export const waysLinkShown = (ways?: Ways) => !!ways && !ways.failed && (!!ways.open || ways.toCheck > 0)
export function WaysLink({ className }: { className?: string }) {
	const ways = useSnapshot()?.ways, { href } = useScreenNavigation()
	if (!ways || !waysLinkShown(ways)) return null
	const words = [ways.open && '1 suggestion', ways.toCheck > 0 && `${ways.toCheck} ${ways.toCheck === 1 ? 'line' : 'lines'} to check`].filter(Boolean).join(' · ')
	return <a className={className} href={href('settings/ways')}>{words} ›</a>
}