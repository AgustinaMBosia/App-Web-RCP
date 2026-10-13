/* Estado visible de los controles.

   Fases de la app (AppState.phase):
     disconnected → sin dispositivo
     ready        → dispositivo conectado y escuchando; pasa a running con la primera trama
     running      → maniobra en curso (desde "Iniciar" hasta "Terminar")
     finished     → maniobra terminada, datos disponibles para ver/guardar

   Los botones se habilitan según la fase, así el usuario sólo ve acciones válidas:
     Iniciar maniobra → ready / finished (con dispositivo conectado)
     Terminar maniobra → running   (en finished pasa a "Ver resumen")                */

import { AppState } from '../state/appState.js';
import { setConnectionStatus } from './logger.js';

const byId = (id) => document.getElementById(id);

export function setButtonLabel(btn, text) {
    const label = btn?.querySelector('.btn-label');
    if (label) label.textContent = text;
    else if (btn) btn.textContent = text;
}

export function setPhase(phase) {
    AppState.phase = phase;
    renderControls();
}

/* Vuelve a "sin maniobra": ready si hay dispositivo, disconnected si no */
export function setIdle() {
    setPhase(AppState.serialPort ? 'ready' : 'disconnected');
}

const PHASE_HINTS = {
    disconnected: 'Conectá el maniquí para empezar, o usá "Simular" para practicar con datos de prueba.',
    ready:        'Maniquí conectado. Colocá las manos en el centro del pecho y comenzá las compresiones.',
    running:      'Maniobra en curso. Seguí las indicaciones de cada lectura.',
    finished:     'Maniobra terminada. Revisá el resumen o iniciá una nueva.',
};

export function renderControls() {
    const hint = byId('phaseHint');
    if (hint) hint.textContent = PHASE_HINTS[AppState.phase] ?? '';

    const start     = byId('startButton');
    const finish    = byId('saveButton');
    const phase     = AppState.phase;
    const connected = !!AppState.serialPort;

    if (start) {
        start.disabled = !(connected && (phase === 'ready' || phase === 'finished'));
        start.title = !connected            ? 'Conectá el dispositivo para iniciar una maniobra'
                    : phase === 'running'   ? 'Hay una maniobra en curso: terminala primero'
                    : 'Comienza una nueva maniobra';
    }

    if (finish) {
        finish.disabled = !(phase === 'running' || phase === 'finished');
        setButtonLabel(finish, phase === 'finished' ? 'Ver resumen' : 'Terminar maniobra');
        finish.title = phase === 'running'  ? 'Termina la maniobra y muestra el resumen'
                     : phase === 'finished' ? 'Vuelve a abrir el resumen de la última maniobra'
                     : 'No hay una maniobra en curso';
    }
}

/* state: 'disconnected' | 'connecting' | 'connected' */
export function setConnection(state) {
    setConnectionStatus(state);

    const btn = byId('serialButton');
    if (btn) {
        btn.disabled = state === 'connecting';
        btn.classList.toggle('btn--primary', state !== 'connected');
        btn.classList.toggle('btn--ghost',   state === 'connected');
        setButtonLabel(btn, { disconnected: 'Conectar dispositivo', connecting: 'Conectando…', connected: 'Desconectar' }[state]);
    }
    renderControls();
}
