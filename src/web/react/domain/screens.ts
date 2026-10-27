import { z } from 'zod'

const text = z.string(), strings = z.array(text), optional = text.optional()
const link = z.object({ text, key: optional })
export const settingsSchema = z.object({
	code: z.object({ machine: text, example: text, folders: strings, automatic: z.boolean(), clones: z.array(z.object({ name: text, remote: text, paths: strings })), scannedAt: optional }).optional(),
	rows: z.array(z.object({
		key: text, label: text, help: text, kind: z.enum(['text', 'line', 'list', 'number', 'choice', 'bool', 'time', 'switch']),
		section: z.enum(['learned', 'you', 'replies', 'timing', 'system']), value: text,
		options: z.array(z.object({ value: text, label: text })).optional(), advanced: z.boolean().optional(), group: optional,
	})),
	fixed: z.array(z.object({ label: text, value: text, how: text })),
	about: z.object({
		profile: text, rules: z.array(z.object({ text, who: text, learned: optional, held: z.boolean(), code: optional, style: optional, undoUntil: optional })),
		suggestions: z.array(z.object({ code: text, text, does: text, evidence: text, links: strings.optional() })),
		chats: z.array(z.object({ name: text, says: text, actionIds: strings.optional() })),
	}),
	models: z.object({ set: text, lines: strings }),
	tools: z.object({ servers: z.array(z.object({ name: text, reads: z.number(), on: z.number(), unknown: z.number(), line: optional, none: optional, gone: strings, actionIds: strings.optional() })) }).optional(),
})
export const saveResultSchema = z.object({ ok: z.boolean(), text })
const numberRow = z.object({
	code: text, kind: text, sentence: text, who: z.object({ name: text, initials: text, hue: z.number() }), at: text, by: text,
	teams: optional, href: optional, ask: optional, said: optional, gist: optional, work: optional, inTeams: z.boolean().optional(),
})
const usageCell = z.object({ text, title: optional, unknown: z.literal(true).optional(), muted: z.literal(true).optional() })
// UR1.3/URΔ3: stacked token bars and credit bars, by week or by day.
const usageBar = z.object({ key: text, label: text, value: optional, segs: z.array(z.number()), whole: z.literal(true).optional(), off: optional, since: z.boolean(), alt: text })
const usageBars = z.object({ caption: text, tokens: z.array(usageBar), credits: z.array(usageBar) })
const usageTable = z.object({ columns: z.array(z.object({ text, title: text })), rows: z.array(z.object({ label: text, cells: z.array(usageCell) })), total: z.object({ cells: z.array(usageCell), note: optional }) })
const usageChoice = z.object({ options: z.array(z.object({ value: text, text })), value: optional })
// D-COST (UR1/URΔ): the Today line, the earlier-use line, the window's credits (figure or "not reported", coverage, help) and two tables
// with their own columns: by kind (tokens in · cached · out · runs · re-runs · Credits) and by model (AU3 + Credits · ≈ $). URΔ4: the
// filters' choices and the query that refetches this window with them (GET /api/v1/numbers/usage).
export const usageSchema = z.object({
	state: z.enum(['before', 'after']), note: optional, earlier: optional, today: z.object({ text, atCap: z.boolean() }).optional(),
	headline: optional, coverage: optional, credits: z.object({ text, coverage: optional, help: text }).optional(),
	unreported: z.object({ text, title: text }).optional(),
	bars: z.object({ week: usageBars, day: usageBars.optional() }).optional(),
	kinds: usageTable, models: usageTable,
	query: text, filters: z.object({ model: usageChoice, kind: usageChoice, machine: usageChoice.optional() }),
})
export const numbersSchema = z.object({
	model: z.object({
		window: z.object({ key: z.enum(['this', 'last', '4w', 'all', 'custom']), label: text }),
		handled: z.object({
			main: link, trend: z.object({ text, dir: z.enum(['up', 'down', 'same']).optional() }).optional(),
			kinds: z.array(link), check: link.optional(), all: link.optional(),
		}),
		bars: z.array(z.object({
			week: text, label: text, n: z.number(), height: z.number(), gaps: strings, days: z.array(z.boolean()),
			before: z.boolean(), now: z.boolean(), alt: text, key: optional,
		})),
		gapNote: optional,
		cards: z.array(z.object({ rule: text, title: text, main: link, meter: z.object({ n: z.number(), of: z.number() }).optional(), lines: z.array(z.array(link)), four: link })),
		unknown: link.optional(), corrections: z.array(link), promises: text, summary: text,
	}),
	// CR COST4d B1: today in the owner's zone (the server's day), for the custom-range picker.
	today: text,
	rules: z.record(text, text),
	lists: z.record(text, z.object({ title: text, groups: z.array(z.object({ title: optional, codes: strings, keys: strings.optional() })) })),
	rows: z.record(text, numberRow), missed: z.record(text, z.object({ at: text, teams: optional })),
	usage: usageSchema.optional(),
})
export type Settings = z.infer<typeof settingsSchema>
export type Numbers = z.infer<typeof numbersSchema>
