# Pizza Ordering Assistant

**Group 10 · SOFE 4850U · User Interface and Experience Design · Fall 2026**

Aryan Kumar, Qian Qiu, and Mohit Gajula

Pip's Pizza is a desktop website prototype where Pip, a 2D pizza-slice avatar, takes a pizza order one short question at a time. Customers can speak, type, tap suggested answers, or mix all three. Payment and confirmation are simulated.

## Run the prototype

The site is plain HTML, CSS and JavaScript with no build step.

**Typing only:** open `index.html` in any modern browser.

**Voice (recommended for the demo):** serve the folder locally and use Chrome or Edge, because browsers only allow the microphone on `localhost` or HTTPS.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765>, choose **Talk to Pip**, and allow microphone access when Chrome asks. Speech recognition in Chrome uses Google's servers, so the demo machine needs an internet connection for voice input. Typing works offline.

## What the prototype does

| Requirement | How Pip handles it |
| --- | --- |
| Pickup or delivery, size, crust, toppings, quantity, payment | Asked in that order, one question at a time. An address is asked for delivery only. |
| Say everything at once | "Two large thin crust pizzas with pepperoni for delivery" fills five answers and Pip asks only what's missing. |
| Live order summary | The order ticket on the right fills in as you answer, highlights the question Pip is asking, flashes changed lines, and shows the running total with delivery fee and 13% HST. |
| Change one selection, keep the rest | Choose **Edit** on any ticket line, or say "change the toppings", "make it large", "add mushrooms too", or "remove the onions". At review, "Change something" lists every field. |
| Explicit confirmation | Pip reads back the whole order and total, then waits for "Place order" (or "yes", "confirm"). |
| Simulated confirmation | Order number, ready or arrival time, pickup location or delivery address, and a stamped ticket. Nothing is charged. |
| Voice input | Web Speech API. What the microphone hears appears live in the answer box, then sends after a 2-second countdown. Editing the text or pressing Esc stops the countdown. Low-confidence results wait for the customer to check them. |
| Spoken replies with matching text | Every reply is shown in the conversation. **Read replies aloud** turns speech on or off, and the bubble being spoken is outlined. |
| Clear states | Pip's face and the status pill show **Your turn**, **Listening…**, **Thinking…**, **Speaking**, **Paused**, and **Order placed**. |
| Hands-free | **Listen after Pip speaks** reopens the mic after each reply. It turns off when no speech is heard or the customer types, so the mic never loops. |
| Pause, go back, restart | Header buttons and voice commands: "pause", "go back", "repeat", "what can I say?", "start over". Starting over asks first if the ticket has anything on it. |
| Error recovery | Unsupported toppings are named back with the real options ("Anchovies aren't on our menu"), and if valid toppings were mixed in, Pip offers "Just pepperoni". Addresses missing a building number or city are asked for piece by piece while keeping what was given. Out-of-area cities, unsupported crusts and payments, and quantities above 10 are explained with a way forward. Each microphone error (no speech, blocked, no device, offline) has its own message. |
| Accessibility | Keyboard reachable controls, visible focus, a skip link, a screen-reader log for the conversation, 44px touch targets, Atkinson Hyperlegible body type, and reduced-motion support. |

The menu is deliberately small: three sizes, thin or hand-tossed crust, and five toppings (pepperoni, mushrooms, bell peppers, onions, extra cheese). Delivery covers Oshawa, Whitby, Ajax, Pickering, Courtice and Bowmanville. Prices and store details live in `js/menu.js`.

## Demo script

[conversation-flow.md](conversation-flow.md) has a complete success path and four error and recovery scenarios that can be typed or spoken word for word during the presentation.

## Project structure

```
index.html            Page structure and Pip's SVG artwork
css/styles.css        Visual design, Pip's animation states, responsive layout
js/menu.js            Menu, prices, store details
js/nlu.js             Turns a typed or spoken answer into intents and order details
js/voice.js           Speech recognition and speech synthesis wrapper
js/app.js             Conversation flow, order state, ticket and controls
tests/nlu.test.js     Unit tests for the language parsing
conversation-flow.md  Presentation script with recovery paths
```

Run the tests with Node 18 or later:

```sh
node --test tests/nlu.test.js
```

This version was rebuilt from the first prototype on the `MohitGajula` branch, keeping its Pip character, pickup and delivery flow, and validation ideas.

## Figma design

The editable design includes the welcome and pizza-size screens and Pip's idle and speaking poses. [Open the Group 10 design in Figma](https://www.figma.com/design/jpanhlrVfSLkbHgu6wJa6c?node-id=2-80).

## Design and evaluation

- Persona, user journey or task flow, conversation flowchart, and wireframes for the main interaction states. The proposal has already been submitted.
- A working desktop prototype demonstrating voice input and spoken replies, one complete successful order, and at least two error and recovery scenarios.
- Checks for normal completion, missing information, invalid answers, corrections, speech-recognition problems, and final confirmation.
- Testing with at least three users: record task outcomes, difficulties, and feedback, then revise the design.
- A 5–10 minute demo and a final UX report of at most five pages.

## Presentation and submissions

All times are Toronto local time.

| Milestone | Date and time | What to prepare |
| --- | --- | --- |
| Group 10 live presentation | Tuesday, November 24, 2026, 10:30–10:40 a.m. | Presentation and prototype demo |
| Canvas Demo/Presentation upload | Monday, November 30, 2026, 11:59 p.m. | ZIP with all code and a README |
| Canvas final project upload | Friday, December 4, 2026, 11:59 p.m. | ZIP with the final report, source files, and a README with setup steps |

## Team workflow

Each teammate works on their own branch (`AryanKumar`, `kingsley`, `MohitGajula`) created from the latest `main`, pushes it, and opens a pull request into `main` for review. Don't commit directly to `main`. After a merge, merge the latest `main` into your branch before continuing.
