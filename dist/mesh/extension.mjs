// Delegate's Copilot CLI extension: lets the owner's Delegate reach this session from any of their machines.
// Installed by "delegate install" into <copilot home>/extensions/delegate-inbox/, removed by "delegate uninstall".
import { readFileSync } from 'node:fs'
import { joinSession } from '@github/copilot-sdk/extension'
import { settings, startInbox } from './inbox.mjs'

// "delegate install" wrote where this machine's Delegate keeps its settings, so nothing depends on the CLI's environment.
const mark = (() => { try { return JSON.parse(readFileSync(new URL('./delegate.json', import.meta.url), 'utf8')) } catch { return {} } })()
// Delegate's own background runs load user extensions too; they are not the owner's sessions.
const cfg = process.env.DELEGATE_WORKER ? undefined : settings(mark.local)
if (cfg) {
	let inbox
	const session = await joinSession({ hooks: { onSessionEnd: async () => { await inbox?.close() } } })
	inbox = startInbox(session, cfg)
	process.once('SIGTERM', () => { inbox.close().finally(() => process.exit(0)) })
}
