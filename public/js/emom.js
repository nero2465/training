/* ============================================================
   EMOM Timer — Every Minute on the Minute
   ============================================================ */

const RING_CIRCUMFERENCE = 2 * Math.PI * 98; // ≈ 615.75

// Setup state
let totalMinutes = 10;
let totalRounds = 10;

// Runtime state
let _totalSecs = 0;
let _intSecs = 0;
let elapsed = 0;
let intElapsed = 0;
let currentRound = 1;
let running = false;
let paused = false;
let tickInterval = null;

// Prep countdown state (10s lead-in before the first round)
const PREP_SECONDS = 10;
let prepping = false;
let prepRemaining = 0;
let prepInterval = null;

// ── Setup ──────────────────────────────────────────────────

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

// ── Start ──────────────────────────────────────────────────

function startEmom() {
  _totalSecs = totalMinutes * 60;
  _intSecs = Math.floor(_totalSecs / totalRounds);

  if (_intSecs < 5) {
    showToast('Intervall zu kurz – mindestens 5 Sekunden', 'error');
    return;
  }

  elapsed = 0;
  intElapsed = 0;
  currentRound = 1;
  running = true;
  paused = false;

  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('timer-screen').classList.remove('hidden');
  document.getElementById('pause-btn').textContent = '⏸ Pause';

  document.getElementById('round-display').textContent = `Runde 1 / ${totalRounds}`;
  document.getElementById('interval-total').textContent = formatDuration(_intSecs);
  document.getElementById('total-total').textContent = formatDuration(_totalSecs);

  resetRing();
  updateTimerDisplay();

  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});

  startPrepCountdown();
}

// ── Prep countdown (lead-in before round 1) ────────────────

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

  // Gentle ticks for the final 3 seconds, distinct from the round-start beep
  if (prepRemaining <= 3) playBeep(660, 0.08, 0.35);
}

function updatePrepDisplay() {
  document.getElementById('interval-elapsed').textContent = prepRemaining;
  const fraction = (PREP_SECONDS - prepRemaining) / PREP_SECONDS;
  document.getElementById('emom-ring-progress').style.strokeDashoffset =
    RING_CIRCUMFERENCE * (1 - fraction);
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

  playIntervalBeep(); // round-start sound after the 10s lead-in
  tickInterval = setInterval(tick, 1000);
}

// ── Tick ───────────────────────────────────────────────────

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
  }

  updateTimerDisplay();
}

// ── Display ────────────────────────────────────────────────

function updateTimerDisplay() {
  const fraction = _intSecs > 0 ? intElapsed / _intSecs : 0;
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  document.getElementById('emom-ring-progress').style.strokeDashoffset = offset;

  document.getElementById('interval-elapsed').textContent = formatDuration(intElapsed);
  document.getElementById('total-elapsed').textContent = formatDuration(elapsed);
}

function resetRing() {
  const ring = document.getElementById('emom-ring-progress');
  ring.style.transition = 'none';
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE;
  ring.getBoundingClientRect(); // force reflow so transition removal takes effect
  ring.style.transition = 'stroke-dashoffset 0.9s linear';
}

// ── Controls ───────────────────────────────────────────────

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
  // Restore center labels in case we aborted during the prep countdown
  document.getElementById('prep-label').style.display = 'none';
  document.getElementById('interval-total-line').style.display = '';
  document.getElementById('timer-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
}

// ── Audio ──────────────────────────────────────────────────

function playIntervalBeep() {
  playBeep(880, 0.1, 0.7);
  setTimeout(() => playBeep(880, 0.1, 0.7), 220);
}

function playCompleteBeep() {
  playBeep(1046, 0.22, 0.8);
  setTimeout(() => playBeep(1046, 0.22, 0.8), 300);
  setTimeout(() => playBeep(1046, 0.22, 0.8), 600);
  setTimeout(() => playBeep(1046, 0.22, 0.8), 900);
}

// ── Done ───────────────────────────────────────────────────

function showDone() {
  document.getElementById('timer-screen').classList.add('hidden');
  document.getElementById('done-screen').classList.remove('hidden');
  document.getElementById('done-rounds').textContent = totalRounds;
  document.getElementById('done-minutes').textContent = totalMinutes;
}

function resetEmom() {
  document.getElementById('done-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
  updateSetupDisplay();
}

// ── Navigation ─────────────────────────────────────────────

function goBack() {
  if (running && !confirm('Timer läuft – wirklich zur Startseite?')) return;
  if (tickInterval) clearInterval(tickInterval);
  if (prepInterval) clearInterval(prepInterval);
  window.location.href = '/dashboard.html';
}

// ── Init ───────────────────────────────────────────────────

updateSetupDisplay();
