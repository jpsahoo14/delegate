import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { Button } from './components/ui/button.tsx'
import { useInterface } from './data/interface.ts'
import { useAction, useAppData, useLatestError, useLatestResult, useNowSections, usePendingCount, usePendingReceipts, useSnapshot } from './data/hooks.ts'
import { useHashNavigation, useNavigation } from './data/navigation.ts'
import { NAME } from './brand.ts'
import './foundation.css'
import './workspace.css'
import { PageTools } from './features/PageTools.tsx'
import { useSeen } from './data/seen.ts'
import { useVersionUpdate } from './data/update.ts'
import { ExperienceToggle } from './classic/navigation.tsx'

const Now = lazy(() => import('./features/Now.tsx'))
const Done = lazy(() => import('./features/Done.tsx'))
const Numbers = lazy(() => import('./features/Numbers.tsx'))
const Settings = lazy(() => import('./features/Settings.tsx'))
const Knowledge = lazy(() => import('./features/Knowledge.tsx'))
const Classic = lazy(() => import('./classic/Classic.tsx'))

export function App() {
	const classic = useNavigation(state => state.route.startsWith('classic/'))
	return classic ? <Suspense fallback={<p role="status">Loading Classic...</p>}><Classic /></Suspense> : <NewApp />
}

function NewApp() {
	const { themeChoice, switching, error, chooseVersion, setThemeChoice } = useInterface()
	const { route, navigate, help, setHelp, menu, setMenu } = useNavigation()
	const query = useAppData(), snapshot = useSnapshot(), pendingError = usePendingReceipts(), pending = usePendingCount(), result = useLatestResult()
	const seenError = useSeen()
	const actionError = useLatestError()
	const nowSections = useNowSections()
	const update = useVersionUpdate()
	const act = useAction(), prefix = useRef('')
	const main = useRef<HTMLElement>(null), dialog = useRef<HTMLDialogElement>(null)
	useHashNavigation()
	useLayoutEffect(() => {
		if (snapshot && performance.getEntriesByName('delegate-react-redraw-start').length) {
			performance.measure('delegate-react-redraw', 'delegate-react-redraw-start')
			performance.clearMarks('delegate-react-redraw-start')
		}
	}, [snapshot])
	const base = route.split('/')[0], current = ['done', 'numbers', 'settings', 'knowledge'].includes(base) ? base : 'now'
	const move = snapshot?.sections.find(section => section.id === 'move')?.total ?? 0
	useEffect(() => {
		document.title = `${NAME} - ${current === 'now' ? move ? `${move} your move` : 'Now' : current[0].toUpperCase() + current.slice(1)}`
	}, [current, move])
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.isComposing || event.defaultPrevented) return
			const element = event.target instanceof Element ? event.target : undefined
			const field = element?.closest('input,textarea,select,[contenteditable="true"]')
			if (event.key === 'Escape') {
				if (menu) { setMenu(false); return }
				if (help) { setHelp(false); return }
				if (field instanceof HTMLElement) {
					if (field.id === 'find') useNavigation.getState().setFind('')
					field.blur(); const card = field.closest<HTMLElement>('.item-card'); (card ?? main.current)?.focus({ preventScroll: true }); return
				}
				if (route.includes('/')) navigate(current)
				return
			}
			if (field || event.ctrlKey || event.metaKey || event.altKey) return
			if (event.key === 'g') { prefix.current = 'g'; return }
			if (event.key === 'h' && prefix.current === 'g') { prefix.current = ''; event.preventDefault(); navigate('now'); return }
			prefix.current = ''
			if (event.key === '?') { event.preventDefault(); setHelp(true) }
			if (event.key === '/') { event.preventDefault(); document.getElementById('find')?.focus() }
			const direction = event.key === 'j' || event.key === 'ArrowRight' ? 1 : event.key === 'k' || event.key === 'ArrowLeft' ? -1 : 0
			if (current === 'now' && direction) {
				const ids = nowSections?.flatMap(section => section.ids) ?? []
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
				const undoable = Object.values(snapshot.entities.doneEntries).find(row => row.actionIds.some(id => snapshot.entities.actions[id].kind === 'undo'))
				const actionId = undoable?.actionIds.find(id => snapshot.entities.actions[id].kind === 'undo')
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
	useEffect(() => {
		if (help && !dialog.current?.open) dialog.current?.showModal()
		if (!help && dialog.current?.open) dialog.current.close()
	}, [help])
	return <>
		<a className="skip-link" href="#main" onClick={event => { event.preventDefault(); main.current?.focus() }}>Skip to content</a>
		<header className="preview-header" data-menu-open={menu || undefined}>
			<a className="brand" href="#now">{NAME}</a>
			<div className="header-controls" id="react-view-menu">
			<nav aria-label="Views">{[['now', 'Now'], ['done', 'Done'], ['numbers', 'Numbers'], ['settings', 'Settings']].map(([id, label]) =>
				<a href={`#${id}`} aria-current={current === id ? 'page' : undefined} key={id} onClick={() => setMenu(false)}>{label}{id === 'now' && move > 0 && <span className="count">{move}</span>}{id === 'done' && !!snapshot?.doneNew && <span className="count" aria-label={`${snapshot.doneNew} new`}>{snapshot.doneNew}</span>}</a>)}</nav>
			<span className="reading-status">{snapshot?.status.state === 'on' ? snapshot.status.reading.state === 'ok' ? 'Reading' : 'Not reading now' : snapshot?.status.state ?? 'Connecting'}</span>
			<div className="version-controls">
				<ExperienceToggle />
				<label className="sr-only" htmlFor="app-version">App version</label>
				<select id="app-version" value="react" disabled={switching} onChange={event => {
					const version = event.target.value
					if (version === 'classic' || version === 'new' || version === 'react') void chooseVersion(version)
				}}><option value="classic">Classic</option><option value="new">New</option><option value="react">React (preview)</option></select>
				<label className="sr-only" htmlFor="app-theme">Theme</label><select id="app-theme" value={themeChoice} onChange={event => {
					const choice = event.target.value
					if (choice === 'auto' || choice === 'light' || choice === 'dark') setThemeChoice(choice)
				}}><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select>
			</div>
			</div>
			<Button variant="outline" className="mobile-view-button" aria-label="Menu" aria-expanded={menu} aria-controls="react-view-menu" onClick={() => setMenu(!menu)}>Menu{snapshot?.doneNew ? <span className="count">{snapshot.doneNew} new</span> : null}</Button>
		</header>
		<main id="main" tabIndex={-1} ref={main}>
			{error && <p role="alert" className="error">{error}</p>}
			{pendingError && <p role="alert" className="error">{pendingError}</p>}
			{seenError && <p role="alert" className="error">{seenError}</p>}
			{actionError && <p role="alert" className="error">{actionError}</p>}
			{update.available && <p role="status" className="warning">Updated to {update.available}. Your unsent edits stay here until you choose to reload. <Button variant="outline" onClick={update.reload}>Reload when ready</Button></p>}
			{query.error && <div role="alert" className="warning"><p>Could not refresh your items: {query.error.message}. Your last view is kept.</p><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>}
			{pending > 0 && <p role="status">{pending} action{pending === 1 ? '' : 's'} awaiting a saved result.</p>}
			<div className="live-result" role={result?.refused || result?.uncertain ? 'alert' : 'status'} aria-live="polite">{result?.text}</div>
			{!snapshot ? <p role="status">Loading your items...</p> : <Suspense fallback={<p role="status">Loading this view...</p>}>
				{current === 'now' ? <Now /> : current === 'done' ? <Done /> : current === 'numbers' ? <Numbers /> : current === 'settings' ? <Settings /> : <Knowledge />}
			</Suspense>}
			{snapshot && current === 'now' && <PageTools />}
			<footer><Button variant="outline" onClick={() => setHelp(true)}>Keyboard shortcuts</Button><span className="muted">React preview {snapshot?.version?.code ?? ''} - switch back any time.</span>{snapshot?.version?.checkedAt && <small>Last update check: {new Date(snapshot.version.checkedAt).toLocaleString()}</small>}
				{snapshot?.status.reading.machine && <small>{snapshot.status.reading.state === 'ok' ? 'Reading on' : 'Last reader:'} {snapshot.status.reading.machine}{snapshot.status.reading.at ? ` - ${new Date(snapshot.status.reading.at).toLocaleString()}` : ''}</small>}
				{snapshot?.version?.failed && <p role="alert">Update could not complete: {snapshot.version.failed}</p>}
			</footer>
		</main>
		<dialog ref={dialog} onClose={() => setHelp(false)} onCancel={() => setHelp(false)} aria-labelledby="keyboard-title"><h2 id="keyboard-title">Keyboard shortcuts</h2>
			<dl><dt>j / k</dt><dd>Next / previous item</dd><dt>/</dt><dd>Find</dd><dt>Ctrl+Enter / Command+Enter</dt><dd>Primary action in the open card</dd><dt>Escape</dt><dd>Close a sheet or item, or leave a field</dd><dt>?</dt><dd>This list</dd></dl>
			<Button variant="outline" onClick={() => setHelp(false)}>Close</Button>
		</dialog>
	</>
}
