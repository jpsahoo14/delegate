# Engine fixes

| Date | Fix | Expected behavior and proof |
| --- | --- | --- |
| 2026-10-22 | Approval truth | The live PR and owner's vote supersede a contradictory draft, including an already-seen vote. Approval questions check before drafting and at send; missing or ambiguous evidence holds the send. A changed head or reset vote invalidates the draft. Own-vote replies remain owed after PR completion; ambiguous multi-PR asks never close from just one vote. SC-430. |
| 2026-10-22 | Completed work and PR identity | Completed approval work and its family leave Waiting after the vote and reply, without closing broader goals or pending part decisions. Terminal job reports merge their work result. Receipt repair closes satisfied approval work or queues broader legacy work once for judgment, without AI or external writes during repair. The ask's PR takes priority over an old job. SC-431. |
| 2026-10-22 | Placement coverage | Every fixture state has exactly one placement. Partner waits name the partner, and classic progress includes parts whose work lives on their home. SC-432. |
| 2026-10-22 | Goal fidelity | Plans add steps without rewriting the original goal or done-when. A changed goal requires a new owned pending ask identified in the report. SC-433. |
| 2026-10-22 | Group asks and skip audit | Unmentioned group messages are persisted for independent paced judgment rather than silently discarded or allowed to replace unanswered owned asks. Distinct PR asks keep their identity, including URL-only follow-ups. Skip reasons contain IDs, not message text. SC-434. |
| 2026-10-22 | Relevant FYIs | Reply prompts distinguish owner action from relevant news and noise. Relevant group updates and recaps may become Catch up even without a mention. Fictional positive and negative cases cover the classification contract; these are not a claim of live-model accuracy. SC-435. |
