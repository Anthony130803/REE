/* ============================================================
   Reparto Facil — Google Maps v2
   GPS automático, búsqueda con Geocoding, rutas con Directions API
   Clave API incluida
   ============================================================ */

'use strict';

let _map              = null;
let _directionsRenderer = null;
let _markerOrigen     = null;
let _markerDestino    = null;
let _coordOrigen      = null;
let _coordDestino     = null;
let _ubicacionActual  = null;
let _searchTimeout    = null;
let _mapaIniciado     = false;

// ── INICIALIZACIÓN (llamada por el callback de Google Maps) ──
function initMap() {
  if (_mapaIniciado) return;

  const container = document.getElementById('mapa-container');
  if (!container) return;

  // Estilo oscuro personalizado (similar a Stadia Dark)
  const estiloOscuro = [
    { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    {
      featureType: 'administrative.locality',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#d59563' }]
    },
    {
      featureType: 'poi',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#d59563' }]
    },
    {
      featureType: 'poi.park',
      elementType: 'geometry',
      stylers: [{ color: '#263c3f' }]
    },
    {
      featureType: 'poi.park',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#6b9a76' }]
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: '#38414e' }]
    },
    {
      featureType: 'road',
      elementType: 'geometry.stroke',
      stylers: [{ color: '#212a37' }]
    },
    {
      featureType: 'road',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#9ca5b3' }]
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry',
      stylers: [{ color: '#746855' }]
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry.stroke',
      stylers: [{ color: '#1f2835' }]
    },
    {
      featureType: 'road.highway',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#f3d19c' }]
    },
    {
      featureType: 'transit',
      elementType: 'geometry',
      stylers: [{ color: '#2f3948' }]
    },
    {
      featureType: 'transit.station',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#d59563' }]
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: '#17263c' }]
    },
    {
      featureType: 'water',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#515c6d' }]
    },
    {
      featureType: 'water',
      elementType: 'labels.text.stroke',
      stylers: [{ color: '#17263c' }]
    }
  ];

  _map = new google.maps.Map(container, {
    center: { lat: 22.1565, lng: -100.9855 },
    zoom: 13,
    styles: estiloOscuro,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  });

  _directionsRenderer = new google.maps.DirectionsRenderer({
    map: _map,
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: '#818cf8',
      strokeWeight: 5,
      strokeOpacity: 0.9
    }
  });

  _mapaIniciado = true;
  mostrarBannerGps();
}

// ── ICONOS PERSONALIZADOS ────────────────────────────────────
function crearIconoGoogle(color, size = 14) {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}" stroke="white" stroke-width="2"/>
    </svg>
  `;
  return {
    url: 'data:image/svg+xml,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size/2, size/2)
  };
}

function iconoUbicacionGoogle() {
  const svg = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#4285F4" stroke="white" stroke-width="2"/>
      <circle cx="12" cy="12" r="4" fill="white"/>
    </svg>
  `;
  return {
    url: 'data:image/svg+xml,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(24, 24),
    anchor: new google.maps.Point(12, 12)
  };
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
      _ubicacionActual = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      if (btn) { btn.textContent = '📍'; btn.disabled = false; }

      const banner = document.getElementById('banner-gps');
      if (banner) banner.remove();

      if (_map) {
        _map.setCenter(_ubicacionActual);
        _map.setZoom(15);

        if (window._markerUbicacion) {
          window._markerUbicacion.setPosition(_ubicacionActual);
        } else {
          window._markerUbicacion = new google.maps.Marker({
            position: _ubicacionActual,
            map: _map,
            icon: iconoUbicacionGoogle(),
            title: 'Tu ubicación',
            zIndex: 1000
          });
        }
      }

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
        if (banner) {
          banner.className = 'banner-gps banner-gps-error';
          banner.innerHTML = `
            <span class="banner-gps-icon">⚠️</span>
            <div class="banner-gps-texto">
              GPS bloqueado. Ve a:<br>
              <small>Configuración → Apps → Navegador → Permisos → Ubicación → Permitir</small>
            </div>`;
        }
        if (mostrarToast) showToast('GPS bloqueado — revisa permisos', 'red');
      } else {
        if (mostrarToast) {
          const msgs = { 2: 'GPS no disponible', 3: 'GPS tardó demasiado' };
          showToast(msgs[err.code] || 'Error de GPS', 'amber');
        }
      }
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}

// ── GEOCODING (buscar dirección) usando Geocoding API ────────
async function buscarDireccion(query, callback) {
  if (!query || query.length < 2) return callback([]);

  try {
    let queryFull = query;
    if (!/san luis|potosi|slp/i.test(query)) {
      queryFull = `${query}, San Luis Potosí, México`;
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(queryFull)}&language=es&key=AIzaSyAOVYRIgupAurZup5y1PRh8Ismb1A3lLao`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results.length) {
      return callback([]);
    }

    const resultados = data.results.map(res => {
      const components = res.address_components;
      let numero = '', calle = '', colonia = '', ciudad = 'San Luis Potosí';

      for (let comp of components) {
        if (comp.types.includes('street_number')) numero = comp.long_name;
        if (comp.types.includes('route')) calle = comp.long_name;
        if (comp.types.includes('sublocality_level_1') || comp.types.includes('neighborhood')) colonia = comp.long_name;
        if (comp.types.includes('locality')) ciudad = comp.long_name;
      }
      if (!calle && res.formatted_address) calle = res.formatted_address.split(',')[0];

      return {
        lat: res.geometry.location.lat(),
        lon: res.geometry.location.lng(),
        numero: numero,
        calle: calle,
        colonia: colonia,
        ciudad: ciudad,
        tipo: res.types[0] || 'place',
        fuente: 'google'
      };
    });

    callback(resultados.slice(0, 6));
  } catch (error) {
    console.error('Geocoding error:', error);
    callback([]);
  }
}

// ── MOSTRAR SUGERENCIAS (igual que antes) ─────────────────────
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
    const lineaUno = [r.calle, r.numero].filter(Boolean).join(' ') || r.ciudad;
    const lineaDos = [r.colonia, r.ciudad].filter(Boolean).join(', ');
    const iconoTipo = r.numero ? '🏠' : '📍';
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

function seleccionarSugerencia(idx, contenedorId) {
  const el = document.getElementById(contenedorId);
  if (!el || !el._resultados) return;

  const r = el._resultados[idx];
  const coords = { lat: r.lat, lng: r.lon };
  const nombre = [r.calle, r.numero, r.colonia ? `Col. ${r.colonia}` : '']
    .filter(Boolean).join(' ') || r.ciudad;

  el.style.display = 'none';

  if (contenedorId === 'sugerencias-origen') {
    document.getElementById('inp-origen').value = nombre;
    _coordOrigen = coords;
    if (_markerOrigen) _markerOrigen.setMap(null);
    _markerOrigen = new google.maps.Marker({
      position: coords,
      map: _map,
      icon: crearIconoGoogle('#22c55e', 16),
      title: 'Origen'
    });
    _map.setCenter(coords);
    _map.setZoom(17);
  } else {
    document.getElementById('inp-destino').value = nombre;
    _coordDestino = coords;
    if (_markerDestino) _markerDestino.setMap(null);
    _markerDestino = new google.maps.Marker({
      position: coords,
      map: _map,
      icon: crearIconoGoogle('#ef4444', 16),
      title: 'Destino'
    });
    _map.setCenter(coords);
    _map.setZoom(17);
  }

  if (_coordOrigen && _coordDestino) calcularRuta();
}

// ── CALCULAR RUTA (Directions API) ────────────────────────────
async function calcularRuta() {
  if (!_coordOrigen || !_coordDestino) {
    showToast('Pon origen y destino primero', 'amber');
    return;
  }

  const btn = document.getElementById('btn-calcular-ruta');
  if (btn) { btn.textContent = '⏳ Calculando...'; btn.disabled = true; }

  const directionsService = new google.maps.DirectionsService();

  const request = {
    origin: _coordOrigen,
    destination: _coordDestino,
    travelMode: google.maps.TravelMode.DRIVING,
    unitSystem: google.maps.UnitSystem.METRIC
  };

  directionsService.route(request, (result, status) => {
    if (status === 'OK') {
      _directionsRenderer.setDirections(result);

      const ruta = result.routes[0];
      const distKm = ruta.legs[0].distance.value / 1000;
      const minutos = Math.round(ruta.legs[0].duration.value / 60);

      mostrarResultadoRuta(distKm, minutos);

      const bounds = new google.maps.LatLngBounds();
      bounds.extend(_coordOrigen);
      bounds.extend(_coordDestino);
      _map.fitBounds(bounds);
    } else {
      showToast('No se pudo trazar la ruta: ' + status, 'red');
    }
    if (btn) { btn.textContent = '🗺️ Calcular ruta'; btn.disabled = false; }
  });
}

// ── CARD RESULTADO ────────────────────────────────────────────
function mostrarResultadoRuta(distKm, minutos) {
  const tarifa = calcFare(distKm);
  const el = document.getElementById('ruta-resultado');
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
  if (_directionsRenderer) _directionsRenderer.setDirections({ routes: [] });
  if (_markerOrigen) { _markerOrigen.setMap(null); _markerOrigen = null; }
  if (_markerDestino) { _markerDestino.setMap(null); _markerDestino = null; }
  _coordOrigen = null;
  _coordDestino = null;

  document.getElementById('inp-origen').value = '';
  document.getElementById('inp-destino').value = '';
  ['sugerencias-origen', 'sugerencias-destino'].forEach(id => {
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
    if (_markerOrigen) _markerOrigen.setMap(null);
    _markerOrigen = new google.maps.Marker({
      position: _coordOrigen,
      map: _map,
      icon: crearIconoGoogle('#22c55e', 16),
      title: 'Origen (tu ubicación)'
    });
    if (_coordDestino) calcularRuta();
    showToast('Origen: tu ubicación 📍', 'green');
  } else {
    showToast('Detectando GPS...', 'amber');
    detectarUbicacion(true);
  }
}

// ── BANNER GPS (primer uso) ───────────────────────────────────
function mostrarBannerGps() {
  if (_ubicacionActual) return;

  if (navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      if (result.state === 'granted') {
        detectarUbicacion(false);
      } else if (result.state === 'denied') {
        mostrarAvisoPermisoDenegado();
      } else {
        insertarBannerGps();
      }
    }).catch(() => insertarBannerGps());
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
      <small>Configuración → Apps → Navegador → Permisos → Ubicación → Permitir</small>
    </div>`;
  panel.insertBefore(banner, panel.firstChild);
}

// Cerrar sugerencias al tocar fuera
document.addEventListener('click', e => {
  if (!e.target.closest('.map-search-wrap')) {
    document.querySelectorAll('.sugerencias-list').forEach(el => el.style.display = 'none');
  }
});
