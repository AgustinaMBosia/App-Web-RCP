let simulationInterval = null; 
let bluetoothInterval = null;
let serialInterval = null;

let lastBluetoothData = null;
let lastSerialData = null;

let handPosition = null;
let profundidad = null;
let freq = null;

let serialPort= null;

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

async function checkArduinoTime(line) {
    try {
        if (!serialPort) {
            console.error("❌ No hay conexión serial activa.");
            return;
        }


        /*
        console.log("Solicitando fecha y hora...");
        await writer.write(encoder.encode("TIME?\n"));                          // pregunta por TIME
        writer.releaseLock();
        */

        let receivedTime = line;
        console.log("Esperando tiempo del Arduino...");                              //formato de hora 22-31:
        
        if (!/^\d{4}-\d{1,2}-\d{1,2}T\d{2}:\d{2}:\d{2}Z$/.test(line)) {
            console.error("❌ Formato de tiempo inválido:", receivedTime);
            return;
        }

        const arduinoTime = new Date(receivedTime);
        arduinoTime.setHours(arduinoTime.getHours() + 3);
        const systemTime = new Date();
        console.log("la hora del sistema es: ", systemTime);
        console.log("la hora del arduino es: ", arduinoTime, receivedTime);

        const diff = Math.abs((systemTime - arduinoTime) / 1000);
        console.log("la diferencia es de: ", diff);
        if (diff <= 20000) {
            console.log("Hora válida. Enviando 'ok'.");
            var i=0;
            while (i<2000){     
                sendToModule("ok")
                i++;
            }
        } else {
            console.log("Hora incorrecta. No se envió 'ok'.");
        }
    } catch (error) {
        console.error("Error en la conexión:", error);
    }
}



// CONEXIÓN SERIAL
document.getElementById('serialButton').addEventListener('click', async () => {
    try {
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 9600 });

        const serialReader = serialPort.readable.getReader(); // Solo una vez
        const decoder = new TextDecoder("utf-8", { stream: true });
        let buffer = "";

        async function readSerialData() {
            while (serialPort && serialReader) {
                const { value, done } = await serialReader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                buffer += text;
                let lines = buffer.split("\n");
                buffer = lines.pop();

                for (let line of lines) {
                    line = line.replace(/\r/g, "").trim();
                    console.log("Línea procesada:", line);
                    lastSerialData = line;
                    /* espera el hola para mandar ok y checkear el tiempo
                    el unico problema es que hace la verificacion para cada dato recibido*/
                    const match = line.match("hola");
                    const regex1 = /^\d{4}-\d{1,2}-\d{1,2}T\d{2}:\d{2}:\d{2}Z$/; // Ajuste de la regex
                    const match1 = line.match(regex1);

                    if (match) {
                        setTimeout(() => sendToModule("ok"), 500); // Agregar un delay
                    }
                    if (match1) {
                        setTimeout(() => checkArduinoTime(line), 1000); // Agregar un delay
                    }
                    
                }

            }
        }

        readSerialData();


        serialInterval = setInterval(() => {
            if (lastSerialData) {
                processData(lastSerialData);
                lastSerialData = null;
            }
        }, 500);

        alert('Conexión Serial establecida.');

        openVisualizationPage();
    } catch (error) {
        console.error('Error en conexión Serial:', error);
        alert('No se pudo conectar al dispositivo Serial.');
    }
});
