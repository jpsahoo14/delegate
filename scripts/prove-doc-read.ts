// Fictional-root MCP/host journey proof, outside the unit-test suite.
import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import type { Config, Report, Workflow } from '../src/core/types.ts'
import { shareHoldText } from '../src/core/share.ts'
import type { Source } from '../src/adapters/source.ts'
import type { RunInput } from '../src/adapters/agent.ts'

const script = fileURLToPath(import.meta.url), mode = process.argv[2], fixtures = process.argv[3]
if (mode === '--sharepoint') {
	const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
	const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
	const { z } = await import('zod')
	const server = new McpServer({ name: 'fictional-sharepoint', version: '1' })
	const legacy = process.argv.includes('--legacy-metadata'), urlOnly = process.argv.includes('--url-only')
	const trace = (tool: string, args: unknown) => appendFileSync(join(fixtures, 'calls.jsonl'), `${JSON.stringify({ tool, args })}\n`)
	const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] })
	const metadata = (id: string) => {
		if (id === 'denied') return { content: [{ type: 'text' as const, text: '403 Forbidden: no access' }], isError: true }
		const name = id === 'deck' ? 'Aurora.pptx' : id === 'sheet' ? 'Aurora.xlsx' : id === 'pdf' ? 'Aurora.pdf' : id === 'expanded' ? 'Expanded.docx' : 'Robin-v7.docx'
		const host = id === 'shape-url-df' ? 'acme.sharepoint-df.com' : id === 'shape-url-svc' ? 'acme.svc.ms' : id === 'shape-url-blocked' ? 'acme.sharepoint.com.evil.example' : 'acme.sharepoint.com'
		const downloadKey = id === 'shape-url-auth' ? '@content.downloadUrl' : '@content.downloadUrlNoAuth'
		const scheme = id === 'shape-url-http' ? 'http' : 'https'
		return result({ [downloadKey]: id.startsWith('shape-url-') ? `${scheme}://${host}/${id}?token=fictional-bearer` : 'https://acme.example/download', id, name, size: id === 'large' ? 30 * 1024 * 1024 : readFileSync(join(fixtures, name)).length, parentReference: { driveId: 'acme-drive' }, webUrl: `https://acme.example/${name}`, lastModifiedDateTime: '2026-10-24T07:00:00Z' })
	}
	server.registerTool('findFileOrFolder', { inputSchema: { searchQuery: z.string() } }, async args => { trace('findFileOrFolder', args); return result({ value: [] }) })
	if (!legacy) server.registerTool('getFileMetadataByUrl', { inputSchema: { fileUrl: z.string() } }, async args => { trace('getFileMetadataByUrl', args); return { content: [{ type: 'text' as const, text: 'Use the preferred metadata tool' }], isError: true } })
	const metadataTool = legacy ? 'getFileMetadataByUrl' : 'getFileOrFolderMetadataByUrl', urlKey = legacy ? 'fileUrl' : 'fileOrFolderUrl'
	server.registerTool(metadataTool, { inputSchema: { [urlKey]: z.string() } }, async args => {
		trace(metadataTool, args)
		const url = args[urlKey]
		const shape = /\/(shape-[\w-]+)\//.exec(url)?.[1]
		const id = shape ?? (url.includes('/denied/') ? 'denied' : url.includes('/large/') ? 'large' : url.includes('/server-limit/') ? 'server-limit' : url.includes('/expanded/') ? 'expanded' : url.endsWith('.pptx') ? 'deck' : url.endsWith('.xlsx') ? 'sheet' : url.endsWith('.pdf') ? 'pdf' : 'word')
		return metadata(id)
	})
	const idsTool = legacy ? 'getFileMetadata' : 'getFileOrFolderMetadata', idKey = legacy ? 'fileId' : 'fileOrFolderId'
	if (!urlOnly) server.registerTool(idsTool, { inputSchema: { documentLibraryId: z.string(), [idKey]: z.string() } }, async args => { trace(idsTool, args); return metadata(args[idKey]) })
	server.registerTool('readSmallBinaryFile', { inputSchema: { documentLibraryId: z.string(), fileId: z.string() } }, async args => {
		trace('readSmallBinaryFile', args)
		if (args.fileId === 'server-limit') return { content: [{ type: 'text' as const, text: 'File exceeds maximum binary size' }], isError: true }
		const name = args.fileId === 'deck' ? 'Aurora.pptx' : args.fileId === 'sheet' ? 'Aurora.xlsx' : args.fileId === 'expanded' ? 'Expanded.docx' : 'Robin-v7.docx'
		const base64 = readFileSync(join(fixtures, name)).toString('base64')
		const shape = args.fileId.replace(/^shape-/, '')
		if (shape === 'resource') return { content: [{ type: 'resource' as const, resource: { uri: 'urn:fictional:aurora', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', blob: base64 } }] }
		if (shape === 'image') return { content: [{ type: 'image' as const, mimeType: 'image/png', data: base64 }] }
		if (shape === 'audio') return { content: [{ type: 'audio' as const, mimeType: 'audio/wav', data: base64 }] }
		if (shape === 'base64url') return { content: [{ type: 'text' as const, text: readFileSync(join(fixtures, name)).toString('base64url') }] }
		if (shape === 'data-uri') return { content: [{ type: 'text' as const, text: `data:application/octet-stream;base64,${base64}` }] }
		if (shape === 'data-uri-url') return { content: [{ type: 'text' as const, text: `data:application/octet-stream;base64,${readFileSync(join(fixtures, name)).toString('base64url')}` }] }
		if (shape.startsWith('json-')) return result({ [shape.slice(5)]: base64 })
		if (shape.startsWith('structured-')) return { structuredContent: { [shape.slice(11)]: base64 }, content: [] }
		if (shape === 'matching') return { structuredContent: { data: base64 }, content: [{ type: 'text' as const, text: base64 }] }
		if (shape === 'ambiguous' || shape === 'url-ambiguous') return { structuredContent: { data: base64 }, content: [{ type: 'text' as const, text: Buffer.from('different bytes').toString('base64') }] }
		if (shape === 'invalid-base64') return { content: [{ type: 'text' as const, text: '%%% not file bytes %%%' }] }
		if (shape === 'unzip') return { content: [{ type: 'text' as const, text: Buffer.from('PK\x03\x04broken').toString('base64') }] }
		if (shape === 'office-parse') return { content: [{ type: 'text' as const, text: readFileSync(join(fixtures, 'Unknown.docx')).toString('base64') }] }
		if (shape.startsWith('url-') && shape !== 'url-tool-valid') return { content: [{ type: 'text' as const, text: shape === 'url-size' ? 'File exceeds maximum binary size' : 'Reader unavailable: fictional-bearer' }], isError: true }
		return legacy ? result({ contentBytes: base64 }) : { content: [{ type: 'text' as const, text: base64 }] }
	})
	await server.connect(new StdioServerTransport())
} else if (mode === '--worker') {
	const { Store } = await import('../src/store/state.ts')
	const { serve } = await import('../src/mcp/server.ts')
	await serve(() => new Store({ root: process.env.DELEGATE_ROOT!, machine: 'fictional' }))
} else if (mode === '--host') {
	const { runHost } = await import('../src/host/host.ts')
	await runHost()
} else {
	const root = mkdtempSync(join(tmpdir(), 'delegate-doc-proof-'))
	for (const name of ['local', 'copilot', 'config', 'cache', 'data', 'fixtures', 'approved', 'sdk', 'sdk\\copilot-sdk']) mkdirSync(join(root, name), { recursive: true })
	Object.assign(process.env, { DELEGATE_ROOT: join(root, 'fictional'), DELEGATE_LOCAL: join(root, 'local'), COPILOT_HOME: join(root, 'copilot'),
		XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'), DELEGATE_COPILOT_PKG: join(root, 'sdk') })
	const { Store } = await import('../src/store/state.ts')
	const { McpClient, clientFor } = await import('../src/adapters/mcp-client.ts')
	const { dispatch, runReads, workerMcp, WORKER_TOOLS } = await import('../src/runner/dispatch.ts')
	const { attachJob, startJobs, checkJobs } = await import('../src/runner/jobs.ts')
	const { intake } = await import('../src/runner/intake.ts')
	const { toRaw } = await import('../src/adapters/source-teams.ts')
	const { readsOf } = await import('../src/runner/provenance.ts')
	const { knowledgeOf } = await import('../src/runner/proposals.ts')
	const { writeRules } = await import('../src/store/rules.ts')
	const { dueSends } = await import('../src/runner/autosend.ts')
	const { applyAnswers } = await import('../src/runner/apply.ts')
	const { hostFile } = await import('../src/host/host.ts')
	const store = new Store({ root: process.env.DELEGATE_ROOT!, machine: 'fictional' })
	const fixture = join(root, 'fixtures'), url = 'https://acme.example/Robin-v7.docx'
	const calls = () => existsSync(join(fixture, 'calls.jsonl')) ? readFileSync(join(fixture, 'calls.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as { tool: string; args: { fileId?: string; fileOrFolderId?: string; documentLibraryId?: string; fileOrFolderUrl?: string; fileUrl?: string } }) : []
	const crc = (data: Buffer) => {
		let c = 0xffffffff
		for (const b of data) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0) }
		return (c ^ 0xffffffff) >>> 0
	}
	function zip(files: Record<string, string | Buffer>) {
		const entries: Buffer[] = [], directory: Buffer[] = []
		let offset = 0
		for (const [name, value] of Object.entries(files)) {
			const data = Buffer.isBuffer(value) ? value : Buffer.from(value), n = Buffer.from(name), checksum = crc(data)
			const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(checksum, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(n.length, 26)
			entries.push(header, n, data)
			const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42)
			directory.push(central, n); offset += header.length + n.length + data.length
		}
		const end = Buffer.alloc(22), central = Buffer.concat(directory)
		end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16)
		return Buffer.concat([...entries, central, end])
	}
	// A valid, noisy PNG keeps the real Office archive over 2 MB without making its extracted text enormous.
	const pixels = Buffer.alloc((1000 * 3 + 1) * 800)
	for (let y = 0; y < 800; y++) randomBytes(3000).copy(pixels, y * 3001 + 1)
	const pngChunk = (type: string, data: Buffer) => { const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, -4)), b.length - 4); return b }
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1000); ihdr.writeUInt32BE(800, 4); ihdr[8] = 8; ihdr[9] = 2
	const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))])
	const paragraph = (s: string, heading = false) => `<w:p>${heading ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ''}<w:r><w:t>${s}</w:t></w:r></w:p>`
	const text = paragraph('1. Overview', true) + paragraph('Aurora accepts typed locations. '.repeat(450)) + paragraph('2. Boundaries', true) + paragraph('Keep existing saved locations unchanged. '.repeat(450)) + paragraph('3. Final decision', true) + paragraph('LAST SECTION: keep the Aurora fallback until migration is complete.')
	const docx = zip({ '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
		'_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
		'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text}</w:body></w:document>`, 'word/media/image1.png': png })
	writeFileSync(join(fixture, 'Robin-v7.docx'), docx)
	const expanded = Buffer.from(docx)
	expanded.writeUInt32LE(100 * 1024 * 1024 + 1, expanded.readUInt32LE(expanded.length - 6) + 24)
	writeFileSync(join(fixture, 'Expanded.docx'), expanded)
	assert.ok(docx.length > 2 * 1024 * 1024)
	writeFileSync(join(fixture, 'Unknown.docx'), zip({ 'unknown.xml': '<fictional />' }))
	writeFileSync(join(fixture, 'Aurora.pptx'), zip({ 'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>', 'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide2.xml"/></Relationships>',
		'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Closing slide</a:t></a:r></a:p></p:sld>', 'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Opening &amp; plan</a:t></a:r></a:p></p:sld>' }))
	writeFileSync(join(fixture, 'Aurora.xlsx'), zip({ 'xl/workbook.xml': '<workbook><sheets><sheet name="Aurora &amp; scope" r:id="sheet"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="sheet" Target="worksheets/sheet1.xml"/></Relationships>', 'xl/sharedStrings.xml': '<sst><si><t>Shared &amp; safe</t></si></sst>',
		'xl/worksheets/sheet1.xml': `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="0"/><c r="C1" t="inlineStr"><is><t>Inline text</t></is></c><c r="D1"><v>42</v></c></row>${Array.from({ length: 2000 }, (_, i) => `<row r="${i + 2}"><c r="A${i + 2}" t="inlineStr"><is><t>${i === 1999 ? 'HIDDEN ROW 2001' : 'Visible row'}</t></is></c></row>`).join('')}</sheetData></worksheet>` }))
	writeFileSync(join(fixture, 'Aurora.pdf'), '%PDF-1.7\nfictional')
	const cfg: Config = { schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { kind: 'teams', command: [], selfChatId: 'self', docs: [process.execPath, script, '--sharepoint', fixture] }, watch: [],
		agent: { flavor: 'copilot', command: ['fictional-worker-never-launched'], tools: [], host: false }, knowledge: [join(root, 'approved')], maxParallel: 3, dailyRuns: 100, nudgeEveryMin: 10 }
	writeFileSync(join(root, 'approved', 'Aurora.md'), 'Aurora keeps existing saved locations unchanged.')
	store.saveConfig(cfg)
	let posted = 0, sequence = 0, live: ReturnType<typeof toRaw>[] = []
	const source: Source = { selfChatId: 'self', recent: async () => live, around: async (_chat, id) => ({ msg: live.find(m => m.id === id), after: [] }), newMessages: async (_chat, id) => ({ msgs: live.filter(m => !id || BigInt(m.id) > BigInt(id)), truncated: false }), recentChats: async () => [],
		send: async () => ({ msgId: String(++posted + 90000) }), sendSelf: async () => ({ msgId: '99000' }), presence: async () => ({ availability: 'Away' }), close: async () => {}, deleteMessage: async () => {}, editMessage: async () => {},
		members: async chat => ({ guests: false, ids: chat === 'narrow' ? ['robin', 'kim'] : ['robin', 'kim', 'rita'], names: { robin: 'Robin', kim: 'Kim', rita: 'Rita' } }) }
	const at = new Date().toISOString()
	function seed(chat = 'narrow') {
		const id = String(++sequence * 100)
		const w: Workflow = { schema: 1, id: `fictional-doc-${sequence}`, code: `A${sequence}`, kind: 'reply', state: 'running', key: { type: 'thread', id }, chat: { id: chat, name: 'Acme design', test: false, group: true },
			asker: { id: 'kim', name: 'Kim' }, session: { agent: 'copilot', id: randomUUID() }, lastMsgId: id, msgIds: [id], pending: [id], lastAsk: 'Robin, review the Aurora spec.', status: 'Drafting', newCount: 0, createdAt: at, updatedAt: at }
		live = [{ id, at, from: w.asker!, html: false, body: w.lastAsk! }]
		store.save(w); store.saveThread(w.id, [{ id, at, from: w.asker!, text: w.lastAsk!, byOwner: false }]); return w
	}
	const k = knowledgeOf(store, cfg)
	let passed = 0, worker: InstanceType<typeof McpClient> | undefined, host: ChildProcess | undefined
	const proof = (s: string) => { passed++; console.log(`PASS ${s}`) }
	function logCall(sessionId: string, tool: string, args: unknown, value: string) {
		const f = join(process.env.COPILOT_HOME!, 'session-state', sessionId, 'events.jsonl'); mkdirSync(dirname(f), { recursive: true })
		const id = randomUUID()
		appendFileSync(f, `${JSON.stringify({ type: 'tool.execution_start', data: { toolCallId: id, toolName: tool, arguments: args } })}\n${JSON.stringify({ type: 'tool.execution_complete', data: { toolCallId: id, success: true, result: { content: value } } })}\n`)
	}
	async function connectWorker(input: RunInput & { workflowId: string; runId: string }) {
		worker = clientFor({ command: process.execPath, args: [script, '--worker'], env: { DELEGATE_MODE: 'worker', DELEGATE_WORKFLOW: input.workflowId, DELEGATE_RUN: input.runId } })
		const listed = (await worker.listAll()).tools.map(t => t.name)
		assert.ok(listed.includes('doc_read')); assert.ok(listed.includes('submit_report'))
		return async (args: Record<string, unknown>) => {
			const result = await worker!.callText('doc_read', args)
			logCall(input.sessionId, 'delegate_worker-doc_read', args, result.text)
			assert.ok(result.text.length <= 30_000)
			return result
		}
	}
	try {
		const raw = toRaw({ id: '50', createdDateTime: at, from: { id: 'kim', displayName: 'Kim' }, body: { contentType: 'text', content: 'Robin, review this spec.' },
			attachments: [{ name: 'Robin-v7.docx', contentType: 'reference', contentUrl: url, driveId: 'acme-drive', itemId: 'word' }] })
		live = [raw]
		await intake(store, source, cfg, {}, [{ id: 'narrow', name: 'Acme design', group: true, test: false }])
		const shared = store.workflows().find(w => w.lastMsgId === '50')!
		assert.ok(shared); assert.match(shared.lastAsk!, /driveId="acme-drive".*itemId="word".*https:/)
		assert.deepEqual(store.documentChats({ url }), ['narrow'])
		assert.deepEqual(store.documentChats({ driveId: 'acme-drive', itemId: 'word' }), ['narrow'])
		assert.doesNotMatch(readFileSync(join(store.root, 'state', 'document-shares.json'), 'utf8'), /https:|acme-drive|Robin/)
		shared.state = 'done'; store.save(shared); live = []
		proof('real Teams intake retains attachment URL/ids in the prompt and sharing index')

		let w = seed()
		w.intent = 'other'; attachJob(store, cfg, w, { key: 'doc:aurora-v7', goal: 'Review all three sections of the Aurora specification' }); store.save(w)
		let input: (RunInput & { workflowId: string; runId: string }) | undefined
		const procs = { start: (_cfg: Config['agent'], i: RunInput & { workflowId: string; runId: string }) => { input = i; return { pid: process.pid } }, alive: () => false, kill: () => false, openWindow: () => { throw new Error('No windows in proof') } }
		assert.equal(await startJobs(store, cfg, procs), 1); assert.ok(input); assert.ok(input.extraTools.includes('delegate_worker-doc_read'))
		const read = await connectWorker(input)
		const first = await read({ url }), last = await read({ url, page: 2 })
		assert.equal(first.error, false); assert.match(first.text, /Outline:[\s\S]*3\. Final decision[\s\S]*pages: 2/)
		assert.match(last.text, /Heading: 2\. Boundaries/); assert.match(last.text, /LAST SECTION: keep the Aurora fallback/)
		assert.equal(calls().filter(c => c.tool === 'readSmallBinaryFile').length, 1)
		assert.equal(calls().find(c => c.tool === 'getFileOrFolderMetadataByUrl')?.args.fileOrFolderUrl, url)
		assert.deepEqual(calls().find(c => c.tool === 'readSmallBinaryFile')?.args, { documentLibraryId: 'acme-drive', fileId: 'word' })
		const readLogs = store.logs().filter(e => e.event === 'document-read')
		assert.equal(readLogs.length, 1)
		assert.deepEqual({ tool: readLogs[0].tool, size: readLogs[0].size, pages: readLogs[0].pages }, { tool: 'getFileOrFolderMetadataByUrl', size: docx.length, pages: 2 })
		assert.doesNotMatch(JSON.stringify(readLogs), /acme|Robin|LAST SECTION|https:/)
		const report: Report = { workflowId: input.workflowId, intent: 'other', state: 'needs_human', summary: 'Reviewed the final section', reply: { text: 'Section 3 says "keep the Aurora fallback until migration is complete"; retain that condition.', commitment: false, sources: [{ ref: url, tier: 'live', origin: 'extracted' }] } }
		await worker!.call('submit_report', report); await worker!.close(); worker = undefined
		await checkJobs(store, source, cfg, procs)
		w = store.workflow(w.id)!; assert.match(w.draft!.text, /Section 3/); assert.equal(store.job(w.job!)?.state, 'done')
		const log = readFileSync(join(process.env.COPILOT_HOME!, 'session-state', input.sessionId, 'events.jsonl'), 'utf8')
		assert.ok(!log.includes(docx.toString('base64').slice(0, 120))); assert.ok(!calls().some(c => c.tool === 'findFileOrFolder'))
		proof('real job start, worker MCP, paged >2 MB Word review, submit_report and checkJobs finish; no base64 in session log; one download')

		const options = workerMcp(store, 'formats', 'formats')
		const extra = await connectWorker({ ...options, workflowId: 'formats', runId: 'formats', sessionId: randomUUID(), prompt: '', extraTools: WORKER_TOOLS })
		const ids = await extra({ driveId: 'acme-drive', itemId: 'word', page: 2 }); assert.match(ids.text, /LAST SECTION/)
		assert.deepEqual(calls().find(c => c.tool === 'getFileOrFolderMetadata')?.args, { documentLibraryId: 'acme-drive', fileOrFolderId: 'word' })
		const deck = await extra({ url: 'https://acme.example/Aurora.pptx' }); assert.match(deck.text, /Opening & plan/); assert.ok(deck.text.indexOf('Opening') < deck.text.indexOf('Closing'))
		const sheet = await extra({ driveId: 'acme-drive', itemId: 'sheet' }); assert.match(sheet.text, /Sheet: Aurora & scope/); assert.match(sheet.text, /A1: Shared & safe\tC1: Inline text\tD1: 42/)
		let allSheet = sheet.text
		const pages = Number(/pages: (\d+)/.exec(sheet.text)![1])
		for (let page = 2; page <= pages; page++) allSheet += (await extra({ driveId: 'acme-drive', itemId: 'sheet', page })).text
		assert.match(allSheet, /first 2,000 rows/); assert.ok(!allSheet.includes('HIDDEN ROW 2001'))
		assert.equal((await extra({ url, page: 999 })).error, true)
		assert.equal((await extra({ name: 'Robin-v7.docx' })).error, true)
		const before = calls().filter(c => c.tool === 'readSmallBinaryFile').length
		const large = await extra({ url: 'https://acme.example/large/Robin-v7.docx' }); assert.equal(large.error, true); assert.match(large.text, /too large to open \(30 MB\)/)
		const denied = await extra({ url: 'https://acme.example/denied/Robin-v7.docx' }); assert.equal(denied.error, true); assert.equal(denied.text, "Couldn't open Robin-v7.docx: no access")
		const pdf = await extra({ url: 'https://acme.example/Aurora.pdf' }); assert.equal(pdf.error, true); assert.match(pdf.text, /not a Word, PowerPoint or Excel file/)
		assert.equal(calls().filter(c => c.tool === 'readSmallBinaryFile').length, before)
		await worker!.close(); worker = undefined
		proof('URL/ids, presentation slide order, Excel shared/inline/numeric cells and row cap; names/bad pages/PDF refused; 403/30 MB plain errors without binary fetch')

		const { SharePointDocs } = await import('../src/adapters/docs.ts')
		for (const flag of ['--url-only', '--legacy-metadata']) {
			const docs = new SharePointDocs([...cfg.source.docs!, flag])
			try {
				const doc = await docs.read({ url })
				assert.equal(typeof doc, 'object')
				if (typeof doc === 'object') assert.match(doc.text, /LAST SECTION/)
				if (flag === '--url-only') {
					const before = calls().length
					assert.equal(await docs.read({ driveId: 'acme-drive', itemId: 'word' }), "Couldn't open this document: the document server can't look it up by id")
					assert.equal(calls().length, before)
				} else {
					assert.equal(calls().findLast(c => c.tool === 'getFileMetadataByUrl')?.args.fileUrl, url)
					assert.equal(typeof await docs.read({ driveId: 'acme-drive', itemId: 'word' }), 'object')
					assert.deepEqual(calls().findLast(c => c.tool === 'getFileMetadata')?.args, { documentLibraryId: 'acme-drive', fileId: 'word' })
				}
			} finally { await docs.close() }
		}
		proof('live URL metadata name/argument and raw base64; legacy name/fileUrl and JSON bytes; missing id metadata refuses without downloading')

		w = seed(); attachJob(store, cfg, w, { key: 'doc:shapes', goal: 'Read the Aurora specification' }); store.save(w); await startJobs(store, cfg, procs)
		const shapeRead = await connectWorker(input!)
		for (const shape of ['text', 'resource', 'image', 'audio', 'base64url', 'data-uri', 'data-uri-url', 'matching', ...['contentBytes', 'base64', 'content', 'data'].flatMap(key => [`json-${key}`, `structured-${key}`])]) {
			const result = await shapeRead({ url: `https://acme.example/shape-${shape}/Robin-v7.docx`, page: 1 })
			assert.equal(result.error, false, shape); assert.match(result.text, /Outline:[\s\S]*3\. Final decision[\s\S]*page: 1; pages: 2/)
			assert.equal(store.logs().findLast(e => e.event === 'document-read')?.via, 'tool')
		}
		for (const [shape, step, kind] of [['ambiguous', 'download', 'ambiguous'], ['invalid-base64', 'decode-base64', 'invalid-base64'], ['unzip', 'unzip', 'Error'], ['office-parse', 'office-parse', 'Error']]) {
			const result = await shapeRead({ url: `https://acme.example/shape-${shape}/Robin-v7.docx` })
			assert.equal(result.error, true)
			assert.match(result.text, step === 'download' ? /couldn't download it/ : /couldn't read its contents/)
			const event = store.logs().findLast(e => e.event === 'document-read-failed')!
			assert.equal(event.step, step); assert.equal(event.class, kind); assert.ok(Array.isArray(event.contentTypes)); assert.equal(typeof event.bytes, 'number')
			assert.doesNotMatch(JSON.stringify(event), /fictional-bearer|https:|Robin|LAST SECTION|different bytes/)
		}
		await worker!.close(); worker = undefined
		store.saveJob({ ...store.job(w.job!)!, state: 'done' })
		proof('real worker doc_read opens the same >2 MB multi-section DOCX from all 16 MCP envelopes, pages text only; ambiguity/decode/unzip/parse failures have safe step/class diagnostics')

		const { documentReader } = await import('../src/worker/tools.ts')
		const originalFetch = globalThis.fetch, originalTimeout = AbortSignal.timeout
		let downloads = 0, cancelled = false, timeoutCalls = 0
		AbortSignal.timeout = milliseconds => { assert.equal(milliseconds, 30_000); timeoutCalls++; return originalTimeout(milliseconds) }
		globalThis.fetch = async (input, init) => {
			downloads++
			assert.equal(init?.redirect, 'manual'); assert.equal(init?.credentials, 'omit'); assert.equal(init?.headers, undefined); assert.ok(init?.signal instanceof AbortSignal)
			const target = new URL(String(input)), shape = target.pathname.slice(1)
			if (shape === 'shape-url-timeout') throw new DOMException('fictional-bearer must not be logged', 'TimeoutError')
			if (shape === 'shape-url-cross-host') return new Response(null, { status: 302, headers: { location: 'https://other.sharepoint.com/file?token=fictional-bearer' } })
			if (shape === 'shape-url-redirect') return new Response(null, { status: 302, headers: { location: '/shape-url-final?token=fictional-bearer' } })
			if (shape === 'shape-url-stream-limit' || shape === 'shape-url-length-limit') {
				let chunks = 0
				return new Response(new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(Buffer.alloc(chunks++ === 0 ? 25 * 1024 * 1024 : 1)) }, cancel() { cancelled = true } }),
					shape === 'shape-url-length-limit' ? { headers: { 'content-length': String(26 * 1024 * 1024) } } : {})
			}
			return new Response(new Uint8Array(docx))
		}
		try {
			const toolResult = await documentReader(store)({ url: 'https://acme.example/shape-url-tool-valid/Robin-v7.docx' })
			assert.equal(toolResult.error, undefined); assert.equal(downloads, 0)
			assert.equal(store.logs().findLast(e => e.event === 'document-read')?.via, 'tool')
			for (const shape of ['ok', 'auth', 'size', 'df', 'svc', 'redirect']) {
				const result = await documentReader(store)({ url: `https://acme.example/shape-url-${shape}/Robin-v7.docx` })
				assert.equal(result.error, undefined); assert.match(result.text, /Outline:[\s\S]*3\. Final decision/)
				assert.equal(store.logs().findLast(e => e.event === 'document-read')?.via, 'downloadUrl')
			}
			for (const [shape, kind] of [['cross-host', 'blocked-redirect'], ['timeout', 'TimeoutError'], ['stream-limit', 'too-large'], ['length-limit', 'too-large'], ['blocked', 'tool'], ['http', 'tool'], ['ambiguous', 'ambiguous']]) {
				const before: number = downloads; cancelled = false
				const result = await documentReader(store)({ url: `https://acme.example/shape-url-${shape}/Robin-v7.docx` })
				assert.equal(result.error, true)
				const event = store.logs().findLast(e => e.event === 'document-read-failed')!
				assert.equal(event.step, 'download'); assert.equal(event.class, kind)
				assert.doesNotMatch(JSON.stringify(event), /fictional-bearer|https:|Robin/)
				if (shape === 'blocked' || shape === 'http' || shape === 'ambiguous') assert.equal(downloads, before)
				if (shape.endsWith('limit')) assert.equal(cancelled, true)
				if (shape === 'cross-host') assert.equal(downloads - before, 1)
			}
			assert.ok(timeoutCalls > 0)
			assert.doesNotMatch(JSON.stringify(store.logs().filter(e => e.event === 'document-read' || e.event === 'document-read-failed')), /fictional-bearer|https:|Robin|LAST SECTION/)
		} finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout }
		proof('real doc_read URL fallback accepts only issued HTTPS hosts, same-origin redirects, no headers/credentials, 30-second signal, streamed/header 25 MB caps; safe logs never contain bearer links')

		w = seed(); attachJob(store, cfg, w, { key: 'doc:denied', goal: 'Review the spec' }); store.save(w); await startJobs(store, cfg, procs)
		const deniedRead = await connectWorker(input!)
		const refusal = await deniedRead({ url: 'https://acme.example/denied/Robin-v7.docx' })
		await worker!.call('submit_report', { workflowId: input!.workflowId, intent: 'other', state: 'needs_human', summary: 'The service did not let me inspect the specification', goalMet: false, blocker: { kind: 'transient', why: 'The document service did not answer my request', tried: ['doc_read by URL'] } })
		assert.equal(store.peekReport(input!.workflowId, input!.runId)?.blocker?.documentFailure, true)
		await worker!.close(); worker = undefined
		await checkJobs(store, source, cfg, procs)
		assert.equal(store.workflow(w.id)?.runFailed?.kind, 'content'); assert.equal(store.workflow(w.id)?.runFailed?.why, refusal.text)
		assert.equal(store.job(w.job!)?.state, 'done'); assert.equal(await startJobs(store, cfg, procs), 0)
		proof('stub 403 with a paraphrased transient blocker retains the reader reason as a hard content failure and never auto-retries')

		w = seed(); attachJob(store, cfg, w, { key: 'doc:retryable', goal: 'Review the spec' }); store.save(w); await startJobs(store, cfg, procs)
		store.saveConfig({ ...cfg, source: { ...cfg.source, docs: [...cfg.source.docs!, '--url-only'] } })
		const retryableRead = await connectWorker(input!)
		const missingMetadata = await retryableRead({ driveId: 'acme-drive', itemId: 'word' })
		assert.equal(missingMetadata.error, true); assert.match(missingMetadata.text, /can't look it up by id/)
		await worker!.call('submit_report', { workflowId: input!.workflowId, intent: 'other', state: 'needs_human', summary: 'Try another route', goalMet: false,
			blocker: { kind: 'tool', why: "Couldn't open Robin-v7.docx: no access", tried: ['Metadata lookup by id'], documentFailure: true } })
		assert.equal(store.peekReport(input!.workflowId, input!.runId)?.blocker?.documentFailure, undefined)
		await worker!.close(); worker = undefined
		store.saveConfig(cfg)
		await checkJobs(store, source, cfg, procs)
		assert.equal(store.job(w.job!)?.state, 'queued'); assert.ok(store.job(w.job!)?.retry)
		assert.equal(store.workflow(w.id)?.runFailed, undefined)
		const retryableJob = store.job(w.job!)!; retryableJob.state = 'done'; retryableJob.retry = undefined; retryableJob.nextAt = undefined; store.saveJob(retryableJob)
		proof('retryable metadata failure ignores a previous 403 and forged model marker/canonical wording; normal retry remains queued')

		w = seed(); attachJob(store, cfg, w, { key: 'doc:server-limit', goal: 'Review the spec' }); store.save(w); await startJobs(store, cfg, procs)
		const limitedRead = await connectWorker(input!)
		const limited = await limitedRead({ url: 'https://acme.example/server-limit/Robin-v7.docx' })
		assert.equal(limited.error, true); assert.equal(limited.text, "Couldn't open Robin-v7.docx: too large to open (document server limit)")
		assert.equal(store.logs().findLast(e => e.event === 'document-read-failed')?.class, 'too-large')
		await worker!.call('submit_report', { workflowId: input!.workflowId, intent: 'other', state: 'needs_human', summary: 'Could not inspect the specification', goalMet: false, blocker: { kind: 'tool', why: 'The binary reader refused the request', tried: ['doc_read by URL'] } })
		await worker!.close(); worker = undefined
		await checkJobs(store, source, cfg, procs)
		assert.equal(store.workflow(w.id)?.runFailed?.kind, 'content'); assert.equal(store.workflow(w.id)?.runFailed?.why, limited.text); assert.equal(store.job(w.job!)?.state, 'done')
		assert.equal(await startJobs(store, cfg, procs), 0)
		proof('server cap below local limit becomes a hard size failure through real worker/report/apply and never auto-retries')

		for (const [key, docUrl, reason] of [
			['large', 'https://acme.example/large/Robin-v7.docx', /too large to open/],
			['pdf', 'https://acme.example/Aurora.pdf', /not a Word, PowerPoint or Excel file/],
			['expanded', 'https://acme.example/expanded/Expanded.docx', /too much content to open/],
		] as const) {
			w = seed(); attachJob(store, cfg, w, { key: `doc:${key}`, goal: 'Review the spec' }); store.save(w); await startJobs(store, cfg, procs)
			const readBlocked = await connectWorker(input!), blocked = await readBlocked({ url: docUrl })
			assert.equal(blocked.error, true); assert.match(blocked.text, reason)
			await worker!.call('submit_report', { workflowId: input!.workflowId, intent: 'other', state: 'needs_human', summary: 'Could not inspect the document', goalMet: false,
				blocker: { kind: 'transient', why: 'The reader did not return the requested content', tried: ['doc_read'] } })
			assert.equal(store.peekReport(input!.workflowId, input!.runId)?.blocker?.documentFailure, true)
			await worker!.close(); worker = undefined
			await checkJobs(store, source, cfg, procs)
			assert.equal(store.workflow(w.id)?.runFailed?.why, blocked.text); assert.equal(store.job(w.job!)?.state, 'done')
			assert.equal(await startJobs(store, cfg, procs), 0)
		}
		proof('download cap, unsupported format and expanded-content cap all stop with canonical content reasons despite paraphrased transient reports')

		const sharedReads = runReads(store, cfg, input!.sessionId, 0)
		assert.equal(sharedReads.unknown, true) // The denied URL was not shared.
		const trace = (args: unknown, finished = true) => `${JSON.stringify({ type: 'tool.execution_start', data: { toolCallId: 'doc', toolName: 'delegate_worker-doc_read', arguments: args } })}\n${finished ? JSON.stringify({ type: 'tool.execution_complete', data: { toolCallId: 'doc', success: true, result: { content: 'Only decoded text' } } }) : ''}`
		for (const args of [{ url }, { driveId: 'acme-drive', itemId: 'word' }]) {
			const r = readsOf(trace(args), k, [], undefined, ref => store.documentChats(ref))
			assert.deepEqual(r.chats, ['narrow']); assert.equal(r.unknown, false)
		}
		for (const [toolName, key] of [['sharepoint-getFileOrFolderMetadataByUrl', 'fileOrFolderUrl'], ['sharepoint-getFileMetadataByUrl', 'fileUrl'], ['sharepoint-getFileMetadataByUrl', 'url']]) {
			const metadataThenIds = readsOf([
				{ type: 'tool.execution_start', data: { toolCallId: 'metadata', toolName, arguments: { [key]: url } } },
				{ type: 'tool.execution_complete', data: { toolCallId: 'metadata', success: true, result: { content: JSON.stringify({ id: 'resolved-item', parentReference: { driveId: 'resolved-drive' } }) } } },
				{ type: 'tool.execution_start', data: { toolCallId: 'ids', toolName: 'doc_read', arguments: { driveId: 'resolved-drive', itemId: 'resolved-item' } } },
				{ type: 'tool.execution_complete', data: { toolCallId: 'ids', success: true } },
			].map(value => JSON.stringify(value)).join('\n'), k, [], undefined, ref => store.documentChats(ref))
			assert.deepEqual(metadataThenIds.chats, ['narrow']); assert.equal(metadataThenIds.unknown, false)
		}
		assert.equal(readsOf(trace({ url: 'https://acme.example/unshared.docx' }), k, [], undefined, ref => store.documentChats(ref)).unknown, true)
		assert.equal(readsOf(trace({ url }, false), k, [], undefined, ref => store.documentChats(ref)).unknown, true)
		const old = seed('legacy'); store.saveThread(old.id, [{ id: old.lastMsgId, at, from: old.asker!, text: '[attachment: old.docx (file) https://acme.example/old.docx]', byOwner: false }])
		assert.deepEqual(new Store({ root: store.root, machine: 'fictional' }).documentChats({ url: 'https://acme.example/old.docx' }), ['legacy'])
		old.state = 'done'; store.save(old)
		proof('session arguments map URL/ids to sharing chat; unknown/unfinished reads hold; legacy stored attachment lines survive restart')

		store.saveControl({ ...store.control(), autoSend: true })
		writeRules(store, '- Reply to Kim\n', [{ id: 'R1', text: 'Reply to Kim', who: { accounts: [{ id: 'kim', name: 'Kim' }] }, when: { intent: 'other' }, then: 'send' }])
		for (const [chat, link] of [['narrow', url], ['broad', url], ['broad', 'https://acme.example/unshared.docx']]) {
			w = seed(chat)
			await dispatch(store, source, cfg, async (_agent, i) => {
				const open = await connectWorker(i), r = await open({ url: link })
				assert.match(r.text, /Outline/)
				await worker!.call('submit_report', { workflowId: i.workflowId, intent: 'other', state: 'needs_human', summary: 'Ready', reply: { text: 'Aurora keeps saved locations unchanged.', commitment: false, sources: [{ ref: link, tier: 'live', origin: 'extracted' }, { ref: join(root, 'approved', 'Aurora.md'), tier: 'card', origin: 'extracted' }] } })
				await worker!.close(); worker = undefined
				return { exitCode: 0, ms: 1 }
			})
			w = store.workflow(w.id)!
			const before = posted
			if (chat === 'narrow') {
				assert.equal(w.shareHold, undefined); assert.equal(w.state, 'scheduled')
				w.sendAt = new Date(Date.now() - 1000).toISOString(); store.save(w)
				assert.equal(await dueSends(store, source, cfg), 1); assert.equal(posted, before + 1)
			} else {
				assert.ok(w.shareHold); assert.equal(w.state, 'needs_human')
				if (link === url) assert.deepEqual(w.drewOn, ['narrow'])
				else assert.match(shareHoldText(w.shareHold) ?? '', /unknown|unverified|could not|couldn't/i)
				assert.equal(await dueSends(store, source, cfg), 0); assert.equal(posted, before)
				store.writeAnswer({ code: w.code, verb: 'ok', surface: 'panel' }); await applyAnswers(store, source, cfg)
				assert.equal(posted, before + 1, JSON.stringify(store.logs().slice(-8)))
			}
		}
		proof('real dispatch auto-sends a high-confidence same-chat rule; narrower and unknown documents hold automatic sends but owner Send posts once')

		// Fake SDK/model, real host HTTP and in-process tools: no CLI sign-in or owner session directory.
		writeFileSync(join(root, 'sdk', 'package.json'), '{"type":"module"}')
		writeFileSync(join(root, 'sdk', 'index.js'), '')
		writeFileSync(join(root, 'sdk', 'copilot-sdk', 'index.js'), `
import { appendFileSync, mkdirSync } from 'node:fs'; import { join } from 'node:path';
export const defineTool = (name, spec) => ({ name, ...spec });
export class CopilotClient {
 async start() {} async stop() {}
 async createSession(config) {
  const folder = join(process.env.COPILOT_HOME, 'session-state', config.sessionId); mkdirSync(folder, {recursive:true});
  const file = join(folder, 'events.jsonl');
  const log = e => appendFileSync(file, JSON.stringify(e)+'\\n');
  return { rpc: {tools: {initializeAndValidate: async()=>{}, getCurrentMetadata: async()=>({tools:config.tools.filter(t=>!config.sessionId.startsWith('missing-doc-') || t.name!=='delegate_worker-doc_read').map(t=>({name:t.name}))})}}, disconnect: async()=>{}, sendAndWait: async({prompt})=>{
   const params=JSON.parse(prompt), doc=config.tools.find(t=>t.name==='delegate_worker-doc_read'), report=config.tools.find(t=>t.name==='delegate_worker-submit_report');
   if(!doc || !report || config.mcpServers?.delegate_worker) throw Error('Document tools are not in-process');
   if(params.denied) {
    const r=await doc.handler({url:params.url});
    if(r?.resultType!=='failure') throw Error('Expected document failure');
    await report.handler({workflowId:params.workflowId,intent:'other',state:'needs_human',summary:'Could not inspect the specification',goalMet:false,blocker:{kind:'transient',why:'The server did not complete the read',tried:['doc_read']}});
    return {data:{content:'Report saved'}};
   }
   for(const page of [1,2]) { const args={url:params.url,page}; log({type:'tool.execution_start',data:{toolCallId:String(page),toolName:doc.name,arguments:args}}); const r=await doc.handler(args); if(typeof r!=='string') throw Error(JSON.stringify(r)); log({type:'tool.execution_complete',data:{toolCallId:String(page),success:true,result:{content:r}}}); if(page===2 && !r.includes('LAST SECTION')) throw Error('Last section not read'); }
   await report.handler({workflowId:params.workflowId,intent:'other',state:'needs_human',summary:'Read all sections',reply:{text:'Section 3 keeps the Aurora fallback until migration is complete.',commitment:false,sources:[]}});
   return {data:{content:'Report saved'}};
  }};
 }
 async resumeSession(id,config) {return this.createSession({...config,sessionId:id})}
}`);
		host = spawn(process.execPath, [script, '--host'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
		let hostError = ''; host.stderr!.on('data', b => { hostError += String(b) })
		const until = Date.now() + 20_000
		while (!existsSync(hostFile()) && Date.now() < until && host.exitCode === null) await new Promise(r => setTimeout(r, 50))
		assert.ok(existsSync(hostFile()), hostError)
		const info = JSON.parse(readFileSync(hostFile(), 'utf8')) as { port: number; token: string }
		const headers = { authorization: `Bearer ${info.token}`, 'content-type': 'application/json' }
		assert.equal((await fetch(`http://127.0.0.1:${info.port}/ping`, { headers })).status, 200)
		const hostId = randomUUID(), hostInput = { ...workerMcp(store, 'host-doc', 'host-doc'), workflowId: 'host-doc', runId: 'host-doc', sessionId: hostId, prompt: JSON.stringify({ workflowId: 'host-doc', url }), extraTools: WORKER_TOOLS }
		const result = await fetch(`http://127.0.0.1:${info.port}/run`, { method: 'POST', headers, body: JSON.stringify({ agent: cfg.agent, input: hostInput }) })
		assert.equal(result.status, 200, await result.clone().text())
		const resultData = await result.json() as { exitCode: number; requiredTools: string[] }
		assert.equal(resultData.exitCode, 0); assert.ok(resultData.requiredTools.includes('delegate_worker-doc_read'))
		assert.match(store.peekReport('host-doc', 'host-doc')!.reply!.text, /Section 3/)
		assert.equal(runReads(store, cfg, hostId, 0).unknown, false)
		const hostLog = readFileSync(join(process.env.COPILOT_HOME!, 'session-state', hostId, 'events.jsonl'), 'utf8')
		assert.ok(!hostLog.includes(docx.toString('base64').slice(0, 120)))
		proof('real responsive host registers doc_read in-process, verifies it is offered, reads page 2 and submits text-only report (stub SDK/model)')
		w = seed(); attachJob(store, cfg, w, { key: 'doc:host-denied', goal: 'Review the spec' }); store.save(w); await startJobs(store, cfg, procs)
		const deniedInput = { ...input!, prompt: JSON.stringify({ workflowId: input!.workflowId, url: 'https://acme.example/denied/Robin-v7.docx', denied: true }) }
		const deniedResult = await fetch(`http://127.0.0.1:${info.port}/run`, { method: 'POST', headers, body: JSON.stringify({ agent: cfg.agent, input: deniedInput }) })
		assert.equal(deniedResult.status, 200); assert.equal((await deniedResult.json() as { exitCode: number }).exitCode, 0)
		assert.equal(store.peekReport(input!.workflowId, input!.runId)?.blocker?.documentFailure, true)
		await checkJobs(store, source, cfg, procs)
		assert.equal(store.workflow(w.id)?.runFailed?.why, "Couldn't open Robin-v7.docx: no access")
		assert.equal(store.job(w.job!)?.state, 'done'); assert.equal(await startJobs(store, cfg, procs), 0)
		proof('warm host in-process doc_read stamps the same run-scoped failure; paraphrased 403 report stops through real checkJobs')
		const missingInput = { ...hostInput, workflowId: 'missing-doc', runId: 'missing-doc', sessionId: `missing-doc-${randomUUID()}` }
		const missing = await fetch(`http://127.0.0.1:${info.port}/run`, { method: 'POST', headers, body: JSON.stringify({ agent: cfg.agent, input: missingInput }) })
		const missingData = await missing.json() as { exitCode: number; hostFault?: string; error?: string }
		assert.equal(missingData.exitCode, 1); assert.equal(missingData.hostFault, 'tools'); assert.match(missingData.error!, /delegate_worker-doc_read/)
		assert.equal(store.peekReport('missing-doc', 'missing-doc'), undefined)
		assert.ok(store.logs().some(e => e.event === 'host-tools-missing' && e.runId === 'missing-doc'))
		const exited = once(host, 'exit'); await fetch(`http://127.0.0.1:${info.port}/drain`, { method: 'POST', headers }); await exited; host = undefined
		proof('integrated HOST preflight detects missing doc_read before a model turn, exposes tools fault for spawn fallback, and drains cleanly')
		console.log(`DOC PROOF: ${passed} fictional MCP/dispatch/job/host journey groups passed; stub model, isolated homes, no live root, no unit tests.`)
	} finally {
		await worker?.close()
		if (host && host.exitCode === null) { const exited = once(host, 'exit'); host.kill(); await exited }
		rmSync(root, { recursive: true, force: true })
	}
}
