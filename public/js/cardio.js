/* ============================================================
   Cardio — quick logging of endurance sessions
   ============================================================ */

const CARDIO_ACTIVITIES = [
  { id: 'Laufband',      em: '🏃' },
  { id: 'Laufen',        em: '🏞️' },
  { id: 'Stairmaster',   em: '🪜' },
  { id: 'Rad/Ergometer', em: '🚴' },
  { id: 'Rudern',        em: '🚣' },
  { id: 'Crosstrainer',  em: '⛷️' },
  { id: 'Schwimmen',     em: '🏊' },
  { id: 'Sonstiges',     em: '✨' },
];

let cardioActivity = 'Laufband';
let cardioEntries = [];

async function init() {
  document.getElementById('nav-placeholder').innerHTML = buildNav(null);

  const user = await requireAuth();
  if (!user) return;

  renderActivityGrid();
  loadEntries();
  loadHrHint();
}

function renderActivityGrid() {
  document.getElementById('activity-grid').innerHTML = CARDIO_ACTIVITIES.map(a => `
    <button class="activity-btn${a.id === cardioActivity ? ' active' : ''}" data-act="${a.id}"
      onclick="pickActivity('${a.id}')">
      <span class="em">${a.em}</span>${a.id}
    </button>`).join('');
}

function pickActivity(id) {
  cardioActivity = id;
  document.querySelectorAll('.activity-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.act === id));
}

async function addCardio() {
  const duration = document.getElementById('cardio-duration').value;
  const distance = document.getElementById('cardio-distance').value;
  const note = document.getElementById('cardio-note').value;

  if (!duration || parseFloat(duration) <= 0) {
    showToast('Bitte eine Dauer eintragen', 'error');
    return;
  }

  try {
    await API.post('/api/cardio', {
      activity: cardioActivity,
      duration_min: duration,
      distance_km: distance || null,
      note: note || null
    });
    document.getElementById('cardio-duration').value = '';
    document.getElementById('cardio-distance').value = '';
    document.getElementById('cardio-note').value = '';
    showToast('Cardio gespeichert 🏃', 'success');
    loadEntries();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function loadEntries() {
  try {
    cardioEntries = await API.get('/api/cardio');
    renderWeekSummary();
    renderList();
  } catch (e) { /* ignore */ }
}

function renderWeekSummary() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);

  const week = cardioEntries.filter(c => new Date(c.performed_at) >= monday);
  const minutes = week.reduce((s, c) => s + c.duration_min, 0);
  const km = week.reduce((s, c) => s + (c.distance_km || 0), 0);

  document.getElementById('week-sessions').textContent = week.length;
  document.getElementById('week-minutes').textContent = Math.round(minutes);
  document.getElementById('week-km').textContent = km > 0 ? km.toFixed(1) : '–';
}

function renderList() {
  const list = document.getElementById('cardio-list');
  if (cardioEntries.length === 0) {
    list.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">Noch keine Einträge.</p>';
    return;
  }
  const em = act => (CARDIO_ACTIVITIES.find(a => a.id === act) || { em: '✨' }).em;
  list.innerHTML = cardioEntries.slice(0, 10).map(c => {
    const d = new Date(c.performed_at).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
    const parts = [`${Math.round(c.duration_min)} min`];
    if (c.distance_km) parts.push(`${c.distance_km} km`);
    if (c.note) parts.push(escapeHtml(c.note));
    return `
      <div class="cardio-entry">
        <span style="font-size:1.2rem;">${em(c.activity)}</span>
        <div style="flex:1;">
          <div style="font-weight:600;">${escapeHtml(c.activity)}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${parts.join(' · ')}</div>
        </div>
        <span style="font-size:0.72rem; color:var(--text-muted);">${d}</span>
        <button class="btn btn-ghost btn-sm" onclick="deleteCardio(${c.id})" style="padding:2px 6px; color:var(--text-muted);">×</button>
      </div>`;
  }).join('');
}

async function deleteCardio(id) {
  if (!confirm('Eintrag löschen?')) return;
  try {
    await API.delete(`/api/cardio/${id}`);
    cardioEntries = cardioEntries.filter(c => c.id !== id);
    renderWeekSummary();
    renderList();
    showToast('Gelöscht', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// Zone-2 tip from the body profile (220 − Alter), Paket-5 synergy
async function loadHrHint() {
  try {
    const s = await API.get('/api/settings');
    if (!s.birth_year) return;
    const maxHr = 220 - (new Date().getFullYear() - s.birth_year);
    const el = document.getElementById('hr-hint');
    el.innerHTML = `💓 Tipp: Grundlagenausdauer (Zone 2) = <strong>${Math.round(maxHr * 0.6)}–${Math.round(maxHr * 0.7)} bpm</strong> — alle Zonen auf der Körper-Seite.`;
    el.style.display = 'block';
  } catch (e) { /* optional */ }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
