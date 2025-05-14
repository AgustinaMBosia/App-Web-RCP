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


const receivedDataElement = document.getElementById('receivedData');

function openVisualizationPage() {
    window.open('visualization.html', '_blank');
}

// PROCESAR DATOS
function processData(data) {
    data = data.replace(/\r/g, "").trim(); // Eliminar caracteres \r y espacios extra

    const regex = /U(OK|NOK),P(\d+),F(\d+):/; // Ajuste de la regex
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
        
        sendToModule("enviar datos");

    } else {
        console.warn('Trama inválida o no procesada:', data);
    }
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

        // Intervalo para actualizar datos Bluetooth
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

async function sendToModule(message) {
    if (!serialPort) {
        console.error("❌ No hay conexión serial activa.");
        return;
    }
    try {
        const encoder = new TextEncoder();
        const writer = serialPort.writable.getWriter();
        await writer.write(encoder.encode(message + "\n"));
        writer.releaseLock();
        console.log(`✅ Mensaje enviado: ${message}`);
    } catch (error) {
        console.error("❌ Error al enviar mensaje:", error);
    }
}

// const systemTime = new Date(); PARA SACAR TIEMPO DE COMPUTADORA


// SIMULACIÓN
document.getElementById('simulateButton').addEventListener('click', () => {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        alert('Simulación detenida.');
        simulateButton.textContent = "Simular Trama";
    } else {
        simulationInterval = setInterval(() => {
            const simulatedData = generateSimulatedData();
            processData(simulatedData);
        }, 500);
        alert('Simulación iniciada.');
        openVisualizationPage();
        simulateButton.textContent = "⏸ Pausar simulación";
    }
    
});

//Generar datos simulados
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

        serialReader = serialPort.readable.getReader();
        const decoder = new TextDecoder("utf-8", { stream: true });
        let buffer = "";
/*
        async function readSerialData() {
            while (serialPort && serialReader) {
                const { value, done } = await serialReader.read();
                if (done) break;

                // Decodifica cada byte individualmente
                for (let i = 0; i < value.length; i++) {
                    const char = String.fromCharCode(value[i]);
                    buffer += char;

                    if (char === '\n') {
                        let line = buffer.replace(/\r/g, "").trim();
                        console.log("Línea procesada:", line);

                        previousSerialData = lastSerialData;
                        lastSerialData = line;

                        buffer = ""; // Reinicia el buffer después de procesar una línea
                    }
                }
            }
        }
        // dir destino (1 byte), dummy (1 byte), dir destino (2 byte), dir origen (2 bytes), comando(1 bytes), data (8 bytes), chk(1 byte),<cr>
*/
        async function readSerialData() {
            const buffer = [];
            
            while (serialPort && serialReader) {
                const { value, done } = await serialReader.read();
                if (done) break;

                for (let i = 0; i < value.length; i++) {
                    const byte = value[i];

                    if (byte === 0x0D) { // Fin de trama
                        if (buffer.length === 17) { // Esperamos 17 bytes antes del CR
                            const packet = new Uint8Array(buffer);

                            const checksum = packet[16]; // último byte antes del CR
                            const calculatedChecksum = calculateChecksum(packet.slice(0, 16)); // sin el checksum

                            if (checksum === calculatedChecksum) {
                                processPacket(packet);
                            } else {
                                console.warn("Checksum inválido:", checksum, "≠", calculatedChecksum);
                            }
                        } else {
                            console.warn("Trama de longitud inesperada:", buffer.length);
                        }

                        buffer.length = 0; // Limpiar buffer
                    } else {
                        buffer.push(byte);
                    }
                }
            }
        }

        function calculateChecksum(data) {
            // Ejemplo: suma simple de bytes, ajustá esto si usás otro algoritmo
            let sum = 0;
            for (const b of data) {
                sum = (sum + b) & 0xFF; // mantener en 8 bits
            }
            return sum;
        }

        function processPacket(packet) {
            const dirDestino1 = packet[0];
            const dummy1 = packet[1];
            const dirDestino2 = (packet[2] << 8) | packet[3];
            const dummy2 = packet[4];
            const dirOrigen = (packet[5] << 8) | packet[6];
            const comando = packet[7];
            const data = packet.slice(8, 16);
            const checksum = packet[16];

            // Si esperás texto:
            const dataStr = String.fromCharCode(...data);

            // Si esperás número de 8 bytes:
            let dataNumber = 0;
            for (let i = 0; i < data.length; i++) {
                dataNumber = (dataNumber << 8n) | BigInt(data[i]);
            }

            const parsedPacket = {
                dirDestino1,
                dummy1,
                dirDestino2,
                dummy2,
                dirOrigen,
                comando,
                data: dataStr,  // o data: dataNumber
                checksum
            };

            console.log("Trama procesada:", parsedPacket);
        }

    

        readSerialData();

        serialInterval = setInterval(() => {
            if (!lastSerialData) return;

            console.log(`Estado actual: ${currentState}`);
            const data = lastSerialData;
            lastSerialData = null; // Limpiar para esperar el próximo mensaje

            switch (currentState) {
                case 'IDLE':
                    if (data.includes("hola")) {
                        sendToModule("ok");
                        currentState = 'WAIT_CONFIRMATION';
                    }
                    break;

                case 'WAIT_CONFIRMATION':
                    if (data.includes("ok recibe")) {
                        sendToModule("enviar manos");
                        currentState = 'WAIT_HANDS';
                    } else {
                        if (data === previousSerialData) {
                            console.log("Reintentando enviar ok...");
                            sendToModule("ok");
                        }
                    }
                    break;

                case 'WAIT_HANDS':
                    if (data.includes("manos ok")) {
                        console.log("Manos recibidas.");
                        currentState = 'SEND_DATA';
                    } else {
                        if (data === previousSerialData) {
                            console.log("Reintentando enviar manos...");
                            sendToModule("enviar manos");
                        }
                    }
                    break;

                case 'SEND_DATA':
                    if (previousSerialData !== data) {
                        processData(data);
                        setTimeout(() => sendToModule("enviar datos"), 1000);
                    }

                    if (data.includes("buddyFINISH")) {
                        currentState = 'FINISH';
                    }
                    break;

                case 'FINISH':
                    currentState = 'IDLE';
                    break;
            }

        }, 100);


        alert('Conexión Serial establecida.');
        openVisualizationPage();

    } catch (error) {
        console.error('Error en conexión Serial:', error);
        alert('No se pudo conectar al dispositivo Serial.');
    }
});
