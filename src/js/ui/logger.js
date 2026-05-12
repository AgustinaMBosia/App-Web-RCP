const DEBUG = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

export function log(...args) {
    if (DEBUG) console.log(...args);
}

export function setConnectionStatus(state) {
    const chip = document.getElementById('connectionStatus');
    const text = document.getElementById('connectionStatusText');
    if (!chip || !text) return;
    chip.className   = `status-chip status--${state}`;
    text.textContent = { disconnected: 'Sin conexión', connecting: 'Conectando…', connected: 'Conectado' }[state] ?? 'Sin conexión';
}

export function showAlert(options) {
    if (window.Swal) return Swal.fire(options);
    alert(options.title + (options.text ? '\n' + options.text : ''));
    return Promise.resolve({ isConfirmed: true });
}
