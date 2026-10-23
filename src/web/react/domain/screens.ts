import { z } from 'zod'

const text = z.string(), strings = z.array(text), optional = text.optional()
const link = z.object({ text, key: optional })
export const settingsSchema = z.object({
	rows: z.array(z.object({
		key: text, label: text, help: text, kind: z.enum(['text', 'line', 'list', 'number', 'choice', 'bool', 'time', 'switch']),
		section: z.enum(['learned', 'you', 'replies', 'timing', 'system']), value: text,
		options: z.array(z.object({ value: text, label: text })).optional(), advanced: z.boolean().optional(),
	})),
	fixed: z.array(z.object({ label: text, value: text, how: text })),
	about: z.object({
		profile: text, rules: z.array(z.object({ text, who: text, learned: optional, held: z.boolean(), code: optional })),
		suggestions: z.array(z.object({ code: text, text, does: text, evidence: text })),
		chats: z.array(z.object({ name: text, says: text, actionIds: strings.optional() })),
	}),
	models: z.object({ set: text, lines: strings }),
})
export const saveResultSchema = z.object({ ok: z.boolean(), text })
const numberRow = z.object({
	code: text, kind: text, sentence: text, who: z.object({ name: text, initials: text, hue: z.number() }), at: text, by: text,
	teams: optional, href: optional, ask: optional, said: optional, gist: optional, work: optional, inTeams: z.boolean().optional(),
})
export const numbersSchema = z.object({
	model: z.object({
		window: z.object({ key: z.enum(['this', 'last', '4w', 'all']), label: text }),
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
	rules: z.record(text, text),
	lists: z.record(text, z.object({ title: text, groups: z.array(z.object({ title: optional, codes: strings, keys: strings.optional() })) })),
	rows: z.record(text, numberRow), missed: z.record(text, z.object({ at: text, teams: optional })),
})
export type Settings = z.infer<typeof settingsSchema>
export type Numbers = z.infer<typeof numbersSchema>
