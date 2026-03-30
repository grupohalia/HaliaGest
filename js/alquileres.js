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
function proximoVencimiento(contrato) {
  const meses  = MESES_PERIODO[contrato.periodicidad] || 1;
  const fin    = contrato.fecha_fin || '2099-12-31';
  let fecha    = addMeses(contrato.fecha_inicio, meses);

  // Avanzar hasta el primer vencimiento futuro o actual
  while (fecha < hoy() && fecha <= fin) {
    fecha = addMeses(fecha, meses);
  }
  if (fecha > fin) return null; // contrato terminado
  return fecha;
}

// ── Revisar todos los contratos activos y crear pagos pendientes ─
// Lógica: para cada contrato activo, busca el próximo vencimiento.
// Si faltan ≤31 días y no existe ya ese pago → lo crea.
// También marca como "vencido" los pagos pendientes ya pasados.
async function sincronizarPagos() {
  const contratos = API.getContratos().filter(c => c.activo === true || c.activo === 'TRUE');
  const pagosExistentes = API.getPagos();
  const hoyStr = hoy();
  const nuevos = [];

  contratos.forEach(c => {
    const meses   = MESES_PERIODO[c.periodicidad] || 1;
    const importe = importePeriodo(c.renta_mensual, c.periodicidad);
    const fin     = c.fecha_fin || '2099-12-31';

    // Calcular el próximo vencimiento del contrato
    const prox = proximoVencimiento(c);
    if (!prox) return; // contrato ya terminado

    // Comprobar si ya existe ese pago (evitar duplicados)
    const yaExiste = pagosExistentes.some(
      p => p.contrato_id === c.id && p.fecha_vencimiento === prox
    );

    // Crear solo si faltan ≤31 días y no existe
    if (!yaExiste && diasHasta(prox) <= 31) {
      nuevos.push({
        id:                idPago(),
        contrato_id:       c.id,
        inmueble_id:       c.inmueble_id,
        fecha_vencimiento: prox,
        importe:           importe,
        estado:            'pendiente',
        fecha_cobro:       '',
        forma_pago:        '',
        notas:             ''
      });
    }
  });

  // Crear todos los nuevos en una sola llamada
  if (nuevos.length > 0) {
    await API.createPagos(nuevos);
  }
  return nuevos.length;
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
async function renderAlquileres() {
  // Pintar inmediatamente con datos actuales
  _renderAlquileres();
  // Sincronizar en background y repintar si hay cambios
  if (!_sincronizando && API.isConfigured()) {
    _sincronizando = true;
    try {
      const n = await sincronizarPagos();
      if (n > 0) {
        console.log(`[Pagos] ${n} nuevo(s) generado(s)`);
        _renderAlquileres();
        updateAvisosBadge();
      }
    } catch(e) {
      console.warn('[Pagos] Error en sincronización:', e.message);
    } finally {
      _sincronizando = false;
    }
  }
}

// ── Render pestaña Avisos (independiente) ───────────────────────
async function renderAvisos() {
  // Pintar inmediatamente con datos actuales
  _renderAvisos();
  // Luego sincronizar en background y repintar si hay cambios
  if (!_sincronizando && API.isConfigured()) {
    _sincronizando = true;
    try {
      const n = await sincronizarPagos();
      if (n > 0) {
        _renderAvisos(); // repintar con los nuevos pagos
        updateAvisosBadge();
      }
    } catch(e) {
      console.warn('[Avisos] Error sync:', e.message);
    } finally {
      _sincronizando = false;
    }
  }
}

function _renderAvisos() {
  const contratos = API.getContratos();
  const pagos     = API.getPagos();
  const inmuebles = API.getInmuebles();

  const avisos = pagos
    .filter(p => p.estado === 'pendiente')
    .map(p => ({ ...p, _ev: estadoVisual(p) }))
    .filter(p => p._ev.cls === 'badge-proximo' || p._ev.cls === 'badge-vencido')
    .sort((a,b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

  // Separar por tipo
  const vencidos = avisos.filter(p => p._ev.cls === 'badge-vencido');
  const proximos = avisos.filter(p => p._ev.cls === 'badge-proximo');

  let html = '';

  // ── VENCIDOS ──────────────────────────────────────────────────
  if (vencidos.length) {
    html += `<div class="alq-section">
      <div class="alq-sec-title" style="color:var(--red)">🔴 Pagos vencidos (${vencidos.length})</div>`;
    vencidos.forEach(p => html += renderAvisoCard(p, contratos, inmuebles));
    html += `</div>`;
  }

  // ── PRÓXIMOS ──────────────────────────────────────────────────
  if (proximos.length) {
    html += `<div class="alq-section">
      <div class="alq-sec-title" style="color:var(--ylw)">🟡 Próximos 31 días (${proximos.length})</div>`;
    proximos.forEach(p => html += renderAvisoCard(p, contratos, inmuebles));
    html += `</div>`;
  }

  if (!avisos.length) {
    html += `<div class="avisos-empty">
      <div class="avisos-empty-icon">✅</div>
      <div class="avisos-empty-title">Todo al día</div>
      <div class="avisos-empty-sub">No hay pagos vencidos ni vencimientos en los próximos 31 días</div>
    </div>`;
  }

  document.getElementById('avisos-body').innerHTML = html;
  updateAvisosBadge();
} // end _renderAvisos

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
  const hoyStr  = hoy();
  const contratos = API.getContratos();
  const pagos     = API.getPagos();
  const inmuebles = API.getInmuebles();

  // Contratos activos
  const activos  = contratos.filter(c => c.activo === true || c.activo === 'TRUE');
  const inactivos = contratos.filter(c => !(c.activo === true || c.activo === 'TRUE'));

  let html = '';

  // ── CONTRATOS ACTIVOS ─────────────────────────────────────────
  html += `<div class="alq-section">
    <div class="alq-sec-title">
      📋 Contratos activos (${activos.length})
      <button class="abtn abtn-new" onclick="openNuevoContrato()">+ Nuevo</button>
    </div>`;

  if (!activos.length) {
    html += `<div class="alq-empty">No hay contratos activos. Pulsa "+ Nuevo" para crear uno.</div>`;
  } else {
    activos.forEach(c => {
      const inm  = inmuebles.find(i=>i.id===c.inmueble_id) || {};
      const pCtr = pagos.filter(p=>p.contrato_id===c.id);
      const pend  = pCtr.filter(p=>p.estado==='pendiente').length;
      const cobrados = pCtr.filter(p=>p.estado==='cobrado').length;
      html += `<div class="alq-card contrato-card" onclick="openDetalleContrato('${c.id}')">
        <div class="alq-card-top">
          <div>
            <div class="alq-card-title">${c.inquilino || '—'}</div>
            <div class="alq-card-sub">${inm.localidad||''} · ${inm.tipo||''}</div>
            <div class="alq-card-sub" style="margin-top:2px">${inm.direccion ? inm.direccion.split(' ').slice(0,6).join(' ')+'...' : '—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="alq-importe">${fmtE(c.renta_mensual)}<span style="font-size:10px;font-weight:400">/mes</span></div>
            <div class="alq-fecha">${c.periodicidad}</div>
            <div class="alq-fecha">desde ${fmtFecha(c.fecha_inicio)}</div>
          </div>
        </div>
        <div class="alq-stats">
          <span>📅 Pagos pendientes: <strong>${pend}</strong></span>
          <span>✅ Cobrados: <strong>${cobrados}</strong></span>
        </div>
      </div>`;
    });
  }
  html += `</div>`;

  // ── CONTRATOS INACTIVOS ───────────────────────────────────────
  if (inactivos.length) {
    html += `<div class="alq-section">
      <div class="alq-sec-title">📁 Contratos finalizados (${inactivos.length})</div>`;
    inactivos.forEach(c => {
      const inm = inmuebles.find(i=>i.id===c.inmueble_id) || {};
      html += `<div class="alq-card contrato-inactivo" onclick="openDetalleContrato('${c.id}')">
        <div class="alq-card-top">
          <div>
            <div class="alq-card-title" style="opacity:.6">${c.inquilino || '—'}</div>
            <div class="alq-card-sub">${inm.localidad||''} · hasta ${fmtFecha(c.fecha_fin)}</div>
          </div>
          <div class="alq-importe" style="opacity:.5">${fmtE(c.renta_mensual)}/mes</div>
        </div>
      </div>`;
    });
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
      <div class="fg"><label class="fl">Fecha inicio *</label><input class="fi" type="date" id="cf-ini" value="${c?.fecha_inicio||''}"></div>
      <div class="fg"><label class="fl">Fecha fin</label><input class="fi" type="date" id="cf-fin" value="${c?.fecha_fin||''}"></div>
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
    fecha_fin:    document.getElementById('cf-fin').value || '',
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
  _pagoId = id;
  const p   = API.getPagos().find(x=>x.id===id);
  const ctr = p ? API.getContratos().find(c=>c.id===p.contrato_id) : null;
  document.getElementById('cobro-fecha').value    = hoy();
  document.getElementById('cobro-forma').value    = 'transferencia';
  document.getElementById('cobro-importe').textContent = p ? fmtE(p.importe) : '';
  document.getElementById('cobro-vence').textContent  = p ? fmtFecha(p.fecha_vencimiento) : '';
  document.getElementById('cobro-quien').textContent  = ctr ? ctr.inquilino : '';
  document.getElementById('cobro-notas').value    = '';
  const btnC = document.querySelector('#cobro-modal .btn-p');
  if (btnC) { btnC.disabled = false; btnC.textContent = '✅ Confirmar cobro'; }
  document.getElementById('cobro-modal').classList.add('open');
}
async function confirmarCobro() {
  const fecha = document.getElementById('cobro-fecha').value;
  const forma = document.getElementById('cobro-forma').value;
  const notas = document.getElementById('cobro-notas').value;
  if (!fecha) { toast('Indica la fecha de cobro', true); return; }

  const btnCobro = document.querySelector('#cobro-modal .btn-p');
  if (btnCobro) { btnCobro.disabled = true; btnCobro.textContent = '⏳ Registrando...'; }
  const resetBtn = () => { if(btnCobro){btnCobro.disabled=false;btnCobro.textContent='✅ Confirmar cobro';} };

  closeModal('cobro-modal');
  showProgress(['Registrando cobro...']);

  try {
    await API.cobrarPago(_pagoId, fecha, forma, notas);
    hideProgress();
    if (document.getElementById('screen-avisos')?.classList.contains('active')) {
      renderAvisos();
    } else {
      renderAlquileres();
    }
    updateAvisosBadge();
    toast('✅ Pago registrado como cobrado');
  } catch(e) {
    hideProgress(); resetBtn();
    toast('Error: ' + e.message, true);
  }
}

function openDetallePago(id) {
  const p = API.getPagos().find(x=>x.id===id);
  if (p) openDetalleContrato(p.contrato_id);
}
