import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { createSiteAdapter, readCart } from '../extension/site.js';

const builderHTML = await readFile(new URL('./fixtures/dominos-builder.html', import.meta.url), 'utf8');
const builderState = JSON.parse(await readFile(new URL('./fixtures/dominos-builder-state.json', import.meta.url), 'utf8'));
const cartHTML = await readFile(new URL('./fixtures/dominos-cart.html', import.meta.url), 'utf8');

// linkedom has no native selection default actions; supply browser property behaviour in this harness.
function nativeSelect(select) {
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return this.querySelector('option[selected]')?.getAttribute('value') ?? this.querySelector('option')?.getAttribute('value') ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) option.toggleAttribute('selected', option.getAttribute('value') === String(value)); },
  });
}

function hydrate(doc) {
  const controls = [...doc.querySelectorAll('input, select')];
  for (const state of builderState) {
    const control = controls[state.index];
    assert.equal(control.tagName, state.tag);
    if (state.tag === 'SELECT') { nativeSelect(control); control.value = state.value; }
    else control.checked = state.checked;
  }
}

function environment(html = builderHTML, hash = '#!/product/S_PIZPX/builder/') {
  const { document, Event } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const url = new URL(`https://www.dominos.ca/en/pages/order/${hash}`);
  const navigations = [];
  let route = () => {};
  const win = {
    Event,
    location: {
      get href() { return url.href; },
      get hash() { return url.hash; },
      set hash(value) { url.hash = value; navigations.push(value); route(value); },
      assign(value) { url.href = value; navigations.push(value); route(value); },
    },
  };
  return { document, win, url, navigations, route(callback) { route = callback; }, site: createSiteAdapter(document, win) };
}

function modelBrowserClicks(doc) {
  doc.addEventListener('click', event => {
    const input = event.target;
    if (input.tagName !== 'INPUT') return;
    if (input.type === 'checkbox') {
      input.checked = !input.checked;
      const group = input.closest('.pizza-topping');
      if (input.checked && group && !group.querySelector('[name^="Part|"]')) {
        const controls = doc.createElement('div');
        controls.innerHTML = `<input type="radio" name="Part|${input.value}" value="1/1"><select name="Weight|${input.value}"><option value="1">Normal</option><option selected value="1.5">Extra</option></select>`;
        group.append(controls);
        controls.querySelector('input').checked = false;
        nativeSelect(controls.querySelector('select'));
      }
    } else if (input.type === 'radio') {
      for (const radio of doc.querySelectorAll('input[type="radio"]')) if (radio.name === input.name) radio.checked = radio === input;
    }
  });
}

test('reads the captured live builder state and discovers actual labels without clicking', () => {
  const env = environment();
  hydrate(env.document);
  let clicks = 0;
  env.document.addEventListener('click', () => clicks++);
  const before = [...env.document.querySelectorAll('input')].map(input => input.checked);
  const state = env.site.snapshot();
  assert.equal(state.stage, 'builder');
  assert.equal(state.storeReady, true);
  assert.deepEqual(state.menu.sizes, ['10" Small', '12" Medium', '14" Large', '16" X-Large']);
  assert.deepEqual(state.menu.crusts, ['Hand Tossed', 'New York Style', 'Crunchy Thin Crust']);
  assert.ok(state.menu.toppings.includes('Mushroom'));
  assert.ok(state.menu.toppings.includes('Chicken*'));
  assert.ok(!state.menu.toppings.includes('Cheese'));
  assert.ok(!state.menu.toppings.includes('Pizza Sauce'));
  assert.deepEqual(state.order, { product: 'Pepperoni Feast', size: '14" Large', crust: 'Hand Tossed', toppings: ['Pepperoni', 'Mushroom'], quantity: 1, sauce: true, cheese: true });
  assert.deepEqual([...env.document.querySelectorAll('input')].map(input => input.checked), before);
  assert.equal(clicks, 0);
});

test('new and disabled store toppings are discovered from DOM rather than a fixed list', () => {
  const env = environment();
  hydrate(env.document);
  const group = env.document.createElement('div');
  group.className = 'pizza-topping';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Artichoke');
  group.innerHTML = '<label><input type="checkbox" value="NEW">Artichoke</label>';
  env.document.querySelector('.single-page-pizza-builder__wrapper').append(group);
  assert.ok(env.site.snapshot().menu.toppings.includes('Artichoke'));
  group.querySelector('input').setAttribute('disabled', '');
  assert.ok(!env.site.snapshot().menu.toppings.includes('Artichoke'));
});

test('fingerprint observes manual option/portion changes and ignores unrelated page text', () => {
  const env = environment();
  hydrate(env.document);
  const first = env.site.snapshot().fingerprint;
  const unrelated = env.document.createElement('div');
  unrelated.textContent = 'Unrelated account and address panel';
  env.document.body.append(unrelated);
  assert.equal(env.site.snapshot().fingerprint, first);
  env.document.querySelector('select[name="Weight|P"]').value = '1';
  assert.notEqual(env.site.snapshot().fingerprint, first);
});

test('reads stable cart identity, quantity and configuration while ignoring price changes', () => {
  const env = environment(cartHTML, '#!/checkout/');
  const state = env.site.snapshot();
  assert.equal(state.stage, 'cart');
  assert.equal(state.cartReadable, true);
  assert.equal(state.cartCount, 1);
  assert.equal(state.cart[0].id, '4');
  assert.equal(state.cart[0].product, 'Pepperoni Feast');
  assert.equal(state.cart[0].quantity, 1);
  assert.match(state.cart[0].signature, /Mushroom/);
  env.document.querySelector('.price').textContent = '$99.99';
  assert.equal(env.site.snapshot().fingerprint, state.fingerprint);
  env.document.querySelector('option[value="1"]').removeAttribute('selected');
  env.document.querySelector('option[value="2"]').setAttribute('selected', '');
  assert.notEqual(env.site.snapshot().cart[0].signature, state.cart[0].signature);
});

test('a nonempty badge is not treated as a readable complete cart', () => {
  const env = environment('<span class="js-cartQuantityBadge" data-order-quantity="3"></span><a class="js-customize" href="#!/product/S_PIZPX/builder/">Customize: Pepperoni Feast</a>', '#!/category/entrees/feast-pizzas/');
  const state = env.site.snapshot();
  assert.equal(state.cartCount, 3);
  assert.equal(state.cartReadable, false);
  assert.deepEqual(state.cart, []);
  assert.equal(state.stage, 'menu');
  const loading = environment('<div id="orderCheckoutPage"></div><span class="js-cartQuantityBadge" data-order-quantity="3"></span>', '#!/checkout/');
  assert.equal(loading.site.snapshot().cartReadable, false);
  const partial = environment(`${cartHTML}<span class="js-cartQuantityBadge" data-order-quantity="3"></span>`, '#!/checkout/');
  assert.equal(partial.site.snapshot().cartReadable, false);
});

test('selected store and observed Feast navigation are ready before product cards render', () => {
  const env = environment('<input id="Service_Method_Carryout" type="radio" checked><button>Carryout From</button><div class="orderDetailsInColumn" data-store-id="10062"></div><a href="#!/section/Food/category/Pizza/">FEAST PIZZAS</a>', '#!/section/Food/AllEntrees/');
  const state = env.site.snapshot();
  assert.equal(state.stage, 'menu');
  assert.equal(state.storeReady, true);
  assert.equal(state.storeKey, '10062');
  assert.deepEqual(state.menu.products, []);
});

test('unchanged default Extra portions are preserved when applying the current configuration', async () => {
  const env = environment();
  hydrate(env.document);
  const desired = env.site.snapshot().order;
  await env.site.apply(desired);
  assert.equal(env.document.querySelector('select[name="Weight|P"]').value, '1.5');
  assert.equal(env.document.querySelector('select[name="Weight|C--1"]').value, '1.5');
});

test('applies whole standard new toppings and removes only requested extras', async () => {
  const env = environment();
  hydrate(env.document);
  modelBrowserClicks(env.document);
  const desired = { ...env.site.snapshot().order, toppings: ['Pepperoni', 'Ham'], quantity: 2 };
  const result = await env.site.apply(desired);
  assert.deepEqual(result.order, desired);
  const ham = [...env.document.querySelectorAll('.pizza-topping')].find(group => group.getAttribute('aria-label') === 'Ham');
  assert.equal(ham.querySelector('input[type="radio"]').checked, true);
  assert.equal(ham.querySelector('select').value, '1');
  assert.equal(env.document.querySelector('select[name="Weight|P"]').value, '1.5');
});

test('invalid topping or actual quantity bounds fail before any control is clicked', async () => {
  const env = environment();
  hydrate(env.document);
  let clicks = 0;
  env.document.addEventListener('click', () => clicks++);
  const order = env.site.snapshot().order;
  await assert.rejects(env.site.apply({ ...order, toppings: ['Mango'] }), /topping is not available/);
  await assert.rejects(env.site.apply({ ...order, quantity: 26 }), /quantity is not available/);
  assert.equal(clicks, 0);
  assert.deepEqual(env.site.snapshot().order, order);
});

test('re-queries replacement crust controls after a size change', async () => {
  const env = environment();
  hydrate(env.document);
  modelBrowserClicks(env.document);
  env.document.addEventListener('click', event => {
    if (event.target.name !== 'pizza_size' || event.target.value !== '12') return;
    for (const label of [...env.document.querySelectorAll('.pizza-crust')]) {
      const selected = label.querySelector('input').checked;
      const replacement = env.document.createElement('div');
      replacement.innerHTML = label.outerHTML.replaceAll('14', '12');
      const next = replacement.firstElementChild;
      next.querySelector('input').checked = selected;
      label.replaceWith(next);
    }
  });
  const desired = { ...env.site.snapshot().order, size: '12" Medium', crust: 'New York Style' };
  assert.deepEqual((await env.site.apply(desired)).order, desired);
  assert.equal(env.document.querySelector('input[id="crust_type|12HANDTOSSTHIN"]').checked, true);
});

test('product and catalog navigation only uses observed links', async () => {
  const env = environment('<a href="/pages/order/#!/section/Food/category/Pizza/">FEAST PIZZAS</a>', '#!/');
  env.route(hash => {
    if (hash.includes('/category/')) env.document.body.innerHTML = '<a class="js-customize" href="#!/product/S_PIZPX/builder/">Customize: Pepperoni Feast</a>';
    else { env.document.body.innerHTML = builderHTML; hydrate(env.document); }
  });
  await env.site.openProduct('Pepperoni Feast');
  assert.deepEqual(env.navigations, ['#!/section/Food/category/Pizza/', '#!/product/S_PIZPX/builder/']);
  assert.equal(env.url.pathname, '/en/pages/order/');
  assert.equal(env.site.snapshot().order.product, 'Pepperoni Feast');
  await assert.rejects(env.site.openProduct('MeatZZa'), /outside/);
});

test('opening the catalog leaves cart review even if a customize link remains in the DOM', async () => {
  const env = environment(`${cartHTML}<a href="#!/section/Food/category/Pizza/">FEAST PIZZAS</a><a class="js-customize" href="#!/product/S_PIZPX/builder/">Customize: Pepperoni Feast</a>`, '#!/checkout/');
  env.route(() => { env.document.body.innerHTML = '<a class="js-customize" href="#!/product/S_PIZPX/builder/">Customize: Pepperoni Feast</a>'; });
  await env.site.openCatalog();
  assert.deepEqual(env.navigations, ['#!/section/Food/category/Pizza/']);
  assert.equal(env.site.snapshot().stage, 'menu');
});

test('managed edit uses only the identified row edit link', async () => {
  const env = environment(cartHTML, '#!/checkout/');
  env.route(() => { env.document.body.innerHTML = builderHTML; hydrate(env.document); });
  await env.site.openManaged('4');
  assert.deepEqual(env.navigations, ['#!/order/variant/4/']);
  assert.equal(env.site.snapshot().stage, 'builder');
});

function readbackRoute(env, alter = () => {}) {
  const actions = { save: 0, input: 0, close: 0 };
  env.route(hash => {
    if (hash.includes('/order/variant/4/')) {
      env.document.body.innerHTML = builderHTML;
      hydrate(env.document);
      alter(env.document);
      env.document.querySelector('.single-page-pizza-builder__add-to-order').addEventListener('click', () => actions.save++);
      for (const input of env.document.querySelectorAll('input, select')) input.addEventListener('change', () => actions.input++);
      env.document.querySelector('button.js-modalClose').addEventListener('click', () => {
        actions.close++;
        env.document.body.innerHTML = cartHTML;
      });
    } else env.document.body.innerHTML = cartHTML;
  });
  return actions;
}

test('saved-item readback verifies fresh builder state then closes without saving or changing fields', async () => {
  const original = environment();
  hydrate(original.document);
  const desired = original.site.snapshot().order;
  const env = environment(cartHTML, '#!/checkout/');
  const actions = readbackRoute(env);
  const result = await env.site.verifyManaged(desired, '4');
  assert.equal(result.stage, 'cart');
  assert.equal(result.cart[0].id, '4');
  assert.deepEqual(actions, { save: 0, input: 0, close: 1 });
  assert.deepEqual(env.navigations, ['#!/order/variant/4/', '#!/checkout/']);
});

test('saved-item mismatch is reported after closing the read-only builder', async () => {
  const original = environment();
  hydrate(original.document);
  const desired = original.site.snapshot().order;
  const env = environment(cartHTML, '#!/checkout/');
  const actions = readbackRoute(env, doc => { doc.querySelector('input[type="checkbox"][value="M"]').checked = false; });
  await assert.rejects(env.site.verifyManaged(desired, '4'), /saved pizza's toppings did not match/);
  assert.equal(env.site.snapshot().stage, 'cart');
  assert.deepEqual(actions, { save: 0, input: 0, close: 1 });
  assert.equal(readCart(env.document)[0].id, '4');
});

test('saving declines the observed upsell instead of adding any extra product', async () => {
  const env = environment();
  hydrate(env.document);
  let accepted = false;
  env.document.querySelector('.single-page-pizza-builder__add-to-order').addEventListener('click', () => {
    env.document.body.innerHTML = `${cartHTML}<div id="stepUpsell"><button>Yes</button><button>No Thanks</button></div>`;
    const buttons = [...env.document.querySelectorAll('#stepUpsell button')];
    buttons[0].addEventListener('click', () => { accepted = true; });
    buttons[1].addEventListener('click', () => env.document.querySelector('#stepUpsell').remove());
  });
  await env.site.save();
  assert.equal(accepted, false);
  assert.equal(env.document.querySelector('#stepUpsell'), null);
  assert.equal(readCart(env.document)[0].id, '4');
});

test('opening review closes only the recognized optional-products dialog', async () => {
  const env = environment('<span class="js-cartQuantityBadge" data-order-quantity="1"></span>', '#!/');
  let added = false;
  env.route(() => {
    env.document.body.innerHTML = `${cartHTML}<div role="dialog"><h1 id="js-modalHeader">You Might Also Enjoy</h1><button class="js-modalClose">Close</button><button>Add to Order</button></div>`;
    env.document.querySelector('button.js-modalClose').addEventListener('click', event => event.target.closest('[role="dialog"]').remove());
    env.document.querySelector('button:not(.js-modalClose)').addEventListener('click', () => { added = true; });
  });
  const result = await env.site.openCart();
  assert.equal(result.stage, 'cart');
  assert.equal(result.cartReadable, true);
  assert.equal(added, false);
  assert.equal(env.document.querySelector('[role="dialog"]'), null);
});

test('removing the managed item preserves a different existing cart row', async () => {
  const env = environment(cartHTML, '#!/checkout/');
  const oldRow = env.document.querySelector('tr').cloneNode(true);
  oldRow.innerHTML = oldRow.innerHTML.replaceAll('variant/4', 'variant/9').replaceAll('variant_4', 'variant_9').replaceAll('4|Quantity', '9|Quantity');
  env.document.querySelector('table').append(oldRow);
  const beforeOther = readCart(env.document).find(item => item.id === '9');
  env.document.querySelector('a.js-removeVariant').addEventListener('click', event => event.target.closest('tr').remove());
  const result = await env.site.removeManaged('4');
  assert.deepEqual(result.cart, [beforeOther]);
});

test('removal waits for remaining rows to re-render before checking their signatures', async () => {
  const env = environment(cartHTML, '#!/checkout/');
  const oldRow = env.document.querySelector('tr').cloneNode(true);
  oldRow.innerHTML = oldRow.innerHTML.replaceAll('variant/4', 'variant/9').replaceAll('variant_4', 'variant_9').replaceAll('4|Quantity', '9|Quantity');
  env.document.querySelector('table').append(oldRow);
  env.document.querySelector('a.js-removeVariant').addEventListener('click', () => {
    env.document.querySelector('table').innerHTML = '';
    setTimeout(() => env.document.querySelector('table').append(oldRow), 100);
  });
  const result = await env.site.removeManaged('4');
  assert.equal(result.cart.length, 1);
  assert.equal(result.cart[0].id, '9');
});

test('ambiguous cart identity fails without clicking either removal control', async () => {
  const env = environment(cartHTML, '#!/checkout/');
  env.document.querySelector('table').append(env.document.querySelector('tr').cloneNode(true));
  let clicks = 0;
  env.document.addEventListener('click', () => clicks++);
  await assert.rejects(env.site.removeManaged('4'), /uniquely identify/);
  assert.equal(clicks, 0);
});

test('checkout review remains operable but payment page never runs site actions', async () => {
  const env = environment(cartHTML, '#!/checkout/');
  assert.equal(env.site.snapshot().stage, 'cart');
  env.url.pathname = '/en/pages/order/payment';
  assert.equal(env.site.snapshot().stage, 'checkout');
  for (const call of [() => env.site.openCart(), () => env.site.openProduct('Pepperoni Feast'), () => env.site.removeManaged('4'), () => env.site.save()]) await assert.rejects(call(), /Checkout is yours/);
  assert.deepEqual(env.navigations, []);
});

test('manual interruption aborts a pending DOM wait until explicit resume', async () => {
  const env = environment('<a class="js-customize" href="#!/product/S_PIZPX/builder/">Customize: Pepperoni Feast</a>', '#!/section/Food/category/Pizza/');
  const pending = env.site.openProduct('Pepperoni Feast');
  setTimeout(() => env.site.interrupt(), 10);
  await assert.rejects(pending, /operation was paused/);
  assert.equal(env.site.snapshot().stage, 'menu');
  await assert.rejects(env.site.openProduct('Pepperoni Feast'), /operation was paused/);
  assert.equal(env.navigations.length, 1);
  env.site.resume();
  env.route(() => { env.document.body.innerHTML = builderHTML; hydrate(env.document); });
  assert.equal((await env.site.openProduct('Pepperoni Feast')).stage, 'builder');
});
