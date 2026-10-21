import type { Config, Effect, Job, ProposedTarget, Report, Workflow } from '../core/types.ts'
import type { BuildProbe } from './probe.ts'
import { buildOf, isDeploy, NEVER_RING, pipelineOf, targetOf } from '../core/deploy.ts'
import { toolServers } from '../adapters/mcp-client.ts'
import type { Store } from '../store/state.ts'
import { homeOf, step } from './work.ts'

// Validate: deploy, watch, and report on a change the owner owns (eng-owned-work.md, slice 1). Code here holds only gates and facts;
// how to deploy, test, and read results is the AI's, from the repo's own docs (dev-spec/ai-and-code.md).

// Read-only telemetry tools, added to validate jobs only when the owner has the server. Management commands and ingestion never are.
const TELEMETRY: Record<string, string[]> = { kusto: ['kusto_query', 'kusto_list_entities', 'kusto_describe_database', 'kusto_describe_database_entity', 'kusto_sample_entity', 'kusto_known_services', 'kusto_get_shots'] }
export function telemetryTools(cfg: Config): string[] {
	const have = Object.keys(toolServers(cfg))
	return Object.entries(TELEMETRY).flatMap(([server, tools]) => (have.includes(server) ? tools.map(t => `${server}-${t}`) : []))
}
export const isValidate = (job?: Job, wf?: Workflow) => job?.intent === 'validate' || wf?.intent === 'validate'

// With no telemetry tools, the report says so, whatever the run wrote (the prompt asks; code makes sure).
export const NOT_READ = 'Telemetry was not read: no telemetry tool server is set up.'
export function telemetryNote(cfg: Config, r: Report): Report {
	if (!r.reply || telemetryTools(cfg).length || /telemetry (was|is|has) not (been )?read/i.test(r.reply.text)) return r
	return { ...r, reply: { ...r.reply, text: `${r.reply.text.trimEnd()}\n\n${NOT_READ}` } }
}

// A failure of the system under test is a finding, never the run's blocker: a validate report with a reply goes to the owner
// as a result, with what was not reached shown, instead of a retry or a holding reply (eng-owned-work.md §e).
export const findingNotBlocker = (job: Job, r: Report) => isValidate(job) && !!r.reply && r.goalMet === false && (r.blocker?.kind === 'access' || r.blocker?.kind === 'transient')

// "tested", or a window such as "14:00-15:30": the job reads results for that window and drafts the report.
const WINDOW = /\b(\d{1,2}:\d{2})\s*(?:-|–|to)\s*(\d{1,2}:\d{2})\b/
// Only an answer that starts with "tested" (or "done testing"), optionally with a window, or is just a window, and says no "not":
// "not tested yet", "who tested this?", or "deploy between 14:00-15:00" keep the ordinary path (review 10-21 P2-5).
// A negation counts only before "tested" ("not tested", "haven't tested"); after it, it is the result ("tested, no errors", round 2 P2-3).
// Before "tested" only a few plain words may come ("I've", "just"), never a negation, so "who tested this?" or "Kim tested it" keep their path.
const LEAD = /^(?:(?:i|we|i've|we've|i have|we have|just|already|ok|okay|all|so)[\s,]+)*$/i
export const saysTested = (text = '') => {
	const t = text.trim(), m = /\b(tested|done testing|finished testing)\b/i.exec(t)
	// A question ("tested?", "Tested on prod?") is not a result (round 3 P2-2).
	if (m && (/\?\s*$/.test(t) || t[m.index + m[0].length] === '?')) return false
	if (!m) return new RegExp(`^${WINDOW.source}$`).test(t)
	const before = t.slice(0, m.index)
	return LEAD.test(before)
}
// The window, in the owner's words when they gave one, else from the newest deploy Delegate made (or the work's start) until now.
export function testedAsk(home: Workflow, text: string, now = new Date()): string {
	const w = WINDOW.exec(text)
	const deployed = [...(home.work?.plan ?? [])].reverse().find(p => p.ring)
	const from = w ? `${w[1]} (your time zone)` : deployed?.done ?? home.work?.steps.find(s => /^Deployed /.test(s.what))?.at ?? home.work?.steps[0]?.at ?? home.createdAt
	const to = w ? `${w[2]} (your time zone)` : now.toISOString()
	return `Owner: "${text}". The owner tested. Read the results for ${from} to ${to}${deployed ? ` on ${deployed.ring!.name} (run ${deployed.ring!.run})` : ''} and draft the report.`
}

// What a run read from the repo's config: test rings to propose, and IDs the repo calls int or production, never allowed after.
export function proposeTargets(store: Store, r: Report) {
	if (!r.deployTargets?.length) return
	const cfg = store.config(), d = cfg.deploy ?? { allowed: [] }
	const never = [...new Set([...(d.never ?? []), ...r.deployTargets.filter(t => NEVER_RING.test(t.ring)).map(t => t.pipelineId)])]
	const proposed = r.deployTargets.filter(t => !never.includes(t.pipelineId) && !d.allowed.some(a => a.pipelineId === t.pipelineId))
	store.saveConfig({ ...cfg, deploy: { ...d, proposed, never } })
	store.log({ event: 'deploy-targets', proposed: proposed.map(t => t.pipelineId), never })
}

// A deploy already running for this work: a second one waits (one change at a time; never a redeploy over our own run).
export function deployRunning(home: Workflow): string | undefined {
	const p = home.work?.plan?.find(x => x.ring && x.probe && !x.done)
	return p ? `the deploy to ${p.ring!.name} is still running (run ${p.ring!.run}); one change at a time` : undefined
}

// After the ok, the run is a plan step with a build check, so the runner watches it with no AI, and its ring after it (owned work).
export function deployed(store: Store, wf: Workflow, e: Effect, runRef: string | undefined, goal: string): string | undefined {
	const run = Number(runRef)
	if (!isDeploy(e.call) || !Number.isInteger(run) || run <= 0) return undefined
	const home = homeOf(store, wf), cfg = store.config(), id = pipelineOf(e.call)!
	const project = String(e.call!.args.project ?? targetOf(cfg, id)?.project ?? '')
	const ring = e.deploy?.ring ?? targetOf(cfg, id)?.ring ?? `pipeline ${id}`
	home.work ??= { goal, doneWhen: 'the owner gives a verdict in the thread', steps: [], links: [] }
	const plan = home.work.plan ?? []
	const n = plan.reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, '')) || 0), 0)
	const what = `Deploy build ${buildOf(e.call)} (PR ${e.deploy?.pr ?? '?'}) to ${ring}: run ${run}`
	if (!plan.some(p => p.ring?.run === run)) home.work.plan = [...plan, { id: `p${n + 1}`, what, who: 'me', probe: { build: run, project }, ring: { name: ring, pipelineId: id, project, run } }]
	step(home, `Deployed: ${what}`, { ref: `deploy:${run}` })
	if (home !== wf) store.save(home)
	return `Deploying build ${buildOf(e.call)} to ${ring} (run ${run})`
}

// Each proposed target is read from Azure DevOps by code: its real name and path are shown beside the repo's words, and one whose
// real name is int or production goes on the never list, whatever the repo called it (review 10-21 P2-7).
export async function describeTargets(store: Store, probe: BuildProbe | undefined): Promise<number> {
	const d = store.config().deploy
	const todo = (d?.proposed ?? []).filter(t => !t.real && t.project)
	if (!todo.length || !probe?.definition) return 0
	const real = new Map<number, { name: string; path?: string } | undefined>()
	for (const t of todo) { try { real.set(t.pipelineId, await probe.definition(t.project!, t.pipelineId)) } catch (e) { store.log({ event: 'target-check-failed', pipeline: t.pipelineId, error: String(e).slice(0, 200) }) } }
	const cfg = store.config(), was = cfg.deploy!
	const bad = (t: ProposedTarget) => { const r = real.get(t.pipelineId); return real.has(t.pipelineId) && (!r || NEVER_RING.test(r.name) || NEVER_RING.test(r.path ?? '')) }
	const never = [...new Set([...(was.never ?? []), ...(was.proposed ?? []).filter(t => bad(t) && real.get(t.pipelineId)).map(t => t.pipelineId)])]
	const proposed = (was.proposed ?? []).filter(t => !bad(t)).map(t => (real.get(t.pipelineId) ? { ...t, real: real.get(t.pipelineId)! } : t))
	store.saveConfig({ ...cfg, deploy: { ...was, proposed, never } })
	return real.size
}

// A validate job never holds a shell: in the owner's clone it could run a pipeline or the repo's deploy scripts outside make_change
// and every gate here (review 10-21 P2-9). Returns the shell tool it found.
const SHELL = /(^|[-_])(bash|sh|zsh|fish|shell|powershell|pwsh|cmd|terminal|exec|execute|run_?command)([-_(]|$)/i
export const shellTool = (tools: string[]) => tools.find(t => SHELL.test(t))
export const shellInClone = (shell: string) => `It never runs in your clone with a shell tool (${shell}): it could run a pipeline or a deploy script outside your ok. Remove ${shell} from the read tools in setup`
