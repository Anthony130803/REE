/* ============================================================
   Reparto Facil — Mapas con Leaflet + OpenStreetMap + OSRM
   Sin API key, 100% gratis
   ============================================================ */

'use strict';

let _map = null;
let _routeLayer = null;
let _markerOrigen = null;
let _markerDestino = null;
let _coordOrigen = null;
let _coordDestino = null;
let _ubicacionActual = null;
let _searchTimeout = null;

// ── INIT ─────────────────────────────────────────────────────
function initMap() {
  if (_map) return;

  _map = L.map('mapa-container', {
    center: [22.1565, -100.9855], // SLP por defecto
    zoom: 13,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(_map);

  // Detectar ubicación al iniciar el mapa
  detectarUbicacion(false);
}

// ── ICONOS PERSONALIZADOS ────────────────────────────────────
function crearIcono(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;
      background:${color};
      border:2.5px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// ── DETECTAR UBICACION ACTUAL ────────────────────────────────
function detectarUbicacion(mostrarToast = true) {
  if (!navigator.geolocation) {
    if (mostrarToast) showToast('GPS no disponible', 'amber');
    return;
  }

  const btnGps = document.getElementById('btn-gps');
  if (btnGps) btnGps.textContent = '⏳';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      _ubicacionActual = [pos.coords.latitude, pos.coords.longitude];
      if (btnGps) btnGps.textContent = '📍';

      if (_map) {
        _map.setView(_ubicacionActual, 14);
      }

      // Poner marcador de ubicación actual
      if (window._markerUbicacion) {
        window._markerUbicacion.setLatLng(_ubicacionActual);
      } else {
        window._markerUbicacion = L.marker(_ubicacionActual, {
          icon: L.divIcon({
            className: '',
            html: `<div style="
              width:16px;height:16px;
              background:#4285F4;
              border:3px solid #fff;
              border-radius:50%;
              box-shadow:0 0 0 4px rgba(66,133,244,0.25);
            "></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        }).addTo(_map).bindPopup('Tu ubicación');
      }

      if (mostrarToast) showToast('Ubicación detectada 📍', 'green');
    },
    (err) => {
      if (btnGps) btnGps.textContent = '📍';
      if (mostrarToast) {
        const msgs = {
          1: 'Permiso de GPS denegado',
          2: 'GPS no disponible',
          3: 'Tiempo de espera agotado',
        };
        showToast(msgs[err.code] || 'Error de GPS', 'red');
      }
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ── BUSQUEDA DE DIRECCIONES (Nominatim) ──────────────────────
async function buscarDireccion(query, callback) {
  if (!query || query.length < 3) return;

  const base = 'https://nominatim.openstreetmap.org/search';
  const params = new URLSearchParams({
    q: query + ', San Luis Potosí, México',
    format: 'json',
    limit: 5,
    addressdetails: 1,
    countrycodes: 'mx',
  });

  try {
    const res = await fetch(`${base}?${params}`, {
      headers: { 'Accept-Language': 'es' }
    });
    const data = await res.json();
    callback(data);
  } catch (e) {
    callback([]);
  }
}

// ── MOSTRAR SUGERENCIAS ──────────────────────────────────────
function mostrarSugerencias(resultados, contenedorId, onSelect) {
  const el = document.getElementById(contenedorId);
  if (!el) return;

  if (!resultados.length) {
    el.innerHTML = '<div class="map-suggestion no-results">Sin resultados</div>';
    el.style.display = 'block';
    return;
  }

  el.innerHTML = resultados.map((r, i) => {
    const nombre = r.display_name.split(',').slice(0, 3).join(', ');
    return `<div class="map-suggestion" onclick="seleccionarSugerencia(${i}, '${contenedorId}')">
      <span class="sug-icon">📍</span>
      <span class="sug-texto">${escHtml(nombre)}</span>
    </div>`;
  }).join('');

  // Guardar resultados para acceso por índice
  el._resultados = resultados;
  el.style.display = 'block';
}

// ── SELECCIONAR SUGERENCIA ───────────────────────────────────
function seleccionarSugerencia(idx, contenedorId) {
  const el = document.getElementById(contenedorId);
  if (!el || !el._resultados) return;

  const r = el._resultados[idx];
  const coords = [parseFloat(r.lat), parseFloat(r.lon)];
  const nombre = r.display_name.split(',').slice(0, 2).join(', ');

  el.style.display = 'none';

  if (contenedorId === 'sugerencias-origen') {
    document.getElementById('inp-origen').value = nombre;
    _coordOrigen = coords;
    if (_markerOrigen) _map.removeLayer(_markerOrigen);
    _markerOrigen = L.marker(coords, { icon: crearIcono('#22c55e') })
      .addTo(_map).bindPopup('Origen: ' + nombre);
    if (_map) _map.setView(coords, 15);
  } else {
    document.getElementById('inp-destino').value = nombre;
    _coordDestino = coords;
    if (_markerDestino) _map.removeLayer(_markerDestino);
    _markerDestino = L.marker(coords, { icon: crearIcono('#ef4444') })
      .addTo(_map).bindPopup('Destino: ' + nombre);
    if (_map) _map.setView(coords, 15);
  }

  // Si tenemos ambos puntos, calcular ruta
  if (_coordOrigen && _coordDestino) {
    calcularRuta();
  }
}

// ── CALCULAR RUTA (OSRM) ────────────────────────────────────
async function calcularRuta() {
  if (!_coordOrigen || !_coordDestino) return;

  const btnCalc = document.getElementById('btn-calcular-ruta');
  if (btnCalc) btnCalc.textContent = '⏳ Calculando...';

  const url = `https://router.project-osrm.org/route/v1/driving/` +
    `${_coordOrigen[1]},${_coordOrigen[0]};${_coordDestino[1]},${_coordDestino[0]}` +
    `?overview=full&geometries=geojson`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes.length) {
      showToast('No se pudo calcular la ruta', 'red');
      if (btnCalc) btnCalc.textContent = '🗺️ Calcular ruta';
      return;
    }

    const ruta = data.routes[0];
    const distKm = ruta.distance / 1000;
    const minutos = Math.round(ruta.duration / 60);

    // Dibujar ruta en el mapa
    if (_routeLayer) _map.removeLayer(_routeLayer);
    _routeLayer = L.geoJSON(ruta.geometry, {
      style: { color: '#6366f1', weight: 4, opacity: 0.85 }
    }).addTo(_map);

    // Ajustar vista para ver toda la ruta
    _map.fitBounds(_routeLayer.getBounds(), { padding: [30, 30] });

    // Mostrar resultado
    mostrarResultadoRuta(distKm, minutos);

    if (btnCalc) btnCalc.textContent = '🗺️ Calcular ruta';

  } catch (e) {
    showToast('Error calculando ruta', 'red');
    if (btnCalc) btnCalc.textContent = '🗺️ Calcular ruta';
  }
}

// ── MOSTRAR RESULTADO DE RUTA ────────────────────────────────
function mostrarResultadoRuta(distKm, minutos) {
  const tarifa = calcFare(distKm);
  const el = document.getElementById('ruta-resultado');
  if (!el) return;

  el.style.display = 'block';
  el.innerHTML = `
    <div class="ruta-row">
      <span class="ruta-icon">📏</span>
      <span class="ruta-label">Distancia</span>
      <span class="ruta-val">${distKm.toFixed(1)} km</span>
    </div>
    <div class="ruta-row">
      <span class="ruta-icon">⏱️</span>
      <span class="ruta-label">Tiempo estimado</span>
      <span class="ruta-val">${minutos} min</span>
    </div>
    <div class="ruta-row tarifa-row">
      <span class="ruta-icon">💰</span>
      <span class="ruta-label">Tarifa de envío</span>
      <span class="ruta-val tarifa-val">$${tarifa}</span>
    </div>
    <button class="btn-usar-tarifa" onclick="usarTarifaDetectada(${distKm.toFixed(2)}, ${tarifa})">
      Usar esta tarifa ✓
    </button>`;
}

// ── USAR TARIFA DETECTADA EN EL FORM ────────────────────────
function usarTarifaDetectada(km, tarifa) {
  // Llenar campos del formulario
  const inpKm = document.getElementById('inp-km');
  if (inpKm) {
    inpKm.value = km;
    document.getElementById('km-fare-preview').textContent =
      `${parseFloat(km).toFixed(1)} km  →  Tarifa sugerida: $${tarifa}`;
  }
  const inp = mode === 'digital'
    ? document.getElementById('inp-envio2')
    : document.getElementById('inp-envio');
  if (inp) { inp.value = tarifa; updatePreview(); }

  // Cambiar a pestaña de nuevo envío
  showTab('nuevo');
  showToast(`${parseFloat(km).toFixed(1)} km → $${tarifa} aplicado ✓`, 'green');
}

// ── LIMPIAR RUTA ─────────────────────────────────────────────
function limpiarRuta() {
  if (_routeLayer) { _map.removeLayer(_routeLayer); _routeLayer = null; }
  if (_markerOrigen) { _map.removeLayer(_markerOrigen); _markerOrigen = null; }
  if (_markerDestino) { _map.removeLayer(_markerDestino); _markerDestino = null; }
  _coordOrigen = null;
  _coordDestino = null;

  document.getElementById('inp-origen').value = '';
  document.getElementById('inp-destino').value = '';
  document.getElementById('sugerencias-origen').style.display = 'none';
  document.getElementById('sugerencias-destino').style.display = 'none';
  const el = document.getElementById('ruta-resultado');
  if (el) el.style.display = 'none';
}

// ── INPUT HANDLERS ───────────────────────────────────────────
function onOrigenInput() {
  const val = document.getElementById('inp-origen').value;
  clearTimeout(_searchTimeout);
  _searchTimeout = setTimeout(() => {
    if (val.length >= 3) {
      buscarDireccion(val, (res) => mostrarSugerencias(res, 'sugerencias-origen', null));
    } else {
      document.getElementById('sugerencias-origen').style.display = 'none';
    }
  }, 400);
}

function onDestinoInput() {
  const val = document.getElementById('inp-destino').value;
  clearTimeout(_searchTimeout);
  _searchTimeout = setTimeout(() => {
    if (val.length >= 3) {
      buscarDireccion(val, (res) => mostrarSugerencias(res, 'sugerencias-destino', null));
    } else {
      document.getElementById('sugerencias-destino').style.display = 'none';
    }
  }, 400);
}

// Usar ubicación actual como origen
function usarUbicacionComoOrigen() {
  if (!_ubicacionActual) {
    detectarUbicacion(true);
    showToast('Detectando ubicación...', 'amber');
    return;
  }
  _coordOrigen = _ubicacionActual;
  document.getElementById('inp-origen').value = 'Mi ubicación actual';
  document.getElementById('sugerencias-origen').style.display = 'none';

  if (_markerOrigen) _map.removeLayer(_markerOrigen);
  _markerOrigen = L.marker(_coordOrigen, { icon: crearIcono('#22c55e') })
    .addTo(_map).bindPopup('Origen: Tu ubicación');

  if (_coordDestino) calcularRuta();
  showToast('Usando tu ubicación como origen 📍', 'green');
}

// Cerrar sugerencias al hacer click fuera
document.addEventListener('click', (e) => {
  if (!e.target.closest('.map-search-wrap')) {
    document.querySelectorAll('.sugerencias-list').forEach(el => el.style.display = 'none');
  }
});
