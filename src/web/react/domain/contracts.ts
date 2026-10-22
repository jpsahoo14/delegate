import { z } from 'zod'

const text = z.string()
const strings = z.array(text)
const optional = text.optional()
const person = z.object({ id: text, name: text, initials: text, hue: z.number() })
const chat = z.object({ id: text, name: text, group: z.boolean(), guests: z.boolean() })
const owner = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('you') }), z.object({ kind: z.literal('delegate') }),
	z.object({ kind: z.literal('nobody') }), z.object({ kind: z.literal('others'), text }),
])
const source = z.object({ id: text, itemId: text, kind: z.enum(['Knowledge', 'In the chat', 'Private']), label: text, href: optional, stale: z.boolean().optional(), locked: z.boolean().optional() })
const why = z.object({ reason: optional, confidence: optional, gaps: strings, searched: strings.optional() })
const change = z.object({
	id: text, itemId: text, rev: text, n: z.number(), summary: text, target: text, system: text, action: text, detail: optional,
	meaning: z.array(z.object({ text, warn: z.boolean().optional() })).optional(),
	error: optional,
	state: z.enum(['proposed', 'approved', 'made', 'uncertain', 'left-out']),
})
const draft = z.object({ id: text, itemId: text, rev: text, text, commitment: z.boolean(), preview: z.boolean(), holding: z.boolean().optional() })
const choice = z.object({ id: optional, label: text, note: optional, reply: optional })
const choices = z.object({ prompt: text, multi: z.boolean().optional(), options: z.array(choice), other: z.boolean().optional() })
const context = z.object({ label: text, text, tone: z.enum(['info', 'warn']).optional() })
const thread = z.object({ who: text, text, at: text, owner: z.boolean() })
const item = z.object({
	id: text, code: text, rev: text, type: text,
	personId: text, chatId: text, at: text, askAt: optional, ask: optional, thread: z.array(thread), newCount: z.number(), earlier: optional, before: optional,
	question: optional, draftId: optional, choices: choices.optional(), picked: z.array(z.number()).optional(), context: z.array(context).optional(),
	meeting: z.object({ subject: text, start: text, minutes: z.number(), attendees: strings }).optional(),
	changeIds: strings, effectIds: strings.optional(), sourceIds: strings, noteIds: strings, todoIds: strings, actionIds: strings, primaryActionId: optional, workId: optional,
	job: optional, why, status: text, attention: optional, openOn: optional, teams: optional, debug: strings.optional(),
	promise: z.object({ said: text, failed: optional }).optional(),
	follow: z.object({ target: text, until: text, everyHours: z.number() }).optional(),
})
const action = z.object({
	id: text, item: text, rev: text, kind: text, label: text,
	effect: z.enum(['local', 'sends', 'changes-system']),
	staleness: z.enum(['exact', 'none']), expect: optional,
	input: optional,
	needsConfirm: z.boolean().optional(), meaning: optional,
	expiresAt: optional,
	selection: z.object({ total: z.number().int().nonnegative(), verb: text, singular: text, plural: text, suffix: text, empty: text, allowEmpty: z.boolean(), exactSingle: optional }).optional(),
})
const work = z.object({
	id: text, itemId: text, goal: text, next: optional, waiting: optional, due: z.boolean(), proposed: z.boolean(), home: optional,
	stepIds: strings, planIds: strings, reportActionId: optional,
	yours: z.object({ what: text, check: z.object({ what: z.enum(['Deploy', 'Build']), at: text, build: z.number() }).optional() }).optional(),
	then: z.object({ owner, what: text, you: optional }).optional(), total: z.number(),
})
const placement = z.object({
	id: text, code: text, act: text, section: text, rule: text, position: z.number(), kind: text, headline: text, subjects: strings,
	personId: optional, rowRev: optional, teams: optional, gist: optional, when: optional, msgs: strings.optional(),
	facts: z.object({
		who: optional, where: optional, at: text, verb: optional,
		quote: z.object({ by: text, verb: text, text }).optional(),
		notes: z.array(z.object({ label: text, text, at: optional, since: optional })).optional(),
		until: optional, also: z.number().optional(), promise: z.object({ to: optional, at: text, why: optional }).optional(),
	}),
	next: z.object({ owner, what: optional, at: optional }).optional(), warn: optional,
	chips: z.array(z.object({ kind: text, text })), fresh: z.object({ changed: optional, back: optional, born: text }).optional(),
	workId: optional, todoIds: strings, actionIds: strings,
})
const done = z.object({
	id: text, code: text, kind: z.enum(['reply', 'review', 'change', 'closed', 'catchup', 'reminder', 'learned']),
	personId: text, sentence: text, at: text, by: text, actionIds: strings, sourceIds: strings, noteIds: strings,
	work: optional, high: z.boolean().optional(), teams: optional, ask: optional, said: optional, text: optional, href: optional,
	inTeams: z.boolean().optional(), gist: optional, watch: z.object({ target: text, until: text }).optional(), watchedAs: optional,
	own: z.boolean().optional(), rule: optional, fresh: z.boolean().optional(), undoUntil: optional, why: why.optional(), msgs: strings.optional(),
})
const watch = z.object({ id: text, code: text, what: text, last: text, changedAt: optional, update: z.boolean(), rev: text, every: z.number().optional(), endsAt: optional, by: optional, nextAt: optional, from: optional, actionIds: strings })
const automation = z.object({ id: text, code: text, sentence: text, to: text, text, when: text, state: text, why: optional, next: optional, count: z.number(), rev: text, actionIds: strings })
const table = <T extends z.ZodType>(schema: T) => z.record(text, schema)
export const entitiesSchema = z.object({
	items: table(item), people: table(person), chats: table(chat), drafts: table(draft), changes: table(change), sources: table(source),
	notes: table(z.object({ id: text, itemId: text, at: text, question: text, answer: optional, sourceIds: strings, useActionId: optional })),
	work: table(work),
	planSteps: table(z.object({ id: text, workId: text, position: z.number(), what: text, owner, done: z.boolean(), now: z.boolean(), where: optional, build: z.union([text, z.number()]).optional() })),
	workSteps: table(z.object({ id: text, workId: text, at: text, what: text, news: z.boolean() })),
	todos: table(z.object({ id: text, itemId: text, code: text, text, at: text, done: z.boolean() })),
	placements: table(placement), actions: table(action), doneEntries: table(done), watches: table(watch), automations: table(automation),
	knowledgeProposals: table(z.object({ id: text, code: text, rev: text, topic: text, home: text, state: optional, factIds: strings, actionIds: strings })),
	facts: table(z.object({ id: text, proposalId: text, type: text, text, who: optional, date: text, href: optional, private: z.boolean() })),
	health: table(z.object({ id: text, text, since: text, actionIds: strings })),
	channels: table(z.object({ id: text, name: text, link: text, actionIds: strings })),
	waiting: table(z.object({ id: text, code: text, to: text, chat: text, text, at: text, link: optional, actionIds: strings })),
})
export const snapshotSchema = z.object({
	schemaVersion: z.literal(1), fetchedAt: text, now: text, since: optional, owner: text,
	entities: entitiesSchema, sections: z.array(z.object({ id: text, label: text, ids: strings, total: z.number().optional() })),
	seen: table(text), status: z.object({
		state: z.enum(['on', 'paused', 'stopped']), autoSend: z.boolean(), runs: z.number(), cap: z.number(),
		reading: z.object({ state: text, machine: optional, at: optional }),
	}),
	summary: z.object({
		off: z.object({ text, since: optional }).optional(), paused: z.boolean().optional(), handled: z.number(),
		minute: z.object({ facts: z.number(), suggestions: z.number() }), catchup: z.object({ count: z.number(), worth: z.number() }),
	}),
	pageActionIds: strings.optional(),
	recipients: z.array(z.object({ id: text, name: text, group: z.boolean() })).optional(),
	reminderDefaults: z.object({ text, every: z.enum(['day', 'weekday', 'week']), at: text }).optional(),
	doneNew: z.number().optional(),
	version: z.object({ code: optional, tag: optional, auto: z.boolean(), channel: text, everyMin: z.number(), checkedAt: optional, failed: optional }).optional(),
	sinceLine: z.object({ at: text, parts: z.array(z.object({ text, href: text })) }).optional(),
	settingsActions: z.record(text, strings).optional(),
	classic: z.object({
		needsIds: strings,
		tiles: z.array(z.object({ key: text, count: z.number(), label: text, sub: optional })),
		also: z.array(z.object({ key: text, count: z.number(), label: text, sub: optional })),
		catchupIds: strings,
		running: z.array(z.object({ code: text, what: text, who: optional, since: text, progress: z.number().optional(), actionIds: strings })),
		progress: z.array(z.object({
			code: text, who: text, chat: text, goal: text, status: text,
			last: z.object({ at: text, what: text }).optional(), next: optional, checkAt: optional,
			every: z.number().optional(), endsAt: optional, rev: text, actionIds: strings,
		})),
		watchActionIds: z.record(text, strings),
		automationActionIds: z.record(text, strings),
		details: z.object({ runner: text, log: strings }).optional(),
	}).optional(),
	search: z.object({ query: text, nowIds: strings, doneIds: strings, link: z.object({ href: text, item: optional }).optional() }).optional(),
})
export const intentSchema = z.object({
	submissionId: z.uuid(), action: text.min(1), item: text, rev: text, expect: optional,
	input: z.object({
		text: text.max(15_000).optional(), picks: z.array(z.number().int().positive()).max(100).optional(),
		excluded: z.array(z.number().int().positive()).max(100).optional(),
		result: z.enum(['Both work', 'Issues found', 'Blocked']).optional(),
		to: text.max(300).optional(), recipientId: text.max(200).optional(),
		every: z.enum(['day', 'weekday', 'week']).optional(), at: text.max(5).optional(), day: z.number().int().min(0).max(6).optional(),
		until: text.max(2000).optional(), by: text.max(10).optional(), push: z.boolean().optional(),
		seenAt: text.max(40).optional(),
	}).strict().optional(),
}).strict()
export const receiptSchema = z.object({
	submissionId: text, item: text, rev: text, ids: strings, accepted: z.boolean(), applied: z.boolean(), text,
	refused: z.boolean().optional(),
	uncertain: z.boolean().optional(),
	at: optional,
})
export type Snapshot = z.infer<typeof snapshotSchema>
export type Entities = z.infer<typeof entitiesSchema>
export type Item = Entities['items'][string]
export type Action = Entities['actions'][string]
export type Placement = Entities['placements'][string]
export type Intent = z.infer<typeof intentSchema>
export type Receipt = z.infer<typeof receiptSchema>
export const revisionKey = (code: string, rev: string) => `${code}@${rev}`
export const emptyEntities = (): Entities => ({
	items: {}, people: {}, chats: {}, drafts: {}, changes: {}, sources: {}, notes: {}, work: {}, planSteps: {}, workSteps: {}, todos: {},
	placements: {}, actions: {}, doneEntries: {}, watches: {}, automations: {}, knowledgeProposals: {}, facts: {}, health: {}, channels: {}, waiting: {},
})
