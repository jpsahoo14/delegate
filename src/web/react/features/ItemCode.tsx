import { useEffect, useState, type MouseEvent } from 'react'
import { useNavigation } from '../data/navigation.ts'
import { NAME } from '../brand.ts'
import { Hint } from '../components/ui/button.tsx'
import { codeHover } from '../domain/hover.ts'

// PM A R35 (b): the item code, visible and copyable: just "A48", small, muted, monospace. One component for New and Classic, at the end
// of the card's head-line meta and at the right end of every Needs you / Ongoing / Done row. Sentences never use codes; only this does.
export const CODE = /^[A-Z]\d+$/i
// PM A R38 (2): Classic has no Find, so its tooltip names only the chat; New keeps Find.
export const itemCodeHover = (code: string, classic = false) => /^A\d+$/i.test(code) ? `Item code: say "look at ${code}"${classic ? ` to ${NAME}.` : ', or type it in Find.'}` : codeHover(code)

// I1 (PE 02:09): true only when the code is really on the clipboard.
export async function copyText(text: string): Promise<boolean> {
	try { await navigator.clipboard.writeText(text); return true } catch { /* falls back below */ }
	const area = document.createElement('textarea')
	area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'
	document.body.append(area); area.select()
	try { return document.execCommand('copy') } catch { return false } finally { area.remove() }
}

export function ItemCode({ code }: { code: string }) {
	const [copied, setCopied] = useState<'yes' | 'no'>()
	const classic = useNavigation(state => state.route.startsWith('classic/'))
	useEffect(() => {
		if (!copied) return
		const timer = setTimeout(() => setCopied(undefined), 2000)
		return () => clearTimeout(timer)
	}, [copied])
	// The code sits inside rows and summaries that open on click: copying never opens, closes or follows them.
	const copy = (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); void copyText(code).then(ok => setCopied(ok ? 'yes' : 'no')) }
	const said = copied === 'yes' ? `Copied ${code}` : copied === 'no' ? "Couldn't copy" : ''
	return <><Hint text={itemCodeHover(code, classic)}><button type="button" className="item-code" data-item-code={code} data-copied={copied} aria-label={`Copy item code ${code}`} onClick={copy}
		onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }}>{said || code}</button></Hint>
		<span className="sr-only" role="status">{said}</span></>
}