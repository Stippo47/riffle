// One deck on the table: the card stack, the swipes, the comment box, notes, the overview and the end.
// A card's answer is recorded by what it means. `swipe` is logical: right is go, left is workshop,
// down is idk, up is comment. Which way the finger goes for each is the map in ui.js.
import { TUNE, decide, dominant, progress, track, watchPinch } from './gesture.js';
import { blurHidden, clamp, dragToClose, esc, fillDirs, icon, KINDS, kindOf, logicalOf, MARK_ICON, padBlur, padFocus, padHTML, padReady, padSet, paintNotices, paras, physicalOf, plainSlot, RARITY, revealPad, stampWord, tick } from './ui.js';
import * as store from './store.js';
import { eachAtOnce, enqueue, newId, photoPath, pictureUrl } from './sync.js';
import { openViewer } from './viewer.js';
import { countWords, discardPhoto, drawStrip, photoButton, saveDrawing, savePhoto, stripError } from './photos.js';
import { addressOf, linkButton, linkify, linksIn, linkText, paraLinks, plainLinks, splitAddress } from './links.js';
import { photoUrl } from './photos.js';

const DIRS = ['right', 'left', 'down', 'up'];
const UNIT = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };

export const deckKey = (pack, deck) => `deck:${pack.id}/${deck.id}`;
export const thoughtsKey = pack => `thoughts:${pack.id}`;
const DEMO_ID = 'feel-test';
const DRAFT_SEND_AFTER = 5000;
// Cards where things get ticked. A board can hold any number, an option card a few.
const picksFrom = card => (card.kind === 'board' ? card.items : card.options) || [];
const isPicking = card => card.kind === 'options' || card.kind === 'board';
const BOARD_PREVIEW_ACROSS = 5;
// What a word was when it went, pictures included, so a change means it hasn't.
const mark = (text, pics) => ((pics || []).length ? `${text || ''}|${pics.join()}` : text || '');
// The pictures an event carries. A drawing also says what it was drawn on.
const withPictures = (pics, drawnOn = {}) => {
  if (!(pics || []).length) return {};
  const drawings = Object.fromEntries(pics.filter(id => drawnOn[id]).map(id => [photoPath(id), drawnOn[id]]));
  return { images: pics.map(photoPath), ...(Object.keys(drawings).length ? { drawings } : {}) };
};

// A film on a card, a part or a board: a path, or { src, poster }.
export const videoOf = v => (typeof v === 'string' ? { src: v } : v && v.src ? v : null);
const videosOf = holder => (holder.videos || []).map(videoOf).filter(Boolean);
const PART_MARKS = ['right', 'left', 'down'];
// A part's mark in the card's own words, without the shouting: Good, Problem, Huh?
const partWord = (card, m) => { const w = (KINDS[card.kind] || KINDS.question)[m] || ''; return w === 'IDK' ? w : w.charAt(0) + w.slice(1).toLowerCase(); };
const partSig = (st, pics) => `${st.mark || ''}|${st.text || ''}|${(pics || []).join()}`;
const EMPTY_PART = '||';
const PART_SEND_AFTER = 3000;
const PARTS_ON_FACE = 4;

// A card's or part's pictures and films, in order, for its back or its section. Paths ride along so a
// drawing knows what it was drawn on, and a film not down yet can be fetched when it's looked at.
export function mediaHTML(holder, images = () => null) {
  const pics = (holder.images || []).map(p => [p, images(p)]).filter(([, src]) => src);
  const clips = videosOf(holder).map(v => {
    const src = images(v.src), poster = v.poster ? images(v.poster) : null;
    return `<div class="clip paused" data-path="${esc(v.src)}"${v.poster ? ` data-poster="${esc(v.poster)}"` : ''}>
      <video${src ? ` src="${esc(src)}${poster ? '' : '#t=0.01'}"` : ''}${poster ? ` poster="${esc(poster)}"` : ''} muted loop playsinline preload="metadata" disablepictureinpicture></video>
      <i class="clip-play">${icon('play')}</i>
      <button class="clip-big" data-act="clipbig" aria-label="Watch it full screen">${icon('maximize-2')}</button>
    </div>`;
  });
  return pics.map(([p, src]) => `<img class="mpic" src="${esc(src)}" data-path="${esc(p)}" alt="" draggable="false">`).join('') + clips.join('');
}

const countOf = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const clock = t => `${Math.floor((t || 0) / 60)}:${String(Math.floor((t || 0) % 60)).padStart(2, '0')}`;

// "Bring to notes": a small button at the bottom of the screen, well away from the menu iPhones show over
// selected text, which pages can't add to. It goes by itself after a few seconds.
let pill = null, pillTimer = 0;
function hidePill() {
  clearTimeout(pillTimer);
  if (pill) pill.remove();
  pill = null;
}
function offerPill(kind, onTap) {
  hidePill();
  pill = document.createElement('button');
  pill.className = 'bringpill';
  pill.dataset.kind = kind;
  pill.innerHTML = `${icon('notebook-pen')}<span>Bring to notes</span>`;
  const foot = document.querySelector('.viewer .viewer-foot');
  if (foot) pill.style.bottom = `${foot.offsetHeight + 14}px`;
  document.body.append(pill);
  // Stopping the touch's own default keeps a text selection alive while the button is tapped.
  pill.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  pill.addEventListener('pointerdown', e => e.preventDefault());
  let done = false;
  const act = e => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (done) return;
    done = true;
    onTap();
    tick();
    pill.classList.add('done');
    pill.innerHTML = `${icon('check')}<span>In your notes</span>`;
    clearTimeout(pillTimer);
    pillTimer = setTimeout(hidePill, 1400);
  };
  pill.addEventListener('pointerup', act);
  pill.addEventListener('click', act);
  pillTimer = setTimeout(hidePill, 6000);
}

// One part, on its card's back: its words, pictures and films, its marks, and a comment box of its own.
function partHTML(card, pt, n, images, fill) {
  return `<section class="part" data-part="${esc(pt.id)}">
    <h3><b>${n + 1}</b><span>${esc(fill(pt.title || ''))}</span></h3>
    <div class="part-body">${paraLinks(pt.text || '', fill)}${mediaHTML(pt, images)}</div>
    <div class="part-acts">
      ${PART_MARKS.map(m => `<button class="part-mark" data-act="partmark" data-part="${esc(pt.id)}" data-mark="${m}">${esc(partWord(card, m))}</button>`).join('')}
      <button class="part-say" data-act="partcomment" data-part="${esc(pt.id)}" aria-label="Comment on this part">${icon('message-square-text')}</button>
    </div>
    <button class="attached part-chip" data-act="partcomment" data-part="${esc(pt.id)}" hidden>${icon('message-square-text')}<span></span></button>
    <div class="part-pad" hidden>
      <div class="padwrap">${padHTML(`partpad-${String(card.id).replace(/[^\w-]/g, '')}-${n}`, 'Your comment on this part. Drag down to close.')}<div class="photostrip" hidden></div>${linkButton('part')}${photoButton('part')}</div>
      <button class="ghostbtn part-done" data-act="partdone">Done</button>
    </div>
  </section>`;
}

// Steps the type down if a card doesn't fit its face on a small phone. If it still doesn't, the
// description is cut with a fade and the whole of it moves to the back, so no words are ever lost.
// It can run again: a card hidden in the stack measures nothing until it comes into view.
function fit(node) {
  const face = node.querySelector('.face');
  const fits = () => face.scrollHeight <= face.clientHeight;
  for (const step of ['tight', 'tighter']) {
    if (fits()) return;
    node.classList.add(step);
  }
  if (fits()) return;
  node.classList.add('clipped');
  const more = node.querySelector('.more');
  more.hidden = false;
  more.textContent = 'Tap to read the rest';
  node.querySelector('.back-why').hidden = false;
}

// Which cards at which versions a verdict was given on. If that changes, the verdict no longer holds.
// Handled cards aren't owed, so they don't count.
const deckSig = deck => deck.cards.filter(c => !c.handled).map(c => `${c.id}:${c.version || 1}`).join(',');

const owed = (c, a) => !c.handled && (!a || (c.version || 1) > (a.version || 1));

// Whether a card still gets dealt. A handled card is dealt until it has an answer newer than its
// conclusion, or was skipped once with nothing else left. A new conclusion deals it again.
function wanted(c, s) {
  const a = s.answers[c.id];
  if (!c.handled) return owed(c, a);
  if (s.handledSkipped && s.handledSkipped[c.id] === c.handled.at) return false;
  return !a || a.at < (Date.parse(c.handled.at) || 0);
}

// How far along a deck is, for the pack's page and the rewards.
export function deckSummary(deck, s) {
  const answers = (s && s.answers) || {};
  const due = deck.cards.filter(c => owed(c, answers[c.id]));
  const handled = deck.cards.filter(c => c.handled).length;
  const nothingOwed = handled === deck.cards.length && handled > 0;
  const finished = nothingOwed || !!(s && s.verdict && s.verdictSig === deckSig(deck));
  const RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
  return {
    total: deck.cards.length - handled, left: due.length, handled, finished,
    big: due.filter(c => c.rarity === 'epic' || c.rarity === 'legendary').length,
    top: due.reduce((m, c) => Math.max(m, RANK[c.rarity] || 1), 0), // the most important card still owed
    verdict: finished && s ? s.verdict : null,
  };
}

function fresh(deck) {
  return { order: deck.cards.map(c => c.id), answers: {}, log: [], notes: '', drafts: {}, draftsSent: {}, wordsSent: {}, draftPhotos: {}, notesPhotos: [], notesPhotosSent: [], selections: {}, picksDirty: {}, handledSkipped: {}, parts: {}, partsV: {}, drawnOn: {}, reviewing: null, verdict: null, startedAt: Date.now() };
}

// Owed cards first, handled ones after, each keeping its order. A card being looked at stays on top.
function arrange(s, cards) {
  const top = s.reviewing && s.order[0] === s.reviewing ? [s.order[0]] : [];
  const rest = s.order.slice(top.length);
  s.order = [...top, ...rest.filter(id => !(cards.get(id) && cards.get(id).handled)), ...rest.filter(id => cards.get(id) && cards.get(id).handled)];
}

// A deck can change while it's saved: new cards join the end, gone cards leave, a new version of a
// card (a second try) counts as unanswered again, and a new conclusion on a handled card deals it again.
function reconcile(s, deck) {
  const cards = new Map(deck.cards.map(c => [c.id, c]));
  s.selections = s.selections || {};
  s.handledSkipped = s.handledSkipped || {};
  s.parts = s.parts || {};
  s.partsV = s.partsV || {};
  s.drawnOn = s.drawnOn || {};
  // A second try of a card asks again: marks on its parts no longer stand. Words stay, and aren't sent twice.
  for (const [id, parts] of Object.entries(s.parts)) {
    const c = cards.get(id);
    if (!c || (c.version || 1) <= (s.partsV[id] || 1)) continue;
    for (const st of Object.values(parts)) {
      st.mark = null;
      st.sent = partSig(st, st.photosSent);
    }
    s.partsV[id] = c.version || 1;
  }
  for (const id of Object.keys(s.answers)) {
    const c = cards.get(id);
    if (!c) delete s.answers[id];
    else if (!c.handled && (c.version || 1) > (s.answers[id].version || 1)) delete s.answers[id];
  }
  if (s.reviewing && (!cards.has(s.reviewing) || !s.answers[s.reviewing])) s.reviewing = null;
  s.order = s.order.filter(id => cards.has(id) && (id === s.reviewing || wanted(cards.get(id), s)));
  for (const c of deck.cards) if (wanted(c, s) && !s.order.includes(c.id)) s.order.push(c.id);
  arrange(s, cards);
  if (s.verdict && s.verdictSig !== deckSig(deck)) s.verdict = null;
  s.log = s.log.filter(e => cards.has(e.id));
}

// Queues any words saved states hold that haven't gone yet: notes typed just before the app died,
// and drafts, including ones on cards no longer in the deck. Runs at every start.
export async function queueUnsentWords(topicOf = () => null, cardOf = () => null) {
  for (const key of await store.keys()) {
    if (key.startsWith('thoughts:')) {
      const t = await store.get(key).catch(() => null);
      if (!t || (t.draft || '') === (t.draftSent || '')) continue;
      const pack = key.slice(9);
      enqueue({ pack, topic: null, deck: null, card: null, thought: true, ...(pack === DEMO_ID ? { demo: true } : {}), type: 'draft', text: t.draft || '' });
      t.draftSent = t.draft || '';
      store.set(key, t);
      continue;
    }
    if (!key.startsWith('deck:')) continue;
    const s = await store.get(key).catch(() => null);
    if (!s) continue;
    const [pack, deck] = key.slice(5).split('/');
    const base = { pack, topic: topicOf(pack, deck), deck, ...(pack === DEMO_ID ? { demo: true } : {}) };
    s.draftsSent = s.draftsSent || {};
    s.wordsSent = s.wordsSent || {};
    let changed = false;
    if ((s.notes || '') !== (s.notesSent || '')) {
      enqueue({ ...base, type: 'notes', text: s.notes || '' });
      s.notesSent = s.notes || '';
      s.wordsSent.n = s.notesSent;
      changed = true;
    }
    const dirty = s.picksDirty || {};
    for (const card of new Set([...Object.keys(s.drafts || {}), ...Object.keys(dirty)])) {
      const text = (s.drafts || {})[card] || '';
      if (!dirty[card] && text === (s.draftsSent[card] || '')) continue;
      // Ticks alone in the Feel test are like plain swipes, and stay on the phone.
      if (text || pack !== DEMO_ID) enqueue({ ...base, type: 'draft', card, text, ...(dirty[card] ? { selected: (s.selections || {})[card] || [] } : {}) });
      s.draftsSent[card] = text;
      s.wordsSent[`d:${card}`] = text;
      delete dirty[card];
      changed = true;
    }
    // Words and marks on parts, with their pictures: a pad left open when the app died is closed now.
    for (const [card, parts] of Object.entries(s.parts || {})) {
      const c = cardOf(pack, deck, card) || { id: card };
      for (const [part, st] of Object.entries(parts)) {
        const sig = partSig(st, st.photos);
        if (sig === (st.sent || EMPTY_PART)) continue;
        if (st.text || (st.photos || []).length || pack !== DEMO_ID) enqueue({ ...base, ...partEvent(c, part, st, st.photos, s.drawnOn) });
        st.sent = sig;
        st.photosSent = (st.photos || []).slice();
        s.wordsSent[`p:${card}/${part}`] = mark(st.text, st.photos);
        changed = true;
      }
    }
    if (changed) store.set(key, s);
  }
}

// What's said about one part of a card, or one item on a board. The latest one for each stands.
const itemOf = (card, id) => (card.kind === 'board' ? (card.items || []).find(x => x.id === id) : null);
function partEvent(card, partId, st, pics, drawnOn) {
  const item = itemOf(card, partId);
  const part = item || (card.parts || []).find(x => x.id === partId) || {};
  return {
    type: 'part', card: card.id, cardVersion: card.version || 1, title: card.title || '', kind: card.kind || 'question',
    part: partId, partTitle: (item ? item.label : part.title) || '', ...(item ? { item: true } : {}),
    mark: st.mark || null, stamp: st.mark ? (KINDS[card.kind] || KINDS.question)[st.mark] : '',
    comment: st.text || '', ...withPictures(pics, drawnOn),
  };
}

// Everything written in a deck, for the Feel test's page. A word is sent if wordsSent holds it.
export function wordsIn(deck, s) {
  if (!s) return [];
  const sent = s.wordsSent || {};
  const titleOf = id => {
    const c = deck.cards.find(x => x.id === id);
    return c ? c.title || c.text : id;
  };
  const out = [];
  const photos = s.draftPhotos || {};
  for (const [card, a] of Object.entries(s.answers || {})) {
    if (a.comment || (a.photos || []).length) out.push({ kind: 'comment', key: `c:${card}`, card, where: `${deck.title}: ${titleOf(card)}`, text: a.comment || '', pics: a.photos || [], sent: sent[`c:${card}`] === mark(a.comment, a.photos), answer: a });
  }
  for (const card of new Set([...Object.keys(s.drafts || {}), ...Object.keys(photos)])) {
    const text = (s.drafts || {})[card] || '', pics = photos[card] || [];
    if (text || pics.length) out.push({ kind: 'draft', key: `d:${card}`, card, where: `${deck.title}: ${titleOf(card)} (not swiped yet)`, text, pics, sent: sent[`d:${card}`] === mark(text, pics) });
  }
  for (const [card, parts] of Object.entries(s.parts || {})) {
    const c = deck.cards.find(x => x.id === card);
    for (const [part, st] of Object.entries(parts)) {
      if (!st.text && !(st.photos || []).length) continue;
      const pt = c && (itemOf(c, part) || (c.parts || []).find(x => x.id === part));
      out.push({ kind: 'part', key: `p:${card}/${part}`, card, part, where: `${deck.title}: ${titleOf(card)}, ${pt ? pt.title || pt.label : part}`, text: st.text || '', pics: st.photos || [], sent: sent[`p:${card}/${part}`] === mark(st.text, st.photos), st });
    }
  }
  const notePics = s.notesPhotos || [];
  if (s.notes || notePics.length) out.push({ kind: 'notes', key: 'n', where: `${deck.title}: notes`, text: s.notes || '', pics: notePics, sent: sent.n === mark(s.notes, notePics) });
  return out;
}

// Queues the given words from a deck's state, and marks them as sent, so nothing goes twice.
export function sendWords(pack, deck, s, words) {
  const base = { pack: pack.id, topic: deck.topic || null, deck: deck.id, ...(pack.demo ? { demo: true } : {}) };
  s.wordsSent = s.wordsSent || {};
  for (const w of words) {
    if (w.sent) continue;
    if (w.kind === 'notes') {
      enqueue({ ...base, type: 'notes', text: w.text, ...withPictures(w.pics) });
      s.notesSent = w.text;
      s.notesPhotosSent = w.pics;
    } else if (w.kind === 'draft') {
      enqueue({ ...base, type: 'draft', card: w.card, text: w.text, ...withPictures(w.pics, s.drawnOn) });
      s.draftsSent = s.draftsSent || {};
      s.draftsSent[w.card] = w.text;
    } else if (w.kind === 'part') {
      const c = deck.cards.find(x => x.id === w.card) || { id: w.card };
      enqueue({ ...base, ...partEvent(c, w.part, w.st, w.pics, s.drawnOn) });
      w.st.sent = partSig(w.st, w.pics);
      w.st.photosSent = w.pics.slice();
    } else {
      const c = deck.cards.find(x => x.id === w.card) || { id: w.card };
      enqueue({ ...base, type: 'answer', card: w.card, cardVersion: c.version || 1, title: c.title || '', kind: c.kind || 'question', swipe: w.answer.swipe, stamp: stampWord(c, w.answer.swipe), comment: w.text, ...withPictures(w.pics, s.drawnOn) });
    }
    s.wordsSent[w.key] = mark(w.text, w.pics);
  }
}

// Keeps words listed on the Feel test's page after their deck is cleared.
export async function archiveWords(words) {
  if (!words.length) return;
  const old = (await store.get('feel-archive').catch(() => null)) || [];
  await store.set('feel-archive', [...words.map(w => ({ where: w.where, text: w.text, pics: w.pics })), ...old]);
}

// The parts of the screen that every layout rearranges. The Style screen's preview uses them too.
export const toolsHTML = (ids = true) => {
  const id = name => (ids ? ` id="${name}"` : '');
  return `<div class="tools">
    <button data-act="undo"${id('undo')}>${icon('undo-2')}<span>Undo</span></button>
    <button data-act="notes"${id('notesbtn')}>${icon('notebook-pen')}<span>Notes</span></button>
    <button data-act="skip"${id('skip')}>${icon('skip-forward')}<span>Skip</span></button>
    <button data-act="grid">${icon('layout-grid')}<span>Grid</span></button>
  </div>`;
};

// Pack › Topic › Deck › Card, each a way there. The card's part is filled in as cards are dealt.
export const crumbsHTML = (pack, deck, card = '') => {
  const topic = (pack.topics || []).find(t => t.id === deck.topic);
  return `<nav class="crumbs t" aria-label="Where this is">
    <button class="crumb crumb-pack" data-act="crumbpack">${esc(pack.title)}</button><i class="c-pack">›</i>
    ${topic ? `<button class="crumb crumb-topic" data-act="crumbtopic">${esc(topic.title)}</button><i class="c-topic">›</i>` : ''}
    <button class="crumb crumb-deck" data-act="crumbdeck">${esc(deck.title)}</button><i class="c-card">›</i>
    <button class="crumb crumb-card" data-act="crumbcard" id="crumbcard">${esc(card)}</button>
  </nav>`;
};

// What shows at the edge the card is heading for. Which parts show is the While swiping choice.
export const markHTML = (id = 'mark') => `<div class="edgemark"${id ? ` id="${id}"` : ''}><span class="mark-word"></span><span class="mark-icon"></span></div>`;

export function cardHTML(card, images = () => null, fill = t => t) {
  const kind = kindOf(card);
  const rarity = card.rarity || 'common';
  const breaks = RARITY[rarity] && RARITY[rarity].breaks;
  const label = RARITY[rarity] && RARITY[rarity].label;
  const pics = (card.images || []).map(p => images(p)).filter(Boolean);
  const films = videosOf(card);
  const board = card.kind === 'board' ? (card.items || []) : null;
  const parts = !board && card.kind !== 'options' ? (card.parts || []) : [];
  const hasMore = !board && (card.details || pics.length || films.length || parts.length);
  const bits = [card.details ? 'details' : '', pics.length ? countOf(pics.length, 'picture') : '', films.length ? countOf(films.length, 'video') : ''].filter(Boolean);
  const moreText = parts.length ? `Tap to read the ${countOf(parts.length, 'part')}` : `Tap for ${bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : bits[0] || ''}`;
  const text = fill(card.text || ''), why = fill(card.why || ''), pick = board ? '' : fill(card.pick || '');
  const long = plainLinks(text).length > 70;
  const options = card.kind === 'options' ? (card.options || []) : null;
  const body = card.handled
    ? `<h2 class="q-small">${linkify(card.text || '', fill)}</h2><p class="why how">${linkify(card.handled.how || '', fill)}</p>`
    : `<h2 class="${long ? 'long' : ''}">${linkify(card.text || '', fill)}</h2>${why ? `<p class="why">${linkify(card.why, fill)}</p>` : ''}`;
  return `
    <div class="flip">
      <div class="face">
        <div class="glint"></div>
        ${card.handled ? `<div class="handled-band">${icon('check')}<span>Handled</span></div>` : ''}
        <div class="chips"><span>${esc(card.handled ? 'My conclusion' : kind.label)}</span>${label ? `<span class="warn">· ${esc(label)}</span>` : ''}</div>
        ${body}
        ${options ? `<div class="options">${options.map(o => {
          const src = o.image ? images(o.image) : null;
          return `<div class="option${o.id === card.pick ? ' mypick' : ''}" data-opt="${esc(o.id)}">
            ${src ? `<img src="${esc(src)}" alt="">` : ''}
            <span class="opt-text"><b>${esc(fill(o.label || ''))}</b>${o.text ? `<small>${esc(fill(o.text))}</small>` : ''}</span>
            ${o.id === card.pick ? `<em>${esc(kind.pickLabel || 'My pick')}</em>` : ''}
            <i class="opt-tick">${icon('check')}</i>
          </div>`;
        }).join('')}</div><div class="opt-chosen" hidden></div>` : ''}
        ${board ? '<div class="board-preview"></div><div class="opt-chosen" hidden></div>' : ''}
        ${parts.length ? `<div class="parts-preview">${parts.slice(0, PARTS_ON_FACE).map((pt, n) => `<span class="pp" data-part="${esc(pt.id)}"><i class="pp-n">${n + 1}</i><span>${esc(fill(pt.title || ''))}</span><em class="pp-mark"></em></span>`).join('')}${parts.length > PARTS_ON_FACE ? `<span class="pp pp-more">and ${parts.length - PARTS_ON_FACE} more</span>` : ''}</div>` : ''}
        <div class="prev" hidden></div>
        ${pick && !options && !card.handled ? `<div class="pick"><b>${esc(kind.pickLabel || 'My pick')}</b>${linkify(card.pick, fill)}</div>` : '<div class="pickgap"></div>'}
        <button class="attached" data-act="opencomment" hidden>${icon('message-square-text')}<span></span></button>
        ${breaks ? `<div class="holdline">Hold ${esc(physicalOf('right'))} to break through</div>` : ''}
        <div class="more"${hasMore || board ? '' : ' hidden'}>${board ? `Tap to choose from ${board.length}` : hasMore ? esc(moreText) : ''}</div>
        ${board && (card.details || pics.length || films.length) ? `<button class="more-link" data-act="flipfront">Details</button>` : ''}
        <div class="stamp"></div>
      </div>
      <div class="back">
        <div class="back-scroll">
          <h3>${esc(card.title || text)}</h3>
          <p class="back-why" hidden>${linkify(card.handled ? card.handled.how || '' : card.why || '', fill)}</p>
          ${mediaHTML(card, images)}
          ${paraLinks(card.details || '', fill)}
          ${parts.length ? `<div class="parts-count"></div>${parts.map((pt, n) => partHTML(card, pt, n, images, fill)).join('')}` : ''}
        </div>
        <div class="back-foot">
          <button class="back-hint" data-act="flipback">Tap to flip back</button>
          <button class="back-comment" data-act="opencomment">${icon('message-square-text')}<span>Comment</span></button>
        </div>
      </div>
    </div>`;
}

export class DeckView {
  // `nav` is how this deck reaches the rest of the app: follow(address), linker(...), shrink(), crumb(level),
  // and backBy, the place a link came from, if one did.
  constructor({ host, pack, deck, images, onExit, onVerdict, nav = {} }) {
    Object.assign(this, { host, pack, deck, images, onExit, onVerdict, nav });
    this.cards = new Map(deck.cards.map(c => [c.id, c]));
    this.nodes = new Map();
    this.composing = false;
    this.flipped = false;
    this.armed = false;
    this.charge = 0;
    this.push = null;
    this.broke = false;
    this.scrolling = null;
  }

  async open() {
    this.key = deckKey(this.pack, this.deck);
    this.s = (await store.get(this.key)) || fresh(this.deck);
    this.s.draftsSent = this.s.draftsSent || {};
    this.s.wordsSent = this.s.wordsSent || {};
    this.s.draftPhotos = this.s.draftPhotos || {};
    this.s.notesPhotos = this.s.notesPhotos || [];
    this.s.notesPhotosSent = this.s.notesPhotosSent || [];
    this.s.picksDirty = this.s.picksDirty || {};
    this.s.parts = this.s.parts || {};
    this.s.partsV = this.s.partsV || {};
    this.s.drawnOn = this.s.drawnOn || {};
    reconcile(this.s, this.deck);
    this.render();
    this.deal();
    this.save();
  }

  close() {
    this.untrack && this.untrack();
    if (this.unwatchBring) this.unwatchBring();
    hidePill();
    if (this.partsObserver) this.partsObserver.disconnect();
    if (this.openPart) this.closePartPad();
    this.sendNotes(true);
    this.secure();
  }

  // Everything goes safe: notes, drafts and words on parts into the queue, the deck's state saved.
  // Runs when the app is hidden, and on leaving a deck.
  secure() {
    this.sendNotes(false);
    this.sendDrafts();
    this.sendParts(true);
    return this.saveNow();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 150);
  }
  saveNow() {
    clearTimeout(this.saveTimer);
    return store.set(this.key, JSON.parse(JSON.stringify(this.s)));
  }

  // In the Feel test, plain swipes stay on the phone. Anything typed gets sent, tagged as a test.
  send(event, typed = false) {
    if (this.pack.demo && !typed) return;
    enqueue({ pack: this.pack.id, topic: this.deck.topic || null, deck: this.deck.id, ...(this.pack.demo ? { demo: true } : {}), ...event });
  }

  // A comment still being written goes out a few seconds after typing stops, so a lost phone or a
  // deleted icon doesn't lose it. Only what has changed since the last one.
  sendDrafts() {
    clearTimeout(this.draftTimer);
    let changed = false;
    for (const card of new Set([...Object.keys(this.s.drafts), ...Object.keys(this.s.picksDirty)])) {
      const text = this.s.drafts[card] || '';
      const dirty = this.s.picksDirty[card];
      if (!dirty && text === (this.s.draftsSent[card] || '')) continue;
      const c = this.cards.get(card);
      // Ticks alone in the Feel test are like plain swipes: they stay on the phone.
      this.send({ type: 'draft', card, title: c ? c.title || '' : '', text, ...(c && c.kind === 'board' ? { selected: this.chosen(card) } : {}) }, !!text);
      this.s.draftsSent[card] = text;
      this.s.wordsSent[`d:${card}`] = text;
      delete this.s.picksDirty[card];
      changed = true;
    }
    if (changed) this.saveNow();
  }

  // ---------- layout

  render() {
    this.host.innerHTML = `
      <div class="deck screen" id="deck">
        <div class="topline">
          <div class="deckbar">
            <button class="iconbtn${this.nav.backBy ? ' linked' : ''}" data-act="back" aria-label="${esc(this.nav.backBy ? `Back to ${this.nav.backBy}` : 'Back')}">${icon(this.nav.backBy ? 'corner-up-left' : 'chevron-left')}</button>
            ${crumbsHTML(this.pack, this.deck)}
            <div class="n" id="count" data-slot="notice"></div>
          </div>
          ${toolsHTML()}
        </div>
        <div class="progress"><b id="bar"></b></div>
        <div class="tablewrap">
          <div class="table" id="table"><div class="glow" id="glow"></div></div>
          ${markHTML()}
          <div class="endbox" id="end" hidden></div>
        </div>
        <div class="composer" id="composer" hidden><div class="padwrap">${padHTML('comment', 'Your comment. Drag down to close.')}<div class="photostrip" id="commentphotos" hidden></div>${linkButton('comment')}${photoButton('comment')}</div></div>
        <div class="notes-sheet" id="notes" hidden>
          <button class="sheet-head" data-act="closenotes"><i class="grabber"></i><span>Notes on this deck</span></button>
          <div class="noterefs" id="noterefs" hidden></div>
          <div class="padwrap">${padHTML('notestext', "Anything that doesn't fit a card. Drag down to close.")}<div class="photostrip" id="notesphotos" hidden></div>${linkButton('notes')}${photoButton('notes')}</div>
        </div>
      </div>
      <div class="overview" id="overview" hidden></div>
      <div class="overview boardview" id="boardview" hidden></div>`;
    const $ = id => this.host.querySelector('#' + id);
    Object.assign(this, {
      root: $('deck'), table: $('table'), glow: $('glow'), mark: $('mark'), composer: $('composer'), comment: $('comment'),
      notesSheet: $('notes'), notesText: $('notestext'), endBox: $('end'), overview: $('overview'), boardEl: $('boardview'),
      countEl: $('count'), barEl: $('bar'), undoBtn: $('undo'), skipBtn: $('skip'), notesBtn: $('notesbtn'), crumbCard: $('crumbcard'),
    });
    padSet(this.notesText, this.s.notes || '');
    const crumbs = this.host.querySelector('.crumbs');
    crumbs.addEventListener('scroll', () => crumbs.classList.toggle('scrolled', crumbs.scrollLeft > 2), { passive: true });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { crumbs.scrollLeft = crumbs.scrollWidth; }).observe(crumbs);

    this.host.onchange = e => { if (e.target.matches('[data-photo]')) this.addPhoto(e.target); };
    this.host.onclick = e => {
      const l = this.lift; // something already acted on this same tap, and its click lands on whatever just opened
      if (l && e.detail !== 0 && performance.now() - l.t < 600 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 14) return;
      if (this.pressed && performance.now() - this.pressed < 900) { this.pressed = 0; return; } // the end of a long press
      const link = e.target.closest('.rlink');
      if (link) { e.preventDefault(); this.follow(link.dataset.addr); return; }
      if (e.target.closest('.weblink')) return; // a web address opens as any link does
      const shown = !e.target.closest('.clip-big') && e.target.closest('.back-scroll img, .back-scroll .clip, .partsview img.mpic, .partsview .clip');
      if (shown) {
        if (shown.classList.contains('clip')) this.toggleClip(shown);
        else this.viewMedia(shown);
        return;
      }
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
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
    // No click at all after a touch, or it could put the cursor mid-text in a pad that just opened under it.
    this.root.querySelector('.tools').addEventListener('touchend', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    padReady(this.comment, text => {
      const id = this.topId();
      if (!id) return;
      this.s.drafts[id] = text;
      this.saveNow(); // at once: the backup write is synchronous, so a killed app keeps it
      this.syncAttached();
      clearTimeout(this.draftTimer);
      this.draftTimer = setTimeout(() => this.sendDrafts(), DRAFT_SEND_AFTER);
    });
    padReady(this.notesText, text => this.notesChanged(text));
    this.watchBring();

    // Dragging down brings the comment box or the notes back down, whatever the swipe directions are.
    const follow = el => dy => {
      el.classList.toggle('following', dy > 0);
      el.style.transform = dy > 0 ? `translate3d(0,${dy * 0.8}px,0)` : '';
    };
    dragToClose(this.composer, () => this.comment, follow(this.composer), () => this.closeComposer());
    dragToClose(this.notesSheet, t => (t.closest && t.closest('.pad')) || null, follow(this.notesSheet), () => this.toggleNotes(false));

    this.untrack = track(this.table, {
      blocked: e => this.flipped || !this.topId() || (e.target && e.target.closest && e.target.closest('button')),
      start: e => { this.dragFrom = e.target; this.scrolling = null; },
      move: d => this.onMove(d),
      release: d => this.onRelease(d),
      cancel: () => { if (this.broke) this.broke = false; else this.spring(); },
      tap: e => this.onTap(e),
      pinchStart: () => { this.spring(); this.pinchFired = false; },
      pinch: s => this.onPinch(s),
      pinchEnd: () => this.onPinchEnd(),
    });
    // At the end of a deck there's no card to pinch, so the end itself takes the pinch.
    watchPinch(this.endBox, () => { if (!this.topId() && this.nav.shrink) this.nav.shrink(); });
    paintNotices();
  }

  act(name, btn) {
    const go = {
      back: () => this.exit(),
      undo: () => this.undo(),
      skip: () => this.skip(),
      notes: () => this.toggleNotes(),
      closenotes: () => this.toggleNotes(false),
      grid: () => this.showOverview(),
      closegrid: () => this.hideOverview(),
      jump: () => this.jump(btn.dataset.id),
      gridnotes: () => { this.hideOverview(); if (this.topId()) this.toggleNotes(true); else padFocus(this.endBox.querySelector('#endnotes')); },
      gridreplan: () => { this.hideOverview(); this.showEnd('replan'); },
      gridover: () => { this.hideOverview(); this.showStartOver(); },
      gridarchive: () => this.nav.archive && this.nav.archive(),
      overkeep: () => this.startOver(true),
      overclear: () => this.startOver(false),
      flipback: () => this.flip(false),
      flipfront: () => this.flip(true),
      closeboard: () => this.closeBoard(),
      boardtick: () => this.toggleBoard(btn.dataset.id),
      boardview: () => this.viewBoard(btn.dataset.id),
      done: () => this.verdict('done'),
      replan: () => this.verdict('replan'),
      opencomment: () => this.openComposer(),
      rmphoto: () => this.dropPhoto(btn.dataset.photoId, btn.dataset.where, btn),
      keepgoing: () => this.deal(),
      clipbig: () => this.viewMedia(btn.closest('.clip')),
      shrink: () => this.nav.shrink && this.nav.shrink(),
      crumbpack: () => this.nav.crumb && this.nav.crumb('pack'),
      crumbtopic: () => this.nav.crumb && this.nav.crumb('topic'),
      crumbdeck: () => this.showOverview(),
      crumbcard: () => this.toCard(),
      linkcard: () => this.linkCard(btn.dataset.where),
      noteref: () => this.openRef(btn.dataset.addr),
      partmark: () => this.markPart(btn.dataset.part, btn.dataset.mark),
      partcomment: () => this.openPartPad(btn.dataset.part),
      partdone: () => this.closePartPad(),
    }[name];
    go && go();
  }

  exit() {
    this.saveNow();
    this.onExit && this.onExit();
  }

  // ---------- bringing a picture, a film's moment or some words into the deck's notes

  watchBring() {
    const onSel = () => {
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { if (pill && pill.dataset.kind === 'quote' && !pill.classList.contains('done')) hidePill(); return; }
      const node = sel.getRangeAt(0).commonAncestorContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      const top = this.topNode();
      if (!el || !top || !top.contains(el) || !el.closest('.back-scroll') || el.closest('.pad')) return;
      const text = sel.toString().replace(/\s+/g, ' ').trim();
      if (!text) return;
      const part = el.closest('.part');
      this.offerBring({ kind: 'quote', text: text.slice(0, 400), card: this.topId(), part: part ? part.dataset.part : null });
    };
    // Held still on a picture or a film on the back for about half a second.
    const onDown = e => {
      const m = e.target.closest && e.target.closest('.back-scroll img.mpic, .back-scroll .clip');
      if (!m || e.target.closest('.clip-big') || !this.flipped || !this.topNode() || !this.topNode().contains(m)) return;
      const x0 = e.clientX, y0 = e.clientY;
      const stop = () => {
        clearTimeout(timer);
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', stop, true);
        removeEventListener('pointercancel', stop, true);
      };
      const move = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) stop(); };
      const timer = setTimeout(() => {
        stop();
        this.pressed = performance.now();
        const part = m.closest('.part');
        const film = m.classList.contains('clip');
        if (film) m.querySelector('video').pause();
        this.offerBring({ kind: film ? 'film' : 'pic', path: m.dataset.path, t: film ? m.querySelector('video').currentTime : 0, card: this.topId(), part: part ? part.dataset.part : null });
        tick();
      }, 520);
      addEventListener('pointermove', move, true);
      addEventListener('pointerup', stop, true);
      addEventListener('pointercancel', stop, true);
    };
    // No picture menu or callout on a long press here: the button takes its place.
    const onMenu = e => { if (e.target.closest && e.target.closest('.back-scroll img, .back-scroll .clip, .viewer-stage')) e.preventDefault(); };
    document.addEventListener('selectionchange', onSel);
    this.host.addEventListener('pointerdown', onDown);
    document.addEventListener('contextmenu', onMenu);
    this.unwatchBring = () => {
      document.removeEventListener('selectionchange', onSel);
      this.host.removeEventListener('pointerdown', onDown);
      document.removeEventListener('contextmenu', onMenu);
    };
  }

  offerBring(info) {
    offerPill(info.kind, () => this.bringToNotes(info));
  }

  // Where the caret was in the notes, as a place in their words, even when the notes aren't open.
  notesOffset() {
    const pad = this.notesText;
    const r = pad.caret;
    if (r && pad.contains(r.startContainer)) {
      const pre = document.createRange();
      pre.selectNodeContents(pad);
      pre.setEnd(r.startContainer, r.startOffset);
      return pre.toString().length;
    }
    return this.notesAt ?? (this.s.notes || '').length;
  }

  // Puts a reference into the notes at the caret, on a line of its own: a link the notes show as a chip.
  // A film's says the moment it was stopped at; words are quoted; a drawing comes along as a picture.
  async bringToNotes(info) {
    const card = this.cards.get(info.card);
    if (!card) return;
    const part = info.part && (card.parts || []).find(x => x.id === info.part);
    const title = card.title || plainLinks(card.text || '');
    const label = part ? `${title} › ${part.title}` : title;
    const address = addressOf(this.pack.id, this.deck.id, card.id, info.part || null);
    // Only what would break the link is encoded, so the notes stay readable: img/walk.mp4, not img%2Fwalk.mp4.
    const safe = v => String(v || '').replace(/[\s()[\]&?#%]/g, encodeURIComponent);
    const path = safe(info.path);
    let token;
    if (info.kind === 'quote') token = `“${info.text}” ${linkText(label, address)}`;
    else if (info.kind === 'film') token = linkText(`Film at ${clock(info.t)}, ${label}`, `${address}?film=${path}&t=${(info.t || 0).toFixed(1)}`);
    else token = linkText(`Picture, ${label}`, `${address}?pic=${path}`);
    if (info.blob) {
      const id = await saveDrawing(info.blob, info.path || '');
      this.s.drawnOn[id] = info.path || '';
      this.s.notesPhotos.push(id);
      token = linkText(`Drawing, ${label}`, `${address}?pic=${path}&drawing=${safe(photoPath(id))}`);
    }
    const notes = this.s.notes || '';
    const at = clamp(this.notesOffset(), 0, notes.length);
    const before = notes.slice(0, at), after = notes.slice(at);
    const lead = before && !before.endsWith('\n') ? '\n' : '';
    const tail = after.startsWith('\n') ? '' : '\n';
    const next = before + lead + token + tail + after;
    this.notesAt = (before + lead + token + tail).length;
    this.notesText.caret = null;
    padSet(this.notesText, next);
    const end = this.endBox.querySelector('#endnotes');
    if (end) padSet(end, next);
    this.notesChanged(next);
    this.drawPhotos();
  }

  // The things brought to the notes, and any cards they link, as chips above the pad.
  drawNoteRefs() {
    const refs = linksIn(this.s.notes || '').filter(l => l.address);
    for (const id of ['noterefs', 'endrefs']) {
      const box = this.host.querySelector(`#${id}`);
      if (!box) continue;
      box.hidden = !refs.length;
      box.innerHTML = refs.map(l => {
        const what = /[?&]film=/.test(l.address) ? 'play' : /[?&](pic|drawing)=/.test(l.address) ? 'image' : 'link';
        return `<button class="noteref" data-act="noteref" data-addr="${esc(l.address)}">${icon(what)}<span>${esc(l.label)}</span></button>`;
      }).join('');
    }
  }

  // Reopens what a reference in the notes points at: the picture, the film at its moment, the drawing,
  // or the card. One in another deck is followed there.
  openRef(address) {
    const [base, query = ''] = String(address).split('?');
    const [packId, deckId, cardId, partId] = splitAddress(base);
    const q = new URLSearchParams(query);
    if (packId !== this.pack.id || deckId !== this.deck.id || !this.cards.has(cardId)) { this.follow(base); return; }
    this.toggleNotes(false);
    const card = this.cards.get(cardId);
    const drawing = q.get('drawing'), pic = q.get('pic'), film = q.get('film');
    if (drawing) {
      const id = drawing.replace(/^answers\/img\//, '').replace(/\.jpg$/, '');
      openViewer({ items: [{ full: () => photoUrl(id), label: 'Your drawing' }] });
      return;
    }
    if (pic || film) {
      const holder = (partId && (card.parts || []).find(x => x.id === partId)) || card;
      const items = [
        ...(holder.images || []).map(path => ({ path, full: () => pictureUrl(this.pack.id, path) })),
        ...videosOf(holder).map(v => ({ path: v.src, full: () => (v.poster ? pictureUrl(this.pack.id, v.poster) : null), video: () => pictureUrl(this.pack.id, v.src) })),
      ].map(it => ({ ...it, inkKey: this.inkKeyOf(cardId, partId, it.path), on: it.path }));
      this.viewing = items;
      openViewer({ items, at: Math.max(0, items.findIndex(it => it.path === (pic || film))), start: film ? +q.get('t') || 0 : null, ink: this.inkFor(cardId, partId) });
      return;
    }
    this.jump(cardId, partId);
    const c = this.topCard();
    if (c && !partId && (c.details || (c.images || []).length || videosOf(c).length)) this.flip(true);
  }

  // ---------- links, and where this is

  // Following a link leaves this deck, remembering where it was, so Back comes here again.
  follow(address) {
    if (!address || !this.nav.follow) return;
    this.saveNow();
    this.nav.follow(address);
  }

  // Where things are now, for coming back to: the card on top, its parts, and what was being typed.
  place() {
    const card = this.topCard();
    const partsOpen = !!this.partsCard;
    const sum = deckSummary(this.deck, this.s);
    const part = partsOpen ? (this.openPart || this.visiblePart()) : null;
    const partTitle = part && ((card.parts || []).find(p => p.id === part) || {}).title;
    return {
      kind: 'deck', pack: this.pack.id, deck: this.deck.id, card: this.topId(),
      part, partsOpen, flipped: this.flipped,
      composing: this.composing, partComposing: !!(partsOpen && this.openPart),
      show: card
        ? { deckTitle: this.deck.title, title: card.title || '', text: card.text || '', rarity: card.rarity || 'common', kind: card.kind || 'question', part: partTitle || '', handled: !!card.handled }
        : { deckTitle: this.deck.title, done: true, text: 'Deck done', said: `${sum.total - sum.left} of ${sum.total} answered` },
    };
  }

  // The part at the top of the card's back, as far as it's scrolled.
  visiblePart() {
    const node = this.topNode();
    const box = node && node.querySelector('.back-scroll');
    if (!box) return null;
    const top = box.getBoundingClientRect().top;
    const sec = [...node.querySelectorAll('.back .part')].find(x => x.getBoundingClientRect().bottom > top + 40);
    return sec ? sec.dataset.part : null;
  }

  // The card crumb brings the card itself back into view, from its back or its parts.
  toCard() {
    if (!this.overview.hidden) this.hideOverview();
    if (this.flipped) { this.flip(false); return; }
    const top = this.topNode();
    if (top && top.animate) top.animate([{ transform: 'scale(1)' }, { transform: 'scale(.98)' }, { transform: 'scale(1)' }], { duration: 200 });
  }

  syncCrumbs() {
    if (!this.crumbCard) return;
    const card = this.topCard();
    this.crumbCard.textContent = card ? card.title || plainLinks(card.text || '') : 'The end';
    this.crumbCard.disabled = !card;
    // One row that scrolls sideways, full names and all, showing its end: where this is.
    const row = this.crumbCard.parentElement;
    requestAnimationFrame(() => { row.scrollLeft = row.scrollWidth; row.classList.toggle('scrolled', row.scrollLeft > 2); });
  }

  // The link button in a box to type in: this card or part, the mini player's card, or one from a list.
  linkCard(where) {
    if (!this.nav.linker) return;
    const card = this.cards.get(where === 'part' ? this.partsCard : this.topId());
    let pad = this.comment, here = null;
    if (where === 'part') {
      const part = card && (card.parts || []).find(p => p.id === this.openPart);
      pad = this.partPad(card && card.id, this.openPart);
      if (part) here = { address: addressOf(this.pack.id, this.deck.id, card.id, part.id), label: `${card.title || plainLinks(card.text)} › ${part.title}`, what: 'This part' };
    } else if (where === 'notes' || where === 'endnotes') {
      pad = where === 'notes' ? this.notesText : this.endBox.querySelector('#endnotes');
      here = { address: addressOf(this.pack.id, this.deck.id), label: this.deck.title, what: 'This deck' };
    } else if (card) {
      here = { address: addressOf(this.pack.id, this.deck.id, card.id), label: card.title || plainLinks(card.text), what: 'This card' };
    }
    if (pad) this.nav.linker({ pad, here, packId: this.pack.id });
  }

  topId() { return this.s.order[0] || null; }
  topNode() { return this.nodes.get(this.topId()); }
  topCard() { return this.cards.get(this.topId()); }

  // ---------- cards

  buildCard(card) {
    const n = document.createElement('div');
    n.className = `card ${card.rarity || 'common'}${card.handled ? ' is-handled' : ''}${card.kind === 'options' ? ' is-options' : ''}`;
    n.dataset.id = card.id;
    n.innerHTML = cardHTML(card, this.images, this.pack.demo ? fillDirs : t => t);
    if (this.hasParts(card)) this.wireParts(n, card);
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
      if (i < 2) {
        fit(n);
        this.drawPreview(n, this.cards.get(id));
      }
    });
    this.table.style.setProperty('--rise', 0);
    this.glow.style.opacity = 0;
    this.glow.style.transform = '';
    this.hideMark();
    this.armed = false;
    this.flipped = false;
    this.openPart = null;
    this.root.classList.remove('reading', 'parttyping');
    this.table.classList.remove('flipped');
    for (const n of this.nodes.values()) {
      n.querySelector('.flip').classList.remove('flipped', 'flat', 'turn-in', 'turn-out');
      this.playClips(n, false);
    }

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
      this.syncOptions();
      this.syncPartsPreview();
    }
    this.syncCrumbs();
    this.updateCounts();
    if (!ids.length) this.showEnd();
    else this.hideEnd();
  }

  updateCounts() {
    const sum = deckSummary(this.deck, this.s);
    const done = sum.total - sum.left;
    plainSlot(this.countEl, sum.total ? `${done} / ${sum.total}` : `${sum.handled} handled`);
    this.barEl.style.width = `${(done / Math.max(1, sum.total)) * 100}%`;
    this.undoBtn.disabled = !this.s.log.length;
    this.skipBtn.disabled = !this.topId();
  }

  draft(id = this.topId()) { return (id && this.s.drafts[id]) || ''; }
  draftPics(id = this.topId()) { return (id && this.s.draftPhotos[id]) || []; }
  hasDraft() { return !!this.draft().trim() || this.draftPics().length > 0; }

  syncAttached() {
    const top = this.topNode();
    if (!top) return;
    const chip = top.querySelector('.attached');
    const text = this.draft().trim(), n = this.draftPics().length;
    chip.hidden = (!text && !n) || this.composing;
    chip.querySelector('span').textContent = [plainLinks(text), n ? countWords(n) : ''].filter(Boolean).join(' · ');
  }

  syncPrev() {
    const top = this.topNode();
    if (!top) return;
    const id = this.topId();
    const box = top.querySelector('.prev');
    const a = this.s.answers[id];
    box.hidden = !a;
    if (!a) return;
    const card = this.cards.get(id);
    const chosen = a.selected && a.selected.length ? `: ${this.optionNames(card, a.selected)}` : '';
    const again = card.handled ? 'This is a newer conclusion.' : 'Swipe it again to change that.';
    box.innerHTML = `You said ${esc(stampWord(card, a.swipe))}${esc(chosen)}${a.comment ? `, "${linkify(a.comment)}"` : ''}. ${esc(again)}`;
  }

  // ---------- option cards

  optionNames(card, ids) {
    const names = ids.map(id => picksFrom(card).find(o => o.id === id)).filter(Boolean).map(o => o.label);
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
  }

  chosen(id = this.topId()) { return (this.s.selections[id] || []).slice(); }

  syncOptions() {
    const top = this.topNode();
    const card = this.topCard();
    if (!top || !card || !isPicking(card)) return;
    const picked = this.chosen();
    if (card.kind === 'board') this.drawPreview(top, card);
    top.querySelectorAll('.option').forEach(o => o.classList.toggle('on', picked.includes(o.dataset.opt)));
    const line = top.querySelector('.opt-chosen');
    if (line) {
      line.hidden = !picked.length;
      line.textContent = picked.length ? `Picked: ${this.optionNames(card, picked)}` : '';
    }
  }

  // Right on an option card needs something to go with: what's tapped, or my marked pick.
  cannotGo(logical) {
    const card = this.topCard();
    return logical === 'right' && card && isPicking(card) && !this.chosen().length && !(card.pick && card.pick.length);
  }

  // ---------- boards: a screen of their own, because a card's vertical drags are swipes

  // A few small pictures on the card itself, the ticked ones first.
  drawPreview(node, card) {
    const box = node.querySelector('.board-preview');
    if (!box || !box.clientWidth || !box.clientHeight) return;
    const gap = 4;
    const cell = (box.clientWidth - gap * (BOARD_PREVIEW_ACROSS - 1)) / BOARD_PREVIEW_ACROSS;
    const rows = Math.max(1, Math.floor((box.clientHeight + gap) / (cell + gap)));
    const picked = this.chosen(card.id);
    const items = card.items || [];
    const order = [...items.filter(it => picked.includes(it.id)), ...items.filter(it => !picked.includes(it.id))];
    const room = rows * BOARD_PREVIEW_ACROSS;
    const shown = order.slice(0, room);
    const extra = items.length - shown.length;
    box.innerHTML = shown.map((it, i) => `<span class="bp${picked.includes(it.id) ? ' on' : ''}${it.video ? ' film' : ''}"><img alt="" draggable="false">${it.video ? `<i class="bp-film">${icon('play')}</i>` : ''}${extra && i === shown.length - 1 ? `<b class="bp-more">+${extra + 1}</b>` : ''}</span>`).join('');
    const imgs = box.querySelectorAll('img');
    eachAtOnce(shown.map((it, i) => [it, imgs[i]]), 6, async ([it, img]) => {
      const url = await pictureUrl(this.pack.id, it.thumb || it.image);
      if (url) img.src = url;
    });
  }

  openBoard() {
    const card = this.topCard();
    if (!card || card.kind !== 'board') return;
    this.typingBeforeBoard = this.composing;
    if (this.composing) padBlur(this.comment);
    const items = card.items || [];
    const mine = [].concat(card.pick || []);
    this.boardEl.innerHTML = `
      <div class="ov-head">
        <button class="iconbtn" data-act="closeboard" aria-label="Back to the card">${icon('chevron-left')}</button>
        <div class="t">${esc(card.title || card.text)}</div>
        <div class="n" id="boardcount"></div>
      </div>
      <div class="board-grid scroll">
        ${items.map(it => `<div class="bt${it.video ? ' film' : ''}" data-item="${esc(it.id)}">
          <button class="bt-pic" data-act="boardview" data-id="${esc(it.id)}" aria-label="Look at ${esc(it.label)}"><img alt="" draggable="false">${it.video ? `<i class="bt-film">${icon('play')}</i>` : ''}<i class="bt-said" aria-label="Has your comment">${icon('message-square-text')}</i></button>
          ${mine.includes(it.id) ? `<em class="bt-mine">${esc(kindOf(card).pickLabel)}</em>` : ''}
          <button class="bt-tick" data-act="boardtick" data-id="${esc(it.id)}" aria-label="Select ${esc(it.label)}"><i>${icon('check')}</i></button>
          <button class="bt-label" data-act="boardtick" data-id="${esc(it.id)}">${esc(it.label)}</button>
        </div>`).join('')}
      </div>
      <div class="board-bar"><button class="primary" data-act="closeboard">Back to the card</button></div>`;
    this.boardEl.hidden = false;
    this.syncBoard();
    const tiles = [...this.boardEl.querySelectorAll('.bt')];
    // Small pictures only, so a big board is quick. The full ones come when one is looked at.
    eachAtOnce(items.map((it, i) => [it, tiles[i]]), 8, async ([it, tile]) => {
      const url = await pictureUrl(this.pack.id, it.thumb || it.image);
      if (url) tile.querySelector('img').src = url;
      else tile.classList.add('missing');
    });
  }

  syncBoard() {
    const picked = this.chosen();
    const said = this.s.parts[this.topId()] || {};
    this.boardEl.querySelectorAll('.bt').forEach(t => {
      t.classList.toggle('on', picked.includes(t.dataset.item));
      t.classList.toggle('said', !!((said[t.dataset.item] || {}).text || '').trim());
    });
    const count = this.boardEl.querySelector('#boardcount');
    if (count) count.textContent = `${picked.length} selected`;
  }

  closeBoard() {
    this.boardEl.hidden = true;
    this.boardEl.innerHTML = '';
    this.syncOptions();
    if (this.typingBeforeBoard && this.composing) padFocus(this.comment);
    this.typingBeforeBoard = false;
  }

  // Ticks or unticks one, and keeps it at once: a half-finished selection survives being closed.
  togglePick(id, itemId) {
    const card = this.cards.get(id);
    const picked = this.chosen(id);
    const at = picked.indexOf(itemId);
    if (at >= 0) picked.splice(at, 1); else picked.push(itemId);
    const inOrder = picksFrom(card).map(o => o.id);
    this.s.selections[id] = picked.sort((a, b) => inOrder.indexOf(a) - inOrder.indexOf(b));
    if (card.kind === 'board') {
      this.s.picksDirty[id] = true;
      clearTimeout(this.draftTimer);
      this.draftTimer = setTimeout(() => this.sendDrafts(), DRAFT_SEND_AFTER);
    }
    this.saveNow();
    tick();
  }

  toggleBoard(itemId) {
    this.togglePick(this.topId(), itemId);
    this.syncBoard();
  }

  viewBoard(itemId) {
    const card = this.topCard();
    const items = card.items || [];
    this.viewing = items.map(it => {
      const film = videoOf(it.video);
      return {
        label: it.label,
        text: it.text,
        thumb: () => pictureUrl(this.pack.id, it.thumb),
        full: () => pictureUrl(this.pack.id, it.image || (film && film.poster)),
        ...(film ? { video: () => pictureUrl(this.pack.id, film.src) } : {}),
        inkKey: this.inkKeyOf(card.id, null, it.id),
        on: `${it.label || it.id} (${it.image || (film && film.src) || it.id})`,
      };
    });
    openViewer({
      items: this.viewing,
      at: Math.max(0, items.findIndex(it => it.id === itemId)),
      picks: {
        isOn: i => this.chosen().includes(items[i].id),
        toggle: i => this.toggleBoard(items[i].id),
        count: () => this.chosen().length,
      },
      ink: this.inkFor(card.id, null, () => { this.closeBoard(); this.openComposer(); }),
      // A comment on one item, kept and sent like a part's.
      comments: {
        text: i => ((this.s.parts[card.id] || {})[items[i].id] || {}).text || '',
        typed: (i, text) => { this.partTyped(card.id, items[i].id, text); this.syncBoard(); },
        done: () => { this.sendParts(true); this.syncBoard(); },
      },
    });
  }

  // ---------- pictures and films elsewhere on a card, and on its parts

  // Where a drawing is kept while it's being made: the picture, on this card or part, in this deck.
  inkKeyOf(cardId, partId, what) { return `${this.pack.id}/${this.deck.id}/${cardId}/${partId || '-'}/${what}`; }

  // What a drawing does once it's made: it becomes a photo on the comment it belongs to, the card's or
  // the part's, and Done opens that comment so the words can go with it.
  inkFor(cardId, partId, done = null) {
    const items = this.viewing;
    return {
      save: async (i, blob) => {
        const on = (items && items[i] && items[i].on) || '';
        const id = await saveDrawing(blob, on);
        this.s.drawnOn[id] = on;
        if (partId) {
          const st = this.partState(cardId, partId);
          st.photos = [...(st.photos || []), id];
          this.s.partsV[cardId] = (this.cards.get(cardId) || {}).version || 1;
          this.saveNow();
          this.drawPartPhotos(cardId, partId);
          this.syncPartChip(cardId, partId);
        } else {
          this.s.draftPhotos[cardId] = [...(this.s.draftPhotos[cardId] || []), id];
          this.saveNow();
          await this.drawPhotos();
          this.syncAttached();
        }
      },
      done: () => (done ? done() : partId ? this.openPartPad(partId) : this.openComposer()),
    };
  }

  // Everything in the same place as what was tapped: a card's back, or one part.
  viewMedia(el) {
    const section = el.closest('.part');
    const box = section || el.closest('.back-scroll');
    if (!box) return;
    const card = this.topCard();
    if (!card) return;
    const partId = section ? section.dataset.part : null;
    // The card's own pictures, or one part's: never both, so a drawing goes on the right comment.
    const all = [...box.querySelectorAll('img.mpic, .clip')].filter(x => section || !x.closest('.part'));
    for (const v of box.querySelectorAll('.clip video')) v.pause();
    this.viewing = all.map(x => {
      const path = x.dataset.path;
      const inkKey = this.inkKeyOf(card.id, partId, path);
      if (!x.classList.contains('clip')) return { full: () => x.src, inkKey, on: path };
      const v = x.querySelector('video');
      return {
        full: () => (x.dataset.poster ? pictureUrl(this.pack.id, x.dataset.poster) : null),
        video: async () => (v.currentSrc && v.currentSrc.startsWith('blob:') ? v.currentSrc.split('#')[0] : pictureUrl(this.pack.id, path)),
        inkKey, on: path,
      };
    });
    this.openViewerKeepingWords({
      items: this.viewing,
      at: Math.max(0, all.indexOf(el)),
      // A drawing on the card's own picture, above its parts, goes on the card's comment.
      ink: this.inkFor(card.id, partId),
      bring: (i, info) => this.offerBring({ ...info, card: card.id, part: partId, path: this.viewing[i] && this.viewing[i].on }),
      onClose: () => { if (this.partsCard) this.watchPartClips(); else this.playClips(this.topNode(), this.flipped); },
    });
  }

  viewOptionPictures(optionId) {
    const card = this.topCard();
    const withPics = (card.options || []).filter(o => o.image);
    this.viewing = withPics.map(o => ({ label: o.label, text: o.text, full: () => pictureUrl(this.pack.id, o.image), inkKey: this.inkKeyOf(card.id, null, o.id), on: `${o.label} (${o.image})` }));
    this.openViewerKeepingWords({
      items: this.viewing,
      at: Math.max(0, withPics.findIndex(o => o.id === optionId)),
      opener: this.lift,
      picks: {
        isOn: i => this.chosen().includes(withPics[i].id),
        toggle: i => { this.togglePick(this.topId(), withPics[i].id); this.syncOptions(); },
        count: () => this.chosen().length,
      },
      ink: this.inkFor(card.id, null),
    });
  }

  // The keyboard drops while a picture is open, and comes back after. The words are saved as typed.
  openViewerKeepingWords(options) {
    const typing = this.composing;
    if (typing) padBlur(this.comment);
    const after = options.onClose || (() => {});
    openViewer({ ...options, onClose: () => { if (typing && this.composing) padFocus(this.comment); after(); } });
  }

  // Films on a card's back play while it shows, muted and looping. A tap pauses or plays one.
  playClips(node, on) {
    if (!node) return;
    for (const clip of node.querySelectorAll('.back .clip')) {
      const v = clip.querySelector('video');
      v.muted = true;
      if (on && !clip.dataset.stopped) this.startClip(clip);
      else { v.pause(); clip.classList.add('paused'); }
    }
  }

  // A film that hadn't come down yet is fetched the first time it's wanted.
  async startClip(clip) {
    const v = clip.querySelector('video');
    if (!v.getAttribute('src')) {
      const url = await pictureUrl(this.pack.id, clip.dataset.path);
      if (!url) { clip.classList.add('missing'); return; }
      if (!v.getAttribute('src')) v.src = url;
      if (!v.poster && clip.dataset.poster) pictureUrl(this.pack.id, clip.dataset.poster).then(u => { if (u) v.poster = u; });
    }
    clip.classList.remove('missing');
    v.muted = true;
    v.play().then(() => clip.classList.remove('paused')).catch(() => clip.classList.add('paused'));
  }

  toggleClip(clip) {
    const v = clip.querySelector('video');
    if (v.paused) { delete clip.dataset.stopped; this.startClip(clip); }
    else { v.pause(); clip.dataset.stopped = '1'; clip.classList.add('paused'); }
  }

  // ---------- parts: sections of one card, read on its back, each marked and commented on by itself

  hasParts(card) { return !!(card && (card.parts || []).length && card.kind !== 'options' && card.kind !== 'board'); }

  // The card whose parts are showing: the top one, flipped to its back.
  get partsCard() { const c = this.topCard(); return this.flipped && this.hasParts(c) ? c.id : null; }

  partState(cardId, partId) {
    const all = this.s.parts[cardId] = this.s.parts[cardId] || {};
    return all[partId] = all[partId] || { mark: null, text: '', photos: [], photosSent: [], sent: EMPTY_PART };
  }

  // The part titles on a card's face show what each has been marked.
  syncPartsPreview() {
    const top = this.topNode();
    const card = this.topCard();
    if (!top || !card || !(card.parts || []).length) return;
    const states = this.s.parts[card.id] || {};
    top.querySelectorAll('.pp[data-part]').forEach(row => {
      const st = states[row.dataset.part];
      row.dataset.mark = (st && st.mark) || '';
      row.querySelector('.pp-mark').textContent = st && st.mark ? partWord(card, st.mark) : '';
      row.classList.toggle('said', !!(st && (st.text || (st.photos || []).length)));
    });
  }

  // A card's parts come built into its back. This fills in what's been said on them, and wires their boxes.
  wireParts(node, card) {
    for (const pt of card.parts || []) {
      const pad = this.partPad(card.id, pt.id, node);
      if (!pad) continue;
      const st = (this.s.parts[card.id] || {})[pt.id];
      padSet(pad, (st && st.text) || '');
      padReady(pad, text => this.partTyped(card.id, pt.id, text));
      dragToClose(pad, () => pad, () => {}, () => this.closePartPad());
      this.syncPart(card.id, pt.id, node);
      this.drawPartPhotos(card.id, pt.id, node);
    }
    this.syncPartsCount(card.id, node);
  }

  // Flips the card to its parts, and scrolls to one if asked. Pictures above it come in after this and
  // push it down, so it's scrolled to again as each arrives, until the reader scrolls for themselves.
  openParts(partId = null) {
    const card = this.topCard();
    if (!this.hasParts(card)) return;
    if (!this.flipped) this.flip(true);
    if (!partId) return;
    const node = this.topNode();
    const scroller = node.querySelector('.back-scroll');
    let touched = false;
    const to = () => {
      const sec = this.partSection(card.id, partId);
      if (sec && !touched && this.topId() === card.id) scroller.scrollTop = sec.offsetTop - scroller.offsetTop - 8;
    };
    scroller.addEventListener('touchstart', () => { touched = true; }, { once: true, passive: true });
    scroller.addEventListener('wheel', () => { touched = true; }, { once: true, passive: true });
    node.querySelectorAll('.back img').forEach(m => { if (!m.complete) m.addEventListener('load', to, { once: true }); });
    node.querySelectorAll('.back video').forEach(m => m.addEventListener('loadedmetadata', to, { once: true }));
    to();
  }

  closeParts() { if (this.flipped) this.flip(false); }

  partSection(cardId, partId, node = this.nodes.get(cardId)) { return node && partId ? node.querySelector(`.back .part[data-part="${CSS.escape(partId)}"]`) : null; }
  partPad(cardId, partId, node) { const sec = this.partSection(cardId, partId, node); return sec && sec.querySelector('.pad'); }

  syncPart(cardId, partId, node) {
    const section = this.partSection(cardId, partId, node);
    if (!section) return;
    const st = (this.s.parts[cardId] || {})[partId] || {};
    section.querySelectorAll('.part-mark').forEach(b => b.classList.toggle('on', b.dataset.mark === st.mark));
    section.dataset.mark = st.mark || '';
    this.syncPartChip(cardId, partId, node);
  }

  syncPartChip(cardId, partId, node) {
    const section = this.partSection(cardId, partId, node);
    if (!section) return;
    const st = (this.s.parts[cardId] || {})[partId] || {};
    const chip = section.querySelector('.part-chip');
    const text = (st.text || '').trim(), n = (st.photos || []).length;
    chip.hidden = (!text && !n) || (this.openPart === partId && this.topId() === cardId);
    chip.querySelector('span').textContent = [plainLinks(text), n ? countWords(n) : ''].filter(Boolean).join(' · ');
  }

  syncPartsCount(cardId, node = this.nodes.get(cardId)) {
    const card = this.cards.get(cardId);
    const el = node && node.querySelector('.parts-count');
    if (!card || !el) return;
    const states = this.s.parts[card.id] || {};
    const said = card.parts.filter(pt => states[pt.id] && (states[pt.id].mark || (states[pt.id].text || '').trim() || (states[pt.id].photos || []).length)).length;
    el.textContent = said ? `${said} of ${card.parts.length} parts answered` : `${card.parts.length} parts`;
  }

  drawPartPhotos(cardId, partId, node) {
    const section = this.partSection(cardId, partId, node);
    if (!section) return Promise.resolve();
    const st = (this.s.parts[cardId] || {})[partId] || {};
    return drawStrip(section.querySelector('.photostrip'), st.photos || [], `part:${partId}`);
  }

  // Films on a card's back with parts play while they're on screen, and stop when scrolled past.
  watchPartClips() {
    if (this.partsObserver) this.partsObserver.disconnect();
    this.partsObserver = null;
    const node = this.topNode();
    if (!node || !this.partsCard || typeof IntersectionObserver === 'undefined') return;
    this.partsObserver = new IntersectionObserver(entries => {
      for (const e of entries) {
        const clip = e.target;
        if (e.isIntersecting && !clip.dataset.stopped && this.flipped) this.startClip(clip);
        else { clip.querySelector('video').pause(); clip.classList.add('paused'); }
      }
    }, { root: node.querySelector('.back-scroll'), threshold: 0.4 });
    node.querySelectorAll('.back .clip').forEach(c => { c.querySelector('video').muted = true; this.partsObserver.observe(c); });
  }

  markPart(partId, m) {
    const card = this.cards.get(this.partsCard || this.topId());
    if (!card) return;
    const st = this.partState(card.id, partId);
    st.mark = st.mark === m ? null : m;
    this.s.partsV[card.id] = card.version || 1;
    this.saveNow();
    this.syncPart(card.id, partId);
    this.syncPartsCount(card.id);
    this.syncPartsPreview();
    this.sendParts(false);
    tick();
  }

  partTyped(cardId, partId, text) {
    const card = this.cards.get(cardId);
    if (!card) return;
    const st = this.partState(card.id, partId);
    st.text = text;
    this.s.partsV[card.id] = card.version || 1;
    this.saveNow(); // at once: the backup write is synchronous, so a killed app keeps it
    this.syncPartsCount(card.id);
    clearTimeout(this.partTimer);
    this.partTimer = setTimeout(() => this.sendParts(false), PART_SEND_AFTER);
  }

  openPartPad(partId) {
    const cardId = this.topId();
    if (!this.hasParts(this.topCard())) return;
    if (!this.flipped) this.flip(true);
    if (this.openPart && this.openPart !== partId) this.closePartPad();
    const section = this.partSection(cardId, partId);
    if (!section) return;
    this.openPart = partId;
    section.querySelector('.part-pad').hidden = false;
    section.classList.add('typing');
    this.root.classList.add('parttyping');
    this.syncPartChip(cardId, partId);
    padFocus(this.partPad(cardId, partId));
    revealPad(this.partPad(cardId, partId));
  }

  // Closing a part's box sends its words, and its new pictures with them.
  closePartPad() {
    const partId = this.openPart;
    if (!partId) return;
    const cardId = this.topId();
    this.openPart = null;
    const section = this.partSection(cardId, partId);
    if (section) {
      padBlur(this.partPad(cardId, partId));
      section.querySelector('.part-pad').hidden = true;
      section.classList.remove('typing');
    }
    this.root.classList.remove('parttyping');
    this.syncPartChip(cardId, partId);
    this.syncPartsPreview();
    this.sendParts(true);
  }

  // Only what changed since it last went. New pictures wait for the box to close, like the notes'.
  sendParts(pictures = true) {
    clearTimeout(this.partTimer);
    let changed = false;
    for (const [cardId, parts] of Object.entries(this.s.parts)) {
      const card = this.cards.get(cardId) || { id: cardId };
      for (const [partId, st] of Object.entries(parts)) {
        const open = this.openPart === partId && this.topId() === cardId;
        const pics = pictures && !open ? st.photos || [] : st.photosSent || [];
        const sig = partSig(st, pics);
        if (sig === (st.sent || EMPTY_PART)) continue;
        // In the Feel test, a mark alone is like a plain swipe and stays on the phone.
        this.send(partEvent(card, partId, st, pics, this.s.drawnOn), !!st.text || pics.length > 0);
        st.sent = sig;
        st.photosSent = pics.slice();
        this.s.wordsSent[`p:${cardId}/${partId}`] = mark(st.text, pics);
        changed = true;
      }
    }
    if (changed) this.saveNow();
  }

  // Epic and legendary cards: a go has to break through. See pushAgainst.
  breakable() {
    const c = this.topCard();
    return !!(c && RARITY[c.rarity] && RARITY[c.rarity].breaks);
  }

  size() { return { w: this.host.clientWidth || innerWidth, h: this.root.clientHeight || innerHeight }; }

  // ---------- what shows while swiping

  showMark(phys, logical, word, amount, armed, grow = 1) {
    const m = this.mark;
    m.dataset.at = phys;
    m.dataset.act = word === 'CLOSE' ? 'close' : logical;
    m.querySelector('.mark-word').textContent = word;
    m.querySelector('.mark-icon').innerHTML = icon(word === 'CLOSE' ? 'chevron-down' : MARK_ICON[logical]);
    m.style.opacity = amount;
    m.style.setProperty('--s', (0.86 + 0.14 * Math.min(amount, 1)) * grow);
    m.classList.toggle('armed', armed);
    this.glow.dataset.dir = phys;
    this.glow.dataset.act = word === 'CLOSE' ? 'close' : logical;
  }

  hideMark() {
    if (!this.mark) return;
    this.mark.style.opacity = 0;
    this.mark.classList.remove('armed');
  }

  // ---------- swipes

  onMove({ dx, dy }) {
    if (this.broke) return; // the card has gone; wait for the finger to lift
    if (this.scrolling) { this.scrolling.el.scrollTop = this.scrolling.top - dy; return; }
    const top = this.topNode();
    if (!top) return;
    const phys = dominant(dx, dy);
    const logical = logicalOf(phys);

    // In the comment box the description scrolls by hand, because the table takes every touch for
    // swipes. A sideways drag on it is still a throw, and so is a vertical one with nowhere to scroll.
    if (this.composing && !top.classList.contains('dragging')) {
      const why = this.dragFrom && this.dragFrom.closest && this.dragFrom.closest('.why');
      const room = why && (dy > 0 ? why.scrollTop > 0 : why.scrollTop + why.clientHeight < why.scrollHeight - 1);
      if (room && Math.abs(dy) > Math.abs(dx)) {
        this.scrolling = { el: why, top: why.scrollTop + dy };
        return;
      }
    }

    top.classList.add('dragging');
    if (logical === 'right' && this.breakable()) { this.pushAgainst(dx, dy); return; }
    this.push = null;
    top.style.transform = `translate3d(${dx}px,${dy}px,0) rotate(${clamp(dx * 0.055, -16, 16)}deg)`;
    const { w, h } = this.size();
    const p = progress(dx, dy, w, h, this.composing);
    const closes = this.composing && (logical === 'down' || (logical === 'up' && !this.hasDraft()));
    const word = closes ? 'CLOSE' : stampWord(this.topCard(), logical);
    const st = top.querySelector('.stamp');
    st.dataset.dir = phys;
    st.dataset.act = closes ? 'close' : logical;
    st.textContent = word;
    st.style.opacity = clamp((p - 0.12) / 0.5, 0, 1);
    st.style.setProperty('--s', 0.84 + 0.16 * Math.min(p, 1));
    const armed = p >= 1;
    if (armed !== this.armed) {
      this.armed = armed;
      st.classList.toggle('armed', armed);
      if (armed && !this.composing) tick();
    }
    this.showMark(phys, logical, word, clamp((p - 0.12) / 0.5, 0, 1), armed);
    this.table.style.setProperty('--rise', Math.min(p, 1));
    this.glow.style.transform = top.style.transform; // the glow is on the card, and goes where it goes
    this.glow.style.opacity = Math.min(p, 1) * 0.9;
  }

  // The card pushes against resistance while the build-up runs on a clock, because a held finger
  // sends no moves. Letting go or pulling back drains it, and nothing is sent. It works along
  // whichever way go points.
  pushAgainst(dx, dy) {
    this.push = { dx, dy };
    if (this.breakRun) return;
    this.breakRun = true;
    let last = performance.now();
    const step = now => {
      const dt = now - last;
      last = now;
      const { w } = this.size();
      const [ux, uy] = UNIT[physicalOf('right')];
      const along = this.push ? this.push.dx * ux + this.push.dy * uy : 0;
      const pushing = this.push && along >= w * TUNE.breakStart;
      this.charge = clamp(this.charge + (pushing ? dt / TUNE.breakHoldMs : -dt / TUNE.breakDecayMs), 0, 1);
      this.drawCharge();
      if (this.charge >= 1) { this.breakRun = false; this.breakThrough(); return; }
      if (this.push || this.charge > 0) requestAnimationFrame(step);
      else this.breakRun = false;
    };
    requestAnimationFrame(step);
  }

  // What builds on a hold: a glow at the edge and behind the card, the mark growing, the pick box
  // filling like a bar and a slight tremble.
  drawCharge() {
    const top = this.topNode();
    if (!top) return;
    const c = this.charge;
    const card = this.topCard();
    const phys = physicalOf('right');
    top.style.setProperty('--charge', c.toFixed(3));
    this.table.style.setProperty('--rise', c);
    this.glow.dataset.dir = phys;
    this.glow.dataset.act = 'break';
    this.glow.dataset.rarity = card.rarity;
    this.glow.style.opacity = c;
    if (!this.push) { this.mark.style.opacity = c; return; }
    const { w } = this.size();
    const [ux, uy] = UNIT[phys];
    const along = this.push.dx * ux + this.push.dy * uy;
    const across = this.push.dx * uy - this.push.dy * ux;
    const dist = w * TUNE.breakPush * (1 - Math.exp(-Math.max(0, along) / (w * 0.2)));
    const j = c * c * 2;
    const jx = (Math.random() - 0.5) * j, jy = (Math.random() - 0.5) * j;
    const x = ux * dist + uy * across * 0.12 + jx, y = uy * dist - ux * across * 0.12 + jy;
    top.style.transform = `translate3d(${x}px,${y}px,0) rotate(${ux * dist * 0.03 + jx * 0.2}deg) scale(${1 + c * 0.018})`;
    this.glow.style.transform = top.style.transform;
    const word = stampWord(card, 'right');
    const st = top.querySelector('.stamp');
    st.dataset.dir = phys;
    st.dataset.act = 'right';
    st.textContent = word;
    st.style.opacity = clamp(0.3 + c * 0.7, 0, 1);
    st.style.setProperty('--s', 0.8 + 0.34 * c);
    st.classList.toggle('armed', c > 0.85);
    this.showMark(phys, 'right', word, clamp(0.35 + c * 0.65, 0, 1), c > 0.85, 1 + c * 0.55);
    this.glow.dataset.act = 'break';
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
    if (this.cannotGo('right')) { this.spring(); this.nudgeOptions(); return; }
    this.commit('right', physicalOf('right'), undefined, true);
  }

  onRelease(d) {
    if (this.broke) { this.broke = false; return; }
    if (this.scrolling) { this.scrolling = null; return; }
    const { w, h } = this.size();
    if (this.push) { // a go let go before breaking through
      this.spring();
      this.holdHint();
      return;
    }
    const phys = decide({ ...d, w, h, compact: this.composing });
    if (!phys) { this.spring(); return; }
    const logical = logicalOf(phys);
    if (this.composing && logical === 'down') { this.spring(); this.closeComposer(); return; }
    if (logical === 'up') {
      if (!this.composing) { this.spring(); this.openComposer(); return; }
      if (!this.hasDraft()) { this.spring(); this.closeComposer(); return; }
    }
    if (this.cannotGo(logical)) { this.spring(); this.nudgeOptions(); return; }
    this.commit(logical, phys, d);
  }

  holdHint() {
    const top = this.topNode();
    const line = top && top.querySelector('.holdline');
    if (!line || !line.animate) return;
    line.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 320 });
  }

  nudgeOptions() {
    const box = this.topNode() && this.topNode().querySelector('.options, .board-preview');
    if (box && box.animate) box.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 220 });
  }

  spring() {
    const top = this.topNode();
    const draining = this.charge > 0;
    this.push = null;
    this.chargeStage = 0;
    if (!draining) {
      this.table.style.setProperty('--rise', 0);
      this.glow.style.opacity = 0;
      this.glow.style.transform = '';
      this.hideMark();
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
    this.lift = { t: performance.now(), x: e.clientX, y: e.clientY };
    const t = this.dragFrom || e.target; // the lift's own target is the table, which holds the finger
    const link = t && t.closest && t.closest('.rlink');
    if (link) { this.follow(link.dataset.addr); return; }
    const web = t && t.closest && t.closest('.weblink');
    if (web) { window.open(web.href, '_blank', 'noopener'); return; }
    if (t && t.closest && t.closest('.attached')) { this.openComposer(); return; }
    const id = this.topId();
    if (!id) return;
    const c = this.cards.get(id);
    if (c.kind === 'board') { this.openBoard(); return; } // even mid-comment, to look while writing
    if ((c.parts || []).length && c.kind !== 'options') { // so are a card's parts
      const row = t && t.closest && t.closest('.pp[data-part]');
      this.openParts(row ? row.dataset.part : null);
      return;
    }
    if (this.composing) return;
    const optPic = t && t.closest && t.closest('.option img');
    if (optPic) { this.viewOptionPictures(optPic.closest('.option').dataset.opt); return; }
    const opt = t && t.closest && t.closest('.option');
    if (opt) {
      this.togglePick(id, opt.dataset.opt);
      this.syncOptions();
      return;
    }
    if (c.details || (c.images || []).length || videosOf(c).length || this.topNode().classList.contains('clipped')) this.flip(true);
    else {
      const top = this.topNode();
      top.animate && top.animate(
        [{ transform: 'rotate(0)' }, { transform: 'rotate(-1.2deg)' }, { transform: 'rotate(1deg)' }, { transform: 'rotate(0)' }],
        { duration: 220 });
    }
  }

  // The turn eases in to edge-on at exactly halfway and out from there, which is when the hidden side
  // swaps, so neither side is ever missing mid-turn. Once turned, the back is drawn flat, with nothing 3D
  // about it, so typing, scrolling and the caret on it behave as anywhere else on an iPhone.
  flip(on) {
    const top = this.topNode();
    if (!top) return;
    if (!on && this.openPart) this.closePartPad();
    this.flipped = on;
    this.table.classList.toggle('flipped', on);
    this.root.classList.toggle('reading', on && this.hasParts(this.topCard()));
    const f = top.querySelector('.flip');
    f.classList.remove('flat', 'turn-in', 'turn-out');
    f.classList.toggle('flipped', on);
    void f.offsetWidth;
    f.classList.add(on ? 'turn-in' : 'turn-out');
    const settled = e => {
      if (e && (e.target !== f || !/^turn/.test(e.animationName))) return;
      f.removeEventListener('animationend', settled);
      clearTimeout(this.flipTimer);
      f.classList.remove('turn-in', 'turn-out');
      if (on && this.flipped && this.topNode() === top) f.classList.add('flat');
    };
    f.addEventListener('animationend', settled);
    clearTimeout(this.flipTimer);
    this.flipTimer = setTimeout(settled, 460); // reduced motion, or a page in the background
    if (on) top.querySelector('.back-scroll').scrollTop = 0;
    else this.syncPartsPreview(); // the face shows what was said on the back
    if (this.hasParts(this.topCard())) {
      if (on) this.watchPartClips();
      else { if (this.partsObserver) this.partsObserver.disconnect(); this.playClips(top, false); }
    } else this.playClips(top, on);
    blurHidden();
  }

  // Throws the top card, records the answer and has the next card ready at once. `logical` is what
  // it means, `phys` is the way it went.
  commit(logical, phys = physicalOf(logical), d = { dx: 0, dy: 0, vx: 0, vy: 0 }, punched = false) {
    const id = this.topId();
    const card = this.cards.get(id);
    const comment = this.draft().trim();
    const eid = newId();
    const prev = this.s.answers[id] || null;
    const version = card.version || 1;
    const photos = this.draftPics(id);
    const event = { type: 'answer', eid, card: id, cardVersion: version, title: card.title || '', kind: card.kind || 'question', swipe: logical, stamp: stampWord(card, logical), comment, ...withPictures(photos, this.s.drawnOn) };
    const answer = { swipe: logical, comment, at: Date.now(), eid, version, ...(photos.length ? { photos } : {}) };
    if (card.handled) event.handledAt = answer.handledAt = card.handled.at;
    const tapped = isPicking(card) ? this.chosen().filter(x => picksFrom(card).some(o => o.id === x)) : [];
    if (isPicking(card)) {
      let selected = tapped;
      if (logical === 'right' && !tapped.length) { selected = [].concat(card.pick); event.byPick = true; }
      if (logical === 'right' || logical === 'left') event.selected = answer.selected = selected;
    }
    this.s.answers[id] = answer;
    this.s.log.push({ t: 'answer', id, eid, dir: logical, phys, comment, prev, tapped, photos });
    this.s.order.shift();
    this.s.reviewing = null;
    delete this.s.drafts[id];
    delete this.s.draftsSent[id];
    delete this.s.draftPhotos[id];
    delete this.s.picksDirty[id];
    if (comment || photos.length) this.s.wordsSent[`c:${id}`] = mark(comment, photos);
    this.send(event, !!comment || photos.length > 0);
    if (this.composing) this.closeComposer(true);
    if (punched) this.punch(id, card.rarity, phys);
    else this.fly(id, phys, d);
    tick();
    this.deal();
    this.saveNow();
  }

  fly(id, phys, { dx, dy, vx, vy }) {
    const node = this.nodes.get(id);
    if (!node) return;
    this.nodes.delete(id);
    node.classList.add('ghost');
    node.classList.remove('dragging');
    node.style.zIndex = 30;
    const { w, h } = this.size();
    const side = phys === 'left' || phys === 'right';
    const sign = phys === 'right' || phys === 'down' ? 1 : -1;
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

  // The end of a break-through: the card punches off the way go points, with a quick flash.
  punch(id, rarity, phys) {
    const node = this.nodes.get(id);
    if (!node) return;
    this.nodes.delete(id);
    node.classList.add('ghost');
    node.classList.remove('dragging');
    node.style.zIndex = 30;
    const { w, h } = this.size();
    const [ux, uy] = UNIT[phys];
    const from = node.style.transform || 'none';
    const to = `translate3d(${ux * w * 1.4}px,${uy ? uy * h * 1.2 : -6}px,0) rotate(${ux * 7}deg) scale(1.03)`;
    node.style.transform = to;
    if (node.animate) node.animate([{ transform: from }, { transform: to }], { duration: 170, easing: 'cubic-bezier(.5,.05,.8,.5)' }).onfinish = () => node.remove();
    else node.remove();
    const flash = document.createElement('div');
    flash.className = `flash ${rarity}`;
    this.table.append(flash);
    if (flash.animate) flash.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 170, easing: 'ease-out' }).onfinish = () => flash.remove();
    else flash.remove();
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
      if (e.tapped && e.tapped.length) this.s.selections[e.id] = e.tapped;
      if (e.photos && e.photos.length) this.s.draftPhotos[e.id] = e.photos;
      this.send({ type: 'undo', card: e.id, of: e.eid }, !!e.comment || (e.photos || []).length > 0);
    }
    if (e.t === 'skip-handled') delete this.s.handledSkipped[e.id];
    this.s.order.unshift(e.id);
    this.deal();
    this.enter(e.t === 'answer' ? (e.phys || physicalOf(e.dir)) : 'skip');
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
    const card = this.cards.get(id);
    const nothingOwedElse = !this.s.order.some(x => x !== id && !this.cards.get(x).handled);
    const leaves = card.handled && nothingOwedElse; // a handled card isn't owed, so a deck can end without it
    if (this.s.order.length === 1 && !this.s.reviewing && !leaves) {
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
    else if (leaves) {
      this.s.handledSkipped[id] = card.handled.at;
      this.s.log.push({ t: 'skip-handled', id });
    } else {
      this.s.order.push(id);
      this.s.log.push({ t: 'skip', id });
      arrange(this.s, this.cards);
    }
    this.deal();
    this.saveNow();
  }

  notesChanged(text) {
    this.s.notes = text;
    this.drawNoteRefs();
    this.saveNow(); // at once: the backup write is synchronous, so a killed app keeps it
    clearTimeout(this.notesTimer);
    this.notesTimer = setTimeout(() => this.sendNotes(false), 1500);
  }
  // The words go as soon as typing stops. New pictures wait until the pad closes, so one can still be
  // taken back. `pictures` says whether they go now.
  sendNotes(pictures = true) {
    clearTimeout(this.notesTimer);
    const images = pictures ? this.s.notesPhotos : this.s.notesPhotosSent;
    if ((this.s.notes || '') === (this.s.notesSent || '') && images.join() === this.s.notesPhotosSent.join()) return;
    this.s.notesSent = this.s.notes;
    this.s.notesPhotosSent = images.slice();
    this.s.wordsSent.n = mark(this.s.notes, images);
    this.send({ type: 'notes', text: this.s.notes, ...withPictures(images, this.s.drawnOn) }, true);
    this.saveNow();
  }

  // ---------- photos

  async addPhoto(input) {
    const where = input.dataset.photo;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const card = this.topId();
    const label = input.closest('.photobtn');
    const section = where === 'part' && input.closest('.part');
    label.classList.add('busy');
    try {
      const id = await savePhoto(file);
      if (section) {
        const cardId = section.closest('.card').dataset.id;
        const st = this.partState(cardId, section.dataset.part);
        st.photos = [...(st.photos || []), id];
        this.saveNow();
        await this.drawPartPhotos(cardId, section.dataset.part);
        this.syncPartChip(cardId, section.dataset.part);
        return;
      }
      if (where === 'comment') this.s.draftPhotos[card] = [...(this.s.draftPhotos[card] || []), id];
      else this.s.notesPhotos.push(id);
      this.saveNow();
      await this.drawPhotos();
      this.syncAttached();
    } catch (e) {
      stripError(section ? section.querySelector('.photostrip') : this.host.querySelector(where === 'comment' ? '#commentphotos' : '#notesphotos'), e);
    } finally {
      label.classList.remove('busy');
    }
  }

  dropPhoto(id, where, btn = null) {
    if (where.startsWith('part:')) {
      const partId = where.slice(5);
      const cardId = (btn && btn.closest('.card') && btn.closest('.card').dataset.id) || this.topId();
      const st = this.partState(cardId, partId);
      st.photos = (st.photos || []).filter(x => x !== id);
      this.saveNow();
      this.drawPartPhotos(cardId, partId);
      this.syncPartChip(cardId, partId);
      discardPhoto(id);
      return;
    }
    if (where === 'comment') {
      const card = this.topId();
      const left = this.draftPics(card).filter(x => x !== id);
      if (left.length) this.s.draftPhotos[card] = left; else delete this.s.draftPhotos[card];
    } else {
      this.s.notesPhotos = this.s.notesPhotos.filter(x => x !== id);
    }
    this.saveNow();
    this.drawPhotos();
    this.syncAttached();
    discardPhoto(id);
  }

  drawPhotos() {
    return Promise.all([
      drawStrip(this.host.querySelector('#commentphotos'), this.draftPics(), 'comment'),
      drawStrip(this.host.querySelector('#notesphotos'), this.s.notesPhotos, 'notes'),
      drawStrip(this.host.querySelector('#endphotos'), this.s.notesPhotos, 'notes'),
    ]);
  }

  toggleNotes(force) {
    if (force === undefined && !this.endBox.hidden) { // at the end of a deck the pad is already on screen
      const pad = this.endBox.querySelector('#endnotes');
      if (pad) padFocus(pad);
      return;
    }
    const on = force === undefined ? this.notesSheet.hidden : force;
    if (on === !this.notesSheet.hidden) return;
    this.notesSheet.hidden = !on;
    this.root.classList.toggle('noting', on);
    if (on) {
      if (this.composing) this.closeComposer();
      padSet(this.notesText, this.s.notes || '');
      this.drawPhotos();
      this.drawNoteRefs();
      padFocus(this.notesText);
    } else {
      padBlur(this.notesText);
      this.sendNotes(true);
    }
  }

  // ---------- comment box

  openComposer() {
    if (this.composing || !this.topId()) return;
    this.toggleNotes(false);
    this.composing = true;
    this.root.classList.add('composing');
    this.composer.hidden = false;
    padSet(this.comment, this.draft());
    this.drawPhotos();
    this.syncAttached();
    padFocus(this.comment);
    scrollTo(0, 0);
  }

  // Keeps what's typed as a chip on the card, unless the card has just been thrown with it.
  closeComposer(sent = false) {
    if (!this.composing) return;
    this.composing = false;
    this.root.classList.remove('composing');
    this.composer.hidden = true;
    padBlur(this.comment);
    if (sent) padSet(this.comment, '');
    this.syncAttached();
    scrollTo(0, 0);
  }

  // ---------- overview

  onPinch(scale) {
    const top = this.topNode();
    if (top && !this.pinchFired) {
      top.classList.add('dragging');
      top.style.transform = `scale(${clamp(scale, 0.6, 1)})`; // never bigger: it would reach the screen's edges and cover the buttons
    }
    // A pinch shrinks the deck into the mini player. Grid is the way to the overview.
    if (!this.pinchFired && scale < TUNE.pinchOpen) {
      this.pinchFired = true;
      if (this.nav.shrink) this.nav.shrink(); else this.showOverview();
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
      const fresher = a && (!c.handled || a.at >= (Date.parse(c.handled.at) || 0));
      const stamp = fresher ? stampWord(c, a.swipe) : '';
      const cls = [c.rarity || 'common', c.id === cur ? 'current' : '', fresher ? 'answered' : '', c.handled ? 'handled' : ''].join(' ');
      return `<button class="tile ${cls}" data-act="jump" data-id="${esc(c.id)}">
        <span class="tile-title">${c.handled ? `<i class="tile-tick">${icon('check')}</i>` : ''}${esc(c.title || c.text)}</span>
        <span class="tile-state ${fresher ? 'dir-' + a.swipe : ''}">${esc(stamp) || (c.handled ? 'Handled' : 'Waiting')}${a && a.comment ? `<i>${icon('message-square-text')}</i>` : ''}</span>
      </button>`;
    }).join('');
    const sum = deckSummary(this.deck, this.s);
    this.overview.innerHTML = `
      <div class="ov-head">
        <div class="t">${esc(this.deck.title)}</div>
        <div class="n">${sum.total ? `${sum.total - sum.left} / ${sum.total}` : `${sum.handled} handled`}</div>
        <button class="iconbtn" data-act="closegrid" aria-label="Back to the card">${icon('x')}</button>
      </div>
      <div class="ov-grid scroll">
        ${tiles}
        <div class="ov-foot">
          <button class="ghostbtn" data-act="gridnotes">${icon('notebook-pen')}Deck notes</button>
          <button class="ghostbtn" data-act="gridreplan">${icon('message-square-text')}Replan this deck</button>
          <button class="ghostbtn" data-act="gridover">${icon('rotate-ccw')}Start this deck over</button>
          ${this.nav.archive ? `<button class="ghostbtn" data-act="gridarchive">${icon(this.nav.archived ? 'archive-restore' : 'archive')}${this.nav.archived ? 'Bring this deck back' : 'Archive this deck'}</button>` : ''}
        </div>
      </div>`;
    this.overview.hidden = false;
  }

  hideOverview() { this.overview.hidden = true; }

  // Brings any card to the top. An answered one can be swiped again to change the answer.
  jump(id, partId = null) {
    this.hideOverview();
    if (this.composing) this.closeComposer();
    if (this.s.reviewing && this.s.reviewing !== id) {
      this.s.order = this.s.order.filter(x => x !== this.s.reviewing);
    }
    this.s.reviewing = this.s.answers[id] ? id : null;
    this.s.order = [id, ...this.s.order.filter(x => x !== id)];
    this.deal();
    this.enter('skip');
    this.save();
    const card = this.cards.get(id);
    if (partId && card && (card.parts || []).some(p => p.id === partId)) this.openParts(partId);
  }

  // ---------- the end of the deck

  // `mode` is null at the real end, or 'replan' when sent here from the grid to confirm that.
  showEnd(mode = null) {
    this.toggleNotes(false);
    if (this.composing) this.closeComposer();
    const groups = DIRS.map(dir => {
      const hits = this.deck.cards.filter(c => this.s.answers[c.id] && this.s.answers[c.id].swipe === dir);
      const words = [...new Set(hits.map(c => stampWord(c, dir)))].join(' / ');
      return { dir, n: hits.length, words };
    }).filter(g => g.n);
    const mins = Math.max(1, Math.round((Date.now() - (this.s.startedAt || Date.now())) / 60000));
    const sum = deckSummary(this.deck, this.s);
    const early = mode === 'replan';
    const sub = early
      ? `This asks for the deck to be rethought from the base. Your ${sum.total - sum.left} answer${sum.total - sum.left === 1 ? '' : 's'} stay, and nothing here is cleared.`
      : `${sum.total} card${sum.total === 1 ? '' : 's'} in about ${mins} minute${mins === 1 ? '' : 's'}.`;
    this.endBox.innerHTML = `
      <div class="end-scroll scroll">
        <h2 class="end-title">${early ? 'Replan this deck?' : 'Deck done'}</h2>
        <div class="end-sub">${esc(sub)}</div>
        <div class="tally">${groups.map(g => `<div class="dir-${g.dir}"><b data-to="${g.n}">0</b><span>${esc(g.words)}</span></div>`).join('')}</div>
        <div class="noterefs" id="endrefs" hidden></div>
        <div class="padwrap">${padHTML('endnotes', 'Anything else on this deck?')}<div class="photostrip" id="endphotos" hidden></div>${linkButton('endnotes')}${photoButton('notes')}</div>
        <div class="end-actions">
          ${early ? '' : `<button class="primary" data-act="done">Deck's done</button>`}
          <button class="${early ? 'primary' : 'secondary'}" data-act="replan">Replan this deck</button>
          ${early ? '<button class="ghostbtn" data-act="keepgoing">Never mind</button>' : ''}
        </div>
      </div>`;
    const pad = this.endBox.querySelector('#endnotes');
    padSet(pad, this.s.notes || '');
    padReady(pad, text => this.notesChanged(text));
    this.drawNoteRefs();
    dragToClose(pad, () => pad, () => {}, () => padBlur(pad));
    this.drawPhotos();
    this.endBox.hidden = false;
    this.root.classList.add('ended');
    this.skipBtn.disabled = true;
    this.endBox.querySelectorAll('[data-to]').forEach(b => this.countUp(b));
    if (!early) tick();
  }

  hideEnd() {
    this.endBox.hidden = true;
    this.root.classList.remove('ended');
  }

  showStartOver() {
    this.toggleNotes(false);
    if (this.composing) this.closeComposer();
    const words = wordsIn(this.deck, this.s);
    this.endBox.innerHTML = `
      <div class="end-scroll scroll">
        <h2 class="end-title">Start this deck over?</h2>
        <div class="end-sub">Your swipes get cleared and every card is dealt again. Anything already sent stays with the writer.</div>
        ${words.length ? `<button class="primary" data-act="overkeep">Keep my notes and comments</button>
          <div class="end-sub small">Comments come back as drafts on their cards.</div>
          <button class="secondary" data-act="overclear">Clear those too</button>
          <div class="end-sub small">Anything not sent yet goes first, so it isn't lost.</div>`
        : '<button class="primary" data-act="overclear">Start over</button>'}
        <button class="ghostbtn" data-act="keepgoing">Never mind</button>
      </div>`;
    this.endBox.hidden = false;
    this.root.classList.add('ended');
    this.skipBtn.disabled = true;
  }

  // Unsent words go first, so nothing that was written can be lost by starting over.
  startOver(keep) {
    this.secure();
    if (!keep) { // pictures that haven't gone yet go now, like the words
      this.sendNotes(true);
      for (const [card, pics] of Object.entries(this.s.draftPhotos)) {
        this.send({ type: 'draft', card, text: this.s.drafts[card] || '', ...withPictures(pics, this.s.drawnOn) }, true);
      }
    }
    const words = wordsIn(this.deck, this.s);
    if (this.pack.demo) {
      sendWords(this.pack, this.deck, this.s, words.filter(w => !w.sent));
      if (!keep) archiveWords(words);
    }
    this.send({ type: 'deck-reset', keptNotes: keep }, false);
    const next = fresh(this.deck);
    next.wordsSent = this.s.wordsSent || {};
    next.draftsSent = {};
    if (keep) {
      next.notes = this.s.notes || '';
      next.notesSent = this.s.notes || '';
      next.drafts = { ...this.s.drafts };
      next.draftsSent = { ...this.s.draftsSent };
      next.draftPhotos = { ...this.s.draftPhotos };
      for (const c of this.deck.cards) if (c.kind === 'board' && this.s.selections[c.id]) next.selections[c.id] = this.s.selections[c.id];
      next.notesPhotos = this.s.notesPhotos;
      next.notesPhotosSent = this.s.notesPhotosSent;
      next.drawnOn = this.s.drawnOn;
      // Words on parts stay, as they were said. Their marks were answers, so they go with the swipes.
      for (const [cardId, parts] of Object.entries(this.s.parts)) {
        for (const [partId, st] of Object.entries(parts)) {
          if (!st.text && !(st.photos || []).length) continue;
          const kept = { mark: null, text: st.text, photos: st.photos || [], photosSent: st.photosSent || [] };
          kept.sent = partSig(kept, kept.photosSent);
          (next.parts[cardId] = next.parts[cardId] || {})[partId] = kept;
        }
      }
      for (const [id, a] of Object.entries(this.s.answers)) {
        if (a.comment && !next.drafts[id]) {
          next.drafts[id] = a.comment;
          next.draftsSent[id] = a.comment; // it went with the answer
        }
        if ((a.photos || []).length && !next.draftPhotos[id]) next.draftPhotos[id] = a.photos;
      }
    }
    this.s = next;
    reconcile(this.s, this.deck);
    for (const node of this.nodes.values()) node.remove();
    this.nodes.clear();
    padSet(this.notesText, this.s.notes);
    this.hideOverview();
    this.deal();
    this.saveNow();
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
    const sum = deckSummary(this.deck, this.s);
    this.s.verdict = which;
    this.s.verdictSig = deckSig(this.deck);
    this.send({ type: 'deck', verdict: which, tally, answered: sum.total - sum.left, total: sum.total }, false);
    Promise.resolve(this.saveNow()).then(() => this.onVerdict(which));
  }
}
