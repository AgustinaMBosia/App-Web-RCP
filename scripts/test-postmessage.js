// Script de prueba para verificar la comunicación postMessage
// Este archivo se puede usar para probar la comunicación entre ventanas

function testPostMessageCommunication() {
    console.log('🧪 Iniciando prueba de comunicación postMessage...');
    
    // Simular datos de sensor
    const testData = {
        handPosition: 'OK',
        profundidad: 5,
        freq: 110
    };
    
    // Enviar mensaje de prueba
    if (window.opener) {
        window.opener.postMessage({
            type: 'SENSOR_DATA',
            data: testData,
            timestamp: new Date().toISOString()
        }, '*');
        console.log('✅ Mensaje de prueba enviado a la ventana padre');
    } else {
        console.log('❌ No se encontró ventana padre para enviar mensaje');
    }
}

// Función para recibir mensajes de prueba
function setupTestListener() {
    window.addEventListener('message', (event) => {
        console.log('📨 Mensaje recibido:', event.data);
        
        if (event.data && event.data.type === 'SENSOR_DATA') {
            console.log('✅ Datos de sensor recibidos correctamente:', event.data.data);
        }
    });
    
    console.log('👂 Listener de mensajes configurado');
}

// Exportar funciones para uso en consola
window.testPostMessageCommunication = testPostMessageCommunication;
window.setupTestListener = setupTestListener;

console.log('🔧 Script de prueba postMessage cargado');
console.log('💡 Usa testPostMessageCommunication() para enviar datos de prueba');
console.log('💡 Usa setupTestListener() para configurar el listener'); 