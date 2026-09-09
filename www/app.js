// ============================================================================
// GPS Tracker PWA & Dashboard con Leaflet y Registro de Paradas
// Motor: Audio Loop Hack (segundo plano con pantalla bloqueada) + Rango 10s
// ============================================================================

const STORAGE_POINTS_KEY = 'gps_pwa_points';
const STORAGE_STOPS_KEY = 'gps_pwa_stops';
const STORAGE_TRIP_KEY = 'gps_pwa_trip_meta';

let isTracking = false;
let watcherId = null;
let wakeLockSentinel = null;
let countdownTimer = null;
let tripDurationTimer = null;
let deferredPrompt = null;

let points = [];
let stops = [];
let totalDistanceKm = 0;
let tripStartTime = null;
let lastCommittedTime = 0;
let bestCandidateInWindow = null;
let backgroundPointsCount = 0;

let currentLat = null;
let currentLng = null;

// Variables de Mapa Leaflet
let map = null;
let routePolyline = null;
let currentPositionMarker = null;
let accuracyCircle = null;
let stopsLayerGroup = null;

let deviceId = localStorage.getItem('gps_device_id');
if (!deviceId) {
  deviceId = 'pwa-' + Math.random().toString(36).substring(2, 9);
  localStorage.setItem('gps_device_id', deviceId);
}

// ----------------------------------------------------------------------------
// Elementos del DOM
// ----------------------------------------------------------------------------
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnOpenStopModal = document.getElementById('btnOpenStopModal');
const btnConfirmStop = document.getElementById('btnConfirmStop');
const btnCancelStop = document.getElementById('btnCancelStop');
const stopModal = document.getElementById('stopModal');
const stopNoteInput = document.getElementById('stopNote');

const btnCenterMap = document.getElementById('btnCenterMap');
const btnFitMap = document.getElementById('btnFitMap');
const btnTestServer = document.getElementById('btnTestServer');
const btnClearLog = document.getElementById('btnClearLog');
const btnExportJson = document.getElementById('btnExportJson');
const btnExportCsv = document.getElementById('btnExportCsv');
const btnClearHistory = document.getElementById('btnClearHistory');
const btnInstallPwa = document.getElementById('btnInstallPwa');
const btnEnterPocket = document.getElementById('btnEnterPocket');
const btnExitPocket = document.getElementById('btnExitPocket');

const pocketModeOverlay = document.getElementById('pocketModeOverlay');
const pocketPoints = document.getElementById('pocketPoints');
const pocketDistance = document.getElementById('pocketDistance');

const valDistance = document.getElementById('valDistance');
const valDuration = document.getElementById('valDuration');
const valSpeed = document.getElementById('valSpeed');
const valStopsCount = document.getElementById('valStopsCount');
const stopsTotalBadge = document.getElementById('stopsTotalBadge');
const stopsList = document.getElementById('stopsList');

const nextCaptureCountdown = document.getElementById('nextCaptureCountdown');
const gpsQualityText = document.getElementById('gpsQualityText');
const pointsCount = document.getElementById('pointsCount');
const lastCoordText = document.getElementById('lastCoordText');
const mapStatusText = document.getElementById('mapStatusText');
const pulseIndicator = document.getElementById('pulseIndicator');
const liveTag = document.getElementById('liveTag');

const serverStatus = document.getElementById('serverStatus');
const serverUrlInput = document.getElementById('serverUrl');
const intervalSelect = document.getElementById('intervalSelect');
const minAccuracySelect = document.getElementById('minAccuracySelect');
const syncWithServerCheckbox = document.getElementById('syncWithServer');
const useAudioHackCheckbox = document.getElementById('useAudioHack');
const useWakeLockCheckbox = document.getElementById('useWakeLock');
const logConsole = document.getElementById('logConsole');
const logCount = document.getElementById('logCount');
const bgAudio = document.getElementById('bgAudio');

let logEntriesCount = 0;

// ----------------------------------------------------------------------------
// Registro de Service Worker para PWA
// ----------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker PWA registrado'))
      .catch(err => console.warn('Error SW:', err));
  });
}

// Botón de instalación
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  btnInstallPwa.classList.remove('hidden');
});

btnInstallPwa.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    log(`Instalación PWA: ${outcome}`, 'log-system');
    deferredPrompt = null;
    btnInstallPwa.classList.add('hidden');
  }
});

// URL de Render
const defaultServerUrl = window.location.origin.startsWith('http') 
  ? window.location.origin 
  : 'https://gps-background-tracker.onrender.com';
serverUrlInput.value = localStorage.getItem('gps_server_url') || defaultServerUrl;

serverUrlInput.addEventListener('change', () => {
  localStorage.setItem('gps_server_url', serverUrlInput.value.trim());
  testServerConnection();
});

// ----------------------------------------------------------------------------
// Inicialización del Mapa Leaflet
// ----------------------------------------------------------------------------
function initMap() {
  if (map) return;

  // Centro inicial por defecto (0, 0 o última ubicación guardada)
  const initialLat = points.length > 0 ? points[points.length - 1].latitude : 19.4326;
  const initialLng = points.length > 0 ? points[points.length - 1].longitude : -99.1332;
  const initialZoom = points.length > 0 ? 15 : 4;

  map = L.map('tripMap', {
    zoomControl: true,
    attributionControl: false
  }).setView([initialLat, initialLng], initialZoom);

  // Capa de mosaicos OpenStreetMap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  // Capa para la línea del recorrido
  routePolyline = L.polyline([], {
    color: '#38bdf8',
    weight: 5,
    opacity: 0.9,
    lineJoin: 'round'
  }).addTo(map);

  // Capa para paradas
  stopsLayerGroup = L.layerGroup().addTo(map);

  // Dibujar datos guardados previamente
  redrawSavedMapData();
}

function redrawSavedMapData() {
  if (!map) return;

  // Reconstruir polilínea con los puntos guardados
  if (points.length > 0) {
    const latLngs = points.map(p => [p.latitude, p.longitude]);
    routePolyline.setLatLngs(latLngs);
    map.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });
    mapStatusText.textContent = `${points.length} puntos cargados`;
  }

  // Reconstruir marcadores de paradas
  stops.forEach(s => addStopMarkerToMap(s));
  renderStopsList();
}

function updateMapWithPosition(lat, lng, accuracy) {
  if (!map) return;

  const latLng = [lat, lng];

  // Actualizar línea de recorrido
  routePolyline.addLatLng(latLng);

  // Marcador de posición actual
  if (!currentPositionMarker) {
    // Icono pulsante personalizado
    const pulseIcon = L.divIcon({
      className: 'live-gps-marker',
      html: '<div class="gps-dot"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    currentPositionMarker = L.marker(latLng, { icon: pulseIcon }).addTo(map);
  } else {
    currentPositionMarker.setLatLng(latLng);
  }

  // Círculo de precisión
  if (accuracy) {
    if (!accuracyCircle) {
      accuracyCircle = L.circle(latLng, {
        radius: accuracy,
        color: '#38bdf8',
        fillColor: '#38bdf8',
        fillOpacity: 0.15,
        weight: 1
      }).addTo(map);
    } else {
      accuracyCircle.setLatLng(latLng);
      accuracyCircle.setRadius(accuracy);
    }
  }

  mapStatusText.textContent = `En vivo: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function addStopMarkerToMap(stopRecord) {
  if (!map || !stopsLayerGroup) return;

  // Icono de parada (Pin rojo / amarillo con emoji)
  const stopIcon = L.divIcon({
    className: 'stop-pin-marker',
    html: `<div class="stop-pin">📍</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -25]
  });

  const timeStr = new Date(stopRecord.timestamp).toLocaleTimeString();
  const marker = L.marker([stopRecord.latitude, stopRecord.longitude], { icon: stopIcon })
    .bindPopup(`
      <div style="font-family: sans-serif; color: #0f172a;">
        <strong style="font-size: 1rem;">📍 ${escapeHtml(stopRecord.note)}</strong>
        <p style="margin: 4px 0 0; font-size: 0.8rem; color: #64748b;">Hora: ${timeStr}</p>
        <p style="margin: 2px 0 0; font-size: 0.75rem; color: #94a3b8;">${stopRecord.latitude.toFixed(5)}, ${stopRecord.longitude.toFixed(5)}</p>
      </div>
    `);

  stopsLayerGroup.addLayer(marker);
}

// Controles del mapa
btnCenterMap.addEventListener('click', () => {
  if (currentLat !== null && currentLng !== null && map) {
    map.setView([currentLat, currentLng], 17);
    log('Mapa centrado en tu posición.', 'log-system');
  } else {
    alert('Aún no se ha recibido señal GPS.');
  }
});

btnFitMap.addEventListener('click', () => {
  if (routePolyline && routePolyline.getLatLngs().length > 0 && map) {
    map.fitBounds(routePolyline.getBounds(), { padding: [35, 35] });
  } else {
    alert('No hay puntos en el recorrido para mostrar.');
  }
});

// ----------------------------------------------------------------------------
// Cálculo de Distancia (Haversine)
// ----------------------------------------------------------------------------
function calculateDistanceBetweenKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function recalculateTotalDistance() {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += calculateDistanceBetweenKm(
      points[i - 1].latitude, points[i - 1].longitude,
      points[i].latitude, points[i].longitude
    );
  }
  totalDistanceKm = dist;
  valDistance.textContent = `${totalDistanceKm.toFixed(2)} km`;
  pocketDistance.textContent = totalDistanceKm.toFixed(2);
}

// ----------------------------------------------------------------------------
// Gestión de Paradas (Stops)
// ----------------------------------------------------------------------------
btnOpenStopModal.addEventListener('click', () => {
  if (currentLat === null || currentLng === null) {
    alert('Esperando señal GPS para registrar la parada.');
    return;
  }
  stopNoteInput.value = '';
  stopModal.classList.remove('hidden');
  stopNoteInput.focus();
});

btnCancelStop.addEventListener('click', () => {
  stopModal.classList.add('hidden');
});

btnConfirmStop.addEventListener('click', () => {
  const note = stopNoteInput.value.trim() || `Parada #${stops.length + 1}`;
  saveStop(note);
  stopModal.classList.add('hidden');
});

function saveStop(note) {
  if (currentLat === null || currentLng === null) return;

  const stopRecord = {
    id: 'stop-' + Date.now(),
    latitude: currentLat,
    longitude: currentLng,
    note: note,
    timestamp: new Date().toISOString(),
    deviceId: deviceId
  };

  stops.push(stopRecord);
  try {
    localStorage.setItem(STORAGE_STOPS_KEY, JSON.stringify(stops));
  } catch (e) {}

  addStopMarkerToMap(stopRecord);
  renderStopsList();
  valStopsCount.textContent = stops.length;
  stopsTotalBadge.textContent = stops.length;

  log(`🛑 Parada guardada: "${note}" (${currentLat.toFixed(5)}, ${currentLng.toFixed(5)})`, 'log-bg');

  // Sincronizar con Render
  if (syncWithServerCheckbox.checked) {
    sendStopToServer(stopRecord);
  }
}

function renderStopsList() {
  stopsList.innerHTML = '';
  valStopsCount.textContent = stops.length;
  stopsTotalBadge.textContent = stops.length;

  if (stops.length === 0) {
    stopsList.innerHTML = '<p class="empty-text">No has registrado paradas en este viaje.</p>';
    return;
  }

  stops.forEach((s, idx) => {
    const item = document.createElement('div');
    item.className = 'stop-item';
    const time = new Date(s.timestamp).toLocaleTimeString();
    item.innerHTML = `
      <div class="stop-item-info">
        <span class="stop-item-title">📍 ${escapeHtml(s.note)}</span>
        <span class="stop-item-meta">${time} • ${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}</span>
      </div>
      <span class="stop-item-badge">#${idx + 1}</span>
    `;

    // Al hacer clic, centrar mapa en la parada
    item.addEventListener('click', () => {
      if (map) {
        map.setView([s.latitude, s.longitude], 17);
        map.eachLayer(layer => {
          if (layer.getPopup && layer.getLatLng) {
            const pos = layer.getLatLng();
            if (pos.lat === s.latitude && pos.lng === s.longitude) {
              layer.openPopup();
            }
          }
        });
      }
    });

    stopsList.appendChild(item);
  });
}

async function sendStopToServer(stopRecord) {
  const url = serverUrlInput.value.trim();
  if (!url) return;

  try {
    const res = await fetch(`${url}/api/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stopRecord)
    });
    if (res.ok) {
      log(`☁️ Parada respaldada en Render: ${stopRecord.note}`, 'log-sync');
    }
  } catch (err) {
    console.warn('Error enviando parada a Render:', err);
  }
}

// ----------------------------------------------------------------------------
// Funciones de Bitácora (Logging)
// ----------------------------------------------------------------------------
function log(message, cssClass = '') {
  logEntriesCount++;
  logCount.textContent = logEntriesCount;
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${cssClass}`;
  entry.textContent = `[${time}] ${message}`;
  logConsole.appendChild(entry);
  logConsole.scrollTop = logConsole.scrollHeight;
}

btnClearLog.addEventListener('click', () => {
  logConsole.innerHTML = '';
  logEntriesCount = 0;
  logCount.textContent = '0';
  log('Consola limpiada.', 'log-system');
});

// ----------------------------------------------------------------------------
// Conexión con Servidor Render
// ----------------------------------------------------------------------------
async function testServerConnection() {
  const url = serverUrlInput.value.trim();
  serverStatus.textContent = 'Verificando...';
  serverStatus.className = 'status-indicator';

  try {
    const res = await fetch(`${url}/health`, { method: 'GET', signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      serverStatus.textContent = 'Online (Render)';
      serverStatus.className = 'status-indicator online';
      liveTag.textContent = 'Render Online';
      liveTag.className = 'badge badge-pulse';
      log(`Conexión exitosa con Render: ${url}`, 'log-sync');
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    serverStatus.textContent = 'Sin conexión';
    serverStatus.className = 'status-indicator';
    liveTag.textContent = 'Local Offline';
    liveTag.className = 'badge';
    log(`Aviso conexión Render (${url}): ${err.message}`, 'log-err');
    return false;
  }
}
btnTestServer.addEventListener('click', testServerConnection);
testServerConnection();

// ----------------------------------------------------------------------------
// Ciclo de Vida: Detección de Suspensión
// ----------------------------------------------------------------------------
document.addEventListener('visibilitychange', () => {
  const isHidden = document.hidden;
  if (isHidden) {
    log('📱 Pantalla bloqueada / Segundo plano. Audio Loop activo.', 'log-bg');
  } else {
    log('👁️ PWA activa en primer plano.', 'log-system');
    if (isTracking && useWakeLockCheckbox.checked) {
      requestScreenWakeLock();
    }
    if (map) {
      setTimeout(() => map.invalidateSize(), 300);
    }
  }
});

// Screen Wake Lock API (Opcional)
async function requestScreenWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      log('💡 Screen Wake Lock ACTIVO.', 'log-system');
      wakeLockSentinel.addEventListener('release', () => {
        log('💡 Screen Wake Lock liberado.', 'log-system');
      });
    } catch (err) {
      console.warn('Wake Lock no disponible:', err);
    }
  }
}

function releaseScreenWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().then(() => {
      wakeLockSentinel = null;
    });
  }
}

// ----------------------------------------------------------------------------
// AUDIO LOOP HACK (Motor Principal de Segundo Plano)
// ----------------------------------------------------------------------------
function startAudioLoopHack() {
  if (!bgAudio) return;

  bgAudio.volume = 0.05;
  bgAudio.play().then(() => {
    log('🔊 Audio Loop Hack iniciado: el teléfono no dormirá el GPS al apagar la pantalla.', 'log-bg');

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'GPS Tracker - Grabando Viaje',
        artist: 'Rastreo cada 10s en segundo plano',
        album: 'Audio Loop Heartbeat'
      });
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.setActionHandler('pause', () => stopTracking());
      navigator.mediaSession.setActionHandler('play', () => startTracking());
    }
  }).catch((err) => {
    log(`Aviso Audio: ${err.message}`, 'log-err');
  });
}

function stopAudioLoopHack() {
  if (bgAudio) {
    bgAudio.pause();
    bgAudio.currentTime = 0;
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'paused';
  }
}

// Latido continuo desde el subsistema de audio
bgAudio.addEventListener('timeupdate', () => {
  if (!isTracking) return;

  const now = Date.now();
  const targetIntervalMs = (parseInt(intervalSelect.value, 10) || 10) * 1000;

  if (now - lastCommittedTime >= targetIntervalMs) {
    if (bestCandidateInWindow) {
      commitPosition(bestCandidateInWindow);
      lastCommittedTime = now;
      bestCandidateInWindow = null;
    } else {
      navigator.geolocation.getCurrentPosition(
        handleIncomingPosition,
        (err) => console.warn('Heartbeat GPS fix error:', err.message),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
      );
    }
  }
});

// ----------------------------------------------------------------------------
// Modo Bolsillo (OLED)
// ----------------------------------------------------------------------------
btnEnterPocket.addEventListener('click', () => {
  pocketModeOverlay.classList.remove('hidden');
  pocketPoints.textContent = points.length;
  pocketDistance.textContent = totalDistanceKm.toFixed(2);
});

btnExitPocket.addEventListener('click', () => {
  pocketModeOverlay.classList.add('hidden');
  if (map) {
    setTimeout(() => map.invalidateSize(), 300);
  }
});

// ----------------------------------------------------------------------------
// Evaluación de Calidad de Señal GPS
// ----------------------------------------------------------------------------
function evaluateGpsQuality(accuracy) {
  if (!accuracy) return { text: 'Buscando satélites...', className: 'text-muted' };

  if (accuracy <= 10) {
    return { text: `Ultra Alta (±${accuracy}m)`, className: 'quality-ultra' };
  } else if (accuracy <= 25) {
    return { text: `Alta (±${accuracy}m)`, className: 'quality-good' };
  } else if (accuracy <= 50) {
    return { text: `Regular (±${accuracy}m)`, className: 'quality-fair' };
  } else {
    return { text: `Baja (±${accuracy}m)`, className: 'quality-poor' };
  }
}

// ----------------------------------------------------------------------------
// Procesamiento de Coordenadas (Super Precisión + Cadencia 10 Segundos)
// ----------------------------------------------------------------------------
function handleIncomingPosition(pos) {
  const coords = pos.coords;
  const lat = coords.latitude;
  const lng = coords.longitude;
  const accuracy = coords.accuracy ? Math.round(coords.accuracy) : null;
  const speed = coords.speed ? Math.round(coords.speed * 3.6) : 0;
  const isHidden = document.hidden;

  currentLat = lat;
  currentLng = lng;

  // Actualizar lectura en tiempo real
  if (!isHidden) {
    valSpeed.textContent = `${speed} km/h`;
    lastCoordText.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    const quality = evaluateGpsQuality(accuracy);
    gpsQualityText.textContent = quality.text;
    gpsQualityText.className = quality.className;

    // Actualizar puntero en mapa
    updateMapWithPosition(lat, lng, accuracy);
  }

  // Filtro de precisión mínima
  const maxAllowedAccuracy = parseInt(minAccuracySelect.value, 10) || 30;
  if (accuracy && accuracy > maxAllowedAccuracy) {
    log(`⚠️ Descartado: Precisión (±${accuracy}m) supera el límite (<${maxAllowedAccuracy}m)`, 'log-err');
    return;
  }

  const now = Date.now();
  const targetIntervalMs = (parseInt(intervalSelect.value, 10) || 10) * 1000;

  // Guardar el candidato con mejor precisión en la ventana de 10s
  if (!bestCandidateInWindow || (accuracy && accuracy < (bestCandidateInWindow.accuracy || 999))) {
    bestCandidateInWindow = {
      latitude: lat,
      longitude: lng,
      accuracy: accuracy,
      speed: speed,
      timestamp: new Date().toISOString(),
      isBackground: isHidden
    };
  }

  // Si ya transcurrió el intervalo requerido (10 segundos)
  if (now - lastCommittedTime >= targetIntervalMs) {
    commitPosition(bestCandidateInWindow || {
      latitude: lat,
      longitude: lng,
      accuracy: accuracy,
      speed: speed,
      timestamp: new Date().toISOString(),
      isBackground: isHidden
    });

    lastCommittedTime = now;
    bestCandidateInWindow = null;
  }
}

function commitPosition(record) {
  if (record.isBackground) {
    backgroundPointsCount++;
  }

  // Calcular incremento de distancia si hay punto previo
  if (points.length > 0) {
    const prev = points[points.length - 1];
    const addedKm = calculateDistanceBetweenKm(prev.latitude, prev.longitude, record.latitude, record.longitude);
    // Filtrar saltos irreales causados por imprecisión (ej. saltos de > 200 km/h)
    if (addedKm < 0.8) {
      totalDistanceKm += addedKm;
    }
  }

  points.push(record);
  try {
    localStorage.setItem(STORAGE_POINTS_KEY, JSON.stringify(points.slice(-1000)));
  } catch (e) {}

  updateStatsUI();
  pocketPoints.textContent = points.length;
  pocketDistance.textContent = totalDistanceKm.toFixed(2);

  // Actualizar trazado en mapa
  if (map && routePolyline) {
    routePolyline.addLatLng([record.latitude, record.longitude]);
  }

  const bgTag = record.isBackground ? ' [EN SEGUNDO PLANO / BLOQUEADO]' : '';
  log(`🎯 Punto guardado (10s): ${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)} (±${record.accuracy}m)${bgTag}`, 
      record.isBackground ? 'log-bg' : 'log-gps');

  if (syncWithServerCheckbox.checked) {
    sendLocationToServer(record);
  }
}

async function sendLocationToServer(record) {
  const url = serverUrlInput.value.trim();
  if (!url) return;

  try {
    const res = await fetch(`${url}/api/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: record.latitude,
        longitude: record.longitude,
        accuracy: record.accuracy,
        speed: record.speed,
        timestamp: record.timestamp,
        deviceId: deviceId,
        isBackground: record.isBackground
      })
    });
    if (res.ok) {
      log(`☁️ Punto enviado a Render`, 'log-sync');
    }
  } catch (err) {
    console.warn('Error enviando a Render:', err);
  }
}

function updateStatsUI() {
  pointsCount.textContent = points.length;
  valDistance.textContent = `${totalDistanceKm.toFixed(2)} km`;
}

// ----------------------------------------------------------------------------
// Temporizadores: Intervalo 10s y Duración del Viaje
// ----------------------------------------------------------------------------
function startTimers() {
  stopTimers();

  // Contador regresivo para siguiente captura (10s)
  countdownTimer = setInterval(() => {
    if (!isTracking) return;
    const intervalSec = parseInt(intervalSelect.value, 10) || 10;
    const elapsedMs = Date.now() - lastCommittedTime;
    const remainingSec = Math.max(0, Math.ceil((intervalSec * 1000 - elapsedMs) / 1000));
    nextCaptureCountdown.textContent = `${remainingSec}s`;
  }, 500);

  // Contador de duración del viaje
  tripDurationTimer = setInterval(() => {
    if (!isTracking || !tripStartTime) return;
    const diffMs = Date.now() - tripStartTime;
    const totalSec = Math.floor(diffMs / 1000);
    const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    valDuration.textContent = `${hrs}:${mins}:${secs}`;
  }, 1000);
}

function stopTimers() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (tripDurationTimer) {
    clearInterval(tripDurationTimer);
    tripDurationTimer = null;
  }
  nextCaptureCountdown.textContent = '--';
}

// ----------------------------------------------------------------------------
// Iniciar y Detener Viaje
// ----------------------------------------------------------------------------
function startTracking() {
  if (!navigator.geolocation) {
    alert('Geolocalización no soportada en este navegador.');
    return;
  }

  isTracking = true;
  tripStartTime = tripStartTime || Date.now();

  btnStart.disabled = true;
  btnStop.disabled = false;
  btnOpenStopModal.disabled = false;
  btnEnterPocket.disabled = false;
  intervalSelect.disabled = true;
  minAccuracySelect.disabled = true;
  pulseIndicator.classList.add('active');

  lastCommittedTime = 0;
  bestCandidateInWindow = null;
  startTimers();

  // Iniciar Audio Loop Hack
  if (useAudioHackCheckbox.checked) {
    startAudioLoopHack();
  }

  // Activar Wake Lock
  if (useWakeLockCheckbox.checked) {
    requestScreenWakeLock();
  }

  // Activar observación GPS de alta precisión
  const geoOptions = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000
  };

  watcherId = navigator.geolocation.watchPosition(
    handleIncomingPosition,
    (error) => {
      let msg = error.message;
      if (error.code === 1) msg = 'Permiso denegado por el usuario.';
      if (error.code === 2) msg = 'Buscando satélites GPS...';
      if (error.code === 3) msg = 'Timeout obteniendo coordenadas.';
      log(`GPS: ${msg}`, 'log-err');
    },
    geoOptions
  );

  const sec = intervalSelect.value;
  const acc = minAccuracySelect.value;
  log(`🚀 Viaje iniciado. Intervalo: ${sec}s | Precisión: <${acc}m`, 'log-system');
  log(`📱 Ya puedes bloquear la pantalla de tu móvil: el viaje seguirá grabándose.`, 'log-bg');
}

function stopTracking() {
  isTracking = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
  btnOpenStopModal.disabled = true;
  btnEnterPocket.disabled = true;
  intervalSelect.disabled = false;
  minAccuracySelect.disabled = false;
  pulseIndicator.classList.remove('active');

  stopTimers();
  pocketModeOverlay.classList.add('hidden');

  if (watcherId !== null) {
    navigator.geolocation.clearWatch(watcherId);
    watcherId = null;
  }

  stopAudioLoopHack();
  releaseScreenWakeLock();
  log('Viaje pausado/detenido.', 'log-system');
}

btnStart.addEventListener('click', startTracking);
btnStop.addEventListener('click', stopTracking);

// ----------------------------------------------------------------------------
// Cargar Datos Previos al Iniciar
// ----------------------------------------------------------------------------
try {
  const savedPoints = localStorage.getItem(STORAGE_POINTS_KEY);
  if (savedPoints) {
    points = JSON.parse(savedPoints);
    recalculateTotalDistance();
    pointsCount.textContent = points.length;
    if (points.length > 0) {
      const last = points[points.length - 1];
      currentLat = last.latitude;
      currentLng = last.longitude;
      lastCoordText.textContent = `${last.latitude.toFixed(5)}, ${last.longitude.toFixed(5)}`;
    }
  }

  const savedStops = localStorage.getItem(STORAGE_STOPS_KEY);
  if (savedStops) {
    stops = JSON.parse(savedStops);
    valStopsCount.textContent = stops.length;
    stopsTotalBadge.textContent = stops.length;
  }
} catch (e) {
  points = [];
  stops = [];
}

// Inicializar el mapa tras cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderStopsList();
});

// ----------------------------------------------------------------------------
// Exportación y Limpieza de Viaje
// ----------------------------------------------------------------------------
btnExportJson.addEventListener('click', () => {
  if (points.length === 0 && stops.length === 0) {
    alert('No hay datos registrados en este viaje.');
    return;
  }
  const tripData = {
    deviceId: deviceId,
    exportedAt: new Date().toISOString(),
    totalDistanceKm: totalDistanceKm.toFixed(2),
    totalPoints: points.length,
    totalStops: stops.length,
    stops: stops,
    track: points
  };
  const blob = new Blob([JSON.stringify(tripData, null, 2)], { type: 'application/json' });
  downloadFile(blob, `viaje_gps_${Date.now()}.json`);
});

btnExportCsv.addEventListener('click', () => {
  if (points.length === 0 && stops.length === 0) {
    alert('No hay datos registrados en este viaje.');
    return;
  }
  let csv = 'Type,Timestamp,Latitude,Longitude,Accuracy_m,Speed_kmh,IsBackground,Note\n';
  stops.forEach(s => {
    csv += `STOP,"${s.timestamp}",${s.latitude},${s.longitude},,,,"${escapeCsv(s.note)}"\n`;
  });
  points.forEach(p => {
    csv += `TRACK,"${p.timestamp}",${p.latitude},${p.longitude},${p.accuracy || ''},${p.speed || ''},${p.isBackground},""\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  downloadFile(blob, `viaje_gps_${Date.now()}.csv`);
});

btnClearHistory.addEventListener('click', () => {
  if (confirm('¿Deseas iniciar un nuevo viaje y borrar los puntos y paradas actuales?')) {
    stopTracking();
    points = [];
    stops = [];
    totalDistanceKm = 0;
    tripStartTime = null;
    backgroundPointsCount = 0;
    currentLat = null;
    currentLng = null;

    localStorage.removeItem(STORAGE_POINTS_KEY);
    localStorage.removeItem(STORAGE_STOPS_KEY);

    valDistance.textContent = '0.00 km';
    valDuration.textContent = '00:00:00';
    valSpeed.textContent = '0 km/h';
    valStopsCount.textContent = '0';
    stopsTotalBadge.textContent = '0';
    pointsCount.textContent = '0';
    lastCoordText.textContent = '--.------, --.------';

    if (routePolyline) routePolyline.setLatLngs([]);
    if (stopsLayerGroup) stopsLayerGroup.clearLayers();
    if (currentPositionMarker) {
      map.removeLayer(currentPositionMarker);
      currentPositionMarker = null;
    }
    if (accuracyCircle) {
      map.removeLayer(accuracyCircle);
      accuracyCircle = null;
    }

    renderStopsList();
    log('Nuevo viaje iniciado. Historial reseteado.', 'log-system');
  }
});

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCsv(str) {
  return String(str).replace(/"/g, '""');
}
