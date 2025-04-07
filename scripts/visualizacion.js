document.addEventListener('DOMContentLoaded', () => {
    const receivedDataElement = document.getElementById('receivedData');
    const freqCtx = document.getElementById('freqChart').getContext('2d');
    const profCtx = document.getElementById('profChart').getContext('2d');
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    const handPosCtx = document.getElementById('handPosChart').getContext('2d');

    const playStopButton = document.getElementById('playStopButton');
    const resetButton = document.getElementById('resetButton');
    const saveButton = document.getElementById('saveButton');

    let correctExecutions = 0;
    let incorrectExecutions = 0;
    let globalCounter = 0;
    let isPaused = false;
    
    const freqIdealMin = 100;
    const freqIdealMax = 120;
    const profIdealMin = 5;
    const profIdealMax = 6;

    const freqData = {
        labels: [],
        datasets: [{
            label: 'Frecuencia',
            data: [],
            borderColor: 'blue',
            fill: false,
            tension: 0.1,
        }]
    };

    const profData = {
        labels: [],
        datasets: [{
            label: 'Profundidad',
            data: [],
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
        }]
    };

    const pieData = {
        labels: ['Ejecución Correcta', 'E. Incorrecta'],
        datasets: [{
            data: [0, 0],
            backgroundColor: ['green', 'red'],
        }]
    };

    const handPosData = {
        labels: ['Posición de manos OK', 'No OK'],
        datasets: [{
            data: [1, 0],
            backgroundColor: ['green', 'red'],
        }]
    };

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
        }
    };

    const freqChart = new Chart(freqCtx, {
        type: 'line',
        data: freqData,
        options: { responsive: true, plugins: { legend: { position: 'top' } } },
        plugins: [rangePlugin]
    });

    const profChart = new Chart(profCtx, {
        type: 'bar',
        data: profData,
        options: { responsive: true, plugins: { legend: { position: 'top' } } },
        plugins: [rangePlugin]
    });

    const pieChart = new Chart(pieCtx, { type: 'pie', data: pieData });
    const handPosChart = new Chart(handPosCtx, { type: 'doughnut', data: handPosData });

    function updateCharts() {
        if (!isPaused) {
            freqChart.update();
            profChart.update();
            pieChart.update();
            handPosChart.update();
        }
    }

    let startTracking = false; // No empezar hasta que la mano esté en "OK"

    function updateVisualization(data) {
        if (isPaused) return; // Ignorar datos mientras está en pausa


        try {
            const parsedData = JSON.parse(data);
            const freq = parsedData.freq || 0;
            const prof = parsedData.profundidad || 0;
            const handPos = parsedData.handPosition || 'N/A';

            // Si la posición de manos es "OK", permitimos el registro de datos
            if (handPos === "OK") {
                startTracking = true;
            }

            // Si aún no se ha detectado "OK", ignoramos los datos
            if (!startTracking) {
                console.warn("Esperando que la posición de manos sea 'OK' para empezar.");
                return;
            }

            globalCounter++; // Se incrementa solo si no está en pausa

            if (freqData.labels.length >= 7) {
                freqData.labels.shift();
                freqData.datasets[0].data.shift();
                profData.labels.shift();
                profData.datasets[0].data.shift();
            }

            freqData.labels.push(globalCounter);
            profData.labels.push(globalCounter);
            freqData.datasets[0].data.push(freq);
            profData.datasets[0].data.push(prof);

            const isFreqCorrect = freq >= freqIdealMin && freq <= freqIdealMax;
            const isProfCorrect = prof >= profIdealMin && prof <= profIdealMax;
            const isHandOK = handPos === 'OK';

            if (isFreqCorrect && isProfCorrect && isHandOK) {
                correctExecutions++;
            } else {
                incorrectExecutions++;
            }

            pieData.datasets[0].data = [correctExecutions, incorrectExecutions];
            handPosData.datasets[0].data = isHandOK ? [1, 0] : [0, 1];

            updateCharts();

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


    function resetCharts() {
        globalCounter = 0;
        correctExecutions = 0;
        incorrectExecutions = 0;

        freqData.labels = [];
        freqData.datasets.forEach(dataset => dataset.data = []);

        profData.labels = [];
        profData.datasets.forEach(dataset => dataset.data = []);

        pieData.datasets[0].data = [0, 0];
        handPosData.datasets[0].data = [1, 0];

        startTracking = false;

        localStorage.setItem("serialCommand", "reiniciar");
        updateCharts();
    }

    function saveCharts() {
        const data = {
            freq: freqData,
            prof: profData,
            pie: pieData,
            handPos: handPosData,
        };

        localStorage.setItem('realTimeData', JSON.stringify(data));
        localStorage.setItem("serialCommand", "terminar");
        alert('Datos guardados correctamente.');
    }

    function toggleCharts() {
        isPaused = !isPaused;
        playStopButton.textContent = isPaused ? "⏵ Play" : "⏸ Pause";
    }

    playStopButton.addEventListener('click', toggleCharts);
    resetButton.addEventListener('click', resetCharts);
    saveButton.addEventListener('click', saveCharts);

    setInterval(() => {
        const data = localStorage.getItem('realTimeData') || '{}';
        updateVisualization(data);
    }, 1000);

    startTracking = false; // Variable que controlará el cierre del pop-up

    function abrirPopup() {
        Swal.fire({
            title: "Esperando...",
            text: "El pop-up se cerrará cuando ponga bien la mano.",
            icon: "info",
            showConfirmButton: false
        });

        // Revisar periódicamente si cerrarPopup es true
        const checkVariable = setInterval(() => {
            if (startTracking) {
                Swal.close(); // Cierra el pop-up
                clearInterval(checkVariable); // Detiene el intervalo
            }
        }, 500); // Revisa cada 500ms
    }

    function cerrarVariable() {
        startTracking = true; // Cambia la variable y cierra el pop-up
    }

    // Abre el pop-up automáticamente al cargar la página
    window.onload = function() {
        abrirPopup();
    };
});
