// ================================================================
// api.js — Comunicación con Google Apps Script via GET params
// Lee window.GAS_URL directamente en cada llamada
// ================================================================

const API = (() => {

  let _data = [];
  let _seeded = false;

  // Lee la URL en cada llamada — así siempre está actualizada
  function url() {
    return (window.GAS_URL || '').trim();
  }

  function isConfigured() {
    return url().startsWith('https://script.google.com');
  }

  // ── Llamada GET ──────────────────────────────────────────────
  async function gasCall(params) {
    const base = url();
    const qs = Object.entries(params)
      .map(([k, v]) => encodeURIComponent(k) + '=' +
        encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : String(v)))
      .join('&');

    const fullUrl = base + (qs ? '?' + qs : '') + (qs ? '&' : '?') + '_t=' + Date.now();

    const res = await fetch(fullUrl, { method: 'GET', redirect: 'follow' });
    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      // Si devuelve HTML es probablemente un redirect al login de Google
      if (text.includes('<html') || text.includes('accounts.google')) {
        throw new Error('El script redirige al login. Comprueba que "Quién tiene acceso" es "Cualquier usuario".');
      }
      throw new Error('Respuesta no válida: ' + text.slice(0, 120));
    }
  }

  // ── Load ─────────────────────────────────────────────────────
  async function load() {
    if (!isConfigured()) {
      const res = await fetch('./data/inmuebles.json');
      _data = await res.json();
      return _data;
    }

    const result = await gasCall({});
    if (!result.ok) throw new Error(result.error);
    _data = result.data || [];

    // Seed automático si el Sheet está vacío
    if (_data.length === 0 && !_seeded) {
      _seeded = true;
      const res = await fetch('./data/inmuebles.json');
      const original = await res.json();
      const seedResult = await gasCall({ action: 'seed', data: original });
      if (!seedResult.ok) throw new Error('Error en seed: ' + seedResult.error);
      _data = original;
    }

    return _data;
  }

  // ── Crear ────────────────────────────────────────────────────
  async function create(obj) {
    if (isConfigured()) {
      const result = await gasCall({ action: 'create', data: obj });
      if (!result.ok) throw new Error(result.error);
    }
    _data.push(obj);
    return _data;
  }

  // ── Actualizar ───────────────────────────────────────────────
  async function update(obj) {
    if (isConfigured()) {
      const result = await gasCall({ action: 'update', data: obj });
      if (!result.ok) throw new Error(result.error);
    }
    const idx = _data.findIndex(p => p.id === obj.id);
    if (idx >= 0) _data[idx] = obj;
    return _data;
  }

  // ── Eliminar ─────────────────────────────────────────────────
  async function remove(id) {
    if (isConfigured()) {
      const result = await gasCall({ action: 'delete', data: { id } });
      if (!result.ok) throw new Error(result.error);
    }
    _data = _data.filter(p => p.id !== id);
    return _data;
  }

  function getAll() { return _data; }

  // init() ya no hace falta pero lo dejamos por compatibilidad
  function init() {}

  return { init, load, create, update, remove, getAll, isConfigured };

})();
