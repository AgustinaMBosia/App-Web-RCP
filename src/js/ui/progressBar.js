import { PROGRESS_DURATION } from '../protocol/constants.js';

let progressInterval = null;
let progressSeconds  = 0;

export function startProgressBar() {
    const container = document.getElementById('progressContainer');
    const bar       = document.getElementById('progressBar');
    const label     = document.getElementById('progressLabel');

    if (!container || !bar || progressInterval) return;

    progressSeconds      = 0;
    bar.style.width      = '0%';
    bar.style.background = 'linear-gradient(90deg, #4caf50, #ff9800)';
    if (label) label.textContent = `0s / ${PROGRESS_DURATION}s`;
    container.classList.add('is-visible');

    progressInterval = setInterval(() => {
        progressSeconds++;
        const pct = Math.min((progressSeconds / PROGRESS_DURATION) * 100, 100);
        bar.style.width = pct + '%';
        if (label) label.textContent = `${progressSeconds}s / ${PROGRESS_DURATION}s`;

        if (progressSeconds >= 50) {
            bar.style.background = 'linear-gradient(90deg, #ff9800, #f44336)';
        }
        if (progressSeconds >= PROGRESS_DURATION) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
    }, 1000);
}

export function stopProgressBar() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    const container = document.getElementById('progressContainer');
    if (container) container.classList.remove('is-visible');
}
