// A tool server that won't start is the owner's own setup, shown in Settings › Tools (#24). It reaches the top of the page only when
// an open item needs it: a change waiting on one of its tools, or, for the Azure DevOps server, an item about a PR. The banner names
// those items, and goes when the server answers, is set aside, or nothing open needs it.
import type { Config, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { listable, readCatalog, remoteServers } from './catalog.ts'
import { prTarget } from './probe.ts'

export function needing(store: Store, server: string, workflows: Workflow[] = store.workflows()): string[] {
	return workflows.filter(w => w.state !== 'done' && ((w.effects ?? []).some(e => !e.done && !e.off && e.call?.tool.startsWith(`${server}-`))
		|| server === 'ado' && prTarget(store, w) !== undefined)).map(w => w.code)
}

const named = (codes: string[]) => codes.length <= 5 ? codes.join(', ') : `${codes.slice(0, 5).join(', ')} and ${codes.length - 5} more`

export function serverBanners(store: Store, cfg: Config) {
	const workflows = store.workflows(), down = new Map<string, string>()
	for (const name of [...listable(cfg).map(([n]) => n), ...remoteServers(cfg)]) {
		const c = readCatalog(name)
		if (!c?.error) continue
		const codes = needing(store, name, workflows)
		if (codes.length) down.set(`catalog:${name}`, `${name} can't start on ${store.machine}: ${c.error}. ${named(codes)} ${codes.length === 1 ? 'needs it and waits' : 'need it and wait'} until it does. Settings › Tools has Retry.`)
	}
	for (const key of Object.keys(store.health()).filter(k => k.startsWith('catalog:') && !down.has(k))) store.setHealth(key)
	for (const [key, text] of down) store.setHealth(key, text)
}
