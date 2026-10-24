import { crc32, inflateRawSync } from 'node:zlib'
import { posix } from 'node:path'
import { McpClient } from './mcp-client.ts'

export type DocumentRef = { url: string; driveId?: never; itemId?: never } | { driveId: string; itemId: string; url?: never }
export type Doc = { name: string; modified: string; by: string; text: string; headings: { at: number; text: string }[]; ref: DocumentRef; url?: string; tool: string; size: number }
export interface Documents {
	read(ref: DocumentRef): Promise<Doc | string>
	close(): Promise<void>
}

export const DOWNLOAD_LIMIT = 25 * 1024 * 1024, PAGE_LIMIT = 30_000
const EXPANDED_LIMIT = 100 * 1024 * 1024

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

type Metadata = { id?: string; name?: string; size?: number; webUrl?: string; lastModifiedDateTime?: string; lastModifiedBy?: { user?: { displayName?: string } }; parentReference?: { driveId?: string } }
const tooLarge = (size: number) => `too large to open (${Math.ceil(size / 1024 / 1024)} MB)`

export class SharePointDocs implements Documents {
	private mcp: McpClient
	constructor(command: string[], mcp = new McpClient(command)) { this.mcp = mcp }
	async read(ref: DocumentRef): Promise<Doc | string> {
		let name = 'this document'
		try {
			if (ref.url) {
				const part = new URL(ref.url).pathname.split('/').at(-1) ?? ''
				if (/\.(docx|pptx|xlsx|pdf)$/i.test(part)) name = decodeURIComponent(part)
			}
			const tools = (await this.mcp.listAll()).tools
			const names = ref.url ? ['getFileOrFolderMetadataByUrl', 'getFileMetadataByUrl'] : ['getFileOrFolderMetadata', 'getFileMetadata']
			const info = names.map(name => tools.find(t => t.name === name)).find(t => t !== undefined)
			if (!info) return ref.url ? `Couldn't open ${name}: the document server cannot read its metadata` : "Couldn't open this document: the document server can't look it up by id"
			const props = (info.inputSchema?.properties ?? {}) as Record<string, unknown>
			const urlKey = ['fileOrFolderUrl', 'fileUrl', 'url'].find(key => key in props) ?? 'url'
			const idKey = ['fileOrFolderId', 'fileId'].find(key => key in props) ?? 'fileId'
			const args = ref.url ? { [urlKey]: ref.url } : { documentLibraryId: ref.driveId, [idKey]: ref.itemId }
			const hit = await this.mcp.call<Metadata>(info.name, args)
			name = hit.name ?? name
			if (typeof hit.size !== 'number' || !Number.isFinite(hit.size) || hit.size < 0) return `Couldn't open ${name}: its download size could not be checked`
			if (hit.size > DOWNLOAD_LIMIT) return `Couldn't open ${name}: ${tooLarge(hit.size)}`
			if (!/\.(docx|pptx|xlsx)$/i.test(name)) return `Couldn't open ${name}: not a Word, PowerPoint or Excel file`
			const driveId = hit.parentReference?.driveId ?? ref.driveId, itemId = hit.id ?? ref.itemId
			if (!driveId || !itemId) return `Couldn't open ${name}: the document server did not identify the file`
			const parts = await this.mcp.texts('readSmallBinaryFile', { documentLibraryId: driveId, fileId: itemId })
			let b64 = parts.join('').trim()
			if (b64.startsWith('{')) {
				const value: unknown = JSON.parse(b64)
				if (typeof value !== 'object' || !value) throw new Error('No file bytes')
				const data = value as Record<string, unknown>
				b64 = String(data.contentBytes ?? data.base64 ?? '')
			}
			if (b64.length > Math.ceil(DOWNLOAD_LIMIT / 3) * 4 + 1024) return `Couldn't open ${name}: too large to open (over 25 MB)`
			b64 = b64.replace(/\s/g, '')
			if (!b64 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new Error('No file bytes')
			const bytes = Buffer.from(b64, 'base64')
			if (bytes.length > DOWNLOAD_LIMIT) return `Couldn't open ${name}: ${tooLarge(bytes.length)}`
			return { name, modified: hit.lastModifiedDateTime ?? '', by: hit.lastModifiedBy?.user?.displayName ?? '', ...officeText(unzip(bytes)), ref: { driveId, itemId }, url: hit.webUrl ?? ref.url, tool: info.name, size: bytes.length }
		} catch (e) {
			const why = String(e)
			if (/\b40[13]\b|forbidden|access.?denied|unauthori[sz]ed/i.test(why)) return `Couldn't open ${name}: no access`
			if (/Too much content|maxOutputLength|buffer larger/i.test(why)) return `Couldn't open ${name}: too much content to open`
			if (/too large|\b413\b|exceeds? (?:the )?(?:maximum )?(?:binary |file )?size/i.test(why)) return `Couldn't open ${name}: too large to open (document server limit)`
			return `Couldn't open ${name}: the document could not be downloaded or decoded`
		}
	}
	close() { return this.mcp.close() }
}
