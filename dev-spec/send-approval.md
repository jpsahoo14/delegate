# Owner-approved sends (#35, #37, #45)

The PE-approved send contract keeps the page's exact-revision guard first.
Owner intent checks may use only the warm host's optional one-shot `quick` API,
never a cold CLI or the item's session. Rule sends retain their stricter checks
and never use the relaxed intent check.

## PR vote claims (L1)

PR-review replies wait unless an explicit review rule covers them and the reply
is built from comment receipts. Replies mentioning approvals or votes always
wait for the owner. `decide()` and `whyWaited()` use the same
core vote-word detector; the runner re-exports it without a core-to-runner import.
Scheduled sends re-evaluate this policy before sending.

`aboutPr(store, wf, text?)` is the shared, read-only PR-context test exported
from `runner/apply.ts` (R18): an engine PR reference, PR-review intent, or a PR
link in the reply, last ask or asker's stored thread. New can import it instead
of maintaining a separate projection copy.

## Rule-authorized PR comments and replies (R10a)

`reviewRuleFor()` is the shared matcher for policy, waiting reasons and the
named `reviewCommentHook` handover in `runner/jobs.ts`. Rules may narrow the PR's
reviewer groups; live eligibility still comes from `review-gate.ts`, never
from the rule. Settings writes the standard English line through `writeRules`,
marks it `source: 'settings'` with a text hash, and preserves its text on Off.
Multiple review rules are toggled together and shown as Custom.

The hook retains the current ask IDs before attaching the review job, captures
read provenance, and creates an isolated
comment-only carrier. Subset approval binds the exact IDs, text and turn; all
votes, held findings and excess comments remain proposed on the same workflow.
The executor never starts a model to execute that carrier. Each post rechecks
the current rule, pause/stop, safety policy, reviewer role, head, audience,
catalog-built call and existing threads. Unknown provenance stays held for
sharing; failures and uncertain writes never retry automatically.

At job completion, one live PR read must match HOST's `job.reviewStart` via
`sameHead` before `finishWork` stores `wf.reviewBasis = { pr, head, at }`.
A missing stamp, failed read or moved head grants no basis and no automatic
post/reply; findings stay proposed. `reviewAgain` records a live head only when
a start stamp exists for the same PR and the heads differ. A missing start is
not evidence of new changes. The missing-basis status mentions posting by rule
only for items covered by a review rule; other items retain their report summary.
A worker-reported commit and a proposed vote are never authority.
`reviewDone.head` and `reviewDone.reviewedAt` come from that basis. Each post
rechecks the live head against it, and a new turn clears it.

At most ten new comments post, High first, with deterministic severity tags.
Actual write receipts carry severity and `byRule`; `reviewDoneFacts` exports
the posted comments, lowercase severity counts and remaining exact IDs for New.
The reply frame counts only those receipts. Final failures permit a partial
count; for proposed findings, no posted comments or an uncertain receipt means
no automatic reply.
At most one summary sentence follows the frame, after vote, commitment,
source and audience checks; otherwise Details records the short-version reason.
The global auto-send switch stops both review comments and replies, including
an already queued batch. A verified review with an explicit empty findings list
and no proposed changes or unanswered question sends the clean-review frame,
"Reviewed PR <n>; no comments from my side." Its facts carry `clean: true`.
The engine records `Job.result.reviewClean` only at verified completion on an
active PR covered by a review rule, with no blocker, unmet goal, sender wait,
rejected proposal or preparation failure. Without a covering rule, or on a closed
PR, an empty done report retains the existing Nothing needed behavior per item.
An empty findings list alone never authorizes a clean-review reply.
This is distinct from findings that failed or were held: those still send
nothing when no comment was posted.
The normal send path rechecks the rule at its write boundary, retains the owner
item for the vote, and records `byRule` on its send and review events.
New owns the card/projection wiring; HOST owns close-on-vote and moved-head UX.

Vote sentences are classified in order: requests/future/conditional/withholding,
another reviewer's approval, then an owner claim for every remaining wording.
No vote word means no claim classification. Bounded live-vote matching includes
"Reviewed and approved", "Approved with one nit", rejection and requested changes.
Future/negative words after an already-completed vote claim do not exempt it.
Each comma, semicolon, dash or colon clause is classified independently. A
condition, question or request elsewhere in the sentence cannot hide a completed
claim; the full sentence is retained for its PR references. Past-tense "When I
approved it" reports a completed action, rather than a future condition.
The existing live PR check remains the authority. A recommendation is never
evidence of a vote. Same-Send effects execute first; a completed vote receipt
must match the PR, repository, head and current ask before it can support a
completed PR whose reviewer list is unavailable.

An unsupported owner claim preserves the approved draft and exposes
`wf.statusReason = { kind: 'vote-claim', text, at }`, retaining HOST's shared
lifecycle-reason shape. The sibling
`wf.voteClaim = { why, pr?, claim, vote?, digest, automatic?, canOverride? }`
contains the vote-only details. `text` is the final PM card/confirm copy; `why`
retains the specific live-check failure. A vote hold requires both the
`vote-claim` kind and the sibling details; a legacy `not-sent` reason is not a
vote hold. Clearing chat/vote holds preserves every non-vote lifecycle reason.
The digest covers the reply and live-check reason, and the page revision covers
the status reason and vote digest. Only page **Send anyway** on that exact revision
can override the same claim hold, after another live read; chat cannot override.
A changed draft basis (`canOverride: false`) or automatic hold (`automatic: true`)
cannot be overridden. Ordinary chat-reason digests and this digest are combined
when both are held. Overrides log only code, PR, claim and vote metadata.

Legacy automatic-send attempts redraft once, then preserve the second draft as
not sent. A replacement draft, explicit edit or new turn clears the hold.
Redraft starts a new retry budget. No owner-approved draft is redrafted by this
check. No new tests, proofs or golden rows are added under the owner's current
validation rule; PE reviews the eight cases with commit file-and-line references.

Card-owner handoff (no card changes here):

- Background PR polling retains its older approval-only definition of the owner
  writing. Non-approval uses of "rejected", "waiting for author" or "my vote"
  cannot make a vote refresh move the owner's own draft on. The broader live
  vote-claim check still applies at send time.
- `voteClaimGap(text, effects, lastKnownVote?)` is pure and exported from
  `runner/work.ts`. Its optional last-known value is
  `{ pr: number, vote?: number, head?: string }`; the result is
  `{ pr?: number, claim: number | 'approval', why: string }` or `undefined`.
  A proposed vote or matching live vote supports the warning; a made receipt
  additionally requires the last-known head. `why` uses the PM's final copy.
- Show the gap/held `text` above the bar, disable ordinary Send until the reply
  changes, and use the same copy to confirm page **Send anyway** with the current
  revision. Read held text from `statusReason.text` only for kind `vote-claim`
  with `voteClaim` present. Read `automatic`, `canOverride` and `digest` from
  `voteClaim`, not `statusReason`. Never offer override for `automatic` or
  `canOverride: false`. With no PR number, the copy says "this PR".
- **Add the vote** submits `verb: answer, text: add the vote` with the exact page
  revision. The engine builds an unapproved proposal from the carrier report's
  recommendation and existing PR scope. Normal approval makes the vote before
  sending the reply. No recommendation means no proposal.

## Author edits

Teams `lastEditedDateTime` becomes `RawMsg.editedAt` and is stored on each
thread message. Reaction changes to `lastModifiedDateTime` are not edits.
If edit metadata is absent, the shared `contentKey()` compares content without
URL, image-reference, mention-markup, case, punctuation or whitespace differences.
Equal keys, or at most two changed words with no changed digit, date or negation,
are cosmetic for an owner send. The latter relaxation never applies to rule sends.
Operational state changes (for example Mitigated to Active) are not treated as
typos: the revised PE's explicit owner-row regression requires an intent check.

A cosmetic or conversion-only refresh changes the stored thread text and metadata
only, never `lastAsk`, `revAt` or `pending`. It logs `edit-ignored`.

## Durable approval and card integration

`ownerSend` snapshots the approved draft before preflight. A no-reply worker
report cannot erase it: `keepApprovedDraft()` restores the snapshot and sets
`needs_human`. Old `approved` fields are also recognized before rerunning;
normal drafting never scans approval logs. This protection is explicit in reply
and job report application, not in persistence: `Store.save()` never changes
domain state. Every new turn, a replacement reply report, an intentional Edit,
Redraft, Skip or close ends that approval and clears its reason. Successful
sending clears it too.

The engine exposes `wf.reasons` through `holdReasons()`, falling back to the old
single `wf.reason`. It continues writing the first reason to `wf.reason` while
the card owner migrates both experiences. One `holdCheck()` collects edits,
all unclaimed asker asks, and an existing no-reply hold together.
Preservation marks synchronous report results pending; async dispatch and job
boundaries evaluate them once. Ordinary ticks do not repeatedly recheck holds.

- `ask-edited`: `msgId`, `before`, `text`, `at`, `digest`. Show old/new words and
  when the asker changed them; `changed` names the owner-relevant change.
- `asker-wrote-again`: `msgId`, `text`, `at`, `digest`. Show the exact newer ask.
  `changed` names the owner-relevant change.
- `no-reply-needed`: `why`, `digest`. Show "Delegate thinks no reply is needed
  now: <why>. Your approved draft is kept." Offer **Send anyway / Skip**.

The card-state owner must map ALL reasons into the existing not-sent pattern;
this change adds no card component branch. Send `verb: answer, text: send anyway`
to review the current chat reason set, or `verb: answer, text: redraft` to
explicitly redraft using all changed asks. Real-change reasons lead with Redraft,
otherwise Send anyway leads. Page actions send `sendReview: wf.holdDigest` and
retain the current `expect` revision, which hashes the full reasons. The digest
hashes sorted reason digests. Every current reason must have been reviewed: a
post after the click holds once with the new full set. Page-edited send text
restamps shown reasons; typed chat send cannot silently replace a held draft.

Only unclaimed asker asks reach the owner-intent check. Context posts and asks
claimed by other open items do not. There is
no automatic rerun of an owner Send. Existing deletion, duplicate, PR-evidence,
effect and page-safety checks remain in force.

## Changed-intent filter

After cosmetic comparison, reduce old/new asks to owner-name/first-name/alias
rows, rows containing draft-cited digit runs of at least five digits, and
non-row instructions/headers/questions. Remove other people's rows and normalize
dates, times, relative ages and parenthesized counts. Equal reduced text sends
without a model.
Matching non-row total headers such as "8 CRIs" and "10 CRIs" ignore only their
count when the rest of that header agrees with the old ask. Other header wording,
owner instructions and owner-row numbers remain meaningful. Identical reduced
editions are deduplicated before comparison and the model step, including when
only those paired totals and ages differ.

Otherwise the optional warm `host/client.quick(prompt, jsonSchema, 5000)` gets
only reduced old/new text and the draft. Only JSON `stillAnswers: no` with a
nonempty `changed` line holds. Yes, unsure, malformed, missing changed, missing
quick, host errors and the five-second hard timeout fail open. No retries.
The host owner supplies a fresh, no-tools fast-model session; SEND never calls
`ensureHost` for this path.

All new asker messages are ordered and reduced together, with at most one model
call for that batch. A later unchanged digest cannot hide an earlier new
question. The `asker-wrote-again` reason retains `msgIds` and exact `messages`;
its digest covers the complete batch. Legacy `msgId`, `text` and `at` remain for
card compatibility. Restamping, confirmation and Redraft use every message.
Deduplication affects the intent check only: holds and their digest still retain
all original message ids, texts and timestamps.

`owner-send-checked` logs step, result and elapsed milliseconds. A successful send
persists history in `wf.sent.checks` and `owner-send-history` events, plus work
steps when present: "Sent. Kim posted again at ...; nothing changed for you." or
"Sent. Kim posted again at ...; Delegate couldn't check it in time." The card
owner renders these as history only, never a post-send warning.
The engine formats the history timestamp as a short local clock time, using the
owner's configured time zone (or the runner's local zone when none is valid),
not raw ISO text.

Engine, HOST quick and the New/Classic card adaptation ship together.

## Last legacy restoration

`restoreApprovedDrafts()` runs once before dispatch, guarded by the
`draft-restore-37` timestamp in `state/upgrades.json`. The marker is written even
when there are no recoverable items; subsequent ticks and process restarts do not
scan the logs again. It needs retained log evidence:
the latest owner answer is `ok`/`send`, the forced-new-message rerun occurs beside
that receipt (state is logged before the answer receipt), and a no-reply report
follows within ten minutes. The draft comes from an earlier archived reply report,
never from a guess. Already drafted, sent, redacted, skipped or explicitly closed
items are excluded. Restoration logs `draft-restored`; the next dispatch does
nothing. Missing archives or evidence leave the item untouched.

This is the PE-authorized last log-keyed repair, not a `probeMark` repair.
The card-state owner should move it into the versioned upgrade chain at step 6.

## Proof

Run `node scripts/prove-send.ts` and `node scripts/prove-send-holds.ts`.
They use real intake, dispatch, apply, send,
page-revision and card-data paths, with a stub worker and Teams source. All data,
CLI homes and local state live in a newly created Temp directory and are removed
afterward. It is a standalone journey proof, not a unit test or CI addition.
One read-only E2E check of an edited Test Meeting message is pending: after a
message is edited in that chat, read it with GetChatMessage and record whether
`lastEditedDateTime` is present. This proof does not access live Teams or edit
metadata there; missing metadata is explicitly covered by the content-key fallback.
