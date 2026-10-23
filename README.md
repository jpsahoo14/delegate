# Delegate

**Your AI stand-in for Microsoft Teams.** When people need you and you are busy, away, or asleep, Delegate reads what they asked, works out the answer from your notes, your chat history, and your tools, and drafts the reply you would write. You say `ok`, and it goes. Where you allow it, it answers by itself.

It runs on your own machine with the AI CLI you already use. There is no Delegate server and no new account. Your messages do leave your machine: each ask goes to your AI provider, and Teams is read through your own sign-in. [Privacy](#privacy) lists exactly what goes where.

## What it does for you

- **Drafts replies in your voice.** Each draft cites where its facts came from (a message, a PR, your notes) and waits for your `ok`. It greets people back when they greet you, and learns from every edit you make.
- **Follows work until it is done.** An ask that starts real work, such as an incident, a bug, a pull request, or a deploy-and-test loop, stays one item from the first message to the last, across chats. It remembers the goal, every step, what is next, and whom it waits on. It checks builds and incidents for you, and asks you when nothing has happened for a few days.
- **Does the legwork.** Reviews a pull request and proposes comments, investigates a failing build, files the bug, reactivates the incident, each after your `ok`.
- **Notices your habits.** When you handle the same kind of message the same way again and again, it suggests a standing instruction ("let replies like these go by themselves?"). Nothing changes until you say yes. Settings shows everything it knows about you, and you can remove any of it.
- **Keeps private things private.** A reply that uses something from a chat the reader is not in, or from a 1:1 or an email, always waits for you.
- **Answers you, too.** Ask your AI chat "what do you know about the banner flag?" or "what did we decide on ring 3?" and it answers from your knowledge and Teams history, with links. Say "that's outdated" and it corrects itself.
- **Reminds and watches.** Reminders that stop when the person replies; watches on PRs, builds, incidents, and channels.

## How it stays safe

- **Drafts first.** Out of the box nothing is sent without your `ok`. Rules you write, or habits you accept, can let some replies go by themselves.
- **Hard checks on every automatic reply:** no private sources, no commitments (dates, approvals, ownership), no open work, no guests, and nothing from a chat the reader is not in, or one you marked private. A reply that fails any check waits for you, says why, and shows where it looked.
- **Undo** for a few minutes after an automatic reply, and a signature on it ("sent by Robin's assistant", or your own words).
- **Never** changes another system without your `ok`. A pull request vote is made only after your `ok`, and Delegate never completes, merges, abandons, or bypasses one.
- **Your data** stays in one folder you choose (a synced OneDrive folder, so your machines share it). Message text is cleared after 30 days.

## How it works

```
Teams ──(your Teams MCP)──▶ Delegate runner on your machine ──▶ your AI CLI (Copilot or Claude), read-only tools
                                   │                                     │
                                   ▼                                     ▼
                         your data folder (OneDrive) ◀──── drafts, work, knowledge, decisions
                                   │
                                   ▼
             Home in your browser · your Teams self-chat · your AI chat  ──▶  "ok A7"  ──▶  Teams
```

A small runner wakes every minute, reads new messages, starts an AI run for each ask, and applies what you decide. Everything it knows is plain files you can read.

## Requirements

| Need | Check |
| --- | --- |
| Node.js 22.18 or later | `node --version` |
| git | `git --version` |
| An AI CLI, signed in | `copilot` or `claude` |
| A Teams MCP server your AI CLI can use | The one your organization provides. Setup asks for the command that starts it, or reads it from `site.json` (below). |
| A synced cloud folder | OneDrive or similar, on each machine |

## Try it first

```sh
git clone https://github.com/jpsahoo14/delegate && cd delegate
node dist/delegate.mjs demo
```

A sandbox with a pretend team chat. Nothing reaches Teams and nothing costs AI credits.

## Install

Paste the prompt in [SETUP-PROMPT.md](SETUP-PROMPT.md) into your AI chat. It installs, sets up, reads your chat history once, and opens Home.

Or by hand, from a clone:

```sh
git clone https://github.com/jpsahoo14/delegate ~/delegate
node ~/delegate/dist/delegate.mjs install
```

Or as a plugin, in Copilot CLI or Claude Code:

```sh
copilot plugin marketplace add jpsahoo14/delegate
copilot plugin install delegate@delegate
```

`install` registers the tools for Copilot (and Claude, if installed), links the skill, adds the `delegate` command, and adds the session extension for Copilot CLI. It never replaces anything named "delegate" that it did not create.

## Set up

Start a new chat in your AI CLI and say `set up delegate`. It finds your synced folder and drafts a short profile of you by itself, takes safe defaults for everything else, and ends with one summary of what it chose. It asks only what it cannot find out, and the sign-ins only you can do. It starts in draft-only mode: nothing is sent without your `ok`. Change anything later in Settings.

## Your first day

1. Type `delegate` in a terminal. Home opens in your browser and shows what needs you. On the first day that includes people who were still waiting on you from the week before, marked From before setup; their replies always wait for your ok.
2. Open an item: the ask, the draft, where its facts came from, and why it is waiting. Click Send, or edit it first.
3. Or answer from your phone: Delegate posts a short list in your Teams self-chat; reply `ok A1` there.
4. Plain words work everywhere: "what needs me?", "send A3 but say Friday", "what do you know about me?".

## Work you own

Delegate can carry work you own, such as testing your PR on a test ring and reporting back. It proposes the deploy and shows who else used that ring; you ok it; it watches the run and tells you if someone deploys over it. You test, say `A3: tested` (or give the time, `A3: tested 14:00-15:30`), and it drafts the report from the results, with IDs and status codes. Nothing is deployed or posted without your ok. What to give it first:

1. **Your repos**: a name and link each, in Settings, Repos you work in. On the machine that runs Delegate, keep their clones under one code folder.
2. **Where Delegate may deploy**: confirm the test rings it proposes from the repo, in Settings. Never int or production.
3. **Your flows**: which ones are yours, and how you test them today.
4. **Telemetry**: add your telemetry tool server in setup, and sign in to it once on that machine. Without it, a report says telemetry was not read.
5. **Who approves your deploys**, so Delegate can show whom a deploy waits on.
6. **Your never list**, such as never merge, never deploy to int or production.

Not needed: pipeline IDs, ring names, deploy steps, or queries. Delegate reads them from the repo.

## React preview

The browser's App version menu offers Classic, New and React (preview). The
preview provides Now, the open card, Done, Numbers and Settings, including
watches, reminders, knowledge and private questions. Rows only open items;
sending and making changes require their explicit buttons. Edited text stays
on its displayed revision when newer data arrives. Unknown action results are
checked from saved receipts, never automatically sent again.
Inside React, Experience switches between New and Classic on the same data
and action service. Both keep the original page's visit start and new counts.
The choice is remembered on this machine only and switching sends
nothing. New and Classic remain available. The chat panel continues using New when React is selected; saved
read-only snapshots remain Classic.

Development: `npm run build` builds both pages and updates integrity hashes.
`npm run typecheck` covers both front ends; `npm run test:react` runs the React
component tests. Built preview assets are shipped under `dist/web-react`, so
installed machines do not need the front-end development dependencies.

## Use

Type `delegate` in a terminal to open Home in your browser, or ask your AI chat `what needs me?`. In the chat, `/delegate` invokes the skill; plain words work too. Your Teams self-chat takes the same words, so you can answer from your phone.

| You want to | Say |
| --- | --- |
| See what needs you | `what needs me?` |
| Send a draft, and make the changes it lists | `ok A7` (several: `ok A2-A4`; only some changes: `ok A7 #1 #3`) |
| Change a draft, or send your own words | `edit A7: …`, `send A7: …` |
| Give the missing answer, or pick an option | `A7: Oct 24 works`, `pick A7 2` |
| Keep it, or dismiss it | `later A7`, `dismiss A7` |
| Ask about an item (never sent) | `ask A7: what did we decide about ring 3?` |
| Say a sent reply was not right | `wrong A7: …`, `incomplete A7: …`, `unneeded A7` |
| Point at a message it missed, or work you started before it ran | `missed <Teams message link>` |
| Report any problem | `report: …` |
| Watch something until it changes | `watch PR 1234 until merged`, `watch this channel <link>` |
| Remind someone | `remind Arun every weekday at 4 pm to update the doc`, then `ok R1` |
| Teach it something, or correct it | `remember that …`, "that's outdated, it's two weeks now" |
| Ask what it knows | "what do you know about X?", "what do you know about me?" |
| Keep a chat's content to itself, or out of learning | "Leadership sync is private", "keep the staff chat off the record", then "… is normal again" |
| Close or pause open work | `close A14: fixed`, `wait A14: 3d` |
| Accept a suggestion it made from your habits | `ok H1`, `skip H1` (not now), `never H1` |
| Stop sending, keep drafting; or stop reading | `pause`, `stop`, then `resume` |

On Home, each sent reply shows why it was sent, an Ask box, and "Not right?". Learned facts are saved with their source and can be undone (`undo K7`).

You never have to learn the codes: the buttons on Home do the same, and your AI chat understands plain words.

## Updates

A clone follows tagged releases. It looks once a day (Settings › Look for updates: every 10 minutes, every hour, or once a day), fast-forwards to the newest release, starts it once, rolls it back if it does not start, and tells you in your self-chat. Home shows the version, with Check now.

| Setting `autoUpdate` in `config.json` | Follows |
| --- | --- |
| unset or `true` | tagged releases |
| `"main"` | every change on `main` |
| `false` | nothing; run `delegate update` yourself |

`delegate update` updates by hand (plugin update or git pull) and finishes with the new version's own install steps. `delegate update --from <repo url>` moves a clone to another source once.

## Uninstall

`delegate uninstall` removes the tools, the skill, the session extension, the `delegate` command, and the background runner. Your data folder stays; `--purge` also removes this machine's local folder.

## Settings

Open Settings on Home. It shows **What Delegate knows about you** (your profile, your standing instructions, said or learned, its suggestions, and the chats you marked private or off the record) and the few settings there are: your nicknames, notes folders, the daily summary time, the signature, whether to sign replies you approve, whether to notice your habits, whether to approve learned facts first, the daily AI-run limit, updates, the repos you work in, and where Delegate may deploy. Each is saved to `config.json` in your data folder and used by every machine.

Under Updates and system, **AI models** says which model is set (or that your AI CLI picks), and which models ran in the last 7 days for drafts, reviews, asks, and the other runs, with the typical time of a run split into the model, tools, and start-up. `status` names the models that ran today. Only model names and numbers are kept, never what was asked or answered.

## Several machines

Install on each machine and pick the same data folder. One machine reads your chats; another stands by and takes over after 30 quiet minutes. `continue A7` opens an item's AI session on the machine you are at.

With the session extension, Delegate can send a request into a Copilot CLI session you keep open on any of your machines (for example, the one where you review PRs). `delegate sessions` lists them.

## Privacy

Everything Delegate keeps is in your data folder and `~/.delegate`. Drafts, decisions, a short record of where each draft looked (searches and hit counts, never the text found), and a feedback log of mistakes stay there. A chat you keep off the record is never searched or learned from.

What leaves your machine, and to whom:

- **Your AI provider** (the service behind your AI CLI, such as GitHub Copilot or Anthropic) gets each ask and what is needed to answer it. That is the message and its thread, your profile and instructions, and what the AI reads from your notes and history while it works. Your provider's terms cover it.
- **Microsoft 365** answers the reads, through the MCP servers you set up and under your own sign-in. That covers Teams chats and documents, and Azure DevOps if you added it, in setup or in your AI CLI's own MCP config. An `ado` server listed only in your AI CLI's config is used too: Delegate checks the pull requests and builds your items wait on about every 10 minutes, and makes the changes you approved through it.
- **Teams** gets each reply. A reply goes only after your `ok`, or when a rule you wrote or accepted allows it. You can undo those for a few minutes.
- **OneDrive** gets your data folder, if you pick a synced folder. It syncs to your own account.

Nothing goes to a Delegate server. There is none.

## Develop

```sh
npm ci
npm test              # every test is named for its scenario or requirement
npm run typecheck     # server (no DOM), the page (src/web/app), and the tests
npm run build         # dist/ and INTEGRITY.json, checked in CI
```

Maintainers release with `npm run release -- <version>` and `npm run publish:github -- --tag`. `npm run publish:check` scans for private text first; put your own patterns in a git-ignored `.publish-deny`.

## License

MIT. See [LICENSE](LICENSE).

## Your organization's settings (`site.json`)

Anything specific to where you work stays out of this repo. Put it in `site.json`, either in `~/.delegate/` or in your storage folder; `DELEGATE_SITE` can point at another path. Every field is optional:

```json
{
  "agents": [["mywrapper", "copilot"]],
  "teams": ["mywrapper", "mcp", "teams"],
  "read": { "tickets": ["get_ticket", "search_tickets"] },
  "write": { "tickets": ["post_comment"] },
  "actions": { "tickets-post_comment": ["Ticket comment", "add a comment to a ticket"] },
  "images": { "server": "files", "tool": "fetch_blob" },
  "incidentWords": ["TKT"],
  "buildWords": ["ci"],
  "processNames": ["mywrapper"]
}
```

- `agents`: AI CLI commands setup tries before the plain `copilot` and `claude`.
- `teams`: the command that starts your Teams tool server (default `teams-mcp`).
- `read` and `write`: more tool servers, with the tools workers may read and the changes Delegate may make after your ok.
- `actions`: a short name and one line for each of those changes, shown in Settings and to the AI.
- `images`: the server and tool that open an image pasted into a Teams message.
- `incidentWords` and `buildWords`: other words for an incident or a build, so "TKT 123456" links to it.
- `processNames`: your wrapper's process name, so Delegate recognizes its own runs.
