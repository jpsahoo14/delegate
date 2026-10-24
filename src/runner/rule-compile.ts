import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { agentSetupFailure } from '../core/agent-failure.ts'
import { ulid } from '../core/ids.ts'
import { RuleCompileSchema, ruleTextHash, type RuleLine } from '../core/rule-lines.ts'
import type { Config } from '../core/types.ts'
import { removeRunFiles } from '../adapters/run-files.ts'
import { writeJson } from '../store/fs.ts'
import { finishRuleCompile, type RuleWriteResult } from '../store/rules.ts'
import { LOCAL_DIR, type Store } from '../store/state.ts'
import { buildRulePrompt } from '../worker/rule-prompt.ts'
import { holdAgent } from './agent-health.ts'
import type { RunWorker } from './dispatch.ts'

export async function compileRule(store: Store, cfg: Config, line: RuleLine, run: RunWorker): Promise<RuleWriteResult> {
	const expectedTextHash = ruleTextHash(line.text), runId = ulid(), sessionId = randomUUID()
	const cwd = join(LOCAL_DIR, 'sessions'), mcpConfigPath = join(cwd, `mcp-${runId}.json`)
	const accounts: Record<string, string> = { [cfg.owner.id]: cfg.owner.name }
	for (const person of cfg.policy?.never ?? []) accounts[person.id] = person.name
	for (const member of Object.values(store.members())) for (const id of member.ids) {
		if (member.names?.[id]) accounts[id] = member.names[id]
	}
	// Compiling text has no worker/report server and none of the owner's effect or read tools.
	writeJson(mcpConfigPath, { mcpServers: {} }, store.machine)
	try {
		store.addRun()
		const result = await run({ ...cfg.agent, tools: [], mcpServers: {} }, {
			workflowId: line.id, runId, sessionId, purpose: 'rule-compile',
			prompt: buildRulePrompt(line, cfg, accounts), cwd, mcpConfigPath, extraTools: [], dirs: [],
		})
		store.log({ event: 'rule-compile-run', id: line.id, runId, sessionId: result.sessionId ?? sessionId, textHash: expectedTextHash,
			exitCode: result.exitCode, ms: result.ms, via: result.via, warm: result.warm, error: result.error, ...result.used })
		const setupRefusal = (): RuleWriteResult | undefined => {
			const setup = result.setup ?? agentSetupFailure(`${result.error ?? ''}\n${result.summary ?? ''}`)
			if (!setup) return undefined
			holdAgent(store, cfg, setup)
			return { ok: false, why: setup.text }
		}
		if (result.exitCode !== 0 || result.error) return setupRefusal() ?? { ok: false, why: result.error || 'The AI could not finish reading this line; your text is kept.' }
		let rawOutput: unknown
		try { rawOutput = JSON.parse(result.summary ?? '') }
		catch {
			const refusal = setupRefusal()
			if (refusal) return refusal
			throw new Error('The AI returned invalid rule JSON; your text is kept.')
		}
		const parsed = RuleCompileSchema.safeParse(rawOutput)
		if (parsed.success && parsed.data.grants.some(grant => grant.who.accounts?.some(account => !Object.hasOwn(accounts, account.id) || account.name !== accounts[account.id]))) {
			return { ok: false, why: "Couldn't resolve the people in this line; your text is kept." }
		}
		return finishRuleCompile(store, line.id, expectedTextHash, rawOutput)
	} finally { removeRunFiles(mcpConfigPath) }
}
