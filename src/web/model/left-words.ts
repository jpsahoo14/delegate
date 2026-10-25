// "Left for you" words (Left-for-you contract rule 2; PM A R35 (d)): New words every wf.left line from its structured action, kind
// and source, never from stored prose. quote stays a quotation, shown as it is; why is shown only behind "Why?".
import type { LeftAction, LeftLine } from '../../core/left-lines.ts'
import { NAME } from '../../brand.ts'

const VERB: Record<Exclude<LeftAction['verb'], 'promise'>, string> = {
	reply: 'Send the reply', comment: 'Post the comment', vote: 'Cast your vote',
	merge: 'Merge', complete: 'Complete', abandon: 'Abandon', delete: 'Delete',
	reviewer: 'Change the reviewers', deploy: 'Deploy', invite: 'Send the invite', change: 'Make the change',
}
const ON_PR = new Set<LeftAction['verb']>(['merge', 'complete', 'abandon', 'delete', 'deploy'])
const TO = new Set<LeftAction['verb']>(['deploy', 'invite'])

// What HE does, in his verbs: "Merge PR 4200002.", "Post the comment on PR 5.", "Answer Kim's question on PR 5.". A promise is his
// own words.
export function leftWords(line: Pick<LeftLine, 'type' | 'action' | 'source'>): string {
	const { action } = line
	if (action.verb === 'promise') return action.quote ?? 'Keep the promise'
	const pr = action.pr ? `${ON_PR.has(action.verb) ? '' : 'on '}PR ${action.pr}` : ''
	const asked = action.verb === 'reply' && action.quoteBy === 'asker' && line.source.who
	const verb = asked ? `Answer ${line.source.who}'s question` : VERB[action.verb]
	const target = action.target ? `${TO.has(action.verb) ? 'to' : 'in'} ${action.target}` : ''
	return `${[verb, pr, target].filter(Boolean).join(' ').replace(/[.\s]+$/, '')}.`
}

// Where it came from (PM A R35 (d)), without the day: "Kim asked in a comment on PR 5", "Kim asked in <chat>", "From your reply to
// Kim", "From Delegate's review of PR 5". chat is the place words the page already uses for this item's chat (undefined for a 1:1).
export function leftSourceWords(source: LeftLine['source'], asker?: string, chat?: string): string {
	const who = source.who ?? 'They'
	switch (source.kind) {
		case 'pr-comment': return `${who} asked in a comment${source.pr ? ` on PR ${source.pr}` : ''}`
		case 'chat-ask': return chat ? `${who} asked in ${chat}` : `${who} asked you`
		case 'your-reply': return `From your reply${asker ? ` to ${asker}` : ''}`
		case 'review': return `From ${NAME}'s review${source.pr ? ` of PR ${source.pr}` : ''}`
	}
}
