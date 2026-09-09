const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'www')));

// Base de datos en memoria para los puntos GPS recibidos
let locationHistory = [];
const MAX_HISTORY = 2000;

// Healthcheck para Render
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), count: locationHistory.length });
});

// Registrar un punto de ubicación (enviado desde la app o navegador)
app.post('/api/location', (req, res) => {
  const { latitude, longitude, accuracy, speed, timestamp, deviceId, isBackground } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Latitud y longitud son requeridas' });
  }

  const record = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    latitude: Number(latitude),
    longitude: Number(longitude),
    accuracy: accuracy ? Number(accuracy) : null,
    speed: speed ? Number(speed) : null,
    timestamp: timestamp || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    deviceId: deviceId || 'anon-device',
    isBackground: Boolean(isBackground)
  };

  locationHistory.unshift(record); // El más reciente primero
  if (locationHistory.length > MAX_HISTORY) {
    locationHistory.pop();
  }

  console.log(`[GPS] Recibido de ${record.deviceId} (${record.isBackground ? 'BACKGROUND' : 'FOREGROUND'}): ${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)} (±${record.accuracy || 0}m)`);

  res.status(201).json({ success: true, count: locationHistory.length, received: record });
});

// Obtener historial de ubicaciones
app.get('/api/locations', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 100;
  res.json({
    total: locationHistory.length,
    locations: locationHistory.slice(0, limit)
  });
});

// Base de datos en memoria para paradas del viaje
let stopsHistory = [];

// Registrar una parada
app.post('/api/stop', (req, res) => {
  const { latitude, longitude, note, timestamp, deviceId } = req.body;
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Latitud y longitud son requeridas para la parada' });
  }

  const stopRecord = {
    id: 'stop-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    latitude: Number(latitude),
    longitude: Number(longitude),
    note: note || 'Parada registrada',
    timestamp: timestamp || new Date().toISOString(),
    deviceId: deviceId || 'anon-device'
  };

  stopsHistory.unshift(stopRecord);
  console.log(`[PARADA] Guardada: ${stopRecord.note} en ${stopRecord.latitude}, ${stopRecord.longitude}`);
  res.status(201).json({ success: true, stop: stopRecord });
});

// Obtener paradas
app.get('/api/stops', (req, res) => {
  res.json({ total: stopsHistory.length, stops: stopsHistory });
});

// Limpiar historial completo (puntos y paradas)
app.delete('/api/locations', (req, res) => {
  locationHistory = [];
  stopsHistory = [];
  res.json({ success: true, message: 'Historial de ubicaciones y paradas eliminado' });
});

// Redirigir cualquier otra ruta al index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` Servidor activo en puerto ${PORT}`);
  console.log(` Local: http://localhost:${PORT}`);
  console.log(` Listo para desplegar en Render`);
  console.log(`====================================================`);
});
