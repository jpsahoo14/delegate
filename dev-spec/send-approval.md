# Owner-approved sends (#35, #37, #45)

The PE-approved send contract keeps the page's exact-revision guard first.
Owner intent checks may use only the warm host's optional one-shot `quick` API,
never a cold CLI or the item's session. Rule sends retain their stricter checks
and never use the relaxed intent check.

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
