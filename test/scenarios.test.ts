import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const titles = readdirSync(join(root, 'test')).filter(f => f.endsWith('.test.ts')).flatMap(f =>
	[...readFileSync(join(root, 'test', f), 'utf8').matchAll(/^test\((['"`])((?:\\.|(?!\1).)*)\1/gm)].map(m => m[2].replace(/\\(.)/g, '$1')))
const rows = readFileSync(join(root, 'docs', 'scenarios.md'), 'utf8').split('\n').filter(l => /^\| SC-\d+ /.test(l)).map(l => l.split('|').map(c => c.trim()))

test('scenarios: every row in docs/scenarios.md has a proof, and every test it names exists', () => {
	assert.ok(rows.length >= 50, `found ${rows.length} rows`)
	const ids = rows.map(r => r[1])
	assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'ids are unique')
	const problems: string[] = []
	for (const [, id, , proof] of rows) {
		const named = [...proof.matchAll(/`([^`]+)`/g)].map(m => m[1])
		const other = /\beval R\d+[ab]?\b|\blive \S+|\bmanual: \S/.test(proof)
		if (!named.length && !other) problems.push(`${id} has no proof`)
		for (const n of named) if (!titles.some(t => t.startsWith(n))) problems.push(`${id}: no test starts with "${n}"`)
	}
	assert.deepEqual(problems, [])
})

// Behavior and spec move together: from SC-105 on, each row names the requirement it proves, and that requirement exists
// in the PM spec when this machine can read it (DELEGATE_SPEC, for example from a git-ignored .env.local).
const spec = process.env.DELEGATE_SPEC ?? ''
test('scenarios: every new row names its requirement, and each named requirement is in the PM spec', () => {
	const missing = rows.filter(r => Number(r[1].slice(3)) >= 105 && !/R-[A-Z]+-\d+/.test(r[2])).map(r => r[1])
	assert.deepEqual(missing, [], 'rows without a requirement ID')
	if (!spec || !existsSync(join(spec, 'requirements'))) return
	const known = new Set(readdirSync(join(spec, 'requirements')).flatMap(f => [...readFileSync(join(spec, 'requirements', f), 'utf8').matchAll(/^\| (R-[A-Z]+-\d+) \|/gm)].map(m => m[1])))
	const cited = rows.flatMap(r => [...r[2].matchAll(/R-[A-Z]+-\d+/g)].map(m => `${r[1]} ${m[0]}`))
	assert.deepEqual(cited.filter(c => !known.has(c.split(' ')[1])), [], 'requirements cited but not in the PM spec')
})
