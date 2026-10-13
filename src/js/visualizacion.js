import { resetVisualizationState } from './visualization/dataHandler.js';
import { resetChartData } from './visualization/chartManager.js';
import { resetCsvData } from './visualization/csvExport.js';
import { resetBadges } from './visualization/badges.js';
import { hideWaitingCircle } from './visualization/overlay.js';

/* Borra todo lo visible y registrado de la maniobra anterior (gráficos, badges, CSV, overlay) */
export function clearManeuverData() {
    resetVisualizationState();
    resetChartData();
    resetCsvData();
    resetBadges();
    hideWaitingCircle();
}
