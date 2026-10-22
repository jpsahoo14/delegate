export async function editInChat(text: string, link: string): Promise<void> {
	await navigator.clipboard.writeText(text)
	const opened = window.open(link, '_blank', 'noopener,noreferrer')
	if (opened) opened.opener = null
}
