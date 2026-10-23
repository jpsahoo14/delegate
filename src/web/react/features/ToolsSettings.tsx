import { useState, type ComponentType } from 'react'
import { Button } from '../components/ui/button.tsx'
import { useSetting } from '../data/screens.ts'
import type { Settings as SettingsData } from '../domain/screens.ts'

type Row = SettingsData['rows'][number]
// The same section in New and Classic; each passes its own switch row and class names.
type Look = { rows: string; row: string; muted: string; title: string; actions: string }
export const NEW_LOOK: Look = { rows: 'settings-rows', row: 'setting-row', muted: 'muted', title: '', actions: 'action-bar' }
export const CLASSIC_LOOK: Look = { rows: 'ct-setting-rows', row: 'ct-setting-row', muted: 'ct-muted', title: 'ct-section-title', actions: 'ct-tool-actions' }

// A tool the classifier can't place: allowed only after a confirm that names the risk (#17, design §5). Once allowed, a switch.
function AllowRead({ row, Setting, look }: { row: Row; Setting: ComponentType<{ row: Row }>; look: Look }) {
	const state = useSetting(row), [asking, setAsking] = useState(false)
	if (row.value === 'true') return <Setting row={row} />
	return <div className={look.row} id={`setting-${row.key}`} data-tool={row.label}><strong>{row.label}</strong><span className={look.muted}>{row.help}</span>
		{asking ? <div className={look.actions} role="group" aria-label={`Allow ${row.label}`}><span>Drafts will be able to call {row.label} without asking you.</span><Button disabled={state.busy} onClick={() => { setAsking(false); state.toggle() }}>{state.busy ? 'Saving...' : 'Allow'}</Button><Button variant="outline" onClick={() => setAsking(false)}>Cancel</Button></div>
			: <div className={look.actions}><Button variant="outline" disabled={state.busy} onClick={() => setAsking(true)}>{state.busy ? 'Saving...' : 'Allow as read'}</Button></div>}
		{state.text && <p role={state.error ? 'alert' : 'status'}>{state.text}</p>}
	</div>
}
function AllowAll({ row, look }: { row: Row; look: Look }) {
	const state = useSetting(row)
	return <div className={look.row} id="setting-toolsAll"><strong>Some read tools are off</strong><span className={look.muted}>{row.help}</span>
		<div className={look.actions}><Button disabled={state.busy} onClick={state.toggle}>{state.busy ? 'Saving...' : row.label}</Button></div>
		{state.text && <p role={state.error ? 'alert' : 'status'}>{state.text}</p>}</div>
}

// Tools your drafts may read (#17): grouped per server, each server folded to one line until opened.
export function ToolsSettings({ data, Setting, look }: { data: SettingsData; Setting: ComponentType<{ row: Row }>; look: Look }) {
	if (!data.tools) return null
	const rows = data.rows.filter(row => row.group), all = rows.find(row => row.key === 'toolsAll')
	return <section id="setting-tools" aria-labelledby="tools-title">
		<h3 className={look.title} id="tools-title">Tools your drafts may read</h3>
		<p className={look.muted}>Drafts look things up with these; none of them can change anything. Changes are only the ones above, each after your ok.</p>
		{all && <AllowAll row={all} look={look} />}
		<div className={look.rows}>{data.tools.servers.map(server => {
			const reads = rows.filter(row => row.group === server.name && row.key.startsWith('read:')), unknown = rows.filter(row => row.group === server.name && row.key.startsWith('allow:'))
			return <div className={look.row} key={server.name} data-server={server.name}>
				{server.line && <p role="status" className="tools-server-line">{server.line}</p>}
				{server.reads + server.unknown === 0 ? <p><strong>{server.name}</strong>: no list of its tools yet</p> : <details className="tools-server"><summary><strong>{server.name}</strong>: {server.on === server.reads ? `${server.reads} read tools` : `${server.on} of ${server.reads} read tools on`}{server.unknown ? ` · ${server.unknown} not placed` : ''}</summary>
					<div className={look.rows}>{reads.map(row => <Setting key={row.key} row={row} />)}</div>
					{unknown.length > 0 && <><h4>{server.name} doesn&apos;t say whether these read or change things</h4><div className={look.rows}>{unknown.map(row => <AllowRead key={row.key} row={row} Setting={Setting} look={look} />)}</div></>}
					{server.gone.length > 0 && <p className={`${look.muted} tools-gone`}>Not offered by {server.name} now: {server.gone.map(name => name.slice(server.name.length + 1)).join(', ')}.</p>}
				</details>}
			</div>
		})}</div>
	</section>
}
