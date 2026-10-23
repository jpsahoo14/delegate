import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Delegate runs from source (src/cli.ts) or from the bundle (dist/delegate.mjs). Both find the same files from here.
const here = dirname(fileURLToPath(import.meta.url))

function up(rel: string): string {
	for (let d = here, i = 0; i < 4; i++, d = dirname(d)) if (existsSync(join(d, rel))) return join(d, rel)
	return join(here, '..', rel)
}

export const ROOT = dirname(up('package.json'))
export const VERSION: string = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version } catch { return '0.0.0' } })()
export const SKILL_DIR = up(join('skills', 'delegate'))
// The Copilot CLI extension's files (extension.mjs, inbox.mjs). The bundle carries a copy next to it.
export const MESH_DIR = here.endsWith('dist') ? join(here, 'mesh') : join(ROOT, 'src', 'mesh')
// The entry other processes start: the bundle when running from it, else the source CLI.
export const CLI = here.endsWith('dist') ? join(here, 'delegate.mjs') : join(ROOT, 'src', 'cli.ts')
