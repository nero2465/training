/* ============================================================
   Plan Editor
   ============================================================ */

let allPlans = [];
let allExercises = [];
let targetSessionId = null; // Which session we're adding an exercise to

async function init() {
  document.getElementById('nav-placeholder').innerHTML = buildNav('plans');

  const user = await requireAuth();
  if (!user) return;

  // Load exercises library for modal
  try {
    allExercises = await API.get('/api/exercises');
  } catch (e) {
    showToast('Fehler beim Laden der Übungen', 'error');
  }

  await loadPlans();
}

async function loadPlans() {
  const container = document.getElementById('plans-container');

  try {
    allPlans = await API.get('/api/plans');
    renderPlans();
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Fehler: ${e.message}</p></div>`;
  }
}

function renderPlans() {
  const container = document.getElementById('plans-container');
  container.innerHTML = '';

  // Add plan button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-plan-card';
  addBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="margin-bottom:6px;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
    </svg>
    <div>Neuen Plan erstellen</div>
  `;
  addBtn.onclick = createPlan;
  container.appendChild(addBtn);

  if (allPlans.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="icon">📋</div>
      <h3>Noch keine Pläne</h3>
      <p>Erstelle deinen ersten Trainingsplan.</p>
    `;
    container.appendChild(empty);
    return;
  }

  allPlans.forEach(plan => {
    const el = createPlanElement(plan);
    container.appendChild(el);
  });
}

function createPlanElement(plan) {
  const card = document.createElement('div');
  card.className = 'plan-editor-card fade-in';
  card.id = `plan-${plan.id}`;

  card.innerHTML = `
    <div class="plan-editor-header">
      <div style="flex:1; min-width:0;">
        <div id="plan-name-display-${plan.id}" style="font-size:1.1rem; font-weight:700; cursor:pointer;" onclick="editPlanName(${plan.id})" title="Klicken zum Bearbeiten">
          ${escapeHtml(plan.name)}
        </div>
        <div id="plan-name-edit-${plan.id}" style="display:none;">
          <input type="text" class="inline-edit-input" id="plan-name-input-${plan.id}" value="${escapeHtml(plan.name)}"
            onblur="savePlanName(${plan.id})" onkeydown="if(event.key==='Enter')savePlanName(${plan.id});if(event.key==='Escape')cancelPlanName(${plan.id})">
        </div>
        ${plan.description ? `<div class="text-secondary" style="font-size:0.8rem;">${escapeHtml(plan.description)}</div>` : ''}
      </div>
      <div class="plan-actions">
        <button class="btn btn-ghost btn-sm" onclick="deletePlan(${plan.id})" title="Plan löschen">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Sessions will be loaded here -->
    <div id="sessions-${plan.id}">
      <div class="loading" style="padding:12px;"><div class="spinner" style="width:20px;height:20px;"></div></div>
    </div>
  `;

  // Async load sessions
  loadSessions(plan.id);

  return card;
}

async function loadSessions(planId) {
  const container = document.getElementById(`sessions-${planId}`);
  try {
    const sessions = await API.get(`/api/plans/${planId}/sessions`);
    container.innerHTML = '';

    for (const session of sessions) {
      const el = await createSessionElement(session);
      container.appendChild(el);
    }

    // Add session button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-session-btn';
    addBtn.innerHTML = `+ Trainingseinheit hinzufügen`;
    addBtn.onclick = () => addSession(planId);
    container.appendChild(addBtn);

  } catch (e) {
    container.innerHTML = `<p class="text-danger" style="padding:8px;">Fehler: ${e.message}</p>`;
  }
}

async function createSessionElement(session) {
  const div = document.createElement('div');
  div.className = 'session-editor';
  div.id = `session-${session.id}`;

  div.innerHTML = `
    <div class="session-editor-header" onclick="toggleSession(${session.id})">
      <div class="session-editor-label">${escapeHtml(session.session_label)}</div>
      <div class="session-editor-title">Training ${escapeHtml(session.session_label)}</div>
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); deleteSession(${session.id})" title="Einheit löschen">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <svg class="collapse-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </div>
    <div class="session-collapsible open" id="session-body-${session.id}">
      <div id="session-exercises-${session.id}" style="margin-bottom:8px;"></div>
      <button class="btn btn-outline btn-sm btn-full" onclick="openExerciseLibrary(${session.id})">
        + Übung hinzufügen
      </button>
    </div>
  `;

  // Load exercises
  await loadSessionExercises(session.id);

  return div;
}

function toggleSession(sessionId) {
  const body = document.getElementById(`session-body-${sessionId}`);
  const header = document.querySelector(`#session-${sessionId} .session-editor-header`);
  if (body.classList.contains('open')) {
    body.classList.remove('open');
    header.classList.remove('open');
  } else {
    body.classList.add('open');
    header.classList.add('open');
  }
}

async function loadSessionExercises(sessionId) {
  const container = document.getElementById(`session-exercises-${sessionId}`);
  try {
    const exercises = await API.get(`/api/sessions/${sessionId}/exercises`);
    container.innerHTML = '';

    if (exercises.length === 0) {
      container.innerHTML = '<p class="text-muted" style="font-size:0.8rem; padding:4px;">Keine Übungen. Füge Übungen hinzu.</p>';
      return;
    }

    exercises.forEach((ex, idx) => {
      const el = createExerciseItem(ex, sessionId, idx, exercises.length);
      container.appendChild(el);
    });
  } catch (e) {
    container.innerHTML = `<p class="text-danger">Fehler: ${e.message}</p>`;
  }
}

function createExerciseItem(ex, sessionId, idx, total) {
  const div = document.createElement('div');
  div.className = 'exercise-item';
  div.id = `se-${ex.id}`;

  const repsDisplay = ex.reps_min === ex.reps_max
    ? `${ex.reps_min}`
    : `${ex.reps_min}–${ex.reps_max}`;

  div.innerHTML = `
    <div class="exercise-item-info" style="cursor:pointer;" onclick="openEditExerciseItem(${ex.id}, ${sessionId})">
      <div class="exercise-item-name">${escapeHtml(ex.name)}</div>
      <div class="exercise-item-meta">${ex.sets} × ${repsDisplay} Wdh.</div>
    </div>
    <div class="exercise-item-actions">
      <button class="order-btn" onclick="moveExercise(${ex.id}, ${sessionId}, -1)" ${idx === 0 ? 'disabled' : ''} title="Nach oben">▲</button>
      <button class="order-btn" onclick="moveExercise(${ex.id}, ${sessionId}, 1)" ${idx === total - 1 ? 'disabled' : ''} title="Nach unten">▼</button>
      <button class="delete-btn" onclick="deleteSessionExercise(${ex.id}, ${sessionId})" title="Entfernen">×</button>
    </div>
  `;

  return div;
}

async function moveExercise(seId, sessionId, direction) {
  // Get current exercises
  const exercises = await API.get(`/api/sessions/${sessionId}/exercises`);
  const idx = exercises.findIndex(e => e.id === seId);
  const newIdx = idx + direction;

  if (newIdx < 0 || newIdx >= exercises.length) return;

  // Swap order_index
  const a = exercises[idx];
  const b = exercises[newIdx];

  await Promise.all([
    API.put(`/api/session-exercises/${a.id}`, { order_index: newIdx }),
    API.put(`/api/session-exercises/${b.id}`, { order_index: idx })
  ]);

  await loadSessionExercises(sessionId);
}

async function deleteSessionExercise(seId, sessionId) {
  if (!confirm('Übung aus dieser Einheit entfernen?')) return;

  try {
    await API.delete(`/api/session-exercises/${seId}`);
    await loadSessionExercises(sessionId);
    showToast('Übung entfernt', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// Inline edit exercise sets/reps
function openEditExerciseItem(seId, sessionId) {
  const container = document.getElementById(`se-${seId}`);
  const infoDiv = container.querySelector('.exercise-item-info');

  // Find exercise data
  const name = container.querySelector('.exercise-item-name').textContent;
  const metaText = container.querySelector('.exercise-item-meta').textContent;

  // Parse existing values
  let sets = 3, repsMin = 8, repsMax = 12;
  const match = metaText.match(/(\d+)\s*×\s*(\d+)(?:[–-](\d+))?/);
  if (match) {
    sets = parseInt(match[1]);
    repsMin = parseInt(match[2]);
    repsMax = match[3] ? parseInt(match[3]) : repsMin;
  }

  infoDiv.innerHTML = `
    <div class="exercise-item-name">${escapeHtml(name)}</div>
    <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:4px;">
      <input type="number" class="form-control reps-input" value="${sets}" min="1" max="20" id="edit-sets-${seId}" placeholder="Sätze" style="width:56px;">
      <span class="text-muted">×</span>
      <input type="number" class="form-control reps-input" value="${repsMin}" min="1" max="100" id="edit-rmin-${seId}" placeholder="Min" style="width:56px;">
      <span class="text-muted">–</span>
      <input type="number" class="form-control reps-input" value="${repsMax}" min="1" max="100" id="edit-rmax-${seId}" placeholder="Max" style="width:56px;">
      <span class="text-muted" style="font-size:0.75rem;">Wdh.</span>
      <button class="btn btn-primary btn-sm" onclick="saveExerciseEdit(${seId}, ${sessionId})">OK</button>
      <button class="btn btn-outline btn-sm" onclick="loadSessionExercises(${sessionId})">✕</button>
    </div>
  `;

  // Focus sets input
  setTimeout(() => document.getElementById(`edit-sets-${seId}`)?.focus(), 50);
}

async function saveExerciseEdit(seId, sessionId) {
  const sets = parseInt(document.getElementById(`edit-sets-${seId}`).value);
  const repsMin = parseInt(document.getElementById(`edit-rmin-${seId}`).value);
  const repsMax = parseInt(document.getElementById(`edit-rmax-${seId}`).value);

  if (!sets || !repsMin || !repsMax || sets < 1 || repsMin < 1 || repsMax < repsMin) {
    showToast('Ungültige Werte', 'error');
    return;
  }

  try {
    await API.put(`/api/session-exercises/${seId}`, {
      sets,
      reps_min: repsMin,
      reps_max: repsMax
    });
    await loadSessionExercises(sessionId);
    showToast('Gespeichert', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// =====================
// Exercise Library Modal
// =====================

function openExerciseLibrary(sessionId) {
  targetSessionId = sessionId;
  document.getElementById('exercise-search').value = '';
  renderExerciseLibrary(allExercises);
  document.getElementById('exercise-library-modal').classList.add('show');
}

function closeExerciseLibrary() {
  document.getElementById('exercise-library-modal').classList.remove('show');
  targetSessionId = null;
}

function filterExercises() {
  const query = document.getElementById('exercise-search').value.toLowerCase();
  const filtered = allExercises.filter(e =>
    e.name.toLowerCase().includes(query) ||
    (e.muscle_groups || '').toLowerCase().includes(query)
  );
  renderExerciseLibrary(filtered);
}

function renderExerciseLibrary(exercises) {
  const list = document.getElementById('exercise-library-list');

  if (exercises.length === 0) {
    list.innerHTML = '<p class="text-muted text-center" style="padding:16px;">Keine Übungen gefunden</p>';
    return;
  }

  list.innerHTML = exercises.map(ex => `
    <div style="padding:10px 12px; border-bottom: 1px solid var(--border); cursor:pointer; transition: background 0.15s;"
         onclick="addExerciseToSession(${ex.id})"
         onmouseover="this.style.background='var(--bg-elevated)'"
         onmouseout="this.style.background=''">
      <div style="font-weight:600; font-size:0.95rem;">${escapeHtml(ex.name)}</div>
      <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(ex.muscle_groups || '')}</div>
    </div>
  `).join('');
}

async function addExerciseToSession(exerciseId) {
  if (!targetSessionId) return;

  try {
    await API.post(`/api/sessions/${targetSessionId}/exercises`, {
      exercise_id: exerciseId,
      sets: 3,
      reps_min: 8,
      reps_max: 12
    });
    closeExerciseLibrary();
    await loadSessionExercises(targetSessionId);
    showToast('Übung hinzugefügt', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// =====================
// Plan CRUD
// =====================

async function createPlan() {
  const name = prompt('Name für den neuen Trainingsplan:');
  if (!name || !name.trim()) return;

  try {
    const plan = await API.post('/api/plans', { name: name.trim() });
    allPlans.unshift(plan);
    renderPlans();
    showToast('Plan erstellt', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

function editPlanName(planId) {
  document.getElementById(`plan-name-display-${planId}`).style.display = 'none';
  document.getElementById(`plan-name-edit-${planId}`).style.display = 'block';
  const input = document.getElementById(`plan-name-input-${planId}`);
  input.focus();
  input.select();
}

async function savePlanName(planId) {
  const input = document.getElementById(`plan-name-input-${planId}`);
  const name = input.value.trim();

  if (!name) {
    cancelPlanName(planId);
    return;
  }

  try {
    await API.put(`/api/plans/${planId}`, { name });
    document.getElementById(`plan-name-display-${planId}`).textContent = name;
    cancelPlanName(planId);

    // Update in local array
    const plan = allPlans.find(p => p.id === planId);
    if (plan) plan.name = name;

    showToast('Name gespeichert', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
    cancelPlanName(planId);
  }
}

function cancelPlanName(planId) {
  document.getElementById(`plan-name-display-${planId}`).style.display = '';
  document.getElementById(`plan-name-edit-${planId}`).style.display = 'none';
}

async function deletePlan(planId) {
  if (!confirm('Plan wirklich löschen? Alle Einheiten werden entfernt.')) return;

  try {
    await API.delete(`/api/plans/${planId}`);
    allPlans = allPlans.filter(p => p.id !== planId);
    renderPlans();
    showToast('Plan gelöscht', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// =====================
// Session CRUD
// =====================

async function addSession(planId) {
  const label = prompt('Label für die neue Trainingseinheit (z.B. A, B, C):');
  if (!label || !label.trim()) return;

  try {
    await API.post(`/api/plans/${planId}/sessions`, {
      session_label: label.trim().toUpperCase()
    });
    await loadSessions(planId);
    showToast('Einheit erstellt', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function deleteSession(sessionId) {
  if (!confirm('Trainingseinheit löschen?')) return;

  try {
    // Find plan id from the DOM
    const sessionEl = document.getElementById(`session-${sessionId}`);
    const planCard = sessionEl.closest('.plan-editor-card');
    const planId = planCard.id.replace('plan-', '');

    await API.delete(`/api/sessions/${sessionId}`);
    await loadSessions(parseInt(planId));
    showToast('Einheit gelöscht', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// Close modal on background click
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('exercise-library-modal');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeExerciseLibrary();
  });
});

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
