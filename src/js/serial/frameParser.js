import { AppState } from '../state/appState.js';
import { CMD } from '../protocol/constants.js';
import { calculateChecksum } from '../protocol/checksum.js';
import { log } from '../ui/logger.js';

export function startSerialReadLoop() {
    if (!AppState.serialReader) return;

    (async () => {
        try {
            const buffer = [];
            while (AppState.serialPort && AppState.serialReader) {
                const { value, done } = await AppState.serialReader.read();
                if (done) break;
                if (!value) continue;

                for (let i = 0; i < value.length; i++) {
                    const byte = value[i];

                    if (byte === CMD.FRAME_END) {
                        if (buffer.length === 18) {
                            const packet   = new Uint8Array(buffer);
                            const checksum = packet[17];
                            const calc     = calculateChecksum(packet.slice(0, 17));

                            if (checksum === calc) {
                                AppState.comando      = packet[8];
                                AppState.data         = Array.from(packet.slice(9, 17));
                                AppState.idPag        = packet[2];
                                AppState.idOrigen     = packet[6];
                                AppState.idDestino    = packet[0];
                                AppState.sendDataFlag = packet[14];
                                log('📥 Trama válida, comando=0x' + AppState.comando.toString(16));
                            } else {
                                log('⚠️ Checksum inválido — recibido:', checksum, 'calculado:', calc);
                            }
                        } else {
                            log('⚠️ Longitud inesperada:', buffer.length);
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
                if (AppState.serialReader) {
                    await AppState.serialReader.releaseLock();
                    AppState.serialReader = null;
                }
            } catch (e) { /* ignorado */ }
        }
    })();
}
