import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

// What one workplace adds, kept out of this public code (owner, 10-21): a wrapper that starts the AI CLI, the Teams tool
// server's command, more tool servers with their read tools and changes, the tool that opens pasted images, and the words
// people use for an incident. Read from DELEGATE_SITE, else site.json in ~/.delegate, else site.json in the storage folder.
export type Site = {
	// AI CLI commands setup tries before the plain CLIs, such as a company wrapper. Each is a Copilot-style CLI.
	agents?: string[][]
	// The command that starts the owner's Teams tool server.
	teams?: string[]
	// More tool servers: read-only tools workers get, and changes Delegate may make after an ok ("tool" or "tool:action").
	read?: Record<string, string[]>
	write?: Record<string, string[]>
	// One line per change, for the AI's prompt and Settings: "server-tool": [short name, what it does].
	actions?: Record<string, [string, string]>
	// The tool server and tool that read an image pasted into a Teams message, by its Graph path.
	images?: { server: string; tool: string }
	// Words for an incident besides "incident", so "<word> 123456" is a link to it; the same for a build.
	incidentWords?: string[]
	buildWords?: string[]
	// Process names of the AI CLI or its wrapper, so a run is recognized as ours.
	processNames?: string[]
}

let pinned: Site | undefined
let cache: { key: string; site: Site } | undefined

// Tests pin a site; undefined goes back to reading the files.
export function useSite(s: Site | undefined) { pinned = s; cache = undefined }

function files(): string[] {
	const local = process.env.DELEGATE_LOCAL ?? join(homedir(), '.delegate')
	const out = process.env.DELEGATE_SITE ? [process.env.DELEGATE_SITE] : []
	out.push(join(local, 'site.json'))
	try {
		const l = JSON.parse(readFileSync(join(local, 'local.json'), 'utf8')) as { root?: string }
		const root = process.env.DELEGATE_ROOT ?? l.root
		if (root) out.push(join(isAbsolute(root) ? root : resolve(local, root), 'site.json'))
	} catch { if (process.env.DELEGATE_ROOT) out.push(join(process.env.DELEGATE_ROOT, 'site.json')) }
	return out
}

// The first site file that exists wins. A file that cannot be read is no site, never a crash.
export function site(): Site {
	if (pinned) return pinned
	// Tests never read the owner's real site.
	if (process.env.NODE_TEST_CONTEXT && !process.env.DELEGATE_SITE) return {}
	const f = files().find(f => existsSync(f))
	if (!f) return {}
	const key = `${f}:${statSync(f).mtimeMs}`
	if (cache?.key === key) return cache.site
	let s: Site = {}
	try { s = JSON.parse(readFileSync(f, 'utf8')) as Site } catch { s = {} }
	cache = { key, site: s }
	return s
}
