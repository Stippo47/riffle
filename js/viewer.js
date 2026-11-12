// A full-screen look at pictures and films: pinch to zoom, drag to pan, double tap to zoom in and out,
// and the X or a drag down to go back. It sits over everything, so its pinch can't reach the card's underneath.
//
// Films play here muted and looping. A tap pauses or plays, and the bar under them scrubs and slows them down.
// With the pen on, one finger draws and two still zoom and pan. Strokes are kept as they're drawn, so a closed
// app keeps them, and on leaving a picture the drawing over it becomes a photo on the comment it belongs to.
import { clamp, icon } from './ui.js';
import * as store from './store.js';

const MAX_ZOOM = 6;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_NEAR = 40;
const TAP_MOVE = 10;
const BACK_DRAG = 90;
const TURN_DRAG = 70;
const FLICK = 0.5;

// The pen. Colours read on most pictures; the width is on screen, whatever the zoom.
export const PEN_COLOURS = ['#ff3b30', '#ffd60a', '#0a84ff', '#ffffff'];
const PEN_WIDTH = 5;
const STROKE_SECOND_FINGER_MS = 160; // a stroke this young when a second finger lands was the start of a pinch
const INK_LONG_SIDE = 2000;
const SPEEDS = [1, 0.5, 0.25];
const SPEED_WORD = { 1: '1×', 0.5: '½×', 0.25: '¼×' };
export const inkKey = key => `ink:${key}`;

// items: { thumb, full, video, label, text, inkKey }, with each of thumb, full and video a function giving
// a url, or a promise of one. `video` makes it a film, with `full` as its poster frame.
// picks: { isOn(i), toggle(i), count() } if the pictures can be selected here.
// opener: { t, x, y } of the finger lifting, if that's what opened this.
// ink: { save(i, blob) => promise, done(i) } if drawings can be kept from here.
// bring(i, { kind, t, blob }) offers to bring what's held down on into the notes: a long press.
// start: a time to open the first film at, paused there.
const PRESS_MS = 520;
export function openViewer({ items, at = 0, picks = null, opener = null, onClose = () => {}, ink = null, bring = null, start = null }) {
  const many = items.length > 1;
  const anyFilm = items.some(it => it.video);
  const hasFoot = many || picks || ink || anyFilm || items.some(it => it.label);
  const root = document.createElement('div');
  root.className = 'viewer';
  root.innerHTML = `
    <div class="viewer-stage"><div class="viewer-media"><img alt="" draggable="false"><video muted loop playsinline preload="auto" hidden></video><svg class="viewer-ink" preserveAspectRatio="none"></svg></div></div>
    <button class="viewer-x" aria-label="Back">${icon('x')}</button>
    <div class="viewer-note" hidden></div>
    ${hasFoot ? `<div class="viewer-foot">
      <div class="viewer-words"><b></b><small></small><span></span></div>
      ${anyFilm ? `<div class="viewer-film" hidden>
        <button class="viewer-play" aria-label="Pause">${icon('pause')}</button>
        <input class="viewer-scrub" type="range" min="0" max="1000" step="1" value="0" aria-label="Where in the film">
        <button class="viewer-speed" aria-label="Speed">1×</button>
      </div>` : ''}
      <div class="viewer-row">
        ${many ? `<button class="viewer-prev" aria-label="Previous">${icon('chevron-left')}</button>` : ''}
        ${ink ? `<button class="viewer-pen" aria-label="Draw on it">${icon('pencil')}<span>Draw</span></button>` : ''}
        ${picks ? `<button class="viewer-tick">${icon('check')}<span></span></button>` : '<i class="viewer-gap"></i>'}
        ${many ? `<button class="viewer-next" aria-label="Next">${icon('chevron-left')}</button>` : ''}
      </div>
      ${ink ? `<div class="viewer-pens" hidden>
        ${PEN_COLOURS.map((c, n) => `<button class="pen-colour${n ? '' : ' on'}" data-colour="${c}" style="--pen:${c}" aria-label="Colour ${n + 1}"><i></i></button>`).join('')}
        <button class="pen-undo" aria-label="Undo the last line">${icon('undo-2')}</button>
        <button class="pen-clear" aria-label="Clear the drawing">${icon('trash-2')}</button>
        <button class="pen-done">Done</button>
      </div>` : ''}
    </div>` : ''}`;
  document.body.append(root);
  const $ = sel => root.querySelector(sel);
  const stage = $('.viewer-stage'), media = $('.viewer-media'), img = $('img'), film = $('video'), inkSvg = $('.viewer-ink'), note = $('.viewer-note');
  film.muted = true; // the attribute alone doesn't always make it start on its own

  // ---------- where the picture sits. s, tx and ty are relative to it fitting the screen.
  let W = 0, H = 0, nw = 0, nh = 0, fw = 0, fh = 0, base = 1, s = 1, tx = 0, ty = 0;
  const dpr = () => devicePixelRatio || 1;
  const measure = () => {
    W = stage.clientWidth;
    H = stage.clientHeight;
    if (!nw || !nh) return;
    const fit = Math.min(W / nw, H / nh);
    fw = nw * fit;
    fh = nh * fit;
    // The element is the picture's true size and gets scaled down to fit, so zooming shows real
    // pixels and not an enlarged copy of a smaller drawing.
    media.style.width = `${nw / dpr()}px`;
    media.style.height = `${nh / dpr()}px`;
    inkSvg.setAttribute('viewBox', `0 0 ${nw} ${nh}`);
    base = fw / (nw / dpr());
  };
  const origin = () => ({ x: (W - fw * s) / 2 + tx, y: (H - fh * s) / 2 + ty });
  const paint = () => {
    const o = origin();
    media.style.transform = `translate(${o.x}px,${o.y}px) scale(${base * s})`;
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
    media.classList.toggle('anim', animate);
    paint();
  };
  const reset = () => {
    s = 1; tx = 0; ty = 0;
    root.style.background = '';
    media.classList.remove('anim');
    paint();
  };
  // A point on the stage, in the picture's own pixels.
  const toPicture = (x, y) => {
    const o = origin(), k = base * s;
    return [((x - o.x) * dpr()) / k, ((y - o.y) * dpr()) / k];
  };

  // ---------- which picture
  let token = 0;
  const setSize = (w, h) => {
    const next = w || W;
    if (nw && next !== nw) scaleStrokes(next / nw); // the full picture came after the thumbnail
    else if (!nw && pendingScaleFrom && pendingScaleFrom !== next) scaleStrokes(next / pendingScaleFrom);
    pendingScaleFrom = 0;
    nw = next;
    nh = h || H;
    measure();
    paint();
    drawInk();
  };
  const setSrc = url => new Promise(resolve => {
    img.onload = () => {
      if (film.hidden) setSize(img.naturalWidth, img.naturalHeight);
      img.classList.add('ready');
      resolve();
    };
    img.onerror = () => resolve();
    img.src = url;
  });
  const isFilm = () => !!items[at].video;
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
    if (anyFilm) $('.viewer-film').hidden = !it.video;
  };
  const show = async i => {
    at = i;
    const mine = ++token;
    note.hidden = true;
    nw = 0;
    img.classList.remove('ready');
    img.hidden = false;
    film.hidden = true;
    film.pause();
    film.removeAttribute('src');
    root.classList.toggle('is-film', !!items[i].video);
    reset();
    words(i);
    strokes = [];
    pendingScaleFrom = 0;
    drawInk();
    loadInk(i, mine);
    const it = items[i];
    const thumb = it.thumb ? await it.thumb() : null;
    if (mine !== token) return;
    if (thumb) await setSrc(thumb);
    if (mine !== token) return;
    const full = it.full ? await it.full() : null;
    if (mine !== token) return;
    if (full && full !== thumb) await setSrc(full);
    if (mine !== token) return;
    if (it.video) {
      const url = await it.video();
      if (mine !== token) return;
      if (url) {
        film.onloadedmetadata = () => {
          if (mine !== token) return;
          setSize(film.videoWidth, film.videoHeight);
          film.hidden = false;
          img.hidden = true;
          if (start !== null && i === startAt) { film.currentTime = Math.min(start, film.duration || start); start = null; } // a moment brought to the notes
          else if (!penOn) film.play().catch(() => {});
          syncFilm();
        };
        film.src = url;
        film.load();
      } else {
        note.textContent = full || thumb ? 'The film comes when there is signal. This is a still from it.' : 'This film has not come down yet. It needs signal.';
        note.hidden = false;
      }
    } else if (!full) {
      note.textContent = thumb ? 'The full picture comes when there is signal. This is the small one.' : 'This picture has not come down yet. It needs signal.';
      note.hidden = false;
    }
    // The ones either side, so the next is ready. They're only kept, not drawn.
    const ahead = n => n && Promise.resolve(n.video ? n.video() : n.full && n.full()).catch(() => {});
    ahead(items[i + 1]);
    ahead(items[i - 1]);
  };
  const go = d => {
    const next = at + d;
    if (next < 0 || next >= items.length) { media.classList.add('anim'); reset(); return; }
    keepInk();
    show(next);
  };
  const close = () => {
    keepInk();
    token++;
    film.pause();
    removeEventListener('resize', resized);
    root.remove();
    onClose();
  };
  const resized = () => { measure(); settle(false); };
  addEventListener('resize', resized);

  // ---------- films
  let scrubbing = false;
  const syncFilm = () => {
    if (!anyFilm || !isFilm()) return;
    const playing = !film.paused;
    const btn = $('.viewer-play');
    btn.innerHTML = icon(playing ? 'pause' : 'play');
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (!scrubbing && film.duration) $('.viewer-scrub').value = String(Math.round((film.currentTime / film.duration) * 1000));
    $('.viewer-speed').textContent = SPEED_WORD[film.playbackRate] || `${film.playbackRate}×`;
  };
  const toggleFilm = () => {
    if (!isFilm() || film.hidden) return;
    if (film.paused) film.play().catch(() => {}); else film.pause();
  };
  for (const t of ['play', 'pause', 'timeupdate', 'ratechange', 'seeked']) film.addEventListener(t, syncFilm);
  if (anyFilm) {
    $('.viewer-play').onclick = toggleFilm;
    const scrub = $('.viewer-scrub');
    scrub.addEventListener('input', () => {
      scrubbing = true;
      film.pause();
      if (film.duration) film.currentTime = (scrub.value / 1000) * film.duration;
    });
    scrub.addEventListener('change', () => { scrubbing = false; syncFilm(); });
    $('.viewer-speed').onclick = () => {
      film.playbackRate = SPEEDS[(SPEEDS.indexOf(film.playbackRate) + 1) % SPEEDS.length] || 1;
      syncFilm();
    };
  }

  // ---------- the pen. Strokes are in the picture's own pixels, so zooming never moves them.
  let penOn = false, colour = PEN_COLOURS[0], strokes = [], stroke = null, inkToken = 0, pendingScaleFrom = 0;
  const pathOf = st => {
    const [first, ...rest] = st.p;
    return `M${first[0]} ${first[1]}${rest.length ? rest.map(q => `L${q[0]} ${q[1]}`).join('') : 'l0.01 0'}`;
  };
  const strokeEl = st => `<path d="${pathOf(st)}" stroke="${st.c}" stroke-width="${st.w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const drawInk = () => {
    inkSvg.innerHTML = [...strokes, ...(stroke ? [stroke] : [])].map(strokeEl).join('');
    if (ink) {
      $('.pen-undo').disabled = !strokes.length;
      $('.pen-clear').disabled = !strokes.length;
    }
  };
  const keyOf = i => items[i] && items[i].inkKey;
  function scaleStrokes(k) {
    for (const st of [...strokes, ...(stroke ? [stroke] : [])]) {
      st.w = +(st.w * k).toFixed(2);
      st.p = st.p.map(([x, y]) => [+(x * k).toFixed(1), +(y * k).toFixed(1)]);
    }
  }
  // Saved as each line ends, through the store's backup list, so a closed app keeps the drawing.
  const saveInk = () => {
    const key = keyOf(at);
    if (!ink || !key) return;
    if (strokes.length) store.set(inkKey(key), { strokes, w: nw, at: Date.now() });
    else store.del(inkKey(key));
  };
  const loadInk = async (i, mine) => {
    const key = keyOf(i);
    if (!ink || !key) return;
    const my = ++inkToken;
    const kept = await store.get(inkKey(key)).catch(() => null);
    if (mine !== token || my !== inkToken || !kept || !kept.strokes || !kept.strokes.length) return;
    strokes = kept.strokes;
    if (nw && kept.w && kept.w !== nw) scaleStrokes(nw / kept.w);
    else if (!nw) pendingScaleFrom = kept.w || 0;
    drawInk();
    note.textContent = 'Your drawing from before is still here.';
    note.hidden = false;
  };
  // The picture as it shows now, with the drawing over it, as a JPEG.
  const composite = () => {
    const source = isFilm() && !film.hidden ? film : img;
    const scale = Math.min(1, INK_LONG_SIDE / Math.max(nw, nh));
    const c = document.createElement('canvas');
    c.width = Math.round(nw * scale);
    c.height = Math.round(nh * scale);
    const g = c.getContext('2d');
    g.drawImage(source, 0, 0, c.width, c.height);
    g.scale(scale, scale);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const st of strokes) {
      g.strokeStyle = st.c;
      g.lineWidth = st.w;
      g.stroke(new Path2D(pathOf(st)));
    }
    return c;
  };
  // Turns the drawing into a photo on the comment it belongs to. Runs on leaving a picture, so nothing drawn is lost.
  let saving = Promise.resolve();
  const keepInk = () => {
    if (!ink || !strokes.length || !nw) return saving;
    const i = at, key = keyOf(i);
    let canvas;
    try { canvas = composite(); } catch { return saving; } // a picture the canvas can't read keeps its strokes for next time
    strokes = [];
    drawInk();
    saving = new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86))
      .then(blob => (blob ? ink.save(i, blob) : null))
      .then(() => { if (key) store.del(inkKey(key)); })
      .catch(() => {});
    return saving;
  };
  const setPen = on => {
    penOn = on;
    root.classList.toggle('is-drawing', on);
    if (!ink) return;
    $('.viewer-row').hidden = on;
    $('.viewer-pens').hidden = !on;
    if (on) {
      film.pause();
      lastTap = null;
      note.hidden = true;
    }
  };
  if (ink) {
    $('.viewer-pen').onclick = () => setPen(true);
    root.querySelectorAll('.pen-colour').forEach(b => {
      b.onclick = () => {
        colour = b.dataset.colour;
        root.querySelectorAll('.pen-colour').forEach(x => x.classList.toggle('on', x === b));
      };
    });
    $('.pen-undo').onclick = () => { strokes.pop(); drawInk(); saveInk(); };
    $('.pen-clear').onclick = () => { strokes = []; drawInk(); saveInk(); };
    $('.pen-done').onclick = () => {
      const i = at, drew = strokes.length > 0;
      const done = keepInk();
      close();
      if (drew) done.then(() => ink.done && ink.done(i));
    };
  }

  // ---------- fingers
  const pts = new Map();
  let drag = null, pinch = null, pinched = false, lastTap = null, tapTimer = null, idle = false, pressTimer = 0, pressed = false, pressFrom = { x: 0, y: 0 };
  // Held still for about half a second: offers to bring this, as it is now, into the notes. A drawing on it
  // goes with it, instead of onto the comment.
  const firePress = () => {
    pressed = true;
    if (stroke) { stroke = null; drawInk(); } // a finger held still with the pen on meant this, not a dot
    drag = null;
    lastTap = null;
    clearTimeout(tapTimer);
    const filmNow = isFilm() && !film.hidden;
    if (filmNow) film.pause();
    const info = filmNow ? { kind: 'film', t: film.currentTime } : { kind: 'pic' };
    const offer = blob => bring(at, blob ? { ...info, blob } : info);
    if (ink && strokes.length && nw) {
      let canvas = null;
      try { canvas = composite(); } catch { canvas = null; }
      if (canvas) {
        const key = keyOf(at);
        strokes = [];
        drawInk();
        if (key) store.del(inkKey(key));
        canvas.toBlob(offer, 'image/jpeg', 0.86);
        return;
      }
    }
    offer(null);
  };
  const place = e => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const beginPinch = (x, y, d) => {
    drag = null;
    pinched = true;
    lastTap = null;
    clearTimeout(tapTimer);
    media.classList.remove('anim');
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
  // A second finger landing on a line just begun means a pinch was meant. An older line stays.
  const endStroke = keep => {
    if (!stroke) return;
    if (keep) { strokes.push(stroke); saveInk(); }
    stroke = null;
    drawInk();
  };

  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pts.set(e.pointerId, place(e));
    try { stage.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in tests */ }
    media.classList.remove('anim');
    clearTimeout(pressTimer);
    if (pts.size === 1) {
      pinched = false;
      idle = false;
      pressed = false;
      const p = pts.get(e.pointerId);
      pressFrom = p;
      if (bring && nw) pressTimer = setTimeout(firePress, PRESS_MS);
      if (penOn && nw) {
        stroke = { c: colour, w: +((PEN_WIDTH * dpr()) / (base * s)).toFixed(2), p: [toPicture(p.x, p.y).map(v => +v.toFixed(1))], t: e.timeStamp };
        drawInk();
        return;
      }
      startDrag(p.x, p.y, e.timeStamp);
    } else if (pts.size === 2) {
      if (stroke) endStroke(e.timeStamp - stroke.t > STROKE_SECOND_FINGER_MS && stroke.p.length > 5);
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
    if (stroke) {
      if (Math.hypot(p.x - pressFrom.x, p.y - pressFrom.y) >= TAP_MOVE) clearTimeout(pressTimer);
      const q = toPicture(p.x, p.y).map(v => +v.toFixed(1));
      const last = stroke.p[stroke.p.length - 1];
      if (Math.hypot(q[0] - last[0], q[1] - last[1]) * ((base * s) / dpr()) >= 1.5) {
        stroke.p.push(q);
        drawInk();
      }
      return;
    }
    if (!drag || idle) return;
    if (Math.hypot(p.x - drag.x0, p.y - drag.y0) >= TAP_MOVE) clearTimeout(pressTimer);
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
    clearTimeout(pressTimer);
    if (pressed) { if (!pts.size) { pressed = false; drag = null; } return; }
    if (pinch) {
      if (pts.size < 2) {
        pinch = null;
        settle(true);
        if (pts.size === 1) { // one finger still down carries on as a pan, but never as a line
          const [p] = [...pts.values()];
          if (penOn) idle = true;
          else startDrag(p.x, p.y, e.timeStamp, true);
        }
      }
      return;
    }
    if (stroke) { endStroke(!cancelled); return; }
    if (!drag || pts.size) return;
    const d = drag;
    drag = null;
    const dx = d.x - d.x0, dy = d.y - d.y0;
    if (cancelled) { settle(true); return; }
    if (d.mode === 'turn') {
      if (Math.abs(dx) > TURN_DRAG || Math.abs(d.vx) > FLICK) go(dx < 0 ? 1 : -1);
      else { media.classList.add('anim'); reset(); media.classList.add('anim'); }
      return;
    }
    if (d.mode === 'back') {
      if (dy > BACK_DRAG || d.vy > FLICK) { close(); return; }
      media.classList.add('anim');
      reset();
      media.classList.add('anim');
      return;
    }
    if (d.mode) { settle(true); return; }
    if (pinched || idle) return;
    // A tap. Two close together zoom in, or back out. One alone plays or pauses a film.
    const now = e.timeStamp;
    if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(d.x0 - lastTap.x, d.y0 - lastTap.y) < DOUBLE_TAP_NEAR) {
      clearTimeout(tapTimer);
      const to = s > 1.05 ? 1 : DOUBLE_TAP_ZOOM;
      const px = (d.x0 - W / 2 - tx) / s, py = (d.y0 - H / 2 - ty) / s;
      s = to;
      tx = d.x0 - W / 2 - s * px;
      ty = d.y0 - H / 2 - s * py;
      settle(true);
      lastTap = null;
    } else {
      lastTap = { t: now, x: d.x0, y: d.y0 };
      clearTimeout(tapTimer);
      if (isFilm()) tapTimer = setTimeout(toggleFilm, DOUBLE_TAP_MS);
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
      if (stroke) endStroke(false);
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
  const startAt = at;
  show(at);
  return { close, get drawing() { return penOn; }, setPen, keepInk };
}
