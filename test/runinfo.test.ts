import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config, Job } from '../src/core/types.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-runinfo-local-'))
process.env.DELEGATE_NO_KICK = '1'
// Copilot's own session logs, for these tests only.
process.env.COPILOT_HOME = mkdtempSync(join(tmpdir(), 'delegate-runinfo-copilot-'))
const { Store, LOCAL_DIR } = await import('../src/store/state.ts')
const { readRun, runLines } = await import('../src/core/runinfo.ts')
const { runAgent } = await import('../src/adapters/agent.ts')
const { dispatch } = await import('../src/runner/dispatch.ts')
const { checkJobs } = await import('../src/runner/jobs.ts')
const { settingsView } = await import('../src/web/settings.ts')
const { statusText } = await import('../src/runner/status.ts')
const { item, stub } = await import('./fixture.ts')

// A made-up run: Kim asks about the Globex rollout; the model reads two notes side by side and answers.
const T0 = Date.parse('2026-10-21T09:00:00.000Z')
const at = (s: number) => new Date(T0 + s * 1000).toISOString()
// Each event has its own id, as the CLI's do.
let evs = 0
const ev = (type: string, data: unknown, s: number) => JSON.stringify({ type, data, id: `e${++evs}`, timestamp: at(s) })
const PROMPT = 'Kim asks when the Globex rollout ships to ring two'
const ANSWER = 'The Globex rollout ships on Friday'
const usage = (model: string, name: string, s: number, duration: number, i = 1000, o = 50) => ev('session.usage_record', { usage: { model, modelDisplayName: name, inputTokens: i, outputTokens: o, duration, timeToFirstTokenMs: 900 } }, s)
const COPILOT = [
	ev('session.start', { selectedModel: 'claude-opus-5.5', reasoningEffort: 'high' }, 1),
	ev('user.message', { content: PROMPT }, 2),
	// The first call ran from 5 s to 8 s: 5 s of start-up.
	usage('claude-opus-5.5', 'Claude Opus 5.5', 8, 3000),
	ev('tool.execution_start', { toolCallId: 't1', toolName: 'view', arguments: { path: '/notes/globex.md' } }, 9),
	ev('tool.execution_start', { toolCallId: 't2', toolName: 'grep' }, 10),
	ev('tool.execution_complete', { toolCallId: 't2', success: true }, 12),
	ev('tool.execution_complete', { toolCallId: 't1', success: true, result: { content: ANSWER } }, 14),
	ev('assistant.message', { content: ANSWER }, 18),
	usage('claude-opus-5.5', 'Claude Opus 5.5', 18, 4000, 2000, 70),
	ev('session.task_complete', { summary: ANSWER }, 19),
].join('\n')

const OPUS = { id: 'claude-opus-5.5', name: 'Claude Opus 5.5' }
// What Copilot's -p prints last: a result that names no model and no call.
const RESULT = JSON.stringify({ type: 'result', exitCode: 0, usage: { premiumRequests: 1, totalApiDurationMs: 6500, sessionDurationMs: 20000, codeChanges: { linesAdded: 0 } } })
const writeSession = (id: string, text: string) => { const d = join(process.env.COPILOT_HOME!, 'session-state', id); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'events.jsonl'), `${text}\n`) }

test('runinfo: a Copilot run records its model, calls, model time, tokens, tool calls and time, and start-up', () => {
	const { use, lastAt } = readRun(COPILOT, T0)
	assert.deepEqual(use, { models: [OPUS], modelCalls: 2, modelMs: 7000, tokensIn: 3000, tokensOut: 120, toolCalls: 2, toolMs: 5000, startMs: 5000 })
	assert.equal(lastAt, T0 + 19_000)
	// The CLI's line ends may be Windows ones.
	assert.deepEqual(readRun(COPILOT.replace(/\n/g, '\r\n'), T0).use, use)
	// A job's log also holds other programs' lines: a JSON one with its own time does not move the run's end.
	assert.equal(readRun(`${COPILOT}\n${JSON.stringify({ level: 'info', msg: 'mcp server up', timestamp: at(100) })}`, T0).lastAt, T0 + 19_000)
	// Without the launch time, start-up cannot be told.
	assert.equal(readRun(COPILOT).use.startMs, undefined)
})

test('runinfo: bug 10-21 code review P0-1: Copilot\'s result line never hides the run; its session log names the models', () => {
	// The result line alone: no model, but its API time.
	assert.deepEqual(readRun(`${RESULT}\n`, T0).use, { modelMs: 6500 })
	// Its session log holds an earlier run too, before this one started, and the same tool events the output printed.
	const earlier = usage('gpt-6', 'GPT-6', -60, 5000)
	const stdout = [...COPILOT.split('\n').filter(l => l.includes('tool.execution') || l.includes('usage_record')), RESULT].join('\n')
	const { use } = readRun(stdout, T0, process.env, [earlier, COPILOT].join('\n'))
	assert.deepEqual(use, { models: [OPUS], modelCalls: 2, modelMs: 7000, tokensIn: 3000, tokensOut: 120, toolCalls: 2, toolMs: 5000, startMs: 5000 })
	// A shared session's calls after the run ended are not the run's; a log whose events put other keys before the type is still read.
	const later = usage('gpt-6', 'GPT-6', 60, 5000), reordered = COPILOT.split('\n').map(l => { const { type, ...rest } = JSON.parse(l); return JSON.stringify({ ...rest, type }) }).join('\n')
	assert.deepEqual(readRun(RESULT, T0, process.env, [COPILOT, later].join('\n'), T0 + 30_000).use.models, [OPUS])
	assert.deepEqual(readRun(RESULT, T0, process.env, reordered).use.models, [OPUS])
	// A CLI that writes both kinds of usage event for a call counts it once.
	const both = [COPILOT, ev('assistant.usage', { model: 'claude-opus-5.5', inputTokens: 1000, outputTokens: 50, duration: 3000 }, 8)].join('\n')
	assert.equal(readRun(both, T0).use.modelCalls, 2)
	assert.equal(readRun(ev('assistant.usage', { model: 'gpt-6', duration: 3000 }, 8), T0).use.modelCalls, 1)
})

test('runinfo: a run that switches models midway lists both, the most used first', () => {
	const out = [COPILOT, ev('session.model_change', { previousModel: 'claude-opus-5.5', newModel: 'gpt-6' }, 20), usage('gpt-6', 'GPT-6', 25, 2000)].join('\n')
	const { use } = readRun(out, T0)
	assert.deepEqual(use.models, [OPUS, { id: 'gpt-6', name: 'GPT-6' }])
	assert.equal(use.modelCalls, 3)
	assert.equal(use.modelMs, 9000)
	// A small helper model that ran first never reads as the run's model.
	assert.deepEqual(readRun([usage('claude-haiku-5.5', 'Claude Haiku 5.5', 3, 100), COPILOT].join('\n'), T0).use.models, [OPUS, { id: 'claude-haiku-5.5', name: 'Claude Haiku 5.5' }])
	assert.deepEqual(readRun(JSON.stringify({ type: 'result', num_turns: 2, modelUsage: { 'claude-haiku-5.5': { outputTokens: 5 }, 'claude-sonnet-5': { outputTokens: 900 } } })).use.models, [{ id: 'claude-sonnet-5' }, { id: 'claude-haiku-5.5' }])
	// A run that made no call yet names the model it started with.
	assert.deepEqual(readRun(ev('session.start', { selectedModel: 'gpt-6' }, 1)).use.models, [{ id: 'gpt-6' }])
})

test('runinfo: no JSON output, or garbage lines, gives no fields and never throws', () => {
	for (const out of ['', 'Error: something broke\n', 'garbage\n{bad json\n[1,2]\nnull\n42\n"text"', '{"type":"session.usage_record","data":{"usage":{"model":42}}}', '{"type":"result"}', JSON.stringify({ type: 'session.usage_record', data: null })])
		assert.deepEqual(readRun(out, T0).use, {}, out)
	// Good lines among garbage still count.
	assert.deepEqual(readRun(`noise\n${COPILOT}\n{oops`, T0).use.models, [OPUS])
})

test('runinfo: never records text from the prompt or the answer, or a token or key from the environment', () => {
	const env = { ...process.env, ACME_API_TOKEN: 'acme-sekret-0123456789' }
	const out = [
		COPILOT,
		usage('acme-sekret-0123456789', 'Fine name', 30, 10),
		// A made-up GitHub token, built here so the file itself holds none.
		usage(['gh', 'p_', '0123456789abcdefghij0123456789abcdef'].join(''), 'Other', 31, 10),
		usage('gpt-6', PROMPT, 32, 10),
		usage(ANSWER, 'GPT-6', 33, 10),
		usage('ships Friday', 'GPT-6', 35, 10),
		// Short enough for a name, but a sentence.
		usage('gpt-6', 'Rita asked if Acme ships in May', 34, 10),
	].join('\n')
	const all = JSON.stringify(readRun(out, T0, env))
	for (const bad of [PROMPT, ANSWER, 'Friday', 'Globex', 'sekret', 'ghp_', '/notes/', 'Rita']) assert.ok(!all.includes(bad), `${bad} is not recorded: ${all}`)
	assert.deepEqual(readRun(out, T0, env).use.models, [OPUS, { id: 'gpt-6' }])
})

test('runinfo: a Claude result gives its models, tokens, turns, and model time; tools and start-up stay empty', () => {
	const claude = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 9000, duration_api_ms: 6100, num_turns: 3, result: ANSWER, session_id: 's',
		usage: { input_tokens: 10, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000, output_tokens: 90 }, modelUsage: { 'claude-sonnet-5': { inputTokens: 10, outputTokens: 90, costUSD: 0.1 } } }, null, 2)
	const { use } = readRun(claude, T0)
	assert.deepEqual(use, { models: [{ id: 'claude-sonnet-5' }], modelCalls: 3, modelMs: 6100, tokensIn: 3210, tokensOut: 90 })
	assert.ok(!JSON.stringify(use).includes('Friday'))
})

const sh = (lines: string, then = '') => ['sh', '-c', `cat <<'EOF'\n${lines}\nEOF\n${then}`]
const WORKER = { sessionId: '00000000-0000-0000-0000-000000000001', prompt: PROMPT, mcpConfigPath: '/w/mcp-1.json', extraTools: [] }

test('runinfo: the AI run hands back what it used; garbage output still succeeds, with no fields', { skip: process.platform === 'win32' && 'POSIX shell test' }, async () => {
	const cwd = mkdtempSync(join(tmpdir(), 'runinfo-run-'))
	const now = Date.now(), live = (s: number) => new Date(now + s * 1000).toISOString()
	const out = [JSON.stringify({ type: 'session.start', data: { selectedModel: 'claude-opus-5.5' }, timestamp: live(0) }), JSON.stringify({ type: 'session.usage_record', data: { usage: { model: 'claude-opus-5.5', modelDisplayName: 'Claude Opus 5.5', duration: 100, inputTokens: 5, outputTokens: 1 } }, timestamp: live(2) })].join('\n')
	const good = await runAgent({ flavor: 'copilot', command: sh(out), tools: [] }, { ...WORKER, cwd, dirs: [] }, 10_000)
	assert.equal(good.exitCode, 0)
	assert.deepEqual(good.used?.models, [OPUS])
	assert.equal(good.used?.modelCalls, 1)
	assert.ok((good.used?.startMs ?? -1) >= 0, 'start-up is from the launch to the first call')
	const bad = await runAgent({ flavor: 'copilot', command: sh('not json at all\n{half'), tools: [] }, { ...WORKER, cwd, dirs: [] }, 10_000)
	assert.equal(bad.exitCode, 0)
	assert.equal(bad.error, undefined)
	assert.equal(bad.used, undefined)
})

test('runinfo: bug 10-21 code review P0-1: a Copilot run that prints only its result is read from its session log', { skip: process.platform === 'win32' && 'POSIX shell test' }, async () => {
	const cwd = mkdtempSync(join(tmpdir(), 'runinfo-session-')), id = '00000000-0000-0000-0000-0000000000a1', now = Date.now()
	const live = (type: string, data: unknown, s: number) => JSON.stringify({ type, data, id: `l${s}`, timestamp: new Date(now + s * 1000).toISOString() })
	writeSession(id, [live('session.usage_record', { usage: { model: 'gpt-6', modelDisplayName: 'GPT-6', duration: 100 } }, -3600), live('session.usage_record', { usage: { model: 'claude-opus-5.5', modelDisplayName: 'Claude Opus 5.5', duration: 100 } }, 1)].join('\n'))
	const res = await runAgent({ flavor: 'copilot', command: sh(RESULT, 'sleep 1.5'), tools: [] }, { ...WORKER, sessionId: id, cwd, dirs: [] }, 10_000)
	assert.equal(res.exitCode, 0)
	assert.deepEqual(res.used?.models, [OPUS], 'only this run\'s calls, from the session log')
	// A Claude run never reads a Copilot log, even one with calls in its time.
	writeSession(id, live('session.usage_record', { usage: { model: 'gpt-6', modelDisplayName: 'GPT-6', duration: 100 } }, 60))
	const claude = await runAgent({ flavor: 'claude', command: sh(RESULT), tools: [] }, { ...WORKER, sessionId: id, cwd, dirs: [] }, 10_000)
	assert.equal(claude.used?.models, undefined)
})

test('runinfo: a run stopped by its time limit keeps what it saw before it stopped', { skip: process.platform === 'win32' && 'POSIX shell test' }, async () => {
	const cwd = mkdtempSync(join(tmpdir(), 'runinfo-slow-'))
	const res = await runAgent({ flavor: 'copilot', command: sh(COPILOT.split('\n').slice(0, 4).join('\n'), 'exec sleep 30'), tools: [] }, { ...WORKER, cwd, dirs: [] }, 1500)
	assert.match(res.error ?? '', /timed out/)
	assert.deepEqual(res.used?.models, [OPUS])
	assert.equal(res.used?.modelCalls, 1)
	assert.equal(res.used?.toolCalls, 1)
	// The tool still running at the stop ran until the last event seen.
	assert.equal(readRun(COPILOT.split('\n').slice(0, 4).join('\n'), T0).use.toolMs, 0)
	assert.equal(readRun(COPILOT.split('\n').slice(0, 5).join('\n'), T0).use.toolMs, 1000)
})

const CFG: Config = {
	schema: 1, owner: { id: 'me', name: 'Robin Park' }, source: { command: [], selfChatId: 'self' }, watch: [],
	agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 1, nudgeEveryMin: 30, quiet: { from: '00:00', to: '00:00' }, summaryAt: 'off',
}
const newStore = (cfg: Partial<Config> = {}) => { const s = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-runinfo-root-')), machine: 'mac' }); s.saveConfig({ ...CFG, ...cfg }); return s }
const logged = (s: InstanceType<typeof Store>, event: string) => s.logs(1).filter(e => e.event === event)

test('runinfo: a draft and an ask put what they used on their worker and ask events; a run that said nothing adds no fields', async () => {
	const s = newStore()
	item(s, 'A1', 'Kim', 'Globex rollout', { state: 'running' })
	item(s, 'A2', 'Rita', 'Acme launch', { state: 'needs_human', notes: [{ q: 'When is the launch?', at: new Date().toISOString() }] } as never)
	const used = readRun(COPILOT, T0).use
	await dispatch(s, stub, s.config(), async () => ({ exitCode: 0, ms: 90_000, used }))
	const [w] = logged(s, 'worker'), [a] = logged(s, 'ask')
	assert.deepEqual({ models: w.models, modelCalls: w.modelCalls, modelMs: w.modelMs, toolMs: w.toolMs, startMs: w.startMs, runKind: w.runKind, ms: w.ms }, { models: [OPUS], modelCalls: 2, modelMs: 7000, toolMs: 5000, startMs: 5000, runKind: 'draft', ms: 90_000 })
	assert.equal(a.runKind, 'ask')
	assert.deepEqual(a.models, [OPUS])
	// Old-style runs, and runs whose output said nothing, log as before.
	const s2 = newStore()
	item(s2, 'A1', 'Kim', 'Globex rollout', { state: 'running' })
	await dispatch(s2, stub, s2.config(), async () => ({ exitCode: 0, ms: 5 }))
	const [w2] = logged(s2, 'worker')
	assert.ok(w2 && !('models' in w2) && !('runKind' in w2), JSON.stringify(w2))
})

function jobRun(s: InstanceType<typeof Store>, key: string, over: Partial<NonNullable<Job['run']>> = {}, purpose: Job['purpose'] = 'work'): Job {
	const now = new Date().toISOString(), runId = `run-${Math.random().toString(36).slice(2)}`
	const job: Job = { schema: 1, id: `j-${runId}`, key, goal: 'Review the PR', session: { agent: 'copilot', id: '00000000-0000-0000-0000-000000000009' }, state: 'running', purpose, parents: [], asks: ['Kim: review it'],
		run: { id: runId, pid: 999_999, startedAt: new Date(T0).toISOString(), machine: 'mac', purpose, asks: 1, ...over }, createdAt: now, updatedAt: now } as Job
	s.saveJob(job)
	mkdirSync(join(LOCAL_DIR, 'sessions'), { recursive: true })
	writeFileSync(join(LOCAL_DIR, 'sessions', `${runId}.log`), `${COPILOT}\nsome stderr line\n`)
	return job
}
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {}, bootMs: () => T0 - 86_400_000 }
const runEvents = (s: InstanceType<typeof Store>, runId: string) => s.logs(1).filter(e => e.runId === runId && e.event !== 'job-start').map(e => e.event)

test('runinfo: a job run that ends puts what it used, read from its log, on the event that ends it', async () => {
	const s = newStore()
	const review = jobRun(s, 'pr:acme/42')
	s.writeReport({ workflowId: review.id, intent: 'other', state: 'needs_human', summary: 'Reviewed' }, review.run!.id)
	// Out of time with no report: the wrap-up event keeps what the run saw.
	const slow = jobRun(s, 'look:globex-latency')
	// A PR review named by its intent, whatever its key; a change run; a run whose log is garbage records nothing and stops no other job.
	const byIntent = { ...jobRun(s, 'look:acme-review'), intent: 'pr_review' } as Job
	s.saveJob(byIntent)
	s.writeReport({ workflowId: byIntent.id, intent: 'pr_review', state: 'needs_human', summary: 'Reviewed' }, byIntent.run!.id)
	const change = jobRun(s, 'pr:acme/44', {}, 'execute')
	const made = jobRun(s, 'pr:acme/47', {}, 'execute')
	s.writeReport({ workflowId: made.id, intent: 'pr_review', state: 'done', summary: 'Made the changes' }, made.run!.id)
	const broken = jobRun(s, 'pr:acme/45')
	writeFileSync(join(LOCAL_DIR, 'sessions', `${broken.run!.id}.log`), `Error: out of memory\n{"type":"session.usage_record","data":{"usage":{"model":{"x":1}}}}\n${'x'.repeat(1_000_000)}\n{half`)
	await checkJobs(s, stub, s.config(), procs)
	const done = logged(s, 'job-done').find(e => e.job === review.id)!, wrap = logged(s, 'job-wrap-up').find(e => e.job === slow.id)!
	assert.equal(logged(s, 'job-done').find(e => e.job === byIntent.id)?.runKind, 'review')
	assert.deepEqual(s.logs(1).filter(e => e.job === change.id && e.runKind).map(e => [e.event, e.runKind]), [['job-failed', 'change']])
	assert.equal(logged(s, 'job-executed').find(e => e.job === made.id)?.runKind, 'change')
	const brokenEnd = s.logs(1).find(e => e.job === broken.id && e.event !== 'job-start')
	assert.ok(brokenEnd && !('models' in brokenEnd), JSON.stringify(brokenEnd))
	assert.deepEqual({ models: done.models, runKind: done.runKind, runId: done.runId, ms: done.ms, startMs: done.startMs }, { models: [OPUS], runKind: 'review', runId: review.run!.id, ms: 19_000, startMs: 5000 })
	assert.deepEqual({ models: wrap.models, runKind: wrap.runKind, runId: wrap.runId }, { models: [OPUS], runKind: 'job', runId: slow.run!.id })
	// A run on another machine has no log here: its event is as before.
	const s2 = newStore()
	const far = jobRun(s2, 'pr:acme/43', { machine: 'win' })
	s2.writeReport({ workflowId: far.id, intent: 'other', state: 'needs_human', summary: 'Reviewed' }, far.run!.id)
	await checkJobs(s2, stub, s2.config(), procs)
	const [done2] = logged(s2, 'job-done')
	assert.ok(done2 && !('models' in done2), JSON.stringify(done2))
})

test('runinfo: bug 10-21 code review P2-4, P2-8: every way a job run ends records it exactly once', async () => {
	const s = newStore(), recent = { startedAt: new Date(Date.now() - 60_000).toISOString() }
	// A change run whose ok was withdrawn is stopped; a run that died with no report is tried again; a tracker check; a run cut by a restart.
	const stopped = jobRun(s, 'pr:acme/50', { ...recent, pid: 4242 }, 'execute')
	const retried = jobRun(s, 'look:acme-flaky', recent)
	const tracker = { ...jobRun(s, 'track:acme-build', recent), every: 60 } as Job
	s.saveJob(tracker)
	s.writeReport({ workflowId: tracker.id, intent: 'other', state: 'needs_human', summary: 'Build 7 is green' }, tracker.run!.id)
	await checkJobs(s, stub, s.config(), { ...procs, alive: (pid: number) => pid === 4242 })
	assert.deepEqual(runEvents(s, stopped.run!.id), ['job-execute-stopped'])
	assert.deepEqual(runEvents(s, retried.run!.id), ['retry-planned'])
	assert.deepEqual(runEvents(s, tracker.run!.id), ['track-check'])
	const s2 = newStore(), rebooted = jobRun(s2, 'look:acme-slow', recent)
	await checkJobs(s2, stub, s2.config(), { ...procs, bootMs: () => Date.now() })
	assert.deepEqual(runEvents(s2, rebooted.run!.id), ['job-resumed-after-restart'])
	// A Copilot job whose log holds only the result line is read from its session log.
	const s3 = newStore(), quiet = jobRun(s3, 'pr:acme/51')
	writeFileSync(join(LOCAL_DIR, 'sessions', `${quiet.run!.id}.log`), `${RESULT}\n`)
	writeSession(quiet.session.id, COPILOT)
	s3.writeReport({ workflowId: quiet.id, intent: 'pr_review', state: 'needs_human', summary: 'Reviewed' }, quiet.run!.id)
	await checkJobs(s3, stub, s3.config(), procs)
	assert.deepEqual(logged(s3, 'job-done')[0].models, [OPUS])
})

// Log lines as the runner writes them; `daysAgo` places them in time.
function seedRuns(s: InstanceType<typeof Store>, lines: Record<string, unknown>[]) {
	const dir = join(s.root, 'state', 'log')
	mkdirSync(dir, { recursive: true })
	const byDay = new Map<string, string[]>()
	for (const { daysAgo = 0, fileDaysAgo = daysAgo, ...l } of lines) {
		const when = new Date(Date.now() - (daysAgo as number) * 86_400_000).toISOString()
		const f = join(dir, `${new Date(Date.now() - (fileDaysAgo as number) * 86_400_000).toISOString().slice(0, 10)}-mac.jsonl`)
		byDay.set(f, [...(byDay.get(f) ?? []), JSON.stringify({ at: when, ...l })])
	}
	for (const [f, ls] of byDay) writeFileSync(f, `${ls.join('\n')}\n`, { flag: 'a' })
}
const draftRun = (n: number, o: Record<string, unknown> = {}) => ({ event: 'worker', runId: `d${n}`, runKind: 'draft', models: [OPUS], ...o })

test('runinfo: Settings says what model is set, and "not recorded yet" while only old events exist', () => {
	const s = newStore()
	seedRuns(s, [{ event: 'worker', runId: 'r1', ms: 90_000 }, { event: 'ask', runId: 'r2', ms: 97_000 }])
	assert.deepEqual(settingsView(s).models, { set: 'Uses the AI CLI\'s default', lines: ['Models that ran: not recorded yet.'] })
	s.saveConfig({ ...s.config(), agent: { ...s.config().agent, model: 'gpt-6' } })
	assert.equal(settingsView(s).models.set, 'Set to: gpt-6')
	// A run that named the model gives its display name.
	seedRuns(s, [{ event: 'ask', runId: 'a1', runKind: 'ask', models: [{ id: 'gpt-6', name: 'GPT-6' }] }])
	assert.equal(settingsView(s).models.set, 'Set to: gpt-6 (GPT-6)')
})

test('runinfo: a job run whose end logs nothing of its own (asks came in meanwhile) still records what it used', async () => {
	const s = newStore()
	const job = jobRun(s, 'pr:acme/46')
	s.saveJob({ ...job, asks: [...job.asks, 'Rita: and the tests?'] })
	s.writeReport({ workflowId: job.id, intent: 'pr_review', state: 'needs_human', summary: 'Reviewed' }, job.run!.id)
	await checkJobs(s, stub, s.config(), procs)
	assert.equal(logged(s, 'job-done').length, 0)
	const [r] = logged(s, 'job-run')
	assert.deepEqual({ job: r.job, runKind: r.runKind, models: r.models }, { job: job.id, runKind: 'review', models: [OPUS] })
})

test('runinfo: bug 10-21 code review P2-1: a log file that cannot be read never fails the Settings poll', () => {
	const s = newStore()
	seedRuns(s, [draftRun(1, { ms: 10_000 })])
	s.logOf = () => { throw new Error('ENOENT: rotated away') }
	assert.deepEqual(settingsView(s).models.lines, ['Models that ran: not recorded yet.'])
})

test('runinfo: Settings reads a log file again only when it changed', () => {
	const s = newStore()
	seedRuns(s, [draftRun(1, { ms: 10_000 })])
	let reads = 0
	const logOf = s.logOf.bind(s)
	s.logOf = (f: string) => { reads++; return logOf(f) }
	settingsView(s); settingsView(s)
	assert.equal(reads, 1, 'a poll with nothing new reads no log')
	seedRuns(s, [draftRun(2, { ms: 30_000 })])
	assert.deepEqual(settingsView(s).models.lines, ['Drafts: Claude Opus 5.5, 2 runs, typical 20 s'])
	assert.equal(reads, 2)
})

test('runinfo: Settings shows, per kind of run in the last 7 days, the models, the runs, and the typical time split', () => {
	const s = newStore()
	seedRuns(s, [
		draftRun(1, { ms: 80_000, modelMs: 50_000, toolMs: 20_000, startMs: 4000 }),
		draftRun(2, { ms: 90_000, modelMs: 55_000, toolMs: 30_000, startMs: 5000 }),
		draftRun(3, { ms: 167_000, modelMs: 70_000, toolMs: 80_000, startMs: 9000 }),
		// The same run logged twice counts once; an old event without fields is ignored; a run 8 days ago is out of the window.
		draftRun(3, { ms: 167_000, modelMs: 70_000, toolMs: 80_000, startMs: 9000 }),
		{ event: 'worker', runId: 'old', ms: 400_000 },
		{ event: 'worker', runId: 'none', runKind: 'draft', models: [], ms: 400_000 },
		draftRun(9, { ms: 999_000, daysAgo: 8 }),
		// A machine whose log file is recent still keeps an old line out.
		draftRun(10, { ms: 999_000, daysAgo: 8, fileDaysAgo: 0 }),
		{ event: 'job-done', runId: 'j1', runKind: 'review', models: [OPUS, { id: 'gpt-6', name: 'GPT-6' }], ms: 300_000, modelMs: 200_000 },
		{ event: 'job-done', runId: 'j2', runKind: 'review', models: [OPUS], ms: 200_000, modelMs: 100_000 },
		{ event: 'ask', runId: 'a1', runKind: 'ask', models: [{ id: 'claude-sonnet-5' }], ms: 600 },
		{ event: 'job-executed', runId: 'c1', runKind: 'change', models: [OPUS] },
		// Inside the window, in a file named a day before it (a machine west of UTC); model and tool time that overlap.
		{ event: 'track-check', runId: 't1', runKind: 'job', models: [OPUS], ms: 100_000, modelMs: 80_000, toolMs: 60_000, daysAgo: 6.9, fileDaysAgo: 8 },
	])
	assert.deepEqual(settingsView(s).models.lines, [
		'Drafts: Claude Opus 5.5, 3 runs, typical 90 s (model 55 s, tools 30 s, start-up 5 s)',
		'Reviews: Claude Opus 5.5 (2), GPT-6 (1), 2 runs, typical 250 s (model 146 s, other 104 s)',
		'Asks: claude-sonnet-5, 1 run, typical under 1 s',
		'Changes you approved: Claude Opus 5.5, 1 run',
		'Tracking and other jobs: Claude Opus 5.5, 1 run, typical 100 s (model 57 s, tools 43 s)',
	])
})

test('runinfo: status says which models ran today', () => {
	const s = newStore()
	assert.match(statusText(s), /^AI models today: none recorded yet$/m)
	seedRuns(s, [draftRun(1), draftRun(2), { event: 'ask', runId: 'a1', runKind: 'ask', models: [{ id: 'gpt-6', name: 'GPT-6' }] }, { event: 'worker', runId: 'old' }])
	assert.match(statusText(s), /^AI models today: Claude Opus 5\.5 \(2 runs\), GPT-6 \(1 run\)$/m)
	// The same line, from the summary of events.
	assert.deepEqual(runLines([]), [])
})
