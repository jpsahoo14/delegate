import type { Section } from './whose.ts'
import type { Attachment } from './intake.ts'
import type { Capability } from './capabilities.ts'
export type Id = string
export type Code = string
// open: the reply is out and the work it started goes on; nothing needs the owner now (dev-spec/work.md).
export type State = 'running' | 'needs_human' | 'waiting_on_task' | 'waiting_on_sender' | 'scheduled' | 'open' | 'done'
// Intents come from the registry in skills/delegate/intents.json and the owner's intents.json (R-RTE-02).
export type Intent = string

export type Person = { id: string; name: string }
// Where an owner's edit was made, so a learned drafting style can be kept to that person or chat (edit habits).
export type EditScope = { item: string; chat: string; chatName?: string; group: boolean; asker?: Person }
// Who the owner is on a pull request: a reviewer by name, a member of a reviewer team that has not approved, its author, or none.
export type PrRole = 'reviewer' | 'group' | 'group-approved' | 'group-unknown' | 'author' | 'declined' | 'none' | 'ambiguous'
export type Confidence = 'high' | 'medium' | 'low'

export type Rule = {
	id: string; text: string
	who: { accounts?: Person[]; group?: 'team' | 'org' | 'outside' }
	when: { intent?: string; chat?: string | 'direct'; minConfidence?: 'high' | 'medium'; reviewerGroup?: string }
	then: Capability
	off?: true
	review?: { comments: 'post'; reply: 'send' }
	source?: 'settings'
	textHash?: string
	// A rule accepted from a habit, with what it was learned from (dev-spec/habits.md).
	learned?: { key: string; at: string; evidence: string }
	shortcut?: { goal: string }
	// A drafting style learned from the owner's edits: it only shapes the draft's words. Rule matching skips it, so it never
	// decides who gets an automatic reply or shadows a send, ack or ignore rule (edit habits, Engineer check 10-23).
	style?: string
}

export type Msg = { id: string; at: string; editedAt?: string; contentKey?: string; from: Person; text: string; byOwner: boolean; attachments?: Attachment[]; ownerReply?: { askId: string; answered?: boolean; text?: string } }

// stale: set by the runner when a card citation does not resolve or has expired; it then counts as no card (R-ANS-02).
// label: the sensitivity label of a file or page the draft quotes, such as Confidential (R-SEC-08).
export type Source = { ref: string; tier: 'card' | 'live' | 'private'; origin: 'extracted' | 'inferred'; stale?: boolean; label?: string }

// holding: the run fell short of its goal, so this only says the answer is coming; never sent by a rule.
// byOwner: the owner typed or edited these words, so they are never signed.
// ownWords: the owner's words differ from Delegate's draft, or there was none, so they may promise what the draft did not (Slice 3).
export type Draft = { text: string; commitment: boolean; sources: Source[]; preview?: boolean; holding?: true; byOwner?: true; ownWords?: true }

// A standing instruction, such as a reminder at a fixed time (design-spec/automations.md).
// The text is approved once, when the owner starts it, and always goes out with the assistant marker.
// once: at start. hours: at start, then every N hours. day, weekday, week: at each listed time of the matching days (owner Q6).
export type Schedule =
	| { every: 'once'; start: string }
	| { every: 'hours'; hours: number; start: string }
	| { every: 'day' | 'weekday' | 'week'; at: string; times?: string[]; day?: number }
export type Rotation = 'cycle' | 'repeat-last' | 'once-each'
export type Automation = {
	schema: 1; id: Id; code: Code; kind: 'remind'
	// texts: sent in turn by rotation; text is the first, kept for older records. Ends at until (a date) or after maxSends.
	to: { chatId: string; name: string }; text: string; texts?: string[]; rotation?: Rotation; schedule: Schedule; until?: string; maxSends?: number
	// stopOnReply: a message from the person after a send pauses it, and their reply goes to the owner like any ask.
	stopOnReply?: boolean; why?: string
	// The person's reply, waiting for the AI to decide: done (end it), a time (move the next send), or keep (B4).
	heard?: { text: string; from: string; at: string }
	state: 'proposed' | 'active' | 'paused' | 'ended'; next?: string; lastAt?: string; count: number
	createdAt: string; updatedAt: string
}

// Card data from the worker (design-spec/data.md). An option with a reply becomes the draft at once when picked.
export type Option = { label: string; reply?: string; effects?: Effect[]; note?: string }
export type Choices = { prompt: string; multi?: boolean; options: Option[]; other?: boolean }
export type Fact = { label: string; text: string; tone?: 'info' | 'warn' }
export type Meeting = { subject: string; start: string; minutes: number; attendees: string[] }
// The owner's questions to Delegate about an item, answered in its own session and never sent (design-spec S12).
export type Note = { q: string; a?: string; sources?: Source[]; at: string }

// An effect on another system, named in words so no tool is fixed in code. Runs only after the owner's ok (R-HIL-21).
// A promised check-back: a watch that starts once the reply goes out, and stops by itself after 7 days unless extended (B19).
export type Follow = { target: string; until: string; everyHours?: number; code?: string }
export type Step = { at: string; what: string; ref?: string; news?: boolean }
// The case an item carries until it is closed; the reply fields are one turn of it (dev-spec/work.md).
// One checklist step. id is stable across reports, so done marks survive renames and reordering (part 2).
// ring: a deploy Delegate made, whose ring pipeline each build check also reads; over: the newer run by someone else, once seen (owned work).
export type PlanStep = { id: string; what: string; who: 'you' | 'them' | 'me'; done?: string; in?: string; probe?: { build: number; project: string }; seen?: string; ring?: RingStep }
export type RingStep = { name: string; pipelineId: number; project: string; run: number; over?: number }
export type Work = {
	goal: string
	doneWhen: string
	next?: { who: 'you' | 'them' | 'me'; what: string }
	waitingOn?: { who: string; where?: string; since: string }
	steps: Step[]
	links: string[]
	watch?: string
	checkAt?: string
	closed?: { at: string; why: string }
	// Part 2: a candidate from the owner's own message waits for ok; parts are the items in other chats.
	proposed?: boolean
	parts?: string[]
	plan?: PlanStep[]
}
export type WorkReport = {
	goal?: string; doneWhen?: string; step?: string
	changedAsk?: string
	next?: { who: 'you' | 'them' | 'me'; what: string }
	waitingOn?: { who: string; where?: string }
	links?: string[]; closed?: string; checkInDays?: number
	plan?: { id?: string; what: string; who: 'you' | 'them' | 'me'; done?: boolean; in?: string; build?: number; project?: string }[]
}
// call: the exact tool call that makes it, part of what the owner approves. head: for a PR vote, the commit the review read.
// pr: what Azure DevOps says the PR is, shown with the change, never the AI's words (next action).
// maybe: its call got no answer, so it may have been made; it is not made again until the owner says so (review 10-21 P2-7).
// deploy: for a pipeline run, the ring and PR it is for, set by code from the allowlist and the item, never the AI's words.
// ring: the ring as Azure DevOps showed it before the ok; a late ok compares it with the ring as it is then (owned work).
// turns: server-owned proposal provenance, separate from the operation's write-ledger identity.
export type ReviewSeverity = 'High' | 'Medium' | 'Low'
export type Effect = { system: string; action: string; target: string; summary: string; payload?: unknown; call?: Call; head?: string; pr?: PrFacts; deploy?: { ring: string; pr: number }; ring?: RingFacts; build?: BuildFacts; turns?: string[]; byRule?: string; severity?: ReviewSeverity; held?: 'sharing'; done?: { ref?: string; at: string; byRule?: string; severity?: ReviewSeverity }; error?: string; off?: boolean; maybe?: true }
// A pipeline run as Azure DevOps lists it: who started it, when, and how it stands.
export type RunFact = { id: number; by: string; at: string; status: string; result?: string }
export type RingFacts = { last?: RunFact; running: RunFact[]; readAt: string }
// A pipeline Delegate may run with a PR's build, by ID in its project: the owner confirmed it once in Settings (owned work).
// name: the pipeline's real name in Azure DevOps, read when it was saved; params: the only templateParameters a run may carry.
export type DeployTarget = { pipelineId: number; ring: string; project: string; name?: string; params?: Record<string, string> }
// A proposed target, as a run read it from the repo; real: the pipeline as Azure DevOps names it, read by code.
export type ProposedTarget = { pipelineId: number; ring: string; project?: string; params?: Record<string, string>; from?: string; real?: { name: string; path?: string } }
// The build a deploy runs, as code read it: the PR it is from and the head it matches (review 10-21 P1-3).
export type BuildFacts = { id: number; pr: number; head: string; version: string; branch: string; readAt: string }
export type Call = { tool: string; args: Record<string, unknown> }
export type PrFacts = { title: string; author: string; required: string[]; autoComplete: boolean }
// What make_change did for one change in one change run: "calling" before the call, the result after.
// stale: a vote refused because its PR changed since the review, so the owner reviews again.
export type Change = { call: string; state: 'calling' | 'done' | 'failed'; ref?: string; error?: string; at: string; stale?: true; byRule?: string; severity?: ReviewSeverity; skipped?: true }
// One record per distinct call ever made, written only by make_change: what was made, whatever any list says (eng-change-lists.md slice 1).
export type CallRec = { call: string; state: 'calling' | 'done' | 'failed'; head?: string; vote?: string; ref?: string; error?: string; at: string }

// A long job runs in its own session, keyed by the entity it is about (R-LNG-01/02, R-WF-11). Never shown as an item.
export type Job = {
	schema: 1
	id: Id
	key: string
	goal: string
	learning?: { source: string; text: string; style?: EditScope }
	repo?: string
	session: { agent: string; id: string }
	state: 'queued' | 'running' | 'done' | 'failed'
	purpose: 'work' | 'execute'
	byRule?: string
	// Set when a work run used up its time without reporting: the next run is one short turn to report what it found.
	wrapUp?: boolean
	parents: Id[]
	asks: string[]
	intent?: Intent
	reviewStart?: { pr: number; head: string; at: string }
	// The repo the work is in, by its remote ("dev.azure.com/org/project/repo"), and the PR's source branch when known (owned work).
	remote?: string
	needsCheckout?: boolean
	branch?: string
	redacted?: boolean
	// A relay run is a message to the owner's open session on some machine (research/cross-session-opus.md): no process here, so no pid to watch.
	run?: { id: Id; pid: number; startedAt: string; machine: string; purpose: 'work' | 'execute'; asks: number; wrapUp?: boolean; relay?: string; direct?: true }
	// Set when the job's session is the owner's own open session: asks go to it as messages, never as a second process on its history.
	// sent: asks the session has; from: where the run in flight started; ok: asks the owner let through (review 10-19 #5, #12).
	relay?: { machine: string; session: string; what: string; sent?: number; from?: number; ok?: number }
	// at: when a tracker check gave this result, so the page says when the last check really ran.
	result?: { summary: string; reply?: Draft; effects: Effect[]; context?: Fact[]; at?: string; findings?: ReviewFinding[]; reviewHead?: string; reviewClean?: true; reviewSources?: { unknown: boolean; chats: string[]; restricted: boolean }; voteRecommendation?: VoteRecommendation }
	error?: string
	// Trackers (R-TRK-01): run again every N minutes until the condition in words holds.
	every?: number
	until?: string
	nextAt?: string
	// Tracker checks in a row that ended without a result; the watch stops, and says why, after a few (bug 10-23 E40).
	missed?: number
	// A work run that fell short of its goal tries again at nextAt, another way (design-spec/goal-retry.md).
	retry?: Retry
	// A tracker started by a reply's promise stops checking at this time unless the owner extends it.
	endsAt?: string
	last?: string
	label?: string
	createdAt: string
	updatedAt: string
}

// A to-do the owner owes: at, when the reply that promised it was sent; done, when the owner marked it done (R-NEX-07).
export type Todo = { id: string; text: string; at: string; done?: string }

export type Workflow = {
	schema: number
	id: Id
	code: Code
	kind: string
	state: State
	key: { type: 'thread' | 'pr' | 'workItem' | 'incident'; id: string }
	chat: { id: string; name: string; test: boolean; group?: boolean; guests?: boolean }
	asker?: Person
	// Others in the same chat who asked the same thing; one reply answers and tags them all (dogfood: two askers in one chat).
	askers?: Person[]
	session: { agent: string; id: string; repo?: string; at?: string; previous?: string; retired?: string[] }
	lastMsgId: string
	seenMsgId?: string
	pending: string[]
	msgIds: string[]
	lastAsk?: string
	intent?: Intent
	// PR identity, status, head and owner vote read before drafting; the reply keeps that basis until the next turn.
	prRead?: string
	prReadAt?: string
	prUnknown?: true
	// The owner's place on the item's PR at the last read, and why a review was not started (PR review gate, owner rule 10-23).
	prRole?: PrRole
	prGroups?: string[]
	// The PR's author at the last read, for a question the review leaves to them (queue-new #10).
	prAuthor?: string
	reviewDecline?: { pr: number; role: PrRole | 'unread' | 'not-asked'; at: string; ask?: string }
	// Votes taken off the card because the owner may not vote there at the last read; they come back once he may (queue-new #7A).
	heldVotes?: { pr: number; effects: Effect[]; why: string }
	// The last AI run for the item ended with no result: a plain reason with its time, never a question (queue-new #11).
	// tried and job: a job that ran out of routes (#17): what it tried, for Details, and the job Try again queues again.
	runFailed?: { at: string; kind: 'setup' | 'content' | 'other'; why: string; tried?: string[]; job?: string }
	// The reviewer groups on the PR the card asks about ("Are you in …?"); the answer is remembered in config (queue-new #7C).
	groupAsk?: { pr: number; groups: string[] }
	prDraft?: string
	reviewBasis?: { pr: number; head: string; at: string }
	reviewAsk?: { job: string; ids: string[]; lastMsgId: string; ownerAnswer?: string }
	reviewAttempt?: { job: string; resultAt: string }
	reviewRun?: { job: string; carrier: string; resultAt: string; rule: string; pr: number; head: string; turn?: string; phase: 'posting' | 'held' | 'replied'; reply?: Draft; sendText?: string }
	reviewDone?: { pr: number; head: string; reviewedAt: string; byRule: string; clean?: true; posted: { severity: ReviewSeverity; file?: string; line?: number; text: string; thread?: string }[]; counts: { high: number; medium: number; low: number }; waiting: string[]; reply?: { text: string; teams: string }; fallback?: string }
	completionSeen?: string
	draft?: Draft
	// Kept independently of worker reports until the owner sends, skips, or explicitly asks for a replacement.
	ownerSend?: { draft: Draft; at: string; askMsgId: string; checks?: string[] }
	reason?: { kind: 'ask-edited'; msgId: string; before: string; text: string; at: string; digest: string; changed?: string }
		| { kind: 'asker-wrote-again'; msgId: string; text: string; at: string; digest: string; changed?: string; msgIds?: string[]; messages?: { id: string; text: string; at: string }[] }
		| { kind: 'no-reply-needed'; why: string; digest: string }
	reasons?: NonNullable<Workflow['reason']>[]
	holdDigest?: string
	holdCheckPending?: boolean
	voteClaim?: { why: string; pr?: number; claim: number | 'approval' | 'others'; vote?: number; digest: string; automatic?: boolean; canOverride?: false }
	voteClaimRedrafted?: true
	question?: string
	// What the worker could not read, such as an image or a file it has no access to (R-ING-11).
	gaps?: string[]
	choices?: Choices
	context?: Fact[]
	meeting?: Meeting
	notes?: Note[]
	// A follow-up the owner asked for on their own unanswered ask (W codes).
	followUp?: string
	// The options the owner picked, 1-based.
	picked?: number[]
	ownerAnswer?: string
	answerSurface?: 'chat' | 'self' | 'panel'
	status: string
	workingSince?: string
	statusReason?: { kind: 'not-sent' | 'not-sure-sent' | 'could-not-start' | 'not-finished' | 'refused' | 'back-from-window' | 'vote-claim'; text: string; at: string }
	reviewAgain?: { pr: number; head: string; at: string }
	returnedFrom?: { machine: string; at: string; report: boolean }
	// holding: the last send was a holding reply; the full answer is still owed and the item stays open (#41).
	sent?: { msgId: string; at: string; byRule?: string; undoUntil?: string; text?: string; sendText?: string; askMsgId?: string; holding?: true; checks?: string[] }
	sendAt?: string
	acked?: boolean
	decision?: { action: string; ruleId?: string; reason: string; confidence: Confidence }
	job?: Id
	effects?: Effect[]
	waitingSince?: string
	openOn?: string
	// When something the owner has not seen happened: a new turn, a new draft by Delegate, a news step, or a move to another
	// section, stamped by the runner (runner/place.ts). On a watch, only a new check result sets it (runner/jobs.ts finishCheck).
	// Never updatedAt, which a build check touches every 10 minutes (N1b).
	changedAt?: string
	// Where the new page places the item and since when, stamped by the runner when whoseMove's result changes (N1b).
	// sig: what it last saw (the last ask, Delegate's draft, the news steps), so only a real change moves changedAt.
	place?: { section: Section; rule: string; since: string; sig?: string }
	// The owner saw the latest tracker update.
	ackAt?: string
	learnAfter?: { draft: string; sent: string }
	// The owner marked a sent reply wrong or incomplete: the next draft is a follow-up that fixes it, held for their ok.
	correction?: { kind: 'wrong' | 'incomplete'; note?: string; sent: string; at: string }
	// What the reply promises that is still the owner's to do, and the check-back it promised (B19). This turn's list: a new turn drops it.
	todos?: string[]
	// The to-dos a sent reply promised, kept across turns until the owner marks them done (R-NEX-07, N2).
	kept?: Todo[]
	follow?: Follow
	work?: Work
	closeWorkAfterSend?: string
	// A part: this chat's item for work whose record lives on another item (dev-spec/work.md part 2).
	partOf?: Id
	// Why this draft may not go by itself: it drew on a conversation not everyone in this chat is in (R-SHR-01).
	// Why the draft waits for the owner (need to know, #36): structured since #36, prose when stored before it.
	shareHold?: import('./share.ts').ShareHold | string
	// The records the run read through their systems' tools, with the audience read from data (#36).
	records?: import('./share.ts').SourceRecord[]
	// The other chats the draft drew on, so a level the owner sets later still holds it at send time.
	drewOn?: string[]
	// What the last run searched in Teams history, for Why: queries and hit counts only.
	looked?: { tool?: 'teams' | 'knowledge' | 'read' | 'incident' | 'ado' | 'wiki'; q: string; n: number; id?: string }[]
	// owner: the owner's own message. room: a message to the whole group chat that may be for the owner (dogfood 10-20).
	startedBy?: 'owner' | 'room'
	// Closed with no reply needed, but worth knowing: the line Catch up shows (design-spec/catch-up.md).
	fyi?: Fyi
	// The owner said an FYI needs them: the run drafts a reply, and it always waits for their ok.
	needsMe?: true
	// Held because Delegate is paused: a rule would have sent it, or a scheduled send was handed back. Resume clears it; it
	// never sends by itself (PM verification of N1a).
	held?: 'paused'
	// The owner's vote on the item's pull request when Delegate first looked; a change after that is the owner acting outside Delegate.
	prVote?: number
	// The PR's status at Delegate's first look, so a PR already closed when the ask came in does not close the item.
	prStatus?: string
	// It came from the first-setup read of the week before setup: its replies always wait for the owner (design-spec/first-sweep.md).
	before?: true
	// Its first draft waits behind live asks, a few per check.
	paced?: true
	intakeDeferred?: true
	// AI runs that could not start in a row; at 3 it waits for the owner (review 10-20 R3).
	startFails?: number
	// Why an item closed with no reply sent by Delegate: the owner replied in Teams, skipped it, there was nothing to answer,
	// or a job found nothing for the owner to do (a PR already merged), which counts as handled (R-NEX-11).
	closedBy?: 'replied' | 'skipped' | 'nothing' | 'job'
	// A watch the owner started: by when, and where it came from.
	watchBy?: string
	watchFrom?: 'owner' | 'catchup' | 'chat'
	// A Catch up row the owner turned into a watch.
	watchedAs?: string
	// Made from a "missed <link>": its message may be old, and the owner is told when there is nothing to track.
	missed?: { at: string }
	// The pending changes are ones the reply itself promised, not a job's findings: shown as a reply with "Also:".
	promised?: boolean
	// The owner's own words went out on an item whose PR Delegate can change: one short run maps what they promise to changes held
	// for ok (Slice 3). pending: waits for the run; checking: the run is going; offered: its changes wait for ok; failed: it could not tell.
	promise?: { text: string; at: string; state: 'pending' | 'checking' | 'offered' | 'failed'; why?: string }
	approved?: { text: string; effects: string; at: string; replyDigest?: string; sendReview?: string; byRule?: string; effectIds?: string[] }
	revAt?: string
	newCount: number
	// A short summary of this sender's previous, closed item, so a new item starts with that context (R-WF-09).
	earlier?: string
	// Message text was cleared after the retention period (R-SEC-05).
	redacted?: boolean
	createdAt: string
	updatedAt: string
}

export type ReviewFinding = { text: string; file?: string; line?: number; severity?: ReviewSeverity; sources?: Source[]; thread?: { author: string; url: string; at: string } }
// A recommendation is evidence only; an approved effect remains the sole authority to cast a vote.
export type VoteRecommendation = { vote: 'Approved' | 'ApprovedWithSuggestions' | 'NoVote' | 'WaitingForAuthor' | 'Rejected' | 'none'; why: string }

export type Report = {
	workflowId: Id
	intent: Intent
	state: 'needs_human' | 'done' | 'waiting_on_sender'
	reply?: { text: string; commitment: boolean; sources: Source[] }
	question?: string
	gaps?: string[]
	choices?: Choices
	context?: Fact[]
	findings?: ReviewFinding[]
	voteRecommendation?: VoteRecommendation
	meeting?: Meeting
	answer?: string
	answeredItems?: string[]
	split?: string[]
	fyi?: Fyi
	same?: string
	summary: string
	job?: { key: string; goal: string; repo?: string; branch?: string; owner?: string; needsCheckout?: boolean }
	// Validate jobs: the test rings the repo's own config lists, proposed for the owner to confirm (owned work).
	deployTargets?: ProposedTarget[]
	done?: boolean
	effects?: Effect[]
	todos?: string[]
	follow?: Follow
	work?: WorkReport
	partOf?: string
	claims?: Claim[]
	// Learn runs only: how the owner's edit changed the tone or the language (edit habits).
	style?: { tone?: 'casual' | 'formal'; language?: string }
	checkpoint?: string
	goalMet?: boolean
	blocker?: Blocker
}

// Why a run fell short of its goal, so the runner can try again by another route (design-spec/goal-retry.md).
export type BlockerKind = 'tool' | 'transient' | 'not_ready' | 'budget' | 'access' | 'asker'
// documentFailure is stamped by doc_read at submission, never accepted from the model's report schema.
export type Blocker = { kind: BlockerKind; why: string; tried: string[]; retryAfterMin?: number; waitFor?: string; documentFailure?: true }
// The tries so far for one ask: when the next is due, and what each one met.
export type Retry = { at: string; n: number; total?: number; firstAt: string; kindAt?: string; last: Blocker; tried: string[] }

export type Verb = 'watch' | 'unwatch' | 'mine' | 'ok' | 'edit' | 'send' | 'later' | 'answer' | 'skip' | 'more' | 'undo' | 'continue' | 'pick' | 'ask' | 'wrong' | 'incomplete' | 'unneeded' | 'every' | 'extend' | 'close' | 'wait' | 'never' | 'pause' | 'resume' | 'stop' | 'auto-on' | 'auto-off'
export const CONTROL_VERBS = ['pause', 'resume', 'stop', 'auto-on', 'auto-off'] as const

// seenAt: when the owner gave the command. An ok older than the item's last change approves nothing (review 01-04 P0).
// nums: 1-based option numbers for pick, or the only changes an ok approves.
// again: "ok A1 again", the owner checked that a change which may have been made was not, so it is made once more.
// todos: on a close from the page, the open to-dos the owner saw, so Mark done marks only those (review N2 P2-1).
export type PageApproval = { kind: 'send-reply' | 'make-changes' | 'pick' | 'undo-send' | 'feedback-send' | 'mark-todos' | 'approve' | 'manage'; expect: string; sentMessageId?: string; todoIds?: string[]; replyDigest?: string }
export type Answer = { id: Id; code: Code; verb: Verb; text?: string; nums?: number[]; except?: number[]; again?: true; sendReview?: string; surface: 'chat' | 'self' | 'panel'; at: string; seenAt?: string; todos?: string[]; page?: PageApproval; pageSubmissionId?: string }

export type WatchedChat = { id: string; name: string; test?: boolean; group?: boolean; since?: string }

export type Config = {
	schema: 1
	// reviewerGroups: reviewer groups the owner confirmed are his ("[Org]\Group" or the short name); notReviewerGroups: ones he said
	// are not. A group on a PR that is in neither stays unknown, never guessed (queue-new #7C).
	owner: Person & { upn?: string; reviewerGroups?: string[]; notReviewerGroups?: string[] }
	// IANA zone of the owner's wall clock, saved at setup; work hours use it (Bet 1).
	tz?: string
	source: { kind?: string; command: string[]; docs?: string[]; selfChatId: string; tools?: Partial<Record<'list' | 'send' | 'sendSelf' | 'get' | 'chats' | 'del' | 'edit' | 'presence' | 'members' | 'message', string>> }
	watch: WatchedChat[]
	discover?: boolean
	exclude?: string[]
	knowledge?: string[]
	// tools: built-ins the owner chose (view, glob, grep), or, before the tools migration (#17), the whole read list. deny: catalog reads
	// the owner switched off ("<server>-<tool>" or "<server>-*"); allowRead: tools the classifier can't place that he allowed as reads;
	// toolsTrimmed: his old list was shorter than the defaults (Settings offers Allow all read tools); pendingTrim: servers whose part of
	// that old list waits for a listing; trimmedFrom: the old list itself, kept until then. host: false turns the resident AI host off;
	// hostFaults: host faults in a row before it is set aside for a while (default 2, #19b). hostIdleMin: minutes it stays ready after its
	// last run during work hours (default a working day, #25).
	agent: { flavor: 'copilot' | 'claude'; command: string[]; tools: string[]; model?: string; maxCredits?: number; effectTools?: string[]; mcpServers?: Record<string, unknown>; deny?: string[]; allowRead?: string[]; toolsTrimmed?: boolean; pendingTrim?: string[]; trimmedFrom?: string[]; host?: boolean; hostFaults?: number; hostIdleMin?: number }
	jobs?: { minutes: number; credits?: number; parallel?: number }
	// team: a shared folder (for example a synced SharePoint library) that holds the team's cards (R-KNO-06).
	cards?: { adapter: 'files'; root?: string; team?: string }
	maxParallel: number
	nudgeEveryMin: number
	poll?: { idleMin: number; fastMin: number; fastForMin: number }
	policy?: { delayMin: number; undoMin: number; maxAutoPerChatHour: number; marker: string; ackText: string; never?: Person[] }
	// A cap on AI runs per day; Delegate cannot read credit use reliably, so runs stand in for it (R-SET-08).
	dailyRuns?: number
	// Evals only: history search sees nothing at or after this time.
	historyBefore?: string
	// After this many hours without an answer, the owner's ask shows under Waiting on others.
	followUpHours?: number
	// Channels to watch for threads the owner started, posted in, or was mentioned in. false turns channel watching off.
	channels?: false | { teamId: string; channelId: string; name: string }[]
	// Chats the owner marked: private (anything from it waits for their ok elsewhere) or off the record (also never learned from or searched).
	chatLevels?: Record<string, { level: ChatLevel; name: string; at: string }>
	// ADO projects anyone in the owner's org can read (Settings › You, #36). A PR, work item or wiki page elsewhere is Restricted.
	orgVisibleProjects?: string[]
	// Once a day: the summary goes to the self-chat at this local time (R-HIL-07), and message text older than retentionDays is cleared (R-SEC-05).
	summaryAt?: string
	retentionDays?: number
	// Other names people call the owner in chat, such as initials ("JP"). The first name always counts.
	aliases?: string[]
	// Take new versions by itself between ticks: 'main' (every change), 'release' (tagged releases), or false.
	// Unset or true: 'main' for a clone of the dogfood bundle, 'release' for a clone of the public repo.
	autoUpdate?: boolean | 'main' | 'release'
	// How often a git install looks for a new version, in minutes (default once a day).
	updateEveryMin?: number
	// Approve learned knowledge before it is saved (off: it is saved at once, with undo).
	reviewLearning?: boolean
	// The line added under replies the AI wrote: always on automatic sends, and on approved ones unless signApproved is false (default: on once the owner wrote a signature).
	signature?: string
	signApproved?: boolean
	// Off turns off habit suggestions; accepted ones stay.
	noticeHabits?: boolean
	// A follow-up after this many quiet hours starts a new item from a summary of the old one (R-WF-09).
	quietHours?: number
	quiet?: { from: string; to: string }
	// Developer view: cards and Settings show the rule, reason, ids, and the runner's state.
	showDetails?: boolean
	paused?: boolean
	runner?: string
	// Repos the owner works in, by name and remote; each machine finds its own clones (owned work).
	repos?: { name: string; remote: string }[]
	// Where Delegate may deploy: pipeline IDs the owner confirmed; proposed: what a run read from a repo's config; never: IDs a repo calls int or production.
	deploy?: { allowed: DeployTarget[]; proposed?: ProposedTarget[]; never?: number[] }
}

export type Local = { root: string; machine: string }

// Knowledge (dev-spec/slices/05-knowledge.md). Cards are Markdown in the Basic Memory format; these are their parsed shapes.
export type EntryType = 'fact' | 'decision' | 'faq' | 'owner' | 'status' | 'open'
export type Audience = 'team' | 'private'
export type CardName = 'architecture' | 'decisions' | 'faq' | 'status'
export type Src = { link: string; date: string; who?: string }
export type Entry = { id: string; type: EntryType; text: string; tags: string[]; src: Src[]; review?: string; topic: string; card: CardName; audience: Audience }
export type Card = { path: string; topic: string; card: CardName; title: string; audience: Audience; aliases: string[]; entries: Entry[]; hash: string }
export type TopicLine = { topic: string; title: string; aliases: string[]; entries: number }
export type Hit = Entry & { score: number; expired: boolean }

// replaces: citations (card:<topic>/<card>#<id>) of entries this claim makes untrue; applied only when every gate in propose() holds (#20).
export type Claim = { topic: string; title?: string; type: EntryType; text: string; src: Src[]; audience?: Audience; tags?: string[]; replaces?: string[] }
// was: the text an update replaced because a newer fact superseded it (#20), for display only.
export type Op = { op: 'add' | 'update' | 'retire'; id?: string; card: CardName; entry: Omit<Entry, 'id' | 'topic' | 'card'>; was?: string }
export type Proposal = {
	schema: 1; id: Id; code: Code; topic: string; title: string
	ops: Op[]; base: Record<string, string>; from: 'bootstrap' | 'remember' | 'edit'; source?: string
	state: 'needs_human' | 'applied' | 'dropped'; status: string; revAt: string; createdAt: string; updatedAt: string
	home?: 'personal' | 'team'
	applied?: { at: string; ids: string[]; lines?: string[]; prev?: (string | undefined)[] }
}

// A session the owner keeps for a kind of ask; matching asks run in a fork of it (R-ADP-02, R-ADP-03).
export type Owner = { id: string; what: string; session: string; cwd: string; machine: string; at: string }

// shareable: a group or meeting chat the owner marked "Shareable within my org" (#36); quoted like an org-visible record.
export type ChatLevel = 'private' | 'off' | 'shareable'

// at: when it became an FYI, so a later save (a redaction, a sync) never makes a read one unread again.
export type Fyi = { line: string; weight: 'high' | 'normal'; gist?: string; watch?: { target: string; until: string }; at?: string }
