const path = require('path');
const bcrypt = require('bcrypt');
const { initializeDatabase, getDb } = require('./database');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'training.db');

async function seed() {
  initializeDatabase(DB_PATH);
  const db = getDb();

  console.log('Seeding database...');

  // Seed exercise library (legacy entries used by training plans)
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
  console.log(`Seeded ${exercises.length} legacy exercises`);

  // ─────────────────────────────────────────────────────────────────────────
  // Update legacy exercises with catalog metadata (old names → catalog data)
  // ─────────────────────────────────────────────────────────────────────────
  const legacyUpdates = [
    {
      oldName: 'Kniebeuge',
      category: 'Beine',
      secondary_muscles: 'Beinbeuger, Rückenstrecker, Bauch/Rumpf',
      equipment: 'Langhantel, Rack',
      frequency_note: '1-2x/Woche, 48-72h'
    },
    {
      oldName: 'Bankdrücken',
      category: 'Brust',
      secondary_muscles: 'Trizeps, vordere Schulter, oberer Rücken',
      equipment: 'Hantelbank, Langhantel',
      frequency_note: '1-2x/Woche, 48-72h'
    },
    {
      oldName: 'Langhantelrudern',
      category: 'Rücken',
      secondary_muscles: 'hintere Schulter, Bizeps, Rückenstrecker',
      equipment: 'Langhantel',
      frequency_note: '1-2x/Woche, 48-72h'
    },
    {
      oldName: 'Leg Curl',
      category: 'Hintere Kette',
      secondary_muscles: 'Waden',
      equipment: 'Hantelbank mit Leg-Curl-Anbau',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      oldName: 'SZ-Curls',
      category: 'Arme',
      secondary_muscles: 'Brachialis, Unterarme',
      equipment: 'SZ-Stange',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      oldName: 'Wadenheben',
      category: 'Waden',
      secondary_muscles: 'Fußstabilisatoren',
      equipment: 'Langhantel, Rack',
      frequency_note: '2-3x/Woche, 24-48h'
    },
    {
      oldName: 'Schulterdrücken',
      category: 'Schultern',
      secondary_muscles: 'Trizeps, oberer Rücken, Bauch/Rumpf',
      equipment: 'Langhantel, Rack',
      frequency_note: '1-2x/Woche, 48-72h'
    },
    {
      oldName: 'Hip Thrust / Glute Bridge',
      category: 'Hintere Kette',
      secondary_muscles: 'Beinbeuger, Quadrizeps, Bauch/Rumpf',
      equipment: 'Langhantel, Bank',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      oldName: 'Einarmiges Kurzhantelrudern',
      category: 'Rücken',
      secondary_muscles: 'hintere Schulter, Bizeps',
      equipment: 'Hantelbank, Kurzhantel',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      oldName: 'SZ-French Press',
      category: 'Arme',
      secondary_muscles: 'vordere Schulter, Brust',
      equipment: 'SZ-Stange, Hantelbank',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      oldName: 'Seitheben',
      category: 'Schultern',
      secondary_muscles: 'Trapez',
      equipment: 'leichte Kurzhanteln',
      frequency_note: '1-3x/Woche, 24-48h'
    }
  ];

  const updateLegacy = db.prepare(`
    UPDATE exercises SET category=?, secondary_muscles=?, equipment=?, frequency_note=?
    WHERE name=?
  `);
  for (const u of legacyUpdates) {
    updateLegacy.run(u.category, u.secondary_muscles, u.equipment, u.frequency_note, u.oldName);
  }
  console.log(`Updated ${legacyUpdates.length} legacy exercises with catalog metadata`);

  // ─────────────────────────────────────────────────────────────────────────
  // Full exercise catalog – 47 exercises from CSV
  // ─────────────────────────────────────────────────────────────────────────
  const catalogExercises = [
    // Beine
    {
      name: 'Langhantel-Kniebeuge',
      muscle_groups: 'Quadrizeps, Gesäß',
      technique_tip: 'Füße schulterbreit, Rumpf fest, Knie folgen Fußspitzen, kontrolliert absenken.',
      category: 'Beine',
      secondary_muscles: 'Beinbeuger, Rückenstrecker, Bauch/Rumpf',
      equipment: 'Langhantel, Rack',
      frequency_note: '1-2x/Woche, 48-72h'
    },
    {
      name: 'Front Squat mit Langhantel',
      muscle_groups: 'Quadrizeps',
      technique_tip: 'Ellbogen hoch, Oberkörper aufrecht, Hantel auf vorderer Schulter.',
      category: 'Beine',
      secondary_muscles: 'Gesäß, oberer Rücken, Bauch/Rumpf',
      equipment: 'Langhantel, Rack',
      frequency_note: '1x/Woche, 48-72h'
    },
    {
      name: 'Goblet Squat mit Kettlebell',
      muscle_groups: 'Quadrizeps, Gesäß',
      technique_tip: 'Kettlebell vor Brust, Brustkorb aufrecht, Knie nach außen.',
      category: 'Beine',
      secondary_muscles: 'Bauch/Rumpf, oberer Rücken',
      equipment: 'Kettlebell',
      frequency_note: '1-3x/Woche, 24-48h'
    },
    {
      name: 'Bulgarian Split Squat',
      muscle_groups: 'Quadrizeps, Gesäß',
      technique_tip: 'Hinterer Fuß auf Bank, vorderer Fuß stabil, langsam absenken.',
      category: 'Beine',
      secondary_muscles: 'Beinbeuger, Waden, Rumpfstabilität',
      equipment: 'Bank, Kurzhanteln optional',
      frequency_note: '1-2x/Woche, 48-72h'
    },
    {
      name: 'Zercher Squat',
      muscle_groups: 'Quadrizeps, Gesäß',
      technique_tip: 'Hantel in Armbeuge, Rumpf fest, aufrecht bleiben.',
      category: 'Beine',
      secondary_muscles: 'Bauch/Rumpf, oberer Rücken, Bizeps',
      equipment: 'Langhantel, Rack',
      frequency_note: '1x/Woche, 48-72h'
    },
    // Hintere Kette
    {
      name: 'Rumänisches Kreuzheben',
      muscle_groups: 'Beinbeuger, Gesäß',
      technique_tip: 'Knie leicht gebeugt, Hüfte weit nach hinten, Rücken neutral.',
      category: 'Hintere Kette',
      secondary_muscles: 'Rückenstrecker, Latissimus, Unterarme',
      equipment: 'Langhantel oder Kurzhanteln',
      frequency_note: '1-2x/Woche, 48-72h'
    },
    {
      name: 'Langhantel-Hip-Thrust',
      muscle_groups: 'Gesäß',
      technique_tip: 'Schulterblätter an Bank, Füße stabil, Becken hochdrücken.',
      category: 'Hintere Kette',
      secondary_muscles: 'Beinbeuger, Quadrizeps, Bauch/Rumpf',
      equipment: 'Langhantel, Bank',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Langhantel-Glute-Bridge am Boden',
      muscle_groups: 'Gesäß',
      technique_tip: 'Oberer Rücken am Boden, Füße fest, Becken hochdrücken.',
      category: 'Hintere Kette',
      secondary_muscles: 'Beinbeuger, Bauch/Rumpf',
      equipment: 'Langhantel, Matte',
      frequency_note: '1-3x/Woche, 24-48h'
    },
    {
      name: 'Leg Curl am Bank-Anbau',
      muscle_groups: 'Beinbeuger',
      technique_tip: 'Kontrolliert ausführen, oben anspannen, langsam ablassen.',
      category: 'Hintere Kette',
      secondary_muscles: 'Waden',
      equipment: 'Hantelbank mit Leg-Curl-Anbau',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Kettlebell Deadlift',
      muscle_groups: 'Gesäß, Beinbeuger, Rückenstrecker',
      technique_tip: 'Kettlebell zwischen Füßen, Hüfte nach hinten, kraftvoll aufrichten.',
      category: 'Hintere Kette',
      secondary_muscles: 'Quadrizeps, Unterarme, Rumpf',
      equipment: 'Kettlebell',
      frequency_note: '1-3x/Woche, 24-48h'
    },
    {
      name: 'Good Morning mit Langhantel',
      muscle_groups: 'Beinbeuger, Rückenstrecker, Gesäß',
      technique_tip: 'Sehr leicht starten, Hüfte nach hinten, Rücken neutral.',
      category: 'Hintere Kette',
      secondary_muscles: 'Bauch/Rumpf, oberer Rücken',
      equipment: 'Langhantel, Rack',
      frequency_note: '1x/Woche, 48-72h'
    },
    // Brust
    {
      name: 'Langhantel-Bankdrücken',
      muscle_groups: 'Brust',
      technique_tip: 'Schulterblätter zurück und unten, Hantel zur unteren Brust führen.',
      category: 'Brust',
      secondary_muscles: 'Trizeps, vordere Schulter, oberer Rücken',
      equipment: 'Hantelbank, Langhantel',
      frequency_note: '1-2x/Woche, 48-72h'
    },
    {
      name: 'Kurzhantel-Bankdrücken',
      muscle_groups: 'Brust',
      technique_tip: 'Kurzhanteln kontrolliert absenken, Ellbogen unter Schulter.',
      category: 'Brust',
      secondary_muscles: 'Trizeps, vordere Schulter',
      equipment: 'Hantelbank, Kurzhanteln',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Kurzhantel-Schrägbankdrücken',
      muscle_groups: 'obere Brust',
      technique_tip: 'Bank leicht schräg, Schulterblätter stabil.',
      category: 'Brust',
      secondary_muscles: 'vordere Schulter, Trizeps',
      equipment: 'Schrägbank, Kurzhanteln',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Kurzhantel-Flys auf der Bank',
      muscle_groups: 'Brust',
      technique_tip: 'Leichte Beugung im Ellbogen, langsam öffnen.',
      category: 'Brust',
      secondary_muscles: 'vordere Schulter, Bizeps',
      equipment: 'Hantelbank, leichte Kurzhanteln',
      frequency_note: '1x/Woche, 48h'
    },
    {
      name: 'Liegestütz an der Bank',
      muscle_groups: 'Brust',
      technique_tip: 'Körper gerade, Brust zur Bank.',
      category: 'Brust',
      secondary_muscles: 'Trizeps, vordere Schulter, Bauch/Rumpf',
      equipment: 'Hantelbank, Körpergewicht',
      frequency_note: '1-3x/Woche, 24-48h'
    },
    // Rücken
    {
      name: 'Langhantelrudern vorgebeugt',
      muscle_groups: 'Latissimus, mittlerer Rücken',
      technique_tip: 'Oberkörper stabil vorgeneigt, Rücken neutral, Hantel zur Brust.',
      category: 'Rücken',
      secondary_muscles: 'hintere Schulter, Bizeps, Rückenstrecker',
      equipment: 'Langhantel',
      frequency_note: '1-2x/Woche, 48-72h'
    },
    {
      name: 'Einarmiges Kurzhantelrudern auf der Bank',
      muscle_groups: 'Latissimus, mittlerer Rücken',
      technique_tip: 'Eine Hand/Knie abstützen, Rücken ruhig, Ellbogen zur Hüfte.',
      category: 'Rücken',
      secondary_muscles: 'hintere Schulter, Bizeps',
      equipment: 'Hantelbank, Kurzhantel',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Kurzhantel-Rudern beidarmig brustgestützt',
      muscle_groups: 'mittlerer Rücken, Latissimus',
      technique_tip: 'Brust auf Bank, Schultern zurückziehen.',
      category: 'Rücken',
      secondary_muscles: 'hintere Schulter, Bizeps',
      equipment: 'Schrägbank, Kurzhanteln',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Pendlay Row',
      muscle_groups: 'mittlerer Rücken, Latissimus',
      technique_tip: 'Jede Wiederholung vom Boden, Rücken neutral, explosiv zur Brust.',
      category: 'Rücken',
      secondary_muscles: 'hintere Schulter, Bizeps, Rückenstrecker',
      equipment: 'Langhantel',
      frequency_note: '1x/Woche, 48-72h'
    },
    {
      name: 'Kurzhantel-Pullover auf der Bank',
      muscle_groups: 'Latissimus, Brust',
      technique_tip: 'Hantel hinter Kopf, Rippen unten halten.',
      category: 'Rücken',
      secondary_muscles: 'Trizeps langer Kopf, Rumpf',
      equipment: 'Hantelbank, Kurzhantel',
      frequency_note: '1x/Woche, 48h'
    },
    {
      name: 'Langhantel-Shrugs',
      muscle_groups: 'Trapez/Nacken',
      technique_tip: 'Schultern gerade nach oben, kurz halten, nicht kreisen.',
      category: 'Rücken',
      secondary_muscles: 'Unterarme, oberer Rücken',
      equipment: 'Langhantel oder Kurzhanteln',
      frequency_note: '1-2x/Woche, 48h'
    },
    // Schultern
    {
      name: 'Schulterdrücken stehend mit Langhantel',
      muscle_groups: 'Schultern',
      technique_tip: 'Gesäß und Bauch fest, Hantel nah am Gesicht nach oben.',
      category: 'Schultern',
      secondary_muscles: 'Trizeps, oberer Rücken, Bauch/Rumpf',
      equipment: 'Langhantel, Rack',
      frequency_note: '1-2x/Woche, 48-72h'
    },
    {
      name: 'Sitzendes Kurzhantel-Schulterdrücken',
      muscle_groups: 'Schultern',
      technique_tip: 'Rücken stabil, Kurzhanteln kontrolliert auf Schulterhöhe.',
      category: 'Schultern',
      secondary_muscles: 'Trizeps, oberer Rücken',
      equipment: 'Hantelbank, Kurzhanteln',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Seitheben mit Kurzhanteln',
      muscle_groups: 'seitliche Schulter',
      technique_tip: 'Leicht gebeugte Ellbogen, bis Schulterhöhe, kein Schwung.',
      category: 'Schultern',
      secondary_muscles: 'Trapez',
      equipment: 'leichte Kurzhanteln',
      frequency_note: '1-3x/Woche, 24-48h'
    },
    {
      name: 'Vorgebeugtes Seitheben',
      muscle_groups: 'hintere Schulter',
      technique_tip: 'Oberkörper vorgeneigt, seitlich anheben.',
      category: 'Schultern',
      secondary_muscles: 'mittlerer Rücken, Trapez',
      equipment: 'leichte Kurzhanteln',
      frequency_note: '1-3x/Woche, 24-48h'
    },
    {
      name: 'Frontheben mit Kurzhanteln',
      muscle_groups: 'vordere Schulter',
      technique_tip: 'Bis Schulterhöhe, Rumpf fest, kein Schwung.',
      category: 'Schultern',
      secondary_muscles: 'oberer Brustanteil, Trapez',
      equipment: 'Kurzhanteln',
      frequency_note: '1x/Woche, 48h'
    },
    {
      name: 'Aufrechtes Rudern mit SZ-Stange',
      muscle_groups: 'seitliche Schulter, Trapez',
      technique_tip: 'Griff nicht zu eng, Ellbogen bis Schulterhöhe.',
      category: 'Schultern',
      secondary_muscles: 'Bizeps, Unterarme',
      equipment: 'SZ-Stange',
      frequency_note: '1x/Woche, 48h'
    },
    // Arme
    {
      name: 'SZ-Curl',
      muscle_groups: 'Bizeps',
      technique_tip: 'Ellbogen ruhig, kein Schwung, langsam ablassen.',
      category: 'Arme',
      secondary_muscles: 'Brachialis, Unterarme',
      equipment: 'SZ-Stange',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Kurzhantel-Curl stehend',
      muscle_groups: 'Bizeps',
      technique_tip: 'Schultern ruhig, Handgelenke stabil, kein Rückenschwung.',
      category: 'Arme',
      secondary_muscles: 'Unterarme, Brachialis',
      equipment: 'Kurzhanteln',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Hammer Curl',
      muscle_groups: 'Brachialis, Unterarme',
      technique_tip: 'Neutralgriff, Ellbogen ruhig, kontrolliert.',
      category: 'Arme',
      secondary_muscles: 'Bizeps',
      equipment: 'Kurzhanteln oder Kettlebells',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Konzentrationscurl sitzend',
      muscle_groups: 'Bizeps',
      technique_tip: 'Oberarm am Oberschenkel, langsam curlen.',
      category: 'Arme',
      secondary_muscles: 'Brachialis, Unterarme',
      equipment: 'Kurzhantel, Bank',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'SZ-French-Press liegend',
      muscle_groups: 'Trizeps',
      technique_tip: 'Oberarme ruhig, Stange zur Stirn senken, Ellbogen nicht ausstellen.',
      category: 'Arme',
      secondary_muscles: 'vordere Schulter, Brust',
      equipment: 'SZ-Stange, Hantelbank',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Kurzhantel-Trizepsdrücken über Kopf',
      muscle_groups: 'Trizeps langer Kopf',
      technique_tip: 'Ellbogen nach oben, langsam hinter Kopf.',
      category: 'Arme',
      secondary_muscles: 'Schultern, Rumpf',
      equipment: 'Kurzhantel, Bank',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Kurzhantel-Kickback brustgestützt',
      muscle_groups: 'Trizeps',
      technique_tip: 'Oberarm ruhig, Unterarm streckt nach hinten.',
      category: 'Arme',
      secondary_muscles: 'hintere Schulter',
      equipment: 'Bank, Kurzhantel',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Bank-Dips mit gebeugten Beinen',
      muscle_groups: 'Trizeps',
      technique_tip: 'Schultern tief, Ellbogen nach hinten.',
      category: 'Arme',
      secondary_muscles: 'Brust, vordere Schulter',
      equipment: 'Hantelbank',
      frequency_note: '1x/Woche, 48h'
    },
    // Waden
    {
      name: 'Stehendes Wadenheben mit Langhantel',
      muscle_groups: 'Waden',
      technique_tip: 'Fersen kontrolliert absenken, hochdrücken, kurz halten.',
      category: 'Waden',
      secondary_muscles: 'Fußstabilisatoren',
      equipment: 'Langhantel, Rack',
      frequency_note: '2-3x/Woche, 24-48h'
    },
    {
      name: 'Sitzendes Wadenheben mit Langhantel',
      muscle_groups: 'Soleus/Waden',
      technique_tip: 'Gewicht auf Oberschenkeln, Fersen langsam hoch und runter.',
      category: 'Waden',
      secondary_muscles: 'Fußstabilisatoren',
      equipment: 'Bank, Langhantel',
      frequency_note: '2-3x/Woche, 24-48h'
    },
    // Unterarme
    {
      name: 'Langhantel-Halten statisch',
      muscle_groups: 'Unterarme/Griffkraft',
      technique_tip: 'Hantel sicher, Schultern stabil, ruhig halten.',
      category: 'Unterarme',
      secondary_muscles: 'Trapez, Rumpf',
      equipment: 'Langhantel',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Handgelenk-Curls mit Kurzhantel',
      muscle_groups: 'Unterarmbeuger',
      technique_tip: 'Unterarme ablegen, nur Handgelenk bewegen, langsam.',
      category: 'Unterarme',
      secondary_muscles: 'Griffkraft',
      equipment: 'Kurzhantel, Bank',
      frequency_note: '1-2x/Woche, 48h'
    },
    {
      name: 'Reverse Curl mit SZ-Stange',
      muscle_groups: 'Unterarme, Brachialis',
      technique_tip: 'Obergriff, Ellbogen ruhig, kein Schwung.',
      category: 'Unterarme',
      secondary_muscles: 'Bizeps',
      equipment: 'SZ-Stange',
      frequency_note: '1-2x/Woche, 48h'
    },
    // Rumpf
    {
      name: 'Dead Bug',
      muscle_groups: 'Bauch/Rumpfstabilität',
      technique_tip: 'Lendenwirbel Richtung Boden, Arm/Bein langsam bewegen.',
      category: 'Rumpf',
      secondary_muscles: 'Hüftbeuger, tiefe Rumpfmuskulatur',
      equipment: 'Körpergewicht, Matte',
      frequency_note: '2-4x/Woche, 24h'
    },
    {
      name: 'Bird Dog',
      muscle_groups: 'Rumpfstabilität, Rückenstrecker',
      technique_tip: 'Vierfüßlerstand, gegenüber Arm/Bein strecken, Becken ruhig.',
      category: 'Rumpf',
      secondary_muscles: 'Gesäß, Schulterstabilisatoren',
      equipment: 'Körpergewicht, Matte',
      frequency_note: '2-4x/Woche, 24h'
    },
    {
      name: 'Reverse Crunch',
      muscle_groups: 'Bauch',
      technique_tip: 'Becken einrollen, kein Schwung, langsam absenken.',
      category: 'Rumpf',
      secondary_muscles: 'Hüftbeuger',
      equipment: 'Bank oder Boden',
      frequency_note: '1-3x/Woche, 24-48h'
    }
  ];

  const insertCatalogExercise = db.prepare(`
    INSERT OR IGNORE INTO exercises (name, muscle_groups, technique_tip, category, secondary_muscles, equipment, frequency_note)
    VALUES (@name, @muscle_groups, @technique_tip, @category, @secondary_muscles, @equipment, @frequency_note)
  `);

  const updateCatalogExercise = db.prepare(`
    UPDATE exercises SET category=@category, secondary_muscles=@secondary_muscles,
      equipment=@equipment, frequency_note=@frequency_note
    WHERE name=@name
  `);

  let inserted = 0;
  let updated = 0;
  for (const ex of catalogExercises) {
    const result = insertCatalogExercise.run(ex);
    if (result.changes === 0) {
      // Already existed, update metadata fields
      updateCatalogExercise.run(ex);
      updated++;
    } else {
      inserted++;
    }
  }
  console.log(`Catalog exercises: ${inserted} inserted, ${updated} updated`);

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
