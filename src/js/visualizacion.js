import { AppState } from './state/appState.js';
import { resetVisualizationState } from './visualization/dataHandler.js';
import { resetChartData } from './visualization/chartManager.js';
import { resetCsvData } from './visualization/csvExport.js';
import { resetBadges } from './visualization/badges.js';
import { hideWaitingCircle } from './visualization/overlay.js';

export function resetCharts() {
    resetVisualizationState();
    resetChartData();
    resetCsvData();
    resetBadges();
    hideWaitingCircle();

    AppState.nextSession();
    AppState.finishPopupShown           = false;
    AppState.handsPopupShownThisSession = false;

    AppState._hooks.restartSerialLoop?.();
}
