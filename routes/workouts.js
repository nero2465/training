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

  const { session_exercise_id, set_number, weight, reps, rating, note } = req.body;
  if (!session_exercise_id || set_number === undefined || weight === undefined || reps === undefined) {
    return res.status(400).json({ error: 'session_exercise_id, set_number, weight, and reps are required' });
  }

  const result = db.prepare(`
    INSERT INTO workout_sets (workout_id, session_exercise_id, set_number, weight, reps, rating, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(workout.id, session_exercise_id, set_number, weight, reps, rating || null, note || null);

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
    SELECT ws.*, e.name as exercise_name, se.sets as target_sets,
           se.reps_min, se.reps_max, se.order_index
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
  const progress = db.prepare(`
    SELECT
      DATE(w.started_at) as date,
      w.id as workout_id,
      MAX(ws.weight) as max_weight,
      SUM(ws.weight * ws.reps) as total_volume
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN session_exercises se ON se.id = ws.session_exercise_id
    WHERE w.user_id = ? AND se.exercise_id = ? AND w.ended_at IS NOT NULL
    GROUP BY DATE(w.started_at), w.id
    ORDER BY w.started_at ASC
  `).all(req.session.userId, req.params.exercise_id);

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

  // Get the most recent completed workout sets for this exercise
  const lastSets = db.prepare(`
    SELECT ws.weight, ws.reps, ws.set_number
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.session_exercise_id = ? AND w.user_id = ? AND w.ended_at IS NOT NULL
    ORDER BY w.started_at DESC, ws.set_number ASC
    LIMIT 10
  `).all(req.params.session_exercise_id, req.session.userId);

  if (lastSets.length === 0) {
    return res.json({ recommended_weight: 0, last_sets: [] });
  }

  // Use the weight from the most recent workout (first set of last session)
  const lastWorkoutSets = [];
  const seenSets = new Set();
  for (const s of lastSets) {
    if (!seenSets.has(s.set_number)) {
      seenSets.add(s.set_number);
      lastWorkoutSets.push(s);
    }
  }

  const maxWeight = Math.max(...lastWorkoutSets.map(s => s.weight));
  const avgWeight = lastWorkoutSets.reduce((sum, s) => sum + s.weight, 0) / lastWorkoutSets.length;

  res.json({
    recommended_weight: maxWeight,
    avg_weight: Math.round(avgWeight * 2) / 2, // round to nearest 0.5
    last_sets: lastWorkoutSets
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
