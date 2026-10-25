# Owner-approved sends (#35, #37, #45)

## Reply marker (I34, decision 45; .46)

`markerFor(text, workflow, by, config)` in runner/send owns the delivered form.
Automatic replies always carry the marker. An unchanged Delegate draft follows
`signApproved`, except during `learnAfter`; owner-authored and edited replies
never carry it. Comparison strips a trailing preview marker and uses the send
path's existing HTML/whitespace normalization against the current draft.
A marker is stripped only as a standalone trailing line or block, not when its
words occur at the end of an ordinary sentence. `withMarker(required=false)`
removes the suffix rather than treating its presence as permission to sign.
The existing correction caller therefore gets the unsigned form; ack and
reminder paths retain the default required marker.

Successful workflow sends and acknowledgements log catalogued `marker`
metadata with item code, `applied` and `why` (`auto`, `approved`, `owner-edit`,
`owner-text` or `off`). No reply content is in this metadata event. HOST owns
the corresponding event hooks after successful correction and reminder sends
in apply/automations, using `owner-text`/false and `auto`/true respectively.
The page only previews the delivered form; New owns its paired I34 editor/footer
change. Stored drafts and sent history are not migrated. Final consent,
revision, claim and last-await source checks remain in place.

The PE-approved send contract keeps the page's exact-revision guard first.
Owner intent checks may use only the warm host's optional one-shot `quick` API,
never a cold CLI or the item's session. Rule sends retain their stricter checks
and never use the relaxed intent check.

## Stale Send anyway (decision 47)

Decision 51 carries the actual private 0.2.45 release (`b37d9356`) into the
reviewed SEND line without replacing its earlier `0730e90c` merge history.
The released PR-join helpers stay in runner/work; approval classifiers stay in
core/vote-claims and retain runner/work's compatibility exports. The telemetry
catalogue keeps both reply-marker and PR-anchor-conflict metadata. Generated
files are rebuilt from the combined source, not resolved by choosing one side.
This carry-forward does not change the consent or final-send checks below.

A page override consents only to the held digest shown on that card. New passes
the intent's `reviewed` into `Answer.sendReview`; the send dispatcher never
replaces it with the workflow's current digest. Missing or stale consent cannot
override a current hold, even when the page revision still matches because
intake has not yet stored the newer source message.

Editing a held reply restamps only the previously reviewed reasons for the new
draft. Unreviewed reasons retain their old digests and are not included in the
edit's new consent digest. Page sends perform a final fresh `threadSince` and
`heldSend` after all other asynchronous checks, immediately before calling the
external send. New related messages keep the draft and the updated hold with
"Not sent: Kim wrote again after you looked. Check and send again."
An owner reply or a reconciled earlier send also stops this final send.
The two reads share intent-check results only within that send, keyed by the
exact before/after messages, editions, draft and owner context. An unchanged read does not
consume another five-second model budget; any changed input is checked again.
If a final pass makes a new judgment, read the thread again before sending.
Continue until a pass uses only cached judgments. If that final recheck phase
takes five seconds, keep the draft and announce that the chat must be checked
again; never send on an unsettled or timed-out final pass (CR 02:50 B1).

Typed chat overrides bind to `holdNotice.digest`, the last hold announced by a
successful non-page refusal notice, never the current workflow digest. The
notice includes the held messages or edit and records its digest and time only
after delivery. Without a notice, or when its reasons have changed, Send anyway
refuses with a fresh notice; another confirmation can send that exact hold.
Clearing a hold for a new turn or draft also clears its notice. Both page and
typed chat sends make the final fresh check (PE 06:25 decision-47 addendum).
That ruling changes the existing fictional proof expectations: a chat override
after a page-only hold update or an unannounced no-reply result first gets a
notice, then confirms it. The send proof's automatic-send fixture supplies a
known internal membership response and checks the writer's active rule ID,
without bypassing either production authorization check.
PE 07:10 supersedes the earlier committed-proof request: keep the current-digest
and late-source reproductions outside the repository in Temp, run them on the
exact integrated stage, and record the commands, counts and outcomes in the
private release evidence. Add no proof journeys or P0 scenarios.
If a source read omits a stored,
unreviewed hold, that absence cannot clear it or grant consent. Keep the reason
bound to the current draft and show it again; an exact subsequent confirmation
can still send. A confirmed source deletion keeps its existing close behavior.
The E2E report's in-flight-poll explanation is plausible, not an established
cause. Only the exact integrated 0.2.45 stage can satisfy the browser gate.

This is a 0.2.45 release gate and applies to the same send path shipped in
0.2.44. A delay does not authorize a hotfix automatically: a narrower cut needs
a fresh Coordinator decision, CR review and both the page's reviewed-digest
transport and the engine checks together. Engine-only deployment fails closed
for held page overrides without that field. The fixed path is carried into
0.2.46 by merging the reviewed 0.2.45 chain, not rebasing or making a separate
port (decision 51). The extracted `runner/send.ts` retains the exact reviewed
`heldSend` and `send` bodies; the dispatcher retains the merged consent
transport. The extracted approval gate is unchanged. The merge resolution
requires CR review and the existing isolated decision-47 checks before any
0.2.46 SEND staging or further send-path/module-move work.

## Unknown membership (R34)

The first successful Teams members response per process records `members-shape`
as metadata: the union of member key names, counts of roles arrays/undefined/other,
only the known role enum words, and the number of nonempty tenant ids. No member
ids, names, emails or tenant-id values are captured. The source factory routes
the engine capture through `Store.log`; standalone adapters use stderr.
This probe does not relax the existing membership checks.

Automatic reply/ack decisions and standing sends record a membership wait only
when the audience is unknown and no guest/outside member was found. Organization
rules that cannot match an unknown audience also record that wait if a verified
internal audience would permit sending; this comparison never grants permission.
`state/membership-waits.json` deduplicates the held chat ids across restarts.
One `membership-waiting` health line shows the count without names or ids:
"Automatic replies are waiting: Delegate couldn't verify who is in 2 chats."
A clean membership read removes just that chat, including a read that positively
finds a guest; the last removal clears the line. Cached verified reads also clear
stale waits. Owner-approved sends and fail-closed authorization are unchanged.

## Forwarded-message shape capture

The first `forwardedMessageReference` attachment converted by a Teams source in
each process records `forwarded-message-shape` through the source logger.
It records field paths and value kinds only, including parsed JSON content;
no message text, sender, ids, timestamps or URL values are logged. The capture
is bounded to four levels, 32 keys per object, three array entries and 80
distinct path/kind pairs, with a truncation flag. Invalid JSON is recorded as
`invalid-json`, never as raw content or a parser error containing that content.
Keys outside `^[A-Za-z_][A-Za-z0-9_]{0,40}$` become `<key>`, so id-keyed
maps cannot disclose ids or emails. The once flag is set before inspecting or
logging the attachment. Capture failures emit a content-free stderr note and
never stop intake or retry the diagnostic on the next message.
Chat and channel reads share this capture. Conversion behavior is unchanged;
preserving forwarded text and links awaits the observed shape and PE plan.

## Vote-claim words

Approval detection matches whole vote words, not `approver` or `approvers`.
Future, conditional, negated and requested votes retain the existing non-claim
treatment; named reviewers keep their own classification, including `Kim approves`.
Remaining vote wording defaults to an owner claim, so unusual claims such as
`Just approved it` or `Gave my approval` never bypass the vote check.
Auxiliary/adverb prefixes such as `Have` and `Just` are not reviewer names.
The page and Send guard share this classification, including on edited drafts.
`APPROVAL_WORD` exports the non-global pattern from core/vote-claims for page
highlights; consumers needing global matching clone its source, not its word list.

## Untitled group chat places

Teams listing, lookup and gap-search results never name an untitled group or
meeting chat after the last sender or its id. Titled chats keep their title;
untitled groups fall back to `Group chat`. A one-to-one prefers the other
member's cached name when the owner id is known and exactly one other member is
cached; otherwise its existing fallback remains. Listing and gap search read one
cache snapshot each, without extra Teams calls or writes.

`groupChatPeople(store, chatId, ownerId, askerId)` in runner/sharing reads only
the existing members cache. It returns `{ names, count }` for the other members,
excluding the owner and asker. Names are first names, with a last initial when
first names clash; `count` includes cached members whose names are unavailable.
Unknown names return undefined; no remaining members returns an empty list.
New owns the card/row/source wording and truncation, not this data helper.
For these names and sharing's person labels, trailing parenthetical suffixes are
removed and `Last, First` becomes `First Last` before taking names/initials.
The shared `personName` export in core/format also normalizes the cached
one-to-one counterpart name; New can use it before taking headline first names.
No membership fetch, permission change or stored-title rewrite is performed.

## Structured work left for the owner

The pure vote classifier lives in core/vote-claims; runner/work keeps
compatibility re-exports during the ownership split. PR reference helpers
remain in runner/work until HOST's separate reference-helper move.
The send path and reply context live in runner/send; runner/apply retains
compatibility re-exports and calls the extracted helpers for owner answers.
The shared owner-answer receipt writer remains in runner/apply.
`okSendGate(store, cfg, wf, answer)` returns `{ refuse?, voteChecks }`.
It preserves the self-chat vote omission and Settings refusal order;
`refuse` carries the receipt text and refusal flag. HOST's dispatcher presents
that receipt and stops, or continues with live PR/deploy checks. It does not
merge LeftDraft records.

core/left-lines exports `LeftDraft`, `LeftKind`, `LeftAction`, `LeftSource` and
`LeftLine`, plus pure `leftRefusal(action, kind, details)` and `leftPromise(quote)`
constructors. A refusal requires its kind; producers supply action data, never
an id or a source. HOST owns workflow merge, stable ids, sources and clearing
in `Workflow.left`. Legacy strings are not parsed or migrated.

`core/setting-keys.ts` exports the Settings row namespace (`SettingKey`), its
static keys, and `settingKey(entry)`: a static entry stays unchanged, while a
catalog change becomes `change:<entry>`. Settings rows and refusal producers
share the helper; worker refusals validate the same namespace, including
dynamic `read:<tool>` and `allow:<tool>` rows. The Settings module re-exports
the type and helper for page consumers. New owns opening and focusing
`#settings/<key>`; producers never infer keys from copy.
Existing row keys, labels and save behavior are unchanged. Stored refusal
metadata is not rewritten; new worker output with an unknown key fails schema
validation rather than creating an unresolvable Settings target.

`vet.left` and `prepareEffectCalls.left` expose the refusal records.
`effectRefusal` returns the code-owned denial record; the existing `refusal`
string API reads its reason, preserving the send/execute gates. Settings
refusals carry the actual `change:<entry>` key (or `deployTo`); lifecycle,
incomplete, other-PR, old-invite and deploy refusals are classified where the
gate rejects them, never from their explanation. `deployBusyLeft` is the pure
constructor for HOST's deploy-busy branches. `leftText` generates the legacy
chat/status line from a record and preserves promise quotes. `vet.todos` instead
keeps the exact 0.2.45 `<effect.summary>. Not made for you: <why>` text alongside
each draft, including changes excluded by a deploy. The summary distinguishes
different refused changes; the legacy text is never parsed back into records.
`LeftAction.key` is required. Exact calls use a SHA-256 of tool plus recursively
key-sorted arguments, excluding only top-level transport correlation fields
`requestId`, `clientRequestId`, `correlationId` and `traceId`. PR, thread, build
and pipeline run ids remain significant. Missing calls use a whitespace-normalized
summary; promises use a whitespace-normalized quote. A refused comment carries
its first payload line in `action.quote`. Display quotes are verbatim prefixes,
clipped at a word boundary to at most 200 code points including the ellipsis.
Every quote carries code-assigned `quoteBy`: `delegate` for a refused comment,
`owner` for a promise, otherwise `asker`. Keys use the full input, never the
clipped display text. Normalization includes the key
when deduplicating, so distinct calls never collapse merely because their
display fields match. HOST includes this producer key in its line id hash.

`prepareReportCalls.left` includes incomplete proposals and folds them into
`Report.refused`, including the option number in the reason where relevant.
The worker report schema accepts structured refusals, including the suggested
reply/destination on another PR. Schema acceptance overwrites worker keys in
code before effect preparation can append code-made drafts. Worker keys are
bounded SHA-256 hashes of the structured refusal tuple and destination hrefs;
the generated suggested reply's wording is not identity. The full worker
quote survives repeated MCP/schema validation so recomputation is stable;
`normalizeReport.refused` clips its display quote without changing the key.
`normalizeReport.refused` retains kind, action,
settings and reply metadata, with compatibility `what`/`target`/`reason` display
fields generated from that record. It keeps `reply` and `pr` link fields only
for HTTPS URLs on dev.azure.com, a visualstudio.com subdomain,
teams.microsoft.com or teams.cloud.microsoft; otherwise it drops that field,
not the refusal line. Old prose remains plain content, not a
typed refusal or an inferred button. No new golden rows are added; legacy
report expectations reflect the deliberate removal of copy classification.

Regression (PE-approved): a pre-0.2.46 failed job with only a free-text refusal
now reads as an unknown failure; Try again leads while repeats are below two,
then Write. Current refusal producers write to the typed `todos`/`refused`
fields, not `job.error`. New owns switching G96 to a structured refusal fixture
in the same 0.2.46 stage, keeping its expectation that a current refused change
does not lead with Try again. No legacy copy parser or migration is added.
Additional legacy regressions from removing copy classification: to-dos retain
their raw engine reasons; tool-bearing reasons can sanitize to the same
"Review this step yourself." line and deduplicate. Legacy refusal context can
appear as informational review findings, while a "Refused change" fact keeps
its warning tone. Structured `refused[].reason` now uses the plain cause rather
than the removed friendly-wording translator. These display changes do not
authorize a change. HOST's merge and New's structured rendering must land in
the same stage before shipping new refusal lines.

HOST must consume these arrays when applying reports, choices and preparation
results and generate workflow ids/sources/lifecycle state. SEND does not
write `Workflow.left` or change the card-state/projection/rendering ownership.

Worker reports carry the question alone and optional `questionHint.answers`
for page chips. Normalization retains supplied metadata and ignores orphan
hints. Text rendering composes `Answer "A70: yes"` from the item code and suggested answers;
an empty hint uses "your answer". Old command-bearing questions remain unchanged
and are never parsed into hint metadata. HOST owns report application (copy
the hint with a question, clear it for previews and replaced questions),
engine-generated questions and the remaining lifecycle writers.
`normalizeQuestionHint` is shared with text rendering: answers become one
trimmed line without double/smart quotes, backticks or invisible format/joiner
characters, at most 60 Unicode code points and three
case-insensitively distinct answers. An item code anywhere, or a control verb
as the first word, drops the answer rather than repairing it. Both checks run
again after clipping, so truncation cannot create a code or command. The question
remains visible. HOST can use the same helper at its application boundary.

## Rule-governed job results

Catalog version 3 adds optional `when.results: true` to send grants. Ordinary
send grants do not cover completed review/investigation results. This permission
requires the existing line confirmation, with a version-3 grant and matching
text hash; old grants are not reinterpreted or widened. Read-back names review
and investigation results explicitly. Restrictive draft/ignore/ack/shortcut
rules still participate in the strictest matching decision; review permissions
remain in their existing review lane.

SEND exports `decideResult(store, cfg, wf, reply, facts)` from runner/autosend.
`ResultFacts` is code-owned completion data: destination `chatId`, the current
workflow `revAt` as `turn`, vetted `effects`, all report/vetting/refusal `todos`,
optional question/blocker/goalMet/context, and, for reviews,
`{ review: { pr, head } }`. HOST must first stamp the current turn and verified
review basis on the workflow, merge current effects/questions/to-dos and work,
then decide. No rule can override pending effects, unresolved/kept to-dos,
questions, a blocker, goalMet=false, Not reached context, an unverified review
basis, another destination or a stale turn.

The existing policy/authorization chain still checks membership, guests/outside,
caps, holds, confidence, promises, gaps, votes and secrets. Result mode relaxes
only the blanket open-work hold, not other safeguards. Quiet hours hold results;
delivery retains dueSends' owner-presence check. An ordinary send grant leaves
the result with `No rule sends results in this chat`. Ack/ignore decisions retain
a draft rather than acknowledging or dropping a result.

HOST integration contract: persist these facts per parent workflow as
`job.result.sendFacts[wf.id]`, beside the exact result reply, before the scheduled
send can be processed. The existing sendAt/dueSends and final automatic Send
check re-read the facts and rules through automaticDecision. A changed result
reply in that turn waits; missing facts on old results fail closed. There is no
upgrade, repair, scheduling of old results or new sending path. HOST owns
finishWork's call site, scheduling, persistence, receipt and nudge; New displays
the policy reason/read-back. SEND's API alone does not enable result sending.

## Structured failures (R31)

`normalizeReport` exposes optional structured `failure.cause` for the page's
failure-word table. An engine-stamped document failure, or an existing stored
content failure on the failed-card path, is classified only by the shared
canonical document-failure parser; stopped failures name
`run-stopped`. A known step can carry a structured retry time. Other free-text
errors do not acquire a guessed step, target, HTTP status or reason. Existing
structured causes survive normalization; Details keep the existing why/tried.

## Rule-line lifecycle (R12a)

`Store.rules()` reads `activeRuleGrants(root)`, a read-only reconciliation of
the current markdown and compiled line records. A changed or missing source
line cannot keep an old grant alive after it has a bound source. Every new source line appears as Reading;
the read does not repair files or infer approval. Legacy recorded approvals
are kept only for capabilities already supported by those rules, not newly
supported organization sends. Trusted learned/style metadata and grant ids
survive page edits and compilation.
Legacy bindings trim and collapse whitespace, while hashes retain the exact
source text. In a legacy file without line records, a confirmed, non-off grant
that passes the existing legacy predicate (non-widening, named accounts, or an
organization review grant) is also kept when its generated text does not match
the prose. Each such grant has its own confirmed `carried` line, with its
original id, action and scope, never unbound and never sent for compilation.
No historical edit check is invented: the old file has no reliable source hash.
Unsupported widening and other unbound compiled rules remain inert Waiting lines;
the reconciliation writer logs `rule-migration-unbound` with each rule id once.
Read-only views do not write logs or repair files. An actual edit to an existing
line still clears its compile and confirmation, including whitespace-only edits.

Unmatched legacy prose is kept as notes, not rule lines. It grants nothing,
does not enter the compile lane and does not duplicate the carried grants.
Migration and compile reconciliation write only the compiled record, its notes
and the source hash; the original markdown bytes are unchanged. The first
owner-initiated write keeps each note's text verbatim under a marked notes
heading that `ruleSourceLines` skips, and materializes the carried source lines.
After that, those lines follow ordinary source-edit/deletion checks.

New's notes contract is `wayNotes(store): WayNote[]`, with `id`, exact `text`,
`textHash` and a boolean `review` for the PR-review-specific not-on notice.
Show the notes once in a collapsed "Your notes from before (N)" block, outside
the normal line list. The list is what Delegate does; notes change nothing.
For review notes: "Not on. Make it a line to have Delegate review PRs this way."
`makeNoteLine(store,id,expectHash)` atomically removes the note and returns a new
Reading line through the normal compile/confirmation lifecycle.
`deleteNote(store,id,expectHash)` removes only the note. Both use the central
writer and refuse stale ids/hashes without granting anything.

All page mutations use the central non-spinning writer and compare the exact
current line text hash inside its fresh-read lock. An unrelated hand edit is
preserved rather than making every page write fail forever. Page add/edit and
inline answers never call setup's explicitly confirmed `writeRules` path.
Widening grants wait for `confirmLine`; narrowing applies when read. Off keeps
the confirmation, so the same confirmed words resume without another approval.
Delete retains a hash-checked Undo record; restoring it preserves its previous
approval and holds, rather than silently granting new authority.

HOST's compile-priority lane calls `rulesToCompile(store)` and then
`finishRuleCompile(store, id, expectedTextHash, rawOutput)`. The first reconciles
source drift through the same writer, including heading-only edits; the second
fresh-checks identity and text, validates structured output and refuses stale
or invalid completion. Both return no guessed permissions. Can't-yet/Partly
lines are read again after a catalog change. Previously supported narrowing
constraints stay active during that re-read; widening stays inert, and changed
compiled permissions clear approval. Identical compiled meaning can keep the
same recorded approval across a catalog update.

`ways.ts` builds each three-line read-back and status from this data. Its
`readBackLabel`, `readBackValue` and `statusText` are separate fields; the page
never needs to parse copy. `setting` is the bound Settings key for both actual
rules and redirects; only `redirect: true` means the latter. `ruleIds` supports
the Done filter and seven-day `byRule` counts, cached with the snapshot.
Conflicts describe overlap on both lines independently of the winning grant;
the existing strictest-wins policy still decides the action.
`linesToCheck` counts Waiting and Unclear without scanning usage logs, separately from the one open habit
suggestion in `needsHim`. Suggestions and their dismissal history now come from
HOST's `habitSuggestions`; dismiss, Undo and Reconsider call HOST's transitions,
without duplicating its timers or evidence rules. The displayed suggestion hash
is checked before Add it or dismissal. An unchanged Add it calls HOST's
`answerHabitResult` and retains the actual consent time and trusted metadata.

`addSuggestedRuleLine(store, text, {learned, style?, ruleId})` is the trusted
writer handoff for edited suggestions. It preserves the original grant id and
provenance, but creates only an unconfirmed Reading line. It does not accept the
habit or turn on the original rule. Edited `acceptSuggestion` checks the displayed
suggestion id and text hash, refuses blank words or edits to an already accepted
suggestion, then passes the edited text to HOST's `answerHabitResult`. HOST owns
the transition: writer refusals leave the habit unchanged; success accepts the
edited suggestion and returns its unconfirmed Reading line without activating
the original grant. Unchanged acceptance keeps its existing consent path,
including suggestions to remove a drafting style.
`undoAcceptSuggestion(store, id, expectHash)` takes the added line's id and
`textHash`, not the suggestion's H code. It checks the current learned line under
the shared rules-writer lock, then calls HOST's `undoAcceptHabit` with its trusted
habit key. HOST restores the exact saved pre-acceptance state and removes the
whole learned line atomically. Its refusals (including expired, edited, repeated
or stop-style acceptance) are returned unchanged; a stale line/hash or busy
writer is refused without changing anything. This Undo is not a dismissal and
does not advance the Not now/Never history.
Learned records are grouped by their habit key, so a multi-grant compiled line
survives unrelated habit writes without duplicate line ids or lost grants.
Legacy removal of one of its grants removes that habit's whole line.
UI wiring and the compile lane remain separate New/HOST handoffs.

Review-context labels starting with CI and coverage (also CI and test/code
coverage) are live status, alongside Live votes and Newest builds. A Coverage
label alone remains eligible to describe a code finding. Read-time normalization
omits them only from PR-review context facts; findings, trackers, non-review
items and the review gate's Not reviewing fact remain unchanged.

## PR vote claims (L1)

`changeSays` supplies only the action, location and text for lists and statuses.
Unused call arguments remain in `shown().detail` for Details, never appended to
the one-line form (R34). Previously stored statuses are not rewritten.

In self-chat, a bare `ok <code>` leaves every pending PR vote out of both the
item and its job before approving the remaining changes. Numeric selections
alone do not name a vote. The existing `ok <code>: vote` explicitly consents
to the shown vote; `ok <code>: Approved` (and the other named vote values)
consents only to that exact value. Negated, conditional, numeric or other
free-text bodies do not consent. No new command aliases are introduced.
The page's exact-revision actions are unchanged.

The omitted vote is retained as an unchecked effect with
`offReason: 'self-chat-ok'`, never marked made. Both effect lists retain that
reason, so editing a held reply cannot lose its omission notice.
An owner-send check survives delayed execution and is copied to sent checks,
history, status and the final receipt: "Your vote on PR 123 wasn't cast:
a plain ok never votes. Vote on the PR." Sending a reply does not create a
new vote-only action or promise a later self-chat approval command. Existing vote-claim checks
still hold a reply that falsely says the omitted vote was cast.

PR-review replies wait unless an explicit review rule covers them and the reply
is built from comment receipts. Replies mentioning approvals or votes always
wait for the owner. `decide()` and `whyWaited()` use the same
core vote-word detector; the runner re-exports it without a core-to-runner import.
Scheduled sends re-evaluate this policy before sending.

`aboutPr(store, wf, text?)` is the shared, read-only PR-context test exported
from `runner/apply.ts` (R18): an engine PR reference, PR-review intent, or a PR
link in the reply, last ask or asker's stored thread. New can import it instead
of maintaining a separate projection copy.

`isNonAdoPrLink(url)`, exported beside `voteSentences` in `runner/work.ts`,
recognizes HTTP(S) PR paths using `pull`, `pull-requests` or `merge_requests`,
including non-Azure enterprise hosts and PR subpages. Azure DevOps cloud hosts,
non-PR links and invalid URLs return false. It is a pure URL test, not a vote
claim or permission check. New combines it with `voteSentences` for the
uncheckable-vote warning; it never blocks an owner send or grants an auto-send.

## Rule-authorized PR comments and replies (R10a)

`reviewRuleFor()` is the shared matcher for policy, waiting reasons and the
named `reviewCommentHook` handover in `runner/jobs.ts`. Rules may narrow the PR's
reviewer groups; live eligibility still comes from `review-gate.ts`, never
from the rule. Settings writes the standard English line through `writeRules`,
marks it `source: 'settings'` with a text hash, and preserves its text on Off.
Multiple review rules are toggled together and shown as Custom.

Setup and Settings rule writes use the central `store/rules.ts` writer. It takes the
non-spinning `withRecordWriteNow` lock on `rules.compiled.json`, then starts
a fresh read of that file and `rules.md`. Existing-line edits compare the
exact text hash inside the lock; a changed source or line returns
"This line changed; your text is kept". Contention returns
"Delegate is saving another change; your text is kept. Try again."
Neither refusal writes a file or waits for the other writer on the page thread.
Both source and compiled writes are atomic file replacements under that lock.

`writeHabitRules(store, rules)` is the trusted habit-writer handoff. It changes
only learned rules, preserves current owner/Settings rules and pending line
records, keeps style/learning metadata, and refuses a changed source instead
of rebuilding over the owner's newer words. HOST must check its `{ok, why}`
result before recording acceptance or dismissal; until HOST switches its
`setRules` entry to this helper, the habits integration is not complete.
Per-line compilation, confirmation and the Settings facade are a later step;
the lock/writer foundation alone does not activate that interface.

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
