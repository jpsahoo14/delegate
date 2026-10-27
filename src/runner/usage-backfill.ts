import type { RunKey, RunKind, RunSession, RunUse } from '../core/runinfo.ts'
import { mergeUse, ran, readRun, usageKey } from '../core/runinfo.ts'
import { sessionLog } from '../adapters/agent.ts'
import { localDay, type Store } from '../store/state.ts'

type Event = Record<string, unknown>
export type UsageContext = Pick<RunUse, 'key' | 'session' | 'carriedIn' | 'promptChars'>
const contexts = new Map<string, UsageContext>()
const kinds = new Set<RunKind>(['draft', 'review', 'ask', 'change', 'job', 'reminder', 'owner-reply', 'promise', 'rule'])
const keyKinds = new Set<RunKey['kind']>(['chat', 'ask', 'pr', 'repo', 'job', 'run'])
const states = new Set<NonNullable<RunSession['state']>>(['new', 'resumed', 'rotated'])
const reasons = new Set<NonNullable<RunSession['why']>>(['retry', 'catalog', 'cap', 'crash', 'relay', 'requeue', 'age', 'rules'])
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
const object = (value: unknown): Event => value && typeof value === 'object' && !Array.isArray(value) ? value as Event : {}
const text = (value: unknown) => typeof value === 'string' ? value : undefined

function contextOf(value: unknown): UsageContext {
	const input = object(value), key = object(input.key), session = object(input.session)
	const keyKind = text(key.kind), state = text(session.state), why = text(session.why)
	return {
		...(keyKind && keyKinds.has(keyKind as RunKey['kind']) && typeof key.hash === 'string' && /^[a-f0-9]{16}$/.test(key.hash)
			? { key: { kind: keyKind as RunKey['kind'], hash: key.hash } } : {}),
		...(typeof session.id === 'string' ? { session: { id: session.id,
			...(state && states.has(state as NonNullable<RunSession['state']>) ? { state: state as NonNullable<RunSession['state']> } : {}),
			...(why && reasons.has(why as NonNullable<RunSession['why']>) ? { why: why as NonNullable<RunSession['why']> } : {}),
			...(number(session.ageMin) !== undefined ? { ageMin: number(session.ageMin) } : {}),
			...(number(session.turn) !== undefined ? { turn: number(session.turn) } : {}) } } : {}),
		promptChars: number(input.promptChars), carriedIn: number(input.carriedIn),
	}
}

export function rememberUsage(runId: string, context: UsageContext): void { contexts.set(runId, context) }

export function takeUsageContext(store: Store, runId: string, startedAt: string): UsageContext {
	const known = contexts.get(runId)
	contexts.delete(runId)
	if (known) return known
	const day = startedAt.slice(0, 10), next = new Date(Date.parse(startedAt) + 86_400_000).toISOString().slice(0, 10)
	const start = store.logFiles().filter(file => file.machine === store.machine && file.day >= day && file.day <= next)
		.flatMap(file => store.logOf(file.file)).find(event => event.event === 'job-start' && event.runId === runId)
	return contextOf(start?.usage)
}

export function jobUsageKey(key: string): RunKey {
	return usageKey(/^pr:/i.test(key) ? 'pr' : /^repo:/i.test(key) ? 'repo' : 'job', key)
}

function localEvents(store: Store, days: number): Event[] {
	return store.logs(days).filter(event => event.machine === store.machine)
}

function runs(events: Event[]): Event[] {
	const result = new Map<string, Event>()
	for (const event of events) if (typeof event.runId === 'string' && kinds.has(event.runKind as RunKind))
		result.set(event.runId, { ...result.get(event.runId), ...event })
	return [...result.values()]
}

function useOf(event: Event): RunUse {
	const models = Array.isArray(event.models) ? event.models.filter(value => typeof object(value).id === 'string') : undefined
	return {
		tokensIn: number(event.tokensIn), tokensOut: number(event.tokensOut),
		tokensCacheRead: number(event.tokensCacheRead), tokensCacheWrite: number(event.tokensCacheWrite),
		modelCalls: number(event.modelCalls), creditsNano: number(event.creditsNano),
		creditsStatus: event.creditsStatus === 'complete' || event.creditsStatus === 'partial' || event.creditsStatus === 'byok' || event.creditsStatus === 'none' ? event.creditsStatus : undefined,
		...(models ? { models: models.map(value => {
			const model = object(value)
			return { id: String(model.id), ...(typeof model.name === 'string' ? { name: model.name } : {}),
				calls: number(model.calls), tokensIn: number(model.tokensIn), tokensOut: number(model.tokensOut),
				tokensCacheRead: number(model.tokensCacheRead), tokensCacheWrite: number(model.tokensCacheWrite),
				creditsNano: number(model.creditsNano),
				creditsStatus: model.creditsStatus === 'complete' || model.creditsStatus === 'partial' || model.creditsStatus === 'byok' || model.creditsStatus === 'none' ? model.creditsStatus : undefined }
		}) } : {}),
	}
}

/** Ended local days only, deduplicated by run and day/key; unknown totals stay absent. */
export function usageDays(store: Store, now = Date.now()): number {
	const today = localDay(new Date(now)), marker = `usage-days-1:${store.machine}`
	if (store.upgrades()[marker] === today) return 0
	const events = localEvents(store, store.config().retentionDays ?? 30), existing = new Set(events.filter(event => event.event === 'usage-day')
		.map(event => `${event.day}:${JSON.stringify(event.key)}`))
	const days = new Map<string, { day: string; key: RunKey; events: Event[] }>()
	for (const event of runs(events)) {
		const at = Date.parse(String(event.endedAt ?? event.at)), key = contextOf(event).key ??
			(typeof event.runId === 'string' ? usageKey('run', event.runId) : undefined)
		if (!Number.isFinite(at) || !key) continue
		const day = localDay(new Date(at))
		if (day >= today) continue
		const id = `${day}:${JSON.stringify(key)}`, group = days.get(id) ?? { day, key, events: [] }
		group.events.push(event)
		days.set(id, group)
	}
	let written = 0
	for (const [id, group] of days) if (!existing.has(id)) {
		const use = mergeUse(group.events.map(useOf))
		store.log({ event: 'usage-day', day: group.day, key: group.key, runs: group.events.length,
			reruns: group.events.filter(event => ['retry', 'catalog', 'requeue', 'relay'].includes(String(object(event.session).why)) ||
				['retry', 'catalog', 'requeue', 'relay'].includes(String(event.outcome))).length,
			failed: group.events.filter(event => event.outcome === 'failed').length,
			tokensIn: use.tokensIn, tokensOut: use.tokensOut, cacheRead: use.tokensCacheRead,
			modelCalls: use.modelCalls, creditsNano: use.creditsNano, creditsStatus: use.creditsStatus, models: use.models })
		written++
	}
	store.saveUpgrades({ ...store.upgrades(), [marker]: today })
	return written
}

type Window = { event: Event; id: string; session: string; start: number; end: number }
/** One Copilot-only upgrade pass over retained, own-machine runs with explicit sessions/windows; never reconstruct a start from wall time. */
export function backfillUsage(store: Store, now = Date.now()): number {
	const marker = `usage-backfill-1:${store.machine}`, marks = store.upgrades()
	if (marks[marker]) return 0
	const events = localEvents(store, store.config().retentionDays ?? 30)
	const done = new Set(events.filter(event => event.backfill === true).map(event => event.runId))
	const starts = new Map(events.filter(event => event.event === 'job-start' && typeof event.runId === 'string').map(event => [event.runId, event]))
	const windows: Window[] = []
	for (const event of runs(events)) {
		const startEvent = starts.get(event.runId), session = text(object(event.session).id) ?? text(event.sessionId) ?? text(startEvent?.sessionId)
		const start = Date.parse(String(event.startedAt ?? startEvent?.startedAt ?? startEvent?.at))
		const end = Date.parse(String(event.endedAt ?? event.at))
		if (session && typeof event.runId === 'string' && Number.isFinite(start) && Number.isFinite(end) && start <= end && end <= now)
			windows.push({ event, id: event.runId, session, start, end })
	}
	let written = 0
	const sessions = new Map<string, Window[]>()
	for (const window of windows) sessions.set(window.session, [...(sessions.get(window.session) ?? []), window])
	for (const [session, group] of sessions) {
		if (group.every(window => window.event.backfill || done.has(window.id))) continue
		const records = new Map<string, string[]>(), ambiguous = new Set<string>()
		// Parse each named session once. Message events are never parsed; overlapping run windows cannot claim a record.
		for (const line of sessionLog('copilot', session).split('\n')) {
			if (!/"type"\s*:\s*"session\.usage_record"/.test(line)) continue
			let event: Event
			try { event = object(JSON.parse(line)) } catch { continue }
			if (event.type !== 'session.usage_record') continue
			const at = Date.parse(String(event.timestamp))
			if (!Number.isFinite(at)) continue
			const matches = group.filter(window => at >= window.start && at <= window.end)
			if (matches.length > 1) { for (const window of matches) ambiguous.add(window.id); continue }
			const window = matches[0]
			if (window && !window.event.backfill && !done.has(window.id)) {
				const lines = records.get(window.id) ?? []
				lines.push(line)
				records.set(window.id, lines)
			}
		}
		for (const window of group) {
			const lines = records.get(window.id)
			if (!lines?.length || ambiguous.has(window.id)) continue
			const use = readRun('', window.start, process.env, lines.join('\n'), window.end).use
			if (use.modelCalls === undefined) continue
			const context = contextOf(window.event)
			const key = context.key ?? (typeof window.event.key === 'string' ? jobUsageKey(window.event.key) : undefined)
			store.log({ event: 'usage', runId: window.id, startedAt: new Date(window.start).toISOString(), endedAt: new Date(window.end).toISOString(),
				at: new Date(window.end).toISOString(), backfill: true, ...ran(window.event.runKind as RunKind, use, { ...context, key,
					session: context.session ?? { id: window.session }, outcome: window.event.outcome === 'done' || window.event.outcome === 'failed' ||
						window.event.outcome === 'retry' || window.event.outcome === 'stopped' || window.event.outcome === 'budget-stopped' ? window.event.outcome : undefined }) })
			written++
		}
	}
	store.log({ event: 'usage-backfill-complete', runs: written, at: new Date(now).toISOString() })
	store.saveUpgrades({ ...store.upgrades(), [marker]: new Date(now).toISOString() })
	return written
}
