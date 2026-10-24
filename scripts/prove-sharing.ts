// Fictional-root journeys through real dispatch, provenance, sharing and send paths; no unit tests or live tools.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Config, Report, Workflow } from '../src/core/types.ts'
import type { Source } from '../src/adapters/source.ts'
import type { RawMsg } from '../src/core/intake.ts'

const root = mkdtempSync(join(tmpdir(), 'delegate-sharing-proof-'))
for (const dir of ['local', 'copilot', 'config', 'cache', 'data']) mkdirSync(join(root, dir))
Object.assign(process.env, { DELEGATE_ROOT: join(root, 'fictional'), DELEGATE_LOCAL: join(root, 'local'),
	COPILOT_HOME: join(root, 'copilot'), XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data') })
const { Store } = await import('../src/store/state.ts')
const { dispatch } = await import('../src/runner/dispatch.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { dueSends } = await import('../src/runner/autosend.ts')
const { setRules } = await import('../src/runner/habits.ts')
const store = new Store({ root: join(root, 'fictional'), machine: 'fictional' })
const knowledge = join(root, 'cards'), card = join(knowledge, 'aurora.md')
mkdirSync(knowledge); writeFileSync(card, 'Aurora status: monitoring continues.')
const cfg: Config = { schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' }, watch: [],
	agent: { flavor: 'copilot', command: ['fictional-worker-never-launched'], tools: [], host: false }, knowledge: [knowledge], maxParallel: 3, nudgeEveryMin: 10, dailyRuns: 100 }
store.saveConfig(cfg)
setRules(store, [{ id: 'R1', text: 'Reply to Kim', who: { accounts: [{ id: 'kim', name: 'Kim' }] }, when: {}, then: 'send' }])
const live = new Map<string, RawMsg[]>(), posted: string[] = []
const source: Source = {
	selfChatId: 'self', recent: async chat => live.get(chat) ?? [],
	around: async (chat, id) => ({ msg: live.get(chat)?.find(m => m.id === id), after: [] }),
	newMessages: async () => ({ msgs: [], truncated: false }), recentChats: async () => [],
	send: async (_chat, text) => { posted.push(text); return { msgId: String(90000 + posted.length) } },
	sendSelf: async () => ({ msgId: '99000' }), presence: async () => ({ availability: 'Away' }),
	members: async chat => ({ ids: ['robin', 'kim'], names: { robin: 'Robin', kim: 'Kim' }, guests: chat.includes('guest') }),
	chatName: async () => 'Aurora review', deleteMessage: async () => {}, editMessage: async () => {}, close: async () => {},
}
const incident = 'https://incidents.acme.example/incidents/details/900001', otherChat = '19:aurora-review@thread.v2'
const chatLink = `https://teams.microsoft.com/l/message/${otherChat}/500?context=%7B%22contextType%22%3A%22chat%22%7D`
const org = { isSecurityRisk: false, isRestricted: false, isSupportEngagement: false }
const evidence = (ref = incident): NonNullable<Report['reply']>['sources'] => [
	{ ref: card, tier: 'card', origin: 'extracted' },
	{ ref, tier: 'live', origin: 'extracted' },
]
const call = (tool: string, args: object, result: unknown, success = true) => [
	{ type: 'tool.execution_start', data: { toolCallId: tool, toolName: tool, arguments: args } },
	{ type: 'tool.execution_complete', data: { toolCallId: tool, success, result: { structuredContent: result, content: JSON.stringify(result) } } },
]
const readIncident = (body: object, success = true) => call('incident-get_incident_details_by_id', { incidentId: 900001 }, body, success)
const readChat = () => call('teams-GetChatMessage', { chatId: otherChat, messageId: '500' }, { text: 'Monitoring continues.' })
let sequence = 0, passed = 0
function seed(ask = 'Robin, what is the Aurora incident status?', guest = false): Workflow {
	const n = ++sequence, id = String(n * 100), at = new Date().toISOString()
	const wf: Workflow = { schema: 1, id: `fictional-${n}`, code: `A${2000 + n}`, kind: 'reply', state: 'running', key: { type: 'thread', id },
		chat: { id: `19:fictional-${guest ? 'guest-' : ''}${n}@thread.v2`, name: 'Acme status', group: true, test: false },
		asker: { id: 'kim', name: 'Kim' }, session: { agent: 'copilot', id: `fictional-${n}` }, lastMsgId: id, msgIds: [id], pending: [id],
		lastAsk: ask, status: 'Drafting', newCount: 0, createdAt: at, updatedAt: at }
	live.set(wf.chat.id, [{ id, at, from: wf.asker!, body: ask, html: false }])
	store.save(wf); store.saveThread(wf.id, [{ id, at, from: wf.asker!, text: ask, byOwner: false }])
	return wf
}
async function draft(wf: Workflow, events: unknown[], text = 'Monitoring continues.', sources = evidence()) {
	wf.state = 'running'; store.save(wf)
	await dispatch(store, source, cfg, async (_agent, input) => {
		const file = join(process.env.COPILOT_HOME!, 'session-state', input.sessionId, 'events.jsonl')
		mkdirSync(dirname(file), { recursive: true })
		writeFileSync(file, [{ type: 'session.start', data: {} }, ...events].map(e => JSON.stringify(e)).join('\n') + '\n')
		store.writeReport({ workflowId: input.workflowId, intent: 'other', state: 'needs_human', summary: 'Ready',
			reply: { text, commitment: false, sources } }, input.runId)
		return { exitCode: 0, ms: 1 }
	}, undefined, [wf.id])
	return store.workflow(wf.id)!
}
function kind(wf: Workflow) { return typeof wf.shareHold === 'object' ? wf.shareHold.kind : wf.shareHold }
function pass(text: string) { passed++; console.log(`PASS ${text}`) }
function privateNamesAbsent(wf: Workflow, names: string[]) {
	const records = JSON.stringify(wf.records)
	for (const name of names) assert.ok(!records.includes(name))
	assert.ok((wf.records ?? []).every(r => Object.keys(r).every(key => ['id', 'label', 'audience', 'why'].includes(key))))
}
function customerHoldLogs() { return store.logs().filter(e => e.event === 'share-hold' && e.kind === 'customer') }
function loggedField(field: 'owningTenantName' | 'customField', before: number) {
	const logs = customerHoldLogs()
	assert.equal(logs.length, before + 1)
	assert.equal(logs.at(-1)?.field, field)
}
try {
	let w = await draft(seed(), [...readIncident({ ...org, isRestricted: true }), ...readChat()], 'Monitoring continues.', [...evidence(), ...evidence(chatLink)])
	assert.equal(kind(w), 'restricted'); assert.deepEqual(w.drewOn, [otherChat])
	w = await draft(w, [], 'Monitoring still continues.', evidence(chatLink))
	assert.equal(kind(w), 'restricted'); assert.equal(w.records?.[0].audience, 'restricted'); assert.equal(w.sent, undefined)
	pass('restricted incident plus chat survives a redraft without a reread or incident citation')

	w = await draft(seed(), [...readIncident(org), ...readChat()], 'Monitoring continues.', [...evidence(), ...evidence(chatLink)])
	assert.equal(w.shareHold, undefined); assert.deepEqual(w.drewOn, [otherChat])
	w = await draft(w, [])
	assert.equal(w.shareHold, undefined); assert.equal(w.records?.[0].id, 'inc:900001')
	pass('a record cited from an earlier successful read remains read, not unread, on redraft')

	store.saveControl({ ...store.control(), autoSend: true })
	w = await draft(seed(), readIncident(org))
	assert.equal(w.shareHold, undefined); assert.equal(w.state, 'scheduled', JSON.stringify(w.decision))
	w.sendAt = new Date(Date.now() - 1000).toISOString(); store.save(w)
	const sent = posted.length
	assert.equal(await dueSends(store, source, cfg), 1); assert.equal(posted.length, sent + 1)
	store.saveControl({ ...store.control(), autoSend: false })
	pass('org-visible incident in an internal group still auto-sends through the real rule and send path')

	w = await draft(seed(undefined, true), readIncident(org)); assert.equal(kind(w), 'guest')
	w = await draft(seed(), readIncident({})); assert.equal(kind(w), 'restricted')
	w = await draft(seed(), []); assert.equal(kind(w), 'unread')
	pass('guest, missing-audience and never-read incident cases retain their structured holds')

	store.saveControl({ ...store.control(), autoSend: true })
	w = await draft(seed(), readIncident({ ...org, owningTenantName: 'Acme Cloud' }), 'ACME   CLOUD is affected; monitoring continues.')
	assert.equal(kind(w), 'customer'); assert.equal(w.state, 'needs_human'); assert.equal(w.sent, undefined)
	assert.deepEqual(w.shareHold, { kind: 'customer', record: 'Incident 900001' })
	loggedField('owningTenantName', 0)
	privateNamesAbsent(w, ['Acme Cloud'])
	store.saveControl({ ...store.control(), autoSend: false })
	pass('the incident own tenant name holds a rule-covered draft, ignoring case and whitespace, without persisting the name on records')

	const beforeAllowed = customerHoldLogs().length
	w = await draft(seed('Robin, what happened to Acme Cloud?'), readIncident({ ...org, owningTenantName: 'Acme Cloud' }), 'ACME CLOUD is affected.')
	assert.equal(w.shareHold, undefined)
	assert.equal(customerHoldLogs().length, beforeAllowed)
	w = await draft(seed(), readIncident({ ...org, owningTenantName: 'Acme' }), 'AcmeTools is monitoring.')
	assert.equal(w.shareHold, undefined)
	pass('a name already in this thread is allowed; a short name is not matched inside an unrelated longer word')

	for (const Name of ['Customer Name', 'TenantName']) {
		const before = customerHoldLogs().length
		w = await draft(seed(), readIncident({ ...org, owningTenantName: 'Acme Cloud', customFields: [{ Name, StringValue: 'Globex Retail' }] }), 'Globex Retail is affected.')
		assert.equal(kind(w), 'customer'); privateNamesAbsent(w, ['Globex Retail'])
		loggedField('customField', before)
	}
	w = await draft(seed(), readIncident({ ...org, customFields: [{ Name: 'Customer Ticket Status', StringValue: 'Monitoring' }] }), 'Monitoring continues.')
	assert.equal(w.shareHold, undefined)
	pass('named customer/tenant custom fields hold; ticket status is not treated as a customer name')

	w = await draft(seed(), [...readIncident({ ...org, owningTenantName: 'Acme Cloud' }), ...readChat()], 'Acme Cloud is affected.', [...evidence(), ...evidence(chatLink)])
	assert.equal(kind(w), 'customer'); assert.deepEqual(w.drewOn, [otherChat])
	w = await draft(w, [], 'Acme Cloud is still affected.', evidence(chatLink))
	assert.equal(kind(w), 'customer'); privateNamesAbsent(w, ['Acme Cloud'])
	pass('a customer-name hold also survives a chat-backed redraft without persisting extracted values')

	w = await draft(seed(), readIncident({ ...org, owningTenantName: 'Acme Cloud' }, false), 'Acme Cloud is affected.', [])
	assert.equal(w.shareHold, undefined); assert.equal(w.records, undefined)
	w = await draft(seed(), [], 'Acme Cloud is affected.', [])
	assert.equal(w.shareHold, undefined)
	pass('failed reads and a later independent run do not supply customer-name evidence')

	w = await draft(seed(), readIncident({ ...org, owningTenantName: 'Acme Cloud' }), 'Acme Cloud is affected.', evidence(card))
	assert.equal(kind(w), 'customer'); assert.equal(w.records?.[0].audience, 'org')
	w = await draft(seed(undefined, true), readIncident({ ...org, owningTenantName: 'Acme Cloud' }), 'Monitoring continues.', [])
	assert.equal(w.shareHold, undefined)
	pass('an uncited incident name still holds when used; an unused org-visible name does not create a guest hold')

	w = await draft(seed(), readIncident({ ...org, owningTenantName: 'Acme Cloud' }), 'Acme Cloud is affected.')
	const approved = posted.length
	store.writeAnswer({ code: w.code, verb: 'ok', surface: 'panel' })
	await applyAnswers(store, source, cfg)
	assert.equal(posted.length, approved + 1); assert.ok(store.workflow(w.id)?.sent)
	privateNamesAbsent(store.workflow(w.id)!, ['Acme Cloud'])
	pass('an owner-approved Send is never blocked by the customer hold')
	for (const log of customerHoldLogs()) {
		assert.deepEqual(Object.keys(log).sort(), ['at', 'event', 'field', 'kind'])
		assert.ok(log.field === 'owningTenantName' || log.field === 'customField')
		assert.doesNotMatch(JSON.stringify(log), /acme|globex|retail|cloud|monitoring/i)
	}
	assert.ok(customerHoldLogs().some(log => log.field === 'owningTenantName'))
	assert.ok(customerHoldLogs().some(log => log.field === 'customField'))
	pass('persisted share-hold events identify the triggering field category only, never names or other response values')
	console.log(`SHARING PROOF: ${passed} fictional dispatch/provenance/apply journeys passed; isolated homes, stub worker and no live tools.`)
} finally {
	await source.close()
	rmSync(root, { recursive: true, force: true })
}
