import { site } from './site.ts'

export type PrRef = { project: string; repo: string; id: number; remote?: string; url?: string }

// Typed links a message names; numbers alone are never links (review part 2 #2).
export function linksIn(text: string): string[] {
	const out = new Set<string>()
	for (const m of text.matchAll(/\b(?:pull request|PR)\s*#?\s*(\d{4,})/gi)) out.add(`pr:${m[1]}`)
	for (const m of text.matchAll(/https?:\/\/[^\s<>]+\/pullrequest\/(\d+)/gi)) out.add(`pr:${m[1]}`)
	const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const builds = ['build', 'run', 'pipeline run', ...(site().buildWords ?? [])].map(esc).join('|')
	for (const m of text.matchAll(new RegExp(`\\b(?:${builds})\\s*#?\\s*(\\d{6,})\\b`, 'gi'))) out.add(`build:${m[1]}`)
	const words = ['incident', ...(site().incidentWords ?? [])].map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
	for (const m of text.matchAll(new RegExp(`\\b(?:${words})\\s*#?\\s*(\\d{6,})`, 'gi'))) out.add(`incident:${m[1]}`)
	for (const m of text.matchAll(/\b(?:work ?item|bug|task)\s*#?\s*(\d{6,})/gi)) out.add(`workItem:${m[1]}`)
	return [...out]
}

// Only a number written as a pull request names one ("PR 12", "pull request #12", ".../pullrequest/12"); tags, times and counts never do.
export function prMentions(text: string) { return text.matchAll(/\b(?:PR|pull\s+request|pullrequest\/)\s*#?\s*(\d+)\b|(?:^|\s)#(\d{3,})\b/gi) }
export const prNumbersIn = (text: string) => [...prMentions(text)].map(m => Number(m[1] ?? m[2]))

export function isNonAdoPrLink(url: string): boolean {
	if (!URL.canParse(url)) return false
	const link = new URL(url), host = link.hostname.toLowerCase()
	return /^https?:$/.test(link.protocol) && host !== 'dev.azure.com' && !host.endsWith('.visualstudio.com') &&
		/\/(?:pull|pull-requests|merge_requests)\/[1-9]\d*(?:\/|$)/i.test(link.pathname)
}

export function adoPrNumber(url: string): number | undefined {
	if (!URL.canParse(url)) return undefined
	const link = new URL(url), host = link.hostname.toLowerCase()
	if (!/^https?:$/.test(link.protocol) || host !== 'dev.azure.com' && !host.endsWith('.visualstudio.com')) return undefined
	return Number(/\/pullrequest\/(\d+)(?:\/|$)/i.exec(link.pathname)?.[1]) || undefined
}
