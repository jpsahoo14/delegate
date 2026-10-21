// The page's icons: one hidden sprite, and a reference to a symbol in it wherever an icon shows.
import { raw, type H } from './html.ts'

export const ICONS: Record<string, string> = {
	check: '<path d="M3.5 8.5l3 3 6-7"/>', left: '<path d="M10 3.5L5.5 8l4.5 4.5"/>', right: '<path d="M6 3.5L10.5 8 6 12.5"/>',
	back: '<path d="M13 8H3.5M7.5 4L3.5 8l4 4"/>', arrow: '<path d="M3 8h9.5M8.5 4l4 4-4 4"/>',
	reply: '<path d="M2.5 4.5a2 2 0 012-2h7a2 2 0 012 2v5a2 2 0 01-2 2H7l-3 2.5v-2.5a1.5 1.5 0 01-1.5-1.5z"/>',
	send: '<path d="M2.5 8l11-5-4 11-2-4.5z"/><path d="M7.5 9.5l6-6.5"/>',
	spark: '<path d="M8 2l1.3 3.4L12.7 6.7 9.3 8 8 11.4 6.7 8 3.3 6.7l3.4-1.3z"/><path d="M12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
	cal: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
	warn: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.5v3M8 11.3v.2"/>', info: '<circle cx="8" cy="8" r="5.5"/><path d="M8 7.3v3.5M8 5.2v.2"/>',
	lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>',
	pr: '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="12.5" r="1.5"/><path d="M4.5 5v6M11.5 11V6.5a2 2 0 00-2-2H7.5M9 3l-1.5 1.5L9 6"/>',
	task: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M5.5 8.2l1.8 1.8 3.3-3.8"/>',
	moon: '<path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z"/>',
	sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"/>',
	auto: '<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/>',
	eye: '<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
	clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>', bolt: '<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>',
	book: '<path d="M3 3.5A1.5 1.5 0 014.5 2H13v10H4.5A1.5 1.5 0 003 13.5zM3 13.5A1.5 1.5 0 004.5 15H13v-3"/>',
	more: '<circle cx="3.5" cy="8" r=".6"/><circle cx="8" cy="8" r=".6"/><circle cx="12.5" cy="8" r=".6"/>',
	edit: '<path d="M10.5 3l2.5 2.5L6 12.5H3.5V10z"/>', x: '<path d="M4 4l8 8M12 4l-8 8"/>',
	undo: '<path d="M5.5 3.5L2.5 6.5l3 3"/><path d="M2.5 6.5h7a3.5 3.5 0 010 7H7"/>', pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>', play: '<path d="M5 3.5v9l7-4.5z"/>',
	plus: '<path d="M8 3v10M3 8h10"/>', later: '<path d="M3 4.5h7M3 8h5M3 11.5h4"/><path d="M11 9.5l2 2-2 2"/>', menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
	ext: '<path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3a1 1 0 01-1 1h-7a1 1 0 01-1-1v-7a1 1 0 011-1h3"/>',
	pc: '<rect x="2" y="3" width="12" height="8" rx="1.2"/><path d="M5.5 13.5h5M8 11v2.5"/>',
	chat: '<path d="M2.5 7.5c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5-2.5 5-5.5 5c-.8 0-1.6-.1-2.3-.4L3 13.5l.7-2.4a4.7 4.7 0 01-1.2-3.6z"/>',
	sum: '<path d="M3 3.5h10M3 6.5h10M3 9.5h6M3 12.5h4"/>', key: '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.5h.5M6.5 6.5H7M9 6.5h.5M11.5 6.5h.5M5 9.5h6"/>',
	off: '<path d="M2 2l12 12M5.5 5.6A5 5 0 003 8M8 3a8 8 0 016 3M10.5 10.4A3 3 0 008 9.5a3 3 0 00-2 .8M8 12.5h0"/>',
	logo: '<path d="M3 4.5A2 2 0 015 2.5h6a2 2 0 012 2v4a2 2 0 01-2 2H8.5L5.5 13v-2.5H5a2 2 0 01-2-2z" fill="currentColor" stroke="none"/><path d="M6 6.6l1.5 1.5L10.3 5" style="stroke:#5b5fc7;stroke-width:1.7"/>',
}
export const sprite = raw(`<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 16 16">${v}</symbol>`).join('')}</defs></svg>`)
export const I = (id: string, cls = ''): H => raw(`<svg class="i ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`)
