// Fictional-root production dispatch, approval, native MCP and validity-rule journeys; not a unit-test suite.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config, Effect, Job, Report, Workflow } from '../src/core/types.ts'
import type { Source } from '../src/adapters/source.ts'
import type { RawMsg } from '../src/core/intake.ts'
import type { Catalog } from '../src/runner/catalog.ts'
import type { BuildProbe } from '../src/runner/probe.ts'

const root = mkdtempSync(join(tmpdir(), 'delegate-effect-preparation-'))
const names = ['DELEGATE_ROOT', 'DELEGATE_LOCAL', 'COPILOT_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'] as const
const previous = names.map(n => process.env[n])
try {
	for (const name of names) { process.env[name] = join(root, name); mkdirSync(process.env[name]!, { recursive: true }) }
	const { Store } = await import('../src/store/state.ts')
	const { dispatch } = await import('../src/runner/dispatch.ts')
	const { checkOpen } = await import('../src/runner/continue.ts')
	const { applyAnswers } = await import('../src/runner/apply.ts')
	const { changesJob, executeDirect, finishWork, legacyEffects } = await import('../src/runner/jobs.ts')
	const { repairPendingEffectCalls } = await import('../src/runner/effect-preparation.ts')
	const { reportTaker } = await import('../src/worker/tools.ts')
	const { workflowApprovalRev, pageChangeId } = await import('../src/core/page-approval.ts')
	const { callKey } = await import('../src/runner/ledger.ts')
	const { card } = await import('../src/web/view.ts')
	const schema = {
		type: 'object', additionalProperties: false,
		properties: {
			action: { type: 'string', enum: ['create', 'reply', 'update', 'update_status'] },
			project: { type: ['string', 'null'] }, repositoryId: { type: 'string' }, pullRequestId: { type: 'integer', minimum: 1 },
			content: { type: ['string', 'null'] }, filePath: { type: ['string', 'null'] },
			rightFileStartLine: { type: ['integer', 'null'] }, rightFileStartOffset: { type: ['integer', 'null'] },
			rightFileEndLine: { type: ['integer', 'null'] }, rightFileEndOffset: { type: ['integer', 'null'] },
		}, required: ['action', 'repositoryId', 'pullRequestId'],
	}
	const writesFile = join(root, 'writes.jsonl'), stub = join(root, 'ado-stub.mjs')
	writeFileSync(stub, `
import {createInterface} from 'node:readline';import {appendFileSync} from 'node:fs';
const schema=${JSON.stringify(schema)}, file=${JSON.stringify(writesFile)};
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;
let result;
if(m.method==='initialize')result={protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fictional-ado',version:'1'}};
else if(m.method==='tools/list')result={tools:[{name:'repo_pull_request_thread_write',inputSchema:schema}]};
else if(m.method==='tools/call'){const a=m.params.arguments;
if('threadContext' in a||!a.content||a.filePath&&(!a.rightFileStartLine||!a.rightFileEndLine))throw new Error('Invalid comment reached stub');
appendFileSync(file,JSON.stringify(a)+'\\n');result={content:[{type:'text',text:JSON.stringify({id:'fictional-comment'})}]};}
else throw new Error('Unexpected request '+m.method);
console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));});
`)
	const cfg: Config = { schema: 1, owner: { id: 'robin', name: 'Robin', upn: 'robin@acme.example' },
		source: { command: [], selfChatId: 'self' }, watch: [], discover: false,
		agent: { flavor: 'copilot', command: ['fictional-worker-never-started'], tools: [], host: false,
			effectTools: ['ado-repo_pull_request_thread_write', 'ado-repo_pull_request_write:vote', 'ado-repo_pull_request_write:update_reviewers'],
			mcpServers: { ado: { command: process.execPath, args: [stub] } } },
		maxParallel: 1, nudgeEveryMin: 60, dailyRuns: 100 }
	const catalog: Catalog = { server: 'ado', hash: 'fictional', spec: 'fictional', at: new Date().toISOString(),
		tools: [{ name: 'repo_pull_request_thread_write', cls: 'write', why: 'PR comments',
			info: { name: 'repo_pull_request_thread_write', inputSchema: schema } }] }
	mkdirSync(join(process.env.DELEGATE_LOCAL!, 'catalog'))
	writeFileSync(join(process.env.DELEGATE_LOCAL!, 'catalog', 'ado.json'), JSON.stringify(catalog))
	const store = new Store({ root: process.env.DELEGATE_ROOT!, machine: 'fictional' })
	store.saveConfig(cfg)
	let sequence = 0, modelCalls = 0, sent = 0
	const live = new Map<string, RawMsg[]>()
	const source: Source = {
		selfChatId: 'self', recent: async chat => live.get(chat) ?? [],
		around: async (chat, id) => ({ msg: live.get(chat)?.find(m => m.id === id), after: [] }),
		newMessages: async () => ({ msgs: [], truncated: false }), recentChats: async () => [],
		send: async () => ({ msgId: `sent-${++sent}` }), sendSelf: async () => ({ msgId: 'receipt' }),
		presence: async () => ({ availability: 'Available' }), deleteMessage: async () => {}, editMessage: async () => {}, close: async () => {},
	}
	const probe: BuildProbe = { builds: async () => new Map(), pr: async () => ({
		status: 'active', title: 'Aurora banner', head: 'abcdef123456789', author: 'Kim', votes: [{ name: 'Robin', vote: 0 }],
		reviewers: [{ name: 'Robin', unique: cfg.owner.upn, vote: 0, required: false, group: false, declined: false }],
	}) }
	const procs = { start: () => { throw new Error('No worker should start for exact calls') }, alive: () => false, kill: () => true,
		openWindow: () => { throw new Error('No window should open') } }
	function seed(): Workflow {
		const id = String(++sequence * 100), at = new Date(Date.now() - 1000).toISOString()
		const wf: Workflow = { schema: 1, id: `item-${sequence}`, code: `A${600 + sequence}`, kind: 'reply', state: 'running',
			key: { type: 'thread', id }, chat: { id: `chat-${sequence}`, name: 'Acme review', test: false },
			asker: { id: 'kim', name: 'Kim' }, session: { agent: 'copilot', id: `session-${sequence}` },
			lastMsgId: id, pending: [id], msgIds: [id],
			lastAsk: 'Robin, please check PR 1234: https://dev.azure.com/acme/Acme/_git/aurora/pullrequest/1234',
			prRole: 'reviewer', prAuthor: 'Kim', status: 'Checking', newCount: 0, createdAt: at, updatedAt: at }
		live.set(wf.chat.id, [{ id, at, from: wf.asker!, html: false, body: wf.lastAsk! }])
		store.saveThread(wf.id, [{ id, at, from: wf.asker!, text: wf.lastAsk!, byOwner: false }])
		store.save(wf)
		return wf
	}
	const proposed = (file: string, line = 42, endLineLength?: number): Effect => ({
		system: 'ado', action: 'comment', target: 'PR 1234', summary: `Check ${file}`,
		payload: { file, line, text: 'Handle a missing user.', ...(endLineLength ? { endLineLength } : {}) },
		call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', repositoryId: 'wrong',
			pullRequestId: 9999, threadContext: { filePath: '/wrong.ts' }, content: 'Wrong worker text' } },
	})
	const report = (id: string, effects: Effect[]): Report => ({ workflowId: id, intent: 'other', state: 'needs_human',
		summary: 'Two findings', reply: { text: 'I posted the findings.', commitment: false, sources: [] }, effects })
	const writes = (): Record<string, unknown>[] => existsSync(writesFile) ? readFileSync(writesFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
	async function click(wf: Workflow, expect = workflowApprovalRev(wf)) {
		store.writeAnswer({ code: wf.code, verb: 'ok', surface: 'panel', page: { kind: 'make-changes', expect } })
		await applyAnswers(store, source, cfg, procs, false, probe)
		return store.workflow(wf.id)!
	}
	let wf = seed()
	await dispatch(store, source, cfg, async (_cfg, input) => {
		modelCalls++
		assert.equal(reportTaker(store, input.workflowId, input.runId)(report(input.workflowId,
			[proposed('/src/banner.ts', 42, 73), proposed('/src/footer.ts', 8)])).error, undefined)
		return { exitCode: 0, ms: 1 }
	}, probe, [wf.id])
	wf = store.workflow(wf.id)!
	assert.equal(card(store, wf).changes.length, 2)
	assert.equal(writes().length, 0)
	wf = await click(wf)
	await executeDirect(store, source, cfg, procs, probe)
	assert.equal(writes().length, 2)
	assert.deepEqual(writes().map(x => [x.filePath, x.rightFileStartLine, x.rightFileEndOffset]),
		[['/src/banner.ts', 42, 73], ['/src/footer.ts', 8, 1]])
	assert.ok(writes().every(x => x.repositoryId === 'aurora' && x.pullRequestId === 1234 && !('threadContext' in x)))
	console.log('PASS real dispatch/submit/card/exact-rev click/native MCP posts two code-built comments with known and fallback offsets')

	wf = seed()
	wf.state = 'needs_human'; wf.pending = []; wf.draft = report(wf.id, []).reply
	wf.effects = [proposed('/src/legacy-one.ts'), proposed('/src/legacy-two.ts', 9)]
	changesJob(store, cfg, wf, wf.effects)
	wf.approved = { at: new Date().toISOString(), effects: 'old-invalid-approval', text: wf.draft!.text }
	store.save(wf)
	const oldRev = workflowApprovalRev(wf), before = writes().length, oldDraft = wf.draft!.text
	const job = store.job(wf.job!)!; job.state = 'queued'; job.purpose = 'execute'; store.saveJob(job)
	legacyEffects(store)
	wf = store.workflow(wf.id)!
	const repairedIds = wf.effects!.map(pageChangeId)
	assert.equal(wf.approved, undefined)
	assert.equal(wf.draft!.text, oldDraft)
	assert.notEqual(workflowApprovalRev(wf), oldRev)
	assert.equal(wf.status, 'The comment format was wrong and is fixed. Post them now?')
	assert.equal(card(store, wf).changes.length, 2)
	assert.deepEqual(store.job(wf.job!)!.result!.effects, wf.effects)
	assert.equal(store.job(wf.job!)!.purpose, 'work')
	assert.equal(await executeDirect(store, source, cfg, procs, probe), 0)
	await click(wf, oldRev)
	assert.equal(store.workflow(wf.id)!.approved, undefined)
	wf = await click(store.workflow(wf.id)!)
	await executeDirect(store, source, cfg, procs, probe)
	assert.equal(writes().length, before + 2)
	await click(store.workflow(wf.id)!)
	await executeDirect(store, source, cfg, procs, probe)
	assert.equal(writes().length, before + 2)
	assert.equal(modelCalls, 1)
	const repairs = store.logs().filter(e => e.event === 'effect-call-repaired' && repairedIds.includes(String(e.pageChangeId)))
	assert.equal(repairs.length, 2)
	legacyEffects(store)
	assert.equal(store.logs().filter(e => e.event === 'effect-call-repaired' && repairedIds.includes(String(e.pageChangeId))).length, 2)
	assert.equal(store.upgrades()['effect-call-shape-1'], undefined)
	console.log('PASS legacy pending comments repaired without rerun; stale click refused; one current click posts once; keyed logs do not repeat')

	wf = seed(); wf.state = 'waiting_on_task'; wf.pending = []; store.save(wf)
	const work: Job = { schema: 1, id: 'review-job', key: 'pr:acme/1234', goal: 'Review Aurora',
		session: wf.session, state: 'running', purpose: 'work', parents: [wf.id], asks: [],
		createdAt: wf.createdAt, updatedAt: wf.updatedAt }
	wf.job = work.id; store.save(wf); store.saveJob(work)
	const missing = proposed('/src/missing.ts'); missing.payload = { file: '/src/missing.ts', text: 'No line.' }
	finishWork(store, work, { ...report(work.id, [missing]), state: 'done', reply: undefined }, 0)
	wf = store.workflow(wf.id)!
	assert.equal(wf.state, 'needs_human')
	assert.equal(wf.effects?.length, 0)
	assert.match(wf.todos!.join('\n'), /Couldn't prepare comment 1:.*line/)
	assert.equal(store.job(work.id)!.result!.effects.length, 0)
	console.log("PASS real finishWork missing line stays visible as Couldn't prepare, never offered or auto-closed")

	const vote: Effect = { system: 'ado', action: 'vote', target: 'PR 1234', summary: 'Wait for author', head: 'abcdef123456789',
		call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', project: 'Acme', repositoryId: 'aurora', pullRequestId: 1234, vote: 'WaitingForAuthor' } } }
	const add: Effect = { ...vote, action: 'add reviewer', summary: 'Add Robin', call: { tool: vote.call!.tool,
		args: { action: 'update_reviewers', project: 'Acme', repositoryId: 'aurora', pullRequestId: 1234, reviewerAction: 'add', reviewerIds: [cfg.owner.upn] } } }
	work.state = 'running'; store.saveJob(work)
	finishWork(store, work, { ...report(work.id, [vote, add]), intent: 'pr_review', question: 'Should this use the name or the title?' }, 0)
	const result = store.job(work.id)!.result!
	assert.equal(result.effects.length, 3)
	assert.deepEqual(result.effects.slice(0, 2).map(e => e.call), [vote.call, add.call])
	assert.equal(result.effects[2].call!.args.content, 'Kim, should this use the name or the title?')
	assert.equal(result.effects[2].call!.args.filePath, undefined)
	console.log('PASS deferred votes/add-me survive; server-built author question is separately schema checked, without invented inline fields')

	wf = seed()
	store.writeReport(report(wf.id, [proposed('/src/terminal.ts')]), 'terminal-return')
	store.setOpenWindow(wf.id, { machine: store.machine, pid: 0, since: new Date().toISOString(), runId: 'terminal-return', closed: true })
	assert.equal(checkOpen(store, procs), 1)
	wf = store.workflow(wf.id)!
	assert.equal(wf.effects!.length, 1)
	assert.equal(wf.effects![0].call!.args.filePath, '/src/terminal.ts')
	assert.deepEqual(store.job(wf.job!)!.result!.effects, wf.effects)
	assert.equal(wf.draft!.preview, true)
	assert.equal(store.openWindow(wf.id), undefined)
	console.log('PASS real closed-window checkOpen/applyReport prepares and carries exact calls, preview only')

	for (const mark of ['done', 'off', 'maybe', 'calling', 'ledger-done', 'job-done', 'job-maybe', 'running'] as const) {
		wf = seed(); wf.state = 'needs_human'; wf.pending = []; wf.effects = [proposed(`/src/${mark}.ts`)]
		const effect = wf.effects[0]
		effect.call!.args.threadContext = { filePath: `/src/${mark}.ts` }
		if (mark === 'done') effect.done = { at: wf.createdAt }
		if (mark === 'off') effect.off = true
		if (mark === 'maybe') effect.maybe = true
		if (mark === 'calling') store.saveCallRec({ call: callKey(effect.call!), state: 'calling', at: wf.createdAt })
		if (mark === 'ledger-done') store.saveCallRec({ call: callKey(effect.call!), state: 'done', at: wf.createdAt })
		if (mark === 'job-done' || mark === 'job-maybe') {
			changesJob(store, cfg, wf, wf.effects)
			const copy = store.job(wf.job!)!
			if (mark === 'job-done') copy.result!.effects[0].done = { at: wf.createdAt }
			else copy.result!.effects[0].maybe = true
			store.saveJob(copy)
		}
		if (mark === 'running') { changesJob(store, cfg, wf, wf.effects); const active = store.job(wf.job!)!; active.state = 'running'; active.purpose = 'execute'; store.saveJob(active) }
		store.save(wf); const before = JSON.stringify(store.workflow(wf.id))
		repairPendingEffectCalls(store)
		assert.equal(JSON.stringify(store.workflow(wf.id)), before)
	}
	console.log('PASS receipts, unchecked, uncertain, in-flight ledger and running-job calls remain untouched')
	wf = seed(); wf.state = 'needs_human'; wf.pending = []; wf.effects = [proposed('/src/concurrent.ts')]
	wf.draft = report(wf.id, []).reply
	changesJob(store, cfg, wf, wf.effects); store.save(wf)
	const concurrentJob = store.job(wf.job!)!
	concurrentJob.state = 'queued'; concurrentJob.purpose = 'execute'; store.saveJob(concurrentJob)
	const originalJobs = store.jobs.bind(store)
	let intervened = false
	store.jobs = () => {
		const snapshot = originalJobs()
		if (!intervened) {
			intervened = true
			const newer = store.workflow(wf.id)!
			newer.draft = { ...newer.draft!, text: 'Robin revised this reply while repair was reading.' }
			newer.kept = [{ id: 'owner-kept', text: 'Ask Kim about the rollout.', at: newer.updatedAt }]
			store.save(newer)
			const job = store.job(wf.job!)!
			job.goal = 'A newer owner goal'
			job.result!.summary = 'Newer result metadata'
			job.result!.findings = [{ text: 'A newer stored finding.', file: '/src/concurrent.ts', line: 42 }]
			store.saveJob(job)
		}
		return snapshot
	}
	try { assert.equal(repairPendingEffectCalls(store), 1) } finally { store.jobs = originalJobs }
	wf = store.workflow(wf.id)!
	assert.equal(intervened, true)
	assert.equal(wf.draft!.text, 'Robin revised this reply while repair was reading.')
	assert.equal(wf.kept![0].id, 'owner-kept')
	assert.equal(wf.effects![0].call!.args.filePath, '/src/concurrent.ts')
	const mergedJob = store.job(wf.job!)!
	assert.equal(mergedJob.goal, 'A newer owner goal')
	assert.equal(mergedJob.result!.summary, 'Newer result metadata')
	assert.equal(mergedJob.result!.findings![0].text, 'A newer stored finding.')
	assert.deepEqual(mergedJob.result!.effects, wf.effects)
	assert.equal(mergedJob.state, 'done')
	assert.equal(mergedJob.purpose, 'work')
	assert.equal(writes().length, before + 2)
	console.log('PASS intervening workflow draft/kept and job goal/result writes survive repair snapshot-to-save; only repaired calls and queued execution change')
	wf = seed(); wf.state = 'needs_human'; wf.pending = []
	const fresh = proposed('/src/catalog-change.ts')
	fresh.call = { ...store.workflow('item-1')!.effects![0].call!, args: { ...writes()[0], filePath: '/src/catalog-change.ts' } }
	wf.effects = [fresh]; changesJob(store, cfg, wf, wf.effects); store.save(wf)
	assert.equal(repairPendingEffectCalls(store), 0)
	const altered = structuredClone(catalog)
	const properties = altered.tools[0].info.inputSchema!.properties!
	properties.repository = properties.repositoryId
	delete properties.repositoryId
	altered.tools[0].info.inputSchema!.required = ['action', 'repository', 'pullRequestId']
	writeFileSync(join(process.env.DELEGATE_LOCAL!, 'catalog', 'ado.json'), JSON.stringify(altered))
	assert.ok(repairPendingEffectCalls(store) >= 1)
	wf = store.workflow(wf.id)!
	assert.equal(wf.effects![0].call!.args.repository, 'aurora')
	assert.equal(wf.effects![0].call!.args.repositoryId, undefined)
	assert.equal(repairPendingEffectCalls(store), 0)
	assert.equal(writes().length, before + 2)
	console.log('PASS later cached-catalog changes are repaired again by validity, never hidden by an upgrade marker or posted automatically')
	assert.equal(existsSync(join(process.env.COPILOT_HOME!, 'session-state')), false)
	console.log('PASS isolated fictional homes; native MCP closes every call; no real worker or owner data')
} finally {
	for (const [i, name] of names.entries()) if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]
	rmSync(root, { recursive: true, force: true })
}
