import { AppState } from '../state/appState.js';
import { freqData, profData, pieData, handPosData, profColors, profDesc, profBarColor, handPosChart,
         FREQ_MIN, FREQ_MAX, PROF_MIN, PROF_MAX, DESC_MAX, CHART_WINDOW, updateCharts } from './chartManager.js';
import { updateBadge, updateHandPosBadge, updatePieBadge, updateCprGauge } from './badges.js';
import { showWaitingCircle, hideWaitingCircle } from './overlay.js';
import { recordedData } from './csvExport.js';
import { openPopup, closePopup } from '../ui/popups.js';
import { setPhase } from '../ui/controls.js';

/* El cartel "Calculando frecuencia" se muestra al menos este tiempo, para que siempre sea visible
   (y para descartar tramas viejas que el dispositivo pueda enviar justo al arrancar). */
const MIN_WAITING_MS = 1000;

export const fullFreqData        = [];
export const fullProfData        = [];
export const fullDescData        = [];
export const fullLabels          = [];
export const handPositionHistory = [];

let correctExecutions   = 0;
let incorrectExecutions = 0;
let globalCounter       = 0;
let startTracking       = false;
let hasNonZeroFreq      = false;
let pastFreq            = 0;
let pastProf            = 0;
let pastDesc            = 0;
let contadorCeros       = 0;
let zeroAlertShown      = false;
let trackingStartedAt   = 0;

export function resetVisualizationState() {
    globalCounter       = 0;
    correctExecutions   = 0;
    incorrectExecutions = 0;
    startTracking       = false;
    hasNonZeroFreq      = false;
    pastFreq = pastProf = pastDesc = contadorCeros = 0;
    zeroAlertShown      = false;
    trackingStartedAt   = 0;
    handPositionHistory.length = 0;
    fullFreqData.length = fullProfData.length = fullDescData.length = fullLabels.length = 0;
}

function handleDataForVisualization(parsedData) {
    if (AppState.isPaused) return;

    /* Conectado y escuchando: la primera trama del dispositivo da comienzo a la maniobra */
    if (AppState.phase === 'ready' && AppState.serialInterval) setPhase('running');
    if (AppState.phase !== 'running') return;

    let freq       = parsedData.freq        || 0;
    let prof       = parsedData.profundidad  || 0;
    /* mm residuales (0 = descompresión completa). null si el dispositivo no la manda (trama vieja) */
    let desc       = Number.isFinite(parsedData.descompresion) ? parsedData.descompresion : null;
    const handPos  = parsedData.handPosition || 'N/A';
    const isHandOK = handPos === 'OK';

    if (isHandOK) startTracking = true;
    if (!startTracking) return;
    if (!trackingStartedAt) trackingStartedAt = performance.now();

    /* Esperar primera frecuencia válida */
    const waitedEnough = performance.now() - trackingStartedAt >= MIN_WAITING_MS;
    if (!hasNonZeroFreq && (freq === 0 || !waitedEnough)) {
        showWaitingCircle();
        handPositionHistory.push(handPos);
        updateHandPosBadge(document.getElementById('handPosBadge'), handPos);
        handPosData.datasets[0].data = isHandOK ? [1, 0] : [0, 1];
        handPosChart.update('none');
        return;
    }

    if (freq > 0) {
        hideWaitingCircle();
        if (freq !== pastFreq && zeroAlertShown) { closePopup('stopped'); zeroAlertShown = false; contadorCeros = 0; }
        hasNonZeroFreq = true;
    } else if (hasNonZeroFreq) {
        freq = pastFreq;
        prof = pastProf;
        desc = pastDesc;
        contadorCeros++;
        if (!zeroAlertShown && contadorCeros === 3) {
            openPopup('stopped', { title: 'Maniobra detenida', text: 'Retome la maniobra para continuar.', icon: 'warning', confirmButtonText: 'Aceptar' });
            zeroAlertShown = true;
            return;
        }
    } else {
        contadorCeros = 0;
    }

    globalCounter++;

    const isFreqCorrect = freq >= FREQ_MIN && freq <= FREQ_MAX;
    const isProfCorrect = prof >= PROF_MIN && prof <= PROF_MAX;
    handPositionHistory.push(handPos);

    updateBadge(document.getElementById('freqBadge'),    freq, 'cpm', isFreqCorrect, FREQ_MIN);
    updateBadge(document.getElementById('profBadge'),    prof, 'mm',  isProfCorrect, PROF_MIN);
    updatePieBadge(document.getElementById('pieBadge'), correctExecutions, incorrectExecutions);
    updateHandPosBadge(document.getElementById('handPosBadge'), handPos);

    /* Ventana deslizante */
    if (freqData.labels.length >= CHART_WINDOW) {
        freqData.labels.shift(); freqData.datasets[0].data.shift();
        profData.labels.shift(); profData.datasets[0].data.shift();
        profColors.shift();
        profDesc.shift();
    }

    freqData.labels.push(globalCounter);
    profData.labels.push(globalCounter);
    freqData.datasets[0].data.push(freq);
    profData.datasets[0].data.push(prof);
    profDesc.push(desc);
    profColors.push(profBarColor(prof));
    updateCprGauge(prof, desc, DESC_MAX, profBarColor(prof));

    fullLabels.push(globalCounter);
    fullFreqData.push(freq);
    fullProfData.push(prof);
    fullDescData.push(desc);
    recordedData.push({ timestamp: new Date().toISOString(), frecuencia: freq, profundidad: prof, descompresion: desc, posicionMano: handPos });

    if (isFreqCorrect && isProfCorrect && isHandOK) correctExecutions++;
    else incorrectExecutions++;

    pieData.datasets[0].data     = [correctExecutions, incorrectExecutions];
    handPosData.datasets[0].data = isHandOK ? [1, 0] : [0, 1];

    pastFreq = freq;
    pastProf = prof;
    pastDesc = desc;

    updateCharts();
}

export function updateVisualization(data) {
    try {
        handleDataForVisualization(typeof data === 'string' ? JSON.parse(data) : data);
    } catch (err) {
        console.error('Error al procesar datos:', err);
    }
}
