import { z } from 'zod'
import { receiptSchema, snapshotSchema, voteCheckSchema, type Intent, type Receipt, type Snapshot } from '../domain/contracts.ts'
import { readPageDelta } from './validation.ts'
import { numbersSchema, saveResultSchema, settingsSchema } from '../domain/screens.ts'
import { NAME } from '../brand.ts'

export class ApiError extends Error {
	readonly status: number
	constructor(status: number, message: string) { super(message); this.status = status }
}
// A saved read-only snapshot (inbox.html) carries its page data and has no server: the page reads only that data, a seen mark or
// an experience is not saved, and everything else refuses.
export const staticSnapshot = () => (window as Window & { DELEGATE_SNAPSHOT?: unknown }).DELEGATE_SNAPSHOT
export const READ_ONLY = `This is a read-only snapshot. Open ${NAME} on your own machine to act; nothing was sent or changed.`
async function request<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}, cached?: { etag: string; data: T }, remember?: (etag: string, data: T) => void, update?: (previous: T, input: unknown, base: string) => T): Promise<T> {
	const saved = staticSnapshot()
	if (saved !== undefined) {
		if (path.startsWith('/api/v1/page')) {
			const parsed = schema.safeParse(saved)
			if (!parsed.success) throw new Error(`This snapshot holds data this page cannot read.`)
			return parsed.data
		}
		if (path === '/seen' || path === '/ui') return schema.parse({ ok: true })
		throw new ApiError(409, READ_ONLY)
	}
	const token = new URLSearchParams(location.search).get('t') ?? ''
	const url = `${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`
	const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(cached ? { 'if-none-match': cached.etag, ...(path.startsWith('/api/v1/page') ? { 'x-delegate-delta': '1' } : {}) } : {}), ...options.headers } })
	if (response.status === 304) {
		if (!cached) throw new Error('The server returned an unchanged page without a saved snapshot. Reload to recover.')
		return cached.data
	}
	if (!response.ok) {
		const body = await response.text()
		const error = z.object({ text: z.string() }).safeParse((() => { try { return JSON.parse(body) } catch { return undefined } })())
		throw new ApiError(response.status, error.success ? error.data.text : `Request failed (${response.status}).`)
	}
	const started = performance.now(), body = await response.json(), decoded = performance.now()
	if (response.headers.get('x-delegate-delta') === '1' && (!cached || !update)) throw new Error('The page update has no original snapshot. Reload before acting.')
	const parsed = response.headers.get('x-delegate-delta') === '1' && cached && update
		? { success: true as const, data: update(cached.data, body, cached.etag) } : schema.safeParse(body)
	if (path.startsWith('/api/v1/page')) {
		performance.measure('delegate-page-json', { start: started, end: decoded })
		performance.measure('delegate-page-validation', { start: decoded, end: performance.now() })
	}
	if (!parsed.success) throw new Error(`${NAME} returned data this page cannot read. Reload after updating.`)
	const etag = response.headers.get('etag')
	if (etag && remember) remember(etag, parsed.data)
	return parsed.data
}
const pages = new Map<string, { etag: string; data: Snapshot }>()
export const fetchSnapshot = (find = '', signal?: AbortSignal) => {
	const key = `${location.search}|${find}`
	return request(`/api/v1/page?find=${encodeURIComponent(find)}`, snapshotSchema, { signal }, pages.get(key), (etag, data) => {
		pages.delete(key)
		pages.set(key, { etag, data })
		if (pages.size > 10) pages.delete(pages.keys().next().value!)
	}, readPageDelta)
}
// The first page read starts with the script, while the app's code still loads; the first query takes it once (bug 10-23 perf:
// it started 300 ms after the page had loaded).
let early: Promise<Snapshot> | undefined
export function startEarlySnapshot(): Promise<Snapshot> {
	early = fetchSnapshot('')
	early.catch(() => undefined)
	return early
}
export function takeEarlySnapshot(find: string): Promise<Snapshot> | undefined {
	const taken = find ? undefined : early
	early = undefined
	return taken
}
export const submit = (intent: Intent) => request('/api/v1/actions', receiptSchema, { method: 'POST', body: JSON.stringify(intent) })
// A37 (b): the live vote-claim re-check on the reply he is editing (read-only; the same rule as the card and Send).
export const checkVoteClaim = (code: string, text: string, signal?: AbortSignal) => request('/api/v1/vote-check', voteCheckSchema, { method: 'POST', body: JSON.stringify({ code, text }), signal })
export const receipt = (submissionId: string) => request(`/api/v1/result?submission=${encodeURIComponent(submissionId)}`, receiptSchema)
// What the server knows of a click (#42): its saved result, still being handled (202), or nothing saved under this id (404).
export async function receiptState(submissionId: string): Promise<{ receipt: Receipt } | { working: true } | { missing: true }> {
	try {
		const r = await request(`/api/v1/result?submission=${encodeURIComponent(submissionId)}`, z.union([receiptSchema, z.object({ working: z.literal(true), text: z.string() })]))
		return 'working' in r ? { working: true } : { receipt: r }
	} catch (error) {
		if (error instanceof ApiError && error.status === 404) return { missing: true }
		throw error
	}
}
export const fetchSettings = (signal?: AbortSignal, experience: 'new' | 'classic' = 'new') => request(`/api/v1/settings${experience === 'classic' ? '?experience=classic' : ''}`, settingsSchema, { signal })
export const fetchNumbers = (window: string, signal?: AbortSignal) => request(`/api/v1/numbers?window=${encodeURIComponent(window)}`, numbersSchema, { signal })
export const saveSetting = (key: string, value: string) => request('/settings', saveResultSchema, { method: 'POST', body: JSON.stringify({ key, value }) })
export const saveSeen = (filters: string[], at: string) => request('/seen', z.object({ ok: z.literal(true) }), { method: 'POST', body: JSON.stringify({ filters, at }) })
export const dismissExperienceNote = () => request('/ui', z.object({ ok: z.literal(true) }), { method: 'POST', body: JSON.stringify({ noted: true }) })
// Which experience this machine opens next time; best effort, the switch itself never waits for it.
export const saveExperience = (experience: 'new' | 'classic') => request('/ui', z.object({ ok: z.literal(true) }), { method: 'POST', body: JSON.stringify({ experience }) })
