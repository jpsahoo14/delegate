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
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: ({ signal }) => fetchSettings(signal), retry: false })
export function useSetting(row: Settings['rows'][number]) {
	const value = useSettingsDrafts(state => state.drafts[row.key]) ?? row.value
	const client = useQueryClient()
	const mutation = useMutation({
		mutationFn: () => saveSetting(row.key, value),
		async onSuccess(result) {
			if (result.ok) {
				await client.invalidateQueries({ queryKey: ['settings'] })
				useSettingsDrafts.getState().set(row.key)
				void client.invalidateQueries({ queryKey: ['page'] })
			}
		},
	})
	return {
		value, changed: value !== row.value, busy: mutation.isPending,
		text: mutation.error?.message ?? mutation.data?.text,
		error: !!mutation.error || mutation.data?.ok === false,
		setValue: (value: string) => useSettingsDrafts.getState().set(row.key, value === row.value ? undefined : value),
		save: () => mutation.mutate(),
	}
}
export function useNumbers(window: string) {
	return useQuery({ queryKey: ['numbers', window], queryFn: ({ signal }) => fetchNumbers(window, signal), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: 'always' })
}
export function useCopySummary() {
	const [message, setMessage] = useState<string>()
	return { message, copy: async (summary: string) => {
		try { await navigator.clipboard.writeText(summary); setMessage('Numbers-only summary copied.') } catch (error) {
			console.error('Could not copy the numbers summary:', error)
			setMessage('Could not copy. Select the summary below and copy it.')
		}
	} }
}
