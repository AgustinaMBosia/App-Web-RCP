let simulationInterval = null; // Variable global para controlar la simulación

const receivedDataElement = document.getElementById('receivedData');

// Redirigir a la página de visualización
function openVisualizationPage() {
    window.open('visualization.html', '_blank');
}

// Función para procesar y enviar datos al almacenamiento
function processData(data) {
    const regex = /\nU(OK|NOK),P(\d+),F(\d+):/;
    const match = data.match(regex);

    if (match) {
        const [_, handPosition, profundidad, freq] = match;

        receivedDataElement.textContent = `
            Posición de la Mano: ${handPosition}
            Profundidad: ${profundidad}
            Frecuencia: ${freq}
        `;
        
        const processedData = {
            handPosition,
            profundidad: parseInt(profundidad, 10),
            freq: parseInt(freq, 10),
        };

        // Guardar en localStorage y disparar evento
        localStorage.setItem('realTimeData', JSON.stringify(processedData));
        localStorage.setItem('updateTime', new Date().toISOString()); // Para disparar el evento

    } else {
        receivedDataElement.textContent = `
            Posición de la Mano: ${handPosition}
            Profundidad: ${profundidad}
            Frecuencia: ${freq}
        `;
        console.warn('Trama inválida o no procesada:', data);
    }
}

// Configuración de botones
document.getElementById('bluetoothButton').addEventListener('click', async () => {
    try {
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['device_information', 'battery_service'],
        });

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('device_information');
        const characteristic = await service.getCharacteristic('manufacturer_name_string');

        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const data = new TextDecoder().decode(event.target.value);
            processData(data);
        });

        await characteristic.startNotifications();
        alert('Conexión Bluetooth establecida. Abriendo visualización...');
        openVisualizationPage();
    } catch (error) {
        console.error('Error al conectar vía Bluetooth:', error);
        alert('No se pudo conectar al dispositivo Bluetooth.');
    }
});

document.getElementById('simulateButton').addEventListener('click', () => {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        alert('Simulación detenida.');
    } else {
        simulationInterval = setInterval(() => {
            const simulatedData = generateSimulatedData();
            processData(simulatedData);
        }, 1000); // Cada segundo
        alert('Simulación iniciada. Abriendo visualización...');
        openVisualizationPage();
    }
});

function generateSimulatedData() {
    const handPosition = Math.random() > 0.5 ? 'OK' : 'NOK';
    const profundidad = Math.floor(Math.random() * 100);
    const freq = Math.floor(Math.random() * 200) + 50;
    return `\nU${handPosition},P${profundidad},F${freq}:`;
}
