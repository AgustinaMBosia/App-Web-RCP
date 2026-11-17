/* Zoom de gráficos: doble clic (o doble toque) sobre una tarjeta la amplía al centro de la pantalla.
   Se cierra con otro doble clic, clic afuera, Esc o el botón ✕.
   Los gráficos de Chart.js son responsive: se redimensionan solos al cambiar el tamaño de la tarjeta
   y siguen recibiendo datos en vivo mientras están ampliados. */

const DOUBLE_TAP_MS = 300;

let zoomed      = null;   /* tarjeta ampliada */
let placeholder = null;   /* ocupa su lugar en la grilla para que el resto no se mueva */
let backdrop    = null;
let closeBtn    = null;

function open(card) {
    if (zoomed) return;
    zoomed = card;

    placeholder = document.createElement('div');
    placeholder.className = 'chart-zoom-placeholder';
    placeholder.style.height = card.offsetHeight + 'px';
    card.after(placeholder);

    backdrop = document.createElement('div');
    backdrop.className = 'chart-zoom-backdrop';
    backdrop.addEventListener('click', close);
    document.body.appendChild(backdrop);

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'chart-zoom-close';
    closeBtn.setAttribute('aria-label', 'Cerrar vista ampliada');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', close);
    card.appendChild(closeBtn);

    card.classList.add('is-zoomed');
    document.body.classList.add('has-chart-zoom');
    closeBtn.focus({ preventScroll: true });
}

function close() {
    if (!zoomed) return;
    zoomed.classList.remove('is-zoomed');
    document.body.classList.remove('has-chart-zoom');
    closeBtn?.remove();
    backdrop?.remove();
    placeholder?.remove();
    zoomed.focus({ preventScroll: true });
    zoomed = placeholder = backdrop = closeBtn = null;
}

function toggle(card) {
    if (zoomed === card) close();
    else if (!zoomed) open(card);
}

export function initChartZoom() {
    document.querySelectorAll('.chart-card').forEach((card) => {
        card.tabIndex = 0;
        card.title = 'Doble clic para ampliar';

        card.addEventListener('dblclick', (e) => {
            if (e.target.closest('.chart-zoom-close')) return;
            toggle(card);
        });

        /* Doble toque en pantallas táctiles (el dblclick no siempre se dispara en celulares) */
        let lastTap = 0;
        card.addEventListener('pointerup', (e) => {
            if (e.pointerType !== 'touch') return;
            const now = performance.now();
            if (now - lastTap < DOUBLE_TAP_MS) {
                e.preventDefault();
                toggle(card);
                lastTap = 0;
            } else {
                lastTap = now;
            }
        });

        /* Teclado: Enter amplía la tarjeta enfocada */
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target === card) toggle(card);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
}
