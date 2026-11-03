// The screens around the deck: the packs, a pack's topics, style, settings and connecting.
import { DEMO_PACK } from './demo.js';
import { DeckView, archiveWords, cardHTML, deckKey, deckSummary, markHTML, queueUnsentWords, sendWords, toolsHTML, wordsIn } from './deck.js';
import { ThoughtsView, thoughtCount } from './thoughts.js';
import { DEFAULT_DIRS, MEANING, confetti, esc, getDirs, icon, paintNotices, safeIcon, setDirs, setNotice, tick } from './ui.js';
import * as store from './store.js';
import * as sync from './sync.js';
import * as push from './push.js';
import { countWords } from './photos.js';

const VERSION = '0.4.1';
const app = document.getElementById('app');

// Layout and look are two separate choices. To change what a new install starts with, change these.
const DEFAULT_LAYOUT = 'rows';
const DEFAULT_LOOK = 'plain';
const DEFAULT_MARK = 'word';
const LAYOUTS = [
  { id: 'rows', name: 'Two rows', says: 'Title, then the labelled buttons, then the card.', home: 'edge', decks: 'tiles' },
  { id: 'one', name: 'One line', says: 'Title and icons share a row. The most room for the card.', home: 'list', decks: 'list' },
  { id: 'story', name: 'Full screen', says: 'The card is the whole screen, in its importance colour.', home: 'banners', decks: 'banners' },
  { id: 'under', name: 'Row under the card', says: 'The alternative to a top row: buttons near your thumb.', home: 'list', decks: 'list' },
];
const LOOKS = [
  { id: 'plain', name: 'Plain dark' },
  { id: 'paper', name: 'Paper' },
  { id: 'table', name: 'Tabletop' },
  { id: 'foil', name: 'Foil' },
  { id: 'inventory', name: 'Inventory' },
];

const MARKS = [
  { id: 'word', name: 'Edge word', says: 'A small plain word at the edge the card is heading for.' },
  { id: 'icon', name: 'Icon', says: 'A round icon at that edge.' },
  { id: 'colour', name: 'Colour only', says: 'Just the glow.' },
  { id: 'stamp', name: 'Stamp', says: 'A big stamp on the card.' },
];

let current = null;     // the view on screen that holds typed words, if any
let render = () => {};  // draws the current screen again
let pullNow = () => {};
let updateReady = false;
const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);

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
  // On a local test server only: pretend to have an iPhone's safe areas, to check the true spacing.
  const fake = isLocalHost && new URLSearchParams(location.search).get('insets');
  if (fake) {
    const [top, bottom] = fake.split(',');
    document.documentElement.style.setProperty('--sat', `${top}px`);
    document.documentElement.style.setProperty('--sab', `${bottom}px`);
  }
}

// ---------- style

const layoutOf = id => LAYOUTS.find(l => l.id === id) || LAYOUTS[0];

async function setStyle({ layout, look, mark }) {
  const root = document.documentElement;
  if (mark) {
    root.dataset.mark = mark;
    store.set('style-mark', mark);
  }
  if (layout) {
    root.dataset.layout = layout;
    root.dataset.home = layoutOf(layout).home;
    root.dataset.decks = layoutOf(layout).decks;
    await store.set('style-layout', layout);
  }
  if (look) {
    root.dataset.look = look;
    await store.set('style-look', look);
  }
  // Read before the first paint by the script at the top of index.html, so a look doesn't flash.
  try { localStorage.setItem('riffle-style', JSON.stringify({ layout: root.dataset.layout, home: root.dataset.home, decks: root.dataset.decks, look: root.dataset.look, mark: root.dataset.mark })); } catch { /* it just flashes */ }
}

function sampleHome() {
  const packs = [['Project one', 'poker-hand', '#2f8fe0', 12, .4], ['Project two', 'card-pickup', '#d9622b', 30, .2], ['Odds and ends', 'card-random', '#2fa56f', 4, .7]];
  return `<div class="home screen">
    <div class="home-head"><div class="apptitle">Riffle</div><span class="iconbtn">${icon('settings')}</span></div>
    <div class="appsub">Everything sent. 46 cards waiting.</div>
    <div class="packs">${packs.map(([name, ic, color, left, part]) => packTile({ id: name, title: name, icon: ic, color }, left, Math.round(left / (1 - part)))).join('')}</div>
  </div>`;
}

function sampleDeck() {
  const card = { kind: 'question', rarity: 'common', text: 'Is this the layout you want?', why: 'Tap the choices below and this changes straight away.', pick: 'Try each with the looks.' };
  const word = 'GO';
  return `<div class="deck screen">
    <div class="topline">
      <div class="deckbar"><span class="iconbtn">${icon('chevron-left')}</span><div class="t">Sample deck</div><div class="n">3 / 8</div></div>
      ${toolsHTML(false)}
    </div>
    <div class="progress"><b style="width:38%"></b></div>
    <div class="tablewrap"><div class="table">
      <div class="glow" data-dir="right" data-act="right" style="opacity:.85"></div>
      <div class="card common" data-pos="2" style="z-index:8">${cardHTML({ text: '' })}</div>
      <div class="card common" data-pos="1" style="z-index:9">${cardHTML({ text: '' })}</div>
      <div class="card common pv-moving" data-pos="0" style="z-index:10">${cardHTML(card).replace('<div class="stamp"></div>', `<div class="stamp armed" data-dir="right" data-act="right" style="opacity:1">${word}</div>`)}</div>
    </div>${markHTML('').replace('<span class="mark-word"></span>', `<span class="mark-word">${word}</span>`).replace('<span class="mark-icon"></span>', `<span class="mark-icon">${icon('check')}</span>`).replace('class="edgemark"', 'class="edgemark armed" data-at="right" data-act="right" style="opacity:1"')}</div>
  </div>`;
}

function showStyle() {
  current = null;
  render = () => {};
  const root = document.documentElement;
  app.innerHTML = `
    <div class="settings stylepage screen scroll">
      <div class="deckbar">
        <button class="iconbtn" data-go="back" aria-label="Back">${icon('chevron-left')}</button>
        <div class="t">Style</div>
      </div>
      <div class="preview" id="preview">
        <div class="pvbox"><div class="pvphone">${sampleDeck()}</div></div>
        <div class="pvbox"><div class="pvphone">${sampleHome()}</div></div>
      </div>
      <div class="set-title">Layout</div>
      <div class="choices layouts">
        ${LAYOUTS.map(l => `<button data-layout-pick="${l.id}"><i class="mini mini-${l.id}"><b></b><u></u></i><span><strong>${esc(l.name)}</strong><small>${esc(l.says)}</small></span></button>`).join('')}
      </div>
      <div class="set-title">Look</div>
      <div class="choices looks">
        ${LOOKS.map(l => `<button data-look-pick="${l.id}"><i class="swatch" data-look="${l.id}"><b></b></i><strong>${esc(l.name)}</strong></button>`).join('')}
      </div>
      <div class="set-title">While swiping</div>
      <div class="choices marks">
        ${MARKS.map(m => `<button data-mark-pick="${m.id}"><span><strong>${esc(m.name)}</strong><small>${esc(m.says)}</small></span></button>`).join('')}
      </div>
    </div>`;
  const size = () => {
    const box = app.querySelector('.pvbox');
    if (box) app.querySelector('#preview').style.setProperty('--pvs', box.clientWidth / 390);
  };
  size();
  const mark = () => {
    app.querySelectorAll('[data-layout-pick]').forEach(b => b.classList.toggle('on', b.dataset.layoutPick === root.dataset.layout));
    app.querySelectorAll('[data-look-pick]').forEach(b => b.classList.toggle('on', b.dataset.lookPick === root.dataset.look));
    app.querySelectorAll('[data-mark-pick]').forEach(b => b.classList.toggle('on', b.dataset.markPick === root.dataset.mark));
  };
  mark();
  app.querySelector('[data-go=back]').onclick = showSettings;
  app.querySelectorAll('[data-layout-pick]').forEach(b => { b.onclick = async () => { await setStyle({ layout: b.dataset.layoutPick }); mark(); }; });
  app.querySelectorAll('[data-look-pick]').forEach(b => { b.onclick = async () => { await setStyle({ look: b.dataset.lookPick }); mark(); }; });
  app.querySelectorAll('[data-mark-pick]').forEach(b => { b.onclick = async () => { await setStyle({ mark: b.dataset.markPick }); mark(); }; });
}

// ---------- swipe directions

// A plus-shaped picture of what each way of swiping does. Tap two to swap them.
function showDirections() {
  current = null;
  render = () => {};
  let picked = null;
  const draw = () => {
    const map = getDirs();
    const same = Object.keys(DEFAULT_DIRS).every(k => map[k] === DEFAULT_DIRS[k]);
    const cell = phys => `<button class="dir ${phys}${picked === phys ? ' on' : ''}" data-phys="${phys}" data-act="${map[phys]}"><small>Swipe ${phys}</small><strong>${esc(MEANING[map[phys]])}</strong></button>`;
    app.innerHTML = `
      <div class="settings screen scroll">
        <div class="deckbar">
          <button class="iconbtn" data-go="back" aria-label="Back">${icon('chevron-left')}</button>
          <div class="t">Swipe directions</div>
        </div>
        <div class="set-text">${picked ? 'Now tap the one to swap it with.' : 'Tap two to swap what they do.'}</div>
        <div class="dirplus">
          ${cell('up')}${cell('left')}<div class="dircentre">${icon('arrow-left-right')}</div>${cell('right')}${cell('down')}
        </div>
        <button class="secondary" data-go="reset-dirs" ${same ? 'disabled' : ''}>${icon('rotate-ccw')}Reset</button>
        <div class="set-text small dirnote">Answers record what you meant, not which way you swiped, so swapping these can't be misread.</div>
      </div>`;
    app.querySelector('[data-go=back]').onclick = showSettings;
    app.querySelector('[data-go=reset-dirs]').onclick = () => { setDirs(DEFAULT_DIRS); store.set('swipe-dirs', getDirs()); picked = null; draw(); };
    app.querySelectorAll('[data-phys]').forEach(b => {
      b.onclick = () => {
        const phys = b.dataset.phys;
        if (!picked || picked === phys) { picked = picked === phys ? null : phys; draw(); return; }
        const m = getDirs();
        [m[picked], m[phys]] = [m[phys], m[picked]];
        setDirs(m);
        store.set('swipe-dirs', m);
        picked = null;
        draw();
        tick();
      };
    });
  };
  draw();
}

function registerWorker() {
  // On a local test server only with ?sw, so a working copy doesn't get stuck behind its own cache.
  if (!('serviceWorker' in navigator) || (isLocalHost && !new URLSearchParams(location.search).has('sw'))) return;
  const hadOne = !!navigator.serviceWorker.controller; // a first install has nothing to update from
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'activated' && hadOne) markUpdate();
      });
    });
    // Ask outright, on every open and every return. Phones can otherwise be slow to notice a new release.
    const check = () => reg.update().catch(() => {});
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(() => {});
}

// A new version waits for a tap, told about in the title line. Nothing floats over the screen.
function markUpdate() {
  updateReady = true;
  refreshNotice();
  refreshStatusLine();
}

function troubleWords(t) {
  if (t.kind === 'memory') return "Not saving on this phone. This looks like a private window, or storage is blocked, so nothing here survives closing. Copy anything you've written before you leave.";
  const kept = t.backupBroken ? "and the backup is failing too, so copy anything you've written" : 'so your words are in a backup, and they move back as soon as it can';
  return `Not saving on this phone. It refused the last save (${t.detail}), ${kept}. Closing and reopening Riffle usually fixes it.`;
}

function refreshNotice() {
  const st = sync.status();
  if (store.troubleNow()) setNotice({ text: 'Not saving on this phone', act: showSettings });
  else if (st.problem) setNotice({ text: 'Not sending · tap', act: showSettings });
  else if (updateReady) setNotice({ text: 'Update ready · tap', act: () => location.reload() });
  else setNotice(null);
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
  for (const f of files) {
    const m = f.path.match(/^packs\/([^/]+)\/thoughts\.json$/);
    if (m && packs.has(m[1])) packs.get(m[1]).thoughtAnswers = json(f) || {};
  }
  const list = [...packs.values()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.title.localeCompare(b.title));
  list.push(DEMO_PACK);
  return list;
}

async function summaries(pack) {
  const out = new Map();
  for (const d of pack.decks) out.set(d.id, deckSummary(d, await store.get(deckKey(pack, d)).catch(() => null)));
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
  const t = store.troubleNow();
  if (t) return troubleWords(t);
  if (st.problem) return st.problem;
  if (updateReady) return 'New version ready. Tap here to load it.';
  if (!st.connected) return st.waiting ? `${st.waiting} answer${st.waiting === 1 ? '' : 's'} kept on this phone. Connect to send them.` : 'Not connected yet. The Feel test works without it.';
  if (st.photoProblem) return st.photoProblem;
  if (st.waiting) return `${st.waiting} waiting to send${st.noSignal ? ', when there is signal' : ''}.`;
  if (st.photosWaiting) return `${countWords(st.photosWaiting)} waiting to send.`;
  return left ? `Everything sent. ${left} card${left === 1 ? '' : 's'} waiting.` : 'Everything sent. Nothing waiting.';
}

async function refreshStatusLine() {
  const line = document.getElementById('statusline');
  if (!line) return;
  let left = 0;
  for (const p of await library()) left += packLeft(await summaries(p));
  const again = document.getElementById('statusline');
  if (!again) return;
  const st = sync.status();
  again.textContent = statusLine(st, left);
  const bad = st.problem || st.photoProblem || store.troubleNow();
  again.classList.toggle('is-problem', !!bad);
  again.onclick = bad ? showSettings : updateReady ? () => location.reload() : null;
}

async function showHome() {
  current = null;
  render = showHome;
  const packs = await library();
  const rows = [];
  let owed = 0;
  for (const p of packs) {
    const sums = await summaries(p);
    const all = [...sums.values()];
    if (!p.demo) owed += packLeft(sums);
    rows.push({
      p, left: packLeft(sums),
      count: all.reduce((n, s) => n + s.total, 0),
      big: all.reduce((n, s) => n + s.big, 0),
    });
  }
  app.innerHTML = `
    <div class="home screen scroll">
      <div class="home-head">
        <div class="apptitle">Riffle</div>
        <button class="iconbtn" data-go="settings" aria-label="Settings">${icon('settings')}</button>
      </div>
      <div class="appsub" id="statusline"></div>
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
        ${rows.map(({ p, left, count, big }) => packTile(p, left, count, big)).join('')}
      </div>
    </div>`;
  app.querySelectorAll('[data-pack]').forEach(b => { b.onclick = () => showPack(b.dataset.pack); });
  app.querySelector('[data-go=settings]').onclick = showSettings;
  push.setBadge(owed).catch(() => {});
  await refreshStatusLine();
}

function packTile(p, left, count, big = 0) {
  const donePart = count ? (count - left) / count : 0;
  return `<button class="pack ${left ? '' : 'cleared'}" data-pack="${esc(p.id)}" style="--pc:${esc(p.color || '#7b8294')}">
    <div class="art">${safeIcon(p.icon) || icon('card-random')}</div>
    <div class="name">${esc(p.title)}</div>
    ${big ? `<div class="big">${big} big</div>` : ''}
    <div class="left">${left ? `${left} left` : 'Cleared'}${big ? `<span class="bigcount"> · ${big} big</span>` : ''}</div>
    <div class="bar"><b style="width:${Math.round(donePart * 100)}%"></b></div>
  </button>`;
}

// ---------- a pack's page

async function showPack(id, message = '') {
  current = null;
  const pack = (await library()).find(p => p.id === id);
  if (!pack) { showHome(); return; }
  render = () => showPack(id);
  const sums = await summaries(pack);
  const { topics, misc } = topicsOf(pack);
  const deckRow = (d, inStack, art) => {
    const s = sums.get(d.id);
    const main = s.finished ? (s.verdict === 'replan' ? 'Sent back' : 'Done') : s.left ? `${s.left} left` : 'At the end';
    return `<button class="deckrow ${s.finished ? 'finished' : ''} ${inStack ? 'instack' : ''}" data-deck="${esc(d.id)}">
      <span class="art">${art}</span>
      <span class="deckrow-title">${d.stack && !inStack && !s.finished ? '<small class="readfirst">Read first</small>' : ''}${esc(d.title)}</span>
      <span class="deckrow-left">${main}${s.handled ? `<small class="handledcount"><i> · </i>${s.handled} handled</small>` : ''}</span>
    </button>`;
  };
  const topicBlock = t => {
    const done = t.decks.filter(d => sums.get(d.id).finished).length;
    const cleared = done === t.decks.length;
    const art = safeIcon(t.icon) || safeIcon(pack.icon) || icon('card-random');
    return `<section class="topic ${cleared ? 'cleared' : ''}" style="--pc:${esc(t.color || pack.color || '#7b8294')}">
      <div class="topic-head">
        <span class="topic-art">${safeIcon(t.icon) || icon('card-random')}</span>
        <span class="topic-title">${esc(t.title)}</span>
        <span class="topic-count">${cleared ? 'Cleared' : `${done} of ${t.decks.length} deck${t.decks.length === 1 ? '' : 's'}`}</span>
      </div>
      <div class="deckrows">${t.decks.map((d, i) => deckRow(d, d.stack && i > 0 && t.decks[i - 1].stack === d.stack, art)).join('')}</div>
    </section>`;
  };
  const thoughts = await thoughtCount(pack);
  app.innerHTML = `
    <div class="packpage screen scroll">
      <div class="deckbar">
        <button class="iconbtn" data-go="home" aria-label="Back">${icon('chevron-left')}</button>
        <div class="t">${esc(pack.title)}</div>
        <div class="n" data-slot="notice" data-plain="${packLeft(sums)} left"></div>
      </div>
      ${message ? `<div class="set-text problem">${esc(message)}</div>` : ''}
      <button class="thoughtsrow" data-go="thoughts">${icon('lightbulb')}<span><strong>Thoughts</strong><small>${thoughts ? `${thoughts} filed` : 'Anything on your mind about this project'}</small></span></button>
      ${topics.map(topicBlock).join('')}
      ${misc.length ? `<section class="topic misc" style="--pc:${esc(pack.color || '#7b8294')}"><div class="deckrows">${misc.map(d => deckRow(d, false, safeIcon(pack.icon) || icon('card-random'))).join('')}</div></section>` : ''}
      ${pack.demo ? '<div id="feelwords"></div>' : ''}
    </div>`;
  paintNotices();
  app.querySelector('[data-go=home]').onclick = showHome;
  app.querySelector('[data-go=thoughts]').onclick = () => openThoughts(pack);
  if (pack.demo) await drawFeelWords(pack);
  app.querySelectorAll('[data-deck]').forEach(b => { b.onclick = () => openDeck(pack, b.dataset.deck); });
}

// ---------- what's written in the Feel test

// Every word written there, saved or cleared, so none can only be on a page you can't get back to.
async function feelWords(pack) {
  const live = [];
  const states = new Map();
  for (const d of pack.decks) {
    const s = await store.get(deckKey(pack, d)).catch(() => null);
    if (!s) continue;
    states.set(d.id, s);
    live.push(...wordsIn(d, s).map(w => ({ ...w, deck: d })));
  }
  const old = (await store.get('feel-archive').catch(() => null)) || [];
  return { live, old, states };
}

const wordsAsText = ({ live, old }) => [...live, ...old].map(w => `${w.where}\n${[w.text, (w.pics || []).length ? `(${countWords(w.pics.length)})` : ''].filter(Boolean).join(' ')}`).join('\n\n');

function sendUnsent(pack, { live, states }) {
  for (const d of pack.decks) {
    const s = states.get(d.id);
    if (!s) continue;
    sendWords(pack, d, s, live.filter(w => w.deck === d && !w.sent));
    store.set(deckKey(pack, d), s);
  }
}

async function copyText(text, out) {
  try {
    await navigator.clipboard.writeText(text);
    out.textContent = 'Copied.';
  } catch {
    // Some views refuse the clipboard, so show the words selected instead.
    out.innerHTML = '<textarea class="copybox" rows="6" readonly></textarea><span>Copy this by hand.</span>';
    const box = out.querySelector('textarea');
    box.value = text;
    box.focus();
    box.select();
  }
}

async function drawFeelWords(pack, confirming = false) {
  const host = document.getElementById('feelwords');
  if (!host) return;
  const words = await feelWords(pack);
  const unsent = words.live.filter(w => !w.sent);
  const swipes = [...words.states.values()].reduce((n, s) => n + Object.keys(s.answers || {}).length, 0);
  const row = w => `<div class="word"><small>${esc(w.where)}</small><span>${esc([w.text, (w.pics || []).length ? `(${countWords(w.pics.length)})` : ''].filter(Boolean).join(' '))}</span><em class="${w.sent ? 'sent' : ''}">${w.sent ? 'Sent' : 'Not sent yet'}</em></div>`;
  const count = words.live.length;
  host.innerHTML = `
    <div class="demo-note">Anything you type here gets sent, tagged as a test. Swipes with no words stay on this phone.</div>
    ${count + words.old.length ? `
      <div class="set-title">What you wrote here</div>
      <div class="words">${words.live.map(row).join('')}${words.old.map(w => row({ ...w, sent: true })).join('')}</div>
      <div class="set-row">
        <button class="secondary" data-go="send-words" ${unsent.length ? '' : 'disabled'}>${icon('cloud-upload')}Send these</button>
        <button class="secondary" data-go="copy-words">${icon('notebook-pen')}Copy</button>
      </div>
      <div class="set-text small" id="wordsresult"></div>` : ''}
    ${confirming ? `
      <div class="confirm" id="resetconfirm">
        <div class="set-text">This clears ${swipes} swipe${swipes === 1 ? '' : 's'}${count ? ` and ${count} thing${count === 1 ? '' : 's'} you wrote` : ''} from the Feel test.${unsent.length ? ` First it sends the ${unsent.length} not sent yet.` : ''}${count ? ' Your words stay listed here.' : ''}</div>
        <div class="set-row">
          <button class="primary" data-go="reset-yes">Clear it</button>
          <button class="ghostbtn" data-go="reset-no">Keep it</button>
        </div>
      </div>` : `<button class="ghostbtn resetbtn" data-go="reset">${icon('rotate-ccw')}Start the Feel test again</button>`}`;
  const on = (name, fn) => { const b = host.querySelector(`[data-go=${name}]`); if (b) b.onclick = fn; };
  on('send-words', async () => {
    sendUnsent(pack, words);
    await drawFeelWords(pack);
    const out = document.getElementById('wordsresult');
    if (out) out.textContent = sync.status().connected ? 'On their way.' : "They'll go once you connect, from the gear.";
  });
  on('copy-words', () => copyText(wordsAsText(words), document.getElementById('wordsresult')));
  on('reset', () => drawFeelWords(pack, true));
  on('reset-no', () => drawFeelWords(pack));
  on('reset-yes', async () => {
    // Words first: queued, then kept in the list, and only then is anything cleared.
    sendUnsent(pack, words);
    await archiveWords(words.live);
    for (const d of pack.decks) store.del(deckKey(pack, d));
    showPack(pack.id);
  });
}

async function openThoughts(pack) {
  const view = new ThoughtsView({ host: app, pack, onExit: () => { current = null; showPack(pack.id); } });
  current = view;
  render = () => {};
  try {
    await view.open();
    paintNotices();
  } catch {
    current = null;
    showPack(pack.id, "Couldn't read your thoughts on this phone just now. Close Riffle and open it again.");
  }
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
  try {
    await current.open();
  } catch {
    current = null;
    setNotice({ text: 'Not saving on this phone', act: showSettings });
    showPack(pack.id, "Couldn't read this deck's saved progress just now. Close Riffle and open it again.");
  }
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

// The payoffs: a small pop for a topic, because a busy pack may rarely be empty, and one short
// modest burst for a pack. Gone within a second, with quiet words.
function reward(level, pack, title, iconText, color, decks, sums) {
  const cards = decks.reduce((n, d) => n + sums.get(d.id).total, 0);
  const isPack = level === 'pack';
  const pc = color || '#9a5be0';
  app.innerHTML = `
    <div class="reward screen lvl-${level}" style="--pc:${esc(pc)}">
      <div class="reward-art">${safeIcon(iconText) || icon('card-random')}</div>
      <div class="reward-word">${esc(title)} cleared</div>
      <div class="reward-sub">${decks.length} deck${decks.length === 1 ? '' : 's'}, ${cards} card${cards === 1 ? '' : 's'}.</div>
      <button class="primary" data-go="pack">${isPack ? 'Back to the packs' : 'Back to the pack'}</button>
    </div>`;
  app.querySelector('[data-go=pack]').onclick = () => (isPack ? showHome() : showPack(pack.id));
  confetti(app, isPack ? { count: 56, force: 0.95, colors: [pc, '#ffffff', '#ffd76a'] } : { count: 20, force: 0.6, colors: [pc, '#ffffff'] });
  tick();
}

// ---------- settings and connecting

const nameOf = (list, id) => (list.find(x => x.id === id) || list[0]).name;

function sendingText(st) {
  const parts = [];
  if (st.connected) parts.push(`Connected to ${sync.REPO}.`);
  else parts.push('Not connected yet.');
  if (st.waiting) parts.push(`${st.waiting} waiting to send.`);
  if (st.connected && !st.waiting) parts.push('Nothing waiting.');
  if (st.photosWaiting) parts.push(`${countWords(st.photosWaiting)} waiting to send.`);
  if (st.sentAt) parts.push(`${st.sentCount} sent so far (last at ${new Date(st.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}).`);
  if (st.readAt) parts.push(`Last read by the writer (${new Date(st.readAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}).`);
  return parts.join(' ');
}

async function showSettings() {
  current = null;
  render = showSettings;
  const root = document.documentElement;
  const st = sync.status();
  app.innerHTML = `
    <div class="settings screen scroll">
      <div class="deckbar">
        <button class="iconbtn" data-go="home" aria-label="Back">${icon('chevron-left')}</button>
        <div class="t">Settings</div>
      </div>
      <button class="setrow" data-go="style">${icon('palette')}<span><strong>Style</strong><small>${esc(nameOf(LAYOUTS, root.dataset.layout))} · ${esc(nameOf(LOOKS, root.dataset.look))} · ${esc(nameOf(MARKS, root.dataset.mark))}</small></span></button>
      <button class="setrow" data-go="dirs">${icon('arrow-left-right')}<span><strong>Swipe directions</strong><small>Choose what each way of swiping does</small></span></button>
      <div class="set-title">Sending answers</div>
      <div class="set-text" id="sendtext">${esc(sendingText(st))}</div>
      ${store.troubleNow() ? `<div class="set-text problem" id="saveproblem">${esc(troubleWords(store.troubleNow()))}</div>` : ''}
      ${st.problem ? `<div class="set-text problem" id="sendproblem">${esc(st.problem)}</div>` : ''}
      ${st.photoProblem ? `<div class="set-text problem" id="photoproblem">${esc(st.photoProblem)}</div>` : ''}
      ${!st.problem && st.lastTry ? `<div class="set-text small" id="lasttry">${esc(st.lastTry)}</div>` : ''}
      ${st.pullProblem ? `<div class="set-text problem">${esc(st.pullProblem)}</div>` : ''}
      ${st.connected
        ? `<div class="set-row">
             <button class="secondary" data-go="send">${icon('cloud-upload')}Send now</button>
             <button class="secondary" data-go="sync">${icon('refresh-cw')}Check for decks</button>
           </div>
           <div class="set-text small" id="sendresult"></div>
           <button class="ghostbtn" data-go="disconnect">Disconnect</button>`
        : `<button class="primary" data-go="connect">${icon('link')}Connect</button>`}
      <div class="set-title">Notifications</div>
      <div class="set-text" id="notifytext"></div>
      <button class="secondary" id="notifybtn" hidden></button>
      <div class="set-title">On this phone</div>
      <div class="set-text small" id="storageline"></div>
      <div class="set-title">Credits</div>
      <div class="set-text small">Pack and deck icons from game-icons.net, by its many authors, CC BY 3.0. Button icons from Lucide, ISC licence. Pixelify Sans by its project authors, SIL Open Font Licence.</div>
      <div class="set-text small">Riffle ${VERSION}</div>
    </div>`;
  store.persisted().then(yes => {
    const line = document.getElementById('storageline');
    if (!line) return;
    line.textContent = yes === null ? "This browser doesn't say whether it will keep Riffle's data."
      : yes ? 'This browser has promised to keep what Riffle saves here.'
      : "This browser hasn't promised to keep what Riffle saves here. It can clear it if space runs low. Adding Riffle to the Home Screen helps.";
  });
  drawNotify();
  app.querySelector('[data-go=home]').onclick = showHome;
  app.querySelector('[data-go=style]').onclick = showStyle;
  app.querySelector('[data-go=dirs]').onclick = showDirections;
  const on = (name, fn) => { const b = app.querySelector(`[data-go=${name}]`); if (b) b.onclick = fn; };
  on('connect', showConnect);
  on('send', async () => {
    const out = app.querySelector('#sendresult');
    if (out) out.textContent = 'Sending…';
    const r = await sync.flush();
    await showSettings();
    const again = app.querySelector('#sendresult');
    if (again) again.textContent = r ? r.message : '';
    const last = app.querySelector('#lasttry');
    if (last) last.remove(); // the result just shown says the same
  });
  on('sync', async () => {
    const out = app.querySelector('#sendresult');
    if (out) out.textContent = 'Checking…';
    await pullNow();
    await showSettings();
    const again = app.querySelector('#sendresult');
    if (again && !sync.status().pullProblem) again.textContent = 'Checked. You have the latest decks.';
  });
  on('disconnect', async () => { await sync.disconnect(); showSettings(); });
}

// Permission is asked only from this button, and it's also the off switch.
async function drawNotify(message = '') {
  const text = document.getElementById('notifytext'), btn = document.getElementById('notifybtn');
  if (!text) return;
  if (!push.supported()) {
    text.textContent = isIOS ? 'These only work from the Home Screen icon, on iOS 16.4 or newer.' : "This browser can't do these.";
    return;
  }
  const on = await push.isOn();
  text.textContent = message || (on ? 'On. You get one when a new deck is ready.' : 'Off. Turn them on to hear when a new deck is ready.');
  btn.hidden = false;
  btn.disabled = false;
  btn.textContent = on ? 'Turn off' : 'Turn on';
  btn.onclick = async () => {
    btn.disabled = true;
    const r = await (on ? push.turnOff() : push.turnOn()).catch(e => ({ message: `That didn't work: ${e.message}` }));
    drawNotify(r.message);
  };
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
    if (!r.keepText) box.value = '';
    out.className = `connect-result ${r.ok ? 'good' : 'bad'}`;
    out.textContent = r.message;
    if (r.ok) setTimeout(showHome, 1600);
  };
}

// ---------- start

// The one thing that runs when the app is hidden or closing: save and queue everything, then send.
function onHide() {
  const saved = current ? current.secure() : Promise.resolve();
  Promise.resolve(saved).catch(() => {}).finally(() => { sync.flush({ hide: true }); sync.flushPhotos(); });
}

async function start() {
  trackViewport();
  store.onTrouble(() => { refreshNotice(); refreshStatusLine(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide(); });
  addEventListener('pagehide', onHide);
  await store.recover();
  setStyle({
    layout: (await store.get('style-layout').catch(() => null)) || document.documentElement.dataset.layout || DEFAULT_LAYOUT,
    look: (await store.get('style-look').catch(() => null)) || document.documentElement.dataset.look || DEFAULT_LOOK,
    mark: (await store.get('style-mark').catch(() => null)) || document.documentElement.dataset.mark || DEFAULT_MARK,
  });
  setDirs((await store.get('swipe-dirs').catch(() => null)) || DEFAULT_DIRS);
  const lib = await library();
  await queueUnsentWords((packId, deckId) => {
    const p = lib.find(x => x.id === packId);
    const d = p && p.decks.find(x => x.id === deckId);
    return (d && d.topic) || null;
  });
  navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {});
  sync.onChange(() => { refreshNotice(); refreshStatusLine(); });
  await showHome();
  pullNow = await sync.start(() => render());
  refreshNotice();
  registerWorker();
  push.refresh().catch(() => {});
}

start();

// For the tests in tests/, on a local test server only.
if (isLocalHost) {
  window.__riffle = { get current() { return current; }, showHome, showPack, showConnect, showSettings, showStyle, showDirections, setStyle, setDirs, getDirs, setNotice, onHide, openThoughts, library, sync, store };
}
