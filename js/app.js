// ================================================================
// app.js v4 — Inmuebles + Alquileres
// ================================================================
const St = {
  filtroTipo:'', filtroLoc:'', filtroEstado:'',
  query:'', currentId:null, isNew:false,
  period:'mensual', tab:'list'
};
const ICON  = {Vivienda:'🏠',Garaje:'🚗',Trastero:'📦',Local:'🏪'};
const CLS   = {Vivienda:'vivienda',Garaje:'garaje',Trastero:'trastero',Local:'local'};
const ICLS  = {Vivienda:'icon-v',Garaje:'icon-g',Trastero:'icon-t',Local:'icon-l'};
const ic    = t => ICON[t]||'🏠';
const cls   = t => CLS[t]||'vivienda';
const icls  = t => ICLS[t]||'icon-v';
const fmt   = (n,d=0) => (n==null||n==='')?'—':new Intl.NumberFormat('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
const fmtE  = (n,d=0) => !n&&n!==0?'—':fmt(n,d)+' €';

let _toastT;
function toast(msg,err=false){const el=document.getElementById('toast');el.textContent=msg;el.className='toast show'+(err?' error':'');clearTimeout(_toastT);_toastT=setTimeout(()=>el.className='toast',2800);}
function loading(on){document.getElementById('loading-bar').style.display=on?'block':'none';}

function switchTab(tab){
  St.tab=tab;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('screen-'+tab).classList.add('active');
  document.getElementById('tab-'+tab).classList.add('active');
  if(tab==='avisos') renderAvisos();
  if(tab==='alq')    renderAlquileres();
  if(tab==='finance') renderFinance();
}

// ── Filtros ──────────────────────────────────────────────────────
function buildLocFilter(){
  const locs=[...new Set(API.getAll().map(p=>p.localidad))].sort();
  const el=document.getElementById('filters-loc');
  el.innerHTML='';
  [['','Todas'],...locs.map(l=>[l,l])].forEach(([val,label])=>{
    const b=document.createElement('button');
    b.className='filter-chip'+(St.filtroLoc===val?' active':'');
    b.textContent=label;
    b.onclick=()=>{St.filtroLoc=val;refreshChips('filters-loc',b);renderList();};
    el.appendChild(b);
  });
}
function refreshChips(cid,active){document.querySelectorAll('#'+cid+' .filter-chip').forEach(c=>c.classList.remove('active'));active.classList.add('active');}
function setFiltroTipo(el,val){St.filtroTipo=val;refreshChips('filters-tipo',el);renderList();}
function setFiltroEstado(el,val){St.filtroEstado=val;refreshChips('filters-estado',el);renderList();}
function clearSearch(){document.getElementById('search-input').value='';document.getElementById('search-clear').style.display='none';St.query='';renderList();}

function getFiltered(){
  const q=St.query.toLowerCase();
  return API.getAll().filter(p=>{
    if(St.filtroTipo&&p.tipo!==St.filtroTipo)return false;
    if(St.filtroLoc&&p.localidad!==St.filtroLoc)return false;
    if(St.filtroEstado==='alquilado'&&!p.alquilado)return false;
    if(St.filtroEstado==='libre'&&p.alquilado)return false;
    if(q&&![p.direccion,p.referencia_catastral,p.localidad].some(f=>f.toLowerCase().includes(q)))return false;
    return true;
  });
}

// ── Lista inmuebles ───────────────────────────────────────────────
function renderList(){
  const filtered=getFiltered();
  const alq=filtered.filter(p=>p.alquilado).length;
  document.getElementById('stats-row').innerHTML=`
    <div class="stat-pill"><strong>${filtered.length}</strong> inmuebles</div>
    <div class="stat-pill green"><strong>${alq}</strong> alquilados</div>
    <div class="stat-pill"><strong>${filtered.length-alq}</strong> libres</div>`;
  const byLoc={};
  filtered.forEach(p=>(byLoc[p.localidad]=byLoc[p.localidad]||[]).push(p));
  const container=document.getElementById('list-container');
  if(!filtered.length){container.innerHTML='<div class="empty"><div class="empty-icon">😕</div>No hay inmuebles con esos filtros</div>';return;}
  let html='';
  Object.keys(byLoc).sort().forEach(loc=>{
    html+=`<div class="section-label">📍 ${loc} <span>(${byLoc[loc].length})</span></div>`;
    byLoc[loc].forEach(p=>{
      html+=`<div class="prop-card ${cls(p.tipo)}" onclick="openDetail('${p.id}')">
        <div class="prop-card-inner">
          <div class="prop-icon ${icls(p.tipo)}">${ic(p.tipo)}</div>
          <div class="prop-info">
            <div class="prop-tipo">${p.tipo}</div>
            <div class="prop-dir">${p.direccion}</div>
            <div class="prop-loc">📍 ${p.localidad}</div>
            <div class="prop-badges">
              <span class="badge ${p.alquilado?'badge-alq':'badge-libre'}">${p.alquilado?'✅ Alquilado':'⬜ Libre'}</span>
              ${p.sup_construida?`<span class="badge badge-sup">${p.sup_construida}m²</span>`:''}
              ${p.valor_catastral?`<span class="badge badge-val">${fmt(p.valor_catastral)}€</span>`:''}
            </div>
          </div>
          <span class="chevron">›</span>
        </div>
      </div>`;
    });
  });
  container.innerHTML=html;
}

// ── Detalle inmueble ──────────────────────────────────────────────
function openDetail(id){
  St.currentId=id;
  const p=API.getAll().find(x=>x.id===id);
  if(!p)return;
  document.getElementById('detail-header-title').textContent=ic(p.tipo)+' '+p.tipo;
  const gm=(p.gastos_comunidad||0)+(p.ibi||0)/12+(p.basuras||0)/12;
  const ing=p.alquilado?(p.precio_alquiler||0):0;
  const net=ing-gm;
  // Buscar contratos de este inmueble
  const ctrs = API.getContratos().filter(c=>c.inmueble_id===id && (c.activo===true||c.activo==='TRUE'));
  const ctrHtml = ctrs.length ? `<div class="card">
    <div class="card-title">🔑 Contrato activo</div>
    ${ctrs.map(c=>`
    <div class="row"><span class="lbl">Inquilino</span><span class="val">${c.inquilino||'—'}</span></div>
    <div class="row"><span class="lbl">Desde</span><span class="val">${fmtFecha(c.fecha_inicio)}</span></div>
    <div class="row"><span class="lbl">Renta</span><span class="val green">${fmtE(c.renta_mensual)}/mes</span></div>
    <div class="row"><span class="lbl">Periodicidad</span><span class="val">${c.periodicidad}</span></div>
    <button class="abtn abtn-ver" style="margin-top:8px;width:100%" onclick="closeDetail();switchTab('alq');setTimeout(()=>openDetalleContrato('${c.id}'),300)">Ver contrato completo</button>
    `).join('')}
  </div>` : '';

  document.getElementById('detail-body').innerHTML=`
    <div class="detail-hero">
      <div class="detail-icon ${icls(p.tipo)}">${ic(p.tipo)}</div>
      <div>
        <div class="detail-tipo">${p.tipo}</div>
        <div class="detail-dir">${p.direccion}</div>
        <div class="detail-loc">📍 ${p.localidad}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">🏛 Datos catastrales</div>
      <div class="row"><span class="lbl">Ref. catastral</span><span class="val blue mono">${p.referencia_catastral}</span></div>
      <div class="row"><span class="lbl">Sup. construida</span><span class="val">${p.sup_construida||'—'} m²</span></div>
      <div class="row"><span class="lbl">Valor catastral</span><span class="val blue">${fmtE(p.valor_catastral)}</span></div>
    </div>
    <div class="card">
      <div class="card-title">💰 Económico</div>
      <div class="row"><span class="lbl">Precio compra</span><span class="val">${fmtE(p.precio_compra)}</span></div>
      <div class="row"><span class="lbl">Precio venta</span><span class="val">${fmtE(p.precio_venta)}</span></div>
      <div class="row"><span class="lbl">Comunidad/mes</span><span class="val red">${fmtE(p.gastos_comunidad)}</span></div>
      <div class="row"><span class="lbl">IBI/año</span><span class="val red">${fmtE(p.ibi)}</span></div>
      <div class="row"><span class="lbl">Basuras/año</span><span class="val red">${fmtE(p.basuras)}</span></div>
    </div>
    ${ctrHtml}
    ${(ing||gm)?`<div class="card">
      <div class="card-title">📊 Balance mensual</div>
      <div class="row"><span class="lbl">Ingresos</span><span class="val green">${fmtE(ing)}</span></div>
      <div class="row"><span class="lbl">Gastos</span><span class="val red">${fmtE(gm,2)}</span></div>
      <div class="row"><span class="lbl">Neto</span><span class="val ${net>=0?'green':'red'}">${fmtE(net,2)}</span></div>
    </div>`:''}
    ${p.notas?`<div class="card"><div class="card-title">📝 Notas</div><p class="notes">${p.notas}</p></div>`:''}
  `;
  document.getElementById('detail-screen').classList.add('open');
}
function closeDetail(){document.getElementById('detail-screen').classList.remove('open');St.currentId=null;}

// ── Formulario inmueble ───────────────────────────────────────────
function openEditModal(){
  St.isNew=false;
  const p=API.getAll().find(x=>x.id===St.currentId);
  if(!p)return;
  document.getElementById('modal-title').textContent='✏️ Editar Inmueble';
  renderForm(p);
  const _b=document.querySelector('#edit-modal .btn-p'); if(_b){_b.disabled=false;_b.textContent='💾 Guardar';}
  document.getElementById('edit-modal').classList.add('open');
}
function openNewModal(){
  St.isNew=true;St.currentId=null;
  document.getElementById('modal-title').textContent='➕ Nuevo Inmueble';
  renderForm(null);
  const _b=document.querySelector('#edit-modal .btn-p'); if(_b){_b.disabled=false;_b.textContent='💾 Guardar';}
  document.getElementById('edit-modal').classList.add('open');
}
function renderForm(p){
  const locs=[...new Set(API.getAll().map(x=>x.localidad))].sort();
  const locOpts=locs.map(l=>`<option value="${l}"${p?.localidad===l?' selected':''}>${l}</option>`).join('');
  const alq=p?.alquilado||false;
  document.getElementById('modal-form').innerHTML=`
    <div class="fg"><label class="fl">Dirección *</label><input class="fi" id="f-dir" value="${p?p.direccion:''}" placeholder="CL MAYOR 10 Es:1..."></div>
    <div class="frow">
      <div class="fg"><label class="fl">Localidad *</label><select class="fi fsel" id="f-loc" onchange="chkNuevaLoc(this)">${locOpts}<option value="__nueva__">+ Nueva...</option></select></div>
      <div class="fg"><label class="fl">Tipo *</label><select class="fi fsel" id="f-tipo">
        <option value="Vivienda"${p?.tipo==='Vivienda'?' selected':''}>🏠 Vivienda</option>
        <option value="Garaje"${p?.tipo==='Garaje'?' selected':''}>🚗 Garaje</option>
        <option value="Trastero"${p?.tipo==='Trastero'?' selected':''}>📦 Trastero</option>
        <option value="Local"${p?.tipo==='Local'?' selected':''}>🏪 Local</option>
      </select></div>
    </div>
    <div class="fg" id="f-nueva-wrap" style="display:none"><label class="fl">Nueva localidad</label><input class="fi" id="f-nueva-loc"></div>
    <div class="frow">
      <div class="fg"><label class="fl">Sup. construida (m²)</label><input class="fi" type="number" min="0" id="f-sup" value="${p?.sup_construida||''}"></div>
      <div class="fg"><label class="fl">Valor catastral (€)</label><input class="fi" type="number" min="0" id="f-vcat" value="${p?.valor_catastral||''}"></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Precio compra (€)</label><input class="fi" type="number" min="0" id="f-compra" value="${p?.precio_compra||''}"></div>
      <div class="fg"><label class="fl">Precio venta (€)</label><input class="fi" type="number" min="0" id="f-venta" value="${p?.precio_venta||''}"></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Comunidad/mes (€)</label><input class="fi" type="number" min="0" id="f-com" value="${p?.gastos_comunidad||''}"></div>
      <div class="fg"><label class="fl">IBI anual (€)</label><input class="fi" type="number" min="0" id="f-ibi" value="${p?.ibi||''}"></div>
    </div>
    <div class="fg"><label class="fl">Basuras anuales (€)</label><input class="fi" type="number" min="0" id="f-bas" value="${p?.basuras||''}"></div>
    <div class="fg">
      ${alq && !St.isNew
        ? `<div class="toggle-row" style="opacity:.6;cursor:default">
            <div>
              <span>¿Está alquilado?</span>
              <div style="font-size:11px;color:var(--txt3);margin-top:3px">Para dar de baja, usa el botón en el contrato</div>
            </div>
            <div class="toggle on" style="cursor:default;pointer-events:none"></div>
          </div>
          <input type="hidden" id="f-alq-tog-state" value="on">`
        : `<div class="toggle-row"><span>¿Está alquilado?</span>
            <div class="toggle${alq?' on':''}" id="f-alq-tog" onclick="toggleAlq()"></div>
           </div>`
      }
    </div>
    <div id="f-alq-wrap" style="display:${alq?'block':'none'}">
      <div class="fg"><label class="fl">Alquiler mensual (€)</label><input class="fi" type="number" min="0" id="f-alq" value="${p?.precio_alquiler||''}"></div>
    </div>
    <div class="fg"><label class="fl">Notas</label><textarea class="fi ftxt" id="f-notas">${p?.notas||''}</textarea></div>
    <div class="fg"><label class="fl">Ref. Catastral${St.isNew?' *':''}</label>
      <input class="fi${!St.isNew?' fdim':''}" id="f-ref" value="${p?.referencia_catastral||''}" ${!St.isNew?'readonly':''} placeholder="Referencia catastral"></div>`;
}
function chkNuevaLoc(sel){document.getElementById('f-nueva-wrap').style.display=sel.value==='__nueva__'?'block':'none';}
function toggleAlq(){
  const t=document.getElementById('f-alq-tog');
  if(!t)return;
  t.classList.toggle('on');
  document.getElementById('f-alq-wrap').style.display=t.classList.contains('on')?'block':'none';
}
// Returns true if toggle is ON (alquilado), supports both toggle and hidden input
function isAlqToggleOn(){
  const tog=document.getElementById('f-alq-tog');
  const hid=document.getElementById('f-alq-tog-state');
  if(hid) return hid.value==='on';
  return tog ? tog.classList.contains('on') : false;
}

async function saveProperty(){
  const dir=(document.getElementById('f-dir')?.value||'').trim();
  const ref=(document.getElementById('f-ref')?.value||'').trim();
  if(!dir){toast('La dirección es obligatoria',true);return;}
  if(!ref){toast('La referencia catastral es obligatoria',true);return;}
  let loc=document.getElementById('f-loc').value;
  if(loc==='__nueva__'){loc=(document.getElementById('f-nueva-loc')?.value||'').trim();if(!loc){toast('Escribe el nombre de la localidad',true);return;}}
  const alq=isAlqToggleOn();
  const num=id=>parseFloat(document.getElementById(id)?.value)||0;
  const existing=API.getAll().find(p=>p.id===ref);
  // Detectar si cambia de libre → alquilado (solo en edición)
  const eraAlquilado = existing?.alquilado === true || existing?.alquilado === 'TRUE';
  const pasaAAlquilado = !St.isNew && !eraAlquilado && alq;
  const obj={
    id:ref,referencia_catastral:ref,direccion:dir,localidad:loc,
    tipo:document.getElementById('f-tipo').value,
    derecho:St.isNew?'100,00 % de Propiedad':(existing?.derecho||'100,00 % de Propiedad'),
    sup_construida:num('f-sup'),sup_parcela:existing?.sup_parcela||0,
    uso:existing?.uso||'Residencial',valor_suelo:existing?.valor_suelo||0,valor_construccion:existing?.valor_construccion||0,
    valor_catastral:num('f-vcat'),precio_compra:num('f-compra'),precio_venta:num('f-venta'),
    gastos_comunidad:num('f-com'),ibi:num('f-ibi'),basuras:num('f-bas'),
    alquilado:alq,precio_alquiler:alq?num('f-alq'):0,
    notas:(document.getElementById('f-notas')?.value||'').trim()
  };
  const btnSave = document.querySelector('#edit-modal .btn-p');
  if (btnSave) { btnSave.disabled = true; btnSave.textContent = '⏳ Guardando...'; }
  const resetBtn = () => { if(btnSave){btnSave.disabled=false;btnSave.textContent='💾 Guardar';} };

  closeModal('edit-modal');
  showProgress(St.isNew ? ['Creando inmueble...'] : ['Actualizando inmueble...']);

  try{
    if(St.isNew){
      if(API.getAll().find(p=>p.id===ref)){
        hideProgress(); resetBtn();
        toast('Ya existe esa referencia',true); return;
      }
      await API.create(obj); St.currentId=ref;
    } else {
      await API.update(obj);
    }
    buildLocFilter(); renderList(); renderFinance();
    hideProgress();
    if(pasaAAlquilado) {
      // Abrir modal de nuevo contrato con este inmueble preseleccionado
      toast('✅ Inmueble actualizado · Abriendo formulario de contrato...');
      setTimeout(() => {
        closeDetail();
        document.getElementById('ctr-modal-title').textContent = '➕ Nuevo contrato';
        renderContratoFormConInmueble(ref);
        document.getElementById('ctr-modal').classList.add('open');
      }, 400);
    } else {
      toast('✅ ' + (St.isNew ? 'Inmueble creado' : 'Inmueble actualizado'));
      if(!St.isNew) setTimeout(()=>openDetail(St.currentId), 280);
    }
  } catch(e) {
    hideProgress(); resetBtn();
    toast('Error: '+e.message, true);
  }
}

// ── Borrar inmueble ───────────────────────────────────────────────
function confirmDelete(){
  const _b=document.querySelector('#confirm-modal .btn-d'); if(_b){_b.disabled=false;_b.textContent='Eliminar';}
  document.getElementById('confirm-modal').classList.add('open');
}
async function deleteProperty(){
  const btnDel = document.querySelector('#confirm-modal .btn-d');
  if (btnDel) { btnDel.disabled = true; btnDel.textContent = '⏳ Eliminando...'; }
  const resetBtn = () => { if(btnDel){btnDel.disabled=false;btnDel.textContent='Eliminar';} };

  closeModal('confirm-modal');
  showProgress(['Eliminando inmueble...']);
  try {
    await API.remove(St.currentId);
    buildLocFilter(); renderList(); renderFinance();
    hideProgress();
    closeDetail();
    toast('🗑 Inmueble eliminado');
  } catch(e) {
    hideProgress(); resetBtn();
    toast('Error: '+e.message, true);
  }
}
function closeModal(id){document.getElementById(id).classList.remove('open');}

// ── Finanzas ──────────────────────────────────────────────────────
function setPeriod(p,el){St.period=p;document.querySelectorAll('.period-btn').forEach(b=>b.classList.remove('active'));el.classList.add('active');renderFinance();}
function renderFinance(){
  const mul=St.period==='anual'?12:1,sub=St.period==='anual'?'/año':'/mes';
  const all=API.getAll();
  let totIng=0,totGst=0;
  all.forEach(p=>{if(p.alquilado)totIng+=(p.precio_alquiler||0);totGst+=(p.gastos_comunidad||0)+(p.ibi||0)/12+(p.basuras||0)/12;});
  totIng*=mul;totGst*=mul;
  const neto=totIng-totGst,totVC=all.reduce((s,p)=>s+(p.valor_catastral||0),0);
  document.getElementById('kpi-grid').innerHTML=`
    <div class="kpi"><div class="kpi-l">Ingresos</div><div class="kpi-v green">${fmt(totIng)}€</div><div class="kpi-s">${sub}</div></div>
    <div class="kpi"><div class="kpi-l">Gastos</div><div class="kpi-v red">${fmt(totGst,0)}€</div><div class="kpi-s">${sub}</div></div>
    <div class="kpi"><div class="kpi-l">Neto</div><div class="kpi-v ${neto>=0?'green':'red'}">${fmt(neto,0)}€</div><div class="kpi-s">${sub}</div></div>
    <div class="kpi"><div class="kpi-l">Valor catastral</div><div class="kpi-v blue">${fmt(totVC/1000,0)}K€</div><div class="kpi-s">total</div></div>`;
  let html='<div class="fsec"><div class="fhdr">Por tipo</div>';
  ['Vivienda','Local','Garaje','Trastero'].forEach(t=>{
    const list=all.filter(p=>p.tipo===t);if(!list.length)return;
    const ing=list.reduce((s,p)=>s+(p.alquilado?p.precio_alquiler||0:0),0)*mul;
    const gast=list.reduce((s,p)=>s+(p.gastos_comunidad||0)+(p.ibi||0)/12+(p.basuras||0)/12,0)*mul;
    html+=`<div class="frow2"><div class="flbl">${ic(t)} ${t} <span class="fcnt">${list.length}</span></div>
      <div class="fvals"><span class="green">+${fmt(ing,0)}€</span><span class="red" style="font-size:11px">−${fmt(gast,0)}€</span></div></div>`;
  });
  html+='</div>';
  html+='<div class="fsec"><div class="fhdr">Por localidad</div>';
  [...new Set(all.map(p=>p.localidad))].sort().forEach(loc=>{
    const list=all.filter(p=>p.localidad===loc);
    const ing=list.reduce((s,p)=>s+(p.alquilado?p.precio_alquiler||0:0),0)*mul;
    const gast=list.reduce((s,p)=>s+(p.gastos_comunidad||0)+(p.ibi||0)/12+(p.basuras||0)/12,0)*mul;
    html+=`<div class="frow2"><div class="flbl">📍 ${loc} <span class="fcnt">${list.length}</span></div>
      <div class="fvals">${ing?`<span class="green">+${fmt(ing,0)}€</span>`:''}${gast?`<span class="red" style="font-size:11px">−${fmt(gast,0)}€</span>`:''}</div></div>`;
  });
  html+='</div>';
  const tCom=all.reduce((s,p)=>s+(p.gastos_comunidad||0),0)*mul;
  const tIbi=all.reduce((s,p)=>s+(p.ibi||0)/12,0)*mul;
  const tBas=all.reduce((s,p)=>s+(p.basuras||0)/12,0)*mul;
  const totAlq=all.filter(p=>p.alquilado).length;
  html+=`<div class="fsec"><div class="fhdr">Desglose gastos</div>
    <div class="frow2"><div class="flbl">🏘 Comunidad</div><span class="red">${fmt(tCom,0)}€</span></div>
    <div class="frow2"><div class="flbl">🏛 IBI</div><span class="red">${fmt(tIbi,0)}€</span></div>
    <div class="frow2"><div class="flbl">🗑 Basuras</div><span class="red">${fmt(tBas,0)}€</span></div>
  </div>
  <div class="fsec"><div class="fhdr">General</div>
    <div class="frow2"><div class="flbl">Total inmuebles</div><strong>${all.length}</strong></div>
    <div class="frow2"><div class="flbl">Alquilados</div><strong class="green">${totAlq}</strong></div>
    <div class="frow2"><div class="flbl">Libres</div><strong>${all.length-totAlq}</strong></div>
    <div class="frow2"><div class="flbl">% Ocupación</div><strong>${all.length?Math.round(totAlq/all.length*100):0}%</strong></div>
  </div>`;
  document.getElementById('finance-body').innerHTML=html;
}


// ── Overlay de progreso (compartido por app.js y alquileres.js) ──
function showProgress(pasos) {
  let el = document.getElementById('progress-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'progress-overlay';
    document.getElementById('app').appendChild(el);
  }
  el.innerHTML = `
    <div class="progress-box">
      <div class="progress-spinner"></div>
      <div class="progress-steps" id="progress-steps">
        ${pasos.map((p, i) => `<div class="progress-step" id="pstep-${i}">${p}</div>`).join('')}
      </div>
    </div>`;
  el.style.display = 'flex';
  setProgressStep(0);
}

function setProgressStep(idx) {
  document.querySelectorAll('.progress-step').forEach((el, i) => {
    el.className = 'progress-step' + (i < idx ? ' done' : i === idx ? ' active' : '');
  });
}

function hideProgress() {
  const el = document.getElementById('progress-overlay');
  if (el) {
    el.classList.add('progress-fade-out');
    setTimeout(() => { el.style.display = 'none'; el.classList.remove('progress-fade-out'); }, 400);
  }
}

// ── Init ──────────────────────────────────────────────────────────
function applyResponsiveLayout() {
  const isDesktop = window.innerWidth >= 768;
  // Desktop: show + button in search bar, hide mobile header
  const mobileHeader = document.getElementById('main-header');
  const desktopBtn   = document.querySelector('.desktop-only');
  const sidebarBrand = document.getElementById('sidebar-brand');
  if (mobileHeader) mobileHeader.style.display = isDesktop ? 'none' : '';
  if (desktopBtn)   desktopBtn.style.display    = isDesktop ? 'flex' : 'none';
  if (sidebarBrand) sidebarBrand.style.display  = isDesktop ? 'flex' : 'none';
  // On mobile, modal overlays are inside #app (position:absolute)
  // On desktop, they're position:fixed so they cover everything — no change needed
}

async function init(){
  API.init(window.GAS_URL||'');
  applyResponsiveLayout();
  window.addEventListener('resize', applyResponsiveLayout);
  loading(true);
  try{
    await API.load();
    buildLocFilter();renderList();renderFinance();
    // Sincronizar pagos al arrancar (en background, sin bloquear UI)
    if (API.isConfigured() && typeof sincronizarPagos === 'function') {
      sincronizarPagos()
        .then(n => { if(n>0){ updateAvisosBadge(); } })
        .catch(e => console.warn('Sync pagos:', e.message));
    }
    // Badge de avisos en tab
    updateAvisosBadge();
    if(!API.isConfigured())document.getElementById('api-banner').style.display='flex';
  }catch(e){toast('Error cargando datos: '+e.message,true);console.error(e);}
  finally{loading(false);}
  document.getElementById('search-input').addEventListener('input',e=>{
    St.query=e.target.value.toLowerCase();
    document.getElementById('search-clear').style.display=e.target.value?'block':'none';
    renderList();
  });
  document.querySelectorAll('.modal-overlay').forEach(el=>{
    el.addEventListener('click',e=>{if(e.target===el)el.classList.remove('open');});
  });
}

function updateAvisosBadge(){
  const n=API.getPagos().filter(p=>{
    if(p.estado!=='pendiente')return false;
    const d=Math.round((new Date(p.fecha_vencimiento+'T00:00:00')-new Date(hoy()+'T00:00:00'))/86400000);
    return d<=30;
  }).length;
  const badge=document.getElementById('avisos-badge');
  if(badge){badge.textContent=n||'';badge.style.display=n?'inline-flex':'none';}
}

document.addEventListener('DOMContentLoaded',init);
