import type { Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { linksIn } from './work.ts'

export const FOLLOWUP_MS = 30 * 60_000
export function freshAsk(store: Store, item: Workflow, at = Date.now(), closed = false): boolean {
	if (item.redacted || item.state === 'done' && !closed || item.startFails || item.work?.closed) return false
	const job = item.job ? store.job(item.job) : undefined
	if (job?.error || job?.state === 'failed' || item.runFailed || item.statusReason?.kind === 'not-finished' || item.statusReason?.kind === 'could-not-start') return false
	const owned = new Set(item.msgIds)
	const ask = store.thread(item.id).filter(message => !message.byOwner && owned.has(message.id)).sort((a, b) => b.at.localeCompare(a.at))[0]
	const age = at - Date.parse(ask?.at ?? item.createdAt)
	return Number.isFinite(age) && age >= 0 && age <= FOLLOWUP_MS
}

const keys = (text: string, links: string[] = []) => new Set([
	...linksIn(text), ...links,
	...[...text.matchAll(/\b(PR|pull request|incident|work ?item|bug|task|build|run)\s*#?\s*(\d+)\b/gi)].map(match => `${/^(?:pr|pull request)$/i.test(match[1]) ? 'pr' : /^(?:bug|task|work ?item)$/i.test(match[1]) ? 'workItem' : /^(?:build|run)$/i.test(match[1]) ? 'build' : 'incident'}:${match[2]}`),
].map(key => `${key.split(':')[0].toLowerCase()}:${key.split(/[:/]/).at(-1)}`))
const STOP = new Set('a an the this that these those it its is are was were be been to for of on in at with from by as and or but also can could would will should you your we our i me my please hi hello hey thanks thank now still again do does did have has had what which where when who how any about there here same one too fictional'.split(' '))
const plain = (text: string) => text.normalize('NFKC').toLowerCase().replace(/^(?:\[[^\]\n]+\]\s*)+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function askRelation(store: Store, item: Workflow, text: string): 'same' | 'different' | 'unknown' {
	const before = `${item.lastAsk ?? ''} ${item.work?.goal ?? ''}`
	const incoming = keys(text), existing = keys(before, item.work?.links)
	if (incoming.size) {
		if ([...incoming].some(key => existing.has(key)) && [...incoming].every(key => existing.has(key))) return 'same'
		if (existing.size) return 'different'
	}
	const names = new Set([store.config().owner.name, item.asker?.name ?? ''].flatMap(name => plain(name).split(' ')))
	const terms = (value: string) => new Set(plain(value).split(' ').filter(term => term.length > 1 && !STOP.has(term) && !names.has(term)))
	const a = terms(before), b = terms(text), overlap = [...b].filter(term => a.has(term)).length
	if (a.size >= 2 && b.size >= 2 && overlap >= 2 && overlap / Math.min(a.size, b.size) >= 0.6 && !incoming.size) return 'same'
	if (a.size >= 2 && b.size >= 2 && !overlap) return 'different'
	return 'unknown'
}
