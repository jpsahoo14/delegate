// The new experience, N2 (R-NEX-05, R-NEX-07): owned work on Now (the checklist with who does each step, your move, Report your
// result), and to-dos a sent reply left, kept across turns until Mark done. Rules, rows, and each new button's command on its fixture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-n2local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { seedNext, seedOwned, stub, item } = await import('./fixture.ts')
const { whoseMove, RULES, PRECEDENCE, rankOf } = await import('../src/core/whose.ts')
const { nextView, COMMANDS } = await import('../src/web/next.ts')
const { actResult } = await import('../src/mcp/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { keepTodos, newTurn } = await import('../src/runner/work.ts')
const { reportsResult, saysTested } = await import('../src/runner/validate.ts')
import type { Facts } from '../src/core/whose.ts'
import type { NextRow, NextView } from '../src/web/next.ts'
import type { Workflow } from '../src/core/types.ts'

const fresh = () => seedOwned(seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-n2root-')), machine: 'mac' })))
const all = (v: NextView) => [...v.move, ...v.working, ...v.waiting, ...v.catchup.rows]
const byAct = (v: NextView, act: string) => all(v).find(r => r.act === act)
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
const base: Facts = { subject: 'item', runner: 'ok', fyiUnread: false }
type S = InstanceType<typeof Store>
// The page's command, accepted and applied by the runner as the page sends it; the outcome the owner reads.
async function send(store: S, command: string, rev?: string) {
	const said = actResult(store, command, rev, 'page')
	assert.ok(said.accepted, `${command}: accepted (${said.text})`)
	await applyAnswers(store, stub, store.config(), procs as never)
	return { said: said.text, out: said.ids.map(id => store.outcome(id) ?? '').join(' ') }
}

test('N2 whose rule 5: an open to-do puts the item in Your move, even a done one; work whose next step is yours says that step', () => {
	const cases: [Partial<Facts>, string, string][] = [
		[{ state: 'done', todos: 1 }, 'move', 'todo'],
		[{ state: 'done', fyiUnread: true, todos: 1 }, 'move', 'todo'],
		[{ state: 'open', work: { open: true, next: 'them' }, todos: 2 }, 'move', 'todo'],
		[{ state: 'open', work: { open: true, next: 'you' }, todos: 1 }, 'move', 'your-step'],
		// Rule 5 comes before Working (design §3): what the owner owes is not hidden behind a run.
		[{ state: 'waiting_on_task', job: { state: 'running', watch: false, retryLater: false }, todos: 1 }, 'move', 'todo'],
		[{ state: 'needs_human', todos: 1 }, 'move', 'needs-you'],
		[{ state: 'waiting_on_task', todos: 1 }, 'move', 'stopped'],
		[{ state: 'done', todos: 0 }, 'done', 'done'],
		[{ state: 'done', fyiUnread: true, todos: 0 }, 'catchup', 'catchup'],
		[{ state: 'open', work: { open: true, next: 'them' }, todos: 0 }, 'waiting', 'waiting'],
	]
	assert.deepEqual(cases.map(([f]) => { const m = whoseMove({ ...base, ...f }); return [m.section, m.rule] }), cases.map(([, s, r]) => [s, r]))
	assert.deepEqual(RULES.map(r => r.id), ['catchup', 'done', 'needs-you', 'stopped', 'todo', 'job-running', 'starts-next', 'your-step', 'waiting'])
})

test('N2 owned work: the opened item has every plan step with its owner, done steps ticked, the current step marked, and your move', () => {
	const v = nextView(fresh()), a40 = byAct(v, 'A40')!
	assert.deepEqual([a40.section, a40.rule, a40.kind], ['move', 'your-step', 'your-step'])
	assert.deepEqual(a40.work!.steps.map(s => [s.what, s.owner.kind === 'others' ? s.owner.text : s.owner.kind, s.done, s.now]), [
		['Route the staging ring to the dev instance (PR 4200002)', 'you', true, false],
		['Deploy build 991 to staging2', 'delegate', true, false],
		['Test checkout flow 1', 'you', false, true],
		['Test checkout flow 2', 'you', false, false],
		['Report the result in Checkout sync', 'you', false, false],
	])
	assert.equal(a40.work!.steps[1].build, 991)
	// Your move: the step, and the newest step a build check saw done, as a timestamp the page says in the owner's time.
	const at = a40.work!.yours?.check?.at ?? ''
	assert.deepEqual(a40.work!.yours, { what: 'Test checkout flows 1 and 2 on staging2', check: { what: 'Deploy', at, build: 991 } })
	assert.ok(Math.abs(Date.now() - 55 * 60_000 - Date.parse(at)) < 60_000, 'when the build check saw the deploy done')
	assert.equal(a40.work!.then, undefined)
	// Only a step a build check watched says "done (build …)": a later step the owner ticked does not.
	const sb = fresh(), wb = sb.byCode('A40')!
	sb.save({ ...wb, work: { ...wb.work!, plan: wb.work!.plan!.map(x => x.id === 'p3' ? { ...x, done: new Date().toISOString() } : x) } }, false)
	assert.deepEqual(byAct(nextView(sb), 'A40')!.work!.yours!.check?.build, 991)
	assert.equal(a40.work!.report, 'A40: {result}: {text}', 'Report on the work whose next step is yours, on its home')
	assert.deepEqual(a40.work!.happened.map(h => h.what), ['Build 991 succeeded (Deploy build 991 to staging2)', 'Deployed: Deploy build 991 to staging2: run 991', 'Started: test checkout flows 1 and 2 against the new payment service'])
	// Someone else's step: who, in the AI's words (waitingOn), and the owner's step after it. No Report: the next step is not yours.
	const a41 = byAct(v, 'A41')!
	assert.equal(a41.section, 'waiting')
	assert.deepEqual(a41.work!.then, { owner: { kind: 'others', text: 'Dev' }, what: 'Deploy build 992 to staging3', you: 'Test both, report by Fri' })
	assert.deepEqual([a41.work!.yours, a41.work!.report], [undefined, undefined])
	assert.deepEqual(a41.work!.steps.map(s => [s.owner.kind === 'others' ? s.owner.text : s.owner.kind, s.now]), [['Dev', true], ['you', false]])
	// A step for "them" that is not the one waited on names nobody made up.
	const s = fresh(), w = s.byCode('A41')!
	s.save({ ...w, work: { ...w.work!, plan: [...w.work!.plan!, { id: 'p3', what: 'Sign off the release', who: 'them' }] } }, false)
	assert.deepEqual(byAct(nextView(s), 'A41')!.work!.steps.map(x => x.owner), [{ kind: 'others', text: 'Dev' }, { kind: 'you' }, { kind: 'others', text: 'Someone else' }])
	// Work in a part's chat names the person there.
	const s2 = fresh(), w2 = s2.byCode('A23')!
	s2.save({ ...w2, work: { ...w2.work!, plan: [{ id: 'p1', what: 'Deploy to staging', who: 'them', in: 'A38' }, { id: 'p2', what: 'Try the form', who: 'you' }] } }, false)
	assert.deepEqual(byAct(nextView(s2), 'A23')!.work!.steps.map(x => [x.owner, x.where]), [[{ kind: 'others', text: 'Dev Moss' }, 'A38'], [{ kind: 'you' }, undefined]])
	// A row with no open work has no work block; closed work has none either.
	assert.equal(byAct(v, 'A20')!.work, undefined)
	const s3 = fresh(), w3 = s3.byCode('A41')!
	s3.save({ ...w3, work: { ...w3.work!, closed: { at: new Date().toISOString(), why: 'done' } } }, false)
	assert.equal(byAct(nextView(s3), 'A41')?.work, undefined)
})

test('N2 to-do row: a sent reply\'s to-do stays in Your move with who it was promised to, and Mark done is close', () => {
	const s0 = fresh(), v = nextView(s0), r = byAct(v, 'A42')! as NextRow
	assert.deepEqual([r.section, r.rule, r.kind, r.headline], ['move', 'todo', 'todo', 'To do: Update the release checklist in the wiki'])
	assert.deepEqual(r.facts.promise, { to: 'Rita', at: s0.byCode('A42')!.sent!.at, why: 'no tool can do it' })
	assert.deepEqual(r.primary, { label: 'Mark done', command: 'close A42' })
	assert.deepEqual(r.todos?.map(t => t.text), ['Update the release checklist in the wiki'])
	// A refusal says why it is the owner's; two open to-dos say how many more.
	const s = fresh(), w = s.byCode('A42')!
	s.save({ ...w, kept: [...w.kept!, { id: 't2', text: 'Deploy to INT. Not made for you: pipeline 3999 is not on "Where Delegate may deploy" in Settings', at: w.sent!.at }] }, false)
	const two = byAct(nextView(s), 'A42')!
	assert.equal(two.headline, 'To do: Update the release checklist in the wiki (+1 more)')
	s.save({ ...w, kept: [{ id: 't1', text: w.kept![0].text, at: w.sent!.at, done: new Date().toISOString() }, { id: 't2', text: 'Deploy to INT. Not made for you: pipeline 3999 is not on the list', at: w.sent!.at }] }, false)
	const refused = byAct(nextView(s), 'A42')!
	assert.deepEqual([refused.headline, refused.facts.promise?.why], ['To do: Deploy to INT', 'pipeline 3999 is not on the list'])
	// Every to-do done: the item is done, and off Now.
	s.save({ ...w, kept: w.kept!.map(t => ({ ...t, done: new Date().toISOString() })) }, false)
	assert.equal(byAct(nextView(s), 'A42'), undefined)
	assert.match(COMMANDS.todo, /^close <code>/)
	assert.match(COMMANDS['your-step'], /<code>: \{result\}: \{text\} \(Report\)/)
})

// R-NEX-04 for N2: each new button's command, as the page sends it, is accepted and applied on its fixture.
test('N2 commands: Report and Mark done are existing commands the runner applies on their fixtures', async () => {
	// Report on validate work: the answer path, routed as "tested" so its job reads the results and drafts the report (owned work).
	let s = fresh()
	let r = await send(s, 'A40: Issues found: 403 on checkout', byAct(nextView(s), 'A40')!.rev)
	let job = s.job('j-a40')!
	assert.match(job.asks.at(-1)!, /^Owner: "Issues found: 403 on checkout"\. The owner tested\. Read the results for .* on staging2 \(run 991\) and draft the report\.$/)
	assert.deepEqual([job.state, s.byCode('A40')!.state], ['queued', 'waiting_on_task'])
	assert.equal(s.byCode('A40')!.sent, undefined, 'nothing sent')
	// Blocked says so; Both work with no notes is the result alone.
	s = fresh(); await send(s, 'A40: Blocked: staging2 is down')
	assert.match(s.job('j-a40')!.asks.at(-1)!, /^Owner: "Blocked: staging2 is down"\. The owner could not finish testing\. Read the results/)
	s = fresh(); await send(s, 'A40: Both work')
	assert.match(s.job('j-a40')!.asks.at(-1)!, /^Owner: "Both work"\. The owner tested\./)
	// Report on other work: the answer path redrafts with the owner's words, and a reply on open work always waits for the ok.
	s = fresh(); r = await send(s, 'A23: Issues found: the form rejects long names')
	assert.deepEqual([s.byCode('A23')!.state, s.byCode('A23')!.ownerAnswer], ['running', 'Issues found: the form rejects long names'])
	// Mark done: close on a done item with an open to-do marks it done, and the item stays done (never reopened).
	s = fresh(); r = await send(s, 'close A42')
	assert.match(r.said, /A42 will mark its to-do done\. Nothing is sent\./)
	assert.match(r.out, /Marked your to-do on A42 done: Update the release checklist in the wiki\. A42 stays done\. Nothing was sent\./)
	const a42 = s.byCode('A42')!
	assert.deepEqual([a42.state, a42.status, a42.kept!.every(t => !!t.done)], ['done', 'Sent: "Yes, I will update the checklist today."', true])
	assert.equal(byAct(nextView(s), 'A42'), undefined)
	// A second close on the done item is refused as before: nothing left to mark.
	assert.equal(actResult(s, 'close A42', undefined, 'page').accepted, true, 'shown, not queued')
	assert.match(actResult(s, 'close A42', undefined, 'page').text, /already done/)
	// On open work, Mark done marks the to-dos and the work stays open: the button can never end work. A second close ends it.
	s = fresh()
	const a41 = s.byCode('A41')!
	s.save({ ...a41, kept: [{ id: 't1', text: 'Book the test account', at: new Date().toISOString() }] }, false)
	assert.equal(byAct(nextView(s), 'A41')!.kind, 'todo')
	r = await send(s, 'close A41')
	assert.match(r.out, /A41 stays open; say "close A41" again to close it\./)
	assert.deepEqual([s.byCode('A41')!.state, s.byCode('A41')!.work!.closed], ['open', undefined])
	r = await send(s, 'close A41')
	assert.equal(s.byCode('A41')!.state, 'done')
})

test('N2 to-dos survive: a sent reply keeps its to-dos across turns; a draft never sent keeps none; old text to-dos are migrated', () => {
	const at = '2026-10-19T10:00:00.000Z'
	const wf = { code: 'A1', todos: ['Ping the partner PM', 'Ping the partner PM'], sent: { msgId: 'm', at } } as unknown as Workflow
	keepTodos(wf, at)
	assert.deepEqual(wf.kept, [{ id: 't1', text: 'Ping the partner PM', at }])
	keepTodos(wf, at)
	assert.equal(wf.kept!.length, 1, 'an open to-do is kept once')
	newTurn(wf)
	assert.deepEqual([wf.todos, wf.kept!.length], [undefined, 1], 'the next turn drops its own list, never the kept ones')
	wf.todos = ['Update the wiki']
	newTurn(wf)
	assert.deepEqual(wf.kept!.map(t => t.text), ['Ping the partner PM'], 'a draft that was never sent promised nothing')
	wf.kept![0].done = at
	wf.todos = ['Ping the partner PM']
	keepTodos(wf, '2026-10-20T10:00:00.000Z')
	assert.deepEqual(wf.kept!.map(t => [t.id, !!t.done]), [['t1', true], ['t2', false]], 'promised again after it was done: a new to-do')
	// Migration: a sent item from before N2 has its to-dos as text; on load they are kept, dated by the send.
	const s = fresh(), dir = join(s.root, 'state', 'workflows')
	mkdirSync(dir, { recursive: true })
	const old = (id: string, code: string, over: object) => writeFileSync(join(dir, `${id}.json`), JSON.stringify({ ...s.byCode('A20')!, id, code, kept: undefined, ...over }))
	old('w-old1', 'A91', { state: 'done', sent: { msgId: 'x', at }, todos: ['Share the deck'] })
	old('w-old2', 'A92', { state: 'needs_human', sent: { msgId: 'y', at }, todos: ['Not promised yet'] })
	old('w-old3', 'A93', { state: 'done', todos: ['Skipped, never sent'] })
	assert.deepEqual(s.byCode('A91')!.kept, [{ id: 't1', text: 'Share the deck', at }])
	assert.deepEqual([s.byCode('A92')!.kept, s.byCode('A93')!.kept], [undefined, undefined])
	assert.equal(byAct(nextView(s), 'A91')!.headline, 'To do: Share the deck')
})

test('N2 Report results are results: they route as "tested"; anything else keeps its path', () => {
	for (const t of ['Both work', 'Issues found: 403 on checkout', 'Blocked: staging2 is down', 'issues found', ' Both work: no errors ']) assert.equal(reportsResult(t), true, t)
	for (const t of ['Both work fine', 'Issues found later?', 'Blockedness', 'not blocked', 'Kim found issues']) assert.equal(reportsResult(t), false, t)
	assert.equal(saysTested('Issues found: 403'), false, 'the old test is unchanged')
})

// Review N2 (/tmp/review-n2.md): each finding, held by a test that fails without its fix.
test('review N2 P1-1: within a section the design\'s rule order places the thread, so a home\'s to-do never hides a part\'s draft', () => {
	const s = fresh(), home = s.byCode('A41')!, at = new Date().toISOString()
	s.save({ ...home, kept: [{ id: 't1', text: 'Book the test account', at }], work: { ...home.work!, parts: ['w-A43'] } }, false)
	item(s, 'A43', 'Dev Moss', 'Dev Moss', { createdAt: at, partOf: 'w-A41', lastAsk: 'Deploying now, ok?', draft: { text: 'Sounds good.', commitment: false, sources: [] } })
	const r = all(nextView(s)).find(x => x.code === 'A41')!
	assert.deepEqual([r.act, r.rule, r.kind], ['A43', 'needs-you', 'reply'], 'the part\'s draft waits for ok on Now')
	assert.deepEqual(r.todos?.map(t => [t.code, t.text]), [['A41', 'Book the test account']], 'the home\'s to-do is in the opened thread, with its own code')
	// The reverse: the home's own step is the row, and the part's to-do is listed with the part's code for Mark done.
	const s2 = fresh(), h2 = s2.byCode('A40')!
	s2.save({ ...h2, work: { ...h2.work!, parts: ['w-A44'] } }, false)
	item(s2, 'A44', 'Dev Moss', 'Dev Moss', { createdAt: at, state: 'done', partOf: 'w-A40', sent: { msgId: 'm44', at }, kept: [{ id: 't1', text: 'Send Dev the ring name', at }] })
	const r2 = all(nextView(s2)).find(x => x.code === 'A40')!
	assert.deepEqual([r2.act, r2.rule], ['A40', 'your-step'])
	assert.deepEqual(r2.todos?.map(t => [t.code, t.text]), [['A44', 'Send Dev the ring name']])
})

test('review N2 P1-2: waitingOn names only the step the work waits on; a step\'s chat counts only for a part of this work, not the owner', () => {
	const s = fresh(), w = s.byCode('A41')!
	s.save({ ...w, work: { ...w.work!, next: { who: 'them', what: 'Deploy to staging' }, plan: [{ id: 'p1', what: 'Send the trace IDs', who: 'them' }, { id: 'p2', what: 'Deploy to staging', who: 'them' }, { id: 'p3', what: 'Test both', who: 'you' }] } }, false)
	assert.deepEqual(byAct(nextView(s), 'A41')!.work!.steps.map(x => [x.what, x.owner.kind === 'others' ? x.owner.text : x.owner.kind, x.now]), [
		['Send the trace IDs', 'Someone else', false], ['Deploy to staging', 'Dev', true], ['Test both', 'you', false]])
	// Next names no plan step: the first open step of its kind is current, and no one is named on it.
	s.save({ ...w, work: { ...w.work!, next: { who: 'them', what: 'deploy' } } }, false)
	assert.deepEqual(byAct(nextView(s), 'A41')!.work!.steps.map(x => [x.owner.kind === 'others' ? x.owner.text : x.owner.kind, x.now]), [['Someone else', true], ['you', false]])
	// A step "in" an item that is not a part of this work, or a part the owner started, names nobody.
	const s2 = fresh(), w2 = s2.byCode('A23')!
	item(s2, 'A45', 'Robin Park', 'Robin Park', { state: 'open', partOf: 'w-A23' })
	s2.save({ ...w2, work: { ...w2.work!, parts: ['w-A38', 'w-A45'], plan: [{ id: 'p1', what: 'Share the form link', who: 'them', in: 'A20' }, { id: 'p2', what: 'Book a room', who: 'them', in: 'A45' }, { id: 'p3', what: 'Deploy to staging', who: 'them', in: 'A38' }] } }, false)
	assert.deepEqual(byAct(nextView(s2), 'A23')!.work!.steps.map(x => [x.owner.kind === 'others' ? x.owner.text : x.owner.kind, x.where]), [['Someone else', undefined], ['Someone else', 'A45'], ['Dev Moss', 'A38']])
})

test('review N2 P2-1: Mark done marks only the to-dos the owner saw, and a late one never closes the work', async () => {
	// ok, then Mark done: the send keeps a new to-do the owner has not seen; Mark done leaves it open.
	const s = fresh(), w = s.byCode('A20')!, at = new Date(Date.now() - 60_000).toISOString()
	s.save({ ...w, todos: ['Send Kim the launch notes'], kept: [{ id: 't1', text: 'Book the demo room', at }] }, false)
	const rev = s.byCode('A20')!.revAt
	const ok = actResult(s, 'ok A20', rev, 'page'), close = actResult(s, 'close A20', rev, 'page')
	assert.ok(ok.accepted && close.accepted)
	await applyAnswers(s, stub, s.config(), procs as never)
	assert.deepEqual(s.byCode('A20')!.kept!.map(t => [t.text, !!t.done]), [['Book the demo room', true], ['Send Kim the launch notes', false]])
	// Two Mark dones queued on open work: the second finds nothing it saw still open, and the work stays open.
	const s2 = fresh(), w2 = s2.byCode('A41')!
	s2.save({ ...w2, kept: [{ id: 't1', text: 'Book the test account', at }] }, false)
	const a = actResult(s2, 'close A41', undefined, 'page'), b = actResult(s2, 'close A41', undefined, 'page')
	await applyAnswers(s2, stub, s2.config(), procs as never)
	assert.deepEqual([s2.byCode('A41')!.state, s2.byCode('A41')!.work!.closed], ['open', undefined])
	assert.match(s2.outcome(a.ids[0])!, /Marked your to-do on A41 done/)
	assert.match(s2.outcome(b.ids[0])!, /A41: the to-do you marked is already done\. A41 stays open\. Nothing was sent\./)
})

test('review N2 P2-2: to-dos written after N2 on a sent item are not migrated as promises', () => {
	const at = new Date().toISOString(), wf = { code: 'A1', sent: { msgId: 'm', at } } as unknown as Workflow
	keepTodos(wf, at)
	assert.deepEqual(wf.kept, [], 'a send with no to-dos still marks the item as written by N2')
	const s = fresh(), w = s.byCode('A20')!
	s.save({ ...w, state: 'open', sent: { msgId: 'm', at }, kept: [], todos: ['Clone web on mac (git clone https://example.com/web), so work on it can use a local copy'] }, false)
	assert.deepEqual(s.byCode('A20')!.kept, [])
})

test('review N2 P2-3: a to-do on work whose next step is yours stays in Your move while Delegate runs', () => {
	const work = { open: true, next: 'you' as const }
	for (const f of [{ state: 'waiting_on_task', job: { state: 'running', watch: false, retryLater: false } }, { state: 'running', queue: 'next' }] as Partial<Facts>[]) {
		assert.deepEqual(whoseMove({ ...base, ...f, work, todos: 1 }), { section: 'move', rule: 'todo' }, JSON.stringify(f))
		assert.equal(whoseMove({ ...base, ...f, work }).section, 'working', 'with no to-do it is Delegate\'s')
	}
	assert.deepEqual(whoseMove({ ...base, state: 'open', work, todos: 1 }), { section: 'move', rule: 'your-step' })
})

test('review N2 P2-7: only a to-do promised to someone says "You promised"', () => {
	const s = fresh(), w = s.byCode('A42')!, at = w.sent!.at
	const row = (kept: Workflow['kept'], over: Partial<Workflow> = {}) => { s.save({ ...w, ...over, kept }, false); return byAct(nextView(s), 'A42')!.facts.promise }
	assert.deepEqual(row([{ id: 't1', text: 'Deploy to INT. Not made for you: pipeline 3999 is not on the list', at }]), { at, why: 'pipeline 3999 is not on the list' })
	assert.deepEqual(row([{ id: 't1', text: 'Clone web on mac (git clone https://example.com/web), so work on it can use a local copy', at }]), { at })
	assert.deepEqual(row([{ id: 't1', text: 'Update the wiki', at }], { asker: { id: 'me', name: 'Robin Park' } }), { at, why: 'no tool can do it' })
	assert.deepEqual(row([{ id: 't1', text: 'Update the wiki', at }]), { to: 'Rita', at, why: 'no tool can do it' })
})

// Re-review N2 (/tmp/review-n2b.md).
test('re-review N2 P2-B: a rule send due on an item with a kept to-do keeps its place and time; after it, the to-do is in Your move', () => {
	const s = fresh(), w = s.byCode('A42')!, sendAt = new Date(Date.now() + 5 * 60_000).toISOString()
	s.save({ ...w, state: 'scheduled', sendAt, draft: { text: 'Done, the checklist is updated.', commitment: false, sources: [] }, decision: { action: 'send', ruleId: 'R1', reason: 'rule', confidence: 'high' } }, false)
	const r = byAct(nextView(s), 'A42')!
	assert.deepEqual([r.section, r.rule, r.kind, r.next?.at], ['working', 'starts-next', 'scheduled', sendAt])
	s.save({ ...s.byCode('A42')!, state: 'done', sendAt: undefined }, false)
	assert.deepEqual([byAct(nextView(s), 'A42')!.section, byAct(nextView(s), 'A42')!.rule], ['move', 'todo'])
})

test('re-review N2 P2-C: Mark done from the page marks only the to-dos it drew, not one kept after it drew', async () => {
	const s = fresh(), w = s.byCode('A42')!, t0 = w.kept![0].at, t1 = new Date().toISOString()
	const r = byAct(nextView(s), 'A42')!
	assert.equal(r.rev, t0, 'a to-do row\'s rev is the newest to-do it shows')
	// The owner says ok in Teams; the send keeps a new to-do before the page draws again.
	s.save({ ...s.byCode('A42')!, kept: [...w.kept!, { id: 't2', text: 'Tell Rita when the checklist is live', at: t1 }] }, false)
	const said = actResult(s, 'close A42', r.rev, 'page')
	assert.match(said.text, /A42 will mark its to-do done/)
	await applyAnswers(s, stub, s.config(), procs as never)
	assert.deepEqual(s.byCode('A42')!.kept!.map(t => [t.id, !!t.done]), [['t1', true], ['t2', false]])
	assert.equal(byAct(nextView(s), 'A42')!.headline, 'To do: Tell Rita when the checklist is live')
	// From chat, with nothing drawn, close marks every open to-do as before.
	const c = actResult(s, 'close A42', undefined, 'chat')
	await applyAnswers(s, stub, s.config(), procs as never)
	assert.ok(c.accepted && s.byCode('A42')!.kept!.every(t => !!t.done))
})

test('re-review N2 P2-D: every rule has a place in the design order, and an unknown rule never wins a tie', () => {
	assert.deepEqual([...PRECEDENCE].sort(), RULES.map(r => r.id).sort())
	assert.equal(PRECEDENCE.length, RULES.length)
	assert.deepEqual([rankOf('needs-you'), rankOf('a-new-rule')], [0, PRECEDENCE.length])
})
