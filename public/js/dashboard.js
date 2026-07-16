/* ============================================================
   Dashboard - Choose Training Session
   ============================================================ */

let currentUser = null;

async function init() {
  // Inject nav
  document.getElementById('nav-placeholder').innerHTML = buildNav('dashboard');

  // Auth check
  currentUser = await requireAuth();
  if (!currentUser) return;

  // Set version badge
  const vbadge = document.getElementById('app-version-badge');
  if (vbadge) vbadge.textContent = `v${APP_VERSION}`;

  // Set greeting
  document.getElementById('username-display').textContent = currentUser.username;
  const hour = new Date().getHours();
  let greeting = 'Hallo';
  if (hour < 12) greeting = 'Guten Morgen';
  else if (hour < 17) greeting = 'Guten Tag';
  else greeting = 'Guten Abend';
  document.getElementById('greeting').textContent = `${greeting}, ${currentUser.username}!`;

  // Set today info
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('today-info').textContent = today;

  // Load last workout
  loadLastWorkout();

  // Load plans
  loadPlans();

  // Deload status + exercise rotation hints (non-blocking)
  loadDeloadStatus();
  loadRotationHints();
}

// ── Deload ────────────────────────────────────────────────

async function loadDeloadStatus() {
  const card = document.getElementById('deload-card');
  if (!card) return;
  try {
    const st = await API.get('/api/deload/status');
    if (!st.enabled) { card.classList.add('hidden'); return; }

    if (st.active) {
      const daysLeft = Math.max(0, Math.ceil((new Date(st.active_until) - new Date()) / 86400000));
      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:1.8rem;">🔄</div>
          <div style="flex:1;">
            <div style="font-weight:700; color:var(--accent);">Deload-Woche aktiv</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
              Noch ${daysLeft} Tag${daysLeft === 1 ? '' : 'e'} · halbe Sätze, reduziertes Gewicht (${st.deload_percent}%)
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="endDeload()">Beenden</button>
        </div>`;
      card.classList.remove('hidden');
    } else if (st.due) {
      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:1.8rem;">🛌</div>
          <div style="flex:1;">
            <div style="font-weight:700;">Deload fällig</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
              Woche ${st.week_in_cycle} im Zyklus (Intervall: ${st.interval_weeks} Wochen) — Zeit für eine Erholungswoche.
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="startDeload()">Starten</button>
        </div>`;
      card.classList.remove('hidden');
    } else if (st.early_warning) {
      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:1.8rem;">😤</div>
          <div style="flex:1;">
            <div style="font-weight:700;">Viel „zu schwer" zuletzt</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
              Deine letzten Trainings hatten auffällig viele 😤-Sätze — ein vorgezogener Deload könnte helfen.
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="startDeload()">Deload starten</button>
        </div>`;
      card.classList.remove('hidden');
    } else if (st.post_deload) {
      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:1.8rem;">🌱</div>
          <div style="flex:1;">
            <div style="font-weight:700;">Wiedereinstieg nach Deload</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
              Diese Woche empfiehlt die App 90 % deiner alten Arbeitsgewichte — ab nächster Woche geht's normal weiter.
            </div>
          </div>
        </div>`;
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  } catch (e) {
    card.classList.add('hidden');
  }
}

async function startDeload() {
  if (!confirm('Deload-Woche jetzt starten? 7 Tage lang gelten reduzierte Empfehlungen.')) return;
  try {
    await API.post('/api/deload/start', {});
    showToast('Deload-Woche gestartet 🛌', 'success');
    loadDeloadStatus();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function endDeload() {
  if (!confirm('Deload beenden? Der neue Trainingszyklus startet heute.')) return;
  try {
    await API.post('/api/deload/end', {});
    showToast('Deload beendet — neuer Zyklus läuft', 'success');
    loadDeloadStatus();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// ── Exercise rotation hints ───────────────────────────────

async function loadRotationHints() {
  const card = document.getElementById('rotation-card');
  if (!card) return;
  try {
    const hints = await API.get('/api/rotation-hints');
    const dismissed = JSON.parse(localStorage.getItem('rotationDismissed') || '{}');
    const now = Date.now();
    // Re-show a dismissed hint after 4 weeks
    const visible = hints.filter(h => !dismissed[h.exercise_id] || (now - dismissed[h.exercise_id]) > 28 * 86400000);

    if (visible.length === 0) { card.classList.add('hidden'); return; }

    const h = visible[0]; // one hint at a time is enough
    card.innerHTML = `
      <div style="display:flex; align-items:flex-start; gap:12px;">
        <div style="font-size:1.8rem;">🔀</div>
        <div style="flex:1;">
          <div style="font-weight:700;">Zeit für Abwechslung?</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
            <strong style="color:var(--text-primary);">${escapeHtml(h.name)}</strong> machst du seit ${h.weeks} Wochen.
            Alternativen für dieselbe Muskelgruppe:<br>
            ${h.alternatives.map(a => `• ${escapeHtml(a)}`).join('<br>')}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="dismissRotationHint(${h.exercise_id})" title="Ausblenden">×</button>
      </div>`;
    card.classList.remove('hidden');
  } catch (e) {
    card.classList.add('hidden');
  }
}

function dismissRotationHint(exerciseId) {
  const dismissed = JSON.parse(localStorage.getItem('rotationDismissed') || '{}');
  dismissed[exerciseId] = Date.now();
  localStorage.setItem('rotationDismissed', JSON.stringify(dismissed));
  loadRotationHints();
}

async function loadLastWorkout() {
  try {
    const workouts = await API.get('/api/workouts');
    if (workouts.length > 0) {
      const last = workouts[0];
      const card = document.getElementById('last-workout-card');
      const info = document.getElementById('last-workout-info');
      card.classList.remove('hidden');
      const date = formatDate(last.started_at);
      const sets = last.total_sets || 0;
      info.innerHTML = `
        <span class="workout-badge" style="font-size:0.75rem;padding:1px 6px;">${last.session_label}</span>
        &nbsp; ${last.plan_name} &nbsp;·&nbsp; ${date} &nbsp;·&nbsp; ${sets} Sätze
      `;
    }
  } catch (e) {
    // ignore
  }
}

async function loadPlans() {
  const container = document.getElementById('plans-container');
  const noPlans = document.getElementById('no-plans');

  try {
    const plans = await API.get('/api/plans');

    if (plans.length === 0) {
      container.innerHTML = '';
      noPlans.classList.remove('hidden');
      return;
    }

    container.innerHTML = '';
    noPlans.classList.add('hidden');

    for (const plan of plans) {
      const sessions = await API.get(`/api/plans/${plan.id}/sessions`);
      if (sessions.length === 0) continue;

      // Sort: NULL (never trained) first, then oldest first
      sessions.sort((a, b) => {
        if (!a.last_trained_at && !b.last_trained_at) return 0;
        if (!a.last_trained_at) return -1;
        if (!b.last_trained_at) return 1;
        return new Date(a.last_trained_at) - new Date(b.last_trained_at);
      });

      const planEl = document.createElement('div');
      planEl.className = 'plan-card fade-in';

      planEl.innerHTML = `
        <div class="plan-card-header">
          <h3>${escapeHtml(plan.name)}</h3>
          ${plan.description ? `<span class="text-secondary" style="font-size:0.8rem;">${escapeHtml(plan.description)}</span>` : ''}
        </div>
        <div class="session-list" id="session-list-${plan.id}">
          ${buildSessionsHTML(sessions, plan.name)}
        </div>
      `;

      container.appendChild(planEl);
    }

    // Setup click handlers for session headers (expand/collapse)
    container.querySelectorAll('.session-card-header').forEach(header => {
      header.addEventListener('click', () => {
        const sessionId = header.dataset.sessionId;
        toggleSession(sessionId, header.dataset.planName, header.dataset.sessionLabel);
      });
    });

  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Fehler beim Laden: ${e.message}</p></div>`;
  }
}

function buildSessionsHTML(sessions, planName) {
  return sessions.map(session => {
    let lastTrainedBadge;
    if (session.last_trained_at) {
      const d = new Date(session.last_trained_at);
      const dateStr = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
      lastTrainedBadge = `<span class="session-last-trained">Zuletzt: ${dateStr}</span>`;
    } else {
      lastTrainedBadge = `<span class="session-last-trained session-never-trained">Noch nie</span>`;
    }

    return `
      <div class="session-expandable" id="session-expandable-${session.id}">
        <div class="session-card-header"
             data-session-id="${session.id}"
             data-session-label="${escapeAttr(session.session_label)}"
             data-plan-name="${escapeAttr(planName)}">
          <div class="session-label">
            <div class="session-badge">${escapeHtml(session.session_label)}</div>
            <div class="session-info">
              <h4>Training ${escapeHtml(session.session_label)}</h4>
              ${lastTrainedBadge}
            </div>
          </div>
          <svg class="session-expand-arrow" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div class="session-expand-body" id="session-body-${session.id}" style="display:none;">
          <div class="session-exercise-list" id="session-exercises-${session.id}">
            <div class="loading" style="padding:8px;"><div class="spinner" style="width:16px;height:16px;"></div></div>
          </div>
          <button class="btn btn-primary btn-full session-start-btn" onclick="startTraining(${session.id}, '${escapeJsString(planName)}', '${escapeJsString(session.session_label)}')">
            Training starten
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function toggleSession(sessionId, planName, sessionLabel) {
  const body = document.getElementById(`session-body-${sessionId}`);
  const arrow = document.querySelector(`#session-expandable-${sessionId} .session-expand-arrow`);

  if (body.style.display !== 'none') {
    body.style.display = 'none';
    if (arrow) arrow.style.transform = '';
    return;
  }

  body.style.display = 'block';
  if (arrow) arrow.style.transform = 'rotate(90deg)';

  // Lazy-load exercises if not yet loaded
  const listEl = document.getElementById(`session-exercises-${sessionId}`);
  if (!listEl.dataset.loaded) {
    try {
      const exercises = await API.get(`/api/sessions/${sessionId}/exercises`);
      listEl.dataset.loaded = '1';
      if (exercises.length === 0) {
        listEl.innerHTML = '<p class="text-muted" style="font-size:0.85rem; padding:4px 0;">Keine Übungen zugewiesen.</p>';
      } else {
        listEl.innerHTML = exercises.map(ex => {
          const reps = ex.reps_min === ex.reps_max ? ex.reps_min : `${ex.reps_min}–${ex.reps_max}`;
          return `<div class="session-exercise-row">
            <span class="session-exercise-name">${escapeHtml(ex.name)}</span>
            <span class="session-exercise-meta">${ex.sets}×${reps}<span id="dash-weight-${ex.id}"></span></span>
          </div>`;
        }).join('');

        // Fill in recommended weights async so you know what to load on the
        // bar before even starting the workout.
        exercises.forEach(ex => {
          API.get(`/api/recommendations/${ex.id}`).then(rec => {
            const el = document.getElementById(`dash-weight-${ex.id}`);
            if (el && rec.recommended_weight > 0) {
              el.innerHTML = ` · <strong style="color:var(--accent);">${formatWeight(rec.recommended_weight)}</strong>`;
            }
          }).catch(() => {});
        });
      }
    } catch (e) {
      listEl.innerHTML = `<p class="text-danger" style="font-size:0.85rem;">Fehler: ${e.message}</p>`;
    }
  }
}

async function startTraining(sessionId, planName, sessionLabel) {
  try {
    const workout = await API.post('/api/workouts/start', { session_id: parseInt(sessionId) });
    // Store workout info for training page
    WorkoutStorage.save({
      workoutId: workout.id,
      sessionId: parseInt(sessionId),
      sessionLabel,
      planName,
      startedAt: new Date().toISOString()
    });
    window.location.href = '/training.html';
  } catch (e) {
    showToast('Fehler beim Starten: ' + e.message, 'error');
  }
}

async function doLogout() {
  try {
    await API.post('/api/auth/logout');
    WorkoutStorage.clear();
    window.location.href = '/index.html';
  } catch (e) {
    window.location.href = '/index.html';
  }
}

function escapeHtml(str) {
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

// Initialize
init();
