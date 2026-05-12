/* Overlay de espera — sin estado propio, lee el DOM al llamar */

export function showWaitingCircle() {
    const el = document.getElementById('waitingCircle');
    if (el) el.classList.add('is-visible');
}

export function hideWaitingCircle() {
    const el = document.getElementById('waitingCircle');
    if (el) el.classList.remove('is-visible');
}
