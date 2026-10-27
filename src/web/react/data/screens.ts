import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { useState } from 'react'
import { fetchNumbers, fetchSettings, saveSetting } from '../services/api.ts'
import type { Settings } from '../domain/screens.ts'

export const useSettingsDrafts = create<{ drafts: Record<string, string>; set: (key: string, value?: string) => void }>(set => ({
	drafts: {},
	set(key, value) { set(state => {
		const drafts = { ...state.drafts }
		if (value === undefined) delete drafts[key]; else drafts[key] = value
		return { drafts }
	}) },
}))
export const useSettings = (experience: 'new' | 'classic' = 'new') => useQuery({ queryKey: experience === 'classic' ? ['settings', 'classic'] : ['settings'], queryFn: ({ signal }) => fetchSettings(signal, experience), retry: false, refetchInterval: 20_000 })
export function useSetting(row: Settings['rows'][number]) {
	const value = useSettingsDrafts(state => state.drafts[row.key]) ?? row.value
	const client = useQueryClient()
	const mutation = useMutation({
		mutationFn: (nextValue: string) => saveSetting(row.key, nextValue),
		async onSuccess(result, submittedValue) {
			if (result.ok) {
				await client.invalidateQueries({ queryKey: ['settings'] })
				if (useSettingsDrafts.getState().drafts[row.key] === submittedValue) useSettingsDrafts.getState().set(row.key)
				void client.invalidateQueries({ queryKey: ['page'] })
			}
		},
	})
	return {
		value, changed: value !== row.value, busy: mutation.isPending,
		text: mutation.error?.message ?? mutation.data?.text,
		error: !!mutation.error || mutation.data?.ok === false,
		setValue: (value: string) => useSettingsDrafts.getState().set(row.key, value === row.value ? undefined : value),
		save: () => mutation.mutate(value),
		toggle: () => mutation.mutate(value === 'true' ? 'false' : 'true'),
	}
}
export function useNumbers(window: string) {
	return useQuery({ queryKey: ['numbers', window], queryFn: ({ signal }) => fetchNumbers(window, signal), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: 'always' })
}
// D-COST PE §9: a custom window lives in the page URL (?w=custom&from&to, beside the token) and is not saved anywhere else; a fixed
// window keeps the URL clean.
const DAY = /^\d{4}-\d{2}-\d{2}$/
function windowFromUrl() {
	const q = new URLSearchParams(globalThis.location?.search ?? ''), from = q.get('from') ?? '', to = q.get('to') ?? ''
	return q.get('w') === 'custom' && DAY.test(from) && DAY.test(to) ? `custom:${from}:${to}` : 'this'
}
export const useNumberWindow = create<{ window: string; setWindow: (window: string) => void }>(set => ({
	window: windowFromUrl(),
	setWindow: window => {
		set({ window })
		try {
			const url = new URL(location.href), [key, from, to] = window.split(':')
			for (const k of ['w', 'from', 'to']) url.searchParams.delete(k)
			if (key === 'custom') { url.searchParams.set('w', 'custom'); url.searchParams.set('from', from); url.searchParams.set('to', to) }
			history.replaceState(history.state, '', url)
		} catch (error) { console.error('Could not keep the Numbers range in the address:', error) }
	},
}))
export function useCopySummary() {
	const [message, setMessage] = useState<string>()
	return { message, copy: async (summary: string) => {
		try { await navigator.clipboard.writeText(summary); setMessage('Numbers-only summary copied.') } catch (error) {
			console.error('Could not copy the numbers summary:', error)
			setMessage('Could not copy. Select the summary below and copy it.')
		}
	} }
}
