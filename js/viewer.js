// A full-screen look at pictures: pinch to zoom, drag to pan, double tap to zoom in and out, and the X
// or a drag down to go back. It sits over everything, so its pinch can't reach the card's underneath.
import { clamp, icon } from './ui.js';

const MAX_ZOOM = 6;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_NEAR = 40;
const TAP_MOVE = 10;
const BACK_DRAG = 90;
const TURN_DRAG = 70;
const FLICK = 0.5;

// items: { thumb: () => url, full: () => url, label, text }, with each url a promise or a value.
// picks: { isOn(i), toggle(i), count() } if the pictures can be selected here.
// opener: { t, x, y } of the finger lifting, if that's what opened this.
export function openViewer({ items, at = 0, picks = null, opener = null, onClose = () => {} }) {
  const many = items.length > 1;
  const hasFoot = many || picks || items.some(it => it.label);
  const root = document.createElement('div');
  root.className = 'viewer';
  root.innerHTML = `
    <div class="viewer-stage"><img alt="" draggable="false"></div>
    <button class="viewer-x" aria-label="Back">${icon('x')}</button>
    <div class="viewer-note" hidden></div>
    ${hasFoot ? `<div class="viewer-foot">
      <div class="viewer-words"><b></b><small></small><span></span></div>
      <div class="viewer-row">
        ${many ? `<button class="viewer-prev" aria-label="Previous picture">${icon('chevron-left')}</button>` : ''}
        ${picks ? `<button class="viewer-tick">${icon('check')}<span></span></button>` : '<i class="viewer-gap"></i>'}
        ${many ? `<button class="viewer-next" aria-label="Next picture">${icon('chevron-left')}</button>` : ''}
      </div>
    </div>` : ''}`;
  document.body.append(root);
  const $ = sel => root.querySelector(sel);
  const stage = $('.viewer-stage'), img = $('img'), note = $('.viewer-note');

  // ---------- where the picture sits. s, tx and ty are relative to it fitting the screen.
  let W = 0, H = 0, nw = 0, nh = 0, fw = 0, fh = 0, base = 1, s = 1, tx = 0, ty = 0;
  const measure = () => {
    W = stage.clientWidth;
    H = stage.clientHeight;
    if (!nw || !nh) return;
    const fit = Math.min(W / nw, H / nh);
    fw = nw * fit;
    fh = nh * fit;
    // The element is the picture's true size and gets scaled down to fit, so zooming shows real
    // pixels and not an enlarged copy of a smaller drawing.
    const dpr = devicePixelRatio || 1;
    img.style.width = `${nw / dpr}px`;
    img.style.height = `${nh / dpr}px`;
    base = fw / (nw / dpr);
  };
  const paint = () => {
    img.style.transform = `translate(${(W - fw * s) / 2 + tx}px,${(H - fh * s) / 2 + ty}px) scale(${base * s})`;
  };
  const inBounds = () => {
    const mx = Math.max(0, (fw * s - W) / 2), my = Math.max(0, (fh * s - H) / 2);
    tx = clamp(tx, -mx, mx);
    ty = clamp(ty, -my, my);
  };
  const settle = animate => {
    s = clamp(s, 1, MAX_ZOOM);
    if (s === 1) { tx = 0; ty = 0; }
    inBounds();
    img.classList.toggle('anim', animate);
    paint();
  };
  const reset = () => {
    s = 1; tx = 0; ty = 0;
    root.style.background = '';
    img.classList.remove('anim');
    paint();
  };

  // ---------- which picture
  let token = 0;
  const setSrc = url => new Promise(resolve => {
    img.onload = () => {
      nw = img.naturalWidth || W;
      nh = img.naturalHeight || H;
      measure();
      paint();
      img.classList.add('ready');
      resolve();
    };
    img.onerror = () => resolve();
    img.src = url;
  });
  const words = i => {
    if (!hasFoot) return;
    const it = items[i];
    $('.viewer-words b').textContent = it.label || '';
    $('.viewer-words small').textContent = it.text || '';
    const parts = [many ? `${i + 1} of ${items.length}` : '', picks && picks.count() ? `${picks.count()} selected` : ''];
    $('.viewer-words span').textContent = parts.filter(Boolean).join(' · ');
    if (picks) {
      const on = picks.isOn(i);
      $('.viewer-tick').classList.toggle('on', on);
      $('.viewer-tick span').textContent = on ? 'Selected' : 'Select';
    }
    if (many) {
      $('.viewer-prev').disabled = i === 0;
      $('.viewer-next').disabled = i === items.length - 1;
    }
  };
  const show = async i => {
    at = i;
    const mine = ++token;
    note.hidden = true;
    nw = 0;
    img.classList.remove('ready');
    reset();
    words(i);
    const it = items[i];
    const thumb = it.thumb ? await it.thumb() : null;
    if (mine !== token) return;
    if (thumb) await setSrc(thumb);
    if (mine !== token) return;
    const full = await it.full();
    if (mine !== token) return;
    if (full && full !== thumb) await setSrc(full);
    else if (!full) {
      note.textContent = thumb ? 'The full picture comes when there is signal. This is the small one.' : 'This picture has not come down yet. It needs signal.';
      note.hidden = false;
    }
    // The ones either side, so the next is ready. They're only kept, not drawn.
    if (items[i + 1]) Promise.resolve(items[i + 1].full()).catch(() => {});
    if (items[i - 1]) Promise.resolve(items[i - 1].full()).catch(() => {});
  };
  const go = d => {
    const next = at + d;
    if (next < 0 || next >= items.length) { img.classList.add('anim'); reset(); return; }
    show(next);
  };
  const close = () => {
    token++;
    removeEventListener('resize', resized);
    root.remove();
    onClose();
  };
  const resized = () => { measure(); settle(false); };
  addEventListener('resize', resized);

  // ---------- fingers
  const pts = new Map();
  let drag = null, pinch = null, pinched = false, lastTap = null;
  const place = e => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const beginPinch = (x, y, d) => {
    drag = null;
    pinched = true;
    lastTap = null;
    img.classList.remove('anim');
    pinch = { s0: s, d0: d, px: (x - W / 2 - tx) / s, py: (y - H / 2 - ty) / s };
  };
  const movePinch = (x, y, ratio) => {
    s = clamp(pinch.s0 * ratio, 0.75, MAX_ZOOM * 1.15);
    tx = x - W / 2 - s * pinch.px;
    ty = y - H / 2 - s * pinch.py;
    paint();
  };
  const two = () => {
    const [a, b] = [...pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };
  const startDrag = (x, y, time, moved = false) => {
    drag = { x0: x, y0: y, t0: time, tx0: tx, ty0: ty, mode: moved ? 'pan' : null, x, y, time, vx: 0, vy: 0 };
  };

  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pts.set(e.pointerId, place(e));
    try { stage.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in tests */ }
    img.classList.remove('anim');
    if (pts.size === 1) {
      pinched = false;
      startDrag(pts.get(e.pointerId).x, pts.get(e.pointerId).y, e.timeStamp);
    } else if (pts.size === 2) {
      const m = two();
      beginPinch(m.x, m.y, m.d);
    }
  });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const p = place(e);
    pts.set(e.pointerId, p);
    if (pts.size >= 2) {
      if (!pinch) return;
      const m = two();
      movePinch(m.x, m.y, m.d / pinch.d0);
      return;
    }
    if (!drag) return;
    const dt = Math.max(1, e.timeStamp - drag.time);
    drag.vx = (p.x - drag.x) / dt;
    drag.vy = (p.y - drag.y) / dt;
    drag.x = p.x;
    drag.y = p.y;
    drag.time = e.timeStamp;
    const dx = p.x - drag.x0, dy = p.y - drag.y0;
    if (!drag.mode) {
      if (Math.hypot(dx, dy) < TAP_MOVE) return;
      if (s > 1.02) drag.mode = 'pan';
      else if (Math.abs(dx) > Math.abs(dy)) drag.mode = many ? 'turn' : 'still';
      else drag.mode = dy > 0 ? 'back' : 'still';
      lastTap = null;
    }
    if (drag.mode === 'pan') {
      tx = drag.tx0 + dx;
      ty = drag.ty0 + dy;
      inBounds();
    } else if (drag.mode === 'turn') {
      tx = dx;
    } else if (drag.mode === 'back') {
      ty = dy;
      root.style.background = `rgba(0,0,0,${clamp(1 - dy / 500, 0.35, 1)})`;
    }
    paint();
  });
  const lift = (e, cancelled) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch) {
      if (pts.size < 2) {
        pinch = null;
        settle(true);
        if (pts.size === 1) { // one finger still down carries on as a pan
          const [p] = [...pts.values()];
          startDrag(p.x, p.y, e.timeStamp, true);
        }
      }
      return;
    }
    if (!drag || pts.size) return;
    const d = drag;
    drag = null;
    const dx = d.x - d.x0, dy = d.y - d.y0;
    if (cancelled) { settle(true); return; }
    if (d.mode === 'turn') {
      if (Math.abs(dx) > TURN_DRAG || Math.abs(d.vx) > FLICK) go(dx < 0 ? 1 : -1);
      else { img.classList.add('anim'); reset(); img.classList.add('anim'); }
      return;
    }
    if (d.mode === 'back') {
      if (dy > BACK_DRAG || d.vy > FLICK) { close(); return; }
      img.classList.add('anim');
      reset();
      img.classList.add('anim');
      return;
    }
    if (d.mode) { settle(true); return; }
    if (pinched) return;
    // A tap. Two close together zoom in, or back out.
    const now = e.timeStamp;
    if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(d.x0 - lastTap.x, d.y0 - lastTap.y) < DOUBLE_TAP_NEAR) {
      const to = s > 1.05 ? 1 : DOUBLE_TAP_ZOOM;
      const px = (d.x0 - W / 2 - tx) / s, py = (d.y0 - H / 2 - ty) / s;
      s = to;
      tx = d.x0 - W / 2 - s * px;
      ty = d.y0 - H / 2 - s * py;
      settle(true);
      lastTap = null;
    } else {
      lastTap = { t: now, x: d.x0, y: d.y0 };
    }
  };
  stage.addEventListener('pointerup', e => lift(e, false));
  stage.addEventListener('pointercancel', e => lift(e, true));

  // iPhones also report pinches as gesture events, which is all there is if only one pointer came through.
  let gesture = null;
  const onGesture = e => {
    e.preventDefault();
    if (pts.size >= 2) return;
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.type === 'gesturestart') {
      gesture = true;
      beginPinch(x, y, 1);
    } else if (e.type === 'gesturechange' && gesture) {
      movePinch(x, y, e.scale);
    } else if (e.type === 'gestureend' && gesture) {
      gesture = null;
      pinch = null;
      settle(true);
    }
  };
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) stage.addEventListener(t, onGesture);

  // ---------- buttons
  // A tap that opened this as the finger lifted still lands as a click, on whatever is now under it.
  if (opener) {
    root.addEventListener('click', e => {
      if (performance.now() - opener.t < 600 && Math.hypot(e.clientX - opener.x, e.clientY - opener.y) < 14) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }
  $('.viewer-x').onclick = close;
  if (many) {
    $('.viewer-prev').onclick = () => go(-1);
    $('.viewer-next').onclick = () => go(1);
  }
  if (picks) {
    $('.viewer-tick').onclick = () => {
      picks.toggle(at);
      words(at);
    };
  }

  measure();
  show(at);
  return { close };
}
