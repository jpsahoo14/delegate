import { stateFields } from '../core/upgrades.ts'
import { NAME } from '../brand.ts'
import { allows, effectLeftAction, isVote, prIdOf, sameHead, VOTES } from '../core/effects.ts'
import { leftRefusal, type LeftDraft } from '../core/left-lines.ts'
import { settingKey } from '../core/setting-keys.ts'
import type { Choices, Config, Effect, PrRole, PrUnit, ReadFailureKind, Report, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { prNumbersIn } from '../core/pr-refs.ts'
import { askPrs, prTarget, type BuildProbe, type PrRef, type PrState } from './probe.ts'
import { canonicalKey } from './jobs.ts'

// The owner's rule (10-23): Delegate reviews a pull request, or votes on it, only when someone asked him (his own command
// counts) and he is a reviewer: by name, required or optional and not declined, or as a member of a reviewer team that
// has not approved yet. Never on his own PR. A PR that cannot be read is not reviewed until it can be.
export const MAY_REVIEW: PrRole[] = ['reviewer', 'group']

const norm = (s = '') => s.trim().toLowerCase()
const unescapeGroup = (name: string) => name.replace(/\\([\[\]])/g, '$1').replace(/\\\\/g, '\\')
export function reviewerGroupLabel(name: string): string {
	return unescapeGroup(name).trim().replace(/^\[[^\]\r\n]+\]\\+\s*/, '')
		.replace(/\\([!"#$%&'()*+,\-.\/:;<=>?@\[\]\\^_`{|}~])/g, '$1')
		.replace(/\s*\([A-Za-z][A-Za-z0-9_-]*\)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()
}
export function reviewerGroupMatches(name: string, listed: string): boolean {
	return norm(listed) === norm(name) || norm(listed) === norm(name.split('\\').at(-1))
}

const isOwner = (cfg: Config, display?: string, unique?: string) => {
	const name = norm(cfg.owner.name), upn = norm(cfg.owner.upn)
	return upn && unique ? norm(unique) === upn : !!name && norm(display) === name
}
export function liveOwnerVote(cfg: Config, st: PrState): number | undefined {
	const named = st.reviewers ? st.reviewers.filter(r => !r.group && isOwner(cfg, r.name, r.unique))
		: st.votes.filter(v => isOwner(cfg, v.name))
	return named.length === 1 && Object.values(VOTES).includes(named[0].vote) ? named[0].vote : undefined
}
export function reviewerGroups(st: PrState): string[] | undefined {
	if (!st.reviewers) return undefined
	const labels = st.reviewers.filter(r => r.group).map(r => reviewerGroupLabel(r.name)).filter(Boolean)
	return [...new Map(labels.map(label => [norm(label), label])).values()]
}

export function ownerRole(cfg: Config, st: PrState, teams?: string[]): PrRole {
	if (isOwner(cfg, st.author, st.authorUnique)) return 'author'
	const all = st.reviewers ?? st.votes.map(v => ({ name: v.name, vote: v.vote, required: false, group: false, declined: false } as NonNullable<PrState['reviewers']>[number]))
	const me = all.filter(r => !r.group && isOwner(cfg, r.name, r.unique))
	if (me.length > 1) return 'ambiguous'
	if (me.length === 1) return me[0].declined ? 'declined' : 'reviewer'
	const groups = all.filter(r => r.group)
	if (!groups.length) return 'none'
	// A team reviewer is "[Project]\Team"; the owner's teams are read by name. A group that is not one of them (a security
	// group, or a team he is not in) cannot be told apart, so it is never taken as his, unless he confirmed it (queue-new #7C).
	const short = (n: string) => norm(n.split('\\').at(-1))
	const listed = (g: string, list?: string[]) => !!list?.some(x => reviewerGroupMatches(g, x))
	const mine = groups.filter(g => listed(g.name, cfg.owner.reviewerGroups) || !!teams?.some(t => norm(t) === short(g.name)))
	if (!mine.length) return groups.every(g => listed(g.name, cfg.owner.notReviewerGroups)) ? 'none' : 'group-unknown'
	return mine.some(g => g.vote < 5 && !g.declined) ? 'group' : 'group-approved'
}
// The PR's reviewer groups the owner has not said yes or no to: asked about once on the card (queue-new #7C).
export function unknownGroups(cfg: Config, st: PrState): string[] {
	const said = [...(cfg.owner.reviewerGroups ?? []), ...(cfg.owner.notReviewerGroups ?? [])]
	return (st.reviewers ?? []).filter(r => r.group && !said.some(x => reviewerGroupMatches(r.name, x))).map(r => r.name)
}

// The owner's teams per project, read at most hourly; a failed read is "not known", never "none".
const teamCache = new Map<string, { at: number; names: string[] }>()
export async function teamsFor(probe: BuildProbe | undefined, project: string, now = Date.now()): Promise<string[] | undefined> {
	const hit = teamCache.get(project)
	if (hit && now - hit.at < 3_600_000) return hit.names
	if (!probe?.myTeams) return undefined
	try { const names = await probe.myTeams(project); teamCache.set(project, { at: now, names }); return names } catch { return undefined }
}
export async function roleOn(cfg: Config, probe: BuildProbe | undefined, ref: PrRef, st: PrState): Promise<PrRole> {
	const first = ownerRole(cfg, st)
	return first === 'group-unknown' ? ownerRole(cfg, st, await teamsFor(probe, ref.project)) : first
}

// Someone asked the owner to review (or recheck, approve, look at) a PR. A message to the whole room counts only when it is about
// this PR: its number or link is in the same message. The owner's own words (an answer, his message in the thread) count too.
export const REVIEW_ASK = /\b(?:re-?review|review|re-?check|look at|take a look|have a look|approve|approval|sign[- ]?off|lgtm|can you check|could you check|please check|vote|waiting for (?:the )?author|wait for (?:the )?author|reject)\b/i
export function askExcludes(text: string, pr: number): boolean {
	return text.split(/(?<=[.!?])\s+|;|\s+(?=(?:but|except)\b)/i).some(clause => {
		if (!prNumbersIn(clause).includes(pr) && !new RegExp(`\\b${pr}\\b`).test(clause)) return false
		const negative = /\b(?:do\s+not|don't|dont|no\s+need\s+to|not|skip|except)\b/i.exec(clause)
		if (!negative) return false
		const after = clause.slice(negative.index + negative[0].length)
		return /^(?:skip|except)$/i.test(negative[0]) || REVIEW_ASK.test(after) || /\breviewing\b/i.test(after)
	})
}

export function requestedReviewPrs(store: Store, wf: Workflow, report: Pick<Report, 'reviewPrs' | 'job'>, text: string): Set<number> {
	const ask = new Set(askPrs(store, wf)), scalar = /^pr:.*?(\d+)$/i.exec(canonicalKey(report.job?.key ?? ''))
	const offered = report.reviewPrs ?? (scalar ? [Number(scalar[1])] : [])
	const valid = offered.filter(id => Number.isSafeInteger(id) && id > 0 && ask.has(id))
	if (valid.length !== offered.length) store.log({ event: 'review-request-dropped', code: wf.code, count: offered.length - valid.length })
	return new Set(valid.filter(id => reviewAsked(store, wf, id) && !askExcludes(text, id)))
}

export function reviewAsked(store: Store, wf: Workflow, pr: number, current = false): boolean {
	const ids = new Set(wf.prs && !current ? [...wf.msgIds, ...wf.pending] : wf.pending)
	const pending = store.thread(wf.id).filter(m => ids.has(m.id))
	const own = [wf.ownerAnswer ?? '', ...pending.filter(m => m.byOwner).map(m => m.text)].some(t =>
		REVIEW_ASK.test(t) && (!current || !prNumbersIn(t).length || prNumbersIn(t).includes(pr)))
	if (own || wf.startedBy === 'owner' && REVIEW_ASK.test(wf.lastAsk ?? '')) return true
	const theirs = pending.filter(m => !m.byOwner)
	const about = (t: string) => new RegExp(`(?:\\bPR\\s*#?\\s*${pr}\\b|pullrequest/${pr}\\b|\\b${pr}\\b)`, 'i').test(t)
	if (theirs.some(m => REVIEW_ASK.test(m.text) && (wf.startedBy !== 'room' || about(m.text)))) return true
	// A room ask split over two messages (#22): "please review" and the PR's link from the same person within a few minutes,
	// in either order, is one ask. A link alone, or someone else's ask, still is not.
	if (wf.startedBy !== 'room') return false
	const said = store.thread(wf.id).filter(m => !m.byOwner)
	return theirs.filter(m => about(m.text)).some(link => said.some(ask => ask.id !== link.id && ask.from.id === link.from.id && REVIEW_ASK.test(ask.text) && Math.abs(Date.parse(ask.at) - Date.parse(link.at)) <= SPLIT_ASK_MS))
}
const SPLIT_ASK_MS = 15 * 60_000

export type Gate = { ok: true } | { ok: false; role: PrRole | 'unread' | 'not-asked'; status: string; question: string; note?: string; addMe?: Effect }
type DeclinedUnit = Extract<Gate, { ok: false }> & { role: PrRole | 'not-asked' }
export type UnitGate = { ok: true } |
	{ ok: false; reason: 'checking' | 'couldnt-read' | 'gave-up' | 'owner' | 'no-link' } |
	{ ok: false; reason: 'declined'; gate: DeclinedUnit }

export function readFailureReason(kind?: ReadFailureKind): string | undefined {
	switch (kind) {
		case 'auth': return 'Azure DevOps refused access'
		case 'not-found': return "Azure DevOps can't find it"
		case 'no-status': return 'Azure DevOps sent an incomplete answer'
		case 'network': return `${NAME} couldn't reach Azure DevOps`
		default: return undefined
	}
}

export function unitOutcome(unit: PrUnit): {
	outcome: 'checking' | 'reviewing' | 'reviewed' | 'not-reviewing' | 'couldnt-read' | 'gave-up'
	reason?: PrRole | ReadFailureKind | 'not-asked' | 'owner' | 'no-link' | 'moved'
} {
	if (!unit.requested) return { outcome: 'not-reviewing', reason: 'not-asked' }
	if (unit.skip) return { outcome: 'not-reviewing', reason: unit.skip.why }
	if (unit.decline) return { outcome: 'not-reviewing', reason: unit.decline.role }
	const review = unit.review, completed = review?.completed
	if (completed || review?.done) {
		const head = completed?.head ?? review?.done?.head
		return { outcome: 'reviewed', ...(completed?.verified === false || !sameHead(unit.head, head) ? { reason: 'moved' as const } : {}) }
	}
	if (unit.read === 'failed') return { outcome: 'couldnt-read', reason: unit.failureKind ?? 'other' }
	if (unit.read === 'gave-up') return { outcome: 'gave-up', reason: unit.failureKind ?? 'other' }
	if (unit.read !== 'ok') return { outcome: 'checking' }
	return { outcome: unit.job || review?.run ? 'reviewing' : 'checking' }
}

export function reviewUnitGate(store: Store, cfg: Config, wf: Workflow, unit: PrUnit): UnitGate {
	if (!unit.requested) return { ok: false, reason: 'declined', gate: notAsked(unit.id) }
	if (unit.skip) return { ok: false, reason: unit.skip.why }
	if (unit.read === 'failed') return { ok: false, reason: 'couldnt-read' }
	if (unit.read === 'gave-up') return { ok: false, reason: 'gave-up' }
	if (unit.read !== 'ok' || !unit.ref || !unit.role) return { ok: false, reason: 'checking' }
	const gate = roleGate(cfg, wf, unit.ref, unit.role, unit.title)
	return gate.ok ? gate : { ok: false, reason: 'declined', gate }
}

const notAsked = (pr: number): DeclinedUnit => ({ ok: false, role: 'not-asked', status: `Not reviewing PR ${pr}: nobody asked you to review it`,
	question: `Nobody asked you to review PR ${pr}. Answer "review it" to have ${NAME} review it, or skip.` })

// The decision, from the role this turn's PR read stored on the item (probePRs runs before every reply run). With no Azure DevOps
// reader set up at all, the reviewer check cannot run; the ask check still does, and no vote can be cast there (change.ts).
export function reviewGate(store: Store, cfg: Config, wf: Workflow, ref: PrRef, title?: string, canRead = true): Gate {
	const pr = ref.id
	if (!reviewAsked(store, wf, pr)) return notAsked(pr)
	const role = wf.prUnknown && !wf.prRole ? undefined : wf.prRole
	if (!role && !canRead) return { ok: true }
	if (!role) return { ok: false, role: 'unread', status: `Checking you're a reviewer on PR ${pr}: it could not be read; ${NAME} tries again at the next check`, question: `${NAME} could not read PR ${pr} to check you are a reviewer. It tries again by itself; answer to try now, or skip.` }
	return roleGate(cfg, wf, ref, role, title)
}

function roleGate(cfg: Config, wf: Workflow, ref: PrRef, role: PrRole, title?: string): { ok: true } | DeclinedUnit {
	const pr = ref.id, who = wf.asker?.name.split(' ')[0] ?? 'They'
	if (MAY_REVIEW.includes(role)) return { ok: true }
	const name = title ? ` "${title}"` : ''
	if (role === 'author') return { ok: false, role, status: `Not reviewing: PR ${pr} is yours`, question: `${who} wrote about your PR${name}. A review or vote on your own PR is never made; answer with what to do, or skip.` }
	if (role === 'declined') return { ok: false, role, status: `Not reviewing: you declined PR ${pr} in Azure DevOps`, question: `${who} asked you to review PR ${pr}${name}, which you declined in Azure DevOps. Reply without reviewing, or skip.` }
	const addMe = addMeEffect(cfg, wf, ref)
	const why = roleWhy(cfg, role)
	const status = role === 'group-approved' ? `Not reviewing: your group already approved PR ${pr}` : `Not reviewing: you aren't a reviewer on PR ${pr} (${why})`
	return { ok: false, role, status, ...(addMe
		? { question: '', note: `${who} asked you to review PR ${pr}${name}, but ${why}. Approve adding you as an optional reviewer, and the review then starts. To answer without reviewing, reply with what to say, or skip.`, addMe }
		: { question: `${who} asked you to review PR ${pr}${name}, but ${why}. Add yourself as a reviewer in Azure DevOps${cfg.owner.upn ? ' (or allow "repo_pull_request_write:update_reviewers" in Settings)' : ''}, and the review starts by itself; or reply without reviewing, or skip.` }) }
}

// A review job: the worker's pr: key, or a review of the item's PR under another name.
export const isReviewJob = (key: string, intent?: string) => /^pr:/i.test(key.trim()) || intent === 'pr_review'

// Not reviewing, applied to the item: no job, the reason as its status, and the question (with Add me when it can be made).
// A room message (nobody asked him, or a room ask while he is not a reviewer: G8, G9) is context, closed quietly with the reason.
export function decline(store: Store, cfg: Config, wf: Workflow, ref: PrRef | undefined, gate: Extract<Gate, { ok: false }>) {
	const at = new Date().toISOString(), pr = ref?.id ?? 0
	store.log({ event: 'review-declined', workflowId: wf.id, code: wf.code, pr, role: gate.role })
	const quiet = wf.startedBy === 'room' && gate.role !== 'unread'
	if (quiet) {
		Object.assign(wf, { ...stateFields(wf, 'done'), closedBy: 'nothing', status: gate.status, pending: [], question: undefined, questionHint: undefined, draft: undefined, effects: undefined, promised: undefined, job: undefined, reviewDecline: { pr, role: gate.role, at, ask: wf.lastAsk } })
		return
	}
	// With Add me there is no open question: ok makes that one change (an open question would hold ok back).
	Object.assign(wf, { ...stateFields(wf, 'needs_human'), status: gate.status, question: gate.question || undefined, questionHint: undefined, pending: [], draft: undefined, promised: undefined, effects: gate.addMe ? [gate.addMe] : undefined, reviewDecline: { pr, role: gate.role, at, ask: wf.lastAsk }, revAt: at, newCount: 0,
		context: gate.note ? [{ label: 'Not reviewing', text: gate.note, tone: 'warn' as const }] : undefined })
}

// A vote is offered only on a PR the owner may review: a vote by a non-reviewer adds him to the PR (G7, G11). Any other vote
// becomes a to-do with the reason, as a change the owner does not allow does.
export function voteGate(store: Store, cfg: Config, wf: Workflow, effects: Effect[], todos: string[], checkAsk = true, left: LeftDraft[] = []): Effect[] {
	if (!effects.some(e => isVote(e.call))) return effects
	if (wf.prs) return effects.filter(effect => {
		if (!isVote(effect.call)) return true
		const pr = prIdOf(effect.call), unit = wf.prs?.find(unit => unit.id === pr)
		const why = !unit ? 'the vote names no PR in this ask'
			: checkAsk && !(wf.intent === 'pr_review' ? unit.requested : reviewAsked(store, wf, unit.id)) ? `nobody asked you to review PR ${unit.id}`
			: unit.read !== 'ok' || !unit.role ? `PR ${unit.id} has not passed the reviewer check`
			: !MAY_REVIEW.includes(unit.role) ? roleWhy(cfg, unit.role) : undefined
		if (!why) return true
		todos.push(`${effect.summary.replace(/[.\s]+$/, '')}. Not made for you: ${why}`)
		const group = unit?.role === 'group-unknown'
		left.push(leftRefusal(effectLeftAction(effect, pr), group ? 'setting-off' : 'pr-lifecycle',
			{ why, ...(group ? { setting: settingKey('reviewerGroups') } : {}) }))
		store.log({ event: 'vote-gated', workflowId: wf.id, code: wf.code, pr, role: unit?.role, why })
		return false
	})
	const pr = prTarget(store, wf) ?? 0
	const why = checkAsk && !reviewAsked(store, wf, pr) ? `nobody asked you to review PR ${pr}` : wf.prRole && !MAY_REVIEW.includes(wf.prRole) ? roleWhy(cfg, wf.prRole) : undefined
	if (!why) return effects
	for (const e of effects.filter(e => isVote(e.call))) {
		todos.push(`${e.summary.replace(/[.\s]+$/, '')}. Not made for you: ${why}`)
		const group = wf.prRole === 'group-unknown'
		left.push(leftRefusal(effectLeftAction(e, pr), group ? 'setting-off' : 'pr-lifecycle',
			{ why, ...(group ? { setting: settingKey('reviewerGroups') } : {}) }))
	}
	store.log({ event: 'vote-gated', workflowId: wf.id, code: wf.code, pr, role: wf.prRole, why })
	return effects.filter(e => !isVote(e.call))
}
export const roleWhy = (cfg: Config, role: PrRole) => role === 'author' ? 'the PR is yours' : role === 'declined' ? 'you declined it in Azure DevOps'
	: role === 'group-approved' ? 'your team already approved it' : role === 'group-unknown' ? `${NAME} cannot tell whether you are in the group that reviews it`
	: role === 'ambiguous' ? `two reviewers there are named ${cfg.owner.name}` : role === 'none' ? 'you are not on its reviewer list' : 'you are a reviewer'

// The one change that may fix it: add the owner, and only the owner, as an optional reviewer on this item's PR, after one ok.
export function addMeEffect(cfg: Config, wf: Workflow, ref: PrRef): Effect | undefined {
	if (!cfg.owner.upn) return undefined
	const call = { tool: 'ado-repo_pull_request_write', args: { action: 'update_reviewers', project: ref.project, repositoryId: ref.repo, pullRequestId: ref.id, reviewerIds: [cfg.owner.upn], reviewerAction: 'add' } }
	if (!allows(cfg.agent.effectTools, call)) return undefined
	return { system: 'azure devops', action: 'add reviewer', target: `PR ${ref.id}`, summary: `Add you as an optional reviewer on PR ${ref.id}`, call }
}
export const isAddMe = (e?: Effect) => e?.call?.args.action === 'update_reviewers' && e.call.args.reviewerAction === 'add'
type GroupAsk = NonNullable<Workflow['groupAsk']>
export type GroupChoices = Choices & { options: { label: string; value: string }[] }
export function groupQuestion(ask: GroupAsk): string {
	const labels = ask.groups.map(reviewerGroupLabel)
	const names = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}` : labels.join('')
	return `Which of these review groups on PR ${ask.pr} are you in: ${names}? Say the names, or none.`
}
export function groupChoices(ask: GroupAsk): GroupChoices {
	return { prompt: `Which of these review groups on PR ${ask.pr} are you in?`, multi: true, other: false,
		options: [...ask.groups.map(value => ({ label: reviewerGroupLabel(value), value })), { label: 'None of these', value: '' }] }
}

// Values remain full server names. A cleaned-label collision requires a full name or a numbered pick.
export function groupSelection(ask: GroupAsk, input: { nums?: number[]; text?: string }): string[] | undefined {
	if (input.nums !== undefined) {
		const nums = [...new Set(input.nums)], none = ask.groups.length + 1
		if (!nums.length || nums.some(n => !Number.isInteger(n) || n < 1 || n > none) || nums.includes(none) && nums.length !== 1) return undefined
		return nums[0] === none ? [] : ask.groups.filter((_, i) => nums.includes(i + 1))
	}
	const normalize = (text: string) => unescapeGroup(text).replace(/\r?\n/g, ',').replace(/[ \t]+/g, ' ').trim().toLowerCase()
	let rest = normalize(input.text ?? '')
	if (/^(?:none(?: of (?:these|them))?)[.!]?$/.test(rest)) return []
	const yes = /^(?:yes|yeah|yep|y|i am)[.!]?$/.test(rest), no = /^(?:no|nope|n|i'm not|i am not)[.!]?$/.test(rest)
	if (yes || no) return ask.groups.length === 1 ? yes ? [...ask.groups] : [] : undefined
	const aliases = ask.groups.flatMap((value, index) => [...new Set([reviewerGroupLabel(value), unescapeGroup(value)].map(normalize))]
		.filter(Boolean).flatMap(label => [label, `"${label}"`, `'${label}'`].map(text => ({ text, index }))))
	const selected = new Set<number>()
	while (rest) {
		const matching = aliases.filter(a => rest.startsWith(a.text) && (!rest.slice(a.text.length) || /^(?:\s*[,;]\s*|\s+and\s+|\s*\+\s*)/.test(rest.slice(a.text.length))))
		const length = Math.max(0, ...matching.map(a => a.text.length)), hits = [...new Set(matching.filter(a => a.text.length === length).map(a => a.index))]
		if (hits.length !== 1) return undefined
		selected.add(hits[0]); rest = rest.slice(length)
		if (!rest) break
		rest = rest.replace(/^(?:\s*[,;]\s*|\s+and\s+|\s*\+\s*)/, '')
		if (!rest) return undefined
	}
	return selected.size ? ask.groups.filter((_, i) => selected.has(i)) : undefined
}
