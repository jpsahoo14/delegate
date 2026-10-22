import { z } from 'zod'

const key = 'delegate-react-pending-v1'
const schema = z.array(z.object({ submissionId: z.uuid(), item: z.string(), rev: z.string(), action: z.string() }).strict())
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
