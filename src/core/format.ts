const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Minimal Markdown to Teams HTML: links, bold, inline code, and line breaks. Everything else stays text.
export function mdToHtml(md: string): string {
	return esc(md)
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
		.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\n/g, '<br>')
}
