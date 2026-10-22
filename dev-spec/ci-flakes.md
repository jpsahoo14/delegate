# Browser timing on slow CI runners

## Inventory and diagnosis

Collected all 32 available recent workflows on 2026-10-22 with
`gh run list -R jpsahoo14/delegate --limit 40`. Read first-attempt failed
logs for all 19 failed or rerun workflows, including the initially red
`ci/react-m1c` run (39704519173), not just its green rerun. Node 22 uses
TAP `not ok`; Node 24 uses the spec reporter, so both were included.
The baseline is local main b7907fc (public main 4fa3e32).
Main advanced to b1bcea1 during verification; the final branch keeps those
new main changes and contains no engine or generated-bundle diff.

| Failure / representative run | Root cause and classification | Fix and proof |
| --- | --- | --- |
| N1b opening a row / ending a look, 39706874295, also 39591638104 | Test timing. The Find branch still used the real 1.5-second look timer. On a busy runner, filling Find happened after the page had genuinely been looked at. Increasing the other branch to 4 seconds did not fix this assumption. | Pause the browser clock before navigation. Open, leave, or Find without advancing time, then advance through the real 1500 ms boundary. Also stay on Now and prove no marks at 1499 ms, then exactly A20 and A23 after the boundary. The shared clock contract fails if only Date is fixed or timers are not paused. |
| N2 P2-C Mark done, 39704519173, 39694772092, 39677875235, 39595928625 | Test timing / incorrect simulation. Aborting `/data` meant offline, not stale. The next poll legitimately disabled Mark done; the timing determined whether Playwright clicked first. | Replay the captured old view with a successful response. Wait for a refresh, assert the button stays enabled with the old `data-seen`, then mark only the old to-do. Forcing the original aborted refresh reproduced the disabled-button failure deterministically. |
| Classic dark goldens, 39704519173 | Test timing. `setFixedTime` froze Date but not timers. Done's 1.5-second seen callback could run during a slow multi-click capture, mutate the shared store, and change later pages' header counts. The diff printed the first 400 characters of a long line, not the differing character. | Pause all browser timers, not just Date, before navigation. Keep the existing goldens unchanged. The clock contract failed against `setFixedTime`; the diagnostic test failed against prefix-only output. Diffs now include line, column and escaped text around the actual difference. |
| Clock setup in the first branch CI trial, 39709908344 (macOS Node 24) | Test timing. Separate `install(at)` and `pauseAt(at)` protocol calls allowed time to advance beyond the pause target, so Playwright refused to go backwards. Five runners passed; the trial was not acceptance. | Call `pauseAt(at)` alone: it installs the clock internally and pauses before navigation. A deterministic protocol fake advances five seconds during any separate install and reproduces the old failure without a sleep. |
| Narrow paused first screen in branch trial 39712733997 (macOS Node 24) | Test timing. An element could be detached by a redraw between Playwright resolving a locator and measuring its bounding box, returning null for a visible first row. Independent measurements also mixed different draws. | `readLayout` waits for fonts and two frames, then resolves and measures all selectors in one browser task. A regression forces a real redraw after handle resolution and makes the old measurement return null. Reuse it for both first-screen checks and the version-menu baseline; retain every original pixel threshold. |
| Dismiss pending state, 39704519173 | Test timing. The test waited up to 30 seconds for a nonexistent `data-act=more`, swallowed that error, then dispatched a hidden menu item's click. A fast runner could finish Dismiss before the test inspected its transient pending state. | Use the real menu and visible Dismiss control. Hold `/act` until the pending label and non-busy Send button are checked; release it and verify completion on the real store. Completing the action before the old pending-state check reproduced the timeout deterministically. |
| Watched things P2-2, A33 Tell result, Settings switch, 39698794134 / 39694772092 / 39700508019 | Product bugs, already fixed. An action refresh could skip drawing its result or saved switch when a background poll had already supplied the data. | Existing fixes 9b95dcf and 606299d force owner-action refreshes to draw; only unchanged background polls may skip. Preserve their browser regressions; do not serialize CI to hide these bugs. |
| N2 checklist deploy and timeline near midnight, 39697738237, also attempt 2 of 39694772092 | Test timing / calendar assumption, already fixed. A deployment an hour ago could be yesterday on the runner. | Existing 085ae74 and 0a5366f allow yesterday in both assertions. |
| First-screen rows / summary, 39577329689, 39583144344, 39592571323, 39604894516, 39691091174 | Product layout bugs and a test layout-readiness race, already fixed. Header/strip height consumed the first screen; font metrics could also resize the version control after measurement. | Existing compact layout changes, ea9a47b font/layout readiness, and b7907fc's bounded version menu and polling/font-metric regression. Keep the original first-screen assertions. |
| N1b narrow paused first screen, 39677875235 | Product layout bug, already fixed: banner, Find, summary, Undo and note pushed Your move below the window. | Existing 774d3f8 tightened the strips; the 400 px browser check remains. |
| Next Now tab text, 39592252599 | Product rendering regression, already fixed. The tabs lost the whitespace separating the label and its count (`Now13` / `Done5`). | The current page again supplies `Now 13` / `Done 5`; the original normalized-text assertion remains. |
| N1b Find clearing / subsequent person search, 39592252599, 39604894516 | Product redraw/focus timing bugs, already fixed. Replacing a composing input could lose or retain the wrong text and caret. | Existing Find/composition regressions and 9e6281f / bc46614 preserve the field through background and action-result redraws. |
| Copy Details smoke, 39523724984 | Product bug, already fixed. A background redraw closed Details before Copy details could be clicked. | Existing 0653bab remembers Details state and forces a redraw in its regression. |
| Holding Send during fresh data, 39564027776 | Product bug, already fixed. Replacing the button between pointer-down and pointer-up dropped the click. | Existing press/deferred-render guard and held-button browser regression. |
| Numbers rows, numbers endpoint, watch A41 link, 39583144344 | Test expectations, already fixed. Assertions expected the old encoded Teams link rather than the canonical copied-link shape. | Current tests use the new link shape introduced by 882da34; no timing workaround. |
| B19 promised check-back, 39677875235 | Test expectation, already fixed. Expected a 14-day watch while the default is seven days. | Current B19 test expects seven days, retaining the separate 240-minute interval check. |
| Typecheck, 39596859997 | Build error, already fixed, not a browser flake: a string was passed where an HTML fragment was required in the classic card. | Current baseline typechecks the page as well as the server and React projects. |
| 39672652033 | Infrastructure cancellation, not an assertion failure. Five jobs succeeded; macOS Node 22 was cancelled with no failed step. | Recorded separately; do not classify a cancellation as a flaky assertion. |

No current failure required a product-code change. In particular, offline
buttons should remain disabled and a genuine 1.5-second look should still
be marked seen. This branch changes neither behavior.

## Browser-test rules

- For elapsed-time behavior, use `freezeClock` before navigation and
  `page.clock.runFor` to cross the exact boundary. Do not lengthen product
  delays or use wall-clock sleeps to give a click time to win.
  Pause atomically with `pauseAt`; a separate `install` can already have
  ticked beyond its target on a busy runner.
- For a pending state, hold the request that completes it, assert the
  state, release the request, then verify the result. Always release in
  cleanup too.
- A stale connected page and an offline page are different scenarios.
  Replay old successful data for the former; abort only for the latter.
- Goldens describe one instant. Freeze timers as well as Date; do not
  regenerate expected files to absorb seen marks or other timed changes.
- Keep real polling, font readiness and pointer-interaction regressions
  for product bugs. The test concurrency and CI timeouts are unchanged.
- Capture related layout boxes in one `readLayout` call, after content is
  visible. Never hold element handles across redraws or wait for a desired
  pixel threshold: assert that threshold on the captured geometry.
- Keep stores under the OS temp directory; never use the owner's data.

## Verification

The targeted browser run covers the changed browser test files together.
It includes the real server, runner and browser, unchanged light/dark
goldens, exact look boundaries, the stale successful refresh, and the
held Dismiss request.

Mutation checks cover the atomic clock contract, diagnostic context, both
look-cancellation guards, the 1500 ms threshold, the Mark done watermark,
the Dismiss label, and atomic layout measurement. Typecheck uses `npm run typecheck`; the complete
suite is run once before the single commit. `publish:check` requires a
clean committed tree and is run immediately after that commit.

Acceptance is two separate fresh public pull-request workflows from
`ci-branch.sh`, each green on all six macOS/Ubuntu/Windows, Node 22/24
jobs at attempt 1. A rerun of a failed job is not acceptance. Close each
throwaway draft PR and delete its branch; never merge or publish main.
