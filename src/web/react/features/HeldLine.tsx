import { undoHide, useHold } from '../data/hide-holds.ts'
import './held-line.css'

// A58 S-A2 (decision 54): the held hide verb's line in the item's place, "Closed. · Undo"; after the window it has no Undo.
// D-COST §14.6 (Designer check b): after Undo, focus returns to the restored card's ⋯, else to the restored row's title.
export function HeldLine({ item }: { item: string }) {
	const hold = useHold(item)
	if (!hold) return null
	return <p role="status" className="held-line">{hold.line}.{!hold.sent && <> · <button type="button" className="link-button" onClick={() => { undoHide(item); requestAnimationFrame(() => focusRestored(item)) }}>Undo</button></>}</p>
}
function focusRestored(item: string) {
	const code = CSS.escape(item)
	const more = document.querySelector<HTMLElement>(`article.item-card[aria-labelledby="card-title-${code}"] details.card-more-menu > summary`)
	if (more) return more.focus()
	const row = document.querySelector<HTMLElement>(`.now-row[data-code="${code}"], .ongoing-row[data-classic-progress="${code}"], .ongoing-row[data-classic-watch="${code}"], .ongoing-card[data-classic-waiting="${code}"], .ongoing-card[data-classic-watch="${code}"]`)
	row?.querySelector<HTMLElement>('.row-title, .ongoing-card-open, a[href], button')?.focus()
}