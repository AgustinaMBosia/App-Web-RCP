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

	const profColors = [];

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
	const profIdealMin = 50;
	const profIdealMax = 60;

	const MAX_CSV_FILES = 100;
	let savedFiles = [];
	let savedDirHandle = null;

	// ========== CREAR INDICADORES DE DATOS ==========
	function createDataBadge(canvasElement, badgeId) {
		const container = canvasElement.parentElement;
		
		const badge = document.createElement('div');
		badge.id = badgeId;
		badge.style.cssText = `
			display: block;
			margin: 0 auto 10px auto;
			background: linear-gradient(135deg, #667eea 0%, #667eea 100%);
			color: white;
			padding: 8px 14px;
			border-radius: 8px;
			font-size: 14px;
			font-weight: bold;
			box-shadow: 0 4px 15px rgba(0,0,0,0.2);
			transition: all 0.3s ease;
			min-width: 80px;
			max-width: fit-content;
			text-align: center;
		`;
		badge.innerHTML = `<span>--</span>`;
		container.insertBefore(badge, canvasElement);
		return badge;
	}

	// Crear badges para cada gráfico
	const freqBadge = createDataBadge(freqCanvas, 'freqBadge');
	const profBadge = createDataBadge(profCanvas, 'profBadge');
	const pieBadge = createDataBadge(pieCanvas, 'pieBadge');
	const handPosBadge = createDataBadge(handPosCanvas, 'handPosBadge');

	// Función para actualizar los badges con animación
	function updateBadge(badge, value, unit, isCorrect) {
		badge.innerHTML = `<span>${value} ${unit}</span>`;
		
		if (isCorrect === true) {
			badge.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
		} else if (isCorrect === false) {
			badge.style.background = 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)';
		} else {
			badge.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
		}
		
		badge.style.transform = 'scale(1.1)';
		setTimeout(() => {
			badge.style.transform = 'scale(1)';
		}, 150);
	}

	function updateHandPosBadge(badge, handPos) {
		const isOK = handPos === 'OK';
		badge.innerHTML = `<span>Manos: ${handPos}</span>`;
		badge.style.background = isOK 
			? 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
			: 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)';
		
		badge.style.transform = 'scale(1.1)';
		setTimeout(() => {
			badge.style.transform = 'scale(1)';
		}, 150);
	}

	function updatePieBadge(badge, correct, incorrect) {
		const total = correct + incorrect;
		const percentage = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;
		badge.innerHTML = `<span>${percentage}%</span>`;
		
		if (percentage >= 80) {
			badge.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
		} else if (percentage >= 50) {
			badge.style.background = 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)';
		} else {
			badge.style.background = 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)';
		}
		
		badge.style.transform = 'scale(1.1)';
		setTimeout(() => {
			badge.style.transform = 'scale(1)';
		}, 150);
	}
	// ================================================

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
			backgroundColor: profColors,
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
		options: { 
			responsive: true, 
			plugins: { legend: { position: 'top' } },
			scales: { y: { min: 70, max: 140 } }
		},
		plugins: [rangePlugin]
	});

	const profChart = new Chart(profCtx, {
		type: 'bar',
		data: profData,
		options: { 
			responsive: true, 
			plugins: { legend: { position: 'top' } },
			scales: {
				y: {
					min: 30,
					max: 70,
					reverse: true
				}
			}
		},
		plugins: [rangePlugin]
	});

	const pieChart = new Chart(pieCtx, { 
		type: 'pie', 
		data: pieData,
		options: {
			responsive: true,
			maintainAspectRatio: true,
			plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }
		}
	});
	const handPosChart = new Chart(handPosCtx, { 
		type: 'doughnut', 
		data: handPosData,
		options: {
			responsive: true,
			maintainAspectRatio: true,
			plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }
		}
	});

	// Reducir tamaño de los canvas de pie y doughnut
	pieCanvas.style.maxWidth = '180px';
	pieCanvas.style.maxHeight = '180px';
	handPosCanvas.style.maxWidth = '180px';
	handPosCanvas.style.maxHeight = '180px';
	
	// Aplicar estilos uniformes a ambos contenedores
	[pieCanvas, handPosCanvas].forEach(canvas => {
		const container = canvas.parentElement;
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.alignItems = 'center';
		container.style.justifyContent = 'flex-start';
		container.style.height = '250px';
	});

	function updateCharts() {
		if (!isPaused) {
			freqChart.update();
			profChart.update();
			pieChart.update();
			handPosChart.update();
		}
	}

	(async () => {
		try {
			const storedDir = localStorage.getItem("savedDirHandle");
			if (storedDir) {
				savedDirHandle = await window.showDirectoryPicker({ startIn: JSON.parse(storedDir) });
				console.log("📂 Carpeta restaurada desde sesión anterior");
			}
		} catch (err) {
			console.warn("⚠️ No se pudo restaurar la carpeta guardada:", err);
		}
	})();

	async function downloadCSV() {
		if (recordedData.length === 0) return;

		const header = "Timestamp,Frecuencia,Profundidad,PosicionMano\n";
		const rows = recordedData.map(row =>
			`${row.timestamp},${row.frecuencia},${row.profundidad},${row.posicionMano}`
		);
		const csvContent = header + rows.join("\n");
		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

		try {
			if (!savedDirHandle) {
				savedDirHandle = await window.showDirectoryPicker();
				localStorage.setItem("savedDirHandle", JSON.stringify(savedDirHandle.name));
				console.log("💾 Carpeta guardada en localStorage:", savedDirHandle.name);
			}

			if (savedFiles.length >= MAX_CSV_FILES) {
				savedFiles.sort((a, b) => a.date - b.date);
				const oldest = savedFiles.shift();
				try {
					await savedDirHandle.removeEntry(oldest.name);
					console.log(`🗑️ Archivo antiguo eliminado: ${oldest.name}`);
				} catch (err) {
					console.warn("No se pudo borrar archivo anterior:", err);
				}
			}

			const fileName = `maniobra_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
			const fileHandle = await savedDirHandle.getFileHandle(fileName, { create: true });
			const writable = await fileHandle.createWritable();
			await writable.write(blob);
			await writable.close();

			savedFiles.push({ name: fileName, date: new Date() });
			alert('Se ha guardado correctamente');
		} catch (err) {
			console.error("❌ Error guardando CSV:", err);

			if (err.name === "SecurityError" || err.name === "NotAllowedError") {
				localStorage.removeItem("savedDirHandle");
				savedDirHandle = null;
				alert("Debes volver a seleccionar la carpeta para guardar los archivos.");
			} else {
				alert("No se pudo guardar el CSV.");
			}
		}
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

		// Reset badges
		freqBadge.innerHTML = '<span>--</span>';
		profBadge.innerHTML = '<span>--</span>';
		pieBadge.innerHTML = '<span>--%</span>';
		handPosBadge.innerHTML = '<span>--</span>';
		freqBadge.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
		profBadge.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
		pieBadge.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
		handPosBadge.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

		updateCharts();

		console.log("🔄 Iniciando nueva maniobra...");
		window.sessionId++;
		window.finishPopupShown = false;
		window.handsPopupShownThisSession = false;
		if (typeof window.restartSerialLoop === 'function') {
			window.restartSerialLoop();
		}
	}

	function saveCharts() {
		console.log("saveCharts() ejecutado, sessionId:", window.sessionId);

		const correct = pieData.datasets[0].data[0];
		const incorrect = pieData.datasets[0].data[1];
		const total = correct + incorrect;
		const percentage = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;

		const handOKCount = handPositionHistory.filter(pos => pos === 'OK').length;
		const handNotOKCount = handPositionHistory.length - handOKCount;

		const handSummaryData = {
			labels: ['Posición de manos OK', 'No OK'],
			datasets: [{ data: [handOKCount, handNotOKCount], backgroundColor: ['green', 'red'] }]
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
			showCancelButton: true,
			confirmButtonText: 'Nueva Maniobra',
			denyButtonText: 'Cerrar',
			cancelButtonText: 'Guardar CSV',
			preCancel: () => false,
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
					data: { labels: fullLabels, datasets: [{ label: 'Frecuencia', data: fullFreqData, borderColor: 'blue', fill: false, tension: 0.1 }] },
					options: { responsive: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
				});
				new Chart(document.getElementById('profPreview').getContext('2d'), {
					type: 'bar',
					data: { labels: fullLabels, datasets: [{ label: 'Profundidad', data: fullProfData, backgroundColor: 'rgba(255, 99, 132, 0.5)' }] },
					options: { responsive: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
				});

				const swalButtons = document.querySelectorAll('.swal2-cancel');
				swalButtons.forEach(btn => {
					btn.onclick = (e) => {
						e.stopPropagation();
						downloadCSV();
						btn.style.backgroundColor = '#4CAF50';
						btn.style.color = '#fff';
					};
				});
			}
		}).then((result) => {
			if (result.isConfirmed) {
				resetCharts();
			} else if (result.isDenied) {
				if (typeof window.closeSerialConnection === 'function') {
					window.closeSerialConnection();
				}
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

	window.saveCharts = saveCharts;

	function handleDataForVisualization(parsedData) {
		if (isPaused) return;

		const freq = parsedData.freq || 0;
		const prof = parsedData.profundidad || 0;
		const handPos = parsedData.handPosition || 'N/A';

		if (handPos === "OK") startTracking = true;
		if (!startTracking) return;

		globalCounter++;

		const isFreqCorrect = freq >= freqIdealMin && freq <= freqIdealMax;
		const isProfCorrect = prof >= profIdealMin && prof <= profIdealMax;
		const isHandOK = handPos === 'OK';
		handPositionHistory.push(handPos);

		// ========== ACTUALIZAR BADGES ==========
		updateBadge(freqBadge, freq, 'cpm', isFreqCorrect);
		updateBadge(profBadge, prof, 'mm', isProfCorrect);
		updatePieBadge(pieBadge, correctExecutions, incorrectExecutions);
		updateHandPosBadge(handPosBadge, handPos);
		// =======================================

		if (freqData.labels.length >= 7) {
			freqData.labels.shift();
			freqData.datasets[0].data.shift();

			profData.labels.shift();
			profData.datasets[0].data.shift();
			profColors.shift();
		}

		freqData.labels.push(globalCounter);
		profData.labels.push(globalCounter);
		freqData.datasets[0].data.push(freq);
		profData.datasets[0].data.push(prof);

		profColors.push(
			isProfCorrect
				? 'rgba(0, 200, 0, 0.7)'
				: 'rgba(255, 99, 132, 0.5)'
		);

		fullLabels.push(globalCounter);
		fullFreqData.push(freq);
		fullProfData.push(prof);

		recordedData.push({
			timestamp: new Date().toISOString(),
			frecuencia: freq,
			profundidad: prof,
			posicionMano: handPos
		});

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

	window.updateVisualization = function updateVisualization(data) {
		try {
			let parsedData = data;
			if (typeof data === 'string') parsedData = JSON.parse(data);
			handleDataForVisualization(parsedData);
		} catch (error) {
			console.error('Error al procesar los datos:', error);
			if (receivedDataElement) receivedDataElement.innerHTML = 'Error al mostrar los datos.';
		}
	};
});