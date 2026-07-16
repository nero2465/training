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
          <input type="text" class="inline-edit-input" id="plan-name-input-${plan.id}" value="${escapeAttr(plan.name)}"
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
  try {
    const sessions = await API.get(`/api/plans/${planId}/sessions`);
    const container = document.getElementById(`sessions-${planId}`);
    if (!container) return;
    container.innerHTML = '';

    for (const session of sessions) {
      const el = createSessionElement(session);
      container.appendChild(el);
      loadSessionExercises(session.id); // fire-and-forget: element is in DOM now
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'add-session-btn';
    addBtn.innerHTML = `+ Trainingseinheit hinzufügen`;
    addBtn.onclick = () => addSession(planId);
    container.appendChild(addBtn);

  } catch (e) {
    const container = document.getElementById(`sessions-${planId}`);
    if (container) container.innerHTML = `<p class="text-danger" style="padding:8px;">Fehler: ${e.message}</p>`;
  }
}

function createSessionElement(session) {
  const div = document.createElement('div');
  div.className = 'session-editor';
  div.id = `session-${session.id}`;
  div.dataset.planId = session.plan_id;

  div.innerHTML = `
    <div class="session-editor-header" onclick="toggleSession(${session.id})">
      <div class="session-editor-label" id="session-label-display-${session.id}" style="cursor:pointer;" onclick="event.stopPropagation(); startEditSessionLabel(${session.id})" title="Klicken zum Umbenennen">${escapeHtml(session.session_label)}</div>
      <input type="text" class="session-label-input" id="session-label-input-${session.id}"
        style="display:none; width:48px; font-size:0.85rem; padding:2px 4px; border:1px solid var(--accent); border-radius:4px; background:var(--bg-primary); color:var(--text-primary); text-align:center;"
        value="${escapeAttr(session.session_label)}"
        onclick="event.stopPropagation()"
        onblur="saveSessionLabel(${session.id})"
        onkeydown="handleSessionLabelKey(event, ${session.id})">
      <div class="session-editor-title" id="session-title-display-${session.id}">Training ${escapeHtml(session.session_label)}</div>
      <div style="display:flex; gap:2px; margin-left:auto;" onclick="event.stopPropagation()">
        <button class="order-btn" id="session-up-${session.id}" onclick="moveSession(${session.id}, -1)" title="Nach oben">▲</button>
        <button class="order-btn" id="session-down-${session.id}" onclick="moveSession(${session.id}, 1)" title="Nach unten">▼</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteSession(${session.id})" title="Einheit löschen">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <svg class="collapse-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </div>
    <div class="session-collapsible open" id="session-body-${session.id}">
      <div id="session-exercises-${session.id}" style="margin-bottom:8px;">
        <div class="loading" style="padding:6px;"><div class="spinner" style="width:16px;height:16px;"></div></div>
      </div>
      <button class="btn btn-outline btn-sm btn-full" onclick="openExerciseLibrary(${session.id})">
        + Übung hinzufügen
      </button>
    </div>
  `;

  return div;
}

// =====================
// Session Label Inline Edit (Feature 4)
// =====================

const sessionLabelCanceling = new Set(); // guard to prevent blur→save after Escape

function startEditSessionLabel(sessionId) {
  const display = document.getElementById(`session-label-display-${sessionId}`);
  const input = document.getElementById(`session-label-input-${sessionId}`);
  if (!display || !input) return;
  display.style.display = 'none';
  input.style.display = '';
  input.value = display.textContent.trim();
  input.focus();
  input.select();
}

function handleSessionLabelKey(event, sessionId) {
  if (event.key === 'Enter') {
    event.preventDefault();
    document.getElementById(`session-label-input-${sessionId}`)?.removeEventListener('blur', null);
    saveSessionLabel(sessionId);
  } else if (event.key === 'Escape') {
    sessionLabelCanceling.add(sessionId);
    cancelSessionLabel(sessionId);
  }
}

function cancelSessionLabel(sessionId) {
  const display = document.getElementById(`session-label-display-${sessionId}`);
  const input = document.getElementById(`session-label-input-${sessionId}`);
  if (!display || !input) return;
  input.style.display = 'none';
  display.style.display = '';
  // Clear the cancel guard after a tick (blur fires synchronously before this)
  setTimeout(() => sessionLabelCanceling.delete(sessionId), 0);
}

async function saveSessionLabel(sessionId) {
  if (sessionLabelCanceling.has(sessionId)) return;
  const display = document.getElementById(`session-label-display-${sessionId}`);
  const input = document.getElementById(`session-label-input-${sessionId}`);
  const titleDisplay = document.getElementById(`session-title-display-${sessionId}`);
  if (!display || !input) return;
  if (input.style.display === 'none') return; // already hidden (cancel was called)

  const newLabel = input.value.trim();
  if (!newLabel) {
    cancelSessionLabel(sessionId);
    return;
  }

  // Don't save if unchanged
  if (newLabel === display.textContent.trim()) {
    cancelSessionLabel(sessionId);
    return;
  }

  try {
    await API.put(`/api/sessions/${sessionId}`, { session_label: newLabel });
    display.textContent = newLabel;
    if (titleDisplay) titleDisplay.textContent = `Training ${newLabel}`;
    cancelSessionLabel(sessionId);
    showToast('Bezeichnung gespeichert', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
    cancelSessionLabel(sessionId);
  }
}

// =====================
// Session Reordering (Feature 5)
// =====================

async function moveSession(sessionId, direction) {
  // Find plan id from DOM
  const sessionEl = document.getElementById(`session-${sessionId}`);
  if (!sessionEl) return;
  const planCard = sessionEl.closest('.plan-editor-card');
  if (!planCard) return;
  const planId = parseInt(planCard.id.replace('plan-', ''));

  try {
    const sessions = await API.get(`/api/plans/${planId}/sessions`);
    const idx = sessions.findIndex(s => s.id === sessionId);
    const newIdx = idx + direction;

    if (newIdx < 0 || newIdx >= sessions.length) return;

    const a = sessions[idx];
    const b = sessions[newIdx];

    await Promise.all([
      API.put(`/api/sessions/${a.id}`, { order_index: newIdx }),
      API.put(`/api/sessions/${b.id}`, { order_index: idx })
    ]);

    await loadSessions(planId);
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
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
  try {
    const exercises = await API.get(`/api/sessions/${sessionId}/exercises`);
    const container = document.getElementById(`session-exercises-${sessionId}`);
    if (!container) return;
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
    const container = document.getElementById(`session-exercises-${sessionId}`);
    if (container) container.innerHTML = `<p class="text-danger">Fehler: ${e.message}</p>`;
  }
}

const SCHEME_LABELS = {
  straight:           'Konstant',
  double_progression: 'Double Progression',
  pyramid_asc:        'Pyramide ↑',
  pyramid_desc:       'Reverse Pyramide ↓',
  topset_backoff:     'Top-Set + Backoff'
};

function createExerciseItem(ex, sessionId, idx, total) {
  const div = document.createElement('div');
  div.className = 'exercise-item';
  div.id = `se-${ex.id}`;
  div.dataset.scheme = ex.scheme || 'straight';

  const repsDisplay = ex.reps_min === ex.reps_max
    ? `${ex.reps_min}`
    : `${ex.reps_min}–${ex.reps_max}`;

  const schemeTag = (ex.scheme && ex.scheme !== 'straight')
    ? ` <span style="font-size:0.68rem; background:rgba(96,165,250,0.12); color:var(--accent); border-radius:4px; padding:1px 5px;">${SCHEME_LABELS[ex.scheme] || ex.scheme}</span>`
    : '';

  div.innerHTML = `
    <div class="exercise-item-info" style="cursor:pointer;" onclick="openEditExerciseItem(${ex.id}, ${sessionId})">
      <div class="exercise-item-name">${escapeHtml(ex.name)}</div>
      <div class="exercise-item-meta">${ex.sets} × ${repsDisplay} Wdh.${schemeTag}</div>
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

  const currentScheme = container.dataset.scheme || 'straight';
  const schemeOptions = Object.entries(SCHEME_LABELS).map(([val, label]) =>
    `<option value="${val}" ${val === currentScheme ? 'selected' : ''}>${label}</option>`
  ).join('');

  infoDiv.innerHTML = `
    <div class="exercise-item-name">${escapeHtml(name)}</div>
    <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:4px;">
      <input type="number" class="form-control reps-input" value="${sets}" min="1" max="20" id="edit-sets-${seId}" placeholder="Sätze" style="width:56px;">
      <span class="text-muted">×</span>
      <input type="number" class="form-control reps-input" value="${repsMin}" min="1" max="100" id="edit-rmin-${seId}" placeholder="Min" style="width:56px;">
      <span class="text-muted">–</span>
      <input type="number" class="form-control reps-input" value="${repsMax}" min="1" max="100" id="edit-rmax-${seId}" placeholder="Max" style="width:56px;">
      <span class="text-muted" style="font-size:0.75rem;">Wdh.</span>
    </div>
    <div style="display:flex; gap:6px; align-items:center; margin-top:6px; flex-wrap:wrap;">
      <span class="text-muted" style="font-size:0.75rem;">Schema:</span>
      <select class="form-control" id="edit-scheme-${seId}" style="width:auto; font-size:0.8rem; padding:4px 8px;">
        ${schemeOptions}
      </select>
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
  const scheme = document.getElementById(`edit-scheme-${seId}`)?.value || 'straight';

  if (!sets || !repsMin || !repsMax || sets < 1 || repsMin < 1 || repsMax < repsMin) {
    showToast('Ungültige Werte', 'error');
    return;
  }

  try {
    await API.put(`/api/session-exercises/${seId}`, {
      sets,
      reps_min: repsMin,
      reps_max: repsMax,
      scheme
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
  // Close new-exercise form if open
  document.getElementById('new-exercise-form').style.display = 'none';
  document.getElementById('new-ex-toggle-btn').textContent = '+ Neue Übung erstellen';
  document.getElementById('exercise-library-modal').classList.add('show');
}

function closeExerciseLibrary() {
  document.getElementById('exercise-library-modal').classList.remove('show');
  targetSessionId = null;
}

function toggleNewExerciseForm() {
  const form = document.getElementById('new-exercise-form');
  const btn = document.getElementById('new-ex-toggle-btn');
  if (form.style.display === 'none') {
    form.style.display = 'block';
    btn.textContent = '✕ Abbrechen';
    setTimeout(() => document.getElementById('new-ex-name')?.focus(), 50);
  } else {
    form.style.display = 'none';
    btn.textContent = '+ Neue Übung erstellen';
  }
}

async function createAndAddExercise() {
  const name = document.getElementById('new-ex-name').value.trim();
  const muscle_groups = document.getElementById('new-ex-muscles').value.trim();
  const technique_tip = document.getElementById('new-ex-technique').value.trim();

  if (!name) { showToast('Name ist erforderlich', 'error'); return; }

  try {
    const exercise = await API.post('/api/exercises', { name, muscle_groups, technique_tip });
    allExercises.push(exercise);
    allExercises.sort((a, b) => a.name.localeCompare(b.name, 'de'));

    // Clear form
    document.getElementById('new-ex-name').value = '';
    document.getElementById('new-ex-muscles').value = '';
    document.getElementById('new-ex-technique').value = '';
    toggleNewExerciseForm();

    // Add directly to current session
    if (targetSessionId) {
      await addExerciseToSession(exercise.id);
    }
    showToast(`"${exercise.name}" erstellt und hinzugefügt`, 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

function filterExercises() {
  const query = document.getElementById('exercise-search').value.toLowerCase();
  const filtered = allExercises.filter(e =>
    e.name.toLowerCase().includes(query) ||
    (e.muscle_groups || '').toLowerCase().includes(query)
  );
  renderExerciseLibrary(filtered);
}

function showExerciseInfoById(exerciseId) {
  const ex = allExercises.find(e => e.id === exerciseId);
  if (ex) showExerciseInfo(ex);
}

function renderExerciseLibrary(exercises) {
  const list = document.getElementById('exercise-library-list');

  if (exercises.length === 0) {
    list.innerHTML = '<p class="text-muted text-center" style="padding:16px;">Keine Übungen gefunden</p>';
    return;
  }

  list.innerHTML = exercises.map(ex => `
    <div style="display:flex; align-items:center; padding:10px 12px; border-bottom:1px solid var(--border); gap:8px; background:transparent; transition:background 0.15s;"
         onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background=''">
      <div style="flex:1; cursor:pointer; min-width:0;" onclick="addExerciseToSession(${ex.id})">
        <div style="font-weight:600; font-size:0.95rem;">${escapeHtml(ex.name)}</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(ex.muscle_groups || '')}</div>
      </div>
      ${ex.gif_path ? `<button onclick="showExerciseInfoById(${ex.id})" style="background:none;border:none;cursor:pointer;padding:4px 6px;color:var(--accent);flex-shrink:0;" title="GIF & Info ansehen">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 16v-4m0-4h.01"/>
        </svg>
      </button>` : ''}
    </div>
  `).join('');
}

async function addExerciseToSession(exerciseId) {
  if (!targetSessionId) return;
  const sessionId = targetSessionId; // capture before closeExerciseLibrary sets it to null

  try {
    await API.post(`/api/sessions/${sessionId}/exercises`, {
      exercise_id: exerciseId,
      sets: 3,
      reps_min: 8,
      reps_max: 12
    });
    closeExerciseLibrary();
    await loadSessionExercises(sessionId);
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

// =====================
// Exercise Catalog Editor (Feature 6)
// =====================

let catalogLoaded = false;

function toggleCatalog() {
  const body = document.getElementById('catalog-body');
  const btn = document.getElementById('catalog-toggle-btn');
  const icon = document.getElementById('catalog-toggle-icon');
  if (!body) return;

  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (icon) icon.style.transform = 'rotate(90deg)';
    if (!catalogLoaded) {
      loadCatalog();
    }
  } else {
    body.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (icon) icon.style.transform = '';
  }
}

async function loadCatalog() {
  const list = document.getElementById('catalog-list');
  if (!list) return;
  list.innerHTML = '<div class="loading" style="padding:12px;"><div class="spinner" style="width:20px;height:20px;"></div></div>';

  try {
    const exercises = await API.get('/api/exercises?all=true');
    catalogLoaded = true;
    renderCatalog(exercises);
  } catch (e) {
    list.innerHTML = `<p class="text-danger" style="padding:8px;">Fehler: ${e.message}</p>`;
  }
}

function renderCatalog(exercises) {
  const list = document.getElementById('catalog-list');
  if (!list) return;

  if (exercises.length === 0) {
    list.innerHTML = '<p class="text-muted" style="padding:8px;">Keine Übungen vorhanden.</p>';
    return;
  }

  list.innerHTML = '';
  for (const ex of exercises) {
    const row = createCatalogRow(ex);
    list.appendChild(row);
  }
}

function createCatalogRow(ex) {
  const div = document.createElement('div');
  div.className = 'catalog-row';
  div.id = `catalog-row-${ex.id}`;

  const isActive = ex.active === null || ex.active === 1;
  const hasGif = !!ex.gif_path;
  const gifArg = ex.gif_path ? `'${ex.gif_path}'` : 'null';

  div.innerHTML = `
    <div class="catalog-row-info" id="catalog-info-${ex.id}">
      <div class="catalog-row-name" style="font-weight:600; font-size:0.9rem; ${isActive ? '' : 'text-decoration:line-through; color:var(--text-muted);'}">${escapeHtml(ex.name)}</div>
      <div class="catalog-row-muscles" style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(ex.muscle_groups || '')}</div>
    </div>
    <div class="catalog-row-actions">
      <button class="btn btn-ghost btn-sm" onclick="openGifPicker(${ex.id}, ${gifArg})"
              title="${hasGif ? 'GIF zugeordnet – ändern' : 'GIF zuordnen'}"
              style="padding:4px 6px; color:${hasGif ? 'var(--accent)' : 'var(--text-muted)'};">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <rect x="2" y="6" width="20" height="14" rx="2"/><path d="M8 2h8M10 6v12M14 6v12"/>
          ${hasGif ? '<path stroke-linecap="round" stroke-linejoin="round" d="M6 12l3 3 5-5" stroke-width="2.5"/>' : ''}
        </svg>
      </button>
      <label class="catalog-active-toggle" title="${isActive ? 'Aktiv – klicken zum Deaktivieren' : 'Inaktiv – klicken zum Aktivieren'}" style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:0.78rem; color:${isActive ? 'var(--success, #4ade80)' : 'var(--text-muted)'};">
        <input type="checkbox" style="display:none;" ${isActive ? 'checked' : ''} onchange="toggleExerciseActive(${ex.id}, this.checked)">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          ${isActive
            ? '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />'
            : '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />'}
        </svg>
      </label>
      <button class="btn btn-ghost btn-sm" onclick="openCatalogEdit(${ex.id})" title="Bearbeiten" style="padding:4px 6px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
    </div>
  `;

  return div;
}

async function toggleExerciseActive(exerciseId, isActive) {
  try {
    const updated = await API.put(`/api/exercises/${exerciseId}`, { active: isActive ? 1 : 0 });
    // Re-render just this row
    const row = document.getElementById(`catalog-row-${exerciseId}`);
    if (row) {
      const newRow = createCatalogRow(updated);
      row.replaceWith(newRow);
    }
    // Also update allExercises cache (the modal picker should only show active)
    const idx = allExercises.findIndex(e => e.id === exerciseId);
    if (!isActive && idx !== -1) {
      allExercises.splice(idx, 1);
    } else if (isActive && idx === -1) {
      allExercises.push(updated);
      allExercises.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    }
    showToast(isActive ? 'Übung aktiviert' : 'Übung deaktiviert', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

function openCatalogEdit(exerciseId) {
  const row = document.getElementById(`catalog-row-${exerciseId}`);
  if (!row) return;

  // Find current data from DOM
  const nameEl = row.querySelector('.catalog-row-name');
  const musclesEl = row.querySelector('.catalog-row-muscles');
  const currentName = nameEl ? nameEl.textContent : '';
  const currentMuscles = musclesEl ? musclesEl.textContent : '';

  // Fetch full exercise data for technique_tip
  API.get(`/api/exercises/${exerciseId}`).then(ex => {
    row.innerHTML = `
      <div style="flex:1; padding:4px 0;">
        <div class="form-group" style="margin-bottom:6px;">
          <input type="text" class="form-control" id="catalog-edit-name-${exerciseId}" value="${escapeAttr(ex.name)}" placeholder="Name" style="font-size:0.85rem; padding:6px 8px;">
        </div>
        <div class="form-group" style="margin-bottom:6px;">
          <input type="text" class="form-control" id="catalog-edit-muscles-${exerciseId}" value="${escapeAttr(ex.muscle_groups || '')}" placeholder="Muskelgruppen" style="font-size:0.85rem; padding:6px 8px;">
        </div>
        <div class="form-group" style="margin-bottom:8px;">
          <textarea class="form-control" id="catalog-edit-tip-${exerciseId}" rows="2" placeholder="Technik-Hinweis" style="font-size:0.82rem; padding:6px 8px; resize:vertical;">${escapeHtml(ex.technique_tip || '')}</textarea>
        </div>
        <div class="form-group" style="margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          <label style="font-size:0.8rem; color:var(--text-muted); white-space:nowrap;">Auto-Progress Schrittweite</label>
          <input type="number" class="form-control" id="catalog-edit-increment-${exerciseId}" value="${ex.increment_kg || ''}" placeholder="2.5" step="0.5" min="0.5" style="font-size:0.85rem; padding:6px 8px; width:80px;">
          <span style="font-size:0.8rem; color:var(--text-muted);">kg</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-primary btn-sm" onclick="saveCatalogEdit(${exerciseId})">Speichern</button>
          <button class="btn btn-outline btn-sm" onclick="cancelCatalogEdit(${exerciseId})">Abbrechen</button>
        </div>
      </div>
    `;
    row.className = 'catalog-row catalog-row-editing';
    setTimeout(() => document.getElementById(`catalog-edit-name-${exerciseId}`)?.focus(), 50);
  }).catch(e => showToast('Fehler: ' + e.message, 'error'));
}

async function saveCatalogEdit(exerciseId) {
  const name = document.getElementById(`catalog-edit-name-${exerciseId}`)?.value?.trim();
  const muscle_groups = document.getElementById(`catalog-edit-muscles-${exerciseId}`)?.value?.trim();
  const technique_tip = document.getElementById(`catalog-edit-tip-${exerciseId}`)?.value?.trim();
  const incrementRaw = document.getElementById(`catalog-edit-increment-${exerciseId}`)?.value;
  const increment_kg = incrementRaw ? parseFloat(incrementRaw) : 0;

  if (!name) {
    showToast('Name ist erforderlich', 'error');
    return;
  }

  try {
    const updated = await API.put(`/api/exercises/${exerciseId}`, { name, muscle_groups, technique_tip, increment_kg });
    // Replace row with fresh rendered row
    const row = document.getElementById(`catalog-row-${exerciseId}`);
    if (row) {
      const newRow = createCatalogRow(updated);
      row.replaceWith(newRow);
    }
    // Update allExercises cache
    const idx = allExercises.findIndex(e => e.id === exerciseId);
    if (idx !== -1) allExercises[idx] = updated;
    showToast('Gespeichert', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function cancelCatalogEdit(exerciseId) {
  try {
    const ex = await API.get(`/api/exercises/${exerciseId}`);
    const row = document.getElementById(`catalog-row-${exerciseId}`);
    if (row) {
      const newRow = createCatalogRow(ex);
      row.replaceWith(newRow);
    }
  } catch (e) {
    // If fetch fails, just reload the whole catalog
    loadCatalog();
  }
}

// =====================
// GIF Picker
// =====================

let gifPickerExerciseId = null;
let gifPickerSelection = null; // { gif_filename } | { gif_filename: null } (clear)
let allAvailableGifs = null;   // cache from /api/exercises/available-gifs

async function openGifPicker(exerciseId, currentGifPath) {
  gifPickerExerciseId = exerciseId;
  gifPickerSelection = null;

  const ex = allExercises.find(e => e.id === exerciseId) || {};
  document.getElementById('gif-picker-context').textContent =
    `Übung: ${ex.name || exerciseId}`;

  // Show current assignment as initial preview
  if (currentGifPath) {
    showGifPreviewSelected(currentGifPath, 'Aktuell zugeordnet');
    document.getElementById('gif-picker-confirm').disabled = false;
  } else {
    document.getElementById('gif-preview-selected').style.display = 'none';
    document.getElementById('gif-picker-confirm').disabled = true;
  }

  document.getElementById('gif-search').value = '';
  document.getElementById('gif-picker-modal').classList.add('show');

  if (!allAvailableGifs) {
    document.getElementById('gif-picker-list').innerHTML =
      '<div class="loading" style="padding:16px;"><div class="spinner" style="width:20px;height:20px;"></div></div>';
    try {
      allAvailableGifs = await API.get('/api/exercises/available-gifs');
    } catch (e) {
      document.getElementById('gif-picker-list').innerHTML =
        '<p style="padding:12px; color:var(--text-muted); font-size:0.85rem;">GIF-Daten nicht gefunden. Bitte zuerst das Dataset auf dem NAS installieren (siehe Anleitung).</p>';
      return;
    }
  }

  renderGifList(allAvailableGifs.slice(0, 60));
}

function closeGifPicker() {
  document.getElementById('gif-picker-modal').classList.remove('show');
  gifPickerExerciseId = null;
  gifPickerSelection = null;
}

function filterGifList() {
  if (!allAvailableGifs) return;
  const q = document.getElementById('gif-search').value.toLowerCase().trim();
  const filtered = q
    ? allAvailableGifs.filter(g => g.name.toLowerCase().includes(q))
    : allAvailableGifs;
  renderGifList(filtered.slice(0, 60));
}

function renderGifList(gifs) {
  const list = document.getElementById('gif-picker-list');
  if (!gifs || gifs.length === 0) {
    list.innerHTML = '<p style="padding:10px; font-size:0.85rem; color:var(--text-muted);">Keine Ergebnisse</p>';
    return;
  }
  list.innerHTML = gifs.map(g => `
    <div onclick="selectGifItem('${escapeAttr(g.gif_filename)}', '${escapeAttr(g.name)}')"
         style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-bottom:1px solid var(--border); cursor:pointer;"
         onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background=''">
      <img src="/exercise-media/${escapeAttr(g.gif_filename)}"
           style="width:52px; height:52px; object-fit:contain; border-radius:4px; flex-shrink:0; background:var(--bg-elevated);"
           loading="lazy">
      <span style="font-size:0.88rem; color:var(--text-primary);">${escapeHtml(g.name)}</span>
    </div>
  `).join('');
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function selectGifItem(gif_filename, name) {
  gifPickerSelection = { gif_filename };
  showGifPreviewSelected(gif_filename, name);
  document.getElementById('gif-picker-confirm').disabled = false;
}

function showGifPreviewSelected(gif_filename, label) {
  const container = document.getElementById('gif-preview-selected');
  container.style.display = 'block';
  document.getElementById('gif-preview-img').src = `/exercise-media/${gif_filename}`;
  document.getElementById('gif-preview-name').textContent = label || gif_filename;
}

function clearGifSelection() {
  gifPickerSelection = { gif_filename: null };
  document.getElementById('gif-preview-selected').style.display = 'none';
  document.getElementById('gif-picker-confirm').disabled = false;
}

async function confirmGifSelection() {
  if (!gifPickerExerciseId || gifPickerSelection === null) return;
  const gif_path = gifPickerSelection.gif_filename || null;

  try {
    const updated = await API.put(`/api/exercises/${gifPickerExerciseId}`, { gif_path });

    // Update allExercises cache
    const idx = allExercises.findIndex(e => e.id === gifPickerExerciseId);
    if (idx !== -1) allExercises[idx] = updated;

    // Re-render catalog row
    const row = document.getElementById(`catalog-row-${gifPickerExerciseId}`);
    if (row) row.replaceWith(createCatalogRow(updated));

    showToast(gif_path ? 'GIF zugeordnet' : 'GIF entfernt', 'success');
    closeGifPicker();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// Close GIF picker on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  const gifModal = document.getElementById('gif-picker-modal');
  if (gifModal) gifModal.addEventListener('click', e => { if (e.target === gifModal) closeGifPicker(); });
});

const CF_FOCUS_OPTIONS = [
  { id: 'conditioning', label: 'Conditioning' },
  { id: 'strength', label: 'Kraft' },
  { id: 'core', label: 'Core' },
  { id: 'engine', label: 'Engine' },
];
const CF_UNITS = ['Wdh.', 'Cal', 'Sek.', 'Runden', 'Sprint'];

let cfCatalogLoaded = false;

function toggleCrossfitCatalog() {
  const body = document.getElementById('crossfit-catalog-body');
  const btn = document.getElementById('crossfit-catalog-toggle-btn');
  const icon = document.getElementById('crossfit-catalog-toggle-icon');
  if (!body) return;

  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
  if (icon) icon.style.transform = isOpen ? '' : 'rotate(90deg)';

  if (!isOpen && !cfCatalogLoaded) {
    loadCrossfitCatalog();
  }
}

async function loadCrossfitCatalog() {
  const list = document.getElementById('crossfit-catalog-list');
  if (!list) return;
  list.innerHTML = '<div class="loading" style="padding:12px;"><div class="spinner" style="width:20px;height:20px;"></div></div>';

  try {
    const exercises = await API.get('/api/exercises?category=crossfit');
    cfCatalogLoaded = true;
    renderCrossfitCatalog(exercises);
  } catch (e) {
    list.innerHTML = `<p style="padding:8px;color:#ef4444;">Fehler: ${e.message}</p>`;
  }
}

function renderCrossfitCatalog(exercises) {
  const list = document.getElementById('crossfit-catalog-list');
  if (!list) return;
  list.innerHTML = '';

  if (exercises.length === 0) {
    list.innerHTML = '<p style="padding:8px;color:var(--text-muted);">Keine CrossFit-Übungen vorhanden.</p>';
    return;
  }

  exercises.forEach(ex => list.appendChild(createCrossfitRow(ex)));
}

function createCrossfitRow(ex) {
  const div = document.createElement('div');
  div.className = 'catalog-row';
  div.id = `cf-row-${ex.id}`;

  const focuses = (ex.emom_focus || '').split(',').map(f => f.trim()).filter(Boolean);
  const badges = focuses.map(f => {
    const opt = CF_FOCUS_OPTIONS.find(item => item.id === f);
    return `<span style="font-size:0.7rem;background:rgba(96,165,250,0.12);color:var(--accent);border-radius:4px;padding:1px 5px;">${escapeHtml(opt ? opt.label : f)}</span>`;
  }).join(' ');

  div.innerHTML = `
    <div class="catalog-row-info" id="cf-info-${ex.id}">
      <div style="font-weight:600;font-size:0.9rem;">${escapeHtml(ex.name)}</div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:3px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
        ${badges || '<span style="opacity:0.5;">Kein Fokus</span>'}
        <span style="opacity:0.4;">·</span>
        <span>${ex.emom_base_reps || '?'} ${escapeHtml(ex.emom_reps_unit || 'Wdh.')} / 60s</span>
      </div>
    </div>
    <div class="catalog-row-actions">
      <button class="btn btn-ghost btn-sm" onclick="startCrossfitEdit(${ex.id})" title="Bearbeiten" style="padding:4px 6px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
        </svg>
      </button>
      <button class="btn btn-ghost btn-sm" onclick="deleteCrossfitExercise(${ex.id}, '${escapeJsString(ex.name)}')" title="Löschen" style="padding:4px 6px;color:#ef4444;">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
      </button>
    </div>
  `;

  return div;
}

function startCrossfitEdit(exerciseId) {
  API.get(`/api/exercises/${exerciseId}`).then(ex => {
    const row = document.getElementById(`cf-row-${exerciseId}`);
    const info = document.getElementById(`cf-info-${exerciseId}`);
    if (!row || !info) return;

    const focuses = (ex.emom_focus || '').split(',').map(f => f.trim()).filter(Boolean);
    const focusBoxes = CF_FOCUS_OPTIONS.map(opt => `
      <label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:0.82rem;cursor:pointer;">
        <input type="checkbox" id="cfe-focus-${exerciseId}-${opt.id}" ${focuses.includes(opt.id) ? 'checked' : ''} style="accent-color:var(--accent);">
        ${escapeHtml(opt.label)}
      </label>
    `).join('');
    const unitOptions = CF_UNITS.map(unit =>
      `<option value="${escapeAttr(unit)}" ${(ex.emom_reps_unit || 'Wdh.') === unit ? 'selected' : ''}>${escapeHtml(unit)}</option>`
    ).join('');

    info.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px;padding:2px 0;">
        <input type="text" class="form-control" id="cfe-name-${exerciseId}" value="${escapeAttr(ex.name)}" style="font-size:0.85rem;padding:5px 8px;">
        <div style="font-size:0.74rem;color:var(--text-muted);">Fokus (Mehrfachauswahl):</div>
        <div style="display:flex;flex-wrap:wrap;gap:2px;">${focusBoxes}</div>
        <div style="display:flex;gap:8px;align-items:flex-end;margin-top:2px;">
          <div style="flex:1;">
            <div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:2px;">Wdh. pro 60s:</div>
            <input type="number" class="form-control" id="cfe-reps-${exerciseId}" value="${ex.emom_base_reps || ''}" min="1" style="font-size:0.85rem;padding:5px 8px;">
          </div>
          <div style="flex:1;">
            <div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:2px;">Einheit:</div>
            <select class="form-control" id="cfe-unit-${exerciseId}" style="font-size:0.85rem;padding:5px 8px;">${unitOptions}</select>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:4px;">
          <button class="btn btn-primary btn-sm" onclick="saveCrossfitEdit(${exerciseId})" style="flex:1;padding:6px;">Speichern</button>
          <button class="btn btn-secondary btn-sm" onclick="loadCrossfitCatalog()" style="flex:1;padding:6px;">Abbrechen</button>
        </div>
      </div>
    `;

    row.className = 'catalog-row catalog-row-editing';
    setTimeout(() => document.getElementById(`cfe-name-${exerciseId}`)?.focus(), 50);
  }).catch(e => showToast('Fehler: ' + e.message, 'error'));
}

async function saveCrossfitEdit(exerciseId) {
  const name = document.getElementById(`cfe-name-${exerciseId}`)?.value?.trim();
  if (!name) {
    showToast('Name darf nicht leer sein', 'error');
    return;
  }

  const focuses = CF_FOCUS_OPTIONS
    .filter(opt => document.getElementById(`cfe-focus-${exerciseId}-${opt.id}`)?.checked)
    .map(opt => opt.id);
  const emom_base_reps = parseInt(document.getElementById(`cfe-reps-${exerciseId}`)?.value || '0', 10);
  const emom_reps_unit = document.getElementById(`cfe-unit-${exerciseId}`)?.value || 'Wdh.';

  try {
    await API.put(`/api/exercises/${exerciseId}`, {
      name,
      emom_focus: focuses.join(','),
      emom_base_reps: emom_base_reps || null,
      emom_reps_unit,
    });
    showToast('Gespeichert', 'success');
    cfCatalogLoaded = false;
    loadCrossfitCatalog();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function deleteCrossfitExercise(exerciseId, name) {
  if (!confirm(`„${name}” löschen?`)) return;

  try {
    await API.delete(`/api/exercises/${exerciseId}`);
    showToast(`${name} gelöscht`, 'success');
    cfCatalogLoaded = false;
    loadCrossfitCatalog();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function addCrossfitExercise() {
  const name = prompt('Name der neuen CrossFit-Übung:')?.trim();
  if (!name) return;

  try {
    await API.post('/api/exercises', {
      name,
      category: 'crossfit',
      emom_focus: 'conditioning',
      emom_base_reps: 10,
      emom_reps_unit: 'Wdh.',
    });
    showToast('Übung erstellt', 'success');
    cfCatalogLoaded = false;
    loadCrossfitCatalog();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJsString(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

init();
