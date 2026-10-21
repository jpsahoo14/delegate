import { site } from '../core/site.ts'
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, openSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { NAME } from '../brand.ts'
import type { Config } from '../core/types.ts'
import { readRun, type RunUse } from '../core/runinfo.ts'

export type RunInput = { sessionId: string; prompt: string; cwd: string; mcpConfigPath: string; extraTools: string[]; dirs?: string[] }
// used: what the run used and where its time went, when the AI CLI said so (R-SET-14).
export type RunResult = { exitCode: number; ms: number; summary?: string; error?: string; used?: RunUse }

const ALWAYS = ['task_complete']

// Copilot names a tool `view` or `server-tool`; Claude Code names it `Read` or `mcp__server__tool`.
const CLAUDE_BUILTIN: Record<string, string> = { view: 'Read', glob: 'Glob', grep: 'Grep', edit: 'Edit', create: 'Write', bash: 'Bash', web_fetch: 'WebFetch' }

function claudeTool(t: string): string | undefined {
	if (t === 'task_complete') return undefined
	if (CLAUDE_BUILTIN[t]) return CLAUDE_BUILTIN[t]
	const dash = t.indexOf('-')
	if (dash > 0) return `mcp__${t.slice(0, dash)}__${t.slice(dash + 1)}`
	throw new Error(`${NAME} cannot give a Claude worker the tool "${t}": it has no known Claude Code name. Remove it from agent.tools, or use the copilot flavor.`)
}

// Claude Code keeps each transcript at <config dir>/projects/<project>/<session-id>.jsonl; --resume finds it in any project.
export function claudeSessionExists(id: string, home = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')): boolean {
	const projects = join(home, 'projects')
	if (!existsSync(projects)) return false
	return readdirSync(projects).some(p => existsSync(join(projects, p, `${id}.jsonl`)))
}

export function buildArgs(cfg: Config['agent'], i: RunInput, hasSession: (id: string) => boolean = claudeSessionExists): string[] {
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
	return ['-p', i.prompt, '--session-id', i.sessionId, '--allow-all-tools', '--no-ask-user',
		'--additional-mcp-config', `@${i.mcpConfigPath}`, ...dirs, '--available-tools', ...tools,
		'--output-format', 'json',
		...(cfg.model ? ['--model', cfg.model] : []),
		...(cfg.maxCredits ? ['--max-ai-credits', String(cfg.maxCredits)] : [])]
}

// Copilot's own log of a session, where each model call is recorded (R-SET-14). Empty when there is none.
export function sessionLog(flavor: string, id: string): string {
	if (flavor === 'claude') return ''
	try { return readFileSync(join(process.env.COPILOT_HOME ?? join(homedir(), '.copilot'), 'session-state', id, 'events.jsonl'), 'utf8') } catch { return '' }
}

// Continue: the same session, interactive, with every owner tool, opening with an orientation prompt (R-HIL-08, R-HIL-17).
export function interactiveCommand(cfg: Config['agent'], sessionId: string, prompt: string, mcpConfigPath: string): string[] {
	if (cfg.flavor === 'claude') return [...cfg.command, '--resume', sessionId, '--mcp-config', mcpConfigPath, prompt]
	return [...cfg.command, '--session-id', sessionId, '--additional-mcp-config', `@${mcpConfigPath}`, '-i', prompt]
}

// A long job runs detached, so the tick never waits for it (R-LNG-02). Output goes to a log beside the session.
export function startAgent(cfg: Config['agent'], i: RunInput, logPath: string): { pid: number } {
	const [cmd, ...pre] = cfg.command
	const args = buildArgs(cfg, i)
	const fd = openSync(logPath, 'a')
	const p = spawn(cmd, [...pre, ...args], { cwd: i.cwd, detached: true, windowsHide: true, stdio: ['ignore', fd, fd], env: workerEnv(process.env) })
	closeSync(fd)
	// A missing command fails asynchronously; without a listener that error would crash the tick (tester P1-9).
	p.on('error', () => {})
	p.unref()
	if (!p.pid) throw new Error(`Could not start ${cmd}`)
	return { pid: p.pid }
}


// A run started from inside an agent session inherits that session's variables and can attach to it
// (measured: a sign-in check appeared as an owner message). Child runs always get a clean, separate session.
export function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const out: NodeJS.ProcessEnv = {}
	for (const [k, v] of Object.entries(env)) {
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
		const p = spawn(cmd, [...pre, ...buildArgs(cfg, i)], { cwd: i.cwd, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: workerEnv(process.env) })
		let out = '', err = '', done = false, timedOut = false, force: NodeJS.Timeout | undefined
		if (p.pid) live.add(p.pid)
		const finish = (r: RunResult) => {
			if (done) return
			done = true
			clearTimeout(timer); clearTimeout(force)
			if (p.pid) live.delete(p.pid)
			resolve(timedOut ? { ...r, exitCode: r.exitCode || -1, error: `${cmd} timed out after ${Math.round(timeoutMs / 1000)} s` } : r)
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
			finish({ exitCode: code ?? -1, ms: Date.now() - t0, summary: summaryOf(out), error: code !== 0 ? err.slice(-500) || `${cmd} stopped` : undefined, ...(Object.keys(used).length ? { used } : {}) })
		})
	})
}

function summaryOf(jsonl: string): string | undefined {
	for (const line of jsonl.split('\n').reverse()) {
		try {
			const e = JSON.parse(line)
			if (e.type === 'session.task_complete') return e.data?.summary
		} catch { /* not JSON */ }
	}
	return undefined
}
