import { useEffect, useRef } from 'react'
import { useSnapshot } from './hooks.ts'
import { useData } from './store.ts'
import { useSettingsDrafts } from './screens.ts'
import { usePageForms } from './forms.ts'
import { hasUnsentWork, useInterface } from './interface.ts'

export function useVersionUpdate() {
	const snapshot = useSnapshot(), first = useRef<string | undefined>(undefined)
	const edits = useData(state => state.byRevision), settings = useSettingsDrafts(state => state.drafts), forms = usePageForms(state => state.fields)
	const reload = useInterface(state => state.reloadPreview)
	const code = snapshot?.version?.code
	if (!first.current && code) first.current = code
	const available = first.current && code && first.current !== code ? code : undefined
	useEffect(() => {
		if (!available || hasUnsentWork() || Object.values(edits).some(ui => ui.pending)) return
		const timer = setTimeout(() => { if (!hasUnsentWork() && !Object.values(useData.getState().byRevision).some(ui => ui.pending)) reload() }, 1200)
		return () => clearTimeout(timer)
	}, [available, edits, settings, forms, reload])
	return { available, reload }
}
