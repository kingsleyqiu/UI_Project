import {createPanel} from './panel.js';
import {createSiteAdapter} from './site.js';
import {buildProposal, classifyReply, emptyOrder, otherCartItems} from './planner.js';
import {assertOtherItemsUnchanged, identifyAddedItem} from './cart.js';

const send = message => chrome.runtime.sendMessage(message);
const site = createSiteAdapter();
let session = await send({type: 'session:get'}).catch(() => ({}));
session = {...{context: [], managedId: null, lastOrder: null, inFlight: null}, ...session};
let pending = null;
let busy = false;
let lastRequest = '';
let ended = Boolean(session.ended);
let readFailureShown = false;
let generation = 0;

const panel = createPanel({
  onSubmit: submit,
  onConfirm: confirm,
  onReject: reject,
  onListen: startListening,
  onPause: pause,
  onRetry: () => session.inFlight ? recoverCart() : lastRequest && submit(lastRequest),
  onTakeover: async () => {
    pending = null;
    ended = true;
    generation++;
    session.ended = true;
    site.interrupt();
    panel.setPending(null);
    await persist();
    await pause();
    say('You are in control. This assistant session has ended; the current cart is yours to review. Open the store menu in a new tab to start another session.');
  },
  onCancel: () => submit('Cancel this order'),
});

async function persist() {
  await send({type: 'session:set', payload: session});
}

function say(text, speak = true) {
  panel.addMessage('assistant', text);
  if (speak) send({type: 'voice:speak', text}).catch(() => {});
}

async function pause() {
  await send({type: 'voice:pause'}).catch(() => {});
  panel.setListening(false);
  panel.setStatus('paused');
}

async function startListening() {
  let snapshot;
  try { snapshot = site.snapshot(); }
  catch (error) { return showFailure(error.message); }
  if (snapshot.stage === 'checkout' || ended) return say('Assistance has ended. Open the store menu in a new tab to begin another session.');
  const response = await send({type: 'voice:start'}).catch(() => null);
  if (response?.error) return showFailure(response.error.message);
  panel.setListening(Boolean(response?.listening ?? response?.ok));
}

function reject() {
  pending = null;
  panel.setPending(null);
  panel.setStatus('waiting');
  say('Nothing was changed. Please say or type the corrected instruction.');
}

async function showFailure(message) {
  pending = null;
  panel.setPending(null);
  await pause();
  try {
    const snapshot = site.snapshot();
    if (snapshot.order.product) panel.setOrder(snapshot.order);
  } catch { /* Recovery must remain available even when the site's state is unreadable. */ }
  panel.showRecovery(`${message}\nI have paused. Check the website's current selections; completed changes have not been rolled back.`);
}

function offer(proposal) {
  if (ended) return;
  pending = proposal;
  panel.setPending(proposal.summary);
  panel.setStatus('waiting', 'Say Yes or click Confirm.');
  say(proposal.summary);
}

async function submit(text) {
  if (typeof text !== 'string' || !text.trim()) return;
  text = text.trim().slice(0, 600);
  const reply = classifyReply(text);
  if (reply === 'pause') return pause();
  if (busy) return;
  if (reply === 'confirm') return pending ? confirm() : say('There is no instruction waiting for confirmation.');
  if (reply === 'reject') return reject();
  if (ended) return say('This assistant session has ended. Please review the cart manually, or open the store menu in a new tab for another session.');
  if (session.inFlight) return showFailure('An earlier cart operation needs verification. Use Retry to inspect the cart or take over manually; I will not add another pizza.');
  pending = null;
  panel.setPending(null);
  panel.addMessage('user', text);
  lastRequest = text;
  let snapshot;
  try { snapshot = site.snapshot(); }
  catch (error) { return showFailure(error.message); }
  if (snapshot.stage === 'checkout') return say('I have handed checkout to you. No order or payment has been submitted by the assistant.');
  if (!snapshot.storeReady) return say('Please select your store and carryout or delivery on the website first. For delivery, enter your address directly on the website.');
  if (!snapshot.cartReadable && !session.managedId && !Array.isArray(session.baseline) && snapshot.cartCount !== 0) {
    return offer({kind: 'baseline', summary: 'Open the cart to record your existing items, then return to the menu? Existing items will be kept.', fingerprint: snapshot.fingerprint});
  }
  if (session.managedId && !snapshot.cartReadable) {
    return offer({kind: 'review', summary: 'Open the cart to verify this session\'s pizza before changing it?', fingerprint: snapshot.fingerprint});
  }
  if ((snapshot.stage === 'menu' && !snapshot.menu.products.length) || (snapshot.stage === 'cart' && !session.managedId)) {
    return offer({kind: 'catalog', summary: 'Open Feast Pizzas to read this store\'s supported pizzas and available configuration links?', fingerprint: snapshot.fingerprint});
  }
  busy = true;
  const requestVersion = ++generation;
  panel.setBusy(true);
  panel.setStatus('processing', 'Understanding your request…');
  try {
    const menu = {...snapshot.menu};
    const managed = snapshot.cart.find(item => item.id === session.managedId);
    if (managed?.product) menu.products = [...new Set([...menu.products, managed.product])];
    const response = await send({type: 'interpret', payload: {
      utterance: text,
      context: session.context.slice(-8),
      menu,
      order: snapshot.order.product ? snapshot.order : session.lastOrder || emptyOrder(),
    }});
    if (ended || requestVersion !== generation) return;
    if (response?.error) throw new Error(response.error.message);
    if (!response?.intent) throw new Error('The local backend did not return an instruction.');
    session.context.push({role: 'user', text});
    session.context = session.context.slice(-8);
    const current = {...snapshot, menu};
    if (session.managedId && response.intent.product && session.lastOrder?.product && response.intent.product !== session.lastOrder.product) {
      say('To change the pizza type, first cancel this session\'s pizza with confirmation, then begin another session. Size, crust and toppings can be edited here.');
      return;
    }
    const proposal = buildProposal(response.intent, current, session);
    if (proposal.question) {
      session.context.push({role: 'assistant', text: proposal.question});
      say(proposal.question);
      panel.setStatus('waiting');
    } else {
      session.context.push({role: 'assistant', text: proposal.summary});
      offer(proposal);
    }
    await persist();
  } catch (error) {
    if (!ended) await showFailure(error.message || 'The request failed. Please retry.');
  } finally {
    busy = false;
    panel.setBusy(false);
  }
}

async function confirm() {
  if (!pending || busy || ended) return;
  const proposal = pending;
  let before;
  try { before = site.snapshot(); }
  catch (error) { return showFailure(error.message); }
  if (before.stage === 'checkout' || before.fingerprint !== proposal.fingerprint) {
    reject();
    return say('The website changed since that summary. Please give the instruction again so I can recheck it.');
  }
  pending = null;
  panel.setPending(null);
  busy = true;
  panel.setBusy(true);
  panel.setStatus('processing', 'Applying the confirmed instruction…');
  site.resume();
  let continueRequest = false;
  try {
    if (proposal.kind === 'baseline') {
      await site.openCart();
      const cart = site.snapshot();
      if (!cart.cartReadable) throw new Error('I could not read the existing cart. Please open the cart yourself, then retry.');
      session.baseline = cart.cart;
      await persist();
      await site.openCatalog();
      continueRequest = true;
    } else if (proposal.kind === 'catalog') {
      if (before.cartReadable) session.baseline = before.cart;
      await persist();
      await site.openCatalog();
      continueRequest = true;
    } else if (proposal.kind === 'review') {
      await site.openCart();
      continueRequest = true;
    } else if (proposal.kind === 'open') {
      if (session.managedId) await site.openManaged(session.managedId);
      else await site.openProduct(proposal.product);
      continueRequest = true;
    } else if (proposal.kind === 'cancel') {
      const id = session.managedId;
      await site.removeManaged(id);
      const after = site.snapshot();
      assertOtherItemsUnchanged(before.cart, after.cart, id);
      session.managedId = null;
      session.lastOrder = null;
      session.context = [];
      session.ended = true;
      await persist();
      ended = true;
      await pause();
      say('This session\'s pizza was removed. Other items were kept. Assistance has ended.');
    } else if (proposal.kind === 'configure') {
      const baseline = session.managedId ? before.cart : before.cartReadable ? before.cart : session.baseline;
      if (!Array.isArray(baseline)) throw new Error('I need to inspect your existing cart before adding this pizza. Open the cart, then retry your instruction.');
      await site.apply(proposal.desired);
      panel.setOrder(site.snapshot().order);
      session.inFlight = {before: baseline, managedId: session.managedId, desired: proposal.desired};
      await persist();
      await site.save();
      await site.openCart();
      await verifyCartCompletion();
      await persist();
      panel.setOrder(session.lastOrder);
      panel.setStatus('complete');
      const others = otherCartItems(site.snapshot().cart, session.managedId);
      say(`Your pizza is ready for review. ${others.length ? `Your cart also contains ${others.length} other item${others.length === 1 ? '' : 's'}; please review the full cart. ` : ''}You can ask me to change this pizza, or continue checkout yourself. Nothing has been ordered or paid.`);
    }
  } catch (error) {
    if (!ended) await showFailure(error.message || 'The page did not complete the operation.');
  } finally {
    busy = false;
    panel.setBusy(false);
  }
  if (continueRequest) await submit(lastRequest);
}

async function verifyCartCompletion() {
  const flight = session.inFlight;
  const snapshot = site.snapshot();
  if (!snapshot.cartReadable) throw new Error('The cart has not loaded. Retry will inspect it without adding anything.');
  let row;
  if (flight.managedId) {
    row = snapshot.cart.find(item => item.id === flight.managedId);
    if (!row) throw new Error('This session\'s item identifier changed. Please take over manually.');
    assertOtherItemsUnchanged(flight.before, snapshot.cart, flight.managedId);
  } else row = identifyAddedItem(flight.before, snapshot.cart);
  if (row.product !== flight.desired.product || row.quantity !== flight.desired.quantity) throw new Error('The cart does not match the confirmed pizza and quantity. Please review it manually.');
  session.managedId = row.id;
  await persist();
  await site.verifyManaged(flight.desired, row.id);
  assertOtherItemsUnchanged(snapshot.cart, site.snapshot().cart, row.id);
  session.lastOrder = flight.desired;
  session.lastCart = site.snapshot().cart;
  session.baseline = null;
  session.inFlight = null;
}

async function recoverCart() {
  if (ended) return say('This session has ended. Please review the cart manually.');
  if (busy) return;
  busy = true;
  panel.setBusy(true);
  try {
    site.resume();
    await site.openCart();
    await verifyCartCompletion();
    await persist();
    panel.setOrder(session.lastOrder);
    panel.setPending(null);
    say('I verified the previously saved pizza in the cart. No second pizza was added. Review it or give a new change instruction.');
  } catch (error) { await showFailure(error.message); }
  finally { busy = false; panel.setBusy(false); }
}

function handoff() {
  if (ended) return;
  let cart = session.lastCart || [];
  try { const snapshot = site.snapshot(); if (snapshot.cartReadable && snapshot.stage !== 'checkout') cart = snapshot.cart; }
  catch { /* Use the last verified cart to retain the other-items reminder at handoff. */ }
  const others = otherCartItems(cart, session.managedId);
  ended = true;
  generation++;
  session.ended = true;
  pending = null;
  panel.setPending(null);
  // Send both messages before a full payment-page navigation can unload this script.
  pause();
  say(`${others.length ? `Your cart contains ${others.length} other item${others.length === 1 ? '' : 's'}. Please check them as well. ` : ''}Please complete checkout and payment yourself. I have stopped listening and making changes.`);
  persist().catch(() => {});
}

document.addEventListener('click', event => {
  const anchor = event.target.closest?.('a[href]');
  if (anchor && /\/payment(?:[/?#]|$)/i.test(anchor.href)) handoff();
}, true);

for (const eventName of ['pointerdown', 'keydown']) document.addEventListener(eventName, event => {
  if (busy && event.isTrusted && !event.composedPath().some(node => node?.id === 'pizza-avatar-assistant') && event.target.closest?.('input, select, button, a, label')) {
    site.interrupt();
  }
}, true);

chrome.runtime.onMessage.addListener(message => {
  if (message?.type !== 'voice:event') return;
  if (message.event === 'text') submit(message.text);
  if (message.event === 'transcript') panel.setTranscript(message.text);
  if (message.event === 'status') {
    panel.setListening(message.listening);
    if (message.text === 'speaking') panel.setStatus('speaking');
    else if (pending) panel.setStatus('waiting', 'Say Yes or click Confirm.');
    else if (busy) panel.setStatus('processing');
    else panel.setStatus(message.text);
  }
  if (message.event === 'error') showFailure(message.text);
});

if (ended) {
  const others = otherCartItems(session.lastCart || [], session.managedId);
  say(`${others.length ? `Your cart also contains ${others.length} other item${others.length === 1 ? '' : 's'}. Please review the full cart. ` : ''}Assistance has ended. You control checkout and payment. Open the store menu in a new tab to begin another assistant session.`, false);
} else say('Hello! I can help with Pepperoni Feast, Hawaiian or Veggie at your selected store. Type a request or start listening. Each instruction needs your confirmation. Please keep personal and payment details on the website.', false);
const voiceState = await send({type: 'voice:state'}).catch(() => ({}));
panel.setListening(Boolean(voiceState?.listening));
if (session.lastOrder) panel.setOrder(session.lastOrder);
if (session.inFlight && !ended) showFailure('The page navigated during a cart operation. Use Retry to inspect the cart before doing anything else.');

setInterval(() => {
  if (busy) return;
  let snapshot;
  try { snapshot = site.snapshot(); readFailureShown = false; }
  catch (error) {
    if (!readFailureShown) { readFailureShown = true; showFailure(error.message); }
    return;
  }
  if (snapshot.stage === 'checkout') { handoff(); return; }
  if (snapshot.cartReadable && JSON.stringify(snapshot.cart) !== JSON.stringify(session.lastCart)) {
    session.lastCart = snapshot.cart;
    persist().catch(() => {});
  }
  if (pending && snapshot.fingerprint !== pending.fingerprint) {
    pending = null;
    panel.setPending(null);
    say('The website selections changed. Please give your instruction again before I make another change.');
  }
  if (snapshot.order.product) panel.setOrder(snapshot.order);
}, 1000);
