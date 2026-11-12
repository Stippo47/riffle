// Small shared helpers: card kinds and their stamps, escaping, the tick, notices, typing pads, and the small pops.
import { ICON } from './icons.js';

// What each direction means on each kind of card. To change a stamp's word, change it here.
export const KINDS = {
  question: { label: 'Question', pickLabel: 'My pick', right: 'GO', left: 'WORKSHOP', down: 'IDK', up: 'NOTE' },
  report: { label: 'Report', right: 'GOOD', left: 'PROBLEM', down: 'HUH?', up: 'NOTE' },
  design: { label: 'Design', pickLabel: 'My design', right: 'YES', left: 'RETHINK', down: 'IDK', up: 'NOTE' },
  options: { label: 'Options', pickLabel: 'My pick', right: 'GO', left: 'REDO', down: 'IDK', up: 'NOTE' },
  board: { label: 'Board', pickLabel: 'My pick', right: 'GO', left: 'REDO', down: 'IDK', up: 'NOTE' },
};
const HANDLED_WORDS = { right: 'FINE', left: 'WORKSHOP', down: 'IDK', up: 'NOTE' };
export const kindOf = card => KINDS[card.kind] || KINDS.question;
export const stampWord = (card, dir) => (card.handled ? HANDLED_WORDS : kindOf(card))[dir];

// What each way of swiping means. Keys are the way the finger goes, values are the meaning, and
// meanings are what get recorded: right is go, left is workshop, down is idk, up is comment.
export const DEFAULT_DIRS = { right: 'right', left: 'left', up: 'up', down: 'down' };
let dirs = { ...DEFAULT_DIRS };
export const setDirs = map => { dirs = { ...DEFAULT_DIRS, ...map }; };
export const getDirs = () => ({ ...dirs });
export const logicalOf = phys => dirs[phys];
export const physicalOf = logical => Object.keys(dirs).find(k => dirs[k] === logical);
export const MEANING = { right: 'Go', left: 'Workshop', down: 'IDK', up: 'Comment' };
export const MARK_ICON = { right: 'check', left: 'x', down: 'circle-help', up: 'message-square-text' };

// Lets wording name a meaning and still be right whichever way it has been swapped to.
const FILL = { go: 'right', workshop: 'left', idk: 'down', comment: 'up' };
export const fillDirs = text => String(text || '').replace(/\{(go|workshop|idk|comment)\}/g, (_, k) => physicalOf(FILL[k]));

// Five levels in the usual game rarity colours. The tints live in style.css.
export const RARITY = {
  common: { label: '' },
  uncommon: { label: 'Uncommon' },
  rare: { label: 'Rare · matters, can change later' },
  epic: { label: "Epic · can't be undone", breaks: true },
  legendary: { label: 'Legendary · shapes everything after', breaks: true },
};

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icon = name => ICON[name] || '';
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Turns plain text with blank lines into paragraphs.
export const paras = text => String(text || '').split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('');

// Pack icons from the data repo are SVG text. Only shapes get through.
export function safeIcon(text) {
  if (!text) return '';
  if (ICON[text]) return ICON[text];
  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.nodeName !== 'svg') return '';
    const box = svg.getAttribute('viewBox') || '0 0 512 512';
    const paths = [...svg.querySelectorAll('path')]
      .filter(p => p.getAttribute('d') !== 'M0 0h512v512H0z') // game icons' black background
      .map(p => `<path d="${esc(p.getAttribute('d'))}" fill="currentColor"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(box)}">${paths.join('')}</svg>`;
  } catch { return ''; }
}

// A tick for the thumb. iPhones let web pages tick only through this switch trick, and only on
// recent versions. Android vibrates. If neither works, nothing happens.
let hap = null;
export function tick() {
  if (navigator.vibrate) { navigator.vibrate(8); return; }
  if (!hap) {
    hap = document.createElement('label');
    hap.className = 'hap';
    hap.innerHTML = '<input type="checkbox" switch tabindex="-1">';
    document.body.append(hap);
  }
  hap.click();
}

// One short message for the screen's title line, shown in place of its count, so nothing ever
// floats over the buttons or a card. A screen marks its place with data-slot="notice".
let notice = null;
export function setNotice(next) {
  notice = next;
  paintNotices();
}
export function paintNotices() {
  document.querySelectorAll('[data-slot=notice]').forEach(el => {
    const on = !!notice;
    el.textContent = on ? notice.text : (el.dataset.plain || '');
    el.classList.toggle('is-notice', on);
    el.parentElement.classList.toggle('has-notice', on);
    el.onclick = on ? notice.act : null;
  });
}
export const plainSlot = (el, text) => {
  el.dataset.plain = text;
  paintNotices();
};

// A place to type that isn't a form field, in the hope iPhones then leave out their autofill bar
// above the keyboard. Autocorrect, dictation and pasting work as usual.
export const padHTML = (id, placeholder) =>
  `<div class="pad is-empty" id="${id}" contenteditable="plaintext-only" role="textbox" aria-multiline="true" aria-label="${esc(placeholder)}" data-placeholder="${esc(placeholder)}" autocorrect="on" autocapitalize="sentences" spellcheck="true"></div>`;
export function padReady(el, onInput) {
  if (!el.isContentEditable) el.contentEditable = 'true';
  el.addEventListener('input', () => {
    el.classList.toggle('is-empty', !padText(el));
    onInput && onInput(padText(el));
  });
}
export const padText = el => el.innerText.replace(/\n+$/, '');
export function padSet(el, text) {
  el.textContent = text || '';
  el.classList.toggle('is-empty', !text);
}
function caretToEnd(el) {
  const sel = getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}
// iPhones only raise the keyboard for a focus during a finger's lift. This runs during the pointer's
// lift and tries once more on the touch's own end, whichever of them counts.
export function padFocus(el) {
  el.focus();
  caretToEnd(el);
  document.addEventListener('touchend', () => {
    if (document.activeElement !== el && !el.closest('[hidden]')) { el.focus(); caretToEnd(el); }
  }, { once: true, capture: true });
}
export function padBlur(el) {
  el.blur();
  const sel = getSelection();
  if (sel) sel.removeAllRanges();
}

// Where the caret was in each pad, so something put in later lands there, even after the pad lost focus.
document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const node = r.startContainer && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
  const pad = node && node.closest && node.closest('.pad');
  if (pad) pad.caret = r.cloneRange();
});

// Puts text into a pad where its caret last was, or at the end, as if typed: its input handler runs, so
// it's saved like anything typed.
export function padInsert(el, text) {
  el.focus();
  const sel = getSelection();
  const r = el.caret && el.contains(el.caret.startContainer) ? el.caret : null;
  if (sel) {
    sel.removeAllRanges();
    if (r) sel.addRange(r);
    else { const end = document.createRange(); end.selectNodeContents(el); end.collapse(false); sel.addRange(end); }
  }
  // A space first, if it would otherwise run on from a word.
  const at0 = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  const before = at0 && at0.startContainer.nodeType === 3 ? at0.startContainer.textContent.slice(0, at0.startOffset) : padText(el);
  if (before && !/\s$/.test(before)) text = ` ${text}`;
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
  if (!ok) {
    const at = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const node = document.createTextNode(text);
    if (at) { at.deleteContents(); at.insertNode(node); at.setStartAfter(node); at.collapse(true); } else el.append(node);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.classList.toggle('is-empty', !padText(el));
}

// Dragging down on a panel brings it back down. A long text scrolled away from its top scrolls
// first. shift(dy) moves the panel with the finger, and close() runs if the drag was far or fast.
export function dragToClose(panel, scroller, shift, close, distance = 56) {
  let y0 = null, x0 = 0, t0 = 0, dragging = false;
  panel.addEventListener('touchstart', e => {
    y0 = null;
    if (e.touches.length !== 1) return;
    const sc = scroller(e.target);
    if (sc && sc.scrollTop > 0) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; t0 = e.timeStamp; dragging = false;
  }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (y0 === null) return;
    if (e.touches.length !== 1) { y0 = null; if (dragging) { dragging = false; shift(0); } return; }
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (!dragging) {
      if (e.timeStamp - t0 > 350) { y0 = null; return; } // a slow start is someone selecting text
      if (dy > 8 && dy > Math.abs(dx) * 1.3) dragging = true;
      else if (dy < -8 || Math.abs(dx) > 12) { y0 = null; return; }
      else return;
    }
    if (e.cancelable) e.preventDefault();
    shift(Math.max(0, dy));
  }, { passive: false });
  panel.addEventListener('touchend', e => {
    if (y0 === null || !dragging) { y0 = null; return; }
    const dy = e.changedTouches[0].clientY - y0;
    const fast = dy / Math.max(1, e.timeStamp - t0) > 0.5 && dy > 26;
    y0 = null;
    dragging = false;
    shift(0);
    if (dy >= distance || fast) close();
  });
  panel.addEventListener('touchcancel', () => {
    if (dragging) shift(0);
    y0 = null;
    dragging = false;
  });
}

// A small pop of bits, from the top third of the screen, gone within a second.
export function confetti(host, { count = 24, force = 0.7, colors = ['#ffffff'] } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = host.clientWidth, H = host.clientHeight;
  c.width = W * dpr; c.height = H * dpr;
  host.append(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const bits = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 7) * force;
    return { x: W / 2, y: H * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, r: Math.random() * 6,
      vr: (Math.random() - .5) * .4, w: 4 + Math.random() * 4, h: 7 + Math.random() * 5,
      col: colors[Math.floor(Math.random() * colors.length)] };
  });
  const LIFE = 950;
  const start = performance.now();
  const step = now => {
    const t = now - start;
    g.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += .22; b.vx *= .985; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save();
      g.globalAlpha = clamp(1.5 * (1 - t / LIFE), 0, 1);
      g.translate(b.x, b.y); g.rotate(b.r);
      g.fillStyle = b.col;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    if (t < LIFE) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}
