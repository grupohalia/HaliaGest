# 🏠 GestorFincas

App móvil para gestionar inmuebles. Se aloja en **GitHub Pages** y guarda los datos en **Google Sheets** a través de Google Apps Script.

---

## Estructura del proyecto

```
gestorfincas/
├── index.html          ← App principal
├── css/
│   └── styles.css
├── js/
│   ├── api.js          ← Capa de datos (Google Sheets)
│   └── app.js          ← Lógica de la app
├── data/
│   └── inmuebles.json  ← Datos iniciales (seed)
├── Code.gs             ← Backend Google Apps Script
└── README.md
```

---

## Configuración paso a paso

### 1 · Crear el Google Sheet y desplegar el Script

1. Ve a [Google Sheets](https://sheets.google.com) y crea una hoja de cálculo nueva.  
   Ponle el nombre que quieras, por ejemplo **"GestorFincas"**.

2. En el menú: **Extensiones → Apps Script**

3. Borra el contenido del editor y pega el contenido del archivo **`Code.gs`** de este proyecto.

4. Guarda el proyecto (Ctrl+S) con un nombre, por ejemplo `GestorFincasAPI`.

5. Despliega como **Web App**:
   - Clic en **Implementar → Nueva implementación**
   - Tipo: **App web**
   - Ejecutar como: **Yo (tu cuenta Google)**
   - Quién tiene acceso: **Cualquier usuario** *(necessary para que la app acceda sin login)*
   - Clic en **Implementar**
   - Copia la **URL de la Web App** (tiene este aspecto):  
     `https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXXX/exec`

6. La primera vez que despliegues te pedirá **autorizar permisos** (leer/escribir en Sheets). Acepta.

---

### 2 · Conectar la app con Google Sheets

Abre **`index.html`** y busca esta línea (está en el `<head>`):

```html
// window.GAS_URL = 'https://script.google.com/macros/s/XXXXXXXXXXXXXXX/exec';
window.GAS_URL = '';
```

Descomenta la primera línea y pega tu URL:

```html
window.GAS_URL = 'https://script.google.com/macros/s/TU_URL_AQUI/exec';
```

---

### 3 · Subir a GitHub Pages

```bash
# 1. Crea un repo en GitHub (puede ser privado o público)
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/gestorfincas.git
git push -u origin main

# 2. Activa GitHub Pages
# Ve a: Settings → Pages → Source: Deploy from branch → main / (root)
```

Tu app estará disponible en:  
`https://TU_USUARIO.github.io/gestorfincas/`

---

## Cómo funciona

```
GitHub Pages (HTML/CSS/JS)
        │
        │  fetch() — GET / POST
        ▼
Google Apps Script (Code.gs)
        │
        │  SpreadsheetApp API
        ▼
Google Sheets (datos persistentes)
```

- **Primera carga**: si la hoja está vacía, la app hace un **seed automático** con los 156 inmuebles del archivo `data/inmuebles.json`.
- **Sin URL configurada**: la app funciona en **modo demo** con los datos del JSON local (no guarda cambios).
- **Con URL configurada**: todos los cambios (crear, editar, borrar) se sincronizan en tiempo real con Google Sheets.

---

## Actualizar el Script

Si modificas `Code.gs`, debes volver a desplegarlo:

- **Extensiones → Apps Script → Implementar → Gestionar implementaciones**
- Edita la implementación existente, cambia a **Nueva versión** y guarda.

> ⚠️ Si cambias permisos o la URL cambia, actualiza `GAS_URL` en `index.html`.

---

## Tipos de inmueble

| Tipo | Icono | Color |
|------|-------|-------|
| Vivienda | 🏠 | Azul |
| Garaje | 🚗 | Verde |
| Trastero | 📦 | Violeta |
| Local | 🏪 | Naranja |

---

## Campos por inmueble

| Campo | Descripción |
|-------|-------------|
| `referencia_catastral` | ID único catastral |
| `direccion` | Dirección completa |
| `localidad` | Municipio |
| `tipo` | Vivienda / Garaje / Trastero / Local |
| `sup_construida` | Superficie en m² |
| `valor_catastral` | Valor catastral en € |
| `precio_compra` | Precio de compra en € |
| `precio_venta` | Precio de venta objetivo en € |
| `gastos_comunidad` | Cuota mensual de comunidad en € |
| `ibi` | IBI anual en € |
| `basuras` | Tasa de basuras anual en € |
| `alquilado` | true / false |
| `precio_alquiler` | Renta mensual en € |
| `notas` | Texto libre |
