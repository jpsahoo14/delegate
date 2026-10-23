import { Component, type ErrorInfo, type PropsWithChildren } from 'react'
import { useInterface } from './data/interface.ts'
import { NAME } from './brand.ts'

export function Recovery({ failed = false }: { failed?: boolean }) {
	const reload = useInterface(state => state.reloadPreview)
	return <section className="foundation">
		<h1>{failed ? `Could not load ${NAME}` : `Loading ${NAME}`}</h1>
		<p role={failed ? 'alert' : 'status'}>{failed ? 'The app may have updated. Reload to continue; nothing was sent or changed.' : 'If loading does not finish, reload the page.'}</p>
		<button type="button" onClick={reload}>Reload</button>
	</section>
}

export class PreviewBoundary extends Component<PropsWithChildren, { failed: boolean }> {
	state = { failed: false }
	static getDerivedStateFromError() { return { failed: true } }
	componentDidCatch(error: Error, info: ErrorInfo) { console.error(`${NAME} could not load:`, error, info) }
	render() { return this.state.failed ? <Recovery failed /> : this.props.children }
}
