// The phone talks straight to GitHub. Decks come down from the private data repo, and answers go up
// as batches, each a new file, so the phone and whoever writes decks can never collide.
import * as store from './store.js';

export const OWNER = 'Stippo47', REPO = 'riffle-data', BRANCH = 'main';
const FULL = `${OWNER}/${REPO}`;
const SEND_EVERY = 15000, MAX_BATCH = 200, KEEPALIVE_LIMIT = 40000, PULL_EVERY = 120000;

// A local test server can stand in for GitHub, but only on this computer.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const API = (isLocal && new URLSearchParams(location.search).get('api')) || 'https://api.github.com';

export const tokenPage = () => {
  const q = new URLSearchParams({
    name: 'Riffle',
    description: 'Riffle on my phone: reads and writes riffle-data, nothing else.',
    target_name: OWNER,
    expires_in: 'none',
    contents: 'write',
  });
  return `https://github.com/settings/personal-access-tokens/new?${q}`;
};

const state = { connected: false, waiting: 0, error: null, pulledAt: 0, sending: false };
const listeners = new Set();
export const status = () => ({ ...state });
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => fn(status()));

const getKey = () => store.get('gh-key');

function call(path, key, { method = 'GET', body, accept = 'application/vnd.github+json', keepalive = false } = {}) {
  return fetch(API + path, {
    method,
    keepalive,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const toBase64 = text => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const putFile = (path, content, message, key, opts = {}) =>
  call(`/repos/${FULL}/contents/${path}`, key, {
    method: 'PUT',
    body: { message, content: toBase64(content), branch: BRANCH },
    ...opts,
  });

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const rand = () => Math.random().toString(36).slice(2, 8);

// Checks a pasted key before keeping it. Only a key that reaches the data repo, can write to it and
// sees no other private repo gets saved.
export async function connect(raw) {
  const key = raw.trim();
  if (!key) return { ok: false, message: 'Paste the key first.' };
  try {
    const repo = await call(`/repos/${FULL}`, key);
    if (repo.status === 401) return { ok: false, message: "GitHub didn't accept that key. Copy it again, the whole thing." };
    if (!repo.ok) return { ok: false, message: `That key can't see ${REPO}. On GitHub's page, under Repository access, choose Only select repositories and pick ${REPO}.` };

    const others = await visibleOthers(key);
    if (others === null) return { ok: false, message: `GitHub wouldn't say what that key can see, so I didn't keep it. Try again.` };
    if (others.length) {
      const names = others.slice(0, 3).join(', ');
      const n = others.length;
      return { ok: false, message: `That key works, but it can also see ${n} other private repo${n === 1 ? '' : 's'} (${names}), so I didn't keep it. Delete it on GitHub, then make a new one with only ${REPO} picked.` };
    }

    const check = JSON.stringify({ v: 1, type: 'connect-check', at: new Date().toISOString() }, null, 1);
    const put = await putFile(`answers/connect-check-${stamp()}-${rand()}.json`, check, 'Phone connected', key);
    if (!put.ok) {
      return { ok: false, message: put.status === 403 || put.status === 404
        ? `That key can read ${REPO} but can't write to it. On GitHub's page, set Contents to Read and write.`
        : `GitHub said no when I tried a test write (${put.status}). Try again in a minute.` };
    }
    await store.set('gh-key', key);
    state.connected = true;
    state.error = null;
    emit();
    pull().catch(() => {});
    flush();
    return { ok: true, message: `Connected. This key reaches ${REPO} and nothing else.` };
  } catch {
    return { ok: false, message: "No signal, so I couldn't check it. Try again." };
  }
}

// Private repos the key can see, other than the data repo. Null if GitHub didn't answer.
async function visibleOthers(key) {
  const r = await call('/user/repos?per_page=100&affiliation=owner,collaborator,organization_member', key);
  if (!r.ok) return null;
  const list = await r.json();
  return list.filter(x => x.private && x.full_name.toLowerCase() !== FULL.toLowerCase()).map(x => x.name);
}

export async function disconnect() {
  await store.del('gh-key');
  state.connected = false;
  state.error = null;
  emit();
}

let eidCount = 0;
export const newId = () => `${Date.now().toString(36)}-${(eidCount++).toString(36)}-${rand()}`;

export async function enqueue(event) {
  await store.queueAdd({ v: 1, eid: newId(), at: new Date().toISOString(), ...event });
  state.waiting = await store.queueCount();
  emit();
}

let lastTry = 0;
export async function flush({ hide = false } = {}) {
  if (state.sending) return;
  const key = await getKey();
  if (!key) return;
  const items = await store.queueAll();
  state.waiting = items.length;
  if (!items.length) { emit(); return; }
  const batch = items.slice(0, MAX_BATCH);
  state.sending = true;
  lastTry = Date.now();
  try {
    const device = await deviceId();
    const text = JSON.stringify({ v: 1, device, sentAt: new Date().toISOString(), events: batch.map(i => i.event) }, null, 1);
    const n = batch.length;
    const r = await putFile(`answers/${stamp()}-${rand()}.json`, text, `${n} answer${n === 1 ? '' : 's'} from the phone`, key,
      { keepalive: hide && text.length < KEEPALIVE_LIMIT });
    if (r.ok) {
      await store.queueRemove(batch.map(i => i.key));
      state.waiting = items.length - batch.length;
      state.error = null;
    } else {
      state.error = r.status === 401 || r.status === 403 ? 'key' : 'server';
    }
  } catch {
    state.error = 'offline';
  } finally {
    state.sending = false;
    emit();
  }
}

async function deviceId() {
  let id = await store.get('device');
  if (!id) { id = `phone-${rand()}`; await store.set('device', id); }
  return id;
}

// Brings down whatever changed under packs/, pictures included, so the whole library works offline.
export async function pull() {
  const key = await getKey();
  if (!key) return false;
  const r = await call(`/repos/${FULL}/git/trees/${BRANCH}?recursive=1`, key);
  if (r.status === 401 || r.status === 403) { state.error = 'key'; emit(); return false; }
  if (!r.ok) return false;
  const tree = (await r.json()).tree.filter(t => t.type === 'blob' && t.path.startsWith('packs/'));
  const have = new Map((await store.files.all()).map(f => [f.path, f.sha]));
  let changed = false;
  for (const t of tree) {
    if (have.get(t.path) === t.sha) continue;
    const blob = await call(`/repos/${FULL}/git/blobs/${t.sha}`, key, { accept: 'application/vnd.github.raw+json' });
    if (!blob.ok) continue;
    const isJson = t.path.endsWith('.json');
    const data = isJson ? await blob.text() : await blob.blob();
    await store.files.set(t.path, { path: t.path, sha: t.sha, data });
    changed = true;
  }
  const live = new Set(tree.map(t => t.path));
  for (const path of have.keys()) {
    if (!live.has(path)) { await store.files.del(path); changed = true; }
  }
  state.pulledAt = Date.now();
  emit();
  return changed;
}

// Starts the regular sending, and sends straight away when the app is hidden or signal returns.
export async function start(onLibraryChange) {
  state.connected = !!(await getKey());
  state.waiting = await store.queueCount();
  emit();
  const tryPull = () => pull().then(changed => { if (changed) onLibraryChange(); }).catch(() => {});
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !state.connected) return;
    if (state.waiting && Date.now() - lastTry >= SEND_EVERY) flush();
  }, 3000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush({ hide: true });
    else if (Date.now() - state.pulledAt > PULL_EVERY) tryPull();
  });
  addEventListener('pagehide', () => flush({ hide: true }));
  addEventListener('online', () => { flush(); tryPull(); });
  if (state.connected) { flush(); tryPull(); }
  return tryPull;
}
