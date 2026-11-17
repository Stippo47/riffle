// Sound clips: a button that plays one, with a bar that fills as it goes, on a card's back, in a part and
// on a board's tiles. Nothing plays by itself. Each clip is a plain <audio> element made by the tap that
// asks for it, one plays at a time, and it stops when its card or board is left or the app is hidden.
//
// An iPhone can leave a Home Screen app's sound silent after the app is reopened (WebKit bug 291892). A
// page can't hear itself, so only two signs of that can be caught: play() being refused, and the clip's
// clock standing still. Either puts "No sound played" on the button, rather than nothing at all. Sound
// that is silent while its clock runs can't be told from sound that is heard.
const STILL_MS = 1600;   // asked to play this long ago and its clock hasn't moved: it says so
const GIVE_UP_MS = 6000; // and this long ago, it stops trying. In between, a slow start can still come good
const WATCH_MS = 200;
const SAYS = {
  silent: 'No sound played',
  missing: 'This sound comes down when there is signal.',
  ready: 'Tap again to play',
};
const lengths = new Map(); // how long each clip runs, once it has been played, by its path

let now = null; // the clip going, or paused part way: { el, audio, path, late, want, at, moved, still, timer }
let asked = 0;  // counts taps, so a clip still being fetched when something else is tapped steps aside

const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const whole = long => clock(Math.max(1, Math.round(long))); // how long a clip runs, to the nearest second

// What's wrong, on the button itself: one of SAYS, or nothing.
function say(el, what) {
  for (const k of Object.keys(SAYS)) el.classList.toggle(k, k === what);
  const note = el.querySelector('.snd-note');
  if (note) { note.textContent = what ? SAYS[what] : ''; note.hidden = !what; }
}

function paint(p) {
  const a = p.audio, el = p.el;
  const long = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
  if (long) lengths.set(p.path, long);
  const going = !a.ended && (p.want || !a.paused); // asked to play counts, until the phone says otherwise
  el.classList.toggle('playing', going);
  el.classList.toggle('held', !going && a.currentTime > 0 && !a.ended);
  el.setAttribute('aria-pressed', String(going));
  el.style.setProperty('--at', long ? Math.min(1, a.currentTime / long).toFixed(3) : '0');
  const time = el.querySelector('.snd-time');
  if (time) time.textContent = long ? `${clock(a.currentTime)} / ${whole(long)}` : '';
}

// A button as it is with nothing playing: its bar empty, and how long it runs if that's known.
function rest(el, path) {
  el.classList.remove('playing', 'held', 'loading');
  el.setAttribute('aria-pressed', 'false');
  el.style.removeProperty('--at');
  const time = el.querySelector('.snd-time');
  if (time) time.textContent = lengths.has(path) ? whole(lengths.get(path)) : '';
}

// Stops whatever is playing, and lets go of its file. Safe to call with nothing playing.
export function stopSound() {
  asked++;
  const p = now;
  if (!p) return;
  now = null;
  clearInterval(p.timer);
  try { p.audio.pause(); } catch { /* it never started */ }
  try { p.audio.removeAttribute('src'); p.audio.load(); } catch { /* nothing to let go of */ }
  rest(p.el, p.path);
}

function fail(p, what = 'silent') {
  if (now !== p) return;
  stopSound();
  say(p.el, what);
}

// Looks at the clip's clock a few times a second. Told to play, and not moving: nothing is being heard,
// and the button says so. It isn't stopped yet, because sound can be slow to start, through headphones
// that were asleep for one. If the clock then moves, the words go. If it never does, the clip stops.
function watch(p) {
  if (now !== p) { clearInterval(p.timer); return; }
  if (!p.el.isConnected) { stopSound(); return; } // its card or board has gone
  const a = p.audio, t = performance.now();
  // Paused by a tap, or by the phone for a call: that's not silence. Paused without ever having started is.
  if (a.ended || (a.paused && !p.want)) { p.moved = t; return; }
  if (a.currentTime !== p.at) {
    p.at = a.currentTime;
    p.moved = t;
    if (p.still) { p.still = false; say(p.el, null); }
    paint(p);
    return;
  }
  if (t - p.moved > GIVE_UP_MS) fail(p);
  else if (t - p.moved > STILL_MS && !p.still) { p.still = true; say(p.el, 'silent'); }
}

function go(p) {
  p.want = true;
  p.at = p.audio.currentTime;
  p.moved = performance.now();
  p.el.classList.remove('held');
  p.el.classList.add('playing'); // the tap is answered at once
  let asking;
  try { asking = p.audio.play(); } catch { fail(p); return; }
  if (asking && asking.catch) {
    asking.catch(e => {
      if (now !== p || (e && e.name === 'AbortError')) return; // stopped or paused before it began
      // Fetched after its tap had ended, an iPhone won't start it. The next tap will.
      fail(p, p.late && e && e.name === 'NotAllowedError' ? 'ready' : 'silent');
    });
  }
}

function begin(el, path, src, late) {
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  const p = { el, audio, path, late, want: false, at: 0, moved: 0, still: false, timer: 0 };
  now = p;
  audio.addEventListener('pause', () => { p.want = false; }); // by a tap, by the phone, or at its end
  for (const t of ['playing', 'pause', 'timeupdate', 'durationchange']) audio.addEventListener(t, () => { if (now === p) paint(p); });
  audio.addEventListener('ended', () => { if (now === p) stopSound(); });
  audio.addEventListener('error', () => fail(p));
  audio.src = src;
  p.timer = setInterval(() => watch(p), WATCH_MS);
  go(p);
}

// A tap on a sound's button: plays it, pauses it, or carries on from where it was paused. Anything else
// playing stops first, and one that's saying no sound played is tried again from the start. The button
// holds its clip's path in data-path, and its address on this phone in data-src once that's known;
// `fetchUrl` brings the address when it isn't.
export function toggleSound(el, fetchUrl) {
  if (now && now.el === el && !now.still) {
    if (now.audio.paused) go(now);
    else { now.want = false; now.audio.pause(); paint(now); }
    return;
  }
  stopSound();
  say(el, null);
  const path = el.dataset.path || '';
  if (el.dataset.src) { begin(el, path, el.dataset.src, false); return; }
  const mine = asked;
  el.classList.add('loading');
  Promise.resolve().then(fetchUrl).catch(() => null).then(url => {
    el.classList.remove('loading');
    if (url) el.dataset.src = url;
    if (mine !== asked || !el.isConnected) return;
    if (!url) { say(el, 'missing'); return; }
    begin(el, path, url, true);
  });
}

// Brings the addresses of the sounds under `root` that have none yet, so a tap can start one at once:
// an iPhone only starts sound during the tap itself, and a fetch would outlast it.
export function readySounds(root, urlOf) {
  if (!root) return;
  for (const el of root.querySelectorAll('.snd:not([data-src])')) {
    Promise.resolve().then(() => urlOf(el)).then(url => { if (url && !el.dataset.src) el.dataset.src = url; }).catch(() => {});
  }
}

// The clip going or paused now, if there is one: its button and its <audio>.
export const soundNow = () => (now ? { el: now.el, audio: now.audio } : null);

// Sound never carries on from an app that's been put away.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopSound(); });
