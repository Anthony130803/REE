/* ============================================================
   Reparto Facil — Mapas v3
   Leaflet + Stadia Dark + Photon/Nominatim + OSRM
   Botones para abrir Waze / Google Maps con ruta lista
   ============================================================ */

'use strict';

let _map             = null;
let _routeLayer      = null;
let _markerOrigen    = null;
let _markerDestino   = null;
let _coordOrigen     = null;
let _coordDestino    = null;
let _ubicacionActual = null;
let _searchTimeout   = null;
let _mapaIniciado    = false;

// ── INIT ──────────────────────────────────────────────────────
function initMap() {
  if (_mapaIniciado) {
    if (_map) { _map.invalidateSize(); if (_ubicacionActual) _map.setView(_ubicacionActual, 15); }
    return;
  }
  _mapaIniciado = true;

  _map = L.map('mapa-container', {
    center: [22.1565, -100.9855],
    zoom: 13,
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '© Stadia Maps © OpenMapTiles © OpenStreetMap',
  }).addTo(_map);

  L.control.zoom({ position: 'bottomright' }).addTo(_map);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(_map);

  mostrarBannerGps();
}

// ── ICONOS ────────────────────────────────────────────────────
function iconoPunto(color, size = 14) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.6);"></div>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2],
  });
}

function iconoUbicacion() {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:20px;height:20px;">
      <div style="position:absolute;inset:0;background:rgba(66,133,244,0.25);border-radius:50%;animation:pulse-gps 1.8s ease-out infinite;"></div>
      <div style="position:absolute;top:3px;left:3px;width:14px;height:14px;background:#4285F4;border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.5);"></div>
    </div>`,
    iconSize: [20, 20], iconAnchor: [10, 10],
  });
}

// ── GPS ───────────────────────────────────────────────────────
function mostrarBannerGps() {
  if (_ubicacionActual) return;
  if (navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' }).then(r => {
      if      (r.state === 'granted') detectarUbicacion(false);
      else if (r.state === 'denied')  mostrarAvisoPermisoDenegado();
      else                            insertarBannerGps();
    }).catch(() => insertarBannerGps());
  } else { insertarBannerGps(); }
}

function insertarBannerGps() {
  const panel = document.getElementById('panel-mapa');
  if (!panel || document.getElementById('banner-gps')) return;
  const b = document.createElement('div');
  b.id = 'banner-gps'; b.className = 'banner-gps';
  b.innerHTML = `<span class="banner-gps-icon">📍</span><span class="banner-gps-texto">Activa el GPS para detectar tu ubicación</span><button class="banner-gps-btn" onclick="pedirGpsDesdeBoton()">Activar</button>`;
  panel.insertBefore(b, panel.firstChild);
}

function pedirGpsDesdeBoton() {
  const b = document.getElementById('banner-gps');
  if (b) b.innerHTML = `<span class="banner-gps-icon">⏳</span><span class="banner-gps-texto">Esperando permiso...</span>`;
  detectarUbicacion(true);
}

function mostrarAvisoPermisoDenegado() {
  const panel = document.getElementById('panel-mapa');
  if (!panel || document.getElementById('banner-gps')) return;
  const b = document.createElement('div');
  b.id = 'banner-gps'; b.className = 'banner-gps banner-gps-error';
  b.innerHTML = `<span class="banner-gps-icon">⚠️</span><div class="banner-gps-texto">GPS bloqueado.<br><small>Configuración → Apps → Chrome → Permisos → Ubicación → Permitir</small></div>`;
  panel.insertBefore(b, panel.firstChild);
}

function detectarUbicacion(mostrarToast = true) {
  if (!navigator.geolocation) { if (mostrarToast) showToast('GPS no disponible', 'amber'); return; }
  const btn = document.getElementById('btn-gps');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  navigator.geolocation.getCurrentPosition(
    pos => {
      _ubicacionActual = [pos.coords.latitude, pos.coords.longitude];
      if (btn) { btn.textContent = '📍'; btn.disabled = false; }
      const banner = document.getElementById('banner-gps');
      if (banner) banner.remove();

      if (_map) {
        _map.setView(_ubicacionActual, 15);
        if (window._markerUbicacion) { window._markerUbicacion.setLatLng(_ubicacionActual); }
        else { window._markerUbicacion = L.marker(_ubicacionActual, { icon: iconoUbicacion(), zIndexOffset: 1000 }).addTo(_map).bindPopup('<b>Tu ubicación</b>'); }
      }

      const inp = document.getElementById('inp-origen');
      if (inp && !inp.value) {
        inp.value = 'Mi ubicación actual';
        _coordOrigen = _ubicacionActual;
        if (_coordDestino) calcularRuta();
      }
      if (mostrarToast) showToast('📍 Ubicación detectada', 'green');
    },
    err => {
      if (btn) { btn.textContent = '📍'; btn.disabled = false; }
      const banner = document.getElementById('banner-gps');
      if (err.code === 1) {
        if (banner) { banner.className = 'banner-gps banner-gps-error'; banner.innerHTML = `<span class="banner-gps-icon">⚠️</span><div class="banner-gps-texto">GPS bloqueado.<br><small>Configuración → Apps → Chrome → Permisos → Ubicación → Permitir</small></div>`; }
        if (mostrarToast) showToast('GPS bloqueado — ve a Configuración', 'red');
      } else {
        if (mostrarToast) showToast({ 2: 'GPS no disponible', 3: 'GPS tardó demasiado' }[err.code] || 'Error de GPS', 'amber');
      }
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}

function usarUbicacionComoOrigen() {
  if (_ubicacionActual) {
    _coordOrigen = _ubicacionActual;
    document.getElementById('inp-origen').value = 'Mi ubicación actual';
    document.getElementById('sugerencias-origen').style.display = 'none';
    if (_markerOrigen) _map.removeLayer(_markerOrigen);
    _markerOrigen = L.marker(_coordOrigen, { icon: iconoPunto('#22c55e', 16) }).addTo(_map).bindPopup('<b>Origen</b><br>Tu ubicación').openPopup();
    if (_coordDestino) calcularRuta();
    showToast('Origen: tu ubicación 📍', 'green');
  } else {
    showToast('Detectando GPS...', 'amber');
    detectarUbicacion(true);
  }
}

// ── BÚSQUEDA DUAL Nominatim + Photon ─────────────────────────
async function buscarDireccion(query, callback) {
  if (!query || query.length < 2) return;
  const yaSlp = /san luis|potosi|slp/i.test(query);

  const nominatim = (async () => {
    try {
      const q = yaSlp ? query : `${query}, San Luis Potosí, México`;
      const p = new URLSearchParams({ q, format: 'json', limit: 4, addressdetails: 1, countrycodes: 'mx', dedupe: 1, viewbox: '-101.3,21.8,-100.6,22.5' });
      const d = await (await fetch(`https://nominatim.openstreetmap.org/search?${p}`, { headers: { 'Accept-Language': 'es-MX' } })).json();
      return d.map(r => { const a = r.address||{}; return { lat: +r.lat, lon: +r.lon, numero: a.house_number||'', calle: a.road||a.pedestrian||'', colonia: a.suburb||a.neighbourhood||a.quarter||'', ciudad: a.city||a.town||'San Luis Potosí', tipo: r.type||'place' }; });
    } catch { return []; }
  })();

  const photon = (async () => {
    try {
      const q = yaSlp ? query : `${query} San Luis Potosí`;
      const p = new URLSearchParams({ q, limit: 4, lang: 'es', lat: '22.1565', lon: '-100.9855' });
      const d = await (await fetch(`https://photon.komoot.io/api/?${p}`)).json();
      return (d.features||[]).filter(f => { const c = f.properties?.country||''; return /mexico|méxico/i.test(c); })
        .map(f => { const p = f.properties||{}; const [lon,lat] = f.geometry.coordinates; return { lat, lon, numero: p.housenumber||'', calle: p.street||p.name||'', colonia: p.district||p.locality||p.suburb||'', ciudad: p.city||p.town||'San Luis Potosí', tipo: p.type||'place' }; });
    } catch { return []; }
  })();

  const [rN, rP] = await Promise.all([nominatim, photon]);
  const todos = [...rN, ...rP];
  const conNum = todos.filter(r => r.numero);
  const sinNum = todos.filter(r => !r.numero);
  const dedup = [];
  for (const r of [...conNum, ...sinNum]) {
    if (!dedup.some(d => Math.abs(d.lat-r.lat) < 0.0005 && Math.abs(d.lon-r.lon) < 0.0005)) dedup.push(r);
    if (dedup.length >= 6) break;
  }
  callback(dedup);
}

function mostrarSugerencias(resultados, contenedorId) {
  const el = document.getElementById(contenedorId);
  if (!el) return;
  if (!resultados.length) {
    el.innerHTML = `<div class="map-suggestion no-results"><span class="sug-icon">🔍</span><span class="sug-texto">Sin resultados</span></div>`;
    el.style.display = 'block'; return;
  }
  const iconos = { house:'🏠', building:'🏢', amenity:'📍', shop:'🛍️', road:'🛣️', residential:'🏘️' };
  el.innerHTML = resultados.map((r,i) => {
    const l1 = [r.calle, r.numero].filter(Boolean).join(' ') || r.ciudad;
    const l2 = [r.colonia, r.ciudad].filter(Boolean).join(', ');
    const ic = iconos[r.tipo] || (r.numero ? '🏠' : '📍');
    return `<div class="map-suggestion" onclick="seleccionarSugerencia(${i},'${contenedorId}')"><span class="sug-icon">${ic}</span><div class="sug-lineas"><span class="sug-linea1">${escHtml(l1)}</span>${l2?`<span class="sug-linea2">${escHtml(l2)}</span>`:''}</div></div>`;
  }).join('');
  el._resultados = resultados; el.style.display = 'block';
}

function seleccionarSugerencia(idx, contenedorId) {
  const el = document.getElementById(contenedorId);
  if (!el || !el._resultados) return;
  const r = el._resultados[idx];
  const coords = [r.lat, r.lon];
  const nombre = [r.calle, r.numero, r.colonia ? `Col. ${r.colonia}` : ''].filter(Boolean).join(' ') || r.ciudad;
  el.style.display = 'none';

  if (contenedorId === 'sugerencias-origen') {
    document.getElementById('inp-origen').value = nombre;
    _coordOrigen = coords;
    if (_markerOrigen) _map.removeLayer(_markerOrigen);
    _markerOrigen = L.marker(coords, { icon: iconoPunto('#22c55e',16) }).addTo(_map).bindPopup(`<b>Origen</b><br>${escHtml(nombre)}`).openPopup();
    _map.setView(coords, 17);
  } else {
    document.getElementById('inp-destino').value = nombre;
    _coordDestino = coords;
    if (_markerDestino) _map.removeLayer(_markerDestino);
    _markerDestino = L.marker(coords, { icon: iconoPunto('#ef4444',16) }).addTo(_map).bindPopup(`<b>Destino</b><br>${escHtml(nombre)}`).openPopup();
    _map.setView(coords, 17);
    actualizarBotonesNavegacion(nombre, coords);
  }
  if (_coordOrigen && _coordDestino) calcularRuta();
}

// ── BOTONES WAZE / GOOGLE MAPS ────────────────────────────────
function actualizarBotonesNavegacion(nombreDestino, coords) {
  const el = document.getElementById('nav-botones');
  if (!el) return;

  const lat = coords[0];
  const lng = coords[1];
  const query = encodeURIComponent(nombreDestino + ', San Luis Potosí');

  // Waze: abre con navegación al destino directo
  const urlWaze   = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  // Google Maps: abre con ruta al destino
  const urlGmaps  = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  el.style.display = 'flex';
  el.innerHTML = `
    <a class="btn-nav waze"  href="${urlWaze}"  target="_blank" rel="noopener">
      <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Waze_icon.svg/64px-Waze_icon.svg.png" alt="Waze" style="width:20px;height:20px;"/>
      Abrir en Waze
    </a>
    <a class="btn-nav gmaps" href="${urlGmaps}" target="_blank" rel="noopener">
      <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Google_Maps_Logo_2020.svg/64px-Google_Maps_Logo_2020.svg.png" alt="Google Maps" style="width:20px;height:20px;"/>
      Google Maps
    </a>`;
}

// ── CALCULAR DISTANCIA (OSRM — solo para la tarifa) ───────────
async function calcularRuta() {
  if (!_coordOrigen || !_coordDestino) { showToast('Pon origen y destino primero', 'amber'); return; }
  const btn = document.getElementById('btn-calcular-ruta');
  if (btn) { btn.textContent = '⏳ Calculando...'; btn.disabled = true; }

  const url = `https://router.project-osrm.org/route/v1/driving/${_coordOrigen[1]},${_coordOrigen[0]};${_coordDestino[1]},${_coordDestino[0]}?overview=full&geometries=geojson`;
  try {
    const data = await (await fetch(url)).json();
    if (data.code !== 'Ok' || !data.routes.length) { showToast('No se pudo calcular la distancia', 'red'); if (btn) { btn.textContent = '🗺️ Calcular ruta'; btn.disabled = false; } return; }

    const distKm = data.routes[0].distance / 1000;
    const mins   = Math.round(data.routes[0].duration / 60);

    // Dibujar ruta en el mapa de referencia
    if (_routeLayer) _map.removeLayer(_routeLayer);
    _routeLayer = L.layerGroup([
      L.geoJSON(data.routes[0].geometry, { style: { color: '#1e1b4b', weight: 8, opacity: 0.5 } }),
      L.geoJSON(data.routes[0].geometry, { style: { color: '#818cf8', weight: 5, opacity: 1   } }),
    ]).addTo(_map);
    _map.fitBounds(L.geoJSON(data.routes[0].geometry).getBounds(), { padding: [40,40] });

    mostrarResultadoRuta(distKm, mins);
    if (btn) { btn.textContent = '🔄 Recalcular'; btn.disabled = false; }
  } catch (e) {
    showToast('Error de red', 'red');
    if (btn) { btn.textContent = '🗺️ Calcular ruta'; btn.disabled = false; }
  }
}

function mostrarResultadoRuta(distKm, minutos) {
  const tarifa = calcFare(distKm);
  const el = document.getElementById('ruta-resultado');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `
    <div class="ruta-stats">
      <div class="ruta-stat"><span class="rstat-val">${distKm.toFixed(1)}</span><span class="rstat-label">km</span></div>
      <div class="ruta-stat-sep"></div>
      <div class="ruta-stat"><span class="rstat-val">${minutos}</span><span class="rstat-label">min</span></div>
      <div class="ruta-stat-sep"></div>
      <div class="ruta-stat green"><span class="rstat-val">$${tarifa}</span><span class="rstat-label">tarifa</span></div>
    </div>
    <button class="btn-usar-tarifa" onclick="usarTarifaDetectada(${distKm.toFixed(2)},${tarifa})">✓ Usar esta tarifa</button>`;
}

function usarTarifaDetectada(km, tarifa) {
  const inpKm = document.getElementById('inp-km');
  if (inpKm) { inpKm.value = km; document.getElementById('km-fare-preview').textContent = `${parseFloat(km).toFixed(1)} km  →  Tarifa sugerida: $${tarifa}`; }
  const inp = mode === 'digital' ? document.getElementById('inp-envio2') : document.getElementById('inp-envio');
  if (inp) { inp.value = tarifa; updatePreview(); }
  showTab('nuevo');
  showToast(`${parseFloat(km).toFixed(1)} km → $${tarifa} aplicado ✓`, 'green');
}

function limpiarRuta() {
  if (_routeLayer)    { _map.removeLayer(_routeLayer);    _routeLayer    = null; }
  if (_markerOrigen)  { _map.removeLayer(_markerOrigen);  _markerOrigen  = null; }
  if (_markerDestino) { _map.removeLayer(_markerDestino); _markerDestino = null; }
  _coordOrigen = null; _coordDestino = null;
  document.getElementById('inp-origen').value  = '';
  document.getElementById('inp-destino').value = '';
  ['sugerencias-origen','sugerencias-destino'].forEach(id => { const e = document.getElementById(id); if(e) e.style.display='none'; });
  const res = document.getElementById('ruta-resultado'); if (res) res.style.display = 'none';
  const nav = document.getElementById('nav-botones');    if (nav) nav.style.display = 'none';
  const btn = document.getElementById('btn-calcular-ruta'); if (btn) { btn.textContent='🗺️ Calcular ruta'; btn.disabled=false; }
}

function onOrigenInput() {
  const val = document.getElementById('inp-origen').value;
  clearTimeout(_searchTimeout);
  if (val.length < 3) { document.getElementById('sugerencias-origen').style.display='none'; return; }
  _searchTimeout = setTimeout(() => buscarDireccion(val, res => mostrarSugerencias(res,'sugerencias-origen')), 380);
}

function onDestinoInput() {
  const val = document.getElementById('inp-destino').value;
  clearTimeout(_searchTimeout);
  if (val.length < 3) { document.getElementById('sugerencias-destino').style.display='none'; return; }
  _searchTimeout = setTimeout(() => buscarDireccion(val, res => mostrarSugerencias(res,'sugerencias-destino')), 380);
}

document.addEventListener('click', e => {
  if (!e.target.closest('.map-search-wrap')) document.querySelectorAll('.sugerencias-list').forEach(el => el.style.display='none');
});
