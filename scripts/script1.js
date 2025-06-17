

// Variables globales
let simulationInterval = null;
let bluetoothInterval = null;
let serialInterval = null;

let lastBluetoothData = null;
let lastSerialData = null;
let previousSerialData = null;

let handPosition = null;
let profundidad = null;
let freq = null;

let serialPort= null;

let handsFlag = false;

let currentState = 'IDLE';

let contadorUniversal = 0;

let idDestino = 0x00;
let idPag = 0x00;
let idOrigen = 0x00;
let comando = 0x00;
let data = new Array(8).fill(0x00);

const receivedDataElement = document.getElementById('receivedData');

function openVisualizationPage() {
    window.open('visualization.html', '_blank');
}

// PROCESAR DATOS
function processData(data) {
    data = data.replace(/\r/g, "").trim();
    const regex = /U(OK|NOK),P(\d+),F(\d+):/;
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

        localStorage.setItem('realTimeData', JSON.stringify(processedData));
        localStorage.setItem('updateTime', new Date().toISOString());
    } else {
        console.warn('Trama inválida o no procesada:', data);
    }
}

function processSensorData(sensorBytes) {
    const manoOK = sensorBytes[0] === 1 ? 'OK' : 'NOK';
    const profundidad = sensorBytes[1] | (sensorBytes[2] << 8);
    const frecuencia = sensorBytes[3] | (sensorBytes[4] << 8);

    console.log("📥 Datos decodificados:");
    console.log("🤚 Mano:", manoOK);
    console.log("📏 Profundidad:", profundidad);
    console.log("🎯 Frecuencia:", frecuencia);

    receivedDataElement.textContent = `
        Posición de la Mano: ${manoOK}
        Profundidad: ${profundidad}
        Frecuencia: ${frecuencia}
    `;

    localStorage.setItem('realTimeData', JSON.stringify({
        handPosition: manoOK,
        profundidad,
        freq: frecuencia
    }));
    localStorage.setItem('updateTime', new Date().toISOString());
}

// CONEXIÓN BLUETOOTH
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

        bluetoothInterval = setInterval(() => {
            if (lastBluetoothData) {
                processData(lastBluetoothData);
                lastBluetoothData = null;
            }
        }, 500);

        openVisualizationPage();
    } catch (error) {
        console.error('Error al conectar vía Bluetooth:', error);
        alert('No se pudo conectar al dispositivo Bluetooth.');
    }
});

async function sendToModule({ idDestino,idPag,idOrigen, comando, data }) {
    function calculateChecksum(data) {
        let sum = 0;
        for (const b of data) sum += b;
        while (sum > 0xFF) sum = (sum & 0xFF) + (sum >> 8);
        return (~sum) & 0xFF;
    }

    if (!serialPort) return console.error("❌ No hay conexión serial activa.");
    if (!Array.isArray(data) || data.length !== 8) return console.error("❌ 'data' debe ser un array de 8 bytes.");

    try {
        if (idPag === 0x00) idPag = contadorUniversal++;

        const frame = [
            idDestino, 0x00, idPag, 0x00,
            idDestino, 0x00,
            idOrigen, 0x00,
            comando,
            ...data
        ];

        const checksum = calculateChecksum(frame);
        frame.push(checksum);
        frame.push(0x0D);

        const writer = serialPort.writable.getWriter();
        await writer.write(new Uint8Array(frame));
        writer.releaseLock();

        console.log(`✅ Trama enviada: ${frame.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    } catch (error) {
        console.error("❌ Error al enviar la trama:", error);
    }
}

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
        }, 500);
        alert('Simulación iniciada.');
        openVisualizationPage();
    }
});

function generateSimulatedData() {
    const handPosition = Math.random() > 0.5 ? 'OK' : 'NOK';
    const profundidad = Math.floor(Math.random() * 10);
    const freq = Math.floor(Math.random() * 200) + 50;
    return `\nU${handPosition},P${profundidad},F${freq}:`;
}

// CONEXIÓN SERIAL
document.getElementById('serialButton').addEventListener('click', async () => {
    try {
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 9600 });

        const serialReader = serialPort.readable.getReader();
        const buffer = [];

        async function readSerialData() {
            while (serialPort && serialReader) {
                const { value, done } = await serialReader.read();
                if (done) break;

                for (const byte of value) {
                    if (byte === 0x0D) {
                        if (buffer.length === 18) {
                            const packet = new Uint8Array(buffer);
                            const checksum = packet[17];
                            const calculatedChecksum = calculateChecksum(packet.slice(0, 17));

                            if (checksum === calculatedChecksum) {
                                processPacket(packet);
                            } else {
                                console.warn("Checksum inválido:", checksum, "≠", calculatedChecksum);
                            }
                        } else {
                            console.warn("Trama de longitud inesperada:", buffer.length);
                        }
                        buffer.length = 0;
                    } else {
                        buffer.push(byte);
                    }
                }
            }
        }

        function calculateChecksum(data) {
            let sum = 0;
            for (const b of data) sum += b;
            while (sum > 0xFF) sum = (sum & 0xFF) + (sum >> 8);
            return (~sum) & 0xFF;
        }

        function processPacket(packet) {
            const dirDestino1 = packet[0];
            const IDpaq = packet[2];
            const dirOrigen = packet[6];
            const receivedComando = packet[8];
            const receivedData = packet.slice(9, 17);

            comando = receivedComando;
            data = Array.from(receivedData);
            idPag = IDpaq;
            idOrigen = packet[6];
            idDestino = dirDestino1;

            console.log("✅ Trama recibida:");
            console.log(`📦 IDpaq: ${IDpaq}`);
            console.log(`📍 Origen: 0x${dirOrigen.toString(16).padStart(4, '0')}`);
            console.log(`🔧 Comando: 0x${receivedComando.toString(16).padStart(2, '0')}`);
            console.log(`📊 Data: [${receivedData.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
        }

        readSerialData();

        serialInterval = setInterval(() => {
            console.log('El comando es: ', comando);

            switch (comando) {
                case 0x01:
                    sendToModule({ idDestino: 0x64,idPag,idOrigen:0x01, comando, data });
                    currentState = 'START';
                    break;

                case 0x65:
                    sendToModule({ idDestino: 0x64,idPag,idOrigen:0x01, comando: 0x02, data });
                    currentState = 'WAIT_CONFIRMATION';
                    break;

                case 0x66:
                    if (data[0] !== 0x71) {
                        sendToModule({ idDestino: 0x64,idPag,idOrigen:0x01, comando: 0x03, data });
                        currentState = 'WAIT_HANDS';
                    } else {
                        currentState = 'SEND_DATA';
                        sendToModule({ idDestino: 0x64,idPag,idOrigen:0x01, comando: 0x03, data });
                    }
                    break;

                case 0x68:
                    processSensorData(data);  
                    sendToModule({ idDestino: 0x64,idPag,idOrigen:0x01, comando: 0x04, data });
                    setTimeout(() => {
                        currentState = 'FINISH';
                        sendToModule({ idDestino: 0x64,idPag,idOrigen:0x01, comando: 0x05, data });
                    }, 60000);
                    break;

                case 0xFF:
                    console.log("finalizado correctamente");
                    currentState = 'IDLE';
                    break;

                default:
                    comando = 0x01;
                    break;
            }
        }, 10000);

        alert('Conexión Serial establecida.');
        openVisualizationPage();

    } catch (error) {
        console.error('Error en conexión Serial:', error);
        alert('No se pudo conectar al dispositivo Serial.');
    }
});
