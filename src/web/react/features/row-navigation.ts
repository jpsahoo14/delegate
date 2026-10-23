import type { MouseEvent } from 'react'

export function isolateRowControls(event: MouseEvent<HTMLElement>) {
	// A control can remove itself before the row's click handler runs.
	const path = event.nativeEvent.composedPath(), row = path.indexOf(event.currentTarget)
	if (row < 0) return
	const inside = path.slice(0, row).filter((node): node is Element => node instanceof Element)
	if (!inside.some(node => node.matches('button,input,textarea,select,label,summary,form,fieldset,[role="button"],[contenteditable="true"],[data-row-controls]'))) return
	event.stopPropagation()
	if (inside.some(node => node.matches('button,[role="button"],[data-row-controls]')) && path.some(node => node instanceof Element && node.matches('a[href]'))) event.preventDefault()
}
