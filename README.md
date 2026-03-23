# 🏠 GestorFincas

App móvil para gestión de inmuebles. Alojada en **GitHub Pages**, datos en **Google Sheets**.

---

## Configuración rápida

### 1. Google Apps Script (backend)

1. Abre [Google Sheets](https://sheets.google.com) → crea una hoja nueva
2. **Extensiones → Apps Script** → borra el contenido → pega el contenido de `Code.gs`
3. Guarda (Ctrl+S) con nombre, p.ej. `GestorFincasAPI`
4. **Implementar → Nueva implementación**
   - Tipo: **App web**
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier usuario**
5. Clic en **Implementar** → acepta permisos → **copia la URL** `/exec`

> ⚠️ Cada vez que edites `Code.gs` debes volver a implementar con **"Nueva versión"**.

---

### 2. Conectar la app

Abre `index.html` y pon tu URL en la línea 12:

```html
window.GAS_URL = 'https://script.google.com/macros/s/TU_URL_AQUI/exec';
```

---

### 3. GitHub Pages

```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/TU_USUARIO/gestorfincas.git
git push -u origin main
```

Luego: **Settings → Pages → Branch: main → Save**

Tu app: `https://TU_USUARIO.github.io/gestorfincas/`

---

## Cómo funciona la sincronización

La app usa **GET con parámetros** para comunicarse con Apps Script (evita los problemas de CORS que tiene POST):

| Acción | Parámetros GET |
|--------|---------------|
| Leer todos | `?` (sin parámetros) |
| Crear | `?action=create&data={...}` |
| Editar | `?action=update&data={...}` |
| Borrar | `?action=delete&data={"id":"..."}` |
| Seed inicial | `?action=seed&data=[...]` |

La primera vez que se abre con GAS_URL configurada, si el Sheet está vacío, carga automáticamente los 156 inmuebles del `data/inmuebles.json`.

---

## Tipos de inmueble

| Tipo | Icono | Color barra |
|------|-------|------------|
| Vivienda | 🏠 | Azul |
| Garaje | 🚗 | Verde |
| Trastero | 📦 | Violeta |
| Local | 🏪 | Naranja |
