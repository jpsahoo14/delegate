import { z } from 'zod'
import { receiptSchema, snapshotSchema, type Intent } from '../domain/contracts.ts'
import { numbersSchema, saveResultSchema, settingsSchema } from '../domain/screens.ts'
import { NAME } from '../brand.ts'

export class ApiError extends Error {
	readonly status: number
	constructor(status: number, message: string) { super(message); this.status = status }
}
async function request<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}): Promise<T> {
	const token = new URLSearchParams(location.search).get('t') ?? ''
	const url = `${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`
	const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...options.headers } })
	if (!response.ok) {
		const body = await response.text()
		const error = z.object({ text: z.string() }).safeParse((() => { try { return JSON.parse(body) } catch { return undefined } })())
		throw new ApiError(response.status, error.success ? error.data.text : `Request failed (${response.status}).`)
	}
	const parsed = schema.safeParse(await response.json())
	if (!parsed.success) throw new Error(`${NAME} returned data this preview cannot read. Reload after updating.`)
	return parsed.data
}
export const fetchSnapshot = (find = '', signal?: AbortSignal) => request(`/api/v1/page?find=${encodeURIComponent(find)}`, snapshotSchema, { signal })
export const submit = (intent: Intent) => request('/api/v1/actions', receiptSchema, { method: 'POST', body: JSON.stringify(intent) })
export const receipt = (submissionId: string) => request(`/api/v1/result?submission=${encodeURIComponent(submissionId)}`, receiptSchema)
export const fetchSettings = (signal?: AbortSignal) => request('/api/v1/settings', settingsSchema, { signal })
export const fetchNumbers = (window: string, signal?: AbortSignal) => request(`/api/v1/numbers?window=${encodeURIComponent(window)}`, numbersSchema, { signal })
export const saveSetting = (key: string, value: string) => request('/settings', saveResultSchema, { method: 'POST', body: JSON.stringify({ key, value }) })
export const saveSeen = (filters: string[], at: string) => request('/seen', z.object({ ok: z.literal(true) }), { method: 'POST', body: JSON.stringify({ filters, at }) })
