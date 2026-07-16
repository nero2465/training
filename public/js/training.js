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
let currentBodyweight = false;
let loggedSets = {}; // { sessionExerciseId: [{ set_number, weight, reps, id, rating }] }
let sessionTimerInterval = null;
let sessionSeconds = 0;
let workoutId = null;
let sessionId = null;
let sessionLabel = '';
let startedAt = null;
let bodyweightSelections = {};

// Quick-edit state
let exerciseNameOverrides = {};
let editingExercise = false;

// Rest timer state
let restDuration = 60;
let restRemaining = 60;
let restInterval = null;
let restPaused = false;
let restAfterLastSet = false; // if true, advance to next exercise when done

// New state variables
let currentRating = null;      // 1/2/3 selected in rest overlay
let lastSetId = null;          // ID of last saved set, for updating rating/note
let restMinimized = false;
let skippedSets = {};          // { sessionExerciseId: Set of set numbers skipped }
let recommendedWeights = {};   // { sessionExerciseId: recommended weight } for smart rating pre-select
let suggestedRating = 2;       // computed from last logged set vs targets
let setPlans = {};             // { sessionExerciseId: [{set, weight, reps}] } from scheme/deload
let deloadActive = false;      // true while the whole workout runs in deload mode
let plateInventory = null;     // user's plate inventory from settings (null = feature off)

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

  // Plate inventory for the loading hint (non-blocking, feature off if unset)
  API.get('/api/settings').then(s => {
    plateInventory = parsePlateInventory(s.plate_inventory);
    updatePlateHint();
  }).catch(() => {});

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

    // Init logged sets and skipped sets
    exercises.forEach(ex => {
      loggedSets[ex.id] = [];
      skippedSets[ex.id] = new Set();
    });

    // Re-hydrate any sets already saved for this workout so a page reload /
    // F5 on the phone doesn't lose progress (the server is the source of truth).
    await restoreLoggedSets();

    // Build progress dots
    buildProgressTrack();

    // Resume at the first exercise that still has open sets
    document.getElementById('loading-state').style.display = 'none';
    showExercise(firstIncompleteExerciseIndex());
  } catch (e) {
    document.getElementById('loading-state').innerHTML =
      `<p class="text-danger">Fehler: ${e.message}</p>`;
  }
}

// Rebuild loggedSets/skippedSets from the sets already persisted for this
// workout. Called on every load so a reload restores the in-progress session.
async function restoreLoggedSets() {
  let data;
  try {
    data = await API.get(`/api/workouts/${workoutId}`);
  } catch (e) {
    // Non-fatal: continue with an empty session rather than blocking training.
    console.warn('Fortschritt konnte nicht wiederhergestellt werden:', e);
    return;
  }
  if (!data || !Array.isArray(data.sets)) return;

  for (const s of data.sets) {
    const exId = s.session_exercise_id;
    if (!(exId in loggedSets)) continue; // exercise no longer part of session
    if (Number(s.skipped) === 1) {
      skippedSets[exId].add(s.set_number);
    } else {
      loggedSets[exId].push({
        set_number: s.set_number,
        weight: s.weight,
        reps: s.reps,
        is_bodyweight: s.is_bodyweight ? 1 : 0,
        id: s.id,
        rating: s.rating ?? null
      });
      if (s.is_bodyweight) bodyweightSelections[exId] = true;
    }
  }

  // Keep each exercise's sets ordered by set number
  for (const exId of Object.keys(loggedSets)) {
    loggedSets[exId].sort((a, b) => a.set_number - b.set_number);
  }

  const restored = data.sets.length;
  if (restored > 0) {
    showToast(`${restored} bereits erfasste ${restored === 1 ? 'Satz' : 'Sätze'} wiederhergestellt`, 'info');
  }
}

// First exercise index that still has unfinished sets (for resume-after-reload).
function firstIncompleteExerciseIndex() {
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const done = (loggedSets[ex.id]?.length || 0) + (skippedSets[ex.id]?.size || 0);
    if (done < ex.sets) return i;
  }
  return 0; // everything done — land on first, user can end training
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
  const logged = loggedSets[ex.id] || [];
  const skipped = skippedSets[ex.id] || new Set();
  currentSetNumber = logged.length + skipped.size + 1;

  // Show card
  const card = document.getElementById('current-exercise-card');
  card.classList.remove('hidden');

  document.getElementById('exercise-name').textContent = exerciseNameOverrides[ex.id] || ex.name;

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
  currentBodyweight = bodyweightSelections[ex.id] === true;
  updateBodyweightDisplay();

  // Never carry the previous exercise's weight over. Resume from this
  // exercise's own last logged set if present, otherwise start at 0 and
  // let the recommendation (if any) set it.
  currentWeight = logged.length > 0 ? (logged[logged.length - 1].weight || 0) : 0;
  updateWeightDisplay();

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

  // Close edit form if open
  closeExerciseEdit();

  // Render completed + upcoming
  renderCompletedExercises();
  renderUpcomingExercises();
}

function buildSetBubbles(ex) {
  const grid = document.getElementById('sets-grid');
  const logged = loggedSets[ex.id] || [];
  const skipped = skippedSets[ex.id] || new Set();
  const totalCompleted = logged.length + skipped.size;
  grid.innerHTML = '';

  for (let i = 1; i <= ex.sets; i++) {
    const bubble = document.createElement('div');
    bubble.className = 'set-bubble';

    if (skipped.has(i)) {
      bubble.classList.add('skipped');
      bubble.textContent = '–';
    } else {
      // Determine which logged set corresponds to position i
      // (skipped sets before i reduce the effective logged index)
      const skippedBefore = [...skipped].filter(s => s < i).length;
      const loggedPosition = i - skippedBefore;
      const loggedSet = logged[loggedPosition - 1];

      if (loggedSet) {
        bubble.classList.add('done');
        bubble.textContent = i;
        if (loggedSet.rating === 1) bubble.classList.add('rating-1');
        else if (loggedSet.rating === 2) bubble.classList.add('rating-2');
        else if (loggedSet.rating === 3) bubble.classList.add('rating-3');
      } else if (i === totalCompleted + 1) {
        bubble.classList.add('active');
        bubble.textContent = i;
      } else {
        bubble.textContent = i;
      }
    }

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
      <span class="set-log-detail">${formatSetSummary(s)}</span>
    </div>
  `).join('');
}

async function loadRecommendation(sessionExerciseId) {
  const hint = document.getElementById('recommendation-hint');
  try {
    const rec = await API.get(`/api/recommendations/${sessionExerciseId}`);

    const hasBodyweightSelection = Object.prototype.hasOwnProperty.call(bodyweightSelections, sessionExerciseId);
    if (!hasBodyweightSelection) {
      currentBodyweight = rec.last_bodyweight === true;
      bodyweightSelections[sessionExerciseId] = currentBodyweight;
      updateBodyweightDisplay();
    }

    recommendedWeights[sessionExerciseId] = rec.recommended_weight || 0;
    setPlans[sessionExerciseId] = rec.set_plan || null;
    deloadActive = rec.deload === true;

    const ex = exercises[currentExerciseIndex];

    // Deload: halve the sets for this session (visual + completion logic)
    if (rec.deload && rec.sets_override && ex && ex.id === sessionExerciseId && ex.sets !== rec.sets_override) {
      ex.sets = rec.sets_override;
      buildSetBubbles(ex);
      const meta = document.getElementById('exercise-meta');
      if (meta && !meta.textContent.includes('Deload')) {
        meta.textContent = `🔄 Deload: ${ex.sets} × ${ex.reps_min}–${ex.reps_max} Wdh.`;
      }
    }

    if (rec.recommended_weight > 0) {
      hint.style.display = 'block';
      const planLine = setPlanSummary(rec);
      hint.innerHTML = `Empfehlung: <strong>${rec.recommended_weight} kg</strong> ${recommendationReasonText(rec)}${planLine}`;
      // Pre-set weight (and reps for schemes) for the next open set
      applyPlanForNextSet(sessionExerciseId);
      if (!setPlans[sessionExerciseId] && (loggedSets[sessionExerciseId] || []).length === 0) {
        currentWeight = rec.recommended_weight;
        updateWeightDisplay();
      }
    } else {
      hint.style.display = 'none';
      if (currentWeight === 0) {
        updateWeightDisplay();
      }
    }

    if (ex && ex.id === sessionExerciseId) updateWarmupArea(ex);
  } catch (e) {
    hint.style.display = 'none';
  }
}

// Weight/reps ramp preview under the recommendation, e.g. "40×12 → 50×10 → 60×8"
function setPlanSummary(rec) {
  const plan = rec.set_plan;
  if (!plan || plan.length === 0) return '';
  if (rec.deload) {
    return `<br><span style="color:var(--accent);">🔄 Deload-Woche: ${plan.length} Sätze @ ${formatWeight(plan[0].weight)}</span>`;
  }
  if (!rec.scheme || rec.scheme === 'straight') return '';
  if (rec.scheme === 'double_progression') {
    return `<br><span style="color:var(--text-muted); font-size:0.85em;">Double Progression: erst alle Sätze auf ${exercises[currentExerciseIndex]?.reps_max ?? '–'} Wdh. bringen, dann Gewicht erhöhen</span>`;
  }
  const chain = plan.map(p => `${p.weight % 1 === 0 ? p.weight : p.weight.toFixed(1)}×${p.reps}`).join(' → ');
  return `<br><span style="color:var(--text-muted); font-size:0.85em;">Plan: ${chain}</span>`;
}

// Pre-fill weight + reps from the scheme plan for the next open set.
function applyPlanForNextSet(sessionExerciseId) {
  const plan = setPlans[sessionExerciseId];
  if (!plan) return;
  const ex = exercises[currentExerciseIndex];
  if (!ex || ex.id !== sessionExerciseId) return;
  const done = (loggedSets[ex.id]?.length || 0) + (skippedSets[ex.id]?.size || 0);
  const entry = plan[Math.min(done, plan.length - 1)];
  if (!entry) return;
  currentWeight = entry.weight;
  currentReps = entry.reps;
  updateWeightDisplay();
  updateRepsDisplay();
}

function recommendationReasonText(rec) {
  const inc = rec.increment % 1 === 0 ? rec.increment : rec.increment.toFixed(1);
  switch (rec.reason) {
    case 'increase':
      return `<span style="color:var(--success, #4ade80);">(+${inc} kg — alle Wdh. geschafft 💪)</span>`;
    case 'dp_increase':
      return `<span style="color:var(--success, #4ade80);">(+${inc} kg — Wdh.-Maximum in allen Sätzen erreicht 💪)</span>`;
    case 'dp_reps':
      return `<span style="color:var(--text-muted);">(Gewicht halten — Wiederholungen steigern)</span>`;
    case 'decrease':
      return `<span style="color:#ef4444;">(−${inc} kg — letztes Mal zu schwer)</span>`;
    case 'hold_hard':
      return `<span style="color:var(--text-muted);">(halten — letztes Mal teils zu schwer)</span>`;
    case 'hold':
      return `<span style="color:var(--text-muted);">(halten — Wdh.-Ziel noch nicht erreicht)</span>`;
    case 'deload':
      return `<span style="color:var(--accent);">(Deload — Erholungswoche)</span>`;
    case 'post_deload':
      return `<span style="color:var(--accent);">(90 % — Wiedereinstieg nach Deload 🌱)</span>`;
    default:
      return '(letztes Training)';
  }
}

function setWeightFromInput() {
  const input = document.getElementById('weight-display');
  const val = parseFloat(input.value);
  if (!isNaN(val) && val >= 0) {
    currentWeight = Math.round(val * 10) / 10;
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
  const el = document.getElementById('weight-display');
  el.value = currentWeight % 1 === 0 ? currentWeight : currentWeight.toFixed(1);
  updatePlateHint();
}

// "Pro Seite: 20 + 10 + 2,5" under the weight input (needs inventory in settings)
function updatePlateHint() {
  const el = document.getElementById('plate-hint');
  if (!el) return;
  if (!plateInventory || currentBodyweight || currentWeight < plateInventory.bar) {
    el.style.display = 'none';
    return;
  }
  const loadout = computePlateLoadout(currentWeight, plateInventory);
  let text = `🏋️ Pro Seite: <strong style="color:var(--text-primary);">${formatPlateLoadout(loadout, plateInventory)}</strong>`;
  if (!loadout.achievable) {
    text += ` <span style="color:#fbbf24;">(${currentWeight} kg nicht exakt ladbar → ${loadout.actual} kg)</span>`;
  }
  el.innerHTML = text;
  el.style.display = 'block';
}

/* ── Warmup ramp (display only, never logged) ─────────────── */

function buildWarmupRamp(workWeight) {
  const bar = plateInventory ? plateInventory.bar : 20;
  if (!workWeight || workWeight < bar * 1.5) return []; // too light, no ramp needed
  const steps = [
    { pct: 0,    reps: 10, label: 'Leere Stange' },
    { pct: 0.4,  reps: 8 },
    { pct: 0.6,  reps: 5 },
    { pct: 0.8,  reps: 3 }
  ];
  const ramp = [];
  let prev = 0;
  for (const s of steps) {
    const w = s.pct === 0 ? bar : Math.round(workWeight * s.pct / 2.5) * 2.5;
    if (w < bar || w <= prev || w >= workWeight) continue;
    ramp.push({ weight: w, reps: s.reps, label: s.label });
    prev = w;
  }
  return ramp;
}

function updateWarmupArea(ex) {
  const area = document.getElementById('warmup-area');
  const list = document.getElementById('warmup-list');
  const btn = document.getElementById('warmup-toggle-btn');
  if (!area) return;

  // Only before the first set of an exercise, and only when a ramp makes sense
  const done = (loggedSets[ex.id]?.length || 0) + (skippedSets[ex.id]?.size || 0);
  const workWeight = setPlans[ex.id]?.[0]?.weight ?? currentWeight;
  const ramp = buildWarmupRamp(workWeight);

  if (done > 0 || ramp.length === 0 || currentBodyweight) {
    area.style.display = 'none';
    return;
  }

  area.style.display = 'block';
  list.style.display = 'none';
  btn.textContent = '🔥 Aufwärmsätze anzeigen';
  list.innerHTML = ramp.map(r => {
    let plates = '';
    if (plateInventory && r.weight >= plateInventory.bar) {
      const lo = computePlateLoadout(r.weight, plateInventory);
      plates = ` <span style="color:var(--text-muted); font-size:0.85em;">(${formatPlateLoadout(lo, plateInventory)})</span>`;
    }
    return `• ${r.label ? r.label + ' — ' : ''}<strong>${formatWeight(r.weight)}</strong> × ${r.reps}${plates}`;
  }).join('<br>') + '<br><span style="color:var(--text-muted); font-size:0.85em;">Aufwärmsätze werden nicht geloggt und zählen nicht ins Volumen.</span>';
}

function toggleWarmup() {
  const list = document.getElementById('warmup-list');
  const btn = document.getElementById('warmup-toggle-btn');
  const open = list.style.display !== 'none';
  list.style.display = open ? 'none' : 'block';
  btn.textContent = open ? '🔥 Aufwärmsätze anzeigen' : '🔥 Aufwärmsätze ausblenden';
}

function updateRepsDisplay() {
  document.getElementById('reps-display').textContent = currentReps;
}

function setBodyweightFromInput() {
  const input = document.getElementById('bodyweight-toggle');
  currentBodyweight = input ? input.checked : false;

  const ex = exercises[currentExerciseIndex];
  if (ex) {
    bodyweightSelections[ex.id] = currentBodyweight;
  }
  updatePlateHint();
}

function updateBodyweightDisplay() {
  const input = document.getElementById('bodyweight-toggle');
  if (input) input.checked = currentBodyweight;
}

function selectRating(rating) {
  currentRating = rating;
  [1, 2, 3].forEach(r => {
    const btn = document.getElementById(`rating-${r}`);
    if (btn) btn.classList.toggle('selected', r === rating);
  });

  // Immediately update bubble color so user sees feedback without waiting for timer
  if (lastSetId) {
    const ex = exercises[currentExerciseIndex];
    if (ex) {
      const logged = loggedSets[ex.id] || [];
      const setEntry = logged.find(s => s.id === lastSetId);
      if (setEntry) {
        setEntry.rating = rating;
        buildSetBubbles(ex);
      }
    }
  }
}

async function logSet() {
  const btn = document.getElementById('log-set-btn');
  btn.disabled = true;

  // Unlock audio on user gesture
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});

  const ex = exercises[currentExerciseIndex];
  const logged = loggedSets[ex.id] || [];
  const skipped = skippedSets[ex.id] || new Set();
  const setNum = logged.length + skipped.size + 1;

  try {
    // Save to server
    const set = await API.post(`/api/workouts/${workoutId}/sets`, {
      session_exercise_id: ex.id,
      set_number: setNum,
      weight: currentWeight,
      reps: currentReps,
      is_bodyweight: currentBodyweight ? 1 : 0
    });

    // Store set ID for rating/note update after rest
    lastSetId = set.id;

    // Save locally (include id and rating for bubble coloring)
    logged.push({
      set_number: setNum,
      weight: currentWeight,
      reps: currentReps,
      is_bodyweight: currentBodyweight ? 1 : 0,
      id: set.id,
      rating: null
    });
    loggedSets[ex.id] = logged;

    // Update UI
    buildSetBubbles(ex);
    updateLoggedSetsList(ex);

    // Smart rating pre-select: below rep target or below recommended weight
    // → "zu schwer"; above rep max → "zu leicht"; otherwise "ok".
    const recWeight = recommendedWeights[ex.id] || 0;
    if (currentReps < ex.reps_min || (recWeight > 0 && currentWeight < recWeight)) {
      suggestedRating = 1;
    } else if (currentReps > ex.reps_max) {
      suggestedRating = 3;
    } else {
      suggestedRating = 2;
    }

    const totalCompleted = logged.length + skipped.size;
    const isLastSet = totalCompleted >= ex.sets;

    if (isLastSet) {
      // Last set done
      restAfterLastSet = true;
      showToast(`${ex.name} abgeschlossen! 💪`, 'success');
      startRestTimer(true);
    } else {
      // More sets remain
      restAfterLastSet = false;
      currentSetNumber = logged.length + skipped.size + 1;
      applyPlanForNextSet(ex.id); // scheme: pre-fill weight/reps for next set
      updateWarmupArea(ex);       // hide warmup once the first set is logged
      startRestTimer(false);
    }

  } catch (e) {
    showToast('Fehler beim Speichern: ' + e.message, 'error');
    btn.disabled = false;
  }
}

function skipSet() {
  // Unlock audio on user gesture
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});

  const ex = exercises[currentExerciseIndex];
  const logged = loggedSets[ex.id] || [];
  if (!skippedSets[ex.id]) skippedSets[ex.id] = new Set();

  const totalCompleted = logged.length + skippedSets[ex.id].size;
  const currentSetNum = totalCompleted + 1;

  skippedSets[ex.id].add(currentSetNum);
  buildSetBubbles(ex);

  const newTotal = logged.length + skippedSets[ex.id].size;
  const isLastSet = newTotal >= ex.sets;

  if (isLastSet) {
    const nextIndex = currentExerciseIndex + 1;
    if (nextIndex >= exercises.length) {
      showAllDone();
    } else {
      showExercise(nextIndex);
    }
  }
  // else: same exercise, set bubbles already updated, user continues
}

function startRestTimer(afterLastSet) {
  restAfterLastSet = afterLastSet;
  restRemaining = restDuration;
  restPaused = false;
  restMinimized = false;

  // Pre-select rating based on how the set actually went (Fix: was always 2)
  const noteEl = document.getElementById('set-note');
  if (noteEl) noteEl.value = '';
  selectRating(suggestedRating);

  // Show next exercise info if last set — including its weight, so the
  // user can set up the next station during the rest period.
  const nextInfo = document.getElementById('next-exercise-info');
  const nextNameEl = document.getElementById('next-exercise-name');

  if (afterLastSet && currentExerciseIndex + 1 < exercises.length) {
    const next = exercises[currentExerciseIndex + 1];
    nextInfo.style.display = 'block';
    nextNameEl.textContent = next.name;
    API.get(`/api/recommendations/${next.id}`).then(rec => {
      if (rec.recommended_weight > 0) {
        nextNameEl.textContent = `${next.name} — ${formatWeight(rec.recommended_weight)}`;
      }
    }).catch(() => {});
  } else {
    nextInfo.style.display = 'none';
  }

  // Show overlay
  document.getElementById('rest-timer-overlay').classList.remove('hidden');
  document.getElementById('rest-toggle-btn').textContent = 'Pause';

  // Hide mini badge
  const mini = document.getElementById('rest-mini');
  if (mini) mini.style.display = 'none';

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
  if (restMinimized) updateMiniTimer();

  if (restRemaining <= 0) {
    clearInterval(restInterval);
    restInterval = null;
    if (restMinimized) restoreRestTimer();
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
  restRemaining = Math.max(1, Math.min(restDuration, restRemaining + delta));
  updateRestDisplay();
  updateRingProgress();
}

function minimizeRestTimer() {
  restMinimized = true;
  document.getElementById('rest-timer-overlay').classList.add('hidden');
  const mini = document.getElementById('rest-mini');
  if (mini) { mini.style.display = 'flex'; updateMiniTimer(); }
}

function restoreRestTimer() {
  restMinimized = false;
  document.getElementById('rest-timer-overlay').classList.remove('hidden');
  const mini = document.getElementById('rest-mini');
  if (mini) mini.style.display = 'none';
}

function updateMiniTimer() {
  const el = document.getElementById('rest-mini-display');
  if (el) el.textContent = restRemaining + 's';
}

async function skipRest() {
  if (restInterval) {
    clearInterval(restInterval);
    restInterval = null;
  }
  await timerComplete();
}

async function timerComplete() {
  // Update local state immediately so bubble colors show regardless of API result
  if (lastSetId && currentRating !== null) {
    const ex = exercises[currentExerciseIndex];
    const logged = loggedSets[ex.id] || [];
    const setEntry = logged.find(s => s.id === lastSetId);
    if (setEntry) {
      setEntry.rating = currentRating;
      buildSetBubbles(ex);
    }
  }

  // Persist rating/note to server in background
  if (lastSetId && (currentRating !== null || document.getElementById('set-note')?.value?.trim())) {
    const note = document.getElementById('set-note')?.value?.trim() || null;
    try {
      await API.put(`/api/workout-sets/${lastSetId}`, { rating: currentRating, note });
    } catch(e) { /* ignore rating save errors */ }
  }

  restMinimized = false;
  document.getElementById('rest-timer-overlay').classList.add('hidden');
  const mini = document.getElementById('rest-mini');
  if (mini) mini.style.display = 'none';

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

function renderUpcomingExercises() {
  const container = document.getElementById('upcoming-exercises');
  if (!container) return;

  const remaining = exercises.slice(currentExerciseIndex + 1);
  if (remaining.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  const rows = remaining.map((ex, i) => {
    const name = exerciseNameOverrides[ex.id] || ex.name;
    const reps = ex.reps_min === ex.reps_max ? ex.reps_min : `${ex.reps_min}–${ex.reps_max}`;
    return `
      <div class="upcoming-exercise-row">
        <span class="upcoming-num">${currentExerciseIndex + i + 2}.</span>
        <span class="upcoming-name">${escapeHtml(name)}</span>
        <span class="upcoming-meta">${ex.sets}×${reps}</span>
      </div>`;
  }).join('');

  container.innerHTML = `<div class="upcoming-header">Als nächstes</div>${rows}`;
}

function openExerciseEdit() {
  if (editingExercise) {
    closeExerciseEdit();
    return;
  }
  editingExercise = true;

  const ex = exercises[currentExerciseIndex];
  const currentName = exerciseNameOverrides[ex.id] || ex.name;
  const logged = (loggedSets[ex.id] || []).length;

  const editDiv = document.getElementById('exercise-edit-form');
  editDiv.innerHTML = `
    <div class="exercise-edit-card">
      <div class="form-group">
        <label class="form-label">Bezeichnung (nur diese Einheit)</label>
        <input type="text" class="form-control" id="edit-ex-name" value="${escapeHtml(currentName)}">
      </div>
      <div class="form-group">
        <label class="form-label">Sätze gesamt (${logged} bereits erledigt)</label>
        <div class="stepper stepper-sm">
          <button class="stepper-btn" onclick="adjustEditSets(-1)">−</button>
          <div class="stepper-value"><span id="edit-sets-val">${ex.sets}</span></div>
          <button class="stepper-btn" onclick="adjustEditSets(1)">+</button>
        </div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="applyExerciseEdit()">Übernehmen</button>
        <button class="btn btn-outline btn-sm" onclick="closeExerciseEdit()">Abbrechen</button>
      </div>
    </div>`;
  editDiv.style.display = 'block';
  setTimeout(() => document.getElementById('edit-ex-name')?.focus(), 50);
}

function adjustEditSets(delta) {
  const ex = exercises[currentExerciseIndex];
  const logged = (loggedSets[ex.id] || []).length;
  const cur = parseInt(document.getElementById('edit-sets-val').textContent);
  const next = Math.max(logged + 1, cur + delta);
  document.getElementById('edit-sets-val').textContent = next;
}

function applyExerciseEdit() {
  const ex = exercises[currentExerciseIndex];
  const newName = document.getElementById('edit-ex-name').value.trim();
  const newSets = parseInt(document.getElementById('edit-sets-val').textContent);

  if (newName) exerciseNameOverrides[ex.id] = newName;
  document.getElementById('exercise-name').textContent = exerciseNameOverrides[ex.id] || ex.name;

  if (newSets && newSets !== ex.sets) {
    ex.sets = newSets;
    buildSetBubbles(ex);
  }

  closeExerciseEdit();
  renderUpcomingExercises();
}

function closeExerciseEdit() {
  editingExercise = false;
  const editDiv = document.getElementById('exercise-edit-form');
  if (editDiv) { editDiv.style.display = 'none'; editDiv.innerHTML = ''; }
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
      `<span class="completed-set-chip">${formatSetSummary(s)}</span>`
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

  const totalSets = Object.values(loggedSets).reduce((sum, sets) => sum + sets.length, 0);

  try {
    if (totalSets === 0) {
      // No sets logged — delete the empty workout instead of ending it
      await API.delete(`/api/workouts/${workoutId}`);
      WorkoutStorage.clear();
      window.location.href = '/dashboard.html';
      return;
    }

    await API.put(`/api/workouts/${workoutId}/end`);
    WorkoutStorage.clear();

    // Show completion overlay
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

function formatSetSummary(set) {
  const bwBadge = set.is_bodyweight ? ' <span class="bodyweight-badge">BW</span>' : '';
  return `${set.weight} kg × ${set.reps} Wdh.${bwBadge}`;
}

// Prevent accidental navigation away during training
window.addEventListener('beforeunload', (e) => {
  if (workoutId && !document.getElementById('training-done-overlay').classList.contains('hidden') === false) {
    // Workout still in progress
  }
});

// Initialize
init();
