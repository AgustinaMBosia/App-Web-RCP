const receivedDataElement = document.getElementById('receivedData');

// función para procesar y mostrar la trama recibida
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
    } else {
        receivedDataElement.textContent = 'Trama inválida o no procesada correctamente.';
    }
}

// conexión bluetooth   HACER QUE PROCESE LA DATA CADA UN SEGUNDO
document.getElementById('bluetoothButton').addEventListener('click', async () => {
    try {
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['device_information', 'battery_service']
        });

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('device_information');
        const characteristic = await service.getCharacteristic('manufacturer_name_string');

        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const data = new TextDecoder().decode(event.target.value);
            console.log('Trama recibida (Bluetooth):', data);
            processData(data);
        });

        await characteristic.startNotifications();
        alert('Conexión Bluetooth establecida. Esperando datos...');
    } catch (error) {
        console.error('Error al conectar vía Bluetooth:', error);
        alert('No se pudo conectar al dispositivo Bluetooth.');
    }
});

// conexión serial   HACER QUE PROCESE LA DATA CADA UN SEGUNDO
document.getElementById('serialButton').addEventListener('click', async () => {
    try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });

        const decoder = new TextDecoderStream();
        const readableStreamClosed = port.readable.pipeTo(decoder.writable);
        const reader = decoder.readable.getReader();

        alert('Conexión Serial establecida. Esperando datos...');

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.log('Puerto serial cerrado.');
                break;
            }

            console.log('Trama recibida (Serial):', value);
            processData(value);
        }
    } catch (error) {
        console.error('Error al conectar al puerto serial:', error);
        alert('No se pudo conectar al puerto serial.');
    }
});

let simulationInterval = null;// definimos globalmente la variable

// simulación continua de tramas cada 1 seg
document.getElementById('simulateButton').addEventListener('click', () => {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        alert('Simulación detenida.');
    } else {
        simulationInterval = setInterval(() => {
            const simulatedData = generateSimulatedData();
            console.log('Trama simulada recibida:', simulatedData);
            processData(simulatedData);
        }, 1000); // 1000 ms = 1 segundo
        alert('Simulación iniciada. Enviando datos cada 1 segundo.');
    }
});

// generar datos simulados
function generateSimulatedData() {
    const handPosition = Math.random() > 0.5 ? 'OK' : 'NOK';
    const profundidad = Math.floor(Math.random() * 100); // Entre 0 y 99   CHEQUEAR SI ESTA BIEN (ambe due)
    const freq = Math.floor(Math.random() * 200) + 50; // Entre 50 y 249
    return `\nU${handPosition},P${profundidad},F${freq}:`;
}
