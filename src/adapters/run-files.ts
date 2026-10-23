import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { alive, commandOf } from '../os/process.ts'
import { assertTestSafe } from '../store/fs.ts'

export const promptFolder = (config: string) => join(dirname(config), `prompt-${basename(config, '.json')}`)

export function ownRunFiles(config: string, pid: number, interactive = false) {
	const folder = promptFolder(config)
	assertTestSafe(folder)
	mkdirSync(folder, { recursive: true })
	writeFileSync(join(folder, 'owner.json'), JSON.stringify({ pid, interactive }), { mode: 0o600 })
}

export function removeRunFiles(config: string) {
	const folder = promptFolder(config)
	assertTestSafe(folder); assertTestSafe(config)
	rmSync(folder, { recursive: true, force: true })
	rmSync(config, { force: true })
}

function inUse(folder: string): boolean {
	const file = join(folder, 'owner.json')
	if (!existsSync(file)) return false
	const owner: unknown = JSON.parse(readFileSync(file, 'utf8'))
	if (!owner || typeof owner !== 'object' || !('pid' in owner) || typeof owner.pid !== 'number' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error(`Invalid run-file owner in ${file}`)
	if (!alive(owner.pid)) return false
	const command = commandOf(owner.pid)
	return command === undefined || command.includes(basename(folder)) || 'interactive' in owner && owner.interactive === true && /\bcontinue\b/.test(command)
}

export function pruneRunFiles(directory: string, now = Date.now()) {
	assertTestSafe(directory)
	if (!existsSync(directory)) return
	const cutoff = now - 86_400_000
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isSymbolicLink() || !(entry.isDirectory() && entry.name.startsWith('prompt-') || entry.isFile() && /^mcp-[\w-]+\.json$/.test(entry.name))) continue
		const file = join(directory, entry.name)
		try {
			if (lstatSync(file).mtimeMs >= cutoff) continue
			if (entry.isDirectory()) {
				if (!existsSync(join(file, 'instructions.md')) && !existsSync(join(file, 'owner.json'))) continue
				if (!inUse(file)) rmSync(file, { recursive: true, force: true })
			} else if (!inUse(promptFolder(file))) rmSync(file, { force: true })
		} catch (error) {
			console.error(`Could not clean stale worker files at ${file}:`, error)
		}
	}
}
