// Delegate's own worker tools, one implementation for both ways a run reaches them (#19 step 2): the per-run worker MCP server
// (one process per run) and the resident host's in-process tools. After #21 only these remain: the report, and an image kept at intake.
import { intents } from '../core/intents.ts'
import { z } from 'zod'
import { ReportSchema } from '../core/report.ts'
import type { Report } from '../core/types.ts'
import { imagesFor } from '../adapters/registry.ts'
import type { Store } from '../store/state.ts'

export const SUBMIT_DESCRIPTION = 'Submit your one report for this workflow. Call exactly once, then finish.'
export const IMAGE_DESCRIPTION = 'Look at an image pasted into a message. Pass the link from its [image ...] line. Use it whenever the ask may depend on what the image shows; never describe an image you did not open.'
export const IMAGE_LINK = 'The link from the [image ...] line: https://graph.microsoft.com/... or inline:<key>'

export const REPORT = z.object(ReportSchema)
export type ToolOut = { text: string; error?: boolean; image?: { data: string; mimeType: string } }

// One report per run, for this workflow only; in a Continue window the owner may refine, and the last report wins.
export function reportTaker(store: Store, wfId: string, runId: string, interactive = false): (raw: unknown) => ToolOut {
	let submitted = false
	return raw => {
		const p = REPORT.safeParse(raw)
		if (!p.success) return { text: `The report does not fit its schema: ${p.error.issues.slice(0, 5).map(i => `${i.path.join('.') || 'report'}: ${i.message}`).join('; ')}`, error: true }
		const r = p.data as Report
		if (r.workflowId !== wfId) return { text: `Wrong workflowId. Use "${wfId}".`, error: true }
		const known = intents(store.root).map(i => i.id)
		if (!known.includes(r.intent)) return { text: `Unknown intent "${r.intent}". Use one of: ${known.join(', ')}.`, error: true }
		if (submitted && !interactive) return { text: 'Already submitted. Finish now.', error: true }
		store.writeReport(r, runId)
		submitted = true
		return { text: 'Report saved. Call task_complete now.' }
	}
}

// An image pasted inline was kept in the store at intake (bug 10-23 E17); others are read through the chat source.
export async function readImage(store: Store, link: string): Promise<ToolOut> {
	const inline = /^inline:([0-9a-f]{16,40})$/.exec(link.trim())
	if (inline) {
		const m = store.media(inline[1])
		return m ? { text: 'image', image: { data: m.data, mimeType: m.type } } : { text: 'That inline image was not kept, so it cannot be opened. Say you cannot read it; never guess what it shows.', error: true }
	}
	const m = imagesFor(store.config())
	if (!m) return { text: 'This setup cannot open images. Say you cannot read it; never guess what it shows.' }
	try {
		const r = await m.read(link)
		return typeof r === 'string' ? { text: r, error: true } : { text: 'image', image: { data: r.data, mimeType: r.type } }
	} catch (e) { return { text: `Could not open it: ${String(e).slice(0, 200)}`, error: true } } finally { await m.close() }
}
