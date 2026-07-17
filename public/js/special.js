/* ============================================================
   Sondertraining — ad-hoc muscle-group session
   ============================================================ */

let spMuscle = null;
let spSelected = [];   // [{id, name, muscle_groups}]
let spOthers = [];

async function init() {
  const user = await requireAuth();
  if (!user) return;
  loadMuscles();
}

async function loadMuscles() {
  const grid = document.getElementById('muscle-grid');
  try {
    const muscles = await API.get('/api/special/muscles');
    if (muscles.length === 0) {
      grid.innerHTML = '<p class="text-muted" style="grid-column:1/-1;">Keine Übungen mit Muskelgruppen gefunden.</p>';
      return;
    }
    grid.innerHTML = muscles.map(m => `
      <button class="muscle-btn" onclick="pickMuscle('${m.muscle.replace(/'/g, "\\'")}')">
        ${m.muscle}
        <small>${m.count} Übungen</small>
      </button>`).join('');
  } catch (e) {
    grid.innerHTML = `<p class="text-danger" style="grid-column:1/-1;">Fehler: ${e.message}</p>`;
  }
}

async function pickMuscle(muscle) {
  spMuscle = muscle;
  try {
    const data = await API.get(`/api/special/suggest/${encodeURIComponent(muscle)}`);
    spSelected = data.suggested;
    // One pool for unselected exercises; supporting ones carry a flag so they
    // render in their own clearly-labeled section
    spOthers = [
      ...data.others.map(e => ({ ...e, _supporting: false })),
      ...(data.supporting || []).map(e => ({ ...e, _supporting: true }))
    ];

    document.getElementById('sp-selected-muscle').textContent = `🎯 ${muscle}`;
    renderSelection();

    document.getElementById('sp-muscles').classList.add('hidden');
    document.getElementById('sp-exercises').classList.remove('hidden');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

function backToMuscles() {
  document.getElementById('sp-exercises').classList.add('hidden');
  document.getElementById('sp-muscles').classList.remove('hidden');
}

function toggleSpecialExercise(id) {
  const selIdx = spSelected.findIndex(e => e.id === id);
  if (selIdx >= 0) {
    spOthers.unshift(spSelected.splice(selIdx, 1)[0]);
  } else {
    const othIdx = spOthers.findIndex(e => e.id === id);
    if (othIdx >= 0) spSelected.push(spOthers.splice(othIdx, 1)[0]);
  }
  renderSelection();
}

function renderSelection() {
  document.getElementById('sp-count').textContent = spSelected.length;

  const row = (ex, checked) => {
    // For supporting exercises, show WHY they match (the muscle only assists)
    const muscleLine = ex._supporting
      ? `${escapeHtml(ex.muscle_groups || '')} · <span style="color:var(--accent);">🤝 ${escapeHtml(spMuscle)} nur unterstützend</span>`
      : escapeHtml(ex.muscle_groups || '');
    return `
    <div class="sp-ex-row${checked ? ' selected' : ''}">
      <input type="checkbox" ${checked ? 'checked' : ''} style="flex-shrink:0; cursor:pointer; accent-color:var(--accent);"
        onchange="toggleSpecialExercise(${ex.id})">
      <div style="flex:1;">
        <div class="sp-ex-name">${escapeHtml(ex.name)}</div>
        <div class="sp-ex-muscles">${muscleLine}</div>
      </div>
    </div>`;
  };

  document.getElementById('sp-selected-list').innerHTML = spSelected.length
    ? spSelected.map(ex => row(ex, true)).join('')
    : '<div style="color:var(--text-muted); font-size:0.82rem; padding:4px 0;">Keine Übungen ausgewählt</div>';

  const targets = spOthers.filter(e => !e._supporting);
  const supporting = spOthers.filter(e => e._supporting);

  document.getElementById('sp-other-list').innerHTML =
    (targets.length
      ? targets.map(ex => row(ex, false)).join('')
      : '<div style="color:var(--text-muted); font-size:0.82rem; padding:4px 0;">Keine weiteren Zielübungen</div>') +
    (supporting.length
      ? `<div class="sp-section-title">Nur unterstützend beteiligt <span style="text-transform:none; letter-spacing:0;">(z.B. Haltearbeit — kein Ersatz für gezieltes Training)</span></div>` +
        supporting.map(ex => row(ex, false)).join('')
      : '');

  const btn = document.getElementById('sp-start-btn');
  btn.disabled = spSelected.length === 0;
  btn.style.opacity = spSelected.length === 0 ? '0.5' : '1';
}

async function startSpecial() {
  if (spSelected.length === 0) return;
  try {
    const result = await API.post('/api/special/start', {
      muscle: spMuscle,
      exercise_ids: spSelected.map(e => e.id)
    });

    WorkoutStorage.save({
      workoutId: result.workout_id,
      sessionId: result.session_id,
      sessionLabel: result.session_label,
      planName: 'Sondertraining',
      startedAt: new Date().toISOString()
    });
    window.location.href = '/training.html';
  } catch (e) {
    showToast('Fehler beim Starten: ' + e.message, 'error');
  }
}

function goBack() {
  window.location.href = '/dashboard.html';
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
