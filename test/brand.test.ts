// The product name lives in src/brand.ts, so a rename is one line (dogfood: rebrand readiness).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const SRC = join(import.meta.dirname, '..', 'src')
// Stored ids that outlive a rename: changing them would orphan existing installs.
const IDS = new Set(['Delegate Runner'])

function files(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|js)$/.test(e.name) ? [join(dir, e.name)] : [])
}

function named(file: string): string[] {
	const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
	const hits: string[] = []
	const visit = (n: ts.Node) => {
		if ((ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n)) && /\bDelegate\b|(^|[\s"'`])delegate (init|update|update-now|install|uninstall|service|tick|demo|doctor|sessions|replies|open|feedback|migrate|status|version)\b/.test(n.text) && !IDS.has(n.text))
			hits.push(`${file.slice(SRC.length + 1)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${n.text.slice(0, 60)}`)
		ts.forEachChild(n, visit)
	}
	visit(sf)
	return hits
}

test('the product name and command are written only in src/brand.ts', () => {
	assert.deepEqual(files(SRC).filter(f => !f.endsWith('brand.ts')).flatMap(named), [])
})
