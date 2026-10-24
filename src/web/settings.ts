import { DEFAULT_POLICY, signatureOf, signsApproved } from '../core/policy.ts'
import { DEFAULT_POLL, validTz } from '../core/schedule.ts'
import { LEVEL_SAYS } from '../core/levels.ts'
import { WRITE_DEFAULTS, changeLine, changeName, offerable, toolOf } from '../core/effects.ts'
import { site } from '../core/site.ts'
import { toolServers } from '../adapters/mcp-client.ts'
import { NEVER_RING, parseTargets, targetsText } from '../core/deploy.ts'
import type { BuildProbe } from '../runner/probe.ts'
import { remoteOf } from '../runner/repos.ts'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Config, DeployTarget, Rule } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { experienceOf, here } from '../store/state.ts'
import { CMD, NAME } from '../brand.ts'
import { UPDATE_EVERY_MIN } from '../os/autoupdate.ts'
import { nameFor, runLines, runsOf } from '../core/runinfo.ts'
import { habitUndoable, undoMs } from '../runner/habits.ts'
import { cachedCatalogs, denied, ignoredServers, listable, readCatalog, remoteServers, serverSource, workerTools } from '../runner/catalog.ts'
import { HOST_IDLE_MIN, HOST_MEMORY_MB, HOST_WORK_IDLE_MIN, hostOff } from '../host/locate.ts'
import { hostFile } from '../host/host.ts'
import { hostDisabledUntil, hostFaultLimit } from '../host/client.ts'

// The settings the page can change, in one table: how each is shown, read, checked, and saved (B13).
// Each saves to the shared config (or profile.md) in the storage folder, so every machine and the next cycle use it.
type Kind = 'text' | 'line' | 'list' | 'number' | 'choice' | 'bool' | 'time' | 'switch'
// Settings are grouped by what the owner is trying to do (design-spec/settings-v2.md); advanced rows sit under More in the last one.
export type Section = 'learned' | 'you' | 'replies' | 'timing' | 'system'
type Spec = {
	key: string; label: string; help: string | ((cfg: Config) => string); kind: Kind; section: Section; options?: { value: string; label: string }[]; advanced?: true
	// A read tool's server, shown under Tools your drafts may read; '*' for the whole list.
	group?: string
	read: (cfg: Config, store: Store) => string
	parse: (raw: string, store: Store) => Parsed
	// A setting that must be checked against another system before it is saved (owned work: a deploy target).
	check?: (raw: string, store: Store, deps: SaveDeps) => Promise<Parsed>
	// What a save says, when the label alone does not (a switch says whether it is on).
	saved?: (raw: string) => string
}
type Parsed = { ok: true; save: (cfg: Config, store: Store) => Config } | { ok: false; why: string }
export type SaveDeps = { probe?: BuildProbe }

const set = (patch: Partial<Config>) => ({ ok: true as const, save: (cfg: Config) => ({ ...cfg, ...patch }) })
const list = (raw: string) => raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
const num = (raw: string, min: number, max: number, key: keyof Config) => {
	const n = Number(raw)
	return Number.isInteger(n) && n >= min && n <= max ? set({ [key]: n } as Partial<Config>) : { ok: false as const, why: `Give a whole number from ${min} to ${max}.` }
}

// A whole number in range, saved by a function of the config, for the settings that live inside an object (policy, poll).
const numTo = (raw: string, min: number, max: number, save: (cfg: Config, n: number) => Config) => {
	const n = Number(raw.trim())
	return Number.isInteger(n) && n >= min && n <= max ? { ok: true as const, save: (cfg: Config) => save(cfg, n) } : { ok: false as const, why: `Give a whole number from ${min} to ${max}.` }
}
const pol = (cfg: Config) => ({ ...DEFAULT_POLICY, ...cfg.policy })
// A number of minutes in half-minute steps, such as 0.5 or 2.
const halfTo = (raw: string, min: number, max: number, save: (cfg: Config, n: number) => Config) => {
	const n = Number(raw.trim().replace(',', '.'))
	return Number.isFinite(n) && Number.isInteger(n * 2) && n >= min && n <= max ? { ok: true as const, save: (cfg: Config) => save(cfg, n) } : { ok: false as const, why: `Give a number of minutes from ${min} to ${max}, in steps of 0.5.` }
}
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const EVERY: [number, string][] = [[10, 'Every 10 minutes'], [60, 'Every hour'], [UPDATE_EVERY_MIN, 'Once a day']]

export const SETTINGS: Spec[] = [
	{ key: 'profile', label: 'About you', help: `A few lines ${NAME} reads before every draft: what you do and how you write.`, kind: 'text', section: 'you',
		read: (_c, s) => (existsSync(join(s.root, 'profile.md')) ? readFileSync(join(s.root, 'profile.md'), 'utf8') : ''),
		parse: raw => (raw.trim().length < 20 ? { ok: false, why: 'Write at least a sentence about yourself.' } : { ok: true, save: (cfg, s) => { writeFileSync(join(s.root, 'profile.md'), raw.trim() + '\n'); return cfg } }) },
	{ key: 'aliases', label: 'Names people call you', help: 'Besides your first name, such as initials. A group message that uses one is for you.', kind: 'list', section: 'you',
		read: c => (c.aliases ?? []).join(', '), parse: raw => set({ aliases: list(raw).filter(a => a.length >= 2) }) },
	// Reviewer groups the owner confirmed are his (queue-new #7C): a PR reviewed by one of them is his to review and vote on.
	{ key: 'reviewerGroups', label: 'Your reviewer groups', help: `Azure DevOps reviewer groups you are in, such as [Acme]\\Web Reviewers or just Web Reviewers. ${NAME} reviews and votes on a PR one of them reviews. It asks on the card about a group it does not know.`, kind: 'list', section: 'you',
		read: c => (c.owner.reviewerGroups ?? []).join(', '),
		parse: raw => { const groups = list(raw); return { ok: true, save: c => ({ ...c, owner: { ...c.owner, reviewerGroups: groups.length ? groups : undefined, notReviewerGroups: c.owner.notReviewerGroups?.filter(g => !groups.some(x => x.toLowerCase() === g.toLowerCase())) } }) } } },
	{ key: 'knowledge', label: 'Notes folders', help: 'Folders of your notes, relative to the storage folder or absolute. Drafts search them.', kind: 'list', section: 'you',
		read: c => (c.knowledge ?? []).join(', '),
		parse: (raw, s) => { const fs = list(raw), missing = fs.filter(f => !existsSync(here(s.root, f))); return missing.length ? { ok: false, why: `Not found on this machine: ${missing.join(', ')}` } : set({ knowledge: fs }) } },
	// Owned work (eng-owned-work.md §a): the repos bound what may be changed; each machine finds its own clones, never synced.
	{ key: 'repos', label: 'Repos you work in', help: 'A name and its remote each, such as Acme-Web https://dev.azure.com/acme/Web/_git/Acme-Web. Each machine finds its own copy.', kind: 'list', section: 'you',
		read: c => (c.repos ?? []).map(r => `${r.name} ${r.remote}`).join(', '),
		parse: raw => { const out: { name: string; remote: string }[] = []; for (const part of list(raw)) { const words = part.split(/\s+/), url = words.at(-1)!, r = remoteOf(url); if (!r) return { ok: false, why: `Not a repo remote: ${url}. Give its clone or web link.` }; out.push({ name: words.slice(0, -1).join(' ') || r.split('/').at(-1)!, remote: url }) } return set({ repos: out }) } },
	// An authority boundary, by pipeline ID: a deploy to any other is a to-do; int and production never (owned work).
	{ key: 'deployTo', label: `Where ${NAME} may deploy`, kind: 'list', section: 'you',
		help: c => `Test rings, each with its project and pipeline ID, such as TEST3 Globex/3003, and any parameters a run may carry (Debug=False). ${NAME} deploys a PR's build only to these, each time after your ok; never int or production. Each is checked in Azure DevOps when you save.${c.deploy?.proposed?.length ? ` Proposed from your repo: ${c.deploy.proposed.map(t => `${targetsText([t])} (${t.real ? `"${t.real.name}"${t.project ? ` in ${t.project}` : ''}` : 'not checked in Azure DevOps yet'})`).join(', ')}. Save the ones you allow.` : ''}`,
		read: c => targetsText(c.deploy?.allowed),
		parse: () => ({ ok: false, why: 'Each pipeline is checked in Azure DevOps before it is saved.' }),
		check: (raw, s, deps) => checkTargets(raw, s, deps) },
	{ key: 'summaryAt', label: 'Daily summary', help: 'When the day\'s summary arrives in your self-chat, or off.', kind: 'time', section: 'timing',
		read: c => c.summaryAt ?? '18:00', parse: raw => (/^(off|([01]\d|2[0-3]):[0-5]\d)$/.test(raw.trim()) ? set({ summaryAt: raw.trim() }) : { ok: false, why: 'Give a time such as 18:00, or off.' }) },
	{ key: 'quietHours', label: 'Follow-ups join the item for', help: 'Hours. A message within this time continues the same item.', kind: 'number', section: 'timing',
		read: c => String(c.quietHours ?? 48), parse: raw => num(raw, 1, 336, 'quietHours') },
	{ key: 'dailyRuns', label: 'AI runs per day, at most', help: 'Counted on this machine\'s local day.', kind: 'number', section: 'system',
		read: c => String(c.dailyRuns ?? 200), parse: raw => num(raw, 1, 2000, 'dailyRuns') },
	{ key: 'autoUpdate', label: 'Updates', help: 'What a git install follows by itself.', kind: 'choice', section: 'system',
		options: [{ value: 'default', label: 'Releases (or every change for the dogfood bundle)' }, { value: 'release', label: 'Releases only' }, { value: 'main', label: 'Every change' }, { value: 'off', label: `Off: run "${CMD} update" yourself` }],
		read: c => (c.autoUpdate === false ? 'off' : c.autoUpdate === 'main' || c.autoUpdate === 'release' ? c.autoUpdate : 'default'),
		parse: raw => (raw === 'off' ? set({ autoUpdate: false }) : raw === 'main' || raw === 'release' ? set({ autoUpdate: raw }) : raw === 'default' ? set({ autoUpdate: undefined }) : { ok: false, why: 'Pick one of the choices.' }) },
	{ key: 'updateEvery', label: 'Look for updates', help: 'How often it checks for a new version. Check for updates on Home takes one at once.', kind: 'choice', section: 'system',
		options: EVERY.map(([v, label]) => ({ value: String(v), label })),
		read: c => String(EVERY.find(([v]) => v === c.updateEveryMin)?.[0] ?? UPDATE_EVERY_MIN),
		parse: raw => (EVERY.some(([v]) => String(v) === raw) ? set({ updateEveryMin: Number(raw) === UPDATE_EVERY_MIN ? undefined : Number(raw) }) : { ok: false, why: 'Pick one of the choices.' }) },
	{ key: 'signature', label: 'Signature', help: `The line under replies ${NAME} wrote. {first} becomes your first name. Automatic replies always carry it.`, kind: 'text', section: 'you',
		read: c => signatureOf(c), parse: raw => (raw.trim().length < 3 || raw.trim().length > 80 ? { ok: false, why: 'Write 3 to 80 characters, such as "Responded via AI".' } : { ok: true, save: c => raw.trim() === signatureOf(c) ? c : { ...c, signature: raw.trim(), signApproved: signsApproved(c) } }) },
	{ key: 'signApproved', label: 'Sign replies you approve', help: 'On: replies the AI wrote carry the signature even when you approved them. Only this switch changes that choice; saving signature text does not. Words you typed or edited never do.', kind: 'bool', section: 'you',
		read: c => String(signsApproved(c)), parse: raw => set({ signApproved: raw === 'true' ? true : raw === 'false' ? false : undefined }) },
	{ key: 'noticeHabits', label: 'Notice my habits', help: 'On: when you handle the same kind of message the same way again and again, it suggests a standing instruction. Nothing changes until you turn one on.', kind: 'bool', section: 'learned',
		read: c => String(c.noticeHabits !== false), parse: raw => set({ noticeHabits: raw === 'false' ? false : undefined }) },
	{ key: 'reviewLearning', label: 'Approve learned facts first', help: 'Off: facts are saved at once, with an undo. On: each waits under To learn.', kind: 'bool', section: 'learned',
		read: c => String(!!c.reviewLearning), parse: raw => set({ reviewLearning: raw === 'true' || undefined }) },
	// Advanced: folded on the page. Safety checks (guests, private sources, commitments) are not settings.
	{ key: 'delayMin', label: 'Wait before an automatic reply goes out', help: 'Minutes. You can stop it in this time.', kind: 'number', section: 'replies',
		read: c => String(pol(c).delayMin), parse: raw => numTo(raw, 0, 120, (c, n) => ({ ...c, policy: { ...pol(c), delayMin: n } })) },
	{ key: 'undoMin', label: 'Undo window after an automatic reply', help: 'Minutes.', kind: 'number', section: 'replies',
		read: c => String(pol(c).undoMin), parse: raw => numTo(raw, 1, 60, (c, n) => ({ ...c, policy: { ...pol(c), undoMin: n } })) },
	{ key: 'maxAutoPerChatHour', label: 'Automatic replies per chat per hour, at most', help: 'More wait for you.', kind: 'number', section: 'replies',
		read: c => String(pol(c).maxAutoPerChatHour), parse: raw => numTo(raw, 1, 20, (c, n) => ({ ...c, policy: { ...pol(c), maxAutoPerChatHour: n } })) },
	{ key: 'quiet', label: 'No reminders between', help: `${NAME} does not post reminders to your self-chat in these hours. Such as 20:00-08:00.`, kind: 'line', section: 'timing',
		read: c => `${c.quiet?.from ?? '20:00'}-${c.quiet?.to ?? '08:00'}`,
		parse: raw => { const [from, to] = raw.trim().split(/\s*-\s*/); return HHMM.test(from ?? '') && HHMM.test(to ?? '') ? set({ quiet: { from, to } }) : { ok: false, why: 'Give two times, such as 20:00-08:00.' } } },
	{ key: 'tz', label: 'Your time zone', help: 'For work hours (Monday to Friday, 9:00 to 18:00) and the times in notices. Such as Asia/Kolkata.', kind: 'line', section: 'timing',
		read: c => c.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone, parse: raw => (validTz(raw.trim()) ? set({ tz: raw.trim() }) : { ok: false, why: 'Give a time zone name, such as Asia/Kolkata or Europe/London.' }) },
	{ key: 'pollIdle', label: 'Check Teams every', help: 'Minutes, when nothing is happening; during work hours at least every 5. Each check is a quick Teams read, no AI.', kind: 'number', section: 'system', advanced: true,
		read: c => String((c.poll ?? DEFAULT_POLL).idleMin), parse: raw => numTo(raw, 1, 60, (c, n) => ({ ...c, poll: { ...(c.poll ?? DEFAULT_POLL), idleMin: n } })) },
	// The after-activity pair (owner, 10-23): checking is the owner's to set, never hard-coded.
	{ key: 'pollFast', label: 'After activity, check every', help: 'Minutes (0.5 to 5), after you or someone in your chats did something. Each check is a quick Teams read, no AI. Shorter means new messages appear sooner but more Teams reads.', kind: 'number', section: 'system', advanced: true,
		read: c => String((c.poll ?? DEFAULT_POLL).fastMin), parse: raw => halfTo(raw, 0.5, 5, (c, n) => ({ ...c, poll: { ...(c.poll ?? DEFAULT_POLL), fastMin: n } })) },
	{ key: 'pollFastFor', label: 'Keep checking that often for', help: 'Minutes (1 to 30) after the last activity, then back to "Check Teams every".', kind: 'number', section: 'system', advanced: true,
		read: c => String((c.poll ?? DEFAULT_POLL).fastForMin), parse: raw => numTo(raw, 1, 30, (c, n) => ({ ...c, poll: { ...(c.poll ?? DEFAULT_POLL), fastForMin: n } })) },
	{ key: 'maxParallel', label: 'AI runs at once', help: 'Drafts and jobs running side by side on the runner machine.', kind: 'number', section: 'system', advanced: true,
		read: c => String(c.maxParallel ?? 3), parse: raw => num(raw, 1, 6, 'maxParallel') },
	// How long the resident AI host waits for the next run during work hours (#25); outside them it stops sooner.
	{ key: 'hostIdleMin', label: 'Keep the AI host ready for', help: `Minutes after its last run, during work hours (Monday to Friday, 9:00 to 18:00), so replies start in seconds. Outside work hours it stops after ${HOST_IDLE_MIN} minutes, and quiet hours stop it. It uses about ${HOST_MEMORY_MB} MB of memory while it waits.`, kind: 'number', section: 'system', advanced: true,
		read: c => String(c.agent.hostIdleMin ?? HOST_WORK_IDLE_MIN), parse: raw => numTo(raw, HOST_IDLE_MIN, 1440, (c, n) => ({ ...c, agent: { ...c.agent, hostIdleMin: n } })) },
	{ key: 'retentionDays', label: 'Keep message text for', help: 'Days. After that, items keep codes, people, and times only.', kind: 'number', section: 'system', advanced: true,
		read: c => String(c.retentionDays ?? 30), parse: raw => num(raw, 7, 365, 'retentionDays') },
	{ key: 'followUpHours', label: 'Your unanswered asks show under Waiting on others after', help: 'Hours.', kind: 'number', section: 'timing',
		read: c => String(c.followUpHours ?? 24), parse: raw => num(raw, 1, 168, 'followUpHours') },
	{ key: 'model', label: 'AI model', help: 'Empty uses your AI CLI\'s default. Otherwise a model name your CLI accepts.', kind: 'line', section: 'system', advanced: true,
		read: c => c.agent.model ?? '', parse: raw => (/^[\w.:-]{0,60}$/.test(raw.trim()) ? { ok: true, save: (c: Config) => ({ ...c, agent: { ...c.agent, model: raw.trim() || undefined } }) } : { ok: false, why: 'Letters, digits, dots, and dashes only.' }) },
	{ key: 'showDetails', label: 'Show details', help: 'For when something looks wrong: each card shows the rule, the reason, and ids, and Settings shows the runner and the recent log.', kind: 'bool', section: 'system', advanced: true,
		read: c => String(!!c.showDetails), parse: raw => set({ showDetails: raw === 'true' || undefined }) },
]

// The changes Delegate may propose, one switch each (R-HIL-21): setup's defaults and the workplace's (site.json write and actions),
// for the tool servers the owner has, and any the owner already allows. Never abandon, complete, merge, bypass, delete, or a
// pipeline write: deploys follow "Where Delegate may deploy". A switch only edits the list, never an item; an ok on a change it
// no longer allows is refused (runner/jobs.ts approveEffects), and so is one approved but not made yet (runner/change.ts).
export function changeChoices(cfg: Config): string[] {
	const have = new Set(Object.keys(toolServers(cfg))), s = site()
	const byServer = [...new Set([...Object.keys(WRITE_DEFAULTS), ...Object.keys(s.write ?? {})])].flatMap(n => [...(WRITE_DEFAULTS[n] ?? []), ...(s.write?.[n] ?? [])].map(t => `${n}-${t}`))
	const own = (e: string) => [...have].some(n => e.startsWith(`${n}-`))
	return [...new Set([...byServer, ...Object.keys(s.actions ?? {})].filter(own).concat(cfg.agent.effectTools ?? []))].filter(offerable)
}
const changeSpecs = (cfg: Config): Spec[] => changeChoices(cfg).map(entry => ({
	key: `change:${entry}`, label: changeName(entry), help: changeLine(entry), kind: 'switch', section: 'you',
	read: c => String((c.agent.effectTools ?? []).includes(entry)),
	saved: raw => raw === 'true' ? `${changeName(entry)} is on: ${NAME} may propose it, each time for your ok.` : `${changeName(entry)} is off: new drafts won't propose it, and an ok on one already shown is refused.`,
	parse: (raw, store) => {
		if (raw !== 'true' && raw !== 'false') return { ok: false, why: 'Turn it on or off.' }
		const cfg = store.config(), on = raw === 'true'
		// A read tool is never also a write tool: workers would hold it before the owner's ok (setup's rule).
		if (on && workerTools(cfg, 'job').includes(toolOf(entry))) return { ok: false, why: `${toolOf(entry)} is one of the read tools workers hold, so it cannot also be a change. Remove it from the read tools in setup first.` }
		return { ok: true, save: c => ({ ...c, agent: { ...c.agent, effectTools: on ? [...new Set([...(c.agent.effectTools ?? []), entry])] : (c.agent.effectTools ?? []).filter(x => x !== entry) } }) }
	},
}))
// Every setting the page can change: the table, with the change switches after "Where Delegate may deploy", then the read tools.
const specsOf = (cfg: Config): Spec[] => { const i = SETTINGS.findIndex(x => x.key === 'deployTo') + 1; return [...SETTINGS.slice(0, i), ...changeSpecs(cfg), ...toolSpecs(cfg), ...SETTINGS.slice(i)] }

// Tools your drafts may read (#17, design §5), from each server's catalog: a switch per read (on unless denied), and each tool the
// classifier can't place with Allow as read. A write is never offered. Before the tools migration there is no list to switch.
const withDeny = (c: Config, deny: string[]) => ({ ...c, agent: { ...c.agent, deny: [...new Set(deny)] } })
function toolSpecs(cfg: Config): Spec[] {
	if (!cfg.agent.deny) return []
	const out: Spec[] = []
	for (const [server, cat] of Object.entries(cachedCatalogs(cfg))) {
		if (cfg.agent.pendingTrim?.includes(server)) continue
		for (const t of cat.tools.filter(x => x.cls === 'read')) {
			const name = `${server}-${t.name}`
			out.push({ key: `read:${name}`, label: t.name, help: t.description ?? '', kind: 'switch', section: 'you', group: server,
				read: c => String(!denied(c.agent.deny ?? [], name)),
				saved: raw => raw === 'true' ? `${t.name} is on: drafts may read with it.` : `${t.name} is off: drafts won't be given it.`,
				parse: raw => raw === 'true' || raw === 'false' ? { ok: true, save: c => withDeny(c, raw === 'true' ? (c.agent.deny ?? []).filter(d => d !== name) : [...(c.agent.deny ?? []), name]) } : { ok: false, why: 'Turn it on or off.' } })
		}
		for (const t of cat.tools.filter(x => x.cls === 'unknown')) {
			const name = `${server}-${t.name}`
			out.push({ key: `allow:${name}`, label: t.name, help: c => `${t.description ? `${t.description} ` : ''}${(c.agent.allowRead ?? []).includes(name) ? 'You allowed it as a read: drafts call it without asking you.' : `Not used: ${t.why}.`}`, kind: 'switch', section: 'you', group: server,
				read: c => String((c.agent.allowRead ?? []).includes(name)),
				saved: raw => raw === 'true' ? `${t.name} is allowed: drafts may call it without asking you.` : `${t.name} is not used any more.`,
				parse: raw => {
					if (raw !== 'true' && raw !== 'false') return { ok: false, why: 'Allow it or not.' }
					// Checked again at save: a server may have changed the tool since the page was drawn.
					const now = readCatalog(server)?.tools.find(x => x.name === t.name)
					if (raw === 'true' && now?.cls === 'write') return { ok: false, why: `${t.name} changes things (${now.why}), so it is never a read tool.` }
					const allow = (c: Config) => raw === 'true' ? [...new Set([...(c.agent.allowRead ?? []), name])] : (c.agent.allowRead ?? []).filter(x => x !== name)
					return { ok: true, save: c => ({ ...c, agent: { ...c.agent, allowRead: allow(c).length ? allow(c) : undefined, ...(raw === 'true' ? { deny: (c.agent.deny ?? []).filter(d => d !== name) } : {}) } }) }
				} })
		}
	}
	if (cfg.agent.toolsTrimmed || cfg.agent.deny.length) out.push({ key: 'toolsAll', label: 'Allow all read tools', help: 'Turns every read tool on again, on every server, including ones a server adds later.', kind: 'switch', section: 'you', group: '*',
		read: () => 'false', saved: () => 'Drafts may read with every read tool again.',
		parse: raw => raw === 'true' ? { ok: true, save: c => { const { toolsTrimmed: _t, ...agent } = c.agent; return { ...c, agent: { ...agent, deny: [] } } } } : { ok: false, why: 'Nothing to undo: turn single tools off instead.' } })
	return out
}
// Per server: how many reads drafts get, and what the owner should know (it can't be listed; a switched name it no longer offers).
// none: what to say in place of a count when drafts get none of its tools. actionIds: Retry, Don't use, or Use again (#24).
export type ToolsView = { servers: { name: string; reads: number; on: number; unknown: number; line?: string; none?: string; gone: string[]; actionIds?: string[] }[] }
export const toolServerKey = (server: string) => `tool-server:${server}`
export function toolsView(cfg: Config, where: { machine: string; root: string } = { machine: 'this machine', root: '' }): ToolsView | undefined {
	if (!cfg.agent.deny) return undefined
	const cats = cachedCatalogs(cfg), names = new Set(Object.keys(cats)), specs = toolServers(cfg)
	const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(cfg.tz && validTz(cfg.tz) ? { timeZone: cfg.tz } : {}) }) : '')
	const ids = (name: string, ...kinds: string[]) => kinds.map(k => `${toolServerKey(name)}/${k}`)
	const servers = [...listable(cfg).map(([name]) => name), ...remoteServers(cfg)].map(name => {
		const c = cats[name], reads = c?.tools.filter(t => t.cls === 'read') ?? [], offered = new Set(c?.tools.map(t => `${name}-${t.name}`) ?? [])
		const gone = c?.tools.length ? [...(cfg.agent.deny ?? []), ...(cfg.agent.allowRead ?? [])].filter(t => t.startsWith(`${name}-`) && !t.endsWith('-*') && !offered.has(t)) : []
		// A server that won't start is the owner's own setup: one row naming where it is set up and why, never a banner (#24).
		const again = c?.retryNow ? ` ${NAME} tries it again at the next check.` : c?.cause === 'missing' ? ' It is tried again when that file changes, or when you press Retry.' : c?.retryAt ? ` ${NAME} tries again ${when(c.retryAt)}.` : ''
		const pending = cfg.agent.pendingTrim?.includes(name), remote = !specs[name]?.command
		const where_ = `${name} (in ${serverSource(cfg, name, where.root).shown})`
		// A remote server is listed through the AI CLI, which holds its sign-in (#23); with no AI host to ask, that is said plainly.
		const line = pending ? `Waiting for ${name} to answer, to keep your shorter list; until then drafts use your old list for it.`
			: remote && !c ? `${NAME} can't list ${name}'s tools itself: it's a remote server the AI CLI signs in to. Its tools aren't offered to drafts.`
			: !c?.tools.length ? (c?.error ? `${where_} can't ${remote ? 'be reached' : 'start'} on ${where.machine}: ${c.error}. ${NAME} works without it.${again}` : `Couldn't list ${name}'s tools yet; drafts can't use them until it answers.`)
			: c.error ? `${where_} can't ${remote ? 'be reached' : 'start'} on ${where.machine} since ${when(c.errorAt)}: ${c.error}. Drafts use its list from ${when(c.at)}.${again}` : undefined
		return { name, reads: reads.length, on: reads.filter(t => !denied(cfg.agent.deny ?? [], `${name}-${t.name}`)).length, unknown: c?.tools.filter(t => t.cls === 'unknown').length ?? 0, ...(line ? { line } : {}), ...(!pending && !c?.tools.length && (remote || c?.error) ? { none: "its tools aren't offered" } : {}), gone: names.has(name) ? gone : [],
			...(c?.error && !pending ? { actionIds: ids(name, ...(c.retryNow ? [] : ['server-retry']), 'server-ignore') } : {}) }
	})
	// Set aside on this machine: said once, with the way back.
	const ignored = ignoredServers().filter(name => specs[name]).map(name => ({ name, reads: 0, on: 0, unknown: 0, line: `${name} (in ${serverSource(cfg, name, where.root).shown}) isn't used on ${where.machine}: you chose Don't use this server. ${NAME} doesn't start it or offer its tools here.`, none: 'not used here', gone: [], actionIds: ids(name, 'server-use') }))
	return { servers: [...servers, ...ignored] }
}

export type SettingRow = { key: string; label: string; help: string; kind: Kind; section: Section; value: string; options?: { value: string; label: string }[]; advanced?: true; group?: string }
export type ReadOnlyRow = { label: string; value: string; how: string }

// What Delegate knows about the owner and acts on, in one place (R-HAB-03): standing instructions, said or learned, and suggestions.
export type AboutView = {
	profile: string
	rules: { text: string; who: string; learned?: string; held: boolean; code?: string; style?: string; undoUntil?: string }[]
	suggestions: { code: string; text: string; does: string; evidence: string; links?: string[] }[]
	chats: { name: string; says: string }[]
}
// Who a rule covers, by name, so a rule that says "approved accounts" shows which ones (dogfood 10-20).
export function whoOf(r: Rule): string {
	const names = (r.who.accounts ?? []).map(a => a.name).filter(Boolean)
	if (!names.length) return r.who.group ? `Anyone in ${r.who.group === 'team' ? 'your team' : r.who.group === 'org' ? 'your organization' : 'other companies'}` : ''
	return names.length <= 8 ? names.join(', ') : `${names.slice(0, 8).join(', ')}, and ${names.length - 8} more`
}

export function aboutView(store: Store): AboutView {
	const habits = store.habits(), held = store.heldRules(), cfg = store.config()
	return {
		profile: existsSync(join(store.root, 'profile.md')) ? readFileSync(join(store.root, 'profile.md'), 'utf8').trim() : '',
		rules: store.rules().map(r => {
			const h = r.learned ? habits.find(x => x.key === r.learned!.key) : undefined
			return { text: r.text.replace(/^Learned: /, ''), who: whoOf(r), ...(r.learned ? { learned: `Learned ${r.learned.at.slice(0, 10)} from ${r.learned.evidence}` } : {}), held: !!held[r.id], ...(h ? { code: h.code } : {}),
				...(r.style ? { style: r.style } : {}), ...(h && habitUndoable(store, h) ? { undoUntil: new Date(Date.parse(h.at) + undoMs(store)).toISOString() } : {}) }
		}),
		suggestions: habits.filter(h => h.state === 'suggested').map(h => ({ code: h.code, text: h.text, does: h.does, evidence: h.kind === 'style' ? `${h.evidence.count} edited replies on ${h.evidence.days} day${h.evidence.days === 1 ? '' : 's'}, out of ${h.evidence.total} edited in that time${h.evidence.links.length ? ` (${h.evidence.links.length} linked below)` : ''}` : `${h.evidence.count} unedited replies on ${h.evidence.days} days, out of ${h.evidence.total}`, links: h.evidence.links })),
		chats: Object.values(cfg.chatLevels ?? {}).map(c => ({ name: c.name, says: LEVEL_SAYS[c.level] })),
	}
}

// The same, as text for the AI chat ("what do you know about me?").
export function aboutText(store: Store): string {
	const a = aboutView(store), cfg = store.config()
	return [
		'## About you', a.profile || 'Nothing yet. Settings, About you.',
		'', '## Standing instructions', ...(a.rules.length ? a.rules.map(r => `- ${r.text}${r.who ? ` · For: ${r.who}` : ''}${r.learned ? ` (${r.learned}${r.code ? `; "never ${r.code}" turns it off` : ''})` : ' (you said)'}${r.held ? ' · on hold' : ''}`) : ['None: every reply waits for your ok.']),
		...(a.chats.length ? ['', '## Chats you marked', ...a.chats.map(c => `- ${c.name}: ${c.says}. "${c.name} is normal again" undoes it.`)] : []),
		...(a.suggestions.length ? ['', '## Suggestions', ...a.suggestions.map(x => `- ${x.code}: ${x.text} (${x.evidence}). "ok ${x.code}" turns it on.`)] : []),
		'', '## Learning', `- Notice my habits: ${cfg.noticeHabits === false ? 'off' : 'on'}`, `- Learned facts: ${cfg.reviewLearning ? 'wait for your ok' : 'saved at once, with an undo'}`, `- Signature: ${signatureOf(cfg)}${signsApproved(cfg) ? ', also on replies you approve' : ', only on automatic replies'}`,
	].join('\n')
}

// What the host is doing on this machine, from its state file: never asks it anything, so Settings never waits on it.
export function hostLine(cfg: Config, now = Date.now()): string {
	const off = hostOff(cfg)
	if (off) return `Off: ${off}, so each AI run starts its own process.`
	// Set aside after host faults in a row (#19b): replies still go out, each on its own process, until then.
	const until = hostDisabledUntil(now)
	if (until) return `Not used: the AI host failed ${(n => n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)(hostFaultLimit(cfg))}; using one process per run until ${new Date(until).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...(cfg.tz && validTz(cfg.tz) ? { timeZone: cfg.tz } : {}) })}.`
	let h: { pid: number; startedAt: string; cli: string } | undefined
	try { h = JSON.parse(readFileSync(hostFile(), 'utf8')) } catch { h = undefined }
	const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM' } }
	if (!h || !alive(h.pid)) return 'Not running: it starts with the next AI run, or at the first check of a work day.'
	// Warm since it started: its runtime and tool servers stay up between runs, so a reply starts in seconds (#25).
	const at = new Date(h.startedAt), today = at.toDateString() === new Date(now).toDateString(), tz = cfg.tz && validTz(cfg.tz) ? { timeZone: cfg.tz } : {}
	return `On, warm since ${at.toLocaleString(undefined, { ...(today ? {} : { weekday: 'short' }), hour: 'numeric', minute: '2-digit', ...tz })} (Copilot CLI ${h.cli}): replies start in seconds. It uses about ${HOST_MEMORY_MB} MB of memory while it waits.`
}
const hours = (min: number) => min % 60 ? `${min} minutes` : min === 60 ? '1 hour' : `${min / 60} hours`

export function settingsView(store: Store, experience?: 'classic' | 'new'): { rows: SettingRow[]; fixed: ReadOnlyRow[]; about: AboutView; models: ModelsView; tools?: ToolsView } {
	const cfg = store.config()
	// The new experience names its places differently: Waiting, and the foot of Now (PM review of N1a, 7).
	const words = (t: string) => (experience ?? experienceOf(store.ui())) !== 'classic' ? t.replace('Waiting on others', 'Waiting').replace('Check for updates on Home', 'Check for updates at the foot of Now') : t
	return {
		rows: specsOf(cfg).map(s => ({ key: s.key, label: words(s.label), help: words(typeof s.help === 'function' ? s.help(cfg) : s.help), kind: s.kind, section: s.section, value: s.read(cfg, store), options: s.options, ...(s.advanced ? { advanced: true as const } : {}), ...(s.group ? { group: s.group } : {}) })),
		...((t => (t ? { tools: t } : {}))(toolsView(cfg, { machine: store.machine, root: store.root }))),
		about: aboutView(store),
		models: modelsView(store),
		fixed: [
			// Once the tools list is per tool (#17), it is switched in Tools your drafts may read instead.
			...(cfg.agent.deny ? [] : [{ label: 'Tools drafts may read', value: workerTools(cfg, 'job').filter(t => !['view', 'glob', 'grep'].includes(t)).join(', ') || 'none', how: `Say "set up ${CMD}" and change the tools step.` }]),
			// Changes allowed in setup that Settings never offers as a switch, such as a whole tool: shown, changed only in setup.
			...((x => x.length ? [{ label: 'Other changes setup allows (each after your ok)', value: x.map(changeName).join('; '), how: `Say "set up ${CMD}" and change the tools step.` }] : [])((cfg.agent.effectTools ?? []).filter(e => !offerable(e)))),
			{ label: 'Reads your chats from', value: cfg.runner ?? 'the machine where setup last finished', how: `On another machine, say "move ${NAME} here".` },
			// While a session history differs between machines: one plain line, nothing to do (queue-new #16 c).
			...Object.entries(store.health()).filter(([key]) => key.startsWith('session:')).map(([, h]) => ({ label: 'AI history', value: h.text, how: 'Nothing to do. This line goes away by itself.' })),
			// The resident AI host on this machine (#19): on since when, or why runs use one process each.
			{ label: 'AI host', value: hostLine(cfg), how: `During work hours it stays ready for ${hours(cfg.agent.hostIdleMin ?? HOST_WORK_IDLE_MIN)} after its last run (Keep the AI host ready for, below); otherwise ${HOST_IDLE_MIN} minutes. Quiet hours stop it. Set agent.host to false in config.json to use one process per run.` },
		],
	}
}

// AI models (R-SET-14, design-spec/runinfo.md): what is set, and what ran in the last 7 days, per kind of run.
export type ModelsView = { set: string; lines: string[] }
// The page polls often: each log file's runs are read again only when the file changes.
const runCache = new Map<string, { stamp: string; runs: Record<string, unknown>[] }>()
export function modelsView(store: Store, now = Date.now()): ModelsView {
	// A file is named by its machine's UTC day: one day more is read, and each line's own time decides.
	const since = now - 7 * 86_400_000, day = new Date(since - 86_400_000).toISOString().slice(0, 10)
	const files = store.logFiles().filter(f => f.day >= day).map(f => f.file)
	for (const f of runCache.keys()) if (!files.includes(f)) runCache.delete(f)
	const events = files.flatMap(file => {
		try {
			const st = statSync(file), stamp = `${st.size}:${st.mtimeMs}`, hit = runCache.get(file)
			if (hit?.stamp === stamp) return hit.runs
			const runs = store.logOf(file).filter(e => runsOf([e]).length)
			runCache.set(file, { stamp, runs })
			return runs
		} catch { return [] }
	}).filter(e => Date.parse(String(e.at)) >= since)
	const lines = runLines(events), model = store.config().agent.model, name = model && nameFor(events, model)
	return { set: model ? `Set to: ${model}${name && name !== model ? ` (${name})` : ''}` : 'Uses the AI CLI\'s default', lines: lines.length ? lines : ['Models that ran: not recorded yet.'] }
}

export async function saveSetting(store: Store, key: string, raw: string, deps: SaveDeps = {}): Promise<{ ok: boolean; text: string }> {
	const spec = specsOf(store.config()).find(s => s.key === key)
	if (!spec) return { ok: false, text: 'That setting cannot be changed here.' }
	const r = spec.check ? await spec.check(String(raw ?? ''), store, deps) : spec.parse(String(raw ?? ''), store)
	if (!r.ok) return { ok: false, text: r.why }
	store.saveConfig(r.save(store.config(), store))
	store.log({ event: 'setting', key })
	return { ok: true, text: `${spec.saved ? spec.saved(String(raw)) : `Saved ${spec.label.toLowerCase()}.`} It applies from the next cycle, on every machine.` }
}

// Each target is read from Azure DevOps before it is saved: its project must hold that pipeline ID, and its real name must not be
// int or production. The real name is kept, so the card and the gate never rest on the repo's words alone (review 10-21 P1-2, P2-7).
async function checkTargets(raw: string, store: Store, { probe }: SaveDeps): Promise<Parsed> {
	const r = parseTargets(raw, store.config())
	if (!r.ok) return r
	const bare = r.targets.find(t => !t.project)
	if (bare) return { ok: false, why: `Name the project of ${bare.ring}, such as ${bare.ring} Globex/${bare.pipelineId}.` }
	if (r.targets.length && !probe?.definition) return { ok: false, why: `Each pipeline is checked in Azure DevOps before it is saved, and ${NAME} has no Azure DevOps tool server set up.` }
	const out: DeployTarget[] = []
	for (const t of r.targets) {
		let d: { name: string; path?: string } | undefined
		try { d = await probe!.definition!(t.project!, t.pipelineId) } catch (e) { return { ok: false, why: `Could not read pipeline ${t.pipelineId} in ${t.project}: ${String(e).slice(0, 120)}` } }
		if (!d) return { ok: false, why: `There is no pipeline ${t.pipelineId} in ${t.project}.` }
		if (NEVER_RING.test(d.name) || NEVER_RING.test(d.path ?? '')) return { ok: false, why: `${t.ring} (${t.pipelineId}) is "${d.name}" in Azure DevOps, a shared or production ring. ${NAME} never deploys there.` }
		out.push({ ...t, project: t.project!, name: d.name })
	}
	return { ok: true, save: c => ({ ...c, deploy: { ...c.deploy, allowed: out, proposed: (c.deploy?.proposed ?? []).filter(p => !out.some(t => t.pipelineId === p.pipelineId)) } }) }
}
