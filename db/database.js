const Database = require('better-sqlite3');
const path = require('path');

let db;

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      muscle_groups TEXT,
      technique_tip TEXT
    );

    CREATE TABLE IF NOT EXISTS training_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plan_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      session_label TEXT NOT NULL,
      order_index INTEGER DEFAULT 0,
      FOREIGN KEY (plan_id) REFERENCES training_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      sets INTEGER NOT NULL DEFAULT 3,
      reps_min INTEGER NOT NULL DEFAULT 8,
      reps_max INTEGER NOT NULL DEFAULT 12,
      order_index INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES plan_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES plan_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id INTEGER NOT NULL,
      session_exercise_id INTEGER NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
      FOREIGN KEY (session_exercise_id) REFERENCES session_exercises(id)
    );
  `);
}

function runMigrations() {
  const migrations = [
    'ALTER TABLE exercises ADD COLUMN category TEXT',
    'ALTER TABLE exercises ADD COLUMN secondary_muscles TEXT',
    'ALTER TABLE exercises ADD COLUMN equipment TEXT',
    'ALTER TABLE exercises ADD COLUMN frequency_note TEXT',
    'ALTER TABLE workout_sets ADD COLUMN rating INTEGER',
    'ALTER TABLE workout_sets ADD COLUMN note TEXT',
    'ALTER TABLE workout_sets ADD COLUMN skipped INTEGER DEFAULT 0',
    'ALTER TABLE exercises ADD COLUMN active INTEGER DEFAULT 1',
    'ALTER TABLE exercises ADD COLUMN gif_path TEXT',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch(e) { /* column already exists */ }
  }
  seedBuiltinExercises();
  deduplicateExercises();
}

// Adds genuinely new exercises from the catalog (no near-duplicates of seeded originals).
// Uses INSERT OR IGNORE so re-running on restart is always safe.
function seedBuiltinExercises() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO exercises (name, muscle_groups, technique_tip, category, secondary_muscles, equipment, frequency_note)
    VALUES (@name, @muscle_groups, @technique_tip, @category, @secondary_muscles, @equipment, @frequency_note)
  `);

  const catalog = [
    // Beine
    { name:'Front Squat mit Langhantel', muscle_groups:'Quadrizeps', technique_tip:'Ellbogen hoch, Oberkörper aufrecht, Hantel auf vorderer Schulter.', category:'Beine', secondary_muscles:'Gesäß, oberer Rücken, Bauch/Rumpf', equipment:'Langhantel, Rack', frequency_note:'1x/Woche, 48-72h' },
    { name:'Goblet Squat mit Kettlebell', muscle_groups:'Quadrizeps, Gesäß', technique_tip:'Kettlebell vor Brust, Brustkorb aufrecht, Knie nach außen.', category:'Beine', secondary_muscles:'Bauch/Rumpf, oberer Rücken', equipment:'Kettlebell', frequency_note:'1-3x/Woche, 24-48h' },
    { name:'Bulgarian Split Squat', muscle_groups:'Quadrizeps, Gesäß', technique_tip:'Hinterer Fuß auf Bank, vorderer Fuß stabil, langsam absenken.', category:'Beine', secondary_muscles:'Beinbeuger, Waden, Rumpfstabilität', equipment:'Bank, Kurzhanteln optional', frequency_note:'1-2x/Woche, 48-72h' },
    { name:'Zercher Squat', muscle_groups:'Quadrizeps, Gesäß', technique_tip:'Hantel in Armbeuge, Rumpf fest, aufrecht bleiben.', category:'Beine', secondary_muscles:'Bauch/Rumpf, oberer Rücken, Bizeps', equipment:'Langhantel, Rack', frequency_note:'1x/Woche, 48-72h' },
    // Hintere Kette
    { name:'Rumänisches Kreuzheben', muscle_groups:'Beinbeuger, Gesäß', technique_tip:'Knie leicht gebeugt, Hüfte weit nach hinten, Rücken neutral.', category:'Hintere Kette', secondary_muscles:'Rückenstrecker, Latissimus, Unterarme', equipment:'Langhantel oder Kurzhanteln', frequency_note:'1-2x/Woche, 48-72h' },
    { name:'Langhantel-Glute-Bridge am Boden', muscle_groups:'Gesäß', technique_tip:'Oberer Rücken am Boden, Füße fest, Becken hochdrücken.', category:'Hintere Kette', secondary_muscles:'Beinbeuger, Bauch/Rumpf', equipment:'Langhantel, Matte', frequency_note:'1-3x/Woche, 24-48h' },
    { name:'Kettlebell Deadlift', muscle_groups:'Gesäß, Beinbeuger, Rückenstrecker', technique_tip:'Kettlebell zwischen Füßen, Hüfte nach hinten, kraftvoll aufrichten.', category:'Hintere Kette', secondary_muscles:'Quadrizeps, Unterarme, Rumpf', equipment:'Kettlebell', frequency_note:'1-3x/Woche, 24-48h' },
    { name:'Good Morning mit Langhantel', muscle_groups:'Beinbeuger, Rückenstrecker, Gesäß', technique_tip:'Sehr leicht starten, Hüfte nach hinten, Rücken neutral.', category:'Hintere Kette', secondary_muscles:'Bauch/Rumpf, oberer Rücken', equipment:'Langhantel, Rack', frequency_note:'1x/Woche, 48-72h' },
    // Brust
    { name:'Kurzhantel-Bankdrücken', muscle_groups:'Brust', technique_tip:'Kurzhanteln kontrolliert absenken, Ellbogen unter Schulter.', category:'Brust', secondary_muscles:'Trizeps, vordere Schulter', equipment:'Hantelbank, Kurzhanteln', frequency_note:'1-2x/Woche, 48h' },
    { name:'Kurzhantel-Schrägbankdrücken', muscle_groups:'obere Brust', technique_tip:'Bank leicht schräg, Schulterblätter stabil.', category:'Brust', secondary_muscles:'vordere Schulter, Trizeps', equipment:'Schrägbank, Kurzhanteln', frequency_note:'1-2x/Woche, 48h' },
    { name:'Kurzhantel-Flys auf der Bank', muscle_groups:'Brust', technique_tip:'Leichte Beugung im Ellbogen, langsam öffnen.', category:'Brust', secondary_muscles:'vordere Schulter, Bizeps', equipment:'Hantelbank, leichte Kurzhanteln', frequency_note:'1x/Woche, 48h' },
    { name:'Liegestütz an der Bank', muscle_groups:'Brust', technique_tip:'Körper gerade, Brust zur Bank.', category:'Brust', secondary_muscles:'Trizeps, vordere Schulter, Bauch/Rumpf', equipment:'Hantelbank, Körpergewicht', frequency_note:'1-3x/Woche, 24-48h' },
    // Rücken
    { name:'Kurzhantel-Rudern beidarmig brustgestützt', muscle_groups:'mittlerer Rücken, Latissimus', technique_tip:'Brust auf Bank, Schultern zurückziehen.', category:'Rücken', secondary_muscles:'hintere Schulter, Bizeps', equipment:'Schrägbank, Kurzhanteln', frequency_note:'1-2x/Woche, 48h' },
    { name:'Pendlay Row', muscle_groups:'mittlerer Rücken, Latissimus', technique_tip:'Jede Wiederholung vom Boden, Rücken neutral, explosiv zur Brust.', category:'Rücken', secondary_muscles:'hintere Schulter, Bizeps, Rückenstrecker', equipment:'Langhantel', frequency_note:'1x/Woche, 48-72h' },
    { name:'Kurzhantel-Pullover auf der Bank', muscle_groups:'Latissimus, Brust', technique_tip:'Hantel hinter Kopf, Rippen unten halten.', category:'Rücken', secondary_muscles:'Trizeps langer Kopf, Rumpf', equipment:'Hantelbank, Kurzhantel', frequency_note:'1x/Woche, 48h' },
    { name:'Langhantel-Shrugs', muscle_groups:'Trapez/Nacken', technique_tip:'Schultern gerade nach oben, kurz halten, nicht kreisen.', category:'Rücken', secondary_muscles:'Unterarme, oberer Rücken', equipment:'Langhantel oder Kurzhanteln', frequency_note:'1-2x/Woche, 48h' },
    // Schultern
    { name:'Sitzendes Kurzhantel-Schulterdrücken', muscle_groups:'Schultern', technique_tip:'Rücken stabil, Kurzhanteln kontrolliert auf Schulterhöhe.', category:'Schultern', secondary_muscles:'Trizeps, oberer Rücken', equipment:'Hantelbank, Kurzhanteln', frequency_note:'1-2x/Woche, 48h' },
    { name:'Vorgebeugtes Seitheben', muscle_groups:'hintere Schulter', technique_tip:'Oberkörper vorgeneigt, seitlich anheben.', category:'Schultern', secondary_muscles:'mittlerer Rücken, Trapez', equipment:'leichte Kurzhanteln', frequency_note:'1-3x/Woche, 24-48h' },
    { name:'Frontheben mit Kurzhanteln', muscle_groups:'vordere Schulter', technique_tip:'Bis Schulterhöhe, Rumpf fest, kein Schwung.', category:'Schultern', secondary_muscles:'oberer Brustanteil, Trapez', equipment:'Kurzhanteln', frequency_note:'1x/Woche, 48h' },
    { name:'Aufrechtes Rudern mit SZ-Stange', muscle_groups:'seitliche Schulter, Trapez', technique_tip:'Griff nicht zu eng, Ellbogen bis Schulterhöhe.', category:'Schultern', secondary_muscles:'Bizeps, Unterarme', equipment:'SZ-Stange', frequency_note:'1x/Woche, 48h' },
    // Arme
    { name:'Kurzhantel-Curl stehend', muscle_groups:'Bizeps', technique_tip:'Schultern ruhig, Handgelenke stabil, kein Rückenschwung.', category:'Arme', secondary_muscles:'Unterarme, Brachialis', equipment:'Kurzhanteln', frequency_note:'1-2x/Woche, 48h' },
    { name:'Hammer Curl', muscle_groups:'Brachialis, Unterarme', technique_tip:'Neutralgriff, Ellbogen ruhig, kontrolliert.', category:'Arme', secondary_muscles:'Bizeps', equipment:'Kurzhanteln oder Kettlebells', frequency_note:'1-2x/Woche, 48h' },
    { name:'Konzentrationscurl sitzend', muscle_groups:'Bizeps', technique_tip:'Oberarm am Oberschenkel, langsam curlen.', category:'Arme', secondary_muscles:'Brachialis, Unterarme', equipment:'Kurzhantel, Bank', frequency_note:'1-2x/Woche, 48h' },
    { name:'Kurzhantel-Trizepsdrücken über Kopf', muscle_groups:'Trizeps langer Kopf', technique_tip:'Ellbogen nach oben, langsam hinter Kopf.', category:'Arme', secondary_muscles:'Schultern, Rumpf', equipment:'Kurzhantel, Bank', frequency_note:'1-2x/Woche, 48h' },
    { name:'Kurzhantel-Kickback brustgestützt', muscle_groups:'Trizeps', technique_tip:'Oberarm ruhig, Unterarm streckt nach hinten.', category:'Arme', secondary_muscles:'hintere Schulter', equipment:'Bank, Kurzhantel', frequency_note:'1-2x/Woche, 48h' },
    { name:'Bank-Dips mit gebeugten Beinen', muscle_groups:'Trizeps', technique_tip:'Schultern tief, Ellbogen nach hinten.', category:'Arme', secondary_muscles:'Brust, vordere Schulter', equipment:'Hantelbank', frequency_note:'1x/Woche, 48h' },
    // Waden
    { name:'Sitzendes Wadenheben mit Langhantel', muscle_groups:'Soleus/Waden', technique_tip:'Gewicht auf Oberschenkeln, Fersen langsam hoch und runter.', category:'Waden', secondary_muscles:'Fußstabilisatoren', equipment:'Bank, Langhantel', frequency_note:'2-3x/Woche, 24-48h' },
    // Unterarme
    { name:'Langhantel-Halten statisch', muscle_groups:'Unterarme/Griffkraft', technique_tip:'Hantel sicher, Schultern stabil, ruhig halten.', category:'Unterarme', secondary_muscles:'Trapez, Rumpf', equipment:'Langhantel', frequency_note:'1-2x/Woche, 48h' },
    { name:'Handgelenk-Curls mit Kurzhantel', muscle_groups:'Unterarmbeuger', technique_tip:'Unterarme ablegen, nur Handgelenk bewegen, langsam.', category:'Unterarme', secondary_muscles:'Griffkraft', equipment:'Kurzhantel, Bank', frequency_note:'1-2x/Woche, 48h' },
    { name:'Reverse Curl mit SZ-Stange', muscle_groups:'Unterarme, Brachialis', technique_tip:'Obergriff, Ellbogen ruhig, kein Schwung.', category:'Unterarme', secondary_muscles:'Bizeps', equipment:'SZ-Stange', frequency_note:'1-2x/Woche, 48h' },
    // Rumpf
    { name:'Dead Bug', muscle_groups:'Bauch/Rumpfstabilität', technique_tip:'Lendenwirbel Richtung Boden, Arm/Bein langsam bewegen.', category:'Rumpf', secondary_muscles:'Hüftbeuger, tiefe Rumpfmuskulatur', equipment:'Körpergewicht, Matte', frequency_note:'2-4x/Woche, 24h' },
    { name:'Bird Dog', muscle_groups:'Rumpfstabilität, Rückenstrecker', technique_tip:'Vierfüßlerstand, gegenüber Arm/Bein strecken, Becken ruhig.', category:'Rumpf', secondary_muscles:'Gesäß, Schulterstabilisatoren', equipment:'Körpergewicht, Matte', frequency_note:'2-4x/Woche, 24h' },
    { name:'Reverse Crunch', muscle_groups:'Bauch', technique_tip:'Becken einrollen, kein Schwung, langsam absenken.', category:'Rumpf', secondary_muscles:'Hüftbeuger', equipment:'Bank oder Boden', frequency_note:'1-3x/Woche, 24-48h' },
  ];

  const run = db.transaction(() => {
    for (const ex of catalog) insert.run(ex);
  });
  run();
}

// Resolves near-duplicates: keeps the original (plan-safe), deletes the catalog version,
// migrates any stray plan references, and enriches the original with catalog metadata.
// Safe to run repeatedly — if a duplicate is already gone, it skips silently.
function deduplicateExercises() {
  const getEx       = db.prepare('SELECT id FROM exercises WHERE name=?');
  const migrateRefs = db.prepare('UPDATE session_exercises SET exercise_id=? WHERE exercise_id=?');
  const deleteEx    = db.prepare('DELETE FROM exercises WHERE id=?');
  const enrichEx    = db.prepare(`
    UPDATE exercises
    SET category=?, secondary_muscles=?, equipment=?, frequency_note=?
    WHERE id=? AND category IS NULL
  `);

  // Each entry: keep the original name (used in plans), drop the catalog near-duplicate.
  const pairs = [
    { keep:'Kniebeuge',                   drop:'Langhantel-Kniebeuge',                    category:'Beine',         secondary_muscles:'Beinbeuger, Rückenstrecker, Bauch/Rumpf',  equipment:'Langhantel, Rack',              frequency_note:'1-2x/Woche, 48-72h' },
    { keep:'Bankdrücken',                 drop:'Langhantel-Bankdrücken',                  category:'Brust',         secondary_muscles:'Trizeps, vordere Schulter, oberer Rücken', equipment:'Hantelbank, Langhantel',         frequency_note:'1-2x/Woche, 48-72h' },
    { keep:'Langhantelrudern',            drop:'Langhantelrudern vorgebeugt',             category:'Rücken',        secondary_muscles:'hintere Schulter, Bizeps, Rückenstrecker', equipment:'Langhantel',                    frequency_note:'1-2x/Woche, 48-72h' },
    { keep:'Leg Curl',                    drop:'Leg Curl am Bank-Anbau',                 category:'Hintere Kette', secondary_muscles:'Waden',                                   equipment:'Hantelbank mit Leg-Curl-Anbau', frequency_note:'1-2x/Woche, 48h'    },
    { keep:'SZ-Curls',                    drop:'SZ-Curl',                                category:'Arme',          secondary_muscles:'Brachialis, Unterarme',                    equipment:'SZ-Stange',                     frequency_note:'1-2x/Woche, 48h'    },
    { keep:'Wadenheben',                  drop:'Stehendes Wadenheben mit Langhantel',     category:'Waden',         secondary_muscles:'Fußstabilisatoren',                        equipment:'Langhantel, Rack',              frequency_note:'2-3x/Woche, 24-48h' },
    { keep:'Schulterdrücken',             drop:'Schulterdrücken stehend mit Langhantel',  category:'Schultern',     secondary_muscles:'Trizeps, oberer Rücken, Bauch/Rumpf',     equipment:'Langhantel, Rack',              frequency_note:'1-2x/Woche, 48-72h' },
    { keep:'Hip Thrust / Glute Bridge',   drop:'Langhantel-Hip-Thrust',                  category:'Hintere Kette', secondary_muscles:'Beinbeuger, Quadrizeps, Bauch/Rumpf',     equipment:'Langhantel, Bank',              frequency_note:'1-2x/Woche, 48h'    },
    { keep:'Einarmiges Kurzhantelrudern', drop:'Einarmiges Kurzhantelrudern auf der Bank',category:'Rücken',        secondary_muscles:'hintere Schulter, Bizeps',                 equipment:'Hantelbank, Kurzhantel',        frequency_note:'1-2x/Woche, 48h'    },
    { keep:'SZ-French Press',             drop:'SZ-French-Press liegend',                category:'Arme',          secondary_muscles:'vordere Schulter, Brust',                  equipment:'SZ-Stange, Hantelbank',         frequency_note:'1-2x/Woche, 48h'    },
    { keep:'Seitheben',                   drop:'Seitheben mit Kurzhanteln',               category:'Schultern',     secondary_muscles:'Trapez',                                   equipment:'leichte Kurzhanteln',           frequency_note:'1-3x/Woche, 24-48h' },
  ];

  // Originals without a catalog near-duplicate that still need metadata enrichment
  const standalone = [
    { name:'Enges Bankdrücken',     category:'Brust',         secondary_muscles:'vordere Schulter',                            equipment:'Hantelbank, Langhantel',         frequency_note:'1-2x/Woche, 48h'    },
    { name:'Kreuzheben',            category:'Hintere Kette', secondary_muscles:'Latissimus, Trapez, Unterarme, Bauch/Rumpf',  equipment:'Langhantel',                    frequency_note:'1x/Woche, 72h'      },
    { name:'Statischer Split Squat',category:'Beine',         secondary_muscles:'Beinbeuger, Waden, Rumpfstabilität',          equipment:'Körpergewicht, Kurzhanteln optional', frequency_note:'1-2x/Woche, 48h' },
  ];

  const run = db.transaction(() => {
    for (const p of pairs) {
      const keepEx = getEx.get(p.keep);
      const dropEx = getEx.get(p.drop);
      if (!keepEx) continue;
      if (dropEx) {
        migrateRefs.run(keepEx.id, dropEx.id);
        deleteEx.run(dropEx.id);
      }
      enrichEx.run(p.category, p.secondary_muscles, p.equipment, p.frequency_note, keepEx.id);
    }
    for (const s of standalone) {
      const ex = getEx.get(s.name);
      if (ex) enrichEx.run(s.category, s.secondary_muscles, s.equipment, s.frequency_note, ex.id);
    }
  });
  run();
}

function initializeDatabase(dbPath) {
  const resolvedPath = dbPath || path.join(__dirname, 'training.db');
  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables();
  runMigrations();
  return db;
}

module.exports = { initializeDatabase, getDb };
