(() => {
  if (globalThis.__pizzaAssistantLoaded) return;
  globalThis.__pizzaAssistantLoaded = true;
  import(chrome.runtime.getURL('content.js')).catch(() => {
    console.error('Pizza Assistant could not load. Reload the extension and this page.');
  });
})();
