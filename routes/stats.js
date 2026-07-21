const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// GET /api/progress-exercises — only exercises the user actually has logged
// (completed, non-skipped) data for, so the progress dropdown stays short and
// never leads to an empty chart. Uses the snapshot name so renamed/deleted
// exercises still appear.
router.get('/progress-exercises', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      COALESCE(ws.exercise_id_snapshot, se.exercise_id) as id,
      COALESCE(ws.exercise_name, e.name) as name,
      COUNT(DISTINCT w.id) as workouts
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    LEFT JOIN session_exercises se ON se.id = ws.session_exercise_id
    LEFT JOIN exercises e ON e.id = COALESCE(ws.exercise_id_snapshot, se.exercise_id)
    WHERE w.user_id = ?
      AND w.ended_at IS NOT NULL
      AND (ws.skipped IS NULL OR ws.skipped = 0)
    GROUP BY COALESCE(ws.exercise_id_snapshot, se.exercise_id)
    HAVING COALESCE(ws.exercise_id_snapshot, se.exercise_id) IS NOT NULL
       AND COALESCE(ws.exercise_name, e.name) IS NOT NULL
    ORDER BY name COLLATE NOCASE
  `).all(req.session.userId);
  res.json(rows);
});

// GET /api/stats/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
// Per-day volume + workouts, feeds the history calendar.
router.get('/stats/calendar', requireAuth, (req, res) => {
  const { from, to } = req.query;
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'from/to (YYYY-MM-DD) erforderlich' });
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT
      DATE(w.started_at) as date,
      w.id as workout_id,
      w.is_deload,
      ps.session_label,
      SUM(CASE WHEN (ws.skipped IS NULL OR ws.skipped = 0) THEN ws.weight * ws.reps ELSE 0 END) as volume,
      COUNT(CASE WHEN (ws.skipped IS NULL OR ws.skipped = 0) THEN 1 END) as set_count
    FROM workouts w
    JOIN plan_sessions ps ON ps.id = w.session_id
    LEFT JOIN workout_sets ws ON ws.workout_id = w.id
    WHERE w.user_id = ?
      AND DATE(w.started_at) BETWEEN ? AND ?
    GROUP BY w.id
    HAVING COUNT(ws.id) > 0
    ORDER BY w.started_at ASC
  `).all(req.session.userId, from, to);

  // Fold workouts into days
  const days = {};
  for (const r of rows) {
    if (!days[r.date]) days[r.date] = { date: r.date, volume: 0, set_count: 0, workouts: [] };
    days[r.date].volume += r.volume || 0;
    days[r.date].set_count += r.set_count || 0;
    days[r.date].workouts.push({
      id: r.workout_id,
      session_label: r.session_label,
      is_deload: r.is_deload === 1
    });
  }

  res.json(Object.values(days));
});

// GET /api/stats/muscle-volume
// Sets per primary muscle group: current week (Mon-Sun) vs previous week.
router.get('/stats/muscle-volume', requireAuth, (req, res) => {
  const db = getDb();

  // Monday of the current week (local server time is fine for week grouping)
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now); monday.setDate(now.getDate() - day);
  const prevMonday = new Date(monday); prevMonday.setDate(monday.getDate() - 7);
  const iso = d => d.toISOString().slice(0, 10);

  const query = db.prepare(`
    SELECT e.muscle_groups,
           COUNT(*) as sets
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN session_exercises se ON se.id = ws.session_exercise_id
    JOIN exercises e ON e.id = COALESCE(ws.exercise_id_snapshot, se.exercise_id)
    WHERE w.user_id = ?
      AND (ws.skipped IS NULL OR ws.skipped = 0)
      AND DATE(w.started_at) >= ? AND DATE(w.started_at) < ?
    GROUP BY e.muscle_groups
  `);

  const fold = rows => {
    const by = {};
    for (const r of rows) {
      const primary = (r.muscle_groups || 'Sonstige').split(',')[0].trim() || 'Sonstige';
      by[primary] = (by[primary] || 0) + r.sets;
    }
    return by;
  };

  const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);
  const current = fold(query.all(req.session.userId, iso(monday), iso(nextMonday)));
  const previous = fold(query.all(req.session.userId, iso(prevMonday), iso(monday)));

  const muscles = [...new Set([...Object.keys(current), ...Object.keys(previous)])];
  const result = muscles.map(m => ({
    muscle: m,
    sets: current[m] || 0,
    prev_sets: previous[m] || 0
  })).sort((a, b) => b.sets - a.sets);

  res.json({ week_start: iso(monday), muscles: result });
});

// GET /api/stats/prs/:workout_id
// Records set in this workout compared to all earlier training history.
router.get('/stats/prs/:workout_id', requireAuth, (req, res) => {
  const db = getDb();
  const workout = db.prepare(
    'SELECT * FROM workouts WHERE id = ? AND user_id = ?'
  ).get(req.params.workout_id, req.session.userId);
  if (!workout) return res.status(404).json({ error: 'Workout not found' });

  // Best weight + best est-1RM per exercise in THIS workout
  const thisWorkout = db.prepare(`
    SELECT
      COALESCE(ws.exercise_id_snapshot, se.exercise_id) as ex_id,
      COALESCE(ws.exercise_name, e.name) as ex_name,
      MAX(ws.weight) as max_weight,
      MAX(CASE WHEN ws.reps <= 1 THEN ws.weight ELSE ws.weight * (1.0 + ws.reps / 30.0) END) as est_1rm
    FROM workout_sets ws
    JOIN session_exercises se ON se.id = ws.session_exercise_id
    JOIN exercises e ON e.id = se.exercise_id
    WHERE ws.workout_id = ? AND (ws.skipped IS NULL OR ws.skipped = 0) AND ws.weight > 0
    GROUP BY COALESCE(ws.exercise_id_snapshot, se.exercise_id)
  `).all(workout.id);

  const prs = [];
  for (const cur of thisWorkout) {
    const prev = db.prepare(`
      SELECT
        MAX(ws.weight) as max_weight,
        MAX(CASE WHEN ws.reps <= 1 THEN ws.weight ELSE ws.weight * (1.0 + ws.reps / 30.0) END) as est_1rm
      FROM workout_sets ws
      JOIN workouts w ON w.id = ws.workout_id
      JOIN session_exercises se ON se.id = ws.session_exercise_id
      WHERE w.user_id = ?
        AND w.id != ?
        AND w.started_at < ?
        AND w.ended_at IS NOT NULL
        AND (ws.skipped IS NULL OR ws.skipped = 0)
        AND COALESCE(ws.exercise_id_snapshot, se.exercise_id) = ?
    `).get(req.session.userId, workout.id, workout.started_at, cur.ex_id);

    // Only count as PR when there IS history (first-ever workout isn't a "record")
    if (prev && prev.max_weight !== null) {
      if (cur.max_weight > prev.max_weight) {
        prs.push({ exercise: cur.ex_name, type: 'weight', new_value: cur.max_weight, old_value: prev.max_weight });
      } else if (cur.est_1rm > (prev.est_1rm || 0) + 0.01) {
        prs.push({ exercise: cur.ex_name, type: '1rm', new_value: Math.round(cur.est_1rm * 10) / 10, old_value: Math.round((prev.est_1rm || 0) * 10) / 10 });
      }
    }
  }

  res.json(prs);
});

// GET /api/export — full training history as CSV (semicolon-separated for
// German Excel). The self-hosted answer to "your data belongs to you".
router.get('/export', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      DATE(w.started_at) as datum,
      TIME(w.started_at) as uhrzeit,
      tp.name as plan,
      ps.session_label as einheit,
      COALESCE(ws.exercise_name, e.name) as uebung,
      ws.set_number as satz,
      ws.weight as gewicht,
      ws.reps as wiederholungen,
      ws.is_bodyweight as bodyweight,
      ws.rating as bewertung,
      ws.skipped as uebersprungen,
      ws.note as notiz,
      w.is_deload as deload
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN plan_sessions ps ON ps.id = w.session_id
    JOIN training_plans tp ON tp.id = ps.plan_id
    JOIN session_exercises se ON se.id = ws.session_exercise_id
    JOIN exercises e ON e.id = se.exercise_id
    WHERE w.user_id = ?
    ORDER BY w.started_at ASC, ws.session_exercise_id, ws.set_number
  `).all(req.session.userId);

  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const header = 'Datum;Uhrzeit;Plan;Einheit;Übung;Satz;Gewicht;Wiederholungen;Bodyweight;Bewertung;Übersprungen;Notiz;Deload';
  const lines = rows.map(r => [
    r.datum, r.uhrzeit, r.plan, r.einheit, r.uebung, r.satz, r.gewicht,
    r.wiederholungen, r.bodyweight, r.bewertung, r.uebersprungen, r.notiz, r.deload
  ].map(esc).join(';'));

  const csv = '﻿' + [header, ...lines].join('\r\n'); // BOM for Excel umlauts

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="workout-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

module.exports = router;
