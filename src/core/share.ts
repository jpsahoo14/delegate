// Need to know by source audience (#36, PM rule pm-need-to-know-audience.md, PE 17:05). Pure: no store, no clock.
// A record anyone in the org could look up (an incident, a PR, a work item, a wiki page) may be repeated in a chat whose members are
// all from the org; a conversation, a restricted record, guests or customer details still wait for the owner.

// One record a run read through its system's tool, with the audience read from data (never assumed). id: "inc:900001", "pr:4200001",
// "wi:1234", "wiki:<project>:<path>". label: what the card shows ("Incident 900001").
export type SourceRecord = { id: string; label: string; audience: 'org' | 'restricted'; why?: string }

// Why a draft waits, structured; the words come from shareHoldText (PM wording). The first rule that applies decides.
//   marked: it uses a chat the owner marked private or off the record. guest: this chat has a guest (or its members can't be read)
//   and the reply uses a record or another conversation. restricted: a record that isn't org-visible. unread: a record link it cites
//   but never read. conversation: a chat someone here isn't in. customer: customer details from a record that this chat hasn't seen.
//   members: who is in a chat couldn't be read. reads: it searched chats and which ones it read is unknown.
export type ShareHold = { kind: 'marked' | 'guest' | 'restricted' | 'unread' | 'conversation' | 'customer' | 'members' | 'reads'; record?: string; chat?: string; who?: string; level?: 'private' | 'off' }

// A record a link points to, or undefined. Only the record number is shown (PM: no ids beyond it).
export function recordOfLink(link: string): { id: string; label: string } | undefined {
	// An incident portal link names the incident by number; a link that only looks like one still needs a read of that id to count.
	const incident = /^https:\/\/[^/\s]+\/.*?\bincidents?\/(?:details\/)?(\d{5,})/i.exec(link)
	if (incident) return { id: `inc:${incident[1]}`, label: `Incident ${incident[1]}` }
	const pr = /\/_git\/[^/?#]+\/pullrequest\/(\d+)/i.exec(link)
	if (pr) return { id: `pr:${pr[1]}`, label: `PR ${pr[1]}` }
	const wi = /\/_workitems\/edit\/(\d+)/i.exec(link)
	if (wi) return { id: `wi:${wi[1]}`, label: `Work item ${wi[1]}` }
	const wiki = /\/_wiki\/wikis\/[^?#]*?(?:[?&]pagePath=([^&#]+)|\/\d+\/([^/?#]+))/i.exec(link)
	if (wiki) { const page = decodeURIComponent(wiki[1] ?? wiki[2] ?? '').replace(/^\/+/, '').replace(/-/g, ' ').toLowerCase(); return { id: `wiki:${page}`, label: 'Wiki page' } }
	return undefined
}

// The incident's own audience fields, as the incident tool returns them (field names from the owner's real session logs, #36):
// org-visible only when isSecurityRisk, isRestricted and isSupportEngagement are all present and false. Anything else is Restricted.
export function incidentAudience(r: unknown): { audience: SourceRecord['audience']; why?: string } {
	const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
	const flags = ['isSecurityRisk', 'isRestricted', 'isSupportEngagement'] as const
	if (flags.some(k => typeof o[k] !== 'boolean')) return { audience: 'restricted', why: 'an incident whose audience I could not read' }
	const on = flags.find(k => o[k] === true)
	return on ? { audience: 'restricted', why: on === 'isSecurityRisk' ? 'a security incident' : on === 'isSupportEngagement' ? 'a customer support case' : 'a restricted incident' } : { audience: 'org' }
}

// Customer details found deterministically (rule 4): GUIDs (tenant and subscription ids) and email addresses. Names in free text are not
// detected; the card's source chips show the record.
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g
export const customerDetails = (text: string) => [...new Set([...(text.match(GUID) ?? []), ...(text.match(EMAIL) ?? [])].map(s => s.toLowerCase()))]

// The PM's hold line ("Why it waited"), one reason, the first that applies. A hold stored before #36 is its own words.
export function shareHoldText(h: ShareHold | string | undefined): string | undefined {
	if (!h) return undefined
	if (typeof h === 'string') return `Waiting for you: ${h.replace(/^./, c => c.toLowerCase()).replace(/[.\s]+$/, '')}.`
	const chat = h.chat ?? 'another chat'
	switch (h.kind) {
		case 'marked': return `Waiting for you: it uses ${chat}, which you marked ${h.level === 'off' ? 'off the record' : 'private'}.`
		case 'guest': return `Waiting for you: this chat has ${h.who ? `a guest (${h.who})` : 'a guest or someone from outside your org'}, and the reply uses ${h.record ?? chat}.`
		case 'restricted': return `Waiting for you: ${h.record ?? 'a record it used'} is ${h.who ?? 'restricted'}.`
		case 'unread': return `Waiting for you: it cites ${h.record ?? 'a record'} without having read it.`
		case 'conversation': return `Waiting for you: it uses ${chat}, and ${h.who ? `${h.who} ${/ and /.test(h.who) ? "aren't" : "isn't"} in it` : 'not everyone here is in it'}.`
		case 'customer': return `Waiting for you: it names the customer from ${h.record ?? 'a record'}.`
		case 'members': return `Waiting for you: it uses ${chat}, and I couldn't check who is in each chat.`
		case 'reads': return "Waiting for you: it searched your chats and I couldn't tell which ones it read."
	}
}
