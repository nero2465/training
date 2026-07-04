const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// POST /api/workouts/start
router.post('/workouts/start', requireAuth, (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const db = getDb();

  // Verify session belongs to user
  const session = db.prepare(`
    SELECT ps.* FROM plan_sessions ps
    JOIN training_plans tp ON tp.id = ps.plan_id
    WHERE ps.id = ? AND tp.user_id = ?
  `).get(session_id, req.session.userId);

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const result = db.prepare(
    'INSERT INTO workouts (user_id, session_id) VALUES (?, ?)'
  ).run(req.session.userId, session_id);

  const workout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(workout);
});

// POST /api/workouts/:id/sets
router.post('/workouts/:id/sets', requireAuth, (req, res) => {
  const db = getDb();
  const workout = db.prepare(
    'SELECT * FROM workouts WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);

  if (!workout) return res.status(404).json({ error: 'Workout not found' });
  if (workout.ended_at) return res.status(400).json({ error: 'Workout already ended' });

  const { session_exercise_id, set_number, weight, reps, rating, note, is_bodyweight } = req.body;
  if (!session_exercise_id || set_number === undefined || weight === undefined || reps === undefined) {
    return res.status(400).json({ error: 'session_exercise_id, set_number, weight, and reps are required' });
  }

  const isBodyweight = Number(is_bodyweight) === 1 ? 1 : 0;

  // Snapshot exercise identity at the moment of logging so plan changes never
  // corrupt historical data or progress charts.
  const exSnap = db.prepare(`
    SELECT e.id as exercise_id, e.name as exercise_name
    FROM session_exercises se
    JOIN exercises e ON e.id = se.exercise_id
    WHERE se.id = ?
  `).get(session_exercise_id);

  const result = db.prepare(`
    INSERT INTO workout_sets
      (workout_id, session_exercise_id, set_number, weight, reps, is_bodyweight, rating, note, exercise_name, exercise_id_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    workout.id, session_exercise_id, set_number, weight, reps, isBodyweight,
    rating || null, note || null,
    exSnap?.exercise_name || null,
    exSnap?.exercise_id || null
  );

  const set = db.prepare('SELECT * FROM workout_sets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(set);
});

// PUT /api/workouts/:id/end
router.put('/workouts/:id/end', requireAuth, (req, res) => {
  const db = getDb();
  const workout = db.prepare(
    'SELECT * FROM workouts WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);

  if (!workout) return res.status(404).json({ error: 'Workout not found' });

  db.prepare(
    "UPDATE workouts SET ended_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(workout.id);

  const updated = db.prepare('SELECT * FROM workouts WHERE id = ?').get(workout.id);
  res.json(updated);
});

// DELETE /api/workouts/:id
router.delete('/workouts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const workout = db.prepare(
    'SELECT * FROM workouts WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);

  if (!workout) return res.status(404).json({ error: 'Workout not found' });

  db.prepare('DELETE FROM workouts WHERE id = ?').run(workout.id);
  res.json({ success: true });
});

// GET /api/workouts
router.get('/workouts', requireAuth, (req, res) => {
  const db = getDb();
  const workouts = db.prepare(`
    SELECT w.*, ps.session_label, tp.name as plan_name,
           COUNT(ws.id) as total_sets
    FROM workouts w
    JOIN plan_sessions ps ON ps.id = w.session_id
    JOIN training_plans tp ON tp.id = ps.plan_id
    LEFT JOIN workout_sets ws ON ws.workout_id = w.id
    WHERE w.user_id = ?
    GROUP BY w.id
    HAVING COUNT(ws.id) > 0
    ORDER BY w.started_at DESC
  `).all(req.session.userId);
  res.json(workouts);
});

// GET /api/workouts/:id
router.get('/workouts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const workout = db.prepare(`
    SELECT w.*, ps.session_label, tp.name as plan_name
    FROM workouts w
    JOIN plan_sessions ps ON ps.id = w.session_id
    JOIN training_plans tp ON tp.id = ps.plan_id
    WHERE w.id = ? AND w.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!workout) return res.status(404).json({ error: 'Workout not found' });

  const sets = db.prepare(`
    SELECT ws.*,
           COALESCE(ws.exercise_name, e.name) as exercise_name,
           se.sets as target_sets, se.reps_min, se.reps_max, se.order_index
    FROM workout_sets ws
    JOIN session_exercises se ON se.id = ws.session_exercise_id
    JOIN exercises e ON e.id = se.exercise_id
    WHERE ws.workout_id = ?
    ORDER BY se.order_index, ws.set_number
  `).all(workout.id);

  res.json({ ...workout, sets });
});

// GET /api/progress/:exercise_id
router.get('/progress/:exercise_id', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      DATE(w.started_at) as date,
      w.id as workout_id,
      w.started_at,
      ws.set_number,
      ws.weight,
      ws.reps,
      ws.is_bodyweight
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN session_exercises se ON se.id = ws.session_exercise_id
    WHERE w.user_id = ?
      AND COALESCE(ws.exercise_id_snapshot, se.exercise_id) = ?
      AND w.ended_at IS NOT NULL
      AND (ws.skipped IS NULL OR ws.skipped = 0)
    ORDER BY w.started_at ASC, ws.set_number ASC
  `).all(req.session.userId, req.params.exercise_id);

  const progress = [];
  let current = null;
  for (const row of rows) {
    if (!current || current.workout_id !== row.workout_id) {
      current = {
        date: row.date,
        workout_id: row.workout_id,
        started_at: row.started_at,
        max_weight: 0,
        total_volume: 0,
        est_1rm: 0,
        sets: [],
      };
      progress.push(current);
    }

    current.max_weight = Math.max(current.max_weight, row.weight);
    current.total_volume += row.weight * row.reps;
    current.est_1rm = Math.max(
      current.est_1rm,
      row.reps <= 1 ? row.weight : row.weight * (1.0 + row.reps / 30.0)
    );
    current.sets.push({
      set_number: row.set_number,
      weight: row.weight,
      reps: row.reps,
      is_bodyweight: row.is_bodyweight,
    });
  }

  res.json(progress);
});

// GET /api/recommendations/:session_exercise_id
router.get('/recommendations/:session_exercise_id', requireAuth, (req, res) => {
  const db = getDb();

  // Verify user owns this session exercise
  const se = db.prepare(`
    SELECT se.* FROM session_exercises se
    JOIN plan_sessions ps ON ps.id = se.session_id
    JOIN training_plans tp ON tp.id = ps.plan_id
    WHERE se.id = ? AND tp.user_id = ?
  `).get(req.params.session_exercise_id, req.session.userId);

  if (!se) return res.status(404).json({ error: 'Session exercise not found' });

  // Most recent completed workout for this session_exercise slot where the
  // exercise matches the current exercise (guards against stale data from a
  // swapped exercise — old sets for exercise D must not influence exercise K).
  const lastWorkout = db.prepare(`
    SELECT w.id
    FROM workouts w
    JOIN workout_sets ws ON ws.workout_id = w.id
    WHERE ws.session_exercise_id = ?
      AND w.user_id = ?
      AND w.ended_at IS NOT NULL
      AND COALESCE(ws.exercise_id_snapshot, ?) = ?
    ORDER BY w.started_at DESC
    LIMIT 1
  `).get(req.params.session_exercise_id, req.session.userId, se.exercise_id, se.exercise_id);

  if (!lastWorkout) {
    return res.json({ recommended_weight: 0, last_sets: [] });
  }

  const lastSets = db.prepare(`
    SELECT weight, reps, set_number, rating
    FROM workout_sets
    WHERE workout_id = ? AND session_exercise_id = ? AND (skipped IS NULL OR skipped = 0)
    ORDER BY set_number ASC
  `).all(lastWorkout.id, req.params.session_exercise_id);

  if (lastSets.length === 0) {
    return res.json({ recommended_weight: 0, last_sets: [] });
  }

  const maxWeight = Math.max(...lastSets.map(s => s.weight));
  const avgWeight = lastSets.reduce((sum, s) => sum + s.weight, 0) / lastSets.length;

  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.session.userId);
  const autoProgress = settings ? settings.auto_progress === 1 : true;

  const exercise = db.prepare('SELECT increment_kg FROM exercises WHERE id = ?').get(se.exercise_id);
  const increment = (exercise && exercise.increment_kg) || 2.5;

  let recommended = maxWeight;
  let reason = 'last';

  if (autoProgress) {
    const ratings = lastSets.map(s => s.rating).filter(r => r !== null && r !== undefined);
    const anyTooHard = ratings.includes(1);
    const allTooHard = ratings.length > 0 && ratings.every(r => r === 1);
    const allSetsDone = lastSets.length >= se.sets;
    const allRepsMax = lastSets.every(s => s.reps >= se.reps_max);

    if (allTooHard) {
      // Every rated set was too hard: back off one increment
      recommended = Math.max(0, maxWeight - increment);
      reason = 'decrease';
    } else if (anyTooHard) {
      reason = 'hold_hard';
    } else if (allSetsDone && allRepsMax) {
      recommended = maxWeight + increment;
      reason = 'increase';
    } else {
      reason = 'hold';
    }
  }

  res.json({
    recommended_weight: recommended,
    last_weight: maxWeight,
    avg_weight: Math.round(avgWeight * 2) / 2, // round to nearest 0.5
    increment,
    reason,
    auto_progress: autoProgress,
    last_sets: lastSets
  });
});

// PUT /api/workout-sets/:id
router.put('/workout-sets/:id', requireAuth, (req, res) => {
  const db = getDb();
  const set = db.prepare(`
    SELECT ws.* FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.id = ? AND w.user_id = ?
  `).get(req.params.id, req.session.userId);
  if (!set) return res.status(404).json({ error: 'Set not found' });

  const { rating, note } = req.body;
  db.prepare('UPDATE workout_sets SET rating=?, note=? WHERE id=?')
    .run(rating ?? set.rating, note ?? set.note, set.id);

  const updated = db.prepare('SELECT * FROM workout_sets WHERE id=?').get(set.id);
  res.json(updated);
});

module.exports = router;
