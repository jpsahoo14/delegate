import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { Config } from '../core/types.ts'
import { LOCAL_DIR } from '../store/state.ts'
import { assertTestSafe, readJson, writeJson } from '../store/fs.ts'

// Work and jobs name a repo by its remote, never by a path or a web URL; each machine maps remotes to its own clones in
// local.json, which is never synced (eng-owned-work.md §d). The remote is written one way however it was given:
// "dev.azure.com/<org>/<project>/<repo>" or "github.com/<owner>/<repo>", in lower case.
export function remoteOf(s?: string): string | undefined {
	const t = (s ?? '').trim()
	const ado = /^(?:https?:\/\/)?(?:[^@/\s]+@)?dev\.azure\.com\/([^/\s]+)\/([^/\s]+)\/_git\/([^/\s?#]+)/i.exec(t)
		?? /^(?:https?:\/\/)?(?:[^@/\s]+@)?([\w-]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/\s]+)\/_git\/([^/\s?#]+)/i.exec(t)
		?? /^(?:[^@\s]+@)?(?:ssh\.dev\.azure\.com|vs-ssh\.visualstudio\.com):v3\/([^/\s]+)\/([^/\s]+)\/([^/\s?#]+)/i.exec(t)
	if (ado) return `dev.azure.com/${ado.slice(1, 4).map(p => decodeURIComponent(p).replace(/\.git$/i, '')).join('/')}`.toLowerCase()
	const gh = /^(?:https?:\/\/|git@)github\.com[/:]([^/\s]+)\/([^/\s?#]+)/i.exec(t)
	return gh ? `github.com/${gh[1]}/${gh[2].replace(/\.git$/i, '')}`.toLowerCase() : undefined
}
// The repo's own name, as the owner wrote it in Settings when they did.
export const repoName = (cfg: Config, remote: string) => cfg.repos?.find(r => remoteOf(r.remote) === remote)?.name ?? remote.split('/').at(-1)!
export const cloneUrl = (remote: string) => remote.startsWith('dev.azure.com/') ? `https://${remote.replace(/^dev\.azure\.com\/([^/]+)\/([^/]+)\//, 'dev.azure.com/$1/$2/_git/')}` : `https://${remote}`

// What the AI wrote for a repo: a remote, a link into it (a PR), or a name from Settings. A path or anything else names none.
// A folder on this machine counts only for the remote its clone has; the folder itself is never kept.
export function repoRef(cfg: Config, s?: string): string | undefined {
	const r = remoteOf(s)
	if (r) return r
	if (s && isAbsolute(s.trim())) return gitInfo(s.trim())?.remote
	const name = (s ?? '').trim().toLowerCase()
	const hit = name && cfg.repos?.find(x => x.name.toLowerCase() === name)
	return hit ? remoteOf(hit.remote) : undefined
}

// A folder's git remote and branch, read from its files: a clone has a .git folder, a worktree a .git file pointing at one.
export function gitInfo(dir: string): { remote?: string; branch?: string } | undefined {
	const dot = join(dir, '.git')
	let gitDir: string
	try { gitDir = statSync(dot).isDirectory() ? dot : resolve(dir, /^gitdir:\s*(.+)$/m.exec(readFileSync(dot, 'utf8'))?.[1]?.trim() ?? '') } catch { return undefined }
	const common = existsSync(join(gitDir, 'commondir')) ? resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim()) : gitDir
	const read = (p: string) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
	const url = /\[remote "origin"\][^[]*?\burl\s*=\s*(\S+)/.exec(read(join(common, 'config')))?.[1]
	const branch = /^ref:\s*refs\/heads\/(.+)$/m.exec(read(join(gitDir, 'HEAD')))?.[1]?.trim()
	return { remote: remoteOf(url), branch }
}

type Clones = { code?: string[]; clones?: Record<string, string[]>; scannedAt?: string }
const LOCAL = () => join(LOCAL_DIR, 'local.json')
export const localClones = (): Clones => readJson<Clones>(LOCAL(), {})
// Only these keys are written; the rest of local.json (the storage root, the machine) stays as it is.
function saveClones(c: Clones) {
	assertTestSafe(LOCAL_DIR)
	writeJson(LOCAL(), { ...readJson<Record<string, unknown>>(LOCAL(), {}), ...c }, 'local')
}

// The owner names where this machine keeps code; the next lookup scans there.
export const saveCodeFolders = (code: string[]) => saveClones({ code, scannedAt: undefined })

// Where the owner keeps code on this machine: the folders in local.json, else the usual places that exist.
export function codeFolders(home = homedir()): string[] {
	const own = localClones().code
	if (own?.length) return own
	// A test never scans the machine's own code folders.
	if (process.env.NODE_TEST_CONTEXT) return []
	const guesses = [['work', 'sourceCode'], ['source', 'repos'], ['src'], ['repos'], ['code'], ['dev'], ['git'], ['work']].map(p => join(home, ...p))
	return [...guesses, ...(process.platform === 'win32' ? ['C:\\src', 'C:\\repos', 'D:\\src', 'Q:\\src'] : [])].filter(f => existsSync(f))
}

// Clones under the code folders, two levels down, by remote. node_modules and hidden folders are skipped.
export function scanClones(folders: string[], depth = 2): Record<string, string[]> {
	const out: Record<string, string[]> = {}
	const visit = (dir: string, left: number) => {
		const g = gitInfo(dir)
		// Nested code folders (~/work and ~/work/src) reach a clone twice; it is listed once.
		if (g?.remote) { if (!out[g.remote]?.includes(dir)) (out[g.remote] ??= []).push(dir); return }
		if (!left) return
		let names: string[] = []
		try { names = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules').map(d => d.name) } catch { return }
		for (const n of names) visit(join(dir, n), left - 1)
	}
	for (const f of folders) if (isAbsolute(f) && existsSync(f)) visit(f, depth)
	return out
}

const RESCAN_MS = 60 * 60_000
// The clone of a remote on this machine. Several clones: the one on the PR's source branch wins. None: a rescan at most once an hour.
export function cloneFor(remote: string, branch?: string, now = Date.now()): string | undefined {
	const want = branch?.replace(/^refs\/heads\//, '')
	const pick = (paths: string[] = []) => {
		const live = paths.map(p => ({ p, g: gitInfo(p) })).filter(x => x.g?.remote === remote)
		return (want && live.find(x => x.g!.branch === want)?.p) || live[0]?.p
	}
	const was = localClones()
	const hit = pick(was.clones?.[remote])
	if (hit) return hit
	if (was.scannedAt && now - Date.parse(was.scannedAt) < RESCAN_MS) return undefined
	const clones = scanClones(codeFolders())
	saveClones({ clones, scannedAt: new Date(now).toISOString() })
	return pick(clones[remote])
}

// The to-do a missing clone becomes: the job still runs, reading the repo through Azure DevOps (eng-owned-work.md §d).
export const cloneTodo = (cfg: Config, remote: string, machine: string) => `Clone ${repoName(cfg, remote)} on ${machine} (git clone ${cloneUrl(remote)}), so work on it can use a local copy`

