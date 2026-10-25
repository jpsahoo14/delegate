import type { Config, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { freshRead } from '../store/fs.ts'
import { recordCommit } from './commit.ts'
import { clearLeft, openLeft } from './left.ts'
import { prRefFor, type BuildProbe, type PrRef, type PrState, type PrThreadActivity } from './probe.ts'

const lastProbe = new Map<string, number>()
const EVERY_MS = 10 * 60_000
const threadId = (href?: string) => {
	if (!href || !URL.canParse(href)) return undefined
	const url = new URL(href)
	if (url.protocol !== 'https:' || url.hostname !== 'dev.azure.com' && !url.hostname.endsWith('.visualstudio.com')) return undefined
	const id = url.searchParams.get('discussionId')
	return id && /^\d+$/.test(id) ? id : undefined
}

export async function probeLeft(store: Store, cfg: Config, probe: BuildProbe | undefined, now = Date.now(), force = false): Promise<number> {
	if (!probe?.pr) return 0
	const candidates = store.workflows().filter(wf => openLeft(wf).some(line => line.pr?.id || line.action.pr))
	if (!candidates.length) { lastProbe.delete(store.root); return 0 }
	if (!force && now - (lastProbe.get(store.root) ?? 0) < EVERY_MS) return 0
	lastProbe.set(store.root, now)
	const groups = new Map<string, { ref: PrRef; items: Workflow[]; threads: boolean }>()
	for (const wf of candidates) for (const line of openLeft(wf)) {
		const pr = line.pr?.id ?? line.action.pr
		const ref = pr ? prRefFor(store, wf, pr) : undefined
		if (!ref) continue
		const key = JSON.stringify([ref.project, ref.repo, ref.id]), group = groups.get(key) ?? { ref, items: [], threads: false }
		if (!group.items.some(item => item.id === wf.id)) group.items.push(wf)
		group.threads ||= (line.source.kind === 'pr-comment' || line.source.kind === 'review') && !!threadId(line.source.href)
		groups.set(key, group)
	}
	const reads = new Map<string, { state: PrState; threads: PrThreadActivity[] }>()
	const entries = [...groups.entries()]
	for (let offset = 0; offset < entries.length; offset += 4) await Promise.all(entries.slice(offset, offset + 4).map(async ([key, group]) => {
		try {
			const { project, repo, id } = group.ref
			const state = await probe.pr!(project, repo, id)
			const threads = group.threads && probe.threadActivity ? await probe.threadActivity(project, repo, id) : []
			reads.set(key, { state, threads })
		} catch (error) { store.log({ event: 'pr-check-failed', pr: group.ref.id, error: String(error).slice(0, 200) }) }
	}))
	const queued = freshRead(() => new Set(store.answers().map(item => item.answer.code)))
	const norm = (value?: string) => value?.trim().toLowerCase()
	const owner = (comment: PrThreadActivity['comments'][number]) => !!cfg.owner.id && norm(comment.authorId) === norm(cfg.owner.id) ||
		!!cfg.owner.upn && norm(comment.authorUnique) === norm(cfg.owner.upn)
	let cleared = 0
	for (const [key, group] of entries) {
		const read = reads.get(key)
		if (!read) continue
		for (const was of group.items) {
			const wf = freshRead(() => store.workflow(was.id))
			if (!wf || queued.has(wf.code) || wf.pending.length) continue
			const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
			let changed = 0
			for (const line of openLeft(wf).filter(line => (line.pr?.id ?? line.action.pr) === group.ref.id)) {
				const after = (at?: string) => !!at && Number.isFinite(Date.parse(at)) && Date.parse(at) > Date.parse(line.at) && Date.parse(at) <= now
				const closed = /^(completed|abandoned)$/i.test(read.state.status) && after(read.state.closedAt)
				const id = line.source.pr === group.ref.id && (line.source.kind === 'review' || line.source.kind === 'pr-comment') ? threadId(line.source.href) : undefined
				const replied = id ? read.threads.find(thread => thread.id === id)?.comments.filter(comment => owner(comment) && after(comment.at)).sort((a, b) => a.at.localeCompare(b.at))[0] : undefined
				const seen = closed && read.state.closedAt ? { pr: group.ref.id, how: 'closed' as const, at: read.state.closedAt } :
					replied ? { pr: group.ref.id, how: 'replied' as const, at: replied.at } : undefined
				if (seen) changed += clearLeft(wf, [line.id], { at: new Date(now).toISOString(), by: 'engine', why: 'seen-done', seen }).length
			}
			if (changed) { commit(false); cleared += changed }
		}
	}
	return cleared
}
