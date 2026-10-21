import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-site-local-'))
const { site, useSite } = await import('../src/core/site.ts')

test('site: a workplace adds its own words and tools from site.json; without one, nothing of any workplace is assumed', async () => {
	const { linksIn } = await import('../src/runner/work.ts')
	const { changeName, changeLine } = await import('../src/core/effects.ts')
	const { teamsCommand } = await import('../src/mcp/setup.ts')
	const { ours } = await import('../src/os/process.ts')
	useSite(undefined)
	assert.deepEqual(site(), {}, 'tests never read a real site')
	assert.deepEqual([linksIn('TKT 512345 and incident 600001, pal 7000001'), changeName('tickets-post_comment'), teamsCommand(), ours().test('corpcli')], [['incident:600001'], 'tickets-post_comment', ['teams-mcp'], false])

	const f = join(mkdtempSync(join(tmpdir(), 'delegate-site-')), 'site.json')
	writeFileSync(f, JSON.stringify({ teams: ['corpcli', 'mcp', 'teams'], incidentWords: ['TKT'], buildWords: ['pal'], actions: { 'tickets-post_comment': ['Ticket comment', 'add a comment to a ticket'] }, processNames: ['corpcli'] }))
	process.env.DELEGATE_SITE = f
	try {
		assert.deepEqual(linksIn('TKT 512345 and incident 600001, pal 7000001').sort(), ['build:7000001', 'incident:512345', 'incident:600001'])
		assert.deepEqual([changeName('tickets-post_comment'), changeLine('tickets-post_comment'), teamsCommand(), ours().test('corpcli')], ['Ticket comment', 'tickets-post_comment: add a comment to a ticket', ['corpcli', 'mcp', 'teams'], true])
		writeFileSync(f, '{ not json')
		const later = new Date(Date.now() + 5000)
		;(await import('node:fs')).utimesSync(f, later, later)
		assert.deepEqual(site(), {}, 'a broken site file is no site, never a crash')
	} finally { delete process.env.DELEGATE_SITE }
})

test('site: images open only through the server and tool the site names', async () => {
	const { imagesFor } = await import('../src/adapters/registry.ts')
	const cfg = { source: { command: ['corpcli', 'mcp', 'teams'], selfChatId: 's' } } as never
	useSite({})
	assert.equal(imagesFor(cfg), undefined, 'no site, no image reader')
	useSite({ images: { server: 'files', tool: 'fetch_blob' } })
	assert.ok(imagesFor(cfg), 'the site names one')
	useSite(undefined)
})
