import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import type { Entities, Receipt } from '../domain/contracts.ts'
import { useData } from './store.ts'

// The page's result line (#47, PE 19:30). Clearing is this tab's own state, never stored: the line the owner closed, and the
// item's rev in the first page read after the result arrived, so a later change to the card clears it.
type LineState = { closed?: string; base?: { id: string; fetchedAt?: string; rev?: string } }
export const useResultLine = create<LineState>(() => ({}))
export const closeResultLine = (id: string) => useResultLine.setState({ closed: id })

// Who and where, from the projection's item while it is there, else from what the receipt kept when it completed.
export function whoAndChat(entities: Entities, code: string, kept?: { who?: string; chat?: string }): string {
	const item = entities.items[code], chat = item && entities.chats[item.chatId]
	const who = item ? entities.people[item.personId]?.name.split(/\s+/)[0] : kept?.who
	const where = item ? chat?.group ? chat.name : undefined : kept?.chat
	return [who, where].filter(Boolean).join(' in ')
}

// The words, from the stored outcome and the item, never from the chat text (#47, PE 18:40, PM 19:12). A held Send reuses the card's
// own held line. A receipt saved before outcomes existed has no words: the line is hidden.
const bare = (s?: string) => s?.replace(/[.\s]+$/, '') || undefined
// classic-close only closes work now (PM 20:15); a receipt from before, when it marked to-dos, still has its count.
const TODOS = new Set(['todo-done', 'todo-row-done'])
const until = (at?: string) => at && Number.isFinite(Date.parse(at)) ? new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : at
export function resultWords(r: Receipt, entities: Entities): string | undefined {
	const o = r.outcome
	if (!o) return undefined
	const item = entities.items[r.item], to = whoAndChat(entities, r.item, r)
	const first = item ? entities.people[item.personId]?.name.split(/\s+/)[0] : r.who
	const chat = item ? (c => c?.group ? c.name : undefined)(entities.chats[item.chatId]) : r.chat
	const message = first ? `${first}'s message` : chat ? `the message in ${chat}` : undefined
	if (o.kind === 'sent') return to ? `Sent to ${to}.` : 'Sent.'
	// The card's warn is a click's reason only when it is one (L4, PE 22:12): never a promise or a report notice.
	const reason = item?.attentionKind ? item.attention : undefined
	const why = bare(o.kind === 'held' ? item?.mode === 'held' ? item.attention : undefined : o.stale ? 'it changed since you looked' : reason)
	if (o.kind === 'held' || (o.kind === 'refused' || o.kind === 'failed') && o.send) return `Your reply${to ? ` to ${to}` : ''} wasn't sent${why ? `: ${why}.` : '.'}`
	const forWho = first ? ` for ${first}` : ''
	if (o.kind === 'refused' || o.kind === 'failed') return why ? `Couldn't do that${forWho}: ${why}.` : `Couldn't do that${forWho}; open it to see why.`
	// queued or done: the action's own past tense when its kind is known, else the general line.
	const a = o.action
	if (a === 'dismiss' && message) return `Dismissed ${message}.`
	if (a === 'later' && message) return `${message[0].toUpperCase()}${message.slice(1)} is in Later.`
	if (a === 'answer') return `Got your answer; redrafting your reply${first ? ` to ${first}` : ''}.`
	if (a && (TODOS.has(a) || a === 'classic-close' && o.count)) return o.count && o.count > 1 ? `Marked ${o.count} tasks done.` : o.count === 1 ? 'Marked the task done.' : 'Marked the tasks done.'
	if (a === 'reopen' && message) return `Reopened ${message}.`
	if (a === 'watch-fyi' && o.watch) return `Watching ${bare(o.watch.target)}${o.watch.until ? ` until ${until(o.watch.until)}` : ''}.`
	if (o.kind === 'queued') return `Working on it${to ? ` for ${to}` : ''}…`
	return `Done${forWho}.`
}

// Where Open goes: the item's row on Now, or its card in Classic's Needs you. Undefined when the item is gone from the page.
export function openRoute(entities: Entities, code: string, experience: 'new' | 'classic'): string | undefined {
	if (!code || !entities.items[code]) return undefined
	if (experience === 'classic') return `classic/focus/${code}`
	const row = Object.values(entities.placements).find(row => row.subjects.includes(code) && row.section !== 'done')
	return row ? `now/${row.id}${row.act === code ? '' : `/${code}`}` : undefined
}

export function usePageResult(result: Receipt | undefined, route: string, experience: 'new' | 'classic') {
	const snapshot = useData(state => state.snapshot), entities = useData(state => state.entities)
	const { closed, base } = useResultLine()
	const id = result?.submissionId, open = result ? openRoute(entities, result.item, experience) : undefined
	useEffect(() => {
		if (!result) return
		const now = useResultLine.getState().base
		if (now?.id !== result.submissionId) useResultLine.setState({ base: { id: result.submissionId, fetchedAt: snapshot?.fetchedAt } })
		else if (now.rev === undefined && snapshot?.fetchedAt !== now.fetchedAt) useResultLine.setState({ base: { ...now, rev: entities.items[result.item]?.rev ?? '' } })
	}, [result, snapshot, entities])
	// Opening the item after the line showed clears it; being on it already when the result came does not.
	const previous = useRef(route)
	useEffect(() => {
		const before = previous.current
		previous.current = route
		if (id && open && route !== before && (route === open || route.startsWith(`${open}/`))) closeResultLine(id)
	}, [route, id, open])
	if (!result || closed === result.submissionId) return undefined
	const current = entities.items[result.item]?.rev
	if (base?.id === result.submissionId && base.rev && current && current !== base.rev) return undefined
	return { words: resultWords(result, entities), open, close: () => closeResultLine(result.submissionId) }
}

// The clicks still waiting for a saved result, by person and chat (#47 c); a page action by its own label.
export function usePendingClicks(experience: 'new' | 'classic') {
	const byRevision = useData(state => state.byRevision), entities = useData(state => state.entities)
	return Object.entries(byRevision).flatMap(([key, ui]) => {
		if (!ui.pending) return []
		const code = key.slice(0, key.lastIndexOf('@'))
		return [{ id: ui.pending.submissionId, label: whoAndChat(entities, code) || entities.actions[ui.pending.action]?.label || 'An earlier click', open: openRoute(entities, code, experience) }]
	})
}
