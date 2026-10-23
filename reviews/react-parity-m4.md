# React New parity

Paired browser pass against today's New, using matching fictional-store copies.
Done means checked in this pass. Missing means awaiting this pass or absent
from today's New. Shared engine-only scenarios remain in the scenario master.
Classic layout is the other builder's scope.
## Current React Classic status

This is a live Classic checklist, separate from the historical New inventory
below. **Missing** includes an unverified parity claim, not necessarily a defect.
Formal tests remain deferred; evidence here is real-browser walkthroughs.

| Classic surface | Status | Evidence / remaining work |
| --- | --- | --- |
| Home and header | Done | Owner's real-data acceptance of 791b9d4; fictional desktop/narrow light/dark comparison. |
| Classic header breakpoints | Done | bug 10-22 classic-header: Edge fictional store with To learn present, 1280/960/861 inline with no overlap, 860/561 menu, 560/400 both selectors in menu; inspected light/dark captures. Views absent from desktop accessibility tree; Escape/outside dismissal, snapshot-hidden selectors, offline disabling and write-free Done experience toggle verified. |
| Needs you and dedicated card | Done | Owner's real-data acceptance of 548a8bc; 9855e7d/3bd9b2f fictional action and visual proof. |
| Failed-job recovery (E38 Classic) | Done | bug 10-23 E38.classic.failed-job: fictional Edge A22 appears in Needs you, not Running/progress; existing answer command stores exact directions and sets running/ownerAnswer for replanning. Skip sets done/skipped. Changed failure refuses without queueing. Normal A24 Running and New stopped placement preserved. Desktop/mobile light/dark captures, no overflow/runtime errors or Teams sends; this proves page-to-engine recovery, not completion by a real AI worker. |
| Failed-item Home guidance (G1) | Done | bug 10-23 G1.classic.failed-home-hint: fictional failed A37 row shows Answer A37 to retry with directions, or skip it, not its raw PR ask. Edge follows that row to Try again, persists directions through answer application and verifies running/ownerAnswer. Desktop/mobile light/dark, ordinary Home preview unchanged, zero external sends/errors. |
| Proposed-work Track (E41 Classic) | Done | bug 10-23 E41.classic.track: Edge fictional proposed A37 offers New's existing Track action and Skip; applying Track clears proposed, keeps the same work goal, opens work and schedules checkAt without sending. Changed proposal refuses; Skip dismisses an unaccepted proposal. Desktop/mobile light/dark with no overflow/errors. |
| Home missed-message intake and spacing (G3) | Done | bug 10-23 G3.classic.missed-message: inline Make an item form persists typed input across polling; invalid link refuses, valid link queues and real takeMissed intake creates the fictional sender's visible item/message/thread and drains the queue. Reusing the same link submits a new request, then intake deduplicates without making a second item. No new Keep things working/Pause/Check now group; update/report remain. Non-collapsing 28px gap under tiles. Paired legacy/React desktop/mobile light/dark captures; offline disables and snapshot omits the form. Source is fictional, including its self-chat receipt; no live Teams/AI effects. |
| Home reader footer parity (G9) | Done | Today's Classic has no Last reader/Reading on footer line; removed React's extra identity/date line. Edge with real stored ok/late/off/never reading states confirms the metadata remains in the snapshot without the footer addition. Keyboard shortcuts opens and closes; paired legacy/React desktop/mobile light/dark captures, no overflow/runtime errors or external effects. |
| Classic Settings place names | Done | bug 10-22 classic-settings-places: React Classic Settings used New's Now/Waiting wording because settingsView inferred experience from the React app version. The requested experience now selects the wording before projection; no client reverse-replacement, settings-write or legacy-default changes. Repro: open Classic Settings > Updates and system and Reminders and summary. Manual Edge proof at 1280 light and 400 dark, with New wording retained. |
| Narrow focused-card legend | Done | bug 10-22 classic-mobile-keyboard-legend: hide only the desktop legend at 600px and below, matching today's Classic. Repro: open A20 at 400px; the old wrapping j/k/send/ask strip occupied space beneath the card. Desktop legend and mobile pager keyboard-help dialog remain available; manual Edge proof in both required sizes. |
| Numbers window alignment | Done | bug 10-22 classic-numbers-window-alignment: remove the Numbers-only heading spacer at desktop too, so the existing window/range sit at the right edge beside the subtitle. Repro: compare Numbers at 1280px with today's Classic. Narrow wrapping and the other tools' headings stay unchanged; manual Edge comparison at both required sizes. |
| Home version/status/action grouping | Done | bug 10-22 classic-home-version-group: restore today's grouped version/update/report line and short checked time/interval. Repro: Home with update interval 1440 showed raw minutes and separated action/status groups. Existing server rollback metadata now survives the shared optional version contract. Keyboard help and safe reload remain; source actions unchanged. Manual Edge normal/failure/rollback checks at desktop light and narrow dark. |
| Snapshot decision detail | Done | bug 10-22 classic-snapshot-decision-detail: replace the lossy snapshot summary with read-only ClassicCard. Repro: snapshot A3 lacked offered flags, A6 lacked exact changes, A5 lacked meeting/conflict information. Rich card sections and source links remain; no editable fields, submission/Ask/menu/to-do actions or autofocus. Local inspection folds do not overwrite the live edit. Manual Edge desktop light and narrow dark comparison against today's fictional file snapshot; shortcut attempts do not enqueue actions. |
| Numbers list exchange (N1) | Done | bug 10-22 N1.classic.numbers-exchange: handled/asks/replies and every other counted list share visible Name asked / You lines, not a folded headline. Existing work summary is a green Closed chip where closed, with no grey Work prefix. Counts, item codes, source links and missing-item fallbacks retained. Reproduced on a fictional closed Acme approval, then manually compared with today's Classic at 1280 light and 400 dark. |
| Holding card presentation (N6) | Done | bug 10-22 N6.classic.holding-card: long run-failure text no longer precedes a holding draft. Commitment warning remains alongside Yours to do; them plan role and item-specific Ask label match today's Classic. A typed optional attentionKind preserves explicit reply-changed safety notices and leaves New attention unchanged. Manually reproduced on fictional A36 and verified at desktop light/narrow dark; Ask still queues the exact question for the target item. |
| Classic Settings full wording (N5) | Done | bug 10-22 N5.classic.settings-copy: earlier Waiting on others/on Home fixes retained. Stop overriding the server's Off: run "delegate update" yourself option, and restore uppercase MORE section-heading styling. Values and save behavior unchanged; manual Edge desktop light/narrow dark including Off save/reload and More open/close. |
| Narrow Experience round trip | Done | bug 10-22 classic-menu-experience-place: menu switching Classic A20 to New and back used to land on Home. Open cards now map to their New row, with an exact paired return for unchanged round trips (including Ongoing sub-sections). Shared-route mapping and unsent local edits remain. Manual real Edge at 400px light/dark; no item command or server preference write. |
| Narrow App version round trip | Done | bug 10-22 classic-menu-app-version-place: map React addresses to supported legacy routes before reload, and preserve an exact paired return to React when the owner has not navigated elsewhere. Legacy-to-React switches no longer clear card/Ongoing addresses. Preference failure and discard cancellation leave the page unchanged. Manual 400px Edge light/dark round trips from A20 and Ongoing/automations via both legacy versions. |
| Counted Classic Catch-up controls | Done | bug 10-22 classic-numbers-catchup-actions: counted FYIs now reuse the current typed Classic activity row, with Watch/Needs me and the normal eye/high-importance icon instead of check. Static history without current action data remains inspection-only. Manual Edge at both required sizes, including real fictional tracker creation and Needs me engine application; no duplicate action implementation. |
| Counted metadata without a by field | Done | bug 10-22 classic-numbers-empty-by: join only nonempty metadata, so closed item rows read Name · time, not Name · · time. Existing time semantics and source links remain. Manual Edge fictional A60 no-by row at desktop light and narrow dark. |
| Classic card wording | Done | bug 10-22 classic-card-wording: Low/Medium/High confidence use today's capitalization. The desktop shortcut strip uses the actual primary label, including send holding reply; its existing narrow hiding remains. Reuses pinned card presentation rather than inferring from a live draft. Manual Edge at both required sizes; normal and holding labels checked. |
| Home keyboard control parity | Done | bug 10-22 classic-home-extra-keyboard-button: remove the extra Home footer button absent from today's Classic. The ? shortcut and pager's keyboard button still open/close the same help dialog; grouped version/update/report unchanged. Manual Edge Home and focus at desktop light and narrow dark. |
| Final byline and Ask typography (Y1/Y3) | Done | bug 10-22 Y1.classic.numbers-byline: non-reply rows without by show only time/source as today; reply/review person/chat/by retained. bug 10-22 Y3.classic.ask-apostrophe: Ask note reads item’s session with today's typographic apostrophe. Manually reproduced before correction and compared afterward in Edge at 1280 light and 400 dark on fictional data; no action behavior changes. |
| Counted exchange two-line clamp (R1) | Done | bug 10-22 R1.classic.numbers-exchange-clamp: clamp asked and You independently to two lines with native ellipsis and normal visual whitespace, matching today's Classic after original per-send context. Full DOM/data text and exact send source link remain unchanged. Manual Edge desktop light/narrow dark measured and visually compared with today's fictional long exchange; short rows and source navigation retained. |
| Promised check-back Stop (E49) | Done | bug 10-22 E49.classic.promised-checkback-stop: In-progress RowActions now includes the existing stop-watch action beside classic-close, with existing ghost styling and Extend unchanged. Reproduced missing Stop despite server offer. Manual Edge desktop light/narrow dark: exact unwatch stops scheduling only, work/to-dos remain open, original sent reply retained, zero sends. |
| Owner-active held reply timing (E55) | Done | bug 10-22 E55.classic.owner-active-held-time: suppress the obsolete Sends at line when the running row says Held:, without substituting a progress bar. Held reason and existing controls remain; unheld schedules still show their time. Today's Classic has no send-time sentence while held. Real dueSends on fictional stores with recent owner activity/Available presence retained scheduled state and sent zero messages; manually checked in Edge desktop light/narrow dark. |
| Non-review change selection (E31) | Done | bug 10-22 E31.classic.non-review-change-selection: plain pending comment effects on reply/promised cards now show the existing selectable rows with exact target/text/arguments, not only an Also summary. Review rows and existing approval gates unchanged. Reproduced zero Classic rows vs two New checkboxes on the same fictional item; manual Edge desktop light/narrow dark uncheck-one/one-approval/kept-comment-then-reply proof through actual runner/change ledger. |
| Classic draft promise and earlier-to-do separation | Done | Agreed designer sections 1/2: Edge A801 at 1280/400 light/dark, all four captures inspected. Current draft says Yours to do; earlier IDs have their own Still to do line and counted action, never beside Send. An arriving t3 makes the old button refuse without queueing; current listed IDs apply without changing draft/state/revAt or closing work, with the result visible in the card. Singular action also names its exact ID. No draft means no current-promise line; zero Teams sends, runtime errors or overflow. |
| Done filters, exchanges and sent details | Done | Dedicated rows compared at 1280/400 in light/dark; all filters, empty/quiet/fresh/earlier/mixed states, exact correction, Undo and private Ask exercised in Chrome. Arrival preserves field DOM/focus/selection/composition; stale send identity blocks correction. Owner-copy acceptance remains separate below. |
| Classic learned-row Undo (E64) | Done | bug 10-22 E64.classic.default-undo: Edge on fictional K1/K2, paired legacy/React 1280/400 light/dark captures; whole K2 retired, K1 fact lines unchanged, two-day-old row has no countdown. Stale revision queues nothing; double click and dropped response queue one exact undo; `u` remains reply-only, offline disables and snapshot hides. Build only; formal regression tests deferred by owner. |
| Done Catch-up, quiet closes and watch form | Done | Quiet closes only in Catch up; typed Watch and Needs me proved. Home custom date survives Done submission, Done preset survives Home roundtrip, successful watch releases its old pin. Current private answers control disclosure independently of pinned history. |
| Classic watch deadline/condition corrections | Done | bug 10-22 classic-watch-deadline and classic-watch-until: fictional Edge with Friday clock, only Friday pressed, Friday submits +7 days; Today selected then submitted after midnight uses new local day. Cleared until stays empty in intent and uses generic engine condition, never AI fallback. Stale source creates nothing; created watch tags source. Inspected desktop light/mobile dark captures with no overflow. Pending reply folding independently verified unchanged at 1280 light/400 dark: pending opens, answer arrives in place/stays open, answered starts folded, expired Undo becomes foldable without reload. |
| Ongoing sections and watch controls | Done | e6ad0eb: paired fictional 1280/400 light/dark captures; interval, acknowledgement, extension, stop, progress close, follow-up, dismissal and channel stop proved with typed actions. Owner-copy acceptance remains below. |
| Classic mutation-offer staleness audit | Done | bug 10-22 classic-offer-staleness: 180 fictional-store offers checked as exact/nonempty expectation in Edge. Old Got it queues nothing; changed news after queue refuses acknowledgement; unchanged acknowledgement applies. A job-only end-date change after interval queue refuses the old edit; unchanged 30m applies. Zero Teams sends/runtime errors. Per-kind revision inventory in dev-spec/react-app.md. Existing E45 exact to-do/close-work and approval/undo/proposal/Start gates retained. |
| Management controls survive runner bookkeeping | Done | bug 10-22 classic-management-bookkeeping: Edge fictional store, held old page snapshot, moved nextAt forward and changed job state/result plus workflow updatedAt/newCount/private notes as a routine cycle would. Old Extend and Stop buttons apply across changes before click and again before runner apply; Pause applies across automation timestamp updates. Changed watch condition and reminder text still refuse; existing changed-news and end-date race checks pass. This uses simulated bookkeeping, not a live runner cycle. Zero Teams sends/runtime errors. |
| Ongoing creation/automation sheets | Done | e6ad0eb: 40 Chrome captures plus 14 typed actions; exact watch/reminder creation, weekly schedule, pause/resume/end/start, focus/selection/composition, refusal and changed-recipient guards. |
| Numbers and counted lists | Done | All four windows and every counted list checked in Chrome: exact group order, deduplicated codes, raw counts, visible gist/work/source and anonymous copied summary (SC-265). Dedicated Classic chart, success meter and rule disclosures; no extra health banner. |
| Settings and advanced controls | Done | Classic section order, original help, fixed setup instructions, model/More details and retained drafts checked; normal Save and immediate switches persist. Section-key union fixed in 59b2e96. |
| Knowledge location and pending facts | Done | Conditional To learn; saved facts in Done → Learned, not a separate library/search. Selected save, single-fact Edit, Skip, stale-save refusal and zero-live pinned-tab reachability proved on a fresh fictional store. Narrow action bar and source links checked. |
| Every Classic screen at 400 px / dark | Done | Paired final Chrome captures at 1280/400 in light/dark: Home, Needs you, Done, Ongoing, Numbers, Settings, To learn and creation sheets. No horizontal overflow or browser runtime errors. Legacy sheet transitions are settled before capture. |
| Remaining screens on read-only owner-data copy | Done | Final 96 paired captures across screens and picker/reminder/watch sheets, at both widths/themes: zero runtime errors, zero overflow and zero attempted/dispatched browser writes. Isolated local copies only; no live actions or AI. This is builder verification, not owner sign-off or live service-effect proof. |

Final integration also restores the Home-only shell footer and Classic supporting
screen typography, spacing and narrow actions. Build passed; formal tests,
typecheck, public CI and live service-effect acceptance remain deferred under the
owner's build-first rule.

Current React New implementation/acceptance is recorded in
[dev-spec/react-parity.md](../dev-spec/react-parity.md). The Missing cells below
are retained as the historical independent review and handoff, not current
implementation status. React Classic is a separate builder's scope.

## U cases

| Case | Screen | Status | Check |
| --- | --- | --- | --- |
| U01 | Now | Done | Edit, exact send, Undo |
| U02 | Now | Done | Answer drafts without sending |
| U03 | Now | Done | Instant preview, multi, Other |
| U04 | Now | Done | Meeting, clash, preview |
| U05 | Now | Done | Selected changes, explicit meaning |
| U06 | Now | Done | Incoming question keeps composing words |
| U07 | Done | Done | Exact owner words, in Teams |
| U08 | Now | Done | One reply tags both askers |
| U09 | Now | Done | Room ask attribution |
| U10 | Now | Done | Follow-up attribution |
| U11 | Now | Done | Node, focus, selection, composing Escape |
| U12 | Now | Done | Attachment gap in Why |
| U13 | Now | Done | Private sources and holds |
| U14 | Now | Done | Before-setup marker |
| U15 | Now | Done | Exact intake, worker result, same link |
| U16 | Now | Done | Exact change preview |
| U17 | Now | Done | Source change preserves composing edit |
| U18 | Now | Done | Displayed to-dos completed |
| U19 | Done | Done | External completion marked Closed |
| U20 | Now | Done | Wait three days, Close |
| U21 | Now | Done | Track proposal |
| U22 | Now | Done | Actual one-of-two progress |
| U23 | Now | Done | Stopped work retry |
| U24 | Now | Done | Honest retry placement |
| U25 | Now | Done | Exact holding reply, once |
| U26 | Done | Done | Blank gate; reopen drafts only |
| U27 | Now | Done | Private Ask, no send |
| U28 | Now | Done | Scheduled next step |
| U29 | Now | Done | Waiting and nudge controls |
| U30 | Now | Done | Invalid input kept; 120-minute tuning |
| U31 | Now | Done | Extend and Stop |
| U32 | Now | Done | PR tracking details |
| U33 | Now | Done | Pause, Resume, End |
| U34 | Now | Done | Stop one preserves the other |
| U35 | Now | Missing | Absent from today's New |
| U36 | Now | Done | Check, where, then, news |
| U37 | Now | Done | Cross-chat home and parts |
| U38 | Now | Done | Completed build details |
| U39 | Now | Done | Owner result drafts only |
| U40 | Now | Missing | Absent from today's New |
| U41 | Done | Done | FYI gist, Needs me, Watch |
| U42 | Done | Done | Catch-up-only, exact count |
| U43 | Done | Missing | Absent from today's New |
| U44 | Done | Missing | Absent from today's New |
| U45 | Done | Done | Rule reply, countdown, exact Undo |
| U46 | Done | Done | Three exact-target feedback choices |
| U47 | Done | Done | Confidence, sources, gaps, searched |
| U48 | Now | Done | Window hold, alert, exact later retry |
| U49 | Settings | Done | Signed preview, delayed guard, history |
| U50 | Done | Done | Source, gist, exact Undo |
| U51 | Knowledge | Done | Selected Save, exact Edit, Skip |
| U52 | Settings | Done | Evidence, choices, provenance, Remove |
| U53 | Settings | Done | Private/off cancellation and stale guard |
| U54 | Now | Done | Health fix kicks runner |
| U55 | Now | Done | Paused Send disabled |
| U56 | Now | Missing | Absent from today's New |
| U57 | Settings | Done | Cadence, manual check, safe reload |
| U58 | Now | Done | All reading states |
| U59 | Now | Done | Stopped work remains actionable |
| U60 | Now | Done | Nobody starts Delegate work |
| U61 | Now | Done | Stopped, capped and queued retry |

## New-side scenarios

| Case | Screen | Status | Check |
| --- | --- | --- | --- |
| SC-432 | Now | Done | One home, retained parts |
| SC-10 | Now | Done | Blank answer cannot submit |
| SC-11 | Now | Done | Exact edited send |
| SC-12 | Now | Done | Private Ask |
| SC-20 | Now | Done | Single choice previews immediately |
| SC-21 | Now | Done | Multi-choice drafts only |
| SC-22 | Now | Done | Meeting conflict and preview |
| SC-23 | Now | Done | Selected changes only |
| SC-38 | Now | Done | Explicit change approval |
| SC-36 | Now | Done | Exact job, one fake window, no send |
| SC-40 | Now | Done | Waiting ask visible |
| SC-41 | Now | Done | Real intake settles only matching wait |
| SC-53 | Now | Done | Exact recipient, weekday time, no send |
| SC-62 | Done | Done | Expired absent; stale never deletes |
| SC-67 | Now | Done | Stale queue refused; later typing kept |
| SC-80 | Now | Done | Summary and four sections |
| SC-81 | Now | Done | Section route, next, previous; no action |
| SC-82 | Now | Done | Ask, Help, Escape, IME guard |
| SC-93 | Now | Done | Visible health fix |
| SC-118 | Now | Done | Real completed/total ratio, 0.5 |
| SC-119 | Done | Done | Private sent Ask, no send |
| SC-122 | Settings | Done | One check and acknowledgement |
| SC-123 | Done | Done | All three exact-send targets |
| SC-124 | Settings | Done | Manual off; edit-safe reload |
| SC-126 | Now | Done | One persisted missed-link request |
| SC-127 | Now | Done | Exact local report, literal dollar |
| SC-128 | Now | Done | Named Stop preserves other channel |
| SC-131 | Done | Done | Seven days, New/Earlier split |
| SC-133 | Now | Done | Changes precede reply |
| SC-137 | Settings | Done | Every metadata field and kind |
| SC-140 | Now | Done | Work detail and history |
| SC-143 | Now | Done | Typed source links |
| SC-145 | Settings | Done | Owner text/off; first-name expansion |
| SC-149 | Settings | Done | Accept, snooze, Never, remove |
| SC-153 | Now | Done | Cited private sources |
| SC-155 | Now | Done | Watch and running equivalents |
| SC-156 | Settings | Done | Confirm, isolate, refuse changed privacy |
| SC-157 | Now | Done | Looked-up sources and gaps |
| SC-161 | Done | Done | Owner reply, in-Teams attribution |
| SC-162 | Now | Done | Exact edited words |
| SC-163 | Settings | Done | More, deep links, retained edits |
| SC-164 | Now | Done | Reported review failure |
| SC-166 | Now | Done | Dark reload; live Auto preference |
| SC-167 | Done | Done | FYI headline, gist, source |
| SC-170 | Done | Done | Four matching Catch-up entries |
| SC-171 | Now | Done | Exact target, one watch, no send |
| SC-172 | Now | Done | Before-setup hold |
| SC-175 | Settings | Done | Hourly/off persisted; footer updates |
| SC-176 | Settings | Done | Standing-instruction limits explained |
| SC-177 | Now | Done | Holding reply and retry |
| SC-178 | Settings | Done | Signature bound through work and history |
| SC-190 | Settings | Done | Shared config and setup guidance |
| SC-192 | Now | Done | Explicit stopped/capped/queued states |
| SC-193 | Now | Done | Stopped work and parts |
| SC-194 | Done | Done | Seen resave keeps event time |
| SC-196 | Now | Done | Explicit change surface |
| SC-197 | Now | Done | Server-approved exact change |
| SC-198 | Now | Done | Edit preview, selected change, exact send |
| SC-200 | Now | Done | Selected change identities |
| SC-204 | Now | Done | Warning; cancel-safe checked retry |
| SC-208 | Now | Done | Readable change meaning |
| SC-209 | Now | Done | Exact change details |
| SC-222 | Numbers | Done | Four windows, eight bars |
| SC-224 | Numbers | Done | Shared model and exact rows |
| SC-228 | Now | Done | Owned deploy/checklist details |
| SC-229 | Settings | Done | Test ring shown; production refused |
| SC-233 | Settings | Done | Named remote shown and saved |
| SC-237 | Settings | Done | Project, pipeline ID and parameters |
| SC-249 | Now | Done | Both experiences; isolated version save |
| SC-251 | Now | Done | Single summary line |
| SC-252 | Now | Done | Headlines and compact facts |
| SC-253 | Now | Done | Typed local row controls |
| SC-254 | Now | Done | Existing state markers |
| SC-255 | Now | Done | Paused Send disabled |
| SC-256 | Now | Done | Desktop/narrow, both themes |
| SC-257 | Now | Done | Quote author and notes |
| SC-258 | Now | Done | Visible exact Undo |
| SC-260 | Now | Done | Hash cancel/offline retain edit |
| SC-263 | Numbers | Done | Shared snapshot offers no Numbers |
| SC-264 | Numbers | Done | Lists cached; remount fetches |
| SC-265 | Numbers | Done | Exact rows, repeats, missing |
| SC-266 | Numbers | Done | First week; four of seven |
| SC-267 | Numbers | Done | All rule texts and bars |
| SC-268 | Numbers | Done | Exact anonymous clipboard text |
| SC-269 | Numbers | Done | Retry; narrow, both themes |
| SC-270 | Numbers | Done | Visible selector; focus and window |
| SC-272 | Numbers | Done | Read-only rows; constructor recovery |
| SC-275 | Now | Done | New/back look; pinned news; real marks |
| SC-276 | Now | Done | Slash, Escape, whole PR number |
| SC-277 | Now | Done | Find is the only intake entry |
| SC-278 | Now | Done | Query and nonmatching editor retained |
| SC-279 | Now | Done | Server Since line |
| SC-281 | Now | Done | Actual poll retains IME control |
| SC-282 | Now | Done | Undo remains during link lookup |
| SC-283 | Now | Done | Meaning before approval |
| SC-284 | Settings | Done | Switch-only, alert refusal, deliberate retry |
| SC-285 | Now | Done | Quote first; second approval; no changes |
| SC-286 | Now | Done | Exact item re-reviews without action |
| SC-322 | Settings | Done | Model selection and run summary |
| SC-300 | Now | Done | Plan, owner, current step |
| SC-301 | Now | Done | Your step and newest check |
| SC-302 | Now | Done | Result, literal text, draft |
| SC-303 | Now | Done | Displayed owner to-dos |
| SC-304 | Now | Done | Exact Mark done target |
| SC-310 | Now | Done | Own words sent exactly |
| SC-311 | Now | Done | Durable condition/refusal to-dos; watch |
| SC-313 | Done | Done | Attribution and immutable sent body |
| SC-314 | Now | Done | Meaning, exact vote, Skip, Check again |
| SC-400 | Now | Done | Three versions, fresh links, reload |
| SC-401 | Now | Done | Production build loads |
| SC-403 | Now | Done | Paired screens, versions, widths, themes |
| SC-406 | Now | Done | No row sends or changes |
| SC-407 | Now | Done | Choice/Other/meeting previews |
| SC-408 | Now | Done | Lost/stale receipts, no replay or send |
| SC-409 | Now | Done | Composing row moves without duplication |
| SC-410 | Now | Done | Meaning and selected subset |
| SC-411 | Now | Done | Holding, work, reports, to-dos |
| SC-412 | Now | Done | Private Ask and sources |
| SC-413 | Now | Done | 500 changed drafts: 15.0/10.4/10.3 ms |
| SC-414 | Done | Done | Nonempty filters, exact actions |
| SC-415 | Numbers | Done | Windows, records, copy, remount |
| SC-416 | Settings | Done | All field kinds, refusal, retention |
| SC-417 | Now | Done | Consume, close, reopen; later IME kept |
| SC-418 | Knowledge | Done | Selection, provenance, learned Undo |
| SC-419 | Now | Done | 5,886 refs; additive fields; pinned edit |
