// PM A R36 / A120: an untitled group chat is named by its OTHER members (never the asker, never the owner), from SEND's cache-only
// groupChatPeople (first names, a last initial on a clash; count includes members without a cached name). The page shows these words
// as they are; it never formats a place itself.
// - head (card head line): "in a group with Robin, Dev +2" (2 names, then +N), the full list as its hover;
// - row (New line 1, Classic queue): "in a group with Robin +3" (1 name);
// - sentence (found and source lines, "Replied to Kim in …"): "your group with Robin, Dev +2".
// Only the asker and the owner in it, or names not cached: "in a group chat" / "a group chat". Titled chats and 1:1s: undefined (unchanged).
// Untitled: SEND's fallback name "Group chat", a raw chat id, or an old stored title that is a member's or the asker's own name (the
// last sender, before e04a3f25).
import type { Store } from '../../store/state.ts'
import { groupChatPeople } from '../../runner/sharing.ts'

export type Place = { head: string; row: string; sentence: string; title?: string }
type Chat = { id: string; name: string; group?: boolean }
// An old waiting record has no group flag: a Teams group or meeting chat id ends in @thread.v2 (PE 02:52).
const isGroup = (chat: Chat) => chat.group ?? /@thread\.v2$/i.test(chat.id)

export function untitledGroup(store: Pick<Store, 'members'>, chat: Chat, askerName?: string): boolean {
	if (!isGroup(chat)) return false
	const name = chat.name.trim().toLowerCase()
	if (!name || name === 'group chat' || name === chat.id.toLowerCase() || /^19:/.test(name) || name === askerName?.trim().toLowerCase()) return true
	return Object.values(store.members()[chat.id]?.names ?? {}).some(member => member.trim().toLowerCase() === name)
}

export function placeOf(store: Pick<Store, 'members' | 'config'>, chat: Chat, asker?: { id?: string; name?: string }): Place | undefined {
	if (!untitledGroup(store, chat, asker?.name)) return undefined
	// A W ask names the person asked, not an id: find the id in the cached names so that person is left out too.
	const cached = store.members()[chat.id]?.names ?? {}, name = asker?.name?.trim().toLowerCase()
	const askerId = asker?.id ?? (name ? Object.keys(cached).find(id => cached[id].trim().toLowerCase() === name) : undefined)
	const people = groupChatPeople(store, chat.id, store.config().owner.id, askerId)
	if (!people?.count || !people.names.length) return { head: 'in a group chat', row: 'in a group chat', sentence: 'a group chat' }
	const { names, count } = people
	const list = (shown: number) => `${names.slice(0, shown).join(', ')}${count > Math.min(shown, names.length) ? ` +${count - Math.min(shown, names.length)}` : ''}`
	return {
		head: `in a group with ${list(2)}`, row: `in a group with ${list(1)}`, sentence: `your group with ${list(2)}`,
		title: `With ${names.join(', ')}${count > names.length ? ` and ${count - names.length} more` : ''}`,
	}
}
