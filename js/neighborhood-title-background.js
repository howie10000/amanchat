/* Keep town generation and WebGL compilation away from login input handling. */
(function () {
  'use strict';
  const scriptUrl = document.currentScript.src;
  const login = document.getElementById('loginScreen'), canvas = document.getElementById('titleBg');
  if (!login || !canvas) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let worker = null, timer = null, metrics = {};
  const state = () => ({ type: 'state', width: canvas.clientWidth || innerWidth,
    height: canvas.clientHeight || innerHeight, hidden: document.hidden,
    loginHidden: login.classList.contains('hidden'), reduced: reduced.matches,
    typing: !!(document.activeElement && login.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) });
  const send = value => { if (worker) worker.postMessage(value); };
  const sync = () => send(state());
  function fallback() {
    clearTimeout(timer);
    if (worker) worker.terminate();
    worker = null;
    canvas.classList.remove('ready');
    login.classList.remove('nb-ready');
    login.classList.add('nb-static');
    // Never retry expensive generation on the UI thread if worker WebGL is unavailable.
  }
  window.titleBg = { start: sync, metrics: () => { send({ type: 'metrics' }); return { ...metrics, worker: !!worker }; },
    seek: t => send({ type: 'seek', t }) };
  if (!window.Worker || !canvas.transferControlToOffscreen) { fallback(); return; }
  try {
    worker = new Worker(new URL('neighborhood-title-worker.js?v=nb-worker-1', scriptUrl));
    worker.onerror = fallback;
    worker.onmessage = ({ data }) => {
      if (!worker) return;
      if (data.type === 'fallback' || data.type === 'settled') { fallback(); return; }
      if (data.type === 'metrics') metrics = data.value || {};
      if (data.type === 'class') {
        const target = data.target === 'canvas' ? canvas : login;
        target.classList[data.add ? 'add' : 'remove'](data.name);
        if (data.name === 'ready' && data.add) clearTimeout(timer);
      }
    };
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ ...state(), type: 'init', canvas: offscreen }, [offscreen]);
    timer = setTimeout(fallback, 45000);
  } catch (_) { fallback(); return; }
  addEventListener('resize', sync);
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('focusin', sync);
  document.addEventListener('focusout', () => setTimeout(sync, 0));
  reduced.addEventListener('change', sync);
  new MutationObserver(sync).observe(login, { attributes: true, attributeFilter: ['class'] });
})();
