import type { ChatLevel, Config } from './types.ts'

export const levelOf = (cfg: Pick<Config, 'chatLevels'>, chatId?: string): ChatLevel | undefined => (chatId ? cfg.chatLevels?.[chatId]?.level : undefined)
export const offRecord = (cfg: Pick<Config, 'chatLevels'>, chatId?: string) => levelOf(cfg, chatId) === 'off'
export const LEVEL_SAYS: Record<ChatLevel, string> = {
	private: 'private: a reply elsewhere that uses anything from it waits for your ok',
	off: 'off the record: never learned from or searched, and a reply elsewhere that uses anything from it waits for your ok',
}
