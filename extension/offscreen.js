import {createVoice} from './voice.js';

let tabId = null;
let status = 'paused';
let voice;

function publish(event, text) {
  if (tabId === null) return;
  chrome.runtime.sendMessage({target: 'worker', type: 'voice:offscreen', tabId, event, text: String(text), listening: voice?.listening ?? false}).catch(() => {});
}

function createSession() {
  return createVoice({
    onText: (text) => publish('text', text),
    onTranscript: (text) => publish('transcript', text),
    onStatus: (text) => { status = text; publish('status', text); },
    onError: (text) => publish('error', /not granted|not permitted|access|permission/i.test(text) ? `${text} Click the extension icon to open microphone setup.` : text),
  });
}

voice = createSession();

async function handle(message) {
  if (message.type === 'voice:state') return {ok: true, listening: voice.listening, status, supported: voice.supported};
  if (message.type === 'voice:stop') {
    voice.dispose();
    voice = createSession();
    status = 'paused';
    tabId = null;
    return {ok: true, listening: false, status};
  }
  if (message.type === 'voice:pause') {
    voice.pause();
    return {ok: true, listening: false, status};
  }
  if (!Number.isInteger(message.tabId)) return {error: {code: 'INVALID_VOICE_OWNER', message: 'The voice session has no active tab.'}};
  if (tabId !== message.tabId) {
    voice.dispose();
    voice = createSession();
    status = 'paused';
    tabId = message.tabId;
  }
  if (message.type === 'voice:start') {
    try {
      const permission = await navigator.permissions.query({name: 'microphone'});
      if (permission.state !== 'granted') return {error: {code: 'MICROPHONE_PERMISSION', message: 'Click the extension icon, grant microphone access on its setup page, then return here and choose Start listening. You can also type.'}};
    } catch {
      return {error: {code: 'MICROPHONE_PERMISSION', message: 'Microphone permission could not be checked. Open the extension’s microphone setup page, or type your request.'}};
    }
    const listening = voice.start();
    return {ok: listening, listening, status, supported: voice.supported};
  }
  if (message.type === 'voice:speak' && typeof message.text === 'string') {
    voice.speak(message.text);
    return {ok: true, listening: voice.listening, status};
  }
  return {error: {code: 'UNKNOWN_VOICE_COMMAND', message: 'Unknown voice command.'}};
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab || message?.target !== 'offscreen') return false;
  handle(message).then(respond, () => respond({error: {code: 'VOICE_ERROR', message: 'Voice could not start. Use the extension’s microphone setup page, or type instead.'}}));
  return true;
});
