import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAction, useSnapshot } from '../data/hooks.ts'
import { saveSeen } from '../services/api.ts'
import { useNavigation } from '../data/navigation.ts'
import { useNowLook } from '../data/look.ts'
import { useScreenNavigation } from './navigation.tsx'

export function useClassicSeen() {
	const snapshot = useSnapshot(), { route } = useScreenNavigation(), { error, mark } = useClassicMarkSeen()
	useEffect(() => { useNowLook.getState().end() }, [])
	useEffect(() => {
		if (!snapshot) return
		const filter = route.startsWith('done') ? route.split('/')[1] ?? 'all' : undefined
		const code = route.startsWith('focus/') ? route.split('/')[1] : route === 'focus' ? snapshot.classic?.needsIds[0] : undefined
		const filters = filter ? filter === 'all' ? ['replies', 'reviews', 'changes', 'reminders', 'learned', 'catchup'] : [filter === 'closed' ? 'catchup' : filter] : code ? [`item:${code}`] : []
		if (!filters.length) return
		const timer = setTimeout(() => {
			if (document.visibilityState !== 'visible') return
			mark(filters, snapshot.now)
		}, 1500)
		return () => clearTimeout(timer)
	}, [route, !!snapshot, mark])
	return error
}

export function useClassicMarkSeen() {
	const client = useQueryClient(), [error, setError] = useState<string>()
	const mark = useCallback((filters: string[], at: string) => {
		void saveSeen(filters, at).then(() => {
			setError(undefined)
			void client.invalidateQueries({ queryKey: ['page'] })
		}, failure => {
			console.error('Could not save Classic seen marks:', failure)
			setError('Could not save what you have seen. New markers may return until the connection is restored.')
		})
	}, [client])
	return { error, mark }
}

export function useClassicOffline() {
	const [offline, setOffline] = useState(() => !navigator.onLine)
	useEffect(() => {
		const changed = () => setOffline(!navigator.onLine)
		addEventListener('online', changed); addEventListener('offline', changed)
		return () => { removeEventListener('online', changed); removeEventListener('offline', changed) }
	}, [])
	return offline
}

export function useClassicKeyboard(offline: boolean) {
	const { route, navigate } = useScreenNavigation(), setHelp = useNavigation(state => state.setHelp)
	const snapshot = useSnapshot(), act = useAction()
	const order = useRef<string[]>([])
	useEffect(() => {
		order.current = route.startsWith('focus') ? [...new Set([...order.current, ...(snapshot?.classic?.needsIds ?? [])])] : []
	}, [route, snapshot?.classic?.needsIds])
	useEffect(() => {
		let prefix = ''
		const key = (event: KeyboardEvent) => {
			if (event.isComposing || event.defaultPrevented) return
			const element = event.target instanceof Element ? event.target : undefined
			const field = element?.closest<HTMLElement>('input,textarea,select,[contenteditable="true"]')
			if (element?.closest('.classic-card-menu')) return
			if (event.key === 'Escape') {
				if (element?.closest('dialog')) return
				if (useNavigation.getState().menu) { useNavigation.getState().setMenu(false); return }
				if (field) { field.blur(); document.querySelector<HTMLElement>('.classic-open-card .item-card')?.focus({ preventScroll: true }); return }
				useNavigation.getState().setMenu(false)
				navigate('home'); return
			}
			if (field || element?.closest('dialog') || event.ctrlKey || event.metaKey || event.altKey) return
			if (event.key === 'g') { prefix = 'g'; return }
			if (event.key === 'h' && prefix === 'g') { prefix = ''; event.preventDefault(); navigate('home'); return }
			prefix = ''
			if (event.key === '?') { event.preventDefault(); setHelp(true) }
			if (route === 'snapshot') return
			// Owner 13:41 (25 Oct): k = next, j = previous; the arrows stay spatial, → next and ← previous (PM 08:15:34Z).
			const direction = ['k', 'ArrowRight'].includes(event.key) ? 1 : ['j', 'ArrowLeft'].includes(event.key) ? -1 : 0
			if (route.startsWith('focus') && direction) {
				const ids = snapshot?.classic?.needsIds ?? []
				const code = route.split('/')[1] ?? ids[0], index = ids.indexOf(code), next = ids[index + direction]
				const afterHandled = index < 0 && direction > 0 ? order.current.slice(order.current.indexOf(code) + 1).find(id => ids.includes(id)) ?? ids[0] : undefined
				if (afterHandled || next) { event.preventDefault(); navigate(`focus/${afterHandled ?? next}`) }
			}
			const card = document.querySelector<HTMLElement>('.classic-open-card .item-card')
			if (event.key === 'e') card?.querySelector<HTMLButtonElement>('[data-card-edit]')?.click()
			if (event.key === 'a') card?.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-field=ask]')?.focus()
			if (event.key === 'l') card?.querySelector<HTMLButtonElement>('[data-action-kind=later]')?.click()
			if (/^[1-9]$/.test(event.key)) {
				const options = card?.querySelectorAll<HTMLInputElement>('[data-classic-option]')
				const choice = (options?.length ? options : card?.querySelectorAll<HTMLInputElement>('[data-classic-change]'))?.[Number(event.key) - 1]
				if (choice) { event.preventDefault(); choice.click() }
			}
			if (event.key === 'u' && snapshot && !offline) {
				// The newest undoable send, as the projection names it; object order follows delta updates, not time (bug 10-23 E97).
				const id = snapshot.lastUndoId && snapshot.entities.actions[snapshot.lastUndoId]?.kind === 'undo' ? snapshot.lastUndoId : undefined
				if (id) { event.preventDefault(); void act(snapshot.entities.actions[id]); navigate('done/replies') }
			}
		}
		addEventListener('keydown', key)
		return () => removeEventListener('keydown', key)
	}, [route, navigate, snapshot, act, setHelp, offline])
}
