/* ════════════════════════════════════════════════════════════════════════
   Firestore falso para os testes das funções serverless (api/*).

   Superfície igual à parte da Admin SDK que o código usa:
     db.collection('users').doc(uid)          → doc raiz (também serve de ref)
       .collection(nome).doc(id)              → ref de documento
       .collection(nome).get()                → { docs: [{ id, data(), ref }] }
     db.batch() → { set, delete, commit }

   O batch só APLICA no commit() — é o que permite testar que uma falha a
   meio não deixa escritas penduradas.
   ════════════════════════════════════════════════════════════════════════ */

export function makeFakeDb(seed = {}) {
  const cols = {};
  const known = new Set(['positions', 't212Log', ...Object.keys(seed).filter((k) => k !== 'root')]);
  known.forEach((k) => {
    cols[k] = new Map();
  });
  Object.entries(seed).forEach(([key, rows]) => {
    if (key === 'root') return;
    (rows || []).forEach((r) => cols[key].set(r.id, r));
  });
  const store = { root: { ...(seed.root || {}) }, cols };

  let commits = 0;
  const ref = (col, id) => ({ __col: col, __id: id });
  const colOf = (name) => {
    if (!store.cols[name]) store.cols[name] = new Map();
    return store.cols[name];
  };

  const userRef = {
    __col: 'users',
    __id: 'user',
    collection: (name) => ({
      doc: (id) => ref(name, id),
      get: async () => ({
        docs: [...colOf(name).entries()].map(([id, data]) => ({ id, data: () => data, ref: ref(name, id) })),
      }),
    }),
    get: async () => ({ exists: true, data: () => store.root }),
  };

  const apply = (op) => {
    if (op.kind === 'set' && op.col === 'users') Object.assign(store.root, op.data);
    else if (op.kind === 'set') colOf(op.col).set(op.id, { ...(colOf(op.col).get(op.id) || {}), ...op.data });
    else if (op.kind === 'delete') colOf(op.col).delete(op.id);
  };

  // seed.users = [{ id, ...campos do doc raiz }] — só para quem precisa de
  // varrer a coleção (o cron). db.collection('users').doc(uid) continua a
  // devolver o doc raiz único.
  const db = {
    collection: (name) => ({
      doc: (id) => (name === 'users' ? userRef : ref(name, id)),
      get: async () => ({
        docs: [...colOf(name).entries()].map(([id, data]) => ({ id, data: () => data, ref: ref(name, id) })),
      }),
    }),
    batch: () => {
      const buffered = [];
      return {
        set: (r, data) => buffered.push({ kind: 'set', col: r.__col, id: r.__id, data }),
        delete: (r) => buffered.push({ kind: 'delete', col: r.__col, id: r.__id }),
        commit: async () => {
          commits++;
          buffered.forEach(apply);
          buffered.length = 0;
        },
      };
    },
  };

  return {
    db,
    root: () => store.root,
    rows: (name) => [...colOf(name).values()],
    positions: () => [...colOf('positions').values()],
    readings: () => [...colOf('t212Log').values()],
    commits: () => commits,
  };
}

// Resposta com a forma que o fetch devolve (ok/status/headers/text).
export function fakeResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

// fetch falso que responde consoante o path da API da Trading212.
export function fakeT212Fetch({ summary, positions, status = 200 } = {}) {
  return async (url) => {
    const body = String(url).includes('/account/summary') ? summary : positions;
    return fakeResponse(status, body === undefined ? {} : body);
  };
}
