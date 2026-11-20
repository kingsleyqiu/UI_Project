# Pizza Ordering Assistant

**Group 10 · SOFE 4850U · User Interface and Experience Design · Fall 2026**

Aryan Kumar, Qian Qiu, and Mohit Gajula

## Project overview

We are building a standalone desktop website prototype for students and other customers placing a pizza order. A visible 2D pizza-shop avatar will greet the customer, explain how to order, and ask one short question at a time. Customers can speak, type, or switch between the two. The demo will use a small menu, simulated payment selection, and simulated order confirmation.

## Planned ordering flow

1. Choose pickup or delivery.
2. Select a size, crust, toppings, and quantity. Each order supports one pizza configuration.
3. Enter an address for delivery only, then choose a simulated payment method.
4. Review the live order summary and change individual selections while keeping the other details.
5. Explicitly confirm the order. The assistant displays a simulated confirmation with the order details and pickup or delivery information.

The interface will show what the microphone heard, let customers retry or type a correction, and display each spoken reply as text. Keyboard-accessible controls and readable status messages will make it clear when the avatar is waiting, listening, processing, or speaking. Customers can pause, go back, or restart. The assistant will offer supported toppings after an invalid answer and ask for missing address details while retaining the rest of the order.

## Figma design

The editable design includes the welcome and pizza-size screens and Pip’s idle and speaking poses. [Open the Group 10 design in Figma](https://www.figma.com/design/jpanhlrVfSLkbHgu6wJa6c?node-id=2-80).

## Design and evaluation

- Prepare a persona, a user journey or task flow, a conversation flowchart, and wireframes for the main interaction states. The proposal has already been submitted.
- Build a working desktop prototype and demonstrate voice input and spoken replies. Show one complete successful order and at least two error and recovery scenarios.
- Verify normal completion, missing information, invalid answers, corrections, speech-recognition problems, and final confirmation.
- Test with at least three users. Record task outcomes, difficulties, and feedback, then revise the design based on what participants did and said.
- Present the prototype in a 5–10 minute demo. Document the design decisions, testing results, changes, limitations, and lessons learned in a final UX report of at most five pages.

## Presentation and submissions

All times are Toronto local time.

| Milestone | Date and time | What to prepare |
| --- | --- | --- |
| Group 10 live presentation | Tuesday, November 24, 2026, 10:30–10:40 a.m. | Presentation and prototype demo |
| Canvas Demo/Presentation upload | Monday, November 30, 2026, 11:59 p.m. | ZIP with all code and a README |
| Canvas final project upload | Friday, December 4, 2026, 11:59 p.m. | ZIP with the final report, source files, and a README with setup steps |

## Run the prototype

Open `index.html` in a browser to try a typed order. Use the suggested buttons or type your replies. Use fictional addresses for delivery and select a simulated payment option shown in the app.

To try voice controls, run a local server from the repository folder with Python 3.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765` in Chrome. Choose **Mic** and grant microphone access if prompted. The recognized text appears in the answer field so you can edit it before sending. The **Read replies aloud** button enables spoken prompts. Typing works throughout the order.

The current prototype covers pickup and delivery, review and editing, and simulated confirmation. The [typed pickup script](conversation-flow.md) includes a sample order and recovery paths.
