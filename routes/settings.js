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

  const { auto_progress } = req.body;
  db.prepare('UPDATE user_settings SET auto_progress = ? WHERE user_id = ?').run(
    auto_progress !== undefined ? (auto_progress ? 1 : 0) : settings.auto_progress,
    req.session.userId
  );

  const updated = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.session.userId);
  res.json(updated);
});

module.exports = router;
