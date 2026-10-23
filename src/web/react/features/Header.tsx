import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { THEME_LABEL, useInterface } from '../data/interface.ts'
import { useNavigation } from '../data/navigation.ts'
import { when, nextCheck } from '../domain/time.ts'
import type { Snapshot } from '../domain/contracts.ts'
import { NAME } from '../brand.ts'
import { ExperienceToggle } from '../classic/navigation.tsx'
import { hoverOf } from '../domain/hover.ts'

export function Header({ current, move, snapshot, offline }: { current: string; move: number; snapshot?: Snapshot; offline: boolean }) {
	const { themeChoice, switching, chooseVersion, setThemeChoice } = useInterface()
	const { menu, setMenu } = useNavigation()
	const reading = snapshot?.status.reading
	// The next Teams check, honestly, while a runner is reading (latency c).
	const next = snapshot?.status.state === 'on' && (reading?.state === 'ok' || reading?.state === 'late') ? nextCheck(reading.next) : undefined
	const status = offline ? 'Offline' : !snapshot ? 'Connecting' : snapshot.status.state === 'paused' ? 'Paused' :
		snapshot.status.state === 'stopped' ? 'Stopped' : reading?.state === 'never' ? 'Not checked yet' :
			`${reading?.state === 'off' ? 'Not checked since' : 'Checked'} ${when(reading?.at)}${next ? ` · ${next}` : ''}`
	const bad = offline || snapshot?.status.state !== 'on' || !!Object.keys(snapshot?.entities.health ?? {}).length || reading?.state === 'off' || reading?.state === 'never'
	const shortStatus = offline ? 'Offline' : !snapshot ? 'Connecting' : snapshot.status.state === 'paused' ? 'Paused' :
		snapshot.status.state === 'stopped' ? 'Stopped' : reading?.state === 'never' || reading?.state === 'off' ? 'Not checked' :
			reading?.state === 'late' ? 'Late' : bad ? 'Attention' : ''
	const fullStatus = [shortStatus && !status.startsWith(shortStatus) ? shortStatus : undefined, status,
		(offline || snapshot?.status.state !== 'on') && reading?.at ? `Last checked ${when(reading.at)}` : undefined, reading?.machine].filter(Boolean).join(' - ')
	const themeLabel = THEME_LABEL[themeChoice]
	const themeIcon = themeChoice === 'auto' ? 'auto' : themeChoice === 'light' ? 'sun' : 'moon'
	const changeTheme = () => setThemeChoice(themeChoice === 'auto' ? 'light' : themeChoice === 'light' ? 'dark' : 'auto')
	const pill = <Tooltip.Provider><Tooltip.Root><Tooltip.Trigger asChild>
		<span className={`reading-status status-pill${bad ? ' status-warn' : ''}`} tabIndex={0} role="img" aria-label={fullStatus} title={fullStatus}>
			<i aria-hidden="true" /><span className="status-full">{status}</span><span className="status-compact">{shortStatus}</span>
		</span>
	</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="status-tooltip" sideOffset={8} collisionPadding={12}>{fullStatus}</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>
	const views = [['now', 'Now'], ['done', 'Done'], ['numbers', 'Numbers'], ['settings', 'Settings']]
	return <header className="preview-header" data-menu-open={menu || undefined}><div className="header-inner">
		<a className="brand" href="#now" aria-label={`${NAME}, Now`}><span className="brand-mark"><Icon name="logo" /></span><span className="brand-name">{NAME}</span></a>
		<div className="header-controls" id="react-view-menu">
			<nav aria-label="Views">{views.map(([id, label]) => <a href={`#${id}`} aria-current={current === id ? 'page' : undefined} key={id} onClick={() => setMenu(false)}>{label}
				{id === 'now' && move > 0 && <span className="count">{move}</span>}
				{id === 'done' && !!snapshot?.doneNew && <span className="count count-muted" aria-label={`${snapshot.doneNew} new`}>{snapshot.doneNew}</span>}
			</a>)}</nav>
			<div className="desktop-status">{pill}</div>
			<div className="version-controls"><ExperienceToggle /><label className="sr-only" htmlFor="app-version">App version</label>
				<select id="app-version" value="react" disabled={switching} title={hoverOf('', 'App version')} aria-describedby="app-version-hover" onChange={event => {
					const version = event.target.value
					if (version === 'classic' || version === 'new' || version === 'react') void chooseVersion(version)
				}}><option value="classic">Classic</option><option value="new">New</option><option value="react">React (preview)</option></select><span id="app-version-hover" className="sr-only">{hoverOf('', 'App version')}</span>
			</div>
			<Button variant="ghost" className="theme-button" onClick={changeTheme} aria-label={`Theme: ${themeLabel}`} title={`Theme: ${themeLabel}`}><Icon name={themeIcon} /><span>Theme: {themeLabel}</span></Button>
		</div>
		<span className="narrow-title">{views.find(([id]) => id === current)?.[1] ?? 'To learn'}</span><div className="narrow-status">{pill}</div>
		<Button variant="ghost" className="mobile-view-button" aria-label={snapshot?.doneNew ? `Menu, ${snapshot.doneNew} new in Done` : 'Menu'} aria-expanded={menu} aria-controls="react-view-menu" onClick={() => setMenu(!menu)}><Icon name="more" />{snapshot?.doneNew ? <span className="count count-muted">{snapshot.doneNew}</span> : null}</Button>
	</div></header>
}
import { Tooltip } from 'radix-ui'
