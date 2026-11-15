export function createVoice({ onText = () => {}, onTranscript = () => {}, onStatus = () => {}, onError = () => {} } = {}) {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  let recognition = null;
  let wanted = false;
  let speaking = false;
  let disposed = false;
  let restartTimer;
  let finalTimer;
  let finalParts = [];
  let speechVersion = 0;

  function clearFinal() {
    clearTimeout(finalTimer);
    finalParts = [];
  }

  function flushFinal() {
    clearTimeout(finalTimer);
    const text = finalParts.join(' ').replace(/\s+/g, ' ').trim();
    finalParts = [];
    if (text && wanted && !speaking && !disposed) onText(text);
  }

  function stopRecognition() {
    clearTimeout(restartTimer);
    const previous = recognition;
    recognition = null;
    if (previous) { try { previous.abort(); } catch { /* The browser may already have ended this recognition session. */ } }
  }

  function scheduleListening() {
    clearTimeout(restartTimer);
    if (wanted && !speaking && !disposed) restartTimer = setTimeout(listen, 250);
  }

  function fail(message) {
    wanted = false;
    stopRecognition();
    clearFinal();
    onStatus('paused');
    onError(message);
  }

  function listen() {
    if (!wanted || speaking || disposed || recognition) return;
    if (!Recognition) { fail('Speech recognition is unavailable in this browser. You can still type your request.'); return; }
    const session = new Recognition();
    recognition = session;
    session.lang = 'en-CA';
    session.continuous = true;
    session.interimResults = true;
    session.maxAlternatives = 1;
    const completed = new Set();
    session.onstart = () => { if (recognition === session) onStatus('listening'); };
    session.onresult = event => {
      if (recognition !== session || !wanted || speaking) return;
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const text = result[0]?.transcript?.trim() || '';
        if (result.isFinal) {
          if (!completed.has(index) && text) { completed.add(index); finalParts.push(text); }
        } else interim += `${text} `;
      }
      const heard = [...finalParts, interim.trim()].filter(Boolean).join(' ');
      if (heard) onTranscript(heard);
      if (finalParts.length) {
        clearTimeout(finalTimer);
        finalTimer = setTimeout(flushFinal, 450);
      }
    };
    session.onerror = event => {
      if (recognition !== session) return;
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      const messages = {
        'not-allowed': 'Microphone access was not granted. Allow access, then choose Start listening, or type instead.',
        'service-not-allowed': 'Speech recognition is not permitted here. You can type your request instead.',
        'audio-capture': 'No microphone is available. Check your microphone, then start listening again.',
        network: 'Speech recognition lost its connection. Start listening again when ready, or type instead.',
        'language-not-supported': 'English speech recognition is unavailable here. You can type your request instead.'
      };
      fail(messages[event.error] || 'Speech recognition stopped. Start listening again when ready, or type instead.');
    };
    session.onend = () => {
      if (recognition !== session) return;
      recognition = null;
      flushFinal();
      scheduleListening();
    };
    try { session.start(); } catch { fail('The microphone could not start. Check microphone access, then try again or type.'); }
  }

  return {
    get listening() { return wanted; },
    get supported() { return Boolean(Recognition); },
    start() {
      if (disposed) return false;
      wanted = true;
      if (!speaking) listen();
      return wanted;
    },
    pause() {
      wanted = false;
      speechVersion++;
      speaking = false;
      stopRecognition();
      clearFinal();
      globalThis.speechSynthesis?.cancel();
      onStatus('paused');
    },
    speak(text) {
      if (disposed || !text) return;
      const synth = globalThis.speechSynthesis;
      if (!synth || !globalThis.SpeechSynthesisUtterance) return;
      const version = ++speechVersion;
      speaking = true;
      clearFinal();
      // Stop recognition while replying so the assistant cannot confirm its own words.
      stopRecognition();
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = 'en-CA';
      utterance.rate = 1;
      const finish = () => {
        if (disposed || version !== speechVersion) return;
        speaking = false;
        onStatus(wanted ? 'waiting' : 'paused');
        scheduleListening();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      onStatus('speaking');
      try { synth.speak(utterance); } catch { finish(); }
    },
    dispose() {
      disposed = true;
      wanted = false;
      speechVersion++;
      clearFinal();
      stopRecognition();
      globalThis.speechSynthesis?.cancel();
    }
  };
}
