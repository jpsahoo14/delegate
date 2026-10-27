import type { Item } from './contracts.ts'

// Their newest message after the draft, else the ask; never Delegate's own times.
export function displayedAt(item: Pick<Item, 'newCount' | 'thread' | 'askAt' | 'at'>): { at: string; added: boolean } {
	const theirs = item.newCount > 0 ? [...item.thread].reverse().find(message => !message.owner)?.at : undefined
	return theirs ? { at: theirs, added: false } : item.askAt ? { at: item.askAt, added: false } : { at: item.at, added: true }
}

export function needsOrder(a: { at: string; code: string }, b: { at: string; code: string }): number {
	return b.at.localeCompare(a.at) || b.code.localeCompare(a.code, undefined, { numeric: true })
}
