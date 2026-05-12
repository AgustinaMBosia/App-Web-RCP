# Plan de modularización — App-Web-RCP

## Contexto

El proyecto arrancó con dos archivos monolíticos (`script.js` y `visualizacion.js`) que mezclaban
comunicación serial, lógica de protocolo, UI, visualización y simulación en el mismo scope global.

El objetivo es dividirlos en módulos con responsabilidades claras, sin bundler y sin romper la app
en ningún paso intermedio.

---

## Estrategia de migración

Se adopta una estrategia incremental de tres etapas:

1. **Extracción con classic scripts** (Fases 1–3): mover código a archivos separados que se cargan
   con `<script>` normales. Sin cambios de lógica. La app sigue funcionando en cada paso.
2. **Centralización de estado** (Fase 2): reemplazar `window.*` y variables globales dispersas por
   un objeto `AppState` como única fuente de verdad.
3. **Migración a ES Modules** (Fase final): convertir a `import/export`, único `<script type="module">`
   en el HTML. Requiere servidor HTTP (no funciona con `file://`).

---

## Arquitectura objetivo

```
src/js/
├── main.js                        ← bootstrap: imports, event listeners
│
├── protocol/
│   ├── constants.js               ✅ CMD, BUDDY_ID, PROGRESS_DURATION
│   └── checksum.js                ✅ calculateChecksum()
│
├── state/
│   └── appState.js                ✅ objeto singleton con todo el estado mutable
│
├── serial/
│   ├── serialManager.js           ✅ sendToModule(), stopSerialLoop(), closeSerialConnection()
│   └── frameParser.js             ✅ acumulador de bytes → frames válidos
│
├── protocol-handlers/
│   ├── stateMachine.js            ✅ runStateMachine(), COMMAND_HANDLERS, detectSendDataEntry()
│   └── handlers.js                ✅ handlePing(), handleSensorData(), etc.
│
├── sensors/
│   └── sensorProcessor.js         ✅ processSensorData(), processData()
│
├── simulation/
│   └── simulator.js               ✅ generateSimulatedData(), toggleSimulation()
│
├── ui/
│   ├── connectionStatus.js        ✅ setConnectionStatus()
│   ├── progressBar.js             ✅ startProgressBar(), stopProgressBar()
│   └── alerts.js                  ✅ showAlert(), abrirPopup()
│
└── visualization/
    ├── chartManager.js            ✅ instancias Chart, updateCharts(), resetCharts()
    ├── badges.js                  ✅ updateBadge(), setBadgeColor(), resetBadges()
    ├── dataHandler.js             ✅ handleDataForVisualization(), updateVisualization()
    ├── overlay.js                 ✅ showWaitingCircle(), hideWaitingCircle()
    ├── csvExport.js               ✅ downloadCSV()
    └── summaryModal.js            ✅ saveCharts() y charts del modal
```

Leyenda: ✅ completado · 🔄 en progreso · ⬜ pendiente

---

## Fases

### Fase 1 — Extracción sin riesgo ✅

**Objetivo**: mover código sin cambiar ninguna lógica. La app funciona igual al terminar.

**Archivos creados**:

| Archivo | Qué contiene | Extraído de |
|---|---|---|
| `src/js/protocol/constants.js` | `CMD`, `BUDDY_ID`, `PROGRESS_DURATION` | `script.js` líneas 4–22 |
| `src/js/protocol/checksum.js` | `calculateChecksum()` | `script.js` líneas 86–91 |
| `src/js/ui/progressBar.js` | `startProgressBar()`, `stopProgressBar()`, `progressInterval`, `progressSeconds` | `script.js` líneas 65–67 y 94–130 |

**Archivos modificados**:

- `src/js/script.js`: eliminadas las definiciones extraídas, reemplazadas por comentarios de referencia
- `index.html`: añadidos los tres nuevos `<script>` antes de `visualizacion.js`

**Orden de carga en index.html tras la fase**:
```html
<script src="src/js/protocol/constants.js"></script>
<script src="src/js/protocol/checksum.js"></script>
<script src="src/js/ui/progressBar.js"></script>
<script src="src/js/visualizacion.js"></script>
<script src="src/js/script.js"></script>
```

**Verificación**: la app debe funcionar idénticamente. Probar conexión serial, simulación y
progress bar antes de continuar.

---

### Fase 2 — Centralización de estado ✅

**Objetivo**: crear `state/appState.js` que reemplace todos los `window.*` y variables globales
dispersas. Es el cambio de mayor impacto y mayor riesgo — hacerlo en rama separada con PR.

**Variables a centralizar**:

| Variable actual | Dónde vive hoy | Riesgo |
|---|---|---|
| `window.sessionId` | Mutada en `script.js` Y `visualizacion.js` | ⚠️ Alto — race condition |
| `window.finishPopupShown` | Leída y escrita en ambos archivos | ⚠️ Alto |
| `window.handsPopupShownThisSession` | Escrita en ambos | Medio |
| `window.handsOk` | `script.js` escribe, `visualizacion.js` no lee | Bajo |
| `currentState`, `contadorUniversal`, `comando`, `data` | Solo `script.js` | Bajo |

**API objetivo**:
```js
// state/appState.js
const AppState = {
    sessionId: 0,
    currentState: 'IDLE',
    // ...
    nextSession() { this.sessionId++; },
    reset() { /* ... */ }
};
```

**Archivos creados**:

| Archivo | Qué contiene |
|---|---|
| `src/js/state/appState.js` | `AppState` con todos los campos de estado + `nextSession()` + `resetSession()` |

**Archivos modificados**:

- `src/js/script.js`: reescrito completo — todas las variables sueltas y `window.*` reemplazadas por `AppState.*`
- `src/js/visualizacion.js`: 3 reemplazos puntuales en `window.resetCharts`:
  - `window.sessionId++` → `AppState.nextSession()`
  - `window.finishPopupShown = false` → `AppState.finishPopupShown = false`
  - `window.handsPopupShownThisSession = false` → `AppState.handsPopupShownThisSession = false`
- `index.html`: añadido `<script src="src/js/state/appState.js">` entre `progressBar.js` y `visualizacion.js`

**Orden de carga en index.html tras la fase**:
```html
<script src="src/js/protocol/constants.js"></script>
<script src="src/js/protocol/checksum.js"></script>
<script src="src/js/ui/progressBar.js"></script>
<script src="src/js/state/appState.js"></script>
<script src="src/js/visualizacion.js"></script>
<script src="src/js/script.js"></script>
```

**Verificación**: probar simulación (toggle inicio/pausa/stop), progress bar, reset, y que el
modal de resumen final aparezca correctamente sin duplicarse.

---

### Fase 3 — Comunicación serial ✅

**Objetivo**: aislar el I/O en `serial/serialManager.js` y `serial/frameParser.js`.

**Archivos creados**:

| Archivo | Qué contiene | Extraído de |
|---|---|---|
| `src/js/serial/frameParser.js` | `startSerialReadLoop()` — acumula bytes y escribe el frame en `AppState` | `script.js` |
| `src/js/serial/serialManager.js` | `sendToModule()`, `stopSerialLoop()`, `closeSerialConnection()` | `script.js` |

**Decisión de diseño**: el frame parser sigue escribiendo directamente en `AppState` (no usa
CustomEvent todavía). La migración a eventos se hará en Fase 6 junto con ES Modules, donde el
dispatch/listener queda explícito vía `import/export`.

**Nota sobre dependencias en runtime**: `frameParser.js` y `serialManager.js` cargan ANTES que
`script.js`, pero las funciones que usan (`log()`, `setConnectionStatus()`, `resetAllStates()`)
sólo se llaman en runtime (tras DOMContentLoaded). No hay conflicto de orden de carga.

`window.closeSerialConnection` se asigna desde `serialManager.js` para que `visualizacion.js`
pueda llamarla desde el botón "Cerrar" del modal.

**Orden de carga en index.html tras la fase**:
```html
<script src="src/js/protocol/constants.js"></script>
<script src="src/js/protocol/checksum.js"></script>
<script src="src/js/ui/progressBar.js"></script>
<script src="src/js/state/appState.js"></script>
<script src="src/js/serial/frameParser.js"></script>
<script src="src/js/serial/serialManager.js"></script>
<script src="src/js/visualizacion.js"></script>
<script src="src/js/script.js"></script>
```

**Verificación**: probar simulación, y si es posible, conexión serial real. Verificar que
"Terminar maniobra" y el modal de resumen siguen funcionando.

---

### Fase 4 — Handlers y state machine ✅

**Objetivo**: mover `COMMAND_HANDLERS`, `runStateMachine()` y todos los `handle*()` a
`protocol-handlers/`. Ya estaban bien separados desde el refactor previo — este paso fue casi copiar-pegar.

**Archivos creados**:

| Archivo | Qué contiene | Extraído de |
|---|---|---|
| `src/js/protocol-handlers/handlers.js` | `scheduleFinishOnce()`, `processSensorData()`, `abrirPopup()`, `checkStuckPacket()`, todos los `handle*()`, `scheduleChannelFinish()` | `script.js` |
| `src/js/protocol-handlers/stateMachine.js` | `COMMAND_HANDLERS`, `detectSendDataEntry()`, `runStateMachine()` | `script.js` |

**Orden de carga crítico**: `handlers.js` debe cargar ANTES que `stateMachine.js` porque
`COMMAND_HANDLERS` referencia las funciones `handle*()` en el momento en que el script se evalúa
(es un `const` top-level, no está dentro de una función).

**`script.js` tras la fase**: 209 líneas — solo helpers de UI, ciclo de vida de sesión,
`processData()`, `generateSimulatedData()`, event listeners, y `window.restartSerialLoop`.

**Orden de carga en index.html tras la fase**:
```html
<script src="src/js/protocol/constants.js"></script>
<script src="src/js/protocol/checksum.js"></script>
<script src="src/js/ui/progressBar.js"></script>
<script src="src/js/state/appState.js"></script>
<script src="src/js/serial/frameParser.js"></script>
<script src="src/js/serial/serialManager.js"></script>
<script src="src/js/protocol-handlers/handlers.js"></script>
<script src="src/js/protocol-handlers/stateMachine.js"></script>
<script src="src/js/visualizacion.js"></script>
<script src="src/js/script.js"></script>
```

**Verificación**: probar simulación completa y botón "Terminar maniobra".

---

### Fase 5 — Visualización ✅

**Objetivo**: dividir `visualizacion.js` (450 líneas, 6 responsabilidades) en módulos específicos.

El orden interno recomendado:
1. `overlay.js` (sin dependencias)
2. `badges.js` (sin dependencias de Charts)
3. `csvExport.js` (solo usa `recordedData`)
4. `chartManager.js` (las instancias Chart)
5. `dataHandler.js` (usa badges + charts)
6. `summaryModal.js` (usa todo lo anterior)

---

### Fase 6 — Migración a ES Modules y wiring final ✅

**Objetivo**: convertir a `import/export`, escribir `main.js` como único entry point y dejar
`index.html` con un solo `<script type="module" src="src/js/main.js">`.

**Requisito**: la app debe servirse desde un servidor HTTP (`npx serve .` o VS Code Live Server).
Los ES Modules no funcionan con el protocolo `file://`.

**Riesgos conocidos**:
- Imports circulares entre `stateMachine.js` ↔ `summaryModal.js` — resolverlos vía `AppState`
- `Chart.js` es UMD (`window.Chart`) — acceder vía `window.Chart` o usar import dinámico
- `SweetAlert2` viene de CDN — seguir usando `window.Swal` con guard

---


**Objetivo alcanzado**: todos los archivos usan `import`/`export` explicitos. `main.js` es el unico entry point. `index.html` tiene un solo `<script type="module">`.

**Archivos creados**:

| Archivo | Que contiene |
|---|---|
| `src/js/ui/logger.js` | `log()`, `setConnectionStatus()`, `showAlert()` |
| `src/js/main.js` | Bootstrap: hooks, event listeners, `resetAllStates()`, `restartSerialLoop()` |

**Patron para dependencias circulares**: `AppState._hooks` almacena referencias a funciones que formarian ciclos si se importaran directamente. `main.js` las cablea en `DOMContentLoaded`.

| Hook | Definida en | Usada desde |
|---|---|---|
| `saveCharts` | `summaryModal.js` | `handlers.js`, `main.js` |
| `resetCharts` | `visualizacion.js` | `summaryModal.js`, `main.js` |
| `closeSerialConnection` | `serialManager.js` | `summaryModal.js` |
| `updateVisualization` | `dataHandler.js` | `handlers.js`, `main.js` |
| `resetAllStates` | `main.js` | `serialManager.js` |
| `restartSerialLoop` | `main.js` | `visualizacion.js` |

**`isPaused` movido a `AppState`**: eliminaba la dependencia circular `chartManager` -> `dataHandler`.

**Requisito de servidor HTTP**: los ES Modules no funcionan con `file://`. Servir con VS Code Live Server o `npx serve .`.

**Verificacion**: probar simulacion, modal de resumen, CSV, reset y cierre serial.

---

## Acoplamiento actual (mapa de dependencias entre archivos)

```
script.js ──────────────────────────────────────────► visualizacion.js
  window.updateVisualization()   (processSensorData, processData)
  window.saveCharts()            (scheduleFinishOnce, scheduleChannelFinish)
  window.resetCharts()           (closeSerialConnection)

visualizacion.js ───────────────────────────────────► script.js
  window.restartSerialLoop()     (resetCharts)
  window.closeSerialConnection() (saveCharts → botón "Cerrar")
  AppState.nextSession()         (resetCharts) ← ✅ resuelto en Fase 2
  AppState.finishPopupShown      (resetCharts) ← ✅ resuelto en Fase 2
```

Las mutaciones cruzadas de estado vía `window.*` fueron eliminadas en la Fase 2.
Las dependencias de función cruzadas (`window.saveCharts`, `window.restartSerialLoop`, etc.)
se resolverán en la Fase 6 vía imports explícitos de ES Modules.
