const paths = {
	ext: <path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3a1 1 0 01-1 1h-7a1 1 0 01-1-1v-7a1 1 0 011-1h3" />,
	warn: <><path d="M8 2.5l6 10.5H2z" /><path d="M8 6.5v3M8 11.3v.2" /></>,
	moon: <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" />,
	sun: <><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" /></>,
	auto: <><circle cx="8" cy="8" r="6" /><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" /></>,
	more: <><circle cx="3.5" cy="8" r=".6" /><circle cx="8" cy="8" r=".6" /><circle cx="12.5" cy="8" r=".6" /></>,
	clock: <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" /></>,
	bolt: <path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z" />,
	eye: <><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></>,
	check: <path d="M3.5 8.5l3 3 6-7" />,
	right: <path d="M6 3.5L10.5 8 6 12.5" />,
	left: <path d="M10 3.5L5.5 8l4.5 4.5" />,
	back: <path d="M6.5 3.5L2 8l4.5 4.5M2 8h12" />,
	key: <><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" /><path d="M4 6h.1M6.5 6h.1M9 6h.1M11.5 6h.1M4 8.5h.1M6.5 8.5h.1M9 8.5h.1M11.5 8.5h.1M5 10.5h6" /></>,
	chat: <path d="M2 3.5h12v8H7l-3.5 2v-2H2z" />,
	info: <><circle cx="8" cy="8" r="6" /><path d="M8 7v4M8 4.5v.1" /></>,
	spark: <path d="M8 1.5L9.8 6.2 14.5 8l-4.7 1.8L8 14.5 6.2 9.8 1.5 8l4.7-1.8z" />,
	arrow: <path d="M3 8h9.5M8.5 4l4 4-4 4" />,
	menu: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />,
	reply: <path d="M2.5 4.5a2 2 0 012-2h7a2 2 0 012 2v5a2 2 0 01-2 2H7l-3 2.5v-2.5a1.5 1.5 0 01-1.5-1.5z" />,
	pr: <><circle cx="4.5" cy="3.5" r="1.5" /><circle cx="4.5" cy="12.5" r="1.5" /><circle cx="11.5" cy="12.5" r="1.5" /><path d="M4.5 5v6M11.5 11V6.5a2 2 0 00-2-2H7.5M9 3l-1.5 1.5L9 6" /></>,
	task: <><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /><path d="M5.5 8.2l1.8 1.8 3.3-3.8" /></>,
	cal: <><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></>,
	book: <path d="M3 3.5A1.5 1.5 0 014.5 2H13v10H4.5A1.5 1.5 0 003 13.5zM3 13.5A1.5 1.5 0 004.5 15H13v-3" />,
	lock: <><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 016 0v2M8 10v1" /></>,
	undo: <><path d="M5.5 3.5L2.5 6.5l3 3" /><path d="M2.5 6.5h7a3.5 3.5 0 010 7H7" /></>,
	edit: <path d="M10.5 3l2.5 2.5L6 12.5H3.5V10z" />,
	logo: <><path d="M3 4.5A2 2 0 015 2.5h6a2 2 0 012 2v4a2 2 0 01-2 2H8.5L5.5 13v-2.5H5a2 2 0 01-2-2z" fill="currentColor" stroke="none" /><path d="M6 6.6l1.5 1.5L10.3 5" className="logo-check" /></>,
}

export function Icon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
	return <svg className={`ui-icon ${className}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
