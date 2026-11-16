// Small shared helpers: card kinds and their stamps, escaping, the tick, notices, typing pads, and the small pops.
import { ICON } from './icons.js';

// What each direction means on each kind of card. To change a stamp's word, change it here.
export const KINDS = {
  question: { label: 'Question', pickLabel: 'My pick', right: 'GO', left: 'WORKSHOP', down: 'IDK', up: 'NOTE' },
  // A report's down is "decent": fine, but not happy yet, or not quite following. It was HUH? before 0.11.0.
  report: { label: 'Report', right: 'GOOD', left: 'PROBLEM', down: 'DECENT', up: 'NOTE', icons: { down: 'meh' } },
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
// The icon for a meaning on this kind of card.
export const markIcon = (card, logical) => ((card && !card.handled && kindOf(card).icons) || {})[logical] || MARK_ICON[logical];

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
// A link in a box being typed in shows as a short blue chip with its label, and the whole link stays
// out of sight, in the chip. The box's words, as saved and sent, have the link written out in full.
const RLINK = /\[([^\]\n]{1,120})\]\(riffle:([^)\s]{1,400})\)/g;
function chipFor(full, label, address) {
  const c = document.createElement('span');
  c.className = 'lchip';
  c.contentEditable = 'false';
  c.dataset.link = full;
  c.dataset.addr = address;
  const what = /[?&]film=/.test(address) ? 'play' : /[?&](pic|drawing)=/.test(address) ? 'image' : 'link';
  c.innerHTML = `${ICON[what] || ''}<span>${esc(label.trim())}</span>`;
  return c;
}
// Words as nodes for a box: text, and a chip for each link.
function padNodes(text) {
  const s = String(text || '');
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of s.matchAll(RLINK)) {
    if (m.index > last) frag.append(document.createTextNode(s.slice(last, m.index)));
    frag.append(chipFor(m[0], m[1], m[2]));
    last = m.index + m[0].length;
  }
  if (last < s.length) frag.append(document.createTextNode(s.slice(last)));
  return frag;
}
// A box's words, links written out in full. Breaks the browser made with <br> or <div> are line breaks.
function serial(nodes) {
  let out = '';
  const walk = list => {
    for (const c of list) {
      if (c.nodeType === 3) { out += c.nodeValue; continue; }
      if (c.nodeType !== 1) continue;
      if (c.dataset && c.dataset.link != null) { out += c.dataset.link; continue; }
      if (c.tagName === 'BR') { out += '\n'; continue; }
      const block = /^(DIV|P|LI)$/.test(c.tagName);
      if (block && out && !out.endsWith('\n')) out += '\n';
      walk(c.childNodes);
      if (block && !out.endsWith('\n')) out += '\n';
    }
  };
  walk(nodes);
  return out.replace(/\u00a0/g, ' ');
}
export const padText = el => serial(el.childNodes).replace(/\n+$/, '');
export function padSet(el, text) {
  el.replaceChildren(padNodes(text));
  el.classList.toggle('is-empty', !text);
}
// How far into a box's words its caret is, links counted in full. Null if it has no caret of its own.
export function padOffset(el) {
  const r = el.caret;
  if (!r || !el.contains(r.startContainer)) return el.caretAt ?? null;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  try { pre.setEnd(r.startContainer, r.startOffset); } catch { return null; }
  return serial(pre.cloneContents().childNodes).length;
}
// Puts the caret this far into a box's words, links counted in full.
function caretAt(el, offset) {
  let left = offset;
  const r = document.createRange();
  let done = false;
  for (const c of el.childNodes) {
    const len = c.nodeType === 3 ? c.nodeValue.length : serial([c]).length;
    if (left <= len) {
      if (c.nodeType === 3) r.setStart(c, left);
      else if (left === 0) r.setStartBefore(c);
      else r.setStartAfter(c);
      done = true;
      break;
    }
    left -= len;
  }
  if (!done) r.selectNodeContents(el);
  r.collapse(done);
  el.caret = r.cloneRange();
  const sel = getSelection();
  if (sel && document.activeElement === el) { sel.removeAllRanges(); sel.addRange(r); }
}
// Puts words into a box where its caret was, without focusing it (so no keyboard comes up), as if typed:
// its input handler runs, so it's saved like anything typed. `line` puts them on a line of their own.
export function padPut(el, text, { line = false } = {}) {
  const now = padText(el);
  const at = Math.max(0, Math.min(padOffset(el) ?? now.length, now.length));
  const before = now.slice(0, at), after = now.slice(at);
  const lead = !before ? '' : line ? (before.endsWith('\n') ? '' : '\n') : /\s$/.test(before) ? '' : ' ';
  const tail = line ? (after.startsWith('\n') ? '' : '\n') : /^\s/.test(after) ? '' : ' ';
  const next = before + lead + text + tail + after;
  padSet(el, next);
  el.caretAt = (before + lead + text + tail).length;
  caretAt(el, el.caretAt);
  el.dispatchEvent(new Event('input', { bubbles: true }));
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
// lift and tries once more on the touch's own end, whichever of them counts. Only the touch that's
// down now: a try left waiting after a click (which comes after the touch ended) would catch the next
// tap anywhere, and open this box again under a finger that meant something else.
let fingersDown = 0;
const countFingers = e => { fingersDown = e.touches ? e.touches.length : 0; };
for (const t of ['touchstart', 'touchend', 'touchcancel']) document.addEventListener(t, countFingers, { capture: true, passive: true });
export function padFocus(el) {
  el.focus();
  caretToEnd(el);
  if (!fingersDown) return;
  const again = () => {
    clearTimeout(expire);
    if (document.activeElement !== el && !el.closest('[hidden]')) { el.focus(); caretToEnd(el); }
  };
  const expire = setTimeout(() => document.removeEventListener('touchend', again, true), 1000);
  document.addEventListener('touchend', again, { once: true, capture: true });
}
export function padBlur(el) {
  el.blur();
  const sel = getSelection();
  if (sel) sel.removeAllRanges();
}

// The nearest box that scrolls, around something. The app itself never scrolls, so this stops short of it.
function scrollerOf(el) {
  for (let p = el.parentElement; p && p.id !== 'app' && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

// Brings a box being typed in into view above the keyboard, in whatever scrolls around it, and again once
// the keyboard has finished coming up. Only that box scrolls: never the app, which would shift the screen.
export function revealPad(el) {
  if (!el) return;
  const go = () => {
    if (document.activeElement !== el) return;
    const sc = scrollerOf(el);
    if (!sc) return;
    const vv = window.visualViewport;
    const r = el.getBoundingClientRect(), b = sc.getBoundingClientRect();
    const bottom = Math.min(b.bottom, vv ? vv.offsetTop + vv.height : innerHeight) - 10;
    if (r.bottom > bottom) sc.scrollTop += Math.min(r.bottom - bottom, r.top - b.top - 10);
    else if (r.top < b.top + 10) sc.scrollTop -= b.top + 10 - r.top;
  };
  requestAnimationFrame(go);
  setTimeout(go, 320);
  setTimeout(go, 650);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', go, { once: true });
}

// iPhones keep drawing a focused box's caret even when the box has been hidden, turned away or scrolled
// out of sight, so it shows over things that aren't for typing. A box like that loses focus instead.
export function blurHidden() {
  const a = document.activeElement;
  if (!a || a === document.body || !(a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))) return;
  const r = a.getBoundingClientRect();
  let gone = !r.width || !r.height || !!a.closest('[hidden]') || getComputedStyle(a).visibility === 'hidden';
  const flip = a.closest('.flip');
  if (!gone && flip) gone = a.closest('.face') ? flip.classList.contains('flipped') : !flip.classList.contains('flipped');
  const sc = !gone && scrollerOf(a);
  if (sc) { const b = sc.getBoundingClientRect(); gone = r.bottom < b.top + 4 || r.top > b.bottom - 4; }
  if (gone) padBlur(a);
}
let blurQueued = false;
const blurSoon = () => {
  if (blurQueued) return;
  blurQueued = true;
  requestAnimationFrame(() => { blurQueued = false; blurHidden(); });
};
document.addEventListener('scroll', blurSoon, { capture: true, passive: true });
document.addEventListener('pointerup', () => setTimeout(blurHidden, 60), { capture: true });
// The strip under the words, where the link and photo buttons sit, is still the box: a tap there types.
document.addEventListener('click', e => {
  const w = e.target;
  if (!w || !w.classList || !w.classList.contains('padwrap')) return;
  const pad = w.querySelector('.pad');
  if (pad) padFocus(pad);
});
// A tap on a link's chip, in a box to type in, opens what it links. The app says how, once.
let openChip = () => {};
export const onChipTap = fn => { openChip = fn; };
document.addEventListener('click', e => {
  const chip = e.target && e.target.closest && e.target.closest('.pad .lchip');
  if (!chip) return;
  e.preventDefault();
  e.stopPropagation();
  openChip(chip.dataset.addr);
}, true);
// Any box that's focused is brought into view above the keyboard, wherever it is.
document.addEventListener('focusin', e => { if (e.target && e.target.classList && e.target.classList.contains('pad')) revealPad(e.target); });

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
  const before = at0 && at0.startContainer.nodeType === 3 ? at0.startContainer.textContent.slice(0, at0.startOffset) : (() => { el.caret = at0; return (padText(el).slice(0, padOffset(el) ?? undefined)); })();
  if (before && !/\s$/.test(before)) text = ` ${text}`;
  let ok = false;
  RLINK.lastIndex = 0;
  const hasLink = RLINK.test(text);
  RLINK.lastIndex = 0;
  if (!hasLink) { try { ok = document.execCommand('insertText', false, text); } catch { ok = false; } }
  if (!ok && hasLink) { // a link goes in as its chip, with a space after it to carry on typing from
    const at = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const frag = padNodes(`${text} `);
    const lastNode = frag.lastChild;
    if (at) { at.deleteContents(); at.insertNode(frag); at.setStart(lastNode, lastNode.nodeValue.length); at.collapse(true); sel.removeAllRanges(); sel.addRange(at); } else el.append(frag);
    el.caret = at ? at.cloneRange() : null;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (!ok) {
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
