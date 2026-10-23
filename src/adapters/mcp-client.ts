import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Config } from '../core/types.ts'
import { inTemp, readJson } from '../store/fs.ts'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { classifyTool, type ToolInfo } from '../core/tool-class.ts'

const sessionLost = (error: unknown) => {
	if (typeof error === 'object' && error !== null && 'code' in error && error.code === -32001) return true
	return /-32001\b|Session not found/i.test(error instanceof Error ? error.message : String(error))
}
// Only reads are called again after a lost session: a send or a change may have landed although its answer was lost
// (bug 10-23 R4: a rule reply posted twice). The classifier decides (#17), with the server's own listing when this client has it;
// a tool its server marks read-only is repeated only when it is also marked idempotent (design §6). Anything else is a write.
export const readOnlyTool = (tool: string, info?: ToolInfo) => {
	const t = info ?? { name: tool }
	return classifyTool('', t).cls === 'read' && (t.annotations?.readOnlyHint !== true || t.annotations.idempotentHint === true)
}
// A write whose answer was lost: it may or may not have been made. Never repeated automatically; the caller reads back.
export class LostResponse extends Error {
	readonly tool: string
	constructor(tool: string, cause: unknown) { super(`${tool}: the tool server lost its session before answering, so it may or may not have been done (${String(cause).slice(0, 160)})`); this.tool = tool }
}

export class McpClient {
	private client = new Client({ name: 'delegate', version: '0.1.0' })
	private connecting?: Promise<void>
	private readonly command: string[]
	private readonly env?: Record<string, string>
	private readonly name?: string
	// The catalog's hook: a server that says its tool list changed is listed again (#17, design §2).
	static onListChanged?: (server: string) => void
	// env: the whole environment for the server, when its config names variables of its own. name: the server's name in the config.
	constructor(command: string[], env?: Record<string, string>, name?: string) { this.command = command; this.env = env; this.name = name }

	// One connection, shared by calls that start together; two connects on one client throw.
	private connect(): Promise<void> {
		const [cmd, ...rest] = this.command
		if (!this.connecting && this.name) { const name = this.name; this.client.setNotificationHandler(ToolListChangedNotificationSchema, async () => { McpClient.onListChanged?.(name) }) }
		this.connecting ??= this.client.connect(new StdioClientTransport({ command: cmd, args: rest, stderr: 'pipe', ...(this.env ? { env: this.env } : {}) })).catch(e => { this.connecting = undefined; throw e })
		return this.connecting
	}

	// The server's own listing of a tool, read once, for deciding whether a call may be repeated.
	private infos?: Map<string, ToolInfo>
	private async retryable(tool: string): Promise<boolean> {
		if (!this.infos) { try { this.infos = new Map((await this.listAll()).tools.map(t => [t.name, t])) } catch { this.infos = new Map() } }
		return readOnlyTool(tool, this.infos.get(tool))
	}

	private async request(tool: string, args: Record<string, unknown>, retry = true): Promise<Awaited<ReturnType<Client['callTool']>>> {
		const client = this.client
		let result: Awaited<ReturnType<Client['callTool']>>
		try {
			await this.connect()
			result = await client.callTool({ name: tool, arguments: args })
		} catch (error) {
			if (!retry || !sessionLost(error)) throw error
			await this.reconnect(client)
			if (!(await this.retryable(tool))) throw new LostResponse(tool, error)
			console.warn(`MCP session lost for ${tool}; reconnecting once.`)
			return this.request(tool, args, false)
		}
		const text = (result.content as { type: string; text?: string }[] | undefined)?.map(c => c.text ?? '').join('') ?? ''
		if (retry && result.isError && sessionLost(text)) {
			await this.reconnect(client)
			if (!(await this.retryable(tool))) throw new LostResponse(tool, text)
			console.warn(`MCP session lost for ${tool}; reconnecting once.`)
			return this.request(tool, args, false)
		}
		return result
	}

	private async reconnect(client: Client) {
		// Concurrent failures from the same connection must not close its replacement.
		if (client !== this.client) return
		await this.close()
	}

	async call<T = unknown>(tool: string, args: Record<string, unknown>): Promise<T> {
		const r = await this.request(tool, args)
		const text = (r.content as { type: string; text?: string }[] | undefined)?.map(c => c.text ?? '').join('') ?? ''
		if (r.isError) throw new Error(`${tool} failed: ${text.slice(0, 300)}`)
		return parseLoose<T>(text, r.structuredContent)
	}

	// The tool's own input schema, read once: a change whose arguments it would reject is never called (bug 10-23 E16).
	private schemas?: Promise<Map<string, { properties?: Record<string, unknown>; required?: string[] }>>
	async argsProblem(tool: string, args: Record<string, unknown>): Promise<string | undefined> {
		this.schemas ??= this.connect().then(() => this.client.listTools()).then(r => new Map(r.tools.map(t => [t.name, t.inputSchema as { properties?: Record<string, unknown>; required?: string[] }])), e => { this.schemas = undefined; throw e })
		const schema = (await this.schemas).get(tool)
		if (!schema) return `the tool server has no tool ${tool}`
		const known = Object.keys(schema.properties ?? {}), unknown = known.length ? Object.keys(args).filter(k => !known.includes(k)) : []
		const missing = (schema.required ?? []).filter(k => args[k] === undefined || args[k] === '')
		if (!unknown.length && !missing.length) return undefined
		return `${tool} would reject it (${[unknown.length ? `it does not take ${unknown.join(', ')}` : '', missing.length ? `it needs ${missing.join(', ')}` : ''].filter(Boolean).join('; ')}; it takes ${known.join(', ')}), so it was not called`
	}

	// Every tool the server lists, page by page, with its name and version (#17: the catalog classifies them).
	async listAll(): Promise<{ server?: { name: string; version: string }; tools: ToolInfo[] }> {
		await this.connect()
		const tools: ToolInfo[] = []
		let cursor: string | undefined
		do {
			const page = await this.client.listTools(cursor ? { cursor } : undefined)
			tools.push(...page.tools.map(t => ({ name: t.name, description: t.description, annotations: t.annotations as ToolInfo['annotations'], inputSchema: t.inputSchema as ToolInfo['inputSchema'] })))
			cursor = page.nextCursor
		} while (cursor)
		const v = this.client.getServerVersion()
		return { server: v ? { name: v.name, version: v.version } : undefined, tools }
	}

	// The text parts as sent, for tools whose result is not JSON (such as a file's base64).
	async texts(tool: string, args: Record<string, unknown>): Promise<string[]> {
		const r = await this.request(tool, args)
		const parts = (r.content as { type: string; text?: string }[] | undefined)?.map(c => c.text ?? '') ?? []
		if (r.isError) throw new Error(`${tool} failed: ${parts.join('').slice(0, 300)}`)
		return parts
	}

	async close() {
		const client = this.client, connecting = this.connecting
		this.client = new Client({ name: 'delegate', version: '0.1.0' })
		this.connecting = undefined
		if (connecting) await client.close()
	}
}

// Some servers append a correlation line after the JSON body.
export function parseLoose<T>(text: string, structured?: unknown): T {
	if (structured) return structured as T
	const end = text.lastIndexOf('}')
	const start = text.indexOf('{')
	if (start < 0 || end < start) return { text } as T
	try { return JSON.parse(text.slice(start, end + 1)) as T } catch { return { text } as T }
}

// A tool server as an MCP config lists it: a command to start, or a remote url (http, sse).
export type ServerSpec = { command?: string; args?: string[]; env?: Record<string, string>; type?: string; url?: string }
// The AI CLI's own MCP config: where setup finds the owner's tool servers, and where the CLI starts the ones setup did not save.
export const cliConfigPath = (flavor: string) => flavor === 'claude' ? join(process.env.CLAUDE_CONFIG_DIR ?? homedir(), '.claude.json') : join(process.env.COPILOT_HOME ?? join(homedir(), '.copilot'), 'mcp-config.json')

export type CliServers = { path: string; servers: Record<string, ServerSpec>; error?: string }
const lastRead = new Map<string, { stamp: string; got: CliServers }>()
// The tool servers the AI CLI starts itself (review 10-21 P1-2). A file that cannot be read gives none, with the reason, and never
// stops a cycle (review 10-21b P1). It is read again only when it changes: Claude's file is large and often rewritten (P2-6).
// Under the test runner only a temp folder is read, so no test reaches a real server.
export function cliServers(flavor: string): CliServers {
	const path = cliConfigPath(flavor)
	if (process.env.NODE_TEST_CONTEXT && !inTemp(path)) return { path, servers: {} }
	let stamp: string
	try { const st = statSync(path); stamp = `${st.mtimeMs}:${st.size}` } catch (e) { return (e as NodeJS.ErrnoException).code === 'ENOENT' ? { path, servers: {} } : { path, servers: {}, error: String(e).slice(0, 160) } }
	const had = lastRead.get(path)
	if (had?.stamp === stamp) return had.got
	let got: CliServers
	try { got = { path, servers: readJson<{ mcpServers?: Record<string, ServerSpec> }>(path, {}).mcpServers ?? {} } } catch (e) { got = { path, servers: {}, error: String(e).slice(0, 160) } }
	lastRead.set(path, { stamp, got })
	return got
}

// The owner's tool servers by prefix: those setup saved, else those the AI CLI starts itself.
export function toolServers(cfg: Config): Record<string, ServerSpec> {
	return { ...cliServers(cfg.agent.flavor).servers, ...(cfg.agent.mcpServers as Record<string, ServerSpec> | undefined) }
}

// A client for a server with a command, started as its config says: ${VAR} taken from this process's environment,
// and the whole environment, as the AI CLI starts it, with its own env on top (review 10-21b P2-2, 10-21c P2-1).
const expand = (v: string) => v.replace(/\$\{(\w+)\}/g, (_, k: string) => process.env[k] ?? '')
export function clientFor(s: ServerSpec & { command: string }, name?: string): McpClient {
	const own = Object.fromEntries(Object.entries(s.env ?? {}).map(([k, v]) => [k, expand(String(v))]))
	const env = Object.fromEntries(Object.entries({ ...process.env, ...own }).filter((x): x is [string, string] => x[1] !== undefined))
	return new McpClient([expand(s.command), ...(s.args ?? []).map(expand)], env, name)
}
