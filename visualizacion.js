document.addEventListener('DOMContentLoaded', () => {
    const receivedDataElement = document.getElementById('receivedData');
    const freqCtx = document.getElementById('freqChart').getContext('2d');
    const profCtx = document.getElementById('profChart').getContext('2d');
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    const handPosCtx = document.getElementById('handPosChart').getContext('2d');

    let correctExecutions = 0;
    let incorrectExecutions = 0;

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
            {
                label: 'Rango Ideal',
                data: [],
                backgroundColor: 'rgba(0, 255, 0, 0.2)',
                borderWidth: 0,
                type: 'bar',
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
            {
                label: 'Rango Ideal',
                data: [],
                backgroundColor: 'rgba(0, 255, 0, 0.2)',
                borderWidth: 0,
            },
        ],
    };

    const pieData = {
        labels: ['Correcta', 'Incorrecta'],
        datasets: [
            {
                data: [0, 0],
                backgroundColor: ['green', 'red'],
            },
        ],
    };

    const handPosData = {
        labels: ['OK', 'NOK'],
        datasets: [
            {
                data: [1, 0], // Por defecto: OK
                backgroundColor: ['green', 'red'],
            },
        ],
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
    });

    const pieChart = new Chart(pieCtx, {
        type: 'pie',
        data: pieData,
    });

    const handPosChart = new Chart(handPosCtx, {
        type: 'doughnut',
        data: handPosData,
    });

    let globalCounter = 0; // Contador global que no se reinicia

function updateVisualization(data) {
    try {
        const parsedData = JSON.parse(data);

        // Datos actuales
        const freq = parsedData.freq || 0;
        const prof = parsedData.profundidad || 0;
        const handPos = parsedData.handPosition || 'N/A';

        // Rango ideal
        const freqIdealMin = 80;
        const freqIdealMax = 120;
        const profIdealMin = 30;
        const profIdealMax = 50;

        // Incrementa el contador global
        globalCounter++;

        // Gestión de etiquetas para mostrar los últimos 7 datos
        if (freqData.labels.length >= 7) {
            // Mantén solo los últimos 7 datos
            freqData.labels.shift();
            freqData.datasets[0].data.shift();
            freqData.datasets[1].data.shift();

            profData.labels.shift();
            profData.datasets[0].data.shift();
            profData.datasets[1].data.shift();
        }

        // Agrega al gráfico la etiqueta del contador global
        freqData.labels.push(globalCounter);
        profData.labels.push(globalCounter);

        // Agrega datos reales
        freqData.datasets[0].data.push(freq);
        profData.datasets[0].data.push(prof);

        // Agrega rango ideal
        freqData.datasets[1].data.push((freqIdealMax + freqIdealMin) / 2);
        profData.datasets[1].data.push((profIdealMax + profIdealMin) / 2);

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
