import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SKILL_DIR } from '../paths.ts'

// playbook: a file under workflows/ added to job prompts for this intent. tools: extra tools its jobs may use.
export type IntentDef = { id: string; when: string; playbook?: string; tools?: string[] }

const read = (p: string): IntentDef[] => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) : [])

// The bundled registry, with the owner's intents.json added or overriding by id. Adding an intent is an entry and a playbook file (R-RTE-02).
export function intents(root: string): IntentDef[] {
	const all = new Map(read(join(SKILL_DIR, 'intents.json')).map(i => [i.id, i]))
	for (const i of read(join(root, 'intents.json'))) all.set(i.id, { ...all.get(i.id), ...i })
	return [...all.values()]
}

export function intentPlaybook(root: string, def: IntentDef | undefined): string {
	if (!def?.playbook) return ''
	for (const p of [join(root, 'playbooks', def.playbook), join(SKILL_DIR, 'workflows', def.playbook)]) if (existsSync(p)) return readFileSync(p, 'utf8')
	return ''
}
