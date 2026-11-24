/* Pip's conversation flow, order state and interface. */
(function () {
  "use strict";

  const { MENU, price, money } = window.PipMenu;
  const NLU = window.PipNLU;
  const Voice = window.PipVoice;
  const $ = (id) => document.getElementById(id);

  const el = {
    app: $("app"), pip: $("pip"), status: $("pip-status"), statusText: $("status-text"),
    welcome: $("welcome"), transcript: $("transcript"), dock: $("dock"), replies: $("replies"),
    form: $("composer"), input: $("answer"), mic: $("mic-btn"), heard: $("heard"), autosend: $("autosend"),
    back: $("back-btn"), repeat: $("repeat-btn"), help: $("help-btn"),
    pause: $("pause-btn"), restart: $("restart-btn"), stepper: $("stepper"),
    voiceToggle: $("voice-toggle"), handsFree: $("handsfree-toggle"), voiceNote: $("voice-note"),
    startVoice: $("start-voice"), startType: $("start-type"), welcomeVoiceNote: $("welcome-voice-note"),
    ticket: $("ticket"), ticketMeta: $("ticket-meta"), ticketLines: $("ticket-lines"),
    totals: $("ticket-totals"), eta: $("eta"),
  };

  /* ---------- order model ---------- */

  const FIELDS = {
    service: { label: "Service", step: "Service" },
    size: { label: "Size", step: "Size" },
    crust: { label: "Crust", step: "Crust" },
    toppings: { label: "Toppings", step: "Toppings" },
    quantity: { label: "How many", step: "How many" },
    address: { label: "Address", step: "Address" },
    payment: { label: "Payment", step: "Payment" },
  };
  const ALL_STEPS = ["service", "size", "crust", "toppings", "quantity", "address", "payment"];

  const blankOrder = () => ({
    service: null, size: null, crust: null, toppings: null, quantity: null,
    address: { street: null, city: null, postal: null }, payment: null,
  });
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const state = {
    started: false,
    order: blankOrder(),
    editing: null,        // field being changed out of order
    pending: null,        // "change-target" | "restart"
    history: [],          // snapshots for Back
    confirmed: false,
    placing: false,
    paused: false,
    speakReplies: false,
    handsFree: false,
    listening: false,
    failures: {},
    lastPip: null,
    toppingDraft: new Set(),
    placed: null,
    ackIndex: 0,
  };

  const stepsFor = (order) => ALL_STEPS.filter((k) => k !== "address" || order.service !== "Pickup");

  function isSet(order, key) {
    if (key === "toppings") return Array.isArray(order.toppings);
    if (key === "address") return Boolean(order.address.street && order.address.city);
    return order[key] !== null && order[key] !== undefined;
  }

  function currentStep() {
    if (state.confirmed) return "done";
    if (state.editing) return state.editing;
    return stepsFor(state.order).find((k) => !isSet(state.order, k)) || "review";
  }

  const hasAnything = () => ALL_STEPS.some((k) => k === "address"
    ? Boolean(state.order.address.street || state.order.address.city)
    : isSet(state.order, k));

  /* ---------- wording ---------- */

  const NUMBER_NAMES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  function listJoin(items, word = "and") {
    if (items.length <= 1) return items.join("");
    if (items.length === 2) return items[0] + " " + word + " " + items[1];
    return items.slice(0, -1).join(", ") + ", " + word + " " + items[items.length - 1];
  }
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function toppingText(toppings) {
    if (!toppings || !toppings.length) return "cheese only";
    return listJoin(toppings.map((t) => t.toLowerCase()));
  }

  function paymentText(order, short = false) {
    if (order.payment === "Card") return short ? "Demo card" : "demo card";
    if (order.payment === "Cash") {
      const where = order.service === "Delivery" ? "on delivery" : "at pickup";
      return (short ? "Cash " : "cash ") + where;
    }
    return "";
  }

  function addressText(a) {
    return [a.street, a.city].filter(Boolean).join(", ") + (a.postal ? " " + a.postal : "");
  }

  function valueText(key, order = state.order) {
    switch (key) {
      case "service": return order.service;
      case "size": {
        const s = MENU.sizes.find((x) => x.id === order.size);
        return s ? s.id + " (" + s.inches + "″)" : null;
      }
      case "crust": return order.crust;
      case "toppings": return Array.isArray(order.toppings) ? capital(toppingText(order.toppings)) : null;
      case "quantity": return order.quantity ? String(order.quantity) : null;
      case "address": return order.address.street || order.address.city ? addressText(order.address) : null;
      case "payment": return order.payment ? paymentText(order, true) : null;
      default: return null;
    }
  }

  function ackText(key, order) {
    switch (key) {
      case "service": return order.service === "Pickup" ? "pickup" : "delivery";
      case "size": return order.size.toLowerCase();
      case "crust": return order.crust === "Thin" ? "thin crust" : "hand-tossed crust";
      case "toppings": return toppingText(order.toppings);
      case "quantity": return order.quantity === 1 ? "one pizza" : (NUMBER_NAMES[order.quantity] || order.quantity) + " pizzas";
      case "payment": return paymentText(order);
      default: return "";
    }
  }

  function pizzaDescription(order) {
    const q = order.quantity || 1;
    const count = NUMBER_NAMES[q] || String(q);
    const crust = order.crust === "Thin" ? "thin-crust" : "hand-tossed";
    const noun = q === 1 ? "pizza" : "pizzas";
    const top = order.toppings && order.toppings.length ? "with " + toppingText(order.toppings) : "with cheese only";
    return count + " " + order.size.toLowerCase() + " " + crust + " " + noun + " " + top;
  }

  const ACKS = ["Got it.", "Nice.", "Perfect.", "Okay."];
  function nextAck() {
    state.ackIndex = (state.ackIndex + 1) % ACKS.length;
    return ACKS[state.ackIndex];
  }

  /* ---------- prompts per step ---------- */

  function promptFor(step) {
    const order = state.order;
    switch (step) {
      case "service":
        return {
          q: "Would you like pickup or delivery?",
          chips: [{ label: "Pickup", value: "Pickup", sub: MENU.pickupMinutes + " min" }, { label: "Delivery", value: "Delivery", sub: "+" + money(MENU.deliveryFee) }],
        };
      case "size":
        return {
          q: "What size? Small is 10 inches, medium is 12, and large is 14.",
          chips: MENU.sizes.map((s) => ({ label: s.id, value: s.id, sub: money(s.price) })),
        };
      case "crust":
        return { q: "Thin or hand-tossed crust?", chips: MENU.crusts.map((c) => ({ label: c, value: c })) };
      case "toppings":
        return {
          q: "Which toppings? We have pepperoni, mushrooms, bell peppers, onions, and extra cheese. Pick a few, or say cheese only.",
          toppings: true,
        };
      case "quantity":
        return {
          q: "How many pizzas like this would you like?",
          chips: [1, 2, 3, 4].map((n) => ({ label: String(n), value: String(n) })),
        };
      case "address": {
        const a = order.address;
        const cities = MENU.deliveryCities.map((c) => ({ label: c, value: c }));
        if (a.street && !a.city) {
          return { q: "Which city is " + a.street + " in?", chips: cities };
        }
        if (a.city && !a.street) {
          return { q: "What's the street address in " + a.city + "? Include the building number." };
        }
        return {
          q: "What's the delivery address? Say the street and city, like 55 Simcoe St N, Oshawa.",
          chips: [{ label: "Switch to pickup", value: "Switch to pickup" }],
        };
      }
      case "payment": {
        const cash = order.service === "Delivery" ? "Cash on delivery" : "Cash at pickup";
        return {
          q: "How would you like to pay? It's a demo, so nothing is charged.",
          chips: [{ label: "Demo card", value: "Card" }, { label: cash, value: "Cash" }],
        };
      }
      case "review": {
        const p = price(order);
        const where = order.service === "Pickup" ? "for pickup" : "for delivery to " + addressText(order.address);
        return {
          lead: "Here's your order: " + pizzaDescription(order) + ", " + where + ", paid by " + paymentText(order) + ". Total " + money(p.total) + ".",
          q: "Should I place the order?",
          chips: [{ label: "Place order", value: "Place order", primary: true }, { label: "Change something", value: "Change something" }],
        };
      }
      default:
        return { q: "" };
    }
  }

  function helpFor(step) {
    const common = "You can also say “go back”, “repeat”, or “start over”.";
    const map = {
      service: "Say pickup or delivery. You can also give everything at once, like “a large thin pepperoni for pickup”.",
      size: "Say small, medium, or large.",
      crust: "Say thin or hand-tossed.",
      toppings: "Name one or more toppings, like “pepperoni and mushrooms”, or say “cheese only”.",
      quantity: "Say a number from 1 to " + MENU.maxQuantity + ".",
      address: "Say a street address with a number and the city. We deliver to " + listJoin(MENU.deliveryCities) + ". Or say “switch to pickup”.",
      payment: "Say demo card or cash.",
      review: "Say “place order” to confirm, or tell me what to change, like “make it large” or “change the toppings”.",
    };
    return (map[step] || "") + " " + common;
  }

  /* ---------- Pip: avatar, status, speech ---------- */

  let fakeSpeech = null;
  let autoListenTimer = null;

  function setActivity(activity) {
    el.pip.dataset.activity = activity === "paused" || activity === "done" ? "idle" : activity;
    el.status.dataset.activity = activity;
    const labels = {
      idle: state.started ? "Your turn" : "Say hi to Pip",
      listening: "Listening…",
      thinking: state.placing ? "Sending your order…" : "Thinking…",
      speaking: "Speaking",
      paused: "Paused",
      done: "Order placed",
    };
    el.statusText.textContent = labels[activity] || labels.idle;
  }

  function settle() {
    if (state.confirmed) setActivity("done");
    else if (state.paused) setActivity("paused");
    else if (state.listening) setActivity("listening");
    else setActivity("idle");
  }

  function setMood(mood) { el.pip.dataset.mood = mood || "neutral"; }

  function stopTalking() {
    Voice.cancelSpeech();
    clearTimeout(fakeSpeech);
    clearTimeout(autoListenTimer);
    el.transcript.querySelectorAll(".is-speaking").forEach((n) => n.classList.remove("is-speaking"));
  }

  function say(text, bubble) {
    stopTalking();
    if (state.paused) { settle(); return; }
    bubble?.classList.add("is-speaking");
    const done = () => {
      bubble?.classList.remove("is-speaking");
      settle();
      maybeAutoListen();
    };
    setActivity("speaking");
    if (state.speakReplies && Voice.canSpeak) {
      Voice.speak(text, { onend: done });
    } else {
      // Without audio Pip still mouths the line briefly, so the avatar feels responsive.
      fakeSpeech = setTimeout(done, Math.min(2200, 450 + text.length * 22));
    }
  }

  function maybeAutoListen() {
    if (!state.handsFree || !Voice.canListen || state.paused || state.confirmed || state.placing || state.listening) return;
    if (document.hidden) return;
    autoListenTimer = setTimeout(startListening, 350);
  }

  /* ---------- transcript ---------- */

  const ICON_MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function scrollDown() {
    requestAnimationFrame(() => { el.transcript.scrollTop = el.transcript.scrollHeight; });
  }

  function addUser(text, source) {
    const li = document.createElement("li");
    li.className = "msg msg-user";
    const who = document.createElement("span");
    who.className = "msg-who";
    who.innerHTML = source === "voice" ? ICON_MIC + "You said" : "You";
    const bubble = document.createElement("p");
    bubble.className = "bubble";
    bubble.textContent = text;
    li.append(who, bubble);
    el.transcript.append(li);
    scrollDown();
  }

  /**
   * Pip speaks one message: an optional lead line plus the question,
   * shown in the transcript, read aloud when enabled, with reply chips.
   */
  function pipSays({ lead = "", q = "", tone = "", chips, toppings = false, mood }) {
    el.transcript.querySelectorAll(".msg-pip:not(.is-older)").forEach((n) => n.classList.add("is-older"));
    const li = document.createElement("li");
    li.className = "msg msg-pip" + (tone ? " is-" + tone : "");
    const who = document.createElement("span");
    who.className = "msg-who";
    who.textContent = "Pip";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (lead) {
      const p = document.createElement("p");
      p.className = "bubble-lead";
      p.textContent = lead;
      bubble.append(p);
    }
    if (q) {
      const p = document.createElement("p");
      p.className = "bubble-q";
      p.textContent = q;
      bubble.append(p);
    }
    li.append(who, bubble);
    el.transcript.append(li);
    scrollDown();

    state.lastPip = { lead, q, tone, chips, toppings, mood };
    setMood(mood || (tone === "problem" ? "confused" : tone === "success" ? "happy" : "neutral"));
    renderReplies(chips, toppings);
    render();
    say([lead, q].filter(Boolean).join(" "), li);
  }

  function ask(step, lead = "", tone = "") {
    const p = promptFor(step);
    pipSays({ lead: [lead, p.lead].filter(Boolean).join(" "), q: p.q, chips: p.chips, toppings: p.toppings, tone });
  }

  /* ---------- reply chips ---------- */

  function chipButton({ label, value, sub, primary }) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (primary ? " chip-primary" : "");
    b.textContent = label;
    if (sub) {
      const s = document.createElement("small");
      s.textContent = sub;
      b.append(s);
    }
    b.addEventListener("click", () => submit(value || label, "tap"));
    return b;
  }

  function renderReplies(chips, toppings) {
    el.replies.replaceChildren();
    if (toppings) {
      state.toppingDraft = new Set(Array.isArray(state.order.toppings) ? state.order.toppings : []);
      const addBtn = document.createElement("button");
      const syncAdd = () => {
        const n = state.toppingDraft.size;
        addBtn.disabled = n === 0;
        addBtn.textContent = n ? "Add " + n + (n === 1 ? " topping" : " toppings") : "Pick toppings";
      };
      MENU.toppings.forEach((t) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.setAttribute("aria-pressed", String(state.toppingDraft.has(t)));
        b.innerHTML = ICON_CHECK;
        b.querySelector("svg").style.display = state.toppingDraft.has(t) ? "" : "none";
        b.append(document.createTextNode(t));
        const s = document.createElement("small");
        s.textContent = "+" + money(MENU.toppingPrice);
        b.append(s);
        b.addEventListener("click", () => {
          const on = !state.toppingDraft.has(t);
          if (on) state.toppingDraft.add(t); else state.toppingDraft.delete(t);
          b.setAttribute("aria-pressed", String(on));
          b.querySelector("svg").style.display = on ? "" : "none";
          syncAdd();
        });
        el.replies.append(b);
      });
      const br = document.createElement("span");
      br.className = "replies-break";
      addBtn.type = "button";
      addBtn.className = "chip chip-primary";
      addBtn.addEventListener("click", () => {
        const picked = MENU.toppings.filter((t) => state.toppingDraft.has(t));
        if (picked.length) submit(listJoin(picked), "tap");
      });
      syncAdd();
      el.replies.append(br, addBtn, chipButton({ label: "Cheese only", value: "Cheese only" }));
      return;
    }
    (chips || []).forEach((c) => el.replies.append(chipButton(c)));
  }

  /* ---------- rendering: stepper, ticket, controls ---------- */

  let lastValues = {};

  function render() {
    const order = state.order;
    const step = currentStep();
    const steps = stepsFor(order);

    // progress stepper
    const items = [...steps, "review"].map((key, i) => {
      const li = document.createElement("li");
      const done = state.confirmed || (key === "review" ? false : isSet(order, key) && step !== key);
      const current = !state.confirmed && key === step;
      li.className = "step" + (done ? " is-done" : "") + (current ? " is-current" : "");
      if (current) li.setAttribute("aria-current", "step");
      const mark = document.createElement("span");
      mark.className = "step-mark";
      mark.innerHTML = done ? ICON_CHECK : String(i + 1);
      const label = document.createElement("span");
      label.className = "step-label";
      label.textContent = key === "review" ? "Review" : FIELDS[key].step;
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = done ? " (done)" : current ? " (current)" : "";
      li.append(mark, label, sr);
      return li;
    });
    el.stepper.replaceChildren(...items);

    // ticket lines
    const lines = steps.map((key) => {
      const li = document.createElement("li");
      const value = valueText(key);
      li.className = "ticket-line" + (key === step && state.started ? " is-asking" : "");
      if (state.started && value && lastValues[key] !== undefined && lastValues[key] !== value) li.classList.add("is-flash");
      const label = document.createElement("span");
      label.className = "ticket-label";
      label.textContent = FIELDS[key].label;
      const v = document.createElement("span");
      v.className = "ticket-value" + (value ? "" : " is-pending");
      v.textContent = value || (key === step && state.started ? "Pip is asking…" : "· · ·");
      li.append(label, v);
      if (value && isSet(order, key) && !state.confirmed && !state.placing) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ticket-edit";
        b.textContent = "Edit";
        b.setAttribute("aria-label", "Edit " + FIELDS[key].label.toLowerCase());
        b.addEventListener("click", () => beginEdit(key, "tap"));
        li.append(b);
      }
      return li;
    });
    lastValues = Object.fromEntries(steps.map((k) => [k, valueText(k) || ""]));
    el.ticketLines.replaceChildren(...lines);

    // totals
    const p = price(order);
    if (p) {
      const row = (label, amount, cls = "") => `<div class="${cls}"><span>${label}</span><span>${amount}</span></div>`;
      el.totals.innerHTML =
        row(p.quantity + " × " + order.size.toLowerCase() + " pizza", money(p.subtotal))
        + (order.service === "Delivery" ? row("Delivery fee", money(p.delivery)) : "")
        + row("HST 13%", money(p.tax))
        + row("Total", money(p.total), "is-total");
      el.totals.hidden = false;
    } else {
      el.totals.hidden = true;
    }

    el.ticket.classList.toggle("is-confirmed", state.confirmed);
    el.ticketMeta.textContent = state.confirmed
      ? "Order #" + state.placed.number + " · " + state.placed.time
      : state.started ? "Updates as you answer" : "Fills in as you answer";

    // controls
    el.back.disabled = !state.history.length || state.confirmed || state.placing;
    el.restart.disabled = !state.started;
    el.pause.disabled = !state.started || state.confirmed;
    el.repeat.disabled = !state.lastPip;
    el.help.disabled = state.confirmed;
    el.input.disabled = state.placing;
    el.mic.disabled = !Voice.canListen || state.placing;
    el.replies.querySelectorAll("button").forEach((b) => { b.disabled = b.disabled || state.placing; });
  }

  /* ---------- flow ---------- */

  function snapshot() {
    state.history.push({ order: clone(state.order), editing: state.editing });
    if (state.history.length > 40) state.history.shift();
  }

  function beginEdit(key, source) {
    if (state.confirmed || state.placing) return;
    if (source === "tap") addUser("Change the " + FIELDS[key].label.toLowerCase(), "tap");
    state.pending = null;
    state.editing = key;
    if (key === "address") state.order.address = { street: null, city: null, postal: null };
    ask(key, "Sure, let's change the " + FIELDS[key].label.toLowerCase() + ".");
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) {
      ask(currentStep(), "This is the first question, so there's nothing to go back to.");
      return;
    }
    state.order = prev.order;
    state.editing = prev.editing;
    state.pending = null;
    ask(currentStep(), "Okay, going back one step.");
  }

  function restart(announce = true) {
    stopTalking();
    cancelListening();
    state.order = blankOrder();
    state.editing = null;
    state.pending = null;
    state.history = [];
    state.confirmed = false;
    state.placing = false;
    state.paused = false;
    state.failures = {};
    state.placed = null;
    lastValues = {};
    el.eta.hidden = true;
    el.pause.setAttribute("aria-pressed", "false");
    el.pause.querySelector("span").textContent = "Pause";
    if (announce) {
      el.transcript.replaceChildren();
      ask("service", "Fresh start! Your ticket is cleared.");
    }
  }

  function setPaused(paused) {
    state.paused = paused;
    el.pause.setAttribute("aria-pressed", String(paused));
    el.pause.querySelector("span").textContent = paused ? "Resume" : "Pause";
    if (paused) {
      stopTalking();
      cancelListening();
      el.heard.textContent = "Paused. Your order is saved. Choose Resume or send any answer to continue.";
      el.heard.classList.remove("is-warning");
      settle();
    } else {
      el.heard.textContent = "";
      settle();
    }
  }

  function repeatLast() {
    if (!state.lastPip) return;
    const last = state.lastPip;
    pipSays({ ...last, lead: last.lead ? last.lead : "Here it is again." });
  }

  function failureFor(step, text) {
    state.failures[step] = (state.failures[step] || 0) + 1;
    const tries = state.failures[step];
    const nudge = tries >= 2 ? " You can also tap one of the options below." : "";
    const what = {
      service: "I didn't catch pickup or delivery there.",
      size: "I didn't catch a size there.",
      crust: "I didn't catch a crust there.",
      toppings: "I didn't recognize a topping there.",
      quantity: "I need a number for how many pizzas.",
      address: "That doesn't look like a street address yet.",
      payment: "I didn't catch a payment method there.",
      review: "I'm not sure if that's a yes.",
    }[step] || "I didn't catch that.";
    ask(step, what + nudge, "problem");
  }

  function problemMessage(problem) {
    switch (problem.type) {
      case "toppings": {
        const names = listJoin(problem.unknown.map((t) => t.toLowerCase()));
        const verb = problem.unknown.length === 1 && !/s$/.test(problem.unknown[0]) ? "isn't" : "aren't";
        return { lead: capital(names) + " " + verb + " on our menu.", keep: problem.valid };
      }
      case "crust": return { lead: "We don't make " + problem.value + " crust. Choose thin or hand-tossed." };
      case "quantity-high": return { lead: "Online orders go up to " + MENU.maxQuantity + " pizzas. For " + problem.value + ", please call the store." };
      case "quantity-low": return { lead: "You'll need at least one pizza." };
      case "payment": return { lead: capital(problem.value) + " isn't available in this demo." };
      default: return { lead: "I didn't catch that." };
    }
  }

  function applyAddress(r) {
    const order = state.order;
    const a = r.address || {};
    const before = clone(order);
    let changed = false;
    let problem = null;

    if (a.street) { order.address.street = a.street; changed = true; }
    if (a.postal) { order.address.postal = a.postal; changed = true; }
    if (a.city) {
      if (MENU.deliveryCities.includes(a.city)) {
        order.address.city = a.city;
        changed = true;
      } else {
        problem = {
          lead: "We don't deliver to " + a.city + " yet. We deliver in " + listJoin(MENU.deliveryCities) + ".",
          q: "Try another address, or switch to pickup.",
          chips: [{ label: "Switch to pickup", value: "Switch to pickup" }],
        };
      }
    }
    if (!problem && a.missingNumber && !a.street) {
      problem = { lead: "I need the building number for " + a.missingNumber + "." };
    }

    if (changed) {
      state.history.push({ order: before, editing: state.editing });
      state.failures.address = 0;
    }
    if (problem) {
      if (problem.q) pipSays({ ...problem, tone: "problem" });
      else ask("address", problem.lead, "problem");
      return;
    }
    if (!changed) { failureFor("address"); return; }

    if (isSet(order, "address")) {
      if (state.editing === "address") state.editing = null;
      next("Delivering to " + addressText(order.address) + ". " + nextAck());
    } else if (order.address.street) {
      ask("address", "Got " + order.address.street + ".");
    } else {
      ask("address", "Delivering in " + order.address.city + ".");
    }
  }

  function next(lead) {
    const step = currentStep();
    ask(step, lead, step === "review" ? "" : "");
  }

  function applyAnswer(r, step) {
    const order = state.order;
    const keys = ["service", "size", "crust", "toppings", "quantity", "payment"].filter((k) => r.slots[k] !== undefined);
    const before = clone(order);
    const applied = [];

    keys.forEach((k) => {
      let value = Array.isArray(r.slots[k]) ? [...r.slots[k]] : r.slots[k];
      // "Add mushrooms too" keeps what's already on the pizza.
      if (k === "toppings" && r.toppingsMode === "add" && Array.isArray(order.toppings)) {
        value = MENU.toppings.filter((t) => order.toppings.includes(t) || value.includes(t));
      }
      order[k] = value;
      applied.push(k);
    });
    if (r.toppingsRemove && Array.isArray(order.toppings)) {
      order.toppings = order.toppings.filter((t) => !r.toppingsRemove.includes(t));
      applied.push("toppings");
    }

    if (applied.includes("service") && order.service === "Pickup") {
      order.address = { street: null, city: null, postal: null };
    }

    if (applied.length) {
      state.history.push({ order: before, editing: state.editing });
      if (state.editing && applied.includes(state.editing)) state.editing = null;
      applied.forEach((k) => { state.failures[k] = 0; });
      state.pending = null;
    }

    const ackPart = applied.length ? capital(listJoin(applied.map((k) => ackText(k, order)))) + "." : "";

    if (r.problems.length) {
      const msg = problemMessage(r.problems[0]);
      const nowStep = currentStep();
      const p = promptFor(nowStep);
      let chips = p.chips;
      if (msg.keep && msg.keep.length) {
        chips = [{ label: "Just " + toppingText(msg.keep), value: "Just " + listJoin(msg.keep), primary: true }, { label: "Cheese only", value: "Cheese only" }];
      }
      const problemStep = r.problems[0].type.startsWith("quantity") ? "quantity" : r.problems[0].type;
      const askStep = FIELDS[problemStep] && !isSet(order, problemStep) ? problemStep : nowStep;
      const q = askStep === nowStep ? p.q : promptFor(askStep).q;
      pipSays({
        lead: [ackPart, msg.lead].filter(Boolean).join(" "),
        q,
        chips: msg.keep && msg.keep.length ? chips : (askStep === nowStep ? p.chips : promptFor(askStep).chips),
        toppings: !(msg.keep && msg.keep.length) && askStep === "toppings",
        tone: "problem",
      });
      return;
    }

    if (!applied.length) { failureFor(step); return; }

    const nowStep = currentStep();
    if (step === "review" || nowStep === "review") {
      const changedAtReview = step === "review";
      next(changedAtReview ? "Updated: " + ackPart.replace(/\.$/, "") + "." : ackPart + " " + nextAck());
    } else {
      next(ackPart + " " + nextAck());
    }
  }

  function placeOrder() {
    state.placing = true;
    state.pending = null;
    stopTalking();
    const card = state.order.payment === "Card";
    pipSays({
      lead: card ? "Charging your demo card and sending your order to the kitchen…" : "Sending your order to the kitchen…",
      q: "",
      chips: [],
    });
    clearTimeout(autoListenTimer);
    setTimeout(() => setActivity("thinking"), 50);
    setTimeout(() => {
      stopTalking();
      state.placing = false;
      state.confirmed = true;
      const now = new Date();
      const minutes = state.order.service === "Pickup" ? MENU.pickupMinutes : MENU.deliveryMinutes;
      const ready = new Date(now.getTime() + minutes * 60000);
      const fmt = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      state.placed = { number: String(1000 + Math.floor(Math.random() * 9000)), time: fmt(now), ready: fmt(ready) };
      const o = state.order;
      const total = money(price(o).total);
      const detail = o.service === "Pickup"
        ? "It'll be ready for pickup around " + state.placed.ready + " at " + MENU.store.address + "."
        : "It should arrive at " + o.address.street + " around " + state.placed.ready + ".";
      const pay = o.payment === "Card" ? "Your demo card was not really charged." : "Have " + total + " in cash ready " + (o.service === "Pickup" ? "at the counter." : "for the driver.");
      el.eta.innerHTML = "";
      const h = document.createElement("h3");
      h.textContent = o.service === "Pickup" ? "Ready around " + state.placed.ready : "Arriving around " + state.placed.ready;
      const p = document.createElement("p");
      p.textContent = o.service === "Pickup" ? "Pickup at " + MENU.store.name + ", " + MENU.store.address + "." : "Delivery to " + addressText(o.address) + ".";
      el.eta.append(h, p);
      el.eta.hidden = false;
      pipSays({
        lead: "Your order is in! Order number " + state.placed.number + ": " + pizzaDescription(o) + ". " + detail + " " + pay,
        q: "Thanks for ordering with Pip!",
        tone: "success",
        mood: "happy",
        chips: [{ label: "Start a new order", value: "New order", primary: true }],
      });
    }, 1900);
    render();
  }

  /* ---------- input handling ---------- */

  function submit(raw, source = "type") {
    const text = String(raw || "").trim();
    cancelAutosend();
    if (!text) {
      el.heard.textContent = "Type an answer, tap an option, or use the mic.";
      el.heard.classList.add("is-warning");
      el.input.focus();
      return;
    }
    if (state.placing) return;
    if (!state.started) begin(false);
    if (source === "type") setHandsFree(false, true);
    if (state.paused) setPaused(false);

    stopTalking();
    cancelListening();
    el.input.value = "";
    el.input.classList.remove("is-interim");
    el.heard.textContent = "";
    el.heard.classList.remove("is-warning");
    addUser(text, source);
    setActivity("thinking");
    setTimeout(() => respond(text), 380);
  }

  function respond(text) {
    const step = currentStep();
    const r = NLU.understand(text, { step, order: state.order });

    if (state.confirmed) {
      if (r.intent === "restart" || /\bnew order\b/i.test(text)) restart(true);
      else if (r.intent === "repeat") repeatLast();
      else pipSays({ lead: "Your order is already in.", q: "Say “new order” to start another one.", chips: [{ label: "Start a new order", value: "New order", primary: true }], mood: "happy" });
      return;
    }

    if (state.pending === "restart") {
      state.pending = null;
      if (r.intent === "confirm" || /^yes\b/i.test(r.normalized)) { restart(true); return; }
      if (r.intent === "deny" || /\b(?:keep|no)\b/.test(r.normalized)) { ask(step, "Okay, keeping your order."); return; }
    }

    switch (r.intent) {
      case "restart":
        if (!hasAnything()) { restart(true); return; }
        state.pending = "restart";
        pipSays({
          lead: "Start a new order?",
          q: "That clears everything on your ticket.",
          chips: [{ label: "Yes, start over", value: "Yes, start over", primary: true }, { label: "No, keep my order", value: "No, keep my order" }],
        });
        return;
      case "back": goBack(); return;
      case "repeat": repeatLast(); return;
      case "pause": setPaused(true); return;
      case "help": ask(step, helpFor(step)); return;
      default: break;
    }

    if (r.editField) {
      if (r.editField === "address" && state.order.service !== "Delivery") {
        ask(step, "Address is only needed for delivery. Say “delivery” if you'd like it brought to you.");
        return;
      }
      beginEdit(r.editField);
      return;
    }

    if (state.pending === "change-target") {
      const field = r.field;
      if (field && FIELDS[field] && !(field === "address" && state.order.service !== "Delivery")) {
        beginEdit(field);
        return;
      }
    }

    if (step === "review") {
      if (r.intent === "confirm" && !Object.keys(r.slots).length) { placeOrder(); return; }
      if (r.intent === "deny" && !Object.keys(r.slots).length) {
        state.pending = "change-target";
        pipSays({
          q: "What would you like to change?",
          chips: stepsFor(state.order).map((k) => ({ label: FIELDS[k].label, value: "Change the " + FIELDS[k].label.toLowerCase() })),
        });
        return;
      }
    }

    if (step === "address") {
      if (r.slots.service === "Pickup") {
        applyAnswer(r, step);
        return;
      }
      applyAddress(r);
      return;
    }

    applyAnswer(r, step);
  }

  /* ---------- voice input ---------- */

  let autosendTimer = null;
  const AUTOSEND_MS = 2000;

  function cancelAutosend(message) {
    if (!autosendTimer) return;
    clearTimeout(autosendTimer);
    autosendTimer = null;
    el.autosend.hidden = true;
    if (message) el.heard.textContent = message;
  }

  function startAutosend() {
    cancelAutosend();
    el.autosend.hidden = false;
    el.autosend.style.setProperty("--autosend-ms", AUTOSEND_MS + "ms");
    const bar = el.autosend.firstElementChild;
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = "";
    el.heard.textContent = "Sending what I heard in 2 seconds. Edit the text or press Esc to stop.";
    autosendTimer = setTimeout(() => {
      autosendTimer = null;
      el.autosend.hidden = true;
      submit(el.input.value, "voice");
    }, AUTOSEND_MS);
  }

  const MIC_ERRORS = {
    "no-speech": "I didn't hear anything. Tap the mic and try again, or type your answer.",
    "audio-capture": "No microphone was found. Check that one is connected, or type your answer.",
    "not-allowed": "Microphone access is blocked. Allow it from the icon in the address bar, or type your answer.",
    "service-not-allowed": "Voice input isn't allowed here. Open the page from a local server in Chrome (see the README), or type your answer.",
    network: "Voice input needs an internet connection in this browser. Type your answer instead.",
    "start-failed": "The microphone couldn't start. Try again, or type your answer.",
  };

  function startListening() {
    if (!Voice.canListen || state.placing) return;
    if (!state.started) begin(true);
    if (state.paused) setPaused(false);
    stopTalking();
    cancelAutosend();
    state.listening = true;
    el.mic.setAttribute("aria-pressed", "true");
    el.mic.setAttribute("aria-label", "Stop listening");
    el.input.value = "";
    el.input.placeholder = "Listening… speak now";
    el.heard.classList.remove("is-warning");
    el.heard.textContent = "Listening. Say your answer, then pause.";
    setActivity("listening");

    Voice.listen({
      oninterim: (t) => {
        el.input.value = t;
        el.input.classList.add("is-interim");
      },
      onprocessing: () => { if (state.listening) setActivity("thinking"); },
      onfinal: (t, confidence) => {
        el.input.value = t;
        el.input.classList.remove("is-interim");
        if (confidence > 0 && confidence < 0.45) {
          el.heard.textContent = "I'm not sure I heard that right. Check the text, then press Send, or tap the mic to try again.";
          el.heard.classList.add("is-warning");
          el.input.focus();
        } else {
          startAutosend();
        }
      },
      onerror: (code) => {
        el.heard.textContent = MIC_ERRORS[code] || "Something went wrong with the microphone. Try again, or type your answer.";
        if (code === "not-allowed" && location.protocol === "file:") el.heard.textContent = MIC_ERRORS["service-not-allowed"];
        el.heard.classList.add("is-warning");
        setMood("confused");
        if (state.handsFree) setHandsFree(false, true);
      },
      onend: () => {
        state.listening = false;
        el.mic.setAttribute("aria-pressed", "false");
        el.mic.setAttribute("aria-label", "Start voice input");
        el.input.placeholder = "Type your answer, or tap the mic";
        el.input.classList.remove("is-interim");
        settle();
      },
    });
  }

  function cancelListening() {
    if (!state.listening) return;
    Voice.cancelListening();
    state.listening = false;
    el.mic.setAttribute("aria-pressed", "false");
    el.mic.setAttribute("aria-label", "Start voice input");
    el.input.placeholder = "Type your answer, or tap the mic";
    el.input.classList.remove("is-interim");
    settle();
  }

  /* ---------- toggles ---------- */

  function setSpeakReplies(on) {
    state.speakReplies = on && Voice.canSpeak;
    el.voiceToggle.setAttribute("aria-checked", String(state.speakReplies));
    if (!state.speakReplies) Voice.cancelSpeech();
  }

  function setHandsFree(on, quiet) {
    const was = state.handsFree;
    state.handsFree = on && Voice.canListen;
    el.handsFree.setAttribute("aria-checked", String(state.handsFree));
    if (was && !state.handsFree && quiet) clearTimeout(autoListenTimer);
  }

  /* ---------- start ---------- */

  function begin(voiceMode) {
    if (state.started) return;
    state.started = true;
    el.app.dataset.screen = "order";
    el.welcome.hidden = true;
    el.transcript.hidden = false;
    el.dock.hidden = false;
    setSpeakReplies(voiceMode && Voice.canSpeak);
    setHandsFree(voiceMode);
    setMood("neutral");
  }

  function startOrder(voiceMode) {
    begin(voiceMode);
    ask("service", "Hi! I'm Pip, and I'll take your order. Answer one question at a time, or tell me everything at once.");
    if (!voiceMode) el.input.focus();
  }

  /* ---------- events ---------- */

  el.startVoice.addEventListener("click", () => startOrder(true));
  el.startType.addEventListener("click", () => startOrder(false));

  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fromVoice = Boolean(autosendTimer) || el.heard.textContent.startsWith("I'm not sure I heard");
    submit(el.input.value, fromVoice ? "voice" : "type");
  });

  el.input.addEventListener("input", () => {
    cancelAutosend("Edit the text, then press Send.");
    if (el.heard.classList.contains("is-warning") && el.input.value) {
      el.heard.classList.remove("is-warning");
      el.heard.textContent = "";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (autosendTimer) cancelAutosend("Stopped. Edit the text, then press Send.");
    else if (state.listening) cancelListening();
    else stopTalking(), settle();
  });

  el.mic.addEventListener("click", () => {
    if (state.listening) {
      Voice.finishListening();
      return;
    }
    // Choosing the mic signals a voice user: keep listening after each reply.
    if (Voice.canListen) setHandsFree(true);
    startListening();
  });

  el.back.addEventListener("click", () => submit("Go back", "tap"));
  el.repeat.addEventListener("click", () => repeatLast());
  el.help.addEventListener("click", () => submit("What can I say?", "tap"));
  el.restart.addEventListener("click", () => submit("Start over", "tap"));
  el.pause.addEventListener("click", () => {
    if (state.paused) {
      setPaused(false);
      repeatLast();
    } else {
      setPaused(true);
    }
  });

  el.voiceToggle.addEventListener("click", () => {
    setSpeakReplies(!state.speakReplies);
    if (state.speakReplies && state.lastPip && !state.listening) {
      say([state.lastPip.lead, state.lastPip.q].filter(Boolean).join(" "), el.transcript.lastElementChild);
    }
  });
  el.handsFree.addEventListener("click", () => {
    setHandsFree(!state.handsFree);
    if (state.handsFree && state.started && el.status.dataset.activity === "idle") startListening();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelListening(); }
  });

  /* ---------- capability notes ---------- */

  if (!Voice.canListen) {
    el.startVoice.disabled = true;
    el.handsFree.disabled = true;
    el.welcomeVoiceNote.hidden = false;
    el.welcomeVoiceNote.textContent = "Voice input needs Chrome or Edge. You can still type, and Pip can read replies aloud.";
    el.voiceNote.hidden = false;
    el.voiceNote.textContent = "Voice input isn't supported in this browser. Typing works everywhere.";
  }
  if (!Voice.canSpeak) {
    el.voiceToggle.disabled = true;
  }

  setActivity("idle");
  render();

  // Exposed for automated tests and the demo console.
  window.PipApp = { state, submit, currentStep, restart };
})();
