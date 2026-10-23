// The page's forms: their choices, their defaults, and the command each one sends. Pure.
import { byDate } from './format.ts'
import type { AutoForm, RowWatch, SheetWatch, View } from './types.ts'

// A sent reply can be marked not right. Wrong or incomplete drafts a follow-up for the owner's ok; not needed takes it back if it still can.
// Each: the word to type, the chip, the question, and the button.
export const MARKS: [kind: string, chip: string, ask: string, button: string][] = [['wrong', 'Wrong', 'What should it have said?', 'Draft a correction'], ['incomplete', 'Incomplete', 'What was missing?', 'Draft what was missing'], ['unneeded', 'Should not have replied', 'Anything else? (optional)', 'Note it']]
export const markCommand = (code: string, mark: string | undefined, note: string) => `${mark || 'wrong'} ${code}${note ? `: ${note}` : ''}`

// When a watch should be done by.
export const BY: [key: string, label: string][] = [['', 'No date'], ['today', 'Today'], ['fri', 'Friday'], ['week', 'Next week']]
// How often a watch checks, in minutes.
export const INTERVALS: [minutes: number, label: string][] = [[60, '1 h'], [120, '2 h'], [240, '4 h'], [480, '8 h'], [1440, '1 day']]
export const EVERY: Record<AutoForm['every'], string> = { day: 'Every day', weekday: 'Every weekday', week: 'Every Monday' }
export const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

// People to remind, the ones who asked something today first.
export const peopleOf = (v: View) => { const asked = v.needs.map(c => c.who.name); return v.people.slice().sort((a, b) => (asked.includes(a.name) ? 0 : 1) - (asked.includes(b.name) ? 0 : 1)) }
export const newReminder = (to: string): AutoForm => ({ to, text: 'Reminder: please send me an update.', every: 'weekday', at: '16:00', someone: false })
export const automationInput = (f: AutoForm, v: View) => ({ to: f.to, chatId: v.people.find(p => p.name === f.to)?.chat, text: f.text.trim(), every: f.every, at: f.at, ...(f.every === 'week' ? { day: 1 } : {}) })

// Watch something, from the Ongoing sheet: one sentence, a done-by day, and whether to push.
export const sheetWatchCommand = (f: SheetWatch) => `watch: "${f.text.trim()}"${f.by ? ` by ${byDate(f.by)}` : ''}${f.push ? ' push' : ''}`
// Watch, from a Catch up row: prefilled from what the AI suggested.
export const rowWatchOf = (r: View['done'][number]): RowWatch => ({ target: r.watch?.target ?? r.sentence, until: r.watch?.until ?? 'it is done', by: '' })
export const rowWatchCommand = (code: string, f: RowWatch) => `watch ${code}: "${f.target.trim()}"${f.until.trim() ? ` until "${f.until.trim()}"` : ''}${f.by ? ` by ${byDate(f.by)}` : ''}`
