import { useEffect, useState } from 'react'
import type { Action } from '../domain/contracts.ts'
import { ActionButton } from './ActionButton.tsx'

// A drafting style learned from the owner's edits: its words, saved as written (edit habits). Shared by New and Classic Settings.
export function StyleEditor({ action, style }: { action: Action; style: string }) {
	const [text, setText] = useState(style), id = `style-${action.item}`
	useEffect(() => setText(style), [style])
	const same = text.trim() === style.trim()
	return <label className="field-label style-editor" htmlFor={id}><small>How drafts are written</small><textarea id={id} rows={2} value={text} onChange={event => setText(event.target.value)} />
		<span className="action-bar"><ActionButton action={action} input={{ text }} disabled={!text.trim() || same} disabledReason={!text.trim() ? 'Type the style first.' : same ? 'Change the words first.' : undefined} /></span></label>
}
