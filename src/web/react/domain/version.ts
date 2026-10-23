export function versionLabel(version?: { code?: string; tag?: string }): string | undefined {
	if (!version?.code) return undefined
	return `Version ${version.tag ? `${version.tag} (${version.code})` : version.code}`
}
