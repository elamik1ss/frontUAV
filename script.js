const countryGeoJsonUrl = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

const state = {
  selectedSide: 'ukraine',
  drones: [],
  activeDrone: null,
  toastTimer: null,
  launched: false,
  countryLayers: {
    ukraine: null,
    russia: null
  }
};

const map = L.map('map', {
  zoomControl: true,
  attributionControl: true,
  minZoom: 2,
  maxZoom: 12
}).setView([57, 40], 3);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const statusBox = document.getElementById('statusBox');
const sideButtons = [...document.querySelectorAll('.side-button')];
const droneCard = document.getElementById('droneCard');
const launchBtn = document.getElementById('launchBtn');

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'utility-toast visible';
  toast.textContent = message;
  document.querySelector('.map-panel').appendChild(toast);

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
    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#353b42;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#171b20;stop-opacity:1" />
        </linearGradient>
      </defs>
      <path d="M50 10 L62 28 L72 46 L50 78 L28 46 L38 28 Z" fill="url(#grad1)" stroke="#4a4f56" stroke-width="1"/>
      <path d="M32 48 L18 62 L25 64 L35 52 Z" fill="#2c3137"/>
      <path d="M68 48 L82 62 L75 64 L65 52 Z" fill="#2c3137"/>
      <path d="M46 70 L54 70 L58 87 L42 87 Z" fill="#171b20"/>
      <path d="M42 36 L58 36 L63 46 L37 46 Z" fill="#dfe4ea" opacity="0.85"/>
      <circle cx="50" cy="17" r="8" fill="#1d2128" stroke="#646d77" stroke-width="1"/>
      <circle cx="50" cy="22" r="3" fill="#8aa1c7" opacity="0.8"/>
      <path d="M28 55 L20 66 L28 67 L36 58 Z" fill="#2f343b"/>
      <path d="M72 55 L80 66 L72 67 L64 58 Z" fill="#2f343b"/>
    </svg>
  `;

  return L.divIcon({
    html: svgMarkup,
    className: 'drone-marker-container',
    iconSize: [72, 72],
    iconAnchor: [36, 36],
    popupAnchor: [0, -35]
  });
}

const droneIcon = createDroneSvgIcon();
const routePointIcon = L.divIcon({
  className: 'route-marker',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});
const impactIcon = L.divIcon({
  className: 'impact-marker',
  html: '<span style="display:block; width:18px; height:18px; background:#ff5d5d; border:3px solid rgba(255,255,255,0.92); border-radius:50%; box-shadow:0 0 0 5px rgba(255,93,93,0.18);"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

function setSide(side) {
  state.selectedSide = side;
  sideButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.side === side);
  });

  resetAllDrones();

  if (side === 'ukraine') {
    updateStatus('Украина выбрана. Нажмите на карту в пределах Украины, чтобы разместить дрон.');
  } else {
    updateStatus('Россия выбрана. Нажмите на карту в пределах России, чтобы разместить дрон.');
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
    color: '#f5b700',
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
    impactMarker: null
  };

  state.activeDrone = drone;
  state.drones.push(drone);
  marker.bindPopup(`Geran-2<br>${state.selectedSide === 'ukraine' ? 'Украина' : 'Россия'}`);
  marker.openPopup();
  updateStatus('Дрон размещён. ЛКМ по карте — добавить маршрут, ПКМ — точка падения.');
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
  impactMarker.bindPopup('Точка падения');
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
    updateStatus('🚀 Дроны запущены в полёт.');
    showToast('Дроны в воздухе!');
  } else {
    updateStatus('Полёт остановлен.');
    showToast('Остановлено.');
  }
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
              weight: 2,
              opacity: 0.82,
              fillColor: '#3ad67a',
              fillOpacity: 0.12
            }
          }).addTo(map);
        }

        if (iso === 'RUS') {
          state.countryLayers.russia = L.geoJSON(feature, {
            style: {
              color: '#62a6ff',
              weight: 2,
              opacity: 0.82,
              fillColor: '#62a6ff',
              fillOpacity: 0.12
            }
          }).addTo(map);
        }
      });

      setSide('ukraine');
    })
    .catch(() => {
      updateStatus('Не удалось загрузить границы стран. Проверьте подключение к интернету.');
    });
}

sideButtons.forEach((button) => {
  button.addEventListener('click', () => setSide(button.dataset.side));
});

droneCard.addEventListener('click', () => {
  showToast('Geran-2 готов к запуску.');
});

launchBtn.addEventListener('click', launchMission);

map.on('click', (event) => {
  const { lat, lng } = event.latlng;

  if (!state.activeDrone) {
    const countryCode = state.selectedSide === 'ukraine' ? 'ukraine' : 'russia';
    if (!isPointInsideCountry(lat, lng, countryCode)) {
      showToast(`Дрон нельзя ставить вне ${state.selectedSide === 'ukraine' ? 'Украины' : 'России'}.`);
      return;
    }

    createDrone([lat, lng]);
    return;
  }

  const countryCode = state.selectedSide === 'ukraine' ? 'ukraine' : 'russia';
  if (!isPointInsideCountry(lat, lng, countryCode)) {
    showToast('Маршрут должен проходить в пределах выбранной страны.');
    return;
  }

  addRoutePoint([lat, lng]);
});

map.on('contextmenu', (event) => {
  const { lat, lng } = event.latlng;
  const countryCode = state.selectedSide === 'ukraine' ? 'ukraine' : 'russia';

  if (!isPointInsideCountry(lat, lng, countryCode)) {
    showToast('Точка падения должна быть в пределах страны.');
    return;
  }

  setImpactPoint([lat, lng]);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.activeDrone) {
    map.removeLayer(state.activeDrone.marker);
    map.removeLayer(state.activeDrone.routeLine);
    if (state.activeDrone.impactMarker) map.removeLayer(state.activeDrone.impactMarker);
    state.activeDrone.routeMarkers.forEach((marker) => map.removeLayer(marker));
    state.activeDrone = null;
    updateStatus('Дрон удалён. Выберите новое место для запуска.');
  }
});

loadCountryBorders();
