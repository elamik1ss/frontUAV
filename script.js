const countryConfig = {
  ukraine: {
    label: 'Украина',
    minLat: 44.2,
    maxLat: 52.4,
    minLng: 22.1,
    maxLng: 41.8,
    polygon: [
      [44.2, 22.1],
      [52.4, 22.1],
      [52.4, 41.8],
      [44.2, 41.8]
    ]
  },
  russia: {
    label: 'Россия',
    minLat: 41,
    maxLat: 81,
    minLng: 19,
    maxLng: 180,
    polygon: [
      [41, 19],
      [81, 19],
      [81, 180],
      [41, 180]
    ]
  }
};

const state = {
  selectedSide: 'ukraine',
  drones: [],
  activeDrone: null,
  toastTimer: null
};

const map = L.map('map', {
  zoomControl: true,
  attributionControl: true,
  minZoom: 2,
  maxZoom: 12
}).setView([58, 45], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const zoneLayers = {
  ukraine: L.polygon(countryConfig.ukraine.polygon, {
    color: '#8fe4a6',
    fillColor: '#8fe4a6',
    fillOpacity: 0.18,
    weight: 2,
    className: 'country-zone'
  }).addTo(map),
  russia: L.polygon(countryConfig.russia.polygon, {
    color: '#b7bdf6',
    fillColor: '#b7bdf6',
    fillOpacity: 0.15,
    weight: 2,
    className: 'country-zone'
  }).addTo(map)
};

const statusBox = document.getElementById('statusBox');
const sideButtons = [...document.querySelectorAll('.side-button')];
const droneCard = document.getElementById('droneCard');

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

function createDroneIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <path d="M22 41 L57 8 L98 41 L80 41 L72 92 L48 92 L40 41 Z" fill="#1f2127"/>
      <path d="M60 18 L62 41 L58 41 Z" fill="#ffffff"/>
      <path d="M52 92 L68 92 L70 105 L50 105 Z" fill="#0d0f12"/>
      <path d="M50 64 L70 64 L74 84 L46 84 Z" fill="#505862"/>
      <path d="M40 41 L80 41 L88 58 L32 58 Z" fill="#3b4047"/>
      <path d="M45 58 L75 58 L64 70 L56 70 Z" fill="#dfe5ea"/>
      <path d="M60 39 L62 44 L58 44 Z" fill="#ffffff"/>
      <circle cx="60" cy="38" r="7" fill="#1e1e1e"/>
      <path d="M34 44 L28 54 L32 55 L38 46 Z" fill="#30343a"/>
      <path d="M86 44 L92 54 L88 55 L82 46 Z" fill="#30343a"/>
      <path d="M54 90 L60 100 L66 90 Z" fill="#0a0d0f"/>
      <circle cx="60" cy="102" r="5" fill="#1a1d20"/>
    </svg>
  `;

  return L.icon({
    iconUrl: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    iconSize: [80, 80],
    iconAnchor: [40, 40],
    popupAnchor: [0, -34]
  });
}

const droneIcon = createDroneIcon();

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

function setSide(side) {
  state.selectedSide = side;
  sideButtons.forEach((button) => {
    const active = button.dataset.side === side;
    button.classList.toggle('active', active);
  });
  map.eachLayer((layer) => {
    if (layer instanceof L.Polygon && layer.options.className === 'country-zone') {
      layer.setStyle({
        fillOpacity: layer.getLatLngs()[0][0].lat === 44.2 ? (side === 'ukraine' ? 0.34 : 0.15) : (side === 'russia' ? 0.34 : 0.15)
      });
    }
  });

  zoneLayers.ukraine.setStyle({ fillOpacity: side === 'ukraine' ? 0.34 : 0.18 });
  zoneLayers.russia.setStyle({ fillOpacity: side === 'russia' ? 0.34 : 0.15 });

  state.activeDrone = null;
  state.drones.forEach((drone) => {
    map.removeLayer(drone.marker);
    if (drone.routeLine) map.removeLayer(drone.routeLine);
    if (drone.impactMarker) map.removeLayer(drone.impactMarker);
    drone.routePoints = [];
  });
  state.drones = [];

  updateStatus(
    side === 'ukraine'
      ? 'Украина выбрана. Нажмите на карту в пределах Украины, чтобы разместить дрон.'
      : 'Россия выбрана. Нажмите на карту в пределах России, чтобы разместить дрон.'
  );
}

function isInsideCountry(lat, lng, country) {
  const bounds = countryConfig[country];
  if (lat < bounds.minLat || lat > bounds.maxLat) return false;
  if (lng < bounds.minLng || lng > bounds.maxLng) return false;

  if (country === 'russia') {
    if (lat >= 44.2 && lat <= 52.4 && lng >= 22.1 && lng <= 41.8) {
      return false;
    }
  }

  return true;
}

function createDrone(latlng) {
  const routePoints = [latlng];
  const marker = L.marker(latlng, { icon: droneIcon }).addTo(map);
  const routeLine = L.polyline(routePoints, {
    color: '#f5b700',
    weight: 3,
    opacity: 0.8,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  const drone = {
    marker,
    routeLine,
    routePoints,
    impactMarker: null,
    isActive: true
  };

  state.activeDrone = drone;
  state.drones.push(drone);

  marker.bindPopup(`Geran-2<br>${countryConfig[state.selectedSide].label}`);
  marker.openPopup();

  updateStatus('Дрон размещён. ЛКМ по карте — добавить маршрут, ПКМ — точка падения.');
}

function addRoutePoint(latlng) {
  if (!state.activeDrone) return;

  const { routePoints, routeLine } = state.activeDrone;
  routePoints.push(latlng);
  routeLine.setLatLngs(routePoints);

  const newPoint = L.marker(latlng, { icon: routePointIcon }).addTo(map);
  newPoint.bindTooltip('Путь');

  state.activeDrone.routePoints = routePoints;
}

function setImpactPoint(latlng) {
  if (!state.activeDrone) {
    showToast('Сначала разместите дрон.');
    return;
  }

  if (state.activeDrone.impactMarker) {
    map.removeLayer(state.activeDrone.impactMarker);
  }

  const marker = L.marker(latlng, { icon: impactIcon }).addTo(map);
  marker.bindPopup('Точка падения');
  state.activeDrone.impactMarker = marker;
  updateStatus('Точка падения установлена.');
}

sideButtons.forEach((button) => {
  button.addEventListener('click', () => setSide(button.dataset.side));
});

droneCard.addEventListener('click', () => {
  showToast('Geran-2 готов к запуску.');
});

map.on('click', (event) => {
  const { lat, lng } = event.latlng;

  if (!state.activeDrone) {
    if (!isInsideCountry(lat, lng, state.selectedSide)) {
      showToast(`Дрон нельзя ставить вне ${countryConfig[state.selectedSide].label}.`);
      return;
    }

    createDrone([lat, lng]);
    return;
  }

  addRoutePoint([lat, lng]);
});

map.on('contextmenu', (event) => {
  const { lat, lng } = event.latlng;
  setImpactPoint([lat, lng]);
});

setSide('ukraine');

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.activeDrone) {
    map.removeLayer(state.activeDrone.marker);
    if (state.activeDrone.routeLine) map.removeLayer(state.activeDrone.routeLine);
    if (state.activeDrone.impactMarker) map.removeLayer(state.activeDrone.impactMarker);
    state.activeDrone = null;
    updateStatus('Дрон удалён. Выберите место для нового запуска.');
  }
});
