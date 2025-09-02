// Monitor de rendimiento elegante para visualización en tiempo real
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            messageCount: 0,
            lastMessageTime: 0,
            averageLatency: 0,
            fps: 0
        };
        
        this.latencyHistory = [];
        this.maxHistorySize = 50;
        this.isVisible = true;
        
        this.setupMonitoring();
    }
    
    setupMonitoring() {
        this.createMetricsDisplay();
        this.monitorFPS();
        this.interceptMessages();
    }
    
    createMetricsDisplay() {
        const container = document.createElement('div');
        container.id = 'performance-monitor';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            z-index: 1000;
            min-width: 160px;
            transition: all 0.3s ease;
            cursor: pointer;
        `;
        
        // Hacer que se pueda ocultar/mostrar
        container.addEventListener('click', () => {
            this.toggleVisibility();
        });
        
        document.body.appendChild(container);
        this.metricsElement = container;
    }
    
    toggleVisibility() {
        this.isVisible = !this.isVisible;
        if (this.isVisible) {
            this.metricsElement.style.opacity = '1';
            this.metricsElement.style.transform = 'scale(1)';
        } else {
            this.metricsElement.style.opacity = '0.3';
            this.metricsElement.style.transform = 'scale(0.9)';
        }
    }
    
    monitorFPS() {
        let lastTime = performance.now();
        
        const measureFPS = () => {
            const currentTime = performance.now();
            const deltaTime = currentTime - lastTime;
            
            if (deltaTime > 0) {
                this.metrics.fps = Math.round(1000 / deltaTime);
            }
            
            lastTime = currentTime;
            this.updateDisplay();
            requestAnimationFrame(measureFPS);
        };
        
        requestAnimationFrame(measureFPS);
    }
    
    interceptMessages() {
        const originalAddEventListener = window.addEventListener;
        
        window.addEventListener = (type, listener, options) => {
            if (type === 'message') {
                const wrappedListener = (event) => {
                    if (event.data && event.data.type === 'SENSOR_DATA') {
                        this.recordMessage(event.data);
                    }
                    listener(event);
                };
                
                originalAddEventListener.call(this, type, wrappedListener, options);
            } else {
                originalAddEventListener.call(this, type, listener, options);
            }
        };
    }
    
    recordMessage(messageData) {
        const currentTime = performance.now();
        const messageTime = new Date(messageData.timestamp).getTime();
        const latency = currentTime - messageTime;
        
        this.metrics.messageCount++;
        this.metrics.lastMessageTime = currentTime;
        
        this.latencyHistory.push(latency);
        if (this.latencyHistory.length > this.maxHistorySize) {
            this.latencyHistory.shift();
        }
        
        this.metrics.averageLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    }
    
    updateDisplay() {
        if (!this.metricsElement) return;
        
        const getStatusColor = (value, thresholds) => {
            if (value >= thresholds.good) return '#10b981';
            if (value >= thresholds.warning) return '#f59e0b';
            return '#ef4444';
        };
        
        const fpsColor = getStatusColor(this.metrics.fps, { good: 50, warning: 30 });
        const latencyColor = getStatusColor(this.metrics.averageLatency, { good: 50, warning: 100 });
        
        this.metricsElement.innerHTML = `
            <div style="margin-bottom: 12px; font-weight: 600; color: #1f2937; font-size: 14px;">
                ⚡ Rendimiento
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #6b7280;">FPS</span>
                <span style="color: ${fpsColor}; font-weight: 500;">${this.metrics.fps}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #6b7280;">Latencia</span>
                <span style="color: ${latencyColor}; font-weight: 500;">${this.metrics.averageLatency.toFixed(1)}ms</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #6b7280;">Mensajes</span>
                <span style="color: #374151; font-weight: 500;">${this.metrics.messageCount}</span>
            </div>
            <div style="font-size: 11px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px;">
                Click para ocultar
            </div>
        `;
    }
    
    getMetrics() {
        return { ...this.metrics };
    }
    
    reset() {
        this.metrics.messageCount = 0;
        this.latencyHistory = [];
        this.metrics.averageLatency = 0;
    }
}

// Inicializar monitor cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    window.performanceMonitor = new PerformanceMonitor();
    
    // Botón de reset elegante
    const resetButton = document.createElement('button');
    resetButton.innerHTML = '🔄';
    resetButton.title = 'Resetear métricas';
    resetButton.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        z-index: 1000;
        width: 40px;
        height: 40px;
        background: rgba(255, 255, 255, 0.95);
        color: #6b7280;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(10px);
        transition: all 0.2s ease;
    `;
    
    resetButton.addEventListener('mouseenter', () => {
        resetButton.style.transform = 'scale(1.1)';
        resetButton.style.background = 'rgba(255, 255, 255, 1)';
    });
    
    resetButton.addEventListener('mouseleave', () => {
        resetButton.style.transform = 'scale(1)';
        resetButton.style.background = 'rgba(255, 255, 255, 0.95)';
    });
    
    resetButton.addEventListener('click', () => {
        window.performanceMonitor.reset();
    });
    
    document.body.appendChild(resetButton);
});

console.log('🔧 Monitor de rendimiento elegante cargado'); 