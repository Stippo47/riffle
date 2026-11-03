// Keeps the whole app on the phone, so it opens with no signal. Each release gets its own cache:
// change VERSION when anything here changes, and the phone moves to the new set in one step.
const VERSION = '0.5.0';
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

// A notification from the writer's machine. The number on the icon is the cards owed.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* a plain message still shows */ }
  const jobs = [self.registration.showNotification(d.title || 'Riffle', { body: d.body || '', tag: d.tag || 'riffle', icon: 'icons/icon-192.png' })];
  if (typeof d.badge === 'number' && self.navigator.setAppBadge) jobs.push(d.badge ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge());
  e.waitUntil(Promise.allSettled(jobs));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow('./');
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
