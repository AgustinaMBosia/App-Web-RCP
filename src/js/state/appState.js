import { CMD } from '../protocol/constants.js';

export const AppState = {

    /* ----- Sesión ----- */
    sessionId: 0,

    /* ----- Máquina de estados ----- */
    currentState:      'IDLE',
    prevState:         null,
    contadorUniversal: 0,

    /* ----- Visualización ----- */
    isPaused: false,

    /* ----- Manos / popups ----- */
    handsOk:                    false,
    handsPopupOpen:             false,
    handsPopupShownThisSession: false,

    /* ----- Flujo de finalización ----- */
    finishPopupShown: false,
    finishTimeoutId:  null,   /* limpiado por clearFinishSchedule(), no por resetSession() */
    finishScheduled:  false,
    flagCierroPopup:  false,

    /* ----- Trama activa ----- */
    idDestino: 0x00,
    idPag:     0x00,
    idOrigen:  0x00,
    comando:   null,           /* inicializado en resetSession() → CMD.PING */
    data:      null,           /* inicializado en resetSession() → [0x00 × 8] */

    /* ----- Flags de flujo de datos ----- */
    flagSendData: false,
    sendDataFlag: false,
    flagCambio:   true,
    count:        0,

    /* ----- Detección de paquetes repetidos ----- */
    samePacketCount: 0,
    lastPacketId:    null,
    stuckTimeout:    null,

    /* ----- Handles de I/O ----- */
    simulationInterval: null,
    bluetoothInterval:  null,
    serialInterval:     null,
    serialReader:       null,
    serialPort:         null,
    lastBluetoothData:  null,

    /* ----- Hooks de comunicación inter-módulo — wired en main.js ----- */
    _hooks: {
        saveCharts:            null,
        resetCharts:           null,
        closeSerialConnection: null,
        updateVisualization:   null,
        resetAllStates:        null,
        restartSerialLoop:     null,
    },

    nextSession() {
        this.sessionId++;
    },

    resetSession() {
        this.nextSession();
        this.currentState      = 'IDLE';
        this.prevState         = null;
        this.contadorUniversal = 0;
        this.handsOk                    = false;
        this.handsPopupOpen             = false;
        this.handsPopupShownThisSession = false;
        this.finishPopupShown           = false;
        this.finishScheduled            = false;
        this.flagCierroPopup            = false;
        this.idDestino = 0x00;
        this.idPag     = 0x00;
        this.idOrigen  = 0x00;
        this.comando   = CMD.PING;
        this.data      = new Array(8).fill(0x00);
        this.flagSendData = false;
        this.sendDataFlag = false;
        this.flagCambio   = true;
        this.count        = 0;
    }
};
