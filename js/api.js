// ================================================================
// api.js v4 — JSONP · Inmuebles + Contratos + Pagos
// ================================================================
const API = (() => {
  let _inm = [], _ctr = [], _pag = [];
  let _seeded = false;

  function gasUrl() { return (window.GAS_URL || '').trim(); }
  function isConfigured() {
    const u = gasUrl();
    return u.startsWith('https://script.google.com') ||
           u.startsWith('https://script.googleusercontent.com');
  }

  function buildUrl(params) {
    const base = gasUrl();
    const sep  = base.includes('?') ? '&' : '?';
    const qs   = Object.entries(params)
      .map(([k,v]) => encodeURIComponent(k) + '=' +
        encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v))
      .join('&');
    return base + sep + qs + '&_t=' + Date.now();
  }

  function jsonp(params) {
    return new Promise((resolve, reject) => {
      const cb = '_gcb' + Date.now() + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => { cleanup(); reject(new Error('Timeout (15s)')); }, 15000);
      function cleanup() { delete window[cb]; if (s.parentNode) s.parentNode.removeChild(s); clearTimeout(timer); }
      window[cb] = data => { cleanup(); resolve(data); };
      const s = document.createElement('script');
      s.src = buildUrl({ ...params, callback: cb });
      s.onerror = () => { cleanup(); reject(new Error('Error de red con Google Apps Script')); };
      document.head.appendChild(s);
    });
  }

  // ── Carga inicial (las tres hojas de una vez) ───────────────
  async function load() {
    if (!isConfigured()) {
      const r = await fetch('./data/inmuebles.json');
      if (!r.ok) throw new Error('No se encontró data/inmuebles.json');
      _inm = await r.json();
      _ctr = []; _pag = [];
      return;
    }

    const result = await jsonp({});
    if (!result.ok) throw new Error(result.error);
    _inm = result.inmuebles || [];
    _ctr = result.contratos || [];
    _pag = result.pagos     || [];

    // Seed inmuebles si la hoja está vacía
    if (_inm.length === 0 && !_seeded) {
      _seeded = true;
      try {
        const r = await fetch('./data/inmuebles.json');
        const orig = await r.json();
        if (orig.length > 0) {
          const BATCH = 50;
          for (let i = 0; i < orig.length; i += BATCH) {
            const batch  = orig.slice(i, i + BATCH);
            const action = i === 0 ? 'seed' : 'seedAppend';
            await jsonp({ action, sheet: 'Inmuebles', data: batch });
          }
          _inm = orig;
        }
      } catch(e) { console.warn('Seed inmuebles:', e.message); }
    }
  }

  // ── INMUEBLES ───────────────────────────────────────────────
  async function createInm(obj) {
    if (isConfigured()) { const r = await jsonp({action:'create',sheet:'Inmuebles',data:obj}); if(!r.ok) throw new Error(r.error); }
    _inm.push(obj); return _inm;
  }
  async function updateInm(obj) {
    if (isConfigured()) { const r = await jsonp({action:'update',sheet:'Inmuebles',data:obj}); if(!r.ok) throw new Error(r.error); }
    const i = _inm.findIndex(p=>p.id===obj.id); if(i>=0) _inm[i]=obj; return _inm;
  }
  async function removeInm(id) {
    if (isConfigured()) { const r = await jsonp({action:'delete',sheet:'Inmuebles',data:{id}}); if(!r.ok) throw new Error(r.error); }
    _inm = _inm.filter(p=>p.id!==id); return _inm;
  }

  // ── CONTRATOS ───────────────────────────────────────────────
  async function createContrato(obj) {
    if (isConfigured()) { const r = await jsonp({action:'create',sheet:'Contratos',data:obj}); if(!r.ok) throw new Error(r.error); }
    _ctr.push(obj); return _ctr;
  }
  async function updateContrato(obj) {
    if (isConfigured()) { const r = await jsonp({action:'update',sheet:'Contratos',data:obj}); if(!r.ok) throw new Error(r.error); }
    const i = _ctr.findIndex(c=>c.id===obj.id); if(i>=0) _ctr[i]=obj; return _ctr;
  }
  async function bajaContrato(contrato_id, fecha_baja) {
    if (isConfigured()) {
      const r = await jsonp({action:'bajaContrato',data:{contrato_id,fecha_baja}});
      if(!r.ok) throw new Error(r.error);
    }
    // local
    const i = _ctr.findIndex(c=>c.id===contrato_id);
    if(i>=0) { _ctr[i].activo=false; _ctr[i].fecha_fin=fecha_baja; }
    _pag = _pag.filter(p=>!(p.contrato_id===contrato_id && p.estado==='pendiente' && p.fecha_vencimiento>fecha_baja));
    return _ctr;
  }

  // ── PAGOS ───────────────────────────────────────────────────
  async function createPago(obj) {
    if (isConfigured()) { const r = await jsonp({action:'create',sheet:'Pagos',data:obj}); if(!r.ok) throw new Error(r.error); }
    _pag.push(obj); return _pag;
  }
  async function createPagos(lista) {
    // Crea múltiples pagos en lotes
    for (const obj of lista) {
      if (isConfigured()) { const r = await jsonp({action:'create',sheet:'Pagos',data:obj}); if(!r.ok) console.warn('Pago no creado:',r.error); }
      _pag.push(obj);
    }
    return _pag;
  }
  async function cobrarPago(id, fecha_cobro, forma_pago, notas) {
    if (isConfigured()) {
      const r = await jsonp({action:'cobrarPago',data:{id,fecha_cobro,forma_pago,notas}});
      if(!r.ok) throw new Error(r.error);
    }
    const i = _pag.findIndex(p=>p.id===id);
    if(i>=0) { _pag[i].estado='cobrado'; _pag[i].fecha_cobro=fecha_cobro; _pag[i].forma_pago=forma_pago; }
    return _pag;
  }
  async function updatePago(obj) {
    if (isConfigured()) { const r = await jsonp({action:'update',sheet:'Pagos',data:obj}); if(!r.ok) throw new Error(r.error); }
    const i = _pag.findIndex(p=>p.id===obj.id); if(i>=0) _pag[i]=obj; return _pag;
  }
  async function removePago(id) {
    if (isConfigured()) { const r = await jsonp({action:'delete',sheet:'Pagos',data:{id}}); if(!r.ok) throw new Error(r.error); }
    _pag = _pag.filter(p=>p.id!==id); return _pag;
  }

  function getInmuebles()  { return _inm; }
  function getContratos()  { return _ctr; }
  function getPagos()      { return _pag; }

  // Retrocompat con código existente
  function getAll()        { return _inm; }
  async function create(o) { return createInm(o); }
  async function update(o) { return updateInm(o); }
  async function remove(id){ return removeInm(id); }
  function init() {}

  return {
    init, load, isConfigured,
    getAll, create, update, remove,
    getInmuebles, createInm, updateInm, removeInm,
    getContratos, createContrato, updateContrato, bajaContrato,
    getPagos, createPago, createPagos, cobrarPago, updatePago, removePago
  };
})();
