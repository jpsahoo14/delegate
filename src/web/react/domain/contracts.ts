import { z } from 'zod'

export const text = z.string()
// An image in a message reaches the page as this token (L3c); the bubble draws it as a chip that opens the message in Teams.
export const IMAGE_TOKEN = '🖼 Image'
const strings = z.array(text)
const optional = text.optional()
const person = z.object({ id: text, name: text, initials: text, hue: z.number(), first: optional })
// A120 / PM A R36: an untitled group chat's words, made on the server (model/place.ts); the page shows them as they are.
const chat = z.object({ id: text, name: text, group: z.boolean(), guests: z.boolean(), place: z.object({ head: text, row: text, sentence: text, title: optional }).optional() })
const owner = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('you') }), z.object({ kind: z.literal('delegate') }),
	z.object({ kind: z.literal('nobody') }), z.object({ kind: z.literal('others'), text }),
])
const source = z.object({ id: text, itemId: text, kind: z.enum(['Knowledge', 'In the chat', 'Private', 'Record']), label: text, href: optional, stale: z.boolean().optional(), locked: z.boolean().optional() })
const why = z.object({ reason: optional, confidence: optional, gaps: strings, searched: strings.optional(), waited: optional })
const change = z.object({
	id: text, itemId: text, rev: text, n: z.number(), summary: text, target: text, system: text, action: text, detail: optional,
	meaning: z.array(z.object({ text, warn: z.boolean().optional() })).optional(),
	error: optional,
	state: z.enum(['proposed', 'approved', 'made', 'uncertain', 'left-out']),
})
const draft = z.object({ id: text, itemId: text, rev: text, text, sendText: optional, marker: optional, commitment: z.boolean(), preview: z.boolean(), holding: z.boolean().optional() })
const choice = z.object({ id: optional, label: text, note: optional, reply: optional })
const choices = z.object({ prompt: text, multi: z.boolean().optional(), options: z.array(choice), other: z.boolean().optional(), group: z.boolean().optional() })
const context = z.object({ label: text, text, tone: z.enum(['info', 'warn']).optional() })
const thread = z.object({ who: text, text, at: text, owner: z.boolean() })
// A "Left for you" line from wf.left (Left-for-you contract, 0.2.46), worded on the server: what he does, its quote, where it came from,
// Why? (refusals) and the one page-only button of its kind.
const leftLine = z.object({
	id: text, type: z.enum(['refusal', 'promise']), text, quote: z.object({ text, by: z.enum(['asker', 'owner', 'delegate']) }).optional(),
	source: z.object({ text, href: optional }), why: optional, seen: z.object({ pr: z.number() }).optional(),
	button: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('copy-reply'), text, href: text }), z.object({ kind: z.literal('settings'), key: text }), z.object({ kind: z.literal('open-pr'), href: text }),
		z.object({ kind: z.literal('action'), actionId: text }),
	]).optional(),
})
const item = z.object({
	id: text, code: text, rev: text, type: text,
	personId: text, chatId: text, at: text, askAt: optional, ask: optional, thread: z.array(thread), newCount: z.number(), earlier: optional, before: optional,
	question: optional, answerChips: z.array(z.object({ label: text, text })).optional(), draftId: optional, choices: choices.optional(), picked: z.array(z.number()).optional(), context: z.array(context).optional(),
	meeting: z.object({ subject: text, start: text, minutes: z.number(), attendees: strings }).optional(),
	changeIds: strings, effectIds: strings.optional(), sourceIds: strings, noteIds: strings, todoIds: strings, actionIds: strings, primaryActionId: optional, workId: optional,
	job: optional, why, status: text, attention: optional, attentionKind: z.enum(['reply-changed', 'run-failed', 'agent-setup', 'reason']).optional(), voteGap: z.object({ text, held: z.boolean(), quote: optional }).optional(), returned: z.object({ machine: text, at: text, report: z.boolean() }).optional(),
	prReview: z.object({ pr: z.number(), voteRecommended: z.boolean(), findings: z.array(z.object({ text, file: optional, line: z.number().optional(), thread: z.object({ author: text, at: text, url: optional }).optional(), posts: z.boolean().optional(), changeId: optional })) }).optional(), mode: optional, editor: z.enum(['reply', 'answer', 'none']).optional(), block3: z.enum(['when-you-send', 'none']).optional(), openOn: optional, teams: optional, debug: strings.optional(),
	promise: z.object({ said: text, failed: optional }).optional(), todos: strings.optional(), leftLines: z.array(leftLine).optional(), repaired: z.boolean().optional(),
	// R10b: a review posted under his rule that waits for his approval (SEND's reviewDone, from receipts).
	reviewDone: z.object({ pr: z.number(), reviewedAt: text, counts: z.object({ high: z.number(), medium: z.number(), low: z.number() }),
		posted: z.array(z.object({ severity: z.enum(['High', 'Medium', 'Low']), file: optional, line: z.number().optional(), text, thread: optional })), more: z.number(),
		to: text, reply: z.object({ text, teams: optional }).optional(), clean: z.boolean().optional(), fallback: optional, prUrl: optional,
		openPr: z.enum(['primary', 'secondary']).optional(), voteChangeIds: strings.optional(), closed: z.boolean().optional() }).optional(),
	runFailed: z.object({ at: text, line: optional, why: text, tried: strings.optional(), review: optional, toolsOff: z.boolean().optional() }).optional(), prLabel: optional,
	ownReply: z.object({ text, at: text, teams: optional }).optional(), unsent: optional,
	follow: z.object({ target: text, until: text, everyHours: z.number() }).optional(),
	// Delegate is working on it (#48): what it is doing, in plain words, and since when.
	// #48b: a redraft or a retry; his answer and the draft a redraft replaces.
	working: z.object({ doing: text, since: optional, kind: z.enum(['redraft', 'retry']).optional(), answer: z.object({ text, at: optional }).optional(), previous: optional }).optional(),
})
const action = z.object({
	id: text, item: text, rev: text, kind: text, label: text,
	effect: z.enum(['local', 'sends', 'changes-system']),
	staleness: z.enum(['exact', 'none']), expect: optional,
	todoIds: strings.optional(),
	recovery: z.boolean().optional(),
	input: optional,
	needsConfirm: z.boolean().optional(), meaning: optional,
	// F1 (PE decision 47): Send anyway past a hold carries the held digest THIS card showed; the intent sends it back as reviewed.
	reviewed: optional,
	expiresAt: optional,
	unavailable: z.object({ label: text, reason: text }).optional(),
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
	next: z.object({ owner, what: optional, at: optional }).optional(), nextText: optional, warn: optional,
	chips: z.array(z.object({ kind: text, text })), fresh: z.object({ changed: optional, back: optional, born: text }).optional(),
	workId: optional, todoIds: strings, actionIds: strings,
})
const done = z.object({
	id: text, code: text, kind: z.enum(['reply', 'review', 'change', 'closed', 'catchup', 'reminder', 'learned']),
	personId: text, sentence: text, at: text, by: text, actionIds: strings, sourceIds: strings, noteIds: strings,
	work: optional, high: z.boolean().optional(), teams: optional, ask: optional, said: optional, text: optional, href: optional,
	inTeams: z.boolean().optional(), gist: optional, watch: z.object({ target: text, until: text }).optional(), watchedAs: optional,
	own: z.boolean().optional(), rule: optional, fresh: z.boolean().optional(), undoUntil: optional, why: why.optional(), msgs: strings.optional(),
	// What Delegate checked before this reply went (#45 sent.checks), as history lines: "Sent. Kim posted again at 8:52 AM; …".
	checks: strings.optional(),
})
const watch = z.object({ id: text, code: text, what: text, last: text, changedAt: optional, update: z.boolean(), rev: text, every: z.number().optional(), endsAt: optional, by: optional, nextAt: optional, from: optional, actionIds: strings })
const automation = z.object({ id: text, code: text, sentence: text, to: text, text, when: text, state: text, why: optional, next: optional, count: z.number(), rev: text, actionIds: strings })
const table = <T extends z.ZodType>(schema: T) => z.record(text, schema)
// R12b: one line of Settings › Your way of working and one suggestion, as SEND's core/ways.ts types them.
const readBack = z.tuple([text, text, text])
const wayLine = z.object({
	id: text, text, textHash: text, source: z.enum(['owner', 'learned', 'setting']), group: z.enum(['needs-him', 'doing', 'off']),
	status: z.enum(['reading', 'doing', 'waiting', 'off', 'limited', 'partly', 'cant-yet', 'unclear', 'conflict']), readBack,
	readBackLabel: text, readBackValue: text, statusText: text, redirect: z.literal(true).optional(), ruleIds: strings.optional(),
	notYet: z.array(z.object({ clause: text, untilThen: text })).optional(), limited: strings.optional(), question: optional, setting: optional,
	confirmedAt: optional, usedThisWeek: z.number(), conflictWith: strings.optional(),
})
const waySuggestion = z.object({ id: text, text, textHash: text, readBack, evidence: text, links: strings.optional() })
export const entitiesSchema = z.object({
	items: table(item), people: table(person), chats: table(chat), drafts: table(draft), changes: table(change), sources: table(source),
	notes: table(z.object({ id: text, itemId: text, at: text, question: text, answer: optional, sourceIds: strings, useActionId: optional })),
	work: table(work),
	planSteps: table(z.object({ id: text, workId: text, position: z.number(), what: text, owner, done: z.boolean(), now: z.boolean(), where: optional, build: z.union([text, z.number()]).optional() })),
	workSteps: table(z.object({ id: text, workId: text, at: text, what: text, news: z.boolean() })),
	// from: the reply that left it (to whom, where, when, and that message in Teams); why: the reason a change Delegate couldn't make.
	todos: table(z.object({ id: text, itemId: text, code: text, text, at: text, done: z.boolean(), why: optional, from: z.object({ at: text, who: optional, chat: optional, teams: optional }).optional() })),
	placements: table(placement), actions: table(action), doneEntries: table(done), watches: table(watch), automations: table(automation),
	knowledgeProposals: table(z.object({ id: text, code: text, rev: text, topic: text, home: text, state: optional, factIds: strings, actionIds: strings })),
	facts: table(z.object({ id: text, proposalId: text, type: text, text, who: optional, date: text, href: optional, private: z.boolean(), replaces: optional })),
	health: table(z.object({ id: text, text, since: text, actionIds: strings })),
	channels: table(z.object({ id: text, name: text, link: text, actionIds: strings })),
	waiting: table(z.object({ id: text, code: text, to: text, chat: text, text, at: text, link: optional, actionIds: strings })),
})
export const snapshotSchema = z.object({
	schemaVersion: z.literal(1), fetchedAt: text, now: text, since: optional, owner: text,
	entities: entitiesSchema, sections: z.array(z.object({ id: text, label: text, ids: strings, total: z.number().optional() })),
	seen: table(text), status: z.object({
		state: z.enum(['on', 'paused', 'stopped']), autoSend: z.boolean(), runs: z.number(), cap: z.number(),
		reading: z.object({ state: text, machine: optional, at: optional, here: optional, next: optional }),
	}),
	summary: z.object({
		off: z.object({ text, since: optional }).optional(), paused: z.boolean().optional(), handled: z.number(),
		minute: z.object({ facts: z.number(), suggestions: z.number() }), catchup: z.object({ count: z.number(), worth: z.number() }),
	}),
	pageActionIds: strings.optional(),
	recipients: z.array(z.object({ id: text, name: text, group: z.boolean() })).optional(),
	recipientsNote: optional,
	reminderDefaults: z.object({ text, every: z.enum(['day', 'weekday', 'week']), at: text }).optional(),
	doneNew: z.number().optional(),
	showExperienceNote: z.boolean().optional(),
	running: z.array(z.object({ what: text, since: text, progress: z.number().optional() })).optional(),
	// R11(1): what Delegate is on: working now (runs actually going), queued, how many at a time, and why the rest wait.
	busy: z.object({ now: z.number(), queued: z.number(), max: z.number(), scheduled: z.object({ n: z.number(), at: text, to: optional }).optional(), reason: z.object({ kind: z.enum(['ai', 'paused', 'off', 'slots']), at: optional, text: optional }).optional() }).optional(),
	version: z.object({ version: optional, code: optional, fullCode: optional, tag: optional, auto: z.boolean(), channel: text, everyMin: z.number(), checkedAt: optional, failed: optional, last: z.object({ to: text, rolledBack: optional }).optional() }).optional(),
	sinceLine: z.object({ at: text, parts: z.array(z.object({ text, href: text })) }).optional(),
	settingsActions: z.record(text, strings).optional(),
	// R12b (PE A R28): Settings › Your way of working, exactly as SEND's ways.ts returns it (the page computes no status, grouping or
	// read-back); limits from limitsCard(cfg); needsHim is the Settings nav count, toCheck SEND's linesToCheck. Absent while the engine says "not yet".
	ways: z.object({
		lines: z.array(wayLine), open: waySuggestion.optional(),
		turnedDown: z.array(z.object({ suggestion: waySuggestion, at: text, how: z.enum(['not-now', 'never']) })),
		limits: z.array(z.object({ id: text, page: text })), needsHim: z.number(), toCheck: z.number(), suggestionsReady: z.boolean().optional(), failed: z.boolean().optional(),
		// PE S3 (b): his old prose paragraphs, verbatim, as notes (no grants); review marks the PR-review paragraph's note.
		notes: z.array(z.object({ id: text, text, textHash: text, review: z.literal(true).optional() })).optional(),
	}).optional(),
	// The one reply the u key undoes: the newest send that can still be undone, by time, never by object order (bug 10-23 E97).
	lastUndoId: optional,
	classic: z.object({
		needsIds: strings,
		tiles: z.array(z.object({ key: text, count: z.number(), label: text, sub: optional })),
		also: z.array(z.object({ key: text, count: z.number(), label: text, sub: optional })),
		catchupIds: strings,
		running: z.array(z.object({ code: text, what: text, who: optional, since: text, sendAt: optional, progress: z.number().optional(), detail: optional, retry: z.object({ at: text, attempt: z.number(), reason: text, tried: strings }).optional(), queued: z.boolean().optional(), actionIds: strings })),
		progress: z.array(z.object({
			code: text, who: text, chat: text, goal: text, status: text,
			last: z.object({ at: text, what: text }).optional(), next: optional, checkAt: optional,
			every: z.number().optional(), endsAt: optional, rev: text, actionIds: strings,
		})),
		watchActionIds: z.record(text, strings),
		workActionIds: z.record(text, strings).optional(),
		automationActionIds: z.record(text, strings),
		watchBy: z.array(z.object({ label: text, date: text })).optional(),
		details: z.object({ runner: text, log: strings }).optional(),
	}).optional(),
	search: z.object({ query: text, nowIds: strings, doneIds: strings, link: z.object({ href: text, item: optional }).optional() }).optional(),
})
export const intentSchema = z.object({
	submissionId: z.uuid(), action: text.min(1), item: text, rev: text, expect: optional,
	// F1 (PE decision 47): the hold the owner consented to, exactly as his card showed it; the server never substitutes the current one.
	reviewed: text.max(200).regex(/^[\w:.-]+$/).optional(),
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
	// What the click came to, saved when the runner completed it (#47): the page line is built from this, never from text.
	outcome: z.object({ kind: z.enum(['sent', 'held', 'refused', 'queued', 'done', 'failed']), reasons: strings.optional(), send: z.literal(true).optional(),
		action: optional, count: z.number().optional(), watch: z.object({ target: text, until: optional }).optional(), stale: z.literal(true).optional() }).optional(),
	who: optional, chat: optional,
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

// A37 (b) / PM A R37: the live vote-claim re-check on edited text (POST /api/v1/vote-check), the same rule as the card and Send.
export const voteCheckSchema = z.object({ claim: z.object({ line: text, confirm: text, words: text, quote: text, pr: z.number().optional() }).optional() })
export type VoteCheck = z.infer<typeof voteCheckSchema>
