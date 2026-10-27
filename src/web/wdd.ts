import { ledgerStart, readActions, undoableAction, type FoldedAction } from '../store/actions.ts'
import { ruleLines, ruleTextHash } from '../store/rules.ts'
import { lineConfirmed } from '../core/rule-lines.ts'
import type { Store } from '../store/state.ts'
import { isThread, parseThread, teamsChat, threadLink } from '../adapters/channels.ts'
import { stopPreview, type StopActionScope } from '../core/ways.ts'
import { actionApprovalRev } from '../core/page-approval.ts'

// WDD N1 (joint-what-delegate-did.md, PE build lines "New, in order" 1; Designer D1/D2/D5/D8; PE E1/E4/E7): what Delegate did for the
// owner by itself, from the reviewed action ledger (SEND W1), as facts only. The words are composed on the page.
// - History: the last 30 days (the ledger's retention), newest first; Done › By Delegate reads all of it.
// - Now's "Done for you" section: a row leaves only when its Undo window has closed AND it was seen on an earlier look (D1), or once he
//   marked it reviewed. A row whose item is still open (waiting on him) is never also in the section (exactly once, D1/E1 itemOpen).
// - Never the draft's sources or anything private: a record holds only what was sent and his line (E7); snapshots leave it out.
export const WDD_DAYS = 30
export const WDD_SEEN = 'wdd'

export type WddPart = {
	kind: 'message' | 'comment' | 'thread'; text: string; outcome: 'posted' | 'failed' | 'unconfirmed'; why?: string; link?: string
	pr?: number; file?: string; line?: number; severity?: 'high' | 'medium' | 'low'
}
// lineHash: the line's CURRENT text hash (absent when deleted), the exact revision Stop doing this is offered on.
export type WddBecause = { kind: 'line'; lineId: string; text: string; state: 'current' | 'edited' | 'deleted'; lineHash?: string }
	| { kind: 'setting'; key: string; label: string; reminder?: string }
	| { kind: 'unknown' }
export type WddRow = {
	id: string; kind: FoldedAction['kind']; at: string
	chat: { name: string; group: boolean }; to?: string
	item?: string
	// Stop doing this can act on it (W5's own preconditions, read here so it is never offered only to be refused): a reply, ack or review
	// whose line is current, on and turned on, with the very grant that allowed it.
	stoppable?: true
	// PE v1.140 (W5 preview): per offered scope, what Stop doing this would write, from SEND's stopPreview on the same line hash the button
	// guards: the added line's text, or his line that would be turned off. A scope it refuses is absent (that radio is not offered).
	preview?: Partial<Record<StopActionScope, { mode: 'added' | 'turned-off'; text: string }>>
	// The item is still waiting on him, so the action shows there (and here only as history, "Waiting for your approval ›").
	itemOpen?: boolean
	parts: WddPart[]
	because: WddBecause
	// PM FINAL B2 (14:51:19): a reply, ack or reminder whose one message part couldn't be confirmed links Check ↗ to the chat (Teams'
	// documented chat link, or the channel thread's root), never to a message that may not exist. Only for a real Teams chat.
	check?: string
	// Only while it can still be taken back: the reviewed W1 facade's own test (a posted message part, inside the window, not undone).
	undoUntil?: string
	// N2 (SEND's W4 page binding): the record's exact approval revision, the token its Undo carries; server-only, never on the page.
	undoRev?: string
	// What happened to it after it went out, from its amendments (the latest of each kind).
	// stopped: only while it is still in effect (the added line is there and on; his line is still off), with that line's text as it reads
	// now (D8 "Stopped: "<new line>" ›" / "Turned off: …") and its hash for the 6 s Undo. A stop that was undone reads as before it.
	undone?: { at: string }; undoFailed?: { why?: string }; stopped?: { lineId: string; mode: 'added' | 'turned-off'; text: string; hash: string }; corrected?: string
	// H3(b) (PE v1.146/v1.149): his Pause or End of a reminder, while the reminder is still in the state it left (live paused / ended), and when.
	reminderStopped?: { state: 'paused' | 'ended'; at: string }
	// H3(a): server-only. This record holds the item's current sent message (and is not undone), so Wrong / Incomplete correct it.
	correctable?: true
	reviewed?: boolean
	// Not yet seen: after the last time he looked at what Delegate did (the existing New marker rule, key `wdd`).
	fresh: boolean
}
// from: the start of the 30-day window read. since: the ledger's start (PE v1.135), through SEND's reviewed export only; absent while no
// ledger-capable runner has run on this root.
export type WddView = { from: string; since?: string; rows: WddRow[]; section: string[]; fresh: number; undoable: number }

const OPEN = new Set(['needs_human', 'waiting_on_task', 'waiting_on_sender'])
const latest = (action: FoldedAction, kind: FoldedAction['amendments'][number]['kind']) => action.amendments.filter(change => change.kind === kind).at(-1)

export function wddView(store: Store, seen: Record<string, string>, now = Date.now()): WddView {
	const from = new Date(now - WDD_DAYS * 86_400_000).toISOString()
	const actions = readActions(store, { since: from, until: new Date(now).toISOString() })
	const lines = new Map(ruleLines(store).map(line => [line.id, line]))
	const lastLook = seen[WDD_SEEN] ?? ''
	const rows = actions.map((action): WddRow => {
		const wf = action.item ? store.byCode(action.item.code) : undefined
		const b = action.because
		const because: WddBecause = b.kind === 'line'
			? (line => ({ kind: 'line' as const, lineId: b.lineId, text: b.text, state: !line ? 'deleted' as const : ruleTextHash(line.text) !== b.hash ? 'edited' as const : 'current' as const, ...(line ? { lineHash: ruleTextHash(line.text) } : {}) }))(lines.get(b.lineId))
			: b.kind === 'setting' ? { kind: 'setting', key: b.key, label: b.label, ...(store.automation(b.key) ? { reminder: b.key } : {}) } : { kind: 'unknown' }
		const source = b.kind === 'line' ? lines.get(b.lineId) : undefined, capability = action.kind === 'review' ? 'review' : action.kind === 'ack' ? 'ack' : 'send'
		const stoppable = b.kind === 'line' && (action.kind === 'reply' || action.kind === 'ack' || action.kind === 'review') && !!source && !source.off && lineConfirmed(source) &&
			ruleTextHash(source.text) === b.hash && !!source.compile?.grants.some(grant => grant.id === b.grantId && grant.then === capability)
		const undone = latest(action, 'undone'), failed = latest(action, 'undo-failed'), stopped = latest(action, 'stopped'), corrected = latest(action, 'corrected')
		return {
			id: action.id, kind: action.kind, at: action.at, chat: { name: action.chat.name, group: action.chat.group },
			...(action.to ? { to: action.to.first } : {}),
			...(action.item ? { item: action.item.code } : {}),
			...(action.kind !== 'review' && action.kind !== 'change' && (message => message.length === 1 && message[0].outcome === 'unconfirmed')(action.parts.filter(part => part.kind === 'message')) && teamsChat(action.chat.id)
				? { check: isThread(action.chat.id) ? threadLink(action.chat.id, parseThread(action.chat.id).rootId) : `https://teams.microsoft.com/l/chat/${action.chat.id}/conversations` } : {}),
			...(stoppable ? { stoppable: true as const } : {}),
			...(wf && OPEN.has(wf.state) ? { itemOpen: true } : {}),
			parts: action.parts.map(part => ({
				kind: part.kind, text: part.text, outcome: part.outcome, ...(part.why ? { why: part.why } : {}), ...(part.link ? { link: part.link } : {}),
				...(part.pr ? { pr: part.pr } : {}), ...(part.file ? { file: part.file } : {}), ...(part.line ? { line: part.line } : {}), ...(part.severity ? { severity: part.severity } : {}),
			})),
			because,
			...(undoableAction(action, now) ? { undoUntil: action.undo!.until, undoRev: actionApprovalRev(action) } : {}),
			...(undone ? { undone: { at: undone.at } } : {}),
			...(failed && !undone ? { undoFailed: { ...(failed.why ? { why: failed.why } : {}) } } : {}),
			...(stopped ? (line => {
				const mode = 'mode' in stopped && stopped.mode === 'turned-off' ? 'turned-off' as const : 'added' as const
				return line && (mode === 'turned-off' ? line.off : !line.off) ? { stopped: { lineId: line.id, mode, text: line.text, hash: ruleTextHash(line.text) } } : {}
			})(stopped.lineId ? lines.get(stopped.lineId) : undefined) : {}),
			...(corrected?.item ? { corrected: corrected.item } : {}),
			// H3(b), PE v1.165/v1.166 (CR 19:52:50 B1): his Pause / End is in effect only when the reminder holds THIS stop: (a) its stop names this
			// record, (b) its state is the state that stop produced, and (c') this record has the line-less `stopped` amendment whose `at` is
			// exactly stop.at (that amendment gives the label and the 6 s window). Never a timestamp-equality test, prose or an older amendment;
			// any other save clears the reminder's stop, so an Undo, resume or natural end shows the Because line again.
			...(b.kind === 'setting' ? (auto => {
				const stop = auto?.stop
				if (!stop || stop.recordId !== action.id || auto!.state !== stop.produced) return {}
				const mark = action.amendments.find(change => change.kind === 'stopped' && !('lineId' in change && change.lineId) && change.at === stop.at)
				return mark ? { reminderStopped: { state: stop.produced, at: mark.at } } : {}
			})(store.automation(b.key)) : {}),
			// H3(a) item 2: Wrong / Incomplete only for the item's current sent reply: the item is done or open, the record not undone, and one
			// of its message parts (or its Undo target) is the workflow's current wf.sent.msgId. A superseded send is not offered.
			...(action.item && wf && (wf.state === 'done' || wf.state === 'open') && !undone && wf.sent?.msgId &&
				(action.parts.some(part => part.kind === 'message' && part.msgId === wf.sent!.msgId) || action.undo?.msgId === wf.sent.msgId) ? { correctable: true as const } : {}),
			...(latest(action, 'reviewed') ? { reviewed: true } : {}),
			fresh: action.at > lastLook,
		}
	})
	for (const row of rows) {
		if (!row.stoppable || row.because.kind !== 'line' || !row.because.lineHash || row.stopped) continue
		const hash = row.because.lineHash
		row.preview = Object.fromEntries((['chat', 'person', 'never'] as const).flatMap(scope => (plan => 'mode' in plan ? [[scope, plan]] : [])(stopPreview(store, row.id, scope, hash))))
	}
	const section = rows.filter(row => !row.itemOpen && !row.reviewed && (!!row.undoUntil || row.fresh)).map(row => row.id)
	const since = ledgerStart(store)
	return { from, ...(since ? { since } : {}), rows, section, fresh: rows.filter(row => row.fresh).length, undoable: rows.filter(row => !!row.undoUntil).length }
}

// "Mark all reviewed" (D1/D7.7): every row the section showed at `shownAt` (no later row) gets a `reviewed` amendment by the owner. The
// page holds the press for 6 s with Undo before it is sent (the A58 hold), so nothing is written until then.
export function reviewedIds(view: WddView, shownAt: string): string[] {
	return view.rows.filter(row => view.section.includes(row.id) && row.at <= shownAt).map(row => row.id)
}
