// Make a release commit: bump the version everywhere it is written, rebuild, and commit.
// Usage: node scripts/release.ts <major.minor.patch>, then publish it with --tag.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..'), next = process.argv[2] ?? ''
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
const num = (v: string) => v.split('.').map(Number)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
const newer = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
if (!/^\d+\.\d+\.\d+$/.test(next) || newer(num(next), num(pkg.version)) <= 0) { console.error(`Give a version newer than ${pkg.version}, such as ${num(pkg.version).map((n, i) => (i === 2 ? n + 1 : n)).join('.')}.`); process.exit(2) }
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim()) { console.error('Commit your changes first.'); process.exit(1) }
run('npm', ['version', next, '--no-git-tag-version'])
for (const f of ['.claude-plugin/plugin.json']) {
	const p = join(root, f)
	writeFileSync(p, readFileSync(p, 'utf8').replace(/"version":\s*"[^"]+"/, `"version": "${next}"`))
}
run('npm', ['run', 'build'])
execFileSync('git', ['commit', '--quiet', '-am', `Release ${next}`], { cwd: root, stdio: 'inherit' })
console.log(`Committed release ${next}. Publish it: npm run publish:github -- --tag`)
