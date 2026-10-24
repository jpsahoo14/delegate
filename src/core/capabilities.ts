import { z } from 'zod'
import type { Rule } from './types.ts'

const scope = { who: ['accounts', 'team', 'org', 'outside'], chat: true, minConfidence: true } as const
const people = (r: Rule) => r.who.accounts?.map(p => p.name).join(', ') || (r.who.group === 'org' ? 'someone in your org' : r.who.group === 'team' ? 'someone in your team' : 'someone outside your org')
const empty = z.object({}).strict()
export const CAPABILITY_VERSION = 2
const conditions = (r: Rule) => [
	r.when.intent && `about ${r.when.intent.replace(/_/g, ' ')}`,
	r.when.chat && (r.when.chat === 'direct' ? 'in a one-to-one chat' : 'in the specified chat'),
	r.when.minConfidence && (r.when.minConfidence === 'high' ? 'with a card and a live source' : 'with a supporting card'),
].filter(Boolean).join(', ')
const scopedPeople = (r: Rule) => `${people(r)}${conditions(r) ? ` ${conditions(r)}` : ''}`
const GRANT_RANK: Record<Rule['then'], number> = { draft: 4, shortcut: 4, ignore: 3, review: 2, ack: 1, send: 0 }
export const compareGrants = (a: Rule, b: Rule) => GRANT_RANK[b.then] - GRANT_RANK[a.then] ||
	Number(!!b.who.accounts?.length) - Number(!!a.who.accounts?.length)
export const CAPABILITIES = {
	send: { scope, params: empty, readBack: (r: Rule) => `Send replies to ${scopedPeople(r)} without asking you.` },
	ack: { scope, params: empty, readBack: (r: Rule) => `Acknowledge requests from ${scopedPeople(r)} without asking you.` },
	draft: { scope, params: empty, readBack: (r: Rule) => `Keep replies to ${scopedPeople(r)} as drafts for you.` },
	ignore: { scope, params: empty, readBack: (r: Rule) => `Ignore requests from ${scopedPeople(r)} without asking you.` },
	shortcut: { scope, params: z.object({ goal: z.string() }).strict(), readBack: (r: Rule) => `Propose this shortcut for ${scopedPeople(r)}: ${r.shortcut?.goal ?? 'not specified'}. It waits for your OK.` },
	review: {
		active: true,
		scope: { ...scope, intent: 'pr_review', minConfidence: false },
		params: z.object({ comments: z.literal('post'), reply: z.literal('send') }).strict(),
		readBack: (r: Rule) => `When ${people(r)} asks you to review a PR ${r.when.reviewerGroup ? `that ${r.when.reviewerGroup} reviews` : "you're a reviewer on"}${r.when.chat ? r.when.chat === 'direct' ? ' in a one-to-one chat' : ' in the specified chat' : ''}: Delegate reviews it, posts up to 10 comments on the PR (most important first) and replies to whoever asked, without asking you. It never votes or approves; approving stays yours.`,
	},
}
export type Capability = keyof typeof CAPABILITIES
const kinds = Object.keys(CAPABILITIES) as Capability[]
export const RuleSchema = z.object({
	id: z.string(), text: z.string(),
	who: z.object({ accounts: z.array(z.object({ id: z.string().min(1), name: z.string() })).optional(), group: z.enum(['team', 'org', 'outside']).optional() })
		.refine(w => !!w.accounts?.length || !!w.group, 'A rule must name people by account ID, or a group.'),
	when: z.object({ intent: z.string().optional(), chat: z.string().optional(), minConfidence: z.enum(['high', 'medium']).optional(), reviewerGroup: z.string().trim().min(1).optional() }),
	then: z.enum(kinds), off: z.literal(true).optional(),
	review: CAPABILITIES.review.params.optional(), shortcut: CAPABILITIES.shortcut.params.optional(),
}).superRefine((rule, ctx) => {
	if (rule.then === 'review' && rule.when.intent !== 'pr_review')
		ctx.addIssue({ code: 'custom', message: 'A review rule is only for PR review requests.' })
	if (rule.then === 'review' && !rule.review)
		ctx.addIssue({ code: 'custom', message: 'A review rule must post comments and send the review reply.' })
	if (rule.then !== 'review' && rule.review)
		ctx.addIssue({ code: 'custom', message: 'Review permissions belong only to a review rule.' })
})
export const readBack = (rule: Rule) => {
	const capability = CAPABILITIES[rule.then]
	if ('active' in capability && !capability.active) return "Not active yet: Delegate can't do this in this version. Until then: PR reviews wait for you."
	return `${rule.off ? 'Off: ' : ''}${capability.readBack(rule)}`
}
export const REVIEW_RULE_TEXT = "When someone asks me to review a PR I'm a reviewer on, review it, post your comments on the PR and reply to them, without asking me first. Never vote or approve for me."
export function voteLimitNotice(text: string): string | undefined {
	return text.split(/[.;\n]/).some(line => /\b(?:approv\w*|vot\w*)\b/i.test(line) && !/\b(?:never|not|no|don't|do not)\b/i.test(line))
		? 'Delegate never votes or approves for you; that part was left out.' : undefined
}
