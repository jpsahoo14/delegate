import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Job, Report, State, Workflow } from '../src/core/types.ts'
import type { BuildProbe } from '../src/runner/probe.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-xcheck-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { item } = await import('./fixture.ts')
const { probePRs, prTarget } = await import('../src/runner/probe.ts')
const { applyReport, dispatch } = await import('../src/runner/dispatch.ts')
const { finishWork } = await import('../src/runner/jobs.ts')
const { afterSend, mergeWork } = await import('../src/runner/work.ts')
const { send } = await import('../src/runner/apply.ts')
const { intake } = await import('../src/runner/intake.ts')
const { ReplaySource } = await import('../scripts/eval.ts')
const { snapshot, place, rowsOf } = await import('../src/web/next.ts')
const { view } = await import('../src/web/view.ts')
const { buildPrompt } = await import('../src/worker/prompt.ts')

const at = new Date().toISOString()
const link = (id: number) => `https://dev.azure.com/acme/Canvas/_git/widget/pullrequest/${id}`
const work = (goal = 'Approve PR 4300101') => ({
	goal, doneWhen: 'The vote is recorded and the reply is sent', steps: [], links: ['pr:acme/widget/4300101'],
	next: { who: 'me' as const, what: 'After ok, approve the PR' },
	waitingOn: { who: "Owner's OK", since: at },
})
function setup() {
	const store = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-xcheck-')), machine: 'test' })
	store.saveConfig({
		schema: 1, owner: { id: 'me', name: 'Robin Park' }, source: { command: [], selfChatId: 'self' },
		watch: [], agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 2, nudgeEveryMin: 30,
	})
	return store
}
function approval(store: InstanceType<typeof Store>, over: Partial<Workflow> = {}) {
	const w = item(store, 'A1', 'Kim', 'Review room', {
		chat: { id: 'review-room', name: 'Review room', test: false, group: false },
		lastMsgId: '101', msgIds: ['101'],
		lastAsk: `Did you approve PR 4300101? ${link(4300101)}`,
		prVote: 10, work: work(),
		draft: { text: "Not yet, my approval hasn't been recorded.", commitment: false, sources: [] },
		...over,
	})
	store.saveThread(w.id, [{ id: '101', at, from: w.asker!, text: w.lastAsk!, byOwner: false }])
	return w
}
const approved: BuildProbe = {
	async builds() { return new Map() },
	async pr() { return { status: 'active', head: 'abc', votes: [{ name: 'Robin Park', vote: 10 }] } },
}

test('engine crosscheck F1: an already-seen approval withdraws the contradicting draft and closes approval work', async () => {
	const store = setup(), w = approval(store)
	await probePRs(store, store.config(), approved, Date.now(), true)
	const got = store.workflow(w.id)!
	assert.equal(got.state, 'done')
	assert.equal(got.draft, undefined)
	assert.ok(got.work?.closed)
	assert.equal(place(snapshot(store)).find(r => r.code === w.code)?.section, 'done')
	for (const workState of [undefined, work('Ship a release after partner testing')]) {
		const other = setup(), ask = approval(other, { work: workState })
		await probePRs(other, other.config(), approved, Date.now(), true)
		assert.equal(other.workflow(ask.id)!.draft, undefined, 'the disproved draft is withdrawn even when broader work stays open')
		assert.equal(other.workflow(ask.id)!.state, workState ? 'running' : 'done')
	}
})

test('engine crosscheck F1: approval is read before drafting, and an ambiguous vote never proves approval', async () => {
	const store = setup(), w = approval(store, { state: 'running', prVote: undefined })
	let ran = false
	const src = new ReplaySource('review-room', [], { id: '102', at, from: w.asker!, html: false, body: 'context' })
	await dispatch(store, src, store.config(), async () => { ran = true; return { exitCode: 0, ms: 1 } }, approved)
	assert.equal(ran, false, 'a live approval answers this ask before a false draft can be made')
	assert.equal(store.workflow(w.id)!.state, 'done')
	const other = setup(), a = approval(other)
	await probePRs(other, other.config(), { ...approved, async pr() { return { status: 'active', votes: [{ name: 'Robin Park', vote: 10 }, { name: 'Robin Park', vote: 0 }] } } }, Date.now(), true)
	assert.equal(other.workflow(a.id)!.state, 'needs_human')
})

test('engine crosscheck F1: a pronoun approval follow-up resolves its own PR from the asker, never another sender', async () => {
	const store = setup(), w = approval(store, { lastAsk: 'Did you get a chance to approve it?', work: undefined })
	store.saveThread(w.id, [
		{ id: '99', at, from: w.asker!, text: `Please approve this change ${link(4300101)}`, byOwner: false },
		...Array.from({ length: 12 }, (_, n) => ({ id: String(200 + n), at, from: { id: 'dev', name: 'Dev' }, text: 'Another topic', byOwner: false })),
		{ id: '100', at, from: { id: 'dev', name: 'Dev' }, text: `Another topic: ${link(4300999)}`, byOwner: false },
		...store.thread(w.id),
	])
	let checked = 0
	await probePRs(store, store.config(), { ...approved, async pr(_project, _repo, id) { checked = id; return approved.pr!(_project, _repo, id) } }, Date.now(), true)
	assert.equal(checked, 4300101)
	assert.equal(store.workflow(w.id)!.state, 'done')
	assert.equal(store.workflow(w.id)!.draft, undefined)
})

test('engine crosscheck F1: send rechecks an approval-only reply without a pending vote', async () => {
	const store = setup(), w = approval(store)
	let posted = 0
	const src = new ReplaySource('review-room', [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
	src.send = async () => { posted++; return { msgId: '102' } }
	assert.equal(await send(store, src, store.config(), w, w.draft!.text, {}, approved), false)
	assert.equal(posted, 0)
	assert.equal(store.workflow(w.id)!.draft, undefined)
})

test('engine crosscheck safety: ambiguous reviewers and an unresolved PR hold approval sends', async () => {
	for (const missing of [false, true]) {
		const store = setup(), w = approval(store, missing ? { intent: 'status_next_step', lastAsk: 'Did you approve PR 4300101?', work: undefined } : {})
		let posted = 0
		const src = new ReplaySource('review-room', [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
		src.send = async () => { posted++; return { msgId: '102' } }
		w.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300999', summary: 'Approve a different PR', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300999, vote: 10 } }, done: { at } }]
		const probe: BuildProbe = { ...approved, async pr() { return { status: 'active', votes: [{ name: 'Robin Park', vote: 10 }, { name: 'Robin Park', vote: 0 }] } } }
		assert.equal(await send(store, src, store.config(), w, w.draft!.text, {}, probe), false)
		assert.equal(posted, 0)
	}
})

test('engine crosscheck safety: PR completion cannot erase a reply owed after our vote', async () => {
	const store = setup(), w = approval(store, { work: undefined, prStatus: 'active' })
	w.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300101', summary: 'Approve PR 4300101', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300101, vote: 10 } }, done: { at } }]
	store.save(w)
	await probePRs(store, store.config(), { ...approved, async pr() { return { status: 'completed', closedAt: new Date(Date.now() + 1000).toISOString(), votes: [{ name: 'Robin Park', vote: 10 }] } } }, Date.now(), true)
	assert.equal(store.workflow(w.id)!.state, 'needs_human')
	assert.equal(store.workflow(w.id)!.draft?.text, w.draft!.text)
	assert.ok(store.workflow(w.id)!.effects?.[0].done)
	await probePRs(store, store.config(), { ...approved, async pr() { return { status: 'completed', closedAt: new Date(Date.now() + 1000).toISOString(), votes: [] } } }, Date.now(), true)
	assert.equal(store.workflow(w.id)!.state, 'needs_human', 'missing live reviewers do not cancel a persisted receipt')
	assert.ok(store.workflow(w.id)!.effects?.[0].done)
	const other = setup(), sent = approval(other, { state: 'open', work: work('Ship a release after partner testing'), sent: { msgId: '102', at, text: 'Approved.' }, effects: w.effects })
	await probePRs(other, other.config(), approved, Date.now(), true, [sent])
	assert.equal(other.workflow(sent.id)!.state, 'open', 'our already-sent vote is not a new external approval')
})

test('engine crosscheck safety: an approved PR redrafts broader asks instead of dropping them', async () => {
	const store = setup(), w = approval(store, { lastAsk: `Approve PR 4300101 and explain the rollout ${link(4300101)}`, work: work('Approve PR 4300101 and verify configuration') })
	await probePRs(store, store.config(), approved, Date.now(), true)
	const got = store.workflow(w.id)!
	assert.equal(got.state, 'running')
	assert.equal(got.draft, undefined)
	assert.ok(!got.work!.closed)
	assert.deepEqual(got.pending, ['101'])
	let runs = 0
	const src = new ReplaySource('review-room', [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
	await dispatch(store, src, store.config(), async (_, input) => {
		runs++
		assert.ok(input.prompt.includes('Runner PR evidence'))
		store.writeReport({ workflowId: input.workflowId, intent: 'status_next_step', state: 'needs_human', summary: 'Approval complete; rollout answer', reply: { text: 'Approved. The rollout is staged.', commitment: false, sources: [] } }, input.runId)
		return { exitCode: 0, ms: 1 }
	}, approved)
	assert.equal(runs, 1)
	const reply = store.workflow(w.id)!
	assert.ok(reply.prDraft)
	let posted = 0
	src.send = async () => { posted++; return { msgId: '102' } }
	assert.equal(await send(store, src, store.config(), reply, reply.draft!.text, {}, approved), true)
	assert.equal(posted, 1, 'fresh drafts based on unchanged live truth can be sent')
	reply.state = 'needs_human'; reply.sent = undefined; store.save(reply)
	assert.equal(await send(store, src, store.config(), reply, reply.draft!.text, {}, { ...approved, async pr() { return { status: 'active', head: 'new-head', votes: [{ name: 'Robin Park', vote: 0 }] } } }), false)
	assert.equal(posted, 1, 'approval reset cannot post an approved draft')
	assert.equal(store.workflow(w.id)!.draft, undefined, 'a new head invalidates even a draft based on an earlier live read')
	assert.equal(store.workflow(w.id)!.state, 'running')
})

test('engine crosscheck safety: an ambiguous two-PR follow-up cannot close from only the first approval', async () => {
	const store = setup(), w = approval(store, { intent: 'status_next_step', work: undefined, lastAsk: 'Did you get a chance to approve it?' })
	store.saveThread(w.id, [{ id: '100', at, from: w.asker!, text: `Please approve both PR 4300101 ${link(4300101)} and PR 4300102 ${link(4300102)}`, byOwner: false }, ...store.thread(w.id)])
	assert.equal(prTarget(store, w), undefined)
	await probePRs(store, store.config(), approved, Date.now(), true)
	assert.equal(store.workflow(w.id)!.state, 'needs_human')
	w.msgIds = ['100', '101']
	w.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300101', summary: 'Approve only the first PR', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', project: 'Canvas', repositoryId: 'widget', pullRequestId: 4300101, vote: 10 } } }]
	store.save(w)
	await probePRs(store, store.config(), approved, Date.now(), true)
	assert.equal(store.workflow(w.id)!.state, 'needs_human', 'a proposed effect cannot override the multi-PR scope')
	let posted = 0
	const src = new ReplaySource('review-room', [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
	src.send = async () => { posted++; return { msgId: '102' } }
	assert.equal(await send(store, src, store.config(), w, w.draft!.text, {}, approved), false)
	assert.equal(posted, 0)
})

test('engine crosscheck safety: incomplete approval conditions and pending family decisions survive receipt repair', async () => {
	const { settleCompleted } = await import('../src/runner/jobs.ts')
	for (const goal of ['Approve PR 4300101 after partner validation', 'Approve PR 4300101']) {
		const store = setup(), w = approval(store, { state: 'open', pending: [], work: work(goal), sent: { msgId: '102', text: 'Approved; still awaiting validation.', at } })
		w.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300101', summary: 'Approve PR 4300101', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300101, vote: 10 } }, done: { at } }]
		const part = item(store, 'A2', 'Dev', 'Partner', { partOf: w.id, pending: ['103'], question: 'Partner asks for rollback decision' })
		w.work!.parts = [part.id]
		store.save(w)
		settleCompleted(store)
		assert.ok(!store.workflow(w.id)!.work!.closed)
		assert.equal(store.workflow(part.id)!.state, 'needs_human')
	}
	for (const condition of ['goal', 'doneWhen', 'plan']) {
		const store = setup(), w = approval(store, { state: 'open', pending: [], sent: { msgId: '102', text: 'Approved.', at } })
		if (condition === 'goal') w.work!.goal = 'Approve PR 4300101 after partner validation'
		if (condition === 'doneWhen') w.work!.doneWhen = 'Partner validation is complete, then approval and reply'
		if (condition === 'plan') w.work!.plan = [{ id: 'p1', who: 'them', what: 'Validate with partner' }]
		w.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300101', summary: 'Approve PR 4300101', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300101, vote: 10 } }, done: { at } }]
		store.save(w)
		settleCompleted(store)
		assert.ok(!store.workflow(w.id)!.work!.closed, `${condition} still has an obligation beyond approval`)
	}
})

test('engine crosscheck safety: group noise cannot replace or settle an older unanswered owned ask', async () => {
	const store = setup(), w = approval(store, { work: undefined, chat: { id: 'review-room', name: 'Review room', test: false, group: true }, lastAsk: 'Robin, can you explain the rollout plan?' })
	const src = new ReplaySource(w.chat.id, [], { id: '102', at, from: w.asker!, html: false, body: 'Thanks, Dev!' })
	await intake(store, src, store.config(), {}, [w.chat])
	const old = store.workflow(w.id)!, candidate = store.workflows().find(o => o.id !== w.id)!
	assert.equal(old.lastAsk, w.lastAsk)
	assert.equal(old.state, 'needs_human')
	assert.equal(old.draft!.text, w.draft!.text)
	assert.ok(candidate.paced)
	assert.equal(candidate.startedBy, 'room')
	applyReport(candidate, { workflowId: candidate.id, intent: 'none', state: 'done', summary: 'Thanks to someone else' })
	store.save(candidate)
	assert.equal(store.workflow(w.id)!.state, 'needs_human')
})

test('engine crosscheck F2: a terminal job closes its work and parts, but not an unrelated part home', () => {
	const store = setup(), w = approval(store, { state: 'waiting_on_task', job: 'job1' })
	const part = item(store, 'A2', 'Dev', 'Other room', { state: 'open', partOf: w.id })
	w.work!.parts = [part.id]; store.save(w)
	const job: Job = { schema: 1, id: 'job1', key: 'pr:acme/widget/4300101', goal: w.lastAsk!, state: 'running', purpose: 'work', session: w.session, parents: [w.id], asks: [], createdAt: at, updatedAt: at }
	store.saveJob(job)
	w.work!.watch = 'watch1'; store.save(w)
	store.saveJob({ ...job, id: 'watch1', every: 60, state: 'done', result: { summary: 'Watching approval', effects: [] } })
	finishWork(store, job, { workflowId: job.id, intent: 'pr_review', state: 'done', summary: 'Already approved; no further action', work: { step: 'Live approval checked' } }, 0)
	assert.equal(store.workflow(w.id)!.state, 'done')
	assert.ok(store.workflow(w.id)!.work?.closed)
	assert.equal(store.workflow(part.id)!.state, 'done')
	assert.ok(store.workflow(w.id)!.work!.steps.some(s => s.what === 'Live approval checked'))
	assert.equal(store.job('watch1')!.every, undefined)
	const home = item(store, 'A3', 'Rita', 'Release', { state: 'open', work: work('Ship the release after partner testing') })
	const p = item(store, 'A4', 'Dev', 'Patch', { state: 'waiting_on_task', partOf: home.id, job: 'job2' })
	home.work!.parts = [p.id]; store.save(home)
	const j2 = { ...job, id: 'job2', parents: [p.id] }; store.saveJob(j2)
	finishWork(store, j2, { workflowId: j2.id, intent: 'pr_review', state: 'done', summary: 'This PR needs nothing more' }, 0)
	assert.equal(store.workflow(home.id)!.state, 'open', 'a terminal part does not finish the larger goal')
	assert.equal(store.workflow(p.id)!.state, 'done')
})

test('engine crosscheck F2: recorded changes plus sent reply close approval work, not a larger release', async () => {
	const store = setup(), w = approval(store)
	w.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300101', summary: 'Approve PR 4300101', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300101, vote: 10 } }, done: { at } }]
	afterSend(w, 'Approved.', '103')
	assert.equal(w.state, 'done')
	assert.ok(w.work!.closed)
	const other = setup(), larger = approval(other, { work: work('Ship a release after partner testing'), sent: { msgId: '104', at, text: 'Approved; waiting for partner testing.' } })
	larger.effects = w.effects
	afterSend(larger, 'Approved; waiting for partner testing.', '104')
	assert.equal(larger.state, 'open')
	other.save(larger)
	const { settleCompleted } = await import('../src/runner/jobs.ts')
	settleCompleted(other)
	assert.equal(other.workflow(larger.id)!.state, 'open', 'new receipts already settled by the send path do not schedule an extra worker')
})

test('engine crosscheck F2/A19: plans cannot replace the ask or redirect its PR', () => {
	const store = setup(), w = approval(store, { job: 'old-job' })
	store.saveJob({ schema: 1, id: 'old-job', key: 'pr:acme/widget/4300099', goal: 'Old PR', state: 'done', purpose: 'work', session: w.session, parents: [], asks: [], createdAt: at, updatedAt: at })
	mergeWork(w, { goal: 'Validate the change in TEST7', doneWhen: 'Tests pass', plan: [{ what: 'Validate in TEST7', who: 'me' }] })
	assert.equal(w.work!.goal, 'Approve PR 4300101')
	assert.equal(w.work!.doneWhen, 'The vote is recorded and the reply is sent')
	assert.equal(w.work!.plan![0].what, 'Validate in TEST7')
	assert.equal(prTarget(store, w), 4300101, 'the current ask wins over an old attached job')
})

test('engine crosscheck A19: only a new owned ask can change the goal, not a stale report or a plan', () => {
	const store = setup(), w = approval(store)
	w.pending = ['105']; w.msgIds = ['101', '105']
	applyReport(w, { workflowId: w.id, intent: 'status_next_step', state: 'needs_human', summary: 'New plan', question: 'Which test ring?', work: { goal: 'Validate in TEST7', changedAsk: '101' } })
	assert.equal(w.work!.goal, 'Approve PR 4300101')
	w.pending = ['106']
	applyReport(w, { workflowId: w.id, intent: 'status_next_step', state: 'needs_human', summary: 'Context from another topic', question: 'Which test ring?', work: { goal: 'Validate in TEST7', changedAsk: '106' } })
	assert.equal(w.work!.goal, 'Approve PR 4300101', 'a context line not owned by the item is not a changed ask')
	w.pending = ['105']
	applyReport(w, { workflowId: w.id, intent: 'status_next_step', state: 'needs_human', summary: 'Asker changed the request', question: 'Which test ring?', work: { goal: 'Validate in TEST7 instead', doneWhen: 'The new requested tests pass', changedAsk: '105' } })
	assert.equal(w.work!.goal, 'Validate in TEST7 instead')
	assert.equal(w.work!.doneWhen, 'The new requested tests pass')
})

test('engine crosscheck F1: unavailable live reads hold sends, while a re-review is not satisfied by an old vote', async () => {
	for (const probe of [undefined, { ...approved, async pr() { throw new Error('Read unavailable') } }, { ...approved, async pr() { return { status: '', votes: [{ name: 'Robin Park', vote: 10 }] } } }]) {
		const store = setup(), w = approval(store)
		await probePRs(store, store.config(), probe, Date.now(), true)
		assert.equal(store.workflow(w.id)!.state, 'needs_human', 'a failed or malformed read cannot settle the ask')
		const src = new ReplaySource('review-room', [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
		src.recent = async () => []
		let posts = 0
		src.send = async () => { posts++; return { msgId: '106' } }
		assert.equal(await send(store, src, store.config(), w, w.draft!.text, {}, probe), false)
		assert.equal(posts, 0)
		assert.match(w.status, /could not be verified/)
	}
	const store = setup(), w = approval(store, { lastAsk: `Please re-review PR 4300101 after the fix ${link(4300101)}` })
	await probePRs(store, store.config(), approved, Date.now(), true)
	assert.equal(store.workflow(w.id)!.state, 'needs_human')
})

test('engine crosscheck F2: a persisted sent approval repairs stale open work and closes the family on the next tick', async () => {
	const store = setup(), w = approval(store, { state: 'open', sent: { msgId: '103', at, text: 'Approved.' } })
	w.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300101', summary: 'Approve PR 4300101', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300101, vote: 10 } }, done: { at } }]
	const part = item(store, 'A2', 'Dev', 'Other room', { state: 'open', partOf: w.id })
	w.work!.parts = [part.id]; store.save(w)
	const terminal = item(store, 'A3', 'Rita', 'Another review', { state: 'open', lastAsk: 'Please approve PR 4300301', job: 'terminal-job', work: { ...work('Approve PR 4300301'), links: ['pr:4300301'] }, draft: undefined })
	store.saveJob({ schema: 1, id: 'terminal-job', key: 'pr:4300301', goal: terminal.lastAsk!, session: terminal.session, state: 'done', purpose: 'work', parents: [terminal.id], asks: [], result: { summary: 'No review needed', effects: [] }, createdAt: at, updatedAt: at })
	const { tick } = await import('../src/runner/tick.ts')
	const src = new ReplaySource('review-room', [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
	await tick(store, { source: src, force: true, history: { async search() { return [] }, async close() {} }, run: async () => { assert.fail('repair must not run AI') } })
	assert.equal(store.workflow(w.id)!.state, 'done')
	assert.ok(store.workflow(w.id)!.work?.closed)
	assert.equal(store.workflow(part.id)!.state, 'done')
	assert.equal(store.workflow(terminal.id)!.state, 'done')
})

test('engine crosscheck F2/F3: legacy completion receipts queue remaining work once instead of waiting on an already finished step', async () => {
	const { settleCompleted } = await import('../src/runner/jobs.ts')
	const store = setup(), w = approval(store, { state: 'open', pending: [], draft: undefined, job: 'finished', status: 'Nothing needed: already approved', work: work('Validate the change in preview') })
	w.work!.plan = [{ id: 'p1', what: 'Send the approval reply', who: 'me' }]
	store.save(w)
	store.saveJob({ schema: 1, id: 'finished', key: 'pr:4300101', goal: w.lastAsk!, session: w.session, state: 'done', purpose: 'work', parents: [w.id], asks: [], result: { summary: 'Already approved', effects: [] }, createdAt: at, updatedAt: at })
	settleCompleted(store)
	const got = store.workflow(w.id)!
	assert.equal(got.state, 'running')
	assert.ok(!got.work!.closed, 'the AI must reconcile a broader or drifted legacy goal')
	applyReport(got, { workflowId: w.id, intent: 'status_next_step', state: 'done', summary: 'Partner validation remains', work: { next: { who: 'them', what: 'Partner validates' } } })
	store.save(got)
	settleCompleted(store)
	assert.equal(store.workflow(w.id)!.state, 'open', 'the same receipt must not schedule repeated runs')
	const job = store.job('finished')!
	finishWork(store, job, { workflowId: job.id, intent: 'status_next_step', state: 'done', summary: 'No more PR work' }, 0)
	settleCompleted(store)
	assert.equal(store.workflow(w.id)!.state, 'open', 'a current job result has already settled its step')
})

test('engine crosscheck F5: distinct PRs from another sender or the same sender never disappear inside old work', async () => {
	const store = setup(), chat = { id: 'review-room', name: 'Review room', group: true, test: false }
	const old = approval(store, { chat, state: 'open' })
	const ask = async (id: string, person: string, text: string) => intake(store, new ReplaySource(chat.id, [], { id, at, from: { id: person, name: person }, html: false, body: `Robin Park, ${text}` }), store.config(), {}, [chat])
	await ask('201', 'Dev', `Can this PR get a review too? PR 4300201 ${link(4300201)}`)
	await ask('202', 'Dev', `And this one: ${link(4300202)}`)
	const own = store.workflows().filter(w => w.asker?.id === 'Dev')
	assert.equal(own.length, 2)
	assert.ok(own.every(w => w.pending.length === 1))
	assert.ok(own.every(w => !w.startedBy), 'these directly addressed asks exercise normal sender routing')
	assert.equal(store.workflow(old.id)!.lastAsk, old.lastAsk)
})

test('engine crosscheck F3/A14: every fixture state appears exactly once, including partner waits and parts', () => {
	const store = setup()
	const states: State[] = ['running', 'needs_human', 'waiting_on_task', 'waiting_on_sender', 'scheduled', 'open', 'done']
	for (const [n, state] of states.entries()) item(store, `A${n + 1}`, 'Kim', 'Room', { state, work: state === 'open' ? { ...work('Get a partner fix'), next: undefined, waitingOn: { who: 'Partner team', since: at } } : undefined })
	const home = store.byCode('A6')!
	const p = item(store, 'A8', 'Dev', 'Partner chat', { state: 'open', partOf: home.id })
	home.work!.parts = [p.id]; store.save(home)
	const rows = place(snapshot(store))
	for (const w of store.workflows()) assert.equal(rows.flatMap(r => r.subjects).filter(c => c === w.code).length, 1, w.code)
	const rendered = rowsOf(snapshot(store), rows)
	for (const w of store.workflows().filter(w => w.state !== 'done')) assert.equal(rendered.filter(r => rows.find(p => p.code === r.code)!.subjects.includes(w.code)).length, 1, `rendered ${w.code}`)
	assert.equal(rows.find(r => r.code === 'A6')?.section, 'waiting')
	assert.deepEqual(rows.find(r => r.code === 'A6')?.next?.owner, { kind: 'others', text: 'Partner team' })
	const classic = view(store, undefined)
	assert.ok(classic.progress.some(r => r.code === 'A8'), 'a part with no work record is still in progress')
})

test('engine crosscheck F3: the shared inbox fixtures all have exactly one placement', async () => {
	const store = setup(), { seedInbox } = await import('./fixture.ts')
	seedInbox(store)
	const s = snapshot(store), placed = place(s), rows = rowsOf(s, placed)
	for (const w of store.workflows()) {
		const hits = placed.filter(r => r.subjects.includes(w.code))
		assert.equal(hits.length, 1, w.code)
		if (w.state !== 'done') assert.equal(rows.filter(r => r.code === hits[0].code).length, 1, `visible ${w.code}`)
	}
})

test('engine crosscheck prompts: approval truth, goal fidelity, distinct asks and relevant FYIs are explicit judgments', () => {
	const store = setup(), w = approval(store, { startedBy: 'room' })
	const prompt = buildPrompt(w, store.thread(w.id), store.config(), store.root)
	for (const rule of [
		"read the PR's live status and the owner's own reviewer vote",
		'Preserve the original ask in `goal` and `doneWhen`',
		'A different sender or a different PR is not the same completed review',
		'Decide separately: does the owner need to act, and should they know?',
		'Deployment/testing progress, a regression opened with a partner',
		'An absent @mention or greeting does not settle it',
	]) assert.ok(prompt.includes(rule), rule)
	assert.ok(!prompt.includes('otherwise report intent none with a one-line summary of why it is not theirs; nothing is shown'))
})

test('engine crosscheck F5/F8: group asks and FYIs reach judgment without a greeting or mention and log skips privately', async () => {
	const store = setup(), chat = { id: 'review-room', name: 'Review room', group: true, test: false }
	const fixtures = JSON.parse(readFileSync(new URL('../evals/engine-xcheck.json', import.meta.url), 'utf8')) as { id: string; text: string; fyi?: string }[]
	const cursors: Record<string, string> = {}
	for (const [n, fixture] of fixtures.entries()) {
		const msg = { id: String(200 + n), at, from: { id: `person${n}`, name: 'Kim' }, html: false, body: fixture.text }
		const src = new ReplaySource(chat.id, [], msg)
		assert.equal(await intake(store, src, store.config(), cursors, [chat]), 1, fixture.id)
	}
	assert.equal(store.workflows().length, fixtures.length)
	assert.ok(store.workflows().every(w => w.paced), 'group judgment persists behind direct asks')
	for (const [n, w] of store.workflows().entries()) {
		const fixture = fixtures.find(f => f.text === w.lastAsk)!
		applyReport(w, { workflowId: w.id, intent: 'none', state: 'done', summary: 'Relevant news, no owner action', ...(fixture.fyi ? { fyi: { line: fixture.fyi, gist: 'No reply needed', weight: 'normal' as const } } : {}) })
		store.save(w)
		if (fixture.fyi) assert.ok(store.workflow(w.id)!.fyi, `FYI ${n} is not suppressed just because it came from a group`)
	}
	const noise = new ReplaySource(chat.id, [], { id: '999', at, from: null, html: false, body: 'private text must not be logged' })
	await intake(store, noise, store.config(), cursors, [chat])
	const skipped = store.logs(1).find(l => l.event === 'intake-skip' && l.msgId === '999')
	assert.ok(skipped)
	assert.equal(skipped.chat, chat.id)
	assert.equal(skipped.reason, 'system message')
	assert.ok(!JSON.stringify(skipped).includes('private text'))
})

test('engine crosscheck F5/F8: daily limits defer group judgment without dropping messages and judgments log IDs only', async () => {
	const store = setup(), chat = { id: 'review-room', name: 'Review room', group: true, test: false }
	store.saveConfig({ ...store.config(), dailyRuns: 1 })
	const cursors: Record<string, string> = {}
	for (const id of ['301', '302']) await intake(store, new ReplaySource(chat.id, [], { id, at, from: { id: `p${id}`, name: 'Kim' }, html: false, body: `private message ${id}` }), store.config(), cursors, [chat])
	const src = new ReplaySource(chat.id, [], { id: '303', at, from: null, html: false, body: '' })
	await dispatch(store, src, store.config(), async (_, input) => {
		store.writeReport({ workflowId: input.workflowId, intent: 'none', state: 'done', summary: 'Unrelated' }, input.runId)
		return { exitCode: 0, ms: 1 }
	})
	assert.equal(store.workflows().filter(w => w.state === 'running' && w.paced).length, 1, 'the unjudged message remains queued')
	assert.equal(store.workflows().filter(w => w.state === 'done').length, 1)
	const judged = store.logs(1).filter(l => l.event === 'intake-skip' && String(l.reason).startsWith('judged'))
	assert.equal(judged.length, 1)
	assert.equal(judged[0].chat, chat.id)
	assert.ok(['301', '302'].includes(String(judged[0].msgId)))
	assert.ok(!JSON.stringify(judged).includes('private message'))
})
