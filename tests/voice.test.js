import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice } from '../extension/voice.js';

function harness(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const names = ['SpeechRecognition', 'webkitSpeechRecognition', 'SpeechSynthesisUtterance', 'speechSynthesis'];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const instances = [];
  const texts = [], transcripts = [], statuses = [], errors = [];
  class Recognition {
    constructor() { instances.push(this); }
    start() { this.onstart?.(); }
    abort() { this.aborted = true; this.onend?.(); }
  }
  globalThis.SpeechRecognition = Recognition;
  delete globalThis.webkitSpeechRecognition;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const synthesis = {
    current: null,
    cancel() { const previous = this.current; this.current = null; previous?.onerror?.(); },
    speak(utterance) { this.current = utterance; }
  };
  globalThis.speechSynthesis = synthesis;
  const voice = createVoice({ onText: text => texts.push(text), onTranscript: text => transcripts.push(text), onStatus: status => statuses.push(status), onError: error => errors.push(error) });
  t.after(() => {
    voice.dispose();
    for (const name of names) {
      const descriptor = originals.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return { voice, instances, texts, transcripts, statuses, errors, synthesis, tick: milliseconds => t.mock.timers.tick(milliseconds) };
}

function result(text, isFinal = true) {
  return Object.assign([{ transcript: text }], { isFinal });
}

test('microphone requires explicit start and restarts an active continuous session', t => {
  const h = harness(t);
  assert.equal(h.voice.listening, false);
  assert.equal(h.instances.length, 0);
  assert.equal(h.voice.start(), true);
  assert.equal(h.instances.length, 1);
  assert.equal(h.instances[0].lang, 'en-CA');
  assert.equal(h.instances[0].continuous, true);
  h.voice.start();
  assert.equal(h.instances.length, 1);
  h.instances[0].onend();
  h.tick(250);
  assert.equal(h.instances.length, 2);
  assert.equal(h.statuses.at(-1), 'listening');
});

test('interim text is visible but only completed, deduplicated utterances are delivered', t => {
  const h = harness(t);
  h.voice.start();
  const session = h.instances[0];
  session.onresult({ resultIndex: 0, results: [result('large Hawaiian', false)] });
  assert.deepEqual(h.texts, []);
  assert.equal(h.transcripts.at(-1), 'large Hawaiian');
  session.onresult({ resultIndex: 0, results: [result('large Hawaiian')] });
  session.onresult({ resultIndex: 1, results: [result('large Hawaiian'), result('no pineapple')] });
  session.onresult({ resultIndex: 1, results: [result('large Hawaiian'), result('no pineapple')] });
  h.tick(450);
  assert.deepEqual(h.texts, ['large Hawaiian no pineapple']);
  session.onend();
  assert.deepEqual(h.texts, ['large Hawaiian no pineapple']);
});

test('spoken replies suspend recognition, reject old recognition events and resume afterwards', t => {
  const h = harness(t);
  h.voice.start();
  const session = h.instances[0];
  h.voice.speak('Please confirm the large Hawaiian.');
  assert.equal(session.aborted, true);
  assert.equal(h.voice.listening, true);
  assert.equal(h.statuses.at(-1), 'speaking');
  session.onresult({ resultIndex: 0, results: [result('yes')] });
  session.onend();
  h.tick(1000);
  assert.deepEqual(h.texts, []);
  assert.equal(h.instances.length, 1);
  h.synthesis.current.onend();
  h.tick(250);
  assert.equal(h.instances.length, 2);
  assert.equal(h.statuses.at(-1), 'listening');
});

test('permission denial stops continuous listening until the user explicitly restarts it', t => {
  const h = harness(t);
  h.voice.start();
  h.instances[0].onerror({ error: 'not-allowed' });
  assert.equal(h.voice.listening, false);
  assert.match(h.errors[0], /Microphone access was not granted/);
  h.tick(10_000);
  assert.equal(h.instances.length, 1);
  h.voice.start();
  assert.equal(h.instances.length, 2);
});

test('a replaced spoken reply cannot resume the microphone before the newer reply finishes', t => {
  const h = harness(t);
  h.voice.start();
  h.voice.speak('The first interpretation.');
  const firstReply = h.synthesis.current;
  h.voice.speak('The corrected interpretation.');
  const currentReply = h.synthesis.current;
  firstReply.onend();
  h.tick(1000);
  assert.equal(h.instances.length, 1);
  assert.equal(h.statuses.at(-1), 'speaking');
  currentReply.onend();
  h.tick(250);
  assert.equal(h.instances.length, 2);
});

test('Pause cancels a pending utterance, microphone restart and ongoing spoken reply', t => {
  const h = harness(t);
  h.voice.start();
  h.instances[0].onresult({ resultIndex: 0, results: [result('remove the pizza')] });
  h.voice.pause();
  h.tick(1000);
  assert.deepEqual(h.texts, []);
  assert.equal(h.voice.listening, false);
  assert.equal(h.instances.length, 1);
  h.voice.start();
  h.voice.speak('Please confirm.');
  h.voice.pause();
  assert.equal(h.synthesis.current, null);
  assert.equal(h.statuses.at(-1), 'paused');
  h.tick(1000);
  assert.equal(h.instances.length, 2);
  h.voice.dispose();
  assert.equal(h.voice.start(), false);
});
