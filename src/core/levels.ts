import type { ChatLevel, Config } from './types.ts'

export const levelOf = (cfg: Pick<Config, 'chatLevels'>, chatId?: string): ChatLevel | undefined => (chatId ? cfg.chatLevels?.[chatId]?.level : undefined)
export const offRecord = (cfg: Pick<Config, 'chatLevels'>, chatId?: string) => levelOf(cfg, chatId) === 'off'
// A level that holds a reply using the chat: private or off the record. Shareable within my org is a normal chat for lessons and work.
export const heldLevel = (cfg: Pick<Config, 'chatLevels'>, chatId?: string): 'private' | 'off' | undefined => { const l = levelOf(cfg, chatId); return l === 'private' || l === 'off' ? l : undefined }
export const shareable = (cfg: Pick<Config, 'chatLevels'>, chatId?: string) => levelOf(cfg, chatId) === 'shareable'
export const LEVEL_SAYS: Record<ChatLevel, string> = {
	private: 'private: a reply elsewhere that uses anything from it waits for your ok',
	off: 'off the record: never learned from or searched, and a reply elsewhere that uses anything from it waits for your ok',
	shareable: 'shareable within your org: Delegate may quote it in other chats where everyone is from your org. Chats with guests or people from outside still wait for you'
}
