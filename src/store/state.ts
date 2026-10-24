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
import { appendLine, assertTestSafe, fsTime, listJson, moveTo, readJson, records, strays, writeJson } from './fs.ts'
import { alive, aliveAs } from '../os/process.ts'
import { VERSION } from '../paths.ts'
import { lessonOf, type Lesson } from './feedback.ts'
import { CMD } from '../brand.ts'
import { scrubDeep } from '../core/secrets.ts'
import type { AgentHold } from '../core/agent-failure.ts'

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
export type Experience = 'new' | 'classic'
// experience: New or Classic inside the React page, kept beside ui so an older build still reads ui as before.
export type UiChoice = { ui: 'new' | 'classic' | 'react'; experience?: Experience; at?: string; tried?: string; noted?: true }
// The experience to open: the saved one, else Classic for a machine that chose the old Classic, else New.
export const experienceOf = (c: UiChoice): Experience => c.experience ?? (c.ui === 'classic' ? 'classic' : 'new')
export type PageSubmission = {
	id: string; answerId: string; fingerprint: string; item: string; rev: string; at: string
	phase: 'prepared' | 'queued' | 'refused'; accepted: boolean; ids: string[]; text: string; processed?: boolean; status: number
	immediate?: boolean
	refused?: boolean
	uncertain?: boolean
	intent?: import('../web/react/domain/contracts.ts').Intent
}
export type Control = { paused: boolean; stopped: boolean; autoSend?: boolean; at?: string }
type Notify = { lastNudgeAt?: string; previews?: Record<string, Preview | Preview[]>; snapshot?: string; summaryDay?: string; sweepDay?: string }

// Fill fields added after a file was written, so older files keep loading (R-DST-04).
function upgrade(w: Workflow): Workflow {
	w.msgIds ??= [...w.pending]
	// Before N2 a sent reply's to-dos were plain text that the next turn dropped: they become kept to-dos, dated by the send (R-NEX-07).
	// Only on a sent item that is done or open; a later turn's draft has its own to-dos, not yet promised.
	if (!w.kept && w.todos?.length && w.sent && (w.state === 'done' || w.state === 'open')) w.kept = [...new Set(w.todos)].map((text, i) => ({ id: `t${i + 1}`, text, at: w.sent!.at }))
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
	addOutcome(id: string, text: string, refused = false) {
		const all = readJson<{ id: string; text: string; at?: string; refused?: true }[]>(this.p('state', 'outcomes.json'), [])
		this.w(this.p('state', 'outcomes.json'), [...all, { id, text, at: new Date().toISOString(), ...(refused ? { refused: true as const } : {}) }].slice(-100))
	}
	outcomeRefused(id: string): boolean {
		return readJson<{ id: string; refused?: true }[]>(this.p('state', 'outcomes.json'), []).some(result => result.id === id && result.refused)
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
	withdrawnKnowledgeSources(): string[] { return readJson(this.p('state', 'withdrawn-knowledge-sources.json'), []) }
	withdrawKnowledgeSource(link: string) { this.w(this.p('state', 'withdrawn-knowledge-sources.json'), [...new Set([...this.withdrawnKnowledgeSources(), link])]) }

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
	agentHold(): AgentHold | undefined { return readJson<AgentHold | null>(this.p('state', 'agent-hold.json'), null) ?? undefined }
	saveAgentHold(hold?: AgentHold) { this.w(this.p('state', 'agent-hold.json'), hold ?? null) }
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
	probeMark(): { checkedAt?: string; habitsAt?: string; prAt?: string; placedAt?: string; runFailRepairAt?: string; partsRepairAt?: string; noNewsRepairAt?: string; blockedRepairAt?: string; hostToolsUpgrade?: number } { return readJson(this.p('state', 'probe.json'), {}) }
	saveProbeMark(m: { checkedAt?: string; habitsAt?: string; prAt?: string; placedAt?: string; runFailRepairAt?: string; partsRepairAt?: string; noNewsRepairAt?: string; blockedRepairAt?: string; hostToolsUpgrade?: number }) { this.w(this.p('state', 'probe.json'), m) }
	upgrades(): Record<string, string> { return readJson(this.p('state', 'upgrades.json'), {}) }
	saveUpgrades(m: Record<string, string>) { this.w(this.p('state', 'upgrades.json'), m) }
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
		try {
			const u = readJson<Partial<UiChoice>>(this.p('state', 'ui', `${this.machine}.json`), {})
			return u && (u.ui === 'new' || u.ui === 'classic' || u.ui === 'react') ? { ui: u.ui, ...(u.experience === 'new' || u.experience === 'classic' ? { experience: u.experience } : {}), ...(typeof u.at === 'string' ? { at: u.at } : {}), ...(typeof u.tried === 'string' ? { tried: u.tried } : {}), ...(u.noted ? { noted: true } : {}) } : { ui: 'classic' }
		} catch { return { ui: 'classic' } }
	}
	// experience: only a real choice passes one (the experience switch, or choosing the old Classic or New); a note closed keeps it.
	saveUi(ui: UiChoice['ui'], noted = false, experience?: Experience): UiChoice {
		const was = this.ui(), at = new Date().toISOString()
		const exp = experience ?? was.experience
		const next: UiChoice = { ui, ...(exp ? { experience: exp } : {}), at, ...(was.tried || ui === 'new' ? { tried: was.tried ?? at } : {}), ...(was.noted || noted ? { noted: true } : {}) }
		this.w(this.p('state', 'ui', `${this.machine}.json`), next)
		if (was.ui !== ui) this.log({ event: 'ui', from: was.ui, to: ui })
		if (experienceOf(was) !== experienceOf(next)) this.log({ event: 'experience', from: experienceOf(was), to: experienceOf(next) })
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

	writeAnswer(a: Omit<Answer, 'id' | 'at'>, submissionId?: string): Answer {
		const id = submissionId ?? ulid()
		if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) throw new Error('An answer identity must preserve time order.')
		const existing = submissionId ? this.answerById(id) : undefined
		if (existing) {
			const { id: _id, at: _at, ...previous } = existing
			if (JSON.stringify(previous) !== JSON.stringify(a)) throw new Error('That submission already has a different answer.')
			return existing
		}
		const full: Answer = { ...a, id, at: new Date().toISOString() }
		this.w(this.p('state', 'answers', `${full.id}-${this.machine}.json`), full)
		return full
	}
	answerById(id: string): Answer | undefined {
		if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid answer identity.')
		for (const directory of [this.p('state', 'answers'), this.p('state', 'done', 'answers')]) {
			for (const file of listJson(directory)) if (basename(file).startsWith(`${id}-`)) return readJson<Answer | undefined>(file, undefined)
		}
		return undefined
	}
	answered(id: string): boolean {
		if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) throw new Error('Invalid answer identity.')
		return listJson(this.p('state', 'done', 'answers')).some(file => basename(file).startsWith(`${id}-`) && readJson<Answer | undefined>(file, undefined)?.id === id)
	}
	pageSubmission(id: string): PageSubmission | undefined {
		if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid page submission identity.')
		return readJson<PageSubmission | undefined>(this.p('state', 'page-submissions', `${id}.json`), undefined)
	}
	withPageSubmission<T>(id: string, action: () => T): T {
		if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid page submission identity.')
		return withReceiptLock(this.p('state', 'page-submissions', `${id}.json`), action)
	}
	// The same, for the page server: at once or BUSY, never a wait on its thread (#27 b).
	withPageSubmissionNow<T>(id: string, action: () => T): T | typeof BUSY {
		if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid page submission identity.')
		return withReceiptLockNow(this.p('state', 'page-submissions', `${id}.json`), action)
	}
	private updatePageSubmission(id: string, update: (current: PageSubmission | undefined) => PageSubmission | undefined): PageSubmission | undefined {
		return this.withPageSubmission(id, () => {
			const path = this.p('state', 'page-submissions', `${id}.json`)
			for (let attempt = 0; ; attempt++) {
				const current = this.pageSubmission(id), next = update(current)
				if (!next || JSON.stringify(current) === JSON.stringify(next)) return next
				try { this.w(path, next); return next } catch (error) {
					if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !existsSync(dirname(path)) || attempt >= 4) throw error
					this.log({ event: 'page-receipt-race-recovered', id, attempt: attempt + 1 })
					// Re-read under the receipt lock before deciding whether this write is still needed.
				}
			}
		})
	}
	savePageSubmission(submission: PageSubmission): PageSubmission {
		return this.updatePageSubmission(submission.id, current => mergeSubmission(current, submission))!
	}
	completePageSubmission(answer: Answer, text?: string, refused = false): void {
		if (!answer.pageSubmissionId) return
		this.updatePageSubmission(answer.pageSubmissionId, record => {
			if (!record) { this.log({ event: 'page-receipt-missing', id: answer.id, code: answer.code }); return undefined }
			const detail = text ? record.processed ? record.text === text || record.text.endsWith(` ${text}`) ? record.text : `${record.text} ${text}` : text :
				record.processed ? record.text : 'No result detail was recorded. Open the item to verify what happened.'
			return mergeSubmission(record, { ...record, phase: 'queued', accepted: true, ids: [answer.id], processed: true, text: detail, refused: !!record.refused || refused }, true)
		})
	}
	answers(): { file: string; answer: Answer }[] {
		return listJson(this.p('state', 'answers')).map(file => ({ file, answer: readJson<Answer>(file, null as never) }))
	}
	doneAnswer(file: string) { moveTo(file, this.p('state', 'done', 'answers')) }

	jobs(): Job[] { return records<Job>(this.p('state', 'jobs')) }
	// OneDrive conflict copies among the records, for doctor (restart audit R8).
	conflictCopies(): string[] { return ['workflows', 'jobs', 'automations', 'proposals'].flatMap(d => strays(this.p('state', d))) }
	job(id: string): Job | undefined { return readJson<Job | undefined>(this.p('state', 'jobs', `${id}.json`), undefined) }
	// A finished job has no error: one kept from a failed earlier run would read as this run's (bug 10-23 E36).
	saveJob(j: Job) { j.updatedAt = new Date().toISOString(); if (j.state === 'done' && j.error) j.error = undefined; this.w(this.p('state', 'jobs', `${j.id}.json`), j) }

	// Images pasted inline into a message (data URIs), by content key, so a worker can open them (bug 10-23 E17).
	saveMedia(key: string, type: string, data: string) { if (/^[0-9a-f]{16,40}$/.test(key) && !this.media(key)) this.w(this.p('state', 'media', `${key}.json`), { type, data }) }
	media(key: string): { type: string; data: string } | undefined { return /^[0-9a-f]{16,40}$/.test(key) ? readJson<{ type: string; data: string } | undefined>(this.p('state', 'media', `${key}.json`), undefined) : undefined }

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
	archivedReport(workflowId: string, runId: string): Report | undefined {
		if (!/^[\w-]+$/.test(workflowId) || !/^[\w-]+$/.test(runId)) return undefined
		return readJson<Report | undefined>(this.p('state', 'done', 'reports', `${workflowId}-${runId}.json`), undefined)
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

const submissionRank = (r: PageSubmission) => r.uncertain ? 4 : r.refused || r.phase === 'refused' ? 3 : r.processed ? 2 : r.accepted || r.phase === 'queued' ? 1 : 0
function mergeSubmission(current: PageSubmission | undefined, next: PageSubmission, detail = false): PageSubmission {
	if (!current) return next
	if (current.fingerprint !== next.fingerprint || current.answerId !== next.answerId || current.item !== next.item || current.rev !== next.rev) throw new Error('That submission identity was already used for a different action.')
	const before = submissionRank(current), after = submissionRank(next)
	const winner = after > before || after === before && (before < 2 || detail) ? next : current
	return { ...current, ...winner, accepted: current.accepted || next.accepted, processed: current.processed || next.processed,
		refused: current.refused || next.refused || current.phase === 'refused' || next.phase === 'refused' || undefined,
		uncertain: current.uncertain || next.uncertain, ids: [...new Set([...current.ids, ...next.ids])] }
}

const receiptLocks = new Set<string>()
const busyReceiptLock = (error: unknown) => ['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')
function readReceiptLock(path: string): string | null | undefined {
	try { return readFileSync(path, 'utf8') } catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		if (busyReceiptLock(error)) return null
		throw error
	}
}
function tryReceiptLock(path: string, token: string): boolean {
	try { return tryLock(path, token) } catch (error) {
		if (busyReceiptLock(error)) return false
		throw error
	}
}
function releaseReceiptLock(path: string, token: string) {
	const deadline = Date.now() + 10_000, t = performance.now()
	try { releaseLoop(path, token, deadline) } finally { fsTime.lock += performance.now() - t }
}
function releaseLoop(path: string, token: string, deadline: number) {
	for (;;) {
		const holder = readReceiptLock(path)
		if (holder !== null && holder !== token) return
		try { if (holder === token) { rmSync(path, { force: true }); return } } catch (error) { if (!busyReceiptLock(error)) throw error }
		if (Date.now() >= deadline) throw new Error(`Could not release page receipt lock ${basename(path)}.`)
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
	}
}
// The page server takes a receipt lock at once or not at all, never spinning on its one thread (#27 b): the caller reads without it
// or waits asynchronously. BUSY says another process holds it.
export const BUSY = Symbol('busy')
function withReceiptLockNow<T>(path: string, action: () => T): T | typeof BUSY {
	assertTestSafe(path)
	if (receiptLocks.has(path)) return action()
	mkdirSync(dirname(path), { recursive: true })
	const lock = `${path}.lock`, token = `${process.pid} ${Date.now()} ${Math.random()}`
	if (!tryReceiptLock(lock, token)) {
		const holder = readReceiptLock(lock), pid = Number(holder?.split(' ')[0])
		// Gone, or this very process outside any receipt action: a lock left behind (a release OneDrive refused), taken over.
		if (!holder || !Number.isSafeInteger(pid) || pid <= 0 || alive(pid) && pid !== process.pid) return BUSY
		releaseReceiptLock(lock, holder)
		if (!tryReceiptLock(lock, token)) return BUSY
	}
	receiptLocks.add(path)
	try { return action() } finally {
		receiptLocks.delete(path)
		releaseReceiptLock(lock, token)
	}
}
function withReceiptLock<T>(path: string, action: () => T): T {
	assertTestSafe(path)
	if (receiptLocks.has(path)) return action()
	mkdirSync(dirname(path), { recursive: true })
	const lock = `${path}.lock`, token = `${process.pid} ${Date.now()} ${Math.random()}`, deadline = Date.now() + 10_000, t = performance.now()
	try { takeLoop(lock, token, deadline, path) } finally { fsTime.lock += performance.now() - t }
	receiptLocks.add(path)
	try { return action() } finally {
		receiptLocks.delete(path)
		releaseReceiptLock(lock, token)
	}
}
// Waits for the receipt lock, taking it over from a process that is gone.
function takeLoop(lock: string, token: string, deadline: number, path: string) {
	while (!tryReceiptLock(lock, token)) {
		if (Date.now() >= deadline) throw new Error(`Timed out waiting for page receipt ${basename(path)}. Check its saved result before acting again.`)
		const holder = readReceiptLock(lock)
		if (holder === undefined || holder === null) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); continue }
		const pid = Number(holder.split(' ')[0])
		if (Number.isSafeInteger(pid) && pid > 0 && !alive(pid)) {
			releaseReceiptLock(lock, holder)
			continue
		}
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
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
