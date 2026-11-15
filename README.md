# Pizza Assistant

SOFE4850 UX Final Project, Fall 2026 — Group 10.

Team: Aryan Kumar, Qian Qiu, and Mohit Gajula.

A desktop Chrome extension that adds an English voice/text avatar to **the real Domino's Canada website**. A local Node.js service uses Gemini to interpret requests. Website changes require explicit confirmation. The assistant prepares the cart; the user completes payment and final submission.

**Current build:** Gemini is deliberately left disabled (`PIZZA_ENABLE_GEMINI=false`) at the user's request. Its connection point and validation are prepared for later integration. Typing/speaking a request currently displays a setup notice instead of making a model call. Automated flow tests use simulated model responses.

## Run locally

Requires desktop Google Chrome 116+ and Node.js 22+.

1. Copy `.env.example` to `.env` and leave the API fields as supplied for this build. At the later Gemini integration step, set `GEMINI_API_KEY` locally using a free-tier project and explicitly set `PIZZA_ENABLE_GEMINI=true`. Do not paste the key into chat, the extension, or GitHub. The prepared default model is `gemini-3.1-flash-lite`; availability and quota depend on your Google project.
2. Start the local backend:

   ```sh
   npm start
   ```

3. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this repository's `extension` folder.
4. Click the extension's toolbar icon. On its microphone setup page, click **Enable microphone**, grant access, and return to Domino's. Text input can be used without microphone setup.
5. On [Domino's Canada](https://www.dominos.ca/en/pages/order/), manually choose the store and carryout/delivery settings. Enter any delivery address directly on the website. Then open the store menu.
6. Open the floating Pizza Assistant. Once the later API integration is enabled, type a request or start listening, for example: `I want a large Hawaiian, no pineapple, add mushrooms.` With the API disabled, use the setup notice and automated tests to verify this build without a provider call.
7. Review each proposed operation and say **Yes** or click **Confirm**. The assistant first opens the product builder to discover that store's options, then asks for confirmation of the actual configuration.
8. Review the cart. You can request changes to this session's pizza. Use the website's **Continue Checkout** yourself for payment and final submission.

The local backend listens only on `127.0.0.1:8787`. Its `/health` response reports configuration status without revealing the key. A missing key, unavailable model, exhausted quota, or connection error pauses the flow. No paid fallback is configured; keep the Google project on its free tier.

## Confirmed product behavior

- Supports Pepperoni Feast, Hawaiian and Veggie when available at the selected store.
- Reads actual product links, size/crust controls and topping checkboxes from the live DOM. Toppings are **not a fixed ingredient list**.
- Supports whole-pizza size/crust changes, topping additions/removals, keeping/removing the base sauce or cheese, and quantity. Existing website defaults and weights stay unchanged; newly added toppings use whole-pizza normal portions.
- Requests missing flavor/size; quantity defaults to one. Unspecified toppings retain the selected recipe and are reviewed in the cart. “Only pepperoni” keeps base sauce and cheese unless explicitly removed.
- Uses continuous English speech recognition after explicit start. Collapsing the panel keeps listening, with a visible status and pause control. Recognition is suspended during spoken replies to avoid self-echo.
- A model produces a bounded intent, never browser code or selectors. Every instruction is displayed/read back and must be confirmed before a fixed page operation is executed. An exact `Yes` confirms; `Yes, add ham` is interpreted as a new request.
- Existing cart items are preserved. Only a uniquely identified new item is claimed as this session's pizza. Merged/ambiguous rows pause for manual handling. Changing pizza type after adding requires confirmed cancellation and a new session.
- Cancellation requires confirmation and removes only this session's item. Other items stay.
- The cart review route contains `#!/checkout/`; it is distinct from `/payment`. Before payment handoff, the assistant reminds users about other cart items, stops listening and leaves checkout to them.
- Partial failures pause with the current website state. A retry after an uncertain save only inspects the cart; it does not add another pizza.

## Data and credentials

Gemini receives food instructions, short food dialogue, normalized allowed menu labels and nonpersonal order fields. Website addresses, account/payment fields, full HTML and screenshots are not sent. Common personal-data patterns in free text are rejected locally before a cloud request; arbitrary speech cannot be guaranteed to contain no personal information, so use food requests only.

Google's [unpaid-service terms](https://aistudio.google.com/docs/terms#data-use-unpaid) describe product-improvement use of inputs and outputs. Browser speech recognition may also use a browser-provider service. The extension has access only to Domino's Canada and the local backend. Session state uses ephemeral Chrome session storage; there is no persistent conversation database.

## Development and verification

```sh
npm ci
npm test
```

Runtime code uses Node/Chrome built-ins. `linkedom` is a development dependency for regression tests against captured public Domino's builder/cart markup. Tests mock Gemini; they do not submit real orders or require a real key.

- `extension/content.js`: confirmed instruction flow and handoff.
- `extension/site.js`: live-page discovery and fixed DOM operations.
- `extension/planner.js` / `cart.js`: pure intent planning and cart ownership checks.
- `extension/panel.js` / `voice.js`: accessible avatar panel and speech.
- `extension/background.js` / `offscreen.js`: localhost bridge and voice continuity across page navigation.
- `backend/`: validated Gemini requests and JSON responses.
- `docs/ACCEPTANCE.md`: manual smoke tests and usability-test record template.

Live DOM reconnaissance verified the three product links, dynamic topping controls, an added Mushroom checkbox, add-to-cart upsell, stable cart row ID/edit links, and the separate payment link. Automated tests verify extracted fixtures and mocked services. Installation, microphone continuity and a real Gemini request still need a local Chrome smoke test with your key; fixture tests alone do not establish end-to-end browser success.

## Team workflow

`main` is the shared integration branch. Kingsley develops on `kingsley`; teammates create their own branches from the latest `main`. Commit and push to your own branch, open a Pull Request into `main`, review, then merge. Fetch and merge the latest `origin/main` into your branch before continuing. Branch names alone do not enforce protection.

## Course work

Keep the persona, task/conversation flows, wireframes, three-user usability evidence, changes and final report alongside implementation. The supplied guideline lists a 5–10 minute demo and a five-page report due December 4, 2026 at 11:59 pm; confirm the team's presentation slot and any later updates in Canvas. Do not describe tests or user findings as completed until actually recorded.
