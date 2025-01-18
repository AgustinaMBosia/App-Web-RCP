
document.addEventListener('DOMContentLoaded', () => {
    const receivedDataElement = document.getElementById('receivedData');

    if (!receivedDataElement) {
        console.error('Elemento con ID "receivedData" no encontrado.');
        return;
    }

    function updateVisualization(data) {
        try {
            const parsedData = JSON.parse(data);
            receivedDataElement.textContent = `Datos Recibidos: ${parsedData}`;
        } catch (error) {
            console.error('Error al procesar los datos:', error);
            receivedDataElement.innerHTML = 'Error al mostrar los datos.';
        }
    }

    // Simulación de lectura del localStorage
    setInterval(() => {
        const data = localStorage.getItem('dataKey') || '{}';
        updateVisualization(data);
    }, 1000);
});
