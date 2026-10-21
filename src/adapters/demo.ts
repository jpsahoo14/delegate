import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RawMsg } from '../core/intake.ts'
import type { Report } from '../core/types.ts'
import { writeJson } from '../store/fs.ts'
import type { Store } from '../store/state.ts'
import type { Source } from './source.ts'
import type { RunWorker } from '../runner/dispatch.ts'
import type { Procs } from '../runner/jobs.ts'

// A chat source kept in a file: the same Source interface Teams implements, so the demo runs the real runner (plug and play).
export class DemoSource implements Source {
	readonly selfChatId = 'self'
	private file: string
	constructor(root: string) { this.file = join(root, 'demo', 'chats.json') }
	private all(): Record<string, RawMsg[]> { return existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {} }
	private save(c: Record<string, RawMsg[]>) { writeJson(this.file, c, 'demo') }
	post(chatId: string, from: { id: string; name: string }, body: string): string {
		const c = this.all()
		// IDs only grow, like Teams message IDs, so cursors work.
		const last = Object.values(c).flat().reduce((m, x) => (BigInt(x.id) > m ? BigInt(x.id) : m), BigInt(Date.now()))
		const id = String(last + 1n)
		c[chatId] = [...(c[chatId] ?? []), { id, at: new Date().toISOString(), from, html: false, body }]
		this.save(c)
		return id
	}
	async newMessages(chatId: string, afterId?: string, sinceIso?: string) {
		const msgs = this.all()[chatId] ?? []
		const newest = msgs.at(-1)?.id ?? afterId
		// Like Teams: after a cursor, else after a time, else the first read only sets a cursor.
		const out = afterId ? msgs.filter(m => BigInt(m.id) > BigInt(afterId)) : sinceIso ? msgs.filter(m => m.at > sinceIso) : []
		return { msgs: out, newest, truncated: false }
	}
	async recentChats() { return Object.entries(this.all()).filter(([id]) => id !== 'self').map(([id, m]) => ({ id, name: 'Team chat (demo)', lastAt: m.at(-1)?.at ?? '' })) }
	async recent(chatId: string, n: number) { return (this.all()[chatId] ?? []).slice(-n) }
	async send(chatId: string, text: string) { return { msgId: this.post(chatId, { id: 'owner', name: 'You' }, text) } }
	async sendSelf(text: string) { return { msgId: this.post('self', { id: 'owner', name: 'You' }, text) } }
	async deleteMessage(chatId: string, msgId: string) { const c = this.all(); c[chatId] = (c[chatId] ?? []).filter(m => m.id !== msgId); this.save(c) }
	async editMessage(chatId: string, msgId: string, text: string) { const c = this.all(); const m = c[chatId]?.find(x => x.id === msgId); if (m) m.body = text; this.save(c) }
	async presence() { return { availability: 'Offline' } }
	// The pretend chat has no guests.
	async members() { return { guests: false } }
	async close() {}
}

// A stand-in worker with canned answers, so the demo costs nothing and answers in a moment.
export const demoRun = (store: Store): RunWorker => async (_cfg, i) => {
	const ask = i.prompt.split('\n').filter(l => l.startsWith('>> [id:')).join(' ')
	const answered = i.prompt.match(/The owner answered your question: "([^"]*)"/)?.[1]
	const asked = i.prompt.match(/The owner asks: "([^"]*)"/)?.[1]
	const r: Report = asked
		? { workflowId: i.workflowId, intent: 'other', state: 'needs_human', summary: 'Answered', answer: /ring|rollout|banner/i.test(asked) ? 'Ring 1 started Oct 17 and needs one clean week, so ring 3 can start Oct 24 at the earliest.' : 'The knowledge says admin policy and sensitivity labels lock those options. Priya\'s team is under the strict policy since Oct 10.', reply: { text: '', commitment: false, sources: [{ ref: 'card:meeting-options/architecture#demo', tier: 'card', origin: 'extracted' }] } }
		: /shall we meet|meet at|quick call|sync up/i.test(ask) && !answered
		? { workflowId: i.workflowId, intent: 'other', state: 'needs_human', summary: 'Arun wants to meet at 3', question: 'Arun wants to meet. Do you?', reply: { text: '____', commitment: true, sources: [] },
			meeting: { subject: 'API changes', start: new Date(new Date().setHours(15, 0, 0, 0)).toISOString(), minutes: 30, attendees: ['Arun', 'You'] },
			context: [{ label: 'Conflict', text: 'You have "1:1 with Ana" at 3:00 to 3:30 PM.', tone: 'warn' }, { label: 'Could be async', text: 'He listed two questions in the thread.', tone: 'info' }],
			choices: { prompt: 'Arun wants to meet. Do you?', other: true, options: [
				{ label: 'Meet at 3:00', note: 'Conflicts with 1:1 with Ana', reply: 'Sounds good, sent an invite for 3.', effects: [{ system: 'calendar', action: 'create_event', target: 'Arun', summary: 'Invite: API changes · today 3:00 to 3:30 PM', call: { tool: 'demo-calendar', args: { subject: 'API changes', start: '15:00' } } }] },
				{ label: 'Meet at 4:00 instead', note: 'First free slot today', reply: "3 doesn't work for me, sent an invite for 4.", effects: [{ system: 'calendar', action: 'create_event', target: 'Arun', summary: 'Invite: API changes · today 4:00 to 4:30 PM', call: { tool: 'demo-calendar', args: { subject: 'API changes', start: '16:00' } } }] },
				{ label: 'Answer async', note: 'Reply without a meeting', reply: "Can we do this async? Send me the two questions and I'll answer today." },
			] } }
		: /flag a or b|which flag|option a/i.test(ask) && !answered
		? { workflowId: i.workflowId, intent: 'release_deploy', state: 'needs_human', summary: 'Ana asks which flag to use', question: 'Flag A or B for the rollout?', reply: { text: '____', commitment: true, sources: [] },
			choices: { prompt: 'Which flag?', other: true, options: [
				{ label: 'Flag A (per ring)', note: 'Vikram prefers it', reply: 'Use flag A, so we can control it per ring.' },
				{ label: 'Flag B (global)', reply: 'Use flag B; one switch is simpler for this change.' },
			] } }
		: answered
		? { workflowId: i.workflowId, intent: 'commitment_decision', state: 'needs_human', summary: `Ship date: ${answered}`, reply: { text: `We plan to ship on ${answered}.`, commitment: true, sources: [] } }
		: /review|recheck/i.test(ask)
		? { workflowId: i.workflowId, intent: 'pr_review', state: 'needs_human', summary: 'Needs a review', job: { key: 'pr:demo/web/1234', goal: 'Review PR 1234' } }
		: /thanks|thank you/i.test(ask)
			? { workflowId: i.workflowId, intent: 'none', state: 'done', summary: 'Just a thank-you' }
			: /ship|date|when/i.test(ask)
				? { workflowId: i.workflowId, intent: 'commitment_decision', state: 'needs_human', summary: 'Asks for a ship date', reply: { text: 'We plan to ship on ____.', commitment: true, sources: [] }, question: 'Which date can you commit to?' }
				: { workflowId: i.workflowId, intent: 'feature_knowledge', state: 'needs_human', summary: 'Asks why meeting options are locked', reply: { text: 'Some options are set by admin policy or a sensitivity label, so organizers cannot change them.', commitment: false, sources: [{ ref: 'card:meeting-options/architecture#demo', tier: 'card', origin: 'extracted' }, { ref: 'https://docs.example.com/meeting-policies', tier: 'live', origin: 'extracted' }] } }
	store.writeReport(r, i.runId)
	return { exitCode: 0, ms: 1 }
}

// Background jobs finish at once with canned results; nothing is started or opened.
export const demoProcs = (store: Store): Procs => ({
	start: (_cfg, i) => {
		// A change run makes its change as make_change would record it; the demo has no tool server to call.
		const change = /Approved changes/.test(i.prompt)
		if (change) store.saveChange(i.workflowId, i.runId, 0, { call: '', state: 'done', ref: 'demo-thread-1', at: new Date().toISOString() })
		const r: Report = change
			? { workflowId: i.workflowId, intent: 'other', state: 'done', summary: 'Posted' }
			: /Workflow: tracker/.test(i.prompt)
				? { workflowId: i.workflowId, intent: 'other', state: 'needs_human', summary: 'Checks are running; 1 approval so far.' }
				: { workflowId: i.workflowId, intent: 'pr_review', state: 'needs_human', summary: '1 finding: a missing null check in banner.tsx', reply: { text: 'Left one comment on PR 1234: a null check in banner.tsx.', commitment: false, sources: [{ ref: 'https://dev.azure.com/demo/web/pullrequest/1234', tier: 'live', origin: 'extracted' }] }, effects: [{ system: 'ado', action: 'comment', target: 'PR 1234', summary: 'banner.tsx line 42: check props.user before use', payload: { text: 'props.user can be undefined here when the banner loads before sign-in.' }, call: { tool: 'demo-comment', args: { pullRequestId: 1234, content: 'props.user can be undefined here when the banner loads before sign-in.' } } }] }
		store.writeReport(r, i.runId)
		return { pid: 1 }
	},
	alive: () => false,
	kill: () => true,
	openWindow: (title) => { store.log({ event: 'demo-window', title }) },
})
