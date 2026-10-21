import { Component, type ErrorInfo, type PropsWithChildren } from 'react'
import { useInterface } from './data/interface.ts'

export function Recovery({ failed = false }: { failed?: boolean }) {
	const href = useInterface(state => state.recoveryHref)
	const reload = useInterface(state => state.reloadPreview)
	return <section className="foundation">
		<h1>{failed ? 'Could not load the React preview' : 'Loading React preview'}</h1>
		<p role={failed ? 'alert' : 'status'}>{failed ? 'The app may have updated. Your items are still available in New.' : 'If loading does not finish, you can return to New.'}</p>
		<a href={href}>Continue in New</a>
		{failed && <button type="button" onClick={reload}>Reload preview</button>}
	</section>
}

export class PreviewBoundary extends Component<PropsWithChildren, { failed: boolean }> {
	state = { failed: false }
	static getDerivedStateFromError() { return { failed: true } }
	componentDidCatch(error: Error, info: ErrorInfo) { console.error('React preview could not load:', error, info) }
	render() { return this.state.failed ? <Recovery failed /> : this.props.children }
}
