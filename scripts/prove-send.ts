// Fictional-root dispatch/apply journey proof; deliberately not part of the unit-test suite.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config, Workflow, Report } from '../src/core/types.ts'
import type { Source } from '../src/adapters/source.ts'
import type { RawMsg } from '../src/core/intake.ts'

const root = mkdtempSync(join(tmpdir(), 'delegate-send-proof-'))
for (const name of ['local', 'copilot', 'config', 'cache', 'data']) mkdirSync(join(root, name))
Object.assign(process.env, {
	DELEGATE_LOCAL: join(root, 'local'), DELEGATE_ROOT: join(root, 'fictional'),
	COPILOT_HOME: join(root, 'copilot'), XDG_CONFIG_HOME: join(root, 'config'),
	XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'),
})
const { Store } = await import('../src/store/state.ts')
const { applyAnswers, send } = await import('../src/runner/apply.ts')
const { dispatch, applyReport } = await import('../src/runner/dispatch.ts')
const { toRaw } = await import('../src/adapters/source-teams.ts')
const { intake, recordOwnerReply } = await import('../src/runner/intake.ts')
const { changesJob, executeDirect, attachJob, startJobs, finishWork } = await import('../src/runner/jobs.ts')
const { newTurn } = await import('../src/runner/work.ts')
const { afterDraft, dueSends } = await import('../src/runner/autosend.ts')
const { setRules } = await import('../src/runner/habits.ts')
const { card } = await import('../src/web/view.ts')
const { workflowApprovalRev } = await import('../src/core/page-approval.ts')
const store = new Store({ root: join(root, 'fictional'), machine: 'fictional' })
const cfg: Config = {
	schema: 1,
	owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' }, watch: [],
	agent: { flavor: 'copilot', command: ['fictional-worker-never-launched'], tools: [], host: false },
	maxParallel: 3, nudgeEveryMin: 10, dailyRuns: 100,
}
store.saveConfig(cfg)
let live: RawMsg[] = [], posted: string[] = [], sequence = 0, drafted = 0
let onSend: (() => void) | undefined
const source: Source = {
	selfChatId: 'self', recent: async () => live,
	around: async (_chat, id) => ({ msg: live.find(m => m.id === id), after: live.filter(m => BigInt(m.id) > BigInt(id)) }),
	newMessages: async (_chat, id) => ({ msgs: live.filter(m => !id || BigInt(m.id) > BigInt(id)), truncated: false }),
	recentChats: async () => [], send: async (_chat, text) => { onSend?.(); posted.push(text); return { msgId: String(90000 + posted.length) } },
	sendSelf: async () => ({ msgId: '99000' }), presence: async () => ({ availability: 'Available' }),
	deleteMessage: async () => {}, editMessage: async () => {}, close: async () => {},
}
const at = '2026-10-24T07:00:00.000Z', later = '2026-10-24T07:01:00.000Z'
const draft = 'The Aurora incident is mitigated. Monitoring continues.'
function seed(ask = 'Robin, what is the Aurora incident status?', modified?: string) {
	const id = String(++sequence * 100)
	const w: Workflow = {
		schema: 1, id: `fictional-${sequence}`, code: `A${1000 + sequence}`, kind: 'reply', state: 'running',
		key: { type: 'thread', id }, chat: { id: `chat-${sequence}`, name: 'Acme status', test: false, group: true },
		asker: { id: 'kim', name: 'Kim' }, session: { agent: 'copilot', id: `fictional-session-${sequence}` },
		lastMsgId: id, msgIds: [id], pending: [id], lastAsk: ask, status: 'Drafting', newCount: 0, createdAt: at, updatedAt: at,
	}
	live = [{ id, at, editedAt: modified, from: w.asker!, html: false, body: ask }]
	store.save(w)
	store.saveThread(w.id, [{ id, at, editedAt: modified, from: w.asker!, text: ask, byOwner: false }])
	return w
}
async function draftThroughDispatch(w: Workflow) {
	await dispatch(store, source, cfg, async (_agent, input) => {
		drafted++
		store.writeReport({ workflowId: input.workflowId, intent: 'other', state: 'needs_human', reply: { text: draft, commitment: false, sources: [] }, summary: 'Ready' }, input.runId)
		return { exitCode: 0, ms: 1 }
	})
	const result = store.workflow(w.id)!
	assert.equal(result.draft?.text, draft)
	return result
}
async function approve(w: Workflow, text?: string, page = false) {
	store.writeAnswer({ code: w.code, verb: text ? 'answer' : 'ok', text, surface: 'panel',
		...(page ? { page: { kind: 'send-reply' as const, expect: workflowApprovalRev(w) } } : {}) })
	await applyAnswers(store, source, cfg, undefined, false, undefined, async () => ({ stillAnswers: 'no', changed: 'The requested reply changed.' }))
	return store.workflow(w.id)!
}
let proofCount = 0
function proof(label: string) { proofCount++; console.log(`PASS ${label}`) }
try {
	live = [toRaw({ id: '50', createdDateTime: at, lastEditedDateTime: later, from: { id: 'kim', displayName: 'Kim' },
		body: { contentType: 'html', content: 'Robin, status of <a href="https://acme.example/aurora">Aurora</a>?' } })]
	await intake(store, source, cfg, {}, [{ id: 'chat-intake', name: 'Acme intake', group: true, test: false }])
	const ingested = store.workflows().find(w => w.lastMsgId === '50')!
	assert.ok(ingested)
	assert.equal(store.thread(ingested.id)[0].editedAt, later)
	assert.ok(store.thread(ingested.id)[0].contentKey)
	ingested.state = 'done'; store.save(ingested)
	proof('real Teams toRaw and intake persist author-edit timestamp and shared content key')

	let w = await draftThroughDispatch(seed('Robin, status of <not markup> Aurora: Status page', undefined))
	live[0] = toRaw({ id: w.lastMsgId, createdDateTime: at, lastModifiedDateTime: at, from: { id: 'kim', displayName: 'Kim' },
		body: { contentType: 'html', content: 'Robin, status of &lt;not markup&gt; Aurora: <a href="https://acme.example/status">Status page</a>' } })
	const sent = posted.length, runs = drafted, askBefore = w.lastAsk, revBefore = w.revAt, pendingBefore = [...w.pending], approvalBefore = workflowApprovalRev(w)
	onSend = () => assert.equal(workflowApprovalRev(store.workflow(w.id)!), approvalBefore)
	w = await approve(w, undefined, true)
	onSend = undefined
	assert.equal(posted.length, sent + 1); assert.equal(drafted, runs)
	assert.equal(w.lastAsk, askBefore); assert.equal(w.revAt, revBefore); assert.deepEqual(w.pending, pendingBefore)
	assert.ok(store.logs().some(e => e.event === 'edit-ignored' && e.code === w.code))
	assert.match(store.thread(w.id)[0].text, /https:\/\/acme.example/)
	assert.ok(approvalBefore)
	proof('stored titled link sends first try through page expect; no model/redraft; lastAsk/revAt/pending unchanged')

	w = await draftThroughDispatch(seed())
	live[0] = toRaw({ id: w.lastMsgId, createdDateTime: at, lastModifiedDateTime: later, lastEditedDateTime: null,
		from: { id: 'kim', displayName: 'Kim' }, body: { contentType: 'text', content: w.lastAsk! } })
	w = await approve(w); assert.ok(w.sent)
	proof('reaction-only modified timestamp with null edited timestamp sends')

	w = await draftThroughDispatch(seed(undefined, at))
	live[0].body = 'Robin, what is the Aurora incident STATUS?!'; live[0].editedAt = later
	w = await approve(w)
	assert.ok(w.sent)
	// A real typo (not just formatting) exercises the two-changed-word rule.
	w = await draftThroughDispatch(seed('Robin, what is the Aurora incidnet status?', at))
	live[0].body = 'Robin, what is the Aurora incident status?'; live[0].editedAt = later
	w = await approve(w); assert.ok(w.sent)
	assert.ok(store.logs().some(e => e.event === 'edit-ignored' && e.code === w.code && e.reason === 'cosmetic'))
	proof('real cosmetic Teams edit sends with zero checks')

	w = await draftThroughDispatch(seed('Robin, send the Aurora status on Friday.', at))
	const oldAsk = w.lastAsk
	live[0].body = 'Robin, send the Aurora status on Monday.'; live[0].editedAt = later
	w = await approve(w)
	assert.equal(w.state, 'needs_human'); assert.equal(w.draft?.text, draft); assert.equal(w.reason?.kind, 'ask-edited')
	assert.ok(w.reason?.kind === 'ask-edited'); assert.equal(w.reason.before, oldAsk)
	assert.equal(w.reason.text, live[0].body)
	assert.equal(card(store, w).reason?.kind, 'ask-edited')
	assert.equal(w.sent, undefined)
	const heldDigest = w.reason.digest
	live[0].body = 'Robin, send the Aurora status on Tuesday.'; live[0].editedAt = '2026-10-24T07:02:00.000Z'
	const beforeNewEdit = posted.length
	w = await approve(w, 'send anyway', true)
	assert.equal(posted.length, beforeNewEdit); assert.equal(w.reason?.kind, 'ask-edited'); assert.notEqual(w.reason?.digest, heldDigest)
	w = await approve(w, 'send anyway')
	assert.ok(w.sent); proof('changed meaning keeps draft and diff; explicit Send anyway sends once')

	w = await draftThroughDispatch(seed('Robin, please send the Aurora status.', at))
	live[0].body = 'Robin, kindly post the Aurora status.'; live[0].editedAt = later
	w = await approve(w); assert.ok(w.sent)
	assert.ok(store.logs().some(e => e.event === 'edit-ignored' && e.code === w.code && e.reason === 'cosmetic'))
	proof('two changed non-date, non-digit, non-negation words send without a model')

	for (const [before, after] of [
		['Robin, use 10 workers.', 'Robin, use 20 workers.'],
		['Robin, send the update.', 'Robin, do not send the update.'],
		['Robin, send on Friday.', 'Robin, send on Monday.'],
	]) {
		w = await draftThroughDispatch(seed(before))
		live[0].body = after
		w = await approve(w); assert.equal(w.sent, undefined); assert.equal(w.reason?.kind, 'ask-edited')
		w = await approve(w, 'redraft')
		assert.equal(w.state, 'running'); assert.equal(w.reason, undefined); assert.equal(w.ownerSend, undefined); assert.equal(w.lastAsk, after)
		w.state = 'done'; store.save(w)
	}
	proof('digit/date/negation changes hold without edit metadata; Redraft is explicit and uses changed words')

	w = await draftThroughDispatch(seed(undefined, at))
	live.push({ id: String(Number(w.lastMsgId) + 1), at: later, from: w.asker!, body: 'Lunch is in the garden today.', html: false })
	w = await approve(w); assert.ok(w.sent)
	proof('unrelated new message by asker does not block owner Send')

	w = await draftThroughDispatch(seed(undefined, at))
	const other = { ...w, id: 'fictional-other', code: 'A900', draft: undefined, ownerSend: undefined,
		lastMsgId: String(Number(w.lastMsgId) + 1), msgIds: [String(Number(w.lastMsgId) + 1)], pending: [], state: 'needs_human' as const }
	store.save(other)
	live.push({ id: other.lastMsgId, at: later, from: w.asker!, body: 'Robin, check the Borealis release please.', html: false })
	w = await approve(w); assert.ok(w.sent)
	other.state = 'needs_human'; store.save(other)
	proof('new ask already claimed by another open item does not block owner Send')

	w = await draftThroughDispatch(seed(undefined, at))
	live.push({ id: String(Number(w.lastMsgId) + 1), at: later, from: w.asker!, body: 'Robin, is Aurora still dropping requests?', html: false })
	w = await approve(w)
	assert.equal(w.sent, undefined); assert.equal(w.state, 'needs_human')
	assert.equal(w.draft?.text, draft); assert.ok(w.reason?.kind === 'asker-wrote-again'); assert.equal(w.reason.text, live[1].body)
	proof('related follow-up keeps approved draft and exposes the exact new message')
	const heldCount = posted.length
	w = await approve(w)
	assert.equal(posted.length, heldCount); assert.equal(w.reason?.kind, 'asker-wrote-again')
	proof('ordinary repeated Send cannot bypass held-message confirmation')

	// Real dispatcher applies a no-reply report after an earlier approval; no automatic send or loss.
	w.state = 'running'; w.pending = [w.lastMsgId]; store.save(w)
	await dispatch(store, source, cfg, async (_agent, input) => {
		const report: Report = { workflowId: input.workflowId, intent: 'none', state: 'done', summary: 'No reply is needed now.' }
		store.writeReport(report, input.runId)
		return { exitCode: 0, ms: 1 }
	})
	w = store.workflow(w.id)!
	assert.equal(w.state, 'needs_human'); assert.equal(w.draft?.text, draft); assert.equal(w.reason?.kind, 'no-reply-needed')
	assert.match(w.status, /thinks no reply is needed/)
	proof('real no-reply rerun retains approved draft, with reason and Send anyway/Skip data')
	live = live.slice(0, 1)
	w = await approve(w, 'send anyway'); assert.ok(w.sent)

	w = await draftThroughDispatch(seed(undefined, at))
	live.push({ id: String(Number(w.lastMsgId) + 1), at: later, from: w.asker!, body: 'Robin, is Aurora recovered?', html: false })
	assert.equal(await send(store, source, cfg, w, draft, { ruleId: 'R1' }), false)
	assert.equal(w.state, 'running')
	proof('automatic sends retain the strict newest-message gate')
	w.state = 'done'; store.save(w)

	w = await draftThroughDispatch(seed('Robin, send the Aurora status Friday.', at))
	live[0].body = 'Robin, send the Aurora status Monday.'; live[0].editedAt = later
	assert.equal(await send(store, source, cfg, w, draft, { ruleId: 'R1' }), false)
	assert.equal(w.state, 'running'); assert.equal(w.draft?.text, draft)
	proof('automatic sends retain the strict meaning-edit hold and rerun')
	w.state = 'done'; store.save(w)

	w = await draftThroughDispatch(seed(undefined, at))
	store.writeAnswer({ code: w.code, verb: 'ok', surface: 'panel', page: { kind: 'send-reply', expect: workflowApprovalRev(w) } })
	w.lastAsk = 'Robin, this is a different version.'; store.save(w)
	const beforeStale = posted.length
	await applyAnswers(store, source, cfg)
	assert.equal(posted.length, beforeStale)
	assert.ok(store.logs().some(e => e.event === 'page-answer-refused' && e.code === w.code))
	assert.equal(store.workflow(w.id)?.ownerSend, undefined)
	proof('stale page expect is refused before the send path')

	w = await draftThroughDispatch(seed(undefined, at))
	cfg.agent.effectTools = ['acme-comment']
	cfg.agent.mcpServers = { acme: { command: 'fictional-server-never-launched' } }
	store.saveConfig(cfg)
	w.effects = [{ system: 'acme', action: 'comment', target: 'Aurora', summary: 'Post incident status', call: { tool: 'acme-comment', args: {} } }]
	changesJob(store, cfg, w, w.effects)
	store.save(w)
	live.push({ id: String(Number(w.lastMsgId) + 1), at: later, from: w.asker!, body: 'Robin, is Aurora still dropping requests?', html: false })
	w = await approve(w)
	assert.equal(w.reason?.kind, 'asker-wrote-again'); assert.equal(w.draft?.text, draft); assert.equal(w.effects?.[0].done, undefined)
	proof('send-with-changes checks newer asks before any effect, keeping draft and proposal')
	w = await approve(w, 'send anyway')
	assert.equal(w.state, 'waiting_on_task'); assert.equal(w.approved?.sendReview, w.holdDigest)
	let writes = 0
	const beforeEffects = posted.length
	await executeDirect(store, source, cfg, {
		start: () => { throw new Error('Direct changes must not launch a worker') }, alive: () => false, kill: () => false,
		openWindow: () => { throw new Error('Proof must not open a window') },
	}, undefined, async () => { writes++; return { id: 'fictional-comment' } })
	w = store.workflow(w.id)!
	assert.equal(writes, 1); assert.equal(posted.length, beforeEffects + 1); assert.ok(w.sent); assert.equal(w.reason, undefined)
	proof('Send anyway confirmation survives real effect execution and sends the kept reply once')

	w = await draftThroughDispatch(seed(undefined, at))
	const legacy = new Store({ root: join(root, 'legacy'), machine: 'fictional' })
	legacy.saveConfig(cfg)
	legacy.saveUpgrades({ 'fictional-earlier-upgrade': at })
	const time = Date.now() - 1000, stamp = (offset: number) => new Date(time + offset).toISOString()
	legacy.writeReport({ workflowId: w.id, intent: 'other', state: 'needs_human', summary: 'Ready', reply: w.draft }, 'legacy-draft')
	legacy.archiveReport(w.id, 'legacy-draft')
	legacy.log({ event: 'worker', workflowId: w.id, code: w.code, runId: 'legacy-draft', at: stamp(-1) })
	legacy.log({ event: 'answer', workflowId: w.id, code: w.code, verb: 'ok', at: stamp(0) })
	legacy.log({ event: 'state', workflowId: w.id, code: w.code, to: 'running', status: 'New messages arrived. Redrafting.', at: stamp(1) })
	legacy.writeReport({ workflowId: w.id, intent: 'other', state: 'done', summary: 'No reply is needed.' }, 'legacy-rerun')
	legacy.archiveReport(w.id, 'legacy-rerun')
	legacy.log({ event: 'worker', workflowId: w.id, code: w.code, runId: 'legacy-rerun', at: stamp(2) })
	w.draft = undefined; w.ownerSend = undefined; w.state = 'open'; w.status = 'No reply is needed.'; legacy.save(w)
	legacy.save({ ...w, id: 'fictional-unrestored', code: 'A9999' })
	let logScans = 0
	const legacyLogs = legacy.logs.bind(legacy)
	legacy.logs = (...args) => { logScans++; return legacyLogs(...args) }
	await dispatch(legacy, source, cfg, async () => { throw new Error('Restored draft must not run again') })
	w = legacy.workflow(w.id)!
	assert.equal(w.draft?.text, draft); assert.equal(w.state, 'needs_human'); assert.equal(w.reason?.kind, 'no-reply-needed')
	const restorations = () => legacyLogs().filter(e => e.event === 'draft-restored' && e.code === w.code).length
	assert.equal(restorations(), 1)
	assert.equal(logScans, 1)
	const reopened = new Store({ root: legacy.root, machine: 'fictional' })
	const reopenedLogs = reopened.logs.bind(reopened)
	reopened.logs = (...args) => { logScans++; return reopenedLogs(...args) }
	await dispatch(reopened, source, cfg, async () => { throw new Error('Restored draft must not run again') })
	assert.equal(restorations(), 1)
	proof('A36-shaped approved reply restored from archived report once; next dispatch does not repeat')
	assert.equal(logScans, 1)
	assert.ok(reopened.upgrades()['draft-restore-37'])
	assert.equal(reopened.upgrades()['fictional-earlier-upgrade'], at)
	assert.equal(reopened.workflow('fictional-unrestored')?.draft, undefined)
	proof('B3 persistent upgrade marker: second dispatch scans zero logs, even with an unrecoverable candidate')

	for (const approval of ['field', 'snapshot'] as const) {
		w = await draftThroughDispatch(seed(undefined, at))
		if (approval === 'field') w.approved = { at: new Date().toISOString(), text: draft, effects: '' }
		else w.ownerSend = { draft: structuredClone(w.draft!), at: new Date().toISOString(), askMsgId: w.lastMsgId }
		w.state = 'running'; store.save(w)
		await dispatch(store, source, cfg, async (_agent, input) => {
			store.writeReport({ workflowId: input.workflowId, intent: 'none', state: 'done', summary: 'No reply needed.' }, input.runId)
			return { exitCode: 0, ms: 1 }
		})
		w = store.workflow(w.id)!
		assert.equal(w.draft?.text, draft); assert.equal(w.reason?.kind, 'no-reply-needed'); assert.equal(w.state, 'needs_human')
		const count = posted.length
		assert.equal(await send(store, source, cfg, w, draft, { ruleId: 'R1' }), false)
		assert.equal(posted.length, count)
	}
	proof('legacy approved field and explicit Send snapshot both retain draft; a rule cannot bypass the hold')

	w = await draftThroughDispatch(seed(undefined, at))
	live.push({ id: String(Number(w.lastMsgId) + 1), at: later, from: w.asker!, body: 'Robin, is Aurora still dropping requests?', html: false })
	w = await approve(w); assert.ok(w.ownerSend)
	w.draft = undefined
	store.save(w)
	assert.equal(store.workflow(w.id)?.draft, undefined)
	recordOwnerReply(store, w, { id: String(Number(w.lastMsgId) + 2), at: later, from: cfg.owner, text: 'Kim, Aurora is mitigated.', byOwner: true }, true)
	w = store.workflow(w.id)!
	assert.equal(w.state, 'done'); assert.equal(w.closedBy, 'replied')
	assert.equal(w.draft, undefined); assert.equal(w.ownerSend, undefined); assert.equal(w.reason, undefined)
	proof('B1 saving is state-neutral; close after own Teams reply stays done and never resurrects the draft')

	w = await draftThroughDispatch(seed('Robin, please re-review the Aurora incident status.', at))
	w.ownerSend = { draft: structuredClone(w.draft!), at, askMsgId: w.lastMsgId }
	w.reason = { kind: 'no-reply-needed', why: 'Old result', digest: 'fictional-old-digest' }
	w.intent = 'pr_review'; w.pending = [w.lastMsgId]
	attachJob(store, cfg, w, { key: 'doc:aurora-recheck', goal: w.lastAsk! })
	store.save(w)
	assert.equal(w.ownerSend, undefined); assert.equal(w.reason, undefined)
	assert.equal(store.workflow(w.id)?.state, 'waiting_on_task')
	assert.equal(startJobs(store, cfg, { start: () => ({ pid: process.pid }), alive: () => false, kill: () => false,
		openWindow: () => { throw new Error('Proof must not open a window') } }), 1)
	assert.equal(store.job(w.job!)?.state, 'running')
	assert.equal(store.workflow(w.id)?.state, 'waiting_on_task')
	proof('B1 recheck newTurn clears approval and reason; a starting job stays waiting_on_task')

	const job = store.job(w.job!)!
	w.ownerSend = { draft: { text: draft, commitment: false, sources: [] }, at, askMsgId: w.lastMsgId }
	store.save(w)
	finishWork(store, job, { workflowId: job.id, intent: 'other', state: 'done', summary: 'No reply needed.' }, job.asks.length)
	w = store.workflow(w.id)!
	assert.equal(w.draft?.text, draft); assert.equal(w.reason?.kind, 'no-reply-needed'); assert.equal(w.state, 'needs_human')
	finishWork(store, job, { workflowId: job.id, intent: 'other', state: 'needs_human', summary: 'Updated', reply: { text: 'Aurora is healthy.', commitment: false, sources: [] } }, job.asks.length)
	w = store.workflow(w.id)!
	assert.equal(w.ownerSend, undefined); assert.equal(w.reason, undefined); assert.equal(w.draft?.text, 'Aurora is healthy.')
	for (const reply of [undefined, { text: 'Aurora is healthy.', commitment: false, sources: [] }]) {
		w.ownerSend = { draft: { text: draft, commitment: false, sources: [] }, at, askMsgId: w.lastMsgId }
		w.reason = { kind: 'no-reply-needed', why: 'Old result', digest: 'fictional-old-digest' }
		store.save(w)
		finishWork(store, job, { workflowId: job.id, intent: 'other', state: 'needs_human', summary: 'Waiting for details',
			goalMet: false, blocker: { kind: 'asker', why: 'Waiting for details', tried: [] }, reply }, job.asks.length)
		w = store.workflow(w.id)!
		assert.equal(w.state, 'needs_human')
		if (reply) {
			assert.equal(w.ownerSend, undefined); assert.equal(w.reason, undefined); assert.equal(w.draft?.holding, true)
		} else {
			assert.equal(w.draft?.text, draft); assert.equal(w.reason?.kind, 'no-reply-needed')
		}
	}
	w = await approve(w); assert.ok(w.sent)
	proof('normal and blocked job reports keep approved drafts explicitly; replacement replies clear stale reason and plain Send works')

	w = await draftThroughDispatch(seed(undefined, at))
	store.saveThread(w.id, store.thread(w.id).map(m => ({ ...m, at: new Date(Date.now() - 1000).toISOString() })))
	live.push({ id: String(Number(w.lastMsgId) + 1), at: new Date().toISOString(), from: w.asker!, body: 'Robin, what is the Aurora incident status at 09:00?', html: false })
	w = await approve(w); assert.equal(w.reason?.kind, 'asker-wrote-again')
	await intake(store, source, cfg, { [w.chat.id]: w.lastMsgId }, [w.chat])
	w = store.workflow(w.id)!
	assert.equal(w.state, 'running'); assert.equal(w.lastMsgId, live[1].id)
	await dispatch(store, source, cfg, async (_agent, input) => {
		store.writeReport({ workflowId: input.workflowId, intent: 'other', state: 'needs_human', summary: 'Updated',
			reply: { text: 'Aurora is healthy now.', commitment: false, sources: [] } }, input.runId)
		return { exitCode: 0, ms: 1 }
	})
	w = store.workflow(w.id)!
	assert.equal(w.reason, undefined); assert.equal(w.ownerSend, undefined); assert.equal(w.draft?.text, 'Aurora is healthy now.')
	const beforePlain = posted.length
	w = await approve(w); assert.ok(w.sent); assert.equal(posted.length, beforePlain + 1)
	proof('B2 held follow-up routes through intake and a new dispatch draft; plain Send sends exactly once')

	w = await draftThroughDispatch(seed(undefined, at))
	w.ownerSend = { draft: structuredClone(w.draft!), at, askMsgId: w.lastMsgId }
	w.reason = { kind: 'no-reply-needed', why: 'Old result', digest: 'fictional-old-digest' }
	w.approved = { at, text: draft, effects: '' }
	applyReport(w, { workflowId: w.id, intent: 'other', state: 'needs_human', summary: 'Updated',
		reply: { text: 'Aurora is healthy.', commitment: false, sources: [{ ref: 'fictional-card', tier: 'card', origin: 'extracted' }] } })
	// This directly applied fixture report reads no chats; the stub dispatch has no provenance log.
	w.shareHold = undefined
	assert.equal(w.reason, undefined); assert.equal(w.ownerSend, undefined); assert.equal(w.approved, undefined)
	for (const keepSent of [false, true]) {
		const turn: Workflow = { ...w, ownerSend: { draft: w.draft!, at, askMsgId: w.lastMsgId }, reason: { kind: 'no-reply-needed', why: 'Old', digest: 'old' } }
		newTurn(turn, keepSent)
		assert.equal(turn.ownerSend, undefined); assert.equal(turn.reason, undefined); assert.equal(turn.draft, undefined)
	}
	setRules(store, [{ id: 'R1', text: 'Reply to Kim', who: { accounts: [w.asker!] }, when: { chat: w.chat.id }, then: 'send' }])
	store.saveControl({ ...store.control(), autoSend: true })
	await afterDraft(store, source, cfg, w)
	assert.equal(w.state, 'scheduled', JSON.stringify(w.decision)); assert.equal(w.decision?.ruleId, 'R1')
	w.sendAt = new Date(0).toISOString(); store.save(w)
	const beforeAuto = posted.length
	assert.equal(await dueSends(store, source, cfg), 1)
	w = store.workflow(w.id)!
	assert.equal(w.sent?.byRule, 'R1'); assert.equal(posted.length, beforeAuto + 1)
	proof('B2 new report clears old approval/reason; a rule-covered replacement draft auto-sends')

	w = await draftThroughDispatch(seed(undefined, at))
	store.log({ event: 'answer', workflowId: w.id, code: w.code, verb: 'send' })
	w.state = 'running'; store.save(w)
	let runLogScans = 0
	const readLogs = store.logs.bind(store)
	store.logs = (...args) => { runLogScans++; return readLogs(...args) }
	await dispatch(store, source, cfg, async (_agent, input) => {
		store.writeReport({ workflowId: input.workflowId, intent: 'none', state: 'done', summary: 'No reply needed.' }, input.runId)
		return { exitCode: 0, ms: 1 }
	})
	store.logs = readLogs
	w = store.workflow(w.id)!
	assert.equal(runLogScans, 0); assert.equal(w.ownerSend, undefined); assert.equal(w.reason, undefined)
	proof('B3 normal drafting never scans approval logs; only an explicit approved field or snapshot is preserved')
	console.log(`SEND PROOF: ${proofCount} fictional dispatch/apply journey groups passed; stub model, isolated homes, no live root, no unit tests.`)
} finally {
	rmSync(root, { recursive: true, force: true })
}
