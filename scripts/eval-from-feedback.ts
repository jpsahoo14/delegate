// Turn the owner's corrections in the feedback log into eval cases, so every fix is measured against what really went wrong (B17).
// Usage: node scripts/eval-from-feedback.ts <storage folder> <cases.json>
// Existing cases in <cases.json> are kept as they are, so labels the owner fixed by hand are never overwritten.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from '../src/store/state.ts'
import { isThread, threadLink } from '../src/adapters/channels.ts'
import type { Case, Outcome } from './eval.ts'
import { createHash } from 'node:crypto'
import { sendContext, sendRecord } from '../src/store/send-context.ts'
import { htmlToText } from '../src/core/intake.ts'

type Lesson = ReturnType<Store['lessons']>[number]
type Detail = { draft?: string; sent?: string; ask?: string; note?: string; kind?: string; chat?: string; msgId?: string; sentId?: string; askMsgId?: string; askAt?: string; text?: string; why?: string }

const COMMON = new Set('about after again also because been before being could does doing done from have here into just like make more most much need only other over same should some still than that their them then there these they this those through under until very want were what when where which while will with would your yours yes thanks thank please okay'.split(' '))
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The words the owner added that the draft lacked: numbers and IDs first, then names, then longer words. At most three.
export function addedFacts(draft: string, sent: string): string[] {
	const words = (s: string) => htmlToText(s).match(/[\p{L}\p{N}](?:[\p{L}\p{N}._/-]*[\p{L}\p{N}])?/gu) ?? []
	const had = new Set(words(draft).map(w => w.toLowerCase()))
	const fresh = [...new Set(words(sent))].filter(w => !had.has(w.toLowerCase()) && !COMMON.has(w.toLowerCase()) && (w.length >= 4 || (/\d/.test(w) && w.length >= 2)))
	const rank = (w: string) => (/\d/.test(w) ? 0 : /^[A-Z]/.test(w) ? 1 : 2) * 100 - w.length
	return fresh.sort((a, b) => rank(a) - rank(b)).slice(0, 3).map(esc)
}

const linkOf = (chatId: string, msgId: string) => (isThread(chatId) ? threadLink(chatId, msgId) : `https://teams.microsoft.com/l/message/${encodeURIComponent(chatId)}/${msgId}`)

export function casesFrom(store: Store): Case[] {
	const out: Case[] = []
	const lessons = store.lessons().filter((l: Lesson) => l.kind === 'correction' || l.event === 'missed')
	const logs = lessons.length ? store.logs(Math.max(1, Math.ceil((Date.now() - Date.parse(lessons[0].at)) / 86_400_000) + 2)).filter(e => e.event === 'sent').flatMap(e => { const record = sendRecord(e); return record ? [record] : [] }) : []
	for (const l of lessons) {
		const d = (l.detail ?? {}) as Detail
		const identity = createHash('sha256').update(JSON.stringify([l.at, l.machine, l.event, l.code, d.msgId, d.sentId, d.chat, d.draft, d.sent, d.ask, d.note])).digest('hex').slice(0, 16)
		const id = `F-${l.code ?? d.msgId}-${l.at.slice(0, 10)}-${identity}`
		if (l.event === 'missed' && d.chat && d.msgId) {
			out.push({ id, link: linkOf(d.chat, d.msgId), expect: { accept: ['reply', 'ask', 'job'] as Outcome[], note: htmlToText(`Missed: ${l.what} ${d.note ? `Owner: ${d.note}` : ''}`) } })
			continue
		}
		if (!['sent', 'skipped', 'marked'].includes(l.event)) continue
		const wf = l.code ? store.byCode(l.code) : undefined
		if (!wf) { console.warn(`Skipped ${id}: its original item is unavailable.`); continue }
		const sentId = l.event === 'marked' ? d.sentId : d.msgId
		const matches = logs.filter(e => e.code === l.code && (!d.chat || e.chat === d.chat) && (sentId ? e.msgId === sentId : !!d.sent && e.text === d.sent && e.at <= l.at)).sort((a, b) => b.at.localeCompare(a.at))
		const sent = matches[0]
		if (!sentId && sent && matches.some(e => e !== sent && e.at === sent.at && e.msgId !== sent.msgId)) { console.warn(`Skipped ${id}: original send is ambiguous.`); continue }
		const thread = store.thread(wf.id)
		const skippedAsk = l.event === 'skipped' ? thread.filter(m => !m.byOwner && m.at <= l.at && d.ask && m.text === d.ask).at(-1) : undefined
		const context = sendContext(sent ? { ...sent, askMsgId: sent.askMsgId ?? d.askMsgId, askAt: sent.askAt ?? d.askAt } : { at: l.at, chat: d.chat, askMsgId: skippedAsk?.id ?? d.askMsgId, askAt: d.askAt }, sent || skippedAsk || d.askMsgId || d.askAt ? thread : [])
		if (!context.chat || !context.askMsgId) { console.warn(`Skipped ${id}: original inbound evidence is unavailable.`); continue }
		const link = linkOf(context.chat, context.askMsgId)
		if (l.event === 'sent' && d.draft && d.sent) out.push({ id, link, expect: { accept: ['reply', 'ask'], facts: addedFacts(d.draft, d.sent), note: htmlToText(`The owner sent: "${d.sent}". The draft was: "${d.draft}".`) } })
		else if (l.event === 'skipped') {
			// A skip followed by the owner's own message in the chat means a reply was wanted, just not that one.
			const own = store.thread(wf.id).filter(m => m.byOwner && m.at > l.at).at(0)
			out.push({ id, link, expect: own ? { accept: ['reply', 'ask'], facts: addedFacts(d.draft ?? '', own.text), note: htmlToText(`Skipped, then the owner wrote: "${own.text}".`) } : { accept: ['ignore', 'not-addressed'] as Outcome[], note: htmlToText(`The owner skipped: "${d.draft ?? ''}". Change accept if a reply was wanted.`) } })
		} else if (l.event === 'marked') out.push({ id, link, expect: { accept: ['reply', 'ask'], note: htmlToText(`Sent "${d.sent ?? ''}", marked ${d.kind}${d.note ? `: ${d.note}` : ''}.`) } })
	}
	return out
}

export function merge(file: string, fresh: Case[]): { added: string[]; kept: number } {
	const previous: Case[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
	// Migrate old colliding ids only when the recorded case identifies its event.
	const have = previous.map(old => {
		const exact = fresh.find(c => c.id === old.id)
		const candidates = fresh.filter(c => c.id.startsWith(`${old.id}-`) && (!!c.expect?.note && c.expect.note === old.expect?.note || c.link === old.link))
		const matched = exact ?? (candidates.length === 1 ? candidates[0] : undefined)
		return matched ? { ...old, id: matched.id, link: matched.link } : old
	})
	const ids = new Set(have.map(c => c.id)), added = fresh.filter(c => { if (ids.has(c.id)) return false; ids.add(c.id); return true })
	writeFileSync(file, JSON.stringify([...have, ...added], null, '\t') + '\n')
	return { added: added.map(c => c.id), kept: have.length }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const [root, file] = process.argv.slice(2)
	if (!root || !file) { console.error('Usage: node scripts/eval-from-feedback.ts <storage folder> <cases.json>'); process.exit(2) }
	const r = merge(file, casesFrom(new Store({ root: join(root), machine: 'eval' })))
	console.log(`${r.added.length} new case(s)${r.added.length ? `: ${r.added.join(', ')}` : ''}; ${r.kept} kept as they were.`)
}
