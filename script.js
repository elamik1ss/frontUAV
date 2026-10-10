const countryGeoJsonUrl = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

const state = {
  selectedSide: 'ukraine',
  drones: [],
  activeDrone: null,
  toastTimer: null,
  launched: false,
  speed: 1,
  countryLayers: {
    ukraine: null,
    russia: null
  },
  keys: {
    w: false,
    a: false,
    s: false,
    d: false
  }
};

const map = L.map('map', {
  zoomControl: true,
  attributionControl: true,
  minZoom: 2,
  maxZoom: 12,
  dragging: true
}).setView([57, 40], 3);

// Тёмная карта
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; CartoDB',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

const statusBox = document.getElementById('statusBox');
const sideButtons = [...document.querySelectorAll('.side-button')];
const droneCard = document.getElementById('droneCard');
const launchBtn = document.getElementById('launchBtn');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'utility-toast visible';
  toast.textContent = message;
  document.body.appendChild(toast);

  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 250);
  }, 1800);
}

function updateStatus(text) {
  statusBox.textContent = text;
}

function createDroneSvgIcon() {
  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 100 120" style="filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));">
      <defs>
        <linearGradient id="droneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#00d9ff;stop-opacity:0.9" />
          <stop offset="100%" style="stop-color:#0088cc;stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <!-- Основной корпус -->
      <path d="M 50 15 Q 62 22 70 38 L 72 65 Q 62 75 50 80 Q 38 75 28 65 L 30 38 Q 38 22 50 15" fill="url(#droneGrad)" stroke="#00ffff" stroke-width="0.8" opacity="0.95"/>
      
      <!-- Боковые антенны/крылья -->
      <path d="M 20 50 L 10 48 Q 8 50 10 52 L 20 50" fill="#00d9ff" opacity="0.7"/>
      <path d="M 80 50 L 90 48 Q 92 50 90 52 L 80 50" fill="#00d9ff" opacity="0.7"/>
      
      <!-- Датчики/окна -->
      <rect x="44" y="32" width="12" height="10" rx="2" fill="#00ffff" opacity="0.8" stroke="#00aaff" stroke-width="0.5"/>
      <circle cx="50" cy="40" r="2" fill="#ff6b5b" opacity="0.9"/>
      
      <!-- Нос/сенсор -->
      <circle cx="50" cy="18" r="6" fill="#0088cc" stroke="#00ffff" stroke-width="1" opacity="0.9"/>
      <path d="M 48 18 Q 50 20 52 18" stroke="#00ffff" stroke-width="1" fill="none" opacity="0.6"/>
      
      <!-- Стабилизатор -->
      <path d="M 48 78 L 52 78 L 54 105 L 46 105 Z" fill="#0a0d10" stroke="#00d9ff" stroke-width="0.8" opacity="0.8"/>
      
      <!-- Светлячки/огни -->
      <circle cx="35" cy="45" r="3" fill="#00d9ff" opacity="0.6"/>
      <circle cx="65" cy="45" r="3" fill="#00d9ff" opacity="0.6"/>
    </svg>
  `;

  return L.divIcon({
    html: svgMarkup,
    className: 'drone-marker-container',
    iconSize: [64, 64],
    iconAnchor: [32, 32],
    popupAnchor: [0, -32]
  });
}

const droneIcon = createDroneSvgIcon();
const routePointIcon = L.divIcon({
  className: 'route-marker',
  iconSize: [10, 10],
  iconAnchor: [5, 5]
});
const impactIcon = L.divIcon({
  className: 'impact-marker',
  html: '<span style="display:block; width:16px; height:16px; background:#ff5d5d; border:2.5px solid rgba(255,255,255,0.9); border-radius:50%; box-shadow:0 0 0 4px rgba(255,93,93,0.2), 0 0 12px rgba(255,93,93,0.5);\"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

function setSide(side) {
  state.selectedSide = side;
  sideButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.side === side);
  });

  resetAllDrones();

  if (side === 'ukraine') {
    updateStatus('Украина выбрана. Нажмите на карту для запуска дрона.');
  } else {
    updateStatus('Россия выбрана. Нажмите на карту для запуска дрона.');
  }
}

function resetAllDrones() {
  state.activeDrone = null;
  state.launched = false;
  launchBtn.textContent = 'Запуск';
  launchBtn.classList.remove('launched');

  state.drones.forEach((drone) => {
    map.removeLayer(drone.marker);
    map.removeLayer(drone.routeLine);
    if (drone.impactMarker) map.removeLayer(drone.impactMarker);
    drone.routeMarkers.forEach((m) => map.removeLayer(m));
  });

  state.drones = [];
}

function isPointInsideCountry(lat, lng, countryCode) {
  const geo = countryCode === 'ukraine' ? state.countryLayers.ukraine : state.countryLayers.russia;
  if (!geo) return false;

  const polygons = getPolygonsFromGeoJson(geo.toGeoJSON());
  for (const polygon of polygons) {
    if (pointInPolygon([lng, lat], polygon)) return true;
  }
  return false;
}

function getPolygonsFromGeoJson(geojson) {
  const polygons = [];
  const features = Array.isArray(geojson.features) ? geojson.features : [geojson];

  features.forEach((feature) => {
    const geometry = feature.geometry || feature;
    if (!geometry) return;

    if (geometry.type === 'Polygon') {
      polygons.push(geometry.coordinates);
    }

    if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygon) => polygons.push(polygon));
    }
  });

  return polygons;
}

function pointInPolygon(point, polygonCoords) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const xi = polygonCoords[i][0];
    const yi = polygonCoords[i][1];
    const xj = polygonCoords[j][0];
    const yj = polygonCoords[j][1];

    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

function createDrone(latlng) {
  const marker = L.marker(latlng, { icon: droneIcon }).addTo(map);
  const routeLine = L.polyline([latlng], {
    color: '#ffd166',
    weight: 3,
    opacity: 0.85,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  const drone = {
    marker,
    routeLine,
    routePoints: [latlng],
    routeMarkers: [],
    impactMarker: null,
    currentSpeed: 0,
    maxSpeed: state.speed
  };

  state.activeDrone = drone;
  state.drones.push(drone);
  marker.bindPopup(`Geran-2<br>${state.selectedSide === 'ukraine' ? '🇺🇦 Украина' : '🇷🇺 Россия'}`);
  marker.openPopup();
  updateStatus('Дрон размещён. ЛКМ — маршрут, ПКМ — точка падения.');
}

function addRoutePoint(latlng) {
  if (!state.activeDrone) return;
  const drone = state.activeDrone;

  drone.routePoints.push(latlng);
  drone.routeLine.setLatLngs(drone.routePoints);

  const routeMarker = L.marker(latlng, { icon: routePointIcon }).addTo(map);
  routeMarker.bindTooltip('Путь');
  drone.routeMarkers.push(routeMarker);
}

function setImpactPoint(latlng) {
  if (!state.activeDrone) {
    showToast('Сначала разместите дрон.');
    return;
  }

  if (state.activeDrone.impactMarker) {
    map.removeLayer(state.activeDrone.impactMarker);
  }

  const impactMarker = L.marker(latlng, { icon: impactIcon }).addTo(map);
  impactMarker.bindPopup('💥 Точка падения');
  state.activeDrone.impactMarker = impactMarker;
  updateStatus('Точка падения установлена.');
}

function launchMission() {
  if (state.drones.length === 0) {
    showToast('Нет дронов для запуска.');
    return;
  }

  state.launched = !state.launched;
  launchBtn.textContent = state.launched ? '⏹ Остановить' : 'Запуск';
  launchBtn.classList.toggle('launched', state.launched);

  if (state.launched) {
    state.drones.forEach((drone) => {
      drone.currentSpeed = 0;
      drone.maxSpeed = state.speed;
    });
    updateStatus('🚀 Дроны запущены! Ускорение...');
    showToast('Дроны в воздухе!');
    animateDrones();
  } else {
    updateStatus('Полёт остановлен.');
    showToast('Остановлено.');
  }
}

function animateDrones() {
  if (!state.launched) return;

  state.drones.forEach((drone) => {
    if (drone.currentSpeed < drone.maxSpeed) {
      drone.currentSpeed += drone.maxSpeed * 0.02;
    }
  });

  requestAnimationFrame(animateDrones);
}

function loadCountryBorders() {
  fetch(countryGeoJsonUrl)
    .then((res) => res.json())
    .then((data) => {
      const features = data.features || [];

      features.forEach((feature) => {
        const iso = String(feature.properties?.ISO_A3 || feature.properties?.A3 || '').toUpperCase();
        if (iso === 'UKR') {
          state.countryLayers.ukraine = L.geoJSON(feature, {
            style: {
              color: '#3ad67a',
              weight: 2.5,
              opacity: 0.85,
              fillColor: '#3ad67a',
              fillOpacity: 0.08,
              dashArray: '4, 3'
            }
          }).addTo(map);
        }

        if (iso === 'RUS') {
          state.countryLayers.russia = L.geoJSON(feature, {
            style: {
              color: '#62a6ff',
              weight: 2.5,
              opacity: 0.85,
              fillColor: '#62a6ff',
              fillOpacity: 0.08,
              dashArray: '4, 3'
            }
          }).addTo(map);
        }
      });

      setSide('ukraine');
    })
    .catch(() => {
      updateStatus('⚠️ Не удалось загрузить границы. Проверьте интернет.');
    });
}

sideButtons.forEach((button) => {
  button.addEventListener('click', () => setSide(button.dataset.side));
});

droneCard.addEventListener('click', () => {
  showToast('✓ Geran-2 готов к запуску.');
});

launchBtn.addEventListener('click', launchMission);

speedSlider.addEventListener('input', (e) => {
  state.speed = parseFloat(e.target.value);
  speedValue.textContent = state.speed.toFixed(1);
  if (state.activeDrone) {
    state.activeDrone.maxSpeed = state.speed;
  }
});

map.on('click', (event) => {
  const { lat, lng } = event.latlng;

  if (!state.activeDrone) {
    const countryCode = state.selectedSide === 'ukraine' ? 'ukraine' : 'russia';
    if (!isPointInsideCountry(lat, lng, countryCode)) {
      showToast(`❌ Вне территории ${state.selectedSide === 'ukraine' ? 'Украины' : 'России'}.`);
      return;
    }

    createDrone([lat, lng]);
    return;
  }

  const countryCode = state.selectedSide === 'ukraine' ? 'ukraine' : 'russia';
  if (!isPointInsideCountry(lat, lng, countryCode)) {
    showToast('❌ Маршрут вне границ.');
    return;
  }

  addRoutePoint([lat, lng]);
});

map.on('contextmenu', (event) => {
  L.DomEvent.preventDefault(event);
  const { lat, lng } = event.latlng;
  const countryCode = state.selectedSide === 'ukraine' ? 'ukraine' : 'russia';

  if (!isPointInsideCountry(lat, lng, countryCode)) {
    showToast('❌ Падение вне границ.');
    return;
  }

  setImpactPoint([lat, lng]);
});

// WASD управление картой
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  if (key === 'w') { state.keys.w = true; event.preventDefault(); }
  if (key === 'a') { state.keys.a = true; event.preventDefault(); }
  if (key === 's') { state.keys.s = true; event.preventDefault(); }
  if (key === 'd') { state.keys.d = true; event.preventDefault(); }

  if (event.key === 'Escape' && state.activeDrone) {
    map.removeLayer(state.activeDrone.marker);
    map.removeLayer(state.activeDrone.routeLine);
    if (state.activeDrone.impactMarker) map.removeLayer(state.activeDrone.impactMarker);
    state.activeDrone.routeMarkers.forEach((marker) => map.removeLayer(marker));
    state.activeDrone = null;
    updateStatus('Дрон удалён.');
  }
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'w') state.keys.w = false;
  if (key === 'a') state.keys.a = false;
  if (key === 's') state.keys.s = false;
  if (key === 'd') state.keys.d = false;
});

// Постоянный цикл для WASD
setInterval(() => {
  const panDistance = 0.15;
  
  if (state.keys.w) map.panBy([0, 40]);
  if (state.keys.s) map.panBy([0, -40]);
  if (state.keys.a) map.panBy([40, 0]);
  if (state.keys.d) map.panBy([-40, 0]);
}, 30);

loadCountryBorders();
