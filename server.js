const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'www')));

// Directorio de persistencia local en disco
const DATA_DIR = path.join(__dirname, 'data');
const TRIPS_FILE = path.join(DATA_DIR, 'trips.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Cargar viajes desde disco o inicializar
let trips = [];
try {
  if (fs.existsSync(TRIPS_FILE)) {
    const raw = fs.readFileSync(TRIPS_FILE, 'utf8');
    trips = JSON.parse(raw);
    console.log(`[DISK] Cargados ${trips.length} viajes desde ${TRIPS_FILE}`);
  }
} catch (err) {
  console.warn('[DISK] Error leyendo trips.json, iniciando en blanco:', err.message);
  trips = [];
}

function saveTripsToDisk() {
  try {
    fs.writeFileSync(TRIPS_FILE, JSON.stringify(trips, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DISK] Error guardando trips.json:', err.message);
  }
}

// Base de datos en memoria para telemetría instantánea
let locationHistory = [];
let stopsHistory = [];
const MAX_HISTORY = 2000;

// Healthcheck
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    activePoints: locationHistory.length,
    savedTrips: trips.length
  });
});

// ----------------------------------------------------------------------------
// API DE VIAJES (TRIPS)
// ----------------------------------------------------------------------------

// 1. Guardar o actualizar un viaje completo
app.post('/api/trips', (req, res) => {
  const { id, name, startTime, endTime, distanceKm, points, stops: tripStops, deviceId } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'El ID del viaje es obligatorio' });
  }

  const existingIndex = trips.findIndex(t => t.id === id);

  const tripRecord = {
    id: id,
    name: name || `Viaje ${new Date(startTime || Date.now()).toLocaleDateString()}`,
    startTime: startTime || new Date().toISOString(),
    endTime: endTime || new Date().toISOString(),
    distanceKm: distanceKm ? Number(Number(distanceKm).toFixed(2)) : 0,
    pointsCount: (points && points.length) || 0,
    stopsCount: (tripStops && tripStops.length) || 0,
    deviceId: deviceId || 'anon-device',
    updatedAt: new Date().toISOString(),
    points: points || [],
    stops: tripStops || []
  };

  if (existingIndex >= 0) {
    trips[existingIndex] = tripRecord;
  } else {
    trips.unshift(tripRecord); // El más reciente primero
  }

  saveTripsToDisk();
  console.log(`[TRIP] Viaje guardado: "${tripRecord.name}" con ${tripRecord.pointsCount} puntos y ${tripRecord.stopsCount} paradas (${tripRecord.distanceKm} km)`);

  res.status(201).json({
    success: true,
    trip: {
      id: tripRecord.id,
      name: tripRecord.name,
      distanceKm: tripRecord.distanceKm,
      pointsCount: tripRecord.pointsCount,
      stopsCount: tripRecord.stopsCount
    }
  });
});

// 2. Obtener lista resumida de todos los viajes (sin la carga pesada de coordenadas)
app.get('/api/trips', (req, res) => {
  const summaryList = trips.map(t => ({
    id: t.id,
    name: t.name,
    startTime: t.startTime,
    endTime: t.endTime,
    distanceKm: t.distanceKm,
    pointsCount: t.pointsCount || (t.points && t.points.length) || 0,
    stopsCount: t.stopsCount || (t.stops && t.stops.length) || 0,
    deviceId: t.deviceId,
    updatedAt: t.updatedAt
  }));

  res.json({ total: summaryList.length, trips: summaryList });
});

// 3. Obtener el viaje completo con todos sus puntos y paradas para pintarlo en el mapa
app.get('/api/trips/:id', (req, res) => {
  const trip = trips.find(t => t.id === req.params.id);
  if (!trip) {
    return res.status(404).json({ error: 'Viaje no encontrado' });
  }
  res.json(trip);
});

// 4. Eliminar un viaje
app.delete('/api/trips/:id', (req, res) => {
  const beforeCount = trips.length;
  trips = trips.filter(t => t.id !== req.params.id);
  if (trips.length < beforeCount) {
    saveTripsToDisk();
    return res.json({ success: true, message: 'Viaje eliminado' });
  }
  res.status(404).json({ error: 'Viaje no encontrado' });
});

// ----------------------------------------------------------------------------
// API DE PUNTOS Y PARADAS SUELTAS
// ----------------------------------------------------------------------------
app.post('/api/location', (req, res) => {
  const { latitude, longitude, accuracy, speed, timestamp, deviceId, isBackground, tripId } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Latitud y longitud requeridas' });
  }

  const record = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    latitude: Number(latitude),
    longitude: Number(longitude),
    accuracy: accuracy ? Number(accuracy) : null,
    speed: speed ? Number(speed) : null,
    timestamp: timestamp || new Date().toISOString(),
    deviceId: deviceId || 'anon-device',
    isBackground: Boolean(isBackground),
    tripId: tripId || null
  };

  locationHistory.unshift(record);
  if (locationHistory.length > MAX_HISTORY) locationHistory.pop();

  // Si pertenece a un viaje en curso, añadirlo
  if (tripId) {
    const activeTrip = trips.find(t => t.id === tripId);
    if (activeTrip) {
      activeTrip.points.push(record);
      activeTrip.pointsCount = activeTrip.points.length;
    }
  }

  res.status(201).json({ success: true, count: locationHistory.length, received: record });
});

app.get('/api/locations', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 100;
  res.json({ total: locationHistory.length, locations: locationHistory.slice(0, limit) });
});

app.post('/api/stop', (req, res) => {
  const { latitude, longitude, note, timestamp, deviceId, tripId } = req.body;
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Latitud y longitud son requeridas' });
  }

  const stopRecord = {
    id: 'stop-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    latitude: Number(latitude),
    longitude: Number(longitude),
    note: note || 'Parada registrada',
    timestamp: timestamp || new Date().toISOString(),
    deviceId: deviceId || 'anon-device',
    tripId: tripId || null
  };

  stopsHistory.unshift(stopRecord);

  if (tripId) {
    const activeTrip = trips.find(t => t.id === tripId);
    if (activeTrip) {
      activeTrip.stops.push(stopRecord);
      activeTrip.stopsCount = activeTrip.stops.length;
    }
  }

  res.status(201).json({ success: true, stop: stopRecord });
});

app.get('/api/stops', (req, res) => {
  res.json({ total: stopsHistory.length, stops: stopsHistory });
});

// Redirigir frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` Servidor GPS y Trips activo en puerto ${PORT}`);
  console.log(` Local: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
