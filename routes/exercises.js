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

// GET /api/exercises
// ?category=crossfit  -> CrossFit exercises only
// ?all=true           -> all non-CrossFit exercises
// default             -> active non-CrossFit exercises
router.get('/exercises', requireAuth, (req, res) => {
  const db = getDb();
  const all = req.query.all === 'true';
  const category = req.query.category;
  let exercises;
  if (category === 'crossfit') {
    exercises = db.prepare("SELECT * FROM exercises WHERE category = 'crossfit' ORDER BY name").all();
  } else if (all) {
    exercises = db.prepare("SELECT * FROM exercises WHERE category IS NULL OR category != 'crossfit' ORDER BY name").all();
  } else {
    exercises = db.prepare("SELECT * FROM exercises WHERE (category IS NULL OR category != 'crossfit') AND (active IS NULL OR active = 1) ORDER BY name").all();
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
  const { name, muscle_groups, technique_tip, category, emom_focus, emom_base_reps, emom_reps_unit } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO exercises (name, muscle_groups, technique_tip, category, emom_focus, emom_base_reps, emom_reps_unit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    muscle_groups || null,
    technique_tip || null,
    category || null,
    emom_focus || null,
    emom_base_reps ? parseInt(emom_base_reps, 10) : null,
    emom_reps_unit || null
  );

  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(exercise);
});

// PUT /api/exercises/:id
router.put('/exercises/:id', requireAuth, (req, res) => {
  const db = getDb();
  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

  const {
    name,
    muscle_groups,
    technique_tip,
    active,
    gif_path,
    increment_kg,
    emom_focus,
    emom_base_reps,
    emom_reps_unit,
    bw_factor,
    equip_type,
  } = req.body;

  const validEquip = ['langhantel', 'sz', 'kurzhantel', 'maschine', 'bodyweight'];

  db.prepare(`
    UPDATE exercises
    SET name = ?, muscle_groups = ?, technique_tip = ?, active = ?, gif_path = ?, increment_kg = ?,
        emom_focus = ?, emom_base_reps = ?, emom_reps_unit = ?, bw_factor = ?, equip_type = ?
    WHERE id = ?
  `).run(
    name !== undefined ? name.trim() : exercise.name,
    muscle_groups !== undefined ? muscle_groups : exercise.muscle_groups,
    technique_tip !== undefined ? technique_tip : exercise.technique_tip,
    active !== undefined ? (active ? 1 : 0) : (exercise.active !== null ? exercise.active : 1),
    gif_path !== undefined ? (gif_path || null) : exercise.gif_path,
    increment_kg !== undefined ? (increment_kg > 0 ? increment_kg : null) : exercise.increment_kg,
    emom_focus !== undefined ? (emom_focus || null) : exercise.emom_focus,
    emom_base_reps !== undefined ? (emom_base_reps ? parseInt(emom_base_reps, 10) : null) : exercise.emom_base_reps,
    emom_reps_unit !== undefined ? (emom_reps_unit || null) : exercise.emom_reps_unit,
    bw_factor !== undefined ? (bw_factor > 0 && bw_factor <= 1.5 ? bw_factor : null) : exercise.bw_factor,
    equip_type !== undefined ? (validEquip.includes(equip_type) ? equip_type : null) : exercise.equip_type,
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
