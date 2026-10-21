# Adapters

Delegate talks to a chat system through two interfaces. Everything else (items, drafts, rules, knowledge, the page) is the same for every system. A new system is two classes and one line in `src/adapters/registry.ts`, chosen by `source.kind` in the config.

## Source (`src/adapters/source.ts`)

| Method | Contract |
| --- | --- |
| `newMessages(chat, afterId, since?)` | Messages after the cursor, oldest first, with the newest id. `truncated` when more arrived than one read returns. |
| `recentChats()` | Chats with activity, newest first, for discovery. |
| `recent(chat, n)` | The last n messages, for context. |
| `send`, `sendSelf` | Post as the owner. Returns the new message id. |
| `editMessage`, `deleteMessage` | For undo. Throw when the system refuses; Delegate then edits into a withdrawal note. |
| `presence()` | Availability and any out-of-office text. |
| `members?(chat)` | Whether anyone outside the organization can read the chat. Leave out if unknown. |
| `channelThreads?(...)` | Threads in channels the owner named. Leave out if the system has none. |

Message ids must sort by time as numbers (`BigInt`), the way Teams ids do. A system with other ids maps them in the adapter.

## History (`src/adapters/history.ts`)

`search(query, { mine, before })` returns hits with time, author, text, and a link a person can open. `before` must be enforced: the eval relies on it to hide the future.

## Documents (`src/adapters/docs.ts`)

`read(name)` returns a shared document's whole text, found by file name or title, with when and by whom it last changed; or a short reason it could not. Teams uses the SharePoint MCP server beside it (`source.docs` overrides the command). The Word file is unzipped locally, so no AI call is spent reading it.

## Slack mapping

| Delegate | Slack Web API |
| --- | --- |
| `newMessages` | `conversations.history` with `oldest` = cursor ts; ts becomes the id after removing the dot |
| `recentChats` | `users.conversations` (im, mpim, private and public channels the owner is in) |
| `send`, `sendSelf` | `chat.postMessage` (self: the owner's own DM channel) |
| `editMessage`, `deleteMessage` | `chat.update`, `chat.delete` |
| `presence` | `users.getPresence`; out of office from the profile status |
| `members` | `conversations.info` `is_ext_shared` |
| `channelThreads` | `conversations.replies` on threads the owner started or was mentioned in |
| History | `search.messages` with `from:@me` and `before:` |

Use a Slack MCP server if one is installed, like Teams; Delegate holds no tokens.

## Files and knowledge

Knowledge folders and the storage folder are plain local paths. Google Drive for desktop and Dropbox sync to a local folder like OneDrive does, so they work with no adapter. The one need is that the storage folder syncs between machines within a minute or two, which the lease relies on.
