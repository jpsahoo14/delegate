// Publish this commit's files to the public repo as one new commit, never this repo's history.
// Usage: node scripts/publish.ts --to <git url or path> [--tag], or --check to only scan.
// Refuses when the tree has uncommitted changes, or when any shipped file matches a private pattern:
// a few built in, plus one regular expression per line in the git-ignored .publish-deny.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Home folders other than the made-up ones the tests use, and GitHub tokens.
const FAKE = "(?:me|a|you|o'{1,2}neil|test)"
// Windows paths match with one or more backslashes or a slash, as JSON and JS strings escape them (review 10-19 #7).
const BUILT_IN = [String.raw`/(?:Users|home)/(?!${FAKE}/)[a-z]`, String.raw`C:(?:\\+|/)Users(?:\\+|/)(?!${FAKE}(?:\\|/))[a-z]`, String.raw`gh[opsu]_[A-Za-z0-9]{20,}`]

export type Published = { commit?: string; tag?: string; files: number }

export function publish(o: { from: string; to: string; tag?: boolean; deny?: string[]; check?: boolean }): Published {
	// A GitHub target signs in as the repo's owner through gh, whatever account is active (the owner keeps an enterprise one active).
	const owner = /^https:\/\/github\.com\/([^/]+)\//.exec(o.to)?.[1]
	const auth = owner ? ['-c', 'credential.helper=', '-c', `credential.helper=!f() { echo username=x-access-token; echo "password=$(gh auth token --user ${owner})"; }; f`] : []
	const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=Delegate release', '-c', 'user.email=release@users.noreply.github.com', ...auth, ...a], { cwd, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 << 20 }).trim()
	if (git(o.from, 'status', '--porcelain', '--untracked-files=no')) throw new Error('Commit or stash your changes first; only a commit is published.')
	// The private list lives once per machine (~/.delegate/publish-deny), so every worktree checks the same names; a repo copy adds to it.
	const denyFiles = [join(o.from, '.publish-deny'), join(process.env.DELEGATE_LOCAL ?? join(homedir(), '.delegate'), 'publish-deny')].filter(f => existsSync(f))
	if (!o.deny && !denyFiles.length) throw new Error('No private deny list (~/.delegate/publish-deny), so nothing can be checked; nothing was published.')
	const patterns = [...BUILT_IN, ...(o.deny ?? []), ...denyFiles.flatMap(f => readFileSync(f, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')))]
	// The tree is clean, so the files on disk are exactly the commit's.
	const res = patterns.map(p => new RegExp(p, 'i'))
	const hits = git(o.from, 'ls-files').split('\n').filter(Boolean).flatMap(f => {
		const text = readFileSync(join(o.from, f), 'utf8')
		if (text.includes('\u0000')) return []
		return text.split('\n').flatMap((line, i) => res.filter(r => r.test(line)).map(r => `${f}:${i + 1}: ${line.trim().slice(0, 120)} (${r.source.slice(0, 40)})`))
	})
	if (hits.length) throw new Error(`Private text found; nothing was published:\n${[...new Set(hits)].slice(0, 20).join('\n')}`)
	if (o.check) return { files: git(o.from, 'ls-files').split('\n').filter(Boolean).length }

	const work = mkdtempSync(join(tmpdir(), 'delegate-publish-'))
	try {
		try { git(tmpdir(), 'clone', '--quiet', o.to, work) } catch { git(work, 'init', '--quiet', '-b', 'main'); git(work, 'remote', 'add', 'origin', o.to) }
		if (git(work, 'symbolic-ref', '--short', 'HEAD') !== 'main') git(work, 'checkout', '--quiet', '-B', 'main')
		for (const f of readdirSync(work)) if (f !== '.git') rmSync(join(work, f), { recursive: true, force: true })
		const tar = join(tmpdir(), `delegate-publish-${process.pid}.tar`)
		git(o.from, 'archive', '--format=tar', '-o', tar, 'HEAD')
		execFileSync('tar', ['-x', '-f', tar, '-C', work], { stdio: 'pipe' })
		rmSync(tar, { force: true })
		git(work, 'add', '--all')
		const version = JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')).version as string
		const files = git(work, 'ls-files').split('\n').filter(Boolean).length
		const changed = git(work, 'status', '--porcelain') !== ''
		if (changed) git(work, 'commit', '--quiet', '-m', `Delegate ${version} (${git(o.from, 'rev-parse', '--short', 'HEAD')})`)
		let tag: string | undefined
		if (o.tag) {
			tag = `v${version}`
			if (git(work, 'tag', '--list', tag)) throw new Error(`${tag} is already released. Bump the version first: npm run release -- <version>.`)
			git(work, 'tag', '-a', tag, '-m', `Delegate ${version}`)
		}
		if (changed || tag) git(work, 'push', '--quiet', '--follow-tags', 'origin', 'main')
		return { commit: changed ? git(work, 'rev-parse', '--short', 'HEAD') : undefined, tag, files }
	} finally { rmSync(work, { recursive: true, force: true }) }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const args = process.argv.slice(2), at = (n: string) => args[args.indexOf(`--${n}`) + 1]
	const to = args.includes('--to') ? at('to') : args.includes('--check') ? '' : undefined
	if (to === undefined) { console.error('Usage: node scripts/publish.ts --to <git url or path> [--tag]'); process.exit(2) }
	try { const r = publish({ from: join(import.meta.dirname, '..'), to, tag: args.includes('--tag'), check: !to }); console.log(!to ? `Clean: ${r.files} files can be published.` : r.commit || r.tag ? `Published ${r.files} files${r.commit ? ` as ${r.commit}` : ''}${r.tag ? `, tagged ${r.tag}` : ''}.` : 'Nothing new to publish.') }
	catch (e) { console.error(String((e as Error).message ?? e)); process.exit(1) }
}
