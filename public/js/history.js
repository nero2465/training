/* ============================================================
   History Page
   ============================================================ */

let expandedWorkoutId = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-based
let allBodyMetrics = [];
let allCardio = [];

async function init() {
  document.getElementById('nav-placeholder').innerHTML = buildNav('history');

  const user = await requireAuth();
  if (!user) return;

  try {
    allBodyMetrics = await API.get('/api/body-metrics');
  } catch (e) { /* body tracking optional */ }
  try {
    allCardio = await API.get('/api/cardio');
  } catch (e) { /* cardio optional */ }

  loadCalendar();
  await loadHistory();
}

/* ── Volume calendar ──────────────────────────────────────── */

function calNav(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  loadCalendar();
}

function volCompact(v) {
  if (!v) return '';
  return v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 't' : String(Math.round(v));
}

async function loadCalendar() {
  const grid = document.getElementById('cal-grid');
  const title = document.getElementById('cal-title');
  const summary = document.getElementById('cal-summary');
  if (!grid) return;

  const first = new Date(calYear, calMonth, 1);
  const last = new Date(calYear, calMonth + 1, 0);
  const pad = n => String(n).padStart(2, '0');
  const from = `${calYear}-${pad(calMonth + 1)}-01`;
  const to = `${calYear}-${pad(calMonth + 1)}-${pad(last.getDate())}`;

  title.textContent = first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  let days = [];
  try {
    days = await API.get(`/api/stats/calendar?from=${from}&to=${to}`);
  } catch (e) { /* leave empty */ }
  const byDate = {};
  days.forEach(d => { byDate[d.date] = d; });

  const todayIso = new Date().toISOString().slice(0, 10);
  const dows = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');

  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  for (let i = 0; i < lead; i++) html += '<div class="cal-day empty"></div>';

  // Days with a body-weight entry get a small marker dot
  const weightDays = new Set(
    allBodyMetrics.filter(m => m.weight).map(m => String(m.measured_at).slice(0, 10))
  );
  const cardioDays = new Set(
    allCardio.map(c => String(c.performed_at).slice(0, 10))
  );

  for (let d = 1; d <= last.getDate(); d++) {
    const iso = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
    const info = byDate[iso];
    const classes = ['cal-day'];
    if (iso === todayIso) classes.push('today');
    let inner = `<div class="cal-day-num">${d}</div>`;
    let click = '';
    if (info) {
      classes.push('has-workout');
      if (info.workouts.every(w => w.is_deload)) classes.push('deload-day');
      inner += `<div class="cal-day-vol">${volCompact(info.volume)}</div>`;
      click = ` onclick="openWorkoutFromCalendar(${info.workouts[0].id})"`;
    }
    if (weightDays.has(iso)) {
      inner += '<div class="cal-weight-dot" title="Gewicht erfasst"></div>';
    }
    if (cardioDays.has(iso)) {
      inner += '<div class="cal-cardio-dot" title="Cardio"></div>';
    }
    html += `<div class="${classes.join(' ')}"${click}>${inner}</div>`;
  }

  grid.innerHTML = html;

  const totalVol = days.reduce((s, d) => s + d.volume, 0);
  const count = days.reduce((s, d) => s + d.workouts.length, 0);
  summary.textContent = count > 0
    ? `${count} Training${count === 1 ? '' : 's'} · Volumen gesamt: ${volCompact(totalVol)}${totalVol >= 1000 ? '' : ' kg'}`
    : 'Keine Trainings in diesem Monat';
}

// Calendar → jump to the matching history card and open its detail
async function openWorkoutFromCalendar(workoutId) {
  const card = document.getElementById(`wcard-${workoutId}`);
  if (!card) return;
  const detail = document.getElementById(`wdetail-${workoutId}`);
  if (detail && !detail.classList.contains('show')) {
    await toggleDetail(workoutId);
  }
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.style.outline = '2px solid var(--accent)';
  setTimeout(() => { card.style.outline = ''; }, 1600);
}

async function loadHistory() {
  const container = document.getElementById('history-container');
  const emptyEl = document.getElementById('empty-history');

  try {
    const workouts = await API.get('/api/workouts');

    // Weight entries woven into the timeline, with delta vs previous entry
    const weightEntries = allBodyMetrics
      .filter(m => m.weight)
      .map((m, i, arr) => ({
        ...m,
        delta: i > 0 ? Math.round((m.weight - arr[i - 1].weight) * 10) / 10 : null
      }));

    if (workouts.length === 0 && weightEntries.length === 0) {
      container.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    container.innerHTML = '';

    // Merge workouts + weight + cardio into one chronological stream (newest first)
    const items = [
      ...workouts.map(w => ({ type: 'workout', date: w.started_at, data: w })),
      ...weightEntries.map(m => ({ type: 'weight', date: m.measured_at, data: m })),
      ...allCardio.map(c => ({ type: 'cardio', date: c.performed_at, data: c }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const grouped = groupByMonth(items);

    for (const [monthKey, monthItems] of Object.entries(grouped)) {
      const monthSection = document.createElement('div');
      monthSection.innerHTML = `<div class="section-title">${monthKey}</div>`;
      container.appendChild(monthSection);

      for (const item of monthItems) {
        let el;
        if (item.type === 'workout') el = createWorkoutCard(item.data);
        else if (item.type === 'weight') el = createWeightRow(item.data);
        else el = createCardioRow(item.data);
        container.appendChild(el);
      }
    }

  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Fehler: ${e.message}</p></div>`;
  }
}

function createWeightRow(m) {
  const div = document.createElement('div');
  div.className = 'weight-entry-row';
  const dateStr = new Date(m.measured_at).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  let deltaHtml = '';
  if (m.delta !== null && m.delta !== 0) {
    const up = m.delta > 0;
    deltaHtml = `<span style="color:${up ? '#fbbf24' : 'var(--success, #4ade80)'}; font-size:0.75rem;">${up ? '▲ +' : '▼ '}${m.delta} kg</span>`;
  }
  div.innerHTML = `
    <span>⚖️</span>
    <strong>${m.weight} kg</strong>
    ${deltaHtml}
    <span style="margin-left:auto; color:var(--text-muted); font-size:0.75rem;">${dateStr}</span>
  `;
  div.onclick = () => window.location.href = '/body.html';
  return div;
}

function createCardioRow(c) {
  const div = document.createElement('div');
  div.className = 'weight-entry-row';
  const dateStr = new Date(c.performed_at).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  const parts = [`${Math.round(c.duration_min)} min`];
  if (c.distance_km) parts.push(`${c.distance_km} km`);
  div.innerHTML = `
    <span>🏃</span>
    <strong>${escapeHtml(c.activity)}</strong>
    <span style="color:var(--text-muted); font-size:0.8rem;">${parts.join(' · ')}</span>
    <span style="margin-left:auto; color:var(--text-muted); font-size:0.75rem;">${dateStr}</span>
  `;
  div.onclick = () => window.location.href = '/cardio.html';
  return div;
}

function groupByMonth(items) {
  const groups = {};
  for (const it of items) {
    const d = new Date(it.date);
    const key = d.toLocaleDateString('de-DE', { year: 'numeric', month: 'long' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(it);
  }
  return groups;
}

function createWorkoutCard(workout) {
  const wrapper = document.createElement('div');
  wrapper.id = `wcard-wrapper-${workout.id}`;

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
        <button class="btn btn-ghost btn-sm workout-delete-btn" onclick="event.stopPropagation(); deleteWorkout(${workout.id})" title="Training löschen" style="margin-left:auto; color:var(--text-muted); padding:2px 6px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
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

async function deleteWorkout(workoutId) {
  if (!confirm('Training wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;

  try {
    await API.delete(`/api/workouts/${workoutId}`);
    const wrapper = document.getElementById(`wcard-wrapper-${workoutId}`);
    if (wrapper) wrapper.remove();
    showToast('Training gelöscht', 'success');

    // Show empty state if no more workouts
    const cards = document.querySelectorAll('[id^="wcard-wrapper-"]');
    if (cards.length === 0) {
      document.getElementById('history-container').innerHTML = '';
      document.getElementById('empty-history').classList.remove('hidden');
    }
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
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
    const hasBodyweightSets = sets.some(s => s.is_bodyweight);

    const rows = sets.map(s => `
      <tr id="setrow-${s.id}">
        <td>Satz ${s.set_number}</td>
        <td class="set-row-editable" id="setcell-w-${s.id}" onclick="startEditSet(${s.id}, ${s.weight}, ${s.reps}, ${workout.id})" title="Antippen zum Bearbeiten">${formatSetMetric(s, 'weight')}</td>
        <td class="set-row-editable" id="setcell-r-${s.id}" onclick="startEditSet(${s.id}, ${s.weight}, ${s.reps}, ${workout.id})" title="Antippen zum Bearbeiten">${formatSetMetric(s, 'reps')}</td>
        <td id="setcell-v-${s.id}">${(s.weight * s.reps).toFixed(0)} kg</td>
        <td id="setcell-x-${s.id}" style="text-align:right;">
          <button onclick="deleteSet(${s.id}, ${workout.id})" title="Satz löschen"
            style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:1rem; padding:2px 4px;">🗑</button>
        </td>
      </tr>
    `).join('');

    return `
      <div style="margin-bottom:16px;">
        <div style="font-weight:700; margin-bottom:6px; color:var(--text-primary);">
          ${escapeHtml(name)}${hasBodyweightSets ? ' <span class="bodyweight-badge">BW</span>' : ''}
        </div>
        <table class="sets-table">
          <thead>
            <tr>
              <th>Satz</th>
              <th>Gewicht</th>
              <th>Wdh.</th>
              <th>Volumen</th>
              <th></th>
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

  return `<div style="padding:4px 0;">
    <div style="font-size:0.74rem; color:var(--text-muted); margin:0 0 8px; padding:6px 10px; background:var(--bg-elevated); border-radius:6px;">
      ✏️ Gewicht/Wdh. antippen zum Korrigieren · 🗑 löscht einen einzelnen Satz (z.B. Dubletten)
    </div>
    ${parts.join('')}
  </div>`;
}

async function deleteSet(setId, workoutId) {
  if (!confirm('Diesen Satz löschen?')) return;
  try {
    const res = await API.delete(`/api/workout-sets/${setId}`);
    showToast('Satz gelöscht', 'success');
    loadCalendar(); // day volume may change
    if (res.workout_deleted) {
      // Was the last set — the whole workout is gone; drop its card
      const wrapper = document.getElementById(`wcard-wrapper-${workoutId}`);
      if (wrapper) wrapper.remove();
      showToast('Training war leer und wurde entfernt', 'info');
    } else {
      await refreshDetail(workoutId);
    }
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

function formatSetMetric(set, type) {
  const base = type === 'weight' ? `${set.weight} kg` : `${set.reps} Wdh.`;
  return `${base}${set.is_bodyweight ? ' <span class="bodyweight-badge">BW</span>' : ''}`;
}

/* ── Inline set editing (post-hoc corrections) ────────────── */

let editingSetId = null;

function startEditSet(setId, weight, reps, workoutId) {
  if (editingSetId === setId) return;
  // Only one edit at a time — reload cancels any other open edit
  if (editingSetId !== null) { refreshDetail(workoutId); }
  editingSetId = setId;

  const row = document.getElementById(`setrow-${setId}`);
  if (!row) return;
  row.onclick = null;

  document.getElementById(`setcell-w-${setId}`).innerHTML =
    `<input type="number" class="set-edit-input" id="set-edit-w-${setId}" value="${weight}" min="0" step="2.5" onclick="event.stopPropagation()">`;
  document.getElementById(`setcell-r-${setId}`).innerHTML =
    `<input type="number" class="set-edit-input" id="set-edit-r-${setId}" value="${reps}" min="0" step="1" onclick="event.stopPropagation()" style="width:44px;">`;
  document.getElementById(`setcell-v-${setId}`).innerHTML =
    `<span style="display:inline-flex; gap:4px;">
       <button class="btn btn-primary btn-sm" style="padding:2px 8px;" onclick="event.stopPropagation(); saveEditSet(${setId}, ${workoutId})">✓</button>
       <button class="btn btn-secondary btn-sm" style="padding:2px 8px;" onclick="event.stopPropagation(); refreshDetail(${workoutId})">✕</button>
     </span>`;
  setTimeout(() => document.getElementById(`set-edit-w-${setId}`)?.focus(), 50);
}

async function saveEditSet(setId, workoutId) {
  const weight = parseFloat(document.getElementById(`set-edit-w-${setId}`)?.value);
  const reps = parseInt(document.getElementById(`set-edit-r-${setId}`)?.value);
  if (isNaN(weight) || weight < 0 || isNaN(reps) || reps < 0) {
    showToast('Ungültige Werte', 'error');
    return;
  }
  try {
    await API.put(`/api/workout-sets/${setId}`, { weight, reps });
    showToast('Satz korrigiert', 'success');
    await refreshDetail(workoutId);
    loadCalendar(); // day volume may have changed
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// Re-fetch and re-render one workout's detail block
async function refreshDetail(workoutId) {
  editingSetId = null;
  const detailEl = document.getElementById(`wdetail-${workoutId}`);
  if (!detailEl) return;
  try {
    const data = await API.get(`/api/workouts/${workoutId}`);
    detailEl.innerHTML = renderWorkoutDetail(data);
    detailEl.dataset.loaded = '1';
    detailEl.classList.add('show');
  } catch (e) {
    detailEl.innerHTML = `<p class="text-danger" style="padding:12px;">Fehler: ${e.message}</p>`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  if (typeof document === 'undefined') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

if (typeof window !== 'undefined') {
  init();
}

if (typeof module !== 'undefined') {
  module.exports = { renderWorkoutDetail, formatSetMetric };
}
