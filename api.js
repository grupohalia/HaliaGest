// ============================================================
// api.js — Capa de datos: Google Sheets vía Apps Script
// ============================================================

const API = (() => {
  // ── Config ──────────────────────────────────────────────────
  // Pega aquí la URL de tu Web App de Google Apps Script
  // Ejemplo: 'https://script.google.com/macros/s/XXXXXXX/exec'
  const GAS_URL = window.GAS_URL || '';

  // ── Estado local (caché) ────────────────────────────────────
  let _data = [];
  let _seeded = false;

  // ── Helpers ─────────────────────────────────────────────────
  function isConfigured() {
    return GAS_URL && GAS_URL.startsWith('https://script.google.com');
  }

  async function gasGet() {
    const res = await fetch(GAS_URL, { method: 'GET' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Error GET');
    return json.data;
  }

  async function gasPost(action, payload) {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || `Error ${action}`);
    return json;
  }

  // ── Seed: carga inicial si la hoja está vacía ────────────────
  async function seed(rows) {
    if (!isConfigured()) return;
    return gasPost('seed', rows);
  }

  // ── Load ─────────────────────────────────────────────────────
  async function load() {
    if (!isConfigured()) {
      // Sin API: carga desde JSON local (modo demo / offline)
      const res = await fetch('./data/inmuebles.json');
      _data = await res.json();
      return _data;
    }

    _data = await gasGet();

    // Si la hoja está vacía, hace seed con los datos originales
    if (_data.length === 0 && !_seeded) {
      _seeded = true;
      const res = await fetch('./data/inmuebles.json');
      const original = await res.json();
      await seed(original);
      _data = original;
    }

    return _data;
  }

  // ── CRUD ──────────────────────────────────────────────────────
  async function create(obj) {
    if (isConfigured()) await gasPost('create', obj);
    _data.push(obj);
    return _data;
  }

  async function update(obj) {
    if (isConfigured()) await gasPost('update', obj);
    const idx = _data.findIndex(p => p.id === obj.id);
    if (idx >= 0) _data[idx] = obj;
    return _data;
  }

  async function remove(id) {
    if (isConfigured()) await gasPost('delete', { id });
    _data = _data.filter(p => p.id !== id);
    return _data;
  }

  function getAll() { return _data; }

  return { load, create, update, remove, getAll, isConfigured };
})();
