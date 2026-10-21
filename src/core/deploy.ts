import type { BuildFacts, Call, Config, DeployTarget, Effect, RingFacts, RunFact } from './types.ts'
import { NAME } from '../brand.ts'

// A deploy is one action of the pipelines tool: running a pipeline with a PR's build (eng-owned-work.md, slice 1).
// The tool also creates and renames pipelines and cancels or retries stages; those are never made (forbidden in effects.ts).
export const DEPLOY = 'ado-pipelines_write:run_pipeline'
export const isPipelineTool = (c?: Call) => !!c && /pipelines?_write$/i.test(c.tool)
export const isDeploy = (c?: Call) => isPipelineTool(c) && /^run_?pipeline$/i.test(String(c!.args.action ?? ''))

const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined)
export const pipelineOf = (c?: Call) => int(c?.args.pipelineId)
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
// The one build a deploy runs with, in exactly one shape: { pipelines: { <alias>: { runId } } } or { builds: { <alias>: { id | version } } }.
// Anything else (a repository ref, a container, a second build) names none, so the call is refused (review 10-21 P1-1).
export function buildOf(c?: Call): number | undefined {
	const r = c?.args.resources
	if (!obj(r) || Object.keys(r).length !== 1) return undefined
	const [kind, aliases] = Object.entries(r)[0]
	if (!obj(aliases) || Object.keys(aliases).length !== 1) return undefined
	const ref = Object.values(aliases)[0]
	if (!obj(ref) || Object.keys(ref).length !== 1) return undefined
	const [k, v] = Object.entries(ref)[0]
	return kind === 'pipelines' && k === 'runId' || kind === 'builds' && (k === 'id' || k === 'version') ? int(v) : undefined
}

// Shared and production rings are never deployed to, whatever the list says, also with a number after the name (INT2, prod1).
// Names can only refuse; only IDs allow.
export const NEVER_RING = /(^|[^a-z0-9])(int|integration|prod|production|ppe|pre-?prod|live|canary|msit|dogfood)\d*([^a-z0-9]|$)/i
// The exact call: these keys and no others. templateParameters only as the owner confirmed them for that pipeline.
const KEYS = new Set(['action', 'project', 'pipelineId', 'resources'])
export const targetOf = (cfg: Config, id?: number): DeployTarget | undefined => (id ? cfg.deploy?.allowed.find(t => t.pipelineId === id) : undefined)
export const neverId = (cfg: Config, id?: number) => !!id && (cfg.deploy?.never ?? []).includes(id)

// Why a deploy cannot be made, or undefined when it can. pr: the item's own pull request.
export function deployRefusal(cfg: Config, e: Effect, pr?: number): string | undefined {
	const c = e.call!, id = pipelineOf(c), t = targetOf(cfg, id)
	if (!id) return 'a deploy must name its pipeline by number in pipelineId'
	if (neverId(cfg, id) || t && (NEVER_RING.test(t.ring) || NEVER_RING.test(t.name ?? ''))) return `pipeline ${id} is ${t ? `${t.ring}, ` : ''}a shared or production ring; ${NAME} never deploys there`
	if (!t) return `pipeline ${id} is not on "Where ${NAME} may deploy" in Settings`
	// Pipeline IDs are unique only within a project: the target and the call both name it (review 10-21 P1-2).
	if (!t.project) return `pipeline ${id} has no project on "Where ${NAME} may deploy"; save it again in Settings`
	if (typeof c.args.project !== 'string' || !c.args.project) return 'a deploy must name its project'
	if (c.args.project.toLowerCase() !== t.project.toLowerCase()) return `pipeline ${id} is in ${t.project}, not ${c.args.project}`
	const extra = Object.keys(c.args).filter(k => !KEYS.has(k) && !(k === 'templateParameters' && t.params))
	if (extra.length) return `a deploy runs the pipeline as it is; ${extra.join(', ')} is not allowed`
	const tp = c.args.templateParameters
	if (tp !== undefined) {
		if (!obj(tp)) return 'templateParameters must be names and values'
		const off = Object.entries(tp).find(([k, v]) => t.params?.[k] === undefined || typeof v !== 'string' || v !== t.params[k])
		if (off) return `templateParameters ${off[0]} is not one you confirmed for ${t.ring}`
	}
	if (!buildOf(c)) return 'a deploy\'s resources must be exactly one PR build'
	if (!e.head) return 'a deploy must name the PR head commit its build is from'
	if (!pr) return 'a deploy must be for this item\'s PR'
	return undefined
}

// The PR as Azure DevOps has it now, and the build a deploy names, as read: the build must be that PR's, at its head, and good.
export type PrNow = { id: number; head?: string; merge?: string; branch?: string; repo?: string; repoId?: string }
export type BuildRead = { status: string; result?: string; branch?: string; version?: string; repo?: string }
const same = (a?: string, b?: string) => !!a && !!b && (a.toLowerCase() === b.toLowerCase() || Math.min(a.length, b.length) >= 7 && (a.toLowerCase().startsWith(b.toLowerCase()) || b.toLowerCase().startsWith(a.toLowerCase())))
export function buildCheck(id: number, b: BuildRead | undefined, pr: PrNow): { facts: BuildFacts } | { why: string } {
	if (!b) return { why: `build ${id} could not be read` }
	if (!/^completed$/i.test(b.status) || !/^succeeded$/i.test(b.result ?? '')) return { why: `build ${id} has not succeeded (${[b.status, b.result].filter(Boolean).join(', ').toLowerCase()})` }
	if (!pr.head) return { why: `the head of PR ${pr.id} could not be read` }
	const branches = [`refs/pull/${pr.id}/merge`, pr.branch].filter(Boolean)
	if (!branches.includes(b.branch ?? '')) return { why: `build ${id} is from ${b.branch || 'an unknown branch'}, not PR ${pr.id}` }
	if (!same(b.version, pr.head) && !same(b.version, pr.merge)) return { why: `build ${id} is from commit ${(b.version ?? 'unknown').slice(0, 7)}, not PR ${pr.id} at its head ${pr.head.slice(0, 7)}` }
	if (b.repo && ![pr.repo, pr.repoId].some(r => r && r.toLowerCase() === b.repo!.toLowerCase())) return { why: `build ${id} is from repo ${b.repo}, not ${pr.repo ?? 'the PR\'s'}` }
	return { facts: { id, pr: pr.id, head: pr.head, version: b.version!, branch: b.branch!, readAt: new Date().toISOString() } }
}

const hhmm = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const runLine = (r: RunFact) => `run ${r.id} by ${r.by || 'someone'} at ${hhmm(r.at)}${r.result ? `, ${r.result.toLowerCase()}` : r.status ? `, ${r.status.toLowerCase()}` : ''}`
// What the ring is doing, as Azure DevOps listed it before the ok: shown with the deploy, never the AI's words.
export const ringParts = (f: RingFacts) => [{ text: f.running.length ? `running now: ${f.running.map(runLine).join('; ')}` : 'nothing running' }, { text: f.last ? `last ${runLine(f.last)}` : 'no runs yet' }]
export const ringMeaning = (f: RingFacts) => ringParts(f).map(p => p.text).join('; ')
// The ring has moved since it was shown: a new run, or a different one running.
export function ringMoved(was: RingFacts, now: RingFacts): string | undefined {
	const newer = now.last && (!was.last || now.last.id !== was.last.id) ? now.last : undefined
	if (newer) return `a new ${runLine(newer)}`
	const ids = (f: RingFacts) => f.running.map(r => r.id).sort().join(',')
	if (ids(was) !== ids(now)) return now.running.length ? `running now: ${now.running.map(runLine).join('; ')}` : 'the run that was going has stopped'
	return undefined
}

// The deploy line on the card, from what code read: "Deploy build 9100001 (PR 4200002 @ 3fa91c2) to TEST3". Before the build
// is read, the line says so; the AI's words about the build are never shown (review 10-21 P1-3).
export function deployLine(e: Effect): string {
	const c = e.call!, b = buildOf(c), id = pipelineOf(c), ring = e.deploy?.ring ?? (id ? `pipeline ${id}` : 'an unnamed pipeline')
	if (e.build && e.build.id === b) return `Deploy build ${b} (PR ${e.build.pr} @ ${e.build.head.slice(0, 7)}) to ${ring}`
	return `Deploy ${b ? `build ${b}` : 'a build'} to ${ring} (build not checked yet)`
}

// Settings: "TEST3 Globex/3003 Debug=False", one per entry. The project may be left out only when a proposal named it.
// A ring that is shared or production is refused here too; Azure DevOps is read before anything is saved (settings.ts).
export function parseTargets(raw: string, cfg: Config): { ok: true; targets: (Omit<DeployTarget, 'project'> & { project?: string })[] } | { ok: false; why: string } {
	const out: (Omit<DeployTarget, 'project'> & { project?: string })[] = []
	for (const part of raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean)) {
		const words = part.split(/\s+/), params = Object.fromEntries(words.filter(w => w.includes('=')).map(w => [w.slice(0, w.indexOf('=')), w.slice(w.indexOf('=') + 1)]))
		const rest = words.filter(w => !w.includes('=')), at = rest.findIndex(w => /^(?:[^/\s]+\/)?\d+$/.test(w))
		if (at < 0 || rest.length !== 2) return { ok: false, why: `Give each as a ring and its pipeline, such as TEST3 Globex/3003. Not: ${part}` }
		const [project, idText] = rest[at].includes('/') ? rest[at].split('/') : [undefined, rest[at]], id = Number(idText), ring = rest[1 - at]
		if (NEVER_RING.test(ring) || neverId(cfg, id) || Object.entries(params).some(([k, v]) => NEVER_RING.test(k) || NEVER_RING.test(v))) return { ok: false, why: `${ring} (${id}) is a shared or production ring. ${NAME} never deploys there.` }
		const known = [...(cfg.deploy?.allowed ?? []), ...(cfg.deploy?.proposed ?? [])].find(t => t.pipelineId === id)
		out.push({ pipelineId: id, ring, ...((project ?? known?.project) ? { project: project ?? known!.project } : {}), ...(Object.keys(params).length ? { params } : {}) })
	}
	return { ok: true, targets: out }
}
const paramText = (p?: Record<string, string>) => Object.entries(p ?? {}).map(([k, v]) => ` ${k}=${v}`).join('')
export const targetsText = (ts: { pipelineId: number; ring: string; project?: string; params?: Record<string, string> }[] = []) => ts.map(t => `${t.ring} ${t.project ? `${t.project}/` : ''}${t.pipelineId}${paramText(t.params)}`).join(', ')
