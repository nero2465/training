const path = require('path');
const bcrypt = require('bcrypt');
const { initializeDatabase, getDb } = require('./database');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'training.db');

async function seed() {
  initializeDatabase(DB_PATH);
  const db = getDb();

  console.log('Seeding database...');

  // Seed exercise library
  const exercises = [
    {
      name: 'Kniebeuge',
      muscle_groups: 'Quadrizeps, Gesäß, Oberschenkelrücken',
      technique_tip: 'Füße schulterbreit aufstellen. Zehen leicht nach außen. Knie in Richtung der Zehen drücken. Rücken gerade und gespannt halten. Tief in die Hocke gehen – Oberschenkel mindestens parallel zum Boden. Gewicht auf den Fersen.'
    },
    {
      name: 'Bankdrücken',
      muscle_groups: 'Brustmuskel, Schultern, Trizeps',
      technique_tip: 'Schulterblätter zusammenziehen und in die Bank drücken. Füße flach auf dem Boden. Stange kontrolliert zur unteren Brust absenken. Ellbogen ca. 45–75° zum Körper. Explosiv nach oben drücken.'
    },
    {
      name: 'Langhantelrudern',
      muscle_groups: 'Latissimus, Rhomboiden, Bizeps',
      technique_tip: 'Oberkörper ca. 45° nach vorne neigen. Rücken gerade, Knie leicht gebeugt. Stange zum Bauchnabel ziehen. Ellbogen nah am Körper führen. Schulterblätter am oberen Punkt zusammendrücken.'
    },
    {
      name: 'Leg Curl',
      muscle_groups: 'Oberschenkelrücken (Hamstrings)',
      technique_tip: 'Hüfte flach auf die Bank gedrückt halten. Beine gleichmäßig und kontrolliert beugen. Volle Bewegungsamplitude nutzen. Oben kurz halten, dann langsam ablassen. Nicht mit Schwung arbeiten.'
    },
    {
      name: 'Enges Bankdrücken',
      muscle_groups: 'Trizeps, Brust',
      technique_tip: 'Griffbreite etwa schulterbreit. Ellbogen nah am Körper halten – nicht nach außen klappen. Stange kontrolliert zur unteren Brust absenken. Trizeps gezielt anspannen beim Drücken. Handgelenke gerade halten.'
    },
    {
      name: 'SZ-Curls',
      muscle_groups: 'Bizeps',
      technique_tip: 'Ellbogen seitlich am Körper fixiert – nicht mitschwingen. Volle Bewegungsamplitude: ganz unten strecken, oben vollständig beugen. Langsam und kontrolliert absenken. SZ-Stange reduziert Handgelenkbelastung.'
    },
    {
      name: 'Wadenheben',
      muscle_groups: 'Wadenmuskel (Gastrocnemius, Soleus)',
      technique_tip: 'Auf einer Erhöhung stehen für volle Bewegungsamplitude. Ganz oben in die Zehenspitzen strecken und kurz halten. Unten tief in die Dehnung gehen. Langsame, kontrollierte Bewegung. Knie leicht gebeugt für Soleus-Fokus.'
    },
    {
      name: 'Kreuzheben',
      muscle_groups: 'Oberschenkelrücken, Gesäß, Rückenstrecker',
      technique_tip: 'Rücken in neutraler Position – keine Rundrücken! Stange nah am Körper führen. Aus den Beinen drücken, nicht ziehen. Hüfte und Schultern gleichzeitig heben. Schulterblätter zusammenziehen. Blick leicht nach vorne-unten.'
    },
    {
      name: 'Schulterdrücken',
      muscle_groups: 'Schultermuskel (Deltoideus), Trizeps',
      technique_tip: 'Stange vor dem Kopf in Schulterhöhe. Core fest anspannen, kein Hohlkreuz. Stange gerade nach oben drücken. Ellbogen leicht nach vorne – nicht direkt seitlich. Am oberen Punkt Schultern hochziehen (Trapez aktivieren).'
    },
    {
      name: 'Hip Thrust / Glute Bridge',
      muscle_groups: 'Gesäß (Gluteus Maximus)',
      technique_tip: 'Schulterblätter auf der Bank, Langhantel auf den Hüftknochen (mit Pad schützen). Füße hüftbreit, Knie über den Fußgelenken. Hüfte explosiv nach oben strecken – volle Extension. Oben kurz halten und Gesäß maximal anspannen. Kontrolliert absenken.'
    },
    {
      name: 'Einarmiges Kurzhantelrudern',
      muscle_groups: 'Latissimus, Rhomboiden',
      technique_tip: 'Oberkörper horizontal, eine Hand auf der Bank abstützen. Ellbogen nah am Körper nach hinten-oben ziehen. Schulterblatt am oberen Punkt zusammenziehen. Volle Streckung unten. Nicht mit dem Oberkörper rotieren.'
    },
    {
      name: 'Statischer Split Squat',
      muscle_groups: 'Quadrizeps, Gesäß',
      technique_tip: 'Weiter Ausfallschritt. Hinteres Knie tief in Richtung Boden senken. Oberkörper aufrecht halten. Vorderes Knie über dem Fuß. Gewicht auf der vorderen Ferse. Gleichmäßig auf beide Beine konzentrieren.'
    },
    {
      name: 'SZ-French Press',
      muscle_groups: 'Trizeps (langer Kopf)',
      technique_tip: 'Auf der Bank liegen, SZ-Stange über Stirnhöhe. Ellbogen zeigen nach oben – nicht nach außen klappen. SZ-Stange kontrolliert zur Stirn absenken. Nur der Unterarm bewegt sich. Trizeps voll strecken am oberen Punkt.'
    },
    {
      name: 'Seitheben',
      muscle_groups: 'Schulter (seitlicher Deltoideus)',
      technique_tip: 'Leicht vorgebeugte Position. Ellbogen minimal gebeugt (nicht starr gestreckt). Arme seitlich bis Schulterhöhe heben. Daumen leicht nach unten rotieren (Pinkside up). Langsam und kontrolliert absenken. Kein Schwung – leichtes Gewicht wählen.'
    }
  ];

  const insertExercise = db.prepare(`
    INSERT OR IGNORE INTO exercises (name, muscle_groups, technique_tip)
    VALUES (@name, @muscle_groups, @technique_tip)
  `);

  for (const exercise of exercises) {
    insertExercise.run(exercise);
  }
  console.log(`Seeded ${exercises.length} exercises`);

  // Create demo user
  const passwordHash = await bcrypt.hash('demo123', 12);

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
  let userId;

  if (existingUser) {
    userId = existingUser.id;
    console.log('Demo user already exists, updating password...');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  } else {
    const result = db.prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)'
    ).run('demo', passwordHash);
    userId = result.lastInsertRowid;
    console.log('Created demo user (username: demo, password: demo123)');
  }

  // Delete existing plans for this user to re-seed
  db.prepare('DELETE FROM training_plans WHERE user_id = ?').run(userId);

  // Create Training Plan
  const planResult = db.prepare(
    'INSERT INTO training_plans (user_id, name, description) VALUES (?, ?, ?)'
  ).run(userId, 'Mein Trainingsplan', 'Push/Pull/Legs Grundkraftprogramm');

  const planId = planResult.lastInsertRowid;

  // Helper to get exercise ID by name
  const getExerciseId = (name) => {
    const ex = db.prepare('SELECT id FROM exercises WHERE name = ?').get(name);
    if (!ex) throw new Error(`Exercise not found: ${name}`);
    return ex.id;
  };

  // Training Session A
  const sessionAResult = db.prepare(
    'INSERT INTO plan_sessions (plan_id, session_label, order_index) VALUES (?, ?, ?)'
  ).run(planId, 'A', 0);
  const sessionAId = sessionAResult.lastInsertRowid;

  const sessionAExercises = [
    { name: 'Kniebeuge',         sets: 5, reps_min: 5,  reps_max: 5  },
    { name: 'Bankdrücken',       sets: 5, reps_min: 5,  reps_max: 5  },
    { name: 'Langhantelrudern',  sets: 4, reps_min: 6,  reps_max: 8  },
    { name: 'Leg Curl',          sets: 3, reps_min: 8,  reps_max: 12 },
    { name: 'Enges Bankdrücken', sets: 3, reps_min: 8,  reps_max: 8  },
    { name: 'SZ-Curls',          sets: 3, reps_min: 8,  reps_max: 10 },
    { name: 'Wadenheben',        sets: 3, reps_min: 10, reps_max: 15 }
  ];

  const insertSessionExercise = db.prepare(`
    INSERT INTO session_exercises (session_id, exercise_id, sets, reps_min, reps_max, order_index)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  sessionAExercises.forEach((ex, idx) => {
    insertSessionExercise.run(sessionAId, getExerciseId(ex.name), ex.sets, ex.reps_min, ex.reps_max, idx);
  });

  // Training Session B
  const sessionBResult = db.prepare(
    'INSERT INTO plan_sessions (plan_id, session_label, order_index) VALUES (?, ?, ?)'
  ).run(planId, 'B', 1);
  const sessionBId = sessionBResult.lastInsertRowid;

  const sessionBExercises = [
    { name: 'Kreuzheben',                  sets: 3, reps_min: 5,  reps_max: 5  },
    { name: 'Schulterdrücken',             sets: 5, reps_min: 5,  reps_max: 5  },
    { name: 'Hip Thrust / Glute Bridge',   sets: 3, reps_min: 8,  reps_max: 10 },
    { name: 'Einarmiges Kurzhantelrudern', sets: 3, reps_min: 8,  reps_max: 10 },
    { name: 'Statischer Split Squat',      sets: 2, reps_min: 8,  reps_max: 8  },
    { name: 'SZ-French Press',             sets: 3, reps_min: 8,  reps_max: 10 },
    { name: 'Seitheben',                   sets: 3, reps_min: 10, reps_max: 15 }
  ];

  sessionBExercises.forEach((ex, idx) => {
    insertSessionExercise.run(sessionBId, getExerciseId(ex.name), ex.sets, ex.reps_min, ex.reps_max, idx);
  });

  console.log('Seeded Training Plan A and B');
  console.log('');
  console.log('Demo credentials:');
  console.log('  Username: demo');
  console.log('  Password: demo123');
  console.log('');
  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
