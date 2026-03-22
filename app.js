// ============================================================
// app.js — Lógica principal de GestorFincas
// ============================================================

// ── Estado ──────────────────────────────────────────────────
const State = {
  filtroTipo: '',
  filtroLoc: '',
  filtroEstado: '',
  searchQuery: '',
  currentId: null,
  isNew: false,
  period: 'mensual',
  tab: 'list',
  loading: false,
};

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n, d = 0) =>
  n == null || n === '' ? '—'
  : new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const fmtE = (n, d = 0) => (n == null || n === '' || n === 0) ? '—' : fmt(n, d) + ' €';

const TIPO_ICON  = { Vivienda: '🏠', Garaje: '🚗', Trastero: '📦', Local: '🏪' };
const TIPO_CLASS = { Vivienda: 'vivienda', Garaje: 'garaje', Trastero: 'trastero', Local: 'local' };
const TIPO_ICON_CLASS = { Vivienda: 'icon-vivienda', Garaje: 'icon-garaje', Trastero: 'icon-trastero', Local: 'icon-local' };

const propIcon      = t => TIPO_ICON[t]      || '🏠';
const propClass     = t => TIPO_CLASS[t]     || 'vivienda';
const propIconClass = t => TIPO_ICON_CLASS[t] || 'icon-vivienda';

let toastTimer = null;
function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = 'toast', 2400);
}

function setLoading(on) {
  State.loading = on;
  const spinner = document.getElementById('loading-bar');
  if (spinner) spinner.style.display = on ? 'block' : 'none';
}

// ── Filtros ──────────────────────────────────────────────────
function buildLocFilter() {
  const locs = [...new Set(API.getAll().map(p => p.localidad))].sort();
  const el = document.getElementById('filters-loc');
  el.innerHTML = `<button class="filter-chip ${!State.filtroLoc ? 'active' : ''}" onclick="setFiltroLoc(this,'')">Todas</button>`;
  locs.forEach(l => {
    const b = document.createElement('button');
    b.className = 'filter-chip' + (State.filtroLoc === l ? ' active' : '');
    b.textContent = l;
    b.onclick = () => setFiltroLoc(b, l);
    el.appendChild(b);
  });
}

function setFiltroTipo(el, val) {
  State.filtroTipo = val;
  document.querySelectorAll('#filters-tipo .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderList();
}
function setFiltroLoc(el, val) {
  State.filtroLoc = val;
  document.querySelectorAll('#filters-loc .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderList();
}
function setFiltroEstado(el, val) {
  State.filtroEstado = val;
  document.querySelectorAll('#filters-estado .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderList();
}
function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').style.display = 'none';
  State.searchQuery = '';
  renderList();
}

function getFiltered() {
  const q = State.searchQuery.toLowerCase();
  return API.getAll().filter(p => {
    if (State.filtroTipo && p.tipo !== State.filtroTipo) return false;
    if (State.filtroLoc && p.localidad !== State.filtroLoc) return false;
    if (State.filtroEstado === 'alquilado' && !p.alquilado) return false;
    if (State.filtroEstado === 'libre' && p.alquilado) return false;
    if (q && !p.direccion.toLowerCase().includes(q)
           && !p.referencia_catastral.toLowerCase().includes(q)
           && !p.localidad.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ── Render Lista ─────────────────────────────────────────────
function renderList() {
  const filtered = getFiltered();
  const alq = filtered.filter(p => p.alquilado).length;

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-pill"><strong>${filtered.length}</strong> inmuebles</div>
    <div class="stat-pill green"><strong>${alq}</strong> alquilados</div>
    <div class="stat-pill"><strong>${filtered.length - alq}</strong> libres</div>
  `;

  const byLoc = {};
  filtered.forEach(p => { (byLoc[p.localidad] = byLoc[p.localidad] || []).push(p); });

  const container = document.getElementById('list-container');
  if (!filtered.length) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">😕</div><div>No se encontraron inmuebles</div></div>';
    return;
  }

  let html = '';
  Object.keys(byLoc).sort().forEach(loc => {
    html += `<div class="section-label">📍 ${loc} <span>(${byLoc[loc].length})</span></div>`;
    byLoc[loc].forEach(p => {
      html += `
      <div class="prop-card ${propClass(p.tipo)}" onclick="openDetail('${p.id}')">
        <div class="prop-card-header">
          <div class="prop-icon ${propIconClass(p.tipo)}">${propIcon(p.tipo)}</div>
          <div class="prop-info">
            <div class="prop-tipo">${p.tipo}</div>
            <div class="prop-dir">${p.direccion}</div>
            <div class="prop-loc">📍 ${p.localidad}</div>
            <div class="prop-badges">
              <span class="badge ${p.alquilado ? 'badge-alquilado' : 'badge-libre'}">${p.alquilado ? '✅ Alquilado' : '⬜ Libre'}</span>
              ${p.sup_construida ? `<span class="badge badge-sup">${p.sup_construida}m²</span>` : ''}
              ${p.valor_catastral ? `<span class="badge badge-val">${fmt(p.valor_catastral)}€</span>` : ''}
            </div>
          </div>
          <span class="prop-chevron">›</span>
        </div>
      </div>`;
    });
  });
  container.innerHTML = html;
}

// ── Detalle ──────────────────────────────────────────────────
function openDetail(id) {
  State.currentId = id;
  const p = API.getAll().find(x => x.id === id);
  if (!p) return;

  document.getElementById('detail-header-title').textContent = `${propIcon(p.tipo)} ${p.tipo}`;

  const gastosMens = (p.gastos_comunidad || 0) + (p.ibi || 0) / 12 + (p.basuras || 0) / 12;
  const ingresosMens = p.alquilado ? (p.precio_alquiler || 0) : 0;
  const neto = ingresosMens - gastosMens;

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-hero">
      <div class="detail-hero-icon ${propIconClass(p.tipo)}">${propIcon(p.tipo)}</div>
      <div class="detail-hero-info">
        <div class="detail-tipo">${p.tipo}</div>
        <div class="detail-dir">${p.direccion}</div>
        <div class="detail-loc">📍 ${p.localidad}</div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-title">🏛 Datos catastrales</div>
      <div class="field-row"><span class="field-label">Ref. Catastral</span><span class="field-value blue mono">${p.referencia_catastral}</span></div>
      <div class="field-row"><span class="field-label">Derecho</span><span class="field-value">${p.derecho}</span></div>
      <div class="field-row"><span class="field-label">Sup. construida</span><span class="field-value">${p.sup_construida} m²</span></div>
      <div class="field-row"><span class="field-label">Sup. parcela</span><span class="field-value">${p.sup_parcela} m²</span></div>
      <div class="field-row"><span class="field-label">Valor catastral</span><span class="field-value blue">${fmtE(p.valor_catastral)}</span></div>
    </div>

    <div class="section-card">
      <div class="section-card-title">💰 Datos económicos</div>
      <div class="field-row"><span class="field-label">Precio compra</span><span class="field-value">${fmtE(p.precio_compra)}</span></div>
      <div class="field-row"><span class="field-label">Precio venta</span><span class="field-value">${fmtE(p.precio_venta)}</span></div>
      <div class="field-row"><span class="field-label">G. Comunidad / mes</span><span class="field-value red">${fmtE(p.gastos_comunidad)}</span></div>
      <div class="field-row"><span class="field-label">IBI / año</span><span class="field-value red">${fmtE(p.ibi)}</span></div>
      <div class="field-row"><span class="field-label">Basuras / año</span><span class="field-value red">${fmtE(p.basuras)}</span></div>
    </div>

    <div class="section-card">
      <div class="section-card-title">🔑 Estado</div>
      <div class="field-row">
        <span class="field-label">Situación</span>
        <span class="field-value ${p.alquilado ? 'green' : ''}">${p.alquilado ? '✅ Alquilado' : '⬜ Libre'}</span>
      </div>
      ${p.alquilado ? `<div class="field-row"><span class="field-label">Alquiler mensual</span><span class="field-value green">${fmtE(p.precio_alquiler)}</span></div>` : ''}
    </div>

    ${(ingresosMens || gastosMens) ? `
    <div class="section-card">
      <div class="section-card-title">📊 Balance mensual</div>
      <div class="field-row"><span class="field-label">Ingresos</span><span class="field-value green">${fmtE(ingresosMens)}</span></div>
      <div class="field-row"><span class="field-label">Gastos</span><span class="field-value red">${fmtE(gastosMens, 2)}</span></div>
      <div class="field-row"><span class="field-label">Neto</span><span class="field-value ${neto >= 0 ? 'green' : 'red'}">${fmtE(neto, 2)}</span></div>
    </div>` : ''}

    ${p.notas ? `
    <div class="section-card">
      <div class="section-card-title">📝 Notas</div>
      <div class="notes-text">${p.notas}</div>
    </div>` : ''}
  `;

  document.getElementById('detail-screen').classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-screen').classList.remove('open');
  State.currentId = null;
}

// ── Formulario ───────────────────────────────────────────────
function openEditModal() {
  State.isNew = false;
  const p = API.getAll().find(x => x.id === State.currentId);
  if (!p) return;
  document.getElementById('modal-title').textContent = '✏️ Editar Inmueble';
  renderForm(p);
  document.getElementById('edit-modal').classList.add('open');
}

function openNewModal() {
  State.isNew = true;
  State.currentId = null;
  document.getElementById('modal-title').textContent = '➕ Nuevo Inmueble';
  renderForm(null);
  document.getElementById('edit-modal').classList.add('open');
}

function renderForm(p) {
  const locs = [...new Set(API.getAll().map(x => x.localidad))].sort();
  const locOpts = locs.map(l => `<option value="${l}" ${p && p.localidad === l ? 'selected' : ''}>${l}</option>`).join('');
  const alq = p ? p.alquilado : false;

  document.getElementById('modal-form').innerHTML = `
    <div class="form-group">
      <label class="form-label">Dirección *</label>
      <input class="form-input" id="f-dir" value="${p ? p.direccion : ''}" placeholder="Ej: CL MAYOR 10 Es:1 Pl:02...">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Localidad *</label>
        <select class="form-select" id="f-loc" onchange="toggleNuevaLoc(this)">
          ${locOpts}
          <option value="__nueva__">+ Nueva...</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tipo *</label>
        <select class="form-select" id="f-tipo">
          <option value="Vivienda"${p?.tipo==='Vivienda'?' selected':''}>🏠 Vivienda</option>
          <option value="Garaje"${p?.tipo==='Garaje'?' selected':''}>🚗 Garaje</option>
          <option value="Trastero"${p?.tipo==='Trastero'?' selected':''}>📦 Trastero</option>
          <option value="Local"${p?.tipo==='Local'?' selected':''}>🏪 Local</option>
        </select>
      </div>
    </div>
    <div class="form-group" id="f-nueva-loc-wrap" style="display:none">
      <label class="form-label">Nueva localidad</label>
      <input class="form-input" id="f-nueva-loc" placeholder="Nombre de la localidad">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Sup. construida (m²)</label>
        <input class="form-input" type="number" id="f-sup" value="${p?.sup_construida||''}" placeholder="m²">
      </div>
      <div class="form-group">
        <label class="form-label">Valor catastral (€)</label>
        <input class="form-input" type="number" id="f-vcat" value="${p?.valor_catastral||''}" placeholder="€">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Precio compra (€)</label>
        <input class="form-input" type="number" id="f-compra" value="${p?.precio_compra||''}" placeholder="€">
      </div>
      <div class="form-group">
        <label class="form-label">Precio venta (€)</label>
        <input class="form-input" type="number" id="f-venta" value="${p?.precio_venta||''}" placeholder="€">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Comunidad / mes (€)</label>
        <input class="form-input" type="number" id="f-com" value="${p?.gastos_comunidad||''}" placeholder="€/mes">
      </div>
      <div class="form-group">
        <label class="form-label">IBI anual (€)</label>
        <input class="form-input" type="number" id="f-ibi" value="${p?.ibi||''}" placeholder="€/año">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Basuras anuales (€)</label>
      <input class="form-input" type="number" id="f-bas" value="${p?.basuras||''}" placeholder="€/año">
    </div>
    <div class="form-group">
      <div class="toggle-row">
        <span class="toggle-label">¿Está alquilado?</span>
        <div class="toggle${alq?' on':''}" id="f-alq-toggle" onclick="toggleAlquiler()"></div>
      </div>
    </div>
    <div id="f-alq-wrap" style="display:${alq?'block':'none'}">
      <div class="form-group">
        <label class="form-label">Alquiler mensual (€)</label>
        <input class="form-input" type="number" id="f-alq-precio" value="${p?.precio_alquiler||''}" placeholder="€/mes">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-input" id="f-notas" placeholder="Observaciones...">${p?.notas||''}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Ref. Catastral${State.isNew?' *':''}</label>
      <input class="form-input${!State.isNew?' readonly-field':''}" id="f-ref"
        value="${p?.referencia_catastral||''}"
        ${!State.isNew?'readonly':''}
        placeholder="Referencia catastral">
    </div>
  `;
}

function toggleNuevaLoc(sel) {
  document.getElementById('f-nueva-loc-wrap').style.display = sel.value === '__nueva__' ? 'block' : 'none';
}
function toggleAlquiler() {
  const t = document.getElementById('f-alq-toggle');
  t.classList.toggle('on');
  document.getElementById('f-alq-wrap').style.display = t.classList.contains('on') ? 'block' : 'none';
}

async function saveProperty() {
  const ref = (document.getElementById('f-ref')?.value || '').trim();
  const dir = (document.getElementById('f-dir')?.value || '').trim();
  if (!dir) { showToast('La dirección es obligatoria', true); return; }
  if (!ref) { showToast('La referencia catastral es obligatoria', true); return; }

  let loc = document.getElementById('f-loc').value;
  if (loc === '__nueva__') {
    loc = (document.getElementById('f-nueva-loc')?.value || '').trim();
    if (!loc) { showToast('Introduce el nombre de la localidad', true); return; }
  }

  const alq = document.getElementById('f-alq-toggle').classList.contains('on');
  const obj = {
    id: ref,
    referencia_catastral: ref,
    direccion: dir,
    localidad: loc,
    tipo: document.getElementById('f-tipo').value,
    derecho: '100,00 % de Propiedad',
    sup_construida: parseFloat(document.getElementById('f-sup').value) || 0,
    sup_parcela: 0,
    uso: 'Residencial',
    valor_suelo: 0,
    valor_construccion: 0,
    valor_catastral: parseFloat(document.getElementById('f-vcat').value) || 0,
    precio_compra: parseFloat(document.getElementById('f-compra').value) || 0,
    precio_venta: parseFloat(document.getElementById('f-venta').value) || 0,
    gastos_comunidad: parseFloat(document.getElementById('f-com').value) || 0,
    ibi: parseFloat(document.getElementById('f-ibi').value) || 0,
    basuras: parseFloat(document.getElementById('f-bas').value) || 0,
    alquilado: alq,
    precio_alquiler: alq ? (parseFloat(document.getElementById('f-alq-precio').value) || 0) : 0,
    notas: (document.getElementById('f-notas')?.value || '').trim()
  };

  setLoading(true);
  try {
    if (State.isNew) {
      if (API.getAll().find(p => p.id === ref)) {
        showToast('Ya existe un inmueble con esa referencia', true);
        return;
      }
      await API.create(obj);
      State.currentId = ref;
    } else {
      await API.update(obj);
    }
    buildLocFilter();
    renderList();
    renderFinance();
    closeModal('edit-modal');
    showToast('✅ Guardado correctamente');
    if (!State.isNew) setTimeout(() => openDetail(State.currentId), 300);
  } catch (err) {
    showToast('Error: ' + err.message, true);
  } finally {
    setLoading(false);
  }
}

// ── Borrar ───────────────────────────────────────────────────
function confirmDelete() {
  document.getElementById('confirm-modal').classList.add('open');
}
async function deleteProperty() {
  setLoading(true);
  try {
    await API.remove(State.currentId);
    buildLocFilter();
    renderList();
    renderFinance();
    closeModal('confirm-modal');
    closeDetail();
    showToast('🗑 Inmueble eliminado');
  } catch (err) {
    showToast('Error: ' + err.message, true);
  } finally {
    setLoading(false);
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ── Finanzas ─────────────────────────────────────────────────
function setPeriod(p, el) {
  State.period = p;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderFinance();
}

function renderFinance() {
  const mul = State.period === 'anual' ? 12 : 1;
  const sub = State.period === 'anual' ? '/año' : '/mes';
  const all = API.getAll();

  let totalIng = 0, totalGastos = 0;
  all.forEach(p => {
    if (p.alquilado) totalIng += (p.precio_alquiler || 0);
    totalGastos += (p.gastos_comunidad || 0) + (p.ibi || 0) / 12 + (p.basuras || 0) / 12;
  });
  totalIng *= mul; totalGastos *= mul;
  const neto = totalIng - totalGastos;
  const totalVC = all.reduce((s, p) => s + (p.valor_catastral || 0), 0);

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Ingresos</div>
      <div class="kpi-val kpi-green">${fmt(totalIng)}€</div>
      <div class="kpi-sub">${sub}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Gastos</div>
      <div class="kpi-val kpi-red">${fmt(totalGastos, 0)}€</div>
      <div class="kpi-sub">${sub}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Neto</div>
      <div class="kpi-val ${neto >= 0 ? 'kpi-green' : 'kpi-red'}">${fmt(neto, 0)}€</div>
      <div class="kpi-sub">${sub}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Valor catastral</div>
      <div class="kpi-val kpi-blue">${fmt(totalVC / 1000, 0)}K€</div>
      <div class="kpi-sub">total</div>
    </div>
  `;

  const tipos = ['Vivienda', 'Local', 'Garaje', 'Trastero'];
  let html = '<div class="finance-section"><div class="finance-section-header">Por tipo de inmueble</div>';
  tipos.forEach(t => {
    const list = all.filter(p => p.tipo === t);
    if (!list.length) return;
    const ing  = list.reduce((s,p) => s + (p.alquilado ? p.precio_alquiler||0 : 0), 0) * mul;
    const gast = list.reduce((s,p) => s + (p.gastos_comunidad||0) + (p.ibi||0)/12 + (p.basuras||0)/12, 0) * mul;
    html += `<div class="finance-row">
      <div class="finance-row-label">${propIcon(t)} ${t} <span class="finance-row-count">${list.length}</span></div>
      <div class="finance-row-vals">
        <span class="val-green">+${fmt(ing, 0)}€</span>
        <span class="val-red">−${fmt(gast, 0)}€</span>
      </div>
    </div>`;
  });
  html += '</div>';

  const locs = [...new Set(all.map(p => p.localidad))].sort();
  html += '<div class="finance-section"><div class="finance-section-header">Por localidad</div>';
  locs.forEach(loc => {
    const list = all.filter(p => p.localidad === loc);
    const ing  = list.reduce((s,p) => s + (p.alquilado ? p.precio_alquiler||0 : 0), 0) * mul;
    const gast = list.reduce((s,p) => s + (p.gastos_comunidad||0) + (p.ibi||0)/12 + (p.basuras||0)/12, 0) * mul;
    html += `<div class="finance-row">
      <div class="finance-row-label">📍 ${loc} <span class="finance-row-count">${list.length}</span></div>
      <div class="finance-row-vals">
        ${ing ? `<span class="val-green">+${fmt(ing,0)}€</span>` : ''}
        ${gast ? `<span class="val-red">−${fmt(gast,0)}€</span>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';

  const tCom = all.reduce((s,p)=>s+(p.gastos_comunidad||0), 0)*mul;
  const tIbi = all.reduce((s,p)=>s+(p.ibi||0)/12, 0)*mul;
  const tBas = all.reduce((s,p)=>s+(p.basuras||0)/12, 0)*mul;
  const totalAlq = all.filter(p=>p.alquilado).length;

  html += `
    <div class="finance-section">
      <div class="finance-section-header">Desglose de gastos</div>
      <div class="finance-row"><div class="finance-row-label">🏘 Comunidad</div><div class="val-red">${fmt(tCom,0)}€</div></div>
      <div class="finance-row"><div class="finance-row-label">🏛 IBI</div><div class="val-red">${fmt(tIbi,0)}€</div></div>
      <div class="finance-row"><div class="finance-row-label">🗑 Basuras</div><div class="val-red">${fmt(tBas,0)}€</div></div>
    </div>
    <div class="finance-section">
      <div class="finance-section-header">Resumen general</div>
      <div class="finance-row"><div class="finance-row-label">Total inmuebles</div><strong>${all.length}</strong></div>
      <div class="finance-row"><div class="finance-row-label">Alquilados</div><strong class="val-green">${totalAlq}</strong></div>
      <div class="finance-row"><div class="finance-row-label">Libres</div><strong>${all.length - totalAlq}</strong></div>
      <div class="finance-row"><div class="finance-row-label">% Ocupación</div><strong>${Math.round(totalAlq/all.length*100)}%</strong></div>
    </div>
  `;

  document.getElementById('finance-body').innerHTML = html;
}

// ── Tab nav ──────────────────────────────────────────────────
function switchTab(tab) {
  State.tab = tab;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('screen-' + tab).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  setLoading(true);
  try {
    await API.load();
    buildLocFilter();
    renderList();
    renderFinance();

    // Banner si no hay API configurada
    if (!API.isConfigured()) {
      document.getElementById('api-banner').style.display = 'flex';
    }
  } catch (err) {
    showToast('Error cargando datos: ' + err.message, true);
  } finally {
    setLoading(false);
  }

  // Event listeners
  document.getElementById('search-input').addEventListener('input', e => {
    State.searchQuery = e.target.value.toLowerCase();
    document.getElementById('search-clear').style.display = e.target.value ? 'block' : 'none';
    renderList();
  });
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });
}

document.addEventListener('DOMContentLoaded', init);
