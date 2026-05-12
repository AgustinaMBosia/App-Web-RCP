# Arquitectura del Proyecto — Simulador RCP

## 1. Resumen general

El **Simulador RCP** es una aplicación web (HTML, CSS y JavaScript) que acompaña la práctica de compresiones torácicas con un maniquí compatible (Buddy). La app se comunica por **Web Serial** (navegadores Chromium) con el hardware, interpreta un **protocolo binario** propio, mantiene una **máquina de estados** que refleja el handshake y el envío de datos, y muestra en pantalla **frecuencia**, **profundidad**, **posición de manos** y métricas de calidad mediante **Chart.js** y badges.

Tras la refactorización a **ES Modules** (sin bundler ni framework), el código se organizó en carpetas por responsabilidad: protocolo puro, capa serial, manejadores de alto nivel, estado global y visualización. El objeto **`AppState`** concentra el estado compartido; los **`AppState._hooks`** permiten que módulos de bajo nivel (por ejemplo `handlers.js`) invoquen acciones definidas en `main.js` sin crear **importaciones circulares** entre archivos.

---

## 2. Estructura general de carpetas

Punto de entrada: `index.html` carga `src/js/main.js` como `<script type="module">`. Recursos relacionados: `src/css/style.css`, `src/assets/`, `vendor/chart.umd.js` y SweetAlert2 por CDN.

Árbol real de **`src/js/`**:

```
src/js/
├── main.js
├── visualizacion.js
├── state/
│   └── appState.js
├── protocol/
│   ├── constants.js
│   └── checksum.js
├── serial/
│   ├── serialManager.js
│   └── frameParser.js
├── protocol-handlers/
│   ├── stateMachine.js
│   └── handlers.js
├── ui/
│   ├── logger.js
│   └── progressBar.js
└── visualization/
    ├── chartManager.js
    ├── dataHandler.js
    ├── badges.js
    ├── overlay.js
    ├── csvExport.js
    └── summaryModal.js
```

---

## 3. Flujo principal de funcionamiento

El recorrido típico con **Web Serial** es:

**Usuario → `main.js`** → el usuario elige conexión serial (o simulación / Bluetooth). Al conectar serial: se abre el puerto a 115200 baudios, se inicia **`startSerialReadLoop`** en `frameParser.js` y **`runStateMachine`** en `protocol-handlers/stateMachine.js`.

**→ `frameParser.js`** acumula bytes hasta el delimitador de fin de trama, valida **checksum** y escribe en **`AppState`** el último `comando`, los 8 bytes de `data` y los campos de cabecera que el protocolo usa en los handlers.

**→ `stateMachine.js`** cada **250 ms** incrementa un contador, detecta ciertas transiciones (por ejemplo la primera vez que se entra en `SEND_DATA`) y ejecuta el **handler** correspondiente a `AppState.comando` en `handlers.js`.

**→ `handlers.js`** envía respuestas con **`sendToModule`** (`serialManager.js`), actualiza **`AppState.currentState`**, programa el fin de maniobra cuando corresponde y, si hay datos de sensor, llama al hook **`updateVisualization`** (en la práctica, la función `updateVisualization` exportada por `dataHandler.js`, registrada en `main.js` dentro de `AppState._hooks`).

**→ `dataHandler.js`** aplica reglas de negocio (umbrales 100–120 cpm y 50–60 mm, manos OK, primera frecuencia válida), actualiza **`chartManager`**, **`badges`**, **`overlay`** y el array **`recordedData`** de `csvExport.js`.

**→ `summaryModal.js`** (`saveCharts`) muestra el resumen con gráficos embebidos y enlaza “Nueva maniobra”, cierre de serial o exportación CSV.

**Cómo se conectan los módulos:** solo **`main.js`** asigna `AppState._hooks` en `DOMContentLoaded`. Archivos como `handlers.js` o `serialManager.js` llaman `AppState._hooks.saveCharts?.()` u otras funciones sin importar `main.js`. El parser solo escribe `AppState` y no importa handlers, lo que mantiene el grafo de imports acíclico. **`visualizacion.js`** expone `resetCharts()` como punto único para limpiar gráficos, CSV en memoria y badges y luego invocar `restartSerialLoop` vía hook.

---

## 4. Descripción de módulos

### `protocol/`

Definiciones **estables** y sin efectos secundarios: códigos de comando (`CMD`), identificador del Buddy (`BUDDY_ID`), duración nominal de la barra de progreso, y **`calculateChecksum`**, usado tanto al **enviar** como al **validar** tramas. No toca DOM ni puerto.

### `protocol-handlers/`

Traduce “último comando recibido” en acciones: enviar la siguiente trama, cambiar estado, popups de manos, procesar sensor y disparar **`saveCharts`** cuando el flujo lo exige. **`stateMachine.js`** es el despachador periódico (`setInterval` 250 ms); **`handlers.js`** concentra la lógica conversacional con el firmware del Buddy.

### `serial/`

**`serialManager.js`**: escribe tramas binarias al `WritableStream`, cierra el puerto y puede detener el intervalo del state machine. **`frameParser.js`**: bucle asíncrono de lectura que arma tramas completas y, si el checksum cuadra, actualiza **`AppState`** para el siguiente tick.

### `state/`

**`appState.js`**: estado global (máquina de estados, comando y payload, flags de manos y de fin de sesión, contadores, referencias a puerto/reader/intervalos) y el objeto **`_hooks`** para callbacks registrados desde `main.js`. Incluye **`resetSession()`** y **`nextSession()`** para invalidar lógica antigua al reiniciar o al cerrar conexión.

### `ui/`

**`logger.js`**: consola solo en localhost, chip de estado de conexión en el header, **`showAlert`** con fallback a `alert` si SweetAlert2 no cargó. **`progressBar.js`**: barra visible durante la ventana de **60 segundos** asociada al fin de maniobra programado (`PROGRESS_DURATION` en `constants.js`).

### `visualization/`

Gráficos en vivo (**Chart.js**), badges HTML, overlay de espera, historial **`recordedData`** para CSV y modal de resumen. **`chartManager.js`** crea las instancias de gráfico en su propio listener `DOMContentLoaded` cuando existen los canvas en `index.html`.

### `visualizacion.js` (raíz de `src/js/`)

Orquesta **`resetCharts()`**: resetea estado de visualización (`dataHandler`), datos de charts (`chartManager`), filas CSV (`csvExport`), badges, overlay; ajusta flags en `AppState` y llama **`AppState._hooks.restartSerialLoop`** para alinear el loop serial con una sesión nueva si el puerto sigue abierto. Evita que `main.js` importe directamente todos los submódulos de visualización solo para reiniciar.

---

## 5. Descripción de archivos

- **`main.js`**: Bootstrap de la app: registra los seis hooks en `AppState._hooks` (`saveCharts`, `resetCharts`, `closeSerialConnection`, `updateVisualization`, `resetAllStates`, `restartSerialLoop`), ejecuta un reset inicial, asocia eventos a botones (serial, simulación, reinicio, fin manual). Abre Web Serial, arranca lectura y state machine. Incluye **`processData(text)`** para rutas **no binarias** (simulación y Bluetooth): parsea strings tipo `UOK,P50,F110:` y llama `updateVisualization`. Define **`resetAllStates`** (limpia intervalos, `resetSession`, UI del botón simular) y **`restartSerialLoop`**.

- **`appState.js`**: Objeto único con `currentState`, `comando`, `data` (8 bytes), `contadorUniversal`, `sessionId`, flags (`flagSendData`, `sendDataFlag`, `finishPopupShown`, etc.), referencias a `serialPort`/`serialReader`/intervalos y **`_hooks`**. **`resetSession()`** vuelve a `IDLE`, reinicia contadores y deja `comando` en `CMD.PING` con payload en ceros.

- **`constants.js`**: Mapa `CMD` (por ejemplo `PING`, `HANDS_STATUS`, `SENSOR_DATA`, `FINISH`, `FRAME_END`), `BUDDY_ID` (0x64) y `PROGRESS_DURATION` (60 s).

- **`checksum.js`**: Función **`calculateChecksum`**: complemento a uno sobre la suma de bytes (byte 17 de la trama de 18 bytes antes del 0x0D).

- **`serialManager.js`**: **`sendToModule`**: arma la trama (cabecera + comando + 8 data + checksum + fin); si `idPag` es 0, usa y autoincrementa `AppState.contadorUniversal`. **`closeSerialConnection`**: detiene loop, cancela reader, cierra puerto, restaura botón y chip, alerta, y ejecuta hooks de reset. **`stopSerialLoop`**: limpia el `setInterval` del state machine.

- **`frameParser.js`**: Lee del reader en bucle; al detectar `FRAME_END`, si hay 18 bytes y el checksum coincide, asigna a `AppState` comando, `Array.from` de los 8 bytes de datos, ids y `sendDataFlag` (byte en posición 14 de la trama, alineado con el uso de `data[5]` en handlers).

- **`stateMachine.js`**: Crea un `setInterval` que captura `sessionId` al arrancar; si cambia, se limpia a sí mismo. Cada tick: `contadorUniversal++`, **`detectSendDataEntry`** (engancha timeout de fin al entrar en `SEND_DATA`), luego **`COMMAND_HANDLERS[AppState.comando]`** o log de comando desconocido.

- **`handlers.js`**: Por comando: ping (contesta y pasa a `START`), confirmación, estado de manos (popup o paso a `SEND_DATA`), ACK de manos en modo handshake vs datos activos, `SENSOR_DATA`, batería baja, fallas de sensor. Contiene **`processSensorData`** (decodifica bytes a mano OK/NOK, profundidad y frecuencia), **`checkStuckPacket`**, **`scheduleFinishOnce`**, **`scheduleChannelFinish`** y **`abrirPopup`** de posición de manos.

- **`logger.js`**: `log`, `setConnectionStatus`, `showAlert`.

- **`progressBar.js`**: `startProgressBar` / `stopProgressBar` sincronizados con la UI `#progressContainer` / `#progressBar` / `#progressLabel`.

- **`dataHandler.js`**: **`updateVisualization`** (acepta objeto o string JSON). **`handleDataForVisualization`**: respeta `AppState.isPaused`, espera manos OK y primera frecuencia > 0, maneja rachas de frecuencia cero con alerta, actualiza badges, ventana deslizante de 7 puntos en charts en vivo, arrays `fullFreqData` / `fullProfData` / `fullLabels`, `handPositionHistory`, contadores de ejecución correcta/incorrecta y **`recordedData.push`** para cada compresión registrada.

- **`chartManager.js`**: Umbrales `FREQ_MIN/MAX`, `PROF_MIN/MAX`, `CHART_WINDOW`, datasets compartidos, plugin de banda verde en ejes, instancias globales `freqChart`, `profChart`, etc., **`updateCharts`** y **`resetChartData`**.

- **`csvExport.js`**: Exporta **`recordedData`**; **`resetCsvData`** vacía el array; **`downloadCSV`** usa `showDirectoryPicker` y escribe `maniobra_<timestamp>.csv` con política de hasta 100 archivos en la carpeta elegida.

- **`badges.js`**: Actualiza `#freqBadge`, `#profBadge`, `#handPosBadge`, `#pieBadge` con gradientes según umbrales; **`resetBadges`** para volver a `--`.

- **`overlay.js`**: Muestra u oculta `#waitingCircle` mientras no llega una frecuencia válida tras manos OK.

- **`summaryModal.js`**: **`saveCharts()`** calcula porcentaje de compresiones correctas respecto al total, arma resumen de manos desde `handPositionHistory`, abre SweetAlert2 con cuatro canvas de preview (pie, manos, línea de frecuencia, barras de profundidad). El botón “Guardar CSV” llama **`downloadCSV`**. Confirmar “Nueva Maniobra” usa hook **`resetCharts`**; “Cerrar” usa **`closeSerialConnection`**.

---

## 6. Flujo completo paso a paso

**Conexión del dispositivo:** el click en “Conectar dispositivo” en `main.js` ejecuta `navigator.serial.requestPort()` y `open({ baudRate: 115200 })`, guarda el reader, llama `startSerialReadLoop()` y, si no había intervalo, `runStateMachine()`. El chip del pasa a “Conectado” vía `setConnectionStatus('connected')`.

**Llegada de datos del hardware:** el parser acumula bytes hasta `CMD.FRAME_END`; valida longitud y checksum; escribe en `AppState` el nuevo comando y payload. En cada tick de 250 ms, el handler correspondiente puede enviar contestación con `sendToModule` y, en flujo de datos activo, decodificar sensor y llamar `AppState._hooks.updateVisualization`.

**Procesamiento:** `processSensorData` (desde handlers) o `processData` (texto en `main.js`) termina en la misma `updateVisualization`, que centraliza reglas pedagógicas (rangos, conteo de correctas/incorrectas).

**Actualización de la interfaz:** `dataHandler` muta los datasets ligados a `chartManager`, invoca `updateCharts()` con modo `'none'`, y actualiza badges y overlay.

**Gráficos, badges y CSV en vivo:** los cuatro charts del dashboard reflejan ventana deslizante y pie; los badges muestran valores instantáneos y porcentaje; cada punto válido agrega una fila a `recordedData` con `timestamp` ISO.

**Finalización de la maniobra:** puede dispararse por timeout de 60 s (`scheduleFinishOnce` al entrar en `SEND_DATA` y reforzado en handlers de datos), por `scheduleChannelFinish` en `handleSensorData`, por detección de paquetes repetidos (`checkStuckPacket`), por batería baja o falla de sensor, por el botón de fin manual en `main.js`, o por confirmar “Terminar maniobra” en el popup de manos. Suele fijarse `FINISH`, enviarse `CMD.FINISH` al Buddy cuando el flujo lo requiere, y llamarse `saveCharts` una vez, controlado con `finishPopupShown` y flags afines.

**Resumen:** `saveCharts` muestra el modal con mini-gráficos; al cerrar, destruye esas instancias Chart temporales.

**Exportar CSV:** desde el modal, “Guardar CSV” ejecuta `downloadCSV()`; la primera vez pide carpeta con la API del sistema de archivos del navegador.

**Comunicación serial y protocolo (resumen):** el hardware habla en **tramas binarias** de 18 bytes antes del 0x0D; el byte 8 es el **comando** y los bytes 9–16 son **data**; el 17 es checksum. La app no mezcla lectura y despacho en el mismo bucle: el **parser** solo actualiza `AppState`, y el **state machine** reacciona en ticks fijos. Las respuestas salen por `sendToModule` con la misma regla de checksum.

---

## 7. Ventajas de la modularización

- **Lectura por capas:** se puede revisar protocolo, serial, estado o UI sin recorrer un monolito.
- **Sin imports circulares:** `_hooks` permite que `handlers` dispare `saveCharts` o `updateVisualization` sin importar `main.js` ni `summaryModal.js` directamente.
- **Un solo pipeline de visualización:** serial, simulación y Bluetooth convergen en `updateVisualization`, lo que reduce duplicación de reglas de color y conteo.
- **Cambios localizados:** umbrales y plugin de rangos en `chartManager.js`; checksum solo en `checksum.js`; reset de UI de gráficos acotado a `visualizacion.js` más imports de visualization.

---

## 8. Riesgos o puntos pendientes

Tomado de **`CODE_REVIEW.md`** (resumen ejecutivo; el archivo detalla fixes sugeridos):

- **Comportamiento:** revisar el **`idDestino`** del `FINISH` automático en el timeout de `scheduleFinishOnce` frente al uso correcto de `BUDDY_ID` en el fin manual de `main.js`. Revisar la **cadena de resets** al cerrar serial (múltiples incrementos de `sessionId` e intervalos invalidados). **`scheduleChannelFinish`** puede crear **muchos timeouts** si se llama en cada tick sin un guard similar a `finishScheduled`.

- **Estado entre sesiones:** `resetSession()` podría no limpiar **`stuckTimeout`**, **`samePacketCount`** y **`lastPacketId`**, con efectos residuales al empezar otra maniobra.

- **Robustez de UI:** `Swal.fire` directo en `dataHandler.js`, `csvExport.js` y `summaryModal.js` frente a **`showAlert`** en `logger.js` — si el CDN falla, esas rutas pueden romperse. **`downloadCSV`** retorna en silencio si no hay filas. **`showDirectoryPicker`** no existe en Firefox/Safari.

- **Producto / mantenimiento:** código de Bluetooth en `main.js` ligado a un botón ausente en el HTML; nombres muy parecidos **`flagSendData`** / **`sendDataFlag`**; contrato implícito de que los hooks se asignan en `DOMContentLoaded` antes de cualquier uso; ausencia de tests automatizados del protocolo y del checksum.

---

*Documento alineado con la estructura real de `src/js/` y con la modularización descrita en `CODE_REVIEW.md`. Para implementación, contrastar siempre con el código fuente.*
