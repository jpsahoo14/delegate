import type { Effect, Report, Workflow } from '../core/types.ts'
import { stateFields, LEGACY_FALLBACK, LEGACY_STOP, WORKFLOW_SCHEMA, statusFields, upgrade } from '../core/upgrades.ts'
import { agentSetupFailure } from '../core/agent-failure.ts'
import { sameChange } from '../core/effects.ts'
import { join } from 'node:path'
import { freshRead, listJson, readJson } from '../store/fs.ts'
import type { Store } from '../store/state.ts'
import { recordCommit } from './commit.ts'
import { authorAsk, specChoice } from './jobs.ts'
import { isReviewJob } from './review-gate.ts'
import { CHECK_DAYS, joinWhy, lastActivity, ownLinks, statusOf } from './work.ts'

const LIMIT = 50
const sameLink = (a: string, b: string) => a.split(':')[0].toLowerCase() === b.split(':')[0].toLowerCase() && a.split(/[:/]/).at(-1) === b.split(/[:/]/).at(-1)

export function migrateWorkflows(store: Store, now = Date.now()): number {
	const pending = store.workflows().filter(w => w.schema < WORKFLOW_SCHEMA).slice(0, LIMIT)
	let logs: ReturnType<Store['logs']> | undefined
	let workerLogs: ReturnType<Store['logs']> | undefined
	const history = () => logs ??= store.logs(30)
	let migrated = 0
	for (const was of pending) freshRead(() => {
		const w = store.workflow(was.id)
		if (!w || w.schema >= WORKFLOW_SCHEMA) return
		const commit = recordCommit(w, () => store.workflow(w.id), store.save.bind(store))
		const events: { event: string; code: string; from?: number; to?: number; step?: number; why?: string }[] = []
		for (const version of [4, 5, 6, 7]) {
			if (w.schema >= version) continue
			const candidate = structuredClone(w), from = w.schema
			let skipped: string | undefined
			if (version === 4) {
				if (w.state === 'needs_human' && LEGACY_FALLBACK.test(w.question ?? '')) {
					workerLogs ??= store.logs(14)
					const last = workerLogs.filter(e => e.event === 'worker' && e.workflowId === w.id).at(-1)
					const error = String(last?.error ?? ''), setup = agentSetupFailure(error, now)
					if (setup) Object.assign(candidate, { ...stateFields(candidate, 'running'), question: undefined, runFailed: undefined,
						statusReason: undefined, status: `Running again: the earlier run failed because ${setup.text.replace(/^The /, 'the ').replace(/\.\s.*$/, '')}`,
						pending: w.pending.length ? w.pending : w.msgIds.slice(-1) })
					else Object.assign(candidate, { question: undefined, runFailed: { at: String(last?.at || w.updatedAt), kind: 'other',
						why: error ? `the run failed (${error.split(/\r?\n/)[0].replace(/^Error: /, '').slice(0, 140)})` : 'the run stopped without a result' } })
				}
				if (w.state === 'needs_human' && !w.question && !w.draft && !w.runFailed && LEGACY_STOP.test(w.status) && w.job && store.job(w.job)?.state === 'done') {
					const rest = w.status.replace(LEGACY_STOP, ''), cut = rest.lastIndexOf('. Tried: ')
					const why = (cut >= 0 ? rest.slice(0, cut) : rest).split(/(?<=[.!?])\s+/)[0].replace(/[.\s]+$/, '')
					const tried = cut >= 0 ? rest.slice(cut + '. Tried: '.length).replace(/[.\s]+$/, '').split('; ').map(t => t.trim()).filter(Boolean) : []
					const stopped = history().filter(e => e.event === 'retry-stopped' && e.job === w.job).at(-1)
					Object.assign(candidate, { runFailed: { at: String(stopped?.at || w.updatedAt), kind: 'content', why, ...(tried.length ? { tried } : {}), job: w.job },
						...statusFields('not-finished', `Couldn't finish: ${why}`, String(stopped?.at || w.updatedAt)) })
				}
				else if (w.state === 'needs_human' && !w.question && !w.draft && !w.runFailed && LEGACY_STOP.test(w.status)) skipped = 'the stopped job is missing or has not completed'
				const hold = store.agentHold()
				if (hold && w.status === hold.text) candidate.statusReason = { kind: 'could-not-start', text: hold.text, at: w.updatedAt }
			} else if (version === 5) {
				if (w.partOf) {
					const home = store.workflow(w.partOf)
					if (home?.work && joinWhy(store, home, w)) candidate.partOf = undefined
					else if (!home?.work) skipped = 'the home item is unavailable'
				}
				if (w.work?.parts?.length && !w.partOf) {
					const parts = w.work.parts.map(id => store.workflow(id)).filter((p): p is Workflow => !!p)
					if (parts.length !== w.work.parts.length) skipped = 'a referenced part is unavailable'
					const off = parts.filter(p => joinWhy(store, w, p))
					if (off.length) {
						const kept = parts.filter(p => !off.some(x => x.id === p.id))
						const keep = [...ownLinks(store, w), ...kept.flatMap(p => ownLinks(store, p))]
						const brought = off.flatMap(p => ownLinks(store, p))
						candidate.work!.links = w.work.links.filter(l => !brought.some(b => sameLink(b, l)) || keep.some(k => sameLink(k, l)))
						candidate.work!.parts = kept.length ? kept.map(p => p.id) : undefined
					}
				}
			} else if (version === 6) {
				if (w.state === 'needs_human' && w.work && !w.work.closed && /^No news on "/.test(w.question ?? '')) {
					const last = lastActivity(store, w)
					if (!last || !w.work.checkAt) skipped = 'the last activity or check date is unavailable'
					if (last && w.work.checkAt && last > w.work.checkAt) {
						candidate.work!.checkAt = new Date(Math.max(now, Date.parse(last)) + CHECK_DAYS * 86_400_000).toISOString()
						Object.assign(candidate, { ...stateFields(candidate, 'open'), question: undefined, status: statusOf(w), pending: [] })
					}
				}
			} else {
				const job = w.job ? store.job(w.job) : undefined
				if (w.state !== 'done' && !job && w.intent === 'pr_review' && (specChoice(w.question ?? '') || w.todos?.some(t => /names no exact call/.test(t)))) skipped = 'the review job is unavailable'
				if (w.state !== 'done' && job && isReviewJob(job.key, w.intent)) {
					const additions: Effect[] = []
					if (w.question && specChoice(w.question)) {
						const effect = authorAsk(store, [w], job, w.question)
						if (effect) { additions.push(effect); candidate.question = undefined }
						else skipped = 'the author question has no verified PR reference'
					}
					if (w.todos?.some(t => /names no exact call/.test(t))) {
						const reports = listJson(join(store.root, 'state', 'done', 'reports')).filter(path => path.startsWith(join(store.root, 'state', 'done', 'reports', `${job.id}-`)))
							.map(path => readJson<Report | undefined>(path, undefined)).filter((r): r is Report => !!r)
						const run = history().filter(e => e.job === job.id && typeof e.runId === 'string').at(-1)?.runId
						const report = typeof run === 'string' ? store.archivedReport(job.id, run) : reports.length === 1 ? reports[0] : undefined
						const original = report?.effects ?? job.result?.effects ?? []
						const missing = original.filter(e => !e.call && /comment|thread/i.test(e.action))
						if (w.todos.some(t => /^Not made for you:/.test(t)) && original.some(e => !e.call && !/comment|thread/i.test(e.action))) skipped = 'the generic refusal cannot be attributed to a finding comment'
						for (const effect of missing) {
							const payload = effect.payload
							const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : undefined
							const text = typeof payload === 'string' ? payload : typeof data?.content === 'string' ? data.content : typeof data?.text === 'string' ? data.text : typeof data?.body === 'string' ? data.body : effect.summary
							const file = data?.filePath ?? data?.file, line = data?.rightFileStartLine ?? data?.line
							if (file !== undefined && (typeof file !== 'string' || !file.trim()) || line !== undefined && (typeof line !== 'number' || !Number.isInteger(line) || line <= 0)) { skipped = 'the finding has an invalid file or line'; break }
							const built = authorAsk(store, [w], job, text)
							if (!built?.call || !text.trim()) { skipped = 'the finding has no recoverable comment or PR reference'; break }
							if (typeof file === 'string') built.call.args.filePath = file
							if (typeof line === 'number') built.call.args.rightFileStartLine = line
							additions.push({ ...effect, call: built.call, done: undefined, error: undefined, maybe: undefined, off: undefined })
						}
						if (!missing.length) skipped = 'the finding comment payload was not retained'
						if (!skipped) {
							candidate.todos = w.todos.filter(t => !/names no exact call/.test(t) || !missing.some(e => t.startsWith(e.summary.replace(/[.\s]+$/, ''))) && !/^Not made for you:/.test(t))
							if (/^Approve (?:the )?draft comment\b/i.test(w.question ?? '')) candidate.question = undefined
						}
					}
					if (!skipped && additions.length) {
						candidate.effects = [...(w.effects ?? [])]
						for (const e of additions) if (!candidate.effects.some(old => sameChange(old, e))) candidate.effects.push(e)
						candidate.approved = undefined
						candidate.revAt = new Date(now).toISOString()
					}
				}
			}
			if (!skipped) Object.assign(w, candidate)
			w.schema = version
			events.push(skipped ? { event: 'upgrade-skipped', code: w.code, step: version, why: skipped } : { event: 'upgraded', code: w.code, from, to: version })
		}
		upgrade(w)
		commit(false)
		for (const event of events) store.log(event)
		migrated++
	})
	const remaining = pending.length > 0 && store.workflows().some(w => w.schema < WORKFLOW_SCHEMA), key = `schema-${WORKFLOW_SCHEMA}-done`
	freshRead(() => {
		const markers = store.upgrades()
		if (remaining && markers[key]) { delete markers[key]; store.saveUpgrades(markers) }
		else if (!remaining && !markers[key]) store.saveUpgrades({ ...markers, [key]: new Date(now).toISOString() })
	})
	return migrated
}
