import { create } from 'zustand'
import { useEffect, useRef, useState } from 'react'

export const usePageForms = create<{
	fields: Record<string, string>; setField: (key: string, value: string) => void
}>(set => ({
	fields: {}, setField: (key, value) => set(state => ({ fields: { ...state.fields, [key]: value } })),
}))
export function useSheet() {
	const [kind, setKind] = useState<string>(), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLElement | null>(null)
	useEffect(() => {
		if (kind && !dialog.current?.open) { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.current?.showModal() }
		if (!kind && dialog.current?.open) { dialog.current.close(); trigger.current?.focus() }
	}, [kind])
	return { kind, open: setKind, close: () => { setKind(undefined); trigger.current?.focus() }, dialog }
}
