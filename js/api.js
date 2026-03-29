// ================================================================
// api.js  — Google Apps Script via JSONP (sin problemas de CORS)
// Compatible con URLs /exec y con URLs googleusercontent.com
// ================================================================
const API = (() => {

  let _data   = [];
  let _seeded = false;

  function gasUrl() { return (window.GAS_URL || '').trim(); }
  function isConfigured() {
    const u = gasUrl();
    return u.startsWith('https://script.google.com') ||
           u.startsWith('https://script.googleusercontent.com');
  }

  // Añade parámetros a una URL que puede o no tener ya '?'
  function buildUrl(params) {
    const base = gasUrl();
    const sep  = base.includes('?') ? '&' : '?';
    const qs   = Object.entries(params)
      .map(([k, v]) => encodeURIComponent(k) + '=' +
        encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v))
      .join('&');
    return base + sep + qs + '&_t=' + Date.now();
  }

  // ── JSONP ────────────────────────────────────────────────────
  function jsonp(params) {
    return new Promise((resolve, reject) => {
      const cbName = '_gcb' + Date.now() + Math.random().toString(36).slice(2);

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout — el script no respondió en 15s'));
      }, 15000);

      function cleanup() {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        clearTimeout(timer);
      }

      window[cbName] = (data) => { cleanup(); resolve(data); };

      const script    = document.createElement('script');
      script.src      = buildUrl({ ...params, callback: cbName });
      script.onerror  = () => { cleanup(); reject(new Error('Error de red — comprueba que el acceso es "Cualquier usuario"')); };
      document.head.appendChild(script);
    });
  }

  // ── Load ──────────────────────────────────────────────────────
  async function load() {
    if (!isConfigured()) {
      const res = await fetch('./data/inmuebles.json');
      if (!res.ok) throw new Error('No se encontró data/inmuebles.json');
      _data = await res.json();
      return _data;
    }

    const result = await jsonp({});
    if (!result.ok) throw new Error(result.error);
    _data = result.data || [];

    // Seed automático si el Sheet está vacío
    if (_data.length === 0 && !_seeded) {
      _seeded = true;
      try {
        const res      = await fetch('./data/inmuebles.json');
        const original = await res.json();
        if (original.length > 0) {
          const BATCH = 50;
          for (let i = 0; i < original.length; i += BATCH) {
            const batch  = original.slice(i, i + BATCH);
            const action = i === 0 ? 'seed' : 'seedAppend';
            const r      = await jsonp({ action, data: batch });
            if (!r.ok) throw new Error('Error seed: ' + r.error);
          }
          _data = original;
        }
      } catch (e) {
        console.warn('Seed no disponible:', e.message);
      }
    }
    return _data;
  }

  // ── CRUD ──────────────────────────────────────────────────────
  async function create(obj) {
    if (isConfigured()) {
      const r = await jsonp({ action: 'create', data: obj });
      if (!r.ok) throw new Error(r.error);
    }
    _data.push(obj);
    return _data;
  }

  async function update(obj) {
    if (isConfigured()) {
      const r = await jsonp({ action: 'update', data: obj });
      if (!r.ok) throw new Error(r.error);
    }
    const idx = _data.findIndex(p => p.id === obj.id);
    if (idx >= 0) _data[idx] = obj;
    return _data;
  }

  async function remove(id) {
    if (isConfigured()) {
      const r = await jsonp({ action: 'delete', data: { id } });
      if (!r.ok) throw new Error(r.error);
    }
    _data = _data.filter(p => p.id !== id);
    return _data;
  }

  function getAll() { return _data; }
  function init()   {}

  return { init, load, create, update, remove, getAll, isConfigured };
})();
