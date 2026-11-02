// Everything the app keeps lives in IndexedDB, so it survives closing the app and losing signal.
// If IndexedDB is refused (a private window) the app still runs, keeping things in memory until it closes.

const memory = { kv: new Map(), files: new Map(), queue: new Map() };
let memoryKey = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    let req;
    try { req = indexedDB.open('riffle', 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('kv');
      db.createObjectStore('files');
      db.createObjectStore('queue', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run(name, mode, fn) {
  return open().then(db => {
    if (!db) {
      const out = fn(null);
      return out && 'result' in out ? out.result : out;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const out = fn(tx.objectStore(name));
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

const simple = name => ({
  get: key => run(name, 'readonly', s => (s ? s.get(key) : { result: memory[name].get(key) })),
  set: (key, val) => run(name, 'readwrite', s => (s ? s.put(val, key) : void memory[name].set(key, val))),
  del: key => run(name, 'readwrite', s => (s ? s.delete(key) : void memory[name].delete(key))),
  keys: () => run(name, 'readonly', s => (s ? s.getAllKeys() : { result: [...memory[name].keys()] })),
  all: () => run(name, 'readonly', s => (s ? s.getAll() : { result: [...memory[name].values()] })),
});

const kv = simple('kv');
export const get = kv.get, set = kv.set, del = kv.del, keys = kv.keys;
export const files = simple('files');

export const queueAdd = event =>
  run('queue', 'readwrite', s => {
    if (s) return s.add(event);
    memory.queue.set(memoryKey++, event);
  });

export async function queueAll() {
  const db = await open();
  if (!db) return [...memory.queue].map(([key, event]) => ({ key, event }));
  return new Promise((resolve, reject) => {
    const out = [];
    const req = db.transaction('queue').objectStore('queue').openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) { resolve(out); return; }
      out.push({ key: c.key, event: c.value });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export const queueCount = () =>
  run('queue', 'readonly', s => (s ? s.count() : { result: memory.queue.size }));

export const queueRemove = keyList =>
  run('queue', 'readwrite', s => {
    for (const k of keyList) { if (s) s.delete(k); else memory.queue.delete(k); }
  });
