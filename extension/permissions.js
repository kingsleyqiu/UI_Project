const button = document.querySelector('#allow');
const status = document.querySelector('#status');

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Waiting for microphone permission…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    for (const track of stream.getTracks()) track.stop();
    status.textContent = 'Microphone access is ready. Return to Domino’s Canada and choose Start listening in the assistant.';
    button.textContent = 'Check microphone again';
  } catch {
    status.textContent = 'Microphone access was not granted or no microphone is available. Check Chrome’s microphone permission and your device, then try again. You can still type in the assistant.';
  } finally {
    button.disabled = false;
  }
});
