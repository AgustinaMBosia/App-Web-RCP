import { AppState } from '../state/appState.js';
import { freqData, profData, pieData, handPosData, profColors, handPosChart,
         FREQ_MIN, FREQ_MAX, PROF_MIN, PROF_MAX, CHART_WINDOW, updateCharts } from './chartManager.js';
import { updateBadge, updateHandPosBadge, updatePieBadge } from './badges.js';
import { showWaitingCircle, hideWaitingCircle } from './overlay.js';
import { recordedData } from './csvExport.js';

export const fullFreqData        = [];
export const fullProfData        = [];
export const fullLabels          = [];
export const handPositionHistory = [];

let correctExecutions   = 0;
let incorrectExecutions = 0;
let globalCounter       = 0;
let startTracking       = false;
let hasNonZeroFreq      = false;
let pastFreq            = 0;
let pastProf            = 0;
let contadorCeros       = 0;
let zeroAlertShown      = false;

export function resetVisualizationState() {
    globalCounter       = 0;
    correctExecutions   = 0;
    incorrectExecutions = 0;
    startTracking       = false;
    hasNonZeroFreq      = false;
    pastFreq = pastProf = contadorCeros = 0;
    zeroAlertShown      = false;
    handPositionHistory.length = 0;
    fullFreqData.length = fullProfData.length = fullLabels.length = 0;
}

function handleDataForVisualization(parsedData) {
    if (AppState.isPaused) return;

    let freq       = parsedData.freq        || 0;
    let prof       = parsedData.profundidad  || 0;
    const handPos  = parsedData.handPosition || 'N/A';
    const isHandOK = handPos === 'OK';

    if (isHandOK) startTracking = true;
    if (!startTracking) return;

    /* Esperar primera frecuencia válida */
    if (!hasNonZeroFreq && freq === 0) {
        showWaitingCircle();
        handPositionHistory.push(handPos);
        updateHandPosBadge(document.getElementById('handPosBadge'), handPos);
        handPosData.datasets[0].data = isHandOK ? [1, 0] : [0, 1];
        handPosChart.update('none');
        return;
    }

    if (freq > 0) {
        hideWaitingCircle();
        if (freq !== pastFreq && zeroAlertShown && window.Swal) { Swal.close(); zeroAlertShown = false; contadorCeros = 0; }
        hasNonZeroFreq = true;
    } else if (hasNonZeroFreq) {
        freq = pastFreq;
        prof = pastProf;
        contadorCeros++;
        if (!zeroAlertShown && contadorCeros === 3) {
            Swal.fire({ title: 'Maniobra detenida', text: 'Retome la maniobra para continuar.', icon: 'warning', confirmButtonText: 'Aceptar' });
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
    }

    freqData.labels.push(globalCounter);
    profData.labels.push(globalCounter);
    freqData.datasets[0].data.push(freq);
    profData.datasets[0].data.push(prof);
    profColors.push(
        isProfCorrect     ? 'rgba(22,163,74,.75)'
        : prof < PROF_MIN ? 'rgba(217,119,6,.75)'
                          : 'rgba(220,38,38,.75)'
    );

    fullLabels.push(globalCounter);
    fullFreqData.push(freq);
    fullProfData.push(prof);
    recordedData.push({ timestamp: new Date().toISOString(), frecuencia: freq, profundidad: prof, posicionMano: handPos });

    if (isFreqCorrect && isProfCorrect && isHandOK) correctExecutions++;
    else incorrectExecutions++;

    pieData.datasets[0].data     = [correctExecutions, incorrectExecutions];
    handPosData.datasets[0].data = isHandOK ? [1, 0] : [0, 1];

    pastFreq = freq;
    pastProf = prof;

    updateCharts();
}

export function updateVisualization(data) {
    try {
        handleDataForVisualization(typeof data === 'string' ? JSON.parse(data) : data);
    } catch (err) {
        console.error('Error al procesar datos:', err);
    }
}
