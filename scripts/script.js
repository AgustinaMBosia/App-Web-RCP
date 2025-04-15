let simulationInterval = null; 
let bluetoothInterval = null;
let serialInterval = null;

let lastBluetoothData = null;
let lastSerialData = null;

let handPosition = null;
let profundidad = null;
let freq = null;

let serialPort= null;

let handsFlag = false;

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
                }
            }
        }

        readSerialData();

        var flag = 1;

        serialInterval = setInterval(() => {
            const match = lastSerialData.match("hola");
            const match2 = lastSerialData.match("buddyFINISH");
            const match3 = lastSerialData.match("manos ok");
            

            if (lastSerialData) {
                processData(lastSerialData);
                lastSerialData = null;
                /* 
                - esto es lo que hace la iteracion 
                - podemos clavar aca la pedida de datos "ENVIAR DATOS MUÑECO" y la lectura del "Hola"
                */
            }
            if (match) {
                setTimeout(() => sendToModule("ok"), 500); // Agregar un delay
                setTimeout(() => sendToModule("enviar manos"), 15000); // Agregar un delay manos ok   
                flag = 2;
            }
            
            if (match2){

            }

            if (match3){
                console.log("se recepto el manos");
                setTimeout(() => sendToModule("enviar datos"), 500);  
                flag = 4;
            }

            if (flag === 2){
                setTimeout(() => sendToModule("enviar manos"), 10000);
                setTimeout(() => sendToModule("enviar manos"), 20000);
                flag = 4;
            }
            if (flag === 4){
                setTimeout(() => sendToModule("enviar datos"), 1100); 
                setTimeout(() => sendToModule("enviar datos"), 5500); 
                setTimeout(() => sendToModule("enviar datos"), 10000); 
            }
            

        }, 100);

        alert('Conexión Serial establecida.');

        openVisualizationPage();

    } catch (error) {
        console.error('Error en conexión Serial:', error);
        alert('No se pudo conectar al dispositivo Serial.');
    }
});
