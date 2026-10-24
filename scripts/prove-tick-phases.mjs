// Manual #27 runner proof: 400 fictional items, simulated storage latency, real HTTP endpoints; no unit runner.
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { spawnSync, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const repo = process.cwd(), root = mkdtempSync(join(tmpdir(), 'delegate-tick-phases-'))
for (const dir of ['local', 'copilot', 'config', 'cache', 'data']) mkdirSync(join(root, dir))
Object.assign(process.env, { DELEGATE_ROOT: root, DELEGATE_LOCAL: join(root, 'local'), COPILOT_HOME: join(root, 'copilot'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'), DELEGATE_NO_KICK: '1' })
writeFileSync(join(root, 'local', 'local.json'), JSON.stringify({ root, machine: 'acme-pc' }))
writeFileSync(join(root, 'copilot', 'mcp-config.json'), '{"mcpServers":{}}')
const load = (...parts) => import(pathToFileURL(join(repo, ...parts)).href)
const { Store } = await load('src', 'store', 'state.ts')
const { fsTime, readPhase, freshRead, writeJson } = await load('src', 'store', 'fs.ts')
const { stampPlaces } = await load('src', 'runner', 'place.ts')
const { dispatch } = await load('src', 'runner', 'dispatch.ts')
const { applyAnswers } = await load('src', 'runner', 'apply.ts')
const { afterDraft, dueSends } = await load('src', 'runner', 'autosend.ts')
const { approveEffects, executeDirect, startJobs } = await load('src', 'runner', 'jobs.ts')
const { checkOpen } = await load('src', 'runner', 'continue.ts')
const { probePRs } = await load('src', 'runner', 'probe.ts')
const { recordCommit } = await load('src', 'runner', 'commit.ts')
const { serveInbox } = await load('src', 'web', 'server.ts')
const baseline = process.argv.find(a => a.startsWith('--baseline-ref='))?.split('=')[1]
let tick
if (baseline) {
  const source = execFileSync('git', ['show', `${baseline}:src/runner/tick.ts`], { cwd: repo, encoding: 'utf8' })
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    transformers: { before: [context => node => ts.visitEachChild(node, child => {
      if (ts.isImportDeclaration(child) && child.moduleSpecifier.text.startsWith('.'))
        return context.factory.updateImportDeclaration(child, child.modifiers, child.importClause,
          context.factory.createStringLiteral(pathToFileURL(resolve(repo, 'src', 'runner', child.moduleSpecifier.text)).href), child.attributes)
      return child
    }, context)] } }).outputText
  tick = (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).tick
} else ({ tick } = await load('src', 'runner', 'tick.ts'))
const samples = Number(process.argv.find(a => a.startsWith('--samples='))?.split('=')[1] ?? 20)
if (!Number.isInteger(samples) || samples < 1 || samples > 30) throw new Error('Use 1 through 30 samples')
const check = (ok, text) => { if (!ok) throw new Error(text); console.log(`PASS ${text}`) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const store = new Store({ root, machine: 'acme-pc' }), at = new Date().toISOString()
const cfg = { schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' },
  watch: [], discover: false, channels: false, maxParallel: 1, dailyRuns: 200, nudgeEveryMin: 30, tz: 'UTC',
  agent: { flavor: 'copilot', command: ['fictional'], tools: ['view'], host: false, mcpServers: {} } }
store.saveConfig(cfg); store.saveControl({ paused: false, stopped: false, autoSend: false })
store.saveNotify({ lastNudgeAt: at, summaryDay: at.slice(0, 10) })
store.saveProbeMark({ runFailRepairAt: at, partsRepairAt: at, noNewsRepairAt: at, blockedRepairAt: at, hostToolsUpgrade: 1, habitsAt: at })
store.saveUpgrades({ 'reply-sessions-1': at, 'draft-restore-37': at })
const item = i => ({ schema: 1, id: `acme-item-${i}`, code: `A${i + 1}`, kind: 'reply', state: 'needs_human',
  key: { type: 'thread', id: `chat-${i}` }, chat: { id: `chat-${i}`, name: `Acme planning ${i}`, test: true },
  asker: { id: 'kim', name: 'Kim' }, session: { agent: 'copilot', id: randomUUID() },
  lastMsgId: '101', pending: [], msgIds: ['101'], lastAsk: 'Please check the plan.',
  draft: { text: 'Check the Acme plan with Kim.', commitment: false, sources: [] },
  newCount: 0, status: 'Draft ready', createdAt: at, updatedAt: at, revAt: at })
for (let i = 0; i < 400; i++) {
  const w = item(i); store.save(w, false)
  store.saveThread(w.id, [{ id: '101', at, from: w.asker, text: w.lastAsk, byOwner: false }])
}
for (let i = 0; i < 55; i++) store.saveJob({ schema: 1, id: `acme-job-${i}`, key: `acme:${i}`, goal: 'Completed check',
  state: 'done', purpose: 'work', session: { agent: 'copilot', id: randomUUID() }, parents: [], asks: [],
  result: { summary: 'Completed check', effects: [], context: [] }, createdAt: at, updatedAt: at })
stampPlaces(store)
const src = { selfChatId: 'self', newMessages: async () => ({ msgs: [], truncated: false }), recentChats: async () => [],
  recent: async () => [], presence: async () => ({ availability: 'Available' }), close: async () => {},
  send: async () => { throw new Error('Unexpected send') }, sendSelf: async () => ({ msgId: '999' }) }
const procs = { alive: () => false, windowAlive: () => false, kill: () => { throw new Error('Unexpected kill') }, start: () => { throw new Error('Unexpected process') },
  openWindow: () => { throw new Error('Unexpected window') } }
const deps = { source: src, procs, history: { close: async () => {} }, run: async () => { throw new Error('Empty tick used AI') }, force: true }
const physical = { opens: 0, stats: 0, lists: 0 }
const original = { readFileSync: fs.readFileSync, statSync: fs.statSync, readdirSync: fs.readdirSync }
const latency = { opens: .35, stats: .05, lists: .1 }
const underRoot = path => typeof path === 'string' && (process.platform === 'win32' ? path.toLowerCase().startsWith(root.toLowerCase()) : path.startsWith(root))
const waitIO = ms => { const until = performance.now() + ms; while (performance.now() < until) {} }
for (const [method, counter] of [['readFileSync', 'opens'], ['statSync', 'stats'], ['readdirSync', 'lists']]) fs[method] = (...args) => {
  if (underRoot(args[0])) { physical[counter]++; waitIO(latency[counter]) }
  return original[method](...args)
}
syncBuiltinESMExports()
const measured = []
try {
  for (let i = 0; i < samples; i++) {
    const before = { ...fsTime }, p = { ...physical }, t = performance.now()
    const result = await tick(store, deps)
    if (result.runs || result.answers || result.asks || result.commands || store.health().snapshot) throw new Error('The measurement was not an error-free empty tick')
    measured.push({ ms: performance.now() - t,
      ...Object.fromEntries(Object.keys(fsTime).map(k => [k, fsTime[k] - before[k]])),
      physical: Object.fromEntries(Object.keys(physical).map(k => [k, physical[k] - p[k]])) })
  }
} finally { Object.assign(fs, original); syncBuiltinESMExports() }
const stats = values => { const a = [...values].sort((x, y) => x - y); return { p50: Math.round(a[Math.ceil(a.length / 2) - 1]), p90: Math.round(a[Math.ceil(a.length * .9) - 1]), max: Math.round(a.at(-1)) } }
const summary = { baseline, items: 400, jobs: 55, samples, simulatedDelayMs: latency, wallMs: stats(measured.map(x => x.ms)),
  reads: stats(measured.map(x => x.reads)), opens: stats(measured.map(x => x.physical.opens)), stats: stats(measured.map(x => x.physical.stats)),
  lists: stats(measured.map(x => x.physical.lists)), hits: stats(measured.map(x => x.hits)) }
writeFileSync(join(root, 'measurements.json'), JSON.stringify({ summary, measured }, null, 2))
console.log(`MEASUREMENTS ${JSON.stringify(summary)}`)
console.log(`PROOF_ROOT ${root}`)
if (baseline) process.exit(0)
const withinTarget = measured.every(x => x.ms <= 2000)
let entered, release
const waiting = new Promise(resolve => { entered = resolve }), hold = new Promise(resolve => { release = resolve })
const { server, url } = await serveInbox(() => store, 0, randomUUID(), () => undefined)
const external = (file, patch) => {
  const result = spawnSync(process.execPath, ['-e',
    "const fs=require('node:fs');const p=process.argv[1],o=JSON.parse(fs.readFileSync(p,'utf8'));Object.assign(o,JSON.parse(process.argv[2]));fs.writeFileSync(p+'.swap',JSON.stringify(o));fs.renameSync(p+'.swap',p)",
    file, JSON.stringify(patch)], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error(result.stderr || 'External update failed')
}
let running
try {
  running = tick(store, { ...deps, source: { ...src, newMessages: async () => { entered(); await hold; return { msgs: [], truncated: false } } } })
  await waiting
  external(join(root, 'config.json'), { owner: { id: 'robin', name: 'Robin Updated' }, dailyRuns: 701 })
  const timings = await Promise.all(['page', 'settings'].map(async path => {
    const target = new URL(url); target.pathname = `/api/v1/${path}`
    const t = performance.now(), response = await fetch(target), text = await response.text()
    check(response.status === 200, `real ${path} endpoint succeeds while tick awaits`)
    if (path === 'settings') check(JSON.parse(text).rows.some(row => row.key === 'dailyRuns' && row.value === '701'), 'page request has its own fresh scope')
    return { path, ms: performance.now() - t }
  }))
  release(); await running
  check(timings.every(x => x.ms <= 1000), 'page/settings are not blocked by an awaiting tick')
  check(store.config().owner.name === 'Robin Updated', 'tick does not lose an external config update')
  console.log(`HTTP_TIMINGS ${JSON.stringify(timings)}`)
} finally { release(); await running; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
const target = store.workflow('acme-item-0')
target.state = 'running'; target.pending = ['101']; target.ownerAnswer = 'Keep it short.'
store.save(target, false)
await readPhase('dispatch-commit-proof', () => dispatch(store, src, cfg, async (_, input) => {
  external(join(root, 'state', 'workflows', `${target.id}.json`), { pending: ['101', '102'], msgIds: ['101', '102'], earlier: 'External context' })
  store.writeReport({ workflowId: input.workflowId, intent: 'other', state: 'needs_human', summary: 'Draft ready',
    reply: { text: 'Check with Kim.', commitment: false, sources: [] } }, input.runId)
  return { exitCode: 0, ms: 1 }
}, undefined, [target.id]))
check(store.workflow(target.id).pending.includes('102') && store.workflow(target.id).earlier === 'External context' &&
  store.logs(1).some(e => e.event === 'report-held' && e.workflowId === target.id), 'model-return commit sees another process and holds an outdated report')
const merged = store.workflow('acme-item-1')
const commit = recordCommit(merged, () => store.workflow(merged.id), store.save.bind(store))
merged.status = 'Owned status'
external(join(root, 'state', 'workflows', `${merged.id}.json`), { earlier: 'First external value' })
const nestedCommit = recordCommit(merged, () => store.workflow(merged.id), store.save.bind(store))
nestedCommit()
external(join(root, 'state', 'workflows', `${merged.id}.json`), { earlier: 'Second external value' })
commit()
check(store.workflow(merged.id).status === 'Owned status' && store.workflow(merged.id).earlier === 'Second external value', 'nested commit handlers preserve unrelated changes from two processes')
const acquired = store.workflow('acme-item-6')
external(join(root, 'state', 'workflows', `${acquired.id}.json`), { earlier: 'Changed before committer creation' })
const acquiredCommit = recordCommit(acquired, () => store.workflow(acquired.id), store.save.bind(store))
acquired.status = 'Owned after acquisition'; acquiredCommit()
check(store.workflow(acquired.id).earlier === 'Changed before committer creation',
  'committer creation never mistakes an already external change for an owned field')
const sendItem = store.workflow('acme-item-2'), sendPath = join(root, 'state', 'workflows', `${sendItem.id}.json`)
let sent = 0
const sender = { ...src, recent: async () => [{ id: '101', at, from: sendItem.asker, body: sendItem.lastAsk, html: false }],
  send: async () => { sent++; external(sendPath, { earlier: 'Changed during send' }); return { msgId: '2001' } },
  deleteMessage: async () => { external(sendPath, { earlier: 'Changed during undo' }) } }
store.writeAnswer({ code: sendItem.code, verb: 'send', text: 'Check the Acme plan.', surface: 'panel' })
await readPhase('send-commit-proof', () => applyAnswers(store, sender, cfg, procs))
check(sent === 1 && store.workflow(sendItem.id).sent?.msgId === '2001' && !store.workflow(sendItem.id).ownerSend &&
  !store.workflow(sendItem.id).reason && store.workflow(sendItem.id).earlier === 'Changed during send',
  'real send receipt preserves an interleaved external item update')
await readPhase('repeat-answer-proof', () => applyAnswers(store, sender, cfg, procs))
check(sent === 1, 'processed send is not replayed')
store.writeAnswer({ code: sendItem.code, verb: 'undo', surface: 'panel' })
await readPhase('undo-commit-proof', () => applyAnswers(store, sender, cfg, procs))
check(!store.workflow(sendItem.id).sent && store.workflow(sendItem.id).earlier === 'Changed during undo', 'undo commit preserves an interleaved external update')
const ackItem = store.workflow('acme-item-7'), ackPath = join(root, 'state', 'workflows', `${ackItem.id}.json`)
writeJson(join(root, 'rules.compiled.json'), { rules: [{ id: 'acme-ack', who: { accounts: [ackItem.asker] }, when: { chat: ackItem.chat.id }, then: 'ack' }] }, store.machine)
store.saveControl({ paused: false, stopped: false, autoSend: true })
let acknowledgements = 0
const acknowledger = { ...src, presence: async () => {
  external(ackPath, { earlier: 'Changed during acknowledgement presence read' })
  return { availability: 'Busy' }
}, send: async () => {
  check(store.workflow(ackItem.id).acked, 'acknowledgement marker is saved before posting')
  acknowledgements++; return { msgId: '2002' }
} }
await readPhase('ack-commit-proof', () => afterDraft(store, acknowledger, cfg, ackItem))
await readPhase('ack-no-replay-proof', () => afterDraft(store, acknowledger, cfg, store.workflow(ackItem.id)))
check(acknowledgements === 1 && store.workflow(ackItem.id).decision?.action === 'ack' &&
  store.workflow(ackItem.id).earlier === 'Changed during acknowledgement presence read',
  'acknowledgement preserves external fields and its policy decision without replaying')
const heldItem = store.workflow('acme-item-8'), cancelledSend = store.workflow('acme-item-9')
for (const w of [heldItem, cancelledSend]) { w.state = 'scheduled'; w.sendAt = new Date(0).toISOString(); store.save(w, false) }
store.saveActivity({ ownerLastAt: new Date().toISOString() })
let automaticSends = 0
await readPhase('scheduled-hold-proof', () => dueSends(store, { ...src, presence: async () => {
  external(join(root, 'state', 'workflows', `${heldItem.id}.json`), { earlier: 'Changed during scheduled presence read' })
  external(join(root, 'state', 'workflows', `${cancelledSend.id}.json`), { state: 'done', status: 'Cancelled during presence read' })
  return { availability: 'Available' }
}, send: async () => { automaticSends++; return { msgId: 'unexpected' } } }, cfg))
check(automaticSends === 0 && store.workflow(heldItem.id).earlier === 'Changed during scheduled presence read' &&
  store.workflow(heldItem.id).status === 'Held: you are active in Teams', 'scheduled presence hold preserves external fields without sending')
check(store.workflow(cancelledSend.id).state === 'done' && store.workflow(cancelledSend.id).status === 'Cancelled during presence read',
  'scheduled presence hold never resurrects a cancelled item')
store.saveActivity({})
store.saveControl({ paused: false, stopped: false, autoSend: false })
const windowItem = store.workflow('acme-item-3'), windowPath = join(root, 'state', 'workflows', `${windowItem.id}.json`)
store.setOpenWindow(windowItem.id, { machine: store.machine, pid: 12345, runId: 'acme-window', since: new Date().toISOString() })
await readPhase('window-commit-proof', async () => {
  store.workflow(windowItem.id)
  checkOpen(store, { ...procs, windowAlive: () => { external(windowPath, { earlier: 'Changed during process inspection' }); return false } }, 0)
})
check(store.workflow(windowItem.id).earlier === 'Changed during process inspection' && !store.openWindow(windowItem.id),
  'terminal-return commit preserves another process while releasing its hold')
const effectsItem = store.workflow('acme-item-4'), jobId = 'acme-execution-job'
const effects = [{ system: 'acme', action: 'note', target: 'Acme planning', summary: 'Post the approved note',
  call: { tool: 'acme-note_write', args: { text: 'Approved note' } } }]
const effectCfg = { ...cfg, agent: { ...cfg.agent, effectTools: ['acme-note_write'],
  mcpServers: { acme: { type: 'local', command: 'fictional' } } } }
store.saveConfig(effectCfg)
store.saveJob({ schema: 1, id: jobId, key: `item:${effectsItem.id}`, goal: 'Post the approved note', state: 'done', purpose: 'work',
  session: { agent: 'copilot', id: randomUUID() }, parents: [effectsItem.id], asks: [],
  result: { summary: 'Approved note', effects, context: [] }, createdAt: at, updatedAt: at })
Object.assign(effectsItem, { job: jobId, effects, draft: undefined, question: undefined, pending: [] })
store.save(effectsItem, false)
check(approveEffects(store, effectCfg, effectsItem) === '', 'fictional effect is approved through the real gate')
let changes = 0
const jobPath = join(root, 'state', 'jobs', `${jobId}.json`), jobSession = store.job(jobId).session.id
await readPhase('job-commit-proof', () => executeDirect(store, sender, effectCfg, procs, undefined, async () => {
  changes++; external(jobPath, { asks: ['External request during execution'], label: 'External job label' })
  return { id: 'acme-note-1' }
}))
check(changes === 1 && store.job(jobId).asks.length === 1 && store.job(jobId).label === 'External job label' &&
  store.job(jobId).state === 'queued' && store.job(jobId).session.id === jobSession && store.job(jobId).result.effects[0].done,
  'execution completion keeps new asks and job fields without losing its receipt or session')
let replayed = 0
await executeDirect(store, sender, effectCfg, procs, undefined, async () => { replayed++; return { id: 'duplicate' } })
check(replayed === 0, 'an already completed effect is not replayed')
await readPhase('job-start-proof', async () => startJobs(store, effectCfg, { ...procs, start: () => {
  external(jobPath, { asks: ['External request during execution', 'New ask during start'], label: 'Changed during job start' })
  return { pid: 54321 }
} }))
check(store.job(jobId).asks.length === 2 && store.job(jobId).label === 'Changed during job start' &&
  store.job(jobId).session.id === jobSession, 'detached-job metadata merge preserves another writer and the existing session')
const prItem = store.workflow('acme-item-5'), prPath = join(root, 'state', 'workflows', `${prItem.id}.json`)
prItem.lastAsk = 'Review https://dev.azure.com/acme/Acme/_git/widget/pullrequest/41'
store.saveThread(prItem.id, [{ id: '101', at, from: prItem.asker, byOwner: false, text: prItem.lastAsk }])
store.save(prItem, false)
await readPhase('probe-commit-proof', () => probePRs(store, cfg, { pr: async () => {
  external(prPath, { earlier: 'Changed during PR read' })
  return { status: 'active', head: 'head', votes: [{ name: 'Robin', vote: 0 }] }
} }, Date.now(), true, [prItem]))
check(store.workflow(prItem.id).prRead?.includes('head') && store.workflow(prItem.id).earlier === 'Changed during PR read',
  'PR metadata commit preserves an external field while retaining its live evidence')
await readPhase('invalid-probe-proof', () => probePRs(store, cfg, { pr: async () => ({ status: '', votes: [] }) },
  Date.now(), true, [store.workflow(prItem.id)]))
check(!store.workflow(prItem.id).prRead && store.workflow(prItem.id).prUnknown, 'invalid live PR data still clears the earlier cached evidence')
const queued = [store.workflow('acme-item-10'), store.workflow('acme-item-11')]
for (const w of queued) { w.state = 'running'; w.pending = ['101']; w.ownerAnswer = 'Check the plan.'; store.save(w, false) }
const ran = []
await readPhase('queued-state-proof', () => dispatch(store, src, cfg, async (_, input) => {
  ran.push(input.workflowId)
  external(join(root, 'state', 'workflows', `${queued[1].id}.json`), { state: 'done', closedBy: 'skip', status: 'Cancelled externally' })
  store.writeReport({ workflowId: input.workflowId, intent: 'other', state: 'needs_human', summary: 'Draft ready',
    reply: { text: 'Check the Acme plan.', commitment: false, sources: [] } }, input.runId)
  return { exitCode: 0, ms: 1 }
}, undefined, queued.map(w => w.id)))
check(ran.length === 1 && store.workflow(queued[1].id).state === 'done', 'a queue entry changed by another process never starts a stale run')
const finishedJob = store.job(jobId); finishedJob.state = 'done'; finishedJob.run = undefined; store.saveJob(finishedJob)
store.saveControl({ paused: false, stopped: true, autoSend: false })
const stopped = await tick(store, { ...deps, source: { ...src, recentChats: async () => { throw new Error('Stopped tick attempted intake') } } })
check(stopped.skipped === 'stopped', 'stopped ticks retain their early return and supervision path')
store.saveControl({ paused: false, stopped: false, autoSend: false })
store.setHealth('source', 'Fictional outage already reported')
store.writeAnswer({ code: '', verb: 'pause', surface: 'panel' })
const down = await tick(store, { ...deps, source: { ...src, newMessages: async () => { throw new Error('Fictional source outage') } } })
check(down.skipped === 'source unavailable' && store.control().paused, 'outage path still applies queued controls and closes its scopes')
check(existsSync(join(root, 'inbox.html')), 'production snapshot is present')
check(withinTarget, 'every cold/warm empty tick is under two seconds on the declared simulated storage rig')
console.log('PASS scope API, runner, HTTP and cross-process proofs complete; no helper remains running')
