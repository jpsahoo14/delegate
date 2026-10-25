import type { Store } from '../store/state.ts'
import type { Automation, Job, PlanStep, Workflow } from '../core/types.ts'
import type { Waiting } from '../core/waiting.ts'
import { type Facts, rankOf, type Section, URGENCY, whoseMove } from '../core/whose.ts'
import { clock } from '../core/schedule.ts'
import { meaningOf, pendingEffects, saidLine, shown, asksReviewAgain } from '../core/effects.ts'
import { messageLink, teamsChat } from '../adapters/channels.ts'
import { describe } from '../runner/automations.ts'
import { DELAYS, MAX_TRIES } from '../runner/retry.ts'
import { cardType, msgKeys, readingOf, who as whoOf, type Who } from './view.ts'
import { NAME } from '../brand.ts'
import { handledThisWeek } from '../store/numbers.ts'
import { openTodos } from '../runner/work.ts'
import { htmlToText } from '../core/intake.ts'
import { activeAgentHold, type AgentSetupFailure } from '../core/agent-failure.ts'
import { placeOf } from './model/place.ts'

// The new experience's placement (dev-spec/new-experience.md §0, phase N0): one thread per home code, in one section, with its Next owner.
export type Owner = { kind: 'you' } | { kind: 'delegate' } | { kind: 'others'; text: string } | { kind: 'nobody' }
export type Placed = {
	// code: the thread's home; act: the subject that placed it, which the row's button acts on.
	code: string; act: string; section: Section; rule: string; subjects: string[]
	title: string; who?: string; chat?: string; at: string
	next?: { owner: Owner; what?: string }
	// Why a thread that waits for Delegate is not under Delegate is working.
	why?: string
}

type Subject = { kind: 'item'; wf: Workflow } | { kind: 'waiting'; w: Waiting } | { kind: 'reminder'; a: Automation }

// One read of the store per request, so placing 200 items does not scan directories 200 times.
export type Snap = {
	workflows: Workflow[]; jobs: Map<string, Job>; waiting: Waiting[]; automations: Automation[]
	runner: Facts['runner']; queue: Map<string, NonNullable<Facts['queue']>>; slots: Set<string>; catchupSeen: string; me: string[]; tz?: string; now: number; agentWait?: AgentSetupFailure
	// A120 (PE 02:52): an untitled group chat's row words ("in a group with Ana +3"); undefined for titled chats and 1:1s.
	place?: (chat: { id: string; name: string; group?: boolean }, asker?: { id?: string; name?: string }) => string | undefined
}

// One thread's placement reads only its items and their jobs (#27 step 2): the page's action path places one card, not the store.
export function snapshot(store: Store, now = Date.now(), only?: Workflow[]): Snap {
	const cfg = store.config(), c = store.control(), workflows = only ?? store.workflows()
	const jobs = new Map((only ? only.flatMap(w => [w.job, w.work?.watch]).flatMap(id => (id ? [store.job(id)] : [])).filter((j): j is Job => !!j) : store.jobs()).map(j => [j.id, j]))
	const cap = cfg.dailyRuns ?? 200, runs = store.runsToday(), reading = readingOf(store, now).state
	// Paused only changes what is sent; whether anything runs comes first. Stopped, then no machine reading, then paused
	// (set in the config or by the owner, as status and the send gate read it), then the day's limit (review round 3, P1, P2-5).
	const runner: Facts['runner'] = c.stopped ? 'stopped' : reading === 'off' || reading === 'never' ? 'off' : c.paused || cfg.paused ? 'paused' : runs >= cap ? 'capped' : 'ok'
	// The same order and slots as dispatch: live asks first, the week before setup a few per check within half the day's runs.
	const held = new Set(store.openWindows().map(w => w.id))
	const queued = workflows.filter(w => w.state === 'running').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
	const queue = new Map<string, NonNullable<Facts['queue']>>()
	const pacedSlots = runs < cap / 2 ? cfg.maxParallel ?? 3 : 0
	let paced = 0, room = cap - runs
	// Live asks take the day's room before the week before setup, as in dispatch.
	for (const w of queued) queue.set(w.id, held.has(w.id) || (w.job && held.has(w.job)) ? 'held' : !w.paced || paced++ < pacedSlots ? 'next' : 'line')
	for (const w of [...queued.filter(w => !w.paced), ...queued.filter(w => w.paced)]) if (queue.get(w.id) === 'next' && room-- <= 0) queue.set(w.id, 'limit')
	// The owner's Ask-box questions run after the drafts and use the same room.
	room -= workflows.filter(w => w.notes?.some(n => n.a === undefined) && w.state !== 'running').length
	// The same slots as startJobs: due watches are queued first, relays use no room, then jobs at once and what is left of the day.
	const allJobs = [...jobs.values()]
	let jobRoom = Math.min((cfg.jobs?.parallel ?? 3) - allJobs.filter(j => j.state === 'running' && !j.run?.relay).length, room)
	const slots = new Set<string>()
	const dueWatch = (j: Job) => !!j.every && j.state === 'done' && !!j.nextAt && Date.parse(j.nextAt) <= now
	for (const j of [...allJobs.filter(dueWatch), ...allJobs.filter(j => j.state === 'queued' && !j.every && !j.relay && !held.has(j.id) && !(j.retry && Date.parse(j.retry.at) > now))]) if (jobRoom-- > 0 && !j.every) slots.add(j.id)
	const first = cfg.owner.name.split(/\s+/)[0]
	return {
		workflows, jobs, waiting: store.waiting(), automations: store.automations(), runner, queue, slots,
		agentWait: activeAgentHold(store.agentHold(), cfg.agent, now),
		catchupSeen: store.seen().catchup ?? new Date(now - 86_400_000).toISOString(),
		me: [cfg.owner.name, first, ...(cfg.aliases ?? [])].filter(Boolean).map(s => s.toLowerCase()), tz: cfg.tz, now,
		place: (chat, asker) => placeOf(store, chat, asker)?.row,
	}
}

export function factsOf(s: Snap, sub: Subject): Facts {
	if (sub.kind === 'waiting') return { subject: 'waiting', state: sub.w.state === 'waiting' ? 'waiting_on_sender' : 'done', runner: s.runner, fyiUnread: false }
	if (sub.kind === 'reminder') return { subject: 'reminder', state: sub.a.state === 'proposed' ? 'needs_human' : sub.a.state === 'ended' ? 'done' : 'open', runner: s.runner, fyiUnread: false }
	const w = sub.wf, j = w.job ? s.jobs.get(w.job) : undefined
	return {
		subject: 'item', state: w.state, runner: s.runner, queue: s.queue.get(w.id), aiBlocked: !!s.agentWait,
		job: j && { state: j.state, watch: !!j.every, retryLater: !!j.retry && Date.parse(j.retry.at) > s.now, slot: s.slots.has(j.id), retry: !!j.retry },
		// A step for "them" that waits on the owner by name is the owner's step.
		work: w.work && { open: !w.work.closed, next: nextWho(s, w.work), waiting: !!w.work.waitingOn },
		todos: openTodos(w).length,
		fyiUnread: !!w.fyi && (w.fyi.at ?? w.updatedAt) > s.catchupSeen,
		...(w.openOn ? { window: true } : {}),
	}
}

const isMe = (s: Snap, who?: string) => !!who && s.me.includes(who.toLowerCase())
const nextWho = (s: Snap, k: NonNullable<Workflow['work']>) => k.next?.who === 'them' && isMe(s, k.waitingOn?.who) ? 'you' : k.next?.who

const runnerWhy: Record<Exclude<Facts['runner'], 'ok'>, string> = { off: `${NAME} is not reading now`, paused: `${NAME} is paused`, stopped: `${NAME} is stopped`, capped: 'daily limit reached; tomorrow' }

// Next names only what exists: the owner, a person or condition in the AI's words, Delegate when something will run, or nobody.
function nextOf(s: Snap, sub: Subject, f: Facts, section: Section): { next?: Placed['next']; why?: string } {
	if (section === 'done' || section === 'catchup') return {}
	if (sub.kind === 'waiting') return { next: { owner: { kind: 'others', text: sub.w.to.join(', ') || 'them' }, what: sub.w.text } }
	if (sub.kind === 'reminder') {
		const a = sub.a
		if (section === 'move') return { next: { owner: { kind: 'you' }, what: `start reminding ${a.to.name}` } }
		// A paused reminder sends nothing, and nothing is sent while Delegate is paused, stopped, or off.
		if (a.state === 'paused') return { next: { owner: { kind: 'nobody' }, what: `reminding ${a.to.name} is paused` } }
		return { next: { owner: { kind: 'delegate' }, what: `reminds ${a.to.name}${a.next ? ` next ${clock(new Date(a.next), s.tz)}` : ''}` }, why: s.runner === 'ok' ? undefined : runnerWhy[s.runner] }
	}
	const w = sub.wf, j = w.job ? s.jobs.get(w.job) : undefined
	if (section === 'move') return { next: { owner: { kind: 'you' }, what: f.state === 'waiting_on_task' ? `${NAME} stopped: ${(j?.error ?? 'its run ended without a result').slice(0, 120)}` : f.work?.next === 'you' && f.state !== 'needs_human' ? w.work?.next?.what : undefined } }
	if (section === 'working') return { next: { owner: { kind: 'delegate' } } }
	const busy = f.state === 'running' || f.state === 'scheduled' || (f.job?.state === 'queued' && !f.job.watch)
	// Paused, only sends and retries wait on the pause; drafts keep their own reasons (their place in line, the day's limit).
	const onPause = s.runner === 'paused' && (f.state === 'scheduled' || !!f.job?.retry)
	const why = s.agentWait && s.runner !== 'stopped' && (f.state === 'running' || f.job?.state === 'queued') ? s.agentWait.text : busy && s.runner !== 'ok' && (s.runner !== 'paused' || onPause) ? runnerWhy[s.runner] : f.job?.retryLater && j?.retry ? `tries again ${clock(new Date(j.retry.at), s.tz)}` : f.queue === 'line' ? 'in line behind live asks' : f.queue === 'limit' ? runnerWhy.capped : f.job?.state === 'queued' && !f.job.slot && !f.job.watch ? 'waits for a free run slot' : f.queue === 'held' ? 'open in your AI chat' : undefined
	if (f.job?.watch) return { next: { owner: { kind: 'delegate' }, what: `checks every ${j!.every} min` }, why }
	const n = w.work && !w.work.closed ? w.work.next : undefined
	// "them" names nobody, and waitingOn may name someone else (A34): the AI's own words for the step, never a name glued to it.
	if (n?.who === 'them') {
		return { next: { owner: { kind: 'others', text: n.what }, what: n.what }, why }
	}
	if (n?.who === 'me') {
		const runs = !!j && (j.state === 'queued' || j.state === 'running') || !!w.work!.plan?.some(p => p.probe && !p.done)
		return { next: { owner: runs ? { kind: 'delegate' } : { kind: 'nobody' }, what: n.what }, why }
	}
	if (f.work?.open && w.work?.waitingOn) return { next: { owner: { kind: 'others', text: w.work.waitingOn.who }, what: w.work.waitingOn.where }, why }
	if (f.state === 'waiting_on_sender') return { next: { owner: { kind: 'others', text: w.asker?.name ?? 'them' } }, why }
	return { next: busy ? { owner: { kind: 'delegate' } } : { owner: { kind: 'nobody' } }, why }
}

const titleOf = (sub: Subject) => sub.kind === 'waiting' ? sub.w.text : sub.kind === 'reminder' ? `Remind ${sub.a.to.name}: ${sub.a.text}` : (sub.wf.work && !sub.wf.work.closed ? sub.wf.work.goal : sub.wf.fyi?.line ?? sub.wf.lastAsk ?? sub.wf.status)

// Every subject joins its home's thread: a part its home, a W entry the item it belongs to. The most urgent subject places the thread.
export function place(s: Snap): Placed[] {
	const byId = new Map(s.workflows.map(w => [w.id, w])), byCode = new Map(s.workflows.map(w => [w.code, w]))
	const homeOf = (w: Workflow) => (w.partOf && byId.get(w.partOf)) || w
	const subjects: { home: string; sub: Subject; at: string; who?: string; chat?: string }[] = [
		...s.workflows.filter(w => w.code).map(wf => ({ home: homeOf(wf).code, sub: { kind: 'item' as const, wf }, at: wf.changedAt ?? wf.updatedAt, who: wf.asker?.name, chat: s.place?.(wf.chat, wf.asker) ?? wf.chat.name })),
		...s.waiting.filter(w => w.state === 'waiting').map(w => ({ home: (w.item && byCode.get(w.item) && homeOf(byCode.get(w.item)!).code) || w.code, sub: { kind: 'waiting' as const, w }, at: w.at, who: w.to.join(', '), chat: s.place?.(w.chat, { name: w.to[0] }) ?? w.chat.name })),
		...s.automations.filter(a => a.state !== 'ended').map(a => ({ home: a.code, sub: { kind: 'reminder' as const, a }, at: a.updatedAt, who: a.to.name })),
	]
	const threads = new Map<string, Placed>()
	for (const x of subjects) {
		const f = factsOf(s, x.sub), { section, rule } = whoseMove(f)
		const code = x.sub.kind === 'item' ? x.sub.wf.code : x.sub.kind === 'waiting' ? x.sub.w.code : x.sub.a.code
		const have = threads.get(x.home)
		// Same section: the earlier rule in the design's order wins, then the home (review N2 P1-1).
		const sec = have ? URGENCY.indexOf(section) - URGENCY.indexOf(have.section) : -1, rk = have ? rankOf(rule) - rankOf(have.rule) : -1
		const wins = !have || sec < 0 || (sec === 0 && (rk < 0 || (rk === 0 && code === x.home)))
		const placed: Placed = { code: x.home, act: code, section, rule, subjects: [...(have?.subjects ?? []), code], title: titleOf(x.sub).slice(0, 160), who: x.who, chat: x.chat, at: x.at, ...nextOf(s, x.sub, f, section) }
		if (wins) threads.set(x.home, have ? { ...placed, at: have.at > x.at ? have.at : x.at } : placed)
		else threads.set(x.home, { ...have, subjects: [...have.subjects, code], at: have.at > x.at ? have.at : x.at })
	}
	return [...threads.values()].sort((a, b) => URGENCY.indexOf(a.section) - URGENCY.indexOf(b.section) || b.at.localeCompare(a.at))
}

const ownerText = (o: Owner) => (o.kind === 'you' ? 'You' : o.kind === 'delegate' ? NAME : o.kind === 'others' ? o.text : 'nobody is on this yet')
const NAMES: Record<Section, string> = { move: 'YOUR MOVE', working: `${NAME.toUpperCase()} IS WORKING`, waiting: 'WAITING ON OTHERS', catchup: 'CATCH UP', done: 'DONE' }

// `delegate now --dry`: the placement as text, for the owner to check before any page draws it.
export function dryText(rows: Placed[]): string {
	const out: string[] = []
	for (const sec of URGENCY.filter(x => x !== 'done')) {
		const in_ = rows.filter(r => r.section === sec)
		out.push(`${NAMES[sec]} · ${in_.length}`)
		for (const r of in_) {
			const also = r.subjects.length > 1 ? ` (+${r.subjects.filter(c => c !== r.act).join(', ')})` : ''
			out.push(`  ${r.act.padEnd(4)} [${r.rule}] ${r.title.replace(/\s+/g, ' ').slice(0, 90)}${also}`)
			const facts = [r.who, r.chat].filter(Boolean).join(' · ')
			// Another person's step is already in the AI's own words, so it is printed once, not after a label.
			const what = r.next?.what?.replace(/\s+/g, ' ').slice(0, 80)
			const next = !r.next ? '' : r.next.owner.kind === 'others' ? `Next: ${r.next.owner.text.replace(/\s+/g, ' ').slice(0, 80)}` : `Next: ${ownerText(r.next.owner)}${what ? `: ${what}` : ''}`
			out.push(`       ${[facts, next, r.why && `(${r.why})`].filter(Boolean).join(' · ')}`)
		}
	}
	out.push(`DONE · ${rows.filter(r => r.section === 'done').length}`)
	return out.join('\n')
}

/* ------------------------------ N1a: rows for the new page ------------------------------ */
// Each placed thread as the new page draws it (design-spec/new-experience.md §5, reviews/pm-n1a.md). Code builds every word;
// times stay timestamps. Quotation marks only for words someone wrote, with who wrote them; anything else is unquoted, after a label.
export type RowKind =
	| 'reply' | 'holding' | 'question' | 'choice' | 'meeting' | 'review' | 'promise' | 'check-date' | 'track' | 'your-step' | 'stopped' | 'reminder-new' | 'todo' | 'in-terminal'
	| 'waiting-person' | 'waiting-others' | 'watch' | 'waiting-delegate' | 'nobody' | 'reminder'
	| 'working' | 'scheduled'
	| 'catchup'
// Each row kind and the exact existing command its button sends (design-spec/new-experience.md §9). "<code>" is the code that
// placed the row (a part's own code), "{text}" the owner's words from the row's field, "card" the classic card's own actions
// ("<code>: answer", "pick <code> n", "ok <code>"), and "" no button: nothing waits on the owner. No new verbs.
// Any card a row opens may also say "Send reply only" (a change failed or was dropped) or
// "Review again" (the PR changed since the review): existing commands too.
const CARD_MORE = 'ok <code> except <every change> (Send reply only) | <code>: review again (Review again)'
export const COMMANDS: Record<RowKind, string> = {
	reply: `ok <code> (whole draft on the row) | card | ${CARD_MORE}`, holding: `ok <code> (whole draft on the row) | card | ${CARD_MORE}`, question: `card | ${CARD_MORE}`, choice: `card | ${CARD_MORE}`, meeting: `card | ${CARD_MORE}`, review: `card | ${CARD_MORE}`, promise: 'ok <code>',
	'check-date': '<code>: nudge them', track: 'ok <code>', stopped: '<code>: try again', 'reminder-new': 'ok <code>',
	// N2: Report in the opened item ("<code>: Issues found: 403 on checkout"), and Mark done, which is close with a new meaning
	// on an item with open to-dos: it marks them done and changes nothing else (R-NEX-05, R-NEX-07).
	'your-step': '<code>: {text} | <code>: {result}: {text} (Report)', todo: 'close <code> (Mark done)',
	'waiting-person': 'ok <W code> | <code>: nudge them', 'waiting-others': '<code>: nudge them', watch: 'ok <code> (when changed)', 'waiting-delegate': '', nobody: '<code>: do the next step now', reminder: 'pause <code> | resume <code>',
	working: '', scheduled: 'later <code>',
	catchup: 'mine <code>',
	// Open in a terminal (#43): the card's Take it back is a page action, with no text command.
	'in-terminal': 'card',
}
// Holding reply is not a chip: the headline says it (PM review, cut list).
export type Chip = { kind: 'before' | 'retrying' | 'guests' | 'changed' | 'room' | 'pointed' | 'held' | 'worth' | 'new' | 'back'; text: string }
// An action is an existing command. "{text}" in it is filled from a field on the row; no command opens the item's card.
export type RowAction = { label: string; command?: string }
// Words someone wrote, and who: "Ravi asked: …", "You said: …". Shown in quotation marks.
export type Quote = { by: string; verb: string; text: string }
// Anything else, after a label and never in quotation marks: "Goal: …", "Why: …", "Last check 1:27 AM: …".
// since: when it began, said as a day ("Waiting on: Lin since Mon").
export type Note = { label: string; text: string; at?: string; since?: string }
export type NextRow = {
	code: string; act: string; section: Section; rule: string; kind: RowKind
	headline: string; who?: Who
	// who · where · verb when. at is a timestamp, said by the page in the owner's time; no verb, no time shown.
	facts: { who?: string; where?: string; at: string; verb?: string; quote?: Quote; notes?: Note[]; until?: string; also?: number; promise?: Promise_ }
	// A time the headline is about: a meeting's start.
	when?: string
	// "{at}" in what is next.at, said by the page in the owner's time.
	next?: { owner: Owner; what?: string; at?: string }
	// A warning the card would show first, such as a calendar clash.
	warn?: string
	chips: Chip[]
	primary?: RowAction; more?: RowAction[]
	// The whole draft, only when it fits on the row (design principle 4); rev is what the owner saw, for ok.
	draft?: string; rev?: string
	teams?: string; gist?: string
	// New and Back to you (N1b), as timestamps the page compares with the owner's seen marks: changed, the latest real change
	// of any item in the thread (runner/place.ts); back, when the row entered Your move (wf.place.since); born, when the item
	// that places it was made, so an item the owner never saw is New, not Back.
	fresh?: { changed?: string; back?: string; born: string }
	// Every message the thread's items hold, as "chat|msg", so Find knows a pasted link to any of them (review P2-6).
	msgs?: string[]
	work?: NextWork; todos?: TodoRow[]
}
// "You promised Ravi on Mon · no tool can do it": to whom, when the reply went out, and why it is the owner's (R-NEX-07).
export type Promise_ = { to?: string; at: string; why?: string }
// The opened item's owned work (design-spec/new-experience.md §6, N2), from the work record only: its plan, next, waitingOn, steps,
// and what the build checks read. Plan steps place nothing; they are shown here.
export type WorkStep = { what: string; owner: Owner; done: boolean; now: boolean; where?: string; build?: number }
export type NextWork = {
	goal: string; steps: WorkStep[]
	// The owner's step, and the newest step a build check saw done: "Deploy done 10:05 (build 991)".
	yours?: { what: string; check?: { what: 'Deploy' | 'Build'; at: string; build: number } }
	// Someone else's step, or Delegate's: who, in the AI's words, and the owner's step after it.
	then?: { owner: Owner; what: string; you?: string }
	// Report your result: the command, with {result} and {text} filled from the form. Only when the next step is the owner's.
	report?: string
	// What happened, newest first, and how many steps there are in all.
	happened: { at: string; what: string; news: boolean }[]; total: number
}
// The to-dos a sent reply left the owner on any item of the thread, for the opened item's list; code: its item, for Mark done.
export type TodoRow = { id: string; text: string; at: string; code: string }

export type NextView = {
	move: NextRow[]; working: NextRow[]; waiting: NextRow[]
	// worth: unread FYIs worth knowing first, for the summary line.
	catchup: { count: number; worth: number; rows: NextRow[] }
	// "When you have a minute": facts to approve and habit suggestions, as one line.
	minute: { facts: number; suggestions: number }
	// Delegate runs nothing next cycle, or (paused) drafts but sends nothing: why, and since when.
	off?: { text: string; since?: string }
	paused?: boolean
	// What Delegate handled this week, as the Numbers tab counts it, for the Since line (N1b).
	handled: number
}

// A draft longer than this does not fit on a row, so the row opens the card instead of sending from the list.
export const INLINE_MAX = 180
const first = (n?: string) => String(n || 'them').split(/\s+/)[0]
const firsts = (ns: string[]) => { const f = ns.map(first); return f.length > 1 ? `${f.slice(0, -1).join(', ')} and ${f.at(-1)}` : f[0] ?? 'them' }
const clipPlain = (t = '', n = 90) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s }
const clip = (t = '', n = 90) => clipPlain(htmlToText(t), n)
const teamsLink = (w: Workflow) => w.chat.id && w.lastMsgId && (!w.chat.test || teamsChat(w.chat.id)) ? messageLink(w.chat.id, w.lastMsgId) : undefined
const triesOf = (r: NonNullable<Job['retry']>) => `${r.n} of ${DELAYS[r.last.kind]?.length ?? MAX_TRIES}`
// "every hour", "every 2 hours", "every day", "every 30 min".
export const every = (min: number) => min % 1440 === 0 ? (min === 1440 ? 'every day' : `every ${min / 1440} days`) : min % 60 === 0 ? (min === 60 ? 'every hour' : `every ${min / 60} hours`) : `every ${min} min`
// "Couldn't finish reviewing PR 2204 for Dev": the job's goal, its first verb as -ing.
export function gerund(goal: string): string {
	const [w0, ...rest] = goal.trim().split(/\s+/), w = (w0 ?? '').toLowerCase()
	if (!w || /ing$/.test(w)) return goal.trim().replace(/^\S+/, w)
	const g = /[^aeiou]e$/.test(w) && w !== 'be' ? w.slice(0, -1) : /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(w) ? w + w.at(-1) : w
	return [`${g}ing`, ...rest].join(' ')
}
const whyOf = (error?: string) => { const m = /tool not found:?\s*(.+)$/i.exec(error ?? ''); return m ? `a tool is missing (${htmlToText(m[1])})` : clip(error ?? 'its run ended without a result', 140) }

// The markers that have data today (R-NEX-09, N1a). New and Back to you need per-item marks (N1b).
export function chipsOf(w: Workflow | undefined, j: Job | undefined, watchChanged = false): Chip[] {
	const out: Chip[] = []
	if (watchChanged) out.push({ kind: 'changed', text: 'Changed' })
	if (!w) return out
	if (w.before) out.push({ kind: 'before', text: 'From before setup' })
	if (w.missed) out.push({ kind: 'pointed', text: 'You pointed at this' })
	// The try count is said once, in Next (PM verification).
	if (j?.retry && j.state !== 'done' && j.state !== 'failed') out.push({ kind: 'retrying', text: 'Retrying' })
	if (w.chat.guests) out.push({ kind: 'guests', text: 'Guests in chat' })
	if (w.startedBy === 'room') out.push({ kind: 'room', text: 'To the room' })
	// From a field the pause sets, never from the status text; resume clears it.
	if (w.held === 'paused' && w.state === 'needs_human') out.push({ kind: 'held', text: 'Held: you paused' })
	if (w.fyi?.weight === 'high' && w.state === 'done') out.push({ kind: 'worth', text: 'Worth a look' })
	return out
}

// Your move on an item that needs the owner: the action, verb first, by card type.
function moveKind(w: Workflow): RowKind {
	if (w.work?.proposed) return 'track'
	// The owner's own words went out and promised a change, which waits for one ok; or the check of what they promised failed (Slice 3).
	// Not when it asks to review again: the vote cannot be made, so the row must not offer it (re-review P1-3).
	if (!w.draft?.text && !asksReviewAgain(w.code, w.question) && (w.promise?.state === 'failed' || w.promise?.state === 'offered' && pendingEffects(w.effects).length)) return 'promise'
	if (w.draft?.holding) return 'holding'
	if (w.work && !w.draft && !w.choices && !w.meeting && /^No news/.test(w.status)) return 'check-date'
	const t = cardType(w)
	return t === 'reply' && !w.draft?.text ? 'question' : t
}
// What the card makes the owner look at before ok, and a row does not show (review P1, P2-2): a need-to-know hold, a
// commitment, a warning, a file it could not read, a private or labelled source, or a blank to fill. Such a draft opens the card.
export const mustSee = (w: Workflow) => !!w.shareHold || !!w.draft?.commitment || !!w.context?.some(f => f.tone === 'warn') || !!w.gaps?.length
	|| !!w.draft?.sources.some(x => x.tier === 'private' || !!x.label) || /_{3,}/.test(w.draft?.text ?? '')
// A short draft reads whole in the headline; a longer one that fits goes under it; one that does not fit is clipped, and opens.
const SHORT = 80
const said = (verb: string, d: string, fits: boolean): { headline: string; draft?: string } => !fits || d.replace(/\s+/g, ' ').trim().length <= SHORT ? { headline: `${verb}: "${clip(d, SHORT)}"` } : { headline: verb, draft: htmlToText(d) }
const commentsOrChanges = (w: Workflow) => { const e = pendingEffects(w.effects), c = e.length && e.every(x => /comment|review(?!er)/i.test(x.action)); return `${e.length} ${c ? (e.length === 1 ? 'comment' : 'comments') : (e.length === 1 ? 'change' : 'changes')}` }
// "Pick what goes in the demo" reads "what goes in the demo?" after "Pick for Sam:".
const pickPrompt = (t = '') => { const s = t.trim().replace(/^(pick|choose|select)\s+/i, ''); return /[?]$/.test(s) ? s : `${s}?` }
// "Watch PR 2203 until merged" reads "PR 2203, until it merges".
const watchLine = (t = '') => t.replace(/^Watch\s+/i, '').replace(/\s+until\s+(it\s+is\s+)?merged$/i, ', until it merges').replace(/\s+until\s+(?!it merges$)/i, ', until ')
// Why Delegate has not started a thread that waits for it, as what it will do next (PM review 9: never a bare "Delegate").
function delegateNext(s: Snap, p: Placed, j: Job | undefined): { what: string; at?: string } {
	const why = p.why ?? ''
	if (s.agentWait && why === s.agentWait.text) return s.agentWait.kind === 'model' ? { what: 'waits for an available AI model' } : s.agentWait.retryAt ? { what: 'waits for AI quota; tries again {at}', at: s.agentWait.retryAt } : { what: 'waits for the AI budget or model to change' }
	if (/^tries again/.test(why) && j?.retry) return {
		what: j.retry.last.kind === 'not_ready'
			? `waits for ${j.retry.last.waitFor || j.retry.last.why}; checks again {at}`
			: `tries again {at} (${triesOf(j.retry)})`, at: j.retry.at,
	}
	if (/in line/.test(why)) return { what: 'drafts it after the live asks' }
	if (/daily limit/.test(why)) return { what: 'starts tomorrow; the daily limit is reached' }
	if (/run slot/.test(why)) return { what: 'starts when a run slot is free' }
	if (/AI chat/.test(why)) return { what: 'waits while it is open in your AI chat' }
	if (s.runner === 'paused') return { what: 'starts when you resume' }
	if (s.runner === 'stopped') return { what: 'starts when you start it again' }
	if (s.runner === 'off') return { what: 'starts when a machine reads your chats again' }
	return { what: 'starts next cycle' }
}

type Body = Omit<NextRow, 'code' | 'act' | 'section' | 'rule'>
function itemRow(s: Snap, p: Placed, w: Workflow): Body {
	const j = w.job ? s.jobs.get(w.job) : undefined, name = first(w.asker?.name), c = w.code
	// The chat's name is dropped when it is the person (a 1:1).
	const where = s.place?.(w.chat, w.asker) ?? (w.chat.name && w.chat.name !== w.asker?.name && w.chat.name !== name ? w.chat.name : undefined)
	// "+1 chat": parts of this work in other chats (U37). The owner's own folded ask is not one.
	const chats = new Set(p.subjects.map(c => s.workflows.find(x => x.code === c)).filter(x => x && x.partOf === w.id && x.chat.id !== w.chat.id).map(x => x!.chat.id)).size
	const ask: Quote | undefined = w.lastAsk ? { by: w.asker?.name ?? 'They', verb: 'asked', text: clip(w.lastAsk, 200) } : undefined
	// A run the engine refused to start says why on the row, not just "Answer" with a blank (bug 10-23 E33).
	const refused = w.state === 'needs_human' && /^Could not start: /.test(w.status) ? [{ label: 'Why', text: clip(((r: string) => r.startsWith(`${NAME} `) ? r : `${NAME} could not start: ${r}`)(w.status.replace(/^Could not start: /, '')), 240) }]
		// A send whose answer was lost and that the chat did not show: the owner checks Teams before anything goes again (bug 10-23 R4).
		: w.state === 'needs_human' && /^Not sure it was sent/.test(w.status) ? [{ label: 'Why', text: clip(w.status, 240) }] : []
	const facts: NextRow['facts'] = { who: w.asker?.name, ...(where ? { where } : {}), at: w.createdAt, verb: 'asked', ...(ask ? { quote: ask } : {}), ...(chats ? { also: chats } : {}), ...(refused.length ? { notes: refused } : {}) }
	const base = { who: whoOf(w.asker?.name), facts, chips: chipsOf(w, j), teams: teamsLink(w), rev: w.revAt ?? w.updatedAt }
	const open: RowAction = { label: 'Open' }
	const goal = (t?: string): Note[] => t ? [{ label: 'Goal', text: clip(t, 200) }] : []
	// A rule send, minutes before it goes. While paused a rule never schedules one (runner/autosend.ts), so nothing here
	// promises a send after resume (PM verification of N1a).
	if (w.state === 'scheduled') {
		const rule = w.decision?.ruleId ? ` (rule ${w.decision.ruleId})` : ''
		// Due while the owner is at the keyboard, the engine holds it and says so only in the status (runner/autosend.ts, as core/render.ts).
		const held = /^Held: you are active in Teams/.test(w.status)
		const next = held ? { owner: { kind: 'delegate' } as Owner, what: 'holds it because you are active in Teams; sends it once you step away' } : { owner: { kind: 'delegate' } as Owner, what: 'sends it at {at}', ...(w.sendAt ? { at: w.sendAt } : {}) }
		return { ...base, ...(held ? { chips: [...base.chips, { kind: 'held', text: 'Held: you are active in Teams' }] } : {}), kind: 'scheduled', headline: `Sends to ${name}${rule}: "${clip(w.draft?.text, 70)}"`, ...(p.section === 'working' ? { next } : {}), primary: { label: 'Hold', command: `later ${c}` } }
	}
	if (p.section === 'move') {
		if (p.rule === 'in-terminal') return { ...base, kind: 'in-terminal', headline: `Open in a terminal on ${w.openOn} · ${NAME} waits until you close it`, primary: open }
		if (p.rule === 'stopped') return { ...base, kind: 'stopped', headline: `Couldn't finish ${j?.goal ? gerund(clip(j.goal, 100)) : `this for ${name}`}: try again, or do it yourself`, facts: { ...facts, notes: [{ label: 'Why', text: whyOf(j?.error) }] }, primary: { label: 'Try again', command: `${c}: try again` }, more: [{ label: 'Close', command: `close ${c}` }] }
		if (p.rule === 'todo') return todoRow(s, base, w)
		if (p.rule === 'your-step') return { ...base, kind: 'your-step', headline: clip(w.work?.next?.what ?? w.work?.goal, 140), facts: { ...facts, notes: goal(w.work?.goal) }, primary: { label: 'Tell ' + NAME, command: `${c}: {text}` } }
		const kind = moveKind(w), d = w.draft?.text ?? ''
		const fits = !!d && d.length <= INLINE_MAX && !pendingEffects(w.effects).length && !w.choices && !mustSee(w)
		const clash = w.context?.find(f => f.tone === 'warn')
		// A review the gate did not start says why on the row; Open shows Add me when it can fix it (review gate, owner rule 10-23).
		if (w.reviewDecline) return { ...base, kind: 'question', headline: clip(w.status, 140), facts: { ...facts, notes: [{ label: 'Why', text: clip(w.context?.find(f => f.label === 'Not reviewing')?.text ?? w.question, 240) }] }, primary: open }
		switch (kind) {
			// A row never sends: Open shows the reply to read, edit or send (owner 10-21: Send on a row sent a reply meant to be edited).
			case 'reply': return { ...base, kind, ...said(`Send reply to ${name}`, d, fits), primary: open }
			case 'holding': return { ...base, kind, ...said(`Send ${name} a holding reply`, d, fits), primary: open }
			case 'question': return { ...base, kind, headline: `Answer ${name}: ${clip(w.question ?? w.lastAsk, 110)}`, primary: open }
			case 'choice': return { ...base, kind, headline: `Pick for ${name}: ${clip(pickPrompt(w.choices?.prompt ?? w.lastAsk), 110)}`, primary: open }
			case 'meeting': return { ...base, kind, headline: `Meet ${name}: ${clip(w.meeting?.subject ?? w.lastAsk, 90)}?`, when: w.meeting?.start, ...(clash ? { warn: htmlToText(`${clash.label}: ${clash.text}`) } : {}), primary: open }
			case 'review': return { ...base, kind, headline: `Approve ${commentsOrChanges(w)}${d ? `, then reply to ${name}` : ''}`, next: { owner: { kind: 'delegate' }, what: `after your ok, ${NAME} ${/comment/.test(commentsOrChanges(w)) ? 'posts them' : 'makes them'}${d ? ' and replies' : ''}` }, primary: open }
			case 'check-date': return { ...base, kind, headline: `No news on "${clip(w.work?.goal, 80)}": nudge, wait, or close?`, facts: { ...facts, quote: undefined, verb: undefined, at: w.work?.steps.at(-1)?.at ?? w.createdAt, notes: w.work?.waitingOn ? [{ label: 'Waiting on', text: clip(w.work.waitingOn.who, 60), since: w.work.waitingOn.since }] : [] }, primary: { label: 'Draft a nudge', command: `${c}: nudge them` }, more: [{ label: 'Wait 3 days', command: `wait ${c}: 3d` }, { label: 'Close', command: `close ${c}` }] }
			// The reply already went in the owner's words; one button makes the change it promised, its meaning on the row (Slice 3).
			case 'promise': {
				const quote: Quote = { by: 'You', verb: 'said', text: clip(w.promise!.text.replace(/\n/g, ' '), 200) }
				const f = { ...facts, at: w.sent?.at ?? facts.at, verb: 'said', quote }
				if (w.promise!.state === 'failed') return { ...base, kind, headline: `Couldn't check what you told ${name}: check again`, facts: { ...f, notes: [{ label: 'Why', text: whyOf(w.promise!.why) }] }, primary: { label: 'Check again', command: `ok ${c}` }, more: [{ label: 'Skip', command: `skip ${c}` }] }
				const left = pendingEffects(w.effects), meant = left.map(meaningOf).filter((m): m is string => !!m)
				return { ...base, kind, headline: saidLine(left), facts: { ...f, notes: meant.map(m => ({ label: 'PR', text: clip(m, 200) })) }, primary: { label: left.length === 1 ? shown(left[0]).line : `Make ${left.length} changes`, command: `ok ${c}` }, more: [{ label: 'Skip', command: `skip ${c}` }] }
			}
			// The owner's own words proposed this work: "You said", never after the asker's name.
			case 'track': return { ...base, kind, headline: `Track this? ${clip(w.work?.goal, 110)}`, facts: { ...facts, verb: 'said', quote: w.lastAsk ? { by: 'You', verb: 'said', text: clip(w.lastAsk, 200) } : undefined, notes: w.work?.doneWhen ? [{ label: 'Done when', text: clip(w.work.doneWhen, 160) }] : [] }, primary: { label: 'Track', command: `ok ${c}` }, more: [{ label: 'Skip', command: `skip ${c}` }] }
		}
	}
	if (p.section === 'catchup') return { ...base, kind: 'catchup', headline: clip(w.fyi?.line ?? w.lastAsk, 140), facts: { ...facts, quote: undefined, verb: 'posted', at: w.fyi?.at ?? p.at }, ...(w.fyi?.gist ? { gist: htmlToText(w.fyi.gist) } : {}), primary: { label: 'Needs me', command: `mine ${c}` }, more: w.watchedAs ? [] : [{ label: 'Watch', command: `watch ${c}` }] }
	const next = p.next
	if (p.section === 'working') {
		const run = j && (j.state === 'running' || j.state === 'queued')
		// No button: "continue" is refused while a run is going, so offering it here would promise what cannot happen.
		return { ...base, kind: 'working', headline: run ? clip(j!.goal, 120) : `Drafting a reply to ${name}`, ...(run ? { facts: { ...facts, verb: 'started', at: j!.run?.startedAt ?? w.waitingSince ?? p.at } } : {}), next: { owner: { kind: 'delegate' }, what: 'back to you when done' } }
	}
	// Waiting: on a person, a team or a condition in the AI's words, a watch, Delegate (with what it does next), or nobody.
	if (j?.every || w.kind === 'tracker') {
		// Only a watch's new check result is "Changed"; on other items changedAt is any real change, which New says (N1b).
		const changed = w.kind === 'tracker' && !!w.changedAt && (!w.ackAt || w.changedAt > w.ackAt)
		// The watch's own last result, from its job, never the item's status line.
		const last: Note = j?.result?.summary ? { label: 'Last check', text: clip(j.result.summary, 160), ...(j.result.at ? { at: j.result.at } : {}) } : { label: 'Last check', text: 'not checked yet' }
		return { ...base, who: undefined, kind: 'watch', chips: chipsOf(w, j, changed), headline: clip(watchLine(w.lastAsk ?? w.work?.goal), 120), facts: { at: w.changedAt ?? p.at, notes: [last], ...(j?.endsAt ? { until: j.endsAt } : {}) }, next: { owner: { kind: 'delegate' }, what: j?.every ? `checks ${every(j.every)}` : 'checks soon' }, ...(changed ? { primary: { label: 'Got it', command: `ok ${c}` } } : {}), more: [...(j?.endsAt ? [{ label: 'Extend 7 days', command: `extend ${c}` }] : []), { label: 'Stop', command: `skip ${c}` }] }
	}
	if (next?.owner.kind === 'nobody') return { ...base, kind: 'nobody', headline: clip(w.work?.goal ?? w.lastAsk, 120), facts: { ...facts, notes: next.what ? [{ label: 'Step', text: clip(next.what, 160) }] : [] }, next: { owner: { kind: 'nobody' } }, primary: { label: 'Do it now', command: `${c}: do the next step now` }, more: [{ label: 'Close', command: `close ${c}` }] }
	if (next?.owner.kind === 'delegate' || p.why) return { ...base, kind: 'waiting-delegate', headline: j ? clip(j.goal, 120) : w.work && !w.work.closed ? clip(w.work.goal, 120) : `Draft a reply to ${name}`, next: { owner: { kind: 'delegate' }, ...delegateNext(s, p, j) } }
	if (w.work && !w.work.closed) {
		const on = w.work.waitingOn?.who && !s.me.includes(w.work.waitingOn.who.toLowerCase()) ? w.work.waitingOn.who : undefined
		// A headline that names who it waits on already says what Next would.
		return { ...base, kind: 'waiting-others', headline: clip(on ? `${on}: ${w.work.goal}` : w.work.goal, 140), ...(on ? {} : { next }), primary: { label: 'Draft a nudge', command: `${c}: nudge them` }, more: [{ label: 'Close', command: `close ${c}` }] }
	}
	// What the asker owes, in the AI's words; their own ask would say the opposite (PM review 2).
	return { ...base, kind: 'waiting-person', headline: `Waiting on ${name} to answer`, facts: { ...facts, quote: undefined, notes: w.decision?.reason ? [{ label: 'Waiting for', text: clip(w.decision.reason, 160) }] : [] }, primary: { label: 'Draft a nudge', command: `${c}: nudge them` } }
}

// "To do: Update the release checklist": the oldest open to-do a sent reply left, Mark done for all of them (R-NEX-07).
// Only a to-do the reply promised to someone says "You promised <them>": a change Delegate refused says why, a clone to make
// says nothing more, and the owner never promised themself (review N2 P2-7).
const REFUSED = /\.\s*Not made for you:\s*/, CLONE = /^Clone \S+ on \S+ \(git clone /
export const todoHeadline = (text: string, remaining = 0) => clip(`To do: ${text.split(REFUSED)[0].replace(/[.\s]+$/, '')}${remaining ? ` (+${remaining} more)` : ''}`, 160)
function todoRow(s: Snap, base: Omit<Body, 'kind' | 'headline'>, w: Workflow): Body {
	const open = openTodos(w), t = open[0], [, why] = t.text.split(REFUSED)
	const where = s.place?.(w.chat, w.asker) ?? (w.chat.name && w.chat.name !== w.asker?.name ? w.chat.name : undefined)
	const to = !why && !CLONE.test(t.text) && w.asker?.name && !isMe(s, w.asker.name) && !isMe(s, w.asker.name.split(/\s+/)[0]) ? first(w.asker.name) : undefined
	const promise: Promise_ = { ...(to ? { to } : {}), at: t.at, ...(why ? { why: clip(why, 140) } : CLONE.test(t.text) ? {} : { why: 'no tool can do it' }) }
	// Its rev is the newest to-do it shows, so Mark done marks no to-do kept after the page drew it (re-review N2 P2-C).
	return { ...base, kind: 'todo', rev: open.map(x => x.at).sort().at(-1)!, headline: todoHeadline(t.text, open.length - 1), facts: { at: t.at, ...(where ? { where } : {}), promise }, primary: { label: 'Mark done', command: `close ${w.code}` }, more: [{ label: 'Open' }] }
}

// Who does a plan step: the owner, Delegate, or someone else in the AI's words: the person in the chat of a part of this work the
// step names (not the owner), or for the step the work waits on (its text is Next's), waitingOn. Never a made-up name (review N2 P1-2).
function workOf(s: Snap, p: Placed, w: Workflow, home: Workflow): NextWork | undefined {
	const k = home.work
	if (!k || k.closed || k.proposed) return undefined
	const who = nextWho(s, k), plan = k.plan ?? [], items = new Map(s.workflows.map(x => [x.code, x]))
	const on = k.waitingOn?.who && !isMe(s, k.waitingOn.who) ? k.waitingOn.who : undefined
	const named = plan.find(x => !x.done && !!k.next && x.what === k.next.what)
	const cur = named ?? plan.find(x => !x.done && x.who === who) ?? (who ? undefined : plan.find(x => !x.done))
	const part = (x: PlanStep) => { const it = x.in ? items.get(x.in) : undefined; return it && (it.id === home.id || it.partOf === home.id) ? it : undefined }
	const person = (x: PlanStep) => { const n = part(x)?.asker?.name; return n && !isMe(s, n) && !isMe(s, n.split(/\s+/)[0]) ? n : undefined }
	const owner = (x: PlanStep): Owner => x.who === 'you' ? { kind: 'you' } : x.who === 'me' ? { kind: 'delegate' }
		: { kind: 'others', text: htmlToText(person(x) || (x === named && on) || 'Someone else') }
	const steps = plan.map(x => ({ what: htmlToText(x.what), owner: owner(x), done: !!x.done, now: x === cur, ...(part(x) ? { where: x.in } : {}), ...(x.probe ? { build: x.probe.build } : {}) }))
	const seen = plan.filter(x => x.done && x.probe).sort((a, b) => b.done!.localeCompare(a.done!))[0]
	const check = seen && { what: seen.ring ? 'Deploy' as const : 'Build' as const, at: seen.done!, build: seen.probe!.build }
	const yourNext = plan.find(x => !x.done && x.who === 'you' && x !== cur)
	const then = who && who !== 'you' && k.next ? { owner: who === 'me' ? { kind: 'delegate' } as Owner : { kind: 'others', text: htmlToText(on ?? 'Someone else') } as Owner, what: htmlToText(k.next.what), ...(yourNext ? { you: htmlToText(yourNext.what) } : {}) } : undefined
	return {
		goal: htmlToText(k.goal), steps,
		...(who === 'you' && k.next ? { yours: { what: htmlToText(k.next.what), ...(check ? { check } : {}) } } : {}),
		...(then ? { then } : {}),
		...(p.rule === 'your-step' && w === home ? { report: `${home.code}: {result}: {text}` } : {}),
		happened: k.steps.slice(-6).reverse().map(x => ({ at: x.at, what: htmlToText(x.what), news: !!x.news })), total: k.steps.length,
	}
}

function waitRow(s: Snap, w: Waiting): Body {
	const to = firsts(w.to)
	return { kind: 'waiting-person', headline: clip(`You asked ${to}: "${w.text}"`, 160), who: whoOf(w.to[0]), facts: { where: s.place?.(w.chat, { name: w.to[0] }) ?? w.chat.name, at: w.at, verb: 'asked' }, chips: [], primary: { label: 'Draft a nudge', command: `ok ${w.code}` }, more: [{ label: 'Close', command: `skip ${w.code}` }], teams: w.msgId ? messageLink(w.chat.id, w.msgId) : undefined }
}

function reminderRow(p: Placed, a: Automation): Body {
	const facts = { who: a.to.name, where: describe(a).replace(/^R\d+ · /, ''), at: a.updatedAt }
	if (p.section === 'move') return { kind: 'reminder-new', headline: `Start reminding ${first(a.to.name)}: "${clipPlain(a.text, 90)}"?`, who: whoOf(a.to.name), facts, chips: [], primary: { label: 'Start', command: `ok ${a.code}` }, more: [{ label: 'Skip', command: `skip ${a.code}` }] }
	const next = a.state === 'paused' ? p.next : { owner: { kind: 'delegate' } as Owner, what: a.next ? `reminds ${first(a.to.name)} {at}` : `reminds ${first(a.to.name)}`, ...(a.next ? { at: a.next } : {}) }
	return { kind: 'reminder', headline: clipPlain(`Reminding ${first(a.to.name)}: "${a.text}"`, 160), who: whoOf(a.to.name), facts, chips: [], next, primary: a.state === 'paused' ? { label: 'Resume', command: `resume ${a.code}` } : { label: 'Pause', command: `pause ${a.code}` }, more: [{ label: 'Stop reminding', command: `skip ${a.code}` }] }
}

// What New and Back to you compare (N1b). Only items change: a W entry is the owner's own ask, and a reminder is the owner's.
// A watch's news is "Changed", which Got it settles, so it never counts as New (review P1-2).
function freshOf(p: Placed, w: Workflow | undefined, items: Map<string, Workflow>): Pick<NextRow, 'fresh' | 'msgs'> {
	if (!w) return {}
	const changed = p.subjects.map(c => items.get(c)).filter(x => x && x.kind !== 'tracker').map(x => x!.changedAt).filter((x): x is string => !!x).sort().at(-1)
	const back = p.section === 'move' && w.place?.section === 'move' && w.place.since > w.createdAt ? w.place.since : undefined
	const msgs = p.subjects.flatMap(c => { const x = items.get(c); return x ? msgKeys(x) : [] })
	return { fresh: { born: w.createdAt, ...(changed ? { changed } : {}), ...(back ? { back } : {}) }, ...(msgs.length ? { msgs } : {}) }
}

// Placed threads into rows. The row's button acts on the subject that placed it (a part's own code), never a guessed one.
export function rowsOf(s: Snap, placed: Placed[]): NextRow[] {
	const items = new Map(s.workflows.map(w => [w.code, w])), waits = new Map(s.waiting.map(w => [w.code, w])), autos = new Map(s.automations.map(a => [a.code, a]))
	return placed.filter(p => p.section !== 'done').map(p => {
		const w = items.get(p.act), wt = waits.get(p.act), a = autos.get(p.act)
		const body = w ? itemRow(s, p, w) : wt ? waitRow(s, wt) : reminderRow(p, a!)
		const home = w && ((w.partOf && s.workflows.find(x => x.id === w.partOf)) || w), work = w && workOf(s, p, w, home!)
		// Every item's open to-dos in the thread, the home's and its parts', each with its own code (review N2 P1-1).
		const todos = p.subjects.map(c => items.get(c)).filter((x): x is Workflow => !!x).flatMap(x => openTodos(x).map(t => ({ id: t.id, text: htmlToText(t.text), at: t.at, code: x.code })))
		const next = body.next && { ...body.next, what: body.next.what === undefined ? undefined : htmlToText(body.next.what),
			owner: body.next.owner.kind === 'others' ? { ...body.next.owner, text: htmlToText(body.next.owner.text) } : body.next.owner }
		return { code: p.code, act: p.act, section: p.section, rule: p.rule, ...body, ...(next ? { next } : {}), ...freshOf(p, w, items), ...(work ? { work } : {}), ...(todos.length ? { todos } : {}) }
	})
}

// The new page's data, built only when the new page asks (/data?ui=new): classic never pays for it.
export function nextView(store: Store, now = Date.now(), options: { snapshot?: Snap; allCatchup?: boolean; only?: boolean } = {}): NextView {
	const s = options.snapshot ?? snapshot(store, now), rows = rowsOf(s, place(s))
	const of = (sec: Section) => rows.filter(r => r.section === sec)
	// Your move: meetings that start within 2 hours first, then the oldest ask first.
	const soon = (r: NextRow) => r.kind === 'meeting' && !!r.when && Date.parse(r.when) - now < 2 * 3_600_000 ? 0 : 1
	const move = of('move').sort((a, b) => soon(a) - soon(b) || a.facts.at.localeCompare(b.facts.at))
	const changed = (r: NextRow) => r.chips.some(c => c.kind === 'changed') ? 0 : 1
	const waiting = of('waiting').sort((a, b) => changed(a) - changed(b) || b.facts.at.localeCompare(a.facts.at))
	const working = of('working').sort((a, b) => b.facts.at.localeCompare(a.facts.at))
	const high = (r: NextRow) => s.workflows.find(w => w.code === r.act)?.fyi?.weight === 'high' ? 0 : 1
	const cu = of('catchup').sort((a, b) => high(a) - high(b) || b.facts.at.localeCompare(a.facts.at))
	const reading = readingOf(store, now)
	// Paused drafts go on and sends wait (tick.ts drafts every cycle; gate.ts refuses every send).
	const off = s.runner === 'ok' ? undefined : s.runner === 'paused' ? { text: 'Paused: drafts go on, nothing is sent' } : s.runner === 'off' ? { text: `${NAME} is off`, ...(reading.at ? { since: reading.at } : {}) } : { text: s.runner === 'capped' ? 'Daily limit reached; it runs again tomorrow' : `${NAME} is ${s.runner}` }
	// One thread (#27 step 2) has no page-wide counts: they read every proposal and a week of logs.
	return { move, working, waiting, catchup: { count: cu.length, worth: cu.filter(r => high(r) === 0).length, rows: options.allCatchup ? cu : cu.slice(0, 3) }, minute: options.only ? { facts: 0, suggestions: 0 } : { facts: store.proposals().filter(p => p.state === 'needs_human').length, suggestions: store.habits().filter(h => h.state === 'suggested').length }, ...(off ? { off } : {}), ...(store.control().paused || store.config().paused ? { paused: true } : {}), handled: options.only ? 0 : handledThisWeek(store, s.workflows, new Date(now)) }
}
