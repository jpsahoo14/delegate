// Delegate's own worker tools, one implementation for both ways a run reaches them (#19 step 2): the per-run worker MCP server
// (one process per run) and the resident host's in-process tools.
import { intents } from '../core/intents.ts'
import { z } from 'zod'
import { ReportSchema } from '../core/report.ts'
import type { Report } from '../core/types.ts'
import { docsFor, imagesFor } from '../adapters/registry.ts'
import { documentPages, hardDocumentFailure, type DocumentRef, type DocumentDiagnostic } from '../adapters/docs.ts'
import type { Store } from '../store/state.ts'

export const SUBMIT_DESCRIPTION = 'Submit your one report for this workflow. Call exactly once, then finish.'
export const IMAGE_DESCRIPTION = 'Look at an image pasted into a message. Pass the link from its [image ...] line. Use it whenever the ask may depend on what the image shows; never describe an image you did not open.'
export const IMAGE_LINK = 'The link from the [image ...] line: https://graph.microsoft.com/... or inline:<key>'
export const DOCUMENT_DESCRIPTION = 'Read a Word, PowerPoint or Excel file by its sharing/web URL or both driveId and itemId. No name search. Fetches and decodes on the server; no binary reaches you. Page 1 starts with an outline and page count; request each page you need. Pages are at most 30,000 characters; downloads at most 25 MB. Use this instead of binary readers for Office files.'
export const DOCUMENT_INPUT = {
	url: z.string().url().regex(/^https?:\/\//i).optional().describe('The attachment sharing link or web URL'),
	driveId: z.string().min(1).optional(), itemId: z.string().min(1).optional(),
	page: z.number().int().min(1).optional(),
}
export const DOCUMENT = z.object(DOCUMENT_INPUT).strict().refine(v => !!v.url && !v.driveId && !v.itemId || !v.url && !!v.driveId && !!v.itemId, { message: 'Use a URL, or both driveId and itemId' })

export const REPORT = z.object(ReportSchema)
export type ToolOut = { text: string; error?: boolean; image?: { data: string; mimeType: string } }

// Cache one decoded document within a run so paging never downloads its binary again.
export function documentReader(store: Store) {
	const failures = new Map<string, string>()
	let cached: { key: string; doc: Promise<{ name: string; pages: string[] } | string> } | undefined
	const read = async (raw: unknown): Promise<ToolOut> => {
		const p = DOCUMENT.safeParse(raw)
		if (!p.success) return { text: 'Use a document URL, or both driveId and itemId, and a positive page number. File names are not supported.', error: true }
		const { page = 1, ...v } = p.data
		const ref: DocumentRef = v.url ? { url: v.url } : { driveId: v.driveId!, itemId: v.itemId! }
		const key = JSON.stringify(ref)
		if (cached?.key !== key) {
			cached = { key, doc: (async () => {
				const docs = docsFor(store.config())
				let diagnostic: DocumentDiagnostic = { step: 'metadata', class: 'not-configured', contentTypes: [], bytes: 0, via: 'tool' }
				const doc = docs ? await docs.read(ref, value => { diagnostic = value }).finally(() => docs.close()) : "Couldn't open this document: no document server is configured"
				if (typeof doc === 'string') {
					const hard = hardDocumentFailure(doc)
					if (hard) failures.set(key, doc)
					else failures.delete(key)
					store.log({ event: 'document-read-failed', ...diagnostic, hard })
					return doc
				}
				failures.delete(key)
				const pages = documentPages(doc)
				store.documentAlias(doc.ref, v.url ?? doc.url)
				store.log({ event: 'document-read', tool: doc.tool, size: doc.size, pages: pages.length, ...diagnostic })
				return { name: doc.name, pages }
			})() }
		}
		const doc = await cached.doc
		if (typeof doc === 'string') {
			return { text: doc, error: true }
		}
		const text = doc.pages[page - 1]
		return text === undefined ? { text: `No such page. ${doc.name} has ${doc.pages.length} pages.`, error: true } : { text }
	}
	return Object.assign(read, { failure: () => [...failures.values()].at(-1) })
}

// One report per run, for this workflow only; in a Continue window the owner may refine, and the last report wins.
export function reportTaker(store: Store, wfId: string, runId: string, interactive = false, documentFailure?: () => string | undefined): (raw: unknown) => ToolOut {
	let submitted = false
	return raw => {
		const p = REPORT.safeParse(raw)
		if (!p.success) return { text: `The report does not fit its schema: ${p.error.issues.slice(0, 5).map(i => `${i.path.join('.') || 'report'}: ${i.message}`).join('; ')}`, error: true }
		const r = p.data as Report
		if (r.workflowId !== wfId) return { text: `Wrong workflowId. Use "${wfId}".`, error: true }
		const known = intents(store.root).map(i => i.id)
		if (!known.includes(r.intent)) return { text: `Unknown intent "${r.intent}". Use one of: ${known.join(', ')}.`, error: true }
		if (submitted && !interactive) return { text: 'Already submitted. Finish now.', error: true }
		// A terminal whose item Delegate took back (released, or taken back from the page) can't land a report silently (#43).
		if (interactive) {
			const o = store.openWindow(wfId)
			if (!o || o.runId !== runId || o.takenBack) { store.log({ event: 'continue-late-report', target: wfId, runId }); return { text: "Delegate took this item back; what you decide here isn't used. Tell Delegate in the page instead.", error: true } }
		}
		const why = r.goalMet === false ? documentFailure?.() : undefined
		if (why) r.blocker = { kind: r.blocker?.kind ?? 'tool', why, tried: r.blocker?.tried ?? [], documentFailure: true }
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
