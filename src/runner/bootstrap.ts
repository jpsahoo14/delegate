import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Job } from '../core/types.ts'
import { ulid } from '../core/ids.ts'
import type { Store } from '../store/state.ts'
import type { Convo, History } from '../adapters/history.ts'
import { offRecord } from '../core/levels.ts'
import { NAME, CMD } from '../brand.ts'

export const BOOT_SOURCES = ['chats', 'prs', 'workitems', 'wiki', 'notes'] as const
export type BootSource = typeof BOOT_SOURCES[number]

// What each source asks for, in words. The worker picks its own tools and steps (R-BOOT-02).
const WHAT: Record<BootSource, string> = {
	chats: "the owner's Teams chats",
	prs: 'pull requests the owner wrote or reviewed',
	workitems: 'work items assigned to the owner',
	wiki: 'wiki pages the owner wrote',
	notes: "the owner's existing notes folders",
}

// The same sources, as the owner reads them.
export const YOURS: Record<BootSource, string> = { chats: 'your Teams chats', prs: 'PRs you wrote or reviewed', workitems: 'work items assigned to you', wiki: 'wiki pages you wrote', notes: 'your notes folders' }

// One job per source, reusing slice 04's detached jobs and budgets (R-BOOT-01, R-BOOT-09). A rerun starts at the checkpoint (R-BOOT-10).
// runnerOn: whether something will pick the jobs up (the background runner here, or another machine's). Without it they only queue.
export function startBootstrap(store: Store, sources: readonly BootSource[] = ['chats', 'prs', 'workitems'], runnerOn = true): string {
	const cfg = store.config()
	const checkpoints = store.sources()
	const started: string[] = [], busy: string[] = []
	for (const s of sources) {
		const key = `bootstrap:${s}`
		const since = checkpoints[key]
		const goal = `Read ${WHAT[s]} ${since ? `newer than ${since}` : 'from the last 90 days'}${s === 'notes' ? `: ${(cfg.knowledge ?? []).map(f => resolve(store.root, f)).join(', ') || 'none configured'}` : ''}, and propose lasting knowledge`
		const now = new Date().toISOString()
		const old = store.jobs().find(j => j.key === key)
		if (old && (old.state === 'running' || old.state === 'queued')) { busy.push(YOURS[s]); continue }
		const job: Job = old
			? { ...old, goal, state: 'queued', purpose: 'work', asks: [...old.asks, goal], error: undefined }
			: { schema: 1, id: ulid(), key, goal, session: { agent: cfg.agent.flavor, id: randomUUID() }, state: 'queued', purpose: 'work', parents: [], asks: [goal], createdAt: now, updatedAt: now }
		store.saveJob(job)
		started.push(YOURS[s])
	}
	const min = cfg.jobs?.minutes ?? 30
	return [
		started.length ? (runnerOn ? `Started reading ${started.join(', ')}. Each runs in the background for up to ${min} minutes.` : `Queued reading ${started.join(', ')}. Nothing reads them yet, because ${NAME} is not running in the background on any machine. Say "run ${NAME} in the background" to start it, or run "${CMD} tick" once.`) : '',
		busy.length ? `Already reading ${busy.join(', ')}.` : '',
		'Each topic I find shows up under "Knowledge to review". Nothing is saved until you say ok.',
	].filter(Boolean).join(' ')
}

export const isBootstrap = (job: Job) => job.key.startsWith('bootstrap:')

// Conversations in parts of about maxMsgs of the owner's messages, or maxChats conversations, biggest first,
// so each part fits one background run.
export function pack(cs: Convo[], maxMsgs = 300, maxChats = 12): Convo[][] {
	const parts: Convo[][] = []
	let cur: Convo[] = [], n = 0
	for (const c of [...cs].sort((a, b) => b.mine - a.mine)) {
		if (cur.length && (n + c.mine > maxMsgs || cur.length >= maxChats)) { parts.push(cur); cur = []; n = 0 }
		cur.push(c); n += c.mine
	}
	if (cur.length) parts.push(cur)
	return parts
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10)

// A queued "read your chats" job is a plan: code finds every conversation the owner wrote in (the chat list stops at 50),
// then each part becomes its own background run. Without a history source the job stays as one AI run.
export async function planChats(store: Store, history: History | undefined, now = new Date()): Promise<number> {
	const plan = store.jobs().find(j => j.key === 'bootstrap:chats' && j.state === 'queued')
	if (!plan || !history?.conversations) return 0
	const since = store.sources()['bootstrap:chats'] ?? day(now.getTime() - 90 * 86_400_000)
	const cfg = store.config(), cs = (await history.conversations(since, now)).filter(c => !offRecord(cfg, c.id))
	const parts = pack(cs), at = now.toISOString(), stamp = day(now.getTime())
	parts.forEach((p, i) => {
		const goal = [`Read ${p.length === 1 ? 'this Teams conversation' : `these ${p.length} Teams conversations`} from ${since} on, newest first, and propose lasting knowledge. The owner wrote in each; the number is how many of their messages there are.`,
			...p.map(c => `- ${c.team ? `channel ${c.id} in team ${c.team}` : `chat ${c.id}`} (${c.mine} by the owner, last ${c.lastAt.slice(0, 10)})`)].join('\n')
		store.saveJob({ schema: 1, id: ulid(), key: `bootstrap:chats:${stamp}:${i + 1}`, goal, label: `your Teams chats, part ${i + 1} of ${parts.length}`, session: { agent: cfg.agent.flavor, id: randomUUID() }, state: 'queued', purpose: 'work', parents: [], asks: [goal], createdAt: at, updatedAt: at })
	})
	Object.assign(plan, { state: 'done', result: { summary: `Found ${cs.length} conversations you wrote in since ${since}; reading them in ${parts.length} parts.`, effects: [] } })
	store.saveJob(plan)
	store.saveSource('bootstrap:chats', stamp)
	store.log({ event: 'harvest-planned', since, conversations: cs.length, parts: parts.length, messages: cs.reduce((n, c) => n + c.mine, 0) })
	return parts.length
}
