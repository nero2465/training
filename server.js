const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const tls = require('tls');
const { initializeDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'training.db');
// Persistent data dir (/data on the NAS): sessions, secret and certificates
// live here so a container rebuild keeps them.
const DATA_DIR = path.dirname(DB_PATH);
const SSL_DIR = process.env.SSL_DIR || path.join(DATA_DIR, 'ssl');

// Session secret: a real one from the environment, otherwise a random one
// generated once and kept in the data dir. The compose placeholder counts as
// "not set" — a known secret would let anyone forge session cookies.
function sessionSecret() {
  const env = process.env.SESSION_SECRET;
  const placeholders = ['change-this-to-a-long-random-secret', 'workout-tracker-secret-2024'];
  if (env && env.length >= 16 && !placeholders.includes(env)) return env;
  const file = path.join(DATA_DIR, 'session-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (e) { /* not there yet */ }
  const fresh = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(file, fresh, { mode: 0o600 });
  } catch (e) {
    console.warn('Session-Secret konnte nicht gespeichert werden:', e.message);
  }
  return fresh;
}

// Initialize database
initializeDatabase(DB_PATH);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Behind a reverse proxy req.secure follows X-Forwarded-Proto
app.set('trust proxy', 1);

// Session configuration
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    // In the data dir, not /app/db: survives container rebuilds, so a deploy
    // no longer logs everyone out.
    dir: DATA_DIR
  }),
  secret: sessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    // 'auto': Secure flag over HTTPS (never sent in clear text from there),
    // plain cookie over HTTP so LAN access via http://<nas-ip>:3001 keeps working
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Health check endpoint (no auth) — used by the Docker HEALTHCHECK.
// Must never require a session, otherwise the container shows "unhealthy".
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: 'workout-tracker' });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/plans'));
app.use('/api', require('./routes/workouts'));
app.use('/api', require('./routes/exercises'));
app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/deload').router);
app.use('/api', require('./routes/orm'));
app.use('/api', require('./routes/stats'));
app.use('/api', require('./routes/body'));
app.use('/api', require('./routes/special'));
app.use('/api', require('./routes/cardio'));

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Workout Tracker running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});

// ── Optional HTTPS ─────────────────────────────────────────
// As soon as fullchain.pem + privkey.pem appear in SSL_DIR (e.g. copied
// there by Home Assistant's Let's Encrypt add-on), an HTTPS listener starts
// on HTTPS_PORT. Renewed files are picked up without a restart. Missing or
// broken files: HTTP keeps working, HTTPS stays off / keeps the old cert.
const CERT_FILE = path.join(SSL_DIR, 'fullchain.pem');
const KEY_FILE = path.join(SSL_DIR, 'privkey.pem');
let httpsServer = null;
let certStamp = '';

function readCertPair() {
  try {
    const cert = fs.readFileSync(CERT_FILE);
    const key = fs.readFileSync(KEY_FILE);
    tls.createSecureContext({ cert, key }); // throws on a broken or mismatched pair
    return { cert, key };
  } catch (e) {
    return { error: e };
  }
}

function fileStamp() {
  try {
    return [CERT_FILE, KEY_FILE].map(f => {
      const st = fs.statSync(f);
      return `${st.size}:${st.mtimeMs}`;
    }).join('|');
  } catch (e) {
    return '';
  }
}

function syncHttps() {
  const stamp = fileStamp();
  if (!stamp || stamp === certStamp) return;
  const pair = readCertPair();
  if (pair.error) {
    // Half-copied files or a mismatch: try again on the next check
    console.warn(`HTTPS: Zertifikat in ${SSL_DIR} nicht nutzbar (${pair.error.message})`);
    return;
  }
  certStamp = stamp;
  if (!httpsServer) {
    httpsServer = https.createServer({ cert: pair.cert, key: pair.key }, app);
    httpsServer.on('error', e => console.warn('HTTPS-Fehler:', e.message));
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`HTTPS aktiv auf Port ${HTTPS_PORT} (Zertifikat aus ${SSL_DIR})`);
    });
  } else {
    httpsServer.setSecureContext({ cert: pair.cert, key: pair.key });
    console.log('HTTPS: erneuertes Zertifikat geladen');
  }
}

syncHttps();
// Polling instead of fs.watch: reliable on NAS bind mounts and SMB shares
setInterval(syncHttps, 60 * 1000).unref();
