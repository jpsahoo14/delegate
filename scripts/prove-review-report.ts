// Fictional-root report submission and cached-prompt proof; no model or external writes.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config, Job, Report, Workflow } from '../src/core/types.ts'
import type { Catalog } from '../src/runner/catalog.ts'

const root = mkdtempSync(join(tmpdir(), 'delegate-review-report-'))
const names = ['DELEGATE_ROOT', 'DELEGATE_LOCAL', 'COPILOT_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'] as const
const previous = names.map(name => process.env[name])
try {
	for (const name of names) {
		process.env[name] = join(root, name)
		mkdirSync(process.env[name]!, { recursive: true })
	}
	const { Store } = await import('../src/store/state.ts')
	const { REPORT, reportTaker } = await import('../src/worker/tools.ts')
	const { reportFromText } = await import('../src/core/report.ts')
	const { buildJobPrompt, buildPrompt, buildPromisePrompt } = await import('../src/worker/prompt.ts')
	const { buildCommentCall, effectCallProblem } = await import('../src/runner/effect-calls.ts')
	const { workerTools } = await import('../src/runner/catalog.ts')
	const { finishWork } = await import('../src/runner/jobs.ts')
	const cfg: Config = {
		schema: 1, owner: { id: 'robin', name: 'Robin' },
		source: { command: ['unused'], selfChatId: 'fictional-self' }, watch: [], discover: false,
		agent: { flavor: 'copilot', command: ['unused'], tools: ['view'],
			effectTools: ['acme-ado-repo_pull_request_thread_write:create', 'acme-ado-repo_pull_request_write:vote'],
			mcpServers: { 'acme-ado': { command: 'never-start-this-proof-server' } } },
		maxParallel: 1, nudgeEveryMin: 60,
	}
	writeFileSync(join(root, 'config.json'), JSON.stringify(cfg))
	const store = new Store({ root, machine: 'fictional-machine' })
	const report: Report = {
		workflowId: 'review-aurora', intent: 'pr_review', state: 'needs_human', summary: 'One finding already on the PR.',
		findings: [{ text: 'Handle the missing banner user.', file: '/src/banner.ts', line: 42,
			thread: { author: 'Kim', url: 'https://acme.example/aurora/pullrequest/1234?threadId=7', at: '2026-10-22T17:31:00Z' } }],
		voteRecommendation: { vote: 'none', why: 'The code is not ready; the finding is still open.' },
		reply: { text: 'The banner finding is already on the PR.', commitment: false, sources: [] }, effects: [],
	}
	assert.equal(reportTaker(store, report.workflowId, 'existing')(report).error, undefined)
	assert.deepEqual(store.peekReport(report.workflowId, 'existing'), report)
	store.archiveReport(report.workflowId, 'existing')
	assert.deepEqual(store.archivedReport(report.workflowId, 'existing'), report)
	assert.deepEqual(reportFromText('```json\n' + JSON.stringify(report) + '\n```', report.workflowId, ['pr_review']), report)
	console.log('PASS existing-thread report survives real submit, disk read, archive and text fallback; no duplicate effects')

	const schema = {
		type: 'object', additionalProperties: false,
		properties: {
			action: { type: 'string', enum: ['create', 'reply'] }, project: { type: 'string' },
			repositoryId: { type: 'string' }, pullRequestId: { type: 'integer', minimum: 1 },
			filePath: { type: 'string' }, content: { type: 'string', minLength: 1 },
			rightFileStartLine: { type: 'integer', minimum: 1 }, rightFileStartOffset: { type: 'integer', minimum: 1 },
			rightFileEndLine: { type: 'integer', minimum: 1 }, rightFileEndOffset: { type: 'integer', minimum: 1 },
		},
		required: ['action', 'repositoryId', 'pullRequestId', 'content'],
	}
	const catalog: Catalog = { server: 'acme-ado', hash: 'fictional', spec: 'fictional', at: '2026-10-24T08:00:00Z',
		tools: [{ name: 'repo_pull_request_thread_write', cls: 'write', why: 'PR comments',
			info: { name: 'repo_pull_request_thread_write', inputSchema: schema } },
		{ name: 'repo_pull_request_write', cls: 'write', why: 'PR vote', info: { name: 'repo_pull_request_write', inputSchema: {
			properties: { action: { enum: ['vote'] }, vote: { enum: ['Approved', 'ApprovedWithSuggestions', 'NoVote', 'WaitingForAuthor', 'Rejected'] },
				project: { type: 'string' }, repositoryId: { type: 'string' }, pullRequestId: { type: 'integer', minimum: 1 } },
			required: ['action', 'vote', 'project', 'repositoryId', 'pullRequestId'],
		} } },
		{ name: 'not_allowed', cls: 'write', why: 'Not allowed', info: { name: 'not_allowed', inputSchema: { properties: { secretShape: {} } } } }] }
	const cacheDir = join(process.env.DELEGATE_LOCAL!, 'catalog'), cacheFile = join(cacheDir, 'acme-ado.json')
	mkdirSync(cacheDir, { recursive: true })
	writeFileSync(cacheFile, JSON.stringify(catalog))
	const job: Job = { schema: 1, id: report.workflowId, key: 'pr:acme/aurora/1234', goal: 'Review the banner changes',
		session: { agent: 'copilot', id: 'fictional-session' }, state: 'running', purpose: 'work', parents: [], asks: [],
		intent: 'pr_review', createdAt: catalog.at, updatedAt: catalog.at }
	finishWork(store, structuredClone(job), report, 0)
	assert.deepEqual(store.job(job.id)!.result!.findings, report.findings)
	assert.deepEqual(store.job(job.id)!.result!.voteRecommendation, report.voteRecommendation)
	console.log('PASS real finishWork persists structured findings and vote recommendation on the saved job result')
	const prompt = buildJobPrompt(job, cfg, root)
	const shape = (text: string) => JSON.parse(text.split('\n').find(l => l.startsWith('- acme-ado-repo_pull_request_thread_write arguments (compact): '))!.split(' (compact): ')[1])
	const expected = { properties: schema.properties, required: schema.required }
	assert.deepEqual(shape(prompt), expected)
	assert.match(prompt, /Map each to an existing open PR thread/)
	assert.match(prompt, /Existing threads need no duplicate comment effect/)
	assert.match(prompt, /voteRecommendation: \{vote, why\}/)
	assert.match(prompt, /Only the listed tools\/actions are allowed/)
	assert.ok(prompt.includes(`- acme-ado-repo_pull_request_write arguments (compact): ${JSON.stringify(catalog.tools[1].info.inputSchema)}`))
	assert.ok(!prompt.includes('secretShape'))
	assert.deepEqual(workerTools(cfg, 'job'), ['view'])
	const wf: Workflow = { schema: 1, id: 'item-aurora', code: 'A61', kind: 'reply', state: 'needs_human',
		key: { type: 'pr', id: job.key }, chat: { id: 'fictional-chat', name: 'Acme check-in', test: true },
		session: job.session, lastMsgId: 'ask', pending: [], msgIds: [], status: 'Review ready', newCount: 0,
		createdAt: job.createdAt, updatedAt: job.updatedAt }
	assert.deepEqual(shape(buildPrompt(wf, [], cfg, root)), expected)
	assert.deepEqual(shape(buildPromisePrompt(wf, [], cfg, root, 1234)), expected)
	const payload = { file: '/src/banner.ts', line: 42, text: 'Handle a missing banner user.' }
	const built = buildCommentCall(payload, { project: 'Acme', repositoryId: 'aurora', pullRequestId: 1234 },
		{ name: 'acme-ado-repo_pull_request_thread_write', info: catalog.tools[0].info })
	assert.ok(built.call)
	assert.equal(effectCallProblem(built.call, catalog.tools[0].info), undefined)
	console.log('PASS compact prompt retains cached property constraints and thread/vote rules; full catalog still validates builder calls without granting writes')

	const ready: Report = { ...report, summary: 'Two new comments and an approval proposed.',
		findings: [{ text: payload.text, file: payload.file, line: payload.line }, { text: 'Keep the footer consistent.', file: '/src/footer.ts', line: 8 }],
		voteRecommendation: { vote: 'ApprovedWithSuggestions', why: 'The code is ready with two non-blocking suggestions.' },
		effects: [{ system: 'acme-ado', action: 'comment', target: 'PR 1234', summary: payload.text, payload, call: built.call },
			{ system: 'acme-ado', action: 'comment', target: 'PR 1234', summary: 'Keep the footer consistent.', payload: { file: '/src/footer.ts', line: 8, text: 'Keep the footer consistent.' } },
			{ system: 'acme-ado', action: 'approve', target: 'PR 1234', summary: 'Approve with suggestions', head: 'fictional-head',
				call: { tool: 'acme-ado-repo_pull_request_write', args: { action: 'vote', project: 'Acme', repositoryId: 'aurora', pullRequestId: 1234, vote: 'ApprovedWithSuggestions' } } }] }
	assert.equal(reportTaker(store, report.workflowId, 'new')(ready).error, undefined)
	assert.deepEqual(store.peekReport(report.workflowId, 'new'), ready)
	const withoutEffects = { ...ready, effects: [] }
	assert.deepEqual(REPORT.parse(withoutEffects).effects, [])
	for (const vote of ['Approved', 'ApprovedWithSuggestions', 'NoVote', 'WaitingForAuthor', 'Rejected', 'none'] as const)
		assert.equal(REPORT.parse({ ...report, voteRecommendation: { vote, why: 'Code-based recommendation only.' } }).voteRecommendation?.vote, vote)
	const result: NonNullable<Job['result']> = { summary: ready.summary, effects: ready.effects ?? [], findings: ready.findings, voteRecommendation: ready.voteRecommendation }
	writeFileSync(join(root, 'future-job-result.json'), JSON.stringify(result))
	assert.deepEqual(JSON.parse(readFileSync(join(root, 'future-job-result.json'), 'utf8')), result)
	console.log('PASS new findings and all vote names round-trip; recommendation creates no effects; Job.result accepts structured fields')

	const old = { workflowId: report.workflowId, intent: 'pr_review', state: 'done', summary: 'Earlier review' }
	assert.deepEqual(REPORT.parse(old), old)
	assert.deepEqual(REPORT.parse({ ...old, findings: [] }).findings, [])
	assert.deepEqual(REPORT.parse({ ...old, findings: [{ text: 'A PR-wide finding.' }] }).findings, [{ text: 'A PR-wide finding.' }])
	const invalid = [
		{ findings: [{ text: 'Finding', line: 0 }] }, { findings: [{ text: 'Finding', line: 1.5 }] },
		{ findings: [{ text: '' }] }, { findings: [{ text: 'Finding', thread: { author: 'Kim' } }] },
		{ findings: [{ text: 'Finding', thread: { author: 'Kim', url: 'not-a-link', at: catalog.at } }] },
		{ findings: [{ text: 'Finding', thread: { author: 'Kim', url: 'https://acme.example/thread/7', at: 'yesterday' } }] },
		{ voteRecommendation: { vote: 'Merge', why: 'Not allowed' } }, { voteRecommendation: { vote: 'none', why: '' } },
	]
	for (const [i, fields] of invalid.entries()) {
		const run = `invalid-${i}`, out = reportTaker(store, report.workflowId, run)({ ...old, ...fields })
		assert.equal(out.error, true)
		assert.match(out.text, /does not fit its schema/)
		assert.equal(store.peekReport(report.workflowId, run), undefined)
	}
	console.log('PASS old/empty reports remain valid; malformed findings/thread/vote are explicitly refused before persistence')

	catalog.tools[0].info.inputSchema = { ...schema, required: [...schema.required, 'project'] }
	writeFileSync(cacheFile, JSON.stringify(catalog))
	assert.deepEqual(shape(buildJobPrompt(job, cfg, root)), { ...expected, required: [...schema.required, 'project'] })
	assert.deepEqual(shape(buildJobPrompt({ ...job, every: 10 }, cfg, root)), { ...expected, required: [...schema.required, 'project'] })
	assert.match(buildJobPrompt(job, { ...cfg, agent: { ...cfg.agent, effectTools: ['acme-ado-missing:create'] } }, root), /argument shape unavailable in the cached catalog/)
	assert.match(buildJobPrompt(job, { ...cfg, agent: { ...cfg.agent, effectTools: [] } }, root), /No changes are allowed, so propose none/)
	assert.ok(!buildJobPrompt({ ...job, purpose: 'execute', result }, cfg, root).includes('arguments (compact)'))
	assert.equal(existsSync(join(process.env.COPILOT_HOME!, 'session-state')), false)
	console.log('PASS changed cached schema is read fresh; tracker, missing/no tools and approved execute paths retain their boundaries')

	const extendedSchema = {
		...schema, description: 'PRIVATE_SCHEMA_DESCRIPTION',
		properties: { ...schema.properties, details: { $ref: '#/$defs/Details' }, count: {
			type: ['integer', 'null'], minimum: 0, maximum: 10, exclusiveMinimum: -1, exclusiveMaximum: 11,
			description: 'PRIVATE_FIELD_DESCRIPTION',
		}, entries: { type: 'array', minItems: 0, maxItems: 5, items: { type: 'string', minLength: 0, maxLength: 30 } } },
		$defs: { Details: { type: 'object', minProperties: 0, maxProperties: 3, description: 'PRIVATE_NESTED_DESCRIPTION',
			properties: { mode: { type: 'string', enum: ['brief', 'full'] }, deeper: { $ref: '#/$defs/Deep' } },
			required: ['mode'] }, Deep: { type: 'object', properties: { PRIVATE_TOO_DEEP: { type: 'string' } } } },
	}
	catalog.tools[0].info.inputSchema = extendedSchema
	writeFileSync(cacheFile, JSON.stringify(catalog))
	const snapshot = readFileSync(cacheFile, 'utf8'), nested = shape(buildJobPrompt(job, cfg, root))
	assert.deepEqual(nested.properties.count, { type: ['integer', 'null'], minimum: 0, maximum: 10, exclusiveMinimum: -1, exclusiveMaximum: 11 })
	assert.deepEqual(nested.properties.entries, { type: 'array', minItems: 0, maxItems: 5, items: { type: 'string', minLength: 0, maxLength: 30 } })
	assert.deepEqual(nested.properties.details, { type: 'object', minProperties: 0, maxProperties: 3,
		properties: { mode: { type: 'string', enum: ['brief', 'full'] }, deeper: { type: 'object' } }, required: ['mode'] })
	assert.doesNotMatch(JSON.stringify(nested), /PRIVATE_|\$defs|\$ref|description/)
	assert.equal(readFileSync(cacheFile, 'utf8'), snapshot)
	assert.equal(effectCallProblem(built.call!, catalog.tools[0].info), undefined)
	const heavy: Catalog = { ...catalog, tools: Array.from({ length: 10 }, (_, i) => ({
		name: `change_${i}`, cls: 'write', why: 'Fictional change', info: { name: `change_${i}`, inputSchema: {
			type: 'object', description: 'NOT_PROMPT_DATA'.repeat(250),
			properties: { action: { type: 'string', enum: ['create'] }, oversized: { type: 'string', enum: ['x'.repeat(5000)] },
				...Object.fromEntries(Array.from({ length: 35 }, (_, j) => [`field_${j}`, { type: 'string', description: 'NOT_PROMPT_DATA' }])) },
			required: ['action'],
		} },
	})) }
	writeFileSync(cacheFile, JSON.stringify(heavy))
	const boundedCfg = { ...cfg, agent: { ...cfg.agent, effectTools: heavy.tools.map(t => `acme-ado-${t.name}:create`) } }
	const heavyPrompt = buildJobPrompt(job, boundedCfg, root)
	const block = heavyPrompt.slice(heavyPrompt.indexOf('Argument shapes are reference'), heavyPrompt.indexOf('(shapes truncated; propose only fields shown)') + '(shapes truncated; propose only fields shown)'.length)
	assert.ok(block.length <= 2300 && block.length > 2000)
	assert.doesNotMatch(block, /NOT_PROMPT_DATA|oversized/)
	assert.ok(heavyPrompt.includes('- acme-ado-change_9:create'))
	for (const line of block.split('\n').filter(l => l.includes(' arguments (compact): ')))
		assert.ok(Object.keys(JSON.parse(line.split(' (compact): ')[1]).properties).length)
	assert.ok(block.endsWith('(shapes truncated; propose only fields shown)'))
	assert.equal(readFileSync(cacheFile, 'utf8'), JSON.stringify(heavy))
	console.log(`PASS descriptions/deep definitions omitted, one reference level and all numeric bounds retained; oversized enums/tools truncated at complete fields (${block.length}/2300 chars; below 4k ceiling), cache unchanged`)
} finally {
	for (const [i, name] of names.entries()) {
		if (previous[i] === undefined) delete process.env[name]
		else process.env[name] = previous[i]
	}
	rmSync(root, { recursive: true, force: true })
}
