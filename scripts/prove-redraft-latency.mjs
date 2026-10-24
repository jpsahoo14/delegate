// Manual #29 proof with the installed runtime and a local delayed model, outside npm test/CI.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = dirname(dirname(fileURLToPath(import.meta.url)))
const load = (...p) => import(pathToFileURL(join(repo, ...p)).href)
const { cliPackage } = await load('src', 'host', 'locate.ts')
const pkg = cliPackage()
if (!pkg) throw new Error('Install the Copilot CLI before running this proof')
const root = mkdtempSync(join(tmpdir(), 'delegate-redraft-'))
const ownerSessions = join(homedir(), '.copilot', 'session-state')
const before = new Set(existsSync(ownerSessions) ? readdirSync(ownerSessions) : [])
for (const name of ['local', 'copilot', 'config', 'cache', 'data']) mkdirSync(join(root, name))
Object.assign(process.env, {
  DELEGATE_ROOT: root, DELEGATE_LOCAL: join(root, 'local'), COPILOT_HOME: join(root, 'copilot'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'),
  DELEGATE_COPILOT_PKG: pkg.dir, DELEGATE_WORKER: '1', DELEGATE_NO_KICK: '1',
})
writeFileSync(join(root, 'copilot', 'mcp-config.json'), '{"mcpServers":{}}')
writeFileSync(join(root, 'local', 'local.json'), JSON.stringify({ root, machine: 'acme-pc' }))
const { Store } = await load('src', 'store', 'state.ts')
const { hostRunner } = await load('src', 'host', 'client.ts')
const { dispatch, workerMcp, WORKER_TOOLS } = await load('src', 'runner', 'dispatch.ts')
const { tick } = await load('src', 'runner', 'tick.ts')
const { runWindow } = await load('src', 'runner', 'continue.ts')
const { sessionLog } = await load('src', 'adapters', 'agent.ts')
const { buildArgs } = await load('src', 'adapters', 'agent.ts')
const store = new Store({ root, machine: 'acme-pc' })
const check = (ok, message) => { if (!ok) throw new Error(message); console.log(`PASS ${message}`) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let seed = false, timed = false, item, promptSeen = '', failure, contextOverride
const calls = []
const model = createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw || '{}')
    const inputTokens = Math.ceil(JSON.stringify(body.messages).length / 4)
    const tools = (body.tools ?? []).map(t => t.function?.name ?? t.name)
    const report = tools.find(n => n.endsWith('submit_report'))
    if (!report) throw new Error('Model request omitted submit_report')
    const reported = body.messages?.at(-1)?.role === 'tool'
    promptSeen = body.messages?.filter(m => m.role === 'user').at(-1)?.content ?? ''
    const workflowId = /\bWorkflow ([\w-]+)/.exec(promptSeen)?.[1] ?? item.id
    const ms = timed ? 1500 + inputTokens / 10 : 0
    calls.push({ inputTokens, ms, reported })
    if (ms) await delay(ms)
    const message = seed || reported ? { role: 'assistant', content: 'Fictional history retained.' } : {
      role: 'assistant', content: null, tool_calls: [{
        id: `call_${randomUUID()}`, type: 'function',
        function: { name: report, arguments: JSON.stringify({
          workflowId, intent: 'other', state: 'needs_human', summary: 'Draft ready',
          ...(contextOverride ? { context: contextOverride } : {}),
          ...(promptSeen.includes('kind "ask"') ? { answer: 'The review found the missing guard.' } :
            { reply: { text: 'The review found the missing guard. Kim will check it.', commitment: false, sources: [] } }),
        }) },
      }],
    }
    const base = { id: randomUUID(), object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'acme-model' }
    const finish = seed || reported ? 'stop' : 'tool_calls'
    if (body.stream) {
      const delta = { ...message, ...(message.tool_calls ? { tool_calls: message.tool_calls.map((t, index) => ({ ...t, index })) } : {}) }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: { prompt_tokens: inputTokens, completion_tokens: 16, total_tokens: inputTokens + 16 } })}\n\ndata: [DONE]\n\n`)
    } else {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ...base, choices: [{ index: 0, message, finish_reason: finish }], usage: { prompt_tokens: inputTokens, completion_tokens: 16, total_tokens: inputTokens + 16 } }))
    }
  } catch (e) { failure = e; res.writeHead(500); res.end(String(e)) }
})
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve))
Object.assign(process.env, {
  COPILOT_PROVIDER_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`, COPILOT_PROVIDER_API_KEY: 'fictional',
  COPILOT_PROVIDER_MODEL_ID: 'acme-model', COPILOT_PROVIDER_WIRE_API: 'completions',
})
const cfg = {
  schema: 1, owner: { id: 'robin', name: 'Robin' }, tz: 'UTC',
  source: { command: [], selfChatId: 'self' }, watch: [], discover: false, channels: false,
  maxParallel: 1, dailyRuns: 200, nudgeEveryMin: 30,
  agent: { flavor: 'copilot', command: [process.execPath, pkg.runtime], model: 'acme-model',
    tools: ['view', 'glob', 'grep'], hostIdleMin: 540, mcpServers: {} },
  chatLevels: { 'private-planning': { level: 'private', name: 'Private planning' } },
}
store.saveConfig(cfg)
const src = {
  selfChatId: 'self', newMessages: async () => ({ msgs: [], truncated: false }),
  recentChats: async () => [], recent: async () => [], send: async () => { throw new Error('No sends in this proof') },
  sendSelf: async () => ({ msgId: randomUUID() }), deleteMessage: async () => {}, editMessage: async () => {},
  presence: async () => ({ availability: 'Available' }), close: async () => {},
}
const procs = {
  alive: () => false, kill: () => { throw new Error('No process kills in this proof') },
  start: () => { throw new Error('Unexpected job start') }, openWindow: () => { throw new Error('No real windows') },
}
let number = 0
const make = () => {
  const at = new Date().toISOString(), id = randomUUID()
  const w = { schema: 1, id, code: `A${++number}`, kind: 'reply', state: 'running',
    key: { type: 'thread', id }, chat: { id, name: 'Acme planning', group: true, test: true },
    asker: { id: 'kim', name: 'Kim' }, session: { agent: 'copilot', id: randomUUID() },
    lastMsgId: '101', lastAsk: 'Summarize the review.', pending: ['101'], msgIds: ['101'],
    ownerAnswer: 'Keep the finding and make it shorter.', status: 'Drafting the review.', newCount: 1, createdAt: at, updatedAt: at, revAt: at,
    context: [{ label: 'Found on PR', text: 'The missing guard permits an empty plan.' }],
    draft: { text: 'The review found the missing guard.', commitment: false, sources: [] },
    drewOn: ['private-planning'], shareHold: 'Uses private planning' }
  const jobId = randomUUID()
  store.saveJob({ schema: 1, id: jobId, key: 'review:acme', goal: 'Check the guard', state: 'done', purpose: 'work',
    session: { agent: 'copilot', id: randomUUID() }, parents: [id], asks: [],
    result: { summary: 'The missing guard permits an empty plan.', effects: [] },
    createdAt: at, updatedAt: at })
  w.job = jobId
  store.save(w, false)
  store.saveThread(id, [{ id: '101', at, from: w.asker, byOwner: false, text: w.lastAsk }])
  return w
}
const direct = async (w, prompt) => {
  const runId = randomUUID()
  return hostRunner(store)(cfg.agent, { ...workerMcp(store, w.id, runId), workflowId: w.id, runId,
    sessionId: w.session.id, prompt, extraTools: WORKER_TOOLS, dirs: [] })
}
const stats = rows => {
  const sorted = [...rows].sort((a, b) => a - b)
  return { p50: Math.round(sorted[Math.ceil(sorted.length * .5) - 1]), p90: Math.round(sorted[Math.ceil(sorted.length * .9) - 1]) }
}
try {
  item = make()
  seed = true
  for (let i = 0; i < 30; i++) await direct(item, `Fictional history ${i}. ${'Acme plan guard context. '.repeat(210)}`)
  const historyFile = join(root, 'copilot', 'session-state', item.session.id, 'events.jsonl')
  const historyBefore = readFileSync(historyFile, 'utf8')
  seed = false; timed = true
  const baseline = [], compact = [], baselineTokens = [], compactTokens = []
  for (let i = 0; i < 10; i++) {
    const from = calls.length, t = performance.now()
    await direct(item, 'Rewrite the previous draft, keeping the missing guard.')
    baseline.push(performance.now() - t)
    baselineTokens.push(...calls.slice(from).map(c => c.inputTokens))
  }
  const oldHistory = readFileSync(historyFile, 'utf8')
  check(oldHistory.startsWith(historyBefore), 'baseline really resumes thirty turns')
  item.state = 'needs_human'; store.save(item, false)
  for (let i = 0; i < 10; i++) {
    item = make()
    const old = item.session.id, from = calls.length, t = performance.now()
    await dispatch(store, src, cfg, hostRunner(store), undefined, [item.id])
    compact.push(performance.now() - t)
    compactTokens.push(...calls.slice(from).map(c => c.inputTokens))
    const fresh = store.workflow(item.id)
    check(fresh.session.id !== old && fresh.draft?.text.includes('missing guard'), 'fresh item session saves findings draft')
    check(fresh.drewOn?.includes('private-planning') && fresh.shareHold && fresh.state !== 'scheduled', 'prior private source still blocks automatic send')
    check(promptSeen.includes('Last result of review:acme') && promptSeen.includes('Found on PR') &&
      promptSeen.includes('call tools only for what the answer asks'), 'compact prompt carries result, findings and answer guidance')
    check(existsSync(join(root, 'sessions', fresh.session.id, 'events.jsonl')), 'latest item history is backed up')
    check(fresh.context?.some(f => f.label === 'Found on PR'), 'review findings survive the new draft for the next rewrite')
  }
  check(Math.max(...compactTokens) < 12000, 'fresh model input is below 12k tokens per call')
  check(stats(compact).p50 <= 15000, 'ten warm redrafts meet 15 s p50 on the delayed stub model')
  check(stats(baseline).p50 > stats(compact).p50 * 2, 'fresh sessions remove the measured history cost')
  check(readFileSync(historyFile, 'utf8') === oldHistory, 'fresh redrafts never rewrite old history')
  const workers = store.logs(1).filter(e => e.event === 'worker' && e.fresh)
  check(workers.length === 10 && workers.every(e => e.warm && e.calls >= 1 && e.inputTokens > 0 && e.toolCalls <= 1), 'all ten fresh runs are warm and record usage with at most one report call')
  console.log(JSON.stringify({ model: 'LOCAL STUB: 1 s per 10k estimated tokens + 1.5 s/call',
    baselineMs: stats(baseline), freshMs: stats(compact), baselineTokens: stats(baselineTokens), freshTokens: stats(compactTokens) }))
  timed = false
  item = make()
  for (const text of ['The guard needs an empty-plan check.', 'The guard is now fixed.']) {
    item = store.workflow(item.id); item.state = 'running'; item.ownerAnswer = 'Update the finding.'
    store.save(item, false)
    contextOverride = [{ label: 'Found on PR', text }, ...(text.includes('needs') ? [{ label: 'Reply-only fact', text: 'Superseded wording.' }] : [])]
    await dispatch(store, src, cfg, hostRunner(store), undefined, [item.id])
    const fresh = store.workflow(item.id)
    check(fresh.context.filter(f => f.label === 'Found on PR').length === 1 && fresh.context.find(f => f.label === 'Found on PR').text === text,
      'reworded finding replaces its older label')
  }
  contextOverride = undefined
  check(store.workflow(item.id).context.length <= 12 && !store.workflow(item.id).context.some(f => f.label === 'Reply-only fact'),
    'reply-only facts do not become permanent job findings')
  item = make(); item.drewOn = ['shared-planning']
  item.shareHold = "It searched your chats and I couldn't tell which ones it read"
  store.save(item, false)
  await dispatch(store, { ...src, members: async () => ({ guests: false, ids: ['robin', 'kim'], names: { robin: 'Robin', kim: 'Kim' } }) },
    cfg, hostRunner(store), undefined, [item.id])
  check(store.workflow(item.id).shareHold === item.shareHold, 'unknown-read hold survives even when known chats share the audience')
  // A real tick starts the answer before intake; an external arrival during the turn holds its report.
  item = make()
  const id = item.id
  item.state = 'needs_human'; store.save(item, false)
  const submissionId = randomUUID()
  const answer = store.writeAnswer({ code: item.code, verb: 'answer', text: 'Keep the finding.', surface: 'panel', pageSubmissionId: submissionId })
  store.savePageSubmission({ id: submissionId, answerId: answer.id, fingerprint: 'fictional', item: item.code,
    rev: item.revAt, at: answer.at, phase: 'queued', accepted: true, ids: [answer.id], text: 'Queued', status: 202 })
  store.saveKick()
  let started = false, intakeSawRun = false
  const runner = async (agent, input) => {
    started = true
    check(store.pageSubmission(submissionId).text === 'Redrafting with your answer', 'receipt is acknowledged before the model turn')
    if (!store.workflow(id).msgIds.includes('102')) {
      const fresh = store.workflow(id)
      fresh.pending.push('102'); fresh.msgIds.push('102'); fresh.lastMsgId = '102'
      store.save(fresh, false)
    }
    await delay(200)
    return hostRunner(store)(agent, input)
  }
  const tickSource = { ...src }
  // Discovery is disabled; the watched chat's read supplies the same-tick message.
  cfg.watch = [{ id: item.chat.id, name: item.chat.name }]
  store.saveConfig(cfg)
  tickSource.newMessages = async chat => {
    if (chat === 'self') return { msgs: [], truncated: false }
    intakeSawRun = started
    return { msgs: [{ id: '103', at: new Date().toISOString(), from: item.asker, html: false, replyToId: '101',
      body: 'Robin, for the review, also say whether the missing guard allows an empty plan.' }], newest: '103', truncated: false }
  }
  await tick(store, { source: tickSource, run: runner, procs, force: true })
  check(!store.health().snapshot && existsSync(join(root, 'inbox.html')), 'tick also writes the real page snapshot without errors')
  check(intakeSawRun, 'answer dispatch starts before chat intake')
  check(store.thread(id).some(m => m.id === '103') && promptSeen.includes('allows an empty plan'), 'same-tick intake message is read and included in the normal rerun')
  check(store.logs(1).some(e => e.event === 'report-held' && e.workflowId === id && e.reason === 'newer-ask'), 'same-tick news holds the early report')
  check(store.logs(1).some(e => e.event === 'answer-dispatch' && e.tickMs <= 1500), 'answer reaches dispatch within 1.5 s of tick start')
  // Missing timestamps never qualify as fresh PR evidence; fresh timestamps avoid a read only for answer runs.
  cfg.watch = []; store.saveConfig(cfg)
  item = make(); item.prRead = '[41,"active","head",0]'; item.prReadAt = new Date().toISOString()
  item.lastAsk = 'Review https://dev.azure.com/acme/Acme/_git/widget/pullrequest/41'
  store.save(item, false)
  let reads = 0
  const probe = { pr: async () => { reads++; return { status: 'active', head: 'head', votes: [{ name: 'Robin', vote: 0 }] } } }
  await dispatch(store, src, cfg, hostRunner(store), probe, [item.id])
  check(reads === 0, 'answer reuses recent item-specific PR evidence')
  item = store.workflow(item.id); item.state = 'running'; item.ownerAnswer = 'Recheck the PR.'
  item.prReadAt = new Date(Date.now() - 11 * 60000).toISOString(); store.save(item, false)
  await dispatch(store, src, cfg, hostRunner(store), probe, [item.id])
  check(reads > 0, 'expired PR evidence is read again')
  // Ask-about-job keeps its session; Continue instead follows a newer item reply.
  item = make(); item.state = 'needs_human'; item.notes = [{ q: 'Explain the review.', at: new Date().toISOString() }]
  store.save(item, false)
  const jobSession = store.job(item.job).session.id
  seed = true
  await direct({ ...item, session: { ...item.session, id: jobSession } }, 'Fictional completed review history.')
  seed = false
  let askSession
  await dispatch(store, src, cfg, async (a, input) => { askSession = input.sessionId; return hostRunner(store)(a, input) }, undefined)
  check(askSession === jobSession && sessionLog('copilot', jobSession).includes('"session.resume"'), 'ask about a job really resumes the job session')
  const continuation = store.workflow(id)
  const args = buildArgs(cfg.agent, { sessionId: continuation.session.id, prompt: 'Continue', cwd: root, mcpConfigPath: join(root, 'mcp.json'), extraTools: [] })
  check(args.includes(continuation.session.id) && sessionLog('copilot', continuation.session.id).length > 0, 'latest item session remains resumable')
  const capture = join(root, 'capture.mjs'), captured = join(root, 'continued.json')
  writeFileSync(capture, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(captured)}, JSON.stringify(process.argv));`)
  runWindow(store, { ...cfg, agent: { ...cfg.agent, command: [process.execPath, capture] } }, continuation.code)
  check(JSON.parse(readFileSync(captured, 'utf8')).includes(continuation.session.id), 'Continue actually selects the latest reply, not the older job')
  if (failure) throw failure
} finally {
  try {
    const file = join(root, 'local', 'host.json')
    if (existsSync(file)) {
      const h = JSON.parse(readFileSync(file, 'utf8'))
      await new Promise(resolve => {
        const r = request({ host: '127.0.0.1', port: h.port, path: '/drain', method: 'POST',
          headers: { authorization: ['Bearer', h.token].join(' ') } }, res => { res.resume(); res.on('end', resolve) })
        r.on('error', resolve); r.end()
      })
      const end = performance.now() + 15000
      while (existsSync(file) && performance.now() < end) await delay(100)
      check(!existsSync(file), 'proof host stopped')
    }
  } finally { await new Promise(resolve => model.close(resolve)) }
  const added = (existsSync(ownerSessions) ? readdirSync(ownerSessions) : []).filter(n => !before.has(n))
  const proofOwned = added.filter(n => {
    const file = join(ownerSessions, n, 'workspace.yaml')
    return existsSync(file) && readFileSync(file, 'utf8').includes(root)
  })
  check(proofOwned.length === 0, 'zero proof-owned owner session additions')
  if (added.length) console.log(`Concurrent non-proof session additions: ${added.length}`)
  console.log(`PROOF_ROOT ${root}`)
}
