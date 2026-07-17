const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// GET /api/special/muscles — primary muscle groups with enough exercises
router.get('/special/muscles', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT muscle_groups FROM exercises
    WHERE (category IS NULL OR category != 'crossfit')
      AND (active IS NULL OR active = 1)
      AND muscle_groups IS NOT NULL AND muscle_groups != ''
  `).all();

  const counts = {};
  for (const r of rows) {
    const primary = r.muscle_groups.split(',')[0].trim();
    if (!primary) continue;
    counts[primary] = (counts[primary] || 0) + 1;
  }

  const muscles = Object.entries(counts)
    .filter(([, c]) => c >= 2)
    .map(([muscle, count]) => ({ muscle, count }))
    .sort((a, b) => b.count - a.count);

  res.json(muscles);
});

// GET /api/special/suggest/:muscle — curated pick + alternatives.
// Exact token matching (no substrings — "Bizeps" must not match "Beinbizeps"),
// and a strict separation of target vs merely-supporting exercises:
//   suggested/others → muscle is a TARGET muscle (listed in muscle_groups)
//   supporting       → muscle only assists (listed in secondary_muscles only),
//                      e.g. Zercher Squat holding the bar with the biceps
router.get('/special/suggest/:muscle', requireAuth, (req, res) => {
  const db = getDb();
  const target = req.params.muscle.trim().toLowerCase();
  const tokens = s => (s || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

  const all = db.prepare(`
    SELECT id, name, muscle_groups, secondary_muscles, equipment
    FROM exercises
    WHERE (category IS NULL OR category != 'crossfit')
      AND (active IS NULL OR active = 1)
  `).all();

  const primary = [];    // target is THE primary muscle (first in list)
  const alsoTargets = []; // target appears in muscle_groups, but not first
  const supporting = []; // target only in secondary_muscles

  for (const ex of all) {
    const mg = tokens(ex.muscle_groups);
    const sec = tokens(ex.secondary_muscles);
    if (mg[0] === target) primary.push(ex);
    else if (mg.includes(target)) alsoTargets.push(ex);
    else if (sec.includes(target)) supporting.push(ex);
  }

  // Compounds first (exercises that hit additional muscles), then by name
  const compoundFirst = (a, b) => {
    const ca = tokens(a.secondary_muscles).length > 0 ? 0 : 1;
    const cb = tokens(b.secondary_muscles).length > 0 ? 0 : 1;
    return ca - cb || a.name.localeCompare(b.name, 'de');
  };
  primary.sort(compoundFirst);
  alsoTargets.sort(compoundFirst);
  supporting.sort((a, b) => a.name.localeCompare(b.name, 'de'));

  res.json({
    suggested: primary.slice(0, 5),
    others: [...primary.slice(5), ...alsoTargets],
    supporting
  });
});

// POST /api/special/start { muscle, exercise_ids: [...] }
// Creates a hidden system-plan session for this ad-hoc day and starts the
// workout — the regular training flow takes over from there.
router.post('/special/start', requireAuth, (req, res) => {
  const { muscle, exercise_ids } = req.body;
  if (!muscle || !Array.isArray(exercise_ids) || exercise_ids.length === 0) {
    return res.status(400).json({ error: 'muscle und exercise_ids erforderlich' });
  }
  if (exercise_ids.length > 10) {
    return res.status(400).json({ error: 'Maximal 10 Übungen' });
  }

  const db = getDb();
  const userId = req.session.userId;

  // Validate exercises exist
  const placeholders = exercise_ids.map(() => '?').join(',');
  const found = db.prepare(`SELECT id FROM exercises WHERE id IN (${placeholders})`).all(...exercise_ids);
  if (found.length !== exercise_ids.length) {
    return res.status(400).json({ error: 'Unbekannte Übung in der Auswahl' });
  }

  const { resolveDeloadState } = require('./deload');
  const deload = resolveDeloadState(db, userId);

  const tx = db.transaction(() => {
    // Hidden system plan (one per user)
    let plan = db.prepare(
      'SELECT * FROM training_plans WHERE user_id = ? AND is_system = 1'
    ).get(userId);
    if (!plan) {
      const r = db.prepare(
        "INSERT INTO training_plans (user_id, name, description, is_system) VALUES (?, 'Sondertraining', 'Automatisch erstellte Zusatz-Einheiten', 1)"
      ).run(userId);
      plan = db.prepare('SELECT * FROM training_plans WHERE id = ?').get(r.lastInsertRowid);
    }

    // Fresh session per special day, labeled with muscle + date
    const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const label = `🎯 ${muscle} ${dateStr}`;
    const sr = db.prepare(
      'INSERT INTO plan_sessions (plan_id, session_label, order_index) VALUES (?, ?, 999)'
    ).run(plan.id, label);
    const sessionId = sr.lastInsertRowid;

    const insertSe = db.prepare(`
      INSERT INTO session_exercises (session_id, exercise_id, sets, reps_min, reps_max, order_index)
      VALUES (?, ?, 3, 8, 12, ?)
    `);
    exercise_ids.forEach((exId, i) => insertSe.run(sessionId, exId, i));

    const wr = db.prepare(
      'INSERT INTO workouts (user_id, session_id, is_deload) VALUES (?, ?, ?)'
    ).run(userId, sessionId, deload.active ? 1 : 0);

    return { workout_id: wr.lastInsertRowid, session_id: sessionId, session_label: label };
  });

  res.status(201).json(tx());
});

module.exports = router;
