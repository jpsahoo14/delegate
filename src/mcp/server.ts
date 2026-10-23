import { pendingEffects } from '../core/effects.ts'
import { reopenable } from '../core/policy.ts'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { effectLine, renderList, renderMore } from '../core/render.ts'
import type { Config, Entry } from '../core/types.ts'
import { answerHabit } from '../runner/habits.ts'
import { fromOffChat, recordRead, setChatLevel, type Look } from '../runner/sharing.ts'
import { levelOf, offRecord } from '../core/levels.ts'
import { parseMessageLink } from '../adapters/channels.ts'
import { aboutText } from '../web/settings.ts'
import { changeKnowledge, inbox, knowledgeOf, publish, remember, renderProposal } from '../runner/proposals.ts'
import { BOOT_SOURCES, startBootstrap } from '../runner/bootstrap.ts'
import { disown, own } from '../runner/own.ts'
import { track, watchCommand } from '../runner/track.ts'
import { openTodos } from '../runner/work.ts'
import { statusText } from '../runner/status.ts'
import { makeChange, mcpCaller } from '../runner/change.ts'
import { adoProbe } from '../runner/probe.ts'
import { serveInbox } from '../web/server.ts'
import { openUrl } from '../os/window.ts'
import { parseVerbs, type Parsed } from '../core/verbs.ts'
import type { Store } from '../store/state.ts'
import { isControl, latestPreview, MISSED } from '../runner/intake.ts'
import { STEPS, save as setupSave, status as setupStatus } from './setup.ts'
import * as scheduler from '../os/scheduler.ts'
import { LOCAL_DIR } from '../store/state.ts'
import { CLI } from '../paths.ts'
import { intents } from '../core/intents.ts'
import { docsFor, historyFor } from '../adapters/registry.ts'
import { REPORT, report, summary as feedbackSummary } from '../store/feedback.ts'
import { parseChannelLink } from '../adapters/channels.ts'
import { describe, propose as proposeAutomation } from '../runner/automations.ts'

import { ClaimSchema, ReportSchema } from '../core/report.ts'
import { IMAGE_DESCRIPTION, IMAGE_LINK, readImage, reportTaker, SUBMIT_DESCRIPTION } from '../worker/tools.ts'
import { NAME } from '../brand.ts'

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })


// Worker mode exposes only submit_report, scoped to one workflow and run (R-SEC-02).
// The store loads lazily, so setup can run before a storage root exists.
export async function serve(store: () => Store) {
	await build(store).connect(new StdioServerTransport())
}

export function build(store: () => Store): McpServer {
	const server = new McpServer({ name: 'delegate', version: '0.1.0' })
	if (process.env.DELEGATE_MODE === 'worker') registerWorker(server, store())
	else { registerOwner(server, store); registerSetup(server) }
	return server
}


// Workers read knowledge only through these tools; they never get a write tool (dev-spec/slices/05).
// Drafting runs and the owner's own AI chat both search and read the knowledge; only the owner's chat may change it.
function registerKnowledgeReads(server: McpServer, get: () => Store) {
	const k = () => knowledgeOf(get(), get().config())
	// What the owner and others already said, anywhere in Teams. historyBefore pins the past in an eval, so the future is never read.
	// Knowledge found from a chat the owner marked counts as read from it, cited or not, so a private chat holds the reply. Other hits do not: a search returns more than a reply uses.
	const markedLinks = (cfg: Config, es: Entry[]) => es.flatMap(e => e.src.map(s => s.link)).filter(l => levelOf(cfg, parseMessageLink(l)?.chatId))
	// What a worker run looked at: tool, query, and hit count, never the text it got back (round 3 #5).
	const trace = (links: string[], q: string, tool: Look['tool'], n = links.length) => recordRead(get().root, process.env.DELEGATE_MODE === 'worker' ? process.env.DELEGATE_RUN : undefined, links, q, tool, n)
	server.registerTool('history_search', {
		description: 'Search everything said in the owner\'s Teams chats and channels, as a keyword search. Use it when the knowledge does not answer: the owner has often explained the same thing before. Set mine to find only what the owner wrote. Cite a hit by its link.',
		inputSchema: { query: z.string().describe('A few keywords, such as "shared mailbox owner"'), mine: z.boolean().optional() },
	}, async ({ query, mine }) => {
		const cfg = get().config()
		const h = historyFor(cfg)
		if (!h) return text('This chat system has no history search.')
		try {
			const hits = (await h.search(query, { mine, before: cfg.historyBefore })).filter(x => !offRecord(cfg, parseMessageLink(x.link)?.chatId))
			// A reply run's reads are recorded, so need-to-know can check who could see them (dev-spec/sharing.md).
			trace(hits.map(x => x.link), query, 'teams')
			return text(hits.length ? hits.map(x => `${x.at.slice(0, 10)} ${x.who}${x.mine ? ' (owner)' : ''}: ${x.text}\n  link: ${x.link}`).join('\n') : 'No messages match. Try fewer or different words.')
		} catch (e) { return { ...text(`Search failed: ${String(e).slice(0, 200)}`), isError: true } } finally { await h.close() }
	})
	registerImageRead(server, get)
	server.registerTool('doc_read', {
		description: 'Read a shared Word document in full, by its file name or title. Use it for a document review: one call returns the whole text.',
		inputSchema: { name: z.string().describe('The file name or title, such as "free-text-location-dev-spec-overview-v4.docx"') },
	}, async ({ name }) => {
		const d = docsFor(get().config())
		if (!d) return text('This setup has no document source.')
		try {
			const r = await d.read(name)
			trace([], name.split(/[\\/]/).pop()!.slice(0, 80), 'read', typeof r === 'string' ? 0 : 1)
			return text(typeof r === 'string' ? r : `${r.name}, last changed ${r.modified.slice(0, 10)} by ${r.by}.\n\n${r.text.slice(0, 80_000)}${r.text.length > 80_000 ? '\n\n(cut at 80,000 characters)' : ''}`)
		} catch (e) { return { ...text(`Could not read it: ${String(e).slice(0, 200)}`), isError: true } } finally { await d.close() }
	})
	const cite = (h: Entry) => `card:${h.topic}/${h.card}#${h.id}`
	server.registerTool('knowledge_search', { description: 'Search the owner\'s knowledge cards. Each hit has a citation to put in reply.sources, and source links you can open for more context.', inputSchema: { query: z.string(), types: z.array(z.enum(['fact', 'decision', 'faq', 'owner', 'status', 'open'])).optional() } }, async ({ query, types }) => {
		const cfg = get().config(), hits = k().search(query, { types }).filter(h => !fromOffChat(cfg, h.src))
		trace(markedLinks(cfg, hits), query, 'knowledge', hits.length)
		const idx = k().topics().map(t => `${t.topic}: ${t.title}${t.aliases.length ? ` (${t.aliases.join(', ')})` : ''}`)
		if (!hits.length) return text(`No entries match. Topics: ${idx.join('; ') || 'none yet'}.`)
		return text(hits.map(h => `${cite(h)} [${h.type}${h.expired ? ', expired' : ''}${h.audience === 'private' ? ', private' : ''}] ${h.text}\n  sources: ${h.src.map(s => [s.link, s.date, s.who].filter(Boolean).join(', ')).join('; ')}`).join('\n'))
	})
	server.registerTool('knowledge_read', { description: 'Read one entry (card:topic/card#id), a topic, or topic/card.', inputSchema: { ref: z.string() } }, async ({ ref }) => {
		const cfg = get().config(), r0 = k().read(ref), r = Array.isArray(r0) ? r0.map(c => ({ ...c, entries: c.entries.filter(e => !fromOffChat(cfg, e.src)) })) : r0 && fromOffChat(cfg, r0.src) ? undefined : r0
		trace(markedLinks(cfg, Array.isArray(r) ? r.flatMap(c => c.entries) : r ? [r] : []), ref.replace(/^card:/, '').split(/[/#]/)[0].replace(/-/g, ' '), 'read', r ? 1 : 0)
		if (!r) return text('Not found.')
		const show = (e: Entry) => `${cite(e)} [${e.type}] ${e.text} (sources: ${e.src.map(s => s.link).join('; ')})`
		return text(Array.isArray(r) ? r.map(c => `## ${c.title}\n${c.entries.map(show).join('\n')}`).join('\n\n') : show(r))
	})
}

// An image pasted into a message: inline ones were kept at intake; others are read through the chat source. Workers keep this one
// (#21 §4) until the CLI's own view is shown to return images to the model.
function registerImageRead(server: McpServer, get: () => Store) {
	server.registerTool('image_read', { description: IMAGE_DESCRIPTION, inputSchema: { link: z.string().describe(IMAGE_LINK) } }, async ({ link }) => {
		const r = await readImage(get(), link)
		return r.image ? { content: [{ type: 'image' as const, data: r.image.data, mimeType: r.image.mimeType }] } : { ...text(r.text), ...(r.error ? { isError: true } : {}) }
	})
}
function registerWorker(server: McpServer, store: Store) {
	// A run reads the knowledge, chats and documents with the owner's own servers and the CLI's built-ins (#21); only these stay.
	registerImageRead(server, () => store)
	const wfId = process.env.DELEGATE_WORKFLOW!, runId = process.env.DELEGATE_RUN!
	const take = reportTaker(store, wfId, runId, !!process.env.DELEGATE_INTERACTIVE)
	server.registerTool('submit_report', { description: SUBMIT_DESCRIPTION, inputSchema: ReportSchema }, async r => { const o = take(r); return { ...text(o.text), ...(o.error ? { isError: true } : {}) } })
	// A change run's only write: it runs exactly one approved call, and only while the owner's ok holds (next action).
	server.registerTool('make_change', { description: 'Make one of the approved changes listed in the prompt, by its index, exactly as approved. Returns its reference, or why it was not made.', inputSchema: { index: z.number().int().min(0) } }, async ({ index }) => {
		const probe = adoProbe(store.config())
		const r = await makeChange(store, wfId, runId, index, mcpCaller(store.config()), probe).finally(() => probe?.close?.().catch(() => undefined))
		return r.error ? { ...text(r.error), isError: true } : text(`Made change ${index}: ${r.ref}`)
	})
}

function registerOwner(server: McpServer, get: () => Store) {
	server.registerTool('status', { description: `Show whether ${NAME} is on, when it last checked, and today's counts. Show the returned text exactly.`, inputSchema: {} }, async () => text(statusText(get())))
	server.registerTool('open_inbox', {
		description: 'Open the inbox as a page in the browser, with buttons for every item. Use when the owner asks to open, see, or show the inbox page.',
		inputSchema: {},
	}, async () => text(await openInboxPage(get)))
	// The calling session is in the host's environment; that is the session being owned or published from.
	const here = () => process.env.COPILOT_AGENT_SESSION_ID
	server.registerTool('own', {
		description: 'Keep THIS session for a kind of ask, such as "PR reviews" or "the Starter Pack feature". Matching asks are answered in a copy of this session. Show the result exactly.',
		inputSchema: { what: z.string().describe('The kind of ask, in the owner\'s words') },
	}, async ({ what }) => text(own(get(), what, here())))
	server.registerTool('disown', { description: 'Stop routing asks to this session.', inputSchema: {} }, async () => text(disown(get(), here())))
	server.registerTool('publish', {
		description: 'Save what this session learned into the owner\'s knowledge, as a few lasting facts about one topic. Show the result exactly.',
		inputSchema: { topic: z.string(), claims: z.array(ClaimSchema.omit({ topic: true, src: true })).min(1) },
	}, async ({ topic, claims }) => { const s = get(); return text(publish(s, knowledgeOf(s, s.config()), s.config().owner.name, topic, claims, here())) })
	server.registerTool('watch_channel', {
		description: 'Watch a Teams channel for threads the owner starts, posts in, or is @mentioned in. Pass a channel link or any message link from that channel. Show the returned text exactly.',
		inputSchema: { link: z.string(), stop: z.boolean().optional() },
	}, async ({ link, stop }) => text(watchChannel(get(), link, !!stop)))
	server.registerTool('track', {
		description: 'Watch something until it is done and tell the owner only when it changes, is done, or needs them, such as "PR 1601234 checks" or "Ana sends the trace IDs". Use for "make sure X gets done", "watch X until Y", "keep an eye on X", "tell me when X". For the owner\'s own PR, set shepherd to propose fixes for comments and failed builds. Show the result exactly.',
		inputSchema: {
			target: z.string(), everyMinutes: z.number().int().min(5).max(1440).default(60),
			until: z.string().optional().describe('When it is done, in words, such as "merged or abandoned". Leave out when the owner did not say; the check works it out'),
			by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('The date it must be done by, YYYY-MM-DD, only when the owner named one ("by Friday")'),
			shepherd: z.boolean().optional(),
		},
	}, async t => text(track(get(), { ...t, from: 'chat' }, here())))
	server.registerTool('automate', {
		description: 'Set up a reminder the owner asked for, such as "remind Arun every weekday at 4 pm to update the design doc". Show the returned text exactly; it starts only after the owner says ok.',
		inputSchema: {
			to: z.string().describe('The person or group chat name'),
			text: z.string().optional().describe('The message to send, word for word as the owner gave it, or in their voice'),
			texts: z.array(z.string()).optional().describe('Several messages, when the owner wants the wording to change between sends'),
			rotation: z.enum(['cycle', 'repeat-last', 'once-each']).optional().describe('With texts: cycle loops, repeat-last stays on the last, once-each sends each once then ends'),
			every: z.enum(['once', 'hours', 'day', 'weekday', 'week']),
			at: z.string().optional().describe('For day, weekday, week: 24-hour HH:MM local time'), times: z.array(z.string()).optional().describe('More HH:MM times on the same days'),
			day: z.number().min(0).max(6).optional().describe('For every week: 0 Sunday to 6 Saturday'),
			hours: z.number().optional().describe('For every hours: how many hours apart'), start: z.string().optional().describe('For once and hours: first send, ISO date and time with offset'),
			until: z.string().optional().describe('Last date, YYYY-MM-DD'), maxSends: z.number().int().min(1).optional().describe('Stop after this many sends'),
			stopOnReply: z.boolean().optional().describe('Pause when they reply. On unless the owner says to keep going'),
			chatId: z.string().optional().describe('The chat id, if you looked it up'),
		},
	}, async i => text(proposeAutomation(get(), i)))
	server.registerTool('feedback', {
		description: `Record that ${NAME} got something wrong, in the owner's words, so it can be fixed. Use when the owner says a draft, a decision, a reminder, or anything else was wrong, or asks to report a problem. Show the result exactly.`,
		inputSchema: { text: z.string().describe('What was wrong and, if they said, what it should have done, in the owner\'s words'), code: z.string().optional().describe('The item code it is about, such as A7, if any') },
	}, async ({ text: t, code }) => {
		return text(report(get(), t, code))
	})
	server.registerTool('feedback_summary', {
		description: `Show what went wrong and what the owner corrected recently. Use when the owner asks what went wrong, what ${NAME} got wrong, or to see the feedback log.`,
		inputSchema: { days: z.number().int().min(1).max(90).optional() },
	}, async ({ days }) => text(feedbackSummary(get().lessons(), days ?? 7)))
	server.registerTool('remember', {
		description: 'Save something the owner asked you to remember into their knowledge. Pick the topic and type yourself; show the owner the result exactly.',
		inputSchema: { topic: z.string(), type: ClaimSchema.shape.type, text: z.string(), link: z.string().optional().describe('A link the owner gave, if any'), audience: z.enum(['team', 'private']).optional().describe('team only if the owner says others may see it') },
	}, async c => { const s = get(); return text(remember(s, knowledgeOf(s, s.config()), s.config().owner.name, c)) })
	registerKnowledgeReads(server, get)
	server.registerTool('about_me', { description: `What ${NAME} knows about the owner and acts on: their profile, standing instructions (said or learned, with evidence), habit suggestions, and learning settings. Use for "what do you know about me?". Show the returned text exactly.`, inputSchema: {} }, async () => text(aboutText(get())))
	server.registerTool('chat_level', {
		description: `Mark a chat when the owner says so in plain words: private (a reply in another chat that uses anything from it waits for the owner's ok), off the record (also never learned from or searched), or normal again. Show the result exactly.`,
		inputSchema: { chat: z.string().describe('A Teams message link, a chat id, or the chat name the owner used'), level: z.enum(['normal', 'private', 'off']), name: z.string().optional().describe('What the owner calls the chat, when you pass a link') },
	}, async c => text(setChatLevel(get(), c.chat, c.level, c.name)))
	server.registerTool('knowledge_change', {
		description: 'Change or remove one knowledge entry when the owner says a fact is wrong, outdated, or should be forgotten. Find it first with knowledge_search; pass its citation. It is saved at once with an undo; show the result exactly.',
		inputSchema: { ref: z.string().describe('The entry citation, card:topic/card#id'), text: z.string().optional().describe('The corrected fact in one or two sentences; leave out to remove the entry'), link: z.string().optional().describe('A link the owner gave as the new source, if any') },
	}, async c => { const s = get(); return text(changeKnowledge(s, knowledgeOf(s, s.config()), s.config().owner.name, c)) })
	server.registerTool('bootstrap', {
		description: 'Start the one-time reading of the owner\'s sources to propose knowledge. Each topic found becomes a K item to approve. Show the returned text exactly.',
		inputSchema: { sources: z.array(z.enum(BOOT_SOURCES)).optional().describe('Default: chats, prs, workitems. wiki and notes only if the owner asks') },
	}, async ({ sources }) => { const s = get(); return text(startBootstrap(s, sources, s.runnerLive())) })
	// The inbox is text in every chat; open_inbox opens the page with buttons (R-HIL-09).
	server.registerTool('inbox', { description: 'Show what needs the owner, what was done while away, and what is running. Show the returned text exactly.' }, async () => {
		const store = get()
		const since = store.lastViewed()
		const out = inbox(store, since)
		store.markViewed()
		return text(out)
	})
	server.registerTool('act', {
		description: 'Apply the owner\'s verbs exactly as typed, for example "ok A7", "watch A41" (watch a Catch up item until it is done), "watch A41: what until when it is done by YYYY-MM-DD", "edit A7: text", "A7: answer", "pick A7 2", "ask A7: question", "ok A7 #1 #3", "skip A7", "more A7", and for a reply already sent "wrong A7: what it should say", "incomplete A7: what was missing", "unneeded A7"; "missed <Teams message link>" for a message that should have been picked up. Several can be joined by commas.',
		inputSchema: { command: z.string() },
	}, async ({ command }) => { const r = actResult(get(), command, undefined, 'chat'); return { ...text(r.text), structuredContent: { ids: r.ids }, isError: !r.accepted } })
}

function registerSetup(server: McpServer) {
	server.registerTool('setup_status', { description: 'Show which setup steps are done and which comes next.', inputSchema: {} }, async () => text(setupStatus()))
	server.registerTool('setup_save', {
		description: `Validate and save one setup step after the owner confirmed it. Steps in order: ${STEPS.join(', ')}. See references/setup.md for each value.`,
		inputSchema: { step: z.enum(STEPS), value: z.record(z.string(), z.unknown()) },
	}, async ({ step, value }) => {
		try { return text(await setupSave(step, value, { installService })) } catch (e) { return { ...text(`Not saved: ${e instanceof Error ? e.message : e}`), isError: true } }
	})
}

function installService(): string {
	return scheduler.install({ node: process.execPath, cli: CLI, local: LOCAL_DIR, pathEnv: process.env.PATH ?? '' })
}

// Channels are named by the owner; Graph search cannot list channel posts reliably (dev-spec/decisions.md C1).
export function watchChannel(store: Store, link: string, stop = false): string {
	const ch = parseChannelLink(link)
	if (!ch) return 'That is not a channel link. In Teams, use "Copy link" on the channel, or on any message in it.'
	const cfg = store.config(), list = (cfg.channels || []).filter(c => c.channelId !== ch.channelId)
	store.saveConfig({ ...cfg, channels: stop ? list : [...list, ch] })
	store.saveThreadCache({ ...store.threadCache(), scannedAt: undefined })
	return stop ? `Stopped watching ${ch.name}.` : `Watching ${ch.name}. Replies in threads you start, post in, or are mentioned in will show up like chat asks. Channel replies always wait for your ok.`
}

export function act(store: Store, command: string, seenAt?: string, from: 'chat' | 'page' = 'chat'): string {
	return actResult(store, command, seenAt, from).text
}

// accepted is false when nothing was queued or shown, so the page and panel keep the item on screen (tester 06-07 P2-5).
export function actResult(store: Store, command: string, shownAt?: string, from: 'chat' | 'page' = 'chat'): { text: string; accepted: boolean; ids: string[] } {
	if (command.trim() === 'retry') { kickTick(store); const r = store.config().runner; return { text: r && r !== store.machine ? `Asked ${r} to check now. It does within a minute.` : 'Checking now.', accepted: true, ids: [] } }
	const unwatch = command.trim().match(/^unwatch\s+(https:\/\/\S+)$/i)
	if (unwatch) return { text: watchChannel(store, unwatch[1], true), accepted: true, ids: [] }
	const rep = command.trim().match(REPORT)
	if (rep) return { text: report(store, rep[2].trim(), rep[1]), accepted: true, ids: [] }
	const miss = command.trim().match(MISSED)
	if (miss) {
		store.addMissed({ link: miss[1], note: miss[2]?.trim() || undefined, at: new Date().toISOString() })
		kickTick(store)
		return { text: 'Got it. It becomes an item in a minute, with why it was missed. Nothing is sent.', accepted: true, ids: [] }
	}
	// The page's "Check now": the same update a tick does, without waiting for its interval.
	if (command.trim() === 'check update') {
		if (!process.env.DELEGATE_NO_KICK) spawn(process.execPath, [CLI, 'update-now'], { detached: true, stdio: 'ignore', env: process.env }).unref()
		return { text: 'Checking for a new version. The page reloads by itself if there is one.', accepted: true, ids: [] }
	}
	const parsed = parseVerbs(command)
	// A watch only adds a new item and job, so it starts at once, like "missed" (design-spec/done-v2.md).
	if (parsed?.[0]?.verb === 'watch') { const r = watchCommand(store, parsed[0]); return { text: r.text, accepted: r.accepted, ids: [] } }
	if (!parsed) return { text: 'I did not understand. Use a verb and a code, for example "ok A7" or "A7: Oct 24 works".', accepted: false, ids: [] }
	return enqueueParsed(store, parsed, shownAt, from)
}

// Typed page intents enter after chat parsing so user text remains one field.
export function enqueueParsed(store: Store, parsed: Parsed[], shownAt?: string, from: 'chat' | 'page' = 'page', answerId?: string, page?: import('../core/types.ts').PageApproval, pageSubmissionId?: string): { text: string; accepted: boolean; ids: string[] } {
	if (answerId && parsed.length !== 1) throw new Error('A page submission must target exactly one action.')
	const write = (answer: Parameters<Store['writeAnswer']>[0]) => store.writeAnswer({ ...answer, ...(page ? { page, ...(page.todoIds ? { todos: page.todoIds } : {}) } : {}), ...(pageSubmissionId ? { pageSubmissionId } : {}) }, answerId)
	let shown = 0
	const out: string[] = []
	const ids: string[] = []
	for (const p of parsed) {
		if (isControl(p.verb) && !p.code) { ids.push(write({ code: '', verb: p.verb, surface: 'chat' }).id); out.push(`${p.verb}: applying now.`); continue }
		const code = p.code ?? latestPreview(store, 'chat')
		const wt = code?.startsWith('W') ? store.waiting().find(w => w.code === code) : undefined
		if (wt) {
			if (p.verb !== 'ok' && p.verb !== 'skip') { out.push(`${wt.code} takes ok (draft a follow-up) or skip.`); continue }
			ids.push(write({ code: wt.code, verb: p.verb, surface: 'chat', seenAt: shownAt }).id)
			out.push(p.verb === 'ok' ? `${wt.code} will get a follow-up draft to ${wt.to.join(', ')}. You'll see it before it is sent.` : `${wt.code} will be dropped.`)
			continue
		}
		const hb = code?.startsWith('H') ? store.habit(code) : undefined
		if (hb) {
			if (p.verb === 'more') { out.push(answerHabit(store, hb, 'more')); shown++; continue }
			const style = hb.kind === 'style' && !hb.removes
			if (!['ok', 'skip', 'never', ...(style ? ['edit', 'undo'] : [])].includes(p.verb)) { out.push(`${hb.code} takes ok (turn it on), skip (not now), never, or more${style ? '; once on, edit or undo' : ''}.`); continue }
			ids.push(write({ code: hb.code, verb: p.verb, text: p.text, surface: 'chat' }).id)
			out.push(`${hb.code} ${{ ok: 'will turn on', skip: 'will wait 14 days', never: 'will not come back', edit: 'will change its style', undo: 'will be undone' }[p.verb as 'ok']}.`)
			continue
		}
		const auto = code?.startsWith('R') ? store.automation(code) : undefined
		if (auto) {
			if (p.verb === 'more') { out.push(describe(auto)); shown++; continue }
			ids.push(write({ code: auto.code, verb: p.verb, text: p.text, surface: 'chat', seenAt: shownAt }).id)
			out.push(`${auto.code} ${{ ok: 'will start', edit: `will say: "${p.text}"`, pause: 'will pause', resume: 'will resume', skip: 'will end; nothing more is sent' }[p.verb as 'ok'] ?? 'takes ok, edit, pause, resume, or skip'}.`)
			continue
		}
		const kp = code?.startsWith('K') ? store.proposal(code) : undefined
		if (kp) {
			if (p.verb === 'more') { out.push(renderProposal(kp)); shown++; continue }
			// Refused before promising anything (persona test P1).
			if (p.verb === 'edit' && kp.ops.length > 1) { out.push(`${kp.code} has ${kp.ops.length} facts, so it can't be edited as one. Say "ok ${kp.code}" to save them as shown or "skip ${kp.code}" to drop them. Then say "remember <topic>: <the right fact>" to add what is correct.`); continue }
			ids.push(write({ code: kp.code, verb: p.verb, text: p.text, nums: p.nums, except: p.except, surface: 'chat', seenAt: shownAt ?? new Date().toISOString() }).id)
			out.push(`${kp.code} (${kp.title}) ${{ ok: `will save: ${kp.status}`, edit: `will save your text: "${p.text}"`, skip: 'will be dropped; nothing is saved', undo: 'will be taken back' }[p.verb as 'ok'] ?? 'is not a knowledge verb'}.`)
			continue
		}
		const wf = code ? store.byCode(code) : undefined
		if (!wf) { out.push(code ? `${code}: no such item.` : 'Which item? Add a code, for example "ok A7".'); continue }
		if (p.verb === 'more') { out.push(renderMore(wf, store.thread(wf.id), new Date())); store.markShown([wf]); shown++; continue }
		// Promise only what can happen (final review persona notes).
		// Mark done: close on an item with open to-dos marks them done, even when the item is done (R-NEX-07).
		// From the page, only the to-dos it drew: the button carries the newest one's time, and one kept after that stays open (re-review N2 P2-C).
		const marks = p.verb === 'close' && openTodos(wf).length > 0
		// A rev older than every open to-do came from a button that drew none (a Close on another row): all open, as before.
		const drawn = marks ? openTodos(wf).filter(t => from !== 'page' || !shownAt || t.at <= shownAt) : [], seen = drawn.length ? drawn : openTodos(wf)
		if (marks) {
			ids.push(write({ code: wf.code, verb: p.verb, text: p.text, surface: 'chat', seenAt: shownAt ?? store.seenRev(wf.code), todos: seen.map(t => t.id) }).id)
			const count = page?.todoIds?.length ?? seen.length
			out.push(`${wf.code} will mark ${count === 1 ? 'its to-do' : `its ${count} to-dos`} done. Nothing is sent.`)
			continue
		}
		if (wf.state === 'done' && !reopenable(wf, p.verb) && !(p.verb === 'mine' && wf.fyi) && !['undo', 'ask', 'wrong', 'incomplete', 'unneeded'].includes(p.verb) && !(p.verb === 'send' && wf.sent)) { out.push(`${wf.code} is already done: ${wf.status}`); shown++; continue }
		if (p.verb === 'mine' && (wf.state !== 'done' || !wf.fyi)) { out.push(`${wf.code} is not in Catch up, so nothing changed.`); shown++; continue }
		// Every sent reply can be undone inside its window, as the page offers; the runner says when it has closed (owner 10-21; review react-spec P0-2).
		if (p.verb === 'undo' && !wf.sent) { out.push(`${wf.code}: has not been sent, so there is nothing to undo.`); shown++; continue }
		if (from === 'page' && p.verb === 'undo' && (!wf.sent?.undoUntil || Date.parse(wf.sent.undoUntil) <= Date.now())) { out.push(`${wf.code}: the undo window has closed. The reply stays in the chat.`); continue }
		ids.push(write({ code: wf.code, verb: p.verb, text: p.text, nums: p.nums, except: p.except, again: p.again, surface: 'chat', seenAt: shownAt ?? store.seenRev(wf.code) }).id)
		const ask = wf.lastAsk ? ` (${wf.asker?.name}: "${wf.lastAsk.slice(0, 80)}")` : ''
		const left = pendingEffects(wf.effects)
		const changes = left.length ? `will ${effectLine(left)}, then ` : 'will '
		// "A7: 2" on an item with options is a pick; say which option.
		if (p.verb === 'answer' && wf.choices && /^\s*#?\d+(\s*,\s*#?\d+)*\s*$/.test(p.text ?? '')) Object.assign(p, { verb: 'pick', nums: p.text!.match(/\d+/g)!.map(Number) })
		const opts = p.nums?.map(n => wf.choices?.options[n - 1]?.label).filter(Boolean).join('", "')
		const what = { mine: 'will be drafted for you. It waits for your ok', pick: opts ? `will use "${opts}" and show the reply first` : 'has no such option', ask: 'will be answered here. Nothing is sent', ok: `${p.nums?.length ? `will make only change${p.nums.length > 1 ? 's' : ''} ${p.nums.join(', ')}, then ` : changes}send the draft: "${wf.draft?.text?.slice(0, 160) ?? ''}"`, edit: `will change the draft to: "${p.text}". Nothing is sent until you say ok`, send: `${changes}send your words: "${p.text}"`, later: 'stays in your inbox for later', answer: 'will redraft with your answer and show a preview', skip: 'will be dismissed without a reply', unwatch: 'will stop only the check-back; work and to-dos stay open', undo: 'will take back the automatic reply and keep the draft', continue: `will open its session on the computer running ${NAME}`, wrong: 'gets a correction drafted for your ok. Nothing is sent yet', incomplete: 'gets a follow-up with what was missing, drafted for your ok. Nothing is sent yet', unneeded: 'is noted as not needed, and taken back if it still can be', every: 'will check at the new interval', extend: 'keeps watching for 7 more days' }[p.verb as 'ok']
		out.push(`${wf.code}${ask} ${what}.`)
	}
	if (ids.length && !process.env.DELEGATE_NO_KICK) { kickTick(store); out.push(from === 'page' ? 'Applying now.' : 'Applying now. It takes up to a minute, and you will see the result in "inbox".') }
	return { text: out.join('\n'), accepted: ids.length + shown > 0, ids }
}

function kickTick(store: Store) {
	store.saveKick()
	if (process.env.DELEGATE_NO_KICK) return
	spawn(process.execPath, [CLI, 'tick', '--force'], { detached: true, stdio: 'ignore', env: process.env }).unref()
}


let page: Promise<string> | undefined

// One page server per chat session; it lives as long as this MCP server does.
export function openInboxPage(get: () => Store): Promise<string> {
	page ??= serveInbox(get).then(({ url }) => url)
	return page.then(url => { openUrl(url); return `Opened your inbox in the browser: ${url}\nIt works while this chat is open. Buttons do the same as typing ok, skip, or edit.` })
}
