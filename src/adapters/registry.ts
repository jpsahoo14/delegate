import type { Config } from '../core/types.ts'
import { DemoSource } from './demo.ts'
import { SharePointDocs, type Documents } from './docs.ts'
import { HostedImages, type Images } from './media.ts'
import { site } from '../core/site.ts'
import { TeamsHistory, type History } from './history.ts'
import type { Source } from './source.ts'
import { TeamsSource } from './source-teams.ts'
import { clientFor, toolServers } from './mcp-client.ts'

// One entry per chat system. A new one (Slack) is a Source and a History class plus a line here (docs/adapters.md).
type Adapter = { source(cfg: Config['source'], owner: string, root: string, ownerId?: string, log?: (entry: Record<string, unknown>) => void): Source; history?(cfg: Config): History; docs?(cfg: Config): Documents | undefined; images?(cfg: Config): Images | undefined }

// Documents come from the SharePoint server beside the Teams one, unless setup names another.
const beside = (s: Config['source'], server: string) => (s.command.at(-1) === 'teams' ? [...s.command.slice(0, -1), server] : undefined)
const docsCommand = (s: Config['source']) => s.docs ?? beside(s, 'sharepoint')

const ADAPTERS: Record<string, Adapter> = {
	teams: { source: (c, owner, _root, ownerId, log) => new TeamsSource(c, undefined, owner, ownerId, log), history: cfg => new TeamsHistory(cfg), docs: cfg => { const c = docsCommand(cfg.source); return c && new SharePointDocs(c) }, images: cfg => { const im = site().images, c = im && beside(cfg.source, im.server); return c && new HostedImages(c, im!.tool) } },
	demo: { source: (_c, _o, root) => new DemoSource(root) },
}

export const kindOf = (s: Config['source']): string => s.kind ?? (s.command[0] === 'demo' ? 'demo' : 'teams')

function adapter(s: Config['source']): Adapter {
	const a = ADAPTERS[kindOf(s)]
	if (!a) throw new Error(`No adapter for source "${kindOf(s)}". Known: ${Object.keys(ADAPTERS).join(', ')}.`)
	return a
}

export const sourceFor = (s: Config['source'], owner: string, root: string, ownerId?: string, log?: (entry: Record<string, unknown>) => void): Source => adapter(s).source(s, owner, root, ownerId, log)
export const historyFor = (cfg: Config): History | undefined => adapter(cfg.source).history?.(cfg)
export const docsFor = (cfg: Config): Documents | undefined => {
	const spec = toolServers(cfg).sharepoint
	if (!cfg.source.docs && spec?.command) return new SharePointDocs([], clientFor({ ...spec, command: spec.command }, 'sharepoint'))
	return adapter(cfg.source).docs?.(cfg)
}
export const imagesFor = (cfg: Config): Images | undefined => adapter(cfg.source).images?.(cfg)
