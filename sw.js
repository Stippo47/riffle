// Keeps the whole app on the phone, so it opens with no signal. Each release gets its own cache:
// change VERSION when anything here changes, and the phone moves to the new set in one step.
const VERSION = '0.7.0';
const CACHE = `riffle-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'vendor/fonts/pixelify-sans-400.woff2',
  'vendor/fonts/pixelify-sans-700.woff2',
  'js/app.js',
  'js/deck.js',
  'js/demo.js',
  'js/gesture.js',
  'js/icons.js',
  'js/island.js',
  'js/links.js',
  'js/photos.js',
  'js/push.js',
  'js/store.js',
  'js/sync.js',
  'js/thoughts.js',
  'js/ui.js',
  'js/viewer.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('riffle-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// A notification from the writer's machine. The number on the icon is the cards owed, and `url`
// says where a tap goes: the app's address with #open=pack/deck/card.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* a plain message still shows */ }
  const jobs = [self.registration.showNotification(d.title || 'Riffle', { body: d.body || '', tag: d.tag || 'riffle', icon: 'icons/icon-192.png', data: { url: d.url || '' } })];
  if (typeof d.badge === 'number' && self.navigator.setAppBadge) jobs.push(d.badge ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge());
  e.waitUntil(Promise.allSettled(jobs));
});

// A tap opens the app at what the notification was about. An app already open is told where to go.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const where = (e.notification.data && e.notification.data.url) || '';
  const url = new URL(where || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
    const open = list.find(c => 'focus' in c);
    if (!open) return self.clients.openWindow(url);
    await open.focus();
    if (where) open.postMessage({ type: 'open', url });
  }));
});

// Only the app's own files. Calls to GitHub pass straight through and never get stored here.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    if (e.request.mode === 'navigate') return (await c.match('index.html')) || fetch(e.request);
    return fetch(e.request);
  }));
});
