const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function getOrCreateSettings(db, userId) {
  let settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  if (!settings) {
    db.prepare('INSERT INTO user_settings (user_id, auto_progress) VALUES (?, 1)').run(userId);
    settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  }
  return settings;
}

// GET /api/settings
router.get('/settings', requireAuth, (req, res) => {
  const db = getDb();
  const settings = getOrCreateSettings(db, req.session.userId);
  res.json(settings);
});

// PUT /api/settings
router.put('/settings', requireAuth, (req, res) => {
  const db = getDb();
  const settings = getOrCreateSettings(db, req.session.userId);

  const { auto_progress, deload_enabled, deload_interval_weeks, deload_percent, plate_inventory } = req.body;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, parseInt(v)));

  // plate_inventory arrives as an object; store as JSON text after sanity check
  let plateJson = settings.plate_inventory ?? null;
  if (plate_inventory !== undefined) {
    if (plate_inventory === null) {
      plateJson = null;
    } else if (typeof plate_inventory === 'object' && typeof plate_inventory.bar === 'number' && typeof plate_inventory.plates === 'object') {
      plateJson = JSON.stringify(plate_inventory);
    } else {
      return res.status(400).json({ error: 'Ungültiges Scheiben-Inventar' });
    }
  }

  db.prepare(`
    UPDATE user_settings
    SET auto_progress = ?, deload_enabled = ?, deload_interval_weeks = ?, deload_percent = ?, plate_inventory = ?
    WHERE user_id = ?
  `).run(
    auto_progress !== undefined ? (auto_progress ? 1 : 0) : settings.auto_progress,
    deload_enabled !== undefined ? (deload_enabled ? 1 : 0) : (settings.deload_enabled ?? 1),
    deload_interval_weeks !== undefined ? clamp(deload_interval_weeks, 3, 12) : (settings.deload_interval_weeks ?? 6),
    deload_percent !== undefined ? clamp(deload_percent, 40, 80) : (settings.deload_percent ?? 55),
    plateJson,
    req.session.userId
  );

  const updated = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.session.userId);
  res.json(updated);
});

module.exports = router;
