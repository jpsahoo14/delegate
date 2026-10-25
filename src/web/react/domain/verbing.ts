// The button while its click is in flight (PM #27 poll): "Sending…", "Dismissing…", "Saving…", only for a label that starts with a
// verb in use (PE 23:42: "Later", "OK", "Not right?" are not verbs); every other label reads "Working…".
const VERBS: Record<string, string> = {
	send: 'Sending', approve: 'Approving', answer: 'Answering', dismiss: 'Dismissing', save: 'Saving', try: 'Trying', redraft: 'Redrafting',
	add: 'Adding', write: 'Writing', mark: 'Marking', stop: 'Stopping', skip: 'Skipping', undo: 'Undoing', open: 'Opening', reply: 'Replying',
	review: 'Reviewing', post: 'Posting', reopen: 'Reopening', remember: 'Remembering', turn: 'Turning',
}
export function verbing(label: string): string {
	return `${VERBS[(label.trim().split(/\s+/)[0] ?? '').toLowerCase()] ?? 'Working'}…`
}