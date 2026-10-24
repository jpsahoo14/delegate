import { forPage } from './model/format.ts'

export const hasCommandHint = (text: string) => /\b(?:ok|edit|send|skip|answer|pick|undo|more|close|wait)\s+[A-Z]\d+\b|\b(?:type|say|reply with)\s+["'`]/i.test(text)

// The last net under the words a card shows (L3b): a Teams chat id never reaches the page; it reads "another chat". Each catch is
// counted by shape only, so the projection can log that some text still carried an id (a missing name fallback upstream).
// 0.2.43 (PE A R22): the same net takes out a GUID, an id key=value pair (repositoryId, pullRequestId, project, head, commit) and a
// bare 7-40 hex commit id (one with a digit and a letter, so words and plain numbers stay). A pullRequestId keeps its number as
// "PR <n>"; a PR number and file:line are never touched.
const CHAT_ID = /\d{2}:[^\s@]+@(?:thread\.(?:v2|tacv2|skype)|unq\.gbl\.spaces)/g
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const ID_PAIR = /\b(?:(repositoryId|repoId|pullRequestId|projectId|commitId|headCommit)\s*[:=]\s*|(project|head|commit)=)("[^"]*"|'[^']*'|[^\s,;)\]}]+)/gi
const COMMIT = /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/gi
export type LeakKind = 'chat-id' | 'guid' | 'key-value' | 'commit'
let leaks: Partial<Record<LeakKind, number>> = {}
const caught = (kind: LeakKind) => { leaks[kind] = (leaks[kind] ?? 0) + 1 }
export function idNet(text: string): string {
	let changed = false
	const out = text.replace(CHAT_ID, () => { caught('chat-id'); return 'another chat' })
		.replace(ID_PAIR, (_, idKey: string | undefined, wordKey: string | undefined, value: string) => {
			changed = true; caught('key-value')
			const pr = /^pullRequestId$/i.test(idKey ?? wordKey ?? '') && /^["']?(\d+)["']?$/.exec(value)?.[1]
			// A project's name is a word, not an id: the pair reads as the name ("in Acme"); a GUID value goes with the GUID net.
			if (/^project$/i.test(wordKey ?? '')) return value.replace(/^["']|["']$/g, '')
			return pr ? `PR ${pr}` : ''
		})
		.replace(GUID, () => { changed = true; caught('guid'); return '' })
		.replace(COMMIT, () => { changed = true; caught('commit'); return '' })
	// What a removed id leaves behind: empty brackets, a space before punctuation, doubled separators and spaces.
	return changed ? out.replace(/[([{]\s*(?:[,;]\s*)*[)\]}]/g, '').replace(/\s+([,.;:)\]])/g, '$1').replace(/([,;])(?:\s*[,;])+/g, '$1').replace(/([([{])\s*[,;]\s*/g, '$1')
		.replace(/,\s*([)\]])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim() : out
}
// Kept for the callers that only ever meant chat ids; it is the whole net now.
export const chatIdNet = idNet
export function takePageTextLeaks(): Partial<Record<LeakKind, number>> {
	const n = leaks
	leaks = {}
	return n
}

export function pageText(text = ''): string {
	return idNet(forPage(text).split(/(?<=[.!?])\s+/).filter(sentence => !hasCommandHint(sentence)).join(' ').trim())
}
