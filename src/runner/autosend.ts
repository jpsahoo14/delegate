import type { Config, Workflow } from '../core/types.ts'
import { markedHold } from './sharing.ts'
import { DEFAULT_POLICY, decide, signatureOf, withMarker } from '../core/policy.ts'
import type { Source } from '../adapters/source.ts'
import type { Store } from '../store/state.ts'
import { send } from './apply.ts'
import { close } from './intake.ts'

const policy = (cfg: Config) => ({ ...DEFAULT_POLICY, ...cfg.policy })

// After a worker drafts, the owner's rules decide: send later, acknowledge now, keep as a draft, or ignore (R-POL-01).
export async function afterDraft(store: Store, src: Source, cfg: Config, wf: Workflow): Promise<void> {
	if (wf.state !== 'needs_human' || !wf.draft || wf.draft.preview) return
	const p = policy(cfg)
	const d = decide(wf, store.rules(), { autoSend: !!store.control().autoSend, autoSendsThisHour: autoCount(store, wf), maxPerHour: p.maxAutoPerChatHour, never: p.never, held: Object.keys(store.heldRules()) })
	wf.decision = d
	wf.held = undefined
	if (d.action === 'ignore') return close(wf, d.reason)
	// Paused means nothing is sent, even after resume: a rule never schedules a send, and the draft stays with the owner,
	// as the pause command holds a scheduled one (PM verification of N1a; apply.ts control).
	if (d.action === 'send' && (store.control().paused || cfg.paused)) { Object.assign(wf, { held: 'paused', status: 'Held: you paused' }); return }
	if (d.action === 'send') {
		wf.state = 'scheduled'
		wf.sendAt = new Date(Date.now() + p.delayMin * 60_000).toISOString()
		return
	}
	if (d.action === 'ack') await ack(store, src, cfg, wf, d.ruleId)
}

// A job item gets the same acknowledgement a rule allows for a draft (scenario 04 step 1, tester P2-16).
export async function ackJob(store: Store, src: Source, cfg: Config, wf: Workflow): Promise<void> {
	const p = policy(cfg)
	const d = decide(wf, store.rules(), { autoSend: !!store.control().autoSend, autoSendsThisHour: autoCount(store, wf), maxPerHour: p.maxAutoPerChatHour, never: p.never, held: Object.keys(store.heldRules()) })
	if (d.action === 'ack') await ack(store, src, cfg, wf, d.ruleId)
}

async function ack(store: Store, src: Source, cfg: Config, wf: Workflow, ruleId?: string) {
	const p = policy(cfg)
	if (!wf.sent && !wf.acked && !store.control().paused && !(await ownerActive(store, src))) {
		// Marked and saved before posting: an acknowledgement goes out at most once, even if the result is lost.
		wf.acked = true
		store.save(wf)
		const first = cfg.owner.name.split(/\s+/)[0]
		const oof = await src.presence().then(r => r.oof, () => undefined)
		const text = withMarker([p.ackText.replace('{first}', first), oof && awayLine(first, oof)].filter(Boolean).join(' '), signatureOf(cfg), cfg.owner.name)
		const { msgId } = await src.send(wf.chat.id, text)
		store.addSent(msgId, text)
		store.addAuto(wf.chat.id, 'ack')
		store.log({ event: 'ack', workflowId: wf.id, code: wf.code, rule: ruleId, msgId })
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
	return done + store.workflows().filter(w => w.id !== wf.id && w.chat.id === wf.chat.id && w.state === 'scheduled').length
}

// Owner presence holds automatic sends while the owner is at the keyboard (R-POL-11).
export async function ownerActive(store: Store, src: Source): Promise<boolean> {
	const last = store.activity().ownerLastAt
	if (!last || Date.now() - Date.parse(last) > 10 * 60_000) return false
	return (await src.presence()).availability === 'Available'
}

// Send every scheduled reply whose delay has passed, through the same pre-send checks as an owner send (R-POL-03).
export async function dueSends(store: Store, src: Source, cfg: Config): Promise<number> {
	const due = store.workflows().filter(w => w.state === 'scheduled' && w.sendAt && Date.parse(w.sendAt) <= Date.now())
	for (const w of due.filter(w => w.draft?.preview)) { Object.assign(w, { state: 'needs_human', sendAt: undefined, status: 'Edited by you; waits for your ok' }); store.save(w) }
	if (!due.length) return 0
	if (await ownerActive(store, src)) {
		for (const w of due) { w.status = 'Held: you are active in Teams'; store.save(w) }
		return 0
	}
	let n = 0
	for (const wf of due.filter(w => w.state === 'scheduled')) {
		// Rules, auto-send, limits, and chat levels are checked again at send time, so a change during the delay wins.
		wf.shareHold = markedHold(cfg, wf.drewOn) ?? wf.shareHold
		const d = decide(wf, store.rules(), { autoSend: !!store.control().autoSend, autoSendsThisHour: autoCount(store, wf), maxPerHour: policy(cfg).maxAutoPerChatHour, never: policy(cfg).never, held: Object.keys(store.heldRules()) })
		if (d.action !== 'send') { Object.assign(wf, { state: 'needs_human', sendAt: undefined, decision: d, status: `Not sent: ${d.reason}` }); store.save(wf); continue }
		try {
			if (await send(store, src, cfg, wf, wf.draft?.text, { ruleId: d.ruleId })) { n++; store.addAuto(wf.chat.id, 'send') }
		} catch (e) {
			// One failed send never blocks the others; the owner sees why in the inbox.
			Object.assign(wf, { state: 'needs_human', sendAt: undefined, status: `Not sent: ${String(e).slice(0, 120)}` })
			store.log({ event: 'autosend-failed', workflowId: wf.id, code: wf.code, error: String(e).slice(0, 300) })
		}
		store.save(wf)
	}
	return n
}
