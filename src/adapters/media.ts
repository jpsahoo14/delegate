import { McpClient } from './mcp-client.ts'

export type Image = { data: string; type: string }
// An image pasted into a message, by the link the message carries. A string result says why it could not be read.
export interface Images {
	read(link: string): Promise<Image | string>
	close(): Promise<void>
}

// Only an image pasted into a Teams chat or channel message; a link in a message is data and must not reach other files.
const HOSTED = /^https:\/\/graph\.microsoft\.com\/v1\.0(\/(?:chats|teams)\/[^?#\s]+\/hostedContents\/[^/?#\s]+\/\$value)$/

export const hostedPath = (link: string) => HOSTED.exec(link)?.[1]

// Teams pastes images as Graph hosted content; a tool server the workplace names (site.json) reads them with the owner's own sign-in.
export class HostedImages implements Images {
	private mcp: McpClient
	private tool: string
	constructor(command: string[], tool = 'fetch_blob', mcp = new McpClient(command)) { this.mcp = mcp; this.tool = tool }
	async read(link: string): Promise<Image | string> {
		const path = hostedPath(link)
		if (!path) return 'Only images pasted into a Teams message can be opened.'
		const r = await this.mcp.call<{ base64Content?: string; contentType?: string; statusCode?: number }>(this.tool, { path })
		if (!r.base64Content) return `The image could not be downloaded (status ${r.statusCode ?? 'unknown'}).`
		return { data: r.base64Content, type: r.contentType ?? 'image/png' }
	}
	close() { return this.mcp.close() }
}
