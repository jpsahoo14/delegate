// The public repo gets this commit's files as one new commit; private text and this repo's history never reach it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-publocal-'))
import { publish } from '../scripts/publish.ts'

const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()

test('publish: private text stops it; then one commit per publish, tags on request, and none of the private history', () => {
	const base = mkdtempSync(join(tmpdir(), 'delegate-pub-')), dev = join(base, 'dev'), pub = join(base, 'public.git'), user = join(base, 'user')
	execFileSync('git', ['init', '-q', '--bare', '-b', 'main', pub])
	execFileSync('git', ['init', '-q', '-b', 'main', dev])
	writeFileSync(join(dev, 'package.json'), JSON.stringify({ version: '0.2.0' }))
	writeFileSync(join(dev, 'a.ts'), 'export const owner = "Secret Colleague"\n')
	writeFileSync(join(dev, '.publish-deny'), '# names\nSecret Colleague\n')
	writeFileSync(join(dev, '.gitignore'), '.publish-deny\n')
	git(dev, 'add', '-A'); git(dev, 'commit', '-qm', 'private message one')
	assert.throws(() => publish({ from: dev, to: pub }), /Private text found[\s\S]*a\.ts:1/)
	writeFileSync(join(dev, 'a.ts'), `export const owner = "Robin Park"\nconst home = "/${'Users'}/jdoe/x"\n`)
	git(dev, 'commit', '-qam', 'private message two')
	assert.throws(() => publish({ from: dev, to: pub }), /a\.ts:2/, 'built-in: a real home folder')
	for (const home of [String.raw`"C:\\${'Users'}\\jdoe\\x"`, `"C:/${'Users'}/jdoe"`, `/${'home'}/jdoe/x`]) {
		writeFileSync(join(dev, 'a.ts'), `const home = ${home}\n`); git(dev, 'commit', '-qam', 'private message escaped')
		assert.throws(() => publish({ from: dev, to: pub }), /a\.ts:1/, home)
	}
	writeFileSync(join(dev, 'a.ts'), 'export const owner = "Robin Park"\n'); writeFileSync(join(dev, 'package-lock.json'), `{"resolved": "file:/${'Users'}/jdoe/pkg"}\n`)
	git(dev, 'add', '-A'); git(dev, 'commit', '-qm', 'private message lock')
	assert.throws(() => publish({ from: dev, to: pub }), /package-lock\.json:1/, 'the lockfile is scanned too')
	git(dev, 'rm', '-q', 'package-lock.json'); git(dev, 'commit', '-qm', 'private message unlock')
	writeFileSync(join(dev, 'a.ts'), 'export const owner = "Robin Park"\n')
	writeFileSync(join(dev, 'b.ts'), 'dirty\n')
	git(dev, 'add', '-A'); git(dev, 'commit', '-qm', 'private message three'); writeFileSync(join(dev, 'a.ts'), 'uncommitted\n')
	assert.throws(() => publish({ from: dev, to: pub }), /Commit or stash/)
	git(dev, 'checkout', '--', 'a.ts')
	git(dev, 'commit', '-qam', 'private message four', '--allow-empty')
	const r = publish({ from: dev, to: pub, tag: true })
	assert.equal(r.tag, 'v0.2.0')
	execFileSync('git', ['clone', '-q', pub, user])
	assert.deepEqual(git(user, 'log', '--format=%s').split('\n'), [`Delegate 0.2.0 (${git(dev, 'rev-parse', '--short', 'HEAD')})`])
	assert.deepEqual(git(user, 'ls-files').split('\n').sort(), ['.gitignore', 'a.ts', 'b.ts', 'package.json'])
	assert.equal(git(user, 'tag'), 'v0.2.0')
	assert.deepEqual(publish({ from: dev, to: pub }), { commit: undefined, tag: undefined, files: 4 }, 'nothing new')
	assert.throws(() => publish({ from: dev, to: pub, tag: true }), /v0\.2\.0 is already released/)
})

test('publish: with no private deny list anywhere it refuses, and the machine list applies to every worktree', () => {
	const base = mkdtempSync(join(tmpdir(), 'delegate-pub2-')), dev = join(base, 'dev'), pub = join(base, 'public.git')
	execFileSync('git', ['init', '-q', '--bare', '-b', 'main', pub])
	execFileSync('git', ['init', '-q', '-b', 'main', dev])
	writeFileSync(join(dev, 'a.ts'), 'export const where = "Initrode build farm"\n')
	git(dev, 'add', '-A'); git(dev, 'commit', '-qm', 'one')
	assert.throws(() => publish({ from: dev, to: pub, check: true }), /No private deny list/)
	writeFileSync(join(process.env.DELEGATE_LOCAL!, 'publish-deny'), 'initrode\n')
	assert.throws(() => publish({ from: dev, to: pub, check: true }), /Private text found[\s\S]*a\.ts:1/, 'the machine list is read with no repo copy')
})

