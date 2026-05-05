/* ============================================
   DeliveryTrack v2 — Google Maps Integration
   maps.js — se carga DESPUÉS del script de Google Maps
   ============================================ */

'use strict';

// ── VARIABLES GLOBALES DE MAPA ───────────────────
let mapsReady    = false;
let miniMap      = null;
let mainMap      = null;
let directionsService = null;
let miniRenderer = null;
let mainRenderer = null;
let autoOrigen   = null;
let autoDestino  = null;
let userMarker   = null;

// Colores de ruta por índice
const ROUTE_COLORS = ['#06C167','#FFB800','#4DABF7','#B084FF','#FF6B6B','#51CF66'];

// Dark mode para Google Maps
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2d2d2d' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1e2a1e' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4e7a4e' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
];

// ── CALLBACK DE GOOGLE MAPS ───────────────────────
function initMaps() {
  mapsReady = true;
  directionsService = new google.maps.DirectionsService();

  initMiniMap();
  initMainMap();
  initAutocomplete();
  renderRoutes(); // re-renderizar con datos guardados
}

// ── MINI MAPA (en formulario) ────────────────────
function initMiniMap() {
  const el = document.getElementById('mini-map');
  if (!el) return;

  miniMap = new google.maps.Map(el, {
    center: { lat: 22.15, lng: -100.97 }, // San Luis Potosí por defecto
    zoom: 13,
    styles: DARK_STYLE,
    disableDefaultUI: true,
    gestureHandling: 'cooperative',
  });

  miniRenderer = new google.maps.DirectionsRenderer({
    map: miniMap,
    suppressMarkers: false,
    polylineOptions: { strokeColor: '#06C167', strokeWeight: 4 },
  });
}

// ── MAPA PRINCIPAL ───────────────────────────────
function initMainMap() {
  const el = document.getElementById('main-map');
  if (!el) return;

  mainMap = new google.maps.Map(el, {
    center: { lat: 22.15, lng: -100.97 },
    zoom: 13,
    styles: DARK_STYLE,
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  });

  mainRenderer = new google.maps.DirectionsRenderer({
    map: mainMap,
    suppressMarkers: false,
    polylineOptions: { strokeColor: '#06C167', strokeWeight: 5 },
  });

  // Intentar ubicación del usuario
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      mainMap.setCenter(loc);
      userMarker = new google.maps.Marker({
        position: loc,
        map: mainMap,
        title: 'Tu ubicación',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#4DABF7',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
      });
    }, () => {});
  }
}

// ── AUTOCOMPLETADO DE DIRECCIONES ────────────────
function initAutocomplete() {
  const origenEl  = document.getElementById('inp-origen');
  const destinoEl = document.getElementById('inp-destino');
  if (!origenEl || !destinoEl) return;

  const options = {
    componentRestrictions: { country: 'mx' },
    fields: ['formatted_address', 'geometry', 'name'],
  };

  autoOrigen  = new google.maps.places.Autocomplete(origenEl,  options);
  autoDestino = new google.maps.places.Autocomplete(destinoEl, options);

  autoOrigen.addListener('place_changed',  onPlaceChanged);
  autoDestino.addListener('place_changed', onPlaceChanged);
}

// Cuando el usuario selecciona una dirección
function onPlaceChanged() {
  const origenEl  = document.getElementById('inp-origen');
  const destinoEl = document.getElementById('inp-destino');
  if (!autoOrigen || !autoDestino) return;

  const origen  = autoOrigen.getPlace();
  const destino = autoDestino.getPlace();

  if (
    origen  && origen.geometry  &&
    destino && destino.geometry
  ) {
    calcRoute(origen, destino);
  }
}

// ── TARIFA POR DISTANCIA ──────────────────────────
// 0–5 km  → $50 fijos
// Cada km extra (fracción incluida) → +$10
function calcFare(distanceMeters) {
  const km = distanceMeters / 1000;
  if (km <= 5) return 50;
  const extra = km - 5;                  // km por encima de 5
  return 50 + Math.ceil(extra) * 10;     // redondea hacia arriba
}

// ── CALCULAR RUTA ─────────────────────────────────
function calcRoute(origen, destino) {
  if (!directionsService) return;

  directionsService.route({
    origin: origen.geometry.location,
    destination: destino.geometry.location,
    travelMode: google.maps.TravelMode.DRIVING,
  }, (result, status) => {
    if (status !== 'OK') {
      showToast('No se pudo calcular la ruta', '#FF3B30');
      return;
    }

    const leg  = result.routes[0].legs[0];
    const fare = calcFare(leg.distance.value);
    const km   = (leg.distance.value / 1000).toFixed(1);

    // Mostrar en mini mapa
    miniRenderer.setDirections(result);
    document.getElementById('mini-map-container').style.display = 'block';
    document.getElementById('route-info').innerHTML = `
      <span>📏 ${leg.distance.text}</span>
      <span>⏱️ ${leg.duration.text}</span>
      <span style="color:#06C167;font-weight:700;">💵 Tarifa sugerida: $${fare}</span>
    `;

    // Rellenar automáticamente el campo de tarifa
    const envioInput = document.getElementById(
      document.getElementById('tab-digital').classList.contains('active-green')
        ? 'inp-envio2' : 'inp-envio'
    );
    if (envioInput) {
      envioInput.value = fare;
      updatePreview();   // actualizar preview en tiempo real
    }

    // Guardar en pendiente para cuando se agrega el envío
    window._pendingRoute = {
      origenAddr:    origen.formatted_address  || origen.name || '',
      destinoAddr:   destino.formatted_address || destino.name || '',
      distanceText:  leg.distance.text,
      distanceValue: leg.distance.value,
      durationText:  leg.duration.text,
      durationValue: leg.duration.value,
      suggestedFare: fare,
      origenLat:     origen.geometry.location.lat(),
      origenLng:     origen.geometry.location.lng(),
      destinoLat:    destino.geometry.location.lat(),
      destinoLng:    destino.geometry.location.lng(),
      directionsResult: JSON.stringify(result),
    };

    showToast(`Tarifa sugerida: $${fare} (${km} km) ✓`, '#06C167');
  });
}

// ── LIMPIAR PREVIEW DE RUTA ───────────────────────
function clearRoutePreview() {
  const mc = document.getElementById('mini-map-container');
  if (mc) mc.style.display = 'none';
  window._pendingRoute = null;
  if (miniRenderer) miniRenderer.set('directions', null);
}

// ── VER RUTA EN MAPA PRINCIPAL ────────────────────
function focusRoute(index) {
  const routeOrders = orders.filter(o => o.route);
  const order = routeOrders[index];
  if (!order || !order.route) return;

  showTab('mapa');

  setTimeout(() => {
    if (!mainMap || !directionsService) return;

    directionsService.route({
      origin: { lat: order.route.origenLat, lng: order.route.origenLng },
      destination: { lat: order.route.destinoLat, lng: order.route.destinoLng },
      travelMode: google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK') {
        const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
        mainRenderer.setOptions({
          polylineOptions: { strokeColor: color, strokeWeight: 5 },
        });
        mainRenderer.setDirections(result);
      }
    });
  }, 200);
}

// ── VER TODAS LAS RUTAS ───────────────────────────
function showAllRoutes() {
  if (!mainMap) return;
  const routeOrders = orders.filter(o => o.route);
  if (!routeOrders.length) {
    showToast('No hay rutas guardadas', '#FF9500');
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  routeOrders.forEach(o => {
    bounds.extend({ lat: o.route.origenLat, lng: o.route.origenLng });
    bounds.extend({ lat: o.route.destinoLat, lng: o.route.destinoLng });
  });
  mainMap.fitBounds(bounds);
  mainRenderer.set('directions', null);
}

// ── MI UBICACIÓN ──────────────────────────────────
function centerOnMe() {
  if (!mainMap) return;
  if (!navigator.geolocation) {
    showToast('GPS no disponible', '#FF9500');
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    mainMap.setCenter(loc);
    mainMap.setZoom(15);
    if (userMarker) userMarker.setPosition(loc);
  }, () => showToast('No se pudo obtener ubicación', '#FF9500'));
}

// ── REFRESCAR MAPA PRINCIPAL ──────────────────────
function refreshMainMap() {
  if (!mainMap) return;
  google.maps.event.trigger(mainMap, 'resize');
}

// Si Google Maps no carga (sin API key), mostrar mensaje útil
window.gm_authFailure = function() {
  document.getElementById('mini-map').innerHTML =
    '<div style="color:#FF3B30;padding:20px;font-size:13px;text-align:center">' +
    '⚠️ Configura tu API Key de Google Maps en index.html</div>';
  document.getElementById('main-map').innerHTML =
    '<div style="color:#FF3B30;padding:40px;font-size:13px;text-align:center">' +
    '⚠️ Configura tu API Key de Google Maps en index.html<br><br>' +
    'Ve a <b>console.cloud.google.com</b>, crea una clave y reemplaza <b>TU_API_KEY</b></div>';
};
