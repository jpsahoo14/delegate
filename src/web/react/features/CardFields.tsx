import { useEffect } from 'react'
import type { CardUi } from '../data/store.ts'
import type { Entities } from '../domain/contracts.ts'

type FieldKey = 'editText' | 'answer' | 'ask' | 'report' | 'feedback' | 'watchText' | 'watchUntil'
export function Field({ code, rev, field, label, value, edit, rows = 3, placeholder, singleLine = false }: {
	code: string; rev: string; field: FieldKey; label: string; value: string; edit: (patch: Partial<CardUi>) => void; rows?: number; placeholder?: string; singleLine?: boolean
}) {
	const id = `${code}-${rev}-${field}`, Control = singleLine ? 'input' : 'textarea'
	useEffect(() => () => edit({ focusedField: undefined }), [edit])
	return <label className="field-label" htmlFor={id}><span>{label}</span><Control id={id} data-field={field} value={value} rows={singleLine ? undefined : rows} placeholder={placeholder}
		onChange={event => edit({ [field]: event.target.value })}
		onFocus={() => edit({ focusedField: field })}
		onBlur={() => edit({ focusedField: undefined })}
		onCompositionStart={() => edit({ composing: true })}
		onCompositionEnd={event => edit({ composing: false, [field]: event.currentTarget.value })}
		onKeyDown={event => {
			if (field !== 'ask' || event.key !== 'Enter') return
			event.stopPropagation()
			if (!singleLine && !event.ctrlKey && !event.metaKey) return
			event.preventDefault()
			if (!event.nativeEvent.isComposing && !event.repeat) event.currentTarget.closest('form, section')?.querySelector<HTMLButtonElement>('[data-action-kind=ask]')?.click()
		}}
	/></label>
}
export function Sources({ ids, entities }: { ids: string[]; entities: Entities }) {
	return <ul className="source-list">{ids.map(id => {
		const source = entities.sources[id]
		return <li key={id}><span>{source.kind}{source.locked ? ' - not visible to the recipient' : ''}: </span>
			{source.href ? <a href={source.href} target="_blank" rel="noopener noreferrer">{source.label}</a> : source.label}
			{source.stale && <span> - may be out of date</span>}
		</li>
	})}</ul>
}
