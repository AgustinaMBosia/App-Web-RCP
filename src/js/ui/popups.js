/* Gestor de popups con precedencia.
   SweetAlert2 tiene una única instancia: cada Swal.fire() pisa al popup abierto.
   Acá se decide quién puede pisar a quién: un popup de menor prioridad nunca
   reemplaza a uno de mayor prioridad (p. ej. nada pisa al resumen de la maniobra). */

const PRIORITY = { info: 0, stopped: 1, alert: 2, hands: 2, summary: 3 };

let current  = null;   /* { kind, token, cleanup } */
let tokenSeq = 0;

const SKIPPED = { isConfirmed: false, isDenied: false, isDismissed: true, skipped: true };

export function openPopup(kind, options = {}) {
    if (!window.Swal) {
        console.warn('SweetAlert2 no encontrado — popup omitido:', options.title);
        return Promise.resolve(SKIPPED);
    }
    if (current && PRIORITY[current.kind] > PRIORITY[kind]) {
        return Promise.resolve(SKIPPED);
    }

    /* El popup que está por ser reemplazado no siempre dispara didClose: lo limpiamos a mano */
    if (current) current.cleanup();

    const token = ++tokenSeq;
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (current?.token === token) current = null;
        options.didClose?.();
    };

    current = { kind, token, cleanup };
    return Swal.fire({ ...options, didClose: cleanup });
}

/* Cierra el popup activo sólo si es del tipo indicado */
export function closePopup(kind) {
    if (current?.kind === kind && window.Swal) Swal.close();
}

export function isPopupOpen(kind) {
    return current?.kind === kind;
}
