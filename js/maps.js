/* ============================================
   DeliveryTrack v2 — Google Maps (estilo Didi)
   - Tu ubicación como origen automático
   - Buscar destino con autocompletado
   - Mapa integrado con navegación dentro de la app
   - Cálculo de km y tarifa automático
   ============================================ */

'use strict';

let mapsReady         = false;
let directionsService = null;
let directionsRenderer= null;
let map               = null;
let autoDestino       = null;
let userLat           = null;
let userLng           = null;
let userMarker        = null;
let destMarker        = null;
let watchId           = null;

const DARK_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#9e9e9e' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#212121' }] },
  { featureType: 'road', elementType: 'geometry.fill',    stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road.arterial',       stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway',        stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'poi',                 stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2d2d2d' }] },
];

// ── CALLBACK GOOGLE MAPS ─────────────────────────
function initMaps() {
  mapsReady = true;
  directionsService  = new google.maps.DirectionsService();

  initMap();
  initAutocomplete();
  startGPS();
}

// ── INICIALIZAR MAPA ÚNICO ────────────────────────
function initMap() {
  const el = document.getElementById('main-map');
  if (!el) return;

  map = new google.maps.Map(el, {
    center: { lat: 22.15, lng: -100.97 },
    zoom: 15,
    styles: DARK_STYLE,
    disableDefaultUI: true,
    gestureHandling: 'greedy',
  });

  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: true, // usamos markers propios
    polylineOptions: {
      strokeColor: '#06C167',
      strokeWeight: 5,
      strokeOpacity: 0.9,
    },
  });
}

// ── GPS — UBICACIÓN EN TIEMPO REAL ───────────────
function startGPS() {
  if (!navigator.geolocation) {
    showToast('GPS no disponible', '#FF9500');
    return;
  }

  // Primera lectura rápida
  navigator.geolocation.getCurrentPosition(onGPSUpdate, onGPSError, {
    enableHighAccuracy: true,
    timeout: 10000,
  });

  // Seguimiento continuo (como Didi)
  watchId = navigator.geolocation.watchPosition(onGPSUpdate, onGPSError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
  });
}

function onGPSUpdate(pos) {
  userLat = pos.coords.latitude;
  userLng = pos.coords.longitude;

  const loc = { lat: userLat, lng: userLng };

  // Crear o mover marker de usuario (punto azul tipo Didi)
  if (!userMarker) {
    userMarker = new google.maps.Marker({
      position: loc,
      map,
      zIndex: 10,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#4DABF7',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3,
      },
      title: 'Tu ubicación',
    });

    // Centrar mapa en tu posición la primera vez
    map.setCenter(loc);
    map.setZoom(15);
  } else {
    userMarker.setPosition(loc);
  }

  // Si ya hay destino calculado, recalcular ruta con nueva posición
  if (window._pendingRoute) {
    calcRouteFromUser();
  }
}

function onGPSError(err) {
  console.warn('GPS error:', err.message);
}

// ── AUTOCOMPLETADO SOLO DESTINO ──────────────────
function initAutocomplete() {
  const destinoEl = document.getElementById('inp-destino');
  if (!destinoEl) return;

  autoDestino = new google.maps.places.Autocomplete(destinoEl, {
    componentRestrictions: { country: 'mx' },
    fields: ['formatted_address', 'geometry', 'name'],
  });

  autoDestino.addListener('place_changed', () => {
    const place = autoDestino.getPlace();
    if (!place || !place.geometry) return;

    // Guardar destino
    window._destinoPlace = place;

    // Poner marker en destino
    if (destMarker) destMarker.setMap(null);
    destMarker = new google.maps.Marker({
      position: place.geometry.location,
      map,
      zIndex: 9,
      icon: {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: '#FF6B6B',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
      title: place.formatted_address || place.name,
    });

    // Calcular ruta desde tu ubicación actual
    calcRouteFromUser();
  });
}

// ── CALCULAR RUTA DESDE UBICACIÓN ACTUAL ─────────
function calcRouteFromUser() {
  if (!directionsService || !window._destinoPlace) return;

  // Si aún no tenemos GPS, esperar
  if (userLat === null) {
    showToast('Obteniendo tu ubicación…', '#4DABF7');
    // Reintentar en 2 segundos
    setTimeout(calcRouteFromUser, 2000);
    return;
  }

  const origen  = { lat: userLat, lng: userLng };
  const destino = window._destinoPlace.geometry.location;

  directionsService.route({
    origin: origen,
    destination: destino,
    travelMode: google.maps.TravelMode.DRIVING,
  }, (result, status) => {
    if (status !== 'OK') {
      showToast('No se pudo calcular la ruta', '#FF3B30');
      return;
    }

    const leg  = result.routes[0].legs[0];
    const fare = calcFare(leg.distance.value);
    const km   = (leg.distance.value / 1000).toFixed(1);

    // Mostrar ruta en el mapa
    directionsRenderer.setDirections(result);

    // Ajustar zoom para ver toda la ruta
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(origen);
    bounds.extend(destino);
    map.fitBounds(bounds, { top: 60, bottom: 120, left: 20, right: 20 });

    // Mostrar info de ruta
    document.getElementById('route-info-bar').style.display = 'flex';
    document.getElementById('ri-dist').textContent  = leg.distance.text;
    document.getElementById('ri-time').textContent  = leg.duration.text;
    document.getElementById('ri-fare').textContent  = '$' + fare;

    // Rellenar tarifa automáticamente
    const envioInput = document.getElementById(
      document.getElementById('tab-digital').classList.contains('active-green')
        ? 'inp-envio2' : 'inp-envio'
    );
    if (envioInput) {
      envioInput.value = fare;
      updatePreview();
    }

    // Guardar datos de ruta
    window._pendingRoute = {
      origenAddr:    'Tu ubicación',
      destinoAddr:   window._destinoPlace.formatted_address || window._destinoPlace.name || '',
      distanceText:  leg.distance.text,
      distanceValue: leg.distance.value,
      durationText:  leg.duration.text,
      durationValue: leg.duration.value,
      suggestedFare: fare,
      origenLat:     userLat,
      origenLng:     userLng,
      destinoLat:    destino.lat(),
      destinoLng:    destino.lng(),
    };

    showToast(`${km} km — Tarifa: $${fare}`, '#06C167');
  });
}

// ── TARIFA POR DISTANCIA ──────────────────────────
// 0-5 km = $50, cada km extra = +$10
function calcFare(distanceMeters) {
  const km = distanceMeters / 1000;
  if (km <= 5) return 50;
  return 50 + Math.ceil(km - 5) * 10;
}

// ── NAVEGAR (abre Google Maps integrado) ──────────
function startNavigation() {
  if (!window._pendingRoute) {
    showToast('Primero busca un destino', '#FF9500');
    return;
  }

  const { destinoLat, destinoLng, destinoAddr } = window._pendingRoute;

  // Abre Google Maps dentro de la WebView (Capacitor lo intercepta)
  // En web normal abre en nueva pestaña
  const url = `https://www.google.com/maps/dir/?api=1` +
    `&origin=${userLat},${userLng}` +
    `&destination=${destinoLat},${destinoLng}` +
    `&travelmode=driving`;

  window.open(url, '_blank');
}

// ── CENTRAR EN MI UBICACIÓN ───────────────────────
function centerOnMe() {
  if (!map || userLat === null) {
    showToast('Obteniendo ubicación…', '#4DABF7');
    return;
  }
  map.setCenter({ lat: userLat, lng: userLng });
  map.setZoom(16);
}

// ── LIMPIAR RUTA ──────────────────────────────────
function clearRoutePreview() {
  if (directionsRenderer) directionsRenderer.set('directions', null);
  if (destMarker) { destMarker.setMap(null); destMarker = null; }
  window._pendingRoute  = null;
  window._destinoPlace  = null;
  document.getElementById('route-info-bar').style.display = 'none';
  const inp = document.getElementById('inp-destino');
  if (inp) inp.value = '';
}

// ── REFRESCAR MAPA ────────────────────────────────
function refreshMainMap() {
  if (!map) return;
  google.maps.event.trigger(map, 'resize');
  if (userLat !== null) map.setCenter({ lat: userLat, lng: userLng });
}

// ── RENDERIZAR RUTAS (historial) ──────────────────
function renderRoutes() {
  const el    = document.getElementById('routes-list');
  const badge = document.getElementById('map-badge');
  if (!el) return;

  const routeOrders = orders.filter(o => o.route);
  if (badge) badge.textContent = routeOrders.length + ' ruta' + (routeOrders.length !== 1 ? 's' : '');

  const totalKm = routeOrders.reduce((s, o) => s + (o.route.distanceValue || 0), 0);
  const kmStat  = document.getElementById('km-stat');
  if (kmStat) {
    kmStat.style.display = routeOrders.length ? 'block' : 'none';
    setText('s-km', (totalKm / 1000).toFixed(1) + ' km');
  }

  if (!routeOrders.length) {
    el.innerHTML = `<div class="empty"><span class="empty-icon">🗺️</span><p>Agrega rutas al registrar envíos.</p></div>`;
    return;
  }

  el.innerHTML = routeOrders.map((o, i) => `
    <div class="route-card">
      <div class="route-icon">${o.mode === 'digital' ? '💳' : '💵'}</div>
      <div class="route-details">
        <div class="route-name">${escapeHtml(o.nombre)}</div>
        <div class="route-addr">🏠 ${escapeHtml(o.route.destinoAddr || '')}</div>
        <div class="route-meta">
          ${o.route.distanceText ? `<span>📏 ${o.route.distanceText}</span>` : ''}
          ${o.route.durationText ? `<span>⏱️ ${o.route.durationText}</span>` : ''}
          <span style="color:#06C167">${fmt(o.envio)}</span>
        </div>
      </div>
    </div>`).join('');
}

// Error de API Key
window.gm_authFailure = function() {
  const msg = '<div style="color:#FF3B30;padding:30px;font-size:13px;text-align:center">⚠️ Configura tu API Key de Google Maps en index.html</div>';
  const m = document.getElementById('main-map');
  if (m) m.innerHTML = msg;
};
