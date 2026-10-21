// An experience draws the page from the same model, state, and actions. Today there is one, view/classic. A second one is a
// folder next to it (view/next) and an entry in app.ts EXPERIENCES; app.ts keeps routes, keys, and events for both.
//
// What app.ts relies on in the markup, so the events and keys work the same in any experience:
// - #app gets the experience's chrome; #main is the drawn area; data-mode on #app is the shell's.
// - Actions are buttons or links with data-act (and data-v); rows and cards carry data-code; list actions carry data-key.
// - Fields carry data-input (card), data-set (settings), data-f (reminder), data-ws (sheet watch), data-wf (row watch),
//   data-opt / data-cmt / data-fact (picks), data-every (watch timing); forms carry data-form (ask, mark, report, missed).
// - Ids app.ts focuses: card-<code>, pri-<code>, ed-<code>, askin-<code>, mk-<code>, oth-<code>, wt-<code>, o-<code>-<n>,
//   cm-<code>-<n>, set-<key>, setsec-<section>, ws-text, repin, missin, and sections #running and #automations.
//
// What an experience must not do: change page state while drawing. It reads V and S and reports what it drew (the markup
// above), nothing more. Before every draw, state/actions.ts viewing() settles what the page shows, so every experience gets it:
// - S.cur, the card the Needs you queue is on; the keys (j/k, l, a, e, 1-9, Ctrl/⌘+Enter), Next, and Previous act on it;
// - on a Done filter, S.seenOpen (what was new when it was opened, to keep marked) and the seen mark a moment later.
// Opening forms is state too (S.sheet, S.form, S.wform, S.watchForm): the controls and actions set them, the view only reads.
// (The shared redraw step in view/render.ts keeps S.deferred and S.pressing; that is not the experience's.)
import type { AutoForm } from '../model/types.ts'
import type { Theme } from './theme.ts'

export type Experience = {
	// Draws what stays for the page's life: the header, the toast and live region, and the key list. Once, at boot.
	boot(app: HTMLElement): void
	// Draws the current state: tabs, status, and the main area. Reads state only; see above.
	draw(enter: boolean): void
	// Tells the owner something: in the live region, and as a toast unless toast is false.
	say(text: string, toast: boolean): void
	// Shows the theme in use on its control.
	theme(t: Theme): void
	// Where an address opens, when it differs from the address (route.ts). Optional.
	alias?(hash: string): string
	// The key list.
	keys: { open(): void; isOpen(): boolean }
	// Small updates in place while the owner types, where a redraw would move the caret or drop a click.
	patch: {
		primary(code: string, label: string, disabled: boolean): void
		reminder(f: AutoForm): void
		unsaved(field: HTMLElement): void
	}
}
