import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, interpret, DEFAULT_MODEL} from '../backend/server.js';
import {validateInput} from '../backend/intent.js';

function requestData() {
  return {utterance: 'Make it large and add mushrooms', context: [], menu: {products: ['Pepperoni Feast', 'Hawaiian', 'Veggie'], sizes: ['Small', 'Medium', 'Large'], crusts: ['Hand Tossed'], toppings: ['Pepperoni', 'Mushroom', 'Onions']}, order: {product: 'Pepperoni Feast', size: 'Medium', crust: 'Hand Tossed', toppings: ['Pepperoni'], quantity: 1, sauce: true, cheese: true}};
}
function result(changes = {}) {
  return {intent: 'configure', product: null, size: 'Large', crust: null, quantity: null, toppingsMode: 'adjust', addToppings: ['Mushroom'], removeToppings: [], sauce: null, cheese: null, question: null, ...changes};
}
const modelResponse = (value) => ({ok: true, json: async () => ({candidates: [{finishReason: 'STOP', content: {parts: [{text: JSON.stringify(value)}]}}]})});

test('uses structured Gemini REST output and forwards only normalized fields', async () => {
  let calls = 0;
  const input = {...requestData(), address: 'this field must not be sent', screenshot: 'not forwarded'};
  const output = await interpret(input, {apiKey: 'unit-test-secret', fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
    const body = JSON.parse(options.body);
    assert.equal(options.headers['x-goog-api-key'], 'unit-test-secret');
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.equal(body.generationConfig.responseJsonSchema.additionalProperties, false);
    assert.ok(!options.body.includes('this field must not be sent'));
    assert.ok(!options.body.includes('unit-test-secret'));
    return modelResponse(result());
  }});
  assert.deepEqual(output, result());
  assert.equal(calls, 1);
});

test('missing key stops before any provider request', async () => {
  await assert.rejects(interpret(requestData(), {apiKey: '', fetchImpl: () => assert.fail('must not call Gemini')}), {code: 'MISSING_API_KEY', status: 503});
});

test('normalizes multiline food context without forwarding arbitrary request fields', () => {
  const input = validateInput({...requestData(), context: [{role: 'assistant', text: 'Current order:\nLarge Pepperoni Feast'}]});
  assert.equal(input.context[0].text, 'Current order: Large Pepperoni Feast');
});

test('blocks known personal data in utterance and dialogue before cloud calls', async () => {
  for (const utterance of ['My email is pizza@example.com', 'Deliver to 123 Main Street', 'Call 416-555-1234', 'My card number is 4111 1111 1111 1111', 'My name is Qian']) {
    await assert.rejects(interpret({...requestData(), utterance}, {apiKey: 'test', fetchImpl: () => assert.fail('private data must stay local')}), {code: 'PRIVATE_DATA'});
  }
  assert.throws(() => validateInput({...requestData(), context: [{role: 'user', text: 'My address is 10 King Street'}]}), {code: 'PRIVATE_DATA'});
});

test('rejects unsupported menu options, executable fields and invalid output shapes', async () => {
  for (const output of [result({addToppings: ['Mango']}), result({size: 'Extra Large'}), result({selector: '#checkout'}), result({quantity: 0}), result({removeToppings: ['Mushroom']})]) {
    await assert.rejects(interpret(requestData(), {apiKey: 'test', fetchImpl: async () => modelResponse(output)}), {code: 'INVALID_MODEL_OUTPUT'});
  }
});

test('only opens a new product before its actual customization options are discovered', async () => {
  const input = requestData();
  input.order.product = null;
  input.menu.sizes = []; input.menu.crusts = []; input.menu.toppings = [];
  const opening = result({product: 'Hawaiian', size: null, toppingsMode: 'keep', addToppings: [], question: "Open Hawaiian to inspect this store's options."});
  assert.deepEqual(await interpret(input, {apiKey: 'test', fetchImpl: async () => modelResponse(opening)}), opening);
  await assert.rejects(interpret(input, {apiKey: 'test', fetchImpl: async () => modelResponse({...opening, size: 'Large'})}), {code: 'INVALID_MODEL_OUTPUT'});
});

test('quota exhaustion is surfaced without retries or provider error leakage', async () => {
  let calls = 0;
  await assert.rejects(interpret(requestData(), {apiKey: 'do-not-leak', fetchImpl: async () => { calls++; return {ok: false, status: 429, text: async () => 'do-not-leak'}; }}), (error) => error.code === 'QUOTA_EXHAUSTED' && !error.message.includes('do-not-leak'));
  assert.equal(calls, 1);
});

test('timeouts, unavailable models and malformed output stop interpretation', async () => {
  await assert.rejects(interpret(requestData(), {apiKey: 'test', fetchImpl: async () => { throw new DOMException('Timeout', 'TimeoutError'); }}), {code: 'MODEL_TIMEOUT'});
  await assert.rejects(interpret(requestData(), {apiKey: 'test', fetchImpl: async () => ({ok: false, status: 404})}), {code: 'MODEL_CONFIGURATION'});
  await assert.rejects(interpret(requestData(), {apiKey: 'test', fetchImpl: async () => ({ok: true, json: async () => ({candidates: []})})}), {code: 'INVALID_MODEL_OUTPUT'});
});

test('HTTP API is disabled by default even with a supplied key and never calls Gemini', async (t) => {
  const previous = process.env.PIZZA_ENABLE_GEMINI;
  delete process.env.PIZZA_ENABLE_GEMINI;
  let server;
  try { server = createServer({apiKey: 'placeholder-test-key', fetchImpl: () => assert.fail('disabled API must not call provider')}); }
  finally {
    if (previous === undefined) delete process.env.PIZZA_ENABLE_GEMINI;
    else process.env.PIZZA_ENABLE_GEMINI = previous;
  }
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.enabled, false);
  assert.equal(health.configured, false);
  const response = await fetch(`${base}/interpret`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Pizza-Assistant': '1'}, body: JSON.stringify(requestData())});
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, 'API_DISABLED');
  assert.match(body.error.message, /reserved for later setup/);
});

test('local HTTP endpoint rejects website origins, enforces JSON and returns typed errors when enabled', async (t) => {
  const server = createServer({enabled: true, apiKey: '', fetchImpl: () => assert.fail('must not call provider')});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {'Content-Type': 'application/json', 'X-Pizza-Assistant': '1'};
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.enabled, true);
  assert.equal(health.configured, false);
  const rejected = await fetch(`${base}/interpret`, {method: 'POST', headers: {...headers, Origin: 'https://www.dominos.ca'}, body: JSON.stringify(requestData())});
  assert.equal(rejected.status, 403);
  const missingHeader = await fetch(`${base}/interpret`, {method: 'POST', body: '{}'});
  assert.equal(missingHeader.status, 415);
  const noKey = await fetch(`${base}/interpret`, {method: 'POST', headers: {...headers, Origin: `chrome-extension://${'a'.repeat(32)}`}, body: JSON.stringify(requestData())});
  assert.equal(noKey.status, 503);
  assert.equal(noKey.headers.get('access-control-allow-origin'), `chrome-extension://${'a'.repeat(32)}`);
  assert.equal((await noKey.json()).error.code, 'MISSING_API_KEY');
  const large = await fetch(`${base}/interpret`, {method: 'POST', headers, body: JSON.stringify({utterance: 'x'.repeat(25_000)})});
  assert.equal(large.status, 413);
});
