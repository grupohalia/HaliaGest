// ================================================================
// GESTOR FINCAS — Google Apps Script v4
// Hojas: Inmuebles · Contratos · Pagos
// Desplegar: App web · Ejecutar como: Yo · Acceso: Cualquier usuario
// ================================================================

const SHEETS = {
  inmuebles: 'Inmuebles',
  contratos: 'Contratos',
  pagos:     'Pagos'
};

const H_INMUEBLES = [
  'id','referencia_catastral','direccion','localidad','tipo','derecho',
  'sup_construida','sup_parcela','uso','valor_suelo','valor_construccion',
  'valor_catastral','precio_compra','precio_venta','gastos_comunidad',
  'ibi','basuras','alquilado','precio_alquiler','notas'
];
const H_CONTRATOS = [
  'id','inmueble_id','inquilino','dni','telefono','email',
  'fecha_inicio','fecha_fin','renta_mensual','periodicidad',
  'dia_cobro','fianza','activo','notas'
];
const H_PAGOS = [
  'id','contrato_id','inmueble_id','fecha_vencimiento','importe',
  'estado','fecha_cobro','forma_pago','notas'
];
const NUM_INM = [
  'sup_construida','sup_parcela','valor_suelo','valor_construccion',
  'valor_catastral','precio_compra','precio_venta','gastos_comunidad',
  'ibi','basuras','precio_alquiler'
];
const NUM_CTR = ['renta_mensual','dia_cobro','fianza'];
const NUM_PAG = ['importe'];

// ── Respuesta JSONP ───────────────────────────────────────────
function respond(data, cb) {
  const json = JSON.stringify(data);
  const body = cb ? cb + '(' + json + ')' : json;
  const mime = cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}

// ── Obtener / crear hoja ──────────────────────────────────────
function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    styleHeader(sh, headers.length);
  }
  return sh;
}

// ── doGet: router principal ───────────────────────────────────
function doGet(e) {
  const cb      = (e.parameter.callback || '').trim();
  const action  = (e.parameter.action  || '').trim();
  const sheet   = (e.parameter.sheet   || '').trim();
  const rawData =  e.parameter.data    || '';

  try {
    let payload = null;
    if (rawData) payload = JSON.parse(rawData);

    // Acciones CRUD
    if (action === 'getAll')         return respond(getAllRows(sheet),      cb);
    if (action === 'create')         return respond(createRow(sheet, payload), cb);
    if (action === 'update')         return respond(updateRow(sheet, payload), cb);
    if (action === 'delete')         return respond(deleteRowById(sheet, payload.id), cb);
    if (action === 'seed')           return respond(seedSheet(sheet, payload, true),  cb);
    if (action === 'seedAppend')     return respond(seedSheet(sheet, payload, false), cb);

    // Acción especial: baja de contrato (elimina pagos futuros)
    if (action === 'bajaContrato')   return respond(bajaContrato(payload),  cb);
    // Acción especial: marcar pago cobrado
    if (action === 'cobrarPago')     return respond(cobrarPago(payload),    cb);

    // Sin acción → devuelve las tres hojas de una vez
    return respond({
      ok: true,
      inmuebles: getAllRows('Inmuebles').data,
      contratos: getAllRows('Contratos').data,
      pagos:     getAllRows('Pagos').data
    }, cb);

  } catch (err) {
    return respond({ ok: false, error: err.message }, cb);
  }
}

// ── Leer todos ────────────────────────────────────────────────
function getAllRows(sheetName) {
  const headers = headersFor(sheetName);
  const numFields = numFieldsFor(sheetName);
  const sh = getSheet(sheetName, headers);
  const last = sh.getLastRow();
  if (last < 2) return { ok: true, data: [] };

  const rows = sh.getRange(2, 1, last - 1, headers.length).getValues();
  const data = rows
    .filter(r => String(r[0]).trim() !== '')
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        if (h === 'activo' || h === 'alquilado') {
          v = v === true || v === 'TRUE' || v === 'true' || v === 1;
        } else if (numFields.includes(h)) {
          v = Number(v) || 0;
        } else if (v instanceof Date) {
          v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else {
          v = String(v == null ? '' : v);
        }
        obj[h] = v;
      });
      return obj;
    });
  return { ok: true, data };
}

// ── Seed ──────────────────────────────────────────────────────
function seedSheet(sheetName, rows, clear) {
  const headers = headersFor(sheetName);
  const sh = getSheet(sheetName, headers);
  if (clear) {
    sh.clearContents();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    styleHeader(sh, headers.length);
  }
  if (rows && rows.length > 0) {
    const last = sh.getLastRow();
    const vals = rows.map(obj => rowToArray(obj, headers, numFieldsFor(sheetName)));
    sh.getRange(last + 1, 1, vals.length, headers.length).setValues(vals);
  }
  return { ok: true, count: rows ? rows.length : 0 };
}

// ── Create ────────────────────────────────────────────────────
function createRow(sheetName, obj) {
  const headers = headersFor(sheetName);
  const sh = getSheet(sheetName, headers);
  const last = sh.getLastRow();
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
    if (ids.includes(String(obj.id))) return { ok: false, error: 'ID ya existe: ' + obj.id };
  }
  sh.appendRow(rowToArray(obj, headers, numFieldsFor(sheetName)));
  return { ok: true };
}

// ── Update ────────────────────────────────────────────────────
function updateRow(sheetName, obj) {
  const headers = headersFor(sheetName);
  const sh = getSheet(sheetName, headers);
  const last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'Hoja vacía' };
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
  const idx = ids.indexOf(String(obj.id));
  if (idx === -1) return { ok: false, error: 'No encontrado: ' + obj.id };
  sh.getRange(idx + 2, 1, 1, headers.length).setValues([rowToArray(obj, headers, numFieldsFor(sheetName))]);
  return { ok: true };
}

// ── Delete ────────────────────────────────────────────────────
function deleteRowById(sheetName, id) {
  const headers = headersFor(sheetName);
  const sh = getSheet(sheetName, headers);
  const last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'Hoja vacía' };
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
  const idx = ids.indexOf(String(id));
  if (idx === -1) return { ok: false, error: 'No encontrado: ' + id };
  sh.deleteRow(idx + 2);
  return { ok: true };
}

// ── Baja de contrato ──────────────────────────────────────────
// Marca contrato inactivo y elimina pagos futuros pendientes
function bajaContrato(payload) {
  const { contrato_id, fecha_baja } = payload;

  // Marcar contrato como inactivo y actualizar fecha_fin
  const shCtr = getSheet(SHEETS.contratos, H_CONTRATOS);
  const lastCtr = shCtr.getLastRow();
  if (lastCtr >= 2) {
    const ids = shCtr.getRange(2, 1, lastCtr - 1, 1).getValues().flat().map(String);
    const idx = ids.indexOf(String(contrato_id));
    if (idx !== -1) {
      // Leer fila actual
      const row = shCtr.getRange(idx + 2, 1, 1, H_CONTRATOS.length).getValues()[0];
      const obj = {};
      H_CONTRATOS.forEach((h, i) => obj[h] = row[i]);
      obj.activo = false;
      obj.fecha_fin = fecha_baja;
      shCtr.getRange(idx + 2, 1, 1, H_CONTRATOS.length).setValues([rowToArray(obj, H_CONTRATOS, NUM_CTR)]);
    }
  }

  // Eliminar pagos futuros pendientes de ese contrato
  const shPag = getSheet(SHEETS.pagos, H_PAGOS);
  const lastPag = shPag.getLastRow();
  if (lastPag >= 2) {
    const rows = shPag.getRange(2, 1, lastPag - 1, H_PAGOS.length).getValues();
    // Recorrer de abajo a arriba para no desplazar índices al borrar
    for (let i = rows.length - 1; i >= 0; i--) {
      const cid    = String(rows[i][H_PAGOS.indexOf('contrato_id')]);
      const estado = String(rows[i][H_PAGOS.indexOf('estado')]);
      const fvStr  = String(rows[i][H_PAGOS.indexOf('fecha_vencimiento')]);
      if (cid === String(contrato_id) && estado === 'pendiente' && fvStr > fecha_baja) {
        shPag.deleteRow(i + 2);
      }
    }
  }

  return { ok: true };
}

// ── Marcar pago cobrado ───────────────────────────────────────
function cobrarPago(payload) {
  const { id, fecha_cobro, forma_pago, notas } = payload;
  const sh = getSheet(SHEETS.pagos, H_PAGOS);
  const last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'Sin pagos' };
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
  const idx = ids.indexOf(String(id));
  if (idx === -1) return { ok: false, error: 'Pago no encontrado: ' + id };
  const row = sh.getRange(idx + 2, 1, 1, H_PAGOS.length).getValues()[0];
  const obj = {};
  H_PAGOS.forEach((h, i) => obj[h] = row[i]);
  obj.estado      = 'cobrado';
  obj.fecha_cobro = fecha_cobro || '';
  obj.forma_pago  = forma_pago  || obj.forma_pago;
  obj.notas       = notas       || obj.notas;
  sh.getRange(idx + 2, 1, 1, H_PAGOS.length).setValues([rowToArray(obj, H_PAGOS, NUM_PAG)]);
  return { ok: true };
}

// ── Helpers ───────────────────────────────────────────────────
function headersFor(name) {
  if (name === SHEETS.contratos || name === 'Contratos') return H_CONTRATOS;
  if (name === SHEETS.pagos     || name === 'Pagos')     return H_PAGOS;
  return H_INMUEBLES;
}
function numFieldsFor(name) {
  if (name === SHEETS.contratos || name === 'Contratos') return NUM_CTR;
  if (name === SHEETS.pagos     || name === 'Pagos')     return NUM_PAG;
  return NUM_INM;
}
function rowToArray(obj, headers, numFields) {
  return headers.map(h => {
    const v = obj[h] != null ? obj[h] : '';
    if (h === 'activo' || h === 'alquilado') return v ? 'TRUE' : 'FALSE';
    if (numFields.includes(h)) return Number(v) || 0;
    return String(v);
  });
}
function styleHeader(sh, len) {
  const r = sh.getRange(1, 1, 1, len);
  r.setBackground('#1a1f2e');
  r.setFontColor('#4f8ef7');
  r.setFontWeight('bold');
  r.setFontSize(10);
  for (let i = 1; i <= len; i++) sh.setColumnWidth(i, i <= 3 ? 180 : 120);
}
