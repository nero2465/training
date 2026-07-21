/* ============================================================
   1RM-Test — guided max attempt with warmup ramp
   ============================================================ */

let ormExercises = [];
let ormTarget = 0;
let ormAttempt = 0;
let ormBest = 0;
let ormExerciseId = null;
let plateInv = null;
let ormBar = null; // bar picked from the exercise's equipment

async function init() {
  const user = await requireAuth();
  if (!user) return;

  try {
    const [exercises, settings] = await Promise.all([
      API.get('/api/exercises'),
      API.get('/api/settings')
    ]);
    ormExercises = exercises;
    plateInv = parsePlateInventory(settings.plate_inventory);

    const sel = document.getElementById('orm-exercise');
    sel.innerHTML = '<option value="">– Übung wählen –</option>' +
      exercises.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  } catch (e) {
    showToast('Fehler beim Laden: ' + e.message, 'error');
  }
}

async function onExerciseChange() {
  const id = parseInt(document.getElementById('orm-exercise').value);
  ormExerciseId = id || null;
  const info = document.getElementById('orm-est-info');
  if (!id) { info.style.display = 'none'; return; }

  const parts = [];
  try {
    // Estimated 1RM from training history (best of last workout)
    const progress = await API.get(`/api/progress/${id}`);
    if (progress.length > 0) {
      const last = progress[progress.length - 1];
      const est = Math.round((last.est_1rm || last.max_weight || 0) / 2.5) * 2.5;
      if (est > 0) {
        parts.push(`Geschätztes 1RM aus deinem Training: <strong>${est} kg</strong>`);
        document.getElementById('orm-target').value = est;
      }
    }
  } catch (e) { /* no history */ }

  try {
    const tests = await API.get(`/api/orm-tests/${id}`);
    if (tests.length > 0) {
      parts.push(`Zuletzt getestet: <strong>${tests[0].weight} kg</strong> (${formatDate(tests[0].tested_at)})`);
      if (!document.getElementById('orm-target').value || document.getElementById('orm-target').value === '0') {
        document.getElementById('orm-target').value = tests[0].weight;
      }
    }
  } catch (e) { /* none */ }

  info.innerHTML = parts.join('<br>') || 'Noch keine Daten zu dieser Übung — trage dein erwartetes Maximum ein.';
  info.style.display = 'block';
}

function adjustTarget(delta) {
  const el = document.getElementById('orm-target');
  el.value = Math.max(0, (parseFloat(el.value) || 0) + delta);
}

/* ── Guided flow ──────────────────────────────────────────── */

function startOrm() {
  ormTarget = parseFloat(document.getElementById('orm-target').value) || 0;
  if (!ormExerciseId) { showToast('Bitte eine Übung wählen', 'error'); return; }
  if (ormTarget < 20) { showToast('Bitte ein realistisches Zielgewicht eintragen', 'error'); return; }

  ormAttempt = Math.round(ormTarget / 2.5) * 2.5;
  ormBest = 0;

  const ex = ormExercises.find(e => e.id === ormExerciseId);
  ormBar = pickBarForEquipment(plateInv, ex?.equipment, ormTarget, { name: ex?.name, equipType: ex?.equip_type });
  document.getElementById('orm-flow-exercise').textContent = ex ? ex.name : '';
  document.getElementById('orm-flow-target').textContent = formatWeight(ormTarget);

  renderRamp();
  updateAttemptDisplay();

  document.getElementById('orm-setup').classList.add('hidden');
  document.getElementById('orm-flow').classList.remove('hidden');
}

// Warmup ramp toward a max attempt: more steps, fewer reps than a normal warmup
function buildOrmRamp(target) {
  const bar = ormBar ? ormBar.weight : 20;
  const steps = [
    { pct: 0,     reps: 10, label: 'Leere Stange' },
    { pct: 0.4,   reps: 5 },
    { pct: 0.6,   reps: 3 },
    { pct: 0.75,  reps: 2 },
    { pct: 0.85,  reps: 1 },
    { pct: 0.92,  reps: 1 }
  ];
  const ramp = [];
  let prev = 0;
  for (const s of steps) {
    const w = s.pct === 0 ? bar : Math.round(target * s.pct / 2.5) * 2.5;
    if (w < bar || w <= prev || w >= target) continue;
    ramp.push({ weight: w, reps: s.reps, label: s.label });
    prev = w;
  }
  return ramp;
}

function renderRamp() {
  const ramp = buildOrmRamp(ormTarget);
  document.getElementById('orm-ramp').innerHTML = ramp.map((r, i) => {
    let plates = '';
    const barW = ormBar ? ormBar.weight : 20;
    if (plateInv && r.weight >= barW) {
      const lo = computePlateLoadout(r.weight, plateInv, barW);
      plates = `<div class="ramp-plates">Pro Seite: ${formatPlateLoadout(lo, plateInv)}</div>`;
    }
    return `
      <div class="ramp-step" id="ramp-${i}">
        <button class="ramp-check" onclick="toggleRampStep(${i}, ${ramp.length})">✓</button>
        <div class="ramp-info">
          <span class="ramp-weight">${formatWeight(r.weight)}</span> × ${r.reps}
          ${r.label ? `<span style="color:var(--text-muted); font-size:0.8rem;"> — ${r.label}</span>` : ''}
          ${plates}
        </div>
      </div>`;
  }).join('');
}

function toggleRampStep(i, total) {
  const el = document.getElementById(`ramp-${i}`);
  el.classList.toggle('done');
  // Unlock the attempt box once every ramp step is checked
  const doneCount = document.querySelectorAll('.ramp-step.done').length;
  const box = document.getElementById('orm-attempt-box');
  const unlocked = doneCount >= total;
  box.style.opacity = unlocked ? '1' : '0.4';
  box.style.pointerEvents = unlocked ? 'auto' : 'none';
}

function updateAttemptDisplay() {
  document.getElementById('orm-attempt-weight').textContent = formatWeight(ormAttempt);
  const platesEl = document.getElementById('orm-attempt-plates');
  const attemptBarW = ormBar ? ormBar.weight : 20;
  if (plateInv && ormAttempt >= attemptBarW) {
    const lo = computePlateLoadout(ormAttempt, plateInv, attemptBarW);
    platesEl.textContent = `Pro Seite: ${formatPlateLoadout(lo, plateInv)}`;
  } else {
    platesEl.textContent = '';
  }
}

function adjustAttempt(delta) {
  ormAttempt = Math.max(0, ormAttempt + delta);
  updateAttemptDisplay();
}

function attemptSuccess() {
  ormBest = Math.max(ormBest, ormAttempt);
  const line = document.getElementById('orm-best-line');
  line.style.display = 'block';
  line.innerHTML = `✅ <strong>${formatWeight(ormBest)}</strong> geschafft! Nächster Versuch: <strong>+2,5 kg</strong> nach 3–5 min Pause — oder Test abschließen.`;
  document.getElementById('orm-finish-btn').style.display = 'inline-block';
  ormAttempt += 2.5;
  updateAttemptDisplay();
  playBeep(1046, 0.2, 0.6);
}

function attemptFail() {
  const line = document.getElementById('orm-best-line');
  line.style.display = 'block';
  if (ormBest > 0) {
    line.innerHTML = `Kein Problem — dein Bestwert steht bei <strong>${formatWeight(ormBest)}</strong>. Test abschließen oder mit weniger Gewicht erneut versuchen.`;
    document.getElementById('orm-finish-btn').style.display = 'inline-block';
  } else {
    line.innerHTML = `Reduziere das Gewicht (−2,5/−5 kg) und versuche es nach ausreichend Pause erneut.`;
  }
}

async function finishOrm() {
  if (ormBest <= 0) { showToast('Noch kein erfolgreicher Versuch', 'error'); return; }
  try {
    await API.post('/api/orm-tests', { exercise_id: ormExerciseId, weight: ormBest });
  } catch (e) {
    showToast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }

  document.getElementById('orm-done-weight').textContent = formatWeight(ormBest);
  const compare = document.getElementById('orm-done-compare');
  compare.textContent = `Gespeichert — sichtbar auf der Fortschrittsseite.`;

  document.getElementById('orm-flow').classList.add('hidden');
  document.getElementById('orm-done').classList.remove('hidden');
}

function abortOrm() {
  if (ormBest > 0 && confirm(`${formatWeight(ormBest)} wurde bereits geschafft — vor dem Verlassen speichern?`)) {
    finishOrm();
    return;
  }
  document.getElementById('orm-flow').classList.add('hidden');
  document.getElementById('orm-setup').classList.remove('hidden');
}

function goBack() {
  window.location.href = '/dashboard.html';
}

init();
