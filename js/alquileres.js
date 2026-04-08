// ================================================================
// alquileres.js — Lógica de Contratos y Pagos
// ================================================================

// ── Utilidades de fecha ─────────────────────────────────────────
function hoy() {
  return new Date().toISOString().slice(0, 10);
}
function addMeses(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
function diasHasta(dateStr) {
  const hoyMs  = new Date(hoy() + 'T00:00:00').getTime();
  const fecMs  = new Date(dateStr + 'T00:00:00').getTime();
  return Math.round((fecMs - hoyMs) / 86400000);
}
function fmtFecha(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return d + '/' + m + '/' + y;
}
function idContrato() {
  return 'CTR-' + Date.now().toString(36).toUpperCase();
}
function idPago() {
  return 'PAG-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,4).toUpperCase();
}

// ── Calcular importe según periodicidad ─────────────────────────
const MESES_PERIODO = { mensual:1, trimestral:3, cuatrimestral:4, semestral:6, anual:12 };
function importePeriodo(renta, periodicidad) {
  return renta * (MESES_PERIODO[periodicidad] || 1);
}

// ── Calcular el próximo vencimiento de un contrato ──────────────
// Partiendo de fecha_inicio, avanza periodos hasta encontrar
// el primer vencimiento que sea >= hoy
// ═══════════════════════════════════════════════════════════════
// LÓGICA DE PAGOS — unidad mínima: MES
// ═══════════════════════════════════════════════════════════════

// ── Normalizar fecha a YYYY-MM-DD limpia ────────────────────────
function normFecha(s) {
  if (!s) return '';
  return String(s).trim().slice(0, 10);
}

// ── Año-mes de una fecha: "2024-03" ─────────────────────────────
function aniomes(fecha) {
  return normFecha(fecha).slice(0, 7); // "YYYY-MM"
}

// ── Todos los vencimientos del ciclo de un contrato ─────────────
// Genera la secuencia completa de fechas de vencimiento desde
// fecha_inicio hasta el limite, en pasos de N meses según periodicidad
function todosLosVencimientos(contrato, hasta) {
  const meses = MESES_PERIODO[contrato.periodicidad] || 1;
  const vencimientos = [];
  let fecha = addMeses(contrato.fecha_inicio, meses);
  let iter  = 0;
  while (fecha <= hasta && iter < 600) {
    vencimientos.push(fecha);
    fecha = addMeses(fecha, meses);
    iter++;
  }
  return vencimientos;
}

// ── Meses cubiertos por un pago ──────────────────────────────────
// Un pago cubre todos los meses del periodo que representa.
// Ej: pago semestral con vencimiento 2024-06-01 cubre ene-jun 2024.
// Devuelve Set de strings "YYYY-MM"
function mesesCubiertos(pago, contrato) {
  if (!pago || !contrato) return new Set();
  const meses = MESES_PERIODO[contrato.periodicidad] || 1;
  const fv    = normFecha(pago.fecha_vencimiento);
  const cubiertos = new Set();
  // El vencimiento es el último mes del periodo
  // Retrocedemos (meses-1) para sacar todos los meses del periodo
  for (let i = 0; i < meses; i++) {
    const d = new Date(fv + 'T12:00:00');
    d.setMonth(d.getMonth() - i);
    cubiertos.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0'));
  }
  return cubiertos;
}

// ── Índice de meses cubiertos por contrato ───────────────────────
// Devuelve Map< contrato_id → Set<"YYYY-MM"> >
// Incluye todos los pagos (cobrados Y pendientes) para saber
// qué meses ya tienen pago emitido
function buildMesesCubiertosIdx() {
  const contratos = API.getContratos();
  const ctrMap    = new Map(contratos.map(c => [c.id, c]));
  const idx       = new Map(); // contrato_id → Set<aniomes>

  API.getPagos().forEach(p => {
    const ctr = ctrMap.get(p.contrato_id);
    if (!ctr) return;
    const fv = normFecha(p.fecha_vencimiento);
    if (!fv) return;
    if (!idx.has(p.contrato_id)) idx.set(p.contrato_id, new Set());
    // Añadir todos los meses que cubre este pago
    mesesCubiertos(p, ctr).forEach(m => idx.get(p.contrato_id).add(m));
    // También indexar la fecha exacta para dedup por fecha
    idx.get(p.contrato_id).add('DATE:' + fv);
  });
  return idx;
}

// ── Sincronizar pagos ────────────────────────────────────────────
// Solo genera pagos para meses NO cubiertos dentro de ±31 días.
// Anti-duplicado por: fecha exacta Y por mes cubierto.
async function sincronizarPagos() {
  const contratos = API.getContratos().filter(c =>
    (c.activo === true || c.activo === 'TRUE') && c.fecha_inicio
  );

  const hoyStr   = hoy();
  const limite   = addMeses(hoyStr, 1); // ventana: próximos 31 días
  const mesesIdx = buildMesesCubiertosIdx();
  const nuevosIdx = new Set(); // para evitar duplicados en esta misma pasada

  const nuevos = [];

  contratos.forEach(c => {
    const meses   = MESES_PERIODO[c.periodicidad] || 1;
    const importe = importePeriodo(c.renta_mensual, c.periodicidad);
    const cubiertos = mesesIdx.get(c.id) || new Set();

    // Obtener todos los vencimientos del contrato hasta limite+1 periodo
    const vencimientos = todosLosVencimientos(c, addMeses(limite, meses));

    // Buscar el primer vencimiento dentro de la ventana que no esté cubierto
    for (const fv of vencimientos) {
      if (fv > limite) break; // fuera de ventana
      if (diasHasta(fv) < -1) continue; // ya muy pasado, ignorar

      const fechaKey  = 'DATE:' + fv;
      const mesKey    = aniomes(fv);
      const globalKey = c.id + '|' + fv;

      // Ya existe pago para esta fecha exacta
      if (cubiertos.has(fechaKey)) continue;
      // Ya existe pago que cubre este mes
      if (cubiertos.has(mesKey)) continue;
      // Ya lo añadimos en esta misma pasada
      if (nuevosIdx.has(globalKey)) continue;

      nuevosIdx.add(globalKey);
      // Marcar meses cubiertos para evitar dobles en misma pasada
      if (!mesesIdx.has(c.id)) mesesIdx.set(c.id, new Set());
      mesesCubiertos({ fecha_vencimiento: fv }, c)
        .forEach(m => mesesIdx.get(c.id).add(m));
      mesesIdx.get(c.id).add(fechaKey);

      nuevos.push({
        id:                idPago(),
        contrato_id:       c.id,
        inmueble_id:       c.inmueble_id,
        fecha_vencimiento: fv,
        importe:           importe,
        estado:            'pendiente',
        fecha_cobro:       '',
        forma_pago:        '',
        notas:             ''
      });
    }
  });

  if (nuevos.length > 0) {
    await API.createPagos(nuevos);
  }
  return nuevos.length;
}

// ── Limpiar duplicados del Sheet ─────────────────────────────────
// Uso desde consola: await limpiarDuplicadosSheet()
async function limpiarDuplicadosSheet() {
  const pagos  = [...API.getPagos()].sort((a, b) => a.id.localeCompare(b.id));
  const vistos = new Set();
  const borrar = [];

  pagos.forEach(p => {
    const key = p.contrato_id + '|' + normFecha(p.fecha_vencimiento);
    if (vistos.has(key)) {
      borrar.push(p.id);
    } else {
      vistos.add(key);
    }
  });

  if (!borrar.length) { toast('✅ Sin duplicados'); return 0; }

  showProgress([`Eliminando ${borrar.length} duplicados...`]);
  try {
    for (const id of borrar) await API.removePago(id);
    hideProgress();
    toast(`✅ ${borrar.length} duplicados eliminados`);
    renderAvisos();
    if (typeof _renderAlquileres === 'function') _renderAlquileres();
  } catch(e) {
    hideProgress(); toast('Error: ' + e.message, true);
  }
  return borrar.length;
}

// ── Estado de un pago con aviso 30 días ─────────────────────────
function estadoVisual(pago) {
  if (pago.estado === 'cobrado') return { label:'✅ Cobrado',   cls:'badge-cobrado',  dias: null };
  const d = diasHasta(pago.fecha_vencimiento);
  if (d < 0)  return { label:'🔴 Vencido',   cls:'badge-vencido',  dias: Math.abs(d) };
  if (d <= 30) return { label:'🟡 Próximo',   cls:'badge-proximo',  dias: d };
  return       { label:'⬜ Pendiente',        cls:'badge-pendiente', dias: d };
}

// ── Render pestaña Alquileres ────────────────────────────────────
// Primero sincroniza pagos (crea los próximos si faltan ≤31 días)
// luego renderiza. Se usa una flag para no lanzar dos veces seguidas.
let _sincronizando = false;
// ── Estado de filtros ────────────────────────────────────────────
let _subTab        = 'pagos';
let _filtroPlazo   = 'todos';
let _filtroTipoPag = '';
let _filtroTipoRen = '';
let _filtroTipoAlq = '';

// ── Cambiar sub-pestaña ──────────────────────────────────────────
function switchSubTab(tab) {
  _subTab = tab;
  document.getElementById('subtab-pagos').classList.toggle('active', tab === 'pagos');
  document.getElementById('subtab-renovaciones').classList.toggle('active', tab === 'renovaciones');
  const pPag = document.getElementById('panel-pagos');
  const pRen = document.getElementById('panel-renovaciones');
  pPag.style.display = tab === 'pagos' ? 'flex' : 'none';
  pPag.style.flexDirection = 'column';
  pRen.style.display = tab === 'renovaciones' ? 'flex' : 'none';
  pRen.style.flexDirection = 'column';
  if (tab === 'pagos') _renderPagos();
  else _renderRenovaciones();
}

// ── Setters de filtro (chips) ────────────────────────────────────
function _setChip(rowId, btn) {
  document.querySelectorAll('#' + rowId + ' .filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function setFiltroPlazo(btn, val) {
  _filtroPlazo = val; _setChip('filtro-plazo-row', btn); _renderPagos();
}
function setFiltroTipoPago(btn, val) {
  _filtroTipoPag = val; _setChip('filtro-tipo-pago-row', btn); _renderPagos();
}
function setFiltroTipoRenov(btn, val) {
  _filtroTipoRen = val; _setChip('filtro-tipo-renov-row', btn); _renderRenovaciones();
}
function setFiltroTipoAlq(btn, val) {
  _filtroTipoAlq = val; _setChip('filtro-tipo-alq-row', btn); _renderAlquileres();
}
function _alqSearchInput(inp) {
  const clr = document.getElementById('alq-search-clear');
  if (clr) clr.style.display = inp.value ? 'block' : 'none';
  _renderAlquileres();
}
// Render pestaña Contratos (con sync en background)
async function renderAlquileres() {
  _renderAlquileres();
  await _syncBackground(() => _renderAlquileres());
}

// Render pestaña Avisos (con sync en background)
async function renderAvisos() {
  _renderPagos();
  _renderRenovaciones();
  await _syncBackground(() => { _renderPagos(); _renderRenovaciones(); });
}

// Sincronización en background reutilizable
async function _syncBackground(onUpdate) {
  if (_sincronizando || !API.isConfigured()) return;
  _sincronizando = true;
  try {
    const n = await sincronizarPagos();
    if (n > 0) { onUpdate(); updateAvisosBadge(); }
  } catch(e) {
    console.warn('[Sync]', e.message);
  } finally {
    _sincronizando = false;
  }
}

// ── Helpers de rendimiento ────────────────────────────────────────
// Construye Map id→inmueble para lookups O(1)
function _inmMap() {
  const m = new Map();
  API.getInmuebles().forEach(i => m.set(i.id, i));
  return m;
}
// Construye Map id→contrato
function _ctrMap() {
  const m = new Map();
  API.getContratos().forEach(c => m.set(c.id, c));
  return m;
}
// Actualiza badges de sub-tabs sin re-renderizar contenido
function _updateSubBadges() {
  const pagos = API.getPagos();
  const nPag = pagos.filter(p => {
    if (p.estado !== 'pendiente') return false;
    const d = diasHasta(p.fecha_vencimiento);
    return d < 0 || d <= 30;
  }).length;
  const nRen = getContratosProxVencer().length;
  const bPag = document.getElementById('badge-pagos');
  const bRen = document.getElementById('badge-renov');
  if (bPag) { bPag.textContent = nPag||''; bPag.style.display = nPag ? 'inline-flex' : 'none'; }
  if (bRen) { bRen.textContent = nRen||''; bRen.style.display = nRen ? 'inline-flex' : 'none'; }
}

// ── Panel PAGOS ──────────────────────────────────────────────────
function _renderPagos() {
  const contratos = API.getContratos();
  const pagos     = API.getPagos();
  const inmMap    = _inmMap();
  const ctrMap    = _ctrMap();

  // Días máximo según filtro de plazo
  const maxDias = _filtroPlazo === '15' ? 15 : _filtroPlazo === '30' ? 30 : 31;
  const soloFuturos = _filtroPlazo !== 'todos';

  // Filtrar pagos relevantes
  let avisos = pagos
    .filter(p => p.estado === 'pendiente')
    .map(p => {
      const d = diasHasta(p.fecha_vencimiento);
      return { ...p, _dias: d };
    })
    .filter(p => {
      if (p._dias < 0) return !soloFuturos; // vencidos: solo en "Todos"
      return p._dias <= maxDias;            // futuros: según plazo
    })
    .filter(p => !_filtroTipoPag || (inmMap.get(p.inmueble_id)?.tipo === _filtroTipoPag))
    .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
    .map(p => ({ ...p, _ev: estadoVisual(p) }));

  const vencidos = avisos.filter(p => p._dias < 0);
  const proximos = avisos.filter(p => p._dias >= 0);

  let html = '';
  if (vencidos.length) {
    html += `<div class="alq-section">
      <div class="alq-sec-title" style="color:var(--red)">🔴 Vencidos (${vencidos.length})</div>`;
    vencidos.forEach(p => html += renderAvisoCard(p, contratos, Array.from(inmMap.values())));
    html += `</div>`;
  }
  if (proximos.length) {
    const lbl = soloFuturos ? `Próximos ${_filtroPlazo} días` : 'Próximos 31 días';
    html += `<div class="alq-section">
      <div class="alq-sec-title" style="color:var(--ylw)">🟡 ${lbl} (${proximos.length})</div>`;
    proximos.forEach(p => html += renderAvisoCard(p, contratos, Array.from(inmMap.values())));
    html += `</div>`;
  }
  if (!avisos.length) {
    const lbl = soloFuturos ? `${_filtroPlazo} días` : '31 días';
    html += `<div class="avisos-empty">
      <div class="avisos-empty-icon">✅</div>
      <div class="avisos-empty-title">Sin pagos pendientes</div>
      <div class="avisos-empty-sub">Nada vencido ni con vencimiento en ${lbl}${_filtroTipoPag?' · '+_filtroTipoPag:''}</div>
    </div>`;
  }
  document.getElementById('avisos-body').innerHTML = html;
  _updateSubBadges();
  updateAvisosBadge();
}

// ── Panel RENOVACIONES ───────────────────────────────────────────
function _renderRenovaciones() {
  const inmMap = _inmMap();

  let proxVencer = getContratosProxVencer();
  if (_filtroTipoRen) {
    proxVencer = proxVencer.filter(c => inmMap.get(c.inmueble_id)?.tipo === _filtroTipoRen);
  }

  let html = '';
  if (proxVencer.length) {
    html += `<div class="alq-section">
      <div class="alq-sec-title" style="color:#7c5cfc">📋 Por renovar (${proxVencer.length})</div>`;
    proxVencer.forEach(c => html += renderContratoRenovacionCard(c, Array.from(inmMap.values())));
    html += `</div>`;
  } else {
    html += `<div class="avisos-empty">
      <div class="avisos-empty-icon">✅</div>
      <div class="avisos-empty-title">Sin renovaciones pendientes</div>
      <div class="avisos-empty-sub">Ningún contrato cumple aniversario en 90 días${_filtroTipoRen?' · '+_filtroTipoRen:''}</div>
    </div>`;
  }
  document.getElementById('renovaciones-body').innerHTML = html;
  _updateSubBadges();
  updateAvisosBadge();
}

// ── Contratos próximos a vencer (por fecha_fin) ─────────────────
// Aviso cuando fecha_fin está dentro de ±90 días:
//   - fecha_fin en próximos 90 días → amarillo/rojo (hay que renovar)
//   - fecha_fin ya pasó (caducado sin renovar) → rojo urgente
// Al renovar → fecha_fin +12 meses → sale de la ventana → desaparece
function getContratosProxVencer() {
  const hoyStr = hoy();
  return API.getContratos()
    .filter(c => c.activo === true || c.activo === 'TRUE')
    .filter(c => c.fecha_fin)
    .map(c => ({
      ...c,
      _diasFin:   diasHasta(c.fecha_fin),
      _fechaAniv: c.fecha_fin
    }))
    .filter(c => c._diasFin <= 90)   // futuros ≤90 días O ya caducados
    .sort((a, b) => a._diasFin - b._diasFin);
}

function renderContratoRenovacionCard(c, inmuebles) {
  const inm = inmuebles.find(i => i.id === c.inmueble_id) || {};
  const d   = c._diasFin;
  const urgente = d <= 30;
  const cls = urgente ? 'aviso-vencido' : 'aviso-proximo';
  const color = urgente ? 'var(--red)' : 'var(--ylw)';
  const diasStr = d === 0
    ? 'Vence hoy'
    : d < 0
      ? `Venció hace ${Math.abs(d)} día${Math.abs(d)!==1?'s':''}`
      : `Vence en ${d} día${d!==1?'s':''}`;

  // Calcular años que lleva el contrato
  const aniosContrato = c.fecha_inicio
    ? Math.floor(diasHasta(c.fecha_inicio) * -1 / 365) + 1
    : '?';

  return `<div class="alq-card aviso-card ${cls}" style="border-left-color:${color}">
    <div class="alq-card-top">
      <div style="flex:1;min-width:0">
        <div class="alq-card-title">${c.inquilino || '—'}</div>
        <div class="alq-card-sub">${inm.tipo||''} · ${inm.localidad||''}</div>
        <div class="alq-card-sub" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${inm.direccion ? inm.direccion.split(' ').slice(0,6).join(' ') : '—'}
        </div>
        <div class="alq-card-sub" style="margin-top:3px;color:var(--txt3)">
          Año ${aniosContrato} · desde ${fmtFecha(c.fecha_inicio)}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:10px">
        <div class="badge" style="background:rgba(124,92,252,.12);color:#7c5cfc;margin-bottom:4px">📋 Vence contrato</div>
        <div class="alq-importe">${fmtE(c.renta_mensual)}/mes</div>
        <div class="alq-fecha">Fin: ${fmtFecha(c._fechaAniv)}</div>
        <div class="alq-fecha" style="color:${color};font-weight:600">${diasStr}</div>
      </div>
    </div>
    <div class="alq-card-btns">
      <button class="abtn" style="background:rgba(79,142,247,.12);color:var(--acc);border-color:rgba(79,142,247,.3)"
        onclick="renovarContrato('${c.id}')">🔄 Renovar</button>
      <button class="abtn" style="background:rgba(234,179,8,.12);color:var(--ylw);border-color:rgba(234,179,8,.3)"
        onclick="subirIPC('${c.id}')">📈 Subir IPC</button>
      <button class="abtn abtn-ver"
        onclick="openDetalleContrato('${c.id}')">Ver contrato</button>
    </div>
  </div>`;
}

function renderAvisoCard(p, contratos, inmuebles) {
  const ctr = contratos.find(c=>c.id===p.contrato_id) || {};
  const inm = inmuebles.find(i=>i.id===p.inmueble_id) || {};
  const ev  = p._ev;
  const diasStr = ev.dias != null
    ? (ev.cls==='badge-vencido' ? `Vencido hace ${ev.dias} día${ev.dias!==1?'s':''}` : `Vence en ${ev.dias} día${ev.dias!==1?'s':''}`)
    : '';
  return `<div class="alq-card aviso-card ${ev.cls==='badge-vencido'?'aviso-vencido':'aviso-proximo'}">
    <div class="alq-card-top">
      <div style="flex:1;min-width:0">
        <div class="alq-card-title">${ctr.inquilino || '—'}</div>
        <div class="alq-card-sub">${inm.tipo||''} · ${inm.localidad||''}</div>
        <div class="alq-card-sub" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${inm.direccion ? inm.direccion.split(' ').slice(0,6).join(' ') : '—'}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:10px">
        <div class="badge ${ev.cls}" style="margin-bottom:4px">${ev.label}</div>
        <div class="alq-importe">${fmtE(p.importe)}</div>
        <div class="alq-fecha">${fmtFecha(p.fecha_vencimiento)}</div>
        <div class="alq-fecha" style="${ev.cls==='badge-vencido'?'color:var(--red)':'color:var(--ylw)'}">${diasStr}</div>
      </div>
    </div>
    <div class="alq-card-btns">
      <button class="abtn abtn-cobrar" onclick="openCobrarModal('${p.id}')">💳 Registrar cobro</button>
      <button class="abtn abtn-ver" onclick="openDetallePago('${p.id}')">Ver contrato</button>
    </div>
  </div>`;
}

function _renderAlquileres() {
  const contratos = API.getContratos();
  const pagos     = API.getPagos();
  const inmMap    = _inmMap();

  // Índice de pagos vencidos por contrato para O(1)
  const vencidosPorCtr = new Set();
  const pagosPorCtr    = new Map();
  pagos.forEach(p => {
    if (!pagosPorCtr.has(p.contrato_id)) pagosPorCtr.set(p.contrato_id, {pend:0,cobr:0});
    const s = pagosPorCtr.get(p.contrato_id);
    if (p.estado === 'pendiente') { s.pend++; if (diasHasta(p.fecha_vencimiento) < 0) vencidosPorCtr.add(p.contrato_id); }
    if (p.estado === 'cobrado') s.cobr++;
  });

  const query = (document.getElementById('alq-search')?.value || '').toLowerCase().trim();

  let activos   = contratos.filter(c => c.activo === true || c.activo === 'TRUE');
  const inactivos = contratos.filter(c => !(c.activo === true || c.activo === 'TRUE'));
  const totalActivos = activos.length;

  // Filtro tipo
  if (_filtroTipoAlq) activos = activos.filter(c => inmMap.get(c.inmueble_id)?.tipo === _filtroTipoAlq);

  // Búsqueda texto
  if (query) {
    activos = activos.filter(c => {
      const inm = inmMap.get(c.inmueble_id) || {};
      return [c.inquilino, c.dni, inm.direccion, inm.localidad, inm.tipo]
        .some(v => (v||'').toLowerCase().includes(query));
    });
  }

  // Ordenar: vencidos primero, luego por nombre
  activos.sort((a, b) => {
    const av = vencidosPorCtr.has(a.id), bv = vencidosPorCtr.has(b.id);
    if (av !== bv) return av ? -1 : 1;
    return (a.inquilino||'').localeCompare(b.inquilino||'');
  });

  const hayFiltro = _filtroTipoAlq || query;
  let html = `<div class="alq-section">
    <div class="alq-sec-title">
      📋 Contratos activos ${hayFiltro ? `(${activos.length}/${totalActivos})` : `(${activos.length})`}
      <button class="abtn abtn-new" onclick="openNuevoContrato()">+ Nuevo</button>
    </div>`;

  if (!activos.length) {
    html += `<div class="alq-empty">${hayFiltro ? 'Sin resultados. Cambia los filtros.' : 'No hay contratos. Pulsa "+ Nuevo".'}</div>`;
  } else {
    activos.forEach(c => {
      const inm = inmMap.get(c.inmueble_id) || {};
      const st  = pagosPorCtr.get(c.id) || {pend:0,cobr:0};
      const venc = vencidosPorCtr.has(c.id);
      const ico = inm.tipo==='Vivienda'?'🏠':inm.tipo==='Garaje'?'🚗':inm.tipo==='Trastero'?'📦':inm.tipo==='Local'?'🏪':'🏢';
      html += `<div class="alq-card contrato-card${venc?' alq-card-urgente':''}" onclick="openDetalleContrato('${c.id}')">
        <div class="alq-card-top">
          <div style="flex:1;min-width:0">
            <div class="alq-card-title">${c.inquilino||'—'}</div>
            <div class="alq-card-sub">${ico} ${inm.tipo||''} · ${inm.localidad||''}</div>
            <div class="alq-card-sub" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${inm.direccion||'—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:8px">
            <div class="alq-importe">${fmtE(c.renta_mensual)}<span style="font-size:10px;font-weight:400">/mes</span></div>
            <div class="alq-fecha">${c.periodicidad}</div>
            <div class="alq-fecha">desde ${fmtFecha(c.fecha_inicio)}</div>
          </div>
        </div>
        <div class="alq-stats">
          <span>📅 Pend: <strong${venc?' style="color:var(--red)"':''}>${st.pend}</strong></span>
          <span>✅ Cobr: <strong>${st.cobr}</strong></span>
          ${venc?'<span style="color:var(--red);font-weight:600">⚠ Vencido</span>':''}
        </div>
      </div>`;
    });
  }
  html += `</div>`;

  // Finalizados (solo sin filtros)
  if (!hayFiltro && inactivos.length) {
    html += `<div class="alq-section"><div class="alq-sec-title">📁 Finalizados (${inactivos.length})</div>`;
    inactivos.slice(0, 10).forEach(c => {
      const inm = inmMap.get(c.inmueble_id) || {};
      html += `<div class="alq-card contrato-inactivo" onclick="openDetalleContrato('${c.id}')">
        <div class="alq-card-top">
          <div><div class="alq-card-title" style="opacity:.6">${c.inquilino||'—'}</div>
          <div class="alq-card-sub">${inm.localidad||''} · hasta ${fmtFecha(c.fecha_fin)}</div></div>
          <div class="alq-importe" style="opacity:.5">${fmtE(c.renta_mensual)}/mes</div>
        </div>
      </div>`;
    });
    if (inactivos.length > 10) html += `<div class="alq-empty" style="padding:8px 0">+${inactivos.length-10} más</div>`;
    html += `</div>`;
  }

  document.getElementById('alq-body').innerHTML = html;
} // end _renderAlquileres

// ── Detalle contrato ─────────────────────────────────────────────
function openDetalleContrato(id) {
  const c   = API.getContratos().find(x=>x.id===id);
  if (!c) return;
  const inm = API.getInmuebles().find(i=>i.id===c.inmueble_id) || {};
  const pCtr = API.getPagos()
    .filter(p=>p.contrato_id===id)
    .sort((a,b)=>a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

  const activo = c.activo===true || c.activo==='TRUE';

  let html = `
    <div class="det-hero">
      <div>
        <div class="det-tipo">${activo ? '🟢 Activo' : '🔴 Finalizado'} · ${c.periodicidad}</div>
        <div class="det-title">${c.inquilino || 'Sin nombre'}</div>
        <div class="det-sub">📍 ${inm.direccion || c.inmueble_id}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="alq-importe">${fmtE(c.renta_mensual)}/mes</div>
        <div class="alq-fecha">Cobro: ${fmtE(importePeriodo(c.renta_mensual, c.periodicidad))}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📋 Datos del contrato</div>
      <div class="row"><span class="lbl">Inicio</span><span class="val">${fmtFecha(c.fecha_inicio)}</span></div>
      <div class="row"><span class="lbl">Fin</span><span class="val">${fmtFecha(c.fecha_fin)}</span></div>
      <div class="row"><span class="lbl">Día de cobro</span><span class="val">Día ${c.dia_cobro || '—'}</span></div>
      <div class="row"><span class="lbl">Fianza</span><span class="val">${fmtE(c.fianza)}</span></div>
      ${c.notas?`<div class="row"><span class="lbl">Notas</span><span class="val" style="font-size:12px;text-align:right">${c.notas}</span></div>`:''}
    </div>

    <div class="card">
      <div class="card-title">👤 Inquilino</div>
      <div class="row"><span class="lbl">Nombre</span><span class="val">${c.inquilino||'—'}</span></div>
      <div class="row"><span class="lbl">DNI</span><span class="val">${c.dni||'—'}</span></div>
      <div class="row"><span class="lbl">Teléfono</span><span class="val">${c.telefono||'—'}</span></div>
      <div class="row"><span class="lbl">Email</span><span class="val" style="font-size:12px">${c.email||'—'}</span></div>
    </div>

    <div class="card">
      <div class="card-title">💳 Pagos (${pCtr.length})</div>`;

  if (!pCtr.length) {
    html += `<div class="alq-empty">Sin pagos generados</div>`;
  } else {
    pCtr.forEach(p => {
      const ev = estadoVisual(p);
      html += `<div class="pago-row">
        <div>
          <div style="font-size:13px;font-weight:600">${fmtFecha(p.fecha_vencimiento)}</div>
          <div style="font-size:11px;color:var(--txt2)">${p.fecha_cobro?'Cobrado: '+fmtFecha(p.fecha_cobro):''} ${p.forma_pago||''}</div>
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="badge ${ev.cls}">${ev.label}</span>
          <span style="font-weight:700;font-size:13px">${fmtE(p.importe)}</span>
          ${p.estado==='pendiente'?`<button class="abtn abtn-cobrar" style="font-size:10px;padding:3px 8px" onclick="openCobrarModal('${p.id}')">Cobrar</button>`:''}
        </div>
      </div>`;
    });
  }
  html += `</div>`;

  if (activo) {
    html += `<div class="action-bar" style="position:sticky;bottom:0">
      <button class="btn btn-d" onclick="openBajaModal('${c.id}')">🔴 Dar de baja</button>
      <button class="btn btn-p" onclick="openEditContrato('${c.id}')" style="flex:2">✏️ Editar</button>
    </div>`;
  }

  document.getElementById('alq-det-body').innerHTML = html;
  document.getElementById('alq-detail').classList.add('open');
}

function closeAlqDetail() {
  document.getElementById('alq-detail').classList.remove('open');
}

// ── Modal: Nuevo / Editar contrato ───────────────────────────────
function openNuevoContrato() {
  document.getElementById('ctr-modal-title').textContent = '➕ Nuevo contrato';
  renderContratoForm(null);
  _resetCtrModalBtn();
  document.getElementById('ctr-modal').classList.add('open');
}
function openEditContrato(id) {
  const c = API.getContratos().find(x=>x.id===id);
  if (!c) return;
  document.getElementById('ctr-modal-title').textContent = '✏️ Editar contrato';
  renderContratoForm(c);
  _resetCtrModalBtn();
  document.getElementById('ctr-modal').classList.add('open');
}

function _resetCtrModalBtn() {
  const btn = document.querySelector('#ctr-modal .btn-p');
  if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
}

function renderContratoForm(c) {
  const isEdit = !!c;
  // En nuevo contrato: solo inmuebles libres. En edición: todos (para no bloquear)
  const inms = API.getInmuebles().filter(i => {
    if (isEdit) return true;
    return !i.alquilado && i.alquilado !== 'TRUE' && i.alquilado !== true;
  }).sort((a,b) => a.localidad.localeCompare(b.localidad) || a.direccion.localeCompare(b.direccion));

  // Inmueble seleccionado actualmente (para edición)
  const selInm = c ? API.getInmuebles().find(i=>i.id===c.inmueble_id) : null;

  document.getElementById('ctr-modal-form').innerHTML = `
    <div class="fg">
      <label class="fl">Inmueble * ${!isEdit?`<span style="color:var(--grn);font-weight:400">(${inms.length} libres)</span>`:''}</label>
      <div class="inm-search-wrap">
        <input class="fi" type="text" id="cf-inm-search"
          placeholder="Buscar por localidad o dirección..."
          oninput="filtrarInmuebles()"
          autocomplete="off">
        <input type="hidden" id="cf-inm" value="${c?.inmueble_id||''}">
      </div>
      ${selInm ? `<div class="inm-selected" id="cf-inm-sel">
        <span>✅ ${selInm.localidad} — ${selInm.tipo} — ${selInm.direccion.slice(0,45)}</span>
      </div>` : `<div class="inm-selected" id="cf-inm-sel" style="display:none"></div>`}
      <div class="inm-list" id="cf-inm-list">
        ${inms.map(i=>`
          <div class="inm-list-item" onclick="seleccionarInmueble('${i.id}','${i.localidad}','${i.tipo}','${i.direccion.slice(0,50).replace(/'/g,'')}')">
            <div class="inm-list-loc">${i.localidad} · <span class="badge badge-sup">${i.tipo}</span></div>
            <div class="inm-list-dir">${i.direccion}</div>
          </div>
        `).join('')}
        ${!inms.length ? `<div class="inm-list-empty">No hay inmuebles libres disponibles</div>` : ''}
      </div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Inquilino</label><input class="fi" id="cf-inq" value="${c?.inquilino||''}" placeholder="Nombre completo"></div>
      <div class="fg"><label class="fl">DNI / NIE</label><input class="fi" id="cf-dni" value="${c?.dni||''}"></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Teléfono</label><input class="fi" id="cf-tel" value="${c?.telefono||''}"></div>
      <div class="fg"><label class="fl">Email</label><input class="fi" id="cf-email" value="${c?.email||''}"></div>
    </div>
    <div class="frow">
      <div class="fg">
        <label class="fl">Fecha inicio *</label>
        <input class="fi" type="date" id="cf-ini" value="${c?.fecha_inicio||''}"
          oninput="autoFechaFin()">
      </div>
      <div class="fg">
        <label class="fl">Fecha fin <span style="font-weight:400;color:var(--txt3)">(def. 12 meses)</span></label>
        <input class="fi" type="date" id="cf-fin" value="${c?.fecha_fin||''}">
      </div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Renta mensual (€) *</label><input class="fi" type="number" min="0" id="cf-renta" value="${c?.renta_mensual||''}" placeholder="0"></div>
      <div class="fg"><label class="fl">Periodicidad *</label>
        <select class="fi fsel" id="cf-per">
          ${['mensual','trimestral','cuatrimestral','semestral','anual'].map(p=>`<option value="${p}"${c?.periodicidad===p?' selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Día habitual de cobro</label><input class="fi" type="number" min="1" max="31" id="cf-dia" value="${c?.dia_cobro||''}" placeholder="1-31"></div>
      <div class="fg"><label class="fl">Fianza (€)</label><input class="fi" type="number" min="0" id="cf-fianza" value="${c?.fianza||''}"></div>
    </div>
    <div class="fg"><label class="fl">Notas</label><textarea class="fi ftxt" id="cf-notas">${c?.notas||''}</textarea></div>
    ${isEdit?`<input type="hidden" id="cf-id" value="${c.id}">`:''}
  `;

  // Guardar lista completa para filtrar
  window._inmListData = inms;

  // Mostrar/ocultar lista al hacer foco
  setTimeout(() => {
    const searchEl = document.getElementById("cf-inm-search");
    const listEl   = document.getElementById("cf-inm-list");
    if (!searchEl || !listEl) return;
    searchEl.addEventListener("focus", () => { listEl.style.display = listEl.children.length ? "block" : "none"; });
    searchEl.addEventListener("blur",  () => setTimeout(() => { listEl.style.display = "none"; }, 200));
  }, 100);
}

// Filtrar inmuebles mientras escribe
// ── Abrir contrato con inmueble preseleccionado (desde pestaña Inmuebles) ──
function renderContratoFormConInmueble(inmuebleId) {
  const inm = API.getInmuebles().find(i => i.id === inmuebleId);
  if (!inm) { renderContratoForm(null); return; }

  // Reutilizar renderContratoForm normal pero con el inmueble bloqueado
  renderContratoForm(null);

  // Preseleccionar y bloquear el inmueble
  setTimeout(() => {
    const hiddenInm = document.getElementById('cf-inm');
    if (hiddenInm) hiddenInm.value = inmuebleId;
    const sel = document.getElementById('cf-inm-sel');
    if (sel) {
      sel.style.display = 'block';
      sel.innerHTML = `<span>✅ ${inm.localidad} — ${inm.tipo} — ${inm.direccion.slice(0,45)}</span>
        <span style="font-size:10px;color:var(--txt3)">(desde edición de inmueble)</span>`;
    }
    // Prellenar renta si ya tiene precio_alquiler
    if (inm.precio_alquiler) {
      const rentaEl = document.getElementById('cf-renta');
      if (rentaEl) rentaEl.value = inm.precio_alquiler;
    }
    // Fecha inicio = hoy por defecto
    const iniEl = document.getElementById('cf-ini');
    if (iniEl && !iniEl.value) iniEl.value = hoy();
  }, 50);
}

function filtrarInmuebles() {
  const q = (document.getElementById('cf-inm-search').value||'').toLowerCase();
  const lista = window._inmListData || [];
  const filtrados = q ? lista.filter(i =>
    i.localidad.toLowerCase().includes(q) ||
    i.direccion.toLowerCase().includes(q) ||
    i.tipo.toLowerCase().includes(q)
  ) : lista;
  const lEl=document.getElementById('cf-inm-list');lEl.style.display='block';lEl.innerHTML = filtrados.length
    ? filtrados.map(i=>`
        <div class="inm-list-item" onclick="seleccionarInmueble('${i.id}','${i.localidad}','${i.tipo}','${i.direccion.slice(0,50).replace(/'/g,'')}')">
          <div class="inm-list-loc">${i.localidad} · <span class="badge badge-sup">${i.tipo}</span></div>
          <div class="inm-list-dir">${i.direccion}</div>
        </div>`).join('')
    : `<div class="inm-list-empty">Sin resultados</div>`;
}

// Al pulsar un inmueble de la lista
function seleccionarInmueble(id, localidad, tipo, dir) {
  document.getElementById('cf-inm').value = id;
  document.getElementById('cf-inm-search').value = '';
  document.getElementById('cf-inm-list').innerHTML = '';
  const sel = document.getElementById('cf-inm-sel');
  sel.style.display = 'block';
  sel.innerHTML = `<span>✅ ${localidad} — ${tipo} — ${dir}</span>
    <button onclick="deseleccionarInmueble()" class="inm-desel">✕</button>`;
}

function deseleccionarInmueble() {
  document.getElementById('cf-inm').value = '';
  document.getElementById('cf-inm-sel').style.display = 'none';
  filtrarInmuebles();
}

// Auto-calcula fecha_fin = fecha_inicio + 12 meses
// Solo en contratos nuevos (no hay id oculto cf-id)
function autoFechaFin() {
  const isEdit = !!document.getElementById('cf-id');
  if (isEdit) return; // en edición el usuario gestiona la fecha manualmente
  const ini = document.getElementById('cf-ini')?.value;
  const fin = document.getElementById('cf-fin');
  if (!ini || !fin) return;
  fin.value = addMeses(ini, 12);
}

async function saveContrato() {
  const inmId = document.getElementById('cf-inm').value;
  const ini   = document.getElementById('cf-ini').value;
  const renta = parseFloat(document.getElementById('cf-renta').value)||0;
  const per   = document.getElementById('cf-per').value;

  if (!inmId) { toast('Selecciona un inmueble', true); return; }
  if (!ini)   { toast('La fecha de inicio es obligatoria', true); return; }
  if (!renta) { toast('La renta mensual es obligatoria', true); return; }

  // Deshabilitar botón inmediatamente para evitar doble envío
  const btnGuardar = document.querySelector('#ctr-modal .btn-p');
  if (btnGuardar) {
    btnGuardar.disabled = true;
    btnGuardar.textContent = '⏳ Guardando...';
  }

  const isEdit = !!document.getElementById('cf-id');
  const id     = isEdit ? document.getElementById('cf-id').value : idContrato();

  const obj = {
    id, inmueble_id: inmId,
    inquilino:    document.getElementById('cf-inq').value.trim(),
    dni:          document.getElementById('cf-dni').value.trim(),
    telefono:     document.getElementById('cf-tel').value.trim(),
    email:        document.getElementById('cf-email').value.trim(),
    fecha_inicio: ini,
    fecha_fin:    document.getElementById('cf-fin').value || addMeses(ini, 12),
    renta_mensual: renta,
    periodicidad: per,
    dia_cobro:    parseInt(document.getElementById('cf-dia').value)||0,
    fianza:       parseFloat(document.getElementById('cf-fianza').value)||0,
    activo:       true,
    notas:        document.getElementById('cf-notas').value.trim()
  };

  // Cerrar modal y mostrar overlay de progreso
  closeModal('ctr-modal');
  showProgress(isEdit ? ['Guardando cambios...'] : [
    'Actualizando inmueble...',
    'Creando contrato...',
    'Comprobando pagos...'
  ]);

  try {
    let nPagos = 0;
    if (isEdit) {
      await API.updateContrato(obj);
    } else {
      // 1. Actualizar inmueble PRIMERO → alquilado + precio_alquiler
      setProgressStep(0);
      const inm = API.getInmuebles().find(i=>i.id===inmId);
      if (inm) {
        const inmActualizado = { ...inm, alquilado: true, precio_alquiler: renta };
        await API.updateInm(inmActualizado);
      }

      // 2. Crear contrato
      setProgressStep(1);
      await API.createContrato(obj);

      // 3. Sincronizar pagos si el primer vencimiento cae en ≤31 días
      setProgressStep(2);
      nPagos = await sincronizarPagos();
    }

    hideProgress();
    _resetCtrModalBtn(); // siempre resetear al terminar
    renderAlquileres();
    if (typeof renderList === 'function') renderList();
    const msg = isEdit ? 'Actualizado' :
      (nPagos > 0
        ? `Inmueble marcado alquilado · ${nPagos} pago${nPagos>1?'s':''} generado${nPagos>1?'s':''}`
        : 'Inmueble marcado alquilado · Pago se generará cuando falten ≤31 días');
    toast('✅ Contrato guardado · ' + msg);
  } catch(e) {
    hideProgress();
    _resetCtrModalBtn();
    toast('Error: ' + e.message, true);
  }
}


// ── Modal: Baja de contrato ──────────────────────────────────────
let _bajaId = null;
function openBajaModal(id) {
  _bajaId = id;
  document.getElementById('baja-fecha').value = hoy();
  const btnB = document.querySelector('#baja-modal .btn-d');
  if (btnB) { btnB.disabled = false; btnB.textContent = 'Confirmar baja'; }
  document.getElementById('baja-modal').classList.add('open');
}
async function confirmarBaja() {
  const fecha = document.getElementById('baja-fecha').value;
  if (!fecha) { toast('Selecciona la fecha de baja', true); return; }

  const btnBaja = document.querySelector('#baja-modal .btn-d');
  if (btnBaja) { btnBaja.disabled = true; btnBaja.textContent = '⏳ Procesando...'; }
  const resetBtn = () => { if(btnBaja){btnBaja.disabled=false;btnBaja.textContent='Confirmar baja';} };

  closeModal('baja-modal');
  showProgress(['Dando de baja contrato...', 'Liberando inmueble...', 'Eliminando pagos futuros...']);

  try {
    setProgressStep(0);
    const ctr = API.getContratos().find(c=>c.id===_bajaId);
    await API.bajaContrato(_bajaId, fecha);

    setProgressStep(1);
    if (ctr) {
      const inm = API.getInmuebles().find(i=>i.id===ctr.inmueble_id);
      if (inm) {
        await API.updateInm({ ...inm, alquilado: false, precio_alquiler: 0 });
      }
    }

    setProgressStep(2);
    // pequeña pausa visual para que se vea el paso 3
    await new Promise(r => setTimeout(r, 400));

    hideProgress();
    closeAlqDetail();
    renderAlquileres();
    if (typeof renderList === 'function') renderList();
    toast('✅ Contrato dado de baja · Inmueble libre · Pagos futuros eliminados');
  } catch(e) {
    hideProgress(); resetBtn();
    toast('Error: ' + e.message, true);
  }
}

// ── Modal: Registrar cobro ───────────────────────────────────────
let _pagoId = null;
function openCobrarModal(id) {
  const p = API.getPagos().find(x => x.id === id);
  if (!p) { toast('Pago no encontrado', true); return; }

  // Guardar pago antes de verificar mes ya cobrado
  // Verificar si ya existe otro pago cobrado para el mismo mes de este contrato
  const mesPago = aniomes(p.fecha_vencimiento);
  const yaExisteCobrado = API.getPagos().some(x =>
    x.id !== id &&
    x.contrato_id === p.contrato_id &&
    x.estado === 'cobrado' &&
    aniomes(x.fecha_vencimiento) === mesPago
  );
  if (yaExisteCobrado) {
    toast('⚠ Ya existe un cobro registrado para este periodo', true);
    return;
  }
  // También bloquear si el propio pago ya está cobrado
  if (p.estado === 'cobrado') {
    toast('Este pago ya está registrado como cobrado', true);
    return;
  }

  _pagoId = id;
  const ctr = API.getContratos().find(c => c.id === p.contrato_id);
  const inm = API.getInmuebles().find(i => i.id === p.inmueble_id) || {};

  document.getElementById('cobro-fecha').value   = hoy();
  document.getElementById('cobro-forma').value   = 'transferencia';
  document.getElementById('cobro-notas').value   = '';
  document.getElementById('cobro-importe').textContent = fmtE(p.importe);
  document.getElementById('cobro-vence').textContent  = fmtFecha(p.fecha_vencimiento);
  document.getElementById('cobro-quien').innerHTML =
    `<strong>${ctr?.inquilino || '—'}</strong>
     <span style="font-size:11px;color:var(--txt2);margin-left:6px">${inm.tipo||''} · ${inm.localidad||''}</span>`;

  const btnC = document.querySelector('#cobro-modal .btn-p');
  if (btnC) { btnC.disabled = false; btnC.textContent = '✅ Confirmar cobro'; }
  document.getElementById('cobro-modal').classList.add('open');
}

async function confirmarCobro() {
  const fecha = document.getElementById('cobro-fecha').value;
  const forma = document.getElementById('cobro-forma').value;
  const notas = document.getElementById('cobro-notas').value;
  if (!fecha) { toast('Indica la fecha de cobro', true); return; }

  // Doble check antes de guardar: el pago sigue siendo pendiente
  const p = API.getPagos().find(x => x.id === _pagoId);
  if (!p) { toast('Pago no encontrado', true); return; }
  if (p.estado === 'cobrado') { toast('Este pago ya estaba cobrado', true); closeModal('cobro-modal'); return; }

  const btnCobro = document.querySelector('#cobro-modal .btn-p');
  if (btnCobro) { btnCobro.disabled = true; btnCobro.textContent = '⏳ Registrando...'; }
  const resetBtn = () => { if(btnCobro){btnCobro.disabled=false;btnCobro.textContent='✅ Confirmar cobro';} };

  closeModal('cobro-modal');
  showProgress(['Registrando cobro...']);

  try {
    await API.cobrarPago(_pagoId, fecha, forma, notas);
    hideProgress();
    // Refrescar el panel activo
    if (document.getElementById('screen-avisos')?.classList.contains('active')) {
      _renderPagos();
      updateAvisosBadge();
    } else {
      _renderAlquileres();
      updateAvisosBadge();
    }
    toast('✅ Cobro registrado correctamente');
  } catch(e) {
    hideProgress(); resetBtn();
    toast('Error: ' + e.message, true);
  }
}

function openDetallePago(id) {
  const p = API.getPagos().find(x=>x.id===id);
  if (p) openDetalleContrato(p.contrato_id);
}

// ── Renovar contrato — extiende fecha_fin +12 meses y guarda ────
let _renovModal = null;
function renovarContrato(id) {
  const c = API.getContratos().find(x => x.id === id);
  if (!c) return;

  // Calcular nueva fecha_fin: base = fecha_fin actual si es futura, si no hoy
  const base     = c.fecha_fin && c.fecha_fin > hoy() ? c.fecha_fin : hoy();
  const nuevaFin = addMeses(base, 12);
  const inm      = API.getInmuebles().find(i => i.id === c.inmueble_id) || {};

  // Modal de confirmación rápida (sin abrir el formulario completo)
  if (!_renovModal) {
    _renovModal = document.createElement('div');
    _renovModal.className = 'modal-overlay';
    _renovModal.id = 'renov-modal';
    _renovModal.addEventListener('click', e => { if (e.target === _renovModal) _renovModal.classList.remove('open'); });
    document.getElementById('app').appendChild(_renovModal);
  }
  _renovModal.innerHTML = `<div class="modal">
    <div class="mhandle"></div>
    <div class="mtitle">🔄 Renovar contrato</div>
    <div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">${c.inquilino || '—'}</div>
      <div style="font-size:12px;color:var(--txt2)">${inm.tipo||''} · ${inm.localidad||''}</div>
      <div style="font-size:12px;color:var(--txt2);margin-top:2px">${inm.direccion||''}</div>
    </div>
    <div class="frow" style="margin-bottom:14px">
      <div class="fg">
        <label class="fl">Fin actual</label>
        <div style="padding:10px 12px;background:var(--sur2);border:1px solid var(--bdr);border-radius:10px;font-size:14px;color:var(--txt2)">${fmtFecha(c.fecha_fin)}</div>
      </div>
      <div class="fg">
        <label class="fl">Nueva fecha fin</label>
        <input class="fi" type="date" id="renov-nueva-fin" value="${nuevaFin}">
      </div>
    </div>
    <div class="fg">
      <label class="fl">Nueva renta mensual (€) <span style="font-weight:400;color:var(--txt3)">opcional</span></label>
      <input class="fi" type="number" id="renov-renta" value="${c.renta_mensual||''}" placeholder="${c.renta_mensual||''}">
    </div>
    <div class="mbtns">
      <button class="btn btn-s" onclick="document.getElementById('renov-modal').classList.remove('open')">Cancelar</button>
      <button class="btn btn-p" onclick="confirmarRenovacion('${id}')" style="flex:2">🔄 Confirmar renovación</button>
    </div>
  </div>`;
  _renovModal.classList.add('open');
}

async function confirmarRenovacion(id) {
  const c = API.getContratos().find(x => x.id === id);
  if (!c) return;

  const nuevaFin   = document.getElementById('renov-nueva-fin')?.value;
  const nuevaRenta = parseFloat(document.getElementById('renov-renta')?.value) || c.renta_mensual;
  if (!nuevaFin) { toast('Indica la nueva fecha de fin', true); return; }

  const btn = document.querySelector('#renov-modal .btn-p');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }

  document.getElementById('renov-modal').classList.remove('open');
  showProgress(['Guardando renovación...', 'Actualizando inmueble...']);

  try {
    setProgressStep(0);
    const cActualizado = { ...c, fecha_fin: nuevaFin, renta_mensual: nuevaRenta };
    await API.updateContrato(cActualizado);

    // Si cambió la renta, actualizar también el inmueble
    if (nuevaRenta !== c.renta_mensual) {
      setProgressStep(1);
      const inm = API.getInmuebles().find(i => i.id === c.inmueble_id);
      if (inm) await API.updateInm({ ...inm, precio_alquiler: nuevaRenta });
    }

    hideProgress();
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Confirmar renovación'; }

    // Refrescar — el contrato ya no aparecerá en avisos
    _renderRenovaciones();
    _renderAlquileres();
    updateAvisosBadge();
    if (typeof renderList === 'function') renderList();
    toast(`✅ Contrato renovado hasta ${fmtFecha(nuevaFin)}`);
  } catch(e) {
    hideProgress();
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Confirmar renovación'; }
    toast('Error: ' + e.message, true);
  }
}

// ── Subir IPC — actualiza renta con porcentaje ───────────────────
function subirIPC(id) {
  const c = API.getContratos().find(x => x.id === id);
  if (!c) return;

  // Crear modal de subida IPC
  let modal = document.getElementById('ipc-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ipc-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal">
      <div class="mhandle"></div>
      <div class="mtitle">📈 Actualizar renta</div>
      <div id="ipc-info" style="background:var(--sur2);border:1px solid var(--bdr);border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px"></div>
      <div class="fg">
        <label class="fl">Incremento (%)</label>
        <input class="fi" type="number" id="ipc-pct" value="3.5" step="0.1" min="0" max="20" placeholder="Ej: 3.5">
      </div>
      <div class="fg">
        <label class="fl">Nueva renta mensual (€)</label>
        <input class="fi" type="number" id="ipc-nueva" step="0.01" min="0">
      </div>
      <div id="ipc-preview" style="font-size:12px;color:var(--grn);margin-bottom:8px;text-align:center"></div>
      <div class="mbtns">
        <button class="btn btn-s" onclick="closeModal('ipc-modal')">Cancelar</button>
        <button class="btn btn-p" onclick="confirmarIPC()" style="flex:2">✅ Aplicar</button>
      </div>
    </div>`;
    modal.addEventListener('click', e => { if(e.target===modal) modal.classList.remove('open'); });
    document.getElementById('app').appendChild(modal);

    // Actualizar nueva renta al cambiar % 
    document.getElementById('ipc-pct').addEventListener('input', calcIPC);
    document.getElementById('ipc-nueva').addEventListener('input', () => {
      document.getElementById('ipc-preview').textContent = '';
    });
  }

  window._ipcContratoId = id;
  const rentaActual = c.renta_mensual || 0;
  document.getElementById('ipc-info').innerHTML =
    `<strong>${c.inquilino || '—'}</strong><br>
     Renta actual: <strong style="color:var(--acc)">${fmtE(rentaActual)}/mes</strong>`;
  document.getElementById('ipc-pct').value = '3.5';
  calcIPC();
  modal.classList.add('open');
}

function calcIPC() {
  const id = window._ipcContratoId;
  const c  = id ? API.getContratos().find(x=>x.id===id) : null;
  if (!c) return;
  const pct     = parseFloat(document.getElementById('ipc-pct')?.value) || 0;
  const nueva   = Math.round(c.renta_mensual * (1 + pct/100) * 100) / 100;
  const nEl     = document.getElementById('ipc-nueva');
  const prevEl  = document.getElementById('ipc-preview');
  if (nEl) nEl.value = nueva;
  if (prevEl) prevEl.textContent =
    `${fmtE(c.renta_mensual)} → ${fmtE(nueva)} (+${fmtE(nueva - c.renta_mensual, 2)}/mes)`;
}

async function confirmarIPC() {
  const id     = window._ipcContratoId;
  const c      = id ? API.getContratos().find(x=>x.id===id) : null;
  if (!c) return;
  const nueva  = parseFloat(document.getElementById('ipc-nueva')?.value) || 0;
  if (!nueva || nueva <= 0) { toast('Introduce una renta válida', true); return; }

  const btn = document.querySelector('#ipc-modal .btn-p');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Aplicando...'; }

  closeModal('ipc-modal');
  showProgress(['Actualizando renta del contrato...', 'Actualizando inmueble...']);

  try {
    setProgressStep(0);
    const cActualizado = { ...c, renta_mensual: nueva };
    await API.updateContrato(cActualizado);

    setProgressStep(1);
    const inm = API.getInmuebles().find(i => i.id === c.inmueble_id);
    if (inm) await API.updateInm({ ...inm, precio_alquiler: nueva });

    hideProgress();
    if (btn) { btn.disabled = false; btn.textContent = '✅ Aplicar'; }
    renderAvisos();
    if (typeof renderList === 'function') renderList();
    toast(`✅ Renta actualizada a ${fmtE(nueva)}/mes`);
  } catch(e) {
    hideProgress();
    if (btn) { btn.disabled = false; btn.textContent = '✅ Aplicar'; }
    toast('Error: ' + e.message, true);
  }
}
