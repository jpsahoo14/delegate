import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { preloadable } from './components/preloadable.ts'
import { CLASSIC_VIEWS, NEW_VIEWS } from './data/views.ts'
import { Button } from './components/ui/button.tsx'
import { useInterface } from './data/interface.ts'
import { useAction, useAppData, useCardUi, useLatestError, useLatestResult, useNowSections, usePendingReceipts, useSnapshot } from './data/hooks.ts'
import { noticeHealth } from './data/watching.ts'
import { useHashNavigation, useNavigation } from './data/navigation.ts'
import { NAME } from './brand.ts'
import './foundation.css'
import './workspace.css'
import './visual-new.css'
import { PageTools } from './features/PageTools.tsx'
import { useSeen } from './data/seen.ts'
import { useVersionUpdate } from './data/update.ts'
import { Header } from './features/Header.tsx'
import { ActionButton, ActionState, useOnline } from './features/ActionButton.tsx'
import { versionLabel, versionTitle } from './domain/version.ts'
import { pageLines, pageNotices, useParkedUpdate, usePendingLines, useResultLine } from './features/PageNotices.tsx'
import { closeOpenCardMenu, useCardMenuDismiss } from './features/card-more.ts'
import { useStableOrder } from './data/stable-order.ts'

const Now = preloadable(NEW_VIEWS.now)
const Done = preloadable(NEW_VIEWS.done)
const Numbers = preloadable(NEW_VIEWS.numbers)
const Settings = preloadable(NEW_VIEWS.settings)
const Knowledge = preloadable(NEW_VIEWS.knowledge)
const Classic = preloadable(CLASSIC_VIEWS.app)

export function App() {
	const classic = useNavigation(state => state.route.startsWith('classic/'))
	return classic ? <Suspense fallback={<p role="status">Loading Classic...</p>}><Classic /></Suspense> : <NewApp />
}

function NewApp() {
	const { error } = useInterface()
	const { route, navigate, help, setHelp, menu, setMenu } = useNavigation()
	const query = useAppData(), snapshot = useSnapshot(), pendingError = usePendingReceipts(), result = useLatestResult()
	const pageUi = useCardUi('', ''), updateCheck = snapshot?.pageActionIds?.map(id => snapshot.entities.actions[id]).find(action => action.kind === 'check-update')
	const updateResult = !!updateCheck && pageUi.lastAction === updateCheck.id && result?.submissionId === pageUi.result?.submissionId
	const seenError = useSeen()
	const actionError = useLatestError()
	const incomingSections = useNowSections()
	const update = useVersionUpdate(), online = useOnline(), parked = useParkedUpdate(update.available)
	const pendingLines = usePendingLines('new'), resultLine = useResultLine(updateResult ? undefined : result, 'new')
	// PE decision 46: the page-level notices live in the header slot; none is inserted above the cards.
	const notices = pageNotices({ online, health: noticeHealth(Object.values(snapshot?.entities.health ?? {}), snapshot), fetchedAt: snapshot?.fetchedAt,
		refresh: query.error ? { message: query.error.message, retry: () => void query.refetch() } : undefined,
		update: update.available ? { version: update.available, reload: update.reload, ...parked } : undefined,
		refreshWords: message => `Could not refresh your items: ${message}. Your last view is kept.`,
		// PE 07:20: nothing renders between the header and the route content; these lines are slot notices.
		errors: pageLines({ storage: pendingError, interface: error, seen: seenError, action: actionError }), pending: pendingLines, result: resultLine })
	const act = useAction(), prefix = useRef('')
	const main = useRef<HTMLElement>(null), dialog = useRef<HTMLDialogElement>(null)
	const helpTrigger = useRef<HTMLElement | null>(null)
	useHashNavigation()
	useLayoutEffect(() => {
		if (snapshot && performance.getEntriesByName('delegate-react-redraw-start').length) {
			performance.measure('delegate-react-redraw', 'delegate-react-redraw-start')
			performance.clearMarks('delegate-react-redraw-start')
		}
	}, [snapshot])
	const base = route.split('/')[0], current = ['done', 'numbers', 'settings', 'knowledge'].includes(base) ? base : 'now'
	const moveOrder = useStableOrder(current === 'now' ? incomingSections?.find(section => section.id === 'move')?.ids ?? [] : [])
	const nowSections = useMemo(() => current !== 'now' ? incomingSections : incomingSections?.map(section => section.id === 'move' ? { ...section, ids: moveOrder } : section), [incomingSections, moveOrder, current])
	const move = snapshot?.sections.find(section => section.id === 'move')?.total ?? 0
	useEffect(() => {
		document.title = `${NAME} - ${current === 'now' ? move ? `${move} your move` : 'Now' : current === 'knowledge' ? 'To learn' : current[0].toUpperCase() + current.slice(1)}`
	}, [current, move])
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.isComposing || event.defaultPrevented) return
			const element = event.target instanceof Element ? event.target : undefined
			const field = element?.closest('input,textarea,select,[contenteditable="true"]')
			if (event.key === 'Escape') {
				if (menu) { setMenu(false); return }
				if (help) { event.preventDefault(); setHelp(false); return }
				if (closeOpenCardMenu(true)) { event.preventDefault(); return }
				if (field instanceof HTMLElement) {
					if (field.id === 'find') useNavigation.getState().setFind('')
					field.blur(); const card = field.closest<HTMLElement>('.item-card'); (card ?? main.current)?.focus({ preventScroll: true }); return
				}
				if (route.includes('/')) navigate(current)
				return
			}
			if (help || element?.closest('dialog') || field || event.ctrlKey || event.metaKey || event.altKey) return
			if (event.key === 'g') { prefix.current = 'g'; return }
			if (event.key === 'h' && prefix.current === 'g') { prefix.current = ''; event.preventDefault(); navigate('now'); return }
			prefix.current = ''
			if (event.key === '?') { event.preventDefault(); setHelp(true) }
			if (event.key === '/') { event.preventDefault(); document.getElementById('find')?.focus() }
			// Owner 13:41 (25 Oct): k = next, j = previous; the arrows stay spatial, → next and ← previous (PM 08:15:34Z).
			const direction = event.key === 'k' || event.key === 'ArrowRight' ? 1 : event.key === 'j' || event.key === 'ArrowLeft' ? -1 : 0
			if (current === 'now' && direction) {
				const currentId = route.split('/')[1]
				const section = nowSections?.find(section => section.id === currentId || section.ids.includes(currentId)) ?? nowSections?.[0]
				const find = useNavigation.getState().find
				const ids = (section?.ids ?? []).filter(id => !find || snapshot?.search?.nowIds.includes(id))
				const index = ids.indexOf(route.split('/')[1])
				const next = ids[Math.max(0, Math.min(ids.length - 1, index + direction))]
				if (next) { event.preventDefault(); navigate(`now/${next}`) }
			}
			const card = document.querySelector<HTMLElement>('.now-row .item-card')
			if (event.key === 'e') card?.querySelector<HTMLButtonElement>('[data-card-edit]')?.click()
			if (event.key === 'a') card?.querySelector<HTMLTextAreaElement>('[data-field=ask]')?.focus()
			if (event.key === 'l') card?.querySelector<HTMLButtonElement>('[data-action-kind=later]')?.click()
			if (/^[1-9]$/.test(event.key)) {
				const choice = card?.querySelectorAll<HTMLInputElement>('fieldset:first-of-type input[type=radio],fieldset:first-of-type input[type=checkbox]')[Number(event.key) - 1]
				if (choice) { event.preventDefault(); choice.click() }
			}
			if (event.key === 'u' && snapshot) {
				// The newest undoable send, as the projection names it; object order follows delta updates, not time (bug 10-23 E97).
				const actionId = snapshot.lastUndoId && snapshot.entities.actions[snapshot.lastUndoId]?.kind === 'undo' ? snapshot.lastUndoId : undefined
				if (actionId) { event.preventDefault(); void act(snapshot.entities.actions[actionId]); navigate('done/replies') }
			}
		}
		addEventListener('keydown', key)
		return () => removeEventListener('keydown', key)
	}, [route, current, snapshot, nowSections, navigate, help, setHelp, act, menu, setMenu])
	useEffect(() => {
		if (!menu) return
		const outside = (event: PointerEvent) => { if (event.target instanceof Element && !event.target.closest('.preview-header')) setMenu(false) }
		addEventListener('pointerdown', outside)
		return () => removeEventListener('pointerdown', outside)
	}, [menu, setMenu])
	// D-MORE-MENU (PE §3.2, §5.3): a card ⋯ opening closes ≡, and ≡ opening closes any open ⋯.
	useCardMenuDismiss(() => setMenu(false))
	useEffect(() => { if (menu) closeOpenCardMenu(false) }, [menu])
	useEffect(() => {
		if (help && !dialog.current?.open) {
			helpTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
			dialog.current?.showModal()
		}
		if (!help && dialog.current?.open) {
			dialog.current.close()
			const target = helpTrigger.current?.isConnected ? helpTrigger.current : main.current
			target?.focus({ preventScroll: true })
		}
	}, [help])
	return <>
		<a className="skip-link" href="#main" onClick={event => { event.preventDefault(); main.current?.focus() }}>Skip to content</a>
		<Header current={current} move={move} snapshot={snapshot} offline={!!query.error || !online} notices={notices} />
		<main id="main" data-ui="new" tabIndex={-1} ref={main}>
			{!snapshot ? <p role="status">Loading your items...</p> : <Suspense fallback={<p role="status">Loading this view...</p>}>
				{current === 'now' ? <Now sections={nowSections} /> : current === 'done' ? <Done /> : current === 'numbers' ? <Numbers /> : current === 'settings' ? <Settings /> : <Knowledge />}
			</Suspense>}
			{snapshot && current === 'now' && <footer><PageTools quiet showDetails={false} kinds={['remind-someone', 'report-problem']}>
				{versionLabel(snapshot.version) && <span className="muted" title={versionTitle(snapshot.version)}>{versionLabel(snapshot.version)}</span>}
				{updateCheck && <div className="update-check"><ActionButton action={updateCheck} />{pageUi.lastAction === updateCheck.id && <ActionState item={updateCheck.item} rev={updateCheck.rev} />}</div>}
				</PageTools>{snapshot.version?.failed && <p role="alert">Update could not complete: {snapshot.version.failed}</p>}
			</footer>}
		</main>
		<dialog ref={dialog} onClose={() => setHelp(false)} onCancel={() => setHelp(false)} aria-labelledby="keyboard-title"><h2 id="keyboard-title">Keyboard shortcuts</h2>
			<dl><dt>k or →</dt><dd>Next item</dd><dt>j or ←</dt><dd>Previous item</dd><dt>/</dt><dd>Find</dd><dt>g then h</dt><dd>Now</dd><dt>Ctrl+Enter / Command+Enter</dt><dd>Primary action in the open card</dd><dt>e / a / l</dt><dd>Edit / ask / later in the open card</dd><dt>1-9</dt><dd>Choose an answer</dd><dt>u</dt><dd>Undo the newest reply still in its window and open Done Replies</dd><dt>Escape</dt><dd>Close a sheet or item, or leave a field</dd><dt>?</dt><dd>This list</dd></dl>
			<Button variant="outline" onClick={() => setHelp(false)}>Close</Button>
		</dialog>
	</>
}
