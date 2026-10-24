import { isDeepStrictEqual } from 'node:util'
import type { Source as ChatSource } from '../adapters/source.ts'
import { messageLink } from '../adapters/channels.ts'
import { pendingEffects, isVote, sameChange, sameHead, refusal } from '../core/effects.ts'
import { pageChangeId } from '../core/page-approval.ts'
import { commits, decide, labeledToGuests, replyGap, reviewRuleFor } from '../core/policy.ts'
import { authorize } from '../core/limits.ts'
import { reviewDoneFacts, reviewFrame } from '../core/review.ts'
import { scrubDeep } from '../core/secrets.ts'
import type { Config, Effect, Job, ReviewFinding, Workflow } from '../core/types.ts'
import { stateFields } from '../core/upgrades.ts'
import { voteMention } from '../core/vote-claims.ts'
import { freshRead } from '../store/fs.ts'
import type { Store } from '../store/state.ts'
import { send } from './apply.ts'
import { policyContext } from './autosend.ts'
import { cachedCatalogs } from './catalog.ts'
import type { Caller } from './change.ts'
import { recordCommit } from './commit.ts'
import { buildCommentCall, effectCallProblem, isInlineComment } from './effect-calls.ts'
import { changesJob, stillApproved } from './jobs.ts'
import { madeBefore, maybeOf } from './ledger.ts'
import { adoProbe, prOf, type BuildProbe, type PrRef } from './probe.ts'
import { knowledgeOf } from './proposals.ts'
import { MAY_REVIEW, reviewAsked, roleOn } from './review-gate.ts'
import { draftUse, membersOf, sharingHold } from './sharing.ts'

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const clean = (v: string) => v.replace(/^\[(?:High|Medium|Low)\]\s*/i, '').replace(/\s+/g, ' ').trim()
const priority = { High: 0, Medium: 1, Low: 2 }
type Thread = { file: string; line: number; text: string }
type Options = { probe?: BuildProbe; call: Caller; completed?: { job: Job; effects: Effect[] } }
export type ReviewCompletion = { pr: number; head?: string; status?: string; at: string; basis?: Workflow['reviewBasis'] }

export async function checkReviewCompletion(store: Store, job: Job, probe?: BuildProbe): Promise<ReviewCompletion | undefined> {
	const wf = freshRead(() => job.parents.map(id => store.workflow(id)).find(w => w?.intent === 'pr_review'))
	const ref = wf && prOf(store, wf)
	if (!ref) return undefined
	const at = new Date().toISOString()
	let reader = probe
	try {
		reader ??= adoProbe(freshRead(() => store.config()))
		if (!reader?.pr) throw new Error('The PR cannot be read at review completion')
		const live = await reader.pr(ref.project, ref.repo, ref.id)
		const start = job.reviewStart
		const basis = start?.pr === ref.id && sameHead(start.head, live.head) ? { ...start } : undefined
		return { pr: ref.id, head: live.head, status: live.status, at, basis }
	} catch (error) {
		store.log({ event: 'review-basis-held', job: job.id, pr: ref.id, reason: String(error).slice(0, 300) })
		return { pr: ref.id, at }
	} finally {
		if (!probe) try { await reader?.close?.() } catch (error) { store.log({ event: 'probe-close-failed', job: job.id, error: String(error).slice(0, 200) }) }
	}
}

export function findingFor(e: Effect, findings: ReviewFinding[] = []) {
	const p = e.payload
	return object(p) && typeof p.text === 'string' ? findings.find(f =>
		f.file === p.file && f.line === p.line && clean(f.text) === clean(String(p.text))) : undefined
}
function commentCall(cfg: Config, e: Effect, ref: PrRef) {
	const tool = Object.entries(cachedCatalogs(cfg)).flatMap(([server, catalog]) =>
		catalog.tools.map(t => ({ name: `${server}-${t.name}`, info: t.info }))).find(t => t.name === e.call?.tool)
	return tool && isInlineComment(e) && !isVote(e.call) && /pull_request_thread_write$/i.test(tool.name) ?
		buildCommentCall(e.payload, { project: ref.project, repositoryId: ref.repo, pullRequestId: ref.id }, tool).call : undefined
}
function shareable(wf: Workflow, f: ReviewFinding, ref: PrRef, reads?: NonNullable<Job['result']>['reviewSources']) {
	if (!reads || reads.unknown || reads.restricted || reads.chats.length) return false
	if (wf.shareHold || wf.records?.some(r => r.audience !== 'org') || wf.drewOn?.length ||
		wf.looked?.some(r => r.tool !== 'ado' && r.n > 0)) return false
	const sources = [...(wf.draft?.sources ?? []), ...(f.sources ?? [])]
	const root = ref.url?.split('/pullrequest/')[0].toLowerCase()
	// A chat's audience is not a PR's audience. Only the PR/repository itself is
	// inherently safe here; other sources need an audience proof, not a chat hold.
	return sources.every(s => s.tier !== 'private' && !s.stale && !s.label && !!root && s.ref.toLowerCase().startsWith(`${root}/`))
}
async function threads(cfg: Config, ref: PrRef, call: Caller): Promise<Thread[]> {
	const listed = Object.entries(cachedCatalogs(cfg)).flatMap(([server, catalog]) =>
		catalog.tools.filter(t => /(?:^|_)repo_pull_request_thread$|^pull_request_thread$/i.test(t.name)).map(t => ({ server, ...t })))
	if (listed.length !== 1) throw new Error("The PR thread reader isn't uniquely available; comments stay proposed")
	const tool = listed[0], result: Thread[] = []
	for (let skip = 0; skip < 2000; skip += 100) {
		const args = { action: 'list', project: ref.project, repositoryId: ref.repo, pullRequestId: ref.id, top: 100, skip }
		const problem = effectCallProblem({ tool: tool.name, args }, tool.info)
		if (problem) throw new Error(`PR threads could not be checked: ${problem}`)
		let raw: unknown = await call(tool.server, tool.name, args)
		if (object(raw) && Array.isArray(raw.content)) {
			const chunks = raw.content.filter(object).filter(p => p.type === 'text' && typeof p.text === 'string')
			if (chunks.length !== 1) throw new Error('The PR thread reader returned an unfamiliar result')
			raw = JSON.parse(String(chunks[0].text))
		}
		const rows = Array.isArray(raw) ? raw : object(raw) ? raw.value ?? raw.items ?? raw.threads : undefined
		if (!Array.isArray(rows) || rows.length > 100) throw new Error('The PR thread reader returned an unfamiliar page')
		if (object(raw) && raw.continuationToken) throw new Error('The PR thread reader needs unsupported continuation paging')
		for (const row of rows) {
			if (!object(row) || !Array.isArray(row.comments)) throw new Error('A PR thread could not be checked')
			if (row.isDeleted) continue
			const context = object(row.threadContext) ? row.threadContext : row
			const start = object(context.rightFileStart) ? context.rightFileStart.line : context.rightFileStartLine
			for (const c of row.comments) if (object(c) && !c.isDeleted && typeof c.content === 'string') {
				result.push({ file: String(context.filePath ?? ''), line: Number(start), text: clean(c.content) })
			}
		}
		if (rows.length < 100 && !(object(raw) && raw.hasMoreResults)) return result
	}
	throw new Error('Too many PR threads to check completely; comments stay proposed')
}
const covered = (all: Thread[], e: Effect) => object(e.payload) && all.some(t =>
	t.file.replace(/^[/\\]/, '') === String(e.payload && object(e.payload) ? e.payload.file : '').replace(/^[/\\]/, '') &&
	t.line === (object(e.payload) ? e.payload.line : undefined) && t.text === clean(String(object(e.payload) ? e.payload.text : '')))

async function live(store: Store, cfg: Config, wf: Workflow, probe?: BuildProbe) {
	const ref = prOf(store, wf)
	if (!ref || !probe?.pr) throw new Error('The PR cannot be checked; comments stay proposed')
	const st = await probe.pr(ref.project, ref.repo, ref.id)
	if (!/^active$/i.test(st.status) || !st.head) throw new Error(`PR ${ref.id} is closed or its head could not be read`)
	const role = await roleOn(cfg, probe, ref, st)
	if (!MAY_REVIEW.includes(role)) throw new Error(`The owner is not an eligible reviewer on PR ${ref.id} (${role})`)
	wf.prGroups = (st.reviewers ?? []).filter(r => r.group).map(r => r.name.split('\\').at(-1)!.normalize('NFKC').trim())
	return { ref, head: st.head }
}
function safety(store: Store, cfg: Config, wf: Workflow) {
	const check = { ...wf, draft: { text: 'Review comments.', commitment: false, sources: [] } }
	const decision = decide(check, store.rules(), policyContext(store, cfg, wf), 'review-comments')
	wf.decision = decision
	return decision.action === 'send' ? undefined : decision.reason
}

// Called at the last write boundary as well as before the subset is queued.
export async function reviewPostCheck(store: Store, job: Job, e: Effect, call: Caller, probe?: BuildProbe): Promise<{ error?: string; duplicate?: true }> {
	try {
		const cfg = freshRead(() => store.config())
		const wf = freshRead(() => job.parents.map(id => store.workflow(id)).find(w => w && stillApproved(w, job)))
		if (!wf || job.byRule !== e.byRule || !wf.reviewRun || wf.reviewRun.job !== job.id || wf.reviewRun.phase !== 'posting') return { error: 'The review comment approval changed; it stays proposed' }
		const { ref, head } = await live(store, cfg, wf, probe)
		if (!wf.reviewBasis || wf.reviewBasis.pr !== ref.id || !sameHead(wf.reviewBasis.head, head) ||
			ref.id !== wf.reviewRun.pr || !sameHead(head, wf.reviewRun.head) || !sameHead(e.head, head)) return { error: 'New changes since the review; comments stay proposed' }
		const carrier = store.job(wf.reviewRun.carrier)
		const f = findingFor(e, carrier?.result?.findings)
		if (!f?.severity || !shareable(wf, f, ref, carrier?.result?.reviewSources) || !isDeepStrictEqual(commentCall(cfg, e, ref), e.call)) return { error: 'The finding or its audience could not be verified; it stays proposed' }
		const duplicate = covered(await threads(cfg, ref, call), e)
		return freshRead(() => {
			const latest = store.workflow(wf.id), currentCfg = store.config(), currentJob = store.job(job.id)
			if (!latest || latest.state !== 'waiting_on_task' || !currentJob || currentJob.run?.id !== job.run?.id || currentJob.state !== 'running' ||
				!stillApproved(latest, currentJob) || latest.pending.length || latest.ownerSend ||
				latest.reviewRun?.turn !== wf.reviewRun!.turn || !sameHead(latest.reviewRun?.head, head)) return { error: 'The review changed while checking; comments stay proposed' }
			if (!latest.reviewBasis || latest.reviewBasis.pr !== ref.id || !sameHead(latest.reviewBasis.head, head)) return { error: 'The reviewed revision is no longer verified; comments stay proposed' }
			const now = { ...latest, prGroups: wf.prGroups }
			if (JSON.stringify(cfg.owner) !== JSON.stringify(currentCfg.owner)) return { error: 'Reviewer settings changed while checking; comments stay proposed' }
			const rule = reviewRuleFor(now, store.rules())
			if (!rule || rule.id !== job.byRule) return { error: 'The review rule is off or no longer covers this PR; comments stay proposed' }
			const ctx = policyContext(store, currentCfg, now)
			const auth = authorize({
				...ctx, automatic: true, never: ctx.never?.some(person => person.id === now.asker?.id),
				vote: isVote(e.call), sharing: !!now.shareHold, outside: !!ctx.outsideAsker || rule.who.group === 'outside',
				gap: object(e.payload) && typeof e.payload.text === 'string' && replyGap(e.payload.text),
				capabilityAllowed: !!commentCall(currentCfg, e, ref),
			})
			if (!auth.allowed) {
				store.log({ event: 'review-comment-held', code: latest.code, byRule: job.byRule, blockedBy: auth.blockedBy, reason: auth.reason })
				return { error: auth.reason }
			}
			const currentCarrier = store.job(latest.reviewRun!.carrier)
			const currentFinding = findingFor(e, currentCarrier?.result?.findings)
			if (!currentFinding || !shareable(latest, currentFinding, ref, currentCarrier?.result?.reviewSources) ||
				!isDeepStrictEqual(commentCall(currentCfg, e, ref), e.call)) return { error: 'The finding or its audience changed while checking; comments stay proposed' }
			const error = refusal(currentCfg, e, ref.id) ?? safety(store, currentCfg, now)
			return error ? { error } : duplicate ? { duplicate: true as const } : {}
		})
	} catch (error) { return { error: String(error).slice(0, 300) } }
}

// HOST handover: one entry point for queuing the exact comment subset and folding
// its receipts. The ordinary owner-approved change executor remains unchanged.
export async function reviewCommentHook(store: Store, src: ChatSource, cfg: Config, options: Options): Promise<void> {
	if (options.completed) return finishReview(store, src, options.completed.job, options.completed.effects, options.probe)
	if (!reviewRuleForEnabled(store) || !store.control().autoSend || cfg.paused || store.control().paused || store.control().stopped) return
	for (const old of store.workflows()) {
		if (old.intent !== 'pr_review' || old.state !== 'needs_human' || old.ownerSend || old.approved || old.pending.length || old.draft?.preview || old.draft?.byOwner) continue
		const original = old.job && store.job(old.job)
		if (!original || original.byRule || original.every || original.state !== 'done' || original.purpose !== 'work' ||
			!original.result?.findings || !original.result.at || old.reviewRun?.resultAt === original.result.at) continue
		if (old.reviewAttempt?.job === original.id && old.reviewAttempt.resultAt === original.result.at) continue
		const cleanReview = original.result.reviewClean === true && original.result.findings.length === 0 && !original.result.effects.length && !old.effects?.length && !old.question && !old.todos?.length
		if (!cleanReview && !pendingEffects(old.effects).some(e => { const f = findingFor(e, original.result?.findings); return f?.severity && !f.thread && !e.error && !e.maybe && !e.held })) continue
		const wf = freshRead(() => store.workflow(old.id))
		if (!wf) continue
		const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
		const reviewedHead = wf.reviewBasis?.head
		if (!reviewedHead) {
			wf.reviewAttempt = { job: original.id, resultAt: original.result.at }
			wf.status = 'Review comments not posted: the reviewed revision was not verified. Review again before posting by rule.'
			commit()
			continue
		}
		try {
			await membersOf(store, src, wf.chat.id)
			wf.chat = { ...wf.chat, guests: store.members()[wf.chat.id]?.guests }
			const { ref, head } = await live(store, cfg, wf, options.probe)
			const rule = reviewRuleFor(wf, store.rules())
			const scope = wf.reviewAsk?.job === original.id && wf.reviewAsk.lastMsgId === wf.lastMsgId ? wf.reviewAsk : undefined
			if (!rule || !reviewAsked(store, { ...wf, pending: scope?.ids ?? [wf.lastMsgId], ownerAnswer: scope?.ownerAnswer }, ref.id)) continue
			if (wf.reviewBasis?.pr !== ref.id || !sameHead(head, reviewedHead)) throw new Error('The reviewed head is missing or changed; comments stay proposed')
			if (cleanReview) {
				commit.refresh()
				if (wf.state !== 'needs_human' || wf.pending.length || wf.ownerSend || wf.approved || wf.job !== original.id || wf.revAt !== old.revAt || wf.effects?.length) continue
				wf.reviewRun = { job: original.id, carrier: original.id, resultAt: original.result.at, rule: rule.id, pr: ref.id, head, turn: wf.revAt, phase: 'posting', reply: wf.draft }
				const error = freshRead(() => safety(store, store.config(), wf))
				if (error) { wf.reviewRun = undefined; wf.status = `Review waits: ${error}`; commit(); continue }
				commit()
				await finishReview(store, src, original, [], options.probe, true)
				continue
			}
			const seen = await threads(cfg, ref, options.call)
			commit.refresh()
			if (wf.state !== 'needs_human' || wf.pending.length || wf.ownerSend || wf.approved || wf.job !== original.id || wf.revAt !== old.revAt) continue
			const selected: Effect[] = []
			const effects = (wf.effects ?? []).map(e => {
				if (!pendingEffects([e]).length || e.error || maybeOf(store, e) || madeBefore(store, e)) return e
				const finding = findingFor(e, original.result!.findings)
				if (!finding?.severity || finding.thread || !isInlineComment(e)) return e
				if (!shareable(wf, finding, ref, original.result?.reviewSources)) return { ...e, held: 'sharing' as const }
				const payload = object(e.payload) ? scrubDeep({ ...e.payload, text: `[${finding.severity}] ${clean(finding.text)}` }) : e.payload
				const candidate = { ...e, payload, head, severity: finding.severity, byRule: rule.id }
				const call = commentCall(cfg, candidate, ref)
				if (!call) return e
				const built = { ...candidate, call, summary: scrubDeep(e.summary), held: undefined }
				if (covered(seen, built)) return { ...e, off: true }
				if (!selected.some(other => sameChange(other, built))) selected.push(built)
				return built
			})
			selected.sort((a, b) => priority[a.severity!] - priority[b.severity!])
			const batch = selected.slice(0, 10)
			if (!batch.length) { wf.effects = effects; wf.status = 'Review comments wait for you: no new comment with verified severity and audience is ready'; commit(); continue }
			wf.reviewRun = { job: '', carrier: original.id, resultAt: original.result.at, rule: rule.id, pr: ref.id, head, turn: wf.revAt, phase: 'posting', reply: wf.draft }
			const error = safety(store, cfg, wf)
			if (error) { wf.reviewRun = undefined; wf.effects = effects; wf.status = `Review waits: ${error}`; commit(); continue }
			const approvedIds = new Set(batch.map(pageChangeId))
			wf.effects = effects.map(e => !e.done && !approvedIds.has(pageChangeId(e)) ? { ...e, byRule: undefined } : e)
			changesJob(store, cfg, wf, batch)
			const job = store.job(wf.job!)!
			job.byRule = rule.id; job.state = 'queued'; job.purpose = 'execute'
			job.key = `review-comments:${wf.id}:${job.id}`
			job.goal = `Post review comments on PR ${ref.id} under rule ${rule.id}`
			job.result!.summary = 'Comments authorized by the review rule'
			wf.reviewRun.job = job.id
			wf.approved = { text: wf.draft?.text ?? '', effects: JSON.stringify(batch.map(e => [e.system, e.action, e.target, e.payload, e.call, e.head])), at: new Date().toISOString(), byRule: rule.id, effectIds: batch.map(pageChangeId) }
			Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), status: `Posting review comments on PR ${ref.id}` })
			store.saveJob(job); commit()
		} catch (error) {
			commit.refresh()
			if (wf.state === 'needs_human' && wf.job === original.id && wf.revAt === old.revAt) {
				wf.reviewAttempt = { job: original.id, resultAt: original.result.at }
				wf.status = `Review comments not posted: ${String(error).replace(/^Error: /, '').slice(0, 240)}`
				commit()
			}
			store.log({ event: 'review-autopost-held', code: wf.code, reason: String(error).slice(0, 300) })
		}
	}
}
const reviewRuleForEnabled = (store: Store) => store.rules().some(r => r.then === 'review' && !r.off)

async function finishReview(store: Store, src: ChatSource, job: Job, effects: Effect[], probe?: BuildProbe, cleanReview = false) {
	for (const id of job.parents) {
		const wf = freshRead(() => store.workflow(id))
		if (!wf || wf.reviewRun?.job !== job.id || wf.job !== job.id) continue
		const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
		const run = wf.reviewRun
		const verifiedClean = cleanReview && job.result?.reviewClean === true && job.result.findings?.length === 0 && !job.result.effects.length && !wf.effects?.length &&
			!wf.pending.length && !wf.ownerSend && !wf.approved && !wf.question && !wf.todos?.length && run.turn === wf.revAt
		const ok = verifiedClean || !cleanReview && stillApproved(wf, job)
		wf.effects = (wf.effects ?? []).map(e => {
			const made = effects.find(r => sameChange(r, e))
			return made ? { ...e, done: made.done, error: made.error, maybe: made.maybe, off: made.off, byRule: made.done?.byRule } : e
		})
		const basis = wf.reviewBasis
		if (!basis || basis.pr !== run.pr || !sameHead(basis.head, run.head)) {
			wf.approved = undefined
			wf.reviewRun = { ...run, phase: 'held' }
			wf.job = run.carrier
			if (wf.state !== 'done') Object.assign(wf, { ...stateFields(wf, 'needs_human'), status: 'The reviewed revision is no longer verified; check the comment receipts before sending' })
			commit()
			continue
		}
		const facts = reviewDoneFacts(basis, run.rule, effects)
		if (verifiedClean) facts.clean = true
		facts.waiting = (wf.effects ?? []).filter(e => !e.done && !e.off).map(pageChangeId)
		wf.reviewDone = facts
		wf.approved = undefined
		wf.reviewRun = { ...run, phase: 'held' }
		wf.job = run.carrier
		const original = store.job(run.carrier)
		if (original?.result && original.result.at === run.resultAt && original.state === 'done') {
			original.result.effects = wf.effects
			store.saveJob(original)
		}
		const failed = effects.filter(e => e.error || e.maybe).length
		const skipped = (wf.effects ?? []).filter(isInlineComment).length - facts.posted.length - failed
		store.log({ event: 'review-autoposted', code: wf.code, pr: run.pr, posted: facts.posted.length, skipped: Math.max(0, skipped), failed, severities: facts.counts, rule: run.rule, byRule: run.rule })
		if (!ok || wf.state === 'done') {
			if (wf.state === 'waiting_on_task') Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, status: 'The review changed while posting; check its receipts before sending the reply' })
			commit()
			continue
		}
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, status: facts.posted.length ? `PR ${run.pr} waits for your approval; posted ${facts.posted.length} comments` : `No review comments posted; the review stays with you` })
		const unsettled = effects.some(e => e.maybe || !e.done && !e.off && !e.error)
		if (unsettled) wf.status = 'Some review comments have no final receipt; check them before sending the reply'
		commit()
		if ((!facts.posted.length && !facts.clean) || unsettled) continue
		const frame = reviewFrame(run.pr, facts.counts)
		const sentence = run.reply?.text.trim().match(/^[^\n]+?[.!?](?:\s|$)|^[^\n]+$/)?.[0].trim()
		let extra = '', fallback: string | undefined
		if (sentence) {
			const candidate = { ...wf, draft: { ...run.reply!, text: sentence } }
			try {
				const hold = await sharingHold(store, src, candidate, draftUse(candidate, knowledgeOf(store, store.config()), { chats: wf.drewOn, records: wf.records }))
				if (voteMention(sentence)) fallback = 'Sent the short version: the longer reply mentioned approving, and Delegate never says that for you.'
				else if (commits(candidate) || candidate.shareHold || hold || labeledToGuests(candidate) || candidate.draft.sources.some(s => s.tier === 'private' || s.stale) || /\b(?:iteration|reviewed|posted|sent|left)\b|\d|\b[0-9a-f]{7,40}\b/i.test(sentence)) fallback = 'Sent the short version: the longer reply could not pass the commitment, source or audience checks.'
				else extra = ` ${scrubDeep(sentence)}`
			} catch (error) {
				fallback = 'Sent the short version: the longer reply could not pass the source or audience checks.'
				store.log({ event: 'review-summary-held', code: wf.code, byRule: run.rule, reason: String(error).slice(0, 300) })
			}
		}
		commit.refresh()
		if (wf.state !== 'needs_human' || wf.reviewRun?.job !== job.id || wf.revAt !== run.turn || wf.ownerSend || wf.pending.length) { commit(); continue }
		wf.draft = { text: frame + extra, commitment: false, sources: extra ? run.reply?.sources ?? [] : [] }
		wf.reviewRun = { ...wf.reviewRun, sendText: wf.draft.text }
		wf.reviewDone = facts
		const cfg = store.config(), rule = reviewRuleFor(wf, store.rules())
		const decision = decide(wf, store.rules(), policyContext(store, cfg, wf))
		wf.decision = decision
		commit()
		if (rule?.id !== run.rule || decision.action !== 'send') continue
		try {
			const sent = await send(store, src, cfg, wf, wf.draft?.text, { ruleId: run.rule }, probe)
			if (sent && wf.sent) {
				store.log({ event: 'review-autoreplied', code: wf.code, pr: run.pr, rule: run.rule, byRule: run.rule })
				commit.refresh()
				if (wf.reviewRun?.job !== job.id || wf.revAt !== run.turn || wf.pending.length) continue
				wf.reviewRun = { ...run, phase: 'replied' }
				wf.reviewDone = { ...facts, ...(fallback ? { fallback } : {}), reply: { text: wf.sent.text ?? frame, teams: messageLink(wf.chat.id, wf.sent.msgId) } }
				commit()
			}
		} catch (error) {
			commit.refresh()
			wf.status = `Review comments posted; reply not sent: ${String(error).slice(0, 180)}`
			commit()
			store.log({ event: 'review-autoreply-failed', code: wf.code, byRule: run.rule, reason: String(error).slice(0, 300) })
		}
	}
}
