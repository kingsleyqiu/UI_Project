export const SUPPORTED_PRODUCTS = Object.freeze(['Pepperoni Feast', 'Hawaiian', 'Veggie']);

export function emptyOrder() {
  return { product: null, size: null, crust: null, toppings: [], quantity: 1, sauce: true, cheese: true };
}

export function classifyReply(text) {
  if (typeof text !== 'string') return null;
  const reply = text.trim().toLowerCase().replace(/\u2019/g, "'").replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  if (['yes', 'yes please', 'confirm', 'confirmed', "that's correct", 'that is correct', 'correct', 'go ahead', 'do it'].includes(reply)) return 'confirm';
  if (['no', 'no thanks', 'not correct', "that's wrong", 'that is wrong', 'cancel that'].includes(reply)) return 'reject';
  if (['pause', 'pause listening', 'stop listening', 'stop'].includes(reply)) return 'pause';
  return null;
}

export function otherCartItems(cart, managedId) {
  return (Array.isArray(cart) ? cart : []).filter(item => !managedId || item.id !== managedId);
}

export function buildProposal(intent, snapshot, session = {}) {
  const question = text => ({ question: text });
  if (!snapshot || snapshot.stage === 'unsupported') return question('Open your selected store menu or pizza configuration first.');
  if (snapshot.stage === 'checkout') return question('Please complete checkout yourself. I have stopped making changes.');
  if (!intent || !['configure', 'cancel', 'clarify'].includes(intent.intent)) return question('Please describe the pizza or change you want.');
  if (intent.intent === 'clarify') return question(intent.question || 'Please clarify the change you want.');
  if (typeof snapshot.fingerprint !== 'string' || !snapshot.fingerprint) return question('I could not verify the current page. Please refresh its details before continuing.');

  const cart = Array.isArray(snapshot.cart) ? snapshot.cart : [];
  const managedRows = session.managedId ? cart.filter(item => item.id === session.managedId) : [];
  if (intent.intent === 'cancel') {
    if (managedRows.length !== 1) return question('I cannot reliably identify the pizza added in this session. Please manage your cart manually.');
    const item = managedRows[0];
    return {
      kind: 'cancel',
      summary: `Remove only this session's ${item.quantity} x ${item.product} from the cart and end assistance? Other cart items will stay.`,
      fingerprint: snapshot.fingerprint,
    };
  }

  const order = { ...emptyOrder(), ...snapshot.order };
  const menu = { products: [], sizes: [], crusts: [], toppings: [], ...snapshot.menu };
  const product = intent.product ?? order.product ?? managedRows[0]?.product;
  if (!product) return question(`Which pizza would you like: ${SUPPORTED_PRODUCTS.join(', ')}?`);
  if (!SUPPORTED_PRODUCTS.includes(product)) return question(`I support ${SUPPORTED_PRODUCTS.join(', ')}. Please choose one of these.`);
  const currentBuilder = snapshot.stage === 'builder' && order.product === product;
  if (!currentBuilder && !menu.products.includes(product)) return question(`${product} is not available in the menu I can currently read. Please choose an available supported pizza.`);
  if (intent.quantity != null && (!Number.isInteger(intent.quantity) || intent.quantity < 1 || intent.quantity > 99)) return question('Please choose a whole-number quantity from 1 to 99.');
  if (intent.sauce != null && !['keep', 'remove'].includes(intent.sauce)) return question('Please say whether to keep or remove the sauce.');
  if (intent.cheese != null && !['keep', 'remove'].includes(intent.cheese)) return question('Please say whether to keep or remove the cheese.');

  if (!currentBuilder) {
    return {
      kind: 'open',
      product,
      summary: `Open ${product}'s configuration to read this store's available sizes, crusts, and toppings?`,
      fingerprint: snapshot.fingerprint,
    };
  }

  // A builder's preselected size is not the user's required size confirmation.
  const size = intent.size ?? (session.managedId ? order.size : null);
  if (!size) return question('What size pizza would you like?');
  if (!menu.sizes.includes(size)) return question(`That size is not available. Please choose: ${menu.sizes.join(', ') || 'a size shown on the website'}.`);
  const crust = intent.crust ?? order.crust;
  if (crust != null && !menu.crusts.includes(crust)) return question(`That crust is not available. Please choose: ${menu.crusts.join(', ') || 'a crust shown on the website'}.`);

  const mode = intent.toppingsMode ?? 'keep';
  const add = intent.addToppings ?? [];
  const remove = intent.removeToppings ?? [];
  if (!['keep', 'replace', 'adjust'].includes(mode) || !Array.isArray(add) || !Array.isArray(remove)) return question('Please clarify which toppings to add or remove.');
  if (mode === 'keep' && (add.length || remove.length)) return question('Please clarify whether to keep or change the toppings.');
  if ([...add, ...remove].some(topping => typeof topping !== 'string' || !menu.toppings.includes(topping))) return question(`A requested topping is not available. Please choose from: ${menu.toppings.join(', ') || 'the toppings shown on the website'}.`);
  if (add.some(topping => remove.includes(topping))) return question('The same topping was requested for adding and removing. Which change do you want?');
  const toppings = new Set(mode === 'replace' ? [] : order.toppings);
  add.forEach(topping => toppings.add(topping));
  remove.forEach(topping => toppings.delete(topping));
  const desired = {
    product,
    size,
    crust,
    toppings: [...toppings],
    quantity: intent.quantity ?? (session.managedId ? order.quantity : 1),
    sauce: intent.sauce == null ? order.sauce : intent.sauce === 'keep',
    cheese: intent.cheese == null ? order.cheese : intent.cheese === 'keep',
  };
  if (!Number.isInteger(desired.quantity) || desired.quantity < 1 || desired.quantity > 99) return question('Please choose a whole-number quantity from 1 to 99.');
  const summary = `${desired.quantity} x ${size} ${product}. Crust: ${crust || 'store default'}. Toppings: ${desired.toppings.join(', ') || 'no extra toppings'}. Sauce: ${desired.sauce ? 'keep' : 'remove'}. Cheese: ${desired.cheese ? 'keep' : 'remove'}. ${session.managedId ? 'Update this session\'s pizza only?' : 'Configure this pizza and add it to the cart?'}`;
  return { kind: 'configure', desired, summary, fingerprint: snapshot.fingerprint };
}
