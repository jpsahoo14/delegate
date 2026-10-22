# React parity inventory

Pinned 2026-10-22 against the approved New experience's U01-U61 list and repo
scenarios at c1ead6c. Status is deliberately honest: M1 has no item features.
Missing means not built in React, not missing from the existing app.
The final M4 pass must additionally classify each SC row in docs/scenarios.md.

| Case | Capability | React status | Planned surface |
| --- | --- | --- | --- |
| U01 | Ready reply, edit, send, Later, Ask | Missing | Open card |
| U02 | Answer a question, preview before send | Missing | Open card |
| U03 | Single/multiple choices, Other | Missing | Open card |
| U04 | Meeting choices and clashes | Missing | Open card |
| U05 | Select changes, meaning before approval | Missing | Open card |
| U06 | New asker message and redraft | Missing | Pinned card / new version |
| U07 | Owner replied externally | Missing | Done |
| U08 | Multiple askers, one group reply | Missing | Now / card |
| U09 | Room-directed ask | Missing | Now marker / card |
| U10 | Untagged follow-up attribution | Missing | Now / Why |
| U11 | Other-language reply and IME | Missing | Card |
| U12 | Unreadable attachment gaps | Missing | Why |
| U13 | Private-source holds | Missing | Sources / warnings |
| U14 | Before-setup marker and hold | Missing | Now / card |
| U15 | Missed-message link | Missing | Find / Make it an item |
| U16 | Review verdict and explicit vote | Missing | Changes |
| U17 | Edited/deleted source message | Missing | Server refresh |
| U18 | Kept owner to-dos | Missing | Now / checklist |
| U19 | External action closes work | Missing | Now / Done |
| U20 | Check-date nudge/wait/close | Missing | Open card |
| U21 | Proposed owner work | Missing | Track / Skip |
| U22 | Running long work | Missing | Working / computer link |
| U23 | Recheck in same item | Missing | Now |
| U24 | Retry wait, honest Working | Missing | Waiting / Working |
| U25 | Exhausted tries, holding reply | Missing | Stopped card |
| U26 | Nothing-needed close/reopen | Missing | Done |
| U27 | Private Ask and note reuse | Missing | Ask thread |
| U28 | Scheduled rule reply | Missing | Waiting |
| U29 | Waiting on someone, draft nudge | Missing | Waiting |
| U30 | Watch target, condition, timing, stop | Missing | Waiting / watch sheet |
| U31 | Follow-up extension and stop | Missing | Waiting |
| U32 | Owner PR tracking | Missing | Waiting / changes |
| U33 | Reminder schedule, pause/end | Missing | Waiting / reminder sheet |
| U34 | Named channels and stop | Missing | Now footer |
| U35 | Other person's overdue date | Not needed for parity | Not implemented in current app |
| U36 | Long work goal, waiting and Next | Missing | Now / checklist |
| U37 | Cross-chat work with one home | Missing | Server placement |
| U38 | Build check results | Missing | Checklist |
| U39 | Owner tests and reports verdict | Missing | Report form |
| U40 | At-risk dated promise | Not needed for parity | Not implemented in current app |
| U41 | FYI headline, gist, Needs me, Watch | Missing | Catch up |
| U42 | Quiet-close footer count | Missing | Done |
| U43 | Manager topic digest | Not needed for parity | Not implemented in current app |
| U44 | Meeting decisions summary | Not needed for parity | Not implemented in current app |
| U45 | Sent reply, rule, undo countdown | Missing | Now strip / Done |
| U46 | Correction and feedback | Missing | Done expansion |
| U47 | Why sent/held, sources, searched | Missing | Why / Done expansion |
| U48 | Owner active, automatic send held | Missing | Server scheduling / Waiting |
| U49 | Signature in exact preview | Missing | Draft |
| U50 | Learned fact with source and Undo | Missing | Done / learned |
| U51 | Facts to approve, Save/Skip/Edit | Missing | Minute line / knowledge queue |
| U52 | Habit evidence, Turn on/Not now/Never | Missing | Settings |
| U53 | Chat private/off-record and Change | Missing | Settings |
| U54 | Health problem and fix | Missing | Banner |
| U55 | Paused/stopped, resume | Missing | Banner / status |
| U56 | Back-from-leave briefing | Not needed for parity | Not implemented in current app |
| U57 | Update version and check | Missing | Now footer |
| U58 | Reading machine and check | Missing | Status |
| U59 | Stopped/missing job | Missing | Your move / retry |
| U60 | Nobody on next step | Missing | Waiting / Do it now |
| U61 | Off/capped/paused/queued reasons | Missing | Server-decided sections |

## M1 coverage

SC-400..404 cover the version/build foundation, not the cases above. No M2-M4
feature is marked Done by virtue of a scaffold, static page or successful compile.
