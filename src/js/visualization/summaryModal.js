import { AppState } from '../state/appState.js';
import { pieData } from './chartManager.js';
import { fullFreqData, fullProfData, fullLabels, handPositionHistory } from './dataHandler.js';
import { downloadCSV, recordedData } from './csvExport.js';
import { hideWaitingCircle } from './overlay.js';
import { openPopup } from '../ui/popups.js';
import { setPhase } from '../ui/controls.js';
import { showAlert } from '../ui/logger.js';

const STATUS_COLORS = { success: '#16a34a', warning: '#d97706', error: '#dc2626' };

/* Cierra la maniobra y muestra el resumen. Es la única puerta de salida de una maniobra con datos.
   Botones del resumen:
     ↺ Nueva maniobra → limpia y arranca otra
     ⬇ Guardar CSV    → guarda SIN cerrar el resumen (el estado se muestra dentro del popup)
     ✕ Cerrar         → sólo cierra el popup; la conexión sigue y "Ver resumen" lo reabre */
export function saveCharts({ notice } = {}) {
    /* Sin datos no hay nada que resumir: se cancela la maniobra */
    if (recordedData.length === 0) {
        AppState._hooks.cancelManeuver?.({ notifyDevice: false });
        showAlert({ title: 'Maniobra cancelada', text: 'No se registraron datos.', icon: 'info', timer: 2500, showConfirmButton: false });
        return;
    }

    AppState.finishPopupShown = true;
    hideWaitingCircle();
    setPhase('finished');
    AppState._hooks.maneuverFinished?.();

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
    const noticeHtml = notice
        ? `<p style="margin-bottom:10px;padding:8px 12px;border-radius:8px;background:#fef3c7;color:#92400e;font-size:.85rem;">⚠️ ${notice}</p>`
        : '';

    openPopup('summary', {
        title: '📊 Resumen de la maniobra',
        html: `
            ${noticeHtml}
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
            <p id="csvStatus" style="margin-top:12px;min-height:1.3em;font-size:.88rem;font-weight:600;"></p>
        `,
        width: 820,
        allowOutsideClick: false,
        showConfirmButton: true,
        showDenyButton:    true,
        showCancelButton:  true,
        confirmButtonText: '↺ Nueva Maniobra',
        denyButtonText:    '⬇ Guardar CSV',
        cancelButtonText:  '✕ Cerrar',
        focusConfirm:      false,
        customClass: { confirmButton: 'swal-btn-confirm', denyButton: 'swal-btn-csv', cancelButton: 'swal-btn-close' },
        preDeny: async () => {
            const result = await downloadCSV();
            const status = document.getElementById('csvStatus');
            if (status) {
                status.textContent = result.message;
                status.style.color = STATUS_COLORS[result.status] || '#334155';
            }
            return false;   /* mantiene el resumen abierto */
        },
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
        },
        willClose: () => {
            previewCharts.forEach(c => c.destroy());
            previewCharts.length = 0;
        }
    }).then((result) => {
        if (result.isConfirmed) AppState._hooks.startManeuver?.();
    });
}
