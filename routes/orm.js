const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// POST /api/orm-tests — save a tested 1RM
router.post('/orm-tests', requireAuth, (req, res) => {
  const { exercise_id, weight } = req.body;
  if (!exercise_id || !weight || weight <= 0) {
    return res.status(400).json({ error: 'exercise_id und weight erforderlich' });
  }

  const db = getDb();
  const exercise = db.prepare('SELECT id FROM exercises WHERE id = ?').get(exercise_id);
  if (!exercise) return res.status(404).json({ error: 'Übung nicht gefunden' });

  const result = db.prepare(
    'INSERT INTO orm_tests (user_id, exercise_id, weight) VALUES (?, ?, ?)'
  ).run(req.session.userId, exercise_id, weight);

  const test = db.prepare('SELECT * FROM orm_tests WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(test);
});

// GET /api/orm-tests/:exercise_id — history for one exercise (newest first)
router.get('/orm-tests/:exercise_id', requireAuth, (req, res) => {
  const db = getDb();
  const tests = db.prepare(`
    SELECT * FROM orm_tests
    WHERE user_id = ? AND exercise_id = ?
    ORDER BY tested_at DESC
  `).all(req.session.userId, req.params.exercise_id);
  res.json(tests);
});

module.exports = router;
