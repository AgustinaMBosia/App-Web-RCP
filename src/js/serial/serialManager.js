import { AppState } from '../state/appState.js';
import { CMD } from '../protocol/constants.js';
import { calculateChecksum } from '../protocol/checksum.js';
import { log, setConnectionStatus, showAlert } from '../ui/logger.js';

export async function sendToModule({ idDestino, idPag, idOrigen, comando, data }) {
    try {
        if (!AppState.serialPort || !AppState.serialPort.writable) {
            log('❌ No hay puerto serial para enviar.');
            return;
        }
        if (!Array.isArray(data) || data.length !== 8) {
            log('❌ data debe ser array de 8 bytes');
            return;
        }

        if (idPag === 0x00) idPag = AppState.contadorUniversal++;

        const frame = [idDestino, 0x00, idPag, 0x00, idDestino, 0x00, idOrigen, 0x00, comando, ...data];
        frame.push(calculateChecksum(frame));
        frame.push(CMD.FRAME_END);

        const writer = AppState.serialPort.writable.getWriter();
        await writer.write(new Uint8Array(frame));
        writer.releaseLock();

        log('✅ Trama enviada:', frame.map(b => b.toString(16).padStart(2, '0')).join(' '));
    } catch (err) {
        console.error('❌ Error enviando trama:', err);
    }
}

export function stopSerialLoop() {
    if (AppState.serialInterval) {
        clearInterval(AppState.serialInterval);
        AppState.serialInterval = null;
        log('⏸ Serial loop detenido');
    }
}

export async function closeSerialConnection() {
    try {
        stopSerialLoop();

        if (AppState.serialReader) {
            await AppState.serialReader.cancel();
            try { AppState.serialReader.releaseLock(); } catch (e) { /* ignorado */ }
            AppState.serialReader = null;
        }

        if (AppState.serialPort) {
            await AppState.serialPort.close();
            AppState.serialPort = null;
        }

        log('🔌 Serial cerrado');

        const serialButton = document.getElementById('serialButton');
        if (serialButton) {
            serialButton.disabled    = false;
            serialButton.textContent = 'Conectar dispositivo';
        }

        setConnectionStatus('disconnected');
        showAlert({
            title: 'Conexión cerrada',
            text:  'Para reestablecerla, conectar el Buddy nuevamente.',
            icon:  'info',
            confirmButtonText: 'Aceptar'
        });

        AppState._hooks.resetAllStates?.();
        AppState._hooks.resetCharts?.();
    } catch (err) {
        console.error('❌ Error cerrando serial:', err);
    }
}
