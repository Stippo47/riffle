// A pack's general thoughts. Not a deck, because decks end and this doesn't: a pad on top, and earlier
// thoughts below, newest first. Whatever is being typed gets the same protection as a comment.
import { dragToClose, esc, icon, padBlur, padHTML, padReady, padSet, padText } from './ui.js';
import * as store from './store.js';
import { enqueue, newId } from './sync.js';
import { thoughtsKey } from './deck.js';

const DRAFT_SEND_AFTER = 5000;

export const thoughtCount = async pack => {
  const s = await store.get(thoughtsKey(pack)).catch(() => null);
  return s ? s.items.length : 0;
};

const when = at => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export class ThoughtsView {
  constructor({ host, pack, onExit }) {
    Object.assign(this, { host, pack, onExit });
    this.key = thoughtsKey(pack);
  }

  async open() {
    this.s = (await store.get(this.key)) || { items: [], draft: '', draftSent: '' };
    this.host.innerHTML = `
      <div class="thoughts screen">
        <div class="deckbar">
          <button class="iconbtn" data-go="back" aria-label="Back">${icon('chevron-left')}</button>
          <div class="t">Thoughts</div>
          <div class="n" data-slot="notice"></div>
        </div>
        ${padHTML('thoughtpad', "Anything on your mind about this project. It doesn't need a card.")}
        <button class="primary" id="filethought">File it</button>
        <div class="thoughtlist scroll" id="thoughtlist"></div>
      </div>`;
    this.pad = this.host.querySelector('#thoughtpad');
    this.fileBtn = this.host.querySelector('#filethought');
    padSet(this.pad, this.s.draft);
    padReady(this.pad, text => {
      this.s.draft = text;
      this.saveNow(); // at once: the backup write is synchronous, so a killed app keeps it
      this.syncButton();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.sendDraft(), DRAFT_SEND_AFTER);
    });
    dragToClose(this.pad, () => this.pad, () => {}, () => padBlur(this.pad));
    this.fileBtn.onclick = () => this.file();
    this.host.querySelector('[data-go=back]').onclick = () => { this.close(); this.onExit(); };
    this.syncButton();
    this.drawList();
  }

  syncButton() { this.fileBtn.disabled = !padText(this.pad).trim(); }

  base() {
    return { pack: this.pack.id, topic: null, deck: null, ...(this.pack.demo ? { demo: true } : {}) };
  }

  saveNow() { return store.set(this.key, JSON.parse(JSON.stringify(this.s))); }

  sendDraft() {
    clearTimeout(this.timer);
    if ((this.s.draft || '') === (this.s.draftSent || '')) return;
    this.s.draftSent = this.s.draft || '';
    enqueue({ ...this.base(), type: 'draft', card: null, thought: true, text: this.s.draft || '' });
    this.saveNow();
  }

  file() {
    const text = padText(this.pad).trim();
    if (!text) return;
    clearTimeout(this.timer);
    const item = { id: newId(), text, at: new Date().toISOString() };
    enqueue({ ...this.base(), type: 'thought', id: item.id, text });
    this.s.items.unshift(item);
    this.s.draft = '';
    this.s.draftSent = '';
    this.saveNow();
    padSet(this.pad, '');
    padBlur(this.pad);
    this.syncButton();
    this.drawList();
  }

  // Everything goes safe. Runs when the app is hidden, and on leaving.
  secure() {
    this.sendDraft();
    return this.saveNow();
  }
  close() { this.secure(); }

  drawList() {
    const answers = this.pack.thoughtAnswers || {};
    const list = this.host.querySelector('#thoughtlist');
    list.innerHTML = this.s.items.map(t => {
      const h = answers[t.id] && answers[t.id].handled;
      return `<div class="word thought${h ? ' handled' : ''}" data-id="${esc(t.id)}">
        <small>${esc(when(t.at))}</small>
        <span>${esc(t.text)}</span>
        ${h ? `<div class="handled-band small">${icon('check')}<span>Handled</span></div><span class="how">${esc(h.how)}</span>` : ''}
      </div>`;
    }).join('') || '<div class="demo-note">Nothing filed yet.</div>';
  }
}
