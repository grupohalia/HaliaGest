// ================================================================
// api.js — Comunicación con Google Apps Script via GET params
//
// Por qué GET y no POST:
// Google Apps Script Web App tiene restricciones de CORS que
// impiden leer la respuesta de un POST desde un dominio externo.
// La solución estándar es enviar todo via GET con parámetros,
// ya que doGet() sí responde correctamente con CORS implícito
// al ser una URL pública de Google.
// ================================================================

const API = (() => {

  let _url = '';
  let _data = [];
  let _seeded = false;

  function init(gasUrl) {
    _url = (gasUrl || '').trim();
  }

  function isConfigured() {
    return _url.startsWith('https://script.google.com');
  }

  // ── Llamada GET base ─────────────────────────────────────────
  async function gasCall(params) {
    const qs = Object.entries(params)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(
        typeof v === 'object' ? JSON.stringify(v) : v
      ))
      .join('&');

    const url = _url + '?' + qs + '&t=' + Date.now(); // cache buster

    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    // GAS puede devolver text/plain incluso con setMimeType JSON
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Respuesta no válida del servidor: ' + text.slice(0, 100));
    }
  }

  // ── Carga inicial ────────────────────────────────────────────
  async function load() {
    if (!isConfigured()) {
      const res = await fetch('./data/inmuebles.json');
      _data = await res.json();
      return _data;
    }

    // Lee todos los registros del Sheet
    const result = await gasCall({});
    if (!result.ok) throw new Error(result.error);
    _data = result.data;

    // Si el Sheet está vacío hace el seed automático
    if (_data.length === 0 && !_seeded) {
      _seeded = true;
      const res = await fetch('./data/inmuebles.json');
      const original = await res.json();
      await gasCall({ action: 'seed', data: original });
      _data = original;
    }

    return _data;
  }

  // ── Crear ────────────────────────────────────────────────────
  async function create(obj) {
    // Actualiza caché local primero (UI instantánea)
    _data.push(obj);

    if (isConfigured()) {
      const result = await gasCall({ action: 'create', data: obj });
      if (!result.ok) {
        // Revertir caché si falla
        _data = _data.filter(p => p.id !== obj.id);
        throw new Error(result.error);
      }
    }
    return _data;
  }

  // ── Actualizar ───────────────────────────────────────────────
  async function update(obj) {
    // Actualiza caché local primero
    const idx = _data.findIndex(p => p.id === obj.id);
    const prev = idx >= 0 ? { ..._data[idx] } : null;
    if (idx >= 0) _data[idx] = obj;

    if (isConfigured()) {
      const result = await gasCall({ action: 'update', data: obj });
      if (!result.ok) {
        // Revertir
        if (idx >= 0 && prev) _data[idx] = prev;
        throw new Error(result.error);
      }
    }
    return _data;
  }

  // ── Eliminar ─────────────────────────────────────────────────
  async function remove(id) {
    const prev = [..._data];
    _data = _data.filter(p => p.id !== id);

    if (isConfigured()) {
      const result = await gasCall({ action: 'delete', data: { id } });
      if (!result.ok) {
        _data = prev; // revertir
        throw new Error(result.error);
      }
    }
    return _data;
  }

  function getAll() { return _data; }

  return { init, load, create, update, remove, getAll, isConfigured };
})();
