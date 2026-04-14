// scripts/script.js (sustituir totalmente)

'use strict';

/* ---------- Globals ---------- */
let simulationInterval = null;
let bluetoothInterval = null;
let serialInterval = null;
let serialReader = null;
let serialPort = null;

let lastBluetoothData = null;
let lastSerialData = null;
let previousSerialData = null;

let handPosition = null;
let profundidad = null;
let freq = null;

let cambioDeId = 0x64;

let visualizationWindow = null;

let handsFlag = false;
let currentState = 'IDLE';
let contadorUniversal = 0;

window.handsOk = false;
let handsPopupOpen = false;
let handsPopupIntervalId = null;

let finishTimeoutId = null;
let finishScheduled = false;
window.finishPopupShown = false;

window.handsPopupShownThisSession = false;
window.sessionId = window.sessionId || 0;

let flagCierroPopup = false;

let idDestino = 0x00;
let idPag = 0x00;
let idOrigen = 0x00;
let comando = 0x01;
let data = new Array(8).fill(0x00);

let flagSendData = false;
let sendDataFlag = false;
let flagCambio = true;
let count = 0;

let samePacketCount = 0;
let lastPacketId = null;
let stuckTimeout = null;

let contadormil = 0;

const DEBUG = true;

let prevState = null; 
let prevComando = null;
let sameComandoCounter = 0;

/* ---------- Utility helpers ---------- */
function log(...args) { if (DEBUG) console.log(...args); }

function calculateChecksum(arr) {
    let sum = 0;
    for (const b of arr) sum += b;
    while (sum > 0xFF) sum = (sum & 0xFF) + (sum >> 8);
    sum = ~sum & 0xFF;
    return sum;
}

/* ---------- Progress bar ---------- */
let progressInterval = null;
let progressSeconds = 0;
const PROGRESS_DURATION = 60;

function startProgressBar() {
    const container = document.getElementById('progressContainer');
    const bar = document.getElementById('progressBar');
    const label = document.getElementById('progressLabel');

    if (!container || !bar) return;
    if (progressInterval) return; // ← GUARD: ya está corriendo, no reiniciar

    progressSeconds = 0;
    bar.style.width = '0%';
    bar.style.background = 'linear-gradient(90deg, #4caf50, #ff9800)';
    if (label) label.textContent = `0s / ${PROGRESS_DURATION}s`;
    container.style.display = 'block';
    console.log('empezo el timeout');

    progressInterval = setInterval(() => {
        progressSeconds++;
        const pct = Math.min((progressSeconds / PROGRESS_DURATION) * 100, 100);
        bar.style.width = pct + '%';
        if (label) label.textContent = `${progressSeconds}s / ${PROGRESS_DURATION}s`;

        if (progressSeconds >= 50) {
            bar.style.background = 'linear-gradient(90deg, #ff9800, #f44336)';
        }

        if (progressSeconds >= PROGRESS_DURATION) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
    }, 1000);
}

function stopProgressBar() {
    console.log('🛑 STOP PROGRESS BAR');
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    const container = document.getElementById('progressContainer');
    if (container) container.style.display = 'none';
    console.log('termino el timeout');
}

/* ---------- State / timers ---------- */
function clearFinishSchedule() {
    if (finishTimeoutId) {
        clearTimeout(finishTimeoutId);
        finishTimeoutId = null;
    }
    finishScheduled = false;
    stopProgressBar(); // 👈 para y oculta la barra
}

function resetAllStates() {
    log('🔄 resetAllStates — invalidando session y limpiando timers');
    window.sessionId = (window.sessionId || 0) + 1;

    if (simulationInterval) { clearInterval(simulationInterval); simulationInterval = null; }
    if (bluetoothInterval) { clearInterval(bluetoothInterval); bluetoothInterval = null; }
    if (serialInterval) { clearInterval(serialInterval); serialInterval = null; }
    if (handsPopupIntervalId) { clearInterval(handsPopupIntervalId); handsPopupIntervalId = null; }
    clearFinishSchedule();
    stopProgressBar(); // 👈 limpia barra en reset total

    lastBluetoothData = null;
    lastSerialData = null;
    previousSerialData = null;

    handPosition = null;
    profundidad = null;
    freq = null;

    handsFlag = false;
    currentState = 'IDLE';
    contadorUniversal = 0;
    window.handsOk = false;
    handsPopupOpen = false;
    window.handsPopupShownThisSession = false;
    window.finishPopupShown = false;
    flagCierroPopup = false;

    idDestino = 0x00;
    idPag = 0x00;
    idOrigen = 0x00;
    comando = 0x01;
    data = new Array(8).fill(0x00);

    flagSendData = false;
    sendDataFlag = false;
    flagCambio = true;
    count = 0;

    const receivedDataElement = document.getElementById('receivedData');
    if (receivedDataElement) receivedDataElement.textContent = "Ningún dato recibido aún";

    const simBtn = document.getElementById('simulateButton');
    if (simBtn) simBtn.textContent = "Simular Trama";

    log('✅ resetAllStates completo (sessionId=', window.sessionId, ')');
}

/* ---------- Finish scheduling (protected by session) ---------- */
function scheduleFinishOnce() {
    console.log("🚀 scheduleFinishOnce llamado");
    if (finishScheduled || window.finishPopupShown) return;
    finishScheduled = true;
    startProgressBar(); // 👈 arranca la barra al programar el timeout

    const thisSession = window.sessionId;
    finishTimeoutId = setTimeout(() => {
        if (thisSession !== window.sessionId) {
            finishScheduled = false;
            finishTimeoutId = null;
            log('⏱ Timeout de finish ignorado por cambio de session');
            return;
        }

        if (currentState !== 'FINISH') {
            currentState = 'FINISH';
            sendToModule({
                idDestino: 0x66,
                idPag: contadorUniversal,
                idOrigen: 0x01,
                comando: 0x05,
                data
            });
        }

        if (!window.finishPopupShown && typeof window.saveCharts === 'function') {
            window.finishPopupShown = true;
            window.saveCharts();
        }

        comando = 0x01;
        finishTimeoutId = null;
        finishScheduled = false;
        stopProgressBar(); // 👈 para la barra cuando termina el minuto
    }, 60000);
}

/* ---------- Procesamiento de datos ---------- */
function processData(text) {
    if (!text || typeof text !== 'string') return;
    const regex = /U(OK|NOK),P(\d+),F(\d+):/;
    const match = text.match(regex);
    const receivedDataElement = document.getElementById('receivedData');

    if (match) {
        const [, handPos, profStr, freqStr] = match;
        window.handsOk = (handPos === 'OK');

        const processed = {
            handPosition: handPos,
            profundidad: parseInt(profStr, 10),
            freq: parseInt(freqStr, 10)
        };

        if (typeof window.updateVisualization === 'function') {
            window.updateVisualization(processed);
        }
    } else {
        log('⚠️ Trama no coincide con regex:', text);
        if (receivedDataElement) receivedDataElement.textContent = `Trama no procesada: ${text}`;
    }
}

function processSensorData(sensorBytes) {
    if (!sensorBytes || !sensorBytes.length) return;
    const manoOK = sensorBytes[0] === 1 ? 'OK' : 'NOK';
    const profundidadVal = sensorBytes[1] | (sensorBytes[2] << 8);
    const frecuenciaVal = sensorBytes[3] | (sensorBytes[4] << 8);

    window.handsOk = (manoOK === 'OK');

    const receivedDataElement = document.getElementById('receivedData');

    const processed = {
        handPosition: manoOK,
        profundidad: profundidadVal,
        freq: frecuenciaVal
    };

    if (typeof window.updateVisualization === 'function') {
        window.updateVisualization(processed);
    }
}

/* ---------- Popups ---------- */
function abrirPopup() {
    if (handsPopupOpen || window.handsPopupShownThisSession) return;
    if (!window.Swal) {
        console.warn('SweetAlert2 no encontrado');
        return;
    }

    handsPopupOpen = true;
    window.handsPopupShownThisSession = true;

    Swal.fire({
        title: "Poner bien las manos",
        text: "El pop-up se cerrará cuando pongas bien las manos",
        icon: "info",
        showConfirmButton: true,
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: 'Terminar Maniobra',
        didClose: () => {
            handsPopupOpen = false;
            if (handsPopupIntervalId) {
                clearInterval(handsPopupIntervalId);
                handsPopupIntervalId = null;
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            window.saveCharts();
        }
    });

    const thisSession = window.sessionId;
    handsPopupIntervalId = setInterval(() => {
        if (thisSession !== window.sessionId) {
            clearInterval(handsPopupIntervalId);
            handsPopupIntervalId = null;
            return;
        }
        if (window.handsOk === true || currentState !== 'WAIT_HANDS') {
            Swal.close();
        }
    }, 80);
}

/* ---------- Envío de tramas ---------- */
async function sendToModule({ idDestino, idPag, idOrigen, comando, data }) {
    try {
        if (!serialPort || !serialPort.writable) {
            log('❌ No hay puerto serial para enviar.');
            return;
        }

        if (!Array.isArray(data) || data.length !== 8) {
            log('❌ data debe ser array de 8 bytes');
            return;
        }

        if (idPag === 0x00) idPag = contadorUniversal++;


        const frame = [
            idDestino,
            0x00,
            idPag,
            0x00,
            idDestino, 0x00,
            idOrigen, 0x00,
            comando,
            ...data
        ];

        const checksum = calculateChecksum(frame);
        frame.push(checksum);
        frame.push(0x0D);

        const writer = serialPort.writable.getWriter();
        await writer.write(new Uint8Array(frame));
        writer.releaseLock();

        log('✅ Trama enviada:', frame.map(b => b.toString(16).padStart(2, '0')).join(' '));
    } catch (err) {
        console.error('❌ Error enviando trama:', err);
    }
}

function checkStuckPacket(currentId) {
    if (currentId === lastPacketId) {
        samePacketCount++;
    } else {
        samePacketCount = 0;
        lastPacketId = currentId;
    }

    if (samePacketCount >= 10) {
        samePacketCount = 0;
        lastPacketId = null;

        if (stuckTimeout) clearTimeout(stuckTimeout);
        stuckTimeout = setTimeout(() => {
            if (window.Swal) {
                Swal.fire({
                    title: "⚠️ Sin recepción de datos",
                    text: "La maniobra se ha detenido por falta de actualización de paquetes.",
                    icon: "warning",
                    confirmButtonText: "Aceptar"
                });
            } else {
                alert("⚠️ Sin recepción de datos: la maniobra se ha detenido.");
            }

            stopSerialLoop();
            currentState = 'FINISH';
            if (!window.finishPopupShown && typeof window.saveCharts === 'function') {
                window.finishPopupShown = true;
                window.saveCharts();
            }
        }, 500);
    }
}

/* ---------- Simulación ---------- */
function generateSimulatedData(contadormil) {
    const handPosition = Math.random() > 0.5 ? 'OK' : 'NOK';
    const profundidad = Math.floor(Math.random() * 100);
    freq = 0;
    contadormil++;
    if (contadormil > 30) {
        const freq = Math.floor(Math.random() * 200) + 50;
    }
    return `\nU${handPosition},P${profundidad},F${freq}:`;
}

/* ---------- Serial read routine (frame parser) ---------- */
function startSerialReadLoop() {
    if (!serialReader) return;

    (async () => {
        try {
            const buffer = [];
            while (serialPort && serialReader) {
                const { value, done } = await serialReader.read();
                if (done) break;
                if (!value) continue;
                for (let i = 0; i < value.length; i++) {
                    const byte = value[i];
                    if (byte === 0x0D) {
                        if (buffer.length === 18) {
                            const packet = new Uint8Array(buffer);
                            const checksum = packet[17];
                            const calc = calculateChecksum(packet.slice(0, 17));
                            if (checksum === calc) {
                                const dirDestino1 = packet[0];
                                const IDpaq = packet[2];
                                const dirDestino2 = (packet[4] << 8) | packet[5];
                                const dirOrigen16 = (packet[6] << 8) | packet[7];
                                const receivedComando = packet[8];
                                const receivedData = packet.slice(9, 17);

                                comando = receivedComando;
                                data = Array.from(receivedData);
                                idPag = IDpaq;
                                idOrigen = packet[6];
                                idDestino = dirDestino1;
                                sendDataFlag = packet[14];

                                log('📥 Trama valida recibida, comando=0x' + receivedComando.toString(16));

                            } else {
                                log('⚠️ Checksum invalido', checksum, calc);
                            }
                        } else {
                            log('⚠️ Longitud trama inesperada:', buffer.length);
                        }
                        buffer.length = 0;
                    } else {
                        buffer.push(byte);
                    }
                }
            }
        } catch (err) {
            console.error('❌ Error en read loop:', err);
        } finally {
            try {
                if (serialReader) {
                    await serialReader.releaseLock();
                    serialReader = null;
                }
            } catch (e) { /* ignore */ }
        }
    })();
}

/* ---------- State machine loop (shared between connect and restart) ---------- */
function runStateMachine() {

    const currentSession = window.sessionId;
    return setInterval(() => {
        if (currentSession !== window.sessionId) {
            clearInterval(serialInterval);
            serialInterval = null;
            return;
        }
        contadorUniversal++;
        
        //  DETECTOR DE ENTRADA A SEND_DATA
        if (currentState === 'SEND_DATA' && prevState !== 'SEND_DATA') {
            console.log('🚀 Entró a SEND_DATA → inicio timeout + barra');
            scheduleFinishOnce();
        }
        prevState = currentState;

        switch (comando) {
            case 0x01:
                sendToModule({ idDestino: cambioDeId, idPag, idOrigen: 0x01, comando, data });
    
                currentState = 'START';
                break;
            case 0x65:
                sendToModule({ idDestino: cambioDeId, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x02, data });
                currentState = 'WAIT_CONFIRMATION';
                break;
            case 0x66:
                if (data[0] !== 0x71) {
                    sendToModule({ idDestino: cambioDeId, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x03, data });
                    currentState = 'WAIT_HANDS';
                    abrirPopup();
                } else {
                    data[0] = 0x71;
                    sendToModule({ idDestino: cambioDeId, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x66, data });
                    currentState = 'SEND_DATA';
                    sendToModule({ idDestino: cambioDeId, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x03, data });
                    console.log('empezo el timeout');
                    scheduleFinishOnce();
                }
                if (data[0] === 0xFF) currentState = 'IDLE';
                break;

            case 0x03:
                if (!flagSendData) {
                    if (flagCambio || count < 3) {
                        data[0] = 0x71;
                        sendToModule({ idDestino: cambioDeId, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x66, data });
                        flagCambio = false;
                        count++;
                    } else {
                        sendToModule({ idDestino: cambioDeId, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x04, data });
                        flagCambio = true;
                        count = 0;
                    }
                    if (data[5] === 0x01) {
                        currentState = 'SEND_DATA';
                        flagSendData = true;
                        console.log('empezo el timeout');
                        scheduleFinishOnce();
                    }
                } else {
                    if (currentState !== 'FINISH' && (sendDataFlag === true || data[5] === 0x01)) {
                        processSensorData(data);
                        sendToModule({ idDestino: cambioDeId, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x04, data });
                        checkStuckPacket(idPag);
                    }
                    scheduleFinishOnce();
                }
                break;

            case 0x68:
                if (currentState !== 'FINISH' && (sendDataFlag === true || data[5] === 0x01)) {
                    processSensorData(data);
                    sendToModule({ idDestino: cambioDeId, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x04, data });
                    checkStuckPacket(idPag);
                }
                scheduleFinishOnce(); // 👈 arranca la barra para el timeout de 0x68
                const timeoutSession = window.sessionId;
                setTimeout(() => {
                    if (timeoutSession !== window.sessionId) return;
                    currentState = 'FINISH';
                    sendToModule({ idDestino: cambioDeId, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x05, data });
                    stopProgressBar(); // 👈 para la barra al terminar
                    if (!flagCierroPopup) {
                        flagCierroPopup = true;
                        if (!window.finishPopupShown && typeof window.saveCharts === 'function') {
                            window.finishPopupShown = true;
                            window.saveCharts();
                        }
                    }
                    comando = 0x01;
                }, 60000);
                break;

            case 0x09:
                if (window.Swal) {
                    Swal.fire({
                        title: "⚠️ bateria baja",
                        text: "La maniobra no se puede ejecutarse por falta de bateria, conectar cargador.",
                        icon: "warning",
                        confirmButtonText: "Aceptar"
                    });
                } else {
                    alert("⚠️ Sin bateria: la maniobra se ha detenido.");
                }
                stopSerialLoop();
                currentState = 'FINISH';
                break;

            case 0x0A:
            case 0x0B:
                if (window.Swal) {
                    Swal.fire({
                        title: "⚠️ Falla en los sensores",
                        text: "La maniobra no se puede ejecutar por falla en los sensores, llame a servicio técnico.",
                        icon: "warning",
                        confirmButtonText: "Aceptar"
                    });
                } else {
                    alert("⚠️ falla en los sensores.");
                }
                stopSerialLoop();
                currentState = 'FINISH';
                break;
        }
    }, 250);
}

/* ---------- Serial / Bluetooth / Simulate event handlers (attach after DOM) ---------- */
document.addEventListener('DOMContentLoaded', () => {
    // Asegura que todas las variables arranquen en estado limpio al iniciar.
    resetAllStates();

    const bluetoothButton = document.getElementById('bluetoothButton');
    const serialButton = document.getElementById('serialButton');
    const simulateButton = document.getElementById('simulateButton');
    const manualFinishButton = document.getElementById('saveButton');

    // ----- Bluetooth -----
    if (bluetoothButton) {
        bluetoothButton.addEventListener('click', async () => {
            try {
                const device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: ['device_information', 'battery_service'],
                });
                const server = await device.gatt.connect();
                const service = await server.getPrimaryService('device_information');
                const characteristic = await service.getCharacteristic('manufacturer_name_string');

                characteristic.addEventListener('characteristicvaluechanged', (ev) => {
                    lastBluetoothData = new TextDecoder().decode(ev.target.value);
                });
                await characteristic.startNotifications();

                if (bluetoothInterval) clearInterval(bluetoothInterval);
                bluetoothInterval = setInterval(() => {
                    if (lastBluetoothData) {
                        processData(lastBluetoothData);
                        lastBluetoothData = null;
                    }
                }, 500);

                alert('Conexión Bluetooth establecida.');
                log('🔵 Bluetooth OK');
            } catch (err) {
                console.error('❌ Error Bluetooth:', err);
                alert('No se pudo conectar al dispositivo Bluetooth.');
            }
        });
    }

    // ----- Simular -----
    if (simulateButton) {
        simulateButton.addEventListener('click', () => {
            if (simulationInterval) {
                clearInterval(simulationInterval);
                simulationInterval = null;
                simulateButton.textContent = "Simular Trama";
                alert('Simulación detenida.');
            } else {
                simulationInterval = setInterval(() => {
                    const sim = generateSimulatedData(contadormil);
                    processData(sim);
                }, 500);
                simulateButton.textContent = "⏸ Pausar simulación";
                alert('Simulación iniciada.');
            }
        });
    }

    // ----- Serial connect -----
    if (serialButton) {
        serialButton.addEventListener('click', async () => {
            try {
                serialPort = await navigator.serial.requestPort();
                await serialPort.open({ baudRate: 115200 });

                let info = `Puerto serial abierto: ${serialPort.getInfo().usbVendorId || 'N/A'}:${serialPort.getInfo().usbProductId || 'N/A'}`;
                console.log(info);

                let infotomi = serialPort.getInfo();
                console.log(infotomi);

                serialReader = serialPort.readable.getReader();
                startSerialReadLoop();

                if (!serialInterval) {
                    serialInterval = runStateMachine(); // 👈 usa función compartida
                }

                alert('Conexión Serial establecida.');
                log('🔌 Serial OK');
            } catch (err) {
                console.error('❌ Error conexión Serial:', err);
                alert('No se pudo conectar al dispositivo Serial.');
            }
        });
    }

    // ----- Manual finish button -----
    if (manualFinishButton) {
        manualFinishButton.addEventListener('click', () => {
            clearFinishSchedule();
            if (currentState !== 'FINISH') {
                currentState = 'FINISH';
                sendToModule({ idDestino: cambioDeId, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x05, data });
            }
            if (!window.finishPopupShown && typeof window.saveCharts === 'function') {
                window.finishPopupShown = true;
                window.saveCharts();
            }
        });
    }
});

/* ---------- Utilities to stop / close serial gracefully ---------- */
async function stopSerialLoop() {
    if (serialInterval) {
        clearInterval(serialInterval);
        serialInterval = null;
        log('⏸ Serial loop detenido');
    }
}

async function closeSerialConnection() {
    try {
        stopSerialLoop();
        if (serialReader) {
            await serialReader.cancel();
            try { serialReader.releaseLock(); } catch (e) {}
            serialReader = null;
        }
        if (serialPort) {
            await serialPort.close();
            serialPort = null;
        }
        log('🔌 Serial cerrado');

        
        alert('Se cerró la conexión al Buddy. Para reestablecerla, conectar de vuelta via Bluetooth.');

    } catch (err) {
        console.error('❌ Error cerrando serial:', err);
    }
}

/* Expose minimal APIs globally for visualization.js */
window.restartSerialLoop = function () {
    resetAllStates();

    if (serialPort && !serialInterval) {
        serialInterval = runStateMachine(); // 👈 usa función compartida
        log('▶️ Loop serial reiniciado en restartSerialLoop()');
    } else {
        log('restartSerialLoop: no hay puerto serial abierto, solo reseteo de estados');
    }
};

window.closeSerialConnection = closeSerialConnection;