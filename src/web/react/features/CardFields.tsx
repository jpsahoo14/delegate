import { useEffect, useLayoutEffect, useRef } from 'react'
import type { CardUi } from '../data/store.ts'
import type { Entities } from '../domain/contracts.ts'

type FieldKey = 'editText' | 'answer' | 'ask' | 'report' | 'feedback' | 'watchText' | 'watchUntil'
export function Field({ code, rev, field, label, value, edit, rows = 3, placeholder, singleLine = false, patch, describedBy, mark, framed = false, footer }: {
	code: string; rev: string; field: FieldKey; label: string; value: string; edit: (patch: Partial<CardUi>) => void; rows?: number; placeholder?: string; singleLine?: boolean
	patch?: (value: string) => Partial<CardUi>; describedBy?: string; mark?: string
	// I34 (Designer, designer-automated-marker.md): one frame holding the text and a fixed footer row (the marker Teams will add), a
	// sibling of the textarea, so it can't be selected into, typed into or deleted; clicking it puts the caret at the end of his words.
	framed?: boolean; footer?: string
}) {
	const id = `${code}-${rev}-${field}`, Control = singleLine ? 'input' : 'textarea'
	const control = useRef<HTMLTextAreaElement & HTMLInputElement>(null), mirror = useRef<HTMLDivElement>(null)
	const at = mark && !singleLine ? value.indexOf(mark) : -1
	useMarkMirror(control, mirror, at >= 0)
	const change = (value: string) => patch ? patch(value) : { [field]: value }
	useEffect(() => () => edit({ focusedField: undefined }), [edit])
	const box = <>
		{at >= 0 && <div ref={mirror} className="field-mark" aria-hidden="true">{value.slice(0, at)}<mark>{mark}</mark>{value.slice(at + mark!.length)}{'\n'}</div>}
		<Control ref={control} id={id} data-field={field} value={value} rows={singleLine ? undefined : rows} placeholder={placeholder} aria-describedby={describedBy}
		onChange={event => edit(change(event.target.value))}
		onFocus={() => edit({ focusedField: field })}
		onBlur={() => edit({ focusedField: undefined })}
		onCompositionStart={() => edit({ composing: true })}
		onCompositionEnd={event => edit({ composing: false, ...change(event.currentTarget.value) })}
		onKeyDown={event => {
			if (field !== 'ask' || event.key !== 'Enter') return
			event.stopPropagation()
			if (!singleLine && !event.ctrlKey && !event.metaKey) return
			event.preventDefault()
			if (!event.nativeEvent.isComposing && !event.repeat) event.currentTarget.closest('form, section')?.querySelector<HTMLButtonElement>('[data-action-kind=ask]')?.click()
		}}
	/></>
	const toEnd = (event: { preventDefault(): void }) => { event.preventDefault(); const area = control.current; if (!area) return; area.focus(); area.setSelectionRange(area.value.length, area.value.length) }
	return <label className="field-label" htmlFor={id} style={at >= 0 && !framed ? { position: 'relative' } : undefined}><span>{label}</span>
		{framed ? <div className="reply-frame">{box}{footer && <div className="reply-footer" aria-hidden="true" onMouseDown={toEnd} onClick={toEnd}>{footer}</div>}</div> : box}
	</label>
}
// A37 (b) / PM A R37: the words a vote claim quotes, highlighted in the editor: a mirror of the textarea (its computed font, padding,
// border, size and scroll) drawn over it with transparent text and a tinted mark, so typing, selection and the caret are untouched.
const MIRRORED = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'tabSize', 'boxSizing',
	'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRadius'] as const
function useMarkMirror(control: { current: HTMLElement | null }, mirror: { current: HTMLDivElement | null }, on: boolean) {
	useLayoutEffect(() => {
		const area = control.current, copy = mirror.current
		if (!on || !area || !copy) return
		const sync = () => {
			const style = getComputedStyle(area)
			for (const key of MIRRORED) copy.style[key] = style[key]
			Object.assign(copy.style, { top: `${area.offsetTop}px`, left: `${area.offsetLeft}px`, width: `${area.offsetWidth}px`, height: `${area.offsetHeight}px` })
			copy.scrollTop = area.scrollTop
		}
		sync()
		const resize = new ResizeObserver(sync)
		resize.observe(area)
		area.addEventListener('scroll', sync)
		return () => { resize.disconnect(); area.removeEventListener('scroll', sync) }
	})
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
