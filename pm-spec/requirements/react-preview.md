# React preview requirements

R-REACT-01 through R-REACT-09 are defined in [the product spec](../react-app.md).

M1 acceptance:
- Three versions, one per-machine choice, switching sends nothing.
- Classic and New retain every non-menu golden byte.
- Preview assets require the page token, including lazy JavaScript and CSS.
- The browser-only preview does not break panel or snapshot rendering.
- Missing features are disclosed, not presented as working.

M2 acceptance:
- Every current Now row opens without acting; the server owns placement.
- Exact edited sends, choices, changes, holding replies, work, private Ask and
  Undo cross the real server/runner gates in a fictional browser fixture.
- Refresh keeps edits, focus, composition and folds. A changed revision is
  disclosed; replacing it requires explicit discard.
- Double submit, stale metadata, lost responses and rotated outcome logs
  cannot replay actions or target a later send.
- A production redraw changes all 500 headlines and stays below 16 ms.

M3 acceptance:
- Done preserves filters, freshness, feedback meaning and exact-send targeting.
- Numbers lists match counts, copies no identities, retains its window and
  does not fetch on unrelated page polls, focus or reconnect.
- Every editable setting uses server validation. Advanced links open More;
  failed refresh and in-flight saves cannot erase current edits.
- Suggestions show evidence and support Turn on, Not now and Never.
  Accepted learned rules keep their provenance and Remove action.
- Chat privacy changes require explicit confirmation and refresh the screen.
  Setup-only values are readable without chat-command instructions.

M4 remains subject to the complete parity inventory in
[the architecture](../../dev-spec/react-app.md).
