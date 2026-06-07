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

      const planEl = document.createElement('div');
      planEl.className = 'plan-card fade-in';

      const sessionsHTML = await buildSessionsHTML(sessions);

      planEl.innerHTML = `
        <div class="plan-card-header">
          <h3>${escapeHtml(plan.name)}</h3>
          ${plan.description ? `<span class="text-secondary" style="font-size:0.8rem;">${escapeHtml(plan.description)}</span>` : ''}
        </div>
        <div class="session-list">
          ${sessionsHTML}
        </div>
      `;

      container.appendChild(planEl);
    }

    // Setup click handlers
    container.querySelectorAll('[data-session-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sessionId = btn.dataset.sessionId;
        const planName = btn.dataset.planName;
        const sessionLabel = btn.dataset.sessionLabel;
        startTraining(sessionId, planName, sessionLabel);
      });
    });

  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Fehler beim Laden: ${e.message}</p></div>`;
  }
}

async function buildSessionsHTML(sessions) {
  const parts = [];
  for (const session of sessions) {
    let exerciseCount = '...';
    try {
      const exercises = await API.get(`/api/sessions/${session.id}/exercises`);
      exerciseCount = `${exercises.length} Übungen`;
    } catch (e) {
      exerciseCount = '';
    }

    parts.push(`
      <button class="session-btn" data-session-id="${session.id}" data-session-label="${escapeHtml(session.session_label)}" data-plan-name="">
        <div class="session-label">
          <div class="session-badge">${escapeHtml(session.session_label)}</div>
          <div class="session-info">
            <h4>Training ${escapeHtml(session.session_label)}</h4>
            <p>${exerciseCount}</p>
          </div>
        </div>
        <svg class="session-arrow" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    `);
  }
  return parts.join('');
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

// Initialize
init();
