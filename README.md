# GPS Tracker PWA (100% Web) con Dashboard, Mapa y Paradas

Aplicación Web Progresiva (**PWA pura**, sin necesidad de Android Studio ni Capacitor) para rastreo GPS de **súper precisión** con intervalo de **20 segundos**, historial de viajes, mapa interactivo con **Leaflet.js**, registro de paradas y sincronización en vivo con **Render**.

---

## 💡 ¿Por qué una PWA deja de guardar ubicación al suspenderse y cómo lo soluciona esta app?

### El problema en la Web
Por políticas de ahorro de batería y privacidad en Android e iOS:
* En cuanto la pantalla entra en reposo o se bloquea, el navegador **duerme los hilos de JavaScript**.
* Los Service Workers de la web **no tienen acceso al hardware de geolocalización** por especificación de la W3C.

### Las soluciones implementadas en esta PWA:

1. **Audio Loop Hack (Segundo plano con pantalla bloqueada):**
   * Utiliza una sesión multimedia activa con `navigator.mediaSession` y un audio silencioso en bucle.
   * El sistema operativo le da prioridad como reproductor de música y **no duerme el hilo de ejecución al apagar la pantalla**.
   * El evento continuo `timeupdate` emite un latido ininterrumpido cada **20 segundos** para tomar y enviar las coordenadas.
2. **Screen Wake Lock API (`navigator.wakeLock`):**
   * Impide automáticamente que la pantalla se apague sola mientras la app está visible.
3. **Modo Bolsillo OLED (Ahorro de batería extremo):**
   * Pone la pantalla en **100% negro** (apagando físicamente los píxeles en pantallas OLED/AMOLED) para que no consuma batería mientras caminas con el teléfono en el bolsillo.

---

## 🎯 Configuración de Máxima Precisión y Rango de 20s

* **Súper Precisión:** Se utiliza `enableHighAccuracy: true`, `maximumAge: 0` y un filtro estricto (< 15 metros) para forzar la conexión directa con los satélites GPS.
* **Ventana de 20 Segundos:** Durante cada bloque de 20 segundos, el algoritmo evalúa las señales recibidas y **fija la coordenada con el menor margen de error**.
* **Temporizador en Vivo:** Cuenta regresiva visual en pantalla (`20s... 19s... 18s...`) que marca exactamente cuándo se envía y almacena el siguiente punto.

---

## 🗺️ Visualización de Viajes en el Mapa con Puntos de 20s

* **Trazado de Ruta:** Línea continua que une todos los puntos del viaje.
* **Puntos Individuales:** Cada coordenada capturada a los 20 segundos se pinta visiblemente como un marcador interactivo:
  * 🟢 **Punto A:** Marcador de inicio del viaje con fecha y hora.
  * 🔴 **Puntos Intermedios:** Círculos interactivos a lo largo de la ruta con popup que indica número de punto, hora, velocidad, precisión y si fue capturado con pantalla encendida o bloqueada.
  * 🏁 **Punto B:** Marcador de finalización del viaje.
  * 📍 **Pines de Paradas:** Marcadores amarillos con notas personalizadas (gasolinera, clientes, descansos, etc.).

---

## 🚀 Despliegue en Render (100% Gratuito y Rápido)

1. Sube este proyecto a tu repositorio de GitHub:
   ```bash
   git add .
   git commit -m "feat: gps pwa 20s y puntos en mapa de historial"
   git push origin main
   ```
2. Entra a [dashboard.render.com](https://dashboard.render.com/) y crea un **Web Service**.
3. Conecta tu repositorio `iamblanquet/mapi-a`.
4. Render detectará automáticamente `render.yaml`:
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
   * **Health Check Path:** `/health`
5. Render generará tu enlace seguro HTTPS (ejemplo: `https://mi-pwa-gps.onrender.com`).
