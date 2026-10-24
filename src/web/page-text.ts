import { forPage } from './model/format.ts'

export const hasCommandHint = (text: string) => /\b(?:ok|edit|send|skip|answer|pick|undo|more|close|wait)\s+[A-Z]\d+\b|\b(?:type|say|reply with)\s+["'`]/i.test(text)

// The last net under the words a card shows (L3b): a Teams chat id never reaches the page; it reads "another chat". Each catch is
// counted by shape only, so the projection can log that some text still carried an id (a missing name fallback upstream).
const CHAT_ID = /\d{2}:[^\s@]+@(?:thread\.(?:v2|tacv2|skype)|unq\.gbl\.spaces)/g
let leaks = 0
export function chatIdNet(text: string): string {
	return text.replace(CHAT_ID, () => { leaks++; return 'another chat' })
}
export function takePageTextLeaks(): number {
	const n = leaks
	leaks = 0
	return n
}

export function pageText(text = ''): string {
	return chatIdNet(forPage(text).split(/(?<=[.!?])\s+/).filter(sentence => !hasCommandHint(sentence)).join(' ').trim())
}
