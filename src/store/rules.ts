import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Rule } from '../core/types.ts'
import { readBack, RuleSchema, voteLimitNotice } from '../core/capabilities.ts'
import { assertTestSafe, writeJson } from './fs.ts'
import type { Store } from './state.ts'

export const rulesText = (store: Store) => existsSync(join(store.root, 'rules.md')) ? readFileSync(join(store.root, 'rules.md'), 'utf8') : ''
export function writeRules(store: Store, text: string, rules: Rule[]): string {
	const grants = rules.map(rule => ({ ...rule, ...RuleSchema.parse(rule) }))
	const file = join(store.root, 'rules.md'), source = text.trim() + '\n'
	assertTestSafe(file)
	writeFileSync(file, source)
	writeJson(join(store.root, 'rules.compiled.json'), { schema: 1, rules: grants, confirmedAt: new Date().toISOString(), sourceHash: createHash('sha256').update(source).digest('hex') }, store.machine)
	store.saveHeldRules({})
	return [`${grants.length} confirmed rule(s)`, ...grants.map(readBack), voteLimitNotice(text)].filter(Boolean).join('\n')
}
