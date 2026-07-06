/* ============================================================
   EMOM Timer — Every Minute on the Minute
   ============================================================ */

const RING_CIRCUMFERENCE = 2 * Math.PI * 98;
const PREP_SECONDS = 10;

let CROSSFIT_EXERCISES = [
  { id: 'burpees', name: 'Burpees', category: 'bodyweight', focus: ['conditioning', 'engine'], baseReps60: 8, unit: 'Wdh.' },
  { id: 'air-squats', name: 'Air Squats', category: 'bodyweight', focus: ['conditioning', 'engine'], baseReps60: 20, unit: 'Wdh.' },
  { id: 'push-ups', name: 'Push-ups', category: 'bodyweight', focus: ['conditioning', 'core'], baseReps60: 15, unit: 'Wdh.' },
  { id: 'sit-ups', name: 'Sit-ups / AbMat', category: 'bodyweight', focus: ['core'], baseReps60: 20, unit: 'Wdh.' },
  { id: 'box-jumps', name: 'Box Jumps', category: 'bodyweight', focus: ['conditioning'], baseReps60: 10, unit: 'Wdh.' },
  { id: 'lunges', name: 'Lunges', category: 'bodyweight', focus: ['conditioning', 'engine'], baseReps60: 16, unit: 'Wdh.' },
  { id: 'plank', name: 'Plank Hold', category: 'bodyweight', focus: ['core'], baseReps60: 45, unit: 'Sek.' },
  { id: 'pull-ups', name: 'Pull-ups', category: 'gymnastics', focus: ['strength', 'core'], baseReps60: 8, unit: 'Wdh.' },
  { id: 'toes-to-bar', name: 'Toes-to-Bar', category: 'gymnastics', focus: ['core'], baseReps60: 8, unit: 'Wdh.' },
  { id: 'hanging-knee', name: 'Hanging Knee Raises', category: 'gymnastics', focus: ['core'], baseReps60: 12, unit: 'Wdh.' },
  { id: 'hspu', name: 'Handstand Push-ups', category: 'gymnastics', focus: ['strength', 'core'], baseReps60: 5, unit: 'Wdh.' },
  { id: 'wall-walks', name: 'Wall Walks', category: 'gymnastics', focus: ['core', 'strength'], baseReps60: 3, unit: 'Wdh.' },
  { id: 'hollow-hold', name: 'Hollow Hold', category: 'gymnastics', focus: ['core'], baseReps60: 30, unit: 'Sek.' },
  { id: 'deadlifts', name: 'Deadlifts', category: 'barbell', focus: ['strength'], baseReps60: 5, unit: 'Wdh.' },
  { id: 'front-squats', name: 'Front Squats', category: 'barbell', focus: ['strength'], baseReps60: 5, unit: 'Wdh.' },
  { id: 'back-squats', name: 'Back Squats', category: 'barbell', focus: ['strength'], baseReps60: 5, unit: 'Wdh.' },
  { id: 'oh-squats', name: 'Overhead Squats', category: 'barbell', focus: ['strength'], baseReps60: 5, unit: 'Wdh.' },
  { id: 'push-press', name: 'Push Press', category: 'barbell', focus: ['strength', 'engine'], baseReps60: 6, unit: 'Wdh.' },
  { id: 'strict-press', name: 'Strict Press', category: 'barbell', focus: ['strength'], baseReps60: 5, unit: 'Wdh.' },
  { id: 'thrusters', name: 'Thrusters', category: 'barbell', focus: ['strength', 'engine'], baseReps60: 7, unit: 'Wdh.' },
  { id: 'power-cleans', name: 'Power Cleans', category: 'barbell', focus: ['strength'], baseReps60: 5, unit: 'Wdh.' },
  { id: 'squat-cleans', name: 'Squat Cleans', category: 'barbell', focus: ['strength'], baseReps60: 3, unit: 'Wdh.' },
  { id: 'power-snatches', name: 'Power Snatches', category: 'barbell', focus: ['strength'], baseReps60: 3, unit: 'Wdh.' },
  { id: 'clean-jerk', name: 'Clean & Jerks', category: 'barbell', focus: ['strength'], baseReps60: 3, unit: 'Wdh.' },
  { id: 'hang-cleans', name: 'Hang Power Cleans', category: 'barbell', focus: ['strength', 'engine'], baseReps60: 5, unit: 'Wdh.' },
  { id: 'hang-snatches', name: 'Hang Power Snatches', category: 'barbell', focus: ['strength'], baseReps60: 5, unit: 'Wdh.' },
  { id: 'kb-swings', name: 'Kettlebell Swings', category: 'kettlebell', focus: ['conditioning', 'engine'], baseReps60: 15, unit: 'Wdh.' },
  { id: 'goblet-squats', name: 'Goblet Squats', category: 'kettlebell', focus: ['engine'], baseReps60: 12, unit: 'Wdh.' },
  { id: 'db-snatches', name: 'Dumbbell Snatches', category: 'kettlebell', focus: ['engine', 'strength'], baseReps60: 10, unit: 'Wdh.' },
  { id: 'db-clean-jerk', name: 'Dumbbell Clean & Jerk', category: 'kettlebell', focus: ['engine', 'strength'], baseReps60: 8, unit: 'Wdh.' },
  { id: 'db-thrusters', name: 'Dumbbell Thrusters', category: 'kettlebell', focus: ['engine'], baseReps60: 10, unit: 'Wdh.' },
  { id: 'farmers-carry', name: "Farmer's Carry", category: 'kettlebell', focus: ['engine'], baseReps60: 40, unit: 'Sek.' },
  { id: 'russian-twists', name: 'Russian Twists', category: 'kettlebell', focus: ['core'], baseReps60: 20, unit: 'Wdh.' },
  { id: 'oh-lunges', name: 'Single-arm OH Lunges', category: 'kettlebell', focus: ['engine', 'core'], baseReps60: 10, unit: 'Wdh.' },
  { id: 'row-cal', name: 'Row Calories', category: 'cardio', focus: ['conditioning'], baseReps60: 12, unit: 'Cal' },
  { id: 'bike-cal', name: 'Bike / Assault Bike', category: 'cardio', focus: ['conditioning'], baseReps60: 12, unit: 'Cal' },
  { id: 'ski-cal', name: 'SkiErg Calories', category: 'cardio', focus: ['conditioning'], baseReps60: 10, unit: 'Cal' },
  { id: 'double-unders', name: 'Double Unders', category: 'cardio', focus: ['conditioning'], baseReps60: 30, unit: 'Wdh.' },
  { id: 'single-unders', name: 'Single Unders', category: 'cardio', focus: ['conditioning'], baseReps60: 60, unit: 'Wdh.' },
  { id: 'shuttle-runs', name: 'Shuttle Runs', category: 'cardio', focus: ['conditioning'], baseReps60: 2, unit: 'Runden' },
  { id: 'sprints', name: 'Sprints', category: 'cardio', focus: ['conditioning'], baseReps60: 1, unit: 'Sprint' },
  { id: 'wall-balls', name: 'Wall Balls', category: 'cardio', focus: ['conditioning', 'engine'], baseReps60: 12, unit: 'Wdh.' },
];

let totalMinutes = 10;
let totalRounds = 10;
let _totalSecs = 0;
let _intSecs = 0;
let elapsed = 0;
let intElapsed = 0;
let currentRound = 1;
let running = false;
let paused = false;
let tickInterval = null;
let prepping = false;
let prepRemaining = 0;
let prepInterval = null;
let selectedFocus = 'conditioning';
let emomExercises = [];

function updateSetupDisplay() {
  const intSecs = Math.max(1, Math.floor((totalMinutes * 60) / totalRounds));
  document.getElementById('setup-total-display').textContent = `${totalMinutes} min`;
  document.getElementById('setup-rounds-display').textContent = totalRounds;
  document.getElementById('setup-interval-display').textContent = formatDuration(intSecs);
}

function adjustTotalTime(delta) {
  totalMinutes = Math.max(1, Math.min(60, totalMinutes + delta));
  updateSetupDisplay();
}

function adjustRounds(delta) {
  totalRounds = Math.max(1, Math.min(60, totalRounds + delta));
  updateSetupDisplay();
}

async function showExerciseScreen() {
  const intSecs = Math.floor((totalMinutes * 60) / totalRounds);
  if (intSecs < 5) {
    showToast('Intervall zu kurz – mindestens 5 Sekunden', 'error');
    return;
  }

  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('exercise-screen').classList.remove('hidden');
  document.getElementById('ex-screen-info').textContent = `${totalRounds} Runden · ${formatDuration(intSecs)} pro Runde`;

  if (CROSSFIT_EXERCISES.length === 0 || typeof CROSSFIT_EXERCISES[0].id === 'string') {
    await loadCrossfitExercisesFromAPI();
  }

  if (emomExercises.length === 0) suggestExercises();
  renderExerciseScreen();
}

async function loadCrossfitExercisesFromAPI() {
  try {
    const data = await API.get('/api/exercises?category=crossfit');
    if (data.length > 0) {
      CROSSFIT_EXERCISES = data.map(e => ({
        id: e.id,
        name: e.name,
        category: 'crossfit',
        focus: (e.emom_focus || 'conditioning').split(',').map(f => f.trim()).filter(Boolean),
        baseReps60: e.emom_base_reps || 10,
        unit: e.emom_reps_unit || 'Wdh.',
      }));
    }
  } catch (e) {
    console.warn('CrossFit exercises API load failed, using fallback:', e);
  }
}

function backToSetup() {
  document.getElementById('exercise-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
}

function setFocus(focusId) {
  selectedFocus = focusId;
  suggestExercises();
  renderExerciseScreen();
}

function calcReps(exercise, intervalSecs) {
  return Math.max(1, Math.round(exercise.baseReps60 * (intervalSecs / 60)));
}

function suggestExercises() {
  const intSecs = Math.floor((totalMinutes * 60) / totalRounds);
  const pool = CROSSFIT_EXERCISES.filter(ex => ex.focus.includes(selectedFocus));
  const count = Math.min(Math.max(2, Math.ceil(totalRounds / 3)), 5);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  emomExercises = shuffled.slice(0, count).map(ex => ({ ...ex, reps: calcReps(ex, intSecs) }));
}

function toggleExercise(exerciseId) {
  const idx = emomExercises.findIndex(ex => ex.id === exerciseId);
  if (idx >= 0) {
    emomExercises.splice(idx, 1);
  } else {
    const ex = CROSSFIT_EXERCISES.find(item => item.id === exerciseId);
    if (!ex) return;
    const intSecs = Math.floor((totalMinutes * 60) / totalRounds);
    emomExercises.push({ ...ex, reps: calcReps(ex, intSecs) });
  }
  renderExerciseScreen();
}

function moveExercise(exerciseId, dir) {
  const idx = emomExercises.findIndex(ex => ex.id === exerciseId);
  const newIdx = idx + dir;
  if (idx < 0 || newIdx < 0 || newIdx >= emomExercises.length) return;
  [emomExercises[idx], emomExercises[newIdx]] = [emomExercises[newIdx], emomExercises[idx]];
  renderExerciseScreen();
}

function renderExerciseScreen() {
  document.querySelectorAll('.focus-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.focus === selectedFocus);
  });

  const intSecs = Math.floor((totalMinutes * 60) / totalRounds);
  const selectedIds = new Set(emomExercises.map(ex => ex.id));
  const selectedList = document.getElementById('selected-exercises-list');
  const focusList = document.getElementById('focus-exercises-list');
  const otherList = document.getElementById('other-exercises-list');

  document.getElementById('selected-count').textContent = emomExercises.length;

  if (emomExercises.length === 0) {
    selectedList.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:4px 0 2px;">Noch keine Übungen ausgewählt</div>';
  } else {
    selectedList.innerHTML = emomExercises.map((ex, i) => `
      <div class="emom-ex-row selected">
        <input type="checkbox" checked style="flex-shrink:0;cursor:pointer;accent-color:var(--accent);" onchange="toggleExercise('${ex.id}')">
        <span class="emom-ex-name">${ex.name}</span>
        <span class="emom-ex-reps accent">× ${ex.reps} ${ex.unit}</span>
        <div class="emom-ex-order">
          <button onclick="moveExercise('${ex.id}', -1)" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button onclick="moveExercise('${ex.id}', 1)" ${i === emomExercises.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
      </div>
    `).join('');
  }

  const focusExercises = CROSSFIT_EXERCISES.filter(ex => ex.focus.includes(selectedFocus) && !selectedIds.has(ex.id));
  focusList.innerHTML = focusExercises.length
    ? focusExercises.map(ex => `
      <div class="emom-ex-row">
        <input type="checkbox" style="flex-shrink:0;cursor:pointer;accent-color:var(--accent);" onchange="toggleExercise('${ex.id}')">
        <span class="emom-ex-name">${ex.name}</span>
        <span class="emom-ex-reps muted">× ${calcReps(ex, intSecs)} ${ex.unit}</span>
      </div>
    `).join('')
    : '<div style="color:var(--text-muted);font-size:0.82rem;padding:4px 0 2px;">Alle passenden Übungen ausgewählt ✓</div>';

  const otherExercises = CROSSFIT_EXERCISES.filter(ex => !ex.focus.includes(selectedFocus) && !selectedIds.has(ex.id));
  otherList.innerHTML = otherExercises.map(ex => `
    <div class="emom-ex-row">
      <input type="checkbox" style="flex-shrink:0;cursor:pointer;accent-color:var(--accent);" onchange="toggleExercise('${ex.id}')">
      <span class="emom-ex-name">${ex.name}</span>
      <span class="emom-ex-reps muted">× ${calcReps(ex, intSecs)} ${ex.unit}</span>
    </div>
  `).join('');

  const startBtn = document.getElementById('exercise-start-btn');
  if (startBtn) startBtn.textContent = emomExercises.length === 0 ? 'Nur Timer starten' : 'Starten';
}

function startEmom() {
  _totalSecs = totalMinutes * 60;
  _intSecs = Math.floor(_totalSecs / totalRounds);
  elapsed = 0;
  intElapsed = 0;
  currentRound = 1;
  running = true;
  paused = false;

  document.getElementById('exercise-screen').classList.add('hidden');
  document.getElementById('timer-screen').classList.remove('hidden');
  document.getElementById('pause-btn').textContent = '⏸ Pause';
  document.getElementById('round-display').textContent = `Runde 1 / ${totalRounds}`;
  document.getElementById('interval-total').textContent = formatDuration(_intSecs);
  document.getElementById('total-total').textContent = formatDuration(_totalSecs);
  document.getElementById('timer-exercise-box').classList.toggle('hidden', emomExercises.length === 0);

  resetRing();
  updateTimerDisplay();

  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});

  startPrepCountdown();
}

function startPrepCountdown() {
  prepping = true;
  prepRemaining = PREP_SECONDS;
  document.getElementById('round-display').textContent = 'Bereit machen…';
  document.getElementById('interval-total-line').style.display = 'none';
  document.getElementById('prep-label').style.display = '';
  updatePrepDisplay();
  prepInterval = setInterval(prepTick, 1000);
}

function prepTick() {
  if (paused) return;
  prepRemaining--;
  if (prepRemaining <= 0) {
    clearInterval(prepInterval);
    prepInterval = null;
    finishPrepAndStart();
    return;
  }
  updatePrepDisplay();
  if (prepRemaining <= 3) playBeep(660, 0.08, 0.35);
}

function updatePrepDisplay() {
  document.getElementById('interval-elapsed').textContent = prepRemaining;
  const fraction = (PREP_SECONDS - prepRemaining) / PREP_SECONDS;
  document.getElementById('emom-ring-progress').style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
}

function finishPrepAndStart() {
  prepping = false;
  document.getElementById('prep-label').style.display = 'none';
  document.getElementById('interval-total-line').style.display = '';
  document.getElementById('round-display').textContent = `Runde 1 / ${totalRounds}`;
  elapsed = 0;
  intElapsed = 0;
  resetRing();
  updateTimerDisplay();
  updateExerciseDisplay();
  playIntervalBeep();
  tickInterval = setInterval(tick, 1000);
}

function tick() {
  if (paused) return;

  elapsed++;
  intElapsed++;

  if (elapsed >= _totalSecs) {
    clearInterval(tickInterval);
    tickInterval = null;
    running = false;
    intElapsed = _intSecs;
    updateTimerDisplay();
    setTimeout(() => {
      playCompleteBeep();
      showDone();
    }, 200);
    return;
  }

  if (intElapsed >= _intSecs) {
    intElapsed = 0;
    currentRound++;
    document.getElementById('round-display').textContent = `Runde ${currentRound} / ${totalRounds}`;
    resetRing();
    playIntervalBeep();
    updateExerciseDisplay();
  }

  updateTimerDisplay();
}

function updateTimerDisplay() {
  const fraction = _intSecs > 0 ? intElapsed / _intSecs : 0;
  document.getElementById('emom-ring-progress').style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
  document.getElementById('interval-elapsed').textContent = formatDuration(intElapsed);
  document.getElementById('total-elapsed').textContent = formatDuration(elapsed);
}

function updateExerciseDisplay() {
  if (!emomExercises.length) return;

  const cur = emomExercises[(currentRound - 1) % emomExercises.length];
  document.getElementById('timer-ex-name').textContent = cur.name;
  document.getElementById('timer-ex-reps').textContent = `× ${cur.reps} ${cur.unit}`;

  const nextEl = document.getElementById('timer-next-list');
  const nexts = [];
  for (let i = 1; i <= 2; i++) {
    const round = currentRound + i;
    if (round > totalRounds) break;
    nexts.push({ round, ex: emomExercises[(round - 1) % emomExercises.length] });
  }

  if (nexts.length > 0) {
    nextEl.innerHTML = 'Nächste: ' + nexts.map(item =>
      `<span>${item.ex.name} × ${item.ex.reps} (Rd.${item.round})</span>`
    ).join(' <span style="opacity:0.35;margin:0 2px;">|</span> ');
    nextEl.style.display = '';
  } else {
    nextEl.style.display = 'none';
  }
}

function resetRing() {
  const ring = document.getElementById('emom-ring-progress');
  ring.style.transition = 'none';
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE;
  ring.getBoundingClientRect();
  ring.style.transition = 'stroke-dashoffset 0.9s linear';
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  document.getElementById('pause-btn').textContent = paused ? '▶ Weiter' : '⏸ Pause';
}

function abortEmom() {
  if (!confirm('EMOM abbrechen?')) return;
  clearInterval(tickInterval);
  clearInterval(prepInterval);
  tickInterval = null;
  prepInterval = null;
  running = false;
  paused = false;
  prepping = false;
  document.getElementById('prep-label').style.display = 'none';
  document.getElementById('interval-total-line').style.display = '';
  document.getElementById('timer-screen').classList.add('hidden');
  document.getElementById('exercise-screen').classList.remove('hidden');
}

function flashScreen() {
  const el = document.getElementById('flash-overlay');
  if (!el) return;
  el.style.opacity = '0.55';
  setTimeout(() => { el.style.opacity = '0'; }, 70);
  setTimeout(() => {
    el.style.opacity = '0.55';
    setTimeout(() => { el.style.opacity = '0'; }, 70);
  }, 220);
}

function playIntervalBeep() {
  playBeep(880, 0.1, 0.7);
  setTimeout(() => playBeep(880, 0.1, 0.7), 220);
  flashScreen();
}

function playCompleteBeep() {
  playBeep(1046, 0.22, 0.8);
  setTimeout(() => playBeep(1046, 0.22, 0.8), 300);
  setTimeout(() => playBeep(1046, 0.22, 0.8), 600);
  setTimeout(() => playBeep(1046, 0.22, 0.8), 900);
}

function showDone() {
  document.getElementById('timer-screen').classList.add('hidden');
  document.getElementById('done-screen').classList.remove('hidden');
  document.getElementById('done-rounds').textContent = totalRounds;
  document.getElementById('done-minutes').textContent = totalMinutes;
}

function resetEmom() {
  document.getElementById('done-screen').classList.add('hidden');
  document.getElementById('exercise-screen').classList.remove('hidden');
  updateSetupDisplay();
  renderExerciseScreen();
}

function goBack() {
  if (running && !confirm('Timer läuft – wirklich zur Startseite?')) return;
  if (tickInterval) clearInterval(tickInterval);
  if (prepInterval) clearInterval(prepInterval);
  window.location.href = '/dashboard.html';
}

updateSetupDisplay();
