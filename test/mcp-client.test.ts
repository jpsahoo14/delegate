import { test } from 'node:test'
import assert from 'node:assert/strict'
import { McpClient } from '../src/adapters/mcp-client.ts'

test('calls that start together share one connection (the eval run found parallel first calls each connecting)', async () => {
	const m = new McpClient(['x'])
	let connects = 0
	const inner = m as unknown as { client: { connect: () => Promise<void>; callTool: () => Promise<unknown>; close: () => Promise<void> } }
	inner.client = { connect: async () => { connects++; if (connects > 1) throw new Error('Already connected'); await new Promise(r => setTimeout(r, 20)) }, callTool: async () => ({ content: [{ type: 'text', text: '{"ok":1}' }] }), close: async () => {} }
	const r = await Promise.all([m.call('a', {}), m.call('b', {}), m.call('c', {})])
	assert.deepEqual([connects, r], [1, [{ ok: 1 }, { ok: 1 }, { ok: 1 }]])
})

test('next action: make_change reaches the owner\'s own tool server by the tool\'s prefix, with the exact arguments', async () => {
	const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs')
	const { tmpdir } = await import('node:os')
	const { join } = await import('node:path')
	process.env.DELEGATE_LOCAL ??= mkdtempSync(join(tmpdir(), 'delegate-local-'))
	const dir = mkdtempSync(join(tmpdir(), 'delegate-fake-ado-')), log = join(dir, 'calls.jsonl'), server = join(dir, 'server.mjs')
	writeFileSync(server, [
		`import { McpServer } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/mcp.js'))}`,
		`import { StdioServerTransport } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/stdio.js'))}`,
		`import { z } from ${JSON.stringify(import.meta.resolve('zod'))}`,
		`import { appendFileSync } from 'node:fs'`,
		`const s = new McpServer({ name: 'fake-ado', version: '1' })`,
		`s.registerTool('repo_pull_request_write', { inputSchema: { action: z.string(), pullRequestId: z.number(), vote: z.string() } }, async a => { appendFileSync(${JSON.stringify(log)}, JSON.stringify(a) + '\\n'); return { content: [{ type: 'text', text: JSON.stringify({ id: 'reviewer-7' }) }] } })`,
		`await s.connect(new StdioServerTransport())`,
	].join('\n'))
	const { mcpCaller } = await import('../src/runner/change.ts')
	const cfg = { agent: { mcpServers: { ado: { command: process.execPath, args: [server] } } } } as never
	const r = await mcpCaller(cfg)('ado', 'repo_pull_request_write', { action: 'vote', pullRequestId: 4200001, vote: 'ApprovedWithSuggestions' })
	assert.deepEqual(r, { id: 'reviewer-7' })
	assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)), [{ action: 'vote', pullRequestId: 4200001, vote: 'ApprovedWithSuggestions' }])
	await assert.rejects(() => mcpCaller(cfg)('incidents', 'x', {}), /No command for the incidents tool server/)
})

test('review 10-21b P2-2: a server from the AI CLI\'s config gets its env, with ${VAR} expanded from the process env', async () => {
	const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs')
	const { tmpdir } = await import('node:os')
	const { join } = await import('node:path')
	process.env.DELEGATE_LOCAL ??= mkdtempSync(join(tmpdir(), 'delegate-local-'))
	const dir = mkdtempSync(join(tmpdir(), 'delegate-fake-env-')), log = join(dir, 'seen.json'), server = join(dir, 'server.mjs')
	writeFileSync(server, [
		`import { McpServer } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/mcp.js'))}`,
		`import { StdioServerTransport } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/stdio.js'))}`,
		`import { writeFileSync } from 'node:fs'`,
		`const s = new McpServer({ name: 'fake', version: '1' })`,
		`s.registerTool('repo_pull_request', {}, async () => ({ content: [{ type: 'text', text: JSON.stringify({ status: 'active', title: process.env.TOKEN, reviewers: [] }) }] }))`,
		`s.registerTool('who', {}, async () => { writeFileSync(${JSON.stringify(log)}, JSON.stringify({ token: process.env.TOKEN, arg: process.argv[2] })); return { content: [{ type: 'text', text: '{"id":"x"}' }] } })`,
		`await s.connect(new StdioServerTransport())`,
	].join('\n'))
	writeFileSync(join(dir, 'mcp-config.json'), JSON.stringify({ mcpServers: { ado: { command: process.execPath, args: ['${DELEGATE_TEST_SERVER}', '--org=${DELEGATE_TEST_ORG}'], env: { TOKEN: '${DELEGATE_TEST_SECRET}' } } } }))
	Object.assign(process.env, { COPILOT_HOME: dir, DELEGATE_TEST_SERVER: server, DELEGATE_TEST_ORG: 'acme', DELEGATE_TEST_SECRET: 's3cret' })
	try {
		const { mcpCaller } = await import('../src/runner/change.ts')
		await mcpCaller({ agent: { flavor: 'copilot' } } as never)('ado', 'who', {})
		assert.deepEqual(JSON.parse(readFileSync(log, 'utf8')), { token: 's3cret', arg: '--org=acme' })
		const { adoProbe } = await import('../src/runner/probe.ts')
		const probe = adoProbe({ agent: { flavor: 'copilot' } } as never)!
		assert.equal((await probe.pr!('p', 'r', 1)).title, 's3cret', 'the PR read starts the server the same way')
		await probe.close?.()
	} finally { for (const k of ['COPILOT_HOME', 'DELEGATE_TEST_SERVER', 'DELEGATE_TEST_ORG', 'DELEGATE_TEST_SECRET']) delete process.env[k] }
})

test('review 10-21c P2-1: a server with no env in its config still gets the process environment, as the AI CLI gives it', async () => {
	const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs')
	const { tmpdir } = await import('node:os')
	const { join } = await import('node:path')
	const dir = mkdtempSync(join(tmpdir(), 'delegate-fake-noenv-')), log = join(dir, 'seen.json'), server = join(dir, 'server.mjs')
	writeFileSync(server, [
		`import { McpServer } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/mcp.js'))}`,
		`import { StdioServerTransport } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/stdio.js'))}`,
		`import { writeFileSync } from 'node:fs'`,
		`const s = new McpServer({ name: 'fake', version: '1' })`,
		`s.registerTool('who', {}, async () => { writeFileSync(${JSON.stringify(log)}, JSON.stringify({ pat: process.env.DELEGATE_TEST_PAT ?? null })); return { content: [{ type: 'text', text: '{"id":"x"}' }] } })`,
		`await s.connect(new StdioServerTransport())`,
	].join('\n'))
	const { clientFor } = await import('../src/adapters/mcp-client.ts')
	process.env.DELEGATE_TEST_PAT = 'from-the-shell'
	const c = clientFor({ command: process.execPath, args: [server] })
	try { await c.call('who', {}) } finally { await c.close(); delete process.env.DELEGATE_TEST_PAT }
	assert.deepEqual(JSON.parse(readFileSync(log, 'utf8')), { pat: 'from-the-shell' })
})

test('bug 10-21 dry run: a ring run says who started it, as the owner\'s Azure DevOps server lists it', async () => {
	const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs')
	const { tmpdir } = await import('node:os')
	const { join } = await import('node:path')
	process.env.DELEGATE_LOCAL ??= mkdtempSync(join(tmpdir(), 'delegate-local-'))
	const dir = mkdtempSync(join(tmpdir(), 'delegate-fake-runs-')), log = join(dir, 'args.json'), server = join(dir, 'server.mjs')
	// The shape the real server returned in the dry run on 10-21: the starter flat in requestedForDisplayName.
	const items = [{ id: 9100002, status: 'completed', result: 'partiallySucceeded', queueTime: '2026-10-20T05:11:00Z', requestedForDisplayName: 'Kim Lee' }, { id: 52563600, status: 'inProgress', queueTime: '2026-10-20T06:00:00Z', requestedFor: { displayName: 'Dev Rao' } }]
	writeFileSync(server, [
		`import { McpServer } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/mcp.js'))}`,
		`import { StdioServerTransport } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/stdio.js'))}`,
		`import { z } from ${JSON.stringify(import.meta.resolve('zod'))}`,
		`import { writeFileSync } from 'node:fs'`,
		`const s = new McpServer({ name: 'fake-ado', version: '1' })`,
		`s.registerTool('pipelines_build', { inputSchema: { action: z.string(), project: z.string(), definitions: z.array(z.number()), top: z.number(), queryOrder: z.string() } }, async a => { writeFileSync(${JSON.stringify(log)}, JSON.stringify(a)); return { content: [{ type: 'text', text: JSON.stringify({ items: ${JSON.stringify(items)} }) }] } })`,
		`await s.connect(new StdioServerTransport())`,
	].join('\n'))
	const { adoProbe } = await import('../src/runner/probe.ts')
	const probe = adoProbe({ agent: { flavor: 'copilot', mcpServers: { ado: { command: process.execPath, args: [server] } } } } as never)!
	try {
		assert.deepEqual(await probe.runs!('Globex', 3002), [
			{ id: 52563600, by: 'Dev Rao', at: '2026-10-20T06:00:00Z', status: 'inProgress' },
			{ id: 9100002, by: 'Kim Lee', at: '2026-10-20T05:11:00Z', status: 'completed', result: 'partiallySucceeded' },
		], 'newest first, each with who started it')
		assert.deepEqual(JSON.parse(readFileSync(log, 'utf8')), { action: 'list', project: 'Globex', definitions: [3002], top: 10, queryOrder: 'QueueTimeDescending' }, 'a read: the ring pipeline\'s newest runs')
	} finally { await probe.close?.() }
})
