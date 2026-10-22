import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAction, useSnapshot } from '../data/hooks.ts'
import { saveSeen } from '../services/api.ts'
import { useNavigation } from '../data/navigation.ts'
import { useScreenNavigation } from './navigation.tsx'

export function useClassicSeen() {
	const snapshot = useSnapshot(), { route } = useScreenNavigation(), client = useQueryClient()
	const [error, setError] = useState<string>()
	useEffect(() => {
		if (!snapshot) return
		const filter = route.startsWith('done') ? route.split('/')[1] ?? 'all' : undefined
		const code = route.startsWith('focus/') ? route.split('/')[1] : route === 'focus' ? snapshot.classic?.needsIds[0] : undefined
		const filters = filter ? filter === 'all' ? ['replies', 'reviews', 'changes', 'reminders', 'learned', 'catchup'] : [filter === 'closed' ? 'catchup' : filter] : code ? [`item:${code}`] : []
		if (!filters.length) return
		const timer = setTimeout(() => {
			if (document.visibilityState !== 'visible') return
			void saveSeen(filters, snapshot.now).then(() => {
				setError(undefined)
				void client.invalidateQueries({ queryKey: ['page'] })
			}, failure => {
				console.error('Could not save Classic seen marks:', failure)
				setError('Could not save what you have seen. New markers may return until the connection is restored.')
			})
		}, 1500)
		return () => clearTimeout(timer)
	}, [route, !!snapshot, client])
	return error
}

export function useClassicKeyboard() {
	const { route, navigate } = useScreenNavigation(), setHelp = useNavigation(state => state.setHelp)
	const snapshot = useSnapshot(), act = useAction()
	useEffect(() => {
		let prefix = ''
		const key = (event: KeyboardEvent) => {
			if (event.isComposing || event.defaultPrevented) return
			const element = event.target instanceof Element ? event.target : undefined
			const field = element?.closest<HTMLElement>('input,textarea,select,[contenteditable="true"]')
			if (event.key === 'Escape') {
				if (element?.closest('dialog')) return
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
			const direction = ['j', 'ArrowRight'].includes(event.key) ? 1 : ['k', 'ArrowLeft'].includes(event.key) ? -1 : 0
			if (route.startsWith('focus') && direction) {
				const ids = [...document.querySelectorAll<HTMLElement>('[data-classic-code]')].map(row => row.dataset.classicCode!)
				const code = route.split('/')[1] ?? ids[0], index = ids.indexOf(code), next = ids[index + direction]
				if (next) { event.preventDefault(); navigate(`focus/${next}`) }
			}
			const card = document.querySelector<HTMLElement>('.classic-open-card .item-card')
			if (event.key === 'e') card?.querySelector<HTMLButtonElement>('[data-card-edit]')?.click()
			if (event.key === 'a') card?.querySelector<HTMLTextAreaElement>('[data-field=ask]')?.focus()
			if (event.key === 'l') card?.querySelector<HTMLButtonElement>('[data-action-kind=later]')?.click()
			if (/^[1-9]$/.test(event.key)) {
				const choice = card?.querySelectorAll<HTMLInputElement>('fieldset:first-of-type input[type=radio],fieldset:first-of-type input[type=checkbox]')[Number(event.key) - 1]
				if (choice) { event.preventDefault(); choice.click() }
			}
			if (event.key === 'u' && snapshot) {
				const row = Object.values(snapshot.entities.doneEntries).find(row => row.actionIds.some(id => snapshot.entities.actions[id].kind === 'undo'))
				const id = row?.actionIds.find(id => snapshot.entities.actions[id].kind === 'undo')
				if (id) { event.preventDefault(); void act(snapshot.entities.actions[id]); navigate('done/replies') }
			}
		}
		addEventListener('keydown', key)
		return () => removeEventListener('keydown', key)
	}, [route, navigate, snapshot, act, setHelp])
}
