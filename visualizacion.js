document.addEventListener('DOMContentLoaded', () => {
    const receivedDataElement = document.getElementById('receivedData');

    if (!receivedDataElement) {
        console.error('Elemento con ID "receivedData" no encontrado.');
        return;
    }

    function updateVisualization(data) {
        try {
            const parsedData = JSON.parse(data);
            const formattedData = `
                <strong>Datos Recibidos:</strong><br>
                Posición de la Mano: ${parsedData.handPosition || 'N/A'}<br>
                Profundidad: ${parsedData.profundidad || 'N/A'}<br>
                Frecuencia: ${parsedData.freq || 'N/A'}
            `;
            receivedDataElement.innerHTML = formattedData;
        } catch (error) {
            console.error('Error al procesar los datos:', error);
            receivedDataElement.innerHTML = 'Error al mostrar los datos.';
        }
    }

    setInterval(() => {
        const data = localStorage.getItem('realTimeData') || '{}';
        updateVisualization(data);
    }, 1000);
});
