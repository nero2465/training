# Workout Tracker — Projektdokumentation

Private mobile Web-App zur Trainingserfassung und -auswertung, deployed auf einem Synology NAS DS411 via Docker. Kein Framework, kein Build-Step, kein CDN-Abhängigkeit — alles läuft offline im LAN.

---

## Tech-Stack

| Schicht | Technologie |
|---------|-------------|
| Backend | Node.js 20, Express 4 |
| Datenbank | SQLite via `better-sqlite3` (synchrone API, kein Async-Overhead) |
| Session | `express-session` + `connect-sqlite3` Store |
| Auth | bcrypt (Rounds: 12) |
| Frontend | Vanilla HTML/CSS/JS, kein Framework, kein Build-Step |
| Charts | Chart.js (CDN, nur auf Fortschrittsseite) |
| Audio | Web Audio API (`AudioContext`) für Timer-Beeps |
| Deployment | Docker + docker-compose auf Synology NAS |

---

## Projektstruktur

```
training/
├── server.js                  # Express-Einstiegspunkt
├── Dockerfile                 # Alpine Node 20, kompiliert better-sqlite3
├── docker-compose.yml         # NAS-Deployment-Konfiguration
├── package.json
│
├── db/
│   ├── database.js            # Schema-Init, Migrationen, Übungs-Seeding
│   └── seed.js                # Demo-User + Trainingsplan A/B (manuell ausführen)
│
├── routes/
│   ├── auth.js                # Login, Logout, Register, /me
│   ├── plans.js               # Pläne, Einheiten, Übungszuordnungen (CRUD)
│   ├── workouts.js            # Workout-Lifecycle, Sätze, Empfehlungen, Fortschritt
│   └── exercises.js           # Übungskatalog-CRUD
│
└── public/                    # Static files (live-mounted auf NAS)
    ├── css/app.css            # Gesamtes Styling, Dark Theme
    ├── index.html             # Login-Seite
    ├── dashboard.html         # Startseite nach Login
    ├── training.html          # Aktives Training
    ├── plans.html             # Plan-Editor
    ├── history.html           # Trainingshistorie
    ├── progress.html          # Fortschrittsdiagramme
    └── js/
        ├── common.js          # API-Helper, Auth, Audio, Nav, Toast, ExerciseInfo-Modal
        ├── dashboard.js       # Dashboard-Logik
        ├── training.js        # Vollständige Trainings-Session-Logik
        ├── plans.js           # Plan-Editor-Logik
        ├── history.js         # Historien-Anzeige
        └── progress.js        # Chart.js-Diagramme
```

---

## Datenbankschema

```sql
users (id, username UNIQUE, password_hash, created_at)

exercises (
  id, name UNIQUE, muscle_groups, technique_tip,
  category, secondary_muscles, equipment, frequency_note
)

training_plans (id, user_id → users, name, description, created_at)

plan_sessions (id, plan_id → training_plans, session_label, order_index)

session_exercises (
  id, session_id → plan_sessions, exercise_id → exercises,
  sets, reps_min, reps_max, order_index
)

workouts (id, user_id → users, session_id → plan_sessions, started_at, ended_at)

workout_sets (
  id, workout_id → workouts, session_exercise_id → session_exercises,
  set_number, weight REAL, reps, completed_at,
  rating INTEGER,   -- 1=zu schwer, 2=ok, 3=zu leicht
  note TEXT,
  skipped INTEGER DEFAULT 0
)
```

**Migrationen** laufen automatisch bei jedem Container-Start in `database.js → runMigrations()`. Neue Spalten werden via `ALTER TABLE … ADD COLUMN` ergänzt (try/catch, idempotent). Danach laufen `seedBuiltinExercises()` und `deduplicateExercises()`.

---

## Übungskatalog

`database.js → seedBuiltinExercises()` fügt **33 neue Übungen** via `INSERT OR IGNORE` ein — läuft bei jedem Start, niemals destructiv.

`database.js → deduplicateExercises()` löst 11 Dopplungen zwischen Original-Seed und Katalog auf:
- Behält den **Original-Namen** (weil er in Plänen referenziert ist)
- Migriert eventuelle `session_exercises`-Referenzen vom Duplikat auf das Original
- Löscht die Katalog-Kopie
- Reichert das Original mit Metadaten an (category, equipment, frequency_note)
- Ebenfalls: `Enges Bankdrücken`, `Kreuzheben`, `Statischer Split Squat` direkt angereichert

**Ergebnis nach Deployment: 47 Übungen, keine Dopplungen.**

Die 11 Duplikat-Paare (original → gelöschte Katalog-Kopie):
- Kniebeuge ← Langhantel-Kniebeuge
- Bankdrücken ← Langhantel-Bankdrücken
- Langhantelrudern ← Langhantelrudern vorgebeugt
- Leg Curl ← Leg Curl am Bank-Anbau
- SZ-Curls ← SZ-Curl
- Wadenheben ← Stehendes Wadenheben mit Langhantel
- Schulterdrücken ← Schulterdrücken stehend mit Langhantel
- Hip Thrust / Glute Bridge ← Langhantel-Hip-Thrust
- Einarmiges Kurzhantelrudern ← Einarmiges Kurzhantelrudern auf der Bank
- SZ-French Press ← SZ-French-Press liegend
- Seitheben ← Seitheben mit Kurzhanteln

---

## API-Endpunkte

Alle Endpunkte außer `/api/auth/login` und `/api/auth/register` erfordern eine aktive Session.

### Auth (`/api/auth`)
| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| POST | `/login` | Login, setzt Session-Cookie |
| POST | `/logout` | Session zerstören |
| GET | `/me` | Aktuellen User prüfen (401 wenn nicht eingeloggt) |
| POST | `/register` | Neuen User anlegen (Username 3–30 Zeichen, Passwort ≥6) |

### Exercises (`/api/exercises`)
| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/exercises` | Alle Übungen alphabetisch |
| GET | `/exercises/:id` | Eine Übung |
| POST | `/exercises` | Neue Übung erstellen |
| DELETE | `/exercises/:id` | Übung löschen |

### Pläne (`/api/plans`, `/api/sessions`, `/api/session-exercises`)
| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/plans` | Alle Pläne des Users |
| POST | `/plans` | Neuen Plan erstellen |
| PUT | `/plans/:id` | Plan umbenennen |
| DELETE | `/plans/:id` | Plan + alle Einheiten löschen |
| GET | `/plans/:id/sessions` | Einheiten eines Plans |
| POST | `/plans/:id/sessions` | Einheit hinzufügen |
| PUT | `/sessions/:id` | Einheit bearbeiten |
| DELETE | `/sessions/:id` | Einheit löschen |
| GET | `/sessions/:id/exercises` | Übungen einer Einheit (mit JOIN auf exercises) |
| POST | `/sessions/:id/exercises` | Übung zur Einheit hinzufügen |
| PUT | `/session-exercises/:id` | Sets/Reps/Reihenfolge bearbeiten |
| DELETE | `/session-exercises/:id` | Übung aus Einheit entfernen |

### Workouts (`/api/workouts`, `/api/workout-sets`)
| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| POST | `/workouts/start` | Workout starten (gibt workout_id zurück) |
| POST | `/workouts/:id/sets` | Satz loggen (weight, reps, rating, note) |
| PUT | `/workouts/:id/end` | Workout beenden |
| GET | `/workouts` | Alle Workouts des Users (mit Satz-Count) |
| GET | `/workouts/:id` | Workout-Details inkl. aller Sätze |
| PUT | `/workout-sets/:id` | Rating/Notiz eines Satzes nachträglich speichern |
| GET | `/progress/:exercise_id` | Fortschrittsdaten (max_weight, total_volume pro Tag) |
| GET | `/recommendations/:session_exercise_id` | Gewichtsempfehlung aus letztem Training |

---

## Frontend-Seiten

### `index.html` — Login
- Login-Formular mit Username/Passwort
- Weiterleitung zu `/dashboard.html` nach erfolgreichem Login
- Registrierungs-Tab auf derselben Seite

### `dashboard.html` — Startseite
- Zeigt letztes Training (Datum, Einheit, Satzanzahl)
- Listet alle Trainingseinheiten aller Pläne als klickbare Karten
- `startedAt` wird **client-seitig** gesetzt (`new Date().toISOString()`), nicht vom Server — vermeidet Zeitzone-Bug (NAS läuft UTC, Client CET)

### `training.html` + `training.js` — Aktives Training
Der Kern der App. State-Variablen:
```javascript
workoutData, exercises, currentExerciseIndex, currentSetNumber
currentWeight, currentReps, loggedSets, skippedSets
sessionTimerInterval, sessionSeconds, startedAt
restDuration, restRemaining, restInterval, restPaused, restAfterLastSet
currentRating, lastSetId, restMinimized
exerciseNameOverrides, editingExercise
```

**Ablauf einer Trainingseinheit:**
1. `init()` — lädt Workout aus `sessionStorage`, prüft Auth, lädt Übungen
2. `showExercise(index)` — zeigt aktuelle Übung, baut Set-Bubbles, lädt Empfehlung
3. `logSet()` — speichert Satz via API, entsperrt AudioContext, startet Pausen-Timer
4. `startRestTimer()` — zeigt Overlay, startet Countdown, resettet Rating-UI
5. `restTick()` — dekrementiert, aktualisiert Ring + Mini-Timer, ruft `timerComplete()` bei 0
6. `timerComplete()` — aktualisiert Rating-Bubble sofort lokal, speichert rating/note via API, blendet Overlay aus, rückt zur nächsten Übung vor (wenn letzter Satz)
7. `skipSet()` — markiert Satz als übersprungen lokal, prüft ob Übung abgeschlossen
8. `endTraining()` — PUT /workouts/:id/end, zeigt Abschluss-Overlay

**Features im Training:**
- **Gewicht direkt eingeben** per `<input type="number">` (+ Stepper ±2,5 kg)
- **Set-Bubbles** zeigen Status: leer → aktiv (gefärbt) → done (grau) + Rating-Farbe:
  - 😤 rating=1 → rot (`#ef4444`)
  - ✅ rating=2 → grün (`#4ade80`)
  - 💪 rating=3 → blau (`#60a5fa`)
  - Übersprungen → durchgestrichen
- **Pausen-Timer** mit SVG-Ring-Animation, ±10s (ändert BEIDE: Gesamt und Verbleibend)
- **Minimierbar**: ⬇ blendet Overlay aus, zeigt weißes Badge `⏸ Xs` neben Session-Timer
- **Emoji-Bewertung + Notiz** im Pause-Overlay (lokaler Update sofort, API-Call im Hintergrund)
- **Überspringen-Button** neben "Satz speichern"
- **Session-Timer** läuft in Header, berechnet Sekunden seit `startedAt`
- **Nächste Übungen** Liste unterhalb der aktuellen Karte
- **Quick-Edit** während Training: Übungsname und Satz-Anzahl anpassen (nur lokal für diese Session)
- **Übungsinfo-Popup** mit Muskelgruppen + Technik-Hinweis
- **Auto-Advance**: nach letztem Satz → Pause → nächste Übung automatisch
- **Web Audio API**: 2 kurze Beeps bei 3s verbleibend, langer Ton bei 0s; AudioContext wird beim ersten User-Tap entsperrt

### `plans.html` + `plans.js` — Plan-Editor
- Plan erstellen/umbenennen/löschen
- Einheiten A/B/C… hinzufügen/löschen, auf-/zuklappen
- Übungen über Modal-Bibliothek auswählen (Suche nach Name/Muskel)
- Übungsliste sofort aktualisiert nach Hinzufügen (Bug-Fix: `targetSessionId` vor `closeExerciseLibrary()` gesichert)
- Neue Übung direkt in Modal erstellen (Name, Muskelgruppen, Technik-Hinweis)
- Inline-Bearbeitung von Sätzen/Wiederholungen per Klick
- Reihenfolge per ▲/▼ Buttons anpassen

### `history.html` + `history.js` — Verlauf
- Chronologische Liste aller abgeschlossenen Workouts
- Pro Workout: Datum, Einheit-Label, Planname, Anzahl Sätze, Dauer

### `progress.html` + `progress.js` — Fortschritt
- Übung auswählen per Dropdown
- Chart.js Liniendiagramm: Maximalgewicht pro Training
- Chart.js Balkendiagramm: Trainingsvolumen (kg × Wdh.) pro Training

### `public/js/common.js` — Gemeinsame Utilities
```javascript
API.get(path)           // fetch wrapper, wirft bei !ok
API.post(path, body)
API.put(path, body)
API.delete(path)

requireAuth()           // GET /api/auth/me, redirect zu / bei 401
formatDuration(sec)     // "MM:SS"
formatDate(str)         // "Montag, 7. Juni 2026"
formatWeight(kg)        // "80 kg" oder "80.5 kg"
playBeep(freq, dur)     // Web Audio API Ton
playTimerDone()         // 2 Beeps bei 3s + langer Ton bei 0s
getAudioContext()       // lazy init, cached
showToast(msg, type)    // Kurze Meldung (success/error/info)
WorkoutStorage          // sessionStorage wrapper für aktives Workout
buildNav(active)        // Bottom-Navigation HTML
showExerciseInfo(ex)    // Modal mit Muskelgruppen + Technik
closeExerciseModal()
```

---

## Synology NAS — Deployment

### Aktuelle Konfiguration auf der DS
```yaml
# /volume1/docker/workout-tracker/docker-compose.yml
ports:
  - "3001:3000"   # Port 3000 war durch KasmVNC belegt
volumes:
  - /volume1/docker/workout-tracker/public:/app/public  # Live-Mount Frontend
  - /volume1/docker/workout-tracker/data:/data          # SQLite-Datenbank
```

**Wichtig:** Port 3001 verwenden (3000 = KasmVNC).

### Update-Workflow

**Nur Frontend-Änderungen** (`public/`-Dateien, kein Container-Rebuild nötig):
```bash
sudo docker run --rm \
  -v /volume1/docker/workout-tracker/public:/output \
  alpine sh -c "
    apk add -q --no-cache wget unzip &&
    wget -q 'https://github.com/nero2465/training/archive/refs/heads/claude/training-app-workout-tracker-cVPph.zip' -O /tmp/t.zip &&
    cd /tmp && unzip -q t.zip &&
    cp -r training-claude-*/public/. /output/ &&
    echo Fertig
  "
```

**Backend-Änderungen** (`db/`, `routes/`, `server.js` — Container-Rebuild erforderlich):
```bash
# Schritt 1: Alle Quelldateien aktualisieren
sudo docker run --rm \
  -v /volume1/docker/workout-tracker:/workdir \
  alpine sh -c "
    apk add -q --no-cache wget unzip &&
    wget -q 'https://github.com/nero2465/training/archive/refs/heads/claude/training-app-workout-tracker-cVPph.zip' -O /tmp/t.zip &&
    cd /tmp && unzip -q t.zip &&
    cp -r training-claude-*/db/. /workdir/db/ &&
    cp -r training-claude-*/routes/. /workdir/routes/ &&
    cp training-claude-*/server.js /workdir/ &&
    cp -r training-claude-*/public/. /workdir/public/ &&
    echo Fertig
  "

# Schritt 2: Container neu bauen und starten
cd /volume1/docker/workout-tracker && sudo docker-compose up -d --build
```

**Wann was nötig:**
| Geänderte Datei | Nur Frontend-Update | Rebuild nötig |
|-----------------|---------------------|---------------|
| `public/**` | ✅ | – |
| `routes/*.js` | – | ✅ |
| `db/database.js` | – | ✅ |
| `server.js` | – | ✅ |

### Datensicherheit bei Updates
- `INSERT OR IGNORE` in `seedBuiltinExercises()` — keine Überschreibung bestehender Übungen
- `ALTER TABLE … ADD COLUMN` in Migrationen — bestehende Daten unberührt
- `deduplicateExercises()` migriert Referenzen vor dem Löschen — Pläne bleiben intakt
- `seed.js` löscht nur Pläne des `demo`-Users — echte Nutzer-Daten sicher
- **seed.js niemals automatisch ausführen** — nur manuell für Demo-Reset

### Demo-User zurücksetzen (optional)
```bash
sudo docker exec -it workout-tracker node db/seed.js
```
Setzt demo/demo123 zurück und legt Training A/B neu an (nur für demo-Account).

---

## Bekannte Eigenheiten & Fixes

### Zeitzone (NAS UTC vs. Client CET)
Der Session-Timer startete zunächst bei ~2:00:10 weil `workout.started_at` vom Server (UTC) mit der lokalen Uhrzeit verglichen wurde. Fix in `dashboard.js`:
```javascript
// FALSCH: startedAt: workout.started_at  (Server-UTC)
// RICHTIG:
startedAt: new Date().toISOString()   // Client-Timestamp
```

### AudioContext auf Mobile/Safari
Safari blockiert AudioContext bis zum ersten User-Gesture. Fix: `ctx.resume()` beim ersten Tap auf "Satz speichern" oder "Überspringen":
```javascript
const ctx = getAudioContext();
if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
```

### Rating-Badge sofort sichtbar
Rating-Farbe wird **lokal** gesetzt bevor der API-Call startet, damit der Bubble auch bei Netzwerkfehler korrekt färbt:
```javascript
// Erst lokal:
setEntry.rating = currentRating;
buildSetBubbles(ex);
// Dann API:
await API.put(`/api/workout-sets/${lastSetId}`, { rating, note });
```

### Plans-Seite: Übung sofort sichtbar nach Hinzufügen
`closeExerciseLibrary()` setzt `targetSessionId = null`. Deshalb wird die ID vorher gesichert:
```javascript
const sessionId = targetSessionId; // sichern
// ... API-Call ...
closeExerciseLibrary();
await loadSessionExercises(sessionId); // gesicherte ID verwenden
```

### Pläne-Seite: Timing-Bug (getElementById vor DOM-Append)
`document.getElementById('sessions-${planId}')` wurde aufgerufen bevor das Element im DOM war. Fix: ID nach dem `await API.get()` auflösen, nachdem die Karte bereits per `appendChild` eingefügt wurde.

---

## Multi-User

Alle Daten sind user-scoped über `user_id`. Jeder User hat eigene Pläne, Workouts und Gewichtshistorie. Die Übungskatalog-Tabelle ist global (kein `user_id`) — alle User teilen dieselben Übungen. Eigene Übungen (POST `/api/exercises`) sind ebenfalls global sichtbar.

---

## Git-Repository

**Repo:** `nero2465/training`
**Branch:** `claude/training-app-workout-tracker-cVPph`

Commit-Historie (neueste zuerst):
- Fix exercise duplicates: deduplicate catalog vs original seeds safely
- Fix 5 bugs: mini timer color, exercise list refresh, rating badges, catalog exercises, data safety
- Add set ratings, notes, minimizable timer, weight input, skip, exercise catalog
- Add custom exercise creation from plan editor modal
- Fix plans page timing bug: load exercises only after element is in DOM
- Fix timer timezone bug, plans spinner, add upcoming exercises and quick edit
- Add complete frontend and workout routes for training tracker app
- Add initial backend structure for workout tracker app
