import { AppState } from '../state/appState.js';

export const FREQ_MIN    = 100;
export const FREQ_MAX    = 120;
export const PROF_MIN    = 50;
export const PROF_MAX    = 60;
export const CHART_WINDOW = 7;

/* Descompresión: profundidad residual (mm) que queda antes de la siguiente compresión.
   Por debajo de este valor se considera completa. Valor provisorio, a definir con la profesora. */
export const DESC_MAX = 5;

/* Array de colores de barras — mutado por dataHandler.js en cada tick */
export const profColors = [];

/* Descompresión (mm) de cada barra visible, alineada con profData — mutado por dataHandler.js */
export const profDesc = [];

/* Datasets — referencias compartidas con dataHandler.js */
export const freqData = {
    labels:   [],
    datasets: [{ label: 'Frecuencia (cpm)', data: [], borderColor: '#1d4ed8', backgroundColor: 'rgba(29,78,216,.08)', fill: true, tension: 0.3, pointRadius: 3 }]
};

export const profData = {
    labels:   [],
    datasets: [{ label: 'Profundidad (mm)', data: [], backgroundColor: profColors }]
};

export const profBarColor = (prof) =>
      prof >= PROF_MIN && prof <= PROF_MAX ? 'rgba(22,163,74,.75)'
    : prof < PROF_MIN                     ? 'rgba(217,119,6,.75)'
                                          : 'rgba(220,38,38,.75)';

export const pieData = {
    labels:   ['Ejecución Correcta', 'Incorrecta'],
    datasets: [{ data: [0, 0], backgroundColor: ['#16a34a', '#dc2626'], borderWidth: 0 }]
};

export const handPosData = {
    labels:   ['Manos OK', 'No OK'],
    datasets: [{ data: [1, 0], backgroundColor: ['#16a34a', '#dc2626'], borderWidth: 0 }]
};

const rangePlugin = {
    id: 'rangePlugin',
    beforeDraw(chart) {
        const { ctx, scales: { y }, chartArea } = chart;
        const ranges = { freqChart: [FREQ_MIN, FREQ_MAX], profChart: [PROF_MIN, PROF_MAX] };
        const range  = ranges[chart.canvas.id];
        if (!range) return;
        const yPxMin = y.getPixelForValue(range[0]);
        const yPxMax = y.getPixelForValue(range[1]);
        ctx.fillStyle = 'rgba(22, 163, 74, 0.12)';
        ctx.fillRect(chartArea.left, yPxMax, chartArea.width, yPxMin - yPxMax);
    }
};

/* Instancias — null hasta que DOMContentLoaded las inicializa */
export let freqChart    = null;
export let profChart    = null;
export let pieChart     = null;
export let handPosChart = null;

const CHART_DEFAULTS = { responsive: true, maintainAspectRatio: false };

document.addEventListener('DOMContentLoaded', () => {
    const freqCtx    = document.getElementById('freqChart')?.getContext('2d');
    const profCtx    = document.getElementById('profChart')?.getContext('2d');
    const pieCtx     = document.getElementById('pieChart')?.getContext('2d');
    const handPosCtx = document.getElementById('handPosChart')?.getContext('2d');

    if (!freqCtx || !profCtx || !pieCtx || !handPosCtx) return;

    freqChart = new Chart(freqCtx, {
        type: 'line',
        data: freqData,
        options: {
            ...CHART_DEFAULTS,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 11 } } },
                y: { min: 80, max: 140, grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 11 } } }
            }
        },
        plugins: [rangePlugin]
    });

    profChart = new Chart(profCtx, {
        type: 'bar',
        data: profData,
        options: {
            ...CHART_DEFAULTS,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const desc = profDesc[ctx.dataIndex];
                            return [`Profundidad: ${ctx.raw} mm`,
                                    `Descompresión: ${desc} mm (${desc <= DESC_MAX ? 'completa' : 'incompleta'})`];
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                y: { min: 30, max: 70, reverse: true, grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 11 } } }
            }
        },
        plugins: [rangePlugin]
    });

    pieChart = new Chart(pieCtx, {
        type: 'pie',
        data: pieData,
        options: {
            ...CHART_DEFAULTS,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } } }
        }
    });

    handPosChart = new Chart(handPosCtx, {
        type: 'doughnut',
        data: handPosData,
        options: {
            ...CHART_DEFAULTS,
            animation: false,
            plugins: { legend: { display: false } },
            hover:  { mode: null },
            events: [],
            cutout: '65%'
        }
    });
});

export function updateCharts() {
    if (AppState.isPaused) return;
    freqChart?.update('none');
    profChart?.update('none');
    pieChart?.update('none');
    handPosChart?.update('none');
}

export function resetChartData() {
    freqData.labels = []; freqData.datasets[0].data = [];
    profData.labels = []; profData.datasets[0].data = [];
    profColors.length = 0;
    profDesc.length = 0;
    pieData.datasets[0].data     = [0, 0];
    handPosData.datasets[0].data = [1, 0];
    updateCharts();
}
