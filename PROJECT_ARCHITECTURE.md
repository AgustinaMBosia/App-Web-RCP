# PROJECT ARCHITECTURE — Simulador RCP
**Versión del documento:** 1.0 — 2026-05-11  
**Branch principal:** `main`

---

## Índice

1. [Visión General](#1-visión-general)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estructura del Proyecto](#3-estructura-del-proyecto)
4. [Arquitectura del Sistema](#4-arquitectura-del-sistema)
5. [Flujo Completo de Ejecución](#5-flujo-completo-de-ejecución)
6. [Módulo: `src/js/script.js`](#6-módulo-srcjsscriptjs)
7. [Módulo: `src/js/visualizacion.js`](#7-módulo-srcjsvisualizacionjs)
8. [Protocolo de Comunicación Serial](#8-protocolo-de-comunicación-serial)
9. [Máquina de Estados](#9-máquina-de-estados)
10. [Flujo de Datos](#10-flujo-de-datos)
11. [Funciones Críticas](#11-funciones-críticas)
12. [Dependencias](#12-dependencias)
13. [Hardware Relacionado](#13-hardware-relacionado)
14. [Configuración y Setup](#14-configuración-y-setup)
15. [Zonas Frágiles y Riesgos](#15-zonas-frágiles-y-riesgos)
16. [Roadmap Técnico](#16-roadmap-técnico)

---

## 1. Visión General

### ¿Qué hace este sistema?

El **Simulador RCP** es una aplicación web que actúa como interfaz de monitoreo en tiempo real para un dispositivo físico de entrenamiento en maniobras de Reanimación Cardiopulmonar (RCP). El dispositivo físico (llamado "Buddy") es un maniquí instrumented con sensores que miden:

- **Posición de manos** (correcta / incorrecta)
- **Profundidad de compresión** (en milímetros)
- **Frecuencia de compresiones** (en compresiones por minuto)

La app web se conecta al Buddy mediante **Web Serial API** (USB → CP210x → UART), recibe datos en tiempo real, los visualiza en gráficos, evalúa si la maniobra es correcta, y al finalizar genera un informe descargable en CSV.

### Objetivo del producto

Herramienta educativa/médica para que instructores y estudiantes puedan practicar y evaluar la calidad de las compresiones torácicas durante entrenamiento en RCP, con feedback visual inmediato.

### Diagrama conceptual

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER (Chrome)                          │
│                                                                  │
│   ┌─────────────┐     Custom Events /      ┌──────────────────┐ │
│   │  script.js  │ ──── window globals ────▶│ visualizacion.js │ │
│   │             │                          │                  │ │
│   │ • Protocolo │                          │ • Chart.js       │ │
│   │ • Serial    │                          │ • Badges UI      │ │
│   │ • Estado    │◀─── window.saveCharts ───│ • CSV export     │ │
│   └──────┬──────┘                          └──────────────────┘ │
│          │ Web Serial API                                        │
└──────────┼───────────────────────────────────────────────────────┘
           │ USB (CP210x driver)
    ┌──────▼──────┐
    │   Buddy     │
    │  (maniquí)  │
    │  sensores:  │
    │  • mano OK  │
    │  • prof mm  │
    │  • freq cpm │
    └─────────────┘
```

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión | Rol |
|---|---|---|---|
| Markup | HTML5 | — | Estructura de la UI |
| Estilos | CSS3 | — | Layout, responsive, animaciones |
| Lógica | JavaScript | ES2020 (vanilla) | Todo el comportamiento |
| Gráficos | Chart.js | 4.4.7 | Visualización en tiempo real |
| Alertas/Modales | SweetAlert2 | ^11 | Popups y confirmaciones |
| HW connectivity | Web Serial API | Browser nativo | Conexión al Buddy |
| HW connectivity | Web Bluetooth API | Browser nativo | Alternativa (parcial) |
| Persistencia | File System Access API | Browser nativo | Guardar CSV en disco |
| Driver USB | CP210x (Silicon Labs) | — | UART bridge en Windows |

**No hay backend.** El sistema es 100% frontend, corre localmente en el browser del instructor.  
**No hay base de datos.** Los datos se exportan como archivos CSV.  
**No hay autenticación.** La app es de uso directo, sin login.

---

## 3. Estructura del Proyecto

```
App-Web-RCP/
│
├── index.html                  ← Punto de entrada único de la app
│
├── src/                        ← Código fuente de la aplicación
│   ├── css/
│   │   └── style.css           ← Todos los estilos de la app
│   ├── js/
│   │   ├── script.js           ← Lógica de hardware, protocolo y estado
│   │   └── visualizacion.js    ← Gráficos, badges, UI y exportación CSV
│   └── assets/
│       ├── favicon.png         ← Ícono del tab del browser
│       └── ucc-logo.png        ← Logo UCC (watermark)
│
├── vendor/
│   └── chart.umd.js            ← Chart.js v4.4.7 (librería de gráficos)
│
├── driver/                     ← Driver CP210x para Windows (NO es código de app)
│   ├── instalador.exe
│   ├── install_driver.ps1
│   ├── silabser.inf / .cat
│   ├── arm/ arm64/ x64/ x86/   ← Binarios del driver por arquitectura
│   └── *.txt                   ← Documentación y licencia Silicon Labs
│
├── CODE_REVIEW.md              ← Revisión técnica del código
├── PROJECT_ARCHITECTURE.md     ← Este documento
└── .vscode/settings.json       ← Puerto de Live Server (5503)
```

### Responsabilidad de cada parte

| Carpeta/Archivo | ¿Qué va ahí? | ¿Qué NO va ahí? |
|---|---|---|
| `src/js/` | Lógica de la app, protocolos, handlers | Librerías de terceros |
| `src/css/` | Estilos globales, responsive, animaciones | CSS inline en JS |
| `src/assets/` | Imágenes, íconos, recursos estáticos | Scripts o estilos |
| `vendor/` | Librerías externas copiadas localmente | Código propio |
| `driver/` | Instaladores de driver para el hardware | Código de la app web |
| `index.html` | Estructura HTML, carga de scripts | Lógica de negocio |

---

## 4. Arquitectura del Sistema

La arquitectura es **monolítica cliente-only**: no hay servidor, no hay build step, no hay framework. Todo corre en el browser directamente.

```
index.html
    │
    ├── <link> src/css/style.css          (se carga primero, bloquea render)
    ├── <script> vendor/chart.umd.js      (carga Chart.js en window.Chart)
    ├── <script> src/js/visualizacion.js  (registra handlers y window globals)
    └── <script> src/js/script.js         (inicia estado, agrega event listeners)
```

### Orden de carga crítico

Los scripts se cargan en orden secuencial **sin `defer`/`async`**. Esto significa:

1. `chart.umd.js` debe cargarse antes que `visualizacion.js` (que usa `new Chart(...)`)
2. `visualizacion.js` debe cargarse antes que `script.js` (que llama `window.updateVisualization`)
3. Ambos escuchan `DOMContentLoaded`, que se dispara cuando el HTML está parseado

### Comunicación entre módulos

Los dos archivos JS se comunican de dos formas:

```
script.js  ──── window.updateVisualization(data) ────▶  visualizacion.js
script.js  ◀─── window.saveCharts()             ──────  visualizacion.js
script.js  ◀─── window.resetCharts()            ──────  visualizacion.js
script.js  ──── window.restartSerialLoop()      ────▶  (definida en script.js)
script.js  ──── window.closeSerialConnection()  ────▶  (definida en script.js)
```

Esto es un **acoplamiento via objeto global `window`**: no hay imports explícitos. Si una función se renombra, el error aparece solo en runtime.

---

## 5. Flujo Completo de Ejecución

### 5.1 Arranque de la app

```
1. Browser carga index.html
2. Se parsea el HTML → DOM disponible
3. Se cargan los scripts en orden:
   a. Chart.js registra window.Chart
   b. visualizacion.js:
      - Escucha DOMContentLoaded
      - Cuando dispara: crea los 4 charts (freqChart, profChart, pieChart, handPosChart)
      - Crea los badges dinámicos (div + CSS inline)
      - Registra window.saveCharts, window.resetCharts, window.updateVisualization
      - Intenta restaurar carpeta de guardado desde localStorage (ver nota¹)
   c. script.js:
      - Llama resetAllStates() → limpia todos los flags y timers
      - Registra event listeners en los botones del DOM
4. App lista para interacción del usuario
```

> ¹ El intento de restauración de la carpeta desde localStorage no funciona correctamente porque `FileSystemDirectoryHandle` no es serializable a JSON. Ver sección 15.

---

### 5.2 Flujo de conexión serial

```
Usuario hace click en "Conectar Bluetooth"
        │
        ▼
navigator.serial.requestPort()
→ Browser muestra picker de puerto USB
        │
        ▼
serialPort.open({ baudRate: 115200 })
        │
        ▼
serialReader = serialPort.readable.getReader()
        │
        ├── startSerialReadLoop()   ← loop asíncrono de lectura de bytes
        │
        └── serialInterval = runStateMachine()  ← setInterval cada 250ms
```

**Desde este punto, dos loops corren en paralelo:**

| Loop | Frecuencia | Responsabilidad |
|---|---|---|
| `startSerialReadLoop()` | Continuo (async/await) | Leer bytes del puerto, ensamblar frames |
| `runStateMachine()` | Cada 250ms (setInterval) | Procesar estado actual, enviar respuestas |

---

### 5.3 Flujo de recepción de datos

```
Hardware envía frame de 19 bytes (18 data + 0x0D terminador)
        │
startSerialReadLoop() acumula bytes en buffer[]
        │
Al recibir 0x0D (fin de frame):
  ┌─ buffer.length === 18?
  │     NO → log de error, descartar
  │     SI → validar checksum
  │           ├─ checksum inválido → log de error, descartar
  │           └─ checksum válido →
  │               actualiza variables globales:
  │               • comando = packet[8]
  │               • data = packet[9..16]
  │               • idPag = packet[2]
  └─ buffer.length = 0   ← reset para próximo frame
```

Las variables globales `comando` y `data` actúan como **mailbox** entre el read loop y el state machine loop.

---

### 5.4 Flujo de procesamiento en la state machine

```
setInterval cada 250ms:
        │
        ▼
switch(comando):
  case 0x01 → Estado INICIAL: envía ping al hardware
  case 0x65 → Hardware pidió confirmación: responder con 0x02
  case 0x66 → Verificar posición de manos:
                ├── data[0] !== 0x71 → manos incorrectas:
                │     abrir popup "Poner bien las manos"
                │     estado = WAIT_HANDS
                └── data[0] === 0x71 → manos correctas:
                      estado = SEND_DATA
                      scheduleFinishOnce() ← inicia timer de 60 segundos
  case 0x03 → Recibir datos de sensores:
                ├── flagSendData === false → handshake inicial
                └── flagSendData === true  → processSensorData(data) → updateVisualization()
  case 0x68 → Datos de sensor alternativo + timer de finalización
  case 0x09 → Batería baja: mostrar alerta, detener sesión
  case 0x0A/0x0B → Falla de sensor: mostrar alerta, detener sesión
```

---

### 5.5 Flujo de visualización de datos

```
processSensorData(sensorBytes)
        │
        ▼
Decodifica bytes:
  • manoOK = sensorBytes[0] === 1 ? 'OK' : 'NOK'
  • profundidad = sensorBytes[1] | (sensorBytes[2] << 8)   ← little-endian 16-bit
  • frecuencia  = sensorBytes[3] | (sensorBytes[4] << 8)   ← little-endian 16-bit
        │
        ▼
window.updateVisualization({ handPosition, profundidad, freq })
        │
        ▼
handleDataForVisualization():
  1. Si handPos !== 'OK' por primera vez → ignorar (no iniciar tracking)
  2. Primera vez handPos === 'OK' → startTracking = true
  3. Si freq === 0 y aún no hay freq válida → mostrar "círculo de espera" rojo
  4. Si freq > 0 → quitar círculo, hasNonZeroFreq = true
  5. Si freq === 0 pero ya hubo freq > 0 → usar último valor conocido (pastFreq)
  6. Evaluar:
     • isFreqCorrect = freq entre 100 y 120 cpm
     • isProfCorrect = prof entre 50 y 60 mm
     • isHandOK = handPos === 'OK'
  7. Actualizar badges (freqBadge, profBadge, pieBadge, handPosBadge) con colores
  8. Actualizar datasets de los 4 charts (ventana deslizante de 7 puntos)
  9. Acumular en fullFreqData, fullProfData (para el resumen final)
  10. Registrar en recordedData[] (para el CSV)
  11. Incrementar correctExecutions o incorrectExecutions
  12. chart.update() × 4
```

---

### 5.6 Flujo de finalización

```
Timer de 60 segundos vence (scheduleFinishOnce)
  ── O ──
Usuario presiona "Terminar"
        │
        ▼
currentState = 'FINISH'
sendToModule({ comando: 0x05 })   ← avisa al hardware que terminó
window.saveCharts()               ← muestra el modal de resumen
        │
        ▼
Modal SweetAlert2 con:
  • Porcentaje de ejecuciones correctas
  • 4 charts de resumen (nuevas instancias de Chart.js)
  • Botón "Nueva Maniobra" → window.resetCharts()
  • Botón "Cerrar" → window.closeSerialConnection()
  • Botón "Guardar CSV" → downloadCSV()
```

---

### 5.7 Flujo de exportación CSV

```
downloadCSV()
        │
        ▼
¿savedDirHandle existe?
  NO → window.showDirectoryPicker()   ← browser abre selector de carpeta
        guardar nombre en localStorage (solo hint, no el handle real)
  SI → usar handle existente
        │
        ▼
¿savedFiles.length >= 100?
  SI → eliminar el archivo más antiguo del directorio
        │
        ▼
Generar nombre: maniobra_2026-05-11T14-30-00-000Z.csv
Crear FileHandle en la carpeta
Escribir CSV:
  Timestamp, Frecuencia, Profundidad, PosicionMano
  2026-05-11T14:30:01.000Z, 112, 55, OK
  ...
```

---

## 6. Módulo: `src/js/script.js`

**Responsabilidad:** Todo lo relacionado con hardware, protocolo serial, máquina de estados, y envío/recepción de tramas.

### Variables de estado globales

```js
// ── Recursos de hardware ───────────────────────────────────────
let serialPort = null          // Puerto serial abierto
let serialReader = null        // Reader del stream de bytes
let serialInterval = null      // Handle del setInterval de la state machine
let simulationInterval = null  // Handle del setInterval de simulación
let bluetoothInterval = null   // Handle del setInterval de Bluetooth (no usado activo)

// ── Estado de la sesión ────────────────────────────────────────
let currentState = 'IDLE'      // Estado actual: IDLE | START | WAIT_HANDS | SEND_DATA | FINISH
window.sessionId = 0           // Incrementa en cada reset; protege timers de sesiones anteriores
let contadorUniversal = 0      // Contador de ticks del state machine (usado como idPag)

// ── Variables del protocolo ────────────────────────────────────
let idDestino = 0x00           // Dirección destino del último paquete recibido
let idPag = 0x00               // ID del paquete
let idOrigen = 0x00            // Dirección origen del último paquete recibido
let comando = 0x01             // MAILBOX: comando del último paquete recibido
let data = new Array(8).fill(0x00)  // MAILBOX: bytes de datos del último paquete
let cambioDeId = 0x64          // ID destino para envíos (el Buddy)

// ── Flags de control de flujo ──────────────────────────────────
let flagSendData = false        // true cuando el handshake inicial completó
let sendDataFlag = false        // true cuando packet[14] indica datos activos
let finishScheduled = false     // true cuando el timer de 60s está activo
window.finishPopupShown = false // true cuando el modal de resumen ya se mostró
window.handsOk = false          // true cuando la posición de manos es correcta
let handsPopupOpen = false      // true mientras el popup de manos está visible
window.handsPopupShownThisSession = false  // evita mostrar el popup dos veces

// ── Anti-stuck ─────────────────────────────────────────────────
let samePacketCount = 0         // contador de paquetes con el mismo ID consecutivos
let lastPacketId = null         // ID del último paquete para detectar congelamiento
```

### Funciones principales

| Función | Descripción |
|---|---|
| `resetAllStates()` | Limpia todos los flags, timers e intervalos. Se llama al reiniciar. |
| `runStateMachine()` | Crea y retorna un `setInterval` que ejecuta la lógica de protocolo cada 250ms. |
| `startSerialReadLoop()` | Loop `async/await` que lee bytes del puerto y ensambla frames. |
| `sendToModule(params)` | Construye y envía una trama al hardware (agrega checksum + 0x0D). |
| `processSensorData(bytes)` | Decodifica los 8 bytes de datos del sensor (little-endian). |
| `processData(text)` | Parsea tramas en formato texto `UHANDPOS,PPROF,FFREQ:` (modo simulación). |
| `scheduleFinishOnce()` | Programa el timeout de 60s para finalizar la maniobra (idempotente). |
| `clearFinishSchedule()` | Cancela el timeout de 60s y oculta la barra de progreso. |
| `checkStuckPacket(id)` | Detecta si el hardware dejó de enviar nuevos paquetes (10 iguales seguidos). |
| `startProgressBar()` | Inicia la barra de progreso visual de 60 segundos. |
| `stopProgressBar()` | Para y oculta la barra de progreso. |
| `abrirPopup()` | Muestra el popup de "poner bien las manos" (SweetAlert2). |
| `calculateChecksum(arr)` | Calcula el checksum de un frame (suma de bytes con carry-folding). |
| `stopSerialLoop()` | Para el `setInterval` del state machine. |
| `closeSerialConnection()` | Cierra el puerto serial correctamente (cancela reader, cierra port). |

---

## 7. Módulo: `src/js/visualizacion.js`

**Responsabilidad:** Todo lo relacionado con la UI de visualización: gráficos, badges, modal de resultados, y exportación CSV.

> ⚠️ Todo el código está dentro de un closure de `DOMContentLoaded`. Las funciones solo son accesibles desde fuera a través de `window.*`.

### Variables internas del módulo

```js
// ── Charts ──────────────────────────────────────────────────────
freqChart        // Chart.js: línea de frecuencia (ventana deslizante 7 puntos)
profChart        // Chart.js: barras de profundidad (ventana deslizante 7 puntos)
pieChart         // Chart.js: pie de ejecuciones correctas vs incorrectas
handPosChart     // Chart.js: doughnut de posición de manos (solo punto actual)

// ── Acumuladores ────────────────────────────────────────────────
fullFreqData[]         // Todos los valores de frecuencia de la sesión (para resumen)
fullProfData[]         // Todos los valores de profundidad de la sesión
fullLabels[]           // Labels numéricos correlativos
recordedData[]         // Objetos { timestamp, frecuencia, profundidad, posicionMano } para CSV
handPositionHistory[]  // 'OK' | 'NOK' de cada compresión (para el resumen de manos)

// ── Contadores de evaluación ─────────────────────────────────────
correctExecutions      // Compresiones dentro de rango (freq 100-120, prof 50-60, manos OK)
incorrectExecutions    // Compresiones fuera de rango
globalCounter          // Índice de la compresión actual

// ── Flags de estado de visualización ────────────────────────────
startTracking          // true cuando se detectó la primera mano OK
hasNonZeroFreq         // true cuando llegó la primera frecuencia válida (> 0)
isPaused               // true cuando el usuario pausó los gráficos
zeroAlertShown         // true para evitar mostrar la alerta de "maniobra detenida" N veces
ContadorCeros          // Cantidad de frecuencias = 0 consecutivas recibidas

// ── Constantes de evaluación ─────────────────────────────────────
freqIdealMin = 100     // cpm mínimo para frecuencia correcta
freqIdealMax = 120     // cpm máximo para frecuencia correcta
profIdealMin = 50      // mm mínimo para profundidad correcta
profIdealMax = 60      // mm máximo para profundidad correcta
```

### Funciones principales

| Función | Descripción |
|---|---|
| `handleDataForVisualization(data)` | Función central: evalúa los datos y actualiza todos los charts y badges. |
| `updateCharts()` | Llama `.update()` en los 4 charts si no están pausados. |
| `updateBadge(badge, val, unit, isCorrect, min)` | Actualiza un badge con color (verde/naranja/rojo) y animación de escala. |
| `updateHandPosBadge(badge, handPos)` | Versión específica para el badge de manos (OK = verde, NOK = rojo). |
| `updatePieBadge(badge, correct, incorrect)` | Muestra porcentaje de éxito con color según umbral (80% verde, 50% naranja). |
| `createDataBadge(canvas, id)` | Crea dinámicamente el div badge encima de cada canvas. |
| `createWaitingCircle()` | Crea el círculo rojo animado "Calculando..." mientras freq = 0. |
| `removeWaitingCircle()` | Elimina el círculo del DOM. |
| `saveCharts()` | Muestra el modal de resumen final con 4 charts de preview. |
| `downloadCSV()` | Exporta `recordedData[]` como archivo CSV usando File System Access API. |
| `window.resetCharts()` | Reinicia todos los acumuladores, badges y charts a su estado inicial. |
| `window.updateVisualization(data)` | Entry point público; recibe datos de `script.js` y delega a `handleDataForVisualization`. |

### Plugin custom de Chart.js

```js
const rangePlugin = {
  id: 'rangePlugin',
  beforeDraw(chart) {
    // Dibuja un rectángulo verde semitransparente en la zona ideal
    // En freqChart: entre 100 y 120 cpm
    // En profChart: entre 50 y 60 mm
  }
};
```

Este plugin se registra localmente en cada instancia de Chart (no globalmente), por lo que solo afecta a `freqChart` y `profChart`.

---

## 8. Protocolo de Comunicación Serial

### Configuración del puerto

```
BaudRate: 115200
Terminador de frame: 0x0D (carriage return)
```

### Estructura de un frame (19 bytes)

```
Offset  Tamaño  Descripción
──────  ──────  ────────────────────────────────────────────────
[0]       1     idDestino LSB (dirección del destinatario)
[1]       1     0x00 (padding)
[2]       1     idPag (número de paquete)
[3]       1     0x00 (padding)
[4-5]     2     idDestino 16-bit (big-endian): [4]=MSB, [5]=LSB
[6-7]     2     idOrigen  16-bit (big-endian): [6]=MSB, [7]=LSB
[8]       1     comando (ver tabla de comandos)
[9-16]    8     datos de payload
[17]      1     checksum
[18]      1     0x0D (terminador — no incluido en el checksum)
```

### Tabla de comandos

| Hex | Nombre | Dirección | Descripción |
|---|---|---|---|
| `0x01` | INIT/PING | App → Buddy | Ping de mantenimiento de conexión |
| `0x02` | CONFIRM | App → Buddy | Confirmación de recepción |
| `0x03` | ACK_HANDS | App → Buddy | Respuesta al estado de manos |
| `0x04` | ACK_DATA | App → Buddy | Acknowledgment de datos de sensor |
| `0x05` | FINISH | App → Buddy | Señal de fin de maniobra |
| `0x65` | CONFIRM_REQ | Buddy → App | El Buddy pide confirmación |
| `0x66` | HANDS_STATUS | Buddy → App | Estado de posición de manos |
| `0x68` | SENSOR_DATA | Buddy → App | Datos de sensor en modo alternativo |
| `0x09` | LOW_BATTERY | Buddy → App | Batería baja, detener |
| `0x0A` | SENSOR_FAIL_A | Buddy → App | Falla en sensor tipo A |
| `0x0B` | SENSOR_FAIL_B | Buddy → App | Falla en sensor tipo B |

### Cálculo del checksum

```js
function calculateChecksum(arr) {
    let sum = 0;
    for (const b of arr) sum += b;         // Suma todos los bytes
    while (sum > 0xFF) sum = (sum & 0xFF) + (sum >> 8);  // Fold carry
    sum = ~sum & 0xFF;                      // Complemento a 1
    return sum;
}
// Aplica sobre los 17 bytes del frame (sin el checksum ni el 0x0D)
```

### Decodificación del payload de sensor (bytes [9-16])

```
Byte [9]  (data[0])   : 0x01 = manoOK, 0x00 = manoNOK
                        0x71 = confirmación de manos en posición
                        0xFF = señal de reset
Bytes [10-11] (data[1-2]) : profundidad en mm (uint16, little-endian)
Bytes [12-13] (data[3-4]) : frecuencia en cpm (uint16, little-endian)
Byte [14] (data[5])   : 0x01 = datos activos (sendDataFlag)
Bytes [15-16] (data[6-7]) : reservados
```

---

## 9. Máquina de Estados

```
                ┌─────────┐
    arranque ──▶│  IDLE   │
                └────┬────┘
                     │ comando 0x65 recibido
                     ▼
                ┌──────────┐
                │  START   │
                └────┬─────┘
                     │ comando 0x66, data[0] != 0x71
                     ▼
               ┌────────────┐
       ┌──────▶│ WAIT_HANDS │◀──┐
       │        └─────┬──────┘   │ manos incorrectas
       │              │ manos OK (data[0] == 0x71)
       │              ▼
       │        ┌───────────┐
       │        │ SEND_DATA │ ◀── datos de sensor, timer 60s
       │        └─────┬─────┘
       │              │ timer vence / botón Terminar / batería / sensor fail
       │              ▼
       │         ┌────────┐
       └─────────│ FINISH │
                 └────────┘
                      │ "Nueva Maniobra"
                      └──────────────────▶ IDLE (resetAllStates + resetCharts)
```

**Transiciones de estado:**

| Estado actual | Evento | Estado siguiente |
|---|---|---|
| `IDLE` | `comando = 0x65` | `START` |
| `START` | `comando = 0x66`, data[0] ≠ 0x71 | `WAIT_HANDS` |
| `START` | `comando = 0x66`, data[0] = 0x71 | `SEND_DATA` |
| `WAIT_HANDS` | manos OK | `SEND_DATA` |
| `SEND_DATA` | timer 60s vence | `FINISH` |
| `SEND_DATA` | botón "Terminar" | `FINISH` |
| `SEND_DATA` | `comando = 0x09` (batería) | `FINISH` |
| `SEND_DATA` | `comando = 0x0A/0x0B` (sensor) | `FINISH` |
| `FINISH` | botón "Nueva Maniobra" | `IDLE` |

---

## 10. Flujo de Datos

```
HARDWARE (Buddy)
    │
    │ bytes raw via USB/UART
    ▼
startSerialReadLoop()
    │ ensambla frames de 18 bytes
    │ valida checksum
    ▼
Variables globales MAILBOX:
    comando = packet[8]
    data    = packet[9..16]
    │
    │ leídas cada 250ms
    ▼
runStateMachine()
    │
    ├── si es data de sensor: processSensorData(data)
    │       │
    │       ▼
    │   { handPosition, profundidad, freq }
    │       │
    │       ▼
    │   window.updateVisualization(parsed)
    │       │
    │       ▼
    │   handleDataForVisualization()
    │       │
    │       ├── evalúa correctness
    │       ├── actualiza 4 Chart.js instances
    │       ├── actualiza 4 badges DOM
    │       └── acumula en recordedData[]
    │
    └── si es fin: window.saveCharts()
            │
            ▼
        Modal SweetAlert2
            │
            └── "Guardar CSV" → downloadCSV()
                    │
                    ▼
                File System Access API → .csv en disco
```

---

## 11. Funciones Críticas

### `calculateChecksum(arr)` — `src/js/script.js`

```js
// Checksum con carry-fold y complemento a 1
// Input:  array de bytes (17 bytes del frame, sin checksum ni 0x0D)
// Output: byte de checksum (0x00-0xFF)
// Se usa tanto para VALIDAR paquetes recibidos como para GENERAR los enviados
```

**¿Cuándo usarla?** Siempre que se construya o valide un frame. No modificar el algoritmo sin coordinar con el firmware del Buddy.

---

### `runStateMachine()` — `src/js/script.js`

```js
// Crea y retorna un setInterval de 250ms
// Implementa el protocolo completo mediante switch(comando)
// Input:  ninguno (lee variables globales)
// Output: handle del interval (asignado a serialInterval)
// CRÍTICO: solo debe existir UNA instancia activa a la vez
//          guard: if (!serialInterval) serialInterval = runStateMachine()
```

---

### `processSensorData(sensorBytes)` — `src/js/script.js`

```js
// Decodifica el payload de 8 bytes del sensor
// Input:  Uint8Array o Array de 8 bytes (data[0..7] del frame)
// Output: llama window.updateVisualization con { handPosition, profundidad, freq }
//
// Decodificación:
//   handPosition = bytes[0] === 1 ? 'OK' : 'NOK'
//   profundidad  = bytes[1] | (bytes[2] << 8)   ← little-endian uint16
//   frecuencia   = bytes[3] | (bytes[4] << 8)   ← little-endian uint16
```

---

### `scheduleFinishOnce()` — `src/js/script.js`

```js
// Programa un timeout de 60 segundos para finalizar la maniobra
// Es IDEMPOTENTE: si ya está programado, ignora la llamada (guarda por finishScheduled)
// Protegido por sessionId: si la sesión cambia antes de que venza, cancela el timeout
// Efectos secundarios:
//   - Inicia la barra de progreso visual
//   - Al vencer: envía comando 0x05 al hardware, llama saveCharts()
```

---

### `handleDataForVisualization(parsedData)` — `src/js/visualizacion.js`

La función más compleja del sistema. Lógica de entrada:

```
1. isPaused?  → return (no actualizar nada)
2. handPos !== 'OK' y startTracking = false?  → return (esperar primera mano OK)
3. freq === 0 y !hasNonZeroFreq?
   → mostrar círculo de espera, actualizar solo handPos chart, return
4. freq > 0?
   → removeWaitingCircle(), hasNonZeroFreq = true
   → si freq cambió desde pastFreq: cerrar alerta previa de frecuencia cero
5. hasNonZeroFreq y freq === 0?
   → usar pastFreq/pastProf (valor congelado)
   → ContadorCeros++
   → si ContadorCeros === 3: mostrar alerta "maniobra detenida"
6. Evaluar isFreqCorrect, isProfCorrect, isHandOK
7. Actualizar badges con colores
8. Actualizar ventana deslizante de gráficos (últimos 7 puntos)
9. Acumular en fullData[], recordedData[]
10. Incrementar correctExecutions o incorrectExecutions
11. updateCharts()
```

---

## 12. Dependencias

### Chart.js v4.4.7

- **Uso:** Renderiza los 4 gráficos en tiempo real
- **Carga:** Local (`vendor/chart.umd.js`) — expone `window.Chart`
- **Instancias:** 4 permanentes (durante la sesión) + 4 temporales dentro del modal de resumen
- **Configuración relevante:**
  - `freqChart`: línea, eje Y fijo 80-140, plugin de zona verde 100-120
  - `profChart`: barras coloreadas por valor, eje Y invertido (mayor profundidad = mejor), zona verde 50-60
  - `pieChart`: pie estático, actualizado en cada compresión
  - `handPosChart`: doughnut, solo muestra el estado del momento actual (1 o 0)

### SweetAlert2 ^11

- **Uso:** Todos los popups, alertas y el modal de resumen
- **Carga:** CDN (`https://cdn.jsdelivr.net/npm/sweetalert2@11`)
- **Casos de uso:**
  - Popup de "poner bien las manos" (con auto-cierre cuando manos = OK)
  - Modal de resumen final (con preview de charts + botones de acción)
  - Alertas de error (batería baja, falla de sensor, maniobra detenida)

### Web Serial API (browser nativo)

- **Compatibilidad:** Chrome/Edge 89+. No funciona en Firefox, Safari.
- **Permisos:** Requiere gesto del usuario (click) para activar el picker
- **API usada:** `navigator.serial.requestPort()`, `port.open()`, `port.readable.getReader()`, `port.writable.getWriter()`

### File System Access API (browser nativo)

- **Compatibilidad:** Chrome/Edge 86+
- **API usada:** `window.showDirectoryPicker()`, `dirHandle.getFileHandle()`, `fileHandle.createWritable()`
- **Limitación:** Los `FileSystemDirectoryHandle` no son serializables a JSON → no se puede persistir entre sesiones correctamente

---

## 13. Hardware Relacionado

### Buddy (maniquí de entrenamiento)

- Dispositivo físico conectado por USB
- Comunicación: UART a 115200 bps via chip CP210x (Silicon Labs USB-to-UART bridge)
- El driver CP210x para Windows está en la carpeta `driver/`
- Protocolo propietario de frames de 19 bytes (ver sección 8)

### Instalación del driver (Windows)

1. Conectar el Buddy por USB
2. Correr `driver/install_driver.ps1` como administrador
3. O ejecutar `driver/instalador.exe` directamente
4. Verificar en Device Manager que aparezca como "Silicon Labs CP210x USB to UART Bridge"

### Compatibilidad del sistema

| Sistema | Soporte |
|---|---|
| Windows 10/11 + Chrome/Edge | ✅ Completo |
| macOS + Chrome/Edge | ✅ Sin driver adicional |
| Linux + Chrome/Edge | ✅ Sin driver adicional |
| Firefox (cualquier OS) | ❌ Web Serial API no soportada |
| Safari (cualquier OS) | ❌ Web Serial API no soportada |
| Mobile (cualquier browser) | ❌ Web Serial API no soportada |

---

## 14. Configuración y Setup

### Requisitos

- Browser: Chrome 89+ o Edge 89+
- Servidor local: cualquiera (Live Server, Python http.server, etc.)
- Driver CP210x instalado (solo Windows, ver sección 13)

### Levantar el proyecto localmente

```bash
# Opción 1: VS Code + Live Server (configurado en .vscode/settings.json)
# Puerto: 5503
# Click derecho en index.html → "Open with Live Server"

# Opción 2: Python
python3 -m http.server 8080
# Abrir http://localhost:8080

# Opción 3: Node.js
npx serve .
```

> ⚠️ No abrir `index.html` directamente como archivo (`file://`). Web Serial API y File System Access API requieren un origen seguro (`localhost` o `https://`).

### Variables configurables (hardcodeadas en el código)

Estas "variables de configuración" están directamente en el código. Para modificarlas hay que editar los archivos:

| Variable | Archivo | Línea | Descripción |
|---|---|---|---|
| `PROGRESS_DURATION = 60` | `script.js` | ~78 | Duración de la maniobra en segundos |
| `cambioDeId = 0x64` | `script.js` | ~20 | ID del Buddy en el protocolo |
| `freqIdealMin = 100` | `visualizacion.js` | ~41 | Frecuencia mínima correcta (cpm) |
| `freqIdealMax = 120` | `visualizacion.js` | ~42 | Frecuencia máxima correcta (cpm) |
| `profIdealMin = 50` | `visualizacion.js` | ~43 | Profundidad mínima correcta (mm) |
| `profIdealMax = 60` | `visualizacion.js` | ~44 | Profundidad máxima correcta (mm) |
| `DEBUG = true` | `script.js` | ~58 | Habilita logs en consola |
| `MAX_CSV_FILES = 100` | `visualizacion.js` | ~47 | Máximo de CSV antes de rotar |
| `baudRate: 115200` | `script.js` | ~659 | Velocidad del puerto serial |

---

## 15. Zonas Frágiles y Riesgos

### 🔴 Comunicación entre módulos vía `window.*`

Toda la comunicación entre `script.js` y `visualizacion.js` pasa por el objeto global `window`. Si se renombra `updateVisualization` en un archivo, el otro falla silenciosamente en runtime. No hay contrato estático ni verificación en tiempo de carga.

**Riesgo:** Un refactor desincronizado rompe la app sin errores en la carga.

---

### 🔴 Estado mutable compartido

Las variables `comando` y `data` son el "mailbox" entre el read loop y el state machine. Si el hardware envía dos frames antes de que el state machine procese el primero, el primero se pierde silenciosamente.

**Riesgo:** Pérdida de frames en condiciones de alta frecuencia de envío del hardware.

---

### 🟠 Timer de finalización duplicado (case 0x68)

En el `case 0x68` del switch, existe un `setTimeout` local de 60 segundos que duplica la lógica de `scheduleFinishOnce()`. Ambos pueden llamar a `saveCharts()` independientemente.

**Riesgo:** El modal de resumen puede aparecer dos veces en ciertos flujos.

---

### 🟠 `FileSystemDirectoryHandle` no persiste

El intento de restaurar la carpeta de guardado desde `localStorage` es código que no funciona. El handle no es serializable a JSON; solo se guarda el nombre de la carpeta.

**Riesgo:** El usuario cree que la carpeta está guardada, pero en cada nueva sesión debe volver a seleccionarla.

---

### 🟠 Sin manejo de desconexión abrupta del hardware

Si el USB se desconecta mientras hay una sesión activa, el read loop lanza un error que es capturado pero no comunica nada al usuario. La app queda en un estado inconsistente (state machine corriendo sin puerto serial).

**Riesgo:** El usuario no sabe que el hardware se desconectó.

---

### 🟢 Charts creados sin destruirse en el modal de resumen

Cada vez que se abre `saveCharts()`, se crean 4 instancias nuevas de Chart.js dentro del modal. Si el usuario abre el modal muchas veces sin recargar, Chart.js acumula instancias en memoria.

---

## 16. Roadmap Técnico

### Corto plazo — Sin romper nada

1. **Agregar `package.json` + ESLint** para atrapar bugs de scope como el de `const freq` antes de que lleguen al código
2. **Agregar `.gitignore`** (excluir `node_modules/`, binarios)
3. **Reemplazar todos los `alert()` nativos** por `Swal.fire()` consistente
4. **Documentar las constantes del protocolo** en un objeto `const CMD = { ... }` al inicio de `script.js`
5. **Arreglar el bug de `generateSimulatedData`** para poder testear sin hardware

### Mediano plazo — Mejoras de arquitectura

6. **Encapsular el estado** en un objeto `AppState` para eliminar los 35 globales
7. **Reemplazar `window.*` por Custom Events** para desacoplar los dos módulos:
   ```js
   // script.js → emite
   window.dispatchEvent(new CustomEvent('sensor:data', { detail: parsed }));
   // visualizacion.js → escucha
   window.addEventListener('sensor:data', (e) => handleData(e.detail));
   ```
8. **Persistir `FileSystemDirectoryHandle` en IndexedDB** para que la carpeta de guardado sobreviva entre sesiones
9. **Agregar indicador de estado de conexión** en la UI (conectado / desconectado / error)
10. **Manejar desconexión abrupta del hardware** usando `serialPort.addEventListener('disconnect', ...)`

### Largo plazo — Si el proyecto crece

11. **Migrar a ES Modules** (`<script type="module">`) para imports explícitos y tree-shaking
12. **Agregar tests unitarios** para las funciones puras (`calculateChecksum`, `processSensorData`, `processData`)
13. **Separar el protocolo en un archivo propio** (`src/js/protocol.js`) independiente de la UI
14. **Considerar un framework liviano** (Vue 3 con CDN, sin build step) si se agregan más pantallas o flujos complejos
15. **Agregar un `README.md`** con setup, protocolo, capturas de pantalla y guía de contribución

---

*Documento generado con análisis estático completo del código fuente en branch `feature/mejoras`. Última actualización: 2026-05-11.*
