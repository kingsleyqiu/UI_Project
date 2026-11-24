/*
 * Pip's language understanding. Turns one typed or spoken answer into
 * an intent (go back, repeat, confirm...) and any order details it mentions,
 * so a customer can answer one question at a time or say everything at once.
 */
(function (root) {
  "use strict";

  const { MENU } = root.PipMenu;

  const NUMBER_WORDS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, fifteen: 15, twenty: 20, a: 1, an: 1, single: 1, couple: 2,
    "a couple": 2, "a couple of": 2, dozen: 12, "a dozen": 12, zero: 0, none: 0,
  };
  const NUMBER_PATTERN = "(\\d{1,3}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|a couple of|a couple|a dozen|a|an|single)";

  // Outside the quantity question only explicit counts count: "a large pizza" should still ask how many.
  const COUNT_PATTERN = "(\\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a couple of|a dozen)";

  const KNOWN_TOPPINGS = [
    { id: "Pepperoni", re: /\bpep+er+oni?s?\b/ },
    { id: "Mushrooms", re: /\bmush ?rooms?\b/ },
    { id: "Bell peppers", re: /\b(?:bell |green |red |sweet )?peppers?\b/ },
    { id: "Onions", re: /\b(?:red )?onions?\b/ },
    { id: "Extra cheese", re: /\b(?:extra|double|more) cheese\b/ },
  ];

  // Common toppings this small demo menu does not carry, so Pip can name them back.
  const UNAVAILABLE_TOPPINGS = [
    ["Anchovies", /\banchov(?:y|ies|ie)s?\b/], ["Pineapple", /\bpineapples?\b/],
    ["Jalapeños", /\bjalape(?:n|ñ)os?(?: peppers?)?\b/], ["Hot peppers", /\b(?:hot|banana|chil(?:i|li)) peppers?\b/],
    ["Ham", /\bham\b/], ["Bacon", /\bbacon\b/], ["Sausage", /\bsausages?\b/], ["Chicken", /\bchicken\b/],
    ["Olives", /\b(?:black |green )?olives?\b/], ["Spinach", /\bspinach\b/], ["Tomatoes", /\btomato(?:es)?\b/],
    ["Beef", /\b(?:ground )?beef\b/], ["Salami", /\bsalami\b/], ["Feta", /\bfeta\b/], ["Garlic", /\bgarlic\b/],
    ["Basil", /\bbasil\b/], ["Broccoli", /\bbroccoli\b/], ["Shrimp", /\bshrimps?\b/], ["Steak", /\bsteak\b/],
    ["Meatballs", /\bmeat ?balls?\b/], ["Prosciutto", /\bprosciutto\b/], ["Corn", /\bcorn\b/], ["Arugula", /\barugula\b/],
  ];

  const FIELD_WORDS = [
    ["service", /\b(?:service|pick ?up|delivery|deliver|order type|how i get it)\b/],
    ["size", /\bsizes?\b/],
    ["crust", /\bcrusts?\b/],
    ["toppings", /\btoppings?\b/],
    ["quantity", /\b(?:quantity|how many|number of pizzas|amount|count)\b/],
    ["address", /\b(?:address|street|city|location)\b/],
    ["payment", /\b(?:payment|pay|paying|card|cash)\b/],
  ];

  const KNOWN_CITIES = [
    ...MENU.deliveryCities, "Toronto", "Scarborough", "Markham", "Mississauga", "Brampton", "Hamilton",
    "Ottawa", "Kingston", "Peterborough", "Vaughan", "Richmond Hill", "Uxbridge", "Port Perry",
    "Newcastle", "Brooklin", "Clarington", "Oakville", "Barrie", "Montreal", "Vancouver",
  ];

  const STREET_SUFFIX = /\b(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|crescent|cres|court|ct|lane|ln|way|place|pl|circle|cir|parkway|pkwy|trail|trl|terrace|line|square|sq|highway|hwy)\b/i;

  function normalize(text) {
    return String(text)
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/[^a-z0-9ñ',\- ]+/g, " ")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const titleCase = (s) => s.replace(/\b([a-zñ])([a-zñ']*)/g, (_, a, b) => a.toUpperCase() + b);

  function toNumber(word) {
    if (/^\d+$/.test(word)) return Number(word);
    return Object.hasOwn(NUMBER_WORDS, word) ? NUMBER_WORDS[word] : undefined;
  }

  /* ---------- intents ---------- */

  function detectIntent(n) {
    if (/\b(?:start over|start again|restart|new order|reset|begin again|cancel (?:the |my )?order|scrap (?:it|that))\b/.test(n)) return "restart";
    if (/^(?:go )?back$|\b(?:go back|previous question|undo|last question|step back)\b/.test(n)) return "back";
    if (/\b(?:repeat|say (?:that|it) again|what did you say|come again|pardon)\b/.test(n)) return "repeat";
    if (/^(?:pause|stop|stop talking|be quiet|hold on|one sec(?:ond)?|shush|wait)(?: please| a (?:sec|second|moment|minute))?$/.test(n)) return "pause";
    if (/\b(?:help|what can i (?:say|do|order|choose|pick|get)|what are (?:my|the) (?:options|choices)|what do you have|what(?:'s| is) on the menu|what \w+ do you (?:have|offer)|which \w+ do you (?:have|offer)|options|menu)\b/.test(n)) return "help";
    if (/\b(?:place (?:the |my )?order|confirm|submit (?:the |my )?order|order it|send it to the kitchen)\b/.test(n)) return "confirm";
    if (/^(?:yes|yeah|yep|yup|ya|sure|correct|ok|okay|perfect|go ahead|looks good|sounds good|that's (?:right|correct|it|all)|all good|do it)(?: please| thanks| thank you)?$/.test(n)) return "confirm";
    if (/^(?:no|nope|nah|not quite|wrong|that's wrong|change something|make a change|edit|edit order|change|i want to change something|i'd like to change something)(?: please| thanks)?$/.test(n)) return "deny";
    return null;
  }

  function detectEditField(n) {
    if (!/\b(?:change|edit|update|fix|modify|different|switch|redo)\b/.test(n)) return null;
    // "switch to pickup" is an answer, not a request to edit a field.
    if (/\bswitch (?:it )?to\b/.test(n)) return null;
    const hit = FIELD_WORDS.find(([, re]) => re.test(n));
    return hit ? hit[0] : null;
  }

  function mentionedField(n) {
    const hit = FIELD_WORDS.find(([, re]) => re.test(n));
    return hit ? hit[0] : null;
  }

  /* ---------- slots ---------- */

  function findService(n) {
    if (/\b(?:pick ?up|pick it up|take ?out|carry ?out|collect it|come get it|in store|i'll grab it)\b/.test(n)) return "Pickup";
    if (/\b(?:deliver(?:y|ed)?|bring it|to my (?:house|place|door|dorm|residence|apartment)|send it to me)\b/.test(n)) return "Delivery";
    return undefined;
  }

  function findSize(n) {
    if (/\b(?:small|personal|little|smallest)\b/.test(n)) return "Small";
    if (/\b(?:medium|med|middle|mid size)\b/.test(n)) return "Medium";
    if (/\b(?:large|big|biggest|extra large|xl)\b/.test(n)) return "Large";
    return undefined;
  }

  function findCrust(n) {
    if (/\bthin\b/.test(n)) return { value: "Thin" };
    if (/\b(?:hand ?toss(?:ed)?|regular|classic|original|normal|traditional)\b/.test(n)) return { value: "Hand-tossed" };
    const odd = n.match(/\b(thick|deep dish|stuffed|gluten free|cauliflower|pan|cracker)\b/);
    if (odd) return { unknown: odd[1] };
    return undefined;
  }

  function findToppings(n, step) {
    let text = " " + n + " ";
    // Negated toppings are pulled out first: "pepperoni, no onions" keeps only pepperoni,
    // and at review "remove the onions" takes them off the current pizza.
    const removed = [];
    text = text.replace(/\b(?:no|without|hold the|minus|not|skip the|remove(?: the)?|take off(?: the)?|drop(?: the)?|get rid of(?: the)?)\s+((?:extra |double |bell |green |red |black )?[a-zñ]+)\b/g, (match, word) => {
      if (/^(?:toppings?|thanks|thank|cheese)$/.test(word)) return match;
      const hit = KNOWN_TOPPINGS.find((t) => t.re.test(" " + word + " "));
      if (hit) removed.push(hit.id);
      return " ";
    });

    if (/\b(?:no toppings|cheese only|just cheese|only cheese|plain(?: cheese)?|cheese pizza|nothing else|no extra toppings)\b/.test(text)
      || (step === "toppings" && /^\s*(?:none|nothing|no|just plain|cheese|regular cheese|nope|no thanks?)\s*$/.test(text))) {
      return { value: [], unknown: [], removed: [] };
    }

    const unknown = [];
    for (const [name, re] of UNAVAILABLE_TOPPINGS) {
      if (re.test(text)) {
        unknown.push(name);
        text = text.replace(new RegExp(re.source, "g"), " ");
      }
    }
    const value = KNOWN_TOPPINGS.filter((t) => t.re.test(text)).map((t) => t.id);
    if (!value.length && !unknown.length && !removed.length) return undefined;
    const add = /\b(?:add|also|too|as well|plus|on top|another topping)\b/.test(text);
    return { value, unknown, removed, add };
  }

  function findQuantity(n, step) {
    if (step === "quantity") {
      const m = n.match(new RegExp("\\b" + NUMBER_PATTERN + "\\b"));
      if (m) return toNumber(m[1]);
      if (/\b(?:just me|only one|single)\b/.test(n)) return 1;
      return undefined;
    }
    if (step === "address") return undefined; // building numbers are not pizza counts
    const m = n.match(new RegExp("\\b" + COUNT_PATTERN + "\\s+(?:(?:small|medium|large|thin|hand tossed|crust|pepperoni|cheese|veggie|plain|[a-z]+)\\s+){0,3}(?:pizzas?|pies?)\\b"));
    if (m) return toNumber(m[1]);
    const sized = n.match(/\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+(?:small|medium|large|smalls|mediums|larges)\b/);
    return sized ? toNumber(sized[1]) : undefined;
  }

  function findPayment(n) {
    const odd = n.match(/\b(apple pay|google pay|paypal|bitcoin|crypto|gift card|cheque|check|interac e ?transfer|venmo)\b/);
    if (odd) {
      const pretty = { "apple pay": "Apple Pay", "google pay": "Google Pay", paypal: "PayPal", crypto: "Crypto", bitcoin: "Bitcoin", "gift card": "Gift card", cheque: "Cheque", check: "Cheque", venmo: "Venmo" };
      return { unknown: pretty[odd[1]] || "Interac e-Transfer" };
    }
    if (/\b(?:card|credit|debit|visa|master ?card|amex|tap|pay online)\b/.test(n)) return { value: "Card" };
    if (/\b(?:cash|pay (?:at|on) (?:the )?(?:door|pickup|delivery|store|counter)|in person)\b/.test(n)) return { value: "Cash" };
    return undefined;
  }

  /* ---------- address ---------- */

  function parseAddress(raw) {
    let s = " " + String(raw).replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim() + " ";
    const out = {};

    s = s.replace(/^\s*(?:please\s+)?(?:deliver(?:y)?(?: it)? to|send it to|bring it to|my address is|the address is|address is|address|it's|its|i live at|i'm at|at|to)\s+/i, " ");

    const postal = s.match(/\b([a-z]\d[a-z])\s?(\d[a-z]\d)\b/i);
    if (postal) {
      out.postal = (postal[1] + " " + postal[2]).toUpperCase();
      s = s.replace(postal[0], " ");
    }
    s = s.replace(/,?\s*\b(?:on|ont|ontario|canada)\b\.?/gi, " ");

    let found = null;
    for (const city of KNOWN_CITIES) {
      const re = new RegExp("\\b" + city.replace(/ /g, "\\s+") + "\\b", "i");
      const m = s.match(re);
      if (m && (!found || m.index > found.index)) found = { city, index: m.index, text: m[0] };
    }
    if (found) {
      out.city = found.city;
      s = s.slice(0, found.index) + " " + s.slice(found.index + found.text.length);
    } else if (s.includes(",")) {
      const tail = s.slice(s.lastIndexOf(",") + 1).trim();
      if (/^[a-z][a-z .'-]{1,30}$/i.test(tail) && !STREET_SUFFIX.test(tail)) {
        out.city = titleCase(tail.toLowerCase());
        s = s.slice(0, s.lastIndexOf(","));
      }
    } else if (!/\d/.test(s) && !STREET_SUFFIX.test(s) && /^\s*[a-z][a-z .'-]{1,30}\s*$/i.test(s) && s.trim().split(" ").length <= 3) {
      out.city = titleCase(s.trim().toLowerCase());
      s = " ";
    }

    const rest = s.replace(/[,]+/g, " ").replace(/\s+/g, " ").trim().replace(/\.$/, "");
    if (rest) {
      if (/^(?:(?:unit|apt|suite)\s*\w+\s*,?\s*)?\d+[a-z]?(?:\s*-\s*\d+)?\s+[a-z]/i.test(rest) && /[a-z]{2,}/i.test(rest)) {
        out.street = titleCase(rest.toLowerCase()).replace(/\b(N|S|E|W)\b/gi, (d) => d.toUpperCase());
      } else if (/[a-z]{2,}/i.test(rest) && (STREET_SUFFIX.test(rest) || rest.split(" ").length >= 2)) {
        out.missingNumber = titleCase(rest.toLowerCase());
      }
    }
    return out;
  }

  /* ---------- main entry ---------- */

  function understand(text, context = {}) {
    const step = context.step || null;
    const n = normalize(text);
    const result = { text, normalized: n, intent: null, editField: null, field: null, slots: {}, problems: [] };
    if (!n) return result;

    result.intent = detectIntent(n);
    result.editField = detectEditField(n);
    result.field = mentionedField(n);
    if (result.intent === "restart" || result.intent === "back" || result.intent === "repeat" || result.intent === "pause") return result;

    if (step === "address") {
      const service = findService(n);
      if (service === "Pickup") result.slots.service = "Pickup";
      else if (!result.intent && !result.editField) result.address = parseAddress(text);
      return result;
    }

    const service = findService(n);
    if (service) result.slots.service = service;

    const size = findSize(n);
    if (size) result.slots.size = size;

    const crust = findCrust(n);
    if (crust && crust.value) result.slots.crust = crust.value;
    else if (crust && crust.unknown) result.problems.push({ type: "crust", value: crust.unknown });

    const toppings = findToppings(n, step);
    if (toppings) {
      if (toppings.unknown.length) result.problems.push({ type: "toppings", unknown: toppings.unknown, valid: toppings.value });
      else if (toppings.value.length || !toppings.removed.length) {
        result.slots.toppings = toppings.value;
        if (toppings.add) result.toppingsMode = "add";
      } else {
        result.toppingsRemove = toppings.removed;
      }
    }

    const quantity = findQuantity(n, step);
    if (quantity !== undefined) {
      if (quantity < 1) result.problems.push({ type: "quantity-low", value: quantity });
      else if (quantity > MENU.maxQuantity) result.problems.push({ type: "quantity-high", value: quantity });
      else result.slots.quantity = quantity;
    }

    const payment = findPayment(n);
    if (payment && payment.value) result.slots.payment = payment.value;
    else if (payment && payment.unknown) result.problems.push({ type: "payment", value: payment.unknown });

    // "Yes" / "no" are answers only at review; elsewhere a bare "no" at toppings means none.
    if (step === "toppings" && result.intent === "deny" && result.slots.toppings) result.intent = null;
    // An edit request already says which field to change; the field word is not an answer.
    // "Change the size to large" is an answer; "change the size" asks Pip to re-ask it.
    if (result.editField) {
      if (result.slots[result.editField] !== undefined) result.editField = null;
      else result.slots = {};
    }

    return result;
  }

  root.PipNLU = { understand, parseAddress, normalize, titleCase };
})(typeof window !== "undefined" ? window : globalThis);
