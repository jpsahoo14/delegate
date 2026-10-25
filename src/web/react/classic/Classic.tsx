import { Suspense, useEffect, useRef, useState } from 'react'
import { preloadable } from '../components/preloadable.ts'
import { CLASSIC_VIEWS } from '../data/views.ts'
import { useAppData, useEntities, useLatestError, useLatestResult, usePendingReceipts, useSnapshot } from '../data/hooks.ts'
import { useHashNavigation, useNavigation } from '../data/navigation.ts'
import { THEME_LABEL, useInterface } from '../data/interface.ts'
import { useData } from '../data/store.ts'
import { useVersionUpdate } from '../data/update.ts'
import { Button, Hint } from '../components/ui/button.tsx'
import { chipHover } from '../domain/hover.ts'
import { Icon } from '../components/ui/icon.tsx'
import { ActionButton } from '../features/ActionButton.tsx'
import { NoticeAnnouncer, NoticeSlot, pageLines, pageNotices, useParkedUpdate, usePendingLines, useResultLine } from '../features/PageNotices.tsx'
import { staticSnapshot } from '../services/api.ts'
import { NAME } from '../brand.ts'
import { nextCheck, when } from '../domain/time.ts'
import { ExperienceToggle, useScreenNavigation } from './navigation.tsx'
import { useClassicKeyboard, useClassicOffline, useClassicSeen } from './data.ts'
import Home from './Home.tsx'
import Focus from './Focus.tsx'
import { ClassicCard } from './Card.tsx'
import Ongoing from './Ongoing.tsx'
import './classic.css'

const Done = preloadable(CLASSIC_VIEWS.done)
const Numbers = preloadable(CLASSIC_VIEWS.numbers)
const Settings = preloadable(CLASSIC_VIEWS.settings)
const Knowledge = preloadable(CLASSIC_VIEWS.knowledge)

function Snapshot() {
	const snapshot = useSnapshot(), entities = useEntities()
	const saved = staticSnapshot() !== undefined
	return <><p role="note" className="warning">Read-only snapshot{saved && snapshot ? `, saved ${when(snapshot.now)}` : ''}. {saved ? <>Open {NAME} on your own machine to act.</> : <><a href="#classic/home">Open the live page</a> to act.</>} Nothing here sends or changes anything.</p><Home readOnly />
		<h2>Needs you</h2><div className="classic-snapshot-cards">{snapshot?.classic?.needsIds.map(code => <ClassicCard key={code} code={code} readOnly />)}</div>
		<h2>Knowledge to review</h2>{Object.values(entities.knowledgeProposals).map(proposal => <article className="item-card" key={proposal.id}><h3>{proposal.topic}</h3>{proposal.factIds.map(id => <p key={id}>{entities.facts[id].text}</p>)}</article>)}
	</>
}

export default function Classic() {
	const query = useAppData(), snapshot = useSnapshot(), entities = useEntities()
	const pendingError = usePendingReceipts(), result = useLatestResult(), actionError = useLatestError()
	const { route, navigate } = useScreenNavigation(), { menu, setMenu, help, setHelp } = useNavigation()
	const { themeChoice, error, setThemeChoice } = useInterface()
	const seenError = useClassicSeen(), update = useVersionUpdate(), offline = useClassicOffline()
	const main = useRef<HTMLElement>(null), dialog = useRef<HTMLDialogElement>(null)
	const previousScreen = useRef<string | undefined>(undefined)
	useHashNavigation()
	useClassicKeyboard(offline)
	const screen = route.split('/')[0] === 'automations' ? 'ongoing' : route.split('/')[0], readOnly = screen === 'snapshot'
	const needs = snapshot?.classic?.needsIds.length ?? 0, knowledge = snapshot?.classic?.also.find(tile => tile.key === 'knowledge')?.count ?? 0
	const resultItem = result && entities.items[result.item]
	const reopenedQuestion = result?.applied && !result.refused && !result.uncertain && result.text.startsWith('Current item: ') &&
		resultItem?.type === 'question' && resultItem.rev !== result.rev && snapshot?.classic?.needsIds.includes(resultItem.id)
	const retainedKnowledge = useData(state => Object.entries(state.pinned).some(([code, pin]) => !!pin.snapshot.entities.knowledgeProposals[code]))
	const updates = Object.values(entities.watches).filter(watch => watch.update).length
	const tabs: [string, string, number][] = [['home', 'Home', 0], ['focus', 'Needs you', needs], ['done', 'Done', snapshot?.doneNew ?? 0], ['ongoing', 'Ongoing', updates], ...(knowledge || retainedKnowledge || screen === 'knowledge' ? [['knowledge', 'To learn', knowledge] as [string, string, number]] : []), ...(!readOnly ? [['numbers', 'Numbers', 0] as [string, string, number], ['settings', 'Settings', snapshot?.ways?.needsHim ?? 0] as [string, string, number]] : [])]
	useEffect(() => {
		document.title = `${NAME} - ${tabs.find(([id]) => id === screen)?.[1] ?? 'Home'}`
		const before = previousScreen.current
		previousScreen.current = screen
		const section = screen === 'ongoing' && route.split('/')[1]
		if (!section && (screen === 'settings' && route.includes('/') || route !== screen && before === screen)) return
		const frame = requestAnimationFrame(() => {
			if (section) document.getElementById(`classic-${section}`)?.scrollIntoView({ block: 'start' })
			else { window.scrollTo(0, 0); if (screen !== 'focus') main.current?.focus({ preventScroll: true }) }
		})
		return () => cancelAnimationFrame(frame)
	}, [route, !!snapshot?.classic])
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
	const health = Object.values(entities.health), parked = useParkedUpdate(update.available)
	const pendingLines = usePendingLines('classic'), resultLine = useResultLine(result, 'classic', reopenedQuestion ? 'Nothing is sent yet. You will see the reply first.' : undefined)
	// PE decision 46 / Designer: Classic's health banner, offline and refresh alerts and "Updated to…" are the header slot's state now.
	const notices = pageNotices({ online: !offline, health, fetchedAt: snapshot?.fetchedAt,
		refresh: query.error ? { message: query.error.message, retry: () => void query.refetch() } : undefined,
		update: update.available ? { version: update.available, reload: update.reload, ...parked } : undefined,
		refreshWords: message => `Offline or unable to refresh: ${message}. Your last view is kept.`,
		// PE 07:20: nothing renders between the header and the route content; these lines are slot notices.
		errors: pageLines({ storage: pendingError, interface: error, seen: seenError, action: actionError }), pending: pendingLines, result: resultLine })
	const disconnected = offline || !!query.error
	const reading = snapshot?.status.reading
	const status = disconnected ? 'Offline' : !snapshot ? 'Connecting' : snapshot.status.state === 'paused' ? 'Paused' : snapshot.status.state === 'stopped' ? 'Stopped' :
		reading?.state === 'never' ? 'Not checked yet' : reading?.state === 'off' ? `Not checked since ${when(reading.at)}` : `On · ${snapshot.status.runs} run${snapshot.status.runs === 1 ? '' : 's'} today${(n => n ? ` · ${n}` : '')(nextCheck(reading?.next))}`
	const bad = disconnected || snapshot?.status.state !== 'on' || health.length > 0 || reading?.state === 'off' || reading?.state === 'never'
	const fullStatus = [status, reading?.at ? `Last checked ${when(reading.at)}` : undefined, reading?.machine].filter(Boolean).join(' · ')
	const themeLabel = THEME_LABEL[themeChoice]
	return <div className="classic-experience">
		<a className="skip-link" href="#main" onClick={event => { event.preventDefault(); main.current?.focus() }}>Skip to content</a>
		<header className="preview-header" data-menu-open={menu || undefined}><NoticeAnnouncer notices={notices} /><div className="header-inner">
			<a className="brand" href="#classic/home" aria-label={`${NAME} home`}><span className="brand-mark"><Icon name="logo" /></span><span className="brand-name">{NAME}</span></a>
			<div className="header-controls" id="classic-view-menu">
				<nav aria-label="Views">{tabs.map(([id, label, count]) => <a key={id} href={`#classic/${id}`} aria-current={screen === id ? 'page' : undefined} onClick={() => setMenu(false)}>{label}{count > 0 && <Hint text={chipHover(id === 'focus' ? 'count-needs' : id === 'ongoing' ? 'count-ongoing' : id === 'knowledge' ? 'count-knowledge' : 'count-done', { n: count })}><span className={`count${id === 'focus' ? '' : ' count-muted'}`} aria-label={`${count}${id === 'done' || id === 'ongoing' ? ' new' : ''}`}>{count}</span></Hint>}</a>)}</nav>
				{!readOnly && <div className="version-controls"><ExperienceToggle disabled={disconnected} /></div>}
			</div>
			<span className="classic-view-title">{tabs.find(([id]) => id === screen)?.[1] ?? 'Home'}</span>
			<NoticeSlot className="classic-status" base={{ text: status, compact: status, full: fullStatus, bad }} notices={notices} />
			{!readOnly && <div className="classic-desktop-experience"><ExperienceToggle disabled={disconnected} /></div>}
			<Button variant="ghost" className="theme-button" aria-label={`Theme: ${themeLabel}`} title={`Theme: ${themeLabel}`} onClick={() => setThemeChoice(themeChoice === 'auto' ? 'light' : themeChoice === 'light' ? 'dark' : 'auto')}><Icon name={themeChoice === 'auto' ? 'auto' : themeChoice === 'light' ? 'sun' : 'moon'} /></Button>
			<Button variant="ghost" className="mobile-view-button" aria-label="Views" aria-expanded={menu} aria-controls="classic-view-menu" onClick={() => setMenu(!menu)}><Icon name="menu" /></Button>
		</div></header>
		<main id="main" tabIndex={-1} ref={main}>
			<fieldset disabled={offline} className="classic-connection">
			{!snapshot ? <p role="status">Loading your items...</p> : <Suspense fallback={<p role="status">Loading this view...</p>}>{screen === 'home' ? <Home /> : screen === 'focus' ? <Focus /> : screen === 'ongoing' ? <Ongoing /> : screen === 'done' ? <Done /> : screen === 'numbers' ? <Numbers /> : screen === 'settings' ? <Settings /> : screen === 'knowledge' ? <Knowledge /> : readOnly ? <Snapshot /> : <><h1>View not found</h1><Button onClick={() => navigate('home')}>Home</Button></>}</Suspense>}
			</fieldset>
		</main>
		<dialog ref={dialog} onClose={() => setHelp(false)} onCancel={() => setHelp(false)} aria-labelledby="classic-keyboard-title"><h2 id="classic-keyboard-title">Keyboard shortcuts</h2><dl><dt>j / k, Left / Right</dt><dd>Next / previous item</dd><dt>Ctrl+Enter / Command+Enter</dt><dd>Primary action in the open card</dd><dt>1-9</dt><dd>Choose an answer</dd><dt>e / a / l / u</dt><dd>Edit / ask / later / undo</dd><dt>g then h</dt><dd>Home</dd><dt>Escape</dt><dd>Close a sheet, leave a field, or go Home</dd><dt>?</dt><dd>This list</dd></dl><Button variant="outline" onClick={() => setHelp(false)}>Close</Button></dialog>
	</div>
}
