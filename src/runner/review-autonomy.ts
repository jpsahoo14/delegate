import { isDeepStrictEqual } from 'node:util'
import type { Source as ChatSource } from '../adapters/source.ts'
import { messageLink } from '../adapters/channels.ts'
import { pendingEffects, isVote, prIdOf, sameChange, sameHead, refusal } from '../core/effects.ts'
import { pageChangeId } from '../core/page-approval.ts'
import { decide, replyGap, reviewRuleFor } from '../core/policy.ts'
import { authorize } from '../core/limits.ts'
import { reviewDoneFacts, unitForJob, type UnitReviewRun } from '../core/review.ts'
import { scrubDeep } from '../core/secrets.ts'
import type { Config, Effect, Job, PrFacts, PrUnit, ReviewFinding, Workflow } from '../core/types.ts'
import { stateFields } from '../core/upgrades.ts'
import { freshRead } from '../store/fs.ts'
import type { Store } from '../store/state.ts'
import { send } from './apply.ts'
import { policyContext } from './autosend.ts'
import { cachedCatalogs } from './catalog.ts'
import type { Caller } from './change.ts'
import { recordCommit } from './commit.ts'
import { buildCommentCall, effectCallProblem, isInlineComment } from './effect-calls.ts'
import { advanceReviewUnits, createChangeCarrier, keyOf, stillApproved } from './jobs.ts'
import { madeBefore, maybeOf } from './ledger.ts'
import { adoProbe, factsOf, prOf, type BuildProbe, type PrRef } from './probe.ts'
import { MAY_REVIEW, roleOn } from './review-gate.ts'
import { membersOf } from './sharing.ts'
import { completeAction, reviewAction, startAction, type ActionPart } from './action-record.ts'

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const clean = (v: string) => v.replace(/^\[(?:High|Medium|Low)\]\s*/i, '').replace(/\s+/g, ' ').trim()
const priority = { High: 0, Medium: 1, Low: 2 }
type Thread = { file: string; line: number; text: string }
type Options = { probe?: BuildProbe; call: Caller; completed?: { job: Job; effects: Effect[] } }
export type ReviewCompletion = { pr: number; head?: string; status?: string; at: string; basis?: Workflow['reviewBasis']; facts?: PrFacts }
const ledgerSeverity = { High: 'high', Medium: 'medium', Low: 'low' } as const
function commentParts(effects: Effect[], pr: number, ruleId: string): ActionPart[] {
	return effects.map(e => {
		const payload = object(e.payload) ? e.payload : {}, args = e.call?.args ?? {}
		return {
			kind: 'comment', pr, text: String(args.content ?? args.text ?? args.body ?? '').split(/\r?\n/)[0],
			...(typeof payload.file === 'string' ? { file: payload.file } : {}),
			...(typeof payload.line === 'number' ? { line: payload.line } : {}),
			...(e.severity ? { severity: ledgerSeverity[e.severity] } : {}),
			...(e.done?.ref && /^https?:\/\//i.test(e.done.ref) ? { link: e.done.ref } : {}),
			outcome: e.maybe ? 'unconfirmed' : e.error || e.off ? 'failed' : e.done?.byRule === ruleId ? 'posted' : 'unconfirmed',
			...(e.error ? { why: e.error } : e.off ? { why: 'Not posted: already covered on the PR or left out.' } : {}),
		}
	})
}

export async function checkReviewCompletion(store: Store, job: Job, probe?: BuildProbe): Promise<ReviewCompletion | undefined> {
	const parents = freshRead(() => job.parents.map(id => store.workflow(id)).filter((w): w is Workflow => w?.intent === 'pr_review'))
	const unit = parents.map(w => unitForJob(w, job.id)).find(unit => unit !== undefined)
	const legacy = parents.find(w => w.prs === undefined)
	const ref = unit ? unit.ref : legacy && prOf(store, legacy)
	if (!ref) return undefined
	const at = new Date().toISOString()
	let reader = probe
	try {
		reader ??= adoProbe(freshRead(() => store.config()))
		if (!reader?.pr) throw new Error('The PR cannot be read at review completion')
		const live = await reader.pr(ref.project, ref.repo, ref.id)
		const start = job.reviewStart
		const basis = start?.pr === ref.id && sameHead(start.head, live.head) ? { ...start } : undefined
		return { pr: ref.id, head: live.head, status: live.status, at, basis, facts: factsOf(live) }
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
function shareable(wf: Workflow, f: ReviewFinding, ref: PrRef, result?: Job['result']) {
	const reads = result?.reviewSources
	if (!reads || reads.unknown || reads.restricted || reads.chats.length) return false
	if (wf.shareHold || wf.records?.some(r => r.audience !== 'org') || wf.drewOn?.length ||
		wf.looked?.some(r => r.tool !== 'ado' && r.n > 0)) return false
	const sources = [...(result?.reply?.sources ?? []), ...(f.sources ?? [])]
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

async function live(store: Store, cfg: Config, unit: PrUnit, probe?: BuildProbe) {
	const ref = unit.ref
	if (!ref) throw new Error('The PR cannot be checked; comments stay proposed')
	let reader = probe
	try {
		reader ??= adoProbe(cfg)
		if (!reader?.pr) throw new Error('The PR cannot be checked; comments stay proposed')
		const st = await reader.pr(ref.project, ref.repo, ref.id)
		if (!/^active$/i.test(st.status) || !st.head) throw new Error(`PR ${ref.id} is closed or its head could not be read`)
		const role = await roleOn(cfg, reader, ref, st)
		if (!MAY_REVIEW.includes(role)) throw new Error(`The owner is not an eligible reviewer on PR ${ref.id} (${role})`)
		const groups = (st.reviewers ?? []).filter(r => r.group).map(r => r.name.split('\\').at(-1)!.normalize('NFKC').trim())
		return { ref, head: st.head, groups }
	} finally {
		if (!probe) try { await reader?.close?.() } catch (error) {
			store.log({ event: 'probe-close-failed', pr: ref.id, error: String(error).slice(0, 200) })
		}
	}
}
function safety(store: Store, cfg: Config, wf: Workflow, unit: PrUnit, rule: string, groups = unit.groups) {
	const check = { ...wf, prGroups: groups, draft: { text: 'Review comments.', commitment: false, sources: [] } }
	const decision = decide(check, store.rules(), policyContext(store, cfg, wf), 'review-comments')
	return decision.action !== 'send' ? decision.reason : decision.ruleId === rule ? undefined : 'The review rule changed; comments stay proposed'
}
function verified(unit: PrUnit): boolean {
	const frame = unit.review, completed = frame?.completed
	return !!unit.requested && !!unit.ref && unit.read === 'ok' && !unit.skip && !unit.again && !unit.decline &&
		!!unit.role && MAY_REVIEW.includes(unit.role) && !!completed?.verified &&
		sameHead(completed.head, unit.head) && sameHead(completed.head, frame?.basis?.head)
}
function postingBlocked(store: Store, wf: Workflow, unit: PrUnit): boolean {
	return wf.state === 'done' || wf.state === 'running' || !!wf.ownerSend || !!wf.approved || !!wf.pending.length ||
		!!wf.draft?.byOwner || !!wf.draft?.preview || !!store.openWindow(wf.id) ||
		wf.reviewReply?.phase === 'replied' || !!wf.sent && !wf.sent.holding && wf.sent.askMsgId === wf.lastMsgId ||
		[unit.job, unit.review?.completed?.job, unit.review?.run?.job, unit.review?.run?.carrier]
			.some(id => !!id && !!store.openWindow(id))
}

// Called at the last write boundary as well as before the subset is queued.
export async function reviewPostCheck(store: Store, job: Job, e: Effect, call: Caller, probe?: BuildProbe): Promise<{ error?: string; duplicate?: true }> {
	const byRule = job.byRule
	if (!byRule) return { error: 'The review comment has no rule approval; it stays proposed' }
	try {
		const cfg = freshRead(() => store.config())
		const wf = freshRead(() => job.parents.map(id => store.workflow(id)).find(w => w && stillApproved(w, job)))
		const unit = wf && unitForJob(wf, job.id), run = unit?.review?.run
		if (!wf || !unit || !run || !verified(unit) || job.byRule !== e.byRule || prIdOf(e.call) !== unit.id) return { error: 'The review comment approval changed; it stays proposed' }
		const { ref, head, groups } = await live(store, cfg, unit, probe)
		if (!sameHead(unit.review?.basis?.head, head) || !sameHead(head, run.head) || !sameHead(e.head, head)) return { error: 'New changes since the review; comments stay proposed' }
		const carrier = store.job(run.carrier)
		const completed = unit.review?.completed
		if (!carrier?.result || !completed || completed.job !== carrier.id || completed.resultAt !== carrier.result.at ||
			run.resultAt !== carrier.result.at) return { error: 'The completed review changed; comments stay proposed' }
		const f = findingFor(e, carrier?.result?.findings)
		if (!f?.severity || !shareable(wf, f, ref, carrier.result) || !isDeepStrictEqual(commentCall(cfg, e, ref), e.call)) return { error: 'The finding or its audience could not be verified; it stays proposed' }
		const duplicate = covered(await threads(cfg, ref, call), e)
		return freshRead(() => {
			const latest = store.workflow(wf.id), currentCfg = store.config(), currentJob = store.job(job.id)
			const currentUnit = latest && unitForJob(latest, job.id), currentRun = currentUnit?.review?.run
			if (!latest || !currentUnit || !currentRun || !verified(currentUnit) || postingBlocked(store, latest, currentUnit) || !currentJob || currentJob.run?.id !== job.run?.id || currentJob.state !== 'running' ||
				!stillApproved(latest, currentJob) ||
				currentUnit.id !== unit.id || currentRun.carrier !== run.carrier || currentRun.resultAt !== run.resultAt ||
				currentRun.approval.epoch !== run.approval.epoch || !sameHead(currentRun.head, head)) return { error: 'The review changed while checking; comments stay proposed' }
			if (!sameHead(currentUnit.review?.basis?.head, head) || !isDeepStrictEqual(currentUnit.ref, ref)) return { error: 'The reviewed revision is no longer verified; comments stay proposed' }
			const now = { ...latest, prGroups: groups }
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
			const currentCarrier = store.job(currentRun.carrier)
			const currentFinding = findingFor(e, currentCarrier?.result?.findings)
			const currentCompletion = currentUnit.review?.completed
			if (!currentCompletion || currentCompletion.job !== currentCarrier?.id || currentCompletion.resultAt !== currentCarrier?.result?.at ||
				currentRun.resultAt !== currentCarrier?.result?.at || !currentFinding || !shareable(latest, currentFinding, ref, currentCarrier?.result) ||
				!isDeepStrictEqual(commentCall(currentCfg, e, ref), e.call)) return { error: 'The finding or its audience changed while checking; comments stay proposed' }
			const error = refusal(currentCfg, e, ref.id) ?? safety(store, currentCfg, now, currentUnit, byRule, groups)
			if (error) return { error }
			if (duplicate) return { duplicate: true as const }
			return reviewAction(store, latest, currentRun) ? {} : { error: latest.statusReason!.text }
		})
	} catch (error) { return { error: String(error).slice(0, 300) } }
}

// HOST handover: one entry point for queuing the exact comment subset and folding
// its receipts. The ordinary owner-approved change executor remains unchanged.
export async function reviewCommentHook(store: Store, src: ChatSource, cfg: Config, options: Options): Promise<void> {
	if (options.completed) return finishReview(store, src, options.completed.job, options.completed.effects, options.probe)
	if (!reviewRuleForEnabled(store) || !store.control().autoSend || cfg.paused || store.control().paused || store.control().stopped) return
	const targets = store.workflows().flatMap(wf => (wf.prs ?? []).map(unit => ({ workflow: wf.id, pr: unit.id })))
	for (const target of targets) {
		const old = freshRead(() => store.workflow(target.workflow))
		if (!old || old.intent !== 'pr_review' || old.state === 'done' || old.state === 'running' || store.openWindow(old.id) ||
			old.ownerSend || old.approved || old.pending.length || old.draft?.preview || old.draft?.byOwner) continue
		const prior = old.prs?.find(unit => unit.id === target.pr), completed = prior?.review?.completed
		if (!prior || postingBlocked(store, old, prior) || !verified(prior) || !completed || prior.job !== completed.job ||
			!Number.isSafeInteger(prior.review?.epoch) || prior.review!.epoch < 0) continue
		const epoch = prior.review!.epoch
		const original = store.job(completed.job)
		if (!original || original.byRule || original.every || original.state !== 'done' || original.purpose !== 'work' ||
			!original.result?.findings || original.result.at !== completed.resultAt || prior.review?.run?.resultAt === completed.resultAt) continue
		const ownEffects = (old.effects ?? []).filter(effect => prIdOf(effect.call) === prior.id)
		const cleanReview = original.result.reviewClean === true && original.result.findings.length === 0 &&
			original.result.effects.every(effect => isVote(effect.call) && prIdOf(effect.call) === prior.id) &&
			ownEffects.every(effect => isVote(effect.call)) && !original.result.question && !original.result.todos?.length
		if (!cleanReview && !pendingEffects(ownEffects).some(e => { const f = findingFor(e, original.result?.findings); return f?.severity && !f.thread && !e.error && !e.maybe && !e.held })) continue
		const wf = freshRead(() => store.workflow(old.id))
		if (!wf) continue
		const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
		try {
			await membersOf(store, src, wf.chat.id)
			commit.refresh()
			let unit = wf.prs?.find(unit => unit.id === target.pr)
			if (!unit || postingBlocked(store, wf, unit) || !verified(unit) || unit.job !== original.id || unit.review?.epoch !== epoch ||
				unit.review.completed?.resultAt !== completed.resultAt) continue
			wf.chat = { ...wf.chat, guests: store.members()[wf.chat.id]?.guests }
			const { ref, head, groups } = await live(store, cfg, unit, options.probe)
			const rule = reviewRuleFor({ ...wf, prGroups: groups }, store.rules())
			if (!rule) continue
			if (!sameHead(head, completed.head)) throw new Error('The reviewed head is missing or changed; comments stay proposed')
			const seen = cleanReview ? [] : await threads(cfg, ref, options.call)
			commit.refresh()
			unit = wf.prs?.find(unit => unit.id === target.pr)
			if (!unit || postingBlocked(store, wf, unit) || !verified(unit) || unit.job !== original.id || unit.review?.epoch !== epoch ||
				unit.review.completed?.resultAt !== completed.resultAt || !isDeepStrictEqual(unit.ref, ref) ||
				!isDeepStrictEqual(store.config().owner, cfg.owner)) continue
			const currentOriginal = store.job(original.id)
			if (currentOriginal?.state !== 'done' || currentOriginal.result?.at !== completed.resultAt ||
				!isDeepStrictEqual(currentOriginal.result, original.result)) continue
			const priorRun = structuredClone(unit.review.run), priorTurn = wf.revAt
			if (cleanReview) {
				const run: UnitReviewRun = { job: original.id, carrier: original.id, resultAt: completed.resultAt, rule: rule.id, head, phase: 'posting',
					approval: { byRule: rule.id, effectIds: [], effects: keyOf([]), epoch } }
				const checkUnit: PrUnit = { ...unit, review: { ...unit.review, run } }
				const check = { ...wf, prs: wf.prs?.map(value => value.id === checkUnit.id ? checkUnit : value) }
				const error = freshRead(() => safety(store, store.config(), check, checkUnit, rule.id, groups))
				if (error) { wf.status = `Review waits: ${error}`; commit(); continue }
				const action = startAction(store, wf, 'review', rule.id, [])
				if (!action) continue
				// Ledger recovery can refresh wf.prs even without an owner change.
				commit.refresh()
				unit = wf.prs?.find(value => value.id === target.pr)
				if (!unit || wf.intent !== 'pr_review' || wf.revAt !== priorTurn || postingBlocked(store, wf, unit) || !verified(unit) ||
					unit.job !== original.id || unit.review?.epoch !== epoch || unit.review.completed?.resultAt !== completed.resultAt ||
					!sameHead(unit.head, head) || !isDeepStrictEqual(unit.ref, ref) || !isDeepStrictEqual(unit.review.run, priorRun) ||
					!isDeepStrictEqual(store.config().owner, cfg.owner)) continue
				const latestOriginal = store.job(original.id)
				if (latestOriginal?.state !== 'done' || latestOriginal.result?.at !== completed.resultAt ||
					!isDeepStrictEqual(latestOriginal.result, original.result)) continue
				const readyUnit: PrUnit = { ...unit, review: { ...unit.review, run } }
				const ready = { ...wf, prs: wf.prs?.map(value => value.id === readyUnit.id ? readyUnit : value) }
				const readyError = freshRead(() => safety(store, store.config(), ready, readyUnit, rule.id, groups))
				if (readyError) { wf.status = `Review waits: ${readyError}`; commit(); continue }
				unit.review.run = { ...run, action: { id: action.id, at: action.at } }
				commit()
				await finishReview(store, src, original, [], options.probe, true)
				continue
			}
			const selected: Effect[] = []
			const effects = (wf.effects ?? []).map(e => {
				if (prIdOf(e.call) !== target.pr) return e
				if (!pendingEffects([e]).length || e.origin === 'suggested' || e.group || e.error || maybeOf(store, e) || madeBefore(store, e)) return e
				const finding = findingFor(e, original.result!.findings)
				if (!finding?.severity || finding.thread || !isInlineComment(e)) return e
				if (!shareable(wf, finding, ref, original.result)) return { ...e, held: 'sharing' as const }
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
			const run: UnitReviewRun = { job: '', carrier: original.id, resultAt: completed.resultAt, rule: rule.id, head, phase: 'posting',
				approval: { byRule: rule.id, effectIds: batch.map(pageChangeId), effects: keyOf(batch), epoch } }
			const checkUnit: PrUnit = { ...unit, review: { ...unit.review, run } }
			const check = { ...wf, prs: wf.prs?.map(value => value.id === checkUnit.id ? checkUnit : value) }
			const error = safety(store, store.config(), check, checkUnit, rule.id, groups)
			if (error) { wf.effects = effects; wf.status = `Review waits: ${error}`; commit(); continue }
			const action = startAction(store, wf, 'review', rule.id, commentParts(batch, unit.id, rule.id))
			if (!action) continue
			commit.refresh()
			unit = wf.prs?.find(value => value.id === target.pr)
			if (!unit || wf.intent !== 'pr_review' || wf.revAt !== priorTurn || postingBlocked(store, wf, unit) || !verified(unit) ||
				unit.job !== original.id || unit.review?.epoch !== epoch || unit.review.completed?.resultAt !== completed.resultAt ||
				!sameHead(unit.head, head) || !isDeepStrictEqual(unit.ref, ref) || !isDeepStrictEqual(unit.review.run, priorRun) ||
				!isDeepStrictEqual(store.config().owner, cfg.owner)) continue
			const latestOriginal = store.job(original.id)
			if (latestOriginal?.state !== 'done' || latestOriginal.result?.at !== completed.resultAt ||
				!isDeepStrictEqual(latestOriginal.result, original.result)) continue
			const readyUnit: PrUnit = { ...unit, review: { ...unit.review, run } }
			const ready = { ...wf, prs: wf.prs?.map(value => value.id === readyUnit.id ? readyUnit : value) }
			const readyError = safety(store, store.config(), ready, readyUnit, rule.id, groups)
			if (readyError) { wf.effects = effects; wf.status = `Review waits: ${readyError}`; commit(); continue }
			unit.review.run = { ...run, action: { id: action.id, at: action.at } }
			const approvedIds = new Set(batch.map(pageChangeId))
			wf.effects = effects.map(e => prIdOf(e.call) === unit.id && !e.done && !approvedIds.has(pageChangeId(e)) ? { ...e, byRule: undefined } : e)
			const job = createChangeCarrier(store, cfg, wf, batch, unit)
			job.byRule = rule.id; job.state = 'queued'; job.purpose = 'execute'
			job.key = `review-comments:${wf.id}:${job.id}`
			job.goal = `Post review comments on PR ${ref.id} under rule ${rule.id}`
			job.result!.summary = 'Comments authorized by the review rule'
			unit.review.run.job = job.id
			Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), status: `Posting review comments on PR ${ref.id}` })
			store.saveJob(job); commit()
		} catch (error) {
			commit.refresh()
			if (wf.state !== 'done' && wf.prs?.some(unit => unit.id === target.pr && unit.job === original.id && unit.review?.epoch === epoch)) {
				wf.status = `Review comments not posted: ${String(error).replace(/^Error: /, '').slice(0, 240)}`
				commit()
			}
			store.log({ event: 'review-autopost-held', code: wf.code, reason: String(error).slice(0, 300) })
		}
	}
	for (const wf of store.workflows().filter(wf => wf.reviewReply?.phase === 'held'))
		await sendReviewReply(store, src, wf.id, options.probe)
}
const reviewRuleForEnabled = (store: Store) => store.rules().some(r => r.then === 'review' && !r.off)

async function finishReview(store: Store, src: ChatSource, job: Job, effects: Effect[], probe?: BuildProbe, cleanReview = false) {
	for (const id of job.parents) {
		const wf = freshRead(() => store.workflow(id))
		let unit = wf && unitForJob(wf, job.id), run = unit?.review?.run
		if (!wf || !unit?.review || !run || run.phase !== 'posting' || run.job !== job.id) continue
		const expectedUnit = unit.id, expectedEpoch = unit.review.epoch, expectedHead = unit.head
		const expectedRun = structuredClone(run), expectedRef = structuredClone(unit.ref)
		const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
		const action = reviewAction(store, wf, run)
		const recorded = !!action && completeAction(store, wf, action, commentParts(effects.filter(e => prIdOf(e.call) === expectedUnit), expectedUnit, expectedRun.rule))
		commit.refresh()
		unit = unitForJob(wf, job.id)
		run = unit?.review?.run
		if (!unit?.review || !run || unit.id !== expectedUnit || unit.review.epoch !== expectedEpoch ||
			!isDeepStrictEqual(unit.head, expectedHead) || !isDeepStrictEqual(unit.ref, expectedRef) ||
			!isDeepStrictEqual(run, expectedRun) || run.phase !== 'posting' || run.job !== job.id) continue
		const completed = unit.review.completed, original = store.job(run.carrier)
		const current = wf.state !== 'done' && verified(unit) && unit.review.epoch === run.approval.epoch && completed?.job === run.carrier &&
			completed.resultAt === run.resultAt && original?.state === 'done' && original.result?.at === run.resultAt &&
			sameHead(completed.head, run.head)
		const verifiedClean = cleanReview && current && job.result?.reviewClean === true && job.result.findings?.length === 0 &&
			job.result.effects.every(effect => isVote(effect.call) && prIdOf(effect.call) === unit.id) &&
			(wf.effects ?? []).filter(effect => prIdOf(effect.call) === unit.id).every(effect => isVote(effect.call)) &&
			!wf.pending.length && !wf.ownerSend && !wf.approved && !job.result.question && !job.result.todos?.length
		const ok = current && (verifiedClean || !cleanReview && stillApproved(wf, job))
		const ownerBusy = wf.state === 'running' || !!wf.ownerSend || !!wf.approved || !!wf.pending.length || !!wf.draft?.byOwner || !!wf.draft?.preview
		wf.effects = (wf.effects ?? []).map(e => {
			if (prIdOf(e.call) !== unit.id) return e
			const made = effects.find(r => sameChange(r, e))
			return made ? { ...e, done: made.done, error: made.error, maybe: made.maybe, off: made.off, byRule: made.done?.byRule } : e
		})
		unit.review.run = { ...run, phase: 'held' }
		unit.job = run.carrier
		const result = original?.result
		if (result && result.at === run.resultAt && original.state === 'done') {
			const receipts = effects.filter(effect => prIdOf(effect.call) === unit.id && isInlineComment(effect) &&
				run.approval.effectIds.includes(pageChangeId(effect)) && (effect.done || effect.error || effect.maybe || effect.off))
			result.effects = result.effects.map(effect => {
				if (effect.done || prIdOf(effect.call) !== unit.id || !isInlineComment(effect)) return effect
				const finding = findingFor(effect, result.findings)
				const made = receipts.find(receipt => sameChange(receipt, effect) ||
					finding !== undefined && findingFor(receipt, result.findings) === finding)
				return made ? { ...effect, done: made.done, error: made.error, maybe: made.maybe, ...(made.off ? { off: true } : {}) } : effect
			})
			store.saveJob(original)
		}
		if (!ok || !unit.review.basis) {
			if (wf.state !== 'done' && !ownerBusy)
				Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, status: 'The review changed while posting; check its comment receipts before sending' })
			commit()
			continue
		}
		const { pr, ...facts } = reviewDoneFacts({ pr: unit.id, ...unit.review.basis }, run.rule, effects)
		if (verifiedClean) facts.clean = true
		facts.waiting = wf.effects.filter(e => prIdOf(e.call) === unit.id && !e.done && !e.off).map(pageChangeId)
		unit.review.done = facts
		const failed = effects.filter(e => e.error || e.maybe).length
		const skipped = wf.effects.filter(effect => prIdOf(effect.call) === pr && isInlineComment(effect)).length - facts.posted.length - failed
		store.log({ event: 'review-autoposted', code: wf.code, pr, posted: facts.posted.length, skipped: Math.max(0, skipped), failed, severities: facts.counts, rule: run.rule, byRule: run.rule })
		if (!ownerBusy)
			Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, status: facts.posted.length ? `PR ${pr} waits for your approval; posted ${facts.posted.length} comments` : `No review comments posted; the review stays with you` })
		const unsettled = effects.some(e => e.maybe || !e.done && !e.off && !e.error)
		if (unsettled && !ownerBusy) wf.status = 'Some review comments have no final receipt; check them before sending the reply'
		commit()
		if ((!facts.posted.length && !facts.clean) || unsettled || ownerBusy || !recorded) continue
		advanceReviewUnits(store, store.config(), wf)
		await sendReviewReply(store, src, wf.id, probe)
	}
}

async function sendReviewReply(store: Store, src: ChatSource, id: string, probe?: BuildProbe) {
	const wf = freshRead(() => store.workflow(id)), shared = wf?.reviewReply
	if (!wf || !shared || shared.phase !== 'held' || wf.state !== 'needs_human' || shared.turn !== wf.revAt ||
		shared.sendText !== wf.draft?.text || wf.pending.length || wf.ownerSend || wf.approved || wf.draft?.byOwner || wf.draft?.preview ||
		store.openWindow(wf.id) || wf.prs?.some(unit => shared.units.includes(unit.id) &&
			[unit.job, unit.review?.completed?.job, unit.review?.run?.job, unit.review?.run?.carrier].some(job => !!job && !!store.openWindow(job)))) return
	const commit = recordCommit(wf, () => store.workflow(id), store.save.bind(store))
	const cfg = store.config(), decision = decide(wf, store.rules(), policyContext(store, cfg, wf))
	wf.decision = decision
	commit()
	if (decision.action !== 'send' || decision.ruleId !== shared.rule) return
	try {
		if (!await send(store, src, cfg, wf, wf.draft?.text, { ruleId: shared.rule }, probe) || !wf.sent) return
		commit.refresh()
		if (wf.reviewReply?.turn !== shared.turn || wf.reviewReply.rule !== shared.rule || wf.pending.length) return
		wf.reviewReply = { ...wf.reviewReply, phase: 'replied' }
		for (const unit of wf.prs ?? []) if (shared.units.includes(unit.id) && unit.review?.done?.byRule === shared.rule)
			unit.review.done.reply = { text: wf.sent.text ?? shared.sendText ?? '', teams: messageLink(wf.chat.id, wf.sent.msgId) }
		commit()
		store.log({ event: 'review-autoreplied', code: wf.code, prs: shared.units, rule: shared.rule, byRule: shared.rule })
	} catch (error) {
		commit.refresh()
		wf.status = `Review comments posted; reply not sent: ${String(error).slice(0, 180)}`
		commit()
		store.log({ event: 'review-autoreply-failed', code: wf.code, byRule: shared.rule, reason: String(error).slice(0, 300) })
	}
}
