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

  loadMuscleVolume();
  await loadExercises();
}

// Weekly set volume per primary muscle group (this week vs last)
async function loadMuscleVolume() {
  const card = document.getElementById('muscle-volume-card');
  const list = document.getElementById('muscle-volume-list');
  if (!card || !list) return;
  try {
    const data = await API.get('/api/stats/muscle-volume');
    if (!data.muscles || data.muscles.length === 0) { card.style.display = 'none'; return; }

    const maxSets = Math.max(...data.muscles.map(m => Math.max(m.sets, m.prev_sets)), 1);
    list.innerHTML = data.muscles.map(m => {
      const pct = Math.round((m.sets / maxSets) * 100);
      let trend = '';
      if (m.prev_sets > 0 || m.sets > 0) {
        const diff = m.sets - m.prev_sets;
        if (diff > 0) trend = `<span style="color:var(--success,#4ade80);">▲ +${diff}</span>`;
        else if (diff < 0) trend = `<span style="color:#ef4444;">▼ ${diff}</span>`;
        else trend = `<span style="color:var(--text-muted);">=</span>`;
      }
      return `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:7px;">
          <div style="width:92px; font-size:0.78rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.muscle}</div>
          <div style="flex:1; height:14px; background:var(--bg-elevated); border-radius:7px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:var(--accent); border-radius:7px; min-width:${m.sets > 0 ? 4 : 0}px;"></div>
          </div>
          <div style="width:64px; text-align:right; font-size:0.75rem; font-variant-numeric:tabular-nums;">
            <strong>${m.sets}</strong> ${trend}
          </div>
        </div>`;
    }).join('');
    card.style.display = 'block';
  } catch (e) {
    card.style.display = 'none';
  }
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
  const sessionList = document.getElementById('progress-session-list');
  if (sessionList) sessionList.innerHTML = '';

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
    loadTestedOrm(exerciseId);
    document.getElementById('stats-area').classList.remove('hidden');

    // Show chart
    document.getElementById('chart-area').classList.remove('hidden');
    renderChart(progressData, chartMode);
    renderSessionList(progressData);

  } catch (e) {
    showToast('Fehler beim Laden: ' + e.message, 'error');
  }
}

// Server liefert est_1rm = MAX über alle Sätze von weight × (1 + reps/30) (Epley)
function workout1RM(d) {
  return Math.round(d.est_1rm || d.max_weight || 0);
}

// Tested 1RM (from the guided 1RM mode) shown under the estimated value
async function loadTestedOrm(exerciseId) {
  const el = document.getElementById('stat-1rm');
  if (!el) return;
  const box = el.closest('.stat-box');
  const old = box?.querySelector('.tested-orm-line');
  if (old) old.remove();
  try {
    const tests = await API.get(`/api/orm-tests/${exerciseId}`);
    if (tests.length > 0 && box) {
      const line = document.createElement('div');
      line.className = 'tested-orm-line';
      line.style.cssText = 'font-size:0.68rem; color:var(--success, #4ade80); margin-top:2px;';
      line.textContent = `✔ getestet: ${tests[0].weight} kg`;
      box.appendChild(line);
    }
  } catch (e) { /* keine Tests */ }
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
            afterTitle: (items) => {
              const entry = data[items[0].dataIndex];
              return formatTooltipSetList(entry);
            },
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

function renderSessionList(data) {
  const container = document.getElementById('progress-session-list');
  if (!container) return;

  container.innerHTML = `
    <div class="chart-card">
      <div class="chart-header" style="margin-bottom:12px;">
        <div class="chart-title">Satzverlauf</div>
      </div>
      <div class="progress-session-list">
        ${data.slice().reverse().map(renderSessionCard).join('')}
      </div>
    </div>
  `;
}

function renderSessionCard(entry) {
  const dateLabel = new Date(entry.started_at || entry.date).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const sets = (entry.sets || []).map(set => `
    <div class="progress-set-row">
      <div class="progress-set-label">Satz ${set.set_number}</div>
      <div class="progress-set-detail">${formatSetSummary(set)}</div>
    </div>
  `).join('');

  return `
    <div class="progress-session-card">
      <div class="progress-session-header">
        <div class="progress-session-date">${dateLabel}</div>
        <div class="progress-session-meta">${Math.round(entry.total_volume)} kg Volumen</div>
      </div>
      ${sets}
    </div>
  `;
}

function formatSetSummary(set) {
  const bwBadge = set.is_bodyweight ? ' <span class="bodyweight-badge">BW</span>' : '';
  return `${set.weight} kg × ${set.reps} Wdh.${bwBadge}`;
}

function formatTooltipSetList(entry) {
  return (entry.sets || []).map(set =>
    `S${set.set_number}: ${set.weight}kg × ${set.reps}${set.is_bodyweight ? ' BW' : ''}`
  );
}

if (typeof window !== 'undefined') {
  init();
}

if (typeof module !== 'undefined') {
  module.exports = { renderSessionCard, formatSetSummary, formatTooltipSetList };
}
