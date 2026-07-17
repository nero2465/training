const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// GET /api/cardio — all sessions, newest first
router.get('/cardio', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM cardio_sessions WHERE user_id = ? ORDER BY performed_at DESC
  `).all(req.session.userId);
  res.json(rows);
});

// POST /api/cardio { activity, duration_min, distance_km?, note? }
router.post('/cardio', requireAuth, (req, res) => {
  const { activity, duration_min, distance_km, note } = req.body;

  if (!activity || !String(activity).trim()) {
    return res.status(400).json({ error: 'Aktivität erforderlich' });
  }
  const dur = parseFloat(duration_min);
  if (isNaN(dur) || dur <= 0 || dur > 600) {
    return res.status(400).json({ error: 'Ungültige Dauer' });
  }
  let dist = null;
  if (distance_km !== undefined && distance_km !== null && distance_km !== '') {
    dist = parseFloat(distance_km);
    if (isNaN(dist) || dist <= 0 || dist > 500) {
      return res.status(400).json({ error: 'Ungültige Distanz' });
    }
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO cardio_sessions (user_id, activity, duration_min, distance_km, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.session.userId, String(activity).trim(), dur, dist, note ? String(note).trim() : null);

  const row = db.prepare('SELECT * FROM cardio_sessions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// DELETE /api/cardio/:id
router.delete('/cardio/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM cardio_sessions WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

  db.prepare('DELETE FROM cardio_sessions WHERE id = ?').run(row.id);
  res.json({ success: true });
});

module.exports = router;
