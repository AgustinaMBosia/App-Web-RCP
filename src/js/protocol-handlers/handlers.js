import { AppState } from '../state/appState.js';
import { CMD, BUDDY_ID } from '../protocol/constants.js';
import { sendToModule, stopSerialLoop } from '../serial/serialManager.js';
import { startProgressBar, stopProgressBar } from '../ui/progressBar.js';
import { log, showAlert } from '../ui/logger.js';

/* ---------- Scheduling de fin de maniobra ---------- */
export function scheduleFinishOnce() {
    if (AppState.finishScheduled || AppState.finishPopupShown) return;
    AppState.finishScheduled = true;
    startProgressBar();

    const thisSession = AppState.sessionId;
    AppState.finishTimeoutId = setTimeout(() => {
        if (thisSession !== AppState.sessionId) {
            AppState.finishScheduled = false;
            AppState.finishTimeoutId = null;
            log('⏱ Timeout de finish ignorado — sesión cambió');
            return;
        }

        if (AppState.currentState !== 'FINISH') {
            AppState.currentState = 'FINISH';
            sendToModule({ idDestino: CMD.HANDS_STATUS, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.FINISH, data: AppState.data });
        }

        if (!AppState.finishPopupShown) {
            AppState.finishPopupShown = true;
            AppState._hooks.saveCharts?.();
        }

        AppState.comando         = CMD.PING;
        AppState.finishTimeoutId = null;
        AppState.finishScheduled = false;
        stopProgressBar();
    }, 60000);
}

/* ---------- Procesamiento de datos de sensor ---------- */
export function processSensorData(sensorBytes) {
    if (!sensorBytes || !sensorBytes.length) return;

    const manoOK       = sensorBytes[0] === 1 ? 'OK' : 'NOK';
    const profundidadV = sensorBytes[1] | (sensorBytes[2] << 8);
    const frecuenciaV  = sensorBytes[3] | (sensorBytes[4] << 8);

    AppState.handsOk = (manoOK === 'OK');

    if (AppState.handsOk && AppState.handsPopupOpen && window.Swal) Swal.close();

    AppState._hooks.updateVisualization?.({ handPosition: manoOK, profundidad: profundidadV, freq: frecuenciaV });
}

/* ---------- Popup de posición de manos ---------- */
export function abrirPopup() {
    if (AppState.handsPopupOpen || AppState.handsPopupShownThisSession) return;
    if (!window.Swal) { console.warn('SweetAlert2 no encontrado'); return; }

    AppState.handsPopupOpen             = true;
    AppState.handsPopupShownThisSession = true;

    Swal.fire({
        title:             'Poner bien las manos',
        text:              'El pop-up se cerrará cuando pongas bien las manos',
        icon:              'info',
        showConfirmButton: true,
        allowOutsideClick: false,
        allowEscapeKey:    false,
        confirmButtonText: 'Terminar Maniobra',
        didClose: () => { AppState.handsPopupOpen = false; }
    }).then((result) => {
        if (result.isConfirmed) AppState._hooks.saveCharts?.();
    });
}

/* ---------- Detección de paquetes repetidos ---------- */
export function checkStuckPacket(currentId) {
    if (currentId === AppState.lastPacketId) {
        AppState.samePacketCount++;
    } else {
        AppState.samePacketCount = 0;
        AppState.lastPacketId    = currentId;
    }

    if (AppState.samePacketCount >= 10) {
        AppState.samePacketCount = 0;
        AppState.lastPacketId    = null;

        if (AppState.stuckTimeout) clearTimeout(AppState.stuckTimeout);
        AppState.stuckTimeout = setTimeout(() => {
            showAlert({
                title: '⚠️ Sin recepción de datos',
                text:  'La maniobra se detuvo por falta de actualización de paquetes.',
                icon:  'warning',
                confirmButtonText: 'Aceptar'
            });
            stopSerialLoop();
            AppState.currentState = 'FINISH';
            if (!AppState.finishPopupShown) {
                AppState.finishPopupShown = true;
                AppState._hooks.saveCharts?.();
            }
        }, 500);
    }
}

/* ============================================================
   Handlers individuales del protocolo
   ============================================================ */

export function handlePing() {
    sendToModule({ idDestino: BUDDY_ID, idPag: AppState.idPag, idOrigen: 0x01, comando: AppState.comando, data: AppState.data });
    AppState.currentState = 'START';
}

export function handleConfirmRequest() {
    sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.CONFIRM, data: AppState.data });
    AppState.currentState = 'WAIT_CONFIRMATION';
}

export function handleHandsStatus() {
    if (AppState.data[0] !== CMD.HANDS_OK_VAL) {
        sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.ACK_HANDS, data: AppState.data });
        AppState.currentState = 'WAIT_HANDS';
        abrirPopup();
    } else {
        AppState.data[0] = CMD.HANDS_OK_VAL;
        sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.HANDS_STATUS, data: AppState.data });
        AppState.currentState = 'SEND_DATA';
        sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.ACK_HANDS, data: AppState.data });
        scheduleFinishOnce();
    }

    // Reset de emergencia del hardware — tiene prioridad sobre cualquier estado seteado arriba
    if (AppState.data[0] === CMD.BUDDY_RESET) AppState.currentState = 'IDLE';
}

export function handleAckHands() {
    if (!AppState.flagSendData) {
        handleAckHandsHandshake();
    } else {
        handleAckHandsDataActive();
    }
}

function handleAckHandsHandshake() {
    if (AppState.flagCambio || AppState.count < 3) {
        AppState.data[0] = CMD.HANDS_OK_VAL;
        sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.HANDS_STATUS, data: AppState.data });
        AppState.flagCambio = false;
        AppState.count++;
    } else {
        sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.ACK_DATA, data: AppState.data });
        AppState.flagCambio = true;
        AppState.count = 0;
    }

    if (AppState.data[5] === 0x01) {
        AppState.currentState = 'SEND_DATA';
        AppState.flagSendData = true;
        scheduleFinishOnce();
    }
}

function handleAckHandsDataActive() {
    const dataIsActive = AppState.sendDataFlag === true || AppState.data[5] === 0x01;

    if (AppState.currentState !== 'FINISH' && dataIsActive) {
        processSensorData(AppState.data);
        sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.ACK_DATA, data: AppState.data });
        checkStuckPacket(AppState.idPag);
    }

    scheduleFinishOnce();
}

export function handleSensorData() {
    const dataIsActive = AppState.sendDataFlag === true || AppState.data[5] === 0x01;

    if (AppState.currentState !== 'FINISH' && dataIsActive) {
        processSensorData(AppState.data);
        sendToModule({ idDestino: BUDDY_ID, idPag: AppState.contadorUniversal, idOrigen: 0x01, comando: CMD.ACK_DATA, data: AppState.data });
        checkStuckPacket(AppState.idPag);
    }

    scheduleFinishOnce();
    scheduleChannelFinish();
}

export function scheduleChannelFinish() {
    const capturedSession  = AppState.sessionId;
    const capturedPagIndex = AppState.contadorUniversal;

    setTimeout(() => {
        if (capturedSession !== AppState.sessionId) return;

        AppState.currentState = 'FINISH';
        sendToModule({ idDestino: BUDDY_ID, idPag: capturedPagIndex, idOrigen: 0x01, comando: CMD.FINISH, data: AppState.data });
        stopProgressBar();

        if (!AppState.flagCierroPopup) {
            AppState.flagCierroPopup = true;
            if (!AppState.finishPopupShown) {
                AppState.finishPopupShown = true;
                AppState._hooks.saveCharts?.();
            }
        }

        AppState.comando = CMD.PING;
    }, 60000);
}

export function handleLowBattery() {
    showAlert({
        title: '⚠️ Batería baja',
        text:  'La maniobra no puede ejecutarse por falta de batería. Conectar el cargador.',
        icon:  'warning',
        confirmButtonText: 'Aceptar'
    });
    stopSerialLoop();
    AppState.currentState = 'FINISH';
}

export function handleSensorFailure() {
    showAlert({
        title: '⚠️ Falla en los sensores',
        text:  'La maniobra no puede ejecutarse por falla en los sensores. Llamar a servicio técnico.',
        icon:  'warning',
        confirmButtonText: 'Aceptar'
    });
    stopSerialLoop();
    AppState.currentState = 'FINISH';
}
