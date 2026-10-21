// Which experience draws the page (R-NEX-01). Pure: the address, the server's file for this machine, and this browser's cache.
import type { UiChoice, View } from './types.ts'

export type Ui = UiChoice['ui']
// #ui=new or #ui=classic in a link sets it, for beta invites.
export const hashUi = (hash: string): Ui | undefined => (/(?:^#|[&/])ui=(new|classic)\b/.exec(hash)?.[1] as Ui | undefined)
// The address wins; then the newer of the server's file and this browser's cache (a panel may be drawn from an older view);
// then classic. The snapshot is always classic.
export function pickUi(v: Pick<View, 'ui'> | undefined, hash: string, cached?: { ui: Ui; at?: string }, snap = false): Ui {
	if (snap) return 'classic'
	const h = hashUi(hash)
	if (h) return h
	const s = v?.ui
	if (s && cached && (cached.at ?? '') > (s.at ?? '')) return cached.ui
	return s?.ui ?? cached?.ui ?? 'classic'
}
// The classic addresses, opened in the new experience (design-spec/new-experience.md §2). Done and Settings stay; the rest is Now.
export function newRoute(h: string): string {
	const [base, sub] = h.split('/')
	if (base === 'now' || base === 'done' || base === 'settings' || base === 'knowledge') return h
	if (base === 'focus') return sub ? `now/${sub}` : 'now'
	if (base === 'ongoing' || base === 'watching' || base === 'automations') return sub === 'running' ? 'now/working' : 'now/waiting'
	if (base === 'running') return 'now/working'
	return 'now'
}
