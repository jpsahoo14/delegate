import type { Config, Workflow } from '../core/types.ts'
import { isVote, prIdOf, sameHead, voteName, voteValue } from '../core/effects.ts'
import type { Store } from '../store/state.ts'
import { adoProbe, askPrs, prRefFor, prRefOf, prTarget, type BuildProbe } from './probe.ts'
import { approvalReplyMatches, claimedPrs, othersApprovalMismatch, prNumbersIn, voteSentences } from './work.ts'
import { pageDigest } from '../core/page-approval.ts'
import { voteHold } from '../core/owner-send.ts'

export type VoteClaimCheck = { pr?: number; claim: number | 'approval' | 'others'; vote?: number; why: string; canOverride?: false }
export const voteClaimDigest = (text: string, check: VoteClaimCheck) => pageDigest([text, check.pr, check.claim, check.vote, check.why])
export const voteClaimReview = (wf: Workflow) => {
	const held = voteHold(wf)
	return held && (wf.holdDigest ? pageDigest([wf.holdDigest, held.digest]) : held.digest)
}

export async function checkVoteClaims(store: Store, cfg: Config, wf: Workflow, text: string, ownWords: boolean, probe?: BuildProbe): Promise<VoteClaimCheck | undefined> {
	const live = probe ?? adoProbe(cfg), sentences = voteSentences(text, cfg.owner.name).filter(s => s.kind !== 'none')
	let pr: number | undefined, claim: VoteClaimCheck['claim'] = sentences[0]?.kind === 'others' ? 'others' : sentences[0]?.vote ?? 'approval'
	try {
		if (!live?.pr) throw new Error('no live PR check is configured')
		const ids = claimedPrs(text, askPrs(store, wf), prTarget(store, wf)), primary = prRefOf(store, wf)
		if (!ids.length) throw new Error('the reply claims a vote but no single PR can be identified')
		for (const id of ids) {
			pr = id
			const ref = primary?.id === id ? primary : prRefFor(store, wf, id)
			if (!ref) throw new Error(`no link to PR ${id} was found to read it`)
			const st = await live.pr(ref.project, ref.repo, id)
			if (!/^(active|completed|abandoned)$/i.test(st.status)) throw new Error(`PR ${id} returned no readable status`)
			const named = st.votes.filter(v => v.name.trim().toLowerCase() === cfg.owner.name.trim().toLowerCase())
			let vote = named.length === 1 ? named[0].vote : undefined
			wf.prRead = JSON.stringify([id, st.status, st.head, vote])
			wf.prReadAt = new Date().toISOString()
			const askedAt = Date.parse(store.thread(wf.id).filter(m => !m.byOwner).at(-1)?.at ?? wf.createdAt)
			const receipts = (wf.effects ?? []).filter(e => e.done && !e.off && !e.maybe && !e.error && isVote(e.call) && prIdOf(e.call) === id &&
				Date.parse(e.done.at) >= askedAt && sameHead(e.head, st.head) &&
				String(e.call?.args.project ?? '').toLowerCase() === ref.project.toLowerCase() &&
				[ref.repo, st.repo, st.repoId].some(repo => repo?.toLowerCase() === String(e.call?.args.repositoryId ?? '').toLowerCase()))
			if (!st.votes.length && /completed|abandoned/i.test(st.status) && receipts.length === 1) vote = voteValue(receipts[0].call)
			for (const said of sentences) {
				const targets = prNumbersIn(said.sentence)
				if (targets.length && !targets.includes(id)) continue
				claim = said.kind === 'others' ? 'others' : said.vote
				const why = said.others && said.kind === 'others' ? othersApprovalMismatch([said.others], st, id) :
					(vote === undefined || (said.vote === 'approval' ? vote < 5 : vote !== said.vote)) ?
						`the reply claims ${said.vote === 'approval' ? 'approval' : voteName(said.vote)} on PR ${id}, but your vote is ${vote === undefined ? 'not set or not readable' : voteName(vote)}` :
						!approvalReplyMatches(said.sentence, vote, id) ? `PR ${id}'s live vote does not support the reply's exact wording` : undefined
				store.log({ event: said.kind === 'others' ? 'pr-others-checked' : 'pr-claim-checked', code: wf.code, pr: id, status: st.status, ok: !why })
				if (why) return { pr: id, claim, vote, why }
			}
			if (!ownWords && wf.prDraft) {
				let basis: unknown
				try { basis = JSON.parse(wf.prDraft) }
				catch { return { pr: id, claim, vote, why: `PR ${id}'s draft evidence could not be read`, canOverride: false } }
				if (!Array.isArray(basis) || basis[0] !== id || typeof basis[2] !== 'string' || !sameHead(basis[2], st.head))
					return { pr: id, claim, vote, why: `PR ${id} changed since this draft`, canOverride: false }
			}
		}
		return undefined
	} catch (error) {
		const why = `the PR vote could not be verified (${String(error).replace(/^Error: /, '').slice(0, 200)})`
		store.log({ event: 'pr-send-held', code: wf.code, pr, reason: why })
		return { pr, claim, why }
	} finally { if (!probe) await live?.close?.() }
}
