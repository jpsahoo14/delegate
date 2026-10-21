import type { Config, Rule, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { offRecord } from '../core/levels.ts'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { messageLink } from '../adapters/channels.ts'

// Habits: steady patterns in what the owner does, offered as standing instructions they accept or not (dev-spec/habits.md).
export type Habit = {
	key: string; code: string; kind: 'send'
	text: string; does: string
	evidence: { count: number; days: number; total: number; links: string[] }
	rule: Rule
	state: 'suggested' | 'accepted' | 'snoozed' | 'declined'
	until?: string; at: string; told?: boolean
}
export type Outcome = { how: 'sent' | 'skipped'; chat: string; group: boolean; guests?: boolean; asker?: { id: string; name: string }; intent?: string; edited: boolean; approvedBy?: string; link?: string; at: string }

const DAY = 86_400_000
const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()

// One record per handled item, with whether the owner changed the words, compared as text (review: verb alone lies).
export function outcome(store: Store, wf: Workflow, how: Outcome['how'], o: { draft?: string; sent?: string; approvedBy?: string; msgId?: string } = {}) {
	const edited = how === 'sent' && !!o.draft && !!o.sent && norm(o.draft) !== norm(o.sent)
	const link = o.msgId ? messageLink(wf.chat.id, o.msgId) : undefined
	store.log({ event: 'outcome', how, chat: wf.chat.id, group: !!wf.chat.group, guests: wf.chat.guests, asker: wf.asker, intent: wf.intent, edited, approvedBy: o.approvedBy, ...(link ? { link } : {}) })
}

const covered = (rules: Rule[], asker: string, intent: string) => rules.some(r => r.then === 'send' && r.who.accounts?.some(a => a.id === asker) && (!r.when.intent || r.when.intent === intent) && (!r.when.chat || r.when.chat === 'direct'))

// Once a day at most: the strongest new send habit, kept narrow (one person, one kind of ask, 1:1 chats).
export function noticeHabits(store: Store, cfg: Config, now = Date.now()): Habit | undefined {
	if (cfg.noticeHabits === false) return undefined
	const habits = store.habits()
	if (habits.some(h => h.state === 'suggested' && now - Date.parse(h.at) < DAY)) return undefined
	const never = new Set((cfg.policy?.never ?? []).map(p => p.id))
	const rules = store.rules()
	const all = store.logs(30).filter(e => e.event === 'outcome') as unknown as Outcome[]
	const groups = new Map<string, Outcome[]>()
	for (const o of all) {
		if (!o.asker?.id || !o.intent || o.intent === 'none' || offRecord(cfg, o.chat)) continue
		const k = `${o.asker.id}|${o.intent}`
		groups.set(k, [...(groups.get(k) ?? []), o])
	}
	const found: Habit[] = []
	for (const [k, os] of groups) {
		const [asker, intent] = k.split('|')
		const key = `send:${asker}:${intent}:direct`
		const old = habits.find(h => h.key === key)
		if (old && (old.state !== 'snoozed' || Date.parse(old.until ?? '') > now)) continue
		if (never.has(asker) || covered(rules, asker, intent)) continue
		// Only 1:1 chats without guests, and only items the owner handled.
		if (os.some(o => o.group || o.guests)) continue
		const mine = os.filter(o => o.how === 'skipped' || o.approvedBy === 'owner').sort((a, b) => a.at.localeCompare(b.at))
		const clean = mine.filter(o => o.how === 'sent' && !o.edited)
		const days = new Set(clean.map(o => o.at.slice(0, 10))).size
		if (clean.length < 5 || days < 3 || clean.length / mine.length < 0.9 || mine.slice(-3).some(o => o.how !== 'sent' || o.edited)) continue
		const name = os.at(-1)!.asker!.name, first = name.split(/\s+/)[0]
		const label = intent.replace(/_/g, ' ')
		found.push({
			key, code: '', kind: 'send', state: 'suggested', at: new Date(now).toISOString(),
			text: `You sent your last ${clean.length} replies to ${first} (${label}) without changes. Let those go by themselves?`,
			does: `Replies to ${name} in your 1:1 about ${label} go out by themselves, with the usual checks (private sources, commitments, open work, guests, need to know) and an undo.`,
			evidence: { count: clean.length, days, total: mine.length, links: clean.map(o => o.link).filter((l): l is string => !!l).slice(-5) },
			rule: { id: `learned-${asker.slice(0, 8)}-${intent}`, text: `Learned: replies to ${name} in 1:1 about ${label} go by themselves`, who: { accounts: [{ id: asker, name }] }, when: { chat: 'direct', intent }, then: 'send' },
		})
	}
	const best = found.sort((a, b) => b.evidence.count - a.evidence.count)[0]
	if (!best) return undefined
	best.code = store.nextCode('H')
	store.saveHabits([...habits.filter(h => h.key !== best.key), best])
	store.log({ event: 'habit-suggested', code: best.code, key: best.key, evidence: best.evidence })
	return best
}

// ok turns a suggestion on; skip is "not now" (14 days); never drops it, or removes the rule it made.
export function answerHabit(store: Store, h: Habit, verb: string): string {
	const now = new Date()
	const save = (x: Partial<Habit>) => store.saveHabits(store.habits().map(y => (y.key === h.key ? { ...y, ...x } : y)))
	if (verb === 'more') return `${h.code} · ${h.text}\n${h.does}\nEvidence: ${h.evidence.count} unedited replies on ${h.evidence.days} days, out of ${h.evidence.total}.${h.evidence.links.length ? `\n${h.evidence.links.map(l => `- ${l}`).join('\n')}` : ''}`
	if (verb === 'ok') {
		if (h.state === 'accepted') return `${h.code} is already on.`
		setRules(store, [...store.rules().filter(r => r.id !== h.rule.id), { ...h.rule, learned: { key: h.key, at: now.toISOString(), evidence: `${h.evidence.count} unedited replies on ${h.evidence.days} days` } }])
		save({ state: 'accepted', at: now.toISOString() })
		store.log({ event: 'habit-accepted', code: h.code, key: h.key })
		return `${h.code} is on: ${h.does} Say "never ${h.code}" to turn it off.`
	}
	if (verb === 'skip') { save({ state: 'snoozed', until: new Date(now.getTime() + 14 * DAY).toISOString() }); return `Not now. ${h.code} stays away for 14 days.` }
	if (verb === 'never') {
		const had = store.rules().some(r => r.id === h.rule.id)
		if (had) setRules(store, store.rules().filter(r => r.id !== h.rule.id))
		save({ state: 'declined' })
		store.log({ event: 'habit-declined', code: h.code, key: h.key, removed: had })
		return had ? `${h.code} is off; that rule is removed.` : `${h.code} will not be suggested again.`
	}
	return `${h.code} takes ok, skip (not now), never, or more.`
}

// The compiled rules decide; rules.md gets a generated block for learned rules, rebuilt from them, so the two never drift.
const BEGIN = '<!-- learned rules: generated, do not edit -->', END = '<!-- end learned rules -->'
export function setRules(store: Store, rules: Rule[]) {
	const file = join(store.root, 'rules.compiled.json')
	const cur = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { schema: 1 }
	writeFileSync(file, JSON.stringify({ ...cur, rules }, null, '\t') + '\n')
	const md = join(store.root, 'rules.md')
	const text = existsSync(md) ? readFileSync(md, 'utf8') : ''
	const own = text.replace(new RegExp(`\\n*${BEGIN}[\\s\\S]*?${END}\\n*`), '\n').trimEnd()
	const learned = rules.filter(r => r.learned).map(r => `- ${r.text.replace(/^Learned: /, '')} (learned ${r.learned!.at.slice(0, 10)} from ${r.learned!.evidence})`)
	writeFileSync(md, `${own}${learned.length ? `\n\n${BEGIN}\n## Learned\n\n${learned.join('\n')}\n${END}` : ''}\n`.replace(/^\n+/, ''))
}
