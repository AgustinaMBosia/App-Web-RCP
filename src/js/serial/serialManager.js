import { AppState } from '../state/appState.js';
import { CMD } from '../protocol/constants.js';
import { calculateChecksum } from '../protocol/checksum.js';
import { log } from '../ui/logger.js';

/* Las escrituras se encolan: el writer del puerto sólo admite una escritura a la vez
   y, si falla sin liberar el lock, el puerto queda inutilizable. */
const MAX_PENDING_WRITES = 4;
let writeChain    = Promise.resolve();
let pendingWrites = 0;

async function writeFrame(port, frame) {
    if (!port?.writable) return;
    const writer = port.writable.getWriter();
    try {
        await writer.write(new Uint8Array(frame));
    } finally {
        writer.releaseLock();
    }
}

export function sendToModule({ idDestino, idPag, idOrigen, comando, data }) {
    const port = AppState.serialPort;
    if (!port || !port.writable) {
        log('❌ No hay puerto serial para enviar.');
        return Promise.resolve();
    }
    if (!Array.isArray(data) || data.length !== 8) {
        log('❌ data debe ser array de 8 bytes');
        return Promise.resolve();
    }
    if (pendingWrites >= MAX_PENDING_WRITES) {
        log('⚠️ Cola de escritura llena — trama descartada');
        return Promise.resolve();
    }

    if (idPag === 0x00) idPag = AppState.contadorUniversal++;

    const frame = [idDestino, 0x00, idPag, 0x00, idDestino, 0x00, idOrigen, 0x00, comando, ...data];
    frame.push(calculateChecksum(frame));
    frame.push(CMD.FRAME_END);

    pendingWrites++;
    writeChain = writeChain
        .then(() => writeFrame(port, frame))
        .then(() => log('✅ Trama enviada:', frame.map(b => b.toString(16).padStart(2, '0')).join(' ')))
        .catch(err => console.error('❌ Error enviando trama:', err))
        .finally(() => { pendingWrites--; });
    return writeChain;
}

export function stopSerialLoop() {
    if (AppState.serialInterval) {
        clearInterval(AppState.serialInterval);
        AppState.serialInterval = null;
        log('⏸ Serial loop detenido');
    }
}

/* Libera el puerto en orden (loop de lectura → lock del reader → puerto) y SIEMPRE deja
   el estado limpio aunque algún paso falle, para poder reconectar sin reiniciar nada.
   Idempotente y nunca lanza. */
export async function releaseSerialPort() {
    AppState.serialClosing = true;
    stopSerialLoop();

    const port        = AppState.serialPort;
    const reader      = AppState.serialReader;
    const readPromise = AppState.serialReadPromise;

    AppState.serialPort        = null;
    AppState.serialReader      = null;
    AppState.serialReadPromise = null;

    try { await reader?.cancel(); }          catch (e) { /* ignorado */ }
    try { await readPromise; }               catch (e) { /* ignorado */ }
    try { reader?.releaseLock(); }           catch (e) { /* ignorado */ }
    try { await Promise.race([writeChain, new Promise(r => setTimeout(r, 1000))]); } catch (e) { /* ignorado */ }
    try { await port?.close(); }             catch (e) { console.error('❌ Error cerrando puerto:', e); }

    AppState.serialClosing = false;
    log('🔌 Serial cerrado');
}
