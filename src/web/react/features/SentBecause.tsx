import { useScreenNavigation } from '../classic/navigation.tsx'
import type { SentRule } from '../domain/contracts.ts'

// D-A281 (PE v1.148 §17.6): links into Your way of working. The page opens there (its view may still be loading), then the target is
// scrolled to and focused: Add a line (`way-add`) or his line (`way-<lineId>`).
export function toWay(id: string, tries = 40) {
	const target = document.getElementById(id)
	if (target) { target.scrollIntoView({ block: 'center' }); target.focus(); return }
	if (tries > 0) setTimeout(() => toWay(id, tries - 1), 50)
}
// B3: 'Sent because you wrote: "<the line as it read when it sent>"', the same words on the card, the Done row (New and Classic). Linked
// to the line; WDD's "(edited since)" / "(line deleted)". Plain where a link can't sit (a summary).
export const sentBecauseText = (rule: SentRule) => `Sent because you wrote: "${rule.text}"${rule.state === 'edited' ? ' (edited since)' : rule.state === 'deleted' || !rule.lineId ? ' (line deleted)' : ''}`
export function SentBecause({ rule }: { rule: SentRule }) {
	const { href } = useScreenNavigation()
	if (rule.state === 'deleted' || !rule.lineId) return <>{sentBecauseText(rule)}</>
	const lineId = rule.lineId
	return <a href={href('settings/ways')} onClick={() => toWay(`way-${lineId}`)}>{sentBecauseText(rule)} ›</a>
}
