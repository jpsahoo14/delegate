import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { THEME_LABEL, useInterface } from '../data/interface.ts'
import { useNavigation } from '../data/navigation.ts'
import { when, nextCheck } from '../domain/time.ts'
import type { Snapshot } from '../domain/contracts.ts'
import { NAME } from '../brand.ts'
import { ExperienceToggle } from '../classic/navigation.tsx'
import { NoticeAnnouncer, NoticeSlot, type PageNotice } from './PageNotices.tsx'

export function Header({ current, move, snapshot, offline, notices = [] }: { current: string; move: number; snapshot?: Snapshot; offline: boolean; notices?: PageNotice[] }) {
	const { themeChoice, setThemeChoice } = useInterface()
	const { menu, setMenu } = useNavigation()
	const reading = snapshot?.status.reading
	// The next Teams check, honestly, while a runner is reading (latency c).
	const next = snapshot?.status.state === 'on' && (reading?.state === 'ok' || reading?.state === 'late') ? nextCheck(reading.next) : undefined
	// D-WATCH' (PM N3, PE §8.6): after Offline, Connecting and the engine's Stopped, "Checking off" (+ " · Paused"), not bad, with no
	// next check and no reading warning: the gap is his choice. PM N7 (PE §8.11): unless no machine has cycled for an hour (reading off,
	// from runner-cycle evidence while Off): then it says so, bad, without " · Paused".
	const off = snapshot?.status.watching?.on === false, alsoPaused = snapshot?.status.state === 'paused' ? ' · Paused' : ''
	const silent = off && reading?.state === 'off', offWords = silent ? `Checking off · ${NAME} isn't running on any machine` : `Checking off${alsoPaused}`
	const status = offline ? 'Offline' : !snapshot ? 'Connecting' : snapshot.status.state === 'stopped' ? 'Stopped' : off ? offWords : snapshot.status.state === 'paused' ? 'Paused' :
		reading?.state === 'never' ? 'Not checked yet' :
			`${reading?.state === 'off' ? 'Not checked since' : 'Checked'} ${when(reading?.at)}${next ? ` · ${next}` : ''}`
	const bad = offline || snapshot?.status.state === 'stopped' || (off ? silent || Object.keys(snapshot?.entities.health ?? {}).some(key => key !== 'paused')
		: snapshot?.status.state !== 'on' || !!Object.keys(snapshot?.entities.health ?? {}).length || reading?.state === 'off' || reading?.state === 'never')
	const shortStatus = offline ? 'Offline' : !snapshot ? 'Connecting' : snapshot.status.state === 'stopped' ? 'Stopped' : off ? silent ? 'Not running' : `Checking off${alsoPaused}` : snapshot.status.state === 'paused' ? 'Paused' :
		reading?.state === 'never' || reading?.state === 'off' ? 'Not checked' :
			reading?.state === 'late' ? 'Late' : bad ? 'Attention' : ''
	const fullStatus = off && !offline && snapshot && snapshot.status.state !== 'stopped' ? status
		: [shortStatus && !status.startsWith(shortStatus) ? shortStatus : undefined, status,
			(offline || snapshot?.status.state !== 'on') && reading?.at ? `Last checked ${when(reading.at)}` : undefined, reading?.machine].filter(Boolean).join(' - ')
	const themeLabel = THEME_LABEL[themeChoice]
	const themeIcon = themeChoice === 'auto' ? 'auto' : themeChoice === 'light' ? 'sun' : 'moon'
	const changeTheme = () => setThemeChoice(themeChoice === 'auto' ? 'light' : themeChoice === 'light' ? 'dark' : 'auto')
	// PE decision 46: every page-level notice is this slot's state (reserved space); nothing is inserted above the cards.
	const pill = (where: string) => <NoticeSlot className={`reading-status ${where}`} base={{ text: status, compact: shortStatus, full: fullStatus, bad }} notices={notices} />
	const views = [['now', 'Now'], ['done', 'Done'], ['numbers', 'Numbers'], ['settings', 'Settings']]
	return <header className="preview-header" data-menu-open={menu || undefined}><NoticeAnnouncer notices={notices} /><div className="header-inner">
		<a className="brand" href="#now" aria-label={`${NAME}, Now`}><span className="brand-mark"><Icon name="logo" /></span><span className="brand-name">{NAME}</span></a>
		<div className="header-controls" id="react-view-menu">
			<nav aria-label="Views">{views.map(([id, label]) => <a href={`#${id}`} aria-current={current === id ? 'page' : undefined} key={id} onClick={() => setMenu(false)}>{label}
				{id === 'now' && move > 0 && <span className="count">{move}</span>}
				{id === 'done' && !!snapshot?.doneNew && <span className="count count-muted" aria-label={`${snapshot.doneNew} new`}>{snapshot.doneNew}</span>}
				{/* R12b (C1): lines that need him, from SEND's needsHim. */}
				{id === 'settings' && !!snapshot?.ways?.needsHim && <span className="count" aria-label={`${snapshot.ways.needsHim} to check`}>{snapshot.ways.needsHim}</span>}
			</a>)}</nav>
			<div className="desktop-status">{pill('notice-desktop')}</div>
			<div className="version-controls"><ExperienceToggle />
			</div>
			<Button variant="ghost" className="theme-button" onClick={changeTheme} aria-label={`Theme: ${themeLabel}`} title={`Theme: ${themeLabel}`}><Icon name={themeIcon} /><span>Theme: {themeLabel}</span></Button>
		</div>
		<span className="narrow-title">{views.find(([id]) => id === current)?.[1] ?? 'To learn'}</span><div className="narrow-status">{pill('notice-narrow')}</div>
		<Button variant="ghost" className="mobile-view-button" aria-label={snapshot?.doneNew ? `Menu, ${snapshot.doneNew} new in Done` : 'Menu'} aria-expanded={menu} aria-controls="react-view-menu" onClick={() => setMenu(!menu)}><Icon name="more" />{snapshot?.doneNew ? <span className="count count-muted">{snapshot.doneNew}</span> : null}</Button>
	</div></header>
}
