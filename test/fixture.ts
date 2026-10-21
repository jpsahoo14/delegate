// A store with one of every card, list row, and Home tile, for the browser test and screenshots (design-spec/scenarios.md).
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Store } from '../src/store/state.ts'
import type { Workflow } from '../src/core/types.ts'
import { knowledgeOf, propose } from '../src/runner/proposals.ts'
import { answerAutomation, propose as proposeAutomation } from '../src/runner/automations.ts'
import { reviewAgain } from '../src/core/effects.ts'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const soon = (min: number) => new Date(Date.now() + min * 60_000).toISOString()
let n = 0

export const stub = { selfChatId: 'self', async recent() { return [] }, async newMessages() { return { msgs: [], truncated: false } }, async send() { return { msgId: `m${++n}` } }, async deleteMessage() {}, async editMessage() {}, async presence() { return { availability: 'Offline' } }, async close() {} } as never

export function item(store: Store, code: string, name: string, chat: string, over: Partial<Workflow>): Workflow {
	const at = over.createdAt ?? ago(60)
	const wf = {
		schema: 1, id: `w-${code}`, code, kind: 'reply', state: 'needs_human', key: { type: 'thread', id: `t-${code}` },
		chat: { id: `19:${chat.replace(/\W/g, '')}@thread.v2`, name: chat, test: false, group: true }, asker: { id: name.toLowerCase(), name },
		session: { agent: 'copilot', id: `s-${code}` }, lastMsgId: `m-${code}`, pending: [], msgIds: [`m-${code}`], newCount: 0, status: 'Needs you',
		createdAt: at, updatedAt: at, revAt: at, ...over,
	} as Workflow
	store.save(wf, false)
	return wf
}

export function seedInbox(store: Store) {
	store.saveConfig({
		schema: 1, owner: { id: 'me', name: 'Robin Park' }, source: { command: [], selfChatId: 'self' }, watch: [],
		// The changes A6 proposes are ones the owner allows, so its ok is accepted (review chui P2-3 checks this at ok).
		agent: { flavor: 'copilot', command: [], tools: [], effectTools: ['ado-repo_pull_request_thread_write'] }, maxParallel: 1, nudgeEveryMin: 30,
	})
	item(store, 'A1', 'Priya Shah', 'Meeting options', {
		createdAt: ago(1200), chat: { id: '19:mo@thread.v2', name: 'Meeting options', test: false, group: true, guests: true },
		lastAsk: "Why are the meeting options locked for my team? I can't change who can bypass the lobby anymore.",
		earlier: 'Last time, Oct 3 (A4): asked about recording retention.',
		draft: { text: 'They are locked by the tenant policy we rolled out on Oct 10. Org admins set lobby bypass now, not meeting organizers. If your team needs an exception, file it on the Meeting Policy form.', commitment: false, sources: [{ ref: 'card:meeting-options/decisions#k3', tier: 'card', origin: 'extracted' }, { ref: 'https://teams.microsoft.com/l/message/policy/1', tier: 'live', origin: 'extracted', label: 'Ana, Oct 10' }, { ref: '/notes/ana.md', tier: 'private', origin: 'extracted', label: '1:1 with Ana, Oct 9', stale: true }] },
		decision: { action: 'draft', reason: 'The knowledge answers it, but the chat has guests', confidence: 'high' },
		notes: [{ q: 'Did we announce the exception form anywhere?', a: 'Yes. Ana posted it in "Policy rollout" on Oct 11 and pinned it. Priya is not in that channel.', sources: [{ ref: 'https://teams.microsoft.com/l/message/policy/2', tier: 'live', origin: 'extracted', label: 'Ana in Policy rollout' }], at: ago(30) }],
	})
	item(store, 'A2', 'Ravi Kumar', 'Banner v2', {
		createdAt: ago(1100), lastAsk: 'When will the banner fix ship? Customers keep asking support.', question: 'Which date can you commit to?',
		context: [{ label: 'Last status', text: 'Fix merged to main Oct 16, waiting on ring 1.', tone: 'info' }, { label: 'Rollout', text: 'Ring 3 needs one clean week after ring 1.', tone: 'warn' }],
		decision: { action: 'draft', reason: 'It commits you to a date and no date is known', confidence: 'low' }, gaps: ['error.png (image)'],
	})
	item(store, 'A3', 'Ana Costa', 'Banner v2', {
		createdAt: ago(600), lastAsk: 'Should we use flag A or B for the rollout?',
		choices: { prompt: 'Which flag for the rollout?', options: [
			{ label: 'Flag A · BannerV2Ring', note: 'Already in ring 1. Can stop per ring.', reply: 'Let’s use flag A. It has per-ring control, so we can stop at ring 1 if anything looks off.' },
			{ label: 'Flag B · BannerV2Global', note: 'Simpler, but all or nothing.', reply: 'Let’s use flag B. It is simpler, and we do not need per-ring control here.' }], other: true },
		context: [{ label: 'Decided Oct 12', text: 'Ship behind a flag to ring 1 first.', tone: 'info' }],
		decision: { action: 'draft', reason: 'A product decision only you can make', confidence: 'medium' },
	})
	item(store, 'A4', 'Sam Lee', 'Demo prep', {
		createdAt: ago(500), lastAsk: 'Which of these do you want in the demo: search, filters, export?',
		choices: { prompt: 'Pick what goes in the demo', multi: true, options: [{ label: 'Search', note: 'Ready. Demoed last sprint.' }, { label: 'Filters', note: 'Behind a flag. 2 bugs open.' }, { label: 'Export', note: 'Ready since Oct 14.' }] },
		decision: { action: 'draft', reason: 'It decides what your team shows', confidence: 'medium' },
	})
	const start = new Date(); start.setHours(15, 0, 0, 0)
	item(store, 'A5', 'Arun Mehta', 'API review', {
		createdAt: ago(100), chat: { id: '19:api@thread.v2', name: 'API review', test: false, group: false }, lastAsk: 'Shall we meet at 3 pm today to discuss the API changes?', question: 'Arun wants to meet. Do you?',
		meeting: { subject: 'API changes', start: start.toISOString(), minutes: 30, attendees: ['Arun Mehta', 'Robin Park'] },
		context: [{ label: 'Conflict', text: 'You have "1:1 with Ana" at 3:00 to 3:30 PM.', tone: 'warn' }, { label: 'Could be async', text: 'He listed two questions in the thread.', tone: 'info' }],
		choices: { prompt: 'Arun wants to meet. Do you?', options: [
			{ label: 'Meet at 3:00', note: 'Conflicts with 1:1 with Ana', reply: 'Sounds good, sent an invite for 3.', effects: [{ system: 'calendar', action: 'create_event', target: 'Your calendar', summary: 'Invite: API changes, today 3:00 to 3:30 PM', call: { tool: 'calendar-CreateEvent', args: { subject: 'API changes', start: '15:00', minutes: 30 } } }] },
			{ label: 'Meet at 4:00 instead', note: 'First free slot today', reply: '3 doesn’t work for me, sent an invite for 4.', effects: [{ system: 'calendar', action: 'create_event', target: 'Your calendar', summary: 'Invite: API changes, today 4:00 to 4:30 PM', call: { tool: 'calendar-CreateEvent', args: { subject: 'API changes', start: '16:00', minutes: 30 } } }] },
			{ label: 'Answer async', note: 'Reply without a meeting', reply: 'Can we do this async? Send me the two questions and I’ll answer today.' }], other: true },
		decision: { action: 'draft', reason: 'Meetings always need you', confidence: 'high' },
	})
	const effects = [
		{ system: 'ado', action: 'comment', target: 'src/banner/banner.tsx:42', summary: 'Check props.user before use. It is undefined for guests.', payload: { text: 'const name = props.user.displayName;' }, call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', repositoryId: 'web', pullRequestId: 1234, filePath: 'src/banner/banner.tsx', rightFileStartLine: 42, content: 'Check props.user before use. It is undefined for guests.' } } },
		{ system: 'ado', action: 'comment', target: 'src/banner/useBanner.ts:18', summary: 'This effect subscribes on every render. Add [userId] as the dependency.', call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', repositoryId: 'web', pullRequestId: 1234, filePath: 'src/banner/useBanner.ts', rightFileStartLine: 18, content: 'This effect subscribes on every render. Add [userId] as the dependency.' } } },
	]
	store.saveJob({ schema: 1, id: 'j-a6', key: 'pr:1234', goal: 'Reviewed PR 1234 · Banner: remember dismiss state', session: { agent: 'copilot', id: 'sj' }, state: 'done', purpose: 'work', parents: ['w-A6'], asks: [], intent: 'pr_review', result: { summary: '2 findings', effects }, createdAt: ago(80), updatedAt: ago(80) } as never)
	item(store, 'A6', 'Vikram Nair', 'Banner v2', {
		createdAt: ago(90), lastAsk: 'Can you review PR 1234 when you get a chance?', intent: 'pr_review', job: 'j-a6', effects: effects.map(e => ({ ...e })),
		draft: { text: 'Left 2 comments on PR 1234: a null check for guests, and an effect dependency. The first one blocks.', commitment: false, sources: [{ ref: 'https://dev.azure.com/x/pullrequest/1234', tier: 'live', origin: 'extracted' }] },
		decision: { action: 'draft', reason: 'Posting comments changes something outside the chat', confidence: 'high' },
	})
	// Lists: running, watching, done (one undoable), knowledge, an automation, and a health problem.
	item(store, 'A7', 'Meera Iyer', 'Release sync', { state: 'running', status: 'Reviewing PR 1301 · Flag SDK 4.2', createdAt: ago(8), waitingSince: ago(6) })
	item(store, 'A8', 'Robin Park', 'Watching', { kind: 'tracker', state: 'waiting_on_task', lastAsk: 'Watch PR 9000 checks until merged', status: 'Checks passing', changedAt: ago(20) })
	item(store, 'A9', 'Meera Iyer', 'Release sync', { state: 'done', intent: 'status_next_step', draft: { text: 'The release notes are in the Release 26.10 wiki page, section 3.', commitment: false, sources: [] }, sent: { msgId: 'x9', at: ago(3), byRule: 'r1', undoUntil: soon(4) }, status: 'Sent by rule r1' })
	item(store, 'A10', 'Tom Becker', 'Design crit', { state: 'done', intent: 'status_next_step', draft: { text: 'Yes, the spacing tokens are final.', commitment: false, sources: [] }, sent: { msgId: 'x10', at: ago(40) }, status: 'Sent' })
	item(store, 'A11', 'Lena Fischer', 'Search', { state: 'done', intent: 'status_next_step', draft: { text: 'Debounce is 250 ms.', commitment: false, sources: [] }, sent: { msgId: 'x11', at: ago(50) }, effects: [{ system: 'ado', action: 'create_task', target: 'Search board', summary: 'Task 5374410: Update search config docs', done: { at: ago(50) } }], status: 'Sent' })
	propose(store, knowledgeOf(store, store.config()), [
		{ topic: 'Banner fix', type: 'decision', text: 'Ship behind a flag to ring 1 first; ring 3 after one clean week.', src: [{ link: 'https://teams.microsoft.com/l/message/b/7', date: '2026-10-12', who: 'Vikram' }] },
		{ topic: 'Banner fix', type: 'owner', text: 'Ana owns the banner component.', src: [{ link: 'https://teams.microsoft.com/l/message/b/8', date: '2026-10-13', who: 'Ana' }] },
	], 'bootstrap', 'your Teams chats')
	const r = proposeAutomation(store, { to: 'Arun Mehta', text: 'Please update the API design doc.', every: 'week', day: 5, at: '11:00' })
	const code = r.split(' ')[0]
	if (store.automation(code)) answerAutomation(store, store.automation(code)!, { id: '', code, verb: 'ok', surface: 'chat', at: '' })
	store.setHealth('source', 'Delegate cannot reach Teams from this machine.')
	return store
}

// The new experience (N1a): on top of seedInbox, one thread of every row kind on Now, with every marker that has data today.
// Reading is ok (a good read a minute ago), so Working is honest about what runs next.
export function seedNext(store: Store, ui: 'new' | 'classic' | undefined = 'new', base = true) {
	if (base) seedInbox(store)
	store.saveConfig({ ...store.config(), aliases: ['RP'] } as never)
	store.saveChats({ startedAt: ago(600), seen: {}, readAt: ago(1), goodAt: ago(1) })
	const job = (id: string, over: Record<string, unknown>) => store.saveJob({ schema: 1, id, key: `k-${id}`, goal: 'Work', session: { agent: 'copilot', id: `s-${id}` }, state: 'queued', purpose: 'work', parents: [], asks: [], createdAt: ago(30), updatedAt: ago(30), ...over } as never)
	const work = (over: Record<string, unknown>) => ({ goal: 'Ship the fix', doneWhen: 'merged', steps: [{ at: ago(300), what: 'Replied: on it.' }], links: [], ...over })
	// The tracker from seedInbox gets its watch job, so it waits between checks.
	job('j-a8', { goal: 'Watch PR 9000 checks', state: 'done', every: 60, nextAt: soon(40), result: { summary: 'All 4 checks pass', effects: [], at: ago(22) }, updatedAt: ago(20) })
	store.save({ ...store.byCode('A8')!, job: 'j-a8', changedAt: ago(20) }, false)
	item(store, 'A20', 'Kim Lane', 'Spec review', { createdAt: ago(85), before: true, chat: { id: '19:spec@thread.v2', name: 'Spec review', test: false, group: true, guests: true }, lastAsk: 'Is the draft plan final?', draft: { text: 'Yes, the plan is final. Launch stays on Oct 24.', commitment: false, sources: [] } })
	job('j-a21', { goal: 'Recheck PR 2201 for Rita', state: 'done', result: { summary: 'not done' } })
	item(store, 'A21', 'Rita Vale', 'Release sync', { createdAt: ago(80), job: 'j-a21', lastAsk: 'Can you recheck PR 2201?', draft: { text: 'Still checking PR 2201. I will get back to you by noon.', commitment: false, sources: [], holding: true } })
	job('j-a22', { goal: 'Review PR 2204 for Dev', state: 'failed', error: 'tool not found: diff-tool' })
	item(store, 'A22', 'Dev Moss', 'Team chat', { createdAt: ago(75), state: 'waiting_on_task', job: 'j-a22', lastAsk: 'Can you review PR 2204?' })
	item(store, 'A23', 'Pete Hale', 'Widget sync', { createdAt: ago(70), state: 'open', status: 'In progress', work: work({ goal: 'Test sign-up on the new form', next: { who: 'you', what: 'Try the new sign-up form on staging' } }) })
	job('j-a24', { goal: 'Reviewing PR 1301 for Dev', state: 'running', updatedAt: ago(4) })
	item(store, 'A24', 'Dev Moss', 'Team chat', { createdAt: ago(10), state: 'waiting_on_task', job: 'j-a24', waitingSince: ago(4), lastAsk: 'Please review PR 1301' })
	job('j-a25', { goal: 'Recheck PR 2202 for Alex', state: 'queued', retry: { at: soon(90), n: 1, total: 1, firstAt: ago(20), last: { kind: 'transient', why: 'ADO 503', tried: [] }, tried: [] } })
	item(store, 'A25', 'Alex Fern', 'Release sync', { createdAt: ago(60), state: 'waiting_on_task', job: 'j-a25', lastAsk: 'Recheck PR 2202 please' })
	item(store, 'A26', 'Dev Moss', 'Dev Moss', { createdAt: ago(400), state: 'open', status: 'In progress', work: work({ goal: "Dev's spec review", next: { who: 'me', what: 'Review the spec and send comments' } }) })
	item(store, 'A27', 'Lin Brook', 'Incident 123', { createdAt: ago(500), state: 'open', status: 'Waiting on the vendor', work: work({ goal: 'A fix for incident 123', next: { who: 'them', what: 'The vendor posts a fix for incident 123' }, waitingOn: { who: 'The vendor', since: ago(500) } }) })
	item(store, 'A28', 'Sam Wren', 'Sam Wren', { createdAt: ago(90), state: 'waiting_on_sender', lastAsk: 'Can you send me the deck?', decision: { action: 'ask', reason: 'Which deck Sam means: the Q3 review or the roadmap', confidence: 'medium' } })
	job('j-a29', { goal: 'Watch PR 2203 until merged', state: 'done', every: 60, nextAt: soon(30), endsAt: soon(3 * 1440), result: { summary: '1 of 2 approvals, build green', effects: [], at: ago(25) }, updatedAt: ago(15) })
	item(store, 'A29', 'Robin Park', 'Watching', { createdAt: ago(800), kind: 'tracker', state: 'waiting_on_task', job: 'j-a29', lastAsk: 'Watch PR 2203 until merged', status: '1 of 2 approvals · build green', changedAt: ago(15), ackAt: ago(60) })
	const fyi = (code: string, name: string, line: string, weight: 'high' | 'normal', min: number, gist?: string) => item(store, code, name, 'Design notes', { createdAt: ago(min), state: 'done', intent: 'fyi', status: 'cc', fyi: { line, weight, at: ago(min), ...(gist ? { gist } : {}) }, updatedAt: ago(min) })
	fyi('A30', 'Kim Lane', "Kim shared the draft plan for Thursday's review", 'high', 30, 'Two options; the launch date stays Oct 24. Nothing asked of you.')
	fyi('A31', 'Rita Vale', 'Rita moved standup to 10:30', 'normal', 40)
	fyi('A32', 'Dev Moss', 'Dev posted the config PR', 'normal', 50)
	fyi('A33', 'Pete Hale', 'Pete thanked the team', 'normal', 55)
	item(store, 'A34', 'Lin Brook', 'Release sync', { createdAt: ago(3000), work: work({ goal: 'Error logs from Lin', waitingOn: { who: 'Lin Brook', since: ago(3000) }, steps: [{ at: ago(65), what: 'You asked Lin for the error logs' }] }), question: 'No news on "Error logs from Lin" since Monday. Answer "A34: nudge them", "wait A34: 3d", or "close A34".', status: 'No news since Monday' })
	item(store, 'A35', 'Rita Vale', 'Team chat', { createdAt: ago(45), startedBy: 'room', lastAsk: 'Can someone share the release notes?', draft: { text: 'The release notes are on the Release 26.10 wiki page.', commitment: false, sources: [] } })
	item(store, 'A36', 'Alex Fern', 'Alex Fern', { createdAt: ago(5), state: 'scheduled', sendAt: soon(3), decision: { action: 'send', ruleId: 'R3', reason: 'rule', confidence: 'high' }, lastAsk: 'Is the build green?', draft: { text: 'Yes, build 512 is green.', commitment: false, sources: [] } })
	item(store, 'A37', 'Pete Hale', 'Widget sync', { createdAt: ago(35), work: work({ goal: 'Own the sign-up test plan', doneWhen: 'the test plan is shared with the team', proposed: true }), lastAsk: "I'd be the POC for the test plan", question: 'Track this?' })
	// W1 is the owner's ask on A34's work, so it is part of A34's row; W2 is an ask on its own.
	// A part of A23's work in another chat: the row says "+1 chat".
	item(store, 'A38', 'Dev Moss', 'Dev Moss', { createdAt: ago(60), state: 'open', status: 'Part of A23', partOf: 'w-A23' })
	store.save({ ...store.byCode('A23')!, work: { ...store.byCode('A23')!.work!, parts: ['w-A38'] } }, false)
	store.saveWaiting([{ code: 'W1', chat: { id: '19:w@thread.v2', name: 'Release sync' }, msgId: '1700', at: ago(30 * 60), to: ['Lin Brook'], text: 'Can you send the error logs?', state: 'waiting', item: 'A34' }, { code: 'W2', chat: { id: '19:w2@thread.v2', name: 'Launch' }, msgId: '1701', at: ago(26 * 60), to: ['Dev Moss'], text: 'Can you share the launch numbers before Friday?', state: 'waiting' }])
	store.setHealth('source', undefined)
	if (ui) store.saveUi(ui)
	return store
}

// N2 on top of seedNext (R-NEX-05, R-NEX-07): validate work whose next step is the owner's after a deploy a build check saw done
// (A40), work waiting on Dev's deploy with the owner's step after it (A41), and a sent reply that left the owner a to-do (A42).
export function seedOwned(store: Store) {
	const job = (id: string, over: Record<string, unknown>) => store.saveJob({ schema: 1, id, key: `k-${id}`, goal: 'Work', session: { agent: 'copilot', id: `s-${id}` }, state: 'done', purpose: 'work', parents: [], asks: [], createdAt: ago(3000), updatedAt: ago(55), ...over } as never)
	job('j-a40', { key: 'pr:acme/web/4200002', intent: 'validate', goal: 'Validate PR 4200002 against the new payment service' })
	item(store, 'A40', 'Pete Hale', 'Checkout sync', {
		createdAt: ago(3000), state: 'open', status: 'In progress', intent: 'validate', job: 'j-a40', lastAsk: 'Can you test your checkout flows against the new payment service?',
		work: {
			goal: 'Checkout flows 1 and 2 work against the new payment service, or what blocks them is reported', doneWhen: 'You post a verdict in Checkout sync', links: ['pr:4200002'],
			next: { who: 'you', what: 'Test checkout flows 1 and 2 on staging2' },
			plan: [
				{ id: 'p1', what: 'Route the staging ring to the dev instance (PR 4200002)', who: 'you', done: ago(2900) },
				{ id: 'p2', what: 'Deploy build 991 to staging2', who: 'me', done: ago(55), probe: { build: 991, project: 'Globex' }, seen: 'completed:succeeded', ring: { name: 'staging2', pipelineId: 3003, project: 'Globex', run: 991 } },
				{ id: 'p3', what: 'Test checkout flow 1', who: 'you' },
				{ id: 'p4', what: 'Test checkout flow 2', who: 'you' },
				{ id: 'p5', what: 'Report the result in Checkout sync', who: 'you' },
			],
			steps: [{ at: ago(3000), what: 'Started: test checkout flows 1 and 2 against the new payment service' }, { at: ago(120), what: 'Deployed: Deploy build 991 to staging2: run 991' }, { at: ago(55), what: 'Build 991 succeeded (Deploy build 991 to staging2)', news: true }],
		},
	})
	item(store, 'A41', 'Kim Lane', 'Payments sync', {
		createdAt: ago(1500), state: 'open', status: 'In progress', lastAsk: 'Can you test the refund flow once Dev deploys?',
		work: {
			goal: 'The refund flow works on staging3', doneWhen: 'You tell Kim the result', links: [], steps: [{ at: ago(1500), what: 'Started: test the refund flow on staging3' }],
			next: { who: 'them', what: 'Deploy build 992 to staging3' }, waitingOn: { who: 'Dev', since: ago(200) },
			plan: [{ id: 'p1', what: 'Deploy build 992 to staging3', who: 'them' }, { id: 'p2', what: 'Test both, report by Fri', who: 'you' }],
		},
	})
	const sent = ago(2 * 1440)
	item(store, 'A42', 'Rita Vale', 'Release sync', { createdAt: ago(2 * 1440 + 30), state: 'done', status: 'Sent: "Yes, I will update the checklist today."', lastAsk: 'Can you update the release checklist?', sent: { msgId: 'm-a42', at: sent, text: 'Yes, I will update the checklist today.' }, todos: ['Update the release checklist in the wiki'], kept: [{ id: 't1', text: 'Update the release checklist in the wiki', at: sent }], updatedAt: sent })
	return store
}

// Nothing open: the new page's quiet state. moving adds one ask nobody answered, so Your move is empty while something waits.
export function seedQuiet(store: Store, moving = false) {
	store.saveConfig({ schema: 1, owner: { id: 'me', name: 'Robin Park' }, source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: [], tools: [] } } as never)
	store.saveChats({ startedAt: ago(600), seen: {}, readAt: ago(1), goodAt: ago(1) })
	if (moving) store.saveWaiting([{ code: 'W1', chat: { id: '19:w@thread.v2', name: 'Release sync' }, msgId: '1700', at: ago(120), to: ['Lin Brook'], text: 'Can you send the error logs?', state: 'waiting' }])
	store.saveUi('new')
	return store
}

// Pause as the pause command does (runner/apply.ts control): a scheduled send goes back to the owner, held by the pause.
export function pauseNext(store: Store) {
	store.saveControl({ ...store.control(), paused: true, stopped: false })
	for (const w of store.workflows().filter(w => w.state === 'scheduled')) store.save({ ...w, state: 'needs_human', sendAt: undefined, held: 'paused', status: 'Held: you paused' }, false)
	return store
}

// The Numbers tab (R-NEX-11): eight weeks of Delegate's own log on a second machine ('pc'), and the items it names, all made up.
// Handled per week, oldest first: 0 (before the first read), 3, 5, 8, 11, 9, 12, and this week 4, so This week is a small
// sample (counts, no arrow) and Last 4 weeks has an arrow. The Saturday and Sunday two weeks ago had no read. This week also has
// an edited reply, two replies typed in Teams, a send too old to check, a reply marked wrong, a message the owner pointed at
// that became an item, one that never did, and a Catch up line moved to Needs me. Items are written without a state line, so
// the log holds only what is seeded here. first: only this week, for "Your first week".
export function seedNumbers(store: Store, now = new Date(), first = false) {
	store.saveConfig({ ...store.config(), tz: 'UTC' } as never)
	const DAY = 86_400_000, MIN = 60_000, t0 = now.getTime(), today = Date.parse(now.toISOString().slice(0, 10))
	const week = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY
	const iso = (ms: number) => new Date(ms).toISOString()
	const lines: Record<string, unknown>[] = []
	const log = (ms: number, line: Record<string, unknown>) => { if (ms <= t0) lines.push({ at: iso(ms), ...line }) }
	const PEOPLE = ['Kim Lane', 'Rita Vale', 'Dev Moss', 'Alex Fern', 'Pete Hale', 'Lin Brook'], CHATS = ['Acme launch', 'Globex sync', 'Team chat']
	const ASKS = ['Is the build green for the Acme release?', 'Can you confirm the Globex demo is on Thursday?', 'Can you review PR 2210?', 'Where are the release notes?', 'Did the config change go out?', 'Can you share the test plan?']
	const SAID = ['Yes, build 512 is green.', 'Confirmed: Thursday at 10.', 'Reviewed it and left two comments.', 'They are on the release wiki page, section 3.', 'Yes, it went out this morning.', 'Shared it in the channel just now.']
	let n = 60
	const dir = join(store.root, 'state', 'workflows'); mkdirSync(dir, { recursive: true })
	const make = (ms: number, over: Partial<Workflow> = {}) => {
		const i = n, code = `A${n++}`, name = PEOPLE[i % PEOPLE.length], chat = CHATS[i % CHATS.length]
		const wf = { schema: 1, id: `w-${code}`, code, kind: 'reply', state: 'done', intent: 'status_next_step', key: { type: 'thread', id: `t-${code}` }, chat: { id: `19:${chat.replace(/\W/g, '').toLowerCase()}@thread.v2`, name: chat, test: false, group: true }, asker: { id: name.toLowerCase(), name }, session: { agent: 'copilot', id: `s-${code}` }, lastMsgId: `m-${code}`, pending: [], msgIds: [`m-${code}`], newCount: 0, status: 'Sent', lastAsk: ASKS[i % ASKS.length], createdAt: iso(ms - 30 * MIN), updatedAt: iso(ms), revAt: iso(ms), ...over } as Workflow
		writeFileSync(join(dir, `${wf.id}.json`), JSON.stringify(wf))
		log(ms - 30 * MIN, { event: 'state', workflowId: wf.id, code, from: 'new', to: 'running' })
		return { code, text: SAID[i % SAID.length], wf }
	}
	const ask = (ms: number, k: number) => iso(ms - (6 + k * 9) * MIN)
	const reply = (ms: number, k: number, edited = false) => { const x = make(ms); writeFileSync(join(dir, `${x.wf.id}.json`), JSON.stringify({ ...x.wf, draft: { text: x.text, commitment: false, sources: [] }, sent: { msgId: `s-${x.code}`, at: iso(ms), text: x.text } })); log(ms, { event: 'sent', code: x.code, approvedBy: 'owner', v: 2, unchanged: !edited, edited, msgId: `s-${x.code}`, askAt: ask(ms, k) }); return x }
	const handled = (ms: number, k: number) => {
		if (k % 4 === 1) {
			const x = make(ms, { intent: 'pr_review', effects: [{ system: 'ado', action: 'comment', target: 'PR 2210', summary: 'Two comments on PR 2210', done: { at: iso(ms) } }] as never, sent: { msgId: `s-${n - 1}`, at: iso(ms + MIN), text: 'Reviewed PR 2210 and left two comments.' } })
			log(ms, { event: 'job-executed', items: [x.code], kept: 2, removed: 0, left: 0 })
			log(ms + MIN, { event: 'sent', code: x.code, approvedBy: 'owner', v: 2, unchanged: true, edited: false, msgId: `s-${n - 1}`, askAt: ask(ms, k) })
		} else if (k % 4 === 3) {
			const x = make(ms, { closedBy: 'job', status: 'Nothing needed: the PR merged before the review' } as never)
			log(ms, { event: 'state', code: x.code, from: 'running', to: 'done', closedBy: 'job' })
		} else reply(ms, k)
	}
	const teams = (ms: number, k: number) => { const x = make(ms, { closedBy: 'replied', status: 'You replied yourself' } as never); log(ms, { event: 'state', code: x.code, from: 'needs_human', to: 'done', closedBy: 'replied', askAt: ask(ms, k + 3), replyAt: iso(ms - 2 * MIN) }) }
	const COUNTS = first ? [0, 0, 0, 0, 0, 0, 0, 4] : [0, 3, 5, 8, 11, 9, 12, 4]
	const start = week - (7 - COUNTS.findIndex(c => c > 0)) * 7 * DAY
	// A read every day from the first week on, but for the gap two weeks ago.
	for (let d = start; d <= today; d += DAY) if (first || !(d === week - 9 * DAY || d === week - 8 * DAY)) log(Math.min(d + 8 * 3_600_000, t0 - MIN), { event: 'tick' })
	COUNTS.forEach((c, i) => {
		const ws = week - (7 - i) * 7 * DAY, last = i === 7, span = t0 - ws
		const at = (k: number, of: number) => (last ? ws + Math.floor(span * (k + 1) / (of + 2)) : ws + (k % 5) * DAY + 10 * 3_600_000 + k * 13 * MIN)
		for (let k = 0; k < c; k++) handled(at(k, c + 6), k)
		if (last || (!first && c && i >= 4)) {
			reply(at(c, c + 6), c, true)
			teams(at(c + 1, c + 6), c)
		}
		if (last) {
			teams(at(c + 2, c + 6), c + 1)
			// A send from before sends said whether they were edited, whose words are gone: it can no longer be checked.
			const old = make(at(c + 3, c + 6)); log(at(c + 3, c + 6), { event: 'sent', code: old.code, approvedBy: 'owner', unchanged: true, msgId: `s-${old.code}` })
			// A reply that went out as drafted, then marked wrong: not handled, and a correction.
			const wrong = reply(at(c + 4, c + 6), c + 2); log(at(c + 5, c + 6), { event: 'marked', code: wrong.code, kind: 'wrong', sentId: `s-${wrong.code}` })
			// Missed: a message the owner pointed at that became an item, one that never did, and a Catch up line moved to Needs me.
			const seen = make(at(c + 5, c + 6), { state: 'needs_human', status: 'Needs you', msgIds: ['m-pointed'] }); log(at(c + 5, c + 6), { event: 'missed', chat: seen.wf.chat.id, msgId: 'm-pointed' })
			log(at(c + 5, c + 6), { event: 'missed', chat: '19:globexsync@thread.v2', msgId: '1760000000001' })
			const fyi = make(at(c + 2, c + 6), { state: 'needs_human', status: 'Needs you', intent: 'fyi' }); log(at(c + 5, c + 6), { event: 'notfyi', code: fyi.code })
		}
	})
	mkdirSync(join(store.root, 'state', 'log'), { recursive: true })
	for (const l of lines) appendFileSync(join(store.root, 'state', 'log', `${String(l.at).slice(0, 10)}-pc.jsonl`), JSON.stringify(l) + '\n')
	return store
}

// What a change means, and what to do when one fails, is dropped, or went stale (the page side of next action and owned work).
// On top of seedInbox: a vote whose approval may complete its PR, a deploy with its ring, a failed comment, a vote dropped
// because its PR completed, and a vote whose PR changed since the review. Made-up people, PRs, and pipelines only.
export function seedChanges(store: Store, ui: 'new' | 'classic' = 'classic') {
	seedInbox(store)
	const cfg = store.config()
	const none = { command: 'delegate-test-no-such-server' }
	store.saveConfig({ ...cfg, agent: { ...cfg.agent, tools: ['ado-repo_pull_request'], effectTools: ['ado-repo_pull_request_thread_write', 'ado-repo_pull_request_write:vote'], mcpServers: { ado: none, calendar: none } }, deploy: { allowed: [{ pipelineId: 3003, ring: 'TEST3', project: 'Globex', name: 'Web-deploy-test3' }] } } as never)
	if (ui === 'new') store.saveUi('new', true)
	const vote = (id: number, over: Record<string, unknown> = {}) => ({ system: 'ado', action: 'approve', target: `PR ${id}`, summary: `Approve PR ${id}`, call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', project: 'Globex', repositoryId: 'web', pullRequestId: id, vote: 'Approved' } }, head: 'c0ffee1', ...over })
	const comment = (id: number, content: string, over: Record<string, unknown> = {}) => ({ system: 'ado', action: 'comment', target: `PR ${id}`, summary: content, call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', repositoryId: 'web', pullRequestId: id, content } }, ...over })
	const withJob = (code: string, who: string, chat: string, pr: number, effects: Record<string, unknown>[], over: Partial<Workflow>) => {
		store.saveJob({ schema: 1, id: `j-${code}`, key: `pr:${pr}`, goal: `Reviewed PR ${pr}`, session: { agent: 'copilot', id: `sj-${code}` }, state: 'done', purpose: 'work', parents: [`w-${code}`], asks: [], intent: 'pr_review', result: { summary: 'Reviewed', effects }, createdAt: ago(40), updatedAt: ago(40) } as never)
		return item(store, code, who, chat, { createdAt: ago(45), intent: 'pr_review', job: `j-${code}`, effects: effects.map(e => ({ ...e })) as never, decision: { action: 'draft', reason: 'It changes something outside the chat', confidence: 'high' }, ...over })
	}
	withJob('A60', 'Dev Rao', 'Banner v2', 4200001, [vote(4200001, { pr: { title: 'Fix the banner', author: 'Dev Rao', required: ['Web Team'], autoComplete: true } })], {
		lastAsk: 'Can you approve the banner fix?', draft: { text: 'Looks good to me; approved.', commitment: false, sources: [] } })
	const at = ago(30)
	withJob('A61', 'Kim Ito', 'Release sync', 4200002, [{ system: 'ado', action: 'deploy', target: 'TEST3', summary: 'Deploy build 9100001 to TEST3', head: '3fa91c2e', deploy: { ring: 'TEST3', pr: 4200002 },
		call: { tool: 'ado-pipelines_write', args: { action: 'run_pipeline', project: 'Globex', pipelineId: 3003, resources: { pipelines: { ci: { runId: 9100001 } } } } },
		build: { id: 9100001, pr: 4200002, head: '3fa91c2e', version: '3fa91c2e', branch: 'refs/pull/4200002/merge', readAt: at },
		ring: { last: { id: 900, by: 'Pete Ross', at: '2026-10-20T08:10:00.000Z', status: 'completed', result: 'succeeded' }, running: [], readAt: at } }], {
		lastAsk: 'Can you put PR 4200002 on TEST3?', draft: { text: 'Deploying PR 4200002 to TEST3 now. I will share results after.', commitment: false, sources: [] } })
	withJob('A62', 'Rita Vale', 'Spec review', 4200004, [comment(4200004, 'The retry limit should come from config.', { error: 'ADO 503: the service is unavailable' })], {
		lastAsk: 'Can you look at PR 4200004?', draft: { text: 'Left one comment on PR 4200004: the retry limit should come from config.', commitment: false, sources: [] },
		status: 'Made 0 of 1 changes. Not done: comment on PR 4200004 (ADO 503: the service is unavailable). Reply "ok A62" to retry, or "ok A62 except 1" to send only the reply' })
	withJob('A63', 'Pia Lin', 'Config', 4200003, [vote(4200003, { off: true }), comment(4200003, 'Rename the flag before ring 1.')], {
		lastAsk: 'Can you approve the config PR?', draft: { text: 'Approved, with one note on the flag name.', commitment: false, sources: [] }, status: 'PR 4200003 is completed, so no vote is needed' })
	withJob('A64', 'Sam Lee', 'Search', 4200005, [vote(4200005)], {
		lastAsk: 'Can you approve the search PR?', draft: { text: 'Approved.', commitment: false, sources: [] },
		question: reviewAgain('A64', 'PR 4200005 changed since your review (new commits).'), status: 'PR 4200005 changed since your review' })
	return store
}
