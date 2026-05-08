/* ============================================================
   Reparto Facil — Logica principal
   Funciones: envios, cobro modal, retiros, depositos,
              saldo inicial, ganancias semanales, tabla tarifas
   ============================================================ */

'use strict';

// ── ESTADO ────────────────────────────────────────────
let orders      = [];
let movimientos = [];
let mode        = 'digital';
let histTab     = 'hoy';
let _pendingOrder = null;
let extras      = { residencial: false, lluvia: false }; // +$10 cada uno

const KEYS = {
  orders: 'rf_orders',
  movs:   'rf_movs',
  meta:   'rf_meta',
  name:   'rf_name',
};

// ── INIT ──────────────────────────────────────────────
(function init() {
  orders      = loadJSON(KEYS.orders) || [];
  movimientos = loadJSON(KEYS.movs)   || [];
  render();
  updateStats();
  startClock();
  applyName();

  // Extras buttons — usar click Y touchend para máxima compatibilidad móvil
  document.querySelectorAll('.extra-toggle[data-extra]').forEach(btn => {
    const type = btn.dataset.extra;
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      toggleExtra(type);
    });
    btn.addEventListener('touchend', function(e) {
      e.preventDefault();
      toggleExtra(type);
    }, { passive: false });
  });
})();

// ── RELOJ ─────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('clock');
  function tick() {
    const n = new Date();
    el.textContent = pad(n.getHours()) + ':' + pad(n.getMinutes());
  }
  tick();
  setInterval(tick, 1000);
}

// ── TABS PRINCIPALES ──────────────────────────────────
function showTab(name) {
  ['nuevo','historial'].forEach(t => {
    document.getElementById('panel-' + t).classList.remove('active');
    document.getElementById('tab-' + t).classList.remove('active');
  });
  document.getElementById('panel-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

// ── TABS HISTORIAL ────────────────────────────────────
function showHistTab(name) {
  histTab = name;
  ['hoy','semana','movs'].forEach(t => {
    document.getElementById('htab-' + t).classList.remove('active');
  });
  document.getElementById('htab-' + name).classList.add('active');

  const ordersList = document.getElementById('orders-list');
  const movsList   = document.getElementById('movs-list');

  if (name === 'movs') {
    ordersList.style.display = 'none';
    movsList.style.display   = 'block';
    renderMovimientos();
  } else {
    ordersList.style.display = 'block';
    movsList.style.display   = 'none';
    render();
  }
}

// ── EXTRAS (Residencial / Lluvia) ─────────────────────
function toggleExtra(type) {
  extras[type] = !extras[type];
  const btn = document.getElementById('toggle-' + type);
  if (extras[type]) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
  updatePreview();
}

function getExtrasTotal() {
  return (extras.residencial ? 10 : 0) + (extras.lluvia ? 10 : 0);
}

function resetExtras() {
  extras.residencial = false;
  extras.lluvia = false;
  document.getElementById('toggle-residencial').classList.remove('active');
  document.getElementById('toggle-lluvia').classList.remove('active');
}

// ── MODO PAGO ─────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.getElementById('pt-digital').classList.toggle('active', m === 'digital');
  document.getElementById('pt-cash').classList.toggle('active',    m === 'cash');
  document.getElementById('cash-extra').style.display    = m === 'cash'    ? 'block' : 'none';
  document.getElementById('digital-extra').style.display = m === 'digital' ? 'block' : 'none';

  const btn = document.getElementById('submit-btn');
  btn.classList.toggle('amber-mode', m === 'cash');
  btn.textContent = m === 'cash' ? 'Guardar como pendiente 💰' : 'Registrar envio';

  resetExtras();
  clearFormPartial();
  document.getElementById('preview-box').style.display = 'none';
}

// ── KM → TARIFA ───────────────────────────────────────
function calcFare(km) {
  if (km < 0) return 0;
  if (km < 5) return 50;
  return 50 + Math.floor(km - 5 + 1) * 10;
  // 5.0–5.9 → 60, 6.0–6.9 → 70, etc.
  // Mismo que: floor(km) >= 5 ? 50 + (floor(km) - 4) * 10 : 50
}

// Versión correcta:
function tarifaPorKm(km) {
  if (km < 5) return 50;
  // cada km completo extra desde 5
  return 50 + (Math.floor(km) - 4) * 10;
}

function onKmInput() {
  const km  = parseFloat(document.getElementById('inp-km').value) || 0;
  const el  = document.getElementById('km-fare-preview');
  if (km <= 0) { el.textContent = ''; return; }

  const fare = tarifaPorKm(km);
  el.textContent = `${km.toFixed(1)} km  →  Tarifa sugerida: $${fare}`;

  // Rellenar campo de tarifa automáticamente
  const inp = mode === 'digital'
    ? document.getElementById('inp-envio2')
    : document.getElementById('inp-envio');
  if (inp) { inp.value = fare; updatePreview(); }
}

function updatePreview() {
  const envio  = getEnvio();
  const pague  = getPague();
  const extAmt = getExtrasTotal();
  const pb     = document.getElementById('preview-box');
  const pc     = document.getElementById('preview-content');

  if (envio <= 0 && pague <= 0) { pb.style.display = 'none'; return; }

  pb.style.display = 'block';

  const extrasLine = extAmt > 0
    ? `<div class="preview-row extras-row-preview">
        <span>${extras.residencial && extras.lluvia ? '🏘️ Residencial + 🌧️ Lluvia' : extras.residencial ? '🏘️ Residencial' : '🌧️ Lluvia'}</span>
        <span>+$${extAmt}</span>
       </div>`
    : '';

  if (mode === 'digital') {
    const ganancia = envio + extAmt;
    pc.innerHTML = `
      <div class="preview-row">
        <span>Tipo</span><span>Pedido en linea / tarjeta</span>
      </div>
      ${extrasLine}
      <div class="preview-row earn">
        <span>Tu ganancia</span>
        <span>${fmt(ganancia)}</span>
      </div>`;
  } else {
    const cobrar  = pague + envio;
    const ganancia = envio + extAmt;
    pc.innerHTML = `
      <div class="preview-row">
        <span>Pague en tienda</span><span>${fmt(pague)}</span>
      </div>
      <div class="preview-row">
        <span>Tarifa de envio</span><span>${fmt(envio)}</span>
      </div>
      ${extrasLine}
      <div class="preview-divider"></div>
      <div class="preview-row total">
        <span>Cobrar al cliente</span><span>${fmt(cobrar)}</span>
      </div>
      <div class="preview-row earn">
        <span>Tu ganancia</span><span>${fmt(ganancia)}</span>
      </div>`;
  }
}

// ── REGISTRAR ENVIO (efectivo = pendiente, digital = modal) ──
function requestCobro() {
  const nombre = (document.getElementById('inp-nombre').value.trim()) || 'Entrega';
  const envio  = getEnvio();
  const pague  = getPague();
  const km     = parseFloat(document.getElementById('inp-km').value) || 0;

  if (envio <= 0) {
    showToast('Ingresa la tarifa de envio', 'amber');
    return;
  }

  if (mode === 'cash') {
    // EFECTIVO: registrar directo como pendiente de cobro, sin modal
    const now = new Date();
    const extAmt = getExtrasTotal();
    orders.unshift({
      id:       Date.now(),
      nombre,
      envio:    envio + extAmt,
      pague,
      cobrar:   pague + envio,
      mode:     'cash',
      km,
      cobrado:  false,   // <-- pendiente
      extras:   { ...extras },
      time:     pad(now.getHours()) + ':' + pad(now.getMinutes()),
      date:     dateKey(now),
    });
    saveJSON(KEYS.orders, orders);
    render();
    updateStats();
    clearForm();
    resetExtras();
    showToast('Pendiente de cobrar 💰', 'amber');
    showTab('historial');
    showHistTab('hoy');
    return;
  }

  // DIGITAL: flujo normal con modal
  const extAmt = getExtrasTotal();
  _pendingOrder = { nombre, envio: envio + extAmt, pague, mode, km };

  document.getElementById('modal-amount').textContent = fmt(envio + extAmt);
  document.getElementById('modal-amount').style.color = 'var(--green)';

  const confirmBtn = document.getElementById('modal-confirm-btn');
  confirmBtn.className = 'modal-btn-primary';

  const extrasHtml = extAmt > 0
    ? `<div class="modal-bd-row"><span>${extras.residencial && extras.lluvia ? '🏘️ Residencial + 🌧️ Lluvia' : extras.residencial ? '🏘️ Residencial' : '🌧️ Lluvia'}</span><span>+$${extAmt}</span></div>`
    : '';

  const bd = document.getElementById('modal-breakdown');
  bd.innerHTML = `
    <div class="modal-bd-row"><span>Tipo de pedido</span><span>Tarjeta / app</span></div>
    ${km > 0 ? `<div class="modal-bd-row"><span>Distancia</span><span>${km.toFixed(1)} km</span></div>` : ''}
    ${extrasHtml}
    <div class="modal-bd-row"><span>Nombre</span><span>${escHtml(nombre)}</span></div>
    <div class="modal-bd-row total"><span>Tu ganancia</span><span>${fmt(envio + extAmt)}</span></div>`;

  document.getElementById('modal-cobro').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-cobro').style.display = 'none';
  _pendingOrder = null;
}

// ── COBRAR UN PEDIDO EFECTIVO PENDIENTE ───────────────
function cobrarPedido(id) {
  const order = orders.find(o => o.id === id);
  if (!order || order.cobrado) return;

  _pendingOrder = { ...order, _cobrarId: id };

  document.getElementById('modal-amount').textContent = fmt(order.cobrar);
  document.getElementById('modal-amount').style.color = 'var(--amber)';

  const confirmBtn = document.getElementById('modal-confirm-btn');
  confirmBtn.className = 'modal-btn-primary amber-mode';

  const bd = document.getElementById('modal-breakdown');
  bd.innerHTML = `
    <div class="modal-bd-row"><span>Pague en tienda</span><span>${fmt(order.pague)}</span></div>
    <div class="modal-bd-row"><span>Tarifa de envio</span><span>${fmt(order.envio)}</span></div>
    ${order.km > 0 ? `<div class="modal-bd-row"><span>Distancia</span><span>${order.km.toFixed(1)} km</span></div>` : ''}
    <div class="modal-bd-row total"><span>Cobrar al cliente</span><span>${fmt(order.cobrar)}</span></div>`;

  document.getElementById('modal-cobro').style.display = 'flex';
}

function confirmOrder() {
  if (!_pendingOrder) return;

  // Si es cobro de un pedido efectivo pendiente
  if (_pendingOrder._cobrarId) {
    const id = _pendingOrder._cobrarId;
    orders = orders.map(o => o.id === id ? { ...o, cobrado: true } : o);
    saveJSON(KEYS.orders, orders);
    render();
    updateStats();
    closeModal();
    showToast('¡Cobrado! ✓', 'green');
    return;
  }

  // Confirmación de pedido digital
  const { nombre, envio, pague, mode: m, km } = _pendingOrder;
  const now = new Date();
  orders.unshift({
    id:     Date.now(),
    nombre,
    envio,
    pague,
    cobrar: pague + envio,
    mode:   m,
    km,
    cobrado: true,
    time:   pad(now.getHours()) + ':' + pad(now.getMinutes()),
    date:   dateKey(now),
  });

  saveJSON(KEYS.orders, orders);
  render();
  updateStats();
  clearForm();
  resetExtras();

  closeModal();
  showToast('Envio registrado', 'green');
}

// ── ELIMINAR ORDEN ────────────────────────────────────
function deleteOrder(id) {
  orders = orders.filter(o => o.id !== id);
  saveJSON(KEYS.orders, orders);
  render();
  updateStats();
}

// ── ELIMINAR MOVIMIENTO ───────────────────────────────
function deleteMovimiento(idx) {
  if (!confirm('¿Borrar este movimiento?')) return;
  movimientos.splice(idx, 1);
  saveJSON(KEYS.movs, movimientos);
  updateStats();
  renderMovimientos();
  showToast('Movimiento borrado', 'red');
}


function clearAll() {
  if (!confirm('Borrar todos los registros del dia?')) return;
  const today = dateKey(new Date());
  orders = orders.filter(o => o.date !== today);
  saveJSON(KEYS.orders, orders);
  render();
  updateStats();
}

// ── MODAL RETIRO / DEPOSITO / SALDO INICIAL ───────────
let _movType = 'retiro';

function openMovModal(type) {
  _movType = type;
  const titles = { retiro: 'Registrar retiro', deposito: 'Registrar deposito', inicial: 'Establecer saldo inicial' };
  document.getElementById('mov-title').textContent     = titles[type];
  document.getElementById('inp-mov-monto').value       = '';
  document.getElementById('inp-mov-nota').value        = '';

  const btn = document.getElementById('mov-confirm-btn');
  btn.className = 'modal-btn-primary' +
    (type === 'retiro' ? '' : type === 'deposito' ? '' : '');
  btn.style.background = type === 'retiro' ? 'var(--red)' :
                         type === 'deposito' ? 'var(--green)' : 'var(--blue)';
  btn.style.color = '#000';

  document.getElementById('modal-movimiento').style.display = 'flex';
}

function closeMovModal() {
  document.getElementById('modal-movimiento').style.display = 'none';
}

function confirmMovimiento() {
  const monto = parseFloat(document.getElementById('inp-mov-monto').value) || 0;
  const nota  = document.getElementById('inp-mov-nota').value.trim();

  if (monto <= 0) { showToast('Ingresa un monto valido', 'amber'); return; }

  const now = new Date();

  // Si es saldo inicial, reemplazar el ultimo
  if (_movType === 'inicial') {
    movimientos = movimientos.filter(m => m.type !== 'inicial');
  }

  movimientos.unshift({
    id:    Date.now(),
    type:  _movType,
    monto,
    nota,
    time:  pad(now.getHours()) + ':' + pad(now.getMinutes()),
    date:  dateKey(now),
  });

  saveJSON(KEYS.movs, movimientos);
  updateStats();
  closeMovModal();

  const labels = { retiro: 'Retiro registrado', deposito: 'Deposito registrado', inicial: 'Saldo inicial establecido' };
  showToast(labels[_movType], _movType === 'retiro' ? 'red' : 'green');
}

// ── META ──────────────────────────────────────────────
function setMeta() {
  const current = loadJSON(KEYS.meta) || 500;
  const v = prompt('Meta de ganancias del dia:', '$' + current);
  if (!v) return;
  const n = parseFloat(String(v).replace('$','').replace(',','.'));
  if (n > 0) { saveJSON(KEYS.meta, n); updateStats(); }
}

// ── NOMBRE ────────────────────────────────────────────
function setName() {
  const current = localStorage.getItem(KEYS.name) || 'Mi cuenta';
  const v = prompt('Nombre del repartidor:', current);
  if (!v || !v.trim()) return;
  localStorage.setItem(KEYS.name, v.trim());
  applyName();
}

function applyName() {
  const name = localStorage.getItem(KEYS.name) || 'Mi cuenta';
  const el   = document.getElementById('display-name');
  if (el) el.textContent = name;
}

// ── ESTADISTICAS ──────────────────────────────────────
function updateStats() {
  const meta    = loadJSON(KEYS.meta) || 500;
  const today   = dateKey(new Date());
  const weekStart = getWeekStart();

  const todayOrders = orders.filter(o => o.date === today);
  const weekOrders  = orders.filter(o => o.date >= weekStart);

  const gananciaHoy    = todayOrders.reduce((s, o) => s + o.envio, 0);
  const gananciaSemana = weekOrders.reduce((s, o)  => s + o.envio, 0);
  const porCobrar      = todayOrders.filter(o => o.mode === 'cash' && !o.cobrado).reduce((s, o) => s + o.cobrar, 0);

  // Movimientos
  const saldoInicial = (movimientos.find(m => m.type === 'inicial')?.monto) || 0;
  const totalRetiros = movimientos.filter(m => m.type === 'retiro').reduce((s, m) => s + m.monto, 0);
  const totalDepositos = movimientos.filter(m => m.type === 'deposito').reduce((s, m) => s + m.monto, 0);

  // Saldo total = saldo inicial + ganancias + depositos - retiros
  const saldoTotal = saldoInicial + gananciaSemana + totalDepositos - totalRetiros;

  // Actualizar balance card
  const saldoStr = saldoTotal.toFixed(2).split('.');
  setText('balance-int', '$' + Number(saldoStr[0]).toLocaleString('es-MX'));
  setText('balance-dec', '.' + saldoStr[1]);

  // Chips
  setText('chip-ganancia', fmt(gananciaHoy) + ' ganado hoy');
  setText('chip-cobrar', fmt(porCobrar) + ' por cobrar');
  document.getElementById('chip-cobrar-wrap').style.display = porCobrar > 0 ? 'flex' : 'none';

  // Progreso
  const pct = Math.min((gananciaHoy / meta) * 100, 100);
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = pct + '%';
  setText('meta-val', Math.round(meta));

  // Stats grid
  setText('s-envios',      todayOrders.length);
  setText('s-semanal',     fmtShort(gananciaSemana));
  setText('s-saldo-inicial', fmtShort(saldoInicial));
  setText('s-retiros',     fmtShort(totalRetiros));

  // Bottom bar
  setText('bb-saldo', fmt(saldoTotal));
  setText('bb-hoy',   fmt(gananciaHoy));
}

// ── RENDER ORDENES ────────────────────────────────────
function render() {
  const el = document.getElementById('orders-list');
  if (el.style.display === 'none') return;

  let filtered;
  if (histTab === 'semana') {
    const ws = getWeekStart();
    filtered = orders.filter(o => o.date >= ws);
  } else {
    const today = dateKey(new Date());
    filtered = orders.filter(o => o.date === today);
  }

  if (!filtered.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon-wrap">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
        </div>
        <div class="empty-title">Sin registros</div>
        <div class="empty-sub">Agrega tu primer envio</div>
      </div>`;
    return;
  }

  el.innerHTML = filtered.map(o => {
    const isPending = o.mode === 'cash' && !o.cobrado;
    const tagLabel  = o.mode === 'digital' ? 'PAGADO' :
                      isPending ? 'POR COBRAR' : 'COBRADO';
    const tagClass  = o.mode === 'digital' ? 'digital' :
                      isPending ? 'pending' : 'cash';
    return `
    <div class="order-card ${isPending ? 'order-pending' : ''}">
      <div class="order-type-bar ${isPending ? 'pending' : o.mode}"></div>
      <div class="order-info">
        <div class="order-name">${escHtml(o.nombre)}</div>
        <div class="order-meta">
          <span class="order-meta-tag ${tagClass}">${tagLabel}</span>
          <span>${o.time}</span>
          ${o.km > 0 ? `<span>${o.km.toFixed(1)} km</span>` : ''}
        </div>
      </div>
      <div class="order-right">
        <div class="order-earn ${isPending ? 'pending' : o.mode}">${fmt(o.envio)}</div>
        ${isPending
          ? `<button class="cobrar-btn" onclick="cobrarPedido(${o.id})">Cobrar ${fmt(o.cobrar)}</button>`
          : o.mode === 'cash' ? `<div class="order-cobrar cobrado-label">✓ cobrado</div>` : ''
        }
      </div>
      <button class="del-btn" onclick="deleteOrder(${o.id})">×</button>
    </div>`;
  }).join('');
}

// ── RENDER MOVIMIENTOS ────────────────────────────────
function renderMovimientos() {
  const el = document.getElementById('movs-list');
  if (!movimientos.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon-wrap">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div class="empty-title">Sin movimientos</div>
        <div class="empty-sub">Registra retiros o depositos</div>
      </div>`;
    return;
  }

  const icons = {
    retiro:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
    deposito: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>`,
    inicial:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>`,
  };
  const labels = { retiro: 'Retiro', deposito: 'Deposito', inicial: 'Saldo inicial' };
  const signs  = { retiro: '-', deposito: '+', inicial: '' };

  el.innerHTML = movimientos.map((m, idx) => `
    <div class="mov-card">
      <div class="mov-icon ${m.type}">${icons[m.type]}</div>
      <div class="mov-info">
        <div class="mov-name">${labels[m.type]}</div>
        <div class="mov-nota">${m.nota ? escHtml(m.nota) : m.time}</div>
      </div>
      <div class="mov-amount ${m.type}">${signs[m.type]}${fmt(m.monto)}</div>
      <button class="del-btn mov-del-btn" onclick="deleteMovimiento(${idx})" title="Borrar">×</button>
    </div>`).join('');
}

// ── MODAL TARIFAS ─────────────────────────────────────
function showTarifaModal() {
  document.getElementById('modal-tarifa').style.display = 'flex';
}
function closeTarifaModal() {
  document.getElementById('modal-tarifa').style.display = 'none';
}

// ── TOAST ─────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type) {
  const t  = document.getElementById('toast');
  const bar= document.getElementById('toast-bar');
  const m  = document.getElementById('toast-msg');
  const colors = { green:'var(--green)', amber:'var(--amber)', red:'var(--red)', blue:'var(--blue)' };
  bar.style.background = colors[type] || colors.green;
  m.textContent = msg;
  clearTimeout(_toastTimer);
  t.classList.add('show');
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ── HELPERS ───────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function fmt(n) { return '$' + Number(n).toFixed(2); }
function fmtShort(n) { return '$' + Math.round(n); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function getEnvio() {
  const id = mode === 'digital' ? 'inp-envio2' : 'inp-envio';
  return parseFloat(document.getElementById(id)?.value) || 0;
}
function getPague() {
  if (mode !== 'cash') return 0;
  return parseFloat(document.getElementById('inp-pague')?.value) || 0;
}

function clearForm() {
  ['inp-nombre','inp-km','inp-envio','inp-envio2','inp-pague'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('km-fare-preview').textContent = '';
  document.getElementById('preview-box').style.display = 'none';
}
function clearFormPartial() {
  ['inp-envio','inp-envio2','inp-pague'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('preview-box').style.display = 'none';
}

function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}
function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; }
}

function dateKey(d) {
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=dom
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // lunes
  const mon = new Date(now.setDate(diff));
  return dateKey(mon);
}
