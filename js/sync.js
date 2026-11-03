// The phone talks straight to GitHub. Decks come down from the private data repo, and answers go up
// as batches, each a new file, so the phone and whoever writes decks can never collide.
// Anything that stops a send ends up in status(), in plain words, for the screens to show.
import * as store from './store.js';

export const OWNER = 'Stippo47', REPO = 'riffle-data', BRANCH = 'main';
const FULL = `${OWNER}/${REPO}`;
const SEND_EVERY = 15000, MAX_BATCH = 200, KEEPALIVE_LIMIT = 40000, PULL_EVERY = 30000;
const PICTURE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const CALL_TIMEOUT = 25000, STUCK_AFTER = 40000, STREAK_LIMIT = 3;
const PHOTO_TIMEOUT = 120000, PHOTO_KEEP_DAYS = 30, PICTURE_TIMEOUT = 60000;

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

export const photoPath = id => `answers/img/${id}.jpg`;
const photoIdOf = path => path.replace(/^answers\/img\//, '').replace(/\.jpg$/, '');
const DUE = 'photo-due:';

const state = {
  photosWaiting: 0, photoProblem: null, readAt: 0,
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
async function call(path, key, { method = 'GET', body, accept = 'application/vnd.github+json', keepalive = false, timeout = CALL_TIMEOUT } = {}) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeout);
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

const toBase64 = data => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
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
  const pictures = (event.images || []).map(photoIdOf);
  for (const id of pictures) store.set(`${DUE}${id}`, true);
  const queued = store.queueAdd({ v: 1, eid: newId(), at: new Date().toISOString(), ...event });
  if (pictures.length) setTimeout(flushPhotos, 300); // they go by themselves, and the words don't wait for them
  await queued;
  state.waiting = await store.queueCount();
  if (pictures.length) state.photosWaiting = await countDue();
  emit();
}

const countDue = async () => (await store.keys()).filter(k => k.startsWith(DUE)).length;

let photosSince = 0;
let lastPhotoAttempt = 0;
// Uploads pictures one at a time, apart from the text. A picture that didn't go waits and tries again.
export async function flushPhotos() {
  if (photosSince && Date.now() - photosSince < PHOTO_TIMEOUT + 30000) return;
  let key;
  try { key = await getKey(); } catch { return; }
  if (!key) return;
  const due = (await store.keys()).filter(k => k.startsWith(DUE)).map(k => k.slice(DUE.length));
  state.photosWaiting = due.length;
  if (!due.length) { emit(); return; }
  photosSince = Date.now();
  lastPhotoAttempt = Date.now();
  emit();
  try {
    for (const id of due) {
      const rec = await store.photos.get(id);
      if (!rec) { store.del(`${DUE}${id}`); continue; } // nothing left to send
      const r = await putFile(photoPath(id), rec.bytes, 'A picture from the phone', key, { timeout: PHOTO_TIMEOUT });
      // A file that's already there means an earlier try landed, and its answer never reached the phone.
      if (r.ok || r.status === 422) {
        store.del(`${DUE}${id}`);
        await store.photos.set(id, { ...rec, uploaded: true });
        state.photoProblem = null;
        state.photosWaiting = Math.max(0, state.photosWaiting - 1);
        emit();
      } else {
        const why = await refusal(r);
        state.photoProblem = `A picture didn't send. ${why.text}`;
        break;
      }
    }
  } catch {
    // No signal. Nothing to report beyond the count, and it tries again.
  } finally {
    photosSince = 0;
    state.photosWaiting = await countDue().catch(() => state.photosWaiting);
    emit();
  }
}

// Pictures already sent don't need to stay on the phone for ever.
async function purgeOldPhotos() {
  const cutoff = Date.now() - PHOTO_KEEP_DAYS * 86400000;
  for (const id of await store.photos.keys()) {
    if (parseInt(id.split('-')[0], 36) > cutoff) continue;
    const rec = await store.photos.get(id);
    if (rec && rec.uploaded) await store.photos.del(id);
  }
}

export const connected = async () => !!(await getKey().catch(() => null));

// Writes a small record for the writer's machine: a new file each time, like answers.
export async function writeRecord(folder, record, message) {
  const key = await getKey();
  if (!key) return { ok: false, message: 'not connected' };
  try {
    const device = await deviceId();
    const text = JSON.stringify({ v: 1, device, at: new Date().toISOString(), ...record }, null, 1);
    const r = await putFile(`${folder}/${stamp()}-${device}.json`, text, message, key);
    return r.ok ? { ok: true } : { ok: false, message: (await refusal(r)).text };
  } catch (e) {
    return { ok: false, message: networkWords(e) };
  }
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

export async function eachAtOnce(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) await fn(list[i++]);
  }));
}

// A picture's name in the repo, where it was last seen. A board's full pictures come down one at a
// time, when they're looked at, so this is how they're found.
let fileIndex = null;
async function shaOf(path) {
  if (!fileIndex) fileIndex = (await store.get('file-index').catch(() => null)) || {};
  return fileIndex[path];
}

// Brings one file down and keeps it. Two asking for the same file share one download.
const fetching = new Map();
const pictureUrls = new Map();
function fetchFile(path, sha, key) {
  if (fetching.has(path)) return fetching.get(path);
  const job = (async () => {
    const blob = await call(`/repos/${FULL}/git/blobs/${sha}`, key, { accept: 'application/vnd.github.raw+json', timeout: PICTURE_TIMEOUT });
    if (!blob.ok) throw new Error(String(blob.status));
    // GitHub labels raw files as its own type, so a picture gets its real one back.
    const data = path.endsWith('.json') ? await blob.text() : new Blob([await blob.arrayBuffer()], { type: PICTURE_TYPES[path.split('.').pop().toLowerCase()] || 'application/octet-stream' });
    const rec = { path, sha, data };
    await store.files.set(path, rec);
    pictureUrls.delete(path);
    return rec;
  })().finally(() => fetching.delete(path));
  fetching.set(path, job);
  return job;
}

// A picture's address on this phone, from a path in a pack. With `get` false it won't use the network.
// Null if it isn't here and can't be fetched just now.
export async function pictureUrl(packId, rel, { get = true } = {}) {
  if (!rel) return null;
  if (rel.startsWith('data:')) return rel;
  const path = `packs/${packId}/${rel}`;
  if (pictureUrls.has(path)) return pictureUrls.get(path);
  let rec = await store.files.get(path).catch(() => null);
  if (!rec && get) {
    try {
      const [key, sha] = [await getKey(), await shaOf(path)];
      if (key && sha) rec = await fetchFile(path, sha, key);
    } catch { /* no signal: the caller says so */ }
  }
  if (!rec || !(rec.data instanceof Blob)) return null;
  const url = URL.createObjectURL(rec.data);
  pictureUrls.set(path, url);
  return url;
}

// The full pictures of every board. These wait until they're looked at, unless a plain card uses one too.
async function boardPictures() {
  const out = new Set(), onCards = new Set();
  for (const f of await store.files.words()) {
    const m = f.path.match(/^packs\/([^/]+)\/decks\/[^/]+\.json$/);
    if (!m) continue;
    try {
      for (const c of JSON.parse(f.data).cards || []) {
        for (const it of c.items || []) if (it.image) out.add(`packs/${m[1]}/${it.image}`);
        for (const p of [...(c.images || []), ...(c.options || []).map(o => o.image)]) if (p) onCards.add(`packs/${m[1]}/${p}`);
      }
    } catch { /* a broken file is the deck's own problem */ }
  }
  for (const p of onCards) out.delete(p);
  return out;
}

// Brings down whatever changed under packs/: the words first, so new decks show straight away, then
// small pictures, then big ones, so a big board never holds anything up. Card pictures all come down,
// so they work offline. A board's full pictures don't, because they could be a lot of data.
// Says whether any words changed, and tells `onWords` as soon as they have.
export async function pull(onWords = () => {}) {
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
  const tree = (await r.json()).tree.filter(t => t.type === 'blob' && (t.path.startsWith('packs/') || t.path === 'read.json'));
  fileIndex = Object.fromEntries(tree.map(t => [t.path, t.sha]));
  store.set('file-index', fileIndex);
  const have = new Map((await store.files.all()).map(f => [f.path, f.sha]));
  const todo = tree.filter(t => have.get(t.path) !== t.sha);
  let changed = false, missed = 0;
  const bring = async t => {
    try { await fetchFile(t.path, t.sha, key); changed = true; } catch { missed++; }
  };
  await eachAtOnce(todo.filter(t => t.path.endsWith('.json')), 6, bring);
  const live = new Set(tree.map(t => t.path));
  for (const path of have.keys()) {
    if (!live.has(path)) { await store.files.del(path); changed = true; }
  }
  const words = changed;
  if (words) onWords();
  const pictures = todo.filter(t => !t.path.endsWith('.json'));
  await eachAtOnce(pictures.filter(t => t.path.includes('/img/thumb/')), 6, bring);
  const later = await boardPictures();
  for (const t of pictures) {
    if (later.has(t.path) && have.has(t.path)) { await store.files.del(t.path); pictureUrls.delete(t.path); } // it changed, so it comes again when looked at
  }
  await eachAtOnce(pictures.filter(t => !t.path.includes('/img/thumb/') && !later.has(t.path)), 3, bring);
  await readWhen();
  state.pulledAt = Date.now();
  state.pullProblem = missed ? `${missed} file${missed === 1 ? '' : 's'} didn't come down. It will try again.` : null;
  emit();
  return words;
}

// When the writer last read the answers, from the note they leave in the repo.
async function readWhen() {
  const f = await store.files.get('read.json').catch(() => null);
  if (!f) { state.readAt = 0; return; }
  try {
    const times = Object.entries(JSON.parse(f.data).packs || {}).filter(([pack]) => pack !== 'feel-test').map(([, p]) => Date.parse(p.at) || 0);
    state.readAt = times.length ? Math.max(...times) : 0;
  } catch { state.readAt = 0; }
}

// Starts the regular sending. The app sends when it's hidden through the hide handler in app.js,
// which saves everything first.
export async function start(onLibraryChange) {
  const saved = await store.get('send-status').catch(() => null);
  if (saved) Object.assign(state, { sentAt: saved.sentAt || 0, sentCount: saved.sentCount || 0, problem: saved.problem || null, lastTry: saved.lastTry || '' });
  state.connected = !!(await getKey().catch(() => null));
  state.waiting = await store.queueCount();
  state.photosWaiting = await countDue().catch(() => 0);
  await readWhen();
  purgeOldPhotos().catch(() => {});
  emit();
  const tryPull = () => pull(onLibraryChange).catch(() => {});
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !state.connected) return;
    if (state.waiting && Date.now() - lastAttempt >= SEND_EVERY) flush();
    if (state.photosWaiting && Date.now() - lastPhotoAttempt >= SEND_EVERY) flushPhotos();
  }, 3000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') return;
    if (state.waiting && Date.now() - lastAttempt >= SEND_EVERY) flush();
    flushPhotos();
    if (Date.now() - state.pulledAt > PULL_EVERY) tryPull();
  });
  addEventListener('online', () => { flush(); flushPhotos(); tryPull(); });
  if (state.connected) { flush(); flushPhotos(); tryPull(); }
  return tryPull;
}
