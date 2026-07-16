/* ============================================================
   Settings Page
   ============================================================ */

let deloadWeeks = 6;
let deloadPercent = 55;

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
  } catch (e) {
    showToast('Fehler beim Laden der Einstellungen: ' + e.message, 'error');
  }
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
