# Confirmed interaction design

The group selected a Chrome extension on the real Domino's Canada website. This supersedes the original proposal's standalone simulated website. The assistant's task ends with a verified cart ready for the user to check out; it must never claim a real order was submitted.

## Primary user assumption

Provisional persona: an adult university student ordering a familiar pizza on a desktop browser, who wants help selecting website controls and may switch between speech and typing in a shared room. This is a design assumption, not a research finding. Validate it with the three-user study.

Goal: configure one supported pizza, check the result, recover from a misunderstanding, and retain control of checkout.

## Task and conversation flow

1. User selects store, service method and any delivery address on the website.
2. Avatar introduces supported scope. Microphone begins only on explicit Start.
3. User gives a full or partial English instruction. Interim/final recognition text is visible and editable.
4. If existing cart rows cannot be read on the menu, ask confirmation to inspect cart first. Preserve those rows.
5. Read supported product links. Ask confirmation before opening the pizza builder to discover actual available options.
6. Send normalized menu/order context to Gemini. Missing flavor/size or unsupported options lead to a clear question.
7. Display and speak the proposed operation. Yes/button authorizes that candidate; No discards it. A new request replaces it. Website changes invalidate old candidates.
8. After confirmation, re-read and validate controls, select the requested options, preserve unspecified defaults, save and decline unrequested upsells.
9. Identify the new cart row. Confirm old rows are unchanged. Reopen the owned editor read-only to verify saved configuration, close it, and show cart review.
10. User may request edits to the owned row. Cancellation requires confirmation and only removes that row. Ambiguous merged items or partial failures pause for manual handling.
11. Before payment, remind the user about other cart rows. Stop microphone and automation. User controls payment and final submission.

## Main avatar states

- Ready: welcome, scope and English text input; Start listening available.
- Listening: visible status and Pause, also while collapsed.
- Processing: request or fixed website operation in progress.
- Speaking: microphone suspended to avoid interpreting the avatar's voice, then resumes the requested session.
- Awaiting confirmation: operation summary, Confirm and Revise controls.
- Recovery: known current state, Retry and manual takeover. Retry of an uncertain save inspects rather than repeats an add.
- Handoff: user owns checkout; microphone and website automation stop.

## Feedback and user control

The panel uses readable text in addition to visual status and spoken replies. Keyboard access and text input remain available. Collapsing preserves continuous listening and shows a separate Pause mic button. A trusted manual interaction with website controls interrupts an operation rather than letting it continue overwriting the user's work.

## Validation evidence

`tests/fixtures` contains public controls captured during live DOM reconnaissance, plus matching selected-state properties. Unit tests hydrate those native properties because HTML serialization alone omits live checked/value state. Fixture and mocked tests do not establish real Chrome microphone, page-event or Gemini success. Use `ACCEPTANCE.md` for the installed-extension and three-participant checks; record real findings before writing report results.
