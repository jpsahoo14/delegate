import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCAL_DIR, type Store } from './state.ts'

const CONTENT = ['text', 'summary', 'lastAsk', 'sent', 'answer', 'ask', 'draft', 'note'] as const

// Message text older than the retention period is cleared; codes, states, people, and times stay (R-SEC-05).
// Knowledge cards are not swept: the owner approved each line, and each keeps its source link.
export function sweep(store: Store, days = 30, now = Date.now()): number {
	const cutoff = new Date(now - days * 86_400_000).toISOString()
	let n = 0
	for (const wf of store.workflows().filter(w => w.state === 'done' && w.updatedAt < cutoff && !w.redacted)) {
		rmSync(join(store.root, 'state', 'threads', `${wf.id}.json`), { force: true })
		Object.assign(wf, {
			redacted: true, fyi: undefined, lastAsk: undefined, question: undefined, ownerAnswer: undefined, learnAfter: undefined, earlier: undefined, approved: undefined,
			draft: wf.draft && { ...wf.draft, text: '' }, status: wf.status.replace(/: ".*$/s, ''),
			effects: wf.effects?.map(e => ({ ...e, payload: undefined })),
			sent: wf.sent && { ...wf.sent, text: undefined },
			// Closed work keeps its goal and why, like a status line; the steps lose their words.
			work: wf.work && { ...wf.work, steps: wf.work.steps.map(x => ({ at: x.at, what: '' })), next: undefined, waitingOn: undefined },
		})
		store.save(wf, false)
		n++
	}
	// Job bodies can hold message text: asks, a learning job's goal, the result's reply and summary (review 085 P1-2).
	for (const job of store.jobs().filter(j => j.state !== 'running' && j.state !== 'queued' && (j.updatedAt ?? '') < cutoff && !j.redacted)) {
		store.saveJob({ ...job, redacted: true, asks: [], goal: job.key, result: job.result && { summary: '', effects: job.result.effects.map(e => ({ ...e, payload: undefined, summary: e.summary.slice(0, 80) })) } })
		n++
	}
	store.pruneOutcomes(cutoff)
	// A session backup no open item or job uses is removed once it is older than the period.
	const live = new Set([...store.workflows().filter(w => w.state !== 'done').map(w => w.session.id), ...store.jobs().filter(j => j.state !== 'done' && j.state !== 'failed').map(j => j.session.id), ...store.owners().map(o => o.session)])
	const sessions = join(store.root, 'sessions')
	if (existsSync(sessions)) for (const id of readdirSync(sessions)) {
		const p = join(sessions, id)
		if (!live.has(id) && statSync(p).mtimeMs < now - days * 86_400_000) { rmSync(p, { recursive: true, force: true }); n++ }
	}
	store.keepSent(s => s.at >= cutoff ? s : { ...s, text: '' })
	for (const dir of [['done', 'answers'], ['done', 'reports'], ['changes']]) n += removeOlder(join(store.root, 'state', ...dir), now - days * 86_400_000)
	// A run's provenance is taken when the run ends; one left by a crashed run goes with the rest.
	n += removeOlder(join(store.root, 'state', 'provenance'), now - days * 86_400_000)
	// Job logs on this machine hold the CLI's output, which can quote messages (round 3 #5).
	n += removeOlder(join(LOCAL_DIR, 'sessions'), now - days * 86_400_000)
	// Lessons keep what was asked, drafted, and sent in their detail; after the period only their shape stays (review 10-20).
	const fbDir = join(store.root, 'feedback')
	if (existsSync(fbDir)) for (const f of readdirSync(fbDir).filter(f => f.endsWith('.jsonl'))) {
		const p = join(fbDir, f)
		const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { try { const e = JSON.parse(l); if (String(e.at) < cutoff && e.detail) for (const k of [...CONTENT, 'fyi']) delete e.detail[k]; return JSON.stringify(e) } catch { return '' } })
		writeFileSync(p, lines.filter(Boolean).join('\n') + '\n')
	}
	const logDir = join(store.root, 'state', 'log')
	if (existsSync(logDir)) for (const f of readdirSync(logDir).filter(f => f.endsWith('.jsonl') && f.slice(0, 10) < cutoff.slice(0, 10))) {
		const p = join(logDir, f)
		const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { try { const e = JSON.parse(l); for (const k of CONTENT) delete e[k]; return JSON.stringify(e) } catch { return '' } })
		writeFileSync(p, lines.filter(Boolean).join('\n') + '\n')
	}
	return n
}

function removeOlder(dir: string, beforeMs: number): number {
	if (!existsSync(dir)) return 0
	let n = 0
	for (const f of readdirSync(dir)) {
		const p = join(dir, f)
		if (statSync(p).mtimeMs < beforeMs) { rmSync(p, { recursive: true, force: true }); n++ }
	}
	return n
}
