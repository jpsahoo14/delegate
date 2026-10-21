import { inflateRawSync } from 'node:zlib'
import { McpClient } from './mcp-client.ts'

export type Doc = { name: string; modified: string; by: string; text: string }
// A shared document's full text, found by its file name or title. A string result says why it could not be read.
export interface Documents {
	read(name: string): Promise<Doc | string>
	close(): Promise<void>
}

// The files inside a zip (a .docx is one), read from its central directory.
export function unzip(buf: Buffer): Map<string, Buffer> {
	const out = new Map<string, Buffer>()
	let end = buf.length - 22
	while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--
	if (end < 0) throw new Error('Not a zip file')
	let at = buf.readUInt32LE(end + 16)
	for (let i = buf.readUInt16LE(end + 10); i > 0; i--) {
		const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20), n = buf.readUInt16LE(at + 28)
		const name = buf.toString('utf8', at + 46, at + 46 + n), local = buf.readUInt32LE(at + 42)
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
		const data = buf.subarray(start, start + size)
		out.set(name, method === 8 ? inflateRawSync(data) : data)
		at += 46 + n + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32)
	}
	return out
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
// Paragraphs become lines and tabs stay tabs; everything else in the Word XML is markup.
export function docxText(buf: Buffer): string {
	const xml = unzip(buf).get('word/document.xml')?.toString('utf8')
	if (!xml) throw new Error('No document text in this file')
	return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
		.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENT[e]).replace(/\n{3,}/g, '\n\n').trim()
}

type Hit = { id: string; name: string; lastModifiedDateTime?: string; lastModifiedBy?: { user?: { displayName?: string } }; parentReference?: { driveId?: string } }

export class SharePointDocs implements Documents {
	private mcp: McpClient
	constructor(command: string[], mcp = new McpClient(command)) { this.mcp = mcp }
	async read(name: string): Promise<Doc | string> {
		const found = await this.mcp.call<{ value?: Hit[] }>('findFileOrFolder', { searchQuery: name.replace(/\.docx$/i, '') })
		const hit = (found.value ?? []).filter(h => /\.docx$/i.test(h.name)).sort((a, b) => (b.lastModifiedDateTime ?? '').localeCompare(a.lastModifiedDateTime ?? ''))[0]
		if (!hit?.parentReference?.driveId) return `No Word document matches "${name}". Try the exact file name.`
		const [b64 = ''] = await this.mcp.texts('readSmallBinaryFile', { documentLibraryId: hit.parentReference.driveId, fileId: hit.id })
		return { name: hit.name, modified: hit.lastModifiedDateTime ?? '', by: hit.lastModifiedBy?.user?.displayName ?? '', text: docxText(Buffer.from(b64.trim(), 'base64')) }
	}
	close() { return this.mcp.close() }
}
