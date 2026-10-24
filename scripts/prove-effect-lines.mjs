// Manual fictional chat journeys, outside the unit runner.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const root = mkdtempSync(join(tmpdir(), 'delegate-effect-lines-'))
for (const dir of ['local', 'copilot']) mkdirSync(join(root, dir))
Object.assign(process.env, { DELEGATE_ROOT: root, DELEGATE_LOCAL: join(root, 'local'), COPILOT_HOME: join(root, 'copilot') })
const { Store } = await import('../src/store/state.ts')
const { effectLine, effectResultLine, statusLine } = await import('../src/core/render.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const store = new Store({ root, machine: 'acme-pc' }), at = new Date().toISOString()
const comment = (action = 'create', id = 4200001) => ({ system: 'azure devops', action: 'comment', target: `PR ${id}`, summary: 'Ask about the limit',
  pr: { title: 'Acme limits', author: 'Kim', required: [], autoComplete: false },
  call: { tool: 'ado-repo_pull_request_thread_write', args: { action, project: 'Acme', repositoryId: 'widget', pullRequestId: id, content: 'Please check the limit.' } } })
const vote = value => ({ ...comment(), action: 'vote', call: { tool: 'ado-repo_pull_request_write',
  args: { action: 'vote', project: 'Acme', repositoryId: 'widget', pullRequestId: 4200001, vote: value } } })
const base = { schema: 1, id: 'acme-effect-item', code: 'A12', kind: 'reply', state: 'needs_human',
  key: { type: 'thread', id: 'acme-chat' }, chat: { id: 'acme-chat', name: 'Acme reviews', group: true, test: true },
  asker: { id: 'kim', name: 'Kim Example' }, session: { agent: 'copilot', id: randomUUID() },
  pending: [], msgIds: ['101'], lastMsgId: '101', lastAsk: 'Please check the limits.', status: 'Ready',
  draft: { text: 'The limits look good.', commitment: false, sources: [] }, newCount: 0, createdAt: at, updatedAt: at,
  effects: [comment(), comment('reply'), vote('Approved')] }
let checks = 0
function check(actual, expected) {
  assert.equal(actual, expected)
  assert(!actual.includes('\u00d7'))
  assert(!actual.includes("A12's"))
  assert(!/\bA12\b/.test(actual.split('Say ')[0]))
  checks++
}
check(effectLine([comment()]), 'post a comment on PR 4200001 (Acme limits)')
check(effectLine(base.effects, 'doing'), 'posting 2 comments on PR 4200001 (Acme limits) and approving it')
check(effectLine([comment('update')]), 'edit a comment on PR 4200001 (Acme limits)')
check(effectLine([comment('update_status')]), 'resolve a thread on PR 4200001 (Acme limits)')
check(effectLine([vote('WaitingForAuthor')]), 'mark PR 4200001 (Acme limits) "wait for author"')
check(effectLine([vote('ApprovedWithSuggestions')]), 'approve PR 4200001 (Acme limits) with suggestions')
check(effectLine([vote('Rejected')]), 'reject PR 4200001 (Acme limits)')
check(effectLine([vote('NoVote')]), 'reset your vote on PR 4200001 (Acme limits)')
check(effectLine([comment(), comment('create', 4200002), vote('Approved')]), 'post a comment on PR 4200001 (Acme limits) and post a comment on PR 4200002 (Acme limits) and approve PR 4200001 (Acme limits)')
check(effectResultLine(base, 'running'), 'Posting 2 comments on PR 4200001 (Acme limits) and approving it, then replying to Kim in Acme reviews.')
const done = { ...base, effects: base.effects.map(e => ({ ...e, done: { at, ref: 'posted' } })) }
check(effectResultLine(done, 'done'), 'Done: posted 2 comments on PR 4200001 and approved it, then replied to Kim in Acme reviews.')
check(statusLine({ ...done, job: 'acme-job', draft: undefined }), 'Done: posted 2 comments on PR 4200001 (Acme limits) and approved it. No reply was needed.')
check(effectResultLine(base, 'held', 'PR 4200001 changed since the review'), 'Nothing was posted or sent yet for Kim in Acme reviews: PR 4200001 changed since the review. Say ok A12 when ready.')
const partial = { ...base, job: 'acme-job', effects: [{ ...comment(), done: { at } }, { ...comment(), error: 'network timeout' }] }
check(statusLine(partial), "Posted 1 of 2 comments on PR 4200001. The other didn't post: Azure DevOps wasn't reachable. Your reply to Kim wasn't sent; it waits for you. Say ok A12 to try again.")
check(statusLine({ ...partial, draft: { ...partial.draft, preview: true } }),
  "Posted 1 of 2 comments on PR 4200001. The other didn't post: Azure DevOps wasn't reachable. Your reply to Kim wasn't sent; it waits for you. Say ok A12 to try again.")
check(statusLine({ ...base, job: 'acme-job', effects: [{ ...comment(), error: 'network timeout' }] }),
  "Couldn't post on PR 4200001: Azure DevOps wasn't reachable. Nothing was sent to Kim. Say ok A12 to try again.")
check(statusLine({ ...base, job: 'acme-job', effects: [{ ...comment(), maybe: true }] }),
  "Not sure the comment reached PR 4200001: Azure DevOps didn't answer. Check the PR before trying again. Nothing was sent to Kim.")
check(effectResultLine(base, 'reply-only'), 'Sent your reply to Kim in Acme reviews. Nothing was posted on PR 4200001.')
check(effectResultLine({ ...base, chat: { ...base.chat, group: false } }, 'reply-only'), 'Sent your reply to Kim. Nothing was posted on PR 4200001.')
assert.equal(effectLine([{ system: 'acme', action: 'other', target: 'Acme', summary: 'Keep this unknown action' }]), 'Keep this unknown action')
assert(!effectResultLine(base, 'failed', 'Error: ado-tool_write job:0123456789abcdef head').includes('0123456789abcdef'))
const titled = comment(); titled.pr.title = 'x'.repeat(80)
assert.equal(/\(([^)]+)\)/.exec(effectLine([titled]))[1].length, 40)
check(effectLine([{ ...comment(), call: { tool: 'ado-wit_work_item_write', args: { action: 'update', id: 123, updates: [] } } }], 'done'), 'updated work item 123')
check(effectLine([{ ...comment(), call: { tool: 'calendar-CreateEvent', args: {
  subject: 'Acme review', startDateTime: '2026-10-25T09:00:00Z', timeZone: 'UTC' } } }], 'doing'),
  'creating "Acme review" for 2026-10-25 09:00:00Z (UTC)')

const cfg = { schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' }, watch: [],
  agent: { flavor: 'copilot', command: ['fictional'], tools: [], host: false,
    effectTools: ['ado-repo_pull_request_thread_write', 'ado-repo_pull_request_write:vote'] } }
store.saveConfig(cfg)
store.saveControl({ paused: false, stopped: false, autoSend: false })
const messages = []
const source = { selfChatId: 'self', sendSelf: async text => { messages.push(text); return { msgId: '201' } },
  send: async () => { throw new Error('Receipt proof must not send the reply') }, recent: async () => [],
  newMessages: async () => ({ msgs: [], truncated: false }), presence: async () => ({ availability: 'Away' }), close: async () => {} }
const procs = { alive: () => false, windowAlive: () => false, kill: () => { throw new Error('Unexpected process') } }
store.saveJob({ schema: 1, id: 'acme-job', key: 'pr:4200001', goal: 'Check the limit', state: 'done', purpose: 'work',
  parents: [base.id], asks: [], session: { agent: 'copilot', id: randomUUID() }, result: { effects: [comment()], summary: 'Ready' }, createdAt: at, updatedAt: at })
store.save({ ...base, job: 'acme-job', effects: [comment()] }, false)
store.saveThread(base.id, [{ id: '101', at, from: base.asker, text: base.lastAsk, byOwner: false }])
store.writeAnswer({ code: base.code, verb: 'ok', surface: 'self' })
await applyAnswers(store, source, cfg, procs)
assert(messages.some(text => text.includes('Posting a comment on PR 4200001 (Acme limits), then replying to Kim in Acme reviews.')), JSON.stringify(messages))
assert.equal(store.job('acme-job').purpose, 'execute')
assert.equal(store.workflow(base.id).state, 'waiting_on_task')
assert.equal(messages.filter(text => text.includes('Posting')).length, 1)
assert(!messages.some(text => text.includes('\u00d7') || text.includes("A12's")))
console.log(`PASS ${checks} copy variants plus real apply/approval chat receipt; fictional root, no effect executed`)
console.log(`PROOF_ROOT ${root}`)
