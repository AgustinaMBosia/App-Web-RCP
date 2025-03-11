let simulationInterval = null; 
let bluetoothInterval = null;
let serialInterval = null;

let lastBluetoothData = null;
let lastSerialData = null;

let handPosition = null;
let profundidad = null;
let freq = null;

const receivedDataElement = document.getElementById('receivedData');

function openVisualizationPage() {
    window.open('visualization.html', '_blank');
}

//  PROCESAR DATOS
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
        }, 500);
        
        openVisualizationPage();
    } catch (error) {
        console.error('Error al conectar vía Bluetooth:', error);
        alert('No se pudo conectar al dispositivo Bluetooth.');
    }
});

async function sendToModule(message) {
    try {
        console.log(serialPort);
        const encoder = new TextEncoder();
        const writer = serialPort.writable.getWriter();
        await writer.write(encoder.encode(message + "\n"));
        writer.releaseLock();

        console.log(`✅ Mensaje enviado: ${message}`);
    } catch (error) {
        console.error("❌ Error al enviar mensaje:", error);
    }
}
/*

async function checkArduinoTime() {
    try {
        // Solicitar acceso al puerto serie
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const writer = serialPort.writable.getWriter();
        const reader = serialPort.readable.getReader();

        // Enviar comando para solicitar la hora
        console.log("Solicitando fecha y hora...");
        await writer.write(encoder.encode("TIME?\n"));
        writer.releaseLock();

        // Leer la respuesta del Arduino
        //(esperamos una fecha como "2025-02-26T12:34:56Z")
        let receivedTime = "";
        while (true) {
            const { value, done } = await reader.read();
            receivedTime += decoder.decode(value, { stream: true });

            if (done || receivedTime.includes("\n")) break; // Salir cuando se reciba una línea completa
        }
        reader.releaseLock();

        receivedTime = receivedTime.trim();
        console.log("Fecha y hora recibida del Arduino:", receivedTime);

        // Convertir a objeto Date
        const arduinoTime = new Date(receivedTime);
        const systemTime = new Date();

        // Comparar con la hora del sistema (diferencia en segundos)
        const diff = Math.abs((systemTime - arduinoTime) / 1000);

        if (diff <= 10) { // Permitir hasta 10 segundos de diferencia A CHEQUEAR
            console.log("Hora válida. Enviando 'OK'.");
            const writer = port.writable.getWriter();
            await writer.write(encoder.encode("ok\n"));
            // capaz esta raro, incluye salto de línea
            writer.releaseLock();
        } else {
            console.log("Hora incorrecta. No se envió 'OK'.");
        }

        await port.close(); // Cerrar el puerto cuando termine

    } catch (error) {
        console.error("Error en la conexión:", error);
    }
}
    */

document.getElementById('serialButton').addEventListener('click', async () => {
    try {
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 9600 });

        serialReader = serialPort.readable.getReader();
        const decoder = new TextDecoder("utf-8", { stream: true }); // Mantiene estado entre lecturas
        let buffer = ""; // Buffer para reconstruir mensajes completos

        async function readSerialData() {
            while (serialPort && serialReader) {
                const { value, done } = await serialReader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                buffer += text; // Acumulamos en el buffer

                // Revisamos si hay líneas completas (separadas por salto de línea)
                let lines = buffer.split("\n");
                buffer = lines.pop(); // Guardamos la última parte incompleta para la siguiente iteración

                for (let line of lines) {
                    line = line.replace(/\r/g, "").trim(); // Limpiar caracteres no deseados
                    console.log("Línea procesada:", line);
                    lastSerialData = line;
                }
            }
        }

        readSerialData();

        // Intervalo para actualizar datos Serial
        serialInterval = setInterval(() => {
            if (lastSerialData) {
                processData(lastSerialData);
                lastSerialData = null;
            }
        }, 500);

        alert('Conexión Serial establecida.');
        // Enviar mensaje "OK"


        sendToModule("ok");

        checkArduinoTime();

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
        }, 500);
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

/*
async function sendToModule(message) {
    try {
        if (!port) {
            console.error("⚠ No hay puerto serie abierto.");
            return;
        }

        const encoder = new TextEncoder();
        const writer = port.writable.getWriter();
        await writer.write(encoder.encode(message + "\n"));
        writer.releaseLock();

        console.log(`✅ Mensaje enviado: ${message}`);
    } catch (error) {
        console.error("❌ Error al enviar mensaje:", error);
    }

}*/


// Escuchar cambios en localStorage
window.addEventListener("storage", (event) => {
    if (event.key === "serialCommand" && event.newValue === "reiniciar") {
        sendToModule("reiniciar");
    }
    else if (event.key === "serialCommand" && event.newValue === "terminar") {
        sendToModule("terminar");
    }
});

