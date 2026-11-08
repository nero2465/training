/* ============================================================
   Körper & Ernährung — profile, weight log, nutrition calc
   ============================================================ */

let bodySettings = null;
let bodyMetrics = [];
let weightChart = null;
let chartMetric = 'weight';   // which series the chart shows
let showAllMetrics = false;   // list: last 5 vs. all entries
let editingMetricId = null;

const METRICS = [
  { key: 'weight', label: 'Gewicht', unit: 'kg', color: '#60a5fa' },
  { key: 'waist',  label: 'Taille',  unit: 'cm', color: '#f59e0b' },
  { key: 'chest',  label: 'Brust',   unit: 'cm', color: '#a78bfa' },
  { key: 'arm',    label: 'Oberarm', unit: 'cm', color: '#34d399' },
  { key: 'neck',   label: 'Hals',    unit: 'cm', color: '#f472b6' },
  { key: 'hip',    label: 'Hüfte',   unit: 'cm', color: '#fb923c' },
  // Derived: US-Navy body fat per entry (needs waist + neck, women also hip)
  { key: 'bf',     label: 'KFA',     unit: '%',  color: '#e94560', derived: true }
];

// Value of a metric for one entry (derived ones computed on the fly)
function metricValue(m, key) {
  if (key === 'bf') {
    const v = navyBodyFat(m.waist, m.neck, m.hip, bodySettings && bodySettings.height_cm, bodySettings && bodySettings.sex);
    return v === null ? null : Math.round(v * 10) / 10;
  }
  return m[key];
}

/* ── Body fat estimates ───────────────────────────────────── */

// US-Navy circumference method (Hodgdon & Beckett), metric form.
// Typical error vs. DEXA about ±3–4 %-points; best for following a trend.
function navyBodyFat(waist, neck, hip, height, sex) {
  if (!waist || !neck || !height || !sex) return null;
  let bf;
  if (sex === 'm') {
    if (waist - neck <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  } else {
    if (!hip || waist + hip - neck <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(height)) - 450;
  }
  return bf > 2 && bf < 70 ? bf : null;
}

// Deurenberg (1991): from BMI, age and sex — no tape needed, but blind to
// muscle mass (overestimates for strength athletes).
function deurenbergBodyFat(weight, height, age, sex) {
  if (!weight || !height || !age || !sex) return null;
  const bmi = weight / Math.pow(height / 100, 2);
  return 1.2 * bmi + 0.23 * age - 10.8 * (sex === 'm' ? 1 : 0) - 5.4;
}

// YMCA formula: weight + waist only
function ymcaBodyFat(weight, waist, sex) {
  if (!weight || !waist || !sex) return null;
  const lb = weight * 2.20462, inch = waist / 2.54;
  const bf = (4.15 * inch - 0.082 * lb - (sex === 'm' ? 98.42 : 76.76)) / lb * 100;
  return bf > 2 && bf < 70 ? bf : null;
}

// ACE categories
function bfCategory(bf, sex) {
  const t = sex === 'm' ? [6, 14, 18, 25] : [14, 21, 25, 32];
  if (bf < t[0]) return 'essentielles Fett';
  if (bf < t[1]) return 'athletisch';
  if (bf < t[2]) return 'fit';
  if (bf < t[3]) return 'durchschnittlich';
  return 'erhöht';
}

// Latest non-empty value of a field plus its day
function latestField(key) {
  for (let i = bodyMetrics.length - 1; i >= 0; i--) {
    if (bodyMetrics[i][key]) return { v: bodyMetrics[i][key], day: metricDay(bodyMetrics[i]) };
  }
  return null;
}

function renderBodyFat() {
  const el = document.getElementById('bf-content');
  if (!el) return;
  const s = bodySettings || {};
  const age = s.birth_year ? new Date().getFullYear() - s.birth_year : null;
  const w = latestField('weight'), waist = latestField('waist'), neck = latestField('neck'), hip = latestField('hip');
  const fmt = v => v.toFixed(1).replace('.', ',');

  const missing = [];
  if (!s.height_cm) missing.push('Größe');
  if (!s.sex) missing.push('Geschlecht');
  if (!waist) missing.push('Taille');
  if (!neck) missing.push('Hals');
  if (s.sex === 'w' && !hip) missing.push('Hüfte');

  const navy = navyBodyFat(waist && waist.v, neck && neck.v, hip && hip.v, s.height_cm, s.sex);
  const deur = deurenbergBodyFat(w && w.v, s.height_cm, age, s.sex);
  const ymca = ymcaBodyFat(w && w.v, waist && waist.v, s.sex);

  let html = '';
  if (navy !== null) {
    const fatKg = w ? w.v * navy / 100 : null;
    html += `
      <div style="display:flex; align-items:baseline; gap:10px;">
        <div style="font-size:2rem; font-weight:800; color:var(--accent);">${fmt(navy)} %</div>
        <div style="color:var(--text-secondary);">${bfCategory(navy, s.sex)}</div>
      </div>
      <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">US-Navy-Methode (Umfänge + Größe)</div>
      ${fatKg !== null ? `<div style="margin-bottom:8px;">Fettmasse <strong>${fmt(fatKg)} kg</strong> · fettfreie Masse <strong>${fmt(w.v - fatKg)} kg</strong></div>` : ''}`;
  } else {
    html += `<div style="color:var(--text-muted); margin-bottom:8px;">Für die genauere Schätzung (US-Navy) fehlt: <strong>${missing.join(', ')}</strong>.
      ${!waist || !neck || (s.sex === 'w' && !hip) ? 'Unter „Umfänge erfassen" eintragen.' : 'Im Profil unten ergänzen.'}</div>`;
  }

  const rows = [];
  if (ymca !== null) rows.push(`YMCA (Gewicht + Taille): <strong>${fmt(ymca)} %</strong>`);
  if (deur !== null) rows.push(`Deurenberg (BMI + Alter): <strong>${fmt(deur)} %</strong> — überschätzt bei viel Muskelmasse`);
  if (rows.length) html += `<div style="font-size:0.8rem; color:var(--text-secondary); line-height:1.6;">${navy !== null ? 'Zum Vergleich:<br>' : ''}${rows.join('<br>')}</div>`;

  if (!html.trim() || (navy === null && rows.length === 0)) {
    html = `<div style="color:var(--text-muted);">Trage Gewicht, Taille und Hals ein und fülle dein Profil (Größe, Geschlecht, Geburtsjahr) aus.</div>`;
  } else {
    const src = [waist, neck].filter(Boolean).map(x => x.day).sort();
    html += `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:8px; line-height:1.5;">
      Schätzungen, keine Messung — Abweichung zur DEXA-Messung typisch ±3–4 Prozentpunkte. Aussagekräftig ist vor allem der <strong>Verlauf</strong>
      (im Diagramm unter „KFA"). Taille auf Höhe des Bauchnabels, Hals unterhalb des Kehlkopfs messen${s.sex === 'w' ? ', Hüfte an der breitesten Stelle' : ''}.
      ${src.length && navy !== null ? `<br>Grundlage: Umfänge vom ${fmtDay(src[src.length - 1], true)}.` : ''}</div>`;
  }
  el.innerHTML = html;
}

// Local calendar day "YYYY-MM-DD" (not UTC)
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Day of a stored entry, as stored (no time-zone shifting)
function metricDay(m) {
  return String(m.measured_at).slice(0, 10);
}

function fmtDay(day, withYear) {
  return new Date(day + 'T12:00:00').toLocaleDateString('de-DE',
    withYear ? { day: 'numeric', month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
}

function sortMetrics() {
  bodyMetrics.sort((a, b) => String(a.measured_at).localeCompare(String(b.measured_at)) || a.id - b.id);
}
let weeklyTrainingMin = 0; // Ø minutes/week from logged workouts + cardio (last 4 weeks)

async function init() {
  document.getElementById('nav-placeholder').innerHTML = buildNav(null);

  const user = await requireAuth();
  if (!user) return;

  try {
    const [settings, metrics, workouts, cardio] = await Promise.all([
      API.get('/api/settings'),
      API.get('/api/body-metrics'),
      API.get('/api/workouts').catch(() => []),
      API.get('/api/cardio').catch(() => [])
    ]);
    bodySettings = settings;
    bodyMetrics = metrics;
    weeklyTrainingMin = computeWeeklyTrainingMinutes(workouts, cardio);

    fillProfileForm();
    prefillWeightField();
    resetDateField();
    renderChart();
    renderMetricList();
    renderNutrition();
    renderBodyFat();
    renderHrZones();
  } catch (e) {
    showToast('Fehler beim Laden: ' + e.message, 'error');
  }
}

// Average training minutes per week over the last 28 days, from what the
// app already knows: strength workout durations + cardio entries.
function computeWeeklyTrainingMinutes(workouts, cardio) {
  const cutoff = Date.now() - 28 * 86400000;
  let minutes = 0;

  for (const w of workouts) {
    if (!w.ended_at) continue;
    const start = new Date(w.started_at), end = new Date(w.ended_at);
    if (start.getTime() < cutoff) continue;
    // Cap single sessions at 3h — protects against forgot-to-end workouts
    minutes += Math.min(180, Math.max(0, (end - start) / 60000));
  }
  for (const c of cardio) {
    if (new Date(c.performed_at).getTime() < cutoff) continue;
    minutes += c.duration_min;
  }
  return Math.round(minutes / 4); // per week
}

/* ── Profile ──────────────────────────────────────────────── */

function fillProfileForm() {
  const s = bodySettings;
  if (s.height_cm) document.getElementById('profile-height').value = s.height_cm;
  if (s.birth_year) document.getElementById('profile-birthyear').value = s.birth_year;
  if (s.sex) document.getElementById('profile-sex').value = s.sex;
  if (s.job_activity) document.getElementById('profile-job').value = s.job_activity;
  if (s.extra_sport_min) document.getElementById('profile-extra-sport').value = s.extra_sport_min;

  // Show what the app derives from the training log
  const info = document.getElementById('training-time-info');
  if (info) {
    const extra = s.extra_sport_min || 0;
    info.innerHTML = `📊 Sport wird automatisch berechnet: Ø <strong>${weeklyTrainingMin} min/Woche</strong> aus deinen Trainings + Cardio (letzte 4 Wochen)` +
      (extra > 0 ? ` + ${extra} min weiterer Sport` : '');
    info.style.display = 'block';
  }
}

let profileSaveTimer = null;
function saveProfile() {
  clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(async () => {
    const payload = {
      height_cm: document.getElementById('profile-height').value || null,
      birth_year: document.getElementById('profile-birthyear').value || null,
      sex: document.getElementById('profile-sex').value || null,
      job_activity: document.getElementById('profile-job').value || null,
      extra_sport_min: document.getElementById('profile-extra-sport').value || null
    };
    try {
      bodySettings = await API.put('/api/settings', payload);
      showToast('Profil gespeichert', 'success');
      fillProfileForm();
      renderNutrition();
      renderBodyFat();
      renderChart(); // KFA series depends on height and sex
      renderHrZones();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }, 500);
}

async function setGoal(goal) {
  try {
    bodySettings = await API.put('/api/settings', { goal });
    renderNutrition();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

/* ── Weight / measurements log ────────────────────────────── */

function toggleMeasurements() {
  const el = document.getElementById('measure-fields');
  const btn = document.getElementById('measure-toggle');
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  btn.textContent = open ? '+ Umfänge erfassen (optional)' : '− Umfänge ausblenden';
}

// Pre-fill the weight input with the latest entry so the next weigh-in is
// just a small correction instead of typing from scratch.
function prefillWeightField() {
  const w = latestWeight();
  if (w) document.getElementById('new-weight').value = w;
}

function resetDateField() {
  const el = document.getElementById('new-date');
  if (el) { el.value = todayStr(); el.max = todayStr(); }
}

async function addWeight() {
  const payload = {};
  const ids = { weight: 'new-weight', waist: 'new-waist', chest: 'new-chest', arm: 'new-arm', neck: 'new-neck', hip: 'new-hip' };
  for (const [k, id] of Object.entries(ids)) payload[k] = document.getElementById(id)?.value || '';

  if (Object.values(payload).every(v => !v)) {
    showToast('Bitte mindestens einen Wert eintragen', 'error');
    return;
  }
  // Only send a date when it is not today -> today keeps the real time
  const date = document.getElementById('new-date')?.value;
  if (date && date !== todayStr()) payload.date = date;

  try {
    const row = await API.post('/api/body-metrics', payload);
    bodyMetrics.push(row);
    sortMetrics();
    // Girth fields clear, weight stays visible as the new baseline
    ['new-waist', 'new-chest', 'new-arm', 'new-neck', 'new-hip'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    prefillWeightField();
    resetDateField();
    showToast(payload.date ? `Gespeichert für ${fmtDay(payload.date, true)} 📏` : 'Gespeichert 📏', 'success');
    renderChart();
    renderMetricList();
    renderNutrition();
    renderBodyFat();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function deleteMetric(id) {
  if (!confirm('Eintrag löschen?')) return;
  try {
    await API.delete(`/api/body-metrics/${id}`);
    bodyMetrics = bodyMetrics.filter(m => m.id !== id);
    showToast('Gelöscht', 'success');
    prefillWeightField();
    renderChart();
    renderMetricList();
    renderNutrition();
    renderBodyFat();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

function latestWeight() {
  for (let i = bodyMetrics.length - 1; i >= 0; i--) {
    if (bodyMetrics[i].weight) return bodyMetrics[i].weight;
  }
  return null;
}

/* ── Chart + list ─────────────────────────────────────────── */

function renderChart() {
  const card = document.getElementById('weight-chart-card');
  const available = METRICS.filter(mt => bodyMetrics.some(m => metricValue(m, mt.key)));
  if (available.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  if (!available.some(mt => mt.key === chartMetric)) chartMetric = available[0].key;
  const metric = METRICS.find(mt => mt.key === chartMetric);

  // Chips only when there is more than one series to choose from
  document.getElementById('metric-chips').innerHTML = available.length > 1
    ? available.map(mt => `<button class="btn btn-sm ${mt.key === chartMetric ? 'btn-primary' : 'btn-secondary'}"
        onclick="selectChartMetric('${mt.key}')">${mt.label}</button>`).join('')
    : '';

  const points = bodyMetrics.filter(m => metricValue(m, metric.key));
  const first = metricValue(points[0], metric.key), last = metricValue(points[points.length - 1], metric.key);
  const diff = Math.round((last - first) * 10) / 10;
  document.getElementById('metric-change').textContent = points.length > 1
    ? `${metric.label}: ${last} ${metric.unit} · ${diff > 0 ? '+' : ''}${diff} ${metric.key === 'bf' ? 'Prozentpunkte' : metric.unit} seit ${fmtDay(metricDay(points[0]), true)}`
    : `${metric.label}: ${last} ${metric.unit}`;

  const labels = points.map(m => fmtDay(metricDay(m), false));
  const data = points.map(m => metricValue(m, metric.key));

  if (weightChart) weightChart.destroy();
  weightChart = new Chart(document.getElementById('weight-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${metric.label} (${metric.unit})`,
        data,
        borderColor: metric.color,
        backgroundColor: metric.color + '1f',
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function selectChartMetric(key) {
  chartMetric = key;
  renderChart();
}

function toggleAllMetrics() {
  showAllMetrics = !showAllMetrics;
  renderMetricList();
}

function renderMetricList() {
  const list = document.getElementById('metric-list');
  if (!list) return;
  const all = [...bodyMetrics].reverse();
  const shown = showAllMetrics ? all : all.slice(0, 5);

  list.innerHTML = shown.map(m => {
    if (m.id === editingMetricId) return renderMetricEditor(m);
    const parts = [];
    if (m.weight) parts.push(`<strong>${m.weight} kg</strong>`);
    if (m.waist) parts.push(`Taille ${m.waist}`);
    if (m.chest) parts.push(`Brust ${m.chest}`);
    if (m.arm) parts.push(`Arm ${m.arm}`);
    if (m.neck) parts.push(`Hals ${m.neck}`);
    if (m.hip) parts.push(`Hüfte ${m.hip}`);
    return `
      <div class="metric-row" onclick="editMetric(${m.id})" style="cursor:pointer;" title="Antippen zum Bearbeiten">
        <span style="color:var(--text-muted); font-size:0.78rem; width:74px;">${fmtDay(metricDay(m), true)}</span>
        <span style="flex:1;">${parts.join(' · ')}</span>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); deleteMetric(${m.id})" style="padding:2px 6px; color:var(--text-muted);">×</button>
      </div>`;
  }).join('') + (all.length ? '<div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">✏️ Eintrag antippen zum Bearbeiten (auch Datum)</div>' : '');

  const more = document.getElementById('metric-more');
  if (more) {
    more.style.display = all.length > 5 ? 'block' : 'none';
    more.textContent = showAllMetrics ? 'Weniger anzeigen ▴' : `Alle ${all.length} Einträge anzeigen ▾`;
  }
}

function renderMetricEditor(m) {
  const field = (key, label, step) => `
    <div><label class="form-label" style="font-size:0.72rem;">${label}</label>
      <input type="number" class="form-control" id="edit-${key}" step="${step}" value="${m[key] ?? ''}" style="padding:6px 8px;"></div>`;
  return `
    <div class="metric-row" style="display:block; padding:10px 0;">
      <label class="form-label" style="font-size:0.72rem;">Datum</label>
      <input type="date" class="form-control" id="edit-date" value="${metricDay(m)}" max="${todayStr()}" style="padding:6px 8px; margin-bottom:6px;">
      <div class="body-grid-2">
        ${field('weight', 'Gewicht (kg)', '0.1')}
        ${field('waist', 'Taille (cm)', '0.5')}
        ${field('chest', 'Brust (cm)', '0.5')}
        ${field('arm', 'Oberarm (cm)', '0.5')}
        ${field('neck', 'Hals (cm)', '0.5')}
        ${field('hip', 'Hüfte (cm)', '0.5')}
      </div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="btn btn-primary btn-sm" style="flex:1;" onclick="saveMetric(${m.id})">Speichern</button>
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="cancelEditMetric()">Abbrechen</button>
      </div>
    </div>`;
}

function editMetric(id) {
  editingMetricId = id;
  renderMetricList();
}

function cancelEditMetric() {
  editingMetricId = null;
  renderMetricList();
}

async function saveMetric(id) {
  const payload = { date: document.getElementById('edit-date').value };
  const editable = METRICS.filter(mt => !mt.derived);
  for (const mt of editable) payload[mt.key] = document.getElementById(`edit-${mt.key}`).value;
  if (editable.every(mt => !payload[mt.key])) {
    showToast('Mindestens ein Wert erforderlich', 'error');
    return;
  }
  try {
    const row = await API.put(`/api/body-metrics/${id}`, payload);
    bodyMetrics = bodyMetrics.map(m => (m.id === id ? row : m));
    sortMetrics();
    editingMetricId = null;
    showToast('Eintrag aktualisiert', 'success');
    prefillWeightField();
    renderChart();
    renderMetricList();
    renderNutrition();
    renderBodyFat();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

/* ── Nutrition (Mifflin-St-Jeor, offline) ─────────────────── */

// PAL base by job/daily activity — sport is added on top from real logs
const JOB_PAL = { sitzend: 1.35, stehend: 1.5, koerperlich: 1.65, schwer: 1.85 };
const JOB_LABEL = { sitzend: 'sitzend', stehend: 'stehend/gehend', koerperlich: 'körperlich aktiv', schwer: 'schwere Arbeit' };

function renderNutrition() {
  const s = bodySettings;
  const weight = latestWeight();
  const incomplete = document.getElementById('nutrition-incomplete');
  const content = document.getElementById('nutrition-content');

  const age = s.birth_year ? (new Date().getFullYear() - s.birth_year) : null;
  const hasActivity = s.job_activity || s.activity_level; // legacy fallback

  if (!weight || !s.height_cm || !age || !s.sex || !hasActivity) {
    incomplete.style.display = 'block';
    content.style.display = 'none';
    return;
  }
  incomplete.style.display = 'none';
  content.style.display = 'block';

  const goal = s.goal || 'maintain';
  document.querySelectorAll('.goal-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.goal === goal));

  // PAL: job base + sport surcharge from actual weekly training time
  // (~0.04 PAL per weekly hour, capped). Legacy: old combined activity_level.
  let pal, palDetail;
  if (s.job_activity) {
    const base = JOB_PAL[s.job_activity] || 1.4;
    const sportMin = weeklyTrainingMin + (s.extra_sport_min || 0);
    const surcharge = Math.min(0.45, (sportMin / 60) * 0.04);
    pal = base + surcharge;
    palDetail = `PAL ${base.toFixed(2)} (Beruf: ${JOB_LABEL[s.job_activity]}) + ${surcharge.toFixed(2)} (Sport: Ø ${sportMin} min/Woche) = <strong>${pal.toFixed(2)}</strong>`;
  } else {
    pal = s.activity_level;
    palDetail = `PAL ${pal} (alte kombinierte Skala — wähle „Beruf/Alltag" für die genauere Berechnung)`;
  }

  // BMR (Mifflin-St-Jeor) → TDEE → goal calories
  const bmr = 10 * weight + 6.25 * s.height_cm - 5 * age + (s.sex === 'm' ? 5 : -161);
  const tdee = Math.round(bmr * pal);
  const goalDelta = { cut: -400, maintain: 0, bulk: 300 }[goal];
  const kcal = tdee + goalDelta;

  // Protein: cut 2.2 g/kg (muscle protection), maintain 1.8, bulk 1.8
  const proteinPerKg = { cut: 2.2, maintain: 1.8, bulk: 1.8 }[goal];
  const protein = Math.round(weight * proteinPerKg);

  const water = (0.035 * weight).toFixed(1);

  document.getElementById('nutri-kcal').textContent = kcal;
  document.getElementById('nutri-protein').textContent = `${protein} g`;
  document.getElementById('nutri-tdee').textContent = tdee;
  document.getElementById('nutri-water').textContent = `${water} l`;

  const bmi = (weight / Math.pow(s.height_cm / 100, 2)).toFixed(1);
  document.getElementById('nutri-detail').innerHTML =
    `Grundumsatz (BMR): <strong>${Math.round(bmr)} kcal</strong> · BMI: <strong>${bmi}</strong><br>` +
    `${palDetail}<br>` +
    `Protein: ${proteinPerKg} g/kg Körpergewicht · Formel: Mifflin-St-Jeor · Richtwerte, keine medizinische Beratung.`;
}

/* ── Heart rate zones (220 − Alter) ───────────────────────── */

function renderHrZones() {
  const card = document.getElementById('hr-card');
  const s = bodySettings;
  if (!s.birth_year) { card.style.display = 'none'; return; }

  const age = new Date().getFullYear() - s.birth_year;
  const maxHr = 220 - age;
  const zones = [
    { name: 'Zone 1 — Regeneration', lo: 0.50, hi: 0.60, color: '#4ade80' },
    { name: 'Zone 2 — Grundlagenausdauer', lo: 0.60, hi: 0.70, color: '#60a5fa' },
    { name: 'Zone 3 — Aerobe Zone', lo: 0.70, hi: 0.80, color: '#fbbf24' },
    { name: 'Zone 4 — Schwelle', lo: 0.80, hi: 0.90, color: '#fb923c' },
    { name: 'Zone 5 — Maximal', lo: 0.90, hi: 1.00, color: '#ef4444' }
  ];

  document.getElementById('hr-zones').innerHTML =
    `<div style="font-size:0.85rem; margin-bottom:8px;">Max. Herzfrequenz: <strong>${maxHr} bpm</strong></div>` +
    zones.map(z => `
      <div class="zone-row">
        <div class="zone-color" style="background:${z.color};"></div>
        <div style="flex:1;">${z.name}</div>
        <div style="font-variant-numeric:tabular-nums; color:var(--text-secondary);">
          ${Math.round(maxHr * z.lo)}–${Math.round(maxHr * z.hi)} bpm
        </div>
      </div>`).join('');
  card.style.display = 'block';
}

init();
