// Web Worker para procesamiento de datos en tiempo real
// Este worker se ejecuta en un hilo separado para no bloquear la UI

let dataBuffer = [];
let processingInterval = null;

// Configuración ULTRA RÁPIDA de procesamiento
const PROCESSING_CONFIG = {
    batchSize: 1, // Procesar inmediatamente cada dato
    maxBufferSize: 10, // Buffer mínimo para evitar pérdida
    processingInterval: 1 // Procesamiento inmediato
};

// Función para procesar datos inmediatamente
function processDataBatch() {
    if (dataBuffer.length === 0) return;
    
    // Procesar inmediatamente el dato más reciente
    const latestData = dataBuffer.pop();
    
    // Limpiar buffer para mantener solo datos recientes
    if (dataBuffer.length > 2) {
        dataBuffer = dataBuffer.slice(-2);
    }
    
    // Enviar dato procesado inmediatamente al hilo principal
    self.postMessage({
        type: 'PROCESSED_DATA',
        data: [latestData],
        timestamp: performance.now()
    });
}

// Función para limpiar buffer si está muy lleno
function cleanBuffer() {
    if (dataBuffer.length > PROCESSING_CONFIG.maxBufferSize) {
        // Mantener solo los datos más recientes
        dataBuffer = dataBuffer.slice(-PROCESSING_CONFIG.maxBufferSize);
    }
}

// Escuchar mensajes del hilo principal
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SENSOR_DATA':
            // Agregar datos al buffer
            dataBuffer.push({
                ...data,
                receivedAt: performance.now()
            });
            
            cleanBuffer();
            
            // Iniciar procesamiento si no está activo
            if (!processingInterval) {
                processingInterval = setInterval(processDataBatch, PROCESSING_CONFIG.processingInterval);
            }
            break;
            
        case 'START_PROCESSING':
            if (!processingInterval) {
                processingInterval = setInterval(processDataBatch, PROCESSING_CONFIG.processingInterval);
            }
            break;
            
        case 'STOP_PROCESSING':
            if (processingInterval) {
                clearInterval(processingInterval);
                processingInterval = null;
            }
            break;
            
        case 'CLEAR_BUFFER':
            dataBuffer = [];
            break;
            
        case 'GET_STATUS':
            self.postMessage({
                type: 'STATUS',
                data: {
                    bufferSize: dataBuffer.length,
                    isProcessing: !!processingInterval,
                    config: PROCESSING_CONFIG
                }
            });
            break;
    }
});

// Notificar que el worker está listo
self.postMessage({
    type: 'WORKER_READY',
    timestamp: performance.now()
});

console.log('🔧 Data Processor Worker iniciado'); 