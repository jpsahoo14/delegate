export declare const V: 1
export declare const MAX_TEXT: number
export declare const POLL_MS: number
export declare const BEAT_MS: number
export declare const OPEN_MS: number
export declare const TTL_MS: number

export type Address = { machine: string; session: string }
export type Message = { v: 1; id: string; to: Address; from: string; at: string; expiresAt: string; text: string }
export type Receipt = { v: 1; id: string; state: 'delivered' | 'refused'; why?: string; at: string; messageId?: string; reply?: string; repliedAt?: string; recovered?: boolean; ended?: string }
export type SessionEntry = { v: 1; session: string; machine: string; name?: string; cwd: string; branch?: string; client?: string; pid: number; startedAt: string; beatAt: string; open: boolean; busy: boolean; keys: string[]; lastAsk: string; lastAnswer: string }
export type Settings = { root: string; machine: string; local: string; copilotHome: string }
export type JoinedSession = {
	sessionId: string
	send(options: { prompt: string }): Promise<string>
	on(handler: (e: { type: string; data?: Record<string, unknown> }) => void): () => void
	log?(text: string, options?: { ephemeral?: boolean }): unknown
}

export declare function addr(machine: string, session: string): string
export declare function dirs(root: string): { sessions: string; inbox: string; receipts: string }
export declare function writeJsonAtomic(p: string, v: unknown, who: string): void
export declare function newId(from: string, now?: number): string
export declare function writeMessage(root: string, m: { to: Address; from: string; text: string; ttlMs?: number; now?: number }): Message
export declare function readInbox(root: string, a: string): Message[]
export declare function readReceipt(root: string, a: string, id: string): Receipt | undefined
export declare function writeReceipt(root: string, a: string, r: Omit<Receipt, 'v'>, who: string): void
export declare function refusal(msg: unknown, me: Address, now?: number): string
export declare function frame(msg: Pick<Message, 'id' | 'from' | 'at' | 'text'>): string
export declare function claim(local: string, session: string, id: string, gen?: number): boolean
export declare function claimGen(local: string, session: string, id: string): number
export declare function claimStale(local: string, session: string, id: string, alive?: (pid: number) => boolean, bootMs?: number): boolean
export declare function pidAlive(pid: number): boolean
export declare function inTranscript(eventsFile: string, id: string, raw?: boolean): boolean
export declare function subdirs(d: string): string[]
export declare function keysFrom(text: string): string[]
export declare function workspace(copilotHome: string, session: string): { cwd?: string; branch?: string; name?: string; user_named?: string; client_name?: string }
export declare function closeDead(root: string, machine: string, alive?: (pid: number) => boolean): number
export declare function listSessions(root: string, now?: number): SessionEntry[]
export declare function settings(local?: string): Settings | undefined
export declare function startInbox(session: JoinedSession, cfg: Settings & { pollMs?: number; beatMs?: number }): { poll(): Promise<void>; ready: Promise<void>; close(): Promise<void> }
export declare function settle(root: string, a: string, id: string): void
