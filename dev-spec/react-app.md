# React preview

## A person answering the owner is a Catch up line, never silent noise (queue-new #18)

The reply prompt (`reply.md`) says a person writing to the owner in a 1:1, or answering his own message, is never noise: with no
reply needed it still gets an `fyi`. As a backstop, a run that closes such an item with nothing (`intent: none`, no reply, no
`fyi`) gives it one (`answersOwner`: any 1:1 message from a person, or a group message right after the owner's own within a day;
senders named like bots are left out): "Kim replied · no reply needed" with their words as the gist, logged `fyi-kept`. Fictional
root, stub worker (quota) that always reports intent none with no reply or fyi: a 1:1 "thank you! sorry, wrong person" after the
owner's message and a group "got it, thanks Robin!" right after his message became Catch up rows in New and Classic Done; a release
bot's post and group chatter ("lunch anyone?") stayed silent.

## A session history that differs between machines resolves itself, quietly (queue-new #16)

When the synced copy of an item's AI history and a machine's own copy are not prefixes of each other, the machine holding the
runner lease (it runs the items) keeps the other copy once and makes its own history the shared copy, so later backups move
forward and no run writes another conflict file. Another machine keeps its copy once and notes it. Conflict copies are named by a
hash of their content (`events.conflict-<hash>.jsonl`), so the same history is never saved twice. The note is one plain line,
"Item A1's AI history differed between two machines; Delegate kept both and continues on <runner>", shown in Settings › Updates and
system › More, never as a banner; it clears when the runner resolves it, and each pass clears notes that no open item or job uses
(`pruneSessionNotes`). Fictional root, two fake machines (two Store machines, two COPILOT_HOMEs in Temp), stub worker (quota): the
other machine wrote one conflict copy over two runs and the note; the page had no banner and Settings showed the line; the runner's
backup made its history the shared copy, kept the other copy once and cleared the note; another run wrote no new conflict copy;
a seeded note for an unused session was pruned (`session-note-pruned`) while the open item's stayed; New and Classic Home showed no
banner.

## An item the owner answered in Teams shows his own reply, not Delegate's unsent draft (queue-new #15)

`card()` (view.ts) now checks how a done item closed: when the owner replied himself (`closedBy: replied`, not sent by Delegate),
the card carries `ownReply` (the owner's message that answered the ask, else his last one, with its time and Teams link) and
`unsent` (Delegate's draft). It drops the draft, the question, the choices, the share hold and warning facts, which were all
about a draft that never went. The card shows "You replied in Teams · <time>" with the owner's words, Reopen only under ⋯, and
"Delegate's draft (not sent)" in Details. Fictional root, stub worker (quota): with Classic's focus view open on an item that had
a draft and a share hold, the owner answered in Teams (a Teams reply to the ask); the card then showed "You replied in Teams ·
12:18 AM" with his words, no "Your reply to Kim", no draft, no answer box and no "Need to know" warning, and Details showed the
unsent draft. An item Delegate sent keeps its sent reply and gets no `ownReply`.

## A message on open work is news: no "No news" right after the owner replies (queue-new #13)

`ownerStep` now moves open work's `checkAt` to now plus 3 days, and `due` takes the newest activity (the last step, or the last
message in the item's or its parts' threads, from anyone) as news: within 3 days of it the check moves to that time plus 3 days
and does not fire. "No news … since" quotes that newest activity. Once per store, `repairNoNews` sends a "No news" question
that was asked after newer activity back to open work, checked again in 3 days (`repair-no-news`). Fictional root, stub worker
(quota), times moved by rewriting the stored times: with the check date 6 hours past, the owner's reply kept the item open with
the next check in 3 days; 4 days later with no messages exactly one "No news … since <reply day>" card appeared, and the next
check added none; an A39-shaped item went back to open on load, logged; New showed "Waiting on you · 0" and Classic "All clear".

## A PR review card shows code facts only: no builds, no votes, no warnings (queue-new #8)

The review prompt (`job.md`) now says: when reviewing someone else's PR, do not read or report builds, checks or CI, and do not
report the owner's own or his reviewer group's vote; another reviewer's blocking vote may go in `summary` as one plain line; only
the owner's own PR notes its newest build on a recheck. As a backstop, `finishWork` drops a review's context facts about builds,
pipelines, checks or CI and about votes (`reviewNoise`), and makes the rest `info`, so they never force must-see; a watch (a job
with `every`) or the owner's own PR keeps them. The card now shows info facts in a "Found on PR N · Author" block (they were not
shown before); warnings stay at the top. Fictional root, stub worker (quota), stub review job returning four warn facts (two code
findings, "Live votes and dependency", "Newest builds"): the item kept the two code facts as info, was not must-see, and the card
showed 0 warning lines and "Found on PR 4800001 · Alex Chen" with the two findings in New and Classic at 1280; a watch job kept
all four, including the build blocker, as warnings.
## bug 10-22 Classic Settings chips were reset to the page top

Classic's shell now follows the same screen/sub-route boundary as New. A
Settings section or key owns its own scroll and focus, including direct links;
the parent no longer schedules a later scroll-to-top over it. Other screen
changes still reset and focus main, and Ongoing section links keep their
existing section-scroll path.

Section and row targets use the rendered sticky section-index height and its
CSS top inset, plus a12px gap. This avoids the generic section80px scroll margin
overriding the Settings offset, and keeps headings and focused deep-link fields
below all chip rows when the index wraps on narrow screens. The existing
open-fold and preventScroll focus behavior is unchanged.

Edge fictional-root proof at1280light/400dark: all five chips selected and
placed their headings12px below the sticky index (about117px/181px from the
viewport top), without a second jump. pollIdle direct links and cold reloads
opened the advanced fold and focused the exact row at the same offset. Browser
Back/Forward retained section navigation. Home and plain Settings/Ongoing
screen changes returned to0, with main focused; Ongoing/running still scrolled
to its section. Zero config changes, setting/action submissions, overflow or
browser errors; no AI or owner data was used.

## A PR review leaves spec questions to the PR's author, and names its PR on the card (queue-new #10)

The review prompt (`job.md`) keeps `question` for what the owner alone decides (approve with a thread open, review at all) and
sends a product or spec choice to the PR's author as a proposed comment. As a backstop, `finishWork` turns a review report's
`question` that offers a choice between options and asks nothing of the owner (`specChoice`) into a proposed comment on that PR,
addressed to its author (`prAuthor`, saved at each PR read): "Alex, should grandfathering cover …". Items from a PR job carry
`prLabel` ("PR 4800001 · Alex Chen"), shown in "Delegate needs to know", in warning facts and in the changes heading. An ask about
a different PR than the open item's own opens its own item (`join-refused`, by intake). Fictional root, stub worker (quota), stub
review job and PR reader: the A48-shaped review question became "Ask Alex on PR 4800001: …", a change under "When you send", with
no "needs to know", in New and Classic at 1280; "Approve with the open thread … unresolved?" stayed the owner's question, headed
"Delegate needs to know · PR 4800011 · Alex Chen"; a second PR asked in the same 1:1 became its own item.

## A join needs a shared subject; parts never bring other PRs; related asks show their chat (queue-new #9)

`joinWhy` decides every join of an item into another's work: the same typed link (an item about a PR the home is not about never
joins), or the same chat and asker. The worker's `partOf` goes through it, and a home whose own ask names no link takes no worker
join; a refusal is logged as `join-refused` with the reason. `homeNamed` matches only the home's own links (its asks and its PR
job's key, `ownLinks`), never links its parts brought, and a message naming another PR as well does not join. A part's report
never adds a second PR to a home that has one. When a card's asks span several chats, the list says "N related asks" and each
line shows where it was asked ("1:1", "in Web check-in"). Once per store, `repairParts` detaches parts that share no subject with
their home, keeps their state, drops the links only they brought, and logs `part-detached` per part. Fictional root, stub worker
(quota) reporting `partOf`: an ask about another PR from another chat was refused ("it is about PR 4600099, and A1 is about PR
4600001") and a later mention of that PR elsewhere did not join; a home with no link of its own took no join; a same-PR ask from
a group joined and showed "2 related asks" with "1:1" and "in Web check-in" in New and Classic at 1280; an A48-shaped root (a 1:1
home with a PR job and 6 parts from 2 other chats) came out as the home alone with its own PR, 6 parts detached, nothing sent.

## A failed AI run is a reason on the card, never a question; setup failures wait and re-run (queue-new #11)

A run with no result sets `runFailed: { at, kind, why }` instead of the old "Check this item, then answer or skip it" question.
The card shows "Delegate couldn't draft this at 11:51 PM: the run stopped without a result." with Try again as the primary
(re-runs the item once), "Write the reply yourself" (opens a reply editor and sends the owner's words), Later, and Skip under ⋯;
no answer box. Sign-in and missing-CLI failures join model and quota as agent holds (`agentSetupFailure` kinds `auth` and
`cli`, tried again every 10 minutes), so a setup failure keeps the item in Working with the reason and re-runs it when the hold
clears. Once per store, `repairRunFailures` re-queues open items with the old question whose last logged worker error is a setup
failure (`repair-requeued`), and turns the others into a failed run with its reason. Fictional root, stub worker (quota): a
"model not available" failure kept the item in Working, then it ran once more after the model changed; repair re-queued exactly
the 7 setup-failed items of 9 (once only), left the content failure as a reason and the done item alone; the no-result card
showed the reason and time with Try again, which re-ran once and showed the new draft, and "Write the reply yourself" opened the
editor, in New and Classic at 1280 light and 400 dark.
## bug 10-22 Classic Focus queue clipped beside a short card

The desktop queue is a sticky viewport-height flex column: its heading does not
shrink, and the remaining list area owns scrolling with a zero minimum height.
The column clips overflow rather than letting off-screen queue rows enlarge
the document; only the inner list is a scroll container.
The Focus grid reserves the same minimum height independently of the card.
Only desktop Focus uses the matching 16px bottom inset; the old 96px page
padding would push the sticky column above its top boundary at document end.
Narrow layout is unchanged, including not mounting the queue at <=960px.

Before the fix, Edge1280x1400 with25 fictional asks placed the short-card queue
heading above the viewport and ended its list near794px at document bottom.
This is a layout boundary repair, not another virtualized-list implementation;
the shared ViewportList and its target/keyboard behavior are retained.

Verified in Edge with25 fictional asks, short and expanded long cards, and
document top/middle/bottom at1280x1400 and1280x800 light. The queue stays
at80px (81px at initial layout), its list ends16px above the viewport bottom,
and the last row is reachable through the inner scrollbar. All52 j/k and
left/right-arrow navigation steps kept the selected row in view. At400x860
dark the queue remains unmounted; both card shapes scroll as before, with
no horizontal overflow, browser errors or item submissions. No AI was run.

## A50: no vote the backstop would refuse, nothing half-made, groups the owner confirmed, and changes made without an AI run (queue-new #7)

(A) Each PR read re-gates a vote already on the card (`regateVotes` in `probePRs`): when the owner's role is outside
MAY_REVIEW, the vote leaves the card (item and job alike) for a to-do with the reason and is kept as `heldVotes`; it comes back
when a later read lets him vote. With role "none", Add me is offered. (B) Before a non-vote change in an approved batch,
`makeChange` reads every vote in it (`batchVoteBlocked`); if one cannot be cast, nothing else is made ("Not made: it was
approved together with …"). (C) `owner.reviewerGroups` / `owner.notReviewerGroups` (full "[Org]\Group" or short name) count in
`ownerRole`; Settings › You and your replies › "Your reviewer groups" edits them; a PR group in neither list is asked about once
on the card ("Are you in …? Answer yes or no"), and the answer is saved and the PR read again. (D) Each change made or refused
is a work step ("Made: … (ref)", "Not made: … (why)"), and a card whose approved batch partly ran shows "Done: … Not done: …"
above the actions. (E) An approved batch whose changes all carry their exact call is made in the same pass through
`makeChange` (`executeDirect`, run marked `direct`), with no AI run; a batch with any change lacking a call keeps the change run.
Fictional root, stub worker (quota), stub PR reader, stub tool-server caller: a vote proposed while the owner was a direct
reviewer left the card with the reason once only an unknown group reviewed the PR, and the card asked about that group (New
and Classic at 1280); ok then made nothing; "yes" saved the group and brought the vote back; ok made the comment and the vote
(69 and 85 ms after ok) and sent the reply within 0.2 s, with two "Made:" steps and no AI run; a PR with new commits before
the batch made nothing; a batch whose second comment failed at the server showed "Done: comment on PR … Not done: …, ADO
500 …" in New and Classic. Note for the test phase: tests that drive the change run through `procs.start` for fully specified
changes now take the direct path.

## A reply is checked against Azure DevOps only when it claims a vote; several PRs are each checked (queue-new #12)

Before #12, any reply with "approv" in it (or any reply to an approval ask) went through the owner-vote check, so a review that
withholds approval ("Not ready to approve. …") was held when the owner is a reviewer only through a group, and a review of three
PRs was held with "no unambiguous PR link". Now `approvalClaim` decides: the owner's own approval or vote (`claimedVote`), a named
reviewer's approval (`othersApproval`, #6), or nothing. Withholding, conditional and future words claim nothing and go with no PR
read; proposed votes keep their own checks before they are cast (#7). The PRs a claim is about (`claimedPrs`): numbers in the
claiming sentences, else every PR the ask named when the reply says "all three", "both" or "each", else the item's one PR; each is
placed by its own link (`prRefFor`: ask, thread, work links, the draft's and job's sources, a vote's call) and read on its own. A hold
names the PR: "the reply says PR N is approved, but your vote there is No vote", "does not say which PR it means; the ask names
PR A, PR B, PR C", or "no link to PR N was found to read it (found links for …)". Fictional root, stub worker (quota), stub PR
reader: a withholding review with the owner in a group only sent once with no PR read; "all three look ready for approval" on
three PRs sent once with no read; "I approved all three" with one vote at 0 was held naming that PR; with all three approved it
sent after three reads; "I approved it" on three PRs was held asking which; a PR with no link was held naming it; "Priya has
approved" kept #6 (sent at 10, redrafted at 0); "I will approve once the build is green" sent with no read.

## A57: a titled link keeps its URL, and a reply about others' approval is checked against their votes (queue-new #6)

`htmlToText` now keeps an anchor's http(s) address after its text when they differ ("Pull request 1741355: … (https://…/
pullrequest/1741355)"); a link whose text is its own address is unchanged, so every send-matching comparison (both sides go
through `htmlToText`) stays the same. `prOf` also takes the project and repo from a full link to the same PR number in the
draft's or the job reply's sources, for items stored before this. A reply whose every approval sentence reports someone
else's state ("X has approved", "approved by X", "… approval is still pending") no longer needs the owner's vote: the reviewer
named closest before "has approved" must have voted 5 or more, and "pending" needs an active PR not yet approved by all;
otherwise it is redrafted with the reason. Any first-person claim keeps the strict path. Fictional root, stub worker (quota),
stub PR probe: the A57 shape (ask stored without URL, draft sources with it, owner not a reviewer, Priya 10) sent once
after one PR read; the same ask as HTML stored the URL and sent once; Priya 0 redrafted ("their vote … is No vote");
"I approved it." held ("the owner reviewer vote is missing"); an ask naming two PRs held ("no unambiguous PR link").

## Latency (c): how often Teams is checked after activity is a setting, shown honestly

Settings › Updates and system › More has "After activity, check every" (`poll.fastMin`, 0.5 to 5 minutes in half-minute
steps, a comma accepted) and "Keep checking that often for" (`poll.fastForMin`, 1 to 30), next to "Check Teams every"; the
defaults are 15 idle (at least every 5 in work hours) and, after activity, every 1 minute for 10 minutes (owner, 22:30; was
5 minutes). Number fields use `inputMode="decimal"`. A gap under a minute keeps a tenth as slack
instead of 10 s, so 0.5 means about 27 s; a minute or more keeps 10 s. `status.reading.next` carries the schedule's next
check; New's status reads "Checked 10:35 PM · next check in 15 min" and Classic's "On · 0 runs today · next check in 15 min"
("within a minute" or "now" when close, never a seconds countdown, since the page refreshes about every 20 s). Measured on a
fictional root, stub worker (quota): with 0.5 and the resident runner, Teams reads came at 0, 27 and 55 s after activity
(with the default 1: 0 and 51 s); Check now while the runner was waiting read Teams 0.1 s later; in New and Classic at 1280
light and 400 dark, 0.3 was refused ("in steps of 0.5") and 0,5 and 10 saved.

## Latency (a): an approval is acted on in seconds, not on the next scheduler minute

The `tick` command now stays resident for up to `DELEGATE_RESIDENT_SEC` seconds (default 50; 0 turns it off), holding the
tick lock. Each second it asks `wakeFor`: a Check now (kick), a waiting answer (respecting back-off and source health), a
job on this machine whose process has ended, or a due check. On one, it runs a tick at once (forced for a finished job).
Inside a tick, jobs an answer approved start in the same pass (`startJobs` right after the early and the late
`applyAnswers`), not one tick later. Measured on a fictional root with a stub worker (quota), approving a drafted change
with a reply: before, the change was made after 63 s and the reply posted after 120 s (two scheduler passes); after, the
change was made after 4.1 s and the reply posted after 4.3 s (3 s of that is the stub change run).

## Latency (b): drafts run in a pool, not in batches

`dispatch` keeps `maxParallel` runs going (default 3) and starts the next queued item the moment any run ends, instead of
waiting for the slowest run in a batch of three. Measured on a fictional root with a stub worker (quota), six asks seen in
one pass, one run of 6 s and five of 1 s: before, the three asks behind the slow run were drafted after 7.2 s (p90 7.3 s);
after, they were drafted at 2.2 to 3.3 s, and nothing waited on another item's run.

## Card redesign, part 4: real-data shapes (designer-card-redesign.md S9)

A long message shows 6 lines and "Show the whole message (N characters)", opened in a box that scrolls past 360 px; above
20,000 characters only the first 1,800 reach the card (the row shows 200), with Open in Teams for the rest. A reply over
400 characters shows its count under the box. Details shows the first 5 sources, then "+ N more"; "Progress: X of N steps
done" with the goal, the open steps (▸ the current one), who does each and where in words, and the done steps folded with
✓ and no strikethrough; "What happened, newest first", 4 until "Show all". Item codes and raw references (part:, job:,
sent:, owner:) are turned into words or removed in the projection. A decision the owner must make has its own block and
box ("Your decision (Delegate continues from it)"). A holding reply reads "Holding reply to <name>, in <chat> · says you
are on it; not the answer yet" with "Send holding reply". A PR review gets "Delegate's review of PR <n>" (verdict, the
PR line, each finding), then the reply to the chat, then "On PR <n> (Azure DevOps)" with a checkbox per comment and for
the vote; the primary says all of it ("Send reply, comment and approve", "Send reply and comment" without the vote).

## Card redesign, part 2: the Now list (designer-card-redesign.md S3, with S8's row time)

Sections are "Waiting on you", "Delegate is on it · N now · M in line" (running and in-line rows; rows waiting on Delegate
never sit in "Waiting on others"), "Waiting on others" and "Catch up"; the summary reads "N need you · Delegate: A now,
B in line · C waiting on others". A row is three lines: who · "in <chat>" or "1:1 chat" · when they wrote (S8 compact,
warning color past 2 working days) · ↗; their message; then what you'll do with it ("Your reply:", "Holding reply:",
"Your step:", "Delegate needs to know:") or Delegate's headline and reason. No code is drawn (tooltip only), no row has
a free-text box (your step has Update), "Draft a reply to" reads "Delegate will draft a reply to", a group message's chip
is "Posted to everyone", and one being judged reads "Delegate is checking whether <name>'s message needs you". These are
React-projection changes; today's pages keep their wording. Reply rows keep Open, not Send: a row shows one line of the
reply, and the owner's rule (10-21) is that a reply is sent only from where its whole text is visible.
S8 in New: rows, the card head and Done rows show when the person wrote in one format (`10:42`, `Yesterday`, `Tue`,
`Oct 12`; "Sent <full date and time>" on hover), from the newest message when they wrote again, else "added <time>";
past 2 working days the time is in the warning color; a row relabels itself after midnight without a reload.

## Card redesign, part 1: the shared card (designer-card-redesign.md S1, S2, S4, S7 terminal rule)

`features/ItemCard.tsx` is the one card for New's opened row and, once the Classic builder wires it (S5), Classic's Needs-you
card. Blocks, in order: their message (avatar · name · "in <chat>" or "1:1 chat" · sent time with the code as tooltip ·
Open in Teams; the bubble; "Show N earlier messages" in place; every warning, never folded); what you'll send (the reply,
editable in place and labelled "Your reply to <first name>, in <chat>", which makes the primary "Send your version"; or
"Delegate needs to know" with Your answer; choices and the meeting; your step with How did it go? and "Draft my update to
<name>"); "When you send, Delegate will also" (changes as checkboxes, to-dos kept, the watch); the actions (primary ·
Later · ⋯ with Edit in Teams, Dismiss, Continue in a terminal); and one collapsed Details line (why, sources, progress,
history, changes already handled, Ask Delegate; it opens while an ask is pending). Several asks in one conversation show
"N asks in this conversation", replacing the "Open item" buttons. "Open on your computer" is "Continue in a terminal",
named "on <machine>" when the runner is elsewhere and unavailable with its reason when no runner reads or the window is
open; `status.reading.here` carries the page server's own machine. `SentTime`, `AsksList`, `firstName`, `whereOf` and
`sentAt` are exported for Classic; `card.css` comes with the card.

## Edit habits: drafts follow how the owner keeps editing (Core 10 J6, pm-edit-habits.md)

Each owner-edited send (never a rule send, never an off-record chat) logs `edit-style` with the kinds code can measure:
shorter, longer, bullets, a greeting added or removed, a closing line such as "Thanks!", and an added link. The learn run
adds tone and language as one optional `style` field. Three edited sends of one kind within 14 days, in 1:1 or group
chats, with none of the last 3 edited sends there going the other way, become one H suggestion. Its scope is the narrowest
the evidence allows: one person, one chat, or every reply; a language is always per person. Kinds found together in a
scope come as one suggestion, at most one new suggestion a day, and a kind turned on, waiting, snoozed or declined is not
offered again for that scope. Turn on saves a learned rule with `style`; the generated Learned block in rules.md shows
it; Settings › What it knows shows it with its words editable (Save style), Remove, and Undo during the undo window.
Editing against an accepted style 3 times offers to remove it.

Guard (Engineer check): a style rule never decides. `decide()` skips it, so it can't shadow a send, ack or ignore rule;
`suggestions()` ignores it. Only the drafting prompt reads it, and only the styles that fit the item's person or chat.
Proved with stub workers (quota) on fictional roots: the spec's checks 1-7 (including Robin's style not reaching Kim's
draft, Edit, Undo, and the negative cases), a style rule listed before a send rule for the same person still sending
exactly once, and Settings Turn on, Save style and Undo in New and Classic at 1280 light and 400 dark.
## bug 10-22 Classic image labels exposed internal media keys

MessageBubble, thread text, asks lists and row previews hide only the internal
inline key inside an image marker. The label remains, such as "[image: Acme
chart]". Ordinary inline text is unchanged. Stored asks, thread lines and media
keys are untouched, so the worker can still open the original image.

## bug 10-22 E73: saving signature text changed approved-reply signing

An unchanged signature save is a no-op, including the default text while
config.signature is absent. A changed signature captures the current effective
signApproved value rather than changing it implicitly. Legacy custom-signature
configs keep their existing effective value; only the explicit signing setting
changes that choice. The help no longer promises an implicit switch-on.

## bug 10-22 Classic Daily summary help had no Settings path

Keep today's help-only summary template and chat wording, but link directly to
Settings / Daily summary (summaryAt). It closes the chooser and focuses the
working setting; it does not create an automation or change its schedule.

## bug 10-22 E82: an existing pasted message still offered Make an item

Classic's missed-message field reuses the server's link lookup before offering
creation. An existing message names its item and offers Open; lookup failures
are explicit, not assumed absent. The action also rechecks exact chat/message
identity before saving, protecting a race or an older page. A successful save
has one result, not both an inline duplicate and the page-wide receipt.

## bug 10-22 Classic question with an existing draft

The shared card always exposes Your answer for a real pending question, even
when an old draft remains after a refused invite. Draft reply is the primary
until the question is answered; a reply is not sent while collecting that answer.
Explicit owner editing and work-decision/holding-reply paths remain distinct.

## Classic S1-S5/S8/S9: one card, shared messages and sent times

The adapter also passes the matching placement when this item is its actor,
just as New does. Work-step, kept-to-do and Track primaries therefore retain
their actual action context. Edge1280/400 showed the same primary/labels in
both experiences and queued exactly one "Issues found: 403" work answer.

- ClassicCard is now only a routing adapter to ItemCard, including multi-ask
  navigation and retained snapshots; no second card layout, editor or action
  mapping remains. Classic keeps its shell, queue, tabs and feedback rows.
- Shared ItemCard has an explicit read-only snapshot mode: no action buttons,
  editable reply or Ask submission is mounted. Local Details/thread folds remain
  usable. The existing pin/revision resolver also accepts Classic's visited
  fallback, preserving exact-revision safety and retained text.
- Classic queue and Home use shared sentAt/SentTime instead of creation time;
  queue codes move into time tooltips, with message then chat on separate lines.
  Ongoing and Done use MessageBubble and SentTime for messages and activity,
  while keeping their existing watch, Undo and feedback controls.
- Signed AI replies show the canonical sendText in the shared editor; changing
  it is still an owner edit, with no second signature. Huge queue/Home previews
  are bounded to 200 characters, not merely visually ellipsized.
- Edge1280light/400dark: normalized shared card DOM was identical; signed
  preview, retained stale edit/disabled Send, snapshot0actions/0editable fields,
  four-part ask switching, scroll-limited long message and 1,801-character huge
  bubble passed. Owner edit sent once exactly; Home Watch made1watch, Needs me
  reached Needs you after a stub draft, controls0tabs/body1target, no overflow/errors.

## Classic S5/S7: direct Teams links and shared accessible hover text

Final coverage includes labelled local feedback controls (visible labels win
over longer ARIA names), the App version select, tab counts and Ongoing
interval/code hints. All use the same map and matching hidden descriptions.

- Approved design: direct Open in Teams in the card head, plus sibling external
  links on queue/Home needs rows, never nested anchors or item submissions.
- Local buttons use the same hover map as action buttons, retaining explicit
  item-specific text. Every hover has matching hidden description text. Plain
  Send/Cancel/Close stay without unsolicited titles. Hint covers chips/links.
- Exact-blocked approval uses the stale disabled reason, not an input hint.

## bug 10-22 E08/E40/Core10 J2/J8: unrelated asks reused another home

- Before: Robin's incident 5091 message entered his PR 2203 home while its
  goal and plan still described the review. A worker `same` also let Rex's
  fresh ask enter Ria's hour-old failed item.
- Same-sender identity and most-recently-updated are no longer join evidence.
  A deterministic join needs a unique recent candidate and matching typed
  entity, substantial topic evidence, or a real reply link without a conflicting
  entity. Ambiguous messages become their own visible item immediately; their
  ordinary worker may resolve same-ask ambiguity after intake, not before.
- Eligibility uses the latest owned inbound message, never a background save.
  Thirty minutes, a failed job/run, a previous send, or an incompatible entity
  blocks a worker join. An AI `same` cannot override these boundaries; FYIs and
  intent-none reports cannot join asks. Work homes keep their own plan/steps.
- If a worker supplies only an invalid `same`, one bounded redraft omits the
  other candidates; a repeated invalid join becomes an explicit owner question,
  not an infinite retry or an empty successful result.
- A valid cross-sender join updates the quoted ask and primary asker to the
  newest owned inbound message, retaining the earlier askers for mentions.
  Every successful join invalidates the old approval/send time.
- Observed with a stub worker, both experiences at 1280 in Edge: Ines kept one
  item for floor and room; Robin's incident got its own code and the old review's
  goal, done-when and three plan steps were unchanged; Rex and a fresh ask beside
  a failed item stayed separate even when the stub proposed `same`. Intake
  persisted all four messages in 86 ms before worker dispatch. One explicit
  send per experience quoted Ines's newest room ask exactly, with no duplicate.
  A valid Kim join made Kim's new ask the quote and retained Ines as an asker.
  No browser errors, overflow, real AI or new owner sessions.

## bug 10-22 R4 J8: an automatic reply sent an unfilled blank

- The reply playbook previously required `____` for missing facts. It now asks
  for the missing fact in `question`, or reports `goalMet: false` with a blocker;
  a sendable reply has complete supported words. The report schema and shared
  worker gates say the same thing.
- A shared gap check covers underscore runs, standalone XX/TODO/TBD, bracketed
  missing/insert/fill markers, angle/brace gap slots and double-brace templates.
  It does not treat ordinary Markdown, URLs, type comparisons or JSON objects
  as blanks. Missing attachments remain covered by the existing source gate.
- Draft scheduling and due-rule sends hold in Needs you with the existing worker
  question, clear approvals/send time, and log `rule-held-gap`. Direct Send and
  OK refuse with "This reply still has a blank: fill it or edit" before changes
  are approved; the last send gate checks again, including the signature.
  A filled owner edit still waits for its own explicit Send.
- The same check covers automatic acknowledgement text and each due reminder's
  actual outgoing text. A reminder with a blank pauses without incrementing
  its count, records the reason in Health and logs `rule-held-gap`.
- Observed in Edge, New and Classic at 1280: stub blank held with the worker's
  original question, zero posts; direct Send returned the stated refusal.
  Answer to preview to owner edit to Send posted exactly the edited text once.
  A legacy scheduled blank moved to Needs you, a reminder paused at count zero,
  and OK on a blank with changes approved nothing and made no external reads.
  All twelve gap-marker shapes were detected; seven ordinary text/code/link
  shapes were unaffected. No real AI, browser errors or new owner sessions.

## bug 10-22 E79: AI quota and unavailable-model failures looked like item failures

- Classify the provider's monthly-quota/402 and unavailable-model failures as
  account setup, not per-item retry failures. Keep a durable configuration-
  scoped hold and shared Health reason. New drafts, questions, promise checks,
  reminder judgments, owner-reply judgments and background jobs wait together;
  ordinary approved/rule sends do not depend on AI availability.
- Copilot workers use their own `--log-dir` beneath the existing local run
  folder. Classification reads only that run's logs, including the provider's
  actual `retry_after_ms` (milliseconds) or `retry_after` (seconds), never another
  session's old logs. The banner says about how long remains, or omits a time
  when the provider gave none; it never invents one.
- A provider retry time or changed AI configuration releases the hold. Changing
  a model does not reuse an old model's failure. Raising an external budget
  alone is not observable while runs are paused; an AI configuration change
  also permits a fresh try before the provider's retry time.
- Work jobs wait queued with the actual reason and without spending per-job
  retry attempts. An execute run without a report keeps its existing safety
  behavior: disarm its approval and require review, never replay a change just
  because the budget or model changed.
- Placement distinguishes AI availability from the reader and send availability:
  queued AI work is Waiting, while a scheduled reply can still go out. Both
  card styles use the existing attention surface for the exact setup reason,
  and row Next text names the quota retry time or unavailable-model wait rather
  than promising "next cycle". Classic Ongoing marks these rows Held instead
  of drawing a running progress bar.
- Manual acceptance: real-process quota and model-error stubs, both experiences
  at 1280 light/400 dark, no repeat starts while held, and resume after changed
  configuration or the provider retry time. No real AI or owner data.
- Observed: each error affected an already-started reply run and background job;
  subsequent dispatch/job-start calls started zero processes. Work stayed
  queued with no transient retry, ordinary approved send posted once, and
  changing the model or reaching the exact retry boundary released three
  waiting runs. All 16 card captures showed the actual reason, no generic
  failure, no horizontal overflow and no browser errors; zero new owner sessions.

## bug 10-22 R2 J1: owner-reply AI failure blocked Send and left stale Health

- Before: an unrelated owner FYI plus a real-process stub returning HTTP 402
  left the draft unsent with "Sends wait", even after an explicit owner OK.
- Send now uses reply-target evidence, normalized whole-draft matches and saved
  ask-specific judgments only. It never starts an AI classification on the
  critical path. An unknown judgment informs in Health; it does not bypass
  any ordinary send gate, or block an approved or rule-authorized send.
- Intake also recognizes the owner's draft text without AI, including a
  surrounding message, but not a word fragment or words inside an old quote.
  An exact match is closed as "You sent it yourself".
- Unknown checks retain the unquoted owner words and the exact ask revision.
  Existing failed checks retry on the next cycle even with no new owner post;
  successful checks, or having no relevant open checks left, clear Health.
  A newly failed check is not immediately repeated in the same cycle.
- Manual acceptance: a 402 stub, an explicit Send once, a rule send once,
  owner-text and reply-link duplicate prevention, and recovery in one cycle,
  through both React experiences on isolated fictional roots. No real AI.
- Observed in Edge at 1280: each experience posted one explicit reply and one
  signed rule reply; replay and the second rule attempt posted nothing. Exact
  owner posts at intake and pre-send used zero classification runs, with no
  duplicate send. The warning was visible before Send and absent after one
  successful recovery cycle (333/213 ms with the stub). A legacy refusal also
  cleared in one cycle without changing thread order or the approval revision.
  Zero browser errors and zero new owner Copilot session entries.
- Follow-up: the pre-change approval path also uses this non-gating fallback;
  it had retained the old unknown-check refusal. Existing actual-owner-reply,
  changed-message, exact approval, write allowlist and change-ledger gates stay.
  In Edge, both experiences accepted the explicit approval with an unrelated
  owner FYI and queued only the allowed change, with zero owner-check AI runs.
  An exact owner post instead closed as "You sent it yourself", with no approval,
  change or duplicate post. No real external effect was run by this proof.

## PR-review gate: review or vote only when asked and a reviewer (owner rule 10-23)

A PR review job (the worker's `pr:` job, `jobForRecheck`, or the forced recheck) starts only when someone asked the owner
to review this PR (his own answer or message counts; a room message must name the PR), and the live PR read shows him
as a reviewer: by name (required or optional, not declined), or in a reviewer team he belongs to (`core_list_project_teams`,
`mine: true`, cached hourly per project) whose vote is below approved. Never on his own PR. Otherwise the item says why
(`reviewDecline`), with no job:
- not on the list, team approved, or a group he can't be matched to: "Add you as an optional reviewer" as its one
  change (`update_reviewers`, add only `owner.upn`, refused in `refusal()` otherwise). Once made, the review starts;
- his own PR, or declined in Azure DevOps: a question, no Add me;
- PR unreadable: held; the 10-minute PR check restarts it when the PR can be read, or when he becomes a reviewer;
- a room message: closed quietly with the reason.
The owner's own "review PR N" (or "review <PR link>") in the self-chat counts as asked and reruns the open item about
that PR; with no such item he is told how to start one, never left without an answer. A team that already approved
reads "Not reviewing: your group already approved PR N".
Votes follow the same rule: one from a reply run becomes a to-do with the reason, a review job's vote is dropped when
he is no longer a reviewer, and `make_change` casts no vote unless the PR read right before it shows him as a reviewer.
With no Azure DevOps reader set up, only the ask check applies (no vote can be cast there).
Proved on fictional roots with the real tick, stub workers and a stub PR reader with reviewers and teams; the page
shows the decline with its reason and Add me in New and Classic at 1280 light and 400 dark.

## E98: New's automation chooser matches today's New

Today's New reaches its automation chooser (Remind someone, Watch something, Daily summary) from the automations
address, and from Back on the reminder form. Its "+ Remind someone" opens the form directly. React New did the same,
except that the address opened the reminder form. The address now opens the chooser in both experiences.
Proved on a fictional root in New at 1280 light and 400 dark:
- `#automations/new` opened "New automation, step 1 of 2" with the three choices.
- "+ Remind someone" opened the form (step 2), and Back returned to the chooser.
- No automation was created.

## reminder recipients: real people in test chats, never "[as Name]" personas, and an empty list says why

The reminder recipient list (and `findChat` for a typed name) skipped test chats entirely, so test runs had no
one to choose and no reason shown. A test chat is a real chat. Its group chat, or a real person in a 1:1, can now
be chosen. A "[as Name]" persona (id `test:*`) is never listed or matched. When the list is empty, the page says
why and when people appear, and mentions personas when that is the reason. The note is shown in the shared reminder
sheet ("Send to") in New and Classic.

Proved on fictional roots in New and Classic at 1280:
- **Real people and groups:** a test group chat played with personas, a persona 1:1 and a real person's 1:1 offered "Pat Real" and the group, never Kim or Ines. `findChat` resolved Pat and the group, and refused Kim.
- **Personas only:** the list was empty, and both sheets explained why.

## bug 10-23 E08: a same-asker follow-up in a group chat started a second item

Ines asked the owner by name (A9537, drafted), then followed up in the same group chat without naming him. A message
that doesn't name the owner skipped routing and went to group judgment, which started A9545 beside A9537's
half-answering draft. Now such a message from someone who already has a live item in that chat joins it, decided by
code before any judgment (reason "same asker follow-up"). Like any ask that joins, it withdraws an ok and marks the old
draft with "1 new message" while it is redrafted with both messages. Unaddressed messages from others still go to group judgment. A draft written
by the inline run now also resets the new-message count, as a job's draft already did, so the mark clears once the new
draft covers the message.

Proved on a fictional root with real intake and dispatch, a stub source and a stub worker:
- **Join:** Ines's follow-up joined A1 (2 messages, running, the old draft marked "1 new message" in New), and the redraft prompt had both questions.
- **Redraft:** the new draft answered both, with the mark cleared, in New and Classic at 1280.
- **Control:** Paz's unaddressed question still started a group-judgment item.

## legacy E16: an invite stored in the old meeting shape, made or refused with a redraft offer

An invite proposed before calendar calls were converted is stored as `{ subject, start, minutes, attendees }`.
- **Converted at execution:** `makeChange` converts it with `toolShape`, so the owner's calendar tool gets exactly `{ subject, attendeeEmails, startDateTime, endDateTime, timeZone }` in UTC, in one call.
- **Refused when it cannot be converted:** `refusal()` now checks the converted shape, and `inviteShapeProblem` names the gap: no readable start, no subject, or old fields left. This runs at approval and at execution.
  - The refusal happens before any call: nothing is created, and the reply (which says the invite was sent) is not sent.
  - The item asks one question: answer to have Delegate draft the invite again.
- **Card:** the owner's own refused approval carried no typed words, so the card now adopts the new revision with the offer, never the stale banner. A refusal of the owner's typed words still keeps them.

Proved on a fictional root with a stub calendar MCP server that has the real CreateEvent schema, approving from the page in New and Classic at 1280:
- **Readable start:** the legacy invite made exactly one call, with `startDateTime 2026-10-26T06:00:00`, `endDateTime 06:30:00` and `timeZone UTC`. Then the reply was sent once.
- **Unreadable start:** zero calls, no reply, the card showed the reason, the redraft question and Draft reply.
- **R3 checks:** still pass in all four.

## spec S6 and S7: no loading view on a switch, and one hover text per control

S6:
- Every view's code is listed once (`data/views.ts`).
- `components/preloadable.ts` renders a view directly once its code is loaded. React's lazy fallback, and its 300 ms throttle, never show for a loaded view. The choice is fixed per mount.
- The page loads its first view with the data, the rest of its experience once the page arrives, and the other experience when the browser is idle, at most 3 s later.
- A switch before that code arrives keeps the screen, dimmed (0.55) with a small spinner, until it does.
- The page query is not fetched again when the other experience mounts.
- Classic's unscoped `.experience-choice` rule is scoped to `.classic-experience`, so loading Classic's code early never restyles New's header.

S7:
- `domain/hover.ts` is the one map from action kind (or label, for row actions) to hover text. The server's `meaning` wins.
- `[clause|fallback]` segments drop cleanly when a value is missing. Send, Cancel, Close and other self-explanatory labels get none.
- The shared `ActionButton` sets `title` and an `aria-describedby` hidden copy, so New and Classic say the same thing.
- A disabled button says why: "Pick an option first.", "Type your answer first.", "Changed since you looked…", a busy, expired or submitted state, or "Offline: reconnect to act." first when offline.
- New's chips and codes use the exported `chipHover` and `codeHover`. Classic can use the same exports for its own chips.

Proved on the owner-store copy, navigation and hover only:
- The other experience's code loaded within 4 s, both ways. Switching drew with no "Loading" text and no extra page read.
- With Classic's code delayed 3 s, a switch kept New dimmed and showed no Loading text.
- First tab switches took 160–330 ms, down from 360–470.
- Titles equal their descriptions, none has a command, no plain label has one, and every title starts "Offline" when offline.
- On a fictional choice card, both experiences' disabled primary says "Pick an option first.", then "Type your answer first." after choosing Other.

## bug 10-23 R3: the owner's own Draft reply came back as "Changed since you looked"

New and Classic set `interacting` when the owner presses the primary button, and nothing clears it. The owner's own
answer was adopted correctly: the pin was released once its receipt applied. Then the answer field's cleanup edited
the old revision, still `interacting`, which pinned the card again to the snapshot of that moment, where the item
was still drafting. The new draft then looked like someone else's change: Classic showed the stale banner over
the old choices with Send disabled, and New kept the card without Send. Now a card is pinned only at the revision
on screen, so a late edit to an older revision never pins a newer one. New also shows today's "New draft from your
answer. Not sent yet." line under a preview draft, as Classic does.

Proved on a fictional root in a live session with no reload, using a stub worker, in New and Classic at 1280 light
and 400 dark. Other answer → Draft reply → the answer is applied (drafting) → 5 s later the redraft lands. The new
draft shows with Send and the line about 1.4 s later, never the stale banner. A genuine foreign change while the
owner types still shows the stale banner within 0.5 s and keeps the typed text.

## bug 10-23 perf: every tab took 7 s on the owner's store

On a copy of the owner's store (99 MB), the page took 6.4 to 7.7 s and Settings 6.5 to 7 s.
A CPU profile named one cause: each page re-read every proposal file once per proposal.
`pageManagementRev` and the learned-row check call `store.proposal(code)`, which reads all 232 files each time.
`byCode` reads all 114 items the same way. Settings built the whole page only to name its chat actions.

Fixes:
- A page request reads inside `readScope`: each file is read and parsed once per request, and lists come back as copies.
- Between requests, a file is read again only when its time, size or file id changed (every write replaces the file).
  Outside page requests (the runner) nothing is kept, and any write clears the request's reads.
- Knowledge cards are parsed once per request.
- Git is asked for the version in the background, never on a request.
- Settings names its chat actions without building the page.
- In the React app, the first page read starts with the script, together with the first view's code. The app renders as soon as its code arrives, instead of waiting out React's 300 ms fallback throttle. The other views of the same experience load after the first page.

Measured in-process (warm): page 6.8 s → 0.17–0.2 s, Settings 6.9 s → 4–15 ms, Numbers 63–84 → 30–40 ms.
A cold first page now takes 0.4–0.6 s.
In Edge, New and Classic at 1280 and 400: first load 0.69–0.81 s, every tab switch 68–470 ms.
Page, Settings and Numbers bodies are identical to the old code's on the same store.

## bug 10-23 E40: a promised check-back re-pointed another subject's failed watch

A reply promising to check back on an incident re-pointed the item's existing PR watch
to the incident, while that job stayed failed with no next check, so nothing ever ran.
Now a promise about another subject starts its own watch job; a failed or stopped watch
is replaced, not reused; and every watch it leaves has a next check (an update keeps the
earlier next check, or sets one). The item gets a step that names the replaced watch.

The PR watch had failed because its CLI worker ended 44 s into the run, in the middle of
a read-only tool call, with no output and no report (not ended by Delegate). One check
like that failed the watch for good. Now a check that ends without a result is a missed
check: the watch checks again in 15 minutes, the item gets a step that says so, and only
three misses in a row stop it, with the reason on the item. Proved on a fictional root
with a stub worker. The promise starts its own watch, which runs at once, then not at 239
minutes and runs at 241. A missed check is retried, and three misses stop it with the
reason. New (card) and Classic (Ongoing, In progress) show it at 1280 light and 400 dark.

## bug 10-23 E97: `u` undid the wrong reply in a live session

New and Classic picked the first done entry with an undo in object order. A page
delta appended the newly sent A1 after older rows, so `u` undid A9. The shared
snapshot now carries `lastUndoId`, the undo action of the newest undoable done entry
by time, and both experiences use it. A page delta also carries a table's server
order when a merge would not keep it, and the client rebuilds the table in that
order. Proved on a fictional root in a live session with no reload (New and Classic,
1280 light and 400 dark): after sending A1, `u` undoes A1 and A9 is untouched.

## bug 10-23 E16 (addition): an invite claim without an invite, and a free slot with no invite

A reply saying "I've sent the invite" is sent only after the invite is made
(the change runs first), but when the invite failed or was left out, "send
only the reply" could still post the claim. send() now holds any reply that
says an invite went while the item's invite is not made, with why on the card
and receipt. Before ok, the card lists the invite under the changes and offers
"Make 1 change and reply". An explicit ask to book or send an invite, for a
free slot too, must carry the invite change: the playbook says so, and a run
whose draft only agrees ("works for me") gets a question to redo it with the
invite (invite-ask-unmet). Proven with the stub calendar MCP with the real
schema: a real worker on a free Tue 16:30 booking offered "Book the requested
time" with the invite (attendees, time, 30 minutes), 0 writes before ok; a
reply-only stub got the question; a failed invite's reply-only send was
refused in New and Classic; one ok still makes one CreateEvent, then the reply.

## bug 10-23 E60/E83: Done lost an open item's sent replies, and group rows had no Teams link

(a) Done listed an item's reply only while the item was done or open with a
send. After A9801 reopened for a follow-up ask, its two logged rule replies
vanished from Done (no Replies filter), while Numbers counted "2 of 2 replies".
Done now also lists every logged send (owner or rule, not reminders) that no
listed item shows, from the send log: an earlier reply of an item that is open
again, or an earlier reply of the same item. Its words are the sent words, its
link is the sent message, and it carries no feedback actions (those act on the
item's current reply). (b) Teams links were never built for test chats, so the
real G3 group's rows had none. A test chat whose id is a real Teams chat or
channel thread now links like any other; a made-up demo id still does not.
Today's pages share the same view, so they gain both too. Proven on a fictional
root: React New and Classic at 1280 light and 400 dark, and today's New: All 4,
Replies 2 (both "by rule R9801", each "Open in Teams"), Catch up 2 with links;
Numbers says 2 of 2.

## bug 10-23 E17: an inline screenshot never reached the worker

A screenshot pasted inline (<img src="data:image/png;base64,…">) became
"[image: alt]" with no link, because only Graph hostedContents links were kept,
and a new item's history stripped images entirely. The worker could not open
it and could fall back to knowledge (a polluted card said "A999 and it's
okay"). Now intake keeps an inline data-URI image in the store (state/media,
by content key) and the thread line reads "[image: alt inline:<key>]", which
image_read opens. An image with no link that can be opened is marked "(it
cannot be opened here)". The reply playbook says to open images before
answering from them, and when one cannot be read, to say so and never describe
or guess it from knowledge. Proven with the real Copilot CLI worker (isolated
COPILOT_HOME, zero owner sessions), a real PNG rendered in Edge and a planted
"A999 and it was okay" note: the worker opened inline:<key> and drafted
"ACME-4821 … Blocked, waiting on the Globex certificate"; an unopenable image
got "I can't read the screenshot here. Could you paste its text?". New and
Classic at 1280 show both drafts.

## bug 10-23 E16: a booked invite could never be created

The worker copied the meeting payload { subject, start, minutes, attendees }
into the calendar CreateEvent call, and the tool rejected it ("Unknown argument
'attendees'; parameters: subject, attendeeEmails, startDateTime, endDateTime,
timeZone…"), so no invite could be made. Every proposal now goes through
toolShape (in vet, and again right before the call): the meeting shape, or
offset times, become { subject, attendeeEmails, startDateTime, endDateTime,
timeZone: 'UTC' } with the end at start + minutes. Before any write, the
change run reads the tool's own input schema and refuses unknown or missing
arguments without calling it, with the tool's parameter list as the reason.
The reply playbook names the tool's arguments and says the reply tells them
the invite was sent (it goes after the invite is made), never asking them to
send it. Proven with a stub calendar MCP with the real parameters: the old
shape is refused uncalled; picking "Book 11:30 IST" shows the mapped call in New
and Classic; one ok makes exactly one CreateEvent with exactly those arguments,
then one reply. A real worker run drafts "I've sent an invite for 11:30".

## bug 10-23 E36: an explicit recheck was answered inline, and claimed a recheck

"Freshly recheck and re-review PR N if ready" was answered by the reply run as
status_next_step with a drafted reply. jobForRecheck needs intent pr_review and
no reply, so the review job never ran, while the draft and work step said
"Rechecked the live PR state" from the runner's status read only. Now an
explicit recheck, re-review, review-again or approve-if-ready ask (not a
negated one) on an item with a PR goes to that PR's review job, whatever
intent or reply the reply run gave (log recheck-routed). Its draft is dropped,
and its work step says the review is running instead of claiming a recheck.
The prompt also says the runner's PR facts are a status read, never a review.
A job saved as done drops any old error. Proven with the real Copilot CLI
(isolated COPILOT_HOME) and a stub read-only ADO server: the reply run drafted
inline (hadReply), was routed, the review job ran, and New and Classic show its
fresh not-ready result with no vote proposed; a stub inline status report is
routed the same way.

## bug 10-23 E11: merged test asks lost their speaker, and a merge dropped an asker

In a test group the owner speaks as others with "[as Name] …". Only classify()
rewrote that; a new item's thread history (create()) kept those lines as the
owner's, and joinInto kept the destination's copy of a joined message over the
source's rewritten one. So joined asks read as the owner's own and were closed
with no draft. Now asSpeaker() rewrites history lines too, and a joined message
keeps the line of the item that owns it. Separately, a merged item recorded
every asker, but the prompt told the worker only to answer the marked lines, so
it answered the newest asker. The prompt now lists each asker's unanswered asks
and requires the reply to name and answer each one (or ask the owner). A
placeholder question ("None.") is dropped, so it no longer hides Send. Proven
with the real Copilot CLI worker (isolated COPILOT_HOME, zero owner sessions):
"[as Mei]" and "[as Omar]" asks merge into one item with both lines theirs and
the draft "@Mei and @Omar, … room 4.2"; Rita's two questions plus Lucia's get a
draft naming and answering both. New and Classic at 1280 offer Send.

## bug 10-23 E88: the first 500-row redraw cascaded at 400 px

The first update after load committed up to four times: the data commit, then
a ResizeObserver measurement (setMeasurement), a frame's range update, and a
re-measure of rows newly in range. At 400 px rows wrap, so estimates miss
more and the cascade showed (17.8/13.4/18.8/15.1 ms). ViewportList now reads
the drawn rows' heights in the layout effect of the commit that drew them,
and works out the range from those fresh offsets synchronously (at most three
passes a frame, then the next frame). A measured height no longer re-renders
by itself: spacers only stand for rows not drawn, so only a range change needs
a commit. Measured on the same fixture in Edge (5 runs each): New 400 dark
3.5-7.4 ms, 1280 light 3.5-7.6 ms, mostly one commit, never a cascade. Direct
target, j, focus kept offscreen, end of list and Classic's queue target are
unchanged against the build before.

## bug 10-23 R4: a lost MCP answer re-sent a rule reply

The MCP client reconnected and called the tool again after any session-lost
error (-32001), sends included. A Teams post that landed before its answer was
lost was posted twice. Now only tools on a read allowlist (List*/Get*/Search*/
Find*/Read*/Fetch* and known Azure DevOps reads) are called again. Any other
tool reconnects and throws LostResponse, never repeated. A Teams send then reads
the chat (or channel replies) back: our exact words, posted since the attempt,
are recorded as that message id; not found, the item is held: "Not sure it was
sent; check Teams…", on the row (Why) and both cards, and no rule, retry or
tick sends it again. A change run's lost write keeps its "calling" record
(may have been made, not repeated); a vote is decided by reading the PR again.
Proven with a stub Teams MCP on a fictional root: post-then-drop gives one post
and its id recorded; drop-before-post gives one call, no post, held, with no
resend over three ticks; React New and Classic at 1280 and 400 show it.

## bug 10-23 E33: a Claude tool with no Claude Code name was retried 3 times

With flavor claude and a read tool like "fictionalreader", the adapter's error
was wrapped as "Could not start <full CLI path>: Error: …" and cut to 160
characters, losing the tool name and "no known Claude Code name". The
setup-error match then missed it, so the start was retried 3 times and counted
3 AI runs. The adapter now throws a typed setup error, worded without the
command path, and the tool names are checked before a run is counted or
started. One shared pattern (SETUP_REFUSAL) classifies every setup refusal
(write tool as read tool, shell in a clone, unknown Claude tool) for runs and
jobs: refused once, never retried, kept whole. The shared row's "Why" note no
longer repeats "Delegate". Proven on a fictional root with the real adapter
and no CLI spawned: 3 dispatch passes, 0 runs, one run-start-refused; React New
row and card and React Classic card at 1280 light and 400 dark.

## bug 10-23 E34: an earlier turn's send blocked the reply to a newer ask

The send gate treated any send kept on the item (`wf.sent`) as "a reply to this
message already exists". Intake starts a new turn (clearing it) only for an
open or done item, so a fresh ask on an item in another state kept the previous
turn's send, and the owner's reply to the new ask was refused. Each send now
records the inbound ask it answered (`sent.askMsgId`); the gate counts it as a
duplicate only when that ask is the item's newest inbound ask or later (a send
recorded before this field: when it went after the newest ask). Proven on a
fictional root in New and Classic at 1280: the new ask's reply sends once; a
second send for the same ask, and a legacy record after the newest ask, are
both refused as duplicates.

## bug 10-23 E33: a run refused at start showed no reason

A write tool listed as a read tool stops the run before it starts: the item
goes to needs_human with status "Could not start: … is never a read tool …"
and no question. The projection carried the status, but nothing rendered it:
New's row said "Answer Kim: <ask>" and the card offered a blank answer (today's
New card even said "Nothing to do"). The shared row now adds "Why: Delegate
could not start: …" (today's New and React New), and the projection puts the
status in the card's attention line, which React New and React Classic show.
Proven on a fictional root with the real start refusal (0 runs): React New
1280 light and 400 dark (row and card), React Classic 1280, today's New 1280.

## bug 10-23 E35 (addition): tags and times are not PR numbers; vote claims are checked

The approval check read one whole bounded statement and counted every number
as a PR id, so a run-tag prefix (and a time) failed it. It now drops a leading
[tag], checks each sentence that speaks of approval on its own, and counts only
numbers written as a PR ("PR N", "pull request #N", ".../pullrequest/N", or a
bare number right after "approve(d)"). Owner words that claim a vote is in
place ("my vote is now Waiting for author", "I approved it") are checked
against the live vote and held with why if it differs; verified owner words go
without a PR re-read redrafting them. Proven with the real worker (isolated
COPILOT_HOME, zero owner sessions), tag prefix plus several sentences, New and
Classic at 1280.

## bug 10-23 E35: the owner's own edited reply was redrafted away

The owner sent "I will not approve PR N until its build is green. …" as their
own words. The send-time approval check (meant for AI drafts that claim an
approval the PR doesn't show) only accepts one bounded sentence, so it rejected
the text, dropped the owner's draft and redrafted, with no word to the receipt.
Now the owner's own typed words go as written; only words that say an approval
is already made ("I approved it", "LGTM") are checked against the live vote,
and then held (text kept, state needs_human) with why on the card and receipt.
Every refusal on this path, including the AI-draft redraft and an unverifiable
PR, now tells the answer why. Proven with the real Copilot CLI promise mapper
(isolated COPILOT_HOME, zero new owner session entries) in New and Classic at
1280: one exact send, no vote, the conditional promise kept as a to-do and a
build watch, receipt "Sent A9001 to Robin."; stub checks for the held claim
(both experiences, card and receipt say why) and the AI redraft receipt.

## bug 10-23 E28: an explicit vote ask ended as a status-only draft

A fresh "set my review vote to WaitingForAuthor" ask on an item whose open work
still said Next "reply that the live vote is Approved; no change needed" (from
a run that briefly read Approved) got a reply that only reported the live
NoVote, with no vote proposed. The worker trusted the stale Next and steps over
the new ask. The prompt now says the runner's PR evidence and the newest >>
messages override older Next, steps and plan, and that an ask to set the
owner's vote, when the live vote differs, is answered by proposing exactly
that vote (or goalMet false with why). The engine also refuses a silent miss:
when a plain, unconditional "set my vote to X" ask gets no pending X vote, no
question, no choices and no blocker while the PR is active and the vote differs,
the item asks the owner to redo it with the vote or skip. Proven with the real
Copilot CLI worker on a fictional root with the same wording and stale context
(New and Classic, 1280 light: one pending WaitingForAuthor vote at the live
head, approve offered, 0 cast, 0 sent), and a stub status-only report showing
the question.

## bug 10-23 E55: a rule reply held while the owner is active said it sends at a past time

When a rule reply falls due while the owner is Available and was active in the
last 10 minutes, the engine keeps it scheduled and sets only its status
("Held: you are active in Teams"). New's row and card still said "Delegate
sends it at <past time>". The shared row now shows a Held chip and "Delegate
holds it because you are active in Teams; sends it once you step away"; the
Classic running row carries the held status as its detail. Proven on a
fictional store: React New 1280 light and 400 dark (row and card), today's
New, and React Classic Ongoing; 0 sends.

## bug 10-23 E26: failed approved run asks for directions, not a stale approve

After an approved change run dies, recovery fails the job and asks the owner
to answer with directions or skip. Today's pages render that as a question,
and the engine refuses ok while a question is open. The projection offered
approve anyway, so Classic hid it and New could expose a refused action.
Do not offer approve while a needs_human question is open (except the
no-draft promise-check retry). The answer reruns; old submissions are
refused. Proven: stale executor marker recovery on fictional data in both
experiences, zero calls/sends, and the Draft reply path still working.

## bug 10-23 E49: stop or extend only a promised check-back

Active work.watch supplies canonical extend-watch and stop-watch actions.
New cards/waiting rows render them; Classic progress receives stop-watch
alongside its existing interval/Extend. Classic RowActions must include that
kind (coordinator notified), not confuse it with classic-close.
A dedicated unwatch owner verb stops only the check-back job: queued work
cannot start, a local running check is stopped first, failed kills retain
it with an explicit reason, and shared/remote runs are not killed here.
Clear the watch pointer and record a quiet step, retaining work, plan,
drafts, effects, to-dos, global control and all unrelated jobs.
Management revision includes the watch id/horizon, so an old Stop cannot
stop a replacement check-back. Extend keeps the existing 7-day behavior.

## bug 10-23 E49: save a quiet watch baseline

The first promised check-back now records its result ref without news or
waking work, and finishCheck persists that baseline without touching the
item's timestamp. An identical repeat finds the ref and stays quiet; only a
new result wakes once. Report merge/done behavior is otherwise unchanged.
Prove baseline, first repeat, genuine change, replay and stop condition
through the real job-result path; work itself never closes.

## bug 10-23 E48: Catch up Watch uses the existing FYI action

Now's structured Watch was incorrectly queued through the done-item guard.
Use the same immediate watchItemTarget binding as Done Catch up, including
default target/until, exact revision, date validation and interruption
semantics. One live watch per FYI, watchFrom=catchup, and watchedAs on the
source; never a message. Existing Done and Classic paths keep the same
binding. Prove New row clicks at both widths and replay without duplicates.

## bug 10-23 E43: retain a completed build's code-read fact

The build probe marks a successful step correctly; mergePlan later erased
done when the worker omitted it. Keep the mark for the same build AND project,
along with its seen state. A new build/project inherits neither; existing
deploy-ring retention stays. Prove baseline quiet, success news once, worker
report omitting done, unchanged recheck quiet, and completed checklists in
both experiences. No new probe or AI run on the unchanged result.

## bug 10-23 E41: owner commitment cards name You

The shared card uses startedBy=owner to name You, rather than treating its
absent external asker as Someone. Both page versions/experiences inherit it;
ordinary named and unknown external askers are unchanged. Prove proposed
owner work at both widths, including Skip without tracking or sending.
The normalized person also retains that owner identity when the row or
history populates it later; their unknown external-asker fallback must not
overwrite the card's You.

## bug 10-23 E37: dismiss a pending retry

Reuse today's card-menu Dismiss on a queued retry in both React experiences.
Skipping cancels an exclusive retry immediately (and a retry which started
before the click), while a failed kill keeps the item open and shared work
needed by another parent continues. Existing skip semantics preserve open
work when only its reply is dismissed. The New retry line uses the rendered
next text/time, not a raw {at} template. Prove both widths/experiences, no
later worker/send, shared-parent preservation and failed-kill refusal.

## bug 10-23 E26: concurrent receipt writes must not lose an approval

Every atomic temp file includes machine, PID and a per-write random identity,
still under the existing .tmp-* ignore/reader convention. A page submission's
prepare/queue/recovery/completion transaction uses its own inter-process lock.
Receipt merges retain accepted, processed, refused and uncertain facts and
terminal detail; a stale prepared/queued write cannot erase a terminal result.
Completion appends its detail against the current record under the same lock.
An ENOENT on persistence re-reads and recomputes instead of failing the answer
on a consumed temporary file. Other I/O errors remain explicit.
Prove simultaneous Windows writers plus a real Edge approval on fictional
data, with stable answer identity, one effect and one reply. No tests.
Measured on Windows: two processes made 4200 receipt update attempts plus
1400 shared-file writes with zero errors. Terminal processed/refused/uncertain
states and detail survived late writes. Two forced lost-temp ENOENT cases
re-read correctly (a stronger terminal result and a needed rewrite).
Classic Edge: one approval, one fictional -5 vote, then one reply; final
receipt accepted/applied, no lost approval, no leftover temp/lock files.

## bug 10-23 worker prompt/config retention

Prompts now have a deterministic private folder beside their own MCP config.
Reply finish (including error/timeout/start failure), detached child close,
job supervisor completion/restart/confirmed cancellation, and Continue close
remove only that run's prompt folder and config. Failed kills retain files.
On a new launch, prune matching prompt/config artifacts older than one day,
including old randomly named prompt folders; keep a verified live owner.
Logs, session history, unrelated files and the store root are untouched.
Cleanup errors are explicit (reply error/console or supervisor health/log).
Prove with fictional Temp files and real child processes, including a real
Copilot worker, without running tests or writing the real root.

## bug 10-23 E90: withdrawn change permission is visible before ok

Both React experiences project the current refusal reason on each pending
change, not only an executor's historic failure. Removing a deploy target
therefore explains on the card why it cannot be made; restoring it removes
that current-permission reason. Check only the selected changes in apply
before any PR/build/ring probe, and keep the executor's permission guard.
The existing exclude/reword/explicit-reconfirm path remains unchanged.
Prove removal after display, fresh and cached cards, zero preflight reads,
zero deploys/replies, and allowed permission still reaching preflight.

## bug 10-23 E88: large changing queues

ViewportList measures actual row heights, reserves scroll space, overscans
three rows, retains focused/open/edited rows, and exposes set size/position.
Small lists stay fully rendered. Resize/scroll range updates are scheduled
on an animation frame; synchronously feeding range changes back through a
layout effect could recurse when opening an offscreen card.
Classic keyboard navigation uses all server ids, not only mounted links.
Visit history is kept without rendering the queue twice on every poll.

The page query ingests once per valid fetch and avoids a redundant deep
comparison. Opt-in ETag deltas (four bounded server snapshots) carry changed
fields, grouped equal changes and referenced values. Unknown/evicted ETags
receive the existing full response; unchanged snapshots still return 304.
The original complete schema validates full pages. Delta shape, base,
references, new/replaced entities and every changed field are checked;
only unchanged, already-validated fields are reused. Clearing an optional
field replaces its entity so old draft/question data cannot survive omission.
No server root or action authorization changes.

Manual Edge proof: all 500 ids remain accessible; only visible/overscan and
retained rows mount. Focus and scroll survive updates; an offscreen private
edit survives scroll, j/k traverses unmounted items, direct A1499 opens its
latest card, and Find reaches A1488 while keeping the unsent row. Existing
visibility-based seen tracking observes actual mounted viewport rows.
Delta/full content equivalence (apart from request clocks), optional
clearing, additions, seven malformed-update refusals, 304 and full fallback
were inspected. The private Ask action still emits only Ask in both UIs.

Performance is improved but E88's strict arrival-to-commit <16ms budget is
NOT yet met consistently on the target PC. Baseline New 66-110ms / Classic
41-54ms; current measured viewport commit is about 4-6ms, full pipeline
typically 17-22ms / 15-20ms with slower cold updates. Do not call that a pass
or substitute the render-only measurement. Keep E88 open for further work.

## bug 10-23 E51: show complete reminder bounds and rotation

Reuse describe(a) (the exact sentence Classic already shows) as New row
context, and the existing projected automation.sentence in its opened body.
No clipping: max sends, end date, all texts and rotation stay visible at
400px too. No new controls, schema or scheduler behavior. Coordinator
reviewed PM/design in the existing session before implementation.

## bug 10-23 E50: code-like words are not typed commands

The shared forPage filter previously removed any quoted sentence containing
Q3, V2, E50 or an item code. Only suppress quoted command-shaped text with
an actual command verb and item prefix, or an explicit say/type/reply
instruction. Reminder/ask/draft quotes retain ordinary code-like words.
Prove tagged and Q3 reminder headlines in New and Classic, plus a quoted V2
work headline, and confirm real chat command hints are still hidden.

## bug 10-23 E38: waiting is not always someone else's move

The New empty Your move summary counts the server-provided next owner, not
the section name. Distinguish Delegate's work/retries, other people's steps,
and steps nobody owns; unknown ownership is simply waiting. Include retained
row revisions and bootstrap work. No workflow/placement rule is reimplemented
in the client. Prove nobody, Delegate retry, person, mixed and quiet stores in
real Edge at both widths; a nobody/retry-only store must never say it is
waiting on someone else.

## bug 10-23 E37: name what a not-ready check awaits

New's pending not_ready row now names blocker.waitFor (or the blocker reason
if absent) and the scheduled check time. It does not render the finite
transient/tool retry counter for this wait kind. Other retry kinds keep their
existing counter; paused/off scheduling gates stay unchanged. Prove a queued
build-991 wait in real Edge at 1280 light and 400 dark, with its exact next
check, plus the ordinary transient retry counter and Classic unchanged.

## bug 10-23 E35: first mobile row click must stay on its button

Focusing a New row revealed its previously display:none item code. At narrow
widths that added a heading line, moved Check again/Skip between pointer-down
and pointer-up, and cancelled the click. Reserve the code's space with
visibility:hidden; open/focused rows reveal it without moving controls.
Real Edge baseline reproduced zero mobile requests and working desktop.
Prove both first-click actions at 400 dark and 1280 light: one correct request,
retry marks promise pending, Skip clears it, no repeat chat message.

## bug 10-23 E18: private Ask owns its keyboard

The shared Ask field consumes Enter before either card shortcut sees it.
Ctrl/Command+Enter submits only Ask; single-line Classic also submits plain
Enter, while multiline New keeps plain Enter as a newline. Composition and
key repeat never submit. Card-level shortcuts also explicitly exclude Ask.
Prove with real Edge key presses in both experiences: one private question,
no approval/send request, no outgoing chat message, unchanged draft.

## bug 10-23 Windows worker command length

Every worker launch (reply, detached job and interactive continuation) writes
its complete prompt to a private run folder beside its MCP configuration.
Only a short file-reading instruction goes in argv. The new read permission
is the prompt folder alone, never the store root or another item's thread.
The normal read-only view/Read tool loads it on both supported agent flavors.
Remove the prompt and adjacent MCP configuration once the run ends;
continuation reads its saved CLI session rather than retained prompt files.
Prove on Windows with a real Copilot CLI worker, a fictional store, 4096-byte
profile/rules/index and a thread that would exceed the 32767-character limit.
Measured on this PC: original argv 74376 characters, file 74028 characters,
new argv 651 characters. Real installed CLI read the full file through view,
then submitted a needs_human report through the scoped worker MCP (exit 0).
No store-root permission and no send/change tool were granted.

## bug 10-23 E31: actionable work reports must wait for the owner

settle and the later no-response branch both ignored choices/effects when
there was no top-level reply/question. Share a hasDecisions predicate so
those reports stay needs_human and defer reported work closure. Choices
are a complete owner decision, not a reason to requeue the PR review job.
Preserve exact call/head fields inside option effects through the same
schema as top-level effects; the old option schema silently stripped them.

Picking a ready option prepares only its reply/effects, using the normal
carrier helper and keeping busy/shared-write gates. It sends nothing until
the explicit approval. Refused effects remain blocked with their reason.
Effect-only reports also receive an approval carrier; successful execution
without a reply rests/closes work instead of claiming a send failure.

Manual fictional proof in both Edge experiences: active work, schema-parsed
report with two options and no top-level reply/question, choices visible;
pick option 2, preview exactly its call and reply, one ok performs only its
effect then sends only its reply. No option-1 call/reply and no worker rerun.
Also prove no-decision reports still settle and effect-only reports need
approval but do not attempt an empty send. No tests or review chats.
Done and stale-queued review carriers were both covered. Preview made zero
calls/sends; an unapproved make_change was refused. Saved approval replays
returned the original receipt with no new answer/call/send; a fresh stale
submission was refused. Disabled write permission kept the chosen reply
blocked with its reason, rather than sending a claim about an unmade change.

## bug 10-23 vote-receipt-turn: external reset and fresh ask

Dispatch previously collected made markers from the reusable job result and
matched only the operation. A later ask could therefore inherit an older
vote's done time even though the live owner vote was reset to No vote.
Stamp server-owned effect provenance with the workflow/message turn(s) that
proposed it. Keep operation identity unchanged for write-ledger deduplication.
Reply redrafts retain only their own still-present same-proposal receipts;
never harvest done markers from an old job result. Votes additionally require
the fresh live vote and head to match under the existing sameVote policy
(negative votes are exact; positive approvals retain their existing equivalence).
Unknown live state grants no
completed vote marker. Job reports, options and promised-change proposals
also receive turn provenance; shared job results retain their parent turns.

Generic carryMarks never imports a vote's done marker from another list.
Other receipts/uncertainty transfer only within the same proposal. PR reads
clear stale vote receipts on the item and its carrier when a verified active
PR shows a different vote or reviewed head, including already-saved records.
Describe the newly pending change before the owner's next approval.
Historical logs/receipts remain unchanged.
Approval also rechecks completed vote receipts: an old Send-only approval
cannot silently become authorization to recast a reset vote. Clear the stale
receipt and show the newly required change for a fresh explicit approval.
Preflight blocks are recorded as refused outcomes, not successful actions.

Manual fictional proof: New vote (-5), external reset to 0, fresh tagged
Classic ask, pending new proposal, one ok casts -5 again exactly once and
sends one reply. A same-turn redraft with the live vote still -5 retains its
receipt and sends without another vote. Also cover same-turn reset, no-live
evidence and generic list adoption so they cannot resurrect old receipts.
No tests or new review chats; no real-root writes or real external calls.

## bug 10-23 row-entities: Done Q&amp;A and other message-derived rows

Grep found raw lastAsk, sent/owner reply, FYI line/gist, waiting message,
watch and work-summary text reaching shared row fields. Apply the
existing htmlToText once at those presentation boundaries, before clipping.
Done full sent text and its short quote are independently derived from raw
evidence; Catch up's already-decoded ask fallback is not decoded again.
Numbers fallback rows now inherit decoding from itemRows rather than applying
it a second time. Immutable per-send Numbers/exporter decoding stays as is.

Normalize read-only card asks/thread context for Classic row consumers, but
leave editable unsent drafts, pending reminder bodies, stored workflow/message text, ids, links,
commands, placement decisions and approval revisions unchanged. Next's row
previews, quotes, work facts and to-do labels are display-only copies.
Manual fictional proof checks today's New and React New/Classic at 1280
light and 400 dark for Done, Now, Catch up and Waiting, plus Numbers and
single decoding of amp;amp. No tests or new review chat.

## bug 10-23 E26/E27: answered recheck left queued work

The earlier recheck fallback treated even a complete reply/vote proposal as a
job handoff. A direct answer could then use a carrier still queued for work,
so the accepted page approval was refused as "still working on a new result".
Handoff only when the report carries neither reply nor proposed effects,
including contradictory reports that also name job. Keep the direct answer,
its sharing checks and the existing approval/execution path.

A fresh complete proposal supersedes unstarted work on its exclusive carrier;
clear that stale work queue/retry state, not the valid new-result guard at ok.
If another item still needs the queued work, use a separate changes carrier
without cancelling that review. Running work, executing changes and shared
pending changes keep their gates. Recover the already-saved regression at ok
only for a complete promised reply with no pending input and an exactly
matching effects list on the queued carrier.
Record the completed reply and its result time on reused/new carriers, so an
older no-reply verdict cannot suppress this newer turn's actual reply.

Manual fictional proof: an incomplete recheck resumes its original review
session once; a complete WaitingForAuthor vote/reply does not start a review
and one page ok casts the vote then sends one reply. Repeat with a stale
queued carrier and with a persisted refused-proposal shape. Verify genuine
pending/running work stays blocked and another item's queued review survives.
No tests, new review chats, real-root writes or real external calls.

## bug 10-23 H2: one-row middle-width header

The non-overlapping header fix wrapped at intermediate widths (99px high).
At 861-1200px compact the status and selectors instead: preserve every tab,
count, wordmark and existing action in one 56px desktop row. Healthy status
is a dot; warnings retain short non-colour wording. The full status/time and
machine are in its accessible name, native title and Radix hover/focus
tooltip; Escape dismisses the tooltip without starting an action.
Keep the existing narrow menu through 860px, full wording above 1200px,
and non-shrinking navigation with wrap as an exceptional-content safety net.
Scope layout rules under header-inner so Classic stays unchanged. PM/design
review used the existing coordinator session; no new chat or test. Manual
Edge proof sweeps every integer width 400-1440 in both themes, with healthy
and long stale status, plus representative controls and keyboard tooltips.

## bug 10-23 Numbers HTML in historical exchanges

Historical sent logs and saved thread text can contain HTML/entity spellings.
Numbers' immutable send context and fallback item rows now expose plain ask
and sent text, shared by today's page and both React experiences. The feedback
exporter's quoted corrections and fact extraction use the same conversion.
Keep raw logs/lessons, case identity hashes, counts and exact source links.

Extend the existing htmlToText: strip tags first, then decode once. Decode
decimal/hex numeric Unicode scalars and common Teams named entities; preserve
unknown names and invalid/out-of-range/surrogate numeric entities. A decoded
lt stays text, never markup. Preserve ordinary less-than/greater-than text.
No new dependency or lockfile change. Manual fictional proof covers Numbers
in all three versions, raw and thread-derived asks, edited sent words,
exported correction notes/facts and unchanged source ids. No tests.

## bug 10-23 E26/E27: fresh PR review after an excluded vote

A reply report could say a fresh review was ready without reporting job.
Only report.job resumed the completed PR session. For an incomplete recheck
without a reply or proposed effects,
a pr_review classification and one unambiguous PR matching this item's
completed/failed review now resume that job with the new ask, including
after a done item detached its job. No status-only or unrelated ask is
routed this way. A new review starts a fresh turn, withdrawing earlier
votes and stale refusal to-dos, including failed or excluded votes, but
preserving kept promises, unresolved non-vote writes and their gates.

The observed missing vote was not an exclusion veto: the report spelled
call.tool as tool:action, which the exact allow-list correctly rejected.
Normalize that spelling only when its suffix matches args.action, before
the existing allow-list, forbidden-operation, PR-target and head checks.
Conflicting suffixes remain refused. Clarify the worker prompt and schema.
New reports do not inherit off/error marks from earlier votes.

Manual proof on fictional stores with a stub PR probe: a fresh inbound
resumes the completed session, receives a new review result and offers one
Approved vote in both experiences. Nothing changes or sends before ok;
one ok makes only that vote, then sends the reply. An excluded/failed prior
vote does not veto the fresh proposal. Keep unrelated asks, stale-head and
disallowed-call gates, and no-reply verdict safety. No tests or review chats.

## bug 10-23 Y2: Numbers group heading capitals

New's 4-week reply groups rendered mixed case instead of today's capitals.
Apply text-transform: uppercase only to section-h inside new-numbers.
Keep source strings, counts, links and Classic styles unchanged. Manual
Edge at 1280 light and 400 dark confirms all three groups render uppercase.
H1 remains fixed by a6b8b19; no header change. No tests or review chats.

## bug 10-23 sent-ask-identity

send previously logged askAtOf, which returns the first owned inbound after
the latest owner message. Page sends need not be echoed into the saved thread,
so later turns kept that first askAt. Immediately before sending, capture the
latest owned non-owner inbound from the workflow's asker and log both its
askAt and askMsgId. Other participants and newer unowned context are excluded.
Retain the id in slim Numbers events (still no words/names), prefer it in
Numbers and the correction exporter, and preserve askAt fallback for old
records. Never rewrite old log lines/week files. Manual three-turn/three-send
proof on one fictional item checks raw events, Numbers asks and exported links.
No tests, typechecks or new review chats.

## bug 10-23 stale-draft-new-turn (P0 E26)

Reproduced in Edge: finishWork with needs_human, effects [] and no reply kept
the preceding Acme draft; New and Classic offered enabled Send. Reopen now
uses newTurn, which also clears edited-send learning state. Starting a job
withdraws a reply draft. applyReport and finishWork always replace absent
reply with no draft, including early return/settlement paths.
Shared currentDraft rejects an already-saved prior draft when the current
completed work verdict has no reply. Completed results get an immutable at
timestamp; only legacy results fall back to updatedAt and matching verdict.
Shared view and direct-send/page guards use that predicate. Page revisions
include revAt so even unchanged words cannot reuse approval from an older
turn. Project a no-reply verdict into the existing attention/status block.
Manual proof: both Edge cards, old captured intent and queued approval
refusal, already-saved bad record defense, and normal current sends. No
tests/typechecks, new review chats, owner config or real external writes.

## bug 10-23 correction-export-identity

Several edits on one code/day exported the same id and the newest inbound
link. Derive deterministic event-specific ids from recorded time, machine
and correction/send identity. Resolve the original inbound from its matched
sent log and retained thread (shared sendContext), never current lastMsgId.
New lessons retain send/ask ids and askAt; old lessons match raw send evidence.
Unavailable or ambiguous original evidence is reported and skipped.
Merge deduplicates within a batch and across reruns. Unambiguously matched
legacy ids/links are migrated without changing hand-labelled expectations.
Manual export of five fictional corrections verifies stable unique ids,
five original inbound links, zero additions on rerun and preserved labels.

## bug 10-23 counted-send-context

Numbers previously grouped repeated item codes and resolved one mutable
workflow row, losing sent words after a newer inbound. Keep all numeric
definitions/codes unchanged; add parallel presentation keys for counted
send lists. Each stable send key resolves its own raw sent log and original
thread context, never current lastAsk/draft/sent. Both React experiences
and today's shared Numbers renderer use the keys; Done is unchanged.
Slim week files remain text-free. Missing/redacted words stay unavailable,
not replaced with current words. Historical entries have no mutable actions.
Manual Edge verifies five edited sends, five distinct original asks/source
links, preserved counts and no newer-unsent substitution.

## bug 10-23 header-overlap

New's desktop nav could shrink below its links' intrinsic width while the
status and selectors stayed fixed, causing overlap at 861-1100 pixels.
Like Classic, preserve the nav's intrinsic width and allow the header items
to wrap instead of painting over tabs. Let header height grow, including
narrow layouts; position the menu below the actual header. No controls are
removed. Manual Edge geometry across 400..1440, especially 861/900/1024/1100,
in light/dark with both Checked and long Not checked since statuses.

## bug 10-23 source-session-lost: one fresh MCP connection

McpClient call and texts share a single bounded session-recovery path. MCP
error code -32001, or an error containing -32001 / Session not found, closes
the old SDK client and retries the same tool and arguments once on a new
stdio connection. Tool-error results are checked before output truncation.
The second failure is returned normally; unrelated errors never retry and
successful results retain their existing parsing. Concurrent old failures
cannot close a replacement client. No general transport/timeout retry loop.
Manual stdio proof records connection starts, calls, shutdown and terminal
failure counts, for both call and texts. No tests or typecheck.

## bug 10-23 X6/X7: Ask and Numbers wording

Name New Done's Ask field with its actual row code, retaining the same
Field key/id and action input. Rename both Numbers selectors to Window;
remove Classic's caption period (New already has no period). Manual Edge
at both requested sizes checks code-specific fields on different reply
rows, Ask more focus, both window selectors and unchanged window queries.
No tests or typecheck.

## bug 10-23 X5: New keyboard help is shortcut-only

The verifier confirmed today's New Now footer has no Keyboard shortcuts
button; the latest coordinator direction reverses the E96 addition. Remove
only New's footer opener and its now-unused focus fallback selector. Keep
the complete d184fef list and ? handler, modal key guard, Close/Escape and
prior-focus/main restoration. Classic is unchanged. Manual Edge at both
requested sizes verifies quiet-footer controls, list contents and focus.

## bug 10-23 X1: no problems banner on New Numbers

Verifier 6443019 corrected the earlier N4 scope: today's Numbers summary
and counted lists have no problems banner. Exclude only the shared Problems
component when the New screen is Numbers. Keep it on the other tabs, and
keep Numbers loading/transport errors and header status untouched.
Manual Edge at 1280 light and 400 dark checks summary/lists and banner
retention on Now, Done and Settings. No tests or typecheck.

## bug 10-23 E08: Check now in New Settings

Baseline comparison: all 25 setting rows were present, but New lacked both
Check now controls and the complete conditional Details runner/log panel.
Extract Classic's retry control into a shared single-action helper, showing
only the retry-source result under row:retry. Insert beside pollIdle Save
and in More > Details > Runner; retain the legacy status placement under
pollIdle (Runner is button-only). Details uses existing snapshot data gated
by Show details and precedes Changed by setup. Log wraps at narrow widths.
No runner/protocol changes. Audit regular/advanced rows, saves, switches,
habit actions, rule removal, navigation, model usage and setup-only values
against today's New. Manual Edge must trigger actual isolated demo-source
cycles from both locations at both sizes, not merely accept an HTTP result.

## bug 10-23 worker-catalog

Copilot workers disable built-in MCP servers and clean inherited built-in
GitHub/MCP-app/feature-experiment flags, while preserving COPILOT_HOME.
Reply and Ask runs with no report and a new "MCP tool catalog changed" log
entry get at most one fresh-session retry. Inspect only log bytes appended
by that attempt so an old error cannot trigger a new retry. Existing or
salvaged reports prevent a retry. Each actual run counts against the daily
cap; exhausted caps and retry decisions are logged. Recheck owner/window
and pending-work gates before retrying. Ask retries do not replace a job's
session. No prompt tells the AI how to recover; this bounded gate is code.
Build and one real CLI worker on isolated fictional data, no tests/global
Copilot changes. Operator E07 remains the real external-system proof.

## bug 10-23 worker-root-files

Copilot CLI 1.0.103 separates file-path access from tool permission. Workers
were told to read root profile.md/rules.md without a root path grant.
Include those files and the optional knowledge index directly in reply,
Ask and non-execution job prompts, capped at 4096 UTF-8 bytes per file with
an explicit truncation note. Missing files say none; unreadable files still
raise the normal start failure rather than silently losing owner rules.
Keep existing secret scrubbing. Do not add a root grant or allow-all-paths.
Build and manually inspect fictional prompt content, then use an isolated
real CLI worker when available; no tests or owner/global config changes.

## bug 10-22 summary-template correction: help-only parity

Revert 51f2aa1 as requested. Today's template is help-only, not a schedule
editor. Settings remains the one existing summaryAt setter; summary engine
code is unchanged. Preserve the shared picker's description and activated
chat-help wording, with no settings POST, config change or new automation
when clicked. Manual Edge compares today's description/help and verifies
New and Classic at desktop light and narrow dark. No tests edited or run.

## bug 10-22 G5: Holding reply row marker

Latest coordinator direction requires section 8a to demand a chip in this
exact location. It does not: 8a names goal-retry Holding reply, Send holding
reply and Retrying capability, not the duplicate Your move row marker.
Remove only the projection's extra chip. The headline already identifies
the holding reply; opened-card label, held draft, explicit send and retry
lines remain unchanged. This supersedes earlier section-7-based retention.
Manual proof at both sizes checks chip absence and holding/retry controls.

## bug 10-22 N8: Find names PR search

Repro: Find's placeholder and label omitted PR. Restore today's exact
"Find a person, chat, PR or number, or paste a Teams link" for both. Search
resolution is unchanged. Manually enter a fictional PR number and clear it
at desktop light and narrow dark.

## bug 10-22 N3: New Settings parity

Repro: New Settings added Reading and watches controls and omitted today's
AI-chat guidance; its Off label was rewritten by the React API. Remove only
the extra Settings group; preserve FYI Watch, automation-picker Watch
something, health actions when offered, and Classic reading controls.
Restore the exact guidance and stop overriding the server's original update
Off option. No settings behavior, parser or write path changes.

## bug 10-22 N2: Numbers Catch up controls

Repro: counted Catch up rows had only a source link. Resolve their real
activity entity from the existing normalized snapshot and render the same
New Entry used by Done, including Watch, Needs me and the exact watch gate.
Count-only/missing activity rows keep the existing read-only fallback; do not
invent action offers. Manual proof creates named watches and promotes named
FYIs from Numbers at desktop light and narrow dark.
The shared Entry also needs its existing new-done style scope; without that
scope the row loses its flex layout and concatenates its text. Preserve the
scope on the Numbers row and remove the outer double padding.

## bug 10-22 N4: problems on every New screen

Repro: a health problem appeared on Now but disappeared on Done, Numbers and
Settings. Extract the existing notice without changing actions or details,
then mount its single host in the New shell above the selected screen.
Manual proof covers Now, every Done filter, Numbers and all Settings anchors
at desktop light and narrow dark. Classic's separate banner stays unchanged.

## bug 10-22 C6: failed-job answer controls

Repro: failed jobs used Try again/Directions for trying again instead of
today's Your answer/Draft reply. Compare bindings: both use the answer verb
with the exact owner-entered text, not a special retry command. Restore the
labels and keep Skip's skip verb. Add an optional recovery flag to action data
so Classic Home/card keep recovery behavior without depending on a display
label. The separate stopped-work Try again command is unchanged. Manual
Edge exercises answer and skip on fictional failed jobs in both experiences.

## bug 10-22 C8: system-theme name

Repro: both headers named the system-following theme Auto. Share today's
theme-label values (same as your system, light, dark) in React's existing
interface model for visible text,
tooltip and accessible name. Theme storage and cycling are unchanged.
Manual proof cycles all three states in both experiences and verifies
system following with light/dark system emulation.

## bug 10-22 C5: feedback's accessible recipient

Repro: Done's Not right? buttons did not name the affected recipient.
All three shared Entry surfaces and Classic activity now use today's
"Tell Delegate the reply to <first name> was not right" accessible name,
with unchanged visible wording and feedback commands. Fall back to the plain
label when no person name exists. Verify row scope and feedback opening in
both experiences and sizes with fictional data.

## bug 10-22 C4: follow-up from Done

Repro: expand a sent reply with a private Ask thread; New lacked Classic's
Ask more controls. Add one per note only when that row's private ask editor
exists. It focuses the same row's editor without sending, respects busy/stale
blocking and leaves the existing explicit Ask action as the only submit.
Manual Edge follows through to a newly stored private question on that item.

## bug 10-22 C2: New reminder sheet controls

Repro: + Remind someone used generic selects/time input without quick people,
Back or today's Create automation label. Reuse OngoingSheet with direct
reminder entry, not a second implementation: quick people, Someone else,
time list, repeat buttons, Back to templates and exact preview. Scope its CSS
by the shared sheet class so it works in New. Its existing action identity,
recipient revision and double-submit gates remain unchanged. Close New's sheet
only after its own successful applied submission; retain edits on refusals or
when changed during submission. Route-driven creation uses the same single
sheet. Existing Classic entry remains unchanged. Manual Edge includes both
sizes, custom recipient, Back, every repeat choice and persisted reminders.

## bug 10-22 C3: problem report wording

Repro: Report a problem had no prompt placeholder and its submit repeated the
opener's label. Restore "What went wrong, and what should it have done?" and
"Send to the feedback log" in the shared form only; leave the action/opener
identity intact. Manual proof submits fictional reports from New and Classic,
checks their feedback-log entries and preserves blank-input gating.

## bug 10-22 E96/E97 (C9): keyboard help

Repro: New's quiet footer had no Keyboard shortcuts button and the key list
omitted working shortcuts. Add the coordinator-requested footer opener without
changing its other controls. List every implemented New shortcut. Capture the
opener, restore focus on Close/Escape (fallback to its replacement or main),
and ignore background keys while a modal is open. Manual Edge proof at
1280 light and 400 dark includes Close/Escape, question-mark entry and no
navigation/action from keys behind the dialog. No tests edited or run.

## bug 10-22 C1: New Catch up deadlines

Repro: Done > Catch up > Watch offered only a date input. Restore No date,
Today, Friday and Next week using Classic's fixed deadline helpers. Keep the
choice separate from its date and recalculate on submit, including Friday
meaning next Friday when already Friday. Existing exact watch approval,
cleared until text and deduplication remain unchanged. Build and manually
exercise each choice and create a watch in Edge; no test files or runs.

## G2 failed-job directions

Keep the exact runner-generated retry question only when the workflow status
starts with "The job did not finish:" and the question names that workflow's
own code with the exact generated sentence. Use today's forPage formatting for
that question and its question-row headline. Other hints, attention text and
AI-authored variants remain filtered. The existing answer and dismiss actions
retain their local, idempotent submission paths; neither sends a reply.

## G4 quiet New footer

Keep PageTools as the single sheet/result host, with a quiet presentation for
Now's reminder and report controls, named channels and child version/update
content. Resolve the selected sheet from all server page actions so route-opened
forms still work even when the visible control list is restricted.
Reading Pause/Resume, Check now, watch creation and watch-detail management
remain in Settings > Updates and system. FYI Watch remains on its row; Find
retains missed-message creation. No extra toolbar heading appears on Now.

## G6 Waiting row inspection

Waiting rows without a local primary action omit the redundant Open/Hide
control. Their existing row-title button retains keyboard activation and
aria-expanded, and opens/closes the same workflow or standalone card. Direct
local nudge/close actions remain unchanged. Empty control wrappers occupy no
layout space.

## G8 shared version identity

New and Classic use one version-label formatter: Version tag (code), or
Version code when there is no tag, omitted when code is unavailable. This
matches today's pages and uses the same server versionFor metadata, not the
React asset hash. Update-check controls and update state remain unchanged.

## Look lifecycle repair

Observe the stable New main root for lazy row mounts and removals. Schedule
geometry scans on DOM, scroll, resize and visibility changes; each row must
remain at least 25% visible for 1.5 seconds, measured against the smaller of
its height and the viewport for tall opened cards. Hidden tabs and leaving
the route cancel dwell. Saving retains the current look's chips; the next
look reads the latest ingested projection. React Classic's opened-card seen
mark is the designer's accepted intentional divergence from legacy Classic.

## Standalone placement cards

New standalone cards resolve entities from the placement subject's pinned
snapshot or the current entity store, not the workflow-only item selector.
Resolve placement, automation and offered actions from that same snapshot;
an incomplete offer shows the changed-item status instead of a partial card.

## Directional toggle gates

Reminder Pause/Resume binds the displayed automationApprovalRev; global
Pause/Resume binds the displayed status state. Refuse changed expectations
before resolving the current binding so a drawn Pause never becomes Resume.
Reminder queued commands retain the existing apply-time automation guard.
Keep absolute End/Stop and additive draft/Ask/report intents unchanged.

## E45 implementation decision

Keep exact raw to-do identities on the server-authored action's todoIds. The displayed
offer's expectation digests ids, text and kept-at timestamps, rather than
using a newest timestamp as identity. Its revision and expectation use that
digest; the engine receives the explicit identities, not a time cutoff.
Row bindings select the named oldest
task; card bindings select the listed tasks. Resolve only those bound ids
into the existing mark-todos page guard. New tasks may cause a refusal but
can never broaden a submitted action. Preserve the engine's doneTodos apply
step and chat/self-chat close semantics.

Classic Close and due-work Close use exact workflow expectations and are
unavailable while kept tasks remain, with a reason pointing to their listed
completion control. Keep Track, Wait and failed-job recovery unchanged.
Page results keep "stays open" as a standalone sentence without chat hints.
Classic Ongoing's existing action slot instead offers counted completion
with an exact list and confirmation naming all its texts, so to-do-only rows
remain actionable without adding a second navigation mechanism.

The separate draft-promise follow-up restores card.todos as optional item data for draft
promises; it is distinct from normalized kept todoIds. New renders the
warning before follow-up watching while the draft offers Send your version;
after sending, only the kept list remains. Classic's presenter is owned separately.
Draft promises participate in workflowApprovalRev so a changed warning refreshes
the card and invalidates both stale submissions and queued approvals.

M4b secondary-screen follow-up: Numbers retains supplied gist/work in its counted
lists. Done partitions pin-aware entries using the accumulating visit-stable New
id set, with keyed sibling entries so grouping never reparents an editor.
Grouped entry headings are h3 below h2 group labels; ungrouped/closed entries
remain h2. Find is the sole missed-message entry point. See
[the handoff](../reviews/react-parity-m4.md) for browser proofs and remaining
New-side ownership. The owner has reassigned this builder to React Classic.

## React Classic

Classic is a separate presentation under `src/web/react/classic/`. The React
entry defaults to New; `#classic/...` selects the in-app Classic shell without
changing the machine's `ui: react` choice or reloading the page. Returning to New
uses `#now`. Both experiences share the normalized store, revision pins, receipt
recovery and typed action gates.

The optional v1 `classic` page metadata projects the existing Classic view:
ordered Needs-you ids, Home tiles and Also-for-you tiles, Catch-up activity ids,
running work with bootstrap progress, ongoing work with check dates, and debug
runner details. Counts and membership stay on the server. Classic-only offered
action ids reuse existing continue/close/every/extend/ok verbs; the browser never
formats commands. Shared Done, Numbers, Settings and Knowledge retain one
implementation and adapt their navigation to the selected experience.

Classic uses server-derived done-by presets, item-scoped seen marks and a
visit-local focus queue. Home reuses the shared Done entry for Watch and Needs
me, including revision pins when freshness changes. Leaving New ends its look
session; switching experiences preserves the normalized store and unsent edits.
Offline is driven by browser connectivity as well as fetch errors, because a
paused query need not fail. A stable disabled fieldset blocks actions offline;
the direct Undo shortcut is gated too. Read-only snapshot routes expose no
executable item actions.

Browser validation completed on fictional temporary stores with real Chrome:
default New and both toggles; exact edited send and Undo; selected fact saving,
Edit and Skip; exact 120-minute watch tuning and seven-day extension; Got it and
isolated Stop; reminder Start/Pause/Resume/End and weekly creation without an
immediate send; watch creation with exact target, completion text, date and push
choice; progress Close, waiting draft/Dismiss and named-channel isolation;
bootstrap 1/2 progress; health retry without false recovery; missed-message and
feedback persistence; Settings persistence; exact Numbers list membership;
read-only snapshot and keyboard behavior; offline recovery; and a composing Home
watch input retaining its node, focus, selection and text while polling changes
freshness. Desktop 1280x800 and narrow 400x860 light/dark captures were inspected,
with no horizontal overflow or browser page errors.

Only `npm run build` was run per commit under the owner's current directive.
No test suite, typecheck pass, CI, push or publish was run for Classic.
The walkthrough scripts and stores are temporary/session-local, not committed
test coverage. The shared action/card implementation and its remaining New-side
work stay with the New builder.

### Classic visual fidelity follow-up

Merged the owner's `react-all` integration once before continuing. Home and the
Classic shell now use the legacy tokens, dimensions, compact needs previews,
sentence icons/emphasis, amber health treatment and short shared time formatter.
Knowledge membership comes from the server's pending-fact tile, not the total
normalized proposal count. The conditional destination is named To learn.

Keep the two independent selectors in the existing Menu: Experience changes
only the React route; App version retains the existing machine-version switch.
At 1100px and below the navigation also joins Menu, before it can overlap status.
The tile breakpoint remains 860px, and the 52px mobile header begins at 600px.
Compact Catch-up is an opt-in shared Entry presentation; other Entry callers
retain the default markup and action/revision implementation. Current server top
rows lead the list. An actively edited noncurrent row may remain, labelled as
retained, without contributing to the new count or remaining count.

Real Chrome comparison against the legacy renderer used identical fictional
temporary stores at 1280x800, 900x800 and 400x860 in both themes. Inspected paired
captures and checked actual header rectangles, not just document overflow.
All six combinations had no collision, overflow or page error. The long
table-shaped ask remained one clipped line; eight needs showed four avatar rows
and the correct remainder. Reviewed 1 PR had its original icon and emphasized
number. Amber backgrounds, header heights, desktop frame and 44px/36px needs
numbers matched. Catch-up top membership/order and its 4-new/1-more arithmetic
matched the legacy page exactly.

The same real-server walkthrough also proved background seen changes retain
the Watch editor's DOM node, focus, selection and words through composition
events; closing that editor removes the zero-new section. Mark all read applied
to four fresh updates. Applying the pending fact removed both To learn entries.
The relocated New/Classic selector retained an unsent reply edit, and the theme
button cycled Light/Dark/Auto/Light. These are session-only browser proofs, not
a committed test pass. The underlying visit timestamp remains New-owned.

### Classic supporting-screen implementation plan

Use dedicated Classic Done/ActivityRow presenters over useDoneEntries,
useDoneLook and useActivityCard. Keep stable activity-id siblings across grouping.
Extract Classic Why and conversation blocks from the accepted card and reuse
them for sent history; no complete New/Classic live card inside Done. Use the
displayed row's typed actions for Undo/feedback/watch and preserve newer/blocked
state, field focus/composition and private-answer updates.

Ongoing and its sheets, and Numbers/Settings/To learn are independent presentation
workstreams with separate files/CSS. Existing queries, validation, revision pins,
receipt gates and runner verbs remain shared. Classic.tsx alone selects the
Classic lazy screens; any shared metadata change must preserve New's copy.

Check each surface against identical fictional legacy/React stores, then against
an isolated owner-data copy with all browser write requests blocked and no AI or
runner dispatch. Capture desktop/narrow in both themes, prove typed actions only
in fictional stores, record each Classic Done/Missing cell, build and commit by
surface. Tests/typecheck/CI/publication remain deferred.

Done milestone evidence: paired Chrome captures at 1280/400 in light/dark;
empty, quiet-only, fresh-only, earlier-only and mixed lists; five typed action
families; exact replacement-send correction gate; retained DOM/focus/selection/
composition across an arriving fresh row. The accepted Needs-you walkthrough
still passes all 11 actions after extracting Why and private conversation.
The implementation review found two corrections, now browser-proven: keep shared
watchBy canonical ISO-date-or-empty across Home and Done (including successful
pin cleanup), and derive pending disclosure state from the same current private
notes rendered beside pinned historical sends. Current owner-copy verification
is read-only and remains a distinct acceptance step.

Supporting-screen integration is now browser-verified. Final paired fictional
captures cover seven supporting routes at 1280/400 in both themes. A fresh
fictional action walkthrough checks all four Numbers windows and every exact
grouped/deduplicated counted list, including actual DOM witnesses for both gist
and work (SC-265), source links and copied anonymous summary. Settings Save,
switch persistence, section draft retention and original fixed help pass.
To learn selected save, Edit/Skip, stale-save gate, pinned zero-live navigation
and saved-fact placement in Done/Learned pass. The creation alias opens the
Classic picker. Only presentation changed in the final correction: Home-only
footer, no Numbers health banner, success-colored meter, legacy tool typography
and narrow fact actions.

The final isolated owner-copy comparison produced 96 captures covering Home,
Needs you, Done All/Replies/Catch up, Ongoing, Numbers, loaded Settings, To learn
and picker/reminder/watch sheets at both widths/themes. Zero browser runtime
errors, horizontal overflows or attempted/dispatched browser writes. Finite
sheet animations are settled before capture. No live data mutations or AI.
Build passed; no repository tests, typecheck or CI were run for this milestone.

### Classic Needs-you implementation plan

Replace only Classic Focus's New ItemCard caller with a dedicated Classic Card,
porting legacy card sections and all five bodies into React. Reuse
useCardPresentation/useEdit/useShowLatest, ActionButton/ActionState and shared
browser-copy helpers. Extract the existing controlled card field/source helpers
for both renderers; preserve their focus/composition handlers unchanged.
No legacy HTML insertion, new runner command or duplicated approval engine.

Queue rows retain visit order but show server-current membership/counts and
Classic's compact toolbar. Its Previous/Next and keyboard use the same live
codes; handled rows remain explicitly selectable. Port scoped Classic CSS, not
global New classes. Restore the visible desktop machine-version selector and
move that control into Menu only at narrow widths. Compact Home activity omits
quoted asks; noncompact Done remains unchanged.

Build first, compare temporary-store legacy/React in real Chrome at desktop and
narrow in light/dark, then exercise exact edited send/Undo, selection/Other,
review exclusions, sources/Ask, stale typing, handled navigation and version
controls. No suites, typecheck, CI or committed tests during this milestone.

### Classic Needs-you browser acceptance

The milestone now uses a dedicated Classic card, not New's ItemCard layout.
Shared prerequisites are isolated in commit `9855e7d`; the Classic renderer and
rebuilt distribution follow separately. Both bounded implementation/diff
reviews closed their findings after corrections.

Real Chrome compared identical fictional stores at 1280×800 and 400×800, light
and dark. The queue is 272 px wide on desktop, hides below 960 px, clips its
preview to one line, and shows avatars, first names and codes. The pager is
28 px tall. The representative reply card measures 722.61 px versus Classic's
723.67 px on desktop, and 922.61 px versus 920.67 px on narrow. Message/draft/
metadata content, message background and card width match. All five card
families load, and version/status/theme controls do not overlap at 1280, 1100,
900 or 601 px. Home Catch-up retains title, summary and metadata without a
quoted ask.

Session-only browser walkthroughs submitted eleven typed actions through the
real server and runner to a fictional source. They checked exact edited send,
single-choice preview, Other and multi-choice routing, selected review changes,
private Ask click/Enter exactly once, and persisted due-work Wait/Close. A
separate walkthrough undid the exact send. No AI runs or external sends occurred.
Pinned edits retained DOM identity, focus, selection, composition and words
across a changed revision; stale sending was disabled. Current private answers
appeared without discarding the stale editor. Blank Other survived blur and
refresh. Missing entities retained their cached card/editor, while handled
navigation counted only live items. Review number keys, reply-only's edit gate,
Ask's focus indicator, declined version switching and the narrow version menu
were checked. New's extracted textarea retained its identity/focus/selection
across a revision and an experience roundtrip. No page errors were observed.

Only `npm run build` ran as the commit gate. Formal tests and typecheck remain
deferred by the owner's rebuild directive. This is fictional-store acceptance,
not a new owner-data comparison or live AI/source integration claim.

Status: M1, M2 and M3 complete. All four screens and supporting sheets are
implemented and browser-proven. The final M4 scenario inventory follows.
Status: React New implementation and its complete scenario inventory are done.
All four screens, current cards, supporting sheets and lifecycle actions have
fictional-store browser evidence. React Classic/toggle integration and the
owner's deferred formal-test phase are separate, not signed off here.
Schema version: 1.
Reviews: [spec](../reviews/react-spec.md), [action safety](../reviews/react-actions.md),
[UI and narrow safety follow-ups](../reviews/react-ui.md).

Current delivery rule (owner update at 11:37/11:47): build and verify features
in a real fictional-store browser. Per commit run build only. Tests and
typecheck return after parity in separate sessions; no CI or publication here.
The earlier full-run and mutation records below are historical evidence, not
instructions to repeat those checks.

## Goal and boundaries

Build the New experience beside the existing page, including the capabilities
currently reachable only from Classic. Keep one server, one runner, one approval
path and four tabs: Now, Done, Numbers, Settings. Do not migrate stored workflows.
The preview is opt-in per machine. Neither switching nor rendering sends a reply.
The existing page changes only to offer the three-version menu.

## Layers

Dependencies point downwards. Components use data hooks, never endpoints or
command strings. Data hooks use services and domain types. Services use domain
types. Domain code has no React, browser, filesystem or store imports.

| Layer | Responsibility |
| --- | --- |
| `src/web/react/components/ui` | Owned shadcn/Radix primitives |
| `src/web/react/features/*` | Screen and card parts; render data and emit intents |
| `src/web/react/data` | Query lifecycle, normalized Zustand entities, narrow selectors, revision-keyed interface state |
| `src/web/react/services` | Token-aware API client, edge parsing, action submission and result polling |
| `src/web/react/domain` | Serializable v1 contracts, ids, revisions, pure selectors |
| `src/web/react-api.ts` | Server projection and action registry using existing view, nextView and runner entry points |

The browser never calls whoseMove, decides eligibility, invents row actions or
formats commands. The server projects existing view data into the v1 envelope.
No imports from the old renderer. Server-only dependencies must not enter Vite.

## Store schema (designed before implementation)

All entity tables are `Record<Id, Entity>`; references are ids, not embedded copies.
Ids describe projection identity, not private storage ids. Text is plain text,
never trusted HTML. Missing optional fields mean unavailable, not fabricated.

| Table | Fields |
| --- | --- |
| items | id/code, rev, kind, personId?, chatId?, at, ask?, thread (who, text, at, owner), question?, status, newCount, earlier?, before?, draftId?, changeIds, workId?, todoIds, sourceIds, noteIds, actionIds, teams?, openOn?, context, choices?, picked?, meeting?, promise?, follow?, debug?, why (reason?, confidence?, gaps, searched?), job?, replyOnlyActionId?, reviewAgainActionId? |
| people | id, name, initials, hue |
| chats | id, name, group, guests |
| drafts | id, itemId, rev, text, commitment, preview, holding? |
| changes | id, itemId, rev, n, summary, target, system, action, detail?, meaning?, state (`proposed`, `approved`, `made`, `uncertain`, `left-out`) |
| work | id, itemId, goal, next?, waiting?, due, proposed, home?, stepIds, planIds, reportActionId?, yours (what, check?), then (owner, what, you?), total, happened |
| planSteps | id, workId, position, what, owner, done, now?, where?, build? |
| workSteps | id, workId, at, what, news |
| todos | id, itemId, code, text, at, done |
| sources | id, itemId, kind, label, href?, stale?, locked? |
| notes | id, itemId, at, question, answer?, sourceIds |
| doneEntries | id, code, kind, personId, sentence, at, by, ask?, said?, text?, teams?, href?, undoUntil?, work?, high?, inTeams?, gist?, watch?, watchedAs?, own?, rule?, fresh?, noteIds, sourceIds, why?, msgs |
| watches | id/code, what, last, changedAt?, update, rev, every?, endsAt?, by?, nextAt?, from?, actionIds |
| automations | id/code, sentence, to, text, when, state, why?, next?, count, rev, actionIds |
| knowledgeProposals | id/code, rev, topic, home, factIds, actionIds |
| facts | id, proposalId, type, text, who?, date, href?, private |
| placements | id/homeCode, itemId/act, section, rule, position, kind, headline, facts (who?, where?, at, verb?, quote?, notes?, until?, also?, promise?), next (owner, what?, at?)?, warn?, chips, rowRev?, teams?, gist?, fresh?, when?, msgs, subjects, personId?, workId?, todoIds, actionIds |
| actions | id, subjectId, rev, kind, label, staleness (exact/none), effect (sends/changes-system/local), expect?, needsConfirm?, meaning?, input? |
| health | id/key, text, since, actionIds |
| channels | id, name, link, actionIds |
| waiting | id/code, to, chat, text, at, link?, actionIds |

Page metadata contains schemaVersion, fetchedAt, owner, serverNow, seen,
sectionOrder and ordered placement ids, summary (off, paused, minute, handled,
catchup count/worth), status, tiles, also, details, catchUp.top, running, progress,
people (reminder recipients), ui (including noted), version (including checkedAt)
and settings. Person ids use projected subject/asker identity, not a name. Numbers remains a
separate query keyed by window; its rows use the same Done presentation.

The current projection cannot prove every effect's execution state. Only
pending changes from ItemCard are `proposed`; never infer `made` from a sent reply.
Unknown outcome remains `uncertain`. The durable call ledger stays on the server.

Zustand holds these normalized projections for selection, plus interface state:
route, find, sheet and `byRevision[code@rev]` containing editText?, answerText?,
askText?, reportText?, selectedOptions, excludedChanges, folds, pendingIds?,
result?. No result or edited draft is keyed by code alone. TanStack Query owns
fetches, retries, polling, structural sharing and invalidation; the normalized
store is a selector index of the latest successful query, not another cache.
Polling failures retain the last view with an explicit error and retry button. The normalized tables are an index of the query snapshot; no
independent fetch or stale-time policy exists in Zustand.

Dirty or pending cards pin their displayed entity snapshot and revision. A newer
fetch shows "Newer version available" without replacing the fields. Show new
version confirms discarding unsent text. Once accepted, the new revision never
inherits old text, folds or results. Pinning is tested during IME and pending
actions, not just on identical refresh data.

## One item, end to end

1. A token-authenticated fetch gets schema v1 from existing view and nextView.
2. Edge validation rejects an incompatible response visibly. Successful fetches
   normalize atomically, retaining equal entities so unchanged rows do not render.
3. useNowSections returns server-ordered placement ids. A memoized row selects
   one entity. Open changes only the interface route and records seen.
4. useItemCard resolves linked entities. Card parts remain replaceable; the
   unapproved redesign does not ship. Native text inputs stay mounted across
   refresh, including selection and IME composition.
5. A button emits `{submissionId, action, item, rev, expect?, input?}`. The server validates the offered
   action against a fresh projection, validates input and rejects a stale revision
   before enqueuing a structured existing runner answer. Free text is never
   concatenated into parseVerbs: a shared structured enqueue entry point preserves
   one subject and the exact text. Chat parsing remains in the chat entry point.
   Change meaning is visible before ok. Manual Undo eligibility matches the
   runner and refuses expired windows before queuing.
6. Accepted ids are polled, never resubmitted. Pending is not success. Applied
   results invalidate data; refusal is visible; timeout offers Check again, not
   another send. Results remain attached to the submitted revision. Each click
   has one UUID submissionId persisted in browser session storage until resolved,
   with its receipt persisted on the server and de-duplicated on the
   server. A lost response says "Not sure it went through. Checking..." and looks
   up that receipt; sending stays disabled, including after reload, until known.
7. Undo is offered for every server-advertised unexpired send, including manual
   sends. It never claims to reverse effects already made.

### Versioned API contract (M2 gate)

- GET /api/v1/page: normalized Snapshot v1, no executable command strings.
- POST /api/v1/actions: maximum 20 KB, strict discriminated input. Text is a
  separate field; picks/exclusions are bounded arrays of offered numbers.
  Edited replies plus excluded changes are explicitly refused, matching today.
- GET /api/v1/result?submission=: accepted ids and current result, or unknown.
- GET /api/v1/numbers?window=: existing counted rows and totals.
- Status: 202 accepted with ids, 200 immediate result (including no-id actions),
  409 stale, 410 no longer offered, 422 invalid input. Unknown outcome is not
  represented as successful or refused.
- exact staleness for approvals, send/edit, pick and undo; none for read, Later,
  Pause and non-destructive navigation. Workflow revisions are canonical SHA-256
  approval digests over lifecycle, conversation, draft, ordered stable change and
  option identities/meaning, sent message, open to-dos and actionable work. Logs,
  status and housekeeping timestamps do not change editor identity. Automation
  and proposal approvals use equivalent content-derived digests. The existing
  revAt timestamp is separately carried to the older runner gate.
- The same approval precondition is rechecked at apply before positional choice/
  exclusion mapping or the legacy correction path. Undo binds the sent-message
  identity; Mark done carries exactly the shown to-do ids. Row presentation
  timestamps remain separate; the newest shown to-do time is its selection bound.
- Waiting entries have no approval revision today: their follow-up/dismiss
  actions use staleness none, and only draft or remove the waiting record.
- Registry also covers health, update, report, missed, watch/unwatch, automation,
  first-time note and mark-read. No component formats a command.
- Tests inject literal ", ok A9" into edits, answers, reports and note reuse:
  exactly one structured answer must retain the full text on the intended item.
- Tests drop an accepted response, reload and double-submit one submissionId:
  one answer only, with the original receipt recoverable.

## Growth

- New kind: add server projection and a registered body component; shared header,
  Why, sources, actions and Ask remain unchanged.
- New section: add server section metadata; generic section iteration needs no
  placement rules in the browser.
- New screen: add a lazy module and navigation entry, with a query/resolver.
- New action: add server registry entry and typed input contract; components
  render offered action data rather than format another command.
- Additive v1 fields remain compatible. Breaking changes get a new API version.

## Build and validation

Vite emits self-contained assets to dist/web-react; scripts/build.ts includes
them in INTEGRITY. Runtime needs no dev dependencies. Serve only manifest-owned
assets with the existing token and localhost checks; no arbitrary path reads.
All asset requests retain ?t, including cold lazy imports and preload CSS; a
fixture browser test is the gate for the chosen manifest-owned URL rewriting.
The preview has its own CSP; external links use no-referrer and allowed schemes.
Missing chunks after an update offer Reload without discarding unsent edits.
When version.code changes, proactively reload only when there is no unsent or
pending work. Otherwise disclose the update and let the owner reload later.
Heavy screens load lazily. Typecheck covers both pages; old page goldens stay
unchanged except for the menu. Fixture servers use temporary stores only.

Milestone gates: targeted red/green behavior tests, mutation checks, typecheck,
build/integrity checks, publish cleanliness, full suite once before commit,
separate-session review and inspected desktop/mobile light/dark screenshots.
Measure a 500-row update in a production browser; report the timing and method,
not just a threshold assertion. No real-owner data is needed or accessed.

## Decisions

- bug 10-22 catchup-row-controls (owner, 0.2.1): a row's interactive controls
  must never become its surrounding Teams navigation. Explicitly isolate
  buttons, watch fields, labels and local disclosures at the React Catch up
  article boundary, after each control runs its own handler. Preserve native
  form defaults; prevent control-zone anchor defaults only if an
  enclosing link exists. Use the original event path even when a control
  removes itself during its handler. The ordinary source anchor is untouched.
  Apply the shared boundary to Classic Done/Numbers, Classic Home's compact
  rows and New Done/Now. No new hover text: today's Watch and Needs me have no
  title/aria-description. Initial standalone legacy/React checks did not
  reproduce the owner's runtime; verify the explicit boundary with a
  surrounding navigation listener as well as ordinary links, rather than
  claiming that baseline reproduction. Manual Edge acceptance1280light and
  400dark: Watch saves exactly one tracker, Needs me moves its item to
  Needs you/Your move, neither opens Teams, and the body link still does.
  Fictional store/effects only; no tests or changes to runner verbs.
  Before/after scope: standalone baseline passed; with a surrounding
  navigation listener, the old Watch opened both its form and a Teams tab.
  The fixed bundle isolates all controls at both sizes in all four React
  surfaces, with zero ancestor activations and one explicit source tab.
  Mark the controls zone too: disabled buttons use pointer-events:none and
  must not turn a click through their footprint into row navigation.
  A containing-anchor check preserves Watch but cancels its link default;
  a native submit inside a row still submits once.

- bug 10-22 E16.classic.invite-attendees (R2): the meeting strip reduced
  attendee identities to three decorative, aria-hidden initials. Show every
  attendee label from the existing meeting projection (names and emails as
  supplied), like New, beneath the meeting time with an Attendees label.
  Keep the Classic avatar stack decorative; do not limit the identity list
  to its first three people. Wrap long names/emails at narrow widths. Visible
  text is preferable to initials or hover-only titles, which cannot identify
  invitees reliably on touch or for assistive technology. No new lookup,
  recipient inference, change payload or approval behavior.
  Manual Edge acceptance: fictional invite proposal, 1280 light and 400 dark,
  same-initial names and a fourth invitee all readable before approval;
  names remain visible when the selectable change is toggled, zero effects.
  Build only; no tests. Keep the separately held E57 patch out of this commit.

- bug 10-22 E12.real-g1-unrelated-owner-post-not-a-reply (R2): an owner FYI
  closed an unrelated room ask merely because it named the asker. Neither a
  name mention, one open item, nor a 1:1 message proves an answer. Preserve
  Teams reply-to/messageReference and Skype quote target IDs: a link to the
  item's ask is evidence. Otherwise classify the owner's new words against
  all open asks and their context in one read-only AI run; only explicitly
  selected item IDs may close. Quoted old words are not a new answer.
  Use the same check during intake and immediately before approving/sending.
  Persist the per-item verdict with the owner message and the ask ID so the
  pre-send check can reuse it but cannot apply it to a newer ask. An unrelated
  owner post must not reset the ask's age. Failed/invalid AI judgments surface
  health and hold sends; they never mean "already replied" or permission to
  duplicate a possibly real reply. True contextual and linked replies still
  close their items, not other asks. Build plus manual New/Classic 1280 proof
  on a fictional root with isolated real CLI; no tests.
  Proof: the real CLI rejected the named-room FYI and unrelated 1:1 FYI,
  leaving all asks and their original ask times intact. A contextual answer
  closed only the ownership ask; a Teams messageReference closed the date
  ask with no extra AI run. Both experiences show the true replies in Done.
  Before Send, an unread unrelated FYI allowed one exact approved reply;
  an unread genuine owner answer closed as replied with zero duplicate
  sends. An unavailable judgment CLI held the reply with visible health,
  not a false answered state. COPILOT_HOME and both XDG homes isolated;
  zero new owner session entries.

- bug 10-22 E24.real-literal-not-learned-as-facts (R2): edited sends remain
  literal messages, not commands or factual evidence for item-code topics.
  Skip learning inputs that contain A/K/R/H item codes or parsed controls;
  log why. Carry the original sent text/source on learning jobs; recheck it
  at report acceptance (including old jobs), reject code/control claims and
  bind accepted facts to the actual send, not an AI-invented citation.
  The learning playbook permits descriptive facts only, never instructions,
  quoted examples, requests or to-dos. Legitimate factual corrections remain.
  On successful reply Undo, durably mark its source withdrawn, remove that
  source from personal/team knowledge and proposal rows, and retire only
  entries with no independent source left. Preserve other sources and facts,
  including the owner's unrelated Markdown notes. Late learning/bootstrap
  reports cannot recreate a withdrawn-source fact. Knowledge Undo must not
  restore a withdrawn source from an older entry. Failed message withdrawal
  leaves knowledge intact. Build and manual fictional-root/real-CLI proof;
  no tests or changes to the literal-send control parser.
  Proof: New/Classic 1280 sent the literal text exactly with zero learning
  jobs and no control state change. Real isolated CLI learned a Thursday
  factual correction but no claim from an instruction-only send. Undo of
  the literal send removed seeded pre-fix A999/R999 facts; Undo of the factual
  send removed its learned fact. A two-source fact kept its independent
  source. Both Done views show only that supported fact after withdrawal.
  A late source report cannot revive the pollution; personal/team withdrawal
  also preserves unrelated Markdown notes. Zero new owner session entries.

- bug 10-22 E25.classic.real-unchanged-signed (R2): the projection already
  carries the exact approved sendText, including the configured signature,
  separately from the editable raw draft. Classic must display sendText when
  present, just as React New does. Keep the raw text for editing: owner-written
  words are deliberately not auto-signed. Do not format or append signatures
  in the browser. Ranked cases: signed AI draft, explicit ok, already-signed
  draft (one signature), signing disabled, owner edit (no signature added).
  Alternatives were browser-side signing (duplicates server policy) or raw
  preview (hides part of the approved send). Use the existing canonical field;
  this is an approved parity repair, with no new layout or action.
  Manual Edge acceptance at 1280 light and 400 dark: preview equals the actual
  sent text byte for byte, including its signature; one ok sends it once.
  Build only, no tests or shared engine changes.

- bug 10-22 E13.classic.real-answer-preview-send (R3): the server already
  supplies a question type, answer action and optional placeholder draft.
  Match today's Classic question body: always show Your answer; do not show
  that placeholder as Your reply or offer Edit reply on a question. Ranked
  cases: question with placeholder, question without draft, answer-to-preview,
  explicit ok, reopened question, failed-job directions, choices and reviews.
  Keeping the placeholder beside the field or treating it as an editable reply
  would differ from today's question card. Retain the existing answer/preview
  action gate, not a second send path. A successful old Current item fallback
  receipt must not describe a reopened question as skipped: show today's
  "Nothing is sent yet. You will see the reply first." guidance when its
  revision is obsolete. Preserve actual refusal/uncertainty and receipt data.
  This is the coordinator's approved parity repair, not a new UI design.
  Manual Edge acceptance: fictional roots, 1280 light and 400 dark, answer
  produces a preview with zero sends; one ok sends the exact preview once.
  Both Done rows independently show that preview. Replaying the same saved
  submission keeps one send; a new submission using the old ok gets 410,
  and another apply pass still leaves one send. The dismissed/reopened
  question reproduces the old Skipped fallback and now shows the guidance.
  Build only; no tests or shared engine/API changes.

- bug 10-22 E55.classic.owner-active-held-time: a due scheduled reply held
  by recent owner activity showed its correct Held status but still claimed
  Sends at a past time. Today's Classic shows the held status, not a send-time
  promise. When running-row detail starts with Held:, suppress the scheduled
  time sentence and do not fall back to a work-progress bar. Keep the existing
  held explanation, rule/text headline and Hold action. Unheld scheduled rows
  retain their send time. Manual Edge 1280 light/400 dark from real dueSends
  with ownerLastAt one minute ago and Available presence: scheduled retained,
  zero sends. Presentation only; no runner/projection changes or tests.

- bug 10-22 E49.classic.promised-checkback-stop: In-progress rows projected
  the existing stop-watch action but filtered it out before RowActions, leaving
  only Close/Mark to-dos done. Include stop-watch beside classic-close, retaining
  the existing ghost styling and classic-extend Timing action. Stop uses the
  shared unwatch verb, not Skip/Close. Manual Edge 1280 light and 400 dark on
  fictional open work: Stop ends only its check-back, clears scheduling, leaves
  work and owner to-dos open and the original sent reply intact; zero sends.
  No runner/projection changes or new layout. Build only, no tests.

- bug 10-22 E88.classic.viewport-integration: shared ViewportList integration
  replaced the Classic-only queue, losing narrow unmounting/memoized links.
  Its document-scrolling target was also reset by Classic route scroll, leaving
  direct A599's queue link far below the viewport. Restore media gating at
  960px and memoized QueueItem on top of the shared ViewportList, not another
  window. Add an opt-in scrollable mode to ViewportList using its own list
  scrollTop/clientHeight and nearest-target scrolling; existing document-list
  callers keep their behavior. Remove old fixed row heights; shared measured
  row sizes plus gap govern offsets. Preserve pins and visit snapshot cache.
  Manual 500-row Edge at 1280 light/400 dark: direct A599, keys/pager, scroll,
  pin/latest edits and handled/removed visited fallback. Report measured redraw
  ms explicitly; no tests, test-file edits or typecheck.
  Observed native polling ingest-mark to DOM: desktop 7.2/7.0/5.2 ms; narrow
  11.8 ms. JSON decode 2.3-5.6 ms and validation 11.0-14.3 ms are separate,
  so do not claim whole data-arrival-to-DOM <16 ms. Direct A599 queue link
  stays visible with document scroll zero; narrow mounted queue links zero.

- bug 10-22 E90.classic.current-policy-reason: Classic's ActionButton used
  shared live unavailability to disable/title approvals, but never printed the
  reason next to the primary. Show the current action's unavailable.reason
  beside the disabled approval, including when the card is pinned. The New
  builder owns the shared policy projection and pre-apply refusal; do not
  duplicate allowlist logic here. Manual Edge both sizes with a removed-ring
  policy reason; no action can queue and typed text stays. Full shared
  allowlist-after-proposal acceptance is separately rechecked after integration.

- bug 10-22 E88.classic.large-queue-redraw: Classic built all 500 queue links
  even when hidden at 400px, then repeated the whole render to save visit
  snapshots. Do not mount the hidden queue. For >80 entries, preserve the same
  list/pager but window its scrollable queue to 18 fixed-height rows with
  spacers; selecting off-window cards scrolls their queue position into view.
  Memoize unchanged queue items. Retain historical snapshots in a ref and
  update visit order only when IDs arrive, not every poll. No shared store
  changes. Manually measure 500-row delivery/render, focus/edit/scroll retention,
  last-row navigation and narrow reachability; report timing rather than
  assuming the shared 16ms whole-ingest target is met.

- bug 10-22 E93.classic.family-member-reachability: a family lead collapsed
  its member out of the Classic queue and marked a directly opened member as
  settled, hiding its pending draft. Include needs_human family members in
  Classic's own needs IDs and provide explicit per-member card links using
  existing placement subjects. Cards/actions remain keyed by exact member,
  never the family home. New grouping/runner unchanged. Manual Edge both
  sizes: lead -> member -> lead, distinct draft/person/chat, send member once,
  lead draft and state untouched.

- bug 10-22 E79.classic.reading-health: an hour-old or never-checked source
  falsely showed healthy On. Preserve On/runs for recent checks, but use the
  existing reading off/never states for Not checked since / Not checked yet
  and warning status. Pause/Stop/offline keep precedence. Header is focusable
  with full status/last-check/machine label/title at narrow widths where text
  hides. No data/runner change. Manual Edge 20/60/never and paused/stop cases.

- bug 10-22 E55.classic.scheduled-send: a rule-scheduled reply appeared as
  generic Running with only Open on your computer. Reuse its existing scheduled
  placement headline and exact Hold action, expose sendAt on Classic Running,
  and show a semantic send time instead of an indeterminate work bar. Hold
  applies the existing later verb to the exact scheduled item; no new send
  or runner behavior. Manual Edge 1280 light/400 dark, Hold before due and
  confirm scheduled send is cancelled with no outbound chat message.

- bug 10-22 E37.classic.job-diagnostics: blocked/exhausted holding cards
  suppressed all run-failure attention and Running cards omitted retry reason.
  Keep the long grey block removed, but add an inspectable run-detail disclosure
  with a concise reason (full blocked/routes/exhaustion text retained inside).
  Running rows show stored status or typed retry reason/time/attempt/routes
  from their own job. No retry scheduling or action changes. Manual Edge both
  sizes with blocked two-route, scheduled transient and exhausted cases.

- bug 10-22 E35.classic.failed-promise-skip: a failed promise mapping offered
  Check again/Later but hid the existing Skip action in More. Show the existing
  exact dismiss action beside the primary for promise cards, just as recovery
  and proposed-work cards do. Skip drops only the target promise; sent message
  remains, no new send or retry. Build/manual Edge at 1280 light and 400 dark.

- bug 10-22 E31.classic.non-review-change-selection: a reply/promised
  non-review card with two plain comment effects offered Post 2 comments and
  reply, but rendered only Also summaries with no selectable rows. Reproduce
  with pending exact comment calls lacking PR/ring meaning or errors. Always
  render the existing shared-in-card change list for non-review pending
  effects, including exact target/content/arguments and current selection
  count. Remove the redundant Also summary; review layout stays unchanged.
  Reuse existing excluded-input approval and revision/receipt gates; no
  runner/projection changes. Manual Edge 1280 light and 400 dark: uncheck one
  of two, approve once, actual makeChange ledger applies only the kept exact
  comment, then checkJobs sends one reply. No tests or test-file edits.

- bug 10-22 R1.classic.numbers-exchange-clamp: after per-send original
  context landed, long multiline asked/You text rendered in full in every
  Classic Numbers list. Reproduce with a counted send containing twelve-line
  original ask and reply. Match today's CSS-only two-line ellipsis for each
  exchange line, normalizing visual whitespace without truncating stored/DOM
  text. Keep the exact counted-send Open in Teams link as today's full-exchange
  path. Scope only counted ask/said, not other text, Catch-up or New. Manually
  compare 1280 light and 400 dark, including two-line geometry, full text
  retention, source identity and unaffected short rows. Build only; no tests.

- bug 10-22 Y1.classic.numbers-byline: counted non-reply rows without a by
  field must show only time/source, as today's Classic does, not the person's
  name. Reproduce with a closed item under Numbers > handled. Match today's
  row-kind byline rules: reply/review retain person/chat/by, other rows show
  by only (learned rows omit it). Preserve semantic time/source and fallbacks.
- bug 10-22 Y3.classic.ask-apostrophe: the Needs you Ask note used a straight
  apostrophe in item's session. Match today's typographic item’s session.
  Cosmetic text only; Ask input/action unchanged. Both corrections manually
  compared with today's fictional Classic at 1280 light and 400 dark; one
  build/commit, no test files or test runs.

- bug 10-22 classic-home-extra-keyboard-button: Home ended with an extra
  Keyboard shortcuts footer button absent from today's Classic. Remove only
  that footer; keep the existing ? shortcut, help dialog and focus-pager key
  button. Version/update/report stay in Home's existing grouped line. Manual
  Edge Home and pager help open/close at 1280 light and 400 dark; no key handler
  or action changes.

- bug 10-22 classic-card-wording: reproduce a low-confidence card and a
  holding draft at desktop. Classic used lowercase low confidence and a fixed
  send shortcut label. Capitalize the displayed confidence label and derive
  the key hint from the same pinned/current card presentation as its primary
  button, so holding drafts say send holding reply (and edits stay accurate).
  The narrow hint strip remains hidden; no key handler/action changes. Manual
  paired Edge 1280 light and 400 dark, including low confidence, holding and
  normal send labels.

- bug 10-22 classic-numbers-empty-by: a counted closed item whose by field is
  empty rendered Name · · time. Join only present name/chat/by metadata before
  the existing semantic time/source link. Missing-item and missed-message
  fallbacks remain unchanged. Manual Edge fictional no-by row and normal
  Catch-up rows at 1280 light and 400 dark; no counting/action changes.

- bug 10-22 classic-numbers-catchup-actions: reproduce Numbers > handled/asks
  with a recent counted FYI: the static Classic row had a check icon and no
  Watch or Needs me. Follow New's counted-row approach by resolving the current
  typed Catch-up activity and reusing Classic ActivityRow, including its exact
  watch form, deadline controls, Needs me action, receipts and staleness guard.
  Older rows without a current activity keep static inspection with an eye
  icon, not a fabricated action. Scope borders to the Numbers list wrapper.
  No runner/action/revision changes. Manual Edge 1280 light and 400 dark on
  fictional rows; actual tracker creation and Needs me handoff verified.

- bug 10-22 classic-menu-app-version-place: at 400px, open Classic A20,
  choose App version Classic then React. The old code reloaded a legacy page
  with an unsupported classic/ address, then dropped the card's address when
  returning, landing on the start screen. After a successful preference save,
  map to the selected legacy experience's supported address and remember the
  exact React/legacy route pair in session storage. Preserve the legacy address
  when choosing React; restore the prior React place only while that address
  still matches, so intentional navigation in legacy is not overwritten.
  Failed/discard-cancelled switches do not alter the route. Existing legacy
  Classic/New flips keep their prior shared-tab behavior. Manual 400px Edge
  card and Ongoing subsection round trips via both app versions; build only.
  The small legacy-address adapter stays within the React client boundary;
  importing the old page's pure routing helper is prohibited by the build.
  Restore the Ongoing section after its first snapshot arrives, not only when
  the hash changes: cold version reloads otherwise kept the URL but left the
  requested section below the viewport. Polling does not reset the scroll.

- bug 10-22 classic-menu-experience-place: at 400px, open A20 and switch
  Experience to New then Classic via the menu. The old mapping went to Now
  then Home, losing the card; Ongoing sub-sections were also lost. Map open
  Classic cards to their New row, and remember the last switch's exact route
  pair in the existing navigation store so an unchanged return restores the
  original card/sub-section. Shared screens keep their normal equivalent
  route mapping; navigating elsewhere invalidates the paired return naturally.
  No server command or item write. Manual Edge card and Ongoing round trips,
  including unsent edit preservation, at 400px light/dark; build only.

- bug 10-22 N5.classic.settings-copy: the earlier experience-aware Settings
  fix already restores Waiting on others and on Home. Reproduce the remaining
  mismatch by opening Updates: React rewrote the server's Off option as check
  manually in both API and client, and rendered an unstyled More disclosure.
  Scope the API's New wording to New; remove the Classic client override.
  Keep the server's exact
  Off: run "delegate update" yourself label, and style More as today's uppercase
  section heading. No option values, settings save path or New UI changes.
  Manually verify all four requested strings, save Off in the fictional store,
  reload and check the disclosure in Edge at 1280 light and 400 dark.

- bug 10-22 N6.classic.holding-card: reproduce a holding draft with a long
  failed-run status, commitment=true, promised todos and a plan owned by them.
  Classic must not inject the run-status block above the holding reply. Keep
  the commitment warning even with Yours to do, render the canonical Others
  plan role as today's them, and name the Ask field with its actual item code.
  Add a minimal optional attentionKind to distinguish reply-changed safety
  notices from run failures; hide only holding run failures in Classic, never
  the explicit reply-changed refusal. New keeps all existing attention text.
  No mutation action/revision changes. Manual Edge at both required sizes,
  including the reply-changed warning and an actual fictional Ask handoff.

- bug 10-22 N1.classic.numbers-exchange: reproduce Numbers > handled, asks
  or replies with a closed replied item. React hid ask/answer in a collapsed
  Replied to summary and showed grey Work: Closed text. All lists now render
  the existing ask/said fields as the visible first-name asked / You exchange,
  including the in-Teams marker, with the existing work summary as a chip
  (green when Closed). Keep codes, source links, repeated-send counts and
  missing-file fallbacks. No new data or counting/runner behavior. Manual
  paired Edge at 1280 light and 400 dark; build only, no tests.

- bug 10-22 classic-snapshot-decision-detail: reproduce with snapshot A3/A6/A5:
  the abbreviated React snapshot omitted choice labels, exact proposed
  changes, meeting, context, work and sources present in today's snapshot.
  Reuse ClassicCard in explicit readOnly mode, with current snapshot entities,
  no pinned/transient edit state, autofocus, mutation menu/footer/Ask, editable
  fields or action receipts. Choice/change inputs are disabled; thread/why
  disclosure uses local folds only. Keep rich sections, promises, notes and
  Teams/source links. Snapshot headings nest h3 under Needs you. Mounting
  useCardPresentation/useEdit reads state or creates callbacks only; ClassicWhy
  contains only inspection links/disclosures. Global snapshot keyboard refusal
  stays. Normal focused-card behavior and action gates remain unchanged.
  Manually inspect decision detail, attempted shortcuts and retained live
  edits in Edge at 1280 light and 400 dark; no test files or test runs.

- bug 10-22 classic-home-version-group: reproduce on Home with daily checks:
  update/report were detached from version/status and the footer said every
  1440 minutes with a full locale timestamp. Restore the existing Classic
  grouped line, once-a-day/hour/minute wording and short checked time; keep
  keyboard help and the safe reload banner. Existing server version.last
  rollback metadata must survive the shared schema (optional to/rolledBack),
  so a failed new version is not mislabeled Up to date. No new producer or
  update action is added. Details remain under Settings > More. Manually
  inspect normal, failure and rollback metadata in Edge at both sizes.

- bug 10-22 classic-numbers-window-alignment: reproduce at 1280px on Numbers.
  A shared heading pseudo-element consumed flex space after the window/range,
  leaving them beside the subtitle rather than at the right edge. Suppress
  that spacer only for Numbers at every width (previously mobile only), and
  align its header controls with the subtitle. Other tools keep their layout.
  Manually compare desktop light and narrow dark Edge with today's Classic.

- bug 10-22 classic-mobile-keyboard-legend: reproduce by opening a focused
  reply at 400px; React showed a wrapping desktop key legend below it while
  today's Classic hides that strip. Hide only classic-key-hints at 600px and
  below. Keep the pager help button, keyboard dialog and shortcut handlers.
  Manually check 1280 light and 400 dark in Edge; no test files or runs.

- bug 10-22 classic-settings-places: reproduce in React Classic Settings,
  Updates and system: Look for updates incorrectly points to Now, and the
  unanswered-asks label says Waiting. Pass the requested experience into
  settingsView before its wording transformation. Classic retains Home and
  Waiting on others; React New and legacy defaults keep their current words.
  No settings keys, values, write paths or action gates change. Approved in
  the separate Classic parity spec review; prove manually in Edge, no tests.

- bug 10-23 G9.classic.reader-time: today's Classic Home version line does not
  display reader identity or timestamp. Remove React Classic's added Reading
  on/Last reader line rather than introducing a new date format. Keep the
  shared reading metadata for status/health and leave New unchanged.

- bug 10-23 G3.classic.missed-message: Home restores the inline missed-link form
  with Make an item, reusing paste-missed and shared page-form capture/consumption.
  Editing a completed form clears its resolved receipt, as opening the shared
  sheet does, so a new attempt is not mistaken for the previous submission.
  Pending/uncertain receipts remain protected. Server validation and intake
  remain authoritative; queued links become items
  when the runner reads them, not at HTTP acceptance. Keep only update/report
  tools on Home, without the extra heading; Check now retains its existing
  Settings timing/source-health entry points, with no new Pause surface.
  Use section padding for the 28px gap above Also
  for you so heading margins cannot collapse it.

- bug 10-23 E41.classic.track: the proposed-work card reuses the exact offered
  Track action from New's track placement as its primary action. No new command,
  parsing or runner branch. Skip stays beside Track; answer text remains
  available to revise the proposal. Track applies ok to clear proposed, open
  the work and schedule checkAt; no reply is sent.

- bug 10-23 G1.classic.failed-home-hint: Home's peek uses the offered Try again
  recovery action to identify failed items and renders the requested answer/
  retry-or-skip guidance. Do not fall back to the raw incoming ask when command
  hint scrubbing removes the old question. Ordinary Home headlines are unchanged.

- bug 10-23 E38.classic.failed-job: reuse New's stopped placement to include
  recoverable failed items in Classic's created-time-ordered Needs you queue,
  excluding them from Running and its count. Existing answer(text) and skip
  handlers provide Try again with directions and Skip; expose both on the
  Classic card with existing exact management guards. The non-tracker answer
  path stores ownerAnswer and moves to running for worker replanning; it does
  not blindly restart the old job. Ordinary running items and New row actions
  retain their placement and commands.

- Classic promise/to-do parity follows the existing designer review, not a new
  interaction. The card renders projected current-draft todos before Send, with
  the warning icon. Kept todoIds have a distinct earlier-reply label and the
  existing E45 counted exact-ID action beside their visible texts. Exclude that
  action from the Send footer; show its revision-keyed pending/result state even
  after the completed list disappears. Preserve the generic commitment warning
  only when the concrete promise texts are absent. No E45 close-work behavior
  changes.

- Classic offer audit (bug 10-22 classic-offer-staleness): every management
  offer now defaults to an exact entity revision, cached once per entity in
  a projection. Its queued answer carries a manage guard rechecked against the
  same decision state and relevant watch settings before applying. This closes the interval
  between click-time validation and runner application; timestamps alone miss
  changed watch news or job-only end-date changes.

  Follow-up (bug 10-22 classic-management-bookkeeping): workflow management
  revisions explicitly select visible state/text, draft/choices/changes, open
  promises, work details, news/acknowledgement and watch interval/condition/end
  settings. Never hash the whole workflow or a job's nextAt, state, result or
  updatedAt: routine checks must not invalidate Stop/Extend. Workflow updatedAt,
  newCount and private notes are also excluded. Automation management reuses
  automationApprovalRev plus the displayed pause reason, not execution counters,
  next-send bookkeeping or updatedAt. For management offers only, click-time
  comparison uses the semantic expectation rather than also requiring the row
  timestamp to match. All explicit approval/Undo/E45 gates still compare both
  tokens and keep their own engine guards.

  | Offer kinds | Audit outcome |
  | --- | --- |
  | classic-ack-watch | Added exact workflow/news/ack and watch-job revision; stale acknowledgement cannot hide a later update. |
  | stop-watch, extend-watch, interval | Exact decision revision includes visible workflow state/text and every/until/endsAt; excludes cycle bookkeeping. |
  | classic-interval, classic-extend | Same exact workflow/watch-job guard for In progress controls. |
  | toggle, end | Added exact automation revision and queued recheck. |
  | follow-up, dismiss-waiting | Added exact waiting-record revision and queued recheck. |
  | accept-habit, defer-habit, never-habit, remove-rule | Added exact habit revision and queued recheck. |
  | review-again, answer, later, dismiss, ask, continue, report, classic-continue | Added exact management revision and queued recheck; no new command or effect. |
  | needs-me, non-approval row actions | Added exact workflow/waiting management revisions; row approvals keep their existing send gates. |
  | skip-facts | Added exact proposal-management revision and queued recheck. |
  | pause-resume | Added exact control-state revision and queued recheck. |
  | retry-source, check-update, mark-all-read, report-problem, paste-missed, watch-something | Added exact control-state revision before immediate execution; mark-all-read still validates the displayed time. |
  | stop-channel, health fixes | Added exact displayed channel/health revision before immediate execution. |
  | approve, approve-again, send-edit, pick, reply-only, use-note, reopen | Existing exact approval/reply/note gates retained. |
  | undo, wrong, incomplete, unneeded | Existing exact sent-message identity and feedback gates retained. |
  | save-facts, edit-fact, undo-facts | Existing exact proposal gates retained. |
  | watch-fyi | Exact source revision and cleared-until handling added in the separate watch prerequisite. |
  | classic-start | Existing exact automation Start guard retained. |
  | todo-done, todo-row-done, classic-close, classic-work-close, classic-work-wait | E45's exact displayed-ID and close-work helpers retained unchanged. |
  | remind-someone, chat-normal | Existing exact recipient/privacy gates retained. |

  Direct settings saves keep their existing settings-revision endpoint; this
  audit changes offered actions only. Non-page chat/runner answers have no page
  guard and retain their previous behavior. No owner data or Teams action is
  needed to prove the gate.

- Watch-fyi is an exact-revision immediate action: compare before execution,
  preserve an explicitly empty until string through the existing engine API
  (undefined would reinsert its AI condition). Shared ActionButton optionally
  prepares dynamic input at click; existing callers retain eager inputs.
  Keep preset identity separately from its date and clear it on custom-date
  edits or successful form consumption.

- Classic header retains the existing data and edit-discard App version gate;
  desktop Experience follows status, mobile Experience stays in Views. Restore
  860/560 px breakpoints and scope theme-button dimensions so New's open-menu
  full-width theme rule cannot move Classic's theme and Views offscreen.

- Classic E64 reuses the server's exact-revision `undo-facts` offer in Done,
  taking back the whole learned proposal with no client-side expiry. Per-fact
  undo and a hidden details-only action were rejected. Optional shared
  ActionButton accessible/pending labels preserve other callers' defaults.
  The reply-only `u` selector and snapshot remain unchanged.

- Exclude Finder's ignored .DS_Store metadata from shipped-file hashing. It is
  not a release asset; including it makes a clean integration build depend on
  an untracked local file. Keep real hidden assets such as Vite's manifest,
  and leave the local metadata file untouched.

- Closed Open-only rows subscribe only to their shown primary action, including
  any pinned snapshot. They do not create card-presentation/edit/mutation hooks
  until local controls actually need them. Keep the same DOM and pinned-input
  behaviour rather than virtualizing away editors or changing the layout.
  Cache bounded native hour/minute labels by instant, timezone offset and
  browser language rather than freezing an Intl formatter's timezone; keep
  the same options and invalid-date output. Stable row facts are memoized
  separately from changing headlines, with a shared local-day/timezone key so
  relative labels change across midnight and timezone changes. A changed entity
  revision already proves inequality; do not serialize both versions merely
  to rediscover it. Equal-revision and unversioned metadata still use the
  existing full-content comparison.

  Production Chrome, fictional 500-row draft changes: ingest through React
  layout-effect completion measured 15.0, 10.4 and 10.3 ms after an initial
  36.2 ms baseline. This excludes network, JSON parsing and compositor paint.
  Actual local controls, selected changes, edited send/Undo and focus/IME
  retention were driven again; day rollover and changed metadata still update.
  Live UTC/New York/Tokyo switches match native time labels without reloading.

- Promise checks run after the owner's words were sent. Preserve their
  conditional/refused-action to-dos with the existing keepTodos helper at that
  send's time; merely appending turn-local todos made them invisible in both
  experiences. Keep only newly returned text, so completed earlier to-dos do
  not return. Do not invent browser-side placement or send another message.

- A failed promise's Check again is local work, not an external change: it
  requeues inspection without sending or voting. Classifying it as an external
  change incorrectly hid the row control behind Open. Keep its exact revision
  binding and the promise-specific Skip wording. Actual votes still require
  opening their meaning and approving, preserving New's no-row-changes rule.

- Seen tracking follows displayed row identities and real-news timestamps, not
  every polling revision. New rows join viewport observation, and an open row
  saves again after newer news. Reusing a mount-only observer missed both;
  depending on whole snapshots would continually cancel the dwell timer.
  Pinned edits retain their shown placement and cap marks at that snapshot's
  time, so undisplayed newer messages are not accidentally acknowledged.

- Keyboard navigation resolves both a section route and an open placement
  before choosing its queue. From Working, j/k stay in Working instead of
  accidentally opening Your move. Keep the existing section-local keyboard
  model rather than inventing a second global pager.

- Keep New's compact Done rows rather than restoring a second full card inside
  each exchange. Eligible quiet closures expand to the existing revision-bound
  Reopen-and-draft field/action; reopening never sends. Sent details retain
  confidence, sources and gaps, plus available searched places labelled as
  current item context rather than invented historical evidence. Leaving the
  controls unreachable would lose parity; nesting the whole card duplicates it.
  Classic's shared Entry branch remains unchanged.

- An active-session/window hold is recorded as a refusal on both answer and
  final-send paths. Holding it safely is not successful completion: show the
  alert and keep the exact edit available for a deliberate retry after the
  window closes.

- Page forms capture only their owned raw fields at submission. A successful,
  certain receipt consumes that group only if none changed and no composition
  is active, including completion after the sheet unmounts. Accepted unchanged
  sheets close like New; later typing stays open. Reopening starts a fresh UI
  attempt without replaying the old submission. Interval no-ops are refusals,
  so their input is not consumed. New's tool dialog uses the existing centered
  sheet dimensions and product tokens. Only the still-pending submission may
  complete a UI receipt; duplicate or older deliveries cannot consume new work.

- Find filters current results without unmounting revision-pinned unsent work.
  Reuse the same dirty-state predicate and server-provided pinned placements;
  show retained work separately from the match count. Hiding an active editor
  when a new draft stopped matching the query lost focus despite keeping its
  words in the store. Explicit review/close remains the owner's choice.

- Keep the existing revision-pinned editor mechanism: fresh paired browser
  checks retained the same node, focus, selection and words through actual
  question/source polls and a move to Working. React ignores composing Escape;
  today's New blurs on that synthetic event. A refused queued edit keeps later
  typing. No replacement state engine was needed.

- A nonempty change-approval hold is a refusal, not a successful application.
  Persist that flag through the existing reply/outcome path so the page shows an
  alert, retains the owner's selection and permits a deliberate retry after the
  permission is restored. The empty hold that successfully queues work remains
  accepted.

- Habit choices keep New's compact primary Turn on and secondary Not now/Never,
  with the exact server evidence and learned provenance. Chat-normal controls
  retain their existing confirmation and revision guard; a classification
  changed while the confirmation is open is refused rather than cleared.

- New's manual update control lives once in the shared footer, not again among
  Now's tools. It uses the existing typed check-update action and updater,
  retaining the existing unsent-edit reload guard. Fictional browser validation
  suppresses the real updater process with the existing DELEGATE_NO_KICK seam;
  it does not update this shared checkout. A tool section shows results only
  for its own offered controls, so the footer acknowledgement is not duplicated.

- A changes-and-reply approval carries its reply digest through the existing
  approved-work context to the final sender. If the signature or reply changes
  while the work finishes, keep made changes but hold the reply for review;
  neither silently substitute the new signature nor freeze an obsolete one.
  Store the actual signed body separately from learning's raw text, so expanded
  Done history is immutable even when signature settings later change. The
  existing retention sweep clears both copies together.

- The approved AI reply preview uses the sender's shared signature formatter,
  including first-name expansion and duplicate suppression. Raw draft text stays
  separate for owner edits, which do not gain a signature. Signed presentation
  changes invalidate the shown revision; queued page approvals also recheck the
  expected reply digest before applying. The Classic-owned renderer can consume
  the additive `draft.sendText` field without changing its edit field.

- New Settings keeps the server's field kinds, option text and setup guidance
  verbatim, with suggestions before standing instructions and a separate
  permission-switch group. Reuse New's narrow, grouped rows rather than adding
  another settings editor. Metadata deep links open More and focus selects too.

- The New facts destination retains today's To learn heading, personal/team
  destination, selected count, fact types and linked person/date provenance.
  Keep the owner-requested single-fact Edit in addition to Save and Skip;
  these continue through the same revision-pinned typed actions.

- New Done opts into compact exchanges and expandable sent details; Classic's
  shared Entry remains unchanged by default. Reusing the whole open-item card
  repeated the chat, ask and draft in sent history, so New keeps only its
  revision-pinned feedback, sources and private Ask. Empty filters are hidden;
  quiet closures live only beneath Catch up, as in today's New.

- Numbers uses the existing server model and rule table, with New's compact
  cards and read-only Done-style counted rows. Reusing interactive Done entries
  would expose unrelated actions; grouped duplicate sends instead stay one row
  with an explicit multiplicity. Styles are scoped to New, not Classic.
- Numbers fetch errors replace old figures rather than leaving stale totals
  beneath an error. The window select stays mounted through counting/retry.

- Paired New parity: reuse the existing typed local row actions and keep Tell
  below the metadata, as today's New does. Keeping every action behind Open was
  simpler but hid New's local work controls. Sends and external changes still
  require Open; no browser command parsing was added.
- Single-choice selection requests its typed preview immediately, like New;
  multi-choice and Other keep their explicit draft action. No selection sends.
- An inline work-only history uses the server's newest-first placement history;
  an approval card keeps its chronological card history. The two normalized
  histories are not interchangeable.

| Decision | Options considered | Choice and reason |
| --- | --- | --- |
| Documentation location | External specs; repository-local specs | Local dev-spec, pm-spec and design-spec: the brief restricts writes to this worktree; no external spec or real-data writes |
| Layout | Rebuild Classic; adopt unapproved card redesign; preserve New and current card | Preserve approved New layout and current card anatomy; swappable card parts allow a later redesign |
| Data ownership | Browser placement; existing view directly; normalized v1 adapter | Server-normalized v1 over existing functions; avoids duplicate rules and enables typed actions |
| Routing | Router library; hash navigation | Hash navigation initially; four screens and item links do not justify another runtime |
| Action safety | Browser command formatting; server registry | Server registry with fresh revision and offered-action checks; runner remains unchanged |
| Settings | New settings engine; existing settings endpoint | Existing saveSetting and metadata; no duplicated validation |
| Styling | Artifact theme; product tokens | Product visual.md tokens are authoritative for this app; not a standalone HTML artifact |
| Review | Subagents; linked independent chat | Separate linked review session, as the owner's process requires |
| Scope honesty | Placeholder tabs claimed complete; milestone gates | Preview remains explicitly incomplete until parity tests and the scenario matrix prove it |
| Restart directive, section 8a | Tests before screen; browser-first | Build each screen and prove its real fixture-server browser flow first, then add the cheapest useful unit/invariant coverage. Approval race gates still run in browser before activation |
| Extra M1 rebase | Keep old engine; integrate current truth gates | Rebase onto 9078007, preserve its send boundary/PR reconciliation/work/intake/placement changes, and retain the optional React apply-time preconditions |
| Class composition | External cn package; owned utility | Replace cn with a local clsx + tailwind-merge helper. It handles conditional classes and caller overrides; all lock URLs remain public-registry URLs |
| New header sizing | Native select intrinsic size; reserved allocation | M1 introduced the native version select with no size constraints. Its longest unselected option and platform font/control metrics can resize the header. Reserve a 148 by 28 CSS-pixel control inside a nonshrinking positioned menu; do not delay or weaken the first-screen assertion |
| Review P0 action safety | Command strings; structured enqueue | Shared structured enqueue and persistent submission receipts are required before M2; no React action ships before adversarial text and lost-response tests pass |
| Revision changes | Replace fields; pin dirty/pending snapshot | Pin the displayed revision, disclose newer data, and explicitly confirm discarding input |
| Panel/snapshot | Try to mount React; preserve supported renderer | Panel falls back to New, snapshot stays Classic; React preview is browser-only |
| Test runners | node:test only; requested component stack | Keep Vitest/Testing Library as explicitly selected by owner, alongside fixture-backed node:test browser tests |
| Schema drift | Manually remember fields; coverage assertion | Projection tests must account for every existing view/card/row field, mapped or explicitly dropped |
| Classic extras | Add tabs; place in existing surfaces | Watches/reminders and channel management in Now Waiting footer/sheet; the approved Since line replaces Home tiles; missed-message paste in Find; knowledge queue linked from Now minute line; update/report/version in footer |
| Activity edits | Component-local fields; normalized revision fields | Feedback and watch forms use the same pinned revision mechanism as drafts. Retain the old activity when a replacement send changes its row id; block editing another version of that item until explicit discard |
| Receipt retention | Bounded outcome log; durable completion | Carry an optional submission identity on queued answers and persist runner text/refusal at completion. Preserve completion across the enqueue/save race. Older archived answers with missing detail terminate as explicit uncertainty, never a replay or fabricated success |
| Edit consumption | Any changed revision after an ack; confirmed carried words | Consume an edited reply only if its submitted words exist in the new draft or sent activity. Uncertainty, refusal, newer text, focus, composition and changed selections keep the pin |
| Redraw budget | Recompare all entities; respect Query identity | Reuse identical Query-owned references before deep comparison. All 500 headlines must change in the benchmark; unchanged polling is not proof of a redraw |
| Milestone integration | Dead imports until each milestone; integrated lazy screens | Wire all lazy screens with the shell in M2, then finish their explicit M3 acceptance separately. Do not expose placeholder screens or claim the inventory complete prematurely |
| Settings provenance | Drop metadata; retain evidence | Show learned-rule evidence alongside its scope and Remove control. Setup-only values remain readable, labelled as managed during setup rather than exposing chat commands as the page's controls |
| Screen refresh | Poll all queries; query per screen | Numbers fetches on open/window/remount, not page polling, focus or reconnect. Settings retains mounted drafts on failed refresh and advanced deep links open the containing More fold |
| Working preview delivery | Stop for complete M4; ship the working integrated app first | Rebase M2/M3 onto c8815d3 and commit the requested corrections plus intact verified work. M4's inventory remains explicit about outstanding proof rather than delaying the usable app |
| Row text | Raw-message fallback; New server headline and Next | Preserve New headline after command-hint removal; never substitute lastAsk. Project New's owner/Next phrasing as data, formatting its time placeholder locally |
| Time format | Full locale timestamps; duplicate helpers; shared New helper | Extract the existing pure short-time formatter into the React domain and re-export it from legacy format.ts. Explicitly allow just that pure file in the legacy bundle boundary; no behavior change to old rendering |
| Open work | Long request first; Next and checklist first | Use the approved New work-first ordering and collapse asks over 240 characters with full text accessible. The card timeline references its chronological namespace, not the row's recent-first timeline |
| Card navigation | Every Now row; current visible section | Count/traverse the open row's section after Find filtering; do not count hidden sections or capped Catch up entries |
| Navigation keys | Separate global sequence; same visible scope as buttons | j/k and arrow keys use the same current-section and Find scope as Previous/Next. This keeps the count meaningful for both mouse and keyboard users |
| Poll payload | Download full JSON every interval; conditional fetch | Hash all observable snapshot content except clock-only now/fetchedAt, return ETag/304, and retain at most ten validated query/token snapshots in the service. A stable initial Since fallback avoids clock-only invalidations on a never-viewed store |
| Prepared recovery | Requeue; refuse without validation; validate then refuse | Store the validated intent with its prepared receipt. Re-resolve if its answer is missing, persist exact stale/unknown/invalid refusal, and still never enqueue from GET or retry. Legacy prepared records remain terminal interruptions |
| Reminder disappearance | Current-only standalone references; pinned snapshot | Open reminder cards resolve from the same pinned entities as their rows. Ending a reminder must not leave a mounted row dereferencing a removed placement |
| Parallel experience ownership | Split New screens; split experiences | Owner reassigned all React New surfaces to this branch. M4b owns React Classic and its in-app toggle under classic/. Keep App changes small; do not edit that folder. The already-finished New screen edits stay in this delivery |
| Grouped part actions after rebase | Home-only needs cards; every needs-human subject | Main groups needs cards under their home. Build canonical actions for every needs-human workflow, including separately owned parts; all existing exact/apply-time guards still apply. A browser regression proves only the chosen part queues |
| Numbers without a stored item | Call every missing row a missed message; distinguish log history | Only an actual missed-message record gets that explanation. A removed workflow says its code is no longer on file and its log line still counts, matching the existing page |
| Supporting event times | Raw ISO/full locale strings; shared short forms | Numbers events, watch check times, bootstrap progress and footer read/update times use the same short formatter as rows/cards. Date-only bounds remain dates |
| Narrow New status | Separate mobile renderer; remove status; compact shared DOM | Keep one accessible DOM/action path. Place status and Undo controls beside their text, fold extra problems/age, and remove duplicate paused text. Direct 400x860 geometry keeps Your move above 430px with no horizontal overflow |
| Visual baseline | New styling from memory; side-by-side same-data rendering | Capture immutable New/React baselines before editing, then compare both on the same cloned fictional store at both widths/themes. Freeze only the fixture clock so Undo/relative times remain comparable |
| New presentation ownership | Embed the legacy renderer; cosmetic CSS over old markup; owned matching components | Use New's actual tokens/spacing with owned Header, icons, compact row facts and inline-card variants. Keep App integration small and do not import legacy rendering or command handlers |
| Visit summary | Read the latest view mark; retain the visit cursor | After React HTML builds, capture the existing visitSince result once for its page projection. Explicit since precedes lastViewed, and polls do not mark another visit. This fixes the demonstrated New/React summary discrepancy |
| Experience note | Independent browser flag; existing per-machine noted state | Expose optional showExperienceNote from ui.noted and dismiss through the existing /ui noted-only save. Failure keeps the note visible; success preserves the selected version and survives reload |
| Inline card context | Repeat full header/pager; keep the row context | Remove Now's pager and visual duplicate person/chat header only. Keep an accessible name, inline work-first content, one More control, and the full header for Done/other contexts |
| Visual/action parity | Copy New's direct row command handlers; preserve Open-only safety | Match avatars, metadata, link icon and primary button treatment while keeping row buttons Open-only. Do not add row sends, direct command parsing or a second approval path for a screenshot match |
| Combined branch integration | Rebase builders again; merge the coordinator's resolved branch | Merge react-all once, fast-forwarding to e93a0f5. Preserve the integrated Classic/toggle and the New visual milestone; do not edit another worktree or merge to main |
| Missing visit cursor | Coerce missing since to the latest mark or a day ago; preserve its meaning | Pass a visit object whose presence distinguishes an intentionally absent first-ever cursor from an omitted projection argument. Snapshot since stays absent, as on the old page; a separate stable fallback is only for New's Since line |
| Shared count correction | Patch browser badges; reuse the old view and freshness helpers | Keep Done and Catch up computed from the existing helpers over the same workflow/seen snapshot. Correcting the cursor restores the counts without changing UI arithmetic, ownership or action bindings |
| Shared header styling | Apply New's structural display rule to all headers; target its actual frame | New's block frame rule requires its direct header-inner child. Classic retains its flex header and responsive navigation while New's visual treatment stays unchanged |

## Combined visit/count checkpoint

- Merged react-all once. The branch already contained the New visual pass and
  the other builder's Classic/toggle implementation.
- A fictional first-ever visit reproduced old Classic Done 4 versus React 2:
  React had replaced an absent since with a fabricated 24-hour cursor. The
  visit object now preserves absence instead of falling through to the newly
  written load mark or display fallback.
- Direct Chrome comparison against the old Classic view/freshness helpers:

  | State | Old Done / Catch up | React Done / Catch up |
  | --- | --- | --- |
  | Existing visit, earlier cursor | 4 / 4 | 4 / 4 |
  | First-ever visit, mixed-age history | 4 / 2 | 4 / 2 |
  | Two item marks within the visit | 2 / 4 | 2 / 4 |

- Rendered Classic badges/headings and You left text use that same cursor.
  First-ever Classic says In the last day, not a fabricated leaving time.
  API reads do not mark another look; polls, in-app toggles and reload retain
  the actual cursor. Conditional responses remain empty 304s, and an item
  approval binding is unchanged across visit operations.
- Inspected integrated New/Classic at 1280x800 and 400x860, light/dark. New
  retains avatars, filled Open, compact metadata/source icons, Checked pill,
  theme icon and health-line styling. Narrow Classic navigation is usable.
  This walkthrough posts no item action and uses no owner data.
- Build and direct browser checks only. No tests, typecheck, CI or publication.

## New visual checkpoint

- Separate spec and bounded implementation review approved the visual plan;
  see [the visual review](../reviews/react-visual.md).
- Built the committed-output app and drove the real server in Chrome with
  fictional stores only. Captured Now, open work and open reply for New and
  React at 1280x800 and 400x860, each light/dark: 24 final screenshots plus
  before captures. Every final image was inspected in side-by-side grids.
- Header, leading health and summary x/y/width/height match New exactly in
  the measured fixture at both widths. List start x/y/width also matches.
  Total list height is intentionally not equal when old New exposes direct
  row Tell/Mark done controls that React keeps behind Open.
- Raw, unmasked screenshot differences remain nonzero. Work views differed
  by 2.41-2.43% at desktop and 4.16% narrow. Now/reply differences are larger
  because preceding row controls change heights, the version label differs,
  and missing-message fixtures retain the honest item-created time label.
  This is not a pixel-zero claim.
- Direct clicks verified the narrow menu, icon theme cycle, note save failure/
  success/reload, stable Since and 304 polls, both More menu placements,
  Escape closing More without collapsing its item, exact Copy details,
  and text/focus/selection/composition retention through a changed poll.
  Existing paused/Ask/Undo/resume and other lifecycle paths were exercised.
- A clipped bottom More popup was found during the walkthrough and corrected:
  bottom controls remain in flow; the top menu alone is bounded and scrollable.
- Per the owner directive, build and real-browser inspection only. No test
  suite, typecheck, CI, release, public scan or owner-data action was performed
  for this visual milestone.

## Review disposition

P0-1..3 and P1-1..4 are design requirements above and hard M2 implementation
gates. M1 offers only the version menu and an explicit foundation screen, with
no item actions. P1-5..6 require M1 cold-asset, CSP and fallback tests. P1-7
requires the pinned parity inventory before M2. P1-8 is reflected in status.
P2 suggestions on clocks, links, distinct revisions, contrast and measurements
are accepted. Query-only data ownership is not adopted because the brief
explicitly requires normalized Zustand entities; duplication is limited to a
read-only projection index. Self-contained means all files are committed under
dist, not one HTML file.

## Milestones

- M1 complete: schema, scaffold, menu and served build work.
  Public-only lock URLs are retained. The owner's actual clean install contract
  was verified with fresh caches in isolated temporary directories: production
  installed 102 packages, development installed 302, without changing either
  manifest or lock. Direct public-network npm requests remain unavailable.
  Earlier metadata returned inconsistent older versions; official public release
  tags confirm React v19.3.1, Tailwind v4.3.3 and Zustand v5.0.15. The inference
  that these versions were private or nonexistent was incorrect.
- M2 complete: typed layers, Now, every current row/card kind, server-owned
  actions, private Ask, holding replies, work, changes, Undo and refresh safety.
- M3 complete: Done, Numbers and Settings, including filters, exact feedback,
  learned provenance, habits, privacy controls and retained screen edits.
- M4 React New complete: Classic-only capabilities are placed in the approved
  New surfaces and all 61 U / 286 master scenarios are classified in
  [the New acceptance](react-parity.md). Five future U cases remain explicitly
  out of migration scope. React Classic is owned by the separate builder.

## M2 verification checkpoint

- Real Chrome against fictional temporary stores and the real local server:
  every row kind, exact edited sends, preview-before-send choices, selected
  changes, private sources/Ask, separate PR approvals, holding/retrying/stopped
  work, reports, to-dos, Find, knowledge, sheets and all four screens.
- Stale submission and apply-time races, double click, dropped POST response,
  reload while receipt checking remains blocked, rotated outcome logs and
  exact-target Undo are covered. Activity forms retain focus/selection/IME and
  typed watch text when records change.
- Full gate: 896 Node cases; 894 passed initially. The two failures were the
  16.2 ms worst redraw and a reopen assertion observing the queued message.
  Identical-entity reuse removed redundant serialization; the reopen test now
  awaits the matching applied receipt. Both failed cases passed their focused
  rerun. All 13 component/resolver cases passed.
- Changed-row production benchmark after the optimization: 7.30 ms median,
  14.30 ms maximum/p95, 15 updates with all 500 headlines changed. Includes
  normalized index reconciliation and React commit; excludes network, query
  parsing/cache work, layout and paint. Projection: 170.51 ms; JSON 1,576,730
  bytes uncompressed. These are local measurements, not a cross-platform claim.
- Twenty screenshots inspected: Now/card/Done/Numbers/Settings, each at
  1280x800 and 400x860, light and dark. No horizontal overflow; navigation
  clears the sticky header; codes do not wrap and chart baselines align.
- 63 cumulative genuine mutation kills, including selected primary counts,
  pinned activity retention, discard protection and durable completion.
  An initially invalid mutation baseline was not counted: the lost-response
  test now holds receipt blocking through reload rather than racing unroute.
- Heavier screens are lazy. Current build sizes are recorded in the milestone
  summary. All tests write under temporary roots; no owner data, AI, push or
  publication was used.

## M3 verification checkpoint

- Browser-proven Done feedback/watch retention and exact-send targets; Numbers
  counted lists and anonymous copy; all Settings fields and model details.
- Additional real-browser checks cover Numbers fetch cadence through six real
  page polls, focus and reconnect, advanced Settings links opening More,
  retained focus/text after a failed refresh, all three habit choices, learned
  evidence/Remove and cancelled/confirmed chat privacy changes.
- Full Node suite: 899 cases, 898 passed initially. A non-reply completion
  assertion timed out; its diagnostic also waited on the already-removed row.
  It now awaits the exact applied receipt and asserts that receipt's text is
  rendered. The focused seven-action case passed. No production cause was
  established for the old timing-only assertion. All 13 React cases pass.
- Full-run changed-row measurement: median 8.00 ms, maximum/p95 13.40 ms;
  projection 93.61 ms and 1,576,730-byte JSON. Same measurement scope as M2.
- Four additional learned-rule screenshots inspected at both required sizes
  and themes. Evidence, scope and controls are readable without overflow.
- Three new genuine mutation kills for provenance, command-free setup labels
  and Numbers reconnect policy: 66 cumulative. Baseline passed first.

## M1 verification checkpoint

- Typecheck and build pass with the installed dependencies.
- Initial full node suite: 804 tests, 788 initially passed. The 15 failed golden
  cases differed only in the approved version menus; all 15 passed after those
  nodes alone were updated. The failed narrow-menu switch test passed after its
  selector was updated. An independent byte comparison confirmed all 176 changed
  golden files have no non-menu differences.
- After adding the shared typed boundary, the full node suite ran for that new
  shared-path scope: 824 tests, 821 initially passed. Three brand/scenario
  invariant failures were fixed and all three reran green. No flakiness loops.
- Seven StrictMode component/resolver tests passed.
- Eleven focused post-review tests passed: real-server serving, public-registry
  URL invariant, build integrity/freshness, client-source boundary, cold lazy
  JS/CSS tokens, snapshot fallback, no-JavaScript escape, failed-chunk recovery,
  and an isolated installed bundle with no node_modules (including a missing
  preview-build fallback). These runs do not prove public installation.
- Thirty-seven mutation operators were killed across foundation, recovery,
  client boundary, typed actions, edge contracts, revision store, apply-time
  identity guards and the test-worker resource cap.
- Inspected 1280x800 and 400x860 screenshots in both themes. No horizontal scroll.
- Current foundation JS: 282.81 KB raw / 91.37 KB gzip; CSS: 15.21 KB raw / 3.99 KB
  gzip, with a lazy foundation chunk. Item screens are not activated in this build.
- No 500-row redraw, server projection or payload measurement yet: M1 has no rows.
- M1 is a local commit only. publish:check runs after the commit because it scans
  committed files; no pushing or publishing is authorized.
- Both P1 recovery/snapshot findings were closed by the separate plan reviewer.
  Error recovery intentionally offers Continue in New and Reload, not another
  full version menu. The token-gated GET escape is recovery-only and supports
  only New/Classic; normal switching still uses POST /ui.

## Action safety checkpoint

The shared enqueue entry now accepts structured answers, not reparsed text.
Receipt UUIDs are separate from monotonic ULID answer identities, preserving the
runner's time order. Refusals persist. An interrupted prepared submission never
queues on a read or retry: it recovers an existing answer/outcome or becomes a
terminal refusal. Dirty/pending revisions stay pinned; future UI actions are
disabled per item while any submission is pending.

Fifteen focused backend tests pass; ten action-rule mutants were killed. One
canonical-row mutant initially survived because the fixture did not exercise
that path. Adding the promise fixture and an explicit nonempty-coverage assertion
made the test fail for the mutant. Card and placement work timelines use separate
projection ids, so one cannot overwrite the other's ordering.

The final full gate is green: 834 node tests plus 8 StrictMode component/resolver
tests, with typecheck and shipped-byte build checks. An earlier unbounded run
finished its assertions but retained two browser-test workers. The default test
command now limits file concurrency to four, avoiding browser oversubscription;
the bounded full run exits cleanly with no skipped tests.

### Additional decisions

- Keep the current, matching React/DOM stable pair confirmed by public release
  provenance. Do not downgrade based on inconsistent registry metadata.
- Verify reproducibility using the owner's permitted install path and unchanged
  public-only lock; do not claim a direct public-network install was tested.
- Search reuses the existing server-side Find model rather than duplicating its
  Teams-link and numeric matching rules in the browser.
- Native recovery controls remain independent of the lazy item screens, so the
  owner always has a path back even when a chunk is unavailable.
- Public CI on b330b46 proved clean npm ci on all six OS/Node runners. The Mac
  network is not used to judge public package availability. The one Linux/Node24
  first-screen failure is addressed by the bounded menu allocation and a browser
  stress regression: change native control font metrics and the longest hidden
  option, then force a real data refresh; header size, row position, viewport
  width and owner scroll must stay fixed. The test fails when sizing is removed.
  The exact Linux CI failure is not claimed reproduced on macOS; CI rerun is
  still the cross-platform verification.
- Necessary safety deviation from "runner unchanged": no verbs or workflow
  engine were added, but new page answers carry an optional apply-time guard.
  Existing chat/classic callers remain unchanged. A pre-enqueue check alone
  cannot prevent two tabs sending a correction or an effect index shifting
  before apply. The narrowly scoped backstop and its cross-tab/sub-entity race
  tests were independently reviewed before any item UI was activated.
- Placements, including closed subjects, are indexed from the existing `place`
  function and share its snapshot with `nextView`. Activity entries remain a
  separate history of what happened. The approved Catch up/to-do rules are not
  replaced by a new browser or projection-specific ownership classifier.
- Source links accept HTTPS only; all supported server-generated chat/review
  links already use it. Unsupported schemes remain readable labels, never
  executable links. The public-content check also caught a coincidental product
  substring in a local history variable; it was renamed for clarity rather than
  weakening the deny list.
