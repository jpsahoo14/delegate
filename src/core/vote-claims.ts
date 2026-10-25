import type { Effect, Workflow } from './types.ts'
import { isVote, prIdOf, sameHead, VOTES, voteName, voteValue } from './effects.ts'
import { linksIn, prNumbersIn } from './pr-refs.ts'

export const APPROVAL_WORD = /\bapprov(?:e|es|ed|ing|als?)\b|\bsign(?:ed|ing)?[ -]?off\b|\blgtm\b/i
export const approvalMention = (text: string) => APPROVAL_WORD.test(text)
export const voteMention = (text: string) => approvalMention(text) || /\breject(?:ed|ion)?\b|\brequested changes\b|\bwaiting (?:for|on) author\b|\bmy vote\b/i.test(text)

export function voteClaimText(pr: number | undefined, claim: number | 'approval' | 'others', text: string): string {
	const target = pr === undefined ? 'this PR' : `PR ${pr}`
	if (claim === 'approval' || typeof claim === 'number' && claim >= 5) return `Your reply says you approved, but Delegate won't approve ${target}. Change the reply first.`
	if (claim === 'others') return `Your reply claims another reviewer's approval, but the vote on ${target} does not support it. Change the reply first.`
	const words = claim === -10 ? /\brequested changes\b/i.test(text) ? 'asked for changes' : 'rejected it'
		: claim === -5 ? 'are waiting for the author' : claim === 0 ? 'have no vote set' : 'approved'
	return `Your reply says you ${words}, but Delegate won't vote on ${target}. Change the reply first.`
}


// A run tag such as "[E2E-… 1792751673901]" before the words is a label, not part of what they say (bug 10-23 E35).
const untagged = (text: string) => text.trim().replace(/\u2019/g, "'").replace(/^(?:\[[^\]\n]{1,120}\]\s*)+/, '')
const sentencesOf = (text: string) => untagged(text).split(/(?<=[.!?;])\s+|\n+/).map(s => s.trim()).filter(Boolean)
export function approvalReplyMatches(text: string, vote: number | undefined, pr: number): boolean {
	if (!voteMention(text)) return true
	// Every sentence that speaks of approval must be a complete, bounded statement the vote supports; the rest is free.
	return sentencesOf(text).filter(voteMention).every(s => approvalSentenceMatches(s, vote, pr))
}
function approvalSentenceMatches(sentence: string, vote: number | undefined, pr: number): boolean {
	const line = sentence.replace(/[.!;]$/, '')
	// Only complete, bounded statements pass. Unrecognized approval wording waits for a redraft.
	const target = '(?:\\s+(?:(?:the\\s+)?(?:PR|pull request)(?:\\s*#?\\s*\\d+)?|it|\\d+))?'
	const condition = '(?:\\s+(?:after|once|when|until)\\s+(?:(?:the\\s+|its\\s+)?(?:build|tests?|checks?|requested changes|null check|comments?)(?:\\s+(?:is|are)\\s+(?:green|fixed|addressed|resolved|complete|done))?|checking the comments))?'
	const future = new RegExp(`^(?:(?:(?:Rechecked,?\\s+)?looks good(?: to me)?[.!;]|Yes,)\\s+)?(?:I|we)(?:'ll| will(?: not)?| won't)\\s+(?:approve|sign[ -]?off)${target}(?:\\s+too)?${condition}(?:, and add [a-z][a-z -]{0,60} as a reviewer)?$`, 'i')
	if (future.test(line)) return true
	if ([...prNumbersIn(line), ...[...line.matchAll(/\b(?:approve|approved|sign[ -]?off|signed[ -]?off)\s+#?(\d+)\b/gi)].map(m => Number(m[1]))].some(id => id !== pr)) return false
	if (vote === undefined || !Object.values(VOTES).includes(vote)) return false
	const negative = new RegExp(`^(?:(?:I|we)\\s+(?:have not|haven't|did not|didn't|have never|never)\\s+(?:approved|signed[ -]?off)${target}(?:\\s+yet)?|(?:Not yet,\\s*)?(?:my|our)\\s+approval\\s+(?:has not been|hasn't been|is not|isn't)\\s+(?:recorded|given))$`, 'i')
	if (negative.test(line)) return vote !== undefined && vote < 5
	const said = explicitVote(line)
	if (said !== undefined) return vote === said && /^(?:my vote (?:is|was set to|has been set to)|(?:I|we)(?:'ve| have)?\s+(?:(?:just|now|already)\s+)?(?:voted|set my vote(?: on \S+(?: \d+)?)? to))\s+(?:now\s+)?["']?(?:approved with suggestions|approved|waiting for author|waitingforauthor|rejected|no vote|novote)["']?$/i.test(line)
	if (/^(?:(?:I|we)(?:'ve| have)?\s+)?(?:rejected(?:\s+(?:it|the PR|PR\s+#?\d+))?(?: for now)?|requested changes(?:\s+on (?:the )?PR(?:\s+#?\d+)?)?)$/i.test(line)) return vote === -10
	if (/^(?:(?:I|we)(?:'m| am| are)?\s+)?waiting (?:for|on) author$/i.test(line)) return vote === -5
	const positive = new RegExp(`^(?:Reviewed and\\s+)?(?:(?:I|we)(?:'ve|\\s+have)?\\s+)?(?:approved|signed[ -]?off)${target}(?:,?\\s*(?:thanks|with suggestions|with one nit))?$|^LGTM$`, 'i')
	return vote !== undefined && vote >= 5 && positive.test(line)
}
export const reReviewAsk = (text: string) => /re[ -]?review|review again|recheck/i.test(text)
// A reply that only reports other people's approval state ("Priya has approved; the EM approval is still pending"): it does not
// speak for the owner, so it is checked against those reviewers' live votes, not the owner's (queue-new #6, A57).
const FIRST_PERSON = /\b(?:I|we|my|our|me|us|mine)\b/i
const NAMED_APPROVED = /\b(?:has|have|had)\s+(?:already\s+|now\s+|just\s+)?(?:approved|signed[ -]?off)\b/i
const APPROVED_BY = /\b(?:approved|signed[ -]?off)\s+by\s+(.+)$/i
const PENDING = /\b(?:approvals?|sign[ -]?offs?)\b.*\b(?:is|are)\s+(?:still\s+)?(?:pending|outstanding|needed|required|missing)\b|\b(?:still\s+)?(?:needs?|waiting\s+(?:on|for)|awaiting)\b.*\b(?:approvals?|sign[ -]?offs?)\b/i
type Kind = { kind: 'named'; who: string } | { kind: 'pending' }
function othersSentence(sentence: string, owner: string): Kind | undefined {
	const line = sentence.replace(/[.!;]$/, '')
	if (FIRST_PERSON.test(line) || /^\W*(?:(?:have|had|has|just|already|now|also)\s+)*(?:approved|signed[ -]?off|LGTM)\b/i.test(line)) return undefined
	const named = NAMED_APPROVED.exec(line), by = APPROVED_BY.exec(line)
	const simple = /^(@?[\p{Lu}][\p{L}'-]*(?:\s+[\p{Lu}][\p{L}'-]*){0,3})\s+(?:approves|approved|signed[ -]?off)\b/u.exec(line)
	const who = (named ? line.slice(0, named.index) : by?.[1] ?? simple?.[1] ?? '').replace(/[@*_]/g, ' ').trim()
	if (who) return owner && who.toLowerCase().includes(owner.toLowerCase()) ? undefined : { kind: 'named', who }
	return PENDING.test(line) && !/\bapproved\b/i.test(line) ? { kind: 'pending' } : undefined
}
// Every sentence about approval reports someone else's state; undefined when any of them speaks for the owner (today's strict path).
export function othersApproval(text: string, owner: string): Kind[] | undefined {
	const said = sentencesOf(text).filter(approvalMention)
	if (!said.length) return undefined
	const kinds = said.map(s => othersSentence(s, owner.trim()))
	return kinds.every((k): k is Kind => !!k) ? kinds : undefined
}
// Why the live PR does not support such a reply, or undefined when it does. The reviewer named closest before "has approved"
// (or right after "approved by") must have voted approve (5 or more); "still pending" needs an active PR still short of approval.
export function othersApprovalMismatch(kinds: Kind[], st: { status: string; votes: { name: string; vote: number }[] }, pr: number): string | undefined {
	for (const k of kinds) {
		if (k.kind === 'pending') {
			if (!/^active$/i.test(st.status)) return `PR ${pr} is ${st.status.toLowerCase()}, so no approval is pending`
			if (st.votes.length && st.votes.every(v => v.vote >= 5)) return `every reviewer on PR ${pr} has approved, so none is pending`
			continue
		}
		const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}'-]+/u).filter(w => w.length > 1)
		const said = words(k.who)
		const hits = st.votes.map(v => {
			const full = words(v.name), at = (() => { for (let i = said.length - 1; i >= 0; i--) if (full.includes(said[i])) return i; return -1 })()
			return { v, at }
		}).filter(h => h.at >= 0)
		const last = Math.max(-1, ...hits.map(h => h.at)), named = hits.filter(h => h.at === last)
		if (!named.length) return `the reply says "${k.who}" approved, but no reviewer by that name is on PR ${pr}`
		if (named.length > 1) return `the reply says "${k.who}" approved, but more than one reviewer on PR ${pr} matches that name`
		if (named[0].v.vote < 5) return `the reply says ${named[0].v.name} approved, but their vote on PR ${pr} is ${voteName(named[0].v.vote)}`
	}
	return undefined
}
// The vote the owner's own words say is already in place: 'approval' for "I approved it" or "LGTM", a vote value for
// "my vote is now Waiting for author"; undefined for a plan, a condition or a negation (bug 10-23 E35).
const VOTE_SAID: Record<string, number> = { approved: 10, approvedwithsuggestions: 5, waitingforauthor: -5, rejected: -10, novote: 0 }
function explicitVote(s: string): number | undefined {
	const v = /\bmy vote (?:is|was set to|has been set to)\s+(?:now\s+)?["']?(approved with suggestions|approved|waiting for author|waitingforauthor|rejected|no vote|novote)\b/i.exec(s)
		?? /\b(?:I|we)(?:'ve|\s+have)?\s+(?:just\s+|now\s+|already\s+)?(?:voted|set my vote(?: on \S+(?: \d+)?)? to)\s+["']?(approved with suggestions|approved|waiting for author|waitingforauthor|rejected|no vote|novote)\b/i.exec(s)
	return v ? VOTE_SAID[v[1].toLowerCase().replace(/\s+/g, '')] : undefined
}
function notClaim(s: string): boolean {
	const completed = /\b(?:approved|signed[ -]?off|rejected|requested changes|voted|waiting (?:for|on) author|lgtm)\b/i.exec(s)
	const before = completed ? s.slice(0, completed.index).replace(/^\s*when\s+(?=(?:I|we)(?:'ve|\s+have)?\s)/i, '') : s
	return /\?\s*$/.test(s) || /^(?:please\b|(?:could|can|would|will) you\b)/i.test(s) ||
		/^(?:approve|reject|request changes|sign[ -]?off)\s+(?:it|this|that|the PR|PR\s+#?\d+)\b/i.test(s) ||
		/^(?:looks? |it (?:looks? |is ))?(?:not )?ready for (?:approval|sign[ -]?off)\b/i.test(s) ||
		/\b(?:not|never|until|unless|if|once|after|when|before|will)\b|n't\b|'ll\b/i.test(before)
}
const VOTE_CLASSES = [
	{ kind: 'none', matches: (s: string, _owner: string) => notClaim(s) },
	{ kind: 'others', matches: (s: string, owner: string) => !!othersSentence(s, owner) },
	{ kind: 'owner', matches: (_s: string, _owner: string) => true },
] as const
export function voteSentences(text: string, owner = '') {
	return sentencesOf(text).filter(voteMention).flatMap(sentence =>
		sentence.split(/[,;\u2014\u2013:]\s*(?:(?:but|and)\s+)?/i).map(clause => clause.trim()).filter(voteMention).map(clause => {
			const others = othersSentence(clause, owner)
			const vote = explicitVote(clause) ?? (/\breject(?:ed|ion)?\b|\brequested changes\b/i.test(clause) ? -10 :
				/\bwaiting (?:for|on) author\b/i.test(clause) ? -5 : 'approval' as const)
			return { sentence, vote, kind: VOTE_CLASSES.find(row => row.matches(clause, owner))!.kind, others }
		}))
}
export function claimedVote(text: string): number | 'approval' | undefined {
	return voteSentences(text).find(s => s.kind === 'owner')?.vote
}
export const claimsApproval = (text: string) => claimedVote(text) !== undefined
// What a reply claims about votes, which decides whether the PR is read before it goes (queue-new #12): 'owner' for the owner's own
// approval or vote ("I approved it", "Approved.", "my vote is …"), others' approval (#6), or 'none'. Withholding, conditional and
// future words ("not ready to approve", "will approve once …", "looks ready for approval") claim nothing and send with no PR read.
export type ApprovalClaim = 'none' | 'owner' | { others: NonNullable<ReturnType<typeof othersApproval>> }
export function approvalClaim(text: string, owner: string): ApprovalClaim {
	const said = voteSentences(text, owner).filter(s => s.kind !== 'none')
	if (said.some(s => s.kind === 'owner')) return 'owner'
	const others = said.flatMap(s => s.others ? [s.others] : [])
	return others.length ? { others } : 'none'
}
export function voteClaimGap(text: string, effects: Effect[] = [], lastKnownVote?: { pr: number; vote?: number; head?: string }): { pr?: number; claim: number | 'approval'; why: string } | undefined {
	for (const said of voteSentences(text).filter(s => s.kind === 'owner')) {
		const ids = prNumbersIn(said.sentence), candidates = [...new Set(effects.filter(e => isVote(e.call)).map(e => prIdOf(e.call)).filter(id => id !== undefined))]
		const prs = ids.length ? ids : lastKnownVote ? [lastKnownVote.pr] : candidates.length === 1 ? candidates : [undefined]
		for (const pr of prs) {
			const matches = (vote?: number) => vote !== undefined && (said.vote === 'approval' ? vote >= 5 : vote === said.vote)
			const supported = pr !== undefined && (lastKnownVote?.pr === pr && matches(lastKnownVote.vote) ||
				effects.some(e => isVote(e.call) && prIdOf(e.call) === pr && !e.off && !e.error && !e.maybe &&
					(!e.done || !!lastKnownVote?.head && sameHead(e.head, lastKnownVote.head)) && matches(voteValue(e.call))))
			if (!supported) return { pr, claim: said.vote, why: voteClaimText(pr, said.vote, said.sentence) }
		}
	}
	return undefined
}
// The PRs a claim is about: numbers in the sentences that make it; else every PR the ask named when the reply says "all three",
// "both", "each", "them"; else the one the item is about. Empty: it does not say which of several.
export function claimedPrs(text: string, askPrs: number[], single?: number): number[] {
	const said = voteSentences(text).filter(s => s.kind !== 'none').flatMap(s => prNumbersIn(s.sentence))
	if (said.length) return [...new Set(said)]
	if (askPrs.length > 1 && /\b(?:all|both|each|every|them|these|those)\b/i.test(text)) return askPrs
	return single ? [single] : askPrs.length === 1 ? askPrs : []
}
export const approvalAsk = (text: string) => approvalMention(text) && !reReviewAsk(text)
export const approvalOnly = (wf: Workflow) => {
	const k = wf.work
	if (!k || !/^(?:please\s+)?(?:review\s+(?:and|&)\s+)?(?:approve|sign[ -]?off)\s+(?:PR|pull request)\s*#?\s*\d{4,}[.!]?$/i.test(k.goal)) return false
	if (k.plan?.some(p => !p.done) || /\b(?:after|before|then|validat\w*|test\w*|deploy\w*|ship\w*|monitor\w*|rollback|config\w*|partner)\b/i.test(k.doneWhen)) return false
	const goal = linksIn(k.goal).filter(l => l.startsWith('pr:')), ask = linksIn(wf.lastAsk ?? '').filter(l => l.startsWith('pr:'))
	return new Set([...k.links.filter(l => /^pr:/i.test(l)), ...goal, ...ask].map(l => l.split(/[:/]/).at(-1))).size <= 1
}
