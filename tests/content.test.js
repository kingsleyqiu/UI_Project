import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

const builderHTML = await readFile(new URL('./fixtures/dominos-builder.html', import.meta.url), 'utf8');
const initialState = JSON.parse(await readFile(new URL('./fixtures/dominos-builder-state.json', import.meta.url), 'utf8'));
const cartHTML = await readFile(new URL('./fixtures/dominos-cart.html', import.meta.url), 'utf8');
let importNumber = 0;

function nativeSelect(select) {
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return this.querySelector('option[selected]')?.getAttribute('value') ?? this.querySelector('option')?.getAttribute('value') ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) option.toggleAttribute('selected', option.value === String(value)); },
  });
}

function hydrate(document, states) {
  const controls = [...document.querySelectorAll('input, select')];
  for (const state of states) {
    const control = controls[state.index];
    assert.equal(control.tagName, state.tag);
    if (state.tag === 'SELECT') { nativeSelect(control); control.value = state.value; }
    else control.checked = state.checked;
  }
}

const nextTurn = () => new Promise(resolve => setImmediate(resolve));
async function waitFor(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > deadline) assert.fail('The controller did not reach its expected state.');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

const quantityIntent = () => ({ intent: 'configure', product: null, size: '14" Large', crust: null, quantity: 2, toppingsMode: 'keep', addToppings: [], removeToppings: [], sauce: null, cheese: null, question: null });

async function environment(t, { session = {}, interpret = () => ({ intent: quantityIntent() }) } = {}) {
  const keys = ['document', 'window', 'chrome', 'setInterval'];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const dom = parseHTML('<!doctype html><html><body></body></html>');
  const { document } = dom;
  dom.window.HTMLElement.prototype.focus = function () {};
  const url = new URL('https://www.dominos.ca/en/pages/order/#!/product/S_PIZPX/builder/');
  const messages = [], listeners = [], polls = [];
  let persisted = structuredClone(session);
  let savedState = initialState;
  let saveClicks = 0;
  const window = {
    Event: dom.Event,
    location: {
      get href() { return url.href; },
      get hash() { return url.hash; },
      set hash(value) { url.hash = value; route(value); },
      assign(value) { url.href = value; route(url.hash); },
    },
  };
  function showCart() {
    document.body.innerHTML = cartHTML;
    const quantity = document.querySelector('select[name="4|Quantity"]');
    nativeSelect(quantity);
    quantity.value = savedState.find(state => state.tag === 'SELECT' && state.index === initialState.at(-1).index).value;
  }
  function showBuilder() {
    document.body.innerHTML = `${builderHTML}<span class="js-cartQuantityBadge" data-order-quantity="0"></span>`;
    hydrate(document, savedState);
    document.querySelector('button.single-page-pizza-builder__add-to-order').addEventListener('click', () => {
      saveClicks++;
      savedState = [...document.querySelectorAll('input, select')].map((control, index) => ({ index, tag: control.tagName, value: control.value, checked: control.checked }));
      showCart();
    });
    document.querySelector('button.js-modalClose').addEventListener('click', showCart);
  }
  function route(hash) {
    if (hash.includes('/order/variant/4/')) showBuilder();
    else if (hash === '#!/checkout/') showCart();
  }
  showBuilder();
  globalThis.document = document;
  globalThis.window = window;
  globalThis.setInterval = callback => { polls.push(callback); return polls.length; };
  globalThis.chrome = { runtime: {
    sendMessage: async message => {
      messages.push(structuredClone(message));
      if (message.type === 'session:get') return structuredClone(persisted);
      if (message.type === 'session:set') { persisted = structuredClone(message.payload); return { ok: true }; }
      if (message.type === 'voice:state') return { ok: true, listening: false, status: 'paused' };
      if (message.type === 'interpret') return interpret(message.payload);
      return { ok: true, listening: false };
    },
    onMessage: { addListener: listener => listeners.push(listener) },
  } };
  t.after(() => {
    document.querySelector('#pizza-avatar-assistant')?.remove();
    for (const key of keys) {
      const descriptor = originals.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await import(`${new URL('../extension/content.js', import.meta.url).href}?controller-test=${++importNumber}`);
  await nextTurn();
  const shadow = document.querySelector('#pizza-avatar-assistant').shadowRoot;
  return {
    document, messages,
    find: selector => shadow.querySelector(selector),
    click: selector => shadow.querySelector(selector).dispatchEvent(new dom.Event('click', { bubbles: true })),
    voice: text => listeners.forEach(listener => listener({ type: 'voice:event', event: 'text', text })),
    voiceError: text => listeners.forEach(listener => listener({ type: 'voice:event', event: 'error', text })),
    poll: () => polls.forEach(callback => callback()),
    persisted: () => persisted,
    saves: () => saveClicks,
  };
}

test('a request shows a confirmation without changing controls; Yes permits one save', async t => {
  const h = await environment(t);
  const quantity = h.document.querySelector('select[name="quantity"]');
  const originalChecks = [...h.document.querySelectorAll('input')].map(input => input.checked);
  h.voice('Make the quantity two.');
  await nextTurn();
  assert.equal(h.find('.pending').hidden, false);
  assert.match(h.find('.pending p').textContent, /2 x/);
  assert.equal(quantity.value, '1');
  assert.deepEqual([...h.document.querySelectorAll('input')].map(input => input.checked), originalChecks);
  assert.equal(h.saves(), 0);
  h.voice('Yes');
  await waitFor(() => h.persisted().managedId === '4' && h.persisted().inFlight === null);
  assert.equal(h.saves(), 1);
  assert.equal(h.persisted().lastOrder.quantity, 2);
  assert.match(h.find('.messages').textContent, /ready for review/);
});

test('a manual website change invalidates the pending candidate before Yes can apply it', async t => {
  const h = await environment(t);
  h.poll();
  h.voice('Make the quantity two.');
  await nextTurn();
  assert.equal(h.find('.pending').hidden, false);
  h.document.querySelector('input[type="checkbox"][value="M"]').checked = false;
  h.poll();
  await nextTurn();
  assert.equal(h.find('.pending').hidden, true);
  assert.match(h.find('.messages').textContent, /website selections changed/);
  h.voice('Yes');
  await nextTurn();
  assert.equal(h.saves(), 0);
  assert.equal(h.document.querySelector('select[name="quantity"]').value, '1');
  assert.equal(h.document.querySelector('input[type="checkbox"][value="M"]').checked, false);
  assert.match(h.find('.messages').textContent, /no instruction waiting/);
});

test('recovery still renders and pauses when the current website snapshot is unreadable', async t => {
  const h = await environment(t);
  h.document.querySelector('input[name="pizza_size"][value="10"]').checked = true;
  h.voiceError('Recognition stopped unexpectedly.');
  await nextTurn();
  assert.equal(h.find('.recovery').hidden, false);
  assert.match(h.find('.recovery p').textContent, /Recognition stopped unexpectedly/);
  assert.ok(h.messages.some(message => message.type === 'voice:pause'));
  h.poll();
  await nextTurn();
  assert.equal(h.find('.recovery').hidden, false);
  assert.match(h.find('.recovery p').textContent, /conflicting selected options/);
  assert.equal(h.saves(), 0);
});

test('spoken Pause is honored while a Gemini interpretation is still pending', async t => {
  let resolveInterpretation;
  const deferred = new Promise(resolve => { resolveInterpretation = resolve; });
  const h = await environment(t, { interpret: () => deferred });
  h.voice('Make the quantity two.');
  await nextTurn();
  assert.ok(h.messages.some(message => message.type === 'interpret'));
  assert.equal(h.find('input').disabled, true);
  h.voice('Pause');
  await nextTurn();
  assert.ok(h.messages.some(message => message.type === 'voice:pause'));
  assert.equal(h.find('.launcher-status').textContent, 'Mic paused');
  resolveInterpretation({ intent: quantityIntent() });
  await nextTurn();
  assert.equal(h.find('input').disabled, false);
  assert.equal(h.saves(), 0);
});

test('manual takeover of an uncertain in-flight operation persists a terminal session', async t => {
  const h = await environment(t, { session: { inFlight: { before: [], managedId: null, desired: { product: 'Pepperoni Feast' } } } });
  assert.equal(h.find('.recovery').hidden, false);
  h.click('.takeover');
  await nextTurn();
  assert.equal(h.persisted().ended, true);
  assert.ok(h.messages.some(message => message.type === 'voice:pause'));
  assert.match(h.find('.messages').textContent, /assistant session has ended/);
  h.voice('Make it a large Hawaiian.');
  h.click('.microphone');
  await nextTurn();
  assert.equal(h.messages.filter(message => message.type === 'interpret').length, 0);
  assert.equal(h.messages.filter(message => message.type === 'voice:start').length, 0);
  assert.equal(h.saves(), 0);
});
