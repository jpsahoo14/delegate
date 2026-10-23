// Every click on the page, delegated from the document by data-act (view/experience.ts lists the contract).
import { kCmd, primaryOf } from '../../model/derive.ts'
import { newReminder, peopleOf } from '../../model/forms.ts'
import type { CardUi, ItemCard, KnowledgeCard } from '../../model/types.ts'
import * as A from '../state/actions.ts'
import { S, U, V, cardOf, env, replaceCard } from '../state/store.ts'
import { current, render } from '../view/render.ts'
import { THEME_LABEL, nextTheme, theme } from '../view/theme.ts'
import { route } from './route.ts'
import { focusOn, say, setTheme } from './ui.ts'
import { closeNote, switchUi } from './switch.ts'
import { copySummary, loadNumbers } from '../state/numbers.ts'

export function onClick(e: MouseEvent) {
	const target = e.target as HTMLElement
	// The link to where the page already is: no hashchange fires, so go there again.
	const same = target.closest?.('a[href^="#settings/"]')
	if (same && same.getAttribute('href') === location.hash) { e.preventDefault(); route(); return }
	const t = target.closest<HTMLElement>('[data-act]')
	document.querySelectorAll('.menu.open').forEach(m => { if (!t || !m.contains(t)) { const code = m.closest<HTMLElement>('[data-code]')?.dataset.code; if (code) U(code).menu = false; m.classList.remove('open') } })
	if (!t) return
	const a = t.dataset.act, code = t.closest<HTMLElement>('[data-code]')?.dataset.code ?? '', v = t.dataset.v ?? ''
	const c = (code && cardOf(code)) as ItemCard, u = (code && U(code)) as CardUi
	switch (a) {
		case 'primary': if (/^K/.test(code)) A.act(code, code, kCmd(c as unknown as KnowledgeCard, U(c.code)), 'finish', c.rev, 'primary'); else { const p = primaryOf(c, U(c.code), env.name); A.act(code, code, p.cmd, p.kind, c.rev, 'primary') } break
		case 'later': A.act(code, code, `later ${code}`, 'later', c.rev); break
		case 'dismiss': A.act(code, code, `skip ${code}`, 'finish', c.rev); break
		case 'skipk': A.act(code, code, `skip ${code}`, 'finish', c.rev); break
		case 'continue': A.act(code, code, `continue ${code}`, 'keep', c.rev); break
		// The runner answers with the reply quoted and asks for one more ok; the card keeps that answer as its result line.
		case 'replyonly': if (c.replyOnly) A.act(code, code, c.replyOnly, 'keep', c.rev); break
		case 'setswitch': A.toggleSetting(v); break
		case 'theme': setTheme(nextTheme()); say(`Theme: ${THEME_LABEL[theme()]}.`, false); break
		case 'ui': void switchUi(env.ui === 'new' ? 'classic' : 'new'); break
		case 'uinote': closeNote(); break
		// A row on Now: its existing command, on the code that placed it; ok carries what the owner saw.
		case 'nact': A.act(`row:${code}`, code, v, 'row', t.closest<HTMLElement>('[data-rev]')?.dataset.rev); break
		case 'wsby': S.wform!.by = v; render(); break
		case 'wscreate': A.startSheetWatch(); break
		case 'watchopen': A.openRowWatch(v); render(); focusOn(`wt-${v}`); break
		case 'watchcancel': S.watchOpen = null; render(); break
		case 'wby': S.watchForm!.by = v; render(); break
		case 'watchgo': A.startRowWatch(v); break
		case 'seenall': A.seenAll(); break
		case 'findmissed': A.findMissed(); break
		case 'copydebug': navigator.clipboard?.writeText(c.debug!.join('\n')).then(() => say('Details copied.'), () => say('Could not copy. Select the lines and copy them.')); break
		case 'teams': u.menu = false; window.open(c.teams, '_blank', 'noopener'); render(); break
		// Teams cannot pre-fill a group chat's compose box from a link, so the reply goes to the clipboard and the chat opens.
		// When the owner sends it from Teams, Delegate sees their own reply and closes the item.
		case 'teamsdraft': {
			u.menu = false
			const text = u.editing ? (u.text ?? '') : c.draft?.text ?? ''
			navigator.clipboard?.writeText(text).then(() => say(`Reply copied. Paste it in Teams, change it, and send. ${env.name} closes this item when it sees your reply.`), () => say('Could not copy. Select the reply and copy it yourself.', false))
			window.open(c.teams, '_blank', 'noopener'); render(); break
		}
		case 'edit': Object.assign(u, { menu: false, editing: true, text: u.text ?? c.draft?.text ?? '' }); render(); { const ed = document.getElementById(`ed-${code}`) as HTMLTextAreaElement | null; if (ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length) } } break
		case 'canceledit': Object.assign(u, { editing: false, text: null }); render(); break
		case 'markopen': Object.assign(u, { marking: true, mark: u.mark || 'wrong' }); render(); focusOn(`mk-${code}`); break
		case 'markkind': u.mark = v; render(); focusOn(`mk-${code}`); break
		case 'checkupdate': A.checkUpdate(); break
		case 'reportopen': S.reporting = true; render(); focusOn('repin'); break
		case 'reportcancel': S.reporting = false; render(); break
		case 'saveset': A.saveSetting(v); break
		case 'markcancel': Object.assign(u, { marking: false, marknote: '' }); render(); break
		case 'thread': Object.assign(u, { menu: false, threadOpen: !u.threadOpen }); render(); break
		case 'menu': e.stopPropagation(); u.menu = !u.menu; t.closest('.menu')!.classList.toggle('open', u.menu); t.setAttribute('aria-expanded', String(u.menu)); if (u.menu) t.closest('.menu')!.querySelector<HTMLElement>('[role=menuitem]')!.focus(); break
		case 'shownew': if (S.fresh[code]) replaceCard(S.fresh[code]); delete S.fresh[code]; Object.assign(u, { stale: false, touched: false, status: 'ready', msg: '' }); render(); break
		case 'usenote': { const n = c.notes[+v]; A.act(code, code, `${code}: Use this: ${n.a}`, 'draft', c.rev); break }
		case 'askmore': focusOn(`askin-${code}`); break
		case 'prev': A.step(-1); break
		case 'next': A.step(1); break
		case 'goto': A.go(v); break
		case 'keys': current().keys.open(); break
		case 'healthfix': A.act('health', '', V.health[0].fix!.command, 'row'); break
		case 'undo': e.preventDefault(); A.act(`row:${v}`, v, `undo ${v}`, 'row'); break
		// data-seen: what the owner saw, for a Mark done (re-review N2 P2-C); other list buttons carry none.
		case 'rowact': A.act(t.dataset.key!, v.split(' ')[1], v, 'row', t.dataset.seen); break
		case 'newauto': S.sheet = 'pick'; render(); document.querySelector<HTMLElement>('.tpl')?.focus(); break
		case 'tpl':
			if (v === 'watch') { S.wform = { text: '', by: '', push: false }; S.sheet = 'watch'; S.formErr = ''; render(); focusOn('ws-text'); break }
			if (v !== 'remind') { say('Say it in chat: "send me a summary every day at 6 pm".'); break }
			S.form = newReminder(peopleOf(V)[0]?.name ?? '')
			S.sheet = 'form'; S.formErr = ''; render(); document.querySelector<HTMLElement>('.sheet [data-act=autocreate]')?.focus(); break
		case 'tplto':
			S.form = newReminder(v)
			S.sheet = 'form'; S.formErr = ''; render(); document.querySelector<HTMLElement>('.sheet [data-act=autocreate]')?.focus(); break
		case 'to': S.form!.to = v; S.form!.someone = false; render(); break
		case 'someone': S.form!.someone = !S.form!.someone; render(); break
		case 'every': S.form!.every = v as 'day'; render(); break
		case 'autoback': S.sheet = 'pick'; render(); break
		case 'closesheet': S.sheet = null; render(); break
		case 'sheetbg': if (e.target === t) { S.sheet = null; render() } break
		case 'autocreate': A.createAutomation(); break
		case 'numretry': void loadNumbers(); break
		case 'numcopy': copySummary(); break
	}
}

