import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-nlocal-'))
const { Store } = await import('../src/store/state.ts')
const { item } = await import('./fixture.ts')
const { whoseMove, RULES } = await import('../src/core/whose.ts')
const { snapshot, place, dryText } = await import('../src/web/next.ts')
import type { Facts } from '../src/core/whose.ts'
import type { Job, Workflow } from '../src/core/types.ts'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const soon = (min: number) => new Date(Date.now() + min * 60_000).toISOString()

function setup() {
	const store = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-nroot-')), machine: 'mac' })
	store.saveConfig({ schema: 1, owner: { id: 'me', name: 'Robin Park' }, aliases: ['RP'], source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 2 } as never)
	// Reading is ok: a good read a minute ago.
	store.saveChats({ startedAt: ago(600), seen: {}, readAt: ago(1), goodAt: ago(1) })
	return store
}
const job = (store: InstanceType<typeof Store>, id: string, over: Partial<Job>) => store.saveJob({ schema: 1, id, key: `k-${id}`, goal: 'g', session: { agent: 'copilot', id: `s-${id}` }, state: 'queued', purpose: 'work', parents: [], asks: [], createdAt: ago(30), updatedAt: ago(30), ...over } as Job)
const work = (over: Partial<NonNullable<Workflow['work']>>) => ({ goal: 'Ship the fix', doneWhen: 'merged', steps: [], links: [], ...over })
const row = (rows: ReturnType<typeof place>, code: string) => rows.find(r => r.subjects.includes(code))!

const base: Facts = { subject: 'item', runner: 'ok', fyiUnread: false }

test('N0 whose move: each rule places its case, first match wins, and needs_human beats anything the AI wrote', () => {
	const cases: [Partial<Facts>, string, string][] = [
		[{ state: 'done', fyiUnread: true }, 'catchup', 'catchup'],
		[{ state: 'done' }, 'done', 'done'],
		[{ state: 'needs_human', work: { open: true, next: 'them' }, job: { state: 'running', watch: false, retryLater: false } }, 'move', 'needs-you'],
		[{ state: 'waiting_on_task', job: { state: 'failed', watch: false, retryLater: false } }, 'move', 'stopped'],
		[{ state: 'waiting_on_task' }, 'move', 'stopped'],
		[{ state: 'waiting_on_task', job: { state: 'running', watch: false, retryLater: false } }, 'working', 'job-running'],
		[{ state: 'open', job: { state: 'running', watch: true, retryLater: false } }, 'waiting', 'waiting'],
		[{ state: 'running', queue: 'next' }, 'working', 'starts-next'],
		// Paused, drafting goes on and sends wait (PM review 3): a queued draft and a new work run still start; a rule send, a retry, and stopped do not.
		[{ state: 'running', queue: 'next', runner: 'paused' }, 'working', 'starts-next'],
		[{ state: 'running', queue: 'next', runner: 'stopped' }, 'waiting', 'waiting'],
		[{ state: 'running', queue: 'line', runner: 'paused' }, 'waiting', 'waiting'],
		[{ state: 'scheduled', runner: 'paused' }, 'waiting', 'waiting'],
		[{ state: 'waiting_on_task', job: { state: 'queued', watch: false, retryLater: false, slot: true }, runner: 'paused' }, 'working', 'starts-next'],
		[{ state: 'waiting_on_task', job: { state: 'queued', watch: false, retryLater: false, slot: true, retry: true }, runner: 'paused' }, 'waiting', 'waiting'],
		[{ state: 'waiting_on_task', job: { state: 'queued', watch: false, retryLater: false, slot: true }, runner: 'off' }, 'waiting', 'waiting'],
		[{ state: 'running', queue: 'line' }, 'waiting', 'waiting'],
		[{ state: 'running', queue: 'held' }, 'waiting', 'waiting'],
		[{ state: 'scheduled' }, 'working', 'starts-next'],
		[{ state: 'scheduled', runner: 'off' }, 'waiting', 'waiting'],
		[{ state: 'waiting_on_task', job: { state: 'queued', watch: false, retryLater: false, slot: true } }, 'working', 'starts-next'],
		[{ state: 'waiting_on_task', job: { state: 'queued', watch: false, retryLater: false, slot: false } }, 'waiting', 'waiting'],
		[{ state: 'waiting_on_task', job: { state: 'done', watch: true, retryLater: false } }, 'waiting', 'waiting'],
		[{ state: 'waiting_on_task', job: { state: 'done', watch: false, retryLater: false } }, 'move', 'stopped'],
		[{ state: 'waiting_on_task', job: { state: 'queued', watch: false, retryLater: true } }, 'waiting', 'waiting'],
		[{ state: 'waiting_on_task', job: { state: 'queued', watch: false, retryLater: false, slot: true }, runner: 'capped' }, 'waiting', 'waiting'],
		[{ state: 'open', work: { open: true, next: 'you' } }, 'move', 'your-step'],
		[{ state: 'open', work: { open: false, next: 'you' } }, 'waiting', 'waiting'],
		[{ state: 'open', work: { open: true, next: 'me' } }, 'waiting', 'waiting'],
		[{ state: 'open', work: { open: true, waiting: true } }, 'waiting', 'partner-wait'],
		[{ state: 'waiting_on_sender' }, 'waiting', 'waiting'],
	]
	assert.deepEqual(cases.map(([f]) => { const m = whoseMove({ ...base, ...f }); return [m.section, m.rule] }), cases.map(([, s, r]) => [s, r]))
	assert.deepEqual(RULES.map(r => r.id), ['catchup', 'done', 'needs-you', 'stopped', 'todo', 'job-running', 'starts-next', 'your-step', 'partner-wait', 'waiting'])
})

test('N0 live cases: a stale "you" plan step, a Delegate step nothing runs, and "them" in the AI words, never a glued name', () => {
	const store = setup()
	// A34: the next step is someone else's, while an old plan step says the owner's; waitingOn names a different person.
	item(store, 'A34', 'Rita', 'Release sync', { state: 'open', work: work({ next: { who: 'them', what: 'Dev to request bug access through the access route' }, waitingOn: { who: 'Rita', since: ago(90) }, plan: [{ id: 'p1', what: 'Cast the approval vote and reply to Rita', who: 'you' }] }) })
	// A19: Delegate's step, but no job, watch, or build check will run it; waitingOn is the owner by name.
	item(store, 'A19', 'Kim', 'Kim', { state: 'open', work: work({ next: { who: 'me', what: 'Review the rollback PR and report' }, waitingOn: { who: 'Robin Park', since: ago(90) } }) })
	// A13: a them-step whose waitingOn is the owner's alias resolves to the owner.
	item(store, 'A13', 'Dev', 'Dev', { state: 'open', work: work({ next: { who: 'them', what: 'Robin confirms the ring' }, waitingOn: { who: 'RP', since: ago(90) } }) })
	// A20: Delegate's step with a build check that will run it.
	item(store, 'A20', 'Ana', 'Ana', { state: 'open', work: work({ next: { who: 'me', what: 'Report when build 991 finishes' }, plan: [{ id: 'b', what: 'Build 991', who: 'me', probe: { build: 991, project: 'P' } }] }) })
	const rows = place(snapshot(store))
	assert.deepEqual(['A34', 'A19', 'A13', 'A20'].map(c => { const r = row(rows, c); return [r.section, r.next] }), [
		['waiting', { owner: { kind: 'others', text: 'Dev to request bug access through the access route' }, what: 'Dev to request bug access through the access route' }],
		['waiting', { owner: { kind: 'nobody' }, what: 'Review the rollback PR and report' }],
		['move', { owner: { kind: 'you' }, what: 'Robin confirms the ring' }],
		['waiting', { owner: { kind: 'delegate' }, what: 'Report when build 991 finishes' }],
	], 'a them-step waiting on the owner by alias is the owner\'s move')
})

test('N0 honest Working: only what runs now or starts next cycle; everything else waits with its reason', () => {
	const store = setup()
	item(store, 'A1', 'Kim', 'Kim', { state: 'running', updatedAt: ago(5) })
	item(store, 'A2', 'Ana', 'Ana', { state: 'running', paced: true, before: true, updatedAt: ago(4) })
	item(store, 'A3', 'Dev', 'Dev', { state: 'running', paced: true, before: true, updatedAt: ago(3) })
	item(store, 'A4', 'Rita', 'Rita', { state: 'running', paced: true, before: true, updatedAt: ago(2) })
	job(store, 'j5', { state: 'queued', retry: { at: soon(30), n: 1, firstAt: ago(10), last: { kind: 'transient', why: 'ADO 503', tried: [] }, tried: [] } as never })
	item(store, 'A5', 'Lee', 'Lee', { state: 'waiting_on_task', job: 'j5' })
	job(store, 'j6', { state: 'running', every: 60 })
	item(store, 'A6', 'Sam', 'Sam', { kind: 'tracker', state: 'open', job: 'j6' })
	job(store, 'j8', { state: 'done', every: 60, nextAt: soon(40) })
	item(store, 'A8', 'Kim', 'Kim', { kind: 'tracker', state: 'waiting_on_task', job: 'j8' })
	job(store, 'j7', { state: 'failed', error: 'Copilot CLI exited 1' })
	item(store, 'A7', 'Max', 'Max', { state: 'waiting_on_task', job: 'j7' })
	let rows = place(snapshot(store))
	const at = (c: string) => { const r = row(rows, c); return [r.section, r.why] }
	assert.deepEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'].map(at), [
		['working', undefined], ['working', undefined], ['working', undefined], ['waiting', 'in line behind live asks'],
		['waiting', `tries again ${row(rows, 'A5').why!.slice(12)}`], ['waiting', undefined], ['move', undefined],
	], 'maxParallel 2: two paced drafts start next cycle, the third waits in line')
	assert.match(row(rows, 'A5').why!, /^tries again \w{3} \d\d:\d\d$/)
	assert.deepEqual(row(rows, 'A6').next, { owner: { kind: 'delegate' }, what: 'checks every 60 min' }, 'a watch checking stays in Waiting')
	assert.deepEqual(row(rows, 'A7').next, { owner: { kind: 'you' }, what: 'Delegate stopped: Copilot CLI exited 1' })
	assert.deepEqual([row(rows, 'A8').section, row(rows, 'A8').next], ['waiting', { owner: { kind: 'delegate' }, what: 'checks every 60 min' }], 'a watch between checks is waiting, not stopped')

	store.setOpenWindow('w-A1', { machine: 'mac', pid: 1, runId: 'r', since: ago(1) })
	rows = place(snapshot(store))
	assert.deepEqual(at('A1'), ['waiting', 'open in your AI chat'], 'held by the owner\'s open window')
	store.setOpenWindow('w-A1', undefined)
	store.saveConfig({ ...store.config(), dailyRuns: 0 })
	rows = place(snapshot(store))
	assert.deepEqual(at('A1'), ['waiting', 'daily limit reached; tomorrow'])
	store.saveConfig({ ...store.config(), dailyRuns: undefined })
	store.saveControl({ paused: true, stopped: false })
	rows = place(snapshot(store))
	assert.deepEqual([at('A1'), at('A2'), at('A4')], [['working', undefined], ['working', undefined], ['waiting', 'in line behind live asks']], 'paused, drafts go on in their slots')
	store.saveControl({ paused: false, stopped: false })
	store.saveChats({ ...store.chats(), goodAt: ago(120), readAt: ago(120) })
	rows = place(snapshot(store))
	assert.deepEqual(at('A1'), ['waiting', 'Delegate is not reading now'], 'the reading machine is off')
	// Review round 3, P1: paused is only a modifier. Paused while no machine reads, nothing runs, so nothing is Working.
	store.saveControl({ paused: true, stopped: false })
	rows = place(snapshot(store))
	assert.deepEqual(at('A1'), ['waiting', 'Delegate is not reading now'], 'paused and not reading: the draft waits')
	store.saveControl({ paused: false, stopped: false })
	// Review round 3, P2-5: a pause set in the config is a pause, as status and the send gate treat it.
	store.saveChats({ ...store.chats(), goodAt: ago(1), readAt: ago(1) })
	store.saveConfig({ ...store.config(), paused: true } as never)
	const s5 = snapshot(store)
	assert.equal(s5.runner, 'paused')
	store.saveConfig({ ...store.config(), paused: undefined } as never)
})

test('N0 one thread, one row: a part that needs you places its home, a W entry joins its item, and nothing not done reaches Done', () => {
	const store = setup()
	const home = item(store, 'A30', 'Pete', 'Report sync', { state: 'open', work: work({ next: { who: 'them', what: 'Dev deploys to staging2' }, parts: ['w-A31'] }) })
	item(store, 'A31', 'Dev', 'Dev', { state: 'needs_human', partOf: home.id })
	mkdirSync(join(store.root, 'state'), { recursive: true })
	writeFileSync(join(store.root, 'state', 'waiting.json'), JSON.stringify([
		{ code: 'W1', chat: { id: 'c', name: 'Report sync' }, msgId: 'm', at: ago(20), to: ['Dev'], text: 'Can you deploy?', state: 'waiting', item: 'A30' },
		{ code: 'W2', chat: { id: 'd', name: 'Ana' }, msgId: 'n', at: ago(10), to: ['Ana'], text: 'Send the trace IDs', state: 'waiting' },
		{ code: 'W3', chat: { id: 'd', name: 'Ana' }, msgId: 'o', at: ago(9), to: ['Ana'], text: 'Old', state: 'answered' },
	]))
	item(store, 'A40', 'Lee', 'Lee', { state: 'done', status: 'Sent', updatedAt: ago(5) })
	item(store, 'A41', 'Kim', 'Kim', { state: 'done', fyi: { line: 'Kim shared the v5 spec', weight: 'normal' }, updatedAt: ago(5) })
	const rows = place(snapshot(store))
	assert.deepEqual(rows.filter(r => r.section !== 'done').map(r => [r.code, r.act, r.section, r.subjects.slice().sort()]), [
		['A30', 'A31', 'move', ['A30', 'A31', 'W1']],
		['W2', 'W2', 'waiting', ['W2']],
		['A41', 'A41', 'catchup', ['A41']],
	])
	const codes = rows.flatMap(r => r.subjects)
	assert.equal(new Set(codes).size, codes.length, 'every subject appears exactly once')
	assert.equal(row(rows, 'A40').section, 'done')
	assert.equal(rows.some(r => r.subjects.includes('W3')), false, 'an answered W entry is not a thread')
	store.saveSeen(['catchup'])
	assert.equal(row(place(snapshot(store)), 'A41').section, 'done', 'a read FYI leaves Catch up')
})

test('N0 now --dry prints each section with its rule and Next owner', () => {
	const store = setup()
	item(store, 'A13', 'Ravi', 'Release sync', { lastAsk: 'When will the banner fix ship?' })
	item(store, 'A19', 'Kim', 'Kim', { state: 'open', work: work({ goal: 'Validate on test4', next: { who: 'me', what: 'Review the rollback PR' } }) })
	assert.equal(dryText(place(snapshot(store))), [
		'YOUR MOVE · 1',
		'  A13  [needs-you] When will the banner fix ship?',
		'       Ravi · Release sync · Next: You',
		'DELEGATE IS WORKING · 0',
		'WAITING ON OTHERS · 1',
		'  A19  [waiting] Validate on test4',
		'       Kim · Kim · Next: nobody is on this yet: Review the rollback PR',
		'CATCH UP · 0',
		'DONE · 0',
	].join('\n'))
})

test('N0 run slots: Working promises no more drafts than the day allows, and no more jobs than run at once', () => {
	const store = setup()
	store.saveConfig({ ...store.config(), dailyRuns: 2, jobs: { parallel: 1 } } as never)
	item(store, 'A1', 'Kim', 'Kim', { state: 'running', updatedAt: ago(5) })
	item(store, 'A2', 'Ana', 'Ana', { state: 'running', updatedAt: ago(4) })
	item(store, 'A3', 'Dev', 'Dev', { state: 'running', updatedAt: ago(3) })
	let rows = place(snapshot(store))
	assert.deepEqual(['A1', 'A2', 'A3'].map(c => [row(rows, c).section, row(rows, c).why]), [['working', undefined], ['working', undefined], ['waiting', 'daily limit reached; tomorrow']])

	const s1 = setup()
	s1.saveConfig({ ...s1.config(), dailyRuns: 1 } as never)
	item(s1, 'A6', 'Old', 'Old', { state: 'running', paced: true, before: true, updatedAt: ago(50) })
	item(s1, 'A7', 'Lee', 'Lee', { state: 'running', updatedAt: ago(1) })
	rows = place(snapshot(s1))
	assert.deepEqual(['A7', 'A6'].map(c => row(rows, c).section), ['working', 'waiting'], 'a live ask gets the last run before an older draft from before setup')

	const s2 = setup()
	job(s2, 'j1', { state: 'running' })
	item(s2, 'A4', 'Kim', 'Kim', { state: 'waiting_on_task', job: 'j1' })
	job(s2, 'j2', { state: 'queued' })
	item(s2, 'A5', 'Ana', 'Ana', { state: 'waiting_on_task', job: 'j2' })
	s2.saveConfig({ ...s2.config(), jobs: { parallel: 1 } } as never)
	rows = place(snapshot(s2))
	assert.deepEqual(['A4', 'A5'].map(c => [row(rows, c).section, row(rows, c).why]), [['working', undefined], ['waiting', 'waits for a free run slot']])
	s2.saveConfig({ ...s2.config(), jobs: { parallel: 2 } } as never)
	assert.equal(row(place(snapshot(s2)), 'A5').section, 'working', 'a free slot: it starts next cycle')
})

test('N0 reminders: Next is Delegate only when it will send; paused or Delegate paused says so', () => {
	const store = setup()
	const r = (code: string, state: 'active' | 'paused') => store.saveAutomation({ schema: 1, id: `a-${code}`, code, kind: 'remind', to: { chatId: 'c', name: 'Kim' }, text: 'Update the doc', schedule: { every: 'day', at: '16:00' }, state, next: state === 'active' ? soon(60) : undefined, count: 0, createdAt: ago(60), updatedAt: ago(60) } as never)
	r('R1', 'active'); r('R2', 'paused')
	let rows = place(snapshot(store))
	assert.deepEqual([row(rows, 'R1').next?.owner, row(rows, 'R1').why, row(rows, 'R2').next], [{ kind: 'delegate' }, undefined, { owner: { kind: 'nobody' }, what: 'reminding Kim is paused' }])
	store.saveControl({ paused: true, stopped: false })
	rows = place(snapshot(store))
	assert.equal(row(rows, 'R1').why, 'Delegate is paused')
})

test('bug 10-20 catch-up: a read FYI saved again later stays read, in both experiences', async () => {
	const { view } = await import('../src/web/view.ts')
	const store = setup()
	const w = item(store, 'A41', 'Kim', 'Kim', { state: 'done', intent: 'fyi', fyi: { line: 'Kim shared the v5 spec', weight: 'normal', at: ago(30) }, updatedAt: ago(30) })
	store.saveSeen(['catchup'], ago(10))
	store.save({ ...w, status: 'Resynced' })
	assert.equal(row(place(snapshot(store)), 'A41').section, 'done')
	assert.equal(view(store, ago(60)).catchUp.count, 0)
})
