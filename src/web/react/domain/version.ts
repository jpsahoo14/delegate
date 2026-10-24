type Version = { version?: string; code?: string; fullCode?: string; tag?: string; channel?: string }
export function versionLabel(version?: Version): string | undefined {
	const app = version?.version ?? version?.tag?.replace(/^v/, '')
	if (!app) return version?.code ? `Version ${version.code}` : undefined
	return `Version ${app}${version?.code ? ` (${version.code})` : ''}`
}
export function versionTitle(version?: Version): string | undefined {
	if (!version) return undefined
	return [version.fullCode ?? version.code, version.channel && `Channel: ${version.channel}`].filter(Boolean).join(' · ') || undefined
}
