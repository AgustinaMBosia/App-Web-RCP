import { AppState } from '../state/appState.js';
import { pieData } from './chartManager.js';
import { fullFreqData, fullProfData, fullLabels, handPositionHistory } from './dataHandler.js';
import { downloadCSV } from './csvExport.js';

export function saveCharts() {
    const correct    = pieData.datasets[0].data[0];
    const incorrect  = pieData.datasets[0].data[1];
    const total      = correct + incorrect;
    const percentage = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;

    const handOKCount  = handPositionHistory.filter(p => p === 'OK').length;
    const handNOKCount = handPositionHistory.length - handOKCount;
    const handSummary  = {
        labels:   ['Manos OK', 'No OK'],
        datasets: [{ data: [handOKCount, handNOKCount], backgroundColor: ['#16a34a', '#dc2626'], borderWidth: 0 }]
    };

    const previewCharts = [];

    Swal.fire({
        title: '📊 Resumen de la maniobra',
        html: `
            <p style="margin-bottom:12px;font-size:.9rem;">
                Ejecuciones correctas: <strong style="color:#16a34a;font-size:1.1rem">${percentage}%</strong>
                &nbsp;·&nbsp; Total: <strong>${total}</strong> compresiones
            </p>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
                <div><canvas id="piePreview"     width="200" height="180"></canvas></div>
                <div><canvas id="handPosPreview" width="200" height="180"></canvas></div>
                <div><canvas id="freqPreview"    width="300" height="150"></canvas></div>
                <div><canvas id="profPreview"    width="300" height="150"></canvas></div>
            </div>
        `,
        width: 820,
        showConfirmButton: true,
        showDenyButton:    true,
        showCancelButton:  true,
        confirmButtonText: '↺ Nueva Maniobra',
        denyButtonText:    '✕ Cerrar',
        cancelButtonText:  '⬇ Guardar CSV',
        customClass: { confirmButton: 'swal-btn-confirm', denyButton: 'swal-btn-deny', cancelButton: 'swal-btn-csv' },
        didOpen: () => {
            previewCharts.push(
                new Chart(document.getElementById('piePreview').getContext('2d'), {
                    type: 'pie', data: pieData, options: { responsive: false }
                }),
                new Chart(document.getElementById('handPosPreview').getContext('2d'), {
                    type: 'pie', data: handSummary, options: { responsive: false }
                }),
                new Chart(document.getElementById('freqPreview').getContext('2d'), {
                    type: 'line',
                    data: { labels: fullLabels, datasets: [{ label: 'Frecuencia', data: fullFreqData, borderColor: '#1d4ed8', fill: false, tension: 0.3 }] },
                    options: { responsive: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                }),
                new Chart(document.getElementById('profPreview').getContext('2d'), {
                    type: 'bar',
                    data: { labels: fullLabels, datasets: [{ label: 'Profundidad', data: fullProfData, backgroundColor: 'rgba(8,145,178,.5)' }] },
                    options: { responsive: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                })
            );

            const cancelBtn = document.querySelector('.swal2-cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); downloadCSV(); });
        },
        willClose: () => {
            previewCharts.forEach(c => c.destroy());
            previewCharts.length = 0;
        }
    }).then((result) => {
        if (result.isConfirmed) {
            AppState._hooks.resetCharts?.();
        } else if (result.isDenied) {
            AppState._hooks.closeSerialConnection?.();
        }
    });
}
