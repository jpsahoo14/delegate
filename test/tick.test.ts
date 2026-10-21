import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RawMsg } from '../src/core/intake.ts'
import type { Config, Report } from '../src/core/types.ts'
import type { Source } from '../src/adapters/source.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-local-'))
// Commands from tests never start a real background check.
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { tick } = await import('../src/runner/tick.ts')
const { act } = await import('../src/mcp/server.ts')

const OWNER = { id: 'me', name: 'Robin Park' }
const KB = mkdtempSync(join(tmpdir(), 'delegate-kb-'))
writeFileSync(join(KB, 'banner.md'), 'Banner notes')
const CHAT = 'test-chat'

class FakeSource implements Source {
	readonly selfChatId = 'self'
	chats: Record<string, RawMsg[]> = { self: [], [CHAT]: [] }
	private n = 1000
	failSelf = 0
	listed = new Set<string>()
	reads: string[] = []
	lists = 0
	failRead = new Set<string>()
	availability = 'Offline'
	noDelete = false
	async editMessage(chatId: string, msgId: string, text: string) { const m = this.chats[chatId].find(x => x.id === msgId); if (m) m.body = text }
	async deleteMessage(chatId: string, msgId: string) { if (this.noDelete) throw new Error('Requested API is not supported'); this.chats[chatId] = this.chats[chatId].filter(m => m.id !== msgId) }
	oof?: string
	guests: boolean | undefined = false
	async presence() { return { availability: this.availability, oof: this.oof } }
	memberIds: Record<string, string[]> = {}
	async around(chatId: string, msgId: string) { const all = this.chats[chatId] ?? [], i = all.findIndex(m => m.id === msgId); return i < 0 ? { after: [] } : { msg: all[i], after: all.slice(i + 1) } }
	memberNames: Record<string, Record<string, string>> = {}
	async members(chatId: string) { return { guests: this.guests ?? false, ids: this.memberIds[chatId], names: this.memberNames[chatId] } }
	post(chatId: string, fromId: string, body: string) {
		this.chats[chatId] ??= []
		const m: RawMsg = { id: String(++this.n), at: new Date(Date.now() + this.n * 1000).toISOString(), from: { id: fromId, name: fromId === 'me' ? OWNER.name : fromId }, html: false, body }
		this.chats[chatId].push(m)
		return m.id
	}
	async newMessages(chatId: string, afterId?: string, sinceIso?: string) {
		this.reads.push(chatId)
		if (this.failRead.delete(chatId)) throw new Error('read failed')
		const all = this.chats[chatId] ?? []
		const newest = all.at(-1)?.id ?? afterId
		if (afterId) return { msgs: all.filter(m => BigInt(m.id) > BigInt(afterId)), newest, truncated: false }
		if (sinceIso) return { msgs: all.filter(m => m.at > sinceIso), newest, truncated: false }
		return { msgs: [], newest, truncated: false }
	}
	async recentChats() { this.lists++; return [...this.listed].map(id => ({ id, name: `Chat ${id}`, lastAt: this.chats[id]?.at(-1)?.at ?? '' })) }
	async recent(chatId: string, n: number) { return this.chats[chatId].slice(-n) }
	lastOpts: unknown
	async send(chatId: string, text: string, opts?: unknown) { this.lastOpts = opts; return { msgId: this.post(chatId, 'me', text) } }
	async sendSelf(text: string) {
		if (this.failSelf > 0) { this.failSelf--; throw new Error('self-chat down') }
		return { msgId: this.post('self', 'me', text) }
	}
	async close() {}
}

let store: InstanceType<typeof Store>, src: FakeSource, runs: string[], script: (prompt: string, wfId: string) => Report | undefined

let readChats: string[] = [], runTools: string[] = []
const run = async (cfg: Config['agent'], i: { workflowId: string; runId: string; prompt: string }) => {
	runs.push(i.workflowId)
	runTools = cfg.tools
	// What the run's history_search would have recorded.
	if (readChats.length) { const { recordRead } = await import('../src/runner/sharing.ts'); recordRead(store.root, i.runId, readChats.map(c => `https://teams.microsoft.com/l/message/${encodeURIComponent(c)}/1700000000009`), 'rollout date') }
	const r = script(i.prompt, i.workflowId)
	if (r) store.writeReport(r, i.runId)
	return { exitCode: 0, ms: 1 }
}
type Started = { workflowId: string; runId: string; prompt: string; sessionId: string; tools: string[]; cwd: string; extraTools?: string[] }
let jf: { starts: Started[]; dead: Set<number>; killed: number[]; windows: string[][]; job?: (prompt: string, jobId: string, runId: string) => Report | undefined }
const procs = {
	start: (cfg: Config['agent'], i: Omit<Started, 'tools'>) => {
		jf.starts.push({ ...i, tools: cfg.tools })
		const r = jf.job?.(i.prompt, i.workflowId, i.runId)
		const pid = 5000 + jf.starts.length
		// A run that reported has finished; one without a report is still working.
		if (r) { store.writeReport(r, i.runId); jf.dead.add(pid) }
		return { pid }
	},
	alive: (pid: number) => !jf.dead.has(pid),
	kill: (pid: number) => { jf.killed.push(pid); jf.dead.add(pid); return true },
	openWindow: (_: string, argv: string[]) => { jf.windows.push(argv) },
	// Booted 30 days ago, whatever the test machine's uptime is; restart tests start runs before that.
	bootMs: () => Date.now() - 30 * 86_400_000,
}
// A history that cannot list conversations, so reading chats runs as one job unless a test passes its own.
const noList = { search: async () => [], close: async () => {} }
const go = () => tick(store, { source: src, run, procs, force: true, history: noList })
// The owner looks at an item in the self-chat before approving it, as on a phone.
const see = async (code: string) => { src.post('self', 'me', `more ${code}`); await go() }
const draft = (text: string, question?: string) => (_: string, workflowId: string): Report =>
	({ workflowId, intent: 'status_next_step', state: 'needs_human', reply: { text, commitment: false, sources: [{ ref: 'wiki', tier: 'live', origin: 'extracted' }, { ref: join(KB, 'banner.md'), tier: 'card', origin: 'extracted' }] }, question, summary: `Draft: ${text}` })

// The owner's night, wherever the tests run: timing tests from before work hours keep their meaning on any clock (Bet 1 tests set their own zone).
const NIGHT = () => Array.from({ length: 27 }, (_, i) => `Etc/GMT${i - 14 < 0 ? '' : '+'}${i - 14}`).find(z => { const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: z, hour: '2-digit', hourCycle: 'h23' }).format(new Date())); return h >= 1 && h <= 5 })!

beforeEach(async () => {
	jf = { starts: [], dead: new Set(), killed: [], windows: [] }
	store = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-root-')), machine: 'mac' })
	store.saveConfig({
		schema: 1, owner: OWNER, source: { command: [], selfChatId: 'self' },
		watch: [{ id: CHAT, name: 'Test Meeting', test: true }],
		agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 3, nudgeEveryMin: 30,
		quiet: { from: '00:00', to: '00:00' }, knowledge: [KB], summaryAt: 'off', tz: NIGHT(),
	})
	src = new FakeSource()
	runs = []
	script = draft('It is in ring 0.')
	src.post(CHAT, 'me', 'old history')
	src.post('self', 'me', 'old note')
	await go()
})

test('R-ING-01 R-WF-01 R-HIL-06 an ask becomes item A1 with a draft and one nudge', async () => {
	src.post(CHAT, 'me', '[as Ravi] What is the status of the banner fix?')
	const r = await go()
	assert.equal(r.asks, 1); assert.equal(r.runs, 1); assert.equal(r.nudged, true)
	const [wf] = store.workflows()
	assert.equal(wf.code, 'A1'); assert.equal(wf.state, 'needs_human'); assert.equal(wf.draft?.text, 'It is in ring 0.')
	assert.equal(wf.asker?.name, 'Ravi')
	assert.match(src.chats.self.at(-1)!.body, /^Assistant · 1 need you\nA1 Ravi: What is the status/)
})

test('R-WF-01 a follow-up joins the open item and counts as new', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post(CHAT, 'me', '[as Ravi] Also, which ring?'); await go()
	const wfs = store.workflows()
	assert.equal(wfs.length, 1); assert.equal(wfs[0].newCount, 1); assert.equal(wfs[0].lastAsk, 'Also, which ring?')
})

test('N1b every cycle stamps where an item stands and when it really changed; a quiet cycle changes neither', async () => {
	src.post(CHAT, 'me', '[as Kim] Is the plan final?'); await go()
	const a = store.byCode('A1')!
	assert.deepEqual([a.place?.section, a.place?.rule], ['move', 'needs-you'])
	assert.equal(a.changedAt, a.createdAt, 'a new item is new from when it was made')
	await go()
	const b = store.byCode('A1')!
	assert.deepEqual([b.place, b.changedAt, b.updatedAt], [a.place, a.changedAt, a.updatedAt], 'nothing happened: nothing moved')
	script = draft('Yes, it is final.')
	src.post(CHAT, 'me', '[as Kim] Also, is the date fixed?'); await go()
	const c = store.byCode('A1')!
	assert.ok(c.changedAt! > a.changedAt!, 'a new turn and a new draft are a change')
})

test('R-HIL-15 R-HIL-13 R-POL-10 answer gives a preview, ok sends it once, and the send is not a new ask', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'remember to buy milk')
	src.post('self', 'me', 'A1: say it is in ring 0 and ring 1 by Monday')
	script = (p, id) => { assert.match(p, /The owner answered your question: "say it is in ring 0 and ring 1 by Monday"/); return draft('Ring 0 now, ring 1 by Monday.')(p, id) }
	await go()
	let wf = store.byCode('A1')!
	assert.equal(wf.draft?.preview, true); assert.equal(wf.state, 'needs_human')
	assert.match(src.chats.self.at(-1)!.body, /^Assistant · A1 → "Ring 0 now, ring 1 by Monday\."/)
	src.post('self', 'me', 'ok')
	const before = src.chats[CHAT].length
	await go()
	wf = store.byCode('A1')!
	assert.equal(wf.state, 'done'); assert.equal(src.chats[CHAT].length, before + 1)
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Ring 0 now, ring 1 by Monday.')
	const again = await go()
	assert.equal(again.asks, 0); assert.equal(again.runs, 0); assert.equal(store.workflows().filter(w => w.state !== 'done').length, 0)
})

// Engineering review 10-20 (reviews/engineering-review.md R1, R3): each test reproduced its bug and failed before the fix.
const typedAt = (chat: string, ms: number) => { src.chats[chat].at(-1)!.at = new Date(ms).toISOString() }

test('bug 10-20 bare ok: a bare ok goes to the preview shown when it was typed, not to one shown after', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post(CHAT, 'me', '[as Kim] ETA?'); await go()
	script = draft('Ring 0 now.')
	src.post('self', 'me', 'A1: ring 0 now'); await go()
	const typed = Date.now()
	script = draft('Friday.')
	await new Promise(r => setTimeout(r, 20))
	src.post('self', 'me', 'A2: Friday'); await go()
	const n = store.notify(), list = n.previews!.self as { code: string; at: string }[]
	store.saveNotify({ ...n, previews: { ...n.previews, self: [{ ...list.at(-2)!, at: new Date(typed - 10_000).toISOString() }, { ...list.at(-1)!, at: new Date(typed + 60_000).toISOString() }] } })
	src.post('self', 'me', 'ok'); typedAt('self', typed)
	await go()
	assert.deepEqual([store.byCode('A1')!.state, store.byCode('A2')!.state], ['done', 'needs_human'], 'A1, the preview on screen when ok was typed')
})

test('bug 10-20 seen revision: an ok typed before a redraft was shown does not approve the redraft', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	await see('A1')
	const typed = Date.now()
	await new Promise(r => setTimeout(r, 20))
	script = draft('Ring 0 now, and ring 1 is blocked.')
	src.post(CHAT, 'me', '[as Ravi] Also, is ring 1 ok?'); await go()
	src.post('self', 'me', 'what needs me?'); await go()
	const before = src.chats[CHAT].length
	src.post('self', 'me', 'ok A1'); typedAt('self', typed)
	await go()
	assert.equal(src.chats[CHAT].length, before, 'the redraft was never on screen when ok was typed: nothing sent')
	assert.equal(store.byCode('A1')!.state, 'needs_human')
})

test('bug 10-20 duplicate send: a send that timed out after posting (with the quote a group reply carries) is found on retry, never posted twice', async () => {
	const { saveSetting } = await import('../src/web/settings.ts')
	await saveSetting(store, 'signApproved', 'true')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const send = src.send.bind(src)
	let late = ''
	src.send = async (_: string, text: string) => { late = text; throw new Error('Request timed out') }
	await see('A1'); src.post('self', 'me', 'ok A1'); await go()
	assert.match(store.byCode('A1')!.status, /Could not send/)
	src.send = send
	src.post(CHAT, 'me', `<blockquote><b>Ravi</b>: Status?</blockquote><p>${late}</p>`)
	src.chats[CHAT].at(-1)!.html = true
	const before = src.chats[CHAT].length
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(src.chats[CHAT].length, before, 'not posted again')
	assert.equal(store.byCode('A1')!.state, 'done')
})

test('bug 10-20 pause mid-cycle: a pause typed while drafts were being written stops the automatic sends of that same cycle', async () => {
	setRules(rule()); autoOn(); policy(0)
	script = (p, id) => { src.post('self', 'me', 'pause'); return draft('It is in ring 0.')(p, id) }
	const before = src.chats[CHAT].length
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(src.chats[CHAT].length, before + 1, 'only the ask; no automatic reply went out')
	assert.equal(store.control().paused, true)
})

test('bug 10-20 one bad start: an AI run that cannot start fails only its item; the rest of the cycle goes on', async () => {
	script = (p, id) => { if (store.workflow(id)?.asker?.name === 'Ravi') throw new Error('spawn copilot ENOENT'); return draft('Friday.')(p, id) }
	src.post(CHAT, 'me', '[as Ravi] Status?')
	src.post(CHAT, 'me', '[as Kim] ETA?')
	await go()
	const [ravi, kim] = [store.workflows().find(w => w.asker?.name === 'Ravi')!, store.workflows().find(w => w.asker?.name === 'Kim')!]
	assert.equal(kim.draft?.text, 'Friday.', 'the other item still drafted')
	assert.deepEqual([ravi.state, ravi.status], ['running', 'Could not start the AI run: Error: spawn copilot ENOENT. Trying again on the next check.'])
	script = draft('In ring 0.')
	await go()
	assert.equal(store.workflows().find(w => w.asker?.name === 'Ravi')!.draft?.text, 'In ring 0.', 'tried again and drafted')
	script = (p, id) => { if (store.workflow(id)?.asker?.name === 'Sam') throw new Error('spawn copilot ENOENT'); return draft('x')(p, id) }
	src.post(CHAT, 'me', '[as Sam] Any news?')
	await go(); await go(); await go()
	const sam = store.workflows().find(w => w.asker?.name === 'Sam')!
	assert.deepEqual([sam.state, sam.status], ['needs_human', `Could not start the AI run 3 times: Error: spawn copilot ENOENT. Check the AI CLI with "delegate doctor".`], 'three failed starts go to the owner, not a run every minute')
})

test('bug 10-20 one bad start, reported: a run the adapter reports as not started counts toward the same three tries', async () => {
	const failing = async () => ({ exitCode: -1, ms: 1, error: 'Could not start copilot: spawn copilot ENOENT' })
	src.post(CHAT, 'me', '[as Ravi] Status?')
	for (let i = 0; i < 3; i++) await tick(store, { source: src, run: failing, procs, force: true, history: noList })
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.status], ['needs_human', `Could not start the AI run 3 times: Error: Could not start copilot: spawn copilot ENOENT. Check the AI CLI with "delegate doctor".`])
})

test('bug 10-20 clock skew: when the newest preview looks a few seconds after a bare ok, it asks which item instead of sending the older one', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post(CHAT, 'me', '[as Kim] ETA?'); await go()
	script = draft('Ring 0 now.')
	src.post('self', 'me', 'A1: ring 0 now'); await go()
	script = draft('Friday.')
	src.post('self', 'me', 'A2: Friday'); await go()
	const n = store.notify(), list = n.previews!.self as { code: string; at: string }[]
	const typed = Date.parse(list.at(-1)!.at) - 5000
	store.saveNotify({ ...n, previews: { ...n.previews, self: [{ ...list.at(-2)!, at: new Date(typed - 60_000).toISOString() }, list.at(-1)!] } })
	src.post('self', 'me', 'ok'); typedAt('self', typed)
	await go()
	assert.deepEqual([store.byCode('A1')!.state, store.byCode('A2')!.state], ['needs_human', 'needs_human'], 'neither sent on a guess')
	assert.match(src.chats.self.at(-1)!.body, /Which item\?/)
})

test('bug 10-20 short reply: two items in one chat with the same short draft are each sent; one is not taken for the other', async () => {
	const { saveSetting } = await import('../src/web/settings.ts')
	await saveSetting(store, 'signApproved', 'true')
	script = draft('Done.')
	src.post(CHAT, 'me', '[as Ravi] Is it merged?'); await go()
	src.post(CHAT, 'me', '[as Kim] Is the doc updated?'); await go()
	const [a, b] = [store.workflows().find(w => w.asker?.name === 'Ravi')!.code, store.workflows().find(w => w.asker?.name === 'Kim')!.code]
	await see(b); src.post('self', 'me', `ok ${b}`); await go()
	const before = src.chats[CHAT].length
	await see(a); src.post('self', 'me', `ok ${a}`); await go()
	assert.equal(src.chats[CHAT].length, before + 1, 'Ravi gets his own reply')
	assert.match(store.byCode(a)!.status, /^Sent/)
})

test('bug 10-20 unsigned short reply: an unsigned draft is never taken for something the owner typed that ends the same way', async () => {
	const g = '19:release@thread.v2'
	src.listed.add(g)
	script = draft('OK')
	src.post(g, 'Ravi', 'Robin, can I merge?'); await go()
	src.post(g, 'Kim', 'Robin, is the doc final?'); await go()
	const ravi = store.workflows().find(w => w.asker?.name === 'Ravi')!.code
	src.post(g, 'me', 'checking with the team, ok'); await go()
	const before = src.chats[g].length
	await see(ravi); src.post('self', 'me', `ok ${ravi}`); await go()
	assert.equal(src.chats[g].length, before + 1, 'sent')
})

test('bug 10-20 first search after update: with no record of the last good read, the gap search waits a cycle instead of reaching back to install time', async () => {
	const missed = '19:me_olga@unq.gbl.spaces'
	src.post(missed, 'Olga', 'Old question from last month?')
	for (let i = 0; i < 50; i++) { const id = `19:busy${i}@thread.v2`; src.post(id, 'Zed', 'chatter'); src.listed.add(id) }
	const { readAt: _, ...old } = store.chats()
	store.saveChats(old)
	let searched = 0
	;(src as unknown as { awaiting: () => Promise<unknown[]> }).awaiting = async () => { searched++; return [] }
	await go()
	assert.equal(searched, 0, 'no search on the first cycle after the update')
	assert.ok(store.chats().readAt, 'the last good read is recorded from now on')
})

test('bug 10-20 search outage: a failed gap search says so and waits 15 minutes, instead of failing every minute', async () => {
	for (let i = 0; i < 50; i++) { const id = `19:busy${i}@thread.v2`; src.post(id, 'Zed', 'chatter'); src.listed.add(id) }
	let tries = 0
	;(src as unknown as { awaiting: () => Promise<unknown[]> }).awaiting = async () => { tries++; throw new Error('Search 503') }
	await go()
	assert.equal(tries, 1)
	assert.match(store.health()['gap-search']?.text ?? '', /^Could not search for chats missed since .* It tries again in 15 minutes\.$/)
	await go(); await go()
	assert.equal(tries, 1, 'not again within 15 minutes')
	store.saveChats({ ...store.chats(), gapFailAt: new Date(Date.now() - 16 * 60_000).toISOString() })
	;(src as unknown as { awaiting: () => Promise<unknown[]> }).awaiting = async () => { tries++; return [] }
	await go()
	assert.deepEqual([tries, store.health()['gap-search']], [2, undefined], 'tried again later; the health line clears')
})

test('bug 10-20 after downtime: a chat pushed out of the newest-50 list while the runner was off is still read', async () => {
	const missed = '19:me_olga@unq.gbl.spaces'
	src.post(missed, 'Olga', 'Can you approve my access request?')
	for (let i = 0; i < 50; i++) { const id = `19:busy${i}@thread.v2`; src.post(id, 'Zed', 'chatter'); src.listed.add(id) }
	const at = src.chats[missed].at(-1)!.at
	;(src as unknown as { awaiting: (s: string, u: string) => Promise<{ id: string; name: string; lastAt: string }[]> }).awaiting = async (since: string, until: string) => (at > since && at <= until ? [{ id: missed, name: 'Olga', lastAt: at }] : [])
	await go()
	assert.equal(store.workflows().filter(w => w.chat.id === missed).length, 1, 'read through search, as an item')
})

test('R-ING-04 a thank-you closes silently with no item in the inbox', async () => {
	script = (_, workflowId) => ({ workflowId, intent: 'none', state: 'done', summary: 'No reply needed' })
	src.post(CHAT, 'me', '[as Ravi] thanks!'); await go()
	assert.equal(store.workflows()[0].state, 'done')
	assert.match(act(store, 'ok A1'), /A1/)
})

test('R-WF-13 ok is refused and the worker reruns when the asker wrote again after the draft', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	store.writeAnswer({ code: 'A1', verb: 'ok', surface: 'chat' })
	src.post(CHAT, 'me', '[as Ravi] Actually, never mind the ring.')
	const sentBefore = src.chats[CHAT].length
	await go()
	assert.equal(src.chats[CHAT].length, sentBefore)
	assert.equal(runs.length, 2)
})

test('R-WF-08 a tick with nothing new runs no worker and changes no workflow', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const snap = JSON.stringify(store.workflows())
	const r = await go()
	assert.equal(r.runs, 0); assert.equal(JSON.stringify(store.workflows()), snap)
})

test('R-STO-05 another machine with a fresh lease blocks this tick', async () => {
	const other = new Store({ root: store.root, machine: 'win' })
	assert.equal(other.acquireLease(), false)
})

test('worker that never reports leaves a needs-you item', async () => {
	script = () => undefined
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(store.byCode('A1')!.status, 'The worker did not finish')
})

test('R-STO-06 a failed confirmation never causes a second send', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'ok A1')
	src.failSelf = 5
	const before = src.chats[CHAT].length
	await go().catch(() => {})
	await go().catch(() => {})
	src.failSelf = 0
	await go()
	assert.equal(src.chats[CHAT].length, before + 1)
	assert.equal(store.byCode('A1')!.state, 'done')
})

test('R-STO-06 a send that landed but was never recorded is reconciled, not repeated', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post(CHAT, 'me', 'It is in ring 0.')
	store.writeAnswer({ code: 'A1', verb: 'ok', surface: 'chat' })
	const before = src.chats[CHAT].length
	await go()
	assert.equal(src.chats[CHAT].length, before)
	assert.equal(store.byCode('A1')!.status, 'Sent earlier')
})

test('dogfood 10-20: replying in Teams yourself closes the item and teaches it like an edited send; your exact draft counts as unedited', async () => {
	const dm = '19:me_kim@unq.gbl.spaces'
	src.listed.add(dm)
	script = draft('It ships in ring 1 on Thursday.')
	src.post(dm, 'Kim', 'When does the banner ship?'); await go()
	const a = store.workflows().at(-1)!
	assert.equal(a.state, 'needs_human')
	src.post(dm, 'me', 'Thursday, ring 1 first. I will ping you when it lands.'); await go()
	assert.deepEqual([store.byCode(a.code!)!.state, store.byCode(a.code!)!.status], ['done', 'You replied yourself'])
	const ls = store.lessons().filter(l => l.event === 'replied')
	assert.deepEqual(ls.map(l => [l.kind, (l.detail as { draft: string; sent: string }).draft, (l.detail as { sent: string }).sent]), [['correction', 'It ships in ring 1 on Thursday.', 'Thursday, ring 1 first. I will ping you when it lands.']])
	const { corrections } = await import('../src/store/feedback.ts')
	assert.deepEqual(corrections(store.lessons(), { code: 'Z9', asker: { id: 'Kim' } }), ['For Kim: you drafted "It ships in ring 1 on Thursday." and the owner sent "Thursday, ring 1 first. I will ping you when it lands.".'])
	assert.deepEqual(corrections(store.lessons(), { code: 'Z9', asker: { id: 'Pat' } }), ['For someone else: the owner changed a 7-word draft to 11 words.'], 'others get only the shape of your edit')
	src.post(dm, 'Kim', 'And the flag?'); await go()
	const b = store.workflows().at(-1)!
	src.post(dm, 'me', 'It ships in ring 1 on Thursday.'); await go()
	const outs = store.logs(1).filter(e => e.event === 'outcome').slice(-2).map(e => [e.how, e.edited, e.approvedBy])
	assert.deepEqual(outs, [['sent', true, 'owner'], ['sent', false, 'owner']], 'your words count as an edit; the draft word for word does not')
	assert.equal(store.lessons().filter(l => l.event === 'replied').length, 1, 'no lesson when you sent the draft as it was')
	assert.equal(store.logs(1).filter(e => e.event === 'sent' && e.code === b.code).length, 0, 'not counted as sent by Delegate')
})

test('dogfood 10-20: Check now, or an answer, from any machine makes the runner check at its next minute, not after the idle wait', async () => {
	const later = () => store.saveSchedule({ nextAt: new Date(Date.now() + 3_600_000).toISOString() })
	const plain = () => tick(store, { source: src, run, procs, history: noList })
	await go(); later()
	assert.equal((await plain()).skipped, 'not due')
	await new Promise(r => setTimeout(r, 5))
	mkdirSync(join(store.root, 'state', 'kick'), { recursive: true }); writeFileSync(join(store.root, 'state', 'kick', 'old-pc.json'), JSON.stringify({ at: '2026-01-01T00:00:00Z' }))
	const { actResult } = await import('../src/mcp/server.ts')
	store.saveConfig({ ...store.config(), runner: 'vm-1' })
	assert.equal(actResult(store, 'retry').text, 'Asked vm-1 to check now. It does within a minute.')
	store.saveConfig({ ...store.config(), runner: undefined })
	assert.equal((await plain()).skipped, undefined, 'Check now on another machine')
	later()
	assert.equal((await plain()).skipped, 'not due', 'one check per request')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go(); later()
	store.writeAnswer({ code: 'A1', verb: 'skip', surface: 'chat' })
	store.saveSchedule({ nextAt: new Date(Date.now() + 3_600_000).toISOString(), backoff: 4 })
	assert.equal((await plain()).skipped, 'not due', 'a waiting answer never overrides Teams asking to slow down')
	later()
	assert.equal((await plain()).skipped, undefined, 'an answer waiting from the page on another machine')
	assert.equal(store.byCode('A1')!.state, 'done')
})

test('Catch up: an FYI worth knowing is listed with its line, noise and room guesses are not; "mine" drafts it for the owner and teaches the next run', async () => {
	const g = '19:spec@thread.v2'
	src.listed.add(g)
	const fyi = (line: string, weight: 'high' | 'normal' = 'normal') => (_: string, id: string): Report => ({ workflowId: id, intent: 'none', state: 'done', summary: 'cc only', fyi: { line, weight } })
	script = fyi('Shared the v5 spec as a pre-read for Pete\'s review', 'high')
	src.post(g, 'Dev', 'Hi Pete, spec v5 attached. CC Robin'); await go()
	const a = store.workflows().at(-1)!
	const { at: fyiAt, ...fyiRest } = a.fyi!
	assert.deepEqual([a.state, fyiRest], ['done', { line: 'Shared the v5 spec as a pre-read for Pete\'s review', weight: 'high' }])
	assert.ok(Date.now() - Date.parse(fyiAt!) < 60_000, 'stamped when it became an FYI')
	script = (_: string, id: string): Report => ({ workflowId: id, intent: 'none', state: 'done', summary: 'thanks' })
	src.post(g, 'Kim', 'thanks Robin!'); await go()
	assert.equal(store.workflows().at(-1)!.fyi, undefined, 'noise is not listed')
	script = fyi('Lunch plan for Friday')
	src.post(g, 'Kim', 'hey everyone, lunch on Friday?'); await go()
	assert.deepEqual([store.workflows().at(-1)!.startedBy, store.workflows().at(-1)!.fyi], ['room', undefined], 'a guess about a message to the whole group is never listed')
	const { view } = await import('../src/web/view.ts')
	const since = new Date(Date.now() - 3_600_000).toISOString()
	const v = view(store, since)
	assert.deepEqual([v.catchUp.count, v.catchUp.top.map(r => [r.code, r.sentence, r.high, r.by])], [1, [[a.code, 'Shared the v5 spec as a pre-read for Pete\'s review', true, 'Dev · Chat 19:spec@thread.v2']]])
	const { inbox } = await import('../src/runner/proposals.ts')
	assert.match(inbox(store), new RegExp(`### Catch up\\n- ${a.code} Dev · Chat 19:spec@thread.v2: Shared the v5 spec as a pre-read for Pete's review\\nSay "mine ${a.code}" if one of these needs you\\.`))
	const { summaryText } = await import('../src/runner/daily.ts')
	assert.match(summaryText(store)!, new RegExp(`\\nCatch up: 1 worth knowing\\. Worth a look: Dev, Shared the v5 spec as a pre-read for Pete's review \\(${a.code}\\)\\. Say "what did I miss\\?" for all of it\\.`))
	script = fyi('Posted the config PR for the registration limit')
	src.post(g, 'Pia', 'Here is the config PR, cc Robin: PR 4200003'); await go()
	const n = store.workflows().at(-1)!
	store.save({ ...store.workflows().find(w => w.asker?.id === 'Kim')!, state: 'done', fyi: { line: 'Old news', weight: 'high' }, updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() }, false)
	assert.deepEqual(view(store, since).catchUp.top.map(r => r.code), [a.code, n.code], 'worth knowing first, then newest; nothing from before you last looked')
	assert.match(act(store, `mine ${n.code}`), /will be drafted for you\. It waits for your ok/)
	await go()
	assert.deepEqual([store.byCode(n.code!)!.needsMe, store.byCode(n.code!)!.state, store.byCode(n.code!)!.question], [true, 'needs_human', 'You said this needs you. What should I say?'], 'the AI chat reopens it too; with nothing to draft it asks you, never closes again')
	let prompt = ''
	script = (p: string, id: string) => { prompt = p; return draft('Thanks Dev, I will read v5 before the call.')(p, id) }
	src.post('self', 'me', `mine ${a.code}`); await go()
	const b = store.byCode(a.code!)!
	assert.deepEqual([b.state, b.draft?.text, b.decision?.reason, b.fyi], ['needs_human', 'Thanks Dev, I will read v5 before the call.', 'You said this one needs you', undefined], 'drafted, always waits for the owner, gone from Catch up')
	assert.match(prompt, /You closed this earlier as FYI, but the owner says it needs them\./)
	const { corrections } = await import('../src/store/feedback.ts')
	assert.deepEqual(corrections(store.lessons(), { code: 'Z1', asker: { id: 'Dev' } }), ['For Dev: you closed "Hi Pete, spec v5 attached. CC Robin" as FYI, but the owner said it needed them.', 'For someone else: a message you closed as FYI needed the owner.'], 'the same person in their words; others only the shape')
	assert.deepEqual(corrections(store.lessons(), { code: 'Z1', asker: { id: 'Ana' } }), ['For someone else: a message you closed as FYI needed the owner.', 'For someone else: a message you closed as FYI needed the owner.'])
	assert.match(act(store, `mine ${a.code}`), /is not in Catch up|already/, 'once is enough')
	src.post(g, 'Dev', 'Robin, also the date for the call?'); await go()
	assert.equal(store.byCode(a.code!)!.needsMe, undefined, 'a later message is a new turn')
	const fb = join(store.root, 'feedback', 'old.jsonl')
	writeFileSync(fb, JSON.stringify({ at: '2026-01-01T00:00:00Z', kind: 'correction', event: 'notfyi', what: 'x', detail: { ask: 'secret ask', fyi: 'secret line', intent: 'none' } }) + '\n')
	const { sweep } = await import('../src/store/retention.ts')
	store.save({ ...store.byCode(a.code!)!, state: 'done', fyi: { line: 'old', weight: 'normal' }, updatedAt: '2026-01-01T00:00:00Z' }, false)
	sweep(store, 30)
	assert.equal(store.byCode(a.code!)!.fyi, undefined, 'swept with the rest of the text')
	assert.deepEqual(JSON.parse(readFileSync(fb, 'utf8')).detail, { intent: 'none' }, 'old lessons keep only their shape')
})

test('R-WF-13 ok after the owner already replied in the chat closes the item without sending', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post(CHAT, 'me', 'Ring 0, I will update you later.')
	store.writeAnswer({ code: 'A1', verb: 'ok', surface: 'chat' })
	const before = src.chats[CHAT].length
	await go()
	assert.equal(src.chats[CHAT].length, before)
	assert.equal(store.byCode('A1')!.status, 'You replied yourself')
})

test('R-ING-06 replaying intake after a crash does not apply an event twice', async () => {
	const { intake } = await import('../src/runner/intake.ts')
	src.post(CHAT, 'me', '[as Ravi] Status?')
	const cursors = store.cursors()
	await intake(store, src, store.config(), { ...cursors })
	await intake(store, src, store.config(), { ...cursors })
	const [wf] = store.workflows()
	assert.equal(store.workflows().length, 1); assert.deepEqual(wf.pending.length, 1); assert.equal(wf.newCount, 0)
})

test('R-WF-01 two asks in one tick both join the same item', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?')
	src.post(CHAT, 'me', '[as Ravi] And the ring?')
	await go()
	const [wf] = store.workflows()
	assert.equal(store.workflows().length, 1); assert.equal(wf.lastAsk, 'And the ring?'); assert.equal(runs.length, 1)
})

test('R-HIL-16 a bare ok in the AI chat confirms the latest chat preview', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.match(act(store, 'A1: say ring 0'), /redraft/)
	script = draft('Ring 0.')
	await go()
	assert.match(act(store, 'ok'), /^A1 .*will send the draft: "Ring 0\."/)
})

test('R-SEC-04 the log records what was sent, who approved it, and its sources', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	store.writeAnswer({ code: 'A1', verb: 'ok', surface: 'chat' }); await go()
	const { readFileSync, readdirSync } = await import('node:fs')
	const dir = join(store.root, 'state', 'log')
	const lines = readdirSync(dir).flatMap(f => readFileSync(join(dir, f), 'utf8').trim().split('\n')).map(l => JSON.parse(l))
	const sent = lines.find(l => l.event === 'sent')
	assert.equal(sent.text, 'It is in ring 0.'); assert.equal(sent.approvedBy, 'owner'); assert.equal(sent.sources[0].ref, 'wiki'); assert.ok(sent.workflowId)
})

test('R-ING-07 a new 1:1 chat is found by discovery and its first message becomes an item', async () => {
	const dm = '19:abc_def@unq.gbl.spaces'
	src.listed.add(dm)
	src.post(dm, 'sam', 'Hi Robin, can you share the design doc?')
	await go()
	const wf = store.workflows().find(w => w.chat.id === dm)!
	assert.equal(wf.code, 'A1'); assert.equal(wf.asker?.id, 'sam'); assert.equal(wf.chat.group, false)
})

test('R-ING-07 chats that only have history are not answered, and an idle tick reads no listed chat', async () => {
	const old = '19:old@thread.v2'
	src.post(old, 'kim', 'old question from last week')
	const chats = store.chats(); chats.startedAt = new Date(Date.now() + 10_000_000).toISOString(); store.saveChats(chats)
	src.listed.add(old)
	await go()
	assert.equal(store.workflows().length, 0)
	src.reads = []
	await go()
	assert.deepEqual(src.reads.filter(r => r === old), [])
})

test('R-ING-08 discovered group chats only count messages that mention the owner', async () => {
	const g = '19:team@thread.v2'
	src.listed.add(g)
	src.post(g, 'kim', 'lunch at 1?'); await go()
	assert.equal(store.workflows().length, 0)
	src.post(g, 'kim', 'Robin, is the banner fix in?'); await go()
	assert.equal(store.workflows().length, 1)
})

test('dogfood: in a group chat, the reply to the owner\'s answer is for the owner even without the name; a nickname counts too', async () => {
	const g = '19:team@thread.v2'
	src.listed.add(g)
	script = draft('Yes, that one.')
	src.post(g, 'Noah', 'Robin, whose notes bug is this?'); await go()
	src.post(g, 'me', 'It is assigned to the right person but the area path is wrong.'); await go()
	src.post(g, 'Noah', 'is this the right area path? Product\Web\Files\Notes?'); await go()
	const wf = store.workflows().find(w => w.asker?.id === 'Noah')!
	assert.equal(wf.lastAsk, 'is this the right area path? Product\Web\Files\Notes?')
	src.post(g, 'Lea', 'tested with Ines, unable to repro'); await go()
	assert.equal(store.workflows().filter(w => w.asker?.id === 'Lea').length, 0, 'someone the owner did not answer')
	src.post(g, 'me', 'Ok.'); await go()
	src.post(g, 'Kim', 'lunch at 1?'); await go()
	src.post(g, 'Lea', 'will connect with the person who raised it'); await go()
	assert.equal(store.workflows().filter(w => w.asker?.id === 'Lea').length, 0, 'once someone else joined in, the owner\'s turn is over')
	src.post(g, 'Ravi', 'AI JP'); await go()
	assert.equal(store.workflows().filter(w => w.asker?.id === 'Ravi').length, 0, 'no alias set')
	store.saveConfig({ ...store.config(), aliases: ['JP'] })
	src.post(g, 'Ravi', 'AI JP, can you look?'); await go()
	assert.equal(store.workflows().filter(w => w.asker?.id === 'Ravi').length, 1)
})

test('dogfood 10-20: a request to the whole group ("hi guys, I have a PR") gets one short run to decide if it is the owner\'s; not theirs closes quietly, theirs waits for ok', async () => {
	const g = '19:events-ux@thread.v2'
	src.listed.add(g)
	const seen: string[] = []
	script = (p: string, id: string): Report => { seen.push(p); return /scheduling form/.test(p) ? { workflowId: id, intent: 'pr_review', state: 'needs_human', summary: 'PR in your area', reply: { text: 'I will review it today.', commitment: false, sources: [] } } : { workflowId: id, intent: 'none', state: 'done', summary: 'SKU question for the licensing team' } }
	src.post(g, 'John', 'lunch at 1?'); await go()
	src.post(g, 'John', 'Great work on the launch, everyone!'); await go()
	src.post(g, 'John', 'all good on your side?'); await go()
	src.post(g, 'John', 'is the team offsite still on?'); await go()
	assert.equal(store.workflows().length, 0, 'not to the room, or not a request')
	src.post(g, 'John', 'hey everyone, do we know the SKU IDs?'); await go()
	const a = store.workflows().at(-1)!
	assert.deepEqual([a.startedBy, a.state, a.intent], ['room', 'done', 'none'])
	assert.match(seen[0], /This message was sent to the whole group chat, not to the owner by name/)
	const { view } = await import('../src/web/view.ts')
	assert.equal(view(store, undefined).done.some(d => d.code === a.code), false, 'not theirs: nothing shown')
	src.post(g, 'John', 'Hi guys, I have a PR for the scheduling form: https://dev.azure.com/x/_git/r/pullrequest/1736199 cc Kim'); await go()
	const b = store.workflows().at(-1)!
	assert.deepEqual([b.startedBy, b.state, b.decision?.reason], ['room', 'needs_human', 'It was sent to the whole chat; a reply there waits for you'])
	script = (p: string, id: string): Report => /SKUs are mine/.test(p) ? { workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'yours', reply: { text: 'The SKU IDs are in the web repo.', commitment: false, sources: [] } } : { workflowId: id, intent: 'none', state: 'done', summary: 'x' }
	const { actResult } = await import('../src/mcp/server.ts')
	assert.equal(actResult(store, `${a.code}: SKUs are mine, answer it`).text.includes('already done'), false, 'a closed item with no reply takes the owner\'s answer')
	await go(); await go()
	const r = store.byCode(a.code!)!
	assert.deepEqual([r.state, r.draft?.text, r.startedBy], ['needs_human', 'Hi John, the SKU IDs are in the web repo.', undefined], 'reopened and drafted, no longer a room guess')
})

test('dogfood: after a reply Delegate sent in a group chat, the asker\'s next message is for the owner', async () => {
	const g = '19:team@thread.v2'
	src.listed.add(g)
	script = draft('I will add it to the partner incident today.')
	src.post(g, 'David', 'Robin, any update on the incident?'); await go()
	const code = store.workflows().find(w => w.asker?.id === 'David')!.code
	src.post('self', 'me', `ok ${code}`); await go(); await go()
	assert.ok(store.byCode(code)!.sent, 'sent')
	src.post(g, 'David', 'can it be expedited?'); await go()
	assert.equal(store.byCode(code)!.lastAsk, 'can it be expedited?')
})

test('dogfood: after the runner updates itself, the next tick tells the owner once in the self-chat', async () => {
	const { writeFileSync: w } = await import('node:fs')
	const mark = join(process.env.DELEGATE_LOCAL!, 'update.json')
	w(mark, JSON.stringify({ last: { at: new Date().toISOString(), from: 'aaaaaaa', to: 'bbbbbbb', subject: 'Ask after send' } }))
	await go()
	assert.match(src.chats.self.at(-1)!.body, /^Assistant · Updated .* to bbbbbbb: Ask after send\./)
	const n = src.chats.self.length
	await go()
	assert.equal(src.chats.self.length, n, 'told once')
})

test('R-SET-07 pause from the self-chat blocks sends until resume', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'pause'); await go()
	assert.match(src.chats.self.at(-1)!.body, /^Assistant · Paused\./)
	const before = src.chats[CHAT].length
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(src.chats[CHAT].length, before)
	assert.match(src.chats.self.at(-1)!.body, /Not sent A1: Paused/)
	src.post('self', 'me', 'resume'); await go()
	assert.equal(store.control().paused, false)
})

test('R-SET-07 stop halts intake, and resume catches up on what arrived meanwhile', async () => {
	src.post('self', 'me', 'stop'); await go()
	src.post(CHAT, 'me', '[as Ravi] Status?')
	const r = await go()
	assert.equal(r.skipped, 'stopped'); assert.equal(store.workflows().length, 0)
	src.post('self', 'me', 'resume'); await go()
	const [wf] = store.workflows()
	assert.equal(store.workflows().length, 1); assert.equal(wf.lastAsk, 'Status?')
})

test('Bet 1 work-hours poll: on the owner clock a quiet weekday between 9 and 18 is checked every 5 minutes; evenings, weekends, and a longer chosen interval are not', async () => {
	const { plan, DEFAULT_POLL } = await import('../src/core/schedule.ts')
	const tz = 'Asia/Kolkata'
	const gap = (iso: string, poll = DEFAULT_POLL) => Math.round((Date.parse(plan({}, new Date(iso), poll, false, tz).nextAt!) - Date.parse(iso)) / 60_000)
	// 2026-10-20 is a Tuesday; Kolkata is UTC+5:30.
	assert.deepEqual(
		[gap('2026-10-20T03:29:00Z'), gap('2026-10-20T03:30:00Z'), gap('2026-10-20T04:00:00Z'), gap('2026-10-20T12:29:00Z'), gap('2026-10-20T12:30:00Z'), gap('2026-10-17T05:30:00Z'), gap('2026-10-18T05:30:00Z')],
		[15, 5, 5, 5, 15, 15, 15], 'Tue 08:59, 09:00, 09:30, 17:59, 18:00, Sat 11:00, Sun 11:00 owner time')
	assert.equal(gap('2026-10-20T04:00:00Z', { ...DEFAULT_POLL, idleMin: 3 }), 3, 'a shorter setting still wins')
	const la = Math.round((Date.parse(plan({}, new Date('2026-10-20T16:30:00Z'), DEFAULT_POLL, false, 'America/Los_Angeles').nextAt!) - Date.parse('2026-10-20T16:30:00Z')) / 60_000)
	assert.deepEqual([gap('2026-10-20T16:30:00Z'), la], [15, 5], 'one instant: 22:00 in Kolkata, 09:30 in Los Angeles')
	assert.equal(gap('2026-10-20T04:00:00Z', { ...DEFAULT_POLL, idleMin: 30 }), 30, 'a longer interval the owner chose is kept')
})

test('Bet 1 the runner plans the next check on the owner clock from config', async t => {
	const { isWorkHours } = await import('../src/core/schedule.ts')
	const zones = Array.from({ length: 27 }, (_, i) => `Etc/GMT${i - 14 < 0 ? '' : '+'}${i - 14}`)
	const now = new Date(), work = zones.find(z => isWorkHours(now, z)), rest = zones.find(z => !isWorkHours(now, z))
	if (!work || !rest) return t.skip('no zone is in work hours at this instant (a weekend)')
	const gapWith = async (tz: string) => { store.saveConfig({ ...store.config(), tz }); store.saveSchedule({}); await go(); return Math.round((Date.parse(store.schedule().nextAt!) - Date.now()) / 60_000) }
	assert.deepEqual([await gapWith(work), await gapWith(rest)], [5, 15], `work hours in ${work}, not in ${rest}`)
})

test('R-ING-01 adaptive poll: idle every 15 min, then every minute for 5 min after activity', async () => {
	const { plan, isDue, DEFAULT_POLL } = await import('../src/core/schedule.ts')
	const t0 = new Date('2026-10-17T10:00:00Z')
	const idle = plan({}, t0, DEFAULT_POLL, false)
	assert.equal(idle.nextAt, '2026-10-17T10:14:50.000Z')
	const active = plan(idle, t0, DEFAULT_POLL, true)
	assert.equal(active.nextAt, '2026-10-17T10:00:50.000Z'); assert.equal(active.fastUntil, '2026-10-17T10:05:00.000Z')
	const later = plan(active, new Date('2026-10-17T10:06:00Z'), DEFAULT_POLL, false)
	assert.equal(later.nextAt, '2026-10-17T10:20:50.000Z')
	assert.equal(isDue(later, new Date('2026-10-17T10:10:00Z')), false)
})

test('R-ING-01 a tick that is not due exits without touching the source', async () => {
	src.reads = []
	store.saveSchedule({ nextAt: new Date(Date.now() + 600_000).toISOString() })
	const r = await tick(store, { source: src, run })
	assert.equal(r.skipped, 'not due'); assert.deepEqual(src.reads, [])
	src.post(CHAT, 'me', '[as Ravi] Status?')
	await go()
	const s = store.schedule()
	assert.ok(Date.parse(s.nextAt!) - Date.now() < 61_000, 'an ask opens the fast window')
})

test('D2 the worker splits an off-topic message into its own item, and each sends independently', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status of the banner fix?')
	src.post(CHAT, 'me', '[as Ravi] Unrelated: can you review PR 42?')
	script = (prompt, workflowId) => {
		const offTopic = prompt.match(/>> \[id:(\d+)\][^\n]*review PR 42/)
		const mine = store.workflow(workflowId)!
		if (offTopic && mine.msgIds.length > 1) return { ...draft('Banner fix is in ring 0.')(prompt, workflowId), split: [offTopic[1]] }
		return draft(/review PR 42/.test(prompt.split('>>').slice(1).join('')) ? 'I will review PR 42 today.' : 'Banner fix is in ring 0.')(prompt, workflowId)
	}
	await go()
	await go()
	const [a1, a2] = store.workflows().sort((x, y) => x.code.localeCompare(y.code))
	assert.equal(a1.draft?.text, 'Banner fix is in ring 0.'); assert.equal(a2.draft?.text, 'I will review PR 42 today.')
	assert.equal(a2.chat.id, CHAT); assert.equal(a2.msgIds.length, 1)
	store.writeAnswer({ code: a1.code, verb: 'ok', surface: 'chat' })
	await go()
	assert.equal(store.byCode(a1.code)!.state, 'done', 'the other item\'s message does not block this send')
	store.writeAnswer({ code: a2.code, verb: 'ok', surface: 'chat' })
	await go()
	assert.equal(store.byCode(a2.code)!.state, 'done')
	const bodies = src.chats[CHAT].map(m => m.body)
	assert.ok(bodies.includes('Banner fix is in ring 0.') && bodies.includes('I will review PR 42 today.'), 'review P1-3: both replies were really sent')
})

test('D2 an ask from a different person starts its own item and never replaces someone else\'s draft', async () => {
	src.post(CHAT, 'me', '[as Priya] Why are some meeting options locked?'); await go()
	script = draft('The next train leaves Tuesday.')
	src.post(CHAT, 'me', '[as Ravi] When does the next release train leave?'); await go()
	const [priya, ravi] = store.workflows().sort((a, b) => a.code.localeCompare(b.code))
	assert.deepEqual([priya.asker?.name, priya.draft?.text], ['Priya', 'It is in ring 0.'])
	assert.deepEqual([ravi.asker?.name, ravi.draft?.text], ['Ravi', 'The next train leaves Tuesday.'])
})

test('D2 a split never moves all of an item\'s messages, so splits cannot chain', async () => {
	src.post(CHAT, 'me', '[as Ravi] Only one question here')
	script = (prompt, workflowId) => {
		const id = prompt.match(/>> \[id:(\d+)\]/)![1]
		return { ...draft('Answer.')(prompt, workflowId), split: [id] }
	}
	await go(); await go()
	assert.equal(store.workflows().length, 1)
})

test('D2 the prompt marks the item\'s own lines and leaves other topics as plain context', async () => {
	const { buildPrompt } = await import('../src/worker/prompt.ts')
	src.post(CHAT, 'me', '[as Ravi] Topic one?')
	src.post(CHAT, 'me', '[as Ravi] Topic two?')
	let seen = ''
	script = (prompt, workflowId) => {
		const two = prompt.match(/>> \[id:(\d+)\][^\n]*Topic two/)
		const wf = store.workflow(workflowId)!
		if (wf.msgIds.length === 2 && two) return { ...draft('One.')(prompt, workflowId), split: [two[1]] }
		seen = prompt
		return draft('Two.')(prompt, workflowId)
	}
	await go(); await go()
	assert.match(seen, /^ {3}\[[^\]]+\] Ravi: Topic one\?$/m)
	assert.match(seen, /^>> \[id:\d+\] \[[^\]]+\] Ravi: Topic two\?$/m)
	const a1 = store.byCode('A1')!
	assert.equal(a1.lastAsk, 'Topic one?')
	void buildPrompt
})

test('R-HIL-18 an AI CLI sign-in failure becomes a health problem with the fix, and clears on success', async () => {
	const { renderList } = await import('../src/core/render.ts')
	const failing = async () => ({ exitCode: 1, ms: 1, error: 'GitHub returned: Bad credentials' })
	src.post(CHAT, 'me', '[as Ravi] Status?')
	await tick(store, { source: src, run: failing, force: true })
	assert.equal(store.byCode('A1')!.status, 'Waiting for the AI CLI sign-in')
	const list = renderList(store.workflows(), new Date(), undefined, store.health())
	assert.match(list, /### Health\n- The AI CLI is not signed in on mac\. Run "" once and sign in\./)
	store.writeAnswer({ code: 'A1', verb: 'answer', text: 'retry', surface: 'chat' })
	await go()
	assert.deepEqual(store.health(), {})
})

test('R-HIL-18 an unreachable chat source is reported, not crashed', async () => {
	const broken = { selfChatId: 'self', newMessages: async () => { throw new Error('auth expired') }, close: async () => {} } as unknown as Source
	const r = await tick(store, { source: broken, run, force: true })
	assert.equal(r.skipped, 'source unavailable')
	assert.match(store.health().source.text, /Cannot reach chats from mac: Error: auth expired/)
	await go()
	assert.equal(store.health().source, undefined)
})

test('D2 after a split, the original item keeps its own asker, and that asker\'s new message blocks a stale send', async () => {
	src.post(CHAT, 'me', '[as Sam] Is the banner fix in?')
	src.post(CHAT, 'me', '[as Kim] Can you review my PR?')
	script = (prompt, workflowId) => {
		const kim = prompt.match(/>> \[id:(\d+)\][^\n]*Kim: Can you review/)
		const wf = store.workflow(workflowId)!
		if (kim && wf.msgIds.length > 1) return { ...draft('Banner fix is in.')(prompt, workflowId), split: [kim[1]] }
		return draft('Reviewing today.')(prompt, workflowId)
	}
	await go(); await go()
	const a1 = store.byCode('A1')!
	assert.equal(a1.asker?.name, 'Sam'); assert.equal(store.byCode('A2')!.asker?.name, 'Kim')
	src.post(CHAT, 'me', '[as Sam] Actually I meant the hotfix branch.')
	store.writeAnswer({ code: 'A1', verb: 'ok', surface: 'chat' })
	const before = src.chats[CHAT].length
	await go()
	assert.equal(src.chats[CHAT].length, before, 'the stale draft was not sent')
})

test('R-ING-07 a failed chat read is retried on the next tick, not marked seen', async () => {
	const dm = '19:x_y@unq.gbl.spaces'
	src.listed.add(dm)
	src.post(dm, 'sam', 'Hi Robin, first question?')
	src.failRead.add(dm)
	await go().catch(() => {})
	assert.equal(store.workflows().length, 0)
	await go()
	assert.equal(store.workflows()[0]?.lastAsk, 'Hi Robin, first question?')
})

test('R-ING-06 an idle tick makes two calls: one chat list and one self-chat read; a stopped tick makes one', async () => {
	src.listed.add(CHAT)
	await go()
	src.reads = []; src.lists = 0
	await go()
	assert.deepEqual([src.lists, src.reads], [1, ['self']])
	src.post('self', 'me', 'stop'); await go()
	src.reads = []; src.lists = 0
	await go()
	assert.deepEqual([src.lists, src.reads], [0, ['self']])
})

test('R-ING-01 the fast window is anchored to tick start, so a slow tick does not skip a minute', async () => {
	const { plan, DEFAULT_POLL } = await import('../src/core/schedule.ts')
	const s = plan({}, new Date('2026-10-17T10:00:00Z'), DEFAULT_POLL, true)
	assert.ok(Date.parse(s.nextAt!) <= Date.parse('2026-10-17T10:01:00Z'))
})

const rule = (over: Record<string, unknown> = {}) => ({ id: 'r1', text: 'Ravi status', who: { accounts: [{ id: 'test:ravi', name: 'Ravi' }] }, when: { intent: 'status_next_step' }, then: 'send', ...over })
const setRules = (...rules: unknown[]) => writeFileSync(join(store.root, 'rules.compiled.json'), JSON.stringify({ schema: 1, rules }))
const policy = (delayMin: number, extra: Record<string, unknown> = {}) => store.saveConfig({ ...store.config(), policy: { delayMin, undoMin: 10, maxAutoPerChatHour: 3, marker: "(sent by {first}'s assistant)", ackText: 'Got it.', ...extra } })
const autoOn = () => store.saveControl({ ...store.control(), autoSend: true })

test('bug 10-20 signature: with their own signature written, an AI reply the owner approves is signed by default; turning it off stops it; their own words never are', async () => {
	const { saveSetting, settingsView } = await import('../src/web/settings.ts')
	await saveSetting(store, 'signature', '(sent via AI)')
	assert.equal(settingsView(store).rows.find(r => r.key === 'signApproved')?.value, 'true', 'Settings shows it on')
	script = draft('Both findings are addressed.')
	src.post(CHAT, 'me', '[as Rita] Could you recheck PR 1?'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Both findings are addressed.\n\n(sent via AI)', 'the owner approved an AI reply: signed')
	src.post(CHAT, 'me', '[as Kim] And PR 2?'); await go()
	src.post('self', 'me', 'send A2: Not yet, tomorrow.'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Not yet, tomorrow.', 'the owner\'s own words are never signed')
	script = (_: string, workflowId: string): Report => ({ workflowId, intent: 'commitment_decision', state: 'needs_human', summary: 'Needs a date', question: 'Which date works?' } as Report)
	src.post(CHAT, 'me', '[as Dev] When can you ship?'); await go()
	const q = store.workflows().at(-1)!
	assert.equal(q.draft, undefined)
	src.post('self', 'me', `send ${q.code}: Friday works.`); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Friday works.', 'typed on an item with no draft: still the owner\'s words')
	script = draft('Both findings are addressed.\n\n(sent via AI)')
	src.post(CHAT, 'me', '[as Lee] And PR 4?'); await go()
	const a4 = store.workflows().at(-1)!.code
	await see(a4); src.post('self', 'me', `ok ${a4}`); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Both findings are addressed.\n\n(sent via AI)', 'a draft that already ends with the signature is signed once')
	script = draft('Both findings are addressed.')
	await saveSetting(store, 'signApproved', 'false')
	assert.equal(store.config().signApproved, false)
	src.post(CHAT, 'me', '[as Sam] And PR 3?'); await go()
	const a3 = store.workflows().at(-1)!.code
	await see(a3); src.post('self', 'me', `ok ${a3}`); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Both findings are addressed.', 'turned off: not signed')
})

test('signature: replies the AI wrote carry the owner\'s signature when they ask, words they typed never do, and automatic ones always do', async () => {
	script = draft('It is in ring 0.')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'It is in ring 0.', 'off by default for replies you approve')
	const { saveSetting } = await import('../src/web/settings.ts')
	assert.deepEqual(await saveSetting(store, 'signature', 'x'), { ok: false, text: 'Write 3 to 80 characters, such as "Responded via AI".' })
	await saveSetting(store, 'signature', 'Responded via AI for {first}'); await saveSetting(store, 'signApproved', 'true')
	src.post(CHAT, 'me', '[as Kim] And ring 1?'); await go()
	src.post('self', 'me', 'ok A2'); await go(); src.post('self', 'me', 'ok A2'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'It is in ring 0.\n\nResponded via AI for Robin')
	src.post(CHAT, 'me', '[as Sam] ETA?'); await go()
	src.post('self', 'me', 'send A3: Friday, I will confirm.'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Friday, I will confirm.', 'your own words are not signed')
	const { withMarker, signatureOf } = await import('../src/core/policy.ts')
	assert.equal(withMarker('Hi', signatureOf(store.config()), 'Robin Park'), 'Hi\n\nResponded via AI for Robin', 'automatic sends use the same signature')
})

test('R-POL-01 R-POL-10 R-RUL-06 C1 a rule-allowed reply is sent automatically with the marker, and Done names the rule', async () => {
	setRules(rule()); autoOn(); policy(0)
	src.post(CHAT, 'me', '[as Ravi] Status?')
	await go()
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'done'); assert.equal(wf.sent?.byRule, 'r1')
	assert.equal(src.chats[CHAT].at(-1)!.body, "It is in ring 0.\n\n(sent by Robin's assistant)")
	assert.match(wf.status, /^Sent by rule r1/)
	assert.match(src.chats.self.at(-1)!.body, /Sent A1 to Ravi by rule: "It is in ring 0\.". Undo for 10 more min: reply "undo A1"\./)
})

test('R-POL-03 C2 a scheduled reply is dropped when the owner replies during the delay', async () => {
	setRules(rule()); autoOn(); policy(15)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	let wf = store.byCode('A1')!
	assert.equal(wf.state, 'scheduled')
	src.post(CHAT, 'me', 'Ring 0, I will update later.')
	await go()
	wf = store.byCode('A1')!
	assert.equal(wf.status, 'You replied yourself'); assert.equal(src.chats[CHAT].at(-1)!.body, 'Ring 0, I will update later.')
})

test('R-POL-04 R-POL-13 C3 undo deletes the automatic reply and returns the draft; after the window it offers a correction', async () => {
	setRules(rule()); autoOn(); policy(0)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const sentId = store.byCode('A1')!.sent!.msgId
	src.post('self', 'me', 'undo A1'); await go()
	assert.equal(src.chats[CHAT].some(m => m.id === sentId), false)
	assert.equal(store.byCode('A1')!.state, 'needs_human')
	assert.match(src.chats.self.at(-1)!.body, /Undid A1/)
	store.writeAnswer({ code: 'A1', verb: 'ok', surface: 'chat' }); await go()
	const wf = store.byCode('A1')!; wf.sent = { ...wf.sent!, byRule: 'r1', undoUntil: new Date(Date.now() - 1000).toISOString() }; store.save(wf)
	src.post('self', 'me', 'undo A1'); await go()
	assert.match(src.chats.self.at(-1)!.body, /undo window for A1 has closed/)
})

test('R-RUL-07 R-POL-06 C4 no rule, a commitment, or a private source each stay a draft with the reason', async () => {
	autoOn(); policy(0)
	src.post(CHAT, 'me', '[as Kim] Status?'); await go()
	assert.equal(store.byCode('A1')!.decision?.reason, 'No rule covers this sender and ask')
	setRules(rule())
	script = (p, id) => ({ ...draft('By Friday.')(p, id), reply: { text: 'By Friday.', commitment: true, sources: [{ ref: 'w', tier: 'card', origin: 'extracted' }] } })
	src.post(CHAT, 'me', '[as Ravi] When?'); await go()
	const a2 = store.workflows().find(w => w.asker?.name === 'Ravi')!
	assert.equal(a2.state, 'needs_human'); assert.equal(a2.decision?.reason, 'It commits you to something')
})

test('R-POL-07 C5 the fourth automatic reply in a chat within an hour stays a draft', async () => {
	setRules(rule()); autoOn(); policy(0, { maxAutoPerChatHour: 1 })
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post(CHAT, 'me', '[as Ravi] And now?'); await go()
	const second = store.workflows().filter(w => w.asker?.name === 'Ravi').sort((a, b) => a.code.localeCompare(b.code))[1]
	assert.equal(second.state, 'needs_human'); assert.match(second.decision!.reason, /Already 1 automatic replies/)
})

test('R-POL-11 C6 an active owner holds automatic sends; they go out once the owner is away', async () => {
	setRules(rule()); autoOn(); policy(0)
	const other = '19:other@thread.v2'
	src.listed.add(other); src.post(other, 'me', 'typing elsewhere'); await go()
	src.availability = 'Available'
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(store.byCode('A1')!.status, 'Held: you are active in Teams')
	src.availability = 'Away'
	await go()
	assert.equal(store.byCode('A1')!.state, 'done')
})

test('R-POL-02 C7 with auto-send off, a rule-allowed reply stays a draft', async () => {
	setRules(rule()); policy(0)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(store.byCode('A1')!.decision?.reason, 'Auto-send is off')
	src.post('self', 'me', 'auto on'); await go()
	assert.equal(store.control().autoSend, true)
})

test('R-POL-04 where Teams refuses deletes, undo edits the message into a withdrawal note', async () => {
	setRules(rule()); autoOn(); policy(0)
	src.noDelete = true
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const id = store.byCode('A1')!.sent!.msgId
	src.post('self', 'me', 'undo A1'); await go()
	assert.equal(src.chats[CHAT].find(m => m.id === id)!.body, "This message was withdrawn.\n\n(sent by Robin's assistant)")
	assert.match(src.chats.self.at(-1)!.body, /Undid A1 \(message withdrawn\)/)
})

test('a failing effect is reported once and never blocks later ticks', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const realSend = src.send.bind(src)
	src.send = async () => { throw new Error('Teams is down') }
	src.post('self', 'me', 'ok A1'); await go()
	assert.match(src.chats.self.at(-1)!.body, /ok A1 failed: Error: Teams is down/)
	src.send = realSend
	const r = await go()
	assert.equal(r.answers, 0)
})

test('R-ANS-02 a reply with no card evidence never sends on its own', async () => {
	setRules(rule()); autoOn(); policy(0)
	script = (p, id) => ({ ...draft('Guess.')(p, id), reply: { text: 'Guess.', commitment: false, sources: [{ ref: 'wiki', tier: 'live', origin: 'extracted' }] } })
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(store.byCode('A1')!.decision?.reason, 'Not enough evidence to send on its own')
})

test('R-POL-07 scheduled replies count toward the hourly limit', async () => {
	setRules(rule()); autoOn(); policy(15, { maxAutoPerChatHour: 1 })
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post(CHAT, 'me', '[as Ravi] Different topic: release?')
	const a1 = store.byCode('A1')!; a1.msgIds = [a1.msgIds[0]]; store.save(a1)
	script = (p, id) => ({ ...draft('Ring 1.')(p, id), split: [] })
	await go()
	const scheduled = store.workflows().filter(w => w.state === 'scheduled')
	assert.equal(scheduled.length, 1)
})

test('R-POL-01 a rule removed during the delay stops the scheduled send', async () => {
	setRules(rule()); autoOn(); policy(15)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	setRules()
	const wf = store.byCode('A1')!; wf.sendAt = new Date(Date.now() - 1000).toISOString(); store.save(wf)
	const before = src.chats[CHAT].length
	await go()
	assert.equal(src.chats[CHAT].length, before)
	assert.equal(store.byCode('A1')!.status, 'Not sent: No rule covers this sender and ask')
})

test('R-POL-09 an acknowledgement goes out once, and never while paused', async () => {
	setRules(rule({ then: 'ack' })); autoOn(); policy(0)
	src.post('self', 'me', 'pause'); await go()
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(src.chats[CHAT].filter(m => m.body.startsWith('Got it.')).length, 0)
	src.post('self', 'me', 'resume'); await go()
	src.post(CHAT, 'me', '[as Ravi] Any update?'); await go()
	src.post(CHAT, 'me', '[as Ravi] Ping'); await go()
	assert.equal(src.chats[CHAT].filter(m => m.body.startsWith('Got it.')).length, 1)
})

test('R-POL-11 no nudge while the owner is in Do Not Disturb', async () => {
	src.availability = 'DoNotDisturb'
	src.post(CHAT, 'me', '[as Ravi] Status?')
	const r = await go()
	assert.equal(r.nudged, false)
})

test('R-POL-04 after the undo window, edit posts a correction under the sent reply', async () => {
	setRules(rule()); autoOn(); policy(0)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const wf = store.byCode('A1')!; wf.sent = { ...wf.sent!, undoUntil: new Date(Date.now() - 1000).toISOString() }; store.save(wf)
	src.post('self', 'me', 'send A1: Correction: it is ring 1.'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Correction: it is ring 1.')
	assert.match(src.chats.self.at(-1)!.body, /Posted your correction for A1/)
})

test('R-STO-06 a marked automatic reply that already landed is not sent twice', async () => {
	setRules(rule()); autoOn(); policy(15)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post(CHAT, 'me', "It is in ring 0.\n\n(sent by Robin's assistant)")
	const wf = store.byCode('A1')!; wf.sendAt = new Date(Date.now() - 1000).toISOString(); store.save(wf)
	const before = src.chats[CHAT].length
	await go()
	assert.equal(src.chats[CHAT].length, before)
	assert.equal(store.byCode('A1')!.status, 'Sent earlier')
})

test('R-POL-07 an undone automatic reply still counts toward the hourly limit', async () => {
	setRules(rule()); autoOn(); policy(0, { maxAutoPerChatHour: 1 })
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'undo A1'); await go()
	const before = src.chats[CHAT].length
	src.post(CHAT, 'me', '[as Ravi] And now?'); await go()
	const wf = store.byCode('A1')!
	assert.equal(src.chats[CHAT].length, before + 1)
	assert.equal(wf.state, 'needs_human')
	assert.equal(wf.decision?.reason, 'Already 1 automatic replies in this chat this hour')
})

test('R-POL-04 R-RUL-06 inbox lines show the undo window and why a matched rule did not send', async () => {
	const { renderItem } = await import('../src/core/render.ts')
	setRules(rule()); autoOn(); policy(0)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.match(renderItem(store.byCode('A1')!, 'line', new Date(), false), /undo for 10 min: "undo A1"/)
	store.saveControl({ ...store.control(), autoSend: false })
	src.post(CHAT, 'me', '[as Ravi] Next step?'); await go()
	const wf = store.workflows().find(w => w.code !== 'A1' && w.chat.id === CHAT)!
	assert.match(renderItem(wf, 'line', new Date(), false), /Not sent automatically \(Auto-send is off\)\. Reply "ok A\d" to send/)
})

test('review P1-1 ok while the item is being rewritten with an answer is refused', async () => {
	src.post(CHAT, 'me', '[as Ravi] When does it ship?'); await go()
	script = () => undefined
	src.post('self', 'me', 'answer A1: say Oct 24'); src.post('self', 'me', 'ok A1'); await go()
	assert.ok(!src.chats[CHAT].some(m => m.body === 'It is in ring 0.'), 'the old draft was not sent')
	assert.match(src.chats.self.map(m => m.body).join('\n'), /A1 is being rewritten with your answer/)
	assert.equal(store.byCode('A1')!.ownerAnswer, 'say Oct 24')
})

test('review P1-2 commands written in the same millisecond keep their order', async () => {
	const real = Date.now
	Date.now = () => 1_800_000_000_000
	try { for (let i = 0; i < 12; i++) store.writeAnswer({ code: `A${i}`, verb: 'skip', surface: 'chat' }) } finally { Date.now = real }
	assert.deepEqual(store.answers().map(a => a.answer.code), Array.from({ length: 12 }, (_, i) => `A${i}`))
})

test('review P1-4 an acknowledgement respects the hourly limit', async () => {
	setRules(rule({ then: 'ack' })); autoOn(); policy(0, { maxAutoPerChatHour: 1 })
	store.addAuto(CHAT, 'send')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(src.chats[CHAT].filter(m => m.body.startsWith('Got it.')).length, 0)
})

test('review P1-5 pause holds scheduled replies and corrections', async () => {
	setRules(rule()); autoOn(); policy(15)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(store.byCode('A1')!.state, 'scheduled')
	src.post('self', 'me', 'pause'); await go()
	assert.equal(store.byCode('A1')!.state, 'needs_human')
	assert.equal(store.byCode('A1')!.status, 'Held: you paused')
	assert.equal(store.byCode('A1')!.held, 'paused', 'a field, not only the status text, says why it is held')
	const wf = store.byCode('A1')!; Object.assign(wf, { state: 'done', sent: { msgId: '1', at: new Date().toISOString() } }); store.save(wf)
	const before = src.chats[CHAT].length
	src.post('self', 'me', 'send A1: Correction while paused'); await go()
	assert.equal(src.chats[CHAT].length, before)
})

// PM verification of N1a, P1: while paused, a rule never schedules a send. A rule-matched draft finished while paused stays
// with the owner, held (as the pause command holds a scheduled one), and resuming sends nothing by itself.
test('bug 10-21 paused rule send: a draft a rule would send, finished while paused, stays with the owner and Resume sends nothing', async () => {
	setRules(rule()); autoOn(); policy(0)
	src.post('self', 'me', 'pause'); await go()
	const before = src.chats[CHAT].length
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go(); await go()
	let a1 = store.byCode('A1')!
	assert.deepEqual([a1.state, a1.held, a1.sendAt, a1.decision?.ruleId !== undefined], ['needs_human', 'paused', undefined, true], 'held for the owner, never scheduled')
	assert.equal(src.chats[CHAT].length, before + 1, 'only the ask itself; nothing sent')
	src.post('self', 'me', 'resume'); await go(); await go()
	a1 = store.byCode('A1')!
	assert.deepEqual([a1.state, a1.held], ['needs_human', undefined], 'after resume it waits for the owner\'s Send')
	assert.equal(a1.status, 'Ready to send: held while you were paused', 'the held text does not outlive the pause')
	assert.equal(src.chats[CHAT].length, before + 1, 'resume sends nothing by itself')
	// A pause set in the config holds the same way.
	store.saveConfig({ ...store.config(), paused: true, watch: [...store.config().watch, { id: 'other-chat', name: 'Other', test: true }] } as never)
	src.post('other-chat', 'Kim', 'earlier history'); await go()
	src.post('other-chat', 'me', '[as Ravi] Status?'); await go(); await go()
	const a2 = store.workflows().find(w => w.chat.id === 'other-chat')
	assert.deepEqual([a2?.state, a2?.held, a2?.sendAt], ['needs_human', 'paused', undefined], 'a pause in the config holds it too')
	// Unpaused in the config, the next draft is no longer held: a rule may schedule it again.
	store.saveConfig({ ...store.config(), paused: undefined } as never)
	policy(15)
	src.post('other-chat', 'me', '[as Ravi] Any update?'); await go(); await go()
	const a3 = store.workflows().find(w => w.chat.id === 'other-chat')!
	assert.deepEqual([a3.state, a3.held], ['scheduled', undefined], 'a new draft after the pause is not held')
})

test('review P1-6 a machine that is not the runner never runs the cycle', async () => {
	store.saveConfig({ ...store.config(), runner: 'windows-box' })
	src.post(CHAT, 'me', '[as Ravi] Status?')
	const r = await go()
	assert.match(r.skipped ?? '', /runner is windows-box/)
	assert.equal(store.workflows().length, 0)
})

test('a standby machine takes over chat reading once no machine has run a cycle for 30 minutes, and says so in the log and the self-chat', async () => {
	store.saveConfig({ ...store.config(), runner: 'windows-box' })
	writeFileSync(join(store.root, 'state', 'runner.json'), JSON.stringify({ machine: 'windows-box', at: new Date(Date.now() - 29 * 60_000).toISOString() }))
	store.saveChats({ ...store.chats(), endAt: new Date(Date.now() - 7 * 86_400_000).toISOString() })
	src.post(CHAT, 'me', '[as Ravi] Status?')
	assert.match((await go()).skipped ?? '', /runner is windows-box/, '29 quiet minutes: still the other machine')
	writeFileSync(join(store.root, 'state', 'runner.json'), JSON.stringify({ machine: 'windows-box', at: new Date(Date.now() - 31 * 60_000).toISOString() }))
	assert.equal((await go()).skipped, undefined)
	assert.deepEqual([store.config().runner, store.workflows().length], ['mac', 1], 'took over and read the waiting message')
	assert.ok(store.logs(1).some(e => e.event === 'runner-takeover' && e.from === 'windows-box'))
	const notices = src.chats.self.filter(m => /ran no cycle|I was not reading/.test(m.body)).map(m => m.body)
	assert.equal(notices.length, 1, 'one notice, not a second "asleep" one for the old machine')
	assert.match(notices[0], /^Assistant · windows-box ran no cycle after \w{3} \d\d:\d\d, so mac now reads them\. To move it back, say "move \w+ here" to the AI on windows-box\.$/)
})

test('Bet 1 loudly off: a gap that swallowed half an hour of work hours is told once in the self-chat; a short or night gap is not', async () => {
	const { offNotice } = await import('../src/core/schedule.ts')
	const off = (a: string, b: string) => offNotice(a, new Date(b), 'mac', 'Asia/Kolkata')
	assert.equal(off('2026-10-20T04:30:00Z', '2026-10-20T05:30:00Z'), 'I was not reading your chats from Tue 10:00 to Tue 11:00 (mac was asleep or off). I have caught up; anything new from that time is in your list.')
	assert.equal(off('2026-10-13T04:30:00Z', '2026-10-20T05:30:00Z'), 'I was not reading your chats from Tue 13 Oct 10:00 to Tue 20 Oct 11:00 (mac was asleep or off). I have caught up; anything new from that time is in your list.', 'a gap over a day names the dates')
	assert.deepEqual([
		off('2026-10-20T04:30:00Z', '2026-10-20T04:55:00Z'),
		off('2026-10-19T13:30:00Z', '2026-10-20T03:50:00Z'),
		off('2026-10-17T12:30:00Z', '2026-10-19T03:20:00Z'),
		offNotice(undefined, new Date('2026-10-20T05:30:00Z'), 'mac', 'Asia/Kolkata'),
	], [undefined, undefined, undefined, undefined], '25 minutes; overnight waking at 9:20; a weekend; no earlier read')
	assert.ok(off('2026-10-19T13:30:00Z', '2026-10-20T04:00:00Z'), 'overnight, but 30 minutes into the work day')
	assert.equal(off('2026-10-17T05:30:00Z', '2026-10-17T10:30:00Z'), undefined, 'a Saturday is not a work day')

	store.saveChats({ ...store.chats(), endAt: new Date(Date.now() - 7 * 86_400_000).toISOString() })
	await go()
	const told = () => src.chats.self.filter(m => /I was not reading your chats from/.test(m.body)).length
	assert.equal(told(), 1, 'told after the catch-up')
	await go()
	assert.equal(told(), 1, 'told once per gap')
})

test('Bet 1 loudly off: while a gap search keeps failing, no "caught up" is claimed; it is told once the gap is closed', async () => {
	for (let i = 0; i < 50; i++) { const id = `19:busy${i}@thread.v2`; src.post(id, 'Zed', 'chatter'); src.listed.add(id) }
	store.saveChats({ ...store.chats(), readAt: new Date(Date.now() - 7 * 86_400_000).toISOString(), endAt: new Date(Date.now() - 7 * 86_400_000).toISOString() })
	const told = () => src.chats.self.filter(m => /I was not reading your chats from/.test(m.body)).length
	;(src as unknown as { awaiting: () => Promise<unknown[]> }).awaiting = async () => { throw new Error('Search 503') }
	await go(); await go()
	assert.equal(told(), 0, 'not caught up yet')
	assert.ok(Date.parse(store.chats().goodAt!) > Date.parse(store.chats().readAt!), 'chats were read, while the gap stays open')
	store.saveChats({ ...store.chats(), gapFailAt: new Date(Date.now() - 16 * 60_000).toISOString() })
	;(src as unknown as { awaiting: () => Promise<unknown[]> }).awaiting = async () => []
	await go(); await go()
	assert.equal(told(), 1, 'told once, after the catch-up')
})

test('Bet 1 loudly off: a long cycle, a stop, or a Teams outage is never called asleep, because a cycle still ran', async () => {
	const told = () => src.chats.self.filter(m => /I was not reading your chats from/.test(m.body)).length
	store.saveChats({ ...store.chats(), readAt: new Date(Date.now() - 7 * 86_400_000).toISOString(), endAt: new Date(Date.now() - 2 * 60_000).toISOString() })
	await go()
	assert.equal(told(), 0, 'the last cycle ended two minutes ago')
	src.post('self', 'me', 'stop'); await go()
	store.saveChats({ ...store.chats(), readAt: new Date(Date.now() - 7 * 86_400_000).toISOString() })
	await go()
	src.post('self', 'me', 'resume'); await go()
	assert.equal(told(), 0, 'stopped on purpose, and cycles kept running')
})

test('Bet 1 a takeover whose first read fails is still told after the next good read, once', async () => {
	store.saveConfig({ ...store.config(), runner: 'windows-box' })
	writeFileSync(join(store.root, 'state', 'runner.json'), JSON.stringify({ machine: 'windows-box', at: new Date(Date.now() - 31 * 60_000).toISOString() }))
	const orig = src.newMessages.bind(src)
	src.newMessages = async () => { throw new Error('Graph 503') }
	assert.equal((await go()).skipped, 'source unavailable')
	src.newMessages = orig
	await go(); await go()
	assert.equal(src.chats.self.filter(m => /windows-box ran no cycle/.test(m.body)).length, 1)
})

test('Bet 1 loudly off: a sleep inside a cycle is told; a notice whose send fails is kept for the next cycle', async () => {
	const told = () => src.chats.self.filter(m => /I was not reading your chats from/.test(m.body)).length
	let calls = 0
	// The second reading is 7 days behind the wall clock: the machine slept mid-cycle.
	await tick(store, { source: src, run, procs, force: true, history: noList, mono: () => (calls++ === 0 ? 7 * 86_400_000 : 0) })
	assert.match(store.chats().notice ?? '', /^I was not reading your chats from /, 'noted at the end of the cycle that slept')
	const orig = src.sendSelf.bind(src)
	src.sendSelf = async () => { throw new Error('Graph 503') }
	await go()
	assert.equal(told(), 0)
	assert.ok(store.chats().notice, 'kept after a failed send')
	src.sendSelf = orig
	await go(); await go()
	assert.equal(told(), 1, 'told once the send works')
})

test('Bet 1 an unknown time zone never stops a cycle: work hours use this machine, and Health says so', async () => {
	store.saveConfig({ ...store.config(), tz: 'Mars/Olympus' })
	assert.equal((await go()).skipped, undefined)
	assert.match(store.health().tz?.text ?? '', /^The time zone "Mars\/Olympus" in Settings is not known, so work hours use mac's clock\.$/)
	store.saveConfig({ ...store.config(), tz: 'Asia/Kolkata' })
	await go()
	assert.equal(store.health().tz, undefined)
})

test('review P1-7 a reading gap raises a health line', async () => {
	const orig = src.newMessages.bind(src)
	src.newMessages = async (c, a, s) => ({ ...(await orig(c, a, s)), truncated: c === CHAT })
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.match(store.health()[`gap:${CHAT}`]?.text ?? '', /Test Meeting/)
})

test('review P1-8 a failed edit stays visible with the owner text, and ok retries it', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const send = src.send.bind(src)
	src.send = async () => { throw new Error('temporary outage') }
	store.writeAnswer({ code: 'A1', verb: 'send', text: 'Owner exact answer', surface: 'chat' }); await go()
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'needs_human'); assert.equal(wf.draft?.text, 'Owner exact answer')
	assert.match(wf.status, /Could not send: .*temporary outage.*ok A1/)
	src.send = send
	store.writeAnswer({ code: 'A1', verb: 'ok', surface: 'chat' }); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Owner exact answer')
})

test('review P1-9 in a group chat, an owner reply naming the asker closes only that item', async () => {
	const g = '19:team@thread.v2'
	store.saveConfig({ ...store.config(), watch: [...store.config().watch, { id: g, name: 'Team', group: true }] })
	src.post(g, 'Kim', 'earlier history'); await go()
	src.post(g, 'Sam', 'Robin, is the banner fix in?')
	script = (prompt, workflowId) => ({ ...draft('Banner fix is in.')(prompt, workflowId), split: (prompt.match(/>> \[id:(\d+)\][^\n]*review my PR/) && store.workflow(workflowId)!.msgIds.length > 1) ? [prompt.match(/>> \[id:(\d+)\][^\n]*review my PR/)![1]] : undefined })
	src.post(g, 'Kim', 'Robin, can you review my PR?')
	await go(); await go()
	const items = () => store.workflows().filter(w => w.chat.id === g)
	assert.equal(items().length, 2)
	src.post(g, 'me', 'Sam, yes it shipped this morning.'); await go()
	const sam = items().find(w => w.asker?.name === 'Sam')!, kim = items().find(w => w.asker?.name === 'Kim')!
	assert.equal(sam.status, 'You replied yourself'); assert.notEqual(kim.state, 'done')
})

test('review P2-2 the nudge shows the draft and the undo notice shows the sent text', async () => {
	const { renderNudge } = await import('../src/core/render.ts')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.match(renderNudge([store.byCode('A1')!]), /Draft: "It is in ring 0\."/)
	setRules(rule()); autoOn(); policy(0)
	src.post(CHAT, 'me', '[as Ravi] And the other one?'); await go()
	assert.match(src.chats.self.at(-1)!.body, /Sent A\d to Ravi by rule: "It is in ring 0\."/)
})

const PR = { key: 'pr:org/repo/1', goal: 'Review PR 1' }
const needsJob = (job: NonNullable<Report['job']> = PR) => (_: string, workflowId: string): Report => ({ workflowId, intent: 'pr_review', state: 'needs_human', summary: 'Needs a review', job })
const review = (_: string, jobId: string): Report => ({
	workflowId: jobId, intent: 'pr_review', state: 'needs_human', summary: '2 findings, main one is a null check',
	reply: { text: 'Left 2 comments on PR 1.', commitment: false, sources: [{ ref: 'PR 1', tier: 'live', origin: 'extracted' }] },
	effects: [
		{ system: 'ado', action: 'comment', target: 'PR 1', summary: 'Null check missing in a.ts:10', payload: { file: 'a.ts', line: 10 }, call: { tool: 'ado-comment', args: { pullRequestId: 1, file: 'a.ts', line: 10 } } },
		{ system: 'ado', action: 'comment', target: 'PR 1', summary: 'Typo in b.ts:3', payload: { file: 'b.ts', line: 3 }, call: { tool: 'ado-comment', args: { pullRequestId: 1, file: 'b.ts', line: 3 } } },
	],
})
// A change run that made these changes: what make_change records for each, then the run's report.
const executed = (...ok: number[]) => (_: string, jobId: string, runId: string): Report => {
	for (const index of ok) store.saveChange(jobId, runId, index, { call: '', state: 'done', ref: `thread-${index}`, at: new Date().toISOString() })
	return { workflowId: jobId, intent: 'other', state: 'done', summary: 'Posted' }
}
const effectTools = () => store.saveConfig({ ...store.config(), agent: { ...store.config().agent, effectTools: ['ado-comment'] } })

test('R-LNG-01 R-LNG-02 R-LNG-05 a PR review runs as a detached job; the item shows it running with elapsed time', async () => {
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go()
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'waiting_on_task')
	assert.equal(jf.starts.length, 1, 'started once, and the tick did not wait for it')
	assert.match(jf.starts[0].prompt, /Goal: Review PR 1[\s\S]*Vikram: Can you review PR 1\?/)
	assert.equal(store.jobs().length, 1); assert.equal(store.jobs()[0].state, 'running')
	const { renderItem } = await import('../src/core/render.ts')
	assert.match(renderItem(wf, 'line', new Date(), false), /Working: Review PR 1 \(0 min\)/)
	await go()
	assert.equal(jf.starts.length, 1, 'a running job is not started twice')
})

const short = (kind: string, why: string, tried: string[], reply?: string) => (_: string, id: string): Report => ({ workflowId: id, intent: 'pr_review', state: 'needs_human', summary: `Unverified: ${why}`, goalMet: false, blocker: { kind, why, tried } as never, ...(reply ? { reply: { text: reply, commitment: false, sources: [] } } : {}), effects: [{ system: 'ado', action: 'comment', target: 'PR 1', summary: 'x' }] } as Report)
const dueNow = () => { for (const j of store.jobs()) if (j.retry) store.saveJob({ ...j, nextAt: new Date(Date.now() - 1000).toISOString(), retry: { ...j.retry, at: new Date(Date.now() - 1000).toISOString() } }) }

test('goal-retry A34: a review that falls short tries again another way, quietly, then the full draft arrives', async () => {
	script = needsJob()
	let n = 0
	jf.job = (p, id) => (++n === 1 ? short('tool', 'No tool found to read the updated diff', ['ado repo_pull_request: no diff in the reply'], 'Thanks, I could not verify the diff yet.')(p, id) : review(p, id))
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go(); await go()
	let wf = store.byCode('A1')!
	assert.equal(wf.state, 'waiting_on_task', 'not in Needs you with a half answer')
	assert.match(wf.status, /^Retrying \(1 of 2\) at \d\d:\d\d: No tool found to read the updated diff$/)
	assert.equal(wf.draft, undefined, 'the hedged reply is not offered')
	assert.deepEqual([store.jobs()[0].state, store.jobs()[0].retry?.n], ['queued', 1])
	await go()
	assert.equal(jf.starts.length, 1, 'waits for its time')
	store.saveSchedule({})
	await tick(store, { source: src, run, procs, history: noList })
	assert.equal(store.schedule().nextAt, store.jobs()[0].retry!.at, 'a waiting retry neither keeps fast checking on nor waits for the idle check')
	dueNow(); await go()
	assert.equal(jf.starts.length, 2)
	assert.match(jf.starts[1].prompt, /fell short of the goal: No tool found to read the updated diff\. Already tried, do not repeat: ado repo_pull_request: no diff in the reply\./)
	assert.doesNotMatch(jf.starts[1].prompt, /Your earlier result: Unverified/, 'what fell short is not passed off as a result')
	await go()
	wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.draft?.text, wf.draft?.holding, store.jobs()[0].retry], ['needs_human', 'Left 2 comments on PR 1.', undefined, undefined])
})

test('goal-retry: out of tries, the owner sees why and what was tried, a holding reply no rule sends, and no changes; the last try is in a fresh session', async () => {
	script = needsJob()
	let n = 0
	jf.job = (p, id) => short('tool', 'No tool found to read the updated diff', [`route ${++n}`], 'Thanks, rechecking the updated diff now.')(p, id)
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go(); await go()
	const first = store.jobs()[0].session.id
	dueNow(); await go(); await go()
	assert.notEqual(store.jobs()[0].session.id, first, 'the last try starts a fresh session')
	dueNow(); await go(); await go()
	const wf = store.byCode('A1')!
	assert.equal(jf.starts.length, 3, 'two more tries, then it stops')
	assert.equal(wf.state, 'needs_human')
	assert.equal(wf.status, 'Tried 3 times; No tool found to read the updated diff. Tried: route 1; route 2; route 3')
	assert.deepEqual([wf.draft?.text, wf.draft?.holding, wf.effects], ['Thanks, rechecking the updated diff now.', true, []])
	const { decide } = await import('../src/core/policy.ts')
	assert.deepEqual(decide(wf, [rule({ who: { accounts: [{ id: 'test:vikram', name: 'Vikram' }] }, when: {} }) as never], { autoSend: true, autoSendsThisHour: 0, maxPerHour: 9 }).reason, 'A holding reply: the work is not finished, so it waits for you')
	const { view } = await import('../src/web/view.ts')
	assert.equal(view(store, undefined).needs.find(c => c.code === 'A1')?.draft?.holding, true)
})

test('goal-retry: the same failure with nothing new tried stops early; access is believed only after two routes; a new ask runs at once; paused waits; a closed item ends the retry', async () => {
	script = needsJob()
	jf.job = short('tool', 'No diff tool', ['repo_pull_request'])
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go(); await go(); dueNow(); await go(); await go()
	assert.equal(store.byCode('A1')!.status, 'Tried 2 times; No diff tool. Tried: repo_pull_request', 'the same thing failed again')
	src.post('self', 'me', 'skip A1'); await go()
	jf.job = short('access', 'Access denied', ['repo_pull_request: 403'])
	src.post(CHAT, 'me', '[as Kim] Can you review PR 2?')
	script = needsJob({ key: 'pr:org/repo/2', goal: 'Review PR 2' })
	await go(); await go()
	const a2 = store.workflows().at(-1)!
	assert.match(a2.status, /^Retrying \(1 of 2\)/, 'one route is not proof of no access')
	jf.job = short('access', 'Access denied', ['repo_pull_request: 403', 'git fetch: 403'])
	src.post(CHAT, 'me', '[as Kim] It is urgent')
	await go()
	assert.equal(store.jobs().find(j => j.key === 'pr:org/repo/2')!.retry, undefined, 'a new ask ends the wait')
	await go()
	assert.match(store.byCode(a2.code)!.status, /^Blocked: Access denied\. Tried: repo_pull_request: 403; git fetch: 403/)
	src.post('self', 'me', `skip ${a2.code}`); await go()
	jf.job = short('transient', 'ADO returned 503', [])
	script = needsJob({ key: 'pr:org/repo/3', goal: 'Review PR 3' })
	src.post(CHAT, 'me', '[as Sam] Can you review PR 3?'); await go(); await go()
	const before = jf.starts.length
	src.post('self', 'me', 'pause'); await go()
	dueNow(); await go()
	assert.equal(jf.starts.length, before, 'paused: no retry runs')
	src.post('self', 'me', `skip ${store.workflows().at(-1)!.code}`); await go()
	src.post('self', 'me', 'resume'); await go()
	dueNow(); await go()
	assert.equal(jf.starts.length, before, 'its item closed: the retry is dropped')
	assert.equal(store.jobs().find(j => j.key === 'pr:org/repo/3')!.state, 'done')
})

test('goal-retry: a job that stops with no report tries again as a busy moment before telling the owner', async () => {
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go()
	for (const s of jf.starts) jf.dead.add(5000 + jf.starts.indexOf(s) + 1)
	await go()
	const wf = store.byCode('A1')!
	assert.match(wf.status, /^Retrying \(1 of 3\) at \d\d:\d\d: It stopped without a result$/)
	assert.equal(store.jobs()[0].state, 'queued')
})

test('goal-retry: a tracker check that could not see its target is not news; it checks again as usual', async () => {
	const { track } = await import('../src/runner/track.ts')
	const { finishWork } = await import('../src/runner/jobs.ts')
	track(store, { target: 'PR 9', until: 'it merges' })
	const job = store.jobs().at(-1)!, wf = store.workflows().at(-1)!
	store.saveJob({ ...job, last: 'seen-before' })
	finishWork(store, store.job(job.id)!, { workflowId: job.id, intent: 'other', state: 'needs_human', summary: 'Could not read PR 9', goalMet: false, blocker: { kind: 'tool', why: 'no tool', tried: [] } } as Report, job.asks.length)
	assert.deepEqual([store.workflow(wf.id)!.status, store.workflow(wf.id)!.changedAt], [wf.status, wf.changedAt], 'nothing announced')
	const after = store.job(job.id)!
	assert.deepEqual([after.last, after.state, after.retry], ['seen-before', 'done', undefined])
	assert.ok(Date.parse(after.nextAt!) > Date.now() + 50 * 60_000, 'next check at its usual interval')
})

test('goal-retry review: paused never spins the checks; out of tries never shows an older draft; trackers and shepherds keep their timing', async () => {
	script = needsJob(); jf.job = short('transient', 'ADO 503', [])
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go(); await go()
	src.post('self', 'me', 'pause'); await go()
	dueNow(); store.saveSchedule({})
	await tick(store, { source: src, run, procs, history: noList })
	assert.ok(Date.parse(store.schedule().nextAt!) > Date.now() + 5 * 60_000, 'a retry that cannot start while paused does not make the next check due now')
	const wf = store.byCode('A1')!
	store.save({ ...wf, draft: { text: 'An older reply', commitment: false, sources: [] } })
	jf.job = short('access', 'Denied', ['api: 403', 'git: 403'])
	src.post('self', 'me', 'resume'); await go(); await go()
	assert.deepEqual([store.byCode('A1')!.status.startsWith('Blocked'), store.byCode('A1')!.draft, store.byCode('A1')!.newCount], [true, undefined, 0], 'no older draft offered as the answer')
	assert.ok(store.byCode('A1')!.revAt, 'marked as changed')
	const { track } = await import('../src/runner/track.ts')
	const { finishWork, startJobs } = await import('../src/runner/jobs.ts')
	track(store, { target: 'PR 9', until: 'it merges' })
	const tj = store.jobs().at(-1)!
	const later = new Date(Date.now() + 3_600_000).toISOString()
	finishWork(store, { ...tj, nextAt: later }, { workflowId: tj.id, intent: 'other', state: 'needs_human', summary: 'Needs a call', question: 'Merge now?' } as Report, tj.asks.length)
	assert.equal(store.job(tj.id)!.nextAt, later, 'a shepherd that asks something keeps its next check')
	store.saveJob({ ...store.job(tj.id)!, state: 'queued' })
	const before = jf.starts.length
	startJobs(store, store.config(), procs)
	assert.equal(jf.starts.length, before + 1, 'a queued tracker with a later next check still starts at once (only retries wait)')
})

test('goal-retry review: a reply run that falls short offers no changes; a reopened item does not keep its older draft', async () => {
	script = (_: string, workflowId: string): Report => ({ workflowId, intent: 'status_next_step', state: 'needs_human', summary: 'x', reply: { text: 'Done, here it is.', commitment: false, sources: [] } } as Report)
	src.post(CHAT, 'me', '[as Ravi] Can you share the doc?'); await go()
	src.post('self', 'me', 'skip A1'); await go()
	script = (_: string, workflowId: string): Report => ({ workflowId, intent: 'status_next_step', state: 'needs_human', summary: 'Could not', goalMet: false, blocker: { kind: 'tool', why: 'No doc tool', tried: ['doc_read: none'] }, reply: { text: 'Checking the updated doc now.', commitment: false, sources: [] }, effects: [{ system: 'ado', action: 'comment', target: 'PR 1', summary: 'x' }] } as Report)
	src.post(CHAT, 'me', '[as Ravi] And the updated one?'); await go()
	const wf = store.workflows().at(-1)!
	assert.deepEqual([wf.state, wf.draft?.text, wf.draft?.holding, wf.effects, store.jobs().filter(j => j.key === `item:${wf.id}`).length], ['needs_human', 'Checking the updated doc now.', true, undefined, 0], 'only this run\'s holding reply, and no changes')
	src.post('self', 'me', `skip ${wf.code}`); await go()
	script = (_: string, workflowId: string): Report => ({ workflowId, intent: 'status_next_step', state: 'needs_human', summary: 'Could not', goalMet: false, blocker: { kind: 'tool', why: 'No doc tool', tried: [] } } as Report)
	src.post(CHAT, 'me', '[as Ravi] Any luck?'); await go()
	assert.equal(store.byCode(wf.code)!.draft, undefined, 'a reopened item does not offer its older draft')
})

test('goal-retry: a reply run that falls short is never closed as nothing needed; the owner sees why', async () => {
	script = (_: string, workflowId: string): Report => ({ workflowId, intent: 'status_next_step', state: 'done', summary: 'Could not check', goalMet: false, blocker: { kind: 'tool', why: 'No tool found for the build status', tried: ['pipelines_build: not listed'] } } as Report)
	src.post(CHAT, 'me', '[as Ravi] Did build 5 pass?')
	await go()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.status], ['needs_human', 'Not finished: No tool found for the build status. Tried: pipelines_build: not listed'])
})

test('dogfood 10-20: a job that finds nothing for the owner (PR already merged) closes the item quietly instead of asking', async () => {
	script = needsJob(); jf.job = (_: string, id: string): Report => ({ workflowId: id, intent: 'pr_review', state: 'done', summary: 'Already merged by Dev on Oct 20' })
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go(); await go()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.status, wf.draft], ['done', 'Nothing needed: Already merged by Dev on Oct 20', undefined])
	const { view } = await import('../src/web/view.ts')
	assert.deepEqual([view(store, undefined).needs.length, view(store, undefined).done.some(d => d.code === 'A1')], [0, true], 'not in Needs you; a line under Done')
	jf.job = (_: string, id: string): Report => ({ workflowId: id, intent: 'pr_review', state: 'done', summary: 'Merged', reply: { text: 'Looks good.', commitment: false, sources: [] } })
	src.post(CHAT, 'me', '[as Vikram] And PR 2?')
	await go(); await go()
	assert.equal(store.workflows().at(-1)!.state, 'needs_human', 'a reply still waits for the owner')
	src.post('self', 'me', `skip ${store.workflows().at(-1)!.code}`); await go()
	jf.job = (_: string, id: string): Report => ({ workflowId: id, intent: 'pr_review', state: 'done', summary: 'Approved by the area owners' })
	src.post(CHAT, 'me', '[as Vikram] And PR 3?'); await go()
	const w3 = store.workflows().at(-1)!
	store.save({ ...w3, work: { goal: 'Ship the banner', doneWhen: 'live', steps: [], links: [] } })
	await go()
	assert.deepEqual([store.byCode(w3.code!)!.state, store.byCode(w3.code!)!.work?.steps.at(-1)?.what], ['open', 'Found: Approved by the area owners'], 'on open work it stays open, with the finding as a step')
})

test('R-LNG-03 R-HIL-21 the finished job lists every change before ok, with one item and no second reply run', async () => {
	effectTools(); script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go(); await go()
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'needs_human'); assert.equal(wf.draft?.text, 'Left 2 comments on PR 1.')
	assert.equal(wf.decision?.reason, 'A review or investigation result always waits for you', 'dogfood 10-20: the card says why it waits')
	assert.equal(store.workflows().length, 1, 'the job is never its own item')
	assert.equal(runs.length, 1, 'no second reply run')
	const { renderItem } = await import('../src/core/render.ts')
	const full = renderItem(wf, 'full', new Date(), false)
	assert.match(full, /Ready: 2 findings, main one is a null check/)
	assert.match(full, /ok will: 2× comment on PR 1, then send the reply/)
	assert.match(full, /- comment on PR 1: file: a\.ts; line: 10\n- comment on PR 1: file: b\.ts; line: 3/)
})

test('R-HIL-21 ok makes the changes through make_change, with the read-only tools, then sends the reply', async () => {
	effectTools(); store.saveConfig({ ...store.config(), agent: { ...store.config().agent, tools: ['ado-read'] } }); script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go(); await go()
	jf.job = executed(0, 1)
	src.post('self', 'me', 'ok A1'); await go()
	const exec = jf.starts.at(-1)!
	assert.deepEqual([exec.tools, exec.extraTools], [['ado-read'], ['delegate_worker-submit_report', 'delegate_worker-make_change']], 'the read tools let it check a change was not already made; no write tool, only make_change (next action)')
	assert.match(exec.prompt, /\[approved-only\][\s\S]*0\. \{"system":"ado"[\s\S]*1\. \{"system":"ado"/)
	assert.doesNotMatch(exec.prompt, /\[report-only\]/)
	assert.ok(!src.chats[CHAT].some(m => m.body === 'Left 2 comments on PR 1.'), 'the reply waits for the changes')
	await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Left 2 comments on PR 1.')
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'done'); assert.deepEqual(wf.effects!.map(e => e.done?.ref), ['thread-0', 'thread-1'])
})

test('R-HIL-21 a partial result keeps the item with what was and was not done, and sends nothing', async () => {
	effectTools(); script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go(); await go()
	jf.job = (p, id, runId) => { store.saveChange(id, runId, 1, { call: '', state: 'failed', error: 'line moved', at: new Date().toISOString() }); return executed(0)(p, id, runId) }
	src.post('self', 'me', 'ok A1'); await go(); await go()
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'needs_human')
	assert.match(wf.status, /Made 1 of 2 changes\. Not done: comment on PR 1: file: b\.ts; line: 3 \(line moved\)\. Reply "ok A1" to retry/)
	assert.ok(!src.chats[CHAT].some(m => m.body === 'Left 2 comments on PR 1.'))
	jf.job = executed(1)
	src.post('self', 'me', 'ok A1'); await go(); await go()
	assert.match(jf.starts.at(-1)!.prompt, /Approved changes, in order:\n1\. /, 'a retry lists only the change not yet made')
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Left 2 comments on PR 1.')
})

test('R-HIL-21 without write tools, ok explains instead of sending part of the work', async () => {
	script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go(); await go()
	assert.deepEqual(store.byCode('A1')!.todos, ['Null check missing in a.ts:10. Not made for you: ado-comment is not one of the changes you allow', 'Typo in b.ts:3. Not made for you: ado-comment is not one of the changes you allow'], 'next action: never vanishes')
	src.post('self', 'me', 'ok A1'); await go()
	assert.match(src.chats.self.at(-1)!.body, /A1 is not ready: The reply counts on 2 changes Delegate cannot make, listed as yours to do\. Change the reply with "edit A1: <text>", or skip A1\./)
	assert.equal(store.byCode('A1')!.state, 'needs_human')
})

test('R-WF-11 two asks about PR 1 share one job and session; PR 2 gets its own', async () => {
	const other = 'other-chat'
	store.saveConfig({ ...store.config(), watch: [...store.config().watch, { id: other, name: 'Other', test: true }] })
	src.post(other, 'me', 'history'); await go()
	jf.job = () => undefined
	script = (p, id) => needsJob(/PR 2/.test(p.split('>>').slice(1).join('')) ? { key: 'pr:org/repo/2', goal: 'Review PR 2' } : PR)(p, id)
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	src.post(other, 'me', '[as Ana] Is PR 1 good to merge?')
	await go()
	src.post(CHAT, 'me', '[as Kim] Please look at PR 2')
	await go()
	const jobs = store.jobs().sort((a, b) => a.key.localeCompare(b.key))
	assert.deepEqual(jobs.map(j => j.key), ['pr:org/repo/1', 'pr:org/repo/2'])
	assert.equal(jobs[0].parents.length, 2)
	assert.equal(new Set(jf.starts.filter(s => s.workflowId === jobs[0].id).map(s => s.sessionId)).size, 1)
})

test('R-LNG-04 a job over its time budget is stopped and the item says why; a dead run says so too', async () => {
	store.saveConfig({ ...store.config(), jobs: { minutes: 1 } })
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	const age = () => { const j = store.jobs()[0]; j.run!.startedAt = new Date(Date.now() - 5 * 60_000).toISOString(); store.saveJob(j); return j.run!.pid }
	const first = age()
	await go()
	assert.deepEqual(jf.killed, [first])
	assert.deepEqual([jf.starts.length, jf.starts[1].sessionId, store.jobs()[0].run?.wrapUp], [2, jf.starts[0].sessionId, true], 'one last turn in the same session')
	assert.match(jf.starts[1].prompt, /^Your time for this job is up\. Stop looking further\. Call submit_report now/)
	assert.match(store.byCode('A1')!.status, /Working/)
	age(); await go()
	assert.match(store.byCode('A1')!.status, /Stopped after 4 minutes, its time budget/, 'a last turn that also runs out fails as before')
	src.post(CHAT, 'me', '[as Vikram] Try again please'); await go()
	jf.dead.add(store.jobs()[0].run!.pid); await go()
	assert.match(store.byCode('A1')!.status, /stopped without a result/)
})

test('a job out of time keeps what it found: its last turn reports, and the item shows the result', async () => {
	store.saveConfig({ ...store.config(), jobs: { minutes: 1 } })
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Why is people and groups disabled?'); await go()
	const j = store.jobs()[0]; j.run!.startedAt = new Date(Date.now() - 2 * 60_000).toISOString(); store.saveJob(j)
	jf.job = (p, id) => (p.startsWith('Your time for this job is up') ? { workflowId: id, intent: 'other', state: 'needs_human', summary: 'Sensitivity label limits it; xlsx not checked', reply: { text: 'It is the sensitivity label: General allows only your org.', commitment: false, sources: [] } } : undefined)
	await go(); await go()
	assert.deepEqual([store.byCode('A1')!.state, store.byCode('A1')!.draft?.text, store.jobs()[0].state], ['needs_human', 'It is the sensitivity label: General allows only your org.', 'done'])
})

test('R-WF-11 scenario 04 step 5: "fixed, please recheck" resumes the same job session with the new ask', async () => {
	script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go(); await go()
	const first = jf.starts[0].sessionId
	src.post(CHAT, 'me', '[as Vikram] Fixed, please recheck'); await go()
	assert.equal(jf.starts.length, 2); assert.equal(jf.starts[1].sessionId, first)
	assert.match(jf.starts[1].prompt, /Vikram: Can you review PR 1\?\n- Vikram: Fixed, please recheck/)
})

test('R-SET-07 a slow job never delays pause', async () => {
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	src.post('self', 'me', 'pause'); await go()
	assert.equal(store.control().paused, true); assert.equal(store.jobs()[0].state, 'running')
})

test('R-HIL-08 R-HIL-17 continue opens the job session in a window; the runner leaves the item alone until it closes', async () => {
	script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go(); await go()
	src.post('self', 'me', 'continue A1'); await go()
	assert.deepEqual(jf.windows[0].slice(-2), ['continue', 'A1'])
	assert.match(src.chats.self.at(-1)!.body, /Opening A1 in a new window on mac/)
	const job = store.jobs()[0]
	store.setOpenWindow(job.id, { machine: 'mac', pid: 7777, runId: 'R1', since: new Date().toISOString() })
	await go()
	const { renderItem } = await import('../src/core/render.ts')
	assert.match(renderItem(store.byCode('A1')!, 'line', new Date(), false), /Open in a window on mac/)
	store.writeReport({ ...review('', job.id), reply: { text: 'Looks good after the fix.', commitment: false, sources: [] } }, 'R1')
	store.setOpenWindow(job.id, { machine: 'mac', pid: 7777, runId: 'R1', since: new Date().toISOString(), closed: true })
	await go()
	const wf = store.byCode('A1')!
	assert.equal(wf.openOn, undefined); assert.equal(wf.draft?.text, 'Looks good after the fix.'); assert.equal(wf.draft?.preview, true)
	assert.equal(store.openWindows().length, 0)
	assert.ok(!src.chats[CHAT].some(m => m.body === 'Looks good after the fix.'), 'nothing leaves without an ok outside the window')
})

test('R-HIL-08 continue opens nothing while the job runs or when its repo is missing', async () => {
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	// The folder an owned session runs in, which Delegate recorded itself, is gone. An AI never names a folder (owned work).
	const gone = join(tmpdir(), 'delegate-no-such-repo'), job = store.job(store.byCode('A1')!.job!)!
	jf.dead.add(job.run!.pid); store.saveJob({ ...job, state: 'queued', run: undefined, repo: gone }); await go()
	assert.match(store.byCode('A1')!.status, /needs the repo .*delegate-no-such-repo/)
	src.post('self', 'me', 'continue A1'); await go()
	assert.equal(jf.windows.length, 0)
	assert.match(src.chats.self.at(-1)!.body, /needs the repo .*delegate-no-such-repo on mac, so nothing was opened/)
})

test('R-HIL-08 continue waits while the job is still working', async () => {
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	src.post('self', 'me', 'continue A1'); await go()
	assert.equal(jf.windows.length, 0)
	assert.match(src.chats.self.at(-1)!.body, /A1 is still working\. Say "continue A1" again when it finishes/)
})

// Tester findings for slice 04 (dev-spec/slices/tests/04-long-jobs.md).
const reviewed = async () => {
	effectTools(); script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go(); await go()
	jf.job = () => undefined
}
const execStarts = () => jf.starts.filter(s => /Approved changes/.test(s.prompt))
const finishExec = (...ok: number[]) => {
	const run = store.jobs()[0].run!
	store.writeReport(executed(...ok)('', store.jobs()[0].id, run.id), run.id)
	jf.dead.add(run.pid)
}

test('tester P0 an ok given before a rewrite never sends the rewritten reply', async () => {
	await reviewed()
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(execStarts().length, 1)
	const execPid = store.jobs()[0].run!.pid
	script = needsJob()
	jf.job = (p, id) => (/Approved changes/.test(p) ? undefined : { ...review(p, id), reply: { text: 'Reject it instead.', commitment: false, sources: [] } })
	src.post(CHAT, 'me', '[as Vikram] Actually, reject it instead'); await go(); await go()
	assert.deepEqual(jf.killed, [execPid], 'the change run lost its ok and was stopped')
	assert.ok(!src.chats[CHAT].some(m => m.body === 'Reject it instead.' || m.body === 'Left 2 comments on PR 1.'), 'nothing was sent without a new ok')
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'needs_human'); assert.equal(wf.draft?.text, 'Reject it instead.'); assert.equal(wf.approved, undefined)
})

test('tester P1-2 skip right after ok starts no change run', async () => {
	await reviewed()
	src.post('self', 'me', 'ok A1'); src.post('self', 'me', 'skip A1'); await go()
	assert.equal(execStarts().length, 0)
	assert.equal(store.jobs()[0].state, 'done')
})

test('tester P1-2 pause stops a running change run', async () => {
	await reviewed()
	src.post('self', 'me', 'ok A1'); await go()
	const pid = store.jobs()[0].run!.pid
	src.post('self', 'me', 'pause'); await go()
	assert.deepEqual(jf.killed, [pid])
	assert.equal(store.jobs()[0].state, 'done')
	assert.match(store.byCode('A1')!.status, /Held: you paused\. Some changes may be done; ok A1 retries the rest/)
})

test('tester P1-3 two items on one job share one change run, and each sends its own reply', async () => {
	const other = 'other-chat'
	store.saveConfig({ ...store.config(), watch: [...store.config().watch, { id: other, name: 'Other', test: true }] })
	src.post(other, 'me', 'history'); await go()
	effectTools(); script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); src.post(other, 'me', '[as Ana] Is PR 1 good?'); await go()
	finishExecLike(review); await go()
	jf.job = () => undefined
	src.post('self', 'me', 'ok A1'); await go()
	src.post('self', 'me', 'ok A2'); await go()
	assert.equal(execStarts().length, 1, 'the second ok joined the first run')
	finishExec(0, 1); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Left 2 comments on PR 1.'); assert.equal(src.chats[other].at(-1)!.body, 'Left 2 comments on PR 1.')
})
const finishExecLike = (f: typeof review) => {
	const job = store.jobs()[0], run = job.run!
	store.writeReport(f('', job.id), run.id); jf.dead.add(run.pid)
}

test('tester P1-4 a "never mind" that arrived before ok stops the changes', async () => {
	await reviewed()
	src.post(CHAT, 'me', '[as Vikram] Never mind, do not comment')
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(execStarts().length, 0)
	assert.match(src.chats.self.map(m => m.body).join('\n'), /Not done A1: new messages since the draft/)
})

test('tester P1-5 continue then ok in one batch opens one window and makes no changes', async () => {
	await reviewed()
	src.post('self', 'me', 'continue A1'); src.post('self', 'me', 'continue A1'); src.post('self', 'me', 'ok A1'); await go()
	assert.equal(jf.windows.length, 1); assert.equal(execStarts().length, 0)
	assert.match(src.chats.self.map(m => m.body).join('\n'), /A1 is open in a window\. Close the window first/)
})

test('tester P1-5 an open job window keeps the reply drafter away from its item', async () => {
	script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go(); await go()
	store.setOpenWindow(store.jobs()[0].id, { machine: 'mac', pid: 7777, runId: 'R1', since: new Date().toISOString() })
	const before = runs.length
	src.post(CHAT, 'me', '[as Vikram] One more thing'); await go()
	assert.equal(runs.length, before)
})

test('tester P1-5 a report from a run that is still exiting is applied only after it exits', async () => {
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	const job = store.jobs()[0]
	store.writeReport(review('', job.id), job.run!.id); await go()
	assert.equal(store.jobs()[0].state, 'running')
	jf.dead.add(job.run!.pid); await go()
	assert.equal(store.jobs()[0].state, 'done')
})

test('tester P1-7 a send failure after the changes leaves a retry, not "still working"', async () => {
	await reviewed()
	src.post('self', 'me', 'ok A1'); await go()
	const send = src.send.bind(src)
	src.send = async () => { throw new Error('Teams down') }
	finishExec(0, 1); await go()
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'needs_human'); assert.match(wf.status, /Changes made\. Could not send the reply: .*Teams down.*ok A1/)
	src.send = send
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Left 2 comments on PR 1.')
	assert.equal(execStarts().length, 1, 'changes already made are not made again')
})

test('tester P1-10 budgets are enforced even while stopped', async () => {
	store.saveConfig({ ...store.config(), jobs: { minutes: 1 } })
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	src.post('self', 'me', 'stop'); await go()
	const job = store.jobs()[0]; job.run!.startedAt = new Date(Date.now() - 2 * 60_000).toISOString(); store.saveJob(job)
	await go()
	assert.deepEqual(jf.killed, [job.run!.pid])
})

test('tester P1-11 phone nudge, preview, and more all say what ok will change', async () => {
	const { renderNudge, renderPreview, renderMore } = await import('../src/core/render.ts')
	await reviewed()
	const wf = store.byCode('A1')!
	for (const text of [renderNudge([wf]), renderPreview(wf), renderMore(wf, [], new Date())]) assert.match(text, /ok will: 2× comment on PR 1, then send the reply/)
})

test('tester P2-16 a job item gets the acknowledgement its rule allows', async () => {
	setRules(rule({ who: { accounts: [{ id: 'test:vikram', name: 'Vikram' }] }, when: { intent: 'pr_review' }, then: 'ack' })); autoOn(); policy(0)
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	assert.equal(src.chats[CHAT].filter(m => m.body.startsWith('Got it.')).length, 1)
})

test('tester P2-14 "fixed, please recheck" after the reply was sent reopens the same item', async () => {
	await reviewed()
	jf.job = () => undefined
	src.post('self', 'me', 'ok A1'); await go(); finishExec(0, 1); await go()
	assert.equal(store.byCode('A1')!.state, 'done')
	script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Fixed, please recheck'); await go(); await go()
	assert.equal(store.workflows().length, 1)
	assert.equal(store.byCode('A1')!.state, 'needs_human')
})

// Review 01-04 findings (dev-spec/slices/tests/review-01-04.md).
test('review 01-04 P0-1 an ok given before a rewrite finished is refused and shows the new text', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const seenAt = new Date(Date.now() - 1000).toISOString()
	script = draft('Replacement nobody approved.')
	src.post(CHAT, 'me', '[as Ravi] And the rollout?'); await go()
	store.writeAnswer({ code: 'A1', verb: 'ok', surface: 'chat', seenAt }); await go()
	assert.ok(!src.chats[CHAT].some(m => m.body === 'Replacement nobody approved.'))
	store.writeAnswer({ code: 'A1', verb: 'ok', surface: 'chat', seenAt: new Date().toISOString() }); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Replacement nobody approved.')
})

test('review 01-04 P0-2 a reopened item does not carry an old skipped review\'s changes', async () => {
	await reviewed()
	src.post('self', 'me', 'skip A1'); await go()
	const wf = store.byCode('A1')!; wf.updatedAt = new Date().toISOString(); store.save(wf)
	script = draft('Standup is at ten.')
	src.post(CHAT, 'me', '[as Vikram] What time is standup?'); await go()
	const a1 = store.byCode('A1')!
	assert.equal(a1.job, undefined); assert.equal(a1.draft?.text, 'Standup is at ten.')
	await see('A1')
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(execStarts().length, 0)
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Standup is at ten.')
})

test('review 01-04 P1-3 continue holds a scheduled automatic reply', async () => {
	setRules(rule()); autoOn(); policy(15)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const wf = store.byCode('A1')!; wf.sendAt = new Date(Date.now() - 1000).toISOString(); store.save(wf)
	const before = src.chats[CHAT].length
	src.post('self', 'me', 'continue A1'); await go()
	assert.equal(src.chats[CHAT].length, before)
	assert.equal(store.byCode('A1')!.status, 'Held: you opened it in a window')
})

test('review 01-04 P1-4 edit while a new result is being worked out starts no change run', async () => {
	await reviewed()
	src.post(CHAT, 'me', '[as Vikram] Fixed, please recheck'); script = needsJob(); await go()
	src.post('self', 'me', 'edit A1: My edited reply'); await go()
	assert.equal(execStarts().length, 0)
	assert.match(src.chats.self.at(-1)!.body, /A1 is still working/)
})

test('review 01-04 P1-5 a stop that fails keeps the run tracked and says so', async () => {
	await reviewed()
	src.post('self', 'me', 'ok A1'); await go()
	const kill = procs.kill
	procs.kill = () => false
	try { src.post('self', 'me', 'skip A1'); await go() } finally { procs.kill = kill }
	assert.equal(store.jobs()[0].state, 'running')
	assert.match(Object.values(store.health()).map(h => h.text).join('\n'), /Could not stop the changes for pr:org\/repo\/1/)
})

test('review 01-04 P1-6 the owner replying in the chat stops a change run nobody else approves', async () => {
	await reviewed()
	src.post('self', 'me', 'ok A1'); await go()
	const pid = store.jobs()[0].run!.pid
	src.post(CHAT, 'me', 'I will handle this one myself.'); await go()
	assert.deepEqual(jf.killed, [pid])
})

test('review 01-04 P1-7 with chats unreachable, an AI-chat pause still applies and budgets still hold', async () => {
	store.saveConfig({ ...store.config(), jobs: { minutes: 1 } })
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	const job = store.jobs()[0]; job.run!.startedAt = new Date(Date.now() - 2 * 60_000).toISOString(); store.saveJob(job)
	store.writeAnswer({ code: '', verb: 'pause', surface: 'chat' })
	src.failRead.add('self')
	const r = await go()
	assert.equal(r.skipped, 'source unavailable')
	assert.equal(store.control().paused, true); assert.deepEqual(jf.killed, [job.run!.pid])
})

test('review 01-04 P1-8 a follow-up inside the undo window keeps the undo receipt', async () => {
	await reviewed()
	src.post('self', 'me', 'ok A1'); await go(); finishExec(0, 1); await go()
	const a1 = store.byCode('A1')!; a1.sent = { ...a1.sent!, byRule: 'r1', undoUntil: new Date(Date.now() + 600_000).toISOString() }; store.save(a1)
	script = draft('Sure.')
	src.post(CHAT, 'me', '[as Vikram] Thanks!'); await go()
	assert.ok(store.byCode('A1')!.sent?.undoUntil, 'A1 keeps its receipt')
	assert.equal(store.workflows().length, 2)
})

test('review 01-04 P2-9 more puts the decision first and shows the exact comment text; the self-chat inbox works', async () => {
	const { renderMore } = await import('../src/core/render.ts')
	await reviewed()
	const wf = store.byCode('A1')!
	wf.effects = wf.effects!.map(e => ({ ...e, payload: { text: 'The AI says something else' }, call: { ...e.call!, args: { ...e.call!.args, content: `Comment for ${e.target}` } } })); store.save(wf)
	const long = Array.from({ length: 10 }, (_, i) => ({ id: String(i), at: '', from: { id: 'x', name: 'X' }, text: 'y'.repeat(200), byOwner: false }))
	const text = renderMore(wf, long, new Date()).slice(0, 1800)
	assert.match(text, /ok will: 2× comment on PR 1[\s\S]*- comment on PR 1: file: a\.ts; line: 10; content: Comment for PR 1/)
	assert.doesNotMatch(text, /The AI says something else/, 'review 10-21 P1-1: the text that is sent, never the AI\'s words about it')
	src.post('self', 'me', 'what needs me?'); await go()
	assert.equal(src.chats.self.at(-1)!.body, 'Assistant · 1 needs you\nA1 Vikram · 2× comment on PR 1, then reply\nSay "ok A1", "more A1", or "later A1".')
})

test('review 01-04 P1-4 ok on one item while another item\'s recheck is running never replaces that run', async () => {
	const other = 'other-chat'
	store.saveConfig({ ...store.config(), watch: [...store.config().watch, { id: other, name: 'Other', test: true }] })
	src.post(other, 'me', 'history'); await go()
	effectTools(); script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); src.post(other, 'me', '[as Ana] Is PR 1 good?'); await go(); await go()
	jf.job = () => undefined
	src.post(other, 'me', '[as Ana] Fixed, please recheck'); await go()
	const work = store.jobs()[0].run!
	assert.equal(work.purpose, 'work')
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(store.jobs()[0].run?.id, work.id, 'the running work run was kept')
	assert.equal(execStarts().length, 0)
	assert.match(src.chats.self.at(-1)!.body, /A1 is still working on a new result/)
})

test('R-BOOT-01 R-BOOT-09 R-BOOT-10 bootstrap reads in the background, proposes K items, and a rerun starts at the checkpoint', async () => {
	const { startBootstrap } = await import('../src/runner/bootstrap.ts')
	const { inbox } = await import('../src/runner/proposals.ts')
	store.saveConfig({ ...store.config(), reviewLearning: true })
	assert.match(startBootstrap(store, ['chats']), /Started reading your Teams chats\. .*Nothing is saved until you say ok/)
	jf.job = () => undefined
	await go()
	const [run] = jf.starts
	assert.match(run.prompt, /Workflow: bootstrap[\s\S]*Goal: Read the owner's Teams chats from the last 90 days/)
	assert.match(inbox(store), /### Running\n- Learning from your Teams chats \(0 min\)/)
	const job = store.jobs()[0]
	store.writeReport({ workflowId: job.id, intent: 'other', state: 'done', summary: 'Read 3 chats', checkpoint: '2026-10-18', claims: [
		{ topic: 'Banner fix', type: 'decision', text: 'Ship to ring 1 first.', src: [{ link: 'https://teams.microsoft.com/l/message/19:abc@thread.v2/1', date: '2026-10-12', who: 'Vikram' }] },
		{ topic: 'Search', type: 'owner', text: 'Ana owns search.', src: [{ link: 'https://teams.microsoft.com/l/message/19:abc@thread.v2/2', date: '2026-10-13' }] },
	] }, job.run!.id)
	jf.dead.add(job.run!.pid)
	await go()
	assert.deepEqual(store.proposals().map(p => [p.code, p.title]), [['K1', 'Banner fix'], ['K2', 'Search']])
	src.post('self', 'me', 'review knowledge'); await go()
	assert.match(src.chats.self.at(-1)!.body, /K1 · Banner fix · 1 new · from your Teams chats\n- new \[decision\] Ship to ring 1 first\.[\s\S]*Reply "ok K1", "skip K1"/)
	src.post('self', 'me', 'ok K1'); await go()
	assert.match(src.chats.self.at(-1)!.body, /Saved K1: 1 entry in Banner fix[\s\S]*Next:\nK2 · Search/)
	src.post('self', 'me', 'ok K2'); await go()
	assert.match(src.chats.self.at(-1)!.body, /Saved K2[\s\S]*That was the last one\./)
	startBootstrap(store, ['chats']); jf.job = () => undefined; await go()
	assert.match(jf.starts.at(-1)!.prompt, /Goal: Read the owner's Teams chats newer than 2026-10-18/)
	assert.equal(jf.starts.at(-1)!.sessionId, run.sessionId)
})

// Slice 07: own, track, learn (dev-spec/slices/07-own-track-learn.md).
const fakeSession = () => {
	const home = mkdtempSync(join(tmpdir(), 'delegate-copilot-'))
	process.env.COPILOT_HOME = home
	const id = 'aaaaaaaa-0000-4000-8000-000000000001'
	mkdirSync(join(home, 'session-state', id), { recursive: true })
	writeFileSync(join(home, 'session-state', id, 'events.jsonl'), '{"type":"user.message"}\n')
	writeFileSync(join(home, 'session-state', id, 'workspace.yaml'), `id: ${id}\ncwd: ${KB}\nmc_task_id: x\n`)
	return { home, id }
}

test('R-ADP-02 R-ADP-03 an owned kind of ask runs in a fork of that session, and the original never changes', async () => {
	const { own } = await import('../src/runner/own.ts')
	const { home, id } = fakeSession()
	assert.match(own(store, 'PR reviews', id), /answered in a copy of this session/)
	script = (p, wfId) => (assert.match(p, /- o1: PR reviews/), needsJob({ ...PR, owner: 'o1' } as never)(p, wfId))
	jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	const [run] = jf.starts
	assert.notEqual(run.sessionId, id); assert.equal(run.cwd, KB)
	assert.match(readFileSync(join(home, 'session-state', run.sessionId, 'workspace.yaml'), 'utf8'), new RegExp(`^id: ${run.sessionId}\\ncwd: `))
	assert.doesNotMatch(readFileSync(join(home, 'session-state', run.sessionId, 'workspace.yaml'), 'utf8'), /mc_task_id/)
	assert.equal(readFileSync(join(home, 'session-state', id, 'workspace.yaml'), 'utf8'), `id: ${id}\ncwd: ${KB}\nmc_task_id: x\n`)
	assert.match(store.byCode('A1')!.status, /\(your session for PR reviews\)/)
})

test('R-ADP-05 a missing owner session is released and a fresh session is used', async () => {
	const { own } = await import('../src/runner/own.ts')
	fakeSession()
	own(store, 'PR reviews', 'bbbbbbbb-0000-4000-8000-000000000002')
	script = needsJob({ ...PR, owner: 'o1' } as never); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	assert.match(store.byCode('A1')!.status, /no longer exists, so it was released/)
	assert.equal(store.owners().length, 0)
})

// The owner's PR-review session is open on another machine and registered by Delegate's extension (research/cross-session-opus.md).
async function registerOn(machine: string, id: string, ageMin = 0) {
	const { writeJsonAtomic, addr } = await import('../src/mesh/inbox.mjs')
	const beatAt = new Date(Date.now() - ageMin * 60_000).toISOString()
	writeJsonAtomic(join(store.root, 'mesh', 'sessions', `${addr(machine, id)}.json`), { v: 1, session: id, machine, cwd: KB, pid: 1, startedAt: beatAt, beatAt, open: true, busy: false, keys: [], lastAsk: '', lastAnswer: '' }, machine)
}

test('cross-session: an owned kind of ask goes into the owner\'s open session on another machine, and its answer comes back to the item', async () => {
	const { own } = await import('../src/runner/own.ts')
	const { writeReceipt, addr } = await import('../src/mesh/inbox.mjs')
	const { id } = fakeSession()
	own(store, 'PR reviews', id)
	store.saveOwners(store.owners().map(o => ({ ...o, machine: 'vm-b' })))
	await registerOn('vm-b', id)
	script = needsJob({ ...PR, owner: 'o1' } as never); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	assert.equal(jf.starts.length, 0, 'no process works on the owner\'s live session')
	const box = join(store.root, 'mesh', 'inbox', addr('vm-b', id))
	assert.deepEqual([existsSync(box) ? readdirSync(box).length : 0, store.byCode('A1')!.state], [0, 'needs_human'], 'other people\'s words reach the owner\'s own session only after ok')
	assert.match(store.byCode('A1')!.question!, /This goes to your open session for PR reviews on vm-b, which works with your own tools\. Say "ok A1"/)
	src.post('self', 'me', 'ok A1'); await go()
	const [file] = readdirSync(box)
	const msg = JSON.parse(readFileSync(join(box, file), 'utf8'))
	assert.match(msg.text, /> Vikram: Can you review PR 1\?/)
	assert.match(msg.text, /Never vote on, approve, complete, or abandon/)
	assert.match(store.byCode('A1')!.status, /your open session for PR reviews on vm-b/)
	await go()
	assert.equal(readdirSync(box).length, 1, 'waits for the session, sends nothing twice')
	writeReceipt(store.root, addr('vm-b', id), { id: msg.id, state: 'delivered', at: new Date().toISOString(), messageId: 'u1', reply: 'One null check is missing in a.ts:10. Suggested reply: Left one comment.' }, 'vm-b')
	await go()
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'needs_human')
	assert.match(wf.status, /^From your session on vm-b: One null check is missing/)
	assert.equal(readdirSync(box).length, 0)
	assert.equal(store.jobs()[0].state, 'done')
	assert.equal(jf.starts.length, 0)
	src.post('self', 'me', 'continue A1'); await go()
	assert.equal(jf.windows.length, 0, 'no second window on the owner\'s own session')
	assert.match(src.chats.self.at(-1)!.body, /runs in your own session for PR reviews on vm-b/)
	// A follow-up reaches the same session with only the new ask.
	src.post(CHAT, 'me', '[as Vikram] Also check the tests please'); await go(); await go()
	assert.equal(readdirSync(box).length, 0, 'a new ask waits for ok again')
	src.post('self', 'me', 'ok A1'); await go()
	assert.match(src.chats.self.at(-1)!.body, /A1 changed after you looked\. Nothing was sent or changed\. It now asks: This goes to your open session/)
	src.post('self', 'me', 'more A1'); await go(); src.post('self', 'me', 'ok A1'); await go()
	const next = readdirSync(box).map(f => JSON.parse(readFileSync(join(box, f), 'utf8')))
	assert.equal(next.length, 1)
	assert.match(next[0].text, /> Vikram: Also check the tests please/)
	assert.doesNotMatch(next[0].text, /Can you review PR 1/)
	writeReceipt(store.root, addr('vm-b', id), { id: next[0].id, state: 'refused', why: 'busy', at: new Date().toISOString() }, 'vm-b')
	await go()
	assert.equal(store.jobs()[0].relay!.sent, 1, 'a refused relay keeps its asks for the retry')
	writeFileSync(join(store.root, 'rules.compiled.json'), JSON.stringify({ schema: 1, rules: [{ id: 'r1', text: 'Vikram', who: { accounts: [{ id: store.byCode('A1')!.asker!.id, name: 'Vikram' }] }, when: {}, then: 'send' }] }))
	for (const f of readdirSync(box)) unlinkSync(join(box, f))
	src.post(CHAT, 'me', '[as Vikram] And the docs too?'); await go(); await go()
	assert.equal(store.byCode('A1')!.question, undefined, 'someone your rules already trust reaches your session without asking')
	assert.match(readdirSync(box).map(f => readFileSync(join(box, f), 'utf8')).join(), /And the docs too\?/)
})

test('cross-session: when the owned session on another machine is not open, a fresh session does the ask', async () => {
	const { own } = await import('../src/runner/own.ts')
	const { id } = fakeSession()
	own(store, 'PR reviews', id)
	store.saveOwners(store.owners().map(o => ({ ...o, machine: 'vm-b' })))
	await registerOn('vm-b', id, 60)
	script = needsJob({ ...PR, owner: 'o1' } as never); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	assert.equal(jf.starts.length, 1)
	assert.notEqual(jf.starts[0].sessionId, id)
	assert.match(store.byCode('A1')!.status, /your session for PR reviews is on vm-b and not open, so a fresh session was used/)
})

test('R-TRK-01 R-TRK-02 a tracker runs on its interval, stays quiet when nothing changes, shows a change once, and stops on its condition', async () => {
	const { track } = await import('../src/runner/track.ts')
	const { inbox } = await import('../src/runner/proposals.ts')
	assert.match(track(store, { target: 'PR 1 checks', everyMinutes: 30, until: 'merged' }), /Watching PR 1 checks every 30 minutes until merged, as A1\. .*"skip A1" to stop/)
	const check = (summary: string, done = false) => (_: string, id: string): Report => ({ workflowId: id, intent: 'other', state: 'needs_human', summary, done })
	jf.job = check('Checks running.')
	await go(); await go()
	assert.match(inbox(store), /### Watching\n- \*\*A1\*\* · PR 1 checks until merged · Checks running\./)
	const due = () => { const j = store.jobs()[0]; j.nextAt = new Date(Date.now() - 1000).toISOString(); store.saveJob(j) }
	const changedAt = store.byCode('A1')!.changedAt
	jf.job = check('Checks running.'); due(); await go(); await go()
	assert.equal(store.byCode('A1')!.changedAt, changedAt, 'same result: quiet')
	jf.job = check('Checks green.'); due(); await go(); await go()
	assert.notEqual(store.byCode('A1')!.changedAt, changedAt)
	// Code review round 3, P2-4: the result keeps when the check gave it; a later save of the job does not move it.
	const res = store.jobs()[0].result as { summary: string; at?: string }
	assert.ok(res.at && Math.abs(Date.parse(res.at) - Date.now()) < 60_000, 'the check result carries its time')
	store.saveJob({ ...store.jobs()[0], asks: ['Owner: ok'], updatedAt: new Date(Date.now() + 3_600_000).toISOString() })
	assert.equal((store.jobs()[0].result as { at?: string }).at, res.at)
	jf.job = check('Merged.', true); due(); await go(); await go()
	assert.equal(store.byCode('A1')!.state, 'done'); assert.equal(store.jobs()[0].every, undefined)
	assert.equal(jf.starts.length, 4)
})

test('R-TRK-04 a shepherd\'s proposed fix waits for ok, then it goes back to watching; skip stops it', async () => {
	const { track } = await import('../src/runner/track.ts')
	effectTools()
	track(store, { target: 'PR 7', until: 'merged', shepherd: true })
	jf.job = (_, id) => ({ workflowId: id, intent: 'other', state: 'needs_human', summary: '1 comment to address', effects: [{ system: 'ado', action: 'reply', target: 'PR 7', summary: 'Answer Ana\'s question', call: { tool: 'ado-comment', args: { thread: 3, content: 'Yes' } } }] })
	await go(); await go()
	assert.equal(store.byCode('A1')!.state, 'needs_human')
	const { view } = await import('../src/web/view.ts')
	assert.deepEqual(view(store, undefined).needs.map(c => c.code), ['A1'], 'its proposed change shows on the page (review p2-7 R10)')
	jf.job = () => undefined
	await see('A1')
	src.post('self', 'me', 'ok A1'); await go()
	finishExec(0); await go()
	assert.equal(store.byCode('A1')!.state, 'waiting_on_task'); assert.match(store.byCode('A1')!.status, /watching again/)
	src.post('self', 'me', 'skip A1'); await go()
	assert.equal(store.byCode('A1')!.status, 'Stopped watching')
})

test('R-LRN-01 R-LRN-03 an edited reply starts one learn run whose facts become a K item from that edit', async () => {
	store.saveConfig({ ...store.config(), reviewLearning: true })
	src.post(CHAT, 'me', '[as Ravi] When does it ship?'); await go()
	jf.job = () => undefined
	src.post('self', 'me', 'send A1: It ships Oct 24, after the ring 1 check.'); await go()
	const learn = store.jobs().find(j => j.key.startsWith('learn:'))!
	assert.match(learn.goal, /Draft: "It is in ring 0\."\nSent by the owner: "It ships Oct 24, after the ring 1 check\."\nSent message: https:\/\/teams\.microsoft\.com\/l\/message\//)
	assert.match(jf.starts.at(-1)!.prompt, /Workflow: learn/)
	store.writeReport({ workflowId: learn.id, intent: 'other', state: 'done', summary: '1 fact', claims: [{ topic: 'Banner fix', type: 'status', text: 'Ships Oct 24 after the ring 1 check.', src: [{ link: 'https://teams.microsoft.com/l/message/x/1', date: '2026-10-18' }] }] }, store.job(learn.id)!.run!.id)
	jf.dead.add(store.job(learn.id)!.run!.pid); await go()
	assert.deepEqual(store.proposals().map(p => [p.code, p.status]), [['K1', '1 new · from your edit of A1']])
})

// Tester findings for slices 06-07 (dev-spec/slices/tests/06-07.md).
test('tester 06-07 P0-1 P1-1 a page or panel ok carries the revision it showed, so a newer draft is refused', async () => {
	const { actResult } = await import('../src/mcp/server.ts')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const shown = store.byCode('A1')!.revAt!
	script = draft('Friday.')
	src.post(CHAT, 'me', '[as Ravi] Actually, when?'); await go()
	assert.equal(actResult(store, 'ok A1', shown, 'page').accepted, true)
	await go()
	assert.ok(!src.chats[CHAT].some(m => m.body === 'Friday.'))
	assert.match(src.chats.self.at(-1)?.body ?? store.workflows()[0].status, /./)
	assert.equal(actResult(store, 'ok A404', shown, 'page').accepted, false)
})

test('tester 06-07 P1-2 a fork never copies links that point back into the original session', async () => {
	const { forkSession } = await import('../src/runner/own.ts')
	const { symlinkSync, existsSync } = await import('node:fs')
	const { home, id } = fakeSession()
	writeFileSync(join(home, 'session-state', id, 'context.txt'), 'original')
	symlinkSync(join(home, 'session-state', id, 'context.txt'), join(home, 'session-state', id, 'context-link.txt'))
	const copy = forkSession(id)!
	assert.equal(existsSync(join(home, 'session-state', copy, 'context-link.txt')), false)
	assert.equal(readFileSync(join(home, 'session-state', copy, 'context.txt'), 'utf8'), 'original')
})

test('tester 06-07 P1-3 P1-4 answering a running tracker never starts a second run, and skip stops the running check', async () => {
	const { track } = await import('../src/runner/track.ts')
	track(store, { target: 'PR 9', until: 'merged' }); jf.job = () => undefined
	await go()
	const first = store.jobs()[0].run!.pid
	const wf = store.byCode('A1')!; Object.assign(wf, { state: 'needs_human', question: 'Which branch?' }); store.save(wf)
	src.post('self', 'me', 'A1: release branch'); await go()
	assert.equal(jf.starts.length, 1); assert.equal(store.jobs()[0].run!.pid, first)
	src.post('self', 'me', 'skip A1'); await go()
	assert.deepEqual(jf.killed, [first]); assert.equal(store.jobs()[0].every, undefined); assert.equal(store.jobs()[0].state, 'done')
})

test('tester 06-07 P1-5 a tracker that reports done stops even when it also asks something', async () => {
	const { track } = await import('../src/runner/track.ts')
	track(store, { target: 'PR 9', until: 'merged' })
	jf.job = (_, id) => ({ workflowId: id, intent: 'other', state: 'needs_human', summary: 'Merged.', done: true, question: 'Anything else?' })
	await go(); await go()
	assert.equal(store.jobs()[0].every, undefined)
})

test('tester 06-07 P1-7 a deleted ask closes the item; an edited ask is redrafted, not answered with the old draft', async () => {
	src.post(CHAT, 'me', '[as Ravi] When does it ship?'); await go()
	const id = store.byCode('A1')!.msgIds.at(-1)!
	src.chats[CHAT].find(m => m.id === id)!.body = '[as Ravi] Never mind, do not reply.'
	await see('A1')
	src.post('self', 'me', 'ok A1'); await go()
	assert.ok(!src.chats[CHAT].some(m => m.body === 'It is in ring 0.'))
	assert.equal(store.byCode('A1')!.lastAsk, 'Never mind, do not reply.')
	src.post(CHAT, 'me', '[as Ana] Is PR 2 ready?'); await go()
	const a2 = store.workflows().find(w => w.asker?.name === 'Ana')!
	src.chats[CHAT].find(m => m.id === a2.msgIds.at(-1))!.body = ''
	await see(a2.code)
	src.post('self', 'me', `ok ${a2.code}`); await go()
	assert.equal(store.byCode(a2.code)!.status, 'The message was deleted')
})

test('tester 06-07 P2-4 runs at once are capped', async () => {
	const { track } = await import('../src/runner/track.ts')
	for (let i = 0; i < 6; i++) track(store, { target: `PR ${i}`, until: 'merged' })
	jf.job = () => undefined
	await go()
	assert.equal(jf.starts.length, 3)
})

// Remaining requirements (dev-spec/slices/index.md).
test('R-POL-05 someone on the never list never gets an automatic reply', async () => {
	setRules(rule()); autoOn(); policy(0, { never: [{ id: 'test:ravi', name: 'Ravi' }] })
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(store.byCode('A1')!.state, 'needs_human')
	assert.equal(store.byCode('A1')!.decision?.reason, 'This person never gets automatic replies')
})

test('R-SET-08 the daily cap stops new AI runs and says so', async () => {
	store.saveConfig({ ...store.config(), dailyRuns: 1 })
	src.post(CHAT, 'me', '[as Ravi] One?'); await go()
	src.post(CHAT, 'me', '[as Ana] Two?'); await go()
	assert.equal(runs.length, 1)
	assert.match(store.health().runs?.text ?? '', /Reached today's limit of 1 AI runs/)
})

test('R-WF-05 every state change is recorded', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const moves = store.logs(1).filter(e => e.event === 'state' && e.code === 'A1').map(e => `${e.from}>${e.to}`)
	assert.deepEqual(moves, ['new>running', 'running>needs_human'])
})

test('R-ING-06 throttling backs off and resets after a good read', async () => {
	const read = src.newMessages.bind(src)
	src.newMessages = async () => { throw new Error('429 Too Many Requests') }
	const r = await go()
	assert.equal(r.skipped, 'source unavailable')
	assert.match(store.health().source.text, /asked Delegate to slow down\. It waits 2 minutes/)
	assert.equal(store.schedule().backoff, 2)
	src.newMessages = read
	await go()
	assert.equal(store.schedule().backoff, undefined); assert.equal(store.health().source, undefined)
})

test('R-SET-02 R-SET-05 status shows state and counts, and after a week suggests a rule for replies always sent unchanged', async () => {
	const { statusText } = await import('../src/runner/status.ts')
	for (let i = 0; i < 5; i++) { src.post(CHAT, 'me', `[as Ravi] Status ${i}?`); await go(); await see('A1'); src.post('self', 'me', 'ok A1'); await go() }
	assert.match(statusText(store), /Delegate is on · auto-send off[\s\S]*Today: 5 sent \(0 by your rules\), 5 drafted/)
	store.saveChats({ ...store.chats(), startedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() })
	assert.match(statusText(store), /Suggestion: you sent all 5 of Ravi's status next step replies unchanged/)
})

// Persona test findings (dev-spec/slices/tests/personas.md).
test('persona P0 edit only changes the draft; ok then sends it; send sends the owner\'s words at once', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'edit A1: It is in ring 1 now.'); await go()
	assert.ok(!src.chats[CHAT].some(m => m.body === 'It is in ring 1 now.'))
	assert.match(src.chats.self.at(-1)!.body, /Updated A1: "It is in ring 1 now\."\. Nothing sent\. Say "ok A1" to send it\./)
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'It is in ring 1 now.')
	assert.ok(store.jobs().some(j => j.key.startsWith('learn:')), 'the rewrite is learned from once it went out')
	src.post(CHAT, 'me', '[as Ana] And the banner?'); await go()
	src.post('self', 'me', 'send A2: Banner ships Friday.'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Banner ships Friday.')
})

test('persona P0 ok on a draft with a blank or an open question is refused', async () => {
	script = (_, id) => ({ workflowId: id, intent: 'commitment_decision', state: 'needs_human', summary: 'Date?', reply: { text: 'We plan to ship on ____.', commitment: true, sources: [] }, question: 'Which date?' })
	src.post(CHAT, 'me', '[as Ravi] When will it ship?'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	assert.ok(!src.chats[CHAT].some(m => m.body.includes('____')))
	assert.match(src.chats.self.at(-1)!.body, /A1 is not ready: Which date\?\. Reply "A1: your answer"/)
})

test('persona P1 later keeps the item; dismiss is skip', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'later A1'); await go()
	assert.equal(store.byCode('A1')!.state, 'needs_human'); assert.match(src.chats.self.at(-1)!.body, /Left A1 for later/)
	src.post('self', 'me', 'dismiss A1'); await go()
	assert.equal(store.byCode('A1')!.state, 'done')
})

// Final review findings (dev-spec/slices/tests/review-final.md).
test('final P0-1 a send from an old page that also makes changes is refused before any change runs', async () => {
	effectTools(); script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	await go(); await go()
	const starts = jf.starts.length
	store.writeAnswer({ code: 'A1', verb: 'send', text: 'Done, see comments.', surface: 'chat', seenAt: new Date(Date.now() - 60_000).toISOString() }); await go()
	assert.equal(jf.starts.length, starts, 'no change run started')
	assert.equal(store.byCode('A1')!.state, 'needs_human')
	assert.match(store.takeReceipts().at(-1)!.text, /^A1 changed after you looked\. Nothing was sent or changed\. It now will 2× comment on PR 1, then reply/)
	store.writeAnswer({ code: 'A1', verb: 'send', text: 'Done, see comments.', surface: 'chat', seenAt: new Date(Date.now() + 1000).toISOString() }); await go()
	assert.equal(jf.starts.length, starts, 'next action: new words on an item with changes are a preview first')
	assert.match(store.takeReceipts().at(-1)!.text, /^Updated A1: "Done, see comments\."\. Nothing sent\. ok will also: 2× comment on PR 1\./)
	store.writeAnswer({ code: 'A1', verb: 'ok', surface: 'chat', seenAt: new Date(Date.now() + 1000).toISOString() }); await go()
	assert.equal(jf.starts.length, starts + 1, 'a current ok makes the changes')
})

test('final P0-3 editing a scheduled automatic reply cancels it; only ok sends the new words', async () => {
	setRules(rule()); autoOn(); policy(15)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(store.byCode('A1')!.state, 'scheduled')
	src.post('self', 'me', 'edit A1: New text not approved.'); await go()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.sendAt], ['needs_human', undefined])
	policy(0); await go(); await go()
	assert.ok(!src.chats[CHAT].some(m => m.body.startsWith('New text not approved.') || m.body.startsWith('It is in ring 0.')))
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'New text not approved.')
})

test('final P0-3 a held preview that is somehow still scheduled never goes out on its own', async () => {
	setRules(rule()); autoOn(); policy(15)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const wf = store.byCode('A1')!
	store.save({ ...wf, sendAt: new Date(Date.now() - 1000).toISOString(), draft: { ...wf.draft!, preview: true } })
	await go()
	assert.ok(!src.chats[CHAT].some(m => m.body.startsWith('It is in ring 0.')))
	assert.equal(store.byCode('A1')!.state, 'needs_human')
})

test('final P1-5 later on a scheduled automatic reply holds it until the owner acts', async () => {
	setRules(rule()); autoOn(); policy(15)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'later A1'); await go()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.sendAt, wf.status], ['needs_human', undefined, 'Held for later by you'])
	assert.ok(src.chats.self.some(m => /^Assistant · Held A1: it will not send on its own\. It stays in your inbox\.$/.test(m.body)))
	policy(0); await go()
	assert.ok(!src.chats[CHAT].some(m => m.body.startsWith('It is in ring 0.')))
})

test('final P1-4 a commitment intent holds the reply even when the report says it commits to nothing', async () => {
	setRules(rule({ when: {} })); autoOn(); policy(0)
	script = (p, id) => ({ ...draft('I approve the launch on Friday.')(p, id), intent: 'commitment_decision' })
	src.post(CHAT, 'me', '[as Ravi] Can you approve the launch?'); await go()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.decision?.reason], ['needs_human', 'It commits you to something'])
	const { sendGate } = await import('../src/core/gate.ts')
	assert.deepEqual(sendGate(wf, 'x', { paused: false, ownerApproved: false, draftOnly: false, newestThreadMsgId: wf.lastMsgId, alreadyReplied: false, ruleAllows: true }), { send: false, reason: 'Commitment needs the owner' })
})

test('final P1-6 a range must stay in one kind and stay short', async () => {
	const { parseVerbs } = await import('../src/core/verbs.ts')
	assert.equal(parseVerbs('ok A1-K3'), null)
	assert.equal(parseVerbs('ok A1-A900'), null)
	assert.deepEqual(parseVerbs('ok A2-A4')!.map(p => p.code), ['A2', 'A3', 'A4'])
	assert.deepEqual(parseVerbs('ok K1-2')!.map(p => p.code), ['K1', 'K2'])
	assert.match(act(store, 'ok A1-K3'), /^I did not understand/)
})

for (const stage of ['discovery', 'intake'] as const) {
	test(`final P1-3 throttling during ${stage} backs off and still enforces job budgets`, async () => {
		store.saveConfig({ ...store.config(), jobs: { minutes: 1 } })
		script = needsJob(); jf.job = () => undefined
		src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
		const job = store.jobs()[0]; job.run!.startedAt = new Date(Date.now() - 2 * 60_000).toISOString(); store.saveJob(job)
		const list = src.recentChats.bind(src), read = src.newMessages.bind(src)
		if (stage === 'discovery') src.recentChats = async () => { throw new Error('429 Too Many Requests') }
		else src.newMessages = async (id, after, since) => { if (id === CHAT) throw new Error('429 Too Many Requests'); return read(id, after, since) }
		const r = await go()
		assert.equal(r.skipped, 'source unavailable')
		assert.equal(store.schedule().backoff, 2)
		assert.match(store.health().source.text, /asked Delegate to slow down/)
		assert.deepEqual(jf.killed, [job.run!.pid])
		src.recentChats = list; src.newMessages = read
		src.post(CHAT, 'me', '[as Ana] Banner?')
		await go()
		assert.equal(store.health().source, undefined)
		assert.ok(store.workflows().some(w => w.asker?.name === 'Ana'), 'catches up in order after the backoff')
	})
}

test('final P1-7 the phone list leads with health and counts what is running, watched, and done', async () => {
	const { renderPhone } = await import('../src/core/render.ts')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	store.setHealth('source', 'Cannot reach chats from mac.')
	assert.equal(renderPhone(store.workflows(), [], store.health()), 'Assistant · 1 needs you\n⚠ Cannot reach chats from mac.\nA1 Ravi · reply ready: "It is in ring 0."\nSay "ok A1", "more A1", or "later A1".')
	src.post('self', 'me', 'ok A1'); await go()
	store.setHealth('source', 'Cannot reach chats from mac.')
	assert.equal(renderPhone(store.workflows(), [], store.health(), new Date(0).toISOString()), 'Assistant · Nothing needs you.\n⚠ Cannot reach chats from mac.\nAlso: 1 done since you last looked. Say "more <code>" for any item.')
})

test('final P2-1 P2-2 undo after the window points to send; status shows a config pause; cap health is current after a run', async () => {
	setRules(rule()); autoOn(); policy(0)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const wf = store.byCode('A1')!; wf.sent = { ...wf.sent!, undoUntil: new Date(Date.now() - 1000).toISOString() }; store.save(wf)
	src.post('self', 'me', 'undo A1'); await go()
	assert.match(src.chats.self.at(-1)!.body, /undo window for A1 has closed\. To post a correction, say "send A1: <text>"/)
	const { statusText } = await import('../src/runner/status.ts')
	store.saveConfig({ ...store.config(), paused: true })
	assert.match(statusText(store), /^Delegate is paused/)
	store.saveConfig({ ...store.config(), paused: false, dailyRuns: store.runsToday() + 1 })
	src.post(CHAT, 'me', '[as Ana] Banner?'); await go()
	assert.match(store.health().runs.text, /Reached today's limit/)
})

test('R-WF-09 a follow-up continues the closed item while the talk is fresh; after the quiet time a new item starts from a summary', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	src.post(CHAT, 'me', '[as Ravi] And the rollout?'); await go()
	assert.deepEqual(store.workflows().map(w => w.code), ['A1'], 'same item, same session')
	await see('A1')
	src.post('self', 'me', 'ok A1'); await go()
	const a1 = store.byCode('A1')!; store.saveThread(a1.id, store.thread(a1.id).map(m => ({ ...m, at: new Date(Date.now() - 49 * 3_600_000).toISOString() })))
	let prompt = ''
	script = (p, id) => { prompt = p; return draft('Ring 1 now.')(p, id) }
	src.post(CHAT, 'me', '[as Ravi] Any news?'); await go()
	const a2 = store.byCode('A2')!
	assert.match(a2.earlier!, /A1: Ravi asked "And the rollout\?"\. Sent: "It is in ring 0\."/)
	assert.match(prompt, /Earlier, closed: .*A1: Ravi asked/)
	assert.notEqual(a2.session.id, a1.session.id)
})

test('R-HIL-07 the daily summary comes once at the owner\'s time, with counts and items waiting over 4 hours', async () => {
	const { daily } = await import('../src/runner/daily.ts')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	src.post(CHAT, 'me', '[as Ana] Banner?'); await go()
	store.saveConfig({ ...store.config(), summaryAt: '18:00' })
	const at = (h: number) => { const d = new Date(); d.setHours(h, 5, 0, 0); return d }
	const a2 = store.byCode('A2')!; store.save({ ...a2, revAt: new Date(at(18).getTime() - 5 * 3_600_000).toISOString() })
	assert.equal(await daily(store, src, store.config(), at(17)), false, 'not before 18:00')
	assert.equal(await daily(store, src, store.config(), at(18)), true)
	// On a Friday the summary also carries the week's numbers (R-NEX-11); that line has its own test.
	assert.match(src.chats.self.at(-1)!.body.replace(/\nThis week: [^\n]*/, ''), /^Assistant · Today: 1 sent by you, 0 by your rules. 1 needs you\.\nA2 Ana · waiting 5h\nSay "what needs me\?" to go through them\.$/)
	assert.equal(await daily(store, src, store.config(), at(19)), false, 'once a day')
	store.saveConfig({ ...store.config(), summaryAt: 'off' }); store.saveNotify({ ...store.notify(), summaryDay: undefined })
	assert.equal(await daily(store, src, store.config(), at(19)), false, 'off turns it off')
})

test('R-SEC-05 message text older than the retention period is cleared; metadata stays and the item stays old', async () => {
	const { sweep } = await import('../src/store/retention.ts')
	src.post(CHAT, 'me', '[as Ravi] Secret plan?'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	const old = new Date(Date.now() - 31 * 86_400_000).toISOString()
	store.save({ ...store.byCode('A1')!, updatedAt: old, work: { goal: 'Plan reviewed', doneWhen: 'approved', steps: [{ at: old, what: 'Secret plan step' }], links: [], closed: { at: old, why: 'approved' } } }, false)
	store.keepSent(s => ({ ...s, at: old }))
	store.saveChange('j1', 'r1', 0, { call: JSON.stringify({ tool: 'ado-comment', args: { content: 'Secret plan' } }), state: 'done', at: old })
	utimesSync(join(store.root, 'state', 'changes', 'j1-r1.json'), new Date(old), new Date(old))
	assert.equal(sweep(store, 30) >= 1, true)
	assert.deepEqual(store.changes('j1', 'r1'), {}, 'next action: what a change run recorded goes too')
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.sent?.text, wf.work?.steps[0].what, wf.work?.goal], [undefined, '', 'Plan reviewed'], 'sent text and work steps are cleared too')
	assert.deepEqual([wf.code, wf.state, wf.asker?.name, wf.lastAsk, wf.draft?.text, wf.status, wf.redacted, wf.updatedAt], ['A1', 'done', 'Ravi', undefined, '', 'Sent', true, old])
	assert.deepEqual(store.thread(wf.id), [])
	assert.ok(store.sent().every(s => s.text === ''))
	assert.ok(store.sentIds().size > 0, 'sent ids stay, so our own messages are still recognised')
})

test('R-ING-11 attachments and images reach the worker as data; a gap it names holds the item with the reason', async () => {
	setRules(rule({ when: {} })); autoOn(); policy(0)
	let prompt = ''
	script = (p, id) => { prompt = p; return { ...draft('Looks like the token expired.')(p, id), gaps: ['error.png (image)'] } }
	const id = src.post(CHAT, 'me', '[as Ravi] What is this error?')
	Object.assign(src.chats[CHAT].find(m => m.id === id)!, { html: true, body: '[as Ravi] What is this error? <img src="x" alt="error.png">', attachments: [{ name: 'log.txt', type: 'reference', url: 'https://x/log.txt' }] })
	await go()
	assert.match(prompt, /What is this error\? \[image: error\.png\]\n\[attachment: log\.txt \(reference\) https:\/\/x\/log\.txt\]/)
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.decision?.reason, wf.gaps], ['needs_human', 'It could not read error.png (image)', ['error.png (image)']])
})

test('R-SEC-08 labeled content never auto-sends into a chat with guests, or one whose guests are unknown; the owner can still send', async () => {
	setRules(rule({ when: {} })); autoOn(); policy(0)
	const labeled = (p: string, id: string) => ({ ...draft('The Q3 plan is ring 2.')(p, id), reply: { text: 'The Q3 plan is ring 2.', commitment: false, sources: [{ ref: join(KB, 'banner.md'), tier: 'card' as const, origin: 'extracted' as const, label: 'Confidential' }, { ref: 'wiki', tier: 'live' as const, origin: 'extracted' as const }] } })
	src.guests = true; script = labeled
	let prompt = ''; const base = script; script = (p, id) => { prompt = p; return base(p, id) }
	src.post(CHAT, 'me', '[as Ravi] Q3 plan?'); await go()
	assert.match(prompt, /This chat has guests from outside the organization\./)
	assert.equal(store.byCode('A1')!.decision?.reason, 'It quotes labeled content, and this chat has guests')
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'The Q3 plan is ring 2.')
	const { decide } = await import('../src/core/policy.ts')
	const wf = store.byCode('A1')!
	const ctx = { autoSend: true, autoSendsThisHour: 0, maxPerHour: 3 }
	assert.equal(decide({ ...wf, chat: { ...wf.chat, guests: undefined } }, store.rules(), ctx).action, 'draft')
	assert.equal(decide({ ...wf, chat: { ...wf.chat, guests: false } }, store.rules(), ctx).action, 'send')
})

test('R-POL-12 with out of office set, the acknowledgement says when the owner is back', async () => {
	const { awayLine } = await import('../src/runner/autosend.ts')
	assert.equal(awayLine('Robin', 'I am out until Oct 24, with limited access.'), 'Robin is out of office until Oct 24.')
	assert.equal(awayLine('Robin', 'Back on Monday. For urgent issues contact Ana.'), 'Robin is out of office until Monday.')
	assert.equal(awayLine('Robin', 'Away on leave.'), 'Robin is out of office.')
	setRules(rule({ then: 'ack' })); autoOn(); policy(0)
	src.oof = 'I am out until Oct 24.'
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, "Got it. Robin is out of office until Oct 24.\n\n(sent by Robin's assistant)")
})

test('R-RTE-02 a new intent is a registry entry and a playbook file: the worker sees it, its jobs get the playbook and tools', async () => {
	writeFileSync(join(store.root, 'intents.json'), JSON.stringify([{ id: 'oncall_page', when: 'Pages the owner about a live incident.', playbook: 'oncall.md', tools: ['incidents-read'] }]))
	mkdirSync(join(store.root, 'playbooks'), { recursive: true })
	writeFileSync(join(store.root, 'playbooks', 'oncall.md'), '# Oncall\nCheck the incident timeline first.')
	let prompt = ''
	script = (p, id) => { prompt = p; return { ...needsJob({ key: 'incident:42', goal: 'Look at incident 42' })(p, id), intent: 'oncall_page' } }
	jf.job = () => undefined
	src.post(CHAT, 'me', '[as Ravi] Incident 42 is paging, can you look?'); await go()
	assert.match(prompt, /Intents \(set exactly one\):[\s\S]*- pr_review: [\s\S]*- oncall_page: Pages the owner about a live incident\./)
	assert.equal(store.jobs()[0].intent, 'oncall_page')
	assert.match(jf.starts[0].prompt, /Goal: Look at incident 42[\s\S]*# Oncall\nCheck the incident timeline first\./)
	assert.deepEqual(jf.starts[0].tools, ['incidents-read'])
})

test('R-RTE-02 the worker\'s report is refused with the list when its intent is not in the registry', async () => {
	const { build } = await import('../src/mcp/server.ts')
	const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
	const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
	Object.assign(process.env, { DELEGATE_MODE: 'worker', DELEGATE_WORKFLOW: 'w1', DELEGATE_RUN: 'r1' })
	try {
		const [a, b] = InMemoryTransport.createLinkedPair()
		await build(() => store).connect(a)
		const c = new Client({ name: 't', version: '1' }); await c.connect(b)
		const r = await c.callTool({ name: 'submit_report', arguments: { workflowId: 'w1', intent: 'made_up', state: 'done', summary: 'x' } }) as { isError: boolean; content: { text: string }[] }
		assert.equal(r.isError, true)
		assert.match(r.content[0].text, /^Unknown intent "made_up"\. Use one of: pr_review, status_next_step, .*none\.$/)
		await c.close()
	} finally { for (const k of ['DELEGATE_MODE', 'DELEGATE_WORKFLOW', 'DELEGATE_RUN']) delete process.env[k] }
})

test('R-STO-07 a session is copied to storage after a run; another machine restores the full history, and the runner picks up what it added', async () => {
	const { backupSession, restoreSession } = await import('../src/runner/own.ts')
	const { home, id } = fakeSession()
	assert.equal(backupSession(store, id), true)
	assert.deepEqual(readdirSync(join(store.root, 'sessions', id)).sort(), ['events.jsonl', 'workspace.yaml'])
	const machineB = mkdtempSync(join(tmpdir(), 'delegate-copilot-b-'))
	process.env.COPILOT_HOME = machineB
	assert.equal(restoreSession(store, id), true)
	assert.equal(readFileSync(join(machineB, 'session-state', id, 'events.jsonl'), 'utf8'), '{"type":"user.message"}\n')
	writeFileSync(join(machineB, 'session-state', id, 'events.jsonl'), '{"type":"user.message"}\n{"type":"assistant.message"}\n')
	backupSession(store, id)
	process.env.COPILOT_HOME = home
	assert.equal(restoreSession(store, id), true, 'the runner takes the longer history')
	assert.match(readFileSync(join(home, 'session-state', id, 'events.jsonl'), 'utf8'), /assistant\.message/)
	assert.equal(restoreSession(store, id), false, 'nothing to do when the local copy is current')
})

test('R-STO-07 a window open on another machine is not taken back by the runner until it says closed', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const wf = store.byCode('A1')!
	store.setOpenWindow(wf.id, { machine: 'windows-pc', pid: 4242, runId: 'r1', since: new Date().toISOString() })
	await go()
	assert.equal(store.byCode('A1')!.openOn, 'windows-pc')
	store.setOpenWindow(wf.id, { machine: 'windows-pc', pid: 4242, runId: 'r1', since: new Date().toISOString(), closed: true })
	await go()
	assert.equal(store.byCode('A1')!.openOn, undefined)
	assert.match(store.byCode('A1')!.status, /^Back from your window/)
})

test('after a restart, a window opened before it is taken back even when its process ID is in use again', async () => {
	const { uptime } = await import('node:os')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const wf = store.byCode('A1')!
	// Pid 7777 is alive in this fixture, as an unrelated program that reused it after the restart would be.
	store.setOpenWindow(wf.id, { machine: 'mac', pid: 7777, runId: 'r1', since: new Date(Date.now() - 31 * 86_400_000).toISOString() })
	await go()
	assert.equal(store.byCode('A1')!.openOn, undefined)
	assert.match(store.byCode('A1')!.status, /^Back from your window/)
	assert.equal(store.openWindows().length, 0)
})

// Design-spec cards (design-spec/scenarios.md).
const meetingReport = (_: string, workflowId: string): Report => ({
	workflowId, intent: 'other', state: 'needs_human', summary: 'Arun wants to meet at 3', question: 'Meet at 3, later, or async?',
	reply: { text: '____', commitment: true, sources: [] },
	meeting: { subject: 'API changes', start: '2026-10-19T15:00:00+05:30', minutes: 30, attendees: ['Arun'] },
	context: [{ label: 'Conflict', text: '1:1 with Ana at 3:00', tone: 'warn' }],
	choices: { prompt: 'How do you want to handle it?', options: [
		{ label: 'Meet at 4:00 instead', reply: '3 does not work, sent an invite for 4.', effects: [{ system: 'calendar', action: 'create', target: 'Arun', summary: 'Invite Arun at 4:00 PM', payload: { start: '16:00' }, call: { tool: 'calendar-CreateEvent', args: { subject: 'API changes', startDateTime: '2026-10-19T16:00:00', endDateTime: '2026-10-19T16:30:00', attendeeEmails: ['arun@acme.com'] } } }] },
		{ label: 'Answer async', reply: 'Can we do this async? Send me the two questions.' },
	], other: true },
})

test('S5 picking an option with a reply shows it as a preview at once, with no AI run; its changes run on ok, then the reply goes', async () => {
	// The invite must be an allowed change: a picked option's changes are vetted (owned round 2 P2-4).
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, effectTools: ['ado-comment', 'calendar-CreateEvent'] } }); script = meetingReport
	src.post(CHAT, 'me', '[as Arun] Shall we meet at 3 pm about the API changes?'); await go()
	let wf = store.byCode('A1')!
	assert.deepEqual([wf.meeting?.subject, wf.context?.[0].tone, wf.choices?.options.length], ['API changes', 'warn', 2])
	const runsBefore = runs.length
	src.post('self', 'me', 'pick A1 2'); await go()
	wf = store.byCode('A1')!
	assert.equal(runs.length, runsBefore, 'no AI run')
	assert.deepEqual([wf.draft?.text, wf.draft?.preview, wf.picked, wf.effects, wf.question], ['Can we do this async? Send me the two questions.', true, [2], undefined, undefined])
	src.post('self', 'me', 'pick A1 1'); await go()
	wf = store.byCode('A1')!
	assert.equal(wf.effects?.[0].summary, 'Invite Arun at 4:00 PM')
	jf.job = executed(0)
	src.post('self', 'me', 'ok A1'); await go()
	assert.deepEqual([jf.starts.at(-1)!.tools, jf.starts.at(-1)!.extraTools?.at(-1)], [[], 'delegate_worker-make_change'])
	assert.match(jf.starts.at(-1)!.prompt, /Invite Arun at 4:00 PM/)
	await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, '3 does not work, sent an invite for 4.')
})

test('S4 picking several options rewrites the draft with them', async () => {
	script = (p, id) => ({ ...meetingReport(p, id), meeting: undefined, choices: { prompt: 'Which in the demo?', multi: true, options: [{ label: 'Search' }, { label: 'Filters' }, { label: 'Export' }] } })
	src.post(CHAT, 'me', '[as Sam] Which of search, filters, export for the demo?'); await go()
	let prompt = ''
	script = (p, id) => { prompt = p; return draft('Search and export.')(p, id) }
	src.post('self', 'me', 'pick A1 1, 3'); await go()
	assert.match(prompt, /The owner answered your question: "The owner picked: Search; Export"/)
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.draft?.text, wf.draft?.preview, wf.choices], ['Search and export.', true, undefined])
	src.post('self', 'me', 'pick A1 9'); await go()
	assert.match(src.chats.self.at(-1)!.body, /A1 has no options to pick from\./)
})

test('S6 ok with numbers makes only those changes; the unchecked ones are never sent to the executor', async () => {
	effectTools(); script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go(); await go()
	jf.job = executed(1)
	src.post('self', 'me', 'ok A1 #2'); await go()
	const exec = jf.starts.at(-1)!.prompt
	assert.doesNotMatch(exec, /^0\. /m)
	assert.match(exec, /^1\. \{"system":"ado"/m)
	await go()
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'done')
	assert.deepEqual(wf.effects!.map(e => [!!e.done, !!e.off]), [[false, true], [true, false]])
})

test('S12 asking about an item answers in its own session and never changes the draft or sends anything', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const before = store.byCode('A1')!
	let prompt = ''
	script = (p, id) => { prompt = p; return { workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'ring info', answer: 'Ring 0 since Monday; ring 1 is planned for Thursday.' } }
	const chat = src.chats[CHAT].length
	src.post('self', 'me', 'ask A1: what did we decide about ring 1?'); await go()
	const wf = store.byCode('A1')!
	assert.match(src.chats.self.at(-1)!.body, /A1 · what did we decide about ring 1\?\nRing 0 since Monday; ring 1 is planned for Thursday\./)
	assert.deepEqual(wf.notes?.map(n => [n.q, n.a]), [['what did we decide about ring 1?', 'Ring 0 since Monday; ring 1 is planned for Thursday.']])
	assert.deepEqual([wf.draft?.text, wf.state, wf.revAt], [before.draft?.text, 'needs_human', before.revAt])
	assert.equal(src.chats[CHAT].length, chat, 'nothing sent to the asker')
	assert.match(prompt, /# Workflow: ask[\s\S]*Current draft reply: "It is in ring 0\."[\s\S]*The owner asks: "what did we decide about ring 1\?"/)
})

test('dogfood: a sent item can still be asked about; the answer comes back and nothing more goes to the asker', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(store.byCode('A1')!.state, 'done')
	script = (_p, id) => ({ workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'follow-up', answer: 'He has not replied since.' })
	const chat = src.chats[CHAT].length
	src.post('self', 'me', 'ask A1: did Ravi read it?'); await go()
	const wf = store.byCode('A1')!
	assert.deepEqual(wf.notes?.map(n => [n.q, n.a]), [['did Ravi read it?', 'He has not replied since.']])
	assert.equal(wf.state, 'done')
	assert.equal(src.chats[CHAT].length, chat, 'nothing sent to the asker')
})

test('dogfood: a sent reply marked incomplete gets a follow-up drafted for your ok; sending it teaches, and the mark is logged', async () => {
	script = draft('Ring 1 starts Thursday.')
	src.post(CHAT, 'me', '[as Ravi] When does ring 1 start?'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(store.byCode('A1')!.state, 'done')
	let prompt = ''
	script = (p, id) => { prompt = p; return draft('Also: ring 1 needs one clean week in ring 0 first.')(p, id) }
	const chat = src.chats[CHAT].length
	src.post('self', 'me', 'incomplete A1: say it needs a clean week first'); await go()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.draft?.text, wf.draft?.preview], ['needs_human', 'Also: ring 1 needs one clean week in ring 0 first.', true])
	assert.match(prompt, /already sent: "Ring 1 starts Thursday\."[\s\S]*incomplete: "say it needs a clean week first"/)
	assert.equal(src.chats[CHAT].length, chat, 'nothing sent before ok')
	assert.ok(store.lessons().some(l => l.code === 'A1' && /marked the sent reply incomplete: say it needs a clean week first/.test(l.what)))
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body.includes('one clean week'), true)
	assert.ok(store.jobs().some(j => j.key.startsWith(`learn:${wf.id}`) && /Ring 1 starts Thursday/.test(j.goal) && /clean week/.test(j.goal)), 'the correction teaches')
	assert.equal(store.byCode('A1')!.correction, undefined)
})

test('dogfood: a rule\'s reply marked not needed is taken back while it can be, and the rule asks first from then on', async () => {
	const { decide } = await import('../src/core/policy.ts')
	const rule = { id: 'r1', text: 'Ravi status', who: { accounts: [{ id: 'test:ravi', name: 'Ravi' }] }, when: {}, then: 'send' as const }
	const w = { ...store.byCode('A1') ?? {}, asker: { id: 'test:ravi', name: 'Ravi' }, chat: { id: 'c', name: 'c' }, intent: 'status_next_step', draft: { text: 'x', commitment: false, sources: [{ ref: 'card:x', tier: 'card' as const }] } } as unknown as Parameters<typeof decide>[0]
	const ctx = { autoSend: true, autoSendsThisHour: 0, maxPerHour: 5 }
	assert.doesNotMatch(decide(w, [rule], ctx).reason, /on hold/)
	assert.match(decide(w, [rule], { ...ctx, held: ['r1'] }).reason, /Rule r1 is on hold/)
	assert.equal(decide(w, [rule], { ...ctx, held: ['r1'] }).action, 'draft')
	assert.match(decide({ ...w, correction: { kind: 'wrong', sent: 'x', at: '' } } as typeof w, [rule], ctx).reason, /A correction always waits/)
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const code = store.workflows().at(-1)!.code
	const wf = store.byCode(code)!, msgId = src.post(CHAT, 'me', 'It is in ring 0.')
	Object.assign(wf, { state: 'done', sent: { msgId, at: new Date().toISOString(), byRule: 'r1', undoUntil: new Date(Date.now() + 60_000).toISOString() } })
	store.save(wf)
	src.post('self', 'me', `unneeded ${code}`); await go()
	assert.deepEqual(Object.keys(store.heldRules()), ['r1'])
	assert.match(src.chats.self.map(m => m.body).join('\n'), /Rule r1 now asks you first/)
	assert.equal(src.chats[CHAT].some(m => m.id === msgId), false, 'taken back')
	assert.deepEqual([store.byCode(code)!.state, store.byCode(code)!.sent], ['needs_human', undefined], 'and the item is saved back as a draft')
})

test('B22 how the owner changed an earlier draft reaches the next draft\'s prompt', async () => {
	script = draft('Hi Ravi! Great question. It is in ring 0.')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'send A1: In ring 0.'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body.startsWith('In ring 0.'), true)
	let prompt = ''
	script = (p, id) => { prompt = p; return draft('Ships Friday.')(p, id) }
	src.post(CHAT, 'me', '[as Kim] When does it ship?'); await go()
	assert.match(prompt, /How the owner corrected your recent drafts[^\n]*\n- For someone else: the owner cut a 9-word draft to 3 words and dropped the greeting\./)
	assert.doesNotMatch(prompt, /Great question/, 'Ravi\'s words stay out of Kim\'s prompt')
})

test('B21 a message the owner says was missed becomes an item, and why it was missed is logged', async () => {
	const g = '19:team@thread.v2'
	src.listed.add(g)
	src.post(g, 'Kim', 'hi'); await go()
	const id = src.post(g, 'Kim', 'the ring 1 rollout looks stuck'); await go()
	assert.equal(store.workflows().length, 0, 'not for the owner by the rules')
	const link = `https://teams.microsoft.com/l/message/${encodeURIComponent(g)}/${id}?context=%7B%7D`
	script = draft('Ring 1 starts Thursday.')
	src.post('self', 'me', `missed ${link}: Kim always means me`); await go()
	const wf = store.workflows().find(w => w.asker?.id === 'Kim')!
	assert.deepEqual([wf.state, wf.lastAsk, wf.draft?.text, wf.chat.group], ['needs_human', 'the ring 1 rollout looks stuck', 'Ring 1 starts Thursday.', true])
	assert.match(src.chats.self.map(m => m.body).join('\n'), new RegExp(`Made ${wf.code} for Kim's message\\. It was missed because it did not name you`))
	assert.ok(store.lessons().some(l => l.event === 'missed' && /did not name you/.test(l.what) && (l.detail as { note?: string }).note === 'Kim always means me'))
	src.post('self', 'me', `missed ${link}`); await go()
	assert.match(src.chats.self.at(-1)!.body, new RegExp(`already ${wf.code}`))
	assert.equal(store.workflows().filter(w => w.asker?.id === 'Kim').length, 1)
	const g2 = '19:other@thread.v2', id2 = src.post(g2, 'Lee', 'is ring 2 next?'), id3 = src.post(g, 'Kim', 'and the flag?')
	const recent = src.recent.bind(src)
	src.recent = async (chat: string, n: number) => { if (chat === g2 && n === 20) throw new Error('Graph 503'); return recent(chat, n) }
	store.addMissed({ link: `https://teams.microsoft.com/l/message/${encodeURIComponent(g2)}/${id2}`, at: new Date().toISOString() })
	store.addMissed({ link: `https://teams.microsoft.com/l/message/${encodeURIComponent(g)}/${id3}`, at: new Date().toISOString() })
	await go()
	assert.equal(store.workflows().filter(w => w.lastAsk === 'and the flag?').length, 1, 'one failing link does not drop the next')
	assert.equal(store.missed().length, 1, 'the failed one stays queued')
	src.recent = recent; await go()
	assert.deepEqual([store.missed().length, store.workflows().filter(w => w.lastAsk === 'is ring 2 next?').length], [0, 1], 'and is made on the next tick')
})

test('B18 "report: ..." in the self-chat goes to the feedback log, with the item when named', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'report A1: the draft ignored the wiki'); await go()
	src.post('self', 'me', 'report: the summary came at 3 am'); await go()
	assert.match(src.chats.self.map(m => m.body).join('\n'), /Noted for A1\. It is in your feedback log/)
	assert.deepEqual(store.lessons().filter(l => l.kind === 'report').map(l => [l.code, l.what]), [['A1', 'the draft ignored the wiki'], [undefined, 'the summary came at 3 am']])
})

test('B19 a reply that promises actions brings them for ok: the change is made first, the to-do stays yours, and the promised check-back starts as a watch', async () => {
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, effectTools: ['incidents-update'] } })
	let prompt = ''
	script = (p, id) => { prompt = p; return {
		workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'Customer waits on the partner team',
		reply: { text: "I've reactivated incident 2100 and added the customer's DNS finding. I'll check every 2 hours.", commitment: true, sources: [] },
		effects: [{ system: 'incidents', action: 'reactivate', target: 'incident 2100', summary: "Reactivate incident 2100 and add the customer's DNS finding", payload: { id: 2100 }, call: { tool: 'incidents-update', args: { id: 2100 } } }],
		todos: ['Ping the partner PM on Teams'],
		follow: { target: 'incident 2100', until: 'the partner team responds', everyHours: 2 },
	} }
	src.post(CHAT, 'me', '[as David] Can you expedite this with the partner team?'); await go()
	assert.match(prompt, /Changes a separate run may make after the owner's ok, for `effects` \(tool, or tool:action\):\n- incidents-update/)
	const wf = store.byCode('A1')!
	const { cardType } = await import('../src/web/view.ts')
	assert.deepEqual([wf.state, cardType(wf), wf.promised, wf.todos, wf.follow?.everyHours], ['needs_human', 'reply', true, ['Ping the partner PM on Teams'], 2])
	const { decide } = await import('../src/core/policy.ts')
	const rule = { id: 'r1', text: 'David', who: { accounts: [{ id: wf.asker!.id, name: 'David' }] }, when: {}, then: 'send' as const }
	assert.match(decide({ ...wf, effects: undefined, todos: undefined }, [rule], { autoSend: true, autoSendsThisHour: 0, maxPerHour: 5 }).reason, /check-back|follow-up|promises/, 'a promised check-back alone keeps it a draft')
	const chat = src.chats[CHAT].length
	jf.job = executed(0)
	src.post('self', 'me', 'ok A1'); await go(); await go(); await go()
	assert.equal(store.byCode('A1')!.effects![0].done?.ref, 'thread-0', 'the change was made')
	assert.equal(src.chats[CHAT].length, chat + 1, 'then the reply went out')
	const code = store.byCode('A1')!.follow!.code!
	const watch = store.byCode(code)!, job = store.job(watch.job!)!
	assert.deepEqual([watch.kind, job.every, Math.round((Date.parse(job.endsAt!) - Date.now()) / 86_400_000)], ['tracker', 120, 7])
	assert.match(src.chats.self.map(m => m.body).join('\n'), new RegExp(`Watching incident 2100 every 2 h as ${code}[^\n]*Still yours to do: Ping the partner PM on Teams`))
	src.post('self', 'me', `every ${code}: 4h, extend ${code}`); await go()
	assert.deepEqual([store.job(watch.job!)!.every, Math.round((Date.parse(store.job(watch.job!)!.endsAt!) - Date.now()) / 86_400_000)], [240, 14])
	const { dueTrackers } = await import('../src/runner/track.ts')
	const j = store.job(watch.job!)!; Object.assign(j, { state: 'done', nextAt: new Date(0).toISOString(), endsAt: new Date(Date.now() - 1000).toISOString() }); store.saveJob(j)
	dueTrackers(store)
	assert.deepEqual([store.job(watch.job!)!.every, store.byCode(code)!.state], [undefined, 'done'], 'it stops by itself at its end')
})

test('review: a redraft that changes the promised change can still be approved, and a repeated check-back keeps its watch', async () => {
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, effectTools: ['incidents-update'] } })
	const turn = (area: string) => (_: string, id: string): Report => ({
		workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'Filing a bug',
		reply: { text: `I'll file the bug in ${area} and check back every 2 hours.`, commitment: true, sources: [] },
		effects: [{ system: 'ado', action: 'file bug', target: area, summary: `File the bug in ${area}`, payload: { area }, call: { tool: 'incidents-update', args: { area } } }],
		follow: { target: 'incident 2100', until: 'it is fixed', everyHours: 2 },
	})
	script = turn('Calling')
	src.post(CHAT, 'me', '[as David] Can you file a bug?'); await go()
	script = turn('Meetings')
	src.post(CHAT, 'me', '[as David] Actually it is a meetings bug.'); await go()
	assert.equal(store.byCode('A1')!.effects![0].target, 'Meetings')
	jf.job = executed(0)
	src.post('self', 'me', 'more A1'); await go()
	src.post('self', 'me', 'ok A1'); await go(); await go(); await go()
	assert.doesNotMatch(src.chats.self.map(m => m.body).join('\n'), /out of date/)
	assert.equal(store.byCode('A1')!.effects![0].done?.ref, 'thread-0', 'the redrafted change was made')
	const code = store.byCode('A1')!.follow!.code!
	const watch = store.byCode(code)!, job = store.job(watch.job!)!
	Object.assign(job, { endsAt: undefined }); store.saveJob(job)
	src.post('self', 'me', `extend ${code}`); await go()
	assert.equal(store.job(watch.job!)!.endsAt, undefined, 'extend gives no end date to a watch that had none')
	script = (p, id) => { const r = turn('Meetings')(p, id); return { ...r, reply: { ...r.reply!, text: `${r.reply!.text} incident: 2100.` } } }
	src.post('self', 'me', 'incomplete A1: add the incident link'); await go()
	const posts = src.chats.self.filter(m => /Posting/.test(m.body)).length
	src.post('self', 'me', 'ok A1'); await go(); await go(); await go()
	assert.equal(src.chats.self.filter(m => /Posting/.test(m.body)).length, posts, 'the change already made is not made again')
	assert.match(src.chats[CHAT].at(-1)!.body, /incident: 2100/, 'the correction went out')
	assert.equal(store.workflows().filter(w => w.kind === 'tracker').length, 1, 'the same check-back starts no second watch')
})

test('S13 open work: one incident thread stays A1 across watch news, replies, an owner note, a quiet spell, and closes when the customer confirms', async () => {
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, effectTools: ['incidents-update'] } })
	const turn = (text: string | undefined, work: Report['work'], extra: Partial<Report> = {}) => (_: string, id: string): Report => ({
		workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: text ?? 'Nothing to say yet', work, ...extra,
		...(text ? { reply: { text, commitment: true, sources: [] } } : {}),
	})
	let prompt = '', watch = 'incident 2100: active, assigned to the partner team', watchDone = false
	const run = (f: ReturnType<typeof turn>) => (p: string, id: string) => { prompt = p; return f(p, id) }
	jf.job = (p, id, runId) => /Check incident 2100/.test(p) ? { workflowId: id, intent: 'other', state: 'done', summary: watch, ...(watchDone ? { done: true } : {}) } : executed(0)(p, id, runId)
	const tick = async () => { await go(); await go() }
	const due = () => { for (const j of store.jobs().filter(j => j.every)) { j.nextAt = new Date(0).toISOString(); store.saveJob(j) } }

	script = run(turn("I've reactivated incident 2100 and added the customer's DNS finding. I'll check every 2 hours.", { goal: 'Acme mail delivery fixed by the partner team', doneWhen: 'the customer confirms mail flows', step: 'Asked to expedite with the partner team', next: { who: 'them', what: 'the partner team answers' }, waitingOn: { who: 'Partner MTA team', where: 'incident 2100' }, links: ['incident 2100', 'incident:2100'] }, {
		effects: [{ system: 'incidents', action: 'reactivate', target: 'incident 2100', summary: 'Reactivate incident 2100 and add the DNS finding', payload: { id: 2100 }, call: { tool: 'incidents-update', args: { id: 2100 } } }],
		follow: { target: 'incident 2100', until: 'the partner team responds', everyHours: 2 },
	}))
	src.post(CHAT, 'me', '[as David] Can you expedite this with the partner team?'); await go()
	const { decide } = await import('../src/core/policy.ts')
	const rule = { id: 'r1', text: 'David', who: { accounts: [{ id: store.byCode('A1')!.asker!.id, name: 'David' }] }, when: {}, then: 'send' as const }
	assert.match(decide({ ...store.byCode('A1')!, effects: undefined, follow: undefined }, [rule], { autoSend: true, autoSendsThisHour: 0, maxPerHour: 5 }).reason, /open work always wait/, 'R-WRK-08')

	src.post('self', 'me', 'ok A1'); await tick(); await tick()
	let a1 = store.byCode('A1')!
	assert.deepEqual([a1.state, a1.status, a1.effects?.[0].done?.ref], ['open', 'In progress: waiting on Partner MTA team (incident 2100)', 'thread-0'], 'R-WRK-01: the reply went out and the work stays open')
	assert.deepEqual(store.workflows().map(w => w.code), ['A1'], 'R-WRK-04: the watch has no item of its own')
	const job = store.job(a1.work!.watch!)!
	assert.deepEqual([job.parents, job.every, job.last !== undefined], [[a1.id], 120, true], 'the watch ran once for its baseline')
	assert.equal(a1.work!.steps.filter(s => s.news).length, 0, 'a baseline is not news')

	watch = 'incident 2100: the partner asks for message trace IDs'
	script = run(turn('@David the partner team needs the message trace IDs for the failed sends. Can you get them from the customer?', { step: 'Partner asked for trace IDs', next: { who: 'them', what: 'David sends the trace IDs' }, waitingOn: { who: 'David' } }))
	due(); await tick()
	a1 = store.byCode('A1')!
	assert.deepEqual([a1.code, a1.state, a1.draft?.text.startsWith('@David the partner')], ['A1', 'needs_human', true], 'R-WRK-04: the news came back to A1')
	assert.match(prompt, /Goal: Acme mail delivery[\s\S]*Replied: I've reactivated incident 2100[\s\S]*New since your last run \(from its watch and build checks\):\n>> incident 2100: the partner asks for message trace IDs/, 'R-WRK-03')
	const replayed = a1.work!.steps.length
	due(); await tick()
	assert.equal(store.byCode('A1')!.work!.steps.length, replayed, 'the same watch result adds nothing')

	const sentBefore = src.chats[CHAT].length
	src.post('self', 'me', 'more A1'); await go()
	src.post('self', 'me', 'ok A1'); await tick()
	assert.equal(src.chats[CHAT].length, sentBefore + 1, 'R-WRK-09: a second reply on the same item is a new send')
	assert.equal(store.byCode('A1')!.state, 'open')

	const old = store.thread(store.byCode('A1')!.id); for (const m of old) m.at = new Date(Date.now() - 10 * 86_400_000).toISOString()
	store.saveThread(store.byCode('A1')!.id, old)
	store.save({ ...store.byCode('A1')!, job: undefined })
	script = run(turn('Thanks, I added them to the incident.', { step: 'David sent the trace IDs' }, { effects: [{ system: 'incidents', action: 'comment', target: 'incident 2100', summary: 'Post the trace IDs', payload: { text: 'ids' }, call: { tool: 'incidents-update', args: { id: 2100, text: 'ids' } } }] }))
	src.post(CHAT, 'me', '[as David] Here are the trace IDs: 7781, 7782'); await go()
	a1 = store.byCode('A1')!
	assert.deepEqual([store.workflows().length, a1.state, a1.draft?.text], [1, 'needs_human', 'Thanks, I added them to the incident.'], 'R-WRK-02: David\'s next message joins A1')

	src.post(CHAT, 'me', 'Got it David, I will post them myself.'); await go()
	a1 = store.byCode('A1')!
	assert.deepEqual([a1.state, a1.draft, a1.work!.steps.at(-1)!.what], ['open', undefined, 'You wrote: Got it David, I will post them myself.'], 'R-WRK-02: the owner\'s message is a step and does not close the work')

	a1.work!.checkAt = new Date(Date.now() - 1000).toISOString(); store.save(a1); await go()
	a1 = store.byCode('A1')!
	assert.deepEqual([a1.state, a1.draft, (await import('../src/web/view.ts')).cardType(a1)], ['needs_human', undefined, 'question'], 'the old reply is not offered again')
	assert.match(a1.question!, /^No news on "Acme mail delivery fixed by the partner team" since [\d-]+; waiting on David\. Answer "A1: nudge them" for a drafted follow-up, "wait A1: 3d", or "close A1"\.$/, 'R-WRK-05')
	src.post('self', 'me', 'wait A1: 2d'); await go()
	a1 = store.byCode('A1')!
	assert.deepEqual([a1.state, Math.round((Date.parse(a1.work!.checkAt!) - Date.now()) / 86_400_000)], ['open', 2])

	watch = 'incident 2100: the partner deployed a fix'; watchDone = true
	script = run(turn('The partner team deployed a fix. Can you confirm with the customer?', { step: 'Partner deployed a fix', next: { who: 'them', what: 'David confirms with the customer' } }))
	due(); await tick()
	a1 = store.byCode('A1')!
	assert.deepEqual([a1.state, store.job(a1.work!.watch!)!.every, a1.work!.closed], ['needs_human', undefined, undefined], 'the watch\'s own stop condition stops only the watch')
	src.post('self', 'me', 'more A1'); await go()
	src.post('self', 'me', 'ok A1'); await tick()

	script = run(turn('Great, closing this out.', { step: 'The customer confirmed', closed: 'the partner fixed it and the customer confirmed' }))
	src.post(CHAT, 'me', '[as David] Customer confirms mail is flowing. Thanks!'); await go()
	src.post('self', 'me', 'more A1'); await go()
	src.post('self', 'me', 'ok A1'); await tick()
	a1 = store.byCode('A1')!
	assert.deepEqual([a1.state, a1.status, store.workflows().length], ['done', 'Closed: the partner fixed it and the customer confirmed', 1], 'R-WRK-06')
	assert.deepEqual(a1.work!.steps.map(s => s.what.split(':')[0]), ['Started', 'Asked to expedite with the partner team', 'Replied', 'incident 2100', 'Partner asked for trace IDs', 'Replied', 'David sent the trace IDs', 'You wrote', 'You chose to wait 2 days', 'Watch stopped', 'Partner deployed a fix', 'Replied', 'The customer confirmed', 'Replied'])
})

test('R-WRK-09 one person with two open items: a message naming one incident goes there, else to the most recent; close ends one', async () => {
	const w = (goal: string, id: string) => (_: string, wid: string): Report => ({ workflowId: wid, intent: 'status_next_step', state: 'needs_human', summary: goal, reply: { text: `On it: ${goal}.`, commitment: true, sources: [] }, work: { goal, doneWhen: 'fixed', links: [`incident:${id}`] } })
	script = w('incident 5551 fixed', '5551'); src.post(CHAT, 'me', '[as David] Please look at incident 5551'); await go(); src.post('self', 'me', 'ok A1'); await go()
	let other = ''
	script = (p, id) => store.workflow(id)!.code === 'A1' ? { workflowId: id, intent: 'other', state: 'needs_human', summary: 'Another topic', split: [other] } : w('incident 7772 fixed', '7772')(p, id)
	other = src.post(CHAT, 'me', '[as David] Separate issue: incident 7772'); await go(); await go()
	assert.deepEqual(store.workflows().map(x => [x.code, x.state, x.work?.goal]), [['A1', 'open', 'incident 5551 fixed'], ['A2', 'needs_human', 'incident 7772 fixed']], 'a different topic splits off; A1 keeps its work')
	src.post('self', 'me', 'more A2'); await go(); src.post('self', 'me', 'ok A2'); await go()
	assert.equal(store.byCode('A2')!.state, 'open')
	await new Promise(r => setTimeout(r, 5)); store.save(store.byCode('A2')!)
	let seen = ''
	script = (p, id) => { seen = id; return { workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'x', reply: { text: 'Noted.', commitment: false, sources: [] } } }
	src.post(CHAT, 'me', '[as David] Any update on 5551?'); await go()
	assert.equal(store.workflows().find(w => w.id === seen)?.code, 'A1', 'the incident it names')
	src.post('self', 'me', 'skip A1'); await go()
	assert.equal(store.byCode('A1')!.state, 'open', 'R-WRK-08: skip drops only the reply')
	src.post('self', 'me', 'close A1: duplicate of A2'); await go()
	assert.deepEqual([store.byCode('A1')!.state, store.byCode('A1')!.status, store.byCode('A2')!.state], ['done', 'Closed: duplicate of A2', 'open'])
	src.post('self', 'me', 'ok A2'); await go()
	assert.match(src.chats.self.at(-1)!.body, /A2 is in progress .* and has no draft/)
})

test('dogfood 10-20: an item about a PR leaves Needs you when the PR is completed or you vote on it in Azure DevOps; checked every 10 minutes, or at once on Check now', async () => {
	const link = 'https://acme.visualstudio.com/Globex/_git/config-validation/pullrequest/4200004'
	let pr = { status: 'active', votes: [{ name: 'Robin Park', vote: 0 }, { name: 'Dev Rao', vote: 10 }] }
	const asked: string[] = []
	const probe = { builds: async () => new Map(), pr: async (project: string, repo: string, id: number) => { asked.push(`${project}/${repo}/${id}`); return pr } }
	const t = (force = true) => tick(store, { source: src, run, procs, force, history: noList, probe })
	script = draft('I will review it after lunch.')
	src.post(CHAT, 'me', `[as Ravi] approve kardo ${link}`); await t(); await t()
	const a = store.byCode('A1')!
	assert.deepEqual([a.state, asked, a.prVote], ['needs_human', ['Globex/config-validation/4200004'], 0], 'read by project, repo, and number; your vote then is the baseline')
	pr = { ...pr, votes: [{ name: 'Robin Park', vote: 10 }] }
	await t()
	assert.equal(store.byCode('A1')!.state, 'needs_human', 'not again within 10 minutes')
	store.saveKick(); await t(false)
	assert.deepEqual([store.byCode('A1')!.state, store.byCode('A1')!.status], ['done', 'Nothing needed: You approved PR 4200004 in Azure DevOps'], 'Check now looks at once')
	pr = { status: 'active', votes: [{ name: 'Robin Park', vote: 0 }] }
	src.post(CHAT, 'me', `[as Kim] fixed your comments, check again? ${link.replace('4200004', '1738040')}`); await t()
	store.saveProbeMark({}); await t()
	const b = store.byCode('A2')!
	store.save({ ...b, work: { goal: 'Ship the config change', doneWhen: 'merged', steps: [], links: [] } })
	pr = { status: 'completed', votes: [] }
	store.saveProbeMark({}); await t()
	const b2 = store.byCode('A2')!
	assert.deepEqual([b2.state, b2.work?.steps.at(-1)?.what], ['open', 'PR 1738040 was completed'], 'open work stays open, with the news as a step')
	pr = { status: 'active', votes: [{ name: 'Robin Park', vote: -5 }] }
	src.post(CHAT, 'me', `[as Pete] can you re-review? ${link.replace('4200004', '1738041')}`); await t()
	store.saveProbeMark({}); await t()
	store.saveProbeMark({}); await t()
	assert.equal(store.byCode('A3')!.state, 'needs_human', 'a vote you already had when it came in is not news')
	pr = { status: 'active', votes: [{ name: 'Robin Park', vote: 0 }] }
	store.saveProbeMark({}); await t()
	assert.equal(store.byCode('A3')!.state, 'needs_human', 'votes reset by a new push are not you acting')
	pr = { status: 'active', votes: [{ name: 'Robin Park', vote: -5 }] }
	store.saveProbeMark({}); await t()
	assert.deepEqual([store.byCode('A3')!.state, store.byCode('A3')!.status], ['done', 'Nothing needed: You voted "Waiting for author" on PR 1738041 in Azure DevOps'], 'voting again after the reset is you acting')
	const { prOf } = await import('../src/runner/probe.ts')
	src.post(CHAT, 'me', `[as Pia] Pull request 4200003: config rollout, can you approve? Earlier one was ${link.replace('4200004', '1665010')}`); await t()
	assert.equal(prOf(store, store.byCode('A4')!), undefined, 'a link to another PR is never taken for the one asked about (dry run: A37)')
	src.post('self', 'me', 'skip A4'); await t()
	pr = { status: 'active', votes: [{ name: 'Robin Park', vote: 10 }] }
	src.post(CHAT, 'me', `[as Sam] please approve ${link.replace('4200004', '1738042')}`); await t()
	store.saveProbeMark({}); await t()
	assert.equal(store.byCode('A5')!.status, 'Nothing needed: You approved PR 1738042 in Azure DevOps', 'already approved when it came in: nothing for you to do (A12)')
	src.post(CHAT, 'me', `[as Ana] fixed your comments, please re-review ${link.replace('4200004', '1738043')}`); await t()
	store.saveProbeMark({}); await t()
	assert.equal(store.byCode('A6')!.state, 'needs_human', 'an approval you had before a re-review ask is not an answer to it')
	pr = { status: 'active', votes: [] }
	store.saveProbeMark({}); await t()
	assert.equal(store.byCode('A6')!.prVote, 10, 'a reply with no reviewers never resets what was seen')
	pr = { status: 'active', votes: [{ name: 'Robin Park', vote: -10 }, { name: 'Robin Park', vote: 0 }] }
	store.saveProbeMark({}); await t()
	assert.equal(store.byCode('A6')!.state, 'needs_human', 'two reviewers with your name prove nothing')
	asked.length = 0
	src.post(CHAT, 'me', `[as Ken] and this one too? ${link.replace('4200004', '1738043')}`); await t()
	pr = { status: 'active', votes: [{ name: 'Robin Park', vote: 10 }] }
	store.saveProbeMark({}); await t()
	assert.equal(asked.filter(x => x.endsWith('/1738043')).length, 1, 'one read per PR, however many items ask about it')
	const before = store.byCode('A1')!.status
	pr = { status: 'abandoned', votes: [] }
	store.saveProbeMark({}); await t()
	assert.equal(store.byCode('A1')!.status, before, 'only items waiting on you are checked')
})

test('review 10-20: a PR already closed when the ask came in keeps the item; an answer on its way keeps it; a reopened item forgets how it closed', async () => {
	const link = 'https://acme.visualstudio.com/Globex/_git/config-validation/pullrequest/4200005'
	type Pr = { status: string; closedAt?: string; votes: { name: string; vote: number }[] }
	let pr: Pr = { status: 'active', votes: [] }
	const prs: Record<number, Pr> = { 4200005: { status: 'completed', closedAt: new Date(Date.now() - 86_400_000).toISOString(), votes: [] } }
	const probe = { builds: async () => new Map(), pr: async (_p: string, _r: string, id: number) => prs[id] ?? pr }
	const t = () => tick(store, { source: src, run, procs, force: true, history: noList, probe })
	script = draft('Looking now.')
	src.post(CHAT, 'me', `[as Bob] ${link} merged yesterday and broke the nightly build, can you look?`); await t()
	store.saveProbeMark({}); await t()
	assert.equal(store.byCode('A1')!.state, 'needs_human', 'merged before Bob asked: that is why he asks, not an answer')
	src.post(CHAT, 'me', `[as Sam] please review ${link.replace('4200005', '1739002')}`); await t()
	const sam = store.thread(store.byCode('A2')!.id).filter(m => !m.byOwner).at(-1)!.at
	pr = { status: 'completed', closedAt: new Date(Date.parse(sam) + 60_000).toISOString(), votes: [] }
	store.saveProbeMark({}); await t()
	assert.deepEqual([store.byCode('A2')!.status, store.byCode('A2')!.closedBy], ['Nothing needed: PR 1739002 was completed', 'nothing'], 'completed after Sam asked, while Delegate was not looking')
	assert.equal(store.byCode('A1')!.state, 'needs_human', 'still closed at the next look is still not news')
	const { probePRs } = await import('../src/runner/probe.ts')
	src.post(CHAT, 'me', `[as Pia] please approve ${link.replace('4200005', '1739003')}`); await t()
	pr = { status: 'active', votes: [{ name: 'Robin Park', vote: 0 }] }
	store.saveProbeMark({}); await t()
	pr = { status: 'active', votes: [{ name: 'Robin Park', vote: 10 }] }
	store.writeAnswer({ code: 'A3', verb: 'ok', surface: 'panel' })
	await probePRs(store, store.config(), probe, Date.now(), true)
	assert.equal(store.byCode('A3')!.state, 'needs_human', 'your ok is applied first; the PR check does not close it under you')
	const a1 = store.byCode('A1')!
	store.save({ ...a1, state: 'done', closedBy: 'skipped', fyi: { line: 'old', weight: 'normal' }, prStatus: 'active', prVote: 0 })
	prs[4200005] = { status: 'completed', votes: [{ name: 'Robin Park', vote: 10 }] }
	src.post(CHAT, 'me', `[as Bob] it merged and the nightly is still broken, any update on ${link}?`); await t()
	const back = store.byCode('A1')!
	assert.deepEqual([back.closedBy, back.fyi], [undefined, undefined], 'a later close says its own way')
	store.saveProbeMark({}); await t()
	store.saveProbeMark({}); await t()
	assert.equal(store.byCode('A1')!.state, 'needs_human', 'what happened to the PR before Bob wrote again is not an answer to him')
})

test('S14 deploy, test, report: work you take on in a group thread follows you into a 1:1, waits on a build, and closes everywhere', async () => {
	const g = '19:events@thread.v2', dm = '19:me_div@unq.gbl.spaces', pete = '19:me_pete@unq.gbl.spaces'
	src.listed.add(g); src.listed.add(dm); src.listed.add(pete)
	src.post(g, 'Rita', 'hello all'); await go()
	let builds = new Map<number, { status: string; result?: string }>(), down = false
	const probe = { builds: async (_: string, ids: number[]) => { if (down) throw new Error('ADO 503'); return new Map(ids.filter(i => builds.has(i)).map(i => [i, builds.get(i)!])) } }
	const tickP = async () => { store.saveProbeMark({}); await tick(store, { source: src, run, procs, force: true, history: noList, probe }) }
	const prompts: Record<string, string> = {}
	const plan = [
		{ what: 'Point a web test ring at store 7 (PR)', who: 'you' as const },
		{ what: 'CI build 52000001 passes', who: 'them' as const, build: 52000001, project: 'Globex', in: 'A2' },
		{ what: 'Test checkout flows 1 and 2', who: 'you' as const },
		{ what: 'Report results here', who: 'you' as const, in: 'A1' },
	]
	script = (p, id) => {
		const w = store.workflow(id)!
		prompts[w.code] = p
		if (w.startedBy === 'owner') return { workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'You took on testing', work: { goal: 'Test checkout flows 1 and 2 against dev store 7', doneWhen: 'results are posted in the group thread', plan: plan.slice(0, 1).concat(plan.slice(2)) } }
		if (/CI build is failing/.test(p) && !w.partOf) return { workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'Build failing', partOf: 'a1', reply: { text: 'Checking the build log now.', commitment: false, sources: [] }, work: { step: 'CI build for PR 1234567 is failing', links: ['pr:1234567'], plan } }
		if (/Build 52000001 succeeded/.test(p)) return { workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'Build passed', reply: { text: 'CI build 52000001 passed. Please redeploy to staging2.', commitment: false, sources: [] }, work: { step: 'Asked Devin to redeploy' } }
		return { workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'Noted', reply: { text: 'Noted, thanks.', commitment: false, sources: [] } }
	}

	src.post(g, 'me', "Our team handles checkout flows 1 and 2, and I'd be the POC. We need to test async report creation against store 7."); await go()
	let a1 = store.byCode('A1')!
	assert.deepEqual([a1.state, a1.work?.proposed, a1.chat.id], ['needs_human', true, g], 'R-WRK-11: offered, not yet tracked')
	assert.match(a1.question!, /^Track this as work\? Goal: Test checkout flows 1 and 2 against dev store 7\. Done when: results are posted in the group thread\./)
	src.post('self', 'me', 'more A1'); await go(); src.post('self', 'me', 'ok A1'); await go()
	a1 = store.byCode('A1')!
	assert.deepEqual([a1.state, a1.work?.proposed], ['open', undefined])

	src.post(dm, 'me', 'Deploy this to any test env Pull Request 1234567'); await go()
	src.post(dm, 'Devin Tanner', 'CI build is failing. Can you check?'); await go()
	assert.match(prompts.A2, /Open work that started in other chats[^\n]*\n- A1: Test checkout flows 1 and 2 against dev store 7/)
	let a2 = store.byCode('A2')!
	a1 = store.byCode('A1')!
	assert.deepEqual([a2.partOf, a1.work!.parts, a1.work!.links, a2.state], [a1.id, [a2.id], ['pr:1234567'], 'needs_human'], 'R-WRK-10: the 1:1 is a part of A1')
	const { decide } = await import('../src/core/policy.ts')
	assert.match(decide(a2, [{ id: 'd', text: '', who: { accounts: [{ id: 'Devin Tanner', name: 'Devin Tanner' }] }, when: { chat: 'direct' }, then: 'send' }], { autoSend: true, autoSendsThisHour: 0, maxPerHour: 5 }).reason, /open work always wait/, 'R-WRK-14')
	src.post('self', 'me', 'more A2'); await go(); src.post('self', 'me', 'ok A2'); await go()
	assert.equal(src.chats[dm].at(-1)!.body, 'Checking the build log now.')
	src.post(dm, 'me', 'Getting 503'); await go()
	a1 = store.byCode('A1')!; a2 = store.byCode('A2')!
	assert.deepEqual([a2.state, a1.state], ['open', 'open'])
	assert.deepEqual(a1.work!.steps.slice(-3).map(x => x.what.replace(/: .*$/, '')), ['Devin (1:1, A2)', 'Devin (1:1, A2)', 'You wrote to Devin (1:1, A2)'])
	assert.deepEqual(a1.work!.plan!.map(p => [p.id, p.in ?? '', p.done ? 'done' : 'todo']), [['p1', '', 'todo'], ['p2', '', 'todo'], ['p3', 'A1', 'todo'], ['p4', 'A2', 'todo']], 'R-WRK-12: ids kept, the home\'s steps stay, a new step gets a new id')

	builds.set(52000001, { status: 'InProgress' }); await tickP()
	assert.equal(store.byCode('A1')!.work!.steps.filter(x => x.news).length, 0, 'a running build is a baseline')
	down = true; builds.set(52000001, { status: 'Completed', result: 'Succeeded' }); await tickP()
	assert.match(store.health()['build-check']?.text ?? '', /could not reach Azure DevOps/)
	assert.equal(store.byCode('A2')!.state, 'open', 'an outage is never a build change')
	down = false; await tickP(); await go()
	a1 = store.byCode('A1')!; a2 = store.byCode('A2')!
	assert.deepEqual([a1.work!.plan!.find(p => p.probe)!.done !== undefined, a2.state, a2.draft?.text], [true, 'needs_human', 'CI build 52000001 passed. Please redeploy to staging2.'], 'R-WRK-13: the build news runs the 1:1 part')
	assert.match(prompts.A2, /This chat \(A2\) is part of A1's work[\s\S]*>> Build 52000001 succeeded/)
	assert.equal(store.health()['build-check'], undefined)
	await tickP()
	assert.equal(store.byCode('A1')!.work!.steps.filter(x => /^Build 52000001/.test(x.what)).length, 1, 'news is added once')

	src.post(pete, 'Paul Lane', 'Is PR 1234567 deployed to staging2 yet?'); await go()
	const a3 = store.workflows().find(w => w.chat.id === pete)!
	assert.equal(a3.partOf, store.byCode('A1')!.id, 'a message naming the PR joins without the AI deciding')

	const g2 = '19:release@thread.v2'
	src.listed.add(g2); src.post(g2, 'Sam', 'hello'); await go()
	src.post(g2, 'Sam', '@Robin is PR 1234567 on staging2?'); await go()
	src.post(g2, 'Tom', '@Robin also, does PR 1234567 fix the checkout bug?'); await go()
	assert.deepEqual(store.workflows().filter(w => w.chat.id === g2).map(w => w.partOf === store.byCode('A1')!.id), [true], 'a second person naming the PR in the same chat joins the same part')
	const gina = '19:me_gina@unq.gbl.spaces'
	src.listed.add(gina); src.post(gina, 'Gina', 'hi'); await go()
	const before = store.workflows().length
	src.post(gina, 'me', 'Gina, PR 1234567 points web staging2 at store 7. Can you watch the scheduler logs while I test?'); await go()
	const a4 = store.workflows().find(w => w.chat.id === gina && w.partOf)!
	assert.deepEqual([store.workflows().length - before, a4.state, store.byCode('A1')!.work!.steps.at(-1)!.what.startsWith('You wrote in the 1:1 with')], [1, 'open', true], 'your own message naming the PR makes this 1:1 a part')
	src.post(gina, 'Gina', 'Sure, watching now.'); await go()
	assert.deepEqual([store.workflows().filter(w => w.chat.id === gina && w.state !== 'done').length, store.byCode(a4.code)!.asker?.id], [1, 'Gina'], 'their reply goes to that part')
	src.post('self', 'me', 'close A1: results posted'); await go()
	assert.deepEqual(['A1', 'A2', a3.code, a4.code].map(c => store.byCode(c)!.state), ['done', 'done', 'done', 'done'], 'R-WRK-14: closing the work closes its chats')
})

test('round 3 #7 per-chat level: a private chat holds what uses it, even a reply already scheduled; off the record is never searched, learned from, or counted', async () => {
	const g = '19:sync@thread.v2', lead = '19:lead2@thread.v2', link = (c: string, id = '1700000000001') => `https://teams.microsoft.com/l/message/${encodeURIComponent(c)}/${id}`
	const { setChatLevel } = await import('../src/runner/sharing.ts')
	assert.equal(setChatLevel(store, 'Budget room', 'private'), 'I don\'t know a chat called "Budget room". Paste a link to any message in it.')
	src.listed.add(g); src.post(g, 'Pete', 'hi'); await go()
	src.memberIds = { [g]: ['me', 'Pete'], [lead]: ['me', 'Pete'] }
	const { knowledgeOf, propose, answerProposal } = await import('../src/runner/proposals.ts')
	const k = knowledgeOf(store, store.config())
	answerProposal(store, k, propose(store, k, [{ topic: 'Budget', type: 'status', text: 'The budget review moved to Friday.', src: [{ link: link(lead), date: new Date().toISOString().slice(0, 10) }] }], 'bootstrap')[0], { id: '', code: '', verb: 'ok', surface: 'chat', at: '' })
	const hit = k.search('budget review')[0], ref = `card:${hit.topic}/${hit.card}#${hit.id}`
	writeFileSync(join(store.root, 'rules.compiled.json'), JSON.stringify({ schema: 1, rules: [{ id: 'r1', text: 'Pete', who: { accounts: [{ id: 'Pete', name: 'Pete' }] }, when: {}, then: 'send' }] }))
	autoOn()
	script = (_: string, id: string): Report => ({ workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'x', reply: { text: 'Friday.', commitment: false, sources: [{ ref, tier: 'card', origin: 'extracted' }] } })
	src.post(g, 'Pete', '@Robin when is the budget review?'); await go()
	let a = store.workflows().at(-1)!
	assert.deepEqual([a.state, a.drewOn], ['scheduled', [lead]], 'everyone here is in that chat: scheduled to go')
	assert.equal(setChatLevel(store, link(lead), 'private', 'Leadership sync'), 'Leadership sync is private: a reply elsewhere that uses anything from it waits for your ok. Say "Leadership sync is normal again" to undo.')
	store.save({ ...a, sendAt: new Date(Date.now() - 1000).toISOString() }); await go()
	a = store.byCode(a.code!)!
	assert.deepEqual([a.state, a.status, a.sent], ['needs_human', 'Not sent: Uses something from Leadership sync, which you marked private', undefined], 'marked after it was scheduled: it does not go')
	src.post('self', 'me', `skip ${a.code}`); await go()
	src.post(g, 'Pete', '@Robin and the room?'); await go()
	a = store.workflows().at(-1)!
	assert.deepEqual([a.state, a.decision?.reason], ['needs_human', 'Uses something from Leadership sync, which you marked private'], 'a new reply that uses it waits')
	src.post('self', 'me', `skip ${a.code}`); await go()
	setChatLevel(store, link('19:lead3@thread.v2'), 'private', 'Leadership offsite')
	assert.equal(setChatLevel(store, 'leadership', 'normal'), 'More than one chat matches "leadership": Leadership sync; Leadership offsite. Say which one, or paste a link to a message in it.')
	assert.equal(setChatLevel(store, 'Leadership offsite', 'normal'), 'Leadership offsite is normal again.')
	assert.equal(setChatLevel(store, link('19:lead3@thread.v2'), 'normal', 'Leadership offsite'), 'Leadership offsite was not marked, so nothing changed.')
	assert.match(setChatLevel(store, 'leadership', 'off'), /^Leadership sync is off the record: never learned from or searched/)
	const { fromOffChat } = await import('../src/runner/sharing.ts')
	assert.equal(fromOffChat(store.config(), k.search('budget review')[0].src), true, 'learned before it was marked: no longer searched or read')
	assert.equal(fromOffChat(store.config(), [{ link: link(lead), date: '' }, { link: 'delegate:remember/1', date: '' }]), false, 'what the owner said to remember stays')
	{
		const { build } = await import('../src/mcp/server.ts')
		const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
		const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
		Object.assign(process.env, { DELEGATE_MODE: 'worker', DELEGATE_WORKFLOW: a.id, DELEGATE_RUN: 'r7' })
		try {
			const [x, y] = InMemoryTransport.createLinkedPair()
			await build(() => store).connect(x)
			const c = new Client({ name: 't', version: '1' }); await c.connect(y)
			const call = async (name: string, args: Record<string, unknown>) => ((await c.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0].text
			assert.match(await call('knowledge_search', { query: 'budget review' }), /^No entries match\./, 'a worker cannot find it')
			assert.equal(await call('knowledge_read', { ref }), 'Not found.')
			assert.doesNotMatch(await call('knowledge_read', { ref: hit.topic }), /budget review/)
			await c.close()
			const { takeRead } = await import('../src/runner/sharing.ts')
			assert.deepEqual(takeRead(store.root, 'r7').searches, [{ tool: 'knowledge', q: 'budget review', n: 0 }, { tool: 'read', q: 'budget', n: 0 }, { tool: 'read', q: 'budget', n: 1 }], 'round 3 #5 the run records where it looked and how many hits, never what came back')
		} finally { for (const v of ['DELEGATE_MODE', 'DELEGATE_WORKFLOW', 'DELEGATE_RUN']) delete process.env[v] }
	}
	assert.deepEqual(propose(store, k, [{ topic: 'Budget', type: 'fact', text: 'The budget is tight.', src: [{ link: link(lead, '1700000000002'), date: '2026-10-19' }] }], 'bootstrap'), [], 'nothing new is learned from it')
	assert.equal(propose(store, k, [{ topic: 'Budget', type: 'fact', text: 'The budget is tight.', src: [{ link: link(lead, '1700000000002'), date: '2026-10-19' }] }], 'remember').length, 1, 'unless the owner says it')
	setChatLevel(store, lead, 'normal')
	const [p] = propose(store, k, [{ topic: 'Rooms', type: 'fact', text: 'Room 4 has the projector.', src: [{ link: link(lead, '1700000000003'), date: '2026-10-19' }] }], 'bootstrap')
	setChatLevel(store, lead, 'off', 'Leadership sync')
	const { saveLearned } = await import('../src/runner/proposals.ts')
	saveLearned(store)
	assert.deepEqual([store.proposal(p.code)?.state, store.proposal(p.code)?.status, k.search('projector').length], ['dropped', 'From a chat you keep off the record', 0], 'proposed before it was marked: not saved by itself')
	const { learnFrom } = await import('../src/runner/learn.ts')
	const jobs = store.jobs().length
	learnFrom(store, store.config(), { ...a, chat: { ...a.chat, id: lead } }, 'Friday.', 'Friday, room 4.')
	assert.equal(store.jobs().length, jobs, 'an edited reply there teaches nothing')
	const { startBootstrap, planChats } = await import('../src/runner/bootstrap.ts')
	startBootstrap(store, ['chats'])
	const cv = (id: string) => ({ id, mine: 10, lastAt: '2026-10-10T10:00:00Z' })
	await planChats(store, { search: async () => [], close: async () => {}, conversations: async () => [cv(lead), cv('19:other@thread.v2')] })
	assert.deepEqual(store.jobs().filter(j => j.key.startsWith('bootstrap:chats:')).map(j => /lead2/.test(j.goal)), [false], 'the history read skips it')
	const { noticeHabits } = await import('../src/runner/habits.ts')
	const day = (n: number) => { const at = new Date(Date.now() - n * 86_400_000); const f = join(store.root, 'state', 'log', `${at.toISOString().slice(0, 10)}-old.jsonl`); mkdirSync(join(store.root, 'state', 'log'), { recursive: true }); writeFileSync(f, (existsSync(f) ? readFileSync(f, 'utf8') : '') + JSON.stringify({ at: at.toISOString(), event: 'outcome', how: 'sent', chat: lead, group: false, asker: { id: 'Quinn', name: 'Quinn Ross' }, intent: 'status_next_step', edited: false, approvedBy: 'owner' }) + '\n') }
	for (const d of [9, 8, 6, 5, 3]) day(d)
	assert.equal(noticeHabits(store, store.config()), undefined, 'replies there are not a habit')
	assert.match(noticeHabits(store, { ...store.config(), chatLevels: {} })?.text ?? '', /Quinn/, 'the same replies in a normal chat are')
	store.saveHabits([])
	store.log({ event: 'skipped', code: 'A90', chat: lead, intent: 'status_next_step', asker: { id: 'Pete', name: 'Pete' }, ask: 'budget?', draft: 'SECRET-OFF' })
	setChatLevel(store, '19:lead4@thread.v2', 'private', 'Staff')
	store.log({ event: 'skipped', code: 'A91', chat: '19:lead4@thread.v2', intent: 'status_next_step', asker: { id: 'Pete', name: 'Pete' }, ask: 'staff?', draft: 'SECRET-PRIVATE' })
	store.log({ event: 'skipped', code: 'A92', chat: g, intent: 'status_next_step', asker: { id: 'Pete', name: 'Pete' }, ask: 'sync?', draft: 'PLAIN-LESSON' })
	const work = (id: string, chat: string, goal: string) => store.save({ ...a, id, code: undefined as never, chat: { ...a.chat, id: chat }, state: 'waiting_on_sender', work: { goal, doneWhen: 'x', steps: [], links: [] } })
	work('w-off', lead, 'SECRET-WORK'); work('w-plain', '19:norm@thread.v2', 'PLAIN-WORK')
	let prompt = ''
	script = (pr: string, id: string): Report => { prompt = pr; return { workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'x', reply: { text: 'Soon.', commitment: false, sources: [] } } }
	src.post(g, 'Pete', '@Robin any news?'); await go()
	assert.deepEqual([/SECRET-OFF/.test(prompt), /SECRET-PRIVATE/.test(prompt), /PLAIN-LESSON/.test(prompt), /SECRET-WORK/.test(prompt), /PLAIN-WORK/.test(prompt)], [false, false, true, false, true], 'lessons and open work from marked chats stay out of other chats')
	const { aboutText } = await import('../src/web/settings.ts')
	assert.match(aboutText(store), /## Chats you marked\n- Leadership sync: off the record: never learned from or searched, and a reply elsewhere that uses anything from it waits for your ok\. "Leadership sync is normal again" undoes it\.\n- Staff: private: /)
	setChatLevel(store, link('19:lead5@thread.v2'), 'private', 'Staff offsite')
	assert.equal(setChatLevel(store, 'staff', 'normal'), 'Staff is normal again.', 'an exact name wins over a longer one')
})

test('review: knowledge a run finds from a private chat counts as read from it, cited or not; other hits do not', async () => {
	const priv = '19:priv@thread.v2', open = '19:open@thread.v2', link = (c: string) => `https://teams.microsoft.com/l/message/${encodeURIComponent(c)}/1700000000001`
	const { knowledgeOf, propose, answerProposal } = await import('../src/runner/proposals.ts')
	const { setChatLevel, takeRead } = await import('../src/runner/sharing.ts')
	const k = knowledgeOf(store, store.config())
	answerProposal(store, k, propose(store, k, [{ topic: 'Hiring', type: 'status', text: 'Two hiring slots open in Q3.', src: [{ link: link(priv), date: '2026-10-19' }] }, { topic: 'Hiring', type: 'fact', text: 'Hiring loops take two weeks.', src: [{ link: link(open), date: '2026-10-19' }] }], 'bootstrap')[0], { id: '', code: '', verb: 'ok', surface: 'chat', at: '' })
	setChatLevel(store, link(priv), 'private', 'Staff')
	const { build } = await import('../src/mcp/server.ts')
	const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
	const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
	Object.assign(process.env, { DELEGATE_MODE: 'worker', DELEGATE_WORKFLOW: 'w', DELEGATE_RUN: 'rk' })
	try {
		const [x, y] = InMemoryTransport.createLinkedPair()
		await build(() => store).connect(x)
		const c = new Client({ name: 't', version: '1' }); await c.connect(y)
		await c.callTool({ name: 'knowledge_search', arguments: { query: 'hiring' } })
		assert.deepEqual(takeRead(store.root, 'rk').chats, [priv])
		await c.callTool({ name: 'knowledge_read', arguments: { ref: 'hiring' } })
		assert.deepEqual(takeRead(store.root, 'rk').chats, [priv])
		await c.close()
	} finally { for (const v of ['DELEGATE_MODE', 'DELEGATE_WORKFLOW', 'DELEGATE_RUN']) delete process.env[v] }
})

test('S16 habits: unedited replies to one person about one kind of ask become a suggestion; ok saves a learned rule, never removes it', async () => {
	const dm = '19:me_sri@unq.gbl.spaces', sam = '19:me_sam@unq.gbl.spaces'
	src.listed.add(sam)
	script = draft('It is in ring 0.')
	src.post(sam, 'Sam', 'Status of the banner?'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	src.post(sam, 'Sam', 'And the flag?'); await go()
	src.post('self', 'me', 'send A1: In ring 0, flag on.'); await go()
	const outs = store.logs(1).filter(e => e.event === 'outcome')
	assert.deepEqual(outs.map(o => [o.how, o.edited, o.approvedBy, o.group]), [['sent', false, 'owner', false], ['sent', true, 'owner', false]], 'edited is decided by the text, not the verb')
	const { noticeHabits } = await import('../src/runner/habits.ts')
	assert.equal(noticeHabits(store, store.config()), undefined, 'one clean send is not a habit')
	const log = (day: number, o: Record<string, unknown>) => { const at = new Date(Date.now() - day * 86_400_000); const f = join(store.root, 'state', 'log', `${at.toISOString().slice(0, 10)}-old.jsonl`); mkdirSync(join(store.root, 'state', 'log'), { recursive: true }); writeFileSync(f, (existsSync(f) ? readFileSync(f, 'utf8') : '') + JSON.stringify({ at: at.toISOString(), event: 'outcome', how: 'sent', chat: dm, group: false, asker: { id: 'Alex', name: 'Alex Rivera' }, intent: 'status_next_step', edited: false, approvedBy: 'owner', link: `https://x/${day}`, ...o }) + '\n') }
	for (const d of [9, 8, 6, 5, 3]) log(d, { asker: { id: 'Neha', name: 'Neha' } })
	log(4, { asker: { id: 'Neha', name: 'Neha' }, group: true, chat: 'g' })
	assert.equal(noticeHabits(store, store.config()), undefined, 'a person also answered in a group chat is not offered')
	for (const d of [9, 8, 6, 5, 3]) log(d, {})
	const h = noticeHabits(store, store.config())!
	assert.equal(h.code, 'H1')
	assert.equal(h.text, 'You sent your last 5 replies to Alex (status next step) without changes. Let those go by themselves?')
	assert.deepEqual([h.rule.when, h.evidence.days], [{ chat: 'direct', intent: 'status_next_step' }, 5])
	for (const d of [9, 8, 6, 5, 3]) log(d, { asker: { id: 'Pat', name: 'Pat' } })
	assert.equal(noticeHabits(store, store.config()), undefined, 'at most one new suggestion a day')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	assert.doesNotMatch(src.chats.self.map(m => m.body).join('\n'), /Suggestion H1/, 'not while a reply needs you')
	src.post('self', 'me', `skip ${store.workflows().find(w => w.asker?.name === 'Ravi')!.code}`); await go()
	assert.match(src.chats.self.at(-1)!.body, /Suggestion H1: You sent your last 5 replies to Alex/)
	src.post('self', 'me', 'ok H1'); await go()
	const rule = store.rules().find(r => r.learned)!
	const { aboutText } = await import('../src/web/settings.ts')
	assert.match(aboutText(store), /## Standing instructions\n- replies to Alex Rivera in 1:1 about status next step go by themselves · For: Alex Rivera \(Learned [\d-]+ from 5 unedited replies on 5 days; "never H1" turns it off\)[\s\S]*## Learning\n- Notice my habits: on/)
	const { whoOf } = await import('../src/web/settings.ts')
	const acct = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
	assert.deepEqual([whoOf({ who: { accounts: acct(9) } } as never), whoOf({ who: { group: 'team' } } as never)], ['P0, P1, P2, P3, P4, P5, P6, P7, and 1 more', 'Anyone in your team'])
	assert.deepEqual([rule.when, rule.then, rule.learned!.evidence], [{ chat: 'direct', intent: 'status_next_step' }, 'send', '5 unedited replies on 5 days'])
	assert.match(readFileSync(join(store.root, 'rules.md'), 'utf8'), /## Learned\n\n- replies to Alex Rivera in 1:1 about status next step go by themselves \(learned [\d-]+ from 5 unedited replies on 5 days\)/)
	const { decide } = await import('../src/core/policy.ts')
	const w = { ...store.byCode('A1')!, asker: { id: 'Alex', name: 'Alex Rivera' }, intent: 'status_next_step', draft: { text: 'x', commitment: false, sources: [{ ref: 'k', tier: 'card' as const, origin: 'extracted' as const }] } }
	assert.equal(decide(w, store.rules(), { autoSend: true, autoSendsThisHour: 0, maxPerHour: 5 }).ruleId, rule.id)
	for (const n of [1, 2]) {
		src.post(CHAT, 'me', `[as Ravi${n}] Status ${n}?`); await go()
		const w = store.workflows().at(-1)!
		store.save({ ...w, state: 'done', sent: { msgId: src.post(CHAT, 'me', 'x'), at: new Date().toISOString(), byRule: rule.id, text: 'x' } })
		src.post('self', 'me', `wrong ${w.code}: not right`); await go()
		assert.equal(!!store.heldRules()[rule.id], n === 2, n === 1 ? 'one wrong mark does not hold it' : 'two in a row put the learned rule on hold')
	}
	src.post('self', 'me', 'never H1'); await go()
	assert.deepEqual([store.rules().some(r => r.learned), /## Learned/.test(readFileSync(join(store.root, 'rules.md'), 'utf8')), store.habit('H1')!.state], [false, false, 'declined'])
	assert.equal(noticeHabits(store, { ...store.config() }, Date.now() + 2 * 86_400_000)?.text, 'You sent your last 5 replies to Pat (status next step) without changes. Let those go by themselves?', 'a day later the next pattern; the declined one never comes back')
})

test('S15 need to know: a reply that drew on a chat not everyone here is in waits for the owner; so does one whose chats cannot be checked', async () => {
	const g = '19:events@thread.v2', lead = '19:lead@thread.v2'
	src.listed.add(g); src.post(g, 'Pete', 'hi'); await go()
	src.memberIds = { [g]: ['me', 'Pete', 'Kim'], [lead]: ['me', 'Rita'] }
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, tools: [...store.config().agent.tools, 'teams-ListChatMessages', 'ado-repo_pull_request'] } })
	const { knowledgeOf, propose, answerProposal } = await import('../src/runner/proposals.ts')
	const k = knowledgeOf(store, store.config())
	answerProposal(store, k, propose(store, k, [{ topic: 'Rollout', type: 'status', text: 'The rollout moves to Nov 12.', src: [{ link: `https://teams.microsoft.com/l/message/${encodeURIComponent(lead)}/1700000000001`, date: new Date().toISOString().slice(0, 10) }] }], 'bootstrap')[0], { id: '', code: 'K1', verb: 'ok', surface: 'chat', at: '' })
	const hit = k.search('rollout')[0], ref = `card:${hit.topic}/${hit.card}#${hit.id}`
	writeFileSync(join(store.root, 'rules.compiled.json'), JSON.stringify({ schema: 1, rules: [{ id: 'r1', text: 'Pete', who: { accounts: [{ id: 'Pete', name: 'Pete' }] }, when: {}, then: 'send' }] }))
	autoOn()
	const cite = (sources: { ref: string; tier: 'card' | 'live'; origin: 'extracted' }[]) => (_: string, id: string): Report => ({ workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'x', reply: { text: 'Nov 12.', commitment: false, sources } })
	script = cite([{ ref, tier: 'card', origin: 'extracted' }])
	src.post(g, 'Pete', '@Robin when does it roll out?'); await go()
	let a = store.workflows().at(-1)!
	assert.deepEqual([a.state, a.decision?.reason], ['needs_human', 'Uses something from another chat, and not everyone here is in that chat'], 'R-SHR-01')
	assert.equal(runTools.some(t => /^teams-List/.test(t)), false, 'reply runs cannot read chats around history_search')
	assert.ok(runTools.includes('ado-repo_pull_request'))
	src.post('self', 'me', `skip ${a.code}`); await go()
	src.memberIds[lead] = ['me', 'Rita', 'Pete', 'Kim']; store.saveMembers({})
	src.post(g, 'Pete', '@Robin and the date again?'); await go()
	a = store.workflows().at(-1)!
	assert.equal(a.decision?.ruleId, 'r1', 'everyone here is in that chat: the rule may send')
	assert.notEqual(a.decision?.action, 'draft')
	src.post('self', 'me', `skip ${a.code}`); await go()
	delete src.memberIds[lead]; store.saveMembers({})
	src.post(g, 'Pete', '@Robin one more?'); await go()
	assert.equal(store.workflows().at(-1)!.decision?.reason, 'Uses something from another chat, and I could not check who is in each chat')
	src.post('self', 'me', `skip ${store.workflows().at(-1)!.code}`); await go()
	src.memberIds[lead] = ['me', 'Rita']; store.saveMembers({})
	script = cite([]); readChats = [lead]
	try { src.post(g, 'Pete', '@Robin anything new?'); await go() } finally { readChats = [] }
	assert.equal(store.workflows().at(-1)!.decision?.reason, 'Uses something from another chat, and not everyone here is in that chat', 'a chat it read counts even when not cited')
	assert.deepEqual(store.workflows().at(-1)!.looked, [{ tool: 'teams', q: 'rollout date', n: 1 }], 'B30 the search it ran, with its hit count')
	src.post('self', 'me', `skip ${store.workflows().at(-1)!.code}`); await go()
	src.memberNames[g] = { me: 'Robin Lee', Pete: 'Pete Shaw', Kim: 'Kim Ito' }; store.saveMembers({})
	script = cite([{ ref, tier: 'card', origin: 'extracted' }])
	src.post(g, 'Pete', '@Robin and now?'); await go()
	a = store.workflows().at(-1)!
	assert.deepEqual([a.decision?.reason, a.shareHold], ['Uses something from another chat, and Pete and Kim are not in it', 'Uses something from another chat, and Pete and Kim are not in it'], 'B30 names who is missing')
	assert.deepEqual(a.looked, undefined, 'no search, no searched rows')
})

test('R-PRO-05 a message that opens with a greeting gets one back with the first name; one that does not, does not', async () => {
	const { greetBack } = await import('../src/runner/dispatch.ts')
	const w = (lastAsk: string, name = 'Victoria Smith (ACME LTD)') => ({ lastAsk, asker: { id: 'v', name } }) as never
	assert.equal(greetBack(w('Hi, would appreciate a review here!'), 'Left one comment on the window.'), 'Hi Victoria, left one comment on the window.')
	assert.equal(greetBack(w('Hello Robin, quick one'), 'I left one comment.'), 'Hi Victoria, I left one comment.')
	assert.equal(greetBack(w('good morning team'), '@Victoria the build passed.'), 'Hi @Victoria the build passed.')
	assert.equal(greetBack(w('Hi there'), 'Hi Victoria, done.'), 'Hi Victoria, done.', 'never twice')
	assert.equal(greetBack(w('Can you review?'), 'Left one comment.'), 'Left one comment.', 'no greeting, none added')
	assert.equal(greetBack(w('Hight priority: review?'), 'Done.'), 'Done.', 'a word that starts with "hi" is not a greeting')
	assert.deepEqual([greetBack(w('Hi, is the deploy done?'), 'Azure deploy finished at 3 pm.'), greetBack(w('Hi'), 'Monday works for me.'), greetBack(w('Hi'), 'Victoria, yes it is done.')], ['Hi Victoria, Azure deploy finished at 3 pm.', 'Hi Victoria, Monday works for me.', 'Victoria, yes it is done.'], 'review: names and days keep their capital; a draft that already names them is left alone')
	assert.deepEqual([greetBack(w('Hello, ¿cómo va el despliegue?'), 'Hola Victoria, va bien.'), greetBack(w('Hi, deploy ho gaya?'), 'Namaste Victoria, ho gaya.'), greetBack(w('Hi'), 'Merged Victoria\'s fix.')], ['Hola Victoria, va bien.', 'Namaste Victoria, ho gaya.', 'Hi Victoria, merged Victoria\'s fix.'], 'a greeting in their language is not doubled')
	script = draft('Left one comment.')
	src.post(CHAT, 'me', '[as Kim] Hi, can you review PR 1?'); await go()
	assert.equal(store.byCode('A1')!.draft?.text, 'Hi Kim, left one comment.')
})

test('round 3 #6 missed <link> to your own old message offers it as work with what happened since; nothing to track says so; an old ask is found too', async () => {
	const dm = '19:me_dev@unq.gbl.spaces'
	src.listed.add(dm); src.post(dm, 'Dev', 'hi'); await go(); src.post('self', 'me', 'skip A1'); await go()
	const mine = src.post(dm, 'me', 'Deploy this to any test env, PR 1234567.')
	for (let i = 0; i < 55; i++) src.post(dm, i % 2 ? 'me' : 'Dev', `update ${i}`)
	await go()
	let prompt = ''
	script = (p, id) => { prompt = p; return { workflowId: id, intent: 'status_next_step', state: 'needs_human', summary: 'You own the deploy test', work: { goal: 'Deploy PR 1234567 to a test env and test it', doneWhen: 'tested', links: ['pr:1234567'] } } }
	src.post('self', 'me', `missed https://teams.microsoft.com/l/message/${encodeURIComponent(dm)}/${mine}`); await go()
	const a = store.workflows().find(w => w.startedBy === 'owner')!
	assert.match(src.chats.self.map(m => m.body).join('\n'), new RegExp(`Checking whether your message from [\\d-]+ started work you still own \\(${a.code}\\)`))
	assert.deepEqual([a.state, a.work?.proposed, store.thread(a.id).length, store.thread(a.id)[0].text, store.thread(a.id).at(-1)!.text], ['needs_human', true, 40, 'Deploy this to any test env, PR 1234567.', 'update 54'], 'the old message first, then the newest after it')
	assert.match(prompt, /pointed at their own message from [\d-]+; the messages after it are in the thread/)
	const thanks = src.post(dm, 'me', 'Thanks all!')
	script = (_, id) => ({ workflowId: id, intent: 'none', state: 'done', summary: 'a thank-you, no work' })
	src.post('self', 'me', `missed https://teams.microsoft.com/l/message/${encodeURIComponent(dm)}/${thanks}`); await go()
	assert.match(src.chats.self.at(-1)!.body, /: Nothing to track: a thank-you, no work$/)
	const old = '19:me_quiet@unq.gbl.spaces', ask = src.post(old, 'Lee', 'Robin, can you check the banner flag?')
	for (let i = 0; i < 60; i++) src.post(old, 'Lee', `later ${i}`)
	script = draft('It is in ring 0.')
	src.post('self', 'me', `missed https://teams.microsoft.com/l/message/${encodeURIComponent(old)}/${ask}`); await go()
	assert.equal(store.workflows().find(w => w.lastAsk === 'Robin, can you check the banner flag?')?.draft?.text, 'It is in ring 0.', 'an old ask beyond the newest 50 is found')
})

test('S13 an automation: proposed from chat, started with one ok, sent with the marker at its time, skipped while paused, ended by skip', async () => {
	const { propose, nextAt, dueAutomations } = await import('../src/runner/automations.ts')
	const fri = new Date(2026, 9, 23, 17, 0)
	assert.equal(nextAt({ every: 'weekday', at: '16:00' }, fri)!.toString(), new Date(2026, 9, 26, 16, 0).toString(), 'Friday after 4 pm: next is Monday')
	assert.equal(nextAt({ every: 'week', at: '09:30', day: 3 }, fri)!.toString(), new Date(2026, 9, 28, 9, 30).toString())
	const arun = 'arun-1on1'
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	store.save({ ...store.byCode('A1')!, id: 'w-arun', code: 'A99', chat: { id: arun, name: 'Arun', test: false, group: false }, asker: { id: 'arun', name: 'Arun Rao' } })
	assert.match(propose(store, { to: 'Nobody', text: 'x', every: 'day', at: '16:00' }), /^I can't find a chat with Nobody\./)
	assert.equal(propose(store, { to: 'arun', text: 'Reminder: please update the design doc.', every: 'weekday', at: '16:00' }),
		'R1 · Every weekday at 4:00 PM, send Arun Rao: "Reminder: please update the design doc.". Pauses when they reply. It goes out with your assistant\'s marker. Say "ok R1" to start it.')
	assert.match(act(store, 'ok R1'), /^R1 will start\./)
	await go()
	let a = store.automation('R1')!
	assert.equal(a.state, 'active')
	assert.equal(Date.parse(a.next!), nextAt(a.schedule, new Date(Date.parse(a.next!) - 1))!.getTime())
	src.chats[arun] = []
	const due = new Date(Date.parse(a.next!) + 1000)
	assert.equal(await dueAutomations(store, src, store.config(), due), 1)
	assert.equal(src.chats[arun].at(-1)!.body, "Reminder: please update the design doc.\n\n(sent by Robin's assistant)")
	assert.equal(await dueAutomations(store, src, store.config(), due), 0, 'once per time')
	a = store.automation('R1')!
	store.saveControl({ ...store.control(), paused: true })
	assert.equal(await dueAutomations(store, src, store.config(), new Date(Date.parse(a.next!) + 1000)), 0)
	assert.equal(src.chats[arun].length, 1, 'a pause skips that time')
	assert.ok(Date.parse(store.automation('R1')!.next!) > Date.parse(a.next!), 'and moves on, never sending late')
	store.saveControl({ ...store.control(), paused: false })
	src.post('self', 'me', 'pause R1'); await go()
	assert.equal(store.automation('R1')!.state, 'paused')
	src.post('self', 'me', 'skip R1'); await go()
	assert.match(src.chats.self.at(-1)!.body, /Ended R1\. Nothing more will be sent\./)
	assert.equal(store.automation('R1')!.state, 'ended')
})

test('S13 reminder parity: once, every 25 hours for 5 sends, two daily times, the three rotations, and asking for an end', async () => {
	const { scheduleOf, nextAt, textFor } = await import('../src/runner/automations.ts')
	const now = new Date(2026, 9, 20, 9, 0)
	const in1h = new Date(2026, 9, 20, 10, 0).toISOString()
	assert.deepEqual(scheduleOf({ to: 'x', every: 'once', start: in1h }, now), { every: 'once', start: in1h })
	assert.equal(scheduleOf({ to: 'x', every: 'once', start: new Date(2026, 9, 20, 8, 0).toISOString() }, now), 'That time has already passed.')
	const s = scheduleOf({ to: 'x', every: 'hours', hours: 25, start: in1h }, now)
	assert.deepEqual([nextAt(s as never, now), nextAt(s as never, new Date(2026, 9, 20, 10, 0))].map(d => d!.toString()), [new Date(2026, 9, 20, 10, 0).toString(), new Date(2026, 9, 21, 11, 0).toString()])
	const two = scheduleOf({ to: 'x', every: 'weekday', times: ['17:30', '10:00'] }, now)
	assert.deepEqual(two, { every: 'weekday', at: '10:00', times: ['17:30'] })
	assert.equal(nextAt(two as never, new Date(2026, 9, 20, 11, 0))!.toString(), new Date(2026, 9, 20, 17, 30).toString())
	assert.equal(nextAt(two as never, new Date(2026, 9, 23, 18, 0))!.toString(), new Date(2026, 9, 26, 10, 0).toString(), 'Friday evening: Monday 10 am')
	assert.equal(nextAt({ every: 'once', start: in1h }, new Date(2026, 9, 20, 10, 0)), undefined)
	assert.match(String(scheduleOf({ to: 'x', every: 'day', at: '25:00' }, now)), /is not a time/)
	const base = { schema: 1 as const, id: 'r', code: 'R1', kind: 'remind' as const, to: { chatId: CHAT, name: 'Ravi' }, text: 'a', texts: ['a', 'b', 'c'], schedule: { every: 'day' as const, at: '09:00' }, state: 'active' as const, createdAt: '', updatedAt: '' }
	const seq = (rotation: 'cycle' | 'repeat-last' | 'once-each') => [0, 1, 2, 3, 4].map(count => textFor({ ...base, rotation, count }))
	assert.deepEqual(seq('cycle'), ['a', 'b', 'c', 'a', 'b'])
	assert.deepEqual(seq('repeat-last'), ['a', 'b', 'c', 'c', 'c'])
	assert.deepEqual(seq('once-each').slice(0, 3), ['a', 'b', 'c'])
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	store.save({ ...store.byCode('A1')!, id: 'w-ravi', code: 'A98', chat: { id: 'ravi-1on1', name: 'Ravi', test: false, group: false }, asker: { id: 'ravi', name: 'Ravi Kumar' } })
	const { propose } = await import('../src/runner/automations.ts')
	assert.equal(propose(store, { to: 'ravi', text: 'ping', every: 'hours', hours: 2 }), 'When should it stop? Say a date, or how many times.')
	assert.match(propose(store, { to: 'ravi', texts: ['one', 'two'], rotation: 'once-each', every: 'hours', hours: 25, maxSends: 5 }), /^R\d+ · Every 25 hours.*, 5 times, send Ravi Kumar: 2 messages in order, then stop: "one" \/ "two"\. Pauses when they reply/)
})

test('S13 a sent reminder ends at maxSends, once-each ends after the last text, and a reply in the 1:1 pauses it with the reason', async () => {
	const { dueAutomations } = await import('../src/runner/automations.ts')
	const one = 'ravi-1on1'
	src.chats[one] = []
	store.saveConfig({ ...store.config(), watch: [...store.config().watch, { id: one, name: 'Ravi' }] })
	const t0 = Date.now() - 60_000
	const mk = (code: string, extra: object) => store.saveAutomation({ schema: 1, id: code, code, kind: 'remind', to: { chatId: one, name: 'Ravi' }, text: 'a', schedule: { every: 'hours', hours: 1, start: new Date(t0).toISOString() }, state: 'active', next: new Date(t0).toISOString(), count: 0, createdAt: '', updatedAt: '', ...extra })
	mk('R5', { maxSends: 1 })
	mk('R6', { texts: ['x', 'y'], rotation: 'once-each', count: 1 })
	assert.equal(await dueAutomations(store, src, store.config(), new Date()), 2)
	assert.deepEqual(['R5', 'R6'].map(c => store.automation(c)!.state), ['ended', 'ended'])
	assert.deepEqual(src.chats[one].map(m => m.body.split('\n')[0]), ['a', 'y'])
	mk('R8', { lastAt: new Date(t0 - 60_000).toISOString(), next: new Date(Date.now() + 3_600_000).toISOString() })
	mk('R9', { lastAt: new Date(t0 - 60_000).toISOString(), next: new Date(Date.now() + 3_600_000).toISOString(), stopOnReply: false })
	await go()
	src.post(one, 'ravi', 'Done, updated the doc.'); await go()
	assert.deepEqual([store.automation('R8')!.state, store.automation('R8')!.why, store.automation('R9')!.state], ['paused', 'ravi replied', 'active'])
	src.post('self', 'me', 'resume R8'); await go()
	assert.deepEqual([store.automation('R8')!.state, store.automation('R8')!.why], ['active', undefined])
})

test('B4 a reminder follows what the person says: done ends it, a time moves it, anything else keeps it; in a group only that person counts', async () => {
	const one = 'ravi-dm', grp = '19:team-r@thread.v2'
	src.chats[one] = []; src.chats[grp] = []
	store.saveConfig({ ...store.config(), watch: [...store.config().watch, { id: one, name: 'Ravi' }, { id: grp, name: 'Team', group: true }] })
	const t0 = Date.now() - 60_000, next = new Date(Date.now() + 3_600_000).toISOString(), at5 = new Date(Date.now() + 5 * 3_600_000)
	const mk = (code: string, chatId: string) => store.saveAutomation({ schema: 1, id: code, code, kind: 'remind', to: { chatId, name: 'Ravi Kumar' }, text: 'Please update the design doc', schedule: { every: 'hours', hours: 1, start: new Date(t0).toISOString() }, state: 'active', count: 1, lastAt: new Date(t0).toISOString(), next, createdAt: new Date(t0).toISOString(), updatedAt: new Date(t0).toISOString() } as never)
	const said: Record<string, string> = { 'Updated it just now.': 'done', "I'll do it at 5.": `later ${at5.toISOString()}`, 'Which doc?': 'keep' }
	let judged = 0
	script = (p, id) => {
		const m = /Their reply \([^)]*\): "([^"]*)"/.exec(p)
		if (/You decide what one reminder does/.test(p) && m) { judged++; return { workflowId: id, intent: 'none', state: 'done', summary: said[m[1]] ?? 'keep' } }
		return draft('Ok.')(p, id)
	}
	for (const [code, text] of [['R21', 'Updated it just now.'], ['R22', "I'll do it at 5."], ['R23', 'Which doc?']] as const) {
		const chat = `${one}-${code}`; src.chats[chat] = []; src.post(chat, 'me', 'Reminder: Please update the design doc')
		store.saveConfig({ ...store.config(), watch: [...store.config().watch, { id: chat, name: 'Ravi' }] })
		mk(code, chat); await go()
		src.post(chat, 'Ravi Kumar', text); await go()
	}
	assert.deepEqual([store.automation('R21')!.state, store.automation('R21')!.why], ['ended', 'Ravi said it is done'])
	assert.deepEqual([store.automation('R22')!.state, store.automation('R22')!.next], ['active', at5.toISOString()])
	assert.match(store.automation('R22')!.why!, /Ravi said .*; the next reminder moved/)
	assert.deepEqual([store.automation('R23')!.state, store.automation('R23')!.next, store.automation('R23')!.heard], ['active', next, undefined])
	src.post(grp, 'me', 'Reminder: Please update the design doc'); mk('R24', grp); await go()
	src.post(grp, 'Kim', 'I updated mine.'); await go()
	assert.equal(store.automation('R24')!.heard, undefined, 'someone else in the group is not Ravi answering')
	assert.equal(judged, 3)
	const { dueAutomations } = await import('../src/runner/automations.ts')
	const held = store.automation('R24')!; store.saveAutomation({ ...held, heard: { text: 'later maybe', from: 'Ravi', at: new Date().toISOString() }, next: new Date(Date.now() - 1000).toISOString() })
	assert.equal(await dueAutomations(store, src, store.config(), new Date()), 0, 'no send while a reply waits for a decision')
})

test('S13 the runner wakes for the next reminder instead of waiting for the idle poll', async () => {
	const now = Date.now()
	store.saveAutomation({ schema: 1, id: 'a1', code: 'R7', kind: 'remind', to: { chatId: CHAT, name: 'Ravi' }, text: 'x', schedule: { every: 'day', at: '16:00' }, state: 'active', next: new Date(now + 90_000).toISOString(), count: 0, createdAt: '', updatedAt: '' })
	store.saveConfig({ ...store.config(), poll: { idleMin: 30, fastMin: 1, fastForMin: 0 } })
	await go()
	assert.equal(store.schedule().nextAt, new Date(now + 90_000).toISOString())
})

test('review 085 P0-1 a text ok approves the revision that was displayed; a replacement drafted after it is shown first, never sent', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	await see('A1')
	script = (p, id) => ({ ...draft('Unseen private price: $50M.')(p, id), reply: { text: 'Unseen private price: $50M.', commitment: false, sources: [{ ref: 'mail', tier: 'private', origin: 'extracted' }] } })
	src.post(CHAT, 'me', '[as Ravi] And the price?'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	assert.ok(!src.chats[CHAT].some(m => m.body.includes('$50M')), 'the unseen replacement is not sent')
	assert.match(src.chats.self.at(-1)!.body, /A1 changed after you looked\. Nothing was sent or changed\. It now says: "Unseen private price: \$50M\."/)
	src.post('self', 'me', 'ok A1'); await go()
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Unseen private price: $50M.', 'after it was shown, ok sends it')
	src.post(CHAT, 'me', '[as Ana] Banner?'); await go()
	const code = store.workflows().find(w => w.asker?.name === 'Ana')!.code
	store.saveNotify({ ...store.notify(), lastNudgeAt: new Date().toISOString() })
	const shown = store.shown(); delete shown[code]; writeFileSync(join(store.root, 'state', 'shown.json'), JSON.stringify(shown))
	assert.match(act(store, `ok ${code}`), new RegExp(`^${code} \\(Ana`))
	await go()
	assert.ok(!src.chats[CHAT].some(m => m.body === 'It is in ring 0.' && m.id > src.chats[CHAT].find(x => x.body.includes('Banner?'))!.id))
	assert.match(store.takeReceipts().map(r => r.text).join('\n'), new RegExp(`Here is ${code} first\\. Nothing was sent\\.`))
})

test('review 085 P0-2 a guest who joins during the delay holds a labeled automatic send; a failed membership read holds it too', async () => {
	setRules(rule({ when: {} })); autoOn(); policy(5)
	script = (p, id) => ({ ...draft('Acquisition closes tomorrow.')(p, id), reply: { text: 'Acquisition closes tomorrow.', commitment: false, sources: [{ ref: join(KB, 'banner.md'), tier: 'card' as const, origin: 'extracted' as const, label: 'Confidential' }, { ref: 'wiki', tier: 'live' as const, origin: 'extracted' as const }] } })
	src.post(CHAT, 'me', '[as Ravi] Deal status?'); await go()
	assert.equal(store.byCode('A1')!.state, 'scheduled')
	src.guests = true
	store.save({ ...store.byCode('A1')!, sendAt: new Date(Date.now() - 1000).toISOString() })
	await go()
	assert.ok(!src.chats[CHAT].some(m => m.body.startsWith('Acquisition')))
	assert.equal(store.byCode('A1')!.state, 'needs_human')
	src.guests = false
	src.members = async () => { throw new Error('throttled') }
	src.post(CHAT, 'me', '[as Ravi] Deal status, again?'); await go()
	store.save({ ...store.byCode('A1')!, state: 'scheduled', sendAt: new Date(Date.now() - 1000).toISOString() })
	await go()
	assert.ok(!src.chats[CHAT].some(m => m.body.startsWith('Acquisition')))
})

test('review 085 P0-3 a stale copy never replaces newer history, and diverged histories are both kept and reported', async () => {
	const { backupSession, restoreSession } = await import('../src/runner/own.ts')
	const { home, id } = fakeSession()
	const local = join(home, 'session-state', id, 'events.jsonl'), shared = join(store.root, 'sessions', id, 'events.jsonl')
	backupSession(store, id)
	writeFileSync(shared, '{"type":"user.message"}\n{"turn":"from B"}\n')
	assert.equal(backupSession(store, id), false, 'an older local copy does not overwrite the shared one')
	assert.match(readFileSync(shared, 'utf8'), /from B/)
	writeFileSync(local, '{"type":"user.message"}\n{"turn":"from A, a longer local turn"}\n')
	assert.equal(restoreSession(store, id), false)
	assert.match(readFileSync(local, 'utf8'), /from A/, 'the local branch is kept')
	assert.ok(readdirSync(join(home, 'session-state', id)).some(f => f.startsWith('events.conflict-')), 'the other branch is kept beside it')
	assert.match(store.health()[`session:${id}`].text, /changed on two machines/)
	assert.equal(backupSession(store, id), false)
	assert.ok(readdirSync(join(store.root, 'sessions', id)).some(f => f.startsWith('events.conflict-')))
	assert.match(readFileSync(shared, 'utf8'), /from B/)
})

test('review 085 P0-4 continue on a second machine refuses an item already open elsewhere and leaves that claim alone', async () => {
	const { runWindow } = await import('../src/runner/continue.ts')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const wf = store.byCode('A1')!
	const claim = { machine: 'machine-a', pid: 4242, runId: 'run-a', since: new Date().toISOString() }
	store.setOpenWindow(wf.id, claim)
	assert.equal(runWindow(store, store.config(), 'A1'), 1)
	assert.deepEqual(store.openWindow(wf.id), claim)
})

test('review 085 P1-1 an open item quiet for longer than the quiet time stays for the owner; a new ask starts a new item from its summary', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const a1 = store.byCode('A1')!
	const old = new Date(Date.now() - 72 * 3_600_000).toISOString()
	store.saveThread(a1.id, store.thread(a1.id).map(m => ({ ...m, at: old })))
	src.post(CHAT, 'me', '[as Ravi] New topic: can you join the design review?'); await go()
	const a2 = store.byCode('A2')!
	assert.deepEqual([store.byCode('A1')!.state, a2.asker?.name, a2.lastAsk], ['needs_human', 'Ravi', 'New topic: can you join the design review?'])
	assert.match(a2.earlier!, /A1: Ravi asked "Status\?"/)
	assert.notEqual(a2.session.id, a1.session.id)
})

test('review 085 P1-2 retention also clears old job bodies, stored action results, and unused session backups', async () => {
	const { sweep } = await import('../src/store/retention.ts')
	const old = new Date(Date.now() - 40 * 86_400_000).toISOString()
	const now = new Date().toISOString()
	store.saveJob({ schema: 1, id: 'j-old', key: 'learn:A1', goal: 'Owner changed "secret draft" to "secret sent"', session: { agent: 'copilot', id: 'sess-old' }, state: 'done', purpose: 'work', parents: [], asks: ['Ravi: secret ask'], result: { summary: 'secret summary', reply: { text: 'secret reply', commitment: false, sources: [] }, effects: [] }, createdAt: old, updatedAt: old })
	writeFileSync(join(store.root, 'state', 'jobs', 'j-old.json'), JSON.stringify({ ...store.job('j-old'), updatedAt: old }))
	writeFileSync(join(store.root, 'state', 'outcomes.json'), JSON.stringify([{ id: 'a', text: 'secret outcome', at: old }, { id: 'b', text: 'fresh', at: now }]))
	for (const id of ['sess-old', 'sess-live']) { mkdirSync(join(store.root, 'sessions', id), { recursive: true }); writeFileSync(join(store.root, 'sessions', id, 'events.jsonl'), 'secret') }
	const { utimesSync } = await import('node:fs')
	for (const id of ['sess-old', 'sess-live']) utimesSync(join(store.root, 'sessions', id), new Date(old), new Date(old))
	const logs = join(process.env.DELEGATE_LOCAL!, 'sessions'), prov = join(store.root, 'state', 'provenance')
	for (const d of [logs, prov]) mkdirSync(d, { recursive: true })
	for (const f of [join(logs, 'run-old.log'), join(prov, 'r-old.json')]) { writeFileSync(f, 'secret'); utimesSync(f, new Date(old), new Date(old)) }
	for (const f of [join(logs, 'run-new.log'), join(prov, 'r-new.json')]) writeFileSync(f, 'fresh')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	store.save({ ...store.byCode('A1')!, session: { agent: 'copilot', id: 'sess-live' } })
	sweep(store, 30)
	assert.doesNotMatch(JSON.stringify(store.job('j-old')), /secret/)
	assert.equal(store.outcome('a'), undefined); assert.equal(store.outcome('b'), 'fresh')
	assert.deepEqual(readdirSync(join(store.root, 'sessions')), ['sess-live'], 'a session an open item still uses is kept')
	assert.deepEqual([readdirSync(logs).filter(f => f.startsWith('run-')), readdirSync(prov)], [['run-new.log'], ['r-new.json']], 'round 3 #5 old job logs on this machine and orphaned run records go too')
})

test('design verbs: "A1: 2" picks option 2 on an item with options; "ok A1 except 1" makes every change but the first', async () => {
	script = meetingReport
	src.post(CHAT, 'me', '[as Arun] Shall we meet at 3?'); await go()
	src.post('self', 'me', 'A1: 2'); await go()
	assert.equal(store.byCode('A1')!.draft?.text, 'Can we do this async? Send me the two questions.')
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?')
	effectTools(); script = needsJob(); jf.job = review
	await go(); await go()
	const code = store.workflows().find(w => w.asker?.name === 'Vikram')!.code
	jf.job = executed(1)
	await see(code)
	src.post('self', 'me', `ok ${code} except 1`); await go()
	assert.doesNotMatch(jf.starts.at(-1)!.prompt, /^0\. /m)
	assert.match(jf.starts.at(-1)!.prompt, /^1\. \{"system":"ado"/m)
})

test('design: the phone, the nudge, more, and the AI-chat inbox show a meeting, its conflict, and numbered options, never a blank draft', async () => {
	script = meetingReport
	src.post(CHAT, 'me', '[as Arun] Shall we meet at 3?'); await go()
	src.post('self', 'me', 'what needs me?'); await go()
	assert.match(src.chats.self.at(-1)!.body, /A1 Arun · pick one: 1 Meet at 4:00 instead · 2 Answer async/)
	src.post('self', 'me', 'more A1'); await go()
	const more = src.chats.self.at(-1)!.body
	assert.match(more, /Meeting: API changes · .* · 30 min\n⚠ 1:1 with Ana at 3:00\n1\. Meet at 4:00 instead\n2\. Answer async\nReply "A1: 1", or "A1: your own answer"\./)
	assert.doesNotMatch(more, /____/)
	const { inbox } = await import('../src/runner/proposals.ts')
	assert.match(inbox(store), /⚠ 1:1 with Ana at 3:00\n1\. Meet at 4:00 instead/)
})

test('design automations: a reminder follows the send policy: guests, the never list, and the hourly limit skip it with a reason', async () => {
	const { dueAutomations } = await import('../src/runner/automations.ts')
	policy(5, { maxAutoPerChatHour: 1 })
	const auto = (code: string, name: string) => store.saveAutomation({ schema: 1, id: code, code, kind: 'remind', to: { chatId: CHAT, name }, text: `hi ${name}`, schedule: { every: 'day', at: '09:00' }, state: 'active', next: new Date(Date.now() - 1000).toISOString(), count: 0, createdAt: '', updatedAt: '' })
	src.guests = true; auto('R1', 'Ravi')
	assert.equal(await dueAutomations(store, src, store.config()), 0)
	assert.match(store.health()['auto:R1'].text, /that chat has guests/)
	src.guests = false
	policy(5, { maxAutoPerChatHour: 1, never: [{ id: 'x', name: 'Ana' }] }); auto('R2', 'Ana')
	assert.equal(await dueAutomations(store, src, store.config()), 0)
	assert.match(store.health()['auto:R2'].text, /never list/)
	auto('R3', 'Sam'); auto('R4', 'Kim')
	assert.equal(await dueAutomations(store, src, store.config()), 1, 'the hourly limit holds the second')
	assert.match(Object.values(store.health()).map(h => h.text).join(' '), /already 1 automatic messages in that chat this hour/)
})

// Waiting on others (eval case R16, owner question 4).
const ownerAsks = (html: string) => { const id = src.post(CHAT, 'me', 'x'); Object.assign(src.chats[CHAT].find(m => m.id === id)!, { html: true, body: html }); return id }

// PM review of N1a, P1-5: the owner's @-ask in a chat with open work was both a W entry and a step on that work, unlinked,
// so the new page showed one thread twice.
test('bug 10-21 W entry: an owner\'s @-ask in a chat with open work belongs to that work, so the work\'s row carries it once', async () => {
	const { item } = await import('./fixture.ts')
	const { place, snapshot } = await import('../src/web/next.ts')
	const now = new Date().toISOString()
	item(store, 'A9', 'Lin Brook', 'Release sync', { state: 'open', status: 'In progress', chat: { id: CHAT, name: 'Release sync', test: false, group: true }, work: { goal: 'Error logs from Lin', doneWhen: 'the IDs are posted', steps: [{ at: now, what: 'Replied: on it.' }], links: [] } } as never)
	ownerAsks('<at id="0">Lin</at> Can you send the error logs?')
	await go()
	assert.deepEqual(store.waiting().map(w => [w.code, w.item]), [['W1', 'A9']], 'the W entry names the work it belongs to')
	assert.match(store.byCode('A9')!.work!.steps.at(-1)!.what, /error logs/, 'and the ask is a step on that work')
	const rows = place(snapshot(store)).filter(r => r.section !== 'done')
	assert.deepEqual(rows.map(r => [r.code, r.subjects.slice().sort()]), [['A9', ['A9', 'W1']]], 'one thread, one row')
	// An ask in a chat with no open work stays its own W entry.
	src.post('other-chat', 'me', 'x')
	const id = src.post('other-chat', 'me', 'x'); Object.assign(src.chats['other-chat'].find(m => m.id === id)!, { html: true, body: '<at id="0">Kim</at> Can you review the doc?' })
	await go()
	assert.equal(store.waiting().find(w => w.to[0] === 'Kim')?.item, undefined)
})

// Code review round 3, P2-2: only an ask that belongs to the work joins its row. "Kim, can you send the slides?" in a chat
// with a long incident open is its own row, with its own Draft a nudge; a reply to a work's message joins that work.
test('bug 10-21 W entry: an ask about something else in a chat with open work stays its own row; a reply picks the work it answers', async () => {
	const { item } = await import('./fixture.ts')
	const { place, snapshot } = await import('../src/web/next.ts')
	const now = new Date().toISOString(), chat = { id: CHAT, name: 'Team chat', test: false, group: true }
	item(store, 'A9', 'Lin Brook', 'Team chat', { state: 'open', status: 'In progress', chat, msgIds: ['m-a9'], work: { goal: 'A fix for incident 123', doneWhen: 'the vendor ships it', waitingOn: { who: 'Lin Brook', since: now }, steps: [{ at: now, what: 'Replied: on it.' }], links: ['incident:4512345'] } } as never)
	item(store, 'A10', 'Dev Moss', 'Team chat', { state: 'open', status: 'In progress', chat, msgIds: ['m-a10'], work: { goal: 'Ship the config change', doneWhen: 'it is live', steps: [{ at: now, what: 'Replied: on it.' }], links: [] } } as never)
	ownerAsks('<at id="0">Kim</at> Can you send the slides?')
	await go()
	assert.deepEqual(store.waiting().map(w => [w.to[0], w.item]), [['Kim', undefined]], 'not about either work: no link')
	const rows = place(snapshot(store)).filter(r => r.section !== 'done')
	assert.deepEqual(rows.find(r => r.subjects.includes('W1'))?.subjects, ['W1'], 'its own row')
	// A reply quotes the message it answers (Teams' reply blockquote): it belongs to that message's work.
	ownerAsks('<blockquote itemtype="http://schema.skype.com/Reply" itemid="m-a10"><strong>Dev Moss</strong><p>Config is ready</p></blockquote><at id="0">Kim</at> Can you review it before it ships?')
	// It names someone the work waits on: it belongs to that work.
	ownerAsks('<at id="0">Lin</at> Any news from the vendor?')
	// It names the work's link: it belongs to that work.
	ownerAsks('<at id="0">Sam</at> Can you check incident 4512345 today?')
	// To one work's asker, naming the other work: it could be either, so it stays its own row.
	ownerAsks('<at id="0">Dev</at> Does incident 4512345 block your change?')
	await go()
	assert.deepEqual(store.waiting().map(w => [w.to[0], w.item ?? '']), [['Kim', ''], ['Kim', 'A10'], ['Lin', 'A9'], ['Sam', 'A9'], ['Dev', '']])
})

// Code review round 4, P2-2: in a small chat with more than one open topic, the asker alone links nothing: "Kim, lunch?" in Kim's
// chat, where Kim's work and Kim's other question are open, stays its own row. A reply quote or the work's link still links it,
// and with one open topic the asker still does (the first bug 10-21 W entry test).
test('bug 10-21 W entry: with more than one open topic in the chat, an ask to the asker alone is its own row; a reply or a link still joins', async () => {
	const { item } = await import('./fixture.ts')
	const now = new Date().toISOString(), chat = { id: CHAT, name: 'Kim Lane', test: false, group: false }
	item(store, 'A9', 'Kim Lane', 'Kim Lane', { state: 'open', status: 'In progress', chat, msgIds: ['m-a9'], work: { goal: 'The Q3 deck for Acme', doneWhen: 'Kim has the deck', steps: [{ at: now, what: 'Replied: on it.' }], links: ['pr:2204'] } } as never)
	item(store, 'A10', 'Kim Lane', 'Kim Lane', { state: 'needs_human', chat, msgIds: ['m-a10'], lastAsk: 'Are you at the offsite on Friday?' } as never)
	ownerAsks('<at id="0">Kim</at> Lunch today?')
	ownerAsks('<blockquote itemtype="http://schema.skype.com/Reply" itemid="m-a9"><strong>Kim Lane</strong><p>Deck?</p></blockquote><at id="0">Kim</at> Can you send the numbers for it?')
	ownerAsks('<at id="0">Kim</at> Did PR 2204 go in?')
	await go()
	const ws = store.waiting()
	assert.deepEqual(ws.map(w => /Lunch|numbers|PR 2204/.exec(w.text)?.[0]), ['Lunch', 'numbers', 'PR 2204'])
	assert.deepEqual(ws.map(w => w.item ?? ''), ['', 'A9', 'A9'], 'lunch is its own row; the reply and the link join the work')
	// Two works match, one waiting on Kim and one she asked for: it could be either, so it stays its own row.
	item(store, 'A8', 'Dev Moss', 'Kim Lane', { createdAt: new Date(Date.now() - 7_200_000).toISOString(), state: 'open', status: 'In progress', chat, msgIds: ['m-a8'], work: { goal: 'Kim signs off the launch', doneWhen: 'signed off', waitingOn: { who: 'Kim Lane', since: now }, steps: [{ at: now, what: 'Replied: on it.' }], links: [] } } as never)
	ownerAsks('<at id="0">Kim</at> Any news?')
	await go()
	assert.equal(store.waiting().at(-1)!.item, undefined)
})

test('Q4 R16 the owner\'s @mention ask with no answer for a day shows under Waiting on others; follow up drafts a nudge for ok; an answer clears it', async () => {
	const { view } = await import('../src/web/view.ts')
	ownerAsks('<at id="0">Z</at> Can we start the release today? In your absence, no one was able to help.')
	ownerAsks('Thanks all, see you tomorrow.')
	ownerAsks('<at id="0">Ravi</at> FYI the doc is updated.')
	await go()
	const ws = store.waiting()
	assert.deepEqual(ws.map(w => [w.code, w.to, w.state]), [['W1', ['Z'], 'waiting']], 'only the @mention that asks for something')
	assert.equal(view(store, undefined).waiting.length, 0, 'not before a day has passed')
	store.saveWaiting(ws.map(w => ({ ...w, at: new Date(Date.now() - 25 * 3_600_000).toISOString() })))
	const v = view(store, undefined)
	assert.deepEqual([v.waiting.map(w => [w.code, w.to]), v.also.find(t => t.key === 'waiting')?.count], [[['W1', 'Z']], 1])
	const { inbox } = await import('../src/runner/proposals.ts')
	assert.match(inbox(store), /### Waiting on others\n- \*\*W1\*\* · you asked Z 25h ago: "Z Can we start the release today\?/)
	let prompt = ''
	script = (p, id) => { prompt = p; return draft('Hi Z, any update on starting the release? A couple of features are waiting on it.')(p, id) }
	src.post('self', 'me', 'nudge W1'); await go()
	assert.match(prompt, /This is a follow-up\. The message marked >> is the owner's own ask to Z, still unanswered\./)
	const item = store.workflows().find(w => w.followUp === 'Z')!
	assert.deepEqual([item.state, item.draft?.text, store.waiting()[0].state, store.waiting()[0].item], ['needs_human', 'Hi Z, any update on starting the release? A couple of features are waiting on it.', 'waiting', item.code])
	assert.ok(!src.chats[CHAT].some(m => m.body.startsWith('Hi Z')), 'nothing is sent before ok')
	assert.equal(view(store, undefined).waiting.length, 0, 'shown as its follow-up item, not twice')
	src.post('self', 'me', 'nudge W1'); await go()
	assert.match(src.chats.self.at(-1)!.body, new RegExp(`W1 already has a follow-up: ${item.code}\\.`))
	src.post('self', 'me', `skip ${item.code}`); await go()
	assert.deepEqual(view(store, undefined).waiting.map(w => w.code), [], 'not again at once')
	assert.deepEqual(view(store, undefined, new Date(Date.now() + 25 * 3_600_000)).waiting.map(w => w.code), ['W1'], 'a day after the follow-up closed, still waiting on Z')
	src.post(CHAT, 'me', '[as Z] Starting it now.'); await go()
	assert.equal(store.waiting()[0].state, 'answered', 'their answer clears it even after a follow-up')
})

test('Q4 a reply from the person asked clears the wait; skip drops it', async () => {
	ownerAsks('<at id="0">Ravi Kumar</at> can you share the rollout status?')
	ownerAsks('<at id="0">Ana</at> please review PR 12')
	await go()
	src.post(CHAT, 'me', '[as Ravi Kumar] It is in ring 1.'); await go()
	assert.deepEqual(store.waiting().map(w => [w.code, w.state]), [['W1', 'answered'], ['W2', 'waiting']])
	src.post('self', 'me', 'skip W2'); await go()
	assert.equal(store.waiting()[1].state, 'dismissed')
})

test('Q2 a reply in a channel thread the owner started becomes an item; without a mention elsewhere it is context; channel replies never send on their own', async () => {
	const mine = 'ch|T|19:prr@thread.tacv2|100', other = 'ch|T|19:prr@thread.tacv2|200'
	src.chats[mine] = []; src.chats[other] = []
	const lastAt = (id: string) => src.chats[id].at(-1)?.at ?? new Date(0).toISOString()
	Object.assign(src, { channelThreads: async (c: unknown) => ({ list: [{ id: mine, name: 'PR Reviews (thread)', lastAt: lastAt(mine), mine: true }, { id: other, name: 'PR Reviews (thread)', lastAt: lastAt(other), mine: false }], cache: c }) })
	await go()
	setRules(rule({ who: { accounts: [{ id: 'ravi', name: 'ravi' }] }, when: {} })); autoOn(); policy(0)
	src.post(mine, 'ravi', 'Approved, one nit on line 4.')
	src.post(other, 'ana', 'Who owns the rollout?')
	await go()
	const wf = store.workflows().find(w => w.chat.id === mine)!
	assert.deepEqual([wf.asker?.name, wf.state, wf.decision?.reason], ['ravi', 'needs_human', 'Channel replies always wait for you'])
	assert.ok(!store.workflows().some(w => w.chat.id === other), 'not addressed to the owner')
	assert.equal(src.chats[mine].length, 1, 'nothing posted in the channel')
})

test('live Q3 run: only knowledge folders that exist are passed to the AI CLI, which refuses to start otherwise', async () => {
	const { readDirs } = await import('../src/runner/dispatch.ts')
	assert.deepEqual(readDirs(store, store.config()), [KB])
	mkdirSync(join(store.root, 'knowledge'))
	assert.deepEqual(readDirs(store, store.config()), [KB, join(store.root, 'knowledge')])
})

test('a worker that ends with its report in task_complete instead of submit_report still gives the draft; a report for another item is ignored', async () => {
	const viaSummary = (id: (wfId: string) => string) => async (_: Config['agent'], i: { workflowId: string; prompt: string }) => {
		const r = { ...draft('It ships Thursday.')(i.prompt, i.workflowId), workflowId: id(i.workflowId) }
		return { exitCode: 0, ms: 1, summary: `Needs human.\n\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\`` }
	}
	src.post(CHAT, 'me', '[as Ravi] When does it ship?')
	await tick(store, { source: src, run: viaSummary(w => w), force: true })
	assert.deepEqual([store.byCode('A1')!.draft?.text, store.byCode('A1')!.state], ['It ships Thursday.', 'needs_human'])
	assert.ok(store.logs(1).some(e => e.event === 'worker' && e.salvaged))
	src.post(CHAT, 'me', '[as Ana] And the banner?')
	await tick(store, { source: src, run: viaSummary(() => 'someone-else'), force: true })
	const ana = store.workflows().find(w => w.asker?.name === 'Ana')!
	assert.equal(ana.status, 'The worker did not finish')
})

test('review p2-7 R02 R03 R06: a lost confirmation still uses a send; an overdue time past the end never sends; a skipped time never ends a count', async () => {
	const { dueAutomations } = await import('../src/runner/automations.ts')
	const one = 'ravi-1on1', t0 = Date.now() - 60_000
	src.chats[one] = []
	const mk = (code: string, extra: object) => store.saveAutomation({ schema: 1, id: code, code, kind: 'remind', to: { chatId: one, name: 'Ravi' }, text: 'a', schedule: { every: 'hours', hours: 1, start: new Date(t0).toISOString() }, state: 'active', next: new Date(t0).toISOString(), count: 0, createdAt: '', updatedAt: '', ...extra })
	const send = src.send.bind(src)
	src.send = async (c: string, t: string) => { await send(c, t); throw new Error('timeout') }
	mk('R2', { maxSends: 2 })
	for (let h = 0; h < 4; h++) {
		const a = store.automation('R2')!
		if (a.next) await dueAutomations(store, src, store.config(), new Date(Date.parse(a.next) + 1000))
	}
	src.send = send
	assert.deepEqual([src.chats[one].length, store.automation('R2')!.state, store.automation('R2')!.count], [2, 'ended', 2], 'two sends at most, though both confirmations were lost')
	src.chats[one] = []
	const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000)
	mk('R3', { next: threeDaysAgo.toISOString(), until: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10) })
	assert.equal(await dueAutomations(store, src, store.config()), 0)
	assert.deepEqual([src.chats[one].length, store.automation('R3')!.state], [0, 'ended'])
	mk('R6', { maxSends: 1 })
	store.saveControl({ ...store.control(), paused: true })
	await dueAutomations(store, src, store.config())
	store.saveControl({ ...store.control(), paused: false })
	const r6 = store.automation('R6')!
	assert.deepEqual([r6.state, r6.count, !!r6.next], ['active', 0, true], 'the skipped time moved on without using the one send')
	src.chats[one] = []
	mk('R7', { next: new Date(Date.now() - 2 * 3_600_000).toISOString() })
	assert.equal(await dueAutomations(store, src, store.config()), 0)
	assert.deepEqual([src.chats[one].length, store.automation('R7')!.count, Date.parse(store.automation('R7')!.next!) > Date.now()], [0, 0, true], 'two hours late: skipped, not sent late')
})

test('review p2-7 R04 R05: the end date and the times use the same local calendar; a spring-forward day keeps its valid time', async () => {
	const { nextAt, dueAutomations } = await import('../src/runner/automations.ts')
	const tz = process.env.TZ
	process.env.TZ = 'America/Los_Angeles'
	try {
		const t = nextAt({ every: 'day', at: '02:30', times: ['03:15'] }, new Date(2026, 2, 8, 0, 0))!
		assert.deepEqual([t.getHours(), t.getMinutes()], [3, 15], '03:15 exists that day and comes first')
		const one = 'ravi-1on1'
		src.chats[one] = []
		store.saveAutomation({ schema: 1, id: 'r4', code: 'R4', kind: 'remind', to: { chatId: one, name: 'Ravi' }, text: 'a', schedule: { every: 'day', at: '18:00' }, until: '2026-11-10', state: 'active', next: new Date(2026, 10, 9, 18, 0).toISOString(), count: 0, createdAt: '', updatedAt: '' })
		await dueAutomations(store, src, store.config(), new Date(2026, 10, 9, 18, 0, 5))
		const a = store.automation('R4')!
		assert.deepEqual([a.state, new Date(a.next!).getDate()], ['active', 10], 'Nov 10 at 6 pm is still on Nov 10 locally')
	} finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz }
})

test('review p2-7 R01 R07 R08 R15: a channel thread is never a reminder target; reply times compare as instants; edit replaces the series; the end date is checked', async () => {
	const { propose, dueAutomations, answerAutomation, describe, findChat } = await import('../src/runner/automations.ts')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const thread = 'ch|team|chan|123'
	store.save({ ...store.byCode('A1')!, id: 'w-th', code: 'A97', chat: { id: thread, name: 'PR Reviews', test: false, group: false }, asker: { id: 'zed', name: 'Zed Thread' } })
	assert.match(String(findChat(store, 'zed')), /^I can't find a chat with zed/)
	assert.equal(propose(store, { to: 'Zed', chatId: thread, text: 'x', every: 'day', at: '09:00' }), 'Reminders go to a person or a group chat, not a channel thread.')
	store.saveAutomation({ schema: 1, id: 'r9', code: 'R9', kind: 'remind', to: { chatId: thread, name: 'Zed' }, text: 'x', schedule: { every: 'day', at: '09:00' }, state: 'active', next: new Date(Date.now() - 1000).toISOString(), count: 0, createdAt: '', updatedAt: '' })
	src.chats[thread] = []
	assert.equal(await dueAutomations(store, src, store.config()), 0)
	assert.deepEqual([src.chats[thread].length, store.automation('R9')!.state], [0, 'ended'])
	const one = 'ravi-1on1'
	src.chats[one] = []
	store.saveConfig({ ...store.config(), watch: [...store.config().watch, { id: one, name: 'Ravi' }] })
	await go()
	src.post(one, 'ravi', 'older reply')
	const m = src.chats[one].at(-1)!
	m.at = m.at.replace(/\.\d{3}Z$/, 'Z')
	store.saveAutomation({ schema: 1, id: 'r8', code: 'R8', kind: 'remind', to: { chatId: one, name: 'Ravi' }, text: 'a', texts: ['a', 'b'], rotation: 'cycle', schedule: { every: 'day', at: '09:00' }, state: 'active', next: new Date(Date.now() + 3_600_000).toISOString(), lastAt: new Date(Date.parse(m.at) + 500).toISOString(), count: 0, createdAt: '', updatedAt: '' })
	await go()
	assert.equal(store.automation('R8')!.state, 'active', 'a reply 0.5 s before the last send does not pause it')
	answerAutomation(store, store.automation('R8')!, { id: 'x', at: new Date().toISOString(), code: 'R8', verb: 'edit', text: 'new words', surface: 'chat' })
	assert.match(describe(store.automation('R8')!), /send Ravi: "new words"\. Pauses/)
	assert.match(propose(store, { to: 'Ravi', chatId: one, text: 'x', every: 'day', at: '09:00', until: 'next friday' }), /is not a date\. Use YYYY-MM-DD/)
	assert.match(propose(store, { to: 'Ravi', chatId: one, text: 'x', every: 'day', at: '09:00', until: '2026-02-30' }), /is not a date/)
	assert.match(propose(store, { to: 'Ravi', chatId: one, text: 'x', every: 'day', at: '09:00', until: '2020-01-01' }), /after the end date 2020-01-01/)
})

test('a worker gets its own MCP server name, so the owner\'s installed "delegate" server never hides submit_report from it', async () => {
	const { workerMcp, WORKER_TOOLS, WORKER_SERVER } = await import('../src/runner/dispatch.ts')
	const { mcpConfigPath } = workerMcp(store, 'wf', 'run1')
	const servers = Object.keys(JSON.parse(readFileSync(mcpConfigPath, 'utf8')).mcpServers)
	assert.ok(!servers.includes('delegate') && servers.includes(WORKER_SERVER))
	assert.deepEqual(WORKER_TOOLS, ['delegate_worker-submit_report', 'delegate_worker-knowledge_search', 'delegate_worker-knowledge_read', 'delegate_worker-history_search', 'delegate_worker-doc_read', 'delegate_worker-image_read'])
})

test('a PR review may carry a vote for ok; completing or abandoning becomes a to-do; comments stay', async () => {
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, effectTools: ['ado-comment', 'ado-repo_pull_request_write:vote'] } })
	script = needsJob({ key: 'pr:org/repo/1001', goal: 'Review PR 1001' })
	const pr = (action: string, more: Record<string, unknown> = {}) => ({ tool: 'ado-repo_pull_request_write', args: { action, repositoryId: 'repo', pullRequestId: 1001, ...more } })
	jf.job = (_, id) => ({ workflowId: id, intent: 'pr_review', state: 'needs_human', summary: 'Ready to approve', reply: { text: 'Looks good, approved.', commitment: false, sources: [] }, effects: [
		{ system: 'ado', action: 'comment', target: 'PR 1001', summary: 'Null check in X', call: { tool: 'ado-comment', args: { pullRequestId: 1001, content: 'Null check' } } },
		{ system: 'ado', action: 'approve', target: 'PR 1001', summary: 'Approve PR 1001', call: pr('vote', { vote: 'Approved' }), head: 'abc' },
		{ system: 'ado', action: 'complete', target: 'PR 1001', summary: 'Merge PR 1001', call: pr('update', { autoComplete: true }) },
		{ system: 'ado', action: 'abandon', target: 'PR 1001', summary: 'Abandon PR 1001', call: pr('update', { status: 'Abandoned' }) }] })
	src.post(CHAT, 'me', '[as Vikram] Can you approve PR 1001?'); await go(); await go()
	assert.match(jf.starts[0].prompt, /Changes a separate run may make after the owner's ok, for `effects` \(tool, or tool:action\):\n- ado-comment\n- ado-repo_pull_request_write:vote: cast the owner's vote on a pull request/, 'the review is told which changes it may propose')
	const wf = store.byCode('A1')!
	assert.deepEqual(wf.effects?.map(e => e.action), ['comment', 'approve'])
	assert.deepEqual(wf.todos, ['Merge PR 1001. Not made for you: Delegate never completes, merges, abandons, bypasses, or deletes', 'Abandon PR 1001. Not made for you: Delegate never completes, merges, abandons, bypasses, or deletes'])
})

test('"review it again" a day later reaches the same job and AI session, even when the PR key is spelled differently', async () => {
	const { canonicalKey } = await import('../src/runner/jobs.ts')
	assert.deepEqual(['pr:acme/web-app/1707317', 'PR:Acme/Platform/Web-App/1707317', ' pr:acme/1707317 ', 'workItem:5153281'].map(canonicalKey), ['pr:acme/1707317', 'pr:acme/1707317', 'pr:acme/1707317', 'workitem:5153281'])
	script = needsJob({ key: 'pr:acme/web-app/1707317', goal: 'Review PR 1707317' }); jf.job = review
	src.post(CHAT, 'me', '[as Noah] Review PR 1707317 please'); await go(); await go()
	assert.equal(store.jobs().length, 1)
	const first = jf.starts[0].sessionId
	store.saveJob({ ...store.jobs()[0], updatedAt: new Date(Date.now() - 86_400_000).toISOString() })
	script = needsJob({ key: 'PR:Acme/Platform/Web-App/1707317', goal: 'Re-review PR 1707317' })
	src.post(CHAT, 'me', '[as Noah] I pushed changes, review it again'); await go()
	assert.deepEqual([store.jobs().length, jf.starts.length, jf.starts[1].sessionId], [1, 2, first], 'one job, resumed in the same session')
	assert.match(jf.starts[1].prompt, /Noah: Review PR 1707317 please\n- Noah: I pushed changes, review it again/)
})

test('after a restart, a job whose process ID now belongs to another program is never killed; it resumes in its session', async () => {
	script = needsJob(); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go()
	const j = store.jobs()[0], session = j.session.id
	store.saveJob({ ...j, run: { ...j.run!, startedAt: new Date(Date.now() - 400 * 86_400_000).toISOString() } })
	await go()
	assert.deepEqual(jf.killed, [], 'the reused process ID is left alone')
	assert.deepEqual([store.jobs()[0].state, jf.starts.length, jf.starts[1].sessionId], ['running', 2, session], 'restarted in the same session')
	const k = store.jobs()[0]
	store.saveJob({ ...k, run: { ...k.run!, machine: 'other-vm', startedAt: new Date(Date.now() - 2 * 60_000).toISOString() } })
	await go()
	assert.deepEqual([jf.killed, store.jobs()[0].state], [[], 'running'], 'a run on another machine is not ours to stop or fail early')
})

test('with nothing running in the background, bootstrap says it only queued, and the page says waiting, not learning', async () => {
	const { startBootstrap } = await import('../src/runner/bootstrap.ts')
	const { bootLines } = await import('../src/runner/proposals.ts')
	assert.match(startBootstrap(store, ['chats'], false), /^Queued reading your Teams chats\. Nothing reads them yet, because Delegate is not running in the background on any machine\./)
	assert.deepEqual(bootLines(store).map(b => b.what), ['Waiting to learn from your Teams chats'])
	writeFileSync(join(store.root, 'state', 'runner.json'), JSON.stringify({ machine: 'mac', at: new Date(Date.now() - 3_600_000).toISOString() }))
	assert.equal(store.runnerLive(), false, 'the last cycle was an hour ago')
	await go()
	assert.equal(store.runnerLive(), true, 'a cycle that ran marks the runner live')
})

test('mistakes go to the OneDrive feedback log: a worker with no report, a failed job, an edited draft, a skipped draft, a health problem, and the owner\'s own report', async () => {
	const { summary } = await import('../src/store/feedback.ts')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'send A1: It ships Thursday after the ring 1 check.'); await go()
	src.post(CHAT, 'me', '[as Ana] Banner?')
	await tick(store, { source: src, run: async () => ({ exitCode: 0, ms: 1 }), procs, force: true })
	const ana = store.workflows().find(w => w.asker?.name === 'Ana')!
	src.post(CHAT, 'me', '[as Bo] Logs?'); await go()
	const bo = store.workflows().find(w => w.asker?.name === 'Bo')!
	src.post('self', 'me', `skip ${bo.code}`); await go()
	store.setHealth('x', 'Cannot reach chats'); store.setHealth('x', 'Cannot reach chats')
	store.log({ event: 'feedback', code: 'A1', text: 'It should have asked me first.' })
	store.log({ event: 'job-failed', key: 'pr:org/1', error: 'Stopped after 30 minutes' })
	const ls = store.lessons()
	assert.deepEqual(ls.map(l => [l.kind, l.code ?? '', l.what.slice(0, 40)]), [
		['correction', 'A1', 'You changed the draft before sending.'],
		['error', ana.code, 'The worker finished without a report.'],
		['correction', bo.code, 'You skipped the drafted reply.'],
		['error', '', 'Cannot reach chats'],
		['report', 'A1', 'It should have asked me first.'],
		['error', '', 'The job for pr:org/1 failed: Stopped aft'],
	], 'a repeated health problem is logged once')
	assert.deepEqual(ls[0].detail, { chat: store.byCode('A1')!.chat.id, intent: store.byCode('A1')!.intent, asker: { id: 'test:ravi', name: 'Ravi' }, draft: 'It is in ring 0.', sent: 'It ships Thursday after the ring 1 check.', confidence: store.byCode('A1')!.decision?.confidence })
	assert.ok(existsSync(join(store.root, 'feedback', 'mac.jsonl')), 'one file per machine, in the storage folder')
	assert.match(summary(ls), /^Last 7 days: 3 errors, 2 corrections by you, 1 problems you reported\./)
})

test('B3 reading chats: code finds every conversation the owner wrote in, splits them into parts, and each part runs as its own job; a failed search waits for the next cycle', async () => {
	const { startBootstrap, pack } = await import('../src/runner/bootstrap.ts')
	const c = (id: string, mine: number, team?: string) => ({ id, mine, lastAt: '2026-10-10T10:00:00Z', ...(team ? { team } : {}) })
	assert.deepEqual(pack([c('a', 50), c('b', 280), c('c', 30), c('d', 400)], 300, 12).map(p => p.map(x => x.id)), [['d'], ['b'], ['a', 'c']], 'biggest first, about 300 of the owner\'s messages a part')
	assert.equal(pack(Array.from({ length: 30 }, (_, i) => c(`x${i}`, 1)), 300, 12).length, 3, 'at most 12 conversations a part')
	let fail = true
	const seen: string[] = []
	const history = { search: async () => [], close: async () => {}, conversations: async (since: string) => { seen.push(since); if (fail) throw new Error('throttled'); return [c('19:big@thread.v2', 400), c('19:x@unq.gbl.spaces', 20), c('19:ch@thread.tacv2', 5, 'team-1')] } }
	const cycle = () => tick(store, { source: src, run, procs, force: true, history })
	startBootstrap(store, ['chats']); jf.job = () => undefined
	await cycle()
	assert.deepEqual([jf.starts.length, store.jobs().find(j => j.key === 'bootstrap:chats')?.state], [0, 'queued'], 'a failed search starts nothing and keeps the plan')
	assert.ok(store.logs(1).some(e => e.event === 'harvest-plan-failed'))
	fail = false
	await cycle()
	const parts = store.jobs().filter(j => j.key.startsWith('bootstrap:chats:')).sort((a, b) => a.key.localeCompare(b.key))
	assert.deepEqual(parts.map(j => j.label), ['your Teams chats, part 1 of 2', 'your Teams chats, part 2 of 2'])
	assert.match(parts[1].goal, /Read these 2 Teams conversations from \d{4}-\d{2}-\d{2} on[\s\S]*- chat 19:x@unq\.gbl\.spaces \(20 by the owner, last 2026-10-10\)\n- channel 19:ch@thread\.tacv2 in team team-1 \(5 by the owner/)
	assert.equal(jf.starts.length, 2, 'both parts started; the plan itself never runs as an AI job')
	assert.match(store.jobs().find(j => j.key === 'bootstrap:chats')!.result!.summary, /^Found 3 conversations you wrote in since .*; reading them in 2 parts\.$/)
	const today = new Date().toISOString().slice(0, 10)
	assert.equal(store.sources()['bootstrap:chats'], today)
	startBootstrap(store, ['chats']); await cycle()
	assert.equal(seen.at(-1), today, 'the next read starts where this one ended')
})

test('B3 weekly learning tops up the history read at install, never before a first read and never twice at once', async () => {
	const { weeklyLearning } = await import('../src/runner/daily.ts')
	assert.equal(weeklyLearning(store), false, 'no first read yet')
	store.saveSource('bootstrap:chats', new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10))
	assert.equal(weeklyLearning(store), false, 'less than a week')
	store.saveSource('bootstrap:chats', new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10))
	assert.equal(weeklyLearning(store), true)
	assert.deepEqual(store.jobs().map(j => j.key).sort(), ['bootstrap:chats', 'bootstrap:prs', 'bootstrap:workitems'])
	assert.equal(weeklyLearning(store), false, 'one is still queued')
})

test('after a restart, a window opened before it is taken back even when its process ID is in use again', async () => {
	const { uptime } = await import('node:os')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const wf = store.byCode('A1')!
	// Pid 7777 is alive in this fixture, as an unrelated program that reused it after the restart would be.
	store.setOpenWindow(wf.id, { machine: 'mac', pid: 7777, runId: 'r1', since: new Date(Date.now() - 31 * 86_400_000).toISOString() })
	await go()
	assert.equal(store.byCode('A1')!.openOn, undefined)
	assert.match(store.byCode('A1')!.status, /^Back from your window/)
	assert.equal(store.openWindows().length, 0)
})

test('dogfood 10-20: a reply that names someone in the chat with @ tags them when it is sent', async () => {
	const g = '19:caps@thread.v2', cid = '00000003-aaaa-bbbb-cccc-000000000000'
	src.listed.add(g)
	const me = store.config().owner.id
	src.memberIds[g] = [me, 'Zhu', cid]; src.memberNames[g] = { [me]: 'Robin Lee', Zhu: 'Zhu Li', [cid]: 'Christian Munden' }
	script = draft('Yes, after publishing too.')
	src.post(g, 'Zhu', 'Hi Robin, can they request more capacity after publishing?'); await go()
	const a = store.workflows().at(-1)!
	store.saveMembers({ ...store.members(), [g]: { ids: [me, 'Zhu', cid], at: new Date().toISOString() } })
	src.post('self', 'me', `send ${a.code}: Yes. @Christian to chime in on the button? cc @Robin`); await go()
	assert.ok(store.byCode(a.code!)!.sent, 'sent')
	assert.deepEqual((src.lastOpts as { mentions: { id: string }[] }).mentions.map(m => m.id), [cid])
})

test('dogfood: replies in group and meeting chats carry the ask and tag every asker with a real account; 1:1 replies carry nothing', async () => {
	const { replyContext } = await import('../src/runner/apply.ts')
	const id = (n: number) => `0000000${n}-aaaa-bbbb-cccc-000000000000`
	const wf = { chat: { id: '19:meeting_x@thread.v2', name: 'Release', test: false, group: true }, asker: { id: id(1), name: 'Lee Park' }, askers: [{ id: id(2), name: 'David Cam' }, { id: id(1), name: 'Lee Park' }, { id: 'test:bo', name: 'Bo' }], lastAsk: 'May we have your update on this incident?' } as never
	assert.deepEqual(replyContext(wf), { replyTo: { name: 'Lee Park', text: 'May we have your update on this incident?' }, mentions: [{ id: id(1), name: 'Lee Park' }, { id: id(2), name: 'David Cam' }] })
	assert.equal(replyContext({ chat: { id: '19:a_b@unq.gbl.spaces', name: 'Alan', test: false }, asker: { id: id(1), name: 'Alan' }, lastAsk: 'hi' } as never), undefined)
	const members = { [id(3)]: 'Christian Munden', [id(4)]: 'Chris Lee', [id(5)]: 'Kim Ito' }
	assert.deepEqual(replyContext(wf, '@Christian to chime in? Thanks @Kim Ito.', members)?.mentions, [{ id: id(1), name: 'Lee Park' }, { id: id(2), name: 'David Cam' }, { id: id(3), name: 'Christian Munden' }, { id: id(5), name: 'Kim Ito' }], 'dogfood 10-20: anyone in the chat named with @ is tagged; @Christian is not Chris')
	assert.deepEqual(replyContext(wf, '@Chris and @Chris Lee', { ...members, [id(6)]: 'Chris Wu' })?.mentions?.slice(2), [{ id: id(4), name: 'Chris Lee' }], 'a first name two people share tags nobody; the full name tags one')
	assert.deepEqual(replyContext(wf, 'cc @Kim', { [id(5)]: 'Kim Ito', [id(7)]: 'Robin Park' }, id(7))?.mentions?.slice(2), [{ id: id(5), name: 'Kim Ito' }], 'never the owner')
	assert.deepEqual(replyContext(wf, 'thanks @Robin', { [id(7)]: 'Robin Park' }, id(7))?.mentions?.slice(2), [], 'the owner naming themselves tags nobody')
})

test('dogfood: two people in one chat asking for the same update become one item that answers and tags both', async () => {
	const prompts: string[] = []
	script = (p, id) => { prompts.push(p); const n = prompts.length; return n === 2 ? { ...draft('x')(p, id), reply: undefined, same: 'A1' } : draft(n === 1 ? 'Looking into the incident; update by 5.' : '@Ravi @Ana looking into the incident; update by 5.')(p, id) }
	src.post(CHAT, 'me', '[as Ravi] May we have your update on this incident?'); await go()
	src.post(CHAT, 'me', '[as Ana] Any ETA on the incident? The customer is asking.'); await go()
	assert.match(prompts[1], /Other open items in this chat\. If the new message asks for the same thing as one of them[\s\S]*- A1 · Ravi: "May we have your update on this incident\?"/)
	await go()
	const a1 = store.byCode('A1')!, a2 = store.byCode('A2')!
	assert.deepEqual([a2.state, a2.status], ['done', 'Joined A1: the same ask'])
	assert.deepEqual([a1.askers?.map(p => p.name), a1.draft?.text], [['Ana'], '@Ravi @Ana looking into the incident; update by 5.'])
	assert.match(prompts[2], /Asker: Ravi, Ana\./)
	assert.deepEqual(store.workflows().filter(w => w.state !== 'done').map(w => w.code), ['A1'], 'one item needs the owner, not two')
})

test('dogfood: learned facts are saved by themselves with their sources and an undo; the page shows them under Done, and progress as one line', async () => {
	const { bootLines } = await import('../src/runner/proposals.ts')
	const { view } = await import('../src/web/view.ts')
	jf.job = () => undefined
	const at = new Date().toISOString()
	const part = (n: number, state: 'done' | 'running' | 'queued') => store.saveJob({ schema: 1, id: `p${n}`, key: `bootstrap:chats:2026-10-19:${n}`, goal: 'g', label: `your Teams chats, part ${n} of 3`, session: { agent: 'copilot', id: `s${n}` }, state, purpose: 'work', parents: [], asks: [], createdAt: at, updatedAt: at, ...(state === 'running' ? { run: { id: `r${n}`, pid: 9000 + n, startedAt: at, machine: 'mac', purpose: 'work', asks: 0 } } : {}) })
	part(1, 'done'); part(2, 'running'); part(3, 'queued')
	assert.deepEqual(bootLines(store).map(b => b.what), ['Learning from your Teams chats: 1 of 3 parts done, 1 reading now'])
	store.writeReport({ workflowId: 'p2', intent: 'other', state: 'done', summary: 'Read 4 chats', claims: [
		{ topic: 'Starter pack', type: 'fact', text: 'The admin API base is https://admin.example.com/api.', src: [{ link: 'https://teams.microsoft.com/l/message/19:m@thread.v2/1', date: '2026-10-09', who: 'Tian' }] },
	] }, 'r2')
	jf.dead.add(9002)
	await go()
	const p = store.proposals()[0]
	assert.deepEqual([p.state, p.status], ['applied', 'Saved 1 to Starter pack'], 'saved without asking')
	const v = view(store, new Date(Date.now() - 60_000).toISOString())
	assert.deepEqual([v.knowledge.length, v.tiles.find(t => t.key === 'learned')?.label], [0, 'Learned 1 fact'])
	assert.match(v.done.find(r => r.kind === 'learned')!.sentence, /^Learned 1 fact about Starter pack, from your Teams chats, part 2 of 3$/)
	src.post('self', 'me', `undo ${p.code}`); await go()
	assert.deepEqual([store.proposals()[0].state, store.proposals()[0].status], ['dropped', 'Undone by you'], 'undo takes it back')
	const { knowledgeOf } = await import('../src/runner/proposals.ts')
	assert.equal(knowledgeOf(store, store.config()).search('MAC API base').length, 0, 'and the fact is gone')
})

// Next action (reviews/eng-next-action.md, slice 1): a reply that promises a PR vote casts it after the owner's ok, then sends.
const PR_URL = 'https://dev.azure.com/acme/Globex/_git/web/pullrequest/4200001'
const voteCall = (id = 4200001, vote = 'Approved') => ({ tool: 'ado-repo_pull_request_write', args: { action: 'vote', project: 'Globex', repositoryId: 'web', pullRequestId: id, vote } })
type Eff = NonNullable<Report['effects']>[number]
const pendingOf = (w: { effects?: Eff[] }) => (w.effects ?? []).filter(e => !e.done && !e.off)
const voteEffect = (over: Partial<Eff> = {}): Eff => ({ system: 'ado', action: 'approve', target: 'PR 4200001', summary: 'Approve PR 4200001', call: voteCall(), head: 'c0ffee1', ...over })
const promise = (effects: Eff[] = [voteEffect()], text = 'Description looks good now. No remaining blockers from my review; approved.') => (_: string, workflowId: string): Report =>
	({ workflowId, intent: 'commitment_decision', state: 'needs_human', summary: 'Ready to approve', reply: { text, commitment: true, sources: [{ ref: PR_URL, tier: 'live', origin: 'extracted' }] }, effects })
type PrNow = { status: string; votes: { name: string; vote: number }[]; head?: string; title?: string; author?: string; required?: string[]; autoComplete?: boolean; merge?: string; branch?: string; repo?: string }
let prNow: PrNow
const prReads: number[] = []
const prProbe = { builds: async () => new Map(), pr: async (_p: string, _r: string, id: number) => { prReads.push(id); return prNow } }
const goPr = () => tick(store, { source: src, run, procs, force: true, history: noList, probe: prProbe })
// The server command does not exist: a tick without the fake PR read can never reach a real Azure DevOps.
const voteSetup = (effectTools = ['ado-repo_pull_request_write:vote']) => {
	prNow = { status: 'active', votes: [{ name: 'Robin Park', vote: 0 }], head: 'c0ffee1', title: 'Fix the banner', author: 'Dev Rao', required: [], autoComplete: false }
	prReads.length = 0
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, tools: ['ado-repo_pull_request'], effectTools, mcpServers: { ado: { command: 'delegate-test-no-such-server' } } } })
}
// The executor run: it calls make_change for each index, as the AI would, then reports.
const calls: { server: string; tool: string; args: Record<string, unknown> }[] = []
const ado = async (server: string, tool: string, args: Record<string, unknown>) => { calls.push({ server, tool, args }); return { id: 'vote-1' } }
const makeChanges = async (indexes: number[], caller = ado) => {
	const { makeChange } = await import('../src/runner/change.ts')
	const job = store.jobs().find(j => j.purpose === 'execute' && j.run)!
	const out = [] as { ref?: string; error?: string }[]
	for (const i of indexes) out.push(await makeChange(store, job.id, job.run!.id, i, caller, prProbe))
	store.writeReport({ workflowId: job.id, intent: 'other', state: 'done', summary: 'Made the changes' }, job.run!.id)
	jf.dead.add(job.run!.pid)
	return out
}

test('bug 10-20 A34 vote: an approved reply that promises approval casts the vote, then sends', async () => {
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	const asked = src.chats[CHAT].length
	let wf = store.byCode('A1')!
	assert.deepEqual(wf.effects?.map(e => e.summary), ['Approve PR 4200001'], 'the promised vote is a change for the ok, not dropped')
	assert.equal(wf.todos, undefined)
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	const exec = jf.starts.at(-1)!
	assert.ok(!exec.tools.some(t => t.startsWith('ado-repo_pull_request_write')), 'the executor holds no raw write tool')
	assert.ok(exec.extraTools?.some(t => /make_change$/.test(t)), 'it holds make_change')
	assert.equal(src.chats[CHAT].length, asked, 'nothing sent before the vote')
	await makeChanges([0]); await goPr()
	wf = store.byCode('A1')!
	assert.deepEqual(calls.map(c => [c.server, c.tool, c.args.action, c.args.pullRequestId, c.args.vote]), [['ado', 'repo_pull_request_write', 'vote', 4200001, 'Approved']], 'exactly the approved call')
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Description looks good now. No remaining blockers from my review; approved.')
	assert.deepEqual([wf.state, wf.prVote], ['done', 10], "sent, and Delegate's own vote is recorded")
	const { makeChange } = await import('../src/runner/change.ts')
	assert.deepEqual(await makeChange(store, wf.job!, 'later', 0, ado, prProbe), { ref: 'vote-1' }, 'a change already made returns its result, never a second call')
	assert.equal(calls.length, 1)
})

test("bug 10-21 A48: after a review with no changes, the owner's answer \"I'll approve\" becomes a vote that ok casts, not \"out of date\"", async () => {
	voteSetup(); calls.length = 0
	script = needsJob({ key: 'pr:acme/web/4200001', goal: 'Re-review PR 4200001' })
	jf.job = (_, id) => ({ workflowId: id, intent: 'pr_review', state: 'needs_human', summary: 'All findings fixed', reply: { text: 'Rechecked, all three findings are fixed.', commitment: false, sources: [{ ref: PR_URL, tier: 'live', origin: 'extracted' }] } })
	src.post(CHAT, 'me', `[as Kim] Fixed all three, can you take another look? ${PR_URL}`); await goPr(); await goPr()
	assert.deepEqual([store.byCode('A1')!.state, pendingOf(store.byCode('A1')!).length], ['needs_human', 0], 'the review result proposes no change')
	script = promise([voteEffect()], "Looks good to me. I've approved the PR.")
	src.post('self', 'me', "A1: Looks good to me. I'll approve the PR."); await goPr()
	assert.deepEqual(pendingOf(store.byCode('A1')!).map(e => e.summary), ['Approve PR 4200001'], 'the answer became a vote for ok')
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	assert.match(src.chats.self.at(-1)!.body, /Before you ok A1: Approve PR 4200001/, 'what the vote means is shown first')
	src.post('self', 'me', 'ok A1'); await goPr()
	assert.doesNotMatch(src.chats.self.map(m => m.body).join('\n'), /out of date/)
	await makeChanges([0]); await goPr()
	assert.deepEqual(calls.map(c => [c.args.action, c.args.pullRequestId, c.args.vote]), [['vote', 4200001, 'Approved']], 'the vote was cast')
	assert.equal(src.chats[CHAT].at(-1)!.body, "Looks good to me. I've approved the PR.", 'then the reply went out')
})

test('bug 10-21 A48: a new message during the change run stops it; the redrafted change is what the next ok makes, and the old reply is not sent', async () => {
	voteSetup(); calls.length = 0
	script = needsJob({ key: 'pr:acme/web/4200001', goal: 'Re-review PR 4200001' })
	jf.job = (_, id) => ({ workflowId: id, intent: 'pr_review', state: 'needs_human', summary: 'All findings fixed', reply: { text: 'Rechecked, all fixed.', commitment: false, sources: [{ ref: PR_URL, tier: 'live', origin: 'extracted' }] } })
	src.post(CHAT, 'me', `[as Kim] Fixed all three, can you take another look? ${PR_URL}`); await goPr(); await goPr()
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, effectTools: ['ado-comment', 'ado-repo_pull_request_write:vote'] } })
	script = promise([NOTE, voteEffect()], "Left a comment. I've approved the PR.")
	src.post('self', 'me', "A1: Looks good. I'll approve the PR."); await goPr()
	jf.job = () => undefined
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr(); src.post('self', 'me', 'ok A1'); await goPr()
	const job = store.job(store.byCode('A1')!.job!)!
	assert.deepEqual([job.purpose, job.state], ['execute', 'running'], 'the change run is making the changes')
	const { makeChange } = await import('../src/runner/change.ts')
	await makeChange(store, job.id, job.run!.id, 0, ado, prProbe)
	script = promise([NOTE, voteEffect({ summary: 'Approve PR 4200001 with suggestions', call: voteCall(4200001, 'ApprovedWithSuggestions') })], 'Left a comment. Approved with suggestions.')
	src.post(CHAT, 'me', '[as Kim] One more small change, please re-approve'); await goPr()
	assert.deepEqual([store.job(job.id)!.purpose, calls.map(c => c.args.content ?? c.args.vote)], ['work', ['Null check']], 'the run stopped after the comment, before the vote')
	assert.deepEqual(pendingOf(store.job(job.id)!.result!).map(e => e.call?.args.vote ?? e.call?.args.content), ['ApprovedWithSuggestions'], 'the job holds the redrafted vote, and the comment as made')
	assert.deepEqual(pendingOf(store.byCode('A1')!).map(e => e.summary), ['Approve PR 4200001 with suggestions'], 'so does the item')
	assert.doesNotMatch(src.chats[CHAT].map(m => m.body).join('\n'), /approved/i, 'no reply went out on the old ok')
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr(); src.post('self', 'me', 'ok A1'); await goPr()
	assert.doesNotMatch(src.chats.self.slice(-2).map(m => m.body).join('\n'), /out of date/, 'ok can make the redrafted change')
	await makeChanges([1]); await goPr()
	assert.deepEqual(calls.map(c => c.args.content ?? c.args.vote), ['Null check', 'ApprovedWithSuggestions'], 'the comment once, then the new vote')
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Left a comment. Approved with suggestions.')
})

// Kim (A1, CHAT) and Lee (A2, other chat) ask about one PR; its review proposes one comment that both items show.
const OTHER = 'other-chat'
const NOTE = { system: 'ado', action: 'comment', target: 'PR 4200001', summary: 'Null check in a.ts', call: { tool: 'ado-comment', args: { pullRequestId: 4200001, content: 'Null check' } } }
const twoAskers = async () => {
	store.saveConfig({ ...store.config(), watch: [...store.config().watch, { id: OTHER, name: 'Other', test: true }] })
	src.post(OTHER, 'me', 'history'); await go()
	voteSetup(['ado-comment', 'ado-repo_pull_request_write:vote']); calls.length = 0
	script = needsJob({ key: 'pr:acme/web/4200001', goal: 'Review PR 4200001' }); jf.job = () => undefined
	src.post(CHAT, 'me', `[as Kim] Can you review? ${PR_URL}`); src.post(OTHER, 'me', `[as Lee] Is this good? ${PR_URL}`); await goPr()
	finishExecLike((_, id) => ({ workflowId: id, intent: 'pr_review', state: 'needs_human', summary: '1 finding', reply: { text: 'Left 1 comment on PR 4200001.', commitment: false, sources: [{ ref: PR_URL, tier: 'live', origin: 'extracted' }] }, effects: [NOTE] })); await goPr()
	return store.byCode('A1')!.job!
}

test('review 10-21c P1-1: two askers on one PR; one item\'s redraft does not take the other\'s changes, and each can still be approved', async () => {
	const job = await twoAskers(), other = OTHER, note = NOTE
	assert.deepEqual([store.byCode('A2')!.job, pendingOf(store.byCode('A2')!).map(e => e.summary)], [job, ['Null check in a.ts']], 'both items share the review and its comment')
	script = promise([note, voteEffect()], 'Left 1 comment and approved.')
	src.post('self', 'me', "A1: Leave the comment, and I'll approve."); await goPr()
	assert.deepEqual(store.job(job)!.result!.effects!.map(e => e.summary), ['Null check in a.ts'], "A1's redraft does not replace the list A2 shows")
	await see('A2'); src.post('self', 'me', 'ok A2'); await goPr()
	assert.doesNotMatch(src.chats.self.slice(-1)[0].body, /out of date/, 'A2 can still be approved')
	await makeChanges([0]); await goPr()
	assert.equal(src.chats[other].at(-1)!.body, 'Left 1 comment on PR 4200001.', "A2's reply went out")
	const a1 = store.byCode('A1')!
	assert.deepEqual([a1.effects!.map(e => e.summary), pendingOf(a1).map(e => e.summary)], [['Null check in a.ts', 'Approve PR 4200001'], ['Approve PR 4200001']], "A1 keeps its own list, with the comment marked made")
	const test = { ...note, summary: 'Ask for a test', call: { tool: 'ado-comment', args: { pullRequestId: 4200001, content: 'Please add a test' } } }
	script = promise([note, test, voteEffect()], 'Left 2 comments and approved.')
	src.post('self', 'me', 'A1: Also ask for a test.'); await goPr()
	assert.deepEqual(pendingOf(store.byCode('A1')!).map(e => e.summary), ['Ask for a test', 'Approve PR 4200001'], 'a new comment on the same PR is not taken as made')
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr(); src.post('self', 'me', 'ok A1'); await goPr()
	assert.doesNotMatch(src.chats.self.slice(-2).map(m => m.body).join('\n'), /out of date/, 'then A1 can be approved')
	await makeChanges([1, 2]); await goPr()
	assert.deepEqual(calls.map(c => c.args.vote ?? c.args.content), ['Null check', 'Please add a test', 'Approved'], 'each comment once, then the vote')
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Left 2 comments and approved.')
})

test('review 10-21d P2-1: once the other asker is skipped, ok makes the redraft its item shows', async () => {
	await twoAskers()
	script = promise([NOTE, voteEffect()], 'Left 1 comment and approved.')
	src.post('self', 'me', "A1: Leave the comment, and I'll approve."); await goPr()
	src.post('self', 'me', 'skip A2'); await goPr()
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr(); src.post('self', 'me', 'ok A1'); await goPr()
	assert.doesNotMatch(src.chats.self.slice(-2).map(m => m.body).join('\n'), /out of date/)
	assert.equal(store.job(store.byCode('A1')!.job!)!.purpose, 'execute')
})

test('review 10-21d P2-3: "except" leaves out the change the owner named, even when the item and the job list it in another order', async () => {
	const job = await twoAskers()
	const test = { ...NOTE, summary: 'Ask for a test', call: { tool: 'ado-comment', args: { pullRequestId: 4200001, content: 'Please add a test' } } }
	const made = { ...NOTE, done: { ref: 't0', at: new Date().toISOString() } }
	const a1 = store.byCode('A1')!, j = store.job(job)!
	store.save({ ...a1, effects: [made, test, voteEffect()] }); store.saveJob({ ...j, result: { ...j.result!, effects: [test, voteEffect()] } })
	store.save({ ...store.byCode('A2')!, state: 'done' })
	await see('A1'); src.post('self', 'me', 'ok A1 except 1'); await goPr(); src.post('self', 'me', 'ok A1'); await goPr()
	assert.deepEqual(store.job(job)!.result!.effects!.filter(e => e.off).map(e => e.summary), ['Ask for a test'], 'change 1 is left out, not the vote')
})

test('review 10-21e P1: a change already made is never made again, whatever the lists say; a vote at a new head is a new vote (the call ledger)', async () => {
	voteSetup(['ado-comment', 'ado-repo_pull_request_write:vote']); calls.length = 0
	script = promise([NOTE, voteEffect()], 'Left a comment and approved.')
	src.post(CHAT, 'me', `[as Kim] Can you approve? ${PR_URL}`); await goPr(); await goPr()
	jf.job = () => undefined
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr(); src.post('self', 'me', 'ok A1'); await goPr()
	const { makeChange, madeBefore } = await import('../src/runner/change.ts')
	let job = store.job(store.byCode('A1')!.job!)!
	await makeChange(store, job.id, job.run!.id, 0, ado, prProbe)
	jf.dead.add(job.run!.pid); await goPr()
	const forget = <T extends { effects?: Eff[] }>(x: T) => ({ ...x, effects: x.effects?.map(e => ({ ...e, done: undefined, maybe: undefined, error: undefined })) })
	job = store.job(job.id)!
	store.saveJob({ ...job, state: 'done', purpose: 'work', result: forget(job.result!) }); store.save({ ...forget(store.byCode('A1')!), state: 'needs_human', approved: undefined, question: undefined, status: 'Ready' })
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr(); src.post('self', 'me', 'ok A1'); await goPr()
	await makeChanges([0, 1]); await goPr()
	assert.deepEqual(calls.map(c => c.args.content ?? c.args.vote), ['Null check', 'Approved'], 'the comment the run that died had made is not posted again')
	assert.ok(madeBefore(store, voteEffect()), 'the vote at the reviewed head is made')
	assert.equal(madeBefore(store, voteEffect({ head: 'beef' })), undefined, 'a vote at a new head is not')
	assert.equal(madeBefore(store, { ...NOTE, call: { tool: 'ado-comment', args: { pullRequestId: 4200001, content: 'Another' } } }), undefined, 'nor another comment')
})

test('review 10-21e P1-1: a call an earlier run started with no answer is not repeated until the owner says again, and again makes it once', async () => {
	voteSetup(['ado-comment', 'ado-repo_pull_request_write:vote']); calls.length = 0
	script = promise([NOTE], 'Left a comment.')
	src.post(CHAT, 'me', `[as Kim] Can you look? ${PR_URL}`); await goPr(); await goPr()
	jf.job = () => undefined
	const { callKey, maybeOf, madeBefore, ledgerRec } = await import('../src/runner/ledger.ts')
	store.saveCallRec({ call: callKey(NOTE.call), state: 'calling', at: new Date().toISOString() })
	assert.deepEqual(pendingOf(store.byCode('A1')!).map(e => !!e.maybe), [false], 'no list marks it: the ledger alone knows')
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	assert.match(src.chats.self.at(-1)!.body, /may already have been made/, 'ok asks the owner to check first')
	src.post('self', 'me', 'ok A1 again'); await goPr()
	await makeChanges([0]); await goPr()
	assert.deepEqual(calls.map(c => c.args.content), ['Null check'], 'again makes it, once')
	assert.equal(src.chats[CHAT].at(-1)!.body, 'Left a comment.')
	store.saveCallRec({ call: callKey(voteCall()), state: 'calling', head: 'c0ffee1', at: new Date().toISOString() })
	assert.equal(maybeOf(store, voteEffect()), false, 'a vote only sets a state: it may be cast again without asking')
	const v = (vote: string) => voteEffect({ call: voteCall(4200001, vote) })
	store.saveCallRec(ledgerRec(v('Approved'), { state: 'done', ref: 'v1' }))
	store.saveCallRec(ledgerRec(v('Rejected'), { state: 'done', ref: 'v2' }))
	assert.equal(madeBefore(store, v('Approved')), undefined, 'a vote changed since is not cast, whatever was cast before (review 10-21e P2-4)')
	assert.ok(madeBefore(store, v('Rejected')), 'the latest vote is')
	assert.equal(callKey({ tool: 'ado-comment', args: { pullRequestId: 1, content: 'Null check ' } }), callKey({ tool: 'ado-comment', args: { content: 'Null check', pullRequestId: 1 } }), 'order and edge spaces do not make a new call (P2-1)')
})

test("next action: a vote names only the item's PR", async () => {
	voteSetup()
	const reviewers = voteEffect({ summary: 'Add Kim as a reviewer', call: { tool: 'ado-repo_pull_request_write', args: { action: 'update_reviewers', pullRequestId: 4200001, reviewerIds: ['kim'], reviewerAction: 'add' } } })
	script = promise([voteEffect({ target: 'PR 4200002', summary: 'Approve PR 4200002', call: voteCall(4200002) }), reviewers])
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr()
	const wf = store.byCode('A1')!
	assert.deepEqual(wf.effects ?? [], [], 'no vote on another PR is ever offered')
	assert.deepEqual(wf.todos, ["Approve PR 4200002. Not made for you: PR 4200002 is not this item's PR (4200001)", 'Add Kim as a reviewer. Not made for you: ado-repo_pull_request_write:update_reviewers is not one of the changes you allow'], 'it becomes a to-do with the reason, never vanishes; allowing the vote allows no other action of its tool')
})

test('next action: a refused change becomes a to-do with its reason', async () => {
	voteSetup(['ado-repo_pull_request_write', 'ado-repo_pull_request_thread_write'])
	const abandon = voteEffect({ action: 'abandon', summary: 'Abandon PR 4200001', call: { tool: 'ado-repo_pull_request_write', args: { action: 'update', repositoryId: 'web', pullRequestId: 4200001, status: 'Abandoned' } } })
	const bare = voteEffect({ summary: 'Approve PR 4200001', call: undefined })
	const other = voteEffect({ summary: 'Add Kim as reviewer', call: { tool: 'ado-wit_work_item_write', args: { action: 'update', id: 5 } } })
	const unhead = voteEffect({ summary: 'Approve PR 4200001 again', head: undefined })
	const del = voteEffect({ summary: 'Delete the thread', call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'delete', pullRequestId: 4200001 } } })
	const delTool = voteEffect({ summary: 'Delete the file', call: { tool: 'ado-repo_pull_request_write-delete_file', args: {} } })
	script = promise([abandon, bare, other, unhead, del, delTool])
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr()
	const wf = store.byCode('A1')!
	assert.deepEqual(wf.effects ?? [], [])
	assert.deepEqual(wf.todos, [
		`Abandon PR 4200001. Not made for you: ${'Delegate never completes, merges, abandons, bypasses, or deletes'}`,
		'Approve PR 4200001. Not made for you: it names no exact call',
		'Add Kim as reviewer. Not made for you: ado-wit_work_item_write:update is not one of the changes you allow',
		'Approve PR 4200001 again. Not made for you: a vote must name the commit the review read',
		'Delete the thread. Not made for you: Delegate never completes, merges, abandons, bypasses, or deletes',
		'Delete the file. Not made for you: Delegate never completes, merges, abandons, bypasses, or deletes',
	])
	assert.match(wf.question!, /^The reply counts on 6 changes Delegate cannot make, listed as yours to do\. Change the reply with "edit A1: <text>", or skip A1\.$/, 'the reply counted on them, so it is not sent as it is')
})

test('next action: a PR changed after the review gets no vote', async () => {
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	const asked = src.chats[CHAT].length
	prNow = { ...prNow, head: 'beef002' }
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	const wf = store.byCode('A1')!
	assert.equal(store.jobs().some(j => j.purpose === 'execute'), false, 'no change run')
	assert.equal(src.chats[CHAT].length, asked, 'no reply either')
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: PR 4200001 changed since your review \(new commits\)\. Review again\?/)
	assert.match(wf.question!, /PR 4200001 changed since your review/)
})

test('next action: a completed PR is not voted on', async () => {
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	prNow = { ...prNow, status: 'completed' }
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	let wf = store.byCode('A1')!
	assert.equal(store.jobs().some(j => j.purpose === 'execute'), false)
	assert.deepEqual(pendingOf(wf), [], 'the vote is dropped as not needed')
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: PR 4200001 is completed, so no vote is needed\. The reply was written counting on the vote; it says: "Description looks good now\. No remaining blockers from my review; approved\."\. Say "ok A1" to send it as it is, "edit A1: <text>" to change it, or "skip A1"\./)
	src.post('self', 'me', 'ok A1'); await goPr()
	wf = store.byCode('A1')!
	assert.deepEqual([wf.state, calls.length, src.chats[CHAT].at(-1)!.body], ['done', 0, 'Description looks good now. No remaining blockers from my review; approved.'], 'the next ok sends only the reply')
})

test('next action: the card says the vote may complete the PR', async () => {
	voteSetup()
	prNow = { ...prNow, required: ['Web Team'], autoComplete: true }
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr()
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	assert.equal(store.jobs().some(j => j.purpose === 'execute'), false, 'an ok before the PR was described only describes it')
	assert.match(src.chats.self.at(-1)!.body, /Before you ok A1: Approve PR 4200001 \("Fix the banner" by Dev Rao; required reviewers: Web Team; autocomplete is on: your approval may complete it\)/)
	const { view } = await import('../src/web/view.ts')
	const card = view(store, undefined).needs.find(c => c.code === 'A1')!
	assert.match(card.changes[0].meaning!.map(p => p.text).join('; '), /autocomplete is on: your approval may complete it/)
	src.post('self', 'me', 'ok A1'); await goPr()
	assert.equal(store.jobs().some(j => j.purpose === 'execute' && j.state === 'running'), true, 'the next ok makes the change')
})

test('next action: an edit that drops the promise shows the change again', async () => {
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	await see('A1')
	src.post('self', 'me', 'edit A1: Looks good to me.'); await goPr()
	assert.match(src.chats.self.at(-1)!.body, /Updated A1: "Looks good to me\."\. Nothing sent\. ok will also: Approve PR 4200001 \("Fix the banner" by Dev Rao\)\. Say "ok A1" to do both, or "ok A1 except 1" to send only the reply\./)
	src.post('self', 'me', 'send A1: Looks fine.'); await goPr()
	assert.equal(store.jobs().some(j => j.purpose === 'execute'), false, 'a send with new text on an item with changes is a preview too')
	assert.match(src.chats.self.at(-1)!.body, /Updated A1: "Looks fine\."\. Nothing sent\. ok will also: Approve PR 4200001/)
	src.post('self', 'me', 'ok A1 except 1'); await goPr()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, calls.length, src.chats[CHAT].at(-1)!.body], ['done', 0, 'Looks fine.'], 'the owner chose to send only the reply')
})

test('next action: a rule never votes', async () => {
	voteSetup()
	setRules(rule({ who: { accounts: [{ id: 'test:kim', name: 'Kim' }] }, when: {} })); autoOn(); policy(0)
	// No commitment and a plain intent: only the pending change keeps it a draft.
	script = (p, id) => { const r = promise()(p, id); return { ...r, intent: 'status_next_step', reply: { ...r.reply!, commitment: false } } }
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`)
	const asked = src.chats[CHAT].length
	await goPr(); await goPr()
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'needs_human', 'a reply with a change waits for the owner')
	assert.equal(pendingOf(wf).length, 1)
	assert.equal(store.jobs().some(j => j.purpose === 'execute'), false)
	assert.equal(src.chats[CHAT].length, asked, 'nothing sent by the rule')
})

test('next action: the executor cannot run an unapproved call', async () => {
	voteSetup(); calls.length = 0
	const { makeChange } = await import('../src/runner/change.ts')
	script = promise([voteEffect(), voteEffect({ summary: 'Approve PR 4200001 with suggestions', call: voteCall(4200001, 'ApprovedWithSuggestions') })])
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	const job = () => store.job(store.byCode('A1')!.job!)!
	assert.match((await makeChange(store, job().id, 'r0', 0, ado, prProbe)).error!, /not approved/, 'no ok yet')
	await see('A1'); src.post('self', 'me', 'ok A1 #1'); await goPr()
	const run = job().run!
	assert.match((await makeChange(store, job().id, run.id, 1, ado, prProbe)).error!, /not approved/, 'unchecked by the owner')
	assert.match((await makeChange(store, job().id, run.id, 7, ado, prProbe)).error!, /no change 7/)
	let during: string | undefined
	const watch = async (s: string, t: string, a: Record<string, unknown>) => { during = store.changes(job().id, run.id)['0']?.state; return ado(s, t, a) }
	assert.deepEqual(await makeChange(store, job().id, run.id, 0, watch, prProbe), { ref: 'vote-1' })
	assert.equal(during, 'calling', '"calling" is recorded before the call')
	assert.deepEqual(await makeChange(store, job().id, run.id, 0, ado, prProbe), { ref: 'vote-1' }, 'again: the recorded result, no second call')
	assert.equal(calls.length, 1)
	const down = async () => { throw new Error('ADO 503') }
	assert.deepEqual([await makeChange(store, job().id, 'r1', 0, down, prProbe), await makeChange(store, job().id, 'r1', 0, ado, prProbe)], [{ ref: 'vote-1' }, { ref: 'vote-1' }], 'a later run never casts a vote already cast: the ledger answers (review 10-21e P1)')
	assert.equal(calls.length, 1)
	const j = job()
	store.saveJob({ ...j, result: { ...j.result!, effects: j.result!.effects.map((e, i) => i === 0 ? { ...e, call: { ...e.call!, args: { ...e.call!.args, vote: 'Rejected' } } } : e) } })
	assert.match((await makeChange(store, job().id, 'r2', 0, ado, prProbe)).error!, /not approved/, 'a call changed after the ok is not the approved one')
	store.saveJob(j)
	const cfg = store.config()
	store.saveConfig({ ...cfg, agent: { ...cfg.agent, effectTools: ['ado-repo_pull_request_thread_write'] } })
	assert.match((await makeChange(store, job().id, 'r3', 0, ado, prProbe)).error!, /cannot be made: ado-repo_pull_request_write:vote is not one of the changes you allow/, 'checked again when made')
	store.saveConfig({ ...cfg, agent: { ...cfg.agent, mcpServers: {} } })
	assert.match((await makeChange(store, job().id, 'r4', 0, ado, prProbe)).error!, /No tool server is set up for ado-repo_pull_request_write/)
	assert.equal(calls.length, 1)
	const { serverOf } = await import('../src/runner/change.ts')
	assert.deepEqual(serverOf({ ...cfg, agent: { ...cfg.agent, mcpServers: { ado: {}, 'ado-x': {} } } }, 'ado-x-write'), ['ado-x', 'write'], 'the longest server name wins')
})

test('next action: a change with no answer may have been made; it is never repeated by itself', async () => {
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	const asked = src.chats[CHAT].length
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	const job = store.jobs().find(j => j.purpose === 'execute')!
	store.saveChange(job.id, job.run!.id, 0, { call: '', state: 'calling', at: new Date().toISOString() })
	store.writeReport({ workflowId: job.id, intent: 'other', state: 'done', summary: 'Stopped' }, job.run!.id); jf.dead.add(job.run!.pid)
	await goPr(); await goPr()
	const wf = store.byCode('A1')!
	assert.match(wf.status, /Made 0 of 1 changes\. Not done: Approve PR 4200001: project: Globex; repositoryId: web \(No answer from the tool, so it may have been made\)\. Reply "ok A1" to retry, or "ok A1 except 1" to send only the reply$/)
	assert.deepEqual([src.chats[CHAT].length, store.jobs().filter(j => j.purpose === 'execute').length], [asked, 0], 'nothing sent, and no change run starts again by itself')
})

test('next action: a vote waits when its PR cannot be checked', async () => {
	voteSetup()
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	const ok = async (t = goPr) => { await see('A1'); src.post('self', 'me', 'ok A1'); await t() }
	const before = prReads.length
	prNow = { ...prNow, status: 'unknown' }
	await ok()
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: Azure DevOps did not say what state PR 4200001 is in\. Nothing was changed\./)
	const failing = { builds: async () => new Map(), pr: async () => { throw new Error('ADO 503') } }
	await ok(() => tick(store, { source: src, run, procs, force: true, history: noList, probe: failing }))
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: could not read PR 4200001 first \(Error: ADO 503\)\. Nothing was changed\. Say "ok A1" to try again\./)
	await ok(() => tick(store, { source: src, run, procs, force: true, history: noList, probe: { builds: async () => new Map() } }))
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: PR 4200001 must be checked first, and no Azure DevOps server is set up\. Nothing was changed\./, 'a build-only reader cannot check a PR')
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, mcpServers: {} } })
	await ok(go)
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: PR 4200001 must be checked first, and no Azure DevOps server is set up\. Nothing was changed\./)
	store.save({ ...store.byCode('A1')!, lastAsk: 'and now PR 1726999?' })
	await ok()
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: PR 4200001 is not this item's PR\. Nothing was changed\./)
	assert.ok(prReads.length > before)
	assert.equal(store.jobs().some(j => j.purpose === 'execute'), false, 'no change run at any point')
})

test('next action: a new vote is described at once, even right after a PR check', async () => {
	voteSetup()
	store.saveProbeMark({ prAt: new Date().toISOString() })
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	assert.deepEqual(store.byCode('A1')!.effects?.[0].pr, { title: 'Fix the banner', author: 'Dev Rao', required: [], autoComplete: false })
})

test('next action: the change run calls make_change on its worker server, which keeps to the ok and records the outcome', async () => {
	voteSetup()
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	const job = store.jobs().find(j => j.purpose === 'execute')!
	const { build } = await import('../src/mcp/server.ts')
	const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
	const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
	Object.assign(process.env, { DELEGATE_MODE: 'worker', DELEGATE_WORKFLOW: job.id, DELEGATE_RUN: job.run!.id })
	try {
		const [a, b] = InMemoryTransport.createLinkedPair()
		await build(() => store).connect(a)
		const c = new Client({ name: 't', version: '1' }); await c.connect(b)
		const call = async (index: number) => await c.callTool({ name: 'make_change', arguments: { index } }) as { isError?: boolean; content: { text: string }[] }
		const missing = await call(3)
		assert.deepEqual([missing.isError, missing.content[0].text], [true, 'There is no change 3.'])
		// The fixture's server command does not exist, so the approved call fails to start; nothing reaches Azure DevOps.
		const r = await call(0)
		assert.equal(r.isError, true)
		assert.match(r.content[0].text, /^Could not read PR 4200001 right before the vote/, 'the vote reads its PR first, through the owner\'s server')
		assert.equal(store.changes(job.id, job.run!.id)['0']?.state, 'failed', 'its outcome is recorded')
		await c.close()
	} finally { for (const k of ['DELEGATE_MODE', 'DELEGATE_WORKFLOW', 'DELEGATE_RUN']) delete process.env[k] }
})

test("next action: Delegate's own vote does not close its item", async () => {
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	const send = src.send.bind(src)
	src.send = async () => { throw new Error('Teams 503') }
	await makeChanges([0]); await goPr()
	src.send = send
	assert.match(store.byCode('A1')!.status, /Changes made\. Could not send the reply/)
	prNow = { ...prNow, votes: [{ name: 'Robin Park', vote: 10 }] }
	store.saveProbeMark({}); await goPr()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.prVote], ['needs_human', 10], 'the item still owes its reply')
	src.post('self', 'me', 'ok A1'); await goPr()
	assert.deepEqual([store.byCode('A1')!.state, calls.length], ['done', 1], 'the next ok sends only the reply')
})

test('owned review P1-4: a trusted asker\'s validate ask waits for ok, and the relay forbids deploys', async () => {
	const { own } = await import('../src/runner/own.ts')
	const { addr } = await import('../src/mesh/inbox.mjs')
	const { id } = fakeSession()
	own(store, 'PR reviews', id)
	store.saveOwners(store.owners().map(o => ({ ...o, machine: 'vm-b' })))
	await registerOn('vm-b', id)
	setRules({ id: 'r1', text: 'Vikram', who: { accounts: [{ id: 'test:vikram', name: 'Vikram' }] }, when: {}, then: 'send' })
	script = (p, wfId) => ({ ...needsJob({ ...PR, owner: 'o1' } as never)(p, wfId), intent: 'validate' }); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Deploy your PR 1 to INT and test it?'); await go()
	const box = join(store.root, 'mesh', 'inbox', addr('vm-b', id))
	assert.equal(existsSync(box) ? readdirSync(box).length : 0, 0, 'not relayed by itself, though the asker is trusted')
	assert.match(store.byCode('A1')!.question!, /Say "ok A1" to send it there/)
	src.post('self', 'me', 'ok A1'); await go()
	const msg = JSON.parse(readFileSync(join(box, readdirSync(box)[0]), 'utf8'))
	assert.match(msg.text, /Never run, cancel, or retry a pipeline, and never deploy; propose it, and I will decide\./)
})

test('relay: a sign-off ask waits for ok', async () => {
	const { own } = await import('../src/runner/own.ts')
	const { addr } = await import('../src/mesh/inbox.mjs')
	const { id } = fakeSession()
	own(store, 'PR reviews', id)
	store.saveOwners(store.owners().map(o => ({ ...o, machine: 'vm-b' })))
	await registerOn('vm-b', id)
	setRules({ id: 'r1', text: 'Vikram', who: { accounts: [{ id: 'test:vikram', name: 'Vikram' }] }, when: {}, then: 'send' })
	script = (p, wfId) => ({ ...needsJob({ ...PR, owner: 'o1' } as never)(p, wfId), intent: 'commitment_decision' }); jf.job = () => undefined
	src.post(CHAT, 'me', '[as Vikram] Can you approve PR 1?'); await go()
	const box = join(store.root, 'mesh', 'inbox', addr('vm-b', id))
	assert.equal(existsSync(box) ? readdirSync(box).length : 0, 0, 'a trusted asker\'s sign-off ask still waits for ok')
	assert.match(store.byCode('A1')!.question!, /Say "ok A1" to send it there/)
})

// Code review of slice 1, 2026-10-21 (/tmp/review-next.md): each test failed before its fix.
const voteSeen = (vote: string | number, over: Partial<Eff> = {}) => voteEffect({ call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', project: 'Globex', repositoryId: 'web', pullRequestId: 4200001, vote } }, ...over })
// A local MCP server that records each call, started by command like the owner's own; it never reaches a real system.
const fakeServer = (dir: string, name: string, tools: Record<string, string[]>) => {
	const file = join(dir, `${name}.mjs`), log = join(dir, `${name}.jsonl`)
	writeFileSync(file, [
		`import { McpServer } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/mcp.js'))}`,
		`import { StdioServerTransport } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/stdio.js'))}`,
		`import { z } from ${JSON.stringify(import.meta.resolve('zod'))}`,
		`import { appendFileSync } from 'node:fs'`,
		`const s = new McpServer({ name: ${JSON.stringify(name)}, version: '1' })`,
		...Object.entries(tools).map(([t, keys]) => `s.registerTool(${JSON.stringify(t)}, { inputSchema: { ${keys.map(k => `${k}: z.any().optional()`).join(', ')} } }, async a => { appendFileSync(${JSON.stringify(log)}, JSON.stringify({ tool: ${JSON.stringify(t)}, args: a }) + '\\n'); return { content: [{ type: 'text', text: JSON.stringify({ id: ${JSON.stringify(`${name}-1`)} }) }] } })`),
		`await s.connect(new StdioServerTransport())`,
	].join('\n'))
	return { spec: { command: process.execPath, args: [file] }, calls: () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [] }
}
// The change run as the AI would drive it: make_change on its own worker server, then the report.
const viaWorker = async (indexes: number[]) => {
	const job = store.jobs().find(j => j.purpose === 'execute' && j.run)!
	const { build } = await import('../src/mcp/server.ts')
	const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
	const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
	Object.assign(process.env, { DELEGATE_MODE: 'worker', DELEGATE_WORKFLOW: job.id, DELEGATE_RUN: job.run!.id })
	const out: string[] = []
	try {
		const [a, b] = InMemoryTransport.createLinkedPair()
		await build(() => store).connect(a)
		const c = new Client({ name: 't', version: '1' }); await c.connect(b)
		for (const index of indexes) out.push(((await c.callTool({ name: 'make_change', arguments: { index } })) as { content: { text: string }[] }).content[0].text)
		await c.close()
	} finally { for (const k of ['DELEGATE_MODE', 'DELEGATE_WORKFLOW', 'DELEGATE_RUN']) delete process.env[k] }
	store.writeReport({ workflowId: job.id, intent: 'other', state: 'done', summary: 'Made the changes' }, job.run!.id)
	jf.dead.add(job.run!.pid)
	return out
}

test("review 10-21 P1-1: the owner sees the call that runs, never the AI's words about it", async () => {
	voteSetup(['ado-repo_pull_request_write:vote', 'ado-repo_pull_request_thread_write'])
	const comment = voteEffect({ action: 'comment', summary: 'Say it looks great', payload: { text: 'Nice work' }, head: undefined, call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', repositoryId: 'web', pullRequestId: 4200001, content: 'This is wrong' } } })
	script = promise([voteSeen('Rejected', { action: 'approve', summary: 'Approve PR 4200001' }), comment, voteSeen('LGTM', { summary: 'Approve it' })])
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	await see('A1')
	const more = src.chats.self.at(-1)!.body
	assert.match(more, /ok will: Reject PR 4200001 \(.*\), comment on PR 4200001, then send the reply/)
	assert.match(more, /- comment on PR 4200001: This is wrong/)
	assert.doesNotMatch(more, /Nice work|approve on PR|Say it looks great/)
	const { view } = await import('../src/web/view.ts')
	const card = view(store, undefined).needs.find(c => c.code === 'A1')!
	assert.deepEqual(card.changes.map(c => [c.summary, c.detail]), [['Reject PR 4200001', 'project: Globex\nrepositoryId: web'], ['This is wrong', 'repositoryId: web']])
	assert.deepEqual(store.byCode('A1')!.todos, ['Approve it. Not made for you: a vote must be Approved, ApprovedWithSuggestions, WaitingForAuthor, Rejected, or NoVote'])
})

test("review 10-21 P1-2: an approved invite and an approved PR comment reach the AI CLI's own tool servers", async () => {
	const home = mkdtempSync(join(tmpdir(), 'delegate-cli-'))
	const cal = fakeServer(home, 'calendar', { CreateEvent: ['subject', 'startDateTime', 'endDateTime', 'attendeeEmails'] }), ado = fakeServer(home, 'ado', { repo_pull_request_thread_write: ['action', 'repositoryId', 'pullRequestId', 'content', 'file', 'line'] })
	writeFileSync(join(home, 'mcp-config.json'), JSON.stringify({ mcpServers: { calendar: cal.spec, ado: ado.spec } }))
	const was = process.env.COPILOT_HOME
	process.env.COPILOT_HOME = home
	try {
		store.saveConfig({ ...store.config(), agent: { ...store.config().agent, tools: [], effectTools: ['calendar-CreateEvent', 'ado-repo_pull_request_thread_write'], mcpServers: undefined } })
		script = meetingReport
		src.post(CHAT, 'me', '[as Arun] Can we meet at 3 about the API changes?'); await go()
		src.post('self', 'me', 'pick A1 1'); await go()
		src.post('self', 'me', 'ok A1'); await go()
		assert.deepEqual(await viaWorker([0]), ['Made change 0: calendar-1'])
		await go()
		assert.deepEqual(cal.calls(), [{ tool: 'CreateEvent', args: { subject: 'API changes', startDateTime: '2026-10-19T16:00:00', endDateTime: '2026-10-19T16:30:00', attendeeEmails: ['arun@acme.com'] } }], 'the invite went to the calendar server the AI CLI starts')
		assert.equal(src.chats[CHAT].at(-1)!.body, '3 does not work, sent an invite for 4.')
		script = needsJob({ key: 'pr:org/repo/1', goal: 'Review PR 1' })
		jf.job = (_, id) => ({ ...review(_, id), effects: [{ system: 'ado', action: 'comment', target: 'PR 1', summary: 'Null check', call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', repositoryId: 'repo', pullRequestId: 1, content: 'Null check missing' } } }] })
		src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go(); await go()
		jf.job = () => undefined
		await see('A2'); src.post('self', 'me', 'ok A2'); await go()
		assert.deepEqual(await viaWorker([0]), ['Made change 0: ado-1'])
		await go()
		assert.deepEqual(ado.calls(), [{ tool: 'repo_pull_request_thread_write', args: { action: 'create', repositoryId: 'repo', pullRequestId: 1, content: 'Null check missing' } }])
		assert.equal(store.byCode('A2')!.state, 'done')
		const { adoProbe } = await import('../src/runner/probe.ts')
		assert.ok(adoProbe(store.config())?.pr, 'a vote can be checked through the same server')
	} finally { if (was === undefined) delete process.env.COPILOT_HOME; else process.env.COPILOT_HOME = was }
})

test('review 10-21 P1-3: a PR that moves between the ok and the vote gets no vote, and asks to review again', async () => {
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	const asked = src.chats[CHAT].length
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	const { makeChange } = await import('../src/runner/change.ts')
	const job = store.jobs().find(j => j.purpose === 'execute')!
	const base = prNow
	for (const [change, why] of [[{ autoComplete: true }, /autocomplete was turned on/], [{ required: ['Web Team'] }, /required reviewers changed/], [{ title: 'Fix the banner, and more' }, /title changed/], [{ status: 'completed' }, /it is completed/], [{ head: 'beef002' }, /new commits/]] as const) {
		prNow = { ...base, ...change } as PrNow
		assert.match((await makeChange(store, job.id, `x-${Object.keys(change)[0]}`, 0, ado, prProbe)).error!, why)
	}
	assert.equal(calls.length, 0, 'nothing voted')
	prNow = { ...base, head: 'beef002' }
	await makeChanges([0]); await goPr()
	const wf = store.byCode('A1')!
	assert.deepEqual([calls.length, src.chats[CHAT].length, wf.state], [0, asked, 'needs_human'], 'no vote and no reply')
	assert.match(wf.question!, /^PR 4200001 changed since your review \(new commits\)\. Review again\? Reply "A1: review again", or "skip A1"\.$/)
})

test('review 10-21 P2-4: a vote is a vote however it is spelled, and a PR change must name its PR', async () => {
	voteSetup(['ado-repo_pull_request_write', 'x-ado_pr_update_vote', 'x-cast_vote', 'ado-repo_pull_request_thread_write'])
	const { allows } = await import('../src/core/effects.ts')
	assert.equal(allows(['t-x:vote'], { tool: 't-x', args: { action: 'Vote' } }), true, 'an action matches in any case')
	script = promise([
		voteEffect({ summary: 'Vote A', head: undefined, call: { tool: 'ado-repo_pull_request_write', args: { action: 'Vote', pullRequestId: 4200001, vote: 'Approved' } } }),
		voteEffect({ summary: 'Vote B', call: { tool: 'x-ado_pr_update_vote', args: { prId: 4200002, vote: 'approve' } } }),
		voteEffect({ summary: 'Vote C', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: { id: 4200002 }, vote: 'Approved' } } }),
		voteEffect({ summary: 'Vote D', head: undefined, call: { tool: 'x-cast_vote', args: { pullRequestId: 4200001, vote: 'approve' } } }),
		voteEffect({ summary: 'Comment E', head: undefined, call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', prId: 4200001, content: 'x' } } }),
	])
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr()
	assert.deepEqual(store.byCode('A1')!.todos, [
		'Vote A. Not made for you: a vote must name the commit the review read',
		'Vote B. Not made for you: a pull request change must name its PR by number in pullRequestId',
		'Vote C. Not made for you: a pull request change must name its PR by number in pullRequestId',
		'Vote D. Not made for you: a vote must name the commit the review read',
		'Comment E. Not made for you: a pull request change must name its PR by number in pullRequestId',
	])
})

test('review 10-21 P2-5: closing a PR is refused however the call spells it', async () => {
	voteSetup(['ado-repo_pull_request_write'])
	const upd = (summary: string, args: Record<string, unknown>) => voteEffect({ summary, call: { tool: 'ado-repo_pull_request_write', args: { pullRequestId: 4200001, ...args } } })
	script = promise([upd('Complete it', { action: 'update', status: 3 }), upd('Close it', { action: 'update', pullRequest: { status: 'completed' } }), upd('Auto it', { action: 'set_autocomplete' }), upd('Auto deep', { action: 'update', updates: [{ autoCompleteSetBy: 'me' }] })])
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr()
	assert.deepEqual(store.byCode('A1')!.todos, ['Complete it', 'Close it', 'Auto it', 'Auto deep'].map(x => `${x}. Not made for you: Delegate never completes, merges, abandons, bypasses, or deletes`))
})

test('review 10-21 P2-6 P2-7: a change that may have been made is never made again until the owner says so', async () => {
	effectTools(); script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go(); await go()
	jf.job = () => undefined
	src.post('self', 'me', 'ok A1'); await go()
	const { makeChange } = await import('../src/runner/change.ts')
	const job = () => store.jobs()[0]
	const run = job().run!
	store.saveChange(job().id, run.id, 0, { call: '', state: 'calling', at: new Date().toISOString() })
	const sent: unknown[] = []
	assert.match((await makeChange(store, job().id, run.id, 0, async (...a) => { sent.push(a); return {} })).error!, /may have been made already/, 'P2-6: a call still without an answer is not sent twice')
	store.saveChange(job().id, run.id, 1, { call: '', state: 'done', ref: 't1', at: new Date().toISOString() })
	store.writeReport({ workflowId: job().id, intent: 'other', state: 'done', summary: 'Stopped' }, run.id); jf.dead.add(run.pid)
	await go()
	let wf = store.byCode('A1')!
	assert.match(wf.status, /Made 1 of 2 changes\. Not done: comment on PR 1: .*may have been made.*Check whether it was made, then reply "ok A1 again" to make it once more, or "ok A1 except 1" to send only the reply$/)
	src.post('self', 'me', 'ok A1'); await go()
	assert.match(src.chats.self.at(-1)!.body, /A1's comment on PR 1 may already have been made\. Check it, then say "ok A1 again"/)
	assert.equal(store.jobs()[0].state, 'done', 'P2-7: no change run on a plain ok')
	assert.match((await makeChange(store, job().id, 'r-new', 0, async (...a) => { sent.push(a); return {} })).error!, /not approved|may have been made/)
	const { effectsKey } = await import('../src/runner/jobs.ts')
	const w0 = store.byCode('A1')!, j0 = job()
	store.save({ ...w0, approved: { text: w0.draft?.text ?? '', effects: effectsKey(w0), at: new Date().toISOString() } }); store.saveJob({ ...j0, purpose: 'execute', state: 'running' })
	assert.match((await makeChange(store, job().id, 'r-forced', 0, async (...a) => { sent.push(a); return {} })).error!, /may have been made already/, 'make_change keeps the guard too')
	store.save({ ...store.byCode('A1')!, approved: undefined }); store.saveJob({ ...job(), purpose: 'work', state: 'done' })
	src.post('self', 'me', 'ok A1 again'); await go()
	wf = store.byCode('A1')!
	assert.deepEqual([store.jobs()[0].purpose, wf.effects?.[0].maybe, sent.length], ['execute', undefined, 0], 'the owner said so: one more try')
})

test("review 10-21 P2-8: Delegate's own vote is recorded however its value is written", async () => {
	const { voteValue } = await import('../src/core/effects.ts')
	const c = (vote: unknown) => ({ tool: 'ado-repo_pull_request_write', args: { action: 'vote', vote } })
	assert.deepEqual(['Approved', 'approved', 10, '5', 'wait_for_author', 'reject', 'NoVote', 'LGTM', 7].map(v => voteValue(c(v))), [10, 10, 10, 5, -5, -10, 0, undefined, undefined])
	voteSetup(); calls.length = 0
	script = promise([voteSeen(5)])
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	await makeChanges([0]); await goPr()
	assert.deepEqual([store.byCode('A1')!.state, store.byCode('A1')!.prVote], ['done', 5])
})

test('review 10-21 P2-9: a short id of the reviewed commit is the same commit', async () => {
	voteSetup()
	script = promise([voteEffect({ head: 'c0ffee1' })])
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	prNow = { ...prNow, head: 'c0ffee1d00d5eed0000000000000000000000000' }
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	assert.equal(store.jobs().some(j => j.purpose === 'execute' && j.state === 'running'), true)
	const { sameHead } = await import('../src/core/effects.ts')
	assert.deepEqual([sameHead('C0FFEE1', 'c0ffee1d00d'), sameHead('c0ffee', 'c0ffee1d00d'), sameHead('c0ffee1', undefined)], [true, false, false])
})

test('review 10-21 P2-10: sending only the reply quotes it first, since it was written counting on the changes', async () => {
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	const asked = src.chats[CHAT].length
	await see('A1'); src.post('self', 'me', 'ok A1 except 1'); await goPr()
	assert.match(src.chats.self.at(-1)!.body, /Only the reply goes now, and it says: "Description looks good now\. No remaining blockers from my review; approved\." It was written counting on the changes you left out\. Say "ok A1" to send it as it is, or "edit A1: <text>" to change it\./)
	assert.equal(src.chats[CHAT].length, asked, 'nothing sent yet')
	src.post('self', 'me', 'ok A1'); await goPr()
	assert.deepEqual([store.byCode('A1')!.state, calls.length], ['done', 0])
})

test('review 10-21 P2-11: a change proposed before the upgrade becomes a to-do once, with a note', async () => {
	const { changesJob } = await import('../src/runner/jobs.ts')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const wf = store.byCode('A1')!
	const old = [{ system: 'incidents', action: 'reactivate', target: 'incident 2100', summary: 'Reactivate incident 2100' }]
	changesJob(store, store.config(), wf, old.map(e => ({ ...e })))
	store.save({ ...wf, effects: old, promised: true })
	await go(); await go()
	const after = store.byCode('A1')!
	assert.deepEqual([after.effects?.filter(e => !e.done && !e.off).length, after.todos], [0, ['Reactivate incident 2100. Not made for you: it was proposed before this update, without the exact call needed to make it']])
	assert.match(after.question!, /The reply counts on a change Delegate cannot make/)
	assert.deepEqual(store.job(after.job!)!.result!.effects.filter(e => !e.done && !e.off), [])
})

test('review 10-21 P2-12: the work-item change says what is wanted, not how', async () => {
	const { changeLine } = await import('../src/core/effects.ts')
	assert.equal(changeLine('ado-wit_work_item_write:update'), 'ado-wit_work_item_write:update: change fields on one work item; the update must fail if the item changed since it was read')
})

// Code review round 2, 2026-10-21 (/tmp/review-next-v2.md): each test failed before its fix.
const withCli = async (config: string, fn: (home: string) => Promise<void>) => {
	const home = mkdtempSync(join(tmpdir(), 'delegate-cli-'))
	writeFileSync(join(home, 'mcp-config.json'), config)
	const was = process.env.COPILOT_HOME
	process.env.COPILOT_HOME = home
	try { await fn(home) } finally { if (was === undefined) delete process.env.COPILOT_HOME; else process.env.COPILOT_HOME = was }
}
const inviteOk = async () => {
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, tools: [], effectTools: ['calendar-CreateEvent'], mcpServers: { ado: { command: 'delegate-test-no-such-server' } } } })
	script = meetingReport
	src.post(CHAT, 'me', '[as Arun] Can we meet at 3 about the API changes?'); await go()
	src.post('self', 'me', 'pick A1 1'); await go()
	src.post('self', 'me', 'ok A1'); await go()
}

test('review 10-21b P1: a CLI config that cannot be read never stops a cycle; Health names it once, and a change listed only there says why', async () => {
	await withCli('{ "mcpServers": { "calendar": ', async home => {
		const file = join(home, 'mcp-config.json')
		await inviteOk()
		assert.equal(store.byCode('A1')!.state, 'waiting_on_task', 'the cycle read the chats, drafted, and took the ok')
		const said = Object.values(store.health()).map(h => h.text).filter(t => t.includes(file))
		assert.equal(said.length, 1, 'Health names the file once')
		assert.match(said[0], /could not read your AI CLI's tool list/)
		const { serverOf } = await import('../src/runner/change.ts')
		assert.deepEqual(serverOf(store.config(), 'ado-repo_pull_request_write'), ['ado', 'repo_pull_request_write'], 'servers setup saved still work')
		const [out] = await viaWorker([0])
		assert.match(out, /No tool server is set up for calendar-CreateEvent: .*mcp-config\.json could not be read/)
		await go()
		assert.match(store.byCode('A1')!.status, /Not done: invite arun@acme\.com to "API changes", 2026-10-19 16:00 to 2026-10-19 16:30 \(your calendar's time zone\) \(No tool server is set up for calendar-CreateEvent/, 'the item says why')
		writeFileSync(file, '{ "mcpServers": {} }'); utimesSync(file, new Date(), new Date(Date.now() + 5000))
		await go()
		assert.equal(Object.values(store.health()).some(h => h.text.includes(file)), false, 'cleared once it reads again')
	})
})

test('review 10-21b P2-2: a remote tool server is refused with a reason the item shows', async () => {
	await withCli(JSON.stringify({ mcpServers: { calendar: { type: 'http', url: 'https://example.invalid/mcp' } } }), async () => {
		await inviteOk()
		assert.deepEqual(await viaWorker([0]), ['The calendar tool server is remote (http); Delegate cannot call it yet.'])
		await go()
		assert.match(store.byCode('A1')!.status, /\(The calendar tool server is remote \(http\); Delegate cannot call it yet\.\)/)
	})
})

test('review 10-21b P2-3: resolving a comment thread is not taken for closing the PR', async () => {
	voteSetup(['ado-repo_pull_request_write', 'ado-repo_pull_request_thread_write'])
	script = promise([voteEffect({ summary: 'Resolve thread 7', head: undefined, call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'update_status', pullRequestId: 4200001, threadId: 7, status: 2 } } }), voteEffect({ summary: 'Complete it', call: { tool: 'ado-repo_pull_request_write', args: { action: 'update', pullRequestId: 4200001, status: 3 } } })])
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.effects?.map(e => e.summary), wf.todos], [['Resolve thread 7'], ['Complete it. Not made for you: Delegate never completes, merges, abandons, bypasses, or deletes']])
})

test('review 10-21b P2-4: a vote is made for the item that approved it, whatever the order of its items', async () => {
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	const job = store.jobs().find(j => j.purpose === 'execute')!
	src.post(CHAT, 'me', `[as Ravi] Unrelated: what about ${PR_URL.replace('4200001', '4200002')}?`); await go()
	const other = store.workflows().find(w => w.code !== 'A1')!
	store.save({ ...other, job: job.id, state: 'needs_human', effects: [] })
	store.saveJob({ ...job, parents: [other.id, ...job.parents] })
	const { makeChange } = await import('../src/runner/change.ts')
	assert.deepEqual(await makeChange(store, job.id, job.run!.id, 0, ado, prProbe), { ref: 'vote-1' })
	assert.deepEqual([calls.length, prReads.at(-1)], [1, 4200001], 'the approving item\'s PR was read, not the other item\'s')
})

test('review 10-21b P2-5: "again" is kept only when the change run is queued', async () => {
	effectTools(); script = needsJob(); jf.job = review
	src.post(CHAT, 'me', '[as Vikram] Can you review PR 1?'); await go(); await go()
	jf.job = () => undefined
	src.post('self', 'me', 'ok A1'); await go()
	const job = store.jobs()[0], run = job.run!
	store.saveChange(job.id, run.id, 0, { call: '', state: 'calling', at: new Date().toISOString() })
	store.saveChange(job.id, run.id, 1, { call: '', state: 'done', ref: 't1', at: new Date().toISOString() })
	store.writeReport({ workflowId: job.id, intent: 'other', state: 'done', summary: 'Stopped' }, run.id); jf.dead.add(run.pid)
	await go()
	src.post('self', 'me', 'pause'); await go()
	src.post('self', 'me', 'ok A1 again'); await go()
	assert.match(src.chats.self.at(-1)!.body, /Paused, so A1's changes were not made/)
	src.post('self', 'me', 'resume'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	assert.match(src.chats.self.at(-1)!.body, /may already have been made\. Check it, then say "ok A1 again"/, 'a refused "again" does not count later')
	assert.equal(store.byCode('A1')!.effects?.[0].maybe, true)
	// A change run already queued for the job: "again" still reaches the change it runs.
	const { approveEffects } = await import('../src/runner/jobs.ts')
	store.saveJob({ ...store.jobs()[0], purpose: 'execute', state: 'queued' })
	const wf = store.byCode('A1')!
	assert.equal(approveEffects(store, store.config(), wf, true), '')
	assert.equal(store.jobs()[0].result!.effects[0].maybe, undefined)
})

test('review 10-21b P2-6: the CLI config is read once until it changes', async () => {
	await withCli(JSON.stringify({ mcpServers: { calendar: { command: 'a' } } }), async home => {
		const { cliServers } = await import('../src/adapters/mcp-client.ts')
		const first = cliServers('copilot')
		assert.equal(cliServers('copilot'), first, 'the same read, not a new one')
		writeFileSync(join(home, 'mcp-config.json'), JSON.stringify({ mcpServers: { calendar: { command: 'b' } } })); utimesSync(join(home, 'mcp-config.json'), new Date(), new Date(Date.now() + 5000))
		assert.deepEqual(cliServers('copilot').servers, { calendar: { command: 'b' } }, 'read again once it changed')
	})
	const notDir = join(mkdtempSync(join(tmpdir(), 'delegate-cli-')), 'a-file')
	writeFileSync(notDir, '')
	await withCli('{}', async () => {
		process.env.COPILOT_HOME = notDir
		const { cliServers } = await import('../src/adapters/mcp-client.ts')
		const r = cliServers('copilot')
		assert.deepEqual(r.servers, {}, 'a path that cannot be checked is no servers, not a crash')
		// Windows reports a file used as a folder as missing (ENOENT, silent); POSIX says ENOTDIR, which is worth a reason.
		if (process.platform !== 'win32') assert.match(r.error ?? '', /ENOTDIR/)
	})
})

test('review 10-21b P2-4: a vote on an item whose thread has no PR link takes its PR from the call', async () => {
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', '[as Kim] Updated the description, can you approve PR 4200001?'); await goPr(); await goPr()
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	const job = store.jobs().find(j => j.purpose === 'execute' && j.run)!
	const { makeChange } = await import('../src/runner/change.ts')
	assert.deepEqual(await makeChange(store, job.id, job.run!.id, 0, ado, prProbe), { ref: 'vote-1' })
	assert.equal(prReads.at(-1), 4200001)
})

// Golden master 10-21: the review card read worse after P1-1. Known kinds of change read as a person would write them, still only from the call.
test('golden 10-21: a change reads as a person would write it, built only from its call', async () => {
	const { shown } = await import('../src/core/effects.ts')
	const s = (tool: string, args: Record<string, unknown>) => { const x = shown({ system: 'x', action: 'AI words', target: 'AI words', summary: 'AI words', call: { tool, args } }); return [x.line, x.loc, x.text, x.detail] }
	const vote = (v: unknown) => s('ado-repo_pull_request_write', { action: 'vote', repositoryId: 'web', pullRequestId: 1234, vote: v })[0]
	assert.deepEqual(['Approved', 'ApprovedWithSuggestions', 'NoVote', 'WaitingForAuthor', 'Rejected'].map(vote), ['Approve PR 1234', 'Approve PR 1234 with suggestions', 'Reset your vote on PR 1234', 'Wait for author on PR 1234', 'Reject PR 1234'])
	assert.deepEqual(s('ado-repo_pull_request_thread_write', { action: 'create', repositoryId: 'web', pullRequestId: 1234, filePath: 'src/banner/banner.tsx', rightFileStartLine: 42, content: 'Check props.user before use.' }), ['comment on PR 1234', 'src/banner/banner.tsx:42, PR 1234', 'Check props.user before use.', 'repositoryId: web'])
	assert.deepEqual(s('ado-repo_pull_request_thread_write', { action: 'reply', repositoryId: 'web', pullRequestId: 1234, threadId: 7, content: 'Fixed, thanks.' }), ['reply in thread 7 on PR 1234', 'thread 7, PR 1234', 'Fixed, thanks.', 'repositoryId: web'])
	assert.deepEqual(s('ado-wit_work_item_write', { action: 'update', id: 5374410, updates: [{ op: 'Test', path: '/rev', value: 12 }, { op: 'Replace', path: '/fields/System.State', value: 'Resolved' }, { op: 'Add', path: '/fields/System.History', value: 'Fixed in PR 1234' }] }), ['update work item 5374410', 'Work item 5374410', 'update work item 5374410', 'Test /rev: 12\nReplace /fields/System.State: Resolved\nAdd /fields/System.History: Fixed in PR 1234'])
	assert.deepEqual(s('calendar-CreateEvent', { subject: 'API changes', startDateTime: '2026-10-20T16:00:00', endDateTime: '2026-10-20T16:30:00', attendeeEmails: ['arun@acme.com'] }), ['invite arun@acme.com to "API changes", 2026-10-20 16:00 to 2026-10-20 16:30 (your calendar\'s time zone)', '2026-10-20 16:00 to 2026-10-20 16:30 (your calendar\'s time zone)', 'Invite arun@acme.com to "API changes"', ''])
	assert.equal(s('calendar-CreateEvent', { subject: 'Focus time', startDateTime: '2026-10-20T09:00:00', endDateTime: '2026-10-21T09:00:00' })[0], 'create "Focus time", 2026-10-20 09:00 to 2026-10-21 09:00 (your calendar\'s time zone)')
	assert.deepEqual(s('ado-repo_pull_request_thread_write', { action: 'update_status', pullRequestId: 1234, threadId: 7, status: 'Fixed' }).slice(0, 2), ['set thread 7 to Fixed on PR 1234', 'PR 1234'])
	assert.deepEqual(s('ado-repo_pull_request_write', { action: 'vote', pullRequestId: 1234, vote: 'LGTM' })[0], 'Vote LGTM on PR 1234')
	assert.deepEqual(s('x-other', { action: 'poke', id: 3 }), ['other poke', '', 'other poke', 'id: 3'], 'an unknown tool shows every argument')
	const { changeSays } = await import('../src/core/effects.ts')
	const comment = { system: 'x', action: 'x', target: 'x', summary: 'x', call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', pullRequestId: 1234, filePath: 'a.ts', rightFileStartLine: 3, content: 'Typo.' } } }
	assert.equal(changeSays(comment), 'comment on PR 1234 at a.ts:3: Typo.', 'one line: what, where, and what it says')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const wi = { system: 'ado', action: 'x', target: 'x', summary: 'x', call: { tool: 'ado-wit_work_item_write', args: { action: 'update', id: 5, updates: [{ op: 'Replace', path: '/fields/System.State', value: 'Resolved' }] } } }
	store.save({ ...store.byCode('A1')!, state: 'needs_human', effects: [wi] })
	const { view } = await import('../src/web/view.ts')
	const card = view(store, undefined).needs.find(c => c.code === 'A1')!
	assert.deepEqual([card.changes[0].target, card.changes[0].summary, card.changes[0].detail], ['Work item 5', 'update work item 5', 'Replace /fields/System.State: Resolved'], 'the card shows the fields it changes')
})

// Code review round 4, 2026-10-21 (/tmp/review-next-v4.md): the readable formats may not hide what a call sends.
const ARGS_PR = { pullRequestId: 1234, repositoryId: 'web', project: 'Globex' }
const SENT = [
	{ tool: 'ado-repo_pull_request_write', args: { action: 'vote', ...ARGS_PR, vote: 'Approved', reviewerId: 'team-guid-7' } },
	{ tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', ...ARGS_PR, filePath: 'src/a.ts', rightFileStartLine: 42, rightFileEndLine: 44, leftFileStartLine: 40, content: 'Typo here.', status: 'closed', parentCommentId: 3 } },
	{ tool: 'ado-repo_pull_request_thread_write', args: { action: 'reply', ...ARGS_PR, threadId: 7, content: 'Fixed.', status: 'fixed' } },
	{ tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', ...ARGS_PR, comment: 'The words are here, not in content.' } },
	{ tool: 'ado-repo_pull_request_thread_write', args: { action: 'update_status', ...ARGS_PR, threadId: 7, status: 'WontFix', commentId: 2 } },
	{ tool: 'ado-wit_work_item_write', args: { action: 'update', id: 5374410, project: 'Globex', updates: [{ op: 'Test', path: '/rev', value: 12 }, { op: 'Remove', path: '/fields/System.AssignedTo' }, { op: 'Add', path: '/relations/-', value: { rel: 'ArtifactLink', url: 'vstfs:///Git/PullRequestId/1234' } }, { op: 'Replace', path: '/fields/System.Description', value: 'New text', format: 'Markdown' }] } },
	{ tool: 'ado-wit_work_item_write', args: { action: 'update', id: 9, updates: { 'System.State': 'Closed' } } },
	{ tool: 'calendar-CreateEvent', args: { subject: 'API changes', startDateTime: '2026-10-20T16:00:00', endDateTime: '2026-10-20T16:30:00', timeZone: 'Pacific Standard Time', attendeeEmails: ['arun@acme.com'], attendees: ['Kim'], optionalAttendees: ['Dev'], bodyContent: 'Agenda: the v2 schema', location: 'Room 4', isOnlineMeeting: false, recurrence: { pattern: { type: 'weekly', interval: 1 } } } },
	{ tool: 'calendar-CreateEvent', args: { subject: 'Sync', start: '2026-10-21T09:00:00Z', end: '2026-10-21T09:30:00Z', attendees: ['Rita'] } },
	{ tool: 'x-other', args: { action: 'poke', id: 3, nested: { deep: 'value-9' } } },
	// Round 5: an unusual thread action, both start and both end keys, and a pullRequestId that is not a number.
	{ tool: 'ado-repo_pull_request_thread_write', args: { action: 'resolve', ...ARGS_PR, threadId: 9, content: 'Closing this.' } },
	{ tool: 'calendar-CreateEvent', args: { subject: 'Both', startDateTime: '2026-10-22T10:00:00', start: '2026-10-22T11:00:00', endDateTime: '2026-10-22T10:30:00', end: '2026-10-22T11:30:00', attendeeEmails: ['kim@acme.com'] } },
	{ tool: 'x-other', args: { action: 'poke', pullRequestId: 'https://dev.azure.com/x/_git/r/pullrequest/77' } },	{ tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', pullRequestId: 'PR-77', content: 'Hello there.' } },
]
// A thread's known actions are shown by their verb; any other action must be shown as sent.
const THREAD_VERB: Record<string, string> = { create: 'comment', reply: 'reply', update: 'edit', update_status: 'set thread' }
// Every value a call sends, with the key it sits under; arrays and objects at any depth, so each updates[] entry counts.
const leaves = (v: unknown, key = ''): [string, string][] => Array.isArray(v) ? v.flatMap(x => leaves(x, key)) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => leaves(x, k)) : [[key, String(v)]]
// A time may be shown without its seconds; the action and the vote value are shown as words (tested in golden 10-21).
// A value counts as shown only as a whole word, so "2" is not found inside "1234".
const asWord = (hay: string, v: string) => new RegExp(`(^|[^\\w])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w])`).test(hay)
const showsValue = (hay: string, v: string) => asWord(hay, v) || /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v) && asWord(hay, v.replace('T', ' ').slice(0, 16))

test('review 10-21d P1: no argument a change sends is hidden from the owner, in the self-chat line or on the card', async () => {
	const { changeSays } = await import('../src/core/effects.ts')
	const { view } = await import('../src/web/view.ts')
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const effects = SENT.map(call => ({ system: 'x', action: 'x', target: 'x', summary: 'x', call }))
	store.save({ ...store.byCode('A1')!, state: 'needs_human', effects })
	const card = view(store, undefined).needs.find(c => c.code === 'A1')!
	for (const [i, e] of effects.entries()) {
		const say = changeSays(e), c = card.changes[i], seen = `${c.summary}\n${c.target}\n${c.detail ?? ''}`
		const thread = /thread/.test(e.call.tool), cardAll = `${seen}\n${c.action}`
		for (const [k, v] of leaves(e.call.args).filter(([k]) => k !== 'vote' && (k !== 'action' || thread))) {
			const word = k === 'action' ? THREAD_VERB[v] ?? v : v
			assert.ok(showsValue(say, word), `${e.call.tool} ${k}=${v} is in the self-chat line: ${say}`)
			assert.ok(showsValue(k === 'action' ? cardAll : seen, word), `${e.call.tool} ${k}=${v} is on the card: ${seen}`)
		}
	}	assert.equal(changeSays(effects[3]), 'PR comment (create) on PR 1234: repositoryId: web; project: Globex; comment: The words are here, not in content.', 'a comment without content is shown with every argument')
	assert.match(changeSays(effects[8]), /2026-10-21 09:00 Z to 2026-10-21 09:30 Z/, 'a time sent in UTC says so')
	assert.match(changeSays(effects[7]), /2026-10-20 16:00 to 2026-10-20 16:30 \(Pacific Standard Time\)/, 'a time zone sent with the call is named')
})

// R-NEX-11: what the Numbers tab counts is written to the log as it happens (design-spec/north-star-tab.md, "What the log must add").
const logged = (event: string) => store.logs(2).filter(e => e.event === event)
const askOf = (code: string) => store.thread(store.byCode(code)!.id).filter(m => !m.byOwner).at(-1)!.at
const atOf = (id: string) => src.chats[CHAT].find(m => m.id === id)!.at

test('R-NEX-11 log: a reply sent from Delegate carries when the ask was sent; one typed in Teams closes with closedBy replied, the ask, and the reply time', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const ask = askOf('A1')
	src.post('self', 'me', 'ok A1'); await go()
	assert.deepEqual(Object.entries(logged('sent').at(-1)!).filter(([k]) => ['code', 'askAt', 'unchanged'].includes(k)), [['code', 'A1'], ['unchanged', true], ['askAt', ask]])
	assert.equal(logged('state').find(e => e.code === 'A1' && e.to === 'done')!.closedBy, undefined, 'a send closes with its sent line, not a closedBy')
	src.post(CHAT, 'me', '[as Kim] Banner?'); await go()
	const ask2 = askOf('A2'), mine = src.post(CHAT, 'me', 'Shipping Friday.')
	await go()
	const c = logged('state').find(e => e.code === 'A2' && e.to === 'done')!
	assert.deepEqual([c.closedBy, c.askAt, c.replyAt], ['replied', ask2, atOf(mine)])
	assert.ok(Date.parse(ask2) > Date.parse(ask), 'the ask of this turn, not the one answered before')
})

test('R-NEX-11 log: when the owner already replied in Teams as they say ok, the close keeps the ask and reply times, with or without changes', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	const ask = askOf('A1'), mine = src.post(CHAT, 'me', 'Ring 0, Ravi.')
	src.post(CHAT, 'me', 'More later.')
	src.post('self', 'me', 'ok A1'); await go()
	const c = logged('state').find(e => e.code === 'A1' && e.to === 'done')!
	assert.deepEqual([c.closedBy, c.askAt, c.replyAt, logged('sent').length], ['replied', ask, atOf(mine), 0], 'the wait ends at the first reply')
	src.post(CHAT, 'me', '[as Kim] Can you review PR 1?')
	effectTools(); script = needsJob(); jf.job = review
	await go(); await go()
	const code = store.workflows().find(w => w.asker?.name === 'Kim')!.code, ask2 = askOf(code)
	await see(code)
	const mine2 = src.post(CHAT, 'me', 'Reviewed it, Kim.')
	src.post('self', 'me', `ok ${code}`); await go()
	const c2 = logged('state').find(e => e.code === code && e.to === 'done')!
	assert.deepEqual([c2.closedBy, c2.askAt, c2.replyAt], ['replied', ask2, atOf(mine2)])
})

test('R-NEX-11 log: a job\'s "Nothing needed" closes with its own closedBy, apart from a message that needed nothing', async () => {
	script = needsJob(); jf.job = (_: string, id: string): Report => ({ workflowId: id, intent: 'pr_review', state: 'done', summary: 'Already merged by Dev' })
	src.post(CHAT, 'me', '[as Kim] Can you review PR 1?'); await go(); await go()
	script = (_: string, workflowId: string): Report => ({ workflowId, intent: 'none', state: 'done', summary: 'Thanks only', fyi: { line: 'Rita said thanks', weight: 'normal' } })
	src.post(CHAT, 'me', '[as Rita] Thanks!'); await go()
	assert.deepEqual(logged('state').filter(e => e.to === 'done').map(e => [e.code, e.closedBy]), [['A1', 'job'], ['A2', 'nothing']])
	assert.equal(store.byCode('A1')!.closedBy, 'job')
	script = draft('Glad it helped.')
	src.post('self', 'me', 'mine A2'); await go()
	const reopened = logged('state').find(e => e.code === 'A2' && e.from === 'done')!
	assert.deepEqual([reopened.to, 'closedBy' in reopened], ['running', false], 'reopening is not a close')
	await see('A2'); src.post('self', 'me', 'ok A2'); await go()
	const sentClose = logged('state').filter(e => e.code === 'A2' && e.to === 'done').at(-1)!
	assert.deepEqual([store.byCode('A2')!.status.startsWith('Sent'), 'closedBy' in sentClose], [true, false], 'a later close by a send does not keep the earlier reason')
})

test('R-NEX-11 log: applying changes records the items, and how many changes were kept and how many removed', async () => {
	src.post(CHAT, 'me', '[as Kim] Can you review PR 1?')
	effectTools(); script = needsJob(); jf.job = review
	await go(); await go()
	jf.job = executed(1)
	await see('A1')
	src.post('self', 'me', 'ok A1 except 1'); await go(); await go()
	const e = logged('job-executed').at(-1)!
	assert.deepEqual([e.items, e.kept, e.removed, e.left], [['A1'], 1, 1, 0])
})

test('bug 10-21 unchanged: a draft the owner edited and then approved is logged as changed', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'edit A1: Ring 1 on Friday.'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	const s = logged('sent').at(-1)!
	assert.deepEqual([s.text, s.draft, s.unchanged], ['Ring 1 on Friday.', 'It is in ring 0.', false])
	src.post(CHAT, 'me', '[as Kim] Banner?'); await go()
	await see('A2'); src.post('self', 'me', 'ok A2'); await go()
	assert.deepEqual([logged('sent').at(-1)!.code, logged('sent').at(-1)!.unchanged], ['A2', true], 'an ok on the draft as shown is still unchanged')
})

test('R-NEX-11 log: a send says whether it was edited and whether it only holds; a mark and a posted correction name the send they are about', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	await see('A1'); src.post('self', 'me', 'ok A1'); await go()
	const s1 = logged('sent').at(-1)!
	assert.deepEqual([s1.v, s1.edited, 'holding' in s1], [2, false, false])
	src.post('self', 'me', 'send A1: Correction: it is ring 1.'); await go()
	assert.equal(logged('correction').at(-1)!.sentId, s1.msgId)
	src.post('self', 'me', 'wrong A1: it is ring 2'); await go()
	assert.equal(logged('marked').at(-1)!.sentId, s1.msgId)
	script = (_: string, workflowId: string): Report => ({ workflowId, intent: 'status_next_step', state: 'needs_human', summary: 'Could not', goalMet: false, blocker: { kind: 'tool', why: 'No doc tool', tried: [] }, reply: { text: 'Checking the doc now.', commitment: false, sources: [] } } as Report)
	src.post(CHAT, 'me', '[as Kim] Can you share the doc?'); await go()
	const code = store.workflows().find(w => w.asker?.name === 'Kim')!.code
	await see(code); src.post('self', 'me', `ok ${code}`); await go()
	const h = logged('sent').at(-1)!
	assert.deepEqual([h.code, h.holding, h.edited], [code, true, false])
})

test('bug 10-21 unchanged: the owner\'s words on an item with no draft are edited, and an old edit does not mark the next new draft', async () => {
	script = (_: string, workflowId: string): Report => ({ workflowId, intent: 'status_next_step', state: 'needs_human', summary: 'Needs a date', question: 'Which date?' })
	src.post(CHAT, 'me', '[as Ravi] When does it ship?'); await go()
	assert.equal(store.byCode('A1')!.draft, undefined)
	src.post('self', 'me', 'edit A1: Friday.'); await go()
	src.post('self', 'me', 'ok A1'); await go()
	assert.deepEqual([logged('sent').at(-1)!.code, logged('sent').at(-1)!.unchanged, logged('sent').at(-1)!.edited], ['A1', false, true], 'the owner\'s own words')
	script = draft('It is in ring 0.')
	src.post(CHAT, 'me', '[as Kim] Status?'); await go()
	const code = store.workflows().find(w => w.asker?.name === 'Kim')!.code
	src.post('self', 'me', `edit ${code}: Ring 0, Kim.`); await go()
	src.post('self', 'me', `${code}: say it is ring 1 now`); await go()
	assert.deepEqual([store.byCode(code)!.draft?.text, store.byCode(code)!.learnAfter], ['It is in ring 0.', undefined], 'a new draft from the run')
	await see(code); src.post('self', 'me', `ok ${code}`); await go()
	assert.deepEqual([logged('sent').at(-1)!.code, logged('sent').at(-1)!.unchanged, logged('sent').at(-1)!.edited], [code, true, false], 'the edit was replaced before anything went out')
})

test('bug 10-21 unchanged: an edit replaced by a picked option, or by a job\'s new result, does not mark what goes out', async () => {
	script = meetingReport
	src.post(CHAT, 'me', '[as Arun] Shall we meet at 3?'); await go()
	src.post('self', 'me', 'edit A1: Let us meet at 5.'); await go()
	src.post('self', 'me', 'A1: 2'); await go()
	assert.deepEqual([store.byCode('A1')!.draft?.byOwner, store.byCode('A1')!.learnAfter], [undefined, undefined], 'the option is Delegate\'s words')
	await see('A1'); src.post('self', 'me', 'ok A1'); await go()
	assert.deepEqual([logged('sent').at(-1)!.code, logged('sent').at(-1)!.unchanged, logged('sent').at(-1)!.edited], ['A1', true, false], 'the picked option, as drafted')
	src.post(CHAT, 'me', '[as Kim] Can you review PR 1?')
	effectTools(); script = needsJob(); jf.job = review
	await go(); await go()
	const code = store.workflows().find(w => w.asker?.name === 'Kim')!.code
	await see(code); src.post('self', 'me', `edit ${code}: Looks fine to me.`); await go()
	assert.deepEqual([store.byCode(code)!.draft?.byOwner, store.byCode(code)!.learnAfter?.sent], [true, 'Looks fine to me.'])
	src.post('self', 'me', `${code}: check the second file too`); await go(); await go()
	assert.equal(store.byCode(code)!.learnAfter, undefined, 'the job\'s new result replaced the edit')
	assert.equal(store.byCode(code)!.draft?.text, 'Left 2 comments on PR 1.', 'the job\'s new result')
	jf.job = executed(0, 1)
	await see(code); src.post('self', 'me', `ok ${code}`); await go(); await go()
	assert.deepEqual([logged('sent').at(-1)!.code, logged('sent').at(-1)!.unchanged, logged('sent').at(-1)!.edited], [code, true, false])
})

test('bug 10-21 unchanged: a skipped draft, or a run that falls short, drops the owner\'s earlier edit', async () => {
	src.post(CHAT, 'me', '[as Ravi] Status?'); await go()
	src.post('self', 'me', 'edit A1: Ring 0.'); await go()
	assert.ok(store.byCode('A1')!.learnAfter)
	src.post('self', 'me', 'skip A1'); await go()
	assert.equal(store.byCode('A1')!.learnAfter, undefined)
	src.post(CHAT, 'me', '[as Kim] Can you share the doc?'); await go()
	const code = store.workflows().find(w => w.asker?.name === 'Kim')!.code
	src.post('self', 'me', `edit ${code}: Here it is.`); await go()
	script = (_: string, workflowId: string): Report => ({ workflowId, intent: 'status_next_step', state: 'needs_human', summary: 'Could not', goalMet: false, blocker: { kind: 'tool', why: 'No doc tool', tried: [] }, reply: { text: 'Checking the doc now.', commitment: false, sources: [] } } as Report)
	src.post('self', 'me', `${code}: send the new version`); await go()
	assert.deepEqual([store.byCode(code)!.draft?.text, store.byCode(code)!.learnAfter], ['Checking the doc now.', undefined])
})

test('R-NEX-11 numbers after next action: a vote cast as proposed is handled; a vote dropped because the PR closed is not, though its reply went out as drafted', async () => {
	const { numbersOf } = await import('../src/store/numbers.ts')
	voteSetup(); calls.length = 0
	script = promise()
	src.post(CHAT, 'me', `[as Kim] Updated the description, can you approve? ${PR_URL}`); await goPr(); await goPr()
	await see('A1'); src.post('self', 'me', 'ok A1'); await goPr()
	await makeChanges([0]); await goPr()
	const ex = logged('job-executed').at(-1)!
	assert.deepEqual([ex.items, ex.kept, ex.removed, ex.left], [['A1'], 1, 0, 0])
	src.post(CHAT, 'me', `[as Rita] Can you approve it too? ${PR_URL}`); await goPr(); await goPr()
	const code = store.workflows().find(w => w.asker?.name === 'Rita')!.code
	prNow = { ...prNow, status: 'completed' }
	await see(code); src.post('self', 'me', `ok ${code}`); await goPr()
	src.post('self', 'me', `ok ${code}`); await goPr()
	const s = logged('sent').at(-1)!
	assert.deepEqual([s.code, s.unchanged, s.changesOff], [code, true, 1])
	const n = numbersOf(store, 'this')
	assert.deepEqual([n.handled.codes, n.handled.changes, n.now.replies.drafted], [['A1'], ['A1'], ['A1', code]], 'two oks, and a reply that counted on the vote')
})

// Owned work, slice 1 (reviews/eng-owned-work.md): deploy, watch, and report on an existing PR; the owner tests.
// Kim asks the owner to validate their flows; a validate job proposes a deploy of the PR's build to a test ring.
const OWN_PR = 'https://dev.azure.com/acme/Globex/_git/web/pullrequest/4200002'
const TEST3 = 3003, INT = 3999, BUILD = 9100001, HEAD = '3fa91c2abc1234', MERGE = 'e195bed16d8007'
type Run = { id: number; by: string; at: string; status: string; result?: string }
const deployCall = (pipelineId = TEST3, extra: Record<string, unknown> = {}) => ({ tool: 'ado-pipelines_write', args: { action: 'run_pipeline', project: 'Globex', pipelineId, resources: { pipelines: { ci: { runId: BUILD } } }, ...extra } })
const deployEffect = (over: Partial<Eff> = {}): Eff => ({ system: 'ado', action: 'deploy', target: 'TEST3', summary: 'Deploy build 9100001 to TEST3', call: deployCall(), head: HEAD, ...over })
const ringTable = [{ label: 'TEST3', text: 'TEST3: nothing running; last run 900 by Kim Lee, succeeded' }, { label: 'TEST1', text: 'TEST1: run 950 by Pete Ross running now' }]
let ringRuns: Run[], buildNow: Map<number, { status: string; result?: string; branch?: string; version?: string; repo?: string }>
// The PR's CI build as the owner's server lists it: from the PR's merge ref, at its merge commit (dry run 10-21).
const prBuild = () => ({ status: 'completed', result: 'succeeded', branch: 'refs/pull/4200002/merge', version: MERGE })
// Pipelines as Azure DevOps names them; 32000 is int under a test-looking ring name.
const DEFS: Record<number, { name: string; path?: string }> = { [TEST3]: { name: 'Web-deploy-test3', path: '\\Web\\release\\test' }, 3001: { name: 'Web-deploy-test1' }, [INT]: { name: 'Web-deploy-int' }, 32000: { name: 'Web-deploy-int2' } }
const ringReads: number[] = []
const ownProbe = {
	builds: async (_p: string, ids: number[]) => new Map(ids.map(id => [id, buildNow.get(id) ?? { status: 'inProgress' }])),
	pr: async (_p: string, _r: string, id: number) => { prReads.push(id); return prNow },
	runs: async (_p: string, id: number) => { ringReads.push(id); return ringRuns },
	definition: async (project: string, id: number) => (project.toLowerCase() === 'globex' ? DEFS[id] : undefined),
}
const goOwn = () => tick(store, { source: src, run, procs, force: true, history: noList, probe: ownProbe })
const ownSetup = (allowed: { pipelineId: number; ring: string; project: string; name?: string; params?: Record<string, string> }[] = [{ pipelineId: TEST3, ring: 'TEST3', project: 'Globex' }], extra: Partial<Config> = {}) => {
	prNow = { status: 'active', votes: [{ name: 'Robin Park', vote: 0 }], head: HEAD, title: '[TEST ONLY] Route the test ring to a dev instance', author: 'Robin Park', required: [], autoComplete: false, merge: MERGE, branch: 'refs/heads/user/robin/ss-endpoint', repo: 'web' } as PrNow
	ringRuns = [{ id: 900, by: 'Kim Lee', at: '2026-10-20T08:00:00Z', status: 'completed', result: 'succeeded' }]
	buildNow = new Map([[BUILD, prBuild()]]); ringReads.length = 0; prReads.length = 0; calls.length = 0
	const cfg = store.config()
	store.saveConfig({ ...cfg, agent: { ...cfg.agent, tools: ['ado-repo_pull_request', 'ado-pipelines_build'], effectTools: [], mcpServers: { ado: { command: 'delegate-test-no-such-server' } } }, deploy: { allowed }, ...extra })
}
const validateWorker = (_: string, workflowId: string): Report => ({ workflowId, intent: 'validate', state: 'needs_human', summary: 'Needs a deploy and a test', job: { key: 'pr:acme/web/4200002', goal: 'Validate PR 4200002 against the dev instance' } })
const proposal = (effects: Eff[] = [deployEffect()], over: Partial<Report> = {}) => (_: string, jobId: string): Report => ({
	workflowId: jobId, intent: 'validate', state: 'needs_human', summary: 'Ready to deploy build 9100001 to TEST3', context: ringTable, effects,
	work: { goal: 'The owner\'s flows work against the dev instance, or what blocks them is reported', step: 'Read the rings', plan: [{ what: 'Deploy to TEST3', who: 'me' }, { what: 'Test the flows', who: 'you' }] }, ...over,
})
// The validate job's runs: work runs answer from the script given; a change run waits for make_change.
const validateJob = (...work: ((p: string, id: string) => Report)[]) => { let n = 0; jf.job = (p, id) => (/Approved changes, in order/.test(p) ? undefined : work[Math.min(n++, work.length - 1)](p, id)) }
const askToValidate = async () => { script = validateWorker; src.post(CHAT, 'me', `[as Kim] The dev instance is up. Can you validate your flows against it? ${OWN_PR}`); await goOwn(); await goOwn() }
const okOwn = async (code = 'A1') => { await see(code); src.post('self', 'me', `ok ${code}`); await goOwn() }
const deployer = async (server: string, tool: string, args: Record<string, unknown>) => { calls.push({ server, tool, args }); return { id: 77001, state: 'inProgress' } }
const makeDeploy = async (caller = deployer) => {
	const { makeChange } = await import('../src/runner/change.ts')
	const job = store.jobs().find(j => j.purpose === 'execute' && j.run)!
	const out = await makeChange(store, job.id, job.run!.id, 0, caller, ownProbe)
	store.writeReport({ workflowId: job.id, intent: 'other', state: 'done', summary: 'Ran the pipeline' }, job.run!.id)
	jf.dead.add(job.run!.pid)
	await goOwn()
	return out
}

test('owned work: a proposal, then ok, makes exactly the approved deploy; its run becomes a plan step with a build check', async () => {
	ownSetup(); validateJob(proposal())
	await askToValidate()
	let wf = store.byCode('A1')!
	assert.equal(wf.intent, 'validate')
	assert.deepEqual(wf.context, ringTable, 'the job reports the ring table: each ring\'s running and last run, and who started them')
	assert.deepEqual(wf.effects!.map(e => e.deploy), [{ ring: 'TEST3', pr: 4200002 }], 'the ring and PR come from the allowlist and the item, never the AI\'s words')
	assert.deepEqual(wf.effects![0].ring?.last, ringRuns[0], 'the ring as Azure DevOps lists it is read before the ok')
	const { renderItem } = await import('../src/core/render.ts')
	assert.match(renderItem(wf, 'full', new Date(), false), /ok will: Deploy build 9100001 \(PR 4200002 @ 3fa91c2\) to TEST3 \(nothing running; last run 900 by Kim Lee at .*, succeeded\)/)
	assert.match(renderItem(wf, 'full', new Date(), false), /TEST1: run 950 by Pete Ross running now/, 'the ring table shows on the card')
	const exec = () => jf.starts.filter(s => /Approved changes, in order/.test(s.prompt))
	assert.deepEqual([exec().length, calls.length], [0, 0], 'nothing runs before the ok')
	await okOwn()
	assert.equal(exec().length, 1, 'the ok starts one change run')
	assert.ok(!exec()[0].tools.some(t => /pipelines_write/.test(t)), 'it holds no raw write tool')
	assert.deepEqual(await makeDeploy(), { ref: '77001' })
	assert.deepEqual(calls, [{ server: 'ado', tool: 'pipelines_write', args: deployCall().args }], 'exactly the approved call')
	wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.status], ['open', 'Deploying build 9100001 to TEST3 (run 77001)'], 'nothing to send: the work goes on')
	const p = wf.work!.plan!.find(x => x.ring)!
	assert.deepEqual([p.who, p.probe, p.ring], ['me', { build: 77001, project: 'Globex' }, { name: 'TEST3', pipelineId: TEST3, project: 'Globex', run: 77001 }], 'the run ID is a plan step with a build check')
	buildNow.set(77001, { status: 'completed', result: 'succeeded' }); store.saveProbeMark({}); await goOwn()
	assert.ok(store.byCode('A1')!.work!.plan!.find(x => x.ring)!.done, 'the build check marks it done with no AI')
	assert.equal(calls.length, 1)
})

test('owned work: a ring that moves between the ok and the call is not deployed to', async () => {
	ownSetup(); validateJob(proposal())
	await askToValidate(); await okOwn()
	ringRuns = [{ id: 902, by: 'Pete Ross', at: '2026-10-21T14:20:00Z', status: 'notStarted' }, ...ringRuns]
	const out = await makeDeploy()
	assert.match(out.error!, /^Not deployed: TEST3: a new run 902 by Pete Ross at .*, since you saw it\. Say "ok A1" to draw it again\.$/)
	assert.equal(calls.length, 0, 'read right before the call; nothing run')
	src.post('self', 'me', 'ok A1'); await goOwn()
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: TEST3: a new run 902 by Pete Ross/, 'the next ok draws it again')
})

test('owned work: no ok means no call', async () => {
	ownSetup(); validateJob(proposal())
	await askToValidate(); await goOwn(); store.saveProbeMark({}); await goOwn()
	assert.equal(store.byCode('A1')!.state, 'needs_human')
	assert.deepEqual([store.jobs().some(j => j.purpose === 'execute'), calls.length], [false, 0])
	const { makeChange } = await import('../src/runner/change.ts')
	const job = store.job(store.byCode('A1')!.job!)!
	assert.match((await makeChange(store, job.id, 'r0', 0, deployer, ownProbe)).error!, /not approved/, 'make_change refuses a deploy with no ok')
	assert.equal(calls.length, 0)
})

test('owned work: a pipeline off the allowlist becomes a to-do with the reason, and the repo\'s rings are proposed for Settings', async () => {
	ownSetup([])
	const targets = [{ pipelineId: 3001, ring: 'TEST1', project: 'Globex', from: '.github/config/deploy-config.json @ abc1234' }, { pipelineId: TEST3, ring: 'TEST3', project: 'Globex' }, { pipelineId: INT, ring: 'INT', project: 'Globex' }, { pipelineId: 32000, ring: 'TEST5', project: 'Globex' }]
	validateJob(proposal([deployEffect()], { deployTargets: targets }))
	await askToValidate()
	const wf = store.byCode('A1')!
	assert.deepEqual(wf.effects ?? [], [])
	assert.deepEqual(wf.todos!.filter(t => !t.startsWith('Clone ')), ['Deploy build 9100001 to TEST3. Not made for you: pipeline 3003 is not on "Where Delegate may deploy" in Settings'])
	assert.equal(store.jobs().some(j => j.purpose === 'execute'), false)
	const d = store.config().deploy!
	assert.deepEqual([d.allowed, d.proposed!.map(t => t.pipelineId), d.never], [[], [3001, TEST3], [INT, 32000]], 'test rings are proposed; int is never, by the repo\'s name and by its real name in Azure DevOps (review 10-21 P2-7)')
	const { settingsView, saveSetting } = await import('../src/web/settings.ts')
	assert.match(settingsView(store).rows.find(r => r.key === 'deployTo')!.help, /Proposed from your repo: TEST1 Globex\/3001 \("Web-deploy-test1" in Globex\), TEST3 Globex\/3003 \("Web-deploy-test3" in Globex\)\. Save the ones you allow\./, 'each with its real name and project')
	assert.deepEqual((await saveSetting(store, 'deployTo', 'TEST3 3003', { probe: ownProbe })).ok, true, 'the owner confirms once')
	assert.deepEqual(store.config().deploy!.allowed, [{ pipelineId: TEST3, ring: 'TEST3', project: 'Globex', name: 'Web-deploy-test3' }])
	assert.deepEqual(store.config().deploy!.proposed!.map(t => t.pipelineId), [3001])
	// Bug 10-21 dry run: the old refusal stayed next to the same deploy once it was allowed.
	const j = store.job(store.byCode('A1')!.job!)!
	const { finishWork } = await import('../src/runner/jobs.ts')
	finishWork(store, { ...j, state: 'running' }, proposal()('', j.id), j.asks.length)
	const again = store.byCode('A1')!
	assert.deepEqual([again.effects!.map(e => e.summary), again.todos!.filter(t => !t.startsWith('Clone '))], [['Deploy build 9100001 to TEST3'], []], 'bug 10-21 dry run: a refusal goes once the same change is allowed')
})

test('owned work: the int or production pipeline ID is never allowed, even if listed', async () => {
	const { refusal } = await import('../src/core/effects.ts')
	ownSetup([], { deploy: { allowed: [{ pipelineId: INT, ring: 'INT', project: 'Globex' }, { pipelineId: 31000, ring: 'Production EU', project: 'Globex' }, { pipelineId: 32000, ring: 'TEST5', project: 'Globex' }, { pipelineId: TEST3, ring: 'TEST3', project: 'Globex' }], never: [32000] } })
	const cfg = { ...store.config(), agent: { ...store.config().agent, effectTools: ['ado-pipelines_write'] } }
	const why = (call: { tool: string; args: Record<string, unknown> }) => refusal(cfg, deployEffect({ call }), 4200002)
	assert.equal(why(deployCall(INT)), 'pipeline 3999 is INT, a shared or production ring; Delegate never deploys there')
	assert.equal(why(deployCall(31000)), 'pipeline 31000 is Production EU, a shared or production ring; Delegate never deploys there')
	assert.equal(why(deployCall(32000)), 'pipeline 32000 is TEST5, a shared or production ring; Delegate never deploys there', 'an ID the repo calls int stays never under another name: IDs decide')
	assert.equal(why(deployCall(TEST3, { yamlOverride: 'steps: []' })), 'a deploy runs the pipeline as it is; yamlOverride is not allowed')
	assert.equal(why(deployCall(TEST3)), undefined)
	assert.equal(refusal(cfg, deployEffect({ head: undefined }), 4200002), 'a deploy must name the PR head commit its build is from')
	assert.equal(refusal(cfg, deployEffect(), undefined), 'a deploy must be for this item\'s PR')
	assert.equal(why({ ...deployCall(), args: { ...deployCall().args, resources: { repositories: { self: { refName: 'refs/heads/main' } } } } }), 'a deploy\'s resources must be exactly one PR build')
	assert.equal(why({ ...deployCall(), args: { ...deployCall().args, pipelineId: 'TEST3' } }), 'a deploy must name its pipeline by number in pipelineId')
	assert.equal(refusal({ ...cfg, deploy: { allowed: [{ pipelineId: TEST3, ring: 'TEST3', project: 'Other' }] } }, deployEffect(), 4200002), 'pipeline 3003 is in Other, not Globex')
	const stage = { tool: 'ado-pipelines_write', args: { action: 'update_build_stage', project: 'Globex', buildId: 77001, stageName: 'Deploy', status: 'Retry' } }
	for (const c of [stage, { ...stage, args: { ...stage.args, status: 'Cancel' } }, { tool: 'ado-pipelines_write', args: { action: 'create_pipeline', name: 'x' } }, { tool: 'ado-pipelines_write', args: { action: 'rename_pipeline', pipelineId: TEST3, name: 'x' } }])
		assert.equal(refusal(cfg, deployEffect({ call: c }), 4200002), 'Delegate never creates, renames, or changes a pipeline, or cancels or retries its stages', 'even when the whole tool is allowed')
	const { saveSetting } = await import('../src/web/settings.ts')
	assert.match((await saveSetting(store, 'deployTo', 'TEST3 Globex/3003, INT Globex/3999', { probe: ownProbe })).text, /INT \(3999\) is a shared or production ring/)
	assert.match((await saveSetting(store, 'deployTo', 'TEST5 Globex/32000', { probe: ownProbe })).text, /TEST5 \(32000\) is a shared or production ring/)
})

test('owned review P1-1: a deploy call has exactly one shape; anything that could reach another ring is refused', async () => {
	const { refusal } = await import('../src/core/effects.ts')
	ownSetup([{ pipelineId: TEST3, ring: 'TEST3', project: 'Globex', params: { Debug: 'False' } }, { pipelineId: 3001, ring: 'TEST1', project: 'Globex' }, { pipelineId: 40001, ring: 'INT2', project: 'Globex' }, { pipelineId: 40002, ring: 'prod1', project: 'Globex' }, { pipelineId: 40003, ring: 'PPE1', project: 'Globex' }, { pipelineId: 40004, ring: 'TEST4', project: 'Globex', name: 'Web-deploy-Int3' }])
	const cfg = store.config()
	const why = (args: Record<string, unknown>, id = TEST3) => refusal(cfg, deployEffect({ call: { tool: 'ado-pipelines_write', args: { ...deployCall(id).args, ...args } } }), 4200002)
	assert.equal(why({}), undefined)
	assert.equal(why({ templateParameters: { Debug: 'False' } }), undefined, 'the parameters the owner confirmed for this pipeline')
	assert.equal(why({ resources: { builds: { ci: { id: BUILD } } } }), undefined)
	for (const [args, said] of [
		[{ pipelineVersion: 3 }, 'a deploy runs the pipeline as it is; pipelineVersion is not allowed'],
		[{ stagesToSkip: ['Validate'] }, 'a deploy runs the pipeline as it is; stagesToSkip is not allowed'],
		[{ resources: { pipelines: { ci: { runId: BUILD } }, repositories: { self: { refName: 'refs/heads/int' } } } }, 'a deploy\'s resources must be exactly one PR build'],
		[{ resources: { pipelines: { ci: { runId: BUILD }, other: { runId: 1 } } } }, 'a deploy\'s resources must be exactly one PR build'],
		[{ resources: { pipelines: { ci: { runId: BUILD, version: '1' } } } }, 'a deploy\'s resources must be exactly one PR build'],
		[{ resources: { containers: { c: { id: BUILD } } } }, 'a deploy\'s resources must be exactly one PR build'],
		[{ templateParameters: { Debug: 'True' } }, 'templateParameters Debug is not one you confirmed for TEST3'],
		[{ templateParameters: { deployToInt: 'true' } }, 'templateParameters deployToInt is not one you confirmed for TEST3'],
		[{ templateParameters: { Debug: { value: 'False' } } }, 'templateParameters Debug is not one you confirmed for TEST3'],
		[{ templateParameters: 'Debug=False' }, 'templateParameters must be names and values'],
	] as [Record<string, unknown>, string][]) assert.equal(why(args), said, JSON.stringify(args))
	assert.equal(why({ templateParameters: { Debug: 'False' } }, 3001), 'a deploy runs the pipeline as it is; templateParameters is not allowed', 'none unless confirmed for that pipeline')
	for (const id of [40001, 40002, 40003]) assert.match(why({}, id)!, /a shared or production ring; Delegate never deploys there$/, `a name with a number after it: ${id}`)
	assert.match(why({}, 40004)!, /a shared or production ring/, 'its real name decides too')
	const { saveSetting } = await import('../src/web/settings.ts')
	assert.equal((await saveSetting(store, 'deployTo', 'TEST3 Globex/3003 Debug=False', { probe: ownProbe })).ok, true)
	assert.deepEqual(store.config().deploy!.allowed, [{ pipelineId: TEST3, ring: 'TEST3', project: 'Globex', params: { Debug: 'False' }, name: 'Web-deploy-test3' }], 'the confirmed parameters are kept with the pipeline')
	assert.match((await saveSetting(store, 'deployTo', 'TEST3 Globex/3003 target=int1', { probe: ownProbe })).text, /is a shared or production ring/)
	assert.match((await saveSetting(store, 'deployTo', 'INT2 Globex/3003', { probe: ownProbe })).text, /INT2 \(3003\) is a shared or production ring/)
	assert.equal((await saveSetting(store, 'deployTo', 'TEST9 Globex/3999', { probe: ownProbe })).text, 'TEST9 (3999) is "Web-deploy-int" in Azure DevOps, a shared or production ring. Delegate never deploys there.', 'its real name decides when it is saved')
})

test('owned review P1-2: a pipeline is named with its project, in the call and on the list, read from Azure DevOps when saved', async () => {
	const { refusal } = await import('../src/core/effects.ts')
	ownSetup()
	const cfg = store.config()
	assert.equal(refusal(cfg, deployEffect({ call: { tool: 'ado-pipelines_write', args: { action: 'run_pipeline', pipelineId: TEST3, resources: { pipelines: { ci: { runId: BUILD } } } } } }), 4200002), 'a deploy must name its project')
	assert.equal(refusal(cfg, deployEffect({ call: deployCall(TEST3, { project: 'Acme-Other' }) }), 4200002), 'pipeline 3003 is in Globex, not Acme-Other')
	assert.equal(refusal(cfg, deployEffect({ call: deployCall(TEST3, { project: 'globex' }) }), 4200002), undefined, 'case does not matter')
	const legacy = { ...cfg, deploy: { allowed: [{ pipelineId: TEST3, ring: 'TEST3' } as never] } }
	assert.equal(refusal(legacy, deployEffect(), 4200002), 'pipeline 3003 has no project on "Where Delegate may deploy"; save it again in Settings')
	const { saveSetting } = await import('../src/web/settings.ts')
	assert.equal((await saveSetting(store, 'deployTo', 'TEST1 3001', { probe: ownProbe })).text, 'Name the project of TEST1, such as TEST1 Globex/3001.')
	assert.equal((await saveSetting(store, 'deployTo', 'TEST1 Acme-Other/3001', { probe: ownProbe })).text, 'There is no pipeline 3001 in Acme-Other.')
	assert.match((await saveSetting(store, 'deployTo', 'TEST1 Globex/3001')).text, /checked in Azure DevOps before it is saved, and Delegate has no Azure DevOps tool server set up/)
	assert.deepEqual(store.config().deploy!.allowed, [{ pipelineId: TEST3, ring: 'TEST3', project: 'Globex' }], 'nothing saved by a refused entry')
	assert.equal((await saveSetting(store, 'deployTo', 'TEST1 Globex/3001', { probe: ownProbe })).ok, true)
	assert.deepEqual(store.config().deploy!.allowed, [{ pipelineId: 3001, ring: 'TEST1', project: 'Globex', name: 'Web-deploy-test1' }])
	const { settingsView } = await import('../src/web/settings.ts')
	assert.equal(settingsView(store).rows.find(r => r.key === 'deployTo')!.value, 'TEST1 Globex/3001', 'what is shown saves back the same')
})

test('owned review P1-3: the build is read and must be the PR\'s, at its head, and good; the card line comes from the read', async () => {
	const off = async (build: Record<string, unknown>, said: RegExp) => {
		ownSetup(); buildNow.set(BUILD, { ...prBuild(), ...build }); validateJob(proposal())
		for (const w of store.workflows()) store.save({ ...w, state: 'done' })
		await askToValidate()
		const wf = store.workflows().filter(w => w.state !== 'done').at(-1)!
		assert.deepEqual(wf.effects!.filter(e => !e.off && !e.done), [], `${JSON.stringify(build)}: never offered`)
		assert.ok(wf.todos!.some(t => said.test(t)), `${JSON.stringify(build)}: ${wf.todos}`)
	}
	await off({ branch: 'refs/heads/main' }, /build 9100001 is from refs\/heads\/main, not PR 4200002$/)
	await off({ branch: 'refs/pull/1700000/merge' }, /build 9100001 is from refs\/pull\/1700000\/merge, not PR 4200002$/)
	await off({ version: 'aaaaaaa1111' }, /build 9100001 is from commit aaaaaaa, not PR 4200002 at its head 3fa91c2$/)
	await off({ result: 'failed' }, /build 9100001 has not succeeded \(completed, failed\)$/)
	await off({ status: 'inProgress', result: undefined }, /build 9100001 has not succeeded \(inprogress\)$/)
	await off({ repo: 'tools' }, /build 9100001 is from repo tools, not web$/)
	assert.equal(calls.length, 0)
})

test('owned review P1-3: a build that stops matching after the card is not deployed, at ok or right before the call', async () => {
	ownSetup(); validateJob(proposal(), proposal())
	await askToValidate()
	const { renderItem } = await import('../src/core/render.ts')
	assert.deepEqual(store.byCode('A1')!.effects![0].build, { id: BUILD, pr: 4200002, head: HEAD, version: MERGE, branch: 'refs/pull/4200002/merge', readAt: store.byCode('A1')!.effects![0].build!.readAt })
	assert.match(renderItem(store.byCode('A1')!, 'full', new Date(), false), /ok will: Deploy build 9100001 \(PR 4200002 @ 3fa91c2\) to TEST3 /, 'from the build as read')
	buildNow.set(BUILD, { ...prBuild(), branch: 'refs/heads/other' })
	await okOwn()
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: build 9100001 is from refs\/heads\/other, not PR 4200002, since you saw it\. Nothing was deployed\./)
	assert.equal(store.jobs().some(j => j.purpose === 'execute'), false)
	buildNow.set(BUILD, prBuild()); await goOwn(); await goOwn()
	await okOwn()
	buildNow.set(BUILD, { ...prBuild(), version: 'bbbbbbb2222' })
	const out = await makeDeploy()
	assert.match(out.error!, /^Not deployed: build 9100001 is from commit bbbbbbb, not PR 4200002 at its head 3fa91c2, since you saw it\./)
	assert.equal(calls.length, 0, 'read right before the call; nothing run')
	const { deployLine } = await import('../src/core/deploy.ts')
	assert.equal(deployLine({ ...deployEffect(), deploy: { ring: 'TEST3', pr: 4200002 } }), 'Deploy build 9100001 to TEST3 (build not checked yet)', 'the AI\'s head is never shown as the build\'s')
})

test('owned work: a late ok after the ring or head moved is refused and redrawn', async () => {
	ownSetup(); validateJob(proposal(), proposal([deployEffect({ summary: 'Deploy build 9100001 to TEST3 again' })]))
	await askToValidate()
	const unread = (es: Eff[] = []) => es.map(e => ({ ...e, ring: undefined }))
	const j = store.job(store.byCode('A1')!.job!)!
	store.saveJob({ ...j, result: { ...j.result!, effects: unread(j.result!.effects) } }); store.save({ ...store.byCode('A1')!, effects: unread(store.byCode('A1')!.effects) })
	await see('A1'); src.post('self', 'me', 'ok A1'); await tick(store, { source: src, run, procs, force: true, history: noList, probe: { ...ownProbe, runs: undefined } })
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: TEST3 and PR 4200002 must be read first, and no Azure DevOps server is set up\. Nothing was deployed\./)
	const { recheckDeploy } = await import('../src/runner/probe.ts')
	// A proposal described before builds were read has its ring but no build: the build is read and shown first (owned review P1-3).
	const ringOnly = (es: Eff[] = []) => es.map(e => ({ ...e, ring: { last: ringRuns[0], running: [], readAt: new Date().toISOString() }, build: undefined }))
	const j3 = store.job(store.byCode('A1')!.job!)!
	store.saveJob({ ...j3, result: { ...j3.result!, effects: ringOnly(j3.result!.effects) } }); store.save({ ...store.byCode('A1')!, effects: ringOnly(store.byCode('A1')!.effects) })
	const shownNow = store.byCode('A1')!, said = await recheckDeploy(store, shownNow, ownProbe); store.save(shownNow)
	assert.match(said!, /^Before you ok A1: Deploy build 9100001 \(PR 4200002 @ 3fa91c2\) to TEST3 \(nothing running; last run 900 by Kim Lee at .*\)\. Say "ok A1" to go ahead\.$/, 'a ring never shown is read and shown first')
	ringRuns = [{ id: 901, by: 'Dev Rao', at: '2026-10-21T14:10:00Z', status: 'inProgress' }, ...ringRuns]
	await okOwn()
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: TEST3: a new run 901 by Dev Rao at .*, inprogress, since you saw it\. Nothing was deployed\. Drawing the proposal again from what is there now\./)
	assert.equal(store.jobs().some(j => j.purpose === 'execute'), false, 'not run')
	assert.match(store.job(store.byCode('A1')!.job!)!.asks.at(-1)!, /not deployed: TEST3: a new run 901 by Dev Rao/, 'the job draws it again, knowing why')
	await goOwn(); await goOwn()
	let wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.effects?.filter(e => !e.off && !e.done).map(e => e.summary)], ['needs_human', ['Deploy build 9100001 to TEST3 again']], 'a fresh proposal, read against the ring as it is now')
	assert.equal(wf.effects!.find(e => !e.off)!.ring!.last!.id, 901)
	prNow = { ...prNow, head: 'beef00211223' }
	await okOwn()
	assert.match(src.chats.self.at(-1)!.body, /Not done A1: PR 4200002 has new commits, since you saw it\. Nothing was deployed\./, 'a moved head is refused too')
	wf = store.byCode('A1')!
	assert.deepEqual([store.jobs().some(j => j.purpose === 'execute'), calls.length], [false, 0])
})

test('owned work: an overwrite becomes news, and there is no redeploy without an ok', async () => {
	ownSetup(); validateJob(proposal(), proposal([deployEffect({ summary: 'Deploy build 9100001 to TEST3 again' })]))
	await askToValidate(); await okOwn(); await makeDeploy()
	buildNow.set(77001, { status: 'completed', result: 'succeeded' }); store.saveProbeMark({}); await goOwn()
	assert.deepEqual(store.byCode('A1')!.work!.steps.filter(s => s.news).map(s => s.what), ['Build 77001 succeeded (Deploy build 9100001 (PR 4200002) to TEST3: run 77001)'])
	const { mergePlan } = await import('../src/runner/work.ts')
	assert.ok(mergePlan(store.byCode('A1')!.work!.plan!, [{ what: 'Test the flows', who: 'you' }], new Date().toISOString()).some(p => p.ring?.run === 77001), 'a new plan that leaves the deploy out keeps it, so its ring stays watched')
	ringRuns = [{ id: 77020, by: 'Robin Park', at: '2026-10-21T08:20:00Z', status: 'completed', result: 'succeeded' }, { id: 77001, by: 'Robin Park', at: '2026-10-21T08:00:00Z', status: 'completed', result: 'succeeded' }]
	store.saveProbeMark({}); await goOwn()
	assert.ok(!store.byCode('A1')!.work!.steps.some(s => /redeployed/.test(s.what)), 'the owner\'s own run is not someone else\'s')
	ringRuns = [{ id: 77050, by: 'Dev Rao', at: '2026-10-21T08:40:00Z', status: 'inProgress' }, ...ringRuns]
	store.saveProbeMark({}); await goOwn()
	const news = store.byCode('A1')!.work!.steps.filter(s => s.news).map(s => s.what)
	assert.match(news.at(-1)!, /^TEST3 redeployed by Dev Rao at \d\d:\d\d \(run 77050\); results after that are not ours$/)
	store.saveProbeMark({}); await goOwn()
	assert.equal(store.byCode('A1')!.work!.steps.filter(s => /redeployed/.test(s.what)).length, 1, 'once')
	await goOwn(); await goOwn()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.effects?.filter(e => !e.done && !e.off).map(e => e.summary)], ['needs_human', ['Deploy build 9100001 to TEST3 again']], 'the news redraws the plan; a redeploy is only proposed')
	assert.deepEqual([store.jobs().some(j => j.purpose === 'execute'), calls.length], [false, 1], 'no redeploy without an ok')
})

test('owned work: a rule never deploys', async () => {
	ownSetup()
	setRules(rule({ who: { accounts: [{ id: 'test:kim', name: 'Kim' }] }, when: {} })); autoOn(); policy(0)
	validateJob(proposal([deployEffect()], { reply: { text: 'Deploying to TEST3 now.', commitment: false, sources: [] } }))
	const asked = (src.chats[CHAT] ?? []).length
	await askToValidate(); await goOwn()
	const wf = store.byCode('A1')!
	assert.deepEqual([wf.state, wf.effects!.filter(e => !e.done).length], ['needs_human', 1])
	assert.deepEqual([store.jobs().some(j => j.purpose === 'execute'), calls.length, src.chats[CHAT].length], [false, 0, asked + 1], 'nothing deployed and nothing sent by the rule')
})

test('owned work: only one pending change per work item at a time', async () => {
	ownSetup([{ pipelineId: TEST3, ring: 'TEST3', project: 'Globex' }, { pipelineId: 3001, ring: 'TEST1', project: 'Globex' }])
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, effectTools: ['ado-repo_pull_request_thread_write'] } })
	const comment = { system: 'ado', action: 'comment', target: 'PR 4200002', summary: 'Note the ring on the PR', call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', pullRequestId: 4200002, content: 'Deployed to TEST3' } } }
	validateJob(proposal([deployEffect(), deployEffect({ summary: 'Deploy to TEST1 too', call: deployCall(3001) }), comment]), proposal([deployEffect({ summary: 'Deploy again' })]))
	await askToValidate()
	let wf = store.byCode('A1')!
	assert.deepEqual(wf.effects!.map(e => e.summary), ['Deploy build 9100001 to TEST3'])
	assert.deepEqual(wf.todos!.filter(t => !t.startsWith('Clone ')), ['Deploy to TEST1 too. Not made for you: one change at a time with a deploy; propose it again after the deploy to TEST3 is made', 'Note the ring on the PR. Not made for you: one change at a time with a deploy; propose it again after the deploy to TEST3 is made'])
	await okOwn(); await makeDeploy()
	src.post('self', 'me', 'A1: check the ring again'); await goOwn(); await goOwn(); await goOwn()
	wf = store.byCode('A1')!
	assert.deepEqual(wf.effects?.filter(e => !e.done && !e.off) ?? [], [], 'while our deploy runs, another waits')
	assert.ok(wf.todos!.includes('Deploy again. Not made for you: the deploy to TEST3 is still running (run 77001); one change at a time'))
})

test('owned work: a 403 or timeout from the system under test is a finding in the report, not a blocker', async () => {
	ownSetup()
	const report = (_: string, jobId: string): Report => ({ workflowId: jobId, intent: 'validate', state: 'needs_human', summary: 'Create event returned 403 on TEST3',
		reply: { text: 'Tested on TEST3 (run 77001). Create event: 403 Forbidden ("EnsureNoMeetingId"), correlation 5f2c, request 14:12. Next: the dev instance owner.', commitment: false, sources: [{ ref: 'run 77001', tier: 'live', origin: 'extracted' }] },
		goalMet: false, blocker: { kind: 'access', why: 'TEST3 create event returned 403 Forbidden', tried: ['POST /events on TEST3'] } })
	validateJob(proposal(), report)
	await askToValidate(); await okOwn(); await makeDeploy()
	const now = new Date()
	src.post('self', 'me', 'A1: tested 14:00-15:30'); await goOwn()
	const job = store.job(store.byCode('A1')!.job!)!
	assert.match(job.asks.at(-1)!, /^Owner: "tested 14:00-15:30"\. The owner tested\. Read the results for 14:00 \(your time zone\) to 15:30 \(your time zone\) on TEST3 \(run 77001\) and draft the report\.$/)
	await goOwn(); await goOwn()
	const wf = store.byCode('A1')!
	assert.equal(wf.state, 'needs_human', 'held for the owner\'s ok')
	assert.match(wf.draft!.text, /403 Forbidden[\s\S]*Telemetry was not read: no telemetry tool server is set up\.$/, 'the report keeps the finding and says telemetry was not read')
	assert.equal(wf.draft!.holding, undefined, 'a result, not a holding reply')
	assert.deepEqual(wf.context?.at(-1), { label: 'Not reached', text: 'TEST3 create event returned 403 Forbidden', tone: 'warn' })
	assert.equal(store.job(wf.job!)!.retry, undefined, 'no retry: the 403 is the system\'s, not ours')
	assert.equal(wf.decision?.action, 'draft')
	assert.ok(!src.chats[CHAT].some(m => /403 Forbidden/.test(m.body) && m.at >= now.toISOString()), 'nothing sent before the ok')
	src.post('self', 'me', 'A1: tested'); await goOwn()
	assert.match(store.job(wf.job!)!.asks.at(-1)!, /^Owner: "tested"\. The owner tested\. Read the results for \d{4}-\d\d-\d\dT.* to \d{4}-.* on TEST3 \(run 77001\) and draft the report\.$/, 'plain "tested": from the deploy until now')
})

test('owned work: telemetry read tools only with a telemetry server; the prompt says what code decided', async () => {
	ownSetup(); validateJob(proposal())
	await askToValidate()
	const first = jf.starts[0]
	assert.ok(!first.tools.some(t => /kusto/.test(t)))
	assert.match(first.prompt, /- Only the changes and pipelines the prompt lists; never int or production\. Never cancel or retry a stage/, 'owned review P2-8: the gate says what is meant')
	assert.doesNotMatch(first.prompt, /shared ring/, 'the test rings it deploys to are shared')
	assert.match(first.prompt, /## Validate: deploy, watch, and report[\s\S]*Where you may deploy \(by pipeline ID; any other is refused\): TEST3 3003\.[\s\S]*Telemetry: no telemetry tool server is set up/)
	assert.match(first.prompt, /^Repo: dev\.azure\.com\/acme\/globex\/web; no clone on this machine, so read its files through Azure DevOps$/m, 'the repo is the PR link\'s remote')
	assert.equal(first.prompt.match(/^Repo: /gm)!.length, 1, 'bug 10-21 dry run: one Repo line')
	assert.match(first.prompt, /- ado-pipelines_write:run_pipeline: run a pipeline on "Where Delegate may deploy" with a PR's build as its resource\. Only these pipelines, by ID: TEST3 3003 \(Globex\)/)
	const cfg = store.config()
	store.saveConfig({ ...cfg, agent: { ...cfg.agent, mcpServers: { ...cfg.agent.mcpServers, kusto: { command: 'delegate-test-no-such-server' } } } })
	src.post('self', 'me', 'A1: tested'); await goOwn()
	const last = jf.starts.at(-1)!
	assert.ok(last.tools.includes('kusto-kusto_query') && !last.tools.some(t => /kusto_command|ingest/.test(t)), 'read-only telemetry tools')
	assert.match(last.prompt, /Telemetry: read it with kusto-kusto_query/)
})

test('owned work: no secrets in chat, knowledge, logs, or prompts', async () => {
	ownSetup()
	const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyb2JpbiJ9.c2lnbmF0dXJlLXZhbHVl'
	validateJob((_: string, jobId: string): Report => ({ workflowId: jobId, intent: 'validate', state: 'needs_human', summary: `Called with Authorization: Bearer ${jwt}`,
		reply: { text: `Tested. 200 OK with token ${jwt}, sig=abcdef0123456789 and "access_token": "s3cr3tvalue1".`, commitment: false, sources: [] },
		claims: [{ topic: 'Test rings', type: 'fact', text: `TEST3 takes api-key=abcd1234efgh`, src: [{ link: OWN_PR, date: '2026-10-21' }] }] }))
	await askToValidate()
	const wf = store.byCode('A1')!
	assert.equal(wf.draft!.text, 'Tested. 200 OK with token [hidden], sig=[hidden] and "access_token": "[hidden]".\n\nTelemetry was not read: no telemetry tool server is set up.')
	assert.equal(wf.status, 'Called with Authorization: Bearer [hidden]')
	assert.ok(!JSON.stringify(store.logs()).includes(jwt), 'logs')
	store.log({ event: 'x', header: `Bearer ${jwt}` })
	assert.ok(!JSON.stringify(store.logs()).includes(jwt))
	const { propose, knowledgeOf } = await import('../src/runner/proposals.ts')
	const [p] = propose(store, knowledgeOf(store, store.config()), [{ topic: 'Test rings', type: 'fact', text: 'TEST3 takes api-key=abcd1234efgh', src: [{ link: OWN_PR, date: '2026-10-21' }] }], 'remember')
	assert.equal(p.ops[0].entry.text, 'TEST3 takes api-key=[hidden]', 'knowledge')
	const prompts: string[] = []
	script = (p, id) => { prompts.push(p); return validateWorker(p, id) }
	src.post(CHAT, 'me', `[as Kim] Here is my token, use it: Bearer ${jwt}`); await goOwn()
	assert.ok(prompts.length && prompts.every(p => !p.includes(jwt) && p.includes('Bearer [hidden]')), 'the reply worker\'s prompt')
	assert.ok(jf.starts.every(s => !s.prompt.includes(jwt)), 'the job\'s prompt')
	const { scrub } = await import('../src/core/secrets.ts')
	assert.equal(scrub('correlation 5f2c9a1e-0b6d-4c1e-9a77-3f1d2e4b5a60, run 77001, 403 Forbidden'), 'correlation 5f2c9a1e-0b6d-4c1e-9a77-3f1d2e4b5a60, run 77001, 403 Forbidden', 'evidence stays')
})

// Repos by remote (eng-owned-work.md §d). local.json is per machine; a test writes its own code folder there.
const codeFolder = (code?: string) => {
	const f = join(process.env.DELEGATE_LOCAL!, 'local.json'), was = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}
	writeFileSync(f, JSON.stringify({ ...was, code: code ? [code] : undefined, clones: undefined, scannedAt: undefined }))
}
const fakeClone = (dir: string, url: string, branch: string) => { mkdirSync(join(dir, '.git'), { recursive: true }); writeFileSync(join(dir, '.git', 'config'), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`); writeFileSync(join(dir, '.git', 'HEAD'), `ref: refs/heads/${branch}\n`) }
const fakeWorktree = (main: string, dir: string, branch: string) => { const g = join(main, '.git', 'worktrees', 'wt'); mkdirSync(g, { recursive: true }); mkdirSync(dir, { recursive: true }); writeFileSync(join(g, 'HEAD'), `ref: refs/heads/${branch}\n`); writeFileSync(join(g, 'commondir'), '../..\n'); writeFileSync(join(dir, '.git'), `gitdir: ${g}\n`) }

test('owned work: a repo is named by its remote, however it is written', async () => {
	const { remoteOf, repoRef } = await import('../src/runner/repos.ts')
	const want = 'dev.azure.com/acme/globex/web'
	for (const s of ['https://acme.visualstudio.com/DefaultCollection/Globex/_git/web', 'https://acme.visualstudio.com/Globex/_git/web', 'https://robin@dev.azure.com/acme/Globex/_git/web', 'git@ssh.dev.azure.com:v3/acme/Globex/web', 'acme@vs-ssh.visualstudio.com:v3/acme/Globex/web', OWN_PR, 'https://dev.azure.com/acme/Globex/_git/web?path=/README.md'])
		assert.equal(remoteOf(s), want, s)
	assert.equal(remoteOf('git@github.com:Acme/Tools.git'), 'github.com/acme/tools')
	for (const s of ['/Users/me/src/web', 'C:\\src\\web', 'web', 'https://acme.sharepoint.com/sites/web']) assert.equal(remoteOf(s), undefined, `${s} is not a remote`)
	const cfg = { ...store.config(), repos: [{ name: 'Web', remote: 'https://acme.visualstudio.com/DefaultCollection/Globex/_git/web' }] }
	assert.equal(repoRef(cfg, 'web'), want, 'a name from Settings')
	assert.equal(repoRef(cfg, join(tmpdir(), 'no-such-clone')), undefined, 'a folder that is not a clone names none')
	const { saveSetting, settingsView } = await import('../src/web/settings.ts')
	assert.equal((await saveSetting(store, 'repos', 'Web https://acme.visualstudio.com/DefaultCollection/Globex/_git/web, https://dev.azure.com/acme/Globex/_git/tools')).ok, true)
	assert.deepEqual(store.config().repos, [{ name: 'Web', remote: 'https://acme.visualstudio.com/DefaultCollection/Globex/_git/web' }, { name: 'tools', remote: 'https://dev.azure.com/acme/Globex/_git/tools' }])
	assert.equal(settingsView(store).rows.find(r => r.key === 'repos')!.value, 'Web https://acme.visualstudio.com/DefaultCollection/Globex/_git/web, tools https://dev.azure.com/acme/Globex/_git/tools')
	assert.match((await saveSetting(store, 'repos', 'Web C:\\src\\web')).text, /Not a repo remote: C:\\src\\web/, 'a folder is never a repo')
	assert.equal(existsSync(join(store.root, 'local.json')), false, 'where clones are is never in the synced folder')
})

test('owned work: a URL is never used as a path; a missing clone becomes a to-do, not a failed job', async () => {
	ownSetup(); codeFolder(); validateJob(() => undefined as never); jf.job = () => undefined
	await askToValidate()
	const job = store.job(store.byCode('A1')!.job!)!
	assert.equal(job.remote, 'dev.azure.com/acme/globex/web', 'from the PR\'s own link')
	// A job written before this: its repo is the web link an AI once wrote (it failed "It needs the repo https://…").
	const url = 'https://dev.azure.com/acme/Globex/_git/web-validation'
	jf.dead.add(job.run!.pid); store.saveJob({ ...job, state: 'queued', run: undefined, remote: undefined, repo: url }); await goOwn()
	const after = store.job(job.id)!, start = jf.starts.at(-1)!
	assert.deepEqual([after.state, after.repo, after.remote], ['running', undefined, 'dev.azure.com/acme/globex/web-validation'], 'it runs, by remote')
	assert.notEqual(start.cwd, url)
	assert.ok(!jf.starts.some(s => s.cwd.includes('https:')), 'a URL is never a working folder')
	assert.ok(store.byCode('A1')!.todos!.includes('Clone web-validation on mac (git clone https://dev.azure.com/acme/globex/_git/web-validation), so work on it can use a local copy'), 'the missing clone is the owner\'s to-do')
	assert.doesNotMatch(store.byCode('A1')!.status, /did not finish|needs the repo/)
})

test('owned work: several clones prefer the one on the PR\'s source branch', async () => {
	const code = mkdtempSync(join(tmpdir(), 'delegate-code-'))
	fakeClone(join(code, 'web'), 'https://acme.visualstudio.com/DefaultCollection/Globex/_git/web', 'main')
	fakeWorktree(join(code, 'web'), join(code, 'web-ss-endpoint'), 'user/robin/ss-endpoint')
	fakeClone(join(code, 'other'), 'https://dev.azure.com/acme/Globex/_git/other', 'main')
	mkdirSync(join(code, 'node_modules', 'web'), { recursive: true })
	codeFolder(code)
	const { cloneFor, scanClones } = await import('../src/runner/repos.ts')
	assert.deepEqual(scanClones([code, code]), { 'dev.azure.com/acme/globex/web': [join(code, 'web'), join(code, 'web-ss-endpoint')], 'dev.azure.com/acme/globex/other': [join(code, 'other')] })
	assert.equal(cloneFor('dev.azure.com/acme/globex/web', 'refs/heads/user/robin/ss-endpoint'), join(code, 'web-ss-endpoint'))
	assert.equal(cloneFor('dev.azure.com/acme/globex/web', 'main'), join(code, 'web'))
	ownSetup(); jf.job = () => undefined
	script = (p, id) => ({ ...validateWorker(p, id), job: { ...validateWorker(p, id).job!, branch: 'refs/heads/user/robin/ss-endpoint' } })
	src.post(CHAT, 'me', `[as Kim] The dev instance is up. Can you validate your flows against it? ${OWN_PR}`); await goOwn()
	const start = jf.starts.at(-1)!
	assert.equal(start.cwd, join(code, 'web-ss-endpoint'), 'the run works in the clone on the PR\'s branch')
	assert.match(start.prompt, new RegExp(`Repo: dev\\.azure\\.com/acme/globex/web, cloned at ${join(code, 'web-ss-endpoint').replace(/[\\/.]/g, '\\$&')}$`, 'm'))
	assert.equal(store.byCode('A1')!.todos, undefined, 'no to-do when a clone is here')
	codeFolder()
})

test('owned review P2-5: only an answer that starts with "tested", or is just a window, asks for the report', async () => {
	const { saysTested } = await import('../src/runner/validate.ts')
	for (const t of ['tested', 'Tested 14:00-15:30', 'done testing, all good', 'finished testing', '14:00-15:30', ' 9:05 to 10:00 ']) assert.equal(saysTested(t), true, t)
	// Round 2 P2-3: a negation counts only before "tested"; after it, it is part of the result.
	for (const t of ['tested, no errors', 'tested — not reproducible', "tested; can't see any 500s", "I've tested, all fine", 'just tested 14:00-15:00']) assert.equal(saysTested(t), true, t)
	for (const t of ['tested? not yet', 'Tested on prod?', 'tested 14:00-15:00?']) assert.equal(saysTested(t), false, `${t}: a question keeps its path (round 3 P2-2)`)
	for (const t of ['not tested yet', "haven't tested", "I haven't tested yet", 'never tested it', 'who tested this?', 'Kim tested it on prod', 'deploy between 14:00-15:00', 'retested']) assert.equal(saysTested(t), false, t)
	ownSetup(); validateJob(proposal())
	await askToValidate(); await okOwn(); await makeDeploy()
	const asks = () => store.job(store.byCode('A1')!.job!)!.asks
	const before = asks().length
	src.post('self', 'me', 'A1: not tested yet, deploy between 14:00-15:00'); await goOwn()
	assert.ok(!asks().slice(before).some(a => /The owner tested/.test(a)), 'an ordinary answer keeps its path')
})

test('owned review P2-6: more secrets are hidden, and salvaged reports, job logs, and synced session backups are scrubbed too', async () => {
	const { scrub } = await import('../src/core/secrets.ts')
	const pat = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
	const key88 = `${'Ab3+'.repeat(21)}xY==`.slice(0, 86) + '=='
	const azdo = `${'Ab1'.repeat(25)}AAZDOx1y2`
	for (const [raw, out] of [
		[`PAT ${pat} here`, 'PAT [hidden] here'],
		[`token ghp_${'a'.repeat(36)}`, 'token [hidden]'],
		[`github_pat_${'A1_'.repeat(10)}`, '[hidden]'],
		['key AKIAABCDEFGHIJKLMNOP.', 'key [hidden].'],
		['-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----', '[hidden] private key'],
		[`AccountKey ${key88} end`, 'AccountKey [hidden] end'],
		[`new PAT ${azdo}`, 'new PAT [hidden]'],
		['clone https://robin:s3cr3t-pw@dev.azure.com/acme/web', 'clone https://[hidden]@dev.azure.com/acme/web'],
		['{"a":"ssh://x","b":"y:z@w"}', '{"a":"ssh://x","b":"y:z@w"}'],
		['{"a":"ssh://x","n":5@w}', '{"a":"ssh://x","n":5@w}'],
		[`commit ${'ab12'.repeat(10)} and sha256 ${'cd34'.repeat(16)}`, `commit ${'ab12'.repeat(10)} and sha256 ${'cd34'.repeat(16)}`],
	]) assert.equal(scrub(raw), out, raw)
	// A report salvaged from the run's last words.
	const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyb2JpbiJ9.c2lnbmF0dXJlLXZhbHVl'
	const salvage = async (_: Config['agent'], i: { workflowId: string; runId: string; prompt: string }) => ({ exitCode: 0, ms: 1, summary: '```json\n' + JSON.stringify({ workflowId: i.workflowId, intent: 'status_next_step', state: 'needs_human', summary: 'Done', reply: { text: `Use Bearer ${jwt}`, commitment: false, sources: [] } }) + '\n```' })
	src.post(CHAT, 'me', '[as Ravi] Which token works?'); await tick(store, { source: src, run: salvage, procs, force: true, history: noList })
	assert.equal(store.byCode('A1')!.draft!.text, 'Use Bearer [hidden]')
	// A job's log, once its run is over.
	ownSetup(); validateJob(() => undefined as never); jf.job = () => undefined
	await askToValidate()
	const job = store.job(store.byCode('A2')!.job!)!, log = join(process.env.DELEGATE_LOCAL!, 'sessions', `${job.run!.id}.log`)
	mkdirSync(join(process.env.DELEGATE_LOCAL!, 'sessions'), { recursive: true }); writeFileSync(log, `curl -H "Authorization: Bearer ${jwt}" https://x\n`)
	store.writeReport(proposal()('', job.id), job.run!.id); jf.dead.add(job.run!.pid); await goOwn()
	assert.equal(readFileSync(log, 'utf8'), 'curl -H "Authorization: Bearer [hidden]" https://x\n')
	// A session backup, synced to the storage folder: both copies are scrubbed, and a later backup still sees one history.
	const { home, id } = fakeSession()
	const ev = join(home, 'session-state', id, 'events.jsonl')
	writeFileSync(ev, `{"type":"tool.result","text":"200 OK token ${pat}"}\n`)
	const { backupSession } = await import('../src/runner/own.ts')
	assert.equal(backupSession(store, id), true)
	const clean = '{"type":"tool.result","text":"200 OK token [hidden]"}\n'
	assert.equal(readFileSync(join(store.root, 'sessions', id, 'events.jsonl'), 'utf8'), clean, 'the synced copy is scrubbed (the live file is not: round 2 P2-5)')
	writeFileSync(ev, `{"type":"tool.result","text":"200 OK token ${pat}"}\n{"type":"assistant.message"}\n`)
	assert.equal(backupSession(store, id), true, 'the next backup is a plain append')
	assert.equal(store.health()[`session:${id}`], undefined, 'never taken for two machines changing it')
	delete process.env.COPILOT_HOME
})

test('owned review P2-9: a validate job never starts with a shell tool', async () => {
	ownSetup()
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, tools: [...store.config().agent.tools, 'shell(git:*)'] } })
	validateJob(proposal())
	script = validateWorker; src.post(CHAT, 'me', `[as Kim] The dev instance is up. Can you validate your flows against it? ${OWN_PR}`); await goOwn()
	assert.equal(jf.starts.length, 0, 'not started')
	assert.match(store.byCode('A1')!.status, /A validate job never runs with a shell tool \(shell\(git:\*\)\): it could run a pipeline outside your ok\. Remove shell\(git:\*\) from the read tools in setup/)
	const { shellTool } = await import('../src/runner/validate.ts')
	assert.deepEqual(['bash', 'Bash', 'powershell', 'pwsh', 'run_in_terminal', 'execute', 'cmd'].map(t => shellTool([t])), ['bash', 'Bash', 'powershell', 'pwsh', 'run_in_terminal', 'execute', 'cmd'])
	assert.equal(shellTool(['view', 'grep', 'glob', 'ado-pipelines_build', 'kusto-kusto_query', 'teams-ListChatMessages']), undefined, 'read tools pass')
})

test('owned round 2 P2-1: a write, pipeline-write, or whole-server tool is never a read tool, at worker start', async () => {
	const { unsafeRead } = await import('../src/core/effects.ts')
	for (const t of ['ado-pipelines_write', 'ado-repo_pull_request_write', 'ado-wit_work_item_write:update', 'ado-run_pipeline', 'ado', 'ado-*', 'kusto(*)']) assert.match(unsafeRead([...['view', 'ado-pipelines_build'], t], ['ado', 'kusto']) ?? '', /is never a read tool/, t)
	assert.equal(unsafeRead(['view', 'glob', 'grep', 'ado-pipelines_build', 'ado-repo_pull_request', 'kusto-kusto_query', 'shell(git:*)'], ['ado', 'kusto']), undefined, 'read tools pass; a shell pattern is the shell check\'s')
	assert.match(unsafeRead(['*'], []) ?? '', /\* is never a read tool/)
	// Round 3 P2-1: write tools on the other servers are named by verb, not _write.
	for (const t of ['teams-SendMessageToChat', 'teams-CreateChat', 'teams-UpdateChatMessage', 'teams-DeleteChat', 'mail-ReplyToMessage', 'mail-ForwardMessage', 'calendar-CreateEvent', 'calendar-CancelEvent', 'calendar-TentativelyAcceptEvent', 'calendar-DeclineEvent', 'images-do_action', 'images-create_entity', 'images-update_entity', 'sharepoint-createFolder', 'sharepoint-shareFileOrFolder', 'sharepoint-moveFileOrFolder', 'kusto-kusto_command', 'kusto-kusto_ingest_inline_into_table', 'incidents-post_discussion_entry', 'incidents-reactivate_incident', 'incidents-request_assistance', 'teams-AddChatMember', 'mail-FlagEmail']) assert.match(unsafeRead(['view', t], []) ?? '', /is never a read tool/, t)
	const { READ_DEFAULTS } = await import('../src/mcp/setup.ts')
	const defaults = Object.entries(READ_DEFAULTS).flatMap(([srv, ts]) => ts.map(t => `${srv}-${t}`))
	assert.equal(unsafeRead([...defaults, 'kusto-kusto_query', 'kusto-kusto_list_entities', 'kusto-kusto_describe_database', 'kusto-kusto_sample_entity', 'kusto-kusto_known_services', 'kusto-kusto_get_shots', 'sharepoint-getFolderChildren', 'mail-SearchMessages', 'mail-GetMessage', 'teams-GetUserPresence'], []), undefined, 'no default read tool, and no telemetry or lookup tool, is refused')
	// A job does not start with one.
	ownSetup(); validateJob(proposal())
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, tools: [...store.config().agent.tools, 'ado-pipelines_write'] } })
	script = validateWorker; src.post(CHAT, 'me', `[as Kim] The dev instance is up. Can you validate your flows against it? ${OWN_PR}`)
	let runs0 = runs.length
	await goOwn()
	assert.equal(runs.length, runs0, 'no reply run either')
	assert.match(store.byCode('A1')!.status, /ado-pipelines_write is never a read tool/)
	assert.equal(store.byCode('A1')!.state, 'needs_human', 'a setup error waits for the owner at once, never retried')
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, tools: store.config().agent.tools.filter(t => t !== 'ado-pipelines_write') } })
	src.post('self', 'me', 'A1: try again'); await goOwn(); await goOwn()
	const job = store.job(store.byCode('A1')!.job!)!
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, tools: [...store.config().agent.tools, 'ado'] } })
	store.saveJob({ ...job, state: 'queued', run: undefined }); runs0 = jf.starts.length; await goOwn()
	assert.equal(jf.starts.length, runs0, 'a job does not start')
	assert.match(store.job(job.id)!.error!, /ado is never a read tool/)
})

test('owned round 2 P2-2: no job or ask run works in a clone with a shell tool', async () => {
	const code = mkdtempSync(join(tmpdir(), 'delegate-code-'))
	fakeClone(join(code, 'web'), 'https://dev.azure.com/acme/Globex/_git/web', 'main')
	codeFolder(code)
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, tools: ['view', 'bash'] } })
	script = (p, id) => ({ ...needsJob({ key: 'pr:acme/web/4200002', goal: 'Review PR 4200002' })(p, id), intent: 'pr_review' }); jf.job = () => undefined
	src.post(CHAT, 'me', `[as Kim] Can you review ${OWN_PR}?`); await go()
	assert.equal(jf.starts.length, 0, 'a PR review in the owner\'s clone does not start with a shell')
	assert.match(store.byCode('A1')!.status, /never runs in your clone with a shell tool \(bash\)/)
	// With no clone here, the same job runs: nothing of the owner's is in reach.
	codeFolder(); store.saveJob({ ...store.job(store.byCode('A1')!.job!)!, state: 'queued', error: undefined }); await go()
	assert.equal(jf.starts.length, 1)
	// An ask run in the folder an owned session works in.
	const j = store.job(store.byCode('A1')!.job!)!
	jf.dead.add(j.run!.pid); store.saveJob({ ...j, state: 'done', run: undefined, repo: code })
	const n0 = runs.length
	store.save({ ...store.byCode('A1')!, state: 'needs_human', notes: [{ q: 'Is it safe?', at: new Date().toISOString() }] }); await go()
	assert.equal(runs.length, n0, 'not run')
	assert.match(store.byCode('A1')!.status, /never runs in your clone with a shell tool \(bash\)/)
	assert.match(store.byCode('A1')!.notes!.at(-1)!.a!, /^Not asked: It never runs in your clone with a shell tool \(bash\)/, 'answered, so it is not tried again each cycle')
	// A job in the folder an owned session works in.
	const starts = jf.starts.length
	store.saveJob({ ...store.job(j.id)!, state: 'queued' }); await go()
	assert.equal(jf.starts.length, starts)
	assert.match(store.job(j.id)!.error!, /never runs in your clone with a shell tool \(bash\)/)
})

test('owned round 2 P2-4: a picked option\'s changes are vetted as a report\'s are', async () => {
	ownSetup([{ pipelineId: TEST3, ring: 'TEST3', project: 'Globex' }, { pipelineId: 3001, ring: 'TEST1', project: 'Globex' }])
	script = (_: string, workflowId: string): Report => ({ workflowId, intent: 'validate', state: 'needs_human', summary: 'Which ring?', question: 'Deploy where?',
		choices: { prompt: 'Deploy where?', options: [
			{ label: 'TEST3 and TEST1', reply: 'Deploying to both.', effects: [deployEffect(), deployEffect({ summary: 'Deploy to TEST1 too', call: deployCall(3001) })] },
			{ label: 'INT', reply: 'Deploying to INT.', effects: [deployEffect({ summary: 'Deploy to INT', call: deployCall(INT) })] },
		] } })
	src.post(CHAT, 'me', `[as Kim] The dev instance is up. Can you validate your flows against it? ${OWN_PR}`); await goOwn()
	src.post('self', 'me', 'pick A1 1'); await goOwn()
	let wf = store.byCode('A1')!
	assert.deepEqual(wf.effects!.filter(e => !e.done && !e.off).map(e => e.summary), ['Deploy build 9100001 to TEST3'], 'one at a time')
	assert.ok(wf.todos!.includes('Deploy to TEST1 too. Not made for you: one change at a time with a deploy; propose it again after the deploy to TEST3 is made'))
	assert.deepEqual(store.job(wf.job!)!.result!.effects.filter(e => !e.done && !e.off).map(e => e.summary), ['Deploy build 9100001 to TEST3'], 'the job carries the same')
	src.post('self', 'me', 'pick A1 2'); await goOwn()
	wf = store.byCode('A1')!
	assert.deepEqual(wf.effects?.filter(e => !e.done && !e.off) ?? [], [], 'an option off the list offers nothing')
	assert.ok(wf.todos!.some(t => t.startsWith('Deploy to INT. Not made for you: pipeline 3999 is not on')))
	assert.equal(calls.length, 0)
	// While our deploy still runs, an option's deploy waits too.
	src.post('self', 'me', 'pick A1 1'); await okOwn()
	assert.match(src.chats.self.at(-1)!.body, /^Assistant · Before you ok A1: Deploy build 9100001 \(PR 4200002 @ 3fa91c2\) to TEST3/, 'a picked deploy is read and shown before it runs')
	src.post('self', 'me', 'ok A1'); await goOwn(); await makeDeploy()
	assert.equal(calls.length, 1)
	// The same options shown again while our deploy runs (as a fresh run would show them).
	const opts = (script('', store.byCode('A1')!.id) as Report).choices!
	store.save({ ...store.byCode('A1')!, state: 'needs_human', choices: opts, todos: undefined, effects: undefined, revAt: new Date().toISOString() })
	src.post('self', 'me', 'pick A1 1'); await goOwn()
	wf = store.byCode('A1')!
	assert.deepEqual(wf.effects?.filter(e => !e.done && !e.off) ?? [], [])
	assert.ok(wf.todos!.includes('Deploy build 9100001 to TEST3. Not made for you: the deploy to TEST3 is still running (run 77001); one change at a time'))
})

test('owned round 2 P2-5: the live session file is never rewritten; only the synced copy is scrubbed', async () => {
	const pat = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
	const { home, id } = fakeSession()
	const ev = join(home, 'session-state', id, 'events.jsonl'), synced = join(store.root, 'sessions', id, 'events.jsonl')
	const raw = `{"type":"tool.result","text":"200 OK token ${pat}"}\n`
	writeFileSync(ev, raw)
	const { backupSession } = await import('../src/runner/own.ts')
	assert.equal(backupSession(store, id), true)
	assert.equal(readFileSync(ev, 'utf8'), raw, 'the AI CLI\'s own file is left as it is')
	assert.equal(readFileSync(synced, 'utf8'), '{"type":"tool.result","text":"200 OK token [hidden]"}\n')
	writeFileSync(ev, `${raw}{"type":"assistant.message"}\n`)
	assert.equal(backupSession(store, id), true, 'the next backup is an append of the scrubbed history')
	assert.equal(readFileSync(synced, 'utf8'), '{"type":"tool.result","text":"200 OK token [hidden]"}\n{"type":"assistant.message"}\n')
	assert.equal(store.health()[`session:${id}`], undefined, 'never taken for two machines changing it')
	const { restoreSession } = await import('../src/runner/own.ts')
	assert.equal(restoreSession(store, id), false, 'the next run start leaves the live file as it is')
	assert.equal(store.health()[`session:${id}`], undefined, 'and never takes it for a second machine\'s change')
	assert.equal(readFileSync(ev, 'utf8'), `${raw}{"type":"assistant.message"}\n`)
	delete process.env.COPILOT_HOME
})

