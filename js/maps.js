/* ============================================================
   Reparto Facil — Mapas v2
   Leaflet + Stadia Dark tiles + OSRM + Nominatim
   GPS automático al abrir, búsqueda mejorada con número
   ============================================================ */

'use strict';

let _map          = null;
let _routeLayer   = null;
let _markerOrigen  = null;
let _markerDestino = null;
let _coordOrigen   = null;
let _coordDestino  = null;
let _ubicacionActual = null;
let _searchTimeout = null;
let _mapaIniciado  = false;

// ── INIT MAP ─────────────────────────────────────────────────
function initMap() {
  if (_mapaIniciado) {
    // Ya existe: solo invalidar tamaño y re-centrar si hay ubicación
    if (_map) {
      _map.invalidateSize();
      if (_ubicacionActual) _map.setView(_ubicacionActual, 15);
    }
    return;
  }
  _mapaIniciado = true;

  _map = L.map('mapa-container', {
    center: [22.1565, -100.9855],
    zoom: 13,
    zoomControl: false,        // lo ponemos abajo a la derecha manualmente
    attributionControl: false,
  });

  // Tiles oscuros de Stadia (Alidade Smooth Dark) — gratis, sin API key, muy bonitos
  L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  }).addTo(_map);

  // Control de zoom abajo a la derecha
  L.control.zoom({ position: 'bottomright' }).addTo(_map);

  // Atribución pequeña abajo izquierda
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(_map);

  // Mostrar banner de GPS en vez de pedirlo automáticamente.
  // Android requiere un gesto del usuario para disparar el permiso.
  mostrarBannerGps();
}

// ── ICONOS ────────────────────────────────────────────────────
function iconoPunto(color, size = 14) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2.5px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.6);
    "></div>`,
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function iconoUbicacion() {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:20px;height:20px;">
        <div style="
          position:absolute;inset:0;
          background:rgba(66,133,244,0.25);
          border-radius:50%;
          animation:pulse-gps 1.8s ease-out infinite;
        "></div>
        <div style="
          position:absolute;top:3px;left:3px;
          width:14px;height:14px;
          background:#4285F4;
          border:2.5px solid #fff;
          border-radius:50%;
          box-shadow:0 2px 6px rgba(0,0,0,0.5);
        "></div>
      </div>`,
    iconSize:   [20, 20],
    iconAnchor: [10, 10],
  });
}

// ── GPS AUTOMÁTICO ────────────────────────────────────────────
function detectarUbicacion(mostrarToast = true) {
  if (!navigator.geolocation) {
    if (mostrarToast) showToast('GPS no disponible en este dispositivo', 'amber');
    return;
  }

  const btn = document.getElementById('btn-gps');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  navigator.geolocation.getCurrentPosition(
    pos => {
      _ubicacionActual = [pos.coords.latitude, pos.coords.longitude];

      if (btn) { btn.textContent = '📍'; btn.disabled = false; }

      if (_map) {
        _map.setView(_ubicacionActual, 15);

        // Marcador de posición actual con pulso
        if (window._markerUbicacion) {
          window._markerUbicacion.setLatLng(_ubicacionActual);
        } else {
          window._markerUbicacion = L.marker(_ubicacionActual, { icon: iconoUbicacion(), zIndexOffset: 1000 })
            .addTo(_map)
            .bindPopup('<b>Tu ubicación</b>');
        }
      }

      // Auto-rellenar el campo de origen con "Mi ubicación"
      const inpOrigen = document.getElementById('inp-origen');
      if (inpOrigen && !inpOrigen.value) {
        inpOrigen.value = 'Mi ubicación actual';
        _coordOrigen = _ubicacionActual;
        // Si ya hay destino, calcular ruta al tiro
        if (_coordDestino) calcularRuta();
      }

      if (mostrarToast) showToast('📍 Ubicación detectada', 'green');
    },
    err => {
      if (btn) { btn.textContent = '📍'; btn.disabled = false; }
      const msgs = { 1: 'Permiso de GPS denegado', 2: 'GPS no disponible', 3: 'GPS tardó demasiado' };
      if (mostrarToast) showToast(msgs[err.code] || 'Error de GPS', 'red');
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}

// ── BÚSQUEDA DUAL: Nominatim + Photon ────────────────────────
// Photon (Komoot) tiene mejor cobertura de números de casa en México
// Los combinamos y quitamos duplicados por coordenada
async function buscarDireccion(query, callback) {
  if (!query || query.length < 2) return;

  const yaIncluyeSLP = /san luis|potosi|slp/i.test(query);

  // ── Nominatim (búsqueda estructurada) ──
  const nominatimPromise = (async () => {
    try {
      const queryFull = yaIncluyeSLP ? query : `${query}, San Luis Potosí, México`;
      const params = new URLSearchParams({
        q:              queryFull,
        format:         'json',
        limit:          5,
        addressdetails: 1,
        countrycodes:   'mx',
        dedupe:         1,
        viewbox:        '-101.3,21.8,-100.6,22.5',
      });
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        { headers: { 'Accept-Language': 'es-MX,es;q=0.9' } }
      );
      const data = await res.json();
      // Normalizar al formato interno
      return data.map(r => {
        const a = r.address || {};
        return {
          lat:    parseFloat(r.lat),
          lon:    parseFloat(r.lon),
          numero: a.house_number || '',
          calle:  a.road || a.pedestrian || a.footway || '',
          colonia: a.suburb || a.neighbourhood || a.quarter || a.village || '',
          ciudad: a.city || a.town || a.municipality || 'San Luis Potosí',
          tipo:   r.type || 'place',
          fuente: 'nominatim',
        };
      });
    } catch { return []; }
  })();

  // ── Photon / Komoot (mejor cobertura de números en MX) ──
  const photonPromise = (async () => {
    try {
      const queryFull = yaIncluyeSLP ? query : `${query} San Luis Potosí`;
      const params = new URLSearchParams({
        q:    queryFull,
        limit: 5,
        lang: 'es',
        // Bias hacia SLP
        lat:  '22.1565',
        lon:  '-100.9855',
      });
      const res = await fetch(`https://photon.komoot.io/api/?${params}`);
      const data = await res.json();
      return (data.features || [])
        .filter(f => {
          // Solo resultados de México y cerca de SLP
          const p = f.properties || {};
          return p.country === 'Mexico' || p.country === 'México';
        })
        .map(f => {
          const p = f.properties || {};
          const [lon, lat] = f.geometry.coordinates;
          return {
            lat,
            lon,
            numero:  p.housenumber || '',
            calle:   p.street || p.name || '',
            colonia: p.district || p.locality || p.suburb || '',
            ciudad:  p.city || p.town || p.village || 'San Luis Potosí',
            tipo:    p.type || 'place',
            fuente:  'photon',
          };
        });
    } catch { return []; }
  })();

  // Esperar ambas y combinar
  const [resNominatim, resPhoton] = await Promise.all([nominatimPromise, photonPromise]);

  // Priorizar resultados con número de casa (más exactos)
  const todos = [...resNominatim, ...resPhoton];
  const conNumero   = todos.filter(r => r.numero);
  const sinNumero   = todos.filter(r => !r.numero);

  // Deduplicar por proximidad (< 50 metros = mismo lugar)
  const dedup = [];
  for (const r of [...conNumero, ...sinNumero]) {
    const esDuplicado = dedup.some(d => {
      const dLat = Math.abs(d.lat - r.lat);
      const dLon = Math.abs(d.lon - r.lon);
      return dLat < 0.0005 && dLon < 0.0005; // ~50m
    });
    if (!esDuplicado) dedup.push(r);
    if (dedup.length >= 6) break;
  }

  callback(dedup);
}

// ── MOSTRAR SUGERENCIAS ───────────────────────────────────────
function mostrarSugerencias(resultados, contenedorId) {
  const el = document.getElementById(contenedorId);
  if (!el) return;

  if (!resultados.length) {
    el.innerHTML = `
      <div class="map-suggestion no-results">
        <span class="sug-icon">🔍</span>
        <span class="sug-texto">Sin resultados — intenta: "Francisco Zarco 116"</span>
      </div>`;
    el.style.display = 'block';
    return;
  }

  el.innerHTML = resultados.map((r, i) => {
    // Etiqueta: "Calle Número, Colonia"  o  "Calle, Colonia" si no hay número
    const lineaUno = [r.calle, r.numero].filter(Boolean).join(' ') || r.ciudad;
    const lineaDos = [r.colonia, r.ciudad].filter(Boolean).join(', ');

    const iconoTipo = {
      house: '🏠', building: '🏢', amenity: '📍',
      shop:  '🛍️', road: '🛣️',   residential: '🏘️',
    }[r.tipo] || (r.numero ? '🏠' : '📍');

    return `<div class="map-suggestion" onclick="seleccionarSugerencia(${i}, '${contenedorId}')">
      <span class="sug-icon">${iconoTipo}</span>
      <div class="sug-lineas">
        <span class="sug-linea1">${escHtml(lineaUno)}</span>
        ${lineaDos ? `<span class="sug-linea2">${escHtml(lineaDos)}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  el._resultados = resultados;
  el.style.display = 'block';
}

// ── SELECCIONAR SUGERENCIA ────────────────────────────────────
function seleccionarSugerencia(idx, contenedorId) {
  const el = document.getElementById(contenedorId);
  if (!el || !el._resultados) return;

  const r      = el._resultados[idx];
  const coords = [r.lat, r.lon];

  // Nombre para mostrar en el input
  const nombre = [
    r.calle,
    r.numero,
    r.colonia ? `Col. ${r.colonia}` : '',
  ].filter(Boolean).join(' ') || r.ciudad;

  el.style.display = 'none';

  if (contenedorId === 'sugerencias-origen') {
    document.getElementById('inp-origen').value = nombre;
    _coordOrigen = coords;
    if (_markerOrigen) _map.removeLayer(_markerOrigen);
    _markerOrigen = L.marker(coords, { icon: iconoPunto('#22c55e', 16) })
      .addTo(_map)
      .bindPopup(`<b>Origen</b><br>${escHtml(nombre)}`)
      .openPopup();
    _map.setView(coords, 17);
  } else {
    document.getElementById('inp-destino').value = nombre;
    _coordDestino = coords;
    if (_markerDestino) _map.removeLayer(_markerDestino);
    _markerDestino = L.marker(coords, { icon: iconoPunto('#ef4444', 16) })
      .addTo(_map)
      .bindPopup(`<b>Destino</b><br>${escHtml(nombre)}`)
      .openPopup();
    _map.setView(coords, 17);
  }

  if (_coordOrigen && _coordDestino) calcularRuta();
}

// ── CALCULAR RUTA (OSRM) ──────────────────────────────────────
async function calcularRuta() {
  if (!_coordOrigen || !_coordDestino) {
    showToast('Pon origen y destino primero', 'amber');
    return;
  }

  const btn = document.getElementById('btn-calcular-ruta');
  if (btn) { btn.textContent = '⏳ Calculando...'; btn.disabled = true; }

  const url = `https://router.project-osrm.org/route/v1/driving/` +
    `${_coordOrigen[1]},${_coordOrigen[0]};${_coordDestino[1]},${_coordDestino[0]}` +
    `?overview=full&geometries=geojson`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes.length) {
      showToast('No se pudo trazar la ruta', 'red');
      if (btn) { btn.textContent = '🗺️ Calcular ruta'; btn.disabled = false; }
      return;
    }

    const ruta   = data.routes[0];
    const distKm = ruta.distance / 1000;
    const mins   = Math.round(ruta.duration / 60);

    // Ruta con borde oscuro debajo para contraste en el mapa oscuro
    if (_routeLayer) _map.removeLayer(_routeLayer);
    _routeLayer = L.layerGroup([
      L.geoJSON(ruta.geometry, { style: { color: '#1e1b4b', weight: 8,  opacity: 0.5 } }),
      L.geoJSON(ruta.geometry, { style: { color: '#818cf8', weight: 5,  opacity: 1   } }),
    ]).addTo(_map);

    _map.fitBounds(
      L.geoJSON(ruta.geometry).getBounds(),
      { padding: [40, 40] }
    );

    mostrarResultadoRuta(distKm, mins);

    if (btn) { btn.textContent = '🔄 Recalcular'; btn.disabled = false; }

  } catch (e) {
    showToast('Error de red al calcular ruta', 'red');
    if (btn) { btn.textContent = '🗺️ Calcular ruta'; btn.disabled = false; }
  }
}

// ── CARD RESULTADO ────────────────────────────────────────────
function mostrarResultadoRuta(distKm, minutos) {
  const tarifa = calcFare(distKm);
  const el     = document.getElementById('ruta-resultado');
  if (!el) return;

  el.style.display = 'block';
  el.innerHTML = `
    <div class="ruta-stats">
      <div class="ruta-stat">
        <span class="rstat-val">${distKm.toFixed(1)}</span>
        <span class="rstat-label">km</span>
      </div>
      <div class="ruta-stat-sep"></div>
      <div class="ruta-stat">
        <span class="rstat-val">${minutos}</span>
        <span class="rstat-label">min</span>
      </div>
      <div class="ruta-stat-sep"></div>
      <div class="ruta-stat green">
        <span class="rstat-val">$${tarifa}</span>
        <span class="rstat-label">tarifa</span>
      </div>
    </div>
    <button class="btn-usar-tarifa" onclick="usarTarifaDetectada(${distKm.toFixed(2)}, ${tarifa})">
      ✓ Usar esta tarifa
    </button>`;
}

// ── APLICAR AL FORMULARIO ─────────────────────────────────────
function usarTarifaDetectada(km, tarifa) {
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

  showTab('nuevo');
  showToast(`${parseFloat(km).toFixed(1)} km → $${tarifa} aplicado ✓`, 'green');
}

// ── LIMPIAR ───────────────────────────────────────────────────
function limpiarRuta() {
  if (_routeLayer)   { _map.removeLayer(_routeLayer);   _routeLayer   = null; }
  if (_markerOrigen) { _map.removeLayer(_markerOrigen); _markerOrigen  = null; }
  if (_markerDestino){ _map.removeLayer(_markerDestino);_markerDestino = null; }
  _coordOrigen  = null;
  _coordDestino = null;

  document.getElementById('inp-origen').value  = '';
  document.getElementById('inp-destino').value = '';
  ['sugerencias-origen','sugerencias-destino'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const res = document.getElementById('ruta-resultado');
  if (res) res.style.display = 'none';

  const btn = document.getElementById('btn-calcular-ruta');
  if (btn) { btn.textContent = '🗺️ Calcular ruta'; btn.disabled = false; }
}

// ── INPUT HANDLERS ────────────────────────────────────────────
function onOrigenInput() {
  const val = document.getElementById('inp-origen').value;
  clearTimeout(_searchTimeout);
  if (val.length < 3) {
    document.getElementById('sugerencias-origen').style.display = 'none';
    return;
  }
  _searchTimeout = setTimeout(() =>
    buscarDireccion(val, res => mostrarSugerencias(res, 'sugerencias-origen')),
  380);
}

function onDestinoInput() {
  const val = document.getElementById('inp-destino').value;
  clearTimeout(_searchTimeout);
  if (val.length < 3) {
    document.getElementById('sugerencias-destino').style.display = 'none';
    return;
  }
  _searchTimeout = setTimeout(() =>
    buscarDireccion(val, res => mostrarSugerencias(res, 'sugerencias-destino')),
  380);
}

function usarUbicacionComoOrigen() {
  if (_ubicacionActual) {
    _coordOrigen = _ubicacionActual;
    document.getElementById('inp-origen').value = 'Mi ubicación actual';
    document.getElementById('sugerencias-origen').style.display = 'none';
    if (_markerOrigen) _map.removeLayer(_markerOrigen);
    _markerOrigen = L.marker(_coordOrigen, { icon: iconoPunto('#22c55e', 16) })
      .addTo(_map).bindPopup('<b>Origen</b><br>Tu ubicación actual').openPopup();
    if (_coordDestino) calcularRuta();
    showToast('Origen: tu ubicación 📍', 'green');
  } else {
    showToast('Detectando GPS...', 'amber');
    detectarUbicacion(true);
  }
}

// Cerrar sugerencias al tocar fuera
document.addEventListener('click', e => {
  if (!e.target.closest('.map-search-wrap')) {
    document.querySelectorAll('.sugerencias-list').forEach(el => el.style.display = 'none');
  }
});

// ── BANNER GPS (primer uso) ───────────────────────────────────
// Android PWA requiere gesto del usuario para dar permiso de ubicación.
// Mostramos un banner claro en vez de pedir GPS silenciosamente.
function mostrarBannerGps() {
  // Si ya tenemos ubicación, no mostrar nada
  if (_ubicacionActual) return;

  // Revisar si el permiso ya fue dado antes
  if (navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      if (result.state === 'granted') {
        // Ya tiene permiso — pedir directo sin banner
        detectarUbicacion(false);
      } else if (result.state === 'denied') {
        // Permiso denegado — mostrar instrucciones
        mostrarAvisoPermisoDenegado();
      } else {
        // 'prompt' — mostrar banner para que el usuario lo dispare
        insertarBannerGps();
      }
    }).catch(() => {
      // Navegador viejo que no soporta permissions API
      insertarBannerGps();
    });
  } else {
    insertarBannerGps();
  }
}

function insertarBannerGps() {
  const panel = document.getElementById('panel-mapa');
  if (!panel || document.getElementById('banner-gps')) return;

  const banner = document.createElement('div');
  banner.id = 'banner-gps';
  banner.className = 'banner-gps';
  banner.innerHTML = `
    <span class="banner-gps-icon">📍</span>
    <span class="banner-gps-texto">Activa el GPS para detectar tu ubicación</span>
    <button class="banner-gps-btn" onclick="pedirGpsDesdeBoton()">Activar</button>`;

  // Insertar antes del primer hijo del panel
  panel.insertBefore(banner, panel.firstChild);
}

function pedirGpsDesdeBoton() {
  const banner = document.getElementById('banner-gps');
  if (banner) {
    banner.innerHTML = `
      <span class="banner-gps-icon">⏳</span>
      <span class="banner-gps-texto">Esperando permiso...</span>`;
  }
  detectarUbicacion(true);
}

function mostrarAvisoPermisoDenegado() {
  const panel = document.getElementById('panel-mapa');
  if (!panel || document.getElementById('banner-gps')) return;

  const banner = document.createElement('div');
  banner.id = 'banner-gps';
  banner.className = 'banner-gps banner-gps-error';
  banner.innerHTML = `
    <span class="banner-gps-icon">⚠️</span>
    <div class="banner-gps-texto">
      GPS bloqueado. Para activarlo:<br>
      <small>Configuración → Apps → Chrome → Permisos → Ubicación → Permitir</small>
    </div>`;
  panel.insertBefore(banner, panel.firstChild);
}

// Override de detectarUbicacion para quitar el banner al éxito
const _detectarOriginal = detectarUbicacion;
// Parchar para quitar banner cuando funciona
function detectarUbicacion(mostrarToast = true) {
  if (!navigator.geolocation) {
    if (mostrarToast) showToast('GPS no disponible en este dispositivo', 'amber');
    return;
  }

  const btn = document.getElementById('btn-gps');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  navigator.geolocation.getCurrentPosition(
    pos => {
      _ubicacionActual = [pos.coords.latitude, pos.coords.longitude];

      if (btn) { btn.textContent = '📍'; btn.disabled = false; }

      // Quitar banner si existe
      const banner = document.getElementById('banner-gps');
      if (banner) banner.remove();

      if (_map) {
        _map.setView(_ubicacionActual, 15);
        if (window._markerUbicacion) {
          window._markerUbicacion.setLatLng(_ubicacionActual);
        } else {
          window._markerUbicacion = L.marker(_ubicacionActual, {
            icon: iconoUbicacion(), zIndexOffset: 1000
          }).addTo(_map).bindPopup('<b>Tu ubicación</b>');
        }
      }

      // Auto-rellenar origen
      const inpOrigen = document.getElementById('inp-origen');
      if (inpOrigen && !inpOrigen.value) {
        inpOrigen.value = 'Mi ubicación actual';
        _coordOrigen = _ubicacionActual;
        if (_coordDestino) calcularRuta();
      }

      if (mostrarToast) showToast('📍 Ubicación detectada', 'green');
    },
    err => {
      if (btn) { btn.textContent = '📍'; btn.disabled = false; }

      const banner = document.getElementById('banner-gps');

      if (err.code === 1) {
        // PERMISSION_DENIED — mostrar instrucciones claras
        if (banner) {
          banner.className = 'banner-gps banner-gps-error';
          banner.innerHTML = `
            <span class="banner-gps-icon">⚠️</span>
            <div class="banner-gps-texto">
              GPS bloqueado. Ve a:<br>
              <small>Configuración del celular → Apps → Chrome (o tu navegador) → Permisos → Ubicación → Permitir</small>
            </div>`;
        }
        if (mostrarToast) showToast('GPS bloqueado — ve a Configuración → Apps', 'red');
      } else {
        if (mostrarToast) {
          const msgs = { 2: 'GPS no disponible', 3: 'GPS tardó demasiado — intenta de nuevo' };
          showToast(msgs[err.code] || 'Error de GPS', 'amber');
        }
      }
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}
