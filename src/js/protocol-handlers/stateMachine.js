import { AppState } from '../state/appState.js';
import { CMD } from '../protocol/constants.js';
import { log } from '../ui/logger.js';
import { handlePing, handleConfirmRequest, handleHandsStatus, handleAckHands,
         handleSensorData, handleLowBattery, handleSensorFailure,
         scheduleFinishOnce } from './handlers.js';

const COMMAND_HANDLERS = {
    [CMD.PING]:          handlePing,
    [CMD.CONFIRM_REQ]:   handleConfirmRequest,
    [CMD.HANDS_STATUS]:  handleHandsStatus,
    [CMD.ACK_HANDS]:     handleAckHands,
    [CMD.SENSOR_DATA]:   handleSensorData,
    [CMD.LOW_BATTERY]:   handleLowBattery,
    [CMD.SENSOR_FAIL_A]: handleSensorFailure,
    [CMD.SENSOR_FAIL_B]: handleSensorFailure,
};

function detectSendDataEntry() {
    if (AppState.currentState === 'SEND_DATA' && AppState.prevState !== 'SEND_DATA') {
        log('🚀 Entró a SEND_DATA → inicio timeout');
        scheduleFinishOnce();
    }
    AppState.prevState = AppState.currentState;
}

export function runStateMachine() {
    const capturedSession = AppState.sessionId;

    return setInterval(() => {
        if (capturedSession !== AppState.sessionId) {
            clearInterval(AppState.serialInterval);
            AppState.serialInterval = null;
            return;
        }

        AppState.contadorUniversal++;
        detectSendDataEntry();

        const handler = COMMAND_HANDLERS[AppState.comando];
        if (handler) {
            handler();
        } else {
            log('⚠️ Comando desconocido recibido: 0x' + AppState.comando.toString(16));
        }
    }, 250);
}
