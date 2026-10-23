import type { Config } from './types.ts'
import { pageDigest } from './page-approval.ts'
import { NAME } from '../brand.ts'

export type AgentSetupFailure = { kind: 'quota' | 'model' | 'auth' | 'cli'; text: string; retryAt?: string }
export type AgentHold = AgentSetupFailure & { config: string }

export function activeAgentHold(hold: AgentHold | undefined, agent: Config['agent'], now = Date.now()): AgentHold | undefined {
	return hold && hold.config === pageDigest(agent) && !(hold.retryAt && Date.parse(hold.retryAt) <= now) ? hold : undefined
}

export function agentSetupFailure(text: string, now = Date.now()): AgentSetupFailure | undefined {
	if (/exceeded your monthly quota|quota[_ -]exceeded/i.test(text)) {
		const milliseconds = /retry[_-]after[_-]ms["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i.exec(text)
		const seconds = /retry[_-]after["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i.exec(text)
		const delay = milliseconds ? Number(milliseconds[1]) : seconds ? Number(seconds[1]) * 1000 : undefined
		let retryAt: string | undefined, wait: string | undefined
		if (delay !== undefined && Number.isFinite(delay) && delay > 0 && now + delay < 8.64e15) {
			retryAt = new Date(now + delay).toISOString()
			const days = delay >= 86_400_000, amount = days ? Math.round(delay / 8_640_000) / 10 : Math.max(1, Math.ceil(delay / 3_600_000))
			wait = `${amount} ${days ? 'day' : 'hour'}${amount === 1 ? '' : 's'}`
		}
		return { kind: 'quota', retryAt, text: `The AI quota for this account is used up${wait ? ` (Copilot says: try again in about ${wait})` : ''}. Raise the budget in GitHub Copilot settings, or set another model in Settings.` }
	}
	if (/\bunknown model\b|\bmodel_not_found\b|\bmodel\s+(?:["'][^"'\r\n]{1,160}["']|[\w./:-]+)(?:\s+from\s+--model\s+flag)?\s+(?:is\s+)?(?:not available|unavailable|not found)/i.test(text)) {
		return { kind: 'model', text: 'The selected AI model is not available to this account. Set another model in Settings.' }
	}
	// Not signed in, or the AI CLI is not there: setup the owner fixes, so items wait and are tried again every 10 minutes (queue-new #11).
	const later = new Date(now + 10 * 60_000).toISOString()
	if (/bad credentials|not logged in|please run \/login|unauthori[sz]ed|not signed in|sign[ -]?in (?:required|again)|authentication (?:failed|required)/i.test(text)) {
		return { kind: 'auth', retryAt: later, text: `The AI CLI is not signed in on this machine. Sign in to it once; ${NAME} tries again every 10 minutes.` }
	}
	if (/\bENOENT\b|is not recognized as an internal or external command|command not found|cannot find the (?:AI )?CLI/i.test(text)) {
		return { kind: 'cli', retryAt: later, text: `The AI CLI could not be started on this machine. Install it, or fix its path in setup; ${NAME} tries again every 10 minutes.` }
	}
	return undefined
}
