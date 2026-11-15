import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createPanel } from '../extension/panel.js';

function harness(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
  globalThis.document = document;
  let focused;
  window.HTMLElement.prototype.focus = function () { focused = this; };
  const calls = [];
  const callbacks = Object.fromEntries(['onSubmit', 'onConfirm', 'onReject', 'onListen', 'onPause', 'onRetry', 'onTakeover', 'onCancel'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const panel = createPanel(callbacks);
  const host = document.querySelector('#pizza-avatar-assistant');
  const find = selector => host.shadowRoot.querySelector(selector);
  const click = selector => find(selector).dispatchEvent(new window.Event('click', { bubbles: true }));
  t.after(() => {
    panel.destroy();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  return { panel, host, find, click, calls, window, focused: () => focused };
}

test('collapsing keeps the continuous listening indicator and Pause mic control', t => {
  const h = harness(t);
  h.panel.setListening(true);
  h.click('.collapse');
  assert.equal(h.find('.panel').hidden, true);
  assert.equal(h.find('.launcher').getAttribute('aria-expanded'), 'false');
  assert.equal(h.find('.launcher-status').textContent, 'Listening');
  assert.equal(h.find('.quick-pause').hidden, false);
  assert.deepEqual(h.calls, []);
  h.click('.quick-pause');
  assert.deepEqual(h.calls, [['onPause']]);
  h.panel.setStatus('speaking');
  assert.equal(h.find('.launcher-status').textContent, 'Speaking · mic paused');
  h.panel.setListening(false);
  assert.equal(h.find('.quick-pause').hidden, true);
});

test('pending instructions wait for explicit Confirm or Revise and respect busy state', t => {
  const h = harness(t);
  h.click('.collapse');
  h.panel.setPending('Change size to Medium.');
  assert.equal(h.find('.panel').hidden, false);
  assert.equal(h.find('.pending').hidden, false);
  assert.equal(h.focused(), h.find('.confirm'));
  assert.deepEqual(h.calls, []);
  h.panel.setBusy(true);
  assert.equal(h.find('.confirm').disabled, true);
  assert.equal(h.find('input').disabled, true);
  assert.equal(h.find('.microphone').disabled, false);
  h.panel.setBusy(false);
  assert.equal(h.find('.confirm').disabled, false);
  h.click('.confirm');
  h.click('.revise');
  assert.deepEqual(h.calls, [['onConfirm'], ['onReject']]);
  assert.equal(h.focused(), h.find('input'));
  h.panel.setPending(null);
  assert.equal(h.find('.pending').hidden, true);
});

test('model, user, transcript and order strings render as text rather than HTML', t => {
  const h = harness(t);
  const hostile = '<img src=x onerror="window.compromised=true"><script>bad()</script>';
  h.panel.addMessage('assistant', hostile);
  h.panel.setPending(hostile);
  h.panel.setTranscript(hostile);
  h.panel.setOrder({ product: hostile, toppings: [hostile], quantity: 1, sauce: true, cheese: true });
  assert.equal(h.find('.message span').textContent, hostile);
  assert.equal(h.find('.pending p').textContent, hostile);
  assert.equal(h.find('.order dd').textContent, hostile);
  assert.equal(h.find('.message img'), null);
  assert.equal(h.find('.pending script'), null);
  assert.equal(h.find('.order img'), null);
  h.click('.heard button');
  assert.equal(h.find('input').value, hostile);
  assert.deepEqual(h.calls, []);
});

test('edited transcript is submitted only by the user and recovery actions are explicit', t => {
  const h = harness(t);
  h.panel.setTranscript('  large Hawaiian  ');
  h.click('.heard button');
  assert.deepEqual(h.calls, []);
  h.find('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.deepEqual(h.calls, [['onSubmit', 'large Hawaiian']]);
  h.find('input').value = 'do not submit while busy';
  h.panel.setBusy(true);
  h.find('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.calls.length, 1);
  h.panel.setBusy(false);
  h.panel.showRecovery('The size changed, but the topping did not.');
  assert.equal(h.find('.recovery').hidden, false);
  assert.equal(h.find('.pending').hidden, true);
  h.click('.retry');
  h.click('.takeover');
  h.click('.cancel');
  assert.deepEqual(h.calls.slice(1), [['onRetry'], ['onTakeover'], ['onCancel']]);
});
