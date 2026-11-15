import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_PRODUCTS, emptyOrder, classifyReply, buildProposal, otherCartItems } from '../extension/planner.js';

const intent = changes => ({ intent: 'configure', product: null, size: null, crust: null, quantity: null, toppingsMode: 'keep', addToppings: [], removeToppings: [], sauce: null, cheese: null, question: null, ...changes });
const builder = changes => ({
  stage: 'builder',
  fingerprint: 'builder-v1',
  menu: { products: [...SUPPORTED_PRODUCTS], sizes: ['Small', 'Medium', 'Large'], crusts: ['Hand Tossed', 'Thin'], toppings: ['Pepperoni', 'Ham', 'Pineapple', 'Mushroom', 'Onion'] },
  order: { ...emptyOrder(), product: 'Hawaiian', size: 'Medium', crust: 'Hand Tossed', toppings: ['Ham', 'Pineapple'] },
  cart: [{ id: 'old', product: 'Veggie', quantity: 2 }, { id: 'mine', product: 'Hawaiian', quantity: 1 }],
  ...changes,
});

test('only exact confirmation or control replies are classified', () => {
  for (const text of ['Yes', ' yes please! ', 'That’s correct.', 'confirm']) assert.equal(classifyReply(text), 'confirm');
  for (const text of ['no', 'Not correct!', 'cancel that']) assert.equal(classifyReply(text), 'reject');
  for (const text of ['pause', 'Stop listening.']) assert.equal(classifyReply(text), 'pause');
  for (const text of ['yes add ham', 'no onions', 'confirm and pay', 'yes?', 'yesterday', '', null]) assert.equal(classifyReply(text), null);
});

test('a new pizza requires a size even when website preselects one', () => {
  assert.match(buildProposal(intent({}), builder()).question, /what size/i);
  assert.equal(buildProposal(intent({ size: 'Large' }), builder()).desired.size, 'Large');
});

test('an existing session item can retain its size and other fields on a topping edit', () => {
  const snapshot = builder();
  const before = structuredClone(snapshot);
  const result = buildProposal(intent({ toppingsMode: 'adjust', addToppings: ['Mushroom'], removeToppings: ['Pineapple'] }), snapshot, { managedId: 'mine' });
  assert.equal(result.kind, 'configure');
  assert.deepEqual(result.desired, { product: 'Hawaiian', size: 'Medium', crust: 'Hand Tossed', toppings: ['Ham', 'Mushroom'], quantity: 1, sauce: true, cheese: true });
  assert.deepEqual(snapshot, before);
  assert.equal(result.fingerprint, 'builder-v1');
});

test('only pepperoni replaces extra toppings while retaining sauce and cheese', () => {
  const result = buildProposal(intent({ size: 'Large', toppingsMode: 'replace', addToppings: ['Pepperoni'] }), builder());
  assert.deepEqual(result.desired.toppings, ['Pepperoni']);
  assert.equal(result.desired.sauce, true);
  assert.equal(result.desired.cheese, true);
  assert.equal(result.desired.quantity, 1);
});

test('explicit base removal and restoration are represented without touching toppings', () => {
  const removed = buildProposal(intent({ size: 'Large', sauce: 'remove', cheese: 'remove' }), builder());
  assert.equal(removed.desired.sauce, false);
  assert.equal(removed.desired.cheese, false);
  const snapshot = builder({ order: { ...removed.desired } });
  const restored = buildProposal(intent({ sauce: 'keep', cheese: 'keep' }), snapshot, { managedId: 'mine' });
  assert.equal(restored.desired.sauce, true);
  assert.equal(restored.desired.cheese, true);
  assert.deepEqual(restored.desired.toppings, ['Ham', 'Pineapple']);
});

test('new pizza defaults quantity to one while managed edits retain quantity', () => {
  const snapshot = builder();
  snapshot.order.quantity = 3;
  assert.equal(buildProposal(intent({ size: 'Large' }), snapshot).desired.quantity, 1);
  assert.equal(buildProposal(intent({ size: 'Large' }), snapshot, { managedId: 'mine' }).desired.quantity, 3);
  assert.equal(buildProposal(intent({ size: 'Large', quantity: 4 }), snapshot).desired.quantity, 4);
});

test('unknown options, conflicting toppings and invalid quantities never produce actions', () => {
  for (const changes of [
    { size: 'Extra Large' }, { size: 'Large', crust: 'Stuffed' },
    { size: 'Large', toppingsMode: 'adjust', addToppings: ['Mango'] },
    { size: 'Large', toppingsMode: 'adjust', addToppings: ['Ham'], removeToppings: ['Ham'] },
    { size: 'Large', toppingsMode: 'keep', addToppings: ['Ham'] },
    { size: 'Large', quantity: 0 }, { size: 'Large', quantity: 1.5 }, { size: 'Large', quantity: 100 },
    { size: 'Large', sauce: 'extra' }, { product: 'MeatZZa', size: 'Large' },
  ]) assert.ok(buildProposal(intent(changes), builder()).question, JSON.stringify(changes));
});

test('menu and changed product create only a confirmable discovery action', () => {
  const snapshot = builder({ stage: 'menu', order: emptyOrder(), menu: { products: ['Hawaiian'], sizes: [], crusts: [], toppings: [] } });
  const result = buildProposal(intent({ product: 'Hawaiian', size: 'Large' }), snapshot);
  assert.deepEqual(result, { kind: 'open', product: 'Hawaiian', summary: "Open Hawaiian's configuration to read this store's available sizes, crusts, and toppings?", fingerprint: 'builder-v1' });
  assert.ok(buildProposal(intent({ product: 'Veggie' }), snapshot).question);
  assert.equal(buildProposal(intent({ product: 'Pepperoni Feast' }), builder()).kind, 'open');
});

test('missing product, unverified page, clarification and checkout cannot modify website', () => {
  assert.match(buildProposal(intent({ size: 'Large' }), builder({ stage: 'menu', order: emptyOrder() })).question, /which pizza/i);
  assert.ok(buildProposal(intent({ size: 'Large' }), builder({ fingerprint: '' })).question);
  assert.equal(buildProposal({ intent: 'clarify', question: 'Which size?' }, builder()).question, 'Which size?');
  assert.match(buildProposal(intent({ size: 'Large' }), builder({ stage: 'checkout' })).question, /complete checkout yourself/i);
});

test('cancel is limited to the exact managed cart item, even if model names another pizza', () => {
  const snapshot = builder({ stage: 'cart' });
  assert.ok(buildProposal({ intent: 'cancel' }, snapshot).question);
  assert.ok(buildProposal({ intent: 'cancel' }, snapshot, { managedId: 'missing' }).question);
  const result = buildProposal({ intent: 'cancel', product: 'Veggie' }, snapshot, { managedId: 'mine' });
  assert.equal(result.kind, 'cancel');
  assert.match(result.summary, /1 x Hawaiian/);
  assert.doesNotMatch(result.summary, /2 x Veggie/);
  snapshot.cart.push({ id: 'mine', product: 'Hawaiian', quantity: 1 });
  assert.ok(buildProposal({ intent: 'cancel' }, snapshot, { managedId: 'mine' }).question);
});

test('other cart items remain available for checkout reminders', () => {
  const cart = builder().cart;
  assert.deepEqual(otherCartItems(cart, 'mine'), [cart[0]]);
  assert.deepEqual(otherCartItems(cart, null), cart);
  assert.equal(cart.length, 2);
});

test('empty order returns independent mutable data for each session', () => {
  const first = emptyOrder();
  first.toppings.push('Ham');
  assert.deepEqual(emptyOrder().toppings, []);
});
