// The page's data: the view the server builds (src/web/view.ts), and what the owner is doing with it on this page.
import type { AutomationRow, DoneRow, ItemCard, KnowledgeCard, Tile, View, Who } from '../../view.ts'
import type { Mode } from '../../shell.ts'
import type { Chip, NextRow, NextView, Owner, RowAction, RowKind } from '../../next.ts'
import type { UiChoice } from '../../../store/state.ts'
import type { NumbersPage } from '../../numbers.ts'
import type { WindowKey } from '../../../core/numbers.ts'

export type { AutomationRow, Chip, DoneRow, ItemCard, KnowledgeCard, Mode, NextRow, NextView, NumbersPage, Owner, RowAction, RowKind, Tile, UiChoice, View, Who, WindowKey }

// What the shell puts on the page before the script runs (src/web/shell.ts).
export type Boot = { mode: Mode; view: View; name: string; cmd: string }

// How an action waits: finish (the item should leave), draft (wait for a new draft), pick, ask, mark, later, keep, row (a list action).
export type Kind = 'finish' | 'draft' | 'pick' | 'ask' | 'mark' | 'later' | 'keep' | 'row'

// A card's one primary action: the label says what happens, cmd is what the owner would type.
export type Primary = { label: string; cmd: string; kind: Kind; disabled?: boolean; hint?: string; verb?: string }

// What the owner is doing with one card or row, kept across redraws. Keys are a card code, row:<code>, set:<key>, work:<code>, or health.
export type CardUi = {
	status: 'ready' | 'pending' | 'refused'; msg: string; lost: boolean; stale: boolean; touched: boolean
	pick: number[] | null; otherOn: boolean; other: string; editing: boolean; text: string | null; answer: string; ask: string
	cmts: Set<number> | null; facts: Set<number> | null; threadOpen: boolean; whyOpen: boolean; dbgOpen: boolean; menu: boolean
	verb?: string; by?: string; marking?: boolean; mark?: string; marknote?: string; open?: boolean
	// The row's revision when the owner acted: a result belongs to the row as it was (owner 10-21 A33).
	rev?: string
}

// The forms on the page: a reminder, a watch from the Ongoing sheet, and a watch from a Catch up row.
export type AutoForm = { to: string; text: string; every: 'day' | 'weekday' | 'week'; at: string; someone: boolean }
export type SheetWatch = { text: string; by: string; push: boolean }
export type RowWatch = { target: string; until: string; by: string }
