import { useState } from 'react'
import { useCardUi, useEntities } from '../data/hooks.ts'
import type { Entities } from '../domain/contracts.ts'
import { NAME } from '../brand.ts'
import { when } from '../domain/time.ts'
import { Icon } from '../components/ui/icon.tsx'
import { ActionButton } from './ActionButton.tsx'

function HealthNotice({ health, more = [] }: { health: Entities['health'][string]; more?: Entities['health'][string][] }) {
	const entities = useEntities(), ui = useCardUi('', '')
	const [expanded, setExpanded] = useState(false)
	const active = health.actionIds.includes(ui.lastAction ?? ui.pending?.action ?? '')
	return <section className="health-banner" data-details-open={expanded || undefined} aria-label={`Problem with ${NAME}`}><button className="health-details-icon" aria-label={expanded ? 'Hide problem details' : 'Show problem details'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Icon name="warn" className="health-icon" /></button><p><strong>{health.text}</strong>
		{health.since && <span className="health-age"> Since {when(health.since)}.</span>}
		{more.length > 0 && <button className="health-more-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}> And {more.length} more {more.length === 1 ? 'problem' : 'problems'}.</button>}
		{active && <span className="health-result" role={ui.error || ui.result?.refused || ui.result?.uncertain ? 'alert' : 'status'}> {ui.error ?? ui.result?.text ?? (ui.pending ? 'Checking...' : '')}</span>}
	</p><div className="health-actions">{health.actionIds.map(id => <ActionButton key={id} action={entities.actions[id]} />)}</div>
		{expanded && <div className="health-extra">{more.map(problem => <HealthNotice key={problem.id} health={problem} />)}</div>}
	</section>
}

export function Problems() {
	const entities = useEntities(), health = Object.values(entities.health)
	return health[0] ? <HealthNotice health={health[0]} more={health.slice(1)} /> : null
}
