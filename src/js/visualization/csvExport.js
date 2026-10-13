/* csvExport — exportación de datos a archivo CSV */

const MAX_CSV_FILES = 100;

export const recordedData = [];
let savedFiles     = [];
let savedDirHandle = null;

export function resetCsvData() {
    recordedData.length = 0;
}

/* Descarga clásica para navegadores sin File System Access API */
function fallbackDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* No muestra popups (el resumen sigue abierto): devuelve { status: 'success'|'warning'|'error', message } */
export async function downloadCSV() {
    if (recordedData.length === 0) return { status: 'warning', message: 'No hay datos para guardar.' };

    const header   = 'Timestamp,Frecuencia,Profundidad,PosicionMano\n';
    const rows     = recordedData.map(r => `${r.timestamp},${r.frecuencia},${r.profundidad},${r.posicionMano}`);
    const blob     = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const fileName = `maniobra_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;

    try {
        if (!window.showDirectoryPicker) {
            fallbackDownload(blob, fileName);
            return { status: 'success', message: `✅ CSV descargado (${fileName})` };
        }

        if (!savedDirHandle) savedDirHandle = await window.showDirectoryPicker();

        if (savedFiles.length >= MAX_CSV_FILES) {
            savedFiles.sort((a, b) => a.date - b.date);
            const oldest = savedFiles.shift();
            try { await savedDirHandle.removeEntry(oldest.name); } catch (e) { /* ignorado */ }
        }

        const fileHandle = await savedDirHandle.getFileHandle(fileName, { create: true });
        const writable   = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        savedFiles.push({ name: fileName, date: new Date() });
        return { status: 'success', message: `✅ CSV guardado (${fileName})` };
    } catch (err) {
        console.error('❌ Error guardando CSV:', err);
        if (err.name === 'AbortError') return { status: 'warning', message: 'Guardado cancelado.' };
        if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
            savedDirHandle = null;
            return { status: 'warning', message: 'Permiso denegado. Volvé a presionar "Guardar CSV" y elegí la carpeta.' };
        }
        return { status: 'error', message: 'No se pudo guardar el CSV.' };
    }
}
