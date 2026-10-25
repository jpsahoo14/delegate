// Fictional-root integration journeys through dispatch, persistence and apply; not a unit-test suite.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config, Workflow } from '../src/core/types.ts'
import type { Source } from '../src/adapters/source.ts'
import type { RawMsg } from '../src/core/intake.ts'
import type { Quick } from '../src/runner/send-holds.ts'

const root = mkdtempSync(join(tmpdir(), 'delegate-holds-proof-'))
for (const name of ['local', 'copilot', 'config', 'cache', 'data']) mkdirSync(join(root, name))
Object.assign(process.env, { DELEGATE_LOCAL: join(root, 'local'), DELEGATE_ROOT: join(root, 'fictional'),
	COPILOT_HOME: join(root, 'copilot'), XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data') })
const { Store } = await import('../src/store/state.ts')
const { dispatch } = await import('../src/runner/dispatch.ts')
const { applyAnswers, send } = await import('../src/runner/apply.ts')
const { holdCheck } = await import('../src/runner/send-holds.ts')
const { holdReasons, keepApprovedDraft } = await import('../src/core/owner-send.ts')
const { workflowApprovalRev } = await import('../src/core/page-approval.ts')
const store = new Store({ root: join(root, 'fictional'), machine: 'fictional' })
const cfg: Config = { schema: 1, owner: { id: 'robin', name: 'Robin Lane' }, aliases: ['rlane'], tz: 'Pacific/Honolulu',
	source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: ['fictional-worker-never-launched'], tools: [], host: false },
	maxParallel: 3, nudgeEveryMin: 10, dailyRuns: 500 }
store.saveConfig(cfg)
const at = '2026-10-24T07:00:00.000Z', later = '2026-10-24T07:01:00.000Z'
const old = 'Incident handoff: Robin, confirm your mitigated incidents.\n| Owner | Incident | State | Age |\n| Robin | 54321 | Mitigated | 21 days |\n| Taylor | 65432 | Active | 3h ago |'
const recurring = 'Incident handoff: Robin, confirm your mitigated incidents.\n| Owner | Incident | State | Age |\n| Robin | 54321 | Mitigated | 22 days |\n| Taylor | 65432 | Mitigated | 4h ago |\n| Avery | 76543 | Active | 1 day |'
const reply = 'Incident 54321 is mitigated; monitoring continues.'
const messages = new Map<string, RawMsg[]>(), sent: string[] = [], timers = new Set<ReturnType<typeof setTimeout>>()
let sequence = 0, modelCalls = 0, passes = 0
const source: Source = {
	selfChatId: 'self', recent: async chat => messages.get(chat) ?? [],
	around: async (chat, id) => ({ msg: messages.get(chat)?.find(m => m.id === id), after: [] }),
	newMessages: async (chat, id) => ({ msgs: (messages.get(chat) ?? []).filter(m => Number(m.id) > Number(id)), truncated: false }),
	recentChats: async () => [], send: async (_chat, text) => { sent.push(text); return { msgId: String(90000 + sent.length) } },
	sendSelf: async () => ({ msgId: '99000' }), presence: async () => ({ availability: 'Available' }),
	deleteMessage: async () => {}, editMessage: async () => {}, close: async () => {},
}
const no: Quick = async (_prompt, schema, timeout) => {
	modelCalls++; assert.equal(timeout, 5000); assert.ok(schema)
	await new Promise(resolve => setTimeout(resolve, 30))
	return JSON.stringify({ stillAnswers: 'no', changed: 'Your incident 54321 is active again.' })
}
function pass(text: string) { passes++; console.log(`PASS ${text}`) }
async function seed(ask = old): Promise<Workflow> {
	const n = ++sequence, id = String(n * 100)
	const wf: Workflow = { schema: 1, id: `fictional-${n}`, code: `A${n}`, kind: 'reply', state: 'running', key: { type: 'thread', id },
		chat: { id: `chat-${n}`, name: 'Aurora handoff', group: true, test: false }, asker: { id: 'kim', name: 'Kim' },
		session: { agent: 'copilot', id: `fictional-session-${n}` }, lastMsgId: id, msgIds: [id], pending: [id],
		lastAsk: ask, status: 'Drafting', newCount: 0, createdAt: at, updatedAt: at }
	messages.set(wf.chat.id, [{ id, at, editedAt: at, from: wf.asker!, html: false, body: ask }])
	store.save(wf); store.saveThread(wf.id, [{ id, at, editedAt: at, from: wf.asker!, text: ask, byOwner: false }])
	await dispatch(store, source, cfg, async (_cfg, input) => {
		store.writeReport({ workflowId: input.workflowId, intent: 'other', state: 'needs_human', summary: 'Ready',
			reply: { text: reply, commitment: false, sources: [] } }, input.runId)
		return { exitCode: 0, ms: 1 }
	})
	return store.workflow(wf.id)!
}
function post(w: Workflow, text: string, offset = 1) {
	messages.get(w.chat.id)!.push({ id: String(Number(w.lastMsgId) + offset), at: later, from: w.asker!, body: text, html: false })
}
async function approve(w: Workflow, options: { quick?: Quick; review?: string; text?: string; chat?: boolean } = {}) {
	store.writeAnswer({ code: w.code, verb: options.text ? /^(?:send anyway|redraft)$/.test(options.text) ? 'answer' : 'send' : 'ok', text: options.text, surface: options.chat ? 'self' : 'panel', sendReview: options.review,
		...(!options.chat ? { page: { kind: 'send-reply' as const, expect: workflowApprovalRev(w) } } : {}) })
	await applyAnswers(store, source, cfg, undefined, false, undefined, options.quick)
	return store.workflow(w.id)!
}
try {
	let w = await seed(); post(w, recurring)
	const before = sent.length, calls = modelCalls
	w = await approve(w, { quick: no })
	assert.equal(sent.length, before + 1); assert.equal(modelCalls, calls)
	assert.match(w.sent?.checks?.join(' ' ) ?? '', /Kim posted again.*nothing changed for you/)
	const localTime = new Date(later).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: cfg.tz })
	assert.equal(w.sent?.checks?.[0], `Kim posted again at ${localTime}; nothing changed for you.`)
	assert.ok(!w.sent?.checks?.join(' ').includes(later))
	assert.ok(store.logs().some(e => e.code === w.code && e.event === 'owner-send-checked' && e.step === 'reduced'))
	pass('A36 other rows and ages change: one send, unchanged history, zero model calls')

	for (const [oldHeader, newHeader] of [['8 CRIs', '10 CRIs'], ['**8 CRIs**', '**10 CRIs**'], ['## Daily digest: 8 CRIs', '## Daily digest: 10 CRIs'], ['8 PR reviews', '10 PR reviews']]) {
		w = await seed(oldHeader + '\n' + old); post(w, newHeader + '\n' + recurring)
		const totalCalls = modelCalls, totalSends = sent.length
		w = await approve(w, { quick: no })
		assert.equal(sent.length, totalSends + 1); assert.equal(modelCalls, totalCalls)
		assert.ok(store.logs().some(e => e.code === w.code && e.event === 'owner-send-checked' && e.step === 'reduced'))
	}
	pass('digest header total alone changes from 8 CRIs to 10 CRIs: reduced without a model call; history uses owner-local short time')

	w = await seed(); post(w, recurring); post(w, recurring, 2)
	const duplicateCalls = modelCalls, duplicateSends = sent.length
	w = await approve(w, { quick: no })
	assert.equal(sent.length, duplicateSends + 1); assert.equal(modelCalls, duplicateCalls)
	pass('two unchanged reduced editions send once without reaching the model')

	w = await seed('8 CRIs\n' + old)
	post(w, '10 CRIs\n' + recurring); post(w, '12 CRIs\n' + recurring.replace('22 days', '23 days'), 2)
	const editionCalls = modelCalls, editionSends = sent.length
	w = await approve(w, { quick: no })
	assert.equal(sent.length, editionSends + 1); assert.equal(modelCalls, editionCalls)
	pass('distinct digest editions differing only in paired totals and ages dedupe after reduction, before the model')

	for (const [before, current, oldLine, newLine] of [
		['8 CRIs\n' + old, '10 incidents\n' + recurring, '8 cris', '10 incidents'],
		['8 CRIs\n' + old, recurring, '8 cris', 'incident handoff'],
		['# CRIs\n' + old, '10 CRIs\n' + recurring, '# cris', '10 cris'],
		['Robin, restart 2 servers.\n' + old, 'Robin, restart 3 servers.\n' + recurring, 'restart 2 servers', 'restart 3 servers'],
		[old.replace('21 days', '2 retries'), recurring.replace('22 days', '3 retries'), '2 retries', '3 retries'],
	]) {
		w = await seed(before); post(w, current)
		const meaningfulCalls = modelCalls
		w = await approve(w, { quick: async (prompt, schema, timeout) => {
			const data = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1))
			assert.ok(data.before.includes(oldLine)); assert.ok(data.current.includes(newLine))
			return no(prompt, schema, timeout)
		} })
		assert.equal(modelCalls, meaningfulCalls + 1); assert.equal(w.sent, undefined); assert.equal(w.draft?.text, reply)
		assert.equal(w.reason?.kind, 'asker-wrote-again')
	}
	pass('different header wording, numeric owner instructions and owner-row metrics remain meaningful and hold the approved draft')

	w = await seed()
	const changedEdition = recurring.replace('54321 | Mitigated', '54321 | Active')
	post(w, changedEdition); post(w, changedEdition, 2)
	const changedCalls = modelCalls
	w = await approve(w, { quick: async (prompt, schema, timeout) => {
		const data = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1))
		assert.equal(data.current.match(/54321/g)?.length, 1)
		return no(prompt, schema, timeout)
	} })
	assert.equal(modelCalls, changedCalls + 1); assert.equal(w.sent, undefined); assert.equal(w.draft?.text, reply)
	assert.ok(w.reason?.kind === 'asker-wrote-again')
	assert.deepEqual(w.reason.msgIds, messages.get(w.chat.id)!.slice(1).map(m => m.id))
	assert.equal(w.reason.messages?.length, 2)
	pass('identical changed editions are checked once but hold with every original message id and text intact')

	w = await seed(); post(w, recurring.replace('54321 | Mitigated', '54321 | Active'))
	w = await approve(w, { quick: no })
	assert.equal(w.sent, undefined); assert.equal(w.draft?.text, reply)
	assert.ok(w.reason?.kind === 'asker-wrote-again'); assert.equal(w.reason.changed, 'Your incident 54321 is active again.')
	pass('owner row Mitigated to Active: realistic warm stub holds with one plain changed line')

	w = await seed(); post(w, `${recurring}\nRobin, can you restart the service now?`)
	w = await approve(w, { quick: no }); assert.equal(w.reason?.kind, 'asker-wrote-again')
	pass('new question to owner holds without replacing the approved draft')

	w = await seed()
	post(w, 'Robin, also, can you check the rollback too?')
	post(w, recurring, 2)
	const batchCalls = modelCalls
	w = await approve(w, { quick: async (prompt, schema, timeout) => {
		assert.match(prompt, /check the rollback too/)
		assert.match(prompt, /54321/)
		return no(prompt, schema, timeout)
	} })
	assert.equal(modelCalls, batchCalls + 1); assert.equal(w.sent, undefined)
	assert.ok(w.reason?.kind === 'asker-wrote-again')
	assert.deepEqual(w.reason.msgIds, messages.get(w.chat.id)!.slice(1).map(m => m.id))
	assert.equal(w.reason.messages?.length, 2); assert.ok(w.reason.changed)
	const batchReview = w.holdDigest, batchCount = sent.length
	w = await approve(w, { quick: no, review: batchReview })
	assert.equal(sent.length, batchCount + 1)
	pass('earlier also-question followed by unchanged digest holds: all message ids, one batch model call, exact confirmation sends')

	w = await seed()
	post(w, 'Robin, also, can you check the rollback too?'); post(w, recurring, 2)
	w = await approve(w, { quick: no })
	const allIds = messages.get(w.chat.id)!.slice(1).map(m => m.id)
	w = await approve(w, { text: 'redraft', chat: true })
	assert.deepEqual(w.pending, allIds)
	assert.ok(allIds.every(id => store.thread(w.id).some(m => m.id === id)))
	w.state = 'done'; store.save(w)
	pass('explicit Redraft includes every held asker message in its thread and pending asks')

	w = await seed(); post(w, `${recurring}\nRobin, can you restart the service now?`)
	w = await approve(w, { quick: async () => { throw new Error('fictional warm host is down') } })
	assert.ok(w.sent); assert.match(w.sent.checks?.join(' ') ?? '', /couldn't check it in time/)
	assert.ok(store.logs().some(e => e.code === w.code && e.event === 'owner-send-checked' && e.result === 'error'))
	pass('warm host down fails open with history and a diagnostic, no redraft')

	w = await seed(); post(w, `${recurring}\nRobin, can you restart the service now?`)
	const start = Date.now()
	w = await approve(w, { quick: async () => new Promise(resolve => {
		const timer = setTimeout(() => { timers.delete(timer); resolve({ stillAnswers: 'no', changed: 'Too late.' }) }, 8000); timers.add(timer)
	}) })
	const elapsed = Date.now() - start
	assert.ok(elapsed >= 4900 && elapsed < 6500, `hard cap elapsed ${elapsed}ms`)
	assert.ok(w.sent); assert.match(w.sent.checks?.join(' ') ?? '', /couldn't check it in time/)
	pass(`8-second warm stub sends after the five-second cap (${elapsed}ms), with fail-open history`)

	for (const answer of [{ stillAnswers: 'yes', changed: '' }, { stillAnswers: 'unsure', changed: '' }, { stillAnswers: 'no', changed: '' }, 'not JSON']) {
		w = await seed(); post(w, `${recurring}\nRobin, can you restart the service now?`)
		w = await approve(w, { quick: async () => answer })
		assert.ok(w.sent)
	}
	pass('yes, unsure, no-without-change and malformed JSON all fail open')

	w = await seed(); post(w, recurring)
	const strictCalls = modelCalls
	assert.equal(await send(store, source, cfg, w, reply, { ruleId: 'R1', quick: no }), false)
	assert.equal(w.sent, undefined); assert.equal(modelCalls, strictCalls); assert.equal(w.reason?.kind, 'asker-wrote-again')
	pass('rule send stays strict on A36 and never calls the intent model')
	w.state = 'needs_human'; store.save(w)

	w = await seed('8 CRIs\n' + old); post(w, '10 CRIs\n' + recurring); post(w, '12 CRIs\n' + recurring, 2)
	const totalRuleCalls = modelCalls
	assert.equal(await send(store, source, cfg, w, reply, { ruleId: 'R1', quick: no }), false)
	assert.equal(w.sent, undefined); assert.equal(modelCalls, totalRuleCalls)
	assert.ok(w.reason?.kind === 'asker-wrote-again'); assert.equal(w.reason.messages?.length, 2)
	w.state = 'needs_human'; store.save(w)
	pass('rule sends remain strict for count-only changes and duplicate editions, with no model call')

	w = await seed()
	messages.get(w.chat.id)![0].body = old.replace('54321 | Mitigated', '54321 | Active')
	messages.get(w.chat.id)![0].editedAt = later
	post(w, `${recurring}\nRobin, can you restart the service now?`)
	w.ownerSend = { draft: structuredClone(w.draft!), at: later, askMsgId: w.lastMsgId }
	keepApprovedDraft(w, 'No reply needed.')
	await holdCheck(store, source, w, { quick: no }); store.save(w)
	assert.deepEqual(holdReasons(w).map(r => r.kind), ['ask-edited', 'asker-wrote-again', 'no-reply-needed'])
	const combined = w.holdDigest
	w = await approve(w, { review: combined, quick: no }); assert.ok(w.sent)
	pass('edit + newer question + no-reply are gathered together and one exact confirmation sends')

	w = await seed(); post(w, `${recurring}\nRobin, can you restart the service now?`)
	w = await approve(w, { quick: no })
	const reviewed = w.holdDigest
	post(w, `${recurring}\nRobin, stop the rollout instead.`, 2)
	const count = sent.length
	w = await approve(w, { review: reviewed, quick: no })
	assert.equal(sent.length, count); assert.notEqual(w.holdDigest, reviewed)
	w = await approve(w, { review: w.holdDigest, quick: no }); assert.equal(sent.length, count + 1)
	pass('post after page click causes one new full hold; second confirmation sends once')

	w = await seed(); post(w, `${recurring}\nRobin, can you restart the service now?`)
	w = await approve(w, { quick: no }); post(w, `${recurring}\nRobin, stop the rollout instead.`, 2)
	const beforeNotice = sent.length
	w = await approve(w, { quick: no, text: 'send anyway', chat: true })
	assert.equal(sent.length, beforeNotice); assert.equal(w.holdNotice?.digest, w.holdDigest)
	w = await approve(w, { quick: no, text: 'send anyway', chat: true }); assert.ok(w.sent)
	pass('chat Send anyway refuses with a notice first, then confirms exactly the announced hold (PE 06:25 decision 47)')

	w = await seed(); post(w, `${recurring}\nRobin, can you restart the service now?`)
	w = await approve(w, { quick: no })
	const kept = w.draft?.text
	w = await approve(w, { quick: no, text: 'Replacement typed into chat', chat: true })
	assert.equal(w.sent, undefined); assert.equal(w.draft?.text, kept)
	w = await approve(w, { quick: no, text: 'Incident 54321 is active; investigating.', review: w.holdDigest })
	assert.ok(w.sent); assert.equal(w.sent.text, 'Incident 54321 is active; investigating.')
	pass('typed chat cannot replace a held draft; page-edited text restamps only explicitly reviewed reasons')

	w = await seed()
	const revision = workflowApprovalRev(w)
	store.writeAnswer({ code: w.code, verb: 'ok', surface: 'panel', page: { kind: 'send-reply', expect: revision } })
	w.lastAsk = 'Robin, a new version.'; store.save(w)
	let reads = 0
	await applyAnswers(store, { ...source, around: async () => { reads++; throw new Error('stale page must not read') } }, cfg, undefined, false, undefined, no)
	assert.equal(reads, 0); assert.equal(store.workflow(w.id)?.ownerSend, undefined)
	pass('stale page revision remains the first gate, before source or host reads')
	console.log(`${passes} aggregate owner-send journeys passed.`)
} finally {
	for (const timer of timers) clearTimeout(timer)
	await source.close()
	rmSync(root, { recursive: true, force: true })
}
