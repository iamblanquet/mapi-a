# PROMPT MAESTRO: MAPI GPS PRO (WEB AUDIO API & SIMULADOR DE TELEMETRÍA)

Copia y pega el siguiente prompt en cualquier modelo de IA o entrégalo a tu equipo de desarrollo para replicar o extender todas las funcionalidades del proyecto:

---

```markdown
Actúa como un Desarrollador Web Full Stack Senior especialista en Sistemas de Información Geográfica (GIS), Progressive Web Apps (PWA) de alto rendimiento y telemetría vehicular en tiempo real.

Tu objetivo es replicar/construir una aplicación web completa de rastreo GPS profesional ("Mapi GPS PRO") con arquitectura cliente-servidor (Node.js/Express + PWA Vanilla JS). La aplicación debe funcionar sin detenerse cuando el teléfono celular se bloquee o pase a segundo plano usando EXCLUSIVAMENTE la API de Web Audio (`AudioContext` con sintetizador oscilador continuo), y debe contar con una interfaz de escritorio con mapa panorámico a la derecha, ajuste de rutas a calles reales con OSRM y un simulador animado de viaje con un cochecito que rota dinámicamente y calcula el tiempo tramo a tramo.

A continuación se detallan las especificaciones técnicas completas y exactas que debes implementar:

---

### 1. MOTOR DE SEGUNDO PLANO EN MÓVIL: EXCLUSIVAMENTE WEB AUDIO API (Opción B)
Para evitar que los sistemas operativos móviles (Android Doze Mode, iOS WebKit Process Suspension) congelen el hilo de JavaScript y la API de geolocalización cuando el usuario apaga la pantalla o bloquea el móvil, implementarás únicamente un sintetizador de audio continuo en hardware:

- **Sin archivos `.wav` ni etiquetas `<audio>` externas**: Toda la persistencia en segundo plano se genera programáticamente mediante código.
- **Implementación del sintetizador**:
  ```javascript
  let audioCtx = null;
  let audioOscillator = null;
  let audioGain = null;

  function startBackgroundKeepAlive() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      if (!audioOscillator) {
        audioOscillator = audioCtx.createOscillator();
        audioGain = audioCtx.createGain();

        // Onda senoidal a 25Hz (frecuencia subsónica inaudible para el oído humano)
        audioOscillator.type = 'sine';
        audioOscillator.frequency.setValueAtTime(25, audioCtx.currentTime);

        // Ganancia prácticamente nula (amplitud infinitesimal 0.001) para no consumir batería innecesaria
        audioGain.gain.setValueAtTime(0.001, audioCtx.currentTime);

        // Conectar oscilador -> ganancia -> salida de audio del dispositivo
        audioOscillator.connect(audioGain);
        audioGain.connect(audioCtx.destination);
        audioOscillator.start();
      }
    } catch (err) {
      console.warn('Web Audio KeepAlive warning:', err);
    }
  }

  function stopBackgroundKeepAlive() {
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
  }
  ```
- **Mecanismo de captura ininterrumpida**:
  - Al iniciar el viaje dentro de la interacción del usuario (`click`), se invoca `startBackgroundKeepAlive()`.
  - El hilo de audio del SO permanece activo a nivel de kernel, permitiendo que `navigator.geolocation.watchPosition` continúe recibiendo los eventos satelitales de manera ininterrumpida con la pantalla bloqueada.
  - Se acompaña con un temporizador `setInterval` de latido (heartbeat) que consulta `navigator.geolocation.getCurrentPosition` si no se ha recibido una posición en el intervalo seleccionado (ej. 10s, 20s o 30s).
  - Cada coordenada registrada lleva el flag `isBackground: document.hidden` para indicar en el mapa si fue capturada con la pantalla encendida o apagada.
- **Modo Bolsillo (OLED)**: Un overlay negro puro (`#000000`) con brillo tenue y contadores mínimos para ahorrar energía en pantallas AMOLED mientras el teléfono se lleva en el bolsillo.

---

### 2. ARQUITECTURA DEL SERVIDOR Y PERSISTENCIA (BACKEND)
- **Tecnología**: Node.js + Express.
- **Middlewares**: CORS habilitado, parser JSON con límite de `15mb`, servicio de estáticos de la carpeta `www/`.
- **Persistencia**:
  - Archivo local `data/trips.json` sincronizado mediante `fs.writeFileSync`.
  - Caché en memoria para telemetría instantánea.
- **API REST**:
  - `POST /api/trips`: Guarda o actualiza un viaje completo (id, nombre, startTime, endTime, distanceKm, pointsCount, stopsCount, points[], stops[], deviceId).
  - `GET /api/trips`: Devuelve la lista histórica de viajes.
  - `GET /api/trips/:id`: Devuelve el viaje con todos sus puntos geográficos individuales.
  - `DELETE /api/trips/:id`: Elimina un viaje específico.
  - `GET /api/export/json` y `GET /api/export/csv`: Exportación de recorridos.

---

### 3. INTERFAZ DE USUARIO ESCRITORIO (UI DE 2 COLUMNAS) Y CERO EMOJIS
- **Regla Estricta de Iconografía (Sin Emojis)**: Todos los indicadores visuales, botones, textos y modales deben utilizar exclusivamente iconos vectoriales SVG limpios estilo Feather/Lucide (`stroke-width="2.2"`). Queda estrictamente prohibido el uso de caracteres emoji.
- **Estructura Visual**:
  - **Barra Superior**: Logo con radar pulsante, pestañas de cambio ("Grabador en Vivo" vs "Historial de Viajes" con contador de viajes), botón de instalación PWA e indicador de conexión ("Online" / "Offline").
  - **Columna Izquierda (Sidebar)**:
    - Banner de inspección de viaje histórico con botones: "Ajustar a Calles", "Simular Recorrido" y "Volver a En Vivo".
    - Botones de acción rápida: Iniciar Viaje, Finalizar, Parada.
    - Cuadrícula de métricas en tiempo real: Distancia total (km), Tiempo transcurrido (hh:mm:ss), Velocidad (km/h) y Paradas registradas.
    - Lista interactiva de paradas registradas en el viaje con zoom automático.
    - Panel de calidad satelital (precisión estimada en metros, cuenta regresiva de siguiente muestra, última coordenada).
    - Módulo de configuración: Servidor Render, selector de intervalo (10s, 20s, 30s, 60s), botón Wake Lock y consola de eventos en vivo.
  - **Columna Derecha (Visor Cartográfico Panorámico)**:
    - Contenedor que abarca el 100% del alto disponible de la ventana.
    - Mapa Leaflet con tiles OpenStreetMap y leyenda interactiva.
    - Puntos de la ruta diferenciados por colores: Verde para Inicio (A), Rojo para Fin (B), Cyan para puntos con pantalla encendida y Magenta brillante para puntos capturados con pantalla bloqueada en segundo plano.

---

### 4. AJUSTE DE RUTA A CALLES REALES (OSRM MAP MATCHING OPTIMIZADO)
- **Resolución de límite del servidor público OSRM**:
  - Los servidores públicos de OSRM limitan las solicitudes a ~10-12 coordenadas.
  - El algoritmo divide los puntos en paquetes pequeños de `CHUNK_SIZE = 8` con un traslape de 1 punto (`overlap = 1`).
  - Asigna `timestamps` y un radio dinámico proporcional a la precisión GPS: `radiuses = Math.min(35, Math.max(18, accuracy * 1.5))`.
  - Endpoint utilizado:
    `https://router.project-osrm.org/match/v1/driving/{coords}?geometries=geojson&overview=full&radiuses={radiuses}&timestamps={timestamps}`
  - Si un segmento no empalma por falta de datos, aplica un fallback fluido de `route` con `continue_straight=true` tomando [origen, punto medio, destino] para evitar falsos giros en "U".
  - Devuelve una polilínea continua perfectamente pegada a la geometría de las calles.

---

### 5. SIMULADOR ANIMADO DE VIAJE CON COCHECITO Y MEDICIÓN DE TIEMPO
El simulador debe ser universal y funcionar tanto con viajes de prueba como con cualquier viaje nuevo grabado por el usuario:

- **Marcador de Cochecito con Rumbo Dinámico (Bearing)**:
  - Marcador SVG personalizado de un vehículo visto desde arriba (con faros, parabrisas, ruedas y halo pulsante).
  - Cálculo de rumbo esférico en tiempo real:
    `bearing = atan2(sin(Δlon)*cos(lat2), cos(lat1)*sin(lat2) - sin(lat1)*cos(lat2)*cos(Δlon))` en grados (0° a 360°).
  - El vehículo rota fluidamente sobre su eje (`transform: rotate(θdeg)`) adaptándose a cada calle y curva.
- **Trazado Progresivo**:
  - La línea del recorrido sobre las calles se va pintando progresivamente en color azul brillante justo detrás del coche conforme este avanza en el loop de `requestAnimationFrame`.
- **Cálculo del Tiempo Tramo a Tramo**:
  - Se calcula el diferencial exacto de tiempo (`deltaSec = t[n] - t[n-1]`) entre cada par de puntos GPS registrados.
  - **HUD de Reproducción**: Muestra en vivo la etiqueta: `Tramo #X -> #Y: +30s` (indicando los segundos reales que tomó dicho segmento).
  - **Tooltip sobre el Coche**: Una etiqueta flotante en el techo del vehículo muestra: `Velocidad km/h • +30s`.
  - **Popups de Puntos**: Al hacer clic en los puntos del mapa, se despliega la hora, velocidad, precisión y el tiempo transcurrido desde el punto anterior.
- **Barra Flotante de Controles**:
  - Play / Pausa / Reiniciar.
  - Selector de velocidad de simulación: 1x, 2x, 5x, 10x.
  - Barra de progreso interactiva (slider) para avanzar o retroceder en el tiempo.
  - Checkbox "Seguir" para centrar la cámara automáticamente en el vehículo.
  - Duración actual y duración total formateadas en `mm:ss`.

---

### 6. PWA, OFFLINE Y SINCRONIZACIÓN
- `manifest.json` y Service Worker (`sw.js`) con estrategia Cache First para archivos estáticos y bibliotecas locales de Leaflet.
- Detección de eventos `online` / `offline` con cola de sincronización pendiente (`gps_pwa_pending_trips`) en `localStorage` para subir automáticamente los viajes al backend cuando se recupere la conexión.

Entrega el código completo, modular, sin dependencias pesadas innecesarias y 100% funcional.
```
