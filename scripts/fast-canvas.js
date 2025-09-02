// Gráficos ultra-rápidos usando Canvas nativo
class FastCanvas {
    constructor(canvasId, type = 'line') {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.type = type;
        this.data = [];
        this.maxPoints = 50;
        this.colors = {
            line: '#3b82f6',
            background: '#f8fafc',
            grid: '#e2e8f0'
        };
        
        this.setupCanvas();
    }
    
    setupCanvas() {
        // Configurar canvas para alta resolución
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }
    
    addData(value) {
        this.data.push(value);
        if (this.data.length > this.maxPoints) {
            this.data.shift();
        }
        this.draw();
    }
    
    draw() {
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        // Limpiar canvas
        this.ctx.clearRect(0, 0, width, height);
        
        if (this.data.length < 2) return;
        
        // Encontrar min/max para escalado
        const min = Math.min(...this.data);
        const max = Math.max(...this.data);
        const range = max - min || 1;
        
        // Configurar estilo
        this.ctx.strokeStyle = this.colors.line;
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        if (this.type === 'line') {
            this.drawLine(width, height, min, range);
        } else if (this.type === 'bar') {
            this.drawBars(width, height, min, range);
        }
    }
    
    drawLine(width, height, min, range) {
        this.ctx.beginPath();
        
        this.data.forEach((value, index) => {
            const x = (index / (this.data.length - 1)) * width;
            const y = height - ((value - min) / range) * height;
            
            if (index === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        });
        
        this.ctx.stroke();
    }
    
    drawBars(width, height, min, range) {
        const barWidth = width / this.data.length;
        
        this.data.forEach((value, index) => {
            const x = index * barWidth;
            const barHeight = ((value - min) / range) * height;
            const y = height - barHeight;
            
            this.ctx.fillStyle = this.colors.line;
            this.ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
        });
    }
    
    clear() {
        this.data = [];
        this.draw();
    }
}

// Inicializar gráficos rápidos
document.addEventListener('DOMContentLoaded', () => {
    // Crear gráficos rápidos si no hay Chart.js
    if (typeof Chart === 'undefined') {
        console.log('🚀 Usando gráficos Canvas nativos para máxima velocidad');
        
        window.fastFreqChart = new FastCanvas('freqChart', 'line');
        window.fastProfChart = new FastCanvas('profChart', 'bar');
        
        // Función para actualizar gráficos rápidos
        window.updateFastCharts = (freq, prof) => {
            if (window.fastFreqChart) window.fastFreqChart.addData(freq);
            if (window.fastProfChart) window.fastProfChart.addData(prof);
        };
    }
});

console.log('🔧 Gráficos rápidos Canvas cargados'); 