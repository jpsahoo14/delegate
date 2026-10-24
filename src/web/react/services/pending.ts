import { z } from 'zod'
import { intentSchema } from '../domain/contracts.ts'

const key = 'delegate-react-pending-v1'
// intent: the exact request that was sent, so a click the server never got is sent again unchanged, also after a reload (#42).
const schema = z.array(z.object({ submissionId: z.uuid(), item: z.string(), rev: z.string(), action: z.string(), at: z.number().optional(), intent: intentSchema.optional() }).strict())
export type Pending = z.infer<typeof schema>[number]
export function pendingSubmissions(): Pending[] {
	const value = sessionStorage.getItem(key)
	return value ? schema.parse(JSON.parse(value)) : []
}
export function rememberSubmission(value: Pending): void {
	const previous = pendingSubmissions().filter(entry => entry.submissionId !== value.submissionId)
	sessionStorage.setItem(key, JSON.stringify([...previous, value]))
}
export function forgetSubmission(id: string): void {
	sessionStorage.setItem(key, JSON.stringify(pendingSubmissions().filter(entry => entry.submissionId !== id)))
}
