// A full-screen look at pictures and films: pinch to zoom, drag to pan, double tap to zoom in and out,
// and the X or a drag down to go back. It sits over everything, so its pinch can't reach the card's underneath.
//
// Films play here muted and looping. A tap pauses or plays, and the bar under them scrubs and slows them down.
// A second row steps through one frame by frame. With the pen on, one finger draws and two still zoom and pan.
// Strokes are kept as they're drawn, so a closed app keeps them, and on leaving a picture the drawing over it
// becomes a photo on the comment it belongs to.
//
// A pin is "this spot here": a point on a picture, or on one frame of a film, with a few words. With Pin on,
// a tap drops one, and one finger still moves around a zoomed picture, so a spot can be zoomed into first.
import { clamp, dragToClose, esc, icon, padBlur, padFocus, padHTML, padReady, padSet, tick } from './ui.js';
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
// Frame by frame. A film's frame rate comes with it if the deck says it, or is measured here while it plays;
// until either is known, a step is this long.
const STEP_UNKNOWN = 1 / 30;
const JOG_PX = 14;                 // how far a thumb slides along the fine strip for one frame
const STEP_HOLD_MS = 380;          // a step button held this long starts repeating
const STEP_REPEAT_MS = 110;
const RATES = [10, 12, 15, 20, 24, 25, 30, 48, 50, 60]; // a measured rate within a few percent of one of these is that one
const RATE_GAPS = 8;               // how many frames a measurement watches go by
const filmRate = new Map();        // rates measured here, per film, while the app is open
// Pins.
const PIN_NEAR = 26;               // how near a pin a tap must land to mean that pin, on screen
const PIN_MAGNET = 7;              // and how near one's mark the film's bar snaps to its moment
const PIN_REMOVE_MS = 3000;        // how long "Tap again to remove" waits for the second tap
const stamp = t => `${Math.floor((t || 0) / 60)}:${((t || 0) % 60).toFixed(2).padStart(5, '0')}`;
export const inkKey = key => `ink:${key}`;
// Where each film was left, its moment, speed and whether it was playing, so coming back to one carries on
// from there: the next and back again on a board, or closing it and opening it again. Kept while the app is open.
const filmLeft = new Map();

// items: { thumb, full, video, label, text, inkKey, fps }, with each of thumb, full and video a function giving
// a url, or a promise of one. `video` makes it a film, with `full` as its poster frame, and `fps` its frame
// rate if the deck says it.
// picks: { isOn(i), toggle(i), count() } if the pictures can be selected here.
// opener: { t, x, y } of the finger lifting, if that's what opened this.
// ink: { save(i, blob) => promise, done(i) } if drawings can be kept from here.
// bring(i, { kind, t, blob }) offers to bring what's held down on into the notes: a long press.
// start: a time to open the first film at, paused there.
// comments: { text(i), typed(i, text), done(i) } if each one can have a comment of its own, as a board's items.
// pins: { list(i), add(i, spot), move(i, id, spot), typed(i, id, text), remove(i, id), done(i) } if spots can be
// pinned from here. A pin is { id, n, x, y, note }, with x and y a share of the width and height, and on a
// film also t, the middle of the frame it's on.
const PRESS_MS = 520;
export function openViewer({ items, at = 0, picks = null, opener = null, onClose = () => {}, ink = null, bring = null, start = null, comments = null, pins = null }) {
  const many = items.length > 1;
  const anyFilm = items.some(it => it.video);
  const hasFoot = many || picks || ink || comments || pins || anyFilm || items.some(it => it.label);
  const root = document.createElement('div');
  root.className = 'viewer';
  root.innerHTML = `
    <div class="viewer-stage"><div class="viewer-media"><img alt="" draggable="false"><video muted loop playsinline preload="auto" hidden></video><svg class="viewer-ink" preserveAspectRatio="none"></svg></div><div class="viewer-pins"></div></div>
    <button class="viewer-x" aria-label="Back">${icon('x')}</button>
    <div class="viewer-note" hidden></div>
    ${hasFoot ? `<div class="viewer-foot">
      <div class="viewer-words"><b></b><small></small><span></span></div>
      ${anyFilm ? `<div class="viewer-film" hidden>
        <button class="viewer-play" aria-label="Pause">${icon('pause')}</button>
        <div class="viewer-scrub" role="slider" tabindex="0" aria-label="Where in the film" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i class="vs-rail"><i class="vs-fill"></i></i><i class="vs-pins"></i><i class="vs-knob"></i></div>
        <button class="viewer-speed" aria-label="Speed">1×</button>
      </div>
      <div class="viewer-fine" hidden>
        <button class="viewer-step" data-step="-1" aria-label="Back one frame">${icon('frame-back')}</button>
        <div class="viewer-jog" aria-label="Slide for frame by frame"><i class="vj-ticks"></i><span class="vj-words"></span></div>
        <button class="viewer-step" data-step="1" aria-label="On one frame">${icon('frame-forward')}</button>
      </div>` : ''}
      <div class="viewer-row${picks && pins ? ' tight' : ''}">
        ${many ? `<button class="viewer-prev" aria-label="Previous">${icon('chevron-left')}</button>` : ''}
        ${ink ? `<button class="viewer-pen" aria-label="Draw on it">${icon('pencil')}<span>Draw</span></button>` : ''}
        ${pins ? `<button class="viewer-pin" aria-label="Pin a spot">${icon('pin')}<span>Pin</span><b hidden></b></button>` : ''}
        ${comments ? `<button class="viewer-say" aria-label="Comment on this one">${icon('message-square-text')}</button>` : ''}
        ${picks ? `<button class="viewer-tick">${icon('check')}<span></span></button>` : '<i class="viewer-gap"></i>'}
        ${many ? `<button class="viewer-next" aria-label="Next">${icon('chevron-left')}</button>` : ''}
      </div>
      ${ink ? `<div class="viewer-pens" hidden>
        ${PEN_COLOURS.map((c, n) => `<button class="pen-colour${n ? '' : ' on'}" data-colour="${c}" style="--pen:${c}" aria-label="Colour ${n + 1}"><i></i></button>`).join('')}
        <button class="pen-undo" aria-label="Undo the last line">${icon('undo-2')}</button>
        <button class="pen-clear" aria-label="Clear the drawing">${icon('trash-2')}</button>
        <button class="pen-done">Done</button>
      </div>` : ''}
      ${pins ? `<div class="viewer-pinrow" hidden>
        <div class="viewer-pinchips"></div>
        <button class="pin-done">Done</button>
      </div>
      <div class="viewer-pinner" hidden>
        ${padHTML('viewerpin', 'A few words on this spot. Drag down to close.')}
        <div class="pinner-row">
          <button class="pin-remove">${icon('trash-2')}<span>Remove</span></button>
          <small>Tap the picture to move it</small>
          <button class="pin-close">Done</button>
        </div>
      </div>` : ''}
      ${comments ? `<div class="viewer-sayer" hidden>
        ${padHTML('viewersay', 'Your comment on this one. Drag down to close.')}
        <button class="say-done">Done</button>
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
  let drawPins = () => {}; // set further down, where the pins are
  const paint = () => {
    const o = origin();
    media.style.transform = `translate(${o.x}px,${o.y}px) scale(${base * s})`;
    drawPins();
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
    const parts = [many ? `${i + 1} of ${items.length}` : '', picks && picks.count() ? `${picks.count()} picked` : ''];
    $('.viewer-words span').textContent = parts.filter(Boolean).join(' · ');
    if (picks) {
      const on = picks.isOn(i);
      $('.viewer-tick').classList.toggle('on', on);
      $('.viewer-tick span').textContent = on ? 'Picked' : 'Pick';
    }
    if (many) {
      $('.viewer-prev').disabled = i === 0;
      $('.viewer-next').disabled = i === items.length - 1;
    }
    if (anyFilm) { $('.viewer-film').hidden = !it.video; $('.viewer-fine').hidden = !it.video; }
    if (comments) $('.viewer-say').classList.toggle('has', !!(comments.text(i) || '').trim());
  };
  // Notes where the film showing now was, before it goes.
  const leaveFilm = () => {
    const it = items[at], key = it && (it.filmKey || it.inkKey);
    if (!key || !it.video || film.hidden || !film.duration) return;
    filmLeft.set(key, { t: film.currentTime, rate: film.playbackRate, paused: film.paused });
  };
  const show = async i => {
    if (saying) closeSay();
    if (noting) closeNote();
    leaveFilm();
    at = i;
    const mine = ++token;
    seekTo = null;
    lastShown = null;
    gaps = [];
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
    syncPins();
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
          const left = filmLeft.get(it.filmKey || it.inkKey);
          if (start !== null && i === startAt) { film.currentTime = Math.min(start, film.duration || start); start = null; } // a moment brought to the notes
          else if (left) { // back where it was left
            film.currentTime = Math.min(left.t, film.duration || left.t);
            film.playbackRate = left.rate || 1;
            if (!left.paused && !penOn) film.play().catch(() => {});
          } else if (!penOn) film.play().catch(() => {});
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
    if (saying) closeSay();
    if (noting) closeNote();
    leaveFilm();
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
  let scrubbing = false, seekTo = null, lastShown = null, gaps = [];
  const showAt = f => {
    const scrub = $('.viewer-scrub');
    scrub.style.setProperty('--at', String(f));
    scrub.setAttribute('aria-valuenow', String(Math.round(f * 100)));
  };
  // One seek a frame of the screen, so a phone keeps up with a finger. The last one asked for wins. A seek to
  // where the film already is gets left out: on its last frame, a looping film takes one as reaching its end
  // and starts over.
  const seekSoon = t => {
    if (seekTo === null) {
      const mine = token;
      requestAnimationFrame(() => {
        if (mine === token && seekTo !== null && film.duration && Math.abs(film.currentTime - seekTo) > 0.0005) film.currentTime = seekTo;
        seekTo = null;
        syncFilm();
      });
    }
    seekTo = t;
  };
  const nowT = () => (seekTo !== null ? seekTo : film.currentTime || 0);
  // Frames, counted from 0 here. A paused film always rests on the middle of one, so which frame is on screen
  // is never in doubt, here or for whoever reads a pin's time.
  const rateKey = () => { const it = items[at]; return it && (it.filmKey || it.inkKey); };
  const fps = () => { const it = items[at]; return (it && +it.fps) || filmRate.get(rateKey()) || 0; };
  const frames = () => (fps() && film.duration ? Math.max(1, Math.round(film.duration * fps())) : 0);
  const frameAt = t => clamp(Math.floor(t * fps() + 0.01), 0, Math.max(0, frames() - 1));
  const timeOf = n => (n + 0.5) / fps();
  const filmUp = () => isFilm() && !film.hidden && !!film.duration;
  const rest = () => { if (filmUp() && fps() && film.paused && !scrubbing) seekSoon(timeOf(frameAt(nowT()))); };
  const step = d => {
    if (!filmUp()) return;
    film.pause();
    if (fps()) seekSoon(timeOf(clamp(frameAt(nowT()) + d, 0, frames() - 1)));
    else seekSoon(clamp(nowT() + d * STEP_UNKNOWN, 0, film.duration));
    syncFilm();
  };
  const syncFilm = () => {
    if (!anyFilm || !isFilm()) return;
    const playing = !film.paused;
    const btn = $('.viewer-play');
    btn.innerHTML = icon(playing ? 'pause' : 'play');
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (!scrubbing && film.duration) showAt(nowT() / film.duration);
    $('.viewer-speed').textContent = SPEED_WORD[film.playbackRate] || `${film.playbackRate}×`;
    $('.vj-words').textContent = fps() && film.duration ? `Frame ${frameAt(nowT()) + 1} of ${frames()} · ${stamp(nowT())}` : stamp(nowT());
    drawPins();
  };
  const toggleFilm = () => {
    if (!isFilm() || film.hidden) return;
    if (film.paused) film.play().catch(() => {}); else film.pause();
  };
  for (const t of ['play', 'pause', 'timeupdate', 'ratechange', 'seeked', 'durationchange']) film.addEventListener(t, syncFilm);
  film.addEventListener('pause', rest);
  film.addEventListener('loadedmetadata', () => syncPins()); // their marks along the bar need the film's length
  if (anyFilm) {
    $('.viewer-play').onclick = toggleFilm;
    // The frame rate, if the deck didn't say: the shortest gap between frames as the film plays is one frame.
    if (film.requestVideoFrameCallback) {
      const onFrame = (now, meta) => {
        if (!root.isConnected) return;
        film.requestVideoFrameCallback(onFrame);
        if (!isFilm() || fps() || film.paused || film.seeking) { lastShown = null; return; }
        const gap = lastShown === null ? 0 : meta.mediaTime - lastShown;
        lastShown = meta.mediaTime;
        if (gap > 0.004 && gap < 0.25) gaps.push(gap);
        if (gaps.length < RATE_GAPS) return;
        const raw = 1 / Math.min(...gaps);
        filmRate.set(rateKey(), RATES.find(r => Math.abs(r - raw) / r < 0.04) || +raw.toFixed(2));
        syncFilm();
        syncPins();
      };
      film.requestVideoFrameCallback(onFrame);
    }
    // The whole bar takes the finger, not just the knob: a touch anywhere on it jumps there, and the
    // film follows the finger from then on, wherever it goes. One seek a frame, so a phone keeps up.
    // Near a pin's mark it goes to that pin's moment.
    const scrub = $('.viewer-scrub');
    let held = null;
    const fracAt = x => {
      const r = scrub.getBoundingClientRect(), edge = 14; // the knob's middle reaches the ends
      const f = clamp((x - r.left - edge) / Math.max(1, r.width - edge * 2), 0, 1);
      if (!film.duration) return f;
      const near = pinList().map(q => q.t / film.duration).find(q => Math.abs(q - f) * (r.width - edge * 2) < PIN_MAGNET);
      return near === undefined ? f : near;
    };
    const seek = f => {
      showAt(f);
      if (!film.duration) return;
      const t = f * film.duration;
      seekSoon(fps() ? timeOf(frameAt(t)) : t);
      syncFilm();
    };
    scrub.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      held = e.pointerId;
      try { scrub.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in tests */ }
      scrubbing = true;
      film.pause();
      scrub.classList.add('held');
      seek(fracAt(e.clientX));
    });
    scrub.addEventListener('pointermove', e => { if (e.pointerId === held) seek(fracAt(e.clientX)); });
    const letGo = e => {
      if (e.pointerId !== held) return;
      held = null;
      scrubbing = false;
      scrub.classList.remove('held');
      syncFilm();
    };
    scrub.addEventListener('pointerup', letGo);
    scrub.addEventListener('pointercancel', letGo);
    scrub.addEventListener('keydown', e => {
      const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!d || !film.duration) return;
      e.preventDefault();
      film.pause();
      film.currentTime = clamp(film.currentTime + d * Math.max(0.1, film.duration / 50), 0, film.duration);
    });
    $('.viewer-speed').onclick = () => {
      film.playbackRate = SPEEDS[(SPEEDS.indexOf(film.playbackRate) + 1) % SPEEDS.length] || 1;
      syncFilm();
    };
    // Frame by frame: a button either side steps one, and repeats while it's held. Between them a strip to
    // slide a thumb along, one frame for every few pixels however long the film is, so it's slow and exact.
    root.querySelectorAll('.viewer-step').forEach(b => {
      const d = +b.dataset.step;
      let timer = 0;
      const stop = () => { clearTimeout(timer); timer = 0; };
      b.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        stop();
        step(d);
        tick();
        const again = () => { step(d); timer = setTimeout(again, STEP_REPEAT_MS); };
        timer = setTimeout(again, STEP_HOLD_MS);
      });
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, stop);
    });
    const jog = $('.viewer-jog');
    let slid = null;
    jog.addEventListener('pointerdown', e => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || !filmUp()) return;
      e.preventDefault();
      try { jog.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in tests */ }
      film.pause();
      slid = { id: e.pointerId, x: e.clientX, from: nowT(), by: 0 };
      jog.classList.add('held');
    });
    jog.addEventListener('pointermove', e => {
      if (!slid || e.pointerId !== slid.id) return;
      const dx = e.clientX - slid.x, by = Math.trunc(dx / JOG_PX);
      jog.style.setProperty('--slid', `${dx % JOG_PX}px`);
      if (by === slid.by) return;
      slid.by = by;
      if (fps()) seekSoon(timeOf(clamp(frameAt(slid.from) + by, 0, frames() - 1)));
      else seekSoon(clamp(slid.from + by * STEP_UNKNOWN, 0, film.duration));
      tick();
      syncFilm();
    });
    const slideEnd = e => {
      if (!slid || e.pointerId !== slid.id) return;
      slid = null;
      jog.classList.remove('held');
      jog.style.removeProperty('--slid');
    };
    jog.addEventListener('pointerup', slideEnd);
    jog.addEventListener('pointercancel', slideEnd);
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

  // ---------- a comment on this one: a box under it, with the keyboard. Its words are kept as they're typed,
  // and go when it closes: Done, a drag down on it, the next one, or leaving.
  let saying = false;
  const sayPad = comments ? $('#viewersay') : null;
  function closeSay() {
    if (!saying) return;
    saying = false;
    padBlur(sayPad);
    $('.viewer-sayer').hidden = true;
    $('.viewer-row').hidden = false;
    root.classList.remove('is-saying');
    comments.done(at);
    words(at);
  }
  if (comments) {
    padReady(sayPad, text => { if (saying) { comments.typed(at, text); words(at); } });
    $('.viewer-say').onclick = () => {
      saying = true;
      film.pause();
      padSet(sayPad, comments.text(at) || '');
      $('.viewer-row').hidden = true;
      $('.viewer-sayer').hidden = false;
      root.classList.add('is-saying');
      padFocus(sayPad);
    };
    $('.say-done').onclick = closeSay;
    dragToClose($('.viewer-sayer'), () => sayPad, dy => { $('.viewer-sayer').style.transform = dy > 0 ? `translateY(${dy * 0.8}px)` : ''; }, closeSay);
  }
  // ---------- pins: this spot here. A point on the picture, as a share of its width and height, with a few
  // words. On a film it belongs to the frame it was dropped on, and shows only while the film rests there.
  let pinOn = false, noting = null, pinDrag = null, removeArmed = 0;
  const pinPad = pins ? $('#viewerpin') : null;
  const pinEls = new Map();
  const pinList = () => (pins ? pins.list(at) || [] : []);
  const pinShows = q => !isFilm() || (filmUp() && film.paused && (fps() ? frameAt(q.t) === frameAt(nowT()) : Math.abs(q.t - nowT()) < 0.02));
  const spotOf = q => (pinDrag && pinDrag.id === q.id && pinDrag.spot) || q;
  const onStage = q => { const o = origin(), at = spotOf(q); return { x: o.x + at.x * fw * s, y: o.y + at.y * fh * s }; };
  // Pins sit over the picture, the same size on screen at any zoom, and move with it.
  if (pins) {
    drawPins = () => {
      const seen = new Set();
      for (const q of nw ? pinList().filter(pinShows) : []) {
        let el = pinEls.get(q.id);
        if (!el) {
          el = document.createElement('i');
          el.className = 'vpin';
          el.innerHTML = '<b></b>';
          $('.viewer-pins').append(el);
          pinEls.set(q.id, el);
        }
        const at = onStage(q);
        el.firstChild.textContent = q.n;
        el.classList.toggle('on', noting === q.id);
        el.style.transform = `translate(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px)`;
        seen.add(q.id);
      }
      for (const [id, el] of pinEls) if (!seen.has(id)) { el.remove(); pinEls.delete(id); }
      $('.viewer-pins').classList.toggle('anim', media.classList.contains('anim'));
    };
  }
  // The pin nearest a point on the stage, if one is near enough to be meant.
  const pinAt = (x, y) => {
    let best = null, near = PIN_NEAR;
    for (const q of nw ? pinList().filter(pinShows) : []) {
      const at = onStage(q), d = Math.hypot(at.x - x, at.y - y);
      if (d < near) { near = d; best = q; }
    }
    return best;
  };
  // The row of pins on this picture, the count on the Pin button, and their marks along the film's bar.
  function syncPins() {
    if (!pins) return;
    const list = pinList();
    const count = $('.viewer-pin b');
    count.hidden = !list.length;
    count.textContent = list.length;
    const hint = isFilm() ? 'Tap the spot, on the frame it shows on' : 'Tap the spot';
    $('.viewer-pinchips').innerHTML = list.map(q => `<button class="pinchip${noting === q.id ? ' on' : ''}" data-pin="${esc(q.id)}"><b>${q.n}</b><span>${esc((q.note || '').trim() || (isFilm() ? stamp(q.t) : 'No words yet'))}</span></button>`).join('') || `<span class="pinhint">${hint}</span>`;
    if (anyFilm) $('.vs-pins').innerHTML = isFilm() && film.duration ? list.map(q => `<i style="left:${((q.t / film.duration) * 100).toFixed(2)}%"></i>`).join('') : '';
    drawPins();
  }
  const setPin = on => {
    if (!pins) return;
    if (!on && noting) closeNote();
    pinOn = on;
    root.classList.toggle('is-pinning', on);
    $('.viewer-row').hidden = on;
    $('.viewer-pinrow').hidden = !on;
    if (on) {
      film.pause();
      lastTap = null;
      clearTimeout(tapTimer);
      note.hidden = true;
    }
    syncPins();
  };
  // A pin's words: a box under the picture. They're kept as they're typed, and go when it closes.
  const openNote = (q, typing = true) => {
    if (!q) return;
    if (noting && noting !== q.id) closeNote();
    if (!pinOn) setPin(true);
    noting = q.id;
    disarmRemove();
    padSet(pinPad, q.note || '');
    $('.viewer-pinrow').hidden = true;
    $('.viewer-pinner').hidden = false;
    root.classList.add('is-noting');
    if (typing) padFocus(pinPad);
    syncPins();
  };
  function closeNote() {
    if (!noting) return;
    noting = null;
    padBlur(pinPad);
    $('.viewer-pinner').hidden = true;
    $('.viewer-pinrow').hidden = !pinOn;
    root.classList.remove('is-noting');
    pins.done(at);
    syncPins();
  }
  function disarmRemove() {
    clearTimeout(removeArmed);
    removeArmed = 0;
    if (pins) $('.pin-remove span').textContent = 'Remove';
  }
  // Goes to a pin: its frame, on a film, with its words showing.
  const goPin = q => {
    if (!q) return;
    if (isFilm() && filmUp()) { film.pause(); seekTo = null; film.currentTime = q.t; }
    openNote(q, false);
  };
  // A tap with Pin on. With a pin's words open it moves that pin here; otherwise it drops a new one, on a
  // film at the frame showing, which the film stops on if it was playing.
  const tapSpot = (x, y) => {
    if (!nw) return;
    const [px, py] = toPicture(x, y);
    if (px < 0 || py < 0 || px > nw || py > nh) return;
    const spot = { x: +(px / nw).toFixed(4), y: +(py / nh).toFixed(4) };
    if (noting) { pins.move(at, noting, spot); tick(); syncPins(); return; }
    let when = {};
    if (isFilm()) {
      if (!filmUp()) return; // only its still so far: there's no frame to point at
      film.pause();
      if (fps()) {
        const n = frameAt(nowT()), t = timeOf(n);
        seekTo = null;
        film.currentTime = t;
        when = { t: +t.toFixed(4), frame: n + 1, fps: fps(), frames: frames() };
      } else when = { t: +nowT().toFixed(3) };
    }
    const made = pins.add(at, { ...spot, ...when, w: nw, h: nh });
    tick();
    openNote(made);
  };
  if (pins) {
    $('.viewer-pin').onclick = () => setPin(true);
    $('.pin-done').onclick = () => setPin(false);
    $('.pin-close').onclick = closeNote;
    $('.viewer-pinchips').onclick = e => {
      const chip = e.target.closest('.pinchip');
      if (chip) goPin(pinList().find(q => q.id === chip.dataset.pin));
    };
    // One with words takes a second tap to remove, so a slip can't lose them.
    $('.pin-remove').onclick = () => {
      const id = noting, q = pinList().find(x => x.id === id);
      if (!q) return;
      if ((q.note || '').trim() && !removeArmed) {
        $('.pin-remove span').textContent = 'Tap again to remove';
        removeArmed = setTimeout(disarmRemove, PIN_REMOVE_MS);
        return;
      }
      disarmRemove();
      closeNote();
      pins.remove(at, id);
      pins.done(at);
      tick();
      syncPins();
    };
    padReady(pinPad, text => { if (noting) pins.typed(at, noting, text); });
    dragToClose($('.viewer-pinner'), () => pinPad, dy => { $('.viewer-pinner').style.transform = dy > 0 ? `translateY(${dy * 0.8}px)` : ''; }, closeNote);
  }
  // The keyboard makes the screen shorter, so the picture fits again in what's left.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (root.isConnected) resized(); }).observe(stage);

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
      pinDrag = null;
      if (pinOn && nw) { // a finger landing on a pin picks it up, to move it or, with no move, to open it
        const hit = pinAt(p.x, p.y);
        if (hit) { pinDrag = { id: hit.id, moved: false, spot: null }; return; }
      }
      if (bring && nw && !pinOn) pressTimer = setTimeout(firePress, PRESS_MS);
      if (penOn && nw) {
        stroke = { c: colour, w: +((PEN_WIDTH * dpr()) / (base * s)).toFixed(2), p: [toPicture(p.x, p.y).map(v => +v.toFixed(1))], t: e.timeStamp };
        drawInk();
        return;
      }
      startDrag(p.x, p.y, e.timeStamp);
    } else if (pts.size === 2) {
      if (stroke) endStroke(e.timeStamp - stroke.t > STROKE_SECOND_FINGER_MS && stroke.p.length > 5);
      if (pinDrag) { pinDrag = null; drawPins(); } // a pinch was meant: the pin stays where it was
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
    if (pinDrag) {
      if (!pinDrag.moved && Math.hypot(p.x - pressFrom.x, p.y - pressFrom.y) < TAP_MOVE) return;
      pinDrag.moved = true;
      const [px, py] = toPicture(p.x, p.y);
      pinDrag.spot = { x: +clamp(px / nw, 0, 1).toFixed(4), y: +clamp(py / nh, 0, 1).toFixed(4) };
      drawPins();
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
      else if (pinOn) drag.mode = 'still'; // with Pin on, a slipped tap never leaves the picture or turns to the next
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
    if (pinDrag) {
      const d = pinDrag;
      pinDrag = null;
      if (d.moved && d.spot && !cancelled) { pins.move(at, d.id, d.spot); pins.done(at); tick(); syncPins(); }
      else if (!cancelled) openNote(pinList().find(q => q.id === d.id), false);
      else drawPins();
      return;
    }
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
    // A tap. With Pin on it drops a pin, or moves the one whose words are open. On a pin it opens that pin.
    if (pinOn) { tapSpot(d.x0, d.y0); return; }
    const onPin = pins && pinAt(d.x0, d.y0);
    if (onPin) { lastTap = null; clearTimeout(tapTimer); openNote(onPin, false); return; }
    // Otherwise two close together zoom in, or back out. One alone plays or pauses a film.
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
  // With Pin on, a tap opens a box to type in during the finger's lift. The mouse press a browser makes up
  // after a touch would land on the picture and take the box's focus, and the keyboard with it.
  stage.addEventListener('touchend', e => { if (pinOn && e.cancelable) e.preventDefault(); }, { passive: false });

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
  return { close, get drawing() { return penOn; }, get pinning() { return pinOn; }, setPen, setPin, keepInk };
}
