let simulationInterval = null; 
let bluetoothInterval = null;
let serialInterval = null;

let lastBluetoothData = null;
let lastSerialData = null;

const receivedDataElement = document.getElementById('receivedData');

function openVisualizationPage() {
    window.open('visualization.html', '_blank');
}

//  PROCESAR DATOS
function processData(data) {
    const regex = /\nU(OK|NOK),P(\d+),F(\d+):/;
    const match = data.match(regex);

    if (match) {
        const [_, handPosition, profundidad, freq] = match;
        
        const processedData = {
            handPosition,
            profundidad: parseInt(profundidad, 10),
            freq: parseInt(freq, 10),
        };

        localStorage.setItem('realTimeData', JSON.stringify(processedData));
        localStorage.setItem('updateTime', new Date().toISOString());
    } else {
        console.warn('Trama inválida o no procesada:', data);
    }
}

//  CONEXIÓN BLUETOOTH
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
            lastBluetoothData = new TextDecoder().decode(event.target.value);
        });

        await characteristic.startNotifications();
        alert('Conexión Bluetooth establecida.');

        // Intervalo para actualizar datos Bluetooth
        bluetoothInterval = setInterval(() => {
            if (lastBluetoothData) {
                processData(lastBluetoothData);
                lastBluetoothData = null;
            }
        }, 1000);
        
        openVisualizationPage();
    } catch (error) {
        console.error('Error al conectar vía Bluetooth:', error);
        alert('No se pudo conectar al dispositivo Bluetooth.');
    }
});

document.getElementById('serialButton').addEventListener('click', async () => {
    try {
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 9600 });

        serialReader = serialPort.readable.getReader();

        async function readSerialData() {
            while (serialPort && serialReader) {
                const { value, done } = await serialReader.read();
                if (done) break;
                lastSerialData = new TextDecoder().decode(value);
            }
        }

        readSerialData();

        // Intervalo para actualizar datos Serial
        serialInterval = setInterval(() => {
            if (lastSerialData) {
                processData(lastSerialData);
                lastSerialData = null;
            }
        }, 1000);
        
        alert('Conexión Serial establecida.');
        openVisualizationPage();
    } catch (error) {
        console.error('Error en conexión Serial:', error);
        alert('No se pudo conectar al dispositivo Serial.');
    }
});

// SIMULACIÓN
document.getElementById('simulateButton').addEventListener('click', () => {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        alert('Simulación detenida.');
    } else {
        simulationInterval = setInterval(() => {
            const simulatedData = generateSimulatedData();
            processData(simulatedData);
        }, 1000);
        alert('Simulación iniciada.');
        openVisualizationPage();
    }
});

//Generar datos simulados
function generateSimulatedData() {
    const handPosition = Math.random() > 0.5 ? 'OK' : 'NOK';
    const profundidad = Math.floor(Math.random() * 10);
    const freq = Math.floor(Math.random() * 200) + 50;
    return `\nU${handPosition},P${profundidad},F${freq}:`;
}
