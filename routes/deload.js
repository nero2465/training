const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function getOrCreateSettings(db, userId) {
  let settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  if (!settings) {
    db.prepare('INSERT INTO user_settings (user_id, auto_progress) VALUES (?, 1)').run(userId);
    settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  }
  return settings;
}

// Training weeks in the current cycle, derived purely from workout HISTORY
// (works retroactively — no stored anchor needed):
// - only weeks (Mon–Sun) with at least one completed regular workout count,
//   so skipped weeks/vacation don't advance the cycle
// - a gap of 14+ days between workouts acts as a natural deload and starts
//   a new cycle
// - a finished deload week is a hard cycle boundary
function trainingWeeksInCycle(db, userId, boundaryIso) {
  const rows = boundaryIso
    ? db.prepare(`
        SELECT DISTINCT DATE(started_at) as d FROM workouts
        WHERE user_id = ? AND ended_at IS NOT NULL
          AND (is_deload IS NULL OR is_deload = 0)
          AND started_at > ?
        ORDER BY d DESC
      `).all(userId, boundaryIso)
    : db.prepare(`
        SELECT DISTINCT DATE(started_at) as d FROM workouts
        WHERE user_id = ? AND ended_at IS NOT NULL
          AND (is_deload IS NULL OR is_deload = 0)
        ORDER BY d DESC
      `).all(userId);

  if (rows.length === 0) return 0;

  // Walk backward from the most recent workout; stop at a 14+ day gap
  const dates = rows.map(r => new Date(r.d + 'T12:00:00Z'));
  const cycleDates = [dates[0]];
  for (let i = 1; i < dates.length; i++) {
    const gapDays = (dates[i - 1] - dates[i]) / 86400000;
    if (gapDays >= 14) break;
    cycleDates.push(dates[i]);
  }

  // Count distinct Monday-anchored weeks
  const weeks = new Set(cycleDates.map(d => {
    const day = (d.getUTCDay() + 6) % 7;
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - day);
    return mon.toISOString().slice(0, 10);
  }));
  return weeks.size;
}

// Central deload state resolution. Auto-finalizes an expired deload week;
// the cycle itself is computed from training history (see above).
function resolveDeloadState(db, userId) {
  let s = getOrCreateSettings(db, userId);
  const now = new Date();

  // Expired deload week → finalize: new cycle starts at deload end
  if (s.deload_active_until && new Date(s.deload_active_until) < now) {
    db.prepare(`
      UPDATE user_settings
      SET last_deload_end = deload_active_until, cycle_start_date = deload_active_until, deload_active_until = NULL
      WHERE user_id = ?
    `).run(userId);
    s = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  }

  const active = !!(s.deload_active_until && new Date(s.deload_active_until) >= now);
  const weekInCycle = trainingWeeksInCycle(db, userId, s.last_deload_end || null);
  const due = !active && (s.deload_enabled === 1) && weekInCycle >= s.deload_interval_weeks;

  // Post-deload week: first 7 days after a finished deload → reduced re-entry
  const postDeload = !active && s.last_deload_end &&
    (now - new Date(s.last_deload_end)) < 7 * 86400000;

  return { settings: s, active, due, weekInCycle, postDeload };
}

// GET /api/deload/status
router.get('/deload/status', requireAuth, (req, res) => {
  const db = getDb();
  const state = resolveDeloadState(db, req.session.userId);
  const s = state.settings;

  // Early-warning: many "too hard" ratings across the last two completed
  // regular workouts → fatigue is accumulating, suggest an early deload.
  let earlyWarning = false;
  if (s.deload_enabled === 1 && !state.active && !state.due) {
    const lastTwo = db.prepare(`
      SELECT w.id,
             SUM(CASE WHEN ws.rating = 1 THEN 1 ELSE 0 END) as hard_sets
      FROM workouts w
      JOIN workout_sets ws ON ws.workout_id = w.id
      WHERE w.user_id = ? AND w.ended_at IS NOT NULL
        AND (w.is_deload IS NULL OR w.is_deload = 0)
        AND (ws.skipped IS NULL OR ws.skipped = 0)
      GROUP BY w.id
      ORDER BY w.started_at DESC
      LIMIT 2
    `).all(req.session.userId);
    earlyWarning = lastTwo.length === 2 && lastTwo.every(w => w.hard_sets >= 2);
  }

  res.json({
    enabled: s.deload_enabled === 1,
    interval_weeks: s.deload_interval_weeks,
    deload_percent: s.deload_percent,
    week_in_cycle: state.weekInCycle,
    active: state.active,
    active_until: s.deload_active_until,
    due: state.due,
    post_deload: state.postDeload,
    early_warning: earlyWarning
  });
});

// POST /api/deload/start — begin a 7-day deload week now
router.post('/deload/start', requireAuth, (req, res) => {
  const db = getDb();
  getOrCreateSettings(db, req.session.userId);
  const until = new Date(Date.now() + 7 * 86400000).toISOString();
  db.prepare('UPDATE user_settings SET deload_active_until = ? WHERE user_id = ?')
    .run(until, req.session.userId);
  res.json({ active: true, active_until: until });
});

// POST /api/deload/end — end the deload week early; new cycle starts today
router.post('/deload/end', requireAuth, (req, res) => {
  const db = getDb();
  getOrCreateSettings(db, req.session.userId);
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE user_settings
    SET last_deload_end = ?, cycle_start_date = ?, deload_active_until = NULL
    WHERE user_id = ?
  `).run(now, now, req.session.userId);
  res.json({ active: false });
});

// GET /api/rotation-hints — exercises trained continuously for 8+ weeks,
// with alternatives from the catalog targeting the same primary muscle.
router.get('/rotation-hints', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      COALESCE(ws.exercise_id_snapshot, se.exercise_id) as ex_id,
      COALESCE(ws.exercise_name, e.name) as ex_name,
      MIN(w.started_at) as first_used,
      MAX(w.started_at) as last_used,
      COUNT(DISTINCT w.id) as session_count
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN session_exercises se ON se.id = ws.session_exercise_id
    JOIN exercises e ON e.id = se.exercise_id
    WHERE w.user_id = ? AND w.ended_at IS NOT NULL
      AND (w.is_deload IS NULL OR w.is_deload = 0)
      AND (ws.skipped IS NULL OR ws.skipped = 0)
    GROUP BY COALESCE(ws.exercise_id_snapshot, se.exercise_id)
  `).all(req.session.userId);

  const now = Date.now();
  const hints = [];

  for (const r of rows) {
    const spanDays = (new Date(r.last_used) - new Date(r.first_used)) / 86400000;
    const sinceLast = (now - new Date(r.last_used)) / 86400000;
    if (spanDays >= 56 && r.session_count >= 8 && sinceLast <= 14) {
      const ex = db.prepare('SELECT * FROM exercises WHERE id = ?').get(r.ex_id);
      if (!ex || !ex.muscle_groups) continue;
      const primaryMuscle = ex.muscle_groups.split(',')[0].trim();

      const alternatives = db.prepare(`
        SELECT name FROM exercises
        WHERE id != ? AND (active IS NULL OR active = 1)
          AND (category IS NULL OR category != 'crossfit')
          AND muscle_groups LIKE ?
        ORDER BY RANDOM() LIMIT 3
      `).all(r.ex_id, `%${primaryMuscle}%`).map(a => a.name);

      if (alternatives.length > 0) {
        hints.push({
          exercise_id: r.ex_id,
          name: r.ex_name,
          weeks: Math.floor(spanDays / 7),
          alternatives
        });
      }
    }
  }

  res.json(hints);
});

module.exports = { router, resolveDeloadState };
