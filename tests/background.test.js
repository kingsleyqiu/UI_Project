import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
const extensionId = 'a'.repeat(32);

function harness({existingOffscreen = false} = {}) {
  const storage = {};
  const tabEvents = [];
  const commands = [];
  const fetches = [];
  const openedTabs = [];
  const createdDocuments = [];
  let closedDocuments = 0;
  let listener, onUpdated, onRemoved, onClicked;
  let offscreen = existingOffscreen;
  let voice = {listening: false, status: 'paused'};
  const chrome = {
    runtime: {
      id: extensionId,
      getURL: (path) => `chrome-extension://${extensionId}/${path}`,
      getContexts: async () => offscreen ? [{}] : [],
      onMessage: {addListener: (callback) => { listener = callback; }},
      sendMessage: async (message) => {
        assert.equal(message.target, 'offscreen');
        commands.push(message);
        if (message.type === 'voice:start') voice = {listening: true, status: 'listening'};
        if (['voice:pause', 'voice:stop'].includes(message.type)) voice = {listening: false, status: 'paused'};
        return {ok: true, ...voice};
      },
    },
    storage: {session: {
      get: async (key) => ({[key]: storage[key]}),
      set: async (values) => { Object.assign(storage, values); },
      remove: async (key) => { delete storage[key]; },
    }},
    offscreen: {
      createDocument: async (options) => { createdDocuments.push(options); offscreen = true; },
      closeDocument: async () => { closedDocuments++; offscreen = false; },
    },
    tabs: {
      sendMessage: async (tabId, message) => { tabEvents.push({tabId, message}); },
      create: async (options) => { openedTabs.push(options); },
      onUpdated: {addListener: (callback) => { onUpdated = callback; }},
      onRemoved: {addListener: (callback) => { onRemoved = callback; }},
    },
    action: {onClicked: {addListener: (callback) => { onClicked = callback; }}},
  };
  const fetch = async (url, options) => {
    fetches.push({url, options});
    return {ok: true, json: async () => ({intent: {intent: 'clarify'}})};
  };
  vm.runInNewContext(source, {chrome, URL, AbortSignal, fetch});
  const sender = (tabId = 1, url = 'https://www.dominos.ca/en/pages/order/') => ({id: extensionId, tab: {id: tabId, url}, frameId: 0, url});
  const send = (message, origin = sender()) => new Promise((resolve) => {
    const handled = listener(message, origin, resolve);
    if (!handled) resolve(undefined);
  });
  return {storage, tabEvents, commands, fetches, openedTabs, createdDocuments, get closedDocuments() { return closedDocuments; }, sender, send, listener,
    update: (tabId, url) => onUpdated(tabId, {url}),
    remove: (tabId) => onRemoved(tabId),
    clickAction: () => onClicked(),
    flush: () => send({type: 'voice:state'}),
  };
}

test('continuous listening uses USER_MEDIA without the 30-second audio-playback lifetime', async () => {
  const app = harness();
  await app.send({type: 'voice:start'});
  assert.deepEqual(Array.from(app.createdDocuments[0].reasons), ['USER_MEDIA']);
  await app.send({type: 'voice:speak', text: 'Please confirm the large Hawaiian.'});
  assert.equal(app.createdDocuments.length, 1);
  assert.equal(app.closedDocuments, 0);
});

test('text-only speech uses AUDIO_PLAYBACK and explicit Start upgrades it to USER_MEDIA', async () => {
  const app = harness();
  await app.send({type: 'voice:speak', text: 'Please confirm the large Hawaiian.'});
  assert.deepEqual(Array.from(app.createdDocuments[0].reasons), ['AUDIO_PLAYBACK']);
  await app.send({type: 'voice:start'});
  assert.equal(app.closedDocuments, 1);
  assert.deepEqual(Array.from(app.createdDocuments[1].reasons), ['USER_MEDIA']);
  assert.equal((await app.send({type: 'voice:state'})).listening, true);
});

test('explicit Start recreates an unknown preexisting offscreen context after worker restart', async () => {
  const app = harness({existingOffscreen: true});
  app.storage.voiceOwner = 1;
  await app.send({type: 'voice:start'});
  assert.equal(app.closedDocuments, 1);
  assert.deepEqual(Array.from(app.createdDocuments[0].reasons), ['USER_MEDIA']);
});

test('API bridge uses only fixed loopback URL and required headers', async () => {
  const app = harness();
  const result = await app.send({type: 'interpret', payload: {utterance: 'Large Hawaiian', url: 'https://example.com/collect'}});
  assert.equal(result.intent.intent, 'clarify');
  assert.equal(app.fetches.length, 1);
  assert.equal(app.fetches[0].url, 'http://127.0.0.1:8787/interpret');
  assert.equal(app.fetches[0].options.headers['X-Pizza-Assistant'], '1');
  assert.equal(app.fetches[0].options.headers['Content-Type'], 'application/json');
});

test('rejects unrelated extension IDs, website origins, frames and subdomains', async () => {
  const app = harness();
  assert.equal(await app.send({type: 'interpret', payload: {}}, {...app.sender(), id: 'another-extension'}), undefined);
  for (const invalidSender of [app.sender(1, 'https://example.com/'), app.sender(1, 'http://www.dominos.ca/'), app.sender(1, 'https://other.dominos.ca/'), {...app.sender(), frameId: 1}]) {
    assert.equal((await app.send({type: 'interpret', payload: {}}, invalidSender)).error.code, 'INVALID_SENDER');
  }
  assert.equal(app.fetches.length, 0);
});

test('temporary sessions are isolated by tab', async () => {
  const app = harness();
  await app.send({type: 'session:set', payload: {managedItemId: 'owned-pizza', ended: false}});
  assert.equal((await app.send({type: 'session:get'})).managedItemId, 'owned-pizza');
  assert.equal(Object.keys(await app.send({type: 'session:get'}, app.sender(2))).length, 0);
});

for (const route of ['https://www.dominos.ca/pages/order/payment', 'https://www.dominos.ca/en/pages/order/#!/payment']) {
  test(`payment boundary stops voice and preserves ownership: ${route}`, async () => {
    const app = harness();
    await app.send({type: 'session:set', payload: {managedItemId: 'owned-pizza', draft: {quantity: 2}, ended: false}});
    await app.send({type: 'voice:start'});
    app.update(1, route);
    await app.flush();
    assert.equal(app.storage.voiceOwner, undefined);
    assert.equal(app.storage['tab:1'].ended, true);
    assert.equal(app.storage['tab:1'].managedItemId, 'owned-pizza');
    assert.equal(app.storage['tab:1'].draft.quantity, 2);
    assert.ok(app.commands.some((command) => command.type === 'voice:stop'));
    assert.ok(app.tabEvents.some(({message}) => message.event === 'status' && message.listening === false));
    // A late content-state write from checkout cannot reactivate the session.
    await app.send({type: 'session:set', payload: {managedItemId: 'owned-pizza', ended: false}}, app.sender(1, route));
    assert.equal(app.storage['tab:1'].ended, true);
  });
}

test('Domino’s checkout hash is the editable cart review, so voice and session stay active', async () => {
  const app = harness();
  await app.send({type: 'session:set', payload: {managedItemId: 'owned-pizza', ended: false}});
  await app.send({type: 'voice:start'});
  const review = 'https://www.dominos.ca/en/pages/order/#!/checkout/';
  app.update(1, review);
  await app.flush();
  assert.equal(app.storage.voiceOwner, 1);
  assert.equal(app.storage['tab:1'].ended, false);
  assert.equal(app.storage['tab:1'].managedItemId, 'owned-pizza');
  assert.equal((await app.send({type: 'voice:state'})).listening, true);
  assert.equal(app.commands.some((command) => command.type === 'voice:stop'), false);
  await app.send({type: 'session:set', payload: {managedItemId: 'owned-pizza', ended: false}}, app.sender(1, review));
  assert.equal(app.storage['tab:1'].ended, false);
});

test('same-site menu navigation keeps voice and session, leaving site clears both', async () => {
  const app = harness();
  await app.send({type: 'session:set', payload: {managedItemId: 'owned-pizza'}});
  await app.send({type: 'voice:start'});
  app.update(1, 'https://www.dominos.ca/en/pages/order/#!/cart/');
  await app.flush();
  assert.equal(app.storage.voiceOwner, 1);
  assert.equal(app.storage['tab:1'].managedItemId, 'owned-pizza');
  app.update(1, 'https://example.com/');
  await app.flush();
  assert.equal(app.storage.voiceOwner, undefined);
  assert.equal(app.storage['tab:1'], undefined);
});

test('starting another tab pauses previous owner and routes only current voice events', async () => {
  const app = harness();
  await app.send({type: 'voice:start'});
  await app.send({type: 'voice:start'}, app.sender(2));
  assert.equal(app.storage.voiceOwner, 2);
  assert.ok(app.tabEvents.some(({tabId, message}) => tabId === 1 && message.text === 'paused'));
  assert.equal((await app.send({type: 'voice:speak', text: 'Hello'}, app.sender(1))).error.code, 'VOICE_OTHER_TAB');
  const offscreenSender = {id: extensionId, url: `chrome-extension://${extensionId}/offscreen.html`};
  const count = app.tabEvents.length;
  await app.send({type: 'voice:offscreen', tabId: 1, event: 'text', text: 'stale yes', listening: true}, offscreenSender);
  assert.equal(app.tabEvents.length, count);
  await app.send({type: 'voice:offscreen', tabId: 2, event: 'text', text: 'yes', listening: true}, offscreenSender);
  assert.equal(app.tabEvents.at(-1).tabId, 2);
  assert.equal(app.tabEvents.at(-1).message.text, 'yes');
});

test('closing the owning tab stops voice; extension action opens only microphone setup', async () => {
  const app = harness();
  await app.send({type: 'session:set', payload: {managedItemId: 'owned-pizza'}});
  await app.send({type: 'voice:start'});
  app.remove(1);
  await app.flush();
  assert.equal(app.storage.voiceOwner, undefined);
  assert.equal(app.storage['tab:1'], undefined);
  app.clickAction();
  assert.equal(app.openedTabs[0].url, `chrome-extension://${extensionId}/permissions.html`);
});
