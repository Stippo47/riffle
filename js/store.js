// Everything the app keeps lives in IndexedDB, so it survives closing the app and losing signal.
//
// Words must not get lost, so every write first goes into a backup list in localStorage, which is
// synchronous, and leaves that list only once the database has it. A write that fails, or an app
// killed mid-write, leaves it there. On the next start recover() moves it back into the database.
// Reads see the backup first, so nothing looks unsaved in the meantime.

const WAL = 'riffle-wal:';
const NO_DB = Symbol('no database');
const OPEN_TIMEOUT = 4000;

const memoryFiles = new Map();          // pulled files, if there's no database at all
const memoryPhotos = new Map();
const memorySecrets = new Map();
const pending = new Map();              // id -> the newest write of that id not yet safely stored
const failed = new Set();
const inflight = new Set();
const listeners = new Set();
let dbPromise = null;
let seq = 0;
let trouble = null;                     // null, 'memory' or 'failing'
let troubleDetail = '';
let backupBroken = false;

export const onTrouble = fn => { listeners.add(fn); };
export const troubleNow = () => (trouble ? { kind: trouble, detail: troubleDetail, backupBroken } : null);
const setTrouble = (kind, detail = '') => {
  if (trouble === kind && troubleDetail === detail) return;
  trouble = kind;
  troubleDetail = detail;
  listeners.forEach(fn => fn());
};

function open() {
  if (dbPromise) return dbPromise;
  const attempt = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open('riffle', 2); } catch { resolve(null); return; }
    const timer = setTimeout(() => reject(new Error('the database did not open')), OPEN_TIMEOUT);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['kv', 'files', 'photos']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { autoIncrement: true });
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      // iPhones can drop the connection while the app is in the background.
      db.onclose = () => { if (dbPromise === attempt) dbPromise = null; };
      db.onversionchange = () => { db.close(); if (dbPromise === attempt) dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { clearTimeout(timer); resolve(null); };
  });
  dbPromise = attempt;
  return attempt;
}

function attempt(name, mode, fn) {
  return open().then(db => {
    if (!db) return NO_DB;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode); // throws if the connection has gone
      const out = fn(tx.objectStore(name));
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('the save was cancelled'));
    });
  });
}

// One retry on a fresh connection, because a lost connection is the usual reason for a failure.
function run(name, mode, fn) {
  return attempt(name, mode, fn).catch(() => {
    dbPromise = null;
    return attempt(name, mode, fn);
  });
}

// ---------- the backup list

function backup(item) {
  try {
    localStorage.setItem(WAL + item.id, JSON.stringify(item));
    backupBroken = false;
  } catch {
    backupBroken = true;
  }
}

function settle(item) {
  if (pending.get(item.id) === item) {
    pending.delete(item.id);
    try { localStorage.removeItem(WAL + item.id); } catch { /* it just gets stored again next start */ }
  }
  failed.delete(item);
}

function storeItem(item) {
  if (item.kind === 'queue') return run('queue', 'readwrite', s => s.add(item.event));
  return run('kv', 'readwrite', s => (item.del ? s.delete(item.key) : s.put(item.val, item.key)));
}

function push(item) {
  const p = storeItem(item).then(result => {
    if (result === NO_DB) { setTrouble('memory'); return; } // stays in the backup list
    settle(item);
    if (failed.size) retryFailed();
    else if (trouble === 'failing') setTrouble(null);
  }, e => {
    failed.add(item);
    setTrouble('failing', e && e.message ? e.message : 'unknown error');
  });
  inflight.add(p);
  p.finally(() => inflight.delete(p));
  return p;
}

let retrying = false;
function retryFailed() {
  if (retrying) return;
  retrying = true;
  const items = [...failed].filter(item => pending.get(item.id) === item);
  failed.clear();
  Promise.all(items.map(push)).finally(() => { retrying = false; });
}

function write(item) {
  item.seq = ++seq;
  backup(item);
  const old = pending.get(item.id);
  if (old) failed.delete(old);
  pending.set(item.id, item);
  return push(item);
}

const settled = () => Promise.all([...inflight]);

// Moves whatever the last run left in the backup list into the database. Call it before anything reads.
export async function recover() {
  const items = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith(WAL)) continue;
      try { items.push(JSON.parse(localStorage.getItem(k))); } catch { /* unreadable, so nothing to save */ }
    }
  } catch { return 0; }
  items.sort((a, b) => a.seq - b.seq);
  if (items.length) seq = items[items.length - 1].seq;
  let have = new Set();
  try {
    const rows = await readQueue();
    if (rows !== NO_DB) have = new Set(rows.map(r => r.event.eid));
  } catch { /* the adds below will fail too, and say so */ }
  for (const item of items) {
    pending.set(item.id, item);
    if (item.kind === 'queue' && have.has(item.event.eid)) settle(item); // the database got it before the app died
    else push(item);
  }
  await settled();
  return items.length;
}

// ---------- settings and deck states

export async function get(key) {
  const p = pending.get(`kv:${key}`);
  if (p) return p.del ? undefined : p.val;
  const v = await run('kv', 'readonly', s => s.get(key));
  if (v === NO_DB) { setTrouble('memory'); return memorySecrets.get(key); }
  return v;
}

export const set = (key, val) => write({ id: `kv:${key}`, kind: 'kv', key, val });
export const del = key => write({ id: `kv:${key}`, kind: 'kv', key, del: true });

// For the key alone: never in the backup list, and a failure is the caller's to report.
export async function setSecret(key, val) {
  const r = await run('kv', 'readwrite', s => s.put(val, key));
  if (r === NO_DB) memorySecrets.set(key, val);
}

export async function keys() {
  let stored = [];
  try {
    const r = await run('kv', 'readonly', s => s.getAllKeys());
    if (r !== NO_DB) stored = r;
  } catch { /* the backup list is still worth going through */ }
  const out = new Set(stored);
  for (const item of pending.values()) {
    if (item.kind !== 'kv') continue;
    if (item.del) out.delete(item.key); else out.add(item.key);
  }
  return [...out];
}

// ---------- pulled decks and pictures, which can always come down again

export const files = {
  get: key => run('files', 'readonly', s => s.get(key)).then(v => (v === NO_DB ? memoryFiles.get(key) : v)),
  set: (key, val) => run('files', 'readwrite', s => s.put(val, key)).then(v => { if (v === NO_DB) memoryFiles.set(key, val); }),
  del: key => run('files', 'readwrite', s => s.delete(key)).then(v => { if (v === NO_DB) memoryFiles.delete(key); }),
  all: () => run('files', 'readonly', s => s.getAll()).then(v => (v === NO_DB ? [...memoryFiles.values()] : v), () => []),
  // Just the words. There can be hundreds of pictures, and a page of tiles has no use for them.
  words: async () => {
    try {
      const keys = await run('files', 'readonly', s => s.getAllKeys());
      if (keys === NO_DB) return [...memoryFiles.values()].filter(f => f.path.endsWith('.json'));
      return (await Promise.all(keys.filter(k => k.endsWith('.json')).map(files.get))).filter(Boolean);
    } catch {
      return [];
    }
  },
};

// ---------- photos. Too big for the backup list, so a failed save tells the person straight away.

export const photos = {
  get: id => run('photos', 'readonly', s => s.get(id)).then(v => (v === NO_DB ? memoryPhotos.get(id) : v)),
  set: (id, rec) => run('photos', 'readwrite', s => s.put(rec, id)).then(v => {
    if (v === NO_DB) { memoryPhotos.set(id, rec); setTrouble('memory'); }
  }),
  del: id => run('photos', 'readwrite', s => s.delete(id)).then(v => { if (v === NO_DB) memoryPhotos.delete(id); }),
  keys: () => run('photos', 'readonly', s => s.getAllKeys()).then(v => (v === NO_DB ? [...memoryPhotos.keys()] : v)),
};

// ---------- answers waiting to send

function readQueue() {
  return run('queue', 'readonly', s => {
    const holder = { result: [] };
    const req = s.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      holder.result.push({ key: c.key, event: c.value });
      c.continue();
    };
    return holder;
  });
}

export const queueAdd = event => write({ id: `q:${event.eid}`, kind: 'queue', event });

export async function queueAll() {
  await settled();
  let rows = [];
  try {
    const r = await readQueue();
    if (r !== NO_DB) rows = r;
  } catch (e) {
    setTrouble('failing', e && e.message ? e.message : 'unknown error');
  }
  const seen = new Set(rows.map(r => r.event.eid));
  for (const item of pending.values()) {
    if (item.kind === 'queue' && !seen.has(item.event.eid)) rows.push({ key: `wal:${item.id}`, event: item.event });
  }
  return rows;
}

export const queueCount = () => queueAll().then(rows => rows.length);

export async function queueRemove(keyList) {
  const stored = [];
  for (const k of keyList) {
    if (typeof k === 'string' && k.startsWith('wal:')) {
      const item = pending.get(k.slice(4));
      if (item) settle(item);
    } else stored.push(k);
  }
  if (!stored.length) return;
  try {
    await run('queue', 'readwrite', s => { for (const k of stored) s.delete(k); });
  } catch { /* it may go twice, and readers drop repeats by eid */ }
}

// Whether the browser has promised not to clear this on its own. Null if it won't say.
export async function persisted() {
  try { return navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch { return null; }
}

// For the tests: closes the connection under the app, the way a phone can.
export async function testCloseConnection() {
  const db = await open();
  if (db) db.close();
}
