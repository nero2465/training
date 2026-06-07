/* ============================================================
   Training Session - Main Logic
   ============================================================ */

// State
let workoutData = null;
let exercises = [];
let currentExerciseIndex = 0;
let currentSetNumber = 1;
let currentWeight = 0;
let currentReps = 8;
let loggedSets = {}; // { sessionExerciseId: [{ set_number, weight, reps }] }
let sessionTimerInterval = null;
let sessionSeconds = 0;
let workoutId = null;
let sessionId = null;
let sessionLabel = '';
let startedAt = null;

// Rest timer state
let restDuration = 60;
let restRemaining = 60;
let restInterval = null;
let restPaused = false;
let restAfterLastSet = false; // if true, advance to next exercise when done

async function init() {
  // Ensure audio ctx available
  getAudioContext();

  // Load workout from storage
  workoutData = WorkoutStorage.load();
  if (!workoutData) {
    showToast('Kein aktives Training gefunden.', 'error');
    setTimeout(() => window.location.href = '/dashboard.html', 1500);
    return;
  }

  workoutId = workoutData.workoutId;
  sessionId = workoutData.sessionId;
  sessionLabel = workoutData.sessionLabel;
  startedAt = new Date(workoutData.startedAt);

  // Auth check
  const user = await requireAuth();
  if (!user) return;

  document.getElementById('training-title').textContent = `Training ${sessionLabel}`;

  // Load exercises
  await loadExercises();

  // Start session timer
  startSessionTimer();
}

async function loadExercises() {
  try {
    exercises = await API.get(`/api/sessions/${sessionId}/exercises`);
    if (exercises.length === 0) {
      showToast('Keine Übungen in dieser Einheit.', 'error');
      return;
    }

    // Init logged sets
    exercises.forEach(ex => {
      loggedSets[ex.id] = [];
    });

    // Build progress dots
    buildProgressTrack();

    // Show first exercise
    document.getElementById('loading-state').style.display = 'none';
    showExercise(0);
  } catch (e) {
    document.getElementById('loading-state').innerHTML =
      `<p class="text-danger">Fehler: ${e.message}</p>`;
  }
}

function buildProgressTrack() {
  const track = document.getElementById('progress-track');
  track.innerHTML = exercises.map((ex, i) =>
    `<div class="progress-dot" id="dot-${i}" title="${ex.name}"></div>`
  ).join('');
}

function updateProgressDots() {
  exercises.forEach((ex, i) => {
    const dot = document.getElementById(`dot-${i}`);
    if (!dot) return;
    dot.className = 'progress-dot';
    if (i < currentExerciseIndex) dot.classList.add('done');
    else if (i === currentExerciseIndex) dot.classList.add('active');
  });
}

async function showExercise(index) {
  currentExerciseIndex = index;
  updateProgressDots();

  if (index >= exercises.length) {
    // All done
    showAllDone();
    return;
  }

  const ex = exercises[index];
  currentSetNumber = (loggedSets[ex.id] || []).length + 1;

  // Show card
  const card = document.getElementById('current-exercise-card');
  card.classList.remove('hidden');

  document.getElementById('exercise-name').textContent = ex.name;

  let metaText = `${ex.sets} × `;
  if (ex.reps_min === ex.reps_max) {
    metaText += `${ex.reps_min} Wdh.`;
  } else {
    metaText += `${ex.reps_min}–${ex.reps_max} Wdh.`;
  }
  if (ex.muscle_groups) metaText += ` · ${ex.muscle_groups}`;
  document.getElementById('exercise-meta').textContent = metaText;

  // Build set bubbles
  buildSetBubbles(ex);

  // Set reps to target (midpoint)
  currentReps = ex.reps_max || ex.reps_min;
  updateRepsDisplay();

  // Load recommendation
  await loadRecommendation(ex.id);

  // Update logged sets list
  updateLoggedSetsList(ex);

  // Info button
  document.getElementById('exercise-info-btn').onclick = () => {
    showExerciseInfo(ex);
  };

  // Update end training area
  document.getElementById('end-training-area').style.display = 'none';
  document.getElementById('abort-area').style.display = 'block';

  // Render completed exercises above
  renderCompletedExercises();
}

function buildSetBubbles(ex) {
  const grid = document.getElementById('sets-grid');
  const logged = loggedSets[ex.id] || [];
  grid.innerHTML = '';

  for (let i = 1; i <= ex.sets; i++) {
    const bubble = document.createElement('div');
    bubble.className = 'set-bubble';
    bubble.textContent = i;

    if (i <= logged.length) {
      bubble.classList.add('done');
    } else if (i === logged.length + 1) {
      bubble.classList.add('active');
    }

    bubble.addEventListener('click', () => {
      // Click to jump to set (if already logged, do nothing; if current, fine)
    });

    grid.appendChild(bubble);
  }
}

function updateLoggedSetsList(ex) {
  const list = document.getElementById('logged-sets-list');
  const logged = loggedSets[ex.id] || [];

  if (logged.length === 0) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = logged.map((s, i) => `
    <div class="set-log-row">
      <span class="set-log-num">Satz ${i + 1}</span>
      <span class="set-log-detail">${s.weight} kg × ${s.reps} Wdh.</span>
    </div>
  `).join('');
}

async function loadRecommendation(sessionExerciseId) {
  const hint = document.getElementById('recommendation-hint');
  try {
    const rec = await API.get(`/api/recommendations/${sessionExerciseId}`);
    if (rec.recommended_weight > 0) {
      hint.style.display = 'block';
      hint.innerHTML = `Empfehlung: <strong>${rec.recommended_weight} kg</strong> (letztes Training)`;
      // Pre-set weight to recommended
      if ((loggedSets[sessionExerciseId] || []).length === 0) {
        currentWeight = rec.recommended_weight;
        updateWeightDisplay();
      }
    } else {
      hint.style.display = 'none';
      if (currentWeight === 0) {
        updateWeightDisplay();
      }
    }
  } catch (e) {
    hint.style.display = 'none';
  }
}

function adjustWeight(delta) {
  currentWeight = Math.max(0, Math.round((currentWeight + delta) * 10) / 10);
  updateWeightDisplay();
}

function adjustReps(delta) {
  currentReps = Math.max(1, currentReps + delta);
  updateRepsDisplay();
}

function updateWeightDisplay() {
  const display = document.getElementById('weight-display');
  display.textContent = currentWeight % 1 === 0 ? currentWeight : currentWeight.toFixed(1);
}

function updateRepsDisplay() {
  document.getElementById('reps-display').textContent = currentReps;
}

async function logSet() {
  const btn = document.getElementById('log-set-btn');
  btn.disabled = true;

  const ex = exercises[currentExerciseIndex];
  const logged = loggedSets[ex.id] || [];
  const setNum = logged.length + 1;

  try {
    // Save to server
    await API.post(`/api/workouts/${workoutId}/sets`, {
      session_exercise_id: ex.id,
      set_number: setNum,
      weight: currentWeight,
      reps: currentReps
    });

    // Save locally
    logged.push({ set_number: setNum, weight: currentWeight, reps: currentReps });
    loggedSets[ex.id] = logged;

    // Update UI
    buildSetBubbles(ex);
    updateLoggedSetsList(ex);

    const isLastSet = logged.length >= ex.sets;

    if (isLastSet) {
      // Last set done
      restAfterLastSet = true;
      showToast(`${ex.name} abgeschlossen! 💪`, 'success');
      startRestTimer(true);
    } else {
      // More sets remain
      restAfterLastSet = false;
      currentSetNumber = logged.length + 1;
      startRestTimer(false);
    }

  } catch (e) {
    showToast('Fehler beim Speichern: ' + e.message, 'error');
    btn.disabled = false;
  }
}

function startRestTimer(afterLastSet) {
  restAfterLastSet = afterLastSet;
  restRemaining = restDuration;
  restPaused = false;

  // Show next exercise info if last set
  const nextInfo = document.getElementById('next-exercise-info');
  const nextNameEl = document.getElementById('next-exercise-name');

  if (afterLastSet && currentExerciseIndex + 1 < exercises.length) {
    const next = exercises[currentExerciseIndex + 1];
    nextInfo.style.display = 'block';
    nextNameEl.textContent = next.name;
  } else {
    nextInfo.style.display = 'none';
  }

  // Show overlay
  document.getElementById('rest-timer-overlay').classList.remove('hidden');
  document.getElementById('rest-toggle-btn').textContent = 'Pause';

  updateRestDisplay();
  updateRingProgress();

  // Start countdown
  if (restInterval) clearInterval(restInterval);
  restInterval = setInterval(restTick, 1000);
}

function restTick() {
  if (restPaused) return;

  restRemaining--;
  updateRestDisplay();
  updateRingProgress();

  if (restRemaining <= 0) {
    clearInterval(restInterval);
    restInterval = null;
    playTimerDone();
    timerComplete();
  }
}

function updateRestDisplay() {
  document.getElementById('timer-display').textContent = restRemaining;
  document.getElementById('rest-total-label').textContent = `${restDuration}s`;

  const displayEl = document.getElementById('timer-display');
  if (restRemaining <= 10) {
    displayEl.style.color = 'var(--accent)';
  } else {
    displayEl.style.color = 'var(--text-primary)';
  }
}

function updateRingProgress() {
  const circumference = 553; // 2 * PI * 88
  const progress = restRemaining / restDuration;
  const offset = circumference * (1 - progress);
  document.getElementById('ring-progress').style.strokeDashoffset = offset;
}

function toggleRestTimer() {
  restPaused = !restPaused;
  document.getElementById('rest-toggle-btn').textContent = restPaused ? 'Weiter' : 'Pause';
}

function adjustRestDuration(delta) {
  restDuration = Math.max(10, restDuration + delta);
  // If remaining is more than new duration, cap it
  if (restRemaining > restDuration) {
    restRemaining = restDuration;
  }
  updateRestDisplay();
  updateRingProgress();
}

function skipRest() {
  if (restInterval) {
    clearInterval(restInterval);
    restInterval = null;
  }
  timerComplete();
}

function timerComplete() {
  document.getElementById('rest-timer-overlay').classList.add('hidden');

  const ex = exercises[currentExerciseIndex];
  const btn = document.getElementById('log-set-btn');
  btn.disabled = false;

  if (restAfterLastSet) {
    // Advance to next exercise
    const nextIndex = currentExerciseIndex + 1;
    if (nextIndex >= exercises.length) {
      showAllDone();
    } else {
      showExercise(nextIndex);
    }
  } else {
    // Same exercise, next set
    updateLoggedSetsList(ex);
  }
}

function showAllDone() {
  document.getElementById('current-exercise-card').classList.add('hidden');
  document.getElementById('end-training-area').style.display = 'block';
  document.getElementById('abort-area').style.display = 'none';

  // Update progress dots
  exercises.forEach((_, i) => {
    const dot = document.getElementById(`dot-${i}`);
    if (dot) dot.className = 'progress-dot done';
  });
}

function renderCompletedExercises() {
  const container = document.getElementById('completed-exercises');
  container.innerHTML = '';

  for (let i = 0; i < currentExerciseIndex; i++) {
    const ex = exercises[i];
    const logged = loggedSets[ex.id] || [];

    const div = document.createElement('div');
    div.className = 'completed-exercise-card fade-in';

    const setsHtml = logged.map(s =>
      `<span class="completed-set-chip">${s.weight}kg × ${s.reps}</span>`
    ).join('');

    div.innerHTML = `
      <div class="ex-name">
        <span class="check-icon">✓</span>
        ${escapeHtml(ex.name)}
      </div>
      <div class="completed-sets-row">${setsHtml}</div>
    `;

    container.appendChild(div);
  }
}

// Session Timer
function startSessionTimer() {
  // Calculate seconds already elapsed
  if (startedAt) {
    sessionSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  }

  sessionTimerInterval = setInterval(() => {
    sessionSeconds++;
    document.getElementById('session-timer').textContent = formatDuration(sessionSeconds);
  }, 1000);

  document.getElementById('session-timer').textContent = formatDuration(sessionSeconds);
}

async function endTraining() {
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);
  if (restInterval) clearInterval(restInterval);

  try {
    await API.put(`/api/workouts/${workoutId}/end`);
    WorkoutStorage.clear();

    // Show completion overlay
    const totalSets = Object.values(loggedSets).reduce((sum, sets) => sum + sets.length, 0);
    document.getElementById('done-summary').textContent =
      `${exercises.length} Übungen · ${totalSets} Sätze · ${formatDuration(sessionSeconds)}`;
    document.getElementById('training-done-overlay').classList.remove('hidden');

  } catch (e) {
    showToast('Fehler beim Beenden: ' + e.message, 'error');
  }
}

async function confirmEndTraining() {
  if (!confirm('Training jetzt beenden?')) return;
  await endTraining();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Prevent accidental navigation away during training
window.addEventListener('beforeunload', (e) => {
  if (workoutId && !document.getElementById('training-done-overlay').classList.contains('hidden') === false) {
    // Workout still in progress
  }
});

// Initialize
init();
