# React preview: design

## Alternatives considered

| Alternative | Benefit | Cost |
| --- | --- | --- |
| Embed the old page inside React | Quick apparent parity | Keeps destructive redraws and untyped commands; not a migration |
| New four-tab layout, current card parts | Familiar, small navigation, incremental replacement | Requires genuine component and behavior tests |
| New card redesign and Classic layout rewrite | Could shorten cards | Unapproved design, duplicate layouts, unnecessary scope |

Choose the second. The approved New layout stays: Now, Done, Numbers, Settings.
Now has Your move, Delegate is working, Waiting, Catch up; section membership and
ordering are supplied by the server. Rows show who, what, where, when and Next.
Find filters existing rows without changing placement.

The card keeps today's anatomy: header, exact ask/thread, type-specific body,
Why and sources, action bar, private Ask thread. Its parts are separate components.
Change meaning and warnings never hide behind approval. Rows have Open, not Send.
No chat-command teaching text appears anywhere.

The version menu reads Classic / New / React (preview) at the top right in every
version. Switching with unsaved text requires explicit discard confirmation.
Only per-machine UI choice changes. Theme and compatible Done/Numbers/Settings
routes survive the switch.

Desktop uses the New page's bounded content column. At 400px navigation wraps,
fields remain full-width and card text stays readable. Use the product light/dark
tokens, visible focus, native labeled fields and reduced-motion support.
Sheets trap focus and return it on close; Escape closes the topmost surface.
Single-letter shortcuts do not run inside fields or during composition.

## Validation

Review this proposal separately before implementation. Capture and inspect
1280x800 and 400x860 in both themes. Check every U01-U61 obligation and the
repo scenario table. Verify refresh during editing, stale revisions, failures,
undo expiry and exact action payloads with fixture-backed browser tests.
