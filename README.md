# GPS Tracker PWA (100% Web)

Aplicación Web Progresiva (**PWA pura**, sin necesidad de Android Studio ni Capacitor) para rastreo GPS de **súper precisión** con intervalo de **10 segundos**, sincronización en vivo con **Render** y soluciones para el problema de la suspensión en dispositivos móviles.

---

## 💡 ¿Por qué una PWA deja de guardar ubicación al suspenderse y cómo lo soluciona esta app?

### El problema en la Web
Por políticas de ahorro de batería y privacidad en Android e iOS:
* En cuanto la pantalla entra en reposo o se bloquea, el navegador **duerme los hilos de JavaScript**.
* Los Service Workers de la web **no tienen acceso al hardware de geolocalización** por especificación de la W3C.

### Las 3 soluciones implementadas en esta PWA:

1. **Screen Wake Lock API (`navigator.wakeLock`):**
   * Impide automáticamente que la pantalla se apague o entre en suspensión mientras la app está activa.
   * El GPS continúa registrando coordenadas fijas cada **10 segundos** de forma continua.
2. **Modo Bolsillo OLED (Ahorro de batería extremo):**
   * Presiona el botón **"Modo Bolsillo"** en la app.
   * La pantalla se vuelve **100% negra** (apagando físicamente los píxeles en pantallas OLED/AMOLED) para que no consuma batería y no sufra toques accidentales mientras caminas con el teléfono en el bolsillo, **sin que el móvil se suspenda**.
3. **Audio Loop Hack (Segundo plano experimental):**
   * Activa un oscilador Web Audio imperceptible para mantener activo el proceso de la pestaña cuando minimizas o cambias de app en algunos navegadores de Android.

---

## 🎯 Configuración de Máxima Precisión y Rango de 10s

* **Súper Precisión:** Se utiliza `enableHighAccuracy: true`, `maximumAge: 0` y un timeout estricto de 10 segundos para forzar la conexión directa con los satélites GPS.
* **Filtro de Ruido:** Solo acepta lecturas con error inferior a 15 metros (configurable a 30m o 50m).
* **Ventana de 10 Segundos:** Durante cada bloque de 10 segundos, el algoritmo evalúa las señales recibidas y **fija la coordenada con el menor margen de error**.
* **Temporizador en Vivo:** Cuenta regresiva visual en pantalla (`10s... 9s... 8s...`) que marca exactamente cuándo se envía y almacena el siguiente punto.

---

## 🚀 Despliegue en Render (100% Gratuito y Rápido)

1. Sube este proyecto a tu GitHub / GitLab:
   ```bash
   git add .
   git commit -m "feat: pwa gps tracker para render"
   git push origin main
   ```
2. Entra a [dashboard.render.com](https://dashboard.render.com/) y crea un **Web Service**.
3. Conecta tu repositorio.
4. Render utilizará la configuración de `render.yaml` automáticamente:
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
   * **Health Check Path:** `/health`
5. Render generará tu enlace seguro HTTPS (ejemplo: `https://mi-pwa-gps.onrender.com`).
   > *Nota:* La geolocalización en teléfonos exige HTTPS, y Render proporciona HTTPS automáticamente.

---

## 📲 Cómo Usar e Instalar en tu Celular

1. Abre el enlace de Render en **Google Chrome** (Android) o **Safari** (iOS).
2. Presiona el botón verde **"📲 Instalar App"** o en el menú del navegador selecciona **"Agregar a la pantalla de inicio"**.
3. Abre la app desde tu pantalla de inicio como una aplicación independiente.
4. Presiona **"Iniciar Rastreo"** y autoriza el acceso a la ubicación.
5. *(Opcional)* Activa el **Modo Bolsillo** para apagar la pantalla en negro y meter el teléfono al bolsillo sin que se apague el GPS.
6. En tu computadora puedes abrir la misma URL para ver las coordenadas llegando en tiempo real o exportar el recorrido a CSV / JSON.
