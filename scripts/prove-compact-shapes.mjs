// Manual fictional redraft on the installed runtime; local stub token estimates, no external effects.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { cliPackage } = await import('../src/host/locate.ts')
const pkg = cliPackage()
assert.ok(pkg, 'The installed Copilot CLI is required')
const root = mkdtempSync(join(tmpdir(), 'delegate-compact-shapes-'))
for (const name of ['local', 'copilot', 'config', 'cache', 'data']) mkdirSync(join(root, name))
Object.assign(process.env, {
  DELEGATE_ROOT: root, DELEGATE_LOCAL: join(root, 'local'), COPILOT_HOME: join(root, 'copilot'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'),
  DELEGATE_COPILOT_PKG: pkg.dir, DELEGATE_WORKER: '1', DELEGATE_NO_KICK: '1',
})
writeFileSync(join(root, 'copilot', 'mcp-config.json'), '{"mcpServers":{}}')
writeFileSync(join(root, 'local', 'local.json'), JSON.stringify({ root, machine: 'acme-pc' }))
const { Store } = await import('../src/store/state.ts')
const { hostRunner } = await import('../src/host/client.ts')
const { dispatch } = await import('../src/runner/dispatch.ts')
const store = new Store({ root, machine: 'acme-pc' })
const calls = []
let mode, item, failure
const model = createServer(async (req, res) => {
  try {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    const inputTokens = Math.ceil(JSON.stringify(body.messages).length / 4)
    calls.push({ mode, inputTokens })
    const tools = (body.tools ?? []).map(t => t.function?.name ?? t.name)
    assert.ok(!tools.some(t => t.includes('acme-ado')), 'Reference shapes must not grant write tools')
    const report = tools.find(t => t.endsWith('submit_report'))
    assert.ok(report)
    const reported = body.messages.at(-1)?.role === 'tool'
    const message = reported ? { role: 'assistant', content: 'Fictional redraft saved.' } : {
      role: 'assistant', content: null, tool_calls: [{
        id: `call_${randomUUID()}`, type: 'function', function: { name: report, arguments: JSON.stringify({
          workflowId: item.id, intent: 'other', state: 'needs_human', summary: 'Review kept.',
          reply: { text: 'The empty-plan guard is missing.', commitment: false, sources: [] },
        }) },
      }],
    }
    const base = { id: randomUUID(), object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'acme-model' }
    const finish = reported ? 'stop' : 'tool_calls'
    const usage = { prompt_tokens: inputTokens, completion_tokens: 16, total_tokens: inputTokens + 16 }
    if (body.stream) {
      const delta = { ...message, ...(message.tool_calls ? { tool_calls: message.tool_calls.map((t, index) => ({ ...t, index })) } : {}) }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }], usage })}\n\ndata: [DONE]\n\n`)
    } else {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ...base, choices: [{ index: 0, message, finish_reason: finish }], usage }))
    }
  } catch (e) { failure = e; res.writeHead(500); res.end(String(e)) }
})
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve))
Object.assign(process.env, {
  COPILOT_PROVIDER_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`, COPILOT_PROVIDER_API_KEY: 'fictional',
  COPILOT_PROVIDER_MODEL_ID: 'acme-model', COPILOT_PROVIDER_WIRE_API: 'completions',
})
const cfg = {
  schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' },
  watch: [], discover: false, maxParallel: 1, dailyRuns: 200, nudgeEveryMin: 30,
  agent: { flavor: 'copilot', command: [process.execPath, pkg.runtime], model: 'acme-model', tools: ['view'],
    hostIdleMin: 540, mcpServers: {}, effectTools: Array.from({ length: 10 }, (_, i) => `acme-ado-change_${i}:create`) },
}
store.saveConfig(cfg)
const refCfg = { ...cfg, agent: { ...cfg.agent, mcpServers: { 'acme-ado': { command: 'never-start-this-proof-server' } } } }
const schema = {
  type: 'object', description: 'Fictional write format. '.repeat(130),
  properties: {
    action: { type: 'string', enum: ['create', 'update'], description: 'Choose the action.' },
    project: { type: 'string', description: 'Project name.' },
    repositoryId: { type: 'string', description: 'Repository name.' },
    pullRequestId: { type: 'integer', minimum: 1, description: 'Pull request number.' },
    content: { type: 'string', minLength: 1, description: 'The proposed comment.' },
    filePath: { type: 'string', description: 'Source path.' },
    rightFileStartLine: { type: 'integer', minimum: 1 },
    rightFileStartOffset: { type: 'integer', minimum: 1 },
    rightFileEndLine: { type: 'integer', minimum: 1 },
    rightFileEndOffset: { type: 'integer', minimum: 1 },
  }, required: ['action', 'project', 'repositoryId', 'pullRequestId', 'content'],
}
const catalog = { server: 'acme-ado', hash: 'fictional', spec: 'fictional', at: new Date().toISOString(),
  tools: cfg.agent.effectTools.map((_, i) => ({ name: `change_${i}`, cls: 'write', why: 'Fictional write',
    info: { name: `change_${i}`, inputSchema: schema } })) }
mkdirSync(join(root, 'local', 'catalog'))
writeFileSync(join(root, 'local', 'catalog', 'acme-ado.json'), JSON.stringify(catalog))
const heading = 'Argument shapes are reference data for proposals, not tools you may call. Only the listed tools/actions are allowed; other actions in a schema are not permission. Required fields may be omitted here; report missing formats rather than invent a call:'
const suffix = '(shapes truncated; propose only fields shown)'
const src = {
  selfChatId: 'self', newMessages: async () => ({ msgs: [], truncated: false }), recentChats: async () => [], recent: async () => [],
  send: async () => { throw new Error('No sends in this proof') }, sendSelf: async () => ({ msgId: randomUUID() }),
  deleteMessage: async () => {}, editMessage: async () => {}, close: async () => {},
}
const measured = {}
try {
  for (mode of ['no-shapes', 'full-before', 'compact-after']) {
    const at = new Date().toISOString(), id = randomUUID()
    item = { schema: 1, id, code: 'A61', kind: 'reply', state: 'running', key: { type: 'thread', id },
      chat: { id, name: 'Acme planning', test: true }, asker: { id: 'kim', name: 'Kim' },
      session: { agent: 'copilot', id: randomUUID() }, lastMsgId: '101', lastAsk: 'Summarize the review.',
      pending: ['101'], msgIds: ['101'], ownerAnswer: 'Keep the finding and make it shorter.',
      status: 'Drafting the review.', newCount: 1, createdAt: at, updatedAt: at, revAt: at,
      context: [{ label: 'Found on PR', text: 'The empty-plan guard is missing.' }],
      draft: { text: 'The review found the empty-plan guard missing.', commitment: false, sources: [] } }
    store.save(item, false)
    store.saveThread(id, [{ id: '101', at, from: item.asker, byOwner: false, text: item.lastAsk }])
    const from = calls.length
    await dispatch(store, src, refCfg, async (agent, input) => {
      const start = input.prompt.indexOf(heading), end = input.prompt.indexOf(suffix) + suffix.length
      assert.ok(start >= 0 && end > start)
      const block = input.prompt.slice(start, end)
      assert.ok(block.length <= 2300)
      const replacement = mode === 'no-shapes' ? '' : mode === 'full-before'
        ? [heading.slice(0, heading.indexOf('. Required fields')) + ':', ...catalog.tools.map(t => `- acme-ado-${t.name} arguments (JSON Schema): ${JSON.stringify(t.info.inputSchema)}`)].join('\n')
        : block
      return hostRunner(store)({ ...agent, mcpServers: {} }, { ...input, prompt: input.prompt.slice(0, start) + replacement + input.prompt.slice(end) })
    }, undefined, [id])
    if (failure) throw failure
    assert.equal(store.workflow(id).draft?.text, 'The empty-plan guard is missing.')
    assert.equal(store.workflow(id).session.id === item.session.id, false)
    measured[mode] = calls.slice(from).map(c => c.inputTokens)
    assert.ok(measured[mode].length > 0)
  }
  assert.equal(measured['compact-after'].length, measured['no-shapes'].length)
  assert.equal(measured['compact-after'].length, measured['full-before'].length)
  const changes = measured['compact-after'].map((tokens, i) => {
    assert.ok(tokens < measured['full-before'][i])
    return Number(((tokens / measured['no-shapes'][i] - 1) * 100).toFixed(2))
  })
  console.log(JSON.stringify({ estimate: 'same #29 stub: ceil(JSON.stringify(messages).length / 4), not provider tokenization',
    tools: 10, fullSchemaChars: JSON.stringify(schema).length * 10, inputTokensPerCall: measured, increaseVsNoShapesPercent: changes }))
  assert.ok(changes.every(pct => pct <= 10), 'Compact shapes stay within +10% of the same fictional redraft without shapes')
  console.log('PASS three real dispatch/submit/apply redrafts, same draft retained, no write tools, compact input within +10% of no-shapes')
} finally {
  try {
    const file = join(root, 'local', 'host.json')
    if (existsSync(file)) {
      const h = JSON.parse(readFileSync(file, 'utf8'))
      await new Promise((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port: h.port, path: '/drain', method: 'POST',
          headers: { authorization: `Bearer ${h.token}` } }, res => { res.resume(); res.on('end', resolve) })
        req.on('error', reject); req.end()
      })
      const end = Date.now() + 15000
      while (existsSync(file) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 100))
      assert.ok(!existsSync(file), 'Proof host stopped')
      console.log('PASS isolated proof host drained and stopped')
    }
  } finally { await new Promise(resolve => model.close(resolve)) }
  rmSync(root, { recursive: true, force: true })
}
