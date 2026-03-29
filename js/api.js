// ================================================================
// api.js  — Google Apps Script via JSONP (sin problemas de CORS)
// ================================================================
const API = (() => {

  let _data   = [];
  let _seeded = false;

  function gasUrl() { return (window.GAS_URL || '').trim(); }
  function isConfigured() { return gasUrl().startsWith('https://script.google.com'); }

  // ── JSONP: única forma fiable de llamar GAS desde otro dominio ──
  function jsonp(params) {
    return new Promise((resolve, reject) => {
      const cbName = '_gcb_' + Date.now() + '_' + Math.random().toString(36).slice(2);

      const timer = setTimeout(() => {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('Timeout — comprueba que el script está desplegado y el acceso es "Cualquier usuario"'));
      }, 15000);

      window[cbName] = (data) => {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(data);
      };

      const qs = Object.entries({ ...params, callback: cbName, _t: Date.now() })
        .map(([k, v]) => encodeURIComponent(k) + '=' +
          encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v))
        .join('&');

      const script = document.createElement('script');
      script.src = gasUrl() + '?' + qs;
      script.onerror = () => {
        clearTimeout(timer);
        delete window[cbName];
        reject(new Error('Error de red al conectar con Google Apps Script'));
      };
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

    // Seed: si el Sheet está vacío carga los datos iniciales
    if (_data.length === 0 && !_seeded) {
      _seeded = true;
      let original;
      try {
        const res = await fetch('./data/inmuebles.json');
        original = await res.json();
      } catch {
        original = [];
      }
      if (original.length > 0) {
        // Seed en lotes de 50 para no superar límites de URL
        const BATCH = 50;
        for (let i = 0; i < original.length; i += BATCH) {
          const batch  = original.slice(i, i + BATCH);
          const action = i === 0 ? 'seed' : 'seedAppend';
          const r = await jsonp({ action, data: batch });
          if (!r.ok) throw new Error('Error en seed: ' + r.error);
        }
        _data = original;
      }
    }
    return _data;
  }

  // ── Crear ─────────────────────────────────────────────────────
  async function create(obj) {
    if (isConfigured()) {
      const r = await jsonp({ action: 'create', data: obj });
      if (!r.ok) throw new Error(r.error);
    }
    _data.push(obj);
    return _data;
  }

  // ── Actualizar ────────────────────────────────────────────────
  async function update(obj) {
    if (isConfigured()) {
      const r = await jsonp({ action: 'update', data: obj });
      if (!r.ok) throw new Error(r.error);
    }
    const idx = _data.findIndex(p => p.id === obj.id);
    if (idx >= 0) _data[idx] = obj;
    return _data;
  }

  // ── Eliminar ──────────────────────────────────────────────────
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
