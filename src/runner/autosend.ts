import type { Config, Workflow } from '../core/types.ts'
import { markedHold, membersOf, membershipUnknown, membershipWait } from './sharing.ts'
import { authorizeReply, DEFAULT_POLICY, decide, REPLY_BLANK, replyGap, ruleFor, signatureOf, withMarker, type PolicyContext } from '../core/policy.ts'
import type { Source } from '../adapters/source.ts'
import type { Store } from '../store/state.ts'
import { send } from './apply.ts'
import { close } from './intake.ts'
import type { BuildProbe } from './probe.ts'
import { holdReplyGap } from './reply-gap.ts'
import { freshRead } from '../store/fs.ts'
import { recordCommit } from './commit.ts'
import { stateFields, statusFields } from '../core/upgrades.ts'
import { hourlyCap } from '../core/limits.ts'

const policy = (cfg: Config) => ({ ...DEFAULT_POLICY, ...cfg.policy })
// What the owner's rules are judged with for this item: the page's "why it waited" uses the same (#33).
export const policyContext = (store: Store, cfg: Config, wf: Workflow): PolicyContext => {
	const members = store.members()[wf.chat.id]
	return { autoSend: !!store.control().autoSend, autoSendsThisHour: autoCount(store, wf), maxPerHour: hourlyCap(policy(cfg).maxAutoPerChatHour),
		never: policy(cfg).never, held: Object.keys(store.heldRules()), paused: !!cfg.paused || store.control().paused || store.control().stopped,
		guests: members?.outside !== undefined ? members.guests : undefined, outsideAsker: !!wf.asker && !!members?.outside?.some(id => id.toLowerCase() === wf.asker!.id.toLowerCase()) }
}

export function automaticDecision(store: Store, cfg: Config, wf: Workflow, ctx = policyContext(store, cfg, wf)) {
	const rules = store.rules(), decision = decide(wf, rules, ctx)
	if (membershipUnknown(store, wf.chat.id) && ctx.autoSend) {
		// Organization rules cannot match an unknown audience; this comparison records a wait, never permission.
		const known = decision.blockedBy === 'sharing' ? undefined : decide(wf, rules, { ...ctx, guests: false })
		if (decision.blockedBy === 'sharing' || known?.action === 'send' || known?.action === 'ack') membershipWait(store, wf.chat.id)
	}
	return decision
}

// After a worker drafts, the owner's rules decide: send later, acknowledge now, keep as a draft, or ignore (R-POL-01).
export async function afterDraft(store: Store, src: Source, cfg: Config, wf: Workflow): Promise<void> {
	if (wf.state !== 'needs_human' || !wf.draft || wf.draft.preview) return
	if (holdReplyGap(store, wf, wf.draft.text, true)) return
	await membersOf(store, src, wf.chat.id)
	const p = policy(cfg)
	const d = automaticDecision(store, cfg, wf)
	if (d.action === 'ack') recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
	wf.decision = d
	wf.held = undefined
	if (d.action === 'ignore') return close(wf, d.reason)
	// Paused means nothing is sent, even after resume: a rule never schedules a send, and the draft stays with the owner,
	// as the pause command holds a scheduled one (PM verification of N1a; apply.ts control).
	if (d.action === 'send' && (store.control().paused || cfg.paused)) { Object.assign(wf, { held: 'paused', ...statusFields('not-sent', 'Held: you paused') }); return }
	if (d.action === 'send') {
		Object.assign(wf, stateFields(wf, 'scheduled'))
		wf.sendAt = new Date(Date.now() + p.delayMin * 60_000).toISOString()
		return
	}
	if (d.action === 'ack') await ack(store, src, cfg, wf, d.ruleId)
}

// A job item gets the same acknowledgement a rule allows for a draft (scenario 04 step 1, tester P2-16).
export async function ackJob(store: Store, src: Source, cfg: Config, wf: Workflow): Promise<void> {
	await membersOf(store, src, wf.chat.id)
	const d = automaticDecision(store, cfg, wf)
	if (d.action === 'ack') await ack(store, src, cfg, wf, d.ruleId)
}

async function ack(store: Store, src: Source, cfg: Config, wf: Workflow, ruleId?: string) {
	const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
	const p = policy(cfg)
	if (!wf.sent && !wf.acked && !store.control().paused && !(await ownerActive(store, src))) {
		const first = cfg.owner.name.split(/\s+/)[0]
		const oof = await src.presence().then(r => r.oof, () => undefined)
		const raw = withMarker([p.ackText.replace('{first}', first), oof && awayLine(first, oof)].filter(Boolean).join(' '), signatureOf(cfg), cfg.owner.name)
		await membersOf(store, src, wf.chat.id, true)
		const auth = freshRead(() => {
			commit.refresh()
			const currentCfg = store.config(), current = store.workflow(wf.id)
			if (!current || current.ownerSend || current.sent || current.acked || current.lastMsgId !== wf.lastMsgId) {
				wf.decision = { action: 'draft', ruleId, reason: 'The item changed; the acknowledgment waits for you', confidence: 'low' }
				return undefined
			}
			const ctx = policyContext(store, currentCfg, wf)
			const decision = automaticDecision(store, currentCfg, wf, ctx)
			if (decision.action !== 'ack' || decision.ruleId !== ruleId) { wf.decision = decision; return undefined }
			return authorizeReply(wf, ctx, raw, true, ruleFor(wf, store.rules())?.who.group === 'outside')
		})
		if (!auth?.allowed) {
			if (auth) wf.decision = { action: 'draft', ruleId, reason: auth.reason, blockedBy: auth.blockedBy, confidence: wf.decision?.confidence ?? 'low' }
			store.log({ event: 'ack-held', code: wf.code, byRule: ruleId, blockedBy: wf.decision?.blockedBy, reason: wf.decision?.reason })
			commit()
			return
		}
		const text = auth.text!
		if (replyGap(text)) { holdReplyGap(store, wf, text, true); store.setHealth(`ack:${wf.code}`, REPLY_BLANK); return }
		// Marked and saved before posting: an acknowledgement goes out at most once, even if the result is lost.
		wf.acked = true
		commit()
		const { msgId } = await src.send(wf.chat.id, text)
		store.addSent(msgId, text)
		store.addAuto(wf.chat.id, 'ack')
		store.log({ event: 'ack', workflowId: wf.id, code: wf.code, rule: ruleId, byRule: ruleId, msgId })
	}
}

// The return date comes from the owner's own out-of-office text; without one, the line says only that they are away (R-POL-12).
export function awayLine(first: string, oof: string): string {
	const back = oof.match(/\b(?:until|till|returning(?: on)?|back(?: on)?|return(?:ing)? on)\s+([A-Z0-9][^.,;\n]{1,28}?)(?=[.,;\n]|\s+(?:and|with|for|please)\b|$)/i)?.[1]?.trim()
	return back ? `${first} is out of office until ${back}.` : `${first} is out of office.`
}

// Scheduled and sent automatic replies both count toward the per-chat hourly limit (R-POL-07).
function autoCount(store: Store, wf: Workflow): number {
	const hourAgo = Date.now() - 3_600_000
	const done = store.autoLedger().filter(e => e.chat === wf.chat.id && Date.parse(e.at) > hourAgo).length
	return done + store.workflows().filter(w => w.id !== wf.id && w.chat.id === wf.chat.id && (w.state === 'scheduled' || w.reviewRun?.phase === 'posting')).length
}

// Owner presence holds automatic sends while the owner is at the keyboard (R-POL-11).
export async function ownerActive(store: Store, src: Source): Promise<boolean> {
	const last = store.activity().ownerLastAt
	if (!last || Date.now() - Date.parse(last) > 10 * 60_000) return false
	return (await src.presence()).availability === 'Available'
}

// Send every scheduled reply whose delay has passed, through the same pre-send checks as an owner send (R-POL-03).
export async function dueSends(store: Store, src: Source, cfg: Config, probe?: BuildProbe): Promise<number> {
	const due = store.workflows().filter(w => w.state === 'scheduled' && w.sendAt && Date.parse(w.sendAt) <= Date.now()).filter(w => !holdReplyGap(store, w, w.draft?.text, true))
	for (const w of due.filter(w => w.draft?.preview)) {
		const commit = recordCommit(w, () => store.workflow(w.id), store.save.bind(store))
		Object.assign(w, { ...stateFields(w, 'needs_human'), sendAt: undefined, status: 'Edited by you; waits for your ok' }); commit()
	}
	if (!due.length) return 0
	if (await ownerActive(store, src)) {
		for (const was of due) freshRead(() => {
			const w = store.workflow(was.id)
			if (w?.state === 'scheduled') { Object.assign(w, statusFields('not-sent', 'Held: you are active in Teams')); store.save(w) }
		})
		return 0
	}
	let n = 0
	for (const was of due.filter(w => w.state === 'scheduled')) {
		const wf = freshRead(() => store.workflow(was.id))
		if (!wf || wf.state !== 'scheduled') continue
		const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
		// Rules, auto-send, limits, and chat levels are checked again at send time, so a change during the delay wins.
		wf.shareHold = markedHold(cfg, wf.drewOn) ?? wf.shareHold
		await membersOf(store, src, wf.chat.id)
		const d = automaticDecision(store, cfg, wf)
		if (d.action !== 'send') { Object.assign(wf, { ...stateFields(wf, 'needs_human'), sendAt: undefined, decision: d, ...statusFields('not-sent', `Not sent: ${d.reason}`) }); commit(); continue }
		try {
			if (await send(store, src, cfg, wf, wf.draft?.text, { ruleId: d.ruleId }, probe)) { n++; store.addAuto(wf.chat.id, 'send') }
		} catch (e) {
			// One failed send never blocks the others; the owner sees why in the inbox.
			Object.assign(wf, { ...stateFields(wf, 'needs_human'), sendAt: undefined, ...statusFields('not-sent', `Not sent: ${String(e).slice(0, 120)}`) })
			store.log({ event: 'autosend-failed', workflowId: wf.id, code: wf.code, error: String(e).slice(0, 300) })
		}
		commit()
	}
	return n
}
