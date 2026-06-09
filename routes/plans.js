const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// GET /api/plans
router.get('/plans', requireAuth, (req, res) => {
  const db = getDb();
  const plans = db.prepare(
    'SELECT * FROM training_plans WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.session.userId);
  res.json(plans);
});

// POST /api/plans
router.post('/plans', requireAuth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Plan name required' });

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO training_plans (user_id, name, description) VALUES (?, ?, ?)'
  ).run(req.session.userId, name, description || null);

  const plan = db.prepare('SELECT * FROM training_plans WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(plan);
});

// PUT /api/plans/:id
router.put('/plans/:id', requireAuth, (req, res) => {
  const db = getDb();
  const plan = db.prepare(
    'SELECT * FROM training_plans WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);

  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const { name, description } = req.body;
  db.prepare(
    'UPDATE training_plans SET name = ?, description = ? WHERE id = ?'
  ).run(name || plan.name, description !== undefined ? description : plan.description, plan.id);

  const updated = db.prepare('SELECT * FROM training_plans WHERE id = ?').get(plan.id);
  res.json(updated);
});

// DELETE /api/plans/:id
router.delete('/plans/:id', requireAuth, (req, res) => {
  const db = getDb();
  const plan = db.prepare(
    'SELECT * FROM training_plans WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);

  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  db.prepare('DELETE FROM training_plans WHERE id = ?').run(plan.id);
  res.json({ success: true });
});

// GET /api/plans/:id/sessions
router.get('/plans/:id/sessions', requireAuth, (req, res) => {
  const db = getDb();
  const plan = db.prepare(
    'SELECT * FROM training_plans WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);

  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const sessions = db.prepare(`
    SELECT ps.*, MAX(w.started_at) as last_trained_at
    FROM plan_sessions ps
    LEFT JOIN workouts w ON w.session_id = ps.id AND w.ended_at IS NOT NULL AND w.user_id = ?
    WHERE ps.plan_id = ?
    GROUP BY ps.id
    ORDER BY ps.order_index, ps.session_label
  `).all(req.session.userId, plan.id);

  res.json(sessions);
});

// POST /api/plans/:id/sessions
router.post('/plans/:id/sessions', requireAuth, (req, res) => {
  const db = getDb();
  const plan = db.prepare(
    'SELECT * FROM training_plans WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);

  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const { session_label, order_index } = req.body;
  if (!session_label) return res.status(400).json({ error: 'Session label required' });

  const maxOrder = db.prepare(
    'SELECT MAX(order_index) as max FROM plan_sessions WHERE plan_id = ?'
  ).get(plan.id);

  const newOrder = order_index !== undefined ? order_index : (maxOrder.max !== null ? maxOrder.max + 1 : 0);

  const result = db.prepare(
    'INSERT INTO plan_sessions (plan_id, session_label, order_index) VALUES (?, ?, ?)'
  ).run(plan.id, session_label, newOrder);

  const session = db.prepare('SELECT * FROM plan_sessions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(session);
});

// PUT /api/sessions/:id
router.put('/sessions/:id', requireAuth, (req, res) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT ps.* FROM plan_sessions ps
    JOIN training_plans tp ON tp.id = ps.plan_id
    WHERE ps.id = ? AND tp.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { session_label, order_index } = req.body;
  db.prepare(
    'UPDATE plan_sessions SET session_label = ?, order_index = ? WHERE id = ?'
  ).run(
    session_label || session.session_label,
    order_index !== undefined ? order_index : session.order_index,
    session.id
  );

  const updated = db.prepare('SELECT * FROM plan_sessions WHERE id = ?').get(session.id);
  res.json(updated);
});

// DELETE /api/sessions/:id
router.delete('/sessions/:id', requireAuth, (req, res) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT ps.* FROM plan_sessions ps
    JOIN training_plans tp ON tp.id = ps.plan_id
    WHERE ps.id = ? AND tp.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!session) return res.status(404).json({ error: 'Session not found' });

  db.prepare('DELETE FROM plan_sessions WHERE id = ?').run(session.id);
  res.json({ success: true });
});

// GET /api/sessions/:id/exercises
router.get('/sessions/:id/exercises', requireAuth, (req, res) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT ps.* FROM plan_sessions ps
    JOIN training_plans tp ON tp.id = ps.plan_id
    WHERE ps.id = ? AND tp.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const exercises = db.prepare(`
    SELECT se.*, e.name, e.muscle_groups, e.technique_tip
    FROM session_exercises se
    JOIN exercises e ON e.id = se.exercise_id
    WHERE se.session_id = ?
    ORDER BY se.order_index
  `).all(session.id);

  res.json(exercises);
});

// POST /api/sessions/:id/exercises
router.post('/sessions/:id/exercises', requireAuth, (req, res) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT ps.* FROM plan_sessions ps
    JOIN training_plans tp ON tp.id = ps.plan_id
    WHERE ps.id = ? AND tp.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { exercise_id, sets, reps_min, reps_max, order_index } = req.body;
  if (!exercise_id) return res.status(400).json({ error: 'exercise_id required' });

  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(exercise_id);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

  const maxOrder = db.prepare(
    'SELECT MAX(order_index) as max FROM session_exercises WHERE session_id = ?'
  ).get(session.id);
  const newOrder = order_index !== undefined ? order_index : (maxOrder.max !== null ? maxOrder.max + 1 : 0);

  const result = db.prepare(`
    INSERT INTO session_exercises (session_id, exercise_id, sets, reps_min, reps_max, order_index)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(session.id, exercise_id, sets || 3, reps_min || 8, reps_max || 12, newOrder);

  const se = db.prepare(`
    SELECT se.*, e.name, e.muscle_groups, e.technique_tip
    FROM session_exercises se
    JOIN exercises e ON e.id = se.exercise_id
    WHERE se.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(se);
});

// PUT /api/session-exercises/:id
router.put('/session-exercises/:id', requireAuth, (req, res) => {
  const db = getDb();
  const se = db.prepare(`
    SELECT se.* FROM session_exercises se
    JOIN plan_sessions ps ON ps.id = se.session_id
    JOIN training_plans tp ON tp.id = ps.plan_id
    WHERE se.id = ? AND tp.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!se) return res.status(404).json({ error: 'Session exercise not found' });

  const { exercise_id, sets, reps_min, reps_max, order_index } = req.body;

  db.prepare(`
    UPDATE session_exercises
    SET exercise_id = ?, sets = ?, reps_min = ?, reps_max = ?, order_index = ?
    WHERE id = ?
  `).run(
    exercise_id !== undefined ? exercise_id : se.exercise_id,
    sets !== undefined ? sets : se.sets,
    reps_min !== undefined ? reps_min : se.reps_min,
    reps_max !== undefined ? reps_max : se.reps_max,
    order_index !== undefined ? order_index : se.order_index,
    se.id
  );

  const updated = db.prepare(`
    SELECT se.*, e.name, e.muscle_groups, e.technique_tip
    FROM session_exercises se
    JOIN exercises e ON e.id = se.exercise_id
    WHERE se.id = ?
  `).get(se.id);

  res.json(updated);
});

// DELETE /api/session-exercises/:id
router.delete('/session-exercises/:id', requireAuth, (req, res) => {
  const db = getDb();
  const se = db.prepare(`
    SELECT se.* FROM session_exercises se
    JOIN plan_sessions ps ON ps.id = se.session_id
    JOIN training_plans tp ON tp.id = ps.plan_id
    WHERE se.id = ? AND tp.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!se) return res.status(404).json({ error: 'Session exercise not found' });

  db.prepare('DELETE FROM session_exercises WHERE id = ?').run(se.id);
  res.json({ success: true });
});

module.exports = router;
