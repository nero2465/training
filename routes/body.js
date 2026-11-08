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
    SELECT * FROM body_metrics WHERE user_id = ? ORDER BY measured_at ASC, id ASC
  `).all(req.session.userId);
  res.json(rows);
});

const FIELDS = ['weight', 'waist', 'arm', 'chest', 'neck', 'hip'];

// '' / null -> null, number > 0 -> number, anything else -> NaN (invalid)
function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) || n <= 0 ? NaN : n;
}

// Optional measurement day "YYYY-MM-DD" (backdating). Stored at 12:00 so the
// day never shifts across time zones. Returns undefined when not given,
// false when invalid.
function measuredAt(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return false;
  const d = new Date(v + 'T12:00:00Z');
  if (isNaN(d)) return false;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (v < '2000-01-01' || v > tomorrow) return false;
  return `${v} 12:00:00`;
}

// POST /api/body-metrics — log a measurement (weight and/or girths),
// optionally for an earlier day
router.post('/body-metrics', requireAuth, (req, res) => {
  const vals = FIELDS.map(f => num(req.body[f]));
  if (vals.some(v => Number.isNaN(v))) return res.status(400).json({ error: 'Ungültige Werte' });
  if (vals.every(v => v === null)) return res.status(400).json({ error: 'Mindestens ein Wert erforderlich' });
  const at = measuredAt(req.body.date);
  if (at === false) return res.status(400).json({ error: 'Ungültiges Datum' });

  const db = getDb();
  const result = at
    ? db.prepare(`INSERT INTO body_metrics (user_id, ${FIELDS.join(', ')}, measured_at) VALUES (?, ${FIELDS.map(() => '?').join(', ')}, ?)`)
        .run(req.session.userId, ...vals, at)
    : db.prepare(`INSERT INTO body_metrics (user_id, ${FIELDS.join(', ')}) VALUES (?, ${FIELDS.map(() => '?').join(', ')})`)
        .run(req.session.userId, ...vals);

  const row = db.prepare('SELECT * FROM body_metrics WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// PUT /api/body-metrics/:id — correct values and/or the day of an entry.
// Fields left out stay as they are; '' clears a field.
router.put('/body-metrics/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM body_metrics WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

  const next = {};
  for (const f of FIELDS) {
    if (req.body[f] === undefined) { next[f] = row[f]; continue; }
    const v = num(req.body[f]);
    if (Number.isNaN(v)) return res.status(400).json({ error: 'Ungültige Werte' });
    next[f] = v;
  }
  if (FIELDS.every(f => next[f] === null)) {
    return res.status(400).json({ error: 'Mindestens ein Wert erforderlich' });
  }
  const at = measuredAt(req.body.date);
  if (at === false) return res.status(400).json({ error: 'Ungültiges Datum' });
  // Same day as before -> keep the original time of day
  const newAt = at && at.slice(0, 10) !== String(row.measured_at).slice(0, 10) ? at : row.measured_at;

  db.prepare(`UPDATE body_metrics SET ${FIELDS.map(f => f + ' = ?').join(', ')}, measured_at = ? WHERE id = ?`)
    .run(...FIELDS.map(f => next[f]), newAt, row.id);
  res.json(db.prepare('SELECT * FROM body_metrics WHERE id = ?').get(row.id));
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
