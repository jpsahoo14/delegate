// Replays real Teams messages through the real pipeline (intake, routing, the AI worker, policy) in a throwaway store.
// Nothing is ever sent: the replay source refuses every send. Run: npm run eval:real (needs DELEGATE_EVAL_DIR), or DELEGATE_LOCAL=<tmp> node scripts/eval.ts <cases.json> <out-dir> [--from <store root>] [--only R01,R02]
import { site } from '../src/core/site.ts'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import type { RawMsg } from '../src/core/intake.ts'
import { htmlToText } from '../src/core/intake.ts'
import type { Config, Workflow } from '../src/core/types.ts'
import type { Source } from '../src/adapters/source.ts'
import { McpClient } from '../src/adapters/mcp-client.ts'
import { toRaw, type TeamsMsg } from '../src/adapters/source-teams.ts'
import { Store } from '../src/store/state.ts'
import { tick } from '../src/runner/tick.ts'
import { kindOf } from '../src/runner/discover.ts'

// accept: every handling that is right for this case. facts: each is a regex (any of a|b) that the draft, question, or job must contain.
// result: with --jobs, regexes the finished job's own output must contain (its draft, summary, and proposed changes; not its key or goal).
export type Expect = { accept: Outcome[]; facts?: string[]; result?: string[]; note?: string }
export type Case = { id: string; link: string; expect?: Expect }
type Place = { kind: 'chat'; chatId: string; msgId: string } | { kind: 'channel'; teamId: string; channelId: string; parentId: string; msgId: string }

export function parseLink(link: string): Place {
	const u = new URL(link)
	const [, , , chatId, msgId] = u.pathname.split('/').map(decodeURIComponent)
	const teamId = u.searchParams.get('groupId'), parentId = u.searchParams.get('parentMessageId')
	if (teamId && parentId) return { kind: 'channel', teamId, channelId: chatId, parentId, msgId }
	return { kind: 'chat', chatId, msgId }
}

type Page = { messages?: TeamsMsg[]; replies?: TeamsMsg[]; value?: TeamsMsg[]; nextLink?: string; '@odata.nextLink'?: string }
const items = (p: Page) => p.messages ?? p.replies ?? p.value ?? []
const next = (p: Page) => p.nextLink ?? p['@odata.nextLink']

// The message, up to 15 before it, and up to 30 after it (to find what the owner really replied).
export async function fetchThread(mcp: McpClient, at: Place): Promise<{ before: RawMsg[]; target: RawMsg; after: RawMsg[]; chatName: string; group: boolean }> {
	if (at.kind === 'channel') {
		const all: TeamsMsg[] = []
		let p = await mcp.call<Page>('ListChannelMessageReplies', { teamId: at.teamId, channelId: at.channelId, messageId: at.parentId, maxReplies: 50 })
		for (let i = 0; i < 10; i++) { all.push(...items(p)); if (!next(p)) break; p = await mcp.call<Page>('ListChannelMessageReplies', { teamId: at.teamId, channelId: at.channelId, messageId: at.parentId, nextLink: next(p) }) }
		const root = await findRoot(mcp, at)
		const thread = [...(root ? [root] : []), ...all.sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime))].map(toRaw)
		const i = thread.findIndex(m => m.id === at.msgId)
		if (i < 0) throw new Error(`message ${at.msgId} not found in the channel thread`)
		return { before: thread.slice(Math.max(0, i - 15), i), target: thread[i], after: thread.slice(i + 1, i + 31), chatName: 'channel thread', group: true }
	}
	const chat = await mcp.call<{ topic?: string | null; chatType?: string }>('GetChat', { chatId: at.chatId }).catch(() => ({ topic: null, chatType: undefined }))
	const newer: TeamsMsg[] = [], older: TeamsMsg[] = []
	let target: TeamsMsg | undefined
	let p = await mcp.call<Page>('ListChatMessages', { chatId: at.chatId, top: 50 })
	for (let page = 0; page < 60; page++) {
		for (const m of items(p)) {
			if (m.id === at.msgId) target = m
			else if (!target) newer.push(m)
			else if (older.length < 15) older.push(m)
		}
		if ((target && older.length >= 15) || !next(p)) break
		p = await mcp.call<Page>('ListChatMessages', { chatId: at.chatId, nextLink: next(p) })
	}
	if (!target) throw new Error(`message ${at.msgId} not found within 3000 messages of ${at.chatId}`)
	return { before: older.reverse().map(toRaw), target: toRaw(target), after: newer.reverse().slice(0, 30).map(toRaw), chatName: chat.topic || (kindOf(at.chatId) === 'oneOnOne' ? '1:1 chat' : 'group chat'), group: kindOf(at.chatId) !== 'oneOnOne' }
}

async function findRoot(mcp: McpClient, at: Extract<Place, { kind: 'channel' }>): Promise<TeamsMsg | undefined> {
	let p = await mcp.call<Page>('ListChannelMessages', { teamId: at.teamId, channelId: at.channelId, top: 50 })
	for (let i = 0; i < 20; i++) {
		const hit = items(p).find(m => m.id === at.parentId)
		if (hit || !next(p)) return hit
		p = await mcp.call<Page>('ListChannelMessages', { teamId: at.teamId, channelId: at.channelId, nextLink: next(p) })
	}
	return undefined
}

// The same interface Teams implements. It shows the pipeline the thread up to the message, then the message as new. It never sends.
export class ReplaySource implements Source {
	readonly selfChatId = 'eval-self'
	readonly said: string[] = []
	private served = false
	private readonly chatId: string
	private readonly before: RawMsg[]
	private readonly target: RawMsg
	constructor(chatId: string, before: RawMsg[], target: RawMsg) { this.chatId = chatId; this.before = before; this.target = target }
	async newMessages(chatId: string) {
		if (chatId !== this.chatId || this.served) return { msgs: [], newest: undefined, truncated: false }
		this.served = true
		return { msgs: [this.target], newest: this.target.id, truncated: false }
	}
	async recentChats() { return [] }
	async recent(chatId: string, n: number) { return chatId === this.chatId ? [...this.before, this.target].slice(-n) : [] }
	async send(): Promise<{ msgId: string }> { throw new Error('eval never sends') }
	async sendSelf(text: string) { this.said.push(text); return { msgId: `self-${this.said.length}` } }
	async deleteMessage() { throw new Error('eval never deletes') }
	async editMessage() { throw new Error('eval never edits') }
	async presence() { return { availability: 'Offline' } }
	async members() { return { guests: false } }
	async close() {}
}

export type Outcome = 'reply' | 'ask' | 'job' | 'track' | 'waiting' | 'fyi' | 'ignore' | 'not-addressed' | 'error'
export function outcomeOf(wf: Workflow | undefined, err?: string): Outcome {
	if (err) return 'error'
	if (!wf) return 'not-addressed'
	if (wf.kind === 'tracker') return 'track'
	if (wf.job || wf.state === 'waiting_on_task') return 'job'
	if (wf.fyi && wf.state === 'done' && !wf.sent) return 'fyi'
	if (wf.state === 'done' && !wf.sent) return 'ignore'
	if (wf.question || wf.choices || /_{3,}/.test(wf.draft?.text ?? '')) return 'ask'
	if (wf.draft?.text) return 'reply'
	return 'error'
}

export type Result = {
	id: string; link: string; expect?: Expect; outcome: Outcome; pass?: boolean; ms: number; error?: string
	from: string; ask: string; context: number
	got?: { intent?: string; state: string; summary: string; draft?: string; question?: string; choices?: string[]; job?: string; effects?: string[]; reason?: string; confidence?: string; sources?: string[]; gaps?: string[]; work?: string }
	ownerReply?: string; othersAfter: string[]; facts?: { fact: string; found: boolean }[]; leak?: string[]
	// --jobs only: whether the job finished in the time allowed, and what its own output contained.
	finished?: boolean; result?: { fact: string; found: boolean }[]
}

const text = (m: RawMsg) => (m.html ? htmlToText(m.body) : m.body).replace(/\s+/g, ' ').trim()

async function runCase(c: Case, base: { cfg: Config; knowledge?: string; jobs?: boolean }, mcp: McpClient): Promise<Result> {
	const t0 = Date.now()
	const at = parseLink(c.link)
	const chatId = at.kind === 'chat' ? at.chatId : at.channelId
	let th: Awaited<ReturnType<typeof fetchThread>>
	try { th = await fetchThread(mcp, at) } catch (e) { return { id: c.id, link: c.link, expect: c.expect, outcome: 'error', ms: Date.now() - t0, error: String(e).slice(0, 300), from: '', ask: '', context: 0, othersAfter: [] } }
	const owner = base.cfg.owner.id
	const ownerReply = th.after.find(m => m.from?.id === owner)
	const res: Result = { id: c.id, link: c.link, expect: c.expect, outcome: 'error', ms: 0, from: th.target.from?.name ?? '', ask: text(th.target).slice(0, 400), context: th.before.length, ownerReply: ownerReply && text(ownerReply).slice(0, 600), othersAfter: th.after.filter(m => m.from && m.from.id !== owner).slice(0, 3).map(m => `${m.from!.name}: ${text(m).slice(0, 200)}`) }
	const root = mkdtempSync(join(tmpdir(), `delegate-eval-${c.id}-`))
	if (base.knowledge && existsSync(base.knowledge)) { cpSync(base.knowledge, join(root, 'knowledge'), { recursive: true }); asOf(join(root, 'knowledge'), th.target.at.slice(0, 10)) }
	const store = new Store({ root, machine: 'eval' })
	// The worker must not read the future: Teams read tools would show it the owner's real reply. The thread before the message is in its prompt.
	// --jobs lets jobs search M365 (a shared document is found by its title), so that mode is not leak-proof.
	const agent = { ...base.cfg.agent, tools: base.cfg.agent.tools.filter(t => !/^teams-/.test(t) && (base.jobs || !(site().images && t.startsWith(`${site().images!.server}-`)))) }
	store.saveConfig({ ...base.cfg, agent, knowledge: [], historyBefore: th.target.at, runner: undefined, discover: false, summaryAt: 'off', paused: false, watch: [{ id: chatId, name: th.chatName, group: th.group }] })
	store.saveControl({ ...store.control(), autoSend: false })
	store.saveCursors({ [chatId]: th.before.at(-1)?.id ?? '0', 'eval-self': 'x' })
	const src = new ReplaySource(chatId, th.before, th.target)
	// Long jobs are recorded, not run: the decision to start one is what is measured here.
	const procs = base.jobs ? undefined : { start: () => ({ pid: 999_999 }), alive: () => true, kill: () => true, openWindow: () => {} }
	try {
		await tick(store, { source: src, procs, force: true })
		const mine = () => store.workflows().find(w => w.msgIds.includes(th.target.id))
		for (const end = Date.now() + 15 * 60_000; base.jobs && mine()?.state === 'waiting_on_task' && Date.now() < end;) {
			await new Promise(r => setTimeout(r, 20_000))
			await tick(store, { source: src, force: true })
		}
		const wf = mine()
		const job = wf?.job ? store.job(wf.job) : undefined
		res.outcome = outcomeOf(wf)
		if (!wf && store.waiting().some(w => w.msgId === th.target.id)) res.outcome = 'waiting'
		if (wf) res.got = {
			intent: wf.intent, state: wf.state, summary: wf.status, draft: wf.draft?.text, question: wf.question,
			choices: wf.choices?.options.map(o => o.label), job: job && `${job.key}: ${job.goal}`, effects: wf.effects?.map(e => (base.jobs ? `${e.summary} :: ${JSON.stringify(e.payload ?? {}).slice(0, 600)}` : e.summary)),
			reason: wf.decision?.reason, confidence: wf.decision?.confidence, sources: wf.draft?.sources.map(s => `${s.tier}:${s.ref}`), gaps: wf.gaps,
			work: wf.work && `${wf.work.goal} | done when ${wf.work.doneWhen} | ${wf.work.waitingOn ? `waiting on ${wf.work.waitingOn.who}` : `next: ${wf.work.next?.what ?? '-'}`} | ${wf.work.links.join(', ')}`,
		}
		if (base.jobs && job) res.finished = job.state === 'done' && wf?.state !== 'waiting_on_task'
		const later = (res.got?.sources ?? []).filter(x => { const id = x.match(/\/(\d{13})(?:\?|$)/)?.[1]; return id && BigInt(id) > BigInt(th.target.id) })
		if (later.length) res.leak = later
		const err = store.logs(1).find(e => e.event === 'worker' && e.error)?.error
		if (err && res.outcome === 'error') res.error = String(err).slice(0, 300)
	} catch (e) { res.outcome = 'error'; res.error = String(e).slice(0, 300) }
	if (c.expect) {
		res.pass = c.expect.accept.includes(res.outcome)
		const said = [res.got?.draft, res.got?.question, res.got?.job, res.got?.summary, ...(res.got?.choices ?? []), ...(res.got?.effects ?? [])].join(' ').toLowerCase()
		res.facts = (c.expect.facts ?? []).map(f => ({ fact: f, found: new RegExp(f, 'i').test(said) }))
		const made = [res.got?.draft, res.got?.question, res.got?.summary, ...(res.got?.effects ?? [])].join(' ')
		if (res.finished !== undefined) res.result = (c.expect.result ?? []).map(f => ({ fact: f, found: res.finished === true && new RegExp(f, 'i').test(made) }))
	}
	res.ms = Date.now() - t0
	return res
}

const clip = (s = '', n = 160) => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, n)

export function table(rs: Result[]): string {
	const scored = rs.filter(r => r.pass !== undefined), pass = scored.filter(r => r.pass).length
	const facts = rs.flatMap(r => r.facts ?? []), found = facts.filter(f => f.found).length
	const rows = rs.map(r => `| ${r.id} | ${clip(r.from, 24)} | ${clip(r.ask, 90)} | ${r.expect?.accept.join(', ') ?? ''} | ${r.outcome}${r.pass === undefined ? '' : r.pass ? ' ✓' : ' ✗'}${r.leak ? ' LEAK' : ''} | ${(r.facts ?? []).map(f => (f.found ? '✓' : '✗')).join('') || '-'} | ${clip(r.got?.question ? `Q: ${r.got.question}` : r.got?.job ?? r.got?.draft ?? r.error ?? '', 160)} | ${clip(r.ownerReply ?? '(you did not reply)', 120)} |`)
	const jobs = rs.filter(r => r.finished !== undefined), results = jobs.flatMap(r => r.result ?? [])
	const jobLine = jobs.length ? ` Jobs finished: ${jobs.filter(r => r.finished).length} of ${jobs.length}. Job results found: ${results.filter(f => f.found).length} of ${results.length}.` : ''
	return [`Action match: ${pass} of ${scored.length}. Facts found: ${found} of ${facts.length}.${jobLine} Mean time per case: ${Math.round(rs.reduce((s, r) => s + r.ms, 0) / Math.max(1, rs.length) / 1000)} s.`, '',
		'| Case | From | Ask | Expected | Got | Facts | Draft, question, or job | Your actual reply |', '| --- | --- | --- | --- | --- | --- | --- | --- |', ...rows].join('\n')
}

// Knowledge as it stood on the day of the ask: an entry whose every source is dated later is removed (review p2-7 R12).
export function asOf(dir: string, day: string): number {
	let dropped = 0
	for (const f of readdirSync(dir, { recursive: true }) as string[]) {
		if (!f.endsWith('.md')) continue
		const lines = readFileSync(join(dir, f), 'utf8').split('\n')
		const keep = lines.filter(l => {
			const dates = [...l.matchAll(/\(src: ([^()]*)\)/g)].flatMap(m => m[1].match(/\d{4}-\d{2}-\d{2}/g) ?? [])
			return !/^- \[\w+\]/.test(l) || !dates.length || dates.some(d => d <= day)
		})
		dropped += lines.length - keep.length
		if (keep.length !== lines.length) writeFileSync(join(dir, f), keep.join('\n'))
	}
	return dropped
}

// The newest earlier run that covered every case in this one.
function lastRun(dir: string, ids: string[]): Result[] {
	for (const f of readdirSync(dir).filter(f => /^results-.*\.json$/.test(f)).sort().reverse()) {
		const rs = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Result[]
		if (ids.every(id => rs.some(r => r.id === id))) return rs
	}
	return []
}

export function diff(before: Result[], after: Result[]): string[] {
	const mark = (r?: Result) => (r ? `${r.outcome}${r.pass === false ? ' ✗' : ''} facts ${(r.facts ?? []).map(f => (f.found ? '✓' : '✗')).join('') || '-'}` : '')
	return after.flatMap(r => { const b = before.find(x => x.id === r.id); return b && mark(b) !== mark(r) ? [`${r.id}: ${mark(b)} → ${mark(r)}`] : [] })
}

if (import.meta.main) {
	const dir = process.env.DELEGATE_EVAL_DIR
	const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.match(/^--(from|only)$/))
	const [casesFile, outDir] = args.length ? args : dir ? [join(dir, 'cases-real.json'), join(dir, 'run')] : []
	if (!casesFile || !outDir) { console.error('Usage: eval.ts <cases.json> <out-dir>, or set DELEGATE_EVAL_DIR to the folder with cases-real.json'); process.exit(2) }
	// Workers load this checkout's code; an edit during a run breaks them mid-case, and a result must name the code it measured.
	const git = (...a: string[]) => spawnSync('git', a, { cwd: join(import.meta.dirname, '..'), encoding: 'utf8' }).stdout.trim()
	const dirty = git('status', '--porcelain', '--', 'src', 'skills')
	if (dirty && !process.argv.includes('--dirty')) { console.error(`Commit first, or pass --dirty. Uncommitted:\n${dirty}`); process.exit(2) }
	const commit = git('rev-parse', '--short', 'HEAD') + (dirty ? '+dirty' : '')
	const from = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : join(process.env.HOME!, '.delegate-t7', 'root')
	const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : undefined
	const cases = (JSON.parse(readFileSync(casesFile, 'utf8')) as Case[]).filter(c => !only || only.includes(c.id))
	const cfg = JSON.parse(readFileSync(join(from, 'config.json'), 'utf8')) as Config
	const mcp = new McpClient(cfg.source.command)
	if (process.argv.includes('--fetch')) {
		// Threads only, for writing the expected handling before any run is seen.
		mkdirSync(outDir, { recursive: true })
		const lines: string[] = []
		for (const c of cases) {
			try {
				const th = await fetchThread(mcp, parseLink(c.link))
				const fmt = (m: RawMsg) => `- [${m.at.slice(0, 16)}] ${m.from?.name ?? 'system'}${m.from?.id === cfg.owner.id ? ' (owner)' : ''}: ${text(m).slice(0, 700)}${m.attachments?.length ? ` [attachments: ${m.attachments.map(a => `${a.name || a.type}`).join(', ')}]` : ''}`
				lines.push(`## ${c.id} · ${th.chatName}${th.group ? ' (group)' : ' (1:1)'}`, '', 'Before:', ...th.before.slice(-8).map(fmt), '', '**Target:**', fmt(th.target), '', 'After:', ...th.after.slice(0, 10).map(fmt), '')
				console.log(c.id, 'fetched', th.before.length, th.after.length)
			} catch (e) { lines.push(`## ${c.id}`, '', `Could not fetch: ${String(e).slice(0, 300)}`, ''); console.log(c.id, 'FAILED', String(e).slice(0, 200)) }
		}
		writeFileSync(join(outDir, 'threads.md'), lines.join('\n'))
		await mcp.close()
		process.exit(0)
	}
	const out: Result[] = []
	const queue = [...cases]
	const workers = Array.from({ length: Number(process.env.EVAL_PARALLEL ?? 4) }, async () => {
		for (let c = queue.shift(); c; c = queue.shift()) {
			const r = await runCase(c, { cfg, knowledge: join(from, 'knowledge'), jobs: process.argv.includes('--jobs') }, mcp)
			out.push(r)
			console.log(`${new Date().toISOString().slice(11, 19)} ${r.id} ${r.outcome}${r.pass === undefined ? '' : r.pass ? ' pass' : ' FAIL'} ${Math.round(r.ms / 1000)}s ${r.error ?? ''}`)
		}
	})
	await Promise.all(workers)
	await mcp.close()
	out.sort((a, b) => cases.findIndex(c => c.id === a.id) - cases.findIndex(c => c.id === b.id))
	mkdirSync(outDir, { recursive: true })
	const change = diff(lastRun(outDir, out.map(r => r.id)), out)
	const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
	writeFileSync(join(outDir, `results-${stamp}.json`), JSON.stringify(out, null, '\t'))
	writeFileSync(join(outDir, `results-${stamp}.md`), `# Eval ${stamp}\n\nCode: ${commit}${process.argv.includes('--jobs') ? '. Jobs ran, with M365 search: not leak-proof' : ''}.\n\n${table(out)}\n${change.length ? `\n## Changed since the last run\n\n${change.map(c => `- ${c}`).join('\n')}\n` : ''}`)
	console.log(table(out).split('\n')[0])
	console.log(change.length ? `Changed since the last run:\n${change.join('\n')}` : 'No case changed since the last run.')
	process.exit(0)
}
