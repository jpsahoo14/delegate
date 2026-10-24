# Setup

Read this only when the owner asks for setup. Call `setup_status` first and resume at the next step that is not done.

Ask only what you cannot find out. Usually that is nothing.

1. **Where to keep data.** Save `storage` with `{}`. The tool uses the folder that already has Delegate data, or `<work OneDrive>/Delegate` when there is exactly one work OneDrive. It never picks a personal OneDrive. Only when it says "Ask the owner", ask which folder, offering the ones it lists.
2. **About them.** If the storage folder has a `profile.md`, save `{}` and it is kept. Otherwise draft it yourself, without asking: their name and job title (from Teams or your organization's directory), and how they write (greeting, length, tone) from a few of their own recent messages. Leave out other people and any facts. Never guess nicknames; save `aliases` only when the owner names one.

Save every other step with `{}`, without asking: each takes a safe default or keeps what the folder already has (tools from the owner's own tool servers, no notes folders, no rules so every reply waits for their ok, and running in the background). If a step fails, show the tool's words exactly and the one fix. Only the owner can sign in (to the AI CLI or Teams); ask for that when a step says so.

## Steps

| Step | Goal | Value for `setup_save` | Done when |
| --- | --- | --- | --- |
| `storage` | One synced folder holds all of the assistant's data, so every machine sees the same items | `{}`: the tool picks the folder that already has the data, or the one work OneDrive. `{ root }` only when it asks you to ask the owner. | Saved |
| `source` | The assistant can read and send the owner's chats | `{}` first, so the tool tries its defaults. Otherwise `{ command, selfChatId }`: the command that starts the owner's chat MCP server, and the self-chat ID. | The tool reports the owner's name. If it fails, show the error and the likely fix. |
| `agent` | Background workers have an AI CLI that is installed and signed in | `{}` first: the tool tries the common CLIs and keeps the first one that is signed in. Otherwise `{ flavor, command }` for a company wrapper. | The tool proved the CLI answers a prompt |
| `tools` | Workers can read live systems; approved changes can be made | `{}`: read-only tools from the owner's own tool servers (Teams, calendar, Azure DevOps, and any your `site.json` adds), plus, after ok, a PR comment, a PR vote, a work-item update, and a calendar invite, each one action of its tool (`ado-repo_pull_request_write:vote`), and the servers to start them. Never offered: abandoning, completing or merging, bypassing, deleting, or a pipeline change. An explicit `{ tools, effectTools?, servers? }` replaces them. `repos` (name and remote each) and `codeFolders` (where this machine keeps clones) are saved as given. A tool that sends, writes, approves, or deletes is never a read tool. | Saved |
| `knowledge` | Workers can read the owner's notes folders | `{}` keeps the folders already saved, or none. `{ folders }` when the owner names some. | Saved |
| `profile` | Replies sound like the owner | `{ markdown }` you drafted: name, title, and how they write. `aliases` only when the owner names a nickname or initials. `{}` keeps an existing profile. | Saved |
| `rules` | Standing instructions, if any | `{}` keeps the rules already saved, or none, so every reply waits for the owner's ok. `{ text, compiled }` when the owner states a rule. | Saved |
| `start` | The assistant runs while the owner is away, from one machine | `{}` runs in the background on this machine. If another machine already reads the chats, this one stays ready and takes over by itself when that one stops; `takeover: true` moves reading here now, only if the owner asks. A fresh storage folder starts reading the owner's history once; one with knowledge is not read again. Show the result exactly. | Saved |

For a rule about people's one-to-one chats, use `when.chat: "direct"`: it matches any one-to-one chat with those accounts, so no chat ID has to be found first. Use a chat ID only for a group chat.

## Confirm layout

Compile PR-review autonomy only as `then: "review"`, `when.intent: "pr_review"`,
`review: {comments: "post", reply: "send"}`. No rule grants a vote or approval.
Leave that part out and tell the owner "Delegate never votes or approves for you;
that part was left out." An `off: true` rule retains its text but does not run.
For review rules, call the rules step with `{text, compiled, preview: true}` first.
Show its code-built read-back unchanged, wait for the owner's OK, then save
the same text and grants without `preview`. Never invent the confirmation words.
Review rules may narrow the PRs by `when.reviewerGroup`, using the reviewer's
group name. They ignore `minConfidence`: comments require live reviewer, head,
audience and rule checks; replies count only posted receipts. A generic send
or acknowledgement rule never authorizes a PR-review reply or any vote.

Show each compiled rule like this, and wait for `ok` or an edit:

```
I understood this rule as:
  Who: <name> (account <id>), ...
  When: <condition>
  Then: <action>
ok, or edit it?
```

## After the last step

Show the summary `setup_status` gives once every step is done, as it is: it lists what each step set, and says they can change any of it in Settings or by asking. Then add: nothing is sent without their `ok`; type `delegate` to open Home; say `pause` on any surface to stop sending.

If the owner wants Delegate to carry work they own (test a PR on a test ring, report back), show this list as it is. Save their repos and code folder with the `tools` step (`{ repos, codeFolders }`); the deploy list is confirmed in Settings.

1. **Your repos**: a name and link each, in Settings, Repos you work in. On the machine that runs Delegate, keep their clones under one code folder.
2. **Where Delegate may deploy**: confirm the test rings it proposes from the repo, in Settings. Never int or production.
3. **Your flows**: which ones are yours, and how you test them today.
4. **Telemetry**: add your telemetry tool server in setup, and sign in to it once on that machine. Without it, a report says telemetry was not read.
5. **Who approves your deploys**, so Delegate can show whom a deploy waits on.
6. **Your never list**, such as never merge, never deploy to int or production.

Not needed: pipeline IDs, ring names, deploy steps, or queries. Delegate reads them from the repo.
