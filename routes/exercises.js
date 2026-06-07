const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// GET /api/exercises
router.get('/exercises', requireAuth, (req, res) => {
  const db = getDb();
  const exercises = db.prepare('SELECT * FROM exercises ORDER BY name').all();
  res.json(exercises);
});

// GET /api/exercises/:id
router.get('/exercises/:id', requireAuth, (req, res) => {
  const db = getDb();
  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
  res.json(exercise);
});

module.exports = router;
