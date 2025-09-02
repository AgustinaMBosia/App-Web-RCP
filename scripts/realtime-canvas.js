// Gráficos en tiempo real usando Canvas nativo - MÁXIMA VELOCIDAD
class RealtimeCanvas {
    constructor() {
        this.freqData = [];
        this.profData = [];
        this.maxPoints = 20; // Menos puntos = más rápido
        this.isPaused = false;
        
        this.setupCharts();
        this.setupMessageListener();
    }
    
    setupCharts() {
        // Gráfico de frecuencia
        this.freqCanvas = document.getElementById('freqChart');
        this.freqCtx = this.freqCanvas.getContext('2d');
        this.setupCanvas(this.freqCanvas, this.freqCtx);
        
        // Gráfico de profundidad
        this.profCanvas = document.getElementById('profChart');
        this.profCtx = this.profCanvas.getContext('2d');
        this.setupCanvas(this.profCanvas, this.profCtx);
        
        // Gráficos de estadísticas
        this.pieCanvas = document.getElementById('pieChart');
        this.pieCtx = this.pieCanvas.getContext('2d');
        this.setupCanvas(this.pieCanvas, this.pieCtx);
        
        this.handCanvas = document.getElementById('handPosChart');
        this.handCtx = this.handCanvas.getContext('2d');
        this.setupCanvas(this.handCanvas, this.handCtx);
        
        // Dibujar gráficos iniciales
        this.drawInitialCharts();
    }
    
    setupCanvas(canvas, ctx) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
    }
    
    drawInitialCharts() {
        this.drawFreqChart();
        this.drawProfChart();
        this.drawPieChart();
        this.drawHandChart();
    }
    
    setupMessageListener() {
        window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin && event.origin !== 'null') return;
            
            if (event.data && event.data.type === 'SENSOR_DATA') {
                this.processData(event.data.data);
            }
        });
        
        // También escuchar localStorage como fallback
        setInterval(() => {
            const dataLocal = localStorage.getItem('realTimeData') || '{}';
            try {
                const parsedData = JSON.parse(dataLocal);
                if (parsedData && Object.keys(parsedData).length > 0) {
                    this.processData(parsedData);
                }
            } catch (error) {
                // Ignorar errores
            }
        }, 100);
    }
    
    processData(data) {
        if (this.isPaused) return;
        
        const freq = data.freq || 0;
        const prof = data.profundidad || 0;
        const handPos = data.handPosition || 'NOK';
        
        // Agregar datos
        this.freqData.push(freq);
        this.profData.push(prof);
        
        // Mantener solo los últimos puntos
        if (this.freqData.length > this.maxPoints) {
            this.freqData.shift();
            this.profData.shift();
        }
        
        // Actualizar inmediatamente
        this.drawFreqChart();
        this.drawProfChart();
        this.drawPieChart();
        this.drawHandChart(handPos);
        
        // Actualizar texto
        this.updateText(data);
    }
    
    drawFreqChart() {
        const ctx = this.freqCtx;
        const canvas = this.freqCanvas;
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        
        // Limpiar
        ctx.clearRect(0, 0, width, height);
        
        // Fondo
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, width, height);
        
        // Título
        ctx.fillStyle = '#374151';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Frecuencia', width/2, 20);
        
        if (this.freqData.length < 2) {
            ctx.fillStyle = '#9ca3af';
            ctx.font = '12px Arial';
            ctx.fillText('Esperando datos...', width/2, height/2);
            return;
        }
        
        // Dibujar línea
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        
        const min = Math.min(...this.freqData);
        const max = Math.max(...this.freqData);
        const range = max - min || 1;
        
        const margin = 30;
        const chartWidth = width - 2 * margin;
        const chartHeight = height - 2 * margin;
        
        this.freqData.forEach((value, index) => {
            const x = margin + (index / (this.freqData.length - 1)) * chartWidth;
            const y = margin + chartHeight - ((value - min) / range) * chartHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Valor actual
        if (this.freqData.length > 0) {
            const currentValue = this.freqData[this.freqData.length - 1];
            ctx.fillStyle = '#3b82f6';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(currentValue.toString(), width - 10, height - 10);
        }
    }
    
    drawProfChart() {
        const ctx = this.profCtx;
        const canvas = this.profCanvas;
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        
        // Limpiar
        ctx.clearRect(0, 0, width, height);
        
        // Fondo
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, width, height);
        
        // Título
        ctx.fillStyle = '#374151';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Profundidad', width/2, 20);
        
        if (this.profData.length === 0) {
            ctx.fillStyle = '#9ca3af';
            ctx.font = '12px Arial';
            ctx.fillText('Esperando datos...', width/2, height/2);
            return;
        }
        
        // Dibujar barras
        const margin = 30;
        const chartWidth = width - 2 * margin;
        const chartHeight = height - 2 * margin;
        const barWidth = chartWidth / this.profData.length;
        
        const min = Math.min(...this.profData);
        const max = Math.max(...this.profData);
        const range = max - min || 1;
        
        ctx.fillStyle = '#ef4444';
        
        this.profData.forEach((value, index) => {
            const x = margin + index * barWidth;
            const barHeight = ((value - min) / range) * chartHeight;
            const y = margin + chartHeight - barHeight;
            
            ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
        });
        
        // Valor actual
        if (this.profData.length > 0) {
            const currentValue = this.profData[this.profData.length - 1];
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(currentValue.toString(), width - 10, height - 10);
        }
    }
    
    drawPieChart() {
        const ctx = this.pieCtx;
        const canvas = this.pieCanvas;
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        
        // Limpiar
        ctx.clearRect(0, 0, width, height);
        
        // Fondo
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, width, height);
        
        // Título
        ctx.fillStyle = '#374151';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Estadísticas', width/2, 20);
        
        if (this.freqData.length === 0) {
            ctx.fillStyle = '#9ca3af';
            ctx.font = '12px Arial';
            ctx.fillText('Esperando datos...', width/2, height/2);
            return;
        }
        
        // Calcular estadísticas
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 4;
        
        // Promedio de frecuencia
        const avgFreq = this.freqData.reduce((a, b) => a + b, 0) / this.freqData.length;
        
        // Color basado en el promedio
        let color = '#ef4444'; // Rojo
        if (avgFreq >= 100 && avgFreq <= 120) {
            color = '#10b981'; // Verde
        } else if (avgFreq >= 80 && avgFreq <= 140) {
            color = '#f59e0b'; // Amarillo
        }
        
        // Círculo con el promedio
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Texto del promedio
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(avgFreq).toString(), centerX, centerY + 5);
        
        // Texto descriptivo
        ctx.fillStyle = '#374151';
        ctx.font = '10px Arial';
        ctx.fillText('Promedio Frec.', centerX, height - 15);
    }
    
    drawHandChart(handPos = 'NOK') {
        const ctx = this.handCtx;
        const canvas = this.handCanvas;
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        
        // Limpiar
        ctx.clearRect(0, 0, width, height);
        
        // Fondo
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, width, height);
        
        // Título
        ctx.fillStyle = '#374151';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Posición Manos', width/2, 20);
        
        // Círculo de estado
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 4;
        
        ctx.fillStyle = handPos === 'OK' ? '#10b981' : '#ef4444';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Texto del estado
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(handPos, centerX, centerY + 4);
        
        // Contador de datos
        ctx.fillStyle = '#374151';
        ctx.font = '10px Arial';
        ctx.fillText(`Datos: ${this.freqData.length}`, width/2, height - 10);
    }
    
    updateText(data) {
        const element = document.getElementById('receivedData');
        if (element) {
            element.innerHTML = `
                <strong>Datos en Tiempo Real:</strong><br>
                Posición: ${data.handPosition}<br>
                Profundidad: ${data.profundidad}<br>
                Frecuencia: ${data.freq}
            `;
        }
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
    }
    
    reset() {
        this.freqData = [];
        this.profData = [];
        this.drawInitialCharts();
    }
}

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    // Remover Chart.js si existe
    const chartScript = document.querySelector('script[src*="chart.umd.js"]');
    if (chartScript) {
        chartScript.remove();
    }
    
    // Inicializar gráficos en tiempo real
    window.realtimeCanvas = new RealtimeCanvas();
    
    console.log('🚀 Gráficos en tiempo real iniciados');
});

console.log('🔧 Script de gráficos en tiempo real cargado'); 