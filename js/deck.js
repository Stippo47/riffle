// One deck on the table: the card stack, the swipes, the comment box, notes, the overview and the end.
import { TUNE, decide, dominant, progress, track } from './gesture.js';
import { clamp, confetti, esc, icon, kindOf, paras, RARITY, stampWord, tick } from './ui.js';
import * as store from './store.js';
import { enqueue, newId } from './sync.js';

const DIRS = ['right', 'left', 'down', 'up'];

export const deckKey = (pack, deck) => `deck:${pack.id}/${deck.id}`;

// iPhones only raise the keyboard for a focus during a finger's lift. This runs during the pointer's
// lift and tries once more on the touch's own end, whichever of them counts.
function focusNow(el) {
  el.focus();
  document.addEventListener('touchend', () => { if (document.activeElement !== el && !el.closest('[hidden]')) el.focus(); }, { once: true, capture: true });
}

// Steps the type down if a card doesn't fit its face, so nothing gets cut off on a small phone.
function fit(node) {
  const face = node.querySelector('.face');
  for (const step of ['tight', 'tighter']) {
    if (face.scrollHeight <= face.clientHeight) return;
    node.classList.add(step);
  }
}

// Which cards at which versions a verdict was given on. If that changes, the verdict no longer holds.
const deckSig = deck => deck.cards.map(c => `${c.id}:${c.version || 1}`).join(',');

// How far along a deck is, for the pack's page and the rewards.
export function deckSummary(deck, s) {
  const left = deck.cards.filter(c => {
    const a = s && s.answers[c.id];
    return !a || (c.version || 1) > (a.version || 1);
  }).length;
  const finished = !!(s && s.verdict && s.verdictSig === deckSig(deck));
  return { total: deck.cards.length, left, finished, verdict: finished ? s.verdict : null };
}

// Cracks spreading out from a point right of the middle, the same on every showing of a card.
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
const CRACK_FROM = [72, 46];
function crackPaths(id) {
  const r = seeded(id), out = [];
  const ray = (x, y, angle, len, start) => {
    let path = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const steps = 4 + Math.floor(r() * 3);
    let a = angle;
    for (let i = 0; i < steps; i++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * (len / steps);
      y += Math.sin(a) * (len / steps) * 1.5;
      path += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      if (i === 1 && r() < 0.6) out.push({ fork: [x, y, a + (r() < 0.5 ? 0.8 : -0.8), len * 0.45, start + 0.22] });
    }
    out.push({ d: path, start });
  };
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    ray(CRACK_FROM[0], CRACK_FROM[1], a, 34 + r() * 46, (i / n) * 0.42);
  }
  for (const c of out.filter(o => o.fork)) ray(...c.fork);
  return out.filter(o => o.d);
}

// The card's outline cut into wedges around where the cracks began, for the burst.
function wedges(id, n = 11) {
  const r = seeded(id + 'w');
  const at = t => { // t runs once round the edge, 0 to 4
    const s = t % 4, f = s % 1;
    return s < 1 ? [f * 100, 0] : s < 2 ? [100, f * 100] : s < 3 ? [100 - f * 100, 100] : [0, 100 - f * 100];
  };
  const cuts = Array.from({ length: n }, (_, i) => (i + 0.2 + r() * 0.6) * (4 / n));
  return cuts.map((t, i) => {
    const end = i + 1 < n ? cuts[i + 1] : cuts[0] + 4;
    const pts = [CRACK_FROM, at(t)];
    for (let k = Math.ceil(t); k < end; k++) pts.push(at(k));
    pts.push(at(end));
    return pts;
  });
}

function fresh(deck) {
  return { order: deck.cards.map(c => c.id), answers: {}, log: [], notes: '', drafts: {}, reviewing: null, verdict: null, startedAt: Date.now() };
}

// A deck can change while it's saved: new cards join the end, gone cards leave, and a new version
// of a card (a second try) counts as unanswered again.
function reconcile(s, deck) {
  const cards = new Map(deck.cards.map(c => [c.id, c]));
  for (const id of Object.keys(s.answers)) {
    const c = cards.get(id);
    if (!c || (c.version || 1) > (s.answers[id].version || 1)) delete s.answers[id];
  }
  s.order = s.order.filter(id => cards.has(id));
  for (const c of deck.cards) if (!s.answers[c.id] && !s.order.includes(c.id)) s.order.push(c.id);
  if (s.reviewing && (!cards.has(s.reviewing) || !s.answers[s.reviewing])) s.reviewing = null;
  if (s.verdict && s.verdictSig !== deckSig(deck)) s.verdict = null;
  s.log = s.log.filter(e => cards.has(e.id));
}

export class DeckView {
  constructor({ host, pack, deck, images, onExit, onVerdict }) {
    Object.assign(this, { host, pack, deck, images, onExit, onVerdict });
    this.cards = new Map(deck.cards.map(c => [c.id, c]));
    this.nodes = new Map();
    this.composing = false;
    this.flipped = false;
    this.armed = false;
    this.charge = 0;
    this.push = null;
    this.broke = false;
  }

  async open() {
    this.key = deckKey(this.pack, this.deck);
    this.s = (await store.get(this.key)) || fresh(this.deck);
    reconcile(this.s, this.deck);
    this.render();
    this.deal();
    this.save();
  }

  close() {
    this.untrack && this.untrack();
    this.sendNotes();
    this.saveNow();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 150);
  }
  saveNow() {
    clearTimeout(this.saveTimer);
    return store.set(this.key, JSON.parse(JSON.stringify(this.s)));
  }

  send(event) {
    return enqueue({
      pack: this.pack.id, topic: this.deck.topic || null, deck: this.deck.id,
      ...(this.pack.demo ? { demo: true } : {}), ...event,
    });
  }

  // ---------- layout

  render() {
    this.host.innerHTML = `
      <div class="deck screen" id="deck">
        <div class="deckbar">
          <button class="iconbtn" data-act="back" aria-label="Back">${icon('chevron-left')}</button>
          <div class="t">${esc(this.deck.title)}</div>
          <div class="n" id="count"></div>
        </div>
        <div class="progress"><b id="bar"></b></div>
        <div class="tools">
          <button data-act="undo" id="undo">${icon('undo-2')}<span>Undo</span></button>
          <button data-act="notes" id="notesbtn">${icon('notebook-pen')}<span>Notes</span></button>
          <button data-act="skip" id="skip">${icon('skip-forward')}<span>Skip</span></button>
          <button data-act="grid">${icon('layout-grid')}<span>Grid</span></button>
        </div>
        <div class="tablewrap">
          <div class="table" id="table"><div class="glow" id="glow"></div></div>
          <div class="notes-sheet" id="notes" hidden>
            <div class="sheet-title">Notes on this deck</div>
            <div class="sheet-sub">Anything that doesn't fit a card. It's sent with the deck.</div>
            <textarea id="notestext" placeholder="Thoughts…"></textarea>
          </div>
          <div class="endbox" id="end" hidden></div>
        </div>
        <div class="composer" id="composer" hidden>
          <textarea id="comment" placeholder="Your comment…"></textarea>
          <div class="composer-row">
            <div class="composer-hint" id="composerhint">Throw the card to send it with this. Up sends the comment alone.</div>
            <button class="iconbtn" data-act="closecomment" aria-label="Close the comment box">${icon('x')}</button>
          </div>
        </div>
      </div>
      <div class="overview" id="overview" hidden></div>`;
    const $ = id => this.host.querySelector('#' + id);
    Object.assign(this, {
      root: $('deck'), table: $('table'), glow: $('glow'), composer: $('composer'), comment: $('comment'),
      notesSheet: $('notes'), notesText: $('notestext'), endBox: $('end'), overview: $('overview'),
      countEl: $('count'), barEl: $('bar'), undoBtn: $('undo'), skipBtn: $('skip'), notesBtn: $('notesbtn'),
    });
    this.notesText.value = this.s.notes || '';

    this.host.onclick = e => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const l = this.lift; // the lift below already acted on this same tap
      if (l && e.detail !== 0 && performance.now() - l.t < 600 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 14) return;
      this.act(b.dataset.act, b);
    };
    // The top row answers as the finger lifts, not on the click after it. A browser can swallow
    // that click when it follows a throw, and Undo is exactly what you tap straight after one.
    this.root.querySelector('.tools').addEventListener('pointerup', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      this.lift = { t: performance.now(), x: e.clientX, y: e.clientY }; // its click may land on whatever just opened
      this.act(b.dataset.act, b);
    });
    this.comment.addEventListener('input', () => {
      const id = this.topId();
      if (id) { this.s.drafts[id] = this.comment.value; this.save(); this.syncAttached(); }
    });
    this.notesText.addEventListener('input', () => this.notesChanged(this.notesText.value));

    this.untrack = track(this.table, {
      blocked: e => this.flipped || !this.topId() || (e.target && e.target.closest && e.target.closest('button')),
      move: d => this.onMove(d),
      release: d => this.onRelease(d),
      cancel: () => { if (this.broke) this.broke = false; else this.spring(); },
      tap: e => this.onTap(e),
      pinchStart: () => { this.spring(); this.pinchFired = false; },
      pinch: s => this.onPinch(s),
      pinchEnd: () => this.onPinchEnd(),
    });
  }

  act(name, btn) {
    const go = {
      back: () => this.exit(),
      undo: () => this.undo(),
      skip: () => this.skip(),
      notes: () => this.toggleNotes(),
      grid: () => this.showOverview(),
      closecomment: () => this.closeComposer(),
      closegrid: () => this.hideOverview(),
      jump: () => this.jump(btn.dataset.id),
      gridnotes: () => { this.hideOverview(); if (this.topId()) this.toggleNotes(true); },
      gridreplan: () => { this.hideOverview(); this.showEnd(true); },
      flipback: () => this.flip(false),
      done: () => this.verdict('done'),
      replan: () => this.verdict('replan'),
      opencomment: () => this.openComposer(),
      keepgoing: () => this.deal(),
    }[name];
    go && go();
  }

  exit() {
    this.saveNow();
    this.onExit && this.onExit();
  }

  topId() { return this.s.order[0] || null; }
  topNode() { return this.nodes.get(this.topId()); }

  // ---------- cards

  buildCard(card) {
    const kind = kindOf(card);
    const rarity = card.rarity || 'common';
    const n = document.createElement('div');
    n.className = `card ${rarity}`;
    const breaks = RARITY[rarity] && RARITY[rarity].breaks;
    n.dataset.id = card.id;
    const label = RARITY[rarity] && RARITY[rarity].label;
    const pics = (card.images || []).map(p => this.images(p)).filter(Boolean);
    const hasMore = card.details || pics.length;
    const moreText = [card.details ? 'details' : '', pics.length ? `${pics.length} picture${pics.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ');
    const long = (card.text || '').length > 70;
    n.innerHTML = `
      <div class="flip">
        <div class="face">
          <div class="glint"></div>
          <div class="chips"><span>${esc(kind.label)}</span>${label ? `<span class="warn">· ${esc(label)}</span>` : ''}</div>
          <h2 class="${long ? 'long' : ''}">${esc(card.text)}</h2>
          ${card.why ? `<p class="why">${esc(card.why)}</p>` : ''}
          <div class="prev" hidden></div>
          ${card.pick ? `<div class="pick"><b>${esc(kind.pickLabel || 'My pick')}</b>${esc(card.pick)}</div>` : '<div class="pickgap"></div>'}
          <button class="attached" data-act="opencomment" hidden>${icon('message-square-text')}<span></span></button>
          ${breaks ? '<div class="holdline">Hold right to break through</div>' : ''}
          ${hasMore ? `<div class="more">Tap for ${esc(moreText)}</div>` : ''}
          ${breaks ? `<svg class="cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${crackPaths(card.id).map(p =>
            `<path class="crack-glow" d="${p.d}" pathLength="1" data-start="${p.start.toFixed(3)}"/><path class="crack-line" d="${p.d}" pathLength="1" data-start="${p.start.toFixed(3)}"/>`).join('')}</svg>` : ''}
          <div class="stamp"></div>
        </div>
        <div class="back">
          <div class="back-scroll">
            <h3>${esc(card.title || card.text)}</h3>
            ${pics.map(src => `<img src="${esc(src)}" alt="">`).join('')}
            ${paras(card.details)}
          </div>
          <button class="back-hint" data-act="flipback">Tap to flip back</button>
        </div>
      </div>`;
    return n;
  }

  // Lays out the top three cards. A card moving up a place keeps its node, so it slides up.
  deal() {
    const ids = this.s.order.slice(0, 3);
    for (const [id, node] of this.nodes) {
      if (!ids.includes(id)) { node.remove(); this.nodes.delete(id); }
    }
    ids.forEach((id, i) => {
      let n = this.nodes.get(id);
      if (!n) {
        n = this.buildCard(this.cards.get(id));
        this.nodes.set(id, n);
        n.dataset.pos = Math.min(i + 1, 2);
        this.table.append(n);
        fit(n);
        void n.offsetWidth;
      }
      n.dataset.pos = i;
      n.style.zIndex = 10 - i;
    });
    this.table.style.setProperty('--rise', 0);
    this.glow.style.opacity = 0;
    this.armed = false;
    this.flipped = false;
    this.table.classList.remove('flipped');
    for (const n of this.nodes.values()) n.querySelector('.flip').classList.remove('flipped');

    this.charge = 0;
    this.push = null;
    const top = this.topNode();
    if (top) {
      top.classList.remove('dragging');
      top.style.transform = '';
      top.style.setProperty('--charge', 0);
      if (this.breakable()) {
        top.classList.remove('glinting');
        void top.offsetWidth;
        top.classList.add('glinting');
      }
      this.syncPrev();
      this.syncAttached();
    }
    this.updateCounts();
    if (!ids.length) this.showEnd();
    else this.hideEnd();
  }

  updateCounts() {
    const total = this.deck.cards.length;
    const done = Object.keys(this.s.answers).length;
    this.countEl.textContent = `${done} / ${total}`;
    this.barEl.style.width = `${(done / Math.max(1, total)) * 100}%`;
    this.undoBtn.disabled = !this.s.log.length;
    this.skipBtn.disabled = !this.topId();
  }

  draft(id = this.topId()) { return (id && this.s.drafts[id]) || ''; }

  syncAttached() {
    const top = this.topNode();
    if (!top) return;
    const chip = top.querySelector('.attached');
    const text = this.draft().trim();
    chip.hidden = !text || this.composing;
    chip.querySelector('span').textContent = text;
  }

  syncPrev() {
    const top = this.topNode();
    if (!top) return;
    const id = this.topId();
    const box = top.querySelector('.prev');
    const a = this.s.answers[id];
    box.hidden = !a;
    if (a) box.textContent = `You said ${stampWord(this.cards.get(id), a.swipe)}${a.comment ? `: ${a.comment}` : ''}. Throw it again to change that.`;
  }

  // Epic and legendary cards: a right swipe has to break through. See pushAgainst.
  breakable() {
    const id = this.topId();
    const rarity = id && this.cards.get(id).rarity;
    return !!(RARITY[rarity] && RARITY[rarity].breaks);
  }

  size() { return { w: this.host.clientWidth || innerWidth, h: this.root.clientHeight || innerHeight }; }

  // ---------- swipes

  onMove({ dx, dy }) {
    if (this.broke) return; // the card has gone; wait for the finger to lift
    const top = this.topNode();
    if (!top) return;
    const dir = dominant(dx, dy);
    top.classList.add('dragging');
    if (dir === 'right' && this.breakable()) { this.pushAgainst(dx, dy); return; }
    this.push = null;
    top.style.transform = `translate3d(${dx}px,${dy}px,0) rotate(${clamp(dx * 0.055, -16, 16)}deg)`;
    const { w, h } = this.size();
    const p = progress(dx, dy, w, h, this.composing);
    const st = top.querySelector('.stamp');
    const emptyUp = dir === 'up' && this.composing && !this.draft().trim();
    st.dataset.dir = dir;
    st.textContent = emptyUp ? 'CLOSE' : stampWord(this.cards.get(this.topId()), dir);
    st.style.opacity = clamp((p - 0.12) / 0.5, 0, 1);
    st.style.setProperty('--s', 0.84 + 0.16 * Math.min(p, 1));
    const armed = p >= 1;
    if (armed !== this.armed) {
      this.armed = armed;
      st.classList.toggle('armed', armed);
      if (armed && !this.composing) tick();
    }
    this.table.style.setProperty('--rise', Math.min(p, 1));
    this.glow.dataset.dir = dir;
    this.glow.style.opacity = Math.min(p, 1) * 0.9;
  }

  // The card pushes against resistance while the build-up runs on a clock, because a held finger
  // sends no moves. Letting go or pulling back drains it, and nothing is sent.
  pushAgainst(dx, dy) {
    this.push = { dx, dy };
    if (this.breakRun) return;
    this.breakRun = true;
    let last = performance.now();
    const step = now => {
      const dt = now - last;
      last = now;
      const { w } = this.size();
      const pushing = this.push && this.push.dx >= w * TUNE.breakStart;
      this.charge = clamp(this.charge + (pushing ? dt / TUNE.breakHoldMs : -dt / TUNE.breakDecayMs), 0, 1);
      this.drawCharge();
      if (this.charge >= 1) { this.breakRun = false; this.breakThrough(); return; }
      if (this.push || this.charge > 0) requestAnimationFrame(step);
      else this.breakRun = false;
    };
    requestAnimationFrame(step);
  }

  drawCharge() {
    const top = this.topNode();
    if (!top) return;
    const c = this.charge;
    top.style.setProperty('--charge', c.toFixed(3));
    top.querySelectorAll('.cracks path').forEach(p => {
      const s = +p.dataset.start;
      p.style.strokeDashoffset = 1 - clamp((c - s) / (0.92 - s), 0, 1);
    });
    this.table.style.setProperty('--rise', c);
    this.glow.dataset.dir = 'break';
    this.glow.dataset.rarity = this.cards.get(this.topId()).rarity;
    this.glow.style.opacity = c;
    if (!this.push) return;
    const { w } = this.size();
    const x = w * TUNE.breakPush * (1 - Math.exp(-this.push.dx / (w * 0.2)));
    const j = c * c * 3.4;
    const jx = (Math.random() - 0.5) * j, jy = (Math.random() - 0.5) * j;
    top.style.transform = `translate3d(${x + jx}px,${this.push.dy * 0.12 + jy}px,0) rotate(${x * 0.03 + jx * 0.2}deg) scale(${1 + c * 0.018})`;
    const st = top.querySelector('.stamp');
    st.dataset.dir = 'right';
    st.textContent = stampWord(this.cards.get(this.topId()), 'right');
    st.style.opacity = clamp(0.3 + c * 0.7, 0, 1);
    st.style.setProperty('--s', 0.8 + 0.34 * c);
    st.classList.toggle('armed', c > 0.85);
    const stage = Math.floor(c * 3);
    if (stage !== this.chargeStage) {
      this.chargeStage = stage;
      if (stage && !this.composing) tick();
    }
  }

  breakThrough() {
    this.broke = true;
    this.push = null;
    this.chargeStage = 0;
    this.commit('right', undefined, true);
  }

  onRelease(d) {
    if (this.broke) { this.broke = false; return; }
    const { w, h } = this.size();
    if (this.push) { // a right swipe let go before breaking through
      this.spring();
      this.holdHint();
      return;
    }
    const dir = decide({ ...d, w, h, compact: this.composing });
    if (!dir) { this.spring(); return; }
    if (dir === 'up') {
      if (!this.composing) { this.spring(); this.openComposer(); return; }
      if (!this.draft().trim()) { this.spring(); this.closeComposer(); return; }
    }
    this.commit(dir, d);
  }

  holdHint() {
    const top = this.topNode();
    const line = top && top.querySelector('.holdline');
    if (!line || !line.animate) return;
    line.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 320 });
  }

  spring() {
    const top = this.topNode();
    const draining = this.charge > 0;
    this.push = null;
    this.chargeStage = 0;
    if (!draining) {
      this.table.style.setProperty('--rise', 0);
      this.glow.style.opacity = 0;
    }
    this.armed = false;
    if (!top) return;
    const from = top.style.transform;
    const st = top.querySelector('.stamp');
    st.style.opacity = 0;
    st.classList.remove('armed');
    top.classList.remove('dragging');
    top.style.transform = '';
    if (from && top.animate) {
      top.animate([{ transform: from }, { transform: 'none' }],
        { duration: 240, easing: 'cubic-bezier(.2,1.5,.4,1)' });
    }
  }

  onTap(e) {
    const t = e.target;
    if (t && t.closest && t.closest('.attached')) { this.openComposer(); return; }
    if (this.composing) return;
    const id = this.topId();
    if (!id) return;
    const c = this.cards.get(id);
    if (c.details || (c.images || []).length) this.flip(true);
    else {
      const top = this.topNode();
      top.animate && top.animate(
        [{ transform: 'rotate(0)' }, { transform: 'rotate(-1.2deg)' }, { transform: 'rotate(1deg)' }, { transform: 'rotate(0)' }],
        { duration: 220 });
    }
  }

  flip(on) {
    const top = this.topNode();
    if (!top) return;
    this.flipped = on;
    this.table.classList.toggle('flipped', on);
    top.querySelector('.flip').classList.toggle('flipped', on);
    if (on) top.querySelector('.back-scroll').scrollTop = 0;
  }

  // Throws the top card, records the answer and has the next card ready at once.
  commit(dir, d = { dx: 0, dy: 0, vx: 0, vy: 0 }, shatter = false) {
    const id = this.topId();
    const card = this.cards.get(id);
    const comment = this.draft().trim();
    const eid = newId();
    const prev = this.s.answers[id] || null;
    const version = card.version || 1;
    this.s.answers[id] = { swipe: dir, comment, at: Date.now(), eid, version };
    this.s.log.push({ t: 'answer', id, eid, dir, comment, prev });
    this.s.order.shift();
    this.s.reviewing = null;
    delete this.s.drafts[id];
    this.send({ type: 'answer', eid, card: id, cardVersion: version, title: card.title || '', kind: card.kind || 'question', swipe: dir, stamp: stampWord(card, dir), comment });
    if (this.composing) this.closeComposer(true);
    if (shatter) this.shatter(id, card.rarity);
    else this.fly(id, dir, d);
    tick();
    this.deal();
    this.saveNow();
  }

  fly(id, dir, { dx, dy, vx, vy }) {
    const node = this.nodes.get(id);
    if (!node) return;
    this.nodes.delete(id);
    node.classList.add('ghost');
    node.classList.remove('dragging');
    node.style.zIndex = 30;
    const { w, h } = this.size();
    const side = dir === 'left' || dir === 'right';
    const sign = dir === 'right' || dir === 'down' ? 1 : -1;
    const tx = side ? sign * w * 1.35 : dx + (Math.abs(vy) > 0.05 ? (vx / Math.abs(vy)) * h : 0);
    const ty = side ? dy + (Math.abs(vx) > 0.05 ? (vy / Math.abs(vx)) * w : 0) : sign * h * 1.25;
    const rot = clamp(tx * 0.055, -30, 30);
    const speed = Math.max(1.6, Math.hypot(vx, vy));
    const dur = clamp(Math.hypot(tx - dx, ty - dy) / speed, 120, 280);
    const from = node.style.transform || 'none';
    node.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${rot}deg)`;
    if (!node.animate) { node.remove(); return; }
    node.animate([{ transform: from }, { transform: node.style.transform }],
      { duration: dur, easing: 'cubic-bezier(.3,.7,.7,1)' }).onfinish = () => node.remove();
  }

  // The burst at the end of a break-through: the card comes apart along its cracks.
  shatter(id, rarity) {
    const node = this.nodes.get(id);
    if (!node) return;
    this.nodes.delete(id);
    node.classList.add('ghost');
    node.classList.remove('dragging');
    node.style.zIndex = 30;
    const flip = node.querySelector('.flip');
    const face = node.querySelector('.face');
    const box = node.getBoundingClientRect();
    const hostBox = this.host.getBoundingClientRect();
    const legendary = rarity === 'legendary';
    const r = seeded(id + 's');
    let longest = null, most = 0;
    wedges(id, legendary ? 15 : 11).forEach(pts => {
      const shard = face.cloneNode(true);
      shard.classList.add('shard');
      shard.style.clipPath = `polygon(${pts.map(p => `${p[0].toFixed(1)}% ${p[1].toFixed(1)}%`).join(',')})`;
      flip.append(shard);
      if (!shard.animate) return;
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length - CRACK_FROM[0];
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length - CRACK_FROM[1];
      const len = Math.hypot(cx, cy) || 1;
      const dist = 120 + r() * 220;
      const tx = (cx / len) * dist + box.width * 0.45, ty = (cy / len) * dist + 40;
      const dur = 380 + r() * 260;
      const a = shard.animate([
        { transform: 'none', opacity: 1 },
        { opacity: 1, offset: 0.6 },
        { transform: `translate3d(${tx}px,${ty}px,0) rotate(${(r() - 0.5) * 110}deg) scale(.86)`, opacity: 0 },
      ], { duration: dur, easing: 'cubic-bezier(.12,.7,.35,1)', fill: 'forwards' });
      if (dur > most) { most = dur; longest = a; }
    });
    face.style.visibility = 'hidden';
    node.querySelector('.back').style.visibility = 'hidden';
    if (longest) longest.onfinish = () => node.remove();
    else node.remove();

    // Flash, a burst of bits and a knock to the table.
    const flash = document.createElement('div');
    flash.className = `flash ${rarity}`;
    this.table.append(flash);
    if (flash.animate) flash.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: legendary ? 380 : 260, easing: 'ease-out' }).onfinish = () => flash.remove();
    else flash.remove();
    confetti(this.host, {
      count: legendary ? 150 : 90, force: legendary ? 1.5 : 1.15, colors: RARITY[rarity].burst,
      origin: [box.left - hostBox.left + box.width * 0.72, box.top - hostBox.top + box.height * 0.46],
    });
    const k = legendary ? 7 : 4;
    this.table.animate && this.table.animate([
      { transform: 'none' }, { transform: `translate3d(${k}px,${-k / 2}px,0)` }, { transform: `translate3d(${-k}px,${k / 2}px,0)` },
      { transform: `translate3d(${k / 2}px,0,0)` }, { transform: 'none' },
    ], { duration: 210 });
  }

  // ---------- top row

  undo() {
    const e = this.s.log.pop();
    if (!e) return;
    this.toggleNotes(false);
    if (this.composing) this.closeComposer(true);
    this.s.order = this.s.order.filter(id => id !== e.id);
    if (this.s.reviewing && this.s.reviewing !== e.id) {
      this.s.order = this.s.order.filter(id => id !== this.s.reviewing);
      this.s.reviewing = null;
    }
    if (e.t === 'answer') {
      if (e.prev) { this.s.answers[e.id] = e.prev; this.s.reviewing = e.id; }
      else delete this.s.answers[e.id];
      if (e.comment) this.s.drafts[e.id] = e.comment;
      this.send({ type: 'undo', card: e.id, of: e.eid });
    }
    this.s.order.unshift(e.id);
    this.deal();
    this.enter(e.t === 'answer' ? e.dir : 'skip');
    this.saveNow();
  }

  // Brings a card back on from the way it left.
  enter(dir) {
    const top = this.topNode();
    if (!top || !top.animate) return;
    const { w, h } = this.size();
    const from = dir === 'right' ? `translate3d(${w}px,0,0) rotate(16deg)`
      : dir === 'left' ? `translate3d(${-w}px,0,0) rotate(-16deg)`
      : dir === 'down' ? `translate3d(0,${h}px,0)`
      : dir === 'up' ? `translate3d(0,${-h}px,0)`
      : 'translate3d(0,26px,0) scale(.92)';
    top.animate([{ transform: from }, { transform: 'none' }], { duration: 230, easing: 'cubic-bezier(.2,1.1,.4,1)' });
  }

  skip() {
    const id = this.topId();
    if (!id) return;
    this.toggleNotes(false);
    if (this.composing) this.closeComposer();
    if (this.s.order.length === 1 && !this.s.reviewing) {
      const top = this.topNode();
      top.animate && top.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 200 });
      return;
    }
    const node = this.nodes.get(id);
    this.nodes.delete(id);
    if (node) {
      node.style.zIndex = 0;
      node.classList.add('ghost');
      if (node.animate) {
        node.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate3d(0,34px,0) scale(.88)', opacity: 0 }],
          { duration: 170, easing: 'ease-out', fill: 'forwards' }).onfinish = () => node.remove();
      } else node.remove();
    }
    this.s.order.shift();
    if (this.s.reviewing === id) this.s.reviewing = null; // an answered card just leaves again
    else {
      this.s.order.push(id);
      this.s.log.push({ t: 'skip', id });
    }
    this.deal();
    this.saveNow();
  }

  notesChanged(text) {
    this.s.notes = text;
    this.save();
    clearTimeout(this.notesTimer);
    this.notesTimer = setTimeout(() => this.sendNotes(), 1500);
  }
  sendNotes() {
    clearTimeout(this.notesTimer);
    if ((this.s.notes || '') === (this.s.notesSent || '')) return;
    this.s.notesSent = this.s.notes;
    this.send({ type: 'notes', text: this.s.notes });
    this.save();
  }

  toggleNotes(force) {
    if (force === undefined && !this.endBox.hidden) { // at the end of a deck the pad is already on screen
      focusNow(this.endBox.querySelector('#endnotes'));
      return;
    }
    const on = force === undefined ? this.notesSheet.hidden : force;
    if (on === !this.notesSheet.hidden) return;
    this.notesSheet.hidden = !on;
    this.notesBtn.classList.toggle('on', on);
    this.root.classList.toggle('noting', on);
    if (on) {
      if (this.composing) this.closeComposer();
      this.notesText.value = this.s.notes || '';
      focusNow(this.notesText);
    } else {
      this.notesText.blur();
      this.sendNotes();
    }
  }

  // ---------- comment box

  openComposer() {
    if (this.composing || !this.topId()) return;
    this.toggleNotes(false);
    this.composing = true;
    this.root.classList.add('composing');
    this.composer.hidden = false;
    this.comment.value = this.draft();
    this.syncAttached();
    focusNow(this.comment);
    scrollTo(0, 0);
  }

  // Keeps what's typed, unless the card has just been thrown with it.
  closeComposer(sent = false) {
    if (!this.composing) return;
    this.composing = false;
    this.root.classList.remove('composing');
    this.composer.hidden = true;
    this.comment.blur();
    if (sent) this.comment.value = '';
    this.syncAttached();
    scrollTo(0, 0);
  }

  // ---------- overview

  onPinch(scale) {
    const top = this.topNode();
    if (top && !this.pinchFired) {
      top.classList.add('dragging');
      top.style.transform = `scale(${clamp(scale, 0.6, 1.06)})`;
    }
    if (!this.pinchFired && scale < TUNE.pinchOpen) {
      this.pinchFired = true;
      this.showOverview();
    }
  }
  onPinchEnd() {
    const top = this.topNode();
    if (top) { top.classList.remove('dragging'); top.style.transform = ''; }
  }

  showOverview() {
    this.toggleNotes(false);
    if (this.composing) this.closeComposer();
    const cur = this.topId();
    const tiles = this.deck.cards.map(c => {
      const a = this.s.answers[c.id];
      const stamp = a ? stampWord(c, a.swipe) : '';
      const cls = [c.rarity || 'common', c.id === cur ? 'current' : '', a ? 'answered' : ''].join(' ');
      return `<button class="tile ${cls}" data-act="jump" data-id="${esc(c.id)}">
        <span class="tile-title">${esc(c.title || c.text)}</span>
        <span class="tile-state ${a ? 'dir-' + a.swipe : ''}">${esc(stamp) || 'Waiting'}${a && a.comment ? `<i>${icon('message-square-text')}</i>` : ''}</span>
      </button>`;
    }).join('');
    this.overview.innerHTML = `
      <div class="ov-head">
        <div class="t">${esc(this.deck.title)}</div>
        <div class="n">${Object.keys(this.s.answers).length} / ${this.deck.cards.length}</div>
        <button class="iconbtn" data-act="closegrid" aria-label="Back to the card">${icon('x')}</button>
      </div>
      <div class="ov-grid scroll">
        ${tiles}
        <div class="ov-foot">
          <button class="ghostbtn" data-act="gridnotes">${icon('notebook-pen')}Deck notes</button>
          <button class="ghostbtn" data-act="gridreplan">${icon('rotate-ccw')}Send this whole deck back</button>
        </div>
      </div>`;
    this.overview.hidden = false;
  }

  hideOverview() { this.overview.hidden = true; }

  // Brings any card to the top. An answered one can be thrown again to change the answer.
  jump(id) {
    this.hideOverview();
    if (this.s.reviewing && this.s.reviewing !== id) {
      this.s.order = this.s.order.filter(x => x !== this.s.reviewing);
    }
    this.s.reviewing = this.s.answers[id] ? id : null;
    this.s.order = [id, ...this.s.order.filter(x => x !== id)];
    this.deal();
    this.enter('skip');
    this.save();
  }

  // ---------- the end of the deck

  showEnd(early = false) {
    this.toggleNotes(false);
    if (this.composing) this.closeComposer();
    const groups = DIRS.map(dir => {
      const hits = this.deck.cards.filter(c => this.s.answers[c.id] && this.s.answers[c.id].swipe === dir);
      const words = [...new Set(hits.map(c => stampWord(c, dir)))].join(' / ');
      return { dir, n: hits.length, words };
    }).filter(g => g.n);
    const mins = Math.max(1, Math.round((Date.now() - (this.s.startedAt || Date.now())) / 60000));
    const total = this.deck.cards.length, done = Object.keys(this.s.answers).length;
    const sub = early ? `${done} of ${total} cards answered.` : `${total} card${total === 1 ? '' : 's'} in about ${mins} minute${mins === 1 ? '' : 's'}.`;
    this.endBox.innerHTML = `
      <div class="end-scroll scroll">
        <div class="end-stamp">${early ? 'SEND BACK?' : 'DECK DONE'}</div>
        <div class="end-sub">${esc(sub)}</div>
        <div class="tally">${groups.map(g => `<div class="dir-${g.dir}"><b data-to="${g.n}">0</b><span>${esc(g.words)}</span></div>`).join('')}</div>
        <div class="sheet-title">Anything else on this deck?</div>
        <textarea id="endnotes" placeholder="Further comments…"></textarea>
        <div class="end-actions">
          <button class="primary" data-act="done" ${early ? 'hidden' : ''}>Deck's done</button>
          <button class="secondary" data-act="replan">Replan from the base</button>
          ${early ? '<button class="ghostbtn" data-act="keepgoing">Keep going</button>' : ''}
        </div>
      </div>`;
    const ta = this.endBox.querySelector('#endnotes');
    ta.value = this.s.notes || '';
    ta.addEventListener('input', () => this.notesChanged(ta.value));
    this.endBox.hidden = false;
    this.root.classList.add('ended');
    this.skipBtn.disabled = true;
    this.endBox.querySelectorAll('[data-to]').forEach(b => this.countUp(b));
    if (!early && !this.rewarded) {
      this.rewarded = true;
      confetti(this.host);
      tick();
    }
  }

  hideEnd() {
    this.endBox.hidden = true;
    this.root.classList.remove('ended');
    this.rewarded = false;
  }

  countUp(el) {
    const to = +el.dataset.to, start = performance.now();
    const step = now => {
      const t = clamp((now - start) / 420, 0, 1);
      el.textContent = Math.round(to * (1 - (1 - t) * (1 - t)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  verdict(which) {
    this.sendNotes();
    const tally = {};
    for (const a of Object.values(this.s.answers)) tally[a.swipe] = (tally[a.swipe] || 0) + 1;
    this.s.verdict = which;
    this.s.verdictSig = deckSig(this.deck);
    this.send({ type: 'deck', verdict: which, tally, answered: Object.keys(this.s.answers).length, total: this.deck.cards.length });
    Promise.resolve(this.saveNow()).then(() => this.onVerdict(which));
  }
}
