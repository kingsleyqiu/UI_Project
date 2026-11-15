# Acceptance and usability checks

This is a test plan, not evidence of completed usability testing. Use a selected store and an adult participant. Stop at cart review / Continue Checkout. The participant completes any real checkout independently; the project demonstration does not require buying food.

## Local smoke test

1. Start `npm start` with a locally configured free-tier Gemini key. Check `/health` without exposing the key.
2. Load `extension` unpacked in desktop Chrome, enable microphone from the toolbar setup page, then return to the selected store's menu.
3. Say/type `I want a large Hawaiian, no pineapple, add mushrooms.` Confirm opening its builder, then confirm the configuration summary. Verify the selected topping names came from this store's controls.
4. Before saying Yes, verify that no size, topping, cart or quantity control changed. Say No and verify the pending candidate is discarded.
5. Ask for an unsupported topping. The assistant must ask for clarification, without selecting a substitute.
6. Ask only for a pizza type. It must ask for size rather than silently accepting the builder's default.
7. In the cart ask `Change it to medium` or `Make the quantity two`. Confirm and verify the same row is edited, with other fields retained.
8. Add a separate item manually before a fresh avatar session. Verify its configuration/quantity remain unchanged after the avatar adds, edits and cancels its own pizza. If the site merges identical products, verify the assistant pauses instead of claiming/deleting an ambiguous row.
9. Collapse the panel during continuous listening. Verify the visible Listening status, active Pause mic button and delivery of the next request. Pause and verify it stops receiving speech. Verify the avatar does not interpret its own spoken confirmation as a user instruction.
10. Navigate within the store between menu, builder and cart. Verify voice continues through the offscreen context and ownership survives navigation. Navigate away from Domino's or close the tab: microphone must stop.
11. Manually change a website selection while a confirmation is pending. The candidate must become invalid and require a fresh summary/confirmation.
12. Stop the backend, deny microphone access or simulate a Gemini quota error. Verify clear feedback, retained website state, retry/manual takeover and no paid or model fallback.
13. Cancel this session's pizza. Verify a deletion summary is confirmed first, only its row disappears and previous items remain.
14. With other cart items present, manually choose Continue Checkout. Verify the other-items reminder, stopped microphone and no assistant interaction with payment fields or final submission.

## Three-participant usability record

Use participant codes, not personal identifiers. Record observations locally, not in Gemini prompts.

| Participant code | Task | Completed? | Time | Observable problem / quote | Severity | Suggested change |
|---|---|---|---|---|---|---|
| P1 | Normal order | | | | | |
| P1 | Revise a size/topping | | | | | |
| P1 | Recover from recognition/invalid topping | | | | | |
| P2 | Normal order | | | | | |
| P2 | Revise a size/topping | | | | | |
| P2 | Recover from recognition/invalid topping | | | | | |
| P3 | Normal order | | | | | |
| P3 | Revise a size/topping | | | | | |
| P3 | Recover from recognition/invalid topping | | | | | |

For each change, retain a before/after screenshot and a short explanation connecting the observed issue to the revision. Report findings, limitations and lessons honestly. No participant results have been filled in here.
