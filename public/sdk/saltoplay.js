/* SaltoPlay SDK v0.1 — hosted MessageChannel / external OAuth PKCE. */
(function (global) {
  'use strict';
  const random = () => { const b = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); };
  async function challenge(value) { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
  async function init(options = {}) {
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
      let token = options.accessToken;
      const query = new URLSearchParams(location.search);
      if (query.has('code') || query.has('error')) {
        const raw = sessionStorage.getItem('saltoplay:oauth'); sessionStorage.removeItem('saltoplay:oauth');
        if (!raw) throw new Error('oauth_state_missing');
        const flow = JSON.parse(raw);
        if (flow.state !== query.get('state') || flow.clientId !== options.clientId || flow.apiOrigin !== base || flow.createdAt < Date.now() - 600000) throw new Error('oauth_state_mismatch');
        const code = query.get('code'), error = query.get('error'); query.delete('code'); query.delete('state'); query.delete('error'); history.replaceState(null, '', location.pathname + (query.size ? '?' + query : '') + location.hash);
        if (error) throw new Error(error);
        const response = await fetch(base + '/oauth/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: options.clientId, code, code_verifier: flow.verifier, redirect_uri: flow.redirectUri }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error); token = result.access_token;
        // Access tokens stay in memory. Browser SDK does not persist refresh tokens.
      }
      call = async (method, params = {}) => {
        if (method === 'session.get') return { authenticated: Boolean(token), transport: 'external' };
        if (method === 'auth.login') {
          if (!options.clientId || !options.redirectUri) throw new Error('oauth_configuration_required');
          const verifier = random(), state = random(); sessionStorage.setItem('saltoplay:oauth', JSON.stringify({ verifier, state, clientId: options.clientId, redirectUri: options.redirectUri, apiOrigin: base, createdAt: Date.now() }));
          const url = new URL(base + '/oauth/authorize'); url.search = new URLSearchParams({ client_id: options.clientId, redirect_uri: options.redirectUri, response_type: 'code', code_challenge: await challenge(verifier), code_challenge_method: 'S256', state, scope: (options.scopes || ['profile:read', 'saltotag:read']).join(' ') }).toString(); location.assign(url); return;
        }
        if (method === 'auth.logout') { token = null; return; }
        const routes = { 'player.getProfile': ['GET', '/me'], 'player.getSaltoTag': ['GET', '/me/saltotag'], 'achievements.list': ['GET', '/achievements'], 'achievements.requestUnlock': ['POST', '/achievements/unlock'], 'saves.get': ['GET', '/saves/' + encodeURIComponent(params.slot)], 'saves.set': ['PUT', '/saves/' + encodeURIComponent(params.slot)] };
        const route = routes[method]; if (!route) throw new Error('unsupported_method');
        const response = await fetch(base + '/api/v1' + route[1], { method: route[0], headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(route[0] !== 'GET' ? { body: JSON.stringify(params) } : {}) });
        const result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.message || result.error), { code: result.error }); return result;
      };
    }
    const versions = new Map();
    return { player: { getProfile: () => call('player.getProfile'), getSaltoTag: () => call('player.getSaltoTag') }, achievements: { list: () => call('achievements.list'), requestUnlock: key => call('achievements.requestUnlock', { key }) }, saves: { get: async slot => { const r = await call('saves.get', { slot }); versions.set(slot, r.version); return r.data; }, set: async (slot, data) => { if (!versions.has(slot)) { const current = await call('saves.get', { slot }); versions.set(slot, current.version); } const r = await call('saves.set', { slot, data, version: versions.get(slot) }); versions.set(slot, r.version); return r; } }, auth: { getSession: () => call('session.get'), login: () => call(hosted ? 'session.get' : 'auth.login'), logout: () => hosted ? Promise.resolve(close()) : call('auth.logout') }, ui: { notify: message => call('ui.notify', { message }) }, destroy: close };
  }
  global.SaltoPlay = { init, version: '0.1.0' };
})(window);
