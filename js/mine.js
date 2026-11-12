// The designer's own decks: feedback, requests and references of their own, as cards. An idea in words,
// a picture (with drawing), a web link, or a card from Riffle. Kept on the phone first, through the store's
// backup list like anything typed, then written to packs/<pack>/mine/<deck>.json, where writers never write.
// The writer reads them with `riffle mine`, and can reply on any of them.
import { dragToClose, esc, icon, padBlur, padFocus, padHTML, padReady, padSet, tick } from './ui.js';
import * as store from './store.js';
import { newId, photoPath } from './sync.js';
import { openViewer } from './viewer.js';
import { photoButton, photoUrl, saveDrawing, savePhoto, stripError } from './photos.js';
import { linkButton, linkify, linkText } from './links.js';

export const mineKey = packId => `mine:${packId}`;
export const MINE_KINDS = {
  idea: { label: 'Idea', icon: 'sticky-note', hint: 'An idea, a note or a request.' },
  picture: { label: 'Picture', icon: 'image', hint: 'Words about the picture, if any.' },
  link: { label: 'Web link', icon: 'external-link', hint: 'What this link is for.' },
  card: { label: 'Riffle card', icon: 'link', hint: 'What about this card.' },
};
const now = () => new Date().toISOString();

// Everything of theirs in one pack, as kept on the phone.
export async function mineOf(packId) {
  const data = (await store.get(mineKey(packId)).catch(() => null)) || { decks: {} };
  data.decks = data.decks || {};
  return data;
}

// Their decks to list, newest first, with the cards that still stand.
export const liveDecks = data => Object.values(data.decks || {}).filter(d => !d.removed).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
export const liveCards = deck => (deck.cards || []).filter(c => !c.removed);

// What goes to the data repo: pictures as their paths there, drawings saying what they're over.
export function fileOf(deck) {
  return {
    v: 1, id: deck.id, title: deck.title || 'Untitled', topic: deck.topic || null, created: deck.created, updated: deck.updated,
    ...(deck.removed ? { removed: deck.removed } : {}),
    cards: (deck.cards || []).map(c => ({
      id: c.id, kind: c.kind, text: c.text || '',
      ...(c.url ? { url: c.url } : {}),
      ...(c.address ? { address: c.address, label: c.label || '' } : {}),
      ...((c.photos || []).length ? { images: c.photos.map(photoPath) } : {}),
      ...(Object.keys(c.drawnOn || {}).length ? { drawings: Object.fromEntries(Object.entries(c.drawnOn).map(([id, on]) => [photoPath(id), on])) } : {}),
      created: c.created, updated: c.updated, ...(c.removed ? { removed: c.removed } : {}),
    })),
  };
}

// A deck from the repo, back into the phone's own form.
export function deckFromFile(f) {
  const idOf = p => String(p).replace(/^answers\/img\//, '').replace(/\.jpg$/, '');
  return {
    id: f.id, title: f.title, topic: f.topic || null, created: f.created, updated: f.updated, pushed: f.updated, ...(f.removed ? { removed: f.removed } : {}),
    cards: (f.cards || []).map(c => ({
      id: c.id, kind: c.kind, text: c.text || '', url: c.url || '', address: c.address || '', label: c.label || '',
      photos: (c.images || []).map(idOf), drawnOn: Object.fromEntries(Object.entries(c.drawings || {}).map(([p, on]) => [idOf(p), on])),
      created: c.created, updated: c.updated, ...(c.removed ? { removed: c.removed } : {}),
    })),
  };
}

// Two copies of a deck, as one: each card at its newest, cards only one has kept, nothing dropped.
export function mergeDecks(a, b) {
  if (!a) return b;
  if (!b) return a;
  const newer = String(a.updated) >= String(b.updated) ? a : b;
  const byId = new Map();
  for (const c of [...(b.cards || []), ...(a.cards || [])]) {
    const had = byId.get(c.id);
    if (!had || String(c.updated) > String(had.updated)) byId.set(c.id, c);
  }
  const order = [...(newer.cards || []).map(c => c.id), ...[...byId.keys()].filter(id => !(newer.cards || []).some(c => c.id === id))];
  return { ...newer, cards: order.map(id => byId.get(id)) };
}

export class MineView {
  // nav: follow(address), linker({ pad, here, packId }), backBy
  constructor({ host, pack, deckId, replies = {}, onExit, nav = {} }) {
    Object.assign(this, { host, pack, deckId, replies, onExit, nav });
    this.key = mineKey(pack.id);
    this.editing = null;
  }

  async open(fresh = false) {
    this.data = await mineOf(this.pack.id);
    if (!this.data.decks[this.deckId]) this.data.decks[this.deckId] = { id: this.deckId, title: '', topic: null, created: now(), updated: now(), cards: [] };
    this.deck = this.data.decks[this.deckId];
    this.render();
    if (fresh || !this.deck.title) padFocus(this.titlePad);
  }

  // At once, through the backup list: a closed app keeps every word.
  save(touched = true) {
    if (touched) this.deck.updated = now();
    return store.set(this.key, JSON.parse(JSON.stringify(this.data)));
  }

  secure() { return this.save(false); }

  // Where this is, for coming back to after following a link.
  place() { return { kind: 'mine', pack: this.pack.id, deck: this.deckId, title: (this.deck && this.deck.title) || 'your deck' }; }

  close() {
    // A deck left with nothing in it at all was never really made.
    if (!this.deck.title.trim() && !liveCards(this.deck).length && !this.deck.pushed) delete this.data.decks[this.deckId];
    this.save(false);
  }

  render() {
    const topics = (this.pack.topics || []).slice().sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    this.host.innerHTML = `
      <div class="minedeck screen">
        <div class="deckbar">
          <button class="iconbtn${this.nav.backBy ? ' linked' : ''}" data-mine="back" aria-label="${esc(this.nav.backBy ? `Back to ${this.nav.backBy}` : 'Back')}">${icon(this.nav.backBy ? 'corner-up-left' : 'chevron-left')}</button>
          <div class="t">Your deck</div>
          <div class="n" data-slot="notice"></div>
        </div>
        <div class="mine-title">${padHTML('minetitle', 'Name this deck')}</div>
        <div class="mine-topics" role="group" aria-label="Topic">
          <button data-topic="" class="${this.deck.topic ? '' : 'on'}">No topic</button>
          ${topics.map(t => `<button data-topic="${esc(t.id)}" class="${this.deck.topic === t.id ? 'on' : ''}">${esc(t.title)}</button>`).join('')}
        </div>
        <div class="mine-list scroll" id="minelist"></div>
        <div class="mine-add">
          ${Object.entries(MINE_KINDS).map(([k, v]) => `<button data-add="${k}">${icon(v.icon)}<span>${esc(k === 'link' ? 'Link' : k === 'card' ? 'Card' : v.label)}</span></button>`).join('')}
          <label class="mine-addpic" hidden><input type="file" accept="image/*" data-newpic></label>
        </div>
      </div>`;
    this.titlePad = this.host.querySelector('#minetitle');
    this.list = this.host.querySelector('#minelist');
    padSet(this.titlePad, this.deck.title);
    padReady(this.titlePad, text => { this.deck.title = text.replace(/\n/g, ' '); this.save(); });
    this.titlePad.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); padBlur(this.titlePad); } });
    this.host.onclick = e => this.onClick(e);
    this.host.onchange = e => {
      if (e.target.matches('[data-newpic]')) this.addPicture(e.target, null);
      else if (e.target.matches('[data-photo]')) this.addPicture(e.target, e.target.closest('.mcard').dataset.card);
    };
    this.drawList();
  }

  onClick(e) {
    const link = e.target.closest('.rlink');
    if (link) { e.preventDefault(); this.save(false); this.nav.follow && this.nav.follow(link.dataset.addr); return; }
    if (e.target.closest('.weblink')) return;
    const b = e.target.closest('button, [data-mine]');
    if (!b) {
      const card = e.target.closest('.mcard');
      if (card && this.editing !== card.dataset.card && !e.target.closest('.pad')) this.edit(card.dataset.card);
      return;
    }
    if (b.dataset.mine === 'back') { this.close(); this.onExit(); return; }
    if (b.dataset.topic !== undefined && b.closest('.mine-topics')) {
      this.deck.topic = b.dataset.topic || null;
      this.save();
      this.host.querySelectorAll('.mine-topics button').forEach(x => x.classList.toggle('on', x === b));
      return;
    }
    if (b.dataset.add) { this.add(b.dataset.add); return; }
    const id = b.closest('.mcard') && b.closest('.mcard').dataset.card;
    const act = b.dataset.act;
    if (act === 'mup') this.move(id, -1);
    else if (act === 'mdown') this.move(id, 1);
    else if (act === 'mdel') this.remove(id, b);
    else if (act === 'mdone') this.edit(null);
    else if (act === 'medit') this.edit(id);
    else if (act === 'mpic') this.viewPictures(id, +b.dataset.i);
    else if (act === 'rmphoto') this.dropPhoto(id, b.dataset.photoId);
    else if (act === 'linkcard') this.nav.linker && this.nav.linker({ pad: b.closest('.padwrap').querySelector('.pad'), here: null, packId: this.pack.id });
    else if (act === 'mpick') this.pickCard(id);
  }

  card(id) { return (this.deck.cards || []).find(c => c.id === id); }

  // ---------- the list

  drawList() {
    const cards = liveCards(this.deck);
    const reply = this.replies[this.deckId];
    this.list.innerHTML = `
      ${reply ? `<div class="mreply">${icon('check')}<span><b>The writer replied</b>${linkify(reply.how)}</span></div>` : ''}
      ${cards.map((c, i) => this.cardHTML(c, i, cards.length)).join('') || `<div class="demo-note mine-empty">Add an idea, a picture, a link or a card with the buttons below. Everything is kept as you type, and goes to the writer from here.</div>`}`;
    for (const c of cards) {
      const el = this.list.querySelector(`.mcard[data-card="${CSS.escape(c.id)}"]`);
      this.drawThumbs(el, c);
      if (this.editing === c.id) this.wireEditor(el, c);
    }
  }

  cardHTML(c, i, n) {
    const kind = MINE_KINDS[c.kind] || MINE_KINDS.idea;
    const reply = this.replies[`${this.deckId}/${c.id}`];
    const open = this.editing === c.id;
    return `<div class="mcard${open ? ' editing' : ''}" data-card="${esc(c.id)}">
      <div class="mc-kind">${icon(kind.icon)}<span>${esc(kind.label)}</span></div>
      ${c.kind === 'card' && c.address ? `<div class="mc-ref">${linkify(linkText(c.label || 'a card', c.address))}</div>` : ''}
      ${c.kind === 'card' && !c.address ? `<button class="secondary mc-pickbtn" data-act="mpick">${icon('link')}Pick a card</button>` : ''}
      ${open ? `
        ${c.kind === 'link' ? `<div class="mc-url">${padHTML(`murl-${i}`, 'https://…')}</div>` : ''}
        <div class="padwrap mc-pad">${padHTML(`mtext-${i}`, kind.hint)}${linkButton('mine')}${c.kind === 'picture' || (c.photos || []).length ? photoButton('mine') : ''}</div>
        <div class="mc-pics"></div>
        <div class="mc-acts">
          <button class="iconbtn" data-act="mup" aria-label="Move up" ${i ? '' : 'disabled'}>${icon('arrow-up')}</button>
          <button class="iconbtn" data-act="mdown" aria-label="Move down" ${i < n - 1 ? '' : 'disabled'}>${icon('arrow-down')}</button>
          <button class="iconbtn mc-del" data-act="mdel" aria-label="Delete this card">${icon('trash-2')}</button>
          <button class="primary mc-done" data-act="mdone">Done</button>
        </div>` : `
        ${c.kind === 'link' && c.url ? `<div class="mc-weblink">${linkify(c.url)}</div>` : ''}
        ${c.text ? `<div class="mc-text">${linkify(c.text)}</div>` : ''}
        <div class="mc-pics"></div>
        ${!c.text && !(c.photos || []).length && !c.url && !c.address ? '<div class="mc-text mc-blank">Tap to write</div>' : ''}`}
      ${reply ? `<div class="mreply small">${icon('check')}<span>${linkify(reply.how)}</span></div>` : ''}
    </div>`;
  }

  async drawThumbs(el, c) {
    const box = el && el.querySelector('.mc-pics');
    if (!box) return;
    const open = this.editing === c.id;
    const urls = await Promise.all((c.photos || []).map(photoUrl));
    box.innerHTML = urls.map((u, i) => `<span class="mc-pic">${u ? `<button data-act="mpic" data-i="${i}" aria-label="Look at it"><img src="${esc(u)}" alt=""></button>` : '<i>Not on this phone</i>'}${open ? `<button class="mc-rm" data-act="rmphoto" data-photo-id="${esc(c.photos[i])}" aria-label="Remove this picture">${icon('x')}</button>` : ''}</span>`).join('');
  }

  wireEditor(el, c) {
    const text = el.querySelector('.mc-pad .pad');
    padSet(text, c.text || '');
    padReady(text, v => { c.text = v; c.updated = now(); this.save(); });
    dragToClose(text, () => text, () => {}, () => padBlur(text));
    const url = el.querySelector('.mc-url .pad');
    if (url) {
      padSet(url, c.url || '');
      padReady(url, v => { c.url = v.trim(); c.updated = now(); this.save(); });
      url.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); padFocus(text); } });
    }
    return url && !c.url ? url : text;
  }

  // Opens one card to change it. Done, or opening another, closes it.
  edit(id) {
    this.editing = id;
    this.drawList();
    if (!id) return;
    const el = this.list.querySelector(`.mcard[data-card="${CSS.escape(id)}"]`);
    if (!el) return;
    const c = this.card(id);
    // The card being changed starts at the top of the list, with nothing of the one above showing.
    this.list.scrollTop += el.getBoundingClientRect().top - this.list.getBoundingClientRect().top - 4;
    const first = c.kind === 'link' && !c.url ? el.querySelector('.mc-url .pad') : el.querySelector('.mc-pad .pad');
    if (first) padFocus(first);
  }

  add(kind) {
    const c = { id: newId(), kind, text: '', url: '', address: '', label: '', photos: [], drawnOn: {}, created: now(), updated: now() };
    this.deck.cards.push(c);
    this.save();
    tick();
    if (kind === 'picture') {
      this.pendingPicture = c.id;
      this.edit(c.id);
      const input = this.host.querySelector(`.mcard[data-card="${CSS.escape(c.id)}"] [data-photo]`);
      if (input) input.click(); // Take Photo or Photo Library, straight away
      return;
    }
    if (kind === 'card') { this.edit(c.id); this.pickCard(c.id); return; }
    this.edit(c.id);
  }

  pickCard(id) {
    const c = this.card(id);
    if (!c || !this.nav.pick) return;
    this.nav.pick(this.pack.id, chosen => {
      if (!chosen) return;
      c.address = chosen.address;
      c.label = chosen.label;
      c.updated = now();
      this.save();
      this.edit(id);
    });
  }

  move(id, by) {
    const cards = this.deck.cards;
    const live = liveCards(this.deck);
    const at = live.findIndex(c => c.id === id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= live.length) return;
    const a = cards.indexOf(live[at]), b = cards.indexOf(live[to]);
    [cards[a], cards[b]] = [cards[b], cards[a]];
    this.save();
    this.drawList();
    tick();
  }

  // Two taps, the second within a few seconds. The card is kept, marked removed, so nothing is lost.
  remove(id, btn) {
    if (!btn.classList.contains('sure')) {
      btn.classList.add('sure');
      btn.setAttribute('aria-label', 'Tap again to delete');
      btn.innerHTML = `${icon('trash-2')}<span>Delete?</span>`;
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove('sure'); btn.innerHTML = icon('trash-2'); } }, 3500);
      return;
    }
    const c = this.card(id);
    c.removed = now();
    c.updated = c.removed;
    this.editing = null;
    this.save();
    this.drawList();
  }

  async addPicture(input, id) {
    const file = input.files && input.files[0];
    input.value = '';
    const target = id || this.pendingPicture;
    this.pendingPicture = null;
    const c = target && this.card(target);
    if (!file || !c) return;
    try {
      const photo = await savePhoto(file);
      await store.photos.get(photo).then(rec => rec && store.photos.set(photo, { ...rec, keep: true }));
      c.photos = [...(c.photos || []), photo];
      c.updated = now();
      this.save();
      this.drawThumbs(this.list.querySelector(`.mcard[data-card="${CSS.escape(c.id)}"]`), c);
    } catch (e) {
      const el = this.list.querySelector(`.mcard[data-card="${CSS.escape(c.id)}"] .mc-pics`);
      if (el) stripError(el, e);
    }
  }

  dropPhoto(id, photo) {
    const c = this.card(id);
    if (!c) return;
    c.photos = (c.photos || []).filter(x => x !== photo);
    c.updated = now();
    this.save();
    this.drawThumbs(this.list.querySelector(`.mcard[data-card="${CSS.escape(c.id)}"]`), c);
  }

  // Full screen, with the pen: a drawing joins the card as a picture of its own, next to the one it's over.
  viewPictures(id, at) {
    const c = this.card(id);
    if (!c) return;
    const items = (c.photos || []).map(p => ({ full: () => photoUrl(p), inkKey: `mine/${this.pack.id}/${this.deckId}/${c.id}/${p}`, on: `their picture ${photoPath(p)}` }));
    openViewer({
      items, at,
      ink: {
        save: async (i, blob) => {
          const photo = await saveDrawing(blob, items[i].on);
          await store.photos.get(photo).then(rec => rec && store.photos.set(photo, { ...rec, keep: true }));
          c.photos = [...(c.photos || []), photo];
          c.drawnOn = { ...(c.drawnOn || {}), [photo]: items[i].on };
          c.updated = now();
          this.save();
          this.drawList();
        },
        done: () => this.edit(c.id),
      },
    });
  }
}

