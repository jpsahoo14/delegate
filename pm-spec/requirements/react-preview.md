# React preview requirements

Workflow upgrades (card-state step 6):
- Every new Workflow is born at WORKFLOW_SCHEMA; the legacy chain never processes a newly constructed item.
- Pure compatibility reads preserve old msgIds/kept fields and provide structured legacy reasons without writes or log scans.
- Context-dependent upgrades are ordered, limited to 50 items per tick, saved with per-item schema markers, and idempotent.
- Preserve unrelated concurrent fields, skip unrecoverable data explicitly, and never execute a recovered proposal.
- Old items arriving after a completed migration still upgrade. Already-current items are never rewritten.
- Runner decisions use statusReason/reviewAgain/returnedFrom, not display prose; owner-send reason remains separate. requirements
- Working cards get a stable workingSince: stamp on entry to a working state, preserve on unrelated saves, clear on exit. requirements

Chat effect receipts (#51):
- Count comments naturally, name the PR and person/chat, and put a command code only in the closing Say command.
- Keep execution order, distinguish present/running/done wording, and never offer a retry for an uncertain result.
- Reuse exact effect calls for wording; do not change approval, execution, retry or send behavior. requirements

Runner read scopes (#27):
- Keep caches across phase awaits without sharing request snapshots or mutable returned records.
- Cache hits make no stat within a one-second epoch; own-process writes are visible immediately across parallel contexts.
- Revalidate lazily after expiry; fresh commit reads bypass snapshots. Preserve synchronous page scope behavior.
- On the fixed fictional 400-item rig, every one of 20 empty ticks is <=2 s, including cleanup, and real page/settings requests
  during a held tick stay <=1 s. Report read requests, actual opens and stats separately.
- Fresh synchronous commits preserve unrelated cross-process fields and new job asks; original send/effect receipts are not replayed.
- Acknowledgement markers remain before the post and at-most-once; scheduled presence holds never reopen cancelled items.

Warm owner-send checks (#45):
- Never delay an approved send for a cold CLI start. Use only an existing warm host, with a five-second total deadline.
- Every check has a fresh tool-less session and validates the requested JSON shape. Errors, bad output or unavailability
  return no verdict; the send caller fails open. Rule sends keep their strict checks.
- Do not alter item/job history, create backups, reset breaker state or leave ephemeral sessions behind.

Reply history retention (#29 follow-up):
- Keep the current and previous managed reply histories, locally and in synced backups, without deleting job/owner histories.
- Never infer ownership from age alone. Retry failed cleanup visibly; recover known legacy reply IDs once through an upgrade.
- Five runs leave two backups per item; unrelated histories and bytes retained for Continue remain unchanged.

Answer redrafts (#29, runner):
- Start answered items before routine intake/sweep; still read same-tick news and reject outdated reports.
- Keep reply input compact without losing review findings or private-source holds. Reviews retain their job histories.
- Acknowledge accepted answers immediately with "Redrafting with your answer"; never claim the draft is already finished.
- Keep Continue on the latest completed run. Never rewrite an older session or reuse an undated PR read as fresh evidence.
- Measure ten warm redrafts, input per call and p50/p90. The delayed-stub worker target is <=15 s p50 and <12k input per call;
  real-provider and on-card latency need their own measurement.

Host draft setup (#39):
- Never prompt a host session without its required registered worker/owner tools.
- Missing optional catalog tools do not disable an otherwise healthy warm host.
- A no-report answer explicitly naming an unavailable worker/extra tool retries immediately on spawn, not as an owner question.
- Naming an unavailable owner tool alone causes neither a host strike nor a spawn retry.
- Preserve valid reports and ordinary content failures; bound historical recovery with a versioned upgrade.
- Keep the existing work-hours warmth policy and fault breaker; log actual offered tools and replacement reasons.

R-REACT-01 through R-REACT-09 are defined in [the product spec](../react-app.md).

M1 acceptance:
- Three versions, one per-machine choice, switching sends nothing.
- Classic and New retain every non-menu golden byte.
- Preview assets require the page token, including lazy JavaScript and CSS.
- The browser-only preview does not break panel or snapshot rendering.
- Missing features are disclosed, not presented as working.

M2 acceptance:
- Every current Now row opens without acting; the server owns placement.
- Exact edited sends, choices, changes, holding replies, work, private Ask and
  Undo cross the real server/runner gates in a fictional browser fixture.
- Refresh keeps edits, focus, composition and folds. A changed revision is
  disclosed; replacing it requires explicit discard.
- Double submit, stale metadata, lost responses and rotated outcome logs
  cannot replay actions or target a later send.
- A production redraw changes all 500 headlines and stays below 16 ms.

M3 acceptance:
- Done preserves filters, freshness, feedback meaning and exact-send targeting.
- Numbers lists match counts, copies no identities, retains its window and
  does not fetch on unrelated page polls, focus or reconnect.
- Every editable setting uses server validation. Advanced links open More;
  failed refresh and in-flight saves cannot erase current edits.
- Suggestions show evidence and support Turn on, Not now and Never.
  Accepted learned rules keep their provenance and Remove action.
- Chat privacy changes require explicit confirmation and refresh the screen.
  Setup-only values are readable without chat-command instructions.

M4 remains subject to the complete parity inventory in
[the architecture](../../dev-spec/react-app.md).

Working-preview handoff:
- The shipped build opens the actual four-screen workspace, not M1's foundation.
- Headline/Next use the New server data; the page teaches no chat commands.
- Ask timestamps stay correct and use New's short relative forms.
- Work Next/checklist precede a collapsible long ask, with section-local counts.
- Unchanged page polls transfer no JSON body; a changed item still refreshes.
- All reviewed P0/P1 action gates are proven. Prepared recovery revalidates the
  stored intent but never enqueues from a read or replays an interrupted action.
- The new-reminder hash opens its sheet, version hashes preserve discard
  protection, and learned provenance remains visible in Settings.

Visual milestone:
- Match New's logo/tab/count/Checked/version/theme header and compact row
  avatar, attributed facts, source-link icon and filled Open treatment.
- Use one summary line and the persisted Same items note. Both use the
  existing visit/per-machine state, never a new AI decision.
- Expand Now cards in their row without repeated names or an extra pager.
  Keep headings elsewhere, stable edited DOM, keyboard focus and action gates.
- Place session conflicts in the compact leading health line. Additional
  problems and age remain reachable, including on narrow screens.
- Compare identical fictional stores at both required sizes/themes. Record
  image/layout differences honestly; do not port direct row command handlers
  to make a screenshot match.

Classic Needs-you milestone:
- Use Classic's compact avatar/name/code queue and live-only pager. Keep handled
  visit rows directly reachable without treating disappearance as a successful send.
- Render Classic's person/chat header, original message, optional work details,
  body/draft, Why, actions and private Ask; do not reuse New's work-first card.
- Keep the desktop app-version selector visible and expose it once in the narrow
  menu. Compact Home Catch-up shows no extra quoted ask.
- Retain selection and edited words across refresh/removal, refuse stale exact
  actions, and show the current private conversation alongside a pinned editor.
- Use existing guarded typed actions for choices, selected changes and due-work
  Wait/Close. Editing must not offer the stored-text reply-only path.

Combined-data acceptance:
- New and Classic use the same old-page visit start and freshness rules.
  A first-ever visit has no leaving time; do not synthesize one for badges.
- Display-only Since fallback is distinct from the actual optional cursor.
  Polling does not mark a look; toggles and reloads preserve the visit.
- Done/Catch up counts match the existing helpers for the same history and
  seen marks. No browser count patch or new ownership rule is introduced.
