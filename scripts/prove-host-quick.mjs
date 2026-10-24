// Manual #45 proof: actual installed runtime, isolated Temp homes, loopback model only. No unit runner.
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
if (!pkg) throw new Error('Install the Copilot CLI before this proof')
const root = mkdtempSync(join(tmpdir(), 'delegate-host-quick-'))
const ownerSessions = join(homedir(), '.copilot', 'session-state')
const before = new Set(existsSync(ownerSessions) ? readdirSync(ownerSessions) : [])
for (const name of ['local', 'copilot', 'config', 'cache', 'data']) mkdirSync(join(root, name))
Object.assign(process.env, { DELEGATE_ROOT: root, DELEGATE_LOCAL: join(root, 'local'), COPILOT_HOME: join(root, 'copilot'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'),
  DELEGATE_COPILOT_PKG: pkg.dir, DELEGATE_WORKER: '1' })
writeFileSync(join(root, 'local', 'local.json'), JSON.stringify({ root, machine: 'acme-pc' }))
writeFileSync(join(root, 'copilot', 'mcp-config.json'), '{"mcpServers":{}}')
const { Store } = await load('src', 'store', 'state.ts')
const { quick, ensureHost, hostRunner } = await load('src', 'host', 'client.ts')
const { hostFile } = await load('src', 'host', 'host.ts')
const { workerMcp } = await load('src', 'runner', 'dispatch.ts')
const store = new Store({ root, machine: 'acme-pc' })
const check = (ok, text) => { if (!ok) throw new Error(text); console.log(`PASS ${text}`) }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const eventually = async (predicate, ms = 4000) => {
  const until = performance.now() + ms
  while (!predicate() && performance.now() < until) await wait(25)
  return predicate()
}
const schema = { type: 'object', properties: { stillAnswers: { enum: ['yes', 'no', 'unsure'] }, changed: { type: 'string' } },
  required: ['stillAnswers', 'changed'], additionalProperties: false }
const quickRequests = []
let mode = 'yes', item, modelFailure, slowClosed = 0
const model = createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw || '{}'), tools = (body.tools ?? []).map(t => t.function?.name ?? t.name)
    const report = tools.find(n => n.endsWith('submit_report')), reported = body.messages?.at(-1)?.role === 'tool'
    let message
    if (report) message = reported ? { role: 'assistant', content: 'Done.' } : { role: 'assistant', content: null,
      tool_calls: [{ id: `call_${randomUUID()}`, type: 'function', function: { name: report, arguments: JSON.stringify({
        workflowId: item.id, intent: 'other', state: 'needs_human', summary: 'Draft ready',
        reply: { text: 'Check the Acme plan.', commitment: false, sources: [] },
      }) } }] }
    else {
      quickRequests.push({ tools, messages: JSON.stringify(body.messages), format: body.response_format })
      if (tools.length) throw new Error('Quick model request exposed tools')
      if (mode === 'error') { res.writeHead(400); res.end('Fictional provider failure'); return }
      if (mode === 'slow') await new Promise(resolve => {
        const timer = setTimeout(resolve, 8000)
        res.once('close', () => { clearTimeout(timer); slowClosed++; resolve() })
      })
      if (res.destroyed) return
      const content = mode === 'malformed' ? '{' : mode === 'wrong-schema' ? '{"stillAnswers":17}' :
        JSON.stringify({ stillAnswers: mode === 'slow' ? 'yes' : mode, changed: mode === 'no' ? 'Kim added a new question.' : '' })
      message = { role: 'assistant', content }
    }
    const base = { id: randomUUID(), object: 'chat.completion', model: 'acme-model', created: Math.floor(Date.now() / 1000) }
    const finish = message.tool_calls ? 'tool_calls' : 'stop'
    if (body.stream) {
      const delta = { ...message, ...(message.tool_calls ? { tool_calls: message.tool_calls.map((t, index) => ({ ...t, index })) } : {}) }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`)
    } else {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ...base, choices: [{ index: 0, message, finish_reason: finish }] }))
    }
  } catch (e) { modelFailure = e; if (!res.destroyed) { res.writeHead(500); res.end(String(e)) } }
})
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve))
Object.assign(process.env, { COPILOT_PROVIDER_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`,
  COPILOT_PROVIDER_API_KEY: 'fictional', COPILOT_PROVIDER_MODEL_ID: 'acme-model', COPILOT_PROVIDER_WIRE_API: 'completions' })
const cfg = { schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' },
  watch: [], discover: false, channels: false, maxParallel: 1, jobs: { parallel: 1 }, nudgeEveryMin: 30,
  agent: { flavor: 'copilot', command: [process.execPath, pkg.runtime], model: 'acme-model', tools: ['view'], mcpServers: {} } }
store.saveConfig(cfg)
const worker = async () => {
  const at = new Date().toISOString(), id = randomUUID(), runId = randomUUID(), sessionId = randomUUID()
  item = { schema: 1, id, code: 'A1', kind: 'reply', state: 'running', key: { type: 'thread', id },
    chat: { id, name: 'Acme planning', test: true }, session: { agent: 'copilot', id: sessionId },
    lastMsgId: '101', pending: ['101'], msgIds: ['101'], createdAt: at, updatedAt: at, status: 'Drafting' }
  store.save(item, false)
  const result = await hostRunner(store)(cfg.agent, { ...workerMcp(store, id, runId), workflowId: id, runId, sessionId,
    prompt: `Workflow ${id}. Draft and call submit_report.`, extraTools: ['delegate_worker-submit_report'], dirs: [] })
  check(result.via === 'host' && store.peekReport(id, runId)?.reply, 'normal worker still reports on the host')
  return sessionId
}
const sessions = join(root, 'copilot', 'session-state')
const ids = () => existsSync(sessions) ? readdirSync(sessions) : []
let real, fake, transport = 'busy'
try {
  check(await quick('No host', schema) === undefined && !existsSync(hostFile()) &&
    !existsSync(join(root, 'local', 'host-start.json')), 'absent host fails open without discovery, start or spawn')
  await ensureHost(store, cfg)
  real = JSON.parse(readFileSync(hostFile(), 'utf8'))
  check(await quick('Cold host', schema) === undefined && quickRequests.length === 0, 'cold runtime gets no quick prompt')
  const workerId = await worker()
  const workerFile = join(sessions, workerId, 'events.jsonl'), history = readFileSync(workerFile, 'utf8')
  const normalIds = new Set(ids()), mark = readFileSync(join(root, 'local', 'host-start.json'), 'utf8')
  for (const value of ['yes', 'no', 'unsure']) {
    mode = value
    const result = await quick(`FRESH_${value}: check the Acme reply`, schema)
    check(result?.stillAnswers === value, `warm tool-less check returns schema-valid ${value}`)
  }
  check(quickRequests.length === 3 && quickRequests.every(r => r.tools.length === 0 && r.format?.type === 'json_schema'),
    'real model receives no tools and the requested response schema')
  check(!quickRequests[1].messages.includes('FRESH_yes') && !quickRequests[2].messages.includes('FRESH_no'),
    'each quick check has a fresh isolated session')
  for (const bad of ['malformed', 'wrong-schema', 'error']) {
    mode = bad
    check(await quick('Bad response must fail open', schema) === undefined, `${bad} response fails open`)
  }
  mode = 'slow'
  const t = performance.now()
  check(await quick('Eight-second model', schema, 5000) === undefined, 'eight-second provider fails open')
  const elapsed = performance.now() - t
  check(elapsed >= 4500 && elapsed <= 5200, 'five-second wall deadline includes session creation and inference')
  check(await eventually(() => slowClosed > 0, 1500), 'deadline aborts the in-flight provider request')
  check(await eventually(() => ids().every(id => normalIds.has(id))), 'all ephemeral SDK sessions are deleted')
  check(readFileSync(workerFile, 'utf8') === history && !existsSync(join(root, 'sessions')), 'quick checks never change or back up item histories')
  check(!store.logs(1).some(e => e.event === 'host-fault' || e.event === 'host-disabled'), 'quick failures never strike the host breaker')
  mode = 'yes'; await worker()
  check(JSON.parse(readFileSync(hostFile(), 'utf8')).pid === real.pid, 'normal worker remains healthy on the same host')
  fake = createServer((req, res) => {
    if (req.url === '/ping') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, warm: true, draining: transport === 'draining' })); return
    }
    if (transport === 'trickle') {
      res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"result":')
      const timer = setInterval(() => res.write(' '), 25)
      const stop = setTimeout(() => res.destroy(), 1500)
      res.once('close', () => { clearInterval(timer); clearTimeout(stop) }); return
    }
    res.writeHead(429, { 'content-type': 'application/json' }); res.end('{"error":"busy"}')
  })
  await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve))
  writeFileSync(hostFile(), JSON.stringify({ ...real, pid: process.pid, port: fake.address().port }))
  check(await quick('Busy host', schema) === undefined, 'busy host fails open without fallback')
  transport = 'draining'
  check(await quick('Draining host', schema) === undefined, 'draining host fails open without fallback')
  transport = 'trickle'
  const short = performance.now()
  check(await quick('Trickling HTTP response', schema, 300) === undefined && performance.now() - short < 600,
    'wall deadline is not reset by streaming response bytes')
  await new Promise(resolve => fake.close(resolve)); fake = undefined
  check(await quick('Unreachable host', schema) === undefined, 'unreachable host fails open without fallback')
  check(readFileSync(join(root, 'local', 'host-start.json'), 'utf8') === mark, 'quick never changes start/backoff markers')
  if (modelFailure) throw modelFailure
  console.log(`EIGHT_SECOND_PROVIDER_RETURNED_IN_MS ${Math.round(elapsed)}`)
} finally {
  if (real) {
    writeFileSync(hostFile(), JSON.stringify(real))
    await new Promise(resolve => {
      const r = request({ host: '127.0.0.1', port: real.port, method: 'POST', path: '/drain',
        headers: { authorization: ['Bearer', real.token].join(' ') } }, res => { res.resume(); res.on('end', resolve) })
      r.on('error', resolve); r.end()
    })
    check(await eventually(() => !existsSync(hostFile()), 15000), 'proof host stopped')
  }
  if (fake) { fake.closeAllConnections(); await new Promise(resolve => fake.close(resolve)) }
  await new Promise(resolve => model.close(resolve))
  const added = (existsSync(ownerSessions) ? readdirSync(ownerSessions) : []).filter(id => !before.has(id))
  check(!added.some(id => { const p = join(ownerSessions, id, 'workspace.yaml'); return existsSync(p) && readFileSync(p, 'utf8').includes(root) }),
    'zero proof-owned owner session additions')
  console.log(`PROOF_ROOT ${root}`)
}
