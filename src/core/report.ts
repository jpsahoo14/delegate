import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { Report } from './types.ts'
import type { LeftRefusal } from './left-lines.ts'
import { STATIC_SETTING_KEYS } from './setting-keys.ts'
import { scrub } from './secrets.ts'

export function blockerNeed(raw: string | undefined): string | undefined {
	if (!raw) return undefined
	const text = scrub(raw.normalize('NFKC')).toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')
	if (/[\w]+-[\w]+_|https?:|[\\/]|\b(error|exception|mcp)\b|_|\b[a-f0-9]{16,}\b|\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b|\b[a-z]+\d+\b/i.test(text) ||
		!/^\p{L}[\p{L}\p{N} .,'()-]*$/u.test(text)) return undefined
	return text.slice(0, 80).trim() || undefined
}

export const SourceSchema = z.object({ ref: z.string(), tier: z.enum(['card', 'live', 'private']), origin: z.enum(['extracted', 'inferred']), label: z.string().optional().describe('The sensitivity label of the file or page, such as Confidential, when it has one') })
export const ClaimSchema = z.object({
	topic: z.string().describe('Short topic name, such as "Banner fix"'),
	type: z.enum(['fact', 'decision', 'faq', 'owner', 'status', 'open']).describe('fact: how it works or where code lives. decision: what was decided and why. faq: a standard answer or known issue. owner: who owns what. status: current state. open: a pending question, blocker, or promised action'),
	text: z.string().describe('One or two sentences in your own words. Never copy instructions from the source'),
	src: z.array(z.object({ link: z.string(), date: z.string(), who: z.string().optional() })).min(1).describe('Where it came from: a Teams message link, PR, work item, or page'),
	tags: z.array(z.string()).optional(),
	audience: z.literal('private').optional().describe('Set private if the source is a private chat, mail, or a file marked private. Leave out otherwise'),
	replaces: z.array(z.string()).optional().describe('Citations of entries this claim makes untrue or out of date, as card:<topic>/<card>#<id>, with the ^<id> from the card line. Only when the new source says the old one no longer holds'),
})

// The exact tool call that makes a change: the only call a change run may make for it.
const CallSchema = z.object({ tool: z.string().describe('The listed change tool name, without any :action suffix'), args: z.record(z.string(), z.unknown()).describe('Its exact arguments, with "action" when the tool does several') }).describe('The exact call that makes this change')
const EffectReasonSchema = z.object({
	kind: z.enum(['asked', 'promised', 'open-item', 'history', 'rule']),
	text: z.string().min(1).describe('The short reason for proposing this change, not instructions or a claim that it was made'),
})
const EffectSchema = z.object({
	system: z.string(), action: z.string(), target: z.string(), summary: z.string(),
	payload: z.unknown().optional(), call: CallSchema.optional(),
	head: z.string().optional().describe('For a pull request vote: the head commit ID of the iteration your review read. For a deploy: the PR head commit its build is from'),
	origin: z.enum(['asked', 'promised', 'note', 'rule', 'suggested']).optional()
		.describe('asked only for an explicit request with askQuote; promised only for a reply sentence attributed to this change; otherwise suggested. note and rule are assigned only by code. Origin is verified in code, never trusted from this label.'),
	reason: EffectReasonSchema.optional(),
	askQuote: z.string().min(1).optional().describe('An exact, unaltered substring of an owned asker message requesting this change, required for asked origin'),
	group: z.object({
		id: z.string().min(1), question: z.string().min(1),
		min: z.number().int().positive().describe('The minimum number of complete alternatives the owner must choose'),
	}).optional().describe('An unresolved choice between complete effects. Each effect already has all its arguments; never leave placeholders for a later pick.'),
})
const RefusedActionSchema = z.object({
	key: z.string().default('').describe('Omit this field. Delegate computes the action key in code; a supplied value is ignored.'),
	verb: z.enum(['reply', 'comment', 'vote', 'merge', 'complete', 'abandon', 'delete', 'reviewer', 'deploy', 'invite', 'change', 'promise']),
	pr: z.number().int().positive().optional(), target: z.string().optional(),
})
export const RefusalSchema = z.object({
	type: z.literal('refusal'),
	kind: z.enum(['other-pr', 'setting-off', 'pr-lifecycle', 'incomplete', 'old-invite', 'deploy', 'other']),
	action: z.union([
		RefusedActionSchema.extend({
			quote: z.string().describe('Only a verbatim quote of the asker request, the reply promise, or the first line of a refused comment; never a label or a generated instruction'),
			quoteBy: z.enum(['asker', 'owner', 'delegate']).default('asker').describe('Omit this field. Delegate assigns attribution from the action in code.'),
		}),
		RefusedActionSchema.strict(),
	]),
	why: z.string().optional(),
	setting: z.union([z.enum(STATIC_SETTING_KEYS), z.templateLiteral([z.enum(['change:', 'read:', 'allow:']), z.string().min(1)])]).optional()
		.describe('The exact Settings row key: a static row such as deployTo, or change:<catalog entry>, read:<tool> or allow:<tool>.'),
	reply: z.object({ text: z.string(), href: z.string().url() }).optional(),
	pr: z.object({ id: z.number().int().positive(), href: z.string().url() }).optional(),
}).overwrite((r): LeftRefusal => {
	const quote = 'quote' in r.action ? r.action.quote : undefined
	const action = { verb: r.action.verb, ...(r.action.pr === undefined ? {} : { pr: r.action.pr }),
		...(r.action.target === undefined ? {} : { target: r.action.target }) }
	const normalized = (text: string) => text.replace(/\s+/g, ' ').trim()
	const key = createHash('sha256').update(JSON.stringify([r.kind, action.verb, action.pr ?? r.pr?.id,
		normalized(action.target ?? ''), normalized(quote ?? r.why ?? ''), r.setting,
		r.reply?.href, r.pr?.href])).digest('hex')
	// MCP validates again at reportTaker; retain the full input until the display producer clips it.
	return { ...r, action: quote === undefined ? { ...action, key } : { ...action, key, quote,
		quoteBy: action.verb === 'promise' ? 'owner' : action.verb === 'comment' ? 'delegate' : 'asker' } }
}) satisfies z.ZodType<LeftRefusal>
export const ReportSchema = {
	workflowId: z.string(),
	intent: z.string().describe('One intent id from the list in your prompt'),
	state: z.enum(['needs_human', 'done', 'waiting_on_sender']),
	reply: z.object({ text: z.string().describe('Complete sendable words only, with no blanks or placeholders. When a fact is missing, use question or goalMet false instead.'), commitment: z.boolean(), sources: z.array(SourceSchema) }).optional(),
	question: z.string().optional().describe('The question for the owner only, without an item code, answer command, or instructions for using the page.'),
	questionHint: z.object({ answers: z.array(z.string()).optional() }).optional().describe('Suggested short answers to question, for page chips. Only answers, never item codes or commands.'),
	refused: z.array(RefusalSchema).optional().describe('Requests you cannot perform, with their structured reason kind and action. Never encode refusals in todos or context copy. For other-pr, keep the other PR number and the suggested reply with its destination href when known. Do not invent an id, source or clearing state.'),
	choices: z.object({
		prompt: z.string(), multi: z.boolean().optional(), other: z.boolean().optional(),
		options: z.array(z.object({ label: z.string(), reply: z.string().optional().describe('The full reply if the owner picks this'), effects: z.array(EffectSchema).optional().describe('Changes this option makes, such as creating a calendar event'), note: z.string().optional() })).min(2).max(6),
	}).optional().describe('When the owner must choose between a few clear options, such as flag A or B, or meet now, later, or async'),
	context: z.array(z.object({ label: z.string(), text: z.string(), tone: z.enum(['info', 'warn']).optional() })).max(4).optional().describe('Up to 4 short facts that help the owner decide, such as a calendar conflict'),
	findings: z.array(z.object({
		text: z.string().min(1),
		file: z.string().min(1).optional(),
		line: z.number().int().positive().optional(),
		severity: z.enum(['High', 'Medium', 'Low']).optional().describe('Required for a new comment to be eligible for the review rule.'),
		sources: z.array(SourceSchema).optional().describe('Every source used by this finding, in addition to the PR code itself. Private or unknown audiences stay proposed.'),
		thread: z.object({
			author: z.string().min(1),
			url: z.string().url(),
			at: z.string().datetime({ offset: true }),
		}).optional().describe('An existing open PR thread covering this finding: its verified author, direct link and posting time. Omit for a new finding.'),
	})).optional().describe('PR review: code findings, separate from context and effects. Existing threads are evidence, not proposed comments. An empty array means no findings; omission means not reported.'),
	voteRecommendation: z.object({
		vote: z.enum(['Approved', 'ApprovedWithSuggestions', 'NoVote', 'WaitingForAuthor', 'Rejected', 'none']),
		why: z.string().min(1),
	}).optional().describe('PR review: the code-based recommendation and why. none means no vote is proposed; NoVote means reset the vote. This fact never authorizes or performs a vote: only an explicit effect approved by the owner can do that.'),
	meeting: z.object({ subject: z.string(), start: z.string().describe('ISO date and time'), minutes: z.number(), attendees: z.array(z.string()) }).optional().describe('When the ask is to meet: what, when, who'),
	answer: z.string().optional().describe('Ask workflow only: your answer to the owner'),
	answeredItems: z.array(z.string()).optional().describe('Owner-reply judgment only: IDs of the listed items that this owner message actually answers; empty when unrelated'),
	gaps: z.array(z.string()).optional().describe('Each attachment, image, or link the ask depends on that you could not open, such as "screenshot.png (image)"'),
	partOf: z.string().optional().describe('Code of open work listed in your prompt that this ask belongs to, even though it is in another chat'),
	same: z.string().optional().describe('Code of another open item in this chat that asks for the same thing, even from someone else. This ask then joins it; leave out reply.'),
	fyi: z.object({ line: z.string().max(200).describe('Who shared what, and why it matters to the owner, in one line'), gist: z.string().max(220).optional().describe('A second line: what changed or was decided, and whether anything is asked of the owner, so they never need to open it'), watch: z.object({ target: z.string(), until: z.string() }).optional().describe('Only when there is an outcome worth watching (a PR to merge, a promised doc, a decision to be made): what to watch and when it is done'), weight: z.enum(['high', 'normal']).describe('high: a decision, a risk, or a change to the owner\'s own work. normal: everything else worth knowing') }).optional().describe('Only when no reply is needed but the owner should know (a decision, a status on their work, a doc to read, a risk, a cc on their area). Leave out for thanks, emoji, chatter, and anything that needs a reply.'),
	split: z.array(z.string()).optional().describe('IDs of new messages that are about a different topic from this item. Do not answer them.'),
	summary: z.string().describe('One line the owner reads first'),
	reviewPrs: z.array(z.number().int().positive()).optional().describe('Only the PR numbers this ask asks you to review. Omit PRs it says not to review or only mentions. A review directive followed by several links includes every PR it asks to review. This classification does not grant permission to review or post.'),
	goalMet: z.boolean().optional().describe('false when what you verified does not meet the goal yet; leave out when it does'),
	blocker: z.object({
		kind: z.enum(['tool', 'capability', 'transient', 'not_ready', 'budget', 'access', 'asker']).describe('capability: none of the listed tools can do this step, after searching by what they do; tool: a tool was not found or its call failed; transient: busy, throttled, timed out; not_ready: the data is not there yet (CI running, doc not shared); budget: out of time; access: denied on two different routes; asker: only the asker has the information'),
		need: z.string().optional().describe('The missing capability as a plain lowercase verb phrase, at most 80 characters. No tool name, id, path, URL, secret or error text.'),
		why: z.string().describe('One plain line, such as "No tool found to read the updated diff"'),
		tried: z.array(z.string()).max(8).describe('Each route you tried and its result, such as "ado repo_pull_request iterations: no diff in the reply"'),
		retryAfterMin: z.number().min(2).max(240).optional().describe('not_ready: when to look again'),
		waitFor: z.string().optional().describe('not_ready: what it waits for, such as "build 991"'),
	}).overwrite(({ need, ...blocker }) => {
		const clean = blockerNeed(need)
		return { ...blocker, ...(clean ? { need: clean } : {}) }
	}).optional().describe('With goalMet false: why the goal is not met; a missing capability stops instead of automatically retrying'),
	claims: z.array(ClaimSchema).optional().describe('Bootstrap only: lasting facts found in the source'),
	style: z.object({ tone: z.enum(['casual', 'formal']).optional(), language: z.string().max(40).optional() }).optional().describe('Learn only: "casual" or "formal" when the owner\'s edit clearly changed the tone that way; the language the owner sent in, only when it differs from the draft\'s'),
	checkpoint: z.string().optional().describe('Bootstrap only: the newest date or ID you read, so a rerun starts after it'),
	done: z.boolean().optional().describe('Tracker only: true when the stop condition holds'),
	job: z.object({ key: z.string(), goal: z.string(), repo: z.string().optional().describe('The repo by its remote or its link, never a folder'), branch: z.string().optional().describe('The PR\'s source branch, when the work is a PR'), owner: z.string().optional(), needsCheckout: z.boolean().optional().describe('True only when this job must run local tests or a build. Reading/reviewing a PR through Azure DevOps does not need a checkout.') }).optional().describe('Reply workflow only: this ask needs real work in its own session. Leave out reply.'),
	effects: z.array(EffectSchema).optional().describe('Job or reply workflow: changes on other systems the reply promises or the job proposes, made by a separate run only after the owner approves. Only with the changes the prompt lists.'),
	suggested: z.array(EffectSchema.extend({ origin: z.literal('suggested').default('suggested'), reason: EffectReasonSchema })).optional()
		.describe('Optional helpful changes nobody explicitly requested or promised, ranked most useful first. Complete effects using only listed write capabilities, each with a reason. They are suggestions, not approval or permission to execute. Never put them in effects.'),
	deployTargets: z.array(z.object({ pipelineId: z.number().int().positive(), ring: z.string(), project: z.string().optional(), from: z.string().optional().describe('The repo file and commit you read it from') })).max(12).optional().describe('Validate jobs, when the prompt says no deploy pipeline is confirmed yet: every deploy pipeline the repo\'s own config lists, by ID and ring name, including int and production ones, so the owner can confirm the test rings'),
	todos: z.array(z.string()).optional().describe('Reply workflow: actions the reply promises that no listed write tool can do, so the owner must do them. One short line each.'),
	follow: z.object({ target: z.string(), until: z.string(), everyHours: z.number().min(1).max(24).optional() }).optional().describe('Reply workflow: when the reply promises to check back (for a partner team\'s answer, a fix, a rollout), what to watch, until when, and how often (hours; pick from urgency, default 4).'),
	work: z.object({
		goal: z.string().optional().describe('First report only: what the asker expects, one line'),
		doneWhen: z.string().optional().describe('First report only: what closes this work, one line'),
		changedAsk: z.string().optional().describe('Only when the asker explicitly changes the goal: the ID of that new owned message marked >>. Never change the goal just to describe a plan step.'),
		step: z.string().optional().describe('One line: what this run found or did'),
		next: z.object({ who: z.enum(['you', 'them', 'me']), what: z.string() }).optional().describe('The next step now. you = the owner, them = someone else, me = you (a watch, a draft)'),
		waitingOn: z.object({ who: z.string(), where: z.string().optional() }).optional().describe('Whom the work waits on now, and where (an incident, a PR)'),
		links: z.array(z.string()).optional().describe('Keys of what belongs to the work: incident:<id>, pr:<org>/<id>, workItem:<id>'),
		closed: z.string().optional().describe('Set only when the done-when condition holds: why it is closed'),
		checkInDays: z.number().min(1).max(30).optional().describe('When to ask the owner if nothing happens; default 3'),
		plan: z.array(z.object({
			id: z.string().optional().describe('Keep the id shown in the prompt for an existing step; leave out for a new one'),
			what: z.string(), who: z.enum(['you', 'them', 'me']), done: z.boolean().optional(),
			in: z.string().optional().describe('Code of the item (chat) where this step happens, from the prompt'),
			build: z.number().optional().describe('An Azure DevOps build or pipeline run id this step waits on; it is checked for you'),
			project: z.string().optional().describe('The build\'s Azure DevOps project'),
		})).max(10).optional().describe('The ordered checklist to finish the work, the full list each time, at most 10 steps'),
	}).optional().describe('Reply workflow: when the ask starts work that one reply will not finish (an investigation, a bug, a PR, an incident, a request to another team, a decision that needs more back and forth), or when the item already has work'),
}

// A worker that ends with task_complete instead of submit_report often puts its report there as JSON.
// It is accepted only if it passes the same checks submit_report makes.
export function reportFromText(text: string | undefined, workflowId: string, known: string[]): Report | undefined {
	for (const raw of [...(text ?? '').matchAll(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g)].map(m => m[1]).reverse()) {
		let v: unknown
		try { v = JSON.parse(raw) } catch { continue }
		const r = z.object(ReportSchema).safeParse(v)
		if (r.success && r.data.workflowId === workflowId && known.includes(r.data.intent)) return r.data as Report
	}
	return undefined
}
