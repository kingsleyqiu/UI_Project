import { emptyOrder, SUPPORTED_PRODUCTS } from './planner.js';

const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const checked = node => Boolean(node && (node.checked ?? node.hasAttribute('checked')));
const enabled = node => Boolean(node && !node.disabled && !node.hasAttribute('disabled') && node.getAttribute('aria-disabled') !== 'true');
const selectValue = node => node?.value ?? node?.querySelector('option[selected]')?.value ?? node?.querySelector('option')?.value ?? '';
const productCodes = { S_PIZPX: 'Pepperoni Feast', S_PIZHX: 'Hawaiian', S_PIZVX: 'Veggie' };

function canonicalProduct(name) {
  return SUPPORTED_PRODUCTS.find(product => product.toLowerCase() === name.toLowerCase()) || null;
}

function cartRows(doc) {
  return [...doc.querySelectorAll('tr.js-orderSummaryItem')];
}

export function readCart(doc) {
  return cartRows(doc).map(row => {
    const title = row.querySelector('a[id^="variant_"]');
    const id = title?.id.slice('variant_'.length);
    const quantityControl = row.querySelector('select[name$="|Quantity"]');
    const quantity = Number(selectValue(quantityControl));
    if (!id || !quantityControl || !Number.isInteger(quantity) || quantity < 1) throw new Error('A cart item could not be read reliably. Please check the cart manually.');
    const code = row.querySelector('img')?.getAttribute('src')?.match(/\/(S_[A-Z0-9]+)\.[a-z]+(?:\?|$)/i)?.[1];
    const titleText = text(title);
    const toppings = text(row.querySelector('.order-summary__item__topping-list')).replace(/(?:show|hide) other toppings:/ig, '').replace(/\s+/g, ' ').trim();
    return {
      id,
      product: productCodes[code] || titleText,
      quantity,
      signature: JSON.stringify({ title: titleText, toppings, instructions: text(row.querySelector('.order-summary__item__cooking-instructions')), quantity }),
    };
  });
}

export function createSiteAdapter(doc = document, win = window) {
  let interrupted = false;
  const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const location = () => new URL(win.location.href);
  const atPayment = () => /\/payment(?:\/|$)/i.test(location().pathname) || /^#!\/payment(?:\/|$)/i.test(location().hash);
  const guard = () => {
    if (atPayment()) throw new Error('Checkout is yours to complete. Website automation has stopped.');
    if (interrupted) throw new Error('The operation was paused. Some changes may have completed; check the website before retrying.');
  };
  const unique = (nodes, description) => {
    if (nodes.length !== 1) throw new Error(`Cannot uniquely identify ${description}. Please use the website manually.`);
    return nodes[0];
  };
  const waitFor = async (read, description, timeout = 7000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      guard();
      const value = read();
      if (value) return value;
      await delay(80);
    }
    throw new Error(`${description} could not be verified. Some changes may have completed; please check the website.`);
  };
  const builder = () => {
    const dialogs = [...doc.querySelectorAll('[role="dialog"]')].filter(dialog => dialog.querySelector('.single-page-pizza-builder__wrapper') && !dialog.hidden && dialog.getAttribute('aria-hidden') !== 'true');
    return dialogs.length ? unique(dialogs, 'the pizza builder') : null;
  };
  const builderProduct = root => canonicalProduct(text(root?.querySelector('#js-modalHeader')).replace(/^Domino['\u2019]s\s+/i, '').replace(/\s*-\s*Pizza Builder$/i, ''));
  const productLinks = () => {
    const links = new Map();
    for (const link of doc.querySelectorAll('a.js-customize[href]')) {
      const name = canonicalProduct(text(link).replace(/^customize:\s*/i, ''));
      if (!name) continue;
      const href = link.getAttribute('href');
      if (links.has(name) && links.get(name) !== href) throw new Error(`Multiple different configuration links were found for ${name}.`);
      links.set(name, href);
    }
    return links;
  };
  const discoverProducts = () => [...productLinks().keys()];
  const catalogLinks = () => [...doc.querySelectorAll('a[href]')].filter(link => /^feast pizzas$/i.test(text(link)) && /#!\/(?:section\/Food\/category\/Pizza\/|category\/)/i.test(link.getAttribute('href')));
  const sizeControls = root => [...root.querySelectorAll('input[name="pizza_size"]')].map(input => ({
    input,
    name: `${text(input.closest('label')?.querySelector('.pizza-size__size'))} ${text(input.closest('label')?.querySelector('.pizza-size__name'))}`.trim(),
  })).filter(option => enabled(option.input) && option.name);
  const crustControls = root => [...root.querySelectorAll('input[id^="crust_type|"]')].map(input => ({ input, name: text(input.closest('label')?.querySelector('.pizza-crust__name')) })).filter(option => enabled(option.input) && option.name);
  const toppingGroups = root => [...root.querySelectorAll('.pizza-topping[role="group"][aria-label]')].map(group => ({
    group,
    input: group.querySelector('input[type="checkbox"]'),
    name: group.getAttribute('aria-label').trim(),
  })).filter(option => option.input);
  const extraToppings = root => toppingGroups(root).filter(option => option.input.value !== 'C' && !option.group.querySelector('input[name="sauce"]'));
  const base = (root, kind) => unique(toppingGroups(root).filter(option => kind === 'cheese' ? option.input.value === 'C' : Boolean(option.group.querySelector('input[name="sauce"]'))), kind);
  const selected = options => {
    const values = options.filter(option => checked(option.input));
    if (values.length > 1) throw new Error('The website has conflicting selected options. Please check its configuration.');
    return values[0]?.name || null;
  };
  const readBuilder = root => ({
    product: builderProduct(root),
    size: selected(sizeControls(root)),
    crust: selected(crustControls(root)),
    toppings: extraToppings(root).filter(option => checked(option.input)).map(option => option.name),
    quantity: Number(selectValue(root.querySelector('select[name="quantity"]'))),
    sauce: checked(base(root, 'sauce').input),
    cheese: checked(base(root, 'cheese').input),
  });
  const cartBadge = () => {
    const badge = doc.querySelector('.js-cartQuantityBadge[data-order-quantity]');
    const raw = badge?.getAttribute('data-order-quantity') ?? text(doc.querySelector('.js-cartQuantityText')).match(/^\d+/)?.[0];
    return raw != null && /^\d+$/.test(raw) ? Number(raw) : null;
  };
  const cartRoot = () => doc.querySelector('#orderCheckoutPage, .orderCheckoutPage, [data-quid="order-summary"]');
  const selectedStore = () => {
    const service = checked(doc.getElementById('Service_Method_Carryout')) || checked(doc.getElementById('Service_Method_Delivery'));
    const details = doc.querySelector('.orderDetailsInColumn');
    const storeControl = [...doc.querySelectorAll('button, a')].some(control => /^(?:carryout|delivery)from/i.test((control.getAttribute('aria-label') || text(control)).replace(/\s+/g, '')));
    const rawKey = details?.getAttribute('data-store-id') || details?.getAttribute('data-storeid') || text(details).match(/store\s*(?:number|no\.?|#|id)\s*[:#]?\s*(\d{3,8})/i)?.[1];
    return { ready: service && Boolean(details || storeControl), key: rawKey && /^\d+$/.test(rawKey) ? rawKey : null };
  };
  function snapshot() {
    if (atPayment()) {
      const state = { stage: 'checkout', menu: { products: [], sizes: [], crusts: [], toppings: [] }, order: emptyOrder(), cart: [], cartCount: null, cartReadable: false, storeKey: null, storeReady: false };
      return { ...state, fingerprint: JSON.stringify(state) };
    }
    const root = builder();
    const links = productLinks();
    const cart = readCart(doc);
    const badgeCount = cartBadge();
    const rowCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartReadable = cart.length > 0 ? badgeCount == null || badgeCount === rowCount : badgeCount === 0;
    const cartCount = cartReadable ? rowCount : badgeCount;
    const store = selectedStore();
    const readyMenu = links.size || (store.ready && catalogLinks().length);
    const stage = root ? 'builder' : /^#!\/checkout\/?$/.test(location().hash) || cartRoot() ? 'cart' : readyMenu ? 'menu' : 'unsupported';
    const order = root ? readBuilder(root) : emptyOrder();
    const products = [...links.keys()];
    if (order.product && !products.includes(order.product)) products.push(order.product);
    const menu = {
      products,
      sizes: root ? sizeControls(root).map(option => option.name) : [],
      crusts: root ? crustControls(root).map(option => option.name) : [],
      toppings: root ? extraToppings(root).filter(option => enabled(option.input)).map(option => option.name) : [],
    };
    const controls = root ? [...root.querySelectorAll('input, select')].map(control => ({
      name: control.name || control.id || control.getAttribute('data-quid'),
      value: control.tagName === 'SELECT' ? selectValue(control) : control.value,
      checked: control.tagName === 'INPUT' ? checked(control) : undefined,
    })) : [];
    const state = { stage, menu, order, cart, cartCount, cartReadable, storeKey: store.key, storeReady: Boolean(root || readyMenu || cart.length || store.ready) };
    return { ...state, fingerprint: JSON.stringify({ ...state, controls }) };
  }

  function navigate(href) {
    guard();
    const current = location();
    const target = new URL(href, current);
    const orderPath = path => /^\/(?:en\/)?pages\/order(?:\/|$)/i.test(path);
    if (target.origin !== current.origin || !orderPath(target.pathname) || /\/payment(?:\/|$)/i.test(target.pathname) || !/^#!\/(?:section\/Food\/category\/Pizza\/|category\/|product\/|order\/variant\/|checkout\/?$)/i.test(target.hash)) throw new Error('That link is outside the supported menu and cart flow.');
    if (orderPath(current.pathname)) win.location.hash = target.hash;
    else win.location.assign(target.href);
  }

  function upsellDialog() {
    const step = doc.querySelector('#stepUpsell');
    if (step) return step.closest('[role="dialog"]') || step;
    return [...doc.querySelectorAll('[role="dialog"]')].find(dialog => /^you might also enjoy[.!]?$/i.test(text(dialog.querySelector('#js-modalHeader, h1, h2')))) || null;
  }

  async function dismissUpsell() {
    const dialog = upsellDialog();
    if (!dialog) return;
    const controls = [...dialog.querySelectorAll('button, a')];
    const noThanks = controls.filter(control => /^no thanks$/i.test(text(control)));
    const goToCart = controls.filter(control => text(control).replace(/[\s,!.]/g, '').toLowerCase() === 'nogotocheckout');
    const close = [...dialog.querySelectorAll('button.js-modalClose')];
    const decline = unique(noThanks.length ? noThanks : goToCart.length ? goToCart : close, 'the recognized upsell dismissal control');
    decline.click();
    await waitFor(() => !upsellDialog(), 'Closing the optional-products dialog');
  }

  async function openCatalog() {
    guard();
    if (productLinks().size && snapshot().stage === 'menu') return snapshot();
    const links = catalogLinks();
    const hrefs = [...new Set(links.map(link => link.getAttribute('href')))];
    navigate(unique(hrefs, 'the Feast Pizzas menu link'));
    await waitFor(() => !builder() && productLinks().size, 'The store pizza menu');
    return snapshot();
  }

  async function openProduct(product) {
    guard();
    if (!SUPPORTED_PRODUCTS.includes(product)) throw new Error('That pizza is outside this assistant\'s supported menu.');
    if (builder() && builderProduct(builder()) === product) return snapshot();
    if (!productLinks().has(product)) await openCatalog();
    const href = productLinks().get(product);
    if (!href) throw new Error(`${product} is not currently available from this store's menu.`);
    navigate(href);
    await waitFor(() => {
      const root = builder();
      return root && builderProduct(root) === product && selected(sizeControls(root)) && selected(crustControls(root));
    }, `${product}'s configuration`);
    return snapshot();
  }

  const managedRow = id => unique(cartRows(doc).filter(row => row.querySelector('a[id^="variant_"]')?.id === `variant_${id}`), 'this session\'s cart item');
  async function openManaged(id) {
    guard();
    const row = managedRow(id);
    const item = readCart(doc).find(item => item.id === String(id));
    if (!SUPPORTED_PRODUCTS.includes(item?.product)) throw new Error('The managed item is no longer a supported pizza. Please review it manually.');
    const link = unique([...row.querySelectorAll('a.qty-container__edit[href]')], 'the managed item\'s edit link');
    if (!link.getAttribute('href').endsWith(`/order/variant/${id}/`)) throw new Error('The cart edit link no longer matches this session\'s item.');
    navigate(link.getAttribute('href'));
    await waitFor(() => builder() && builderProduct(builder()) === item.product, 'The managed pizza editor');
    return snapshot();
  }

  const currentBuilder = () => { guard(); return unique([builder()].filter(Boolean), 'the active pizza builder'); };
  const option = (get, name, description) => unique(get(currentBuilder()).filter(value => value.name === name && enabled(value.input)), description);
  async function choose(get, name, description) {
    const current = option(get, name, description);
    if (!checked(current.input)) {
      current.input.click();
      await delay(100);
      await waitFor(() => checked(option(get, name, description).input), description);
    }
  }
  async function toggle(get, state, description) {
    const control = get();
    if (!enabled(control)) throw new Error(`${description} is not available.`);
    if (checked(control) !== state) {
      control.click();
      await delay(100);
      await waitFor(() => checked(get()) === state, description);
    }
  }
  function setSelect(control, value, description) {
    if (!enabled(control) || ![...control.options].some(option => enabled(option) && option.value === value)) throw new Error(`${description} is not available.`);
    if (selectValue(control) !== value) {
      control.value = value;
      control.dispatchEvent(new win.Event('input', { bubbles: true }));
      control.dispatchEvent(new win.Event('change', { bubbles: true }));
    }
  }

  async function apply(desired) {
    const before = snapshot();
    if (before.stage !== 'builder' || !desired || desired.product !== before.order.product) throw new Error('Open the matching pizza builder before applying changes.');
    if (!before.menu.sizes.includes(desired.size) || (desired.crust != null && !before.menu.crusts.includes(desired.crust))) throw new Error('A requested size or crust is not available in the current builder.');
    if (!Array.isArray(desired.toppings) || new Set(desired.toppings).size !== desired.toppings.length || desired.toppings.some(name => !before.menu.toppings.includes(name))) throw new Error('A requested topping is not available in the current builder.');
    if (typeof desired.sauce !== 'boolean' || typeof desired.cheese !== 'boolean' || !Number.isInteger(desired.quantity)) throw new Error('The requested pizza configuration is incomplete.');
    const quantity = currentBuilder().querySelector('select[name="quantity"]');
    if (!quantity || ![...quantity.options].some(option => enabled(option) && option.value === String(desired.quantity))) throw new Error('That quantity is not available from the website.');
    const defaultWeights = new Map(extraToppings(currentBuilder()).filter(value => checked(value.input) && desired.toppings.includes(value.name)).map(value => [value.name, selectValue(value.group.querySelector('select[name^="Weight|"]'))]));
    for (const value of extraToppings(currentBuilder()).filter(value => checked(value.input) && desired.toppings.includes(value.name))) {
      const part = [...value.group.querySelectorAll('input[type="radio"][name^="Part|"]')].find(checked);
      if (part && part.value !== '1/1') throw new Error('Half-pizza topping settings need manual review before this assistant can change the pizza.');
    }
    const sizeControl = option(sizeControls, desired.size, 'the requested size').input;
    const sizeValue = sizeControl.value;
    await choose(sizeControls, desired.size, 'the requested size');
    await waitFor(() => crustControls(currentBuilder()).every(value => value.input.id.startsWith(`crust_type|${sizeValue}`)), 'The updated size and crust choices');
    if (desired.crust != null) await choose(crustControls, desired.crust, 'the requested crust');
    // Size/crust changes can replace all controls, so every subsequent action re-reads them.
    for (const name of desired.toppings) option(extraToppings, name, `the ${name} topping`);
    for (const value of extraToppings(currentBuilder()).filter(value => checked(value.input) && !desired.toppings.includes(value.name))) {
      await toggle(() => option(extraToppings, value.name, `the ${value.name} topping`).input, false, value.name);
    }
    for (const name of desired.toppings) {
      if (!checked(option(extraToppings, name, `the ${name} topping`).input)) {
        await toggle(() => option(extraToppings, name, `the ${name} topping`).input, true, name);
        await waitFor(() => option(extraToppings, name, name).group.querySelector('input[type="radio"][value="1/1"]'), `${name}'s portion choices`);
        await choose(root => [...option(extraToppings, name, name).group.querySelectorAll('input[type="radio"][name^="Part|"]')].map(input => ({ input, name: input.value })), '1/1', `${name} on the whole pizza`);
        setSelect(option(extraToppings, name, name).group.querySelector('select[name^="Weight|"]'), '1', `${name}'s standard portion`);
      }
    }
    await toggle(() => base(currentBuilder(), 'sauce').input, desired.sauce, 'Sauce');
    await toggle(() => base(currentBuilder(), 'cheese').input, desired.cheese, 'Cheese');
    setSelect(currentBuilder().querySelector('select[name="quantity"]'), String(desired.quantity), 'The requested quantity');
    await waitFor(() => {
      const order = readBuilder(currentBuilder());
      return order.size === desired.size && (desired.crust == null || order.crust === desired.crust) && order.quantity === desired.quantity && order.sauce === desired.sauce && order.cheese === desired.cheese && [...order.toppings].sort().join('|') === [...desired.toppings].sort().join('|');
    }, 'The requested pizza configuration');
    for (const [name, weight] of defaultWeights) {
      if (weight && selectValue(option(extraToppings, name, name).group.querySelector('select[name^="Weight|"]')) !== weight) throw new Error(`The website changed ${name}'s existing portion. Please review it before saving.`);
    }
    return snapshot();
  }

  async function save() {
    const button = unique([...currentBuilder().querySelectorAll('button.single-page-pizza-builder__add-to-order')], 'the pizza save button');
    if (!enabled(button) || !/^(?:add to order|save changes|update)/i.test(text(button))) throw new Error('The pizza save control is not available.');
    button.click();
    await waitFor(() => !builder() || upsellDialog(), 'Saving the pizza');
    await delay(100);
    await dismissUpsell();
    await waitFor(() => !builder() && !upsellDialog(), 'Closing the pizza editor');
    return snapshot();
  }

  async function openCart() {
    guard();
    if (/^#!\/checkout\/?$/.test(location().hash) && snapshot().cartReadable && !upsellDialog() && (cartRoot() || cartRows(doc).length)) return snapshot();
    navigate('#!/checkout/');
    await waitFor(() => upsellDialog() || (snapshot().stage === 'cart' && snapshot().cartReadable && (cartRoot() || cartRows(doc).length)), 'The cart review page');
    await dismissUpsell();
    await waitFor(() => snapshot().stage === 'cart' && snapshot().cartReadable && (cartRoot() || cartRows(doc).length), 'The complete cart review page');
    return snapshot();
  }

  async function removeManaged(id) {
    guard();
    if (snapshot().stage !== 'cart') throw new Error('Open the cart review page before removing the managed pizza.');
    const before = readCart(doc).filter(item => item.id !== String(id));
    const row = managedRow(id);
    const link = unique([...row.querySelectorAll('a.js-removeVariant[href]')], 'the managed item\'s remove link');
    if (!link.getAttribute('href').match(new RegExp(`(?:#!|!)\\/order\\/variant\\/${String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/delete\\/?$`))) throw new Error('The removal link no longer matches this session\'s item.');
    link.click();
    await waitFor(() => !cartRows(doc).some(row => row.querySelector('a[id^="variant_"]')?.id === `variant_${id}`), 'Removing the managed pizza');
    await waitFor(() => before.every(item => cartRows(doc).some(row => row.querySelector('a[id^="variant_"]')?.id === `variant_${item.id}`)), 'The remaining cart items');
    const after = readCart(doc);
    if (before.some(item => after.filter(other => other.id === item.id && other.signature === item.signature).length !== 1)) throw new Error('Another cart item changed. Please review your cart manually.');
    return snapshot();
  }

  async function verifyManaged(desired, id) {
    await openManaged(id);
    const opened = currentBuilder();
    let mismatch;
    try {
      const actual = readBuilder(opened);
      const fields = ['product', 'size', 'quantity', 'sauce', 'cheese'];
      if (desired.crust != null) fields.push('crust');
      const different = fields.filter(field => actual[field] !== desired[field]);
      if (JSON.stringify([...actual.toppings].sort()) !== JSON.stringify([...desired.toppings].sort())) different.push('toppings');
      if (different.length) throw new Error(`The saved pizza's ${different.join(', ')} did not match the confirmed configuration. Please review it manually.`);
    } catch (error) {
      mismatch = error;
    }
    guard();
    if (builder() !== opened) throw new Error('The pizza editor changed during verification. Please review the cart manually.');
    const close = unique([...opened.querySelectorAll('button.js-modalClose')], 'the opened pizza editor\'s Close button');
    close.click();
    await waitFor(() => !builder(), 'Closing the read-only pizza inspection');
    await openCart();
    if (mismatch) throw mismatch;
    return snapshot();
  }

  return { snapshot, openProduct, openManaged, apply, save, removeManaged, verifyManaged, openCart, openCatalog, discoverProducts, interrupt() { interrupted = true; }, resume() { interrupted = false; } };
}
