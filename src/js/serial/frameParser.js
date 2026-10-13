import { AppState } from '../state/appState.js';
import { CMD } from '../protocol/constants.js';
import { calculateChecksum } from '../protocol/checksum.js';
import { log } from '../ui/logger.js';

/* Lee del reader actual (AppState.serialReader). Trabaja siempre con su propio `reader` y `port`
   locales: un loop viejo nunca toca el reader de una conexión nueva. Si la lectura termina sin que
   la app haya pedido cerrar (dispositivo apagado / desenchufado), avisa con el hook connectionLost. */
export function startSerialReadLoop() {
    const reader = AppState.serialReader;
    const port   = AppState.serialPort;
    if (!reader) return;

    AppState.serialReadPromise = (async () => {
        let lost = false;
        try {
            const buffer = [];
            let lastFrameTs = null;   /* medición: tiempo entre tramas válidas del muñeco */
            while (true) {
                const { value, done } = await reader.read();
                if (done) { lost = true; break; }
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

                                const now = performance.now();
                                if (lastFrameTs !== null) {
                                    console.log(`🟠 Serial trama — intervalo real: ${(now - lastFrameTs).toFixed(0)} ms (comando 0x${AppState.comando.toString(16)})`);
                                }
                                lastFrameTs = now;
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
            lost = true;
            console.error('❌ Error en read loop:', err);
        } finally {
            try { reader.releaseLock(); } catch (e) { /* ignorado */ }
        }

        /* Sólo cuenta como pérdida si seguimos en la misma conexión y no la cerramos nosotros */
        if (lost && !AppState.serialClosing && AppState.serialPort === port) {
            AppState._hooks.connectionLost?.();
        }
    })();
}
