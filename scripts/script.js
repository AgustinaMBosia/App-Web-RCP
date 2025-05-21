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
        
        //sendToModule("enviar datos");

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

async function sendToModule({
    idDestino,
    idPag,
    idOrigen,
    comando,
    data // Array de 8 bytes
}) {
    if (!serialPort) {
        console.error("❌ No hay conexión serial activa.");
        return;
    }

    // Validaciones básicas
    if (!Array.isArray(data) || data.length !== 8) {
        console.error("❌ 'data' debe ser un array de 8 bytes.");
        return;
    }

    try {
        if (idPag==0x00) idPag=contadorUniversal++
        // Construcción de la trama (sin checksum y CR todavía)
        const frame = [
            idDestino,         // dirección
            0x00,              // dummy
            idPag,             // IDpag
            0x00,              // dummy
            idDestino, 0x00,   // dir_destino (low, high)
            idOrigen, 0x00,    // dir_origen (low, high)
            comando,           // comando
            ...data            // 8 bytes de datos
        ];

        // Calcular checksum (los primeros 17 bytes)
        const checksum = calculateChecksum(frame);
        frame.push(checksum);

        // Agregar CR (0x0D)
        frame.push(0x0D);

        // Enviar
        const writer = serialPort.writable.getWriter();
        await writer.write(new Uint8Array(frame));
        writer.releaseLock();

        console.log(`✅ Trama enviada: ${frame.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    } catch (error) {
        console.error("❌ Error al enviar la trama:", error);
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
            let sum = 0;

            // 1. Sumar todos los bytes
            for (const b of data) {
                sum += b;
            }

            // 2. Reducir la suma a 8 bits sumando los bytes altos y bajos
            while (sum > 0xFF) {
                sum = (sum & 0xFF) + (sum >> 8);
            }

            // 3. Complemento bit a bit
            sum = ~sum & 0xFF;

            return sum;
        }


        function processPacket(packet) {
            const dirDestino1 = packet[0];
            const dummy1 = packet[1];
            const IDpaq = packet[2]
            const dummy2 = packet[3];
            const dirDestino2 = (packet[4] << 8) | packet[5];
            const dirOrigen = (packet[6] << 8) | packet[7];
            const comando = packet[8];
            const data = packet.slice(9,17);
            const checksum = packet[18];

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
                IDpaq,
                dummy2,
                dirDestino2,
                dirOrigen,
                comando,
                data: dataStr,  // o data: dataNumber
                checksum
            };

            console.log("Trama procesada:", parsedPacket);
        }

    

        readSerialData();

        serialInterval = setInterval(() => {
            
            console.log(`Estado actual: ${currentState}`);
            
            switch (currentState) {
                case 'IDLE':
                    if (comando == 101) {
                        sendToModule({idDestino,idPag,idOrigen,002,data});
                        currentState = 'WAIT_CONFIRMATION';
                    }
                    break;

                case 'WAIT_CONFIRMATION':
                    if (comando == 102) {
                        sendToModule("003");
                        currentState = 'WAIT_HANDS';
                    } else {
                        if (comando == 101) {
                            console.log("Reintentando enviar 002...");
                            sendToModule("002");
                        }
                    }
                    break;

                case 'WAIT_HANDS':
                    if (comando == 113) {
                        console.log("Manos recibidas.");
                        currentState = '004';
                    } else {
                        if (comando == 102) {
                            console.log("Reintentando enviar manos...");
                            sendToModule("003");
                        }
                    }
                    break;

                case 'SEND_DATA':
                    if (comando == 104) {
                        processData(data);
                        sendToModule('004');
                    }

                    setTimeout(()=>sendToModule('005'),10000)

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
