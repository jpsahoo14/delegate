// Whether a tool of any MCP server reads or changes things (#17, reviews/advisers/engineer-generic-read-tools.md §1). Pure: no server
// names here. The first rule that decides wins; write evidence always beats read evidence, and unknown is never a read.

export type ToolInfo = {
	name: string; description?: string
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean }
	inputSchema?: { properties?: Record<string, unknown>; required?: string[] }
}
export type ToolClass = 'read' | 'write' | 'unknown'

// A tool's first verb that changes something. Other servers name their writes by verb: SendMessage, createFolder, do_action.
export const WRITE_VERBS = new Set(['send', 'create', 'update', 'delete', 'cancel', 'accept', 'tentatively', 'decline', 'forward', 'reply', 'move', 'rename', 'share', 'upload', 'set', 'add', 'remove', 'flag', 'post', 'reactivate', 'request', 'do', 'ingest', 'copy', 'resolve',
	'vote', 'approve', 'merge', 'complete', 'abandon', 'publish', 'execute', 'run', 'trigger', 'deploy', 'assign', 'invite', 'react', 'write', 'edit', 'patch', 'put', 'insert', 'archive', 'restore', 'submit', 'close', 'reopen', 'start', 'stop', 'kill', 'purge', 'drop', 'grant', 'revoke', 'mark', 'pin', 'unpin', 'lock', 'unlock'])
// "my" lists the caller's own things (a work-item tool's "my" action).
export const READ_VERBS = new Set(['get', 'list', 'search', 'find', 'read', 'fetch', 'query', 'describe', 'show', 'view', 'lookup', 'download', 'retrieve', 'count', 'my'])
const VETO = /\b(?:sends|creates|deletes|posts|approves|modifies|updates)\b/i

// "createFolder", "repo_pull_request", "list-items" as lowercase words.
export const wordsOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase().split(/[_\-\s.]+/).filter(Boolean)
// The verb of a name: its first word; or, for a tool with no action enum, the second after a one-word namespace
// ("core_list_projects", "repo_search_commits"). A tool with an action enum ("pipelines_run": get, list) is decided by it.
const verbsOf = (name: string, enumerated: boolean) => {
	const w = wordsOf(name), lead = READ_VERBS.has(w[0] ?? '') || WRITE_VERBS.has(w[0] ?? '') ? w[0] : undefined
	return { lead, ns: !lead && !enumerated ? w[1] : undefined, w }
}
const writeName = (name: string, enumerated = false) => {
	const n = name.toLowerCase(), { lead, ns, w } = verbsOf(name, enumerated)
	return /write$/.test(n) || /run_?pipeline/.test(n) || WRITE_VERBS.has(lead ?? '') || WRITE_VERBS.has(ns ?? '') || w[0] === 'kusto' && ['command', 'ingest'].includes(w[1] ?? '')
}
// The values of a required action/operation enum, if the tool has one.
function actions(t: ToolInfo): string[] | undefined {
	const props = t.inputSchema?.properties ?? {}
	for (const key of ['action', 'operation']) {
		const p = props[key] as { enum?: unknown[] } | undefined
		if (Array.isArray(p?.enum) && p.enum.every(v => typeof v === 'string')) return p.enum as string[]
	}
	return undefined
}

export function classifyTool(_server: string, t: ToolInfo): { cls: ToolClass; why: string } {
	const a = t.annotations
	if (a?.readOnlyHint === false || a?.destructiveHint === true) return { cls: 'write', why: 'its server marks it as one that changes things' }
	const acts = actions(t)
	if (writeName(t.name, !!acts)) return { cls: 'write', why: 'its name says it changes things' }
	const writeAct = acts?.find(v => writeName(v) || WRITE_VERBS.has(wordsOf(v)[0] ?? ''))
	if (writeAct) return { cls: 'write', why: `one of its actions (${writeAct}) changes things` }
	const first = (t.description ?? '').split(/(?<=[.!?])\s/)[0] ?? ''
	const read = (why: string) => (VETO.test(first) ? { cls: 'unknown' as const, why: 'its description says it changes things' } : { cls: 'read' as const, why })
	if (a?.readOnlyHint === true) return read('its server marks it read-only')
	const { lead, ns } = verbsOf(t.name, !!acts)
	if (READ_VERBS.has(lead ?? '') || READ_VERBS.has(ns ?? '')) return read('its name says it reads')
	if (acts?.length && acts.every(v => READ_VERBS.has(wordsOf(v)[0] ?? ''))) return read('every one of its actions reads')
	return { cls: 'unknown', why: "its name doesn't say whether it reads or changes things" }
}
// A tool known only by name (no listing yet): the same rules with nothing but the name.
export const classifyName = (server: string, tool: string) => classifyTool(server, { name: tool })
