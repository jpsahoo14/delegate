import { useMemo } from 'react'
import { useData } from './store.ts'

export function useKnowledgeProposals() {
	const proposals = useData(state => state.entities.knowledgeProposals), pins = useData(state => state.pinned)
	return useMemo(() => {
		const result = { ...proposals }
		for (const [code, pin] of Object.entries(pins)) {
			const proposal = pin.snapshot.entities.knowledgeProposals[code]
			if (proposal) result[code] = proposal
		}
		return Object.values(result).filter(proposal => {
			const entities = pins[proposal.id]?.snapshot.entities ?? useData.getState().entities
			return proposal.state === 'needs_human' || proposal.actionIds.some(id => entities.actions[id]?.kind === 'save-facts')
		})
	}, [proposals, pins])
}
