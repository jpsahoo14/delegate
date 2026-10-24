import type { RawMsg } from '../core/intake.ts'
import type { ThreadCache, WatchedChannel } from './channels.ts'

export type ReadOpts = { maxPages?: number; stop?: (m: RawMsg) => boolean }

export type SendOpts = { replyTo?: { name: string; text: string }; mentions?: { id: string; name: string }[] }

// A send whose answer was lost and that reading the chat back did not find: it may still have been posted. Never sent again
// automatically; the item waits for the owner to check Teams (bug 10-23 R4).
export class SendUncertain extends Error {
	constructor(detail: string) { super(`Not sure it was sent; check Teams. ${detail}`) }
}

export interface Source {
	readonly selfChatId: string
	// stop: read newest first and end after the message it returns true for. maxPages bounds the read.
	newMessages(chatId: string, afterId: string | undefined, sinceIso?: string, o?: ReadOpts): Promise<{ msgs: RawMsg[]; newest?: string; truncated: boolean }>
	recentChats(): Promise<{ id: string; name: string; lastAt: string }[]>
	recent(chatId: string, n: number): Promise<RawMsg[]>
	// In a group chat a reply carries the message it answers and tags the people it answers (dogfood: the parent was out of context).
	send(chatId: string, text: string, o?: SendOpts): Promise<{ msgId: string }>
	sendSelf(text: string): Promise<{ msgId: string }>
	deleteMessage(chatId: string, msgId: string): Promise<void>
	editMessage(chatId: string, msgId: string, text: string): Promise<void>
	// oof: the owner's out-of-office message when one is set (R-POL-12).
	presence(): Promise<{ availability: string; oof?: string }>
	// guests: someone outside the organization can read this chat (R-SEC-08). Optional: unknown means no guests seen.
	around?(chatId: string, msgId: string): Promise<{ msg?: RawMsg; after: RawMsg[] }>
	members?(chatId: string): Promise<{ guests?: boolean; outside?: string[]; ids?: string[]; names?: Record<string, string> }>
	// Channel threads to watch, with a cache kept between ticks. Optional: sources without channels leave it out.
	channelThreads?(cache: ThreadCache, sinceIso: string, channels?: WatchedChannel[]): Promise<{ list: { id: string; name: string; lastAt: string; mine: boolean }[]; cache: ThreadCache }>
	chatName?(chatId: string): Promise<string>
	// Chats with a message to the owner between two times, found by search, for chats the recent list does not reach (first-sweep.md).
	awaiting?(sinceIso: string, untilIso: string): Promise<{ id: string; name: string; lastAt: string }[]>
	close(): Promise<void>
}
