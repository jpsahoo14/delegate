import { site } from './site.ts'
import { classifyTool, type ToolInfo } from './tool-class.ts'
import type { Call, Config, Effect, PrFacts, Workflow } from './types.ts'
import { NAME } from '../brand.ts'
import { DEPLOY, deployLine, deployRefusal, isDeploy, isPipelineTool, pipelineOf, ringParts, targetOf } from './deploy.ts'

// The changes still to make: not done, and not unchecked by the owner (design-spec S6).
export const pendingEffects = (es: Effect[] = []): Effect[] => es.filter(e => !e.done && !e.off)
// The same change: the same call, or the same payload when there is no call. Two comments on one PR are two changes (review 10-21c P2-2).
// A vote names no commit in its call, so its head tells a re-approval apart; a comment is the same comment at any head (review 10-21e P1-3).
export const sameChange = (a: Effect, b: Effect) => JSON.stringify([a.system, a.action, a.target, a.call ?? a.payload ?? null]) === JSON.stringify([b.system, b.action, b.target, b.call ?? b.payload ?? null]) && (!isVote(a.call) || (a.head ?? null) === (b.head ?? null))
export function proposalEffects(effects: Effect[], items: Pick<Workflow, 'id' | 'lastMsgId'>[]): Effect[] {
	const turns = items.map(w => `${w.id}:${w.lastMsgId}`)
	return effects.map(e => ({ ...e, turns }))
}
export const sameProposal = (a: Effect, b: Effect) => sameChange(a, b) && (a.turns && b.turns ? a.turns.some(turn => b.turns?.includes(turn)) : !a.turns && !b.turns)
// A list takes what is known about each of its changes from another list of the same changes: made, or may have been made (review 10-21d P1).
// Vote receipts are retained only by the live-checked report path, never by generic list adoption.
export const carryMarks = (list: Effect[], from: Effect[] = []) => list.map(e => { if (e.done) return e; const m = from.find(x => (x.maybe || x.done && !isVote(e.call)) && sameProposal(x, e)); return m ? { ...e, done: m.done, maybe: m.maybe, error: m.error } : e })

// An allowed change is a tool, or one action of a tool that does several ("ado-repo_pull_request_write:vote").
// An entry without an action allows the whole tool, as before (R-HIL-21).
const parts = (entry: string) => { const i = entry.indexOf(':'); return i < 0 ? [entry] : [entry.slice(0, i), entry.slice(i + 1)] }
export const allows = (entries: string[] = [], c: Call) => entries.some(x => { const [tool, action] = parts(x); return tool === c.tool && (!action || action.toLowerCase() === String(c.args.action ?? '').toLowerCase()) })
export const toolOf = (entry: string) => parts(entry)[0]

// Never made, whatever the owner allows: completing, merging, abandoning, bypassing policies, or deleting (owner, 2026-10-20).
// Checked at any depth of the arguments, and for Azure DevOps' numeric statuses (2 abandoned, 3 completed).
const NEVER_KEY = /bypass|autocomplete|completionoptions|deletesourcebranch|mergestrategy/i
// The numbers are a pull request's own statuses; a comment thread uses 2 and 3 for "fixed" and "won't fix" (review 10-21b P2-3).
const never = (v: unknown, pr: boolean): boolean => Array.isArray(v) ? v.some(x => never(x, pr)) : !!v && typeof v === 'object' && Object.entries(v).some(([k, x]) =>
	NEVER_KEY.test(k) || /^action$/i.test(k) && /complet|merge|abandon|bypass|delete/i.test(String(x)) || /^status$/i.test(k) && (/^(completed|abandoned)$/i.test(String(x)) || pr && /^[23]$/.test(String(x))) || never(x, pr))
const prTool = (c: Call) => /pull_?request|_pr_/i.test(c.tool)
export const forbidden = (c: Call) => /delete/i.test(c.tool) || never(c.args, prTool(c) && !/thread/i.test(c.tool))

// A read tool never writes: a `*_write` tool, a pipeline write or run, or a whole server (every tool it has) would give a worker
// a change before the owner's ok, outside every gate here. servers: the tool servers' names (owned work, round 2 P2-1).
// The verdict is the classifier's (#17), with the server's own listing when there is one, so the two never disagree.
export function unsafeRead(tools: string[], servers: string[], info?: (server: string, tool: string) => ToolInfo | undefined): string | undefined {
	const whole = (t: string) => t === '*' || servers.includes(t.replace(/(?:-\*|\(\*\))$/, ''))
	const write = (t: string) => {
		const base = t.replace(/[:(].*$/, ''), server = servers.filter(s => base.startsWith(`${s}-`)).sort((a, b) => b.length - a.length)[0] ?? base.split('-')[0]
		const tool = base.startsWith(`${server}-`) ? base.slice(server.length + 1) : base
		return classifyTool(server, info?.(server, tool) ?? { name: tool }).cls === 'write'
	}
	const t = tools.find(t => whole(t) || write(t))
	return t && `${t} is never a read tool: it can change things, and workers would hold it before your ok. Remove it from the read tools in setup`
}
// A refusal of the owner's setup (a write tool as a read tool, a shell in a clone, a tool the AI CLI cannot name) is the
// same on every try: refused once, never retried, shown whole (bug 10-23 E33).
export const SETUP_REFUSAL = /is never a read tool|never runs in your clone with a shell|no known Claude Code name/

// A pull request is named by number in pullRequestId, at the top of the arguments; any other way names none.
export const prIdOf = (c?: Call): number | undefined => { const v = c?.args.pullRequestId; return typeof v === 'number' && Number.isInteger(v) || typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined }
export const isVote = (c?: Call) => !!c && (/vote/i.test(String(c.args.action ?? '')) || /vote/i.test(c.tool))
// Azure DevOps vote values, as its reviewers list reports them.
export const VOTES: Record<string, number> = { Approved: 10, ApprovedWithSuggestions: 5, NoVote: 0, WaitingForAuthor: -5, Rejected: -10 }
const VOTE_NAME: Record<number, string> = Object.fromEntries(Object.entries(VOTES).map(([k, n]) => [n, k]))
const VOTE_WORDS: Record<string, number> = { approved: 10, approve: 10, approvedwithsuggestions: 5, approvewithsuggestions: 5, waitingforauthor: -5, waitforauthor: -5, rejected: -10, reject: -10, novote: 0, reset: 0 }
// A vote's value however it is written: a name in any case, the tool's verb, or the number; anything else is no vote.
export function voteValue(c?: Call): number | undefined {
	const v = c?.args.vote
	if (typeof v === 'number' || typeof v === 'string' && /^-?\d+$/.test(v)) return VOTE_NAME[Number(v)] ? Number(v) : undefined
	return VOTE_WORDS[String(v ?? '').toLowerCase().replace(/[\s_-]/g, '')]
}
// The same commit, also when one side is a short id of at least 7 characters.
export const sameHead = (a?: string, b?: string) => { const [x, y] = [a?.toLowerCase() ?? '', b?.toLowerCase() ?? '']; return !!x && !!y && (x === y || Math.min(x.length, y.length) >= 7 && (x.startsWith(y) || y.startsWith(x))) }
// The vote a message plainly asks to set ("set my review vote to WaitingForAuthor"), never one under a condition ("if ready,
// set my vote to Approved") or a review ask; undefined when it names none or several (bug 10-23 E28).
const ASK_VOTE = /\b(?:set|change|make|cast|switch|update|reset)\s+(?:my|the owner's|\w+'s)?\s*(?:review\s+)?vote\s+(?:on\s+(?:PR\s+)?\S+\s+)?(?:to|as)\s+["'“]?(approved with suggestions|approvedwithsuggestions|approved|approve|waiting for author|waitingforauthor|wait for author|rejected|reject|no vote|novote)\b/gi
export function askedVote(text: string): number | undefined {
	const found = new Set<number>()
	for (const sentence of text.split(/(?<=[.!?;])\s+|\n+/)) for (const m of sentence.matchAll(ASK_VOTE)) {
		if (/\b(?:if|when|once|unless|after)\b/i.test(sentence.slice(0, m.index))) continue
		const v = VOTE_WORDS[m[1].toLowerCase().replace(/[\s_-]/g, '')]
		if (v !== undefined) found.add(v)
	}
	return found.size === 1 ? [...found][0] : undefined
}
export const voteName = (n: number) => ({ 10: 'Approved', 5: 'Approved with suggestions', 0: 'No vote', [-5]: 'Waiting for author', [-10]: 'Rejected' } as Record<number, string>)[n] ?? String(n)
// A calendar invite change (bug 10-23 E16).
export const isInvite = (e?: Pick<Effect, 'system' | 'action' | 'call'>) => !!e && (/(?:^|[-_])CreateEvent$/i.test(e.call?.tool ?? '') || /calendar/i.test(e.system ?? '') && /create_event|invite/i.test(e.action ?? ''))
// An explicit ask to book a meeting or send an invite ("can we set up a 30-minute sync…", "please send an invite for…"); a negated one is none.
const BOOK = /\b(?:send|set up|setup|book|schedule|arrange)\b[^.?!]{0,60}\b(?:invite|invitation|meeting|call|sync|catch[- ]?up)\b|\bcan (?:we|you) (?:do|have|set up|book|schedule)\b[^.?!]{0,60}\b(?:meeting|call|sync|catch[- ]?up)\b/i
export const asksInvite = (text: string) => text.split(/(?<=[.!?;])\s+|\n+/).some(s => { const m = BOOK.exec(s); return !!m && !/\b(?:do not|don't|dont|no need to|not|never|without)\b/i.test(s.slice(0, m.index)) })
// Words that say an invite already went ("I've sent an invite", "the invite is sent"); true only once the invite exists.
export const claimsInvite = (text: string) => /\b(?:I(?:'|’)ve|I have|I(?:'|’)ve just|we(?:'|’)ve|we have)\s+(?:just\s+)?(?:sent|booked|scheduled|set up)\b[^.!?]{0,80}\b(?:invite|invitation|meeting|call|sync)\b|\b(?:invite|invitation)\b[^.!?]{0,40}\b(?:is|was|has been)\s+(?:sent|booked)\b|\bsent (?:you |them |everyone )?(?:an? |the )?(?:invite|invitation)\b/i.test(text)

// Why a proposed change cannot be made, or undefined when it can. pr: the item's own pull request.
export function refusal(cfg: Config, e: Effect, pr?: number): string | undefined {
	const c = e.call
	if (!c) return 'it names no exact call'
	// A pipeline is only ever run: never created, renamed, or changed, and its stages never cancelled or retried (owned work).
	if (isPipelineTool(c) && !isDeploy(c)) return `${NAME} never creates, renames, or changes a pipeline, or cancels or retries its stages`
	if (forbidden(c)) return `${NAME} never completes, merges, abandons, bypasses, or deletes`
	// A deploy is allowed by its pipeline's ID on "Where Delegate may deploy", never by the tool alone.
	if (isDeploy(c)) return deployRefusal(cfg, e, pr)
	if (!allows(cfg.agent.effectTools, c)) return `${c.tool}${c.args.action ? `:${String(c.args.action)}` : ''} is not one of the changes you allow`
	const id = prIdOf(c)
	if (id === undefined && (prTool(c) || isVote(c))) return 'a pull request change must name its PR by number in pullRequestId'
	if (id !== undefined && id !== pr) return `PR ${id} is not this item's PR${pr ? ` (${pr})` : ''}`
	if (isVote(c) && voteValue(c) === undefined) return 'a vote must be Approved, ApprovedWithSuggestions, WaitingForAuthor, Rejected, or NoVote'
	if (isVote(c) && !e.head) return 'a vote must name the commit the review read'
	// A reviewer change may only add the owner, alone, to this item's PR (review gate, owner rule 10-23).
	if (prTool(c) && String(c.args.action ?? '').toLowerCase() === 'update_reviewers') {
		const ids = Array.isArray(c.args.reviewerIds) ? c.args.reviewerIds.map(String) : []
		const upn = (cfg.owner.upn ?? '').trim().toLowerCase()
		if (!(String(c.args.reviewerAction ?? '').toLowerCase() === 'add' && ids.length === 1 && upn && ids[0].trim().toLowerCase() === upn)) return `${NAME} may only add you as a reviewer, never remove anyone or add someone else`
	}
	const invite = inviteShapeProblem(c)
	if (invite) return invite
	return undefined
}

// A stored invite from before calendar calls were converted is converted when it is made; one that cannot be converted
// (no readable start, no subject) is refused before any call, and the owner is offered a new draft (legacy E16).
export const OLD_INVITE = 'this invite was proposed in an older form'
export const OLD_INVITE_ASK = `The invite was proposed in an older form ${NAME} cannot make. Answer to have ${NAME} draft the invite again; nothing is sent until you OK the new draft.`
export function inviteShapeProblem(c?: Call): string | undefined {
	if (!c || !/(?:^|[-_])CreateEvent$/i.test(c.tool)) return undefined
	const a = toolShape(c)!.args
	const missing = [!String(a.subject ?? '').trim() && 'subject', !a.startDateTime && 'start time', !a.endDateTime && 'end time'].filter(Boolean)
	const old = ['start', 'minutes', 'durationMinutes', 'attendees'].filter(k => k in a)
	if (!missing.length && !old.length) return undefined
	return `${OLD_INVITE} that ${NAME} cannot turn into a calendar call (${missing.length ? `no ${missing.join(', ')}` : `old fields: ${old.join(', ')}`})`
}

// A calendar invite as the owner's calendar tool takes it (bug 10-23 E16): the meeting shape a worker writes,
// { subject, start, minutes, attendees }, becomes { subject, attendeeEmails, startDateTime, endDateTime, timeZone } in UTC.
// A call already in the tool's shape is kept as it is.
export function toolShape(c?: Call): Call | undefined {
	if (!c || !/(?:^|[-_])CreateEvent$/i.test(c.tool)) return c
	const a = c.args, start = Date.parse(String(a.start ?? '')), utc = (ms: number) => new Date(ms).toISOString().slice(0, 19)
	// Times with an offset are read as UTC, so a time zone name next to them can never shift the meeting.
	const offset = (v: unknown) => typeof v === 'string' && /(?:[zZ]|[+-]\d\d:?\d\d)$/.test(v) && !Number.isNaN(Date.parse(v))
	if (a.startDateTime !== undefined) return offset(a.startDateTime) && offset(a.endDateTime) ? { ...c, args: { ...a, startDateTime: utc(Date.parse(String(a.startDateTime))), endDateTime: utc(Date.parse(String(a.endDateTime))), timeZone: 'UTC' } } : c
	if (Number.isNaN(start)) return c
	const minutes = Number(a.minutes ?? a.durationMinutes ?? 30) || 30
	const { start: _s, minutes: _m, durationMinutes: _d, attendees, ...rest } = a
	const emails = ([] as unknown[]).concat(attendees ?? a.attendeeEmails ?? []).map(String).filter(Boolean)
	return { ...c, args: { ...rest, subject: a.subject, attendeeEmails: emails, startDateTime: utc(start), endDateTime: utc(start + minutes * 60_000), timeZone: 'UTC' } }
}

// When a report lands: a change that cannot be made becomes a to-do with the reason; it never vanishes (next action).
// A deploy goes alone: one pending change per work item at a time, so a run never stacks changes on a ring (owned work).
export function vet(cfg: Config, effects: Effect[] = [], pr?: number): { effects: Effect[]; todos: string[] } {
	const ok: Effect[] = [], todos: string[] = []
	const todo = (e: Effect, why: string) => todos.push(`${e.summary.replace(/[.\s]+$/, '')}. Not made for you: ${why}`)
	for (const raw of effects) {
		const [tool, action] = parts(raw.call?.tool ?? '')
		const split = raw.call && action && action.toLowerCase() === String(raw.call.args.action ?? '').toLowerCase()
			? { ...raw, call: { ...raw.call, tool } } : raw
		const e = split.call ? { ...split, call: toolShape(split.call) } : split
		const why = refusal(cfg, e, pr)
		if (why) todo(e, why)
		else ok.push(isDeploy(e.call) ? { ...e, deploy: { ring: targetOf(cfg, pipelineOf(e.call))!.ring, pr: pr! } } : e)
	}
	const first = ok.find(e => isDeploy(e.call))
	if (!first) return { effects: ok, todos }
	for (const e of ok.filter(x => x !== first)) todo(e, `one change at a time with a deploy; propose it again after the deploy to ${first.deploy!.ring} is made`)
	return { effects: [first], todos }
}

// A PR that changed since the review: the owner reviews again before any vote. The page's "Review again" sends the same words.
export const reviewAgainCmd = (code: string) => `${code}: review again`
export const reviewAgain = (code: string, why: string) => `${why} Review again? Reply "${reviewAgainCmd(code)}", or "skip ${code}".`
export const asksReviewAgain = (code: string, question?: string) => !!question?.includes(`Reply "${reviewAgainCmd(code)}"`)

// The reply was written counting on refused changes, so it is not sent as it is: the owner changes it first.
export const refusedAsk = (code: string, n: number) => `The reply counts on ${n === 1 ? 'a change' : `${n} changes`} ${NAME} cannot make, listed as yours to do. Change the reply with "edit ${code}: <text>", or skip ${code}.`

// What each change does, in one line, for the AI's prompt and Settings.
const LINES: Record<string, [string, string]> = {
	[DEPLOY]: ['Deploy', `run a pipeline on "Where ${NAME} may deploy" with a PR's build as its resource`],
	'ado-repo_pull_request_thread_write': ['PR comment', 'comment on a pull request, or reply in one of its threads'],
	'ado-repo_pull_request_write:vote': ['PR vote', 'cast the owner\'s vote on a pull request: Approved, ApprovedWithSuggestions, WaitingForAuthor, Rejected, or NoVote'],
	'ado-repo_pull_request_write:update_reviewers': ['Add you as a PR reviewer', 'add the owner, and only the owner, as an optional reviewer on the item\'s pull request, so a review he was asked for can start'],
	'ado-wit_work_item_write:update': ['Work item update', 'change fields on one work item; the update must fail if the item changed since it was read'],
	'calendar-CreateEvent': ['Calendar invite', 'create a meeting on the owner\'s calendar and invite people'],
}
// The changes Delegate may propose by default, by server, each made after the owner's ok (R-HIL-29); setup offers them, and
// Settings shows each as a switch. Never offered: abandoning, completing or merging, bypassing policies, deleting, or creating
// or renaming a pipeline, so the PR tool is offered for its vote only and the work-item tool for its update only.
export const WRITE_DEFAULTS: Record<string, string[]> = { ado: ['repo_pull_request_thread_write', 'repo_pull_request_write:vote', 'wit_work_item_write:update'], calendar: ['CreateEvent'] }
// A change Settings may offer as a switch: never one of those, never a whole PR write tool (it also completes and abandons), and
// never a pipeline write; deploys are allowed by "Where Delegate may deploy", by pipeline ID.
export const offerable = (entry: string) => { const [tool, action] = parts(entry); return !/complet|merge|abandon|bypass|delete/i.test(entry) && !/pipelines?_write|run_?pipeline/i.test(tool) && !(/pull_?request_write$/i.test(tool) && !action) }

// A workplace's own changes describe themselves in site.json.
const line = (entry: string) => LINES[entry] ?? site().actions?.[entry]
export const changeName = (entry: string) => line(entry)?.[0] ?? entry
export const changeLine = (entry: string) => { const l = line(entry); return l ? `${entry}: ${l[1]}` : entry }

// What a PR change means, from Azure DevOps: its title and author, required reviewers, and whether an approval may complete it.
// A change's facts from Azure DevOps, for any kind: a PR's meaning, or a ring's runs (owned work).
// The page shows it in parts, a warning in its own tone (an approval that may complete the PR); text surfaces join them.
export type Meaning = { text: string; warn?: true }[]
export const prParts = (p: PrFacts): Meaning => [{ text: `"${p.title}" by ${p.author}` }, ...(p.required.length ? [{ text: `required reviewers: ${p.required.join(', ')}` }] : []), ...(p.autoComplete ? [{ text: 'autocomplete is on: your approval may complete it', warn: true as const }] : [])]
export const meaningParts = (e: Effect): Meaning | undefined => (e.pr ? prParts(e.pr) : e.ring ? ringParts(e.ring) : undefined)
export const meaningOf = (e: Effect) => meaningParts(e)?.map(p => p.text).join('; ')
export const prMeaning = (p: PrFacts) => prParts(p).map(x => x.text).join('; ')

// What the owner sees for a change, built only from the call that runs, never from the AI's words about it (review 10-21 P1-1).
// Known kinds read as a person would write them (golden master 10-21). Each names the arguments it shows; every other argument
// goes into detail exactly as it will be sent, so nothing that changes what the call does is hidden (review 10-21d P1).
// line: one line for lists and statuses; loc: where it lands (a file and line, a PR, a time); text: what it says; detail: the rest.
export type Shown = { line: string; loc: string; text: string; detail: string; system: string }
const str = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))
const VOTE_SAYS: Record<number, (pr: string) => string> = { 10: pr => `Approve ${pr}`, 5: pr => `Approve ${pr} with suggestions`, 0: pr => `Reset your vote on ${pr}`, [-5]: pr => `Wait for author on ${pr}`, [-10]: pr => `Reject ${pr}` }
// A time as sent, without its seconds, keeping any offset it carries.
const at = (v: unknown) => { const t = String(v ?? ''), z = /(Z|[+-]\d\d:?\d\d)$/.exec(t)?.[1]; return `${t.replace('T', ' ').slice(0, 16)}${z ? ` ${z}` : ''}` }
type Format = { line: string; loc: string; text?: string; keys: string[]; lines?: string[] }
function known(c: Call, pr: string, e?: Effect): Format | undefined {
	// pullRequestId is shown as "PR n" only when it is a number; otherwise it stays in detail as sent (review 10-21e P2-3).
	const a = c.args, action = a.action === undefined ? '' : String(a.action), prKey = pr ? ['pullRequestId'] : []
	// A deploy names its build, PR, commit, and ring; any resource besides the one build stays in detail as sent.
	if (isDeploy(c) && e) { const r = a.resources as Record<string, Record<string, unknown>> | undefined, only = !!r && Object.keys(r).length === 1 && Object.keys(Object.values(r)[0] ?? {}).length === 1; return { line: deployLine(e), loc: e.deploy?.ring ?? '', keys: ['action', 'pipelineId', ...(only ? ['resources'] : [])] } }
	if (isVote(c)) { const v = voteValue(c); return { line: v === undefined ? `Vote ${str(a.vote)} on ${pr}` : VOTE_SAYS[v](pr), loc: pr, keys: ['action', ...prKey, 'vote'] } }
	// Add me (review gate): the one reviewer change offered, said in words; any other shape is shown with every argument.
	if (/pull_?request_write$/i.test(c.tool) && /^update_reviewers$/i.test(action) && /^add$/i.test(String(a.reviewerAction ?? '')) && Array.isArray(a.reviewerIds) && a.reviewerIds.length === 1)
		return { line: `add ${str(a.reviewerIds[0])} as an optional reviewer on ${pr}`, loc: pr, keys: ['action', ...prKey, 'reviewerIds', 'reviewerAction'] }
	if (/pull_?request_thread/i.test(c.tool)) {
		// Only the actions a line can say in words; any other is shown with every argument (review 10-21e P2-1).
		if (!/^(create|reply)$|^update|status/i.test(action)) return undefined
		const keys = ['action', ...prKey]
		if (/status/i.test(action)) return { line: `set thread ${str(a.threadId)} to ${str(a.status)} on ${pr}`, loc: pr, keys: [...keys, 'threadId', 'status'] }
		// A comment whose words are not in content is shown with every argument, so its words are never lost.
		if (a.content === undefined) return undefined
		const reply = /reply/i.test(action), edit = /update/i.test(action), lineKey = a.rightFileStartLine !== undefined ? 'rightFileStartLine' : 'line'
		const what = reply ? `reply in thread ${str(a.threadId)}` : edit ? `edit comment ${str(a.commentId)} in thread ${str(a.threadId)}` : 'comment'
		const file = a.filePath === undefined ? '' : `${str(a.filePath)}${a[lineKey] === undefined ? '' : `:${str(a[lineKey])}`}`
		const where = [...(edit ? [`comment ${str(a.commentId)} in thread ${str(a.threadId)}`] : reply ? [`thread ${str(a.threadId)}`] : []), pr].join(', ')
		return { line: `${what} on ${pr}`, loc: file ? `${file}, ${where}` : where, text: str(a.content), keys: [...keys, 'content', ...(file ? ['filePath', lineKey] : []), ...(reply || edit ? ['threadId'] : []), ...(edit ? ['commentId'] : [])] }
	}
	if (/work_?item/i.test(c.tool) && /update/i.test(action) && Array.isArray(a.updates)) {
		// Each update as sent: its operation, its path, its value, and anything else it carries.
		const lines = (a.updates as Record<string, unknown>[]).map(u => { const { op, path, value, ...rest } = u; const more = Object.entries(rest).map(([k, x]) => `${k}: ${str(x)}`).join(', '); return `${op === undefined ? '' : `${str(op)} `}${str(path)}${value === undefined ? '' : `: ${str(value)}`}${more ? ` (${more})` : ''}` })
		return { line: `update work item ${str(a.id)}`, loc: `Work item ${str(a.id)}`, keys: ['action', 'id', 'updates'], lines }
	}
	if (/createevent/i.test(c.tool)) {
		const who = [...([] as unknown[]).concat(a.attendeeEmails ?? []), ...([] as unknown[]).concat(a.attendees ?? [])].map(str).join(', ')
		// Only the start and end keys shown are taken; a second one stays in detail as sent (review 10-21e P2-2).
		const startKey = a.startDateTime !== undefined ? 'startDateTime' : 'start', endKey = a.endDateTime !== undefined ? 'endDateTime' : 'end'
		const start = a[startKey], end = a[endKey], offset = /(Z|[+-]\d\d:?\d\d)$/.test(String(start ?? ''))
		const when = `${at(start)}${end === undefined ? '' : ` to ${at(end)}`}${a.timeZone !== undefined ? ` (${str(a.timeZone)})` : offset ? '' : " (your calendar's time zone)"}`
		const what = who ? `invite ${who} to "${str(a.subject)}"` : `create "${str(a.subject)}"`
		return { line: `${what}, ${when}`, loc: when, text: what[0].toUpperCase() + what.slice(1), keys: ['subject', startKey, endKey, 'timeZone', 'attendeeEmails', 'attendees'] }
	}
	return undefined
}
export function shown(e: Effect): Shown {
	const c = e.call
	if (!c) return { line: e.summary, loc: e.target, text: e.summary, detail: '', system: e.system }
	const a = c.args, action = a.action === undefined ? '' : String(a.action), id = prIdOf(c), pr = id === undefined ? '' : `PR ${id}`
	const name = LINES[`${c.tool}:${action}`]?.[0] ?? (LINES[c.tool] ? `${LINES[c.tool][0]}${action ? ` (${action})` : ''}` : `${c.tool.replace(/^[^-]*-/, '')}${action ? ` ${action}` : ''}`)
	const f = known(c, pr, e) ?? { line: `${name}${pr ? ` on ${pr}` : ''}`, loc: pr, keys: ['action', ...(pr ? ['pullRequestId'] : [])] }
	const rest = Object.entries(a).filter(([k]) => !f.keys.includes(k)).map(([k, x]) => `${k}: ${str(x)}`)
	return { line: f.line, loc: f.loc, text: f.text ?? f.line, detail: [...(f.lines ?? []), ...rest].join('\n'), system: c.tool.replace(/-.*$/, '') }
}
// "approve PR 4200001", and "You said you'd approve PR 4200001": the owner's own promise, from the calls that will run (Slice 3).
export const doLine = (effects: Effect[]) => effects.map(e => { const l = shown(e).line; return l[0].toLowerCase() + l.slice(1) }).join(' and ')
export const saidLine = (effects: Effect[]) => `You said you'd ${doLine(effects)}`
// Lists and statuses use words; the exact remaining arguments stay in Details.
export function changeSays(e: Effect): string {
	const x = shown(e), where = x.loc.split(', ').filter(p => p && !x.line.toLowerCase().includes(p.toLowerCase())).join(', ')
	const says = !x.line.toLowerCase().includes(x.text.toLowerCase()) ? `: ${x.text}` : ''
	return `${x.line}${where ? ` at ${where}` : ''}${says}`
}
