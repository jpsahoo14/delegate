// Manual #39 proof, outside npm test/CI. Requires an installed Copilot CLI; no sign-in or external model calls.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = dirname(dirname(fileURLToPath(import.meta.url)))
const { cliPackage } = await import(pathToFileURL(join(repo, 'src', 'host', 'locate.ts')).href)
const pkg = cliPackage()
if (!pkg) throw new Error('Install the Copilot CLI before running this manual proof')
const root = mkdtempSync(join(tmpdir(), 'delegate-host-tools-'))
const ownerSessions = join(homedir(), '.copilot', 'session-state')
const before = new Set(existsSync(ownerSessions) ? readdirSync(ownerSessions) : [])
for (const name of ['local', 'copilot', 'config', 'cache', 'data']) mkdirSync(join(root, name))
const clock = join(root, 'clock.json'), preload = join(root, 'clock.mjs')
const workday = new Date()
workday.setUTCHours(4, 30, 0, 0)
while (![1, 2, 3, 4, 5].includes(workday.getUTCDay())) workday.setUTCDate(workday.getUTCDate() - 1)
const offset = workday.getTime() - Date.now()
writeFileSync(clock, JSON.stringify({ offset }))
writeFileSync(preload, `
import { readFileSync } from 'node:fs';
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [RealDate.now()+JSON.parse(readFileSync(process.env.PROOF_CLOCK,'utf8')).offset])); }
  static now() { return new this().getTime(); }
};
`)
Object.assign(process.env, {
  DELEGATE_ROOT: root, DELEGATE_LOCAL: join(root, 'local'), COPILOT_HOME: join(root, 'copilot'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'),
  DELEGATE_COPILOT_PKG: pkg.dir, PROOF_CLOCK: clock,
  NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`, DELEGATE_WORKER: '1',
})
await import(pathToFileURL(preload).href)
writeFileSync(join(root, 'copilot', 'mcp-config.json'), '{"mcpServers":{}}')
writeFileSync(join(root, 'local', 'local.json'), JSON.stringify({ root, machine: 'acme-pc' }))
const load = (...parts) => import(pathToFileURL(join(repo, ...parts)).href)
const { Store } = await load('src', 'store', 'state.ts')
const { hostRunner } = await load('src', 'host', 'client.ts')
const { workerMcp } = await load('src', 'runner', 'dispatch.ts')
const { unavailableTools } = await load('src', 'core', 'agent-failure.ts')
const store = new Store({ root, machine: 'acme-pc' })
let item, refuseOptional = false
const offered = []
const model = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw || '{}')
  const tools = (body.tools ?? []).map(t => t.function?.name ?? t.name)
  offered.push(tools)
  const tool = tools.find(n => n.endsWith('submit_report'))
  if (!tool) { res.writeHead(400); return res.end('Required report tool not offered') }
  const reported = body.messages?.at(-1)?.role === 'tool'
  const refused = refuseOptional
  refuseOptional = false
  const message = refused ? { role: 'assistant', content: 'acme-library-get-library-docs is unavailable.' } : reported ? { role: 'assistant', content: 'Done.' } : {
    role: 'assistant', content: null, tool_calls: [{
      id: `call_${randomUUID()}`, type: 'function',
      function: { name: tool, arguments: JSON.stringify({
        workflowId: item.id, intent: 'other', state: 'needs_human', summary: 'Fictional draft ready',
        reply: { text: 'Please confirm with Kim.', commitment: false, sources: [] },
      }) },
    }],
  }
  const base = { id: randomUUID(), object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'acme-model' }
  const finish = reported || refused ? 'stop' : 'tool_calls'
  if (body.stream) {
    const delta = { ...message, ...(message.tool_calls ? { tool_calls: message.tool_calls.map((t, index) => ({ ...t, index })) } : {}) }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`)
  } else {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ...base, choices: [{ index: 0, message, finish_reason: finish }] }))
  }
})
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve))
Object.assign(process.env, {
  COPILOT_PROVIDER_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`, COPILOT_PROVIDER_API_KEY: 'fictional',
  COPILOT_PROVIDER_MODEL_ID: 'acme-model', COPILOT_PROVIDER_WIRE_API: 'completions',
})
const name = 'acme-library-get-library-docs', command = 'acme-optional-server-not-installed'
const cfg = {
  schema: 1, owner: { id: 'robin', name: 'Robin' }, tz: 'Asia/Kolkata', source: { command: [], selfChatId: 'self' },
  watch: [], discover: false, channels: false, maxParallel: 1, nudgeEveryMin: 30,
  agent: { flavor: 'copilot', command: [process.execPath, pkg.runtime], model: 'acme-model',
    tools: ['view', 'glob', 'grep', name], hostIdleMin: 540, mcpServers: {
      'acme-library': { type: 'local', command },
    } },
}
store.saveConfig(cfg)
mkdirSync(join(root, 'local', 'catalog'))
const spec = createHash('sha256').update(JSON.stringify({ command, args: [], env: [] })).digest('hex').slice(0, 16)
writeFileSync(join(root, 'local', 'catalog', 'acme-library.json'), JSON.stringify({
  server: 'acme-library', hash: 'fictional', spec, tools: [], at: new Date().toISOString(),
  error: 'Fictional server is resting', retryAt: new Date(Date.now() + 6 * 3600000).toISOString(),
}))
const check = (ok, message) => { if (!ok) throw new Error(message); console.log(`PASS ${message}`) }
const run = async (via = 'host', expectReport = true) => {
  const at = new Date().toISOString(), id = randomUUID(), runId = randomUUID()
  item = { schema: 1, id, code: 'A1', kind: 'reply', state: 'running', key: { type: 'thread', id },
    chat: { id, name: 'Acme planning', group: true }, asker: { id: 'kim', name: 'Kim' },
    session: { agent: 'copilot', id: randomUUID() }, lastMsgId: 'm1', lastAsk: 'Confirm the plan.',
    pending: ['m1'], msgIds: ['m1'], newCount: 1, createdAt: at, updatedAt: at, revAt: at }
  store.save(item, false)
  const result = await hostRunner(store)(cfg.agent, {
    ...workerMcp(store, id, runId), workflowId: id, runId, sessionId: item.session.id,
    prompt: `Workflow ${id}. Draft the reply and call submit_report.`,
    extraTools: ['delegate_worker-submit_report', 'delegate_worker-image_read'], dirs: [],
  })
  check(result.via === via && !!store.peekReport(id, runId)?.reply === expectReport, expectReport
    ? `${via} saves the report despite resting owner tool` : 'optional-tool no-report answer stays on the host')
  return result
}
try {
  await run()
  const file = join(root, 'local', 'host.json'), first = JSON.parse(readFileSync(file, 'utf8'))
  writeFileSync(clock, JSON.stringify({ offset: offset + 10 * 60000 }))
  const warm = await run(), second = JSON.parse(readFileSync(file, 'utf8'))
  check(warm.warm === true && first.pid === second.pid, 'same host is warm ten work-hours minutes later')
  const logs = store.logs(2), sessions = logs.filter(e => e.event === 'host-session-tools')
  check(sessions.length === 2 && sessions.every(e => e.missing.includes(name) && e.missingRequired.length === 0), 'optional absence is logged separately from required tools')
  check(!logs.some(e => ['host-fault', 'host-disabled', 'host-tools-missing'].includes(e.event)), 'resting tool adds no strike or disable')
  check(offered.length > 0 && offered.every(names => names.some(n => n.endsWith('submit_report'))), 'every model request has submit_report')
  check(!unavailableTools('The library docs are unavailable.', [name]).length && unavailableTools(`${name} is unavailable.`, [name]).length === 1, 'full hyphenated name matches, ordinary docs prose does not')
  refuseOptional = true
  const calls = offered.length
  const refusal = await run('host', false)
  check(refusal.warm === true && offered.length === calls + 1, 'optional-tool refusal causes no cold fallback or retry')
  check(!store.logs(2).some(e => ['host-fault', 'host-disabled', 'host-tools-missing'].includes(e.event)), 'optional-tool no-report answer adds no strike or disable')
} finally {
  try {
    const file = join(root, 'local', 'host.json')
    if (existsSync(file)) {
      const h = JSON.parse(readFileSync(file, 'utf8'))
      await new Promise(resolve => {
        const req = request({ host: '127.0.0.1', port: h.port, path: '/drain', method: 'POST',
          headers: { authorization: ['Bearer', h.token].join(' ') } }, res => { res.resume(); res.on('end', resolve) })
        req.on('error', resolve); req.end()
      })
      const until = performance.now() + 15000
      while (existsSync(file) && performance.now() < until) await new Promise(resolve => setTimeout(resolve, 100))
      check(!existsSync(file), 'proof host stopped')
    }
  } finally { await new Promise(resolve => model.close(resolve)) }
  const added = (existsSync(ownerSessions) ? readdirSync(ownerSessions) : []).filter(n => !before.has(n))
  check(added.length === 0, 'zero owner session additions')
  console.log(`PROOF_ROOT ${root}`)
}
