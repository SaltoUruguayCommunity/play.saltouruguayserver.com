/* SaltoPlay SDK v0.4 — popup OAuth PKCE / tab sessions / hosted MessageChannel. */
(function (global) {
  'use strict';
  if (global.SaltoPlay?.version === '0.4.0') return;
  const flowKey = state => 'saltoplay:oauth:' + state;
  const readStorage = key => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
  // The registered game callback loads this same SDK. Only the authorization
  // result returns to its opener; tokens are exchanged in the original game.
  const callbackQuery = new URLSearchParams(location.search);
  const callbackState = callbackQuery.get('state');
  const callbackFlow = callbackState && readStorage(flowKey(callbackState));
  if (callbackFlow?.mode === 'popup' && callbackFlow.state === callbackState &&
      callbackFlow.createdAt > Date.now() - 600000 &&
      new URL(callbackFlow.redirectUri).origin === location.origin &&
      new URL(callbackFlow.redirectUri).pathname === location.pathname &&
      (callbackQuery.has('code') || callbackQuery.has('error'))) {
    if (global.opener) global.opener.postMessage({ type: 'saltoplay:oauth-result', state: callbackState,
      code: callbackQuery.get('code'), error: callbackQuery.get('error') }, location.origin);
    sessionStorage.removeItem(flowKey(callbackState));
    callbackQuery.delete('code'); callbackQuery.delete('error'); callbackQuery.delete('state');
    history.replaceState(null, '', location.pathname + (callbackQuery.size ? '?' + callbackQuery : '') + location.hash);
    global.SaltoPlay = { version: '0.4.0', isOAuthCallback: true };
    if (global.opener) global.close();
    else {
      const message = document.createElement('p');
      message.textContent = 'No pudimos volver al juego desde esta ventana. Cerrala y reintentá el login usando redirección.';
      document.body.replaceChildren(message);
    }
    return;
  }
  // One isolated, dependency-free overlay per document, shared by SDK clients.
  function createUI() {
    const positions = ['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left'];
    let config = { enabled: true, welcome: true, position: 'bottom-center', duration: 5500 };
    let host, root, stack, current = null, timer = 0, started = 0, remaining = 0, sequence = 0;
    const queue = [], paused = new Set(), recent = new Map();
    const clean = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';
    const trophy = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/></svg>';
    const info = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v.1"/></svg>';
    const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';
    function stopTimer() {
      if (timer) { clearTimeout(timer); timer = 0; remaining = Math.max(0, remaining - (performance.now() - started)); }
      if (current) current.progress.style.animationPlayState = 'paused';
    }
    function startTimer() {
      if (!current || paused.size || timer) return;
      started = performance.now(); timer = setTimeout(dismiss, remaining);
      current.progress.style.animationPlayState = 'running';
    }
    function pause(reason) { paused.add(reason); stopTimer(); }
    function resume(reason) { paused.delete(reason); startTimer(); }
    function mount(event) {
      if (!host) return;
      // Popover's top layer can appear over a fullscreen canvas without altering it.
      const popover = typeof host.showPopover === 'function';
      const fullscreen = document.fullscreenElement;
      const container = !popover && fullscreen instanceof HTMLElement && !['CANVAS', 'VIDEO', 'IFRAME'].includes(fullscreen.tagName) ? fullscreen : document.body;
      if (!container) return;
      if (host.parentElement !== container) container.append(host);
      if (popover && current) {
        try {
          // Fullscreen is also a top-layer entry: lift an existing notice above it.
          if (event?.type === 'fullscreenchange' && host.matches(':popover-open')) host.hidePopover();
          if (!host.matches(':popover-open')) host.showPopover();
        } catch { /* z-index fallback for browsers restricting the top layer. */ }
      }
    }
    function ensure() {
      if (host) { mount(); return; }
      host = document.createElement('div'); host.setAttribute('data-saltoplay-ui', '');
      host.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483647;color-scheme:dark;';
      if (typeof host.showPopover === 'function') host.setAttribute('popover', 'manual');
      root = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `
        :host{all:initial;color-scheme:dark}:host::backdrop{background:transparent;pointer-events:none}
        *{box-sizing:border-box}.stack{position:absolute;bottom:max(24px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);width:min(390px,calc(100% - 32px));pointer-events:none}
        :host([data-position="bottom-right"]) .stack,:host([data-position="top-right"]) .stack{left:auto;right:max(16px,env(safe-area-inset-right));transform:none}
        :host([data-position="bottom-left"]) .stack,:host([data-position="top-left"]) .stack{left:max(16px,env(safe-area-inset-left));transform:none}
        :host([data-position^="top-"]) .stack{bottom:auto;top:max(24px,env(safe-area-inset-top))}
        .card{position:relative;display:grid;grid-template-columns:58px minmax(0,1fr) 28px;align-items:center;gap:16px;min-height:94px;padding:16px 20px 16px 16px;border:1px solid #ffffff12;border-radius:48px;background:#1c1b20;color:#f5f2fa;box-shadow:0 16px 48px #0008,0 2px 6px #0004;pointer-events:auto;font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;animation:sp-enter .7s cubic-bezier(.16,1,.3,1) both;overflow:hidden;text-align:left;letter-spacing:normal}
        .icon{position:relative;display:grid;place-items:center;width:58px;height:58px;overflow:hidden;border-radius:50%;background:#d0bcff;color:#342650;font-size:20px;font-weight:650;animation:sp-icon .75s cubic-bezier(.2,1.5,.4,1) both}.icon svg{width:30px;height:30px;display:block}.icon img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.card>div:not(.track),.close{animation:sp-content .65s ease both}
        .eyebrow{color:#cbc4d5;font-size:11px;line-height:1.5;font-weight:500;margin-bottom:3px}.title{margin:0;color:#f7f3fc;font-size:16px;line-height:1.3;font-weight:650;overflow-wrap:anywhere}.description{margin:4px 0 0;color:#c2bdc9;font-size:12px;line-height:1.4;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .detail{display:inline-block;margin:8px 0 0;padding:4px 10px;border-radius:100px;background:#ffffff0c;color:#ddd0f5;font-size:10px}.close{display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:transparent;color:#bcb6c6;cursor:pointer;font:22px/1 system-ui}.close:hover{color:#fff;background:#ffffff12}.close:focus-visible{outline:2px solid #d0bcff;outline-offset:3px}
        .track{position:absolute;width:0;height:0;overflow:hidden}.progress{animation:sp-time linear forwards;animation-play-state:paused}
        .card[data-tone="success"] .icon{background:#c3eacb;color:#153b25}.card[data-tone="error"] .icon{background:#ffdad6;color:#690005}.card[data-kind="welcome"] .icon{background:#d0bcff;color:#342650}.card[data-kind="welcome"] .eyebrow{color:#d0bcff}
        @keyframes sp-enter{0%{opacity:0;transform:translateY(16px) scale(.88);clip-path:inset(0 calc(50% - 46px) round 60px)}18%{opacity:1}100%{opacity:1;transform:translateY(0) scale(1);clip-path:inset(0 0 round 48px)}}@keyframes sp-icon{from{transform:scale(.65) rotate(-16deg)}to{transform:scale(1) rotate(0)}}@keyframes sp-content{0%,30%{opacity:0;transform:translateX(-8px)}100%{opacity:1;transform:translateX(0)}}@keyframes sp-time{to{transform:scaleX(0)}}
        @media(prefers-reduced-motion:reduce){.card,.icon,.card>div,.close,.progress{animation:none!important}}@media(max-width:420px){.card{gap:12px;padding:14px 14px 14px 12px;grid-template-columns:48px minmax(0,1fr) 24px;border-radius:36px;min-height:84px}.icon{width:48px;height:48px}.icon svg{width:26px;height:26px}.title{font-size:15px}.close{width:24px;height:24px}}
      `;
      stack = document.createElement('div'); stack.className = 'stack';
      stack.setAttribute('aria-live', 'polite'); stack.setAttribute('aria-atomic', 'true'); stack.setAttribute('role', 'status');
      root.append(style, stack); host.dataset.position = config.position; mount();
      document.addEventListener('fullscreenchange', mount);
      document.addEventListener('visibilitychange', () => document.hidden ? pause('hidden') : resume('hidden'));
    }
    function dismiss() {
      stopTimer(); current = null; paused.clear();
      if (stack) stack.replaceChildren();
      if (host && typeof host.hidePopover === 'function') { try { host.hidePopover(); } catch { /* Already closed. */ } }
      next();
    }
    function next() {
      if (current || !queue.length || !config.enabled) return;
      if (!document.body) { document.addEventListener('DOMContentLoaded', next, { once: true }); return; }
      ensure(); const item = queue.shift();
      const card = document.createElement('section'); card.className = 'card'; card.dataset.tone = item.tone;
      const icon = document.createElement('span'); icon.className = 'icon'; icon.innerHTML = item.achievement ? trophy : item.tone === 'success' ? check : info;
      if (item.welcome) {
        card.dataset.kind = 'welcome';
        icon.textContent = item.initials;
        if (item.avatar) {
          const avatar = document.createElement('img'); avatar.alt = ''; avatar.referrerPolicy = 'no-referrer';
          avatar.addEventListener('error', () => avatar.remove(), { once: true });
          avatar.src = item.avatar; icon.append(avatar);
        }
      }
      const content = document.createElement('div');
      const eyebrow = document.createElement('div'); eyebrow.className = 'eyebrow';
      const label = document.createElement('span'); label.textContent = item.achievement ? 'Logro desbloqueado' : 'SaltoPlay';
      eyebrow.append(label);
      const title = document.createElement('p'); title.className = 'title'; title.textContent = item.title;
      content.append(eyebrow, title);
      if (item.message) { const text = document.createElement('p'); text.className = 'description'; text.textContent = item.message; content.append(text); }
      if (item.detail) { const text = document.createElement('p'); text.className = 'detail'; text.textContent = item.detail; content.append(text); }
      const close = document.createElement('button'); close.type = 'button'; close.className = 'close'; close.textContent = '×'; close.setAttribute('aria-label', 'Cerrar notificación de SaltoPlay'); close.addEventListener('click', dismiss);
      const track = document.createElement('div'); track.className = 'track'; track.setAttribute('aria-hidden', 'true');
      const progress = document.createElement('div'); progress.className = 'progress'; progress.style.animationDuration = item.duration + 'ms'; track.append(progress);
      card.append(icon, content, close, track); stack.replaceChildren(card);
      card.addEventListener('pointerenter', () => pause('hover')); card.addEventListener('pointerleave', () => resume('hover'));
      card.addEventListener('focusin', () => pause('focus')); card.addEventListener('focusout', event => { if (!card.contains(event.relatedTarget)) resume('focus'); });
      current = { id: item.id, progress }; remaining = item.duration; paused.clear(); if (document.hidden) paused.add('hidden'); mount(); startTimer();
    }
    function enqueue(input, achievement, welcome = false) {
      if (!config.enabled) return null;
      const value = typeof input === 'string' ? { message: input } : input;
      if (!value || typeof value !== 'object') throw new Error('invalid_notification');
      const title = clean(value.title, 100) || (achievement ? 'Nuevo logro' : 'SaltoPlay');
      const message = clean(achievement ? value.description || value.message : value.message, 240);
      if (!achievement && !message && !clean(value.title, 100)) throw new Error('invalid_notification');
      const key = clean(value.id, 160);
      const now = Date.now(); for (const [key, time] of recent) if (now - time > 60000) recent.delete(key);
      if (key && recent.has(key)) return null;
      if (queue.length >= 20) return null;
      const id = key || 'saltoplay-ui-' + (++sequence);
      if (key) recent.set(key, now);
      const duration = typeof value.duration === 'number' && Number.isFinite(value.duration) ? Math.max(2500, Math.min(12000, value.duration)) : config.duration;
      // These are visual notices only; database rewards are granted by the API.
      const xp = typeof value.xp === 'number' && Number.isFinite(value.xp) ? Math.max(0, Math.min(1000000000, Math.floor(value.xp))) : 0;
      const detail = [value.demo === true ? 'Demo · Sin recompensas de cuenta' : '', clean(value.gameTitle, 80), achievement && xp > 0 ? '+' + xp + ' XP' : ''].filter(Boolean).join(' · ');
      let avatar = '';
      try { const url = new URL(value.avatar); if (url.protocol === 'https:') avatar = url.href; } catch { /* Initials remain available without a valid avatar. */ }
      const initials = Array.from(clean(value.tag || value.displayName, 100)).slice(0, 2).join('').toUpperCase();
      queue.push({ id, title, message, detail, achievement, welcome, avatar, initials, tone: ['info', 'success', 'error'].includes(value.tone) ? value.tone : 'info', duration }); next(); return id;
    }
    return {
      notify: value => enqueue(value, false),
      showAchievement: value => enqueue(value, true),
      showWelcome(value = {}, { once = false } = {}) {
        if (!config.welcome) return null;
        const tag = clean(value.tag, 100) || clean(value.displayName, 100);
        if (!tag) return null;
        // Automatic connection notices are deduplicated; explicit previews may repeat.
        return enqueue({ ...value, id: once ? 'welcome:' + (clean(value.id, 100) || tag) : '', title: 'Bienvenido, ' + tag, message: 'Tu cuenta está conectada. A jugar.', tone: 'success' }, false, true);
      },
      configure(value = {}) {
        if (!value || typeof value !== 'object') throw new Error('invalid_ui_configuration');
        if (typeof value.enabled === 'boolean') config.enabled = value.enabled;
        if (typeof value.welcome === 'boolean') config.welcome = value.welcome;
        if (positions.includes(value.position)) config.position = value.position;
        if (typeof value.duration === 'number' && Number.isFinite(value.duration)) config.duration = Math.max(2500, Math.min(12000, value.duration));
        if (host) host.dataset.position = config.position;
        if (!config.enabled) { queue.length = 0; dismiss(); }
        return { ...config };
      },
      dismissAll() { queue.length = 0; dismiss(); return true; },
    };
  }
  const ui = createUI();
  const random = () => { const b = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); };
  async function challenge(value) { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
  async function init(options = {}) {
    if (options.ui) ui.configure(options.ui);
    let call, close = () => {}, closed = false;
    const hosted = global.parent !== global && options.transport !== 'external';
    if (hosted) {
      const parentOrigin = options.portalOrigin || (document.referrer ? new URL(document.referrer).origin : null);
      if (!parentOrigin) throw new Error('portal_origin_required');
      const port = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { cleanup(); reject(new Error('bridge_timeout')); }, 12000);
        const ready = () => global.parent.postMessage({ type: 'saltoplay:ready', version: 1 }, parentOrigin);
        const interval = setInterval(ready, 400);
        function cleanup() { clearTimeout(timeout); clearInterval(interval); global.removeEventListener('message', receive); }
        function receive(event) { if (event.origin !== parentOrigin || event.source !== global.parent || event.data?.type !== 'saltoplay:connect' || event.data.version !== 1 || !event.ports[0]) return; cleanup(); resolve(event.ports[0]); }
        global.addEventListener('message', receive); ready();
      });
      const pending = new Map();
      port.onmessage = ({ data }) => { const task = pending.get(data?.id); if (!task) return; clearTimeout(task.timeout); pending.delete(data.id); data.error ? task.reject(Object.assign(new Error(data.error.message || data.error.code), { code: data.error.code })) : task.resolve(data.result); };
      call = (method, params) => new Promise((resolve, reject) => { if (closed) { reject(new Error('bridge_closed')); return; } const id = random(); const timeout = setTimeout(() => { pending.delete(id); reject(new Error('request_timeout')); }, 10000); pending.set(id, { resolve, reject, timeout }); port.postMessage({ id, method, params }); });
      close = () => { closed = true; port.close(); for (const p of pending.values()) { clearTimeout(p.timeout); p.reject(new Error('bridge_closed')); } pending.clear(); };
    } else {
      const base = (options.apiOrigin || 'https://play.saltouruguayserver.com').replace(/\/$/, '');
      const sessionKey = 'saltoplay:session:' + JSON.stringify([base, options.clientId, options.redirectUri]);
      const saved = options.persistence === 'memory' ? null : readStorage(sessionKey);
      let token = options.accessToken || saved?.accessToken;
      let refreshToken = options.accessToken ? null : saved?.refreshToken;
      let expiresAt = options.accessToken ? Infinity : saved?.expiresAt || 0;
      let renewal, loginTask, cancelLogin;
      let sessionEpoch = 0;
      function persist() {
        if (options.persistence === 'memory' || options.accessToken) return;
        try {
          if (token) sessionStorage.setItem(sessionKey, JSON.stringify({ accessToken: token, refreshToken, expiresAt }));
          else sessionStorage.removeItem(sessionKey);
        } catch { /* Storage can be disabled; the in-memory session still works. */ }
      }
      function clearSession() { token = null; refreshToken = null; expiresAt = 0; persist(); }
      async function exchange(params) {
        const epoch = sessionEpoch;
        const response = await fetch(base + '/oauth/token', { method: 'POST', body: new URLSearchParams({ client_id: options.clientId, ...params }) });
        const result = await response.json();
        if (!response.ok) throw Object.assign(new Error(result.error || 'oauth_exchange_failed'), { code: result.error });
        if (closed || epoch !== sessionEpoch) throw new Error('auth_cancelled');
        if (typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new Error('invalid_token_response');
        token = result.access_token; refreshToken = result.refresh_token || null;
        expiresAt = Date.now() + result.expires_in * 1000; persist();
      }
      async function ensureToken() {
        if (!token || expiresAt > Date.now() + 30000) return;
        if (!refreshToken) { clearSession(); return; }
        if (!renewal) renewal = exchange({ grant_type: 'refresh_token', refresh_token: refreshToken })
          .catch(error => { if (['invalid_grant', 'invalid_client'].includes(error.code)) clearSession(); throw error; })
          .finally(() => { renewal = null; });
        try { await renewal; } catch (error) {
          if (!['invalid_grant', 'invalid_client'].includes(error.code)) throw error;
        }
      }
      const query = new URLSearchParams(location.search);
      if (query.has('code') || query.has('error')) {
        const key = flowKey(query.get('state'));
        const flow = readStorage(key); sessionStorage.removeItem(key);
        if (!flow) throw new Error('oauth_state_missing');
        if (flow.state !== query.get('state') || flow.clientId !== options.clientId || flow.apiOrigin !== base || flow.redirectUri !== options.redirectUri || flow.createdAt < Date.now() - 600000) throw new Error('oauth_state_mismatch');
        const code = query.get('code'), error = query.get('error'); query.delete('code'); query.delete('state'); query.delete('error'); history.replaceState(null, '', location.pathname + (query.size ? '?' + query : '') + location.hash);
        if (error) throw new Error(error);
        await exchange({ grant_type: 'authorization_code', code, code_verifier: flow.verifier, redirect_uri: flow.redirectUri });
      }
      function login() {
        if (loginTask) return loginTask;
        if (!options.clientId || !options.redirectUri) return Promise.reject(new Error('oauth_configuration_required'));
        const mode = options.loginMode || 'redirect';
        const redirectOrigin = new URL(options.redirectUri).origin;
        if (mode === 'popup' && redirectOrigin !== location.origin) return Promise.reject(new Error('popup_callback_origin_mismatch'));
        const verifier = random(), state = random(), key = flowKey(state);
        const flow = { verifier, state, clientId: options.clientId, redirectUri: options.redirectUri, apiOrigin: base, createdAt: Date.now(), mode };
        try { sessionStorage.setItem(key, JSON.stringify(flow)); } catch { return Promise.reject(new Error('oauth_storage_unavailable')); }
        // Open synchronously in the click handler, before the async PKCE digest.
        const popup = mode === 'popup' ? global.open('about:blank', '_blank', 'popup,width=520,height=720') : null;
        if (mode === 'popup' && !popup) { sessionStorage.removeItem(key); return Promise.reject(new Error('popup_blocked')); }
        loginTask = new Promise((resolve, reject) => {
          let finished = false, interval, timeout;
          const cleanup = () => {
            clearInterval(interval); clearTimeout(timeout);
            global.removeEventListener('message', receive);
            sessionStorage.removeItem(key); cancelLogin = null;
          };
          const fail = error => { if (finished) return; finished = true; cleanup(); popup?.close(); reject(error); };
          cancelLogin = () => fail(new Error('auth_cancelled'));
          async function receive(event) {
            if (event.origin !== redirectOrigin || event.source !== popup || event.data?.type !== 'saltoplay:oauth-result' || event.data.state !== state || finished) return;
            if (typeof event.data.error !== 'string' && typeof event.data.code !== 'string') return;
            finished = true; cleanup(); popup.close();
            try {
              if (event.data.error) throw new Error(event.data.error);
              await exchange({ grant_type: 'authorization_code', code: event.data.code, code_verifier: verifier, redirect_uri: flow.redirectUri });
              resolve({ authenticated: true, transport: 'external' });
            } catch (error) { reject(error); }
          }
          if (popup) {
            global.addEventListener('message', receive);
            interval = setInterval(() => { if (popup.closed) fail(new Error('popup_closed')); }, 500);
            timeout = setTimeout(() => fail(new Error('popup_timeout')), 600000);
          }
          challenge(verifier).then(digest => {
            if (finished) return;
            const url = new URL(base + '/oauth/authorize');
            url.search = new URLSearchParams({ client_id: options.clientId, redirect_uri: options.redirectUri, response_type: 'code', code_challenge: digest, code_challenge_method: 'S256', state, scope: (options.scopes || ['profile:read', 'saltotag:read']).join(' ') }).toString();
            if (popup) popup.location.href = url.toString();
            else { location.assign(url); resolve(); }
          }).catch(fail);
        }).finally(() => { loginTask = null; });
        return loginTask;
      }
      close = () => { closed = true; sessionEpoch++; cancelLogin?.(); };
      call = async (method, params = {}) => {
        if (closed) throw new Error('client_destroyed');
        if (method === 'session.get') { await ensureToken(); return { authenticated: Boolean(token), transport: 'external' }; }
        if (method === 'auth.login') {
          return login();
        }
        if (method === 'auth.logout') { sessionEpoch++; cancelLogin?.(); clearSession(); return; }
        const routes = { 'player.getProfile': ['GET', '/me'], 'player.getSaltoTag': ['GET', '/me/saltotag'], 'achievements.list': ['GET', '/achievements'], 'achievements.requestUnlock': ['POST', '/achievements/unlock'], 'saves.get': ['GET', '/saves/' + encodeURIComponent(params.slot)], 'saves.set': ['PUT', '/saves/' + encodeURIComponent(params.slot)] };
        const route = routes[method]; if (!route) throw new Error('unsupported_method');
        await ensureToken();
        if (!token) throw Object.assign(new Error('invalid_token'), { code: 'invalid_token' });
        const requestToken = token;
        const response = await fetch(base + '/api/v1' + route[1], { method: route[0], headers: { Authorization: 'Bearer ' + requestToken, 'Content-Type': 'application/json' }, ...(route[0] !== 'GET' ? { body: JSON.stringify(params) } : {}) });
        const result = await response.json(); if (!response.ok) { if (response.status === 401 && token === requestToken) clearSession(); throw Object.assign(new Error(result.message || result.error), { code: result.error }); } return result;
      };
    }
    if (hosted && options.ui) await call('ui.configure', options.ui);
    const versions = new Map();
    let identityEpoch = 0;
    // Identity comes from the authorized API, never from game-provided greeting text.
    // Missing profile scopes must not prevent a game from initializing.
    async function showWelcome() {
      const welcomeEpoch = identityEpoch;
      const session = await call('session.get');
      if (!session.authenticated || options.ui?.welcome === false) return;
      const [tag, profile] = await Promise.all([
        call('player.getSaltoTag').catch(() => null),
        call('player.getProfile').catch(() => null),
      ]);
      if (closed || identityEpoch !== welcomeEpoch || (!tag && !profile)) return;
      const identity = { ...profile, ...tag, avatar: profile?.avatar };
      if (hosted) await call('ui.welcome', identity);
      else ui.showWelcome(identity, { once: true });
    }
    void showWelcome().catch(() => { /* Welcome is optional and never blocks authentication. */ });
    return {
      player: { getProfile: () => call('player.getProfile'), getSaltoTag: () => call('player.getSaltoTag') },
      achievements: {
        list: () => call('achievements.list'),
        requestUnlock: async key => {
          const result = await call('achievements.requestUnlock', { key });
          if (!hosted && result.newlyUnlocked === true) {
            try { ui.showAchievement({ id: 'achievement:' + (options.clientId || '') + ':' + key, title: result.achievement?.title || key, description: result.achievement?.description, gameTitle: result.gameTitle, xp: result.xp, demo: result.demo }); } catch { /* UI must not turn a successful unlock into an error. */ }
          }
          return result;
        },
      },
      saves: {
        get: async slot => { const r = await call('saves.get', { slot }); versions.set(slot, r.version); return r.data; },
        set: async (slot, data) => { if (!versions.has(slot)) { const current = await call('saves.get', { slot }); versions.set(slot, current.version); } const r = await call('saves.set', { slot, data, version: versions.get(slot) }); versions.set(slot, r.version); return r; },
      },
      auth: {
        getSession: () => call('session.get'),
        login: async () => {
          const result = await call(hosted ? 'session.get' : 'auth.login');
          void showWelcome().catch(() => {});
          return result;
        },
        logout: () => { identityEpoch++; return hosted ? Promise.resolve(close()) : call('auth.logout'); },
      },
      ui: {
        notify: async value => hosted ? call('ui.notify', typeof value === 'string' ? { message: value } : value) : ui.notify(value),
        showAchievement: async value => hosted ? call('ui.achievement', value) : ui.showAchievement(value),
        configure: async value => hosted ? call('ui.configure', value) : ui.configure(value),
        dismissAll: async () => hosted ? call('ui.dismissAll') : ui.dismissAll(),
      },
      destroy: () => { identityEpoch++; close(); },
    };
  }
  global.SaltoPlay = { init, ui, version: '0.4.0', isOAuthCallback: false };
})(window);
