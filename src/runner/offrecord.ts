// Off the record means never used or learned, and held if read (#21 §2, owner decision). Runs read the knowledge files directly, so
// a chat marked off the record takes its facts out of the cards a run may read, into knowledge-offrecord/ in the storage folder,
// which no run is given. Unmarking puts them back where they stood. The owner's own "remember" facts never move.
import { join } from 'node:path'
import type { Entry } from '../core/types.ts'
import { parseMessageLink } from '../adapters/channels.ts'
import { readJson, writeJson } from '../store/fs.ts'
import type { Store } from '../store/state.ts'
import { knowledgeOf } from './proposals.ts'

type Held = { chat: string; at: string; lines: { path: string; line: string; at: number }[] }
const file = (store: Store, chat: string) => join(store.root, 'knowledge-offrecord', `${chat.replace(/[^\w.@-]/g, '_')}.json`)
const fromChat = (chat: string) => (e: Entry) => !e.src.some(s => s.link.startsWith('delegate:remember')) && e.src.some(s => parseMessageLink(s.link)?.chatId === chat)

export function moveOffRecord(store: Store, chat: string): number {
	const k = knowledgeOf(store, store.config())
	const lines = k.moveOut?.(fromChat(chat)) ?? []
	if (!lines.length) return 0
	const had = readJson<Held | undefined>(file(store, chat), undefined)
	writeJson(file(store, chat), { chat, at: new Date().toISOString(), lines: [...(had?.lines ?? []), ...lines] } satisfies Held, store.machine)
	store.log({ event: 'offrecord-moved', facts: lines.length })
	return lines.length
}

export function restoreOffRecord(store: Store, chat: string): number {
	const had = readJson<Held | undefined>(file(store, chat), undefined)
	if (!had?.lines.length) return 0
	const n = knowledgeOf(store, store.config()).moveBack?.(had.lines) ?? 0
	writeJson(file(store, chat), { ...had, lines: [] } satisfies Held, store.machine)
	store.log({ event: 'offrecord-restored', facts: n })
	return n
}
