const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');
const SESSION_KEY = (tabId) => `tab:${tabId}`;
const OWNER_KEY = 'voiceOwner';
let creatingOffscreen;
let offscreenReason = null;
let voiceQueue = Promise.resolve();

function isDominos(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && ['www.dominos.ca', 'dominos.ca'].includes(parsed.hostname); }
  catch { return false; }
}

function isPayment(url) {
  try {
    const parsed = new URL(url);
    return [parsed.pathname, parsed.hash.replace(/^#!?/, '')].some((route) => /(?:^|\/)payment(?:\/|$|\?)/i.test(decodeURIComponent(route)));
  } catch { return false; }
}

const errorResult = (code, message) => ({error: {code, message}});
const owner = async () => (await chrome.storage.session.get(OWNER_KEY))[OWNER_KEY] ?? null;
const sendToTab = (tabId, message) => chrome.tabs.sendMessage(tabId, message).catch(() => {});
const voiceTask = (task) => {
  const result = voiceQueue.then(task);
  voiceQueue = result.catch(() => {});
  return result;
};

async function offscreenExists() {
  return (await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [OFFSCREEN_URL]})).length > 0;
}

async function ensureOffscreen(forListening) {
  const exists = await offscreenExists();
  if (exists && (!forListening || offscreenReason === 'USER_MEDIA')) return;
  if (exists) {
    // An explicit Start also upgrades an unknown context after worker restart.
    await offscreenCommand('voice:stop');
    await chrome.offscreen.closeDocument();
    offscreenReason = null;
  }
  if (!creatingOffscreen) {
    const reason = forListening ? 'USER_MEDIA' : 'AUDIO_PLAYBACK';
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [reason],
      justification: forListening ? 'Keep the user-started microphone session active while navigating Domino’s pages.' : 'Read back instruction summaries for users interacting through typed text.',
    }).then(() => { offscreenReason = reason; }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

const offscreenCommand = (type, extra = {}) => chrome.runtime.sendMessage({target: 'offscreen', type, ...extra});

async function stopOwner(tabId) {
  if (await owner() !== tabId) return;
  await chrome.storage.session.remove(OWNER_KEY);
  if (await offscreenExists()) await offscreenCommand('voice:stop');
}

async function voiceRequest(message, tabId) {
  if (message.type === 'voice:state') {
    if (await owner() !== tabId || !await offscreenExists()) return {ok: true, listening: false, status: 'paused'};
    return offscreenCommand('voice:state');
  }
  if (message.type === 'voice:pause') {
    if (await owner() === tabId && await offscreenExists()) return offscreenCommand('voice:pause');
    return {ok: true, listening: false, status: 'paused'};
  }
  if (message.type === 'voice:speak' && (typeof message.text !== 'string' || message.text.length > 2400)) return errorResult('INVALID_SPEECH', 'The spoken reply is too long.');
  await ensureOffscreen(message.type === 'voice:start');
  const previous = await owner();
  if (previous !== null && previous !== tabId) {
    const state = await offscreenCommand('voice:state');
    if (message.type === 'voice:speak' && state?.listening) return errorResult('VOICE_OTHER_TAB', 'Voice is active in another Domino’s tab. Choose Start listening here to switch.');
    await offscreenCommand('voice:stop');
    await sendToTab(previous, {type: 'voice:event', event: 'status', text: 'paused', listening: false});
  }
  await chrome.storage.session.set({[OWNER_KEY]: tabId});
  return offscreenCommand(message.type, {tabId, ...(message.type === 'voice:speak' ? {text: message.text} : {})});
}

async function interpret(payload) {
  if (!payload || typeof payload !== 'object' || JSON.stringify(payload).length > 40_000) return errorResult('INVALID_INPUT', 'The instruction is too large. Please shorten it.');
  try {
    const response = await fetch('http://127.0.0.1:8787/interpret', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Pizza-Assistant': '1'},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35_000),
    });
    const data = await response.json();
    if (response.ok && data?.intent && typeof data.intent === 'object') return data;
    if (data?.error && typeof data.error.code === 'string' && typeof data.error.message === 'string') return {error: {code: data.error.code.slice(0, 80), message: data.error.message.slice(0, 600)}};
    return errorResult('BACKEND_ERROR', 'The local backend returned an invalid response. Restart it and try again.');
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return errorResult('BACKEND_TIMEOUT', 'The local backend timed out. No website action was authorized. Retry or continue manually.');
    return errorResult('BACKEND_UNREACHABLE', 'Start the local backend on 127.0.0.1:8787, then try again.');
  }
}

async function handle(message, sender) {
  if (message.type === 'voice:offscreen') {
    if (sender.url !== OFFSCREEN_URL || !['text', 'transcript', 'status', 'error'].includes(message.event) || typeof message.text !== 'string' || message.text.length > 4096) return errorResult('INVALID_EVENT', 'Invalid voice event.');
    const tabId = await owner();
    if (tabId !== null && tabId === message.tabId) await sendToTab(tabId, {type: 'voice:event', event: message.event, text: message.text, listening: Boolean(message.listening)});
    return {ok: true};
  }
  if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || !isDominos(sender.url)) return errorResult('INVALID_SENDER', 'This assistant is available only on Domino’s Canada.');
  const tabId = sender.tab.id;
  if (message.type === 'interpret') return interpret(message.payload);
  if (message.type === 'session:get') return (await chrome.storage.session.get(SESSION_KEY(tabId)))[SESSION_KEY(tabId)] ?? {};
  if (message.type === 'session:set') {
    if (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload) || JSON.stringify(message.payload).length > 100_000) return errorResult('INVALID_SESSION', 'The temporary session is invalid or too large.');
    const payload = {...message.payload};
    if (isPayment(sender.tab.url || sender.url)) payload.ended = true;
    await chrome.storage.session.set({[SESSION_KEY(tabId)]: payload});
    return {ok: true};
  }
  if (['voice:start', 'voice:pause', 'voice:speak', 'voice:state'].includes(message.type)) return voiceTask(() => voiceRequest(message, tabId));
  return errorResult('UNKNOWN_MESSAGE', 'Unknown assistant command.');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message !== 'object' || message.target === 'offscreen' || sender.id !== chrome.runtime.id) return false;
  handle(message, sender).then(respond, () => respond(errorResult('EXTENSION_ERROR', 'The extension could not complete this request. Pause and retry, or continue manually.')));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(SESSION_KEY(tabId)).catch(() => {});
  voiceTask(() => stopOwner(tabId)).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (!change.url || (isDominos(change.url) && !isPayment(change.url))) return;
  voiceTask(async () => {
    const key = SESSION_KEY(tabId);
    if (isDominos(change.url)) {
      const session = (await chrome.storage.session.get(key))[key] ?? {};
      await chrome.storage.session.set({[key]: {...session, ended: true}});
    } else {
      await chrome.storage.session.remove(key);
    }
    await stopOwner(tabId);
    await sendToTab(tabId, {type: 'voice:event', event: 'status', text: 'paused', listening: false});
  }).catch(() => {});
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({url: chrome.runtime.getURL('permissions.html')});
});
