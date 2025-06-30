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
let comando = 0x01;
let data = new Array(8).fill(0x00);

let flagSendData = false;
let sendDataFlag = false;

const receivedDataElement = document.getElementById('receivedData');

function openVisualizationPage() {
    window.open('visualization.html', '_blank');
}

// PROCESAR DATOS
function processData(data) { // Eliminar caracteres \r y espacios extra

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
        if (idPag === 0x00) idPag = contadorUniversal++;
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

        async function readSerialData() {
            const buffer = [];
            
            while (serialPort && serialReader) {
                const { value, done } = await serialReader.read();
                if (done) break;

                for (let i = 0; i < value.length; i++) {
                    const byte = value[i];

                    if (byte === 0x0D) { // Fin de trama
                        if (buffer.length === 18) { // Esperamos 18 bytes antes del CR
                            const packet = new Uint8Array(buffer);

                            const checksum = packet[17]; // último byte antes del CR
                            const calculatedChecksum = calculateChecksum(packet.slice(0, 17)); // sin el checksum

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
            const IDpaq = packet[2];
            const dummy2 = packet[3];
            const dirDestino2 = (packet[4] << 8) | packet[5];
            const dirOrigen = (packet[6] << 8) | packet[7];
            const receivedComando = packet[8];
            const receivedData = packet.slice(9, 17);
            const checksum = packet[17];

            // Si esperás texto:
            const dataStr = String.fromCharCode(...receivedData);

            // Si esperás número de 8 bytes:
            let dataNumber = 0n;
            for (let i = 0; i < receivedData.length; i++) {
                dataNumber = (dataNumber << 8n) | BigInt(receivedData[i]);
            }

            // Actualizamos variables globales con lo recibido
            comando = receivedComando;
            data = Array.from(receivedData);
            idPag = IDpaq;
            idOrigen = packet[6];  // solo low byte
            idDestino = dirDestino1;
            sendDataFlag = packet[14];

            // Mostrar todo en consola
            console.log("✅ Trama recibida:");
            console.log(`📦 IDpaq: ${IDpaq}`);
            console.log(`📍 Origen: 0x${dirOrigen.toString(16).padStart(4, '0')}`);
            console.log(`📍 Destino: 0x${dirDestino2.toString(16).padStart(4, '0')}`);
            console.log(`🔧 Comando: 0x${receivedComando.toString(16).padStart(2, '0')}`);
            console.log(`📊 Data: [${receivedData.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
            console.log(`🧮 Checksum: 0x${checksum.toString(16).padStart(2, '0')}`);
            console.log(`Bandera de sendData: 0x${sendDataFlag.toString(16).padStart(4, '0')}`);
        }


    

        readSerialData();


        serialInterval = setInterval(() => {
            contadorUniversal++;
            //cambiar a case con el comando
            
            console.log('El comando es: ',comando);

            /*
                if (localStorage.getItem('serialCommand') = "terminar"){
                currentState = 'FINISH';
                sendToModule({ idDestino: 0x64,idPag:contadorUniversal,idOrigen:0x01, comando: 0x05, data });
            }*/

            
        
            switch (comando) {

                case 0x01:
                    sendToModule({idDestino: 0x64,idPag,idOrigen:0x01,comando,data})
                    currentState = 'START'
                    console.log('el estado actual es: ', currentState);
                    console.log('el comando actual es: ', comando);
                    break;

                case 0x65:
                    console.log('el comando es: ',comando)
                    contadorUniversal++;
                    
                    if (comando == 0x65) {
                        sendToModule({idDestino: 0x64,idPag:contadorUniversal,idOrigen:0x01,comando:0x02,data});
                        currentState = 'WAIT_CONFIRMATION';
                        contadorUniversal++;
                    }
                    else {
                        console.log("Intentado conectar...");
                        sendToModule({idDestino:0x64, idPag: contadorUniversal, idOrigen:0x01, comando: 0x01, data})
                    }
                    console.log('el estado actual es: ', currentState);
                    contadorUniversal++;
                    break;

                case 0x66:
                    if (comando == 0x66 && data[0] != 0x71) { // 102
                        sendToModule({idDestino:0x64,idPag:contadorUniversal,idOrigen:0x01,comando:0x03,data});
                        currentState = 'WAIT_HANDS';
                        console.log('el estado actual es: ', currentState);
                    } 

                    if (comando == 0x66 && data[0] == 0x71 ) {// 102 y 113
                        data[0] = 0x71
                        sendToModule({idDestino:0x64,idPag:contadorUniversal,idOrigen:0x01,comando:0x66,data});
                        currentState = 'SEND_DATA';
                        sendToModule({idDestino:0x64,idPag:contadorUniversal,idOrigen:0x01,comando:0x03,data}); // poner bien la direccion de destino
                    
                    } 

                    if (comando == 0x66 && data[0] == 0xFF ) {
                        console.log("finalizado correctamente")
                        currentState = 'IDLE';
                    }

                    break;

                case 0x03:
                    if (!flagSendData) { // 102

                        data[0] = 0x71
                        if (contadorUniversal % 2 == 0)sendToModule({idDestino:0x64,idPag:contadorUniversal,idOrigen:0x01,comando:0x66,data});
                        if (contadorUniversal % 2 != 0)sendToModule({ idDestino: 0x64,idPag:contadorUniversal,idOrigen:0x01, comando: 0x04, data });
                        
                        if (data[5] == 0x01){
                            currentState = 'SEND_DATA';
                            flagSendData = true;
                        }
                        
                    }else{
                        if (currentState != 'FINISH' &&  (sendDataFlag==true || data[5] == 0x01)){
                        processSensorData(data);  
                        sendToModule({ idDestino: 0x64,idPag:contadorUniversal,idOrigen:0x01, comando: 0x04, data });
                        }

                        setTimeout(() => {
                        currentState = 'FINISH';
                        sendToModule({ idDestino: 0x64,idPag:contadorUniversal,idOrigen:0x01, comando: 0x05, data });
                        }, 60000);
                    }

                    break;

                case 0x68:
                     if (currentState != 'FINISH' &&  (sendDataFlag==true || data[5] == 0x01)){
                        processSensorData(data);  
                        sendToModule({ idDestino: 0x64,idPag:contadorUniversal,idOrigen:0x01, comando: 0x04, data });
                        }

                        setTimeout(() => {
                        currentState = 'FINISH';
                        sendToModule({ idDestino: 0x64,idPag:contadorUniversal,idOrigen:0x01, comando: 0x05, data });
                        comando = 0x01;
                     }, 60000);
                    
                default:
                    // comando=0x01;
                    break;

            }


        }, 1000);


        alert('Conexión Serial establecida.');
        openVisualizationPage();

    } catch (error) {
        console.error('Error en conexión Serial:', error);
        alert('No se pudo conectar al dispositivo Serial.');
    }
});
