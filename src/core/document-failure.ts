const DOCUMENT_FAILURE = /^Couldn't open (.+?): (no access|too much content to open|not a Word, PowerPoint or Excel file|too large to open(?: \(([^)\r\n]*)\))?)$/i

export const hardDocumentFailure = (reason: string) => DOCUMENT_FAILURE.test(reason)
export function documentFailureCause(reason: string) {
	const match = DOCUMENT_FAILURE.exec(reason)
	if (!match) return undefined
	const why = match[2].toLowerCase()
	return {
		step: 'doc-read' as const,
		target: match[1],
		reason: why === 'no access' ? 'no-access' as const : why.startsWith('too ') ? 'too-large' as const : 'unsupported' as const,
		...(/^\d+ MB$/.test(match[3] ?? '') ? { size: match[3] } : {}),
	}
}
