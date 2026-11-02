// The screens around the deck: the packs, a pack's topics, setup and settings.
import { DEMO_PACK } from './demo.js';
import { DeckView, deckKey, deckSummary } from './deck.js';
import { confetti, esc, icon, safeIcon, tick } from './ui.js';
import * as store from './store.js';
import * as sync from './sync.js';

const VERSION = '0.1.0';
const app = document.getElementById('app');
const LOOKS = [['foil', 'Foil boosters'], ['table', 'Tabletop'], ['quiet', 'Quiet']];
const DEFAULT_LOOK = 'foil'; // the look a new install starts with

let current = null;     // the DeckView on screen, if any
let render = () => {};  // draws the current screen again
let pullNow = () => {};

// ---------- the phone itself

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const mustInstall = isIOS && !isInstalled;

// The on-screen keyboard shrinks only the visual viewport, so the app sizes itself to that.
function trackViewport() {
  const vv = window.visualViewport;
  const set = () => {
    const root = document.documentElement.style;
    root.setProperty('--vvh', `${vv ? vv.height : innerHeight}px`);
    root.setProperty('--vvt', `${vv ? vv.offsetTop : 0}px`);
  };
  set();
  if (vv) { vv.addEventListener('resize', set); vv.addEventListener('scroll', set); }
  addEventListener('resize', set);
  document.addEventListener('gesturestart', e => e.preventDefault());
}

async function setLook(look) {
  document.documentElement.dataset.look = look;
  await store.set('look', look);
}

function registerWorker() {
  if (!('serviceWorker' in navigator) || ['localhost', '127.0.0.1'].includes(location.hostname)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'activated' && navigator.serviceWorker.controller) toast('New version ready. Tap to load it.', () => location.reload());
      });
    });
  }).catch(() => {});
}

function toast(text, onTap) {
  const t = document.createElement('button');
  t.className = 'toast';
  t.textContent = text;
  t.onclick = () => { t.remove(); onTap && onTap(); };
  document.body.append(t);
}

// ---------- the library

async function library() {
  const files = await store.files.all();
  const packs = new Map();
  const json = f => { try { return JSON.parse(f.data); } catch { return null; } };
  for (const f of files) {
    const m = f.path.match(/^packs\/([^/]+)\/pack\.json$/);
    if (!m) continue;
    const p = json(f);
    if (p) packs.set(m[1], { topics: [], ...p, id: m[1], decks: [] });
  }
  for (const f of files) {
    const m = f.path.match(/^packs\/([^/]+)\/decks\/([^/]+)\.json$/);
    if (!m || !packs.has(m[1])) continue;
    const d = json(f);
    if (d && Array.isArray(d.cards)) packs.get(m[1]).decks.push({ ...d, id: m[2] });
  }
  const list = [...packs.values()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.title.localeCompare(b.title));
  list.push(DEMO_PACK);
  return list;
}

async function summaries(pack) {
  const out = new Map();
  for (const d of pack.decks) out.set(d.id, deckSummary(d, await store.get(deckKey(pack, d))));
  return out;
}

const packLeft = sums => [...sums.values()].reduce((n, s) => n + s.left, 0);

// A pack's decks grouped by topic. Misc decks sit apart at the end.
function topicsOf(pack) {
  const groups = new Map((pack.topics || []).slice().sort((a, b) => (a.order ?? 50) - (b.order ?? 50)).map(t => [t.id, { ...t, decks: [] }]));
  const misc = [];
  for (const d of pack.decks) {
    if (d.misc || !d.topic) { misc.push(d); continue; }
    if (!groups.has(d.topic)) groups.set(d.topic, { id: d.topic, title: d.topic, decks: [] });
    groups.get(d.topic).decks.push(d);
  }
  for (const g of groups.values()) g.decks.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  return { topics: [...groups.values()].filter(g => g.decks.length), misc };
}

const imagesFor = async pack => {
  const urls = new Map();
  if (pack.demo) return () => null;
  for (const f of await store.files.all()) {
    if (f.path.startsWith(`packs/${pack.id}/`) && f.data instanceof Blob) {
      urls.set(f.path.slice(`packs/${pack.id}/`.length), URL.createObjectURL(f.data));
    }
  }
  return p => urls.get(p) || null;
};

// ---------- the first screen

function statusLine(st, left) {
  const wait = st.waiting;
  if (!st.connected) return wait ? `${wait} answer${wait === 1 ? '' : 's'} kept on this phone. Connect to send them.` : 'Not connected yet. The Feel test works without it.';
  if (st.error === 'key') return 'GitHub stopped accepting your key. Open the gear to connect again.';
  if (wait) return `${wait} waiting to send${st.error === 'offline' ? ', when there is signal' : ''}.`;
  return left ? `Everything sent. ${left} card${left === 1 ? '' : 's'} waiting.` : 'Everything sent. Nothing waiting.';
}

async function showHome() {
  current = null;
  render = showHome;
  const packs = await library();
  const rows = [];
  let total = 0;
  for (const p of packs) {
    const left = packLeft(await summaries(p));
    total += left;
    const count = p.decks.reduce((n, d) => n + d.cards.length, 0);
    rows.push({ p, left, count });
  }
  const st = sync.status();
  app.innerHTML = `
    <div class="home screen scroll">
      <div class="home-head">
        <div class="apptitle">Riffle</div>
        <button class="iconbtn" data-go="settings" aria-label="Settings">${icon('settings')}</button>
      </div>
      <div class="appsub" id="statusline">${esc(statusLine(st, total))}</div>
      ${mustInstall ? `
        <div class="install">
          <b>Add Riffle to your Home Screen</b>
          <ol>
            <li>Tap Safari's Share button.</li>
            <li>Tap Add to Home Screen, then Add.</li>
            <li>Open Riffle from its new icon.</li>
          </ol>
          <span>Safari and the Home Screen app keep separate data, so connect from the icon. You can try the Feel test here first.</span>
        </div>` : ''}
      <div class="packs">
        ${rows.map(({ p, left, count }) => packTile(p, left, count)).join('')}
      </div>
    </div>`;
  app.querySelectorAll('[data-pack]').forEach(b => { b.onclick = () => showPack(b.dataset.pack); });
  app.querySelector('[data-go=settings]').onclick = showSettings;
}

function packTile(p, left, count) {
  const donePart = count ? (count - left) / count : 0;
  return `<button class="pack ${left ? '' : 'cleared'}" data-pack="${esc(p.id)}" style="--pc:${esc(p.color || '#7b8294')}">
    <div class="art">${safeIcon(p.icon) || icon('card-random')}</div>
    <div class="name">${esc(p.title)}</div>
    <div class="left">${left ? `${left} left` : 'Cleared'}</div>
    <div class="bar"><b style="width:${Math.round(donePart * 100)}%"></b></div>
  </button>`;
}

// ---------- a pack's page

async function showPack(id) {
  current = null;
  const pack = (await library()).find(p => p.id === id);
  if (!pack) { showHome(); return; }
  render = () => showPack(id);
  const sums = await summaries(pack);
  const { topics, misc } = topicsOf(pack);
  const deckRow = (d, inStack) => {
    const s = sums.get(d.id);
    return `<button class="deckrow ${s.finished ? 'finished' : ''} ${inStack ? 'instack' : ''}" data-deck="${esc(d.id)}">
      <span class="deckrow-title">${esc(d.title)}</span>
      <span class="deckrow-left">${s.finished ? (s.verdict === 'replan' ? 'Sent back' : 'Done') : s.left ? `${s.left} left` : 'At the end'}</span>
    </button>`;
  };
  const topicBlock = t => {
    const done = t.decks.filter(d => sums.get(d.id).finished).length;
    const cleared = done === t.decks.length;
    return `<section class="topic ${cleared ? 'cleared' : ''}" style="--pc:${esc(t.color || pack.color || '#7b8294')}">
      <div class="topic-head">
        <span class="topic-art">${safeIcon(t.icon) || icon('card-random')}</span>
        <span class="topic-title">${esc(t.title)}</span>
        <span class="topic-count">${cleared ? 'Cleared' : `${done} of ${t.decks.length} decks`}</span>
      </div>
      ${t.decks.map((d, i) => deckRow(d, d.stack && i > 0 && t.decks[i - 1].stack === d.stack)).join('')}
    </section>`;
  };
  app.innerHTML = `
    <div class="packpage screen scroll">
      <div class="deckbar">
        <button class="iconbtn" data-go="home" aria-label="Back">${icon('chevron-left')}</button>
        <div class="t">${esc(pack.title)}</div>
        <div class="n">${packLeft(sums)} left</div>
      </div>
      ${topics.map(topicBlock).join('')}
      ${misc.length ? `<section class="topic misc">${misc.map(d => deckRow(d, false)).join('')}</section>` : ''}
      ${pack.demo ? `<button class="ghostbtn resetbtn" data-go="reset">${icon('rotate-ccw')}Start the Feel test again</button>` : ''}
    </div>`;
  app.querySelector('[data-go=home]').onclick = showHome;
  const reset = app.querySelector('[data-go=reset]');
  if (reset) reset.onclick = async () => {
    for (const d of pack.decks) await store.del(deckKey(pack, d));
    showPack(id);
  };
  app.querySelectorAll('[data-deck]').forEach(b => { b.onclick = () => openDeck(pack, b.dataset.deck); });
}

async function openDeck(pack, deckId) {
  const deck = pack.decks.find(d => d.id === deckId);
  const images = await imagesFor(pack);
  current = new DeckView({
    host: app, pack, deck, images,
    onExit: () => { current && current.close(); showPack(pack.id); },
    onVerdict: which => afterVerdict(pack, deck, which),
  });
  render = () => {};
  await current.open();
}

// What comes after a deck: the next one in its stack, or the reward for what was just cleared.
async function afterVerdict(pack, deck, which) {
  current && current.close();
  current = null;
  const sums = await summaries(pack);
  const { topics, misc } = topicsOf(pack);
  const topic = topics.find(t => t.decks.includes(deck));
  if (which !== 'done') { showPack(pack.id); return; }
  if (topic && deck.stack) {
    const next = topic.decks.find(d => d.stack === deck.stack && !sums.get(d.id).finished);
    if (next) { openDeck(pack, next.id); return; }
  }
  const allDecks = [...topics.flatMap(t => t.decks), ...misc];
  const packDone = allDecks.every(d => sums.get(d.id).finished);
  const topicDone = topic && topic.decks.every(d => sums.get(d.id).finished);
  if (packDone) reward('pack', pack, pack.title, pack.icon, pack.color, allDecks, sums);
  else if (topicDone) reward('topic', pack, topic.title, topic.icon, topic.color || pack.color, topic.decks, sums);
  else showPack(pack.id);
}

// The bigger payoffs. A topic gets its own moment, because a busy pack may rarely be empty.
function reward(level, pack, title, iconText, color, decks, sums) {
  const cards = decks.reduce((n, d) => n + sums.get(d.id).total, 0);
  const isPack = level === 'pack';
  app.innerHTML = `
    <div class="reward screen lvl-${level}" style="--pc:${esc(color || '#9a5be0')}">
      <div class="rays"></div>
      <div class="reward-art">${safeIcon(iconText) || icon('card-random')}</div>
      <div class="reward-word">${isPack ? 'PACK CLEARED' : 'CLEARED'}</div>
      <div class="reward-title">${esc(title)}</div>
      <div class="reward-sub">${decks.length} deck${decks.length === 1 ? '' : 's'}, ${cards} card${cards === 1 ? '' : 's'}${isPack ? '. All of it.' : '.'}</div>
      <button class="primary" data-go="pack">${isPack ? 'Back to the packs' : 'Back to the pack'}</button>
    </div>`;
  app.querySelector('[data-go=pack]').onclick = () => (isPack ? showHome() : showPack(pack.id));
  confetti(app, { count: isPack ? 220 : 110, force: isPack ? 1.5 : 1.1 });
  if (isPack) setTimeout(() => confetti(app, { count: 150, force: 1.3 }), 420);
  tick();
}

// ---------- settings and connecting

async function showSettings() {
  current = null;
  render = showSettings;
  const look = document.documentElement.dataset.look;
  const st = sync.status();
  app.innerHTML = `
    <div class="settings screen scroll">
      <div class="deckbar">
        <button class="iconbtn" data-go="home" aria-label="Back">${icon('chevron-left')}</button>
        <div class="t">Settings</div>
      </div>
      <div class="set-title">Look</div>
      <div class="lookpick">
        ${LOOKS.map(([id, name]) => `<button data-look-pick="${id}" class="${id === look ? 'on' : ''}">${esc(name)}</button>`).join('')}
      </div>
      <div class="set-title">Sending answers</div>
      <div class="set-text">${st.connected ? `Connected to ${esc(sync.REPO)}. ${st.waiting ? `${st.waiting} waiting to send.` : 'Everything sent.'}` : 'Not connected. Answers stay on this phone until you connect.'}</div>
      ${st.connected
        ? `<div class="set-row"><button class="secondary" data-go="sync">${icon('refresh-cw')}Check for new decks</button><button class="ghostbtn" data-go="disconnect">Disconnect</button></div>`
        : `<button class="primary" data-go="connect">${icon('link')}Connect</button>`}
      <div class="set-title">Credits</div>
      <div class="set-text small">Pack and deck icons from game-icons.net by Lorc, Quoting and Faithtoken, CC BY 3.0. Button icons from Lucide, ISC licence.</div>
      <div class="set-text small">Riffle ${VERSION}</div>
    </div>`;
  app.querySelector('[data-go=home]').onclick = showHome;
  app.querySelectorAll('[data-look-pick]').forEach(b => {
    b.onclick = async () => { await setLook(b.dataset.lookPick); showSettings(); };
  });
  const on = (name, fn) => { const b = app.querySelector(`[data-go=${name}]`); if (b) b.onclick = fn; };
  on('connect', showConnect);
  on('sync', () => { sync.flush(); pullNow(); showHome(); });
  on('disconnect', async () => { await sync.disconnect(); showSettings(); });
}

function showConnect() {
  current = null;
  render = () => {};
  app.innerHTML = `
    <div class="settings screen scroll">
      <div class="deckbar">
        <button class="iconbtn" data-go="back" aria-label="Back">${icon('chevron-left')}</button>
        <div class="t">Connect</div>
      </div>
      ${mustInstall ? `<div class="install"><b>Do this from the Home Screen icon</b><span>A key pasted here in Safari won't carry over to the app. Add Riffle to your Home Screen first, then open it from there.</span></div>` : ''}
      <div class="set-text">This lets the phone send your answers. The key only reaches ${esc(sync.REPO)}. It takes about a minute, and you only do it once.</div>
      <ol class="steps">
        <li><a class="primary linkbtn" href="${esc(sync.tokenPage())}" target="_blank" rel="noopener">${icon('link')}Open GitHub's key page</a></li>
        <li>Sign in if it asks. Everything is filled in except one thing: under <b>Repository access</b>, tap <b>Only select repositories</b> and pick <b>${esc(sync.REPO)}</b>.</li>
        <li>Tap <b>Generate token</b>, then copy it.</li>
        <li>Come back here and paste it below.</li>
      </ol>
      <textarea id="key" class="keybox" rows="3" placeholder="Paste the key here" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>
      <button class="primary" id="check">Check it and connect</button>
      <div class="connect-result" id="result"></div>
    </div>`;
  app.querySelector('[data-go=back]').onclick = showSettings;
  const box = app.querySelector('#key'), out = app.querySelector('#result'), btn = app.querySelector('#check');
  btn.onclick = async () => {
    btn.disabled = true;
    out.className = 'connect-result';
    out.textContent = 'Checking…';
    const r = await sync.connect(box.value);
    btn.disabled = false;
    box.value = '';
    out.className = `connect-result ${r.ok ? 'good' : 'bad'}`;
    out.textContent = r.message;
    if (r.ok) setTimeout(showHome, 1400);
  };
}

// ---------- start

async function start() {
  trackViewport();
  await setLook((await store.get('look')) || DEFAULT_LOOK);
  navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {});
  sync.onChange(st => {
    const line = document.getElementById('statusline');
    if (line) library().then(async packs => {
      let left = 0;
      for (const p of packs) left += packLeft(await summaries(p));
      const again = document.getElementById('statusline');
      if (again) again.textContent = statusLine(st, left);
    });
  });
  await showHome();
  pullNow = await sync.start(() => render());
  registerWorker();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && current) current.saveNow();
  });
}

start();

// For the tests in tests/, on a local test server only.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  window.__riffle = { get current() { return current; }, showHome, showPack, showConnect, showSettings, sync, store };
}
