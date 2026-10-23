# React New parity acceptance

Current scope is the React **New** experience. React Classic and its in-app toggle
belong to the other builder; this file does not sign off Classic or integration.
The original independent review is retained in [the M4 report](../reviews/react-parity-m4.md).
Its Missing cells describe the earlier inventory, not the accepted source now.

| Inventory | Done in React | Not needed | Missing | Total |
| --- | --- | --- | --- | --- |
| U01-U61 | 56 | 5 | 0 | 61 |
| Master scenarios | 125 | 161 | 0 | 286 |

Done means the existing capability is implemented in React New with the named
browser/shared-engine evidence. Not needed states why no React reimplementation
is appropriate. Future U35/U40/U43/U44/U56 capabilities absent from today's
app are not invented. All master IDs, including intentional numeric gaps, are
preserved exactly once.

The owner changed the process to **build and direct browser walkthroughs only**
per commit. Existing B/API/PROJ/PRE results below predate that final instruction;
they were not rerun for this acceptance. Formal regression completion, unit
tests and golden retirement happen after both experiences reach parity.
No full-suite, typecheck, CI or public-content check is claimed here.

O means the original Proof cell of that exact master scenario remains retained
in [docs/scenarios.md](../docs/scenarios.md). Shared engine/install/adapter/AI
behavior is reused, not reimplemented or falsely claimed as a new live run.

### Current code keys

| Key | Concrete current surface |
| --- | --- |
| P | [reactProjection / resolvePageIntent](../src/web/react-projection.ts): shared `view`, `nextView`, `place`, normalized entities, typed bindings, exact revisions and original runner commands. |
| N | [Now / NowRow / Standalone](../src/web/react/features/Now.tsx), [resolvers](../src/web/react/data/hooks.ts): server sections, Find, markers, Undo strip, row opening, standalone reminders. |
| C | [ItemCard](../src/web/react/features/ItemCard.tsx): draft, answer, choices, changes, source links, private Ask, checklist, owner report, More. |
| D | [Done / Entry](../src/web/react/features/Done.tsx), [activity retention](../src/web/react/data/done.ts): seven-day server entries, filters, feedback, watches, expansion, nested card. |
| T | [PageTools](../src/web/react/features/PageTools.tsx), [sheet state](../src/web/react/data/forms.ts): watch, reminder, missed-message and report forms; watch/channel management. |
| K | [Knowledge](../src/web/react/features/Knowledge.tsx): fact selection, single-fact edit, Save/Skip; P supplies learned Undo. |
| S | [Settings](../src/web/react/features/Settings.tsx), [settings hooks](../src/web/react/data/screens.ts), [server metadata](../src/web/settings.ts): fields, validation, habits, privacy, models, advanced links. |
| Q | [Numbers](../src/web/react/features/Numbers.tsx), [query/window state](../src/web/react/data/screens.ts): server counts, lists, rules, bars and anonymous summary. |
| A | [App](../src/web/react/App.tsx), [navigation](../src/web/react/data/navigation.ts), [interface state](../src/web/react/data/interface.ts), [version service](../src/web/react/services/version.ts): views, keys, themes, version menu and footer. |
| G | [ActionButton / ActionState](../src/web/react/features/ActionButton.tsx), [action hooks](../src/web/react/data/hooks.ts), [API](../src/web/react/services/api.ts), [pending receipts](../src/web/react/services/pending.ts): submission, result, duplicate protection, expiration. |
| E | Shared engine, not browser business logic: [runner apply](../src/runner/apply.ts), [placement/view](../src/web/next.ts), [server view](../src/web/view.ts), [store](../src/store/state.ts). O names the exact retained proof for each engine case. |

### Existing React proof keys

Unless otherwise indicated, B keys refer to exact test-title prefixes in [react-app-browser.test.ts](../test/react-app-browser.test.ts), all beginning `React app browser: `.

| Key | Exact distinctive title prefix / existing proof |
| --- | --- |
| B1 | `Now contains every server row, rows never act, and all four screens load in both themes and widths` |
| B2 | `a stale click reaches the real gate and keeps the edited words without sending` |
| B3 | `choices preview before sending, owner reports draft, holding replies and stopped work are actionable` |
| B4 | `review meaning precedes selected-change approval and the exact subset reaches the runner` |
| B5 | `a lost response, double click and reload send one exact edited reply and Undo targets that send` |
| B6 | `refresh preserves focus, text, selection, composition and folds; stale approval refuses` |
| B7 | `crosscheck headlines are buttons-only, ask times come from messages, and separate approvals remain visible` |
| B8 | `500-row redraw with every headline changed remains below one frame` |
| B9 | `every setting is editable, invalid values stay unsaved and AI models are visible` (actually saves/refuses `dailyRuns`; not proof of every metadata row's save). |
| B10 | `Numbers opens the exact counted records and copies only its displayed anonymous summary` (actually checks the Handled list, not every list kind). |
| B11 | `missed message, problem report, watch and reminder sheets use the real server and preserve owner text` (actually submits watch, missed-message and reminder; does not submit Report a problem). |
| B12 | `keyboard paths and private Ask work without turning the question into a reply` |
| B13 | `every actionable non-reply row posts its offered typed action and is applied` (actually loops A22, A26, A34, A37, W2, A42 and A23; not every lifecycle action). |
| B14 | `multi-choice and meeting selections only create previews; sources stay private and notes never approve another item` |
| B15 | `version switching asks before discarding a sheet edit and Cancel keeps its exact text` |
| B16 | `facts can be selected, saved and undone from Done without changing unselected facts` |
| B17 | `text typed after submission remains visible even when the item moves to Done`; `a pending answer preserves any newer answer text until the owner chooses the new version` |
| B18 | `a settings save cannot erase text typed while the request is pending` |
| B19 | `feedback identifies the displayed send and cannot remove a later correction`; `changed Done activity keeps feedback, focus and composition and never deletes the replacement send` |
| B20 | `changed Catch up keeps an unfinished watch rather than silently replacing it` |
| B21 | `stale reminder recipient metadata refuses before creating any schedule` |
| B22 | `Auto theme follows system changes, and Numbers keeps its selected window across tabs` |
| B23 | `a grouped thread exposes both independent PR approvals and targets the chosen part` |
| B24 | `Catch up can become a bounded watch and a quiet close can be reopened for a draft` |
| B25 | `editing in the chat copies the visible reply and opens its link without sending` |
| B26 | `a real new draft gains a New marker which stays for the current look` |
| B27 | `made and left-out changes remain visible without being offered again` |
| B28 | `Numbers fetches on open and window change, not page polls or focus events` (M3 `3afa843`, parent reports passing; includes remount and no reconnect refetch). |
| B29 | `advanced Settings links open More and failed refresh keeps the same focused edit` (M3 `3afa843`, parent reports passing). |
| B30 | `Settings habit and privacy controls apply and refresh without an automatic send` (M3 `3afa843`, parent reports passing; includes learned provenance, Remove, Not now, Never, confirmation cancellation and successful privacy reset). |
| API | [React action API tests](../test/react-actions-api.test.ts), [approval races](../test/react-approval-races.test.ts), [structured enqueue](../test/react-enqueue.test.ts): durable receipts, stale/invalid refusals, exact target, to-do identity, option reorder and Undo races. |
| PROJ | [projection tests](../test/react-projection.test.ts), [UI contract tests](../test/react-ui-contract.test.ts): one placement, reference integrity, exact gates, buttons-only text, source URL policy, stable effects and uncertain immediate operations. |
| PRE | [preview browser](../test/react-preview-browser.test.ts), [preview server](../test/react-preview.test.ts), [recovery browser](../test/react-recovery-browser.test.ts), [installed bundle](../test/react-installed.test.ts): version persistence/failure, served assets, CSP/token and installed runtime. |


### Final browser evidence

- **B31.** Direct Chrome/Playwright clicks against the real server and committed
  build, using temporary fictional stores and a non-sending source/runner stub.
  Verified paused Send plus local Ask/exact Undo/Resume/edit retention; overdue
  Wait 3 days/Close; health kick and inline response; bootstrap 1/2 progress;
  all reading states and updater cadence; meeting metadata/work details;
  section-local keyboard navigation and exact Copy details; fresh-before-earlier
  Done; Find/create/same-link lookup; exact Since-to-Numbers count; honest
  missing rows and short times; permission-switch refusal; quiet/empty sections.
  The missed-item continuation seeds only a fictional worker result, not an AI
  response or an external action. Four width/theme screenshots were inspected;
  400x860 geometry puts Your move above 430px, with no horizontal overflow.
- **B32.** Completed fixture-browser runs before the final build-only directive
  additionally proved Other's exact draft request, actual holding send with
  double-click/stale gates, fact Edit/Skip/later typing, all editable settings
  and pipeline validation, all Numbers lists/unknown route keys/offline retry,
  report radio focus/literal dollar text/failure retention, watch interval/
  extension/stop, reminder Pause/Resume/End and isolated channel Stop.
  These are prior executed results, not a claim that all regression tests are
  currently green or a substitute for the later dedicated test phase.

## U01-U61: every case

| Case | Capability | Status | Current code and existing proof / exact reason |
| --- | --- | --- | --- |
| U01 | Ready reply, edit, send, Later, Ask | Done in React | C/G; B2, B5, B12; original apply semantics retained. |
| U02 | Answer a question, preview before send | Done in React | C answer field and P answer binding; B3, B17; B14 proves preview does not send. |
| U03 | Single/multiple choices, Other | Done in React | C/P; B3/B14 plus B32 Other preserves the exact answer for drafting without sending, and choice previews require their separate Send. The fictional worker is not a live AI run. |
| U04 | Meeting choices and clashes | Done in React | C meeting strip now retains subject, local start/end, duration and attendees. B31 directly opens A5 and reads the strip; B14 exercises conflict/options and preview without a send. |
| U05 | Select changes, meaning before approval | Done in React | C/P/G; B4, B27, API exact subset and stale-change refusal. |
| U06 | New asker message and redraft | Done in React | P message count, C revision pin/new version; B6, B17, B26. |
| U07 | Owner replied externally | Done in React | D renders `inTeams`, P uses shared done rows; B1 renders Done, original SC-161 proves the external close. No browser close detector reimplemented. |
| U08 | Multiple askers, one group reply | Done in React | P/N/C retain shared subjects/draft; B23 proves distinct parts remain accessible, B5 exact one-target send; original SC-109 proves group merge/tag construction. |
| U09 | Room-directed ask | Done in React | N renders server room chip, C ask; B1 seeded A35, B7; original SC-160 owns intake judgment. |
| U10 | Untagged follow-up attribution | Done in React | P server facts, N quote attribution, C thread; B1/B7 and original SC-121/159 routing proof. |
| U11 | Other-language reply and IME | Done in React | C controlled composing fields and revision pins; B6/B19, original SC-158 language selection. |
| U12 | Unreadable attachment gaps | Done in React | C Why `gaps`, server-owned draft hold; B1/B14 source/card surface, original SC-13. |
| U13 | Private-source holds | Done in React | C Sources locked/link/stale and context; B14 explicitly checks recipient privacy; original SC-150/153. |
| U14 | Before-setup marker and hold | Done in React | P/N/C `before`; B1 fixture A20, B2 stale gate; original SC-172/173 holds remain. |
| U15 | Missed-message link | Done in React | N Find plus T missed sheet and P typed action; B11. Duplicate entry is separately Missing at SC-277. |
| U16 | Review verdict and explicit vote | Done in React | C changes/meaning and P exact single action label; B4/B23, original SC-197/200 vetted vote. |
| U17 | Edited/deleted source message | Done in React | Shared engine refresh -> P -> C revision pin; B2/B6 reject stale drafts. Source edit/delete decisions remain original engine behavior, not browser logic. |
| U18 | Kept owner to-dos | Done in React | P stable todo IDs, C Yours to do and Mark done; B13 A42, API Mark done identity race. |
| U19 | External action closes work | Done in React | P shared placement and D closed work line; B1/B24, original SC-169/431 proves external completion. |
| U20 | Check-date nudge/wait/close | Done in React | C/P; B31 clicks Wait 3 days and Close on overdue A34, verifies the future work.checkAt and closed work with no sent reply. Goal, waiting context and emphasized news remain visible. |
| U21 | Proposed owner work | Done in React | C/P track/dismiss; B13 A37 exercises Track; original work proposal semantics retained. |
| U22 | Running long work | Done in React | N Working, C job/More continue; B1/B3; original SC-30/36 owns execution/continue. Non-item bootstrap progress is separately Missing. |
| U23 | Recheck in same item | Done in React | P original answer/try-again bindings; C retry actions; B3/B13 A22, original SC-31. |
| U24 | Retry wait, honest Working | Done in React | P uses authoritative placement, N chips/Next; B1/B7, PROJ; original SC-177/192 retry timing. |
| U25 | Exhausted tries, holding reply | Done in React | C/N/P; B32 actually double-clicks Send holding reply, verifies one exact send, and changes the holding draft before POST to prove refusal/no queue. B31 verifies work details; original retry/exhaustion rules remain shared O. |
| U26 | Nothing-needed close/reopen | Done in React | D quiet close expands its revision-bound Reopen-and-draft field/action, without sending. |
| U27 | Private Ask and note reuse | Done in React | C private thread, P use-note binding; B12/B14. |
| U28 | Scheduled rule reply | Done in React | N scheduled row/Next, P original actions; B1 fixture A36, original SC-60/64/261 engine proof. |
| U29 | Waiting on someone, draft nudge | Done in React | P waiting binding, N/C waiting actions; B13 W2 and A34, original SC-40/41. |
| U30 | Watch target, condition, timing, stop | Done in React | T/P; B32 applies interval 2h, Extend 7 days and Stop, checking the job interval/end and terminal workflow. The same browser family proves named-channel isolation and reminder Pause/Resume/End. B31 reads updater cadence. |
| U31 | Follow-up extension and stop | Done in React | T/P; B32 applies interval 2h, Extend 7 days and Stop, checking the job interval/end and terminal workflow. The same browser family proves named-channel isolation and reminder Pause/Resume/End. B31 reads updater cadence. |
| U32 | Owner PR tracking | Done in React | T watch creation, N/C shared work/changes; B11/B24/B4, original SC-35/171. |
| U33 | Reminder schedule, pause/end | Done in React | T/N/P; B32 applies reminder Pause/Resume/End and verifies the saved lifecycle. B32 legacy new-reminder routing opens the existing sheet; version aliases save only after discard confirmation. |
| U34 | Named channels and stop | Done in React | T/P; B32 removes the named Acme channel through its actual Stop button and verifies the Globex channel remains. No live channel is read or changed. |
| U35 | Other person's overdue date | Not needed | Future capability absent from current Classic and New, explicitly excluded by the pinned inventory. Do not invent date tracking. |
| U36 | Long work goal, waiting and Next | Done in React | N/C retain where, build, news, yours.check and then/then.you. B31 opens work A40, reads completed build 991 and emphasized progress, and exercises its scoped navigation. The shared server still owns checklist/current-step derivation; O remains applicable. |
| U37 | Cross-chat work with one home | Done in React | P authoritative subjects, N item selector; PROJ/B23 proves separate part approvals target the chosen part; original SC-142 engine remains. |
| U38 | Build check results | Done in React | P plan/steps, C build number + Done step; B3 fixture A40 checklist/report, original SC-142/231 owns no-AI build probes. |
| U39 | Owner tests and reports verdict | Done in React | C report radios/text and P report binding; B3 submits Issues found with exact command-looking text and proves no automatic send. Full failure/focus matrix remains SC-302 proof gap. |
| U40 | At-risk dated promise | Not needed | Future capability not in either current renderer; no new risk/date inference required for migration. |
| U41 | FYI headline, gist, Needs me, Watch | Done in React | N server headline/gist, D source/Needs me/watch form; B20/B24 plus original Catch up proof. |
| U42 | Quiet-close footer count | Done in React | D Catch-up-only closed count and compact reopen details. |
| U43 | Manager topic digest | Not needed | Future capability absent from current Classic/New. A manager digest is not a migration surface. |
| U44 | Meeting decisions summary | Not needed | Future capability absent from current Classic/New. Do not infer/build a meeting digest. |
| U45 | Sent reply, rule, undo countdown | Done in React | N strip/D entry/G expiration; B5/API exact Undo target; browser observation 3 confirms by-rule and countdown. |
| U46 | Correction and feedback | Done in React | D feedback meaning/confirm/P target; B19 proves displayed-send binding and replacement protection. |
| U47 | Why sent/held, sources, searched | Done in React | C and compact D Why show confidence/sources/gaps; D labels available searches as current item context, not frozen sent evidence. |
| U48 | Owner active, automatic send held | Done in React | P server decides scheduled/waiting placement; N renders Next/reason; B1/PROJ and retained SC-64 engine proof. |
| U49 | Signature in exact preview | Done in React | C renders server-computed sendText; raw owner edits remain unsigned. Signature changes invalidate shown, queued and deferred-work approvals. Paired Chrome covered exact sends, real worker completion, safe reapproval, immutable Done text, retention and lost-response recovery. |
| U50 | Learned fact with source and Undo | Done in React | D sentence names the source, gist gives the learned fact, P offers learned Undo; B16 applies Undo. This matches the actual Classic Done model, not an invented all-facts expansion. |
| U51 | Facts to approve, Save/Skip/Edit | Done in React | K/P; B32 edits a single fact with command-looking text, saves it, keeps later typing pinned, and skips a different proposal. B16 proves selected save and learned Undo. No chat approval is parsed from fact text. |
| U52 | Habit evidence, Turn on/Not now/Never | Done in React | S evidence and P settings actions; B30 explicitly applies all three and Remove, and checks learned provenance. Parent reports passing at M3 `3afa843`. |
| U53 | Chat private/off-record and Change | Done in React | S named chat level, P confirmed normal-again action; B30 checks cancel/no POST then success/config removal. Shared levels rules remain SC-156. |
| U54 | Health problem and fix | Done in React | P/N; B31 clicks Try again on the fictional source banner and verifies a new persisted runner kick plus Checking now in that same banner. Real sign-in/retry behavior remains shared O; no live source or AI runs. |
| U55 | Paused/stopped, resume | Done in React | P declares unavailable metadata; G disables and labels Paused/Stopped rather than deciding eligibility. B31 verifies paused Send through an edited pin, usable private Ask and exact Undo, Resume restoring Send, and retained edit text. Original off/cap/stop rules remain O. |
| U56 | Back-from-leave briefing | Not needed | Future capability absent from current Classic/New; existing Since line is not evidence of a new briefing feature. |
| U57 | Update version and check | Done in React | A/S/T retain version/check/failure fields and render automatic cadence/channel. B31 reads the configured every-hour cadence. Existing update controls and runner/updater behavior remain shared O; no update/release is performed. |
| U58 | Reading machine and check | Done in React | A/P; B31 changes fictional good-read timestamps and observes Reading, Reading is late, Not reading now and Chats have not been read yet. Machine/time metadata remains visible; timing thresholds remain shared E/O. |
| U59 | Stopped/missing job | Done in React | P attention/placement, C row action; B3/B13 A22 retries; original SC-193 no missing-job disappearance. |
| U60 | Nobody on next step | Done in React | N Next nobody, C/P Do it now; B13 A26 applies it without an accidental send. |
| U61 | Off/capped/paused/queued reasons | Done in React | P authoritative E placement, N reason/Next and summary; B1/PROJ; original SC-192 ensures only runnable work is Working. Exact paused-send presentation remains U55, not reclassified as a placement-engine defect. |

## SC master: every individual row

All O references below retain the original master proof for that exact ID. The order is the master order, not a newly sorted or renumbered list. "E unchanged" means **Not needed to reimplement: shared engine unchanged plus original proof retained**, not "already tested in React".

| ID | Status | Current capability / exact reason and evidence |
| --- | --- | --- |
| SC-430 | Not needed | E unchanged: approval crosscheck, contradictory draft withdrawal and multi-PR evidence are engine gates; O `engine crosscheck F1:` / `engine crosscheck safety:` retained. |
| SC-431 | Not needed | E unchanged: terminal approval closure, receipts and scope-aware remaining work; O F2/F3 retained. P consumes the resulting state. |
| SC-432 | Done in React | P authoritative one-placement references; N/C grouped parts; PROJ/B1/B23 plus O F3/A14. |
| SC-433 | Not needed | E unchanged: plan updates cannot replace original ask/done-when without new owned ask; O retained. |
| SC-434 | Not needed | E unchanged: intake/backlog judgment and skip-audit records are not browser work; O retained. |
| SC-435 | Not needed | E unchanged: FYI relevance/noise judgment and fictional corpus are engine/eval behavior; O retained. |
| SC-01 | Not needed | E unchanged: ask ingestion, draft creation and nudge; O retained. N/C rendering separately B1. |
| SC-02 | Not needed | E unchanged: follow-up joins original workflow; O retained. |
| SC-03 | Not needed | E unchanged: thank-you/FYI classification and no item; O including private eval retained, not rerun. |
| SC-04 | Not needed | E unchanged: group addressing and paced judgment; O retained. |
| SC-05 | Not needed | E unchanged: split different askers/off-topic asks; O retained. |
| SC-06 | Not needed | E unchanged: external owner reply closes/drops scheduled send; O retained. |
| SC-07 | Not needed | E unchanged: Teams history search/answer sources; O retained. |
| SC-08 | Not needed | E unchanged: redirect judgment; original eval R14 retained, not rerun. |
| SC-09 | Not needed | E unchanged: findings-to-next-step judgment; original eval R10 retained. |
| SC-10 | Done in React | C question/input and P exact approval gate; B2/B3/API; O blank-draft refusal retained. |
| SC-11 | Done in React | C/G exact edit send; B5 plus O edit-only engine proof. |
| SC-12 | Done in React | C private Ask and notes, D nested card; B12/B14 plus O. |
| SC-13 | Not needed | E unchanged: image/file ingestion, reading and unreadable-gap hold; O retained. C displays gaps, no browser attachment reader added. |
| SC-20 | Done in React | C/P selected option -> preview -> explicit Send; B3 and O. |
| SC-21 | Done in React | C multi-select/P picks; B14 checks `[1,3]` and no send; O rewrite proof retained. |
| SC-22 | Done in React | C meeting strip now retains subject, local start/end, duration and attendees. B31 directly opens A5 and reads the strip; B14 exercises conflict/options and preview without a send. |
| SC-23 | Done in React | C selected changes, P exclusion binding; B4/API plus O. |
| SC-24 | Not needed | E unchanged: effect failure recorded once and tick continues; O retained. C displays errors. |
| SC-30 | Not needed | E unchanged: detached long job scheduling/completion; O retained. N/C surface B1/B3. |
| SC-31 | Not needed | E unchanged: same-job/session recheck routing days later; O retained. |
| SC-32 | Not needed | E unchanged: last-turn budget, stop and salvaged result; O retained. |
| SC-33 | Not needed | E unchanged: owned kind fork/session routing; O retained. |
| SC-34 | Not needed | E unchanged: broken-build investigation judgment; eval R03 retained. |
| SC-38 | Done in React | C changes and explicit vote meaning; B4/B23 plus O vetting; no browser merge/deploy inference. |
| SC-35 | Not needed | E unchanged: shepherd polling/build/vote lifecycle; O retained. T/N show resulting watches. |
| SC-36 | Done in React | C More / Open on your computer -> P continue; B1/B12 card surface, O continue/window and SC-262 fake-process safeguards retained. |
| SC-37 | Not needed | E unchanged: Word/doc adapter reads and review judgment; O retained. |
| SC-40 | Done in React | N/C W entry, P waiting actions; B13 W2; O wait creation retained. |
| SC-41 | Done in React | N/P dismiss/follow-up controls; B13 waiting surface; O reply clears wait retained. |
| SC-42 | Not needed | E unchanged: named-channel ingestion/thread linking/no auto-send; O retained. |
| SC-43 | Not needed | E unchanged: tracker interval/change-only checks; O retained. T exposes interval editor, U30 proof gap remains. |
| SC-50 | Not needed | E unchanged: chat-proposed reminder lifecycle and marked sends; O retained. Browser creation tracked separately SC-53/U33. |
| SC-51 | Not needed | E unchanged: advanced schedule/rotation engine capabilities; O retained. Current Classic creation form is not claimed to have all CLI schedules. |
| SC-52 | Not needed | E unchanged: max sends and reply-driven pause/end; O retained. |
| SC-53 | Done in React | T recipient/default schedule/create; B11/B21 with P recipient-revision refusal. O original click-count proof retained; no claim of same layout clicks. |
| SC-54 | Not needed | E unchanged: reminder guest/never/pause policy; O retained. |
| SC-60 | Not needed | E unchanged: rule send delay/marker; O retained. |
| SC-61 | Not needed | E unchanged: no-rule/private/commitment automatic-send holds; O retained. |
| SC-62 | Done in React | N/D/G Undo, API real runner deletion; B5 and O fallback edit-into-withdrawal retained. |
| SC-63 | Not needed | E unchanged: per-chat automatic-send cap; O retained. |
| SC-64 | Not needed | E unchanged: owner activity delays automatic sends; O retained. N renders server reason. |
| SC-65 | Not needed | Self-chat pause command is unchanged; O retained. Browser paused presentation is SC-255, not claimed here. |
| SC-66 | Not needed | E unchanged: send/record crash deduplication; O retained. React request deduplication separately SC-408. |
| SC-67 | Done in React | P/G exact stale revision, C pins visible text; B2/B6/API and O. |
| SC-70 | Not needed | AI/self-chat remember/save/Undo unchanged; O retained. No new free-form chat service built. |
| SC-71 | Not needed | E unchanged: edits start fact-learning proposal; O retained. K proposal surface B16. |
| SC-72 | Not needed | E unchanged: bootstrap judgment/approval policy; O retained. Missing bootstrap progress is SC-118. |
| SC-73 | Not needed | E unchanged: private fact automatic-send exclusion and citations; O retained. C privacy indication B14. |
| SC-74 | Not needed | E unchanged: deduplicate/update known fact; O retained. |
| SC-80 | Done in React | N summary/Your move, D activity, N health replace Classic Home tiles; A keeps four main tabs; B1/B7. O original counting logic retained; Classic layout intentionally not rebuilt. |
| SC-81 | Done in React | N ItemNavigation/resolver Previous/Next without acting; B1/B12 plus O. |
| SC-82 | Done in React | A keyboard handler/C Ctrl+Enter/IME exclusions; B12/B6; O old shortcuts retained as reference. |
| SC-83 | Not needed | Read-only synced snapshot intentionally remains Classic (brief section 3); PRE/O. It is not served by React. |
| SC-84 | Not needed | Self-chat parser/range/answer verbs unchanged; O retained. React buttons use typed intents, not command typing. |
| SC-90 | Not needed | CLI setup checkpoint/resume unchanged; O retained. |
| SC-91 | Not needed | OS runner schedule/launchd/Windows task unchanged; O retained. |
| SC-100 | Not needed | Installer/uninstaller/platform PATH/newline behavior unchanged; O retained. |
| SC-101 | Not needed | Windows launcher delayed uninstall unchanged; original manual Windows proof retained, not rerun on Mac. |
| SC-102 | Not needed | Existing build/integrity portability path unchanged; O retained. React build integration separately SC-404. |
| SC-92 | Not needed | Idle tick API-call budget is shared runner behavior; O retained. |
| SC-93 | Done in React | P/N; B31 clicks Try again on the fictional source banner and verifies a new persisted runner kick plus Checking now in that same banner. Real sign-in/retry behavior remains shared O; no live source or AI runs. |
| SC-97 | Not needed | E unchanged: restart job recovery/foreign PID safety; O retained. |
| SC-94 | Not needed | Shared tick lock/machine lease unchanged; O retained. |
| SC-95 | Not needed | Storage schema forward migration/newer refusal unchanged; O retained. |
| SC-96 | Not needed | Source adapter registration/unknown-adapter handling unchanged; O retained. |
| SC-14 | Not needed | E unchanged: salvage report from task_complete; O retained. |
| SC-98 | Not needed | Shared feedback file retention/CLI summary unchanged; O retained. React feedback submission separately SC-123. |
| SC-99 | Not needed | Shared notes path portability unchanged; O retained. S edits the same metadata. |
| SC-103 | Not needed | CLI tool-server registration/startup unchanged; O retained. |
| SC-104 | Not needed | Install bootstrap/standby ownership unchanged; O retained. |
| SC-105 | Not needed | E unchanged: 30-minute machine failover; O retained. |
| SC-106 | Not needed | E unchanged: stale lock/window PID recovery; O retained. |
| SC-107 | Not needed | E unchanged: paginated initial chat read and weekly top-up; O retained. |
| SC-108 | Not needed | Teams adapter quote/@mention formatting is unchanged; O retained. Exact draft sent via C/G is B5. |
| SC-109 | Not needed | E unchanged: same-ask grouping and tag construction; O retained. React subject visibility B23 does not reimplement grouping. |
| SC-117 | Not needed | CLI setup defaults/two-question workflow unchanged; O retained. |
| SC-118 | Done in React | P/N expose shared non-item bootstrap entries and determinate progress. B31 seeds two fictional parts and reads Learning from Fictional notes: 1 of 2 parts done with progress 0.5. D/B16 retain learned source/gist/Undo. |
| SC-119 | Done in React | D expansion nests C with private Ask; B12/B19 establish private question and sent-entry surface, P keeps notes; O proves engine allows sent-item Ask. |
| SC-120 | Not needed | Shared brand ownership/rename rules unchanged; React [brand bridge](../src/web/react/brand.ts) imports canonical brand. O brand test retained. |
| SC-121 | Not needed | E unchanged: owner-last-speaker follow-up attribution and aliases; O retained. |
| SC-122 | Done in React | S update settings, A version/reload protection and shared updater; B9/B18/PRE; O fast-forward/rollback/restart retained. Home cadence detail separately SC-175. |
| SC-123 | Done in React | D feedback with meaning, confirm and exact displayed-send identity; B19/API plus O. |
| SC-124 | Done in React | A/S/T retain version/check/failure fields and render automatic cadence/channel. B31 reads the configured every-hour cadence. Existing update controls and runner/updater behavior remain shared O; no update/release is performed. |
| SC-125 | Not needed | E unchanged: draft correction examples teach tone not facts; O retained. |
| SC-126 | Done in React | T/P missed-link input and queued missed message; B11; shared worker explains/creates item under O. |
| SC-127 | Done in React | T/P; corrected B11 opens and submits the real problem form with exact text. B32 and B11 also apply typed watches/reminders/missed intake, with stale recipient refusal. B31 verifies the one-way Find lookup after a fictional worker result. |
| SC-128 | Done in React | T/P; B32 removes the named Acme channel through its actual Stop button and verifies the Globex channel remains. No live channel is read or changed. |
| SC-110 | Not needed | Cross-machine session relay transport unchanged; O retained. |
| SC-111 | Not needed | Session process/crash exactly-once delivery unchanged; O retained. |
| SC-112 | Not needed | Offline session queue/expiry unchanged; O retained. |
| SC-113 | Not needed | Relay framing/control-character safety unchanged; O retained. |
| SC-114 | Not needed | Session discovery/metadata/liveness unchanged; O retained. |
| SC-115 | Not needed | CLI extension install/doctor/uninstall unchanged; O retained. |
| SC-116 | Not needed | E unchanged: owner-session routing/approval/refused relay fallback; O retained. |
| SC-129 | Not needed | Session process closure and Windows launcher cleanup unchanged; O retained. |
| SC-130 | Not needed | CLI update runs new code's migrate/install unchanged; O retained. |
| SC-131 | Done in React | D sorts fresh before earlier, then newest time first, using one stable keyed list. B31 reads both fresh and earlier groups and verifies that no fresh row follows an earlier row; retained feedback/watch editing remains B19/B20. |
| SC-132 | Not needed | Publish/history/deny-list/update-source workflow unchanged; O retained. No publication performed. |
| SC-133 | Done in React | C changes/kept to-dos/follow line, N one row; B4/B13/B27 and O action-before-reply/watch semantics. |
| SC-134 | Not needed | E unchanged: reminder-reply AI judgment/reschedule/pause; O retained. No AI run here. |
| SC-135 | Not needed | Feedback-to-eval generation and never-overwrite unchanged; O retained. |
| SC-136 | Not needed | OS process identity/conflict-copy/doctor checks unchanged; O retained. |
| SC-137 | Done in React | S renders every metadata row and saves through original server validation; B9/B18/B29 plus O per-field validation. B9 itself checks only dailyRuns; all-key browser save coverage remains follow-up. |
| SC-138 | Not needed | E unchanged: long-work thread/watch/quiet-date lifecycle; O retained. React work detail omissions separately SC-140. |
| SC-139 | Not needed | E unchanged: topic split, close vs skip semantics and no-draft ok; O retained. |
| SC-140 | Done in React | C/P; B31 clicks Wait 3 days and Close on overdue A34, verifies the future work.checkAt and closed work with no sent reply. Goal, waiting context and emphasized news remain visible. |
| SC-141 | Not needed | Shared direct-chat rule matching unchanged; O retained. |
| SC-142 | Not needed | E unchanged: cross-chat work linking, stable plans/build probes/close propagation; O retained. P/N consume result; browser details separately SC-143/300. |
| SC-143 | Done in React | N/C retain where, build, news, yours.check and then/then.you. B31 opens work A40, reads completed build 991 and emphasized progress, and exercises its scoped navigation. The shared server still owns checklist/current-step derivation; O remains applicable. |
| SC-144 | Not needed | E unchanged: part/home plan merge rules; O retained. |
| SC-145 | Done in React | S signature metadata, C sender-computed signed preview, G exact unsigned owner edits; paired Chrome also checked signing off, first-name expansion and duplicate suppression. |
| SC-146 | Not needed | AI-chat knowledge search/correction/forget/Undo unchanged; O retained. Not a new browser Ask implementation. |
| SC-147 | Not needed | E unchanged: trusted guest-free session relay policy; O retained. |
| SC-148 | Not needed | E unchanged: outcome-derived habit evidence/rate limits/rule generation/hold; O retained. S suggestion controls separately SC-149. |
| SC-149 | Done in React | S evidence/instructions/learned provenance/Remove/notice setting and P actions; B30 explicitly exercises controls; O evidence-production retained. |
| SC-150 | Not needed | E unchanged: need-to-know membership/privacy/send gates and tool restrictions; O retained. C renders server hold/source metadata B14. |
| SC-151 | Not needed | E unchanged: greeting generation rules; O retained. Browser displays exact draft. |
| SC-152 | Not needed | E unchanged: missed old own-message work discovery/history ordering; O retained. T typed missed-link entry B11. |
| SC-153 | Done in React | C linked private facts/searches/Need to know context (B14), also reachable in D nested C; observation 4 verifies that full card survives the sparse first Why. O server source/hold production retained. |
| SC-154 | Not needed | CLI storage autodetection/profile drafting/setup summary unchanged; O retained. |
| SC-155 | Done in React | T/N/P; B32 applies reminder Pause/Resume/End and verifies the saved lifecycle. B32 legacy new-reminder routing opens the existing sheet; version aliases save only after discard confirmation. |
| SC-156 | Done in React | S chat-level display/P normal-again with confirmation; B30 applies/cancels reset; O retains private/off-record engine enforcement. |
| SC-157 | Done in React | C renders searched lines and source/read gaps, including D nested C; B14/observation 4 and P normalized source refs. Log retention remains E/O, not a browser reimplementation. |
| SC-158 | Not needed | E unchanged: Spanish/Hinglish/greeting drafting; O retained. C IME preservation separately B6. |
| SC-159 | Not needed | E unchanged: week-long untagged group reply attribution; O retained. |
| SC-160 | Not needed | E unchanged: room-request judgment/quiet close/reopen; O retained. N room marker and D reopen are B1/B24. |
| SC-161 | Done in React | P shared done row -> D `inTeams` exchange; B1/B19 surface, O external-close/learning semantics retained. |
| SC-162 | Done in React | C pointer interaction/revision pin + G one submission; B5/B6/B17 and API. |
| SC-163 | Done in React | C More includes Copy details. B31 copies the visible debug pre and verifies clipboard equality plus Details copied. The failure path logs and presents a visible manual-copy fallback. |
| SC-164 | Done in React | P done-only placement, D quiet close; B24 opens/reopens a no-action close; O merged-PR judgment retained. |
| SC-165 | Not needed | Teams adapter unambiguous @mentions unchanged; O retained. |
| SC-166 | Done in React | A theme choice persistence/system listener; B1/B22 and PRE. |
| SC-167 | Done in React | N/D headline/gist/source/Needs me/watch; B20/B24; O relevance/correction learning unchanged. |
| SC-168 | Not needed | Shared cross-machine kick/check/answer application cadence unchanged; O retained. P uses same kick path. |
| SC-169 | Not needed | E unchanged: external PR state/vote completion polling; O retained. P/D consume closure. |
| SC-170 | Done in React | N Catch up/Mark all read and D asked/said/fresh counts; B1/B20/B24 plus O server seen semantics. Exact mark-all browser application remains a coverage limitation, not missing control. |
| SC-171 | Done in React | T watch target/date/push and D bounded FYI watch; B11/B24; O original watch engine. Direct automation hash gap is SC-155. |
| SC-172 | Done in React | P/N/C From before setup, exact draft gate; B1 A20/B2; O first-week intake/hold retained. |
| SC-173 | Not needed | E unchanged: live-before-backfill pacing and no auto-ack/send; O retained. |
| SC-174 | Not needed | E unchanged: partial read resume/dedup/second machine; O retained. |
| SC-175 | Done in React | A/S/T retain version/check/failure fields and render automatic cadence/channel. B31 reads the configured every-hour cadence. Existing update controls and runner/updater behavior remain shared O; no update/release is performed. |
| SC-176 | Done in React | S derives accessible Unsaved changes markers for its section and index from existing setting drafts, including advanced fields under system. B29 retains focused edits on failure; B18 preserves later typing after save. Formal marker regressions follow parity per owner. |
| SC-177 | Done in React | C/N/P; B32 actually double-clicks Send holding reply, verifies one exact send, and changes the holding draft before POST to prove refusal/no queue. B31 verifies work details; original retry/exhaustion rules remain shared O. |
| SC-178 | Done in React | Paired Chrome verified a custom approved signature, unsigned owner edits and signing off; New also binds the signed preview through POST/queued application and lost-response recovery. |
| SC-179 | Not needed | CLI tool restrictions/missing-name failure unchanged; O retained. |
| SC-180 | Not needed | CLI per-item session resume unchanged; O retained. |
| SC-181 | Not needed | Worker spawn/timeout/process-tree isolation unchanged; O retained. |
| SC-182 | Not needed | Self-chat seen-revision/bare-ok binding unchanged; O retained. React exact action gate separately B2/API. |
| SC-183 | Not needed | Teams send dedup and pause-mid-cycle unchanged; O retained. |
| SC-184 | Not needed | Gap search and bounded failed-start retries unchanged; O retained. |
| SC-185 | Not needed | Self-chat clock-skew targeting and distinct short-send dedup unchanged; O retained. |
| SC-186 | Not needed | Initial gap-search baseline/outage backoff unchanged; O retained. |
| SC-187 | Not needed | Signed-vs-owner-message late-send matching unchanged; O retained. |
| SC-188 | Not needed | Sleep-gap catch-up self-chat notices unchanged; O retained. |
| SC-189 | Not needed | Owner-clock polling/failover notices/time-zone fallback unchanged; O retained. |
| SC-190 | Done in React | A/P; B31 changes fictional good-read timestamps and observes Reading, Reading is late, Not reading now and Chats have not been read yet. Machine/time metadata remains visible; timing thresholds remain shared E/O. |
| SC-191 | Not needed | `delegate now`/whose-move CLI and priority rules remain shared E/O. P consumes placement instead of recreating it. |
| SC-192 | Done in React | P shared runnable/queued/off/capped placement, N reason/Next; PROJ/B1; O runnable slot and pause semantics retained. |
| SC-193 | Done in React | P one-thread/subjects + stopped owner move; PROJ/B1/B13/B23; O retained. |
| SC-194 | Done in React | P server seen/freshness, N look marks and D fresh state; B26/B20; O resaved-FYI no-unread resurrection retained. |
| SC-195 | Not needed | E unchanged: approved vote-before-reply and own-vote tracking; O retained. B4 uses the same runner. |
| SC-196 | Done in React | C to-dos/reasons and S metadata switches; B4/B13/B9 plus O exact-call refusal/default write-tools. |
| SC-197 | Done in React | C change meaning/autocomplete warning and P revision gates; B4/B2/API; O live PR rechecks unchanged. |
| SC-198 | Done in React | C edit/exclusion preview, P send-edit/refusal; B4/B5/API/PROJ and O preview gates. Combined edit-with-changes browser coverage is narrower than original engine proof. |
| SC-199 | Not needed | Approved-call ledger/executor/read tools/server routing/rule never writes unchanged; O retained. |
| SC-200 | Done in React | P uses call-derived shown/meaning, C exact detail; B4/B27 and O call/vote spelling tests. No client reconstruction of tool arguments. |
| SC-201 | Not needed | Approved call reaches configured tool server unchanged; O retained. |
| SC-202 | Not needed | Immediate-before-call live PR recheck unchanged; O retained. React uses same apply path. |
| SC-203 | Not needed | Exact PR identity/numeric/deep closing-action refusal unchanged; O retained. |
| SC-204 | Done in React | P uncertain/approve-again/reply-only and C warnings/confirm; G typed action, API durable uncertainty; B4/B27 plus O one-retry/quoted-reply semantics. |
| SC-205 | Not needed | CLI config error/cache/health and per-change refusal unchanged; O retained. |
| SC-206 | Not needed | Tool-server environment interpolation/remote refusal unchanged; O retained. |
| SC-207 | Not needed | Tool call target/resolve-thread/one-time again semantics unchanged; O retained. |
| SC-208 | Done in React | C call-derived action, summary, target, exact detail; B4/B27; O readable-call generation retained. Original golden alone is not React proof. |
| SC-209 | Done in React | P call-derived detail -> C Exact change details; B4/PROJ, O all-arguments generation retained. |
| SC-218 | Not needed | E logging of ask/close/change outcome fields unchanged; O retained. Q reads it. |
| SC-219 | Not needed | E edited-vs-unchanged log classification unchanged; O retained. |
| SC-220 | Not needed | Shared Handled counting/corrections/legacy semantics unchanged; O retained. Q does not recalculate. |
| SC-221 | Not needed | Shared ratios/wait/median/small-sample counting unchanged; O retained. |
| SC-222 | Done in React | Q windows/bars/gap metadata, B1/B10/B22; O owner-week/two-machine count identities unchanged. |
| SC-223 | Not needed | UTC weekly file compaction/sync/freeze/redaction unchanged; O retained. |
| SC-224 | Done in React | Q requests same server numbers via typed API; B10/B28. CLI/Friday summary remain shared O, no duplicate browser calculation. |
| SC-225 | Not needed | Legacy unprovable/edited draft log semantics unchanged; O retained. Q displays server unknown line. |
| SC-226 | Not needed | Holding/correction/missed performance/count rules unchanged; O retained. |
| SC-227 | Not needed | Dropped/applied-change outcome counting unchanged; O retained. |
| SC-228 | Done in React | C deploy meaning/change/plan + P original approval; B3/B4 and O vetted deploy/run-as-step semantics. |
| SC-229 | Done in React | S deployTo field/help/proposals, C refusal to-do; B9/B13 surface plus O allowlist authority. No browser production-pipeline rule reimplemented. |
| SC-230 | Not needed | E unchanged: deploy approval/head/ring checks and one pending operation; O retained. |
| SC-231 | Not needed | E unchanged: overwrite news/read-only build check/redeploy approval; O retained. C consumes news, missing emphasis SC-140. |
| SC-232 | Not needed | E unchanged: tested/window report execution and telemetry findings; O retained. C report intent B3. |
| SC-233 | Done in React | S repos metadata, C to-do; B9/B13 and O remote normalization/local-clone scanning. No browser scanner. |
| SC-234 | Not needed | Shared secret scrubbing at logs/reports/claims/prompts unchanged; O retained. |
| SC-235 | Not needed | Shared run starter shape/to-do cleanup/prompt dedup unchanged; O retained. |
| SC-236 | Not needed | Shared exact deploy call-shape refusal unchanged; O retained. |
| SC-237 | Done in React | S deployTo same asynchronous server validator, P call meaning -> C; B9/B4 plus O real-name/project pipeline validation. |
| SC-238 | Not needed | Shared PR build/head/repo/success verification at all gates unchanged; O retained. |
| SC-239 | Not needed | Shared trusted validate/session approval and no-shell restriction unchanged; O retained. |
| SC-240 | Not needed | Shared answer tested/window parser unchanged; O retained. P report binding uses original answer path. |
| SC-241 | Not needed | Shared extended secret scrub/salvage/log/backup policy unchanged; O retained. |
| SC-242 | Not needed | Setup and worker-start read-vs-write allowlist restrictions unchanged; O retained. |
| SC-243 | Not needed | Worker clone/no-shell isolation unchanged; O retained. |
| SC-244 | Not needed | Shared tested-negation parsing unchanged; O retained. |
| SC-245 | Not needed | Shared picked-option effect vetting unchanged; O retained. C/P preview B14. |
| SC-246 | Not needed | Live-session never-rewrite/scrubbed backup behavior unchanged; O retained. |
| SC-247 | Not needed | Publish privacy deny-list requirement unchanged; O retained. No push/publish performed. |
| SC-248 | Not needed | Private site configuration/tool vocabulary unchanged; O retained. |
| SC-249 | Done in React | A navigation handles initial/mounted ui=new and ui=classic with the existing server-saved, discard-confirmed version service. B32 clicks both aliases and verifies New/Classic after save; cancel keeps React and the unsent edit. PRE retains save-failure proof. |
| SC-250 | Not needed | Legacy `/data?ui=new`, panel address/cache precedence and old shell first paint remain unchanged; O retained. React has separate P endpoint, not a rewrite of old polling. |
| SC-251 | Done in React | N omits empty non-move sections, retains zero summaries and the approved quiet/waiting explanation. B31 opens a genuinely empty fictional store and verifies Quiet plus only Your move. Suggestion/fact links point to Settings/Knowledge respectively. |
| SC-252 | Done in React | P/N keep the New server headline and Next text, correct askAt, relative short forms, attributed quotes, also and since facts. The working-preview browser proof compares each server row; no row sends. This owner rule supersedes the earlier inline-send layout. |
| SC-253 | Done in React | P/C/T retain the original offered actions without client commands. B3/B4/B13/B24 plus B32 cover choices, reports, changes, retry, track, todo, holding, watches, reminder lifecycle and channels; B31 applies overdue Wait/Close and health retry. Engine-only semantics remain O. |
| SC-254 | Done in React | N renders server chips, C before/holding/retry/warnings; B1/B3/B7/B26 plus O chip data. New/Back are now supported by P, not a future omission. |
| SC-255 | Done in React | P declares unavailable metadata; G disables and labels Paused/Stopped rather than deciding eligibility. B31 verifies paused Send through an edited pin, usable private Ask and exact Undo, Resume restoring Send, and retained edit text. Original off/cap/stop rules remain O. |
| SC-256 | Done in React | A responsive menu, N first screens, C meaning; B1 at both exact sizes/themes, B4 and PRE. Legacy AI-chat narrow renderer stays original O, not React. |
| SC-257 | Done in React | P server facts, N explicitly attributed quotes/labelled notes, C thread; B7/B1 plus O attribution construction. |
| SC-258 | Done in React | T/P; B32 applies interval 2h, Extend 7 days and Stop, checking the job interval/end and terminal workflow. The same browser family proves named-channel isolation and reminder Pause/Resume/End. B31 reads updater cadence. |
| SC-259 | Not needed | Shared work-link/disambiguation of owner @-asks unchanged; O retained. |
| SC-260 | Done in React | A navigation handles initial/mounted ui=new and ui=classic with the existing server-saved, discard-confirmed version service. B32 clicks both aliases and verifies New/Classic after save; cancel keeps React and the unsent edit. PRE retains save-failure proof. |
| SC-261 | Not needed | E unchanged: paused rule scheduling/held drafts/resume semantics; O retained. Browser paused label missing at SC-255. |
| SC-262 | Not needed | Test process/window/browser-open guard unchanged; O retained. Inventory used headless fixture-only browser. |
| SC-263 | Done in React | A order Now/Done/Numbers/Settings, no Numbers badge; B1/PRE. Snapshot intentionally Classic/no Numbers; O retained. |
| SC-264 | Done in React | Q query mounted only on tab, window key, no focus/reconnect refetch; B28 explicitly checks request count. Parent reports passing at M3 `3afa843`. |
| SC-265 | Done in React | Q renders all supplied Done-row gist/work/meta/link details. B32 walks every counted-list key and compares its exact codes; B10 checks anonymous copy. B31 verifies a removed counted item honestly remains a log count, distinct from a missed message. |
| SC-266 | Done in React | Q consumes shared formatted count/trend/first-week model, not browser arithmetic; B1/B10; O sample/ratio boundary tests retained. |
| SC-267 | Done in React | Q renders rule table, text-alt bars/days/before, unknown and promises; B1/B10 plus O exact server labels and privacy/no-money constraints. |
| SC-268 | Done in React | Q copy visible server summary, B10 exact clipboard equality and no names/codes/links; O retained. |
| SC-269 | Done in React | Q retains its time-window select across Counting/error and retries. B32 holds and aborts the request, verifies selected value/focus, then clicks Try again. B28 proves no poll/focus/reconnect re-download and fresh fetch on open/window/remount. |
| SC-270 | Done in React | Q retains its time-window select across Counting/error and retries. B32 holds and aborts the request, verifies selected value/focus, then clicks Try again. B28 proves no poll/focus/reconnect re-download and fresh fetch on open/window/remount. |
| SC-271 | Not needed | Shared per-send corrections denominator/duplicate-item counted grouping unchanged; O retained. Q draws server groups. |
| SC-272 | Done in React | Q uses own-key guards for lists/rows/missed entries. B32 opens constructor, toString and __proto__ routes and reads That list is not on this tab without Recovery. Numbers remains read-only. |
| SC-273 | Not needed | Shared runner placement/changedAt stamping semantics unchanged; O retained. P reads them. |
| SC-274 | Not needed | Shared `/seen` ID validation/forward-only/retention unchanged; O retained. React seen calls separately B26. |
| SC-275 | Done in React | P freshOf + N look markers/[seen hook](../src/web/react/data/seen.ts); B26 keeps New for look, PROJ/B1; O Back/Changed data calculation retained. |
| SC-276 | Done in React | N Find controlled text, P shared `find`, A `/`/Escape; B12/B1 plus O exact number/link matching. No browser search reimplementation. |
| SC-277 | Done in React | N Find is the only missed-message entry. B31 clicks Make it an item, verifies the exact queued link, seeds only a fictional worker result, then sees that same link resolve to the item with no second creation button. Intake/AI remain shared O, not rerun live. |
| SC-278 | Done in React | N controlled Find/IME and A persistent navigation state; B6/B12 preserves fields; O matching behavior retained. Dedicated Find-caret assertion remains narrower than original O. |
| SC-279 | Done in React | N uses shared Since/Numbers counts. B31 clicks the handled link and verifies exactly the same positive count in Numbers, and measures Your move above 430px at 400x860 with Find, status, summary and Undo present. Original log-cache behavior remains E/O. |
| SC-280 | Not needed | Shared multiple-topic work linking/disambiguation unchanged; O retained. |
| SC-281 | Done in React | N composition-local Find and C revision pins/composing fields; B6/B19, O exact accented/IME Find semantics retained. React reconciles without replacing active fields. |
| SC-282 | Done in React | N keeps Undo outside Find filtering, compacts health age/additional problems, and retains the clicked fix result inside its banner. B31 verifies compact geometry, readable Find and inline Checking now. B5 retains exact Undo/countdown proof; lower-case seen remains shared O. |
| SC-283 | Done in React | C each change meaning/warning under checkbox, P shared meaningParts; B4/B27 plus O. |
| SC-284 | Done in React | S/P use original change specs/validation. B32 saves every editable key and available switch with a fictional checked pipeline; B31 turns a change off, attempts to re-enable it as a read tool, sees refusal and the switch revert off. Approved-then-disabled execution guards remain the unchanged shared engine O. |
| SC-285 | Done in React | P reply-only typed exclusion and C More action/quoted result, G receipt; B4/API/PROJ plus O second-ok/no-blank gates retained. Dedicated React reply-only two-ok browser case remains follow-up. |
| SC-286 | Done in React | P primary review-again -> original answer, C/G button; PROJ exact action-reference proof, B2/B4 stale/change surface, O runner recheck/redraft semantics. |
| SC-320 | Not needed | Shared CLI runinfo parsing/event logging unchanged; O retained. |
| SC-321 | Not needed | Shared invalid output/model-name/redaction/runinfo fallback unchanged; O retained. |
| SC-322 | Done in React | S models above More, original server models lines; B1/B9 plus O aggregation/cache; no browser runinfo parser. |
| SC-323 | Not needed | CLI/self-chat status model summary unchanged; O retained. |
| SC-300 | Done in React | N/C retain where, build, news, yours.check and then/then.you. B31 opens work A40, reads completed build 991 and emphasized progress, and exercises its scoped navigation. The shared server still owns checklist/current-step derivation; O remains applicable. |
| SC-301 | Done in React | N/C retain where, build, news, yours.check and then/then.you. B31 opens work A40, reads completed build 991 and emphasized progress, and exercises its scoped navigation. The shared server still owns checklist/current-step derivation; O remains applicable. |
| SC-302 | Done in React | C/P keep result radios, exact text and explicit draft-only semantics. B32 uses keyboard arrows, retains focused report text through refresh, submits literal dollar/command-looking text, and forces an unknown response while preserving it without sending. B3 applies Issues found. |
| SC-303 | Done in React | P kept to-do entities, N placement/C grouped subjects and Yours to do; B13 A42/B23, API Mark done; O persistence/order/migration engine unchanged. |
| SC-304 | Done in React | P drawnAt todo revision/G exact action; B13 and API `Mark done affects only the displayed to-do identities`; O no-close-open-work semantics retained. |
| SC-310 | Done in React | C/G exact edited send, P uses original send path; B5 plus O own-words promise mapping. No client AI/promise inference. |
| SC-311 | Done in React | C to-dos/handled effects/N grouped approvals; B13/B23/B27 plus O conditional/refused promise interpretation retained. |
| SC-312 | Not needed | Shared already-voted/completed/head-moved promise checks unchanged; O retained. P offers review-again via SC-286. |
| SC-313 | Done in React | P/C promise failed attention/Check again and N placement; B13 stopped/retry surface, O paused/check mapping rules retained. No browser mapping run added. |
| SC-314 | Done in React | C You said/changes/meaning + P primary promise action, N promise row; B4/B23 and PROJ plus O. |
| SC-315 | Not needed | Shared promise skip/new-turn/crash recovery/no-shell behavior unchanged; O retained. |
| SC-316 | Not needed | Shared next-turn/shared-review/vote-state/live-recheck semantics unchanged; O retained. React action gates separately API/B2. |
| SC-400 | Done in React | A version menu/G-less version service; PRE/B15 failure/discard and per-machine saved choice. Mounted legacy hash bug separately SC-260. |
| SC-401 | Done in React | Existing server React asset/CSP/token boundary; PRE real served-build browser proof, no old golden substitution. |
| SC-402 | Not needed | Panel deliberately uses New; saved snapshot deliberately Classic. Existing legacy content/selection tests PRE/O retained; neither renderer is rebuilt in React. |
| SC-403 | Done in React | A four screens + C card, version return; B1/PRE exact widths/themes/no horizontal scroll. Missing data details are individually recorded, not hidden by screen-load success. |
| SC-404 | Not needed | Existing build/runtime integration already done in M1; PRE installed-bundle/integrity tests retained. No new M4 implementation/build work needed. |
| SC-405 | Not needed | Existing Classic/New menu font/geometry regression coverage retained O `next version menu:` / `next first screen:`. React own layout is SC-403/B1. |
| SC-406 | Done in React | P one authoritative row/subjects, N/C buttons-only/time; PROJ/B7/B13/B23. |
| SC-407 | Done in React | C/P; B3/B14 plus B32 Other preserves the exact answer for drafting without sending, and choice previews require their separate Send. The fictional worker is not a live AI run. |
| SC-408 | Done in React | C/G exact text/durable receipt, P/API exact gate; B2/B5 and API lost-response/log-rotation/Undo races. |
| SC-409 | Done in React | Revision-pinned data, C/D/T controlled fields; B6/B17/B19/B20 keeps focus/IME/text through refresh/replacement. |
| SC-410 | Done in React | C/G selection labels/meaning; B4/B27 plus API reordered/changed effects. |
| SC-411 | Done in React | C/N/P; B32 actually double-clicks Send holding reply, verifies one exact send, and changes the holding draft before POST to prove refusal/no queue. B31 verifies work details; original retry/exhaustion rules remain shared O. |
| SC-412 | Done in React | C private Ask/sources/use-note/chat edit; B12/B14/B25. |
| SC-413 | Done in React | A/N keys/menu/theme/find/markers and bounded redraw; B1/B8/B12/B15/B22/B26. B8 contains actual `<16 ms` assertion, not compile proxy. |
| SC-414 | Done in React | D feedback exact-send/pinned activity/quiet reopen; B19/B24. New-before-earlier sorting remains SC-131. |
| SC-415 | Done in React | Q server counts/Handled list/retained window/copy; B10/B22. Every-list detail and unknown route gaps remain SC-265/272. |
| SC-416 | Done in React | S metadata rendering/server validation/AI models/newer typing; B9/B18/B29. Broad title isn't proof of saving all keys; SC-284 records critical switch proof gap. |
| SC-417 | Done in React | T/P; corrected B11 opens and submits the real problem form with exact text. B32 and B11 also apply typed watches/reminders/missed intake, with stale recipient refusal. B31 verifies the one-way Find lookup after a fictional worker result. |
| SC-418 | Done in React | K selected save + D Undo, normalized private/source fields; B16/PROJ and UI contract uncertain immediate operation. No all-facts Done expansion is required by actual Classic parity. |
| SC-419 | Done in React | P contracts/revision store + PROJ/API/[component tests](../src/web/react/data/store.test.ts); explicit UI-contract nested-registration check prevents hidden targeted cases. |


## Delivery boundary

Working preview a38e533 is based on c8815d3. Follow-ups 6a17391 and 8fb73fb
keep navigation/integrity consistent, 4639316 fixes supporting times/missing
activity, and 05715a0 restores the compact New first screen. Source and build
are committed locally. No push, release, main merge, owner-data writes or live
AI/external-system actions were performed.

Remaining work is owned by the combined-app phase: integrate the other builder's
React Classic/toggle, then run the owner's separate test-completion sessions.
This New-side acceptance does not claim zero undiscovered defects or live-model
accuracy. No known New migration implementation gap remains in this inventory.
