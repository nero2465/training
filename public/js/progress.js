/* ============================================================
   Progress / Charts Page
   ============================================================ */

let progressChart = null;
let allExercises = [];
let progressData = [];
let chartMode = 'weight'; // 'weight' | 'volume'

async function init() {
  document.getElementById('nav-placeholder').innerHTML = buildNav('progress');

  const user = await requireAuth();
  if (!user) return;

  await loadExercises();
}

async function loadExercises() {
  try {
    allExercises = await API.get('/api/exercises');
    const select = document.getElementById('exercise-select');
    allExercises.forEach(ex => {
      const opt = document.createElement('option');
      opt.value = ex.id;
      opt.textContent = ex.name;
      select.appendChild(opt);
    });
  } catch (e) {
    showToast('Fehler beim Laden der Übungen: ' + e.message, 'error');
  }
}

async function onExerciseChange() {
  const exerciseId = document.getElementById('exercise-select').value;

  document.getElementById('no-data').classList.add('hidden');
  document.getElementById('select-prompt').classList.add('hidden');
  document.getElementById('chart-area').classList.add('hidden');
  document.getElementById('stats-area').classList.add('hidden');

  if (!exerciseId) {
    document.getElementById('select-prompt').classList.remove('hidden');
    return;
  }

  const exercise = allExercises.find(e => e.id == exerciseId);
  document.getElementById('chart-title').textContent = exercise ? exercise.name : 'Fortschritt';

  try {
    progressData = await API.get(`/api/progress/${exerciseId}`);

    if (progressData.length === 0) {
      document.getElementById('no-data').classList.remove('hidden');
      return;
    }

    // Show stats
    renderStats(progressData);
    document.getElementById('stats-area').classList.remove('hidden');

    // Show chart
    document.getElementById('chart-area').classList.remove('hidden');
    renderChart(progressData, chartMode);

  } catch (e) {
    showToast('Fehler beim Laden: ' + e.message, 'error');
  }
}

// Server liefert est_1rm = MAX über alle Sätze von weight × (1 + reps/30) (Epley)
function workout1RM(d) {
  return Math.round(d.est_1rm || d.max_weight || 0);
}

function renderStats(data) {
  const maxWeight = Math.max(...data.map(d => d.max_weight));
  const maxVolume = Math.max(...data.map(d => d.total_volume));
  const sessions = data.length;
  const best1RM = Math.max(...data.map(workout1RM));

  let weightDelta = 0, volumeDelta = 0;
  if (data.length >= 2) {
    const first = data[0];
    const last = data[data.length - 1];
    if (first.max_weight > 0)
      weightDelta = Math.round(((last.max_weight - first.max_weight) / first.max_weight) * 100);
    if (first.total_volume > 0)
      volumeDelta = Math.round(((last.total_volume - first.total_volume) / first.total_volume) * 100);
  }

  document.getElementById('stat-max').textContent = `${maxWeight} kg`;
  document.getElementById('stat-1rm').textContent = `~${best1RM} kg`;
  document.getElementById('stat-sessions').textContent = sessions;

  const maxVolumeRounded = Math.round(maxVolume);
  document.getElementById('stat-max-volume').textContent =
    maxVolumeRounded >= 1000 ? `${(maxVolumeRounded / 1000).toFixed(1)}t` : `${maxVolumeRounded} kg`;

  const vimpEl = document.getElementById('stat-volume-improvement');
  vimpEl.textContent = `${volumeDelta >= 0 ? '+' : ''}${volumeDelta}%`;
  vimpEl.style.color = volumeDelta >= 0 ? 'var(--success)' : 'var(--danger)';

  const wimpEl = document.getElementById('stat-improvement');
  wimpEl.textContent = `${weightDelta >= 0 ? '+' : ''}${weightDelta}%`;
  wimpEl.style.color = weightDelta >= 0 ? 'var(--success)' : 'var(--danger)';
}

function setChartMode(mode) {
  chartMode = mode;

  document.getElementById('btn-weight').className = `btn btn-sm ${mode === 'weight' ? 'btn-secondary' : 'btn-outline'}`;
  document.getElementById('btn-volume').className = `btn btn-sm ${mode === 'volume' ? 'btn-secondary' : 'btn-outline'}`;

  if (progressData.length > 0) {
    renderChart(progressData, mode);
  }
}

function renderChart(data, mode) {
  const ctx = document.getElementById('progress-chart').getContext('2d');

  const labels = data.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('de-DE', { month: 'short', day: 'numeric' });
  });

  const color = 'rgb(233, 69, 96)';
  const colorAlpha = 'rgba(233, 69, 96, 0.15)';

  if (progressChart) {
    progressChart.destroy();
  }

  let datasets;
  if (mode === 'weight') {
    const orm1Values = data.map(workout1RM);
    datasets = [
      {
        label: 'Max. Gewicht (kg)',
        data: data.map(d => d.max_weight),
        borderColor: color,
        backgroundColor: colorAlpha,
        borderWidth: 2.5,
        pointBackgroundColor: color,
        pointBorderColor: '#16213e',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.3
      },
      {
        label: 'Geschätztes 1RM (kg)',
        data: orm1Values,
        borderColor: 'rgba(96, 165, 250, 0.9)',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [6, 3],
        pointBackgroundColor: 'rgba(96, 165, 250, 0.9)',
        pointBorderColor: '#16213e',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false,
        tension: 0.3
      }
    ];
  } else {
    datasets = [{
      label: 'Volumen (kg)',
      data: data.map(d => Math.round(d.total_volume)),
      borderColor: color,
      backgroundColor: colorAlpha,
      borderWidth: 2.5,
      pointBackgroundColor: color,
      pointBorderColor: '#16213e',
      pointBorderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      fill: true,
      tension: 0.3
    }];
  }

  progressChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: mode === 'weight',
          labels: {
            color: '#a0a0b0',
            font: { size: 11 },
            boxWidth: 20,
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 14
          }
        },
        tooltip: {
          backgroundColor: '#16213e',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f0f0f0',
          bodyColor: '#a0a0b0',
          padding: 12,
          callbacks: {
            label: (context) => {
              const val = context.parsed.y;
              return `${context.dataset.label}: ${val} kg`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false
          },
          ticks: {
            color: '#606080',
            maxRotation: 45,
            font: { size: 11 }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false
          },
          ticks: {
            color: '#606080',
            font: { size: 11 },
            callback: (val) => `${val} kg`
          }
        }
      }
    }
  });
}

init();
