/* ============================================================
   Settings Page
   ============================================================ */

async function init() {
  document.getElementById('nav-placeholder').innerHTML = buildNav(null);
  document.getElementById('version-display').textContent = 'v' + APP_VERSION;

  const user = await requireAuth();
  if (!user) return;

  try {
    const settings = await API.get('/api/settings');
    document.getElementById('auto-progress-toggle').checked = settings.auto_progress === 1;
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

init();
