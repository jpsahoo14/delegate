// Pure, fictional stored-report golden cases; no model, live root, runner or card writes.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeReport } from '../src/core/normalize-report.ts'
import type { NormalizedReport, StoredReport } from '../src/core/normalize-report.ts'
import type { Fact, Job, Report, Workflow } from '../src/core/types.ts'

type Golden = { id: string; stored: StoredReport; expected: NormalizedReport }
const empty = (): NormalizedReport => ({ context: [], findings: [], refused: [], todos: [] })
const finding = { label: 'Finding', text: 'The banner reads the name before handling a missing user.', tone: 'info' as const }
const rows: Golden[] = [
	{ id: 'empty', stored: {}, expected: empty() },
	{ id: 'review-finding', stored: { intent: 'pr_review', context: [{ ...finding, tone: 'warn' }] }, expected: { ...empty(), context: [finding], findings: [finding] } },
	{ id: 'review-no-tone', stored: { intent: 'pr_review', context: [{ label: 'Finding', text: finding.text }] }, expected: { ...empty(), context: [finding], findings: [finding] } },
	{ id: 'non-review-warning', stored: { intent: 'reply', context: [{ label: 'Calendar conflict', text: 'Robin has another meeting at noon.', tone: 'warn' }] }, expected: { ...empty(), context: [{ label: 'Calendar conflict', text: 'Robin has another meeting at noon.', tone: 'warn' }] } },
	{ id: 'gate-warning', stored: { intent: 'pr_review', context: [{ label: 'Not reviewing', text: 'You were not asked to review this PR.', tone: 'warn' }] }, expected: { ...empty(), context: [{ label: 'Not reviewing', text: 'You were not asked to review this PR.', tone: 'warn' }] } },
	{ id: 'gate-without-warning', stored: { intent: 'pr_review', context: [{ label: 'Not reviewing', text: 'You were not asked to review this PR.' }] }, expected: { ...empty(), context: [{ label: 'Not reviewing', text: 'You were not asked to review this PR.', tone: 'info' }] } },
	{ id: 'gate-vote-is-not-ci-noise', stored: { intent: 'pr_review', context: [{ label: 'Not reviewing', text: 'Your vote is already recorded.', tone: 'warn' }] }, expected: { ...empty(), context: [{ label: 'Not reviewing', text: 'Your vote is already recorded.', tone: 'warn' }] } },
	{ id: 'review-key-without-intent', stored: { key: 'pr:acme/aurora/1234', context: [finding] }, expected: { ...empty(), context: [finding], findings: [finding] } },
	{ id: 'recurring-watch-keeps-builds', stored: { key: 'pr:acme/aurora/1234', every: 10, context: [{ label: 'Build', text: 'The build is running.', tone: 'warn' }] }, expected: { ...empty(), context: [{ label: 'Build', text: 'The build is running.', tone: 'warn' }] } },
	{ id: 'non-review-ci-kept', stored: { intent: 'validate', context: [{ label: 'CI', text: 'Validation is complete.' }] }, expected: { ...empty(), context: [{ label: 'CI', text: 'Validation is complete.' }] } },
	{ id: 'non-review-check-status-kept', stored: { intent: 'validate', context: [{ label: 'Checks', text: 'Validation is running.', tone: 'warn' }] }, expected: { ...empty(), context: [{ label: 'Checks', text: 'Validation is running.', tone: 'warn' }] } },
	{ id: 'legacy-refusal-todo', stored: { todos: ['Post the comment on PR 1234. Not made for you: PR 1234 is not this item\'s PR (1235)', 'Send Kim the notes'] }, expected: { ...empty(), todos: ['Post the comment on PR 1234. Not made for you: PR 1234 is not this item\'s PR (1235)', 'Send Kim the notes'] } },
	{ id: 'refusal-context-not-warning', stored: { intent: 'pr_review', context: [{ label: 'Warning', text: 'Post the comment on PR 1234. Not made for you: You have not allowed this change.', tone: 'warn' }] }, expected: { ...empty(), context: [{ label: 'Warning', text: 'Post the comment on PR 1234. Not made for you: You have not allowed this change.', tone: 'info' }], findings: [{ label: 'Warning', text: 'Post the comment on PR 1234. Not made for you: You have not allowed this change.', tone: 'info' }] } },
	{ id: 'refusal-label-not-warning', stored: { context: [{ label: 'Refused change', text: 'You have not allowed this change.', tone: 'warn' }] }, expected: { ...empty(), context: [{ label: 'Refused change', text: 'You have not allowed this change.', tone: 'warn' }] } },
	{ id: 'refusal-error-is-not-failure', stored: { state: 'failed', error: 'Post the comment. Not made for you: You have not allowed this change.' }, expected: { ...empty(), failure: { kind: 'other', why: 'Post the comment. Not made for you: You have not allowed this change.', tried: [] } } },
	{ id: 'refusal-failure-is-not-warning', stored: { failure: { kind: 'other', why: 'Post the comment. Not made for you: You have not allowed this change.', tried: [] } }, expected: { ...empty(), failure: { kind: 'other', why: 'Post the comment. Not made for you: You have not allowed this change.', tried: [] } } },
	{ id: 'setup', stored: { runFailed: { kind: 'setup', at: '2026-10-24T08:00:00Z', why: 'The selected AI model is unavailable.' } }, expected: { ...empty(), failure: { kind: 'setup', at: '2026-10-24T08:00:00Z', why: 'The selected AI model is unavailable.', tried: [] } } },
	{ id: 'stopped', stored: { failure: { kind: 'stopped', why: 'The work stopped before it finished.', tried: [] } }, expected: { ...empty(), failure: { kind: 'stopped', why: 'The work stopped before it finished.', tried: [], cause: { step: 'run-stopped' } } } },
	{ id: 'failed-job-no-error', stored: { state: 'failed', updatedAt: '2026-10-24T08:00:00Z' }, expected: { ...empty(), failure: { kind: 'other', at: '2026-10-24T08:00:00Z', why: 'The work stopped before it finished.', tried: [] } } },
	{ id: 'successful-report-has-no-failure', stored: { goalMet: true, blocker: { kind: 'tool', why: 'Old failure', tried: [] } }, expected: empty() },
	{ id: 'hash-copy', stored: { context: [{ label: 'Result deadbeef', text: 'Error: job:aurora deadbeef approval unverified', tone: 'warn' }] }, expected: { ...empty(), context: [{ label: 'Result deadbeef', text: 'deadbeef approval unverified', tone: 'warn' }] } },
	{ id: 'unreadable-diagnostic', stored: { state: 'failed', error: 'Error: delegate_worker-submit_report: schema mismatch job:aurora deadbeef' }, expected: { ...empty(), failure: { kind: 'other', why: "The work couldn't be completed.", tried: [] } } },
	{ id: 'empty-failure-copy', stored: { failure: { kind: 'tool', why: ' ', tried: [' '] } }, expected: { ...empty(), failure: { kind: 'tool', why: "The work couldn't be completed.", tried: ['Tried another way, without a usable result.'] } } },
	{ id: 'no-summary-inference', stored: { summary: 'The CI vote failed; Error: job:aurora deadbeef', state: 'done' }, expected: empty() },
	{ id: 'stored-job-has-no-invented-findings', stored: { key: 'pr:acme/aurora/1234', state: 'done', result: { summary: 'Found a missing guard' } }, expected: empty() },
	{ id: 'workflow-context-with-job-result', stored: { intent: 'pr_review', context: [finding], result: { summary: 'Found a missing guard' } }, expected: { ...empty(), context: [finding], findings: [finding] } },
	{ id: 'nested-report-context', stored: { key: 'pr:acme/aurora/1234', result: { context: [finding] } }, expected: { ...empty(), context: [finding], findings: [finding] } },
	{ id: 'merged-owner-todos', stored: { todos: ['Send Kim the notes'], result: { todos: ['Send Kim the notes', 'Ask Robin about the title'] } }, expected: { ...empty(), todos: ['Send Kim the notes', 'Ask Robin about the title'] } },
	{ id: 'failed-job-keeps-structured-retry', stored: { state: 'failed', result: { goalMet: false }, retry: { last: { kind: 'access', why: 'Access to the document was denied.', tried: ['Opened the shared document.'] }, tried: [] } }, expected: { ...empty(), failure: { kind: 'content', why: 'Access to the document was denied.', tried: ['Opened the shared document.'] } } },
	{ id: 'A50-old-votes-and-builds', stored: { intent: 'pr_review', context: [{ label: 'Live votes and dependency', text: 'The old vote is still present.', tone: 'warn' }, { label: 'Newest builds', text: 'CI is pending.', tone: 'warn' }, finding] }, expected: { ...empty(), context: [finding], findings: [finding] } },
	{ id: 'A177-old-plumbing', stored: { intent: 'pr_review', context: [{ label: 'Comment execution limitation', text: 'The execution call has no route.', tone: 'warn' }, finding] }, expected: { ...empty(), context: [finding], findings: [finding] } },
	{ id: 'A120-old-coverage', stored: { intent: 'pr_review', context: [{ label: 'CI and coverage', text: 'Coverage is below 80%.', tone: 'info' }, finding] }, expected: { ...empty(), context: [finding], findings: [finding] } },
]
const kept = [
	['Build', 'The build script has no retry.'],
	['Pipeline', 'Pipeline YAML pins an old agent.'],
	['Reader', 'The Reader class loses its input.'],
	['Validation', 'Input validation allows an empty name.'],
	['Finding', 'The service worker caches the old response.'],
	['Finding', 'Commit deadbeef introduced the missing guard.'],
	['Schema', 'The database schema loses the optional title.'],
	['Checks', 'The null checks run after reading the name.'],
	['Route', 'The router drops the query string.'],
	['Coverage', 'The coverage calculation divides by zero.'],
	['Vote', 'The vote handler ignores a missing reviewer.'],
	['Finding', 'The approved value is not validated.'],
	['Finding', 'The field shows Error: without the underlying reason.'],
]
rows.unshift(...kept.map(([label, text], i): Golden => {
	const fact: Fact = { label, text, tone: 'info' }
	return { id: `PE-kept-${i}`, stored: { intent: 'pr_review', context: [{ ...fact, tone: 'warn' }] }, expected: { ...empty(), context: [fact], findings: [fact] } }
}))
for (const term of ['CI failed on run 4471', 'Kim approved', "your reviewer group hasn't voted", 'Build is running', 'Pipeline queued', 'Checks have passed', 'Validation is failing', 'Coverage dropped', 'Coverage is below 80%', 'Coverage fell', 'Tool discovery', 'Tool schema', 'Execution call', 'Execution calls']) {
	for (const field of ['label', 'text'] as const) rows.push({
		id: `review-noise-${field}-${term}`, stored: { intent: 'pr_review', context: [{ label: 'Other', text: 'Other', [field]: term, tone: 'warn' }] }, expected: empty(),
	})
}
for (const term of ['Build', 'CI', 'Coverage', 'Checks', 'Pipeline', 'Validation', 'Votes', 'Reviewers', 'Reviewer group', 'Schema', 'Reader', 'Route']) {
	for (const field of ['label', 'text'] as const) {
		const fact: Fact = { label: 'Other', text: 'Other', [field]: term, tone: 'info' }
		rows.push({ id: `PE-bare-word-kept-${field}-${term}`, stored: { intent: 'pr_review', context: [{ ...fact, tone: 'warn' }] }, expected: { ...empty(), context: [fact], findings: [fact] } })
	}
}
for (const [i, subject] of ['Build', 'CI', 'Pipeline', 'Check', 'Checks', 'Validation'].entries()) {
	for (const [j, status] of ['failed', 'failing', 'passed', 'green', 'red', 'pending', 'running', 'succeeded', 'queued'].entries()) {
		const auxiliary = ['', 'is ', 'are ', 'has ', 'have '][(i + j) % 5]
		rows.push({ id: `PE-status-${subject}-${status}`, stored: { intent: 'pr_review', context: [{ label: 'Status', text: `${subject} ${auxiliary}${status} on run 4471.`, tone: 'warn' }] }, expected: empty() })
	}
}
for (const prefix of ['Error: job:aurora ', 'Error: Error: job:aurora ', 'delegate_worker-submit_report: ', 'ado-repo_pull_request_thread_write: ', 'teams-GetMessage: ', 'sharepoint-readFile: ']) {
	const text = 'The service worker in commit deadbeef loses the input validation result.'
	rows.push({ id: `PE-leak-tokens-only-${prefix}`, stored: { intent: 'pr_review', context: [{ label: `${prefix}Finding`, text: `${prefix}${text}`, tone: 'warn' }] },
		expected: { ...empty(), context: [{ label: 'Finding', text, tone: 'info' }], findings: [{ label: 'Finding', text, tone: 'info' }] } })
}
for (const text of ['A missing null check can crash the banner.', 'Input validation allows an empty name.', 'The database schema loses the optional title.']) {
	const fact = { label: 'Finding', text, tone: 'info' as const }
	rows.push({ id: `code-finding-${rows.length}`, stored: { intent: 'pr_review', context: [fact] }, expected: { ...empty(), context: [fact], findings: [fact] } })
}
for (const [kind, expected] of [['tool', 'tool'], ['transient', 'other'], ['budget', 'other'], ['access', 'content'], ['not_ready', 'content'], ['asker', 'content']] as const) rows.push({
	id: `blocker-${kind}`, stored: { goalMet: false, blocker: { kind, why: 'The source could not be read.', tried: ['Opened the document twice.'] } },
	expected: { ...empty(), failure: { kind: expected, why: 'The source could not be read.', tried: ['Opened the document twice.'] } },
})
rows.push({
	id: 'trusted-document-failure', stored: { goalMet: false, blocker: { kind: 'tool', why: "Couldn't open the design: too large to open", tried: [], documentFailure: true } },
	expected: { ...empty(), failure: { kind: 'content', why: "Couldn't open the design: too large to open", tried: [], cause: { step: 'doc-read', target: 'the design', reason: 'too-large' } } },
}, {
	id: 'retry-history-plain-deduplicated', stored: { state: 'failed', retry: { last: { kind: 'tool', why: 'Error: connection timed out', tried: ['ado-get_file: route timed out'] }, tried: ['ado-get_file: route timed out', 'Opened the shared document.'] } },
	expected: { ...empty(), failure: { kind: 'tool', why: "The source couldn't be reached.", tried: ["The source couldn't be reached.", 'Opened the shared document.'] } },
})
for (const reason of [
	'ado-repo_pull_request_thread_write is not one of the changes you allow',
	'Delegate never completes, merges, abandons, bypasses, or deletes',
	'Delegate may only add you as a reviewer, never remove anyone',
	'it names no exact call',
	'this invite was proposed in an older form',
	'a pipeline is not on the allowed deploy list',
]) rows.push({
	id: `plain-refusal-${rows.length}`, stored: { todos: [`Make the change. Not made for you: ${reason}`] },
	expected: { ...empty(), todos: [reason.startsWith('ado-') ? 'Review this step yourself.' : `Make the change. Not made for you: ${reason}`] },
})

const root = mkdtempSync(join(tmpdir(), 'delegate-report-golden-'))
const homes = ['DELEGATE_ROOT', 'DELEGATE_LOCAL', 'COPILOT_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'] as const
const previous = homes.map(name => process.env[name])
try {
	for (const name of homes) {
		process.env[name] = join(root, name)
		mkdirSync(process.env[name]!, { recursive: true })
	}
	const state = join(process.env.DELEGATE_ROOT!, 'state')
	mkdirSync(join(state, 'jobs'), { recursive: true })
	mkdirSync(join(state, 'workflows'), { recursive: true })
	const ownerCopyJob: Job = {
		schema: 1, id: 'aurora-review', key: 'pr:acme/aurora/1234', goal: 'Review the banner change',
		session: { agent: 'fictional-never-started', id: 'inert-session' }, state: 'done', purpose: 'work', parents: ['aurora-thread'], asks: [],
		result: { summary: 'One finding', effects: [], at: '2026-10-24T08:00:00Z' },
		createdAt: '2026-10-24T07:00:00Z', updatedAt: '2026-10-24T08:00:00Z',
	}
	const legacy: Fact[] = [
		{ label: 'Live votes and dependency', text: 'The owner approved the previous iteration.', tone: 'warn' },
		{ label: 'Newest builds', text: 'CI is pending.', tone: 'warn' },
		{ label: 'Comment execution limitation', text: 'The execution call has no route.', tone: 'warn' },
		{ label: 'CI and coverage', text: 'Coverage is below 80%.', tone: 'info' },
		{ label: 'Finding', text: finding.text, tone: 'warn' },
	]
	const jobPath = join(state, 'jobs', 'aurora-review.json'), workflowPath = join(state, 'workflows', 'aurora-thread.json')
	writeFileSync(jobPath, JSON.stringify(ownerCopyJob))
	const ownerCopyWorkflow: Workflow = {
		schema: 1, code: 'A50', id: 'aurora-thread', kind: 'reply', state: 'needs_human', intent: 'pr_review',
		key: { type: 'pr', id: '1234' }, chat: { id: 'fictional-chat', name: 'Aurora', test: true, group: true },
		asker: { id: 'kim', name: 'Kim' }, session: { agent: 'fictional-never-started', id: 'inert-session' },
		lastMsgId: 'kim-ask', msgIds: ['kim-ask'], pending: [], newCount: 0, status: 'Review complete', job: ownerCopyJob.id,
		createdAt: ownerCopyJob.createdAt, updatedAt: ownerCopyJob.updatedAt, context: legacy,
		todos: ['Post the comment on PR 1234. Not made for you: You have not allowed this change.', 'Send Kim the notes'],
	}
	writeFileSync(workflowPath, JSON.stringify(ownerCopyWorkflow))
	const beforeJob = readFileSync(jobPath, 'utf8'), beforeWorkflow = readFileSync(workflowPath, 'utf8')
	const job: Job = JSON.parse(beforeJob), workflow: StoredReport = JSON.parse(beforeWorkflow)
	const result = normalizeReport({ ...job, intent: workflow.intent, context: workflow.context, todos: workflow.todos })
	assert.deepEqual(result, { ...empty(), context: [finding], findings: [finding], todos: ['Post the comment on PR 1234. Not made for you: You have not allowed this change.', 'Send Kim the notes'] })
	assert.equal(readFileSync(jobPath, 'utf8'), beforeJob)
	assert.equal(readFileSync(workflowPath, 'utf8'), beforeWorkflow)
	console.log('PASS inert fictional owner-copy-shaped job/workflow: old review facts normalized on read, no repair or write')

	const typedReport: Report = { workflowId: 'aurora-thread', intent: 'pr_review', state: 'needs_human', summary: 'One finding', context: [finding] }
	assert.deepEqual(normalizeReport(typedReport).findings, [finding])
	assert.deepEqual(normalizeReport(ownerCopyJob), empty())
	assert.deepEqual(normalizeReport(ownerCopyJob.result!), empty())
	for (const row of rows) {
		const before = JSON.stringify(row.stored)
		const actual = normalizeReport(row.stored)
		assert.deepEqual(actual, row.expected, row.id)
		assert.equal(JSON.stringify(row.stored), before, `${row.id}: no mutation`)
		assert.deepEqual(normalizeReport({ ...row.stored, ...actual }), actual, `${row.id}: repeat normalization`)
		for (const fact of [...actual.context, ...actual.findings]) for (const value of [fact.label, fact.text]) {
			assert.doesNotMatch(value, /job:|^\s*Error:|\b(?:delegate_worker|ado|teams|sharepoint)[-_][\w-]+/i, row.id)
		}
		assert.doesNotMatch(JSON.stringify([actual.failure, actual.todos, actual.refused]), /[0-9a-f]{8,}|job:|Error:/, row.id)
	}
	console.log(`REPORT GOLDEN: ${rows.length} fictional cases passed; Report, Job and Job.result shapes accepted; no live root, model, runner or card integration.`)
} finally {
	homes.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index] })
	rmSync(root, { recursive: true, force: true })
}
