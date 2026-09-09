// ============================================================================
// GPS Tracker PWA & Dashboard con Historial de Viajes, Leaflet y Paradas
// ============================================================================

const STORAGE_ACTIVE_POINTS_KEY = 'gps_pwa_active_points';
const STORAGE_ACTIVE_STOPS_KEY = 'gps_pwa_active_stops';
const STORAGE_ACTIVE_TRIP_KEY = 'gps_pwa_active_trip_meta';
const STORAGE_TRIPS_HISTORY_KEY = 'gps_pwa_trips_history';

let isTracking = false;
let watcherId = null;
let wakeLockSentinel = null;
let countdownTimer = null;
let tripDurationTimer = null;
let heartbeatTimer = null;
let deferredPrompt = null;

// Web Audio API Keepalive Context
let audioCtx = null;
let audioOscillator = null;
let audioGain = null;

// Estado del viaje activo
let currentTripId = null;
let currentTripName = '';
let currentTripStartTime = null;
let points = [];
let stops = [];
let totalDistanceKm = 0;
let lastCommittedTime = 0;
let bestCandidateInWindow = null;
let wasScreenHiddenInWindow = false;
let backgroundPointsCount = 0;
let currentLat = null;
let currentLng = null;

// Modo inspección de viaje histórico
let isViewingHistoricalTrip = false;

// Historial de viajes
let tripsHistory = [];

// Variables de Mapa Leaflet
let map = null;
let routePolyline = null;
let roadSnapPolyline = null;
let currentPositionMarker = null;
let accuracyCircle = null;
let stopsLayerGroup = null;
let tripPointsLayerGroup = null;
let isSnappedToRoads = false;
let currentlyViewedTrip = null;
let currentlyViewedRoadCoordinates = null;

// Variables para animación del cochecito
let isAnimating = false;
let isAnimPaused = false;
let animSpeedMultiplier = 1;
let animRafId = null;
let animLastFrameTime = 0;
let animCurrentProgress = 0;
let animRoadCoords = [];
let animMilestones = [];
let animTotalDistanceMeters = 0;
let animCumulativeDistances = [];
let animTotalDurationSec = 0;
let animVehicleMarker = null;
let animProgressPolyline = null;

let deviceId = localStorage.getItem('gps_device_id');
if (!deviceId) {
  deviceId = 'pwa-' + Math.random().toString(36).substring(2, 9);
  localStorage.setItem('gps_device_id', deviceId);
}

// ----------------------------------------------------------------------------
// Elementos del DOM
// ----------------------------------------------------------------------------
const tabBtnLive = document.getElementById('tabBtnLive');
const tabBtnHistory = document.getElementById('tabBtnHistory');
const tabHistoryCount = document.getElementById('tabHistoryCount');
const sectionLiveView = document.getElementById('sectionLiveView');
const sectionHistoryView = document.getElementById('sectionHistoryView');
const tripsContainer = document.getElementById('tripsContainer');
const btnRefreshTrips = document.getElementById('btnRefreshTrips');

const viewingTripBanner = document.getElementById('viewingTripBanner');
const viewingTripTitle = document.getElementById('viewingTripTitle');
const btnSnapToRoads = document.getElementById('btnSnapToRoads');
const btnPlayTrip = document.getElementById('btnPlayTrip');
const btnExitTripView = document.getElementById('btnExitTripView');
const roadSnapBadge = document.getElementById('roadSnapBadge');
const mapHeading = document.getElementById('mapHeading');

// Controles de la barra flotante de animación
const playbackControls = document.getElementById('playbackControls');
const btnPlayPause = document.getElementById('btnPlayPause');
const playPauseIcon = document.getElementById('playPauseIcon');
const btnRestartAnim = document.getElementById('btnRestartAnim');
const playbackProgress = document.getElementById('playbackProgress');
const playbackCurrentTime = document.getElementById('playbackCurrentTime');
const playbackTotalTime = document.getElementById('playbackTotalTime');
const hudSegmentTimeBadge = document.getElementById('hudSegmentTimeBadge');
const hudSegmentTimeText = document.getElementById('hudSegmentTimeText');
const hudSpeedBadge = document.getElementById('hudSpeedBadge');
const hudSpeedText = document.getElementById('hudSpeedText');
const hudDistanceBadge = document.getElementById('hudDistanceBadge');
const hudDistanceText = document.getElementById('hudDistanceText');
const chkFollowVehicle = document.getElementById('chkFollowVehicle');
const btnClosePlayback = document.getElementById('btnClosePlayback');

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnOpenStopModal = document.getElementById('btnOpenStopModal');
const btnConfirmStop = document.getElementById('btnConfirmStop');
const btnCancelStop = document.getElementById('btnCancelStop');
const stopModal = document.getElementById('stopModal');
const stopNoteInput = document.getElementById('stopNote');

const finishTripModal = document.getElementById('finishTripModal');
const tripNameInput = document.getElementById('tripNameInput');
const modalTripDist = document.getElementById('modalTripDist');
const modalTripStops = document.getElementById('modalTripStops');
const btnConfirmFinish = document.getElementById('btnConfirmFinish');
const btnCancelFinish = document.getElementById('btnCancelFinish');

const btnCenterMap = document.getElementById('btnCenterMap');
const btnFitMap = document.getElementById('btnFitMap');
const btnTestServer = document.getElementById('btnTestServer');
const btnClearLog = document.getElementById('btnClearLog');
const btnExportJson = document.getElementById('btnExportJson');
const btnExportCsv = document.getElementById('btnExportCsv');
const btnResetCurrent = document.getElementById('btnResetCurrent');
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
      .then(reg => console.log('Service Worker registrado:', reg.scope))
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

// URL del servidor Render
const defaultServerUrl = window.location.origin.startsWith('http') 
  ? window.location.origin 
  : 'https://gps-background-tracker.onrender.com';
serverUrlInput.value = localStorage.getItem('gps_server_url') || defaultServerUrl;

serverUrlInput.addEventListener('change', () => {
  localStorage.setItem('gps_server_url', serverUrlInput.value.trim());
  testServerConnection();
});

// ----------------------------------------------------------------------------
// Navegación por Pestañas (En Vivo vs Historial)
// ----------------------------------------------------------------------------
tabBtnLive.addEventListener('click', () => switchTab('live'));
tabBtnHistory.addEventListener('click', () => {
  switchTab('history');
  loadTripsHistory();
});

function switchTab(tab) {
  if (tab === 'live') {
    tabBtnLive.classList.add('active');
    tabBtnHistory.classList.remove('active');
    sectionLiveView.classList.remove('hidden');
    sectionHistoryView.classList.add('hidden');
    if (map) {
      setTimeout(() => map.invalidateSize(), 150);
    }
  } else {
    tabBtnHistory.classList.add('active');
    tabBtnLive.classList.remove('active');
    sectionHistoryView.classList.remove('hidden');
    sectionLiveView.classList.add('hidden');
    if (map) {
      setTimeout(() => map.invalidateSize(), 150);
    }
  }
}

window.addEventListener('resize', () => {
  if (map) map.invalidateSize();
});

// ----------------------------------------------------------------------------
// Inicialización del Mapa Leaflet
// ----------------------------------------------------------------------------
function initMap() {
  if (map) return;

  const initialLat = points.length > 0 ? points[points.length - 1].latitude : 19.4326;
  const initialLng = points.length > 0 ? points[points.length - 1].longitude : -99.1332;
  const initialZoom = points.length > 0 ? 15 : 4;

  map = L.map('tripMap', {
    zoomControl: true,
    attributionControl: false
  }).setView([initialLat, initialLng], initialZoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  routePolyline = L.polyline([], {
    color: '#38bdf8',
    weight: 5,
    opacity: 0.9,
    lineJoin: 'round'
  }).addTo(map);

  roadSnapPolyline = L.polyline([], {
    color: '#10b981', // Verde esmeralda para el trazo por calles
    weight: 6,
    opacity: 0.95,
    lineJoin: 'round',
    dashArray: null
  }).addTo(map);

  stopsLayerGroup = L.layerGroup().addTo(map);
  tripPointsLayerGroup = L.layerGroup().addTo(map);
  redrawActiveMapData();
}

function redrawActiveMapData() {
  if (!map) return;

  if (points.length > 0) {
    const latLngs = points.map(p => [p.latitude, p.longitude]);
    routePolyline.setLatLngs(latLngs);
    map.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });
    mapStatusText.textContent = `${points.length} puntos en vivo`;
  }

  if (stopsLayerGroup) stopsLayerGroup.clearLayers();
  stops.forEach(s => addStopMarkerToMap(s));
  renderStopsList();
}

function updateMapWithPosition(lat, lng, accuracy) {
  if (!map) return;

  const latLng = [lat, lng];
  routePolyline.addLatLng(latLng);

  if (!currentPositionMarker) {
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

  const stopIcon = L.divIcon({
    className: 'stop-pin-marker',
    html: `<div class="stop-pin" style="background:#f59e0b; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #ffffff; box-shadow:0 0 10px rgba(245,158,11,0.8);"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -25]
  });

  const timeStr = new Date(stopRecord.timestamp).toLocaleTimeString();
  const marker = L.marker([stopRecord.latitude, stopRecord.longitude], { icon: stopIcon })
    .bindPopup(`
      <div style="font-family: sans-serif; color: #0f172a;">
        <strong style="font-size: 0.95rem;"> ${escapeHtml(stopRecord.note)}</strong>
        <p style="margin: 4px 0 0; font-size: 0.8rem; color: #64748b;">Hora: ${timeStr}</p>
        <p style="margin: 2px 0 0; font-size: 0.75rem; color: #94a3b8;">${stopRecord.latitude.toFixed(5)}, ${stopRecord.longitude.toFixed(5)}</p>
      </div>
    `);

  stopsLayerGroup.addLayer(marker);
}

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
  const R = 6371;
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
    deviceId: deviceId,
    tripId: currentTripId
  };

  stops.push(stopRecord);
  saveActiveTripToLocalStorage();

  addStopMarkerToMap(stopRecord);
  renderStopsList();
  valStopsCount.textContent = stops.length;
  stopsTotalBadge.textContent = stops.length;

  log(` Parada guardada: "${note}" (${currentLat.toFixed(5)}, ${currentLng.toFixed(5)})`, 'log-bg');

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
        <span class="stop-item-title"> ${escapeHtml(s.note)}</span>
        <span class="stop-item-meta">${time} • ${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}</span>
      </div>
      <span class="stop-item-badge">#${idx + 1}</span>
    `;

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
      log(`️ Parada guardada en Render: ${stopRecord.note}`, 'log-sync');
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
      log(`Conectado exitosamente con Render: ${url}`, 'log-sync');
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    serverStatus.textContent = 'Sin conexión';
    serverStatus.className = 'status-indicator';
    liveTag.textContent = navigator.onLine ? 'Local Offline' : 'Sin Internet';
    liveTag.className = 'badge';
    log(`Aviso conexión Render (${url}): ${err.message}`, 'log-err');
    return false;
  }
}
btnTestServer.addEventListener('click', testServerConnection);
testServerConnection();

// ----------------------------------------------------------------------------
// Detección de Estado de Red (Online / Offline)
// ----------------------------------------------------------------------------
window.addEventListener('online', () => {
  log(' Conexión a internet restablecida.', 'log-sync');
  testServerConnection().then(online => {
    if (online) {
      syncPendingOfflineData();
    }
  });
});

window.addEventListener('offline', () => {
  liveTag.textContent = '100% Offline (GPS Activo)';
  liveTag.className = 'badge';
  serverStatus.textContent = 'Sin Internet';
  serverStatus.className = 'status-indicator';
  log(' Modo Sin Internet: El GPS satelital continuará registrando y guardando todo en el teléfono.', 'log-bg');
});

// Sincronizar viajes guardados mientras no había internet
async function syncPendingOfflineData() {
  const pendingTripsKey = 'gps_pwa_pending_trips';
  let pending = [];
  try {
    const raw = localStorage.getItem(pendingTripsKey);
    if (raw) pending = JSON.parse(raw);
  } catch (e) {}

  if (pending.length === 0) return;

  log(`️ Sincronizando ${pending.length} viajes pendientes con Render...`, 'log-sync');
  const url = serverUrlInput.value.trim();
  if (!url) return;

  const remaining = [];
  for (const trip of pending) {
    try {
      const res = await fetch(`${url}/api/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trip)
      });
      if (!res.ok) remaining.push(trip);
    } catch (e) {
      remaining.push(trip);
    }
  }

  localStorage.setItem(pendingTripsKey, JSON.stringify(remaining));
  if (remaining.length === 0) {
    log(' Todos los viajes pendientes se sincronizaron con éxito en Render.', 'log-sync');
  }
}

// ----------------------------------------------------------------------------
// Ciclo de Vida: Detección de Suspensión
// ----------------------------------------------------------------------------
document.addEventListener('visibilitychange', () => {
  const isHidden = document.hidden;
  if (isHidden) {
    wasScreenHiddenInWindow = true;
    log(' Pantalla bloqueada / Segundo plano. Audio Loop y Web Audio mantienen el proceso vivo.', 'log-bg');
  } else {
    log('️ PWA restaurada a primer plano.', 'log-system');
    if (isTracking && useWakeLockCheckbox.checked) {
      requestScreenWakeLock();
    }
    if (map) {
      setTimeout(() => map.invalidateSize(), 300);
    }
  }
});

// Screen Wake Lock API
async function requestScreenWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      log(' Screen Wake Lock ACTIVO.', 'log-system');
      wakeLockSentinel.addEventListener('release', () => {
        log(' Screen Wake Lock liberado.', 'log-system');
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
// AUDIO LOOP HACK & WEB AUDIO ENGINE (Motor de Segundo Plano Indestructible)
// ----------------------------------------------------------------------------
function startAudioLoopHack() {
  // 1. Iniciar HTML5 Audio silencioso
  if (bgAudio) {
    bgAudio.volume = 0.05;
    bgAudio.play().then(() => {
      log(' Audio Loop HTML5 iniciado.', 'log-bg');
    }).catch((err) => {
      console.warn('Aviso Audio HTML5:', err.message);
    });
  }

  // 2. Iniciar Web Audio API sintetizado continuo (inaudible a 25Hz con ganancia mínima)
  // Esto mantiene el hilo de audio del SO despierto permanentemente aunque se apague la pantalla
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      if (!audioOscillator) {
        audioOscillator = audioCtx.createOscillator();
        audioGain = audioCtx.createGain();

        audioOscillator.type = 'sine';
        audioOscillator.frequency.setValueAtTime(25, audioCtx.currentTime); // 25Hz: inaudible para el oído humano
        audioGain.gain.setValueAtTime(0.001, audioCtx.currentTime); // Amplitud casi nula

        audioOscillator.connect(audioGain);
        audioGain.connect(audioCtx.destination);
        audioOscillator.start();
        log(' Motor Web Audio API activo: el hilo de ejecución no se suspenderá.', 'log-bg');
      }
    }
  } catch (err) {
    console.warn('Web Audio API no soportado:', err);
  }

  // 3. Registrar MediaSession para que el SO muestre controles multimedia en pantalla de bloqueo
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTripName || 'GPS Tracker - Grabando Viaje',
      artist: 'Rastreo continuo cada 20s (Segundo plano activo)',
      album: 'Mapi GPS Engine'
    });
    navigator.mediaSession.playbackState = 'playing';
    navigator.mediaSession.setActionHandler('pause', () => pauseTracking());
    navigator.mediaSession.setActionHandler('play', () => startTracking());
  }

  // 4. Iniciar Heartbeat de consulta activa cada 10s
  startHeartbeatLoop();
}

function stopAudioLoopHack() {
  if (bgAudio) {
    bgAudio.pause();
    bgAudio.currentTime = 0;
  }
  try {
    if (audioOscillator) {
      audioOscillator.stop();
      audioOscillator.disconnect();
      audioOscillator = null;
    }
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close();
      audioCtx = null;
    }
  } catch (e) {}

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'paused';
  }

  stopHeartbeatLoop();
}

// Heartbeat activo: llama a getCurrentPosition periódicamente incluso con pantalla apagada
function triggerGpsHeartbeat() {
  if (!isTracking) return;

  const now = Date.now();
  const targetIntervalMs = (parseInt(intervalSelect.value, 10) || 20) * 1000;

  if (now - lastCommittedTime >= targetIntervalMs) {
    if (bestCandidateInWindow) {
      commitPosition(bestCandidateInWindow);
      lastCommittedTime = now;
      bestCandidateInWindow = null;
    } else {
      navigator.geolocation.getCurrentPosition(
        handleIncomingPosition,
        (err) => console.warn('Heartbeat GPS fix error:', err.message),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 9000 }
      );
    }
  }
}

function startHeartbeatLoop() {
  stopHeartbeatLoop();
  // Pulso cada 5 segundos para evaluar si la ventana de 20s se cumplió
  heartbeatTimer = setInterval(triggerGpsHeartbeat, 5000);
}

function stopHeartbeatLoop() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// Respaldo de audio timeupdate (se dispara unas 4 veces por segundo mientras el audio corre)
bgAudio.addEventListener('timeupdate', () => {
  if (!isTracking) return;
  triggerGpsHeartbeat();
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

  if (!isHidden && !isViewingHistoricalTrip) {
    valSpeed.textContent = `${speed} km/h`;
    lastCoordText.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    const quality = evaluateGpsQuality(accuracy);
    gpsQualityText.textContent = quality.text;
    gpsQualityText.className = quality.className;

    updateMapWithPosition(lat, lng, accuracy);
  }

  // No se descarta ningún punto: se registra el 100% de ubicaciones recibidas
  const now = Date.now();
  const targetIntervalMs = (parseInt(intervalSelect.value, 10) || 20) * 1000;
  const currentHidden = isHidden || wasScreenHiddenInWindow;

  if (!bestCandidateInWindow || (accuracy && accuracy < (bestCandidateInWindow.accuracy || 999))) {
    bestCandidateInWindow = {
      latitude: lat,
      longitude: lng,
      accuracy: accuracy,
      speed: speed,
      timestamp: new Date().toISOString(),
      isBackground: currentHidden,
      tripId: currentTripId
    };
  } else if (currentHidden && !bestCandidateInWindow.isBackground) {
    // Si la pantalla estuvo apagada durante esta ventana, mantener la marca de segundo plano
    bestCandidateInWindow.isBackground = true;
  }

  if (now - lastCommittedTime >= targetIntervalMs) {
    commitPosition(bestCandidateInWindow || {
      latitude: lat,
      longitude: lng,
      accuracy: accuracy,
      speed: speed,
      timestamp: new Date().toISOString(),
      isBackground: currentHidden,
      tripId: currentTripId
    });

    lastCommittedTime = now;
    bestCandidateInWindow = null;
    wasScreenHiddenInWindow = document.hidden;
  }
}

function commitPosition(record) {
  if (record.isBackground) {
    backgroundPointsCount++;
  }

  if (points.length > 0) {
    const prev = points[points.length - 1];
    const addedKm = calculateDistanceBetweenKm(prev.latitude, prev.longitude, record.latitude, record.longitude);
    if (addedKm < 0.8) {
      totalDistanceKm += addedKm;

      // Si el chip GPS no entrega velocidad instantánea, calcularla por desplazamiento (distancia / tiempo)
      if (!record.speed || record.speed === 0) {
        const timeDiffSec = (new Date(record.timestamp) - new Date(prev.timestamp)) / 1000;
        if (timeDiffSec > 0) {
          const speedKmh = Math.round((addedKm / timeDiffSec) * 3600);
          if (speedKmh < 180) {
            record.speed = speedKmh;
            if (!document.hidden && !isViewingHistoricalTrip) {
              valSpeed.textContent = `${speedKmh} km/h`;
            }
          }
        }
      }
    }
  }

  points.push(record);
  saveActiveTripToLocalStorage();

  updateStatsUI();
  pocketPoints.textContent = points.length;
  pocketDistance.textContent = totalDistanceKm.toFixed(2);

  if (!isViewingHistoricalTrip && map && routePolyline) {
    routePolyline.addLatLng([record.latitude, record.longitude]);
  }

  const bgTag = record.isBackground ? ' [EN SEGUNDO PLANO / BLOQUEADO]' : '';
  log(` Punto guardado (20s): ${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)} (±${record.accuracy}m)${bgTag}`, 
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
        ...record,
        deviceId: deviceId,
        tripId: currentTripId
      })
    });
    if (res.ok) {
      log(`️ Punto enviado a Render`, 'log-sync');
    }
  } catch (err) {
    console.warn('Error enviando a Render:', err);
  }
}

function updateStatsUI() {
  pointsCount.textContent = points.length;
  valDistance.textContent = `${totalDistanceKm.toFixed(2)} km`;
}

function saveActiveTripToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_ACTIVE_POINTS_KEY, JSON.stringify(points.slice(-1000)));
    localStorage.setItem(STORAGE_ACTIVE_STOPS_KEY, JSON.stringify(stops));
    localStorage.setItem(STORAGE_ACTIVE_TRIP_KEY, JSON.stringify({
      id: currentTripId,
      name: currentTripName,
      startTime: currentTripStartTime,
      distanceKm: totalDistanceKm
    }));
  } catch (e) {}
}

// ----------------------------------------------------------------------------
// Temporizadores
// ----------------------------------------------------------------------------
function startTimers() {
  stopTimers();

  countdownTimer = setInterval(() => {
    if (!isTracking) return;
    const intervalSec = parseInt(intervalSelect.value, 10) || 20;
    const elapsedMs = Date.now() - lastCommittedTime;
    const remainingSec = Math.max(0, Math.ceil((intervalSec * 1000 - elapsedMs) / 1000));
    nextCaptureCountdown.textContent = `${remainingSec}s`;
  }, 500);

  tripDurationTimer = setInterval(() => {
    if (!isTracking || !currentTripStartTime) return;
    const diffMs = Date.now() - currentTripStartTime;
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
// Iniciar, Pausar y Finalizar Viaje
// ----------------------------------------------------------------------------
function startTracking() {
  if (!navigator.geolocation) {
    alert('Geolocalización no soportada en este navegador.');
    return;
  }

  // Si estábamos inspeccionando un viaje del pasado, volver a en vivo
  if (isViewingHistoricalTrip) {
    exitHistoricalTripView();
  }

  isTracking = true;

  if (!currentTripId) {
    currentTripId = 'trip-' + Date.now();
    currentTripStartTime = Date.now();
    const dateStr = new Date().toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    currentTripName = `Viaje ${dateStr}`;
  }

  btnStart.disabled = true;
  btnStop.disabled = false;
  btnOpenStopModal.disabled = false;
  btnEnterPocket.disabled = false;
  intervalSelect.disabled = true;
  pulseIndicator.classList.add('active');

  lastCommittedTime = 0;
  bestCandidateInWindow = null;
  startTimers();

  if (useAudioHackCheckbox.checked) {
    startAudioLoopHack();
  }

  if (useWakeLockCheckbox.checked) {
    requestScreenWakeLock();
  }

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
  log(` Viaje iniciado: "${currentTripName}". Intervalo: ${sec}s | 100% de puntos registrados (sin descartes)`, 'log-system');
  log(` Pantalla bloqueable: el viaje continuará grabándose con Audio Loop.`, 'log-bg');
}

function pauseTracking() {
  isTracking = false;
  btnStart.disabled = false;
  btnStop.disabled = false;
  pulseIndicator.classList.remove('active');

  stopTimers();
  if (watcherId !== null) {
    navigator.geolocation.clearWatch(watcherId);
    watcherId = null;
  }
  stopAudioLoopHack();
  releaseScreenWakeLock();
  log('Rastreo pausado.', 'log-system');
}

// Botón Finalizar: abre modal para nombrar y guardar viaje
btnStop.addEventListener('click', () => {
  pauseTracking();
  modalTripDist.textContent = `${totalDistanceKm.toFixed(2)} km`;
  modalTripStops.textContent = stops.length;
  tripNameInput.value = currentTripName || `Viaje ${new Date().toLocaleDateString()}`;
  finishTripModal.classList.remove('hidden');
  tripNameInput.focus();
});

btnCancelFinish.addEventListener('click', () => {
  finishTripModal.classList.add('hidden');
});

btnConfirmFinish.addEventListener('click', async () => {
  finishTripModal.classList.add('hidden');
  const finalName = tripNameInput.value.trim() || currentTripName || `Viaje ${new Date().toLocaleDateString()}`;

  const finishedTrip = {
    id: currentTripId,
    name: finalName,
    startTime: new Date(currentTripStartTime || Date.now()).toISOString(),
    endTime: new Date().toISOString(),
    distanceKm: Number(totalDistanceKm.toFixed(2)),
    pointsCount: points.length,
    stopsCount: stops.length,
    points: [...points],
    stops: [...stops],
    deviceId: deviceId
  };

  // Guardar en el historial local
  tripsHistory.unshift(finishedTrip);
  try {
    localStorage.setItem(STORAGE_TRIPS_HISTORY_KEY, JSON.stringify(tripsHistory.slice(0, 50)));
  } catch (e) {}

  // Sincronizar con el backend en Render
  if (syncWithServerCheckbox.checked) {
    await saveTripToServer(finishedTrip);
  }

  log(` Viaje finalizado y guardado: "${finalName}" (${finishedTrip.distanceKm} km, ${finishedTrip.stopsCount} paradas)`, 'log-sync');

  // Limpiar viaje activo para poder iniciar uno nuevo
  resetActiveTripState();
  updateHistoryBadge();

  // Cambiar a la pestaña de historial para ver el viaje guardado
  switchTab('history');
  loadTripsHistory();
});

async function saveTripToServer(trip) {
  const url = serverUrlInput.value.trim();
  if (!url || !navigator.onLine) {
    queuePendingTrip(trip);
    return;
  }

  try {
    const res = await fetch(`${url}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trip),
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      log(`️ Viaje respaldado con éxito en Render`, 'log-sync');
    } else {
      queuePendingTrip(trip);
    }
  } catch (err) {
    queuePendingTrip(trip);
  }
}

function queuePendingTrip(trip) {
  try {
    const pendingTripsKey = 'gps_pwa_pending_trips';
    const raw = localStorage.getItem(pendingTripsKey);
    const pending = raw ? JSON.parse(raw) : [];
    if (!pending.some(t => t.id === trip.id)) {
      pending.push(trip);
      localStorage.setItem(pendingTripsKey, JSON.stringify(pending));
      log(` Viaje guardado localmente (se subirá a Render al recuperar internet)`, 'log-system');
    }
  } catch (e) {}
}

function resetActiveTripState() {
  currentTripId = null;
  currentTripName = '';
  currentTripStartTime = null;
  points = [];
  stops = [];
  totalDistanceKm = 0;
  backgroundPointsCount = 0;
  bestCandidateInWindow = null;
  wasScreenHiddenInWindow = false;
  lastCommittedTime = 0;
  currentLat = null;
  currentLng = null;

  localStorage.removeItem(STORAGE_ACTIVE_POINTS_KEY);
  localStorage.removeItem(STORAGE_ACTIVE_STOPS_KEY);
  localStorage.removeItem(STORAGE_ACTIVE_TRIP_KEY);

  valDistance.textContent = '0.00 km';
  valDuration.textContent = '00:00:00';
  valSpeed.textContent = '0 km/h';
  valStopsCount.textContent = '0';
  stopsTotalBadge.textContent = '0';
  pointsCount.textContent = '0';
  lastCoordText.textContent = '--.------, --.------';

  btnStart.disabled = false;
  btnStop.disabled = true;
  btnOpenStopModal.disabled = true;
  btnEnterPocket.disabled = true;
  intervalSelect.disabled = false;

  if (routePolyline) routePolyline.setLatLngs([]);
  if (roadSnapPolyline) roadSnapPolyline.setLatLngs([]);
  if (roadSnapBadge) roadSnapBadge.classList.add('hidden');
  if (stopsLayerGroup) stopsLayerGroup.clearLayers();
  if (currentPositionMarker && map) {
    map.removeLayer(currentPositionMarker);
    currentPositionMarker = null;
  }
  if (accuracyCircle && map) {
    map.removeLayer(accuracyCircle);
    accuracyCircle = null;
  }

  renderStopsList();
}

btnStart.addEventListener('click', startTracking);

// ----------------------------------------------------------------------------
// Historial de Viajes (Cargar, Ver en Mapa, Exportar, Eliminar)
// ----------------------------------------------------------------------------
function updateHistoryBadge() {
  tabHistoryCount.textContent = tripsHistory.length;
}

async function loadTripsHistory() {
  tripsContainer.innerHTML = '<p class="empty-text">Cargando viajes...</p>';

  // Cargar desde localStorage primero
  try {
    const saved = localStorage.getItem(STORAGE_TRIPS_HISTORY_KEY);
    if (saved) {
      tripsHistory = JSON.parse(saved);
    }
  } catch (e) {
    tripsHistory = [];
  }

  // Si no hay viajes en localStorage, cargar viaje de demostración inicial
  if (!tripsHistory || tripsHistory.length === 0) {
    try {
      const demoRes = await fetch('./demo-trips.json');
      if (demoRes.ok) {
        const demoData = await demoRes.json();
        if (Array.isArray(demoData) && demoData.length > 0) {
          tripsHistory = demoData;
          localStorage.setItem(STORAGE_TRIPS_HISTORY_KEY, JSON.stringify(tripsHistory));
        }
      }
    } catch (e) {}
  }

  // Intentar sincronizar con Render / Servidor si hay conexión
  const url = serverUrlInput.value.trim();
  if (syncWithServerCheckbox.checked) {
    try {
      const fetchUrl = url ? `${url}/api/trips` : '/api/trips';
      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (data.trips && Array.isArray(data.trips)) {
          // Unir viajes del servidor sin duplicados
          const existingIds = new Set(tripsHistory.map(t => t.id));
          data.trips.forEach(serverTrip => {
            if (!existingIds.has(serverTrip.id)) {
              tripsHistory.push(serverTrip);
            }
          });
          // Ordenar por fecha descendente
          tripsHistory.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
          localStorage.setItem(STORAGE_TRIPS_HISTORY_KEY, JSON.stringify(tripsHistory.slice(0, 50)));
        }
      }
    } catch (e) {
      console.warn('No se pudo sincronizar historial con Render:', e);
    }
  }

  updateHistoryBadge();
  renderTripsList();
}

btnRefreshTrips.addEventListener('click', loadTripsHistory);

function renderTripsList() {
  tripsContainer.innerHTML = '';

  if (tripsHistory.length === 0) {
    tripsContainer.innerHTML = '<p class="empty-text">Aún no tienes viajes guardados. Inicia un viaje y al finalizar se guardará aquí.</p>';
    return;
  }

  tripsHistory.forEach(trip => {
    const card = document.createElement('div');
    card.className = 'trip-card';

    const startDate = new Date(trip.startTime);
    const dateFormatted = startDate.toLocaleDateString('es', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const dist = trip.distanceKm ? Number(trip.distanceKm).toFixed(2) : '0.00';
    const pts = trip.pointsCount || (trip.points && trip.points.length) || 0;
    const stps = trip.stopsCount || (trip.stops && trip.stops.length) || 0;

    card.innerHTML = `
      <div class="trip-card-header">
        <div>
          <h3 class="trip-card-title">${escapeHtml(trip.name || 'Viaje Sin Título')}</h3>
          <span class="trip-card-date">
            <svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            ${dateFormatted}
          </span>
        </div>
      </div>
      <div class="trip-card-badges">
        <span class="trip-stat-badge">
          <svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="19" r="3"></circle><path d="M9 19h8.5a4.5 4.5 0 0 0 4.5-4.5v0a4.5 4.5 0 0 0-4.5-4.5H11"></path><polyline points="14 7 11 10 14 13"></polyline></svg>
          <strong>${dist} km</strong>
        </span>
        <span class="trip-stat-badge">
          <svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <strong>${stps} paradas</strong>
        </span>
        <span class="trip-stat-badge">
          <svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49"></path></svg>
          <strong>${pts} puntos</strong>
        </span>
      </div>
      <div class="trip-card-actions">
        <button class="btn btn-primary btn-sm btn-view-trip" data-id="${trip.id}">
          <svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>
          Ver en Mapa
        </button>
        <button class="btn btn-outline btn-sm btn-export-trip" data-id="${trip.id}" title="Descargar viaje">
          <svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Descargar
        </button>
        <button class="btn btn-outline-danger btn-sm btn-delete-trip" data-id="${trip.id}" title="Eliminar viaje">
          <svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    // Eventos de la tarjeta
    card.querySelector('.btn-view-trip').addEventListener('click', () => viewTripOnMap(trip.id));
    card.querySelector('.btn-export-trip').addEventListener('click', () => exportSingleTrip(trip.id));
    card.querySelector('.btn-delete-trip').addEventListener('click', () => deleteTrip(trip.id));

    tripsContainer.appendChild(card);
  });
}

// ----------------------------------------------------------------------------
// Ver Viaje Guardado en el Mapa
// ----------------------------------------------------------------------------
async function viewTripOnMap(tripId) {
  let trip = tripsHistory.find(t => t.id === tripId);

  // Si los puntos detallados no están en memoria local, descargarlos del servidor o del demo
  if (!trip || !trip.points || trip.points.length === 0) {
    const url = serverUrlInput.value.trim();
    const fetchUrl = url ? `${url}/api/trips/${tripId}` : `/api/trips/${tripId}`;
    try {
      log(`Descargando datos completos del viaje ${tripId}...`, 'log-system');
      const res = await fetch(fetchUrl);
      if (res.ok) {
        trip = await res.json();
      }
    } catch (e) {
      console.warn(e);
    }

    // Si aún no tiene puntos, buscar en demo-trips.json
    if (!trip || !trip.points || trip.points.length === 0) {
      try {
        const demoRes = await fetch('./demo-trips.json');
        if (demoRes.ok) {
          const demoTrips = await demoRes.json();
          const found = demoTrips.find(t => t.id === tripId);
          if (found && found.points) trip = found;
        }
      } catch (e) {}
    }

    if (trip && trip.points) {
      const idx = tripsHistory.findIndex(t => t.id === tripId);
      if (idx !== -1) tripsHistory[idx] = trip;
      localStorage.setItem(STORAGE_TRIPS_HISTORY_KEY, JSON.stringify(tripsHistory.slice(0, 50)));
    }
  }

  if (!trip || !trip.points || trip.points.length === 0) {
    alert('Este viaje no contiene puntos de coordenadas registrados.');
    return;
  }

  currentlyViewedTrip = trip;
  isSnappedToRoads = false;
  btnSnapToRoads.textContent = '️ Ajustar a Calles';
  btnSnapToRoads.classList.remove('active');
  btnSnapToRoads.disabled = false;
  roadSnapBadge.classList.add('hidden');
  if (roadSnapPolyline) roadSnapPolyline.setLatLngs([]);

  // Cambiar a la pestaña del mapa
  switchTab('live');

  // Mostrar banner de inspección
  viewingTripTitle.textContent = `${trip.name} (${trip.distanceKm} km, ${trip.stopsCount || 0} paradas)`;
  viewingTripBanner.classList.remove('hidden');
  mapHeading.textContent = `Viendo: ${trip.name}`;

  // Actualizar métricas visuales con las del viaje histórico
  valDistance.textContent = `${(trip.distanceKm || 0).toFixed(2)} km`;
  valStopsCount.textContent = trip.stops ? trip.stops.length : 0;
  pointsCount.textContent = trip.points.length;
  valSpeed.textContent = '-- km/h';

  // Pintar recorrido original en mapa
  if (routePolyline) {
    const latLngs = trip.points.map(p => [p.latitude, p.longitude]);
    routePolyline.setLatLngs(latLngs);
    routePolyline.setStyle({ color: '#a855f7', weight: 5, opacity: 0.9 }); // Color morado para viajes históricos
    map.fitBounds(routePolyline.getBounds(), { padding: [35, 35] });
  }

  // Pintar CADA PUNTO de ubicación individualmente a lo largo de la ruta (cada 20s)
  if (tripPointsLayerGroup) {
    tripPointsLayerGroup.clearLayers();
    trip.points.forEach((p, idx) => {
      const timeStr = new Date(p.timestamp).toLocaleTimeString();
      const isFirst = (idx === 0);
      const isLast = (idx === trip.points.length - 1 && trip.points.length > 1);

      if (isFirst) {
        const startIcon = L.divIcon({
          className: 'point-start-marker',
          html: '<div style="background:#22c55e; color:white; font-size:12px; font-weight:bold; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 0 8px rgba(34,197,94,0.7);">A</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        L.marker([p.latitude, p.longitude], { icon: startIcon })
          .bindPopup(`
            <div style="font-family: sans-serif; color: #0f172a; font-size: 0.85rem;">
              <strong style="color: #16a34a;"> Punto de Inicio (A)</strong><br>
              <span>Hora: ${timeStr}</span><br>
              <span style="font-size:0.75rem; color:#64748b;">${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}</span>
            </div>
          `)
          .addTo(tripPointsLayerGroup);
      } else if (isLast) {
        const endIcon = L.divIcon({
          className: 'point-end-marker',
          html: '<div style="background:#ef4444; color:white; font-size:12px; font-weight:bold; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 0 8px rgba(239,68,68,0.7);">B</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        L.marker([p.latitude, p.longitude], { icon: endIcon })
          .bindPopup(`
            <div style="font-family: sans-serif; color: #0f172a; font-size: 0.85rem;">
              <strong style="color: #dc2626;"> Punto Final (B)</strong><br>
              <span>Hora: ${timeStr}</span><br>
              <span style="font-size:0.75rem; color:#64748b;">${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}</span>
            </div>
          `)
          .addTo(tripPointsLayerGroup);
      } else {
        // Círculo interactivo para cada punto de 20s
        // Morado/Violeta brillante para puntos en segundo plano/bloqueado, Azul/Cyan para pantalla encendida
        const markerBorderColor = p.isBackground ? '#a855f7' : '#0284c7';
        const markerFillColor = p.isBackground ? '#ec4899' : '#38bdf8';
        const pointMarker = L.circleMarker([p.latitude, p.longitude], {
          radius: p.isBackground ? 6 : 5,
          color: markerBorderColor,
          fillColor: markerFillColor,
          fillOpacity: 0.95,
          weight: 2
        });

        const bgStatus = p.isBackground 
          ? '<span style="color:#9333ea; font-weight:bold;"> Pantalla Bloqueada (Segundo Plano)</span>' 
          : '<span style="color:#0284c7; font-weight:bold;">️ Pantalla Encendida</span>';
        pointMarker.bindPopup(`
          <div style="font-family: sans-serif; color: #0f172a; font-size: 0.85rem;">
            <strong>Punto #${idx + 1}</strong> — ${bgStatus}<br>
            <span>Hora: ${timeStr}</span><br>
            <span>Velocidad: ${p.speed || 0} km/h</span><br>
            <span>Precisión: ±${p.accuracy || 0} m</span><br>
            <span style="font-size:0.75rem; color:#64748b;">${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}</span>
          </div>
        `);
        pointMarker.addTo(tripPointsLayerGroup);
      }
    });
  }

  // Pintar paradas del viaje histórico
  if (stopsLayerGroup) {
    stopsLayerGroup.clearLayers();
    if (trip.stops && trip.stops.length > 0) {
      trip.stops.forEach(s => addStopMarkerToMap(s));
    }
  }

  // Mostrar paradas en la lista inferior
  stopsList.innerHTML = '';
  stopsTotalBadge.textContent = trip.stops ? trip.stops.length : 0;
  if (trip.stops && trip.stops.length > 0) {
    trip.stops.forEach((s, idx) => {
      const item = document.createElement('div');
      item.className = 'stop-item';
      const time = new Date(s.timestamp).toLocaleTimeString();
      item.innerHTML = `
        <div class="stop-item-info">
          <span class="stop-item-title"> ${escapeHtml(s.note)}</span>
          <span class="stop-item-meta">${time} • ${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}</span>
        </div>
        <span class="stop-item-badge">#${idx + 1}</span>
      `;
      item.addEventListener('click', () => {
        if (map) map.setView([s.latitude, s.longitude], 17);
      });
      stopsList.appendChild(item);
    });
  } else {
    stopsList.innerHTML = '<p class="empty-text">No se registraron paradas en este viaje.</p>';
  }

  log(` Mostrando en mapa el viaje guardado con sus puntos: "${trip.name}"`, 'log-system');
}

// ----------------------------------------------------------------------------
// SNAP-TO-ROADS CON OSRM (Ajuste de Trayectoria a Calles Reales)
// ----------------------------------------------------------------------------
btnSnapToRoads.addEventListener('click', async () => {
  if (!currentlyViewedTrip || !currentlyViewedTrip.points || currentlyViewedTrip.points.length < 2) {
    alert('Se necesitan al menos 2 puntos registrados para ajustar a las calles.');
    return;
  }

  // Si ya está activo el trazo por calles, permitir volver a la vista original recta
  if (isSnappedToRoads) {
    isSnappedToRoads = false;
    if (roadSnapPolyline) roadSnapPolyline.setLatLngs([]);
    if (routePolyline) {
      const latLngs = currentlyViewedTrip.points.map(p => [p.latitude, p.longitude]);
      routePolyline.setLatLngs(latLngs);
      routePolyline.setStyle({ color: '#a855f7', weight: 5, opacity: 0.9 });
    }
    btnSnapToRoads.textContent = '️ Ajustar a Calles';
    btnSnapToRoads.classList.remove('active');
    roadSnapBadge.classList.add('hidden');
    log('Trazo restaurado a puntos GPS directos.', 'log-system');
    return;
  }

  // Iniciar cálculo con OSRM
  btnSnapToRoads.disabled = true;
  btnSnapToRoads.textContent = '⏳ Trazando calles...';
  log('️ Consultando servicio de cartografía vial (OSRM / OpenStreetMap)...', 'log-system');

  try {
    const roadCoordinates = await fetchSnappedRoadGeometry(currentlyViewedTrip.points);
    if (roadCoordinates && roadCoordinates.length > 0) {
      isSnappedToRoads = true;
      if (roadSnapPolyline) {
        roadSnapPolyline.setLatLngs(roadCoordinates);
      }
      // Atenuar línea recta de fondo para destacar la ruta por las calles
      if (routePolyline) {
        routePolyline.setStyle({ color: '#c084fc', weight: 2, opacity: 0.4 });
      }

      btnSnapToRoads.textContent = ' Ver Líneas Directas';
      btnSnapToRoads.classList.add('active');
      roadSnapBadge.classList.remove('hidden');
      map.fitBounds(roadSnapPolyline.getBounds(), { padding: [35, 35] });
      log(` Trazo adherido a calles con éxito: ${roadCoordinates.length} segmentos viales calculados.`, 'log-sync');
    } else {
      throw new Error('No se pudo encontrar una vía vehicular cercana para este trayecto.');
    }
  } catch (err) {
    log(`️ No se pudo ajustar a calles: ${err.message}`, 'log-err');
    alert(`No fue posible ajustar el trazo a las calles:\n${err.message}\n(Se mantiene el trazo GPS directo).`);
  } finally {
    btnSnapToRoads.disabled = false;
  }
});

// Algoritmo de consulta a OSRM (Map Matching / Routing) por lotes de waypoints
// Algoritmo de consulta a OSRM (Map Matching / Routing) por lotes de waypoints optimizado
async function fetchSnappedRoadGeometry(gpsPoints) {
  if (!navigator.onLine) {
    throw new Error('Se requiere conexión a internet para consultar la cartografía de calles.');
  }

  // Filtrar micro-ruido estático mientras el vehículo está detenido (< 8 metros)
  const sampledPoints = [];
  gpsPoints.forEach(pt => {
    if (sampledPoints.length === 0) {
      sampledPoints.push(pt);
    } else {
      const last = sampledPoints[sampledPoints.length - 1];
      const dist = calculateDistanceBetweenKm(last.latitude, last.longitude, pt.latitude, pt.longitude);
      // Mantener puntos con separación mínima de 8 metros o cambios significativos
      if (dist >= 0.008 || (pt.speed > 0 && last.speed === 0)) {
        sampledPoints.push(pt);
      }
    }
  });

  // Asegurar siempre incluir el primer y último punto exactos
  if (sampledPoints[0] !== gpsPoints[0]) sampledPoints.unshift(gpsPoints[0]);
  if (sampledPoints[sampledPoints.length - 1] !== gpsPoints[gpsPoints.length - 1]) {
    sampledPoints.push(gpsPoints[gpsPoints.length - 1]);
  }

  const targetPoints = sampledPoints.length >= 2 ? sampledPoints : gpsPoints;

  // El servidor público de OSRM limita match a un máximo de 10 waypoints por petición.
  // Usamos chunks de 8 puntos con solapamiento de 1 punto para costura perfecta.
  const CHUNK_SIZE = 8;
  const fullGeometry = [];

  for (let i = 0; i < targetPoints.length - 1; i += (CHUNK_SIZE - 1)) {
    const chunk = targetPoints.slice(i, i + CHUNK_SIZE);
    if (chunk.length < 2) break;

    // 1. Intentar con Map Matching usando radios de búsqueda dinámicos y timestamps reales
    let chunkCoords = await requestOsrmMatch(chunk);

    // 2. Si Match no halla coincidencia exacta en ese tramo, usar Routing inteligente
    if (!chunkCoords || chunkCoords.length === 0) {
      chunkCoords = await requestOsrmRoute(chunk);
    }

    if (chunkCoords && chunkCoords.length > 0) {
      // Evitar duplicar el punto de unión entre bloques consecutivos
      if (fullGeometry.length > 0 && chunkCoords.length > 0) {
        chunkCoords.shift();
      }
      fullGeometry.push(...chunkCoords);
    }
  }

  return fullGeometry;
}

// Map Matching (HMM) con radiuses adaptativos y marcas de tiempo
async function requestOsrmMatch(chunk) {
  try {
    const coordsStr = chunk.map(p => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
    const radiuses = chunk.map(p => Math.min(35, Math.max(18, Math.round((p.accuracy || 15) * 1.5)))).join(';');
    const timestamps = chunk.map(p => Math.floor(new Date(p.timestamp).getTime() / 1000)).join(';');

    const url = `https://router.project-osrm.org/match/v1/driving/${coordsStr}?overview=full&geometries=geojson&gaps=ignore&tidy=true&radiuses=${radiuses}&timestamps=${timestamps}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code === 'Ok' && data.matchings && data.matchings.length > 0) {
      const coords = [];
      data.matchings.forEach(m => {
        if (m.geometry && m.geometry.coordinates) {
          m.geometry.coordinates.forEach(c => coords.push([c[1], c[0]])); // GeoJSON [lng, lat] -> Leaflet [lat, lng]
        }
      });
      return coords;
    }
  } catch (e) {
    console.warn('OSRM Match warning:', e);
  }
  return null;
}

// Fallback de Routing fluido sin giros en U absurdos
async function requestOsrmRoute(chunk) {
  try {
    // Si el chunk tiene varios puntos, tomar inicio, punto medio y fin para trazar la vía vehicular continua
    const routeWaypoints = chunk.length <= 3 
      ? chunk 
      : [chunk[0], chunk[Math.floor(chunk.length / 2)], chunk[chunk.length - 1]];

    const coordsStr = routeWaypoints.map(p => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&continue_straight=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const routeGeom = data.routes[0].geometry;
      if (routeGeom && routeGeom.coordinates) {
        return routeGeom.coordinates.map(c => [c[1], c[0]]);
      }
    }
  } catch (e) {
    console.warn('OSRM Route warning:', e);
  }
  return null;
}

btnExitTripView.addEventListener('click', exitHistoricalTripView);

// ----------------------------------------------------------------------------
// MOTOR DE ANIMACI�N DEL RECORRIDO Y COCHECITO (SIMULADOR DE VIAJE)
// ----------------------------------------------------------------------------

function initPlaybackControls() {
  if (!btnPlayTrip) return;

  btnPlayTrip.addEventListener('click', async () => {
    if (!currentlyViewedTrip || !currentlyViewedTrip.points || currentlyViewedTrip.points.length < 2) {
      alert('Se requieren al menos 2 puntos para simular el recorrido.');
      return;
    }

    // Si a�n no se han calculado las calles con OSRM, calcularlas autom�ticamente
    if (!currentlyViewedRoadCoordinates || currentlyViewedRoadCoordinates.length === 0) {
      btnPlayTrip.disabled = true;
      btnPlayTrip.innerHTML = `
        <svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        Trazando calles...
      `;
      try {
        const roadCoords = await fetchSnappedRoadGeometry(currentlyViewedTrip.points);
        if (roadCoords && roadCoords.length > 0) {
          currentlyViewedRoadCoordinates = roadCoords;
          isSnappedToRoads = true;
          if (roadSnapPolyline) roadSnapPolyline.setLatLngs(roadCoords);
          if (routePolyline) routePolyline.setStyle({ color: '#c084fc', weight: 2, opacity: 0.3 });
          roadSnapBadge.classList.remove('hidden');
          btnSnapToRoads.textContent = 'Ver L�neas Directas';
          btnSnapToRoads.classList.add('active');
        }
      } catch (e) {
        console.warn('No se pudo ajustar a calles para la animaci�n, usando trazo directo:', e);
      } finally {
        btnPlayTrip.disabled = false;
        btnPlayTrip.innerHTML = `
          <svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Simular Recorrido
        `;
      }
    }

    startTripAnimation();
  });

  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', () => {
      if (!isAnimating) {
        startTripAnimation();
      } else if (isAnimPaused) {
        resumeTripAnimation();
      } else {
        pauseTripAnimation();
      }
    });
  }

  if (btnRestartAnim) {
    btnRestartAnim.addEventListener('click', () => {
      restartTripAnimation();
    });
  }

  if (playbackProgress) {
    playbackProgress.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      seekTripAnimation(val / 100);
    });
  }

  document.querySelectorAll('.btn-speed').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      animSpeedMultiplier = parseFloat(btn.dataset.speed) || 1;
    });
  });

  if (btnClosePlayback) {
    btnClosePlayback.addEventListener('click', () => {
      stopTripAnimation();
    });
  }
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const dLon = (lon2 - lon1) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
            Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * toDeg;
  return (brng + 360) % 360;
}

function startTripAnimation() {
  if (!currentlyViewedTrip || !currentlyViewedTrip.points) return;

  stopTripAnimation();

  // Coordenadas base: OSRM si existen, o puntos GPS directos
  animRoadCoords = (currentlyViewedRoadCoordinates && currentlyViewedRoadCoordinates.length > 0)
    ? currentlyViewedRoadCoordinates
    : currentlyViewedTrip.points.map(p => [p.latitude, p.longitude]);

  if (animRoadCoords.length < 2) return;

  // Calcular distancias acumuladas en metros
  animCumulativeDistances = [0];
  let accDist = 0;
  for (let i = 1; i < animRoadCoords.length; i++) {
    const d = calculateDistanceBetweenKm(
      animRoadCoords[i-1][0], animRoadCoords[i-1][1],
      animRoadCoords[i][0], animRoadCoords[i][1]
    ) * 1000;
    accDist += d;
    animCumulativeDistances.push(accDist);
  }
  animTotalDistanceMeters = Math.max(1, accDist);

  // Duraci�n real del viaje en segundos
  const p0Time = new Date(currentlyViewedTrip.points[0].timestamp).getTime();
  const pLastTime = new Date(currentlyViewedTrip.points[currentlyViewedTrip.points.length - 1].timestamp).getTime();
  animTotalDurationSec = Math.max(10, Math.round((pLastTime - p0Time) / 1000));

  // Hitos de telemetr�a y tiempos de tramo entre puntos consecutivos
  animMilestones = currentlyViewedTrip.points.map((p, idx) => {
    const t = new Date(p.timestamp).getTime();
    const elapsedSec = Math.round((t - p0Time) / 1000);
    const deltaSec = idx === 0 ? 0 : Math.round((t - new Date(currentlyViewedTrip.points[idx - 1].timestamp).getTime()) / 1000);
    const progressRatio = animTotalDurationSec > 0 ? (elapsedSec / animTotalDurationSec) : (idx / (currentlyViewedTrip.points.length - 1));
    return {
      index: idx,
      point: p,
      elapsedSec: elapsedSec,
      deltaSec: deltaSec,
      progressRatio: Math.min(1, Math.max(0, progressRatio))
    };
  });

  if (playbackTotalTime) playbackTotalTime.textContent = formatSec(animTotalDurationSec);
  if (playbackCurrentTime) playbackCurrentTime.textContent = '00:00';
  if (playbackProgress) playbackProgress.value = 0;
  animCurrentProgress = 0;

  // Crear polil�nea animada que se va pintando detr�s del coche
  if (animProgressPolyline) map.removeLayer(animProgressPolyline);
  animProgressPolyline = L.polyline([], {
    color: '#38bdf8',
    weight: 6,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  // Crear marcador del cochecito
  const initialBearing = calculateBearing(
    animRoadCoords[0][0], animRoadCoords[0][1],
    animRoadCoords[1][0], animRoadCoords[1][1]
  );
  
  if (animVehicleMarker) map.removeLayer(animVehicleMarker);
  animVehicleMarker = createVehicleMarker(animRoadCoords[0][0], animRoadCoords[0][1], initialBearing).addTo(map);

  if (playbackControls) playbackControls.classList.remove('hidden');
  isAnimating = true;
  isAnimPaused = false;
  if (playPauseIcon) {
    playPauseIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
  }
  animLastFrameTime = 0;

  if (chkFollowVehicle && chkFollowVehicle.checked) {
    map.setView([animRoadCoords[0][0], animRoadCoords[0][1]], 16);
  }

  log('[Simulador] Iniciando recorrido del veh�culo por el trazo...', 'log-system');
  animRafId = requestAnimationFrame(stepAnimation);
}

function pauseTripAnimation() {
  isAnimPaused = true;
  if (animRafId) cancelAnimationFrame(animRafId);
  animRafId = null;
  if (playPauseIcon) {
    playPauseIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
  }
}

function resumeTripAnimation() {
  if (!isAnimating) {
    startTripAnimation();
    return;
  }
  isAnimPaused = false;
  animLastFrameTime = 0;
  if (playPauseIcon) {
    playPauseIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
  }
  animRafId = requestAnimationFrame(stepAnimation);
}

function restartTripAnimation() {
  animCurrentProgress = 0;
  resumeTripAnimation();
}

function stopTripAnimation() {
  isAnimating = false;
  isAnimPaused = false;
  if (animRafId) cancelAnimationFrame(animRafId);
  animRafId = null;
  if (animVehicleMarker && map) {
    map.removeLayer(animVehicleMarker);
    animVehicleMarker = null;
  }
  if (animProgressPolyline && map) {
    map.removeLayer(animProgressPolyline);
    animProgressPolyline = null;
  }
  if (playbackControls) playbackControls.classList.add('hidden');
  if (playPauseIcon) {
    playPauseIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
  }
}

function seekTripAnimation(targetRatio) {
  animCurrentProgress = Math.min(1, Math.max(0, targetRatio));
  renderAnimationFrame(animCurrentProgress);
}

function stepAnimation(timestamp) {
  if (!isAnimating || isAnimPaused) return;

  if (!animLastFrameTime) animLastFrameTime = timestamp;
  const deltaMs = timestamp - animLastFrameTime;
  animLastFrameTime = timestamp;

  // Duraci�n base visual: recorrido completo en ~30s a 1x
  const visualDurationSec = Math.min(45, Math.max(20, animTotalDurationSec / 10));
  const progressInc = (deltaMs / 1000) * (animSpeedMultiplier / visualDurationSec);

  animCurrentProgress = Math.min(1, animCurrentProgress + progressInc);
  renderAnimationFrame(animCurrentProgress);

  if (animCurrentProgress >= 1) {
    pauseTripAnimation();
    if (playPauseIcon) {
      playPauseIcon.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`;
    }
    log('[Simulador] Recorrido finalizado con �xito.', 'log-sync');
    return;
  }

  animRafId = requestAnimationFrame(stepAnimation);
}

function renderAnimationFrame(progress) {
  if (!animRoadCoords || animRoadCoords.length < 2) return;

  const targetDist = progress * animTotalDistanceMeters;

  // 1. Encontrar segmento geom�trico correspondiente
  let segIdx = 0;
  for (let i = 0; i < animCumulativeDistances.length - 1; i++) {
    if (animCumulativeDistances[i] <= targetDist && targetDist <= animCumulativeDistances[i + 1]) {
      segIdx = i;
      break;
    }
  }

  const dStart = animCumulativeDistances[segIdx];
  const dEnd = animCumulativeDistances[segIdx + 1] || (dStart + 1);
  const segFraction = Math.min(1, Math.max(0, (targetDist - dStart) / (dEnd - dStart)));

  const p1 = animRoadCoords[segIdx];
  const p2 = animRoadCoords[Math.min(animRoadCoords.length - 1, segIdx + 1)];

  const curLat = p1[0] + (p2[0] - p1[0]) * segFraction;
  const curLng = p1[1] + (p2[1] - p1[1]) * segFraction;

  // 2. Calcular �ngulo de direcci�n / rumbo (bearing) hacia la siguiente curva
  const lookAheadCoord = animRoadCoords[Math.min(animRoadCoords.length - 1, segIdx + 1)];
  const bearing = calculateBearing(curLat, curLng, lookAheadCoord[0], lookAheadCoord[1]);

  // 3. Mover y rotar cochecito
  if (animVehicleMarker) {
    animVehicleMarker.setLatLng([curLat, curLng]);
    const iconBody = document.getElementById('vehicleIconBody');
    if (iconBody) {
      iconBody.style.transform = `rotate(${Math.round(bearing)}deg)`;
    }
  }

  // 4. Pintar polil�nea recorrida progresivamente
  if (animProgressPolyline) {
    const coordsUpToSeg = animRoadCoords.slice(0, segIdx + 1);
    coordsUpToSeg.push([curLat, curLng]);
    animProgressPolyline.setLatLngs(coordsUpToSeg);
  }

  // 5. Determinar tramo de punto a punto y tiempo que tard�
  let currentMilestone = animMilestones[0];
  let nextMilestone = animMilestones[1] || animMilestones[0];
  for (let m = 0; m < animMilestones.length - 1; m++) {
    if (animMilestones[m].progressRatio <= progress && progress <= animMilestones[m + 1].progressRatio) {
      currentMilestone = animMilestones[m];
      nextMilestone = animMilestones[m + 1];
      break;
    }
  }

  const segmentTimeSec = nextMilestone ? nextMilestone.deltaSec : 0;
  const currentSpeed = nextMilestone ? (nextMilestone.point.speed || 32) : 32;

  // Actualizar indicador de tiempo de tramo
  if (hudSegmentTimeText) {
    hudSegmentTimeText.textContent = `Tramo #${currentMilestone.index + 1} ? #${nextMilestone.index + 1}: +${segmentTimeSec}s`;
  }

  // Actualizar tooltip flotante sobre el coche
  const tooltipTag = document.getElementById('vehicleTooltipTag');
  if (tooltipTag) {
    tooltipTag.textContent = `${currentSpeed} km/h � +${segmentTimeSec}s`;
  }

  // Actualizar HUD
  if (hudSpeedText) hudSpeedText.textContent = `${currentSpeed} km/h`;
  if (hudDistanceText) hudDistanceText.textContent = `${(targetDist / 1000).toFixed(2)} km`;
  if (playbackCurrentTime) playbackCurrentTime.textContent = formatSec(Math.round(progress * animTotalDurationSec));
  if (playbackProgress) playbackProgress.value = (progress * 100).toFixed(1);

  // C�mara que sigue al coche
  if (chkFollowVehicle && chkFollowVehicle.checked) {
    map.panTo([curLat, curLng], { animate: false });
  }
}

function formatSec(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function createVehicleMarker(lat, lng, initialBearing = 0) {
  const icon = L.divIcon({
    className: 'custom-vehicle-div-icon',
    html: `
      <div class="vehicle-marker-wrapper">
        <div class="vehicle-halo"></div>
        <div class="vehicle-tooltip-tag" id="vehicleTooltipTag">0 km/h</div>
        <div class="vehicle-icon-svg" id="vehicleIconBody" style="transform: rotate(${initialBearing}deg)">
          <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
            <defs>
              <filter id="carGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.8"/>
              </filter>
            </defs>
            <g filter="url(#carGlow)">
              <rect x="15" y="6" width="18" height="36" rx="6" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/>
              <rect x="17" y="16" width="14" height="15" rx="3" fill="#0f172a" stroke="#38bdf8" stroke-width="1.2"/>
              <polygon points="18,16 30,16 28,12 20,12" fill="#38bdf8" fill-opacity="0.7"/>
              <polygon points="18,31 30,31 29,33 19,33" fill="#38bdf8" fill-opacity="0.7"/>
              <circle cx="17.5" cy="8" r="2.2" fill="#fef08a"/>
              <circle cx="30.5" cy="8" r="2.2" fill="#fef08a"/>
              <circle cx="17.5" cy="40" r="1.8" fill="#ef4444"/>
              <circle cx="30.5" cy="40" r="1.8" fill="#ef4444"/>
              <rect x="12" y="10" width="3" height="7" rx="1.5" fill="#000000"/>
              <rect x="33" y="10" width="3" height="7" rx="1.5" fill="#000000"/>
              <rect x="12" y="31" width="3" height="7" rx="1.5" fill="#000000"/>
              <rect x="33" y="31" width="3" height="7" rx="1.5" fill="#000000"/>
            </g>
          </svg>
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });

  return L.marker([lat, lng], { icon: icon, zIndexOffset: 2000 });
}


function exitHistoricalTripView() {
  isViewingHistoricalTrip = false;
  currentlyViewedTrip = null;
  isSnappedToRoads = false;
  currentlyViewedRoadCoordinates = null;
  stopTripAnimation();
  viewingTripBanner.classList.add('hidden');
  roadSnapBadge.classList.add('hidden');
  btnSnapToRoads.textContent = '️ Ajustar a Calles';
  btnSnapToRoads.classList.remove('active');
  mapHeading.textContent = 'Recorrido del Viaje';

  if (routePolyline) {
    routePolyline.setStyle({ color: '#38bdf8', weight: 5, opacity: 0.9 });
  }

  if (roadSnapPolyline) {
    roadSnapPolyline.setLatLngs([]);
  }

  if (tripPointsLayerGroup) {
    tripPointsLayerGroup.clearLayers();
  }

  // Restaurar datos del viaje activo o en progreso
  redrawActiveMapData();
  recalculateTotalDistance();
  renderStopsList();
  pointsCount.textContent = points.length;
}

// ----------------------------------------------------------------------------
// Exportación y Eliminación de Viaje Individual
// ----------------------------------------------------------------------------
async function exportSingleTrip(tripId) {
  let trip = tripsHistory.find(t => t.id === tripId);
  if (!trip || !trip.points) {
    const url = serverUrlInput.value.trim();
    if (url) {
      try {
        const res = await fetch(`${url}/api/trips/${tripId}`);
        if (res.ok) trip = await res.json();
      } catch (e) {}
    }
  }

  if (!trip) {
    alert('No se pudo encontrar el viaje.');
    return;
  }

  const blob = new Blob([JSON.stringify(trip, null, 2)], { type: 'application/json' });
  downloadFile(blob, `viaje_${trip.name.replace(/\s+/g, '_')}_${Date.now()}.json`);
}

async function deleteTrip(tripId) {
  if (!confirm('¿Estás seguro de que deseas eliminar este viaje del historial?')) {
    return;
  }

  tripsHistory = tripsHistory.filter(t => t.id !== tripId);
  try {
    localStorage.setItem(STORAGE_TRIPS_HISTORY_KEY, JSON.stringify(tripsHistory));
  } catch (e) {}

  updateHistoryBadge();
  renderTripsList();

  // Eliminar en Render si hay conexión
  const url = serverUrlInput.value.trim();
  if (url) {
    try {
      await fetch(`${url}/api/trips/${tripId}`, { method: 'DELETE' });
      log('Viaje eliminado también del servidor Render.', 'log-system');
    } catch (e) {}
  }
}

// ----------------------------------------------------------------------------
// Cargar Datos Previos al Iniciar
// ----------------------------------------------------------------------------
try {
  const savedActiveMeta = localStorage.getItem(STORAGE_ACTIVE_TRIP_KEY);
  if (savedActiveMeta) {
    const meta = JSON.parse(savedActiveMeta);
    currentTripId = meta.id;
    currentTripName = meta.name;
    currentTripStartTime = meta.startTime;
  }

  const savedPoints = localStorage.getItem(STORAGE_ACTIVE_POINTS_KEY);
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

  const savedStops = localStorage.getItem(STORAGE_ACTIVE_STOPS_KEY);
  if (savedStops) {
    stops = JSON.parse(savedStops);
    valStopsCount.textContent = stops.length;
    stopsTotalBadge.textContent = stops.length;
  }

  const savedHistory = localStorage.getItem(STORAGE_TRIPS_HISTORY_KEY);
  if (savedHistory) {
    tripsHistory = JSON.parse(savedHistory);
    updateHistoryBadge();
  }
} catch (e) {
  points = [];
  stops = [];
  tripsHistory = [];
}

// Inicializar el mapa y el historial tras cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderStopsList();
  initPlaybackControls();
  updateHistoryBadge();
  loadTripsHistory();
});

// Reiniciar viaje actual
btnResetCurrent.addEventListener('click', () => {
  if (confirm('¿Deseas reiniciar el viaje en curso actual?')) {
    pauseTracking();
    resetActiveTripState();
    log('Viaje actual reiniciado.', 'log-system');
  }
});

btnExportJson.addEventListener('click', () => {
  if (points.length === 0 && stops.length === 0) {
    alert('No hay datos en el viaje actual.');
    return;
  }
  const currentTripData = {
    id: currentTripId,
    name: currentTripName,
    deviceId: deviceId,
    totalDistanceKm: totalDistanceKm.toFixed(2),
    points: points,
    stops: stops
  };
  const blob = new Blob([JSON.stringify(currentTripData, null, 2)], { type: 'application/json' });
  downloadFile(blob, `viaje_actual_${Date.now()}.json`);
});

btnExportCsv.addEventListener('click', () => {
  if (points.length === 0 && stops.length === 0) {
    alert('No hay datos en el viaje actual.');
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
  downloadFile(blob, `viaje_actual_${Date.now()}.csv`);
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
