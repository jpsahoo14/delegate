import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RawMsg } from '../src/core/intake.ts'
import type { Config, Report, Workflow } from '../src/core/types.ts'
import type { ReadOpts, Source } from '../src/adapters/source.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-slocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { tick } = await import('../src/runner/tick.ts')
const { decide } = await import('../src/core/policy.ts')
const CTX = { autoSend: true, autoSendsThisHour: 0, maxPerHour: 9 }

const OWNER = { id: 'me', name: 'Robin Park' }
const H = 3_600_000, D = 24 * H
const DM = (n: string) => `19:me_${n}@unq.gbl.spaces`
const GROUP = '19:release@thread.v2', SPEC = '19:spec@thread.v2'

// Teams-like: message IDs grow with time, reads are newest first and end at a time, a stop, or a page limit.
class WeekSource implements Source {
	readonly selfChatId = 'self'
	chats: Record<string, RawMsg[]> = { self: [] }
	names: Record<string, string> = {}
	private n = 0
	fail = new Set<string>()
	gone = new Set<string>()
	reads: string[] = []
	searched: [string, string][] = []
	extra: { id: string; name: string; lastAt: string }[] = []
	full = false
	fillAt = new Date(Date.now() - H).toISOString()
	post(chatId: string, from: string | null, body: string, ago = 0, html = false) {
		this.chats[chatId] ??= []
		const at = new Date(Date.now() - ago).toISOString()
		const m: RawMsg = { id: String(Date.parse(at) * 100 + ++this.n), at, from: from === null ? null : { id: from === 'me' ? 'me' : from.toLowerCase(), name: from === 'me' ? OWNER.name : from }, html, body }
		this.chats[chatId].push(m)
		this.chats[chatId].sort((a, b) => (BigInt(a.id) > BigInt(b.id) ? 1 : -1))
		return m.id
	}
	async newMessages(chatId: string, afterId?: string, sinceIso?: string, o: ReadOpts = {}) {
		this.reads.push(chatId)
		if (this.fail.delete(chatId)) throw new Error('read failed')
		if (this.gone.has(chatId)) throw new Error('403 Forbidden')
		const all = this.chats[chatId] ?? []
		const newest = all.at(-1)?.id ?? afterId
		if (!afterId && !sinceIso) return { msgs: [], newest, truncated: false }
		const out: RawMsg[] = []
		for (const m of [...all].reverse()) {
			if (afterId ? BigInt(m.id) <= BigInt(afterId) : m.at <= sinceIso!) break
			out.push(m)
			if (o.stop?.(m)) break
			if (o.maxPages && out.length >= o.maxPages * 20) return { msgs: out.reverse(), newest, truncated: true }
		}
		return { msgs: out.reverse(), newest, truncated: false }
	}
	async recentChats() {
		const list = Object.entries(this.chats).filter(([id]) => id !== 'self').map(([id, m]) => ({ id, name: this.names[id] ?? id, lastAt: m.at(-1)?.at ?? '' })).sort((a, b) => b.lastAt.localeCompare(a.lastAt))
		return this.full ? list.filter(c => !this.extra.some(e => e.id === c.id)).concat(Array.from({ length: 45 }, (_, i) => ({ id: `filler${i}`, name: 'Filler', lastAt: this.fillAt }))) : list
	}
	async awaiting(since: string, until: string) { this.searched.push([since, until]); return this.extra }
	async recent(chatId: string, n: number) { return (this.chats[chatId] ?? []).slice(-n) }
	async send(chatId: string, text: string) { return { msgId: this.post(chatId, 'me', text) } }
	async sendSelf(text: string) { return { msgId: this.post('self', 'me', text) } }
	async deleteMessage() {}
	async editMessage() {}
	async presence() { return { availability: 'Offline' } }
	async members() { return { guests: false } }
	async close() {}
}

let store: InstanceType<typeof Store>, src: WeekSource, runs: string[], prompts: string[]
let script: (prompt: string, workflowId: string) => Report = (_, workflowId) => ({ workflowId, intent: 'status_next_step', state: 'needs_human', reply: { text: 'Sorry for the late reply: Friday.', commitment: false, sources: [] }, summary: 'Answer' } as unknown as Report)
const run = async (_: Config['agent'], i: { workflowId: string; runId: string; prompt: string }) => { runs.push(i.workflowId); prompts.push(i.prompt); store.writeReport(script(i.prompt, i.workflowId), i.runId); return { exitCode: 0, ms: 1 } }
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {}, bootMs: () => Date.now() - 30 * D }
const go = () => tick(store, { source: src, run, procs, force: true, history: { search: async () => [], close: async () => {} } })
const items = () => store.workflows().filter(w => w.kind === 'reply')
const of = (name: string) => items().filter(w => w.asker?.name === name)

beforeEach(() => {
	store = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-sroot-')), machine: 'mac' })
	store.saveConfig({ schema: 1, owner: OWNER, source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 2, nudgeEveryMin: 30, quiet: { from: '00:00', to: '00:00' }, summaryAt: 'off', channels: false } as Config)
	src = new WeekSource(); runs = []; prompts = []
	src.post('self', 'me', 'set up delegate', 10 * 60_000)
	script = (_, workflowId) => ({ workflowId, intent: 'status_next_step', state: 'needs_human', reply: { text: 'Sorry for the late reply: Friday.', commitment: false, sources: [] }, summary: 'Answer' } as unknown as Report)
})

test('first setup reads the week before: people still waiting on you become items marked From before setup; what you answered, chatter, system messages, and older than 7 days do not', async () => {
	src.post(DM('ana'), 'Ana', 'hi', 6 * D); src.post(DM('ana'), 'Ana', 'can you review my PR?', 5 * D); src.post(DM('ana'), 'Ana', 'ping?', 4 * D)
	src.post('19:date@thread.v2', 'Yan', 'we need a date for the review', 3 * D); src.post('19:date@thread.v2', 'me', 'which day works for you?', 3 * D - H); src.post('19:date@thread.v2', 'Yan', 'Friday', 2 * D)
	const live = { 'other-chat': { owner: { at: new Date().toISOString(), to: ['x'], text: 'live' } } }
	store.saveTurns(live)
	src.post(GROUP, 'Zed', 'morning all', 4 * D); src.post(GROUP, 'me', 'Bob, which date works for you?', 3 * D); src.post(GROUP, 'Bob', 'Friday works', 2 * D); src.post(GROUP, 'Cat', 'lunch anyone?', D)
	src.post(SPEC, 'Dan', 'Robin, can you confirm the rollout plan?', 2 * D)
	src.post(DM('eve'), 'Eve', 'is the doc ready?', 3 * D); src.post(DM('eve'), 'me', 'yes, linked it', 2 * D)
	src.post(DM('fay'), 'Fay', 'I have the logs', 2 * D); src.post(DM('fay'), 'me', '<p><at id="0">Fay</at> can you send the trace IDs?</p>', D, true)
	src.post(DM('gus'), 'Gus', 'old question?', 9 * D)
	src.post(DM('bot'), null, 'Build 123 failed', D)
	await go()
	assert.deepEqual(items().map(w => w.asker?.name).sort(), ['Ana', 'Bob', 'Dan', 'Yan'], 'only people still waiting on you; Yan answered the question you asked after him')
	const [ana] = of('Ana')
	assert.equal(ana.msgIds.length, 3, 'three messages over three quiet days from one person are one item')
	assert.ok(items().every(w => w.before), 'each is marked From before setup')
	assert.equal(store.waiting().length, 1, 'what you asked Fay and nobody answered is waiting on her')
	assert.deepEqual(store.waiting()[0].to, ['Fay'])
	assert.deepEqual(store.turns(), live, 'the read of the week never changes the live turns')
	assert.ok(!src.reads.includes(DM('gus')), 'a chat quiet for more than 7 days is not read')
	const bob = of('Bob')[0]
	assert.ok(store.thread(bob.id).map(m => m.at).every((at, i, a) => !i || a[i - 1] <= at), 'an old ask sits in time order among the newer lines')
})

test('first setup: drafts from the week before wait for you even when a rule would send or acknowledge, and the run is told it is old', async () => {
	src.post(DM('ana'), 'Ana', 'can you review my PR?', 2 * D)
	await go()
	const [ana] = of('Ana')
	assert.equal(ana.state, 'needs_human')
	assert.match(prompts.join('\n'), /came before the owner set up Delegate/)
	const rule = { id: 'r1', text: 'all', who: { accounts: [{ id: 'ana', name: 'Ana' }] }, when: {}, then: 'send' }
	for (const then of ['send', 'ack'] as const) assert.deepEqual([decide(ana, [{ ...rule, then } as never], CTX).action, decide(ana, [{ ...rule, then } as never], CTX).reason], ['draft', 'It came before setup; replies to older messages wait for you'])
	assert.notEqual(decide({ ...ana, before: undefined } as Workflow, [rule as never], CTX).reason, 'It came before setup; replies to older messages wait for you', 'a live ask is not held for this')
	src.post(DM('ana'), 'Ana', 'also, the ring date?')
	await go()
	assert.equal(of('Ana')[0].before, true, 'a later ask on it keeps the hold')
})

test('first setup: live asks are drafted first; the week before goes a few per check; one line tells the real count when all are read', async () => {
	for (const n of ['Amir', 'Bea', 'Cyd', 'Dov', 'Eli']) src.post(DM(n.toLowerCase()), n, 'can you help?', 2 * D)
	script = (p, workflowId) => /\b(Dov|Eli):/.test(p) && /came before/.test(p) ? ({ workflowId, intent: 'none', state: 'done', summary: 'Nothing needed', fyi: { line: 'FYI only', weight: 'normal', ...(/\bEli:/.test(p) ? { watch: { target: 'the doc', until: 'it ships' } } : {}) } } as unknown as Report) : ({ workflowId, intent: 'status_next_step', state: 'needs_human', reply: { text: 'Friday.', commitment: false, sources: [] }, summary: 'Answer' } as unknown as Report)
	await go()
	assert.equal(runs.length, 2, 'two per check (maxParallel)')
	src.post(DM('live'), 'Liv', 'urgent: can you join?')
	await go()
	const liv = of('Liv')[0]
	assert.equal(runs[2], liv.id, 'the live ask goes first')
	assert.equal(liv.before, undefined)
	assert.ok(!src.chats.self.some(m => /I read your chats/.test(m.body)), 'no count until every one is triaged')
	await go(); await go()
	const line = src.chats.self.filter(m => /I read your chats/.test(m.body))
	assert.deepEqual(line.map(m => m.body), ['Assistant · I read your chats from the last 7 days: 3 still need you (in Needs you, marked From before setup), 1 to keep an eye on (Catch up). Nothing is sent without your ok.'])
	assert.equal(of('Dov')[0].fyi, undefined, 'an FYI from the week before with nothing to watch does not fill Catch up')
	assert.equal(of('Eli')[0].fyi?.watch?.target, 'the doc')
	await go()
	assert.equal(src.chats.self.filter(m => /I read your chats/.test(m.body)).length, 1, 'told once')
})

test('first setup: a read that fails resumes at that chat on the next check, with no item made twice', async () => {
	src.post(DM('ana'), 'Ana', 'can you review?', 3 * D)
	src.post(DM('bob'), 'Bob', 'can you approve?', 2 * D)
	src.fail.add(DM('ana'))
	let planned = 0
	const history = { search: async () => [], close: async () => {}, conversations: async () => { planned++; return [] } }
	store.saveJob({ schema: 1, id: 'kb', key: 'bootstrap:chats', goal: 'Read chats', session: { agent: 'copilot', id: 's' }, state: 'queued', purpose: 'work', parents: [], asks: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never)
	await tick(store, { source: src, run, procs, force: true, history })
	assert.equal(planned, 0, 'the knowledge read of chats waits while the week is still being read')
	const first = items().length
	await go()
	assert.deepEqual(items().map(w => w.asker?.name).sort(), ['Ana', 'Bob'])
	assert.ok(first <= 1)
	await go()
	assert.equal(items().length, 2, 'nothing made twice')
})

test('first setup: an old ask whose sender writes again after setup is two items, the old one held; a chat read again after a crash makes nothing new', async () => {
	src.post(DM('ana'), 'Ana', 'can you review?', 3 * D)
	src.fail.add(DM('ana'))
	await go()
	src.post(DM('ana'), 'Ana', 'new thing: can you join the call?')
	await go()
	const ana = of('Ana').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
	assert.deepEqual(ana.map(w => [w.lastAsk, !!w.before]), [['new thing: can you join the call?', false], ['can you review?', true]], 'the old ask never joins the live item')
	assert.ok(store.thread(ana[1].id).map(m => m.at).every((at, i, a) => !i || a[i - 1] <= at), 'the old ask sits before what came after setup')
	store.save({ ...ana[1], state: 'done', status: 'Nothing needed' })
	const n = items().length
	store.saveSweep({ ...store.sweep()!, left: [{ id: DM('ana'), name: 'Ana', group: false }], told: undefined })
	await go()
	assert.equal(items().length, n, 'read again, nothing is made twice')
})

test('first setup: a full chat list is extended by search for the days it did not reach; with no search it says how far back it read', async () => {
	src.post(DM('old'), 'Olga', 'can you check this?', 6 * D)
	src.extra = [{ id: DM('old'), name: 'Olga', lastAt: new Date(Date.now() - 6 * D).toISOString() }]
	src.full = true
	await go()
	assert.equal(src.searched.length, 1)
	assert.deepEqual(of('Olga').length, 1, 'search found the chat the list did not reach')
	const cfg = store.config()
	store = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-sroot-')), machine: 'mac' })
	store.saveConfig(cfg)
	src.awaiting = async () => { throw new Error('search down') }
	runs = []
	await go(); await go(); await go()
	const oldest = (await src.recentChats()).map(c => c.lastAt).sort()[0]
	assert.equal(store.sweep()!.reach, oldest)
	assert.match(src.chats.self.filter(m => /I read your chats/.test(m.body)).at(-1)?.body ?? '', new RegExp(`^Assistant · I read your chats since ${oldest.slice(0, 10)}: nobody from before setup is still waiting on you. Older chats were out of reach.$`), 'the count says how far back it could read')
})

test('first setup only: a second machine, an update, or a state file not yet synced never reads the week before', async () => {
	const { planSweep } = await import('../src/runner/sweep.ts')
	src.post(DM('ana'), 'Ana', 'can you review?', 2 * D)
	store.saveChats({ startedAt: new Date(Date.now() - 30 * D).toISOString(), seen: {} })
	await go()
	assert.deepEqual([store.sweep(), items().some(w => w.before)], [undefined, false], 'chat state exists: not the first read')
	const s2 = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-sroot-')), machine: 'vm' })
	s2.saveConfig(store.config())
	s2.saveCursors({ self: '1', [DM('ana')]: '2' })
	assert.equal(planSweep(s2), false, 'cursors for chats: not the first read')
	s2.saveCursors({ self: '1' })
	assert.equal(planSweep(s2), true, 'only the self-chat cursor: setup wrote there, and this is the first read')
})

test('first setup: a topic split from an item of the week before keeps the hold', async () => {
	const { splitOff } = await import('../src/runner/intake.ts')
	src.post(DM('ana'), 'Ana', 'can you review PR 12?', 2 * D); src.post(DM('ana'), 'Ana', 'also, what time is standup?', 2 * D - H)
	script = (_, workflowId) => ({ workflowId, intent: 'none', state: 'needs_human', question: 'Which?', summary: 'Asking' } as unknown as Report)
	await go()
	const [ana] = of('Ana')
	const split = splitOff(store, store.config(), ana, [ana.msgIds[1]])!
	assert.equal(split.before, true)
	assert.equal(decide(split, [{ id: 'r1', text: 'all', who: { accounts: [{ id: 'ana', name: 'Ana' }] }, when: {}, then: 'ack' } as never], CTX).action, 'draft')
})

test('first setup: a chat that cannot be read is skipped after three tries, the rest goes on, and the count says so', async () => {
	src.post(DM('ana'), 'Ana', 'can you review?', 2 * D)
	src.post(DM('zoe'), 'Zoe', 'can you approve?', 3 * D)
	src.gone.add(DM('zoe'))
	let planned = 0
	store.saveJob({ schema: 1, id: 'kb', key: 'bootstrap:chats', goal: 'Read chats', session: { agent: 'copilot', id: 's' }, state: 'queued', purpose: 'work', parents: [], asks: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never)
	const t = () => tick(store, { source: src, run, procs, force: true, history: { search: async () => [], close: async () => {}, conversations: async () => { planned++; return [] } } })
	for (let i = 0; i < 4; i++) await t()
	assert.deepEqual(items().map(w => w.asker?.name), ['Ana'])
	assert.ok(planned > 0, 'the knowledge read starts once the week is read')
	assert.match(src.chats.self.filter(m => /I read your chats/.test(m.body)).at(-1)?.body ?? '', /^Assistant · I read your chats from the last 7 days \(1 chat could not be read\): 1 still needs you/)
})

test('first setup: one check reads for at most 90 seconds, then the next goes on', async () => {
	const { planSweep, sweep } = await import('../src/runner/sweep.ts')
	for (const n of ['a', 'b', 'c']) src.post(DM(n), `P${n}`, 'can you help?', 2 * D)
	store.saveChats({ startedAt: new Date().toISOString(), seen: {} })
	const { rmSync } = await import('node:fs'); rmSync(join(store.root, 'state', 'chats.json'))
	planSweep(store); store.saveChats({ startedAt: new Date().toISOString(), seen: {} })
	let clock = 0
	await sweep(store, src, store.config(), () => (clock += 50_000))
	assert.equal(store.sweep()!.left!.length, 2, 'one chat, then the time was up')
	await sweep(store, src, store.config())
	assert.equal(store.sweep()!.left!.length, 0)
})

test('first setup search: whole days up to the day after the list ends, then the exact times', async () => {
	const { TeamsSource } = await import('../src/adapters/source-teams.ts')
	const asked: string[] = []
	const hit = (chatId: string, at: string) => ({ resource: { chatId, createdDateTime: at, from: { emailAddress: { name: 'Olga' } } } })
	const mcp = { call: async (_: string, a: { queryString: string }) => { asked.push(a.queryString); return { rawResponse: JSON.stringify({ value: [{ hitsContainers: [{ hits: [hit('19:a@unq.gbl.spaces', '2026-10-15T09:00:00Z'), hit('19:b@unq.gbl.spaces', '2026-10-15T17:00:00Z'), hit('19:c@unq.gbl.spaces', '2026-10-13T08:00:00Z'), hit('19:ch@thread.tacv2', '2026-10-14T08:00:00Z')], moreResultsAvailable: false }] }] }) } }, close: async () => {} }
	const s = new TeamsSource({ command: [], selfChatId: 'self' }, mcp as never, 'Robin Park')
	const found = await s.awaiting('2026-10-13T13:00:00.000Z', '2026-10-15T16:23:09Z')
	assert.deepEqual(asked, ['to:"Robin Park" AND sent>=2026-10-13 AND sent<=2026-10-16'])
	assert.deepEqual(found.map(c => c.id), ['19:a@unq.gbl.spaces'], 'after since, up to the end of the list, chats only')
})

test('first setup: a chat list that keeps failing ends the week read and says so', async () => {
	const list = src.recentChats.bind(src)
	let calls = 0
	src.recentChats = async () => { if (++calls % 2 === 0) throw new Error('list down'); return list() }
	src.post(DM('ana'), 'Ana', 'can you review?', 2 * D)
	for (let i = 0; i < 3; i++) await go()
	assert.equal(store.sweep()!.told, true)
	assert.equal(src.chats.self.filter(m => /could not list your chats from before setup/.test(m.body)).length, 1)
})
