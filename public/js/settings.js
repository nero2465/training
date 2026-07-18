/* ============================================================
   Settings Page
   ============================================================ */

let deloadWeeks = 6;
let deloadPercent = 55;
let plateInv = null; // null = disabled


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

  // Bar slots: toggle + weight per bar type
  document.getElementById('bar-rows').innerHTML = BAR_TYPES.map(bt => {
    const bar = plateInv.bars[bt.id];
    return `
      <div class="setting-row" style="padding:8px 0;">
        <div class="setting-info" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" ${bar.enabled ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer;"
            onchange="toggleBar('${bt.id}', this.checked)">
          <div>
            <div class="setting-title" style="font-size:0.88rem;">${bt.em} ${bt.label}</div>
            ${bt.hint ? `<div style="font-size:0.7rem; color:var(--text-muted);">${bt.hint}</div>` : ''}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px; ${bar.enabled ? '' : 'opacity:0.35;'}">
          <input type="number" class="form-control" id="bar-weight-${bt.id}" value="${bar.weight}" min="1" max="30" step="0.5"
            style="width:64px; text-align:center;" onchange="setBarWeight('${bt.id}', this.value)" ${bar.enabled ? '' : 'disabled'}> kg
        </div>
      </div>`;
  }).join('');

  // Plate sizes come from the inventory itself (freely add/remove any size),
  // sorted heaviest first
  const sizes = Object.keys(plateInv.plates).map(Number).sort((a, b) => b - a);

  document.getElementById('plate-rows').innerHTML = sizes.map(size => {
    const key = String(size);
    const count = plateInv.plates[key] || 0;
    const displaySize = String(size).replace('.', ',');
    return `
      <div class="setting-row" style="padding:8px 0;">
        <div class="setting-info" style="display:flex; align-items:center; gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="removePlateSize('${key}')" title="Größe entfernen"
            style="padding:2px 8px; color:var(--text-muted); font-size:1rem;">×</button>
          <div class="setting-title" style="font-size:0.88rem;">${displaySize} kg</div>
        </div>
        <div style="display:flex; align-items:center; gap:0;">
          <button class="btn btn-secondary" style="width:32px;height:32px;padding:0;" onclick="adjustPlate('${key}',-1)">−</button>
          <span style="min-width:44px;text-align:center;font-weight:700;" id="plate-count-${key.replace('.','_')}">${count}</span>
          <button class="btn btn-secondary" style="width:32px;height:32px;padding:0;" onclick="adjustPlate('${key}',1)">+</button>
        </div>
      </div>`;
  }).join('') + `
    <div class="setting-row" style="padding:10px 0 4px;">
      <div class="setting-info" style="display:flex; align-items:center; gap:8px;">
        <input type="number" class="form-control" id="new-plate-size" placeholder="z.B. 1,5" min="0.25" max="50" step="0.25"
          style="width:90px; text-align:center;" onkeydown="if(event.key==='Enter')addPlateSize()">
        <span class="text-muted" style="font-size:0.85rem;">kg</span>
      </div>
      <button class="btn btn-outline btn-sm" onclick="addPlateSize()">+ Scheibe hinzufügen</button>
    </div>`;

  updatePlatePreview();
}

function addPlateSize() {
  if (!plateInv) return;
  const input = document.getElementById('new-plate-size');
  // Accept German comma input ("1,5")
  const size = parseFloat(String(input.value).replace(',', '.'));
  if (isNaN(size) || size < 0.25 || size > 50) {
    showToast('Bitte eine Größe zwischen 0,25 und 50 kg eingeben', 'error');
    return;
  }
  const key = String(size);
  if (plateInv.plates[key] !== undefined) {
    showToast(`${key.replace('.', ',')} kg gibt es schon — nutze +/− bei der Zeile`, 'info');
    return;
  }
  plateInv.plates[key] = 1; // one pair = 1 per side
  renderPlateEditor();
  savePlates();
  showToast(`${key.replace('.', ',')} kg hinzugefügt`, 'success');
}

function removePlateSize(key) {
  if (!plateInv) return;
  delete plateInv.plates[key];
  renderPlateEditor();
  savePlates();
}

function togglePlates(enabled) {
  plateInv = enabled ? JSON.parse(JSON.stringify(DEFAULT_PLATE_INVENTORY)) : null;
  renderPlateEditor();
  savePlates(true);
}

function toggleBar(barId, enabled) {
  if (!plateInv) return;
  plateInv.bars[barId].enabled = enabled;
  renderPlateEditor();
  savePlates();
}

function setBarWeight(barId, value) {
  if (!plateInv) return;
  const w = parseFloat(value);
  if (!isNaN(w) && w >= 1 && w <= 30) plateInv.bars[barId].weight = w;
  updatePlatePreview();
  savePlates();
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

  const lines = BAR_TYPES
    .filter(bt => plateInv.bars[bt.id].enabled)
    .map(bt => {
      const w = plateInv.bars[bt.id].weight;
      return `${bt.em} ${bt.label} (${w} kg): max. <strong>${w + maxPerSide * 2} kg</strong>`;
    });

  const example = computePlateLoadout(Math.min(100, primaryBarWeight(plateInv) + maxPerSide * 2), plateInv);
  box.innerHTML = (lines.length ? lines.join('<br>') + '<br>' : '') +
    `Beispiel ${example.actual} kg (Langhantel) → pro Seite: <strong>${formatPlateLoadout(example, plateInv)}</strong><br>` +
    `<span style="opacity:0.75;">Die App wählt die Stange automatisch passend zum Equipment der Übung.</span>`;
}

let plateSaveTimer = null;
function savePlates(immediate) {
  if (plateInv) updatePlatePreview();
  clearTimeout(plateSaveTimer);
  plateSaveTimer = setTimeout(async () => {
    try {
      // Legacy "bar" field included so an older backend (version skew after a
      // frontend-only deploy) never rejects the multi-bar format
      const payload = plateInv
        ? { ...plateInv, bar: plateInv.bars?.lh1?.weight ?? 20 }
        : null;
      await API.put('/api/settings', { plate_inventory: payload });
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
