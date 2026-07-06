const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('session exercises list hides archived entries', async () => {
  const routes = loadRouter('./plans');
  const db = {
    prepare(sql) {
      if (sql.includes('SELECT ps.* FROM plan_sessions ps')) {
        return { get: () => ({ id: 9, plan_id: 3 }) };
      }
      if (sql.includes('FROM session_exercises se') && sql.includes('se.archived')) {
        return { all: () => [{ id: 1, name: 'Kniebeuge' }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const res = createRes();
  await routes.get['/sessions/:id/exercises']({ params: { id: '9' }, session: { userId: 7 } }, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ id: 1, name: 'Kniebeuge' }]);
});

test('deleting trained session exercise archives instead of hard-deleting', async () => {
  const routes = loadRouter('./plans');
  const calls = [];
  const db = {
    prepare(sql) {
      if (sql.includes('SELECT se.* FROM session_exercises se')) {
        return { get: () => ({ id: 42, session_id: 5 }) };
      }
      if (sql.includes('SELECT COUNT(*) as cnt FROM workout_sets')) {
        return { get: () => ({ cnt: 3 }) };
      }
      if (sql.includes('UPDATE session_exercises SET archived = 1')) {
        return { run: (id) => calls.push(['archive', id]) };
      }
      if (sql.includes('DELETE FROM session_exercises WHERE id = ?')) {
        return { run: (id) => calls.push(['delete', id]) };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const res = createRes();
  await routes.delete['/session-exercises/:id']({ params: { id: '42' }, session: { userId: 7 } }, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [['archive', 42]]);
  assert.deepEqual(res.body, { success: true });
});

test('deleting unused session exercise still hard-deletes row', async () => {
  const routes = loadRouter('./plans');
  const calls = [];
  const db = {
    prepare(sql) {
      if (sql.includes('SELECT se.* FROM session_exercises se')) {
        return { get: () => ({ id: 17, session_id: 5 }) };
      }
      if (sql.includes('SELECT COUNT(*) as cnt FROM workout_sets')) {
        return { get: () => ({ cnt: 0 }) };
      }
      if (sql.includes('DELETE FROM session_exercises WHERE id = ?')) {
        return { run: (id) => calls.push(['delete', id]) };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const res = createRes();
  await routes.delete['/session-exercises/:id']({ params: { id: '17' }, session: { userId: 7 } }, res, db);

  assert.deepEqual(calls, [['delete', 17]]);
});

test('crossfit query returns only crossfit exercises', async () => {
  const routes = loadRouter('./exercises');
  const db = {
    prepare(sql) {
      if (sql.includes("WHERE category = 'crossfit'")) {
        return { all: () => [{ id: 1, name: 'Burpees', category: 'crossfit' }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const res = createRes();
  await routes.get['/exercises']({ query: { category: 'crossfit' }, session: { userId: 7 } }, res, db);

  assert.deepEqual(res.body, [{ id: 1, name: 'Burpees', category: 'crossfit' }]);
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

function loadRouter(routePath) {
  const captured = { get: {}, post: {}, put: {}, delete: {} };
  let activeDb = null;
  const expressStub = {
    Router() {
      return {
        get(route, ...handlers) { captured.get[route] = wrap(handlers); },
        post(route, ...handlers) { captured.post[route] = wrap(handlers); },
        put(route, ...handlers) { captured.put[route] = wrap(handlers); },
        delete(route, ...handlers) { captured.delete[route] = wrap(handlers); },
      };
    },
  };

  const originalLoad = Module._load;
  const resolved = require.resolve(routePath, { paths: [__dirname] });
  delete require.cache[resolved];

  Module._load = function patched(request, parent, isMain) {
    if (request === 'express') {
      return expressStub;
    }
    if (request === '../db/database') {
      return { getDb: () => activeDb };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    require(routePath);
  } finally {
    Module._load = originalLoad;
  }

  function wrap(handlers) {
    return async (req, res, db) => {
      activeDb = db;
      let index = 0;
      const next = async () => {
        const handler = handlers[index++];
        if (!handler) return;
        if (handler.length >= 3) {
          return handler(req, res, next);
        }
        return handler(req, res);
      };
      await next();
    };
  }

  return captured;
}
