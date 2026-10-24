import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Rule } from '../core/types.ts'
import { readBack, REVIEW_RULE_TEXT, RuleSchema, voteLimitNotice } from '../core/capabilities.ts'
import { assertTestSafe, writeJson } from './fs.ts'
import type { Store } from './state.ts'

export const rulesText = (store: Store) => existsSync(join(store.root, 'rules.md')) ? readFileSync(join(store.root, 'rules.md'), 'utf8') : ''
export const ruleTextHash = (text: string) => createHash('sha256').update(text.trim()).digest('hex')
export function writeRules(store: Store, text: string, rules: Rule[]): string {
	const settings = store.rules().filter(r => r.source === 'settings' && r.textHash === ruleTextHash(r.text) && text.split('\n').some(line => line.trim().replace(/^[-*]\s+/, '') === r.text.trim()))
	const grants: Rule[] = rules.map(rule => {
		const kept = settings.find(r => r.text === rule.text) ??
			(rule.source === 'settings' && rule.text === REVIEW_RULE_TEXT && rule.textHash === ruleTextHash(rule.text) &&
				text.split('\n').some(line => line.trim().replace(/^[-*]\s+/, '') === rule.text) ? rule : undefined)
		return { ...rule, ...RuleSchema.parse(rule), source: kept?.source, textHash: kept?.textHash }
	})
	for (const kept of settings) if (!grants.some(r => r.id === kept.id || r.text === kept.text)) grants.push(kept)
	const file = join(store.root, 'rules.md'), source = text.trim() + '\n'
	assertTestSafe(file)
	writeFileSync(file, source)
	writeJson(join(store.root, 'rules.compiled.json'), { schema: 1, rules: grants, confirmedAt: new Date().toISOString(), sourceHash: createHash('sha256').update(source).digest('hex') }, store.machine)
	store.saveHeldRules({})
	return [`${grants.length} confirmed rule(s)`, ...grants.map(readBack), voteLimitNotice(text)].filter(Boolean).join('\n')
}
export function toggleReviewRules(store: Store, on: boolean) {
	let rules = store.rules(), text = rulesText(store)
	if (!rules.some(r => r.then === 'review') && on) {
		let n = 1
		while (rules.some(r => r.id === `R${n}`)) n++
		const line = REVIEW_RULE_TEXT
		rules = [...rules, { id: `R${n}`, text: line, source: 'settings', textHash: ruleTextHash(line), who: { group: 'org' }, when: { intent: 'pr_review' }, then: 'review', review: { comments: 'post', reply: 'send' } }]
		text = `${text.trim()}\n- ${line}`.trim()
	}
	return writeRules(store, text, rules.map(r => r.then === 'review' ? { ...r, off: on ? undefined : true } : r))
}
