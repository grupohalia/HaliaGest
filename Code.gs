// ============================================================
// GESTOR FINCAS - Google Apps Script Backend
// Despliega como: Web App → Execute as: Me → Who has access: Anyone
// ============================================================

const SHEET_NAME = 'Inmuebles';
const HEADERS = [
  'id','referencia_catastral','direccion','localidad','tipo','derecho',
  'sup_construida','sup_parcela','uso','valor_suelo','valor_construccion',
  'valor_catastral','precio_compra','precio_venta','gastos_comunidad',
  'ibi','basuras','alquilado','precio_alquiler','notas'
];

// ── CORS helper ──────────────────────────────────────────────
function cors(output) {
  return output
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

function jsonResponse(data) {
  return cors(ContentService.createTextOutput(JSON.stringify(data)));
}

// ── GET: lee todos los inmuebles ─────────────────────────────
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    // Si no existe la hoja, la crea con cabeceras
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      styleSheet(sheet);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonResponse({ ok: true, data: [] });

    const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    const data = rows
      .filter(r => r[0] !== '')
      .map(row => {
        const obj = {};
        HEADERS.forEach((h, i) => {
          let v = row[i];
          // Booleans
          if (h === 'alquilado') v = v === true || v === 'TRUE' || v === 'true' || v === 1;
          // Numbers
          if (['sup_construida','sup_parcela','valor_suelo','valor_construccion',
               'valor_catastral','precio_compra','precio_venta','gastos_comunidad',
               'ibi','basuras','precio_alquiler'].includes(h)) {
            v = parseFloat(v) || 0;
          }
          obj[h] = v;
        });
        return obj;
      });

    return jsonResponse({ ok: true, data });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

// ── POST: acción según 'action' ──────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, payload } = body;

    if (action === 'seed') return seedData(payload);
    if (action === 'create') return createRow(payload);
    if (action === 'update') return updateRow(payload);
    if (action === 'delete') return deleteRow(payload.id);

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

// ── Seed: carga inicial de datos ─────────────────────────────
function seedData(rows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    styleSheet(sheet);
  }
  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);

  if (rows && rows.length > 0) {
    const vals = rows.map(obj => HEADERS.map(h => {
      let v = obj[h] !== undefined ? obj[h] : '';
      if (h === 'alquilado') v = v ? 'TRUE' : 'FALSE';
      return v;
    }));
    sheet.getRange(2, 1, vals.length, HEADERS.length).setValues(vals);
  }

  styleSheet(sheet);
  return jsonResponse({ ok: true, count: rows ? rows.length : 0 });
}

// ── Create ───────────────────────────────────────────────────
function createRow(obj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: 'Sheet not found' });

  // Check duplicate id
  const ids = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat()
    : [];
  if (ids.includes(obj.id)) {
    return jsonResponse({ ok: false, error: 'ID ya existe: ' + obj.id });
  }

  const row = HEADERS.map(h => {
    let v = obj[h] !== undefined ? obj[h] : '';
    if (h === 'alquilado') v = v ? 'TRUE' : 'FALSE';
    return v;
  });
  sheet.appendRow(row);
  return jsonResponse({ ok: true });
}

// ── Update ───────────────────────────────────────────────────
function updateRow(obj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: 'Sheet not found' });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ ok: false, error: 'No data' });

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const idx = ids.indexOf(obj.id);
  if (idx === -1) return jsonResponse({ ok: false, error: 'ID not found: ' + obj.id });

  const rowNum = idx + 2;
  const row = HEADERS.map(h => {
    let v = obj[h] !== undefined ? obj[h] : '';
    if (h === 'alquilado') v = v ? 'TRUE' : 'FALSE';
    return v;
  });
  sheet.getRange(rowNum, 1, 1, HEADERS.length).setValues([row]);
  return jsonResponse({ ok: true });
}

// ── Delete ───────────────────────────────────────────────────
function deleteRow(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: 'Sheet not found' });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ ok: false, error: 'No data' });

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const idx = ids.indexOf(id);
  if (idx === -1) return jsonResponse({ ok: false, error: 'ID not found: ' + id });

  sheet.deleteRow(idx + 2);
  return jsonResponse({ ok: true });
}

// ── Estilo visual de la hoja ─────────────────────────────────
function styleSheet(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setBackground('#1a1f2e');
  headerRange.setFontColor('#4f8ef7');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(10);

  sheet.setColumnWidth(1, 180);   // id
  sheet.setColumnWidth(2, 180);   // ref catastral
  sheet.setColumnWidth(3, 320);   // direccion
  sheet.setColumnWidth(4, 130);   // localidad
  sheet.setColumnWidth(5, 90);    // tipo
  for (let i = 6; i <= HEADERS.length; i++) sheet.setColumnWidth(i, 110);
}
