import { AppState } from './state/appState.js';
import { CMD, BUDDY_ID } from './protocol/constants.js';
import { stopProgressBar } from './ui/progressBar.js';
import { log, showAlert } from './ui/logger.js';
import { openPopup, closePopup } from './ui/popups.js';
import { setPhase, setIdle, setConnection, setButtonLabel, renderControls } from './ui/controls.js';
import { startSerialReadLoop } from './serial/frameParser.js';
import { sendToModule, releaseSerialPort } from './serial/serialManager.js';
import { runStateMachine } from './protocol-handlers/stateMachine.js';
import { updateVisualization } from './visualization/dataHandler.js';
import { recordedData } from './visualization/csvExport.js';
import { saveCharts } from './visualization/summaryModal.js';
import { clearManeuverData } from './visualizacion.js';

/* ---------- Ciclo de vida de la sesión ---------- */

function clearFinishSchedule() {
    if (AppState.finishTimeoutId) {
        clearTimeout(AppState.finishTimeoutId);
        AppState.finishTimeoutId = null;
    }
    if (AppState.stuckTimeout) {
        clearTimeout(AppState.stuckTimeout);
        AppState.stuckTimeout = null;
    }
    AppState.finishScheduled = false;
    stopProgressBar();
}

function stopSimulation() {
    if (AppState.simulationInterval) { clearInterval(AppState.simulationInterval); AppState.simulationInterval = null; }
    setButtonLabel(document.getElementById('simulateButton'), 'Simular Trama');
}

function resetAllStates() {
    log('🔄 resetAllStates — invalidando session');

    stopSimulation();
    if (AppState.bluetoothInterval)  { clearInterval(AppState.bluetoothInterval);  AppState.bluetoothInterval  = null; }
    if (AppState.serialInterval)     { clearInterval(AppState.serialInterval);     AppState.serialInterval     = null; }
    clearFinishSchedule();

    AppState.resetSession();

    log('✅ resetAllStates completo (sessionId=', AppState.sessionId, ')');
}

/* "Iniciar maniobra" / "Nueva maniobra": parte siempre de cero. */
function startManeuver() {
    resetAllStates();
    clearManeuverData();

    if (!AppState.serialPort) {   /* sin dispositivo: se usa "Simular Trama" */
        setIdle();
        return;
    }
    setPhase('running');
    AppState.serialInterval = runStateMachine();
    log('▶️ Maniobra iniciada');
}

/* Salida limpia de una maniobra en curso sin resumen (cartel "calculando", popup de manos, falla de hardware) */
function cancelManeuver({ notifyDevice = true } = {}) {
    if (notifyDevice && AppState.serialPort && AppState.serialInterval) {
        sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.FINISH, data: AppState.data });
    }
    resetAllStates();
    clearManeuverData();
    setIdle();
    log('⏹ Maniobra cancelada');
}

/* La maniobra terminó y se mostró el resumen: se frena lo que ya no hace falta */
function onManeuverFinished() {
    stopSimulation();
    clearFinishSchedule();
}

/* Cierre de la conexión serial, pedido por el usuario o por pérdida del dispositivo */
async function onSerialClosed(reason) {
    if (!AppState.serialPort) return;   /* ya se está cerrando */

    const hadData = AppState.phase === 'running' && recordedData.length > 0;
    await releaseSerialPort();
    resetAllStates();
    setConnection('disconnected');

    if (hadData) {
        /* No se pierden los datos: se muestra el resumen de lo registrado */
        saveCharts({ notice: reason === 'lost'
            ? 'Se perdió la conexión con el dispositivo. Este es el resumen de lo registrado hasta ese momento.'
            : 'Se desconectó el dispositivo. Este es el resumen de lo registrado hasta ese momento.' });
        return;
    }

    if (AppState.phase !== 'finished') {
        clearManeuverData();
        setIdle();
    } else {
        renderControls();
    }

    showAlert(reason === 'lost'
        ? { title: 'Dispositivo desconectado', text: 'Se perdió la conexión. Encendé el dispositivo y presioná "Conectar dispositivo".', icon: 'warning', confirmButtonText: 'Aceptar' }
        : { title: 'Dispositivo desconectado', icon: 'info', timer: 2000, showConfirmButton: false },
        reason === 'lost' ? 'alert' : 'info');
}

/* ---------- Procesamiento de tramas de texto (Bluetooth / Simulación) ---------- */

function processData(text) {
    if (!text || typeof text !== 'string') return;
    const match = text.match(/U(OK|NOK),P(\d+),F(\d+):/);

    if (match) {
        const [, handPos, profStr, freqStr] = match;
        AppState.handsOk = (handPos === 'OK');
        if (AppState.handsOk && AppState.handsPopupOpen) closePopup('hands');
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
    AppState._hooks.saveCharts          = saveCharts;
    AppState._hooks.startManeuver       = startManeuver;
    AppState._hooks.cancelManeuver      = cancelManeuver;
    AppState._hooks.maneuverFinished    = onManeuverFinished;
    AppState._hooks.connectionLost      = () => onSerialClosed('lost');
    AppState._hooks.updateVisualization = updateVisualization;
    AppState._hooks.resetAllStates      = resetAllStates;

    resetAllStates();
    setConnection('disconnected');

    const bluetoothButton    = document.getElementById('bluetoothButton');
    const serialButton       = document.getElementById('serialButton');
    const simulateButton     = document.getElementById('simulateButton');
    const startButton        = document.getElementById('startButton');
    const manualFinishButton = document.getElementById('saveButton');
    const cancelWaitingBtn   = document.getElementById('cancelWaitingButton');

    if (startButton)      startButton.addEventListener('click', startManeuver);
    if (cancelWaitingBtn) cancelWaitingBtn.addEventListener('click', () => cancelManeuver());

    if (manualFinishButton) {
        manualFinishButton.addEventListener('click', () => {
            if (AppState.phase === 'finished') { saveCharts(); return; }   /* "Ver resumen" */
            if (AppState.phase !== 'running') return;

            clearFinishSchedule();
            if (AppState.serialPort && AppState.currentState !== 'FINISH') {
                AppState.currentState = 'FINISH';
                sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.FINISH, data: AppState.data });
            }
            saveCharts();
        });
    }

    // Dispositivo desenchufado / apagado
    if (navigator.serial) {
        navigator.serial.addEventListener('disconnect', (ev) => {
            if (ev.target === AppState.serialPort) onSerialClosed('lost');
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

                let lastNotifyTs = null;
                characteristic.addEventListener('characteristicvaluechanged', (ev) => {
                    const now = performance.now();
                    if (lastNotifyTs !== null) {
                        console.log(`🔵 BT notificación — intervalo real: ${(now - lastNotifyTs).toFixed(0)} ms`);
                    }
                    lastNotifyTs = now;
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
                setButtonLabel(simulateButton, 'Simular Trama');
                showAlert({ title: 'Simulación pausada', icon: 'info', timer: 1500, showConfirmButton: false });
                return;
            }

            if (AppState.phase !== 'running') {   /* simular arranca una maniobra nueva */
                resetAllStates();
                clearManeuverData();
                setPhase('running');
            }
            AppState.simulationInterval = setInterval(() => {
                processData(generateSimulatedData());
            }, 500);
            setButtonLabel(simulateButton, '⏸ Pausar simulación');
            showAlert({ title: 'Simulación iniciada', icon: 'success', timer: 1500, showConfirmButton: false });
        });
    }

    // ----- Serial -----
    if (serialButton) {
        serialButton.addEventListener('click', async () => {
            /* Conectado → este botón desconecta */
            if (AppState.serialPort) {
                if (AppState.phase === 'running' && recordedData.length > 0) {
                    const r = await openPopup('alert', {
                        title: '¿Desconectar el dispositivo?',
                        text:  'La maniobra en curso se cerrará y vas a ver su resumen.',
                        icon:  'question',
                        showCancelButton:  true,
                        confirmButtonText: 'Desconectar',
                        cancelButtonText:  'Volver'
                    });
                    if (!r.isConfirmed) return;
                }
                await onSerialClosed('user');
                return;
            }

            setConnection('connecting');
            let port = null;
            try {
                port = await navigator.serial.requestPort();
                await port.open({ baudRate: 115200 });

                AppState.serialPort   = port;
                AppState.serialReader = port.readable.getReader();
                startSerialReadLoop();

                log('Puerto serial abierto:', port.getInfo());

                setConnection('connected');
                if (AppState.phase !== 'finished') {   /* si quedó un resumen sin guardar, se conserva */
                    setIdle();
                    resetAllStates();
                    AppState.serialInterval = runStateMachine();   /* escucha al dispositivo, como antes */
                }
                showAlert({ title: '✅ Conexión establecida', icon: 'success', timer: 2000, showConfirmButton: false });
                log('🔌 Serial OK');
            } catch (err) {
                console.error('❌ Error conexión Serial:', err);
                await releaseSerialPort();
                try { await port?.close(); } catch (e) { /* ya cerrado */ }
                setConnection('disconnected');
                if (err.name !== 'NotFoundError') {
                    showAlert({ title: 'Error de conexión', text: 'No se pudo conectar al dispositivo. Verificá que esté encendido y que ninguna otra pestaña lo esté usando.', icon: 'error', confirmButtonText: 'Aceptar' }, 'alert');
                }
            }
        });
    }
});
