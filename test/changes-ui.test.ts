// The page side of next action and owned work (R-HIL-21, R-WRK-18): what a change means on its card, the Settings switches for
// the changes Delegate may propose, "Send reply only", and "Review again". Each rule here fails when it is broken. Made-up names only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-chlocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { seedChanges, stub } = await import('./fixture.ts')
const { view } = await import('../src/web/view.ts')
const { settingsView, saveSetting } = await import('../src/web/settings.ts')
const { meaningOf, refusedAsk } = await import('../src/core/effects.ts')
const { useSite } = await import('../src/core/site.ts')
const { actResult } = await import('../src/mcp/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { approveEffects } = await import('../src/runner/jobs.ts')
const { COMMANDS } = await import('../src/web/next.ts')
const { primaryOf } = await import('../src/web/app/model/derive.ts')
import type { CardUi } from '../src/web/app/model/types.ts'

type S = InstanceType<typeof Store>
const fresh = () => seedChanges(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-chroot-')), machine: 'mac' }))
const cardOf = (s: S, code: string) => view(s, undefined).needs.find(c => c.code === code)!
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
const ui = (): CardUi => ({ status: 'ready', msg: '', lost: false, stale: false, touched: false, pick: null, otherOn: false, other: '', editing: false, text: null, answer: '', ask: '', cmts: null, facts: null, threadOpen: false, whyOpen: false, dbgOpen: false, menu: false })
// A command as the page sends it, applied by the runner: what it said back.
async function send(s: S, command: string, code: string) {
	const said = actResult(s, command, cardOf(s, code)?.rev, 'page')
	assert.ok(said.accepted, `${command}: ${said.text}`)
	await applyAnswers(s, stub, s.config(), procs as never, false, { async builds() { return new Map() }, async pr() { return { status: 'active', votes: [{ name: s.config().owner.name, vote: 0 }] } } })
	return said.ids.map(id => s.outcome(id) ?? '').join(' ')
}

test('changes ui: a vote shows what its PR is and that an approval may complete it, as a warning; a deploy shows its ring', () => {
	const s = fresh()
	assert.deepEqual(cardOf(s, 'A60').changes[0].meaning, [{ text: '"Fix the banner" by Dev Rao' }, { text: 'required reviewers: Web Team' }, { text: 'autocomplete is on: your approval may complete it', warn: true }])
	const ring = cardOf(s, 'A61').changes[0].meaning!
	assert.deepEqual(ring.map(p => p.text.replace(/ at .*,/, ' at <time>,')), ['nothing running', 'last run 900 by Pete Ross at <time>, succeeded'])
	assert.ok(ring.every(p => !p.warn), 'a ring line is quiet')
	assert.equal(cardOf(s, 'A6').changes[0].meaning, undefined, 'a change with no facts has no line')
	// Chat, self-chat, and AI chat keep their one line, with the same words.
	const e = s.byCode('A60')!.effects![0]
	assert.equal(meaningOf(e), '"Fix the banner" by Dev Rao; required reviewers: Web Team; autocomplete is on: your approval may complete it')
	assert.equal(meaningOf({ ...e, pr: { ...e.pr!, autoComplete: false, required: [] } }), '"Fix the banner" by Dev Rao')
})

const switches = (s: S) => settingsView(s).rows.filter(r => r.kind === 'switch')

test('changes ui: Settings has a switch per change it may propose, from setup and the site, for the servers the owner has', () => {
	const s = fresh()
	try {
		useSite({ write: { ado: ['repo_pull_request_write:abandon', 'repo_pull_request_write', 'pipelines_write:run_pipeline', 'repo_pull_request_write:complete'], globex: ['post_note'], acme: ['post_note'] }, actions: { 'acme-post_note': ['Acme note', 'post a note to the Acme board'], 'ado-wit_work_item_write:delete': ['Delete', 'delete a work item'], 'ado-repo_pull_request_write:bypass_merge': ['Bypass', 'merge past policies'] } })
		s.saveConfig({ ...s.config(), agent: { ...s.config().agent, mcpServers: { ...s.config().agent.mcpServers, acme: { command: 'delegate-test-no-such-server' } } } })
		const rows = switches(s)
		assert.deepEqual(rows.map(r => [r.key, r.label, r.value]), [
			['change:ado-repo_pull_request_thread_write', 'PR comment', 'true'],
			['change:ado-repo_pull_request_write:vote', 'PR vote', 'true'],
			['change:ado-wit_work_item_write:update', 'Work item update', 'false'],
			['change:calendar-CreateEvent', 'Calendar invite', 'false'],
			['change:acme-post_note', 'Acme note', 'false'],
		], 'globex is not one of the owner\'s servers; abandon, complete, merge, bypass, delete, the whole PR tool, and a pipeline write never appear')
		assert.equal(rows[1].help, 'ado-repo_pull_request_write:vote: cast the owner\'s vote on a pull request: Approved, ApprovedWithSuggestions, WaitingForAuthor, Rejected, or NoVote')
		assert.equal(rows[4].help, 'acme-post_note: post a note to the Acme board')
		assert.ok(rows.every(r => r.section === 'you'))
		assert.equal(settingsView(s).fixed.some(f => /Changes it may propose/.test(f.label)), false, 'the read-only line is replaced')
	} finally { useSite(undefined) }
})

test('changes ui: a switch saves effectTools through the settings save path, checked like any setting', async () => {
	const s = fresh()
	assert.equal((await saveSetting(s, 'change:ado-wit_work_item_write:update', 'true')).ok, true)
	assert.equal((await saveSetting(s, 'change:ado-repo_pull_request_write:vote', 'false')).ok, true)
	assert.deepEqual(s.config().agent.effectTools, ['ado-repo_pull_request_thread_write', 'ado-wit_work_item_write:update'])
	assert.equal((await saveSetting(s, 'change:ado-wit_work_item_write:update', 'true')).ok, true)
	assert.deepEqual(s.config().agent.effectTools, ['ado-repo_pull_request_thread_write', 'ado-wit_work_item_write:update'], 'on twice is once')
	const before = JSON.stringify(s.config())
	for (const [key, raw] of [['change:ado-repo_pull_request_write:abandon', 'true'], ['change:ado-pipelines_write:run_pipeline', 'true'], ['change:ado-repo_pull_request_write', 'true'], ['change:globex-post_note', 'true'], ['change:calendar-CreateEvent', 'maybe']]) {
		const r = await saveSetting(s, key, raw)
		assert.equal(r.ok, false, `${key}=${raw} is refused (${r.text})`)
	}
	assert.equal(JSON.stringify(s.config()), before, 'a refused switch saves nothing')
	// A read tool is never also a write tool: workers would hold it before the owner's ok (setup's rule).
	s.saveConfig({ ...s.config(), agent: { ...s.config().agent, tools: ['ado-repo_pull_request', 'calendar-CreateEvent'] } })
	assert.match((await saveSetting(s, 'change:calendar-CreateEvent', 'true')).text, /read tool/)
	assert.equal(s.config().agent.effectTools!.includes('calendar-CreateEvent'), false)
})

// review P2-3: a change switched off is refused at ok, before any change run, and the switch says so.
test('changes ui: an ok on a change switched off is refused before a change run, and the switch says what off means', async () => {
	const s = fresh()
	const said = await saveSetting(s, 'change:ado-repo_pull_request_write:vote', 'false')
	assert.match(said.text, /^PR vote is off: new drafts won't propose it, and an ok on one already shown is refused\./)
	const held = approveEffects(s, s.config(), s.byCode('A60')!)
	assert.match(held!, /^A60's Approve PR 4200001 cannot be made: ado-repo_pull_request_write:vote is not one of the changes you allow\. Turn on "PR vote" in Settings, or say "ok A60 except 1" to send only the reply\.$/)
	assert.deepEqual([s.byCode('A60')!.state, s.byCode('A60')!.approved, s.job('j-A60')!.purpose], ['needs_human', undefined, 'work'], 'no change run queued')
	assert.equal((await saveSetting(s, 'change:ado-repo_pull_request_write:vote', 'true')).text.startsWith('PR vote is on'), true)
	assert.equal(approveEffects(s, s.config(), s.byCode('A60')!), '', 'on again, the ok queues it')
})

// re-review N1: with every switch off, the ok gets the same refusal, pointing to Settings, never "add them in setup".
test('changes ui: with every change switched off, an ok is refused with the switch to turn on', async () => {
	const s = fresh()
	for (const k of ['change:ado-repo_pull_request_write:vote', 'change:ado-repo_pull_request_thread_write']) assert.equal((await saveSetting(s, k, 'false')).ok, true)
	assert.deepEqual(s.config().agent.effectTools, [])
	const held = approveEffects(s, s.config(), s.byCode('A60')!)
	assert.match(held!, /cannot be made: .* Turn on "PR vote" in Settings, or say "ok A60 except 1" to send only the reply\.$/)
	assert.doesNotMatch(held!, /setup/)
})

// re-review N2, N3: a change refused at ok and then left out is not made, so the reply that counted on it is quoted and waits for a
// second ok: also with changes still to make, and also in the owner's own words. Leaving out a change by choice stays one ok (S6).
test('changes ui: leaving out a change refused at ok quotes the reply first, with changes left or not, in any words', async () => {
	const a63 = (s: S) => { const w = s.byCode('A63')!; const es = w.effects!.map(e => ({ ...e, off: undefined })); s.save({ ...w, status: 'Needs you', effects: es }, false); const j = s.job('j-A63')!; s.saveJob({ ...j, result: { ...j.result!, effects: es.map(e => ({ ...e })) } }) }
	for (const byOwner of [false, true]) {
		// N2: the vote is switched off; the comment is still to make.
		const s = fresh(); a63(s)
		if (byOwner) { const w = s.byCode('A63')!; s.save({ ...w, draft: { ...w.draft!, text: 'Approved, thanks!', byOwner: true } }, false) }
		await saveSetting(s, 'change:ado-repo_pull_request_write:vote', 'false')
		assert.match(approveEffects(s, s.config(), s.byCode('A63')!)!, /say "ok A63 except 1" to leave it out\.$/)
		const out = await send(s, 'ok A63 except 1', 'A63')
		assert.match(out, new RegExp(`^The reply was written counting on the changes you left out, and it says: "${s.byCode('A63')!.draft!.text}" Say "ok A63" to make the rest and send it as it is`), out)
		assert.deepEqual([s.byCode('A63')!.state, s.byCode('A63')!.sent, s.jobs().some(j => j.purpose === 'execute')], ['needs_human', undefined, false], `nothing queued or sent yet (byOwner ${byOwner})`)
		assert.match(await send(s, 'ok A63', 'A63'), /^Posting A63's comment on PR 4200003 now, then sending the reply\.$/, 'the second ok makes the rest')
		// N3: the only change is refused at ok; the owner's own words still wait for a second ok.
		const t = fresh()
		if (byOwner) { const w = t.byCode('A60')!; t.save({ ...w, draft: { ...w.draft!, text: 'Approved, thanks!', byOwner: true } }, false) }
		await saveSetting(t, 'change:ado-repo_pull_request_write:vote', 'false')
		assert.match(await send(t, 'ok A60 except 1', 'A60'), /^Only the reply goes now/)
		assert.equal(t.byCode('A60')!.sent, undefined, `A60 (byOwner ${byOwner}): nothing sent on the first ok`)
	}
	// Leaving out a change that could be made, by choice, is still one ok (design-spec S6).
	const u = fresh(); a63(u)
	assert.match(await send(u, 'ok A63 except 1', 'A63'), /^Posting A63's comment on PR 4200003 now, then sending the reply\.$/)
})

test('changes ui: turning a change off never touches a change already approved', async () => {
	const s = fresh(), wf = s.byCode('A60')!
	assert.equal(approveEffects(s, s.config(), wf), '', 'the owner\'s ok approves the vote')
	assert.ok(s.byCode('A60')!.approved, 'approved, waiting for its change run')
	const items = () => JSON.stringify([s.workflows(), s.jobs()])
	const was = items()
	assert.equal((await saveSetting(s, 'change:ado-repo_pull_request_write:vote', 'false')).ok, true)
	assert.equal(items(), was, 'the items, their approvals, and their changes are as they were')
})

test('changes ui: "Send reply only" is offered when a change failed or was dropped and the reply is unsent, and "Review again" when the PR changed', () => {
	const s = fresh()
	const of = (c: string) => [cardOf(s, c).replyOnly, cardOf(s, c).reviewAgain]
	assert.deepEqual(Object.fromEntries(['A60', 'A61', 'A62', 'A63', 'A64', 'A6'].map(c => [c, of(c)])), {
		A60: [undefined, undefined], A61: [undefined, undefined], A62: ['ok A62 except 1', undefined], A63: ['ok A63 except 1', undefined], A64: [undefined, 'A64: review again'], A6: [undefined, undefined],
	})
	// Not while it is working or once it is sent, not when there is no reply, and not for a vote the owner left out.
	const a62 = s.byCode('A62')!
	s.save({ ...a62, state: 'waiting_on_task' }, false)
	assert.equal(view(s, undefined).needs.find(c => c.code === 'A62')?.replyOnly, undefined, 'only while it waits for the owner')
	s.save({ ...a62, sent: { msgId: 'x', at: a62.createdAt } }, false)
	assert.equal(cardOf(s, 'A62')?.replyOnly, undefined, 'the reply already went')
	s.save({ ...a62, draft: undefined }, false)
	assert.equal(cardOf(s, 'A62')?.replyOnly, undefined, 'no reply, nothing to send')
	const a63 = s.byCode('A63')!
	s.save({ ...a63, status: 'Needs you' }, false)
	assert.equal(cardOf(s, 'A63').replyOnly, undefined, 'a vote the owner left out was not dropped')
	s.save({ ...a63, effects: a63.effects!.map(e => ({ ...e, off: undefined })) }, false)
	assert.equal(cardOf(s, 'A63').replyOnly, undefined)
	// review P2-1: never while a question is open, since every ok is refused then: a stale vote after a change run, or a refusedAsk.
	const t = fresh(), a64 = t.byCode('A64')!
	t.save({ ...a64, effects: a64.effects!.map(e => ({ ...e, error: 'PR 4200005 changed since your review (new commits).' })) }, false)
	assert.deepEqual([cardOf(t, 'A64').replyOnly, cardOf(t, 'A64').reviewAgain], [undefined, 'A64: review again'])
	const b62 = t.byCode('A62')!
	t.save({ ...b62, question: refusedAsk('A62', 1) }, false)
	assert.equal(cardOf(t, 'A62').replyOnly, undefined)
	// re-review N4: never on a draft with a blank, which every ok refuses.
	t.save({ ...b62, question: undefined, draft: { ...b62.draft!, text: 'Left one comment on PR ___.' } }, false)
	assert.equal(cardOf(t, 'A62').replyOnly, undefined)
	t.save({ ...b62, question: undefined }, false)
	assert.equal(cardOf(t, 'A62').replyOnly, 'ok A62 except 1', 'and back once the blank is filled')
	// "Review again" is the card's main action, since ok is refused while the question is open.
	const c = cardOf(s, 'A64'), p = primaryOf(c, ui(), 'Delegate')
	assert.deepEqual([p.label, p.cmd, p.kind], ['Review again', 'A64: review again', 'draft'])
})

test('changes ui: "Send reply only" sends nothing until the second ok, and the first ok quotes the reply', async () => {
	// review P1-1: also when the owner wrote the reply themselves; it still counted on the change that failed or was dropped.
	for (const [code, byOwner] of [['A62', false], ['A63', false], ['A62', true], ['A63', true]] as const) {
		const s = fresh()
		const w = s.byCode(code)!
		s.saveThread(w.id, [{ id: w.lastMsgId, at: w.createdAt, from: w.asker!, text: `${w.lastAsk} https://dev.azure.com/acme/Canvas/_git/widget/pullrequest/${code === 'A62' ? 4200004 : 4200003}`, byOwner: false }])
		if (code === 'A63') s.save({ ...w, draft: { ...w.draft!, text: 'The PR is completed; no vote is needed.' } }, false)
		if (byOwner) { const w = s.byCode(code)!; s.save({ ...w, draft: { ...w.draft!, text: 'I will approve it after checking the comments.', byOwner: true } }, false) }
		const text = s.byCode(code)!.draft!.text
		const out = await send(s, cardOf(s, code).replyOnly!, code)
		assert.match(out, new RegExp(`^Only the reply goes now, and it says: "${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" It was written counting on the changes you left out\\. Say "ok ${code}"`))
		assert.deepEqual([s.byCode(code)!.state, s.byCode(code)!.sent], ['needs_human', undefined], `${code}${byOwner ? ' (your words)' : ''}: nothing sent yet`)
		assert.equal(s.jobs().some(j => j.purpose === 'execute'), false, 'and no change made')
		await send(s, `ok ${code}`, code)
		assert.equal(s.byCode(code)!.sent?.text ?? s.byCode(code)!.draft?.text, text)
		assert.equal(s.byCode(code)!.state, 'done', `${code}: the second ok sends it: ${s.byCode(code)!.status}`)
	}
})

test('changes ui: "Review again" sends the stale flow\'s own command, which redrafts from the review', async () => {
	const s = fresh()
	const out = await send(s, cardOf(s, 'A64').reviewAgain!, 'A64')
	const w = s.byCode('A64')!
	assert.deepEqual([w.state, w.ownerAnswer], ['running', 'review again'], out)
})

// The commands table names every button's command, and each is accepted and applied on its fixture through the real path.
test('changes ui: the commands table lists "Send reply only" and "Review again" for the rows that open such a card', async () => {
	const has = (kind: keyof typeof COMMANDS, cmd: string) => COMMANDS[kind].split(' | ').map(x => x.replace(/ \(.*\)$/, '')).includes(cmd)
	// review P2-4: every card that can show a change: reply, holding, question, choice, meeting, review.
	for (const kind of ['review', 'reply', 'holding', 'question', 'choice', 'meeting'] as const) {
		assert.ok(has(kind, 'ok <code> except <every change>'), `${kind}: ${COMMANDS[kind]}`)
		assert.ok(has(kind, '<code>: review again'), `${kind}: ${COMMANDS[kind]}`)
	}
	const REFUSED = /not ready|has no draft|already done|can't find|no such|still working|changed after you looked|I did not understand|has changes 1 to/i
	for (const [code, field] of [['A62', 'replyOnly'], ['A63', 'replyOnly'], ['A64', 'reviewAgain']] as const) {
		const s = fresh(), c = cardOf(s, code), cmd = c[field]!
		assert.equal(cmd.replace(code, '<code>').replace(/except [\d ]+$/, 'except <every change>'), field === 'replyOnly' ? 'ok <code> except <every change>' : '<code>: review again')
		assert.doesNotMatch(await send(s, cmd, code), REFUSED, `${cmd}: applied`)
	}
})
