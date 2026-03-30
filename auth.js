// ================================================================
// auth.js — Autenticación cliente GestorFincas
//
// CAMBIAR CONTRASEÑA:
//   1. Abre la consola del navegador (F12)
//   2. Ejecuta: sha256('tu_nueva_contraseña').then(console.log)
//   3. Copia el hash resultante y pégalo en AUTH_CONFIG.hash
// ================================================================

const AUTH_CONFIG = {
  // Usuario administrador
  email: 'grupohalia@gmail.com',

  // SHA-256 de la contraseña actual: Marinada7@
  // Para cambiarla: ejecuta sha256('nueva_contraseña') en consola y pega el hash
  hash: 'd7e721cd02cd98447ec7cc96b310d305d56724ff149bfc158e9f696589d2989c',

  // Duración de sesión en horas (0 = solo sesión de navegador)
  sessionHours: 8
};

// ── SHA-256 via Web Crypto API ────────────────────────────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Gestión de sesión ─────────────────────────────────────────────
function getSession() {
  try {
    const s = sessionStorage.getItem('gf_session');
    if (!s) return null;
    const data = JSON.parse(s);
    if (AUTH_CONFIG.sessionHours > 0) {
      const expiry = data.ts + AUTH_CONFIG.sessionHours * 3600000;
      if (Date.now() > expiry) { sessionStorage.removeItem('gf_session'); return null; }
    }
    return data;
  } catch { return null; }
}

function setSession(email) {
  sessionStorage.setItem('gf_session', JSON.stringify({ email, ts: Date.now() }));
}

function clearSession() {
  sessionStorage.removeItem('gf_session');
}

function isAuthenticated() {
  return getSession() !== null;
}

// ── Logout ────────────────────────────────────────────────────────
function logout() {
  clearSession();
  showLoginScreen();
}

// ── Login ─────────────────────────────────────────────────────────
async function attemptLogin() {
  const email = (document.getElementById('login-email')?.value || '').trim().toLowerCase();
  const pwd   =  document.getElementById('login-pwd')?.value || '';
  const btn   =  document.getElementById('login-btn');
  const err   =  document.getElementById('login-err');

  err.textContent = '';

  if (email !== AUTH_CONFIG.email.toLowerCase()) {
    err.textContent = 'Usuario no reconocido';
    shakeForm();
    return;
  }
  if (!pwd) {
    err.textContent = 'Introduce la contraseña';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verificando...';

  const h = await sha256(pwd);
  if (h === AUTH_CONFIG.hash) {
    setSession(email);
    hideLoginScreen();
    addLogoutButton();
    // Inicializar la app si aún no se ha hecho
    if (typeof init === 'function') init();
  } else {
    err.textContent = 'Contraseña incorrecta';
    btn.disabled = false;
    btn.textContent = 'Entrar';
    shakeForm();
    document.getElementById('login-pwd').value = '';
    document.getElementById('login-pwd').focus();
  }
}

function shakeForm() {
  const box = document.getElementById('login-box');
  box.classList.add('shake');
  setTimeout(() => box.classList.remove('shake'), 500);
}

// ── Pantalla de login ─────────────────────────────────────────────
function showLoginScreen() {
  document.getElementById('app').style.display = 'none';
  let loginEl = document.getElementById('login-screen');
  if (!loginEl) {
    loginEl = document.createElement('div');
    loginEl.id = 'login-screen';
    loginEl.innerHTML = `
      <div id="login-box">
        <div id="login-logo">
          <div class="login-title">GestorFincas</div>
          <div class="login-sub">Gestión de inmuebles</div>
        </div>
        <div class="login-card">
          <div class="login-card-title">Acceso privado</div>
          <div class="fg">
            <label class="fl">Usuario</label>
            <input class="fi" type="email" id="login-email"
              value="${AUTH_CONFIG.email}"
              placeholder="${AUTH_CONFIG.email}"
              autocomplete="username">
          </div>
          <div class="fg">
            <label class="fl">Contraseña</label>
            <div class="pwd-wrap">
              <input class="fi" type="password" id="login-pwd"
                placeholder="••••••••"
                autocomplete="current-password"
                onkeydown="if(event.key==='Enter')attemptLogin()">
              <button class="pwd-eye" onclick="togglePwd()" type="button">👁</button>
            </div>
          </div>
          <div id="login-err" class="login-err"></div>
          <button id="login-btn" class="btn btn-p" onclick="attemptLogin()">Entrar</button>
        </div>
        <div class="login-footer">GestorFincas · Área privada</div>
      </div>`;
    document.body.appendChild(loginEl);
  }
  loginEl.style.display = 'flex';
  setTimeout(() => document.getElementById('login-pwd')?.focus(), 100);
}

function hideLoginScreen() {
  const el = document.getElementById('login-screen');
  if (el) el.style.display = 'none';
  document.getElementById('app').style.display = '';
}

function togglePwd() {
  const el = document.getElementById('login-pwd');
  el.type = el.type === 'password' ? 'text' : 'password';
}

// ── Añade botón logout al sidebar/header ─────────────────────────
function addLogoutButton() {
  // Desktop: al final del sidebar
  const nav = document.getElementById('nav-tabs');
  if (nav) {
    const spacer = document.createElement('div');
    spacer.style.cssText = 'flex:1';
    nav.appendChild(spacer);

    const btn = document.createElement('button');
    btn.className = 'nav-tab logout-btn';
    btn.innerHTML = '<span class="ni">🚪</span><span class="nav-label">Salir</span>';
    btn.onclick = logout;
    nav.appendChild(btn);
  }
}

// ── Init: comprueba sesión antes de mostrar la app ────────────────
(function authInit() {
  if (!isAuthenticated()) {
    // Ocultar app hasta que se autentique
    document.addEventListener('DOMContentLoaded', () => {
      showLoginScreen();
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      addLogoutButton();
    });
  }
})();

// ── Hook: después de init() de app.js, añadir logout ─────────────
const _origInit = window.init;
window.addEventListener('DOMContentLoaded', () => {
  if (isAuthenticated()) addLogoutButton();
});
