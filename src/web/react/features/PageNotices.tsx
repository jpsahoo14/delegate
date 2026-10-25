import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import type { Entities } from '../domain/contracts.ts'
import { time, when } from '../domain/time.ts'
import { ActionButton } from './ActionButton.tsx'
import { usePageResult, usePendingClicks } from '../data/result-line.ts'
import { useNavigation } from '../data/navigation.ts'
import type { Receipt } from '../domain/contracts.ts'
import { useEntities } from '../data/hooks.ts'
import { codeHover } from '../domain/hover.ts'

// PE decision 46 / I28, Designer designer-page-notices.md: a page-level notice never goes into the page. Offline, can't refresh,
// Health and update ready all become the header status slot's state (reserved space: the header's height never changes), most severe
// first with "+N"; a click opens a popover under the header, out of the layout flow and never over the card's action bar. It never
// opens by itself. One component for New and Classic. The words are today's strings until the PM's copy lands.
export type PageNotice = {
	id: string; severity: number; tone: 'warn' | 'info'
	short: string // the slot's words
	say: string // the full sentence, announced once and shown in the popover
	alert?: boolean // offline and Health: role=alert when they first appear
	actions?: ReactNode
	later?: () => void // update ready: "Later" keeps it as a small ↻ in the slot
	glyph?: string // the pill's icon when it isn't the warn sign: ↻ (update, pending), ✓ (a click's result that succeeded), NEUTRAL (the dot)
	resultTone?: 'muted' | 'warn'; title?: string // a click's result: its #47 tone, and its item code as the tooltip (never in the words)
}
export type BaseStatus = { text: string; compact: string; full: string; bad: boolean }
// Update ready, parked by "Later" until the version changes (or a reload).
export function useParkedUpdate(version?: string) {
	const [parked, setParked] = useState<string>()
	return { dismissed: !!version && parked === version, later: () => setParked(version) }
}

// PE 07:20 (decision 49 corrected; 0.2.45 gate) and the Designer's 02:49 placement: the page lines that used to sit at the top of <main>
// are slot notices too, so a failed click on one card can never shift another card's bar. Severity: offline > Health > can't refresh >
// storage > interface > a click's error > update > clicks still finishing > a click's result. The words are today's.
// CR B1 on f41e8430: ✓ only for a result that succeeded (done or sent); a refusal or anything else not warn and not queued gets the
// status dot, so a clipped refused line can never read as done.
const NEUTRAL = 'dot'
export type PageLine = { id: string; text: string; severity: number }
export type PendingLine = { id: string; label: string; open?: string }
// tone: the #47 line's own (PM 18:29): grey while it is being worked on, warn only for a failure or an unsure outcome, else none.
export type ResultLine = { id: string; words: string; open?: string; close: () => void; warn: boolean; success: boolean; tone?: 'muted' | 'warn'; title?: string }
export function pageNotices({ online, refresh, health, update, fetchedAt, refreshWords, errors = [], pending = [], result }: {
	online: boolean
	refresh?: { message: string; retry: () => void }
	health: Entities['health'][string][]
	update?: { version: string; reload: () => void; later: () => void; dismissed: boolean }
	fetchedAt?: string
	refreshWords: (message: string) => string
	errors?: PageLine[]; pending?: PendingLine[]; result?: ResultLine
}): PageNotice[] {
	const out: PageNotice[] = []
	if (!online) out.push({ id: 'offline', severity: 50, tone: 'warn', alert: true, short: 'Offline · edits kept', say: 'Offline. Your last view and unsent edits are kept. Reconnect to act.' })
	for (const problem of health) out.push({
		id: `health:${problem.id}`, severity: 40, tone: 'warn', alert: true, short: problem.text,
		say: `${problem.text}${problem.since ? ` Since ${when(problem.since)}.` : ''}`,
		actions: problem.actionIds.length > 0 ? <HealthActions ids={problem.actionIds} /> : undefined,
	})
	if (refresh && online) out.push({
		id: 'refresh', severity: 30, tone: 'warn', short: `Can't refresh${fetchedAt ? ` · last update ${time(new Date(fetchedAt))}` : ''}`, say: refreshWords(refresh.message),
		actions: <Button variant="outline" onClick={refresh.retry}>Try again</Button>,
	})
	if (update) out.push({
		id: 'update', severity: update.dismissed ? 0 : 10, tone: 'info', short: 'Update ready',
		say: `Updated to ${update.version}. Your unsent edits stay here until you choose to reload.`,
		actions: <><Button variant="outline" onClick={update.reload}>Reload when ready</Button>{!update.dismissed && <Button variant="ghost" onClick={update.later}>Later</Button>}</>,
		later: update.dismissed ? undefined : update.later,
	})
	for (const line of errors) out.push({ id: `error:${line.id}`, severity: line.severity, tone: 'warn', alert: true, short: line.text, say: line.text })
	if (pending.length) {
		const words = `Finishing ${pending.length} earlier click${pending.length === 1 ? '' : 's'}…`
		out.push({ id: 'pending', severity: 5, tone: 'info', glyph: '↻', short: words, say: words,
			actions: <ul id="pending-clicks-list" className="notice-list">{pending.map(click => <li key={click.id}>{click.label}{click.open && <> <a href={`#${click.open}`}>Open</a></>}</li>)}</ul> })
	}
	if (result) out.push({ id: `result:${result.id}`, severity: result.warn ? 20 : 3, tone: result.warn ? 'warn' : 'info', glyph: result.warn ? undefined : result.tone === 'muted' ? '↻' : result.success ? '✓' : NEUTRAL, short: result.words, say: result.words, resultTone: result.tone, title: result.title,
		actions: <>{result.open && <a className="live-result-open" href={`#${result.open}`} onClick={result.close}>Open</a>}<Button variant="ghost" onClick={result.close}>Close</Button></> })
	return out.sort((a, b) => b.severity - a.severity)
}

function HealthActions({ ids }: { ids: string[] }) {
	const actions = useEntitiesActions(ids)
	return <>{actions.map(action => <ActionButton key={action.id} action={action} />)}</>
}
const useEntitiesActions = (ids: string[]) => { const entities = useEntities(); return ids.map(id => entities.actions[id]).filter(Boolean) }

// The live region: each new notice is announced once (an alert for offline and Health); going back online is announced politely.
export function NoticeAnnouncer({ notices }: { notices: PageNotice[] }) {
	const seen = useRef<Set<string> | undefined>(undefined)
	const [said, setSaid] = useState<{ polite: string; alert: string }>({ polite: '', alert: '' })
	const ids = notices.map(notice => notice.id).join('|')
	useEffect(() => {
		const now = new Set(notices.map(notice => notice.id))
		if (!seen.current) { seen.current = now; return }
		const fresh = notices.filter(notice => !seen.current!.has(notice.id) && notice.severity > 0)
		const back = seen.current.has('offline') && !now.has('offline')
		seen.current = now
		if (fresh.length || back) setSaid({ alert: fresh.filter(notice => notice.alert).map(notice => notice.say).join(' '), polite: [back ? 'Back online.' : '', ...fresh.filter(notice => !notice.alert).map(notice => notice.say)].filter(Boolean).join(' ') })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ids])
	return <><span className="sr-only" role="status">{said.polite}</span><span className="sr-only" role="alert">{said.alert}</span></>
}

// The slot: the status pill, or the most severe notice with "+N"; a button that opens the notices popover.
export function NoticeSlot({ base, notices, className = '' }: { base: BaseStatus; notices: PageNotice[]; className?: string }) {
	const [open, setOpen] = useState(false)
	const pill = useRef<HTMLButtonElement>(null)
	const shown = notices.filter(notice => notice.severity > 0), top = shown[0], more = shown.length - 1
	const parked = notices.some(notice => notice.id === 'update' && notice.severity === 0)
	const tone = top ? top.tone : base.bad ? 'warn' : 'normal'
	const name = top ? `${shown.length > 1 ? `${shown.length} notices: ${shown.map(notice => notice.short).join(', ')}` : top.short}. Show details` : `${base.full}. Show details`
	return <>
		<button type="button" ref={pill} className={`status-pill notice-pill ${className}${tone === 'warn' ? ' status-warn' : tone === 'info' ? ' status-info' : ''}`} data-notice={top?.id}
			aria-label={name} aria-haspopup="dialog" aria-expanded={open} title={top ? top.say : base.full} onClick={() => setOpen(!open)}>
			{top && top.glyph !== NEUTRAL ? <span className="notice-glyph" aria-hidden="true">{top.glyph ?? (top.tone === 'info' ? '↻' : <Icon name="warn" />)}</span> : <i aria-hidden="true" />}
			{top ? <span className="notice-text">{top.short}</span> : <><span className="status-full notice-text">{base.text}</span><span className="status-compact">{base.compact}</span></>}
			{more > 0 && <span className="notice-more">+{more}</span>}
			{parked && !top && <span className="notice-parked" aria-hidden="true">↻</span>}
		</button>
		{open && <NoticePopover anchor={pill} notices={notices} base={base} close={() => { setOpen(false); pill.current?.focus() }} />}
	</>
}

function NoticePopover({ anchor, notices, base, close }: { anchor: RefObject<HTMLButtonElement | null>; notices: PageNotice[]; base: BaseStatus; close: () => void }) {
	const box = useRef<HTMLDivElement>(null)
	const [place, setPlace] = useState<{ top: number; right: number; maxHeight: number; wide: boolean }>()
	useLayoutEffect(() => {
		const measure = () => {
			const pill = anchor.current?.getBoundingClientRect(), header = anchor.current?.closest('header')?.getBoundingClientRect()
			if (!pill || !header) return
			const top = header.bottom + 4
			// Never over the card's action bar: stop above the highest visible sticky bar.
			const bars = [...document.querySelectorAll('.classic-card-footer, .card-actions, [data-action-bar]')].map(bar => bar.getBoundingClientRect()).filter(rect => rect.bottom > top && rect.top < innerHeight)
			const floor = Math.min(innerHeight, ...bars.map(rect => rect.top)) - 8
			setPlace({ top, right: Math.max(8, innerWidth - pill.right), maxHeight: Math.max(80, Math.min(innerHeight * 0.5, floor - top)), wide: innerWidth <= 600 })
		}
		measure()
		addEventListener('resize', measure); addEventListener('scroll', measure, true)
		return () => { removeEventListener('resize', measure); removeEventListener('scroll', measure, true) }
	}, [anchor])
	// Focus moves in once it is placed (a hidden box can't take focus); Esc returns it to the pill.
	const placed = !!place
	useEffect(() => { if (placed) box.current?.focus() }, [placed])
	useEffect(() => {
		const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }
		const outside = (event: PointerEvent) => { if (event.target instanceof Node && !box.current?.contains(event.target) && !anchor.current?.contains(event.target)) close() }
		addEventListener('keydown', key, true); addEventListener('pointerdown', outside, true)
		return () => { removeEventListener('keydown', key, true); removeEventListener('pointerdown', outside, true) }
	}, [anchor, close])
	const ran = (event: MouseEvent) => { if (event.target instanceof Element && event.target.closest('button, a')) setTimeout(close, 0) }
	return createPortal(<div ref={box} className="notice-popover" role="dialog" aria-label="Notices" aria-modal="false" tabIndex={-1} onClick={ran}
		style={place ? { position: 'fixed', top: place.top, ...(place.wide ? { left: 8, right: 8 } : { right: place.right }), maxHeight: place.maxHeight } : { position: 'fixed', visibility: 'hidden' }}>
		{notices.length === 0 ? <p className="notice-line">{base.full}</p> : notices.map(notice => <div key={notice.id} className={`notice-line notice-${notice.tone}${notice.id.startsWith('result:') ? ' live-result' : ''}`} data-notice={notice.id} data-tone={notice.resultTone} title={notice.title}>
			<p>{notice.say}</p>{notice.actions && <div className="notice-actions">{notice.actions}</div>}</div>)}
	</div>, document.body)
}

// The newest click's result as a slot notice (#47 words and tone, unchanged): only a success (done or sent) clears itself after 6 s
// (Designer); a failure, an unsure outcome, a refusal or work still queued stays until closed, opened or replaced by the next result. override: words the page decides itself (Classic's reopened question).
export function useResultLine(result: Receipt | undefined, experience: 'new' | 'classic', override?: string): ResultLine | undefined {
	const route = useNavigation(state => state.route)
	const line = usePageResult(result, route, experience)
	const words = line && (override ?? line.words)
	const warn = !!result && (result.outcome?.kind === 'failed' || !!result.uncertain)
	const success = !!result && !warn && !result.refused && (result.outcome?.kind === 'done' || result.outcome?.kind === 'sent')
	const id = result?.submissionId
	useEffect(() => {
		if (!words || !success || !line) return
		const timer = setTimeout(line.close, 6000)
		return () => clearTimeout(timer)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id, !!words, success])
	const tone = warn ? 'warn' as const : result?.outcome?.kind === 'queued' ? 'muted' as const : undefined
	return words && line && id ? { id, words, open: line.open, close: line.close, warn, success, ...(tone ? { tone } : {}), ...(result?.item ? { title: codeHover(result.item) } : {}) } : undefined
}
export const usePendingLines = (experience: 'new' | 'classic'): PendingLine[] => usePendingClicks(experience)
// The Designer's order for the page's own error lines (storage > interface > a click's error); seen-marking reads with interface.
export function pageLines(lines: { storage?: string; interface?: string; seen?: string; action?: string }): PageLine[] {
	return [['storage', lines.storage, 25], ['interface', lines.interface, 22], ['seen', lines.seen, 21], ['action', lines.action, 20]]
		.flatMap(([id, text, severity]) => (text ? [{ id: id as string, text: text as string, severity: severity as number }] : []))
}