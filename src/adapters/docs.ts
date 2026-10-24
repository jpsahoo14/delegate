import { crc32, inflateRawSync } from 'node:zlib'
import { posix } from 'node:path'
import { McpBytesError, McpClient, MCP_BYTE_LIMIT } from './mcp-client.ts'

export type DocumentRef = { url: string; driveId?: never; itemId?: never } | { driveId: string; itemId: string; url?: never }
export type Doc = { name: string; modified: string; by: string; text: string; headings: { at: number; text: string }[]; ref: DocumentRef; url?: string; tool: string; size: number }
export interface Documents {
	read(ref: DocumentRef, observe?: (diagnostic: DocumentDiagnostic) => void): Promise<Doc | string>
	close(): Promise<void>
}

export type DocumentDiagnostic = { step: 'metadata' | 'download' | 'decode-base64' | 'unzip' | 'office-parse'; class: string; contentTypes: string[]; bytes: number; via: 'tool' | 'downloadUrl' }
export const DOWNLOAD_LIMIT = MCP_BYTE_LIMIT, PAGE_LIMIT = 30_000
const EXPANDED_LIMIT = 100 * 1024 * 1024
export const hardDocumentFailure = (reason: string) => /^Couldn't open .+?: (?:no access|too much content to open|not a Word, PowerPoint or Excel file|too large to open(?: \([^)\r\n]*\))?)$/i.test(reason)

// Bound both the downloaded archive and its expansion; an Office file is an untrusted ZIP.
export function unzip(buf: Buffer): Map<string, Buffer> {
	const out = new Map<string, Buffer>()
	let end = buf.length - 22
	while (end >= Math.max(0, buf.length - 65_557) && buf.readUInt32LE(end) !== 0x06054b50) end--
	if (end < 0 || buf.readUInt32LE(end) !== 0x06054b50) throw new Error('Not an Office file')
	let at = buf.readUInt32LE(end + 16), expanded = 0
	const count = buf.readUInt16LE(end + 10)
	if (count > 10_000) throw new Error('Too much content to open')
	for (let i = 0; i < count; i++) {
		if (at + 46 > end || buf.readUInt32LE(at) !== 0x02014b50) throw new Error('Incomplete Office file')
		const flags = buf.readUInt16LE(at + 8), method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20)
		const length = buf.readUInt32LE(at + 24), n = buf.readUInt16LE(at + 28), local = buf.readUInt32LE(at + 42)
		if (flags & 1 || ![0, 8].includes(method) || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error('Unsupported Office file')
		const next = at + 46 + n + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32)
		if (next > end) throw new Error('Incomplete Office file')
		const name = buf.toString('utf8', at + 46, at + 46 + n)
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
		if (start + size > buf.length || expanded + length > EXPANDED_LIMIT) throw new Error('Too much content to open')
		const data = method === 8 ? inflateRawSync(buf.subarray(start, start + size), { maxOutputLength: Math.max(1, EXPANDED_LIMIT - expanded) }) : buf.subarray(start, start + size)
		if (data.length !== length || expanded + data.length > EXPANDED_LIMIT || crc32(data) !== buf.readUInt32LE(at + 16)) throw new Error('Incomplete Office file')
		expanded += data.length
		out.set(name, data)
		at = next
	}
	return out
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#x[\da-f]+|#\d+);/gi, (all, e: string) => {
	if (!e.startsWith('#')) return ENT[e.toLowerCase()] ?? all
	const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
	return n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all
})
const attr = (xml: string, name: string) => unescape(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`).exec(xml)?.slice(1).find(x => x !== undefined) ?? '')
const texts = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g'))].map(m => unescape(m[1])).join('')
const wordText = (xml: string) => unescape(xml.replace(/<w:tab\s*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<[^>]+>/g, '')).trim()
const partName = (folder: string, target: string) => posix.normalize(target.startsWith('/') ? target.slice(1) : `${folder}/${target}`)

function officeText(files: Map<string, Buffer>): Pick<Doc, 'text' | 'headings'> {
	let text = ''
	const headings: Doc['headings'] = []
	const append = (s: string, heading?: string) => {
		if (!s) return
		if (heading) headings.push({ at: text.length, text: heading })
		text += `${s}\n`
	}
	const word = files.get('word/document.xml')?.toString('utf8')
	if (word !== undefined) {
		for (const p of word.matchAll(/<w:p\b[^>]*(?<!\/)>[\s\S]*?<\/w:p>/g)) {
			const s = wordText(p[0])
			append(s, /<w:pStyle\b[^>]*w:val=["'](?:Heading\d*|Title)["']/i.test(p[0]) || /<w:outlineLvl\b/.test(p[0]) ? s : undefined)
		}
	} else if (files.has('ppt/presentation.xml')) {
		const rels = files.get('ppt/_rels/presentation.xml.rels')?.toString('utf8') ?? ''
		const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], 'Id'), attr(m[0], 'Target')]))
		const presentation = files.get('ppt/presentation.xml')!.toString('utf8')
		let slide = 0
		for (const m of presentation.matchAll(/<p:sldId\b[^>]*>/g)) {
			const target = targets.get(attr(m[0], 'r:id'))
			const xml = target && files.get(partName('ppt', target))?.toString('utf8')
			if (!xml) throw new Error('Incomplete slide text')
			append(`Slide ${++slide}`, `Slide ${slide}`)
			for (const p of xml.matchAll(/<a:p\b[^>]*(?<!\/)>[\s\S]*?<\/a:p>/g)) append(texts(p[0], 'a:t'))
		}
	} else if (files.has('xl/workbook.xml')) {
		const strings = [...(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map(m => texts(m[1] ?? '', 't'))
		const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? ''
		const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], 'Id'), attr(m[0], 'Target')]))
		for (const m of files.get('xl/workbook.xml')!.toString('utf8').matchAll(/<sheet\b[^>]*>/g)) {
			const name = attr(m[0], 'name'), target = targets.get(attr(m[0], 'r:id'))
			const xml = target && files.get(partName('xl', target))?.toString('utf8')
			if (!xml) throw new Error('Incomplete sheet text')
			append(`Sheet: ${name}`, `Sheet: ${name}`)
			let rows = 0
			for (const row of xml.matchAll(/<row\b[^>]*(?<!\/)>[\s\S]*?<\/row>/g)) {
				if (rows++ === 2000) { append('[Only the first 2,000 rows of this sheet are shown.]'); break }
				const cells = [...row[0].matchAll(/<c\b[^>]*(?<!\/)>[\s\S]*?<\/c>/g)].map(c => {
					const value = texts(c[0], 'v'), type = attr(c[0].split('>')[0], 't')
					if (type === 's' && (!/^\d+$/.test(value) || strings[Number(value)] === undefined)) throw new Error('Incomplete sheet text')
					return `${attr(c[0].split('>')[0], 'r')}: ${type === 's' ? strings[Number(value)] : type === 'inlineStr' ? texts(c[0], 't') : value}`
				})
				append(cells.join('\t'))
			}
		}
	} else throw new Error('Not a Word, PowerPoint or Excel file')
	return { text: text.trimEnd(), headings }
}

export function docxText(buf: Buffer): string { return officeText(unzip(buf)).text }

export function documentPages(doc: Doc): string[] {
	const outline = doc.headings.length ? doc.headings.map(h => `- ${h.text}`).join('\n') : '- Document text'
	const lead = `${doc.name}${doc.modified ? `; last changed ${doc.modified}` : ''}${doc.by ? ` by ${doc.by}` : ''}\nOutline:\n${outline.slice(0, 2200)}${outline.length > 2200 ? '\n[Outline shortened; headings remain in the text.]' : ''}\n`
	const pages: string[] = []
	let at = 0
	do {
		const context = doc.headings.findLast(h => h.at <= at)?.text ?? 'Document start'
		const header = pages.length === 0 ? lead : `${doc.name}\nHeading: ${context.slice(0, 400)}\n`
		// Reserve the page-count line before splitting, so every returned page, including its outline, fits the limit.
		const n = PAGE_LIMIT - header.length - 80
		if (n < 1) throw new Error('Document name is too long')
		let end = Math.min(doc.text.length, at + n)
		if (end < doc.text.length && /[\uD800-\uDBFF]/.test(doc.text[end - 1])) end--
		pages.push(`${header}page: ${pages.length + 1}; pages: COUNT\n\n${doc.text.slice(at, end)}`)
		at = end
	} while (at < doc.text.length)
	return pages.map(text => text.replace('pages: COUNT', `pages: ${pages.length}`))
}

export function documentPage(doc: Doc, page = 1): string {
	const pages = documentPages(doc)
	return Number.isInteger(page) && page >= 1 && page <= pages.length ? pages[page - 1] : `No such page. ${doc.name} has ${pages.length} pages.`
}

type Metadata = { id?: string; name?: string; size?: number; webUrl?: string; lastModifiedDateTime?: string; lastModifiedBy?: { user?: { displayName?: string } }; parentReference?: { driveId?: string }; '@content.downloadUrl'?: string; '@content.downloadUrlNoAuth'?: string }
const tooLarge = (size: number) => `too large to open (${Math.ceil(size / 1024 / 1024)} MB)`

const allowedDownload = (url: URL) => url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
	&& ['.sharepoint.com', '.sharepoint-df.com', '.svc.ms'].some(suffix => url.hostname.endsWith(suffix))
function downloadTarget(link?: string): URL | undefined {
	if (!link) return
	try { const url = new URL(link); return allowedDownload(url) ? url : undefined } catch { return undefined }
}
async function downloadFile(url: URL): Promise<Buffer> {
	const origin = url.origin, signal = AbortSignal.timeout(30_000)
	for (let redirects = 0; redirects <= 3; redirects++) {
		const response = await fetch(url, { redirect: 'manual', credentials: 'omit', signal })
		if (response.status >= 300 && response.status < 400) {
			await response.body?.cancel()
			const location = response.headers.get('location')
			if (!location) throw new McpBytesError('download', 'redirect', [])
			url = new URL(location, url)
			if (!allowedDownload(url) || url.origin !== origin) throw new McpBytesError('download', 'blocked-redirect', [])
			continue
		}
		if (!response.ok || !response.body) {
			await response.body?.cancel()
			throw new McpBytesError('download', response.status === 401 || response.status === 403 ? 'no-access' : 'http', [])
		}
		if (Number(response.headers.get('content-length')) > DOWNLOAD_LIMIT) {
			await response.body.cancel()
			throw new McpBytesError('download', 'too-large', [])
		}
		const reader = response.body.getReader(), chunks: Uint8Array[] = []
		let size = 0
		try {
			for (;;) {
				const next = await reader.read()
				if (next.done) return Buffer.concat(chunks, size)
				size += next.value.byteLength
				if (size > DOWNLOAD_LIMIT) { await reader.cancel(); throw new McpBytesError('download', 'too-large', [], size) }
				chunks.push(next.value)
			}
		} finally { reader.releaseLock() }
	}
	throw new McpBytesError('download', 'redirect-limit', [])
}

export class SharePointDocs implements Documents {
	private mcp: McpClient
	constructor(command: string[], mcp = new McpClient(command)) { this.mcp = mcp }
	async read(ref: DocumentRef, observe?: (diagnostic: DocumentDiagnostic) => void): Promise<Doc | string> {
		let name = 'this document'
		const diagnostic: DocumentDiagnostic = { step: 'metadata', class: 'none', contentTypes: [], bytes: 0, via: 'tool' }
		const fail = (reason: string, kind: string) => {
			observe?.({ ...diagnostic, class: kind })
			return `Couldn't open ${name}: ${reason}`
		}
		try {
			if (ref.url) {
				const part = new URL(ref.url).pathname.split('/').at(-1) ?? ''
				if (/\.(docx|pptx|xlsx|pdf)$/i.test(part)) name = decodeURIComponent(part)
			}
			const tools = (await this.mcp.listAll()).tools
			const names = ref.url ? ['getFileOrFolderMetadataByUrl', 'getFileMetadataByUrl'] : ['getFileOrFolderMetadata', 'getFileMetadata']
			const info = names.map(name => tools.find(t => t.name === name)).find(t => t !== undefined)
			if (!info) return fail(ref.url ? 'the document server cannot read its metadata' : "the document server can't look it up by id", 'metadata-unavailable')
			const props = (info.inputSchema?.properties ?? {}) as Record<string, unknown>
			const urlKey = ['fileOrFolderUrl', 'fileUrl', 'url'].find(key => key in props) ?? 'url'
			const idKey = ['fileOrFolderId', 'fileId'].find(key => key in props) ?? 'fileId'
			const args = ref.url ? { [urlKey]: ref.url } : { documentLibraryId: ref.driveId, [idKey]: ref.itemId }
			const hit = await this.mcp.call<Metadata>(info.name, args)
			name = hit.name ?? name
			if (typeof hit.size !== 'number' || !Number.isFinite(hit.size) || hit.size < 0) return fail('its download size could not be checked', 'size-unavailable')
			if (hit.size > DOWNLOAD_LIMIT) return fail(tooLarge(hit.size), 'too-large')
			if (!/\.(docx|pptx|xlsx)$/i.test(name)) return fail('not a Word, PowerPoint or Excel file', 'unsupported-format')
			const driveId = hit.parentReference?.driveId ?? ref.driveId, itemId = hit.id ?? ref.itemId
			if (!driveId || !itemId) return fail('the document server did not identify the file', 'missing-id')
			diagnostic.step = 'download'
			let bytes: Buffer
			try {
				const result = await this.mcp.bytes('readSmallBinaryFile', { documentLibraryId: driveId, fileId: itemId })
				bytes = result.bytes; diagnostic.contentTypes = result.contentTypes
			} catch (error) {
				if (error instanceof McpBytesError) diagnostic.contentTypes = error.contentTypes
				const link = downloadTarget(hit['@content.downloadUrlNoAuth']) ?? downloadTarget(hit['@content.downloadUrl'])
				if (!link || error instanceof McpBytesError && error.kind === 'ambiguous') throw error
				diagnostic.via = 'downloadUrl'
				bytes = await downloadFile(link)
			}
			diagnostic.bytes = bytes.length
			diagnostic.step = 'unzip'
			if (!bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('Not an Office file')
			const files = unzip(bytes)
			diagnostic.step = 'office-parse'
			const contents = officeText(files)
			observe?.({ ...diagnostic })
			return { name, modified: hit.lastModifiedDateTime ?? '', by: hit.lastModifiedBy?.user?.displayName ?? '', ...contents, ref: { driveId, itemId }, url: hit.webUrl ?? ref.url, tool: info.name, size: bytes.length }
		} catch (e) {
			if (e instanceof McpBytesError) { diagnostic.step = e.step; diagnostic.bytes = e.bytes || diagnostic.bytes }
			const why = String(e)
			const kind = e instanceof McpBytesError ? e.kind : e instanceof Error ? e.name : 'unknown'
			if (kind === 'no-access' || /\b40[13]\b|forbidden|access.?denied|unauthori[sz]ed/i.test(why)) return fail('no access', 'no-access')
			if (/Too much content|maxOutputLength|buffer larger/i.test(why)) return fail('too much content to open', 'expansion-limit')
			if (kind === 'too-large' || /too large|\b413\b|exceeds? (?:the )?(?:maximum )?(?:binary |file )?size/i.test(why)) return fail('too large to open (document server limit)', 'too-large')
			return fail(diagnostic.step === 'metadata' || diagnostic.step === 'download' ? "couldn't download it" : "couldn't read its contents", kind)
		}
	}
	close() { return this.mcp.close() }
}
