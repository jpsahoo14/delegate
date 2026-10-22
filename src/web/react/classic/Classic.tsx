import { lazy, Suspense, useEffect, useRef } from 'react'
import { useAppData, useEntities, useLatestError, useLatestResult, usePendingCount, usePendingReceipts, useSnapshot } from '../data/hooks.ts'
import { useHashNavigation, useNavigation } from '../data/navigation.ts'
import { useInterface } from '../data/interface.ts'
import { useVersionUpdate } from '../data/update.ts'
import { Button } from '../components/ui/button.tsx'
import { ActionButton, ActionState } from '../features/ActionButton.tsx'
import { NAME } from '../brand.ts'
import { ExperienceToggle, useScreenNavigation } from './navigation.tsx'
import { useClassicKeyboard, useClassicSeen } from './data.ts'
import Home from './Home.tsx'
import Focus from './Focus.tsx'
import Ongoing from './Ongoing.tsx'
import './classic.css'

const Done = lazy(() => import('../features/Done.tsx'))
const Numbers = lazy(() => import('../features/Numbers.tsx'))
const Settings = lazy(() => import('../features/Settings.tsx'))
const Knowledge = lazy(() => import('../features/Knowledge.tsx'))

function Snapshot() {
	const snapshot = useSnapshot(), entities = useEntities()
	return <><p role="note" className="warning">Read-only snapshot. <a href="#classic/home">Open the live page</a> to act. Nothing here sends or changes anything.</p><Home readOnly />
		<h2>Needs you</h2>{snapshot?.classic?.needsIds.map(code => { const item = entities.items[code], draft = item.draftId ? entities.drafts[item.draftId] : undefined; return <article className="item-card" key={code}><h3>{entities.people[item.personId].name} - {code}</h3><p>{entities.chats[item.chatId].name}</p>{item.ask && <blockquote>{item.ask}</blockquote>}{item.question && <p>{item.question}</p>}{draft && <div className="draft">{draft.text}</div>}{item.teams && <a href={item.teams} target="_blank" rel="noopener noreferrer">Open in Teams</a>}</article> })}
		<h2>Knowledge to review</h2>{Object.values(entities.knowledgeProposals).map(proposal => <article className="item-card" key={proposal.id}><h3>{proposal.topic}</h3>{proposal.factIds.map(id => <p key={id}>{entities.facts[id].text}</p>)}</article>)}
	</>
}

export default function Classic() {
	const query = useAppData(), snapshot = useSnapshot(), entities = useEntities()
	const pendingError = usePendingReceipts(), pending = usePendingCount(), result = useLatestResult(), actionError = useLatestError()
	const { route, navigate } = useScreenNavigation(), { menu, setMenu, help, setHelp } = useNavigation()
	const { themeChoice, switching, error, chooseVersion, setThemeChoice } = useInterface()
	const seenError = useClassicSeen(), update = useVersionUpdate()
	const main = useRef<HTMLElement>(null), dialog = useRef<HTMLDialogElement>(null)
	useHashNavigation()
	useClassicKeyboard()
	const screen = route.split('/')[0], readOnly = screen === 'snapshot'
	const needs = snapshot?.classic?.needsIds.length ?? 0, knowledge = Object.keys(entities.knowledgeProposals).length
	const updates = Object.values(entities.watches).filter(watch => watch.update).length
	const tabs = [['home', 'Home', 0], ['focus', 'Needs you', needs], ['done', 'Done', snapshot?.doneNew ?? 0], ['ongoing', 'Ongoing', updates], ['knowledge', 'Knowledge', knowledge], ['numbers', 'Numbers', 0], ['settings', 'Settings', 0]] as const
	useEffect(() => {
		document.title = `${NAME} - ${tabs.find(([id]) => id === screen)?.[1] ?? 'Home'}`
		const frame = requestAnimationFrame(() => {
			const section = screen === 'ongoing' && route.split('/')[1]
			if (section) document.getElementById(`classic-${section}`)?.scrollIntoView({ block: 'start' })
			else { window.scrollTo(0, 0); if (screen !== 'focus') main.current?.focus({ preventScroll: true }) }
		})
		return () => cancelAnimationFrame(frame)
	}, [route])
	useEffect(() => {
		if (help && !dialog.current?.open) dialog.current?.showModal()
		if (!help && dialog.current?.open) dialog.current.close()
	}, [help])
	useEffect(() => {
		if (!menu) return
		const outside = (event: PointerEvent) => { if (event.target instanceof Element && !event.target.closest('.preview-header')) setMenu(false) }
		addEventListener('pointerdown', outside)
		return () => removeEventListener('pointerdown', outside)
	}, [menu, setMenu])
	const health = Object.values(entities.health), first = health[0], version = snapshot?.version
	const check = snapshot?.pageActionIds?.map(id => entities.actions[id]).find(action => action.kind === 'retry-source')
	return <div className="classic-experience">
		<a className="skip-link" href="#main" onClick={event => { event.preventDefault(); main.current?.focus() }}>Skip to content</a>
		<header className="preview-header" data-menu-open={menu || undefined}><a className="brand" href="#classic/home">{NAME}</a><div className="header-controls" id="classic-view-menu">
			<nav aria-label="Views">{tabs.map(([id, label, count]) => <a key={id} href={`#classic/${id}`} aria-current={screen === id ? 'page' : undefined} onClick={() => setMenu(false)}>{label}{count > 0 && <span className="count" aria-label={`${count}${id === 'done' || id === 'ongoing' ? ' new' : ''}`}>{count}</span>}</a>)}</nav>
			<span className="reading-status">{snapshot ? snapshot.status.state === 'on' ? `On - ${snapshot.status.runs} runs today` : snapshot.status.state === 'paused' ? 'Paused' : 'Stopped' : 'Connecting'}</span>
			<div className="version-controls"><ExperienceToggle /><label className="sr-only" htmlFor="classic-version">App version</label><select id="classic-version" aria-label="App version" value="react" disabled={switching} onChange={event => { const value = event.target.value; if (value === 'classic' || value === 'new' || value === 'react') void chooseVersion(value) }}><option value="classic">Classic</option><option value="new">New</option><option value="react">React (preview)</option></select>
				<label className="sr-only" htmlFor="classic-theme">Theme</label><select id="classic-theme" aria-label="Theme" value={themeChoice} onChange={event => { const value = event.target.value; if (value === 'auto' || value === 'light' || value === 'dark') setThemeChoice(value) }}><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
		</div><Button variant="outline" className="mobile-view-button" aria-label="Menu" aria-expanded={menu} aria-controls="classic-view-menu" onClick={() => setMenu(!menu)}>Menu</Button></header>
		<main id="main" tabIndex={-1} ref={main}>
			{[error, pendingError, seenError, actionError].filter(Boolean).map((message, index) => <p role="alert" className="error" key={index}>{message}</p>)}
			{query.error && <div role="alert" className="warning"><p>Offline or unable to refresh: {query.error.message}. Your last view is kept.</p><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>}
			{snapshot?.summary.off && <div className="warning"><p>{snapshot.summary.off.text}{snapshot.summary.off.since ? ` - since ${new Date(snapshot.summary.off.since).toLocaleString()}` : ''}</p>{!readOnly && check && <ActionButton action={check} />}</div>}
			{first && <section className="warning" aria-label="Source health"><p>{first.text}</p><small>Since {new Date(first.since).toLocaleString()}</small>{!readOnly && first.actionIds.map(id => <ActionButton key={id} action={entities.actions[id]} />)}<ActionState item="" rev="" />{health.length > 1 && <details><summary>And {health.length - 1} more</summary>{health.slice(1).map(row => <div key={row.id}><p>{row.text}</p><small>Since {new Date(row.since).toLocaleString()}</small>{!readOnly && row.actionIds.map(id => <ActionButton key={id} action={entities.actions[id]} />)}</div>)}</details>}</section>}
			{pending > 0 && <p role="status">{pending} action{pending === 1 ? '' : 's'} awaiting a saved result.</p>}
			<div className="live-result" role={result?.refused || result?.uncertain ? 'alert' : 'status'} aria-live="polite">{result?.text}</div>
			{update.available && <p role="status" className="warning">Updated to {update.available}. Your unsent edits stay here until you choose to reload. <Button variant="outline" onClick={update.reload}>Reload when ready</Button></p>}
			{!snapshot ? <p role="status">Loading your items...</p> : <Suspense fallback={<p role="status">Loading this view...</p>}>{screen === 'home' ? <Home /> : screen === 'focus' ? <Focus /> : screen === 'ongoing' ? <Ongoing /> : screen === 'done' ? <Done /> : screen === 'numbers' ? <Numbers /> : screen === 'settings' ? <Settings /> : screen === 'knowledge' ? <Knowledge /> : readOnly ? <Snapshot /> : <><h1>View not found</h1><Button onClick={() => navigate('home')}>Home</Button></>}</Suspense>}
			<footer><Button variant="outline" onClick={() => setHelp(true)}>Keyboard shortcuts</Button><span className="muted">React preview - Classic experience {version?.tag ?? version?.code ?? ''}</span>
				{version && <small>{version.channel === 'off' ? 'Updates when you check' : `Updates to ${version.channel === 'release' ? 'each release' : 'every change'}, checked every ${version.everyMin} minutes`}{version.checkedAt ? ` - Last checked ${new Date(version.checkedAt).toLocaleString()}` : ' - Not checked yet'}</small>}
				{version?.failed && <p role="alert">Update could not complete: {version.failed}</p>}
				{snapshot?.status.reading.machine && <small>{snapshot.status.reading.state === 'ok' ? 'Reading on' : 'Last reader:'} {snapshot.status.reading.machine}{snapshot.status.reading.at ? ` - ${new Date(snapshot.status.reading.at).toLocaleString()}` : ''}</small>}
				{snapshot?.classic?.details && <details><summary>Details</summary><pre>{snapshot.classic.details.runner}{'\n'}{snapshot.classic.details.log.join('\n')}</pre></details>}
			</footer>
		</main>
		<dialog ref={dialog} onClose={() => setHelp(false)} onCancel={() => setHelp(false)} aria-labelledby="classic-keyboard-title"><h2 id="classic-keyboard-title">Keyboard shortcuts</h2><dl><dt>j / k, Left / Right</dt><dd>Next / previous item</dd><dt>Ctrl+Enter / Command+Enter</dt><dd>Primary action in the open card</dd><dt>1-9</dt><dd>Choose an answer</dd><dt>e / a / l / u</dt><dd>Edit / ask / later / undo</dd><dt>g then h</dt><dd>Home</dd><dt>Escape</dt><dd>Close a sheet, leave a field, or go Home</dd><dt>?</dt><dd>This list</dd></dl><Button variant="outline" onClick={() => setHelp(false)}>Close</Button></dialog>
	</div>
}
