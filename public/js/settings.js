/* ============================================================
   Settings Page
   ============================================================ */

let deloadWeeks = 6;
let deloadPercent = 55;
let plateInv = null; // null = disabled

const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];

async function init() {
  document.getElementById('nav-placeholder').innerHTML = buildNav(null);
  document.getElementById('version-display').textContent = 'v' + APP_VERSION;

  const user = await requireAuth();
  if (!user) return;

  try {
    const settings = await API.get('/api/settings');
    document.getElementById('auto-progress-toggle').checked = settings.auto_progress === 1;
    document.getElementById('deload-toggle').checked = (settings.deload_enabled ?? 1) === 1;
    deloadWeeks = settings.deload_interval_weeks ?? 6;
    deloadPercent = settings.deload_percent ?? 55;
    updateDeloadDisplays();

    plateInv = parsePlateInventory(settings.plate_inventory);
    document.getElementById('plates-toggle').checked = !!plateInv;
    renderPlateEditor();
  } catch (e) {
    showToast('Fehler beim Laden der Einstellungen: ' + e.message, 'error');
  }
}

/* ── Plate inventory ─────────────────────────────────────── */

function renderPlateEditor() {
  const editor = document.getElementById('plates-editor');
  if (!plateInv) {
    editor.style.display = 'none';
    return;
  }
  editor.style.display = 'block';
  document.getElementById('plate-bar').value = plateInv.bar;

  document.getElementById('plate-rows').innerHTML = PLATE_SIZES.map(size => {
    const count = plateInv.plates[String(size)] || 0;
    return `
      <div class="setting-row" style="padding:8px 0;">
        <div class="setting-info"><div class="setting-title" style="font-size:0.88rem;">${size} kg</div></div>
        <div style="display:flex; align-items:center; gap:0;">
          <button class="btn btn-secondary" style="width:32px;height:32px;padding:0;" onclick="adjustPlate('${size}',-1)">−</button>
          <span style="min-width:44px;text-align:center;font-weight:700;" id="plate-count-${String(size).replace('.','_')}">${count}</span>
          <button class="btn btn-secondary" style="width:32px;height:32px;padding:0;" onclick="adjustPlate('${size}',1)">+</button>
        </div>
      </div>`;
  }).join('');

  updatePlatePreview();
}

function togglePlates(enabled) {
  plateInv = enabled ? JSON.parse(JSON.stringify(DEFAULT_PLATE_INVENTORY)) : null;
  renderPlateEditor();
  savePlates(true);
}

function adjustPlate(size, delta) {
  if (!plateInv) return;
  const cur = plateInv.plates[size] || 0;
  plateInv.plates[size] = Math.min(20, Math.max(0, cur + delta));
  document.getElementById(`plate-count-${size.replace('.','_')}`).textContent = plateInv.plates[size];
  updatePlatePreview();
  savePlates();
}

function updatePlatePreview() {
  const box = document.getElementById('plate-preview');
  if (!plateInv || !box) return;
  const maxPerSide = Object.keys(plateInv.plates)
    .reduce((sum, s) => sum + Number(s) * (plateInv.plates[s] || 0), 0);
  const maxTotal = plateInv.bar + maxPerSide * 2;
  const example = computePlateLoadout(Math.min(100, maxTotal), plateInv);
  box.innerHTML = `Maximal ladbar: <strong>${maxTotal} kg</strong><br>` +
    `Beispiel ${example.actual} kg → pro Seite: <strong>${formatPlateLoadout(example, plateInv)}</strong>`;
}

let plateSaveTimer = null;
function savePlates(immediate) {
  if (plateInv) {
    const bar = parseFloat(document.getElementById('plate-bar').value);
    if (!isNaN(bar) && bar >= 5 && bar <= 30) plateInv.bar = bar;
    updatePlatePreview();
  }
  clearTimeout(plateSaveTimer);
  plateSaveTimer = setTimeout(async () => {
    try {
      await API.put('/api/settings', { plate_inventory: plateInv });
      showToast(plateInv ? 'Scheiben gespeichert' : 'Scheiben-Rechner deaktiviert', 'success');
    } catch (e) {
      showToast('Fehler beim Speichern: ' + e.message, 'error');
    }
  }, immediate ? 0 : 700);
}

async function saveAutoProgress(enabled) {
  try {
    await API.put('/api/settings', { auto_progress: enabled });
    showToast(enabled ? 'Auto-Progress aktiviert' : 'Auto-Progress deaktiviert', 'success');
  } catch (e) {
    showToast('Fehler beim Speichern: ' + e.message, 'error');
    // Revert toggle on error
    document.getElementById('auto-progress-toggle').checked = !enabled;
  }
}

function updateDeloadDisplays() {
  document.getElementById('deload-weeks-display').textContent = `${deloadWeeks} Wo.`;
  document.getElementById('deload-percent-display').textContent = `${deloadPercent} %`;
}

function adjustDeloadWeeks(delta) {
  deloadWeeks = Math.min(12, Math.max(3, deloadWeeks + delta));
  updateDeloadDisplays();
  saveDeload();
}

function adjustDeloadPercent(delta) {
  deloadPercent = Math.min(80, Math.max(40, deloadPercent + delta));
  updateDeloadDisplays();
  saveDeload();
}

let deloadSaveTimer = null;
async function saveDeload() {
  // Debounce rapid +/- taps into one API call
  clearTimeout(deloadSaveTimer);
  deloadSaveTimer = setTimeout(async () => {
    try {
      await API.put('/api/settings', {
        deload_enabled: document.getElementById('deload-toggle').checked,
        deload_interval_weeks: deloadWeeks,
        deload_percent: deloadPercent
      });
      showToast('Deload-Einstellungen gespeichert', 'success');
    } catch (e) {
      showToast('Fehler beim Speichern: ' + e.message, 'error');
    }
  }, 600);
}

init();
