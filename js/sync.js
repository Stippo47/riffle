// The phone talks straight to GitHub. Decks come down from the private data repo, and answers go up
// as batches, each a new file, so the phone and whoever writes decks can never collide.
// Anything that stops a send ends up in status(), in plain words, for the screens to show.
import * as store from './store.js';

export const OWNER = 'Stippo47', REPO = 'riffle-data', BRANCH = 'main';
const FULL = `${OWNER}/${REPO}`;
const SEND_EVERY = 15000, MAX_BATCH = 200, KEEPALIVE_LIMIT = 40000, PULL_EVERY = 120000;
const CALL_TIMEOUT = 25000, STUCK_AFTER = 40000, STREAK_LIMIT = 3;

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

const state = {
  connected: false, waiting: 0, sending: false, sendingSince: 0,
  problem: null,      // why sending has stopped, in plain words
  noSignal: false,    // the last try couldn't reach GitHub, and that looks like just no signal
  lastTry: '',        // what the last try came to, for the settings screen
  sentAt: 0, sentCount: 0, failStreak: 0,
  pulledAt: 0, pullProblem: null,
};
const listeners = new Set();
export const status = () => ({ ...state });
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => fn(status()));

const getKey = () => store.get('gh-key');
const remember = () => store.set('send-status', { sentAt: state.sentAt, sentCount: state.sentCount, problem: state.problem, lastTry: state.lastTry });

// Every call gives up in the end. A phone can freeze a page mid-call, and a call that never
// finishes must not hold up everything after it.
async function call(path, key, { method = 'GET', body, accept = 'application/vnd.github+json', keepalive = false } = {}) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), CALL_TIMEOUT);
  try {
    return await fetch(API + path, {
      method,
      keepalive,
      signal: stop.signal,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${key}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally {
    clearTimeout(timer);
  }
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

const networkWords = e => (e && e.name === 'AbortError' ? "GitHub didn't answer in time" : `couldn't reach GitHub${e && e.message ? ` (${e.message})` : ''}`);

// Turns a refusal from GitHub into what happened and what to do. Never holds the key.
async function refusal(r) {
  let said = '';
  try { said = (await r.clone().json()).message || ''; } catch { /* no message to pass on */ }
  const quote = said ? ` GitHub said: "${said}".` : '';
  const slowed = r.status === 429 || (r.status === 403 && (/rate limit/i.test(said) || r.headers.get('retry-after') || r.headers.get('x-ratelimit-remaining') === '0'));
  if (slowed) return { text: `GitHub asked the app to slow down (${r.status}). It will try again by itself.`, retry: true };
  if (r.status === 401) return { text: `GitHub isn't accepting your key any more (401). It may have been deleted. Open the gear and connect again.`, retry: false };
  if (r.status === 403) return { text: `Your key isn't allowed to write to ${REPO} (403).${quote} On GitHub's key page, Contents has to be Read and write.`, retry: false };
  if (r.status === 404) return { text: `GitHub can't find ${REPO} with this key (404). Open the gear and connect again, with ${REPO} picked.`, retry: false };
  if (r.status >= 500) return { text: `GitHub is having trouble (${r.status}). It will try again by itself.`, retry: true };
  return { text: `GitHub refused the answers (${r.status}).${quote} It will try again by itself.`, retry: true };
}

// Checks a pasted key before keeping it. Only a key that reaches the data repo, can write to it and
// sees no other private repo gets saved. Every way this can fail says why.
export async function connect(raw) {
  const key = raw.trim();
  if (!key) return { ok: false, keepText: true, message: 'Paste the key first.' };
  try {
    const repo = await call(`/repos/${FULL}`, key);
    if (repo.status === 401) return { ok: false, message: "GitHub didn't accept that key. Copy it again, the whole thing." };
    if (repo.status === 404) return { ok: false, message: `That key can't see ${REPO}. On GitHub's page, under Repository access, choose Only select repositories and pick ${REPO}.` };
    if (!repo.ok) return { ok: false, keepText: true, message: `GitHub wouldn't check that key (${repo.status}). ${(await refusal(repo)).text}` };

    const others = await visibleOthers(key);
    if (others === null) return { ok: false, keepText: true, message: "GitHub wouldn't say what that key can see, so I didn't keep it. Try again in a minute." };
    if (others.length) {
      const names = others.slice(0, 3).join(', ');
      const n = others.length;
      return { ok: false, message: `That key works, but it can also see ${n} other private repo${n === 1 ? '' : 's'} (${names}), so I didn't keep it. Delete it on GitHub, then make a new one with only ${REPO} picked.` };
    }

    const check = JSON.stringify({ v: 1, type: 'connect-check', at: new Date().toISOString() }, null, 1);
    const put = await putFile(`answers/connect-check-${stamp()}-${rand()}.json`, check, 'Phone connected', key);
    if (!put.ok) {
      return { ok: false, message: put.status === 403 || put.status === 404
        ? `That key can read ${REPO} but can't write to it (${put.status}). On GitHub's page, set Contents to Read and write.`
        : `GitHub said no to a test write (${put.status}). ${(await refusal(put)).text}` };
    }
    await store.setSecret('gh-key', key);
    state.connected = true;
    state.problem = null;
    state.noSignal = false;
    state.failStreak = 0;
    state.lastTry = 'Connected, and a test write worked.';
    remember();
    emit();
    pull().catch(() => {});
    flush();
    return { ok: true, message: `Connected. A test write worked, and this key reaches ${REPO} and nothing else.` };
  } catch (e) {
    if (e instanceof TypeError || (e && e.name === 'AbortError')) {
      return { ok: false, keepText: true, message: `Couldn't check it: ${networkWords(e)}. Check for signal and try again.` };
    }
    return { ok: false, keepText: true, message: `Something went wrong keeping the key (${e && e.message ? e.message : 'unknown error'}). Try again.` };
  }
}

// Private repos the key can really open, other than the data repo. Null if GitHub didn't answer.
// A listed repo gets tried too, so a list that says too much can't turn away a good key.
async function visibleOthers(key) {
  const r = await call('/user/repos?per_page=100&affiliation=owner,collaborator,organization_member', key);
  if (!r.ok) return null;
  const list = (await r.json()).filter(x => x.private && x.full_name.toLowerCase() !== FULL.toLowerCase());
  const open = [];
  for (const x of list.slice(0, 5)) {
    if ((await call(`/repos/${x.full_name}`, key)).ok) open.push(x.name);
  }
  return open;
}

export async function disconnect() {
  await store.del('gh-key');
  state.connected = false;
  state.problem = null;
  state.noSignal = false;
  state.pullProblem = null;
  state.lastTry = '';
  remember();
  emit();
}

let eidCount = 0;
export const newId = () => `${Date.now().toString(36)}-${(eidCount++).toString(36)}-${rand()}`;

// The write into the backup list happens before this returns its promise, so a word queued a moment
// before the app dies is still kept.
export async function enqueue(event) {
  await store.queueAdd({ v: 1, eid: newId(), at: new Date().toISOString(), ...event });
  state.waiting = await store.queueCount();
  emit();
}

let lastAttempt = 0;
// Sends one batch. The answer says how it went, for the Send now button.
export async function flush({ hide = false } = {}) {
  if (state.sending && Date.now() - state.sendingSince < STUCK_AFTER) return { ok: false, message: 'Already sending.' };
  let key;
  try { key = await getKey(); } catch { return { ok: false, message: "Couldn't read your key on this phone just now. It tries again by itself." }; }
  if (!key) return { ok: false, message: 'Not connected yet.' };
  const items = await store.queueAll();
  state.waiting = items.length;
  if (!items.length) { emit(); return { ok: true, message: 'Nothing waiting to send.' }; }
  const batch = items.slice(0, MAX_BATCH);
  state.sending = true;
  state.sendingSince = Date.now();
  lastAttempt = Date.now();
  let out;
  try {
    const device = await deviceId();
    const text = JSON.stringify({ v: 1, device, sentAt: new Date().toISOString(), events: batch.map(i => i.event) }, null, 1);
    const n = batch.length;
    const r = await putFile(`answers/${stamp()}-${rand()}.json`, text, `${n} answer${n === 1 ? '' : 's'} from the phone`, key,
      { keepalive: hide && text.length < KEEPALIVE_LIMIT });
    if (r.ok) {
      await store.queueRemove(batch.map(i => i.key));
      state.waiting = items.length - batch.length;
      state.problem = null;
      state.noSignal = false;
      state.failStreak = 0;
      state.sentAt = Date.now();
      state.sentCount += n;
      state.lastTry = `Sent ${n} answer${n === 1 ? '' : 's'}.`;
      out = { ok: true, message: state.lastTry };
    } else {
      const why = await refusal(r);
      state.problem = why.text;
      state.noSignal = false;
      state.lastTry = why.text;
      out = { ok: false, message: why.text };
    }
  } catch (e) {
    const words = networkWords(e);
    state.failStreak++;
    state.lastTry = `Last try ${words}.`;
    // One miss is just no signal. Several while the phone says it's online is a real problem.
    if (state.failStreak >= STREAK_LIMIT && navigator.onLine !== false) {
      state.problem = `The phone seems online, but answers aren't getting through: ${words}. They're safe here and it keeps trying.`;
      state.noSignal = false;
    } else {
      state.noSignal = true;
    }
    out = { ok: false, message: `Couldn't send: ${words}. They're safe here and it keeps trying.` };
  } finally {
    state.sending = false;
    remember();
    emit();
  }
  return out;
}

async function deviceId() {
  let id = await store.get('device');
  if (!id) { id = `phone-${rand()}`; await store.set('device', id); }
  return id;
}

// Brings down whatever changed under packs/, pictures included, so the whole library works offline.
export async function pull() {
  let key;
  try { key = await getKey(); } catch { return false; }
  if (!key) return false;
  const fail = text => { state.pullProblem = text; emit(); return false; };
  let r;
  try {
    r = await call(`/repos/${FULL}/git/trees/${BRANCH}?recursive=1`, key);
  } catch (e) {
    return fail(`Couldn't check for new decks: ${networkWords(e)}.`);
  }
  if (!r.ok) return fail(`Couldn't check for new decks. ${(await refusal(r)).text}`);
  const tree = (await r.json()).tree.filter(t => t.type === 'blob' && t.path.startsWith('packs/'));
  const have = new Map((await store.files.all()).map(f => [f.path, f.sha]));
  let changed = false, missed = 0;
  for (const t of tree) {
    if (have.get(t.path) === t.sha) continue;
    try {
      const blob = await call(`/repos/${FULL}/git/blobs/${t.sha}`, key, { accept: 'application/vnd.github.raw+json' });
      if (!blob.ok) { missed++; continue; }
      const isJson = t.path.endsWith('.json');
      const data = isJson ? await blob.text() : await blob.blob();
      await store.files.set(t.path, { path: t.path, sha: t.sha, data });
      changed = true;
    } catch { missed++; }
  }
  const live = new Set(tree.map(t => t.path));
  for (const path of have.keys()) {
    if (!live.has(path)) { await store.files.del(path); changed = true; }
  }
  state.pulledAt = Date.now();
  state.pullProblem = missed ? `${missed} file${missed === 1 ? '' : 's'} didn't come down. It will try again.` : null;
  emit();
  return changed;
}

// Starts the regular sending. The app sends when it's hidden through the hide handler in app.js,
// which saves everything first.
export async function start(onLibraryChange) {
  const saved = await store.get('send-status').catch(() => null);
  if (saved) Object.assign(state, { sentAt: saved.sentAt || 0, sentCount: saved.sentCount || 0, problem: saved.problem || null, lastTry: saved.lastTry || '' });
  state.connected = !!(await getKey().catch(() => null));
  state.waiting = await store.queueCount();
  emit();
  const tryPull = () => pull().then(changed => { if (changed) onLibraryChange(); }).catch(() => {});
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !state.connected) return;
    if (state.waiting && Date.now() - lastAttempt >= SEND_EVERY) flush();
  }, 3000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') return;
    if (state.waiting && Date.now() - lastAttempt >= SEND_EVERY) flush();
    if (Date.now() - state.pulledAt > PULL_EVERY) tryPull();
  });
  addEventListener('online', () => { flush(); tryPull(); });
  if (state.connected) { flush(); tryPull(); }
  return tryPull;
}
