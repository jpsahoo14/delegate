import { create } from 'zustand'
import type { Placement } from '../domain/contracts.ts'

export const useNowLook = create<{
	markers: Record<string, Placement['chips']>; active: boolean
	begin: (placements: Record<string, Placement>) => void; end: () => void
}>(set => ({
	markers: {}, active: false,
	begin(placements) { set(state => {
		const markers = state.active ? { ...state.markers } : {}
		for (const row of Object.values(placements)) {
			const incoming = row.chips.filter(chip => chip.kind === 'new' || chip.kind === 'back'), previous = markers[row.id]
			if (!previous || (incoming.some(chip => chip.kind === 'back') && !previous.some(chip => chip.kind === 'back')) || (incoming.length > 0 && previous.length === 0)) markers[row.id] = incoming
		}
		return { active: true, markers }
	}) },
	end() { set({ active: false, markers: {} }) },
}))
