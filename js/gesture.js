// How far and how fast a card has to travel to count, and the finger tracking behind it.

export const TUNE = {
  side: 0.27,          // sideways: share of the screen's width
  vert: 0.15,          // up and down: share of the screen's height
  compactSide: 0.2,    // the same while the comment box is open and the card is small
  compactVert: 54,     // pixels
  flickSpeed: 0.55,    // pixels per millisecond that count as a flick
  flickMin: 34,        // a flick still has to travel this far
  reverseSpeed: 0.5,   // pulling back this fast on release cancels the throw
  tapMove: 9,          // more movement than this isn't a tap
  tapMs: 320,
  breakHoldMs: 1000,   // epic and legendary: how long a right swipe must be held to break through
  breakDecayMs: 240,   // how fast the build-up drains after letting go or pulling back
  breakStart: 0.11,    // the build-up starts once the card is pushed this share of the width
  breakPush: 0.17,     // how far the card can actually be pushed against the resistance
  pinchOpen: 0.78,     // fingers this much closer opens the overview
};

export const dominant = (dx, dy) =>
  Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');

const isSide = dir => dir === 'right' || dir === 'left';

function need(dir, w, h, compact) {
  if (compact) return isSide(dir) ? w * TUNE.compactSide : TUNE.compactVert;
  return isSide(dir) ? w * TUNE.side : h * TUNE.vert;
}

// 0 at rest, 1 where the card counts as thrown.
export function progress(dx, dy, w, h, compact = false) {
  const dir = dominant(dx, dy);
  return (isSide(dir) ? Math.abs(dx) : Math.abs(dy)) / need(dir, w, h, compact);
}

// Where the card goes on release: a direction, or null to spring back.
export function decide({ dx, dy, vx = 0, vy = 0, w, h, compact = false }) {
  const dir = dominant(dx, dy);
  const far = isSide(dir) ? Math.abs(dx) : Math.abs(dy);
  const speed = dir === 'right' ? vx : dir === 'left' ? -vx : dir === 'down' ? vy : -vy;
  if (speed <= -TUNE.reverseSpeed) return null;
  if (far >= need(dir, w, h, compact)) return dir;
  if (far >= TUNE.flickMin && speed >= TUNE.flickSpeed) return dir;
  return null;
}

// Follows one finger as a drag and two as a pinch. Handlers: blocked, start, move, release, cancel, tap,
// pinchStart, pinch(scale), pinchEnd(scale). Directions here are the way the finger goes.
export function track(el, h) {
  const pts = new Map();
  let drag = null, pinch = null, ignore = false, samples = [], spread0 = 1;

  const spread = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };
  const pinchUpdate = scale => {
    if (!pinch) {
      if (drag && drag.moved) h.cancel && h.cancel();
      drag = null;
      pinch = { scale: 1 };
      h.pinchStart && h.pinchStart();
    }
    pinch.scale = scale;
    h.pinch && h.pinch(scale);
  };
  const pinchEnd = () => {
    if (!pinch) return;
    const s = pinch.scale;
    pinch = null;
    ignore = pts.size > 0;
    h.pinchEnd && h.pinchEnd(s);
  };

  const onDown = e => {
    if (h.blocked && h.blocked(e)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in tests */ }
    if (pts.size === 1) {
      ignore = false;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, moved: false };
      h.start && h.start(e);
      samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    } else if (pts.size === 2) {
      spread0 = spread();
      pinchUpdate(1);
    }
  };
  const onMove = e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size >= 2) { pinchUpdate(spread() / spread0); return; }
    if (ignore || !drag || drag.id !== e.pointerId) return;
    samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    while (samples.length > 2 && e.timeStamp - samples[0].t > 90) samples.shift();
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > TUNE.tapMove) drag.moved = true;
    if (drag.moved) h.move && h.move({ dx, dy });
  };
  const onUp = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) pinchEnd(); return; }
    if (ignore) { if (!pts.size) ignore = false; return; }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    const dt = e.timeStamp - drag.t0;
    const first = samples[0], span = Math.max(1, e.timeStamp - first.t);
    const vx = (e.clientX - first.x) / span, vy = (e.clientY - first.y) / span;
    const moved = drag.moved;
    drag = null;
    if (!moved) { if (dt < TUNE.tapMs) h.tap && h.tap(e); return; }
    h.release && h.release({ dx, dy, vx, vy });
  };
  const onCancel = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) pinchEnd(); return; }
    if (drag && drag.id === e.pointerId) {
      const moved = drag.moved;
      drag = null;
      if (moved) h.cancel && h.cancel();
    }
    if (!pts.size) ignore = false;
  };

  // iPhones also report pinches as gesture events. Either source can drive the same pinch.
  const onGesture = e => {
    e.preventDefault();
    if (h.blocked && h.blocked(e)) return;
    if (e.type === 'gestureend') pinchEnd();
    else pinchUpdate(e.scale);
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) el.addEventListener(t, onGesture);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) el.removeEventListener(t, onGesture);
  };
}

// Just a pinch inward, on something that isn't a card and keeps its own touches for scrolling and typing:
// the end of a deck. fire() runs once per pinch.
export function watchPinch(el, fire) {
  const pts = new Map();
  let d0 = 1, fired = false;
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  el.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { d0 = spread(); fired = false; }
  });
  el.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && !fired && spread() / d0 < TUNE.pinchOpen) { fired = true; fire(); }
  });
  const up = e => pts.delete(e.pointerId);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('gesturestart', () => { fired = false; });
  el.addEventListener('gesturechange', e => { if (!fired && e.scale < TUNE.pinchOpen) { fired = true; fire(); } });
}
