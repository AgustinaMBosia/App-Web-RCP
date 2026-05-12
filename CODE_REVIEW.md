# CODE REVIEW — Simulador RCP
**Revisión:** 2026-05-11  
**Branch analizado:** `feature/mejoras`  
**Stack:** Vanilla HTML · CSS · JavaScript ES Modules (sin framework, sin bundler)  
---

## Resumen Ejecutivo

La migración a ES Modules (Fase 6) fue un gran paso adelante: el estado está encapsulado en `AppState`, los ciclos circulares se rompieron con `_hooks`, y el código quedó modular y legible. Sin embargo, la refactorización introdujo algunos bugs nuevos y dejó varios riesgos latentes que conviene atender antes de poner el sistema en uso con alumnos.

**Prioridades:**
- 🔴 3 bugs que producen comportamiento incorrecto observable
- 🟠 4 riesgos que pueden dar problemas en condiciones reales
- 🟢 5 mejoras de UX y calidad que elevarían el nivel del producto

---

## 1. Bugs Activos

### 🔴 BUG CRÍTICO — `idDestino` incorrecto en `scheduleFinishOnce`

**Ubicación:** `src/js/protocol-handlers/handlers.js:24`

```js
sendToModule({
    idDestino: CMD.HANDS_STATUS,   // ← BUG: CMD.HANDS_STATUS = 0x66, no es una dirección
    idPag: AppState.contadorUniversal,
    idOrigen: 0x01,
    comando: CMD.FINISH,
    data: AppState.data
});
```

`CMD.HANDS_STATUS` es un byte de *comando* (0x66), no una dirección de destino. El frame de FINISH se envía a la dirección 0x66 en lugar de `BUDDY_ID` (0x64). El módulo hardware no reconocerá el mensaje.

**Fix:**
```js
sendToModule({ idDestino: BUDDY_ID, ...resto });
```

---

### 🔴 BUG CRÍTICO — Triple incremento de `sessionId` al cerrar la conexión

**Ubicación:** `src/js/serial/serialManager.js:72-73`

Cuando `closeSerialConnection()` termina, ejecuta:
```js
AppState._hooks.resetAllStates?.();   // → resetSession() → sessionId++
AppState._hooks.resetCharts?.();      // → nextSession() → sessionId++ AGAIN
                                      // → restartSerialLoop() → resetAllStates() → resetSession() → sessionId++ THIRD TIME
```

La cadena completa es:
1. `closeSerialConnection` → `resetAllStates` → `resetSession()` (+1)
2. `closeSerialConnection` → `resetCharts` → `nextSession()` (+1)
3. `closeSerialConnection` → `resetCharts` → `restartSerialLoop` → `resetAllStates` → `resetSession()` (+1)

Con tres sessionIds de diferencia, el `setInterval` del state machine creado en el paso 3 puede ser invalidado inmediatamente si algo lo compara con `AppState.sessionId`. El serial loop queda muerto sin feedback.

**Fix:** `closeSerialConnection` solo debería llamar a una sola función de reset limpia, no dos en cadena:
```js
// Opción simple: quitar el resetCharts de closeSerialConnection
// El resetCharts lo maneja el usuario vía el botón Reiniciar
AppState._hooks.resetAllStates?.();
// quitar la línea de resetCharts aquí
```

---

### 🔴 BUG CRÍTICO — `scheduleChannelFinish()` crea timeouts ilimitados

**Ubicación:** `src/js/protocol-handlers/handlers.js:190-211`

`handleSensorData()` llama a `scheduleChannelFinish()` en cada ejecución:
```js
export function handleSensorData() {
    // ...
    scheduleFinishOnce();
    scheduleChannelFinish();   // ← llamado en CADA tick, sin guard
}
```

`scheduleChannelFinish()` crea un nuevo `setTimeout` de 60 segundos sin verificar si ya hay uno pendiente. Si el estado machine corre a 250ms y la maniobra dura 60 segundos, se crean **~240 timeouts** apuntando a `saveCharts()`. El guard `flagCierroPopup` evita múltiples popups, pero los 240 callbacks siguen ejecutándose, contaminando el estado.

`scheduleFinishOnce()` ya hace esto correctamente con su flag `finishScheduled`. `scheduleChannelFinish` debería hacer lo mismo, o bien eliminarse ya que es redundante con `scheduleFinishOnce`.

**Fix:**
```js
// Opción A — agregar guard en scheduleChannelFinish:
export function scheduleChannelFinish() {
    if (AppState.channelFinishScheduled) return;
    AppState.channelFinishScheduled = true;
    // ...
}

// Opción B — eliminar scheduleChannelFinish y unificar en scheduleFinishOnce
```

---

### 🟠 BUG MEDIO — `stuckTimeout` y contadores de paquete no se limpian en `resetSession()`

**Ubicación:** `src/js/state/appState.js:67-87`

`resetSession()` no resetea:
- `stuckTimeout` — si hay un timeout pendiente de "sin recepción de datos", sigue vivo y puede disparar `saveCharts()` en la sesión nueva
- `samePacketCount` — el contador de paquetes repetidos puede quedar en 9 y disparar el alerta con el primer paquete de la nueva sesión
- `lastPacketId` — ídem

**Fix:** Agregar en `resetSession()`:
```js
if (this.stuckTimeout) { clearTimeout(this.stuckTimeout); this.stuckTimeout = null; }
this.samePacketCount = 0;
this.lastPacketId    = null;
```

---

## 2. Riesgos Latentes

### 🟠 RIESGO — `Swal.fire` sin guard en varios módulos

`window.Swal` solo está verificado en `handlers.js` y `logger.js`. En estos archivos se llama directamente:

| Archivo | Línea | Llamada |
|---|---|---|
| `dataHandler.js` | 65 | `Swal.fire({ title: 'Maniobra detenida'...` |
| `csvExport.js` | 36 | `Swal.fire({ title: '✅ CSV guardado'...` |
| `summaryModal.js` | 21 | `Swal.fire({ title: '📊 Resumen'...` |

Si el CDN de SweetAlert2 falla (red lenta, bloqueador de contenido, empresa con proxy), estos lanzarán `ReferenceError: Swal is not defined` y romperán la finalización de la maniobra.

**Fix:**
```js
// En logger.js ya está bien:
export function showAlert(options) {
    if (window.Swal) return Swal.fire(options);
    console.warn('Swal no disponible:', options.title);
}
// Usar showAlert() en lugar de Swal.fire() directamente en todos los módulos.
```

---

### 🟠 RIESGO — File System Access API no disponible en Firefox ni Safari

`csvExport.js` usa `window.showDirectoryPicker()` sin verificar soporte del browser:

```js
if (!savedDirHandle) savedDirHandle = await window.showDirectoryPicker();
```

Firefox y Safari no soportan esta API. El `catch` captura el error pero muestra un alerta genérico de "Error al guardar CSV" en lugar de explicar el problema real.

**Fix:**
```js
if (!('showDirectoryPicker' in window)) {
    // fallback: URL.createObjectURL + link click
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: fileName });
    a.click();
    URL.revokeObjectURL(url);
    return;
}
```

---

### 🟠 RIESGO — `downloadCSV` silencioso cuando no hay datos

**Ubicación:** `src/js/visualization/csvExport.js:14`

```js
export async function downloadCSV() {
    if (recordedData.length === 0) return;  // silencioso
```

Si el usuario llega a la pantalla de resumen sin haber completado comprensiones (estado raro pero posible), el botón "⬇ Guardar CSV" no hace nada visible. El usuario puede clickearlo varias veces sin entender qué pasa.

**Fix:**
```js
if (recordedData.length === 0) {
    showAlert({ title: 'Sin datos', text: 'No hay compresiones registradas para exportar.', icon: 'info', timer: 2000, showConfirmButton: false });
    return;
}
```

---

### 🟠 RIESGO — Bluetooth: lógica completa en JS pero sin botón en HTML

**Ubicación:** `src/js/main.js:89-143`

Todo el handler de Bluetooth (~55 líneas) está implementado en `main.js` pero el botón no existe en `index.html`:
```js
const bluetoothButton = document.getElementById('bluetoothButton'); // → null siempre
```
El código es dead code que ocupa espacio y puede confundir. O se implementa el botón, o se elimina el handler.

---

### 🟢 RIESGO BAJO — `beforeunload` no implementado

Si el usuario cierra la pestaña o recarga durante una maniobra activa, los datos se pierden sin ningún aviso:

**Mejora sugerida:**
```js
window.addEventListener('beforeunload', (e) => {
    if (AppState.currentState !== 'IDLE' && AppState.currentState !== 'FINISH') {
        e.preventDefault();
        e.returnValue = ''; // muestra diálogo nativo de confirmación
    }
});
```

---

## 3. Mejoras de UX

### 🟢 MEJORA — Contador de compresiones no visible en la UI

`globalCounter` en `dataHandler.js` cuenta las compresiones en tiempo real pero nunca se muestra. El usuario no sabe cuántas compresiones lleva.

**Implementación sugerida:** Agregar un badge en la sección de gráficos:
```html
<!-- index.html — dentro del progress-panel o como nuevo card -->
<div class="stat-chip">
    <span class="stat-label">Compresiones</span>
    <span id="compressionCounter" class="stat-value">0</span>
</div>
```
```js
// dataHandler.js — al final de handleDataForVisualization:
const el = document.getElementById('compressionCounter');
if (el) el.textContent = globalCounter;
```

---

### 🟢 MEJORA — Evaluación pass/fail al finalizar

El resumen actual muestra el porcentaje de correctas, pero no hay un criterio explícito de aprobación. Para uso educativo, sería valioso mostrar un resultado claro:

```
≥ 70% correctas → "APROBADO ✓"  
< 70%           → "A mejorar — repetir la práctica"
```

Esto requiere solo modificar `summaryModal.js` y agregar la constante de umbral en `constants.js`.

---

### 🟢 MEJORA — Estado vacío en los gráficos al iniciar

Cuando la app carga, los 4 gráficos aparecen con ejes vacíos y sin ningún mensaje. El usuario nuevo no entiende que debe conectarse primero.

**Fix simple:** Agregar un overlay de "empty state" en cada chart-card que se oculte al llegar el primer dato:
```html
<div class="chart-empty-state">Conectá el dispositivo para ver datos</div>
```

---

### 🟢 MEJORA — `resetButton` no sincroniza el estado del botón serial

**Ubicación:** `src/js/main.js:95`

```js
if (resetButton) resetButton.addEventListener('click', resetCharts);
```

`resetCharts()` llama a `restartSerialLoop()`, que no resetea el estado visual del botón serial. Si el usuario estaba conectado, el botón dice "Conectado ✓" (disabled) pero la conexión serial sigue activa. Si no estaba conectado, el reset es innecesario pero inocuo.

---

### 🟢 MEJORA — Sin confirmación antes de resetear

Si el usuario hace click en "Reiniciar" durante una maniobra activa, los datos se pierden sin aviso. Agregar una confirmación si hay datos en progreso:

```js
resetButton.addEventListener('click', () => {
    if (AppState.currentState !== 'IDLE' && !AppState.finishPopupShown) {
        Swal.fire({
            title: '¿Reiniciar maniobra?',
            text: 'Se perderán los datos actuales.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, reiniciar',
            cancelButtonText: 'Cancelar'
        }).then(r => { if (r.isConfirmed) resetCharts(); });
    } else {
        resetCharts();
    }
});
```

---

## 4. Features Recomendadas

### Prioridad 1 — Detección de browser incompatible
Web Serial API solo funciona en Chromium (Chrome, Edge, Opera). Mostrar una alerta en Firefox/Safari antes de que el usuario intente conectar y falle con un mensaje críptico.

```js
// En main.js, dentro de DOMContentLoaded:
if (!('serial' in navigator)) {
    showAlert({
        title: '⚠️ Navegador no compatible',
        html: 'Web Serial requiere <strong>Chrome o Edge</strong>.<br>Firefox y Safari no son compatibles.',
        icon: 'warning',
        confirmButtonText: 'Entendido'
    });
    if (serialButton) serialButton.disabled = true;
}
```

### Prioridad 1 — Historial de sesiones en IndexedDB
Actualmente cada "Nueva Maniobra" borra todos los datos. Para uso académico sería valioso mantener un historial de las últimas N maniobras consultable desde la app, sin necesidad de exportar CSV cada vez.

### Prioridad 2 — Exportar resumen como PDF / imagen
Muchos docentes querrán guardar o imprimir el resumen. `html2canvas` + `jsPDF` (ambos disponibles via CDN) permiten exportar el modal de resumen como PDF con una sola función.

### Prioridad 2 — Metrónomo de audio
Durante la maniobra, un beep a 110 cpm ayuda al operador a mantener el ritmo correcto. Implementable con Web Audio API sin dependencias externas:

```js
function startMetronome(bpm = 110) {
    const ctx = new AudioContext();
    const interval = setInterval(() => {
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    }, (60 / bpm) * 1000);
    return interval;
}
```

### Prioridad 3 — Configuración de umbrales
Los rangos óptimos (100–120 cpm, 50–60 mm) están hardcodeados en `constants.js`. Para investigación clínica o adaptación a distintos protocolos, sería valioso exponerlos como configuración accesible desde la UI.

---

## 5. Deuda Técnica

### `AppState._hooks` es manual e implícito
El patrón de hooks resuelve los ciclos de import, pero depende de que `main.js` registre todos los hooks antes de que se llame cualquier función que los use. Si un módulo nuevo llama a un hook antes de `DOMContentLoaded`, falla silenciosamente (el hook es `null`). Documentar este contrato en un comentario en `appState.js`.

### `flagSendData` y `sendDataFlag` — nombres confusos
En `appState.js` existen dos flags con nombres casi idénticos:
- `flagSendData` — booleano de estado del handshake
- `sendDataFlag` — refleja `data[5] === 0x01` del hardware

La similitud produce bugs silenciosos. Renombrar a algo semánticamente distinto: `handshakeComplete` y `hardwareSendFlag`.

### JSDoc ausente en funciones del protocolo
Las funciones de `handlers.js` implementan lógica de protocolo hardware que no es obvia del nombre. Sin documentación, cualquier colaborador nuevo tarda horas en entender `handleAckHandsHandshake()`. Agregar al menos un comentario de qué comando del protocolo corresponde a cada handler.

### Sin tests
Cero cobertura de tests. Las funciones más críticas (`processData`, `calculateChecksum`, `processSensorData`, `handleDataForVisualization`) son puras o casi puras y perfectamente testeables con Vitest o Jest sin browser. Un test de checksum que corra en CI captura regresiones del protocolo antes de que lleguen al hardware.

---

## Checklist de Calidad (estado actual)

| Categoría | Estado | Detalle |
|---|---|---|
| Funcionalidad core | ⚠️ Parcial | Bug de idDestino en FINISH |
| Arquitectura modular | ✅ | ES Modules + AppState encapsulado |
| Ciclos de import | ✅ | Resueltos con `_hooks` |
| Sin bugs críticos | ❌ | 3 bugs activos |
| UX consistente | ⚠️ | Falta empty state, contadores, confirmaciones |
| Seguridad | ⚠️ | Swal sin guard en 3 módulos |
| Performance | ✅ | `chart.update('none')`, ventana deslizante |
| Compatibilidad browser | ❌ | Sin detección de browser, sin fallback CSV |
| Tests | ❌ | Cero cobertura |
| Documentación | ❌ | Sin JSDoc en el protocolo |
| Control de versiones | ✅ | Git en uso |

---

## Roadmap Sugerido

### Sprint inmediato (esta semana)
1. Fix `idDestino: CMD.HANDS_STATUS` → `BUDDY_ID` en `handlers.js:24`
2. Fix triple sessionId en `closeSerialConnection`
3. Fix `scheduleChannelFinish` sin guard
4. Agregar limpieza de `stuckTimeout` en `resetSession()`

### Sprint corto (próxima semana)
5. Detección de browser incompatible con fallback CSV
6. Guard `window.Swal` en `dataHandler.js`, `csvExport.js`, `summaryModal.js`
7. Confirmación antes de Reiniciar durante maniobra activa
8. Renombrar `flagSendData` / `sendDataFlag`

### Sprint mediano
9. Contador de compresiones visible en la UI
10. Criterio pass/fail en el resumen
11. `beforeunload` guard durante maniobra activa
12. Eliminar o implementar el botón Bluetooth

---

*Análisis generado sobre el código del branch `feature/mejoras` — commit `0087ad0`.*
