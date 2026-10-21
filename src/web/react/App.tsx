import { Button } from './components/ui/button.tsx'
import { useInterface } from './data/interface.ts'
import './foundation.css'
import { NAME } from './brand.ts'

export function App() {
	const { theme, switching, error, chooseVersion, toggleTheme } = useInterface()
	return <>
		<a className="skip-link" href="#main">Skip to content</a>
		<header className="preview-header">
			<a className="brand" href="#now">{NAME}</a>
			<span className="preview-label">React (preview)</span>
			<div className="version-controls">
				<label htmlFor="app-version">App version</label>
				<select id="app-version" value="react" disabled={switching} onChange={event => {
					const version = event.target.value
					if (version === 'classic' || version === 'new' || version === 'react') void chooseVersion(version)
				}}>
					<option value="classic">Classic</option>
					<option value="new">New</option>
					<option value="react">React (preview)</option>
				</select>
				<Button variant="outline" onClick={toggleTheme}>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</Button>
			</div>
		</header>
		<main id="main" tabIndex={-1}>
			{error && <p role="alert" className="error">{error}</p>}
			<section className="foundation" aria-labelledby="preview-title">
				<p className="eyebrow">Preview foundation</p>
				<h1 id="preview-title">A new front end. The same {NAME}.</h1>
				<p>The React build is ready to try. Your items and actions are not available in this preview yet.</p>
				<p>Switch to New or Classic to keep using {NAME}. Switching changes only the version on this machine. It sends nothing.</p>
				<Button disabled={switching} onClick={() => void chooseVersion('new')}>Continue in New</Button>
			</section>
		</main>
	</>
}
