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

`read({url})` or `read({driveId, itemId})` fetches an Office document through the owner's SharePoint server (`source.docs` overrides its command). Name search stays with the native tools. Metadata checks the 25 MB download limit before fetching. Word paragraphs, PowerPoint slides in presentation order, and Excel sheet/cell text (up to 2,000 rows per sheet) are decoded locally; PDF is not supported. ZIP expansion is bounded too.

URL metadata prefers `getFileOrFolderMetadataByUrl`, falling back to `getFileMetadataByUrl`, with the advertised argument `fileOrFolderUrl`, `fileUrl` or `url` in that order. Both accept Graph DriveItem metadata. Reads by ids use `getFileOrFolderMetadata({documentLibraryId, fileOrFolderId})`, falling back to `getFileMetadata({documentLibraryId, fileId})`; without either tool they fail explicitly rather than download without a size check. Binary reads use `readSmallBinaryFile({documentLibraryId: driveId, fileId: itemId})` and accept raw base64 text or JSON containing `contentBytes`/`base64`. A server-side size refusal is a hard content failure even below the local 25 MB cap; the live server's exact cap is not yet known.

Each uncached read logs `document-read` with its metadata tool name, downloaded byte size and page count, or `document-read-failed` with a plain `reason`. Successful read logs contain no document name, URL, ids or text. Paging reuses the cached pages without downloading or logging the read again. The owner's first post-release retry is the live confirmation.

Workers and the resident host share `doc_read`: page 1 starts with an outline and page count, and each later page names its heading context. Every response is at most 30,000 characters, with one decoded document cached for paging within a run. Binary content never enters the model or its session log. Permission, size and unsupported-format failures return plain content-blocker lines, not automatic retries.

Intake keeps attachment URLs and any supplied drive/item ids in the thread and prompt. The document-sharing index stores hashes of identities, not URLs or file names, and is seeded lazily from existing stored attachment lines, then updated by thread writes. Session-log document arguments map through this index to sharing chats, including ids resolved from a known URL or a recorded native metadata lookup. Unshared or unfinished document reads are unknown and hold automatic sends; owner-approved sends retain their existing override. Card-state owns retry button selection, including newly fixed decoder causes.

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
