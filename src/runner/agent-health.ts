import type { Config } from '../core/types.ts'
import { activeAgentHold, type AgentHold, type AgentSetupFailure } from '../core/agent-failure.ts'
import { pageDigest } from '../core/page-approval.ts'
import type { Store } from '../store/state.ts'
import { statusFields } from '../core/upgrades.ts'

export function waitingForAgent(store: Store, hold: AgentHold) {
	const queued = store.jobs().filter(job => job.state === 'queued')
	for (const job of queued) if (job.error !== hold.text) { job.error = hold.text; store.saveJob(job) }
	for (const item of store.workflows()) {
		if (item.state !== 'running' && !(item.state === 'waiting_on_task' && queued.some(job => job.id === item.job))) continue
		if (item.statusReason?.kind !== 'could-not-start' || item.statusReason.text !== hold.text) { Object.assign(item, statusFields('could-not-start', hold.text)); store.save(item) }
	}
}

export function blockedAgent(store: Store, cfg: Config, now = Date.now()): AgentHold | undefined {
	const hold = store.agentHold()
	if (!hold) return undefined
	if (!activeAgentHold(hold, cfg.agent, now)) {
		store.saveAgentHold()
		store.setHealth('agent-setup')
		store.log({ event: 'agent-setup-resumed', reason: hold.config !== pageDigest(cfg.agent) ? 'AI configuration changed' : 'retry time reached' })
		return undefined
	}
	if (store.health()['agent-setup']?.text !== hold.text) store.setHealth('agent-setup', hold.text)
	return hold
}

export function holdAgent(store: Store, cfg: Config, failure: AgentSetupFailure): AgentHold {
	const hold = { ...failure, config: pageDigest(cfg.agent) }
	store.saveAgentHold(hold)
	store.setHealth('agent-setup', hold.text)
	waitingForAgent(store, hold)
	store.log({ event: 'agent-setup-held', kind: hold.kind, retryAt: hold.retryAt, reason: hold.text })
	return hold
}
