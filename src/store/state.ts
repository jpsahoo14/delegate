import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { homedir, hostname, uptime } from 'node:os'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Answer, Automation, CallRec, Change, Config, Job, Local, Msg, Owner, Proposal, Report, Rule, Workflow } from '../core/types.ts'
import { itemCode, ulid } from '../core/ids.ts'
import type { Waiting } from '../core/waiting.ts'
import type { Turn } from '../core/intake.ts'
import { emptyThreadCache, type ThreadCache } from '../adapters/channels.ts'
import type { Schedule } from '../core/schedule.ts'
import type { Habit } from '../runner/habits.ts'
import { appendLine, assertTestSafe, listJson, moveTo, readJson, records, strays, writeJson } from './fs.ts'
import { alive, aliveAs } from '../os/process.ts'
import { VERSION } from '../paths.ts'
import { lessonOf, type Lesson } from './feedback.ts'
import { CMD } from '../brand.ts'
import { scrubDeep } from '../core/secrets.ts'

export const localDay = (d = new Date()) => d.toLocaleDateString('sv')

// A folder in the same synced drive as the storage root is saved relative to it ("../Features"), so every machine
// finds it although the drive's path differs (macOS "OneDrive-Acme", Windows "OneDrive - Acme").
export const portable = (root: string, p: string): string => { const r = relative(dirname(root), p); return r && !r.startsWith('..') && !isAbsolute(r) ? relative(root, p) : p }
export const here = (root: string, p: string): string => resolve(root, p)

export const LOCAL_DIR = process.env.DELEGATE_LOCAL ?? join(homedir(), '.delegate')

export function loadLocal(): Local {
	const p = join(LOCAL_DIR, 'local.json')
	const l = readJson<Partial<Local>>(p, {})
	const root = process.env.DELEGATE_ROOT ?? l.root
	if (!root) throw new Error(`No storage root. Run "${CMD} init --root <folder>" or set DELEGATE_ROOT.`)
	return { root, machine: l.machine ?? hostname().split('.')[0] }
}

export type SweepChat = { id: string; name: string; group: boolean; tries?: number }
// since..cut is the week read; left, the chats still to read; reach, how far back it could read; skipped, chats that could not be read; told, the owner heard the count.
export type Sweep = { since: string; cut?: string; left?: SweepChat[]; reach?: string; told?: boolean; skipped?: number; listTries?: number }
export type Shown = { rev: string; at: string }
export type Preview = { code: string; at: string }
// readAt: the last read with no gap left open. goodAt: the last good read. endAt: when the reading machine last ended a cycle. notice: told after the next good read.
export type ChatsState = { startedAt: string; seen: Record<string, string>; readAt?: string; gapFailAt?: string; goodAt?: string; endAt?: string; notice?: string }
type Lease = { machine: string; at: string }
export type OpenWindow = { machine: string; pid: number; runId: string; since: string; closed?: boolean }
export type Health = Record<string, { text: string; since: string; machine: string }>
export type UiChoice = { ui: 'new' | 'classic'; at?: string; tried?: string; noted?: true }
export type Control = { paused: boolean; stopped: boolean; autoSend?: boolean; at?: string }
type Notify = { lastNudgeAt?: string; previews?: Record<string, Preview | Preview[]>; snapshot?: string; summaryDay?: string; sweepDay?: string }

// Fill fields added after a file was written, so older files keep loading (R-DST-04).
function upgrade(w: Workflow): Workflow {
	w.msgIds ??= [...w.pending]
	return w
}

export type Missed = { link: string; note?: string; at: string }

export class Store {
	readonly root: string
	readonly machine: string
	constructor(local: Local) { assertTestSafe(local.root); this.root = local.root; this.machine = local.machine }

	private p(...parts: string[]) { return join(this.root, ...parts) }
	private w(path: string, v: unknown) { writeJson(path, v, this.machine) }

	config(): Config { return readJson<Config>(this.p('config.json'), null as unknown as Config) }
	saveConfig(c: Config) { this.w(this.p('config.json'), c) }

	workflows(): Workflow[] { return records<Workflow>(this.p('state', 'workflows')).map(upgrade) }
	workflow(id: string): Workflow | undefined {
		const w = readJson<Workflow | undefined>(this.p('state', 'workflows', `${id}.json`), undefined)
		return w && upgrade(w)
	}
	byCode(code: string): Workflow | undefined { return this.workflows().find(w => w.code === code.toUpperCase()) }
	openInChat(chatId: string): Workflow[] {
		return this.workflows().filter(w => w.chat.id === chatId && w.state !== 'done').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
	}
	// Every state change is recorded, so an item's history can be rebuilt from the log (R-WF-05).
	// A close says why, so counting never reads the status (R-NEX-11); `also` adds what the caller knows, such as when the ask and the reply were sent.
	save(wf: Workflow, touch = true, also?: Record<string, unknown>) {
		const before = this.workflow(wf.id)?.state
		if (touch) wf.updatedAt = new Date().toISOString()
		this.w(this.p('state', 'workflows', `${wf.id}.json`), wf)
		if (before !== wf.state) this.log({ event: 'state', workflowId: wf.id, code: wf.code, from: before ?? 'new', to: wf.state, status: wf.status?.slice(0, 120), ...(wf.state === 'done' && wf.closedBy ? { closedBy: wf.closedBy } : {}), ...also })
	}

	// AI runs started today, by this machine's local day (final review P2-2).
	runsToday(): number { const r = readJson<{ day: string; n: number }>(this.p('state', 'runs.json'), { day: '', n: 0 }); return r.day === localDay() ? r.n : 0 }
	addRun() { this.w(this.p('state', 'runs.json'), { day: localDay(), n: this.runsToday() + 1 }) }

	// What applying each queued action said, by answer id, so the page or panel that acted shows the real result.
	addOutcome(id: string, text: string) {
		const all = readJson<{ id: string; text: string; at?: string }[]>(this.p('state', 'outcomes.json'), [])
		this.w(this.p('state', 'outcomes.json'), [...all, { id, text, at: new Date().toISOString() }].slice(-100))
	}
	pruneOutcomes(before: string) {
		this.w(this.p('state', 'outcomes.json'), readJson<{ id: string; text: string; at?: string }[]>(this.p('state', 'outcomes.json'), []).filter(o => (o.at ?? '') >= before))
		for (const f of listJson(this.p('state')).filter(f => basename(f).startsWith('receipts-'))) this.w(f, readJson<{ at: string; text: string }[]>(f, []).filter(r => r.at >= before))
	}
	outcome(id: string): string | undefined {
		const mine = readJson<{ id: string; text: string }[]>(this.p('state', 'outcomes.json'), []).filter(o => o.id === id)
		return mine.length ? mine.map(o => o.text).filter(Boolean).join(' ') : undefined
	}

	// A for replies, K for knowledge proposals: separate counters, so each list reads A1, A2 and K1, K2.
	nextCode(prefix = 'A'): string {
		const path = this.p('state', prefix === 'A' ? 'counter.json' : `counter-${prefix}.json`)
		const c = readJson<{ next: number }>(path, { next: 1 })
		this.w(path, { next: c.next + 1 })
		return itemCode(c.next, prefix)
	}

	// The revision of each item last displayed in text (self-chat or AI chat). An ok there approves that revision, not "now" (review 085 P0-1).
	// Each item's last few displays, with when: a command typed before a redraft was shown approves what was on screen then (review 10-20 R1b).
	// An older file kept one revision per code, with no time; it counts as shown before any command.
	shown(): Record<string, Shown[]> {
		const raw = readJson<Record<string, string | Shown[]>>(this.p('state', 'shown.json'), {})
		return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? [{ rev: v, at: '' }] : v]))
	}
	markShown(wfs: Pick<Workflow, 'code' | 'revAt' | 'updatedAt' | 'state'>[]) {
		const want = wfs.filter(w => w.state === 'needs_human' || w.state === 'scheduled')
		if (!want.length) return
		const all = this.shown(), at = new Date().toISOString()
		this.w(this.p('state', 'shown.json'), { ...all, ...Object.fromEntries(want.map(w => [w.code, [...(all[w.code] ?? []).filter(s => s.rev !== (w.revAt ?? w.updatedAt)), { rev: w.revAt ?? w.updatedAt, at }].slice(-5)])) })
	}
	// What a text command saw: the newest revision displayed at or before it was typed, or "" when none was.
	seenRev(code: string, typedAt?: string): string {
		const seen = (this.shown()[code.toUpperCase()] ?? []).filter(s => !typedAt || !s.at || Date.parse(s.at) <= Date.parse(typedAt))
		return seen.at(-1)?.rev ?? ''
	}

	waiting(): Waiting[] { return readJson(this.p('state', 'waiting.json'), []) }
	saveWaiting(ws: Waiting[]) { this.w(this.p('state', 'waiting.json'), ws.slice(-300)) }

	automations(): Automation[] { return records<Automation>(this.p('state', 'automations')) }
	automation(code: string): Automation | undefined { return this.automations().find(a => a.code === code.toUpperCase()) }
	saveAutomation(a: Automation) { a.updatedAt = new Date().toISOString(); this.w(this.p('state', 'automations', `${a.id}.json`), a) }

	proposals(): Proposal[] { return records<Proposal>(this.p('state', 'proposals')) }
	proposal(code: string): Proposal | undefined { return this.proposals().find(p => p.code === code.toUpperCase()) }
	saveProposal(p: Proposal) { p.updatedAt = new Date().toISOString(); this.w(this.p('state', 'proposals', `${p.id}.json`), p) }

	owners(): Owner[] { return readJson(this.p('state', 'owners.json'), []) }
	saveOwners(o: Owner[]) { this.w(this.p('state', 'owners.json'), o) }

	// Results of AI-chat actions, shown at the top of the next inbox, since that chat cannot be messaged later.
	addReceipt(text: string) { this.w(this.p('state', `receipts-${this.machine}.json`), [...readJson<{ at: string; text: string }[]>(this.p('state', `receipts-${this.machine}.json`), []), { at: new Date().toISOString(), text }].slice(-20)) }
	takeReceipts(): { at: string; text: string }[] {
		const files = listJson(this.p('state')).filter(f => basename(f).startsWith('receipts-'))
		const all = files.flatMap(f => readJson<{ at: string; text: string }[]>(f, []))
		for (const f of files) rmSync(f, { force: true })
		return all.sort((a, b) => a.at.localeCompare(b.at))
	}

	// Where each bootstrap source stopped reading, so a rerun reads only newer content (R-BOOT-10).
	sources(): Record<string, string> { return readJson(this.p('state', 'sources.json'), {}) }
	saveSource(key: string, checkpoint: string) { this.w(this.p('state', 'sources.json'), { ...this.sources(), [key]: checkpoint }) }

	cursors(): Record<string, string> { return readJson(this.p('state', 'cursors.json'), {}) }
	saveCursors(c: Record<string, string>) { this.w(this.p('state', 'cursors.json'), c) }

	sent(): { id: string; text: string; at: string }[] { return readJson(this.p('state', 'sent.json'), []) }
	sentIds(): Set<string> { return new Set(this.sent().map(s => s.id).filter(Boolean)) }
	addSent(id: string, text: string) {
		const list = [...this.sent(), { id, text, at: new Date().toISOString() }].slice(-500)
		this.w(this.p('state', 'sent.json'), list)
	}
	keepSent(f: (s: { id: string; text: string; at: string }) => { id: string; text: string; at: string }) { this.w(this.p('state', 'sent.json'), this.sent().map(f)) }
	wasSentRecently(text: string, withinMs = 30 * 60_000): boolean {
		const t = text.trim()
		return this.sent().some(s => s.text.trim() === t && Date.now() - Date.parse(s.at) < withinMs)
	}

	thread(id: string): Msg[] { return readJson<Msg[]>(this.p('state', 'threads', `${id}.json`), []) }
	saveThread(id: string, msgs: Msg[]) { this.w(this.p('state', 'threads', `${id}.json`), msgs.slice(-40)) }

	threadCache(): ThreadCache { return readJson(this.p('state', 'threads.json'), emptyThreadCache()) }
	saveThreadCache(c: ThreadCache) { this.w(this.p('state', 'threads.json'), c) }

	chats(): ChatsState {
		return readJson(this.p('state', 'chats.json'), { startedAt: new Date().toISOString(), seen: {} })
	}
	saveChats(c: ChatsState) { this.w(this.p('state', 'chats.json'), c) }
	hasChats(): boolean { return existsSync(this.p('state', 'chats.json')) }
	// The first-setup read of the week before (first-sweep.md); its own file, so the chat state and the sweep never overwrite each other.
	sweep(): Sweep | undefined { return readJson<Sweep | undefined>(this.p('state', 'sweep.json'), undefined) }
	saveSweep(s: Sweep) { this.w(this.p('state', 'sweep.json'), s) }

	control(): Control { return readJson(this.p('state', 'control.json'), { paused: false, stopped: false }) }
	saveControl(c: Control) { this.w(this.p('state', 'control.json'), { ...c, at: new Date().toISOString() }) }

	health(): Health { return readJson(this.p('state', 'health.json'), {}) }
	setHealth(id: string, text?: string) {
		const h = this.health()
		if (text && h[id]?.text !== text) this.log({ event: 'health', id, text })
		if (text) h[id] = { text, since: h[id]?.since ?? new Date().toISOString(), machine: this.machine }
		else if (!h[id]) return
		else delete h[id]
		this.w(this.p('state', 'health.json'), h)
	}

	// Rules the owner put on hold by saying one of their replies was not needed; saving rules again clears them.
	heldRules(): Record<string, { code: string; at: string }> { return readJson(this.p('state', 'held-rules.json'), {}) }
	saveHeldRules(h: Record<string, { code: string; at: string }>) { this.w(this.p('state', 'held-rules.json'), h) }
	rules(): Rule[] { return readJson<{ rules?: Rule[] }>(this.p('rules.compiled.json'), {}).rules ?? [] }
	autoLedger(): { chat: string; at: string; kind: string }[] { return readJson(this.p('state', 'auto-ledger.json'), []) }
	addAuto(chat: string, kind: 'send' | 'ack') {
		const keep = this.autoLedger().filter(e => Date.now() - Date.parse(e.at) < 2 * 3_600_000)
		this.w(this.p('state', 'auto-ledger.json'), [...keep, { chat, at: new Date().toISOString(), kind }])
	}

	// Messages the owner said were missed, waiting for the next tick (B21).
	// One file per missed link, written by whichever machine heard it, like answers: no shared file to race on (review 10-19 #6).
	members(): Record<string, { ids: string[]; names?: Record<string, string>; at: string }> { return readJson(this.p('state', 'members.json'), {}) }
	saveMembers(m: Record<string, { ids: string[]; names?: Record<string, string>; at: string }>) { this.w(this.p('state', 'members.json'), m) }
	habits(): Habit[] { return readJson(this.p('state', 'habits.json'), []) }
	saveHabits(h: Habit[]) { this.w(this.p('state', 'habits.json'), h) }
	habit(code: string): Habit | undefined { return this.habits().find(h => h.code === code.toUpperCase()) }
	// When build steps were last checked; only the runner writes it (R-WRK-13).
	probeMark(): { checkedAt?: string; habitsAt?: string; prAt?: string; placedAt?: string } { return readJson(this.p('state', 'probe.json'), {}) }
	saveProbeMark(m: { checkedAt?: string; habitsAt?: string; prAt?: string; placedAt?: string }) { this.w(this.p('state', 'probe.json'), m) }
	missed(): (Missed & { file: string })[] {
		const old = this.p('state', 'missed.json')
		if (existsSync(old)) { for (const m of readJson<Missed[]>(old, [])) this.addMissed(m); rmSync(old, { force: true }) }
		return listJson(this.p('state', 'missed')).map(file => ({ ...readJson<Missed>(file, null as never), file }))
	}
	// When the owner last looked at each Done filter, kept per machine and merged, so the page never writes a file the runner writes (design-spec/done-v2.md).
	seen(): Record<string, string> { const dir = this.p('state', 'seen'), out: Record<string, string> = {}; if (existsSync(dir)) for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) for (const [k, v] of Object.entries(readJson<Record<string, string>>(join(dir, f), {}))) if (!out[k] || v > out[k]) out[k] = v; return out }
	// A mark only moves forward, so a late or repeated post never brings back rows already seen.
	// keep: which marks this machine's file keeps (per-item marks go 7 days after the item is done; N1b).
	saveSeen(keys: string[], at = new Date().toISOString(), keep: (k: string) => boolean = () => true) { const f = this.p('state', 'seen', `${this.machine}.json`), was = Object.fromEntries(Object.entries(readJson<Record<string, string>>(f, {})).filter(([k]) => keep(k))); this.w(f, { ...was, ...Object.fromEntries(keys.map(k => [k, was[k] && was[k] > at ? was[k] : at])) }) }
	// The "New experience" switch, one file per machine and never in seen/, whose marks merge across machines (R-NEX-01).
	// A missing or bad file is classic. at: when it was last set; tried: when it was first turned on; noted: the first-time note was closed.
	ui(): UiChoice {
		try { const u = readJson<Partial<UiChoice>>(this.p('state', 'ui', `${this.machine}.json`), {}); return u && (u.ui === 'new' || u.ui === 'classic') ? { ui: u.ui, ...(typeof u.at === 'string' ? { at: u.at } : {}), ...(typeof u.tried === 'string' ? { tried: u.tried } : {}), ...(u.noted ? { noted: true } : {}) } : { ui: 'classic' } } catch { return { ui: 'classic' } }
	}
	saveUi(ui: 'new' | 'classic', noted = false): UiChoice {
		const was = this.ui(), at = new Date().toISOString()
		const next: UiChoice = { ui, at, ...(was.tried || ui === 'new' ? { tried: was.tried ?? at } : {}), ...(was.noted || noted ? { noted: true } : {}) }
		this.w(this.p('state', 'ui', `${this.machine}.json`), next)
		if (was.ui !== ui) this.log({ event: 'ui', from: was.ui, to: ui })
		return next
	}
	// "Check now" from any machine: one file per machine, so two machines never write the same file.
	saveKick() { this.w(this.p('state', 'kick', `${this.machine}.json`), { at: new Date().toISOString() }) }
	kickedAt(): string { const dir = this.p('state', 'kick'); return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).map(f => readJson<{ at?: string }>(join(dir, f), {}).at ?? '').sort().at(-1) ?? '' : '' }
	addMissed(m: Missed) { this.w(this.p('state', 'missed', `${ulid()}-${this.machine}.json`), m) }
	doneMissed(file: string) { moveTo(file, this.p('state', 'done', 'missed')) }
	turns(): Record<string, Turn> { return readJson(this.p('state', 'turns.json'), {}) }
	saveTurns(t: Record<string, Turn>) { this.w(this.p('state', 'turns.json'), t) }
	activity(): { ownerLastAt?: string } { return readJson(this.p('state', 'activity.json'), {}) }
	saveActivity(a: { ownerLastAt?: string }) { this.w(this.p('state', 'activity.json'), a) }

	schedule(): Schedule { return readJson(this.p('state', 'schedule.json'), {}) }
	saveSchedule(s: Schedule) { this.w(this.p('state', 'schedule.json'), s) }

	notify(): Notify { return readJson(this.p('state', 'notify.json'), {}) }
	saveNotify(n: Notify) { this.w(this.p('state', 'notify.json'), n) }

	writeAnswer(a: Omit<Answer, 'id' | 'at'>): Answer {
		const full: Answer = { ...a, id: ulid(), at: new Date().toISOString() }
		this.w(this.p('state', 'answers', `${full.id}-${this.machine}.json`), full)
		return full
	}
	answers(): { file: string; answer: Answer }[] {
		return listJson(this.p('state', 'answers')).map(file => ({ file, answer: readJson<Answer>(file, null as never) }))
	}
	doneAnswer(file: string) { moveTo(file, this.p('state', 'done', 'answers')) }

	jobs(): Job[] { return records<Job>(this.p('state', 'jobs')) }
	// OneDrive conflict copies among the records, for doctor (restart audit R8).
	conflictCopies(): string[] { return ['workflows', 'jobs', 'automations', 'proposals'].flatMap(d => strays(this.p('state', d))) }
	job(id: string): Job | undefined { return readJson<Job | undefined>(this.p('state', 'jobs', `${id}.json`), undefined) }
	saveJob(j: Job) { j.updatedAt = new Date().toISOString(); this.w(this.p('state', 'jobs', `${j.id}.json`), j) }

	// A Continue window owns a session while this file exists. Only the window's wrapper writes it (R-HIL-08).
	openWindows(): { id: string; o: OpenWindow }[] {
		return listJson(this.p('state', 'open')).map(f => ({ id: basename(f, '.json'), o: readJson<OpenWindow>(f, null as never) }))
	}
	openWindow(id: string): OpenWindow | undefined { return readJson<OpenWindow | undefined>(this.p('state', 'open', `${id}.json`), undefined) }
	setOpenWindow(id: string, o: OpenWindow | undefined) {
		const f = this.p('state', 'open', `${id}.json`)
		if (o) this.w(f, o)
		else rmSync(f, { force: true })
	}

	// What make_change did in one change run, one record per change by its index (next action).
	changes(jobId: string, runId: string): Record<string, Change> { return readJson(this.p('state', 'changes', `${jobId}-${runId}.json`), {}) }
	callRec(call: string): CallRec | undefined { return readJson(this.p('state', 'calls', `${createHash('sha256').update(call).digest('hex')}.json`), undefined) }
	saveCallRec(r: CallRec) { this.w(this.p('state', 'calls', `${createHash('sha256').update(r.call).digest('hex')}.json`), r) }
	saveChange(jobId: string, runId: string, index: number, c: Change) { this.w(this.p('state', 'changes', `${jobId}-${runId}.json`), { ...this.changes(jobId, runId), [index]: c }) }
	// A report is scrubbed of secrets where it lands, so no token reaches chat, knowledge, or a card (owned work).
	writeReport(r: Report, runId: string) { this.w(this.p('state', 'reports', `${r.workflowId}-${runId}.json`), scrubDeep(r)) }
	// Read now, archive after the caller has saved what it applied, so a crash in between loses nothing.
	peekReport(workflowId: string, runId: string): Report | undefined {
		const f = this.p('state', 'reports', `${workflowId}-${runId}.json`)
		return existsSync(f) ? readJson<Report>(f, null as never) : undefined
	}
	archiveReport(workflowId: string, runId: string) {
		const f = this.p('state', 'reports', `${workflowId}-${runId}.json`)
		if (existsSync(f)) moveTo(f, this.p('state', 'done', 'reports'))
	}
	takeReport(workflowId: string, runId: string): Report | undefined {
		const r = this.peekReport(workflowId, runId)
		this.archiveReport(workflowId, runId)
		return r
	}

	markViewed() { this.w(this.p('state', 'viewed', `${this.machine}.json`), { at: new Date().toISOString() }) }
	// Home's "since you were away" is the start of this visit: looking again within 30 minutes keeps it, so a reload does not zero the counts.
	visitSince(now = new Date()): string | undefined {
		const last = this.lastViewed(), v = readJson<{ since?: string; started?: string }>(this.p('state', 'visit.json'), {})
		const fresh = last && now.getTime() - Date.parse(last) < 30 * 60_000 && v.started
		// A first-ever visit has no start time; a reload of it must keep that, not become "since a moment ago".
		const since = fresh ? v.since : last
		this.w(this.p('state', 'visit.json'), { since, started: fresh ? v.started : now.toISOString() })
		this.markViewed()
		return since
	}
	lastViewed(): string | undefined {
		return listJson(this.p('state', 'viewed')).map(f => readJson<{ at: string }>(f, { at: '' }).at).sort().at(-1)
	}

	// Log lines from the last N days, from every machine.
	logs(days = 1): Record<string, unknown>[] {
		const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
		const dir = this.p('state', 'log')
		if (!existsSync(dir)) return []
		return readdirSync(dir).filter(f => f.endsWith('.jsonl') && f.slice(0, 10) >= since).flatMap(f => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return {} } }))
	}

	// Each log file by its UTC day and the machine that wrote it, for counting week by week (R-NEX-11).
	logFiles(): { day: string; machine: string; file: string }[] {
		const dir = this.p('state', 'log')
		return existsSync(dir) ? readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}-.+\.jsonl$/.test(f)).map(f => ({ day: f.slice(0, 10), machine: f.slice(11, -6), file: join(dir, f) })) : []
	}
	logOf(file: string): Record<string, unknown>[] { return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } }) }
	// A finished week's counted lines, one file per machine and week (R-NEX-11).
	numberWeeks(): { machine: string; week: string; file: string }[] {
		return listJson(this.p('state', 'numbers')).map(file => basename(file, '.json')).filter(f => /-\d{4}-\d{2}-\d{2}$/.test(f)).map(f => ({ machine: f.slice(0, -11), week: f.slice(-10), file: this.p('state', 'numbers', `${f}.json`) }))
	}
	// Written once and never again: false when the file is already there.
	saveNumberWeek(machine: string, week: string, v: unknown): boolean {
		const f = this.p('state', 'numbers', `${machine}-${week}.json`)
		if (existsSync(f)) return false
		this.w(f, v)
		return true
	}

	log(entry: Record<string, unknown>) {
		const at = new Date().toISOString()
		appendLine(this.p('state', 'log', `${at.slice(0, 10)}-${this.machine}.jsonl`), scrubDeep({ at, ...entry }))
		const l = lessonOf(entry)
		if (l) appendLine(this.p('feedback', `${this.machine}.jsonl`), { at, machine: this.machine, version: VERSION, event: entry.event, ...l })
	}
	lessons(): (Lesson & { at: string; machine: string; event: string })[] {
		const dir = this.p('feedback')
		return (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.jsonl')) : []).flatMap(f => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } })).sort((a, b) => a.at.localeCompare(b.at))
	}

	// Single runner across machines (R-STO-05). Tolerates 2 minutes of clock skew (R-STO-09).
	// The machine that ran the latest cycle, and when.
	lease(): Lease | null { return readJson<Lease | null>(this.p('state', 'runner.json'), null) }
	// Some machine ran a cycle in the last few minutes, so queued work will be picked up.
	runnerLive(withinMs = 5 * 60_000): boolean { const l = readJson<{ at?: string } | null>(this.p('state', 'runner.json'), null); return !!l?.at && Date.now() - Date.parse(l.at) < withinMs }
	acquireLease(ttlMs = 10 * 60_000, skewMs = 2 * 60_000): boolean {
		const path = this.p('state', 'runner.json')
		const cur = readJson<Lease | null>(path, null)
		const stale = !cur || Date.now() - Date.parse(cur.at) > ttlMs + skewMs
		if (cur && cur.machine !== this.machine && !stale) return false
		this.w(path, { machine: this.machine, at: new Date().toISOString() })
		return true
	}
}

// One tick at a time on this machine. Creation is atomic. A lock is taken over when its process is gone, after an hour (a hung tick),
// or when it was taken before this machine last started: after a power loss its process ID may belong to another program.
export async function withTickLock<T>(fn: () => Promise<T>, bootMs = Date.now() - uptime() * 1000): Promise<T | 'locked'> {
	assertTestSafe(LOCAL_DIR)
	mkdirSync(LOCAL_DIR, { recursive: true })
	const lock = join(LOCAL_DIR, 'tick.lock')
	const token = `${process.pid} ${Date.now()} ${Math.random()}`
	if (!tryLock(lock, token)) {
		const [pid, at] = readFileSync(lock, 'utf8').split(' ').map(Number)
		if (aliveAs(pid, /node|delegate/i) && at > bootMs && Date.now() - at < 60 * 60_000) return 'locked'
		rmSync(lock, { force: true })
		if (!tryLock(lock, token)) return 'locked'
	}
	try { return await fn() } finally {
		if (existsSync(lock) && readFileSync(lock, 'utf8') === token) rmSync(lock, { force: true })
	}
}

function tryLock(path: string, token: string): boolean {
	try { const fd = openSync(path, 'wx'); writeSync(fd, token); closeSync(fd); return true }
	catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false; throw e }
}
