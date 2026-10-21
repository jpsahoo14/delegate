import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Fyi, Workflow } from '../src/core/types.ts'
import type { Source } from '../src/adapters/source.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-wlocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { track, byEnd, DEFAULT_UNTIL } = await import('../src/runner/track.ts')
const { actResult } = await import('../src/mcp/server.ts')
const { parseVerbs } = await import('../src/core/verbs.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')

const OWNER = { id: 'me', name: 'Robin Park' }
const CHAT = '19:abc@thread.v2'

function setup() {
	const store = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-wroot-')), machine: 'mac' })
	store.saveConfig({ schema: 1, owner: OWNER, source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 1, nudgeEveryMin: 30 })
	return store
}

const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function catchup(store: InstanceType<typeof Store>, fyi?: Fyi): Workflow {
	const now = new Date().toISOString()
	const wf = {
		schema: 1, id: `wf-${Math.random().toString(36).slice(2)}`, code: store.nextCode(), kind: 'reply', state: 'done', key: { type: 'thread', id: CHAT },
		chat: { id: CHAT, name: 'Spec review', test: false, group: true }, asker: { id: 'dev', name: 'Dev Rao' }, session: { agent: 'copilot', id: 's1' },
		lastMsgId: '1792000000042', pending: [], msgIds: ['1792000000042'], lastAsk: 'Pre-read for Thursday', status: 'Closed: FYI', newCount: 0, createdAt: now, updatedAt: now,
		...(fyi ? { fyi } : {}),
	} as unknown as Workflow
	store.save(wf)
	return wf
}

const trackers = (store: InstanceType<typeof Store>) => store.workflows().filter(w => w.kind === 'tracker')
const jobOf = (store: InstanceType<typeof Store>, wf: Workflow) => store.job(wf.job!)!

test('track with by: the job stops at the end of the day after it, and the item keeps by and where it came from', () => {
	const store = setup()
	const by = day(3)
	const out = track(store, { target: 'Ana sends the trace IDs', by, from: 'chat' })
	const [wf] = trackers(store)
	assert.match(out, new RegExp(`by ${by}, as ${wf.code}`))
	assert.equal(wf.watchBy, by)
	assert.equal(wf.watchFrom, 'chat')
	const end = new Date(jobOf(store, wf).endsAt!)
	const [y, m, d] = by.split('-').map(Number)
	assert.equal(end.getTime(), new Date(y, m - 1, d + 1, 23, 59, 59, 999).getTime())
	assert.equal(jobOf(store, wf).endsAt, byEnd(by))
})

test('track without by or until: no end date, no by, and the default "done" condition', () => {
	const store = setup()
	track(store, { target: 'PR 1601234' })
	const [wf] = trackers(store)
	assert.equal(DEFAULT_UNTIL, 'it is done: merged, answered, decided, or resolved')
	assert.equal(jobOf(store, wf).until, DEFAULT_UNTIL)
	assert.equal(jobOf(store, wf).endsAt, undefined)
	assert.equal(wf.watchBy, undefined)
	assert.equal(wf.watchFrom, undefined)
	assert.equal(wf.lastAsk, `Watch PR 1601234 until ${DEFAULT_UNTIL}`)
})

test('track refuses a by that is not a date or has passed, and starts nothing', () => {
	const store = setup()
	assert.match(track(store, { target: 'X', by: '2026-02-30' }), /is not a date/)
	assert.match(track(store, { target: 'X', by: day(-2) }), /has passed/)
	assert.equal(trackers(store).length, 0)
	assert.equal(store.jobs().length, 0)
})

test('watch A41 on a Catch up item uses its fyi.watch, marks the item, and twice makes one watch', () => {
	const store = setup()
	const src = catchup(store, { line: 'Dev shared the v5 spec pre-read', weight: 'normal', watch: { target: "Dev's spec v5 review", until: 'a decision is made' } })
	const r = actResult(store, `watch ${src.code}`)
	const [wf] = trackers(store)
	assert.equal(r.accepted, true)
	assert.equal(r.text, `Watching Dev's spec v5 review as ${wf.code}. I'll tell you when it is done or needs you.`)
	assert.equal(jobOf(store, wf).until, 'a decision is made')
	assert.equal(wf.lastAsk, "Watch Dev's spec v5 review until a decision is made")
	assert.equal(wf.watchFrom, 'catchup')
	assert.equal(store.byCode(src.code)!.watchedAs, wf.code)
	const again = actResult(store, `watch ${src.code}`)
	assert.equal(trackers(store).length, 1)
	assert.equal(store.jobs().length, 1)
	assert.match(again.text, new RegExp(`already watched as ${wf.code}`))
})

test('watch A41 without fyi.watch watches the line, gives the job the Teams message link, uses the default condition, and ends in a week', () => {
	const store = setup()
	const src = catchup(store, { line: 'Dev shared the v5 spec pre-read', weight: 'normal' })
	const was = store.byCode(src.code)!.updatedAt
	actResult(store, `watch ${src.code}`)
	const [wf] = trackers(store)
	const link = `https://teams.microsoft.com/l/message/${CHAT}/1792000000042?context=%7B%22contextType%22%3A%22chat%22%7D`
	assert.equal(wf.lastAsk, `Watch Dev shared the v5 spec pre-read until ${DEFAULT_UNTIL}`)
	assert.ok(jobOf(store, wf).asks[0].endsWith(`It came from this Teams message: ${link}`), 'the job can open the message it came from')
	assert.equal(jobOf(store, wf).until, DEFAULT_UNTIL)
	const days = (Date.parse(jobOf(store, wf).endsAt!) - Date.now()) / 86_400_000
	assert.ok(days > 6.9 && days <= 7, 'with no date it checks for a week, then asks')
	assert.equal(store.byCode(src.code)!.watchedAs, wf.code)
	assert.equal(store.byCode(src.code)!.updatedAt, was, 'the Catch up row keeps its time, so it is not new again')
})

test('the page quotes the owner\'s words: their "push", "until", or "by" stays text', () => {
	const store = setup()
	actResult(store, 'watch: "make sure Ana does the git push"', undefined, 'page')
	const [wf] = trackers(store)
	assert.equal(wf.lastAsk, `Watch make sure Ana does the git push until ${DEFAULT_UNTIL}`)
	assert.match(jobOf(store, wf).goal, /^Check /, 'no push asked')
	assert.ok(Date.parse(jobOf(store, wf).endsAt!) - Date.now() > 6.9 * 86_400_000, 'with no date it checks for a week, then asks')
	const src = catchup(store, { line: 'Pia posted the config PR', weight: 'normal' })
	const by = day(2)
	actResult(store, `watch ${src.code}: "config PR 4200003 until noon" until "Ana does the push" by ${by} push`, undefined, 'page')
	const w2 = trackers(store).find(w => w.watchFrom === 'catchup')!
	assert.equal(w2.lastAsk, 'Watch config PR 4200003 until noon until Ana does the push')
	assert.equal(w2.watchBy, by)
	assert.match(jobOf(store, w2).goal, /^Shepherd /)
})

test('watch A41: <target> until <until> by DATE uses the owner\'s sentence and date', () => {
	const store = setup()
	const src = catchup(store, { line: 'Dev shared the v5 spec pre-read', weight: 'normal', watch: { target: 'spec v5', until: 'decided' } })
	const by = day(2)
	const r = actResult(store, `watch ${src.code}: Pete's review of spec v5 until option A or B is chosen by ${by}`)
	const [wf] = trackers(store)
	assert.equal(r.accepted, true)
	assert.equal(wf.lastAsk, "Watch Pete's review of spec v5 until option A or B is chosen")
	assert.equal(wf.watchBy, by)
	assert.equal(wf.watchFrom, 'catchup')
	assert.equal(jobOf(store, wf).endsAt, byEnd(by))
	assert.equal(store.byCode(src.code)!.watchedAs, wf.code)
})

test('watch: <text> by DATE push starts an owner watch that shepherds; the same twice makes one', () => {
	const store = setup()
	const by = day(1)
	const r = actResult(store, `watch: PR 1601234 merged, with the comments fixed by ${by} push`, undefined, 'page')
	const [wf] = trackers(store)
	assert.equal(r.accepted, true)
	assert.equal(wf.watchFrom, 'owner')
	assert.equal(wf.watchBy, by)
	assert.equal(wf.lastAsk, `Watch PR 1601234 merged, with the comments fixed until ${DEFAULT_UNTIL}`)
	assert.match(jobOf(store, wf).goal, /^Shepherd PR 1601234 merged, with the comments fixed to closure/)
	actResult(store, `watch: PR 1601234 merged, with the comments fixed by ${by} push`, undefined, 'page')
	assert.equal(trackers(store).length, 1)
})

test('watch: <text> without push only checks', () => {
	const store = setup()
	actResult(store, 'watch: Ana sends the trace IDs')
	const [wf] = trackers(store)
	assert.match(jobOf(store, wf).goal, /^Check Ana sends the trace IDs and report/)
	assert.equal(wf.watchBy, undefined)
})

test('watch on an item that is not in Catch up is refused and starts nothing', () => {
	const store = setup()
	const src = catchup(store)
	const r = actResult(store, `watch ${src.code}`)
	assert.equal(r.accepted, false)
	assert.match(r.text, /not in Catch up/)
	assert.equal(trackers(store).length, 0)
	assert.equal(store.byCode(src.code)!.watchedAs, undefined)
	assert.equal(actResult(store, 'watch A99').accepted, false)
})

test('the watch grammar parses as one command, and the self-chat path applies it', async () => {
	assert.deepEqual(parseVerbs('watch a41'), [{ verb: 'watch', code: 'A41' }])
	assert.deepEqual(parseVerbs('watch A41: X, then Y until done by 2030-01-02'), [{ verb: 'watch', code: 'A41', text: 'X, then Y until done by 2030-01-02' }])
	assert.deepEqual(parseVerbs('watch A41 by 2030-01-02 push'), [{ verb: 'watch', code: 'A41', text: 'by 2030-01-02 push' }])
	assert.deepEqual(parseVerbs('watch: a, b push'), [{ verb: 'watch', text: 'a, b push' }])
	assert.equal(parseVerbs('watch'), null)
	assert.equal(parseVerbs('watch PR 1'), null)
	const store = setup()
	const src = catchup(store, { line: 'Dev shared the v5 spec pre-read', weight: 'normal', watch: { target: 'spec v5', until: 'decided' } })
	const p = parseVerbs(`watch ${src.code}`)![0]
	store.writeAnswer({ code: p.code!, verb: p.verb, text: p.text, surface: 'chat' })
	await applyAnswers(store, {} as Source, store.config())
	const [wf] = trackers(store)
	assert.equal(wf?.lastAsk, 'Watch spec v5 until decided')
	assert.equal(store.byCode(src.code)!.watchedAs, wf.code)
})
