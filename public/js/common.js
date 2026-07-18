/* ============================================================
   Common Utilities - Shared across all pages
   ============================================================ */

const APP_VERSION = '3.8';

// API helper
const API = {
  async request(method, url, body = null, timeoutMs = 20000) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    };
    if (body !== null) {
      opts.body = JSON.stringify(body);
    }

    // Abort a stalled request instead of hanging forever (flaky mobile/LAN).
    // Without this the caller's button stays disabled and taps do nothing.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    opts.signal = controller.signal;

    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        throw new Error('Zeitüberschreitung – Server nicht erreichbar');
      }
      throw new Error('Netzwerkfehler – Server nicht erreichbar');
    }
    clearTimeout(timer);

    let data;
    try {
      data = await res.json();
    } catch (e) {
      // Non-JSON response (e.g. HTML error page) — avoid the cryptic
      // "Unexpected token '<'" parse error and surface something usable.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      throw new Error('Ungültige Serverantwort');
    }
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  },

  get: (url) => API.request('GET', url),
  post: (url, body) => API.request('POST', url, body),
  put: (url, body) => API.request('PUT', url, body),
  delete: (url) => API.request('DELETE', url)
};

// Auth check - redirect to login if not authenticated
async function requireAuth() {
  try {
    const data = await API.get('/api/auth/me');
    return data.user;
  } catch (e) {
    window.location.href = '/index.html';
    return null;
  }
}

// Format duration in seconds to mm:ss or h:mm:ss
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Format date to localized string
function formatDate(dateStr) {
  if (!dateStr) return 'Unbekannt';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Format time
function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// Format weight
function formatWeight(kg) {
  if (kg === 0) return '0 kg';
  return `${kg % 1 === 0 ? kg : kg.toFixed(1)} kg`;
}

// Web Audio API - generate beep sounds
let audioCtx = null;

function getAudioContext() {
  // iOS Safari closes the AudioContext after a phone call or app switch —
  // a closed context can never be resumed, so recreate it.
  if (audioCtx && audioCtx.state === 'closed') {
    audioCtx = null;
  }
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not available');
    }
  }
  return audioCtx;
}

// Revive audio when the page becomes visible/active again. iOS puts the
// context into 'interrupted' (non-standard) or 'suspended' after calls or
// app switches; without this the timer keeps running but stays silent.
function reviveAudioContext() {
  if (!audioCtx) return;
  if (audioCtx.state === 'closed') {
    audioCtx = null; // recreated lazily on next getAudioContext()
  } else if (audioCtx.state !== 'running') {
    audioCtx.resume().catch(() => {});
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) reviveAudioContext();
});
window.addEventListener('pageshow', reviveAudioContext);
window.addEventListener('focus', reviveAudioContext);

function playBeep(frequency = 880, duration = 0.3, volume = 0.5) {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    // Resume context if suspended/interrupted (autoplay policy, iOS calls)
    if (ctx.state !== 'running') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Beep error:', e);
  }
}

function playTimerDone() {
  // 2 beeps: 880Hz, 0.3s each with 0.2s gap
  playBeep(880, 0.3, 0.6);
  setTimeout(() => playBeep(880, 0.4, 0.7), 500);
}

// Show toast notification
function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 16px;
      left: 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const colors = {
    info: '#60a5fa',
    success: '#4ade80',
    error: '#ef4444',
    warning: '#fbbf24'
  };

  toast.style.cssText = `
    background: #16213e;
    border: 1px solid ${colors[type] || colors.info};
    color: #f0f0f0;
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 0.9rem;
    font-weight: 500;
    pointer-events: auto;
    animation: fadeIn 0.3s ease;
    border-left: 4px solid ${colors[type] || colors.info};
    max-width: 400px;
    margin: 0 auto;
    width: 100%;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  `;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Confirm dialog
function showConfirm(message) {
  return window.confirm(message);
}

/* ============================================================
   Plate Calculator — shared by training, settings and 1RM mode
   ============================================================ */

// Bar slots: two straight bars (e.g. 20 kg + a lighter 10 kg), EZ/SZ bar and
// adjustable dumbbells. Plates are one shared pool (counts PER SIDE).
const BAR_TYPES = [
  { id: 'lh1', label: 'Langhantel',    em: '🏋️', def: 20, hint: '' },
  { id: 'lh2', label: '2. Langhantel', em: '🏋️', def: 10, hint: 'z.B. leichtere 10-kg-Stange' },
  { id: 'sz',  label: 'SZ-Stange',     em: '➰',  def: 8,  hint: 'meist leichter als eine LH' },
  { id: 'kh',  label: 'Kurzhantel',    em: '💪', def: 2,  hint: 'Gewicht pro Hantelstange' }
];

const DEFAULT_PLATE_INVENTORY = {
  plates: { '25': 0, '20': 2, '15': 0, '10': 2, '5': 2, '2.5': 2, '1.25': 2 },
  bars: {
    lh1: { weight: 20, enabled: true },
    lh2: { weight: 10, enabled: false },
    sz:  { weight: 8,  enabled: false },
    kh:  { weight: 2,  enabled: false }
  }
};

function parsePlateInventory(raw) {
  if (!raw) return null;
  try {
    const inv = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!inv || typeof inv.plates !== 'object') return null;
    // Migrate legacy single-bar format ({bar: 20}) to the bars structure
    if (!inv.bars || typeof inv.bars !== 'object') {
      const legacy = typeof inv.bar === 'number' ? inv.bar : 20;
      inv.bars = JSON.parse(JSON.stringify(DEFAULT_PLATE_INVENTORY.bars));
      inv.bars.lh1 = { weight: legacy, enabled: true };
    }
    for (const bt of BAR_TYPES) {
      if (!inv.bars[bt.id]) inv.bars[bt.id] = { weight: bt.def, enabled: false };
    }
    return inv;
  } catch (e) {
    return null;
  }
}

function primaryBarWeight(inv) {
  return inv?.bars?.lh1?.weight ?? inv?.bar ?? 20;
}

// Choose the right bar for an exercise from its equipment text.
// Returns { id, weight, label, em, perDumbbell, pair } or null — null means
// "no plate hint" (machine/cable/kettlebell exercises, or bar disabled).
function pickBarForEquipment(inv, equipment, targetWeight) {
  if (!inv || !inv.bars) return null;
  const eq = (equipment || '').toLowerCase();

  let id;
  if (eq.includes('sz')) id = 'sz';
  else if (eq.includes('kurzhantel')) id = 'kh';
  else if (eq.includes('langhantel')) id = 'lh1';
  else if (eq === '') id = 'lh1'; // no metadata → assume barbell (status quo)
  else return null;               // machine, cable, kettlebell, bodyweight …

  let bar = inv.bars[id];

  // Straight-bar work: fall back to the lighter second bar when the target
  // weight is below the main bar (or the main bar is disabled).
  if (id === 'lh1') {
    const lh2 = inv.bars.lh2;
    const useSecond = lh2 && lh2.enabled && (
      (!bar || !bar.enabled) ||
      (targetWeight !== undefined && targetWeight < bar.weight && targetWeight >= lh2.weight)
    );
    if (useSecond) { bar = lh2; id = 'lh2'; }
  }

  if (!bar || !bar.enabled) return null;
  const bt = BAR_TYPES.find(b => b.id === id) || BAR_TYPES[0];
  return {
    id,
    weight: bar.weight,
    label: bt.label,
    em: bt.em,
    perDumbbell: id === 'kh',
    // "Kurzhanteln" (plural) = one dumbbell per hand → plates split across
    // the pair; singular = one dumbbell held with both hands → full pool
    pair: id === 'kh' && eq.includes('kurzhanteln')
  };
}

// Dumbbell loadout WITHOUT the symmetry constraint: hands sit under the
// plates, so top/bottom distribution is free (user insight — e.g. 2.5 kg
// bar + 5×5 kg = 27.5 kg with 3 plates up, 2 down). Greedy over the total
// plate pool: inventory counts are per-side (= pairs owned), so a single
// dumbbell may use 2× each count; with a pair of dumbbells each gets 1×.
function computeDumbbellLoadout(target, inv, barWeight, pairMode) {
  const mult = pairMode ? 1 : 2;
  if (!inv || target < barWeight) {
    return { achievable: false, actual: barWeight || 0, plates: [], bar: barWeight || 0 };
  }
  let remaining = target - barWeight;
  const sizes = Object.keys(inv.plates).map(Number).filter(s => inv.plates[s] > 0).sort((a, b) => b - a);
  const plates = [];
  for (const size of sizes) {
    let count = inv.plates[String(size)] * mult;
    while (count > 0 && remaining >= size - 1e-9) {
      plates.push(size);
      remaining -= size;
      count--;
    }
  }
  const actual = barWeight + plates.reduce((a, b) => a + b, 0);
  return {
    achievable: Math.abs(actual - target) < 1e-9,
    actual,
    plates,
    bar: barWeight
  };
}

function formatDumbbellLoadout(loadout) {
  if (!loadout) return '';
  if (loadout.plates.length === 0) return `nur Stange (${loadout.bar} kg)`;
  const counts = {};
  loadout.plates.forEach(p => { counts[p] = (counts[p] || 0) + 1; });
  return Object.keys(counts).map(Number).sort((a, b) => b - a)
    .map(size => counts[size] > 1 ? `${counts[size]}×${size}` : `${size}`)
    .join(' + ');
}

// Greedy loadout: which plates per side for a target weight on a given bar.
// Returns { achievable, actual, perSide: [plate,...], bar, diff } — `actual`
// is the closest weight ≤ target the inventory can build (or bar weight).
function computePlateLoadout(target, inv, barWeight) {
  const bw = barWeight !== undefined ? barWeight : primaryBarWeight(inv);
  if (!inv || target < bw) {
    return { achievable: false, actual: bw || 0, perSide: [], bar: bw || 0, diff: inv ? target - bw : 0 };
  }
  let remainingPerSide = (target - bw) / 2;
  const sizes = Object.keys(inv.plates).map(Number).filter(s => inv.plates[s] > 0).sort((a, b) => b - a);
  const perSide = [];
  for (const size of sizes) {
    let count = inv.plates[String(size)];
    while (count > 0 && remainingPerSide >= size - 1e-9) {
      perSide.push(size);
      remainingPerSide -= size;
      count--;
    }
  }
  const actual = bw + (perSide.reduce((a, b) => a + b, 0) * 2);
  return {
    achievable: Math.abs(actual - target) < 1e-9,
    actual,
    perSide,
    bar: bw,
    diff: target - actual
  };
}

function formatPlateLoadout(loadout, inv) {
  if (!loadout) return '';
  if (loadout.perSide.length === 0) return `nur Stange (${loadout.bar} kg)`;
  const counts = {};
  loadout.perSide.forEach(p => { counts[p] = (counts[p] || 0) + 1; });
  return Object.keys(counts).map(Number).sort((a, b) => b - a)
    .map(size => counts[size] > 1 ? `${counts[size]}×${size}` : `${size}`)
    .join(' + ');
}

// Store current workout in sessionStorage
const WorkoutStorage = {
  save(data) {
    sessionStorage.setItem('currentWorkout', JSON.stringify(data));
  },
  load() {
    const data = sessionStorage.getItem('currentWorkout');
    return data ? JSON.parse(data) : null;
  },
  clear() {
    sessionStorage.removeItem('currentWorkout');
  }
};

// Navigation helper
function navigateTo(page) {
  window.location.href = page;
}

// Highlight active nav item
function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.page === page) {
      item.classList.add('active');
    }
  });
}

// Build the bottom nav HTML
function buildNav(activePage) {
  return `
    <nav class="bottom-nav">
      <a href="/dashboard.html" class="nav-item${activePage === 'dashboard' ? ' active' : ''}" data-page="dashboard">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        Start
      </a>
      <a href="/history.html" class="nav-item${activePage === 'history' ? ' active' : ''}" data-page="history">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Verlauf
      </a>
      <a href="/progress.html" class="nav-item${activePage === 'progress' ? ' active' : ''}" data-page="progress">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        Fortschritt
      </a>
      <a href="/plans.html" class="nav-item${activePage === 'plans' ? ' active' : ''}" data-page="plans">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Pläne
      </a>
    </nav>
  `;
}

// Exercise info modal
function showExerciseInfo(exercise) {
  let overlay = document.getElementById('exercise-info-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'exercise-info-modal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-exercise-name"></h2>
          <button class="modal-close" onclick="closeExerciseModal()">×</button>
        </div>
        <div id="modal-gif-container"></div>
        <div id="modal-muscle-tags" style="margin-bottom: 12px;"></div>
        <div class="technique-box">
          <h4>Technik-Hinweis</h4>
          <p id="modal-technique"></p>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeExerciseModal();
    });
    document.body.appendChild(overlay);
  }

  document.getElementById('modal-exercise-name').textContent = exercise.name;

  const gifContainer = document.getElementById('modal-gif-container');
  if (gifContainer) {
    if (exercise.gif_path) {
      gifContainer.innerHTML = `<div style="text-align:center; margin-bottom:14px; background:var(--bg-elevated); border-radius:10px; padding:8px; overflow:hidden;"><img src="/exercise-media/${exercise.gif_path}" style="max-width:100%; max-height:220px; object-fit:contain; border-radius:6px;" loading="lazy"></div>`;
    } else {
      gifContainer.innerHTML = '';
    }
  }

  const tagsEl = document.getElementById('modal-muscle-tags');
  const muscles = (exercise.muscle_groups || '').split(',');
  tagsEl.innerHTML = muscles.map(m => `<span class="muscle-tag">${m.trim()}</span>`).join('');

  document.getElementById('modal-technique').textContent = exercise.technique_tip || 'Keine Technik-Hinweise verfügbar.';

  overlay.classList.add('show');
}

function closeExerciseModal() {
  const overlay = document.getElementById('exercise-info-modal');
  if (overlay) overlay.classList.remove('show');
}

// Export for module use (works in both module and non-module contexts)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API, formatDuration, formatDate, formatTime, formatWeight, playTimerDone, showToast, WorkoutStorage, buildNav };
}
