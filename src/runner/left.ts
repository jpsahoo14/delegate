import { createHash } from 'node:crypto'
import { leftActionKey, type LeftDraft, type LeftLine, type LeftSource } from '../core/left-lines.ts'
import type { Effect, Report, Workflow } from '../core/types.ts'

export const openLeft = (wf: Workflow) => (wf.left ?? []).filter(line => !line.cleared)
const RETAIN_MS = 30 * 86_400_000
const MAX_CLEARED = 2_000

export function mergeLeft(wf: Workflow, drafts: LeftDraft[], source: LeftSource, reviewHead?: string, at = new Date().toISOString()): LeftLine[] {
	const merged: LeftLine[] = []
	const sourceIdentity = source.kind === 'review' && reviewHead ? `${source.href ?? ''}@${reviewHead}` : source.href ?? ''
	for (const draft of drafts) {
		if (!draft.action.key.trim()) throw new Error('A Left-for-you draft must have a producer-computed action key')
		const id = `left-${createHash('sha256').update([
			draft.type, draft.kind ?? '', draft.action.verb, draft.action.pr ?? draft.pr?.id ?? '',
			draft.action.target ?? '', draft.action.key, sourceIdentity,
		].join('|')).digest('hex').slice(0, 16)}`
		if (wf.leftCleared?.includes(id)) continue
		const prior = wf.left?.find(line => line.id === id)
		if (prior?.cleared) continue
		const line: LeftLine = { ...structuredClone(draft), id, source: { ...(prior?.source ?? source) }, at: prior?.at ?? at }
		wf.left ??= []
		const index = wf.left.findIndex(item => item.id === id)
		if (index === -1) wf.left.push(line)
		else wf.left[index] = line
		merged.push(line)
	}
	return merged
}

export const needsLeftPrune = (wf: Workflow, now = Date.now()) => (wf.leftCleared?.length ?? 0) > MAX_CLEARED ||
	!!wf.left?.some(line => line.cleared && Date.parse(line.cleared.at) <= now - RETAIN_MS)

export function pruneLeft(wf: Workflow, now = Date.now()): { pruned: number; dropped: number } {
	const expired = (wf.left ?? []).filter(line => line.cleared && Date.parse(line.cleared.at) <= now - RETAIN_MS)
		.sort((a, b) => Date.parse(a.cleared!.at) - Date.parse(b.cleared!.at))
	if (!expired.length && (wf.leftCleared?.length ?? 0) <= MAX_CLEARED) return { pruned: 0, dropped: 0 }
	const ids = new Set(expired.map(line => line.id))
	const cleared = [...new Set([...(wf.leftCleared ?? []), ...ids])]
	wf.left = (wf.left ?? []).filter(line => !ids.has(line.id))
	wf.leftCleared = cleared.slice(-MAX_CLEARED)
	return { pruned: expired.length, dropped: Math.max(0, cleared.length - MAX_CLEARED) }
}

export function clearLeft(wf: Workflow, ids: string[], cleared: NonNullable<LeftLine['cleared']>): string[] {
	const wanted = new Set(ids), changed: string[] = []
	for (const line of openLeft(wf)) if (wanted.has(line.id)) {
		line.cleared = structuredClone(cleared)
		changed.push(line.id)
	}
	return changed
}

export function undoLeft(wf: Workflow, ids: string[], at: string): string[] {
	const wanted = new Set(ids), changed: string[] = []
	for (const line of wf.left ?? []) if (wanted.has(line.id) && line.cleared?.by === 'owner' && line.cleared.why === 'ticked' && line.cleared.at === at) {
		line.cleared = undefined
		changed.push(line.id)
	}
	return changed
}

export function closeLeft(wf: Workflow, at = new Date().toISOString()) {
	wf.leftRetry = undefined
	for (const line of wf.left ?? []) if (!line.cleared || line.cleared.by === 'owner' && line.cleared.why === 'ticked') {
		line.cleared = { at, by: 'engine', why: 'item-closed' }
	}
}

export function settleLeftRetry(wf: Workflow, report: Pick<Report, 'reply' | 'choices' | 'goalMet'>, effects: Effect[]) {
	if (!wf.leftRetry || report.goalMet === false || !report.reply && !report.choices?.options.some(option => option.reply || option.effects?.length) && !effects.length) return
	clearLeft(wf, [wf.leftRetry.id], { at: new Date().toISOString(), by: 'engine', why: 'superseded' })
	wf.leftRetry = undefined
}

export function allowLeft(wf: Workflow, effects: Effect[], at = new Date().toISOString()): string[] {
	const keys = new Set(effects.filter(effect => effect.call && !effect.off).map(effect => leftActionKey(effect.call, effect.summary)))
	return clearLeft(wf, openLeft(wf).filter(line => line.type === 'refusal' && keys.has(line.action.key)).map(line => line.id),
		{ at, by: 'engine', why: 'allowed-now' })
}
