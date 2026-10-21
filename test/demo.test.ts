import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dirname, '..', 'src', 'cli.ts')
const cli = (home: string, args: string[], env: Record<string, string> = {}) => {
	const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('DELEGATE_')))
	return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...clean, HOME: home, USERPROFILE: home, ...env } })
}
const chat = (home: string) => JSON.parse(readFileSync(join(home, '.delegate-demo', 'root', 'demo', 'chats.json'), 'utf8'))['demo-chat'] as { body: string }[]

test('final P0-2 the demo acts only on its own sandbox, even with another root inherited', () => {
	const other = mkdtempSync(join(tmpdir(), 'delegate-other-')), mine = mkdtempSync(join(tmpdir(), 'delegate-mine-'))
	cli(other, ['demo', 'reset']); cli(mine, ['demo', 'reset'])
	const before = chat(other).length
	const r = cli(mine, ['demo', 'ok A2'], { DELEGATE_ROOT: join(other, '.delegate-demo', 'root'), DELEGATE_MODE: 'worker' })
	assert.match(r.stdout, /Sent A2 to Priya\./)
	assert.equal(chat(other).length, before, 'the inherited store received nothing')
	assert.match(chat(mine).at(-1)!.body, /set by admin policy/)
})
