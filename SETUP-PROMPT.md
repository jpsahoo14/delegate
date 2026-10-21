# Set up Delegate with one prompt

Paste it into your AI chat (`copilot`, `claude`, or your organization's wrapper for one of them), on macOS or Windows. It installs Delegate, connects it to your Teams, reads your history once, and opens Home. It asks you nothing it can find out for itself, and ends with a list of what it chose, which you can change in Settings. You can stop at any point and paste it again to continue.

```text
Set up Delegate for me from https://github.com/jpsahoo14/delegate.

Outcomes, in order. Check each one before moving on, and tell me in one line when it is done. Setup itself starts reading my history the first time, and does not read it again if my folder already has knowledge; show me what it says.

1. Delegate is installed: clone the repo into my home folder and run its installer (`node dist/delegate.mjs install`). A clone updates itself and adds the `delegate` command and the session extension; use the plugin system only if I ask for it. Use what my machine already has. Install nothing else without asking me.
2. Setup is complete: say "set up delegate" and follow it. Ask me only what you cannot find out yourself; take the defaults for the rest. At the end, show me the summary the tool gives. If a step fails, show me what the tool said, word for word.
3. `delegate doctor` reports no problems. For each problem it reports, do the one fix it names, or tell me exactly what I must do (such as signing in).
4. Home is open in my browser, and you tell me the three things to type from now on: "delegate" to open Home, "ok A1" to send a draft, "pause" to stop sending while drafting goes on, and "stop" to stop reading your chats too. "resume" undoes either.

Never send a Teams message for me during setup. If my chat does not show the delegate tools after install, tell me to start a new chat and paste this again; it continues where it stopped.
```

## What it needs

| Need | How to check |
| --- | --- |
| Node.js 22.18 or later | `node --version` |
| An AI CLI, signed in | `copilot` or `claude` (or your organization's wrapper), then `/login` if asked |
| A Teams MCP server | The command your organization gives you for it |
| OneDrive, synced | The OneDrive folder exists on this machine |

## Updating

A clone updates itself to each new release, looking once a day (every hour or 10 minutes in Settings), and tells you in your Teams self-chat what arrived; a version that does not start is rolled back. Home shows the version, with Check now. To update by hand, say "update delegate" or run `delegate update`. Running it twice is safe.

## A second machine

Paste the same prompt there and pick the same OneDrive folder. Your items, knowledge, and reminders are shared. Only one machine runs the background checks: the one where setup last finished. To move them, finish setup on the other machine; nothing moves on its own.
