document.addEventListener('DOMContentLoaded', () => {
    const receivedDataElement = document.getElementById('receivedData');
    const freqCtx = document.getElementById('freqChart').getContext('2d');
    const profCtx = document.getElementById('profChart').getContext('2d');
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    const handPosCtx = document.getElementById('handPosChart').getContext('2d');

    let correctExecutions = 0;
    let incorrectExecutions = 0;

    const freqIdealMin = 100;
    const freqIdealMax = 120;
    const profIdealMin = 5;
    const profIdealMax = 6;

    let globalCounter = 0;

    const freqData = {
        labels: [],
        datasets: [
            {
                label: 'Frecuencia',
                data: [],
                borderColor: 'blue',
                fill: false,
                tension: 0.1,
            },
        ],
    };

    const profData = {
        labels: [],
        datasets: [
            {
                label: 'Profundidad',
                data: [],
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
            },
        ],
    };

    const pieData = {
        labels: ['Ejecucion Correcta', 'E. Incorrecta'],
        datasets: [
            {
                data: [0, 0],
                backgroundColor: ['green', 'red'],
            },
        ],
    };

    const handPosData = {
        labels: ['Posicion de manos OK', 'No OK'],
        datasets: [
            {
                data: [1, 0], // Por defecto: OK
                backgroundColor: ['green', 'red'],
            },
        ],
    };

    // Plugin para sombrear el rango ideal
    const rangePlugin = {
        id: 'rangePlugin',
        beforeDraw(chart) {
            const ctx = chart.ctx;
            const yScale = chart.scales.y;

            if (chart.canvas.id === 'freqChart') {
                const yMin = yScale.getPixelForValue(freqIdealMin);
                const yMax = yScale.getPixelForValue(freqIdealMax);
                ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                ctx.fillRect(chart.chartArea.left, yMax, chart.chartArea.width, yMin - yMax);
            }

            if (chart.canvas.id === 'profChart') {
                const yMin = yScale.getPixelForValue(profIdealMin);
                const yMax = yScale.getPixelForValue(profIdealMax);
                ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                ctx.fillRect(chart.chartArea.left, yMax, chart.chartArea.width, yMin - yMax);
            }
        },
    };

    const freqChart = new Chart(freqCtx, {
        type: 'line',
        data: freqData,
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
            },
        },
        plugins: [rangePlugin],
    });

    const profChart = new Chart(profCtx, {
        type: 'bar',
        data: profData,
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
            },
        },
        plugins: [rangePlugin],
    });

    const pieChart = new Chart(pieCtx, {
        type: 'pie',
        data: pieData,
    });

    const handPosChart = new Chart(handPosCtx, {
        type: 'doughnut',
        data: handPosData,
    });

    function updateVisualization(data) {
        try {
            const parsedData = JSON.parse(data);

            // Datos actuales
            const freq = parsedData.freq || 0;
            const prof = parsedData.profundidad || 0;
            const handPos = parsedData.handPosition || 'N/A';

            // Incrementa el contador global
            globalCounter++;

            // Gestión de etiquetas para mostrar los últimos 7 datos
            if (freqData.labels.length >= 7) {
                freqData.labels.shift();
                freqData.datasets[0].data.shift();

                profData.labels.shift();
                profData.datasets[0].data.shift();
            }

            // Agrega al gráfico la etiqueta del contador global
            freqData.labels.push(globalCounter);
            profData.labels.push(globalCounter);

            // Agrega datos reales
            freqData.datasets[0].data.push(freq);
            profData.datasets[0].data.push(prof);

            // Actualización de ejecución correcta/incorrecta
            const isFreqCorrect = freq >= freqIdealMin && freq <= freqIdealMax;
            const isProfCorrect = prof >= profIdealMin && prof <= profIdealMax;
            const isHandOK = handPos === 'OK';

            if (isFreqCorrect && isProfCorrect && isHandOK) {
                correctExecutions++;
            } else {
                incorrectExecutions++;
            }

            pieData.datasets[0].data = [correctExecutions, incorrectExecutions];

            // Actualización de posición de manos
            handPosData.datasets[0].data = isHandOK ? [1, 0] : [0, 1];

            // Actualizar gráficos
            freqChart.update();
            profChart.update();
            pieChart.update();
            handPosChart.update();

            // Mostrar datos recibidos
            receivedDataElement.innerHTML = `
                <strong>Datos Recibidos:</strong><br>
                Posición de la Mano: ${handPos}<br>
                Profundidad: ${prof}<br>
                Frecuencia: ${freq}
            `;
        } catch (error) {
            console.error('Error al procesar los datos:', error);
            receivedDataElement.innerHTML = 'Error al mostrar los datos.';
        }
    }

    setInterval(() => {
        const data = localStorage.getItem('realTimeData') || '{}';
        updateVisualization(data);
    }, 1000);
});
