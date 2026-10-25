import { CONTROL_VERBS, type Verb } from './types.ts'

const CONTROL = new Set<string>(CONTROL_VERBS)
// Verbs whose text is the owner's own words, kept whole with every comma (review react-spec P0-1).
const WORDS = new Set<string>(['send', 'edit', 'answer', 'ask', 'wrong', 'incomplete'])

export type Parsed = { code?: string; verb: Verb; text?: string; nums?: number[]; except?: number[]; again?: true }

const WATCH = /^watch(?:\s+([A-Z]\d+))?(?:\s*:\s*([\s\S]*)|((?:\s+(?:by\s+\d{4}-\d{2}-\d{2}|push))*))$/i

export type WatchSpec = { target?: string; until?: string; by?: string; push: boolean }

// The body of a watch command: "<target> until <until>", then " by YYYY-MM-DD" and " push" at the end, in either order.
export function parseWatch(body?: string): WatchSpec {
	let rest = (body ?? '').trim(), by: string | undefined, push = false
	for (let m: RegExpMatchArray | null; (m = rest.match(/(?:^|\s+)(?:by\s+(\d{4}-\d{2}-\d{2})|(push))$/i));) {
		if (m[1]) { if (by) break; by = m[1] } else { if (push) break; push = true }
		rest = rest.slice(0, m.index).trim()
	}
	// The page quotes what the owner typed, so their own "until", "by", or "push" stays text.
	const q = rest.match(/^"([\s\S]*)"\s+until\s+"([\s\S]*)"$/i) ?? rest.match(/^"([\s\S]*)"(?:\s+until\s+([\s\S]+))?$/i)
	if (q) return { target: q[1].trim() || undefined, until: q[2]?.trim() || undefined, by, push }
	const u = rest.match(/^(?:([\s\S]*?)\s+)?until\s+(?!.*\suntil\s)([\s\S]+)$/i)
	const target = (u ? u[1] : rest)?.trim() || undefined
	return { target, until: u?.[2].trim() || undefined, by, push }
}

const PART = /^(?:(mine|ok|edit|send|later|dismiss|answer|skip|more|undo|continue|pick|ask|wrong|incomplete|unneeded|unwatch|every|extend|close|wait|never|nudge|pause|resume|stop)\b\s*)?([A-Z]\d+(?:-[A-Z]?\d+)?)?((?:\s+#?\d+\s*,?)*)\s*(?::\s*([\s\S]*))?$/i

// "pick A3 2" (choose option 2) | "ask A7: question" (ask Delegate, nothing is sent) | "ok A6 #1 #3" (make only those changes).
// "every A12: 2h" (how often a watch checks) | "extend A12" (7 more days).
// "close A14: why" (the work is finished) | "wait A14: 3d" (open work: ask again later).
// "never H1" (a habit suggestion: never suggest it, or turn off the rule it made).
// "wrong A7: what it should have said" | "incomplete A7: what was missing" | "unneeded A7" (a sent reply was not right).
// "mine A41": an FYI that needs the owner after all (design-spec/catch-up.md).
// "ok A7" | "edit A7: text" (change the draft) | "send A7: text" (send these words) | "A7: text" (answer) | "skip A7" | "later A7" | "more A7" | "ok" | "ok A2-A4".
// Several parts are joined by commas: "ok A7, skip A8, A9: tell him Monday".
export function parseVerbs(input: string): Parsed[] | null {
	const left = input.trim().match(/^(left-ask-again|left-draft-invite)\s+([A-Z]\d+)\s*:\s*(left-[a-f0-9]{16})$/i)
	if (left) return [{ verb: left[1].toLowerCase() as Verb, code: left[2].toUpperCase(), text: left[3].toLowerCase() }]
	// "watch A41", "watch A41: <target> until <until> by YYYY-MM-DD push", "watch: <text> by YYYY-MM-DD push": one command, commas belong to the text.
	if (/^watch\b/i.test(input.trim())) {
		const w = input.trim().match(WATCH)
		if (!w || (!w[1] && !w[2]?.trim())) return null
		const body = (w[2] ?? w[3])?.trim() || undefined
		return [{ verb: 'watch', ...(w[1] ? { code: w[1].toUpperCase() } : {}), ...(body ? { text: body } : {}) }]
	}
	const auto = input.trim().match(/^auto\s+(on|off)$/i)
	if (auto) return [{ verb: auto[1].toLowerCase() === 'on' ? 'auto-on' : 'auto-off' }]
	const segs = input.trim().split(',')
	const parts: string[] = []
	// Once a command takes the owner's words, every comma after it is part of them: "send A7: Yes, ok" sends "Yes, ok",
	// and never a second command (review react-spec P0-1).
	// Only verbs that carry the owner's own words; "every A5: 4h" or "wait A2: 3d" carry a short value, and commands after them still batch.
	const takesText = (p: string) => !!parsePart(p.trim())?.some(x => x.text !== undefined && WORDS.has(x.verb))
	for (const seg of segs) {
		const t = seg.trim()
		if (parts.length && (takesText(parts[parts.length - 1]) || !parsePart(t))) parts[parts.length - 1] += `,${seg}`
		else parts.push(t)
	}
	const out: Parsed[] = []
	for (const p of parts) {
		const r = parsePart(p.trim())
		if (!r) return null
		out.push(...r)
	}
	return out.length ? out : null
}

function parsePart(part: string): Parsed[] | null {
	// "ok A17 except 2": every proposed change or fact but those (design-spec/interactions.md).
	const ex = part.match(/^ok\s+([AK]\d+)\s+except\s+((?:#?\d+[\s,]*)+)$/i)
	if (ex) return [{ code: ex[1].toUpperCase(), verb: 'ok', except: ex[2].match(/\d+/g)!.map(Number) }]
	// "ok A1 again": the owner checked that a change which may have been made was not; make it once more (review 10-21 P2-7).
	const again = part.match(/^ok\s+(A\d+)\s+again$/i)
	if (again) return [{ code: again[1].toUpperCase(), verb: 'ok', again: true }]
	const m = part.match(PART)
	if (!m) return null
	const [, v, codes, numbers, text] = m
	if (!v && !codes) return null
	const nums = numbers?.match(/\d+/g)?.map(Number)
	// "dismiss" is a plainer word for skip (persona test).
	// "dismiss" is a plainer word for skip (persona test); "nudge W1" is ok on a follow-up.
	const verb = ({ dismiss: 'skip', nudge: 'ok' } as Record<string, string>)[v?.toLowerCase() ?? ''] as Verb ?? (v?.toLowerCase() ?? 'answer') as Verb
	const body = text?.trim() || undefined
	if ((verb === 'edit' || verb === 'send' || verb === 'answer' || verb === 'ask' || verb === 'every') && !body) return null
	// "pick A3 2", "pick A3: 1, 3", "ok A6 #1 #3": numbers only on these two verbs (design-spec S3, S6).
	const picked = nums ?? (verb === 'pick' && body && /^[\d\s,#]+$/.test(body) ? body.match(/\d+/g)!.map(Number) : undefined)
	if (picked && verb !== 'pick' && verb !== 'ok') return null
	if (verb === 'pick' && !picked?.length) return null
	if (!codes) return (verb === 'ok' || CONTROL.has(verb)) && !body && !picked ? [{ verb }] : null
	// pause and resume take a code only for an automation: "pause R1".
	if (CONTROL.has(verb) && !((verb === 'pause' || verb === 'resume') && /^R\d+$/i.test(codes))) return null
	const list = expand(codes)
	if (picked && list?.length !== 1) return null
	return list ? list.map(code => ({ code, verb, text: verb === 'pick' ? undefined : body, ...(picked ? { nums: picked } : {}) })) : null
}

// A range stays in one kind and stays short: "ok A1-K3" or "ok A1-A900" is refused, never guessed (final review P1-6).
function expand(codes: string): string[] | null {
	const r = codes.match(/^([A-Z])(\d+)-([A-Z])?(\d+)$/i)
	if (!r) return [codes.toUpperCase()]
	const p = r[1].toUpperCase()
	if (r[3] && r[3].toUpperCase() !== p) return null
	const [a, b] = [Number(r[2]), Number(r[4])].sort((x, y) => x - y)
	if (b - a >= 20) return null
	return Array.from({ length: b - a + 1 }, (_, i) => `${p}${a + i}`)
}
