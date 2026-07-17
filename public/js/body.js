/* ============================================================
   Körper & Ernährung — profile, weight log, nutrition calc
   ============================================================ */

let bodySettings = null;
let bodyMetrics = [];
let weightChart = null;

async function init() {
  document.getElementById('nav-placeholder').innerHTML = buildNav(null);

  const user = await requireAuth();
  if (!user) return;

  try {
    const [settings, metrics] = await Promise.all([
      API.get('/api/settings'),
      API.get('/api/body-metrics')
    ]);
    bodySettings = settings;
    bodyMetrics = metrics;

    fillProfileForm();
    renderChart();
    renderMetricList();
    renderNutrition();
    renderHrZones();
  } catch (e) {
    showToast('Fehler beim Laden: ' + e.message, 'error');
  }
}

/* ── Profile ──────────────────────────────────────────────── */

function fillProfileForm() {
  const s = bodySettings;
  if (s.height_cm) document.getElementById('profile-height').value = s.height_cm;
  if (s.birth_year) document.getElementById('profile-birthyear').value = s.birth_year;
  if (s.sex) document.getElementById('profile-sex').value = s.sex;
  if (s.activity_level) document.getElementById('profile-activity').value = String(s.activity_level);
}

let profileSaveTimer = null;
function saveProfile() {
  clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(async () => {
    const payload = {
      height_cm: document.getElementById('profile-height').value || null,
      birth_year: document.getElementById('profile-birthyear').value || null,
      sex: document.getElementById('profile-sex').value || null,
      activity_level: document.getElementById('profile-activity').value || null
    };
    try {
      bodySettings = await API.put('/api/settings', payload);
      showToast('Profil gespeichert', 'success');
      renderNutrition();
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

async function addWeight() {
  const weight = document.getElementById('new-weight').value;
  const waist = document.getElementById('new-waist')?.value;
  const chest = document.getElementById('new-chest')?.value;
  const arm = document.getElementById('new-arm')?.value;

  if (!weight && !waist && !chest && !arm) {
    showToast('Bitte mindestens einen Wert eintragen', 'error');
    return;
  }

  try {
    const row = await API.post('/api/body-metrics', { weight, waist, chest, arm });
    bodyMetrics.push(row);
    ['new-weight', 'new-waist', 'new-chest', 'new-arm'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    showToast('Gespeichert 📏', 'success');
    renderChart();
    renderMetricList();
    renderNutrition();
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
    renderChart();
    renderMetricList();
    renderNutrition();
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
  const weightPoints = bodyMetrics.filter(m => m.weight);
  if (weightPoints.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  const labels = weightPoints.map(m =>
    new Date(m.measured_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }));
  const data = weightPoints.map(m => m.weight);

  if (weightChart) weightChart.destroy();
  weightChart = new Chart(document.getElementById('weight-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Gewicht (kg)',
        data,
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96,165,250,0.12)',
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

function renderMetricList() {
  const list = document.getElementById('metric-list');
  if (!list) return;
  const recent = [...bodyMetrics].reverse().slice(0, 5);
  list.innerHTML = recent.map(m => {
    const d = new Date(m.measured_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: '2-digit' });
    const parts = [];
    if (m.weight) parts.push(`<strong>${m.weight} kg</strong>`);
    if (m.waist) parts.push(`Taille ${m.waist}`);
    if (m.chest) parts.push(`Brust ${m.chest}`);
    if (m.arm) parts.push(`Arm ${m.arm}`);
    return `
      <div class="metric-row">
        <span style="color:var(--text-muted); font-size:0.78rem; width:74px;">${d}</span>
        <span style="flex:1;">${parts.join(' · ')}</span>
        <button class="btn btn-ghost btn-sm" onclick="deleteMetric(${m.id})" style="padding:2px 6px; color:var(--text-muted);">×</button>
      </div>`;
  }).join('');
}

/* ── Nutrition (Mifflin-St-Jeor, offline) ─────────────────── */

function renderNutrition() {
  const s = bodySettings;
  const weight = latestWeight();
  const incomplete = document.getElementById('nutrition-incomplete');
  const content = document.getElementById('nutrition-content');

  const age = s.birth_year ? (new Date().getFullYear() - s.birth_year) : null;

  if (!weight || !s.height_cm || !age || !s.sex || !s.activity_level) {
    incomplete.style.display = 'block';
    content.style.display = 'none';
    return;
  }
  incomplete.style.display = 'none';
  content.style.display = 'block';

  const goal = s.goal || 'maintain';
  document.querySelectorAll('.goal-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.goal === goal));

  // BMR (Mifflin-St-Jeor) → TDEE → goal calories
  const bmr = 10 * weight + 6.25 * s.height_cm - 5 * age + (s.sex === 'm' ? 5 : -161);
  const tdee = Math.round(bmr * s.activity_level);
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
