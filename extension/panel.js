export function createPanel(callbacks = {}) {
  const host = document.createElement('div');
  host.id = 'pizza-avatar-assistant';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host{all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;color:#183d3d;font:14px/1.45 system-ui,-apple-system,sans-serif}
      *,*::before,*::after{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled,input:disabled{opacity:.55;cursor:default}
      button:focus-visible,input:focus-visible{outline:3px solid #d87528;outline-offset:3px}[hidden]{display:none!important}
      .panel{width:min(390px,calc(100vw - 32px));max-height:min(660px,calc(100dvh - 118px));display:flex;flex-direction:column;margin-bottom:12px;background:#fffdf8;border:1px solid #d8dfd8;border-radius:20px;box-shadow:0 12px 48px #17352e30;overflow:hidden}
      header{display:flex;align-items:center;gap:10px;padding:15px 16px;background:#183d3d;color:#fffdf8}header img{width:45px;height:45px}h2{margin:0;font-size:17px;font-weight:750}header p{margin:2px 0 0;font-size:12px;color:#dbe9df}
      .icon-button{background:transparent;border:1px solid #ffffff55;color:inherit;border-radius:8px;padding:5px 9px;min-width:32px;min-height:32px}.collapse{margin-left:auto;font-size:20px}
      .status{padding:8px 16px;background:#edf3ed;font-size:12px;border-bottom:1px solid #d8dfd8}.status strong{font-weight:700}.status-detail{margin-left:6px;color:#425b55}
      .body{overflow:auto;overscroll-behavior:contain;padding:14px 16px;min-height:130px;scrollbar-width:thin}.messages{display:flex;flex-direction:column;gap:10px}.message{max-width:94%;margin:0;padding:10px 12px;border-radius:13px;background:#eef2ed;white-space:pre-wrap;overflow-wrap:anywhere}.message.user{align-self:flex-end;background:#183d3d;color:#fff}.message strong{display:block;margin-bottom:3px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.75}.message.system{background:#fff0d7}
      .order{margin-top:14px;padding:12px;border:1px solid #d8dfd8;border-radius:12px;background:#fff}.order h3,.pending h3{font-size:13px;margin:0 0 8px}.order dl{margin:0;display:grid;grid-template-columns:80px 1fr;gap:4px 10px;font-size:12px}.order dt{color:#5b6c65}.order dd{margin:0;overflow-wrap:anywhere}
      .pending,.recovery{margin-top:12px;padding:12px;background:#fff1dc;border:1px solid #edcf9c;border-radius:12px}.pending p,.recovery p{margin:0 0 10px;white-space:pre-wrap;overflow-wrap:anywhere}.actions{display:flex;gap:7px;flex-wrap:wrap}.actions button,.secondary{padding:7px 11px;border:1px solid #afbeb3;border-radius:9px;background:#fffdf8;color:#183d3d;min-height:36px}.actions .primary{background:#b83925;border-color:#b83925;color:#fff}
      .heard{margin-top:12px;font-size:12px;color:#52665c;overflow-wrap:anywhere}.heard button{margin-left:6px;border:0;background:none;color:#90331f;text-decoration:underline;padding:3px}
      form{padding:12px 16px 8px;display:flex;gap:7px;border-top:1px solid #e2e6df}input{min-width:0;flex:1;padding:10px 11px;border:1px solid #aebcb2;border-radius:10px;background:#fff;color:#183d3d}form button{padding:9px 12px;border:0;border-radius:10px;background:#183d3d;color:#fff;font-weight:650}
      .tools{padding:0 16px 13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tools button{font-size:12px}.cancel{margin-left:auto;background:none;border:0;color:#6d5146;text-decoration:underline;padding:8px 2px}.footer{padding:0 16px 12px;color:#64746b;font-size:10px}
      .launcher-row{display:flex;justify-content:flex-end;align-items:center;gap:8px}.launcher{display:flex;align-items:center;gap:9px;background:#183d3d;color:#fffdf8;border:2px solid #fffdf8;border-radius:40px;padding:5px 16px 5px 5px;box-shadow:0 5px 22px #17352e30;text-align:left;min-height:64px}.launcher img{width:52px;height:52px}.launcher strong{display:block;font-size:14px}.launcher small{display:flex;gap:5px;align-items:center;font-size:11px;color:#dce9df}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#a5b8ae}.live .dot{background:#a7e8b5;box-shadow:0 0 0 3px #a7e8b525;animation:pulse 1.7s infinite}.quick-pause{background:#fffdf8;border:1px solid #b9c9bf;border-radius:24px;color:#183d3d;padding:10px 13px;box-shadow:0 3px 12px #17352e20}
      @keyframes pulse{50%{box-shadow:0 0 0 6px #a7e8b510}}@media(prefers-reduced-motion:reduce){.live .dot{animation:none}}@media(max-width:460px){:host{right:12px;bottom:12px}.panel{max-height:calc(100dvh - 104px)}}
    </style>
    <section class="panel" role="region" aria-label="Pizza assistant conversation">
      <header><img class="portrait" alt="Friendly pizza shop assistant"><div><h2>Pizza Assistant</h2><p>Choose your pizza. You stay in control.</p></div><button class="icon-button collapse" type="button" aria-label="Collapse conversation">−</button></header>
      <div class="status" role="status"><strong class="status-name">Ready</strong><span class="status-detail">Start speaking or type a request.</span></div>
      <div class="body"><div class="messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"></div>
        <section class="order" aria-label="Current pizza configuration" hidden><h3>Your pizza</h3><dl></dl></section>
        <div class="heard" hidden><span></span><button type="button">Edit text</button></div>
        <section class="pending" aria-label="Confirm instruction" hidden><h3>Please confirm</h3><p></p><div class="actions"><button class="primary confirm" type="button">Yes, confirm</button><button class="revise" type="button">No, revise</button></div></section>
        <section class="recovery" aria-label="Operation paused" hidden><p></p><div class="actions"><button class="retry" type="button">Retry</button><button class="takeover" type="button">I'll do it myself</button></div></section>
      </div>
      <form><input aria-label="Type an English pizza request" placeholder="Type a request in English…" maxlength="600" autocomplete="off"><button type="submit">Send</button></form>
      <div class="tools"><button class="secondary microphone" type="button">Start listening</button><button class="cancel" type="button">Cancel this order</button></div>
      <div class="footer">Review every instruction before it changes the website. Payment stays with you.</div>
    </section>
    <div class="launcher-row"><button class="quick-pause" type="button" hidden aria-label="Pause microphone">Pause mic</button><button class="launcher" type="button" aria-expanded="true" aria-label="Collapse Pizza Assistant"><img class="portrait" alt=""><span><strong>Pizza Assistant</strong><small><i class="dot" aria-hidden="true"></i><span class="launcher-status">Mic paused</span></small></span></button></div>`;

  document.documentElement.append(host);
  host.addEventListener('click', event => event.stopPropagation());
  host.addEventListener('keydown', event => event.stopPropagation());
  const find = selector => shadow.querySelector(selector);
  const panel = find('.panel');
  const body = find('.body');
  const input = find('input');
  const launcher = find('.launcher');
  const mic = find('.microphone');
  const quickPause = find('.quick-pause');
  const pending = find('.pending');
  const recovery = find('.recovery');
  const messages = find('.messages');
  let listening = false;
  let status = 'ready';
  let transcript = '';
  let busy = false;
  let hasPending = false;
  const statusNames = { ready: 'Ready', waiting: 'Waiting', listening: 'Listening', processing: 'Processing', speaking: 'Speaking', paused: 'Paused', error: 'Paused', complete: 'Ready for checkout' };

  for (const portrait of shadow.querySelectorAll('.portrait')) portrait.src = new URL('./avatar.svg', import.meta.url).href;

  function expand(open) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    launcher.setAttribute('aria-label', open ? 'Collapse Pizza Assistant' : 'Open Pizza Assistant');
    if (open) input.focus({ preventScroll: true });
  }

  function renderMic() {
    launcher.classList.toggle('live', listening && status !== 'speaking');
    find('.launcher-status').textContent = status === 'speaking' ? 'Speaking · mic paused' : listening ? 'Listening' : 'Mic paused';
    mic.textContent = listening ? 'Pause listening' : 'Start listening';
    mic.setAttribute('aria-pressed', String(listening));
    quickPause.hidden = !listening;
  }

  launcher.addEventListener('click', () => expand(panel.hidden));
  find('.collapse').addEventListener('click', () => { expand(false); launcher.focus(); });
  mic.addEventListener('click', () => listening ? callbacks.onPause?.() : callbacks.onListen?.());
  quickPause.addEventListener('click', () => callbacks.onPause?.());
  find('.confirm').addEventListener('click', () => callbacks.onConfirm?.());
  find('.revise').addEventListener('click', () => { callbacks.onReject?.(); input.focus(); });
  find('.retry').addEventListener('click', () => callbacks.onRetry?.());
  find('.takeover').addEventListener('click', () => callbacks.onTakeover?.());
  find('.cancel').addEventListener('click', () => callbacks.onCancel?.());
  find('.heard button').addEventListener('click', () => { input.value = transcript; input.focus(); });
  find('form').addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (text && !busy) { input.value = ''; callbacks.onSubmit?.(text); }
  });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); expand(false); launcher.focus(); }
  });

  return {
    addMessage(role, text) {
      const entry = document.createElement('p');
      entry.className = `message ${role === 'user' ? 'user' : role === 'system' ? 'system' : 'assistant'}`;
      const label = document.createElement('strong');
      label.textContent = role === 'user' ? 'You' : role === 'system' ? 'Notice' : 'Pizza Assistant';
      const content = document.createElement('span');
      content.textContent = text;
      entry.append(label, content);
      messages.append(entry);
      while (messages.children.length > 40) messages.firstElementChild.remove();
      body.scrollTop = body.scrollHeight;
    },
    setStatus(next, detail = '') {
      status = next;
      find('.status-name').textContent = statusNames[next] || next;
      find('.status-detail').textContent = detail;
      renderMic();
    },
    setListening(value) { listening = Boolean(value); renderMic(); },
    setTranscript(text) {
      transcript = String(text || '');
      find('.heard').hidden = !transcript;
      find('.heard span').textContent = `Heard: ${transcript}`;
    },
    setPending(summary) {
      hasPending = Boolean(summary);
      pending.hidden = !hasPending;
      find('.pending p').textContent = summary || '';
      find('.confirm').disabled = busy || !hasPending;
      recovery.hidden = true;
      if (hasPending) { expand(true); body.scrollTop = body.scrollHeight; find('.confirm').focus({ preventScroll: true }); }
    },
    setOrder(order) {
      const box = find('.order');
      box.hidden = !order;
      const list = find('.order dl');
      list.replaceChildren();
      if (!order) return;
      const rows = [['Pizza', order.product], ['Size', order.size], ['Crust', order.crust], ['Toppings', Array.isArray(order.toppings) ? order.toppings.join(', ') || 'No extra toppings' : null], ['Quantity', order.quantity], ['Sauce', typeof order.sauce === 'boolean' ? order.sauce ? 'Included' : 'Removed' : null], ['Cheese', typeof order.cheese === 'boolean' ? order.cheese ? 'Included' : 'Removed' : null]];
      for (const [name, value] of rows) {
        if (value === null || value === undefined || value === '') continue;
        const term = document.createElement('dt');
        const description = document.createElement('dd');
        term.textContent = name;
        description.textContent = String(value);
        list.append(term, description);
      }
    },
    setBusy(value) {
      busy = Boolean(value);
      input.disabled = busy;
      find('form button').disabled = busy;
      find('.confirm').disabled = busy || !hasPending;
      find('.revise').disabled = busy;
      find('.retry').disabled = busy;
    },
    showRecovery(message) {
      pending.hidden = true;
      hasPending = false;
      recovery.hidden = false;
      find('.recovery p').textContent = message;
      expand(true);
      body.scrollTop = body.scrollHeight;
    },
    destroy() { host.remove(); }
  };
}
