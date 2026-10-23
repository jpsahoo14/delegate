import { forPage } from './model/format.ts'

export const hasCommandHint = (text: string) => /\b(?:ok|edit|send|skip|answer|pick|undo|more|close|wait)\s+[A-Z]\d+\b|\b(?:type|say|reply with)\s+["'`]/i.test(text)
export function pageText(text = ''): string {
	return forPage(text).split(/(?<=[.!?])\s+/).filter(sentence => !hasCommandHint(sentence)).join(' ').trim()
}
