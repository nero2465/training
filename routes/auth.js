const express = require('express');
const bcrypt = require('bcrypt');
const { getDb } = require('../db/database');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;

  res.json({
    success: true,
    user: { id: user.id, username: user.username }
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({
    user: { id: req.session.userId, username: req.session.username }
  });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());

  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)'
  ).run(username.trim(), passwordHash);

  req.session.userId = result.lastInsertRowid;
  req.session.username = username.trim();

  res.status(201).json({
    success: true,
    user: { id: result.lastInsertRowid, username: username.trim() }
  });
});

module.exports = router;
