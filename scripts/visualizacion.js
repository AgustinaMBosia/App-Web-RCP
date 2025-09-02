document.addEventListener('DOMContentLoaded', () => {
	const receivedDataElement = document.getElementById('receivedData');
	const freqCanvas = document.getElementById('freqChart');
	const profCanvas = document.getElementById('profChart');
	const pieCanvas = document.getElementById('pieChart');
	const handPosCanvas = document.getElementById('handPosChart');

	if (!freqCanvas || !profCanvas || !pieCanvas || !handPosCanvas) {
		return;
	}

	const freqCtx = freqCanvas.getContext('2d');
	const profCtx = profCanvas.getContext('2d');
	const pieCtx = pieCanvas.getContext('2d');
	const handPosCtx = handPosCanvas.getContext('2d');

	const playStopButton = document.getElementById('playStopButton');
	const resetButton = document.getElementById('resetButton');
	const saveButton = document.getElementById('saveButton');

	const fullFreqData = [];
	const fullProfData = [];
	const fullLabels = [];

	let recordedData = [];
	const handPositionHistory = [];

	let correctExecutions = 0;
	let incorrectExecutions = 0;
	let globalCounter = 0;
	let isPaused = false;
	let startTracking = false;

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

	function downloadCSV() {
		if (recordedData.length === 0) return;

		const header = "Timestamp,Frecuencia,Profundidad,PosicionMano\n";
		const rows = recordedData.map(row =>
			`${row.timestamp},${row.frecuencia},${row.profundidad},${row.posicionMano}`
		);

		const csvContent = header + rows.join("\n");
		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);

		const link = document.createElement("a");
		link.href = url;
		link.setAttribute("download", `maniobra_${new Date().toISOString()}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	function resetCharts() {
		globalCounter = 0;
		correctExecutions = 0;
		incorrectExecutions = 0;
		fullFreqData.length = 0;
		fullProfData.length = 0;
		fullLabels.length = 0;

		freqData.labels = [];
		freqData.datasets.forEach(dataset => dataset.data = []);

		profData.labels = [];
		profData.datasets.forEach(dataset => dataset.data = []);

		pieData.datasets[0].data = [0, 0];
		handPosData.datasets[0].data = [1, 0];
		startTracking = false;
		handPositionHistory.length = 0;
		recordedData.length = 0;

		updateCharts();
	}

	function saveCharts() {
		downloadCSV();

		const correct = pieData.datasets[0].data[0];
		const incorrect = pieData.datasets[0].data[1];
		const total = correct + incorrect;
		const percentage = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;

		const handOKCount = handPositionHistory.filter(pos => pos === 'OK').length;
		const handNotOKCount = handPositionHistory.length - handOKCount;

		const handSummaryData = {
			labels: ['Posición de manos OK', 'No OK'],
			datasets: [{
				data: [handOKCount, handNotOKCount],
				backgroundColor: ['green', 'red']
			}]
		};

		Swal.fire({
			title: 'Datos guardados correctamente',
			html: `
				<p><strong>Porcentaje de ejecuciones correctas:</strong> ${percentage}%</p>
				<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
					<canvas id="piePreview" width="200" height="200"></canvas>
					<canvas id="handPosPreview" width="200" height="200"></canvas>
					<canvas id="freqPreview" width="300" height="150"></canvas>
					<canvas id="profPreview" width="300" height="150"></canvas>
				</div>
			`,
			width: 800,
			showConfirmButton: true,
			showDenyButton: true,
			confirmButtonText: 'Nueva Maniobra',
			denyButtonText: 'Cerrar',
			didOpen: () => {
				new Chart(document.getElementById('piePreview').getContext('2d'), {
					type: 'pie',
					data: pieData,
					options: { responsive: false }
				});
				new Chart(document.getElementById('handPosPreview').getContext('2d'), {
					type: 'pie',
					data: handSummaryData,
					options: { responsive: false }
				});
				new Chart(document.getElementById('freqPreview').getContext('2d'), {
					type: 'line',
					data: {
						labels: fullLabels,
						datasets: [{
							label: 'Frecuencia',
							data: fullFreqData,
							borderColor: 'blue',
							fill: false,
							tension: 0.1
						}]
					},
					options: { responsive: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
				});
				new Chart(document.getElementById('profPreview').getContext('2d'), {
					type: 'bar',
					data: {
						labels: fullLabels,
						datasets: [{
							label: 'Profundidad',
							data: fullProfData,
							backgroundColor: 'rgba(255, 99, 132, 0.5)',
						}]
					},
					options: { responsive: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
				});
			}
		}).then((result) => {
			if (result.isConfirmed) {
				resetCharts();
			}
		});
	}

	function toggleCharts() {
		isPaused = !isPaused;
		if (playStopButton) playStopButton.textContent = isPaused ? "⏵ Play" : "⏸ Pause";
	}

	if (playStopButton) playStopButton.addEventListener('click', toggleCharts);
	if (resetButton) resetButton.addEventListener('click', resetCharts);
	if (saveButton) saveButton.addEventListener('click', saveCharts);

	function handleDataForVisualization(parsedData) {
		if (isPaused) return;

		const freq = parsedData.freq || 0;
		const prof = parsedData.profundidad || 0;
		const handPos = parsedData.handPosition || 'N/A';

		if (handPos === "OK") {
			startTracking = true;
		}
		if (!startTracking) {
			return;
		}

		globalCounter++;

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

		fullLabels.push(globalCounter);
		fullFreqData.push(freq);
		fullProfData.push(prof);

		recordedData.push({
			timestamp: new Date().toISOString(),
			frecuencia: freq,
			profundidad: prof,
			posicionMano: handPos
		});

		const isFreqCorrect = freq >= freqIdealMin && freq <= freqIdealMax;
		const isProfCorrect = prof >= profIdealMin && prof <= profIdealMax;
		const isHandOK = handPos === 'OK';
		handPositionHistory.push(handPos);

		if (isFreqCorrect && isProfCorrect && isHandOK) {
			correctExecutions++;
		} else {
			incorrectExecutions++;
		}

		pieData.datasets[0].data = [correctExecutions, incorrectExecutions];
		handPosData.datasets[0].data = isHandOK ? [1, 0] : [0, 1];

		updateCharts();

		if (receivedDataElement) {
			receivedDataElement.innerHTML = `
				<strong>Datos Recibidos:</strong><br>
				Posición de la Mano: ${handPos}<br>
				Profundidad: ${prof}<br>
				Frecuencia: ${freq}
			`;
		}
	}

	// Expose global function for direct calls from other scripts
	window.updateVisualization = function updateVisualization(data) {
		try {
			let parsedData = data;
			if (typeof data === 'string') {
				parsedData = JSON.parse(data);
			}
			handleDataForVisualization(parsedData);
		} catch (error) {
			console.error('Error al procesar los datos:', error);
			if (receivedDataElement) receivedDataElement.innerHTML = 'Error al mostrar los datos.';
		}
	};
});
