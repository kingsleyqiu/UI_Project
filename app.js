const element = (id) => document.getElementById(id);
const answer = element("answer");
const form = element("answer-form");
const prompt = element("prompt");
const choices = element("choices");
const feedback = element("feedback");
const summary = element("summary-items");
const restart = element("restart");
const mic = element("mic");
const voice = element("voice");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synthesis = window.speechSynthesis;

const sizes = ["Small", "Medium", "Large"];
const crusts = ["Thin crust", "Hand-tossed"];
const toppings = ["Pepperoni", "Mushrooms", "Bell peppers", "Cheese only"];
const quantities = ["1", "2", "3", "4"];
const quantityWords = ["one", "two", "three", "four"];
const normalize = (text) => text.trim().toLowerCase().replace(/[.!?]+$/, "");
const choose = (values, text) => values.find((value) => normalize(value) === normalize(text));

let order = {};
let editing = null;
let confirmed = false;
let message = "";
let readReplies = false;
let recording = null;
let speaking = null;

const fields = {
  fulfillment: {
    label: "Service",
    prompt: "Would you like pickup or delivery?",
    options: ["Pickup", "Delivery"],
    parse: (text) => choose(["Pickup", "Delivery"], normalize(text).replace("pick up", "pickup")),
  },
  size: {
    label: "Size",
    prompt: "Would you like a small, medium, or large pizza?",
    options: sizes,
  },
  crust: {
    label: "Crust",
    prompt: "Would you like thin or hand-tossed crust?",
    options: crusts,
    parse(text) {
      const value = normalize(text).replace(/ crust$/, "");
      if (value === "thin") return "Thin crust";
      if (["hand tossed", "hand-tossed", "regular"].includes(value)) return "Hand-tossed";
    },
  },
  toppings: {
    label: "Toppings",
    prompt: "Which toppings would you like?",
    options: toppings,
    parse(text) {
      const parts = normalize(text).split(/\s*(?:,|\band\b)\s*/);
      const selected = parts.map((part) => choose(toppings, part));
      if (selected.every(Boolean) && (selected.length === 1 || !selected.includes("Cheese only"))) {
        return [...new Set(selected)].join(", ");
      }
    },
    error: "Choose pepperoni, mushrooms, bell peppers, or cheese only. You can type several toppings with commas.",
  },
  quantity: {
    label: "Quantity",
    prompt: "How many of this pizza would you like?",
    options: quantities,
    parse: (text) => choose(quantities, text) || quantities[quantityWords.indexOf(normalize(text))],
  },
  street: {
    label: "Street",
    prompt: "What’s the delivery street address?",
    parse: (text) => /^\d+[a-z]?\s+.*\p{L}/iu.test(text) ? text.trim() : undefined,
    error: "Include the street number and street name, such as 123 Example Street.",
  },
  city: {
    label: "City",
    prompt: "What city is the delivery address in?",
    parse: (text) => /^[\p{L}][\p{L}\s.’'-]+$/u.test(text.trim()) ? text.trim() : undefined,
    error: "Enter a city name, such as Oshawa.",
  },
  payment: {
    label: "Payment",
    prompt: "Which simulated payment method would you like?",
    get options() {
      return order.fulfillment === "Pickup" ? ["Demo card", "Cash at pickup"] : ["Demo card"];
    },
    parse(text) {
      const value = normalize(text);
      if (["card", "demo card"].includes(value)) return "Demo card";
      if (order.fulfillment === "Pickup" && ["cash", "cash at pickup", "cash on pickup"].includes(value)) {
        return "Cash at pickup";
      }
    },
  },
};

function fieldOrder() {
  const items = ["fulfillment", "size", "crust", "toppings", "quantity"];
  if (order.fulfillment === "Delivery") items.push("street", "city");
  return [...items, "payment"];
}

function currentStep() {
  if (confirmed) return "complete";
  return editing || fieldOrder().find((key) => !Object.hasOwn(order, key)) || "review";
}

function orderDescription() {
  const destination = order.fulfillment === "Delivery"
    ? "for delivery to " + order.street + ", " + order.city
    : "for pickup";
  const pizza = order.quantity === "1" ? "pizza" : "pizzas";
  return order.quantity + " " + order.size.toLowerCase() + " " + order.crust.toLowerCase()
    + " " + pizza + " with " + order.toppings.toLowerCase() + " " + destination;
}

function status(text = confirmed ? "Complete" : "Waiting") {
  element("status").textContent = text;
  element("avatar").dataset.speaking = String(text === "Speaking");
}

function stopSpeaking() {
  if (!speaking) return;
  speaking = null;
  synthesis.cancel();
  status();
}

function speak(text) {
  stopSpeaking();
  if (!readReplies || recording) return;
  const utterance = new SpeechSynthesisUtterance(text);
  speaking = utterance;
  utterance.lang = "en-CA";
  utterance.onstart = () => {
    if (speaking === utterance) status("Speaking");
  };
  utterance.onend = utterance.onerror = () => {
    if (speaking !== utterance) return;
    speaking = null;
    status();
  };
  synthesis.speak(utterance);
}

function stopRecording() {
  if (!recording) return;
  const active = recording;
  recording = null;
  active.abort();
  mic.setAttribute("aria-pressed", "false");
  element("mic-label").textContent = "Mic";
  status();
}

function beginEdit(key) {
  stopRecording();
  editing = key;
  message = "";
  answer.value = "";
  render();
  prompt.focus();
  speak(prompt.textContent);
}

function renderSummary() {
  const rows = fieldOrder().map((key) => {
    const row = document.createElement("div");
    row.className = "summary-row";
    const label = document.createElement("dt");
    label.textContent = fields[key].label;
    const detail = document.createElement("dd");
    const value = document.createElement("span");
    value.className = order[key] ? "selected" : "pending";
    value.textContent = order[key] || "Pending";
    detail.append(value);
    if (order[key] && !confirmed) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "quiet-button";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", "Edit " + fields[key].label.toLowerCase());
      edit.addEventListener("click", () => beginEdit(key));
      detail.append(edit);
    }
    row.append(label, detail);
    return row;
  });
  summary.replaceChildren(...rows);
  const orderState = element("order-state");
  orderState.classList.toggle("confirmed", confirmed);
  orderState.textContent = confirmed ? "Simulated order confirmed" : "Demo only · Simulated payment";
}

function render() {
  const step = currentStep();
  let lead = "";
  let question;
  let options = [];

  if (step === "review") {
    lead = "Review " + orderDescription() + ". Payment method is " + order.payment.toLowerCase() + ".";
    question = "Would you like to confirm or edit?";
    options = ["Confirm order", "Edit order"];
  } else if (step === "complete") {
    question = "Simulated order confirmed.";
    lead = "You ordered " + orderDescription() + ".";
  } else {
    const field = fields[step];
    lead = editing ? "Updating " + field.label.toLowerCase() + "." : "";
    if (step === "fulfillment" && !editing) lead = "Hi! I can help you order a pizza.";
    question = field.prompt;
    options = field.options || [];
  }

  element("lead").textContent = lead;
  prompt.textContent = question;
  feedback.textContent = message;
  choices.replaceChildren(...options.map((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = option === "Confirm order" ? "button button-primary" : "button";
    button.textContent = option;
    button.addEventListener("click", () => submitAnswer(option, true));
    return button;
  }));
  form.hidden = confirmed;
  restart.disabled = step === "fulfillment" && !editing && !message;
  if (!recording && !speaking) status();
  renderSummary();
}

function submitAnswer(raw, fromButton = false) {
  stopRecording();
  const text = raw.trim();
  const step = currentStep();
  if (step === "complete") return;

  let focusEdit = false;
  message = "";
  if (!text) {
    message = "Type an answer or choose an option.";
  } else if (step === "review") {
    const value = normalize(text);
    if (["confirm order", "confirm", "yes"].includes(value)) {
      confirmed = true;
    } else {
      const key = fieldOrder().find((field) => {
        const label = fields[field].label.toLowerCase();
        return ["change", "edit"].some((action) =>
          [action + " " + label, action + " the " + label].includes(value));
      });
      if (key) {
        beginEdit(key);
        return;
      }
      message = "Choose Confirm order, or select Edit beside an item in the summary.";
      focusEdit = value === "edit order" || value === "edit";
    }
  } else {
    const field = fields[step];
    const value = field.parse ? field.parse(text) : choose(field.options, text);
    if (!value) {
      message = field.error || "Choose " + field.options.join(", ") + ".";
    } else {
      order[step] = value;
      if (step === "fulfillment" && value === "Pickup") {
        delete order.street;
        delete order.city;
      }
      if (step === "fulfillment" && value === "Delivery" && order.payment === "Cash at pickup") {
        delete order.payment;
      }
      editing = null;
    }
  }

  if (!message) answer.value = "";
  render();
  if (focusEdit) summary.querySelector("button")?.focus();
  else if (confirmed || fromButton) prompt.focus();
  else answer.focus();
  speak(message || [element("lead").textContent, prompt.textContent].filter(Boolean).join(" "));
}

function startRecording() {
  stopSpeaking();
  const session = new SpeechRecognition();
  session.lang = "en-CA";
  recording = session;
  message = "";
  feedback.textContent = "";
  mic.setAttribute("aria-pressed", "true");
  element("mic-label").textContent = "Stop mic";
  status("Listening");

  session.onspeechend = () => {
    if (recording === session) status("Processing");
  };
  session.onresult = (event) => {
    if (recording !== session) return;
    answer.value = event.results[0][0].transcript;
    feedback.textContent = "Check the captured text, then choose Send. You can edit it first.";
    answer.focus();
  };
  session.onerror = () => {
    if (recording === session) {
      feedback.textContent = "The mic couldn’t capture an answer. Try again or type your reply.";
    }
  };
  session.onend = () => {
    if (recording !== session) return;
    recording = null;
    mic.setAttribute("aria-pressed", "false");
    element("mic-label").textContent = "Mic";
    status();
  };

  try {
    session.start();
  } catch {
    session.onend();
    feedback.textContent = "The mic couldn’t start. Try again or type your reply.";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAnswer(answer.value);
});

restart.addEventListener("click", () => {
  stopRecording();
  stopSpeaking();
  order = {};
  editing = null;
  confirmed = false;
  message = "";
  answer.value = "";
  render();
  prompt.focus();
});

if (SpeechRecognition) {
  mic.hidden = false;
  mic.addEventListener("click", () => {
    if (recording) stopRecording();
    else startRecording();
  });
} else {
  element("voice-info").textContent = "Microphone input is unavailable in this browser. You can type your answer.";
}

if (synthesis && window.SpeechSynthesisUtterance) {
  voice.hidden = false;
  voice.addEventListener("click", () => {
    readReplies = !readReplies;
    voice.setAttribute("aria-pressed", String(readReplies));
    voice.textContent = readReplies ? "Turn off spoken replies" : "Read replies aloud";
    if (readReplies) speak([element("lead").textContent, prompt.textContent].filter(Boolean).join(" "));
    else stopSpeaking();
  });
}

render();
