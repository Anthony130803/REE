# 🛵 DeliveryTrack v2

**App de control de ganancias para repartidores con Google Maps**

---

## ✨ Novedades en v2

- 🗺️ **Google Maps integrado** — busca origen y destino con autocompletado
- 📍 **Rutas calculadas** — ve la distancia y tiempo estimado de cada entrega
- 🗂️ **Pestaña de Mapa** — visualiza todas tus rutas del día en un mapa
- 📏 **Kilómetros recorridos** — estadística nueva de distancia total
- 📲 **PWA instalable** — funciona como app nativa en Android e iPhone
- ⚡ **Deploy automático** — GitHub Actions publica en GitHub Pages

---

## 🔑 Paso 1 — Obtener tu API Key de Google Maps

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un proyecto nuevo o usa uno existente
3. Ve a **APIs & Services → Library**
4. Activa estas 3 APIs:
   - **Maps JavaScript API**
   - **Places API**
   - **Directions API**
5. Ve a **APIs & Services → Credentials**
6. Click **+ Create Credentials → API Key**
7. Copia la clave generada

### Restringir la clave (recomendado)
- En la clave creada → **Application restrictions → HTTP referrers**
- Agrega: `https://TU-USUARIO.github.io/*`

---

## 🔧 Paso 2 — Configurar la API Key en el proyecto

Abre `index.html` y reemplaza **las 2 ocurrencias** de `TU_API_KEY`:

```html
<!-- Línea ~77 -->
window.MAPS_API_KEY = 'TU_API_KEY';  ← reemplaza aquí

<!-- Línea ~83 -->
src="https://maps.googleapis.com/maps/api/js?key=TU_API_KEY&..."  ← y aquí
```

---

## 🚀 Paso 3 — Publicar en GitHub Pages

### Opción A — GitHub Actions (automático) ✅ Recomendado

1. Sube el proyecto a GitHub:
   ```bash
   git init
   git add .
   git commit -m "DeliveryTrack v2 con Google Maps"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/delivery-tracker.git
   git push -u origin main
   ```

2. En GitHub → **Settings → Pages**:
   - Source: **GitHub Actions**

3. ¡Listo! Cada push a `main` despliega automáticamente.  
   Tu app estará en: `https://TU-USUARIO.github.io/delivery-tracker`

### Opción B — GitHub Pages manual

1. Settings → Pages → Source: **Deploy from a branch**
2. Branch: `main` / folder: `/ (root)`

---

## 📱 Instalar como app en el celular

**Android (Chrome):**
1. Abre la URL de GitHub Pages
2. Toca los 3 puntos → **"Agregar a pantalla de inicio"**
3. Se instala como app nativa con ícono verde 🟢

**iPhone (Safari):**
1. Abre la URL en Safari
2. Toca el botón Compartir → **"Añadir a pantalla de inicio"**

---

## 📁 Estructura del proyecto

```
delivery-tracker/
├── index.html              ← App principal
├── manifest.json           ← Configuración PWA
├── sw.js                   ← Service Worker (offline)
├── css/
│   └── style.css           ← Estilos
├── js/
│   ├── app.js              ← Lógica principal
│   └── maps.js             ← Integración Google Maps
├── icons/
│   ├── icon-192.png        ← Ícono app
│   └── icon-512.png        ← Ícono splash
└── .github/
    └── workflows/
        └── deploy.yml      ← GitHub Actions
```

---

## 🗺️ Cómo usar el mapa

| Acción | Resultado |
|--------|-----------|
| Escribir en "Origen" | Autocompletado de Google Places |
| Escribir en "Destino" | Autocompletado de Google Places |
| Seleccionar ambas | Mini mapa con ruta y distancia |
| Guardar envío | La ruta se guarda con el registro |
| Pestaña 🗺️ Mapa | Ver todas las rutas del día |
| Botón "Ver →" | Enfocar esa ruta en el mapa grande |
| Botón 📍 | Centrar en tu ubicación actual |
| Botón 🗺️ | Ver todas las rutas juntas |

---

## 💰 Google Maps — ¿Es de pago?

La API de Google Maps tiene un **nivel gratuito generoso**:
- **$200 USD de crédito gratis** por mes
- Para uso personal de un repartidor: prácticamente **$0 al mes**
- Se necesita tarjeta de crédito para registrarse pero no se cobra automáticamente

---

## 🛠 Tecnologías

- HTML5 + CSS3 + JavaScript vanilla
- Google Maps JavaScript API (Places + Directions)
- PWA (Progressive Web App) con Service Worker
- LocalStorage para persistencia
- GitHub Actions para deploy automático

---

## 📄 Licencia

MIT — libre para usar y modificar.
