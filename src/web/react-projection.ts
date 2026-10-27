import { BUSY, type Store } from '../store/state.ts'
import { amendActions } from '../store/actions.ts'
import type { Parsed } from '../core/verbs.ts'
import { parseVerbs } from '../core/verbs.ts'
import { hashOf } from '../knowledge/format.ts'
import { card, knowledge as knowledgeCard, readingOf, view, who as displayWho, type ItemCard, type SourceRow, type Who } from './view.ts'
import { every, firstLeft, nextView, ownerDay, snapshot as placementSnapshot, place, todoHeadline, type NextRow } from './next.ts'
import { DEFAULT_POLL } from '../core/schedule.ts'
import { wddView } from './wdd.ts'
import { emptyEntities, IMAGE_TOKEN, snapshotSchema, type Action, type Intent, type Snapshot } from './react/domain/contracts.ts'
import { knowledgeOf } from '../runner/proposals.ts'
import { find, teamsMessage } from './model/find.ts'
import { freshOf, rowMark } from './model/derive.ts'
import { NAME } from '../brand.ts'
import { toolServerKey, toolsView } from './settings.ts'
import { ignoreServer, retryServer } from '../runner/catalog.ts'
import { reviewWaitOf, whyWaited } from '../core/policy.ts'
import { ruleLines, ruleTextHash } from '../store/rules.ts'
import { cardContext, cardFacts, itemReview, itemReviews, jobStopOf, reviewApproval } from '../core/card-facts.ts'
import { legacyEffectOrigins, normalizeReport } from '../core/normalize-report.ts'
import { actionClaimConfirmation, actionClaimGap, actionClaimReview } from '../core/action-claims.ts'
import { usedLines } from './numbers.ts'
import { displayedAt, needsOrder } from './react/domain/needs-order.ts'
// #50 (SEND 7533bea1): the status an item gets when its comments were repaired and wait to be posted.
const REPAIRED = 'The comment format was wrong and is fixed. Post them now?'
// R12b: ways.ts's stubs throw exactly "not yet" until the engine lands; anything else is a real failure, logged by its shape (its error
// class) at most once an hour, never its message.
const notYet = (error: unknown) => error instanceof Error && error.message === 'not yet'
let waysFailedAt = 0
function waysFailed(store: Store, fn: string, error: unknown) {
	if (Date.now() - waysFailedAt < 3_600_000) return
	waysFailedAt = Date.now()
	try { store.log({ event: 'ways-failed', fn, kind: error instanceof Error ? error.name : typeof error }) } catch { /* best effort */ }
}
// R10b (joint C2): Approve's meaning line, shown under the bar whichever role Approve has.
const APPROVE_PR_MEANING = 'Approves as you. The PR is unchanged since the review.'
// D-COST New-COST-1: HOST-COST-1's page verb for one more run (PE §8.3/§8.4), declared; the Verb union carries it once HOST's
// reviewed types are merged, and this cast goes then.
const ONE_MORE = 'one-more' as string as Parsed['verb']
// 0.2.43 (PE A R22): the words card-state builds its warn and strip from go through the same id net as the page's text, so no id or
// key=value pair reaches a warn line (and checkCard's "the warning leaks an id" stops). Digests and times are left as they are.
function scrubFacts(f: CardFacts): CardFacts {
	const net = (s?: string) => s === undefined ? s : idNet(s)
	return {
		...f,
		...(f.question ? { question: { ...f.question, text: idNet(f.question.text) } } : {}),
		...(f.failure ? { failure: { ...f.failure, why: idNet(f.failure.why), tried: f.failure.tried.map(idNet) } } : {}),
		...(f.hold ? { hold: { ...f.hold, text: idNet(f.hold.text) } } : {}),
		...(f.notSent ? { notSent: { why: idNet(f.notSent.why) } } : {}),
		...(f.working ? { working: { ...f.working, what: idNet(f.working.what) } } : {}),
		...(f.held ? { held: { ...f.held, reasons: f.held.reasons.map(r => ({ ...r, ...(r.changed ? { changed: net(r.changed) } : {}), ...(r.why ? { why: net(r.why) } : {}) })) } } : {}),
		...(f.yourStep ? { yourStep: { ...f.yourStep, what: idNet(f.yourStep.what) } } : {}),
		...(f.promiseFailed ? { promiseFailed: idNet(f.promiseFailed) } : {}),
		...(f.commitment?.promise ? { commitment: { promise: idNet(f.commitment.promise) } } : {}),
		...(f.warns ? { warns: f.warns.map(idNet) } : {}),
		...(f.voteGap ? { voteGap: { ...f.voteGap, text: idNet(f.voteGap.text) } } : {}),
	}
}
import { cardState, checkCard, failLine, type ActionKind, type CardFacts, type JobStop } from '../core/card-state.ts'
import { policyContext } from '../runner/autosend.ts'
import { isPersona } from '../core/intake.ts'
import { PAGE_REPLY_CHANGED, automationApprovalRev, pageChangeId, pageDigest, pageOptionId, leftRev, proposalApprovalRev, workflowApprovalRev } from '../core/page-approval.ts'
import type { Config, Effect, PageApproval, Workflow } from '../core/types.ts'
import { PAGE_CONTROL_VERBS } from '../core/types.ts'
import { effectCapability, isVote, meaningParts, pendingEffects, prIdOf, refusal, sameHead, shown, voteValue } from '../core/effects.ts'
import { byDate, forPage, sourceChip } from './model/format.ts'
import { isNew, itemSeen, newCount, seenIn, sinceOf } from './model/derive.ts'
import { byEnd, watchItemTarget, watchTarget } from '../runner/track.ts'
import { watchChannel, actResult } from '../mcp/server.ts'
import { answerAutomation, propose as proposeAutomation } from '../runner/automations.ts'
import { report as reportProblem } from '../store/feedback.ts'
import { messageLink, parseChannelLink, teamsChat } from '../adapters/channels.ts'
import { BY, newReminder, peopleOf } from './model/forms.ts'
import { approvedReplyText, currentDraft, reopenable, signatureOf } from '../core/policy.ts'
import { madeBefore, maybeOf } from '../runner/ledger.ts'
import { stillApproved } from '../runner/jobs.ts'
import { prOf, prTarget } from '../runner/probe.ts'
import { aboutPr } from '../runner/apply.ts'
import { findingFor } from '../runner/review-autonomy.ts'
import { stopFromAction, WAY_CHANGED, acceptSuggestion, addLine, answerLine, confirmLine, deleteLine, readLineAgain, deleteNote, dismissSuggestion, editLine, limitsCard, linesToCheck, makeNoteLine, needsHim, reconsiderSuggestion, restoreLine, setLineOff, suggestions, undoAcceptSuggestion, undoDismiss, wayLines, wayNotes, type WayTurnedDown, type WayWriteResult } from '../core/ways.ts'
import { APPROVAL_WORD, voteMention } from '../core/vote-claims.ts'
import { personName } from '../core/format.ts'
import { placeOf } from './model/place.ts'
import { leftSourceWords, leftWords } from './model/left-words.ts'
import { groupChoices, unitOutcome } from '../runner/review-gate.ts'
import { restoreOffRecord } from '../runner/offrecord.ts'
import { chatIdNet, idNet, pageText, takePageTextLeaks } from './page-text.ts'
import { pageManagementRev, workflowManagementRev } from '../store/page-revision.ts'
import { active, isNonAdoPrLink, openLeft, pendingParts, voteClaimGap, voteSentences } from '../runner/work.ts'
import { heldBy } from '../runner/owner.ts'
import { voteClaimReview } from '../runner/vote-claim.ts'
import { voteHold } from '../core/owner-send.ts'
import { dismissKey, habitUndoable, undoMs } from '../runner/habits.ts'
import { scrub } from '../core/secrets.ts'

type Immediate = { accepted: boolean; text: string }
// WYS N1-3 (I32, PE 16:25:46Z I-a): a page approval on an origin-bearing revision names exactly the changes he ticked (include, by
// pageChangeId) and, past the consistency check, the Send anyway token (actionClaimReview). They ride with the parsed verb to the answer.
export type PageParsed = Parsed & { include?: string[]; actionClaimReview?: string }
export type Binding = { action: Action; resolve: (input: Intent['input']) => PageParsed; execute?: (input: Intent['input']) => Immediate; management?: boolean }
export class IntentError extends Error {
	readonly status: number
	constructor(status: number, message: string) { super(message); this.status = status }
}
const safeLink = (link?: string) => link && /^https:/i.test(link) ? link : undefined
const requiredText = (input: Intent['input']) => {
	if (!input?.text?.trim()) throw new IntentError(422, 'Enter your text first.')
	return input.text
}
const failedJobDirections = (workflow?: Workflow) => workflow?.status?.startsWith('The job did not finish:') &&
	workflow.question === `Answer ${workflow.code} to retry with directions, or skip it`
const ownerOf = (who: string) => who === 'you' ? { kind: 'you' as const } : who === 'me' ? { kind: 'delegate' as const } : { kind: 'others' as const, text: who === 'them' ? 'Others' : who }
const presentationRev = (workflow: Workflow, cfg: Config): string => {
	const rev = workflowApprovalRev(workflow), draft = workflow.draft
	if (workflow.state !== 'needs_human' || !draft) return rev
	const text = approvedReplyText(draft.text, workflow, cfg)
	return text === draft.text ? rev : pageDigest([rev, text])
}

// The Settings tab names a marked chat's "Mark normal again" action by this key, without building the page (bug 10-23 perf).
function knownMessageCode(store: Store, link: string): string | undefined {
	const message = teamsMessage(link)
	return message ? store.workflows().find(item => item.chat.id === message.chat && (item.msgIds.includes(message.msg) || item.lastMsgId === message.msg))?.code : undefined
}

// A card whose state breaks an invariant is logged once per revision in this process (engineer-card-state-devspec.md §4).
const brokenSeen = new Set<string>()
// A chat id caught by the page-text net (L3b) is logged by shape only, at most once an hour in this process.
let leakLoggedAt = 0
// L3c: an image pasted in a message ([image: <alt> <Graph URL>], or one that can't be opened) is one token on the page, never its URL.
// Copy-on-write, so the store's own text, which the worker's image reader needs, is never touched. Drafts are left alone: their text
// is what Send sends.
const IMAGE = /\[image\b[^\]\n]*\]/gi
function imageTokens<T>(value: T): T {
	if (typeof value === 'string') return (/\[image\b/i.test(value) ? value.replace(IMAGE, IMAGE_TOKEN) : value) as T
	if (Array.isArray(value)) {
		let out: unknown[] | undefined
		value.forEach((v, i) => { const n = imageTokens(v); if (n !== v) (out ??= [...value])[i] = n })
		return (out ?? value) as T
	}
	if (value && typeof value === 'object') {
		let out: Record<string, unknown> | undefined
		for (const [k, v] of Object.entries(value)) { const n = imageTokens(v); if (n !== v) (out ??= { ...(value as Record<string, unknown>) })[k] = n }
		return (out ?? value) as T
	}
	return value
}
// L3d: the short day of an earlier ask: the weekday within the week, else the day and month ("Tue", "Tue 15 Oct").
function shortDay(iso: string): string {
	const at = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso)
	if (!Number.isFinite(at.getTime())) return iso
	const recent = Math.abs(Date.now() - at.getTime()) < 6 * 86_400_000
	return at.toLocaleDateString('en-GB', recent ? { weekday: 'short' } : { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
}
export const chatLevelKey = (chatId: string) => `chat:${hashOf(chatId)}`
export const chatNormalActionId = (chatId: string) => `${chatLevelKey(chatId)}/chat-normal`

// `only` projects one item's thread (its home and parts, which the page places together): the same body, fed only those workflows
// and their jobs, so a page action reads that thread and not the whole store (#27 step 2). Its item actions match the full projection's;
// page-wide parts (knowledge, tiles, counts, Done from the logs) are left out.
// A37 (b) / PM A R37: a vote-claim hold names its words. One rule for the card, the live check on edited text and Send: SEND's
// shared classifier (voteMention, aboutPr, voteClaimGap over voteSentences). <words> is the first unsupported claim's clause exactly as
// written (SEND's clause split), at most ~60 characters with "…" at the cut edges; quote is that text without the "…", to highlight.
export type VoteClaim = { line: string; confirm: string; words: string; quote: string; pr?: number }
const lastKnownVoteOf = (wf: Workflow) => { try { const read: unknown = wf.prRead ? JSON.parse(wf.prRead) : undefined; return Array.isArray(read) && typeof read[0] === 'number' ? { pr: read[0], ...(typeof read[3] === 'number' ? { vote: read[3] } : {}), ...(typeof read[2] === 'string' ? { head: read[2] } : {}) } : undefined } catch { return undefined } }
// Centres the quote on the vote word: SEND's APPROVAL_WORD (vote-claims.ts) plus voteMention's other vote words (PE nit, 09:12).
const VOTE_WORD = new RegExp(String.raw`(?:${APPROVAL_WORD.source})|\breject(?:ed|ion)?\b|\brequested changes\b|\bwaiting (?:for|on) (?:the )?author\b|\bmy vote\b`, 'i')
function clip(clause: string): { words: string; quote: string } {
	if (clause.length <= 60) return { words: clause, quote: clause }
	const at = VOTE_WORD.exec(clause)?.index ?? 0
	let start = Math.max(0, Math.min(at - 20, clause.length - 60)), end = Math.min(clause.length, start + 60)
	if (start > 0 && /\S/.test(clause[start - 1])) start = Math.min(at, clause.indexOf(' ', start) + 1 || start)
	if (end < clause.length && /\S/.test(clause[end])) end = Math.max(clause.lastIndexOf(' ', end), at + 1)
	const quote = clause.slice(start, end).trim()
	return { words: `${start > 0 ? '…' : ''}${quote}${end < clause.length ? '…' : ''}`, quote }
}
function voteClaimOf(store: Store, wf: Workflow, text: string): VoteClaim | undefined {
	if (!voteMention(text) || !aboutPr(store, wf, text)) return undefined
	const effects = wf.effects ?? [], last = lastKnownVoteOf(wf)
	const gap = voteClaimGap(text, effects, last)
	if (!gap) return undefined
	const owner = store.config().owner.name ?? ''
	const claims = [...new Set(voteSentences(text, owner).filter(said => said.kind === 'owner').map(said => said.sentence))].filter(sentence => voteClaimGap(sentence, effects, last))
	const sentence = claims[0] ?? text
	const clause = sentence.split(/[,;\u2014\u2013:]\s*(?:(?:but|and)\s+)?/i).map(part => part.trim()).find(part => voteMention(part) && voteSentences(part, owner).some(said => said.kind === 'owner')) ?? sentence.trim()
	const { words, quote } = clip(clause), more = claims.length - 1
	const pr = gap.pr === undefined ? 'this PR' : `PR ${gap.pr}`, also = more > 0 ? ` (and ${more} more place${more === 1 ? '' : 's'})` : ''
	const approving = gap.claim === 'approval' || gap.claim >= 5
	const reads = approving ? 'approving' : gap.claim === -10 ? /\brequested changes\b/i.test(clause) ? 'asking for changes' : 'rejecting it' : gap.claim === -5 ? 'waiting for the author' : 'removing your vote'
	return {
		line: approving ? `Your reply says "${words}"${also}, which reads as approving ${pr}, but ${NAME} won't approve it. Change those words first.`
			: `Your reply says "${words}"${also}, which reads as ${reads}, but ${NAME} won't vote on ${pr}. Change those words first.`,
		confirm: `Send anyway? ${NAME} reads "${words}" as ${approving ? `approving ${pr}` : reads === 'rejecting it' ? `rejecting ${pr}` : `${reads} on ${pr}`}.`,
		words, quote, ...(gap.pr !== undefined ? { pr: gap.pr } : {}),
	}
}
// PM A R38 (1): an engine question's chat hint ('Answer "A34: nudge them" for a drafted follow-up, "wait A34: 3d", or "close A34".') is
// chat syntax: the page shows the question without it (forPage drops it), and a quoted answer to this item ("<code>: <answer>", the
// chat's answer form) becomes a choice chip; commands ("wait A34: 3d", "close A34") are dropped. Until the engine stores the question
// and its hint separately (PE/SEND).
const answerChips = (code: string, question?: string) => [...new Set([...(question ?? '').matchAll(new RegExp(`"${code}:\\s*([^"]{1,60})"`, 'gi'))].map(match => match[1].trim()).filter(Boolean))]
	.map(text => ({ label: text.replace(/^./, first => first.toUpperCase()), text }))
// H1 (decision 57): the engine now stores the suggested answers apart from the question (wf.questionHint); a record that has the field
// gets its chips from it, and only while its question is non-empty (CR 10:17:09Z: a hint left after a cleared question stays inert). The
// quote match above is kept only for older records written before the split (no questionHint field at all).
const hintChips = (wf: Workflow, code: string, question?: string) => wf.questionHint === undefined ? answerChips(code, question)
	: wf.question?.trim() ? [...new Set((wf.questionHint.answers ?? []).map(text => text.trim()).filter(Boolean))].map(text => ({ label: text.replace(/^./, first => first.toUpperCase()), text })) : []
// The live re-check on edited text (POST /api/v1/vote-check): the same rule, on the text he is typing, for an item waiting on him.
// WYS (S1-4/S1-5, W4): with the ticked set (include), also SEND's consistency check on the same words, and the exact Send anyway token
// for them; without text it checks the stored draft, the words Send would send. Old originless revisions keep the engine's own check.
export type ActionCheck = { line: string; confirm: string; review: string; effectIds: string[] }
export function voteCheck(store: Store, code: string, text?: string, include?: string[]): { claim?: VoteClaim; action?: ActionCheck } {
	const wf = store.byCode(code)
	if (!wf || wf.state !== 'needs_human') return {}
	const words = text ?? wf.draft?.text ?? ''
	const claim = text === undefined ? undefined : voteClaimOf(store, wf, words)
	const gap = include && !legacyEffectOrigins(wf) ? actionClaimGap(words, wf.effects ?? [], include) : undefined
	return { ...(claim ? { claim: { ...claim, line: pageText(claim.line), confirm: pageText(claim.confirm) } } : {}),
		...(gap ? { action: { line: pageText(gap.why), confirm: pageText(actionClaimConfirmation(gap)), review: actionClaimReview(wf, words, include!), effectIds: gap.effectIds } } : {}) }
}

export function reactProjection(store: Store, query = '', visit?: { since?: string; fallbackSince: string }, opts: { only?: string } = {}): { snapshot: Snapshot; bindings: Map<string, Binding> } {
	const onlyWfs = opts.only && store.byCode(opts.only) ? store.itemThread(opts.only) : undefined
	const stored = placementSnapshot(store, undefined, onlyWfs)
	const usedOf = usedLines(store)
	const facts = { ...stored, workflows: stored.workflows.map(workflow => currentDraft(workflow, workflow.job ? stored.jobs.get(workflow.job) : undefined) === workflow.draft ? workflow : { ...workflow, draft: undefined }) }
	const placed = place(facts), placementOf = new Map(placed.map(placement => [placement.code, placement])), cfg = store.config()
	// A first visit has no cursor; its newly written lastViewed mark is not one.
	const since = visit ? visit.since : store.lastViewed()
	const base = view(store, since, new Date(facts.now), facts.workflows, onlyWfs ? stored : undefined), next = nextView(store, facts.now, { snapshot: facts, allCatchup: true, only: !!onlyWfs }), entities = emptyEntities()
	const bindings = new Map<string, Binding>(), workflows = facts.workflows, byCode = new Map(workflows.map(w => [w.code, w]))
	const expectations = new Map<string, string>()
	const managementRevisions = new Map<string, string | undefined>()
	const readyCards = new Map(base.needs.map(item => [item.code, item])), knowledge = knowledgeOf(store, store.config())
	const asksAt = new Map<string, string>()
	for (const workflow of workflows) {
		const message = store.thread(workflow.id).find(message => message.id === workflow.lastMsgId && !message.byOwner)
		if (message) asksAt.set(workflow.code, message.at)
	}
	function person(code: string, who: Who): string {
		const id = `person:${hashOf(byCode.get(code)?.asker?.id ?? code)}`
		// PE nit (09:12): the first name from SEND's personName ("Lane, Kim" is Kim), so the page never splits a name itself.
		const shown = byCode.get(code)?.startedBy === 'owner' ? displayWho('You') : who
		entities.people[id] = { id, ...shown, first: personName(shown.name).split(/\s+/)[0] || shown.name }
		return id
	}
	function sources(itemId: string, prefix: string, rows: SourceRow[]): string[] {
		return rows.map((row, n) => {
			const id = `${prefix}/source/${n}`
			entities.sources[id] = { ...row, id, itemId, href: safeLink(row.href) }
			return id
		})
	}
	function notes(itemId: string, prefix: string, rows: ItemCard['notes']): string[] {
		return rows.map((row, n) => {
			const id = `${prefix}/note/${n}`
			const sourceIds = sources(itemId, id, (row.sources ?? []).map(source => ({
				kind: source.tier === 'private' ? 'Private' : source.tier === 'card' ? 'Knowledge' : 'In the chat',
				label: source.label ?? (/^https:/.test(source.ref) ? sourceChip(source) : source.tier === 'card' ? 'Knowledge source' : 'Private source'), href: safeLink(source.ref), stale: source.stale, locked: source.tier === 'private',
			})))
			entities.notes[id] = { id, itemId, question: row.q, answer: row.a === undefined ? undefined : pageText(row.a), at: row.at, sourceIds }
			return id
		})
	}
	function offer(item: string, rev: string, kind: string, label: string, resolve: Binding['resolve'], options: Partial<Pick<Action, 'input' | 'effect' | 'staleness' | 'expect' | 'todoIds' | 'unavailable' | 'needsConfirm' | 'meaning' | 'expiresAt' | 'selection' | 'recovery' | 'reviewed' | 'hold'>> = {}, prefix = item): string {
		const id = `${prefix}/${kind}`
		if (options.staleness === undefined && !managementRevisions.has(item)) {
			const workflow = byCode.get(item)
			const jobId = workflow?.work?.watch ?? workflow?.job
			managementRevisions.set(item, workflow ? workflowManagementRev(workflow, jobId ? facts.jobs.get(jobId) : undefined) : pageManagementRev(store, item))
		}
		const managementRev = options.staleness === undefined ? managementRevisions.get(item) : undefined
		const action: Action = { id, item, rev: rev || managementRev || '', kind, label, effect: 'local', staleness: 'none', ...(managementRev ? { staleness: 'exact', expect: managementRev } : {}), ...options }
		entities.actions[id] = action
		bindings.set(id, { action, resolve, management: !!managementRev })
		return id
	}
	// "Continue in a terminal" (spec S7, owner 10-23): the terminal opens on the machine whose runner reads the chats, which may not
	// be the one showing the page; it is named then. With no runner reading, or the window already open, it is unavailable, with why.
	function continueOffer(item: string, rev: string, kind: string, openOn?: string): string {
		const reading = readingOf(store), runner = reading.machine, elsewhere = !!runner && runner !== store.machine
		const label = `Continue in a terminal${elsewhere ? ` on ${runner}` : ''}`
		const off = reading.state === 'off' || reading.state === 'never' || !runner
		const unavailable = openOn ? { label, reason: `Already open on ${openOn}.` } : off ? { label, reason: `${NAME} isn't running on any machine, so there is no session to open.` } : undefined
		return offer(item, rev, kind, label, () => {
			if (unavailable) throw new IntentError(409, unavailable.reason)
			return { code: item, verb: 'continue' }
		}, {
			meaning: elsewhere ? `Opens this item's AI session in a terminal on ${runner}, not on this computer. Go to that machine to use it. ${NAME} leaves the item alone until you close that window, then picks up the result.`
				: `Opens this item's AI session in a terminal on this computer, so you can take over or look at the work. ${NAME} leaves the item alone until you close that window, then picks up the result.`,
			...(unavailable ? { unavailable } : {}),
		})
	}
	// Spec S9: where a step happens, and what happened, in words; never an item code or a raw reference (part:, job:, sent:, owner:).
	const isCode = (token: string) => /^[A-Z]\d{1,5}$/.test(token) && byCode.has(token)
	const chatWords = (code: string) => { const w = byCode.get(code); return w ? w.chat.group ? placeOf(store, w.chat, w.asker)?.sentence ?? w.chat.name : `${(w.asker?.name ?? '').split(/\s+/)[0]} · 1:1` : undefined }
	const whereWords = (home: string, where?: string) => !where ? undefined : !isCode(where) ? where : where === home ? 'this chat' : chatWords(where)
	// "Left for you" lines from wf.left only (Left-for-you contract; PM A R35 (d)): what he does, a muted source line with its link
	// (no thread ids or raw links shown), "Why?" on a refusal, and one button for its kind. Ask Delegate again and Draft the invite again
	// go through HOST's line verbs behind SEND's leftRev consent (decision 53). A promise has none: its tick is its action.
	// Rule 5 seen-done: a line HOST's probe saw done shows once, "✓ Done (seen on PR <n>)", on the first visit after it was seen (its
	// cleared.at is newer than this visit's cursor); nothing is stored per view.
	const seenSince = since ?? visit?.fallbackSince
	const leftLinesOf = (wf: Workflow) => [...openLeft(wf), ...(wf.left ?? []).filter(line => line.cleared?.why === 'seen-done' && line.cleared.seen && !!seenSince && line.cleared.at > seenSince)].map(line => {
		const day = shortDay(line.source.at), href = safeLink(line.source.href)
		const button = line.type !== 'refusal' ? undefined
			: line.kind === 'other-pr' && line.reply && safeLink(line.reply.href) ? { kind: 'copy-reply' as const, text: pageText(line.reply.text), href: safeLink(line.reply.href)! }
				: line.kind === 'setting-off' && line.setting ? { kind: 'settings' as const, key: line.setting }
					: ['pr-lifecycle', 'deploy'].includes(line.kind) && safeLink(line.pr?.href) ? { kind: 'open-pr' as const, href: safeLink(line.pr!.href)! }
						// Decision 53: HOST's two line verbs, behind SEND's leftRev consent (PM A R35 (d): incomplete and old invite).
						: !line.cleared && line.kind === 'incomplete' ? { kind: 'action' as const, actionId: leftVerb(wf.code, wf, line.id, 'left-ask-again') }
							: !line.cleared && line.kind === 'old-invite' ? { kind: 'action' as const, actionId: leftVerb(wf.code, wf, line.id, 'left-draft-invite') } : undefined
		const chat = wf.chat.group ? placeOf(store, wf.chat, wf.asker)?.sentence ?? wf.chat.name : undefined
		const seen = line.cleared?.seen
		return {
			id: line.id, type: line.type, text: pageText(leftWords(line)),
			...(line.action.quote && line.action.verb !== 'promise' ? { quote: { text: pageText(line.action.quote), by: line.action.quoteBy ?? 'asker' } } : {}),
			source: { text: pageText([leftSourceWords(line.source, wf.asker?.name?.split(/\s+/)[0], chat), day].filter(Boolean).join(' · ')), ...(href ? { href } : {}) },
			...(seen ? { seen: { pr: seen.pr } } : {
				...(line.type === 'refusal' && line.why?.trim() ? { why: pageText(line.why).replace(/[.\s]+$/, '') } : {}),
				...(button ? { button } : {}),
			}),
		}
	})
	const plainText = (text: string) => text
		.replace(/\s*\(([^()]*?),\s*([A-Z]\d{1,5})\)/g, (all, inner, code) => isCode(code) ? ` · ${inner}` : all)
		.replace(/\s*\(([A-Z]\d{1,5})\)/g, (all, code) => isCode(code) ? '' : all)
		.replace(/\b(?:part|job|sent|owner|completion|row):[^\s,;)]+/g, '')
		.replace(/\b([A-Z]\d{1,5})(:\s|\b)/g, (all, code, tail) => isCode(code) ? tail.trim() ? '' : '' : all)
		.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim()
	// L6 (PM E78): the owner is always "you" in Progress and Waiting lines, never his name ("Waiting on you and Kim"). His full name, or
	// his first name only as a whole name on its own (PE 22:18): another "Jordan Lee" or "Jordan's team" is someone else and stays.
	const escape = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const ownerFull = base.owner?.trim(), ownerFirst = ownerFull?.split(/\s+/)[0]
	const ownerRe = ownerFull ? new RegExp([`\\b${escape(ownerFull)}\\b`, ...(ownerFirst && ownerFirst.length > 1 && ownerFirst !== ownerFull ? [`\\b${escape(ownerFirst)}\\b(?!\\s+[A-Z])(?!['’]s\\b)`] : [])].join('|'), 'g') : undefined
	const asYou = (text?: string) => !text || !ownerRe ? text : text.replace(ownerRe, 'you').replace(/^(.+?) and you\b/, 'you and $1')
	// Waiting is "<who> (<where>)" (view.ts): only the who part names people.
	const waitingAsYou = (text?: string) => text?.replace(/^(.*?)((?:\s\([^]*\))?)$/, (_, who: string, where: string) => `${asYou(who)}${where}`)
	const ownerOfStep = (who: string) => asYou(who) === 'you' ? { kind: 'you' as const } : ownerOf(who)
	// L6: Why and Why it waited read one plain sentence each: "Replies about open work always wait for your OK.", never a run-on.
	const asSentence = (text?: string) => {
		const s = text?.trim().replace(/\breplies on open work always wait for you\b/i, m => `${m[0] === 'R' ? 'R' : 'r'}eplies about open work always wait for your OK`)
			.replace(/\b(waits?) for you$/i, '$1 for your OK')
		return s ? `${s[0].toUpperCase()}${s.slice(1)}${/[.!?…]$/.test(s) ? '' : '.'}` : undefined
	}
	// L3d: the sender's earlier ask (stored as "<ISO day>, <code>: <who> asked "…". <its status>") for Details › What happened, as
	// "Earlier · Tue: Kim asked "…"": no code, no ISO date, not its status, and nothing when it names another item that is finished.
	const earlierLine = (text: string | undefined, home: string): string | undefined => {
		if (!text?.trim()) return undefined
		const m = /^(\d{4}-\d{2}-\d{2}),\s*([A-Z]\d{1,5}):\s*([\s\S]*)$/.exec(text.trim())
		if (m && m[2] !== home && byCode.get(m[2])?.state === 'done') return undefined
		const body = m ? m[3] : text
		const asked = /^([\s\S]*?\basked "[\s\S]*?")\.(?:\s|$)/.exec(body)?.[1] ?? body
		const words = plainText(asked.replace(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?\b/g, day => shortDay(day)))
		return words ? `Earlier${m ? ` · ${shortDay(m[1])}` : ''}: ${words}` : undefined
	}
	// "I've done these" (decision 53, PE 08:05:12Z): one mark binds his open kept to-dos AND his open wf.left lines, in that order (the
	// card's tick numbers), to SEND's separate leftRev, never to workflowApprovalRev, so a new or cleared line can't stale a Send.
	function markTodos(code: string, wf: Workflow, kind = 'todo-done', prefix = code): string {
		const ids = [...(wf.kept ?? []).filter(todo => !todo.done).map(todo => todo.id), ...openLeft(wf).map(line => line.id)], expect = leftRev(wf)
		return offer(code, expect, kind, kind === 'todo-row-done' ? 'Mark done' : ids.length === 1 ? 'Mark to-do done' : `Mark ${ids.length} to-dos done`,
			() => ({ code, verb: 'close' }), { staleness: 'exact', expect, todoIds: ids }, prefix)
	}
	// Decision 53: the two line verbs, bound to one active line id and leftRev. Draft only: the result is a proposal or a draft for his OK.
	function leftVerb(code: string, wf: Workflow, lineId: string, verb: 'left-ask-again' | 'left-draft-invite'): string {
		const expect = leftRev(wf)
		return offer(code, expect, verb, verb === 'left-ask-again' ? 'Ask Delegate again' : 'Draft the invite again', () => ({ code, verb, text: lineId }), {
			staleness: 'exact', expect,
			meaning: verb === 'left-ask-again' ? `${NAME} proposes it again for your OK. Nothing is sent or changed until you approve.` : `${NAME} drafts the invite again for your OK. Nothing is sent until you approve.`,
		}, `${code}/${lineId}`)
	}
	function closeWork(code: string, kind: string, prefix = code, label = 'Close'): string {
		const rev = entities.items[code].rev, wf = byCode.get(code)
		// SEND's consent refuses a plain page Close while lines are open (decision 53): he ticks them first, or closes from chat.
		const blocked = !!wf && (wf.kept?.some(todo => !todo.done) || openLeft(wf).length > 0)
		const reason = "Open the item and tick what's left for you first, then close this work."
		return offer(code, rev, kind, label, () => {
			if (blocked) throw new IntentError(409, reason)
			return { code, verb: 'close' }
		}, { staleness: 'exact', expect: rev, ...(blocked ? { unavailable: { label, reason } } : {}) }, prefix)
	}
	function tool(item: string, kind: string, label: string, execute: NonNullable<Binding['execute']>, input?: Action['input'], prefix = 'page', rev?: string): string {
		const id = offer(item, rev ?? '', kind, label, () => { throw new IntentError(422, 'This is not a queued item command.') }, { input, ...(rev ? { staleness: 'exact', expect: rev } : {}) }, prefix)
		bindings.get(id)!.execute = execute
		return id
	}
	function watchFyi(workflow: Workflow, label: string, prefix: string, rev: string, defaults?: { target?: string; until?: string }, form = true): string {
		return tool(workflow.code, 'watch-fyi', label, input => {
			if (input?.by && !byEnd(input.by)) throw new IntentError(422, 'Choose a valid date.')
			const result = watchItemTarget(store, workflow, { target: input?.text?.trim() || defaults?.target,
				until: input?.until === undefined ? defaults?.until : input.until.trim(), by: input?.by || undefined, shepherd: input?.push })
			return { accepted: result.accepted, text: pageText(result.text) }
		}, form ? 'watch' : undefined, prefix, rev)
	}
	const stoppedCodes = new Set(next.move.filter(row => row.kind === 'stopped').map(row => row.act))
	// An item open in a terminal has one page step, Take it back (#43), whatever its state.
	const editable = new Set([...workflows.filter(workflow => workflow.state === 'needs_human' || workflow.openOn && workflow.state !== 'done').map(workflow => workflow.code), ...stoppedCodes])
	const ownerRules = store.rules()
	// D-A281 (PE v1.148 §17.6): a grant or line id resolves to his line (its own id, or one of the grant ids it carries).
	let ruleLinesNow: ReturnType<typeof ruleLines> | undefined
	const lineOf = (id: string) => (lines => lines.find(line => line.id === id) ?? lines.find(line => line.grantIds?.includes(id) || line.compile?.grants.some(grant => grant.id === id)))(ruleLinesNow ??= ruleLines(store))
	// D-A281 B3: the line a reply was sent by, frozen at send (SEND's wf.sent.rule): his own words exactly as written (CR 19:19:08 B3: owner
	// content, escaped by the page, never the engine-hint sentence filter), and that line now: its id, or "edited" / "deleted".
	const frozenRule = (rule: NonNullable<NonNullable<Workflow['sent']>['rule']>) => (line => ({ text: rule.text, ...(line ? { lineId: line.id } : {}),
		state: !line ? 'deleted' as const : ruleTextHash(line.text) !== rule.hash ? 'edited' as const : 'current' as const }))(lineOf(rule.id))
	// R11(3): the W entries a follow-up may return to, and the items by id (a shared job's other parents), read once.
	const waitLinks = store.waiting(), byId = new Map(workflows.map(w => [w.id, w]))
	// R10b: the row line of a review that waits for his approval, by item code (PM §2).
	const reviewRows = new Map<string, string>()
	// D-COST JB1/JB2: a stopped job's row line 3, by item code; and the daily AI run limit, read once (PM A3).
	const stopRows = new Map<string, string>(), dailyCap = cfg.dailyRuns ?? 200, dailyFull = store.runsToday() >= dailyCap
	const DAILY_LEAD = `Daily AI run limit reached (${dailyCap}). New AI work starts tomorrow. Change the limit in`, DAILY_WORDS = `${DAILY_LEAD} Settings`
	for (const wf of workflows) {
		const c = readyCards.get(wf.code) ?? card(store, wf, knowledge), id = c.code, rev = presentationRev(wf, cfg)
		const { who, chat, draft, changes, notes: cardNotes, why, work, replyOnly, reviewAgain, ...rest } = c
		const personId = person(id, who), chatId = `chat:${hashOf(wf.chat.id)}`
		entities.chats[chatId] = { ...chat, id: chatId }
		const draftId = draft ? `${id}/draft` : undefined
		if (draft && draftId) {
			const sendText = approvedReplyText(draft.text, wf, cfg)
			// L7b: the line Send adds (the owner's signature or the policy's marker), so the card shows it under the box, not in it.
			const marker = sendText !== draft.text ? signatureOf(cfg).replace('{first}', cfg.owner.name.split(/\s+/)[0]) : undefined
			entities.drafts[draftId] = { ...draft, sendText: sendText === draft.text ? undefined : sendText, ...(marker && sendText.endsWith(marker) ? { marker } : {}), id: draftId, itemId: id, rev }
		}
		const pending = (wf.effects ?? []).filter(effect => !effect.done && !effect.off)
		const approved = stillApproved(wf, wf.job ? facts.jobs.get(wf.job) : undefined)
		// WYS N1-1: what each change is, from its structured fields only: its consent id, origin and default tick (asked/promised/note/rule
		// and not in a group), its option group, and the Why? words (PM round 2). Votes and PRs come from the call, never the line's words (N1-3).
		const asker = personName(wf.asker?.name ?? '').split(/\s+/)[0] || undefined
		const wysOf = (effect: Effect) => {
			const reason = effect.reason?.text ? pageText(effect.reason.text).replace(/^Suggested:\s*/i, '') : undefined
			const why = effect.origin === 'asked' && effect.askQuote ? `${asker ?? 'They'} asked: "${pageText(effect.askQuote)}"`
				: effect.origin === 'suggested' ? effect.reason?.kind === 'asked' ? `Suggested: ${asker ? `${asker}'s` : 'Their'} message may ask for this.` : reason ? `Suggested: ${reason}` : undefined : reason
			return { changeId: pageChangeId(effect), vote: isVote(effect.call), ...((pr => (pr ? { pr } : {}))(prIdOf(effect.call))),
				...(effect.origin ? { origin: effect.origin, ticked: ['asked', 'promised', 'note', 'rule'].includes(effect.origin) && !effect.group && !isVote(effect.call) } : {}),
				...(effect.group ? { group: { id: effect.group.id, question: pageText(effect.group.question), min: effect.group.min } } : {}), ...(why ? { why } : {}) }
		}
		const changeIds = changes.map((change, n) => {
			const key = `${id}/change/${pageChangeId(pending[n])}`
			const blocked = refusal(cfg, pending[n], prTarget(store, wf))
			entities.changes[key] = { ...change, ...wysOf(pending[n]), id: key, itemId: id, rev, state: maybeOf(store, pending[n]) ? 'uncertain' : approved ? 'approved' : 'proposed',
				error: blocked ? `This change cannot be made: ${blocked}.` : pending[n].error ? pageText(pending[n].error) || 'The change could not be confirmed. Check the target before retrying.' : undefined }
			return key
		})
		const effectIds = [...new Set((wf.effects ?? []).map((effect, index) => {
			const key = `${id}/change/${pageChangeId(effect)}`
			if (!entities.changes[key]) {
				const display = shown(effect)
				entities.changes[key] = {
					...wysOf(effect), id: key, itemId: id, rev, n: index + 1, summary: display.text, target: display.loc || display.system, system: display.system,
					action: display.line, detail: display.detail || undefined, meaning: meaningParts(effect),
					state: effect.done || madeBefore(store, effect) ? 'made' : effect.off ? 'left-out' : maybeOf(store, effect) ? 'uncertain' : approved ? 'approved' : 'proposed',
				}
			}
			return key
		}))]
		const todoIds = (wf.kept ?? []).filter(todo => !todo.done).map(todo => {
			const key = `${id}/todo/${todo.id}`
			// Where it came from (PM 20:00): the reply it was left by, to whom and where, and that message in Teams when it is that one.
			// Never a code or a link in the words. Its text is shown as stored: a pre-0.2.46 refusal string is a plain line (contract rules 1, 6).
			const teams = wf.sent && wf.sent.at === todo.at && wf.chat.id && (!wf.chat.test || teamsChat(wf.chat.id)) ? safeLink(messageLink(wf.chat.id, wf.sent.msgId)) : undefined
			entities.todos[key] = { ...todo, id: key, itemId: id, code: id, done: false,
				from: { at: todo.at, ...(wf.asker?.name ? { who: wf.asker.name.split(/\s+/)[0] } : {}), ...(wf.chat.group && wf.chat.name ? { chat: placeOf(store, wf.chat, wf.asker)?.sentence ?? wf.chat.name } : {}), ...(teams ? { teams } : {}) } }
			return key
		})
		const workId = work ? `${id}/work` : undefined
		if (work && workId) {
			const planIds = work.plan.map((step, position) => {
				const key = `${workId}/plan/${position}`
				entities.planSteps[key] = { ...step, what: plainText(step.what), where: whereWords(id, step.where), id: key, workId, position, owner: ownerOfStep(step.who), now: false }
				return key
			})
			const stepIds = work.steps.map((step, position) => {
				const key = `${workId}/step/${position}`
				entities.workSteps[key] = { ...step, what: plainText(step.what), id: key, workId }
				return key
			})
			entities.work[workId] = { ...work, waiting: waitingAsYou(work.waiting), id: workId, itemId: id, stepIds, planIds, total: stepIds.length }
		}
		const actionIds: string[] = []
		const expect = rev
		expectations.set(id, expect)
		// WYS N1-3 (I32): an origin-bearing revision is approved by naming exactly what he ticked; votes are never in that list (they keep
		// their Approve action). Without a selection the page refuses rather than narrowing, unless there is nothing to choose. Old
		// originless revisions keep "all except" (R4).
		const positive = !legacyEffectOrigins(wf), offeredIds = new Set(pending.filter(effect => !isVote(effect.call)).map(pageChangeId))
		const chosen = (input: Intent['input']): Pick<PageParsed, 'include' | 'actionClaimReview'> => {
			if (!positive) return {}
			if (input?.excluded?.length) throw new IntentError(422, 'Choose the changes on the current page first.')
			if (input?.include === undefined && offeredIds.size) throw new IntentError(422, 'Choose the changes on the current page first.')
			const include = [...new Set(input?.include ?? [])]
			if (include.some(change => !offeredIds.has(change))) throw new IntentError(422, 'That change is not offered.')
			return { include, ...(input?.claimReview ? { actionClaimReview: input.claimReview } : {}) }
		}
		// WYS N1-2 ✕ (PE 16:55:13Z (B); HOST 29809a29, SEND f99097d7): each suggestion he may turn down has a local offer on the exact
		// card revision. Its resolve holds the effect, so it sends HOST's own scope key and the scrubbed summary HOST checks; no change ids,
		// no approval digest. The page holds it 6 s with Undo (decision 59) before dispatch.
		if (wf.state === 'needs_human') pending.forEach((effect, n) => {
			if (effect.origin !== 'suggested' || isVote(effect.call) || !changeIds[n]) return
			const key = dismissKey(effectCapability(effect), effect.target), label = scrub(effect.summary)
			entities.changes[changeIds[n]].dismissActionId = offer(id, rev, `dismiss-suggestion-${n + 1}`, "Don't suggest this", () => ({ code: id, verb: 'dont-suggest', key, label }),
				{ staleness: 'exact', expect, meaning: `${NAME} stops suggesting this here. It is listed in Settings › Suggestions you turned down, where you can Reconsider it. Nothing is sent.` })
		})
		const approval = (input: Intent['input']): PageParsed => {
			if (positive) {
				if (input?.text !== undefined) throw new IntentError(422, 'Use Send your version to send an edit.')
				return { code: id, verb: 'ok', ...chosen(input) }
			}
			const excluded = [...new Set(input?.excluded ?? [])]
			if (excluded.some(n => !changes.some(change => change.n === n))) throw new IntentError(422, 'That change is not offered.')
			if (input?.text !== undefined) throw new IntentError(422, 'Use Send your version to send an edit.')
			return { code: id, verb: 'ok', ...(excluded.length ? { except: excluded } : {}) }
		}
		const comments = changes.length > 0 && changes.every(change => /comment|review/i.test(change.action))
		const selection: Action['selection'] = changes.length ? {
			total: changes.length, verb: comments ? 'Post' : 'Make', singular: comments ? 'comment' : 'change', plural: comments ? 'comments' : 'changes',
			suffix: draft ? ' and reply' : '', empty: draft ? 'Send reply only' : 'Nothing selected', allowEmpty: !!draft,
			exactSingle: !draft && changes.length === 1 ? changes[0].action : undefined,
		} : undefined
		// One card state decides what the owner can do (engineer-card-state-devspec.md §2, #34 step 3): the projection offers the
		// actions it names, and only those (plus Ask, Continue, Reopen and the work tools below).
		const job = wf.job ? facts.jobs.get(wf.job) : undefined
		const agentWait = facts.agentWait && (wf.state === 'running' || wf.state === 'waiting_on_task' && job?.state === 'queued' || job?.state === 'failed' && job.error === facts.agentWait.text) ? facts.agentWait.text : undefined
		const windowRec = wf.openOn ? store.openWindow(wf.id) ?? (wf.job ? store.openWindow(wf.job) : undefined) : undefined
		// The PR a review's question, facts and changes are about, named on the card (queue-new #10 c).
		const prLabel = (pr => (pr ? `PR ${pr}${wf.prAuthor ? ` · ${wf.prAuthor}` : ''}` : undefined))(Number(/^pr:.*?(\d+)$/i.exec((wf.job && facts.jobs.get(wf.job)?.key) || '')?.[1] ?? 0) || (wf.intent === 'pr_review' ? prTarget(store, wf) : undefined))
		// The report's facts through the one canonical reader (card-state step 5), so old and new items show the same.
		// prAnchor.also (architecture 43(d), HOST 4d0cbf6b): "Also mentions PR <n>" comes from the anchor's structured list, only while the
		// anchor holds as prTarget honours it (probe.ts: not done, not redacted, its message still owned, no conflict). An old item may still
		// carry the retired context line of that label until its report is replaced; the structured line replaces it, never both (CR 09:58:46Z).
		const anchor = wf.prAnchor, also = anchor?.also?.length && wf.state !== 'done' && !wf.redacted && wf.msgIds.includes(anchor.msgId) && prTarget(store, wf) === anchor.pr ? anchor.also : undefined
		const context = [
			...cardContext(wf, job, c.context).filter(fact => !(also && fact.label === 'Also mentions')),
			...(also ? [{ label: 'Also mentions', text: also.map(id => `PR ${id}`).join(', '), tone: 'info' as const }] : []),
		].map(fact => ({ ...fact, text: chatIdNet(fact.text) }))
		// L4: the other warnings go to card-state, which picks the one warn line; need to know comes from wf.shareHold itself.
		const warns = [
			...context.filter(fact => fact.tone === 'warn' && fact.label !== 'Need to know').map(fact => `${prLabel ? `${prLabel} · ` : ''}${fact.label}: ${fact.text}`),
			...changeIds.flatMap(key => entities.changes[key].meaning?.filter(part => part.warn).map(part => part.text) ?? []),
		]
		// L1b: SEND's pure check on the draft before any Send (a held claim comes from the item itself, in cardFacts). The last-known
		// vote is the runner's PR read [PR id, status, head, owner vote]; a recommendation is never evidence.
		const lastKnownVote = lastKnownVoteOf(wf)
		// L1b B1 (PE 23:22): only where the engine checks claims at all, SEND's exported aboutPr (apply.ts): a PR ref, a pr_review item, or a
		// PR link in the draft, the ask or the asker's thread. A non-PR "Approved, enjoy your day off." is left alone, as the engine sends it.
		// The cheap voteMention check first (PE nit): voteClaimGap only reads sentences that mention a vote, so nothing else changes.
		const voteGap = draft && wf.state === 'needs_human' && !voteHold(wf) && voteMention(draft.text) && aboutPr(store, wf, draft.text) ? voteClaimGap(draft.text, wf.effects ?? [], lastKnownVote) : undefined
		// A37 (b) / PM A R37: the hold names its words, the same for a gap seen here and one the engine already held on.
		const voteClaim = draft && wf.state === 'needs_human' && (voteGap || voteHold(wf)) ? voteClaimOf(store, wf, draft.text) : undefined
		const logMisread = () => { try { store.log({ event: 'vote-claim-send-anyway', code: id, held: !!voteHold(wf), ...(voteGap ? { claim: voteGap.claim } : {}), ...(voteClaim?.pr ? { pr: voteClaim.pr } : {}) }) } catch { /* best effort */ } }
		// SEND fa4a5a1d (queue 06:10): his reply says he voted on a PR Delegate can't read votes on (a GitHub/GitLab-style link): a notice
		// on the card, never a block. Only the owner's own claim sentences count, and only links in them; skipped when the vote-claim line shows.
		// PE 09:16 B1: a link's trailing punctuation ("…/pull/12.") is not part of it. Nit: a claim that isn't an approval (vote < 5, e.g.
		// "requested changes") says "voted"; an approval keeps "approved".
		const unverifiable = draft && wf.state === 'needs_human' && !voteGap && voteMention(draft.text) ? voteSentences(draft.text, cfg.owner.name ?? '')
			.find(said => said.kind === 'owner' && (said.sentence.match(/https?:\/\/[^\s<>()"']+/g) ?? []).some(link => isNonAdoPrLink(link.replace(/[.,;:!?'")\]]+$/, '')))) : undefined
		if (unverifiable) warns.push(unverifiable.vote === 'approval' || unverifiable.vote >= 5
			? `Your reply says you approved, but ${NAME} can't check votes on that PR. Check it before sending.`
			: `Your reply says you voted on that PR, but ${NAME} can't check votes there. Check it before sending.`)

		const recommended = job?.result?.voteRecommendation?.vote
		const voteRecommended = !!recommended && recommended !== 'none' && !pending.some(effect => isVote(effect.call))
		// L2b (#7, PE 23:56): the reviewer-group question is a multi-choice in place of its question text, only while the item has no
		// choices of its own (then the question stays text). HOST's groupChoices: the PM prompt, the cleaned labels, then "None of these".
		const groupPick = wf.groupAsk && !c.choices && wf.state === 'needs_human' ? groupChoices(wf.groupAsk) : undefined
		const choices = c.choices ?? (groupPick && { prompt: groupPick.prompt, multi: true, other: false, options: groupPick.options.map(({ label }) => ({ label })) })
		// L2b B1 (PE 00:30): with a draft the draft decides the card (Send and the editor lead): the group question reaches card-state as
		// a question, and the picker sits in "Delegate also asks" with its own Save. Without a draft it is the card's choices (Save leads).
		const groupAside = !!groupPick && !!draft
		// D-COST New-COST-1 (PE §8.3, declared shape): the item's one stopped job (its own, or a PR unit's), never several. With an asker,
		// news is his newest message since the stop: "asked again" when it repeats an ask the job already has, else "added something".
		// New-SKIP (PE §14.6 (b)): a skipped PR unit's job no longer counts, so after its Skip the card leaves stopped mode unless another stops.
		const stopJob = (jobs => (jobs.length === 1 ? jobs[0] : undefined))([...new Set([wf.job, ...(wf.prs ?? []).filter(unit => !unit.skip).map(unit => unit.job)])].flatMap(jobId => {
			const candidate = jobId ? facts.jobs.get(jobId) : undefined
			return candidate && jobStopOf(candidate).stopped ? [candidate] : []
		}))
		const stopped = stopJob ? jobStopOf(stopJob) : undefined
		const stopNews = stopped?.stopped && wf.asker && wf.startedBy !== 'owner' ? store.thread(wf.id).filter(message => !message.byOwner && message.at > stopped.stopped!.at).at(-1) : undefined
		const stop: JobStop | undefined = stopped?.stopped && {
			kind: stopped.stopped.kind, at: stopped.stopped.at, asker: !!wf.asker && wf.startedBy !== 'owner',
			...((need => (need ? { need } : {}))(pageText(stopped.stopped.need))),
			...(stopped.stopped.kind === 'budget' && stopped.spent ? { runs: stopped.spent.runs, tokens: stopped.spent.tokensIn + stopped.spent.tokensOut } : {}),
			...(stopNews ? { news: { who: stopNews.from.name.split(/\s+/)[0] || 'They', at: stopNews.at, again: stopJob!.asks.filter(ask => ask === `${wf.asker!.name}: ${stopNews.text}`).length > 1 } } : {}),
		}
		const fx = scrubFacts(cardFacts({ wf, job, ...(stop ? { stop } : {}), ...(wf.openOn && wf.state !== 'done' ? { window: { machine: wf.openOn, ...(windowRec?.since ? { since: windowRec.since } : {}) } } : {}), card: { question: groupAside ? groupPick.prompt : groupPick ? undefined : c.question, draft, choices: groupAside ? c.choices : choices, ownReply: c.ownReply, promise: c.promise, reviewAgain }, changes: changes.length, agentWait, todos: todoIds.length, warns, ...(voteGap ? { voteGap: { ...voteGap, why: voteClaim?.line ?? voteGap.why } } : {}), voteRecommended }))
		// F1 (PE decision 47, CR 02:50): the consent a held card's Send anyway or send-edit returns: on a vote-held card exactly what
		// apply.ts compares (voteClaimReview), else the held digest the card shows.
		const reviewedHold = voteHold(wf) ? voteClaimReview(wf) : fx.held?.digest
		const cs = cardState(fx)
		// R10b: the review-done card. Approve PR <n> makes only his proposed approve vote (every other change left out), on this exact
		// revision; Post them posts the comments still waiting, never the vote.
		// D-A239 frame-new: the reviewed unit's frame (card-facts' itemReview), with its PR; its Approve is that PR's vote.
		const review = itemReview(wf), reviewed = review && { pr: review.pr, ...review.done }
		const rd = cs.mode === 'review-done' ? reviewed : undefined
		const voteAt = rd ? pending.findIndex(effect => isVote(effect.call) && (voteValue(effect.call) ?? 0) >= 5 && !effect.error && prIdOf(effect.call) === rd.pr) : -1
		const voteN = voteAt >= 0 ? changes[voteAt]?.n : undefined
		// R10b B1 (PE 02:06): every pending vote, of any value, is never a waiting comment: Post them leaves them all out.
		const voteKs = rd ? pending.flatMap((effect, k) => isVote(effect.call) ? [k] : []) : []
		const voteNs = voteKs.map(k => changes[k]?.n).filter((n): n is number => n !== undefined)
		// D-A239 MP1 (New-A239-1): an ask naming two or more PRs lists each, in ask order, with HOST's typed outcome. MP2: with two or
		// more reviewed PRs each has its own review block and its own Approve, and the bar carries no Approve.
		const units = (wf.prs?.length ?? 0) >= 2 ? wf.prs : undefined
		const manyReviews = units ? itemReviews(wf) : [], perPr = manyReviews.length >= 2
		if (editable.has(id)) {
			const broken = checkCard(fx, cs)
			if (broken.length && !brokenSeen.has(`${id}@${rev}`)) { brokenSeen.add(`${id}@${rev}`); try { store.log({ event: 'invariant-broken', code: id, mode: cs.mode, broken }) } catch { /* best effort */ } }
			const failed = cs.mode === 'failed'
			const make: Partial<Record<ActionKind, () => void>> = {
				approve: () => {
					const label = c.promise?.failed && !draft ? 'Check again' : changes.length ? `Approve selected changes${draft ? ' and reply' : ''}` : draft?.holding ? 'Send holding reply' : 'Send'
					actionIds.push(offer(id, rev, 'approve', label, approval, { effect: c.promise?.failed && !draft ? 'local' : draft && !changes.length ? 'sends' : 'changes-system', staleness: 'exact', expect, input: changes.length ? 'approval' : undefined, selection }))
					if (pending.some(effect => maybeOf(store, effect))) actionIds.push(offer(id, rev, 'approve-again', 'I checked: make the changes once', input => ({ ...approval(input), again: true }), {
						effect: 'changes-system', staleness: 'exact', expect, input: 'approval', needsConfirm: true,
						meaning: 'Choose this only after checking the target system and confirming these changes were not made. This permits one new attempt.',
						selection: selection && { ...selection, verb: 'I checked: make', suffix: ` once${draft ? ' and reply' : ''}`, exactSingle: undefined },
					}))
				},
				'send-edit': () => actionIds.push(offer(id, rev, 'send-edit', changes.length ? 'Preview your version with changes' : 'Send your version', input => {
					if (!positive && input?.excluded?.length) throw new IntentError(422, 'Change the reply and leave out changes one at a time.')
					return { code: id, verb: 'send', text: requiredText(input), ...chosen(input) }
				}, { effect: changes.length ? 'local' : 'sends', staleness: 'exact', expect, input: 'text', ...(reviewedHold ? { reviewed: reviewedHold } : {}) })),
				answer: () => actionIds.push(offer(id, rev, 'answer', cs.primary === 'answer' ? 'Draft reply' : 'Answer instead', input => ({ code: id, verb: 'answer', text: requiredText(input) }), { input: 'text', recovery: failed || undefined })),
				pick: () => { if (choices) actionIds.push(offer(id, rev, 'pick', groupPick ? 'Save' : 'Preview reply', input => {
					const picks = [...new Set(input?.picks ?? [])]
					if (!picks.length || picks.some(n => n > choices.options.length) || !choices.multi && picks.length !== 1) throw new IntentError(422, 'Pick an offered option.')
					// "None of these" (the last) stands alone; the engine checks the same (groupSelection).
					if (groupPick && picks.includes(choices.options.length) && picks.length !== 1) throw new IntentError(422, '"None of these" can\'t be picked with a group.')
					return { code: id, verb: 'pick', nums: picks }
				}, { input: 'picks', staleness: 'exact', expect, ...(groupPick ? { meaning: `${NAME} remembers your answer.` } : {}) })) },
				// A held Send (PE 14:28): the chat's own verbs. "Send anyway" becomes ok past exactly the held reason's digest (apply.ts),
				// so the owner sends only the card he saw; "Redraft" starts over with the new message.
				// PM A R37: each Send anyway past a vote claim is logged as a possible misread, to tune the detector (no reply text).
				// F1 (PE decision 47): a Send anyway past a hold carries the held digest this card shows; the intent returns it as reviewed.
				'send-anyway': () => actionIds.push(fx.voteGap
					// L1b: past a vote claim, ⋯ Send anyway asks again with the same sentence, on this exact revision. A held claim is overridden
					// only by the page's "send anyway" (apply.ts); before any hold it is an ordinary Send, which the engine's live check still reads.
					? offer(id, rev, 'send-anyway', 'Send anyway', (input: Intent['input']) => { logMisread(); return fx.voteGap!.held ? { code: id, verb: 'answer', text: 'Send anyway' } : approval(input) }, { effect: 'sends', staleness: 'exact', expect, needsConfirm: true, meaning: voteClaim ? pageText(voteClaim.confirm) : fx.voteGap.text, ...(reviewedHold ? { reviewed: reviewedHold } : {}) })
					: offer(id, rev, 'send-anyway', 'Send anyway', () => ({ code: id, verb: 'answer', text: 'Send anyway' }), { effect: 'sends', staleness: 'exact', expect, ...(reviewedHold ? { reviewed: reviewedHold } : {}) })),
				// L1b: the review recommended a vote that isn't proposed: propose it (nothing is made or sent until he approves).
				'add-vote': () => actionIds.push(offer(id, rev, 'add-vote', 'Add the vote', () => ({ code: id, verb: 'answer', text: 'add the vote' }), { staleness: 'exact', expect, meaning: 'Adds the recommended vote to what you approve. Nothing is made or sent yet.' })),
				redraft: () => actionIds.push(offer(id, rev, 'redraft', 'Redraft', () => ({ code: id, verb: 'answer', text: 'Redraft' }), { staleness: 'exact', expect })),
				// Take it back (#43): marks the window's record taken back and nothing else; the next tick releases the item and applies a
				// report the window already submitted, as a preview.
				'take-back': () => {
					const key = windowRec ? (store.openWindow(wf.id) ? wf.id : wf.job!) : undefined
					const at = offer(id, rev, 'take-back', 'Take it back', () => { throw new IntentError(422, 'This is not a queued item command.') }, { staleness: 'exact', expect, meaning: `Stops waiting for your terminal. ${NAME} picks the item up again on its next check; your terminal stays open.` })
					bindings.get(at)!.execute = () => {
						const open = key ? store.openWindow(key) : undefined
						if (!open || open.closed) throw new IntentError(409, 'It is no longer open in a terminal. Open the item again.')
						store.setOpenWindow(key!, { ...open, closed: true, takenBack: true })
						store.log({ event: 'continue-taken-back', code: id, target: key })
						return { accepted: true, text: "Taken back. Your terminal stays open; what you decide there now isn't used." }
					}
					actionIds.push(at)
				},
				later: () => actionIds.push(offer(id, rev, 'later', 'Later', () => ({ code: id, verb: 'later' }))),
				dismiss: () => actionIds.push(rd ? offer(id, rev, 'dismiss', 'Not approving it now', () => ({ code: id, verb: 'skip' }), { meaning: "I'll handle it in Azure DevOps." })
					: cs.mode === 'stopped' ? offer(id, rev, 'dismiss', 'Close it', () => ({ code: id, verb: 'skip' }), { staleness: 'exact', expect: rev, hold: { line: 'Closed' } })
					: offer(id, rev, 'dismiss', failed || c.promise || fx.held?.reasons.some(r => r.kind === 'no-reply-needed') ? 'Skip' : 'Dismiss', () => ({ code: id, verb: 'skip' }))),
				// A run that gave no result (queue-new #11): Try again re-runs it as it was; a job that ran out of routes is queued again (#17 b).
				// D-COST: on a stopped job Try again is one run (HOST's existing answer path), captioned by the PM; at the daily limit it is
				// unavailable with the daily-limit words, so a press starts nothing.
				'try-again': () => actionIds.push(offer(id, rev, 'try-again', 'Try again', () => ({ code: id, verb: 'answer', text: 'try again' }), { staleness: 'exact', expect,
					...(stop && (cs.mode === 'stopped' || cs.mode === 'held') ? { meaning: stop?.news ? `Runs it once more with what ${stop.news.who} added · nothing is sent` : 'Runs it once more · nothing is sent', ...(dailyFull ? { unavailable: { label: 'Try again', reason: `${DAILY_WORDS}.` } } : {}) } : {}) })),
				// D-COST JB2: Run it once more is exactly one run on a job stopped at its limit (HOST-COST-1's one-more verb, declared shape).
				'one-more': () => actionIds.push(offer(id, rev, 'one-more', 'Run it once more', () => ({ code: id, verb: ONE_MORE }), { staleness: 'exact', expect,
					meaning: 'One more AI run · nothing is sent', ...(dailyFull ? { unavailable: { label: 'Run it once more', reason: `${DAILY_WORDS}.` } } : {}) })),
				'write-own': () => actionIds.push(offer(id, rev, 'write-own', 'Write the reply yourself', input => ({ code: id, verb: 'send', text: requiredText(input) }), { effect: 'sends', staleness: 'exact', expect, input: 'text' })),
				'review-again': () => actionIds.push(offer(id, rev, 'review-again', 'Review again', () => ({ code: id, verb: 'answer', text: 'review again' }))),
				'approve-pr': () => { if (rd && voteN !== undefined && !perPr) actionIds.push(offer(id, rev, 'approve-pr', `Approve PR ${rd.pr}`,
					// PE 19:29:07Z: on an origin-bearing revision Approve sends only the vote, by its id, with nothing else included ({ok,
					// include: [], vote}); include never carries a vote (I7/I8/W5). Legacy keeps "all except the vote" by number.
					() => (positive ? { code: id, verb: 'ok', include: [], vote: pageChangeId(pending[voteAt]) }
						: { code: id, verb: 'ok', ...((except => (except.length ? { except } : {}))(changes.filter(change => change.n !== voteN).map(change => change.n))) }),
					{ effect: 'changes-system', staleness: 'exact', expect, meaning: APPROVE_PR_MEANING })) },
				'post-waiting': () => { if (rd) actionIds.push(offer(id, rev, 'post-waiting', 'Post them', input => {
					// CR B1 (19:22:04Z): an origin-bearing revision posts exactly what is ticked (include; votes are never offered there). The
					// vote exclusion by number is the legacy path only.
					if (positive) return approval(input)
					const asked = approval(input), except = [...new Set([...(asked.except ?? []), ...voteNs])]
					return { ...asked, ...(except.length ? { except } : {}) }
				}, { effect: 'changes-system', staleness: 'exact', expect, input: 'approval' })) },
				'reply-only': () => actionIds.push(offer(id, rev, 'reply-only', 'Send reply only', () => (positive ? { code: id, verb: 'ok', include: [] } : { code: id, verb: 'ok', except: changes.map(change => change.n) }), { staleness: 'exact', expect, effect: 'sends' })),
			}
			const kinds = new Set([cs.primary, ...cs.secondary, ...cs.more].filter((k): k is ActionKind => !!k))
			// L2b B1: beside a draft, the group question is answered by its picker (Save), not by Answer instead.
			if (groupAside) { kinds.delete('answer'); kinds.add('pick') }
			// The reply box sends the owner's own version when it is changed, also when the card opens on the answer and can switch to it.
			if (draft && (cs.editor === 'reply' || cs.mode === 'answer-with-holding')) kinds.add('send-edit')
			for (const kind of kinds) make[kind]?.()
		}		else if (cs.mode === 'working' || wf.job && facts.jobs.get(wf.job)?.state === 'queued' && facts.jobs.get(wf.job)?.retry) {
			// Delegate is working on it (#48): Dismiss in ⋯ stops it and closes the item. While it redrafts (running) he can send his own reply;
			// while a job is queued or running the engine takes no reply yet, so the button is not offered then.
			if (cs.mode === 'working' && wf.state === 'running') actionIds.push(offer(id, rev, 'write-own', 'Write the reply yourself', input => ({ code: id, verb: 'send', text: requiredText(input) }), { effect: 'sends', staleness: 'exact', expect, input: 'text' }))
			actionIds.push(offer(id, rev, 'dismiss', 'Dismiss', () => ({ code: id, verb: 'skip' }), { staleness: 'exact', expect }))
		}
		// R11(3) (HOST e4e224a7): after he drafts a follow-up to someone he waits on, "Keep waiting instead" closes it unsent and the
		// original W entry returns to Waiting on others: the existing verb "wait" on this item with no text, on this exact revision.
		// Offered only where the engine accepts it: an unsent resting or scheduled follow-up reply with exactly one W entry linked to it
		// in its own chat, not held by a terminal, not part of other work, not busy and not shared.
		const keepWaiting = (() => {
			if (!wf.followUp || wf.kind !== 'reply' || wf.sent || (wf.state !== 'needs_human' && wf.state !== 'scheduled') || wf.partOf) return undefined
			if (heldBy(store, wf) === 'window' || pendingParts(store, wf)) return undefined
			const busy = [wf.job, wf.work?.watch].some(jobId => {
				const job = jobId ? facts.jobs.get(jobId) : undefined
				return job?.state === 'queued' || job?.state === 'running' || !!job?.parents.some(parent => { const other = byId.get(parent); return other && other.id !== wf.id && other.state !== 'done' })
			})
			const linked = waitLinks.filter(w => w.item === wf.code)
			return !busy && linked.length === 1 && linked[0].chat.id === wf.chat.id && wf.msgIds.includes(linked[0].msgId) ? linked[0] : undefined
		})()
		if (keepWaiting) actionIds.push(offer(id, rev, 'keep-waiting', 'Keep waiting instead', () => ({ code: id, verb: 'wait' }), { staleness: 'exact', expect,
			meaning: `Closes this follow-up without sending it. ${keepWaiting.to.map(name => name.trim().split(/[\s,]+/)[0]).filter(Boolean).join(', ') || 'They'} ${keepWaiting.to.length > 1 ? 'go' : 'goes'} back to Waiting on others.` }))
		// D-A239 MP1: a PR's own read action on its row of "PRs in this ask": HOST's pr-retry / pr-skip with the PR in nums, on this exact
		// revision (Try now when a read failed; Try again and Skip this PR once it gave up). MP2: each reviewed PR's Approve PR <n> is that
		// PR's vote only (never batched), offered while that PR is approvable (card-facts reviewApproval).
		const unitActions = new Map<number, string[]>(), approveOf = new Map<number, string>()
		// CR B6: the per-PR offers keep the card's hold eligibility: none while a terminal holds the item (card-state's in-terminal offers only
		// Take it back, and the engine refuses them); the review blocks and the PRs list still show.
		const unitOffers = cs.mode !== 'in-terminal'
		if (units && unitOffers && wf.state !== 'done' && !wf.redacted) for (const unit of units) {
			const outcome = unitOutcome(unit).outcome
			const verb = (kind: 'pr-retry' | 'pr-skip', label: string) => offer(id, rev, kind, label, () => ({ code: id, verb: kind, nums: [unit.id] }), { staleness: 'exact', expect }, `${id}/pr-${unit.id}`)
			// New-SKIP (PE §14.6 (a)): an unskipped unit whose review job stopped offers Skip this PR only; the stop's retry stays on the bar.
			const unitJob = !unit.skip && unit.job ? facts.jobs.get(unit.job) : undefined
			const ids = unitJob && jobStopOf(unitJob).stopped ? [verb('pr-skip', 'Skip this PR')]
				: outcome === 'couldnt-read' ? [verb('pr-retry', 'Try now')] : outcome === 'gave-up' ? [verb('pr-retry', 'Try again'), verb('pr-skip', 'Skip this PR')] : []
			if (ids.length) unitActions.set(unit.id, ids)
		}
		// CR B3: the per-PR offers come from each unit's own review, whatever the reply's mode. Approve stays vote-only: an ok on an item whose
		// reply awaits his OK also sends that reply (apply.ts), so while a reply draft waits each block offers Open PR to approve only.
		if (perPr && unitOffers && editable.has(id) && wf.state === 'needs_human' && !wf.redacted && !draft) for (const review of manyReviews) {
			const k = pending.findIndex(effect => isVote(effect.call) && (voteValue(effect.call) ?? 0) >= 5 && !effect.error && prIdOf(effect.call) === review.pr)
			if (k < 0 || !reviewApproval(wf, review).approvable) continue
			const n = changes[k]?.n
			approveOf.set(review.pr, offer(id, rev, 'approve-pr', `Approve PR ${review.pr}`, () => (positive ? { code: id, verb: 'ok', include: [], vote: pageChangeId(pending[k]) }
				: { code: id, verb: 'ok', ...((except => (except.length ? { except } : {}))(changes.filter(change => change.n !== n).map(change => change.n))) }),
			{ effect: 'changes-system', staleness: 'exact', expect, meaning: APPROVE_PR_MEANING }, `${id}/pr-${review.pr}`))
		}
		actionIds.push(offer(id, rev, 'ask', `Ask ${NAME}`, input => ({ code: id, verb: 'ask', text: requiredText(input) }), { input: 'text' }))
		if (reopenable(wf, 'answer')) actionIds.push(offer(id, rev, 'reopen', 'Reopen and draft reply', input => ({ code: id, verb: 'answer', text: requiredText(input) }), { input: 'text', staleness: 'exact', expect }))
		const noteIds = notes(id, id, cardNotes)
		for (const noteId of noteIds) {
			const note = entities.notes[noteId]
			if (note.answer?.trim()) note.useActionId = offer(id, rev, 'use-note', 'Use this in the reply', () => ({ code: id, verb: 'answer', text: `Use this: ${note.answer}` }), { staleness: 'exact', expect: pageDigest(note.answer) }, noteId)
		}
		if (c.openOn || wf.job) actionIds.push(continueOffer(id, rev, 'continue', c.openOn))
		const checkBack = wf.work?.watch ? facts.jobs.get(wf.work.watch) : undefined
		if (active(wf) && checkBack?.every) {
			if (checkBack.endsAt) actionIds.push(offer(id, rev, 'extend-watch', 'Extend 7 days', () => ({ code: id, verb: 'extend' })))
			actionIds.push(offer(id, rev, 'stop-watch', 'Stop', () => ({ code: id, verb: 'unwatch' }), { meaning: 'Stops only this check-back. Work and to-dos stay open.' }))
		}
		if (todoIds.length || openLeft(wf).length) {
			actionIds.push(markTodos(id, wf))
		}
		const replyChanged = wf.state === 'needs_human' && wf.status === PAGE_REPLY_CHANGED
		// A send the engine refused (owner words claiming an approval the PR does not show, an unverifiable PR) says why on the card (bug 10-23 E35).
		const notSent = !replyChanged && wf.state === 'needs_human' && wf.statusReason?.kind !== 'vote-claim' && (!!draft && /^(?:Not sent: |Not sure it was sent)/.test(wf.status) || /^Could not start: /.test(wf.status))
		// Why a waiting draft didn't go out by itself, from the rules and checks that would have sent it (#33).
		// Not for one thread (#27 step 2): its hourly count reads every item, and an action never needs the line.
		const waitCtx = !onlyWfs && draft && wf.state === 'needs_human' && !wf.sent ? policyContext(store, cfg, wf) : undefined
		const waited = waitCtx ? whyWaited(wf, ownerRules, waitCtx).map(pageText) : []
		// D-A281 B1 (PE v1.148 §17.6; SEND's reviewed reviewWaitOf): a PR review's wait line is typed, so the card links it by its kind (none →
		// Add a line; waiting / off → that line). It is the very line whyWaited returned, matched as a whole, never read for its words.
		const reviewWait = waitCtx && wf.intent === 'pr_review' ? (wait => waited.includes(pageText(wait.text))
			? { kind: wait.kind, text: pageText(wait.text), ...(wait.kind === 'waiting' || wait.kind === 'off' ? (line => (line ? { lineId: line.id } : {}))(lineOf(wait.grantId)) : {}) } : undefined)(
			reviewWaitOf('guests' in waitCtx ? { ...wf, chat: { ...wf.chat, guests: waitCtx.guests } } : wf, ownerRules)) : undefined
		const waitedShown = reviewWait ? waited.filter(line => line !== reviewWait.text) : waited
		// The card's single warning line comes from its state; a run that started nothing, and a job that ended with nothing to reply,
		// still say so where no mode names it.
		const shownWarn = cs.warn ? pageText(cs.warn) : undefined
		const attention = replyChanged ? PAGE_REPLY_CHANGED : cs.mode === 'failed' && fx.failure ? undefined : shownWarn
			?? (notSent ? pageText(wf.status) : !draft && job?.state === 'done' && job.result && !job.result.reply && wf.status.endsWith(job.result.summary) ? pageText(job.result.summary) : undefined)
		// L4 B1 (PE 22:12): card-state took its warn out of Why it waited, so a warn this card shows in its place (the reply changed) goes
		// back there first. Not in failed mode: there the warn is the failure's own line, which the failure block draws.
		const lostWarn = shownWarn && attention !== shownWarn && !(cs.mode === 'failed' && fx.failure) ? shownWarn : undefined
		// R10b (PM §2, joint C2): what a review posted, H→M→L (the chip carries the severity, not the "[High]" bracket), five then "and N
		// more"; the reply sent; the PR link. D-A239 MP2 draws one per reviewed PR from the same fields.
		// CR B2: a review block's link is its own PR's (the unit's reference; the item's PR read only when it is that same PR), never the
		// item-level scalar of a multi-unit ask.
		const prUrlOf = (pr: number) => wf.prs ? safeLink(wf.prs.find(unit => unit.id === pr)?.ref?.url) ?? (ref => (ref?.id === pr ? safeLink(ref.url) : undefined))(prOf(store, wf)) : safeLink(prOf(store, wf)?.url)
		const reviewView = (rd: NonNullable<typeof reviewed>, prUrl?: string) => {
			const order = { High: 0, Medium: 1, Low: 2 }
			const posted = rd.posted.toSorted((a, b) => order[a.severity] - order[b.severity]).map(comment => ({ severity: comment.severity, ...(comment.file ? { file: comment.file } : {}), ...(comment.line ? { line: comment.line } : {}),
				text: pageText(comment.text.split('\n')[0].replace(/^\s*\[(?:High|Medium|Low)\]\s*/i, '')), ...((url => (url ? { thread: url } : {}))(safeLink(comment.thread))) }))
			return { pr: rd.pr, reviewedAt: rd.reviewedAt, counts: rd.counts, posted: posted.slice(0, 5), more: Math.max(0, posted.length - 5), to: wf.asker?.name?.split(/\s+/)[0] || 'them',
				...(rd.reply ? { reply: { text: pageText(rd.reply.text), ...((url => (url ? { teams: url } : {}))(safeLink(rd.reply.teams))) } } : {}),
				...(rd.clean ? { clean: true } : {}), ...(rd.fallback ? { fallback: pageText(rd.fallback) } : {}), ...(prUrl ? { prUrl } : {}) }
		}
		// D-A239 MP1: each PR's outcome in the PM's words, from HOST's typed unit (unitOutcome; the gate reason, tries, skip). A failed
		// read's raw error is only its detail (Details), never the line. Done row (PM rule 6): one sentence from the same units.
		const prRows = units?.map(unit => {
			const { outcome, reason } = unitOutcome(unit)
			const why = reason === 'author' ? "it's your PR" : reason === 'declined' ? 'you declined it in Azure DevOps' : reason === 'group-approved' ? 'your group already approved it'
				: reason === 'no-link' ? `there's no link to it, so ${NAME} can't open it` : reason === 'owner' ? 'you skipped it' : reason === 'not-asked' ? 'nobody asked you to review it' : "you aren't a reviewer on it"
			const line = outcome === 'checking' ? "checking you're a reviewer…" : outcome === 'reviewing' || outcome === 'reviewed' ? outcome : outcome === 'not-reviewing' ? `not reviewing: ${why}`
				: outcome === 'couldnt-read' ? `couldn't read it. ${NAME} tries again at the next check.` : `couldn't read it after ${unit.tries} tries.`
			const short = { checking: 'checking', reviewing: 'reviewing', reviewed: 'reviewed', 'not-reviewing': 'not reviewing', 'couldnt-read': "couldn't read", 'gave-up': 'gave up' }[outcome]
			return { pr: unit.id, outcome, line, short, ...((title => (title ? { title } : {}))(pageText(unit.title))), ...((url => (url ? { url } : {}))(safeLink(unit.ref?.url))),
				...(outcome === 'couldnt-read' || outcome === 'gave-up' ? (detail => (detail ? { detail } : {}))(pageText(unit.failure)) : {}), ...((ids => (ids ? { actionIds: ids } : {}))(unitActions.get(unit.id))) }
		})
		if (prRows && wf.state === 'done' && manyReviews.length) {
			const comments = manyReviews.reduce((sum, review) => sum + review.done.posted.length, 0), skipped = prRows.filter(row => row.outcome !== 'reviewed').map(row => `PR ${row.pr}`)
			const list = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
			reviewRows.set(id, [`Reviewed ${list(manyReviews.map(review => `PR ${review.pr}`))}${wf.asker?.name ? ` for ${wf.asker.name.split(/\s+/)[0]}` : ''}`, `${comments} comment${comments === 1 ? '' : 's'}`,
				...(wf.sent ? ['replied'] : []), ...(skipped.length ? [`${list(skipped)} not reviewed`] : [])].join(' · '))
		}
		// D-COST JB1/JB2 row (PM R3/A2 words): "Can't do: no tool can <need> · <day>" (or "no tool for this step"), or "Stopped: it reached
		// its limit of <N> AI runs · <day>" (… of <T> tokens when the token limit was the one reached).
		const stopRow = stop && stopped?.stopped ? (stop.kind === 'capability' ? `Can't do: ${stop.need ? `no tool can ${stop.need}` : 'no tool for this step'}`
			: (limit => limit?.runs !== undefined && (stop.runs ?? 0) >= limit.runs || limit?.tokens === undefined ? `Stopped: it reached its limit of ${limit?.runs ?? stop.runs ?? 0} AI runs` : `Stopped: it reached its limit of ${limit.tokens.toLocaleString('en-US')} tokens`)(stopped.stopped.limit)) + ` · ${shortDay(stop.at)}` : undefined
		if (stopRow && (cs.mode === 'stopped' || cs.mode === 'held')) stopRows.set(id, stopRow)
		// CR COST1 B1: what the stopped job tried, through the canonical stored-report reader: its report's blocker (a sticky stop is a goal
		// not met) with any retry history it kept, read in plain words.
		const stopTried = stopJob ? normalizeReport({ key: stopJob.key, state: stopJob.state, updatedAt: stopJob.updatedAt, ...(stopJob.retry ? { retry: stopJob.retry } : {}),
			...(stopJob.result ? { result: { ...stopJob.result, goalMet: false } } : {}) }).failure?.tried ?? stopJob.retry?.tried ?? [] : []
		// A76 sent history (decision 55): the reply that actually went, once its Undo window is over and no newer turn replaced it. Only from
		// wf.sent's typed fields, never from read-only status, copy or status text; otherwise undefined and today's card stays.
		const shownSent = (sent => sent && sent.msgId && !(sent.undoUntil && Date.parse(sent.undoUntil) > Date.now()) && (sent.sendText ?? sent.text) && (!wf.revAt || wf.revAt <= sent.at) ? sent : undefined)(wf.sent)
		entities.items[id] = {
			// CR COST1 B2: a stopped job nobody waits on shows no draft or editor.
			...rest, rev, id, personId, chatId, draftId: stop && cs.mode === 'stopped' && !stop.asker ? undefined : draftId, changeIds, effectIds, todoIds, workId, actionIds, ...(positive ? { wys: 'groups' as const } : {}),
			context,
			earlier: earlierLine(rest.earlier, id),
			askAt: asksAt.get(id),
			// COST-USAGE AU4: what this item's attributed runs used (web/numbers.ts usedLines); none when no run was attributed.
			...((used => (used ? { used } : {}))(usedOf.get(wf.id))),
			// A76 sent history (decision 55): the reply that actually went (shownSent, below), from wf.sent's typed fields only.
			...((sent => sent
				? { sent: { at: sent.at, text: (sent.sendText ?? sent.text)!, by: sent.byRule ? 'rule' as const : 'you' as const, ...(sent.holding ? { holding: true } : {}),
					// D-A281 B3: the line it was sent by, as frozen at send, and that line now: its link, or "(edited since)" / "(line deleted)".
					...(sent.byRule && sent.rule ? { rule: frozenRule(sent.rule) } : {}),
					...((teams => (teams ? { teams } : {}))(wf.chat.id && (!wf.chat.test || teamsChat(wf.chat.id)) ? safeLink(messageLink(wf.chat.id, sent.msgId)) : undefined)) } } : {})(shownSent)),
			status: pageText(c.status),
			attention,
			// Step 6: back from his terminal window, a status line only.
			...(fx.returned ? { returned: fx.returned } : {}),
			// L1b: the card draws a vote claim under the reply editor and keeps Send off until the reply changes.
			...(fx.voteGap ? { voteGap: { text: pageText(fx.voteGap.held && voteClaim ? voteClaim.line : fx.voteGap.text), held: fx.voteGap.held, ...(voteClaim ? { quote: voteClaim.quote } : {}) } } : {}),
			attentionKind: replyChanged ? 'reply-changed' : cs.mode === 'agent-wait' ? 'agent-setup' : cs.mode === 'failed' || cs.mode === 'not-sent' || notSent ? 'run-failed' : attention && attention === shownWarn && cs.warnKind === 'reason' ? 'reason' : undefined,
			// The current failure, whatever recorded it, with the routes it tried, the PR to review by hand, and whether some read tools are off (#17 b).
			// PE A R31: line is the failure words from structured fields only (the PM fallback otherwise); why and tried stay for Details.
			runFailed: cs.mode === 'failed' && fx.failure ? { at: fx.failure.at, line: pageText(failLine(fx.failure)), why: pageText(fx.failure.why), ...(fx.failure.tried.length ? { tried: fx.failure.tried.map(pageText) } : {}), ...(fx.failure.review ? (u => (u ? { review: u } : {}))(safeLink(prOf(store, wf)?.url)) : {}), ...(fx.failure.job && (cfg.agent.toolsTrimmed || cfg.agent.deny?.length) ? { toolsOff: true } : {}) } : undefined,
			mode: cs.mode, editor: cs.editor, block3: cs.block3,
			...(cs.strip ? { working: { doing: pageText(cs.strip.doing).replace(/^Working:\s*/i, ''), ...(cs.strip.since ? { since: cs.strip.since } : {}),
				// #48b (PM A R21): a redraft says so, shows his answer ("The owner picked: ..." reads as his pick) from when it started, and the
				// draft it replaces (the stored one: the page's copy drops a draft its latest run no longer offers), for "Previous draft" and to
				// prefill Write the reply yourself.
				...(cs.strip.kind ? { kind: cs.strip.kind } : {}),
				...(cs.strip.kind === 'redraft' && wf.ownerAnswer ? { answer: { text: pageText(wf.ownerAnswer.replace(/^The owner picked:\s*/, 'You picked: ')), ...(wf.workingSince ? { at: wf.workingSince } : {}) } } : {}),
				...((text => (text ? { previous: text } : {}))(stored.workflows.find(w => w.id === wf.id)?.draft?.text)) } } : {}),
			prLabel,
			// #50 + the Left-for-you contract (0.2.46): to-dos he keeps stay in block 3; what Delegate won't make or couldn't prepare is a
			// wf.left line (HOST's merge), worded here from its fields (rule 2) with its source, Why? and one kind button. No copy parsing (rule 1).
			todos: normalizeReport({ todos: c.todos ?? [], context: c.context ?? [], intent: wf.intent }).todos,
			...((lines => (lines.length ? { leftLines: lines } : {}))(leftLinesOf(wf))),
			// #50: SEND's repaired comments (its exact status); the card says so above them and offers the post on this revision.
			...(wf.status === REPAIRED ? { repaired: true } : {}),
			// R10b (PM §2, joint C2): what the review posted, H→M→L (the chip carries the severity, not the "[High]" bracket), five then
			// Closed (HOST's close on his vote or the PR closing, 02:02 contract): the Done card keeps the Posted list and the reply, read-only,
			// under its status. Open: where Open PR sits, and which changes are votes (never waiting comments).
			...((rd => rd ? { reviewDone: (() => {
				const closed = wf.state === 'done', view = reviewView(rd, prUrlOf(rd.pr))
				const n = view.posted.length + view.more, counts = rd.counts
				if (!closed && !perPr) reviewRows.set(id, `PR ${rd.pr} waits for your approval · ${n ? `posted ${n} comment${n === 1 ? '' : 's'} (${counts.high} high, ${counts.medium} medium, ${counts.low} low)` : 'no comments needed'}${rd.reply ? ` · replied to ${view.to}` : ''}`)
				return { ...view, ...(closed ? { closed: true } : { ...(cs.openPr ? { openPr: cs.openPr } : {}), ...(voteKs.length ? { voteChangeIds: voteKs.map(k => changeIds[k]) } : {}) }) }
			})() } : {})(rd ?? (wf.state === 'done' ? reviewed : undefined))),
			// D-COST: the stop the card and its row show: the row line, the asker's news (with its message in Teams) and what the job tried.
			...(stopRow && (cs.mode === 'stopped' || cs.mode === 'held') ? { stop: { kind: stop!.kind, row: stopRow, ...((tried => (tried.length ? { tried } : {}))(stopTried.map(pageText).filter(Boolean))),
				...(stop!.news ? { news: { who: stop!.news.who, at: stop!.news.at, again: stop!.news.again, ...((teams => (teams ? { teams } : {}))(wf.chat.id && (!wf.chat.test || teamsChat(wf.chat.id)) ? safeLink(messageLink(wf.chat.id, stopNews!.id)) : undefined)) } } : {}) } } : {}),
			// D-A239 MP1/MP2: the PRs in this ask, and one review per reviewed PR (in ask order) with its own Approve and, once made, when.
			...(prRows ? { prs: prRows } : {}),
			// CR B3: shown whatever the reply's mode. CR B4: "Approved" only from a made positive vote on this PR for the reviewed head, made
			// after that review; history (another head, a non-approving vote, a vote with no head) never claims it or hides a current offer.
			...(perPr ? { reviews: manyReviews.map(review => {
				const approved = (wf.effects ?? []).find(effect => effect.done && !effect.error && isVote(effect.call) && (voteValue(effect.call) ?? 0) >= 5 && prIdOf(effect.call) === review.pr &&
					!!effect.head && sameHead(effect.head, review.done.head) && effect.done.at >= review.done.reviewedAt)?.done?.at
				return { ...reviewView({ pr: review.pr, ...review.done }, prUrlOf(review.pr)), ...(wf.state === 'done' ? { closed: true } : {}),
					...((actionId => (actionId ? { approveActionId: actionId } : {}))(approveOf.get(review.pr))), ...(approved && !approveOf.has(review.pr) ? { approved } : {}) }
			}) } : {}),
			// #28 (owner A61, SEND eee5639d): what the review found, each new or already an open thread on the PR, and whether a vote was
			// recommended, so the card can say what Send does on the PR. The PR meaning comes from here, not from effectLine (PE 19:12).
			...((pr => pr && job?.result?.findings ? { prReview: { pr, voteRecommended: !!job.result.voteRecommendation && !['none', 'NoVote'].includes(job.result.voteRecommendation.vote),
				findings: job.result.findings.map(finding => ({ text: pageText(finding.text), ...(finding.file ? { file: finding.file } : {}), ...(finding.line ? { line: finding.line } : {}),
					// findingFor move (PE 01:22): the pending comment change Send would post for this finding, by SEND's own findingFor (R25): same
					// file, same line, same text once the [High] tag and spacing are cleaned. posts: that change exists and isn't refused; the card
					// adds only whether he left it ticked.
					...((k => (k >= 0 ? { posts: !entities.changes[changeIds[k]]?.error, changeId: changeIds[k] } : {}))(pending.findIndex(effect => !isVote(effect.call) && findingFor(effect, [finding]) === finding))),
					...(finding.thread ? { thread: { author: finding.thread.author, at: finding.thread.at, ...((url => (url ? { url } : {}))(safeLink(finding.thread.url))) } } : {}) })) } } : {})(Number(/^PR (\d+)/.exec(prLabel ?? '')?.[1]) || undefined)),
			question: c.question === undefined ? undefined : (failedJobDirections(wf) ? forPage(c.question) : pageText(c.question)) || undefined,
			...((chips => (chips.length && c.question !== undefined && !groupPick ? { answerChips: chips } : {}))(hintChips(wf, id, c.question))),
			choices: choices && { ...choices, prompt: forPage(choices.prompt), options: choices.options.map(option => ({ ...option, id: pageOptionId(option) })), ...(groupPick ? { group: true } : {}) },
			...(groupPick ? { question: undefined } : {}),
			sourceIds: sources(id, id, why.sources), noteIds,
			primaryActionId: (editable.has(id) || cs.mode === 'todo' ? [cs.primary ?? ''] : c.ownReply ? [] : ['reopen']).map(kind => `${id}/${kind}`).find(key => actionIds.includes(key)),
			// A holding reply's reason is part of Why, not a warning (rule 13).
			// CR 19:19:08 B2: where the card shows the bound source (a reply his line sent: its frozen line; a PR review's typed wait line), the
			// engine's stored permission reason (wf.decision.reason, which may name a rule id) is not shown as Why. CR 20:44:27 B2: only when
			// that source is actually shown for the current turn (the same shownSent fact as the bubble); a newer draft after an older automatic
			// reply keeps its own public Why.
			why: { reason: shownSent?.byRule && shownSent.rule || reviewWait ? undefined : asSentence(why.reason) ?? (cs.mode === 'holding' ? pageText(wf.status) || undefined : undefined), confidence: why.confidence, gaps: why.gaps, searched: why.searched,
				// Details › Why it waited: the card's own lines (the ones not shown as the warn), then the rules that kept it from sending,
				// one sentence per line (L6).
				...(lines => lines.length ? { waited: lines.join('\n') } : {})((own => [...(own.length ? ['Why it waited:', ...own] : []),
					...(waitedShown.length || reviewWait ? [...(own.length ? [] : ['Why it waited:']), ...waitedShown.map(line => asSentence(line)!).filter(Boolean)] : [])])(
					[...(lostWarn ? [lostWarn] : []), ...(cs.waited ? cs.waited.replace(/^Why it waited:\n/, '').split('\n').map(line => pageText(line)).filter(Boolean) : [])])),
				...(reviewWait ? { reviewWait } : {}) }, teams: safeLink(c.teams),
		}
	}
	// Spec S3: the sections say whose move it is, Delegate's queued rows say Delegate does them, and a group message is "Posted to everyone".
	const s3 = (row: NextRow): NextRow => {
		const subject = byCode.get(row.act), first = (subject?.asker?.name ?? '').split(/\s+/)[0]
		const headline = subject?.startedBy === 'room' && subject.state === 'running' && first ? `${NAME} is checking whether ${first}'s message needs you`
			: row.headline.replace(/^Draft a reply to /, `${NAME} will draft a reply to `)
		return { ...row, headline, chips: row.chips.map(chip => chip.kind === 'room' ? { ...chip, text: 'Posted to everyone' } : chip) }
	}
	// Rows that wait on Delegate are Delegate's, never "Waiting on others" (spec S3); watches and reminders stay with others.
	const onDelegate = (row: NextRow) => row.kind === 'waiting-delegate' || row.kind === 'working'
	// A206 (R11(3), PM §3): on the page the follow-up only drafts and says so, "nudge" is retired (the chat words stay as aliases), and a
	// wait's Close is Stop waiting. next.ts keeps its words for the HTML page and its goldens.
	const firstOf = (names?: string) => names?.trim().split(/[\s,]+/)[0] || undefined
	const followTo = (code: string) => code.startsWith('W') ? firstOf(base.waiting.find(w => w.code === code)?.to) : firstOf(byCode.get(code)?.work?.waitingOn?.who ?? byCode.get(code)?.asker?.name)
	const pageLabel = (label: string, code: string, section: string) => label === 'Draft a nudge' ? `Draft a follow-up${(to => (to ? ` to ${to}` : ''))(followTo(code))}` : label === 'Close' && section === 'waiting' ? 'Stop waiting' : label
	const sections: Snapshot['sections'] = ([
		['move', 'Waiting on you', next.move], ['working', `${NAME} is on it`, [...next.working, ...next.waiting.filter(onDelegate).map(row => ({ ...row, section: 'working' as NextRow['section'] }))]],
		['waiting', 'Waiting on others', next.waiting.filter(row => !onDelegate(row))], ['catchup', 'Catch up', next.catchup.rows],
		// COUNT58 B3-min (Designer CC1, DD3): his own steps that ask nothing now, a collapsed group at the end of Now, not in need you.
		['left', 'Left for you', next.left],
	] as const).map(([id, label, rows]) => ({
		id, label, total: rows.length, ids: rows.map(s3).map((row, position) => {
			const { who, primary, more, draft: _draft, rev: rowRev, work, todos, ...rest } = row
			const actionIds: string[] = []
			for (const [n, action] of [primary, ...(more ?? [])].entries()) {
				if (!action?.command) continue
				const parsed = parseVerbs(action.command)
				if (parsed?.length !== 1) throw new Error(`Unsupported server row action: ${row.kind}`)
				const offered = parsed[0]
				const code = offered.code ?? row.act, subject = byCode.get(code)
				if (offered.verb === 'watch' && row.section === 'catchup' && subject?.fyi) {
					actionIds.push(watchFyi(subject, action.label, `row:${row.code}`, presentationRev(subject, cfg), undefined, false))
					continue
				}
				if (offered.verb === 'close') {
					// A "Left for you" row opens its card, where he ticks what he did under its explainer line (PM 20:00): no Mark done here.
					if (row.kind === 'todo') continue
					actionIds.push(closeWork(code, `row-${n}`, `row:${row.code}`, pageLabel(action.label, code, row.section)))
					continue
				}
				const canonical = offered.verb === 'ok' ? entities.actions[`${code}/approve`] : undefined
				if (canonical && !offered.nums?.length && !offered.except?.length) { actionIds.push(canonical.id); continue }
				const exact = ['ok', 'send', 'edit', 'pick', 'undo'].includes(offered.verb) && !code.startsWith('W')
				const auto = store.automation(code)
				if (auto && (offered.verb === 'pause' || offered.verb === 'resume')) { actionIds.push(`${code}/toggle`); continue }
				const rev = subject ? presentationRev(subject, cfg) : auto ? automationApprovalRev(auto) : ''
				const item = entities.items[code]
				actionIds.push(offer(code, rev, `row-${n}`, pageLabel(action.label, code, row.section), input => ({
					...offered, code,
					...(offered.text?.includes('{text}') ? { text: offered.text.replace('{text}', () => requiredText(input)) } : {}),
				}), {
					input: action.command.includes('{text}') ? 'text' : undefined,
					...(exact ? { staleness: 'exact' as const, expect: expectations.get(code) ?? (auto ? automationApprovalRev(auto) : undefined) } : {}),
					effect: offered.verb === 'ok' && !code.startsWith('W') ? item?.draftId && !item.changeIds.length ? 'sends' : 'changes-system' : 'local',
				}, `row:${row.code}`))
			}
			if (row.section === 'waiting') actionIds.push(...(entities.items[row.act]?.actionIds.filter(id => ['extend-watch', 'stop-watch'].includes(entities.actions[id].kind)) ?? []))
			// COUNT58 (Designer CC2.6): open in a terminal, the row's one step is Take it back; nothing is sent.
			if (row.kind === 'in-terminal') actionIds.unshift(...(entities.items[row.act]?.actionIds.filter(id => entities.actions[id].kind === 'take-back') ?? []))
			const todoIds = (todos ?? []).map(todo => {
				const key = `${todo.code}/todo/${todo.id}`
				// The item's own entry (with where it came from) wins over the row's plain copy of the same to-do.
				entities.todos[key] ??= { ...todo, id: key, itemId: todo.code, done: false }
				return key
			})
			const workId = work ? `row:${row.code}/work` : undefined
			if (work && workId) {
				const planIds = work.steps.map((step, n) => {
					const key = `${workId}/plan/${n}`
					entities.planSteps[key] = { ...step, what: plainText(step.what), where: whereWords(row.act, step.where), id: key, workId, position: n, ...(step.owner.kind === 'others' && asYou(step.owner.text) === 'you' ? { owner: { kind: 'you' as const } } : {}) }
					return key
				})
				const stepIds = work.happened.map((step, n) => {
					const key = `${workId}/step/${n}`
					entities.workSteps[key] = { ...step, what: plainText(step.what), id: key, workId }
					return key
				})
				const reportActionId = work.report ? offer(row.act, entities.items[row.act]?.rev ?? rowRev ?? '', 'report', 'Draft my report', input => {
					if (!input?.result) throw new IntentError(422, 'Choose a result first.')
					return { code: row.act, verb: 'answer', text: `${input.result}${input.text?.trim() ? `: ${input.text}` : ''}` }
				}, { input: 'report' }) : undefined
				const cardWorkId = entities.items[row.act]?.workId, cardWork = cardWorkId ? entities.work[cardWorkId] : undefined
				entities.work[workId] = { ...cardWork, id: workId, itemId: row.act, goal: work.goal, due: cardWork?.due ?? false, proposed: cardWork?.proposed ?? false, planIds, stepIds, total: work.total, yours: work.yours, then: work.then, reportActionId }
			}
			const fresh = freshOf(row, rowMark(base, row))
			const authoritative = placementOf.get(row.code)
			if (!authoritative) throw new Error(`The row ${row.code} has no authoritative server placement.`)
			const workflow = byCode.get(row.act), askedAt = asksAt.get(row.act)
			// A206 row line 3 (PM §3): "Waiting on Tian since Tue · asked: "<short ask>"", and "follow up" for "nudge" in a no-news row.
			const waitEntry = row.act.startsWith('W') ? base.waiting.find(w => w.code === row.act) : undefined
			const waitLine = waitEntry && `Waiting on ${waitEntry.to.split(/,\s*/).map(name => firstOf(name)).filter(Boolean).join(', ') || 'them'} since ${shortDay(waitEntry.at)} · asked: "${waitEntry.text.replace(/\s+/g, ' ').trim().slice(0, 80)}${waitEntry.text.length > 80 ? '…' : ''}"`
			const headline = (failedJobDirections(workflow) && row.kind === 'question' ? forPage(row.headline) :
				pageText(stopRows.get(row.act) ?? reviewRows.get(row.act) ?? waitLine ?? (row.kind === 'todo' ? todoHeadline(firstLeft(byCode.get(row.act)!)!.text) : row.headline.replace(/: nudge, wait, or close\?$/, ': follow up, wait, or close?')))) || 'Review this item'
			const nextWhat = pageText(row.next?.what).replace(/\s+/g, ' ').trim(), owner = row.next?.owner
			const terminalSince = row.kind === 'in-terminal' && workflow ? (store.openWindow(workflow.id) ?? (workflow.job ? store.openWindow(workflow.job) : undefined))?.since : undefined
			const nextText = !owner ? undefined : owner.kind === 'others' ? pageText(owner.text).replace(/\s+/g, ' ').trim() :
				owner.kind === 'you' ? nextWhat ? `You: ${nextWhat}` : 'You' :
					owner.kind === 'nobody' ? nextWhat || `nobody has started this; Do it now hands it to ${NAME}` :
						!nextWhat ? NAME : /^(after|back)\b/.test(nextWhat) ? nextWhat : `${NAME} ${nextWhat}`
			entities.placements[row.code] = {
				...rest, ...(terminalSince && rest.next ? { next: { ...rest.next, at: terminalSince } } : {}), headline, nextText: row.kind === 'in-terminal' ? `You're working on this in a terminal${terminalSince ? ' · since {at}' : ''}` : nextText, warn: row.warn ? pageText(row.warn) : undefined, facts: {
					...row.facts, ...(row.facts.verb === 'asked' && workflow ? { at: askedAt ?? workflow.createdAt, verb: askedAt ? 'asked' : 'item created' } : {}),
					notes: row.facts.notes?.map(note => ({ ...note, text: pageText(note.text) })),
				},
				chips: [...row.chips, ...(fresh ? [{ kind: fresh, text: fresh === 'back' ? 'Back to you' : 'New' }] : [])],
				id: row.code, subjects: authoritative.subjects, position, personId: who ? person(row.act, who) : undefined, rowRev, actionIds, todoIds, workId, teams: safeLink(row.teams),
			}
			if (row.kind === 'track' && actionIds[0]) {
				const item = entities.items[row.act]
				item.actionIds.unshift(actionIds[0])
				item.primaryActionId = actionIds[0]
				const skip = item.actionIds.map(id => entities.actions[id]).find(action => action.kind === 'dismiss')
				if (skip) skip.label = 'Skip'
			}
			return row.code
		}),
	}))
	const moveSection = sections.find(section => section.id === 'move')
	if (moveSection) {
		const key = (id: string) => {
			const row = entities.placements[id], item = entities.items[row.act]
			return { at: item ? displayedAt(item).at : row.facts.at, code: item?.code ?? row.act }
		}
		moveSection.ids.sort((a, b) => needsOrder(key(a), key(b)))
		moveSection.ids.forEach((id, position) => { entities.placements[id].position = position })
	}
	// Designer CC4 (c): Left for you lists the oldest step first by the date its row shows ("from <first>, <day>"), ties by the item's
	// opened time; positions follow the order.
	const leftSection = sections.find(section => section.id === 'left')
	if (leftSection) {
		const key = (id: string) => [entities.placements[id].facts.at, byCode.get(entities.placements[id].act)?.createdAt ?? ''] as const
		leftSection.ids.sort((a, b) => key(a)[0].localeCompare(key(b)[0]) || key(a)[1].localeCompare(key(b)[1]))
		leftSection.ids.forEach((id, position) => { entities.placements[id].position = position })
	}
	const closed = placed.filter(placement => placement.section === 'done')
	for (const [position, placement] of closed.entries()) entities.placements[placement.code] = {
		id: placement.code, code: placement.code, act: placement.act, section: placement.section, rule: placement.rule, subjects: placement.subjects,
		position, kind: 'closed', headline: reviewRows.get(placement.act) ?? placement.title, facts: { who: placement.who, where: placement.chat, at: placement.at },
		chips: [], todoIds: [], actionIds: [],
	}
	sections.push({ id: 'done', label: 'Done', total: closed.length, ids: closed.map(placement => placement.code) })
	const activityCounts = new Map<string, number>()
	for (const row of base.done) {
		const { who, notes: historyNotes, why, sentId: _sentId, earlier: _earlier, ...rest } = row
		const wf = byCode.get(row.code)
		const activity = `${row.code}/${row.kind}/${row.at}`, n = activityCounts.get(activity) ?? 0
		activityCounts.set(activity, n + 1)
		const id = row.sentId ? `sent:${hashOf(`${wf?.chat.id ?? ''}|${row.sentId}`)}` : wf?.sent?.at === row.at && (row.kind === 'reply' || row.kind === 'review') ? `sent:${hashOf(`${wf.chat.id}|${wf.sent.msgId}`)}` : `${activity}/${n}`
		const rev = wf ? presentationRev(wf, cfg) : row.at
		const actionIds: string[] = []
		if (row.undoUntil && Date.parse(row.undoUntil) > Date.now()) actionIds.push(offer(row.code, rev, 'undo', 'Undo', () => ({ code: row.code, verb: 'undo' }), { staleness: 'exact', expect: rev, effect: 'changes-system', expiresAt: row.undoUntil, meaning: 'Removes this reply from the chat. Changes already made are not reversed.' }))
		if (row.kind === 'catchup') actionIds.push(offer(row.code, rev, 'needs-me', 'Needs me', () => ({ code: row.code, verb: 'mine' })))
		if (row.kind === 'catchup' && wf && (!wf.watchedAs || !byCode.get(wf.watchedAs) || byCode.get(wf.watchedAs)?.state === 'done')) actionIds.push(watchFyi(wf, 'Start watching', id, rev, { target: row.watch?.target || row.sentence, until: row.watch?.until }))
		if (row.kind === 'learned' && store.proposal(row.code)?.state === 'applied') actionIds.push(`${row.code}/undo-facts`)
		// An earlier reply of an item that is open again is history: feedback acts on the item's current reply, not this one.
		for (const [kind, label] of [['wrong', 'Wrong'], ['incomplete', 'Incomplete'], ['unneeded', 'Not needed']] as const) {
			if ((row.kind === 'reply' || row.kind === 'review') && !row.earlier) actionIds.push(offer(row.code, rev, kind, label, input => ({ code: row.code, verb: kind, text: input?.text }), {
				input: 'feedback', staleness: 'exact', expect: rev, effect: kind === 'unneeded' ? 'changes-system' : 'local',
				needsConfirm: kind === 'unneeded',
				meaning: kind === 'unneeded' ? 'Marks this reply as unnecessary and removes it if its Undo window is still open. Changes already made are not reversed.' : 'Drafts a follow-up for your approval. Nothing is sent yet.',
			}))
		}
		const current = wf?.sent?.at === row.at && (row.kind === 'reply' || row.kind === 'review'), checks = current ? wf!.sent!.checks?.map(check => pageText(`Sent. ${check}`)).filter(Boolean) : undefined
		// D-A239 MP3 Done row: a closed ask that named two or more PRs reads the PM's one sentence (the reply he sent stays under it).
		const prsDone = current && wf!.state === 'done' && (wf!.prs?.length ?? 0) >= 2 ? reviewRows.get(row.code) : undefined
		if (prsDone) { rest.sentence = prsDone; rest.ask = undefined }
		// CR 19:19:08 B1/B2: THIS activity's own send by his line (it is the item's current sent reply, same message), with its frozen line;
		// then its Why does not show the engine's stored permission reason. An older activity never borrows a newer reply's line.
		const sentBecause = current && wf!.sent!.byRule && wf!.sent!.rule && (!row.sentId || row.sentId === wf!.sent!.msgId) ? frozenRule(wf!.sent!.rule) : undefined
		entities.doneEntries[id] = { ...rest, text: current ? wf!.sent!.sendText ?? rest.text : rest.text, ...(checks?.length ? { checks } : {}), ...(sentBecause ? { sentBecause } : {}), fresh: isNew(row, seenIn(base), itemSeen(base)), ...((used => (used ? { used } : {}))(wf ? usedOf.get(wf.id) : undefined)), id, personId: person(row.code, who), actionIds, sourceIds: sources(row.code, id, why?.sources ?? []), noteIds: notes(row.code, id, historyNotes ?? []), why: why && { reason: sentBecause ? undefined : why.reason, confidence: why.confidence, gaps: why.gaps, searched: why.searched }, teams: safeLink(row.teams), href: safeLink(row.href) }
	}
	for (const w of base.watching) entities.watches[w.code] = {
		...w, id: w.code, actionIds: [
			offer(w.code, w.rev, 'stop-watch', 'Stop watching', () => ({ code: w.code, verb: 'skip' })),
			offer(w.code, w.rev, 'extend-watch', 'Extend 7 days', () => ({ code: w.code, verb: 'extend' })),
			offer(w.code, w.rev, 'interval', 'Save interval', input => ({ code: w.code, verb: 'every', text: requiredText(input) }), { input: 'interval' }),
		],
	}
	for (const a of base.automations) entities.automations[a.code] = {
		...a, id: a.code, actionIds: [
			...(a.state === 'proposed' ? [] : [offer(a.code, a.rev, 'toggle', a.state === 'paused' ? 'Resume' : 'Pause', () => ({ code: a.code, verb: a.state === 'paused' ? 'resume' : 'pause' }), { staleness: 'exact', expect: automationApprovalRev(store.automation(a.code)!) })]),
			offer(a.code, a.rev, 'end', 'End', () => ({ code: a.code, verb: 'skip' })),
		],
	}
	const readyProposals = new Map(base.knowledge.map(proposal => [proposal.code, proposal]))
	for (const proposal of onlyWfs ? [] : store.proposals()) {
		const k = readyProposals.get(proposal.code) ?? knowledgeCard(proposal)
		const factIds = k.facts.map((fact, n) => {
			const id = `${k.code}/fact/${n}`
			entities.facts[id] = { ...fact, id, proposalId: k.code, href: safeLink(fact.href) }
			return id
		})
		const revision = proposalApprovalRev(proposal)
		const actionIds = proposal.state === 'needs_human' ? [
			offer(k.code, revision, 'save-facts', 'Save selected facts', input => {
				const excluded = input?.excluded ?? []
				if (excluded.some(n => n > k.facts.length)) throw new IntentError(422, 'That fact is not offered.')
				return { code: k.code, verb: 'ok', ...(excluded.length ? { except: excluded } : {}) }
			}, { staleness: 'exact', input: 'approval', expect: revision, selection: { total: k.facts.length, verb: 'Save', singular: 'fact', plural: 'facts', suffix: '', empty: 'Nothing selected', allowEmpty: false } }),
			...(k.facts.length === 1 ? [offer(k.code, revision, 'edit-fact', 'Save your version', input => ({ code: k.code, verb: 'edit', text: requiredText(input) }), { input: 'text', staleness: 'exact', expect: revision })] : []),
			offer(k.code, revision, 'skip-facts', 'Skip', () => ({ code: k.code, verb: 'skip' })),
		] : proposal.state === 'applied' ? [offer(k.code, revision, 'undo-facts', 'Undo learned facts', () => ({ code: k.code, verb: 'undo' }), { staleness: 'exact', expect: revision })] : []
		entities.knowledgeProposals[k.code] = { id: k.code, code: k.code, rev: revision, topic: k.topic, home: k.home, state: proposal.state, factIds, actionIds }
	}
	// D-COST JB3 (Designer; PM A3): the daily AI run limit, reached, is a Health fact in the header pill: never dismissable, gone the next
	// day by itself. Its popover line links to the limit's row in Settings.
	if (dailyFull) entities.health['daily-limit'] = { id: 'daily-limit', short: 'Daily AI limit reached', text: `${DAILY_WORDS} ›`, lead: DAILY_LEAD, settings: 'system', actionIds: [] }
	for (const h of base.health) {
		const actionIds = h.fix ? [tool('', `health:${h.key}`, h.fix.label, () => actResult(store, h.fix!.command, undefined, 'page'), undefined, 'page', pageDigest(h))] : []
		entities.health[h.key] = { id: h.key, text: h.text, since: h.since, actionIds }
	}
	for (const w of base.waiting) entities.waiting[w.code] = { ...w, id: w.code, link: safeLink(w.link), actionIds: [
		// A206 (R11(3)): the follow-up only drafts, for his OK; Stop waiting ends the wait. Nothing here sends.
		offer(w.code, '', 'follow-up', `Draft a follow-up to ${(w.to.split(/,\s*/)[0] ?? '').split(/\s+/)[0] || 'them'}`, () => ({ code: w.code, verb: 'ok' })),
		offer(w.code, '', 'dismiss-waiting', 'Stop waiting', () => ({ code: w.code, verb: 'skip' })),
	] }
	for (const ch of base.channels) {
		const id = `channel:${hashOf(ch.link)}`
		entities.channels[id] = { ...ch, id, actionIds: [tool('', 'stop-channel', 'Stop watching', () => {
			if (!parseChannelLink(ch.link)) throw new IntentError(422, 'This channel link cannot be read.')
			return { accepted: true, text: watchChannel(store, ch.link, true) }
		}, undefined, id, pageDigest(ch))] }
	}
	const wdd = wddView(store, base.seen ?? {})
	// WDD N2 (Designer D3/D8; PE E5, v1.98): Not right? › "It shouldn't have done this by itself" › Stop doing this, through the reviewed W5
	// ways.stopFromAction, exact on his line's current text; then its 6 s Undo through the existing delete / turn-on, exact on the stop
	// line. Reminders (Pause / End) and Wrong / Incomplete come with HOST H3.
	const wddActionIds = new Map<string, string[]>()
	for (const row of wdd.rows) {
		const key = `wdd:${row.id}`, ids: string[] = [], b = row.because
		if (row.stoppable && b.kind === 'line' && b.lineHash && !row.stopped) {
			const hash = b.lineHash
			ids.push(tool(key, 'wdd-stop', 'Stop doing this', input => {
				const scope = requiredText(input)
				if (scope !== 'chat' && scope !== 'person' && scope !== 'never') throw new IntentError(422, 'Choose where to stop doing this.')
				const done = stopFromAction(store, row.id, scope, hash)
				if (!done.ok) throw new IntentError(done.why === WAY_CHANGED ? 409 : 422, done.why)
				if (!('line' in done)) throw new IntentError(422, 'Change this action in Settings.')
				return { accepted: true, text: done.mode === 'turned-off' ? `Turned off: "${done.line.text}"` : `Stopped: "${done.line.text}"` }
			}, 'text', key, hash))
		}
		if (row.stopped) {
			const stop = row.stopped
			ids.push(tool(key, 'wdd-stop-undo', 'Undo', () => {
				const back = stop.mode === 'turned-off' ? setLineOff(store, stop.lineId, false, stop.hash) : deleteLine(store, stop.lineId, stop.hash)
				if (!back.ok) throw new IntentError(back.why === WAY_CHANGED ? 409 : 422, back.why)
				return { accepted: true, text: 'Back.' }
			}, undefined, key, stop.hash))
		}
		// N2 (D8 O1; SEND's W4 page binding, HOST's H0): Undo while the record's window is open, exact on the record's approval revision.
		// It queues `undo-action <recordId>` for the owner-command runner; nothing is deleted here.
		if (row.undoUntil && row.undoRev) {
			const until = row.undoUntil, rev = row.undoRev
			ids.push(offer(key, rev, 'wdd-undo', 'Undo', () => ({ code: '', verb: 'undo-action', text: row.id }),
				{ staleness: 'exact', expect: rev, effect: 'changes-system', expiresAt: until, meaning: 'Removes this reply from the chat. Changes already made are not reversed.' }, key))
		}
		// H3(a) (PE v1.146 item 2): Wrong / Incomplete on the record of the item's current sent reply, as the existing page feedback answer on
		// that item, exact on workflowApprovalRev; resolvePageIntent gives it feedback-send with the current sentMessageId, and HOST's mark
		// drafts the correction as an item waiting on him. Nothing posts. "Not needed" is never offered on a row.
		const wf = row.correctable && row.item ? store.byCode(row.item) : undefined
		if (wf) {
			const rev = workflowApprovalRev(wf)
			for (const [kind, verb, label] of [['wdd-wrong', 'wrong', 'Wrong'], ['wdd-incomplete', 'incomplete', 'Incomplete']] as const)
				ids.push(offer(wf.code, rev, kind, label, input => ({ code: wf.code, verb, text: input?.text }),
					{ input: 'feedback', staleness: 'exact', expect: rev, effect: 'local', meaning: 'Drafts a follow-up for your approval. Nothing is sent yet.' }, key))
		}
		// H3(b): a reminder's Pause / End are the existing automation verbs with this record as their text, exact on automationApprovalRev
		// (HOST appends `stopped`). After his stop, its Undo is the page resume, exact on the stopped state's revision (endedFrom bound),
		// for 6 s from the stop.
		const auto = b.kind === 'setting' && b.reminder ? store.automation(b.reminder) : undefined
		if (auto && !row.reminderStopped && (auto.state === 'active' || auto.state === 'paused')) {
			const rev = automationApprovalRev(auto)
			if (auto.state === 'active') ids.push(offer(auto.code, rev, 'wdd-pause', 'Pause', () => ({ code: auto.code, verb: 'pause', text: row.id }), { staleness: 'exact', expect: rev }, key))
			ids.push(offer(auto.code, rev, 'wdd-end', 'End', () => ({ code: auto.code, verb: 'skip', text: row.id }), { staleness: 'exact', expect: rev }, key))
		}
		if (auto && row.reminderStopped && Date.parse(row.reminderStopped.at) + 6000 > Date.now()) {
			const rev = automationApprovalRev(auto), until = new Date(Date.parse(row.reminderStopped.at) + 6000).toISOString()
			ids.push(offer(auto.code, rev, 'wdd-reminder-undo', 'Undo', () => ({ code: auto.code, verb: 'resume' }), { staleness: 'exact', expect: rev, expiresAt: until }, key))
		}
		if (ids.length) wddActionIds.set(row.id, ids)
	}
	const pageActionIds = [
		offer('', '', 'pause-resume', base.status.state === 'on' ? 'Pause' : 'Resume', () => ({ verb: base.status.state === 'on' ? 'pause' : 'resume' }), { staleness: 'exact', expect: pageDigest(base.status.state) }, 'page'),
		// D-WATCH' (PE engineer-d-watch §8.2/§8.6/§8.7; PM N2): Stop / Start checking Teams on the exact state; the caption is its meaning.
		// Its rev is the state it was pressed on, so each saved receipt says which press it was (CR B2 on 332441fc); a press on the
		// other state is refused as changed since you looked. Check now stays (PM N3).
		((w => offer('', `watching:${w.on ? 'on' : 'off'}`, 'watching', w.on ? 'Stop' : 'Start', () => ({ verb: w.on ? 'watch-off' : 'watch-on' }), { staleness: 'exact', expect: pageDigest({ on: w.on, since: w.since }),
			meaning: w.on ? 'Stops checking Teams for new messages. Your clicks and everything already here still work.' : `Checks Teams again ${every((store.config().poll ?? DEFAULT_POLL).idleMin)}, from your setting.` }, 'page'))(base.status.watching)),
		tool('', 'retry-source', 'Check now', () => actResult(store, 'retry', undefined, 'page')),
		tool('', 'check-update', 'Check for updates', () => actResult(store, 'check update', undefined, 'page')),
		tool('', 'mark-all-read', 'Mark all read', input => {
			if (!input?.seenAt || !Number.isFinite(Date.parse(input.seenAt)) || Date.parse(input.seenAt) > Date.now()) throw new IntentError(422, 'The displayed time is not valid. Refresh before marking read.')
			store.saveSeen(['catchup'], new Date(input.seenAt).toISOString())
			return { accepted: true, text: 'Marked the displayed Catch up items read.' }
		}),
		// WDD N1 (Designer D1/D7.7): Mark all reviewed, on exactly the rows the section showed (its rev is their digest, so a row that
		// arrived since is refused as changed). The page holds it 6 s with Undo before sending (the A58 hold on its own item, `wdd`), with the
		// PM FINAL line "Marked <N> as reviewed. · Undo" (HeldLine adds the period).
		...(wdd.section.length ? [(id => (Object.assign(entities.actions[id], { hold: { line: `Marked ${wdd.section.length} as reviewed` } }), id))(tool('wdd', 'wdd-reviewed', 'Mark all reviewed', () => {
			const current = wddView(store, store.seen())
			if (pageDigest(current.section) !== pageDigest(wdd.section)) throw new IntentError(409, 'Changed since you looked. Open the new version first.')
			// PE v1.136 (CR 14:10:15 B1): all or nothing. One call to SEND's reviewed amendActions with one shared `at`: it takes every month's
			// lock and resolves every ref before it writes, so a refusal is true by construction (nothing was written).
			const at = new Date().toISOString()
			const saved = amendActions(store, current.section.map(ref => ({ v: 1 as const, ref, at, by: 'owner' as const, kind: 'reviewed' as const })))
			if (saved === BUSY) throw new IntentError(409, 'Another change to this list is being saved. Try again.')
			if (!Array.isArray(saved)) throw new IntentError(409, 'Changed since you looked. Open the new version first.')
			if (saved.length !== current.section.length) throw new Error(`Mark all reviewed saved ${saved.length} of ${current.section.length} rows.`)
			return { accepted: true, text: `Marked ${saved.length} as reviewed.` }
		}, undefined, 'page', pageDigest(wdd.section)))] : []),
		tool('', 'report-problem', 'Report a problem', input => ({ accepted: true, text: reportProblem(store, requiredText(input)) }), 'text'),
		tool('', 'paste-missed', 'Make it an item', input => {
			const link = requiredText(input).trim()
			if (!/^https:\/\/teams\.microsoft\.com\/l\/message\/[^/?#]+\/[^/?#]+/i.test(link)) throw new IntentError(422, 'Paste a Teams message link.')
			const existing = knownMessageCode(store, link)
			if (existing) return { accepted: true, text: `This message is already ${existing}. Open the existing item.` }
			// PE engineer-d-watch §8.13: the queued link file IS the owner's read request (the runner reads queued links even while Teams
			// checking is off), so there is no separate stamp. A generic wake follows; a busy kick file is ignored, the link stands.
			store.addMissed({ link, at: new Date().toISOString() })
			wakeKick(store)
			return { accepted: true, text: 'Saved. It becomes an item on the next read. Nothing is sent.' }
		}, 'text'),
		tool('', 'watch-something', 'Start watching', input => {
			const target = requiredText(input).trim()
			if (input?.by && !byEnd(input.by)) throw new IntentError(422, 'Choose a valid date.')
			const result = watchTarget(store, { target, until: input?.until?.trim() || undefined, by: input?.by || undefined, shepherd: input?.push })
			return { accepted: result.accepted, text: pageText(result.text) }
		}, 'watch'),
		tool('', 'remind-someone', 'Create reminder', input => {
			if (!input?.to || !input.every || !input.at) throw new IntentError(422, 'Choose a person and schedule.')
			const selected = input.recipientId ? base.people.find(person => hashOf(person.chat) === input.recipientId && person.name === input.to) : undefined
			if (input.recipientId && !selected) throw new IntentError(409, 'That recipient changed. Select the person again.')
			const before = new Set(store.automations().map(auto => auto.code))
			const text = proposeAutomation(store, { to: input.to, chatId: selected?.chat, text: requiredText(input), every: input.every, at: input.at, day: input.day, until: input.by })
			const auto = store.automations().find(auto => !before.has(auto.code) && auto.state === 'proposed')
			if (!auto) return { accepted: false, text: forPage(text) }
			return { accepted: true, text: forPage(answerAutomation(store, auto, { id: '', code: auto.code, verb: 'ok', surface: 'chat', at: '' })) }
		}, 'reminder'),
	]
	const reminderRevision = pageDigest(base.people)
	Object.assign(entities.actions['page/remind-someone'], {
		effect: 'sends', staleness: 'exact', rev: reminderRevision, expect: reminderRevision,
		meaning: 'Creates the displayed reminder schedule for the selected recipient. The exact text above is what will be sent.',
	})
	const settingsActions: Record<string, string[]> = {}
	for (const habit of store.habits()) {
		if (habit.state === 'suggested') settingsActions[habit.code] = [
			offer(habit.code, '', 'accept-habit', 'Turn on', () => ({ code: habit.code, verb: 'ok' })),
			offer(habit.code, '', 'defer-habit', 'Not now', () => ({ code: habit.code, verb: 'skip' })),
			offer(habit.code, '', 'never-habit', 'Never', () => ({ code: habit.code, verb: 'never' })),
		]
		else {
			settingsActions[habit.code] = [offer(habit.code, '', 'remove-rule', 'Remove', () => ({ code: habit.code, verb: 'never' }))]
			// A drafting style the owner turned on: its words can be changed, and the turn-on taken back within the undo window (edit habits).
			if (habit.kind === 'style' && !habit.removes && habit.state === 'accepted') {
				const rule = store.rules().find(r => r.id === habit.rule.id), rev = ''
				if (rule) settingsActions[habit.code].unshift(offer(habit.code, rev, 'edit-style', 'Save style', input => ({ code: habit.code, verb: 'edit', text: requiredText(input) }), { input: 'text', effect: 'changes-system', meaning: 'Saves these words as the drafting style. New drafts follow them; nothing is sent.' }))
				if (habitUndoable(store, habit)) settingsActions[habit.code].push(offer(habit.code, rev, 'undo-habit', 'Undo', () => ({ code: habit.code, verb: 'undo' }), { effect: 'changes-system', expiresAt: new Date(Date.parse(habit.at) + undoMs(store)).toISOString(), meaning: 'Turns this style off again and brings its suggestion back.' }))
			}
		}
	}
	for (const [chatId, level] of Object.entries(store.config().chatLevels ?? {})) {
		const key = chatLevelKey(chatId)
		const actionId = tool(key, 'chat-normal', 'Mark normal again', () => {
			const config = store.config(), levels = { ...config.chatLevels }, wasOff = levels[chatId]?.level === 'off'
			delete levels[chatId]
			store.saveConfig({ ...config, chatLevels: levels })
			// Facts moved out when the chat went off the record come back to the cards (#21 §2c).
			const back = wasOff ? restoreOffRecord(store, chatId) : 0
			return { accepted: true, text: `This chat is normal again.${back ? ` ${back} fact${back === 1 ? '' : 's'} from it ${back === 1 ? 'is' : 'are'} back in your knowledge.` : ''} Existing drafts and source checks are unchanged.` }
		}, undefined, key)
		// C2 companion (untitled-chat contract): an untitled group is named by its place sentence, never its stored id-like name.
		Object.assign(entities.actions[actionId], {
			effect: 'changes-system', rev: pageDigest([chatId, level]), expect: pageDigest([chatId, level]), staleness: 'exact', needsConfirm: true,
			meaning: `Stop treating ${placeOf(store, { id: chatId, name: level.name })?.sentence ?? level.name} as ${level.level === 'off' ? 'off the record' : level.level === 'shareable' ? 'shareable within your org' : 'private'}? Future learning and replies use the normal privacy checks.${level.level === 'off' ? ' Facts set aside from it come back to your knowledge.' : ' Existing stored facts are not changed.'}`,
		})
		settingsActions[key] = [actionId]
	}
	// A tool server that won't start on this machine (#24): Retry, or Don't use it here; one set aside can be used again. Per machine.
	for (const server of toolsView(store.config(), { machine: store.machine, root: store.root })?.servers ?? []) {
		if (!server.actionIds?.length) continue
		const key = toolServerKey(server.name), name = server.name
		for (const id of server.actionIds) {
			const kind = id.slice(key.length + 1)
			if (kind === 'server-retry') tool(key, kind, 'Retry', () => {
				retryServer(name); wakeKick(store)
				return { accepted: true, text: `${NAME} tries ${name} again at the next check, in a moment.` }
			}, undefined, key)
			else if (kind === 'server-ignore') tool(key, kind, "Don't use this server", () => {
				ignoreServer(name, true); store.setHealth(`catalog:${name}`); wakeKick(store)
				store.log({ event: 'tool-server-ignored', server: name })
				return { accepted: true, text: `${name} isn't used on ${store.machine} any more: ${NAME} won't start it or offer its tools here.` }
			}, undefined, key)
			else if (kind === 'server-use') tool(key, kind, 'Use this server again', () => {
				ignoreServer(name, false); retryServer(name); wakeKick(store)
				store.log({ event: 'tool-server-used', server: name })
				return { accepted: true, text: `${NAME} uses ${name} on ${store.machine} again, from the next check.` }
			}, undefined, key)
			if (entities.actions[id]) Object.assign(entities.actions[id], { effect: 'changes-system', meaning: kind === 'server-ignore' ? `Stop starting ${name} on ${store.machine}? Its tools aren't offered here until you use it again.` : kind === 'server-use' ? `Start ${name} on ${store.machine} again and offer its read tools.` : `Try to start ${name} again now.` })
		}
		settingsActions[key] = server.actionIds.filter(id => entities.actions[id])
	}
	// R12b (PE A R28): Settings › Your way of working, exactly as SEND's ways.ts returns it: the page adds no status, grouping or read-back.
	// Step 3 (SEND a58444d8): the lines, needsHim and linesToCheck are real; the suggestion facade may still say "not yet", which means
	// only "no suggestions from the engine yet" (suggestionsReady false: the old habit-suggestion list stays). "not yet" from the lines
	// means no section; any other error is a real failure: logged by shape only, and the section says so (PE 05:06/05:24).
	const dismissalKeys = new Map<string, string>(), dismissalId = (key: string) => hashOf(`dismissal|${key}`)
	const ways: Snapshot['ways'] = (() => {
		const cfg = store.config(), limits = limitsCard(cfg).map(limit => ({ id: limit.id, page: limit.page }))
		let fn = 'wayLines'
		try {
			const lines = wayLines(store, cfg)
			fn = 'linesToCheck'; const toCheck = linesToCheck(store, cfg)
			fn = 'needsHim'; const count = needsHim(store, cfg)
			// PE S3 (b): his old prose paragraphs as notes (SEND 94fac6a9); never in wayLines or needsHim.
			fn = 'wayNotes'; const notes = wayNotes(store)
			fn = 'suggestions'
			const open = (() => { try { return suggestions(store) } catch (error) { if (notYet(error)) return undefined; throw error } })()
			// I-b: SEND's union; a dismissed suggestion scope is listed by its label, its key kept here for Reconsider.
			const turned: WayTurnedDown[] = open?.turnedDown ?? []
			for (const row of turned) if (row.kind === 'suggestion') dismissalKeys.set(dismissalId(row.key), row.key)
			return { lines, ...(open?.open ? { open: open.open } : {}), turnedDown: turned.map(row => row.kind === 'suggestion' ? { kind: 'suggestion' as const, id: dismissalId(row.key), label: pageText(row.label), at: row.at } : row), limits, needsHim: count, toCheck, ...(open ? { suggestionsReady: true } : {}),
				...(notes.length ? { notes: notes.map(note => ({ id: note.id, text: note.text, textHash: note.textHash, ...(note.review ? { review: true } : {}) })) } : {}) }
		} catch (error) {
			if (notYet(error)) return undefined
			waysFailed(store, fn, error)
			return { lines: [], turnedDown: [], limits, needsHim: 0, toCheck: 0, failed: true }
		}
	})()	// R12b slice 2 (PE A R28): each control maps 1:1 to its ways.ts verb, on the line's textHash (exact staleness, and the engine compares
	// it again). The page says what the engine answers; while SEND's bodies throw "not yet", that refusal is shown as it is.
	if (ways && !ways.failed) {
		const said = (fn: string, run: () => WayWriteResult, done: string): Immediate => {
			try {
				const result = run()
				return result.ok ? { accepted: true, text: done } : { accepted: false, text: pageText(result.why) }
			} catch (error) {
				if (notYet(error)) return { accepted: false, text: `Not saved: ${NAME} can't save this here yet.` }
				waysFailed(store, fn, error)
				return { accepted: false, text: 'Not saved: something went wrong. Your text is kept.' }
			}
		}
		const text = (input: Intent['input']) => requiredText(input).trim()
		const verb = (key: string, kind: string, label: string, rev: string, run: (input: Intent['input']) => Immediate, input?: Action['input']) => {
			const id = tool(key, kind, label, run, input, key, rev)
			entities.actions[id].effect = 'changes-system'
			;(settingsActions[key] ??= []).push(id)
		}
		verb('ways', 'way-add', 'Add', 'ways', input => said('addLine', () => addLine(store, text(input)), `Added. ${NAME} is reading it.`), 'text')
		// Undo after Delete (6 s, client-held): the deleted line's id and textHash travel in the text, as "<id>\n<hash>".
		verb('ways', 'way-restore', 'Undo', 'ways', input => { const [id, hash] = requiredText(input).split('\n'); return said('restoreLine', () => restoreLine(store, id, hash ?? ''), 'Back.') }, 'text')
		for (const line of ways.lines) {
			const key = `way:${line.id}`, rev = line.textHash
			verb(key, 'way-edit', 'Save', rev, input => said('editLine', () => editLine(store, line.id, text(input), rev), `Saved. ${NAME} is reading it again.`), 'text')
			// D-A239 MP4: a line not in effect has no switch (it grants nothing); a line that couldn't be read, or reads as nothing supported, is
			// read again on his Read it again (SEND readLineAgain: one compile, landing in Waiting for your OK or back to Not in effect).
			const notInEffect = line.state === 'not-in-effect'
			if (notInEffect && line.status === 'cant-yet') verb(key, 'way-read-again', 'Read it again', rev, () => said('readLineAgain', () => readLineAgain(store, line.id, rev), `${NAME} is reading it again.`))
			// CR B5: no switch verb for a line that isn't in effect yet (waiting for his OK, not in effect, reading); Turn on, Not now and
			// Read it again are its actions.
			if (line.status !== 'reading' && !notInEffect && line.state !== 'waiting' && line.state !== 'reading') verb(key, line.group === 'off' || line.status === 'off' ? 'way-on' : 'way-off', line.group === 'off' || line.status === 'off' ? 'Turn on' : 'Turn off', rev,
				() => { const off = !(line.group === 'off' || line.status === 'off'); return said('setLineOff', () => setLineOff(store, line.id, off, rev), off ? 'Off · kept so you can turn it on again.' : 'On.') })
			if (line.status === 'waiting') {
				verb(key, 'way-confirm', 'Turn on', rev, () => said('confirmLine', () => confirmLine(store, line.id, rev), 'Turned on.'))
				verb(key, 'way-not-now', 'Not now', rev, () => said('setLineOff', () => setLineOff(store, line.id, true, rev), 'Not now. The line stays off.'))
			}
			if (line.status === 'unclear') verb(key, 'way-answer', 'Save', rev, input => said('answerLine', () => answerLine(store, line.id, text(input), rev), `Saved. ${NAME} is reading the line again.`), 'text')
			verb(key, 'way-delete', 'Delete', rev, () => said('deleteLine', () => deleteLine(store, line.id, rev), 'Deleted.'))
			// PM A R32 / PE A R33 (SEND 89fcb3c1): Undo on the "Added to your way of working." line takes back an unchanged Add it on this exact
			// line (its id and textHash); the engine refuses anything else and restores the suggestion card exactly.
			if (line.source === 'learned') verb(key, 'way-undo-accept', 'Undo', rev, () => said('undoAcceptSuggestion', () => undoAcceptSuggestion(store, line.id, rev), 'Taken back. The suggestion is back.'))
		}
		if (ways.open) {
			const open = ways.open, key = `way-suggestion:${open.id}`, rev = open.textHash
			// Until HOST's edit branch lands, an edited Add it is refused with the contract's "not yet" (PE 07:46): say so in the PM's words.
			verb(key, 'suggestion-accept', 'Add it', rev, input => {
				// SEND 0c7273b8: an edited Add it is saved as a learned line that is read before it can be turned on (no Undo, A R33 is for unchanged).
				const edited = text(input) !== open.text.trim()
				const done = said('acceptSuggestion', () => acceptSuggestion(store, open.id, text(input), rev), edited ? `Saved your edited line. ${NAME} is reading it; it won't be on until you turn it on.` : 'Added to your way of working.')
				return !done.accepted && done.text === 'not yet' ? { accepted: false, text: "Not saved: an edited suggestion can't be added yet. Add it as written, or write your own line." } : done
			}, 'text')
			verb(key, 'suggestion-not-now', 'Not now', rev, () => said('dismissSuggestion', () => dismissSuggestion(store, open.id, 'not-now', rev), 'Not now.'))
			verb(key, 'suggestion-never', 'Never', rev, () => said('dismissSuggestion', () => dismissSuggestion(store, open.id, 'never', rev), "Won't suggest this again."))
		}
		// PE S3 (b): "Make it a line" is the normal Add a line path (compile, then confirmation for anything widening) and the note goes;
		// "Remove" drops the note. Both on the note's textHash.
		for (const note of ways.notes ?? []) {
			const key = `way-note:${note.id}`, rev = note.textHash
			verb(key, 'note-to-line', 'Make it a line', rev, () => said('makeNoteLine', () => makeNoteLine(store, note.id, rev), `Made it a line. ${NAME} is reading it.`))
			verb(key, 'note-remove', 'Remove', rev, () => said('deleteNote', () => deleteNote(store, note.id, rev), 'Removed.'))
		}
		for (const row of ways.turnedDown) {
			if (row.kind === 'suggestion') {
				// I-b: Reconsider routes the scope key to HOST's scoped dismissal writer (SEND reconsiderSuggestion, kind 'suggestion').
				const key = `way-dismissal:${row.id}`, scope = dismissalKeys.get(row.id)!
				verb(key, 'suggestion-reconsider', 'Reconsider', pageDigest([row.id, row.at]), () => said('reconsiderSuggestion', () => reconsiderSuggestion(store, scope, 'suggestion'), `${NAME} can suggest this again.`))
				continue
			}
			const { suggestion } = row
			const key = `way-suggestion:${suggestion.id}`, rev = suggestion.textHash
			verb(key, 'suggestion-undo', 'Undo', rev, () => said('undoDismiss', () => undoDismiss(store, suggestion.id), 'Back.'))
			verb(key, 'suggestion-reconsider', 'Reconsider', rev, () => said('reconsiderSuggestion', () => reconsiderSuggestion(store, suggestion.id), 'Back as a suggestion.'))
		}
	}
	if (base.status.state !== 'on') for (const action of Object.values(entities.actions)) {
		if (action.effect === 'sends' || action.effect === 'changes-system' && ['approve', 'approve-again'].includes(action.kind)) {
			action.unavailable = { label: base.status.state === 'paused' ? 'Paused' : 'Stopped', reason: `${base.status.state === 'paused' ? 'Paused' : 'Stopped'}: nothing is sent. Resume before approving this action.` }
		}
	}
	const found = query.trim() ? find({ ...base, next }, query) : undefined
	if (found?.link && !found.link.item) found.link.item = knownMessageCode(store, query)
	const classicRunning = base.running.filter(row => !stoppedCodes.has(row.code))
	// R11(1), the running tile (PM §1, PE R11): "working now" counts only runs actually going: a job that runs, or a draft that is due now
	// within maxParallel, as dispatch takes them; a setup run (no code) is going too. A scheduled send is neither. The rest are queued,
	// with one reason, first match: the AI hold (with its resume time), paused, Delegate off or at its daily limit, else run slots.
	const maxParallel = cfg.maxParallel ?? 3
	const dueDrafts = new Set(classicRunning.map(row => byCode.get(row.code)).filter((w): w is Workflow => !!w && w.state === 'running' && facts.queue.get(w.id) === 'next')
		.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, maxParallel).map(w => w.code))
	const runKind = (code: string): 'working' | 'queued' | undefined => {
		if (!code) return 'working'
		const w = byCode.get(code)
		if (!w || w.state === 'scheduled') return undefined
		if (w.job && facts.jobs.get(w.job)?.state === 'running') return 'working'
		return !facts.agentWait && facts.runner !== 'off' && facts.runner !== 'stopped' && facts.runner !== 'capped' && dueDrafts.has(code) ? 'working' : 'queued'
	}
	const kinds = classicRunning.map(row => runKind(row.code))
	const busyNow = kinds.filter(kind => kind === 'working').length, busyQueued = kinds.filter(kind => kind === 'queued').length
	// R11(1b) (PM A R17): scheduled sends are neither working nor queued, but the owner must be able to find and stop them.
	const scheduledSends = classicRunning.map(row => byCode.get(row.code)).filter((w): w is Workflow => !!w && w.state === 'scheduled' && !!w.sendAt).sort((a, b) => a.sendAt!.localeCompare(b.sendAt!))
	const nextSend = scheduledSends[0]
	const busy: Snapshot['busy'] = { now: busyNow, queued: busyQueued, max: maxParallel, ...(scheduledSends.length ? { scheduled: { n: scheduledSends.length, at: nextSend!.sendAt!, ...(nextSend!.asker?.name ? { to: nextSend!.asker.name.split(/\s+/)[0] } : {}) } } : {}), ...(busyQueued ? { reason: facts.agentWait ? { kind: 'ai' as const, ...(facts.agentWait.retryAt ? { at: facts.agentWait.retryAt } : {}) }
		: facts.runner === 'paused' ? { kind: 'paused' as const } : facts.runner !== 'ok' && next.off ? { kind: 'off' as const, text: next.off.text.replace(/^Daily/, 'daily') } : { kind: 'slots' as const } } : {}) }
	const classic: Snapshot['classic'] = {
		// COUNT58 (PE decision 58, Designer CC2.6): open in a terminal is in Ongoing, in neither need you nor left for you.
		needsIds: [...new Set([...base.needs.map(item => item.code), ...stoppedCodes, ...workflows.filter(workflow => workflow.partOf && workflow.state === 'needs_human').map(workflow => workflow.code)])].filter(code => !(byCode.get(code)?.openOn && byCode.get(code)?.state !== 'done')).sort((a, b) => needsOrder({ at: displayedAt(entities.items[a]).at, code: a }, { at: displayedAt(entities.items[b]).at, code: b })), tiles: base.tiles,
		also: [...base.also.map(tile => tile.key === 'running' ? { ...tile, count: busyNow + busyQueued + scheduledSends.length } : tile), ...(base.also.some(tile => tile.key === 'running') ? [] : [{ key: 'running', count: 0, label: 'running' }])],
		catchupIds: base.catchUp.top.map(row => Object.values(entities.doneEntries).find(entry => entry.code === row.code && entry.kind === row.kind && entry.at === row.at)?.id).filter((id): id is string => !!id),
		// Sends going out by themselves first (R11(1b): with their Undo/Stop), soonest first, then the working ones, then the queued (R11(1)).
		// A row with no kind that isn't a scheduled send (its item can't be found) goes last, not first (PE 00:02 nit).
		running: classicRunning.map((row, n) => ({ row, kind: kinds[n], send: (w => w?.state === 'scheduled' && w.sendAt ? w.sendAt : undefined)(byCode.get(row.code)) }))
			.sort((a, b) => {
				const rank = (r: { kind?: string; send?: string }) => r.send ? 0 : r.kind === 'working' ? 1 : r.kind === 'queued' ? 2 : 3
				return rank(a) - rank(b) || (a.send && b.send ? a.send.localeCompare(b.send) : 0)
			}).map(({ row, kind }) => ({
			...row, ...(kind === 'queued' ? { queued: true } : {}), what: pageText(Object.values(entities.placements).find(placement => placement.act === row.code && placement.kind === 'scheduled')?.headline ?? row.what),
			sendAt: byCode.get(row.code)?.state === 'scheduled' ? byCode.get(row.code)?.sendAt : undefined,
			detail: entities.items[row.code]?.attentionKind === 'agent-setup' ? `Held: ${entities.items[row.code].attention}` : row.code && (byCode.get(row.code)?.state !== 'scheduled' || /^Held: /.test(byCode.get(row.code)?.status ?? '')) ? pageText(byCode.get(row.code)?.status) : undefined,
			retry: (() => {
				const workflow = byCode.get(row.code), retry = workflow?.job ? facts.jobs.get(workflow.job)?.retry : undefined
				return retry ? { at: retry.at, attempt: retry.n, reason: pageText(retry.last.why), tried: retry.tried.map(pageText) } : undefined
			})(),
			actionIds: row.code ? byCode.get(row.code)?.state === 'scheduled' ? Object.values(entities.placements).find(placement => placement.act === row.code && placement.kind === 'scheduled')?.actionIds ?? [] : [
				continueOffer(row.code, entities.items[row.code]?.rev ?? '', 'classic-continue', byCode.get(row.code)?.openOn),
				...(entities.items[row.code]?.actionIds.filter(id => entities.actions[id].kind === 'dismiss') ?? []),
			] : [],
		})),
		progress: base.progress.map(row => ({
			...row, who: row.who.name, status: pageText(row.status), next: row.next && pageText(row.next),
			actionIds: [
				// Open to-dos are ticked on the item's card ("Left for you", the same section as New; PM 20:15), never from this row.
				...(entities.items[row.code].todoIds.length || entities.items[row.code].leftLines?.some(line => !line.seen) ? [] : [closeWork(row.code, 'classic-close')]),
				...(row.every ? [offer(row.code, row.rev, 'classic-interval', 'Save interval', input => ({ code: row.code, verb: 'every', text: requiredText(input) }), { input: 'interval' })] : []),
				...(row.endsAt ? [offer(row.code, row.rev, 'classic-extend', 'Extend 7 days', () => ({ code: row.code, verb: 'extend' }))] : []),
				...(entities.actions[`${row.code}/stop-watch`] ? [`${row.code}/stop-watch`] : []),
				...(row.terminal ? entities.items[row.code]?.actionIds.filter(id => entities.actions[id].kind === 'take-back') ?? [] : []),
			],
		})),
		workActionIds: Object.fromEntries(base.needs.filter(card => card.work?.due).map(card => {
			const rev = entities.items[card.code].rev
			return [card.code, [
				offer(card.code, rev, 'classic-work-wait', 'Wait 3 days', () => ({ code: card.code, verb: 'wait', text: '3d' }), { staleness: 'exact', expect: rev }),
				closeWork(card.code, 'classic-work-close'),
			]]
		})),
		watchActionIds: Object.fromEntries(base.watching.map(row => [row.code, [
			offer(row.code, row.rev, 'classic-ack-watch', 'Got it', () => ({ code: row.code, verb: 'ok' })),
			...entities.watches[row.code].actionIds,
		]])),
		automationActionIds: Object.fromEntries(base.automations.map(row => [row.code, [
			...(row.state === 'proposed' ? [offer(row.code, row.rev, 'classic-start', 'Start', () => ({ code: row.code, verb: 'ok' }), { effect: 'sends', staleness: 'exact', expect: row.rev })] : []),
			...entities.automations[row.code].actionIds,
		]])),
		watchBy: BY.map(([key, label]) => ({ label, date: key ? byDate(key) : '' })),
		details: base.details,
	}
	const undoable = Object.values(entities.doneEntries).flatMap(row => row.actionIds.filter(id => entities.actions[id]?.kind === 'undo').map(id => ({ id, at: row.at })))
	const lastUndoId = undoable.sort((a, b) => b.at.localeCompare(a.at))[0]?.id
	const snapshot = snapshotSchema.parse({
		schemaVersion: 1, fetchedAt: new Date().toISOString(), now: base.now, since: base.since, owner: base.owner,
		entities: { ...imageTokens({ ...entities, drafts: {} }), drafts: entities.drafts }, sections, seen: base.seen, status: base.status, running: base.running.filter(run => !run.code), busy, classic: imageTokens(classic), lastUndoId,
		pageActionIds, reminderDefaults: newReminder(''), recipients: peopleOf(base).map(person => ({ id: hashOf(person.chat), name: person.name, group: person.group })),
		// An empty list says why, so the owner knows to type a name (reminder recipients, 10-23).
		...(base.people.length ? {} : { recipientsNote: `No one to choose yet: reminders go to people and group chats ${NAME} has seen asks from.${workflows.some(w => w.chat.test && !w.chat.group && w.asker && isPersona(w.asker.id)) ? ' People played with "[as Name]" in test chats are not real, so they are not listed.' : ''} They appear here once they write to you.` }),
		settingsActions, ...(ways ? { ways } : {}), wdd: { ...wdd, ...(wdd.since ? { sinceDay: ownerDay(facts, wdd.since) } : {}), rows: wdd.rows.map(({ undoRev: _rev, correctable: _correctable, ...row }) => ({ ...row, chat: { ...row.chat, name: pageText(row.chat.name) ?? '' }, ...(row.to ? { to: pageText(row.to) } : {}),
			parts: row.parts.map(part => ({ ...part, text: pageText(part.text) ?? '', ...(part.why ? { why: pageText(part.why) } : {}), ...(part.link ? { link: safeLink(part.link) } : {}) })),
			because: row.because.kind === 'line' ? { ...row.because, text: pageText(row.because.text) ?? '' } : row.because.kind === 'setting' ? { ...row.because, label: pageText(row.because.label) ?? '' } : row.because,
			...(row.undoFailed?.why ? { undoFailed: { why: pageText(row.undoFailed.why) } } : {}), ...(row.check ? { check: safeLink(row.check) } : {}), ...(row.preview ? { preview: Object.fromEntries(Object.entries(row.preview).map(([scope, plan]) => [scope, { ...plan, text: pageText(plan.text) ?? '' }])) } : {}), ...(row.stopped ? { stopped: { ...row.stopped, text: pageText(row.stopped.text) } } : {}), ...(wddActionIds.has(row.id) ? { actionIds: wddActionIds.get(row.id) } : {}) })) }, doneNew: newCount(base), sinceLine: sinceOf({ ...base, since: base.since ?? visit?.fallbackSince, next }),
		summary: { minute: next.minute, handled: next.handled, catchup: { count: next.catchup.count, worth: next.catchup.worth }, off: next.off, paused: next.paused },
		showExperienceNote: !store.ui().noted,
		search: found ? {
			query, nowIds: found.now.map(row => row.code),
			doneIds: Object.values(entities.doneEntries).filter(row => found.done.some(match => match.code === row.code && match.kind === row.kind && match.at === row.at)).map(row => row.id),
			link: found.link,
		} : undefined,
	})
	const leaks = Object.entries(takePageTextLeaks())
	if (leaks.length && Date.now() - leakLoggedAt > 3_600_000) { leakLoggedAt = Date.now(); for (const [kind, n] of leaks) try { store.log({ event: 'page-text-leak', kind, n }) } catch { /* best effort */ } }
	return { snapshot, bindings }
}

// PE engineer-d-watch §8.10/§8.13 (CR 11:35:06 B1 on 44c14b24): the provider's saveKick throws exactly this when another writer holds
// the kick file. A generic wake after a change that already stands ignores it (the runner's own cycle picks the change up); any other
// error is rethrown.
const KICK_BUSY = 'Another runner wake-up is being saved. Try again.'
const kickBusy = (error: unknown) => error instanceof Error && error.message === KICK_BUSY
function wakeKick(store: Store) {
	try { store.saveKick() } catch (error) { if (!kickBusy(error)) throw error }
}

export function resolvePageIntent(store: Store, intent: Intent): { parsed?: Parsed; execute?: () => Immediate; shownAt?: string; page?: PageApproval } {
	// An item's own action (`A12/approve`) is found in that item's projection; a row, Done or page action in the whole one (#27 step 2).
	const own = intent.action.startsWith(`${intent.item}/`) && store.byCode(intent.item) ? reactProjection(store, '', undefined, { only: intent.item }).bindings.get(intent.action) : undefined
	const binding = own ?? reactProjection(store).bindings.get(intent.action)
	if (!binding || binding.action.item !== intent.item) throw new IntentError(410, 'That action is no longer offered. Open the refreshed item.')
	// Management expectations describe the decision; row timestamps also move on routine checks.
	if (binding.action.staleness === 'exact' && (binding.action.expect !== intent.expect || !binding.management && binding.action.rev !== intent.rev)) {
		throw new IntentError(409, 'Changed since you looked. Open the new version first.')
	}
	// F1 handoff (decision 47, dispatcher 02:33): a held card's Send anyway or send-edit without the consent its card showed fails closed
	// here (an old page that predates reviewed), never queued for the engine to send against the current hold.
	if (binding.action.reviewed && !intent.reviewed) throw new IntentError(409, 'Changed since you looked. Open the new version first.')
	if (binding.execute) return { execute: () => binding.execute!(intent.input) }
	const parsed = binding.resolve(intent.input)
	if (binding.management) return { parsed, page: { kind: 'manage', expect: binding.action.expect! } }
	// N2: a record's Undo carries its offer's exact record revision as SEND's undo-action guard; no item, workflow or fresh token.
	if (parsed.verb === 'undo-action') return { parsed, page: { kind: 'undo-action', expect: binding.action.expect! } }
	// D-WATCH (PE §6, SEND-W/HOST-W1): Stop / Start watching carries its offer's exact state digest, which HOST-W1 checks against the
	// current Control before it changes anything.
	if ((PAGE_CONTROL_VERBS as readonly string[]).includes(parsed.verb)) return { parsed, page: { kind: 'manage', expect: binding.action.expect! } }
	// A workflow wins (see expect below), so a reminder or proposal is looked up only when the item is neither: a proposal lookup
	// reads every proposal (#27 step 2).
	const workflow = store.byCode(intent.item), automation = workflow ? undefined : store.automation(intent.item), proposal = workflow || automation ? undefined : store.proposal(intent.item)
	let page: PageApproval | undefined
	// ✕ (PE 16:55:13Z (B)): a suggestion dismissal binds to the card revision through its offer's exact expect only, never an approval digest.
	if (binding.action.staleness === 'exact' && parsed.verb !== 'dont-suggest') {
		// Decision 53: a mark of his to-dos and the two line verbs bind to SEND's separate leftRev; every other page answer keeps
		// workflowApprovalRev, so Send and approve consent are unchanged.
		const lineBound = !!workflow && (!!binding.action.todoIds?.length || parsed.verb === 'left-ask-again' || parsed.verb === 'left-draft-invite')
		const expect = lineBound ? leftRev(workflow!) : workflow ? workflowApprovalRev(workflow) : automation ? automationApprovalRev(automation) : proposal ? proposalApprovalRev(proposal) : undefined
		if (expect) {
			// "I've done these" marks only the to-dos he ticked, by their place in the list the card drew (#44(2), PM 18:40).
			const todoIds = binding.action.todoIds && intent.input?.picks?.length ? [...new Set(intent.input.picks)].map(n => binding.action.todoIds![n - 1]) : binding.action.todoIds
			if (todoIds?.some(todo => !todo)) throw new IntentError(422, 'Tick a to-do from the list.')
			const kind: PageApproval['kind'] = todoIds?.length ? 'mark-todos' : parsed.verb === 'undo' && workflow ? 'undo-send' :
				workflow?.sent && ['wrong', 'incomplete', 'unneeded'].includes(parsed.verb) ? 'feedback-send' :
				parsed.verb === 'pick' ? 'pick' : workflow && ['ok', 'send', 'edit'].includes(parsed.verb) && pendingEffects(workflow.effects).length > 0 ? 'make-changes' :
					workflow?.draft && (parsed.verb === 'ok' || parsed.verb === 'send') ? 'send-reply' : 'approve'
			page = { kind, expect, ...((binding.action.kind === 'send-anyway' || binding.action.kind === 'send-edit') && intent.reviewed ? { reviewed: intent.reviewed } : {}), ...(kind === 'undo-send' || kind === 'feedback-send' ? { sentMessageId: workflow?.sent?.msgId } : {}), ...(todoIds ? { todoIds } : {}),
				...(parsed.verb === 'ok' && workflow?.draft && (kind === 'send-reply' || kind === 'make-changes') ? { replyDigest: pageDigest(approvedReplyText(workflow.draft.text, workflow, store.config())) } : {}),
			}
		}
	}
	return { parsed, page, shownAt: workflow?.revAt ?? workflow?.updatedAt ?? automation?.updatedAt ?? proposal?.revAt }
}
export const resolveIntent = (store: Store, intent: Intent): Parsed => {
	const parsed = resolvePageIntent(store, intent).parsed
	if (!parsed) throw new IntentError(422, 'This is not a queued item action.')
	return parsed
}
