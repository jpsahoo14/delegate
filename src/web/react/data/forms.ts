import { create } from 'zustand'
import { useEffect, useRef, useState } from 'react'
import type { Action } from '../domain/contracts.ts'

export const usePageForms = create<{
	fields: Record<string, string>; composing: boolean
	setField: (key: string, value: string) => void; setComposing: (value: boolean) => void
}>(set => ({
	fields: {}, composing: false,
	setField: (key, value) => set(state => ({ fields: { ...state.fields, [key]: value } })),
	setComposing: composing => set({ composing }),
}))
export type SubmittedForm = { fields: Record<string, string | undefined> }
export function capturePageForm(action: Action): SubmittedForm | undefined {
	const keys = action.kind === 'remind-someone' ? ['remind-someone/text', 'recipientId', 'to', 'at', 'every', 'day'] :
		action.kind === 'watch-something' ? ['watch-something/text', 'until', 'by', 'push'] :
			action.kind === 'report-problem' ? ['report-problem/text'] :
				action.kind === 'paste-missed' ? ['paste-missed/text'] :
					action.kind === 'interval' ? [`interval:${action.item}`] : undefined
	return keys && { fields: Object.fromEntries(keys.map(key => [key, usePageForms.getState().fields[key]])) }
}
export function consumePageForm(form: SubmittedForm): boolean {
	const state = usePageForms.getState()
	if (state.composing || Object.entries(form.fields).some(([key, value]) => state.fields[key] !== value)) return false
	const fields = { ...state.fields }
	for (const key of Object.keys(form.fields)) delete fields[key]
	usePageForms.setState({ fields })
	return true
}
export const hasPageFormFields = (form: SubmittedForm) => Object.keys(form.fields).some(key => Object.hasOwn(usePageForms.getState().fields, key))
export function useSheet() {
	const [kind, setKind] = useState<string>(), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLElement | null>(null)
	useEffect(() => {
		if (kind && !dialog.current?.open) { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.current?.showModal() }
		if (!kind && dialog.current?.open) { dialog.current.close(); trigger.current?.focus() }
	}, [kind])
	return { kind, open: setKind, close: () => { setKind(undefined); trigger.current?.focus() }, dialog }
}
