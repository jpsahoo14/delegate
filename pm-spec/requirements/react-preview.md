# React preview requirements

COUNT58 count parity (0.2.48):
- Use one rule-id definition for Needs you (needs-you and stopped) and a disjoint Left for you set
  (your-step and todo). A setup-held stopped job is working; an open terminal is waiting, not in either count.
- The page, Classic and self-chat use the shared producer contract. The header count must equal its rows.
  The owner's step has one shared derivation rather than separate page and engine identity checks.
- Ship the producer and owned consumer halves together with the Left-for-you group; do not hide work
  through a producer-only release or rewrite old records to manufacture a count.
- An explicit owner step without a waiting person still offers reporting, waiting or closure, not a
  nudge. Date it from the last step, or item creation if there is no step; a known waiting-since date wins.
  Both engine and page readers use that same fallback without changing the owner-step definition.

Measurable AI usage (0.2.47):
- Count a logged run even when it reported no usage. Unknown calls/tokens/time stay unknown, not zero.
- Include checking the owner's replies, checking promises and reading rules as distinct run kinds.
  Do not attribute owner-reply judgments to an item; they can cover several items.
- The paired view shows measurable totals/over-time/model breakdown from launch, with truthful
  coverage and partial earlier windows. Never backfill missing history or convert tokens to money.
- HOST logging and New's view ship together; the separate WDD/Undo and rule-covered result bundles stay out.

Settings interval and watches (0.2.47):
- Choosing a longer quiet check interval must not stretch an active watch's configured schedule.
  Eligible future watch deadlines may wake the runner before the next quiet poll.
- While the runner is stopped, watches do not add wake deadlines; past-due blocked watches return to
  ordinary idle cadence instead of causing repeated immediate wakes. Existing pause behavior and health stay unchanged.
- The runner companion and New's Settings range/help/save-note changes ship together. No live setting,
  watch default, read scope or AI budget is changed by this companion.

Cross-item chat news (0.2.47):
- When the same 1:1 counterpart, or a known asker in a group, writes in another item in that chat,
  record that fact on the other active work item. Its existing no-news check may wait from that news.
- Count one news step per other work/target item, at the actual message time. Do not treat an unrelated
  group member as the asker, guess from names or claim the message answered the other work.
- Keep pending work, state and any existing question untouched; this does not wake a run or close anything.

Question hints (0.2.47):
- Keep suggested answers beside the question that produced them, with at most three short, sanitised answers.
  Never reuse an earlier question's answers for a new question, preview, retry or engine-made request.
- Preserve existing questions, choices and approval/send behavior. Older items without typed hints remain
  readable without a rewrite; HOST application and New's typed chips/legacy-only fallback ship together.

Owner-wait questions (0.2.47):
- When the existing work check asks about the owner's own step, offer Report how it went, Remind me in 3 days,
  and Close it, not a follow-up draft to the asker. Use the stored step and waiting-since day.
- Preserve the existing trigger/timing and all other-person, send, closure, placement and schema behavior.

Text inbox/details:
- Use the same cached place labels as the page for untitled groups, excluding the item's asker and owner.
  Keep titled-chat and 1:1 wording unchanged; do not show a raw chat id as a place label.

Left for you:
- Store structured actions separately from replaceable worker context. Same-source reruns do not duplicate a line.
- Explain a refused action from structured facts and safe source links, not by guessing from a sentence.
  A new reviewed revision can create a new line; re-running the same revision keeps the same line.
- A cleared line does not reopen on a rerun. After 30 days its content expires; only a bounded, content-free id
  tombstone remains. Old items retain plain legacy lines; do not infer structured actions by parsing their wording.
- HOST supplies the data and engine handlers; New owns card wording, links and the existing six-second Undo receipt.
- Sending or automatically finishing an item ends its reply, not the owner's unfinished tasks. Keep those tasks visible.
  Explicit owner closure of the item clears them; an automatic transition to Done does not. Skipping only the reply
  on open work keeps both the work and its Left-for-you tasks.
- Asking again or redrafting an old invite is bound to one still-active line and only prepares a proposal for approval.
  A line is seen done only after an exact later owner reply on its PR thread or a later PR closure, never an AI guess.

Fast checking:
- Open or extend fast checking only after a reply goes out, sent by Delegate or by the owner. Measure its window from
  that reply, not the tick or repeated reads of the same receipt.
- A new ask, drafting run, job or self-chat nudge alone must not open it. Unrelated owner messages do not count.
- Keep ordinary idle checks, confirmed-owner-reply detection, source backoff, due reminders/retries and explicit wakeups.
- A scheduled reply still wakes at sendAt without starting fast checking. Non-local jobs and closed Continue windows
  otherwise use idle cadence when no explicit wake or earlier due time exists.

New-message PR joins:
- A message naming a different ADO PR starts its own item instead of joining another PR's open item.
- With one eligible matching item, join it; with several, honor a matching explicit reply, otherwise keep ambiguity visible.
- Keep the item's original PR when a multi-PR body joins it and show the other mention. It grants no effects or votes on the
  other PR. Bare numbers and GitHub/GitLab links must not collide with ADO IDs; existing no-PR and consent gates stay intact.
- Keep the other named PR numbers with the original anchor, not in replaceable report context. Later joins do not
  change that list, and clearing the anchor clears it. Old anchors without a list are not guessed or backfilled.
  HOST's stored-data producer and New's valid-anchor rendering ship together in .47; the PR-target guards do not change.
- Naming only the current PR preserves the previous quote/subject-relation rules; only multiple named PRs get the
  sole-match override. Conflicts stay blocked even after their once-per-code diagnostic has already been recorded.

Historic review facts:
- Old review results must follow the same context policy as new finishes in every surface, including completed-job
  context used for later replies. Drop CI/vote noise and show retained facts as information, not warnings.
- Preserve author watches, recurring jobs and non-review payloads. When trim eligibility cannot be established, leave
  context unchanged and log the missing evidence rather than guessing.
- Upgrade once through schema 8 in bounded phases; repeat completed migration does not change records or markers.

Incomplete report status:
- A report short of its goal retains its current Needs human explanation and holding draft, with the matching structured
  not-finished reason so consumers do not rely on prose alone. Existing saved records remain readable without repair.

Tick diagnostics (#54 step 1):
- Distinguish idle gaps of at least 15 minutes from warm checks and report actual filesystem/external-call time per step.
- Add diagnostics without reordering, skipping, caching or changing owner work. Keep warm <2 s and cold <5 s as separate
  measurement targets; use the VM table before choosing optimizations.

Acceptance Undo identity (U1):
- Remember the proposal and the learned line as two separate text identities, captured only after successful acceptance.
- Generated learned wording or an evidence suffix must not block immediate Undo of an unchanged Add it.
- Changed proposal or stored-line text still refuses Undo; all other safety gates remain in force.

Undo an unchanged Add it:
- Within the existing undo window, remove the accepted learned line and restore the suggestion's previous state,
  time, snooze expiry and told flag exactly. Do not count this as Not now or Never.
- Refuse when the acceptance is no longer current or its words/ownership changed; a failed rules write changes no habit.
- Stop-style offers, edited acceptance and old records lacking a prior-state snapshot have no acceptance Undo.

Accepting edited suggestions:
- Save the edited words as an unconfirmed learned line to be read, never turn on the original suggestion first.
- Keep the suggestion and its dismissal Undo unchanged if saving is refused. Say it is being read, not already on.

Rule reading (R12a-h):
- Read a new or edited line in the next free drafting slot, ahead of queued drafts, without interrupting an active run.
- Show Reading... with no promised time. Existing limits, pause/stop and AI-run budgets still apply.
- A changed line is read again; an older result never applies to it. Failed reading keeps its text and reports the
  problem in Health instead of pretending it was understood. Reading a line never sends, posts or confirms it.

Habit suggestion lifecycle (R12a-h2):
- Habit rule mutations use the central writer and show its refusal before changing acceptance/removal/edit state.
- Add it unchanged records consent for exactly that trusted text; edited suggestions use normal compile/confirmation.
- Show one open suggestion and a turned-down list with dismissal time/kind. Not now is 14 days, then 60 days with doubled
  evidence; Never never returns automatically. Undo applies only to the latest dismissal; reconsider preserves history.
- Preserve current owner/Settings lines, unrelated habits and learning/style metadata. No invented drift state before R14.

Keep waiting instead (R11(3)):
- An unsent drafted follow-up can be discarded as skipped while the original W entry returns to Waiting on others.
- Send no follow-up or self acknowledgement and record no negative learning from the discarded draft.
- Preserve the original ask/age and unrelated waits; never resurrect an answered or dismissed wait.
- Refuse sent/busy/ambiguous items explicitly. Ordinary work wait/duration controls and ordinary skip learning stay unchanged.

PR review owner-item lifecycle (R10c first slice):
- Remember cleaned live PR reviewer-group labels; unavailable PR evidence must not retain an old group scope.
- A finished review's owner item goes to Done only on a non-zero live vote changed from its known review-start baseline,
  or a PR closing after the ask. Old votes/closures are context; a missing baseline never gains vote-close authority.
- Keep the posted-comment and sent-reply facts for Done; neither a cached receipt nor a group vote is the owner's live vote.
- Preserve running reviews, new owner input and the existing generic/compound PR paths. Cast/send nothing while observing.
- A live head differing from the same PR's verified reviewBasis sets Review again, preserving every reviewed/sent fact.
  Missing basis or unchanged head creates no marker; new commits alone never start a re-review. The marker must not block
  normal vote/closure news, role gating or effect refresh; only the automatic stale-draft redraft is replaced.

PR review revision evidence (R20 prerequisite):
- Read and remember the exact PR/head before each review run; replace it on a restart and leave it unknown on read failure.
- A report-only wrap-up cannot claim findings cover newer commits. SEND verifies the completed review against the start
  stamp before any autonomous comment/reply; the start stamp alone grants nothing.
- Preserve cancellation, pause/stop and limits across the added read, and retain normal non-review/execution behavior.

Reviewer-group answers (L2a engine; L2b card separately owned):
- Ask which listed PR review groups the owner belongs to, with cleaned labels and unchanged full server identities.
- Save selected and unselected memberships together in one config write; None means every listed group is not theirs.
- Accept typed group names or none; accept yes/no only for a single group. Invalid answers save nothing and do not redraft.
- Remember membership across PRs, re-read this PR's role, and confirm "Delegate remembers your answer."
- Old saved group questions use the same read-time choices and answer handler; known groups in either list are not asked again.

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
