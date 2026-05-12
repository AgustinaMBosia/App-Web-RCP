import { AppState } from './state/appState.js';
import { CMD, BUDDY_ID } from './protocol/constants.js';
import { stopProgressBar } from './ui/progressBar.js';
import { log, setConnectionStatus, showAlert } from './ui/logger.js';
import { startSerialReadLoop } from './serial/frameParser.js';
import { sendToModule, closeSerialConnection } from './serial/serialManager.js';
import { runStateMachine } from './protocol-handlers/stateMachine.js';
import { updateVisualization } from './visualization/dataHandler.js';
import { saveCharts } from './visualization/summaryModal.js';
import { resetCharts } from './visualizacion.js';

/* ---------- Ciclo de vida de la sesión ---------- */

function clearFinishSchedule() {
    if (AppState.finishTimeoutId) {
        clearTimeout(AppState.finishTimeoutId);
        AppState.finishTimeoutId = null;
    }
    AppState.finishScheduled = false;
    stopProgressBar();
}

function resetAllStates() {
    log('🔄 resetAllStates — invalidando session');

    if (AppState.simulationInterval) { clearInterval(AppState.simulationInterval); AppState.simulationInterval = null; }
    if (AppState.bluetoothInterval)  { clearInterval(AppState.bluetoothInterval);  AppState.bluetoothInterval  = null; }
    if (AppState.serialInterval)     { clearInterval(AppState.serialInterval);     AppState.serialInterval     = null; }
    clearFinishSchedule();

    AppState.resetSession();

    const simBtn = document.getElementById('simulateButton');
    if (simBtn) simBtn.textContent = 'Simular Trama';

    log('✅ resetAllStates completo (sessionId=', AppState.sessionId, ')');
}

function restartSerialLoop() {
    resetAllStates();
    if (AppState.serialPort && !AppState.serialInterval) {
        AppState.serialInterval = runStateMachine();
        log('▶️ Loop serial reiniciado');
    }
}

/* ---------- Procesamiento de tramas de texto (Bluetooth / Simulación) ---------- */

function processData(text) {
    if (!text || typeof text !== 'string') return;
    const match = text.match(/U(OK|NOK),P(\d+),F(\d+):/);

    if (match) {
        const [, handPos, profStr, freqStr] = match;
        AppState.handsOk = (handPos === 'OK');
        if (AppState.handsOk && AppState.handsPopupOpen && window.Swal) Swal.close();
        updateVisualization({
            handPosition: handPos,
            profundidad:  parseInt(profStr, 10),
            freq:         parseInt(freqStr, 10)
        });
    } else {
        log('⚠️ Trama de texto no reconocida:', text);
    }
}

/* ---------- Simulación ---------- */

function generateSimulatedData() {
    const handPosition = Math.random() > 0.3 ? 'OK' : 'NOK';
    const profundidad  = Math.floor(Math.random() * 40) + 30;   // 30–70 mm
    const freq         = Math.floor(Math.random() * 70) + 80;   // 80–150 cpm
    return `U${handPosition},P${profundidad},F${freq}:`;
}

/* ---------- Bootstrap ---------- */

document.addEventListener('DOMContentLoaded', () => {
    /* Cablear hooks de comunicación inter-módulo */
    AppState._hooks.saveCharts            = saveCharts;
    AppState._hooks.resetCharts           = resetCharts;
    AppState._hooks.closeSerialConnection = closeSerialConnection;
    AppState._hooks.updateVisualization   = updateVisualization;
    AppState._hooks.resetAllStates        = resetAllStates;
    AppState._hooks.restartSerialLoop     = restartSerialLoop;

    resetAllStates();

    const bluetoothButton    = document.getElementById('bluetoothButton');
    const serialButton       = document.getElementById('serialButton');
    const simulateButton     = document.getElementById('simulateButton');
    const resetButton        = document.getElementById('resetButton');
    const manualFinishButton = document.getElementById('saveButton');

    if (resetButton) resetButton.addEventListener('click', resetCharts);

    if (manualFinishButton) {
        manualFinishButton.addEventListener('click', () => {
            clearFinishSchedule();
            if (AppState.currentState !== 'FINISH') {
                AppState.currentState = 'FINISH';
                sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.FINISH, data: AppState.data });
            }
            if (!AppState.finishPopupShown) {
                AppState.finishPopupShown = true;
                saveCharts();
            }
        });
    }

    // ----- Bluetooth -----
    if (bluetoothButton) {
        bluetoothButton.addEventListener('click', async () => {
            try {
                const device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: ['device_information', 'battery_service'],
                });
                const server         = await device.gatt.connect();
                const service        = await server.getPrimaryService('device_information');
                const characteristic = await service.getCharacteristic('manufacturer_name_string');

                characteristic.addEventListener('characteristicvaluechanged', (ev) => {
                    AppState.lastBluetoothData = new TextDecoder().decode(ev.target.value);
                });
                await characteristic.startNotifications();

                if (AppState.bluetoothInterval) clearInterval(AppState.bluetoothInterval);
                AppState.bluetoothInterval = setInterval(() => {
                    if (AppState.lastBluetoothData) {
                        processData(AppState.lastBluetoothData);
                        AppState.lastBluetoothData = null;
                    }
                }, 500);

                showAlert({ title: '✅ Conexión Bluetooth establecida', icon: 'success', timer: 2000, showConfirmButton: false });
                log('🔵 Bluetooth OK');
            } catch (err) {
                console.error('❌ Error Bluetooth:', err);
                showAlert({ title: 'Error Bluetooth', text: 'No se pudo conectar al dispositivo Bluetooth.', icon: 'error', confirmButtonText: 'Aceptar' });
            }
        });
    }

    // ----- Simulación -----
    if (simulateButton) {
        simulateButton.addEventListener('click', () => {
            if (AppState.simulationInterval) {
                clearInterval(AppState.simulationInterval);
                AppState.simulationInterval = null;
                simulateButton.textContent = 'Simular Trama';
                showAlert({ title: 'Simulación detenida', icon: 'info', timer: 1500, showConfirmButton: false });
            } else {
                AppState.simulationInterval = setInterval(() => {
                    processData(generateSimulatedData());
                }, 500);
                simulateButton.textContent = '⏸ Pausar simulación';
                showAlert({ title: 'Simulación iniciada', icon: 'success', timer: 1500, showConfirmButton: false });
            }
        });
    }

    // ----- Serial -----
    if (serialButton) {
        serialButton.addEventListener('click', async () => {
            serialButton.disabled    = true;
            serialButton.textContent = 'Conectando…';
            setConnectionStatus('connecting');
            try {
                AppState.serialPort = await navigator.serial.requestPort();
                await AppState.serialPort.open({ baudRate: 115200 });

                log('Puerto serial abierto:', AppState.serialPort.getInfo());

                AppState.serialReader = AppState.serialPort.readable.getReader();
                startSerialReadLoop();

                if (!AppState.serialInterval) AppState.serialInterval = runStateMachine();

                serialButton.textContent = 'Conectado ✓';
                setConnectionStatus('connected');
                showAlert({ title: '✅ Conexión establecida', icon: 'success', timer: 2000, showConfirmButton: false });
                log('🔌 Serial OK');
            } catch (err) {
                console.error('❌ Error conexión Serial:', err);
                serialButton.disabled    = false;
                serialButton.textContent = 'Conectar dispositivo';
                setConnectionStatus('disconnected');
                if (err.name !== 'NotFoundError') {
                    showAlert({ title: 'Error de conexión', text: 'No se pudo conectar al dispositivo.', icon: 'error', confirmButtonText: 'Aceptar' });
                }
            }
        });
    }
});
