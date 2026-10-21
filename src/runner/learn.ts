import { randomUUID } from 'node:crypto'
import type { Config, Workflow } from '../core/types.ts'
import { ulid } from '../core/ids.ts'
import type { Store } from '../store/state.ts'
import { offRecord } from '../core/levels.ts'

// One detached run per edited reply; its claims become a K proposal from "your edit of A7" (R-LRN-01..03).
export function learnFrom(store: Store, cfg: Config, wf: Workflow, draft: string, sent: string) {
	if (offRecord(cfg, wf.chat.id)) return
	const now = new Date().toISOString()
	const link = wf.sent?.msgId ? `https://teams.microsoft.com/l/message/${encodeURIComponent(wf.chat.id)}/${wf.sent.msgId}` : ''
	const goal = [`Draft: "${draft}"`, `Sent by the owner: "${sent}"`, `Sent message: ${link || 'no link'}, ${now.slice(0, 10)}, ${cfg.owner.name}`, `Chat: ${wf.chat.name}. Asker: ${wf.asker?.name ?? 'unknown'}.`].join('\n')
	store.saveJob({ schema: 1, id: ulid(), key: `learn:${wf.id}:${ulid()}`, goal, label: `your edit of ${wf.code}`, session: { agent: cfg.agent.flavor, id: randomUUID() }, state: 'queued', purpose: 'work', parents: [], asks: [], createdAt: now, updatedAt: now })
}
