import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

// Adapter for the project's node:test-based mutation checker, not the normal suite.
test('React component and resolver mutation rules', () => {
	const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], { encoding: 'utf8', timeout: 60_000 })
	assert.equal(result.status, 0, result.stdout + result.stderr)
})
