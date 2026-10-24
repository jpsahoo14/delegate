// Fictional-log real CLI journeys only. Snapshot every isolated file to prove the command never writes.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = mkdtempSync(join(tmpdir(), 'delegate-trace-proof-'))
const repo = dirname(dirname(fileURLToPath(import.meta.url)))
const local = join(root, 'local'), data = join(root, 'fictional')
const env = { ...process.env, DELEGATE_ROOT: data, DELEGATE_LOCAL: local, COPILOT_HOME: join(root, 'copilot'),
	XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data') }
const cli = join(repo, ...(process.argv.includes('--bundle') ? ['dist', 'delegate.mjs'] : ['src', 'cli.ts']))
const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10)
const old = new Date(Date.parse(today) - 2 * 86_400_000).toISOString().slice(0, 10)
const at = (day: string, n: number) => `${day}T00:00:${String(n).padStart(2, '0')}.000Z`
const log = join(data, 'state', 'log'), reports = join(data, 'state', 'done', 'reports')
function snapshot(dir: string, prefix = ''): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const name = join(prefix, entry.name), file = join(dir, entry.name), st = statSync(file)
		out[name] = entry.isDirectory() ? { mtime: st.mtimeMs, files: snapshot(file, name) } :
			{ mtime: st.mtimeMs, hash: createHash('sha256').update(readFileSync(file)).digest('hex') }
	}
	return out
}
function run(...args: string[]) {
	const result = spawnSync(process.execPath, [cli, 'trace', ...args], { env, encoding: 'utf8', timeout: 20_000, windowsHide: true })
	if (result.error) throw result.error
	return { ...result, rows: result.stdout.trim().startsWith('{') ? result.stdout.trim().split('\n').map(line => JSON.parse(line)) as Record<string, unknown>[] : [] }
}
try {
	for (const dir of [local, log, reports, env.COPILOT_HOME, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME, env.XDG_DATA_HOME]) mkdirSync(dir, { recursive: true })
	const previous: Record<string, unknown>[] = [], current: Record<string, unknown>[] = [], host: Record<string, unknown>[] = []
	for (const [i, code] of ['A36', 'A37', 'A61', 'A76', 'W7'].entries()) {
		const trace = `${code}:submission-${code}`, runId = `run-${code}`, workflowId = `item-${code}`
		previous.push({ at: at(yesterday, i), event: 'page-submit', trace, code, submissionId: `submission-${code}`, ms: 5, summary: 'PRIVATE_MESSAGE_TEXT' })
		current.push(
			{ at: at(today, i + 1), event: 'worker', trace, code, runId, workflowId, exitCode: 0, ms: 30, summary: 'PRIVATE_DRAFT_TEXT', arguments: { body: 'PRIVATE_ARGUMENTS' } },
			{ at: at(today, i + 11), event: 'decision', trace, runId, gate: 'send', rule: 'owner-approval', text: 'PRIVATE_DECISION_TEXT' },
			{ at: at(today, i + 21), event: i === 4 ? 'run-no-report' : 'effect-failed', trace, runId, step: i === 4 ? 'submit_report' : 'make_change', class: 'tool-error', error: 'Permission denied; api_key=fictional-secret-value' },
			{ at: at(today, i + 31), event: 'sent', trace, runId, text: 'PRIVATE_SENT_TEXT' },
		)
		host.push({ at: at(today, i + 6), event: 'host-session-closed', runId, class: 'exception', step: 'host', message: 'PRIVATE_HOST_TEXT' })
		writeFileSync(join(reports, `${workflowId}-${runId}.json`), JSON.stringify({
			workflowId, intent: 'other', state: 'needs_human', summary: 'PRIVATE_REPORT_SUMMARY',
			reply: { text: 'PRIVATE_REPORT_REPLY', commitment: false, sources: [] }, effects: [],
		}))
	}
	current.push(
		{ at: at(today, 50), event: 'worker', trace: 'A360:submission-A360', code: 'A360', runId: 'run-A360', summary: 'WRONG_CODE' },
		{ at: at(today, 51), event: 'worker', trace: 'A36:submission-A36-extra', code: 'A36', runId: 'run-extra', summary: 'OTHER_SUBMISSION' },
	)
	writeFileSync(join(log, `${yesterday}-acme-desktop.jsonl`), previous.map(e => JSON.stringify(e)).join('\r\n') + '\r\n')
	writeFileSync(join(log, `${today}-acme-laptop.jsonl`), current.reverse().map(e => JSON.stringify(e)).join('\n') + '\n{PRIVATE_BROKEN_LINE\n')
	writeFileSync(join(log, `${old}-acme-desktop.jsonl`), JSON.stringify({ at: at(old, 0), event: 'worker', trace: 'A36:submission-A36', error: 'TOO_OLD' }) + '\n')
	writeFileSync(join(local, 'host.log'), host.map(e => JSON.stringify(e)).join('\n') + '\nPRIVATE_UNSTRUCTURED_HOST_LINE\n')
	writeFileSync(join(local, 'local.json'), JSON.stringify({ root: data, machine: 'acme-desktop' }))
	const unreadable = join(root, 'bad-local')
	mkdirSync(join(unreadable, 'host.log'), { recursive: true })
	const before = snapshot(root)
	for (const code of ['A36', 'A37', 'A61', 'A76', 'W7']) {
		const result = run(code)
		assert.equal(result.status, 0, result.stderr)
		assert.ok(result.rows.some(e => e.event === 'page-submit' && String(e.at).startsWith(yesterday)))
		assert.ok(result.rows.some(e => e.source === 'host'))
		assert.ok(result.rows.some(e => e.source === 'report' && e.hasReply === true))
		assert.ok(result.rows.some(e => e.failureStep === (code === 'W7' ? 'submit_report' : 'make_change')))
		assert.ok(!result.rows.some(e => e.event === 'sent'))
		assert.ok(!result.stdout.includes('PRIVATE_'))
		assert.ok(!result.stdout.includes('fictional-secret-value'))
		assert.ok(!result.stdout.includes('TOO_OLD') && !result.stdout.includes('WRONG_CODE'))
		assert.match(result.stderr, /skipped 2 malformed or unstructured/)
		const timestamps = result.rows.map(e => Date.parse(String(e.at)))
		assert.deepEqual(timestamps, [...timestamps].sort((a, b) => a - b))
	}
	console.log('PASS five fictional incident shapes join previous/current-day cross-machine state logs, host diagnostics and run summaries; failure steps named; default has no message/draft/report text')
	for (const id of ['A36:submission-A36', 'submission-A36', 'run-A36']) {
		const result = run(id)
		assert.equal(result.status, 0, result.stderr)
		assert.equal(result.rows.filter(e => e.source === 'state').length, 4)
		assert.ok(!result.stdout.includes('run-extra') && !result.stdout.includes('A360'))
	}
	assert.match(run('submission-A3').stdout, /No trace entries found/)
	const content = run('run-A36', '--content')
	assert.equal(content.status, 0, content.stderr)
	assert.ok(content.stdout.includes('PRIVATE_SENT_TEXT') && content.stdout.includes('PRIVATE_REPORT_REPLY'))
	assert.ok(!content.stdout.includes('fictional-secret-value'))
	for (const args of [[], ['--bogus'], ['A36', '--bogus'], ['A36', '--content', '--content'], ['..\\outside']]) {
		const result = run(...args)
		assert.equal(result.status, 1)
		assert.match(result.stderr, /Usage: delegate trace/)
	}
	const bad = spawnSync(process.execPath, [cli, 'trace', 'A36'], {
		env: { ...env, DELEGATE_LOCAL: unreadable }, encoding: 'utf8', timeout: 20_000, windowsHide: true,
	})
	if (bad.error) throw bad.error
	assert.equal(bad.status, 1)
	assert.match(bad.stderr, /EISDIR/)
	assert.deepEqual(snapshot(root), before)
	console.log('PASS exact selectors do not cross turns/partial IDs; content is opt-in and scrubbed; invalid usage and filesystem errors are explicit; all isolated bytes/mtimes unchanged')
	console.log(`TRACE PROOF: real ${process.argv.includes('--bundle') ? 'built' : 'source'} CLI passed; no host/model/MCP/runner started.`)
} finally {
	rmSync(root, { recursive: true, force: true })
}
