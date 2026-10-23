import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'

test('React UI browser mutation rules', async () => {
	const root = mkdtempSync(join(tmpdir(), 'delegate-react-mutation-build-'))
	try {
		await build({ configFile: join(import.meta.dirname, '..', 'vite.config.ts'), logLevel: 'silent', build: { outDir: join(root, 'dist/web-react') } })
		const { NODE_TEST_CONTEXT: _parentContext, ...environment } = process.env
		const result = spawnSync(process.execPath, ['--test', '--test-name-pattern=' + (process.env.DELEGATE_MUTATION_CASE ?? 'React app browser:'), 'test/react-app-browser.test.ts'], {
			encoding: 'utf8', timeout: 120_000, env: { ...environment, DELEGATE_PREVIEW_BUILD: root },
		})
		assert.equal(result.status, 0, result.stdout + result.stderr)
		assert.match(result.stdout, /React app browser:/, 'the browser cases must actually be discovered')
	} finally { rmSync(root, { recursive: true, force: true }) }
})
