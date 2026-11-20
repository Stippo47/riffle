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
const SPOT_KEY = 'island-spot'; // where it was let go, as shares of the screen, from 0.16.0
const EDGE = 6;     // how near the screen's edges it can go, inside the safe areas
const TAP_MOVE = 8;
const CORNERS = ['tl', 'tr', 'bl', 'br'];

let state = null;   // { pack, deck, card, part, composing, partComposing, show: { deckTitle, text, title, rarity, kind } }
let corner = 'br';
let spotAt = null;  // { fx, fy }: the middle of the mini player, as shares of the screen's width and height
let layer = null, el = null;
let onTap = () => {};

export const islandNow = () => state;

export async function initIsland(tap) {
  onTap = tap;
  state = (await store.get(KEY).catch(() => null)) || null;
  corner = (await store.get(CORNER_KEY).catch(() => null)) || 'br';
  spotAt = (await store.get(SPOT_KEY).catch(() => null)) || null;
  draw();
}

export function setIsland(next) {
  state = next || null;
  if (state) store.set(KEY, state); else store.del(KEY);
  draw();
}

// Where a corner is, in pixels: under the title rows at the top, over the home bar at the bottom. With
// the keyboard up the bottom is taken, so the bottom corners wait at the top.
let probe = null;
function insets() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:var(--sat);border-bottom:solid 0 transparent;border-bottom-width:var(--sab)';
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe);
  return { sat: parseFloat(cs.height) || 0, sab: parseFloat(cs.borderBottomWidth) || 0 };
}
// Once it's been dragged, it stays where it was let go, anywhere, right into the corners, a little in from
// the edges. Before that it starts in a corner, clear of the title rows and the buttons.
function spot(c) {
  const { sat, sab } = insets();
  const W = layer.clientWidth, H = layer.clientHeight, w = el.offsetWidth, h = el.offsetHeight;
  const kb = document.documentElement.classList.contains('kb');
  const fit = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const x = spotAt ? fit(spotAt.fx * W - w / 2, EDGE, W - w - EDGE) : c[1] === 'l' ? 10 : W - w - 10;
  if (kb) return { x, y: sat + 10 };
  const y = spotAt ? fit(spotAt.fy * H - h / 2, sat + EDGE, H - h - sab - EDGE) : c[0] === 't' ? sat + 104 : H - h - (sab + 80);
  return { x, y };
}
function place(x, y) {
  el.style.setProperty('--ix', `${Math.round(x)}px`);
  el.style.setProperty('--iy', `${Math.round(y)}px`);
}
const settle = () => { if (el && state && !layer.hidden && !el.classList.contains('dragging')) { const p = spot(corner); place(p.x, p.y); } };

function build() {
  layer = document.createElement('div');
  layer.className = 'island-layer';
  el = document.createElement('button');
  el.className = 'island';
  el.setAttribute('aria-label', 'The deck in the mini player. Tap to bring it back');
  layer.append(el);
  document.body.append(layer);
  // Its corner follows the screen: turning the phone, the keyboard coming up or going.
  addEventListener('resize', settle);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', settle);
  new MutationObserver(settle).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

  // Dragged anywhere, it stays where it's let go, kept on the screen. A tap that barely moves brings it back.
  // An iPhone can cancel a touch it takes for its own (a scroll or a swipe home): the drag still counts.
  let drag = null;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const at = spot(corner);
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, at };
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in tests */ }
  });
  el.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < TAP_MOVE) return;
    drag.moved = true;
    drag.last = { x: e.clientX, y: e.clientY };
    el.classList.add('dragging');
    place(drag.at.x + dx, drag.at.y + dy);
  });
  const end = (e, cancelled) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    el.classList.remove('dragging');
    if (!d.moved) { if (!cancelled && state) onTap(state); else settle(); return; }
    const last = cancelled ? d.last : { x: e.clientX, y: e.clientY };
    const w = el.offsetWidth, h = el.offsetHeight;
    const cx = d.at.x + (last.x - d.x0) + w / 2, cy = d.at.y + (last.y - d.y0) + h / 2;
    corner = `${cy < layer.clientHeight / 2 ? 't' : 'b'}${cx < layer.clientWidth / 2 ? 'l' : 'r'}`;
    spotAt = { fx: +(cx / layer.clientWidth).toFixed(4), fy: +(cy / layer.clientHeight).toFixed(4) };
    store.set(CORNER_KEY, corner);
    store.set(SPOT_KEY, spotAt);
    el.dataset.corner = corner;
    settle();
  };
  el.addEventListener('pointerup', e => end(e, false));
  el.addEventListener('pointercancel', e => end(e, true));
  // The tap is handled on the lift above. A click after it must not reach what's under the island.
  el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  el.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  el.addEventListener('touchend', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
}

// Where the mini player is on screen now, for a deck growing out of it.
export function islandRect() {
  return el && state && !layer.hidden ? el.getBoundingClientRect() : null;
}

// The mini player grows in from where a card was: it starts the card's size and place, and shrinks into its corner.
export function islandFrom(rect) {
  if (!el || !state || !rect || !el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const to = el.getBoundingClientRect();
  if (!to.width) return;
  const base = layer.getBoundingClientRect();
  const sx = rect.width / to.width, sy = rect.height / to.height;
  el.animate([
    { transform: `translate3d(${rect.left - base.left}px,${rect.top - base.top}px,0) scale(${sx},${sy})`, opacity: 0.7 },
    { transform: `translate3d(${to.left - base.left}px,${to.top - base.top}px,0) scale(1)`, opacity: 1 },
  ], { duration: 340, easing: 'cubic-bezier(.2,.9,.3,1)' });
}

function draw() {
  if (!layer) build();
  const appearing = layer.hidden || !el.style.getPropertyValue('--ix');
  layer.hidden = !state;
  fill();
  if (!state) return;
  // Coming into view it's put in its corner at once; only moves after that glide.
  if (appearing) el.classList.add('placing');
  const p = spot(corner);
  place(p.x, p.y);
  if (appearing) { void el.offsetWidth; el.classList.remove('placing'); }
}

function fill() {
  document.body.classList.toggle('has-island', !!state);
  if (!state) return;
  const s = state.show || {};
  el.dataset.corner = CORNERS.includes(corner) ? corner : 'br';
  corner = el.dataset.corner;
  // A finished deck looks like the end of a deck: dark, with what was answered. A card looks like a card.
  if (s.done) {
    el.className = 'island is-done';
    el.innerHTML = `
      <span class="isl-deck">${esc(s.deckTitle || '')}</span>
      <span class="isl-title">Deck done</span>
      <span class="isl-text">${esc(s.said || '')}</span>
      <span class="isl-kind">Tap to go back to it</span>`;
    return;
  }
  const what = s.handled ? 'Handled' : kindOf({ kind: s.kind }).label;
  el.className = `island ${s.rarity || 'common'}`;
  el.innerHTML = `
    <span class="isl-deck">${esc(s.deckTitle || '')}</span>
    ${s.title ? `<span class="isl-title">${esc(plainLinks(s.title))}</span>` : ''}
    <span class="isl-text">${esc(plainLinks(s.text || ''))}</span>
    <span class="isl-kind">${esc(s.part ? `${what} · ${s.part}` : what)}</span>`;
}
