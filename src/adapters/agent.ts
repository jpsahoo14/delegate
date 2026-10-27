import { site } from '../core/site.ts'
import { spawn, spawnSync as spawnProcess } from 'node:child_process'
import { timedCall } from '../core/io-time.ts'
import { closeSync, existsSync, openSync, readdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { NAME } from '../brand.ts'
import type { Config } from '../core/types.ts'
import { PROMPT_DELIVERY_EVENT, readRun, type PromptDelivery, type RunUse } from '../core/runinfo.ts'
import { assertTestSafe } from '../store/fs.ts'
import { ownRunFiles, promptFolder, promptParts, pruneRunFiles, removeRunFiles } from './run-files.ts'
import { agentSetupFailure, type AgentSetupFailure } from '../core/agent-failure.ts'
import { scrub } from '../core/secrets.ts'
const spawnSync = timedCall(() => spawnProcess)

export type RunInput = { sessionId: string; prompt: string; cwd: string; mcpConfigPath: string; extraTools: string[]; dirs?: string[]; purpose?: 'rule-compile' }
// used: what the run used and where its time went, when the AI CLI said so (R-SET-14).
// via: the resident AI host or one process per run, and on the host whether it was already warm (#25), as the worker event reports.
export type RunResult = { exitCode: number; ms: number; summary?: string; error?: string; used?: RunUse; setup?: AgentSetupFailure; via?: 'host' | 'spawn'; warm?: boolean; sessionId?: string }

const ALWAYS = ['task_complete']

// Copilot names a tool `view` or `server-tool`; Claude Code names it `Read` or `mcp__server__tool`.
const CLAUDE_BUILTIN: Record<string, string> = { view: 'Read', glob: 'Glob', grep: 'Grep', edit: 'Edit', create: 'Write', bash: 'Bash', web_fetch: 'WebFetch' }

// A setup the worker can never run with; the message is whole, without the command path.
export class SetupError extends Error {}
function claudeTool(t: string): string | undefined {
	if (t === 'task_complete') return undefined
	if (CLAUDE_BUILTIN[t]) return CLAUDE_BUILTIN[t]
	const dash = t.indexOf('-')
	if (dash > 0) return `mcp__${t.slice(0, dash)}__${t.slice(dash + 1)}`
	throw new SetupError(`${NAME} cannot give a Claude worker the tool "${t}": it has no known Claude Code name. Remove it from agent.tools, or use the copilot flavor.`)
}
// Checked before a run is counted or started (bug 10-23 E33).
type PromptSettings = Pick<Config['agent'], 'promptDelivery' | 'promptDirStable'>
function checkPromptSettings(cfg: PromptSettings) {
	if (cfg.promptDelivery !== undefined && !['file', 'parts', 'mention'].includes(cfg.promptDelivery))
		throw new SetupError('Prompt delivery must be file, parts, or mention.')
	if (cfg.promptDirStable !== undefined && typeof cfg.promptDirStable !== 'boolean')
		throw new SetupError('Stable prompt directories must be true or false.')
}

export function checkAgentTools(cfg: Config['agent']) {
	checkPromptSettings(cfg)
	const scope = cfg.replyScope
	if (scope !== undefined) {
		if (!scope || typeof scope !== 'object' || Array.isArray(scope)) throw new SetupError('Reply scope must be an object.')
		if (scope.base !== undefined && (!Array.isArray(scope.base) || scope.base.some(family => !['teams', 'ado', 'doc', 'calendar'].includes(family))))
			throw new SetupError('Reply base families must be teams, ado, doc, or calendar.')
		if (scope.fullOnly !== undefined && (!Array.isArray(scope.fullOnly) || scope.fullOnly.some(server => typeof server !== 'string')))
			throw new SetupError('Reply full-catalog-only servers must be a list of server names.')
	}
	if (cfg.flavor === 'claude') for (const t of cfg.tools) claudeTool(t)
}

// Claude Code keeps each transcript at <config dir>/projects/<project>/<session-id>.jsonl; --resume finds it in any project.
export function claudeSessionExists(id: string, home = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')): boolean {
	const projects = join(home, 'projects')
	if (!existsSync(projects)) return false
	return readdirSync(projects).some(p => existsSync(join(projects, p, `${id}.jsonl`)))
}

export function buildArgs(cfg: Config['agent'], i: RunInput, hasSession: (id: string) => boolean = claudeSessionExists): string[] {
	checkAgentTools(cfg)
	const tools = [...new Set([...cfg.tools, ...i.extraTools, ...ALWAYS])]
	const dirs = (i.dirs ?? []).flatMap(d => ['--add-dir', d])
	if (cfg.flavor === 'claude') {
		// --allowedTools only pre-approves. The worker gets only its own MCP config (--strict-mcp-config), only the listed
		// built-ins (--tools), and dontAsk denies every call not pre-approved, whatever the owner's own permission mode.
		const named = [...new Set(tools.map(claudeTool).filter((t): t is string => !!t))]
		const session = hasSession(i.sessionId) ? ['--resume', i.sessionId] : ['--session-id', i.sessionId]
		return ['-p', i.prompt, ...session, '--strict-mcp-config', '--mcp-config', i.mcpConfigPath,
			'--tools', named.filter(t => !t.startsWith('mcp__')).join(','), '--allowedTools', named.join(','), '--permission-mode', 'dontAsk',
			...dirs, '--output-format', 'json', ...(cfg.model ? ['--model', cfg.model] : [])]
	}
	return ['-p', i.prompt, '--session-id', i.sessionId, '--allow-all-tools', '--no-ask-user', '--disable-builtin-mcps',
		'--additional-mcp-config', `@${i.mcpConfigPath}`, ...dirs, '--available-tools', ...tools,
		'--output-format', 'json', '--log-dir', agentLogDir(i.mcpConfigPath),
		...(cfg.model ? ['--model', cfg.model] : []),
		...(cfg.maxCredits ? ['--max-ai-credits', String(cfg.maxCredits)] : [])]
}

// Copilot's own log of a session, where each model call is recorded (R-SET-14). Empty when there is none.
export function sessionLog(flavor: string, id: string): string {
	if (flavor === 'claude') return ''
	try { return readFileSync(join(process.env.COPILOT_HOME ?? join(homedir(), '.copilot'), 'session-state', id, 'events.jsonl'), 'utf8') } catch { return '' }
}

export const agentLogDir = (mcpConfigPath: string) => join(dirname(mcpConfigPath), 'logs', basename(mcpConfigPath, '.json'))
export function agentProcessLog(flavor: string, mcpConfigPath: string): string {
	const folder = agentLogDir(mcpConfigPath)
	if (flavor !== 'copilot' || !existsSync(folder)) return ''
	return readdirSync(folder).filter(name => name.endsWith('.log')).map(name => {
		const file = join(folder, name), raw = readFileSync(file, 'utf8'), clean = scrub(raw)
		if (raw !== clean) writeFileSync(file, clean, { encoding: 'utf8', mode: 0o600 })
		return clean.slice(-65_536)
	}).join('\n')
}

// Continue: the same session, interactive, with every owner tool, opening with an orientation prompt (R-HIL-08, R-HIL-17).
export function interactiveCommand(cfg: Config['agent'], sessionId: string, prompt: string, mcpConfigPath: string): string[] {
	const { input } = filePrompt({ sessionId, prompt, mcpConfigPath, cwd: dirname(mcpConfigPath), extraTools: [] }, cfg.flavor)
	ownRunFiles(mcpConfigPath, process.pid, true)
	const dirs = input.dirs!.flatMap(d => ['--add-dir', d])
	if (cfg.flavor === 'claude') return [...cfg.command, '--resume', sessionId, '--mcp-config', mcpConfigPath, ...dirs, input.prompt]
	return [...cfg.command, '--session-id', sessionId, '--additional-mcp-config', `@${mcpConfigPath}`, ...dirs, '-i', input.prompt]
}

function filePrompt(input: RunInput, flavor: Config['agent']['flavor'], settings: PromptSettings = {}): { input: RunInput; delivery?: PromptDelivery } {
	checkPromptSettings(settings)
	const parent = dirname(input.mcpConfigPath)
	assertTestSafe(parent)
	pruneRunFiles(parent)
	ownRunFiles(input.mcpConfigPath, process.pid)
	const dir = promptFolder(input.mcpConfigPath), file = join(dir, 'instructions.md')
	const requested = flavor === 'copilot' ? settings.promptDelivery ?? 'file' : 'file'
	const parts = requested === 'parts' ? promptParts(input.prompt) : undefined
	const used = requested === 'parts' && !parts ? 'file' : requested
	const files = parts ? parts.map((part, index) => {
		const path = join(dir, `instructions-${index + 1}.md`)
		writeFileSync(path, part, { mode: 0o600 })
		return path
	}) : [file]
	if (!parts) writeFileSync(file, input.prompt, { encoding: 'utf8', mode: 0o600 })
	const prompt = used === 'parts'
		? `Read the complete instructions in all of these files, in order, in one turn with view: ${files.map(path => JSON.stringify(path)).join(', ')}. Then carry out that work.`
		: used === 'mention'
			? `Carry out the complete instructions in @${file}. If they were not included, read ${JSON.stringify(file)} with view, then carry out that work.`
			: `Read the complete instructions in ${JSON.stringify(file)} with ${flavor === 'claude' ? 'Read' : 'view'}, then carry out that work.`
	const inside = relative(input.cwd, dir)
	const stable = flavor === 'copilot' && settings.promptDirStable === true &&
		!isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`)
	const delivery: PromptDelivery | undefined = flavor === 'copilot'
		? { requested, used, ...(requested === 'parts' && !parts ? { fallback: 'long-line' as const } : {}) } : undefined
	return { input: { ...input, prompt, dirs: [...new Set([...(input.dirs ?? []), ...(stable ? [] : [dir])])],
		extraTools: [...input.extraTools, 'view'] }, delivery }
}

// A long job runs detached, so the tick never waits for it (R-LNG-02). Output goes to a log beside the session.
export function startAgent(cfg: Config['agent'], i: RunInput, logPath: string): { pid: number } {
	const [cmd, ...pre] = cfg.command
	let fd: number | undefined
	try {
		const prepared = filePrompt(i, cfg.flavor, cfg), args = buildArgs(cfg, prepared.input)
		assertTestSafe(logPath)
		fd = openSync(logPath, 'a')
		if (prepared.delivery) writeSync(fd, `\n${JSON.stringify({ type: PROMPT_DELIVERY_EVENT, timestamp: new Date().toISOString(), data: prepared.delivery })}\n`)
		const p = spawn(cmd, [...pre, ...args], { cwd: i.cwd, detached: true, windowsHide: true, stdio: ['ignore', fd, fd], env: workerEnv(process.env) })
		p.once('error', error => { console.error(`Could not start ${cmd}:`, error); cleanRunFiles(i.mcpConfigPath) })
		p.once('close', () => { cleanRunFiles(i.mcpConfigPath) })
		if (!p.pid) throw new Error(`Could not start ${cmd}`)
		try { ownRunFiles(i.mcpConfigPath, p.pid) } catch (error) { stopGroup(p.pid, true); throw error }
		p.unref()
		return { pid: p.pid }
	} catch (error) {
		cleanRunFiles(i.mcpConfigPath)
		throw error
	} finally {
		if (fd !== undefined) closeSync(fd)
	}
}

function cleanRunFiles(config: string): string | undefined {
	try { removeRunFiles(config) } catch (error) {
		const message = `Could not remove worker run files for ${config}: ${String(error)}`
		console.error(message)
		return message
	}
}

// A run started from inside an agent session inherits that session's variables and can attach to it
// (measured: a sign-in check appeared as an owner message). Child runs always get a clean, separate session.
export function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const out: NodeJS.ProcessEnv = {}
	for (const [k, v] of Object.entries(env)) {
		const name = k.toUpperCase()
		if (['COPILOT_ENABLE_BUILTIN_GITHUB_MCP', 'COPILOT_MCP_APPS', 'COPILOT_CLI_ENABLED_FEATURE_FLAGS'].includes(name) || name.startsWith('COPILOT_EXP_')) continue
		if (new RegExp(`^(COPILOT|CLAUDE${(site().processNames ?? []).map(n => `|${n.replace(/\W/g, '')}`).join('')})[A-Z_]*SESSION`, 'i').test(k) || ['COPILOT_CLI', 'COPILOT_CLI_RUN_AS_NODE', 'AI_AGENT', 'CLAUDECODE'].includes(k)) continue
		out[k] = v
	}
	return out
}

// Background runs are marked, so Delegate's session extension stays out of them (they load user extensions too).
export const workerEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({ ...cleanEnv(env), DELEGATE_WORKER: '1' })

// Reply runs still going when the runner exits are stopped with it, so none keeps working on a session nobody will read.
const live = new Set<number>()
let hooked = false
function stopGroup(pid: number, force: boolean) {
	if (process.platform === 'win32') spawnSync('taskkill', ['/T', ...(force ? ['/F'] : []), '/PID', String(pid)], { windowsHide: true })
	else try { process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM') } catch { /* already gone */ }
}

export function runAgent(cfg: Config['agent'], i: RunInput, timeoutMs = 10 * 60_000, graceMs = 5000): Promise<RunResult> {
	if (!hooked) {
		hooked = true
		process.once('exit', () => { for (const pid of live) stopGroup(pid, true) })
		// Ctrl+C or a service stop ends Node without an exit event unless handled.
		for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) process.once(sig, () => { for (const pid of live) stopGroup(pid, true); process.exit(code) })
	}
	const [cmd, ...pre] = cfg.command
	const t0 = Date.now()
	return new Promise(resolve => {
		// Detached, so the run leads its own process group and a timeout stops everything it started.
		let p: ReturnType<typeof spawn>
		let delivery: PromptDelivery | undefined
		try {
			const prepared = filePrompt(i, cfg.flavor, cfg)
			delivery = prepared.delivery
			p = spawn(cmd, [...pre, ...buildArgs(cfg, prepared.input)], { cwd: i.cwd, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: workerEnv(process.env) })
		} catch (error) {
			const cleanup = cleanRunFiles(i.mcpConfigPath)
			resolve({ exitCode: -1, ms: Date.now() - t0, error: `${error instanceof SetupError ? `Could not start: ${error.message}` : `Could not start ${cmd}: ${String(error)}`}${cleanup ? `. ${cleanup}` : ''}` })
			return
		}
		let out = '', err = '', done = false, timedOut = false, force: NodeJS.Timeout | undefined
		if (p.pid) live.add(p.pid)
		const finish = (r: RunResult) => {
			if (done) return
			done = true
			clearTimeout(timer); clearTimeout(force)
			if (p.pid) live.delete(p.pid)
			const result = timedOut ? { ...r, exitCode: r.exitCode || -1, error: `${cmd} timed out after ${Math.round(timeoutMs / 1000)} s` } : r
			const cleanup = cleanRunFiles(i.mcpConfigPath)
			resolve(cleanup ? { ...result, error: `${result.error ? `${result.error}. ` : ''}${cleanup}` } : result)
		}
		p.stdout?.on('data', d => { out += d })
		p.stderr?.on('data', d => { err += d })
		// Asked to stop first, so the CLI can save its session; forced after the grace time. Never blocks the runner.
		const timer = setTimeout(() => { timedOut = true; if (p.pid) { stopGroup(p.pid, false); force = setTimeout(() => stopGroup(p.pid!, true), graceMs) } }, timeoutMs)
		// A missing command fails asynchronously; without a listener that error would crash the tick (review R3).
		p.on('error', e => finish({ exitCode: -1, ms: Date.now() - t0, error: `Could not start ${cmd}: ${e.message}` }))
		p.on('close', code => {
			// Read whatever the run printed, also when its time ran out.
			const used = readRun(out, t0, process.env, sessionLog(cfg.flavor, i.sessionId), Date.now()).use
			if (delivery) used.promptDelivery = delivery
			let log: string
			try { log = agentProcessLog(cfg.flavor, i.mcpConfigPath) } catch (error) {
				finish({ exitCode: -1, ms: Date.now() - t0, error: `Could not read the AI run log: ${String(error)}` })
				return
			}
			const setup = agentSetupFailure(`${out}\n${err}\n${log}`)
			finish({ exitCode: code ?? -1, ms: Date.now() - t0, summary: summaryOf(out, i.purpose), error: code !== 0 ? err.slice(-500) || setup?.text || `${cmd} stopped` : undefined, ...(Object.keys(used).length ? { used } : {}), ...(setup ? { setup } : {}) })
		})
		if (p.pid) {
			try { ownRunFiles(i.mcpConfigPath, p.pid) } catch (error) {
				stopGroup(p.pid, true)
				finish({ exitCode: -1, ms: Date.now() - t0, error: `Could not record worker file ownership: ${String(error)}` })
			}
		}
	})
}

function summaryOf(jsonl: string, purpose?: RunInput['purpose']): string | undefined {
	for (const line of jsonl.split('\n').reverse()) {
		try {
			const e = JSON.parse(line)
			if (e.type === 'session.task_complete') return e.data?.summary
			if (purpose === 'rule-compile' && e.type === 'result' && typeof e.result === 'string') return e.result
		} catch { /* not JSON */ }
	}
	return undefined
}
