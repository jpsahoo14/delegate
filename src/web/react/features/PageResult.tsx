import { useState } from 'react'
import type { Receipt } from '../domain/contracts.ts'
import { useNavigation } from '../data/navigation.ts'
import { usePageResult, usePendingClicks } from '../data/result-line.ts'
import { codeHover } from '../domain/hover.ts'
import { Button } from '../components/ui/button.tsx'

// The newest click's result at the top of the page (#47): who and which chat, Open and close; the item's code only in the tooltip.
// override: words the page decides itself (Classic's reopened question).
export function PageResult({ result, experience, override }: { result?: Receipt; experience: 'new' | 'classic'; override?: string }) {
	const route = useNavigation(state => state.route)
	const line = usePageResult(result, route, experience)
	const words = line && (override ?? line.words)
	// Grey while it is being worked on; only a failure is in warn colour (PM 18:29). A receipt with no words shows no line.
	const tone = result?.outcome?.kind === 'failed' || result?.uncertain ? 'warn' : result?.outcome?.kind === 'queued' ? 'muted' : undefined
	return <div className="live-result" data-tone={words ? tone : undefined} role={result?.refused || result?.uncertain ? 'alert' : 'status'} aria-live="polite" title={words && result?.item ? codeHover(result.item) : undefined}>{words && line && <>
		<span>{words}</span>
		{line.open && <a className="live-result-open" href={`#${line.open}`} onClick={line.close}>Open</a>}
		<Button variant="ghost" size="icon-xs" className="live-result-close" aria-label="Close this message" onClick={line.close}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></Button>
	</>}</div>
}

// Clicks still waiting for their saved result (#47 c, PM copy #27 poll): grey, never red; the button lists them by person and chat.
export function PendingClicks({ experience }: { experience: 'new' | 'classic' }) {
	const clicks = usePendingClicks(experience), [open, setOpen] = useState(false)
	if (!clicks.length) return null
	return <div className="pending-clicks" role="status">
		<button type="button" className="pending-clicks-toggle" aria-expanded={open} aria-controls="pending-clicks-list" onClick={() => setOpen(!open)}>Finishing {clicks.length} earlier click{clicks.length === 1 ? '' : 's'}…</button>
		{open && <ul id="pending-clicks-list">{clicks.map(click => <li key={click.id}>{click.label}{click.open && <> <a href={`#${click.open}`}>Open</a></>}</li>)}</ul>}
	</div>
}
