# Secondary-screen parity presentation

## Alternatives

1. Keep one chronological list and New chips. Smallest markup, but older unseen
   entries stay buried. Rejected: it fails Done's new-first contract.
2. Split Done into New and Earlier sections, retaining the existing entry card,
   filters, and visit-stable New ids. Chosen: no new controls or domain logic.
3. Add a New-only filter or tab. Rejected: extra navigation and hides context.

Numbers keeps its existing counted-list card. Add the already supplied gist and
work as plain paragraphs, matching Done, rather than fetching or opening an item.
Hide absent values. Preserve source links, attribution and time.

Done uses level-two group headings and level-three entry headings. Show New
before Earlier, preserving server order within each group. If no entries are new,
show the existing list without an empty New section. Closed-with-nothing-to-know
stays in its existing disclosure.
Ungrouped and closed entries retain level-two headings; omit an empty Earlier
group. Group headings and entries remain siblings so a freshness change never
reparents a focused editor. Keep entry ids, open state and pin-aware hooks.

No new layout, tab, action, or styling system. Verify both 1280 x 800 and
400 x 860 in light and dark, with no horizontal overflow.

Removing the duplicate missed-message launcher leaves Find unchanged. A proposed
paused-reminder disclosure was rejected after correcting the browser helper:
paused reminders are already on Now, and reload restores an already-open card.
Keep one reminder control surface.
