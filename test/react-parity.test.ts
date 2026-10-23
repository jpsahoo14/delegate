import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const inventory = readFileSync('reviews/react-parity-m4.md', 'utf8').split('\n')
	.filter(line => /^\| (?:SC-\d+|U\d+) \|/.test(line))
	.map(line => line.split('|').map(cell => cell.trim()).slice(1, -1))
const master = readFileSync('docs/scenarios.md', 'utf8').split('\n')
	.flatMap(line => line.match(/^\| (SC-\d+) \|/)?.[1] ?? [])

test('React parity inventory: every master scenario and U01-U61 appears exactly once', () => {
	const expected = [...master, ...Array.from({ length: 61 }, (_, n) => `U${String(n + 1).padStart(2, '0')}`)].sort()
	assert.deepEqual(inventory.map(row => row[0]).sort(), expected)
})

test('React parity inventory: every capability has an explicit status and evidence or a gap reason', () => {
	for (const row of inventory) {
		const status = row.findIndex(cell => cell === 'Done in React' || cell === 'Not needed' || cell === 'Missing')
		assert.ok(status >= 1, `${row[0]} must be classified, never silently omitted`)
		assert.ok(row.slice(status + 1).join(' ').length >= 20, `${row[0]} needs concrete evidence or an explicit reuse/exclusion reason`)
	}
})
