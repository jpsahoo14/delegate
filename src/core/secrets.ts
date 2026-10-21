// Secrets never reach chat, knowledge, logs, or prompts (owned work, eng-owned-work.md §e). Evidence is IDs, times,
// endpoints, and status codes; a token, a key, or an auth header is replaced where it is written, whoever wrote it.
const HIDDEN = '[hidden]'
const PATTERNS: [RegExp, string | ((...m: string[]) => string)][] = [
	// A private key, whole (review 10-21 P2-6).
	[/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, `${HIDDEN} private key`],
	// A URL with a user and password in it: https://user:secret@host.
	[/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@"'\\]+:[^\s/@"'\\]+@/gi, (_, scheme) => `${scheme}${HIDDEN}@`],
	// GitHub tokens, AWS access keys, Azure DevOps tokens (52 lower-case letters and digits, or 84 with "AZDO"), a bare 88-character storage key.
	[/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g, HIDDEN],
	[/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, HIDDEN],
	[/(?<![A-Za-z0-9])(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{52}(?![A-Za-z0-9])/g, HIDDEN],
	[/(?<![A-Za-z0-9])[A-Za-z0-9]{76}AZDO[A-Za-z0-9]{4}(?![A-Za-z0-9])/g, HIDDEN],
	[/(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{86}==(?![A-Za-z0-9+/=])/g, HIDDEN],
	// An auth header or a bearer token, with or without its header name.
	[/\b(bearer|basic)\s+[A-Za-z0-9\-._~+/]{12,}=*/gi, (_, kind) => `${kind} ${HIDDEN}`],
	// A JSON web token: three base64url parts, the first starting with {"…
	[/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, HIDDEN],
	// A storage or SAS signature, an account key, a connection string's key.
	[/\b(sig|AccountKey|SharedAccessKey|SharedAccessSignature)=[^\s&;"']{8,}/gi, (_, k) => `${k}=${HIDDEN}`],
	// A named secret: "access_token": "…", api-key=…, client_secret: …, password = …, x-ms-…-token: …
	[/\b((?:access|refresh|id|auth|session)[_-]?token|api[_-]?key|client[_-]?secret|password|passwd|pwd|x-ms-[\w-]*token|authorization|cookie)("?\s*[:=]\s*"?)(?!\[hidden\]|bearer\b|basic\b)[^\s"',;}]{6,}/gi, (_, k, sep) => `${k}${sep}${HIDDEN}`],
]

export function scrub(text: string): string {
	let out = text
	for (const [re, to] of PATTERNS) out = out.replace(re, to as never)
	return out
}

// Every string in a record, at any depth; anything else as it is.
export function scrubDeep<T>(v: T): T {
	if (typeof v === 'string') return scrub(v) as T
	if (Array.isArray(v)) return v.map(scrubDeep) as T
	if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x)])) as T
	return v
}
