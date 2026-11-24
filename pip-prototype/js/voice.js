/* Thin wrapper over the Web Speech API: speech recognition in, speech synthesis out. */
(function (root) {
  "use strict";

  const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition;
  const synth = root.speechSynthesis;
  const canSpeak = Boolean(synth && root.SpeechSynthesisUtterance);
  const canListen = Boolean(Recognition);

  let voice = null;
  function pickVoice() {
    if (!canSpeak) return;
    const voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
    voice = voices.find((v) => /en-CA/i.test(v.lang))
      || voices.find((v) => /Google US English/i.test(v.name))
      || voices.find((v) => /Samantha|Aria|Jenny|Zira/i.test(v.name))
      || voices.find((v) => /en-US/i.test(v.lang))
      || voices[0] || null;
  }
  if (canSpeak) {
    pickVoice();
    synth.addEventListener?.("voiceschanged", pickVoice);
  }

  /* ---------- speaking ---------- */

  let utterance = null;
  let safety = null;

  function cancelSpeech() {
    if (utterance) {
      utterance.onend = utterance.onerror = utterance.onstart = null;
      utterance = null;
    }
    clearTimeout(safety);
    if (canSpeak) synth.cancel();
  }

  function speak(text, { onstart, onend } = {}) {
    cancelSpeech();
    if (!canSpeak) { onend?.(); return; }
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : "en-CA";
    u.rate = 1.04;
    u.pitch = 1.15;
    let finished = false;
    const finish = () => {
      if (finished || utterance !== u) return;
      finished = true;
      utterance = null;
      clearTimeout(safety);
      onend?.();
    };
    u.onstart = () => onstart?.();
    u.onend = finish;
    u.onerror = finish;
    utterance = u;
    synth.speak(u);
    // Chrome occasionally never fires onend; don't leave Pip stuck mid-sentence.
    safety = setTimeout(finish, 2500 + text.length * 85);
  }

  /* ---------- listening ---------- */

  let session = null;

  function listen(handlers) {
    cancelListening();
    const rec = new Recognition();
    rec.lang = "en-CA";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    session = rec;
    let gotFinal = false;

    rec.onresult = (event) => {
      if (session !== rec) return;
      let interim = "";
      let final = "";
      let confidence = 1;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
          confidence = result[0].confidence;
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) handlers.oninterim?.(interim.trim());
      if (final) {
        gotFinal = true;
        handlers.onfinal?.(final.trim(), confidence);
      }
    };
    rec.onspeechend = () => { if (session === rec) handlers.onprocessing?.(); };
    rec.onerror = (event) => {
      if (session === rec && event.error !== "aborted") handlers.onerror?.(event.error);
    };
    rec.onend = () => {
      if (session !== rec) return;
      session = null;
      handlers.onend?.(gotFinal);
    };

    try {
      rec.start();
    } catch {
      session = null;
      handlers.onerror?.("start-failed");
      handlers.onend?.(false);
    }
  }

  /** Stop listening but keep whatever was already heard. */
  function finishListening() {
    if (session) session.stop();
  }

  /** Stop listening and throw away the result without calling handlers. */
  function cancelListening() {
    if (!session) return;
    const rec = session;
    session = null;
    rec.abort();
  }

  root.PipVoice = {
    canSpeak, canListen, speak, cancelSpeech, listen, finishListening, cancelListening,
    isListening: () => Boolean(session),
  };
})(window);
