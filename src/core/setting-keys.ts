export const STATIC_SETTING_KEYS = [
	'reviewRule', 'profile', 'aliases', 'reviewerGroups', 'knowledge', 'orgVisibleProjects', 'repos', 'deployTo',
	'summaryAt', 'quietHours', 'dailyRuns', 'autoUpdate', 'updateEvery', 'signature', 'signApproved',
	'noticeHabits', 'reviewLearning', 'delayMin', 'undoMin', 'maxAutoPerChatHour', 'quiet', 'tz',
	'pollIdle', 'pollFast', 'pollFastFor', 'maxParallel', 'hostIdleMin', 'retentionDays', 'followUpHours',
	'model', 'showDetails', 'toolsAll',
] as const
export type StaticSettingKey = typeof STATIC_SETTING_KEYS[number]
export type SettingKey = StaticSettingKey | `change:${string}` | `read:${string}` | `allow:${string}`

export const settingKey = (entry: string): SettingKey =>
	STATIC_SETTING_KEYS.find(key => key === entry) ?? `change:${entry}`
