/* ============================================================
   History Page
   ============================================================ */

let expandedWorkoutId = null;

async function init() {
  document.getElementById('nav-placeholder').innerHTML = buildNav('history');

  const user = await requireAuth();
  if (!user) return;

  await loadHistory();
}

async function loadHistory() {
  const container = document.getElementById('history-container');
  const emptyEl = document.getElementById('empty-history');

  try {
    const workouts = await API.get('/api/workouts');

    if (workouts.length === 0) {
      container.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    container.innerHTML = '';

    // Group by month
    const grouped = groupByMonth(workouts);

    for (const [monthKey, monthWorkouts] of Object.entries(grouped)) {
      const monthSection = document.createElement('div');
      monthSection.innerHTML = `<div class="section-title">${monthKey}</div>`;
      container.appendChild(monthSection);

      for (const workout of monthWorkouts) {
        const el = createWorkoutCard(workout);
        container.appendChild(el);
      }
    }

  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Fehler: ${e.message}</p></div>`;
  }
}

function groupByMonth(workouts) {
  const groups = {};
  for (const w of workouts) {
    const d = new Date(w.started_at);
    const key = d.toLocaleDateString('de-DE', { year: 'numeric', month: 'long' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(w);
  }
  return groups;
}

function createWorkoutCard(workout) {
  const wrapper = document.createElement('div');

  const startDate = new Date(workout.started_at);
  const endDate = workout.ended_at ? new Date(workout.ended_at) : null;
  const duration = endDate
    ? formatDuration(Math.floor((endDate - startDate) / 1000))
    : 'Nicht beendet';

  const dateStr = formatDate(workout.started_at);
  const timeStr = formatTime(workout.started_at);

  wrapper.innerHTML = `
    <div class="workout-card" id="wcard-${workout.id}" onclick="toggleDetail(${workout.id})">
      <div class="workout-card-header">
        <div class="workout-date">${dateStr}</div>
        <span class="workout-badge">${escapeHtml(workout.session_label)}</span>
      </div>
      <div class="workout-meta">
        <span>${escapeHtml(workout.plan_name)}</span>
        <span>${timeStr}</span>
        <span>${workout.total_sets || 0} Sätze</span>
        ${workout.ended_at ? `<span>${duration}</span>` : '<span class="text-warning">Nicht beendet</span>'}
      </div>
    </div>
    <div class="workout-detail" id="wdetail-${workout.id}"></div>
  `;

  return wrapper;
}

async function toggleDetail(workoutId) {
  const detailEl = document.getElementById(`wdetail-${workoutId}`);

  if (detailEl.classList.contains('show')) {
    detailEl.classList.remove('show');
    return;
  }

  // Close others
  document.querySelectorAll('.workout-detail.show').forEach(el => el.classList.remove('show'));

  // Load detail if not loaded
  if (!detailEl.dataset.loaded) {
    detailEl.innerHTML = '<div class="loading" style="padding:16px;"><div class="spinner"></div></div>';
    detailEl.classList.add('show');

    try {
      const data = await API.get(`/api/workouts/${workoutId}`);
      detailEl.innerHTML = renderWorkoutDetail(data);
      detailEl.dataset.loaded = '1';
    } catch (e) {
      detailEl.innerHTML = `<p class="text-danger" style="padding:12px;">Fehler: ${e.message}</p>`;
    }
  } else {
    detailEl.classList.add('show');
  }
}

function renderWorkoutDetail(workout) {
  if (!workout.sets || workout.sets.length === 0) {
    return '<p class="text-secondary" style="padding:12px; text-align:center;">Keine Sätze aufgezeichnet.</p>';
  }

  // Group sets by exercise
  const byExercise = {};
  for (const s of workout.sets) {
    if (!byExercise[s.exercise_name]) byExercise[s.exercise_name] = [];
    byExercise[s.exercise_name].push(s);
  }

  const parts = Object.entries(byExercise).map(([name, sets]) => {
    const maxWeight = Math.max(...sets.map(s => s.weight));
    const totalVol = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);

    const rows = sets.map(s => `
      <tr>
        <td>Satz ${s.set_number}</td>
        <td>${s.weight} kg</td>
        <td>${s.reps} Wdh.</td>
        <td>${(s.weight * s.reps).toFixed(0)} kg</td>
      </tr>
    `).join('');

    return `
      <div style="margin-bottom:16px;">
        <div style="font-weight:700; margin-bottom:6px; color:var(--text-primary);">${escapeHtml(name)}</div>
        <table class="sets-table">
          <thead>
            <tr>
              <th>Satz</th>
              <th>Gewicht</th>
              <th>Wdh.</th>
              <th>Volumen</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
          Max: ${maxWeight} kg · Volumen: ${totalVol.toFixed(0)} kg
        </div>
      </div>
    `;
  });

  return `<div style="padding:4px 0;">${parts.join('')}</div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
