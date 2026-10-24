import type { Answer, Automation, Config, Rotation, Schedule } from '../core/types.ts'
import { isPersona } from '../core/intake.ts'
import { ulid } from '../core/ids.ts'
import { DEFAULT_POLICY, REPLY_BLANK, replyGap, signatureOf, withMarker } from '../core/policy.ts'
import { authorize, hourlyCap } from '../core/limits.ts'
import { membersOf, membershipUnknown, membershipWait } from './sharing.ts'
import { voteMention } from '../core/vote-claims.ts'
import { freshRead } from '../store/fs.ts'
import type { Source } from '../adapters/source.ts'
import type { Store } from '../store/state.ts'
import { isThread } from '../adapters/channels.ts'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Calendar dates are the owner's local ones, the same calendar the times use.
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const at = (day: Date, hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m) }

// The next send strictly after `after`, in this machine's local time, or undefined when the schedule has no more.
export function nextAt(s: Schedule, after: Date): Date | undefined {
	if (s.every === 'once') { const t = new Date(s.start); return t > after ? t : undefined }
	if (s.every === 'hours') {
		const start = Date.parse(s.start), step = s.hours * 3_600_000
		if (start > after.getTime()) return new Date(start)
		return new Date(start + (Math.floor((after.getTime() - start) / step) + 1) * step)
	}
	const times = [...new Set([s.at, ...(s.times ?? [])])]
	for (let i = 0; i < 8; i++) {
		const day = new Date(after.getFullYear(), after.getMonth(), after.getDate() + i)
		if (s.every === 'weekday' && (day.getDay() === 0 || day.getDay() === 6)) continue
		if (s.every === 'week' && day.getDay() !== (s.day ?? 1)) continue
		// Sorted as instants: a time that does not exist on a spring-forward day moves later and can pass another.
		const t = times.map(x => at(day, x)).sort((x, y) => x.getTime() - y.getTime()).find(d => d > after)
		if (t) return t
	}
	throw new Error(`No next time for ${JSON.stringify(s)}`)
}

const clock = (hhmm: string) => at(new Date(2000, 0, 1), hhmm).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function when(s: Schedule): string {
	if (s.every === 'once') return `Once, ${stamp(s.start)}`
	if (s.every === 'hours') return `Every ${s.hours} hour${s.hours === 1 ? '' : 's'} from ${stamp(s.start)}`
	const t = [s.at, ...(s.times ?? [])].sort().map(clock)
	const list = t.length > 1 ? `${t.slice(0, -1).join(', ')} and ${t.at(-1)}` : t[0]
	return s.every === 'day' ? `Every day at ${list}` : s.every === 'weekday' ? `Every weekday at ${list}` : `Every ${DAYS[s.day ?? 1]} at ${list}`
}

const textsOf = (a: Automation) => (a.texts?.length ? a.texts : [a.text])
// The message for the next send: cycle loops, repeat-last stays on the last, once-each ends after the last.
export function textFor(a: Automation): string {
	const ts = textsOf(a)
	return a.rotation === 'cycle' || !a.rotation ? ts[a.count % ts.length] : ts[Math.min(a.count, ts.length - 1)]
}

export function describe(a: Automation): string {
	const end = [a.until && `until ${a.until}`, a.maxSends && `${a.maxSends} time${a.maxSends === 1 ? '' : 's'}`].filter(Boolean).join(', ')
	const ts = textsOf(a)
	const what = ts.length > 1 ? `${ts.length} messages ${a.rotation === 'once-each' ? 'in order, then stop' : a.rotation === 'repeat-last' ? 'in order, then the last one again' : 'in turn'}: ${ts.map(t => `"${t}"`).join(' / ')}` : `"${ts[0]}"`
	return `${a.code} · ${when(a.schedule)}${end ? `, ${end}` : ''}, send ${a.to.name}: ${what}${a.stopOnReply === false ? '' : '. Pauses when they reply'}`
}

export type AutomateInput = { to: string; text?: string; texts?: string[]; rotation?: Rotation; every: Schedule['every']; at?: string; times?: string[]; day?: number; hours?: number; start?: string; until?: string; maxSends?: number; stopOnReply?: boolean; chatId?: string }

// The chat to send to: one the owner already has with that person, or the named group chat. Never a guess between several.
export function findChat(store: Store, to: string): { chatId: string; name: string } | string {
	const want = to.trim().toLowerCase()
	const seen = new Map<string, { chatId: string; name: string; group: boolean }>()
	for (const w of store.workflows()) {
		if (isThread(w.chat.id)) continue
		// A test chat is a real chat, but a "[as Name]" persona in it is no one to send to.
		if (!w.chat.group && w.chat.test && w.asker && isPersona(w.asker.id)) continue
		if (!w.chat.group && w.asker?.name.toLowerCase().includes(want)) seen.set(w.chat.id, { chatId: w.chat.id, name: w.asker.name, group: false })
		if (w.chat.group && w.chat.name.toLowerCase() === want) seen.set(w.chat.id, { chatId: w.chat.id, name: w.chat.name, group: true })
	}
	const hits = [...seen.values()]
	if (hits.length === 1) return { chatId: hits[0].chatId, name: hits[0].name }
	if (!hits.length) return `I can't find a chat with ${to}. Give the chat link, or reply to them once so I know the chat.`
	return `More than one chat matches ${to}: ${hits.map(h => h.name).join(', ')}. Say which one.`
}

// "remind Arun every weekday at 4 pm to update the design doc" arrives here from the AI chat, already split into fields.
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/
// Turns the fields into a schedule, or says which field is wrong. Times are local; start is an ISO time.
export function scheduleOf(i: AutomateInput, now = new Date()): Schedule | string {
	if (i.every === 'once' || i.every === 'hours') {
		const start = i.start ? new Date(i.start) : new Date(now.getTime() + 60_000)
		if (Number.isNaN(start.getTime())) return `"${i.start}" is not a date and time.`
		if (i.every === 'once') return start > now ? { every: 'once', start: start.toISOString() } : 'That time has already passed.'
		if (!i.hours || i.hours < 0.25 || i.hours > 720) return 'Say how many hours apart, from 0.25 to 720.'
		return { every: 'hours', hours: i.hours, start: start.toISOString() }
	}
	const times = [i.at, ...(i.times ?? [])].filter((t): t is string => !!t)
	const bad = times.find(t => !HHMM.test(t))
	if (!times.length || bad) return `"${bad ?? ''}" is not a time. Use 24-hour HH:MM, such as 16:00.`
	const [first, ...rest] = [...new Set(times.map(t => t.padStart(5, '0')))].sort()
	return { every: i.every, at: first, ...(rest.length ? { times: rest } : {}), ...(i.every === 'week' ? { day: i.day ?? 1 } : {}) }
}

export function propose(store: Store, i: AutomateInput): string {
	const texts = (i.texts?.length ? i.texts : [i.text ?? '']).map(t => t.trim()).filter(Boolean)
	if (!texts.length) return 'What should the reminder say?'
	if (i.every === 'hours' && !i.until && !i.maxSends) return 'When should it stop? Say a date, or how many times.'
	if (i.until !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(i.until) || localDay(new Date(`${i.until}T12:00`)) !== i.until)) return `"${i.until}" is not a date. Use YYYY-MM-DD, such as 2026-11-30.`
	const schedule = scheduleOf(i)
	if (typeof schedule === 'string') return schedule
	const first = nextAt(schedule, new Date())
	if (i.until && first && localDay(first) > i.until) return `The first one would be ${localDay(first)}, after the end date ${i.until}.`
	if (i.chatId && isThread(i.chatId)) return 'Reminders go to a person or a group chat, not a channel thread.'
	const to = i.chatId ? { chatId: i.chatId, name: i.to } : findChat(store, i.to)
	if (typeof to === 'string') return to
	const now = new Date().toISOString()
	const a: Automation = { schema: 1, id: ulid(), code: store.nextCode('R'), kind: 'remind', to, text: texts[0], ...(texts.length > 1 ? { texts, rotation: i.rotation ?? 'cycle' } : {}), schedule, until: i.until, maxSends: i.maxSends, stopOnReply: i.stopOnReply ?? true, state: 'proposed', count: 0, createdAt: now, updatedAt: now }
	store.saveAutomation(a)
	return `${describe(a)}. It goes out with your assistant's marker. Say "ok ${a.code}" to start it.`
}

// ok starts it, edit changes the text (it must be started again), pause and resume, skip ends it.
export function answerAutomation(store: Store, a: Automation, ans: Answer): string {
	const now = new Date()
	switch (ans.verb) {
		case 'ok':
			if (a.state === 'active') return `${a.code} is already on. Next: ${new Date(a.next!).toLocaleString()}.`
			if (a.state === 'ended') return `${a.code} has ended.`
			if (ans.seenAt && ans.seenAt < a.updatedAt) return `${a.code} changed after you looked. It now says: ${describe(a)}. Say "ok ${a.code}" to start it.`
			if (!nextAt(a.schedule, now)) return `${a.code}'s time has passed. Change it, or skip ${a.code}.`
			Object.assign(a, { state: 'active', next: nextAt(a.schedule, now)!.toISOString() })
			store.saveAutomation(a)
			return `Started ${a.code}. First one: ${new Date(a.next!).toLocaleString()}. Say "pause ${a.code}" or "skip ${a.code}" any time.`
		case 'edit':
			// The new words replace the whole series: one message from now on.
			Object.assign(a, { text: ans.text!.trim(), texts: undefined, rotation: undefined, state: a.state === 'ended' ? 'ended' : 'proposed', next: undefined })
			store.saveAutomation(a)
			return `${describe(a)}. Say "ok ${a.code}" to start it.`
		case 'pause':
			if (a.state !== 'active') return `${a.code} is not running.`
			Object.assign(a, { state: 'paused', next: undefined })
			store.saveAutomation(a)
			return `Paused ${a.code}. Say "resume ${a.code}" to start it again.`
		case 'resume':
			if (a.state !== 'paused') return `${a.code} is not paused.`
			if (!nextAt(a.schedule, now)) { Object.assign(a, { state: 'ended' }); store.saveAutomation(a); return `${a.code} has no more times to send, so it ended.` }
			Object.assign(a, { state: 'active', next: nextAt(a.schedule, now)!.toISOString(), why: undefined })
			store.saveAutomation(a)
			return `Resumed ${a.code}. Next: ${new Date(a.next!).toLocaleString()}.`
		case 'skip':
			Object.assign(a, { state: 'ended', next: undefined })
			store.saveAutomation(a)
			return `Ended ${a.code}. Nothing more will be sent.`
		case 'more':
			return `${describe(a)}. ${a.state}${a.next ? `, next ${new Date(a.next).toLocaleString()}` : ''}. Sent ${a.count} time${a.count === 1 ? '' : 's'}.`
		default:
			return `${a.code} takes ok, edit, pause, resume, or skip.`
	}
}

// Each due time is handled once. A time skipped by pause or policy moves on without using up a send.
// A real send reserves its count and the hourly ledger before the network call, so a lost confirmation never sends past the limit.
export async function dueAutomations(store: Store, src: Source, cfg: Config, now = new Date()): Promise<number> {
	let n = 0
	// A reply waiting for a decision holds the next send (B4).
	for (const a of store.automations().filter(a => a.state === 'active' && !a.heard && a.next && Date.parse(a.next) <= now.getTime())) {
		const text = textFor(a), raw = withMarker(text, signatureOf(cfg), cfg.owner.name)
		const out = authorize({ automatic: false, text: raw }).text!
		if (replyGap(out)) {
			Object.assign(a, { state: 'paused', next: undefined, why: REPLY_BLANK })
			store.saveAutomation(a)
			store.setHealth(`auto:${a.code}`, `${a.code}: ${REPLY_BLANK}. The automation is paused; nothing was sent.`)
			store.log({ event: 'rule-held-gap', code: a.code, reason: REPLY_BLANK })
			continue
		}
		const due = new Date(a.next!), next = nextAt(a.schedule, now)
		const after = (t?: Date) => !t || (!!a.until && localDay(t) > a.until)
		const end = (why: string) => { Object.assign(a, { state: 'ended', next: undefined, why }); store.saveAutomation(a); store.log({ event: 'automation-ended', code: a.code, why }) }
		if (a.until && localDay(now) > a.until) { end('its end date passed'); continue }
		if (isThread(a.to.chatId)) { end('a channel thread is not a person'); store.setHealth(`auto:${a.code}`, `${a.code} was ended: reminders go to a person or a group chat, never a channel.`); continue }
		// A time missed by more than an hour (the machine was asleep or off) is skipped, never sent late.
		await membersOf(store, src, a.to.chatId, true)
		const auth = freshRead(() => {
			const currentCfg = store.config(), p = { ...DEFAULT_POLICY, ...currentCfg.policy }, cap = hourlyCap(p.maxAutoPerChatHour)
			const members = store.members()[a.to.chatId]
			return authorize({
				automatic: true, text: out, paused: !!currentCfg.paused || store.control().paused || store.control().stopped,
				never: (p.never ?? []).some(x => x.name.toLowerCase() === a.to.name.toLowerCase() || members?.ids.includes(x.id)),
				voteClaim: voteMention(out), guests: members?.guests, outside: !!members?.outside?.length,
				autoSendsThisHour: store.autoLedger().filter(e => e.chat === a.to.chatId && Date.parse(e.at) > now.getTime() - 3_600_000).length,
				maxPerHour: cap, gap: replyGap(out),
			})
		})
		const skip = now.getTime() - due.getTime() > 3_600_000 ? 'too late' : !auth.allowed ? auth.blockedBy === 'paused' ? 'paused' : auth.reason : ''
		if (skip) {
			const unknown = skip !== 'too late' && !auth.allowed && auth.blockedBy === 'sharing' && membershipUnknown(store, a.to.chatId)
			if (unknown) membershipWait(store, a.to.chatId)
			Object.assign(a, { next: after(next) ? undefined : next!.toISOString(), state: after(next) ? 'ended' : 'active' })
			store.saveAutomation(a)
			if (!unknown && skip !== 'paused' && skip !== 'too late') store.setHealth(`auto:${a.code}`, `${a.code} did not send to ${a.to.name}: ${skip}.`)
			store.log({ event: 'automation-skipped', code: a.code, why: skip, ...(!auth.allowed ? { blockedBy: auth.blockedBy } : {}) })
			continue
		}
		const count = a.count + 1
		const spent = count >= (a.maxSends ?? Infinity) || (a.rotation === 'once-each' && count >= textsOf(a).length)
		Object.assign(a, { count, next: spent || after(next) ? undefined : next!.toISOString(), state: spent || after(next) ? 'ended' : 'active', lastAt: now.toISOString() })
		store.saveAutomation(a)
		store.addAuto(a.to.chatId, 'send')
		try {
			const { msgId } = await src.send(a.to.chatId, out)
			store.addSent(msgId, out)
			store.setHealth(`auto:${a.code}`)
			store.log({ event: 'sent', code: a.code, chat: a.to.chatId, asker: { id: '', name: a.to.name }, approvedBy: `automation:${a.code}`, msgId, text: out })
			n++
		} catch (e) {
			store.setHealth(`auto:${a.code}`, `${a.code} may not have reached ${a.to.name}: ${String(e).slice(0, 120)}. It counts as sent, so nothing goes twice.`)
		}
	}
	return n
}
