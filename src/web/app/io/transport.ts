// How the page reaches Delegate: the shell defines window.DELEGATE_IO per mode (src/web/shell.ts, design-spec/client-contract.md).
// The snapshot has none; the chat panel has no settings or seen marks.
import type { Boot, ItemCard, KnowledgeCard, NumbersPage, UiChoice, View, WindowKey } from '../model/types.ts'

export type Called = { ok: boolean; text: string; ids: string[] }
export type Result = { applied: boolean; card?: ItemCard | KnowledgeCard; text?: string; state?: string }
export type IO = {
	call(command: string, seenAt?: string): Promise<Called>
	result(ids: string[], code: string): Promise<Result>
	data(since?: string, ui?: 'new' | 'classic'): Promise<View>
	automate(input: unknown): Promise<{ ok: boolean; text: string; code?: string }>
	settings?(key: string, value: string): Promise<{ ok: boolean; text: string }>
	seen?(filters: string[], at: string): Promise<void>
	// The New experience switch on this machine (R-NEX-01), or that its first-time note was closed. The snapshot has none.
	ui?(b: { ui?: UiChoice['ui']; noted?: boolean }): Promise<{ ok: boolean; ui?: UiChoice }>
	// The Numbers tab, asked for only when it opens and when its window changes (R-NEX-11). The snapshot has none.
	numbers?(window: WindowKey): Promise<NumbersPage>
}

declare global {
	interface Window { DELEGATE: Boot; DELEGATE_IO: IO | null; DELEGATE_POLL_MS?: number; DELEGATE_LOOK_MS?: number }
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
