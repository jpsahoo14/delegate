import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { create } from 'zustand'
import { useQueryClient } from '@tanstack/react-query'
import { saveSeen } from '../services/api.ts'
import { useHolds } from './hide-holds.ts'
import type { Snapshot } from '../domain/contracts.ts'

// WDD N1 (Designer D1/D5): while he is looking at what Delegate did (Now's Done for you, or Done › By Delegate), the rows shown and their
// New marks stay put, even after the look is saved and the next snapshot drops them from the section; nothing vanishes under him. The
// look ends when he leaves; the next look shows the section as the projection has it (window closed and seen on an earlier look = gone).
type Wdd = NonNullable<Snapshot['wdd']>
// `saved`: the latest `wdd` seen time this page has SENT (CR 15:12:04 B5: set when the save goes out, not when a look is recorded, so an
// open look's section and its Mark all reviewed never narrow under him). A failed save takes it back.
export const useWddLook = create<{ looks: number; shown: string[]; fresh: string[]; saved: string; begin: (wdd: Wdd) => void; end: () => void }>(set => ({
	looks: 0, shown: [], fresh: [], saved: '',
	begin(raw) { set(state => {
		// The list may mount (render) before the previous list's save is sent, so a look begins from the data as that save leaves it.
		const wdd = afterSave(raw, state.saved)
		return {
			looks: state.looks + 1,
			shown: [...new Set([...(state.looks ? state.shown : []), ...wdd.section])],
			fresh: [...new Set([...(state.looks ? state.fresh : []), ...wdd.rows.filter(row => row.fresh).map(row => row.id)])],
		}
	}) },
	end() { set(state => (state.looks > 1 ? { looks: state.looks - 1 } : { looks: 0, shown: [], fresh: [] })) },
}))

// Until the page data reflects a sent save, the cached data must not begin a look with rows it covers (v1.141 section 5: a complete look
// then leaving empties the section). The projection's own rule applied to `saved`: a row at or before it is not fresh, and stays in the
// section only while its Undo window is open. Only ever narrower; once the next snapshot carries the save it changes nothing.
function afterSave(wdd: Wdd, saved: string): Wdd {
	if (!saved) return wdd
	const rows = wdd.rows.map(row => (row.fresh && row.at <= saved ? { ...row, fresh: false } : row)), byId = new Map(rows.map(row => [row.id, row]))
	return { ...wdd, rows, section: wdd.section.filter(id => (row => !row || !!row.undoUntil || row.fresh)(byId.get(id))), fresh: rows.filter(row => row.fresh).length }
}
export function useWddAfterSave(wdd: Wdd | undefined) {
	const saved = useWddLook(state => state.saved)
	return useMemo(() => (wdd ? afterSave(wdd, saved) : wdd), [wdd, saved])
}
// CR 15:12:04 / 15:37:28 B5: Mark all reviewed guards and counts the raw section, so it is offered only while that section is exactly the
// set of rows the list retains and shows (before the first-3 cut, the look's retained rows included). While they differ (a sent save the
// page data doesn't carry yet, or rows the look keeps that the section has dropped), the old offer is withheld until they match; no
// replacement token, the server checks unchanged.
export const wddOfferMatches = (raw: Wdd | undefined, ids: readonly string[]) => !!raw && raw.section.length === ids.length && (set => raw.section.every(id => set.has(id)))(new Set(ids))

// One look per mounted list: begin with what is shown now, add what arrives while it is open, end when it closes.
export function useWddLookFor(wdd: Wdd | undefined) {
	const begun = useRef(false)
	useEffect(() => {
		if (!wdd) return
		if (!begun.current) { begun.current = true; useWddLook.getState().begin(wdd); return }
		useWddLook.setState(state => ({ shown: [...new Set([...state.shown, ...wdd.section])], fresh: [...new Set([...state.fresh, ...wdd.rows.filter(row => row.fresh).map(row => row.id)])] }))
	}, [wdd])
	useEffect(() => () => { if (begun.current) useWddLook.getState().end() }, [])
	return useWddLook(state => state)
}

// Sending a seen time: `saved` moves first (so a list mounting next begins after it), the page data refreshes after, a failure restores it.
type Refresh = (() => void) | undefined
function sendSeen(at: string, refresh: Refresh) {
	const prior = useWddLook.getState().saved
	if (at > prior) useWddLook.setState({ saved: at })
	void saveSeen(['wdd'], at).then(() => refresh?.(), failure => {
		if (useWddLook.getState().saved === at) useWddLook.setState({ saved: prior })
		console.error('Could not save what Delegate did as seen:', failure)
	})
}
// CR 15:12:04 B4: a save held back under the surviving Mark all reviewed hold lives here, outside any list, with its hold subscription,
// until it is sent exactly once: when the hold entry goes (Undo, or the press settled), or at pagehide, which flushes it regardless of the
// hold (the page is going; the held press can no longer be sent). The pagehide listener is the page's, so leaving the list keeps it.
let deferred: { at: string; refresh: Refresh; stop: () => void } | undefined, pageListener = false
function flushDeferred(refresh: boolean) {
	const pending = deferred
	if (!pending) return
	deferred = undefined
	pending.stop()
	sendSeen(pending.at, refresh ? pending.refresh : undefined)
}
function deferSeen(at: string, refresh: Refresh) {
	if (!pageListener) { pageListener = true; addEventListener('pagehide', () => flushDeferred(false)) }
	if (deferred) { if (at > deferred.at) deferred.at = at; deferred.refresh = refresh ?? deferred.refresh; return }
	const stop = useHolds.subscribe(state => { if (!state.holds.wdd) flushDeferred(true) })
	deferred = { at, refresh, stop }
	if (!useHolds.getState().holds.wdd) flushDeferred(true)
}

// The existing look rule (D5) with PE v1.141 (CR 14:36:20 B3/B4). One global `wdd` time marks every row up to it seen, so an automatic look
// records it only when COMPLETE: every fresh row its surface owes him is rendered (Now's first 3; By Delegate unfiltered, no landing
// target). Otherwise it saves nothing and hidden rows stay New and in the section. After 1.5 s visible it records the snapshot's `now`;
// it saves when the look ends (leave or tab hidden), but never under a surviving Mark all reviewed hold: then once that hold is gone
// (Undo, or the press settled), so a look can never shrink the section under his own outstanding press. pagehide saves at once, the
// look's recorded time and any held-back one.
export function useWddSeen(ref: RefObject<HTMLElement | null>, wdd: Wdd | undefined, now: string | undefined, complete: boolean) {
	const client = useQueryClient(), key = wdd?.rows.filter(row => row.fresh).map(row => row.id).join(',') ?? ''
	const seenAt = useRef<string | undefined>(undefined), whole = useRef(complete)
	whole.current = complete
	useEffect(() => {
		if (!wdd || !now || !key || !complete) return
		const visible = () => {
			const box = ref.current?.getBoundingClientRect()
			return document.visibilityState === 'visible' && !!box && box.height > 0 && box.bottom > 0 && box.top < innerHeight
		}
		let timer: ReturnType<typeof setTimeout> | undefined
		const check = () => {
			if (timer || !visible()) return
			timer = setTimeout(() => { timer = undefined; if (visible() && whole.current && (!seenAt.current || seenAt.current < now)) seenAt.current = now }, 1500)
		}
		const scroll = () => { if (timer && !visible()) { clearTimeout(timer); timer = undefined }; check() }
		check()
		addEventListener('scroll', scroll, true); addEventListener('resize', scroll)
		return () => { clearTimeout(timer); removeEventListener('scroll', scroll, true); removeEventListener('resize', scroll) }
	}, [key, now, complete])
	useEffect(() => {
		const refresh = () => void client.invalidateQueries({ queryKey: ['page'] })
		const take = () => { const at = seenAt.current; seenAt.current = undefined; return at }
		const end = (fresh: boolean) => { const at = take(); if (at) deferSeen(at, fresh ? refresh : undefined) }
		const hidden = () => { if (document.visibilityState === 'hidden') end(false) }
		const leave = () => { const at = take(); if (at) sendSeen(at, undefined); flushDeferred(false) }
		document.addEventListener('visibilitychange', hidden); addEventListener('pagehide', leave)
		return () => { document.removeEventListener('visibilitychange', hidden); removeEventListener('pagehide', leave); end(true) }
	}, [client])
}
