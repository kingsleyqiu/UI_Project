// Run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
require("../js/menu.js");
require("../js/nlu.js");
const { understand, parseAddress } = globalThis.PipNLU;

const u = (text, step) => understand(text, { step });

test("single answers per step", () => {
  assert.equal(u("Pickup.", "service").slots.service, "Pickup");
  assert.equal(u("pick up please", "service").slots.service, "Pickup");
  assert.equal(u("I'd like it delivered", "service").slots.service, "Delivery");
  assert.equal(u("Medium", "size").slots.size, "Medium");
  assert.equal(u("thin crust", "crust").slots.crust, "Thin");
  assert.equal(u("hand tossed", "crust").slots.crust, "Hand-tossed");
  assert.equal(u("two", "quantity").slots.quantity, 2);
  assert.equal(u("3", "quantity").slots.quantity, 3);
  assert.equal(u("demo card", "payment").slots.payment, "Card");
  assert.equal(u("I'll pay cash", "payment").slots.payment, "Cash");
});

test("everything at once", () => {
  const r = u("Two large thin crust pizzas with pepperoni and mushrooms for delivery", "service");
  assert.deepEqual(r.slots, {
    service: "Delivery", size: "Large", crust: "Thin", toppings: ["Pepperoni", "Mushrooms"], quantity: 2,
  });
});

test("'a large pizza' does not answer how many", () => {
  assert.equal(u("a large pepperoni pizza", "service").slots.quantity, undefined);
});

test("toppings, cheese only and negation", () => {
  assert.deepEqual(u("pepperoni, bell peppers and onions", "toppings").slots.toppings, ["Pepperoni", "Bell peppers", "Onions"]);
  assert.deepEqual(u("cheese only", "toppings").slots.toppings, []);
  assert.deepEqual(u("none", "toppings").slots.toppings, []);
  assert.deepEqual(u("no", "toppings").slots.toppings, []);
  assert.equal(u("no", "toppings").intent, null);
  assert.deepEqual(u("mushrooms but no onions", "toppings").slots.toppings, ["Mushrooms"]);
  assert.deepEqual(u("extra cheese", "toppings").slots.toppings, ["Extra cheese"]);
});

test("unsupported toppings are named back", () => {
  const r = u("Anchovies", "toppings");
  assert.equal(r.slots.toppings, undefined);
  assert.deepEqual(r.problems[0], { type: "toppings", unknown: ["Anchovies"], valid: [] });
  const mixed = u("pepperoni and pineapple", "toppings");
  assert.deepEqual(mixed.problems[0].valid, ["Pepperoni"]);
  assert.deepEqual(u("jalapeno peppers", "toppings").problems[0].unknown, ["Jalapeños"]);
});

test("invalid crust, quantity and payment", () => {
  assert.equal(u("stuffed crust", "crust").problems[0].type, "crust");
  assert.equal(u("12", "quantity").problems[0].type, "quantity-high");
  assert.equal(u("zero", "quantity").problems[0].type, "quantity-low");
  assert.equal(u("apple pay", "payment").problems[0].type, "payment");
  assert.equal(u("gift card", "payment").slots.payment, undefined);
});

test("intents", () => {
  assert.equal(u("go back", "size").intent, "back");
  assert.equal(u("start over", "size").intent, "restart");
  assert.equal(u("can you repeat that", "size").intent, "repeat");
  assert.equal(u("what can I say", "size").intent, "help");
  assert.equal(u("what toppings do you have", "toppings").intent, "help");
  assert.equal(u("Confirm order", "review").intent, "confirm");
  assert.equal(u("yes", "review").intent, "confirm");
  assert.equal(u("place my order", "review").intent, "confirm");
  assert.equal(u("change something", "review").intent, "deny");
  assert.equal(u("wait", "review").intent, "pause");
  assert.equal(u("wait make it large", "review").intent, null);
});

test("edit requests", () => {
  assert.equal(u("Change the size", "review").editField, "size");
  assert.deepEqual(u("Change the size", "review").slots, {});
  const direct = u("change the size to large", "review");
  assert.equal(direct.editField, null);
  assert.equal(direct.slots.size, "Large");
  assert.equal(u("make it large", "review").slots.size, "Large");
  assert.equal(u("I want to edit the toppings", "review").editField, "toppings");
});

test("address parsing", () => {
  assert.deepEqual(parseAddress("55 Simcoe St N, Oshawa"), { city: "Oshawa", street: "55 Simcoe St N" });
  assert.deepEqual(parseAddress("123 king street west whitby"), { city: "Whitby", street: "123 King Street West" });
  assert.deepEqual(parseAddress("123 Example Street"), { street: "123 Example Street" });
  assert.deepEqual(parseAddress("Oshawa"), { city: "Oshawa" });
  assert.deepEqual(parseAddress("Simcoe Street, Oshawa"), { city: "Oshawa", missingNumber: "Simcoe Street" });
  assert.equal(parseAddress("10 Bay St, Toronto").city, "Toronto");
  assert.equal(parseAddress("deliver to 42 Main St, Ajax, ON L1S 2H5").postal, "L1S 2H5");
  assert.equal(parseAddress("deliver to 42 Main St, Ajax, ON L1S 2H5").street, "42 Main St");
});

test("address step ignores numbers as quantities and allows switching to pickup", () => {
  const r = u("12 Main St, Oshawa", "address");
  assert.equal(r.slots.quantity, undefined);
  assert.equal(r.address.street, "12 Main St");
  assert.equal(u("switch to pickup", "address").slots.service, "Pickup");
});

test("adding and removing toppings later", () => {
  const add = u("add mushrooms too", "review");
  assert.deepEqual(add.slots.toppings, ["Mushrooms"]);
  assert.equal(add.toppingsMode, "add");
  const remove = u("remove the onions", "review");
  assert.equal(remove.slots.toppings, undefined);
  assert.deepEqual(remove.toppingsRemove, ["Onions"]);
  assert.equal(u("apple pay", "payment").problems[0].value, "Apple Pay");
});
