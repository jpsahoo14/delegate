import { create } from 'zustand'
import type { Snapshot } from '../domain/contracts.ts'

// D-WATCH' (Designer WS4; PE engineer-d-watch §8.7, CR B2 on 332441fc): the Stop / Start submission the page accepted, recorded from
// the data store's pending click (never from the press itself), so focus can return to the control's button when it completes. The
// receipt's words come from the saved outcome, not from here.
export const useWatchingPress = create<{ submissionId?: string }>(() => ({}))

// CR B1 on 332441fc: with checking off and Pause on, the pill is the neutral "Checking off · Paused", so the paused Health line
// (view.ts, an intentional state, not a problem) isn't a page notice then. Every other Health line, Pause alone and Stopped are as before.
export const offAndPaused = (snapshot?: Snapshot) => snapshot?.status.watching?.on === false && snapshot.status.state === 'paused'
export const noticeHealth = <T extends { id: string }>(health: T[], snapshot?: Snapshot) => offAndPaused(snapshot) ? health.filter(h => h.id !== 'paused') : health