/* csvExport — exportación de datos a archivo CSV */

const MAX_CSV_FILES = 100;

export const recordedData = [];
let savedFiles     = [];
let savedDirHandle = null;

export function resetCsvData() {
    recordedData.length = 0;
}

export async function downloadCSV() {
    if (recordedData.length === 0) return;

    const header = 'Timestamp,Frecuencia,Profundidad,PosicionMano\n';
    const rows   = recordedData.map(r => `${r.timestamp},${r.frecuencia},${r.profundidad},${r.posicionMano}`);
    const blob   = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });

    try {
        if (!savedDirHandle) savedDirHandle = await window.showDirectoryPicker();

        if (savedFiles.length >= MAX_CSV_FILES) {
            savedFiles.sort((a, b) => a.date - b.date);
            const oldest = savedFiles.shift();
            try { await savedDirHandle.removeEntry(oldest.name); } catch (e) { /* ignorado */ }
        }

        const fileName   = `maniobra_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        const fileHandle = await savedDirHandle.getFileHandle(fileName, { create: true });
        const writable   = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        savedFiles.push({ name: fileName, date: new Date() });
        Swal.fire({ title: '✅ CSV guardado', icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (err) {
        console.error('❌ Error guardando CSV:', err);
        if (err.name === 'AbortError') return;
        if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
            savedDirHandle = null;
            Swal.fire({ title: 'Permiso denegado', text: 'Seleccioná la carpeta nuevamente.', icon: 'warning', confirmButtonText: 'Aceptar' });
        } else {
            Swal.fire({ title: 'Error', text: 'No se pudo guardar el CSV.', icon: 'error', confirmButtonText: 'Aceptar' });
        }
    }
}
