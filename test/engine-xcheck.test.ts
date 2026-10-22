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
const { checkJobs, finishWork } = await import('../src/runner/jobs.ts')
const { afterSend, mergeWork } = await import('../src/runner/work.ts')
const { send } = await import('../src/runner/apply.ts')
const { intake } = await import('../src/runner/intake.ts')
const { ReplaySource, outcomeOf } = await import('../scripts/eval.ts')
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

test('engine safety F1: completed approval claims require live approval, while negatives and future promises remain valid', async () => {
	for (const vote of [0, -5]) for (const byOwner of [false, true]) for (const stamp of [undefined, 0, 10]) {
		for (const [text, allowed] of [['I have approved PR 4300101.', false], ['I have not approved PR 4300101 yet.', true], ["I'll approve PR 4300101 after the requested changes.", true], ["I'll approve it later, but I have already approved PR 4300101.", false]] as const) {
			const store = setup(), w = approval(store, { work: undefined, prVote: stamp, prDraft: stamp === undefined ? undefined : JSON.stringify([4300101, 'active', 'abc', stamp]), lastAsk: `Please review PR 4300101 ${link(4300101)}`, draft: { text, commitment: false, sources: [], byOwner: byOwner ? true : undefined } })
			const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
			let posts = 0
			src.send = async () => { posts++; return { msgId: '102' } }
			const result = await send(store, src, store.config(), w, text, {}, { ...approved, async pr() { return { status: 'active', head: 'abc', votes: [{ name: 'Robin Park', vote }] } } })
			if (!allowed) assert.equal(result, false, `${text}; vote=${vote}, byOwner=${byOwner}, stamp=${stamp}`)
			else if (stamp === undefined || stamp === vote || byOwner) assert.equal(result, true, `valid negative/future reply: ${text}; vote=${vote}, byOwner=${byOwner}, stamp=${stamp}`)
			assert.equal(posts, Number(result))
		}
	}
})

test('engine safety V1: status claims use their own PR evidence, while other-PR future promises remain valid', async () => {
	for (const receipt of [false, true]) for (const [text, vote, allowed] of [
		['I have approved PR 4300999.', 10, false],
		['I have not approved PR 4300999 yet.', 0, false],
		['I have approved 4300999.', 10, false],
		['I have approved pull request #4300999.', 10, false],
		['Left a comment. I have approved PR 4300101.', 10, false],
		['I have approved PR 4300101.', 10, true],
		['I have approved it.', 10, true],
		['I have not approved PR 4300101 yet.', 0, true],
		['I have not approved it yet.', 0, true],
		['I will approve PR 4300999 after the requested changes.', 0, true],
	] as const) {
		const store = setup(), w = approval(store, { work: undefined, prVote: vote, prDraft: JSON.stringify([4300101, 'active', 'abc', vote]), draft: { text, commitment: false, sources: [], byOwner: true } })
		if (receipt) w.effects = [{ system: 'ado', action: 'vote', target: 'PR 4300101', summary: 'Vote recorded', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300101, vote } }, done: { at } }]
		const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
		let posts = 0
		src.send = async () => { posts++; return { msgId: '102' } }
		assert.equal(await send(store, src, store.config(), w, text, {}, { ...approved, async pr() { return { status: 'active', head: 'abc', votes: [{ name: 'Robin Park', vote }] } } }), allowed, `${text}; receipt=${receipt}`)
		assert.equal(posts, Number(allowed))
	}
})

test('engine safety V2: vote receipts never bypass subject and meaning validation or fresher owner evidence', async () => {
	for (const receiptVote of [-10, -5, 0, 5, 10]) for (const current of [undefined, 0, 10]) for (const positive of [false, true]) {
		const text = positive ? 'I have approved PR 4300101.' : 'I have not approved PR 4300101 yet.'
		const vote = current ?? receiptVote
		const store = setup(), w = approval(store, { work: undefined, prVote: current, prDraft: JSON.stringify([4300101, current === undefined ? 'completed' : 'active', 'abc', current ?? null]), draft: { text, commitment: false, sources: [], byOwner: true } })
		w.effects = [{ system: 'ado', action: 'vote', target: 'PR 4300101', summary: 'Vote recorded', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', project: 'Canvas', repositoryId: 'widget', pullRequestId: 4300101, vote: receiptVote } }, done: { at } }]
		const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
		let posts = 0, reads = 0
		src.send = async () => { posts++; return { msgId: '102' } }
		const allowed = positive ? vote >= 5 : vote < 5
		assert.equal(await send(store, src, store.config(), w, text, {}, { ...approved, async pr() { reads++; return { status: current === undefined ? 'completed' : 'active', head: 'abc', votes: current === undefined ? [] : [{ name: 'Robin Park', vote: current }] } } }), allowed, `receipt=${receiptVote}, current=${current}, positive=${positive}`)
		assert.equal(reads, 1, 'a historical receipt does not skip the current read')
		assert.equal(posts, Number(allowed))
	}
})

test('engine safety V1: an outgoing PR status cannot supply its own missing source identity', async () => {
	const text = 'I have approved PR 4300999.'
	const store = setup(), w = approval(store, { work: undefined, intent: 'status_next_step', lastAsk: 'How are things?', draft: { text, commitment: false, sources: [], byOwner: true } })
	const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
	let posts = 0
	src.send = async () => { posts++; return { msgId: '102' } }
	assert.equal(await send(store, src, store.config(), w, text, {}, approved), false)
	assert.equal(posts, 0)
})

test('engine safety V2: receipt fallback requires a completed PR and one current successful scoped execution', async () => {
	for (const kind of ['valid', 'scope-less', 'project', 'repo', 'pr', 'stale', 'failed', 'unknown', 'off', 'duplicate', 'head', 'invalid-vote', 'invalid-live', 'abandoned', 'active', 'missing-owner', 'ambiguous-owner', 'unavailable', 'malformed', 'blank-owner'] as const) {
		const text = 'I have approved PR 4300101.'
		const store = setup(), w = approval(store, { work: undefined, draft: { text, commitment: false, sources: [], byOwner: true } })
		const e = { system: 'ado', action: 'vote', target: 'PR 4300101', summary: 'Vote recorded', head: 'abcdef123', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', project: 'Canvas', repositoryId: 'widget', pullRequestId: 4300101, vote: 10 } }, done: { at } }
		w.effects = [e]
		if (kind === 'scope-less') e.call.args.project = ''
		if (kind === 'project') e.call.args.project = 'Other'
		if (kind === 'repo') e.call.args.repositoryId = 'other'
		if (kind === 'pr') e.call.args.pullRequestId = 4300999
		if (kind === 'stale') e.done.at = '2000-01-01T00:00:00.000Z'
		if (kind === 'failed') w.effects[0].error = 'Not made'
		if (kind === 'unknown') w.effects[0].maybe = true
		if (kind === 'off') w.effects[0].off = true
		if (kind === 'duplicate') w.effects.push({ ...e })
		if (kind === 'head') e.head = 'different'
		if (kind === 'invalid-vote') e.call.args.vote = 6
		if (kind === 'blank-owner') store.saveConfig({ ...store.config(), owner: { id: 'me', name: '' } })
		const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
		let posts = 0
		src.send = async () => { posts++; return { msgId: '102' } }
		const allowed = kind === 'valid'
		assert.equal(await send(store, src, store.config(), w, text, {}, { ...approved, async pr() {
			if (kind === 'unavailable') throw new Error('Fictional read failure')
			return { status: kind === 'active' ? 'active' : kind === 'abandoned' ? 'abandoned' : kind === 'malformed' ? 'unknown' : 'completed', head: 'abcdef123', votes: kind === 'invalid-live' ? [{ name: 'Robin Park', vote: 6 }] : kind === 'missing-owner' ? [{ name: 'Kim', vote: 10 }] : kind === 'ambiguous-owner' ? [{ name: 'Robin Park', vote: 10 }, { name: 'Robin Park', vote: 0 }] : [] }
		} }), allowed, kind)
		assert.equal(posts, Number(allowed), kind)
	}
})

test('engine safety V2: unsupported live votes cannot satisfy approval before drafting', async () => {
	for (const vote of [6, 99, Number.NaN]) {
		const store = setup(), w = approval(store)
		await probePRs(store, store.config(), { ...approved, async pr() { return { status: 'active', votes: [{ name: 'Robin Park', vote }] } } }, Date.now(), true)
		const got = store.workflow(w.id)!
		assert.equal(got.prUnknown, true)
		assert.ok(!got.work!.closed)
		assert.notEqual(got.state, 'done')
	}
})

test('engine safety F2: terminal part reports cannot close pending home asks or unresolved home changes', async () => {
	for (const viaJob of [false, true]) for (const obligation of ['ask', 'effect']) {
		const store = setup(), home = approval(store, { state: obligation === 'ask' ? 'running' : 'needs_human', pending: obligation === 'ask' ? ['202'] : [], work: work('Ship the widget release'), updatedAt: '2026-01-02T00:00:00.000Z' })
		home.work!.watch = 'watch1'
		if (obligation === 'effect') home.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300101', summary: 'Approve', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300101, vote: 10 } }, error: 'Vote failed' }]
		const part = item(store, 'A2', 'Dev', 'Partner', { state: 'running', partOf: home.id, pending: viaJob ? [] : ['201'], msgIds: ['201'], lastAsk: 'Finish the partner check', updatedAt: '2026-01-01T00:00:00.000Z', job: viaJob ? 'job1' : undefined })
		home.work!.parts = [part.id]; store.save(home, false)
		const job: Job = { schema: 1, id: 'job1', key: 'partner:widget', goal: part.lastAsk!, state: 'running', purpose: 'work', session: part.session, parents: [part.id], asks: [], createdAt: at, updatedAt: at }
		store.saveJob({ ...job, id: 'watch1', every: 60, state: 'done' })
		const report: Report = { workflowId: viaJob ? job.id : part.id, intent: 'status_next_step', state: 'done', summary: 'Partner check finished', work: { closed: 'Release complete' } }
		if (viaJob) { store.saveJob(job); finishWork(store, job, report, 0) }
		else {
			store.saveConfig({ ...store.config(), dailyRuns: 1 })
			await dispatch(store, new ReplaySource(part.chat.id, [], { id: '201', at, from: part.asker!, html: false, body: part.lastAsk! }), store.config(), async (_, input) => { store.writeReport(report, input.runId); return { exitCode: 0, ms: 1 } })
		}
		const got = store.workflow(home.id)!
		assert.ok(!got.work!.closed, `${viaJob ? 'job' : 'reply'} must retain home ${obligation}`)
		assert.notEqual(got.state, 'done')
		assert.equal(store.job('watch1')!.every, 60)
		assert.deepEqual(got.pending, obligation === 'ask' ? ['202'] : [])
		if (obligation === 'effect') assert.equal(got.effects![0].error, 'Vote failed')
	}
})

test('engine safety F1: approval-sensitive templates have no unchecked remainder or inferred positive meaning', async () => {
	for (const [text, vote, allowed] of [
		['I will approve PR 4300101; actually, I already have.', 0, false],
		['I have never given approval for PR 4300101.', 10, false],
		['I will approve PR 4300101 after the requested changes, actually I already have.', 0, false],
		['I have approved PR 4300101.', 10, true],
		['Approved, thanks.', 10, true],
		['I have not approved PR 4300101 yet.', 10, false],
		['I have not approved PR 4300101 yet.', 0, true],
		['Not yet, my approval has not been recorded.', 0, true],
		['I will approve PR 4300101 after the requested changes.', 0, true],
	] as const) {
		const store = setup(), w = approval(store, { work: undefined, prVote: vote, prDraft: JSON.stringify([4300101, 'active', 'abc', vote]), lastAsk: `Please review PR 4300101 ${link(4300101)}`, draft: { text, commitment: false, sources: [], byOwner: true } })
		const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
		let posts = 0
		src.send = async () => { posts++; return { msgId: '102' } }
		assert.equal(await send(store, src, store.config(), w, text, {}, { ...approved, async pr() { return { status: 'active', head: 'abc', votes: [{ name: 'Robin Park', vote }] } } }), allowed, text)
		assert.equal(posts, Number(allowed))
	}
})

test('engine safety F3: a done part with retained to-dos keeps one actionable Classic and New family row', () => {
	for (const state of ['open', 'running', 'needs_human', 'waiting_on_task', 'done'] as const) {
		const store = setup(), home = approval(store, { state, draft: undefined, pending: [], work: work('Ship the widget release') })
		const part = item(store, 'A2', 'Dev', 'Partner', { state: 'done', partOf: home.id, kept: [{ id: 't1', text: 'Verify partner results', at }] })
		home.work!.parts = [part.id]; store.save(home)
		const classic = view(store, undefined), placed = place(snapshot(store))
		const rows = [...classic.needs, ...classic.running, ...classic.progress, ...classic.watching]
		assert.equal(rows.filter(r => [home.code, part.code].includes(r.code)).length, 1, state)
		assert.equal(rowsOf(snapshot(store), placed).filter(r => r.code === home.code).length, 1)
		if (placed.some(r => r.rule === 'todo')) assert.ok(JSON.stringify(classic.progress).includes('Verify partner results'))
	}
})

test('engine safety F2: a terminal report cannot consume newer own asks or erase unverified own effects', async () => {
	for (const obligation of ['ask', 'effect']) {
		const store = setup(), w = approval(store, { state: 'running', pending: ['101'], draft: undefined, work: work('Ship the widget release') })
		if (obligation === 'effect') {
			w.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300101', summary: 'Approve', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300101, vote: 10 } }, maybe: true }]
			store.save(w)
		}
		await dispatch(store, new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! }), store.config(), async (_, input) => {
			if (obligation === 'ask') {
				const fresh = store.workflow(w.id)!
				fresh.pending.push('202'); fresh.msgIds.push('202'); store.save(fresh)
			}
			store.writeReport({ workflowId: w.id, intent: 'status_next_step', state: 'done', summary: 'Finished', work: { closed: 'Released' } }, input.runId)
			return { exitCode: 0, ms: 1 }
		})
		const got = store.workflow(w.id)!
		assert.ok(!got.work!.closed, obligation)
		if (obligation === 'ask') assert.ok(got.pending.includes('202'))
		else assert.equal(got.effects![0].maybe, true)
	}
})

test('engine safety F4: failed unavailable and malformed live reads never present stale approval as fresh runner facts', async () => {
	for (const probe of [undefined, { ...approved, async pr() { throw new Error('Offline') } }, { ...approved, async pr() { return { status: '', votes: [] } } }, { ...approved, async pr() { return { status: 'active', votes: [] } } }]) {
		const store = setup(), w = approval(store, { state: 'running', draft: undefined, pending: ['101'], lastAsk: `Please re-review PR 4300101 ${link(4300101)}`, prRead: JSON.stringify([4300101, 'active', 'old-head', 10]) })
		let prompt = ''
		await dispatch(store, new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! }), store.config(), async (_, input) => { prompt = input.prompt; store.writeReport({ workflowId: w.id, intent: 'status_next_step', state: 'needs_human', summary: 'Check unavailable', question: 'Check the PR again?' }, input.runId); return { exitCode: 0, ms: 1 } }, probe)
		assert.ok(!prompt.includes('old-head'))
		assert.match(prompt, /PR.*could not be verified/)
		assert.equal(store.workflow(w.id)!.prRead, undefined)
	}
})

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
	assert.equal(await send(store, src, store.config(), reply, reply.draft!.text, {}, approved), false, 'unbounded approval wording is conservatively redrafted, not interpreted as proof')
	assert.equal(reply.draft, undefined)
	await dispatch(store, src, store.config(), async (_, input) => {
		store.writeReport({ workflowId: input.workflowId, intent: 'status_next_step', state: 'needs_human', summary: 'Approval verified; rollout answer', reply: { text: 'The rollout is staged.', commitment: false, sources: [] } }, input.runId)
		return { exitCode: 0, ms: 1 }
	}, approved)
	const explained = store.workflow(w.id)!
	Object.assign(reply, explained)
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
	assert.equal(store.workflow(w.id)!.state, 'running')
	assert.equal(store.workflow(w.id)!.draft, undefined)
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
	assert.equal(classic.progress.filter(r => ['A6', 'A8'].includes(r.code)).length, 1, 'one ongoing row represents the home and its part')
	const codes = [...classic.needs, ...classic.running, ...classic.progress, ...classic.watching].map(r => r.code)
	for (const w of store.workflows().filter(w => w.state !== 'done' && !w.partOf)) {
		const family = [w.code, ...store.workflows().filter(p => p.partOf === w.id).map(p => p.code)]
		assert.equal(codes.filter(c => family.includes(c)).length, 1, `Classic assembled ${w.code}`)
	}
})

test('engine crosscheck F3: the shared inbox fixtures all have exactly one placement', async () => {
	const store = setup(), { seedInbox } = await import('./fixture.ts')
	seedInbox(store)
	const s = snapshot(store), placed = place(s), rows = rowsOf(s, placed)
	const classic = view(store, undefined)
	const classicRows = [...classic.needs, ...classic.running, ...classic.progress, ...classic.watching, ...classic.waiting, ...classic.automations]
	for (const w of store.workflows()) {
		const hits = placed.filter(r => r.subjects.includes(w.code))
		assert.equal(hits.length, 1, w.code)
		if (w.state !== 'done') {
			assert.equal(rows.filter(r => r.code === hits[0].code).length, 1, `visible ${w.code}`)
			assert.equal(classicRows.filter(r => placed.find(p => p.subjects.includes(r.code))?.code === hits[0].code).length, 1, `Classic visible ${w.code}`)
		}
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
	assert.equal(skipped.reason, 'prefilter')
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
	const judged = store.logs(1).filter(l => l.event === 'intake-skip' && l.reason === 'ai-noise')
	assert.equal(judged.length, 1)
	assert.equal(judged[0].chat, chat.id)
	assert.ok(['301', '302'].includes(String(judged[0].msgId)))
	assert.ok(!JSON.stringify(judged).includes('private message'))
})

test('engine review F1: a scheduled reply with unchanged verified PR evidence can send', async () => {
	const store = setup(), w = approval(store, { state: 'scheduled', prVote: 0, prDraft: JSON.stringify([4300101, 'active', 'abc', 0]) })
	w.draft!.text = 'I have not approved it yet.'
	store.save(w)
	const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
	let sends = 0
	src.send = async () => { sends++; return { msgId: '102' } }
	const zero: BuildProbe = { ...approved, async pr() { return { status: 'active', head: 'abc', votes: [{ name: 'Robin Park', vote: 0 }] } } }
	assert.equal(await send(store, src, store.config(), w, w.draft!.text, {}, zero), true)
	assert.equal(sends, 1)
})

test('engine review F1: re-review workers read live approval before drafting without treating it as completion', async () => {
	for (const prVote of [0, 10]) for (const hasWork of [true, false]) for (const status of ['active', 'completed']) {
		const store = setup(), w = approval(store, { state: 'running', draft: undefined, pending: ['101'], prVote, prStatus: 'active', lastAsk: `Please re-review PR 4300101 ${link(4300101)}` })
		if (!hasWork) { delete w.work; store.save(w) }
		const evidence = JSON.stringify([4300101, status, 'abc', 10])
		const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
		await dispatch(store, src, store.config(), async (_, input) => {
			assert.ok(input.prompt.includes(evidence), 'the re-review worker receives the current approval evidence')
			store.writeReport({ workflowId: w.id, intent: 'status_next_step', state: 'needs_human', summary: 'Re-review still needed', question: 'Which new changes should I review?' }, input.runId)
			return { exitCode: 0, ms: 1 }
		}, { ...approved, async pr() { return { status, head: 'abc', votes: [{ name: 'Robin Park', vote: 10 }] } } })
		assert.equal(store.workflow(w.id)!.prRead, evidence)
		assert.equal(store.workflow(w.id)!.state, 'needs_human')
	}
})

test('engine review F1: a legacy re-review draft contradicting an already-seen approval is withdrawn', async () => {
	const store = setup(), w = approval(store, { lastAsk: `Please re-review PR 4300101 ${link(4300101)}` })
	await probePRs(store, store.config(), approved, Date.now(), true)
	assert.equal(store.workflow(w.id)!.state, 'running')
	assert.equal(store.workflow(w.id)!.draft, undefined)
	assert.ok(!store.workflow(w.id)!.work!.closed)
})

test('engine review F1: the common boundary checks approval claims even when the original ask was only review', async () => {
	const store = setup(), w = approval(store, { state: 'scheduled', lastAsk: `Please review PR 4300101 ${link(4300101)}` })
	const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
	let sent = 0
	src.send = async () => { sent++; return { msgId: '102' } }
	assert.equal(await send(store, src, store.config(), w, w.draft!.text, {}, approved), false)
	assert.equal(sent, 0)
	assert.equal(store.workflow(w.id)!.draft, undefined)
	assert.equal(store.workflow(w.id)!.state, 'running')
})

test('engine review F1: finished jobs use live evidence for reply-only approval claims', async () => {
	for (const mine of [0, 10]) {
		const store = setup(), w = approval(store, { state: 'waiting_on_task', job: 'job1', pending: [], prVote: 0, prDraft: JSON.stringify([4300101, 'active', 'abc', 0]), lastAsk: `Please re-review PR 4300101 ${link(4300101)}`, work: work('Re-review PR 4300101') })
		w.approved = { text: w.draft!.text, effects: '[]', at }
		store.save(w)
		const job: Job = { schema: 1, id: 'job1', key: 'pr:acme/widget/4300101', goal: w.lastAsk!, state: 'running', purpose: 'execute', session: w.session, parents: [w.id], asks: [], createdAt: at, updatedAt: at, run: { id: 'run1', pid: 123, startedAt: at, machine: 'test', purpose: 'execute', asks: 0 }, result: { summary: 'Finished', effects: [] } }
		store.saveJob(job)
		store.writeReport({ workflowId: job.id, intent: 'pr_review', state: 'done', summary: 'Finished' }, 'run1')
		const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
		let reads = 0, posts = 0
		src.send = async () => { posts++; return { msgId: '102' } }
		await checkJobs(store, src, store.config(), { start() { throw new Error('Unexpected start') }, alive: () => false, kill: () => true, openWindow() { throw new Error('Unexpected window') }, bootMs: () => 0 }, { ...approved, async pr() { reads++; return { status: 'active', head: 'abc', votes: [{ name: 'Robin Park', vote: mine }] } } })
		assert.equal(reads, 1)
		assert.equal(posts, mine === 0 ? 1 : 0)
		assert.equal(store.workflow(w.id)!.state, mine === 0 ? 'open' : 'running')
	}
})

test('engine review A19: part asks and stale job reports cannot replace the home outcome', () => {
	const store = setup(), home = approval(store, { state: 'open', pending: [] })
	home.work!.plan = [{ id: 'p1', what: 'Keep the original approval obligation', who: 'me' }]
	const part = item(store, 'A2', 'Dev', 'Partner', { partOf: home.id, pending: ['201'], msgIds: ['201'] })
	home.work!.parts = [part.id]; store.save(home)
	applyReport(part, { workflowId: part.id, intent: 'status_next_step', state: 'needs_human', summary: 'Partner plan', question: 'Which ring?', work: { changedAsk: '201', goal: 'Validate the patch', doneWhen: 'Tests pass', step: 'Partner asked about testing', plan: [{ what: 'Run partner tests', who: 'them' }] } }, home)
	assert.equal(home.work!.goal, 'Approve PR 4300101')
	assert.equal(home.work!.doneWhen, 'The vote is recorded and the reply is sent')
	assert.ok(home.work!.steps.some(s => s.what.includes('Partner asked about testing')))
	store.save(home); store.save(part)
	const job: Job = { schema: 1, id: 'job1', key: 'pr:acme/widget/4300101', goal: 'Old request', state: 'running', purpose: 'work', session: home.session, parents: [part.id], asks: [], createdAt: at, updatedAt: at }
	part.job = job.id; store.save(part); store.saveJob(job)
	finishWork(store, job, { workflowId: job.id, intent: 'pr_review', state: 'needs_human', summary: 'Stale plan', question: 'Which ring?', work: { changedAsk: '201', goal: 'Only test now', doneWhen: 'Tests pass', step: 'Job read the partner plan', plan: [{ what: 'Read partner results', who: 'me' }] } }, 0)
	assert.equal(store.workflow(home.id)!.work!.goal, 'Approve PR 4300101')
	assert.ok(store.workflow(home.id)!.work!.steps.some(s => s.what.includes('Job read the partner plan')))
	assert.deepEqual(store.workflow(home.id)!.work!.plan!.map(p => p.what), ['Keep the original approval obligation', 'Run partner tests', 'Read partner results'])
})

test('engine review F2: terminal reports retain newer asks and failed or unknown changes', () => {
	for (const reportClosed of [false, true]) for (const kind of ['new-ask', 'failed', 'unknown', 'part-ask', 'part-unknown']) {
		const store = setup(), w = approval(store, { state: 'waiting_on_task', job: 'job1', pending: [] })
		if (kind === 'new-ask') w.pending = ['202']
		if (kind === 'failed' || kind === 'unknown') w.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300101', summary: 'Approve', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300101, vote: 10 } }, ...(kind === 'failed' ? { error: 'Not made' } : { maybe: true }) }]
		if (kind === 'part-ask') {
			const p = item(store, 'A2', 'Dev', 'Partner', { partOf: w.id, pending: ['203'], question: 'Do we need a rollback?' })
			w.work!.parts = [p.id]
		}
		if (kind === 'part-unknown') {
			const p = item(store, 'A2', 'Dev', 'Partner', { state: 'open', partOf: w.id, pending: [], draft: undefined, question: undefined, effects: [{ system: 'ado', action: 'comment', target: 'PR 4300101', summary: 'Comment', maybe: true }] })
			w.work!.parts = [p.id]
		}
		store.save(w)
		const job: Job = { schema: 1, id: 'job1', key: 'pr:acme/widget/4300101', goal: w.lastAsk!, state: 'running', purpose: 'work', session: w.session, parents: [w.id], asks: [], createdAt: at, updatedAt: at }
		store.saveJob(job)
		finishWork(store, job, { workflowId: job.id, intent: 'pr_review', state: 'done', summary: 'Nothing needed', work: reportClosed ? { closed: 'Approval task finished' } : undefined }, 0)
		const got = store.workflow(w.id)!
		assert.ok(!got.work!.closed, kind)
		assert.notEqual(got.state, 'done', kind)
		if (kind === 'new-ask') {
			assert.deepEqual(got.pending, ['202'])
			assert.equal(got.state, 'running')
		}
		if (kind === 'failed' || kind === 'unknown') {
			assert.equal(got.effects?.length, 1, kind)
			assert.equal(got.state, 'needs_human', kind)
		}
	}
})

test('engine review F5/F8: backlog candidates persist past the cursor and direct asks run first', async () => {
	const store = setup(), chat = { id: 'review-room', name: 'Review room', group: true, test: false }
	store.saveConfig({ ...store.config(), dailyRuns: 1 })
	const cursors: Record<string, string> = {}
	for (const id of ['401', '402', '403']) {
		await intake(store, new ReplaySource(chat.id, [], { id, at, from: { id: 'kim', name: 'Kim' }, html: false, body: `Widget deployment update ${id}` }), store.config(), cursors, [chat], { backlog: { turns: {} } })
	}
	assert.equal(cursors[chat.id], '403')
	assert.equal(store.workflows().length, 3)
	assert.ok(store.workflows().every(w => w.before && w.paced && w.startedBy === 'room'))
	await intake(store, new ReplaySource(chat.id, [], { id: '404', at, from: { id: 'dev', name: 'Dev' }, html: false, body: 'Robin, which ring should I use?' }), store.config(), cursors, [chat])
	const ran: string[] = [], src = new ReplaySource(chat.id, [], { id: '405', at, from: null, html: false, body: '' })
	const run: Parameters<typeof dispatch>[3] = async (_, input) => {
		const w = store.workflow(input.workflowId)!
		ran.push(w.lastMsgId)
		store.writeReport({ workflowId: w.id, intent: 'none', state: 'done', summary: 'No action' }, input.runId)
		return { exitCode: 0, ms: 1 }
	}
	await dispatch(store, src, store.config(), run)
	assert.deepEqual(ran, ['404'])
	assert.equal(store.workflows().filter(w => w.paced && w.state === 'running').length, 3)
	const deferred = store.logs(1).filter(l => l.event === 'intake-skip' && l.reason === 'budget-deferred')
	assert.equal(deferred.length, 3)
	await dispatch(store, src, store.config(), run)
	assert.equal(store.logs(1).filter(l => l.event === 'intake-skip' && l.reason === 'budget-deferred').length, 3, 'one audit per deferral, not every tick')
	store.saveConfig({ ...store.config(), dailyRuns: 20 })
	await dispatch(store, src, store.config(), run)
	await dispatch(store, src, store.config(), run)
	assert.deepEqual(new Set(ran), new Set(['401', '402', '403', '404']), 'judgment does not need the old messages to be fetched again')
	assert.ok(store.workflows().every(w => !w.paced && !w.intakeDeferred), 'a completed judgment clears its pacing and deferral marks')
})

test('engine review skip audit: each skip has a fixed private reason and identifiers only', async () => {
	const store = setup(), chat = { id: 'review-room', name: 'Private room name', group: true, test: false }
	const cfg = store.config(), cursors = {}
	const receive = (id: string, from: { id: string; name: string } | null, body: string) => intake(store, new ReplaySource(chat.id, [], { id, at, from, html: false, body }), cfg, cursors, [chat])
	await receive('501', null, 'sensitive system payload')
	await receive('502', cfg.owner, 'private owner context')
	await receive('503', { id: 'kim', name: 'Private person' }, 'Robin, private question')
	await receive('503', { id: 'kim', name: 'Private person' }, 'Robin, private question')
	const audits = store.logs(1).filter(l => l.event === 'intake-skip')
	assert.deepEqual(new Set(audits.map(l => l.reason)), new Set(['prefilter', 'context-absorbed', 'dedupe']))
	for (const entry of audits) {
		assert.ok(Object.keys(entry).every(k => ['at', 'event', 'reason', 'chat', 'msgId', 'workflowId', 'outcome'].includes(k)))
		assert.ok(!/private|sensitive|payload/i.test(JSON.stringify(entry)))
		assert.ok(entry.msgId && entry.chat && entry.outcome)
	}
})

test('engine review evals: relevant FYIs are distinct from noise in measured outcomes', () => {
	const store = setup(), w = approval(store, { work: undefined })
	applyReport(w, { workflowId: w.id, intent: 'none', state: 'done', summary: 'Deployment news', fyi: { line: 'Kim shared widget deployment progress.', weight: 'normal' } })
	assert.equal(outcomeOf(w), 'fyi')
	applyReport(w, { workflowId: w.id, intent: 'none', state: 'done', summary: 'Thanks only' })
	assert.equal(outcomeOf(w), 'ignore')
})

test('engine review F5: owner commitment candidates beyond two also persist for paced judgment', async () => {
	const store = setup(), chats = ['room-a', 'room-b', 'room-c'].map(id => ({ id, name: 'Widget room', group: true, test: false }))
	const src = new ReplaySource('none', [], { id: '601', at, from: store.config().owner, html: false, body: '' })
	src.newMessages = async chatId => ({ msgs: [{ id: '601', at, from: store.config().owner, html: false, body: `I will investigate the widget rollout in ${chatId}` }], newest: '601', truncated: false })
	await intake(store, src, store.config(), {}, chats)
	assert.equal(store.workflows().length, 3)
	assert.ok(store.workflows().every(w => w.startedBy === 'owner' && w.paced))
})

test('engine review skip audit: direct asks held by the daily cap record their budget deferral too', async () => {
	const store = setup(), w = approval(store, { state: 'running', work: undefined, pending: ['101'], lastAsk: 'Which ring?', draft: undefined })
	store.saveConfig({ ...store.config(), dailyRuns: 1 }); store.addRun()
	await dispatch(store, new ReplaySource(w.chat.id, [], { id: '102', at, from: null, html: false, body: '' }), store.config(), async () => { throw new Error('Budget must prevent this run') })
	assert.equal(store.workflow(w.id)!.state, 'running')
	const entry = store.logs(1).find(l => l.event === 'intake-skip' && l.reason === 'budget-deferred')
	assert.equal(entry?.workflowId, w.id)
	assert.equal(entry?.msgId, '101')
})

test('engine review F5: a replayed unaddressed group candidate is deduplicated before independent routing', async () => {
	const store = setup(), chat = { id: 'widget-room', name: 'Widget room', group: true, test: false }
	const replay = () => new ReplaySource(chat.id, [], { id: '701', at, from: { id: 'kim', name: 'Kim' }, html: false, body: 'Widget deployment is ready.' })
	await intake(store, replay(), store.config(), {}, [chat])
	await intake(store, replay(), store.config(), {}, [chat])
	assert.equal(store.workflows().length, 1)
	assert.ok(store.logs(1).some(e => e.event === 'intake-skip' && e.reason === 'dedupe' && e.msgId === '701'))
})

test('engine review F5: paced direct backlog asks precede older room candidates', async () => {
	const store = setup(), chat = { id: 'widget-room', name: 'Widget room', group: true, test: false }
	store.saveConfig({ ...store.config(), maxParallel: 1 })
	for (const [id, body] of [['801', 'Widget news'], ['802', 'Robin, please review the widget plan']]) {
		await intake(store, new ReplaySource(chat.id, [], { id, at, from: { id, name: id === '801' ? 'Kim' : 'Dev' }, html: false, body }), store.config(), {}, [chat], { backlog: { turns: {} } })
	}
	const ran: string[] = []
	await dispatch(store, new ReplaySource(chat.id, [], { id: '803', at, from: null, html: false, body: '' }), store.config(), async (_, input) => {
		ran.push(store.workflow(input.workflowId)!.lastMsgId)
		store.writeReport({ workflowId: input.workflowId, intent: 'none', state: 'done', summary: 'No action' }, input.runId)
		return { exitCode: 0, ms: 1 }
	})
	assert.deepEqual(ran, ['802'])
})

test('engine review F3: assembled Classic and New rows share one home across every home and part state', () => {
	const states: State[] = ['running', 'needs_human', 'waiting_on_task', 'waiting_on_sender', 'scheduled', 'open', 'done']
	for (const state of states) for (const partState of states) {
		if (state === 'done' && partState === 'done') continue
		const store = setup(), home = approval(store, { state, status: 'Nothing needed', pending: [], work: work('Get a partner fix') })
		const part = item(store, 'A2', 'Dev', 'Partner', { state: partState, partOf: home.id })
		home.work!.parts = [part.id]; store.save(home)
		const classic = view(store, undefined), snap = snapshot(store), placed = place(snap), rows = rowsOf(snap, placed)
		const classicRows = [...classic.needs, ...classic.progress, ...classic.running, ...classic.watching]
		assert.equal(classicRows.filter(r => [home.code, part.code].includes(r.code)).length, 1, `Classic ${state}/${partState}`)
		assert.equal(rows.filter(r => r.code === home.code).length, 1, `New ${state}/${partState}`)
		assert.ok(!store.workflow(home.id)!.work!.closed, 'status words are not closure evidence')
	}
})

test('engine review F2: a closing report retains work and its watch until the reply is persisted', async () => {
	for (const pendingPart of [false, true]) {
		const store = setup(), w = approval(store, { state: 'waiting_on_task', job: 'job1', pending: [], lastAsk: 'Finish the widget release.', work: work('Ship the widget release') })
		const job: Job = { schema: 1, id: 'job1', key: 'release:widget', goal: w.lastAsk!, state: 'running', purpose: 'work', session: w.session, parents: [w.id], asks: [], createdAt: at, updatedAt: at }
		w.work!.watch = 'watch1'
		if (pendingPart) {
			const part = item(store, 'A2', 'Dev', 'Partner', { partOf: w.id, pending: ['201'], question: 'What about rollback?' })
			w.work!.parts = [part.id]
		}
		store.save(w); store.saveJob(job); store.saveJob({ ...job, id: 'watch1', every: 60, state: 'done' })
		finishWork(store, job, { workflowId: job.id, intent: 'status_next_step', state: 'needs_human', summary: 'Release finished', work: { closed: 'Released and reported' }, reply: { text: 'Released.', commitment: false, sources: [] } }, 0)
		let got = store.workflow(w.id)!
		assert.ok(!got.work!.closed, 'a reply still owed is not a completed family')
		assert.equal(store.job('watch1')!.every, 60)
		const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
		src.send = async () => { throw new Error('Send failed') }
		await assert.rejects(send(store, src, store.config(), got, got.draft!.text, {}), /Send failed/)
		assert.ok(!store.workflow(w.id)!.work!.closed)
		assert.equal(store.job('watch1')!.every, 60)
		got = store.workflow(w.id)!
		src.send = async () => ({ msgId: '102' })
		await send(store, src, store.config(), got, got.draft!.text, {})
		assert.equal(store.workflow(w.id)!.sent?.msgId, '102')
		assert.equal(!!store.workflow(w.id)!.work!.closed, !pendingPart)
		assert.equal(store.job('watch1')!.every, pendingPart ? 60 : undefined)
	}
})

test('engine review F2: a crash during family closure cannot lose the persisted send receipt', async () => {
	const store = setup(), w = approval(store, { pending: [] })
	w.effects = [{ system: 'ado', action: 'approve', target: 'PR 4300101', summary: 'Approve', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4300101, vote: 10 } }, done: { at } }]
	const part = item(store, 'A2', 'Dev', 'Partner', { state: 'open', partOf: w.id, pending: [], draft: undefined, question: undefined })
	w.work!.parts = [part.id]; store.save(w)
	const save = store.save.bind(store)
	store.save = (wf, ...args) => { if (wf.id === part.id) throw new Error('Closure interrupted'); return save(wf, ...args) }
	const src = new ReplaySource(w.chat.id, [], { id: '101', at, from: w.asker!, html: false, body: w.lastAsk! })
	src.send = async () => ({ msgId: '102' })
	await assert.rejects(send(store, src, store.config(), w, 'Approved.', {}, approved), /Closure interrupted/)
	assert.equal(store.workflow(w.id)!.sent?.msgId, '102')
	store.save = save
	const { settleCompleted } = await import('../src/runner/jobs.ts')
	settleCompleted(store)
	assert.equal(store.workflow(w.id)!.state, 'done')
	assert.equal(store.workflow(part.id)!.state, 'done')
	for (const mark of [{ maybe: true as const }, { error: 'Unverified' }]) {
		const other = setup(), held = approval(other, { state: 'needs_human', pending: [], sent: { msgId: '102', text: 'Approved.', at } })
		held.effects = [{ ...w.effects![0], done: undefined, ...mark }]
		other.save(held)
		settleCompleted(other)
		assert.equal(other.workflow(held.id)!.state, 'needs_human')
		assert.ok(!other.workflow(held.id)!.work!.closed)
	}
})

test('engine review F2: a persisted broader completion reply can finish recovery without reopening its watch', async () => {
	const store = setup(), w = approval(store, { state: 'scheduled', pending: [], work: work('Ship the widget release'), closeWorkAfterSend: 'Released and reported', sent: { msgId: '102', text: 'Released.', at }, effects: [] })
	const { settleCompleted } = await import('../src/runner/jobs.ts')
	settleCompleted(store)
	assert.equal(store.workflow(w.id)!.state, 'done')
	assert.equal(store.workflow(w.id)!.work!.closed?.why, 'Released and reported')
})

test('engine review F2: deferred report closure requires verified changes and never carries into a new turn', async () => {
	for (const mark of [{ maybe: true as const }, { error: 'Unverified' }, { off: true }]) {
		const store = setup(), w = approval(store, { pending: [], lastAsk: 'Finish the widget release.', work: work('Ship the widget release') })
		applyReport(w, { workflowId: w.id, intent: 'status_next_step', state: 'needs_human', summary: 'Finished', work: { closed: 'Released and reported' }, reply: { text: 'Released.', commitment: false, sources: [] } })
		assert.ok(!w.work!.closed)
		w.effects = [{ system: 'ado', action: 'comment', target: 'Release', summary: 'Post release result', ...mark }]
		w.sent = { msgId: '102', text: 'Released.', at }
		afterSend(w, 'Released.', '102')
		assert.ok(!w.work!.closed)
		w.closeWorkAfterSend = 'Old outcome'
		const { newTurn } = await import('../src/runner/work.ts')
		newTurn(w)
		assert.equal(w.closeWorkAfterSend, undefined)
	}
})

test('engine review evals: blind inputs hide expectations and scoring checks both classification and facts', async () => {
	const { prepareFictional, scoreFictional } = await import('../scripts/eval-fictional.ts')
	const { writeJson } = await import('../src/store/fs.ts')
	const cases = [
		{ id: 'positive', text: 'The widget is in BLUE.', expect: { accept: ['fyi' as const], facts: ['unseen-expectation-marker'] } },
		{ id: 'negative', text: 'Thanks!', expect: { accept: ['ignore' as const] } },
	]
	const root = await prepareFictional(cases)
	assert.ok(!readFileSync(join(root, 'inputs.json'), 'utf8').includes('unseen-expectation-marker'))
	const reports = cases.map(c => {
		const store = new Store({ root: join(root, c.id), machine: 'eval' })
		return { id: c.id, report: { workflowId: store.workflows()[0].id, intent: 'none', state: 'done', summary: 'News', fyi: { line: 'Widget update', weight: 'normal' } } }
	})
	writeJson(join(root, 'reports.json'), reports, 'eval')
	const scored = await scoreFictional(cases, root)
	assert.ok(scored.every(r => !r.pass), 'a correct category without its facts, and a false-positive FYI, both fail')
	assert.ok(new Store({ root: join(root, 'positive'), machine: 'eval' }).logs(1).some(e => e.event === 'intake-skip' && e.reason === 'ai-fyi'))
	writeJson(join(root, 'reports.json'), [reports[0], reports[0]], 'eval')
	await assert.rejects(scoreFictional(cases, root), /each case exactly once/)
	writeJson(join(root, 'reports.json'), [{ ...reports[0], report: { ...reports[0].report, workflowId: 'wrong-item' } }, reports[1]], 'eval')
	await assert.rejects(scoreFictional(cases, root), /Wrong workflow/)
	await assert.rejects(prepareFictional([{ ...cases[0], id: '../escape' }]), /Invalid fictional case id/)
})
