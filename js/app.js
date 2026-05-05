/* ============================================
   DeliveryTrack v2 — Lógica principal
   ============================================ */

'use strict';

// ── ESTADO ──────────────────────────────────────
let orders = [];
let mode   = 'digital';
const META_DEFAULT = 500;

// ── CLAVES DE ALMACENAMIENTO ─────────────────────
const KEYS = {
  orders: 'dt_orders',
  meta:   'dt_meta',
  name:   'dt_name',
};

// ── INICIALIZACIÓN ───────────────────────────────
(function init() {
  orders = loadJSON(KEYS.orders) || [];
  render();
  updateStats();
  startClock();
  applyStoredName();
})();

// ── RELOJ ────────────────────────────────────────
function startClock() {
  const el = document.getElementById('clock');
  function tick() {
    const n = new Date();
    el.textContent = pad(n.getHours()) + ':' + pad(n.getMinutes());
  }
  tick();
  setInterval(tick, 1000);
}

// ── TABS ──────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');

  // Si abrimos mapa, inicializar/refrescar
  if (name === 'mapa' && typeof refreshMainMap === 'function') {
    setTimeout(refreshMainMap, 100);
  }
}

// ── MODO DE PAGO ─────────────────────────────────
function setMode(m) {
  mode = m;

  const tabDg  = document.getElementById('tab-digital');
  const tabCs  = document.getElementById('tab-cash');
  const cashEx = document.getElementById('cash-extra');
  const digEx  = document.getElementById('digital-extra');
  const btn    = document.getElementById('submit-btn');
  const pb     = document.getElementById('preview-box');

  if (m === 'digital') {
    tabDg.className = 'type-tab active-green';
    tabCs.className = 'type-tab';
    cashEx.style.display = 'none';
    digEx.style.display  = 'block';
    btn.className        = 'submit-btn green';
    pb.className         = 'preview-box';
  } else {
    tabCs.className = 'type-tab active-amber';
    tabDg.className = 'type-tab';
    cashEx.style.display = 'block';
    digEx.style.display  = 'none';
    btn.className        = 'submit-btn amber';
    pb.className         = 'preview-box amber';
  }

  clearForm();
  pb.style.display = 'none';
}

// ── PREVIEW EN TIEMPO REAL ───────────────────────
function updatePreview() {
  const envio = getEnvio();
  const pague = getPague();
  const pb    = document.getElementById('preview-box');
  const pc    = document.getElementById('preview-content');

  if (envio <= 0 && pague <= 0) {
    pb.style.display = 'none';
    return;
  }

  pb.style.display = 'block';
  const cobrar = pague + envio;

  if (mode === 'digital') {
    pc.innerHTML = `
      <div class="preview-row">
        <span>Tipo de pago</span><span>Tarjeta / app</span>
      </div>
      <div class="preview-row earn">
        <span>Tu ganancia</span><span>${fmt(envio)}</span>
      </div>`;
  } else {
    pc.innerHTML = `
      <div class="preview-row">
        <span>Pagué en tienda</span><span>${fmt(pague)}</span>
      </div>
      <div class="preview-row">
        <span>+ Tarifa de envío</span><span>${fmt(envio)}</span>
      </div>
      <div class="divider"></div>
      <div class="preview-row total">
        <span>Cobrar al cliente</span><span>${fmt(cobrar)}</span>
      </div>
      <div class="preview-row earn amber-earn">
        <span>Tu ganancia</span><span>${fmt(envio)}</span>
      </div>`;
  }
}

// ── AGREGAR ORDEN ────────────────────────────────
function addOrder() {
  const nombre = (document.getElementById('inp-nombre').value.trim()) || 'Entrega';
  const envio  = getEnvio();
  const pague  = getPague();

  if (envio <= 0) {
    showToast('Ingresa la tarifa de envío', '#FF9500');
    return;
  }

  const now = new Date();

  // Datos de mapa (si existen, los guarda maps.js en window._pendingRoute)
  const routeData = window._pendingRoute || null;

  const order = {
    id:     Date.now(),
    nombre,
    envio,
    pague,
    mode,
    cobrar: pague + envio,
    time:   pad(now.getHours()) + ':' + pad(now.getMinutes()),
    route:  routeData,
  };

  orders.unshift(order);
  window._pendingRoute = null;

  saveJSON(KEYS.orders, orders);
  render();
  renderRoutes();
  updateStats();
  clearForm();
  clearRoutePreview();
  document.getElementById('preview-box').style.display = 'none';
  showToast('Envío registrado ✓', '#06C167');
}

// ── ELIMINAR ORDEN ───────────────────────────────
function deleteOrder(id) {
  orders = orders.filter(o => o.id !== id);
  saveJSON(KEYS.orders, orders);
  render();
  renderRoutes();
  updateStats();
}

// ── BORRAR TODO ──────────────────────────────────
function clearAll() {
  if (!orders.length) return;
  if (!confirm('¿Borrar todos los registros del día?')) return;
  orders = [];
  saveJSON(KEYS.orders, orders);
  render();
  renderRoutes();
  updateStats();
}

// ── META DEL DÍA ─────────────────────────────────
function setMeta() {
  const current = loadJSON(KEYS.meta) || META_DEFAULT;
  const v = prompt('¿Cuál es tu meta de ganancias del día?', '$' + current);
  if (!v) return;
  const n = parseFloat(String(v).replace('$', '').replace(',', '.'));
  if (n > 0) {
    saveJSON(KEYS.meta, n);
    updateStats();
  }
}

// ── NOMBRE DEL REPARTIDOR ────────────────────────
function setName() {
  const current = localStorage.getItem(KEYS.name) || 'Mi Cuenta';
  const v = prompt('¿Cómo te llamas?', current);
  if (!v || !v.trim()) return;
  localStorage.setItem(KEYS.name, v.trim());
  applyStoredName();
}

function applyStoredName() {
  const name    = localStorage.getItem(KEYS.name) || 'Mi Cuenta';
  const initials = name.trim().split(' ')
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
  const nameEl    = document.getElementById('display-name');
  const avatarEl  = document.getElementById('avatar-initials');
  if (nameEl)   nameEl.textContent   = name;
  if (avatarEl) avatarEl.textContent = initials || 'JR';
}

// ── RENDERIZAR LISTA DE ÓRDENES ──────────────────
function render() {
  const el    = document.getElementById('orders-list');
  const badge = document.getElementById('order-count');

  badge.textContent = orders.length + ' registro' + (orders.length !== 1 ? 's' : '');

  if (!orders.length) {
    el.innerHTML = `
      <div class="empty">
        <span class="empty-icon">🛵</span>
        <p>Aún no hay envíos.<br>Agrega tu primer entrega arriba.</p>
      </div>`;
    return;
  }

  el.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-icon ${o.mode === 'digital' ? 'green' : 'amber'}">
        ${o.mode === 'digital' ? '💳' : '💵'}
      </div>
      <div class="order-info">
        <div class="order-name">${escapeHtml(o.nombre)}</div>
        <div class="order-detail">
          <span class="order-tag ${o.mode === 'digital' ? 'tag-paid' : 'tag-cash'}">
            ${o.mode === 'digital' ? 'PAGADO' : 'EFECTIVO'}
          </span>
          ${o.mode === 'cash'
            ? `cobrar <strong>${fmt(o.cobrar)}</strong>`
            : 'pedido en línea'}
          ${o.route ? `<span style="color:#B084FF;margin-left:6px;">📍 ${o.route.distanceText || ''}</span>` : ''}
        </div>
        <div class="order-time">${o.time}</div>
      </div>
      <div class="order-right">
        <div class="order-earn-val">${fmt(o.envio)}</div>
        ${o.mode === 'cash'
          ? `<div class="order-cobrar-val">cobrar ${fmt(o.cobrar)}</div>`
          : ''}
      </div>
      <button class="del-btn" onclick="deleteOrder(${o.id})" aria-label="Eliminar">×</button>
    </div>`).join('');
}

// ── RENDERIZAR RUTAS EN MAPA ──────────────────────
function renderRoutes() {
  const el    = document.getElementById('routes-list');
  const badge = document.getElementById('map-badge');
  const routeOrders = orders.filter(o => o.route);

  badge.textContent = routeOrders.length + ' ruta' + (routeOrders.length !== 1 ? 's' : '');

  // Mostrar/ocultar stat de km
  const totalKm = routeOrders.reduce((s, o) => s + (o.route.distanceValue || 0), 0);
  const kmStat = document.getElementById('km-stat');
  if (kmStat) {
    kmStat.style.display = routeOrders.length ? 'block' : 'none';
    setText('s-km', (totalKm / 1000).toFixed(1) + ' km');
  }

  if (!routeOrders.length) {
    el.innerHTML = `
      <div class="empty">
        <span class="empty-icon">🗺️</span>
        <p>Agrega rutas al registrar envíos.<br>Aparecerán aquí en el mapa.</p>
      </div>`;
    return;
  }

  el.innerHTML = routeOrders.map((o, i) => `
    <div class="route-card">
      <div class="route-icon">${o.mode === 'digital' ? '💳' : '💵'}</div>
      <div class="route-details">
        <div class="route-name">${escapeHtml(o.nombre)}</div>
        <div class="route-addr">📍 ${escapeHtml(o.route.origenAddr || '')}</div>
        <div class="route-addr">🏠 ${escapeHtml(o.route.destinoAddr || '')}</div>
        <div class="route-meta">
          ${o.route.distanceText ? `<span>📏 ${o.route.distanceText}</span>` : ''}
          ${o.route.durationText ? `<span>⏱️ ${o.route.durationText}</span>` : ''}
          <span style="color:#06C167">${fmt(o.envio)}</span>
        </div>
      </div>
      <button class="route-show-btn" onclick="focusRoute(${i})">Ver →</button>
    </div>`).join('');
}

// ── ACTUALIZAR ESTADÍSTICAS ──────────────────────
function updateStats() {
  const meta     = loadJSON(KEYS.meta) || META_DEFAULT;
  const ganancia = orders.reduce((s, o) => s + o.envio, 0);
  const cobrar   = orders.filter(o => o.mode === 'cash').reduce((s, o) => s + o.cobrar, 0);
  const pague    = orders.filter(o => o.mode === 'cash').reduce((s, o) => s + o.pague, 0);
  const pct      = Math.min((ganancia / meta) * 100, 100);

  setText('hero-val',     ganancia.toFixed(2));
  setText('hero-envios',  orders.length + ' envío' + (orders.length !== 1 ? 's' : ''));
  setText('meta-val',     Math.round(meta));
  setText('s-count',      orders.length);
  setText('s-cobrar',     fmtShort(cobrar));
  setText('s-pague',      fmtShort(pague));
  setText('bb-total',     fmt(ganancia));

  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = pct + '%';
}

// ── TOAST ────────────────────────────────────────
let toastTimer;
function showToast(msg, color) {
  const t  = document.getElementById('toast');
  const d  = document.getElementById('toast-dot');
  const m  = document.getElementById('toast-msg');
  if (!t) return;

  m.textContent      = msg;
  d.style.background = color || '#06C167';

  clearTimeout(toastTimer);
  t.classList.add('show');
  toastTimer = setTimeout(() => t.classList.remove('show'), 2300);
}

// ── HELPERS ──────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function fmt(n) { return '$' + Number(n).toFixed(2); }
function fmtShort(n) { return '$' + Math.round(n); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function getEnvio() {
  const id = mode === 'digital' ? 'inp-envio2' : 'inp-envio';
  return parseFloat(document.getElementById(id).value) || 0;
}

function getPague() {
  if (mode !== 'cash') return 0;
  return parseFloat(document.getElementById('inp-pague').value) || 0;
}

function clearForm() {
  ['inp-nombre','inp-envio','inp-envio2','inp-pague','inp-origen','inp-destino']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
