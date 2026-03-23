// ================================================================
// GESTOR FINCAS — Google Apps Script Backend  v2
//
// CÓMO DESPLEGAR:
//   1. Extensiones → Apps Script → pega este código
//   2. Implementar → Nueva implementación
//   3. Tipo: App web
//   4. Ejecutar como: Yo (tu cuenta)
//   5. Quién tiene acceso: Cualquier usuario
//   6. Implementar → copia la URL /exec
//   7. Pega la URL en index.html → window.GAS_URL = '...'
//
// IMPORTANTE: Cada vez que modifiques el script debes volver a
// implementar eligiendo "Nueva versión" — si no, los cambios no
// tienen efecto.
// ================================================================

const SHEET_NAME = 'Inmuebles';
const HEADERS = [
  'id','referencia_catastral','direccion','localidad','tipo','derecho',
  'sup_construida','sup_parcela','uso','valor_suelo','valor_construccion',
  'valor_catastral','precio_compra','precio_venta','gastos_comunidad',
  'ibi','basuras','alquilado','precio_alquiler','notas'
];
const NUM_FIELDS = [
  'sup_construida','sup_parcela','valor_suelo','valor_construccion',
  'valor_catastral','precio_compra','precio_venta','gastos_comunidad',
  'ibi','basuras','precio_alquiler'
];

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    formatHeaders(sheet);
  }
  return sheet;
}

function doGet(e) {
  try {
    // Acción via GET param: ?action=create&data=JSON
    if (e && e.parameter && e.parameter.action) {
      const action = e.parameter.action;
      const payload = e.parameter.data ? JSON.parse(e.parameter.data) : null;
      if (action === 'seed')   return jsonOut(seedData(payload));
      if (action === 'create') return jsonOut(createRow(payload));
      if (action === 'update') return jsonOut(updateRow(payload));
      if (action === 'delete') return jsonOut(deleteRow(payload.id));
    }

    // Sin parámetros: devuelve todos los datos
    const sheet = getSheet();
    const last = sheet.getLastRow();
    if (last < 2) return jsonOut({ ok: true, data: [] });

    const rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
    const data = rows
      .filter(r => String(r[0]).trim() !== '')
      .map(row => {
        const obj = {};
        HEADERS.forEach((h, i) => {
          let v = row[i];
          if (h === 'alquilado') {
            v = v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
          } else if (NUM_FIELDS.includes(h)) {
            v = Number(v) || 0;
          } else {
            v = String(v === null || v === undefined ? '' : v);
          }
          obj[h] = v;
        });
        return obj;
      });

    return jsonOut({ ok: true, data: data });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload;
    if (action === 'seed')   return jsonOut(seedData(payload));
    if (action === 'create') return jsonOut(createRow(payload));
    if (action === 'update') return jsonOut(updateRow(payload));
    if (action === 'delete') return jsonOut(deleteRow(payload.id));
    return jsonOut({ ok: false, error: 'Acción desconocida: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function seedData(rows) {
  const sheet = getSheet();
  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  formatHeaders(sheet);
  if (rows && rows.length > 0) {
    const vals = rows.map(obj => rowFromObj(obj));
    sheet.getRange(2, 1, vals.length, HEADERS.length).setValues(vals);
  }
  return { ok: true, count: rows ? rows.length : 0 };
}

function createRow(obj) {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last >= 2) {
    const ids = sheet.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
    if (ids.includes(String(obj.id))) {
      return { ok: false, error: 'ID ya existe: ' + obj.id };
    }
  }
  sheet.appendRow(rowFromObj(obj));
  return { ok: true };
}

function updateRow(obj) {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return { ok: false, error: 'Hoja vacía' };
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
  const idx = ids.indexOf(String(obj.id));
  if (idx === -1) return { ok: false, error: 'No encontrado: ' + obj.id };
  sheet.getRange(idx + 2, 1, 1, HEADERS.length).setValues([rowFromObj(obj)]);
  return { ok: true };
}

function deleteRow(id) {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return { ok: false, error: 'Hoja vacía' };
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
  const idx = ids.indexOf(String(id));
  if (idx === -1) return { ok: false, error: 'No encontrado: ' + id };
  sheet.deleteRow(idx + 2);
  return { ok: true };
}

function rowFromObj(obj) {
  return HEADERS.map(h => {
    const v = obj[h] !== undefined && obj[h] !== null ? obj[h] : '';
    if (h === 'alquilado') return v ? 'TRUE' : 'FALSE';
    if (NUM_FIELDS.includes(h)) return Number(v) || 0;
    return String(v);
  });
}

function formatHeaders(sheet) {
  const r = sheet.getRange(1, 1, 1, HEADERS.length);
  r.setBackground('#1a1f2e');
  r.setFontColor('#4f8ef7');
  r.setFontWeight('bold');
  r.setFontSize(10);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 300);
  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 90);
  for (let i = 6; i <= HEADERS.length; i++) sheet.setColumnWidth(i, 100);
}
