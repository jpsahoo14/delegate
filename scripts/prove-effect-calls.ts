import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Effect } from '../src/core/types.ts'
import type { Catalog } from '../src/runner/catalog.ts'
import type { EffectCallRepair } from '../src/runner/effect-calls.ts'

const root = mkdtempSync(join(tmpdir(), 'delegate-effect-calls-'))
const names = ['DELEGATE_ROOT', 'DELEGATE_LOCAL', 'COPILOT_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'] as const
const previous = names.map(name => process.env[name])
try {
	for (const name of names) {
		process.env[name] = join(root, name)
		mkdirSync(process.env[name]!, { recursive: true })
	}
	const { buildCommentCall, effectCallProblem, prepareEffectCalls } = await import('../src/runner/effect-calls.ts')
	const schema = {
		type: 'object', additionalProperties: false,
		properties: {
			action: { type: 'string', enum: ['create', 'reply', 'update', 'update_status'] },
			project: { type: ['string', 'null'] },
			repositoryId: { type: 'string', minLength: 1 },
			pullRequestId: { type: 'integer', minimum: 1 },
			content: { type: ['string', 'null'] },
			filePath: { type: ['string', 'null'] },
			rightFileStartLine: { type: 'integer', minimum: 1 },
			rightFileStartOffset: { type: 'integer', minimum: 1 },
			rightFileEndLine: { type: 'integer', minimum: 1 },
			rightFileEndOffset: { type: 'integer', minimum: 1 },
			threadId: { type: ['integer', 'null'] },
			changeTrackingId: { type: ['integer', 'null'] },
			firstComparingIteration: { type: ['integer', 'null'] },
			secondComparingIteration: { type: ['integer', 'null'] },
		},
		required: ['action', 'repositoryId', 'pullRequestId'],
	}
	const catalogs: Record<string, Pick<Catalog, 'tools'>> = {
		ado: { tools: [{ name: 'repo_pull_request_thread_write', cls: 'write', why: 'PR comments', info: { name: 'repo_pull_request_thread_write', inputSchema: schema } }] },
	}
	const cache = join(process.env.DELEGATE_LOCAL!, 'catalog.json')
	writeFileSync(cache, JSON.stringify(catalogs))
	const cached: typeof catalogs = JSON.parse(readFileSync(cache, 'utf8'))
	const events: EffectCallRepair[] = []
	const log = (event: EffectCallRepair) => events.push(event)
	const ref = { project: 'Acme', repositoryId: 'aurora', pullRequestId: 1234 }
	const payload = { file: '/src/banner.ts', line: 42, endLine: 44, text: 'Please check for a missing user before reading the name.' }
	const effect: Effect = {
		system: 'ado', action: 'comment', target: 'PR 1234', summary: 'Guard the banner user',
		payload,
		call: { tool: 'ado-repo_pull_request_thread_write', args: {
			action: 'create', project: 'Wrong project', repositoryId: 'wrong-repo', pullRequestId: 9999,
			content: 'Do not copy the worker arguments.',
			threadContext: { filePath: '/wrong.ts', rightFileStart: { line: 99, offset: 7 }, rightFileEnd: { line: 100, offset: 8 } },
		} },
	}
	const original = JSON.stringify(effect)
	const ready = prepareEffectCalls([effect, { ...effect, payload: { ...payload, file: '/src/footer.ts', line: 8, endLine: undefined } }], ref, cached, log)
	assert.deepEqual(ready.problems, [])
	assert.deepEqual(ready.repaired, [0, 1])
	assert.equal(ready.effects.length, 2)
	assert.deepEqual(ready.effects[0].call, {
		tool: 'ado-repo_pull_request_thread_write',
		args: { action: 'create', project: 'Acme', repositoryId: 'aurora', pullRequestId: 1234, filePath: payload.file,
			rightFileStartLine: 42, rightFileStartOffset: 1, rightFileEndLine: 44, rightFileEndOffset: 1, content: payload.text },
	})
	assert.equal(ready.effects[1].call!.args.rightFileEndLine, 8)
	assert.equal(JSON.stringify(effect), original)
	assert.deepEqual(events, Array.from({ length: 2 }, () => ({ event: 'effect-call-repaired', from: 'threadContext', ok: true })))
	console.log('PASS nested REST calls rebuilt only from payload and authoritative PR reference; no mutation or execution')

	events.length = 0
	const valid = ready.effects[0]
	const unchanged = prepareEffectCalls([valid], ref, cached, log)
	assert.equal(unchanged.effects[0], valid)
	assert.deepEqual(unchanged.repaired, [])
	assert.equal(events.length, 0)
	const noLine = prepareEffectCalls([{ ...effect, payload: { file: payload.file, text: payload.text } }], ref, cached, log)
	assert.deepEqual(noLine.effects, [])
	assert.deepEqual(noLine.problems, ["Couldn't prepare comment 1: the line is missing or is not a positive whole number"])
	assert.equal(events.at(-1)!.ok, false)
	console.log('PASS valid call unchanged; missing line visibly refused, even though worker args name a line')

	for (const bad of [
		undefined, {}, { ...payload, file: '' }, { ...payload, text: '' }, { ...payload, line: '42' },
		{ ...payload, line: 0 }, { ...payload, line: 1.5 }, { ...payload, endLine: 41 },
		{ ...payload, line: Number.MAX_SAFE_INTEGER + 1 }, { ...payload, endLine: '44' },
	]) {
		const result = prepareEffectCalls([{ ...valid, payload: bad }], ref, cached, log)
		assert.equal(result.effects.length, 0)
		assert.match(result.problems[0], /^Couldn't prepare comment 1: /)
	}
	assert.equal(prepareEffectCalls([valid], undefined, cached, log).effects.length, 0)
	assert.equal(prepareEffectCalls([valid], { ...ref, pullRequestId: 0 }, cached, log).effects.length, 0)
	console.log('PASS incomplete payload and PR reference never offered, even with a schema-valid worker call')

	const unknown = { ...effect, call: { tool: effect.call!.tool, args: { unexpectedShape: true } } }
	events.length = 0
	const rebuilt = prepareEffectCalls([unknown], ref, cached, log)
	assert.deepEqual(rebuilt.effects[0].call, valid.call)
	assert.deepEqual(events, [{ event: 'effect-call-repaired', from: 'rebuilt', ok: true }])
	const absent = prepareEffectCalls([{ ...effect, call: undefined }], ref, cached, log)
	assert.deepEqual(absent.effects[0].call, valid.call)
	const unknownTool = prepareEffectCalls([{ ...effect, call: { tool: 'ado-unknown', args: {} } }], ref, cached, log)
	assert.deepEqual(unknownTool.effects[0].call, valid.call)
	const unavailable = prepareEffectCalls([effect], ref, {}, log)
	assert.equal(unavailable.effects.length, 0)
	assert.match(unavailable.problems[0], /cached catalog/)
	const unsupported: typeof catalogs = structuredClone(cached)
	delete unsupported.ado.tools[0].info.inputSchema!.properties!.rightFileStartLine
	assert.equal(prepareEffectCalls([effect], ref, unsupported, log).effects.length, 0)
	console.log('PASS unknown shapes rebuilt; missing or unsupported tool catalog visibly refused')

	const tool = cached.ado.tools[0]
	for (const args of [
		{ ...valid.call!.args, action: 'delete' }, { ...valid.call!.args, pullRequestId: '1234' },
		{ ...valid.call!.args, rightFileStartLine: -1 }, { ...valid.call!.args, repositoryId: '' },
		{ ...valid.call!.args, threadContext: {} },
	]) assert.ok(effectCallProblem({ ...valid.call!, args }, tool.info))
	const required = { ...valid.call!.args }
	delete required.repositoryId
	assert.ok(effectCallProblem({ ...valid.call!, args: required }, tool.info))
	assert.equal(effectCallProblem(valid.call!, tool.info), undefined)
	const stricter: typeof catalogs = structuredClone(cached)
	stricter.ado.tools[0].info.inputSchema!.required!.push('changeTrackingId')
	assert.match(prepareEffectCalls([effect], ref, stricter, log).problems[0], /changeTrackingId/)
	const conditional = { ...schema, allOf: [{ if: { properties: { action: { const: 'create' } } }, then: { required: ['threadId'] } }] }
	assert.match(effectCallProblem(valid.call!, { ...tool.info, inputSchema: conditional })!, /threadId/)
	const wrongAction: typeof catalogs = structuredClone(cached)
	wrongAction.ado.tools[0].info.inputSchema!.properties!.action = { type: 'string', enum: ['reply'] }
	assert.equal(prepareEffectCalls([effect], ref, wrongAction, log).effects.length, 0)
	const brokenSchema = { ...tool.info, inputSchema: { ...schema, properties: { ...schema.properties, action: { type: 'not-a-json-schema-type' } } } }
	assert.match(effectCallProblem(valid.call!, brokenSchema)!, /couldn't be checked/)
	console.log('PASS catalog required fields, types, enums and bounds checked; unsupported schema fails closed')

	const aliases: typeof catalogs = structuredClone(cached)
	const properties = aliases.ado.tools[0].info.inputSchema!.properties!
	const rename = { action: 'operation', project: 'projectName', repositoryId: 'repository', pullRequestId: 'prId',
		filePath: 'path', rightFileStartLine: 'startLine', rightFileStartOffset: 'startOffset',
		rightFileEndLine: 'endLine', rightFileEndOffset: 'endOffset', content: 'body' }
	for (const [before, after] of Object.entries(rename)) { properties[after] = properties[before]; delete properties[before] }
	aliases.ado.tools[0].info.inputSchema!.required = ['operation', 'repository', 'prId']
	const renamed = prepareEffectCalls([effect], ref, aliases, log).effects[0].call!
	assert.deepEqual(renamed.args, { operation: 'create', projectName: 'Acme', repository: 'aurora', prId: 1234, path: payload.file,
		startLine: 42, startOffset: 1, endLine: 44, endOffset: 1, body: payload.text })
	assert.equal(effectCallProblem(renamed, aliases.ado.tools[0].info), undefined)
	assert.ok(buildCommentCall(payload, ref, { name: valid.call!.tool, info: tool.info }).call)
	console.log('PASS field names resolved from catalog, no iteration fields invented')

	const other = { ...valid, action: 'vote', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', vote: 'Approved' } } }
	const voteSchema = { type: 'object', properties: { action: { enum: ['vote'] }, vote: { enum: ['Approved', 'Rejected'] } }, required: ['action', 'vote'] }
	cached.ado.tools.push({ name: 'repo_pull_request_write', cls: 'write', why: 'PR votes', info: {
		name: 'repo_pull_request_write', inputSchema: voteSchema,
	} })
	const mixed = prepareEffectCalls([other, { ...effect, payload: {} }, valid], ref, cached, log)
	assert.equal(mixed.effects[0], other)
	assert.equal(mixed.effects[1], valid)
	assert.match(mixed.problems[0], /^Couldn't prepare comment 1: /)
	const invalidOther = { ...other, call: { ...other.call, args: { action: 'vote', vote: 'Anything' } } }
	const failedOther = prepareEffectCalls([invalidOther, { ...other, call: undefined }], ref, cached, log)
	assert.equal(failedOther.effects.length, 0)
	assert.equal(failedOther.problems.length, 2)
	assert.match(failedOther.problems[0], /^Couldn't prepare change 1: /)
	const reply = { ...valid, action: 'reply', call: { ...valid.call!, args: { action: 'reply', repositoryId: 'aurora', pullRequestId: 1234, threadId: 7, content: 'Thanks.' } } }
	assert.equal(prepareEffectCalls([reply], ref, cached, log).effects[0], reply)
	const authorQuestion = { tool: valid.call!.tool, args: { action: 'create', project: 'Acme', repositoryId: 'aurora', pullRequestId: 1234, content: 'Should this use the name or the title?' } }
	assert.equal(effectCallProblem(authorQuestion, tool.info), undefined)
	const workItemSchema = { type: 'object', properties: { action: { enum: ['add'] }, workItemId: { type: 'integer' }, comment: { type: 'string' } }, required: ['action', 'workItemId', 'comment'] }
	cached.ado.tools.push({ name: 'wit_work_item_comment_write', cls: 'write', why: 'Work item comments', info: { name: 'wit_work_item_comment_write', inputSchema: workItemSchema } })
	const workItemComment = { ...valid, target: 'Work item 1234', call: { tool: 'ado-wit_work_item_comment_write', args: { action: 'add', workItemId: 1234, comment: 'Checked the finding.' } } }
	assert.equal(prepareEffectCalls([workItemComment], ref, cached, log).effects[0], workItemComment)
	assert.ok(events.every(event => Object.keys(event).sort().join(',') === 'event,from,ok'))
	console.log('PASS every proposed call checked, mixed failures surfaced, existing reply and work item comment unchanged; logs contain no comment text')
	console.log('PASS stage A only: no MCP writes, approval/state mutations, card or upgrade execution')
} finally {
	names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index] })
	rmSync(root, { recursive: true, force: true })
}
