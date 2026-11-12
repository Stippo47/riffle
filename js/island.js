// The mini player: one deck shrunk into a small floating card that shows the card it was on. It sits
// over every screen, in a corner it can be dragged to, out of the way of swiping, and it moves to the
// top while the keyboard is up. A tap brings it back full size, and the deck that was open takes its
// place. Where it was is kept, so a closed app comes back to it. The deck's own state, drafts and all,
// is saved as usual, so nothing typed in either deck is touched by the swap.
import { esc, kindOf } from './ui.js';
import { plainLinks } from './links.js';
import * as store from './store.js';

const KEY = 'island';
const CORNER_KEY = 'island-corner';
const TAP_MOVE = 8;
const CORNERS = ['tl', 'tr', 'bl', 'br'];

let state = null;   // { pack, deck, card, part, composing, partComposing, show: { deckTitle, text, title, rarity, kind } }
let corner = 'br';
let layer = null, el = null;
let onTap = () => {};

export const islandNow = () => state;

export async function initIsland(tap) {
  onTap = tap;
  state = (await store.get(KEY).catch(() => null)) || null;
  corner = (await store.get(CORNER_KEY).catch(() => null)) || 'br';
  draw();
}

export function setIsland(next) {
  state = next || null;
  if (state) store.set(KEY, state); else store.del(KEY);
  draw();
}

function build() {
  layer = document.createElement('div');
  layer.className = 'island-layer';
  el = document.createElement('button');
  el.className = 'island';
  el.setAttribute('aria-label', 'The deck in the mini player. Tap to bring it back');
  layer.append(el);
  document.body.append(layer);
  // While typing, the keyboard takes the bottom, so the island waits at the top.
  const typing = () => {
    const a = document.activeElement;
    layer.classList.toggle('typing', !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))));
  };
  document.addEventListener('focusin', typing);
  document.addEventListener('focusout', () => setTimeout(typing, 0));

  // Dragged anywhere, it settles in the nearest corner. A tap that barely moves brings it back.
  let drag = null;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = el.getBoundingClientRect();
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in tests */ }
  });
  el.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < TAP_MOVE) return;
    drag.moved = true;
    el.classList.add('dragging');
    el.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const end = (e, cancelled) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    el.classList.remove('dragging');
    el.style.transform = '';
    if (cancelled) return;
    if (!d.moved) { if (state) onTap(state); return; }
    const x = d.cx + (e.clientX - d.x0), y = d.cy + (e.clientY - d.y0);
    corner = `${y < innerHeight / 2 ? 't' : 'b'}${x < innerWidth / 2 ? 'l' : 'r'}`;
    store.set(CORNER_KEY, corner);
    el.dataset.corner = corner;
  };
  el.addEventListener('pointerup', e => end(e, false));
  el.addEventListener('pointercancel', e => end(e, true));
  // The tap is handled on the lift above. A click after it must not reach what's under the island.
  el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('touchend', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
}

function draw() {
  if (!layer) build();
  layer.hidden = !state;
  if (!state) return;
  const s = state.show || {};
  el.dataset.corner = CORNERS.includes(corner) ? corner : 'br';
  el.className = `island ${s.rarity || 'common'}`;
  el.innerHTML = `
    <span class="isl-deck">${esc(s.deckTitle || '')}</span>
    <span class="isl-text">${esc(plainLinks(s.text || s.title || ''))}</span>
    <span class="isl-kind">${esc(s.part ? s.part : kindOf({ kind: s.kind }).label)}</span>`;
}
