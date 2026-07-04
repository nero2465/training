const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const { renderWorkoutDetail } = require('../public/js/history.js');
const { renderSessionCard, formatTooltipSetList } = require('../public/js/progress.js');

const routes = loadWorkoutsRouter();

test('database schema includes bodyweight column migration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'db', 'database.js'), 'utf8');
  assert.match(source, /is_bodyweight INTEGER NOT NULL DEFAULT 0/);
  assert.match(source, /ALTER TABLE workout_sets ADD COLUMN is_bodyweight INTEGER DEFAULT 0/);
});

test('set logging route forwards and returns is_bodyweight without changing weight handling', async () => {
  let insertArgs = null;

  const db = {
    prepare(sql) {
      if (sql.includes('SELECT * FROM workouts WHERE id = ? AND user_id = ?')) {
        return { get: () => ({ id: 11, user_id: 7, ended_at: null }) };
      }
      if (sql.includes('SELECT e.id as exercise_id, e.name as exercise_name')) {
        return { get: () => ({ exercise_id: 5, exercise_name: 'Dips' }) };
      }
      if (sql.includes('INSERT INTO workout_sets')) {
        return {
          run: (...args) => {
            insertArgs = args;
            return { lastInsertRowid: 99 };
          },
        };
      }
      if (sql.includes('SELECT * FROM workout_sets WHERE id = ?')) {
        return {
          get: () => ({
            id: 99,
            workout_id: 11,
            session_exercise_id: 22,
            set_number: 3,
            weight: 12.5,
            reps: 10,
            is_bodyweight: 1,
          }),
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const req = {
    params: { id: '11' },
    session: { userId: 7 },
    body: {
      session_exercise_id: 22,
      set_number: 3,
      weight: 12.5,
      reps: 10,
      is_bodyweight: 1,
    },
  };
  const res = createRes();

  await routes.post['/workouts/:id/sets'](req, res, db);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.is_bodyweight, 1);
  assert.equal(res.body.weight, 12.5);
  assert.deepEqual(insertArgs, [11, 22, 3, 12.5, 10, 1, null, null, 'Dips', 5]);
});

test('progress aggregation keeps volume logic unchanged and exposes BW set metadata for rendering', async () => {
  const db = {
    prepare(sql) {
      if (sql.includes('FROM workout_sets ws') && sql.includes('ORDER BY w.started_at ASC, ws.set_number ASC')) {
        return {
          all: () => ([
            {
              date: '2026-07-04',
              workout_id: 1,
              started_at: '2026-07-04 09:00:00',
              set_number: 1,
              weight: 12.5,
              reps: 10,
              is_bodyweight: 1,
            },
            {
              date: '2026-07-04',
              workout_id: 1,
              started_at: '2026-07-04 09:00:00',
              set_number: 2,
              weight: 15,
              reps: 8,
              is_bodyweight: 0,
            },
          ]),
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const req = {
    params: { exercise_id: '5' },
    session: { userId: 7 },
  };
  const res = createRes();

  await routes.get['/progress/:exercise_id'](req, res, db);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.deepEqual(res.body[0], {
    date: '2026-07-04',
    workout_id: 1,
    started_at: '2026-07-04 09:00:00',
    max_weight: 15,
    total_volume: 245,
    est_1rm: 19,
    sets: [
      { set_number: 1, weight: 12.5, reps: 10, is_bodyweight: 1 },
      { set_number: 2, weight: 15, reps: 8, is_bodyweight: 0 },
    ],
  });

  const historyHtml = renderWorkoutDetail({
    sets: [
      {
        exercise_name: 'Dips',
        set_number: 1,
        weight: 12.5,
        reps: 10,
        is_bodyweight: 1,
      },
    ],
  });
  assert.match(historyHtml, /bodyweight-badge/);
  assert.match(historyHtml, />BW</);
  assert.match(historyHtml, /Dips[\s\S]*bodyweight-badge/);

  const progressCardHtml = renderSessionCard(res.body[0]);
  assert.match(progressCardHtml, /bodyweight-badge/);
  assert.match(progressCardHtml, />BW</);

  assert.deepEqual(formatTooltipSetList(res.body[0]), [
    'S1: 12.5kg × 10 BW',
    'S2: 15kg × 8',
  ]);
});

test('recommendations expose last bodyweight state for next training defaults', async () => {
  const db = {
    prepare(sql) {
      if (sql.includes('SELECT se.* FROM session_exercises se')) {
        return { get: () => ({ id: 22, exercise_id: 5, sets: 2, reps_max: 10 }) };
      }
      if (sql.includes('SELECT w.id')) {
        return { get: () => ({ id: 81 }) };
      }
      if (sql.includes('SELECT weight, reps, set_number, rating, is_bodyweight')) {
        return {
          all: () => ([
            { weight: 12.5, reps: 10, set_number: 1, rating: 2, is_bodyweight: 1 },
            { weight: 12.5, reps: 10, set_number: 2, rating: 2, is_bodyweight: 1 },
          ]),
        };
      }
      if (sql.includes('SELECT * FROM user_settings WHERE user_id = ?')) {
        return { get: () => ({ auto_progress: 1 }) };
      }
      if (sql.includes('SELECT increment_kg FROM exercises WHERE id = ?')) {
        return { get: () => ({ increment_kg: 2.5 }) };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const req = {
    params: { session_exercise_id: '22' },
    session: { userId: 7 },
  };
  const res = createRes();

  await routes.get['/recommendations/:session_exercise_id'](req, res, db);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.recommended_weight, 15);
  assert.equal(res.body.last_bodyweight, true);
  assert.deepEqual(res.body.last_sets, [
    { weight: 12.5, reps: 10, set_number: 1, rating: 2, is_bodyweight: 1 },
    { weight: 12.5, reps: 10, set_number: 2, rating: 2, is_bodyweight: 1 },
  ]);
});

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function loadWorkoutsRouter() {
  const captured = { post: {}, get: {}, put: {}, delete: {} };
  let activeDb = null;

  const expressStub = {
    Router() {
      return {
        post(route, ...handlers) {
          captured.post[route] = wrapHandlers(handlers);
        },
        get(route, ...handlers) {
          captured.get[route] = wrapHandlers(handlers);
        },
        put(route, ...handlers) {
          captured.put[route] = wrapHandlers(handlers);
        },
        delete(route, ...handlers) {
          captured.delete[route] = wrapHandlers(handlers);
        },
      };
    },
  };

  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === 'express') {
      return expressStub;
    }
    if (request === '../db/database') {
      return {
        getDb() {
          return activeDb;
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    require('./workouts');
  } finally {
    Module._load = originalLoad;
  }

  function wrapHandlers(handlers) {
    return async (req, res, db) => {
      activeDb = db;
      let index = 0;
      const next = async () => {
        const handler = handlers[index++];
        if (!handler) return;
        return handler(req, res, next);
      };
      await next();
      activeDb = null;
    };
  }

  return captured;
}
