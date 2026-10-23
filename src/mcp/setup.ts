import { site } from '../core/site.ts'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { workerEnv } from '../adapters/agent.ts'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { Config } from '../core/types.ts'
import { WRITE_DEFAULTS, toolOf, unsafeRead } from '../core/effects.ts'
import { remoteOf, saveCodeFolders } from '../runner/repos.ts'
import { cliConfigPath, toolServers } from '../adapters/mcp-client.ts'
import { assertTestSafe, readJson, writeJson } from '../store/fs.ts'
import { here, LOCAL_DIR, portable, Store, loadLocal } from '../store/state.ts'
import { TAKEOVER_MIN } from '../runner/tick.ts'
import { isBootstrap, startBootstrap } from '../runner/bootstrap.ts'
import { knowledgeOf } from '../runner/proposals.ts'
import { sourceFor } from '../adapters/registry.ts'
import type { Source } from '../adapters/source.ts'
import { NAME } from '../brand.ts'

export const STEPS = ['storage', 'source', 'agent', 'tools', 'knowledge', 'profile', 'rules', 'start'] as const
export type Step = (typeof STEPS)[number]

const RuleSchema = z.object({
	id: z.string(), text: z.string(),
	who: z.object({ accounts: z.array(z.object({ id: z.string().min(1), name: z.string() })).optional(), group: z.enum(['team', 'org', 'outside']).optional() })
		.refine(w => !!w.accounts?.length || !!w.group, 'A rule must name people by account ID, or a group.'),
	when: z.object({ intent: z.string().optional(), chat: z.string().optional().describe('A chat ID, or "direct" for any one-to-one chat with these people (no chat ID needed)'), minConfidence: z.enum(['high', 'medium']).optional() }),
	then: z.enum(['send', 'draft', 'ack', 'ignore', 'shortcut']),
	shortcut: z.object({ goal: z.string() }).optional(),
})

export const VALUES = {
	storage: z.object({ root: z.string().min(1).optional().describe(`Leave out: the tool picks the work OneDrive, or the folder that already has ${NAME} data`) }),
	source: z.object({ command: z.array(z.string()).min(1).optional().describe('The command that starts your Teams tool server; leave out to use your site\'s'), selfChatId: z.string().default('48:notes') }),
	agent: z.object({ flavor: z.enum(['copilot', 'claude']), command: z.array(z.string()).min(1) }).partial(),
	tools: z.object({
		tools: z.array(z.string().min(1)).min(1, 'List at least one read-only tool, such as the file viewer.').optional(),
		// A tool, or one action of it: "ado-repo_pull_request_write:vote".
		effectTools: z.array(z.string().regex(/^[^:\s]+(:[^:\s]+)?$/, 'A write tool is "server-tool", or "server-tool:action" for one action of it.')).optional(),
		// Servers the AI CLI does not start by itself, keyed by the prefix their tools use ("ado" for ado-repo_pull_request).
		servers: z.record(z.string().regex(/^[\w-]+$/), z.object({ command: z.string().min(1), args: z.array(z.string()).optional() })).optional(),
		// Owned work: the repos the owner works in, by remote (synced), and where this machine keeps its clones (local.json, never synced).
		repos: z.array(z.object({ name: z.string().min(1), remote: z.string().refine(r => !!remoteOf(r), 'A repo is its remote or web link, never a folder.') })).optional(),
		codeFolders: z.array(z.string().min(1)).optional(),
	}).refine(v => !(v.effectTools ?? []).some(t => (v.tools ?? []).includes(toolOf(t))), 'A write tool cannot also be a read tool: workers would get it before the owner approves.'),
	knowledge: z.object({ folders: z.array(z.string().min(1)).optional(), none: z.boolean().optional() }),
	profile: z.object({ markdown: z.string().min(20).optional(), aliases: z.array(z.string().min(2)).optional().describe('Other names people call the owner in chat, such as initials, from their answer') }),
	rules: z.object({ text: z.string(), compiled: z.array(RuleSchema) }).partial(),
	start: z.object({ background: z.boolean().default(true), takeover: z.boolean().optional(), alwaysOn: z.boolean().optional().describe('This machine never sleeps, such as a server or a desktop in the cloud') }),
}

type Progress = { root?: string; done: Partial<Record<Step, string>> }
const progressFile = () => join(LOCAL_DIR, 'setup.json')
// Progress belongs to one storage root. If the root changed, every later step starts over.
const progress = (): Progress => {
	const p = readJson<Progress>(progressFile(), { done: {} })
	const root = readJson<{ root?: string }>(join(LOCAL_DIR, 'local.json'), {}).root
	return p.root && root && p.root !== root ? { root, done: {} } : p
}
const machine = () => hostname().split('.')[0]

export function status(): string {
	const p = progress()
	const next = STEPS.find(s => !p.done[s])
	// The closing summary is what each step returned, so it never claims a default that was not set (round 3 review).
	if (!next) return ['Setup is complete. What was set:', ...STEPS.map(s => `- ${s}: ${p.done[s]}`), 'Change any of it in Settings, or ask me.'].join('\n')
	return [`Next step: ${next}`, ...STEPS.map(s => `- ${s}: ${p.done[s] ? `done (${p.done[s]})` : 'to do'}`)].join('\n')
}

// Each step validates its value, saves it, and records progress, so a rerun resumes (R-SET-06).
export type Deps = { oneDrives?: () => string[]; installService?: () => string; makeSource?: (s: Config['source']) => Source; checkAgent?: (flavor: Flavor, command: string[]) => string | undefined }
type Flavor = 'copilot' | 'claude'

// Work OneDrive folders on this machine. A personal OneDrive is never picked by itself (round 3 review).
export function workOneDrives(home = homedir(), env: NodeJS.ProcessEnv = process.env): string[] {
	const list = (dir: string, re: RegExp) => (existsSync(dir) ? readdirSync(dir).filter(n => re.test(n)).map(n => join(dir, n)) : [])
	const all = [env.OneDriveCommercial ?? '', ...list(join(home, 'Library', 'CloudStorage'), /^OneDrive-(?!Personal$|SharedLibraries-)/), ...list(home, /^OneDrive - /)]
	const seen = new Set<string>()
	return all.filter(d => d && existsSync(d) && !seen.has(d.toLowerCase()) && seen.add(d.toLowerCase()))
}
const hasData = (d: string) => existsSync(join(d, 'config.json')) && existsSync(join(d, 'state'))
// Picks the folder only when there is one clear answer: Delegate data already there, or a single work OneDrive.
export function pickStorage(drives: string[]): { root: string; why: string } {
	const found = drives.map(d => join(d, NAME)).filter(hasData)
	if (found.length === 1) return { root: found[0], why: ' (it already had your data)' }
	if (!found.length && drives.length === 1) return { root: join(drives[0], NAME), why: ' (your work OneDrive)' }
	const seen = found.length ? found : drives
	throw new Error(`Ask the owner where to keep ${NAME}'s data, then save { root }. ${seen.length ? `More than one fits: ${seen.join(', ')}.` : 'There is no work OneDrive on this machine; any folder synced to their other machines works.'}`)
}

const NEEDS: Partial<Record<Step, Step[]>> = { start: ['storage', 'source', 'agent'] }

export async function save(step: Step, raw: unknown, deps: Deps = {}): Promise<string> {
	// Delegate cannot run without these, so the runner is never installed before them.
	const missing = (NEEDS[step] ?? []).filter(s => !progress().done[s])
	if (missing.length) throw new Error(`Do ${missing.join(', ')} first.`)
	const v = VALUES[step].parse(raw) as never
	const summary = await apply(step, v, deps)
	const p = progress()
	const root = readJson<{ root?: string }>(join(LOCAL_DIR, 'local.json'), {}).root
	const fresh = step === 'storage' && p.root !== root
	const next: Progress = { root, done: fresh ? {} : p.done }
	next.done[step] = summary
	writeJson(progressFile(), next, machine())
	return `${summary}\n\n${status()}`
}

async function apply(step: Step, v: never, deps: Deps): Promise<string> {
	if (step === 'storage') {
		const given = (v as z.infer<typeof VALUES.storage>).root
		// A folder this machine already uses is kept, wherever it is (delegate init, or a renamed folder): setup never moves the data by itself.
		const cur = readJson<{ root?: string }>(join(LOCAL_DIR, 'local.json'), {}).root
		const pick = given ? { root: given, why: '' } : cur && existsSync(cur) ? { root: cur, why: ' (already in use on this machine)' } : pickStorage(deps.oneDrives?.() ?? workOneDrives())
		assertTestSafe(pick.root); assertTestSafe(LOCAL_DIR)
		mkdirSync(pick.root, { recursive: true })
		mkdirSync(LOCAL_DIR, { recursive: true })
		writeFileSync(join(LOCAL_DIR, 'local.json'), JSON.stringify({ root: pick.root, machine: machine() }, null, '\t'))
		return `storage at ${pick.root}${pick.why}`
	}
	const store = new Store(loadLocal())
	const cfg = store.config() ?? defaults()
	switch (step) {
		case 'source': {
			const s = v as z.infer<typeof VALUES.source>
			const command = s.command ?? teamsCommand()
			const src = (deps.makeSource ?? (c => sourceFor(c, '', store.root)))({ command, selfChatId: s.selfChatId })
			try {
				const [last] = (await src.recent(s.selfChatId, 1)).filter(m => m.from)
				if (!last) throw new Error('No message in the self-chat to learn the owner from. Post any note there, then retry.')
				cfg.owner = last.from!
			} finally { await src.close() }
			cfg.source = { command, selfChatId: s.selfChatId }
			store.saveConfig(cfg)
			return `owner ${cfg.owner.name} (${cfg.owner.id})`
		}
		case 'agent': {
			const a = v as z.infer<typeof VALUES.agent>
			const check = deps.checkAgent ?? agentProblem
			const tries: [Flavor, string[]][] = a.command ? [[a.flavor ?? 'copilot', a.command]] : candidates()
			const seen: string[] = []
			const ok = tries.find(([f, c]) => { const p = check(f, c); if (p) seen.push(`${c.join(' ')}: ${p}`); return !p })
			if (!ok) throw new Error(`No AI CLI answered. What each said:\n${seen.map(s => `- ${s}`).join('\n')}\nFix the first one you use (for most people: run it once and type /login), then retry.`)
			cfg.agent = { ...cfg.agent, flavor: ok[0], command: ok[1] }
			store.saveConfig(cfg)
			return `agent ${ok[1].join(' ')} (${ok[0]}), signed in`
		}
		case 'tools': {
			// {} keeps what this folder already has, or picks the defaults from the owner's own tool servers (dogfood: setup asked too much).
			const t0 = v as z.infer<typeof VALUES.tools>
			const t = t0.tools ? t0 : cfg.agent.tools?.length ? { tools: cfg.agent.tools, effectTools: cfg.agent.effectTools } : defaultTools()
			const unsafe = unsafeRead(t.tools ?? [], Object.keys({ ...toolServers(cfg), ...(t.servers ?? {}) }))
			if (unsafe) throw new Error(unsafe)
			cfg.agent.tools = t.tools!
			cfg.agent.effectTools = t.effectTools ?? cfg.agent.effectTools
			if (t.servers) cfg.agent.mcpServers = { ...cfg.agent.mcpServers, ...Object.fromEntries(Object.entries(t.servers).map(([k, s]) => [k, { type: 'local', command: s.command, args: s.args ?? [], tools: ['*'] }])) }
			if (t0.repos) cfg.repos = t0.repos
			if (t0.codeFolders) { const missing = t0.codeFolders.filter(f => !existsSync(f)); if (missing.length) throw new Error(`Not a folder on this machine: ${missing.join(', ')}`); saveCodeFolders(t0.codeFolders) }
			store.saveConfig(cfg)
			return `${cfg.agent.tools.length} read tools, ${cfg.agent.effectTools?.length ?? 0} write tools for approved changes${t.servers ? `, from ${Object.keys(t.servers).join(', ')}` : ''}`
		}
		case 'knowledge': {
			const k = v as z.infer<typeof VALUES.knowledge>
			if (!k.folders?.length && !k.none) { cfg.knowledge = cfg.knowledge ?? []; store.saveConfig(cfg); return `${cfg.knowledge.length} knowledge folder(s), kept` }
			const folders = k.folders ?? []
			const missing = folders.filter(f => !existsSync(here(store.root, f)) || !statSync(here(store.root, f)).isDirectory())
			if (missing.length) throw new Error(`Not a folder: ${missing.join(', ')}`)
			cfg.knowledge = folders.map(f => portable(store.root, here(store.root, f)))
			store.saveConfig(cfg)
			return `${folders.length} knowledge folder(s)`
		}
		case 'profile': {
			const { markdown: md, aliases } = v as z.infer<typeof VALUES.profile>
			if (aliases?.length) store.saveConfig({ ...store.config(), aliases })
			const called = aliases?.length ? `; people also call you ${aliases.join(', ')}` : ''
			if (!md) { if (existsSync(join(store.root, 'profile.md'))) return `profile kept${called}`; throw new Error('Draft the profile yourself instead of asking: the owner\'s name and job title (from Teams or the company directory), and how they write (greeting, length, tone) from a few of their own recent messages. Leave out other people and any facts. Save it as markdown; the owner can change it in Settings. Add aliases only if the owner tells you one.') }
			writeFileSync(join(store.root, 'profile.md'), md)
			return `profile saved${called}`
		}
		case 'rules': {
			const r0 = v as z.infer<typeof VALUES.rules>
			if (r0.text === undefined && r0.compiled === undefined) return existsSync(join(store.root, 'rules.compiled.json')) ? 'rules kept' : (writeJson(join(store.root, 'rules.compiled.json'), { schema: 1, rules: [], confirmedAt: new Date().toISOString() }, machine()), writeFileSync(join(store.root, 'rules.md'), 'None.\n'), 'no rules: every reply waits for your ok')
			const r = { text: r0.text ?? '', compiled: r0.compiled ?? [] }
			writeFileSync(join(store.root, 'rules.md'), r.text.trim() + '\n')
			writeJson(join(store.root, 'rules.compiled.json'), { schema: 1, rules: r.compiled, confirmedAt: new Date().toISOString() }, machine())
			store.saveHeldRules({})
			return `${r.compiled.length} confirmed rule(s)`
		}
		case 'start': {
			const { background, takeover, alwaysOn } = v as z.infer<typeof VALUES.start>
			// One machine reads the chats. Setup on another machine does not take that over while the first is working,
			// unless the owner asks; a standby takes over by itself once the first is quiet (tick.ts).
			const l = store.lease(), ago = l ? Math.round((Date.now() - Date.parse(l.at)) / 60_000) : Infinity
			const elsewhere = l && l.machine !== store.machine && ago < TAKEOVER_MIN ? l.machine : undefined
			const out: string[] = []
			if (elsewhere && !takeover) out.push(`${elsewhere} already reads your chats (last check ${ago} min ago). This machine stays ready and takes over by itself if ${elsewhere} stops for ${TAKEOVER_MIN} minutes. Say "move ${NAME} here" to switch now.`)
			else { store.saveConfig({ ...store.config(), runner: store.machine }); out.push(elsewhere ? `This machine now reads your chats, instead of ${elsewhere}.` : 'This machine reads your chats.') }
			out.push(background ? (deps.installService?.() ?? 'background requested') : 'manual ticks (no background runner)')
			out.push(firstLearning(store, background || !!elsewhere))
			const advice = elsewhere && !takeover ? undefined : sleepsAdvice(store.machine, alwaysOn)
			// An everyday machine sets the owner's zone; an always-on one, often on UTC, only fills it in when unknown.
			if (!store.config().tz || sleepsAdvice(store.machine, alwaysOn)) store.saveConfig({ ...store.config(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
			if (advice) out.push(advice)
			return out.join(' ')
		}
	}
	return 'saved'
}

// A workplace's wrapper (site.json) is tried first, then the plain CLIs.
const candidates = (): [Flavor, string[]][] => [...(site().agents ?? []).map(c => ['copilot', c] as [Flavor, string[]]), ['copilot', ['copilot']], ['claude', ['claude']]]

// "Installed" is not enough: a one-line prompt proves the CLI is signed in and can answer.
// Started the same way as worker runs (no shell), so a CLI that passes here also runs jobs; a shell would split the prompt into words.
// Returns undefined when it answered, or the CLI's own words when it did not, so setup never guesses the cause.
// --disable-builtin-mcps is the flag Copilot CLI and its wrappers accept (Windows setup test: 1.0.89 rejects --no-default-mcps).
export function agentProblem(flavor: Flavor, command: string[]): string | undefined {
	const [cmd, ...pre] = command
	const session = ['--session-id', randomUUID()]
	const args = flavor === 'claude' ? ['-p', 'Reply with the single word OK', ...session] : ['-p', 'Reply with the single word OK', ...session, '--allow-all-tools', '--no-ask-user', '-s', '--disable-builtin-mcps', '--available-tools', 'task_complete']
	const r = spawnSync(cmd, [...pre, ...args], { encoding: 'utf8', timeout: 180_000, windowsHide: true, env: workerEnv(process.env) })
	const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
	if (r.error) return (r.error as NodeJS.ErrnoException).code === 'ENOENT' ? `${cmd} is not installed` : String(r.error.message)
	if (r.status === 0 && /\bOK\b/i.test(r.stdout ?? '') && !/not logged in|bad credentials/i.test(out)) return undefined
	if (/not logged in|bad credentials|\b401\b|login/i.test(out)) return `not signed in: ${lastLine(out)}`
	return lastLine(out) || `exited with code ${r.status}`
}
const lastLine = (s: string) => s.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(-2).join(' ').slice(0, 240)
export const signedIn = (flavor: Flavor, command: string[]) => !agentProblem(flavor, command)

// Defaults from the tool servers the owner's AI CLI already has: read-only tools for workers, and the changes Delegate
// may make after an ok, one action each where a tool does several (owner, 2026-10-20: a PR vote is fine with the owner's ok).
export const READ_DEFAULTS: Record<string, string[]> = {
	teams: ['ListChats', 'ListChatMessages', 'GetChatMessage', 'GetChat', 'SearchTeamMessagesQueryParameters', 'ListChannelMessages', 'ListChannelMessageReplies'],
	calendar: ['ListCalendarView', 'FindMeetingTimes', 'GetUserDateAndTimeZoneSettings'],
	ado: ['repo_pull_request', 'repo_pull_request_thread', 'pipelines_build', 'pipelines_build_log', 'wit_work_item', 'search_workitem', 'search_wiki', 'wiki'],
}
// Writes are only proposed; each runs after the owner's ok (R-HIL-29). A workplace adds its own servers in site.json.
const WRITE = WRITE_DEFAULTS
export function defaultTools(mcpConfig = cliConfigPath('copilot')) {
	const have = readJson<{ mcpServers?: Record<string, { command?: string; args?: string[] }> }>(mcpConfig, {}).mcpServers ?? {}
	const read = { ...READ_DEFAULTS, ...site().read }, write = { ...WRITE, ...site().write }
	const names = Object.keys(read).filter(n => have[n]?.command)
	return {
		tools: ['view', 'glob', 'grep', ...names.flatMap(n => read[n].map(t => `${n}-${t}`))],
		effectTools: names.flatMap(n => (write[n] ?? []).map(t => `${n}-${t}`)),
		servers: Object.fromEntries(names.map(n => [n, { command: have[n].command!, args: have[n].args ?? [] }])),
	}
}

// A fresh storage folder reads the owner's history once. One that already has knowledge, or was read before, is not read again.
export function firstLearning(store: Store, runnerOn: boolean): string {
	const topics = knowledgeOf(store, store.config()).topics(), facts = topics.reduce((n, t) => n + t.entries, 0)
	const readBefore = Object.keys(store.sources()).length > 0 || store.jobs().some(isBootstrap)
	if (facts || readBefore) return `Your knowledge already has ${facts} facts in ${topics.length} topics${readBefore ? ', and your history was read before' : ''}, so it is not read again. ${NAME} keeps learning from new messages and your edits.`
	return `First time with this folder, so I'm reading your history once. ${startBootstrap(store, undefined, runnerOn)}`
}



// A new owner starts draft-only with safe defaults (R-SET-05).
function defaults(): Config {
	return {
		schema: 1, owner: { id: '', name: '' }, source: { command: teamsCommand(), selfChatId: '48:notes' },
		watch: [], discover: true, agent: { flavor: 'copilot', command: site().agents?.[0] ?? ['copilot'], tools: ['view', 'glob', 'grep'] },
		maxParallel: 3, nudgeEveryMin: 30, poll: { idleMin: 15, fastMin: 1, fastForMin: 10 },
	}
}

// Bet 1: a laptop that sleeps leaves asks unread; a machine that is always on does not. alwaysOn: the owner said so at setup.
export const sleepsAdvice = (_machine: string, alwaysOn?: boolean) => alwaysOn ? undefined : 'Asks are read only while this machine is awake. For replies while it sleeps, also run setup on a machine that never sleeps (a server or a desktop in the cloud); it stays ready and takes over by itself.'

// The Teams tool server's command: the workplace's (site.json), else one named teams-mcp on the PATH.
export const teamsCommand = () => site().teams ?? ['teams-mcp']
