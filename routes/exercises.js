const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// GET /api/exercises - only active exercises (for exercise picker)
router.get('/exercises', requireAuth, (req, res) => {
  const db = getDb();
  const all = req.query.all === 'true';
  let exercises;
  if (all) {
    exercises = db.prepare('SELECT * FROM exercises ORDER BY name').all();
  } else {
    exercises = db.prepare('SELECT * FROM exercises WHERE active IS NULL OR active = 1 ORDER BY name').all();
  }
  res.json(exercises);
});

// GET /api/exercises/available-gifs - list GIFs from downloaded dataset
router.get('/exercises/available-gifs', requireAuth, (req, res) => {
  const mediaJsonPath = path.join(__dirname, '..', 'public', 'exercise-media.json');
  try {
    if (!fs.existsSync(mediaJsonPath)) return res.json([]);
    const raw = JSON.parse(fs.readFileSync(mediaJsonPath, 'utf8'));
    const items = Array.isArray(raw) ? raw : [];
    const result = items
      .map(ex => ({
        name: ex.name || '',
        gif_filename: (ex.gif_url || '').replace('videos/', '').replace(/^\//, '')
      }))
      .filter(e => e.gif_filename && e.name);
    res.json(result);
  } catch (e) {
    res.json([]);
  }
});

// GET /api/exercises/:id
router.get('/exercises/:id', requireAuth, (req, res) => {
  const db = getDb();
  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
  res.json(exercise);
});

// POST /api/exercises
router.post('/exercises', requireAuth, (req, res) => {
  const { name, muscle_groups, technique_tip } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO exercises (name, muscle_groups, technique_tip) VALUES (?, ?, ?)'
  ).run(name.trim(), muscle_groups || null, technique_tip || null);

  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(exercise);
});

// PUT /api/exercises/:id
router.put('/exercises/:id', requireAuth, (req, res) => {
  const db = getDb();
  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

  const { name, muscle_groups, technique_tip, active, gif_path, increment_kg } = req.body;

  db.prepare(`
    UPDATE exercises
    SET name = ?, muscle_groups = ?, technique_tip = ?, active = ?, gif_path = ?, increment_kg = ?
    WHERE id = ?
  `).run(
    name !== undefined ? name.trim() : exercise.name,
    muscle_groups !== undefined ? muscle_groups : exercise.muscle_groups,
    technique_tip !== undefined ? technique_tip : exercise.technique_tip,
    active !== undefined ? (active ? 1 : 0) : (exercise.active !== null ? exercise.active : 1),
    gif_path !== undefined ? (gif_path || null) : exercise.gif_path,
    increment_kg !== undefined ? (increment_kg > 0 ? increment_kg : null) : exercise.increment_kg,
    exercise.id
  );

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(exercise.id);
  res.json(updated);
});

// DELETE /api/exercises/:id
router.delete('/exercises/:id', requireAuth, (req, res) => {
  const db = getDb();
  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
  db.prepare('DELETE FROM exercises WHERE id = ?').run(exercise.id);
  res.json({ success: true });
});

module.exports = router;
