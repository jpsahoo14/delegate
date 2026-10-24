# React preview requirements

Host draft setup (#39):
- Never prompt a host session without its required registered worker/owner tools.
- Missing optional catalog tools do not disable an otherwise healthy warm host.
- A no-report answer explicitly naming an unavailable worker/extra tool retries immediately on spawn, not as an owner question.
- Naming an unavailable owner tool alone causes neither a host strike nor a spawn retry.
- Preserve valid reports and ordinary content failures; bound historical recovery with a versioned upgrade.
- Keep the existing work-hours warmth policy and fault breaker; log actual offered tools and replacement reasons.

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

Working-preview handoff:
- The shipped build opens the actual four-screen workspace, not M1's foundation.
- Headline/Next use the New server data; the page teaches no chat commands.
- Ask timestamps stay correct and use New's short relative forms.
- Work Next/checklist precede a collapsible long ask, with section-local counts.
- Unchanged page polls transfer no JSON body; a changed item still refreshes.
- All reviewed P0/P1 action gates are proven. Prepared recovery revalidates the
  stored intent but never enqueues from a read or replays an interrupted action.
- The new-reminder hash opens its sheet, version hashes preserve discard
  protection, and learned provenance remains visible in Settings.

Visual milestone:
- Match New's logo/tab/count/Checked/version/theme header and compact row
  avatar, attributed facts, source-link icon and filled Open treatment.
- Use one summary line and the persisted Same items note. Both use the
  existing visit/per-machine state, never a new AI decision.
- Expand Now cards in their row without repeated names or an extra pager.
  Keep headings elsewhere, stable edited DOM, keyboard focus and action gates.
- Place session conflicts in the compact leading health line. Additional
  problems and age remain reachable, including on narrow screens.
- Compare identical fictional stores at both required sizes/themes. Record
  image/layout differences honestly; do not port direct row command handlers
  to make a screenshot match.

Classic Needs-you milestone:
- Use Classic's compact avatar/name/code queue and live-only pager. Keep handled
  visit rows directly reachable without treating disappearance as a successful send.
- Render Classic's person/chat header, original message, optional work details,
  body/draft, Why, actions and private Ask; do not reuse New's work-first card.
- Keep the desktop app-version selector visible and expose it once in the narrow
  menu. Compact Home Catch-up shows no extra quoted ask.
- Retain selection and edited words across refresh/removal, refuse stale exact
  actions, and show the current private conversation alongside a pinned editor.
- Use existing guarded typed actions for choices, selected changes and due-work
  Wait/Close. Editing must not offer the stored-text reply-only path.

Combined-data acceptance:
- New and Classic use the same old-page visit start and freshness rules.
  A first-ever visit has no leaving time; do not synthesize one for badges.
- Display-only Since fallback is distinct from the actual optional cursor.
  Polling does not mark a look; toggles and reloads preserve the visit.
- Done/Catch up counts match the existing helpers for the same history and
  seen marks. No browser count patch or new ownership rule is introduced.
