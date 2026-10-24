export const approvalMention = (text: string) => /approv|sign[ -]?off|\blgtm\b/i.test(text)
export const voteMention = (text: string) => approvalMention(text) || /\breject(?:ed|ion)?\b|\brequested changes\b|\bwaiting (?:for|on) author\b|\bmy vote\b/i.test(text)

export function voteClaimText(pr: number | undefined, claim: number | 'approval' | 'others', text: string): string {
	const target = pr === undefined ? 'this PR' : `PR ${pr}`
	if (claim === 'approval' || typeof claim === 'number' && claim >= 5) return `Your reply says you approved, but Delegate won't approve ${target}. Change the reply first.`
	if (claim === 'others') return `Your reply claims another reviewer's approval, but the vote on ${target} does not support it. Change the reply first.`
	const words = claim === -10 ? /\brequested changes\b/i.test(text) ? 'asked for changes' : 'rejected it'
		: claim === -5 ? 'are waiting for the author' : claim === 0 ? 'have no vote set' : 'approved'
	return `Your reply says you ${words}, but Delegate won't vote on ${target}. Change the reply first.`
}
