const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// GET /api/body-metrics — full history, oldest first (for the chart)
router.get('/body-metrics', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM body_metrics WHERE user_id = ? ORDER BY measured_at ASC
  `).all(req.session.userId);
  res.json(rows);
});

// POST /api/body-metrics — log a new measurement (weight and/or girths)
router.post('/body-metrics', requireAuth, (req, res) => {
  const { weight, waist, arm, chest } = req.body;

  const num = v => {
    if (v === undefined || v === null || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) || n <= 0 ? NaN : n;
  };
  const w = num(weight), wa = num(waist), a = num(arm), c = num(chest);
  if ([w, wa, a, c].some(v => Number.isNaN(v))) {
    return res.status(400).json({ error: 'Ungültige Werte' });
  }
  if (w === null && wa === null && a === null && c === null) {
    return res.status(400).json({ error: 'Mindestens ein Wert erforderlich' });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO body_metrics (user_id, weight, waist, arm, chest) VALUES (?, ?, ?, ?, ?)'
  ).run(req.session.userId, w, wa, a, c);

  const row = db.prepare('SELECT * FROM body_metrics WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// DELETE /api/body-metrics/:id
router.delete('/body-metrics/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM body_metrics WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

  db.prepare('DELETE FROM body_metrics WHERE id = ?').run(row.id);
  res.json({ success: true });
});

module.exports = router;
