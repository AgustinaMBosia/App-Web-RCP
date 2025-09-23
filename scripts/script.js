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

let visualizationWindow = null;

let handsFlag = false;

let currentState = 'IDLE';

let contadorUniversal = 0;
let handsPopupShown = false;
window.handsOk = false;           // flag global que vamos a ir actualizando
let handsPopupOpen = false;       // evita múltiples popups
let handsPopupIntervalId = null;  // para cortar el polling al cerrar

// Session control to avoid stale/rescheduled popups
window.sessionId = window.sessionId || 0;    // increments when a new "maniobra" starts
window.finishPopupShown = window.finishPopupShown || false;

let finishTimeoutId = null;
let finishScheduled = false;

let flagCierroPopup = false;


function clearFinishSchedule() {
	if (finishTimeoutId) {
		clearTimeout(finishTimeoutId);
		finishTimeoutId = null;
	}
	finishScheduled = false;
}

// Función para reiniciar todos los estados al iniciar una nueva maniobra
function resetAllStates() {
	console.log("🔄 Reiniciando todos los estados para nueva maniobra...");
	
	// Detener todos los intervalos y timeouts
	if (simulationInterval) {
		clearInterval(simulationInterval);
		simulationInterval = null;
	}
	if (bluetoothInterval) {
		clearInterval(bluetoothInterval);
		bluetoothInterval = null;
	}
	if (serialInterval) {
		clearInterval(serialInterval);
		serialInterval = null;
	}
	if (handsPopupIntervalId) {
		clearInterval(handsPopupIntervalId);
		handsPopupIntervalId = null;
	}
	clearFinishSchedule();
	
	// Reiniciar variables de datos
	lastBluetoothData = null;
	lastSerialData = null;
	previousSerialData = null;
	
	// Reiniciar variables de posición y sensores
	handPosition = null;
	profundidad = null;
	freq = null;
	
	// Reiniciar flags y estados
	handsFlag = false;
	currentState = 'IDLE';
	contadorUniversal = 0;
	handsPopupShown = false;
	window.handsOk = false;
	handsPopupOpen = false;
	// finishPopupShown = false;
	flagCierroPopup = false;
	
	// Reiniciar variables de comunicación
	idDestino = 0x00;
	idPag = 0x00;
	idOrigen = 0x00;
	comando = 0x01;
	data = new Array(8).fill(0x00);
	
	// Reiniciar flags de envío de datos
	flagSendData = false;
	sendDataFlag = false;
	flagCambio = true;
	count = 0;
	
	// Limpiar datos mostrados en pantalla
	if (receivedDataElement) {
		receivedDataElement.textContent = "Ningún dato recibido aún";
	}
	
	// Resetear texto del botón de simulación si existe
	const simulateButton = document.getElementById('simulateButton');
	if (simulateButton) {
		simulateButton.textContent = "Simular Trama";
	}
	
	console.log("✅ Todos los estados reiniciados correctamente");
	console.log("🔌 Conexión serial preservada:", serialPort ? "Activa" : "Inactiva");
}

function scheduleFinishOnce() {
    if (finishScheduled || window.finishPopupShown) return;
    finishScheduled = true;
    const thisSession = window.sessionId;

    finishTimeoutId = setTimeout(() => {
        // Si la sesión cambió (se inició nueva maniobra), ignoramos este timeout
        if (thisSession !== window.sessionId) {
            finishTimeoutId = null;
            finishScheduled = false;
            return;
        }

        if (currentState !== 'FINISH') {
            currentState = 'FINISH';
            sendToModule({
                idDestino: 0x64,
                idPag: contadorUniversal,
                idOrigen: 0x01,
                comando: 0x05,
                data
            });
        }

        if (!window.finishPopupShown && typeof window.saveCharts === 'function') {
            window.finishPopupShown = true;   // marcar ANTES de llamar
            window.saveCharts();
        }

        comando = 0x01;
        finishTimeoutId = null;
        finishScheduled = false;
    }, 60000);
}


let idDestino = 0x00;
let idPag = 0x00;
let idOrigen = 0x00;
let comando = 0x01;
let data = new Array(8).fill(0x00);

let flagSendData = false;
let sendDataFlag = false;
let flagCambio = true;
let count=0;

const receivedDataElement = document.getElementById('receivedData');

// PROCESAR DATOS
function processData(data) { // Eliminar caracteres \r y espacios extra

	const regex = /U(OK|NOK),P(\d+),F(\d+):/; // Ajuste de la regex
	const match = data.match(regex);

	if (match) {
		const [_, handPosition, profundidad, freq] = match;
		window.handsOk = (handPosition === 'OK');
		
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

		if (typeof window.updateVisualization === 'function') {
			window.updateVisualization(processedData);
		}

	} else {
		console.warn('Trama inválida o no procesada:', data);
	}
}
function processSensorData(sensorBytes) {
	const manoOK = sensorBytes[0] === 1 ? 'OK' : 'NOK';
	const profundidad = sensorBytes[1] | (sensorBytes[2] << 8);
	const frecuencia = sensorBytes[3] | (sensorBytes[4] << 8);

	window.handsOk = (manoOK === 'OK');

	console.log("📥 Datos decodificados:");
	console.log("🤚 Mano:", manoOK);
	console.log("📏 Profundidad:", profundidad);
	console.log("🎯 Frecuencia:", frecuencia);

	receivedDataElement.textContent = `
		Posición de la Mano: ${manoOK}
		Profundidad: ${profundidad}
		Frecuencia: ${frecuencia}
	`;

	const processedData = {
		handPosition: manoOK,
		profundidad,
		freq: frecuencia
	};

	if (typeof window.updateVisualization === 'function') {
		window.updateVisualization(processedData);
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

		//openVisualizationPage();
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
		//openVisualizationPage();
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
function stopSerialLoop() {
    if (serialInterval) {
        clearInterval(serialInterval);
        serialInterval = null;
        console.log("⏸️ Loop de estados detenido.");
    }
}

window.restartSerialLoop = function restartSerialLoop() {
    // Reiniciar todos los estados antes de iniciar el nuevo loop
    resetAllStates();
    
    if (!serialInterval) {
        serialInterval = setInterval(() => {
            contadorUniversal++;
            console.log('El comando es: ', comando);
			switch (comando) {

				case 0x01:  //la variable comando esta inicializada como 0x01 entonces siempre entra a este case primero
					sendToModule({idDestino: 0x64,idPag,idOrigen:0x01,comando,data}) //mandamos al buddy el comando 0x01
					currentState = 'START'
					// finishPopupShown = false;
					clearFinishSchedule();
					console.log('el estado actual es: ', currentState);
					console.log('el comando actual es: ', comando);
					break;

				case 0x65: //buddy responde con el id
					console.log('el comando es: ',comando)
					//este contador lo usamos para el id de cada paquete
					
					if (comando == 0x65) {
						sendToModule({idDestino: 0x64,idPag:contadorUniversal,idOrigen:0x01,comando:0x02,data}); //enviamos el req de inicio
						currentState = 'WAIT_CONFIRMATION';
						
					}
					else {
						console.log("Intentado conectar...");
						sendToModule({idDestino:0x64, idPag: contadorUniversal, idOrigen:0x01, comando: 0x01, data})
					}
					console.log('el estado actual es: ', currentState);
					
					break;

				case 0x66: //recibimos el ack de el inicio con caga util 
					if (comando == 0x66 && data[0] != 0x71) { // 102
						sendToModule({idDestino:0x64,idPag:contadorUniversal,idOrigen:0x01,comando:0x03,data});
						currentState = 'WAIT_HANDS';
						console.log('el estado actual es: ', currentState);

						abrirPopup(); // Abrir popup para manos
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
					if (!flagSendData) {
						if (flagCambio || count<3) {
							data[0] = 0x71; // ack
							sendToModule({
								idDestino: 0x64,
								idPag: contadorUniversal,
								idOrigen: 0x01,
								comando: 0x66,
								data
							});
							flagCambio = false;
							count++;
						} else {
							sendToModule({
								idDestino: 0x64, 
								idPag: contadorUniversal,
								idOrigen: 0x01,
								comando: 0x04,
								data
							});
							flagCambio = true;
							count=0;
						}

						if (data[5] === 0x01) {
							currentState = 'SEND_DATA';
							flagSendData = true;
						}

					} else {
						if (currentState !== 'FINISH' && (sendDataFlag === true || data[5] === 0x01)) {
							processSensorData(data);
							sendToModule({
								idDestino: 0x64,
								idPag: contadorUniversal,
								idOrigen: 0x01,
								comando: 0x04,
								data
							});
						}
						scheduleFinishOnce();
					}
					break;


				case 0x68:
					if (currentState != 'FINISH' && (sendDataFlag == true || data[5] == 0x01)) {
						processSensorData(data);  
						sendToModule({ idDestino: 0x64, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x04, data });
					}

					const thisSession = window.sessionId;
					setTimeout(() => {
						// si la sesión cambió: ignorar
						if (thisSession !== window.sessionId) return;

						currentState = 'FINISH';
						sendToModule({ idDestino: 0x64, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x05, data });

						if (!flagCierroPopup) {
							flagCierroPopup = true;
							if (!window.finishPopupShown && typeof window.saveCharts === 'function') {
								window.finishPopupShown = true;
								window.saveCharts();
							}
						}

						// detener el loop de estados
						stopSerialLoop();
					}, 60000);


					break;

				
				default:
					// comando=0x01;
					break;

			}
        }, 500);
        console.log("▶️ Loop de estados reiniciado.");
    }
}

window.closeSerialConnection = async function closeSerialConnection() {
    try {
        stopSerialLoop(); // detener el loop si sigue corriendo
        if (serialReader) {
            await serialReader.cancel();
            serialReader.releaseLock();
            serialReader = null;
        }
        if (serialPort) {
            await serialPort.close();
            serialPort = null;
        }
        console.log("🔌 Conexión serial cerrada.");
    } catch (err) {
        console.error("❌ Error al cerrar la conexión serial:", err);
    }
};

function abrirPopup() {
  if (handsPopupOpen) return;               // no abrir de nuevo si ya está abierto
  if (!window.Swal) {                       // por si SweetAlert2 no está cargado
    console.warn('SweetAlert2 no está disponible');
    return;
  }

  handsPopupOpen = true;

  Swal.fire({
    title: "Poner bien las manos",
    text: "El pop-up se cerrará cuando pongas bien la mano.",
    icon: "info",
    showConfirmButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didClose: () => {
      handsPopupOpen = false;
      if (handsPopupIntervalId) {
        clearInterval(handsPopupIntervalId);
        handsPopupIntervalId = null;
      }
    }
  });

  // Poll: cerrar cuando la mano esté OK o si salimos de WAIT_HANDS
  handsPopupIntervalId = setInterval(() => {
    if (window.handsOk === true || currentState !== 'WAIT_HANDS') {
      Swal.close(); // dispara didClose arriba
    }
  }, 80);
}

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

				case 0x01:  //la variable comando esta inicializada como 0x01 entonces siempre entra a este case primero
					sendToModule({idDestino: 0x64,idPag,idOrigen:0x01,comando,data}) //mandamos al buddy el comando 0x01
					currentState = 'START'
					// finishPopupShown = false;
					clearFinishSchedule();
					console.log('el estado actual es: ', currentState);
					console.log('el comando actual es: ', comando);
					break;

				case 0x65: //buddy responde con el id
					console.log('el comando es: ',comando)
					//este contador lo usamos para el id de cada paquete
					
					if (comando == 0x65) {
						sendToModule({idDestino: 0x64,idPag:contadorUniversal,idOrigen:0x01,comando:0x02,data}); //enviamos el req de inicio
						currentState = 'WAIT_CONFIRMATION';
						
					}
					else {
						console.log("Intentado conectar...");
						sendToModule({idDestino:0x64, idPag: contadorUniversal, idOrigen:0x01, comando: 0x01, data})
					}
					console.log('el estado actual es: ', currentState);
					
					break;

				case 0x66: //recibimos el ack de el inicio con caga util 
					if (comando == 0x66 && data[0] != 0x71) { // 102
						sendToModule({idDestino:0x64,idPag:contadorUniversal,idOrigen:0x01,comando:0x03,data});
						currentState = 'WAIT_HANDS';
						console.log('el estado actual es: ', currentState);

						abrirPopup(); // Abrir popup para manos
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
					if (!flagSendData) {
						if (flagCambio || count<3) {
							data[0] = 0x71; // ack
							sendToModule({
								idDestino: 0x64,
								idPag: contadorUniversal,
								idOrigen: 0x01,
								comando: 0x66,
								data
							});
							flagCambio = false;
							count++;
						} else {
							sendToModule({
								idDestino: 0x64, 
								idPag: contadorUniversal,
								idOrigen: 0x01,
								comando: 0x04,
								data
							});
							flagCambio = true;
							count=0;
						}

						if (data[5] === 0x01) {
							currentState = 'SEND_DATA';
							flagSendData = true;
						}

					} else {
						if (currentState !== 'FINISH' && (sendDataFlag === true || data[5] === 0x01)) {
							processSensorData(data);
							sendToModule({
								idDestino: 0x64,
								idPag: contadorUniversal,
								idOrigen: 0x01,
								comando: 0x04,
								data
							});
						}
						scheduleFinishOnce();
					}
					break;


				case 0x68:
					if (currentState != 'FINISH' && (sendDataFlag == true || data[5] == 0x01)) {
						processSensorData(data);  
						sendToModule({ idDestino: 0x64, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x04, data });
					}

					const thisSession = window.sessionId;
					setTimeout(() => {
						// si la sesión cambió: ignorar
						if (thisSession !== window.sessionId) return;

						currentState = 'FINISH';
						sendToModule({ idDestino: 0x64, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x05, data });

						if (!flagCierroPopup) {
							flagCierroPopup = true;
							if (!window.finishPopupShown && typeof window.saveCharts === 'function') {
								window.finishPopupShown = true;
								window.saveCharts();
							}
						}

						// detener el loop de estados
						stopSerialLoop();
					}, 60000);
					break;

				
				default:
					// comando=0x01;
					break;

			}


		}, 500);


		alert('Conexión Serial establecida.');
		//openVisualizationPage();

	} catch (error) {
		console.error('Error en conexión Serial:', error);
		alert('No se pudo conectar al dispositivo Serial.');
	}
});

// Ensure manual finish clears timer and sends finish command once
const manualFinishButton = document.getElementById('saveButton');
if (manualFinishButton) manualFinishButton.addEventListener('click', () => {
    clearFinishSchedule();
    if (currentState !== 'FINISH') {
        currentState = 'FINISH';
        sendToModule({ idDestino: 0x64, idPag: contadorUniversal, idOrigen: 0x01, comando: 0x05, data });
    }
    if (!window.finishPopupShown && typeof window.saveCharts === 'function') {
        window.finishPopupShown = true;
        window.saveCharts();
    }
});
