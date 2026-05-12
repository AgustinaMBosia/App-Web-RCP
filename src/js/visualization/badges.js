/* Badges de valor — funciones puras de UI, sin estado mutable */

const BADGE_COLORS = {
    green:  'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    orange: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
    red:    'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)',
    purple: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
};

function setBadgeColor(badge, color) {
    if (badge) badge.style.background = BADGE_COLORS[color] || BADGE_COLORS.purple;
}

function animateBadge(badge) {
    if (!badge) return;
    badge.style.transform = 'scale(1.08)';
    setTimeout(() => { badge.style.transform = 'scale(1)'; }, 150);
}

export function updateBadge(badge, value, unit, isCorrect, idealMin) {
    if (!badge) return;
    badge.innerHTML = `<span>${value} ${unit}</span>`;
    if      (isCorrect === true)  setBadgeColor(badge, 'green');
    else if (isCorrect === false) setBadgeColor(badge, value < idealMin ? 'orange' : 'red');
    else                          setBadgeColor(badge, 'purple');
    animateBadge(badge);
}

export function updateHandPosBadge(badge, handPos) {
    if (!badge) return;
    badge.innerHTML = `<span>${handPos === 'OK' ? '✓ OK' : '✗ NOK'}</span>`;
    setBadgeColor(badge, handPos === 'OK' ? 'green' : 'red');
}

export function updatePieBadge(badge, correct, incorrect) {
    if (!badge) return;
    const total      = correct + incorrect;
    const percentage = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;
    badge.innerHTML  = `<span>${percentage}%</span>`;
    setBadgeColor(badge, percentage >= 80 ? 'green' : percentage >= 50 ? 'orange' : 'red');
    animateBadge(badge);
}

export function resetBadges() {
    ['freqBadge', 'profBadge', 'handPosBadge'].forEach(id => {
        const b = document.getElementById(id);
        if (!b) return;
        b.innerHTML = '<span>--</span>';
        setBadgeColor(b, 'purple');
        b.style.transform = '';
    });
    const pieBadge = document.getElementById('pieBadge');
    if (pieBadge) {
        pieBadge.innerHTML = '<span>--%</span>';
        setBadgeColor(pieBadge, 'purple');
        pieBadge.style.transform = '';
    }
}
