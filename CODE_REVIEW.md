# CODE REVIEW — Simulador RCP
**Revisión:** 2026-05-11  
**Revisor:** Facundo Graffigna 
**Branch analizado:** `feature/mejoras`  
**Stack:** Vanilla HTML · CSS · JavaScript (sin framework, sin bundler, sin TypeScript)

---

## Resumen Ejecutivo

El proyecto es una aplicación web para un simulador de maniobras de RCP que se conecta a hardware real vía Web Serial API. El código cumple su función principal, pero presenta una **deuda técnica significativa** que ya está causando bugs silenciosos y que, si crece, hará el proyecto muy difícil de mantener. La mayoría de los problemas tienen solución directa y no requieren un rewrite completo.

---

## Índice

1. [Bugs Activos](#1-bugs-activos)
2. [Arquitectura General](#2-arquitectura-general)
3. [Calidad del Código](#3-calidad-del-código)
4. [HTML](#4-html)
5. [CSS](#5-css)
6. [Performance](#6-performance)
7. [UX y Frontend](#7-ux-y-frontend)
8. [Seguridad](#8-seguridad)
9. [Experiencia de Desarrollo (DX)](#9-experiencia-de-desarrollo-dx)
10. [Checklist de Calidad](#10-checklist-de-calidad)

---

## 1. Bugs Activos

### 🔴 BUG CRÍTICO — `generateSimulatedData`: `freq` siempre vale `0`

**Detectado en:** `scripts/script.js:389-398`

```js
function generateSimulatedData(contadormil) {
    const handPosition = Math.random() > 0.5 ? 'OK' : 'NOK';
    const profundidad = Math.floor(Math.random() * 100);
    freq = 0;              // ← setea la variable GLOBAL a 0
    contadormil++;
    if (contadormil > 30) {
        const freq = Math.floor(Math.random() * 200) + 50;  // ← nueva variable LOCAL, se descarta inmediatamente
    }
    return `\nU${handPosition},P${profundidad},F${freq}:`;  // ← usa el global = siempre 0
}
```

**Por qué es un problema:** `const freq` dentro del `if` crea una variable de bloque que no afecta a la `freq` global. La simulación **siempre** envía frecuencia `0`, lo que activa el estado "maniobra detenida" en la visualización. La simulación está funcionalmente rota para frecuencia.

**Impacto futuro:** Imposible testear el flujo completo sin hardware real.

**Recomendación:**
```js
function generateSimulatedData() {
    const handPosition = Math.random() > 0.5 ? 'OK' : 'NOK';
    const profundidad = Math.floor(Math.random() * 100);
    const freq = Math.floor(Math.random() * 200) + 50;
    return `\nU${handPosition},P${profundidad},F${freq}:`;
}
```

---

### 🔴 BUG CRÍTICO — `localStorage` guarda un string pero intenta restaurar un `FileSystemDirectoryHandle`

**Detectado en:** `scripts/visualizacion.js:329-338`

```js
// Guardar:
localStorage.setItem("savedDirHandle", JSON.stringify(savedDirHandle.name)); // guarda "MiCarpeta" (string)

// Restaurar:
savedDirHandle = await window.showDirectoryPicker({ startIn: JSON.parse(storedDir) }); // pasa string, no handle
```

**Por qué es un problema:** `FileSystemDirectoryHandle` no es serializable a JSON. `JSON.parse(storedDir)` devuelve un string `"MiCarpeta"`, que `showDirectoryPicker` ignora o usa como hint irrelevante. El código cree que restaura la carpeta, pero en realidad abre un picker como si fuera la primera vez, igual que sin el localStorage. El bloque de "restauración" es código muerto que confunde.

**Impacto futuro:** Falsa sensación de persistencia; usuarios que reporten bugs difíciles de reproducir.

**Recomendación:** Eliminar el intento de restauración desde localStorage o usar la [File System Access API con IndexedDB](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access#storing_file_handles_or_directory_handles_in_indexeddb) (única forma de persistir handles entre sesiones).

---

### 🔴 BUG CRÍTICO — `const` dentro de `switch` sin bloque propio

**Detectado en:** `scripts/script.js:540`

```js
case 0x68:
    // ...
    const timeoutSession = window.sessionId;  // ← const en switch sin {}
```

**Por qué es un problema:** En strict mode (`'use strict'` habilitado en este archivo), declarar `const` o `let` dentro de un `case` sin llaves propias puede generar un `SyntaxError` o comportamiento inesperado en algunos engines porque la variable existe en el scope del switch completo, no solo del case. Al menos es una mala práctica que confunde lectores.

**Recomendación:** Envolver el bloque del case en llaves:
```js
case 0x68: {
    const timeoutSession = window.sessionId;
    // ...
    break;
}
```

---

### 🟠 BUG MEDIO — `contadormil` en `generateSimulatedData` nunca incrementa el global

**Detectado en:** `scripts/script.js:393`

```js
function generateSimulatedData(contadormil) {  // ← parámetro local que "sombrea" el global
    contadormil++;                              // ← incrementa el local, no el global
```

El global `contadormil` (línea 56) nunca cambia en la simulación. No produce un crash pero la lógica `if (contadormil > 30)` nunca se cumple (además del bug anterior con `const freq`).

---

### 🟠 BUG MEDIO — `playStopButton` referenciado pero no existe en el HTML

**Detectado en:** `scripts/visualizacion.js:17`

```js
const playStopButton = document.getElementById('playStopButton'); // → null
```

El HTML no tiene ningún elemento con `id="playStopButton"`. El código tiene guards `if (playStopButton)` que silencian el error, pero la funcionalidad de pausar gráficos está completamente rota sin feedback visible para el usuario.

---

### 🟠 BUG MEDIO — `scheduleFinishOnce()` llamado múltiples veces en el mismo ciclo

**Detectado en:** `scripts/script.js:476, 498, 507, 529, 539`

`scheduleFinishOnce` tiene un guard `if (finishScheduled)` pero dentro del case `0x03` puede llamarse dos veces en el mismo tick del setInterval (líneas 519 y 529). Adicionalmente, en `case 0x68` se llama `scheduleFinishOnce()` en la línea 539 y a los 60 segundos también se llama `stopProgressBar()` y `saveCharts()` directamente (líneas 542-554), duplicando la lógica de finalización con la de `scheduleFinishOnce`. Esto puede causar que `saveCharts()` se ejecute dos veces.

---

## 2. Arquitectura General

### 🔴 CRÍTICO — Estado global no encapsulado: ~35 variables sueltas

**Detectado en:** `scripts/script.js:1-60`

El archivo comienza con ~35 variables globales que cualquier función puede leer y modificar libremente:

```js
let simulationInterval = null;
let bluetoothInterval = null;
let serialReader = null;
let handsFlag = false;
let currentState = 'IDLE';
// ... 30 más
```

**Por qué es un problema:** No hay forma de saber qué función modificó qué variable ni en qué orden. Los bugs de estado (como el doble llamado a `saveCharts`) son consecuencia directa de esto. Agregar una nueva feature requiere leer todo el archivo para entender el estado actual.

**Impacto futuro:** Cada nueva feature añade más variables globales. El proyecto se vuelve imposible de testear y altamente frágil.

**Recomendación:** Encapsular el estado en un objeto o clase:
```js
const AppState = {
    serial: { port: null, reader: null, interval: null },
    session: { id: 0, currentState: 'IDLE', counter: 0 },
    flags: { finishScheduled: false, handsOk: false, finishPopupShown: false },
    protocol: { idDestino: 0x00, idPag: 0x00, comando: 0x01, data: new Array(8).fill(0) },
    reset() { /* ... */ }
};
```

---

### 🟠 MEDIO — Comunicación entre archivos vía `window.*`: acoplamiento máximo

**Detectado en:** múltiples lugares

```js
// script.js expone:
window.restartSerialLoop = function() { ... };
window.closeSerialConnection = closeSerialConnection;

// visualizacion.js expone:
window.saveCharts = saveCharts;
window.resetCharts = function() { ... };
window.updateVisualization = function updateVisualization(data) { ... };
```

Y se llaman entre sí sin ningún contrato formal. Si se renombra una función, el error solo aparece en runtime.

**Impacto futuro:** Cualquier refactor de un archivo puede romper silenciosamente el otro.

**Recomendación:** Usar el patrón de **Custom Events** del browser, que es la forma nativa de comunicación desacoplada entre módulos:
```js
// script.js (emisor)
window.dispatchEvent(new CustomEvent('sensorData', { detail: parsedData }));

// visualizacion.js (receptor)
window.addEventListener('sensorData', (e) => handleDataForVisualization(e.detail));
```
Esto elimina las dependencias directas y hace el código testeable.

---

### 🟢 MEJORA — Ausencia total de módulos ES: todo corre en scope global

El proyecto no usa `<script type="module">` ni ningún sistema de módulos. Todo comparte el mismo scope global, lo que hace imposible tener dos instancias, testear funciones aisladas, o hacer tree-shaking en el futuro.

**Recomendación (bajo costo):** Al menos cambiar los scripts a módulos ES para habilitar imports explícitos:
```html
<script type="module" src="scripts/script.js"></script>
```

---

### 🟢 MEJORA — No hay carpeta de constantes del protocolo

Valores como `0x65`, `0x66`, `0x68`, `0x05`, `0x71`, `0x0D`, `0xFF` aparecen distribuidos en el código sin documentación. Si el protocolo cambia, hay que buscarlo manualmente.

**Recomendación:** Crear `scripts/protocol.js`:
```js
export const CMD = {
    INIT:         0x01,
    CONFIRM_REQ:  0x65,
    HANDS_CHECK:  0x66,
    ACK:          0x03,
    DATA:         0x04,
    FINISH:       0x05,
    SENSOR_DATA:  0x68,
    LOW_BATTERY:  0x09,
    SENSOR_FAIL_A: 0x0A,
    SENSOR_FAIL_B: 0x0B,
    FRAME_END:    0x0D,
};
```

---

## 3. Calidad del Código

### 🔴 CRÍTICO — `DEBUG = true` hardcodeado en producción

**Detectado en:** `scripts/script.js:58`

```js
const DEBUG = true;
```

La función `log()` usa este flag, pero hay numerosos `console.log()` directos que lo ignoran (líneas 93, 499, 665-666, etc.). En producción el browser de cualquier usuario vería todos los logs del protocolo serial.

**Recomendación:**
```js
const DEBUG = location.hostname === 'localhost' || location.search.includes('debug=1');

function log(...args) { if (DEBUG) console.log('[RCP]', ...args); }
```
Y reemplazar todos los `console.log` directos por `log()`.

---

### 🟠 MEDIO — `stopSerialLoop` declarada como `async` sin necesidad

**Detectado en:** `scripts/script.js:700`

```js
async function stopSerialLoop() {
    if (serialInterval) {
        clearInterval(serialInterval); // síncrono
        serialInterval = null;
    }
}
```

No hay ningún `await` dentro. Declarar una función `async` sin necesidad cambia su tipo de retorno a `Promise<void>`, lo que puede engañar a quien la llama a pensar que hay trabajo asíncrono.

---

### 🟠 MEDIO — Naming inconsistente (español/inglés/PascalCase mezclados)

Ejemplos encontrados:

| Variable | Problema |
|---|---|
| `ContadorCeros` | PascalCase para variable local (debería ser `contadorCeros`) |
| `profundidad`, `freq`, `handPosition` | Mezcla español/inglés en el mismo objeto |
| `flagSendData` / `sendDataFlag` | Dos flags que parecen hacer lo mismo, nombres invertidos |
| `flagCierroPopup` / `handsPopupOpen` | Mezcla de naming patterns |
| `contadormil` | Todo minúsculas, sin separación, nombre críptico |

**Recomendación:** Establecer una convención única. Para un proyecto de ingeniería de HW, sugerimos **inglés para código + español solo en mensajes UI**.

---

### 🟠 MEDIO — `flagSendData` y `sendDataFlag`: duplicación confusa

**Detectado en:** `scripts/script.js:47-48`

```js
let flagSendData = false;
let sendDataFlag = false;
```

Dos variables con nombre casi idéntico y significado similar. `sendDataFlag` en realidad lee `packet[14]` del hardware (línea 431), mientras que `flagSendData` es un booleano local de estado. La similitud de nombres los hace intercambiables a primera vista, lo cual es un vector de bugs.

---

### 🟢 MEJORA — Función `resetAllStates` duplica lógica con `window.resetCharts`

`resetAllStates()` en `script.js` y `window.resetCharts()` en `visualizacion.js` ambas resetean `window.sessionId`, `window.finishPopupShown`, y `window.handsPopupShownThisSession`. Si se agrega un nuevo flag compartido, hay que acordarse de actualizarlo en dos lugares.

---

## 4. HTML

### 🟠 MEDIO — `lang="en"` pero la app está en español

**Detectado en:** `index.html:2`

```html
<html lang="en">
```

Toda la UI, los mensajes de error y los alertas están en español. El atributo `lang` afecta a lectores de pantalla, a corrección ortográfica del browser y a la indexación de buscadores.

**Fix:** `<html lang="es-AR">`

---

### 🟠 MEDIO — Librerías CDN sin Subresource Integrity (SRI)

**Detectado en:** `index.html:9`

```html
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
```

Sin el atributo `integrity`, si la CDN es comprometida o el recurso cambia, el script malicioso se ejecuta en tu app con acceso completo al DOM, serial port, y filesystem.

**Fix:**
```html
<script
  src="https://cdn.jsdelivr.net/npm/sweetalert2@11.x.x/dist/sweetalert2.all.min.js"
  integrity="sha384-HASH_AQUI"
  crossorigin="anonymous">
</script>
```
Generar el hash con: `openssl dgst -sha384 -binary sweetalert2.min.js | openssl base64 -A`

---

### 🟢 MEJORA — `chart.umd.js` local está truncado (14 líneas)

El archivo `scripts/chart.umd.js` solo tiene 14 líneas — es prácticamente solo el header de licencia. El Chart.js funcional viene de algún lugar no evidente (probablemente de caché del browser o de un test con CDN). En un nuevo clone del repo, los gráficos **no funcionarían** sin conexión a internet.

**Recomendación:** O incluir el archivo completo (Chart.js minificado ~200KB) o usar la CDN con SRI hash, no ambas cosas a medias.

---

### 🟢 MEJORA — Código HTML comentado que no aporta

```html
<!-- <button id="bluetoothButton">Conectar vía Bluetooth</button> -->
<!-- <h2>Datos Recibidos:</h2> -->
<!-- <p id="receivedData">Ningún dato recibido aún</p> -->
```

El botón Bluetooth está comentado en el HTML pero el JS todavía tiene toda la lógica de conexión Bluetooth activa. Decidir: o se implementa o se elimina en ambos lados.

---

### 🟢 MEJORA — Falta `<meta name="description">` y favicon correcto

```html
<title>RCP</title>
<!-- sin description, sin og:tags -->
<link rel="icon" href="estilos/image.png" type="image/x-icon"> <!-- type incorrecto para PNG -->
```

Para un favicon PNG el type correcto es `image/png`. Para un `.ico` usar `image/x-icon`.

---

## 5. CSS

### 🔴 CRÍTICO — Clase CSS `.charts-container` vs HTML `.chart-container`: mismatch

**Detectado en:** `estilos/style.css:108` y `index.html:37`

```css
/* CSS define: */
.charts-container { display: flex; ... }     /* con 's' */

/* HTML usa: */
<div class="chart-container">                /* sin 's' */
```

El CSS responsivo para la grilla de gráficos (`.charts-container`) **nunca se aplica** porque en el HTML el div tiene la clase `chart-container` (definida en la línea 138 del CSS como grid). Son dos clases distintas. El responsive de flex-direction para mobile afecta a un elemento que no existe.

---

### 🟠 MEDIO — `width: 100 px!important` — sintaxis inválida

**Detectado en:** `estilos/style.css:188`

```css
#pieChart,
#handPosChart {
    width: 100 px!important;  /* ← espacio entre 100 y px: valor inválido */
```

Esta regla CSS es ignorada por el browser. El tamaño del chart en mobile no se aplica.

---

### 🟠 MEDIO — `body1` no es un selector HTML válido

**Detectado en:** `estilos/style.css:9`

```css
body, body1 {
    display: flex;
```

`body1` no es un elemento HTML estándar. Es un selector de clase que selecciona `<body1>` (un custom element no registrado). Probablemente era un experimento que quedó. Las propiedades se aplican solo a `body`, pero la presencia de `body1` confunde y el responsive de la media query también lo usa.

---

### 🟢 MEJORA — Fuente importada pero no usada

```css
@import url('https://fonts.googleapis.com/css2?family=Playwrite+IN&display=swap');
```

La fuente `Playwrite IN` se importa pero nunca se usa en ningún selector CSS del archivo. Es una petición HTTP innecesaria en cada carga de la app.

---

### 🟢 MEJORA — Estilos `.chart-value-box` dentro del media query en lugar de fuera

Las clases `.chart-value-box`, `.chart-value-box.ok` y `.chart-value-box.error` están definidas dentro del `@media (max-width: 768px)`. Estas reglas solo aplican en mobile cuando probablemente deberían ser globales.

---

## 6. Performance

### 🟠 MEDIO — Polling cada 80ms para verificar posición de manos

**Detectado en:** `scripts/script.js:300-309`

```js
handsPopupIntervalId = setInterval(() => {
    if (window.handsOk === true || currentState !== 'WAIT_HANDS') {
        Swal.close();
    }
}, 80);
```

Un `setInterval` cada 80ms (12.5 veces por segundo) solo para leer un booleano es un polling innecesario. El valor `window.handsOk` ya se actualiza en `processSensorData`, que se llama desde el loop serial.

**Recomendación:** Cerrar el popup reactivamente desde donde se actualiza `handsOk`:
```js
// En processSensorData, cuando handsOk cambia a true:
if (window.handsOk && handsPopupOpen) {
    Swal.close();
}
```

---

### 🟠 MEDIO — 4 llamadas a `chart.update()` por cada dato recibido

**Detectado en:** `scripts/visualizacion.js:320-327`

```js
function updateCharts() {
    freqChart.update();
    profChart.update();
    pieChart.update();
    handPosChart.update();
}
```

Chart.js ejecuta un re-render completo por cada llamada a `.update()`. Con datos llegando cada 250ms desde el state machine, esto ejecuta 16 renders por segundo. Se puede optimizar con `{ duration: 0 }` o usando `update('none')` para los charts que no cambian en ese tick.

---

### 🟢 MEJORA — Charts creados dentro del modal de Swal sin destruirse

**Detectado en:** `scripts/visualizacion.js:474-493`

```js
didOpen: () => {
    new Chart(document.getElementById('piePreview').getContext('2d'), { ... });
    new Chart(document.getElementById('freqPreview').getContext('2d'), { ... });
    // ...
}
```

Cada vez que se abre el modal de "guardar", se crean 4 nuevas instancias de Chart.js que nunca se destruyen explícitamente. Chart.js mantiene referencias internas; en navegadores con memoria limitada esto puede causar degradación.

**Recomendación:** Guardar referencias y llamar `.destroy()` en el `willClose` del Swal.

---

### 🟢 MEJORA — `createWaitingCircle` crea elementos DOM en cada actualización

```js
function createWaitingCircle() {
    if (waitingCircle) return;
    waitingCircle = document.createElement('div');
    waitingCircle.style.cssText = `...`;  // 200+ chars de CSS inline
    // ...
    document.body.appendChild(waitingCircle);
}
```

Inyectar CSS inline de esta extensión via JS mezcla responsabilidades y hace el código difícil de mantener. Mover el CSS a `style.css` como clase y solo togglear visibilidad desde JS:

```css
/* style.css */
#waitingCircle { display: none; /* ... estilos */ }
#waitingCircle.visible { display: flex; }
```
```js
document.getElementById('waitingCircle').classList.add('visible');
```

---

## 7. UX y Frontend

### 🟠 MEDIO — Mezcla de `alert()` nativo y SweetAlert2

**Detectado en:** múltiples lugares en `script.js`

```js
alert('Conexión Bluetooth establecida.');   // ← nativo
alert('Conexión Serial establecida.');      // ← nativo
Swal.fire({ title: "⚠️ bateria baja" });   // ← SweetAlert2
```

El `alert()` nativo bloquea el hilo de JavaScript, tiene estilo del OS (inconsistente con la UI), y no es dismissable programáticamente. Es especialmente problemático en la conexión serial donde el alert bloquea mientras el hardware ya está enviando datos.

**Recomendación:** Reemplazar todos los `alert()` por `Swal.fire()` con `timer: 2000` para notificaciones de éxito.

---

### 🟠 MEDIO — Botones no tienen estado visual durante la conexión

Cuando el usuario hace click en "Conectar Bluetooth" y el browser muestra el picker de dispositivos, el botón no da ningún feedback. El usuario no sabe si su click fue registrado o si la app está esperando.

**Recomendación:**
```js
serialButton.disabled = true;
serialButton.textContent = 'Conectando...';
try {
    // ... conexión
} finally {
    serialButton.disabled = false;
    serialButton.textContent = 'Conectado ✓';
}
```

---

### 🟠 MEDIO — Mensajes de error inconsistentes en capitalización y puntuación

Comparar:
- `"⚠️ bateria baja"` (sin tilde, minúscula)
- `"Poner bien las manos"` (sin signo de exclamación)
- `"maniobra detenida"` (minúscula)
- `"⚠️ Falla en los sensores"` (mayúscula, con tilde)

No hay un patrón consistente. Esto proyecta falta de pulido en una app médica/educativa donde la precisión del lenguaje importa.

---

### 🟢 MEJORA — Sin indicador del estado de conexión en la UI

Una vez conectado el dispositivo serial, no hay ningún indicador visual persistente del estado de la conexión (conectado/desconectado/error). El único feedback es el `alert()` de confirmación que desaparece.

**Recomendación:** Un badge de estado simple en el header:
```html
<div id="connectionStatus" class="status-badge">Sin conexión</div>
```

---

### 🟢 MEJORA — Título de la página y `<h1>` no son descriptivos

```html
<title>RCP</title>
<h1>Simulador RCP</h1>
```

Para un proyecto académico/médico, especialmente si se muestra en presentaciones o se accede desde múltiples dispositivos: `<title>Simulador de RCP — UCC</title>` es más informativo y profesional.

---

## 8. Seguridad

### 🟠 MEDIO — Sin Content Security Policy (CSP)

La app accede a Web Serial API (hardware), File System Access API (disco), e inyecta HTML dinámico en modales de Swal. Sin una CSP, cualquier script inyectado (XSS) tiene acceso completo a todos estos recursos.

**Recomendación:** Agregar en el `<head>`:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com">
```

---

### 🟠 MEDIO — CDN sin SRI hash (también en performance, crítico en seguridad)

Ver sección 4. CDN sin integrity hash = posible vector de ataque si la CDN es comprometida.

---

### 🟢 MEJORA — `innerHTML` sin sanitización en el modal de resultados

**Detectado en:** `scripts/visualizacion.js:457-465`

```js
html: `
    <p><strong>Porcentaje de ejecuciones correctas:</strong> ${percentage}%</p>
    ...
```

`percentage` viene de un cálculo interno así que no hay riesgo inmediato. Pero si en el futuro se muestre algún dato del dispositivo serial directamente en este HTML, sería un vector XSS. Establecer la práctica de no usar template literals con `innerHTML` para datos externos.

---

## 9. Experiencia de Desarrollo (DX)

### 🟠 MEDIO — Sin sistema de build ni linting

No hay:
- `package.json` de la app (solo `node_modules` sin `package.json` en la raíz visible)
- ESLint / Prettier
- Ningún linter de CSS (Stylelint)
- Sin tests (unitarios o e2e)
- Sin CI/CD

Los bugs del tipo "variable de bloque sombrea global" que detectamos serían capturados automáticamente por ESLint con la regla `no-shadow`.

**Recomendación mínima:** Agregar un `package.json` con:
```json
{
  "scripts": {
    "lint": "eslint scripts/",
    "dev": "live-server"
  },
  "devDependencies": {
    "eslint": "^9.0.0"
  }
}
```

---

### 🟠 MEDIO — Mensajes de commit no descriptivos

```
"boludeces, colorcitos"
"logitos, cambios de nombre, esas pelotudeces"
"antes de implementar el ping"
```

Los commits son el historial del proyecto. En seis meses, ningún miembro del equipo va a entender qué cambió en "boludeces, colorcitos". Si hay un bug en producción y se necesita hacer `git bisect`, estos mensajes no ayudan.

**Convención sugerida:** `tipo(alcance): descripción` — ej: `fix(chart): corregir bug de freq=0 en simulación`

---

### 🟢 MEJORA — Sin `.gitignore`

No existe un `.gitignore`. El repositorio trackea `node_modules/` (implícito por su existencia), el instalador `.exe`, y drivers de Windows (`.sys`, `.cat`, `.inf`). Los binarios de driver no deberían estar en el mismo repo que el código de la app web.

---

### 🟢 MEJORA — Sin `README.md`

No hay documentación de cómo correr el proyecto, qué hardware se necesita, cómo instalar dependencias, ni cuál es el protocolo de comunicación. Un nuevo colaborador no puede arrancar sin preguntarle a alguien.

---

## 10. Checklist de Calidad

| Categoría | Estado | Detalle |
|---|---|---|
| ✅ Funcionalidad core | Parcialmente OK | Simulación de freq está rota |
| ❌ Arquitectura modular | No | Estado global plano, acoplamiento via window |
| ❌ Sin bugs críticos | No | 3 bugs críticos identificados |
| ❌ Código limpio y consistente | No | Naming mixto, variables duplicadas |
| ❌ Tests | No | Cero cobertura |
| ❌ Linting | No | Sin ESLint/Prettier |
| ⚠️ Seguridad | Básica | Sin CSP, sin SRI en CDNs |
| ⚠️ Performance | Aceptable | Polling innecesario, updates no optimizados |
| ⚠️ UX consistente | Parcial | Mezcla alert/Swal, sin estados de botones |
| ❌ Responsive completo | No | Bug de clase CSS, media query no aplica |
| ❌ Documentación | No | Sin README, sin JSDoc, sin comentarios de protocolo |
| ✅ Control de versiones | Sí | Git en uso con colaboradores |
| ❌ Mensajes de commit | No | Mensajes no descriptivos |

---

## Roadmap de Mejoras Recomendado

### Semana 1 — Bugs críticos (no requieren refactor grande)
1. Fix `generateSimulatedData` — `const freq` local
2. Fix `case 0x68` — agregar blaves `{}`
3. Fix `chart.umd.js` — incluir el archivo completo
4. Fix CSS `.chart-container` vs `.charts-container`
5. Fix `width: 100 px` en media query mobile
6. Cambiar `lang="en"` a `lang="es-AR"`

### Semana 2 — Calidad y DX
7. Inicializar `package.json` + agregar ESLint
8. Agregar `.gitignore` (excluir `node_modules`, binarios de driver)
9. Reemplazar `alert()` por `Swal.fire()`
10. Agregar `const CMD = { ... }` para el protocolo
11. Eliminar código comentado (botón Bluetooth) o implementarlo

### Semana 3 — Arquitectura
12. Encapsular estado en objeto `AppState`
13. Reemplazar `window.*` por Custom Events
14. Mover CSS de `createWaitingCircle` a `style.css`
15. Agregar indicador visual de estado de conexión

### Futuro — Nice to have
16. Agregar `type="module"` a los scripts
17. Persistir `FileSystemDirectoryHandle` en IndexedDB correctamente
18. Tests unitarios para `processData`, `processSensorData`, `calculateChecksum`
19. README con setup, protocolo hardware, y capturas

---

*Revisión generada con análisis estático del código fuente. Los bugs marcados como 🔴 Crítico fueron reproducidos lógicamente en el código y requieren atención inmediata.*
