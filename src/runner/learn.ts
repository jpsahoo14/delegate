import { randomUUID } from 'node:crypto'
import type { Claim, Config, EditScope, Job, Workflow } from '../core/types.ts'
import { ulid } from '../core/ids.ts'
import type { Store } from '../store/state.ts'
import { offRecord } from '../core/levels.ts'
import { messageLink, openLink } from '../adapters/channels.ts'
import { literalLearning } from '../core/learning.ts'
import { knowledgeOf } from './proposals.ts'
import { editKinds, noticeHabits } from './habits.ts'

// One detached run per edited reply; its claims become a K proposal from "your edit of A7" (R-LRN-01..03).
export function learnFrom(store: Store, cfg: Config, wf: Workflow, draft: string, sent: string) {
	if (offRecord(cfg, wf.chat.id)) return
	if (literalLearning(sent)) { store.log({ event: 'learning-skipped', code: wf.code, reason: 'literal control text or item code' }); return }
	const now = new Date().toISOString()
	const link = wf.sent?.msgId ? messageLink(wf.chat.id, wf.sent.msgId) : ''
	// Edit habits: what kind of edit this was, measured by code; tone and language follow from the learn run (pm-edit-habits.md).
	const scope: EditScope = { item: wf.id, chat: wf.chat.id, chatName: wf.chat.name, group: !!wf.chat.group, ...(wf.asker ? { asker: { id: wf.asker.id, name: wf.asker.name } } : {}) }
	store.log({ event: 'edit-style', at: now, ...scope, kinds: editKinds(draft, sent), ...(link ? { link } : {}) })
	noticeHabits(store, cfg)
	const goal = [`Draft: "${draft}"`, `Sent by the owner: "${sent}"`, `Sent message: ${link || 'no link'}, ${now.slice(0, 10)}, ${cfg.owner.name}`, `Chat: ${wf.chat.name}. Asker: ${wf.asker?.name ?? 'unknown'}.`].join('\n')
	store.saveJob({ schema: 1, id: ulid(), key: `learn:${wf.id}:${ulid()}`, goal, learning: { source: link, text: sent, style: scope }, label: `your edit of ${wf.code}`, session: { agent: cfg.agent.flavor, id: randomUUID() }, state: 'queued', purpose: 'work', parents: [], asks: [], createdAt: now, updatedAt: now })
}

export function learnedClaims(store: Store, job: Job, claims: Claim[]): Claim[] {
	const text = job.learning?.text ?? job.goal.match(/Sent by the owner: "([\s\S]*?)"\nSent message:/)?.[1]
	const source = job.learning?.source ?? job.goal.match(/Sent message: (https:\S+), \d{4}-\d{2}-\d{2},/)?.[1]
	if (!text || !source || literalLearning(text) || store.withdrawnKnowledgeSources().some(link => openLink(link) === openLink(source))) {
		store.log({ event: 'learning-rejected', job: job.id, reason: !text || !source ? 'missing original sent message' : literalLearning(text) ? 'literal control text or item code' : 'source withdrawn' })
		return []
	}
	const safe = claims.filter(claim => !literalLearning(`${claim.topic} ${claim.text}`))
	if (safe.length !== claims.length) store.log({ event: 'learning-rejected', job: job.id, reason: 'claim contains literal control text or item code', claims: claims.length - safe.length })
	return safe.map(claim => ({ ...claim, src: [{ link: source, date: job.createdAt.slice(0, 10), who: store.config().owner.name }] }))
}

export function withdrawLearning(store: Store, cfg: Config, chat: string, msgId: string): number {
	const link = openLink(messageLink(chat, msgId))
	store.withdrawKnowledgeSource(link)
	const removed = knowledgeOf(store, cfg).withdrawSource(link)
	for (const proposal of store.proposals()) {
		const ops = proposal.ops.map((op, i) => ({ op: { ...op, entry: { ...op.entry, src: op.entry.src.filter(source => openLink(source.link) !== link) } }, i }))
		if (ops.every(({ op, i }) => op.entry.src.length === proposal.ops[i].entry.src.length)) continue
		const kept = ops.filter(({ op }) => op.entry.src.length)
		proposal.ops = kept.map(({ op }) => op)
		const applied = proposal.applied
		if (applied) proposal.applied = { ...applied, ids: kept.map(({ i }) => applied.ids[i]),
			lines: applied.lines && kept.map(({ i }) => applied.lines![i]), prev: applied.prev && kept.map(({ i }) => applied.prev![i]) }
		const now = new Date().toISOString()
		Object.assign(proposal, { state: kept.length ? proposal.state : 'dropped', revAt: now, status: 'Source withdrawn by you' })
		store.saveProposal(proposal)
	}
	store.log({ event: 'learning-source-withdrawn', chat, msgId, entries: removed })
	return removed
}
