import type { Msg, Person } from '../core/types.ts'
import { htmlToText } from '../core/intake.ts'

export type SendRecord = { at: string; code?: string; chat?: string; msgId?: string; askAt?: string; askMsgId?: string; ask?: string; text?: string; asker?: Person; approvedBy?: string }

export function sendRecord(entry: Record<string, unknown>): SendRecord | undefined {
	if (typeof entry.at !== 'string') return undefined
	const string = (key: string) => typeof entry[key] === 'string' ? entry[key] : undefined
	const asker = entry.asker
	return {
		at: entry.at, code: string('code'), chat: string('chat'), msgId: string('msgId'),
		askAt: string('askAt'), askMsgId: string('askMsgId'), ask: string('ask'), text: string('text'), approvedBy: string('approvedBy'),
		asker: typeof asker === 'object' && asker !== null && 'id' in asker && typeof asker.id === 'string' && 'name' in asker && typeof asker.name === 'string' ? { id: asker.id, name: asker.name } : undefined,
	}
}

// Resolve only evidence at the send, never the workflow's newer turn.
export function sendContext(sent: SendRecord, thread: Msg[]) {
	const before = thread.filter(message => message.at <= sent.at)
	const previous = before.filter(message => message.byOwner && message.id !== sent.msgId).at(-1)?.at
	const ask = sent.askMsgId ? before.find(message => !message.byOwner && message.id === sent.askMsgId) :
		sent.askAt ? before.find(message => !message.byOwner && message.at === sent.askAt) :
			before.find(message => !message.byOwner && (!previous || message.at > previous))
	const question = sent.ask ?? ask?.text
	return {
		chat: sent.chat, msgId: sent.msgId, at: sent.at, text: sent.text === undefined ? undefined : htmlToText(sent.text),
		askMsgId: ask?.id ?? sent.askMsgId, ask: question === undefined ? undefined : htmlToText(question),
		asker: sent.asker ?? ask?.from, approvedBy: sent.approvedBy,
	}
}
