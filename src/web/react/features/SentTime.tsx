import { useEffect, useState } from 'react'
import { overdue, sentCompact, sentFull } from '../domain/time.ts'

// When the person sent the message (spec S8): a <time> with "Sent <full date and time>" as its hover and name. A row drawn before
// midnight relabels itself after midnight, without a reload. Waiting on the owner for over 2 working days: warning color.
export function SentTime({ at, full = false, added = false, waiting = false, code }: { at: string; full?: boolean; added?: boolean; waiting?: boolean; code?: string }) {
	const [now, setNow] = useState(() => new Date())
	useEffect(() => {
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 1000
		const timer = setTimeout(() => setNow(new Date()), Math.min(next, 2_147_000_000))
		return () => clearTimeout(timer)
	}, [now])
	const late = waiting ? overdue(at, now) : undefined
	const label = `${added ? 'Added' : 'Sent'} ${sentFull(at, now)}${late ? `. Waiting on you for ${late} days.` : ''}${code ? ` · ${code}` : ''}`
	return <time className={`sent-time${late ? ' sent-late' : ''}`} dateTime={at} title={label} aria-label={label}>{added ? 'added ' : ''}{full ? sentFull(at, now) : sentCompact(at, now)}</time>
}
